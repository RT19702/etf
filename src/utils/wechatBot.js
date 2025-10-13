// 企业微信机器人API集成模块
const axios = require('axios');
const fs = require('fs');
const dayjs = require('dayjs');

class WeChatBot {
  constructor(webhookUrl, options = {}) {
    this.webhookUrl = webhookUrl;
    this.retryCount = options.retryCount || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 10000;
    this.enableLog = options.enableLog !== false;
  }

  /**
   * 发送文本消息
   * @param {string} content - 消息内容
   * @param {Array} mentionedList - @用户列表（手机号）
   * @param {Array} mentionedMobileList - @用户列表（userid）
   */
  async sendText(content, mentionedList = [], mentionedMobileList = []) {
    const payload = {
      msgtype: 'text',
      text: {
        content,
        mentioned_list: mentionedList,
        mentioned_mobile_list: mentionedMobileList
      }
    };

    return this._sendMessage(payload);
  }

  /**
   * 发送Markdown消息
   * @param {string} content - Markdown内容
   */
  async sendMarkdown(content) {
    const payload = {
      msgtype: 'markdown',
      markdown: {
        content
      }
    };

    return this._sendMessage(payload);
  }

  /**
   * 发送图文消息
   * @param {Array} articles - 图文列表
   */
  async sendNews(articles) {
    const payload = {
      msgtype: 'news',
      news: {
        articles: articles.map(article => ({
          title: article.title,
          description: article.description,
          url: article.url,
          picurl: article.picurl
        }))
      }
    };

    return this._sendMessage(payload);
  }

  /**
   * 发送文件消息
   * @param {string} mediaId - 文件media_id
   */
  async sendFile(mediaId) {
    const payload = {
      msgtype: 'file',
      file: {
        media_id: mediaId
      }
    };

    return this._sendMessage(payload);
  }

  /**
   * 核心发送方法（带重试机制）
   * @private
   */
  async _sendMessage(payload, attempt = 1) {
    try {
      if (this.enableLog) {
        this._log(`尝试发送消息 (第${attempt}次): ${payload.msgtype}`);
      }

      const response = await axios.post(this.webhookUrl, payload, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.errcode === 0) {
        if (this.enableLog) {
          this._log('消息发送成功');
        }
        return { success: true, data: response.data };
      } else {
        throw new Error(`企业微信API错误: ${response.data.errmsg} (错误码: ${response.data.errcode})`);
      }

    } catch (error) {
      if (this.enableLog) {
        this._log(`发送失败 (第${attempt}次): ${error.message}`, 'error');
      }

      // 重试逻辑
      if (attempt < this.retryCount) {
        await this._delay(this.retryDelay * attempt);
        return this._sendMessage(payload, attempt + 1);
      }

      // 最终失败
      const errorInfo = {
        success: false,
        error: error.message,
        attempt,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss')
      };

      this._logError(errorInfo);
      return errorInfo;
    }
  }

  /**
   * 延迟函数
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 日志记录
   * @private
   */
  _log(message, level = 'info') {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] [WeChatBot] ${message}`;
    
    if (level === 'error') {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * 错误日志记录
   * @private
   */
  _logError(errorInfo) {
    const logEntry = `${errorInfo.timestamp} - 企业微信推送失败: ${errorInfo.error} (尝试次数: ${errorInfo.attempt})\n`;
    fs.appendFileSync('./data/wechat_error.log', logEntry);
  }

  /**
   * 测试连接
   */
  async testConnection() {
    return this.sendText('🤖 企业微信机器人连接测试成功！');
  }

  /**
   * 格式化ETF策略消息
   * @param {Object} report - ETF报告数据
   * @param {Object} positionAnalysis - 持仓分析数据（可选）
   */
  formatETFReport(report, positionAnalysis = null) {
    const { summary, data } = report;
    
    // 构建Markdown格式的消息
    let content = `# 📊 ETF轮动策略报告\n\n`;
    content += `**报告时间**: ${report.date}\n\n`;
    
    // 持仓分析部分（如果有持仓数据）
    if (positionAnalysis && positionAnalysis.totalPositions > 0) {
      content += this._formatPositionAnalysis(positionAnalysis);
      content += `\n`;
    }
    
    // 核心推荐信息
    content += `## 🎯 策略推荐\n`;
    content += `- **推荐操作**: ${summary.推荐操作}\n`;
    content += `- **推荐标的**: ${summary.推荐标的}\n`;
    content += `- **市场趋势**: ${summary.市场趋势}\n\n`;
    
    // 前三强势ETF
    if (summary.前三强势 && summary.前三强势.length > 0) {
      content += `## 🏆 前三强势ETF\n`;
      summary.前三强势.forEach((etf, index) => {
        content += `${index + 1}. ${etf}\n`;
      });
      content += `\n`;
    }
    
