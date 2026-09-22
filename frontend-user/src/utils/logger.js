/**
 * 日志记录器
 * 根据 VITE_LOG_LEVEL 配置输出不同级别的日志
 *
 * 使用示例：
 * logger.info('用户登录', { userId: '123' })
 * logger.error('请求失败', error)
 */

const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info'
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

export const logger = {
  /**
   * 检查是否应该输出该级别的日志
   * @param {string} level - 日志级别
   * @returns {boolean} 是否输出
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]
  },

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @returns {string} 格式化后的消息
   */
  format(level, message) {
    return `[${level.toUpperCase()}] ${new Date().toISOString()} - ${message}`
  },

  /**
   * 调试日志 - 详细的调试信息
   */
  debug(message, data) {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message), data || '')
    }
  },

  /**
   * 信息日志 - 常规操作记录
   */
  info(message, data) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message), data || '')
    }
  },

  /**
   * 警告日志 - 潜在问题提示
   */
  warn(message, data) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message), data || '')
    }
  },

  /**
   * 错误日志 - 错误和异常
   */
  error(message, error) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message), error || '')
    }
  }
}

export default logger
