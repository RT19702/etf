// 🔄 行业轮动检测器
// 识别资金流向和行业轮动趋势，为动态资产配置提供依据

const dayjs = require('dayjs');

/**
 * 行业轮动检测器
 * 分析不同行业ETF的表现，识别资金流向和轮动趋势
 */
class SectorRotationDetector {
  constructor() {
    // 行业分类映射
    this.sectorMapping = {
      '科技传媒': ['科技', '半导体', '芯片', '人工智能', '云计算', '5G', '集成电路', '显示面板', '传媒', '智能硬件'],
      '新能源': ['新能源', '光伏', '储能', '电池', '氢能', '风能', '智能汽车', '智能车', '智能电网'],
      '消费行业': ['消费', '食品饮料', '酒'],
      '医疗行业': ['医药', '医疗', '生物医药', '医药生物'],
      '金融行业': ['券商', '银行', '证券', '非银'],
      '周期制造': ['工业', '机械装备', '装备制造', '高端制造', '智能制造', '钢铁', '建材'],
      '军工国防': ['军工', '航天航空', '卫星通信'],
      '能源化工': ['煤炭', '石油', '化工'],
      '大宗商品': ['有色金属', '有色', '稀土永磁'],
      '贵金属': ['黄金', '白银'],
      '地产基建': ['房地产', '基建'],
      '环保公用': ['环保', '电力', '公用事业'],
      '宽基指数': ['上证50', '沪深300', '中证500', '创业板', '科创50', '双创50', '深证100', '深100', '创50'],
      '港股': ['H股', '恒生'],
      '国际指数': ['纳指', '标普', '欧洲', '日经', '美债'],
      '价值投资': ['价值', '红利低波'],
      '海外中国': ['中概互联']
    };

    // 行业轮动历史记录
    this.rotationHistory = [];
    
    // 当前行业表现
    this.currentSectorPerformance = {};
  }

  /**
   * 分析行业轮动
   * @param {Array} etfData - ETF数据列表
   * @returns {Object} 行业轮动分析结果
   */
  analyzeSectorRotation(etfData) {
    // 1. 按行业分组ETF数据
    const sectorGroups = this.groupByIndustry(etfData);
    
    // 2. 计算各行业综合表现
    const sectorPerformance = this.calculateSectorPerformance(sectorGroups);
    
    // 3. 识别强势行业和弱势行业
    const { strongSectors, weakSectors } = this.identifyStrongWeakSectors(sectorPerformance);
    
    // 4. 分析资金流向
    const capitalFlow = this.analyzeCapitalFlow(sectorPerformance);
    
    // 5. 检测轮动信号
    const rotationSignals = this.detectRotationSignals(sectorPerformance);
    
    // 6. 生成配置建议
    const allocationAdvice = this.generateAllocationAdvice(strongSectors, weakSectors, capitalFlow);
    
    // 更新当前行业表现
    this.currentSectorPerformance = sectorPerformance;
    
    // 记录历史
    this.updateRotationHistory({
      timestamp: Date.now(),
      sectorPerformance,
      strongSectors,
      weakSectors,
      capitalFlow,
      rotationSignals
    });
    
    return {
      timestamp: Date.now(),
      sectorPerformance,
      strongSectors,
      weakSectors,
      capitalFlow,
      rotationSignals,
      allocationAdvice,
      summary: this.generateSummary(strongSectors, weakSectors, capitalFlow)
    };
  }

  /**
   * 按行业分组ETF
   */
  groupByIndustry(etfData) {
    const groups = {};
    
    etfData.forEach(etf => {
      const sector = etf.type || this.detectSectorFromName(etf.name);
      
      if (!groups[sector]) {
        groups[sector] = [];
      }
      
      groups[sector].push(etf);
    });
    
    return groups;
  }

  /**
   * 从ETF名称检测行业分类
   */
  detectSectorFromName(name) {
    for (const [sector, keywords] of Object.entries(this.sectorMapping)) {
      for (const keyword of keywords) {
        if (name.includes(keyword)) {
          return sector;
        }
      }
    }
    return '其他';
  }

