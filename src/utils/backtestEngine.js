// 回测引擎模块
const decimal = require('decimal.js');
const dayjs = require('dayjs');
const fs = require('fs');

class BacktestEngine {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000000, // 初始资金100万
      commission: config.commission || 0.0003,          // 手续费万分之3
      slippage: config.slippage || 0.001,              // 滑点千分之1
      benchmark: config.benchmark || 'sh000300',        // 基准指数
      ...config
    };
    
    this.portfolio = {
      cash: this.config.initialCapital,
      positions: new Map(),
      totalValue: this.config.initialCapital,
      history: []
    };
    
    this.trades = [];
    this.metrics = {};
  }
  
  /**
   * 执行回测
   * @param {Array} strategies - 策略信号数组
   * @param {Object} priceData - 价格数据
   */
  runBacktest(strategies, priceData) {
    console.log('🔄 开始执行回测...');
    
    for (const strategy of strategies) {
      this.processStrategy(strategy, priceData);
    }
    
    this.calculateMetrics();
    this.generateReport();
    
    return this.getResults();
  }
  
  /**
   * 处理策略信号
   * @param {Object} strategy - 策略数据
   * @param {Object} priceData - 价格数据
   */
  processStrategy(strategy, priceData) {
    const { date, recommendation, action } = strategy;
    
    if (!recommendation || recommendation === '无') return;
    
    const price = priceData[recommendation]?.[date];
    if (!price) return;
    
    // 根据信号执行交易
    if (action.includes('买入')) {
      this.executeBuy(recommendation, price, date);
    } else if (action.includes('卖出')) {
      this.executeSell(recommendation, price, date);
    }
    
    // 更新投资组合价值
    this.updatePortfolioValue(date, priceData);
  }
  
  /**
   * 执行买入操作
   * @param {string} symbol - 股票代码
   * @param {number} price - 价格
   * @param {string} date - 日期
   */
  executeBuy(symbol, price, date) {
    // 计算可买入金额（使用30%的现金）
    const buyAmount = this.portfolio.cash * 0.3;
    const adjustedPrice = price * (1 + this.config.slippage); // 考虑滑点
    const commission = buyAmount * this.config.commission;
    const totalCost = buyAmount + commission;
    
    if (totalCost > this.portfolio.cash) return;
    
    const shares = Math.floor(buyAmount / adjustedPrice);
    const actualCost = shares * adjustedPrice + commission;
    
    // 更新持仓
    if (this.portfolio.positions.has(symbol)) {
      const position = this.portfolio.positions.get(symbol);
      const newShares = position.shares + shares;
      const newCost = position.totalCost + actualCost;
      
      this.portfolio.positions.set(symbol, {
        shares: newShares,
        avgPrice: newCost / newShares,
        totalCost: newCost,
        currentPrice: adjustedPrice
      });
    } else {
      this.portfolio.positions.set(symbol, {
        shares: shares,
        avgPrice: adjustedPrice,
        totalCost: actualCost,
        currentPrice: adjustedPrice
      });
    }
    
    this.portfolio.cash -= actualCost;
    
    // 记录交易
    this.trades.push({
      date,
      symbol,
      action: 'BUY',
      shares,
      price: adjustedPrice,
      amount: actualCost,
      commission
    });
  }
  
  /**
   * 执行卖出操作
   * @param {string} symbol - 股票代码
   * @param {number} price - 价格
   * @param {string} date - 日期
   */
  executeSell(symbol, price, date) {
    if (!this.portfolio.positions.has(symbol)) return;
    
    const position = this.portfolio.positions.get(symbol);
    const adjustedPrice = price * (1 - this.config.slippage); // 考虑滑点
    const sellAmount = position.shares * adjustedPrice;
    const commission = sellAmount * this.config.commission;
    const netAmount = sellAmount - commission;
    
    // 更新现金
    this.portfolio.cash += netAmount;
    
    // 移除持仓
    this.portfolio.positions.delete(symbol);
    
    // 记录交易
    this.trades.push({
      date,
      symbol,
      action: 'SELL',
      shares: position.shares,
      price: adjustedPrice,
      amount: sellAmount,
      commission,
      profit: netAmount - position.totalCost
    });
  }
  
  /**
   * 更新投资组合价值
   * @param {string} date - 日期
   * @param {Object} priceData - 价格数据
   */
  updatePortfolioValue(date, priceData) {
    let totalValue = this.portfolio.cash;
    
    // 计算持仓市值
    for (const [symbol, position] of this.portfolio.positions) {
      const currentPrice = priceData[symbol]?.[date] || position.currentPrice;
      position.currentPrice = currentPrice;
      totalValue += position.shares * currentPrice;
    }
    
    this.portfolio.totalValue = totalValue;
    
    // 记录历史
    this.portfolio.history.push({
      date,
      totalValue,
      cash: this.portfolio.cash,
      positions: new Map(this.portfolio.positions)
    });
  }
  
  /**
   * 计算回测指标
   */
  calculateMetrics() {
    const history = this.portfolio.history;
    if (history.length < 2) return;
    
    // 计算收益率序列
    const returns = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i].totalValue - history[i-1].totalValue) / history[i-1].totalValue;
      returns.push(ret);
    }
    
    // 总收益率
    const totalReturn = (this.portfolio.totalValue - this.config.initialCapital) / this.config.initialCapital;
    
    // 年化收益率
    const days = dayjs(history[history.length-1].date).diff(dayjs(history[0].date), 'day');
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / days) - 1;
    
    // 波动率
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252); // 年化波动率
    
    // 夏普比率（假设无风险利率为3%）
    const riskFreeRate = 0.03;
    const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;
    
    // 最大回撤
    const maxDrawdown = this.calculateMaxDrawdown(history);
    
    // 胜率
    const profitableTrades = this.trades.filter(trade => trade.profit && trade.profit > 0).length;
    const totalTrades = this.trades.filter(trade => trade.action === 'SELL').length;
    const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;
    
    // Sortino比率
    const downReturns = returns.filter(ret => ret < 0);
    const downVolatility = downReturns.length > 0 ? 
      Math.sqrt(downReturns.reduce((sum, ret) => sum + ret * ret, 0) / downReturns.length * 252) : 0;
    const sortinoRatio = downVolatility > 0 ? (annualizedReturn - riskFreeRate) / downVolatility : 0;
    
    this.metrics = {
      totalReturn: totalReturn * 100,
      annualizedReturn: annualizedReturn * 100,
      volatility: volatility * 100,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      winRate: winRate * 100,
      totalTrades,
      profitableTrades,
      avgWin: this.calculateAvgWin(),
      avgLoss: this.calculateAvgLoss(),
      profitFactor: this.calculateProfitFactor(),
      calmarRatio: annualizedReturn / Math.abs(maxDrawdown)
    };
  }
  
  /**
   * 计算最大回撤
   * @param {Array} history - 历史数据
   */
  calculateMaxDrawdown(history) {
    let peak = history[0].totalValue;
    let maxDrawdown = 0;
    
    for (const record of history) {
      if (record.totalValue > peak) {
        peak = record.totalValue;
      }
      
      const drawdown = (peak - record.totalValue) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }
  
  /**
   * 计算平均盈利
   */
  calculateAvgWin() {
    const wins = this.trades.filter(trade => trade.profit && trade.profit > 0);
    return wins.length > 0 ? wins.reduce((sum, trade) => sum + trade.profit, 0) / wins.length : 0;
  }
  
  /**
   * 计算平均亏损
   */
  calculateAvgLoss() {
    const losses = this.trades.filter(trade => trade.profit && trade.profit < 0);
    return losses.length > 0 ? Math.abs(losses.reduce((sum, trade) => sum + trade.profit, 0) / losses.length) : 0;
  }
  
  /**
   * 计算盈亏比
   */
  calculateProfitFactor() {
    const totalProfit = this.trades.filter(trade => trade.profit && trade.profit > 0)
      .reduce((sum, trade) => sum + trade.profit, 0);
    const totalLoss = Math.abs(this.trades.filter(trade => trade.profit && trade.profit < 0)
      .reduce((sum, trade) => sum + trade.profit, 0));
    
    return totalLoss > 0 ? totalProfit / totalLoss : 0;
  }
  
  /**
   * 生成回测报告
   */
  generateReport() {
    const report = {
      summary: this.metrics,
      portfolio: {
        finalValue: this.portfolio.totalValue,
        cash: this.portfolio.cash,
        positions: Array.from(this.portfolio.positions.entries()).map(([symbol, pos]) => ({
          symbol,
          shares: pos.shares,
          avgPrice: pos.avgPrice,
          currentPrice: pos.currentPrice,
          value: pos.shares * pos.currentPrice,
          profit: (pos.currentPrice - pos.avgPrice) * pos.shares
        }))
      },
      trades: this.trades,
      config: this.config
    };
    
    // 保存报告
    fs.writeFileSync('./data/reports/backtest_report.json', JSON.stringify(report, null, 2));
    
    return report;
  }
  
  /**
   * 获取回测结果
   */
  getResults() {
    return {
      metrics: this.metrics,
      portfolio: this.portfolio,
      trades: this.trades
    };
  }
}

module.exports = BacktestEngine;
