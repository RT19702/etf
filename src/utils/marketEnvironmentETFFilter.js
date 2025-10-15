// 🔍 市场环境ETF过滤器
// 根据当前市场环境和热点板块，过滤和优化ETF推荐

const dayjs = require('dayjs');

/**
 * 市场环境ETF过滤器
 * 解决用户问题：确保ETF推荐与当前市场环境和热点板块保持一致
 */
class MarketEnvironmentETFFilter {
  constructor() {
    // 市场环境适配规则
    this.environmentRules = {
      // 牛市环境适合的板块
      bullish: {
        preferred: ['科技传媒', '新能源', '军工国防', '周期制造', '大宗商品'],
        avoid: ['防御性消费', '公用事业'],
        multiplier: 1.2
      },
      // 熊市环境适合的板块
      bearish: {
        preferred: ['消费行业', '医疗行业', '金融行业', '价值投资'],
        avoid: ['高风险成长股'],
        multiplier: 0.8
      },
      // 高波动环境
      highVolatility: {
        preferred: ['贵金属', '价值投资', '宽基指数'],
        avoid: ['小盘成长', '主题概念'],
        multiplier: 0.9
      },
      // 低波动环境
      lowVolatility: {
        preferred: ['科技传媒', '新能源', '军工国防'],
        avoid: ['贵金属'],
        multiplier: 1.1
      }
    };

    // 资金流向权重
    this.flowWeights = {
      strongInflow: 2.0,    // 强势流入
      moderateInflow: 1.5,  // 中度流入
      neutral: 1.0,         // 中性
      moderateOutflow: 0.7, // 中度流出
      strongOutflow: 0.3    // 强势流出
    };
  }

  /**
   * 根据市场环境过滤和调整ETF推荐
   * @param {Array} etfData - ETF数据数组
   * @param {Object} marketEnvironment - 市场环境
   * @param {Object} sectorRotation - 板块轮动数据
   * @param {Object} policyTrends - 政策导向数据
   * @returns {Object} 过滤结果
   */
  filterByEnvironment(etfData, marketEnvironment, sectorRotation, policyTrends) {
    console.log('🔍 根据市场环境过滤ETF推荐...');

    // 1. 识别当前市场环境类型
    const environmentType = this.identifyEnvironmentType(marketEnvironment);
    
    // 2. 计算每个ETF的环境适配度
    const adaptedETFs = etfData.map(etf => {
      const sector = etf.type || this.detectSectorFromName(etf.name);
      const adaptationScore = this.calculateAdaptationScore(
        etf, sector, environmentType, sectorRotation, policyTrends
      );
      
      return {
        ...etf,
        sector,
        environmentAdaptation: adaptationScore,
        originalScore: etf.technicalScore?.score || 50,
        adjustedScore: (etf.technicalScore?.score || 50) * adaptationScore.totalMultiplier
      };
    });

    // 3. 分类ETF
    const categorizedETFs = this.categorizeETFs(adaptedETFs, environmentType);

    // 4. 生成过滤结果
    const result = {
      environmentType,
      filterStats: this.calculateFilterStats(categorizedETFs),
      recommendedETFs: categorizedETFs.recommended,
      neutralETFs: categorizedETFs.neutral,
      discouragedETFs: categorizedETFs.discouraged,
      marketLogic: this.generateMarketLogic(environmentType, marketEnvironment, sectorRotation)
    };

    console.log(`🔍 过滤完成：推荐${result.recommendedETFs.length}个，中性${result.neutralETFs.length}个，不建议${result.discouragedETFs.length}个`);

    return result;
  }

