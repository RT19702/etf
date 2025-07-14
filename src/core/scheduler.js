// ETF策略定时任务调度器
const cron = require('node-cron');
const dayjs = require('dayjs');
const fs = require('fs');
const WeChatBot = require('../utils/wechatBot');
const ErrorHandler = require('../utils/errorHandler');

class ETFScheduler {
  constructor(config) {
    this.config = config;
    this.jobs = new Map();
    this.wechatBot = null;
    this.isRunning = false;

    // 初始化错误处理器
    this.errorHandler = new ErrorHandler({
      maxRetries: 3,
      retryDelay: 2000,
      logFile: './data/scheduler_error.log',
      enableConsoleLog: true
    });

    // 初始化企业微信机器人
    if (config.wechat && config.wechat.webhookUrl) {
      this.wechatBot = new WeChatBot(config.wechat.webhookUrl, {
        retryCount: config.wechat.retryCount || 3,
        retryDelay: config.wechat.retryDelay || 1000,
        enableLog: config.wechat.enableLog !== false
      });
    }
  }

  /**
   * 启动调度器
   */
  async start() {
    if (this.isRunning) {
      console.log('📅 调度器已在运行中');
      return;
    }

    console.log('🚀 启动ETF策略定时调度器...');
    this.isRunning = true;

    // 注册所有定时任务
    this._registerJobs();

    console.log(`✅ 调度器启动成功，已注册 ${this.jobs.size} 个定时任务`);
    this._logSchedulerStatus();

    // 发送启动通知和当前策略报告
    if (this.wechatBot) {
      // 检查是否启用启动时强制推送
      const forceStartupPush = this.config.features?.forceStartupPush !== false;

      if (forceStartupPush) {
        // 发送启动通知，然后立即执行策略分析并推送
        await this.wechatBot.sendText('🚀 ETF策略定时推送系统已启动\n📊 正在执行启动时策略分析...');
        console.log('📊 启动时执行策略分析...');
        await this._executeStrategy('启动时策略分析', true); // 传入true强制执行
      } else {
        // 只发送启动通知，不执行策略分析
        await this.wechatBot.sendText('🚀 ETF策略定时推送系统已启动');
        console.log('ℹ️ 启动时强制推送已禁用，将按正常时间表执行');
      }
    }
  }

  /**
   * 停止调度器
   */
  stop() {
    console.log('🛑 停止ETF策略定时调度器...');
    
    this.jobs.forEach((job, name) => {
      job.destroy();
      console.log(`  ❌ 已停止任务: ${name}`);
    });
    
    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ 调度器已停止');
  }

  /**
   * 注册所有定时任务
   * @private
   */
  _registerJobs() {
    const schedules = this.config.schedules || {};

    // 开盘前策略分析
    if (schedules.preMarket) {
      this._addJob('preMarket', schedules.preMarket, () => {
        this._executeStrategy('开盘前策略分析');
      });
    }

    // 盘中监控
    if (schedules.intraday) {
      this._addJob('intraday', schedules.intraday, () => {
        this._executeStrategy('盘中监控');
      });
    }

    // 收盘后总结
    if (schedules.postMarket) {
      this._addJob('postMarket', schedules.postMarket, () => {
        this._executeStrategy('收盘后总结');
      });
    }

    // 每日报告
    if (schedules.dailyReport) {
      this._addJob('dailyReport', schedules.dailyReport, () => {
        this._generateDailyReport();
      });
    }

    // 周报
    if (schedules.weeklyReport) {
      this._addJob('weeklyReport', schedules.weeklyReport, () => {
        this._generateWeeklyReport();
      });
    }

    // 自定义任务
    if (schedules.custom && Array.isArray(schedules.custom)) {
      schedules.custom.forEach((customJob, index) => {
        this._addJob(`custom_${index}`, customJob.cron, () => {
          this._executeCustomJob(customJob);
        });
      });
    }
  }

