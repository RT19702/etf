// 📊 市场情绪分析模块
const fs = require('fs');
const dayjs = require('dayjs');

class MarketSentimentAnalyzer {
  constructor(config = {}) {
    this.config = {
      vixThreshold: { low: 15, high: 25 },
      volumeMultiplier: 1.5,
      priceChangeThreshold: 0.02,
      sentimentWindow: 20,
      ...config
    };
    
    this.sentimentHistory = [];
    this.indicators = {
      fearGreedIndex: 50,
      vix: 20,
      putCallRatio: 1.0,
      advanceDeclineRatio: 1.0,
      newHighsLows: 0
    };
  }
  
  // 分析ETF群体情绪
  analyzeETFSentiment(etfStats) {
    const signals = etfStats.map(etf => etf.signal);
    const prices = etfStats.map(etf => etf.current);
    const volatilities = etfStats.map(etf => parseFloat(etf.volatility.replace('%', '')));
    
    // 信号分布分析
    const signalDistribution = this.calculateSignalDistribution(signals);
    
    // 价格动量分析
    const momentum = this.calculateMomentum(etfStats);
    
    // 波动率聚类分析
    const volatilityCluster = this.analyzeVolatilityCluster(volatilities);
    
    // 行业轮动分析
    const sectorRotation = this.analyzeSectorRotation(etfStats);
    
    // 综合情绪评分
    const sentimentScore = this.calculateSentimentScore({
      signalDistribution,
      momentum,
      volatilityCluster,
      sectorRotation
    });
    
    const sentiment = {
      timestamp: Date.now(),
      score: sentimentScore,
      level: this.getSentimentLevel(sentimentScore),
      distribution: signalDistribution,
      momentum,
      volatility: volatilityCluster,
      sectorRotation,
      recommendation: this.getRecommendation(sentimentScore)
    };
    
    this.sentimentHistory.push(sentiment);
    this.trimHistory();
    
    return sentiment;
  }
  
  // 计算信号分布
  calculateSignalDistribution(signals) {
    const total = signals.length;
    const buy = signals.filter(s => s.includes('买入')).length;
    const sell = signals.filter(s => s.includes('卖出')).length;
    const hold = signals.filter(s => s.includes('持有')).length;
    
    return {
      buy: { count: buy, ratio: buy / total },
      sell: { count: sell, ratio: sell / total },
      hold: { count: hold, ratio: hold / total },
      bullishRatio: buy / (buy + sell) || 0.5
    };
  }
  
  // 计算动量指标
  calculateMomentum(etfStats) {
    const priceChanges = etfStats.map(etf => {
      // 使用今日涨跌幅而不是相对MA5的位置
      let yesterdayClose = null;
      if (etf.kline && etf.kline.length >= 2) {
        yesterdayClose = etf.kline[etf.kline.length - 2].close;
      } else if (etf.ma5) {
        yesterdayClose = etf.ma5;
      }
      
      if (!yesterdayClose || yesterdayClose <= 0) return 0;
      
      const change = (etf.current - yesterdayClose) / yesterdayClose;
      return change;
    }).filter(change => !isNaN(change) && isFinite(change));
    
    const avgChange = priceChanges.length > 0 
      ? priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length 
      : 0;
    const positiveCount = priceChanges.filter(change => change > 0).length;
    const strongPositive = priceChanges.filter(change => change > 0.02).length;
    const strongNegative = priceChanges.filter(change => change < -0.02).length;
    
    return {
      average: avgChange,
      direction: avgChange > 0 ? 'up' : avgChange < 0 ? 'down' : 'flat',
      strength: Math.abs(avgChange),
      breadth: positiveCount / etfStats.length,
      extremes: {
        strongPositive,
        strongNegative,
        ratio: strongPositive / (strongPositive + strongNegative) || 0.5
      }
    };
  }
  
  // 分析波动率聚类
  analyzeVolatilityCluster(volatilities) {
    const avg = volatilities.reduce((sum, vol) => sum + vol, 0) / volatilities.length;
    const sorted = [...volatilities].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = Math.max(...volatilities);
    const min = Math.min(...volatilities);
    
    const lowVol = volatilities.filter(vol => vol < 1.5).length;
    const medVol = volatilities.filter(vol => vol >= 1.5 && vol < 3).length;
    const highVol = volatilities.filter(vol => vol >= 3).length;
    
    return {
      average: avg,
      median,
      range: { min, max },
      distribution: {
        low: lowVol,
        medium: medVol,
        high: highVol
      },
      regime: avg < 1.5 ? 'low' : avg < 3 ? 'normal' : 'high'
    };
  }
  
  // 分析行业轮动
  analyzeSectorRotation(etfStats) {
    // 根据ETF名称简单分类
    const sectors = {
      tech: etfStats.filter(etf => etf.name.includes('科创') || etf.name.includes('纳指')),
      finance: etfStats.filter(etf => etf.name.includes('银行') || etf.name.includes('券商') || etf.name.includes('证券')),
      consumer: etfStats.filter(etf => etf.name.includes('酒') || etf.name.includes('消费')),
      healthcare: etfStats.filter(etf => etf.name.includes('医疗')),
      energy: etfStats.filter(etf => etf.name.includes('光伏') || etf.name.includes('新能源')),
      materials: etfStats.filter(etf => etf.name.includes('有色') || etf.name.includes('黄金')),
      broad: etfStats.filter(etf => etf.name.includes('300') || etf.name.includes('500') || etf.name.includes('50'))
    };
    
    const sectorPerformance = {};
    for (const [sector, etfs] of Object.entries(sectors)) {
      if (etfs.length > 0) {
        const avgChange = etfs.reduce((sum, etf) => sum + (etf.current - etf.ma5) / etf.ma5, 0) / etfs.length;
        const buySignals = etfs.filter(etf => etf.signal.includes('买入')).length;
        
        sectorPerformance[sector] = {
          count: etfs.length,
          avgChange,
          buySignals,
          strength: buySignals / etfs.length
        };
      }
    }
    
    // 找出最强和最弱的行业
    const sortedSectors = Object.entries(sectorPerformance)
      .sort(([,a], [,b]) => b.avgChange - a.avgChange);
    
    return {
      performance: sectorPerformance,
      strongest: sortedSectors[0] || null,
      weakest: sortedSectors[sortedSectors.length - 1] || null,
      rotation: this.detectRotation(sectorPerformance)
    };
  }
  
