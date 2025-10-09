// 🎯 自适应资产配置管理器
// 整合市场环境、行业轮动、政策导向等多维度分析，动态调整资产配置

/**
 * 自适应资产配置管理器
 * 根据市场环境、行业轮动、政策导向等因素，智能调整ETF配置权重
 */
class AdaptiveAssetAllocator {
  constructor() {
    // 配置历史记录
    this.allocationHistory = [];
    
    // 当前配置方案
    this.currentAllocation = null;
    
    // 配置约束
    this.constraints = {
      maxSingleSector: 0.35,      // 单个行业最大权重
      maxSingleETF: 0.15,         // 单个ETF最大权重
      minDiversification: 3,      // 最少配置行业数
      cashReserve: 0.1            // 现金储备比例
    };
  }

  /**
   * 生成自适应配置方案
   * @param {Object} marketEnvironment - 市场环境分析
   * @param {Object} sectorRotation - 行业轮动分析
   * @param {Object} policyTrends - 政策导向分析
   * @param {Array} etfData - ETF数据列表
   * @returns {Object} 配置方案
   */
  generateAllocation(marketEnvironment, sectorRotation, policyTrends, etfData) {
    // 1. 确定整体风险偏好
    const riskAppetite = this.determineRiskAppetite(marketEnvironment);
    
    // 2. 计算行业配置权重
    const sectorWeights = this.calculateSectorWeights(
      marketEnvironment,
      sectorRotation,
      policyTrends,
      riskAppetite
    );
    
    // 3. 选择具体ETF并分配权重
    const etfAllocation = this.selectETFsAndAllocate(
      sectorWeights,
      etfData,
      sectorRotation
    );
    
    // 4. 应用配置约束
    const constrainedAllocation = this.applyConstraints(etfAllocation);
    
    // 5. 生成调仓建议
    const rebalanceAdvice = this.generateRebalanceAdvice(constrainedAllocation);
    
    // 6. 计算预期收益和风险
    const expectedMetrics = this.calculateExpectedMetrics(constrainedAllocation, etfData);
    
    const allocation = {
      timestamp: Date.now(),
      riskAppetite,
      sectorWeights,
      etfAllocation: constrainedAllocation,
      rebalanceAdvice,
      expectedMetrics,
      reasoning: this.generateReasoning(marketEnvironment, sectorRotation, policyTrends)
    };
    
    // 更新当前配置
    this.currentAllocation = allocation;
    
    // 记录历史
    this.updateAllocationHistory(allocation);
    
    return allocation;
  }

  /**
   * 确定风险偏好
   */
  determineRiskAppetite(marketEnvironment) {
    let riskScore = 50; // 基准分数
    
    // 根据市场趋势调整
    if (marketEnvironment.trend?.includes('strong_bullish')) {
      riskScore += 20;
    } else if (marketEnvironment.trend?.includes('bullish')) {
      riskScore += 10;
    } else if (marketEnvironment.trend?.includes('bearish')) {
      riskScore -= 10;
    } else if (marketEnvironment.trend?.includes('strong_bearish')) {
      riskScore -= 20;
    }
    
    // 根据波动率调整
    if (marketEnvironment.volatility === 'low') {
      riskScore += 10;
    } else if (marketEnvironment.volatility === 'high') {
      riskScore -= 15;
    }
    
    // 根据市场状态调整
    if (marketEnvironment.regime === 'bull_market') {
      riskScore += 15;
    } else if (marketEnvironment.regime === 'bear_market') {
      riskScore -= 15;
    } else if (marketEnvironment.regime === 'high_volatility') {
      riskScore -= 20;
    }
    
    // 根据置信度调整
    riskScore += (marketEnvironment.confidence - 0.5) * 20;
    
    // 归一化到0-100
    riskScore = Math.max(0, Math.min(100, riskScore));
    
    // 转换为风险偏好等级
    if (riskScore >= 70) return { level: 'aggressive', score: riskScore, equity: 0.9 };
    if (riskScore >= 55) return { level: 'moderate_aggressive', score: riskScore, equity: 0.75 };
    if (riskScore >= 45) return { level: 'moderate', score: riskScore, equity: 0.6 };
    if (riskScore >= 30) return { level: 'moderate_conservative', score: riskScore, equity: 0.45 };
    return { level: 'conservative', score: riskScore, equity: 0.3 };
  }

