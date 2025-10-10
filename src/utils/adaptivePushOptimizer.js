// 🚀 自适应推送优化器
// 结合市场环境、行业轮动、政策导向等因素，智能优化ETF策略推送

/**
 * 自适应推送优化器
 * 根据市场环境动态调整推送策略，提高推送的精准度和时效性
 */
class AdaptivePushOptimizer {
  constructor() {
    // 推送历史记录
    this.pushHistory = [];
    
    // 优化配置
    this.config = {
      // 环境权重配置
      environmentWeights: {
        marketTrend: 0.4,      // 市场趋势权重
        volatility: 0.25,      // 波动率权重
        sectorRotation: 0.2,   // 行业轮动权重
        policyTrends: 0.15     // 政策导向权重
      },
      
      // 推送频率控制
      frequencyControl: {
        bullMarket: { minInterval: 300, maxPerHour: 8 },    // 牛市：5分钟间隔，每小时最多8次
        bearMarket: { minInterval: 900, maxPerHour: 4 },    // 熊市：15分钟间隔，每小时最多4次
        highVolatility: { minInterval: 180, maxPerHour: 10 }, // 高波动：3分钟间隔，每小时最多10次
        normal: { minInterval: 600, maxPerHour: 6 }         // 正常：10分钟间隔，每小时最多6次
      },
      
      // 信号过滤阈值
      signalThresholds: {
        bullMarket: { buy: 0.2, strongBuy: 0.5 },
        bearMarket: { buy: 0.4, strongBuy: 0.7 },
        highVolatility: { buy: 0.15, strongBuy: 0.45 },
        normal: { buy: 0.3, strongBuy: 0.6 }
      }
    };
  }

  /**
   * 优化推送决策
   * @param {Object} pushContext - 推送上下文
   * @returns {Object} 优化后的推送决策
   */
  optimizePushDecision(pushContext) {
    const {
      signals = [],
      marketEnvironment = null,
      sectorRotation = null,
      policyTrends = null,
      currentTime = new Date(),
      baseDecision = null
    } = pushContext;

    // 1. 分析市场环境状态
    const environmentAnalysis = this.analyzeEnvironment(marketEnvironment, sectorRotation, policyTrends);
    
    // 2. 计算自适应推送评分
    const adaptiveScore = this.calculateAdaptiveScore(signals, environmentAnalysis);
    
    // 3. 确定推送策略
    const pushStrategy = this.determinePushStrategy(environmentAnalysis);
    
    // 4. 应用频率控制
    const frequencyCheck = this.checkFrequencyLimits(pushStrategy, currentTime);
    
    // 5. 生成最终决策
    const finalDecision = this.generateFinalDecision({
      baseDecision,
      adaptiveScore,
      pushStrategy,
      frequencyCheck,
      environmentAnalysis
    });

    // 6. 记录推送历史
    this.recordPushHistory(finalDecision, environmentAnalysis, currentTime);

    return finalDecision;
  }

  /**
   * 分析环境状态
   * @private
   */
  analyzeEnvironment(marketEnvironment, sectorRotation, policyTrends) {
    const analysis = {
      marketRegime: 'normal',
      volatilityLevel: 'normal',
      sectorStrength: 0,
      policySupport: 0,
      overallScore: 50,
      confidence: 0.5
    };

    // 分析市场环境
    if (marketEnvironment) {
      // 确定市场状态
      if (marketEnvironment.regime === 'bull_market') {
        analysis.marketRegime = 'bullMarket';
      } else if (marketEnvironment.regime === 'bear_market') {
        analysis.marketRegime = 'bearMarket';
      } else if (marketEnvironment.regime === 'high_volatility') {
        analysis.marketRegime = 'highVolatility';
      }

      // 波动率分析
      if (marketEnvironment.volatility === 'high') {
        analysis.volatilityLevel = 'high';
      } else if (marketEnvironment.volatility === 'low') {
        analysis.volatilityLevel = 'low';
      }

      // 置信度
      analysis.confidence = marketEnvironment.confidence || 0.5;

      // 基础评分调整
      if (marketEnvironment.trend) {
        if (marketEnvironment.trend.includes('strong_bullish')) {
          analysis.overallScore += 25;
        } else if (marketEnvironment.trend.includes('bullish')) {
          analysis.overallScore += 15;
        } else if (marketEnvironment.trend.includes('bearish')) {
          analysis.overallScore -= 15;
        } else if (marketEnvironment.trend.includes('strong_bearish')) {
          analysis.overallScore -= 25;
        }
      }
    }

    // 分析行业轮动
    if (sectorRotation) {
      // 强势行业评分
      const strongSectorCount = sectorRotation.strongSectors?.length || 0;
      analysis.sectorStrength = Math.min(strongSectorCount * 20, 100);

      // 资金流入加分
      const inflowCount = sectorRotation.capitalFlow?.inflowSectors?.length || 0;
      analysis.sectorStrength += Math.min(inflowCount * 10, 50);

      analysis.overallScore += analysis.sectorStrength * 0.2;
    }

    // 分析政策导向
    if (policyTrends) {
      // 政策信号强度
      const strongSignals = policyTrends.summary?.strongSignalCount || 0;
      analysis.policySupport = Math.min(strongSignals * 15, 100);

      // 主题置信度
      const themeConfidence = policyTrends.summary?.confidence || 0;
      analysis.policySupport += themeConfidence * 30;

      analysis.overallScore += analysis.policySupport * 0.15;
    }

    // 归一化评分
    analysis.overallScore = Math.max(0, Math.min(100, analysis.overallScore));

    return analysis;
  }

