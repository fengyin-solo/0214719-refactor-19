<!--
  RequestState.vue - 统一请求状态展示

  功能：
  - loading：列表加载骨架/旋转器（支持 overlay 模式覆盖在内容上）
  - error：错误提示 + 重新请求按钮（统一错误反馈与重试边界）
  - empty：空数据占位
  - success：直接渲染默认插槽

  与 createListResource 配合使用：
  <RequestState :resource="tableRes" @retry="tableRes.retry()">
    <div v-for="item in tableRes.data">...</div>
  </RequestState>
-->
<template>
  <div class="request-state" :class="{ overlay, compact }">
    <!-- 加载中 -->
    <div v-if="loading && !hasData" class="state-block" :class="overlay ? 'overlay' : ''">
      <div class="loading-spinner"></div>
      <span class="state-text">{{ loadingText }}</span>
    </div>

    <!-- 加载失败（无本地数据） -->
    <div v-else-if="error && !hasData" class="state-block">
      <div class="state-icon">⚠️</div>
      <p class="state-title">加载失败</p>
      <p class="state-desc">{{ error }}</p>
      <button class="retry-btn" @click="$emit('retry')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        重新加载
      </button>
    </div>

    <!-- 空数据 -->
    <div v-else-if="empty && !hasData && !hideEmpty" class="state-block">
      <div class="state-icon">{{ emptyIcon }}</div>
      <p class="state-title">{{ emptyTitle }}</p>
      <p v-if="emptyDesc" class="state-desc">{{ emptyDesc }}</p>
    </div>

    <!-- 成功 / 有数据（或页面接管空状态）时渲染内容 -->
    <slot v-else />

    <!-- 静默刷新中的遮罩（保留旧数据） -->
    <div v-if="loading && hasData && overlay" class="state-block overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RequestState',
  props: {
    /** createListResource 返回的响应式资源 */
    resource: { type: Object, required: true },
    /** 覆盖在内容上的加载样式（如球桌列表切换日期） */
    overlay: { type: Boolean, default: false },
    /** 紧凑模式（用于卡片内嵌区域） */
    compact: { type: Boolean, default: false },
    loadingText: { type: String, default: '加载中...' },
    emptyIcon: { type: String, default: '📭' },
    emptyTitle: { type: String, default: '暂无数据' },
    emptyDesc: { type: String, default: '' },
    /** 隐藏内置空数据占位（页面自行渲染空状态时使用，如赛事页按标签定制） */
    hideEmpty: { type: Boolean, default: false }
  },
  emits: ['retry'],
  computed: {
    loading() {
      return this.resource.loading
    },
    error() {
      return this.resource.error
    },
    empty() {
      return this.resource.empty
    },
    hasData() {
      return Array.isArray(this.resource.data) ? this.resource.data.length > 0 : !!this.resource.data
    }
  }
}
</script>

<style scoped>
.request-state {
  position: relative;
}

.request-state.overlay {
  min-height: 200px;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 1rem;
  text-align: center;
}

.state-block.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(10, 10, 15, 0.35);
  backdrop-filter: blur(2px);
  padding: 1rem;
}

.compact .state-block {
  padding: 2rem 1rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: rs-spin 0.8s linear infinite;
}

@keyframes rs-spin {
  to {
    transform: rotate(360deg);
  }
}

.state-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.state-icon {
  font-size: 3rem;
  opacity: 0.6;
  line-height: 1;
}

.state-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.state-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  max-width: 320px;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  background: rgba(0, 217, 165, 0.1);
  border: 1px solid rgba(0, 217, 165, 0.3);
  color: var(--primary);
  padding: 0.65rem 1.4rem;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
}

.retry-btn:hover {
  background: rgba(0, 217, 165, 0.18);
}

.retry-btn svg {
  width: 16px;
  height: 16px;
}
</style>