  // 检测行业轮动
  detectRotation(sectorPerformance) {
    const sectors = Object.entries(sectorPerformance);
    if (sectors.length < 2) return 'insufficient_data';
    
    const performances = sectors.map(([_, perf]) => perf.avgChange);
    const range = Math.max(...performances) - Math.min(...performances);
    
    if (range > 0.05) return 'strong_rotation';
    if (range > 0.02) return 'moderate_rotation';
    return 'weak_rotation';
  }
  
  // 计算综合情绪评分 (0-100)
  calculateSentimentScore(analysis) {
    let score = 50; // 中性起点
    
    // 信号分布权重 (30%)
    const signalWeight = 30;
    const bullishBonus = (analysis.signalDistribution.bullishRatio - 0.5) * signalWeight;
    score += bullishBonus;
    
    // 动量权重 (25%)
    const momentumWeight = 25;
    const momentumBonus = analysis.momentum.average * momentumWeight * 100;
    score += momentumBonus;
    
    // 广度权重 (20%)
    const breadthWeight = 20;
    const breadthBonus = (analysis.momentum.breadth - 0.5) * breadthWeight;
    score += breadthBonus;
    
    // 波动率权重 (15%) - 低波动率加分
    const volWeight = 15;
    const volPenalty = analysis.volatility.regime === 'high' ? -volWeight : 
                      analysis.volatility.regime === 'low' ? volWeight * 0.5 : 0;
    score += volPenalty;
    
    // 行业轮动权重 (10%)
    const rotationWeight = 10;
    const rotationBonus = analysis.sectorRotation.rotation === 'strong_rotation' ? rotationWeight : 0;
    score += rotationBonus;
    
    return Math.max(0, Math.min(100, score));
  }
  
  // 获取情绪等级
  getSentimentLevel(score) {
    if (score >= 80) return 'extremely_bullish';
    if (score >= 65) return 'bullish';
    if (score >= 55) return 'slightly_bullish';
    if (score >= 45) return 'neutral';
    if (score >= 35) return 'slightly_bearish';
    if (score >= 20) return 'bearish';
    return 'extremely_bearish';
  }
  
  // 获取操作建议
  getRecommendation(score) {
    if (score >= 75) return { action: 'aggressive_buy', confidence: 'high' };
    if (score >= 60) return { action: 'buy', confidence: 'medium' };
    if (score >= 55) return { action: 'cautious_buy', confidence: 'low' };
    if (score >= 45) return { action: 'hold', confidence: 'medium' };
    if (score >= 40) return { action: 'cautious_sell', confidence: 'low' };
    if (score >= 25) return { action: 'sell', confidence: 'medium' };
    return { action: 'defensive', confidence: 'high' };
  }
  
  // 获取情绪趋势
  getSentimentTrend(periods = 5) {
    if (this.sentimentHistory.length < periods) return 'insufficient_data';
    
    const recent = this.sentimentHistory.slice(-periods);
    const scores = recent.map(s => s.score);
    
    const trend = scores[scores.length - 1] - scores[0];
    const avgChange = trend / (scores.length - 1);
    
    if (avgChange > 2) return 'improving';
    if (avgChange < -2) return 'deteriorating';
    return 'stable';
  }
  
  // 修剪历史记录
  trimHistory() {
    if (this.sentimentHistory.length > this.config.sentimentWindow) {
      this.sentimentHistory = this.sentimentHistory.slice(-this.config.sentimentWindow);
    }
  }
  
  // 生成情绪报告
  generateSentimentReport() {
    const latest = this.sentimentHistory[this.sentimentHistory.length - 1];
    if (!latest) return null;
    
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      current: latest,
      trend: this.getSentimentTrend(),
      summary: {
        level: latest.level,
        score: latest.score.toFixed(1),
        recommendation: latest.recommendation,
        keyFactors: this.getKeyFactors(latest)
      }
    };
  }
  
  // 获取关键因素
  getKeyFactors(sentiment) {
    const factors = [];
    
    if (sentiment.distribution.bullishRatio > 0.7) {
      factors.push('强烈看涨信号占主导');
    } else if (sentiment.distribution.bullishRatio < 0.3) {
      factors.push('看跌信号占主导');
    }
    
    if (sentiment.momentum.strength > 0.03) {
      factors.push(`${sentiment.momentum.direction === 'up' ? '上涨' : '下跌'}动量强劲`);
    }
    
    if (sentiment.volatility.regime === 'high') {
      factors.push('市场波动率偏高');
    }
    
    if (sentiment.sectorRotation.rotation === 'strong_rotation') {
      factors.push('行业轮动明显');
    }
    
    return factors;
  }
}

module.exports = { MarketSentimentAnalyzer };
