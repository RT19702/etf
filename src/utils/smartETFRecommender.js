// 🎯 智能ETF推荐器
// 根据市场环境、板块轮动、政策导向智能推荐ETF，避免推送与市场热点不符的产品

const dayjs = require('dayjs');

/**
 * 智能ETF推荐器
 * 解决用户反映的问题：根据市场环境和资金流向智能推荐ETF，避免推送不符合市场热点的产品
 */
class SmartETFRecommender {
  constructor() {
    // 热点板块权重配置
    this.hotSectorBonus = {
      '强势流入': 2.0,    // 资金强势流入的板块权重翻倍
      '政策利好': 1.8,    // 政策利好板块权重+80%
      '技术强势': 1.5,    // 技术面强势板块权重+50%
      '动量延续': 1.3,    // 动量延续板块权重+30%
      '市场热点': 1.6     // 市场热点板块权重+60%
    };

    // 冷门板块权重惩罚
    this.coldSectorPenalty = {
      '资金流出': 0.3,    // 资金流出板块权重降至30%
      '政策利空': 0.4,    // 政策利空板块权重降至40%
      '技术疲弱': 0.5,    // 技术疲弱板块权重降至50%
      '趋势转弱': 0.6     // 趋势转弱板块权重降至60%
    };

    // 推荐历史记录
    this.recommendationHistory = [];
  }

  /**
   * 智能推荐ETF
   * @param {Array} etfData - ETF数据列表
   * @param {Object} marketEnvironment - 市场环境数据
   * @param {Object} sectorRotation - 板块轮动数据
   * @param {Object} policyTrends - 政策导向数据
   * @returns {Object} 智能推荐结果
   */
  recommend(etfData, marketEnvironment, sectorRotation, policyTrends) {
    console.log('🎯 开始智能ETF推荐分析...');

    // 1. 识别当前市场热点板块
    const hotSectors = this.identifyHotSectors(marketEnvironment, sectorRotation, policyTrends);
    
    // 2. 计算每个ETF的智能评分
    const scoredETFs = this.calculateSmartScores(etfData, hotSectors, sectorRotation);
    
    // 3. 过滤不符合市场环境的ETF
    const filteredETFs = this.filterByMarketEnvironment(scoredETFs, marketEnvironment, hotSectors);
    
    // 4. 生成推荐报告
    const recommendation = this.generateRecommendation(filteredETFs, hotSectors, marketEnvironment);
    
    // 5. 记录推荐历史
    this.recordRecommendation(recommendation);

    console.log(`🎯 智能推荐完成：热点板块 ${hotSectors.map(h => h.sector).join('、')}，推荐${recommendation.strongRecommendations.length}个强推ETF`);

    return recommendation;
  }

  /**
   * 识别当前市场热点板块
   */
  identifyHotSectors(marketEnvironment, sectorRotation, policyTrends) {
    const hotSectors = [];

    if (!sectorRotation) {
      console.log('⚠️ 缺少板块轮动数据，使用默认热点识别');
      return [{ sector: '科技传媒', reason: '默认热点', strength: 0.5, bonus: 1.2 }];
    }

    // 1. 基于资金流入的热点板块
    if (sectorRotation.capitalFlow && sectorRotation.capitalFlow.inflowSectors) {
      sectorRotation.capitalFlow.inflowSectors.slice(0, 3).forEach((sector, index) => {
        const strength = Math.max(0.8 - index * 0.2, 0.4); // 递减强度
        hotSectors.push({
          sector: sector.sector,
          reason: `资金流入排名第${index + 1}`,
          strength: strength,
          bonus: this.hotSectorBonus['强势流入'] - (index * 0.2),
          flowData: sector
        });
      });
    }

    // 2. 基于技术强势的热点板块
    if (sectorRotation.strongSectors) {
      sectorRotation.strongSectors.slice(0, 3).forEach((sector, index) => {
        // 避免重复添加
        const existing = hotSectors.find(h => h.sector === sector.sector);
        if (!existing && sector.compositeScore > 70) {
          hotSectors.push({
            sector: sector.sector,
            reason: `技术评分${sector.compositeScore.toFixed(1)}`,
            strength: Math.min(sector.compositeScore / 100, 0.9),
            bonus: this.hotSectorBonus['技术强势'],
            scoreData: sector
          });
        }
      });
    }

    // 3. 基于政策导向的热点板块
    if (policyTrends && policyTrends.investmentAdvice && policyTrends.investmentAdvice.primaryTheme) {
      const primaryTheme = policyTrends.investmentAdvice.primaryTheme;
      if (primaryTheme.allocation > 0.2) { // 配置建议超过20%
        hotSectors.push({
          sector: this.mapPolicyThemeToSector(primaryTheme.theme),
          reason: `政策主题：${primaryTheme.theme}`,
          strength: Math.min(primaryTheme.allocation * 2, 0.9), // 配置比例转换为强度
          bonus: this.hotSectorBonus['政策利好'],
          policyData: primaryTheme
        });
      }
    }

    // 4. 基于市场环境的热点板块调整
    if (marketEnvironment) {
      hotSectors.forEach(hotSector => {
        // 牛市环境下，科技和成长类板块权重增加
        if (marketEnvironment.trend && marketEnvironment.trend.includes('bullish')) {
          if (['科技传媒', '新能源', '军工国防'].includes(hotSector.sector)) {
            hotSector.bonus *= 1.2;
            hotSector.reason += '（牛市利好）';
          }
        }
        
        // 高波动环境下，防御性板块权重增加
        if (marketEnvironment.volatility === 'high') {
          if (['消费行业', '医疗行业', '金融行业'].includes(hotSector.sector)) {
            hotSector.bonus *= 1.1;
            hotSector.reason += '（高波动防御）';
          }
        }
      });
    }

    // 5. 去重并按强度排序
    const uniqueHotSectors = hotSectors.reduce((unique, current) => {
      const existing = unique.find(h => h.sector === current.sector);
      if (!existing) {
        unique.push(current);
      } else if (current.strength > existing.strength) {
        // 保留强度更高的
        Object.assign(existing, current);
      }
      return unique;
    }, []);

    return uniqueHotSectors
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // 最多保留5个热点板块
  }

