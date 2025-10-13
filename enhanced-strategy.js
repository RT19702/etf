// 🚀 增强版ETF轮动策略（集成所有新功能）
require('dotenv').config({ path: './config/.env' });
const fs = require('fs');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

// 配置dayjs时区插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');
const decimal = require('decimal.js');

// 导入新增模块
const WeChatBot = require('./src/utils/wechatBot');
const NumberFormatter = require('./src/utils/numberFormatter');
const { FormatManager } = require('./src/config/formatConfig');
const TechnicalIndicators = require('./src/utils/technicalIndicators');
const DataSourceManager = require('./src/utils/dataSourceManager');
const { SpecialWatchManager } = require('./src/utils/specialWatch');
const HTMLReportGenerator = require('./src/utils/htmlReportGenerator');
const { RiskManager } = require('./src/utils/riskManager');
const SmartPortfolioManager = require('./src/utils/smartPortfolioManager');
const ConfigManager = require('./src/utils/configManager'); // 优化：统一配置管理
const { initLogger } = require('./src/utils/logger'); // 优化：统一日志系统
const { financial, determinePriceDecimals } = require('./src/utils/priceUtils'); // 优化：共享价格工具函数
const AdaptiveLimiter = require('./src/utils/adaptiveLimiter'); // 优化：自适应限流器

decimal.set({ precision: 12, rounding: decimal.ROUND_HALF_UP });

const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

function color(text, clr) { return (COLORS[clr] || '') + text + COLORS.reset; }
function stripAnsi(str) { return str.replace(/\x1b\[[0-9;]*m/g, ''); }

// 风险偏好中英文映射
function translateRiskPreference(riskLevel) {
  const riskMapping = {
    'aggressive': '激进型',
    'moderate_aggressive': '积极型', 
    'moderate': '平衡型',
    'moderate_conservative': '稳健型',
    'conservative': '保守型'
  };
  return riskMapping[riskLevel] || riskLevel;
}

// 市场环境状态中英文映射
function translateMarketStatus(status) {
  const statusMapping = {
    // 市场趋势
    'strong_bullish': '强势上涨',
    'bullish': '上涨',
    'slightly_bullish': '小幅上涨',
    'neutral': '中性',
    'slightly_bearish': '小幅下跌',
    'bearish': '下跌',
    'strong_bearish': '强势下跌',
    
    // 波动率
    'low': '低',
    'normal': '正常',
    'elevated': '偏高',
    'high': '高',
    
    // 市场情绪
    'very_bullish': '非常乐观',
    'bullish': '乐观',
    'slightly_bullish': '略乐观',
    'neutral': '中性',
    'slightly_bearish': '略悲观',
    'bearish': '悲观',
    'very_bearish': '非常悲观',
    
    // 市场状态
    'bull_market': '牛市',
    'bear_market': '熊市',
    'high_volatility': '高波动',
    'sideways_market': '震荡市',
    'transitional': '过渡期',
    'normal': '正常'
  };
  return statusMapping[status] || status;
}

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

// 🚀 新增：自适应市场环境模块
const SectorRotationDetector = require('./src/utils/sectorRotationDetector');
const PolicyTrendAnalyzer = require('./src/utils/policyTrendAnalyzer');
const AdaptiveAssetAllocator = require('./src/utils/adaptiveAssetAllocator');

const sectorRotationDetector = new SectorRotationDetector();
const policyTrendAnalyzer = new PolicyTrendAnalyzer();
const adaptiveAssetAllocator = new AdaptiveAssetAllocator();

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

// 优化：信号生成阈值常量（提取魔法数字）
const SIGNAL_THRESHOLDS = {
  // 技术评分阈值
  TECH_SCORE_BULLISH: 70,      // 技术评分看涨阈值
  TECH_SCORE_BEARISH: 30,      // 技术评分看跌阈值
  TECH_SCORE_NEUTRAL: 50,      // 技术评分中性值

  // RSI阈值
  RSI_OVERSOLD: 30,            // RSI超卖阈值
  RSI_OVERBOUGHT: 70,          // RSI超买阈值

  // KDJ阈值
  KDJ_NEUTRAL: 50,             // KDJ中性值

  // 信号强度阈值
  SIGNAL_STRONG_BUY: 0.6,      // 强烈买入信号阈值
  SIGNAL_BUY: 0.3,             // 买入信号阈值
  SIGNAL_WEAK_BUY: 0.1,        // 弱势买入信号阈值
  SIGNAL_STRONG_SELL: -0.6,    // 强烈卖出信号阈值
  SIGNAL_SELL: -0.3,           // 卖出信号阈值
  SIGNAL_WEAK_SELL: -0.1,      // 弱势卖出信号阈值

  // 信号强度判断
  STRENGTH_HIGH: 0.4,          // 高强度阈值
  STRENGTH_MEDIUM: 0.3,        // 中等强度阈值
  STRENGTH_LOW: 0.2,           // 低强度阈值

  // 数据要求
  MIN_REQUIRED_DAYS: 50,       // 最小数据天数要求
  REQUIRED_DAYS_BUFFER: 60     // 数据天数安全边际
};

// 全局市场环境变量（在分析过程中更新）
let currentMarketEnvironment = null;

// 创建自适应限流器实例（修复：传递初始化参数）
const limiter = new AdaptiveLimiter({
  minTime: Number(process.env.LIMITER_MIN_TIME) || 500,
  maxConcurrent: Number(process.env.LIMITER_MAX_CONCURRENT) || 3,
  minMinTime: 200,
  maxMinTime: 2000,
  minConcurrent: 1,
  maxConcurrentLimit: 5
});

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
}, 5 * 60 * 1000);

