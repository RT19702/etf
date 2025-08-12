// 🧠 智能持仓管理器 - 简化配置，自动计算技术参数
const fs = require('fs');
const dayjs = require('dayjs');
const TechnicalIndicators = require('./technicalIndicators');

class SmartPortfolioManager {
  constructor(configPath = './config/my-etf-positions.json') {
    this.configPath = configPath;
    this.positions = [];
    this.loadPortfolio();
  }

  /**
   * 加载极简持仓配置
   */
  loadPortfolio() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.positions = JSON.parse(data);
        console.log(`✅ 极简持仓配置加载成功: ${this.positions.length}个持仓`);
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
   * 创建默认配置
   */
  createDefaultPortfolio() {
    this.positions = [
      {
        "symbol": "sh512800",
        "quantity": 600,
        "costPrice": 0.885,
        "purchaseDate": "2025-07-15"
      }
    ];
    this.savePortfolio();
  }

  /**
   * 保存配置
   */
  savePortfolio() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.positions, null, 2));
      console.log('✅ 极简持仓配置保存成功');
    } catch (error) {
      console.error('❌ 持仓配置保存失败:', error.message);
    }
  }

  /**
   * 智能计算止损止盈位
   * @param {number} costPrice - 成本价
   * @param {number} currentPrice - 当前价格
   * @param {Object} technicalData - 技术指标数据
   * @param {string} riskLevel - 风险等级
   */
  calculateSmartStopLossAndTakeProfit(costPrice, currentPrice, technicalData = {}, riskLevel = 'medium') {
    const result = {
      stopLoss: {
        fixed: null,
        trailing: null,
        technical: null,
        atr: null,
        recommended: null,
        type: 'fixed'
      },
      takeProfit: {
        target: null,
        partial: null,
        resistance: null,
        recommended: null
      },
      explanation: {
        stopLossReason: '',
        takeProfitReason: '',
        riskAssessment: ''
      }
    };

    // 根据风险等级设置基础参数
    const riskParams = this.getRiskParameters(riskLevel);
    
    // 1. 计算固定止损（基于成本价）
    result.stopLoss.fixed = costPrice * (1 - riskParams.stopLossPercent);
    
    // 2. 计算追踪止损（基于当前价格）
    result.stopLoss.trailing = currentPrice * (1 - riskParams.trailingPercent);
    
    // 3. 计算技术止损（基于布林带下轨或支撑位）
    if (technicalData.bollinger && technicalData.bollinger.lower) {
      result.stopLoss.technical = technicalData.bollinger.lower;
    }
    
    // 4. 计算ATR止损
    if (technicalData.atr && technicalData.atr.value) {
      const atrValue = parseFloat(technicalData.atr.value);
      result.stopLoss.atr = currentPrice - (atrValue * riskParams.atrMultiplier);
    }
    
    // 5. 选择最优止损价格
    const stopLossPrices = [
      { price: result.stopLoss.fixed, type: 'fixed', reason: `基于成本价${costPrice}的${(riskParams.stopLossPercent*100).toFixed(1)}%固定止损` },
      { price: result.stopLoss.trailing, type: 'trailing', reason: `基于当前价${currentPrice}的${(riskParams.trailingPercent*100).toFixed(1)}%追踪止损` },
      { price: result.stopLoss.technical, type: 'technical', reason: '基于布林带下轨的技术止损' },
      { price: result.stopLoss.atr, type: 'atr', reason: `基于ATR的${riskParams.atrMultiplier}倍动态止损` }
    ].filter(item => item.price && item.price > 0);
    
    if (stopLossPrices.length > 0) {
      // 选择最高的止损价格（最保守）
      const bestStopLoss = stopLossPrices.reduce((best, current) => 
        current.price > best.price ? current : best
      );
      result.stopLoss.recommended = bestStopLoss.price;
      result.stopLoss.type = bestStopLoss.type;
      result.explanation.stopLossReason = bestStopLoss.reason;
    }
    
    // 6. 计算止盈位
    result.takeProfit.target = costPrice * (1 + riskParams.takeProfitPercent);
    result.takeProfit.partial = costPrice * (1 + riskParams.partialTakeProfitPercent);
    
    // 7. 基于技术阻力位的止盈
    if (technicalData.bollinger && technicalData.bollinger.upper) {
      result.takeProfit.resistance = technicalData.bollinger.upper;
    }
    
    // 8. 选择推荐止盈价格
    const takeProfitPrices = [
      { price: result.takeProfit.target, reason: `基于成本价的${(riskParams.takeProfitPercent*100).toFixed(1)}%目标止盈` },
      { price: result.takeProfit.resistance, reason: '基于布林带上轨的技术阻力位' }
    ].filter(item => item.price && item.price > currentPrice);
    
    if (takeProfitPrices.length > 0) {
      // 选择较低的止盈价格（更现实）
      const bestTakeProfit = takeProfitPrices.reduce((best, current) => 
        current.price < best.price ? current : best
      );
      result.takeProfit.recommended = bestTakeProfit.price;
      result.explanation.takeProfitReason = bestTakeProfit.reason;
    } else {
      result.takeProfit.recommended = result.takeProfit.target;
      result.explanation.takeProfitReason = `基于成本价的${(riskParams.takeProfitPercent*100).toFixed(1)}%目标止盈`;
    }
    
    // 9. 风险评估
    const currentPnL = (currentPrice - costPrice) / costPrice;
    const stopLossDistance = result.stopLoss.recommended ? 
      (currentPrice - result.stopLoss.recommended) / currentPrice : 0;
    
    if (stopLossDistance < 0.02) {
      result.explanation.riskAssessment = '高风险：当前价格接近止损位';
    } else if (currentPnL < -0.05) {
      result.explanation.riskAssessment = '中高风险：当前亏损较大';
    } else if (currentPnL > 0.1) {
      result.explanation.riskAssessment = '低风险：当前盈利较好，建议考虑部分止盈';
    } else {
      result.explanation.riskAssessment = '中等风险：持仓状态正常';
    }
    
    return result;
  }

  /**
   * 根据风险等级获取参数
   */
  getRiskParameters(riskLevel) {
    const params = {
      conservative: {
        stopLossPercent: 0.03,      // 3%止损
        trailingPercent: 0.02,      // 2%追踪止损
        takeProfitPercent: 0.10,    // 10%止盈
        partialTakeProfitPercent: 0.06, // 6%部分止盈
        atrMultiplier: 1.5
      },
      medium: {
        stopLossPercent: 0.05,      // 5%止损
        trailingPercent: 0.03,      // 3%追踪止损
        takeProfitPercent: 0.15,    // 15%止盈
        partialTakeProfitPercent: 0.08, // 8%部分止盈
        atrMultiplier: 2.0
      },
      aggressive: {
        stopLossPercent: 0.08,      // 8%止损
        trailingPercent: 0.05,      // 5%追踪止损
        takeProfitPercent: 0.25,    // 25%止盈
        partialTakeProfitPercent: 0.12, // 12%部分止盈
        atrMultiplier: 2.5
      }
    };
    
    return params[riskLevel] || params.medium;
  }

  /**
   * 自动识别支撑位和阻力位
   * @param {Array} prices - 价格数组
   * @param {number} currentPrice - 当前价格
   */
  identifySupportResistanceLevels(prices, currentPrice) {
    if (!prices || prices.length < 20) {
      return { supports: [], resistances: [], explanation: '数据不足，无法识别支撑阻力位' };
    }

    const result = {
      supports: [],
      resistances: [],
      explanation: ''
    };

    // 计算移动平均线作为动态支撑阻力
    const ma5 = prices.slice(-5).reduce((sum, p) => sum + p, 0) / 5;
    const ma10 = prices.slice(-10).reduce((sum, p) => sum + p, 0) / 10;
    const ma20 = prices.slice(-20).reduce((sum, p) => sum + p, 0) / 20;

    // 识别支撑位（当前价格下方的重要价位）
    [ma5, ma10, ma20].forEach((ma, index) => {
      if (ma < currentPrice) {
        result.supports.push({
          price: ma,
          type: `MA${[5, 10, 20][index]}`,
          strength: index === 0 ? 'weak' : index === 1 ? 'medium' : 'strong',
          distance: ((currentPrice - ma) / currentPrice * 100).toFixed(2) + '%'
        });
      }
    });

    // 识别阻力位（当前价格上方的重要价位）
    [ma5, ma10, ma20].forEach((ma, index) => {
      if (ma > currentPrice) {
        result.resistances.push({
          price: ma,
          type: `MA${[5, 10, 20][index]}`,
          strength: index === 0 ? 'weak' : index === 1 ? 'medium' : 'strong',
          distance: ((ma - currentPrice) / currentPrice * 100).toFixed(2) + '%'
        });
      }
    });

    // 基于历史高低点识别关键位置
    const recentHigh = Math.max(...prices.slice(-20));
    const recentLow = Math.min(...prices.slice(-20));

    if (recentHigh > currentPrice) {
      result.resistances.push({
        price: recentHigh,
        type: '近期高点',
        strength: 'strong',
        distance: ((recentHigh - currentPrice) / currentPrice * 100).toFixed(2) + '%'
      });
    }

    if (recentLow < currentPrice) {
      result.supports.push({
        price: recentLow,
        type: '近期低点',
        strength: 'strong',
        distance: ((currentPrice - recentLow) / currentPrice * 100).toFixed(2) + '%'
      });
    }

    // 排序并取最重要的几个
    result.supports.sort((a, b) => b.price - a.price).slice(0, 3);
    result.resistances.sort((a, b) => a.price - b.price).slice(0, 3);

    // 生成解释
    const supportDesc = result.supports.length > 0 ? 
      `主要支撑位: ${result.supports.map(s => `${s.price.toFixed(4)}(${s.type})`).join(', ')}` : '暂无明显支撑位';
    const resistanceDesc = result.resistances.length > 0 ? 
      `主要阻力位: ${result.resistances.map(r => `${r.price.toFixed(4)}(${r.type})`).join(', ')}` : '暂无明显阻力位';
    
    result.explanation = `${supportDesc}; ${resistanceDesc}`;

    return result;
  }

  /**
   * 生成智能价格提醒
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @param {Object} technicalData - 技术数据
   */
  generateSmartAlerts(position, currentPrice, technicalData) {
    const alerts = [];
    const costPrice = position.costPrice;
    
    // 计算智能止损止盈
    const smartLevels = this.calculateSmartStopLossAndTakeProfit(
      costPrice, currentPrice, technicalData, 'medium'
    );

    // 识别支撑阻力位
    const srLevels = technicalData.prices ? 
      this.identifySupportResistanceLevels(technicalData.prices, currentPrice) : 
      { supports: [], resistances: [] };

    // 生成基于技术分析的提醒
    srLevels.supports.forEach(support => {
      alerts.push({
        type: 'support',
        price: support.price,
        message: `${position.name}接近${support.type}支撑位${support.price.toFixed(4)}，可能反弹`,
        priority: support.strength === 'strong' ? 'high' : 'medium',
        technicalBasis: `基于${support.type}的技术分析，该位置历史上多次提供支撑`
      });
    });

    srLevels.resistances.forEach(resistance => {
      alerts.push({
        type: 'resistance',
        price: resistance.price,
        message: `${position.name}接近${resistance.type}阻力位${resistance.price.toFixed(4)}，考虑部分止盈`,
        priority: resistance.strength === 'strong' ? 'high' : 'medium',
        technicalBasis: `基于${resistance.type}的技术分析，该位置可能遇到抛压`
      });
    });

    // 添加止损止盈提醒
    if (smartLevels.stopLoss.recommended) {
      alerts.push({
        type: 'stop_loss',
        price: smartLevels.stopLoss.recommended,
        message: `${position.name}建议止损位${smartLevels.stopLoss.recommended.toFixed(4)}`,
        priority: 'high',
        technicalBasis: smartLevels.explanation.stopLossReason
      });
    }

    if (smartLevels.takeProfit.recommended) {
      alerts.push({
        type: 'take_profit',
        price: smartLevels.takeProfit.recommended,
        message: `${position.name}建议止盈位${smartLevels.takeProfit.recommended.toFixed(4)}`,
        priority: 'medium',
        technicalBasis: smartLevels.explanation.takeProfitReason
      });
    }

    return {
      alerts: alerts,
      smartLevels: smartLevels,
      supportResistance: srLevels
    };
  }

  /**
   * 根据代码获取持仓
   */
  getPositionBySymbol(symbol) {
    return this.positions.find(p => p.symbol === symbol);
  }

  /**
   * 更新持仓价格
   */
  updatePositionPrice(symbol, newPrice, technicalData = {}) {
    const position = this.getPositionBySymbol(symbol);
    if (!position) {
      return null;
    }

    // 这里可以添加价格更新逻辑
    console.log(`📊 ${symbol} 价格更新: ${newPrice}`);
    return position;
  }

  /**
   * 检查止损止盈信号
   */
  checkStopLossAndTakeProfit(symbol, technicalData = {}) {
    const position = this.getPositionBySymbol(symbol);
    if (!position) return null;

    // 这里可以添加止损止盈检查逻辑
    // 暂时返回空数组，避免错误
    return [];
  }

  /**
   * 获取持仓的完整分析
   */
  getPositionAnalysis(symbol, currentPrice, technicalData) {
    const position = this.positions.find(p => p.symbol === symbol);
    if (!position) return null;

    const smartAlerts = this.generateSmartAlerts(position, currentPrice, technicalData);
    const currentPnL = (currentPrice - position.costPrice) / position.costPrice;

    return {
      position: position,
      currentPrice: currentPrice,
      pnl: {
        amount: ((currentPrice - position.costPrice) * position.quantity).toFixed(2),
        percentage: (currentPnL * 100).toFixed(2) + '%'
      },
      smartLevels: smartAlerts.smartLevels,
      supportResistance: smartAlerts.supportResistance,
      alerts: smartAlerts.alerts,
      riskAssessment: smartAlerts.smartLevels.explanation.riskAssessment
    };
  }

  /**
   * 获取所有持仓的概览
   */
  getPortfolioOverview() {
    return {
      totalPositions: this.positions.length,
      positions: this.positions,
      lastUpdated: dayjs().format('YYYY-MM-DD')
    };
  }
}

module.exports = SmartPortfolioManager;