  /**
   * 计算ETF智能评分
   */
  calculateSmartScores(etfData, hotSectors, sectorRotation) {
    return etfData.map(etf => {
      const sector = etf.type || this.detectSectorFromName(etf.name);
      const baseTechnicalScore = etf.technicalScore?.score || 50;
      
      // 查找是否属于热点板块
      const hotSector = hotSectors.find(h => h.sector === sector);
      
      // 基础智能评分
      let smartScore = baseTechnicalScore;
      
      // 热点板块加分
      if (hotSector) {
        const bonus = (hotSector.bonus - 1) * baseTechnicalScore * hotSector.strength;
        smartScore += bonus;
        
        etf.hotSectorInfo = {
          isHotSector: true,
          hotReason: hotSector.reason,
          bonus: bonus.toFixed(1),
          strength: hotSector.strength
        };
      } else {
        etf.hotSectorInfo = { isHotSector: false };
        
        // 检查是否属于冷门板块（需要降权）
        const coldPenalty = this.calculateColdSectorPenalty(etf, sectorRotation);
        if (coldPenalty < 1.0) {
          smartScore *= coldPenalty;
          etf.hotSectorInfo.isColdSector = true;
          etf.hotSectorInfo.penalty = ((1 - coldPenalty) * 100).toFixed(1) + '%';
        }
      }

      // 信号质量调整
      if (etf.signal && etf.signal.level) {
        if (etf.signal.level.includes('强烈买入')) {
          smartScore *= 1.3;
        } else if (etf.signal.level.includes('买入')) {
          smartScore *= 1.15;
        } else if (etf.signal.level.includes('卖出')) {
          smartScore *= 0.7;
        }
      }

      return {
        ...etf,
        sector,
        smartScore: Math.max(0, Math.min(100, smartScore)), // 限制在0-100范围内
        baseTechnicalScore
      };
    });
  }

  /**
   * 计算冷门板块惩罚
   */
  calculateColdSectorPenalty(etf, sectorRotation) {
    if (!sectorRotation || !sectorRotation.weakSectors) return 1.0;

    const sector = etf.type || this.detectSectorFromName(etf.name);
    const weakSector = sectorRotation.weakSectors.find(w => w.sector === sector);
    
    if (weakSector) {
      // 根据弱势程度决定惩罚幅度
      if (weakSector.compositeScore < 30) {
        return this.coldSectorPenalty['技术疲弱']; // 50%权重
      } else if (weakSector.compositeScore < 40) {
        return this.coldSectorPenalty['趋势转弱']; // 60%权重
      }
    }

    // 检查资金流出
    if (sectorRotation.capitalFlow && sectorRotation.capitalFlow.outflowSectors) {
      const outflowSector = sectorRotation.capitalFlow.outflowSectors.find(o => o.sector === sector);
      if (outflowSector) {
        return this.coldSectorPenalty['资金流出']; // 30%权重
      }
    }

    return 1.0; // 无惩罚
  }