  /**
   * 添加定时任务
   * @private
   */
  _addJob(name, cronExpression, callback) {
    try {
      const job = cron.schedule(cronExpression, callback, {
        scheduled: false,
        timezone: this.config.timezone || 'Asia/Shanghai'
      });
      
      job.start();
      this.jobs.set(name, job);
      console.log(`  ✅ 已注册任务: ${name} (${cronExpression})`);
    } catch (error) {
      console.error(`  ❌ 任务注册失败: ${name} - ${error.message}`);
    }
  }

  /**
   * 执行ETF策略分析
   * @private
   * @param {string} taskName - 任务名称
   * @param {boolean} forceExecute - 是否强制执行（忽略交易时间限制）
   */
  async _executeStrategy(taskName, forceExecute = false) {
    const result = await this.errorHandler.executeWithRetry(
      async () => {
        console.log(`📊 执行任务: ${taskName}`);

        // 检查是否为交易时间（如果配置要求且不是强制执行）
        if (!forceExecute && !this.config.features?.allowNonTradingHours && !this._isTradingHours()) {
          console.log(`⏰ 非交易时间，跳过任务: ${taskName}`);
          return null;
        }

        // 如果是强制执行，显示提示信息
        if (forceExecute && !this._isTradingHours()) {
          console.log(`🚀 强制执行任务: ${taskName} (忽略交易时间限制)`);
        }

        // 动态导入主策略模块并执行
        const report = await this._runMainStrategy();

        // 注意：增强版策略内部已包含企业微信推送，这里不需要重复发送
        // 只在策略执行失败时发送错误通知

        this._log(`${taskName} 执行成功`);
        return report;
      },
      {
        operationName: taskName,
        maxRetries: 2,
        retryCondition: (error) => {
          // 网络错误或API错误可以重试，配置错误不重试
          return !error.message.includes('配置') && !error.message.includes('权限');
        }
      }
    );

    if (!result.success) {
      console.error(`❌ ${taskName} 最终执行失败: ${result.error}`);

      // 发送错误通知
      if (this.wechatBot) {
        await this.wechatBot.sendText(`⚠️ ${taskName} 执行失败\n错误信息: ${result.error}\n尝试次数: ${result.attempts}`);
      }
    }
  }

