/**
 * 统一请求层（http）
 *
 * 所有页面只通过本模块访问后端（mock 或真实接口），保证：
 * 1. 响应结构一致：{ success, data, empty, code } / { success:false, error, code, status }
 * 2. 错误反馈一致：ApiError 归一化（超时/网络/HTTP/业务错误），不把原始异常抛给页面
 * 3. 重试边界一致：仅幂等 GET 默认重试；4xx 与业务失败不重试；写操作不自动重试
 * 4. 加载规则一致：createListResource / createAction 统一管理 loading / error / empty
 * 5. mock 与真实接口同构：切换 VITE_USE_MOCK=false 即可验证真实后端
 *
 * 场景模拟（成功/空数据/超时/异常/重新请求）：
 * - 环境变量 VITE_MOCK_SCENARIO=success|empty|timeout|error|random
 * - 运行时：import { setMockScenario, resetMockScenario } from '@/utils/http'
 *   或在控制台使用 window.__setMockScenario('timeout')
 */

import { reactive } from 'vue'
import { logger } from './logger'
import { mockAdapter } from '../mock/adapter'

// ==================== 配置 ====================

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 单次请求超时时间（毫秒） */
export const DEFAULT_TIMEOUT = Number(import.meta.env.VITE_HTTP_TIMEOUT) || 10000

/** GET 请求失败后的自动重试次数（不含首次请求）；非 GET 默认为 0 */
export const DEFAULT_GET_RETRIES = 2

/** 重试基础间隔（毫秒），按次数递增 */
const RETRY_DELAY = 300

/** mock 网络延迟范围 500-1000ms（与改造前保持一致） */
const MOCK_LATENCY = () => 500 + Math.random() * 500

/** 运行时场景存储键，便于不重新构建即可验证异常流程 */
const MOCK_SCENARIO_STORAGE_KEY = 'billiard_mock_scenario'

/** 集合型 GET 路径：仅这些接口在 empty 场景下返回空集合 */
const COLLECTION_PATHS = ['/tables', '/courses', '/competitions', '/products', '/bookings', '/user/tasks']

// ==================== 错误类型 ====================

/**
 * 统一错误对象
 */
export class ApiError extends Error {
  /**
   * @param {string} message - 用户可见的错误信息
   * @param {string} code - 错误码（TIMEOUT/NETWORK_ERROR/HTTP_xxx/业务码）
   * @param {number} status - HTTP 状态码（传输层错误为 0）
   * @param {boolean} retriable - 是否属于可重试错误
   */
  constructor(message, code = 'ERROR', status = 0, retriable = false) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retriable = retriable
  }
}

/** 各 HTTP 状态码的默认提示文案 */
const HTTP_ERROR_MESSAGES = {
  400: '请求参数有误，请检查后重试',
  401: '登录已失效，请重新登录',
  403: '没有权限执行该操作',
  404: '请求的资源不存在',
  408: '请求超时，请稍后重试',
  429: '操作过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后重试',
  502: '服务暂不可用，请稍后重试',
  503: '服务暂不可用，请稍后重试',
  504: '网关超时，请稍后重试'
}

/** 默认可重试的 HTTP 状态码 */
const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

// ==================== Mock 场景控制 ====================

function getStoredScenario() {
  try {
    return localStorage.getItem(MOCK_SCENARIO_STORAGE_KEY) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 获取当前 mock 场景
 * @returns {'success'|'empty'|'timeout'|'error'|'random'}
 */
export function getMockScenario() {
  return (
    getStoredScenario() ||
    import.meta.env.VITE_MOCK_SCENARIO ||
    'success'
  )
}

/**
 * 设置 mock 场景（运行时生效，持久化到 localStorage）
 * @param {'success'|'empty'|'timeout'|'error'|'random'} scenario
 */
export function setMockScenario(scenario) {
  try {
    if (!scenario || scenario === 'success') localStorage.removeItem(MOCK_SCENARIO_STORAGE_KEY)
    else localStorage.setItem(MOCK_SCENARIO_STORAGE_KEY, scenario)
  } catch (e) {
    logger.warn('Failed to persist mock scenario', e)
  }
  logger.warn('Mock scenario switched', { scenario })
}

/**
 * 重置为默认（成功）场景
 */
export function resetMockScenario() {
  setMockScenario('success')
}

// ==================== 工具函数 ====================

const delay = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') timer.unref()
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })

