// 统一配置管理器
// 负责加载、验证和管理所有配置项

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = {};
    this.validationErrors = [];
    this.validationWarnings = [];
  }

  /**
   * 加载配置
   * @returns {Object} 配置对象
   */
  loadConfig() {
    // 从环境变量加载配置
    this.config = {
      // ETF标的配置
      symbols: this.parseJSON(process.env.ETF_SYMBOLS_JSON, []),
      
      // 数据获取配置
      lookbackDays: this.getNumber('LOOKBACK_DAYS', 20, 10, 60),
      
      // 风险控制配置
      stopLossPercent: this.getNumber('STOP_LOSS_PERCENT', 0.05, 0.01, 0.20),
      trailingStopPercent: this.getNumber('TRAILING_STOP_PERCENT', 0.03, 0.01, 0.15),
      takeProfitPercent: this.getNumber('TAKE_PROFIT_PERCENT', 0.15, 0.05, 0.50),
      timeStopHours: this.getNumber('TIME_STOP_HOURS', 24, 1, 168),
      atrMultiplier: this.getNumber('ATR_MULTIPLIER', 2.0, 1.0, 5.0),
      technicalStopEnabled: this.getBoolean('TECHNICAL_STOP_ENABLED', true),
      
      // 交易限制配置
      maxDailyTrades: this.getNumber('MAX_DAILY_TRADES', 10, 1, 50),
      maxTotalPosition: this.getNumber('MAX_TOTAL_POSITION', 0.8, 0.1, 1.0),
      maxSinglePosition: this.getNumber('MAX_SINGLE_POSITION', 0.3, 0.05, 0.5),
      
      // 市场环境配置
      volatilityThreshold: this.getNumber('VOLATILITY_THRESHOLD', 3.0, 1.0, 10.0),
      
      // 技术指标配置
      rsiPeriod: this.getNumber('RSI_PERIOD', 14, 5, 30),
      macdFast: this.getNumber('MACD_FAST', 12, 5, 20),
      macdSlow: this.getNumber('MACD_SLOW', 26, 15, 40),
      macdSignal: this.getNumber('MACD_SIGNAL', 9, 5, 15),
      bollingerPeriod: this.getNumber('BOLLINGER_PERIOD', 20, 10, 50),
      bollingerStdDev: this.getNumber('BOLLINGER_STD_DEV', 2, 1, 3),
      
      // 信号过滤配置
      signalConfirmCount: this.getNumber('SIGNAL_CONFIRM_COUNT', 3, 1, 5),
      baseCooldown: this.getNumber('BASE_COOLDOWN', 300000, 60000, 600000),
      minCooldown: this.getNumber('MIN_COOLDOWN', 120000, 30000, 300000),
      maxCooldown: this.getNumber('MAX_COOLDOWN', 600000, 300000, 1800000),
      
      // 并发控制配置
      batchSize: this.getNumber('BATCH_SIZE', 5, 1, 20),
      limiterMinTime: this.getNumber('LIMITER_MIN_TIME', 500, 100, 5000),
      limiterMaxConcurrent: this.getNumber('LIMITER_MAX_CONCURRENT', 3, 1, 10),
      
      // 缓存配置
      klineCacheTTL: this.getNumber('KLINE_CACHE_TTL', 300000, 60000, 600000),
      priceCacheTTL: this.getNumber('PRICE_CACHE_TTL', 30000, 10000, 120000),
      indicatorCacheTTL: this.getNumber('INDICATOR_CACHE_TTL', 300000, 60000, 600000),
      
      // 通知配置
      wechatWebhook: process.env.WECHAT_WEBHOOK || '',
      enableNotifications: this.getBoolean('ENABLE_NOTIFICATIONS', true),
      
      // 日志配置
      logLevel: process.env.LOG_LEVEL || 'INFO',
      logToFile: this.getBoolean('LOG_TO_FILE', false),
      logFilePath: process.env.LOG_FILE_PATH || './logs/etf-strategy.log',
      
      // 报告配置
      reportOutputDir: process.env.REPORT_OUTPUT_DIR || './data/reports',
      generateHTMLReport: this.getBoolean('GENERATE_HTML_REPORT', true),
      generateJSONReport: this.getBoolean('GENERATE_JSON_REPORT', true)
    };
    
    // 验证配置
    this.validateConfig();
    
    return this.config;
  }

  /**
   * 获取数字配置项
   * @param {string} key - 环境变量键
   * @param {number} defaultValue - 默认值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 配置值
   */
  getNumber(key, defaultValue, min, max) {
    const value = Number(process.env[key]);
    
    if (isNaN(value)) {
      return defaultValue;
    }
    
    if (value < min) {
      this.validationWarnings.push(`${key}=${value} 低于最小值${min}，已调整为${min}`);
      return min;
    }
    
    if (value > max) {
      this.validationWarnings.push(`${key}=${value} 超过最大值${max}，已调整为${max}`);
      return max;
    }
    
    return value;
  }

  /**
   * 获取布尔配置项
   * @param {string} key - 环境变量键
   * @param {boolean} defaultValue - 默认值
   * @returns {boolean} 配置值
   */
  getBoolean(key, defaultValue) {
    const value = process.env[key];
    
    if (value === undefined || value === null) {
      return defaultValue;
    }
    
    return value !== 'false' && value !== '0';
  }

  /**
   * 解析JSON配置
   * @param {string} jsonString - JSON字符串
   * @param {*} defaultValue - 默认值
   * @returns {*} 解析结果
   */
  parseJSON(jsonString, defaultValue) {
    if (!jsonString) return defaultValue;
    
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      this.validationErrors.push(`JSON解析失败: ${error.message}`);
      return defaultValue;
    }
  }

  /**
   * 验证配置
   */
  validateConfig() {
    // 验证必需配置
    if (!this.config.symbols || this.config.symbols.length === 0) {
      this.validationErrors.push('未配置ETF标的（ETF_SYMBOLS_JSON）');
    }
    
    // 验证止损止盈关系
    if (this.config.stopLossPercent >= this.config.takeProfitPercent) {
      this.validationWarnings.push('止损比例应小于止盈比例');
    }
    
    // 验证追踪止损
    if (this.config.trailingStopPercent >= this.config.stopLossPercent) {
      this.validationWarnings.push('追踪止损应小于固定止损');
    }
    
    // 验证仓位配置
    if (this.config.maxSinglePosition > this.config.maxTotalPosition) {
      this.validationWarnings.push('单个仓位上限不应超过总仓位上限');
    }
    
    // 验证MACD参数
    if (this.config.macdFast >= this.config.macdSlow) {
      this.validationErrors.push('MACD快线周期应小于慢线周期');
    }
    
    // 验证冷却期配置
    if (this.config.minCooldown > this.config.baseCooldown) {
      this.validationWarnings.push('最小冷却期不应大于基础冷却期');
    }
    
    if (this.config.baseCooldown > this.config.maxCooldown) {
      this.validationWarnings.push('基础冷却期不应大于最大冷却期');
    }
    
    // 验证缓存TTL
    if (this.config.priceCacheTTL > this.config.klineCacheTTL) {
      this.validationWarnings.push('价格缓存TTL不应大于K线缓存TTL');
    }
    
    // 验证输出目录
    if (this.config.generateHTMLReport || this.config.generateJSONReport) {
      this.ensureDirectoryExists(this.config.reportOutputDir);
    }
    
    if (this.config.logToFile) {
      const logDir = path.dirname(this.config.logFilePath);
      this.ensureDirectoryExists(logDir);
    }
  }

  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   */
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch (error) {
        this.validationErrors.push(`无法创建目录 ${dirPath}: ${error.message}`);
      }
    }
  }

  /**
   * 获取验证结果
   * @returns {Object} 验证结果
   */
  getValidationResult() {
    return {
      isValid: this.validationErrors.length === 0,
      errors: this.validationErrors,
      warnings: this.validationWarnings
    };
  }

  /**
   * 打印配置摘要
   */
  printSummary() {
    console.log('\n=== 配置摘要 ===');
    console.log(`ETF标的数量: ${this.config.symbols.length}`);
    console.log(`回看天数: ${this.config.lookbackDays}天`);
    console.log(`止损比例: ${(this.config.stopLossPercent * 100).toFixed(1)}%`);
    console.log(`止盈比例: ${(this.config.takeProfitPercent * 100).toFixed(1)}%`);
    console.log(`最大日交易次数: ${this.config.maxDailyTrades}`);
    console.log(`批处理大小: ${this.config.batchSize}`);
    console.log(`并发数: ${this.config.limiterMaxConcurrent}`);
    
    if (this.validationWarnings.length > 0) {
      console.log('\n⚠️ 配置警告:');
      this.validationWarnings.forEach(warning => {
        console.log(`  - ${warning}`);
      });
    }
    
    if (this.validationErrors.length > 0) {
      console.log('\n❌ 配置错误:');
      this.validationErrors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    console.log('');
  }

  /**
   * 获取配置项
   * @param {string} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue = null) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  /**
   * 导出配置到文件
   * @param {string} filePath - 文件路径
   */
  exportConfig(filePath) {
    try {
      const configData = {
        ...this.config,
        exportTime: new Date().toISOString(),
        validationResult: this.getValidationResult()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(configData, null, 2));
      console.log(`✅ 配置已导出到: ${filePath}`);
    } catch (error) {
      console.error(`❌ 配置导出失败: ${error.message}`);
    }
  }
}

module.exports = ConfigManager;