  /**
   * 计算行业配置权重
   */
  calculateSectorWeights(marketEnvironment, sectorRotation, policyTrends, riskAppetite) {
    const weights = {};
    const totalEquity = riskAppetite.equity; // 股票仓位
    
    // 获取推荐行业
    const recommendedSectors = new Set();
    
    // 1. 从行业轮动中获取强势行业
    sectorRotation.strongSectors.forEach(s => {
      recommendedSectors.add(s.sector);
    });
    
    // 2. 从政策导向中获取利好行业
    if (policyTrends.favorableThemes) {
      policyTrends.favorableThemes.forEach(theme => {
        theme.matchedSectors.forEach(sector => {
          recommendedSectors.add(sector);
        });
      });
    }
    
    // 3. 计算各行业基础权重
    const sectors = Array.from(recommendedSectors);
    
    sectors.forEach(sector => {
      let weight = 0;
      
      // 行业轮动评分贡献
      const sectorPerf = sectorRotation.sectorPerformance[sector];
      if (sectorPerf) {
        weight += (sectorPerf.compositeScore / 100) * 0.5;
      }
      
      // 政策导向贡献
      const policySignal = policyTrends.policySignals?.find(s => 
        s.recommendation?.some(r => r.sector === sector)
      );
      if (policySignal) {
        const strengthBonus = {
          'very_strong': 0.3,
          'strong': 0.2,
          'moderate': 0.1,
          'weak': 0.05
        };
        weight += strengthBonus[policySignal.strength] || 0;
      }
      
      // 资金流向贡献
      const hasInflow = sectorRotation.capitalFlow.inflowSectors.some(s => s.sector === sector);
      if (hasInflow) {
        weight += 0.15;
      }
      
      weights[sector] = weight;
    });
    
    // 4. 归一化权重到总股票仓位
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    
    if (totalWeight > 0) {
      Object.keys(weights).forEach(sector => {
        weights[sector] = parseFloat(((weights[sector] / totalWeight) * totalEquity).toFixed(3));
      });
    }
    
    // 5. 应用单行业最大权重限制
    Object.keys(weights).forEach(sector => {
      if (weights[sector] > this.constraints.maxSingleSector) {
        weights[sector] = this.constraints.maxSingleSector;
      }
    });
    
    return weights;
  }

  /**
   * 选择ETF并分配权重
   */
  selectETFsAndAllocate(sectorWeights, etfData, sectorRotation) {
    const allocation = [];
    
    Object.entries(sectorWeights).forEach(([sector, sectorWeight]) => {
      if (sectorWeight <= 0) return;
      
      // 获取该行业的ETF
      const sectorETFs = etfData.filter(etf => {
        const etfSector = etf.type || this.detectSectorFromName(etf.name);
        return etfSector === sector;
      });
      
      if (sectorETFs.length === 0) return;
      
      // 按技术评分排序
      const sortedETFs = sectorETFs.sort((a, b) => 
        (b.technicalScore?.score || 0) - (a.technicalScore?.score || 0)
      );
      
      // 选择前3个ETF（如果有的话）
      const selectedETFs = sortedETFs.slice(0, Math.min(3, sortedETFs.length));
      
      // 在选中的ETF之间分配权重
      const etfCount = selectedETFs.length;
      selectedETFs.forEach((etf, index) => {
        // 使用递减权重：第一个50%，第二个30%，第三个20%
        const weightRatios = [0.5, 0.3, 0.2];
        const etfWeight = sectorWeight * (weightRatios[index] || (1 / etfCount));
        
        allocation.push({
          symbol: etf.symbol,
          name: etf.name,
          sector,
          weight: parseFloat(etfWeight.toFixed(3)),
          technicalScore: etf.technicalScore?.score || 0,
          signal: etf.signal?.level || '持有',
          current: etf.current,
          reason: this.generateETFReason(etf, sector, sectorRotation)
        });
      });
    });
    
    // 按权重排序
    return allocation.sort((a, b) => b.weight - a.weight);
  }

  /**
   * 生成ETF选择理由
   */
  generateETFReason(etf, sector, sectorRotation) {
    const reasons = [];
    
    // 行业强势
    const sectorPerf = sectorRotation.sectorPerformance[sector];
    if (sectorPerf && sectorPerf.compositeScore > 70) {
      reasons.push(`${sector}行业强势`);
    }
    
    // 技术评分
    if (etf.technicalScore?.score > 70) {
      reasons.push('技术指标优秀');
    }
    
    // 买入信号
    if (etf.signal?.level?.includes('买入')) {
      reasons.push('出现买入信号');
    }
    
    // 资金流入
    const hasInflow = sectorRotation.capitalFlow.inflowSectors.some(s => s.sector === sector);
    if (hasInflow) {
      reasons.push('资金流入');
    }
    
    return reasons.join('、') || '符合配置标准';
  }

  /**
   * 应用配置约束
   */
  applyConstraints(allocation) {
    const constrained = [...allocation];
    
    // 应用单ETF最大权重限制
    constrained.forEach(item => {
      if (item.weight > this.constraints.maxSingleETF) {
        item.weight = this.constraints.maxSingleETF;
      }
    });
    
    // 重新归一化
    const totalWeight = constrained.reduce((sum, item) => sum + item.weight, 0);
    const targetWeight = 1 - this.constraints.cashReserve;
    
    if (totalWeight > 0 && totalWeight !== targetWeight) {
      const scaleFactor = targetWeight / totalWeight;
      constrained.forEach(item => {
        item.weight = parseFloat((item.weight * scaleFactor).toFixed(3));
      });
    }
    
    return constrained;
  }

