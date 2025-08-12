// 📋 特别关注ETF模块

/**
 * 动态关注条件检测器
 * 基于实时技术指标和市场条件动态识别值得关注的ETF
 */
class DynamicWatchDetector {
  constructor() {
    this.enabled = process.env.ENABLE_SPECIAL_WATCH !== 'false';
    // 动态关注条件的阈值（智能化配置）
    this.thresholds = {
      rsi_oversold: Number(process.env.DYNAMIC_RSI_OVERSOLD_THRESHOLD) || 25, // 更严格的超卖阈值
      rsi_overbought: 75,         // 更严格的超买阈值
      volume_spike_ratio: Number(process.env.DYNAMIC_VOLUME_SPIKE_RATIO) || 2.0, // 提高成交量阈值
      technical_score_min: Number(process.env.DYNAMIC_TECHNICAL_SCORE_MIN) || 75, // 提高技术评分阈值
      price_change_threshold: Number(process.env.DYNAMIC_PRICE_CHANGE_THRESHOLD) || 4.0, // 提高价格变动阈值
      volatility_high: 6.0,       // 提高高波动率阈值
      consecutive_days: 2,        // 连续天数要求
      min_confidence: 0.6         // 最小置信度要求
    };

    // 历史记录用于智能过滤
    this.watchHistory = new Map(); // symbol -> history[]
    this.performanceTracker = new Map(); // symbol -> performance metrics
  }

  /**
   * 动态检测ETF是否值得特别关注（智能化版本）
   * @param {Object} etfData - ETF数据
   * @returns {Object|null} 关注提示信息
   */
  detectWatchConditions(etfData) {
    if (!this.enabled) {
      return null;
    }

    // 更新历史记录
    this._updateWatchHistory(etfData);

    const triggeredConditions = [];
    let priority = 'low';
    let reason = '市场异常';
    let confidence = 0;

    // 检查RSI超卖状态 (高优先级) - 增加历史验证
    const rsiCondition = this._checkRSIOversoldEnhanced(etfData);
    if (rsiCondition.triggered) {
      triggeredConditions.push(rsiCondition);
      priority = 'high';
      reason = 'RSI超卖，可能反弹机会';
      confidence += 0.3;
    }

    // 检查异常成交量放大 (中优先级) - 增加持续性验证
    const volumeCondition = this._checkVolumeSpikeEnhanced(etfData);
    if (volumeCondition.triggered) {
      triggeredConditions.push(volumeCondition);
      if (priority === 'low') {
        priority = 'medium';
        reason = '成交量异常放大，资金关注';
      }
      confidence += 0.2;
    }

    // 检查技术评分改善 (中优先级)
    const scoreCondition = this._checkTechnicalScoreImprovement(etfData);
    if (scoreCondition.triggered) {
      triggeredConditions.push(scoreCondition);
      if (priority === 'low') {
        priority = 'medium';
        reason = '技术指标转好，趋势改善';
      }
    }

    // 检查价格异常波动 (低优先级)
    const priceCondition = this._checkPriceAbnormalMovement(etfData);
    if (priceCondition.triggered) {
      triggeredConditions.push(priceCondition);
      if (priority === 'low') {
        reason = '价格异常波动，需要关注';
      }
    }

    // 如果没有触发任何条件，返回null
    if (triggeredConditions.length === 0) {
      return null;
    }

    return {
      symbol: etfData.symbol,
      name: etfData.name,
      priority: priority,
      reason: reason,
      triggeredConditions,
      currentData: {
        price: etfData.current,
        rsi: etfData.technicalIndicators?.rsi,
        technicalScore: etfData.technicalScore?.score,
        priceChange: this._calculatePriceChange(etfData),
        volatility: parseFloat(etfData.volatility?.replace('%', '') || '0'),
        volumeRatio: etfData.volumeRatio || 1.0
      }
    };
  }