  /**
   * 根据市场环境过滤ETF
   */
  filterByMarketEnvironment(scoredETFs, marketEnvironment, hotSectors) {
    // 按智能评分排序
    const sortedETFs = scoredETFs.sort((a, b) => b.smartScore - a.smartScore);
    
    const result = {
      all: sortedETFs,
      hotSectorETFs: [],
      coldSectorETFs: [],
      neutralETFs: []
    };

    sortedETFs.forEach(etf => {
      if (etf.hotSectorInfo.isHotSector) {
        result.hotSectorETFs.push(etf);
      } else if (etf.hotSectorInfo.isColdSector) {
        result.coldSectorETFs.push(etf);
      } else {
        result.neutralETFs.push(etf);
      }
    });

    return result;
  }

  /**
   * 生成智能推荐报告
   */
  generateRecommendation(filteredETFs, hotSectors, marketEnvironment) {
    const recommendation = {
      timestamp: Date.now(),
      marketSummary: this.generateMarketSummary(marketEnvironment, hotSectors),
      hotSectors: hotSectors,
      strongRecommendations: [],
      moderateRecommendations: [],
      avoidRecommendations: [],
      explanation: {}
    };

    // 强烈推荐：热点板块中智能评分>75的ETF
    recommendation.strongRecommendations = filteredETFs.hotSectorETFs
      .filter(etf => etf.smartScore > 75)
      .slice(0, 3)
      .map(etf => this.formatRecommendation(etf, '强烈推荐'));

    // 中度推荐：智能评分60-75的ETF（包括热点板块和中性板块）
    const moderateCandidates = [
      ...filteredETFs.hotSectorETFs.filter(etf => etf.smartScore >= 60 && etf.smartScore <= 75),
      ...filteredETFs.neutralETFs.filter(etf => etf.smartScore >= 65)
    ];
    recommendation.moderateRecommendations = moderateCandidates
      .sort((a, b) => b.smartScore - a.smartScore)
      .slice(0, 5)
      .map(etf => this.formatRecommendation(etf, '适度关注'));

    // 建议回避：冷门板块或智能评分<40的ETF
    recommendation.avoidRecommendations = [
      ...filteredETFs.coldSectorETFs.filter(etf => etf.smartScore < 50),
      ...filteredETFs.all.filter(etf => etf.smartScore < 40 && !etf.hotSectorInfo.isHotSector)
    ].slice(0, 3)
     .map(etf => this.formatRecommendation(etf, '建议回避'));

    // 生成解释说明
    recommendation.explanation = this.generateExplanation(hotSectors, marketEnvironment);

    return recommendation;
  }

  /**
   * 格式化推荐信息
   */
  formatRecommendation(etf, level) {
    return {
      symbol: etf.symbol,
      name: etf.name,
      current: etf.current,
      sector: etf.sector,
      smartScore: etf.smartScore.toFixed(1),
      baseTechnicalScore: etf.baseTechnicalScore.toFixed(1),
      signal: etf.signal?.level || '持有',
      level: level,
      reason: this.generateRecommendationReason(etf, level),
      hotSectorInfo: etf.hotSectorInfo
    };
  }

  /**
   * 生成推荐理由
   */
  generateRecommendationReason(etf, level) {
    const reasons = [];

    if (etf.hotSectorInfo.isHotSector) {
      reasons.push(`热点板块(${etf.hotSectorInfo.hotReason})`);
      if (etf.hotSectorInfo.bonus) {
        reasons.push(`热点加分+${etf.hotSectorInfo.bonus}`);
      }
    }

    if (etf.hotSectorInfo.isColdSector) {
      reasons.push(`冷门板块(权重降${etf.hotSectorInfo.penalty})`);
    }

    if (etf.signal?.level) {
      reasons.push(`技术信号: ${etf.signal.level}`);
    }

    const scoreImprovement = etf.smartScore - etf.baseTechnicalScore;
    if (Math.abs(scoreImprovement) > 5) {
      reasons.push(`智能优化${scoreImprovement > 0 ? '+' : ''}${scoreImprovement.toFixed(1)}分`);
    }

    return reasons.join(' | ');
  }

  /**
   * 生成市场环境摘要
   */
  generateMarketSummary(marketEnvironment, hotSectors) {
    let summary = '当前市场';

    if (marketEnvironment) {
      if (marketEnvironment.trend) {
        if (marketEnvironment.trend.includes('bullish')) {
          summary += '偏多头';
        } else if (marketEnvironment.trend.includes('bearish')) {
          summary += '偏空头';
        } else {
          summary += '中性';
        }
      }

      if (marketEnvironment.volatility) {
        summary += `，波动率${marketEnvironment.volatility === 'high' ? '较高' : marketEnvironment.volatility === 'low' ? '较低' : '正常'}`;
      }
    }

    if (hotSectors.length > 0) {
      summary += `。资金主要流向：${hotSectors.slice(0, 3).map(h => h.sector).join('、')}`;
    }

    return summary + '。';
  }