  /**
   * 计算自适应评分
   * @private
   */
  calculateAdaptiveScore(signals, environmentAnalysis) {
    let score = 0;
    let signalCount = 0;

    // 分析信号质量
    signals.forEach(signal => {
      if (signal && typeof signal === 'string') {
        signalCount++;
        if (signal.includes('强烈买入')) {
          score += 100;
        } else if (signal.includes('买入')) {
          score += 70;
        } else if (signal.includes('弱势买入')) {
          score += 40;
        } else if (signal.includes('卖出')) {
          score -= 30;
        }
      }
    });

    // 计算平均信号评分
    const avgSignalScore = signalCount > 0 ? score / signalCount : 0;

    // 结合环境分析调整评分
    const environmentBonus = environmentAnalysis.overallScore - 50; // -50到+50的调整
    const finalScore = avgSignalScore + environmentBonus * 0.5;

    return {
      signalScore: avgSignalScore,
      environmentBonus,
      finalScore: Math.max(0, Math.min(100, finalScore)),
      signalCount,
      confidence: environmentAnalysis.confidence
    };
  }

  /**
   * 确定推送策略
   * @private
   */
  determinePushStrategy(environmentAnalysis) {
    const regime = environmentAnalysis.marketRegime;
    const volatility = environmentAnalysis.volatilityLevel;

    // 根据市场状态确定策略
    let strategyKey = regime;
    
    // 高波动优先级最高
    if (volatility === 'high') {
      strategyKey = 'highVolatility';
    }

    const strategy = {
      regime: strategyKey,
      frequencyLimits: this.config.frequencyControl[strategyKey] || this.config.frequencyControl.normal,
      signalThresholds: this.config.signalThresholds[strategyKey] || this.config.signalThresholds.normal,
      urgencyLevel: this.calculateUrgencyLevel(environmentAnalysis)
    };

    return strategy;
  }

  /**
   * 计算紧急程度
   * @private
   */
  calculateUrgencyLevel(environmentAnalysis) {
    let urgency = 'normal';

    // 高波动或极端市场状态提高紧急程度
    if (environmentAnalysis.volatilityLevel === 'high') {
      urgency = 'high';
    } else if (environmentAnalysis.marketRegime === 'bearMarket') {
      urgency = 'medium';
    } else if (environmentAnalysis.overallScore > 80 || environmentAnalysis.overallScore < 20) {
      urgency = 'high';
    }

    return urgency;
  }

  /**
   * 检查频率限制
   * @private
   */
  checkFrequencyLimits(pushStrategy, currentTime) {
    const now = new Date(currentTime);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const minIntervalAgo = new Date(now.getTime() - pushStrategy.frequencyLimits.minInterval * 1000);

    // 统计最近一小时的推送次数
    const recentPushes = this.pushHistory.filter(push => 
      push.timestamp > oneHourAgo && push.success
    );

    // 检查最小间隔
    const lastPush = this.pushHistory[this.pushHistory.length - 1];
    const withinMinInterval = lastPush && lastPush.timestamp > minIntervalAgo;

    return {
      hourlyCount: recentPushes.length,
      maxPerHour: pushStrategy.frequencyLimits.maxPerHour,
      withinMinInterval,
      minInterval: pushStrategy.frequencyLimits.minInterval,
      canPush: recentPushes.length < pushStrategy.frequencyLimits.maxPerHour && !withinMinInterval
    };
  }

