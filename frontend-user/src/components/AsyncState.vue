<template>
  <!--
    统一异步状态容器：加载 / 重新请求 / 空数据 / 异常 / 超时 / 成功
    与 utils/useRequest.js 配套，页面无需再各自编写重复的状态分支。
    同一时刻只渲染一个分支，空数据/失败时不渲染默认内容。
  -->
  <!-- 首次加载 -->
  <div v-if="showLoading" class="async-state">
    <slot name="loading" :state="state">
      <div class="async-loading">
        <div class="async-spinner"></div>
        <span>{{ loadingText }}</span>
      </div>
    </slot>
  </div>

  <!-- 异常 / 超时（无旧数据可展示）：统一重试入口 -->
  <div v-else-if="showError" class="async-state">
    <slot name="error" :state="state" :retry="state.retry">
      <div class="async-error">
        <div class="async-error-icon">{{ isTimeout ? '⏱️' : '⚠️' }}</div>
        <p class="async-error-msg">{{ state.error }}</p>
        <p class="async-error-hint">{{ isTimeout ? '请求超时，请检查网络后重试' : '请检查网络或稍后再试' }}</p>
        <button class="async-retry-btn" type="button" @click="state.retry()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {{ isTimeout ? '重新请求' : '重试' }}
        </button>
      </div>
    </slot>
  </div>

  <!-- 空数据：成功响应但无内容 -->
  <div v-else-if="showEmpty" class="async-state">
    <slot name="empty" :state="state">
      <div class="async-empty">
        <div class="async-empty-icon">{{ emptyIcon }}</div>
        <p>{{ emptyText }}</p>
      </div>
    </slot>
  </div>

  <!-- 成功内容；重新请求时以浅色遮罩提示，旧数据仍然可见 -->
  <div v-else class="async-content" :class="{ refreshing: state.refreshing }">
    <slot :state="state" :data="state.data" />

    <div v-if="state.refreshing" class="async-refresh-bar">
      <div class="async-spinner small"></div>
      <span>正在刷新...</span>
    </div>
  </div>
</template>

<script>
import { ERROR_CODES } from '../utils/http'

export default {
  name: 'AsyncState',
  props: {
    /** useRequest 返回的状态对象 */
    state: { type: Object, required: true },
    /** 是否有可展示数据；默认按 null/空数组判定 */
    hasData: { type: Boolean, default: null },
    loadingText: { type: String, default: '加载中...' },
    emptyText: { type: String, default: '暂无数据' },
    emptyIcon: { type: String, default: '📭' }
  },
  computed: {
    isTimeout() {
      return this.state.errorCode === ERROR_CODES.TIMEOUT
    },
    dataAvailable() {
      if (this.hasData !== null) return this.hasData
      const data = this.state.data
      if (data == null) return false
      if (Array.isArray(data)) return data.length > 0
      if (typeof data === 'object') return Object.keys(data).length > 0
      return true
    },
    showLoading() {
      // 首次加载（尚未成功过且没有旧数据）整页 loading
      return this.state.loading && !this.state.refreshing && !this.dataAvailable
    },
    showError() {
      return this.state.status === 'error' && !this.dataAvailable
    },
    showEmpty() {
      return this.state.status === 'success' && !this.dataAvailable
    }
  }
}
</script>

<style scoped>
.async-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  min-height: 200px;
}

.async-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.async-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: async-spin 0.8s linear infinite;
}

.async-spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@keyframes async-spin {
  to { transform: rotate(360deg); }
}

.async-content {
  position: relative;
}

.async-content.refresh::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.async-refresh-bar {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.8rem;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  z-index: 5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.async-empty {
  text-align: center;
  color: var(--text-muted);
}

.async-empty-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  opacity: 0.6;
}

.async-empty p {
  font-size: 0.9rem;
}

.async-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.async-error-icon {
  font-size: 2.5rem;
  margin-bottom: 0.25rem;
}

.async-error-msg {
  color: var(--text-primary);
  font-size: 0.95rem;
}

.async-error-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.async-retry-btn {
  margin-top: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(0, 217, 165, 0.1);
  border: 1px solid rgba(0, 217, 165, 0.3);
  color: var(--primary);
  padding: 0.55rem 1.25rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.async-retry-btn:hover {
  background: rgba(0, 217, 165, 0.18);
}

.async-retry-btn svg {
  width: 15px;
  height: 15px;
}
</style>
