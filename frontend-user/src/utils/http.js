/**
 * 统一 HTTP 层
 *
 * 设计目标（用户端各页面共用）：
 * - 统一响应结构：{ success, data, error, code, retried }
 *   · 成功（含空数据）→ success: true，数据原样返回（空数组/空对象即"空数据"）
 *   · 业务/HTTP 异常 → success: false，code 标识错误类别，error 为可展示文案
 * - 统一错误类别：TIMEOUT / NETWORK / HTTP / BUSINESS / ABORTED
 * - 统一重试边界：仅安全的 GET/HEAD 请求在超时/网络/5xx 时自动重试；
 *   POST/PUT/DELETE 等写操作绝不自动重试，由调用方重新发起
 * - 统一加载规则：配合 utils/useRequest.js 的 idle/loading/refreshing/error 状态机
 * - Mock 与真实接口走同一套规范化流程，切换 VITE_USE_MOCK=false 即调用真实后端
 *
 * 真实接口约定：
 * - 成功：HTTP 2xx，body 直接为业务数据（{...} 或 [...]），或标准信封
 *   { success: true, data }；data 也可为 { list: [...], total }
 * - 失败：HTTP 4xx/5xx，body 形如 { error: { code, message } } 或
 *   { error: 'message' }；缺省时按状态码生成中文提示
 */

import { logger } from './logger'
import { mockAdapter, setMockScenario, resetMockState, __setMockDelay } from '../mock'

// ==================== 错误类型 ====================

/** 可识别的错误码 */
export const ERROR_CODES = {
  TIMEOUT: 'TIMEOUT', // 请求超时
  NETWORK: 'NETWORK', // 网络中断 / 无法连接
  HTTP: 'HTTP_ERROR', // 服务端返回错误状态码
  BUSINESS: 'BUSINESS_ERROR', // 业务错误（4xx 或服务端 success:false）
  ABORTED: 'ABORTED' // 请求被取消
}

/** 可重试的错误码：超时、网络异常、服务端 5xx */
const RETRYABLE_CODES = [ERROR_CODES.TIMEOUT, ERROR_CODES.NETWORK, ERROR_CODES.HTTP]

/**
 * 统一错误对象，携带错误码与是否可重试标记
 */
export class ApiError extends Error {
  /**
   * @param {string} message 可直接展示的错误文案
   * @param {Object} options
   * @param {string} options.code 错误码（见 ERROR_CODES）
   * @param {number} [options.status] HTTP 状态码
   * @param {boolean} [options.retryable] 是否可自动重试
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code || ERROR_CODES.BUSINESS
    this.status = options.status
    this.retryable = !!options.retryable
  }
}

// ==================== 全局配置 ====================

const DEFAULT_CONFIG = {
  // 请求超时时间（毫秒）
  timeout: Number(import.meta.env.VITE_REQUEST_TIMEOUT) || 8000,
  // GET 请求自动重试次数（不含首次请求）
  retryCount: Number.isFinite(Number(import.meta.env.VITE_REQUEST_RETRY))
    ? Number(import.meta.env.VITE_REQUEST_RETRY)
    : 1,
  // 重试间隔（毫秒）
  retryDelay: 300,
  // 是否使用模拟数据
  useMock: import.meta.env.VITE_USE_MOCK !== 'false',
  // API 基础地址
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api'
}

const config = { ...DEFAULT_CONFIG }

/**
 * 更新请求配置（主要供测试与调试使用）
 * @param {Partial<typeof DEFAULT_CONFIG>} patch
 */
export function configureHttp(patch = {}) {
  Object.assign(config, patch)
}

/** 还原默认配置 */
export function resetHttpConfig() {
  Object.assign(config, DEFAULT_CONFIG)
}

/**
 * 设置模拟场景（仅 mock 模式生效）
 * @param {string|Object|null} scenario 'timeout' | 'error' | 'empty' | { '/tables': 'empty' }
 * @param {Object} [options] { failCount: number } 前 N 次失败后恢复（用于验证重试）
 */
export function setMockRequestScenario(scenario, options) {
  setMockScenario(scenario, options)
}

/** 重置 mock 场景与失败计数 */
export function resetMockRequestState() {
  resetMockState()
}

/** 调整 mock 延迟（测试时可设为 0） */
export function setMockRequestDelay(delay) {
  __setMockDelay(delay)
}

// ==================== 响应规范化 ====================

/**
 * 构造成功信封
 */
function ok(data, retried = 0) {
  return { success: true, data, error: null, code: null, retried }
}

/**
 * 构造失败信封
 */
function fail(error, code, retried = 0, status) {
  return { success: false, data: null, error, code, status: status ?? null, retried }
}

/**
 * 将真实接口的成功响应体规范化为业务数据
 * 兼容三种后端形态：
 * 1. { success: true, data, ... } 标准信封
 * 2. { code: 0, data, message } 常见国产后端信封
 * 3. 直接返回业务数据（数组/对象）
 * 4. { list: [], total } 分页结构保持原样透传
 */
function normalizeBody(body) {
  if (body == null) return null

  if (typeof body === 'object' && !Array.isArray(body)) {
    if (body.success === true && 'data' in body) {
      return body.data
    }
    // code === 0 / 200 视为成功信封
    if ((body.code === 0 || body.code === 200) && 'data' in body) {
      return body.data
    }
  }
  return body
}

/**
 * 判断成功信封内是否携带业务失败标记
 */
function readBusinessFailure(body) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (body.success === false) {
      return body.message || body.error || '请求失败，请稍后重试'
    }
    if (body.code !== undefined && body.code !== 0 && body.code !== 200) {
      return body.message || body.error || '请求失败，请稍后重试'
    }
  }
  return null
}

