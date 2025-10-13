// 📊 持仓分析器：分析用户持仓的盈亏、风险和建议
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

// 配置dayjs时区插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

class PositionAnalyzer {
  constructor(options = {}) {
    this.positionsFile = options.positionsFile || path.join(__dirname, '../../config/my-etf-positions.json');
    this.positions = this._loadPositions();
  }

  /**
   * 加载持仓数据
   * @private
   */
  _loadPositions() {
    try {
      if (fs.existsSync(this.positionsFile)) {
        return JSON.parse(fs.readFileSync(this.positionsFile, 'utf8'));
      }
    } catch (error) {
      console.error('加载持仓数据失败:', error.message);
    }
    return [];
  }

  /**
   * 分析持仓表现
   * @param {Object} marketData - 市场数据，包含ETF价格信息
   * @returns {Object} 持仓分析结果
   */
  analyzePositions(marketData = {}) {
    const analysis = {
      totalPositions: this.positions.length,
      totalValue: 0,
      totalCost: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      positions: [],
      riskAssessment: {},
      recommendations: [],
      summary: {}
    };

    if (this.positions.length === 0) {
      analysis.summary = {
        message: '暂无持仓数据',
        status: 'empty'
      };
      return analysis;
    }

    // 分析每个持仓
    for (const position of this.positions) {
      const positionAnalysis = this._analyzeSinglePosition(position, marketData);
      analysis.positions.push(positionAnalysis);
      analysis.totalValue += positionAnalysis.currentValue;
      analysis.totalCost += positionAnalysis.costValue;
    }

    // 计算总体盈亏
    analysis.totalPnL = analysis.totalValue - analysis.totalCost;
    analysis.totalPnLPercent = analysis.totalCost > 0 ? (analysis.totalPnL / analysis.totalCost) * 100 : 0;

    // 风险评估
    analysis.riskAssessment = this._assessRisk(analysis);

    // 生成建议
    analysis.recommendations = this._generateRecommendations(analysis);

    // 生成摘要
    analysis.summary = this._generateSummary(analysis);

    return analysis;
  }

  /**
   * 分析单个持仓
   * @private
   */
  _analyzeSinglePosition(position, marketData) {
    const { symbol, quantity, costPrice, purchaseDate } = position;
    
    // 查找对应的市场数据
    const marketInfo = this._findMarketData(symbol, marketData);
    const currentPrice = marketInfo && marketInfo.当前价格 ? parseFloat(marketInfo.当前价格) : 0;
    const priceChange = marketInfo ? marketInfo.价格偏离 : 0;
    const priceChangePercent = marketInfo ? marketInfo.价格偏离 : 0;

    // 确保数值类型正确
    const qty = parseFloat(quantity) || 0;
    const cost = parseFloat(costPrice) || 0;
    const current = parseFloat(currentPrice) || 0;

    const costValue = qty * cost;
    const currentValue = qty * current;
    const pnl = currentValue - costValue;
    const pnlPercent = costValue > 0 ? (pnl / costValue) * 100 : 0;

    // 技术指标分析
    const technicalAnalysis = this._analyzeTechnicalIndicators(marketInfo);

    return {
      symbol,
      name: marketInfo ? marketInfo.ETF : symbol,
      costPrice: cost,
      currentPrice: current,
      costValue,
      currentValue,
      pnl,
      pnlPercent,
      priceChange,
      priceChangePercent,
      technicalAnalysis,
      status: this._getPositionStatus(pnlPercent, technicalAnalysis),
      recommendation: this._getPositionRecommendation(pnlPercent, technicalAnalysis, marketInfo)
    };
  }

  /**
   * 查找市场数据
   * @private
   */
  _findMarketData(symbol, marketData) {
    if (!marketData || !Array.isArray(marketData.data)) {
      return null;
    }

    // 尝试不同的匹配方式
    return marketData.data.find(item => 
      item.代码 === symbol || 
      item.symbol === symbol ||
      item.ETF && item.ETF.includes(symbol.replace('sh', '').replace('sz', ''))
    );
  }

