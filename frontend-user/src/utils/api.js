/**
 * API 接口层（业务接口集合）
 *
 * 职责：
 * - 按业务模块组织所有用户端接口，提供统一调用入口（api.xxx）
 * - 真实的请求/超时/重试/错误规范化逻辑收敛在 utils/http.js
 * - 模拟数据与场景（成功/空数据/超时/异常）收敛在 src/mock
 *
 * 统一响应结构（mock 与真实接口完全一致）：
 *   { success: true,  data, error: null, code: null, retried }
 *   { success: false, data: null, error: '可展示文案', code, retried }
 *
 * 切换真实接口：
 * - .env 中设置 VITE_USE_MOCK=false
 * - VITE_API_BASE_URL 指向后端地址
 * - 后端只需返回 2xx + 业务数据（或 { success, data } 信封），
 *   错误返回 4xx/5xx + { error } / { message } 即可完成对接
 *
 * 页面侧推荐配合 utils/useRequest.js 使用，避免重复解析 success/data/error。
 */

import { request } from './http'

export { logger } from './logger'
export {
  ApiError,
  ERROR_CODES,
  configureHttp,
  resetHttpConfig,
  setMockRequestScenario,
  resetMockRequestState,
  setMockRequestDelay
} from './http'
export { request }

/**
 * GET 快捷方法（自动序列化 params）
 */
const get = (url, params, options = {}) => request(url, { ...options, method: 'GET', params })

/**
 * POST 快捷方法（对象 body 自动序列化）
 */
const post = (url, body, options = {}) =>
  request(url, {
    ...options,
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body || {})
  })

/**
 * PUT 快捷方法
 */
const put = (url, body, options = {}) =>
  request(url, {
    ...options,
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body || {})
  })

/**
 * API接口集合
 * 按业务模块组织，提供统一的调用入口
 */
export const api = {
  // ========== 认证模块 ==========

  /**
   * 用户登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   */
  login: (username, password) => post('/auth/login', { username, password }),

  /**
   * 用户退出登录
   */
  logout: () => post('/auth/logout'),

  // ========== 球桌模块 ==========

  /**
   * 获取球桌列表
   * @param {Object} [params]
   * @param {string} [params.type] 球桌类型 snooker/pool/chinese
   * @param {string} [params.date] 查询日期
   */
  getTables: (params) => get('/tables', params),

  /**
   * 获取可预约时段
   */
  getTimeSlots: () => get('/tables/time-slots'),

  /**
   * 创建球桌预约
   * @param {Object} data 预约信息 tableId/date/timeSlot/duration
   */
  bookTable: (data) => post('/bookings', data),

  // ========== 课程模块 ==========

  /**
   * 获取课程列表
   */
  getCourses: () => get('/courses'),

  /**
   * 报名课程
   * @param {Object} data
   * @param {number} data.courseId 课程ID
   */
  enrollCourse: (data) => post('/courses/enroll', data),

  // ========== 赛事模块 ==========

  /**
   * 获取赛事列表
   * @param {Object} [params]
   * @param {string} [params.status] upcoming/ongoing/finished
   */
  getCompetitions: (params) => get('/competitions', params),

  /**
   * 报名参赛
   * @param {Object} data
   * @param {number} data.competitionId 赛事ID
   */
  joinCompetition: (data) => post('/competitions/join', data),

  // ========== 商品模块 ==========

  /**
   * 获取商品列表
   * @param {Object} [params]
   * @param {string} [params.category] 商品分类
   * @param {string} [params.sort] price-asc/price-desc
   */
  getProducts: (params) => get('/products', params),

  /**
   * 创建商品订单
   * @param {Object} data
   * @param {Array} data.items 商品列表
   */
  createOrder: (data) => post('/orders', data),

  // ========== 用户模块 ==========

  /**
   * 获取用户信息
   */
  getProfile: () => get('/user/profile'),

  /**
   * 更新用户信息
   */
  updateProfile: (data) => put('/user/profile', data),

  /**
   * 获取用户预约记录
   */
  getBookings: () => get('/bookings'),

  /**
   * 获取积分明细
   */
  getPointsHistory: () => get('/user/points'),

  /**
   * 获取积分兑换礼品列表
   */
  getGifts: () => get('/user/gifts'),

  // ========== 任务中心模块 ==========

  /**
   * 获取用户任务列表
   * @param {Object} [params]
   * @param {string} [params.status] pending/completed
   * @param {string} [params.type] booking/course/competition/order
   */
  getTasks: (params) => get('/user/tasks', params),

  /**
   * 执行任务操作
   * @param {Object} data
   * @param {string} data.taskId 任务ID
   * @param {string} data.action pay/cancel/confirm/remind/view/rebook/review
   */
  doTaskAction: (data) => post('/user/tasks', data)
}

export default api
