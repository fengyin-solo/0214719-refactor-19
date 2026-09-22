/**
 * 用户端统一模拟数据集
 *
 * 所有页面与 API 层共用同一份数据定义，避免各页面各自硬编码导致字段漂移。
 * 仅存放"数据"；请求行为（成功/空数据/超时/异常）见 mock/index.js。
 */

// ==================== 用户信息 ====================

export const mockUser = {
  id: 'U20260001',
  name: '张三',
  level: '黄金',
  points: 2580,
  totalHours: 156,
  competitions: 12,
  wins: 8,
  courses: 3,
  phone: '138****8888',
  email: 'zhang***@email.com'
}

// ==================== 球桌 ====================

export const mockTables = [
  { id: 1, name: '1号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: true, size: '12尺', brand: '星牌' },
  { id: 2, name: '2号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: false, size: '12尺', brand: '星牌' },
  { id: 3, name: '3号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
  { id: 4, name: '4号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
  { id: 5, name: '5号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: false, size: '9尺', brand: '乔氏' },
  { id: 6, name: '6号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: true, size: '9尺', brand: '乔氏' }
]

// 预约时段（与 Tables 页面选择器保持一致）
export const mockTimeSlots = [
  { id: 1, time: '10:00 - 12:00', available: true },
  { id: 2, time: '12:00 - 14:00', available: true },
  { id: 3, time: '14:00 - 16:00', available: true },
  { id: 4, time: '16:00 - 18:00', available: false },
  { id: 5, time: '18:00 - 20:00', available: true },
  { id: 6, time: '20:00 - 22:00', available: true }
]

// ==================== 课程 ====================

export const mockCourses = [
  {
    id: 1,
    name: '台球入门基础课',
    icon: '🎯',
    level: '入门',
    duration: '4周',
    lessons: '8课时',
    students: 156,
    price: 599,
    originalPrice: 799,
    description: '从零开始学习台球，掌握基本姿势、握杆方法和击球技巧，适合完全没有基础的新手',
    coach: '张明',
    coachTitle: '高级教练',
    coachBio: '10年教学经验，培养学员超过500人，擅长基础教学和纠正动作',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    outline: ['台球基础知识介绍', '正确的站姿与握杆', '基本击球动作练习', '直线球练习', '简单角度球', '基础走位概念', '实战练习', '结业考核']
  },
  {
    id: 2,
    name: '斯诺克进阶训练',
    icon: '🎱',
    level: '进阶',
    duration: '6周',
    lessons: '12课时',
    students: 89,
    price: 1299,
    originalPrice: 1599,
    description: '深入学习斯诺克战术布局，提升走位和防守能力，掌握高级杆法技巧',
    coach: '李强',
    coachTitle: '国家级教练',
    coachBio: '前省队选手，15年执教经验，多次带队获得全国比赛冠军',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    outline: ['斯诺克规则深度解析', '高级杆法：低杆与高杆', '塞球技术详解', '走位规划与执行', '防守策略', '清台技巧', '比赛心态调整', '模拟比赛训练']
  },
  {
    id: 3,
    name: '九球高级技巧',
    icon: '🏆',
    level: '高级',
    duration: '8周',
    lessons: '16课时',
    students: 45,
    price: 1999,
    originalPrice: 2499,
    description: '掌握高级杆法、塞球技术和复杂局面处理，提升比赛实战能力',
    coach: '王磊',
    coachTitle: '职业选手',
    coachBio: '现役职业选手，全国九球锦标赛前八，擅长实战技巧教学',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    outline: ['九球比赛规则与策略', '开球技巧优化', '组合球与翻袋', '高级塞球应用', '困难球处理', '安全球战术', '关键球心理', '实战对抗训练']
  },
  {
    id: 4,
    name: '比赛心理训练',
    icon: '🧠',
    level: '专业',
    duration: '3周',
    lessons: '6课时',
    students: 32,
    price: 999,
    description: '提升比赛心理素质，学习压力管理和专注力训练，突破瓶颈期',
    coach: '赵芳',
    coachTitle: '运动心理师',
    coachBio: '国家认证运动心理咨询师，服务多支省级运动队',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    outline: ['运动心理学基础', '压力与焦虑管理', '专注力训练方法', '比赛前心理准备', '失误后的心态调整', '建立自信心']
  }
]

// ==================== 赛事 ====================

export const mockCompetitions = [
  { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, participants: 28, maxParticipants: 32, status: 'upcoming' },
  { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, participants: 16, maxParticipants: 16, status: 'ongoing' },
  { id: 3, name: '新年中式八球锦标赛', type: '中式八球', date: '2026-01-20', location: '主馆A区', prize: 30000, fee: 150, participants: 64, maxParticipants: 64, status: 'finished' },
  { id: 4, name: '会员积分争霸赛', type: '综合', date: '2026-04-01', location: '主馆C区', prize: 20000, fee: 50, participants: 12, maxParticipants: 48, status: 'upcoming' },
  { id: 5, name: '女子台球精英赛', type: '美式九球', date: '2026-03-08', location: '主馆B区', prize: 15000, fee: 80, participants: 8, maxParticipants: 16, status: 'upcoming' }
]

// ==================== 商品 ====================

export const mockProducts = [
  { id: 1, name: 'LP专业斯诺克球杆', brand: 'LP', price: 2999, originalPrice: 3599, category: 'cue', icon: '🏏', description: '进口白蜡木杆身，专业级配置', sales: 328, hot: true },
  { id: 2, name: 'Predator美式九球杆', brand: 'Predator', price: 4599, category: 'cue', icon: '🏏', description: '碳纤维前节，低偏转技术', sales: 156, new: true },
  { id: 3, name: '星牌比赛用球', brand: '星牌', price: 1299, originalPrice: 1499, category: 'ball', icon: '🎱', description: '国际比赛标准，酚醛树脂材质', sales: 892, hot: true },
  { id: 4, name: 'Aramith水晶球套装', brand: 'Aramith', price: 2199, category: 'ball', icon: '🎱', description: '比利时进口，透明水晶材质', sales: 234 },
  { id: 5, name: 'Master专业巧克粉', brand: 'Master', price: 39, category: 'accessory', icon: '🧊', description: '美国原装进口，防滑效果好', sales: 2341, hot: true },
  { id: 6, name: '球杆延长器', brand: 'Generic', price: 199, originalPrice: 259, category: 'accessory', icon: '🔧', description: '铝合金材质，轻便耐用', sales: 567 },
  { id: 7, name: 'Kamui台球手套', brand: 'Kamui', price: 89, category: 'accessory', icon: '🧤', description: '日本进口，透气舒适', sales: 1234 },
  { id: 8, name: '专业比赛马甲', brand: 'Billiard Pro', price: 299, category: 'clothing', icon: '🎽', description: '修身剪裁，舒适透气', sales: 445, new: true }
]

// ==================== 预约记录 ====================

export const mockBookings = [
  { id: 1, orderNo: 'BK20260001', tableName: '3号球桌 - 美式九球', date: '2026-02-15', time: '14:00 - 16:00', status: 'upcoming' },
  { id: 2, orderNo: 'BK20260002', tableName: '1号球桌 - 斯诺克', date: '2026-02-10', time: '19:00 - 21:00', status: 'completed' },
  { id: 3, orderNo: 'BK20260003', tableName: '5号球桌 - 中式八球', date: '2026-02-08', time: '10:00 - 12:00', status: 'completed' }
]

// ==================== 积分与礼品（个人中心） ====================

export const mockPointsHistory = [
  { id: 1, title: '预约消费奖励', date: '2026-02-10', amount: 50, type: 'add' },
  { id: 2, title: '课程报名奖励', date: '2026-02-08', amount: 100, type: 'add' },
  { id: 3, title: '兑换优惠券', date: '2026-02-05', amount: 200, type: 'minus' },
  { id: 4, title: '比赛获奖', date: '2026-01-20', amount: 500, type: 'add' }
]

export const mockGifts = [
  { id: 1, name: '10元优惠券', icon: '🎫', points: 200 },
  { id: 2, name: '1小时免费打球', icon: '🎱', points: 500 },
  { id: 3, name: '专业巧克粉', icon: '🧊', points: 300 },
  { id: 4, name: '台球手套', icon: '🧤', points: 800 }
]

// ==================== 工具函数 ====================

/**
 * 生成业务单号
 * @param {string} prefix 单号前缀（BK/SP/CR/REG）
 */
export function generateOrderNo(prefix) {
  return prefix + Date.now().toString().slice(-8)
}

/**
 * 解析请求体（兼容字符串与对象）
 */
export function parseBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body
  try {
    return JSON.parse(body)
  } catch (e) {
    return {}
  }
}

/**
 * 稳定的伪随机数（同一种子结果一致，避免切换日期后刷新抖动）
 */
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^= h >>> 16) >>> 0) / 4294967296
}