  /**
   * 识别市场环境类型
   */
  identifyEnvironmentType(marketEnvironment) {
    if (!marketEnvironment) {
      return { type: 'neutral', confidence: 0.5 };
    }

    const types = [];

    // 趋势判断
    if (marketEnvironment.trend) {
      if (marketEnvironment.trend.includes('bullish')) {
        types.push({ type: 'bullish', weight: marketEnvironment.trend.includes('strong') ? 0.8 : 0.6 });
      } else if (marketEnvironment.trend.includes('bearish')) {
        types.push({ type: 'bearish', weight: marketEnvironment.trend.includes('strong') ? 0.8 : 0.6 });
      }
    }

    // 波动率判断
    if (marketEnvironment.volatility) {
      if (marketEnvironment.volatility === 'high') {
        types.push({ type: 'highVolatility', weight: 0.7 });
      } else if (marketEnvironment.volatility === 'low') {
        types.push({ type: 'lowVolatility', weight: 0.6 });
      }
    }

    // 选择权重最高的类型
    if (types.length > 0) {
      const primaryType = types.reduce((best, current) => 
        current.weight > best.weight ? current : best
      );
      return {
        type: primaryType.type,
        confidence: primaryType.weight,
        allTypes: types
      };
    }

    return { type: 'neutral', confidence: 0.5 };
  }

  /**
   * 计算ETF的环境适配度
   */
  calculateAdaptationScore(etf, sector, environmentType, sectorRotation, policyTrends) {
    const score = {
      environmentMatch: 1.0,
      flowMatch: 1.0,
      policyMatch: 1.0,
      totalMultiplier: 1.0,
      reasons: []
    };

    // 1. 环境匹配度
    if (environmentType.type !== 'neutral' && this.environmentRules[environmentType.type]) {
      const rule = this.environmentRules[environmentType.type];
      
      if (rule.preferred.includes(sector)) {
        score.environmentMatch = rule.multiplier;
        score.reasons.push(`${environmentType.type}环境利好`);
      } else if (rule.avoid.includes(sector)) {
        score.environmentMatch = 1 / rule.multiplier;
        score.reasons.push(`${environmentType.type}环境不利`);
      }
    }

    // 2. 资金流向匹配度
    if (sectorRotation && sectorRotation.capitalFlow) {
      const inflowSector = sectorRotation.capitalFlow.inflowSectors?.find(s => s.sector === sector);
      const outflowSector = sectorRotation.capitalFlow.outflowSectors?.find(s => s.sector === sector);
      
      if (inflowSector) {
        // 根据流入强度调整权重
        const flowStrength = Math.min(inflowSector.avgVolumeRatio / 2, 2); // 限制在0.5-2倍之间
        score.flowMatch = this.flowWeights.strongInflow * (flowStrength / 2);
        score.reasons.push(`资金流入(${inflowSector.avgVolumeRatio.toFixed(1)}倍成交量)`);
      } else if (outflowSector) {
        score.flowMatch = this.flowWeights.strongOutflow;
        score.reasons.push('资金流出');
      }
    }

    // 3. 政策匹配度
    if (policyTrends && policyTrends.investmentAdvice) {
      const primaryTheme = policyTrends.investmentAdvice.primaryTheme;
      if (primaryTheme && this.isPolicyRelevantSector(sector, primaryTheme.theme)) {
        score.policyMatch = 1 + (primaryTheme.allocation || 0.2);
        score.reasons.push(`政策利好(${primaryTheme.theme})`);
      }
    }

    // 计算总权重
    score.totalMultiplier = score.environmentMatch * score.flowMatch * score.policyMatch;

    return score;
  }

  /**
   * 检查板块是否与政策主题相关
   */
  isPolicyRelevantSector(sector, policyTheme) {
    const policyMapping = {
      '科技创新': ['科技传媒', '新能源', '军工国防'],
      '新能源转型': ['新能源', '环保公用'],
      '制造强国': ['周期制造', '军工国防'],
      '能源安全': ['大宗商品', '能源化工'],
      '消费升级': ['消费行业'],
      '医疗健康': ['医疗行业'],
      '金融改革': ['金融行业'],
      '数字经济': ['科技传媒']
    };

    return policyMapping[policyTheme]?.includes(sector) || false;
  }

