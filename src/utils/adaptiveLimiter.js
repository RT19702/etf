// 🚦 自适应限流器模块
const Bottleneck = require('bottleneck');

/**
 * 自适应限流器类
 * 根据API响应性能自动调整请求频率和并发数
 */
class AdaptiveLimiter {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {number} options.minTime - 初始最小请求间隔（毫秒）
   * @param {number} options.maxConcurrent - 初始最大并发数
   * @param {number} options.minMinTime - 最小请求间隔下限
   * @param {number} options.maxMinTime - 最大请求间隔上限
   * @param {number} options.minConcurrent - 最小并发数下限
   * @param {number} options.maxConcurrentLimit - 最大并发数上限
   */
  constructor(options = {}) {
    // 初始化配置
    const initialMinTime = options.minTime || Number(process.env.LIMITER_MIN_TIME) || 500;
    const initialMaxConcurrent = options.maxConcurrent || Number(process.env.LIMITER_MAX_CONCURRENT) || 3;

    this.config = {
      // 当前运行参数（会动态调整）
      currentMinTime: initialMinTime,
      currentMaxConcurrent: initialMaxConcurrent,
      // 自适应参数边界
      minMinTime: options.minMinTime || 200,      // 最小请求间隔下限
      maxMinTime: options.maxMinTime || 2000,     // 最大请求间隔上限
      minConcurrent: options.minConcurrent || 1,  // 最小并发数下限
      maxConcurrentLimit: options.maxConcurrentLimit || 5  // 最大并发数上限
    };

    this.limiter = new Bottleneck({
      minTime: this.config.currentMinTime,
      maxConcurrent: this.config.currentMaxConcurrent
    });

    // 性能统计
    this.stats = {
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      requestCount: 0,
      lastAdjustTime: Date.now()
    };
  }

  /**
   * 调度任务执行
   * @param {Function} fn - 要执行的函数
   * @returns {Promise} 执行结果
   */
  async schedule(fn) {
    const startTime = Date.now();

    try {
      const result = await this.limiter.schedule(fn);

      // 记录成功
      this.stats.successCount++;
      this.stats.requestCount++;
      this.stats.totalResponseTime += (Date.now() - startTime);

      // 定期调整限流参数
      this.adjustIfNeeded();

      return result;
    } catch (error) {
      // 记录错误
      this.stats.errorCount++;
      this.stats.requestCount++;

      // 如果错误率高，立即调整
      if (this.getErrorRate() > 0.2) {
        this.adjustForHighErrorRate();
      }

      throw error;
    }
  }

  /**
   * 获取错误率
   * @returns {number} 错误率
   */
  getErrorRate() {
    if (this.stats.requestCount === 0) return 0;
    return this.stats.errorCount / this.stats.requestCount;
  }

  /**
   * 获取平均响应时间
   * @returns {number} 平均响应时间（毫秒）
   */
  getAvgResponseTime() {
    if (this.stats.successCount === 0) return 0;
    return this.stats.totalResponseTime / this.stats.successCount;
  }

  /**
   * 根据性能指标调整限流参数
   */
  adjustIfNeeded() {
    const now = Date.now();
    const timeSinceLastAdjust = now - this.stats.lastAdjustTime;

    // 每30秒检查一次
    if (timeSinceLastAdjust < 30000) return;

    // 至少有10个请求才调整
    if (this.stats.requestCount < 10) return;

    const errorRate = this.getErrorRate();
    const avgResponseTime = this.getAvgResponseTime();

    // 性能良好：错误率<5%，响应时间<1秒
    if (errorRate < 0.05 && avgResponseTime < 1000) {
      this.increasePerformance();
    }
    // 性能一般：错误率5-15%或响应时间1-2秒
    else if (errorRate < 0.15 && avgResponseTime < 2000) {
      // 保持当前配置
    }
    // 性能较差：错误率>15%或响应时间>2秒
    else {
      this.decreasePerformance();
    }

    // 重置统计
    this.resetStats();
  }

  /**
   * 提高性能（增加并发，减少间隔）
   */
  increasePerformance() {
    const currentMinTime = this.config.currentMinTime;
    const currentMaxConcurrent = this.config.currentMaxConcurrent;

    // 减少请求间隔（最多减少20%）
    const newMinTime = Math.max(
      this.config.minMinTime,
      Math.floor(currentMinTime * 0.8)
    );

    // 增加并发数（最多+1）
    const newMaxConcurrent = Math.min(
      this.config.maxConcurrentLimit,
      currentMaxConcurrent + 1
    );

    if (newMinTime !== currentMinTime || newMaxConcurrent !== currentMaxConcurrent) {
      this.limiter.updateSettings({
        minTime: newMinTime,
        maxConcurrent: newMaxConcurrent
      });

      // 更新配置中的当前值
      this.config.currentMinTime = newMinTime;
      this.config.currentMaxConcurrent = newMaxConcurrent;

      console.log(`🚀 限流器性能提升: minTime ${currentMinTime}→${newMinTime}ms, maxConcurrent ${currentMaxConcurrent}→${newMaxConcurrent}`);
    }
  }

  /**
   * 降低性能（减少并发，增加间隔）
   */
  decreasePerformance() {
    const currentMinTime = this.config.currentMinTime;
    const currentMaxConcurrent = this.config.currentMaxConcurrent;

    // 增加请求间隔（最多增加50%）
    const newMinTime = Math.min(
      this.config.maxMinTime,
      Math.floor(currentMinTime * 1.5)
    );

    // 减少并发数（最多-1）
    const newMaxConcurrent = Math.max(
      this.config.minConcurrent,
      currentMaxConcurrent - 1
    );

    if (newMinTime !== currentMinTime || newMaxConcurrent !== currentMaxConcurrent) {
      this.limiter.updateSettings({
        minTime: newMinTime,
        maxConcurrent: newMaxConcurrent
      });

      // 更新配置中的当前值
      this.config.currentMinTime = newMinTime;
      this.config.currentMaxConcurrent = newMaxConcurrent;

      console.log(`⚠️ 限流器性能降低: minTime ${currentMinTime}→${newMinTime}ms, maxConcurrent ${currentMaxConcurrent}→${newMaxConcurrent}`);
    }
  }

  /**
   * 高错误率时的紧急调整
   */
  adjustForHighErrorRate() {
    const currentMinTime = this.config.currentMinTime;
    const currentMaxConcurrent = this.config.currentMaxConcurrent;

    // 大幅增加间隔，减少并发
    const newMinTime = Math.min(this.config.maxMinTime, currentMinTime * 2);
    const newMaxConcurrent = Math.max(this.config.minConcurrent, Math.floor(currentMaxConcurrent / 2));

    this.limiter.updateSettings({
      minTime: newMinTime,
      maxConcurrent: newMaxConcurrent
    });

    // 更新配置中的当前值
    this.config.currentMinTime = newMinTime;
    this.config.currentMaxConcurrent = newMaxConcurrent;

    console.log(`🚨 高错误率紧急调整: minTime ${currentMinTime}→${newMinTime}ms, maxConcurrent ${currentMaxConcurrent}→${newMaxConcurrent}`);

    this.resetStats();
  }

  /**
   * 重置统计数据
   */
  resetStats() {
    this.stats = {
      successCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      requestCount: 0,
      lastAdjustTime: Date.now()
    };
  }

  /**
   * 获取当前统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      errorRate: this.getErrorRate(),
      avgResponseTime: this.getAvgResponseTime(),
      currentMinTime: this.config.currentMinTime,
      currentMaxConcurrent: this.config.currentMaxConcurrent
    };
  }
}

module.exports = AdaptiveLimiter;

