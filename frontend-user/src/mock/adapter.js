/**
 * Mock 适配器
 *
 * 与真实后端同构的路由层：输入 { method, path, params, body }，
 * 输出 { status, body }（body 为标准业务包 { success, data?, message? }）。
 *
 * 写操作成功后在此处统一写入任务中心（taskStore），页面不再直接操作存储，
 * 从而让「模拟模式」与「真实模式」对调用方完全一致。
 */

import { logger } from '../utils/logger'
import { taskStore } from '../utils/taskStore'
import {
  mockUser,
  mockTables,
  mockCourses,
  mockCompetitions,
  mockProducts,
  mockBookings,
  generateOrderNo
} from './data'

/**
 * 业务成功包
 */
function ok(data) {
  return { status: 200, body: { success: true, data } }
}

/**
 * 业务失败包（默认不触发传输层重试）
 */
function fail(message, code = 'BUSINESS_ERROR', status = 200) {
  return { status, body: { success: false, error: message, code, message } }
}

/**
 * 安全解析 JSON 请求体
 */
function parseBody(ctx) {
  if (!ctx.body) return {}
  if (typeof ctx.body === 'object') return ctx.body
  try {
    return JSON.parse(ctx.body)
  } catch (e) {
    throw new ApiBusinessError('请求参数格式错误', 'INVALID_REQUEST_BODY')
  }
}

/**
 * 业务异常，由 http 层统一转成失败响应包
 */
export class ApiBusinessError extends Error {
  constructor(message, code = 'BUSINESS_ERROR') {
    super(message)
    this.name = 'ApiBusinessError'
    this.code = code
  }
}

/**
 * 根据日期生成稳定但随机的可用状态
 * - 无日期或当天：返回基准数据（固定的 2/5 号球桌占用，与初始页面一致）
 * - 其他日期：同一日期返回一致结果，约 70% 可预约（与改造前切日期行为一致）
 */
function tablesForDate(date) {
  const today = new Date().toISOString().split('T')[0]
  if (!date || date === today) return mockTables

  let seed = 0
  const str = date || ''
  for (let i = 0; i < str.length; i++) seed = (seed * 31 + str.charCodeAt(i)) >>> 0
  return mockTables.map((table) => {
    const v = ((seed + table.id * 97) % 100) / 100
    return { ...table, available: v > 0.3 }
  })
}

// ==================== 路由处理器 ====================

/**
 * POST /auth/login
 */
function handleLogin(ctx) {
  const { username, password } = parseBody(ctx)
  if (username === 'user' && password === '123456') {
    const token = 'mock_token_' + Date.now()
    logger.info('Mock login successful', { username })
    return ok({ token, user: mockUser })
  }
  logger.warn('Mock login failed', { username })
  return fail('用户名或密码错误', 'AUTH_FAILED', 401)
}

/**
 * POST /auth/logout
 */
function handleLogout() {
  logger.info('Mock logout')
  return ok({ message: '退出成功' })
}

/**
 * GET /tables
 */
function handleGetTables(ctx) {
  let tables = tablesForDate(ctx.params?.date)
  if (ctx.params?.type && ctx.params.type !== 'all') {
    tables = tables.filter((t) => t.typeId === ctx.params.type)
  }
  return ok(tables)
}

/**
 * GET /courses / POST /courses/enroll
 */
function handleGetCourses() {
  return ok(mockCourses)
}

function handleEnrollCourse(ctx) {
  const data = parseBody(ctx)
  const course = mockCourses.find((c) => c.id === Number(data.courseId))
  if (!course) return fail('课程不存在', 'COURSE_NOT_FOUND', 404)

  const expireDate = new Date()
  expireDate.setMonth(expireDate.getMonth() + 6)
  const orderNo = generateOrderNo('CR')

  const result = {
    orderNo,
    courseId: course.id,
    courseName: course.name,
    courseIcon: course.icon,
    coach: course.coach,
    lessons: course.lessons,
    price: course.price,
    expireDate: expireDate.toISOString().split('T')[0],
    createTime: new Date().toLocaleString(),
    progress: 0,
    status: 'upcoming'
  }

  taskStore.addCourseTask(course, { orderNo })
  return ok(result)
}

/**
 * GET /competitions / POST /competitions/join
 */
function handleGetCompetitions(ctx) {
  let list = mockCompetitions
  if (ctx.params?.status) {
    list = list.filter((c) => c.status === ctx.params.status)
  }
  return ok(list)
}

function handleJoinCompetition(ctx) {
  const data = parseBody(ctx)
  const competition = mockCompetitions.find((c) => c.id === Number(data.competitionId))
  if (!competition) return fail('赛事不存在', 'COMPETITION_NOT_FOUND', 404)
  if (competition.status !== 'upcoming') return fail('该赛事当前不可报名', 'COMPETITION_NOT_JOINABLE')
  if (competition.participants >= competition.maxParticipants) {
    return fail('报名人数已满', 'COMPETITION_FULL')
  }

  const regNo = generateOrderNo('REG')
  const playerNo = Math.floor(Math.random() * 100) + 1
  const result = {
    regNo,
    competitionId: competition.id,
    compName: competition.name,
    playerNo,
    status: competition.status
  }

  competition.participants = Math.min(competition.participants + 1, competition.maxParticipants)
  taskStore.addCompetitionTask(competition, { regNo, playerNo })
  return ok(result)
}

