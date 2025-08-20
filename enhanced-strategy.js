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

decimal.set({ precision: 12, rounding: decimal.ROUND_HALF_UP });

const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

function color(text, clr) { return (COLORS[clr] || '') + text + COLORS.reset; }
function stripAnsi(str) { return str.replace(/\x1b\[[0-9;]*m/g, ''); }

const CONFIG = {
  lookbackDays: Number(process.env.LOOKBACK_DAYS) || 20,
  momentumWindow: Number(process.env.MOMENTUM_WINDOW) || 20,
  rotationThreshold: Number(process.env.ROTATION_THRESHOLD) || 1.0,
  marketTrendThreshold: Number(process.env.MARKET_TREND_THRESHOLD) || 0.5,
  symbols: JSON.parse(process.env.ETF_SYMBOLS_JSON || '[]'),
  REALTIME_API: process.env.REALTIME_API,
  KLINE_API: process.env.KLINE_API,
  marketIndexSymbol: process.env.MARKET_INDEX_SYMBOL || 'sh000300',
  minBuySellGap: Number(process.env.MIN_BUY_SELL_GAP) || 0.02,
  returnDecimals: Number(process.env.RETURN_DECIMALS || 2)
};

// 初始化数据源管理器和特别关注管理器
const dataSourceManager = new DataSourceManager();
const specialWatchManager = new SpecialWatchManager();
const htmlReportGenerator = new HTMLReportGenerator();

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

// 批量处理参数支持动态配置
const batchSize = Math.max(1, Number(process.env.BATCH_SIZE) || 5);
const limiter = new Bottleneck({
  minTime: Number(process.env.LIMITER_MIN_TIME) || 500,
  maxConcurrent: Number(process.env.LIMITER_MAX_CONCURRENT) || 3
});

// 简单内存缓存（K线和实时价格）
const cache = {
  kline: new Map(),
  price: new Map()
};

// 通用重试机制
async function fetchWithRetry(fn, key, type = 'kline', retries = 3, delay = 800) {
  // 优先查缓存
  if (type === 'kline' && cache.kline.has(key)) return cache.kline.get(key);
  if (type === 'price' && cache.price.has(key)) return cache.price.get(key);
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      if (type === 'kline') cache.kline.set(key, result);
      if (type === 'price') cache.price.set(key, result);
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
    // MACD需要至少34天数据（26+9-1），所以获取更多数据
    const requiredDays = Math.max(CONFIG.lookbackDays + 20, 50); // 确保有足够数据计算MACD
    const kline = await fetchWithRetry(
      () => dataSourceManager.fetchKlineData(etf.symbol, requiredDays),
      etf.symbol + '_kline', 'kline', 3, 800
    );
    if (!kline || kline.length < 35) { // 至少需要35天数据来计算MACD
      console.log(color(`    ⚠️ ${etf.name} 数据不足 (需要至少35天，实际${kline?.length || 0}天)`, 'yellow'));
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

    // 计算技术指标（增强版 - 包含新增指标）
    // 使用所有可用数据计算技术指标，确保MACD等指标有足够的历史数据
    const technicalIndicators = {
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

    // 综合信号生成（融合分数参与）
    const signal = generateEnhancedSignal(current, buy, sell, technicalScore, technicalIndicators, fusionScore);

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

// 增强信号生成
function generateEnhancedSignal(current, buy, sell, technicalScore, indicators) {
  let signal = '持有';
  let signalColor = 'green';
  let confidence = '中等';

  // 基础价格信号
  if (current < buy) {
    signal = '买入';
    signalColor = 'blue';
  } else if (current > sell) {
    signal = '卖出';
    signalColor = 'red';
  }

  // 技术指标融合分数参与
  const fusion = arguments.length > 5 ? arguments[5] : technicalScore.score;
  if (fusion >= 75) {
    if (signal === '买入') {
      signal = '强烈买入';
      confidence = '高';
    } else if (signal === '持有') {
      signal = '弱势买入';
      signalColor = 'blue';
    }
  } else if (fusion <= 25) {
    if (signal === '卖出') {
      signal = '强烈卖出';
      confidence = '高';
    } else if (signal === '持有') {
      signal = '弱势卖出';
      signalColor = 'red';
    }
  }

  // MACD确认和信号增强
  if (indicators.macd && indicators.macd.macd !== undefined && indicators.macd.signal !== undefined) {
    const isMacdGoldenCross = indicators.macd.macd > indicators.macd.signal;
    const isMacdDeathCross = indicators.macd.macd < indicators.macd.signal;

    if (isMacdGoldenCross) {
      // MACD金叉：增强买入信号，与卖出信号矛盾
      if (signal.includes('买入')) {
        if (signal === '买入') {
          signal = '强烈买入';
          confidence = '高';
        }
      } else if (signal.includes('卖出')) {
        signal = '信号矛盾';
        signalColor = 'yellow';
        confidence = '低';
      } else if (signal === '持有') {
        signal = '弱势买入';
        signalColor = 'blue';
        confidence = '中等';
      }
    } else if (isMacdDeathCross) {
      // MACD死叉：与买入信号矛盾，增强卖出信号
      if (signal.includes('买入')) {
        signal = '信号矛盾';
        signalColor = 'yellow';
        confidence = '低';
      } else if (signal.includes('卖出')) {
        if (signal === '卖出') {
          signal = '强烈卖出';
          confidence = '高';
        }
      }
    }
  }

  return {
    text: color(signal, signalColor),
    level: signal,
    confidence,
    score: technicalScore.score,
    fusionScore: fusion,
    signals: technicalScore.signals
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
        ATR: FormatManager.format(s.technicalIndicators?.atr?.value, 'technicalIndicators', 'atr'),
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
  let content = `# 📊 ETF轮动策略\n\n`;

  // 显示推送时间和报告生成时间
  if (report.pushTime && report.originalDate) {
    content += `**推送时间**: ${report.pushTime}\n`;
    content += `**报告生成**: ${report.originalDate}\n\n`;
  } else {
    content += `**报告时间**: ${report.date}\n\n`;
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

    // 生成JSON报告
    const jsonReportPath = './data/reports/enhanced_etf_report.json';
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
    console.log(color('📄 JSON报告已生成: ./data/reports/enhanced_etf_report.json', 'green'));

    // 生成HTML报告
    try {
      htmlReportGenerator.generateEnhancedReport(report);
      console.log(color('🌐 HTML报告已生成: ./data/reports/etf_report.html', 'green'));
    } catch (error) {
      console.error(color(`❌ HTML报告生成失败: ${error.message}`, 'red'));
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
