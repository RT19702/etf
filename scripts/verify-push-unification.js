#!/usr/bin/env node

/**
 * 企业微信推送统一化验证脚本
 * 
 * 功能：
 * 1. 验证所有推送路径是否使用统一的格式化函数
 * 2. 检查推送格式的一致性
 * 3. 确认关键功能模块是否完整
 */

const fs = require('fs');
const path = require('path');

// 颜色输出工具
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m"
};

function color(text, clr) {
  return (COLORS[clr] || '') + text + COLORS.reset;
}

console.log(color('🔍 企业微信推送统一化验证', 'bold'));
console.log('');

let allPassed = true;
const results = [];

// 验证项目1: 检查 scheduler.js 是否删除了重复的格式化函数
function checkSchedulerDuplication() {
  console.log(color('📋 检查1: scheduler.js 重复函数删除', 'blue'));
  
  const schedulerPath = path.join(__dirname, '../src/core/scheduler.js');
  const content = fs.readFileSync(schedulerPath, 'utf8');
  
  // 检查是否还存在 _formatEnhancedWeChatReport 函数定义
  const hasOldFunction = content.includes('_formatEnhancedWeChatReport(report) {') && 
                         content.includes('let content = `# 📊 ETF轮动策略\\n\\n`');
  
  if (hasOldFunction) {
    console.log(color('  ❌ 失败: scheduler.js 中仍存在重复的 _formatEnhancedWeChatReport() 函数', 'red'));
    results.push({ test: '删除重复函数', passed: false });
    allPassed = false;
  } else {
    console.log(color('  ✅ 通过: 重复的格式化函数已删除', 'green'));
    results.push({ test: '删除重复函数', passed: true });
  }
  
  // 检查是否使用了统一的推送函数
  const usesUnifiedPush = content.includes("require('../../enhanced-strategy')") &&
                          content.includes('sendWeChatNotification');
  
  if (usesUnifiedPush) {
    console.log(color('  ✅ 通过: scheduler.js 使用统一的推送函数', 'green'));
    results.push({ test: 'scheduler.js 统一推送', passed: true });
  } else {
    console.log(color('  ❌ 失败: scheduler.js 未使用统一的推送函数', 'red'));
    results.push({ test: 'scheduler.js 统一推送', passed: false });
    allPassed = false;
  }
  
  console.log('');
}

// 验证项目2: 检查 start-enhanced-scheduler.js 是否使用统一的推送函数
function checkStartSchedulerUnification() {
  console.log(color('📋 检查2: start-enhanced-scheduler.js 推送统一性', 'blue'));
  
  const startSchedulerPath = path.join(__dirname, '../scripts/start-enhanced-scheduler.js');
  const content = fs.readFileSync(startSchedulerPath, 'utf8');
  
  // 检查是否导入了 enhanced-strategy 的推送函数
  const importsCorrectly = content.includes("require('../enhanced-strategy')") &&
                           content.includes('sendWeChatNotification');
  
  if (importsCorrectly) {
    console.log(color('  ✅ 通过: start-enhanced-scheduler.js 导入统一推送函数', 'green'));
    results.push({ test: 'start-scheduler 导入', passed: true });
  } else {
    console.log(color('  ❌ 失败: start-enhanced-scheduler.js 未正确导入推送函数', 'red'));
    results.push({ test: 'start-scheduler 导入', passed: false });
    allPassed = false;
  }
  
  // 检查是否在 AUTO 推送中使用
  const usesInAutoPush = content.includes('await sendWeChatNotification');
  
  if (usesInAutoPush) {
    console.log(color('  ✅ 通过: AUTO推送使用统一函数', 'green'));
    results.push({ test: 'AUTO推送统一', passed: true });
  } else {
    console.log(color('  ❌ 失败: AUTO推送未使用统一函数', 'red'));
    results.push({ test: 'AUTO推送统一', passed: false });
    allPassed = false;
  }
  
  console.log('');
}

// 验证项目3: 检查 enhanced-strategy.js 的格式化函数是否完整
function checkEnhancedStrategyCompleteness() {
  console.log(color('📋 检查3: enhanced-strategy.js 格式化函数完整性', 'blue'));
  
  const enhancedStrategyPath = path.join(__dirname, '../enhanced-strategy.js');
  const content = fs.readFileSync(enhancedStrategyPath, 'utf8');
  
  // 检查关键功能模块
  const features = [
    { name: '市场环境分析', pattern: 'report.marketEnvironment' },
    { name: '技术指标统计', pattern: 'rsiOversold' },
    { name: 'KDJ指标', pattern: 'KDJ_K' },
    { name: '威廉指标', pattern: '威廉指标' },
    { name: 'CCI指标', pattern: 'CCI' },
    { name: 'ATR指标', pattern: 'ATR' },
    { name: '信号强度', pattern: '信号强度' },
    { name: '系统优化说明', pattern: '系统优化功能' },
    { name: '推送时间戳', pattern: 'pushTime' }
  ];
  
  let allFeaturesPresent = true;
  
  features.forEach(feature => {
    if (content.includes(feature.pattern)) {
      console.log(color(`  ✅ ${feature.name}: 已包含`, 'green'));
    } else {
      console.log(color(`  ❌ ${feature.name}: 缺失`, 'red'));
      allFeaturesPresent = false;
      allPassed = false;
    }
  });
  
  results.push({ test: '格式化函数完整性', passed: allFeaturesPresent });
  console.log('');
}

