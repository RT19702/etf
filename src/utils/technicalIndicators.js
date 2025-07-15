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
   * 计算KDJ指标
   * @param {Array} highs - 最高价数组
   * @param {Array} lows - 最低价数组
   * @param {Array} closes - 收盘价数组
   * @param {number} period - 计算周期，默认9
   * @param {number} m1 - K值平滑参数，默认3
   * @param {number} m2 - D值平滑参数，默认3
   */
  static calculateKDJ(highs, lows, closes, period = 9, m1 = 3, m2 = 3) {
    if (!highs || !lows || !closes || highs.length < period ||
        lows.length < period || closes.length < period) {
      return null;
    }

    try {
      const length = Math.min(highs.length, lows.length, closes.length);
      const rsvs = [];

      // 计算RSV值
      for (let i = period - 1; i < length; i++) {
        const periodHigh = Math.max(...highs.slice(i - period + 1, i + 1));
        const periodLow = Math.min(...lows.slice(i - period + 1, i + 1));
        const currentClose = closes[i];

        let rsv;
        if (periodHigh === periodLow) {
          rsv = 50; // 避免除零错误
        } else {
          rsv = ((currentClose - periodLow) / (periodHigh - periodLow)) * 100;
        }
        rsvs.push(rsv);
      }

      if (rsvs.length === 0) return null;

      // 计算K值（RSV的移动平均）
      let k = 50; // 初始K值
      let d = 50; // 初始D值

      const kValues = [];
      const dValues = [];
      const jValues = [];

      for (let i = 0; i < rsvs.length; i++) {
        k = (rsvs[i] + (m1 - 1) * k) / m1;
        d = (k + (m2 - 1) * d) / m2;
        const j = 3 * k - 2 * d;

        kValues.push(k);
        dValues.push(d);
        jValues.push(j);
      }

      return {
        k: new decimal(kValues[kValues.length - 1]).toFixed(2),
        d: new decimal(dValues[dValues.length - 1]).toFixed(2),
        j: new decimal(jValues[jValues.length - 1]).toFixed(2),
        signal: this.getKDJSignal(kValues[kValues.length - 1], dValues[dValues.length - 1], jValues[jValues.length - 1])
      };
    } catch (error) {
      console.error('KDJ计算错误:', error);
      return null;
    }
  }

  /**
   * 计算威廉指标(%R)
   * @param {Array} highs - 最高价数组
   * @param {Array} lows - 最低价数组
   * @param {Array} closes - 收盘价数组
   * @param {number} period - 计算周期，默认14
   */
  static calculateWilliamsR(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || highs.length < period ||
        lows.length < period || closes.length < period) {
      return null;
    }

    try {
      const length = Math.min(highs.length, lows.length, closes.length);
      const currentClose = closes[length - 1];

      const periodHigh = Math.max(...highs.slice(length - period, length));
      const periodLow = Math.min(...lows.slice(length - period, length));

      let wr;
      if (periodHigh === periodLow) {
        wr = -50; // 避免除零错误
      } else {
        wr = ((periodHigh - currentClose) / (periodHigh - periodLow)) * -100;
      }

      return {
        value: new decimal(wr).toFixed(2),
        signal: this.getWilliamsRSignal(wr)
      };
    } catch (error) {
      console.error('威廉指标计算错误:', error);
      return null;
    }
  }

  /**
   * 计算CCI指标（顺势指标）
   * @param {Array} highs - 最高价数组
   * @param {Array} lows - 最低价数组
   * @param {Array} closes - 收盘价数组
   * @param {number} period - 计算周期，默认20
   */
  static calculateCCI(highs, lows, closes, period = 20) {
    if (!highs || !lows || !closes || highs.length < period ||
        lows.length < period || closes.length < period) {
      return null;
    }

    try {
      const length = Math.min(highs.length, lows.length, closes.length);
      const typicalPrices = [];

      // 计算典型价格
      for (let i = 0; i < length; i++) {
        const tp = (highs[i] + lows[i] + closes[i]) / 3;
        typicalPrices.push(tp);
      }

      // 计算最近period天的典型价格移动平均
      const recentTPs = typicalPrices.slice(length - period, length);
      const smaTP = recentTPs.reduce((sum, tp) => sum + tp, 0) / period;

      // 计算平均绝对偏差
      const meanDeviation = recentTPs.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;

      // 计算CCI
      const currentTP = typicalPrices[length - 1];
      let cci;
      if (meanDeviation === 0) {
        cci = 0;
      } else {
        cci = (currentTP - smaTP) / (0.015 * meanDeviation);
      }

      return {
        value: new decimal(cci).toFixed(2),
        signal: this.getCCISignal(cci)
      };
    } catch (error) {
      console.error('CCI计算错误:', error);
      return null;
    }
  }

  /**
   * 计算ATR指标（真实波动幅度）
   * @param {Array} highs - 最高价数组
   * @param {Array} lows - 最低价数组
   * @param {Array} closes - 收盘价数组
   * @param {number} period - 计算周期，默认14
   */
  static calculateATR(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || highs.length < period + 1 ||
        lows.length < period + 1 || closes.length < period + 1) {
      return null;
    }

    try {
      const length = Math.min(highs.length, lows.length, closes.length);
      const trueRanges = [];

      // 计算真实波动幅度
      for (let i = 1; i < length; i++) {
        const tr1 = highs[i] - lows[i];
        const tr2 = Math.abs(highs[i] - closes[i - 1]);
        const tr3 = Math.abs(lows[i] - closes[i - 1]);

        const tr = Math.max(tr1, tr2, tr3);
        trueRanges.push(tr);
      }

      // 计算ATR（真实波动幅度的移动平均）
      const recentTRs = trueRanges.slice(trueRanges.length - period, trueRanges.length);
      const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;

      return {
        value: new decimal(atr).toFixed(4),
        percentage: new decimal((atr / closes[length - 1]) * 100).toFixed(2)
      };
    } catch (error) {
      console.error('ATR计算错误:', error);
      return null;
    }
  }

  /**
   * 获取KDJ信号
   * @param {number} k - K值
   * @param {number} d - D值
   * @param {number} j - J值 (可选参数，用于更精确的信号判断)
   */
  static getKDJSignal(k, d, j = null) {
    if (k < 20 && d < 20) return '超卖';
    if (k > 80 && d > 80) return '超买';
    if (k > d && k < 50) return '金叉买入';
    if (k < d && k > 50) return '死叉卖出';
    // 如果提供了J值，可以进行更精确的判断
    if (j !== null && j > 100) return '极度超买';
    if (j !== null && j < 0) return '极度超卖';
    return '中性';
  }

  /**
   * 获取威廉指标信号
   * @param {number} wr - 威廉指标值
   */
  static getWilliamsRSignal(wr) {
    if (wr < -80) return '超卖';
    if (wr > -20) return '超买';
    return '中性';
  }

  /**
   * 获取CCI信号
   * @param {number} cci - CCI值
   */
  static getCCISignal(cci) {
    if (cci > 100) return '超买';
    if (cci < -100) return '超卖';
    if (cci > 0) return '看涨';
    return '看跌';
  }

  /**
   * 综合技术分析评分（增强版）
   * @param {Object} indicators - 各项技术指标
   */
  static getTechnicalScore(indicators) {
    let score = 50; // 中性分数
    let signals = [];

    // RSI评分 (权重: 20%)
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        score += 20;
        signals.push('RSI超卖');
      } else if (indicators.rsi > 70) {
        score -= 20;
        signals.push('RSI超买');
      }
    }

    // MACD评分 (权重: 15%)
    if (indicators.macd) {
      if (indicators.macd.macd > indicators.macd.signal) {
        score += 15;
        signals.push('MACD金叉');
      } else {
        score -= 15;
        signals.push('MACD死叉');
      }
    }

    // 布林带评分 (权重: 10%)
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

    // KDJ评分 (权重: 15%)
    if (indicators.kdj) {
      const k = parseFloat(indicators.kdj.k);
      const d = parseFloat(indicators.kdj.d);
      if (k < 20 && d < 20) {
        score += 15;
        signals.push('KDJ超卖');
      } else if (k > 80 && d > 80) {
        score -= 15;
        signals.push('KDJ超买');
      } else if (k > d && k < 50) {
        score += 8;
        signals.push('KDJ金叉');
      } else if (k < d && k > 50) {
        score -= 8;
        signals.push('KDJ死叉');
      }
    }

    // 威廉指标评分 (权重: 10%)
    if (indicators.williamsR) {
      const wr = parseFloat(indicators.williamsR.value);
      if (wr < -80) {
        score += 10;
        signals.push('威廉超卖');
      } else if (wr > -20) {
        score -= 10;
        signals.push('威廉超买');
      }
    }

    // CCI评分 (权重: 10%)
    if (indicators.cci) {
      const cci = parseFloat(indicators.cci.value);
      if (cci < -100) {
        score += 10;
        signals.push('CCI超卖');
      } else if (cci > 100) {
        score -= 10;
        signals.push('CCI超买');
      }
    }

    // 成交量评分 (权重: 5%)
    if (indicators.volumeRatio > 1.5) {
      score += 5;
      signals.push('放量');
    } else if (indicators.volumeRatio < 0.5) {
      score -= 5;
      signals.push('缩量');
    }

    // 动量评分 (权重: 10%)
    if (indicators.momentum > 5) {
      score += 10;
      signals.push('强势动量');
    } else if (indicators.momentum < -5) {
      score -= 10;
      signals.push('弱势动量');
    }

    // ATR波动率调整 (权重: 5%)
    if (indicators.atr) {
      const atrPct = parseFloat(indicators.atr.percentage);
      if (atrPct > 3) {
        score -= 5; // 高波动率降低评分
        signals.push('高波动率');
      } else if (atrPct < 1) {
        score += 3; // 低波动率略微加分
        signals.push('低波动率');
      }
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