    // 交易信号统计
    const buySignals = data.filter(d => d.交易信号.includes('买入'));
    const sellSignals = data.filter(d => d.交易信号.includes('卖出'));
    const holdSignals = data.filter(d => d.交易信号.includes('持有'));
    
    content += `## 📈 信号统计\n`;
    content += `- 🔵 买入信号: ${buySignals.length}个\n`;
    content += `- 🔴 卖出信号: ${sellSignals.length}个\n`;
    content += `- 🟢 持有信号: ${holdSignals.length}个\n\n`;
    
    // 重点关注（买入机会）
    if (buySignals.length > 0) {
      content += `## 💡 买入机会\n`;
      buySignals.slice(0, 5).forEach(etf => { // 增加到5个
        content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
        content += `  - 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
        content += `  - 风险等级: ${etf.风险等级}\n`;
        content += `  - 价格偏离: ${etf.价格偏离}\n`;
        content += `  - MA5均线: ¥${etf.MA5均线}\n`;
        content += `  - 波动率: ${etf.波动率}\n`;
      });
      content += `\n`;
    }
    
    // 特别关注提示
    if (report.specialWatchAlerts && report.specialWatchAlerts.length > 0) {
      try {
        const SpecialWatchManager = require('./specialWatch');
        const specialWatchManager = new SpecialWatchManager();
        content += specialWatchManager.formatAlertsText(report.specialWatchAlerts);
      } catch (error) {
        // 如果特别关注模块不可用，跳过
        console.log('特别关注模块不可用，跳过');
      }
    }

    // 风险提示
    const highRiskETFs = data.filter(d => d.风险等级.includes('高风险'));
    if (highRiskETFs.length > 0) {
      content += `## ⚠️ 风险提示\n`;
      content += `发现 ${highRiskETFs.length} 个高风险ETF，请谨慎操作\n\n`;
    }
    
    content += `---\n`;
    content += `*本报告由ETF轮动策略系统自动生成，仅供参考，投资有风险*`;
    
    return content;
  }

  /**
   * 格式化持仓分析用于企业微信
   * @private
   */
  _formatPositionAnalysis(positionAnalysis) {
    let content = `## 💼 持仓分析\n\n`;
    
    // 直接显示持仓详情，去除总体表现
    const { positions } = positionAnalysis;
    
    // 持仓详情
    if (positions && positions.length > 0) {
      content += `### 📋 持仓详情\n`;
      positions.forEach((position, index) => {
        const pnlIcon = position.pnl >= 0 ? '📈' : '📉';
        const statusIcon = this._getStatusIcon(position.status);
        
        content += `${index + 1}. **${position.name}** (${position.symbol}) ${statusIcon}\n`;
        content += `   - 成本: ¥${position.costPrice} | 现价: ¥${position.currentPrice}\n`;
        content += `   - 盈亏: ${pnlIcon} ¥${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)\n`;
        
        if (position.recommendation.targetPrice) {
          content += `   - 目标价: ¥${position.recommendation.targetPrice}\n`;
        }
        
        if (position.technicalAnalysis.technicalScore) {
          content += `   - 技术评分: ${position.technicalAnalysis.technicalScore}/100\n`;
        }
        
        if (position.recommendation.priority === 'high') {
          content += `   - ⚠️ **建议**: ${position.recommendation.action}\n`;
          content += `   - 💡 **原因**: ${position.recommendation.reason}\n`;
        }
        content += `\n`;
      });
    }
    
    // 投资建议
    if (positionAnalysis.recommendations && positionAnalysis.recommendations.length > 0) {
      content += `### 💡 投资建议\n`;
      positionAnalysis.recommendations.forEach((rec, index) => {
        const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        content += `${index + 1}. ${priorityIcon} **${rec.title}**\n`;
        content += `   ${rec.description}\n\n`;
      });
    }
    
    // 风险提示
    if (positionAnalysis.riskAssessment && positionAnalysis.riskAssessment.factors && positionAnalysis.riskAssessment.factors.length > 0) {
      content += `### ⚠️ 风险提示\n`;
      positionAnalysis.riskAssessment.factors.forEach(factor => {
        content += `- ${factor}\n`;
      });
      content += `\n`;
    }
    
    return content;
  }

  /**
   * 获取风险等级文本
   * @private
   */
  _getRiskLevelText(level) {
    const levelMap = {
      'low': '🟢 低风险',
      'medium': '🟡 中风险', 
      'high': '🔴 高风险'
    };
    return levelMap[level] || '❓ 未知';
  }

  /**
   * 获取状态图标
   * @private
   */
  _getStatusIcon(status) {
    const statusMap = {
      'excellent': '🌟',
      'good': '👍',
      'positive': '📈',
      'neutral': '➡️',
      'poor': '👎',
      'critical': '⚠️'
    };
    return statusMap[status] || '❓';
  }
}

module.exports = WeChatBot;
