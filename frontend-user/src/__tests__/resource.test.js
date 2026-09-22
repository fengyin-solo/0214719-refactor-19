/**
 * 页面状态工厂测试
 *
 * 覆盖统一加载规则：
 * - createListResource：idle/loading/success/error/empty、重新请求、静默刷新保留旧数据、竞态丢弃
 * - createAction：loading 边界与失败结果
 */

import { describe, it, expect, vi } from 'vitest'
import { createListResource, createAction } from '../utils/http'

function delayed(payload, ms) {
  return new Promise((resolve) => setTimeout(() => resolve(payload), ms))
}

describe('createListResource', () => {
  it('成功加载后状态为 success，数据写入 data', async () => {
    const res = createListResource(async () => ({
      success: true,
      data: [{ id: 1 }],
      empty: false,
      code: 'OK'
    }))

    expect(res.status).toBe('idle')
    const promise = res.run()
    expect(res.loading).toBe(true)
    expect(res.status).toBe('loading')

    const result = await promise
    expect(result.success).toBe(true)
    expect(res.loading).toBe(false)
    expect(res.status).toBe('success')
    expect(res.data).toEqual([{ id: 1 }])
  })

  it('空数据加载设置 empty=true', async () => {
    const res = createListResource(async () => ({ success: true, data: [], empty: true }))
    await res.run()

    expect(res.status).toBe('success')
    expect(res.empty).toBe(true)
  })

  it('首次加载失败进入 error 态并保留错误文案', async () => {
    const res = createListResource(async () => ({
      success: false,
      error: '服务器开小差了',
      code: 'HTTP_500'
    }))
    await res.run()

    expect(res.status).toBe('error')
    expect(res.loading).toBe(false)
    expect(res.error).toBe('服务器开小差了')
    expect(res.data).toEqual([])
  })

  it('retry 使用上次参数重新请求并恢复成功', async () => {
    let shouldFail = true
    const loader = vi.fn(async (params) => {
      if (shouldFail) return { success: false, error: 'fail', code: 'E' }
      return { success: true, data: [{ date: params.date }], empty: false }
    })
    const res = createListResource(loader)

    await res.run({ date: '2026-03-01' })
    expect(res.status).toBe('error')

    shouldFail = false
    await res.retry()

    expect(res.status).toBe('success')
    expect(res.data[0].date).toBe('2026-03-01')
    expect(loader).toHaveBeenCalledWith({ date: '2026-03-01' }, expect.any(Object))
  })

  it('静默刷新失败时保留旧数据，状态保持 success，并回调 onError', async () => {
    let n = 0
    const onError = vi.fn()
    const res2 = createListResource(async () => {
      n += 1
      if (n === 1) return { success: true, data: [{ id: 'keep' }], empty: false }
      return { success: false, error: '刷新失败', code: 'E' }
    })

    await res2.run()
    const result = await res2.run({}, { silent: true, onError })

    expect(result.success).toBe(false)
    expect(res2.status).toBe('success')
    expect(res2.data).toEqual([{ id: 'keep' }])
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('后发先至的旧响应不会覆盖新数据（竞态保护）', async () => {
    const res = createListResource((params) => delayed(params.payload, params.ms))
    const oldRequest = res.run({ ms: 30, payload: { success: true, data: ['old'], empty: false } })
    const newRequest = res.run({ ms: 5, payload: { success: true, data: ['new'], empty: false } })

    await Promise.all([oldRequest, newRequest])
    expect(res.data).toEqual(['new'])
  })
})

describe('createAction', () => {
  it('执行期间 loading=true，完成后恢复，并返回响应包', async () => {
    const action = createAction(async (value) => ({ success: true, data: { value } }))

    const promise = action.run(42)
    expect(action.loading).toBe(true)
    const result = await promise

    expect(action.loading).toBe(false)
    expect(result.success).toBe(true)
    expect(result.data.value).toBe(42)
  })

  it('失败时记录错误文案，不抛出异常', async () => {
    const action = createAction(async () => ({ success: false, error: '取消失败', code: 'X' }))
    const result = await action.run()

    expect(result.success).toBe(false)
    expect(action.loading).toBe(false)
    expect(action.error).toBe('取消失败')
    expect(action.code).toBe('X')
  })
})
