// 📊 推送质量监控模块
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

class PushQualityMonitor {
  constructor(options = {}) {
    this.config = {
      logFile: options.logFile || path.join('data', 'push_quality.log'),
      maxLogSize: options.maxLogSize || 10 * 1024 * 1024, // 10MB
      retentionDays: options.retentionDays || 30,
      enableMetrics: options.enableMetrics !== false
    };

    this.metrics = {
      totalPushes: 0,
      successfulPushes: 0,
      failedPushes: 0,
      duplicateBlocked: 0,
      rateLimit: 0,
      qualityScores: [],
      responseTime: []
    };

    this._loadMetrics();
  }

  /**
   * 记录推送尝试
   * @param {Object} pushData - 推送数据
   * @param {Object} decision - 推送决策结果
   * @param {Object} result - 推送结果
   */
  logPushAttempt(pushData, decision, result = null) {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const logEntry = {
      timestamp,
      type: pushData.type || 'unknown',
      priority: pushData.priority || 'normal',
      decision: {
        shouldPush: decision.shouldPush,
        reason: decision.reason,
        score: decision.score,
        factors: decision.factors
      },
      result: result ? {
        success: result.success,
        error: result.error,
        responseTime: result.responseTime
      } : null,
      contentLength: pushData.content?.length || 0,
      signalCount: pushData.signals?.length || 0
    };

    // 更新指标
    this._updateMetrics(logEntry);

    // 写入日志文件
    this._writeLog(logEntry);

    return logEntry;
  }

  /**
   * 更新推送指标
   * @private
   */
  _updateMetrics(logEntry) {
    if (!this.config.enableMetrics) return;

    this.metrics.totalPushes++;

    if (logEntry.decision.shouldPush) {
      if (logEntry.result?.success) {
        this.metrics.successfulPushes++;
        if (logEntry.result.responseTime) {
          this.metrics.responseTime.push(logEntry.result.responseTime);
          // 保持最近100次的响应时间记录
          if (this.metrics.responseTime.length > 100) {
            this.metrics.responseTime = this.metrics.responseTime.slice(-100);
          }
        }
      } else if (logEntry.result?.success === false) {
        this.metrics.failedPushes++;
      }

      // 记录质量评分
      if (logEntry.decision.score !== undefined) {
        this.metrics.qualityScores.push(logEntry.decision.score);
        // 保持最近100次的质量评分记录
        if (this.metrics.qualityScores.length > 100) {
          this.metrics.qualityScores = this.metrics.qualityScores.slice(-100);
        }
      }
    } else {
      // 记录被阻止的原因
      if (logEntry.decision.reason.includes('重复')) {
        this.metrics.duplicateBlocked++;
      } else if (logEntry.decision.reason.includes('频率') || logEntry.decision.reason.includes('间隔')) {
        this.metrics.rateLimit++;
      }
    }

    this._saveMetrics();
  }

  /**
   * 写入日志
   * @private
   */
  _writeLog(logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      
      // 检查日志文件大小
      if (fs.existsSync(this.config.logFile)) {
        const stats = fs.statSync(this.config.logFile);
        if (stats.size > this.config.maxLogSize) {
          this._rotateLog();
        }
      }

      fs.appendFileSync(this.config.logFile, logLine, 'utf8');
    } catch (error) {
      console.error(`推送质量监控日志写入失败: ${error.message}`);
    }
  }

  /**
   * 日志轮转
   * @private
   */
  _rotateLog() {
    try {
      const timestamp = dayjs().format('YYYYMMDD_HHmmss');
      const backupFile = this.config.logFile.replace('.log', `_${timestamp}.log`);
      fs.renameSync(this.config.logFile, backupFile);
      console.log(`📋 推送质量日志已轮转: ${backupFile}`);
    } catch (error) {
      console.error(`日志轮转失败: ${error.message}`);
    }
  }

  /**
   * 获取推送质量报告
   * @returns {Object} 质量报告
   */
  getQualityReport() {
    const avgQualityScore = this.metrics.qualityScores.length > 0 ?
      this.metrics.qualityScores.reduce((sum, score) => sum + score, 0) / this.metrics.qualityScores.length : 0;

    const avgResponseTime = this.metrics.responseTime.length > 0 ?
      this.metrics.responseTime.reduce((sum, time) => sum + time, 0) / this.metrics.responseTime.length : 0;

    const successRate = this.metrics.totalPushes > 0 ?
      (this.metrics.successfulPushes / this.metrics.totalPushes) * 100 : 0;

    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      summary: {
        totalPushes: this.metrics.totalPushes,
        successfulPushes: this.metrics.successfulPushes,
        failedPushes: this.metrics.failedPushes,
        successRate: successRate.toFixed(1) + '%',
        avgQualityScore: avgQualityScore.toFixed(1),
        avgResponseTime: avgResponseTime.toFixed(0) + 'ms'
      },
      blocking: {
        duplicateBlocked: this.metrics.duplicateBlocked,
        rateLimitBlocked: this.metrics.rateLimit
      },
      performance: {
        recentQualityScores: this.metrics.qualityScores.slice(-10),
        recentResponseTimes: this.metrics.responseTime.slice(-10)
      }
    };
  }

  /**
   * 重置指标
   */
  resetMetrics() {
    this.metrics = {
      totalPushes: 0,
      successfulPushes: 0,
      failedPushes: 0,
      duplicateBlocked: 0,
      rateLimit: 0,
      qualityScores: [],
      responseTime: []
    };
    this._saveMetrics();
  }

  /**
   * 加载指标
   * @private
   */
  _loadMetrics() {
    try {
      const metricsFile = this.config.logFile.replace('.log', '_metrics.json');
      if (fs.existsSync(metricsFile)) {
        const data = fs.readFileSync(metricsFile, 'utf8');
        const savedMetrics = JSON.parse(data);
        this.metrics = { ...this.metrics, ...savedMetrics };
      }
    } catch (error) {
      console.error(`加载推送指标失败: ${error.message}`);
    }
  }

  /**
   * 保存指标
   * @private
   */
  _saveMetrics() {
    try {
      const metricsFile = this.config.logFile.replace('.log', '_metrics.json');
      fs.writeFileSync(metricsFile, JSON.stringify(this.metrics, null, 2), 'utf8');
    } catch (error) {
      console.error(`保存推送指标失败: ${error.message}`);
    }
  }

  /**
   * 清理过期日志
   */
  cleanupOldLogs() {
    try {
      const logDir = path.dirname(this.config.logFile);
      const files = fs.readdirSync(logDir);
      const cutoffDate = dayjs().subtract(this.config.retentionDays, 'day');

      files.forEach(file => {
        if (file.includes('push_quality_') && file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          if (dayjs(stats.mtime).isBefore(cutoffDate)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ 清理过期推送日志: ${file}`);
          }
        }
      });
    } catch (error) {
      console.error(`清理过期日志失败: ${error.message}`);
    }
  }
}

module.exports = PushQualityMonitor;
