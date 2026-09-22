/**
 * 模拟请求适配器
 *
 * 与真实 HTTP 通道共用同一套规范化流程（见 utils/http.js）：
 * - 返回 { data }，抛出 ApiError 表示失败
 * - 支持通过 setMockScenario 注入场景：
 *   · 'timeout'  超时（可重试）
 *   · 'network'  网络异常（可重试）
 *   · 'error'    服务端异常 HTTP 500（可重试）
 *   · 'business' 业务错误（不可重试）
 *   · 'empty'    成功但数据为空
 * - 场景可按接口粒度配置：setMockScenario({ '/tables': 'empty' })
 * - 支持 failCount：前 N 次请求命中失败场景，之后恢复成功（用于验证重试边界）
 *
 * 模拟数据统一定义在 mock/mockData.js，页面与本适配器共用同一来源。
 */

import { ApiError, ERROR_CODES } from '../utils/http'
import { taskStore } from '../utils/taskStore'
import {
  mockUser,
  mockTables,
  mockTimeSlots,
  mockCourses,
  mockCompetitions,
  mockProducts,
  mockBookings,
  mockPointsHistory,
  mockGifts,
  generateOrderNo,
  parseBody,
  seededRandom
} from './mockData'

// ==================== 延迟与场景状态 ====================

// 默认模拟网络延迟 500-1000ms；测试中通过 __setMockDelay(0) 关闭
let mockDelay = Number.isFinite(Number(import.meta.env.VITE_MOCK_DELAY))
  ? Number(import.meta.env.VITE_MOCK_DELAY)
  : null

/**
 * 调整模拟延迟
 * @param {number|null} ms 固定毫秒数；null 恢复为 500-1000ms 随机延迟
 */
export function __setMockDelay(ms) {
  mockDelay = Number.isFinite(ms) ? ms : null
}

// 全局场景（字符串）或按接口配置（对象）
let scenarioState = { global: null, routes: {}, failCount: 0 }

/**
 * 设置模拟场景
 * @param {string|Object|null} scenario
 * @param {Object} [options]
 * @param {number} [options.failCount] 前 N 次请求失败后恢复
 */
export function setMockScenario(scenario, options = {}) {
  if (scenario === null || scenario === undefined) {
    scenarioState = { global: null, routes: {}, failCount: 0 }
  } else if (typeof scenario === 'string') {
    scenarioState = { global: scenario, routes: {}, failCount: options.failCount || 0 }
  } else {
    scenarioState = { global: null, routes: { ...scenario }, failCount: options.failCount || 0 }
  }
}

/** 重置场景与失败计数 */
export function resetMockState() {
  scenarioState = { global: null, routes: {}, failCount: 0 }
}

/**
 * 解析本次请求应命中的场景（并消费 failCount 配额）
 */
function resolveScenario(path, method) {
  const routeScenario = scenarioState.routes[path]
  const active = routeScenario || scenarioState.global
  if (!active) return null

  // 精确按接口计数；全局场景则共享配额
  const countKey = routeScenario ? `${method} ${path}` : '__global__'
  scenarioState._consumed = scenarioState._consumed || {}
  const consumed = scenarioState._consumed[countKey] || 0
  scenarioState._consumed[countKey] = consumed + 1

  // failCount 表示前 N 次命中（包含场景语义），超过后恢复正常
  if (consumed < scenarioState.failCount || scenarioState.failCount === 0) {
    return active
  }
  return null
}