  /**
   * 计算行业综合表现
   */
  calculateSectorPerformance(sectorGroups) {
    const performance = {};
    
    for (const [sector, etfs] of Object.entries(sectorGroups)) {
      if (etfs.length === 0) continue;
      
      // 计算行业平均指标
      const avgPriceChange = this.calculateAverage(etfs.map(etf => 
        ((etf.current - etf.ma5) / etf.ma5) * 100
      ));
      
      const avgTechnicalScore = this.calculateAverage(etfs.map(etf => 
        etf.technicalScore?.score || 50
      ));
      
      const avgVolatility = this.calculateAverage(etfs.map(etf => 
        parseFloat(etf.volatility?.replace('%', '') || '0')
      ));
      
      // 统计买入信号数量
      const buySignalCount = etfs.filter(etf => 
        etf.signal?.level?.includes('买入')
      ).length;
      
      const strongBuyCount = etfs.filter(etf => 
        etf.signal?.level?.includes('强烈买入')
      ).length;
      
      // 计算成交量变化（如果有数据）
      const avgVolumeRatio = this.calculateAverage(etfs.map(etf => 
        etf.technicalIndicators?.volumeRatio || 1
      ));
      
      // 计算动量
      const avgMomentum = this.calculateAverage(etfs.map(etf => 
        etf.technicalIndicators?.momentum || 0
      ));
      
      // 综合评分 (0-100)
      const compositeScore = this.calculateCompositeScore({
        priceChange: avgPriceChange,
        technicalScore: avgTechnicalScore,
        volumeRatio: avgVolumeRatio,
        momentum: avgMomentum,
        buySignalRatio: buySignalCount / etfs.length,
        strongBuyRatio: strongBuyCount / etfs.length
      });
      
      performance[sector] = {
        sector,
        etfCount: etfs.length,
        avgPriceChange: parseFloat(avgPriceChange.toFixed(2)),
        avgTechnicalScore: parseFloat(avgTechnicalScore.toFixed(1)),
        avgVolatility: parseFloat(avgVolatility.toFixed(2)),
        avgVolumeRatio: parseFloat(avgVolumeRatio.toFixed(2)),
        avgMomentum: parseFloat(avgMomentum.toFixed(3)),
        buySignalCount,
        strongBuyCount,
        buySignalRatio: parseFloat((buySignalCount / etfs.length).toFixed(2)),
        compositeScore: parseFloat(compositeScore.toFixed(1)),
        etfs: etfs.map(e => ({ symbol: e.symbol, name: e.name, current: e.current }))
      };
    }
    
    return performance;
  }

  /**
   * 计算综合评分
   */
  calculateCompositeScore(metrics) {
    const weights = {
      priceChange: 0.25,      // 价格变化权重
      technicalScore: 0.20,   // 技术评分权重
      volumeRatio: 0.15,      // 成交量权重
      momentum: 0.15,         // 动量权重
      buySignalRatio: 0.15,   // 买入信号比例权重
      strongBuyRatio: 0.10    // 强烈买入信号权重
    };
    
    // 归一化各指标到0-100
    const normalized = {
      priceChange: Math.max(0, Math.min(100, 50 + metrics.priceChange * 10)),
      technicalScore: metrics.technicalScore,
      volumeRatio: Math.min(100, metrics.volumeRatio * 50),
      momentum: Math.max(0, Math.min(100, 50 + metrics.momentum * 100)),
      buySignalRatio: metrics.buySignalRatio * 100,
      strongBuyRatio: metrics.strongBuyRatio * 100
    };
    
    // 加权计算
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += normalized[key] * weight;
    }
    