/**
 * 通用重试机制（带缓存）
 * @param {Function} fn - 要执行的异步函数
 * @param {string} key - 缓存键
 * @param {string} type - 缓存类型 ('kline', 'price', 'indicators')
 * @param {number} retries - 重试次数，默认3次
 * @param {number} delay - 重试延迟（毫秒），默认800ms
 * @returns {Promise<any>} 函数执行结果
 */
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

/**
 * 增强的ETF分析函数
 * @param {Object} etf - ETF对象，包含 symbol 和 name 属性
 * @returns {Promise<Object|null>} 分析结果对象，包含价格、技术指标、信号等信息；失败返回 null
 */
async function analyzeSymbolEnhanced(etf) {
  try {
    console.log(color(`  🔍 分析 ${etf.name}...`, 'gray'));
    
    // 使用多数据源获取K线数据（带缓存和重试）
    // 优化：MACD需要至少34天数据（26+9-1），增加安全边际
    // 确保有足够的历史数据进行准确的技术指标计算
    const requiredDays = Math.max(CONFIG.lookbackDays + 30, SIGNAL_THRESHOLDS.REQUIRED_DAYS_BUFFER);
    const kline = await fetchWithRetry(
      () => dataSourceManager.fetchKlineData(etf.symbol, requiredDays),
      etf.symbol + '_kline', 'kline', 3, 800
    );
    // 优化：使用配置常量替代魔法数字
    const minRequiredDays = SIGNAL_THRESHOLDS.MIN_REQUIRED_DAYS;
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

/**
 * 🚀 新增：根据市场环境获取自适应信号阈值
 * @param {Object} marketEnvironment - 市场环境数据
 * @returns {Object} 自适应阈值配置
 */
function getAdaptiveSignalThresholds(marketEnvironment) {
  // 默认阈值（与原有SIGNAL_THRESHOLDS保持一致）
  const defaultThresholds = {
    buyThreshold: SIGNAL_THRESHOLDS.SIGNAL_BUY,
    strongBuyThreshold: SIGNAL_THRESHOLDS.SIGNAL_STRONG_BUY,
    sellThreshold: SIGNAL_THRESHOLDS.SIGNAL_SELL,
    strongSellThreshold: SIGNAL_THRESHOLDS.SIGNAL_STRONG_SELL,
    weakBuyThreshold: SIGNAL_THRESHOLDS.SIGNAL_WEAK_BUY,
    weakSellThreshold: SIGNAL_THRESHOLDS.SIGNAL_WEAK_SELL
  };

  // 如果没有市场环境数据，返回默认阈值
  if (!marketEnvironment) return defaultThresholds;

  const thresholds = { ...defaultThresholds };

  // 根据市场趋势调整阈值
  if (marketEnvironment.trend) {
    if (marketEnvironment.trend.includes('strong_bullish')) {
      // 强牛市：降低买入阈值，提高卖出阈值（更容易买入，更难卖出）
      thresholds.buyThreshold *= 0.8;
      thresholds.strongBuyThreshold *= 0.85;
      thresholds.weakBuyThreshold *= 0.7;
      thresholds.sellThreshold *= 1.2;
      thresholds.strongSellThreshold *= 1.3;
    } else if (marketEnvironment.trend.includes('bullish')) {
      // 牛市：适度降低买入阈值
      thresholds.buyThreshold *= 0.9;
      thresholds.strongBuyThreshold *= 0.95;
      thresholds.sellThreshold *= 1.1;
    } else if (marketEnvironment.trend.includes('strong_bearish')) {
      // 强熊市：提高买入阈值，降低卖出阈值（更难买入，更容易卖出）
      thresholds.buyThreshold *= 1.3;
      thresholds.strongBuyThreshold *= 1.4;
      thresholds.sellThreshold *= 0.7;
      thresholds.strongSellThreshold *= 0.6;
      thresholds.weakSellThreshold *= 0.8;
    } else if (marketEnvironment.trend.includes('bearish')) {
      // 熊市：适度提高买入阈值
      thresholds.buyThreshold *= 1.1;
      thresholds.strongBuyThreshold *= 1.2;
      thresholds.sellThreshold *= 0.9;
    }
  }

  // 根据波动率调整阈值
  if (marketEnvironment.volatility) {
    if (marketEnvironment.volatility === 'high') {
      // 高波动：所有阈值适度放宽，避免频繁交易
      Object.keys(thresholds).forEach(key => {
        if (key.includes('buy') || key.includes('Buy')) {
          thresholds[key] *= 1.1; // 买入阈值提高10%
        } else {
          thresholds[key] *= 0.9; // 卖出阈值降低10%
        }
      });
    } else if (marketEnvironment.volatility === 'low') {
      // 低波动：阈值收紧，更敏感地捕捉信号
      Object.keys(thresholds).forEach(key => {
        if (key.includes('buy') || key.includes('Buy')) {
          thresholds[key] *= 0.95; // 买入阈值降低5%
        } else {
          thresholds[key] *= 1.05; // 卖出阈值提高5%
        }
      });
    }
  }

  // 根据市场状态调整
  if (marketEnvironment.regime) {
    if (marketEnvironment.regime === 'bull_market') {
      // 牛市状态：偏向买入
      thresholds.buyThreshold *= 0.9;
      thresholds.weakBuyThreshold *= 0.8;
    } else if (marketEnvironment.regime === 'bear_market') {
      // 熊市状态：偏向卖出
      thresholds.sellThreshold *= 0.9;
      thresholds.weakSellThreshold *= 0.8;
    } else if (marketEnvironment.regime === 'high_volatility') {
      // 高波动状态：更保守
      thresholds.buyThreshold *= 1.15;
      thresholds.sellThreshold *= 0.85;
    }
  }

  // 根据置信度调整：置信度越高，阈值调整幅度越大
  if (marketEnvironment.confidence) {
    const confidenceMultiplier = 0.5 + marketEnvironment.confidence * 0.5; // 0.5-1.0
    
    // 对所有调整应用置信度权重
    Object.keys(thresholds).forEach(key => {
      const adjustment = thresholds[key] - defaultThresholds[key];
      thresholds[key] = defaultThresholds[key] + adjustment * confidenceMultiplier;
    });
  }

  return thresholds;
}

/**
 * 增强信号生成（智能决策版本 - 避免信号矛盾，结合自适应环境优化）
 * 综合多个技术指标生成交易信号，根据市场环境动态调整权重和阈值
 * @param {number} current - 当前价格
 * @param {number} buy - 买入阈值价格
 * @param {number} sell - 卖出阈值价格
 * @param {Object} technicalScore - 技术评分对象
 * @param {Object} indicators - 技术指标对象（包含 macd, rsi, kdj 等）
 * @param {number} fusionScore - 融合评分
 * @param {Object} marketEnvironment - 市场环境对象（可选）
 * @returns {Object} 信号对象，包含 text, level, score, confidence, sources 等属性
 */
function generateEnhancedSignal(current, buy, sell, technicalScore, indicators, fusionScore, marketEnvironment = null) {
  // 收集所有信号源
  const signalSources = [];

  // 🚀 增强：根据市场环境动态调整权重和信号阈值
  const weights = getAdaptiveWeights(marketEnvironment);
  const adaptiveThresholds = getAdaptiveSignalThresholds(marketEnvironment);

  // 1. 基础价格信号
  let priceSignal = 0;
  if (current < buy) {
    priceSignal = 1; // 买入
  } else if (current > sell) {
    priceSignal = -1; // 卖出
  }
  signalSources.push({ source: 'price', signal: priceSignal, weight: weights.price, strength: Math.abs(priceSignal) });

  // 2. 技术评分信号（优化：使用配置常量）
  const fusion = fusionScore !== undefined ? fusionScore : technicalScore.score;
  let techSignal = 0;
  let techStrength = 0;
  if (fusion >= SIGNAL_THRESHOLDS.TECH_SCORE_BULLISH) {
    techSignal = 1;
    techStrength = Math.min((fusion - SIGNAL_THRESHOLDS.TECH_SCORE_NEUTRAL) / SIGNAL_THRESHOLDS.TECH_SCORE_NEUTRAL, 1);
  } else if (fusion <= SIGNAL_THRESHOLDS.TECH_SCORE_BEARISH) {
    techSignal = -1;
    techStrength = Math.min((SIGNAL_THRESHOLDS.TECH_SCORE_NEUTRAL - fusion) / SIGNAL_THRESHOLDS.TECH_SCORE_NEUTRAL, 1);
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

  // 4. RSI信号（优化：使用配置常量）
  let rsiSignal = 0;
  let rsiStrength = 0;
  if (indicators.rsi) {
    if (indicators.rsi < SIGNAL_THRESHOLDS.RSI_OVERSOLD) {
      rsiSignal = 1;
      rsiStrength = (SIGNAL_THRESHOLDS.RSI_OVERSOLD - indicators.rsi) / SIGNAL_THRESHOLDS.RSI_OVERSOLD;
    } else if (indicators.rsi > SIGNAL_THRESHOLDS.RSI_OVERBOUGHT) {
      rsiSignal = -1;
      rsiStrength = (indicators.rsi - SIGNAL_THRESHOLDS.RSI_OVERBOUGHT) / SIGNAL_THRESHOLDS.RSI_OVERSOLD;
    }
  }
  signalSources.push({ source: 'rsi', signal: rsiSignal, weight: weights.rsi, strength: rsiStrength });

  // 5. KDJ信号（优化：使用配置常量）
  let kdjSignal = 0;
  let kdjStrength = 0;
  if (indicators.kdj && indicators.kdj.k !== undefined && indicators.kdj.d !== undefined) {
    const k = parseFloat(indicators.kdj.k);
    const d = parseFloat(indicators.kdj.d);
    if (k > d && k < SIGNAL_THRESHOLDS.KDJ_NEUTRAL) {
      kdjSignal = 1;
      kdjStrength = 0.8;
    } else if (k < d && k > SIGNAL_THRESHOLDS.KDJ_NEUTRAL) {
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

  // 🚀 增强：决定最终信号（使用自适应阈值）
  let finalSignal = '持有';
  let signalColor = 'green';
  let confidence = '中等';

  // 使用自适应阈值替代固定阈值
  const buyThreshold = adaptiveThresholds.buyThreshold;
  const strongBuyThreshold = adaptiveThresholds.strongBuyThreshold;
  const sellThreshold = adaptiveThresholds.sellThreshold;
  const strongSellThreshold = adaptiveThresholds.strongSellThreshold;
  const weakBuyThreshold = adaptiveThresholds.weakBuyThreshold;
  const weakSellThreshold = adaptiveThresholds.weakSellThreshold;

  if (weightedSignal > buyThreshold) {
    if (weightedSignal > strongBuyThreshold && signalStrength > SIGNAL_THRESHOLDS.STRENGTH_HIGH) {
      finalSignal = '强烈买入';
      confidence = '高';
    } else {
      finalSignal = '买入';
      confidence = signalStrength > SIGNAL_THRESHOLDS.STRENGTH_MEDIUM ? '高' : '中等';
    }
    signalColor = 'blue';
  } else if (weightedSignal < sellThreshold) {
    if (weightedSignal < strongSellThreshold && signalStrength > SIGNAL_THRESHOLDS.STRENGTH_HIGH) {
      finalSignal = '强烈卖出';
      confidence = '高';
    } else {
      finalSignal = '卖出';
      confidence = signalStrength > SIGNAL_THRESHOLDS.STRENGTH_MEDIUM ? '高' : '中等';
    }
    signalColor = 'red';
  } else {
    // 中性区间，根据信号强度决定是否给出弱势信号
    if (weightedSignal > weakBuyThreshold && signalStrength > SIGNAL_THRESHOLDS.STRENGTH_LOW) {
      finalSignal = '弱势买入';
      signalColor = 'blue';
    } else if (weightedSignal < weakSellThreshold && signalStrength > SIGNAL_THRESHOLDS.STRENGTH_LOW) {
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

  return {
    action,
    recommendation,
    marketTrend: `${avgDeviation.toFixed(2)}%`,
    top3: sortedByStrength
  };
}

/**
 * 增强报告生成
 * @param {Array<Object>} stats - ETF分析结果数组
 * @param {Array<Object>} specialWatchAlerts - 特别关注提示数组（可选，避免重复调用）
 * @returns {Object} 报告对象，包含标题、日期、摘要、技术分析、详细数据等
 */
function generateEnhancedReport(stats, specialWatchAlerts = null) {
  // 生成增强版策略推荐
  const enhancedStrategy = generateEnhancedStrategy(stats);

  // 如果没有传入 specialWatchAlerts，则调用检查
  if (!specialWatchAlerts) {
    specialWatchAlerts = specialWatchManager.checkAllWatchConditions(stats);
  }

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
    specialWatchAlerts: specialWatchAlerts || [],
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

// 获取风险等级文本（用于持仓分析）
function getRiskLevelText(level) {
  const levelMap = {
    'low': '🟢 低风险',
    'medium': '🟡 中风险', 
    'high': '🔴 高风险'
  };
  return levelMap[level] || '❓ 未知';
}

// 获取状态图标（用于持仓分析）
function getStatusIcon(status) {
  const statusMap = {
    'excellent': '🌟',
    'good': '👍',
    'positive': '📈',
    'neutral': '➡️',
    'poor': '👎',
    'critical': '⚠️'
  };
  return statusMap[status] || '❓';
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

// 格式化增强版企业微信报告
function formatEnhancedWeChatReport(report) {
  let content = `# 📊 ETF轮动策略\n\n`;

  // 显示推送时间和报告生成时间
  if (report.pushTime && report.originalDate) {
    content += `**推送时间**: ${report.pushTime}\n`;
    content += `**报告生成**: ${report.originalDate}\n\n`;
  } else if (report.generatedAt) {
    content += `**报告时间**: ${dayjs(report.generatedAt).format('YYYY-MM-DD HH:mm:ss')}\n\n`;
  } else {
    content += `**报告时间**: ${report.date}\n\n`;
  }

  // 💼 新增：持仓分析部分
  try {
    const PositionAnalyzer = require('./src/utils/positionAnalyzer');
    const positionAnalyzer = new PositionAnalyzer();
    const positionAnalysis = positionAnalyzer.analyzePositions(report);
    
    if (positionAnalysis && positionAnalysis.totalPositions > 0) {
      content += `## 💼 持仓分析\n\n`;
      
      // 总体表现
      const { summary, riskAssessment, positions } = positionAnalysis;
      content += `### 📊 总体表现\n`;
      content += `- **总市值**: ¥${summary.totalValue}\n`;
      content += `- **总成本**: ¥${summary.totalCost}\n`;
      content += `- **总盈亏**: ¥${summary.totalPnL} (${summary.totalPnLPercent}%)\n`;
      content += `- **风险等级**: ${getRiskLevelText(riskAssessment.level)}\n`;
      content += `- **持仓数量**: ${summary.positionCount}个\n\n`;
      
      // 持仓详情
      if (positions && positions.length > 0) {
        content += `### 📋 持仓详情\n`;
        positions.forEach((position, index) => {
          const pnlIcon = position.pnl >= 0 ? '📈' : '📉';
          const statusIcon = getStatusIcon(position.status);
          
          content += `${index + 1}. **${position.name}** (${position.symbol}) ${statusIcon}\n`;
          content += `   - 成本: ¥${position.costPrice} | 现价: ¥${position.currentPrice}\n`;
          content += `   - 盈亏: ${pnlIcon} ¥${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)\n`;
          
          if (position.recommendation.targetPrice) {
            content += `   - 目标价: ¥${position.recommendation.targetPrice}\n`;
          }
          
          if (position.technicalAnalysis.technicalScore) {
            content += `   - 技术评分: ${position.technicalAnalysis.technicalScore}/100\n`;
          }
          
          if (position.recommendation.priority === 'high') {
            content += `   - ⚠️ **建议**: ${position.recommendation.action}\n`;
            content += `   - 💡 **原因**: ${position.recommendation.reason}\n`;
          }
          content += `\n`;
        });
      }
      
      // 投资建议
      if (positionAnalysis.recommendations && positionAnalysis.recommendations.length > 0) {
        content += `### 💡 投资建议\n`;
        positionAnalysis.recommendations.forEach((rec, index) => {
          const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
          content += `${index + 1}. ${priorityIcon} **${rec.title}**\n`;
          content += `   ${rec.description}\n\n`;
        });
      }
      
      // 风险提示
      if (riskAssessment.factors && riskAssessment.factors.length > 0) {
        content += `### ⚠️ 风险提示\n`;
        riskAssessment.factors.forEach(factor => {
          content += `- ${factor}\n`;
        });
        content += `\n`;
      }
    }
  } catch (error) {
    console.log(color(`⚠️ 持仓分析失败: ${error.message}`, 'yellow'));
  }

  // 修复：添加市场环境分析（优化后的新功能）
  if (report.marketEnvironment) {
    const env = report.marketEnvironment;
    content += `## 🌍 市场环境分析\n`;

    // 趋势和波动率
    const trendColor = env.trend.includes('bullish') ? 'info' : env.trend.includes('bearish') ? 'warning' : 'comment';
    const volatilityColor = env.volatility === 'high' ? 'warning' : env.volatility === 'low' ? 'info' : 'comment';
    content += `- **市场趋势**: <font color="${trendColor}">${translateMarketStatus(env.trend)}</font>\n`;
    content += `- **波动率**: <font color="${volatilityColor}">${translateMarketStatus(env.volatility)}</font>\n`;
    content += `- **市场情绪**: ${translateMarketStatus(env.sentiment)}\n`;
    content += `- **市场状态**: <font color="info">${translateMarketStatus(env.regime)}</font>\n`;
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

  // 🚀 新增：行业轮动分析
  if (report.sectorRotation) {
    const rotation = report.sectorRotation;
    content += `## 🔄 行业轮动分析\n`;
    content += `- **强势行业**: <font color="info">${rotation.summary.topSector}</font> (评分${rotation.summary.topSectorScore.toFixed(1)})\n`;
    content += `- **资金流向**: ${rotation.summary.marketDirection}\n`;

    if (rotation.capitalFlow.inflowSectors.length > 0) {
      const topInflow = rotation.capitalFlow.inflowSectors[0];
      content += `- **主流入**: ${topInflow.sector} (成交量${topInflow.avgVolumeRatio.toFixed(2)}倍)\n`;
    }

    if (rotation.allocationAdvice.recommended.length > 0) {
      content += `- **推荐配置**: ${rotation.allocationAdvice.recommended.slice(0, 3).join('、')}\n`;
    }
    content += `\n`;
  }

  // 🚀 新增：政策导向分析
  if (report.policyTrends && report.policyTrends.summary.mainTheme !== '无明确主题') {
    const policy = report.policyTrends;
    content += `## 📋 政策导向分析\n`;
    content += `- **主要主题**: <font color="info">${policy.summary.mainTheme}</font>\n`;
    content += `- **置信度**: ${(policy.summary.confidence * 100).toFixed(0)}%\n`;

    if (policy.investmentAdvice.primaryTheme) {
      const primary = policy.investmentAdvice.primaryTheme;
      content += `- **建议配置**: ${primary.theme} (${(primary.allocation * 100).toFixed(0)}%)\n`;
      content += `- **信号强度**: ${primary.strength}\n`;
    }

    if (policy.policyShifts && policy.policyShifts.length > 0) {
      const shifts = policy.policyShifts.filter(s => s.type === 'emerging');
      if (shifts.length > 0) {
        content += `- **新兴热点**: ${shifts.map(s => s.theme).join('、')}\n`;
      }
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

    console.log(color('📊 正在分析ETF数据...', 'yellow'));

    // 修复：清理所有缓存，确保使用最新数据
    console.log(color('🧹 清理缓存，确保使用最新数据...', 'gray'));
    cache.kline.clear();
    cache.price.clear();
    cache.indicators.clear();
    logger.info('缓存已清理，将获取最新市场数据');

    // 修复：市场环境检测将在获取所有ETF数据后进行
    // 因为 MarketEnvironmentDetector 需要ETF数据数组而不是K线数据
    console.log(color('🔍 市场环境检测将在数据分析后进行...', 'cyan'));

    // 优化：批量分析ETF - 全部并行处理，通过限流器自动控制并发
    console.log(color(`  📦 开始并行分析 ${CONFIG.symbols.length} 个ETF...`, 'gray'));

    const allPromises = CONFIG.symbols.map(etf =>
      limiter.schedule(() => analyzeSymbolEnhanced(etf))
    );

    const allResults = await Promise.allSettled(allPromises);

    const results = allResults
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    console.log(color(`📊 成功分析${results.length}个ETF`, 'green'));

    if (results.length === 0) {
      console.log(color('❌ 没有获取到有效的ETF数据', 'red'));
      return;
    }

    // 修复：在获取所有ETF数据后进行市场环境检测
    console.log(color('🔍 正在检测市场环境...', 'cyan'));
    try {
      currentMarketEnvironment = marketEnvironmentDetector.analyzeMarketEnvironment(results);
      console.log(color(`📊 市场环境: ${translateMarketStatus(currentMarketEnvironment.trend)} | 波动率: ${translateMarketStatus(currentMarketEnvironment.volatility)}`, 'cyan'));
      console.log(color(`   市场状态: ${translateMarketStatus(currentMarketEnvironment.regime)} | 置信度: ${(currentMarketEnvironment.confidence * 100).toFixed(0)}%`, 'cyan'));

      // 记录市场环境检测日志
      logger.marketEnvironment(currentMarketEnvironment);
    } catch (error) {
      console.warn(color(`⚠️ 市场环境检测失败: ${error.message}`, 'yellow'));
      logger.warn('市场环境检测失败', { error: error.message });
      currentMarketEnvironment = null;
    }

    // 🚀 新增：行业轮动分析
    console.log(color('🔄 正在分析行业轮动...', 'cyan'));
    let sectorRotationAnalysis = null;
    try {
      sectorRotationAnalysis = sectorRotationDetector.analyzeSectorRotation(results);
      console.log(color(`📊 强势行业: ${sectorRotationAnalysis.summary.topSector} (评分${sectorRotationAnalysis.summary.topSectorScore.toFixed(1)})`, 'cyan'));
      console.log(color(`   资金流向: ${sectorRotationAnalysis.summary.marketDirection}`, 'cyan'));
      console.log(color(`   推荐配置: ${sectorRotationAnalysis.allocationAdvice.recommended.slice(0, 3).join('、')}`, 'cyan'));

      logger.info('行业轮动分析完成', {
        topSector: sectorRotationAnalysis.summary.topSector,
        strongSectorCount: sectorRotationAnalysis.strongSectors.length
      });
    } catch (error) {
      console.warn(color(`⚠️ 行业轮动分析失败: ${error.message}`, 'yellow'));
      logger.warn('行业轮动分析失败', { error: error.message });
    }

    // 🚀 新增：政策导向分析
    console.log(color('📋 正在分析政策导向...', 'cyan'));
    let policyTrendAnalysis = null;
    try {
      if (sectorRotationAnalysis) {
        policyTrendAnalysis = policyTrendAnalyzer.analyzePolicyTrends(sectorRotationAnalysis, currentMarketEnvironment);
        console.log(color(`📊 政策主题: ${policyTrendAnalysis.summary.mainTheme}`, 'cyan'));
        console.log(color(`   强信号数: ${policyTrendAnalysis.summary.strongSignalCount}个`, 'cyan'));

        if (policyTrendAnalysis.investmentAdvice.primaryTheme) {
          const primary = policyTrendAnalysis.investmentAdvice.primaryTheme;
          console.log(color(`   主要方向: ${primary.theme} (建议配置${(primary.allocation * 100).toFixed(0)}%)`, 'cyan'));
        }

        logger.info('政策导向分析完成', {
          mainTheme: policyTrendAnalysis.summary.mainTheme,
          themeCount: policyTrendAnalysis.summary.themeCount
        });
      }
    } catch (error) {
      console.warn(color(`⚠️ 政策导向分析失败: ${error.message}`, 'yellow'));
      logger.warn('政策导向分析失败', { error: error.message });
    }

    // 🚀 新增：动态资产配置
    console.log(color('🎯 正在生成自适应配置方案...', 'cyan'));
    let assetAllocation = null;
    try {
      if (currentMarketEnvironment && sectorRotationAnalysis && policyTrendAnalysis) {
        assetAllocation = adaptiveAssetAllocator.generateAllocation(
          currentMarketEnvironment,
          sectorRotationAnalysis,
          policyTrendAnalysis,
          results
        );

        console.log(color(`📊 风险偏好: ${translateRiskPreference(assetAllocation.riskAppetite.level)} (股票仓位${(assetAllocation.riskAppetite.equity * 100).toFixed(0)}%)`, 'cyan'));
        console.log(color(`   预期收益: ${assetAllocation.expectedMetrics.expectedReturn.toFixed(2)}% | 预期风险: ${assetAllocation.expectedMetrics.expectedRisk.toFixed(2)}%`, 'cyan'));
        console.log(color(`   配置数量: ${assetAllocation.etfAllocation.length}个ETF`, 'cyan'));

        // 显示前5个配置
        console.log(color('   核心配置:', 'cyan'));
        assetAllocation.etfAllocation.slice(0, 5).forEach((item, index) => {
          console.log(color(`     ${index + 1}. ${item.name} (${(item.weight * 100).toFixed(1)}%) - ${item.reason}`, 'gray'));
        });

        logger.info('资产配置方案生成完成', {
          riskLevel: translateRiskPreference(assetAllocation.riskAppetite.level),
          etfCount: assetAllocation.etfAllocation.length,
          expectedReturn: assetAllocation.expectedMetrics.expectedReturn
        });
      }
    } catch (error) {
      console.warn(color(`⚠️ 资产配置生成失败: ${error.message}`, 'yellow'));
      logger.warn('资产配置生成失败', { error: error.message });
    }

    // 优化：检查特别关注ETF（只调用一次）
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

    // 生成增强报告（传入 specialWatchAlerts 避免重复调用）
    console.log(color('📋 正在生成增强报告...', 'yellow'));

    // 优化：统一生成时间戳，避免多次生成导致不一致
    const reportTimestamp = new Date();
    const generatedAt = reportTimestamp.toISOString();
    const dataTimestamp = reportTimestamp.getTime();

    const report = generateEnhancedReport(results, specialWatchAlerts);

    // 修复：添加市场环境信息和时间戳到报告（用于企业微信通知）
    report.marketEnvironment = currentMarketEnvironment;
    report.generatedAt = generatedAt;
    report.dataTimestamp = dataTimestamp;

    // 🚀 新增：添加自适应分析结果到报告
    if (sectorRotationAnalysis) {
      report.sectorRotation = sectorRotationAnalysis;
    }
    if (policyTrendAnalysis) {
      report.policyTrends = policyTrendAnalysis;
    }
    if (assetAllocation) {
      report.assetAllocation = assetAllocation;
    }

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
    // 优化：使用已生成的时间戳，确保一致性
    const jsonReportPath = './data/reports/enhanced_etf_report.json';
    const reportData = {
      ...report
      // generatedAt, dataTimestamp, marketEnvironment 已在 report 中
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