/**
 * 判断数据是否为空数据（null/undefined/空数组/空对象）
 */
export function isEmptyPayload(data) {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  if (typeof data === 'object') return Object.keys(data).length === 0
  return false
}

/**
 * 构造查询字符串，自动跳过空值
 */
function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.append(key, value)
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/**
 * 将任意来源的响应归一化为标准成功包
 */
function normalizeSuccess(payload) {
  // 后端已是标准包：{ success, data/result, error/message, code }
  if (payload && typeof payload === 'object' && 'success' in payload) {
    const data = payload.data !== undefined ? payload.data : payload.result
    return {
      success: !!payload.success,
      data,
      empty: isEmptyPayload(data),
      code: payload.code || (payload.success ? 'OK' : 'BUSINESS_ERROR'),
      error: payload.error || payload.message || ''
    }
  }
  // 后端直接返回裸数据（数组/对象），统一包装
  return { success: true, data: payload, empty: isEmptyPayload(payload), code: 'OK' }
}

/**
 * 组装失败响应包
 */
function failureEnvelope(error) {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(error?.message || '网络请求失败，请稍后重试', 'NETWORK_ERROR', 0, true)
  return {
    success: false,
    error: apiError.message,
    code: apiError.code,
    status: apiError.status,
    retriable: apiError.retriable
  }
}

// ==================== Mock 传输 ====================

function resolveMockScenario(override) {
  const scenario = override || getMockScenario()
  if (scenario !== 'random') return scenario
  const r = Math.random()
  if (r < 0.5) return 'success'
  if (r < 0.68) return 'empty'
  if (r < 0.86) return 'timeout'
  return 'error'
}

/**
 * 执行一次 mock 请求
 * @param {Object} ctx - { method, path, params, body, scenario, timeout }
 * @param {AbortSignal} signal - 超时中止信号
 */
async function mockCall(ctx, signal) {
  const scenario = resolveMockScenario(ctx.scenario)
  const isCollection = ctx.method === 'GET' && COLLECTION_PATHS.includes(ctx.path)

  // 超时场景：mock 延迟超过请求超时时间，由统一超时机制判定
  const latency =
    scenario === 'timeout'
      ? (ctx.timeout > 0 ? ctx.timeout : 3000) + 250
      : MOCK_LATENCY()
  await delay(latency, signal)
  if (signal?.aborted) {
    throw new ApiError(`请求超时，请稍后重试（${ctx.timeout}ms）`, 'TIMEOUT', 0, true)
  }

  if (scenario === 'timeout') {
    throw new ApiError(`请求超时，请稍后重试（${ctx.timeout}ms）`, 'TIMEOUT', 0, true)
  }
  if (scenario === 'error') {
    throw new ApiError('模拟服务异常，请稍后重试', 'MOCK_SERVER_ERROR', 500, true)
  }
  if (scenario === 'empty' && isCollection) {
    return { status: 200, body: { success: true, data: [] } }
  }

  // 正常 / 非集合接口的 empty 场景：走真实 mock 路由
  const { status, body } = await mockAdapter({
    method: ctx.method,
    path: ctx.path,
    params: ctx.params,
    body: ctx.body
  })

  if (status < 400 && body && body.success !== false) {
    return { status, body }
  }

  // 业务失败 / mock 路由返回错误状态：转成 ApiError，交由重试边界决定是否重试
  throw new ApiError(
    body?.error || body?.message || `请求失败（${status}）`,
    body?.code || `HTTP_${status}`,
    status,
    RETRIABLE_STATUS.has(status)
  )
}

// ==================== 真实 HTTP 传输 ====================

/**
 * 真实 HTTP 传输（导出以便在不切换全局模式的情况下进行真实接口联调测试）
 * @param {Object} ctx - 与 mockCall 相同的请求上下文
 * @param {AbortSignal} [signal]
 * @returns {Promise<{status: number, body: any}>}
 */