  /**
   * 生成解释说明
   */
  generateExplanation(hotSectors, marketEnvironment) {
    return {
      hotSectorLogic: `基于资金流向和技术面分析，当前热点板块为：${hotSectors.map(h => `${h.sector}(${h.reason})`).join('、')}`,
      scoringLogic: '智能评分 = 技术评分 × 热点板块权重 × 信号质量调整，优先推荐热点板块中技术面强势的ETF',
      marketLogic: marketEnvironment ? 
        `市场环境：${this.translateMarketStatus(marketEnvironment.trend)}，波动率${this.translateMarketStatus(marketEnvironment.volatility)}，建议${marketEnvironment.trend.includes('bullish') ? '适度积极' : '相对谨慎'}` :
        '市场环境数据不足，建议保持中性策略',
      avoidanceLogic: '建议回避资金流出、技术疲弱或与当前市场热点不符的板块'
    };
  }

  /**
   * 政策主题映射到板块
   */
  mapPolicyThemeToSector(theme) {
    const mapping = {
      '科技创新': '科技传媒',
      '新能源转型': '新能源',
      '消费升级': '消费行业',
      '医疗健康': '医疗行业',
      '金融改革': '金融行业',
      '制造强国': '周期制造',
      '能源安全': '大宗商品',
      '基建投资': '地产基建',
      '国防安全': '军工国防',
      '数字经济': '科技传媒'
    };
    return mapping[theme] || '科技传媒';
  }

  /**
   * 从ETF名称检测行业分类
   */
  detectSectorFromName(name) {
    const sectorMapping = {
      '科技传媒': ['科技', '半导体', '芯片', '人工智能', '云计算', '5G', '集成电路', '显示面板', '传媒', '智能硬件'],
      '新能源': ['新能源', '光伏', '储能', '电池', '氢能', '风能', '智能汽车', '智能车', '智能电网'],
      '消费行业': ['消费', '食品饮料', '酒'],
      '医疗行业': ['医药', '医疗', '生物医药', '医药生物'],
      '金融行业': ['券商', '银行', '证券', '非银'],
      '周期制造': ['工业', '机械装备', '装备制造', '高端制造', '智能制造', '钢铁', '建材'],
      '军工国防': ['军工', '航天航空', '卫星通信'],
      '能源化工': ['煤炭', '石油', '化工'],
      '大宗商品': ['有色金属', '有色', '稀土永磁', '稀土'],
      '贵金属': ['黄金', '白银'],
      '地产基建': ['房地产', '基建'],
      '环保公用': ['环保', '电力', '公用事业'],
      '宽基指数': ['上证50', '沪深300', '中证500', '创业板', '科创50', '双创50', '深证100', '深100', '创50'],
      '港股': ['H股', '恒生'],
      '国际指数': ['纳指', '标普', '欧洲', '日经', '美债'],
      '价值投资': ['价值', '红利低波'],
      '海外中国': ['中概互联']
    };

    for (const [sector, keywords] of Object.entries(sectorMapping)) {
      for (const keyword of keywords) {
        if (name.includes(keyword)) {
          return sector;
        }
      }
    }
    return '其他';
  }

  /**
   * 翻译市场状态
   */
  translateMarketStatus(status) {
    const statusMapping = {
      'strong_bullish': '强势上涨',
      'bullish': '上涨',
      'slightly_bullish': '小幅上涨',
      'neutral': '中性',
      'slightly_bearish': '小幅下跌',
      'bearish': '下跌',
      'strong_bearish': '强势下跌',
      'low': '低',
      'normal': '正常',
      'elevated': '偏高',
      'high': '高'
    };
    return statusMapping[status] || status;
  }

  /**
   * 记录推荐历史
   */
  recordRecommendation(recommendation) {
    this.recommendationHistory.push({
      timestamp: recommendation.timestamp,
      hotSectorCount: recommendation.hotSectors.length,
      strongRecommendationCount: recommendation.strongRecommendations.length,
      moderateRecommendationCount: recommendation.moderateRecommendations.length,
      avoidRecommendationCount: recommendation.avoidRecommendations.length
    });

    // 只保留最近20条记录
    if (this.recommendationHistory.length > 20) {
      this.recommendationHistory = this.recommendationHistory.slice(-20);
    }
  }

  /**
   * 获取推荐历史统计
   */
  getRecommendationStats() {
    if (this.recommendationHistory.length === 0) return null;

    const recent = this.recommendationHistory.slice(-10);
    return {
      totalRecommendations: this.recommendationHistory.length,
      recentAvgHotSectors: recent.reduce((sum, r) => sum + r.hotSectorCount, 0) / recent.length,
      recentAvgStrongRecommendations: recent.reduce((sum, r) => sum + r.strongRecommendationCount, 0) / recent.length,
      lastRecommendation: this.recommendationHistory[this.recommendationHistory.length - 1]
    };
  }
}

module.exports = SmartETFRecommender;
