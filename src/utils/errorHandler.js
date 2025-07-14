// 错误处理和重试机制工具类
const fs = require('fs');
const dayjs = require('dayjs');

class ErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.logFile = options.logFile || './data/error.log';
    this.enableConsoleLog = options.enableConsoleLog !== false;
  }

  /**
   * 执行带重试机制的异步操作
   * @param {Function} operation - 要执行的异步操作
   * @param {Object} options - 选项
   * @returns {Promise} 操作结果
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = this.maxRetries,
      retryDelay = this.retryDelay,
      operationName = '未知操作',
      retryCondition = () => true
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        if (this.enableConsoleLog && attempt > 1) {
          console.log(`🔄 重试 ${operationName} (第${attempt - 1}次重试)`);
        }

        const result = await operation();
        
        if (attempt > 1 && this.enableConsoleLog) {
          console.log(`✅ ${operationName} 重试成功`);
        }
        
        return { success: true, data: result, attempts: attempt };

      } catch (error) {
        lastError = error;
        
        if (this.enableConsoleLog) {
          console.error(`❌ ${operationName} 失败 (尝试 ${attempt}/${maxRetries + 1}): ${error.message}`);
        }

        // 记录错误日志
        this._logError(error, operationName, attempt);

        // 检查是否应该重试
        if (attempt <= maxRetries && retryCondition(error)) {
          await this._delay(retryDelay * attempt);
        } else {
          break;
        }
      }
    }

    // 所有重试都失败了
    return {
      success: false,
      error: lastError.message,
      attempts: maxRetries + 1,
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss')
    };
  }

  /**
   * 包装Promise以添加超时和错误处理
   * @param {Promise} promise - 要包装的Promise
   * @param {number} timeout - 超时时间（毫秒）
   * @param {string} operationName - 操作名称
   */
  async wrapWithTimeout(promise, timeout = 10000, operationName = '操作') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${operationName} 超时 (${timeout}ms)`));
        }, timeout);
      })
    ]);
  }

  /**
   * 批量执行操作，支持并发控制和错误处理
   * @param {Array} items - 要处理的项目数组
   * @param {Function} operation - 对每个项目执行的操作
   * @param {Object} options - 选项
   */
  async executeBatch(items, operation, options = {}) {
    const {
      concurrency = 3,
      continueOnError = true,
      operationName = '批量操作'
    } = options;

    const results = [];
    const errors = [];

    // 分批处理
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      if (this.enableConsoleLog) {
        console.log(`📦 处理批次 ${Math.floor(i / concurrency) + 1}/${Math.ceil(items.length / concurrency)} (${batch.length}项)`);
      }

      const batchPromises = batch.map(async (item, index) => {
        try {
          const result = await this.executeWithRetry(
            () => operation(item, i + index),
            { operationName: `${operationName}[${i + index}]` }
          );
          
          if (result.success) {
            return { index: i + index, success: true, data: result.data };
          } else {
            throw new Error(result.error);
          }
        } catch (error) {
          const errorInfo = {
            index: i + index,
            item,
            error: error.message,
            success: false
          };
          
          errors.push(errorInfo);
          
          if (!continueOnError) {
            throw error;
          }
          
          return errorInfo;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));

      // 批次间稍作停顿
      if (i + concurrency < items.length) {
        await this._delay(500);
      }
    }

    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length,
      totalCount: items.length
    };
  }

  /**
   * 创建断路器模式的错误处理
   * @param {Function} operation - 要保护的操作
   * @param {Object} options - 断路器选项
   */
  createCircuitBreaker(operation, options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      operationName = '断路器保护操作'
    } = options;

    let failureCount = 0;
    let lastFailureTime = null;
    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

    return async (...args) => {
      // 检查断路器状态
      if (state === 'OPEN') {
        if (Date.now() - lastFailureTime > resetTimeout) {
          state = 'HALF_OPEN';
          if (this.enableConsoleLog) {
            console.log(`🔄 断路器半开状态: ${operationName}`);
          }
        } else {
          throw new Error(`断路器开启状态，操作被阻止: ${operationName}`);
        }
      }

      try {
        const result = await operation(...args);
        
        // 成功时重置计数器
        if (state === 'HALF_OPEN') {
          state = 'CLOSED';
          failureCount = 0;
          if (this.enableConsoleLog) {
            console.log(`✅ 断路器恢复正常: ${operationName}`);
          }
        }
        
        return result;

      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();

        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          if (this.enableConsoleLog) {
            console.error(`🚨 断路器开启: ${operationName} (失败次数: ${failureCount})`);
          }
        }

        this._logError(error, `${operationName}[断路器]`, failureCount);
        throw error;
      }
    };
  }

  /**
   * 延迟函数
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录错误日志
   * @private
   */
  _logError(error, operationName, attempt) {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const logEntry = {
      timestamp,
      operation: operationName,
      attempt,
      error: error.message,
      stack: error.stack
    };

    // 写入日志文件
    const logLine = `${timestamp} - ${operationName}[${attempt}] - ${error.message}\n`;
    
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (logError) {
      console.error('写入错误日志失败:', logError.message);
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStats(hours = 24) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return { totalErrors: 0, recentErrors: 0, errorRate: 0 };
      }

      const logContent = fs.readFileSync(this.logFile, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      const cutoffTime = dayjs().subtract(hours, 'hour');
      const recentErrors = lines.filter(line => {
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if (match) {
          const logTime = dayjs(match[1]);
          return logTime.isAfter(cutoffTime);
        }
        return false;
      });

      return {
        totalErrors: lines.length,
        recentErrors: recentErrors.length,
        errorRate: recentErrors.length / hours
      };

    } catch (error) {
      console.error('获取错误统计失败:', error.message);
      return { totalErrors: 0, recentErrors: 0, errorRate: 0 };
    }
  }

  /**
   * 清理旧的错误日志
   */
  cleanupLogs(daysToKeep = 7) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const logContent = fs.readFileSync(this.logFile, 'utf8');
      const lines = logContent.split('\n');
      
      const cutoffTime = dayjs().subtract(daysToKeep, 'day');
      const filteredLines = lines.filter(line => {
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if (match) {
          const logTime = dayjs(match[1]);
          return logTime.isAfter(cutoffTime);
        }
        return true; // 保留无法解析时间的行
      });

      fs.writeFileSync(this.logFile, filteredLines.join('\n'));
      
      if (this.enableConsoleLog) {
        console.log(`🧹 清理错误日志完成，保留 ${daysToKeep} 天内的记录`);
      }

    } catch (error) {
      console.error('清理错误日志失败:', error.message);
    }
  }
}

module.exports = ErrorHandler;