/**
 * GET /products / POST /orders
 */
function handleGetProducts(ctx) {
  let list = [...mockProducts]
  if (ctx.params?.category && ctx.params.category !== 'all') {
    list = list.filter((p) => p.category === ctx.params.category)
  }
  const sort = ctx.params?.sort
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
  return ok(list)
}

function handleCreateOrder(ctx) {
  const data = parseBody(ctx)
  const rawItems = Array.isArray(data.items) ? data.items : []

  const items = rawItems
    .map((raw) => {
      const product = mockProducts.find((p) => p.id === Number(raw.productId ?? raw.id))
      if (!product) return null
      const qty = Number(raw.quantity ?? raw.qty ?? 1)
      return {
        id: product.id,
        name: product.name,
        icon: product.icon,
        brand: product.brand,
        price: product.price,
        qty: qty > 0 ? qty : 1
      }
    })
    .filter(Boolean)

  if (items.length === 0) return fail('订单中没有有效商品', 'EMPTY_ORDER')

  const amount = data.amount ?? items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const order = {
    orderNo: generateOrderNo('SP'),
    amount,
    items,
    status: 'paid',
    createTime: new Date().toLocaleString()
  }

  taskStore.addOrderTask(order)
  return ok(order)
}

/**
 * GET/PUT /user/profile
 */
function handleGetProfile() {
  return ok(mockUser)
}

function handleUpdateProfile(ctx) {
  const data = parseBody(ctx)
  Object.assign(mockUser, {
    name: data.name ?? mockUser.name,
    phone: data.phone ?? mockUser.phone,
    email: data.email ?? mockUser.email
  })
  logger.info('Mock profile updated', { name: mockUser.name })
  return ok({ ...mockUser })
}

/**
 * GET/POST /bookings
 */
function handleBookings(ctx) {
  if (ctx.method === 'POST') {
    const data = parseBody(ctx)
    const table = mockTables.find((t) => t.id === Number(data.tableId))
    const orderNo = generateOrderNo('BK')
    const slot = (data.timeSlot || '').trim()
    const result = {
      orderNo,
      tableId: data.tableId,
      tableName: data.tableName || (table ? `${table.name} - ${table.type}` : ''),
      date: data.date,
      time: data.time || slot,
      duration: data.duration,
      status: 'upcoming'
    }
    if (table) {
      taskStore.addBookingTask(table, {
        orderNo,
        date: data.date,
        time: result.time,
        duration: data.duration
      })
    }
    logger.info('Mock booking created', { orderNo })
    return ok(result)
  }
  return ok(mockBookings)
}

/**
 * GET/POST /user/tasks
 */
function handleUserTasks(ctx) {
  if (ctx.method === 'POST') {
    const { taskId, action } = parseBody(ctx)
    logger.info('Task action via API', { taskId, action })

    if (action === 'pay') {
      const result = taskStore.markAsPaid(taskId)
      return result
        ? ok({ success: true, message: '支付成功', task: result })
        : fail('支付失败，请稍后重试', 'TASK_PAY_FAILED')
    }
    if (action === 'cancel') {
      const result = taskStore.remove(taskId)
      return result
        ? ok({ success: true, message: '取消成功' })
        : fail('取消失败，请稍后重试', 'TASK_CANCEL_FAILED')
    }
    if (action === 'confirm') {
      const result = taskStore.updateStatus(taskId, 'completed')
      return result
        ? ok({ success: true, message: '确认收货成功', task: result })
        : fail('操作失败，请稍后重试', 'TASK_ACTION_FAILED')
    }
    // remind/review 等仅提示类操作
    return ok({ success: true, message: '操作成功' })
  }

  const params = ctx.params || {}
  const list = params.status ? taskStore.getByStatus(params.status) : taskStore.getAll()
  return ok(list)
}

// ==================== 路由表 ====================

const routes = {
  'POST /auth/login': handleLogin,
  'POST /auth/logout': handleLogout,
  'GET /tables': handleGetTables,
  'GET /courses': handleGetCourses,
  'POST /courses/enroll': handleEnrollCourse,
  'GET /competitions': handleGetCompetitions,
  'POST /competitions/join': handleJoinCompetition,
  'GET /products': handleGetProducts,
  'POST /orders': handleCreateOrder,
  'GET /user/profile': handleGetProfile,
  'PUT /user/profile': handleUpdateProfile,
  'GET /bookings': handleBookings,
  'POST /bookings': handleBookings,
  'GET /user/tasks': handleUserTasks,
  'POST /user/tasks': handleUserTasks
}

/**
 * 调用 mock 路由
 * @param {Object} ctx - { method, path, params, body }
 * @returns {Promise<{status: number, body: Object}>}
 */
export async function mockAdapter(ctx) {
  const routeKey = `${(ctx.method || 'GET').toUpperCase()} ${ctx.path}`
  const handler = routes[routeKey]
  if (!handler) {
    logger.warn('Mock API not found', { routeKey })
    return { status: 404, body: { success: false, error: `API not found: ${ctx.path}`, code: 'API_NOT_FOUND' } }
  }
  return handler(ctx)
}

export default mockAdapter