  /**
   * 分类ETF
   */
  categorizeETFs(adaptedETFs, environmentType) {
    // 按调整后评分排序
    const sortedETFs = adaptedETFs.sort((a, b) => b.adjustedScore - a.adjustedScore);

    return {
      recommended: sortedETFs.filter(etf => 
        etf.environmentAdaptation.totalMultiplier >= 1.2 && etf.adjustedScore >= 60
      ),
      neutral: sortedETFs.filter(etf => 
        etf.environmentAdaptation.totalMultiplier >= 0.8 && 
        etf.environmentAdaptation.totalMultiplier < 1.2 &&
        etf.adjustedScore >= 45
      ),
      discouraged: sortedETFs.filter(etf => 
        etf.environmentAdaptation.totalMultiplier < 0.8 || etf.adjustedScore < 45
      )
    };
  }

  /**
   * 计算过滤统计
   */
  calculateFilterStats(categorizedETFs) {
    const total = categorizedETFs.recommended.length + 
                  categorizedETFs.neutral.length + 
                  categorizedETFs.discouraged.length;

    return {
      total,
      recommendedCount: categorizedETFs.recommended.length,
      neutralCount: categorizedETFs.neutral.length,
      discouragedCount: categorizedETFs.discouraged.length,
      recommendedRatio: (categorizedETFs.recommended.length / total).toFixed(2),
      adaptationScoreStats: this.calculateAdaptationStats(
        [...categorizedETFs.recommended, ...categorizedETFs.neutral, ...categorizedETFs.discouraged]
      )
    };
  }

  /**
   * 计算适配度统计
   */
  calculateAdaptationStats(allETFs) {
    if (allETFs.length === 0) return {};

    const multipliers = allETFs.map(etf => etf.environmentAdaptation.totalMultiplier);
    
    return {
      avgMultiplier: (multipliers.reduce((sum, m) => sum + m, 0) / multipliers.length).toFixed(2),
      maxMultiplier: Math.max(...multipliers).toFixed(2),
      minMultiplier: Math.min(...multipliers).toFixed(2),
      highAdaptationCount: multipliers.filter(m => m >= 1.2).length,
      lowAdaptationCount: multipliers.filter(m => m <= 0.8).length
    };
  }

  /**
   * 生成市场逻辑说明
   */
  generateMarketLogic(environmentType, marketEnvironment, sectorRotation) {
    let logic = `当前市场环境为${this.translateEnvironmentType(environmentType.type)}`;
    
    if (environmentType.confidence) {
      logic += `（置信度${(environmentType.confidence * 100).toFixed(0)}%）`;
    }

    logic += '。';

    // 添加环境特征描述
    if (marketEnvironment) {
      if (marketEnvironment.trend) {
        logic += `趋势呈现${this.translateMarketStatus(marketEnvironment.trend)}`;
      }
      if (marketEnvironment.volatility) {
        logic += `，波动率${this.translateMarketStatus(marketEnvironment.volatility)}`;
      }
      logic += '。';
    }

    // 添加资金流向描述
    if (sectorRotation && sectorRotation.capitalFlow) {
      const direction = sectorRotation.capitalFlow.direction === 'inflow' ? '净流入' : '净流出';
      logic += `资金整体呈现${direction}态势。`;
    }

    // 添加策略建议
    if (environmentType.type !== 'neutral' && this.environmentRules[environmentType.type]) {
      const rule = this.environmentRules[environmentType.type];
      logic += `建议重点关注${rule.preferred.join('、')}等板块`;
      if (rule.avoid.length > 0) {
        logic += `，谨慎配置${rule.avoid.join('、')}`;
      }
      logic += '。';
    }

    return logic;
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
   * 翻译环境类型
   */
  translateEnvironmentType(type) {
    const typeMapping = {
      bullish: '偏多头环境',
      bearish: '偏空头环境',
      highVolatility: '高波动环境',
      lowVolatility: '低波动环境',
      neutral: '中性环境'
    };
    return typeMapping[type] || type;
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
      'low': '较低',
      'normal': '正常',
      'elevated': '偏高',
      'high': '较高'
    };
    return statusMapping[status] || status;
  }
}

module.exports = MarketEnvironmentETFFilter;
