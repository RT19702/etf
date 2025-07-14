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

async function startEnhancedScheduler() {
  try {
    // 创建调度器实例并传入配置
    const scheduler = new ETFScheduler(CONFIG);
    await scheduler.start();

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
