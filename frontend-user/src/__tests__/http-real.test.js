/**
 * 统一请求层测试 - 真实接口模式（通过注入 transport 使用 mock fetch）
 *
 * 验证真实接口切换后：
 * - 后端标准包 { success, data } 可直接使用
 * - 裸数组/裸对象响应会被统一包装
 * - HTTP 4xx/5xx、非 JSON 错误、网络失败均归一化为标准失败包
 * - 5xx 自动重试，4xx / 业务失败不重试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request } from '../utils/http'

// localStorage mock（Authorization 头会读取 token）
const localStorageMock = {
  store: { billiard_token: 'real_token' },
  getItem: vi.fn((key) => localStorageMock.store[key] ?? null),
  setItem: vi.fn(),
  removeItem: vi.fn()
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true
})

/**
 * 构造一个真实 fetch 的 mock Response
 */
function mockResponse(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Status',
    headers: new Headers(headers),
    text: vi.fn(async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)))
  }
}

/**
 * 真实接口传输：内部走 httpCall 的 fetch 分支
 * 这里通过 options.transport 注入包装函数，内部调用全局 fetch
 */
const realTransport = (ctx, signal) => realRequest(ctx, signal)

async function realRequest(ctx, signal) {
  // 复用模块内 httpCall：通过全局 fetch mock 驱动
  // httpCall 由 request 在 USE_MOCK=false 时选择；测试里通过 transport 注入
  return injectedHttpCall(ctx, signal)
}

import { httpCall as injectedHttpCall } from '../utils/http'

describe('http request - real API mode', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('后端标准包 { success, data } 直接透传为统一结构', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { success: true, data: [{ id: 1 }] }))

    const result = await request('/tables', { transport: realTransport, retries: 0 })

    expect(result.success).toBe(true)
    expect(result.code).toBe('OK')
    expect(result.data).toEqual([{ id: 1 }])
    expect(result.empty).toBe(false)
  })

  it('后端返回裸数组时统一包装，调用方仍读取 result.data', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, [{ id: 1 }, { id: 2 }]))

    const result = await request('/products', { transport: realTransport, retries: 0 })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })

  it('后端返回空数组时 empty=true', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, []))

    const result = await request('/courses', { transport: realTransport, retries: 0 })

    expect(result.success).toBe(true)
    expect(result.empty).toBe(true)
  })

  it('后端业务包 success=false 时返回标准失败包且不重试', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(200, { success: false, code: 'STOCK_EMPTY', error: '库存不足' })
    )

    const result = await request('/orders', {
      method: 'POST',
      body: { items: [] },
      transport: realTransport
    })

    expect(result.success).toBe(false)
    expect(result.code).toBe('STOCK_EMPTY')
    expect(result.error).toBe('库存不足')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 响应不重试，返回友好错误信息与 HTTP 状态码', async () => {
    fetchMock.mockResolvedValue(mockResponse(404, { error: '资源不存在' }))

    const result = await request('/tables', { transport: realTransport, retries: 2, retryDelay: 1 })

    expect(result.success).toBe(false)
    expect(result.status).toBe(404)
    expect(result.retriable).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('503 响应触发自动重试，耗尽后返回失败包', async () => {
    fetchMock.mockResolvedValue(mockResponse(503, { error: 'busy' }))

    const result = await request('/tables', { transport: realTransport, retries: 2, retryDelay: 1 })

    expect(result.success).toBe(false)
    expect(result.status).toBe(503)
    expect(result.retriable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('503 重试期间恢复成功，返回成功包', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(503, { error: 'busy' }))
      .mockResolvedValueOnce(mockResponse(200, { success: true, data: [{ id: 9 }] }))

    const result = await request('/tables', { transport: realTransport, retries: 2, retryDelay: 1 })

    expect(result.success).toBe(true)
    expect(result.data[0].id).toBe(9)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('网络失败归一化为 NETWORK_ERROR（可重试）', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await request('/tables', { transport: realTransport, retries: 1, retryDelay: 1 })

    expect(result.success).toBe(false)
    expect(result.code).toBe('NETWORK_ERROR')
    expect(result.retriable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('超时：fetch 收到 abort 信号后返回 TIMEOUT', async () => {
    fetchMock.mockImplementation((url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    )

    const result = await request('/tables', {
      transport: realTransport,
      timeout: 50,
      retries: 0
    })

    expect(result.success).toBe(false)
    expect(result.code).toBe('TIMEOUT')
  }, 10000)

  it('请求携带 Authorization 头与 JSON Content-Type', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, { success: true, data: {} }))

    await request('/user/profile', {
      method: 'PUT',
      body: { name: '李四' },
      transport: realTransport,
      retries: 0
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer real_token')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ name: '李四' })
  })

  it('查询参数拼接到 URL，空值参数被跳过', async () => {
    fetchMock.mockResolvedValue(mockResponse(200, []))

    await request('/products', {
      params: { category: 'cue', sort: '', page: 2 },
      transport: realTransport,
      retries: 0
    })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/products?')
    expect(url).toContain('category=cue')
    expect(url).toContain('page=2')
    expect(url).not.toContain('sort=')
  })

  it('非 JSON 错误响应返回 HTTP 状态文案', async () => {
    fetchMock.mockResolvedValue(mockResponse(500, 'Internal Server Error'))

    const result = await request('/tables', { transport: realTransport, retries: 0 })

    expect(result.success).toBe(false)
    expect(result.code).toBe('HTTP_500')
  })
})
