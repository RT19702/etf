// 🔍 智能信号过滤器
const fs = require('fs');
const dayjs = require('dayjs');

class IntelligentSignalFilter {
  constructor(config = {}) {
    this.config = {
      confirmationPeriods: config.confirmationPeriods || 3,
      volumeThreshold: config.volumeThreshold || 1.2,
      priceChangeThreshold: config.priceChangeThreshold || 0.02,
      // 优化：基础冷却期，将根据市场情况动态调整
      baseCooldown: config.baseCooldown || 300000, // 5分钟基础冷却
      minCooldown: config.minCooldown || 120000,   // 最小2分钟
      maxCooldown: config.maxCooldown || 600000,   // 最大10分钟
      maxSignalsPerHour: config.maxSignalsPerHour || 6,
      ...config
    };

    this.signalHistory = new Map(); // symbol -> signals[]
    this.lastSignalTime = new Map(); // symbol -> timestamp
    this.hourlySignalCount = new Map(); // hour -> count
    this.marketConditions = {
      trend: 'neutral',
      volatility: 'normal',
      volume: 'normal'
    };
  }
  
  // 添加信号到历史
  addSignal(symbol, signal, price, volume, timestamp = Date.now()) {
    if (!this.signalHistory.has(symbol)) {
      this.signalHistory.set(symbol, []);
    }
    
    const history = this.signalHistory.get(symbol);
    history.push({
      signal,
      price,
      volume,
      timestamp,
      confirmed: false
    });
    
    // 只保留最近的信号
    if (history.length > this.config.confirmationPeriods * 3) {
      history.splice(0, history.length - this.config.confirmationPeriods * 3);
    }
    
    this.cleanupOldSignals();
  }
  
  // 清理过期信号
  cleanupOldSignals() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24小时前
    
