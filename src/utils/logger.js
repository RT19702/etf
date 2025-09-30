// 统一日志记录系统
// 支持多级别日志、文件输出、性能统计

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'INFO',
      logToFile: config.logToFile || false,
      logFilePath: config.logFilePath || './logs/etf-strategy.log',
      logToConsole: config.logToConsole !== false,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      ...config
    };
    
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    
    this.currentLevel = this.levels[this.config.level] || this.levels.INFO;
    
    // 性能统计
    this.performanceMarks = new Map();
    
    // 确保日志目录存在
    if (this.config.logToFile) {
      this.ensureLogDirectory();
    }
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    const logDir = path.dirname(this.config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {string} 格式化后的日志
   */
  formatMessage(level, message, data = null) {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        logMessage += ` ${JSON.stringify(data)}`;
      } else {
        logMessage += ` ${data}`;
      }
    }
    
    return logMessage;
  }

  /**
   * 写入日志文件
   * @param {string} message - 日志消息
   */
  writeToFile(message) {
    if (!this.config.logToFile) return;
    
    try {
      // 检查文件大小
      if (fs.existsSync(this.config.logFilePath)) {
        const stats = fs.statSync(this.config.logFilePath);
        if (stats.size > this.config.maxFileSize) {
          // 轮转日志文件
          this.rotateLogFile();
        }
      }
      
      fs.appendFileSync(this.config.logFilePath, message + '\n');
    } catch (error) {
      console.error(`日志写入失败: ${error.message}`);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile() {
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const ext = path.extname(this.config.logFilePath);
    const basename = path.basename(this.config.logFilePath, ext);
    const dirname = path.dirname(this.config.logFilePath);
    const newPath = path.join(dirname, `${basename}_${timestamp}${ext}`);
    
    try {
      fs.renameSync(this.config.logFilePath, newPath);
      console.log(`日志文件已轮转: ${newPath}`);
    } catch (error) {
      console.error(`日志轮转失败: ${error.message}`);
    }
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = null) {
    const levelValue = this.levels[level];
    
    if (levelValue < this.currentLevel) {
      return; // 低于当前级别，不记录
    }
    
    const formattedMessage = this.formatMessage(level, message, data);
    
    // 输出到控制台
    if (this.config.logToConsole) {
      switch (level) {
        case 'DEBUG':
          console.log(`\x1b[90m${formattedMessage}\x1b[0m`); // 灰色
          break;
        case 'INFO':
          console.log(`\x1b[36m${formattedMessage}\x1b[0m`); // 青色
          break;
        case 'WARN':
          console.warn(`\x1b[33m${formattedMessage}\x1b[0m`); // 黄色
          break;
        case 'ERROR':
          console.error(`\x1b[31m${formattedMessage}\x1b[0m`); // 红色
          break;
        default:
          console.log(formattedMessage);
      }
    }
    
    // 写入文件
    this.writeToFile(formattedMessage);
  }

  /**
   * DEBUG级别日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  debug(message, data = null) {
    this.log('DEBUG', message, data);
  }

  /**
   * INFO级别日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  info(message, data = null) {
    this.log('INFO', message, data);
  }

  /**
   * WARN级别日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  /**
   * ERROR级别日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  error(message, data = null) {
    this.log('ERROR', message, data);
  }

  /**
   * 记录决策日志（重要决策点）
   * @param {string} type - 决策类型
   * @param {Object} data - 决策数据
   */
  decision(type, data) {
    this.info(`[DECISION] ${type}`, data);
  }

  /**
   * 记录性能日志
   * @param {string} operation - 操作名称
   * @param {number} duration - 持续时间（毫秒）
   * @param {Object} data - 附加数据
   */
  performance(operation, duration, data = null) {
    const perfData = {
      operation,
      duration: `${duration}ms`,
      ...data
    };
    this.debug(`[PERFORMANCE] ${operation}`, perfData);
  }

  /**
   * 开始性能计时
   * @param {string} mark - 标记名称
   */
  startPerformance(mark) {
    this.performanceMarks.set(mark, Date.now());
  }

  /**
   * 结束性能计时并记录
   * @param {string} mark - 标记名称
   * @param {Object} data - 附加数据
   */
  endPerformance(mark, data = null) {
    const startTime = this.performanceMarks.get(mark);
    if (!startTime) {
      this.warn(`性能标记不存在: ${mark}`);
      return;
    }
    
    const duration = Date.now() - startTime;
    this.performance(mark, duration, data);
    this.performanceMarks.delete(mark);
    
    return duration;
  }

  /**
   * 记录信号生成日志
   * @param {string} symbol - 股票代码
   * @param {Object} signal - 信号数据
   */
  signal(symbol, signal) {
    this.decision('SIGNAL_GENERATED', {
      symbol,
      level: signal.level,
      score: signal.score,
      strength: signal.strength,
      sources: signal.sources
    });
  }

  /**
   * 记录止损触发日志
   * @param {string} symbol - 股票代码
   * @param {Object} stopLoss - 止损数据
   */
  stopLoss(symbol, stopLoss) {
    this.decision('STOP_LOSS_TRIGGERED', {
      symbol,
      type: stopLoss.type,
      entryPrice: stopLoss.entryPrice,
      currentPrice: stopLoss.currentPrice,
      stopLossPrice: stopLoss.stopLossPrice,
      loss: stopLoss.loss
    });
  }

  /**
   * 记录市场环境变化日志
   * @param {Object} environment - 市场环境数据
   */
  marketEnvironment(environment) {
    this.decision('MARKET_ENVIRONMENT_DETECTED', {
      trend: environment.trend,
      volatility: environment.volatility,
      strength: environment.strength,
      recommendation: environment.recommendation
    });
  }

  /**
   * 记录交易执行日志
   * @param {string} action - 交易动作
   * @param {Object} trade - 交易数据
   */
  trade(action, trade) {
    this.info(`[TRADE] ${action}`, {
      symbol: trade.symbol,
      price: trade.price,
      size: trade.size,
      reason: trade.reason
    });
  }

  /**
   * 获取日志统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      level: this.config.level,
      logToFile: this.config.logToFile,
      logFilePath: this.config.logFilePath,
      activePerformanceMarks: this.performanceMarks.size
    };
  }
}

// 创建全局日志实例
let globalLogger = null;

/**
 * 初始化全局日志器
 * @param {Object} config - 配置对象
 * @returns {Logger} 日志器实例
 */
function initLogger(config) {
  globalLogger = new Logger(config);
  return globalLogger;
}

/**
 * 获取全局日志器
 * @returns {Logger} 日志器实例
 */
function getLogger() {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

module.exports = {
  Logger,
  initLogger,
  getLogger
};