  /**
   * 检查RSI超卖状态（增强版）
   * @private
   */
  _checkRSIOversoldEnhanced(etfData) {
    const rsi = etfData.technicalIndicators?.rsi;
    if (!rsi) return { triggered: false };

    // 基础RSI检查
    if (rsi >= this.thresholds.rsi_oversold) {
      return { triggered: false };
    }

    // 检查历史连续性
    const history = this.watchHistory.get(etfData.symbol) || [];
    const recentRSI = history.slice(-3).map(h => h.rsi).filter(r => r !== undefined);

    // 要求连续2天以上RSI低于阈值
    const consecutiveOversold = recentRSI.filter(r => r < this.thresholds.rsi_oversold).length;

    if (consecutiveOversold < this.thresholds.consecutive_days) {
      return { triggered: false };
    }

    // 计算RSI改善趋势
    const rsiTrend = recentRSI.length >= 2 ?
      recentRSI[recentRSI.length - 1] - recentRSI[recentRSI.length - 2] : 0;

    const severity = rsi < 20 ? 'high' : rsi < 25 ? 'medium' : 'low';
    const confidence = this._calculateRSIConfidence(rsi, rsiTrend, consecutiveOversold);

    if (confidence < this.thresholds.min_confidence) {
      return { triggered: false };
    }

    return {
      triggered: true,
      condition: 'rsi_oversold',
      message: `RSI超卖 (${rsi.toFixed(1)}, 连续${consecutiveOversold}天)`,
      severity: severity,
      value: rsi,
      confidence: confidence,
      trend: rsiTrend > 0 ? 'improving' : 'deteriorating'
    };
  }

  /**
   * 检查异常成交量放大（增强版）
   * @private
   */
  _checkVolumeSpikeEnhanced(etfData) {
    const volumeRatio = etfData.volumeRatio || 1.0;
    if (volumeRatio < this.thresholds.volume_spike_ratio) {
      return { triggered: false };
    }

    // 检查成交量持续性
    const history = this.watchHistory.get(etfData.symbol) || [];
    const recentVolumes = history.slice(-3).map(h => h.volumeRatio).filter(v => v !== undefined);

    // 计算平均成交量比率
    const avgVolumeRatio = recentVolumes.length > 0 ?
      recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length : 1.0;

    // 要求平均成交量也要高于正常水平
    if (avgVolumeRatio < 1.3) {
      return { triggered: false };
    }

    const confidence = this._calculateVolumeConfidence(volumeRatio, avgVolumeRatio);

    if (confidence < this.thresholds.min_confidence) {
      return { triggered: false };
    }

    return {
      triggered: true,
      condition: 'volume_spike',
      message: `成交量放大 (${(volumeRatio * 100).toFixed(0)}%, 平均${(avgVolumeRatio * 100).toFixed(0)}%)`,
      severity: volumeRatio > 3.0 ? 'high' : 'medium',
      value: volumeRatio,
      confidence: confidence
    };
  }

  /**
   * 更新关注历史记录
   * @private
   */
  _updateWatchHistory(etfData) {
    const symbol = etfData.symbol;
    const history = this.watchHistory.get(symbol) || [];

    const record = {
      timestamp: Date.now(),
      rsi: etfData.technicalIndicators?.rsi,
      volumeRatio: etfData.volumeRatio,
      technicalScore: etfData.technicalScore?.score,
      price: etfData.current,
      priceChange: this._calculatePriceChange(etfData)
    };

    history.push(record);

    // 只保留最近7天的记录
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const filteredHistory = history.filter(h => h.timestamp > sevenDaysAgo);

    this.watchHistory.set(symbol, filteredHistory);
  }

