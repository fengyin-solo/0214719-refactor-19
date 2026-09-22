/**
 * 页面挂载冒烟测试
 *
 * 验证各业务页面通过统一请求层（mock 模式）可正常挂载并渲染数据，
 * 页面内不再包含硬编码 mock 数据。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

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
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

// 路由桩：页面中使用了 this.$router.push
const routerMock = {
  install() {},
  push: vi.fn()
}

function mountPage(component) {
  return mount(component, {
    global: {
      plugins: [routerMock]
    }
  })
}

async function waitForCards(wrapper, selector) {
  await vi.waitFor(
    () => expect(wrapper.findAll(selector).length).toBeGreaterThan(0),
    { timeout: 8000 }
  )
}

import Tables from '../views/Tables.vue'
import Courses from '../views/Courses.vue'
import Competitions from '../views/Competitions.vue'
import Shop from '../views/Shop.vue'
import Tasks from '../views/Tasks.vue'
import Profile from '../views/Profile.vue'

describe('页面挂载冒烟测试', () => {
  beforeEach(() => {
    localStorageMock.store = {}
    vi.clearAllMocks()
  })

  it('Tables 页面加载后渲染球桌卡片', async () => {
    const wrapper = mountPage(Tables)
    await waitForCards(wrapper, '.table-card')
  })

  it('Courses 页面加载后渲染课程卡片', async () => {
    const wrapper = mountPage(Courses)
    await waitForCards(wrapper, '.course-card')
  })

  it('Competitions 页面加载后渲染赛事卡片', async () => {
    const wrapper = mountPage(Competitions)
    await waitForCards(wrapper, '.competition-card')
  })

  it('Shop 页面加载后渲染商品卡片', async () => {
    const wrapper = mountPage(Shop)
    await waitForCards(wrapper, '.product-card')
  })

  it('Tasks 页面加载后渲染任务卡片', async () => {
    const wrapper = mountPage(Tasks)
    await waitForCards(wrapper, '.task-card')
  })

  it('Profile 页面加载后渲染预约卡片', async () => {
    const wrapper = mountPage(Profile)
    await waitForCards(wrapper, '.booking-card')
  })
})
