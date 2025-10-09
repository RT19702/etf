// 📋 政策导向分析器
// 通过市场表现推断政策利好方向，识别政策驱动的投资机会

/**
 * 政策导向分析器
 * 基于行业表现和市场特征，推断可能的政策利好方向
 */
class PolicyTrendAnalyzer {
  constructor() {
    // 政策主题与行业映射
    this.policyThemes = {
      '科技创新': {
        sectors: ['科技传媒', '新能源', '军工国防'],
        keywords: ['人工智能', '芯片', '半导体', '5G', '云计算', '集成电路'],
        weight: 1.2
      },
      '新能源转型': {
        sectors: ['新能源', '环保公用'],
        keywords: ['光伏', '储能', '电池', '氢能', '风能', '新能源车'],
        weight: 1.3
      },
      '消费升级': {
        sectors: ['消费行业'],
        keywords: ['消费', '食品饮料', '酒'],
        weight: 1.0
      },
      '医疗健康': {
        sectors: ['医疗行业'],
        keywords: ['医药', '医疗', '生物医药'],
        weight: 1.1
      },
      '金融改革': {
        sectors: ['金融行业'],
        keywords: ['券商', '银行', '证券'],
        weight: 0.9
      },
      '制造强国': {
        sectors: ['周期制造', '军工国防'],
        keywords: ['高端制造', '智能制造', '装备制造', '航天航空'],
        weight: 1.2
      },
      '能源安全': {
        sectors: ['能源化工', '大宗商品'],
        keywords: ['煤炭', '石油', '有色金属', '稀土'],
        weight: 1.1
      },
      '基建投资': {
        sectors: ['地产基建'],
        keywords: ['基建', '建材', '房地产'],
        weight: 1.0
      },
      '国防安全': {
        sectors: ['军工国防'],
        keywords: ['军工', '航天', '卫星'],
        weight: 1.1
      },
      '数字经济': {
        sectors: ['科技传媒'],
        keywords: ['云计算', '大数据', '人工智能', '互联网'],
        weight: 1.2
      }
    };

    // 政策信号历史
    this.policySignalHistory = [];
  }

  /**
   * 分析政策导向
   * @param {Object} sectorRotation - 行业轮动分析结果
   * @param {Object} marketEnvironment - 市场环境数据
   * @returns {Object} 政策导向分析结果
   */
  analyzePolicyTrends(sectorRotation, marketEnvironment) {
    // 1. 识别政策利好主题
    const favorableThemes = this.identifyFavorableThemes(sectorRotation);
    
    // 2. 分析政策信号强度
    const policySignals = this.analyzePolicySignals(favorableThemes, sectorRotation);
    
    // 3. 生成政策驱动的投资建议
    const investmentAdvice = this.generatePolicyDrivenAdvice(policySignals, marketEnvironment);
    
    // 4. 检测政策转向
    const policyShifts = this.detectPolicyShifts(policySignals);
    
    // 记录历史
    this.updatePolicyHistory({
      timestamp: Date.now(),
      favorableThemes,
      policySignals,
      policyShifts
    });
    
    return {
      timestamp: Date.now(),
      favorableThemes,
      policySignals,
      investmentAdvice,
      policyShifts,
      summary: this.generatePolicySummary(favorableThemes, policySignals)
    };
  }

  /**
   * 识别政策利好主题
   */
  identifyFavorableThemes(sectorRotation) {
    const themes = [];
    const { strongSectors, capitalFlow } = sectorRotation;
    
    for (const [themeName, themeData] of Object.entries(this.policyThemes)) {
      let themeScore = 0;
      let matchedSectors = [];
      let evidence = [];
      
      // 检查主题相关行业是否强势
      for (const sector of themeData.sectors) {
        const sectorPerf = strongSectors.find(s => s.sector === sector);
        
        if (sectorPerf) {
          themeScore += sectorPerf.compositeScore * themeData.weight;
          matchedSectors.push(sector);
          evidence.push(`${sector}行业表现强势(评分${sectorPerf.compositeScore.toFixed(1)})`);
        }
      }
      
      // 检查是否有资金流入
      const hasCapitalInflow = capitalFlow.inflowSectors.some(s => 
        themeData.sectors.includes(s.sector)
      );
      
      if (hasCapitalInflow) {
        themeScore *= 1.2;
        evidence.push('资金持续流入');
      }
      
      // 如果主题得分足够高，加入结果
      if (themeScore > 60 && matchedSectors.length > 0) {
        themes.push({
          theme: themeName,
          score: parseFloat(themeScore.toFixed(1)),
          matchedSectors,
          evidence,
          confidence: this.calculateThemeConfidence(themeScore, matchedSectors.length, hasCapitalInflow)
        });
      }
    }
    
    // 按得分排序
    return themes.sort((a, b) => b.score - a.score);
  }