  /**
   * 计算RSI置信度
   * @private
   */
  _calculateRSIConfidence(rsi, rsiTrend, consecutiveDays) {
    let confidence = 0.5; // 基础置信度

    // RSI越低，置信度越高
    if (rsi < 15) confidence += 0.3;
    else if (rsi < 20) confidence += 0.2;
    else if (rsi < 25) confidence += 0.1;

    // RSI改善趋势加分
    if (rsiTrend > 0) confidence += 0.1;

    // 连续天数加分
    confidence += Math.min(consecutiveDays * 0.1, 0.2);

    return Math.min(confidence, 1.0);
  }

  /**
   * 计算成交量置信度
   * @private
   */
  _calculateVolumeConfidence(currentRatio, avgRatio) {
    let confidence = 0.5;

    // 当前成交量比率越高，置信度越高
    if (currentRatio > 4.0) confidence += 0.3;
    else if (currentRatio > 3.0) confidence += 0.2;
    else if (currentRatio > 2.0) confidence += 0.1;

    // 平均成交量比率加分
    if (avgRatio > 2.0) confidence += 0.2;
    else if (avgRatio > 1.5) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * 检查异常成交量放大
   * @private
   */
  _checkVolumeSpike(etfData) {
    const volumeRatio = etfData.volumeRatio || 1.0;

    if (volumeRatio >= this.thresholds.volume_spike_ratio) {
      return {
        triggered: true,
        condition: 'volume_spike',
        message: `成交量放大 (${(volumeRatio * 100).toFixed(0)}%)`,
        severity: 'medium',
        value: volumeRatio
      };
    }
    return { triggered: false };
  }

  /**
   * 检查技术评分改善
   * @private
   */
  _checkTechnicalScoreImprovement(etfData) {
    const score = etfData.technicalScore?.score;

    if (score && score >= this.thresholds.technical_score_min) {
      return {
        triggered: true,
        condition: 'technical_score_high',
        message: `技术评分优秀 (${score}分)`,
        severity: 'medium',
        value: score
      };
    }
    return { triggered: false };
  }

  /**
   * 检查价格异常波动
   * @private
   */
  _checkPriceAbnormalMovement(etfData) {
    const priceChange = Math.abs(this._calculatePriceChange(etfData));

    if (priceChange >= this.thresholds.price_change_threshold) {
      return {
        triggered: true,
        condition: 'price_abnormal',
        message: `价格异常波动 (${priceChange.toFixed(1)}%)`,
        severity: 'low',
        value: priceChange
      };
    }
    return { triggered: false };
  }

  /**
   * 计算价格变化百分比
   * @private
   */
  _calculatePriceChange(etfData) {
    if (etfData.current && etfData.ma5) {
      return ((etfData.current - etfData.ma5) / etfData.ma5) * 100;
    }
    return 0;
  }
}

class SpecialWatchManager {
  constructor() {
    this.watchList = this.loadWatchList();
    this.enabled = process.env.ENABLE_SPECIAL_WATCH !== 'false';
    // 创建动态检测器实例
    this.dynamicDetector = new DynamicWatchDetector();
    // 判断是否使用动态模式（如果没有静态配置，则使用动态模式）
    this.useDynamicMode = this.watchList.length === 0;
  }

  /**
   * 加载特别关注列表（兼容模式）
   */
  loadWatchList() {
    try {
      const watchListJson = process.env.SPECIAL_WATCH_LIST || '[]';
      return JSON.parse(watchListJson);
    } catch (error) {
      console.warn('⚠️ 特别关注列表配置解析失败，将使用动态模式');
      return [];
    }
  }

  /**
   * 分析ETF是否触发特别关注条件
   * @param {Object} etfData - ETF数据
   * @returns {Object|null} 关注提示信息
   */
  checkWatchConditions(etfData) {
    if (!this.enabled) {
      return null;
    }

    // 如果使用动态模式，调用动态检测器
    if (this.useDynamicMode) {
      return this.dynamicDetector.detectWatchConditions(etfData);
    }

    // 静态模式：查找匹配的关注配置
    if (this.watchList.length === 0) {
      return null;
    }

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

module.exports = { SpecialWatchManager, DynamicWatchDetector };
