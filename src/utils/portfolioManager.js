// 📊 持仓管理器 - 管理实际ETF持仓
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

class PortfolioManager {
  constructor(configPath = './config/my-positions.json') {
    this.configPath = configPath;
    this.portfolio = null;
    this.loadPortfolio();
  }

  /**
   * 加载持仓配置
   */
  loadPortfolio() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.portfolio = JSON.parse(data);
        console.log(`✅ 持仓配置加载成功: ${this.portfolio.positions.length}个持仓`);
      } else {
        console.log('⚠️ 持仓配置文件不存在，创建默认配置');
        this.createDefaultPortfolio();
      }
    } catch (error) {
      console.error('❌ 持仓配置加载失败:', error.message);
      this.createDefaultPortfolio();
    }
  }

  /**
   * 保存持仓配置
   */
  savePortfolio() {
    try {
      // 更新元数据
      this.portfolio.meta.lastUpdated = new Date().toISOString();
      this.updatePortfolioMetrics();
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.portfolio, null, 2));
      console.log('✅ 持仓配置保存成功');
    } catch (error) {
      console.error('❌ 持仓配置保存失败:', error.message);
    }
  }

  /**
   * 创建默认持仓配置
   */
  createDefaultPortfolio() {
    this.portfolio = {
      meta: {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        description: "个人ETF持仓配置文件",
        totalInvestment: 0,
        totalCurrentValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0
      },
      globalSettings: {
        defaultStopLoss: {
          enabled: true,
          fixedPercent: 0.05,
          trailingPercent: 0.03,
          technicalEnabled: true,
          atrMultiplier: 2.0,
          timeStopHours: 72
        },
        defaultTakeProfit: {
          enabled: true,
          targetPercent: 0.15,
          partialTakeProfit: true,
          partialPercent: 0.5,
          partialTrigger: 0.08
        }
      },
      positions: [],
      watchlist: [],
      history: []
    };
    this.savePortfolio();
  }

  /**
   * 更新持仓组合指标
   */
  updatePortfolioMetrics() {
    let totalInvestment = 0;
    let totalCurrentValue = 0;

    this.portfolio.positions.forEach(pos => {
      if (pos.status === 'active') {
        const investment = pos.quantity * pos.costPrice;
        const currentValue = pos.quantity * pos.currentPrice;
        
        totalInvestment += investment;
        totalCurrentValue += currentValue;
      }
    });

    this.portfolio.meta.totalInvestment = totalInvestment;
    this.portfolio.meta.totalCurrentValue = totalCurrentValue;
    this.portfolio.meta.totalPnL = totalCurrentValue - totalInvestment;
    this.portfolio.meta.totalPnLPercent = totalInvestment > 0 ? 
      ((totalCurrentValue - totalInvestment) / totalInvestment * 100) : 0;
  }

  /**
   * 获取所有活跃持仓
   */
  getActivePositions() {
    return this.portfolio.positions.filter(pos => pos.status === 'active');
  }

  /**
   * 根据代码获取持仓
   */
  getPositionBySymbol(symbol) {
    return this.portfolio.positions.find(pos => pos.symbol === symbol);
  }

  /**
   * 更新持仓价格
   */
  updatePositionPrice(symbol, newPrice, technicalData = {}) {
    const position = this.getPositionBySymbol(symbol);
    if (!position) {
      console.log(`⚠️ 未找到持仓: ${symbol}`);
      return null;
    }

    const oldPrice = position.currentPrice;
    position.currentPrice = newPrice;

    // 更新动态止损
    this.updateDynamicStopLoss(position, technicalData);

    // 记录历史
    this.addHistory({
      action: 'update_price',
      symbol: symbol,
      oldPrice: oldPrice,
      newPrice: newPrice,
      note: '价格更新'
    });

    console.log(`📊 ${position.name} 价格更新: ${oldPrice} → ${newPrice}`);
    return position;
  }

  /**
   * 更新动态止损
   */
  updateDynamicStopLoss(position, technicalData = {}) {
    if (!position.stopLoss.enabled) return;

    const currentPrice = position.currentPrice;
    const costPrice = position.costPrice;
    
    // 计算各种止损价格
    const fixedStopLoss = costPrice * (1 - position.stopLoss.fixedPercent);
    const trailingStopLoss = currentPrice * (1 - position.stopLoss.trailingPercent);
    
    let technicalStopLoss = null;
    let atrStopLoss = null;

    // 技术止损
    if (position.stopLoss.technicalEnabled && technicalData.bollinger) {
      technicalStopLoss = technicalData.bollinger.lower;
    }

    // ATR止损
    if (technicalData.atr && technicalData.atr.value) {
      const atrValue = parseFloat(technicalData.atr.value);
      atrStopLoss = currentPrice - (atrValue * position.stopLoss.atrMultiplier);
    }

    // 选择最优止损价格
    const stopLossPrices = [fixedStopLoss, trailingStopLoss, technicalStopLoss, atrStopLoss]
      .filter(price => price !== null && price > 0);
    
    if (stopLossPrices.length > 0) {
      const newStopPrice = Math.max(...stopLossPrices);
      
      // 只有当新止损价格更高时才更新（避免止损价格下降）
      if (newStopPrice > position.stopLoss.currentStopPrice) {
        const oldStopPrice = position.stopLoss.currentStopPrice;
        position.stopLoss.currentStopPrice = newStopPrice;
        
        // 确定止损类型
        if (newStopPrice === trailingStopLoss) {
          position.stopLoss.stopLossType = 'trailing';
        } else if (newStopPrice === technicalStopLoss) {
          position.stopLoss.stopLossType = 'technical';
        } else if (newStopPrice === atrStopLoss) {
          position.stopLoss.stopLossType = 'atr';
        } else {
          position.stopLoss.stopLossType = 'fixed';
        }

        console.log(`🛡️ ${position.name} 止损更新: ${oldStopPrice?.toFixed(4)} → ${newStopPrice.toFixed(4)} (${position.stopLoss.stopLossType})`);
      }
    }
  }

  /**
   * 检查止损止盈信号
   */
  checkStopLossAndTakeProfit(symbol, technicalData = {}) {
    const position = this.getPositionBySymbol(symbol);
    if (!position || position.status !== 'active') return null;

    const currentPrice = position.currentPrice;
    const signals = [];

    // 检查止损
    if (position.stopLoss.enabled && currentPrice <= position.stopLoss.currentStopPrice) {
      const pnlPercent = ((currentPrice - position.costPrice) / position.costPrice * 100).toFixed(2);
      signals.push({
        type: 'STOP_LOSS',
        symbol: symbol,
        name: position.name,
        currentPrice: currentPrice,
        triggerPrice: position.stopLoss.currentStopPrice,
        stopLossType: position.stopLoss.stopLossType,
        pnlPercent: pnlPercent,
        message: `${position.name} 触发${position.stopLoss.stopLossType}止损 (${pnlPercent}%)`,
        urgency: 'high'
      });
    }

    // 检查止盈
    if (position.takeProfit.enabled && currentPrice >= position.takeProfit.targetPrice) {
      const pnlPercent = ((currentPrice - position.costPrice) / position.costPrice * 100).toFixed(2);
      signals.push({
        type: 'TAKE_PROFIT',
        symbol: symbol,
        name: position.name,
        currentPrice: currentPrice,
        triggerPrice: position.takeProfit.targetPrice,
        pnlPercent: pnlPercent,
        message: `${position.name} 达到止盈目标 (+${pnlPercent}%)`,
        urgency: 'medium'
      });
    }

    // 检查部分止盈
    if (position.takeProfit.enabled && position.takeProfit.partialTakeProfit && 
        currentPrice >= position.takeProfit.partialTriggerPrice) {
      const pnlPercent = ((currentPrice - position.costPrice) / position.costPrice * 100).toFixed(2);
      signals.push({
        type: 'PARTIAL_TAKE_PROFIT',
        symbol: symbol,
        name: position.name,
        currentPrice: currentPrice,
        triggerPrice: position.takeProfit.partialTriggerPrice,
        partialPercent: position.takeProfit.partialPercent,
        pnlPercent: pnlPercent,
        message: `${position.name} 可考虑部分止盈${(position.takeProfit.partialPercent*100).toFixed(0)}% (+${pnlPercent}%)`,
        urgency: 'low'
      });
    }

    return signals.length > 0 ? signals : null;
  }

  /**
   * 获取持仓风险状态
   */
  getPositionRiskStatus(symbol) {
    const position = this.getPositionBySymbol(symbol);
    if (!position || position.status !== 'active') return null;

    const currentPrice = position.currentPrice;
    const costPrice = position.costPrice;
    const unrealizedPnl = (currentPrice - costPrice) / costPrice;
    const stopLossDistance = (currentPrice - position.stopLoss.currentStopPrice) / currentPrice;
    const takeProfitDistance = (position.takeProfit.targetPrice - currentPrice) / currentPrice;

    return {
      symbol: symbol,
      name: position.name,
      currentPrice: currentPrice,
      costPrice: costPrice,
      quantity: position.quantity,
      investment: (costPrice * position.quantity).toFixed(2),
      currentValue: (currentPrice * position.quantity).toFixed(2),
      unrealizedPnl: (unrealizedPnl * 100).toFixed(2) + '%',
      unrealizedPnlAmount: ((currentPrice - costPrice) * position.quantity).toFixed(2),
      stopLossDistance: (stopLossDistance * 100).toFixed(2) + '%',
      takeProfitDistance: (takeProfitDistance * 100).toFixed(2) + '%',
      stopLossPrice: position.stopLoss.currentStopPrice,
      stopLossType: position.stopLoss.stopLossType,
      takeProfitPrice: position.takeProfit.targetPrice,
      riskLevel: this.calculatePositionRiskLevel(unrealizedPnl, stopLossDistance),
      targetWeight: position.targetWeight,
      currentWeight: this.calculateCurrentWeight(position),
      category: position.category,
      tags: position.tags
    };
  }

  /**
   * 计算持仓风险等级
   */
  calculatePositionRiskLevel(unrealizedPnl, stopLossDistance) {
    if (stopLossDistance < 0.01) return '极高风险';
    if (stopLossDistance < 0.02) return '高风险';
    if (unrealizedPnl < -0.05) return '中高风险';
    if (unrealizedPnl < -0.02) return '中等风险';
    return '低风险';
  }

  /**
   * 计算当前权重
   */
  calculateCurrentWeight(position) {
    const totalValue = this.portfolio.meta.totalCurrentValue;
    if (totalValue === 0) return 0;
    
    const positionValue = position.currentPrice * position.quantity;
    return (positionValue / totalValue);
  }

  /**
   * 添加历史记录
   */
  addHistory(record) {
    record.date = dayjs().format('YYYY-MM-DD HH:mm:ss');
    this.portfolio.history.unshift(record);
    
    // 保留最近100条记录
    if (this.portfolio.history.length > 100) {
      this.portfolio.history = this.portfolio.history.slice(0, 100);
    }
  }

  /**
   * 获取持仓概览
   */
  getPortfolioSummary() {
    this.updatePortfolioMetrics();
    
    const activePositions = this.getActivePositions();
    const riskLevels = {};
    const categories = {};
    
    activePositions.forEach(pos => {
      const riskStatus = this.getPositionRiskStatus(pos.symbol);
      
      // 统计风险等级
      riskLevels[riskStatus.riskLevel] = (riskLevels[riskStatus.riskLevel] || 0) + 1;
      
      // 统计类别
      categories[pos.category] = (categories[pos.category] || 0) + 1;
    });

    return {
      meta: this.portfolio.meta,
      summary: {
        totalPositions: activePositions.length,
        totalInvestment: this.portfolio.meta.totalInvestment.toFixed(2),
        totalCurrentValue: this.portfolio.meta.totalCurrentValue.toFixed(2),
        totalPnL: this.portfolio.meta.totalPnL.toFixed(2),
        totalPnLPercent: this.portfolio.meta.totalPnLPercent.toFixed(2) + '%',
        riskDistribution: riskLevels,
        categoryDistribution: categories
      },
      positions: activePositions.map(pos => this.getPositionRiskStatus(pos.symbol)),
      watchlist: this.portfolio.watchlist
    };
  }
}

module.exports = PortfolioManager;
