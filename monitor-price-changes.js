#!/usr/bin/env node

// 价格变动监控脚本
const fs = require('fs');
const dayjs = require('dayjs');

// 颜色输出工具
const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m", cyan: "\x1b[36m"
};

function color(text, clr) { 
  return (COLORS[clr] || '') + text + COLORS.reset; 
}

const PRICE_CACHE_FILE = './data/auto_push_price_cache.json';
const AUTO_FLOAT_THRESHOLD = Number(process.env.AUTO_FLOAT_THRESHOLD) || 0.5;

console.log(color('📊 价格变动监控', 'bold'));
console.log(color(`⏰ 监控时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`, 'gray'));
console.log(color(`📏 浮动阈值: ${AUTO_FLOAT_THRESHOLD}%`, 'gray'));
console.log('');

// 读取当前报告
const reportPath = './data/reports/enhanced_etf_report.json';
if (!fs.existsSync(reportPath)) {
  console.log(color('❌ 报告文件不存在', 'red'));
  process.exit(1);
}

// 读取价格缓存
let priceCache = {};
if (fs.existsSync(PRICE_CACHE_FILE)) {
  try {
    priceCache = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, 'utf8'));
    console.log(color(`💾 加载价格缓存: ${Object.keys(priceCache).length} 个记录`, 'blue'));
  } catch (error) {
    console.log(color(`⚠️ 价格缓存加载失败: ${error.message}`, 'yellow'));
  }
} else {
  console.log(color('💾 价格缓存文件不存在', 'gray'));
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const buySignals = report.data.filter(d => d.交易信号 && d.交易信号.includes('买入'));

console.log(color(`📈 当前买入信号: ${buySignals.length} 个`, 'blue'));
console.log('');

if (buySignals.length === 0) {
  console.log(color('ℹ️ 没有买入信号', 'gray'));
  process.exit(0);
}

console.log(color('📋 价格变动分析:', 'bold'));

buySignals.forEach((signal, index) => {
  const cached = priceCache[signal.代码];
  const currentPrice = parseFloat(signal.当前价格);
  
  console.log(color(`${index + 1}. ${signal.代码} (${signal.名称 || 'N/A'})`, 'cyan'));
  console.log(color(`   💰 当前价格: ${currentPrice}`, 'gray'));
  
  if (cached) {
    const cachedPrice = parseFloat(cached.当前价格);
    const priceChange = Math.abs(currentPrice - cachedPrice) / cachedPrice * 100;
    const shouldTrigger = priceChange > AUTO_FLOAT_THRESHOLD;
    
    console.log(color(`   📊 缓存价格: ${cachedPrice} (${cached.cacheTime})`, 'gray'));
    console.log(color(`   📈 价格变动: ${priceChange.toFixed(4)}%`, 'gray'));
    console.log(color(`   🎯 触发推送: ${shouldTrigger ? '✅ 是' : '❌ 否'}`, shouldTrigger ? 'green' : 'red'));
    
    if (shouldTrigger) {
      console.log(color(`   🚀 推送原因: 价格变动 ${priceChange.toFixed(2)}% > 阈值 ${AUTO_FLOAT_THRESHOLD}%`, 'yellow'));
    }
  } else {
    console.log(color(`   📊 缓存价格: 无记录`, 'gray'));
    console.log(color(`   🎯 触发推送: ✅ 是 (首次推送)`, 'green'));
    console.log(color(`   🚀 推送原因: 首次检测到买入信号`, 'yellow'));
  }
  
  console.log('');
});

// 显示推送建议
console.log(color('💡 推送建议:', 'bold'));

const shouldPushSignals = buySignals.filter(signal => {
  const cached = priceCache[signal.代码];
  if (!cached) return true; // 首次推送
  
  const currentPrice = parseFloat(signal.当前价格);
  const cachedPrice = parseFloat(cached.当前价格);
  const priceChange = Math.abs(currentPrice - cachedPrice) / cachedPrice * 100;
  
  return priceChange > AUTO_FLOAT_THRESHOLD;
});

if (shouldPushSignals.length > 0) {
  console.log(color(`✅ 建议推送 ${shouldPushSignals.length} 个信号:`, 'green'));
  shouldPushSignals.forEach(signal => {
    console.log(color(`  - ${signal.代码}: ${signal.当前价格}`, 'green'));
  });
} else {
  console.log(color('ℹ️ 当前无需推送（价格变动未达到阈值）', 'gray'));
}

console.log('');
console.log(color('🔧 调试提示:', 'cyan'));
console.log(color('- 如需降低推送频率，增加 AUTO_FLOAT_THRESHOLD 值', 'gray'));
console.log(color('- 如需增加推送频率，减少 AUTO_FLOAT_THRESHOLD 值', 'gray'));
console.log(color('- 如需强制推送，设置 AUTO_ALLOW_REPEAT_PUSH=true', 'gray'));
console.log(color(`- 价格缓存文件: ${PRICE_CACHE_FILE}`, 'gray'));
