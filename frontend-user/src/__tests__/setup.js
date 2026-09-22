/**
 * Vitest 全局测试设置
 * - 模拟环境下关闭网络延迟，保证用例快速稳定
 * - 每个用例后重置模拟场景，避免场景串扰
 */
import { beforeEach, afterEach, vi } from 'vitest'
import { resetMockRequestState, setMockRequestDelay, resetHttpConfig } from '../utils/http'

beforeEach(() => {
  resetHttpConfig()
  resetMockRequestState()
  setMockRequestDelay(0)
})

afterEach(() => {
  vi.restoreAllMocks()
  resetHttpConfig()
  resetMockRequestState()
})
