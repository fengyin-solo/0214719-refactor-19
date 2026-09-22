/**
 * 统一的请求状态机（Options API / Composition API 通用）
 *
 * 收敛各页面重复的 loading/error/data 解析逻辑，所有页面共用同一套加载规则：
 * - 状态：idle → loading（首次加载）/ refreshing（重新请求，保留旧数据）→ success/error
 * - run(params)        首次或带新参数请求；过期的并发请求结果会被自动丢弃
 * - retry()            沿用上一次参数重新请求（失败页"重试"按钮）
 * - reset()            回到初始状态
 *
 * 错误反馈与重试边界由 utils/http.js 保证（超时/网络/5xx 自动重试仅作用于 GET），
 * 本模块只负责把结果映射为页面可直接使用的状态。
 *
 * Options API 用法：
 *   data() {
 *     return { tablesRes: useRequest(params => api.getTables(params), { empty: r => !r?.length }) }
 *   },
 *   mounted() { this.tablesRes.run({ date: this.selectedDate }) }
 */

import { reactive } from 'vue'
import { logger } from './logger'

/**
 * @template T
 * @param {(params: any) => Promise<{success: boolean, data?: T, error?: string|null, code?: string|null, retried?: number}>} fetcher
 * @param {Object} [options]
 * @param {any} [options.initialData=null] 初始数据
 * @param {(data: T) => boolean} [options.empty] 自定义空数据判定（默认 null/undefined/[]）
 */
export function useRequest(fetcher, options = {}) {
  const { initialData = null } = options

  const state = reactive({
    /** idle | loading | refreshing | success | error */
    status: 'idle',
    loading: false,
    refreshing: false,
    data: initialData,
    /** 最近一次错误文案（success 时为 null） */
    error: null,
    /** 最近一次错误码（TIMEOUT/NETWORK/HTTP_ERROR/BUSINESS_ERROR/ABORTED） */
    errorCode: null,
    /** 本次加载实际发生的自动重试次数 */
    retried: 0,
    /** 是否已请求过（区分"未加载"与"空数据"） */
    loaded: false
  })

  let lastParams
  let requestSeq = 0

  async function run(params) {
    lastParams = params === undefined ? lastParams : params
    const seq = ++requestSeq
    const firstLoad = !state.loaded

    state.loading = true
    state.error = null
    state.errorCode = null
    if (firstLoad) {
      state.status = 'loading'
      state.refreshing = false
    } else {
      state.status = 'refreshing'
      state.refreshing = true
    }

    try {
      const result = await fetcher(lastParams)
      // 已有更新的请求发出，丢弃本次过期结果
      if (seq !== requestSeq) return result

      state.retried = result.retried || 0

      if (result.success) {
        state.data = result.data === undefined ? null : result.data
        state.status = 'success'
      } else {
        // 失败时保留已有数据，避免整页被错误页覆盖
        state.error = result.error || '请求失败，请稍后重试'
        state.errorCode = result.code
        state.status = 'error'
        logger.warn('Request failed', { error: state.error, code: state.errorCode })
      }
      return result
    } catch (e) {
      if (seq !== requestSeq) return
      state.error = e.message || '网络请求失败，请稍后重试'
      state.errorCode = e.code || 'BUSINESS_ERROR'
      state.status = 'error'
      logger.error('Request exception', e)
    } finally {
      if (seq === requestSeq) {
        state.loading = false
        state.refreshing = false
        state.loaded = true
      }
    }
  }

  /** 按上一次参数重新请求；从未请求过时按无参数发起 */
  function retry() {
    return run(lastParams)
  }

  function reset() {
    requestSeq++
    state.status = 'idle'
    state.loading = false
    state.refreshing = false
    state.data = initialData
    state.error = null
    state.errorCode = null
    state.retried = 0
    state.loaded = false
    lastParams = undefined
  }

  return Object.assign(state, { run, retry, reset })
}

/**
 * 写操作（POST/PUT/DELETE）状态机
 *
 * 写操作不做自动重试，由用户在失败后重新触发（同一弹窗内再次点击即可）。
 *
 * 用法：
 *   data() { return { booking: useAction(data => api.bookTable(data)) } },
 *   methods: {
 *     async confirm() {
 *       const res = await this.booking.execute(payload)
 *       if (res?.success) { ... }
 *     }
 *   }
 */
export function useAction(executor) {
  const state = reactive({
    pending: false,
    /** 最近一次执行是否成功（用于成功/失败反馈） */
    success: false,
    error: null,
    errorCode: null,
    /** 最近一次成功返回的数据 */
    data: null
  })

  function reset() {
    state.pending = false
    state.success = false
    state.error = null
    state.errorCode = null
    state.data = null
  }

  async function execute(payload) {
    state.pending = true
    state.error = null
    state.errorCode = null
    state.success = false

    try {
      const result = await executor(payload)
      if (result && result.success) {
        state.success = true
        state.data = result.data
      } else {
        state.error = result?.error || '操作失败，请稍后重试'
        state.errorCode = result?.code || 'BUSINESS_ERROR'
        logger.warn('Action failed', { error: state.error, code: state.errorCode })
      }
      return result
    } catch (e) {
      state.error = e.message || '网络异常，请稍后重试'
      state.errorCode = e.code || 'NETWORK'
      logger.error('Action exception', e)
      return { success: false, error: state.error, code: state.errorCode }
    } finally {
      state.pending = false
    }
  }

  return Object.assign(state, { execute, reset })
}

export default useRequest