  /**
   * 计算主题置信度
   */
  calculateThemeConfidence(score, sectorCount, hasCapitalInflow) {
    let confidence = 0.5;
    
    // 得分越高，置信度越高
    if (score > 80) confidence += 0.2;
    else if (score > 70) confidence += 0.15;
    else if (score > 60) confidence += 0.1;
    
    // 匹配行业越多，置信度越高
    if (sectorCount >= 2) confidence += 0.15;
    else if (sectorCount >= 1) confidence += 0.1;
    
    // 有资金流入，置信度提升
    if (hasCapitalInflow) confidence += 0.15;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * 分析政策信号强度
   */
  analyzePolicySignals(favorableThemes, sectorRotation) {
    const signals = [];
    
    favorableThemes.forEach(theme => {
      const signal = {
        theme: theme.theme,
        strength: this.calculateSignalStrength(theme, sectorRotation),
        duration: this.estimateDuration(theme),
        recommendation: this.generateThemeRecommendation(theme, sectorRotation),
        relatedETFs: this.findRelatedETFs(theme, sectorRotation)
      };
      
      signals.push(signal);
    });
    
    return signals;
  }

  /**
   * 计算信号强度
   */
  calculateSignalStrength(theme, sectorRotation) {
    const baseStrength = theme.score / 100;
    const confidenceBonus = theme.confidence * 0.2;
    
    // 检查是否有轮动信号支持
    const hasRotationSupport = sectorRotation.rotationSignals.some(signal => 
      signal.type === 'emerging' && theme.matchedSectors.includes(signal.sector)
    );
    
    const rotationBonus = hasRotationSupport ? 0.15 : 0;
    
    const strength = Math.min(baseStrength + confidenceBonus + rotationBonus, 1.0);
    
    if (strength > 0.8) return 'very_strong';
    if (strength > 0.6) return 'strong';
    if (strength > 0.4) return 'moderate';
    return 'weak';
  }

  /**
   * 估计持续时间
   */
  estimateDuration(theme) {
    // 基于历史数据估计政策主题的持续时间
    // 这里使用简化逻辑，实际可以基于历史统计
    
    const longTermThemes = ['科技创新', '新能源转型', '制造强国', '数字经济'];
    const mediumTermThemes = ['消费升级', '医疗健康', '国防安全'];
    
    if (longTermThemes.includes(theme.theme)) {
      return 'long_term'; // 长期（6个月以上）
    } else if (mediumTermThemes.includes(theme.theme)) {
      return 'medium_term'; // 中期（3-6个月）
    }
    
    return 'short_term'; // 短期（1-3个月）
  }

  /**
   * 生成主题推荐
   */
  generateThemeRecommendation(theme, sectorRotation) {
    const recommendations = [];
    
    theme.matchedSectors.forEach(sector => {
      const sectorPerf = sectorRotation.sectorPerformance[sector];
      
      if (sectorPerf) {
        // 找出该行业中表现最好的ETF
        const topETFs = sectorPerf.etfs
          .slice(0, 3)
          .map(etf => etf.name);
        
        recommendations.push({
          sector,
          action: sectorPerf.compositeScore > 70 ? '积极配置' : '适度配置',
          topETFs
        });
      }
    });
    
    return recommendations;
  }

  /**
   * 查找相关ETF
   */
  findRelatedETFs(theme, sectorRotation) {
    const relatedETFs = [];
    const themeData = this.policyThemes[theme.theme];
    
    if (!themeData) return relatedETFs;
    
    // 从匹配的行业中提取ETF
    theme.matchedSectors.forEach(sector => {
      const sectorPerf = sectorRotation.sectorPerformance[sector];
      
      if (sectorPerf && sectorPerf.etfs) {
        sectorPerf.etfs.forEach(etf => {
          // 检查ETF名称是否包含主题关键词
          const matchesKeyword = themeData.keywords.some(keyword => 
            etf.name.includes(keyword)
          );
          
          if (matchesKeyword) {
            relatedETFs.push({
              symbol: etf.symbol,
              name: etf.name,
              sector
            });
          }
        });
      }
    });
    
    return relatedETFs.slice(0, 10); // 最多返回10个
  }

  /**
   * 生成政策驱动的投资建议
   */
  generatePolicyDrivenAdvice(policySignals, marketEnvironment) {
    const advice = {
      primaryTheme: null,
      secondaryThemes: [],
      actionPlan: [],
      riskWarnings: []
    };
    
    if (policySignals.length === 0) {
      return advice;
    }
    
    // 主要主题（信号最强的）
    const strongestSignal = policySignals[0];
    advice.primaryTheme = {
      theme: strongestSignal.theme,
      strength: strongestSignal.strength,
      duration: strongestSignal.duration,
      allocation: this.calculateAllocation(strongestSignal, marketEnvironment)
    };
    
    // 次要主题
    advice.secondaryThemes = policySignals.slice(1, 3).map(signal => ({
      theme: signal.theme,
      strength: signal.strength,
      allocation: this.calculateAllocation(signal, marketEnvironment) * 0.6
    }));
    
    // 行动计划
    advice.actionPlan = this.generateActionPlan(policySignals, marketEnvironment);
    
    // 风险警告
    advice.riskWarnings = this.generateRiskWarnings(policySignals, marketEnvironment);
    
    return advice;
  }

  /**
   * 计算配置比例
   */
  calculateAllocation(signal, marketEnvironment) {
    let baseAllocation = 0.3; // 基础配置30%
    
    // 根据信号强度调整
    switch (signal.strength) {
      case 'very_strong':
        baseAllocation = 0.4;
        break;
      case 'strong':
        baseAllocation = 0.3;
        break;
      case 'moderate':
        baseAllocation = 0.2;
        break;
      case 'weak':
        baseAllocation = 0.1;
        break;
    }
    
    // 根据市场环境调整
    if (marketEnvironment) {
      if (marketEnvironment.volatility === 'high') {
        baseAllocation *= 0.7; // 高波动时降低配置
      } else if (marketEnvironment.trend?.includes('bearish')) {
        baseAllocation *= 0.8; // 熊市时降低配置
      }
    }
    
    return parseFloat(baseAllocation.toFixed(2));
  }

  /**
   * 生成行动计划
   */
  generateActionPlan(policySignals, marketEnvironment) {
    const plan = [];
    
    policySignals.forEach((signal, index) => {
      if (signal.strength === 'very_strong' || signal.strength === 'strong') {
        plan.push({
          priority: index + 1,
          action: '建仓',
          theme: signal.theme,
          timing: '近期',
          relatedETFs: signal.relatedETFs.slice(0, 3).map(e => e.name)
        });
      } else if (signal.strength === 'moderate') {
        plan.push({
          priority: index + 1,
          action: '观察',
          theme: signal.theme,
          timing: '等待确认',
          relatedETFs: signal.relatedETFs.slice(0, 2).map(e => e.name)
        });
      }
    });
    
    return plan;
  }

  /**
   * 生成风险警告
   */
  generateRiskWarnings(policySignals, marketEnvironment) {
    const warnings = [];
    
    // 检查是否过度集中
    if (policySignals.length === 1) {
      warnings.push('政策主题过于集中，建议分散配置');
    }
    
    // 检查市场环境风险
    if (marketEnvironment?.volatility === 'high') {
      warnings.push('市场波动较大，建议控制仓位');
    }
    
    if (marketEnvironment?.trend?.includes('bearish')) {
      warnings.push('市场趋势偏弱，政策利好可能受限');
    }
    
    return warnings;
  }

  /**
   * 检测政策转向
   */
  detectPolicyShifts(currentSignals) {
    const shifts = [];
    
    if (this.policySignalHistory.length === 0) {
      return shifts;
    }
    
    const lastSignals = this.policySignalHistory[this.policySignalHistory.length - 1].policySignals;
    
    // 检测新出现的主题
    currentSignals.forEach(current => {
      const existed = lastSignals.find(last => last.theme === current.theme);
      
      if (!existed) {
        shifts.push({
          type: 'emerging',
          theme: current.theme,
          message: `${current.theme}成为新的政策热点`,
          strength: current.strength
        });
      }
    });
    
    // 检测消失的主题
    lastSignals.forEach(last => {
      const exists = currentSignals.find(current => current.theme === last.theme);
      
      if (!exists) {
        shifts.push({
          type: 'fading',
          theme: last.theme,
          message: `${last.theme}政策热度减退`,
          strength: last.strength
        });
      }
    });
    
    return shifts;
  }

  /**
   * 生成政策摘要
   */
  generatePolicySummary(favorableThemes, policySignals) {
    return {
      mainTheme: favorableThemes[0]?.theme || '无明确主题',
      themeCount: favorableThemes.length,
      strongSignalCount: policySignals.filter(s => s.strength === 'very_strong' || s.strength === 'strong').length,
      confidence: favorableThemes[0]?.confidence || 0
    };
  }

  /**
   * 更新政策历史
   */
  updatePolicyHistory(record) {
    this.policySignalHistory.push(record);
    
    // 只保留最近10条记录
    if (this.policySignalHistory.length > 10) {
      this.policySignalHistory = this.policySignalHistory.slice(-10);
    }
  }
}

module.exports = PolicyTrendAnalyzer;