export async function httpCall(ctx, signal) {
  const fullUrl = `${API_BASE_URL}${ctx.path}${buildQuery(ctx.params)}`
  const headers = { ...(ctx.headers || {}) }
  if (ctx.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  let token
  try {
    token = localStorage.getItem('billiard_token')
  } catch (e) {
    token = null
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(fullUrl, {
      method: ctx.method,
      headers,
      body: ctx.body,
      signal
    })
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ApiError(`请求超时，请稍后重试（${ctx.timeout}ms）`, 'TIMEOUT', 0, true)
    }
    throw new ApiError('网络连接失败，请检查网络后重试', 'NETWORK_ERROR', 0, true)
  }

  const rawText = await response.text()
  let payload = null
  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch (e) {
      if (response.ok) {
        // 非 JSON 成功响应按文本数据返回
        payload = rawText
      } else {
        throw new ApiError(
          HTTP_ERROR_MESSAGES[response.status] || `HTTP ${response.status}: ${response.statusText}`,
          `HTTP_${response.status}`,
          response.status,
          RETRIABLE_STATUS.has(response.status)
        )
      }
    }
  }

  if (!response.ok) {
    const message =
      (payload && (payload.error || payload.message)) ||
      HTTP_ERROR_MESSAGES[response.status] ||
      `HTTP ${response.status}: ${response.statusText}`
    throw new ApiError(
      message,
      (payload && payload.code) || `HTTP_${response.status}`,
      response.status,
      RETRIABLE_STATUS.has(response.status)
    )
  }

  return { status: response.status, body: payload }
}

// ==================== 统一请求入口 ====================

/**
 * 发起请求（mock / 真实接口自动切换）
 *
 * @param {string} url - 请求路径（不含 baseURL，可带查询串）
 * @param {Object} [options]
 * @param {string} [options.method='GET'] - GET/POST/PUT/DELETE
 * @param {Object} [options.params] - 查询参数
 * @param {Object|string} [options.body] - 请求体（对象自动 JSON 序列化）
 * @param {Object} [options.headers] - 额外请求头
 * @param {number} [options.timeout] - 超时毫秒，默认 10000，<=0 表示不限制
 * @param {number} [options.retries] - 重试次数覆盖（GET 默认 2，其余默认 0）
 * @param {number} [options.retryDelay] - 重试间隔覆盖
 * @param {Function} [options.transport] - 自定义传输（真实接口联调测试用）
 * @param {'success'|'empty'|'timeout'|'error'|'random'} [options.mockScenario] - 单次 mock 场景
 * @returns {Promise<{success: boolean, data?: any, empty?: boolean, code: string, error?: string}>}
 */
export async function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const [path, inlineQuery] = url.split('?')
  const params = { ...(options.params || {}) }
  if (inlineQuery) new URLSearchParams(inlineQuery).forEach((v, k) => (params[k] = v))

  const timeout = options.timeout !== undefined ? options.timeout : DEFAULT_TIMEOUT
  const retries =
    options.retries !== undefined ? options.retries : method === 'GET' ? DEFAULT_GET_RETRIES : 0
  const retryDelay = options.retryDelay !== undefined ? options.retryDelay : RETRY_DELAY

  const rawBody =
    options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body

  const ctx = {
    method,
    path,
    params,
    body: rawBody,
    headers: options.headers,
    timeout,
    scenario: options.mockScenario
  }

  const transport = options.transport || (USE_MOCK ? mockCall : httpCall)
  logger.info(`API Request: ${method} ${API_BASE_URL}${path}${buildQuery(params)}`, {
    mode: USE_MOCK ? 'mock' : 'real'
  })

  const maxAttempts = retries + 1
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = timeout > 0 ? new AbortController() : null
    let timeoutTimer = null
    if (controller) {
      timeoutTimer = setTimeout(() => controller.abort(), timeout)
      if (typeof timeoutTimer.unref === 'function') timeoutTimer.unref()
    }
    try {
      const { body } = await transport(ctx, controller?.signal)
      const envelope = normalizeSuccess(body)
      if (envelope.success) {
        logger.info(`API Response: ${path}`, { status: 'success', empty: envelope.empty })
        return envelope
      }
      // 业务失败不重试，直接返回标准失败包
      logger.warn(`API Business failure: ${path}`, { code: envelope.code, error: envelope.error })
      return { success: false, error: envelope.error || '请求失败', code: envelope.code }
    } catch (error) {
      lastError = error instanceof ApiError ? error : new ApiError(error.message, 'NETWORK_ERROR', 0, true)
      const willRetry = lastError.retriable && attempt < maxAttempts
      logger.warn(`API attempt ${attempt}/${maxAttempts} failed: ${path}`, {
        code: lastError.code,
        willRetry
      })
      if (!willRetry) break
      // 中止当前 attempt 后再等待，避免悬挂计时器
      controller?.abort()
      await delay(retryDelay * attempt)
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }
  }

  logger.error(`API Error: ${path}`, lastError)
  return failureEnvelope(lastError)
}