  /**
   * 生成最终决策
   * @private
   */
  generateFinalDecision(context) {
    const {
      baseDecision,
      adaptiveScore,
      pushStrategy,
      frequencyCheck,
      environmentAnalysis
    } = context;

    // 基础决策评分
    let finalScore = adaptiveScore.finalScore;
    
    // 应用策略阈值
    const thresholds = pushStrategy.signalThresholds;
    let shouldPush = false;
    let pushLevel = 'hold';

    if (finalScore >= thresholds.strongBuy * 100) {
      shouldPush = true;
      pushLevel = 'strongBuy';
    } else if (finalScore >= thresholds.buy * 100) {
      shouldPush = true;
      pushLevel = 'buy';
    }

    // 频率限制检查
    if (shouldPush && !frequencyCheck.canPush) {
      // 高紧急程度可以突破部分限制
      if (pushStrategy.urgencyLevel === 'high' && finalScore > 80) {
        shouldPush = true;
        pushLevel = 'urgent_' + pushLevel;
      } else {
        shouldPush = false;
        pushLevel = 'blocked_by_frequency';
      }
    }

    const decision = {
      shouldPush,
      pushLevel,
      finalScore,
      confidence: adaptiveScore.confidence,
      strategy: pushStrategy.regime,
      urgency: pushStrategy.urgencyLevel,
      reason: this.generateDecisionReason(shouldPush, pushLevel, finalScore, frequencyCheck),
      adaptiveFactors: {
        environmentScore: environmentAnalysis.overallScore,
        signalScore: adaptiveScore.signalScore,
        environmentBonus: adaptiveScore.environmentBonus,
        signalCount: adaptiveScore.signalCount
      },
      frequencyStatus: frequencyCheck
    };

    return decision;
  }

  /**
   * 生成决策理由
   * @private
   */
  generateDecisionReason(shouldPush, pushLevel, finalScore, frequencyCheck) {
    if (!shouldPush) {
      if (pushLevel === 'blocked_by_frequency') {
        return `频率限制：最近${frequencyCheck.hourlyCount}次推送，间隔不足${frequencyCheck.minInterval}秒`;
      }
      return `评分${finalScore.toFixed(1)}未达到推送阈值`;
    }

    let reason = `评分${finalScore.toFixed(1)}`;
    
    if (pushLevel.includes('urgent')) {
      reason += '，高紧急程度突破频率限制';
    }
    
    if (pushLevel.includes('strongBuy')) {
      reason += '，达到强烈买入阈值';
    } else if (pushLevel.includes('buy')) {
      reason += '，达到买入阈值';
    }

    return reason;
  }

  /**
   * 记录推送历史
   * @private
   */
  recordPushHistory(decision, environmentAnalysis, timestamp) {
    this.pushHistory.push({
      timestamp: new Date(timestamp),
      success: decision.shouldPush,
      level: decision.pushLevel,
      score: decision.finalScore,
      strategy: decision.strategy,
      urgency: decision.urgency,
      environment: {
        regime: environmentAnalysis.marketRegime,
        volatility: environmentAnalysis.volatilityLevel,
        overallScore: environmentAnalysis.overallScore
      }
    });

    // 只保留最近100条记录
    if (this.pushHistory.length > 100) {
      this.pushHistory = this.pushHistory.slice(-100);
    }
  }

  /**
   * 获取推送统计
   */
  getPushStatistics(hours = 24) {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentPushes = this.pushHistory.filter(push => push.timestamp > cutoffTime);

    const stats = {
      totalAttempts: recentPushes.length,
      successfulPushes: recentPushes.filter(p => p.success).length,
      byLevel: {},
      byStrategy: {},
      byUrgency: {},
      averageScore: 0
    };

    // 统计各维度数据
    recentPushes.forEach(push => {
      // 按推送级别统计
      stats.byLevel[push.level] = (stats.byLevel[push.level] || 0) + 1;
      
      // 按策略统计
      stats.byStrategy[push.strategy] = (stats.byStrategy[push.strategy] || 0) + 1;
      
      // 按紧急程度统计
      stats.byUrgency[push.urgency] = (stats.byUrgency[push.urgency] || 0) + 1;
    });

    // 计算平均评分
    if (recentPushes.length > 0) {
      stats.averageScore = recentPushes.reduce((sum, push) => sum + push.score, 0) / recentPushes.length;
    }

    stats.successRate = stats.totalAttempts > 0 ? (stats.successfulPushes / stats.totalAttempts * 100).toFixed(1) + '%' : '0%';

    return stats;
  }

  /**
   * 重置历史记录
   */
  resetHistory() {
    this.pushHistory = [];
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = AdaptivePushOptimizer;
