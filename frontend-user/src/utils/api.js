/**
 * API 接口层（业务接口集合）
 *
 * 统一请求能力（响应结构、错误反馈、超时、重试、加载规则）在 ./http 中实现；
 * 本文件只负责按业务模块声明接口，页面与 store 统一通过 `api.xxx` 调用。
 *
 * 使用方式：
 * import { api, logger } from '@/utils/api'
 * const result = await api.login('user', '123456')
 *
 * 切换模式：
 * - VITE_USE_MOCK=true 使用模拟数据（默认）
 * - VITE_USE_MOCK=false 调用真实 API（响应包由 http 层统一归一化）
 */

import {
  request,
  ApiError,
  createListResource,
  createAction,
  isEmptyPayload,
  errorMessage,
  setMockScenario,
  resetMockScenario,
  getMockScenario
} from './http'
import logger from './logger'

export {
  logger,
  ApiError,
  request,
  createListResource,
  createAction,
  isEmptyPayload,
  errorMessage,
  setMockScenario,
  resetMockScenario,
  getMockScenario
}

/**
 * API接口集合
 * 按业务模块组织，提供统一的调用入口
 *
 * 所有方法均返回标准响应包：
 * - 成功：{ success: true, data, empty, code: 'OK' }
 * - 失败：{ success: false, error, code }
 */
export const api = {
  // ========== 认证模块 ==========

  /**
   * 用户登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   */
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: { username, password }
    }),

  /**
   * 用户退出登录
   */
  logout: () => request('/auth/logout', { method: 'POST' }),

  // ========== 球桌模块 ==========

  /**
   * 获取球桌列表
   * @param {Object} [params] - 查询参数 { type, date }
   */
  getTables: (params) => request('/tables', { params }),

  /**
   * 创建球桌预约
   * @param {Object} data - { tableId, tableName, date, time, timeSlot, duration }
   */
  bookTable: (data) =>
    request('/bookings', {
      method: 'POST',
      body: data
    }),

  // ========== 课程模块 ==========

  /**
   * 获取课程列表
   */
  getCourses: () => request('/courses'),

  /**
   * 报名课程
   * @param {Object} data - { courseId }
   */
  enrollCourse: (data) =>
    request('/courses/enroll', {
      method: 'POST',
      body: data
    }),

  // ========== 赛事模块 ==========

  /**
   * 获取赛事列表
   * @param {Object} [params] - { status }
   */
  getCompetitions: (params) => request('/competitions', { params }),

  /**
   * 报名参赛
   * @param {Object} data - { competitionId }
   */
  joinCompetition: (data) =>
    request('/competitions/join', {
      method: 'POST',
      body: data
    }),

  // ========== 商品模块 ==========

  /**
   * 获取商品列表
   * @param {Object} [params] - { category, sort }
   */
  getProducts: (params) => request('/products', { params }),

  /**
   * 创建商品订单
   * @param {Object} data - { items, amount }
   */
  createOrder: (data) =>
    request('/orders', {
      method: 'POST',
      body: data
    }),

  // ========== 用户模块 ==========

  /**
   * 获取用户信息
   */
  getProfile: () => request('/user/profile'),

  /**
   * 更新用户信息
   * @param {Object} data - { name, phone, email }
   */
  updateProfile: (data) =>
    request('/user/profile', {
      method: 'PUT',
      body: data
    }),

  /**
   * 获取用户预约记录
   */
  getBookings: () => request('/bookings'),

  // ========== 任务中心模块 ==========

  /**
   * 获取用户任务列表
   * @param {Object} [params] - { status: pending|completed, type }
   */
  getTasks: (params) => request('/user/tasks', { params }),

  /**
   * 执行任务操作
   * @param {Object} data - { taskId, action: pay|cancel|view|remind|rebook|review|confirm }
   */
  doTaskAction: (data) =>
    request('/user/tasks', {
      method: 'POST',
      body: data
    })
}

export default api
