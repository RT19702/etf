// 🚀 增强版ETF轮动策略（集成所有新功能）
require('dotenv').config({ path: './config/.env' });
const axios = require('axios');
const fs = require('fs');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

// 配置dayjs时区插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');
const Bottleneck = require('bottleneck');
const decimal = require('decimal.js');

// 导入新增模块
const WeChatBot = require('./src/utils/wechatBot');
const NumberFormatter = require('./src/utils/numberFormatter');
const { FormatManager } = require('./src/config/formatConfig');
const TechnicalIndicators = require('./src/utils/technicalIndicators');
const BacktestEngine = require('./src/utils/backtestEngine');
const DataSourceManager = require('./src/utils/dataSourceManager');
const { SpecialWatchManager } = require('./src/utils/specialWatch');
const HTMLReportGenerator = require('./src/utils/htmlReportGenerator');
const { RiskManager } = require('./src/utils/riskManager');
const SmartPortfolioManager = require('./src/utils/smartPortfolioManager');
const PushManager = require('./src/utils/pushManager');
const ConfigManager = require('./src/utils/configManager'); // 优化：统一配置管理
const { initLogger, getLogger } = require('./src/utils/logger'); // 优化：统一日志系统

decimal.set({ precision: 12, rounding: decimal.ROUND_HALF_UP });

const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