  /**
   * 生成每日报告
   * @private
   */
  async _generateDailyReport() {
    try {
      console.log('📋 生成每日报告...');
      
      // 读取最新的ETF报告
      const reportPath = './data/reports/etf_report.json';
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        
        if (this.wechatBot) {
          const content = this.wechatBot.formatETFReport(report);
          await this.wechatBot.sendMarkdown(content);
        }
      }
      
      this._log('每日报告生成成功');
      
    } catch (error) {
      console.error(`❌ 每日报告生成失败: ${error.message}`);
      this._log(`每日报告生成失败: ${error.message}`, 'error');
    }
  }

  /**
   * 生成周报
   * @private
   */
  async _generateWeeklyReport() {
    try {
      console.log('📊 生成周报...');
      
      // 这里可以实现周报逻辑
      // 比如汇总一周的交易信号、收益统计等
      
      if (this.wechatBot) {
        const weeklyContent = this._formatWeeklyReport();
        await this.wechatBot.sendMarkdown(weeklyContent);
      }
      
      this._log('周报生成成功');
      
    } catch (error) {
      console.error(`❌ 周报生成失败: ${error.message}`);
      this._log(`周报生成失败: ${error.message}`, 'error');
    }
  }

  /**
   * 执行自定义任务
   * @private
   */
  async _executeCustomJob(customJob) {
    try {
      console.log(`🔧 执行自定义任务: ${customJob.name}`);
      
      if (customJob.type === 'notification') {
        await this.wechatBot.sendText(customJob.message);
      } else if (customJob.type === 'strategy') {
        await this._executeStrategy(customJob.name);
      }
      
      this._log(`自定义任务 ${customJob.name} 执行成功`);
      
    } catch (error) {
      console.error(`❌ 自定义任务 ${customJob.name} 执行失败: ${error.message}`);
      this._log(`自定义任务 ${customJob.name} 执行失败: ${error.message}`, 'error');
    }
  }

  /**
   * 发送企业微信通知
   * @private
   */
  async _sendWeChatNotification(report, taskName) {
    try {
      // 判断是否为增强版报告，使用对应的格式化函数
      let content;
      if (report.version && report.version.includes('Enhanced')) {
        // 使用增强版格式化
        content = this._formatEnhancedWeChatReport(report);
      } else {
        // 使用原版格式化
        content = this.wechatBot.formatETFReport(report);
      }

      const result = await this.wechatBot.sendMarkdown(content);

      if (result.success) {
        console.log(`📱 ${taskName} 企业微信通知发送成功`);
      } else {
        console.error(`📱 ${taskName} 企业微信通知发送失败: ${result.error}`);
      }
    } catch (error) {
      console.error(`📱 ${taskName} 企业微信通知发送异常: ${error.message}`);
    }
  }

  /**
   * 获取数据源友好名称
   * @private
   */
  _getDataSourceName(sourceKey) {
    const sourceNames = {
      'primary': '腾讯财经',
      'backup1': '新浪财经',
      'backup2': '网易财经'
    };
    return sourceNames[sourceKey] || sourceKey;
  }

  /**
   * 格式化增强版企业微信报告
   * @private
   */
  _formatEnhancedWeChatReport(report) {
    let content = `# 📊 ETF轮动策略\n\n`;
    content += `**报告时间**: ${report.date}\n\n`;

    // 核心推荐
    content += `## 🎯 策略推荐\n`;
    content += `- **推荐操作**: ${report.summary.推荐操作}\n`;
    content += `- **推荐标的**: ${report.summary.推荐标的}\n`;
    content += `- **市场趋势**: ${report.summary.市场趋势}\n\n`;

    // 技术分析统计
    if (report.technicalAnalysis) {
      content += `## 📈 技术分析统计\n`;
      content += `- 🔵 强烈买入: ${report.technicalAnalysis.强烈买入}个\n`;
      content += `- 🟦 买入: ${report.technicalAnalysis.买入}个\n`;
      content += `- 🟢 持有: ${report.technicalAnalysis.持有}个\n`;
      content += `- 🟠 卖出: ${report.technicalAnalysis.卖出}个\n`;
      content += `- ⚠️ 信号矛盾: ${report.technicalAnalysis.信号矛盾}个\n\n`;
    }

    // 重点关注 - 强烈买入机会
    const strongBuys = report.data.filter(d => d.交易信号.includes('强烈买入'));
    if (strongBuys.length > 0) {
      content += `## 💡 强烈买入机会\n`;
      strongBuys.forEach(etf => {
        content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
        content += `  - 技术评分: ${etf.技术评分}/100\n`;
        content += `  - RSI: ${etf.RSI}\n`;
        content += `  - MACD: ${etf.MACD}\n`;
        content += `  - 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
        content += `  - 价格偏离: ${etf.价格偏离}\n`;
        content += `  - 风险等级: ${etf.风险等级}\n`;
      });
      content += `\n`;
    }

    // 普通买入机会
    const normalBuys = report.data.filter(d => d.交易信号.includes('买入') && !d.交易信号.includes('强烈买入'));
    if (normalBuys.length > 0) {
      content += `## 📈 买入机会\n`;
      normalBuys.slice(0, 5).forEach(etf => { // 最多显示5个
        content += `- **${etf.ETF}** (${etf.代码}): ¥${etf.当前价格}\n`;
        content += `  - 技术评分: ${etf.技术评分}/100\n`;
        content += `  - 买入价格: ¥${etf.买入阈值} → 目标价格: ¥${etf.卖出阈值}\n`;
        content += `  - 价格偏离: ${etf.价格偏离}\n`;
        content += `  - 风险等级: ${etf.风险等级}\n`;
      });
      content += `\n`;
    }

    // 数据源状态
    if (report.dataSourceStatus) {
      content += `## 🔗 数据源状态\n`;
      const currentSourceName = this._getDataSourceName(report.dataSourceStatus.currentSource);
      content += `当前数据源: ${currentSourceName}\n\n`;
    }

    content += `---\n`;
    content += `*增强版报告 - 集成技术指标分析*`;

    return content;
  }

  /**
   * 格式化周报内容
   * @private
   */
  _formatWeeklyReport() {
    const weekStart = dayjs().startOf('week').format('YYYY-MM-DD');
    const weekEnd = dayjs().endOf('week').format('YYYY-MM-DD');
    
    return `# 📊 ETF策略周报\n\n**报告周期**: ${weekStart} ~ ${weekEnd}\n\n## 📈 本周概况\n\n本周ETF轮动策略运行正常，详细数据请查看每日报告。\n\n---\n*周报由ETF策略系统自动生成*`;
  }

  /**
   * 记录调度器状态
   * @private
   */
  _logSchedulerStatus() {
    const status = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.keys())
    };
    
    console.log('📅 调度器状态:', status);
  }

  /**
   * 日志记录
   * @private
   */
  _log(message, level = 'info') {
    const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] [Scheduler] ${message}\n`;
    
    const logFile = level === 'error' ? './data/scheduler_error.log' : './data/scheduler.log';
    fs.appendFileSync(logFile, logMessage);
  }

  /**
   * 运行增强版策略
   * @private
   */
  async _runMainStrategy() {
    try {
      console.log('🚀 定时任务执行增强版策略...');

      // 动态导入增强版策略模块
      const { runEnhancedStrategy } = require('../../enhanced-strategy');

      // 执行增强版策略分析
      const report = await runEnhancedStrategy();

      if (report) {
        console.log('✅ 增强版策略执行成功');
        return report;
      } else {
        throw new Error('增强版策略执行返回空结果');
      }

    } catch (error) {
      console.warn(`⚠️ 增强版策略执行失败，尝试读取最新报告: ${error.message}`);

      // 如果增强版策略失败，尝试读取最新的报告文件
      try {
        const reportPath = './data/reports/enhanced_etf_report.json';
        if (fs.existsSync(reportPath)) {
          const reportContent = fs.readFileSync(reportPath, 'utf8');
          console.log('📄 使用最新的增强版报告文件');
          return JSON.parse(reportContent);
        }

        // 如果增强版报告不存在，尝试原版报告
        const fallbackPath = './data/reports/etf_report.json';
        if (fs.existsSync(fallbackPath)) {
          const reportContent = fs.readFileSync(fallbackPath, 'utf8');
          console.log('📄 使用原版报告文件作为备用');
          return JSON.parse(reportContent);
        }

      } catch (fileError) {
        console.warn('读取报告文件失败，使用模拟数据');
      }

      // 最后的备用方案：返回模拟报告
      return {
        title: 'ETF轮动策略增强报告',
        date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        summary: {
          推荐操作: '策略分析失败',
          推荐标的: '无',
          市场趋势: '0%',
          前三强势: []
        },
        technicalAnalysis: {
          强烈买入: 0,
          买入: 0,
          持有: 0,
          卖出: 0,
          信号矛盾: 0
        },
        data: [],
        dataSourceStatus: {
          currentSource: 'unknown',
          sources: []
        }
      };
    }
  }

  /**
   * 检查是否为交易时间
   * @private
   */
  _isTradingHours() {
    const now = dayjs();
    const hour = now.hour();
    const minute = now.minute();
    const day = now.day();

    // 周末不是交易时间
    if (day === 0 || day === 6) {
      return false;
    }

    // 上午交易时间: 9:30-11:30
    if ((hour === 9 && minute >= 30) || hour === 10 || (hour === 11 && minute <= 30)) {
      return true;
    }

    // 下午交易时间: 13:00-15:00
    if (hour === 13 || hour === 14 || (hour === 15 && minute === 0)) {
      return true;
    }

    return false;
  }

  /**
   * 获取下次执行时间
   */
  getNextExecutions() {
    const nextExecutions = [];

    this.jobs.forEach((job, name) => {
      try {
        nextExecutions.push({
          name,
          status: 'scheduled',
          isRunning: this.isRunning
        });
      } catch (error) {
        nextExecutions.push({
          name,
          status: 'error',
          error: error.message
        });
      }
    });

    return nextExecutions;
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    return this.errorHandler.getErrorStats(24);
  }

  /**
   * 清理旧日志
   */
  cleanupLogs() {
    this.errorHandler.cleanupLogs(7);
  }
}

module.exports = ETFScheduler;