// ==================== 页面状态工厂 ====================

/**
 * 创建列表资源：统一管理 loading / success / error / empty 状态
 *
 * 加载失败且本地无数据时进入 error（可点击重试）；
 * 静默刷新失败时保留旧数据，仅更新 error 文案（由调用方决定是否提示）。
 *
 * @param {(params?: Object) => Promise<Object>} loader - 返回标准响应包的请求函数
 * @param {Object} [options]
 * @param {Array} [options.initialData=[]] - 初始数据
 * @returns {Object} 响应式资源 { status, loading, data, empty, error, code, run, retry }
 */
export function createListResource(loader, options = {}) {
  const resource = reactive({
    status: 'idle', // idle | loading | success | error
    data: options.initialData || [],
    empty: false,
    error: '',
    code: '',
    loading: false,
    run: null,
    retry: null
  })

  let requestSeq = 0
  let lastParams = {}

  async function run(params = {}, runOptions = {}) {
    const silent = !!runOptions.silent
    lastParams = params
    const seq = ++requestSeq

    if (!silent || resource.status === 'idle') {
      resource.status = 'loading'
      resource.loading = true
    }
    if (!silent) resource.error = ''

    let result
    try {
      result = await loader(params, runOptions)
    } catch (e) {
      // 理论上 request 不抛异常，兜底保证页面状态一致
      result = { success: false, error: e?.message || '网络请求失败，请稍后重试', code: 'UNKNOWN' }
    }

    // 后发先至的旧请求结果直接丢弃
    if (seq !== requestSeq) return result

    resource.loading = false
    if (result.success) {
      resource.data = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data]
      resource.empty = result.empty !== undefined ? result.empty : resource.data.length === 0
      resource.error = ''
      resource.code = 'OK'
      resource.status = 'success'
    } else {
      resource.error = result.error || '网络请求失败，请稍后重试'
      resource.code = result.code || 'ERROR'
      // 已有数据时刷新失败不进入整页错误态
      resource.status = resource.data.length > 0 ? 'success' : 'error'
      if (typeof runOptions.onError === 'function') runOptions.onError(result)
    }
    return result
  }

  function retry(runOptions) {
    return run(lastParams, runOptions)
  }

  resource.run = run
  resource.retry = retry
  return resource
}

/**
 * 创建操作资源（提交/支付/取消等写操作）：统一管理按钮 loading 与错误
 *
 * @param {(...args: any[]) => Promise<Object>} actionFn - 返回标准响应包的请求函数
 * @returns {Object} 响应式资源 { loading, error, code, run }
 */
export function createAction(actionFn) {
  const action = reactive({
    loading: false,
    error: '',
    code: '',
    run: null
  })

  action.run = async function (...args) {
    action.loading = true
    action.error = ''
    let result
    try {
      result = await actionFn(...args)
    } catch (e) {
      result = { success: false, error: e?.message || '操作失败，请稍后重试', code: 'UNKNOWN' }
    } finally {
      action.loading = false
    }
    if (!result.success) {
      action.error = result.error || '操作失败，请稍后重试'
      action.code = result.code || 'ERROR'
    }
    return result
  }

  return action
}

/**
 * 提取用户可见错误文案（减少各页面重复判空）
 */
export function errorMessage(result, fallback = '操作失败，请稍后重试') {
  return result?.error || fallback
}

// 便于在控制台验证异常流程
if (typeof window !== 'undefined') {
  window.__setMockScenario = setMockScenario
  window.__resetMockScenario = resetMockScenario
}

export default {
  request,
  ApiError,
  createListResource,
  createAction,
  isEmptyPayload,
  errorMessage,
  setMockScenario,
  resetMockScenario,
  getMockScenario
}