// ==================== 工具函数 ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 将 params 对象序列化为 query string
 */
function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value)
    }
  })
  const str = search.toString()
  return str ? `?${str}` : ''
}

function isSafeMethod(method) {
  return !method || method === 'GET' || method === 'HEAD'
}

/** HTTP 状态码对应的中文提示 */
function statusMessage(status, statusText) {
  const map = {
    400: '请求参数有误，请检查后重试',
    401: '登录已失效，请重新登录',
    403: '没有权限执行此操作',
    404: '请求的资源不存在',
    408: '请求超时，请稍后重试',
    409: '数据冲突，请刷新后重试',
    429: '操作过于频繁，请稍后再试',
    500: '服务器开小差了，请稍后重试',
    502: '网关异常，请稍后重试',
    503: '服务暂不可用，请稍后重试',
    504: '网关超时，请稍后重试'
  }
  return map[status] || `请求失败（HTTP ${status}${statusText ? ' ' + statusText : ''}）`
}

// ==================== 真实 HTTP 发送 ====================

/**
 * 发起单次 fetch（含超时控制）
 * @returns {Promise<{data: any, status: number}>}
 */
function fetchOnce(fullUrl, options, signal) {
  const { timeout } = config
  const controller = new AbortController()
  // 本地标记区分"超时中止"与"外部取消"（部分环境的 AbortError 不携带 reason）
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('timeout'))
  }, timeout)

  // 外部（useRequest 过期/卸载）取消时级联取消
  const onOuterAbort = () => controller.abort(new Error('aborted'))
  if (signal) {
    if (signal.aborted) controller.abort(new Error('aborted'))
    else signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  const method = options.method || 'GET'
  const headers = {
    Authorization: `Bearer ${localStorage.getItem('billiard_token') || ''}`,
    ...options.headers
  }
  // 对象 body 自动序列化并补 Content-Type；字符串 body 默认 JSON
  let body = options.body
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'object' && body !== null) {
      body = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    } else if (typeof body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  } else {
    body = undefined
  }

  return fetch(fullUrl, {
    method,
    headers,
    body,
    signal: controller.signal
  })
    .then(async response => {
      const text = await response.text()
      let parsed = null
      if (text) {
        try {
          parsed = JSON.parse(text)
        } catch (e) {
          // 非 JSON 响应：2xx 当作纯文本，非 2xx 视为协议错误
          if (response.ok) return { data: text, status: response.status }
          throw new ApiError(statusMessage(response.status, response.statusText), {
            code: ERROR_CODES.HTTP,
            status: response.status,
            retryable: response.status >= 500
          })
        }
      }

      if (!response.ok) {
        const serverMsg =
          (parsed && (parsed.message || (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message))) ||
          statusMessage(response.status, response.statusText)
        throw new ApiError(serverMsg, {
          code: response.status >= 500 ? ERROR_CODES.HTTP : ERROR_CODES.BUSINESS,
          status: response.status,
          retryable: response.status >= 500
        })
      }

      const businessError = readBusinessFailure(parsed)
      if (businessError) {
        throw new ApiError(businessError, { code: ERROR_CODES.BUSINESS, status: response.status })
      }

      return { data: normalizeBody(parsed), status: response.status }
    })
    .catch(error => {
      // 已包装的错误直接抛出
      if (error instanceof ApiError) throw error

      if (error?.name === 'AbortError' || /aborted|abort/i.test(error?.message || '')) {
        const isTimeout = timedOut || /timeout/i.test(error?.message || '')
        throw new ApiError(isTimeout ? '请求超时，请稍后重试' : '请求已取消', {
          code: isTimeout ? ERROR_CODES.TIMEOUT : ERROR_CODES.ABORTED,
          retryable: isTimeout
        })
      }

      // TypeError: Failed to fetch 等网络层错误
      throw new ApiError('网络异常，请检查网络后重试', {
        code: ERROR_CODES.NETWORK,
        retryable: true
      })
    })
    .finally(() => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onOuterAbort)
    })
}

