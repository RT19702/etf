// 🚀 增强版ETF轮动策略（集成所有新功能）
require('dotenv').config({ path: './config/.env' });
const axios = require('axios');
const fs = require('fs');
const dayjs = require('dayjs');
const Bottleneck = require('bottleneck');
const decimal = require('decimal.js');

// 导入新增模块
const WeChatBot = require('./src/utils/wechatBot');
const TechnicalIndicators = require('./src/utils/technicalIndicators');
const BacktestEngine = require('./src/utils/backtestEngine');
const DataSourceManager = require('./src/utils/dataSourceManager');
const { SpecialWatchManager } = require('./src/utils/specialWatch');

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

const limiter = new Bottleneck({
  minTime: 500,
  maxConcurrent: 3
});

function financial(num, decimals = 4) {
  return new decimal(num).toDecimalPlaces(decimals).toNumber();
}

// 增强的ETF分析函数
async function analyzeSymbolEnhanced(etf) {
  try {
    console.log(color(`  🔍 分析 ${etf.name}...`, 'gray'));
    
    // 使用多数据源获取K线数据
    const kline = await dataSourceManager.fetchKlineData(etf.symbol, CONFIG.lookbackDays + 10);
    if (kline.length < CONFIG.lookbackDays) {
      console.log(color(`    ⚠️ ${etf.name} 数据不足`, 'yellow'));
      return null;
    }
    
    const recent = kline.slice(-CONFIG.lookbackDays);
    const prices = recent.map(d => d.close);
    const volumes = recent.map(d => d.volume);
    
    // 基础统计
    const { avg, std, ma5, volatility } = calcStat(recent);
    
    // 获取实时价格
    const current = await dataSourceManager.fetchRealTimePrice(etf.symbol);
    if (!current) {
      console.log(color(`    ❌ ${etf.name} 无法获取实时价格`, 'red'));
      return null;
    }
    
    // 计算技术指标
    const technicalIndicators = {
      rsi: TechnicalIndicators.calculateRSI(prices),
      macd: TechnicalIndicators.calculateMACD(prices),
      bollinger: TechnicalIndicators.calculateBollingerBands(prices),
      volumeRatio: TechnicalIndicators.calculateVolumeRatio(volumes),
      momentum: TechnicalIndicators.calculateMomentum(prices),
      currentPrice: current
    };
    
    // 技术分析评分
    const technicalScore = TechnicalIndicators.getTechnicalScore(technicalIndicators);
    
    // 动态买卖点计算（结合技术指标）
    const kBuy = financial(0.8 - (volatility - 10) * 0.005);
    const kSell = financial(1.0 + (volatility - 10) * 0.005);
    
    const priceDecimals = determinePriceDecimals(current);
    let buy = financial(avg - kBuy * std, priceDecimals);
    let sell = financial(avg + kSell * std, priceDecimals);
    
    // 根据技术指标调整买卖点
    if (technicalIndicators.rsi && technicalIndicators.rsi < 30) {
      buy = financial(buy * 1.02, priceDecimals); // RSI超卖时提高买入价
    }
    if (technicalIndicators.rsi && technicalIndicators.rsi > 70) {
      sell = financial(sell * 0.98, priceDecimals); // RSI超买时降低卖出价
    }
    
    if (sell <= buy) sell = financial(buy + avg * CONFIG.minBuySellGap, priceDecimals);
    
    // 综合信号生成
    const signal = generateEnhancedSignal(current, buy, sell, technicalScore, technicalIndicators);
    
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
  
  // 技术指标确认
  if (technicalScore.score >= 70) {
    if (signal === '买入') {
      signal = '强烈买入';
      confidence = '高';
    } else if (signal === '持有') {
      signal = '弱势买入';
      signalColor = 'blue';
    }
  } else if (technicalScore.score <= 30) {
    if (signal === '卖出') {
      signal = '强烈卖出';
      confidence = '高';
    } else if (signal === '持有') {
      signal = '弱势卖出';
      signalColor = 'red';
    }
  }
  
  // MACD确认
  if (indicators.macd && indicators.macd.macd > indicators.macd.signal) {
    if (signal.includes('卖出')) {
      signal = '信号矛盾';
      signalColor = 'yellow';
      confidence = '低';
    }
  }
  
  return {
    text: color(signal, signalColor),
    level: signal,
    confidence,
    score: technicalScore.score,
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
    .map(s => `${s.name} (评分:${s.technicalScore.score.toFixed(0)})`);

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
    date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
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
    data: stats.map(s => ({
      ETF: s.name,
      代码: s.symbol,
      当前价格: s.current.toFixed(s.priceDecimals),
      买入阈值: s.buy.toFixed(s.priceDecimals),
      卖出阈值: s.sell.toFixed(s.priceDecimals),
      MA5均线: s.ma5.toFixed(s.priceDecimals),
      波动率: s.volatility,
      交易信号: stripAnsi(s.signal?.text || s.signal),
      技术评分: s.technicalScore?.score?.toFixed(0) || 'N/A',
      信号强度: s.signal?.confidence || '中等',
      RSI: s.technicalIndicators?.rsi?.toFixed(2) || 'N/A',
      MACD: s.technicalIndicators?.macd ? 
        `${s.technicalIndicators.macd.macd.toFixed(4)}/${s.technicalIndicators.macd.signal.toFixed(4)}` : 'N/A',
      价格偏离: `${(((s.current - s.ma5) / s.ma5) * 100).toFixed(2)}%`,
      风险等级: getRiskLevel(s.volatility)
    })),
    dataSourceStatus: dataSourceManager.getStatus()
  };
  
  // 保存增强报告
  fs.writeFileSync('./data/reports/enhanced_etf_report.json', JSON.stringify(report, null, 2));
  
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

    console.log(color('📱 正在推送增强报告到企业微信...', 'yellow'));

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
  content += `**报告时间**: ${report.date}\n\n`;
  
  // 核心推荐
  content += `## 🎯 策略推荐\n`;
  content += `- **推荐操作**: ${report.summary.推荐操作}\n`;
  content += `- **推荐标的**: ${report.summary.推荐标的}\n`;
  content += `- **市场趋势**: ${report.summary.市场趋势}\n\n`;
  
  // 技术分析统计
  content += `## 📈 技术分析统计\n`;
  content += `- 🔵 强烈买入: ${report.technicalAnalysis.强烈买入}个\n`;
  content += `- 🟦 买入: ${report.technicalAnalysis.买入}个\n`;
  content += `- 🟢 持有: ${report.technicalAnalysis.持有}个\n`;
  content += `- 🟠 卖出: ${report.technicalAnalysis.卖出}个\n`;
  content += `- ⚠️ 信号矛盾: ${report.technicalAnalysis.信号矛盾}个\n\n`;
  
  // 重点关注 - 强烈买入机会
  const strongBuys = report.data.filter(d => d.交易信号.includes('强烈买入'));
  if (strongBuys.length > 0) {
    content += `## 💡 强烈买入机会\n`;
    strongBuys.forEach(etf => {
      content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
      content += `  - 技术评分: ${etf.技术评分}/100\n`;
      content += `  - RSI: ${etf.RSI}\n`;
      content += `  - MACD: ${etf.MACD}\n`;
      content += `  - 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
      content += `  - 价格偏离: ${etf.价格偏离}\n`;
      content += `  - 风险等级: ${etf.风险等级}\n`;
    });
    content += `\n`;
  }

  // 普通买入机会
  const normalBuys = report.data.filter(d => d.交易信号.includes('买入') && !d.交易信号.includes('强烈买入'));
  if (normalBuys.length > 0) {
    content += `## 📈 买入机会\n`;
    normalBuys.slice(0, 5).forEach(etf => { // 最多显示5个
      content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
      content += `  - 技术评分: ${etf.技术评分}/100\n`;
      content += `  - 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
      content += `  - 价格偏离: ${etf.价格偏离}\n`;
      content += `  - 风险等级: ${etf.风险等级}\n`;
    });
    content += `\n`;
  }

  // 特别关注提示
  if (report.specialWatchAlerts && report.specialWatchAlerts.length > 0) {
    content += specialWatchManager.formatAlertsText(report.specialWatchAlerts);
  }

  // 数据源状态
  content += `## 🔗 数据源状态\n`;
  const currentSourceName = getDataSourceName(report.dataSourceStatus.currentSource);
  content += `当前数据源: ${currentSourceName}\n\n`;
  
  content += `---\n`;
  content += `*增强版报告 - 集成技术指标分析*`;
  
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

    // 显示前5个ETF的详细信息
    console.log(color('=== 详细分析（前5个ETF）===', 'bold'));
    results.slice(0, 5).forEach(etf => {
      console.log(color(`📊 ${etf.name} (${etf.symbol})`, 'bold'));
      console.log(`  当前价格: ¥${etf.current.toFixed(etf.priceDecimals)}`);
      console.log(`  交易信号: ${etf.signal.text}`);
      console.log(`  技术评分: ${etf.technicalScore?.score?.toFixed(0) || 'N/A'}/100`);
      console.log(`  RSI: ${etf.technicalIndicators?.rsi?.toFixed(2) || 'N/A'}`);
      console.log(`  波动率: ${etf.volatility}`);
      console.log('');
    });

    // 数据源状态
    console.log(color('=== 数据源状态 ===', 'bold'));
    const dsStatus = dataSourceManager.getStatus();
    console.log(`当前数据源: ${dsStatus.currentSource}`);
    console.log(`可用数据源: ${dsStatus.sources.filter(s => s.status === 'active').length}个`);
    console.log('');

    // HTML报告功能已移除，专注于JSON报告和企业微信推送
    console.log(color('📄 JSON报告已生成: ./data/reports/enhanced_etf_report.json', 'green'));

    // 企业微信推送
    await sendWeChatNotification(report);

    console.log(color('✅ 增强版策略执行完成！', 'green'));
    console.log(color(`📄 JSON报告: ./data/reports/enhanced_etf_report.json`, 'gray'));
    console.log(color(`🌐 HTML报告: ./data/reports/etf_report.html`, 'gray'));

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
