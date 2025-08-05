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
   * @param {Object} marketContext - 市场环境上下文
   */
  static getTechnicalScore(indicators, marketContext = {}) {
    let score = 50; // 中性分数
    let signals = [];

    // 根据市场环境动态调整权重
    const weights = this.getAdaptiveWeights(marketContext);
    const thresholds = this.getAdaptiveThresholds(marketContext);

    // RSI评分 (动态权重)
    if (indicators.rsi) {
      const rsiScore = this.calculateRSIScore(indicators.rsi, thresholds.rsi);
      score += rsiScore.score * weights.rsi;
      if (rsiScore.signal) signals.push(rsiScore.signal);
    }

    // MACD评分 (动态权重)
    if (indicators.macd) {
      const macdScore = this.calculateMACDScore(indicators.macd);
      score += macdScore.score * weights.macd;
      if (macdScore.signal) signals.push(macdScore.signal);
    }

    // 布林带评分 (动态权重)
    if (indicators.bollinger) {
      const bbScore = this.calculateBollingerScore(indicators.currentPrice, indicators.bollinger);
      score += bbScore.score * weights.bollinger;
      if (bbScore.signal) signals.push(bbScore.signal);
    }

    // KDJ评分 (动态权重)
    if (indicators.kdj) {
      const kdjScore = this.calculateKDJScore(indicators.kdj, thresholds.kdj);
      score += kdjScore.score * weights.kdj;
      if (kdjScore.signal) signals.push(kdjScore.signal);
    }

    // 威廉指标评分 (动态权重)
    if (indicators.williamsR) {
      const wrScore = this.calculateWilliamsScore(indicators.williamsR, thresholds.williams);
      score += wrScore.score * weights.williams;
      if (wrScore.signal) signals.push(wrScore.signal);
    }

    // CCI评分 (动态权重)
    if (indicators.cci) {
      const cciScore = this.calculateCCIScore(indicators.cci, thresholds.cci);
      score += cciScore.score * weights.cci;
      if (cciScore.signal) signals.push(cciScore.signal);
    }

    // 成交量评分 (动态权重)
    const volumeScore = this.calculateVolumeScore(indicators.volumeRatio, thresholds.volume);
    score += volumeScore.score * weights.volume;
    if (volumeScore.signal) signals.push(volumeScore.signal);

    // 动量评分 (动态权重)
    const momentumScore = this.calculateMomentumScore(indicators.momentum, thresholds.momentum);
    score += momentumScore.score * weights.momentum;
    if (momentumScore.signal) signals.push(momentumScore.signal);

    // ATR波动率调整 (动态权重)
    if (indicators.atr) {
      const atrScore = this.calculateATRScore(indicators.atr, thresholds.atr);
      score += atrScore.score * weights.atr;
      if (atrScore.signal) signals.push(atrScore.signal);
    }

    // 指标一致性加权
    const consistencyBonus = this.calculateConsistencyBonus(signals);
    score += consistencyBonus;

    return {
      score: Math.max(0, Math.min(100, score)),
      signals: signals,
      level: this.getScoreLevel(score),
      consistency: consistencyBonus,
      weights: weights
    };
  }

  /**
   * 根据市场环境获取动态权重
   */
  static getAdaptiveWeights(marketContext) {
    const { trend = 'neutral', volatility = 'normal', volume = 'normal' } = marketContext;

    // 基础权重
    let weights = {
      rsi: 0.20,
      macd: 0.15,
      bollinger: 0.10,
      kdj: 0.15,
      williams: 0.10,
      cci: 0.10,
      volume: 0.05,
      momentum: 0.10,
      atr: 0.05
    };

    // 根据市场趋势调整权重
    if (trend === 'bullish') {
      weights.momentum += 0.05; // 牛市中动量更重要
      weights.rsi -= 0.03;
    } else if (trend === 'bearish') {
      weights.rsi += 0.05; // 熊市中RSI更重要
      weights.momentum -= 0.03;
    }

    // 根据波动率调整权重
    if (volatility === 'high') {
      weights.atr += 0.05; // 高波动时ATR更重要
      weights.bollinger += 0.03;
      weights.volume -= 0.03;
    } else if (volatility === 'low') {
      weights.volume += 0.03; // 低波动时成交量更重要
      weights.atr -= 0.02;
    }

    return weights;
  }

  /**
   * 根据市场环境获取动态阈值
   */
  static getAdaptiveThresholds(marketContext) {
    const { trend = 'neutral', volatility = 'normal' } = marketContext;

    let thresholds = {
      rsi: { oversold: 30, overbought: 70 },
      kdj: { oversold: 20, overbought: 80 },
      williams: { oversold: -80, overbought: -20 },
      cci: { oversold: -100, overbought: 100 },
      volume: { low: 0.5, high: 1.5 },
      momentum: { weak: -5, strong: 5 },
      atr: { low: 1, high: 3 }
    };

    // 牛市中提高超买容忍度
    if (trend === 'bullish') {
      thresholds.rsi.overbought = 75;
      thresholds.kdj.overbought = 85;
      thresholds.williams.overbought = -15;
    }

    // 熊市中提高超卖敏感度
    if (trend === 'bearish') {
      thresholds.rsi.oversold = 35;
      thresholds.kdj.oversold = 25;
      thresholds.williams.oversold = -75;
    }

    // 高波动时调整阈值
    if (volatility === 'high') {
      thresholds.atr.high = 5;
      thresholds.momentum.strong = 8;
      thresholds.momentum.weak = -8;
    }

    return thresholds;
  }
  
  /**
   * 计算RSI评分
   */
  static calculateRSIScore(rsi, thresholds) {
    if (rsi < thresholds.oversold) {
      return { score: 20, signal: `RSI超卖(${rsi.toFixed(1)})` };
    } else if (rsi > thresholds.overbought) {
      return { score: -12, signal: `RSI超买(${rsi.toFixed(1)})` }; // 减少惩罚
    } else if (rsi >= 40 && rsi <= 60) {
      return { score: 5, signal: 'RSI中性偏好' }; // 中性区间加分
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算MACD评分
   */
  static calculateMACDScore(macd) {
    if (macd.macd > macd.signal) {
      const strength = Math.min(Math.abs(macd.histogram) * 10, 15);
      return { score: strength, signal: 'MACD金叉' };
    } else {
      const weakness = Math.min(Math.abs(macd.histogram) * 10, 15);
      return { score: -weakness, signal: 'MACD死叉' };
    }
  }

  /**
   * 计算布林带评分
   */
  static calculateBollingerScore(currentPrice, bollinger) {
    const position = (currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower);

    if (position < 0.1) {
      return { score: 12, signal: '接近布林下轨' };
    } else if (position > 0.9) {
      return { score: -8, signal: '接近布林上轨' }; // 减少惩罚
    } else if (position >= 0.4 && position <= 0.6) {
      return { score: 3, signal: '布林中轨附近' };
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算KDJ评分
   */
  static calculateKDJScore(kdj, thresholds) {
    const k = parseFloat(kdj.k);
    const d = parseFloat(kdj.d);
    const j = parseFloat(kdj.j);

    if (k < thresholds.oversold && d < thresholds.oversold) {
      return { score: 15, signal: 'KDJ超卖' };
    } else if (k > thresholds.overbought && d > thresholds.overbought) {
      return { score: -10, signal: 'KDJ超买' }; // 减少惩罚
    } else if (k > d && k < 50) {
      return { score: 8, signal: 'KDJ金叉' };
    } else if (k < d && k > 50) {
      return { score: -6, signal: 'KDJ死叉' }; // 减少惩罚
    } else if (j > 100) {
      return { score: -5, signal: 'J值极度超买' };
    } else if (j < 0) {
      return { score: 8, signal: 'J值极度超卖' };
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算威廉指标评分
   */
  static calculateWilliamsScore(williamsR, thresholds) {
    const wr = parseFloat(williamsR.value);

    if (wr < thresholds.oversold) {
      return { score: 10, signal: '威廉超卖' };
    } else if (wr > thresholds.overbought) {
      return { score: -8, signal: '威廉超买' }; // 减少惩罚
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算CCI评分
   */
  static calculateCCIScore(cci, thresholds) {
    const cciValue = parseFloat(cci.value);

    if (cciValue < thresholds.oversold) {
      return { score: 10, signal: 'CCI超卖' };
    } else if (cciValue > thresholds.overbought) {
      return { score: -8, signal: 'CCI超买' }; // 减少惩罚
    } else if (cciValue > 0 && cciValue < 50) {
      return { score: 3, signal: 'CCI温和看涨' };
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算成交量评分
   */
  static calculateVolumeScore(volumeRatio, thresholds) {
    if (volumeRatio > thresholds.high) {
      return { score: 5, signal: '放量' };
    } else if (volumeRatio < thresholds.low) {
      return { score: -3, signal: '缩量' }; // 减少惩罚
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算动量评分
   */
  static calculateMomentumScore(momentum, thresholds) {
    if (momentum > thresholds.strong) {
      return { score: 10, signal: '强势动量' };
    } else if (momentum < thresholds.weak) {
      return { score: -8, signal: '弱势动量' }; // 减少惩罚
    } else if (momentum > 0 && momentum < thresholds.strong) {
      return { score: 3, signal: '温和上涨动量' };
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算ATR评分
   */
  static calculateATRScore(atr, thresholds) {
    const atrPct = parseFloat(atr.percentage);

    if (atrPct > thresholds.high) {
      return { score: -3, signal: '高波动率' }; // 减少惩罚
    } else if (atrPct < thresholds.low) {
      return { score: 3, signal: '低波动率' };
    }
    return { score: 0, signal: null };
  }

  /**
   * 计算指标一致性加权
   */
  static calculateConsistencyBonus(signals) {
    const bullishSignals = signals.filter(s =>
      s.includes('超卖') || s.includes('金叉') || s.includes('强势') || s.includes('放量')
    ).length;

    const bearishSignals = signals.filter(s =>
      s.includes('超买') || s.includes('死叉') || s.includes('弱势') || s.includes('缩量')
    ).length;

    const totalSignals = bullishSignals + bearishSignals;
    if (totalSignals < 3) return 0; // 信号太少不给一致性加权

    const consistency = Math.abs(bullishSignals - bearishSignals) / totalSignals;

    if (consistency > 0.6) {
      return bullishSignals > bearishSignals ? 5 : -3; // 一致性好时给予加权
    }

    return 0;
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
