/**
 * useRequest / useAction 状态机测试
 *
 * 覆盖页面统一加载规则：
 * - 首次加载 loading → success；数据映射、空数据判定
 * - 失败 error 状态 + 错误文案/错误码；retry 沿用上一次参数
 * - 重新请求为 refreshing（保留旧数据）
 * - 过期并发请求的结果被丢弃
 * - useAction 写操作 pending/成功/失败反馈，不抛异常
 */

import { describe, it, expect, vi } from 'vitest'
import { useRequest, useAction } from '../utils/useRequest'

function successfulEnvelope(data, ms = 0) {
  return () =>
    new Promise(resolve => setTimeout(() => resolve({ success: true, data, error: null, code: null, retried: 0 }), ms))
}

function failedEnvelope(error, code = 'BUSINESS_ERROR', ms = 0) {
  return () =>
    new Promise(resolve =>
      setTimeout(() => resolve({ success: false, data: null, error, code, retried: 0 }), ms)
    )
}

describe('useRequest 状态机', () => {
  it('初始为 idle，run 后经历 loading 并写入数据', async () => {
    const res = useRequest(successfulEnvelope([{ id: 1 }]))

    expect(res.status).toBe('idle')
    expect(res.loading).toBe(false)

    const promise = res.run()
    expect(res.loading).toBe(true)
    expect(res.status).toBe('loading')

    await promise

    expect(res.loading).toBe(false)
    expect(res.status).toBe('success')
    expect(res.data).toEqual([{ id: 1 }])
    expect(res.loaded).toBe(true)
  })

  it('空数组被识别为空数据（success 而非 error）', async () => {
    const res = useRequest(successfulEnvelope([]), { initialData: [] })
    await res.run()

    expect(res.status).toBe('success')
    expect(res.data).toEqual([])
  })

  it('失败：进入 error 状态并保留错误文案与错误码', async () => {
    const res = useRequest(failedEnvelope('请求超时，请稍后重试', 'TIMEOUT'))
    await res.run()

    expect(res.status).toBe('error')
    expect(res.loading).toBe(false)
    expect(res.error).toBe('请求超时，请稍后重试')
    expect(res.errorCode).toBe('TIMEOUT')
  })

  it('重试：retry 沿用上一次参数并恢复成功', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(failedEnvelope('网络异常', 'NETWORK'))
      .mockImplementationOnce(successfulEnvelope({ ok: true }))

    const res = useRequest(fetcher)
    await res.run({ id: 42 })

    expect(res.status).toBe('error')

    await res.retry()

    expect(res.status).toBe('success')
    expect(res.data).toEqual({ ok: true })
    // 两次调用参数一致
    expect(fetcher.mock.calls[0][0]).toEqual({ id: 42 })
    expect(fetcher.mock.calls[1][0]).toEqual({ id: 42 })
  })

  it('重新请求：已有数据时进入 refreshing，成功后保留可见数据', async () => {
    const res = useRequest(successfulEnvelope([{ id: 1 }], 5))
    await res.run()

    const refreshing = res.run({ page: 2 })
    expect(res.refreshing).toBe(true)
    expect(res.status).toBe('refreshing')
    // 旧数据保留
    expect(res.data).toEqual([{ id: 1 }])

    await refreshing
    expect(res.refreshing).toBe(false)
    expect(res.status).toBe('success')
  })

  it('失败时不覆盖已有数据，页面可继续展示旧内容', async () => {
    const res = useRequest(
      vi
        .fn()
        .mockImplementationOnce(successfulEnvelope([{ id: 1 }]))
        .mockImplementationOnce(failedEnvelope('服务异常', 'HTTP_ERROR'))
    )

    await res.run()
    await res.run()

    expect(res.status).toBe('error')
    expect(res.error).toBe('服务异常')
    expect(res.data).toEqual([{ id: 1 }])
  })

  it('过期并发：后发请求先返回时，先发结果被丢弃', async () => {
    let resolveSlow
    const slow = () => new Promise(resolve => (resolveSlow = resolve))
    const fast = successfulEnvelope([{ id: 'fast' }])

    const fetcher = vi.fn().mockImplementationOnce(slow).mockImplementationOnce(fast)
    const res = useRequest(fetcher)

    const p1 = res.run('first')
    const p2 = res.run('second')
    await p2
    resolveSlow({ success: true, data: [{ id: 'slow' }], error: null, code: null, retried: 0 })
    await p1

    // 最终数据来自后发请求
    expect(res.data).toEqual([{ id: 'fast' }])
  })

  it('reset 回到初始状态', async () => {
    const res = useRequest(successfulEnvelope([1]), { initialData: [] })
    await res.run()
    res.reset()

    expect(res.status).toBe('idle')
    expect(res.loaded).toBe(false)
    expect(res.data).toEqual([])
    expect(res.error).toBeNull()
  })
})

describe('useAction 写操作', () => {
  it('成功：pending 结束、success=true、记录 data', async () => {
    const action = useAction(() =>
      Promise.resolve({ success: true, data: { orderNo: 'SP1' }, error: null, code: null })
    )

    const pending = action.execute({ a: 1 })
    expect(action.pending).toBe(true)

    const result = await pending
    expect(result.success).toBe(true)
    expect(action.pending).toBe(false)
    expect(action.success).toBe(true)
    expect(action.data.orderNo).toBe('SP1')
  })

  it('失败：返回失败信封且不抛出，pending 复位，错误可用于提示', async () => {
    const action = useAction(() =>
      Promise.resolve({ success: false, data: null, error: '库存不足', code: 'BUSINESS_ERROR' })
    )

    const result = await action.execute({})
    expect(result.success).toBe(false)
    expect(action.pending).toBe(false)
    expect(action.error).toBe('库存不足')
  })

  it('异常：executor 抛错时被收敛为失败信封，不会导致页面崩溃', async () => {
    const action = useAction(() => Promise.reject(new Error('unexpected')))

    const result = await action.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toBe('unexpected')
    expect(action.pending).toBe(false)
  })
})
