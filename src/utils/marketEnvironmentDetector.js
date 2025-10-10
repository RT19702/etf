// 📊 市场环境检测器
const dayjs = require('dayjs');

/**
 * 市场环境检测器
 * 动态识别市场趋势、波动率状态和情绪，为策略参数调整提供依据
 */
class MarketEnvironmentDetector {
  constructor() {
    this.history = [];
    this.currentEnvironment = {
      trend: 'neutral',
      volatility: 'normal',
      sentiment: 'neutral',
      regime: 'normal',
      confidence: 0.5
    };
  }

  /**
   * 分析市场环境
   * @param {Array} etfData - ETF数据列表
   * @param {Object} marketIndex - 市场指数数据
   */
  analyzeMarketEnvironment(etfData, marketIndex = null) {
    const analysis = {
      timestamp: Date.now(),
      trend: this.detectTrend(etfData, marketIndex),
      volatility: this.detectVolatility(etfData),
      sentiment: this.detectSentiment(etfData),
      breadth: this.calculateMarketBreadth(etfData),
      momentum: this.calculateMomentum(etfData)
    };

    // 综合判断市场状态
    const regime = this.determineMarketRegime(analysis);
    const confidence = this.calculateConfidence(analysis);

    this.currentEnvironment = {
      ...analysis,
      regime,
      confidence
    };

    // 更新历史记录
    this.updateHistory(this.currentEnvironment);

    return this.currentEnvironment;
  }

  /**
   * 检测市场趋势
   */
  detectTrend(etfData, marketIndex) {
    // 计算上涨ETF比例
    const risingCount = etfData.filter(etf => {
      const priceChange = (etf.current - etf.ma5) / etf.ma5;
      return priceChange > 0;
    }).length;

    const risingRatio = risingCount / etfData.length;

    // 计算强势上涨比例
    const strongRisingCount = etfData.filter(etf => {
      const priceChange = (etf.current - etf.ma5) / etf.ma5;
      return priceChange > 0.02; // 2%以上涨幅
    }).length;

    const strongRisingRatio = strongRisingCount / etfData.length;

    // 综合判断趋势
    if (risingRatio > 0.7 && strongRisingRatio > 0.3) {
      return 'strong_bullish';
    } else if (risingRatio > 0.6) {
      return 'bullish';
    } else if (risingRatio > 0.55) {
      return 'slightly_bullish';
    } else if (risingRatio < 0.3 && strongRisingRatio < 0.1) {
      return 'strong_bearish';
    } else if (risingRatio < 0.4) {
      return 'bearish';
    } else if (risingRatio < 0.45) {
      return 'slightly_bearish';
    }

    return 'neutral';
  }

  /**
   * 检测波动率状态
   */
  detectVolatility(etfData) {
    const volatilities = etfData.map(etf => 
      parseFloat(etf.volatility?.replace('%', '') || '0')
    );

    const avgVolatility = volatilities.reduce((sum, vol) => sum + vol, 0) / volatilities.length;
    const highVolCount = volatilities.filter(vol => vol > 3).length;
    const highVolRatio = highVolCount / volatilities.length;

    if (avgVolatility > 4 || highVolRatio > 0.5) {
      return 'high';
    } else if (avgVolatility > 2.5 || highVolRatio > 0.3) {
      return 'elevated';
    } else if (avgVolatility < 1.5 && highVolRatio < 0.1) {
      return 'low';
    }

    return 'normal';
  }

  /**
   * 检测市场情绪
   */
  detectSentiment(etfData) {
    // 统计信号分布
    const signals = etfData.map(etf => {
      const signal = etf.signal || '';
      // 处理信号对象和字符串两种情况
      if (typeof signal === 'object' && signal.level) {
        return signal.level;
      }
      return typeof signal === 'string' ? signal : '';
    });
    const buySignals = signals.filter(s => s && s.includes && s.includes('买入')).length;
    const sellSignals = signals.filter(s => s && s.includes && s.includes('卖出')).length;
    const strongBuySignals = signals.filter(s => s && s.includes && s.includes('强烈买入')).length;
    const strongSellSignals = signals.filter(s => s && s.includes && s.includes('强烈卖出')).length;

    const totalSignals = buySignals + sellSignals;
    if (totalSignals === 0) return 'neutral';

    const bullishRatio = buySignals / totalSignals;
    const strongBullishRatio = strongBuySignals / etfData.length;
    const strongBearishRatio = strongSellSignals / etfData.length;

    if (strongBullishRatio > 0.2) {
      return 'extremely_bullish';
    } else if (bullishRatio > 0.7) {
      return 'bullish';
    } else if (bullishRatio > 0.6) {
      return 'slightly_bullish';
    } else if (strongBearishRatio > 0.5) {
      return 'extremely_bearish';
    } else if (bullishRatio < 0.3) {
      return 'bearish';
    } else if (bullishRatio < 0.4) {
      return 'slightly_bearish';
    }

    return 'neutral';
  }

  /**
   * 计算市场广度
   */
  calculateMarketBreadth(etfData) {
    const advanceCount = etfData.filter(etf => {
      const priceChange = (etf.current - etf.ma5) / etf.ma5;
      return priceChange > 0;
    }).length;

    const declineCount = etfData.length - advanceCount;
    const advanceDeclineRatio = advanceCount / (declineCount || 1);

    return {
      advancing: advanceCount,
      declining: declineCount,
      ratio: advanceDeclineRatio,
      breadth: advanceCount / etfData.length
    };
  }

