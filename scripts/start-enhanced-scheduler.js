#!/usr/bin/env node

// 增强版ETF策略定时推送启动脚本
const ETFScheduler = require('../src/core/scheduler');
const { CONFIG } = require('../src/core/config');

// 颜色输出工具
const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

function color(text, clr) { 
  return (COLORS[clr] || '') + text + COLORS.reset; 
}

console.log(color('🚀 启动ETF策略增强版定时推送系统...', 'blue'));
console.log(color('📊 集成技术指标、风险管理、多数据源等增强功能', 'gray'));
console.log('');

console.log(color('🎯 增强功能包括:', 'bold'));
console.log(color('  ✅ 技术指标分析 (RSI, MACD, 布林带)', 'green'));
console.log(color('  ✅ 多数据源自动切换', 'green'));
console.log(color('  ✅ 风险管理评估', 'green'));
console.log(color('  ✅ 增强信号生成', 'green'));
console.log(color('  ✅ 详细技术评分', 'green'));
console.log('');

console.log(color('⏰ 定时任务时间表:', 'yellow'));
console.log(color('  🌅 开盘前分析: 工作日 8:30', 'gray'));
console.log(color('  📈 盘中监控: 工作日 10:30, 14:30', 'gray'));
console.log(color('  🌆 收盘后总结: 工作日 15:30', 'gray'));
console.log(color('  📋 每日报告: 工作日 18:00', 'gray'));
console.log(color('  📊 周报: 每周五 19:00', 'gray'));
console.log('');

// ====== AUTO智能推送功能 ======
const AUTO_INTERVAL_MINUTES = Number(process.env.AUTO_INTERVAL_MINUTES) || 5; // 推送间隔（分钟）
const AUTO_FLOAT_THRESHOLD = Number(process.env.AUTO_FLOAT_THRESHOLD) || 0.5; // 浮动阈值（%）
let lastBuySignals = {};

async function checkAndPushBuyOpportunities(forcePush = false) {
  try {
    // 获取最新分析报告（假设ETFScheduler有getLatestReport方法，或可直接调用分析逻辑）
    const report = await (typeof scheduler.getLatestReport === 'function' ? scheduler.getLatestReport() : scheduler.analyzeNow());
    if (!report || !report.data) return;
    const buySignals = report.data.filter(d => d.交易信号 && d.交易信号.includes('买入'));
    let toPush = [];
    buySignals.forEach(signal => {
      const last = lastBuySignals[signal.代码];
      const priceFloat = last ? Math.abs(signal.当前价格 - last.当前价格) / last.当前价格 * 100 : 100;
      if (forcePush || !last || priceFloat > AUTO_FLOAT_THRESHOLD) {
        toPush.push(signal);
        lastBuySignals[signal.代码] = signal;
      }
    });
    if (toPush.length > 0) {
      // 推送企业微信（假设scheduler有sendWeChatNotification或可直接调用主策略推送函数）
      if (typeof scheduler.sendWeChatNotification === 'function') {
        await scheduler.sendWeChatNotification({ ...report, data: toPush });
      } else if (typeof sendWeChatNotification === 'function') {
        await sendWeChatNotification({ ...report, data: toPush });
      }
      console.log(color(`✅ 已推送${toPush.length}个买入机会到企业微信`, 'green'));
    } else {
      console.log(color('ℹ️ 无新买入机会，无需推送', 'gray'));
    }
  } catch (err) {
    console.error(color(`❌ 自动推送失败: ${err.message}`, 'red'));
  }
}

async function startEnhancedScheduler() {
  try {
    // 创建调度器实例并传入配置
    const scheduler = new ETFScheduler(CONFIG);
    await scheduler.start();

    // AUTO模式：首次立即推送，后续定时检查
    if (process.env.ENABLE_AUTO_PUSH === 'true') {
      console.log(color('🚦 AUTO智能推送模式已开启', 'yellow'));
      await checkAndPushBuyOpportunities(true); // 首次立即推送
      setInterval(() => {
        checkAndPushBuyOpportunities(false);
      }, AUTO_INTERVAL_MINUTES * 60 * 1000);
    }

    // 保持进程运行
    process.on('SIGINT', () => {
      console.log(color('\n🛑 接收到停止信号，正在关闭调度器...', 'yellow'));
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log(color('\n🛑 接收到终止信号，正在关闭调度器...', 'yellow'));
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error(color(`❌ 增强版定时任务启动失败: ${error.message}`, 'red'));
    process.exit(1);
  }
}

startEnhancedScheduler();