    for (const [symbol, history] of this.signalHistory.entries()) {
      const filtered = history.filter(s => s.timestamp > cutoff);
      if (filtered.length === 0) {
        this.signalHistory.delete(symbol);
      } else {
        this.signalHistory.set(symbol, filtered);
      }
    }
  }
  
  // 检查信号冷却期（优化版 - 动态调整）
  isInCooldown(symbol, signalStrength = 0.5, volatility = 'normal') {
    const lastTime = this.lastSignalTime.get(symbol);
    if (!lastTime) return false;

    // 优化：根据信号强度和市场波动率动态调整冷却期
    const dynamicCooldown = this.calculateDynamicCooldown(signalStrength, volatility);

    return Date.now() - lastTime < dynamicCooldown;
  }

  /**
   * 计算动态冷却期
   * @param {number} signalStrength - 信号强度 (0-1)
   * @param {string} volatility - 市场波动率 ('low', 'normal', 'high')
   * @returns {number} 冷却期（毫秒）
   */
  calculateDynamicCooldown(signalStrength, volatility) {
    let cooldown = this.config.baseCooldown;

    // 1. 根据信号强度调整
    // 强信号缩短冷却期，弱信号延长冷却期
    if (signalStrength > 0.8) {
      cooldown *= 0.6; // 强信号：减少40%冷却时间
    } else if (signalStrength > 0.6) {
      cooldown *= 0.8; // 中强信号：减少20%冷却时间
    } else if (signalStrength < 0.3) {
      cooldown *= 1.5; // 弱信号：增加50%冷却时间
    }

    // 2. 根据市场波动率调整
    switch (volatility) {
      case 'high':
        cooldown *= 1.3; // 高波动：延长30%冷却时间
        break;
      case 'low':
        cooldown *= 0.8; // 低波动：缩短20%冷却时间
        break;
      // 'normal' 不调整
    }

    // 3. 限制在合理范围内
    cooldown = Math.max(this.config.minCooldown, Math.min(cooldown, this.config.maxCooldown));

    return cooldown;
  }
  
  // 检查每小时信号限制
  checkHourlyLimit() {
    const currentHour = dayjs().format('YYYY-MM-DD-HH');
    const count = this.hourlySignalCount.get(currentHour) || 0;
    return count < this.config.maxSignalsPerHour;
  }
  
  // 更新每小时信号计数
  updateHourlyCount() {
    const currentHour = dayjs().format('YYYY-MM-DD-HH');
    const count = this.hourlySignalCount.get(currentHour) || 0;
    this.hourlySignalCount.set(currentHour, count + 1);
    
    // 清理旧的小时计数
    const cutoffHour = dayjs().subtract(24, 'hour').format('YYYY-MM-DD-HH');
    for (const [hour, _] of this.hourlySignalCount.entries()) {
      if (hour < cutoffHour) {
        this.hourlySignalCount.delete(hour);
      }
    }
  }
  
  // 分析信号一致性
  analyzeSignalConsistency(symbol) {
    const history = this.signalHistory.get(symbol) || [];
    if (history.length < this.config.confirmationPeriods) {
      return { consistent: false, strength: 0, pattern: 'insufficient_data' };
    }
    
    const recent = history.slice(-this.config.confirmationPeriods);
    const signals = recent.map(s => s.signal);
    const prices = recent.map(s => s.price);
    const volumes = recent.map(s => s.volume);
    
    // 检查信号一致性
    const uniqueSignals = [...new Set(signals)];
    const consistent = uniqueSignals.length === 1;
    
    // 计算信号强度
    let strength = 0;
    if (consistent) {
      // 价格趋势确认
      const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];
      const expectedDirection = signals[0].includes('买入') ? 1 : signals[0].includes('卖出') ? -1 : 0;
      const priceConfirms = Math.sign(priceChange) === expectedDirection;
      
      // 成交量确认
      const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
      const volumeConfirms = avgVolume > this.config.volumeThreshold;
      
      strength = (priceConfirms ? 0.5 : 0) + (volumeConfirms ? 0.5 : 0);
    }
    
    return {
      consistent,
      strength,
      pattern: this.identifyPattern(recent),
      priceChange: prices.length > 1 ? (prices[prices.length - 1] - prices[0]) / prices[0] : 0,
      volumeRatio: volumes.length > 0 ? Math.max(...volumes) / Math.min(...volumes) : 1
    };
  }
  
  // 识别信号模式
  identifyPattern(signals) {
    if (signals.length < 3) return 'insufficient';
    
    const signalTypes = signals.map(s => s.signal);
    const prices = signals.map(s => s.price);
    
    // 检查趋势
    const isUptrend = prices.every((price, i) => i === 0 || price >= prices[i - 1]);
    const isDowntrend = prices.every((price, i) => i === 0 || price <= prices[i - 1]);
    
    if (isUptrend && signalTypes.every(s => s.includes('买入'))) return 'strong_uptrend';
    if (isDowntrend && signalTypes.every(s => s.includes('卖出'))) return 'strong_downtrend';
    if (signalTypes.every(s => s.includes('持有'))) return 'consolidation';
    
    return 'mixed';
  }
  
  // 更新市场条件
  updateMarketConditions(marketData) {
    const { trend, volatility, volume } = marketData;
    
    this.marketConditions = {
      trend: trend > 2 ? 'bullish' : trend < -2 ? 'bearish' : 'neutral',
      volatility: volatility > 3 ? 'high' : volatility < 1 ? 'low' : 'normal',
      volume: volume > 1.5 ? 'high' : volume < 0.8 ? 'low' : 'normal'
    };
  }
  
  // 主要过滤函数（优化版）
  filterSignal(symbol, signal, price, volume, marketData = null) {
    // 更新市场条件
    if (marketData) {
      this.updateMarketConditions(marketData);
    }

    // 添加信号到历史
    this.addSignal(symbol, signal, price, volume);

    // 分析信号质量（提前计算，用于动态冷却期）
    const analysis = this.analyzeSignalConsistency(symbol);

    // 基础检查（优化：使用动态冷却期）
    const checks = {
      cooldown: !this.isInCooldown(symbol, analysis.strength, this.marketConditions.volatility),
      hourlyLimit: this.checkHourlyLimit(),
      marketCondition: this.checkMarketCondition(signal),
      signalQuality: analysis.consistent && analysis.strength > 0.5
    };

    // 特殊市场条件下的额外过滤
    if (this.marketConditions.volatility === 'high') {
      checks.volatilityFilter = analysis.strength > 0.7; // 高波动时要求更高确认度
    } else {
      checks.volatilityFilter = true;
    }

    const shouldExecute = Object.values(checks).every(check => check);

    // 记录过滤结果（优化：包含动态冷却期信息）
    this.logFilterResult(symbol, signal, checks, analysis, shouldExecute);

    if (shouldExecute) {
      this.lastSignalTime.set(symbol, Date.now());
      this.updateHourlyCount();
    }

    return {
      execute: shouldExecute,
      confidence: analysis.strength,
      pattern: analysis.pattern,
      checks,
      analysis,
      // 优化：返回下次可执行时间
      nextAvailableTime: shouldExecute ? null : this.getNextAvailableTime(symbol, analysis.strength)
    };
  }

  /**
   * 获取下次可执行信号的时间
   * @param {string} symbol - 股票代码
   * @param {number} signalStrength - 信号强度
   * @returns {number|null} 时间戳
   */
  getNextAvailableTime(symbol, signalStrength) {
    const lastTime = this.lastSignalTime.get(symbol);
    if (!lastTime) return null;

    const cooldown = this.calculateDynamicCooldown(signalStrength, this.marketConditions.volatility);
    return lastTime + cooldown;
  }
  
  // 检查市场条件适合性
  checkMarketCondition(signal) {
    const { trend, volatility } = this.marketConditions;
    
    // 在极端市场条件下更谨慎
    if (volatility === 'high') {
      return signal.includes('持有'); // 高波动时偏向持有
    }
    
    if (trend === 'bearish' && signal.includes('买入')) {
      return false; // 熊市中避免买入信号
    }
    
    return true;
  }
  
  // 记录过滤结果
  logFilterResult(symbol, signal, checks, analysis, result) {
    const logEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      symbol,
      signal,
      result,
      checks,
      analysis: {
        consistent: analysis.consistent,
        strength: analysis.strength,
        pattern: analysis.pattern
      },
      marketConditions: this.marketConditions
    };
    
    fs.appendFileSync('signal_filter.log', JSON.stringify(logEntry) + '\n');
  }
  
  // 获取过滤统计
  getFilterStats() {
    const currentHour = dayjs().format('YYYY-MM-DD-HH');
    
    return {
      signalsInHistory: this.signalHistory.size,
      signalsThisHour: this.hourlySignalCount.get(currentHour) || 0,
      marketConditions: this.marketConditions,
      activeSymbols: Array.from(this.signalHistory.keys()),
      cooldownSymbols: Array.from(this.lastSignalTime.entries())
        .filter(([_, time]) => Date.now() - time < this.config.signalCooldown)
        .map(([symbol, _]) => symbol)
    };
  }
  
  // 重置过滤器
  reset() {
    this.signalHistory.clear();
    this.lastSignalTime.clear();
    this.hourlySignalCount.clear();
  }
}

module.exports = { IntelligentSignalFilter };
