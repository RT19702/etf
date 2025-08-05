// 🛡️ 增强风险控制模块
const fs = require('fs');
const dayjs = require('dayjs');

class RiskManager {
  constructor(config = {}) {
    this.config = {
      maxDailyTrades: config.maxDailyTrades || 10,
      maxTotalPosition: config.maxTotalPosition || 0.8,
      maxSinglePosition: config.maxSinglePosition || 0.3,
      stopLossPercent: config.stopLossPercent || 0.05,
      takeProfitPercent: config.takeProfitPercent || 0.15,
      volatilityThreshold: config.volatilityThreshold || 3.0,
      maxDrawdown: config.maxDrawdown || 0.2,
      // 动态止损配置
      trailingStopPercent: config.trailingStopPercent || 0.03, // 追踪止损3%
      timeStopHours: config.timeStopHours || 24, // 时间止损24小时
      technicalStopEnabled: config.technicalStopEnabled !== false, // 技术止损开关
      atrMultiplier: config.atrMultiplier || 2.0, // ATR倍数止损
      volatilityAdjustment: config.volatilityAdjustment !== false, // 波动率调整
      ...config
    };

    this.dailyTrades = 0;
    this.lastTradeDate = null;
    this.positions = new Map();
    this.tradeHistory = [];
    this.stopLossHistory = new Map(); // 止损历史记录
    this.riskMetrics = {
      totalReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0
    };
  }
  
  // 重置每日交易计数
  resetDailyTrades() {
    const today = dayjs().format('YYYY-MM-DD');
    if (this.lastTradeDate !== today) {
      this.dailyTrades = 0;
      this.lastTradeDate = today;
    }
  }
  
  // 检查是否可以开新仓
  canOpenPosition(symbol, size, price, volatility) {
    this.resetDailyTrades();
    
    const checks = {
      dailyTradeLimit: this.dailyTrades < this.config.maxDailyTrades,
      positionSizeLimit: size <= this.config.maxSinglePosition,
      totalPositionLimit: this.getTotalPositionSize() + size <= this.config.maxTotalPosition,
      volatilityCheck: parseFloat(volatility.replace('%', '')) <= this.config.volatilityThreshold,
      notAlreadyHolding: !this.positions.has(symbol)
    };
    
    const canOpen = Object.values(checks).every(check => check);
    
    if (!canOpen) {
      this.logRiskEvent('POSITION_REJECTED', {
        symbol,
        size,
        price,
        volatility,
        checks,
        reason: this.getRejectReason(checks)
      });
    }
    
    return canOpen;
  }
  
  // 获取拒绝原因
  getRejectReason(checks) {
    if (!checks.dailyTradeLimit) return '超出每日交易次数限制';
    if (!checks.positionSizeLimit) return '单个仓位过大';
    if (!checks.totalPositionLimit) return '总仓位过大';
    if (!checks.volatilityCheck) return '波动率过高';
    if (!checks.notAlreadyHolding) return '已持有该标的';
    return '未知原因';
  }
  
  // 开仓（增强版）
  openPosition(symbol, size, price, signal, technicalData = {}) {
    if (!this.canOpenPosition(symbol, size, price, '1.0%')) {
      return false;
    }

    // 计算动态止损价格
    const dynamicStopLoss = this.calculateDynamicStopLoss(price, technicalData);

    const position = {
      symbol,
      size,
      entryPrice: price,
      entryTime: Date.now(),
      signal,
      // 多种止损方式
      fixedStopLoss: price * (1 - this.config.stopLossPercent),
      trailingStopLoss: price * (1 - this.config.trailingStopPercent),
      technicalStopLoss: dynamicStopLoss.technical,
      atrStopLoss: dynamicStopLoss.atr,
      timeStopLoss: Date.now() + (this.config.timeStopHours * 60 * 60 * 1000),
      // 当前生效的止损价格
      currentStopLoss: Math.max(
        price * (1 - this.config.stopLossPercent),
        dynamicStopLoss.technical || 0,
        dynamicStopLoss.atr || 0
      ),
      takeProfit: price * (1 + this.config.takeProfitPercent),
      maxPrice: price,
      minPrice: price,
      // 技术数据
      technicalData: technicalData,
      // 止损类型记录
      stopLossType: 'fixed',
      stopLossUpdates: []
    };

    this.positions.set(symbol, position);
    this.dailyTrades++;

    this.logRiskEvent('POSITION_OPENED', {
      ...position,
      stopLossBreakdown: {
        fixed: position.fixedStopLoss,
        trailing: position.trailingStopLoss,
        technical: position.technicalStopLoss,
        atr: position.atrStopLoss,
        current: position.currentStopLoss
      }
    });
    return true;
  }
  
