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
      ...config
    };
    
    this.dailyTrades = 0;
    this.lastTradeDate = null;
    this.positions = new Map();
    this.tradeHistory = [];
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
  
  // 开仓
  openPosition(symbol, size, price, signal) {
    if (!this.canOpenPosition(symbol, size, price, '1.0%')) {
      return false;
    }
    
    const position = {
      symbol,
      size,
      entryPrice: price,
      entryTime: Date.now(),
      signal,
      stopLoss: price * (1 - this.config.stopLossPercent),
      takeProfit: price * (1 + this.config.takeProfitPercent),
      maxPrice: price,
      minPrice: price
    };
    
    this.positions.set(symbol, position);
    this.dailyTrades++;
    
    this.logRiskEvent('POSITION_OPENED', position);
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
  
  // 更新仓位价格
  updatePosition(symbol, currentPrice) {
    const position = this.positions.get(symbol);
    if (!position) return;
    
    position.maxPrice = Math.max(position.maxPrice, currentPrice);
    position.minPrice = Math.min(position.minPrice, currentPrice);
    
    // 动态调整止损线（追踪止损）
    if (currentPrice > position.entryPrice) {
      const trailingStopLoss = position.maxPrice * (1 - this.config.stopLossPercent);
      position.stopLoss = Math.max(position.stopLoss, trailingStopLoss);
    }
  }
  
  // 检查止损止盈
  checkStopLossAndTakeProfit(symbol, currentPrice) {
    const position = this.positions.get(symbol);
    if (!position) return null;
    
    if (currentPrice <= position.stopLoss) {
      return { action: 'STOP_LOSS', price: currentPrice };
    }
    
    if (currentPrice >= position.takeProfit) {
      return { action: 'TAKE_PROFIT', price: currentPrice };
    }
    
    return null;
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
}

module.exports = { RiskManager };
