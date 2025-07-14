// 📋 特别关注ETF模块

class SpecialWatchManager {
  constructor() {
    this.watchList = this.loadWatchList();
    this.enabled = process.env.ENABLE_SPECIAL_WATCH !== 'false';
  }

  /**
   * 加载特别关注列表
   */
  loadWatchList() {
    try {
      const watchListJson = process.env.SPECIAL_WATCH_LIST || '[]';
      return JSON.parse(watchListJson);
    } catch (error) {
      console.warn('⚠️ 特别关注列表配置解析失败，使用默认配置');
      return [];
    }
  }

  /**
   * 分析ETF是否触发特别关注条件
   * @param {Object} etfData - ETF数据
   * @returns {Object|null} 关注提示信息
   */
  checkWatchConditions(etfData) {
    if (!this.enabled || this.watchList.length === 0) {
      return null;
    }

    // 查找匹配的关注配置
    const watchConfig = this.watchList.find(watch => 
      watch.symbol === etfData.symbol || watch.name === etfData.name
    );

    if (!watchConfig) {
      return null;
    }

    const triggeredConditions = [];
    const { conditions, thresholds } = watchConfig;

    // 检查各种关注条件
    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, etfData, thresholds);
      if (result.triggered) {
        triggeredConditions.push(result);
      }
    }

    if (triggeredConditions.length === 0) {
      return null;
    }

    return {
      symbol: etfData.symbol,
      name: etfData.name,
      priority: watchConfig.priority || 'medium',
      reason: watchConfig.reason || '特别关注',
      triggeredConditions,
      currentData: {
        price: etfData.current,
        rsi: etfData.technicalIndicators?.rsi,
        technicalScore: etfData.technicalScore?.score,
        priceChange: ((etfData.current - etfData.ma5) / etfData.ma5) * 100,
        volatility: parseFloat(etfData.volatility?.replace('%', '') || '0')
      }
    };
  }

  /**
   * 评估单个关注条件
   * @param {string} condition - 条件类型
   * @param {Object} etfData - ETF数据
   * @param {Object} thresholds - 阈值配置
   * @returns {Object} 评估结果
   */
  evaluateCondition(condition, etfData, thresholds = {}) {
    switch (condition) {
      case 'rsi_oversold':
        return this.checkRSIOversold(etfData, thresholds);
      
      case 'rsi_overbought':
        return this.checkRSIOverbought(etfData, thresholds);
      
      case 'price_change':
        return this.checkPriceChange(etfData, thresholds);
      
      case 'volume_spike':
        return this.checkVolumeSpike(etfData, thresholds);
      
      case 'technical_score':
        return this.checkTechnicalScore(etfData, thresholds);
      
      case 'volatility_high':
        return this.checkHighVolatility(etfData, thresholds);
      
      case 'buy_signal':
        return this.checkBuySignal(etfData, thresholds);
      
      case 'sell_signal':
        return this.checkSellSignal(etfData, thresholds);
      
      default:
        return { triggered: false, message: '未知条件' };
    }
  }

  /**
   * 检查RSI超卖
   */
  checkRSIOversold(etfData, thresholds) {
    const rsi = etfData.technicalIndicators?.rsi;
    const maxRSI = thresholds.rsi_max || 30;
    
    if (rsi && rsi < maxRSI) {
      return {
        triggered: true,
        condition: 'rsi_oversold',
        message: `RSI超卖 (${rsi.toFixed(1)} < ${maxRSI})`,
        severity: rsi < 20 ? 'high' : 'medium',
        value: rsi
      };
    }
    return { triggered: false };
  }

  /**
   * 检查RSI超买
   */
  checkRSIOverbought(etfData, thresholds) {
    const rsi = etfData.technicalIndicators?.rsi;
    const minRSI = thresholds.rsi_min || 70;
    
    if (rsi && rsi > minRSI) {
      return {
        triggered: true,
        condition: 'rsi_overbought',
        message: `RSI超买 (${rsi.toFixed(1)} > ${minRSI})`,
        severity: rsi > 80 ? 'high' : 'medium',
        value: rsi
      };
    }
    return { triggered: false };
  }

  /**
   * 检查价格变化
   */
  checkPriceChange(etfData, thresholds) {
    const priceChange = ((etfData.current - etfData.ma5) / etfData.ma5) * 100;
    const minChange = thresholds.price_change_min || 2;
    const maxChange = thresholds.price_change_max || -2;
    
    if (Math.abs(priceChange) >= minChange || priceChange <= maxChange) {
      return {
        triggered: true,
        condition: 'price_change',
        message: `价格异动 (${priceChange.toFixed(2)}%)`,
        severity: Math.abs(priceChange) > 5 ? 'high' : 'medium',
        value: priceChange
      };
    }
    return { triggered: false };
  }

  /**
   * 检查成交量异常
   */
  checkVolumeSpike(etfData, thresholds) {
    const volumeRatio = etfData.technicalIndicators?.volumeRatio || 1;
    const minRatio = thresholds.volume_ratio_min || 1.5;
    
    if (volumeRatio >= minRatio) {
      return {
        triggered: true,
        condition: 'volume_spike',
        message: `成交量放大 (${volumeRatio.toFixed(1)}倍)`,
        severity: volumeRatio > 2 ? 'high' : 'medium',
        value: volumeRatio
      };
    }
    return { triggered: false };
  }

  /**
   * 检查技术评分
   */
  checkTechnicalScore(etfData, thresholds) {
    const score = etfData.technicalScore?.score;
    const minScore = thresholds.technical_score_min || 70;
    const maxScore = thresholds.technical_score_max || 30;
    
    if (score && (score >= minScore || score <= maxScore)) {
      const isHigh = score >= minScore;
      return {
        triggered: true,
        condition: 'technical_score',
        message: `技术评分${isHigh ? '优秀' : '较差'} (${score}/100)`,
        severity: isHigh ? (score > 80 ? 'high' : 'medium') : 'medium',
        value: score
      };
    }
    return { triggered: false };
  }

  /**
   * 检查高波动率
   */
  checkHighVolatility(etfData, thresholds) {
    const volatility = parseFloat(etfData.volatility?.replace('%', '') || '0');
    const minVolatility = thresholds.volatility_min || 3;
    
    if (volatility >= minVolatility) {
      return {
        triggered: true,
        condition: 'volatility_high',
        message: `高波动率 (${volatility.toFixed(2)}%)`,
        severity: volatility > 5 ? 'high' : 'medium',
        value: volatility
      };
    }
    return { triggered: false };
  }

  /**
   * 检查买入信号
   */
  checkBuySignal(etfData, thresholds) {
    const signal = etfData.signal?.text || etfData.signal || '';
    
    if (signal.includes('买入')) {
      return {
        triggered: true,
        condition: 'buy_signal',
        message: `买入信号 (${signal})`,
        severity: signal.includes('强烈') ? 'high' : 'medium',
        value: signal
      };
    }
    return { triggered: false };
  }

  /**
   * 检查卖出信号
   */
  checkSellSignal(etfData, thresholds) {
    const signal = etfData.signal?.text || etfData.signal || '';
    
    if (signal.includes('卖出')) {
      return {
        triggered: true,
        condition: 'sell_signal',
        message: `卖出信号 (${signal})`,
        severity: signal.includes('强烈') ? 'high' : 'medium',
        value: signal
      };
    }
    return { triggered: false };
  }

  /**
   * 批量检查所有ETF的特别关注条件
   * @param {Array} etfDataList - ETF数据列表
   * @returns {Array} 关注提示列表
   */
  checkAllWatchConditions(etfDataList) {
    if (!this.enabled) {
      return [];
    }

    const alerts = [];
    
    for (const etfData of etfDataList) {
      const alert = this.checkWatchConditions(etfData);
      if (alert) {
        alerts.push(alert);
      }
    }

    // 按优先级排序
    return this.sortAlertsByPriority(alerts);
  }

  /**
   * 按优先级排序关注提示
   * @param {Array} alerts - 关注提示列表
   * @returns {Array} 排序后的关注提示列表
   */
  sortAlertsByPriority(alerts) {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    return alerts.sort((a, b) => {
      // 首先按优先级排序
      const priorityDiff = (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
      if (priorityDiff !== 0) return priorityDiff;
      
      // 然后按触发条件数量排序
      return b.triggeredConditions.length - a.triggeredConditions.length;
    });
  }

  /**
   * 格式化关注提示为文本
   * @param {Array} alerts - 关注提示列表
   * @returns {string} 格式化的文本
   */
  formatAlertsText(alerts) {
    if (!alerts || alerts.length === 0) {
      return '';
    }

    const maxAlerts = Number(process.env.MAX_WATCH_ALERTS) || 5;
    const limitedAlerts = alerts.slice(0, maxAlerts);
    
    let text = '## 🔍 特别关注提示\n\n';
    
    limitedAlerts.forEach((alert, index) => {
      const priorityIcon = this.getPriorityIcon(alert.priority);
      text += `${priorityIcon} **${alert.name}** (${alert.symbol})\n`;
      text += `  - 关注原因: ${alert.reason}\n`;
      
      alert.triggeredConditions.forEach(condition => {
        const severityIcon = this.getSeverityIcon(condition.severity);
        text += `  ${severityIcon} ${condition.message}\n`;
      });
      
      text += `  - 当前价格: ¥${alert.currentData.price.toFixed(3)}\n`;
      if (alert.currentData.rsi) {
        text += `  - RSI: ${alert.currentData.rsi.toFixed(1)}\n`;
      }
      if (alert.currentData.technicalScore) {
        text += `  - 技术评分: ${alert.currentData.technicalScore}/100\n`;
      }
      text += `\n`;
    });
    
    return text;
  }

  /**
   * 获取优先级图标
   */
  getPriorityIcon(priority) {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * 获取严重程度图标
   */
  getSeverityIcon(severity) {
    switch (severity) {
      case 'high': return '⚠️';
      case 'medium': return '📊';
      default: return '💡';
    }
  }
}

module.exports = SpecialWatchManager;