  // 平仓
  closePosition(symbol, price, reason = 'MANUAL') {
    const position = this.positions.get(symbol);
    if (!position) return false;
    
    const pnl = (price - position.entryPrice) / position.entryPrice;
    const holdingTime = Date.now() - position.entryTime;
    
    const trade = {
      ...position,
      exitPrice: price,
      exitTime: Date.now(),
      pnl,
      holdingTime,
      reason
    };
    
    this.tradeHistory.push(trade);
    this.positions.delete(symbol);
    this.dailyTrades++;
    
    this.updateRiskMetrics();
    this.logRiskEvent('POSITION_CLOSED', trade);
    
    return true;
  }
  
  /**
   * 计算动态止损价格（增强版）
   * @param {number} price - 当前价格
   * @param {Object} technicalData - 技术指标数据
   * @param {Object} marketContext - 市场环境上下文
   * @returns {Object} 各种止损价格
   */
  calculateDynamicStopLoss(price, technicalData = {}, marketContext = {}) {
    const volatility = this.getVolatilityLevel(technicalData);
    const marketTrend = marketContext.trend || 'neutral';

    // 动态调整止损比例
    const adjustedStopLoss = this.getAdjustedStopLossPercent(volatility, marketTrend);
    const adjustedTrailing = this.getAdjustedTrailingPercent(volatility, marketTrend);

    const result = {
      fixed: price * (1 - adjustedStopLoss),
      trailing: price * (1 - adjustedTrailing),
      technical: null,
      atr: null,
      volatilityAdjusted: null,
      recommended: null,
      confidence: 0
    };

    // 基于技术指标的止损
    if (this.config.technicalStopEnabled && technicalData) {
      result.technical = this.calculateTechnicalStopLoss(price, technicalData);
    }

    // 基于ATR的动态止损
    if (technicalData.atr && technicalData.atr.value) {
      const atrValue = parseFloat(technicalData.atr.value);
      const atrMultiplier = this.getAdjustedATRMultiplier(volatility);
      result.atr = price - (atrValue * atrMultiplier);
    }

    // 波动率调整止损
    result.volatilityAdjusted = this.calculateVolatilityAdjustedStopLoss(price, volatility);

    // 选择推荐止损价格
    result.recommended = this.selectRecommendedStopLoss(result, volatility);
    result.confidence = this.calculateStopLossConfidence(result, technicalData);

    return result;
  }

  // 获取波动率等级
  getVolatilityLevel(technicalData) {
    if (!technicalData || !technicalData.atr) return 'normal';

    const atrPct = parseFloat(technicalData.atr.percentage);
    if (atrPct > 4) return 'high';
    if (atrPct > 2) return 'medium';
    if (atrPct < 1) return 'low';
    return 'normal';
  }

  // 动态调整止损比例
  getAdjustedStopLossPercent(volatility, marketTrend) {
    let basePercent = this.config.stopLossPercent;

    // 根据波动率调整
    switch (volatility) {
      case 'high':
        basePercent *= 1.5; // 高波动时放宽止损
        break;
      case 'low':
        basePercent *= 0.7; // 低波动时收紧止损
        break;
      case 'medium':
        basePercent *= 1.2;
        break;
    }

    // 根据市场趋势调整
    if (marketTrend === 'bearish') {
      basePercent *= 0.8; // 熊市中收紧止损
    } else if (marketTrend === 'bullish') {
      basePercent *= 1.1; // 牛市中适当放宽
    }

    return Math.min(basePercent, 0.15); // 最大止损15%
  }

  // 动态调整追踪止损比例
  getAdjustedTrailingPercent(volatility, marketTrend) {
    let basePercent = this.config.trailingStopPercent;

    switch (volatility) {
      case 'high':
        basePercent *= 1.8;
        break;
      case 'low':
        basePercent *= 0.6;
        break;
      case 'medium':
        basePercent *= 1.3;
        break;
    }

    return Math.min(basePercent, 0.08); // 最大追踪止损8%
  }

