// 技术指标计算模块
const decimal = require('decimal.js');

class TechnicalIndicators {
  
  /**
   * 计算RSI指标
   * @param {Array} prices - 价格数组
   * @param {number} period - 计算周期，默认14
   */
  static calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(new decimal(prices[i]).minus(prices[i - 1]));
    }
    
    let avgGain = new decimal(0);
    let avgLoss = new decimal(0);
    
    // 计算初始平均涨跌幅
    for (let i = 0; i < period; i++) {
      if (changes[i].gt(0)) {
        avgGain = avgGain.plus(changes[i]);
      } else {
        avgLoss = avgLoss.plus(changes[i].abs());
      }
    }
    
    avgGain = avgGain.dividedBy(period);
    avgLoss = avgLoss.dividedBy(period);
    
    // 计算最新RSI
    for (let i = period; i < changes.length; i++) {
      const gain = changes[i].gt(0) ? changes[i] : new decimal(0);
      const loss = changes[i].lt(0) ? changes[i].abs() : new decimal(0);
      
      avgGain = avgGain.times(period - 1).plus(gain).dividedBy(period);
      avgLoss = avgLoss.times(period - 1).plus(loss).dividedBy(period);
    }
    
    if (avgLoss.eq(0)) return 100;
    
    const rs = avgGain.dividedBy(avgLoss);
    const rsi = new decimal(100).minus(new decimal(100).dividedBy(rs.plus(1)));
    
    return rsi.toNumber();
  }
  
  /**
   * 计算MACD指标
   * @param {Array} prices - 价格数组
   * @param {number} fastPeriod - 快线周期，默认12
   * @param {number} slowPeriod - 慢线周期，默认26
   * @param {number} signalPeriod - 信号线周期，默认9
   */
  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return null;
    
    const ema12 = this.calculateEMA(prices, fastPeriod);
    const ema26 = this.calculateEMA(prices, slowPeriod);
    
    if (!ema12 || !ema26) return null;
    
    const macdLine = new decimal(ema12).minus(ema26);
    
    // 计算信号线（MACD的EMA）
    const macdHistory = [macdLine.toNumber()];
    const signalLine = this.calculateEMA(macdHistory, signalPeriod) || 0;
    
    const histogram = macdLine.minus(signalLine);
    
    return {
      macd: macdLine.toNumber(),
      signal: signalLine,
      histogram: histogram.toNumber()
    };
  }
  
  /**
   * 计算EMA指数移动平均
   * @param {Array} prices - 价格数组
   * @param {number} period - 周期
   */
  static calculateEMA(prices, period) {
    if (prices.length < period) return null;
    
    const multiplier = new decimal(2).dividedBy(period + 1);
    let ema = new decimal(prices[0]);
    
    for (let i = 1; i < prices.length; i++) {
      ema = new decimal(prices[i]).minus(ema).times(multiplier).plus(ema);
    }
    
    return ema.toNumber();
  }
  
  /**
   * 计算布林带
   * @param {Array} prices - 价格数组
   * @param {number} period - 周期，默认20
   * @param {number} stdDev - 标准差倍数，默认2
   */
  static calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;
    
    const recentPrices = prices.slice(-period);
    const sma = recentPrices.reduce((sum, price) => sum + price, 0) / period;
    
    // 计算标准差
    const variance = recentPrices.reduce((sum, price) => {
      return sum + Math.pow(price - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev),
      bandwidth: (standardDeviation * stdDev * 2) / sma * 100
    };
  }
  
  /**
   * 计算成交量比率
   * @param {Array} volumes - 成交量数组
   * @param {number} period - 周期，默认20
   */
  static calculateVolumeRatio(volumes, period = 20) {
    if (volumes.length < period + 1) return 1;
    
    const recentVolumes = volumes.slice(-period);
    const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
    const currentVolume = volumes[volumes.length - 1];
    
    return avgVolume > 0 ? currentVolume / avgVolume : 1;
  }
  
  /**
   * 计算价格动量
   * @param {Array} prices - 价格数组
   * @param {number} period - 周期，默认10
   */
  static calculateMomentum(prices, period = 10) {
    if (prices.length < period + 1) return 0;
    
    const currentPrice = prices[prices.length - 1];
    const pastPrice = prices[prices.length - 1 - period];
    
    return ((currentPrice - pastPrice) / pastPrice) * 100;
  }
  
  /**
   * 综合技术分析评分
   * @param {Object} indicators - 各项技术指标
   */
  static getTechnicalScore(indicators) {
    let score = 50; // 中性分数
    let signals = [];
    
    // RSI评分
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        score += 20;
        signals.push('RSI超卖');
      } else if (indicators.rsi > 70) {
        score -= 20;
        signals.push('RSI超买');
      }
    }
    
    // MACD评分
    if (indicators.macd) {
      if (indicators.macd.macd > indicators.macd.signal) {
        score += 15;
        signals.push('MACD金叉');
      } else {
        score -= 15;
        signals.push('MACD死叉');
      }
    }
    
    // 布林带评分
    if (indicators.bollinger) {
      const currentPrice = indicators.currentPrice;
      if (currentPrice < indicators.bollinger.lower) {
        score += 10;
        signals.push('跌破布林下轨');
      } else if (currentPrice > indicators.bollinger.upper) {
        score -= 10;
        signals.push('突破布林上轨');
      }
    }
    
    // 成交量评分
    if (indicators.volumeRatio > 1.5) {
      score += 5;
      signals.push('放量');
    } else if (indicators.volumeRatio < 0.5) {
      score -= 5;
      signals.push('缩量');
    }
    
    // 动量评分
    if (indicators.momentum > 5) {
      score += 10;
      signals.push('强势动量');
    } else if (indicators.momentum < -5) {
      score -= 10;
      signals.push('弱势动量');
    }
    
    return {
      score: Math.max(0, Math.min(100, score)),
      signals: signals,
      level: this.getScoreLevel(score)
    };
  }
  
  /**
   * 获取评分等级
   * @param {number} score - 技术分数
   */
  static getScoreLevel(score) {
    if (score >= 80) return '强烈买入';
    if (score >= 65) return '买入';
    if (score >= 55) return '弱势买入';
    if (score >= 45) return '中性';
    if (score >= 35) return '弱势卖出';
    if (score >= 20) return '卖出';
    return '强烈卖出';
  }
}

module.exports = TechnicalIndicators;