// ==================== 核心请求入口 ====================

/**
 * 统一请求方法
 *
 * @param {string} url - 请求路径（不含 baseUrl），可含已拼好的 query
 * @param {Object} [options]
 * @param {string} [options.method='GET'] - 请求方法
 * @param {Object|string} [options.body] - 请求体（对象自动 JSON 序列化）
 * @param {Object} [options.params] - 查询参数（自动序列化）
 * @param {Object} [options.headers] - 额外请求头
 * @param {number} [options.timeout] - 本次请求超时
 * @param {number} [options.retryCount] - 本次请求的自动重试次数（仅 GET/HEAD 生效）
 * @param {AbortSignal} [options.signal] - 外部取消信号
 * @param {boolean} [options.useMock] - 覆盖全局 mock 开关
 * @returns {Promise<{success: boolean, data?: any, error?: string|null, code: string|null, retried: number, status?: number|null}>}
 */
export async function request(url, options = {}) {
  const method = options.method || 'GET'
  const query = buildQuery(options.params)
  const fullUrl = `${config.baseUrl}${url}${url.includes('?') ? query.replace('?', '&') : query}`
  const useMock = options.useMock !== undefined ? options.useMock : config.useMock
  const autoRetry = isSafeMethod(method)
    ? Number.isInteger(options.retryCount)
      ? options.retryCount
      : config.retryCount
    : 0

  logger.info(`API Request: ${method} ${fullUrl}`)

  let lastError = null
  let retried = 0

  for (let attempt = 0; attempt <= autoRetry; attempt++) {
    if (options.signal?.aborted) {
      return fail('请求已取消', ERROR_CODES.ABORTED, retried)
    }

    try {
      const result = useMock
        ? await mockAdapter({ url, method, fullUrl, options, signal: options.signal })
        : await fetchOnce(fullUrl, { ...options, timeout: options.timeout ?? config.timeout }, options.signal)

      logger.info(`API Response: ${url}`, { status: 'success', retried })
      return ok(result.data, retried)
    } catch (error) {
      lastError = error instanceof ApiError ? error : new ApiError(error.message || '请求失败，请稍后重试')

      // 主动取消不重试
      if (lastError.code === ERROR_CODES.ABORTED) {
        logger.warn(`API aborted: ${url}`)
        return fail(lastError.message, ERROR_CODES.ABORTED, retried, lastError.status)
      }

      const canRetry = attempt < autoRetry && RETRYABLE_CODES.includes(lastError.code) && lastError.retryable
      if (canRetry) {
        retried++
        logger.warn(`API retry ${retried}/${autoRetry}: ${url}`, { code: lastError.code })
        await delay(config.retryDelay)
        continue
      }

      logger.error(`API Error: ${url}`, { code: lastError.code, message: lastError.message })
      return fail(
        lastError.message || '网络请求失败，请稍后重试',
        lastError.code || ERROR_CODES.BUSINESS,
        retried,
        lastError.status
      )
    }
  }

  logger.error(`API Error: ${url}`, lastError)
  return fail(lastError?.message || '网络请求失败，请稍后重试', lastError?.code || ERROR_CODES.NETWORK, retried)
}

export default request