  // 计算技术止损
  calculateTechnicalStopLoss(price, technicalData) {
    let technicalStop = null;

    // 基于布林带的止损
    if (technicalData.bollinger && technicalData.bollinger.lower) {
      technicalStop = technicalData.bollinger.lower;
    }

    // 基于移动平均线的止损
    if (technicalData.ma20 && technicalData.ma20 < price) {
      const ma20Stop = technicalData.ma20 * 0.98; // MA20下方2%
      if (!technicalStop || ma20Stop > technicalStop) {
        technicalStop = ma20Stop;
      }
    }

    // 基于支撑位的止损
    if (technicalData.supportLevels && technicalData.supportLevels.length > 0) {
      const nearestSupport = technicalData.supportLevels
        .filter(level => level < price)
        .sort((a, b) => b - a)[0];

      if (nearestSupport) {
        const supportStop = nearestSupport * 0.99; // 支撑位下方1%
        if (!technicalStop || supportStop > technicalStop) {
          technicalStop = supportStop;
        }
      }
    }

    return technicalStop;
  }

  // 获取调整后的ATR倍数
  getAdjustedATRMultiplier(volatility) {
    switch (volatility) {
      case 'high': return this.config.atrMultiplier * 1.5;
      case 'low': return this.config.atrMultiplier * 0.8;
      case 'medium': return this.config.atrMultiplier * 1.2;
      default: return this.config.atrMultiplier;
    }
  }

  // 计算波动率调整止损
  calculateVolatilityAdjustedStopLoss(price, volatility) {
    const basePercent = 0.05; // 基础5%止损

    const multiplier = {
      'low': 0.6,
      'normal': 1.0,
      'medium': 1.3,
      'high': 1.8
    }[volatility] || 1.0;

    return price * (1 - basePercent * multiplier);
  }

  // 选择推荐止损价格
  selectRecommendedStopLoss(stopLossResults, volatility) {
    const validStops = Object.entries(stopLossResults)
      .filter(([key, value]) => key !== 'recommended' && key !== 'confidence' && value !== null)
      .map(([key, value]) => ({ type: key, price: value }))
      .sort((a, b) => b.price - a.price); // 从高到低排序

    if (validStops.length === 0) return null;

    // 根据波动率选择策略
    switch (volatility) {
      case 'high':
        // 高波动时选择较宽松的止损
        return validStops[0].price;
      case 'low':
        // 低波动时选择较严格的止损
        return validStops[validStops.length - 1].price;
      default:
        // 中等波动时选择中位数
        const midIndex = Math.floor(validStops.length / 2);
        return validStops[midIndex].price;
    }
  }

  // 计算止损置信度
  calculateStopLossConfidence(stopLossResults, technicalData) {
    const prices = Object.values(stopLossResults)
      .filter(price => price !== null && typeof price === 'number');

    if (prices.length < 2) return 0.3; // 方法太少，置信度低

    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avgPrice;

    // 变异系数越小，一致性越好
    if (coefficient < 0.02) return 0.9;
    if (coefficient < 0.05) return 0.7;
    if (coefficient < 0.1) return 0.5;
    return 0.3;
  }

  /**
   * 更新动态止损价格
   * @param {Object} position - 持仓对象
   * @param {number} currentPrice - 当前价格
   * @param {Object} technicalData - 技术指标数据
   */
  updateDynamicStopLoss(position, currentPrice, technicalData = {}) {
    // 更新最高/最低价
    position.maxPrice = Math.max(position.maxPrice, currentPrice);
    position.minPrice = Math.min(position.minPrice, currentPrice);

    // 计算追踪止损
    const newTrailingStop = position.maxPrice * (1 - this.config.trailingStopPercent);
    if (newTrailingStop > position.trailingStopLoss) {
      position.trailingStopLoss = newTrailingStop;
      position.stopLossUpdates.push({
        time: Date.now(),
        type: 'trailing',
        price: newTrailingStop,
        currentPrice
      });
    }

    // 更新技术止损
    if (this.config.technicalStopEnabled && technicalData) {
      const dynamicStops = this.calculateDynamicStopLoss(currentPrice, technicalData);

      // 更新技术止损
      if (dynamicStops.technical &&
          (!position.technicalStopLoss || dynamicStops.technical > position.technicalStopLoss)) {
        position.technicalStopLoss = dynamicStops.technical;
        position.stopLossUpdates.push({
          time: Date.now(),
          type: 'technical',
          price: dynamicStops.technical,
          currentPrice
        });
      }

      // 更新ATR止损
      if (dynamicStops.atr &&
          (!position.atrStopLoss || dynamicStops.atr > position.atrStopLoss)) {
        position.atrStopLoss = dynamicStops.atr;
        position.stopLossUpdates.push({
          time: Date.now(),
          type: 'atr',
          price: dynamicStops.atr,
          currentPrice
        });
      }
    }

    // 确定当前最佳止损价格
    const newStopLoss = Math.max(
      position.fixedStopLoss || 0,
      position.trailingStopLoss || 0,
      position.technicalStopLoss || 0,
      position.atrStopLoss || 0
    );

    // 如果有更好的止损价格，更新当前止损
    if (newStopLoss > position.currentStopLoss) {
      const oldType = position.stopLossType;

      // 确定新的止损类型
      if (newStopLoss === position.trailingStopLoss) {
        position.stopLossType = 'trailing';
      } else if (newStopLoss === position.technicalStopLoss) {
        position.stopLossType = 'technical';
      } else if (newStopLoss === position.atrStopLoss) {
        position.stopLossType = 'atr';
      } else {
        position.stopLossType = 'fixed';
      }

      position.currentStopLoss = newStopLoss;

      // 记录止损更新
      this.logRiskEvent('STOP_LOSS_UPDATED', {
        symbol: position.symbol,
        oldStopLoss: position.currentStopLoss,
        newStopLoss,
        oldType,
        newType: position.stopLossType,
        currentPrice
      });
    }
  }