  /**
   * 分析技术指标
   * @private
   */
  _analyzeTechnicalIndicators(marketInfo) {
    if (!marketInfo) {
      return {
        rsi: null,
        technicalScore: null,
        signal: '无数据',
        trend: 'unknown'
      };
    }

    const rsi = marketInfo.RSI || null;
    const technicalScore = marketInfo.技术评分 || null;
    const signal = marketInfo.交易信号 || '无信号';
    
    let trend = 'unknown';
    if (technicalScore !== null) {
      if (technicalScore >= 70) trend = 'strong_bullish';
      else if (technicalScore >= 50) trend = 'bullish';
      else if (technicalScore >= 30) trend = 'bearish';
      else trend = 'strong_bearish';
    }

    return {
      rsi,
      technicalScore,
      signal,
      trend
    };
  }

  /**
   * 获取持仓状态
   * @private
   */
  _getPositionStatus(pnlPercent, technicalAnalysis) {
    if (pnlPercent > 10) return 'excellent';
    if (pnlPercent > 5) return 'good';
    if (pnlPercent > 0) return 'positive';
    if (pnlPercent > -5) return 'neutral';
    if (pnlPercent > -10) return 'poor';
    return 'critical';
  }

  /**
   * 获取持仓建议
   * @private
   */
  _getPositionRecommendation(pnlPercent, technicalAnalysis, marketInfo) {
    const { signal, trend, technicalScore } = technicalAnalysis;

    // 基于技术指标和市场环境的综合建议
    const isStrongBuy = signal.includes('强烈买入') || technicalScore >= 80;
    const isBuy = signal.includes('买入') || technicalScore >= 60;
    const isSell = signal.includes('卖出') || technicalScore <= 30;
    const isHold = signal.includes('持有') || (technicalScore > 30 && technicalScore < 60);

    // 计算目标价格（基于技术评分和当前价格）
    const targetPrice = this._calculateTargetPrice(marketInfo ? marketInfo.当前价格 : 0, technicalScore, signal);

    // 基于盈亏和技术指标的综合建议
    if (isStrongBuy && pnlPercent < 10) {
      return {
        action: '强烈看好，建议持有',
        reason: '技术指标显示强烈买入信号，市场环境良好',
        targetPrice: targetPrice,
        priority: 'high'
      };
    }

    if (isBuy && pnlPercent < 5) {
      return {
        action: '看好，建议持有',
        reason: '技术指标显示买入信号，建议继续持有',
        targetPrice: targetPrice,
        priority: 'medium'
      };
    }

    if (isSell && pnlPercent > 0) {
      return {
        action: '考虑减仓或卖出',
        reason: '技术指标显示卖出信号，建议获利了结',
        targetPrice: marketInfo ? marketInfo.当前价格 : 0,
        priority: 'high'
      };
    }

    if (isHold) {
      return {
        action: '中性持有',
        reason: '技术指标中性，建议继续观察',
        targetPrice: targetPrice,
        priority: 'low'
      };
    }

    if (pnlPercent < -15) {
      return {
        action: '考虑止损',
        reason: '亏损较大，技术指标较弱，建议止损',
        targetPrice: marketInfo ? marketInfo.当前价格 : 0,
        priority: 'high'
      };
    }

    return {
      action: '继续观察',
      reason: '技术指标不明确，建议继续观察市场变化',
      targetPrice: targetPrice,
      priority: 'low'
    };
  }

  /**
   * 计算目标价格
   * @private
   */
  _calculateTargetPrice(currentPrice, technicalScore, signal) {
    if (!currentPrice || currentPrice <= 0) return null;

    let targetMultiplier = 1.0;

    // 基于技术评分调整目标价格
    if (technicalScore >= 80) {
      targetMultiplier = 1.15; // 强烈买入，目标涨幅15%
    } else if (technicalScore >= 70) {
      targetMultiplier = 1.10; // 买入，目标涨幅10%
    } else if (technicalScore >= 60) {
      targetMultiplier = 1.05; // 偏买入，目标涨幅5%
    } else if (technicalScore >= 40) {
      targetMultiplier = 1.0; // 中性，目标价格不变
    } else if (technicalScore >= 30) {
      targetMultiplier = 0.95; // 偏卖出，目标跌幅5%
    } else {
      targetMultiplier = 0.90; // 卖出，目标跌幅10%
    }

    // 基于信号进一步调整
    if (signal.includes('强烈买入')) {
      targetMultiplier = Math.max(targetMultiplier, 1.15);
    } else if (signal.includes('买入')) {
      targetMultiplier = Math.max(targetMultiplier, 1.05);
    } else if (signal.includes('卖出')) {
      targetMultiplier = Math.min(targetMultiplier, 0.95);
    }

    return (currentPrice * targetMultiplier).toFixed(3);
  }

