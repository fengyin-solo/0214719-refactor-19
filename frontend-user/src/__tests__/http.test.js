/**
 * 统一 HTTP 层测试
 *
 * 覆盖：
 * - 统一响应结构（成功 / 空数据）
 * - 超时 / 网络异常 / 服务端异常 / 业务异常 的错误结构
 * - 重试边界：GET 在超时/网络/5xx 自动重试，POST 不重试，业务错误不重试
 * - failCount 场景：前 N 次失败后自动重试成功（retried 标记）
 * - 重新请求：调用方再次调用时状态独立、参数保持
 * - 真实接口切换：VITE_USE_MOCK=false 时走 fetch，响应体规范化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  request,
  configureHttp,
  resetHttpConfig,
  setMockRequestScenario,
  resetMockRequestState,
  setMockRequestDelay,
  ERROR_CODES
} from '../utils/http'
import { api } from '../utils/api'

describe('HTTP 统一请求层 - 模拟通道', () => {
  beforeEach(() => {
    configureHttp({ useMock: true, retryCount: 1, retryDelay: 1, timeout: 2000 })
    setMockRequestDelay(0)
    resetMockRequestState()
  })

  it('成功：返回统一信封结构 success/data/error/code/retried', async () => {
    const result = await request('/tables')

    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.error).toBeNull()
    expect(result.code).toBeNull()
    expect(result.retried).toBe(0)
  })

  it('空数据：空数组仍为成功响应，不进入错误分支', async () => {
    setMockRequestScenario('empty')
    const result = await request('/tables')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('超时：返回 TIMEOUT 错误码与统一文案', async () => {
    setMockRequestScenario('timeout')
    configureHttp({ retryCount: 0 })

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.TIMEOUT)
    expect(result.error).toContain('超时')
  })

  it('网络异常：返回 NETWORK 错误码', async () => {
    setMockRequestScenario('network')
    configureHttp({ retryCount: 0 })

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.NETWORK)
    expect(result.error).toContain('网络')
  })

  it('服务端异常：返回 HTTP_ERROR 与状态码 500', async () => {
    setMockRequestScenario('error')
    configureHttp({ retryCount: 0 })

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.HTTP)
    expect(result.status).toBe(500)
  })

  it('业务异常：BUSINESS_ERROR 不可重试，retried 始终为 0', async () => {
    setMockRequestScenario('business')

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.BUSINESS)
    expect(result.retried).toBe(0)
  })

  it('重试边界：GET 超时后自动重试，全部失败时 retried=1', async () => {
    setMockRequestScenario('timeout')
    configureHttp({ retryCount: 1, retryDelay: 1 })

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.retried).toBe(1)
    expect(result.code).toBe(ERROR_CODES.TIMEOUT)
  })

  it('重新请求恢复：前 1 次失败后重试成功，retried=1', async () => {
    // failCount=1：首次命中 timeout，第二次恢复正常 → 自动重试恰好成功
    setMockRequestScenario('timeout', { failCount: 1 })
    configureHttp({ retryCount: 2, retryDelay: 1 })

    const result = await request('/tables')

    expect(result.success).toBe(true)
    expect(result.retried).toBe(1)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('写操作不自动重试：POST 超时直接失败，retried=0', async () => {
    setMockRequestScenario({ '/auth/login': 'timeout' })
    configureHttp({ retryCount: 3, retryDelay: 1 })

    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'user', password: '123456' })
    })

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.TIMEOUT)
    expect(result.retried).toBe(0)
  })

  it('重新请求：业务错误后调用方再次发起 POST 可成功', async () => {
    // 登录连续失败（账号错误）
    const failed = await api.login('user', 'wrong')
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('密码')

    // 写操作由用户重新触发，不依赖自动重试
    const success = await api.login('user', '123456')
    expect(success.success).toBe(true)
    expect(success.data.token).toMatch(/^mock_token_/)
  })

  it('按接口粒度注入场景：仅 /tables 为空，其他接口不受影响', async () => {
    setMockRequestScenario({ '/tables': 'empty' })

    const tables = await request('/tables')
    const courses = await request('/courses')

    expect(tables.data).toEqual([])
    expect(courses.success).toBe(true)
    expect(courses.data.length).toBeGreaterThan(0)
  })
})

describe('HTTP 统一请求层 - 真实通道（fetch）', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    resetHttpConfig()
    resetMockRequestState()
  })

  function stubFetch(responseFactory) {
    const fetchMock = vi.fn(responseFactory)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('切换真实接口：2xx + 业务数据 → 成功信封', async () => {
    configureHttp({ useMock: false, retryCount: 0 })
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify([{ id: 1 }, { id: 2 }]))
      })
    )

    const result = await request('/tables')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('真实接口标准信封 { success, data } 会被解包', async () => {
    configureHttp({ useMock: false, retryCount: 0 })
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ success: true, data: { id: 'U1' } }))
      })
    )

    const result = await request('/user/profile')
    expect(result.data).toEqual({ id: 'U1' })
  })

  it('真实接口 4xx：业务错误不重试，展示服务端文案', async () => {
    configureHttp({ useMock: false, retryCount: 2, retryDelay: 1 })
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ error: '预约时间冲突' }))
      })
    )

    const result = await request('/bookings', { method: 'POST', body: {} })

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.BUSINESS)
    expect(result.error).toBe('预约时间冲突')
    expect(fetchMock).toHaveBeenCalledTimes(1) // POST 不重试
  })

  it('真实接口 5xx：GET 自动重试后仍失败，返回 HTTP_ERROR', async () => {
    configureHttp({ useMock: false, retryCount: 1, retryDelay: 1 })
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('')
      })
    )

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.HTTP)
    expect(result.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('真实接口网络异常：fetch reject → NETWORK，GET 自动重试', async () => {
    configureHttp({ useMock: false, retryCount: 1, retryDelay: 1 })
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.NETWORK)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('真实接口超时：AbortController 触发 TIMEOUT', async () => {
    configureHttp({ useMock: false, retryCount: 0, timeout: 30 })

    vi.stubGlobal(
      'fetch',
      vi.fn((url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new DOMException('The operation was aborted.', 'AbortError')
          reject(err)
        })
      }))
    )

    const result = await request('/tables')

    expect(result.success).toBe(false)
    expect(result.code).toBe(ERROR_CODES.TIMEOUT)
  }, 10000)

  it('真实接口携带 Authorization 头与查询参数', async () => {
    configureHttp({ useMock: false, retryCount: 0 })
    localStorage.setItem('billiard_token', 'real_token_123')
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ success: true, data: [] }))
      })
    )

    await request('/products', { params: { category: 'cue', sort: 'price-asc' } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/products?')
    expect(url).toContain('category=cue')
    expect(url).toContain('sort=price-asc')
    expect(init.headers.Authorization).toBe('Bearer real_token_123')
  })
})