  // 更新仓位价格和止损（增强版）
  updatePosition(symbol, currentPrice, technicalData = {}) {
    const position = this.positions.get(symbol);
    if (!position) return;

    // 更新动态止损
    this.updateDynamicStopLoss(position, currentPrice, technicalData);
  }
  
  /**
   * 检查止损止盈（增强版）
   * @param {string} symbol - 股票代码
   * @param {number} currentPrice - 当前价格
   * @param {Object} technicalData - 技术指标数据
   * @returns {Object|null} 交易信号
   */
  checkStopLossAndTakeProfit(symbol, currentPrice, technicalData = {}) {
    const position = this.positions.get(symbol);
    if (!position) return null;

    // 先更新动态止损
    this.updateDynamicStopLoss(position, currentPrice, technicalData);

    // 检查止损
    if (currentPrice <= position.currentStopLoss) {
      return {
        action: 'STOP_LOSS',
        price: currentPrice,
        stopLossType: position.stopLossType,
        reason: `价格${currentPrice.toFixed(4)}触发${position.stopLossType}止损线${position.currentStopLoss.toFixed(4)}`,
        details: {
          entryPrice: position.entryPrice,
          maxPrice: position.maxPrice,
          stopLossPrice: position.currentStopLoss,
          pnlPercent: ((currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        }
      };
    }

    // 检查时间止损
    if (Date.now() > position.timeStopLoss) {
      return {
        action: 'STOP_LOSS',
        price: currentPrice,
        stopLossType: 'time',
        reason: `持仓时间超过${this.config.timeStopHours}小时，触发时间止损`,
        details: {
          entryPrice: position.entryPrice,
          holdingHours: ((Date.now() - position.entryTime) / (1000 * 60 * 60)).toFixed(1),
          pnlPercent: ((currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        }
      };
    }

    // 检查止盈
    if (currentPrice >= position.takeProfit) {
      return {
        action: 'TAKE_PROFIT',
        price: currentPrice,
        reason: `价格${currentPrice.toFixed(4)}触发止盈线${position.takeProfit.toFixed(4)}`,
        details: {
          entryPrice: position.entryPrice,
          maxPrice: position.maxPrice,
          takeProfitPrice: position.takeProfit,
          pnlPercent: ((currentPrice - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        }
      };
    }

    return null;
  }
  
  /**
   * 获取持仓的风险状态
   * @param {string} symbol - 股票代码
   * @param {number} currentPrice - 当前价格
   * @returns {Object} 风险状态信息
   */
  getPositionRiskStatus(symbol, currentPrice) {
    const position = this.positions.get(symbol);
    if (!position) return null;

    const unrealizedPnl = (currentPrice - position.entryPrice) / position.entryPrice;
    const maxDrawdown = (position.maxPrice - currentPrice) / position.maxPrice;
    const stopLossDistance = (currentPrice - position.currentStopLoss) / currentPrice;
    const takeProfitDistance = (position.takeProfit - currentPrice) / currentPrice;

    return {
      symbol,
      currentPrice,
      entryPrice: position.entryPrice,
      unrealizedPnl: (unrealizedPnl * 100).toFixed(2) + '%',
      maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
      stopLossDistance: (stopLossDistance * 100).toFixed(2) + '%',
      takeProfitDistance: (takeProfitDistance * 100).toFixed(2) + '%',
      stopLossType: position.stopLossType,
      currentStopLoss: position.currentStopLoss,
      riskLevel: this.calculateRiskLevel(unrealizedPnl, maxDrawdown, stopLossDistance),
      holdingTime: this.formatHoldingTime(Date.now() - position.entryTime)
    };
  }

  /**
   * 计算风险等级
   * @param {number} unrealizedPnl - 未实现盈亏
   * @param {number} maxDrawdown - 最大回撤
   * @param {number} stopLossDistance - 止损距离
   * @returns {string} 风险等级
   */
  calculateRiskLevel(unrealizedPnl, maxDrawdown, stopLossDistance) {
    if (stopLossDistance < 0.01) return '极高风险';
    if (stopLossDistance < 0.02) return '高风险';
    if (maxDrawdown > 0.05) return '中高风险';
    if (unrealizedPnl < -0.03) return '中等风险';
    return '低风险';
  }

  /**
   * 格式化持仓时间
   * @param {number} milliseconds - 毫秒数
   * @returns {string} 格式化的时间
   */
  formatHoldingTime(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}小时${minutes}分钟`;
  }

  // 获取总仓位大小
  getTotalPositionSize() {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.size;
    }
    return total;
  }
  
  // 获取当前风险暴露
  getRiskExposure() {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, pos) => sum + pos.size, 0);
    
    return {
      totalPositions: positions.length,
      totalValue,
      availableCapacity: this.config.maxTotalPosition - totalValue,
      dailyTradesUsed: this.dailyTrades,
      dailyTradesRemaining: this.config.maxDailyTrades - this.dailyTrades
    };
  }
  
  // 更新风险指标
  updateRiskMetrics() {
    if (this.tradeHistory.length === 0) return;
    
    const returns = this.tradeHistory.map(trade => trade.pnl);
    const winningTrades = returns.filter(r => r > 0);
    
    this.riskMetrics.totalReturn = returns.reduce((sum, r) => sum + r, 0);
    this.riskMetrics.winRate = winningTrades.length / returns.length;
    
    // 计算最大回撤
    let peak = 0;
    let maxDD = 0;
    let cumReturn = 0;
    
    for (const ret of returns) {
      cumReturn += ret;
      peak = Math.max(peak, cumReturn);
      const drawdown = (peak - cumReturn) / (1 + peak);
      maxDD = Math.max(maxDD, drawdown);
    }
    
    this.riskMetrics.maxDrawdown = maxDD;
    
    // 计算夏普比率
    if (returns.length > 1) {
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      this.riskMetrics.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
    }
  }
  
  // 记录风险事件
  logRiskEvent(type, data) {
    const event = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      type,
      data
    };
    
    fs.appendFileSync('risk_events.log', JSON.stringify(event) + '\n');
  }
  
  // 生成风险报告
  generateRiskReport() {
    const exposure = this.getRiskExposure();
    
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      riskMetrics: this.riskMetrics,
      exposure,
      positions: Array.from(this.positions.entries()).map(([symbol, pos]) => ({
        symbol,
        size: pos.size,
        entryPrice: pos.entryPrice,
        currentPnL: 'N/A', // 需要当前价格计算
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit
      })),
      recentTrades: this.tradeHistory.slice(-10)
    };
  }
  
  // 检查系统性风险
  checkSystemicRisk() {
    const warnings = [];

    if (this.riskMetrics.maxDrawdown > this.config.maxDrawdown) {
      warnings.push('最大回撤超过阈值');
    }

    if (this.getTotalPositionSize() > this.config.maxTotalPosition * 0.9) {
      warnings.push('总仓位接近上限');
    }

    if (this.dailyTrades > this.config.maxDailyTrades * 0.8) {
      warnings.push('日交易次数接近上限');
    }

    return warnings;
  }

  /**
   * 获取风险指标
   * @returns {Object} 风险指标统计
   */
  getRiskMetrics() {
    this.updateRiskMetrics();
    return {
      ...this.riskMetrics,
      totalTrades: this.tradeHistory.length,
      currentPositions: this.positions.size,
      dailyTrades: this.dailyTrades,
      totalPositionSize: this.getTotalPositionSize()
    };
  }
}

module.exports = { RiskManager };