  /**
   * 计算市场动量
   */
  calculateMomentum(etfData) {
    const priceChanges = etfData.map(etf => {
      return (etf.current - etf.ma5) / etf.ma5;
    });

    const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    const positiveChanges = priceChanges.filter(change => change > 0);
    const negativeChanges = priceChanges.filter(change => change < 0);

    return {
      average: avgChange,
      positive: positiveChanges.length,
      negative: negativeChanges.length,
      strength: Math.abs(avgChange),
      direction: avgChange > 0 ? 'up' : avgChange < 0 ? 'down' : 'flat'
    };
  }

  /**
   * 确定市场状态
   */
  determineMarketRegime(analysis) {
    const { trend, volatility, sentiment } = analysis;

    // 牛市状态
    if (trend.includes('bullish') && sentiment.includes('bullish') && volatility !== 'high') {
      return 'bull_market';
    }

    // 熊市状态
    if (trend.includes('bearish') && sentiment.includes('bearish')) {
      return 'bear_market';
    }

    // 高波动状态
    if (volatility === 'high') {
      return 'high_volatility';
    }

    // 震荡市状态
    if (trend === 'neutral' && volatility === 'normal') {
      return 'sideways_market';
    }

    // 过渡状态
    if (trend.includes('slightly') || sentiment.includes('slightly')) {
      return 'transitional';
    }

    return 'normal';
  }

  /**
   * 计算分析置信度
   */
  calculateConfidence(analysis) {
    let confidence = 0.5;

    // 趋势一致性加分
    const trendSentimentConsistent = 
      (analysis.trend.includes('bullish') && analysis.sentiment.includes('bullish')) ||
      (analysis.trend.includes('bearish') && analysis.sentiment.includes('bearish'));

    if (trendSentimentConsistent) {
      confidence += 0.2;
    }

    // 市场广度确认
    if (analysis.breadth.breadth > 0.7 || analysis.breadth.breadth < 0.3) {
      confidence += 0.15;
    }

    // 动量强度确认
    if (analysis.momentum.strength > 0.02) {
      confidence += 0.1;
    }

    // 历史一致性检查
    if (this.history.length > 0) {
      const recentEnvironments = this.history.slice(-3);
      const consistentTrend = recentEnvironments.every(env => 
        env.trend === analysis.trend || 
        (env.trend.includes('bullish') && analysis.trend.includes('bullish')) ||
        (env.trend.includes('bearish') && analysis.trend.includes('bearish'))
      );

      if (consistentTrend) {
        confidence += 0.15;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 更新历史记录
   */
  updateHistory(environment) {
    this.history.push({
      ...environment,
      timestamp: Date.now()
    });

    // 只保留最近20个记录
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }
  }

  /**
   * 获取当前市场环境
   */
  getCurrentEnvironment() {
    return this.currentEnvironment;
  }

  /**
   * 获取适应性参数建议
   */
  getAdaptiveParameters() {
    const env = this.currentEnvironment;
    
    return {
      // 技术指标权重调整
      technicalWeights: this.getTechnicalWeights(env),
      
      // 风险参数调整
      riskParameters: this.getRiskParameters(env),
      
      // 信号过滤参数
      signalFilters: this.getSignalFilters(env),
      
      // 特别关注阈值
      watchThresholds: this.getWatchThresholds(env)
    };
  }

  /**
   * 获取技术指标权重建议
   */
  getTechnicalWeights(env) {
    const baseWeights = {
      rsi: 0.20,
      macd: 0.15,
      kdj: 0.15,
      momentum: 0.10,
      volume: 0.05
    };

    // 根据市场状态调整权重
    switch (env.regime) {
      case 'bull_market':
        return {
          ...baseWeights,
          momentum: 0.15, // 牛市中动量更重要
          rsi: 0.15
        };
      
      case 'bear_market':
        return {
          ...baseWeights,
          rsi: 0.25, // 熊市中RSI更重要
          momentum: 0.05
        };
      
      case 'high_volatility':
        return {
          ...baseWeights,
          volume: 0.10, // 高波动时成交量更重要
          macd: 0.10
        };
      
      default:
        return baseWeights;
    }
  }

  /**
   * 获取风险参数建议
   */
  getRiskParameters(env) {
    const baseParams = {
      stopLoss: 0.05,
      takeProfit: 0.15,
      maxPosition: 0.3
    };

    switch (env.regime) {
      case 'high_volatility':
        return {
          stopLoss: 0.08, // 高波动时放宽止损
          takeProfit: 0.20,
          maxPosition: 0.2 // 降低仓位
        };
      
      case 'bear_market':
        return {
          stopLoss: 0.04, // 熊市中收紧止损
          takeProfit: 0.10,
          maxPosition: 0.2
        };
      
      default:
        return baseParams;
    }
  }

  /**
   * 获取信号过滤参数
   */
  getSignalFilters(env) {
    return {
      confirmationPeriods: env.volatility === 'high' ? 5 : 3,
      volumeThreshold: env.regime === 'high_volatility' ? 1.5 : 1.2,
      signalCooldown: env.volatility === 'high' ? 600000 : 300000 // 毫秒
    };
  }

  /**
   * 获取特别关注阈值
   */
  getWatchThresholds(env) {
    const base = {
      rsi_oversold: 25,
      volume_spike: 2.0,
      technical_score: 75
    };

    if (env.regime === 'bear_market') {
      return {
        rsi_oversold: 30, // 熊市中提高RSI阈值
        volume_spike: 1.8,
        technical_score: 70
      };
    }

    return base;
  }
}

module.exports = MarketEnvironmentDetector;