/**
 * 可被外部信号取消的延迟
 */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('请求已取消', { code: ERROR_CODES.ABORTED }))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new ApiError('请求已取消', { code: ERROR_CODES.ABORTED }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ==================== 业务处理函数 ====================

function handleLogin(options) {
  const { username, password } = parseBody(options.body)

  if (username === 'user' && password === '123456') {
    return { token: 'mock_token_' + Date.now(), user: mockUser }
  }
  throw new ApiError('用户名或密码错误', { code: ERROR_CODES.BUSINESS })
}

function handleLogout() {
  return { message: '退出成功' }
}

function handleGetTables(options) {
  const params = options.params || {}
  let tables = mockTables.map(t => ({ ...t }))

  // 切换日期时模拟可用状态变化（与旧页面行为保持一致，按日期生成稳定结果）
  if (params.date) {
    const today = new Date().toISOString().split('T')[0]
    if (params.date !== today) {
      tables = tables.map(table => ({
        ...table,
        available: seededRandom(params.date + ':' + table.id) > 0.3
      }))
    }
  }
  if (params.type && params.type !== 'all') {
    tables = tables.filter(t => t.typeId === params.type)
  }
  return tables
}

function handleGetTimeSlots() {
  return mockTimeSlots.map(s => ({ ...s }))
}

function handleBookings(options) {
  if (options.method === 'POST') {
    const body = parseBody(options.body)
    return {
      orderNo: generateOrderNo('BK'),
      ...body,
      status: 'upcoming'
    }
  }
  return mockBookings.map(b => ({ ...b }))
}

function handleCourses(options) {
  if (options.method === 'POST' || options.url === '/courses/enroll') {
    const body = parseBody(options.body)
    const course = mockCourses.find(c => c.id === Number(body.courseId)) || mockCourses[0]
    const expireDate = new Date()
    expireDate.setMonth(expireDate.getMonth() + 6)
    return {
      orderNo: generateOrderNo('CR'),
      courseId: course.id,
      courseName: course.name,
      courseIcon: course.icon,
      coach: course.coach,
      lessons: course.lessons,
      price: course.price,
      expireDate: expireDate.toISOString().split('T')[0],
      createTime: new Date().toLocaleString(),
      progress: 0,
      status: 'paid'
    }
  }
  return mockCourses.map(c => ({ ...c }))
}

function handleCompetitions(options) {
  if (options.method === 'POST' || options.url === '/competitions/join') {
    const body = parseBody(options.body)
    const comp = mockCompetitions.find(c => c.id === Number(body.competitionId)) || mockCompetitions[0]
    return {
      regNo: generateOrderNo('REG'),
      competitionId: comp.id,
      compName: comp.name,
      playerNo: Math.floor(Math.random() * 100) + 1,
      status: comp.status
    }
  }
  const params = options.params || {}
  let list = mockCompetitions.map(c => ({ ...c }))
  if (params.status) list = list.filter(c => c.status === params.status)
  return list
}

function handleProducts(options) {
  if (options.method === 'POST') {
    return handleCreateOrder(options)
  }
  const params = options.params || {}
  let list = mockProducts.map(p => ({ ...p }))
  if (params.category && params.category !== 'all') {
    list = list.filter(p => p.category === params.category)
  }
  if (params.sort === 'price-asc') list.sort((a, b) => a.price - b.price)
  else if (params.sort === 'price-desc') list.sort((a, b) => b.price - a.price)
  return list
}

function handleCreateOrder(options) {
  const body = parseBody(options.body)
  const rawItems = Array.isArray(body.items) ? body.items : []

  // 兼容两种入参：购物车明细（含 name/qty）或仅 { productId, quantity }
  const items = rawItems.map(item => {
    if (item.name && item.qty) return { ...item }
    const product = mockProducts.find(p => p.id === Number(item.productId ?? item.id))
    return product
      ? { ...product, qty: item.quantity || item.qty || 1 }
      : { id: item.productId ?? item.id, qty: item.quantity || item.qty || 1 }
  })

  const amount =
    typeof body.amount === 'number'
      ? body.amount
      : items.reduce((sum, item) => sum + item.price * item.qty, 0)

  return {
    orderNo: generateOrderNo('SP'),
    amount,
    items,
    status: 'paid',
    createTime: new Date().toLocaleString()
  }
}

function handleProfile(options) {
  if (options.method === 'PUT') {
    const body = parseBody(options.body)
    Object.assign(mockUser, body)
    return { ...mockUser }
  }
  return { ...mockUser }
}

function handleUserTasks(options) {
  if (options.method === 'POST') {
    const { taskId, action } = parseBody(options.body)

    if (action === 'pay') {
      const result = taskStore.markAsPaid(taskId)
      if (!result) {
        throw new ApiError('支付失败，任务不存在或状态已变更', { code: ERROR_CODES.BUSINESS })
      }
      return { success: true, message: '支付成功', task: result }
    }
    if (action === 'cancel') {
      const result = taskStore.remove(taskId)
      if (!result) {
        throw new ApiError('取消失败，任务不存在', { code: ERROR_CODES.BUSINESS })
      }
      return { success: true, message: '取消成功' }
    }
    if (action === 'confirm') {
      const result = taskStore.updateStatus(taskId, 'completed')
      if (!result) {
        throw new ApiError('确认失败，任务不存在或状态已变更', { code: ERROR_CODES.BUSINESS })
      }
      return { success: true, message: '确认收货成功', task: result }
    }
    if (action === 'remind') {
      return { success: true, message: '已提醒卖家尽快发货' }
    }
    throw new ApiError(`不支持的任务操作：${action}`, { code: ERROR_CODES.BUSINESS })
  }

  const params = options.params || {}
  let tasks = taskStore.getAll()
  if (params.status) tasks = taskStore.getByStatus(params.status)
  if (params.type && params.type !== 'all') tasks = tasks.filter(t => t.type === params.type)
  return tasks
}

// ==================== 路由表 ====================

const routes = [
  { match: '/auth/login', method: 'POST', handler: handleLogin },
  { match: '/auth/logout', method: 'POST', handler: handleLogout },
  { match: '/tables/time-slots', handler: () => handleGetTimeSlots() },
  { match: '/tables', handler: (options) => handleGetTables(options) },
  { match: '/bookings', handler: (options) => handleBookings(options) },
  { match: '/courses/enroll', method: 'POST', handler: (options) => handleCourses(options) },
  { match: '/courses', handler: (options) => handleCourses(options) },
  { match: '/competitions/join', method: 'POST', handler: (options) => handleCompetitions(options) },
  { match: '/competitions', handler: (options) => handleCompetitions(options) },
  { match: '/products', handler: (options) => handleProducts(options) },
  { match: '/orders', method: 'POST', handler: (options) => handleCreateOrder(options) },
  { match: '/user/profile', handler: (options) => handleProfile(options) },
  { match: '/user/points', handler: () => mockPointsHistory.map(r => ({ ...r })) },
  { match: '/user/gifts', handler: () => mockGifts.map(g => ({ ...g })) },
  { match: '/user/tasks', handler: (options) => handleUserTasks(options) }
]

/** 场景对应的失败 */
function scenarioError(scenario) {
  switch (scenario) {
    case 'timeout':
      return new ApiError('请求超时，请稍后重试', { code: ERROR_CODES.TIMEOUT, retryable: true })
    case 'network':
      return new ApiError('网络异常，请检查网络后重试', { code: ERROR_CODES.NETWORK, retryable: true })
    case 'error':
      return new ApiError('服务器开小差了，请稍后重试', {
        code: ERROR_CODES.HTTP,
        status: 500,
        retryable: true
      })
    case 'business':
      return new ApiError('业务处理失败，请稍后重试', { code: ERROR_CODES.BUSINESS })
    default:
      return null
  }
}

/**
 * 模拟适配器入口（由 utils/http.js 调用）
 * @param {{url: string, method: string, options: Object, signal?: AbortSignal}} ctx
 * @returns {Promise<{data: any}>}
 */
export async function mockAdapter({ url, method, options, signal }) {
  // 统一模拟延迟
  const ms = mockDelay === null ? 500 + Math.random() * 500 : mockDelay
  if (ms > 0) await wait(ms, signal)

  const path = url.split('?')[0]

  // 场景注入（超时/异常/空数据）
  const scenario = resolveScenario(path, method)
  if (scenario === 'empty') {
    // GET 列表接口空数据为 []；POST/对象接口为空对象。空数据仍为成功响应
    const listLike = method === 'GET'
    return { data: listLike ? [] : {} }
  }
  const injectedError = scenarioError(scenario)
  if (injectedError) throw injectedError

  const route = routes.find(r => {
    if (r.match !== path) return false
    return !r.method || r.method === method
  })

  if (!route) {
    throw new ApiError(`API not found: ${method} ${path}`, { code: ERROR_CODES.BUSINESS })
  }

  try {
    const data = await route.handler({ ...options, url: path, method })
    return { data }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error.message || '模拟数据处理失败', { code: ERROR_CODES.BUSINESS })
  }
}

export default mockAdapter