  /**
   * 生成调仓建议
   */
  generateRebalanceAdvice(newAllocation) {
    const advice = {
      actions: [],
      summary: ''
    };
    
    if (!this.currentAllocation) {
      advice.summary = '首次建仓';
      newAllocation.forEach(item => {
        if (item.weight > 0.05) { // 只建议权重>5%的
          advice.actions.push({
            action: '买入',
            symbol: item.symbol,
            name: item.name,
            targetWeight: item.weight,
            reason: item.reason
          });
        }
      });
      return advice;
    }
    
    // 对比当前配置和新配置
    const currentMap = new Map();
    this.currentAllocation.etfAllocation.forEach(item => {
      currentMap.set(item.symbol, item.weight);
    });
    
    newAllocation.forEach(item => {
      const currentWeight = currentMap.get(item.symbol) || 0;
      const weightChange = item.weight - currentWeight;
      
      if (Math.abs(weightChange) > 0.05) { // 变化超过5%才调整
        advice.actions.push({
          action: weightChange > 0 ? '增持' : '减持',
          symbol: item.symbol,
          name: item.name,
          currentWeight,
          targetWeight: item.weight,
          change: parseFloat(weightChange.toFixed(3)),
          reason: item.reason
        });
      }
      
      currentMap.delete(item.symbol);
    });
    
    // 处理需要清仓的
    currentMap.forEach((weight, symbol) => {
      if (weight > 0.05) {
        const item = this.currentAllocation.etfAllocation.find(i => i.symbol === symbol);
        advice.actions.push({
          action: '清仓',
          symbol,
          name: item?.name || symbol,
          currentWeight: weight,
          targetWeight: 0,
          change: -weight,
          reason: '不再符合配置标准'
        });
      }
    });
    
    advice.summary = `建议调整${advice.actions.length}个持仓`;
    return advice;
  }

  /**
   * 计算预期指标
   */
  calculateExpectedMetrics(allocation, etfData) {
    if (allocation.length === 0) {
      return { expectedReturn: 0, expectedRisk: 0, sharpeRatio: 0 };
    }
    
    // 计算加权平均技术评分
    const avgScore = allocation.reduce((sum, item) => 
      sum + item.technicalScore * item.weight, 0
    );
    
    // 计算加权平均波动率
    const avgVolatility = allocation.reduce((sum, item) => {
      const etf = etfData.find(e => e.symbol === item.symbol);
      const vol = parseFloat(etf?.volatility?.replace('%', '') || '2');
      return sum + vol * item.weight;
    }, 0);
    
    // 简化的预期收益估算（基于技术评分）
    const expectedReturn = (avgScore - 50) * 0.2; // 评分每高1分，预期多0.2%收益
    
    return {
      expectedReturn: parseFloat(expectedReturn.toFixed(2)),
      expectedRisk: parseFloat(avgVolatility.toFixed(2)),
      sharpeRatio: avgVolatility > 0 ? parseFloat((expectedReturn / avgVolatility).toFixed(2)) : 0,
      diversification: allocation.length
    };
  }

  /**
   * 生成配置理由
   */
  generateReasoning(marketEnvironment, sectorRotation, policyTrends) {
    const reasons = [];
    
    // 市场环境
    reasons.push(`市场环境: ${marketEnvironment.trend}，波动率${marketEnvironment.volatility}`);
    
    // 行业轮动
    if (sectorRotation.summary.topSector) {
      reasons.push(`强势行业: ${sectorRotation.summary.topSector}`);
    }
    
    // 政策导向
    if (policyTrends.summary.mainTheme !== '无明确主题') {
      reasons.push(`政策利好: ${policyTrends.summary.mainTheme}`);
    }
    
    // 资金流向
    reasons.push(`资金流向: ${sectorRotation.summary.marketDirection}`);
    
    return reasons.join('；');
  }

  /**
   * 从名称检测行业
   */
  detectSectorFromName(name) {
    const sectorMapping = {
      '科技传媒': ['科技', '半导体', '芯片', '人工智能', '云计算', '5G'],
      '新能源': ['新能源', '光伏', '储能', '电池'],
      '消费行业': ['消费', '食品', '酒'],
      '医疗行业': ['医药', '医疗'],
      '金融行业': ['券商', '银行', '证券'],
      '周期制造': ['制造', '机械', '工业'],
      '军工国防': ['军工', '航天'],
      '宽基指数': ['上证', '沪深', '中证', '创业板', '科创']
    };
    
    for (const [sector, keywords] of Object.entries(sectorMapping)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        return sector;
      }
    }
    
    return '其他';
  }

  /**
   * 更新配置历史
   */
  updateAllocationHistory(allocation) {
    this.allocationHistory.push(allocation);
    
    if (this.allocationHistory.length > 20) {
      this.allocationHistory = this.allocationHistory.slice(-20);
    }
  }

  /**
   * 获取当前配置
   */
  getCurrentAllocation() {
    return this.currentAllocation;
  }
}

module.exports = AdaptiveAssetAllocator;

