#!/usr/bin/env node

// 手动推送ETF策略报告到企业微信
require('dotenv').config({ path: './config/.env' });
const fs = require('fs');
const WeChatBot = require('../src/utils/wechatBot');

// 颜色输出工具
const COLORS = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
};

function color(text, clr) { 
  return (COLORS[clr] || '') + text + COLORS.reset; 
}

async function manualPush() {
  console.log(color('📱 手动推送ETF策略报告到企业微信', 'blue'));
  console.log('');

  try {
    // 检查企业微信配置
    if (!process.env.WECHAT_WEBHOOK_URL) {
      console.log(color('❌ 未配置企业微信Webhook URL', 'red'));
      console.log(color('💡 请先运行: npm run setup-wechat', 'yellow'));
      return;
    }

    // 检查报告文件是否存在
    const reportPath = './data/reports/etf_report.json';
    if (!fs.existsSync(reportPath)) {
      console.log(color('❌ 未找到策略报告文件', 'red'));
      console.log(color('💡 请先运行策略分析: npm run strategy', 'yellow'));
      return;
    }

    console.log(color('📊 读取最新策略报告...', 'yellow'));
    
    // 读取报告文件
    const reportContent = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(reportContent);

    console.log(color('🤖 初始化企业微信机器人...', 'yellow'));
    
    // 创建企业微信机器人实例
    const wechatBot = new WeChatBot(process.env.WECHAT_WEBHOOK_URL, {
      retryCount: Number(process.env.WECHAT_RETRY_COUNT) || 3,
      retryDelay: Number(process.env.WECHAT_RETRY_DELAY) || 1000,
      enableLog: process.env.WECHAT_ENABLE_LOG !== 'false'
    });

    console.log(color('📤 正在推送策略报告...', 'yellow'));
    
    // 格式化并发送报告
    const content = wechatBot.formatETFReport(report);
    const result = await wechatBot.sendMarkdown(content);

    if (result.success) {
      console.log(color('✅ 策略报告推送成功！', 'green'));
      console.log(color(`📅 报告时间: ${report.date}`, 'gray'));
      console.log(color(`📊 推荐操作: ${report.summary.推荐操作}`, 'gray'));
      console.log(color(`🎯 推荐标的: ${report.summary.推荐标的}`, 'gray'));
    } else {
      console.log(color(`❌ 推送失败: ${result.error}`, 'red'));
    }

  } catch (error) {
    console.error(color(`❌ 推送过程中发生错误: ${error.message}`, 'red'));
  }
}

// 运行手动推送
manualPush();