  /**
   * 风险评估
   * @private
   */
  _assessRisk(analysis) {
    const { positions, totalPnLPercent } = analysis;
    
    let riskScore = 0;
    let riskFactors = [];

    // 总体盈亏风险
    if (totalPnLPercent < -10) {
      riskScore += 30;
      riskFactors.push('总体亏损超过10%');
    } else if (totalPnLPercent < -5) {
      riskScore += 20;
      riskFactors.push('总体亏损超过5%');
    }

    // 单个持仓风险
    const poorPositions = positions.filter(p => p.status === 'poor' || p.status === 'critical');
    if (poorPositions.length > 0) {
      riskScore += poorPositions.length * 15;
      riskFactors.push(`${poorPositions.length}个持仓表现不佳`);
    }

    // 技术指标风险
    const weakTechnicalPositions = positions.filter(p => 
      p.technicalAnalysis.trend === 'strong_bearish' || 
      p.technicalAnalysis.signal.includes('卖出')
    );
    if (weakTechnicalPositions.length > 0) {
      riskScore += weakTechnicalPositions.length * 10;
      riskFactors.push(`${weakTechnicalPositions.length}个持仓技术指标较弱`);
    }

    // 市场环境风险（基于技术评分）
    const lowScorePositions = positions.filter(p => 
      p.technicalAnalysis.technicalScore && p.technicalAnalysis.technicalScore < 40
    );
    if (lowScorePositions.length > 0) {
      riskScore += lowScorePositions.length * 8;
      riskFactors.push(`${lowScorePositions.length}个持仓技术评分较低`);
    }

    let riskLevel = 'low';
    if (riskScore >= 60) riskLevel = 'high';
    else if (riskScore >= 30) riskLevel = 'medium';

    return {
      score: Math.min(riskScore, 100),
      level: riskLevel,
      factors: riskFactors
    };
  }

  /**
   * 生成投资建议
   * @private
   */
  _generateRecommendations(analysis) {
    const recommendations = [];
    const { positions, totalPnLPercent, riskAssessment } = analysis;

    // 基于总体表现的建议
    if (totalPnLPercent > 10) {
      recommendations.push({
        type: 'profit_taking',
        title: '考虑部分获利了结',
        description: '总体盈利良好，可考虑部分减仓锁定利润',
        priority: 'medium'
      });
    }

    if (totalPnLPercent < -10) {
      recommendations.push({
        type: 'risk_control',
        title: '加强风险控制',
        description: '总体亏损较大，建议加强风险控制，考虑止损',
        priority: 'high'
      });
    }

    // 基于风险等级的建议
    if (riskAssessment.level === 'high') {
      recommendations.push({
        type: 'diversification',
        title: '考虑分散投资',
        description: '当前持仓风险较高，建议增加持仓品种以分散风险',
        priority: 'high'
      });
    }

    // 基于单个持仓的建议
    positions.forEach(position => {
      if (position.recommendation.priority === 'high') {
        recommendations.push({
          type: 'position_action',
          title: `${position.name} - ${position.recommendation.action}`,
          description: position.recommendation.reason,
          priority: 'high',
          symbol: position.symbol
        });
      }
    });

    return recommendations;
  }

  /**
   * 生成摘要
   * @private
   */
  _generateSummary(analysis) {
    const { totalPnLPercent, totalValue, totalCost, riskAssessment } = analysis;
    
    let status = 'neutral';
    let message = '';

    if (totalPnLPercent > 5) {
      status = 'positive';
      message = `持仓表现良好，总收益${totalPnLPercent.toFixed(2)}%`;
    } else if (totalPnLPercent < -5) {
      status = 'negative';
      message = `持仓表现不佳，总亏损${Math.abs(totalPnLPercent).toFixed(2)}%`;
    } else {
      status = 'neutral';
      message = `持仓表现平稳，总收益${totalPnLPercent.toFixed(2)}%`;
    }

    return {
      status,
      message,
      totalValue: totalValue.toFixed(2),
      totalCost: totalCost.toFixed(2),
      totalPnL: analysis.totalPnL.toFixed(2),
      totalPnLPercent: totalPnLPercent.toFixed(2),
      riskLevel: riskAssessment.level,
      positionCount: analysis.totalPositions
    };
  }