function color(text, clr) { return (COLORS[clr] || '') + text + COLORS.reset; }
function stripAnsi(str) { return str.replace(/\x1b\[[0-9;]*m/g, ''); }

// 优化：使用统一配置管理器
const configManager = new ConfigManager();
const CONFIG = configManager.loadConfig();

// 打印配置验证结果
const validationResult = configManager.getValidationResult();
if (!validationResult.isValid) {
  console.error('❌ 配置验证失败:');
  validationResult.errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

// 打印配置摘要
configManager.printSummary();

// 优化：初始化日志系统
const logger = initLogger({
  level: CONFIG.logLevel,
  logToFile: CONFIG.logToFile,
  logFilePath: CONFIG.logFilePath,
  logToConsole: true
});

logger.info('ETF交易策略系统启动');
logger.info('配置加载完成', {
  symbols: CONFIG.symbols.length,
  lookbackDays: CONFIG.lookbackDays,
  stopLoss: CONFIG.stopLossPercent,
  takeProfit: CONFIG.takeProfitPercent
});

// 兼容旧配置格式
CONFIG.momentumWindow = Number(process.env.MOMENTUM_WINDOW) || 20;
CONFIG.rotationThreshold = Number(process.env.ROTATION_THRESHOLD) || 1.0;
CONFIG.marketTrendThreshold = Number(process.env.MARKET_TREND_THRESHOLD) || 0.5;
CONFIG.REALTIME_API = process.env.REALTIME_API;
CONFIG.KLINE_API = process.env.KLINE_API;
CONFIG.marketIndexSymbol = process.env.MARKET_INDEX_SYMBOL || 'sh000300';
CONFIG.minBuySellGap = Number(process.env.MIN_BUY_SELL_GAP) || 0.02;
CONFIG.returnDecimals = Number(process.env.RETURN_DECIMALS || 2);

// 初始化数据源管理器和特别关注管理器
const dataSourceManager = new DataSourceManager();
const specialWatchManager = new SpecialWatchManager();
const htmlReportGenerator = new HTMLReportGenerator();

// 优化：初始化市场环境检测器
// 修复：使用默认导入而不是解构导入
const MarketEnvironmentDetector = require('./src/utils/marketEnvironmentDetector');
const marketEnvironmentDetector = new MarketEnvironmentDetector();

// 初始化增强风险管理器
const riskManager = new RiskManager({
  stopLossPercent: Number(process.env.STOP_LOSS_PERCENT) || 0.05,
  trailingStopPercent: Number(process.env.TRAILING_STOP_PERCENT) || 0.03,
  takeProfitPercent: Number(process.env.TAKE_PROFIT_PERCENT) || 0.15,
  timeStopHours: Number(process.env.TIME_STOP_HOURS) || 24,
  atrMultiplier: Number(process.env.ATR_MULTIPLIER) || 2.0,
  technicalStopEnabled: process.env.TECHNICAL_STOP_ENABLED !== 'false',
  maxDailyTrades: Number(process.env.MAX_DAILY_TRADES) || 10,
  maxTotalPosition: Number(process.env.MAX_TOTAL_POSITION) || 0.8,
  maxSinglePosition: Number(process.env.MAX_SINGLE_POSITION) || 0.3,
  volatilityThreshold: Number(process.env.VOLATILITY_THRESHOLD) || 3.0
});

// 初始化智能持仓管理器
const portfolioManager = new SmartPortfolioManager();

// 全局市场环境变量（在分析过程中更新）
let currentMarketEnvironment = null;

// 优化：批量处理参数支持动态配置
const batchSize = Math.max(1, Number(process.env.BATCH_SIZE) || 5);

// 优化：自适应限流器配置
class AdaptiveLimiter {
  constructor() {
    this.config = {
      minTime: Number(process.env.LIMITER_MIN_TIME) || 500,
      maxConcurrent: Number(process.env.LIMITER_MAX_CONCURRENT) || 3,
      // 自适应参数
      minMinTime: 200,      // 最小请求间隔
      maxMinTime: 2000,     // 最大请求间隔
      minConcurrent: 1,     // 最小并发数
      maxConcurrent: 5      // 最大并发数
    };

    this.limiter = new Bottleneck({
      minTime: this.config.minTime,
      maxConcurrent: this.config.maxConcurrent
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
    const currentMinTime = this.limiter._minTime;
    const currentMaxConcurrent = this.limiter._maxConcurrent;

    // 减少请求间隔（最多减少20%）
    const newMinTime = Math.max(
      this.config.minMinTime,
      Math.floor(currentMinTime * 0.8)
    );

    // 增加并发数（最多+1）
    const newMaxConcurrent = Math.min(
      this.config.maxConcurrent,
      currentMaxConcurrent + 1
    );

    if (newMinTime !== currentMinTime || newMaxConcurrent !== currentMaxConcurrent) {
      this.limiter.updateSettings({
        minTime: newMinTime,
        maxConcurrent: newMaxConcurrent
      });

      console.log(`🚀 限流器性能提升: minTime ${currentMinTime}→${newMinTime}ms, maxConcurrent ${currentMaxConcurrent}→${newMaxConcurrent}`);
    }
  }

  /**
   * 降低性能（减少并发，增加间隔）
   */
  decreasePerformance() {
    const currentMinTime = this.limiter._minTime;
    const currentMaxConcurrent = this.limiter._maxConcurrent;

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

      console.log(`⚠️ 限流器性能降低: minTime ${currentMinTime}→${newMinTime}ms, maxConcurrent ${currentMaxConcurrent}→${newMaxConcurrent}`);
    }
  }

  /**
   * 高错误率时的紧急调整
   */
  adjustForHighErrorRate() {
    const currentMinTime = this.limiter._minTime;
    const currentMaxConcurrent = this.limiter._maxConcurrent;

    // 大幅增加间隔，减少并发
    const newMinTime = Math.min(this.config.maxMinTime, currentMinTime * 2);
    const newMaxConcurrent = Math.max(this.config.minConcurrent, Math.floor(currentMaxConcurrent / 2));

    this.limiter.updateSettings({
      minTime: newMinTime,
      maxConcurrent: newMaxConcurrent
    });

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
      currentMinTime: this.limiter._minTime,
      currentMaxConcurrent: this.limiter._maxConcurrent
    };
  }
}

// 创建自适应限流器实例
const limiter = new AdaptiveLimiter();

// 优化：增强内存缓存，添加TTL过期时间机制，避免使用过期数据
const cache = {
  kline: new Map(), // 存储格式: { data, timestamp }
  price: new Map(), // 存储格式: { data, timestamp }
  indicators: new Map(), // 优化：新增技术指标缓存
  ttl: {
    kline: 5 * 60 * 1000, // K线数据缓存5分钟
    price: 30 * 1000,     // 实时价格缓存30秒
    indicators: 5 * 60 * 1000 // 技术指标缓存5分钟（与K线数据一致）
  },
  // 检查缓存是否过期
  isExpired(type, key) {
    const cacheMap = this.getCacheMap(type);
    if (!cacheMap.has(key)) return true;

    const cached = cacheMap.get(key);
    const now = Date.now();
    const ttl = this.ttl[type];

    return (now - cached.timestamp) > ttl;
  },
  // 获取缓存数据
  get(type, key) {
    if (this.isExpired(type, key)) {
      const cacheMap = this.getCacheMap(type);
      cacheMap.delete(key); // 删除过期缓存
      return null;
    }
    const cacheMap = this.getCacheMap(type);
    return cacheMap.get(key).data;
  },
  // 设置缓存数据
  set(type, key, data) {
    const cacheMap = this.getCacheMap(type);
    cacheMap.set(key, {
      data,
      timestamp: Date.now()
    });
  },
  getCacheMap(type) {
    switch (type) {
      case 'kline': return this.kline;
      case 'price': return this.price;
      case 'indicators': return this.indicators;
      default: return this.kline;
    }
  },
  // 优化：清理过期缓存
  cleanup() {
    const now = Date.now();

    // 清理K线缓存
    for (const [key, value] of this.kline.entries()) {
      if (now - value.timestamp > this.ttl.kline) {
        this.kline.delete(key);
      }
    }

    // 清理价格缓存
    for (const [key, value] of this.price.entries()) {
      if (now - value.timestamp > this.ttl.price) {
        this.price.delete(key);
      }
    }

    // 清理技术指标缓存
    for (const [key, value] of this.indicators.entries()) {
      if (now - value.timestamp > this.ttl.indicators) {
        this.indicators.delete(key);
      }
    }
  },
  // 优化：获取缓存统计信息
  getStats() {
    return {
      klineCount: this.kline.size,
      priceCount: this.price.size,
      indicatorsCount: this.indicators.size,
      totalSize: this.kline.size + this.price.size + this.indicators.size
    };
  }
};

// 优化：定期清理过期缓存（每5分钟）
setInterval(() => {
  cache.cleanup();
  const stats = cache.getStats();
  console.log(`🧹 缓存清理完成: K线${stats.klineCount}个, 价格${stats.priceCount}个, 指标${stats.indicatorsCount}个`);
}, 5 * 60 * 1000);

// 通用重试机制（优化：使用新的缓存机制）
async function fetchWithRetry(fn, key, type = 'kline', retries = 3, delay = 800) {
  // 优先查缓存（使用TTL机制）
  const cachedData = cache.get(type, key);
  if (cachedData !== null) {
    return cachedData;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      // 使用新的缓存设置方法
      cache.set(type, key, result);
      return result;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function financial(num, decimals = 4) {
  return new decimal(num).toDecimalPlaces(decimals).toNumber();
}

// 增强的ETF分析函数
async function analyzeSymbolEnhanced(etf) {
  try {
    console.log(color(`  🔍 分析 ${etf.name}...`, 'gray'));
    
    // 使用多数据源获取K线数据（带缓存和重试）
    // 优化：MACD需要至少34天数据（26+9-1），增加安全边际到50天
    // 确保有足够的历史数据进行准确的技术指标计算
    const requiredDays = Math.max(CONFIG.lookbackDays + 30, 60); // 增加安全边际
    const kline = await fetchWithRetry(
      () => dataSourceManager.fetchKlineData(etf.symbol, requiredDays),
      etf.symbol + '_kline', 'kline', 3, 800
    );
    // 优化：提高最小数据要求从35天到50天，确保MACD等指标计算准确
    const minRequiredDays = 50;
    if (!kline || kline.length < minRequiredDays) {
      console.log(color(`    ⚠️ ${etf.name} 数据不足 (需要至少${minRequiredDays}天，实际${kline?.length || 0}天)`, 'yellow'));
      return null;
    }

    // 使用所有可用数据计算技术指标，但统计分析仍使用最近的数据
    const recent = kline.slice(-CONFIG.lookbackDays);
    const allPrices = kline.map(d => d.close);
    const allHighs = kline.map(d => d.high);
    const allLows = kline.map(d => d.low);
    const allVolumes = kline.map(d => d.volume);

    // 用于统计分析的最近数据
    const prices = recent.map(d => d.close);
    const highs = recent.map(d => d.high);
    const lows = recent.map(d => d.low);
    const volumes = recent.map(d => d.volume);

    // 动态参数调整：根据波动率自动调整窗口
    let momentumWindow = CONFIG.momentumWindow;
    const { avg, std, ma5, volatility } = calcStat(recent);
    if (volatility > 3) momentumWindow = Math.max(10, Math.floor(momentumWindow * 0.8));
    if (volatility < 1) momentumWindow = Math.min(30, Math.floor(momentumWindow * 1.2));

    // 获取实时价格（带缓存和重试）
    const current = await fetchWithRetry(
      () => dataSourceManager.fetchRealTimePrice(etf.symbol),
      etf.symbol + '_price', 'price', 3, 800
    );
    if (!current) {
      console.log(color(`    ❌ ${etf.name} 无法获取实时价格`, 'red'));
      return null;
    }

    // 优化：计算技术指标（增强版 - 包含新增指标 + 缓存机制）
    // 使用所有可用数据计算技术指标，确保MACD等指标有足够的历史数据

    // 生成缓存键（基于symbol和数据时间戳）
    const indicatorCacheKey = `${etf.symbol}_${kline[kline.length - 1].date}`;

    // 尝试从缓存获取
    let technicalIndicators = cache.get('indicators', indicatorCacheKey);

    if (!technicalIndicators) {
      // 缓存未命中，计算技术指标
      technicalIndicators = {
        rsi: TechnicalIndicators.calculateRSI(allPrices),
        macd: TechnicalIndicators.calculateMACD(allPrices),
        bollinger: TechnicalIndicators.calculateBollingerBands(allPrices),
        kdj: TechnicalIndicators.calculateKDJ(allHighs, allLows, allPrices),
        williamsR: TechnicalIndicators.calculateWilliamsR(allHighs, allLows, allPrices),
        cci: TechnicalIndicators.calculateCCI(allHighs, allLows, allPrices),
        atr: TechnicalIndicators.calculateATR(allHighs, allLows, allPrices),
        volumeRatio: TechnicalIndicators.calculateVolumeRatio(allVolumes),
        momentum: TechnicalIndicators.calculateMomentum(allPrices, momentumWindow),
        currentPrice: current
      };

      // 存入缓存
      cache.set('indicators', indicatorCacheKey, technicalIndicators);
    } else {
      // 缓存命中，更新当前价格
      technicalIndicators.currentPrice = current;
    }

    // 信号融合：多指标加权
    const fusionScore = (
      (technicalIndicators.rsi ? Math.max(0, Math.min(technicalIndicators.rsi, 100)) : 50) * 0.2 +
      (technicalIndicators.macd && technicalIndicators.macd.macd ? technicalIndicators.macd.macd : 0) * 10 * 0.15 +
      (technicalIndicators.kdj && technicalIndicators.kdj.k ? technicalIndicators.kdj.k : 50) * 0.15 +
      (technicalIndicators.momentum ? technicalIndicators.momentum : 0) * 0.1 +
      (technicalIndicators.bollinger && technicalIndicators.bollinger.width ? technicalIndicators.bollinger.width : 0) * 10 * 0.1 +
      (technicalIndicators.volumeRatio ? technicalIndicators.volumeRatio : 1) * 10 * 0.1 +
      (technicalIndicators.atr && technicalIndicators.atr.percentage ? (100 - technicalIndicators.atr.percentage) : 50) * 0.2
    );

    // 检查是否为实际持仓，如果是则更新持仓价格和监控风险
    const position = portfolioManager.getPositionBySymbol(etf.symbol);
    if (position) {
      portfolioManager.updatePositionPrice(etf.symbol, current, technicalIndicators);
      const positionSignals = portfolioManager.checkStopLossAndTakeProfit(etf.symbol, technicalIndicators);
      if (positionSignals && positionSignals.length > 0) {
        console.log(`🚨 ${etf.symbol} 持仓风险提醒:`, positionSignals.map(s => s.message).join(', '));
      }
    }

    // 技术分析评分（融合分数）
    const technicalScore = TechnicalIndicators.getTechnicalScore(technicalIndicators);
    technicalScore.fusionScore = fusionScore;

    // 动态买卖点计算（结合技术指标）
    const kBuy = financial(0.8 - (volatility - 10) * 0.005);
    const kSell = financial(1.0 + (volatility - 10) * 0.005);

    const priceDecimals = determinePriceDecimals(current);
    let buy = financial(avg - kBuy * std, priceDecimals);
    let sell = financial(avg + kSell * std, priceDecimals);

    // 根据技术指标调整买卖点
    if (technicalIndicators.rsi && technicalIndicators.rsi < 30) {
      buy = financial(buy * 1.02, priceDecimals);
    }
    if (technicalIndicators.rsi && technicalIndicators.rsi > 70) {
      sell = financial(sell * 0.98, priceDecimals);
    }

    if (sell <= buy) sell = financial(buy + avg * CONFIG.minBuySellGap, priceDecimals);

    // 优化：综合信号生成（融合分数参与，考虑市场环境）
    const signal = generateEnhancedSignal(
      current,
      buy,
      sell,
      technicalScore,
      technicalIndicators,
      fusionScore,
      currentMarketEnvironment // 传入市场环境
    );

    return {
      ...etf,
      current,
      buy,
      sell,
      ma5,
      volatility: `${volatility.toFixed(2)}%`,
      signal,
      technicalScore,
      technicalIndicators,
      kline,
      priceDecimals
    };

  } catch (error) {
    console.log(color(`    ❌ ${etf.name} 分析失败: ${error.message}`, 'red'));
    return null;
  }
}

/**
 * 根据市场环境动态调整信号权重
 * @param {Object} marketEnvironment - 市场环境数据
 * @returns {Object} 权重配置
 */
function getAdaptiveWeights(marketEnvironment) {
  // 默认权重
  const defaultWeights = {
    price: 0.30,
    technical: 0.25,
    macd: 0.20,
    rsi: 0.15,
    kdj: 0.10
  };

  // 如果没有市场环境数据，返回默认权重
  if (!marketEnvironment) return defaultWeights;

  const weights = { ...defaultWeights };

  // 根据市场趋势调整
  if (marketEnvironment.trend) {
    if (marketEnvironment.trend.includes('bullish')) {
      // 牛市：增加技术指标权重，减少价格权重
      weights.technical += 0.05;
      weights.macd += 0.03;
      weights.price -= 0.08;
    } else if (marketEnvironment.trend.includes('bearish')) {
      // 熊市：增加价格权重，减少技术指标权重
      weights.price += 0.08;
      weights.technical -= 0.05;
      weights.macd -= 0.03;
    }
  }

  // 根据波动率调整
  if (marketEnvironment.volatility) {
    if (marketEnvironment.volatility === 'high') {
      // 高波动：增加RSI和KDJ权重（更敏感的指标）
      weights.rsi += 0.05;
      weights.kdj += 0.05;
      weights.price -= 0.05;
      weights.technical -= 0.05;
    } else if (marketEnvironment.volatility === 'low') {
      // 低波动：增加MACD权重（趋势指标）
      weights.macd += 0.05;
      weights.rsi -= 0.03;
      weights.kdj -= 0.02;
    }
  }

  // 确保权重总和为1
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    // 归一化权重
    Object.keys(weights).forEach(key => {
      weights[key] = weights[key] / totalWeight;
    });
  }

  return weights;
}

// 增强信号生成（智能决策版本 - 避免信号矛盾）
// 优化：添加市场环境参数，根据市场情况调整信号权重
function generateEnhancedSignal(current, buy, sell, technicalScore, indicators, fusionScore, marketEnvironment = null) {
  // 收集所有信号源
  const signalSources = [];

  // 优化：根据市场环境动态调整权重
  const weights = getAdaptiveWeights(marketEnvironment);

  // 1. 基础价格信号
  let priceSignal = 0;
  if (current < buy) {
    priceSignal = 1; // 买入
  } else if (current > sell) {
    priceSignal = -1; // 卖出
  }
  signalSources.push({ source: 'price', signal: priceSignal, weight: weights.price, strength: Math.abs(priceSignal) });

  // 2. 技术评分信号
  const fusion = fusionScore !== undefined ? fusionScore : technicalScore.score;
  let techSignal = 0;
  let techStrength = 0;
  if (fusion >= 70) {
    techSignal = 1;
    techStrength = Math.min((fusion - 50) / 50, 1);
  } else if (fusion <= 30) {
    techSignal = -1;
    techStrength = Math.min((50 - fusion) / 50, 1);
  }
  signalSources.push({ source: 'technical', signal: techSignal, weight: weights.technical, strength: techStrength });

  // 3. MACD信号
  let macdSignal = 0;
  let macdStrength = 0;
  if (indicators.macd && indicators.macd.macd !== undefined && indicators.macd.signal !== undefined) {
    const macdDiff = indicators.macd.macd - indicators.macd.signal;
    if (macdDiff > 0) {
      macdSignal = 1;
      macdStrength = Math.min(Math.abs(macdDiff) * 100, 1);
    } else if (macdDiff < 0) {
      macdSignal = -1;
      macdStrength = Math.min(Math.abs(macdDiff) * 100, 1);
    }
  }
  signalSources.push({ source: 'macd', signal: macdSignal, weight: weights.macd, strength: macdStrength });

  // 4. RSI信号
  let rsiSignal = 0;
  let rsiStrength = 0;
  if (indicators.rsi) {
    if (indicators.rsi < 30) {
      rsiSignal = 1;
      rsiStrength = (30 - indicators.rsi) / 30;
    } else if (indicators.rsi > 70) {
      rsiSignal = -1;
      rsiStrength = (indicators.rsi - 70) / 30;
    }
  }
  signalSources.push({ source: 'rsi', signal: rsiSignal, weight: weights.rsi, strength: rsiStrength });

  // 5. KDJ信号
  let kdjSignal = 0;
  let kdjStrength = 0;
  if (indicators.kdj && indicators.kdj.k !== undefined && indicators.kdj.d !== undefined) {
    const k = parseFloat(indicators.kdj.k);
    const d = parseFloat(indicators.kdj.d);
    if (k > d && k < 50) {
      kdjSignal = 1;
      kdjStrength = 0.8;
    } else if (k < d && k > 50) {
      kdjSignal = -1;
      kdjStrength = 0.8;
    }
  }
  signalSources.push({ source: 'kdj', signal: kdjSignal, weight: weights.kdj, strength: kdjStrength });

  // 计算加权综合信号
  let weightedSignal = 0;
  let totalWeight = 0;
  let signalStrength = 0;

  signalSources.forEach(source => {
    const effectiveWeight = source.weight * (0.5 + source.strength * 0.5); // 强度影响权重
    weightedSignal += source.signal * effectiveWeight;
    totalWeight += effectiveWeight;
    signalStrength += Math.abs(source.signal) * source.strength * source.weight;
  });

  // 标准化信号
  if (totalWeight > 0) {
    weightedSignal = weightedSignal / totalWeight;
  }

  // 决定最终信号
  let finalSignal = '持有';
  let signalColor = 'green';
  let confidence = '中等';

  if (weightedSignal > 0.3) {
    if (weightedSignal > 0.6 && signalStrength > 0.4) {
      finalSignal = '强烈买入';
      confidence = '高';
    } else {
      finalSignal = '买入';
      confidence = signalStrength > 0.3 ? '高' : '中等';
    }
    signalColor = 'blue';
  } else if (weightedSignal < -0.3) {
    if (weightedSignal < -0.6 && signalStrength > 0.4) {
      finalSignal = '强烈卖出';
      confidence = '高';
    } else {
      finalSignal = '卖出';
      confidence = signalStrength > 0.3 ? '高' : '中等';
    }
    signalColor = 'red';
  } else {
    // 中性区间，根据信号强度决定是否给出弱势信号
    if (weightedSignal > 0.1 && signalStrength > 0.2) {
      finalSignal = '弱势买入';
      signalColor = 'blue';
    } else if (weightedSignal < -0.1 && signalStrength > 0.2) {
      finalSignal = '弱势卖出';
      signalColor = 'red';
    }
  }

  return {
    text: color(finalSignal, signalColor),
    level: finalSignal,
    confidence,
    score: technicalScore.score,
    fusionScore: fusion,
    signals: technicalScore.signals,
    weightedSignal: weightedSignal.toFixed(3),
    signalStrength: signalStrength.toFixed(3)
  };
}

// 根据价格大小动态确定小数位数
function determinePriceDecimals(price) {
  if (price >= 100) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 3;
  return 4;
}

// 基础统计计算
function calcStat(data) {
  const closes = data.map(d => new decimal(d.close));
  const avg = closes.reduce((a, b) => a.add(b)).dividedBy(closes.length);
  const variance = closes.map(x => x.minus(avg).pow(2)).reduce((a, b) => a.add(b)).dividedBy(closes.length);
  let std = variance.sqrt();
  
  if (std.isNaN() || std.lte(0)) {
    std = avg.mul(0.1);
  }
  
  const ma5 = closes.slice(-5).reduce((a, b) => a.add(b)).dividedBy(5);
  
  return {
    avg: financial(avg),
    std: financial(std),
    ma5: financial(ma5),
    volatility: financial(std.dividedBy(avg).times(100))
  };
}

// 生成增强版策略推荐
function generateEnhancedStrategy(stats) {
  if (!stats || stats.length === 0) {
    return {
      action: '无数据',
      recommendation: '无',
      marketTrend: '0%',
      top3: []
    };
  }

  // 统计各种信号
  const strongBuys = stats.filter(s => s.signal?.level?.includes('强烈买入'));
  const buys = stats.filter(s => s.signal?.level?.includes('买入') && !s.signal?.level?.includes('强烈'));
  const sells = stats.filter(s => s.signal?.level?.includes('卖出'));
  const holds = stats.filter(s => s.signal?.level?.includes('持有'));
  const conflicts = stats.filter(s => s.signal?.level?.includes('矛盾'));

  // 计算市场趋势（基于价格偏离的平均值）
  const priceDeviations = stats.map(s => {
    const deviation = ((s.current - s.ma5) / s.ma5) * 100;
    return isNaN(deviation) ? 0 : deviation;
  });
  const avgDeviation = priceDeviations.reduce((sum, dev) => sum + dev, 0) / priceDeviations.length;

  // 找出前三强势ETF（基于技术评分和价格偏离）
  const sortedByStrength = stats
    .filter(s => s.technicalScore?.score)
    .sort((a, b) => {
      const scoreA = a.technicalScore.score + ((a.current - a.ma5) / a.ma5) * 100;
      const scoreB = b.technicalScore.score + ((b.current - b.ma5) / b.ma5) * 100;
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map(s => `${s.name} (评分:${NumberFormatter.formatTechnicalScore(s.technicalScore.score, 0)})`);

  // 生成推荐操作
  let action = '持有';
  let recommendation = '无明确推荐';

  if (strongBuys.length > 0) {
    action = '买入';
    recommendation = strongBuys[0].name;
  } else if (buys.length > sells.length && buys.length > 2) {
    action = '谨慎买入';
    recommendation = buys.sort((a, b) => (b.technicalScore?.score || 0) - (a.technicalScore?.score || 0))[0].name;
  } else if (sells.length > buys.length && sells.length > stats.length * 0.6) {
    action = '减仓';
    recommendation = '建议减少仓位';
  } else if (conflicts.length > stats.length * 0.3) {
    action = '信号矛盾，建议空仓';
    recommendation = '等待明确信号';
  }

  // 检查特别关注ETF
  const specialWatchAlerts = specialWatchManager.checkAllWatchConditions(stats);

  return {
    action,
    recommendation,
    marketTrend: `${avgDeviation.toFixed(2)}%`,
    top3: sortedByStrength,
    specialWatchAlerts
  };
}

// 增强报告生成
function generateEnhancedReport(strategies, stats) {
  // 生成增强版策略推荐
  const enhancedStrategy = generateEnhancedStrategy(stats);

  const report = {
    title: 'ETF轮动策略增强报告',
    date: dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
    version: '2.0 Enhanced',
    summary: {
      推荐操作: enhancedStrategy.action,
      推荐标的: enhancedStrategy.recommendation,
      市场趋势: enhancedStrategy.marketTrend,
      前三强势: enhancedStrategy.top3
    },
    specialWatchAlerts: enhancedStrategy.specialWatchAlerts || [],
    technicalAnalysis: {
      强烈买入: stats.filter(s => s.signal?.level?.includes('强烈买入')).length,
      买入: stats.filter(s => s.signal?.level?.includes('买入') && !s.signal?.level?.includes('强烈')).length,
      持有: stats.filter(s => s.signal?.level?.includes('持有')).length,
      卖出: stats.filter(s => s.signal?.level?.includes('卖出')).length,
      信号矛盾: stats.filter(s => s.signal?.level?.includes('矛盾')).length
    },
    riskManagement: {
      配置: {
        固定止损: `${(riskManager.config.stopLossPercent * 100).toFixed(1)}%`,
        追踪止损: `${(riskManager.config.trailingStopPercent * 100).toFixed(1)}%`,
        止盈目标: `${(riskManager.config.takeProfitPercent * 100).toFixed(1)}%`,
        时间止损: `${riskManager.config.timeStopHours}小时`,
        ATR倍数: riskManager.config.atrMultiplier,
        技术止损: riskManager.config.technicalStopEnabled ? '启用' : '禁用'
      },
      统计: riskManager.getRiskMetrics(),
      当前持仓: Array.from(riskManager.positions.values()).map(pos => ({
        标的: pos.symbol,
        入场价: pos.entryPrice,
        当前止损: pos.currentStopLoss,
        止损类型: pos.stopLossType,
        止盈价: pos.takeProfit
      }))
    },
    data: stats.map(s => {
      // 使用格式化管理器统一处理数值格式化
      const formattedData = {
        ETF: s.name,
        代码: s.symbol,
        当前价格: FormatManager.format(s.current, 'prices', 'current'),
        买入阈值: FormatManager.format(s.buy, 'prices', 'buy'),
        卖出阈值: FormatManager.format(s.sell, 'prices', 'sell'),
        MA5均线: FormatManager.format(s.ma5, 'prices', 'ma5'),
        波动率: s.volatility,
        交易信号: stripAnsi(s.signal?.text || s.signal),
        技术评分: FormatManager.format(s.technicalScore?.score, 'report', 'technicalScore'),
        信号强度: s.signal?.confidence || '中等',
        RSI: FormatManager.format(s.technicalIndicators?.rsi, 'report', 'rsi'),
        MACD: FormatManager.format(s.technicalIndicators?.macd, 'report', 'macd'),
        KDJ_K: FormatManager.format(s.technicalIndicators?.kdj?.k, 'technicalIndicators', 'kdj'),
        KDJ_D: FormatManager.format(s.technicalIndicators?.kdj?.d, 'technicalIndicators', 'kdj'),
        KDJ_J: FormatManager.format(s.technicalIndicators?.kdj?.j, 'technicalIndicators', 'kdj'),
        KDJ信号: s.technicalIndicators?.kdj?.signal || 'N/A',
        威廉指标: FormatManager.format(s.technicalIndicators?.williamsR?.value, 'technicalIndicators', 'williamsR'),
        威廉信号: s.technicalIndicators?.williamsR?.signal || 'N/A',
        CCI: FormatManager.format(s.technicalIndicators?.cci?.value, 'technicalIndicators', 'cci'),
        CCI信号: s.technicalIndicators?.cci?.signal || 'N/A',
        ATR: FormatManager.format(s.technicalIndicators?.atr, 'technicalIndicators', 'atr'),
        ATR百分比: FormatManager.format(s.technicalIndicators?.atr?.percentage, 'percentages', 'volatility'),
        价格偏离: FormatManager.format(((s.current - s.ma5) / s.ma5) * 100, 'percentages', 'deviation'),
        风险等级: getRiskLevel(s.volatility)
      };
      return formattedData;
    }),
    dataSourceStatus: dataSourceManager.getStatus()
  };

  return report;
}

// 根据波动率评估风险等级
function getRiskLevel(volatilityStr) {
  const vol = parseFloat(volatilityStr.replace('%', ''));
  if (vol < 1) return '低风险';
  if (vol < 2) return '中等风险';
  if (vol < 3) return '较高风险';
  return '高风险';
}

// 企业微信推送函数
async function sendWeChatNotification(report) {
  try {
    if (process.env.ENABLE_WECHAT_PUSH !== 'true' || !process.env.WECHAT_WEBHOOK_URL) {
      console.log(color('📱 企业微信推送未启用或未配置', 'gray'));
      return;
    }

    const wechatBot = new WeChatBot(process.env.WECHAT_WEBHOOK_URL, {
      retryCount: Number(process.env.WECHAT_RETRY_COUNT) || 3,
      retryDelay: Number(process.env.WECHAT_RETRY_DELAY) || 1000,
      enableLog: process.env.WECHAT_ENABLE_LOG !== 'false'
    });

    // 格式化增强报告
    const content = formatEnhancedWeChatReport(report);
    const result = await wechatBot.sendMarkdown(content);

    if (result.success) {
      console.log(color('✅ 增强报告推送成功！', 'green'));
    } else {
      console.log(color(`❌ 增强报告推送失败: ${result.error}`, 'red'));
    }

  } catch (error) {
    console.log(color(`❌ 企业微信推送异常: ${error.message}`, 'red'));
  }
}

// 获取数据源友好名称
function getDataSourceName(sourceKey) {
  const sourceNames = {
    'primary': '腾讯财经',
    'backup1': '新浪财经',
    'backup2': '网易财经'
  };
  return sourceNames[sourceKey] || sourceKey;
}

// 格式化增强版企业微信报告
function formatEnhancedWeChatReport(report) {
  let content = `# 📊 ETF轮动策略（增强版）\n\n`;

  // 显示推送时间和报告生成时间
  if (report.pushTime && report.originalDate) {
    content += `**推送时间**: ${report.pushTime}\n`;
    content += `**报告生成**: ${report.originalDate}\n\n`;
  } else if (report.generatedAt) {
    content += `**报告时间**: ${dayjs(report.generatedAt).format('YYYY-MM-DD HH:mm:ss')}\n\n`;
  } else {
    content += `**报告时间**: ${report.date}\n\n`;
  }

  // 修复：添加市场环境分析（优化后的新功能）
  if (report.marketEnvironment) {
    const env = report.marketEnvironment;
    content += `## 🌍 市场环境分析\n`;

    // 趋势和波动率
    const trendColor = env.trend.includes('bullish') ? 'info' : env.trend.includes('bearish') ? 'warning' : 'comment';
    const volatilityColor = env.volatility === 'high' ? 'warning' : env.volatility === 'low' ? 'info' : 'comment';
    content += `- **市场趋势**: <font color="${trendColor}">${env.trend}</font>\n`;
    content += `- **波动率**: <font color="${volatilityColor}">${env.volatility}</font>\n`;
    content += `- **市场情绪**: ${env.sentiment}\n`;
    content += `- **市场状态**: <font color="info">${env.regime}</font>\n`;
    content += `- **分析置信度**: ${(env.confidence * 100).toFixed(0)}%\n\n`;

    // 市场广度和动量（如果有）
    if (env.breadth) {
      content += `**市场广度**: 上涨比例 ${(env.breadth.breadth * 100).toFixed(0)}%\n`;
    }
    if (env.momentum) {
      content += `**市场动量**: 强度 ${(env.momentum.strength * 100).toFixed(1)}%\n`;
    }
    content += `\n`;
  }

  // 核心推荐（美化）
  content += `## 🎯 策略推荐\n`;
  content += `- **推荐操作**: <font color="${report.summary.推荐操作.includes('买入') ? 'blue' : report.summary.推荐操作.includes('卖出') ? 'red' : 'black'}">${report.summary.推荐操作}</font>\n`;
  content += `- **推荐标的**: <font color="green">${report.summary.推荐标的}</font>\n`;
  content += `- **市场趋势**: <font color="orange">${report.summary.市场趋势}</font>\n\n`;
  // 技术分析统计（美化）
  content += `## 📈 技术分析统计\n`;
  content += `**交易信号分布**:\n`;
  content += `- 🔥 <font color="blue">强烈买入: ${report.technicalAnalysis.强烈买入}个</font> | 📈 买入: ${report.technicalAnalysis.买入}个\n`;
  content += `- 🔒 持有: ${report.technicalAnalysis.持有}个 | <font color="red">📉 卖出: ${report.technicalAnalysis.卖出}个</font>\n`;
  content += `- ⚠️ <font color="orange">信号矛盾: ${report.technicalAnalysis.信号矛盾}个</font>\n\n`;

  // 技术指标统计
  const totalETFs = report.data.length;
  const rsiOversold = report.data.filter(d => parseFloat(d.RSI) < 30).length;
  const rsiOverbought = report.data.filter(d => parseFloat(d.RSI) > 70).length;
  const kdjOversold = report.data.filter(d => d.KDJ信号 && d.KDJ信号.includes('超卖')).length;
  const kdjOverbought = report.data.filter(d => d.KDJ信号 && d.KDJ信号.includes('超买')).length;
  const williamsOversold = report.data.filter(d => d.威廉信号 && d.威廉信号.includes('超卖')).length;
  const cciOversold = report.data.filter(d => d.CCI信号 && d.CCI信号.includes('超卖')).length;

  content += `**技术指标统计** (共${totalETFs}个ETF):\n`;
  content += `- RSI: 超卖${rsiOversold}个 | 超买${rsiOverbought}个\n`;
  content += `- KDJ: 超卖${kdjOversold}个 | 超买${kdjOverbought}个\n`;
  content += `- 威廉: 超卖${williamsOversold}个 | CCI超卖: ${cciOversold}个\n\n`;
  
  // 重点关注 - 强烈买入机会
  const strongBuys = report.data.filter(d => d.交易信号.includes('强烈买入'));
  if (strongBuys.length > 0) {
    content += `## 💡 强烈买入机会\n`;
    strongBuys.forEach(etf => {
      content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
      content += `  - 📊 技术评分: ${etf.技术评分}/100 (${etf.信号强度})\n`;
      content += `  - 📈 基础指标: RSI=${etf.RSI} | MACD=${etf.MACD}\n`;
      // 使用KDJ字符串格式化方法
      const kdjString = NumberFormatter.formatKDJString({
        k: etf.KDJ_K,
        d: etf.KDJ_D,
        j: etf.KDJ_J
      });
      content += `  - 🔍 新增指标: KDJ(${kdjString}) | 威廉=${etf.威廉指标}\n`;
      content += `  - 📉 CCI=${etf.CCI} | ATR=${etf.ATR百分比}%\n`;
      content += `  - 💰 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
      content += `  - 📊 价格偏离: ${etf.价格偏离} | 风险等级: ${etf.风险等级}\n`;
    });
    content += `\n`;
  }

  // 普通买入机会
  const normalBuys = report.data.filter(d => d.交易信号.includes('买入') && !d.交易信号.includes('强烈买入'));
  if (normalBuys.length > 0) {
    content += `## 📈 买入机会\n`;
    normalBuys.slice(0, 3).forEach(etf => { // 最多显示3个，避免消息过长
      content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
      content += `  - 📊 技术评分: ${etf.技术评分}/100 | RSI: ${etf.RSI}\n`;
      content += `  - 🔍 KDJ信号: ${etf.KDJ信号} | 威廉信号: ${etf.威廉信号}\n`;
      content += `  - 💰 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
      content += `  - 📊 价格偏离: ${etf.价格偏离} | 风险等级: ${etf.风险等级}\n`;
    });
    content += `\n`;
  }

  // 特别关注提示
  if (report.specialWatchAlerts && report.specialWatchAlerts.length > 0) {
    content += specialWatchManager.formatAlertsText(report.specialWatchAlerts);
  }
  
  return content;
}

// 主执行函数
async function runEnhancedStrategy() {
  try {
    console.log(color('🚀 ETF轮动策略增强版启动...', 'blue'));
    console.log(color(`📋 配置信息: 分析${CONFIG.symbols.length}个ETF`, 'gray'));
    console.log('');

    // 检查配置
    if (!CONFIG.symbols || CONFIG.symbols.length === 0) {
      console.log(color('❌ 未配置ETF标的，请检查 ETF_SYMBOLS_JSON 配置', 'red'));
      return;
    }

    console.log(color('📊 正在分析ETF数据（增强版）...', 'yellow'));

    // 修复：清理所有缓存，确保使用最新数据
    console.log(color('🧹 清理缓存，确保使用最新数据...', 'gray'));
    cache.kline.clear();
    cache.price.clear();
    cache.indicators.clear();
    logger.info('缓存已清理，将获取最新市场数据');

    // 修复：市场环境检测将在获取所有ETF数据后进行
    // 因为 MarketEnvironmentDetector 需要ETF数据数组而不是K线数据
    console.log(color('🔍 市场环境检测将在数据分析后进行...', 'cyan'));

    // 批量分析ETF
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < CONFIG.symbols.length; i += batchSize) {
      const batch = CONFIG.symbols.slice(i, i + batchSize);
      console.log(color(`  📦 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(CONFIG.symbols.length / batchSize)} (${batch.length}个ETF)`, 'gray'));

      const batchPromises = batch.map(etf => limiter.schedule(() => analyzeSymbolEnhanced(etf)));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });
    }

    console.log(color(`📊 成功分析${results.length}个ETF`, 'green'));

    if (results.length === 0) {
      console.log(color('❌ 没有获取到有效的ETF数据', 'red'));
      return;
    }

    // 修复：在获取所有ETF数据后进行市场环境检测
    console.log(color('🔍 正在检测市场环境...', 'cyan'));
    try {
      currentMarketEnvironment = marketEnvironmentDetector.analyzeMarketEnvironment(results);
      console.log(color(`📊 市场环境: ${currentMarketEnvironment.trend} | 波动率: ${currentMarketEnvironment.volatility}`, 'cyan'));
      console.log(color(`   市场状态: ${currentMarketEnvironment.regime} | 置信度: ${(currentMarketEnvironment.confidence * 100).toFixed(0)}%`, 'cyan'));

      // 记录市场环境检测日志
      logger.marketEnvironment(currentMarketEnvironment);
    } catch (error) {
      console.warn(color(`⚠️ 市场环境检测失败: ${error.message}`, 'yellow'));
      logger.warn('市场环境检测失败', { error: error.message });
      currentMarketEnvironment = null;
    }

    // 检查特别关注ETF
    console.log(color('🔍 检查特别关注ETF...', 'gray'));
    const specialWatchAlerts = specialWatchManager.checkAllWatchConditions(results);
    if (specialWatchAlerts.length > 0) {
      console.log(color(`✅ 发现 ${specialWatchAlerts.length} 个特别关注提示`, 'yellow'));
      specialWatchAlerts.forEach(alert => {
        console.log(color(`  🔔 ${alert.name}: ${alert.triggeredConditions.map(c => c.message).join(', ')}`, 'cyan'));
      });
    } else {
      console.log(color('  ℹ️ 暂无特别关注提示', 'gray'));
    }

    // 生成增强报告
    console.log(color('📋 正在生成增强报告...', 'yellow'));
    const report = generateEnhancedReport([], results);

    // 添加特别关注信息到报告
    report.specialWatchAlerts = specialWatchAlerts;

    // 修复：添加市场环境信息到报告（用于企业微信通知）
    report.marketEnvironment = currentMarketEnvironment;
    report.generatedAt = new Date().toISOString();
    report.dataTimestamp = Date.now();

    // 显示增强版结果
    console.log('');
    console.log(color('=== ETF轮动策略增强报告 ===', 'bold'));
    console.log(color(`报告时间: ${report.date}`, 'gray'));
    console.log(color(`推荐操作: ${report.summary.推荐操作}`, 'yellow'));
    console.log(color(`推荐标的: ${report.summary.推荐标的}`, 'yellow'));
    console.log(color(`市场趋势: ${report.summary.市场趋势}`, 'yellow'));
    console.log('');

    // 技术分析统计
    console.log(color('=== 技术分析统计 ===', 'bold'));
    console.log(color(`强烈买入: ${report.technicalAnalysis.强烈买入}`, 'blue'));
    console.log(color(`买入: ${report.technicalAnalysis.买入}`, 'blue'));
    console.log(color(`持有: ${report.technicalAnalysis.持有}`, 'green'));
    console.log(color(`卖出: ${report.technicalAnalysis.卖出}`, 'red'));
    console.log(color(`信号矛盾: ${report.technicalAnalysis.信号矛盾}`, 'yellow'));
    console.log('');

    /* // 风险管理状态
    console.log(color('=== 风险管理状态 ===', 'bold'));
    const riskMetrics = riskManager.getRiskMetrics();
    console.log(color(`当前持仓数: ${riskMetrics.currentPositions}`, 'blue'));
    console.log(color(`总交易次数: ${riskMetrics.totalTrades}`, 'blue'));
    console.log(color(`今日交易次数: ${riskMetrics.dailyTrades}`, 'blue'));
    console.log(color(`胜率: ${riskMetrics.winRate.toFixed(1)}%`, 'green'));
    console.log(color(`最大回撤: ${riskMetrics.maxDrawdown.toFixed(2)}%`, 'yellow')); */

    // 检查系统性风险
    const systemicWarnings = riskManager.checkSystemicRisk();
    if (systemicWarnings.length > 0) {
      console.log(color('⚠️ 风险警告:', 'yellow'));
      systemicWarnings.forEach(warning => {
        console.log(color(`  - ${warning}`, 'yellow'));
      });
    } else {
      console.log(color('✅ 风险状态正常', 'green'));
    }

    // 生成JSON报告（每次运行都会覆盖旧报告）
    const jsonReportPath = './data/reports/enhanced_etf_report.json';
    const reportData = {
      ...report,
      generatedAt: new Date().toISOString(),
      dataTimestamp: Date.now(),
      marketEnvironment: currentMarketEnvironment
    };
    fs.writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2));
    console.log(color('📄 JSON报告已生成: ./data/reports/enhanced_etf_report.json', 'green'));
    logger.info('JSON报告已生成', {
      path: jsonReportPath,
      etfCount: results.length,
      timestamp: reportData.generatedAt
    });

    // 生成HTML报告
    try {
      htmlReportGenerator.generateEnhancedReport(reportData);
      console.log(color('🌐 HTML报告已生成: ./data/reports/etf_report.html', 'green'));
      logger.info('HTML报告已生成', { path: './data/reports/etf_report.html' });
    } catch (error) {
      console.error(color(`❌ HTML报告生成失败: ${error.message}`, 'red'));
      logger.error('HTML报告生成失败', { error: error.message });
    }

    // 企业微信推送（仅在直接运行时推送，调度器调用时跳过以避免重复）
    if (require.main === module) {
      await sendWeChatNotification(report);
    } else {
      console.log(color('📱 跳过企业微信推送（由调度器统一处理）', 'gray'));
    }

    return report;

  } catch (error) {
    console.error(color(`❌ 增强版策略执行失败: ${error.message}`, 'red'));
    console.error(error.stack);
  }
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  runEnhancedStrategy();
}

module.exports = {
  analyzeSymbolEnhanced,
  generateEnhancedReport,
  sendWeChatNotification,
  dataSourceManager,
  runEnhancedStrategy
};
