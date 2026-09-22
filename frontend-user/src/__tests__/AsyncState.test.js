import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AsyncState from '../../src/components/AsyncState.vue'
import { useRequest } from '../../src/utils/useRequest'

function mountState(res) {
  return mount({
    components: { AsyncState },
    setup() { return { res } },
    template: `<AsyncState :state="res"><div class="real">内容</div></AsyncState>`
  }, { attachTo: document.body })
}

describe('AsyncState 组件', () => {
  it('加载中显示 loading；失败显示错误与重试按钮；成功显示内容', async () => {
    let resolveFn
    const res = useRequest(() => new Promise(resolve => (resolveFn = resolve)))
    const wrapper = mountState(res)
    res.run()
    await nextTick(); await nextTick()
    expect(wrapper.find('.async-loading').exists()).toBe(true)
    expect(wrapper.find('.real').exists()).toBe(false)

    resolveFn({ success: false, error: '网络异常，请检查网络后重试', code: 'NETWORK' })
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(wrapper.find('.async-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('网络异常')
    expect(wrapper.find('.async-retry-btn').exists()).toBe(true)
    expect(wrapper.find('.real').exists()).toBe(false)

    // 成功后展示内容
    resolveFn({ success: true, data: [{ id: 1 }], error: null, code: null })
    res.retry()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(wrapper.find('.real').exists()).toBe(true)
  })

  it('空数据显示默认空态，不渲染默认内容', async () => {
    const res = useRequest(async () => ({ success: true, data: [], error: null, code: null }), { initialData: [] })
    const wrapper = mountState(res)
    await res.run()
    await nextTick()
    expect(wrapper.find('.async-empty').exists()).toBe(true)
    expect(wrapper.find('.real').exists()).toBe(false)
  })
})