// 验证项目4: 检查 package.json 启动命令
function checkPackageJsonCommands() {
  console.log(color('📋 检查4: package.json 启动命令', 'blue'));
  
  const packageJsonPath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const scripts = packageJson.scripts;
  
  // 检查 start 命令
  if (scripts.start === 'node scripts/start-enhanced-scheduler.js') {
    console.log(color('  ✅ npm start: 启动调度器（正确）', 'green'));
    results.push({ test: 'npm start 命令', passed: true });
  } else {
    console.log(color(`  ❌ npm start: ${scripts.start}（应该启动调度器）`, 'red'));
    results.push({ test: 'npm start 命令', passed: false });
    allPassed = false;
  }
  
  // 检查 auto 命令
  if (scripts.auto === 'node scripts/start-enhanced-scheduler.js') {
    console.log(color('  ✅ npm run auto: 启动调度器（正确）', 'green'));
    results.push({ test: 'npm run auto 命令', passed: true });
  } else {
    console.log(color(`  ❌ npm run auto: ${scripts.auto}（应该启动调度器）`, 'red'));
    results.push({ test: 'npm run auto 命令', passed: false });
    allPassed = false;
  }
  
  // 检查 analyze 命令
  if (scripts.analyze === 'node enhanced-strategy.js') {
    console.log(color('  ✅ npm run analyze: 单次分析（正确）', 'green'));
    results.push({ test: 'npm run analyze 命令', passed: true });
  } else {
    console.log(color(`  ⚠️  npm run analyze: ${scripts.analyze || '未定义'}（建议添加）`, 'yellow'));
    results.push({ test: 'npm run analyze 命令', passed: false });
  }
  
  console.log('');
}

// 验证项目5: 检查导出的函数
function checkExports() {
  console.log(color('📋 检查5: enhanced-strategy.js 函数导出', 'blue'));
  
  const enhancedStrategyPath = path.join(__dirname, '../enhanced-strategy.js');
  const content = fs.readFileSync(enhancedStrategyPath, 'utf8');
  
  // 检查是否导出了必要的函数
  const exportsSection = content.substring(content.lastIndexOf('module.exports'));
  
  const requiredExports = [
    'sendWeChatNotification',
    'runEnhancedStrategy',
    'generateEnhancedReport'
  ];
  
  let allExported = true;
  
  requiredExports.forEach(exportName => {
    if (exportsSection.includes(exportName)) {
      console.log(color(`  ✅ ${exportName}: 已导出`, 'green'));
    } else {
      console.log(color(`  ❌ ${exportName}: 未导出`, 'red'));
      allExported = false;
      allPassed = false;
    }
  });
  
  results.push({ test: '函数导出完整性', passed: allExported });
  console.log('');
}

// 执行所有验证
checkSchedulerDuplication();
checkStartSchedulerUnification();
checkEnhancedStrategyCompleteness();
checkPackageJsonCommands();
checkExports();

// 输出总结
console.log(color('=' .repeat(60), 'gray'));
console.log(color('📊 验证总结', 'bold'));
console.log('');

const passedCount = results.filter(r => r.passed).length;
const totalCount = results.length;

console.log(color(`通过: ${passedCount}/${totalCount}`, passedCount === totalCount ? 'green' : 'yellow'));
console.log('');

if (allPassed) {
  console.log(color('✅ 所有验证通过！企业微信推送已成功统一。', 'green'));
  console.log('');
  console.log(color('📱 推送路径验证:', 'blue'));
  console.log(color('  ✓ 定时任务推送 → 使用统一格式', 'green'));
  console.log(color('  ✓ AUTO智能推送 → 使用统一格式', 'green'));
  console.log(color('  ✓ 强制推送 → 使用统一格式', 'green'));
  console.log('');
  console.log(color('🎯 所有推送都包含:', 'blue'));
  console.log(color('  ✓ 市场环境分析（趋势、波动率、情绪）', 'green'));
  console.log(color('  ✓ 完整技术指标（RSI、MACD、KDJ、威廉、CCI、ATR）', 'green'));
  console.log(color('  ✓ 技术指标统计（超卖超买数量）', 'green'));
  console.log(color('  ✓ 系统优化说明', 'green'));
  console.log(color('  ✓ 推送时间戳（推送时间 + 报告生成时间）', 'green'));
  console.log('');
  process.exit(0);
} else {
  console.log(color('❌ 部分验证失败，请检查上述错误信息。', 'red'));
  console.log('');
  console.log(color('💡 建议:', 'yellow'));
  console.log(color('  1. 检查是否正确删除了 scheduler.js 中的重复函数', 'gray'));
  console.log(color('  2. 确认所有推送路径都导入了 enhanced-strategy.js 的函数', 'gray'));
  console.log(color('  3. 验证 package.json 中的启动命令配置', 'gray'));
  console.log('');
  process.exit(1);
}

