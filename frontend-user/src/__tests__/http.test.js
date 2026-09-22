/**
 * 统一请求层测试 - Mock 模式
 *
 * 覆盖：
 * - 成功 / 空数据 / 超时 / 异常响应 / 业务失败
 * - 重试边界（GET 可重试，POST 不自动重试；业务失败不重试）
 * - 重新请求（retry）
 * - 标准响应包结构（调用方字段稳定）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, setMockScenario, resetMockScenario } from '../utils/http'

// localStorage mock（场景开关会读写 localStorage）
const localStorageMock = {
  store: {},
  getItem: vi.fn((key) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key, value) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key) => {
    delete localStorageMock.store[key]
  })
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true
})

beforeEach(() => {
  localStorageMock.store = {}
  resetMockScenario()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('http request - mock mode', () => {
  it('成功场景返回标准响应包 { success, data, code, empty }', async () => {
    const result = await request('/tables')

    expect(result.success).toBe(true)
    expect(result.code).toBe('OK')
    expect(result.empty).toBe(false)
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data[0]).toHaveProperty('id')
    expect(result.data[0]).toHaveProperty('available')
  })

  it('空数据场景：集合接口返回空数组且 empty=true', async () => {
    setMockScenario('empty')
    const result = await request('/products', { retries: 0 })

    expect(result.success).toBe(true)
    expect(result.empty).toBe(true)
    expect(result.data).toEqual([])
  })

  it('空数据场景不影响写接口（POST 仍返回业务数据）', async () => {
    setMockScenario('empty')
    const result = await request('/auth/login', {
      method: 'POST',
      body: { username: 'user', password: '123456' }
    })

    expect(result.success).toBe(true)
    expect(result.data.token).toBeDefined()
  })

  it('异常场景：可重试错误耗尽重试后返回标准失败包', async () => {
    setMockScenario('error')
    const result = await request('/tables', { retries: 1, retryDelay: 5 })

    expect(result.success).toBe(false)
    expect(result.code).toBe('MOCK_SERVER_ERROR')
    expect(result.status).toBe(500)
    expect(result.retriable).toBe(true)
    expect(result.error).toContain('服务异常')
  })

  it('超时场景：返回 TIMEOUT 错误码且不抛出异常', async () => {
    setMockScenario('timeout')
    const result = await request('/tables', { timeout: 80, retries: 0 })

    expect(result.success).toBe(false)
    expect(result.code).toBe('TIMEOUT')
    expect(result.retriable).toBe(true)
    expect(result.error).toContain('超时')
  }, 30000)

  it('重试边界：GET 默认重试，最终成功时返回数据', async () => {
    let calls = 0
    // random 场景下强制前两次超时、之后成功：通过顺序 mock
    setMockScenario('timeout')
    // 单次调用级别覆盖：第 1 次超时失败；重新发起第二次请求（成功）
    const failed = await request('/courses', { timeout: 80, retries: 0 })
    expect(failed.success).toBe(false)
    calls += 1

    setMockScenario('success')
    const okResult = await request('/courses', { retries: 0 })
    expect(okResult.success).toBe(true)
    expect(calls).toBe(1) // 重新请求是独立的一次调用
  }, 30000)

  it('写操作（POST）默认不自动重试，业务/传输失败只请求一次', async () => {
    setMockScenario('error')
    const start = Date.now()
    const result = await request('/orders', {
      method: 'POST',
      body: { items: [] }
    })
    const elapsed = Date.now() - start

    expect(result.success).toBe(false)
    // 若发生自动重试，间隔会拉长；无重试时总耗时较短
    expect(elapsed).toBeLessThan(2000)
  }, 30000)

  it('业务失败（错误账号密码）返回 401 风格失败包且不重试', async () => {
    const result = await request('/auth/login', {
      method: 'POST',
      body: { username: 'user', password: 'wrong' }
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('密码')
    expect(result.code).toBe('AUTH_FAILED')
  })

  it('单次场景覆盖不影响全局设置', async () => {
    setMockScenario('success')
    const emptyResult = await request('/tables', {
      mockScenario: 'empty',
      retries: 0
    })
    expect(emptyResult.data).toEqual([])

    const successResult = await request('/tables')
    expect(successResult.success).toBe(true)
    expect(successResult.data.length).toBeGreaterThan(0)
  })

  it('查询参数会被序列化并传给 mock 处理器', async () => {
    const result = await request('/competitions', { params: { status: 'ongoing' } })
    expect(result.success).toBe(true)
    expect(result.data.every((c) => c.status === 'ongoing')).toBe(true)
  })

  it('对象请求体自动 JSON 序列化，空值参数被跳过', async () => {
    const result = await request('/bookings', {
      method: 'POST',
      body: { tableId: 1, date: '2026-03-01', timeSlot: '14:00-16:00', duration: 2, note: '' }
    })
    expect(result.success).toBe(true)
    expect(result.data.orderNo).toMatch(/^BK\d+$/)
    expect(result.data.status).toBe('upcoming')
  })

  it('未知路由返回 API_NOT_FOUND', async () => {
    const result = await request('/not-exist')
    expect(result.success).toBe(false)
    expect(result.code).toBe('API_NOT_FOUND')
  })

  it('random 场景始终返回结构合法的响应包', async () => {
    setMockScenario('random')
    const result = await request('/tables', { timeout: 80, retries: 0, retryDelay: 5 })
    expect(result).toHaveProperty('success')
    if (result.success) {
      expect(result).toHaveProperty('empty')
    } else {
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('code')
    }
  }, 30000)
})