    return score;
  }

  /**
   * 识别强势和弱势行业
   */
  identifyStrongWeakSectors(sectorPerformance) {
    const sectors = Object.values(sectorPerformance);
    
    // 按综合评分排序
    const sortedSectors = sectors.sort((a, b) => b.compositeScore - a.compositeScore);
    
    // 强势行业：评分前30%且评分>60
    const strongThreshold = Math.max(60, sortedSectors[Math.floor(sortedSectors.length * 0.3)]?.compositeScore || 60);
    const strongSectors = sortedSectors.filter(s => s.compositeScore >= strongThreshold);
    
    // 弱势行业：评分后30%或评分<40
    const weakThreshold = Math.min(40, sortedSectors[Math.floor(sortedSectors.length * 0.7)]?.compositeScore || 40);
    const weakSectors = sortedSectors.filter(s => s.compositeScore <= weakThreshold);
    
    return { strongSectors, weakSectors };
  }

  /**
   * 分析资金流向
   */
  analyzeCapitalFlow(sectorPerformance) {
    const sectors = Object.values(sectorPerformance);
    
    // 资金流入行业：成交量放大 + 价格上涨
    const inflowSectors = sectors.filter(s => 
      s.avgVolumeRatio > 1.2 && s.avgPriceChange > 0
    ).sort((a, b) => 
      (b.avgVolumeRatio * b.avgPriceChange) - (a.avgVolumeRatio * a.avgPriceChange)
    );
    
    // 资金流出行业：成交量放大 + 价格下跌
    const outflowSectors = sectors.filter(s => 
      s.avgVolumeRatio > 1.2 && s.avgPriceChange < 0
    ).sort((a, b) => 
      (b.avgVolumeRatio * Math.abs(b.avgPriceChange)) - (a.avgVolumeRatio * Math.abs(a.avgPriceChange))
    );
    
    // 计算整体资金流向强度
    const totalInflow = inflowSectors.reduce((sum, s) => sum + s.avgVolumeRatio * s.avgPriceChange, 0);
    const totalOutflow = outflowSectors.reduce((sum, s) => sum + s.avgVolumeRatio * Math.abs(s.avgPriceChange), 0);
    
    return {
      inflowSectors: inflowSectors.slice(0, 5),
      outflowSectors: outflowSectors.slice(0, 5),
      netFlow: totalInflow - totalOutflow,
      flowStrength: totalInflow + totalOutflow,
      direction: totalInflow > totalOutflow ? 'inflow' : 'outflow'
    };
  }

  /**
   * 检测轮动信号
   */
  detectRotationSignals(sectorPerformance) {
    const signals = [];
    
    // 检查是否有明显的行业轮动
    if (this.rotationHistory.length > 0) {
      const lastRotation = this.rotationHistory[this.rotationHistory.length - 1];
      
      // 对比当前和历史强势行业
      for (const [sector, current] of Object.entries(sectorPerformance)) {
        const historical = lastRotation.sectorPerformance[sector];
        
        if (historical) {
          const scoreChange = current.compositeScore - historical.compositeScore;
          
          // 评分显著上升（>15分）
          if (scoreChange > 15) {
            signals.push({
              type: 'emerging',
              sector,
              message: `${sector}行业评分显著上升`,
              scoreChange: scoreChange.toFixed(1),
              priority: 'high'
            });
          }
          
          // 评分显著下降（<-15分）
          if (scoreChange < -15) {
            signals.push({
              type: 'declining',
              sector,
              message: `${sector}行业评分显著下降`,
              scoreChange: scoreChange.toFixed(1),
              priority: 'medium'
            });
          }
        }
      }
    }
    
    return signals;
  }

  /**
   * 生成配置建议
   */
  generateAllocationAdvice(strongSectors, weakSectors, capitalFlow) {
    const advice = {
      recommended: [],
      avoid: [],
      weights: {}
    };
    
    // 推荐配置：强势行业 + 资金流入行业
    const recommendedSet = new Set();
    
    // 添加强势行业（取前5个）
    strongSectors.slice(0, 5).forEach(s => {
      recommendedSet.add(s.sector);
    });
    
    // 添加资金流入行业（取前3个）
    capitalFlow.inflowSectors.slice(0, 3).forEach(s => {
      recommendedSet.add(s.sector);
    });
    
    advice.recommended = Array.from(recommendedSet);
    
    // 避免配置：弱势行业 + 资金流出行业
    const avoidSet = new Set();
    
    weakSectors.slice(0, 3).forEach(s => {
      avoidSet.add(s.sector);
    });
    
    capitalFlow.outflowSectors.slice(0, 2).forEach(s => {
      avoidSet.add(s.sector);
    });
    
    advice.avoid = Array.from(avoidSet);
    
    // 计算推荐权重（基于综合评分）
    const totalScore = strongSectors.reduce((sum, s) => sum + s.compositeScore, 0);
    
    advice.recommended.forEach(sector => {
      const sectorData = strongSectors.find(s => s.sector === sector);
      if (sectorData && totalScore > 0) {
        advice.weights[sector] = parseFloat((sectorData.compositeScore / totalScore).toFixed(3));
      }
    });
    
    return advice;
  }

  /**
   * 生成摘要
   */
  generateSummary(strongSectors, weakSectors, capitalFlow) {
    return {
      topSector: strongSectors[0]?.sector || '无',
      topSectorScore: strongSectors[0]?.compositeScore || 0,
      bottomSector: weakSectors[weakSectors.length - 1]?.sector || '无',
      mainInflowSector: capitalFlow.inflowSectors[0]?.sector || '无',
      mainOutflowSector: capitalFlow.outflowSectors[0]?.sector || '无',
      marketDirection: capitalFlow.direction === 'inflow' ? '资金净流入' : '资金净流出'
    };
  }

  /**
   * 更新轮动历史
   */
  updateRotationHistory(record) {
    this.rotationHistory.push(record);
    
    // 只保留最近10条记录
    if (this.rotationHistory.length > 10) {
      this.rotationHistory = this.rotationHistory.slice(-10);
    }
  }

  /**
   * 计算平均值
   */
  calculateAverage(values) {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * 获取当前行业表现
   */
  getCurrentSectorPerformance() {
    return this.currentSectorPerformance;
  }
}

module.exports = SectorRotationDetector;