  /**
   * 格式化持仓分析结果用于HTML报告
   * @param {Object} analysis - 持仓分析结果
   * @returns {string} HTML格式的持仓分析
   */
  formatForHTML(analysis) {
    if (analysis.totalPositions === 0) {
      return `
        <section class="position-section">
          <h2>💼 持仓分析</h2>
          <div class="no-positions">
            <p>暂无持仓数据</p>
          </div>
        </section>
      `;
    }

    let html = `
      <section class="position-section">
        <h2>💼 持仓分析</h2>
        
        <!-- 总体表现 -->
        <div class="position-summary">
          <div class="summary-cards">
            <div class="summary-card ${analysis.summary.status}">
              <h3>总体表现</h3>
              <p class="highlight">${analysis.summary.message}</p>
              <div class="summary-details">
                <span>总市值: ¥${analysis.summary.totalValue}</span>
                <span>总成本: ¥${analysis.summary.totalCost}</span>
                <span>盈亏: ¥${analysis.summary.totalPnL}</span>
              </div>
            </div>
            
            <div class="summary-card risk-${analysis.riskAssessment.level}">
              <h3>风险评估</h3>
              <p class="risk-level">风险等级: ${analysis.riskAssessment.level === 'high' ? '高' : analysis.riskAssessment.level === 'medium' ? '中' : '低'}</p>
              <div class="risk-factors">
                ${analysis.riskAssessment.factors.map(factor => `<span class="risk-factor">${factor}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 持仓详情 -->
        <div class="positions-detail">
          <h3>持仓详情</h3>
          <div class="positions-grid">
    `;

    analysis.positions.forEach(position => {
      const pnlClass = position.pnl >= 0 ? 'positive' : 'negative';
      const statusClass = position.status;
      
      html += `
        <div class="position-card ${statusClass}">
          <div class="position-header">
            <h4>${position.name} (${position.symbol})</h4>
            <span class="position-status">${this._getStatusText(position.status)}</span>
          </div>
          
          <div class="position-info">
            <div class="info-row">
              <span class="label">成本价:</span>
              <span class="value">¥${position.costPrice}</span>
            </div>
            <div class="info-row">
              <span class="label">当前价:</span>
              <span class="value">¥${position.currentPrice}</span>
            </div>
            <div class="info-row">
              <span class="label">盈亏:</span>
              <span class="value ${pnlClass}">¥${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)</span>
            </div>
            ${position.recommendation.targetPrice ? `
            <div class="info-row">
              <span class="label">目标价:</span>
              <span class="value">¥${position.recommendation.targetPrice}</span>
            </div>
            ` : ''}
          </div>
          
          <div class="technical-info">
            <div class="tech-item">
              <span class="label">技术评分:</span>
              <span class="value">${position.technicalAnalysis.technicalScore || 'N/A'}</span>
            </div>
            <div class="tech-item">
              <span class="label">交易信号:</span>
              <span class="value">${position.technicalAnalysis.signal}</span>
            </div>
          </div>
          
          <div class="recommendation">
            <h5>操作建议</h5>
            <p class="recommendation-text">${position.recommendation.action} - ${position.recommendation.reason}</p>
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <!-- 投资建议 -->
        ${analysis.recommendations.length > 0 ? `
        <div class="recommendations">
          <h3>投资建议</h3>
          <div class="recommendations-list">
            ${analysis.recommendations.map(rec => `
              <div class="recommendation-item priority-${rec.priority}">
                <h4>${rec.title}</h4>
                <p>${rec.description}</p>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </section>
    `;

    return html;
  }

  /**
   * 获取状态文本
   * @private
   */
  _getStatusText(status) {
    const statusMap = {
      'excellent': '优秀',
      'good': '良好',
      'positive': '盈利',
      'neutral': '平稳',
      'poor': '不佳',
      'critical': '严重'
    };
    return statusMap[status] || '未知';
  }
}

module.exports = PositionAnalyzer;
