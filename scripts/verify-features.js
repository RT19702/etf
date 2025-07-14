// 🧪 功能验证脚本
require('dotenv').config({ path: './config/.env' });
const fs = require('fs');

function color(text, clr) {
  const colors = {
    reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
    yellow: "\x1b[33m", blue: "\x1b[34m", gray: "\x1b[90m", bold: "\x1b[1m"
  };
  return (colors[clr] || '') + text + colors.reset;
}

async function verifyFeatures() {
  console.log(color('🧪 ETF策略系统功能验证', 'bold'));
  console.log('');

  let allPassed = true;

  // 1. 检查配置文件
  console.log(color('1. 检查配置文件...', 'yellow'));
  
  if (fs.existsSync('config/.env')) {
    console.log(color('  ✅ config/.env 文件存在', 'green'));
  } else {
    console.log(color('  ❌ config/.env 文件不存在', 'red'));
    console.log(color('     请运行: cp config/.env.example config/.env', 'gray'));
    allPassed = false;
  }

  if (fs.existsSync('config/.env.example')) {
    console.log(color('  ✅ config/.env.example 模板文件存在', 'green'));
  } else {
    console.log(color('  ❌ config/.env.example 模板文件不存在', 'red'));
    allPassed = false;
  }

  // 2. 检查企业微信配置
  console.log(color('\n2. 检查企业微信配置...', 'yellow'));
  
  const webhookUrl = process.env.WECHAT_WEBHOOK_URL;
  if (webhookUrl && webhookUrl !== 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_WEBHOOK_KEY_HERE') {
    console.log(color('  ✅ 企业微信Webhook URL已配置', 'green'));
  } else {
    console.log(color('  ⚠️ 企业微信Webhook URL未配置或使用默认值', 'yellow'));
    console.log(color('     请在config/.env中配置您的真实Webhook URL', 'gray'));
  }

  if (process.env.ENABLE_WECHAT_PUSH === 'true') {
    console.log(color('  ✅ 企业微信推送已启用', 'green'));
  } else {
    console.log(color('  ⚠️ 企业微信推送未启用', 'yellow'));
  }

  if (process.env.FORCE_STARTUP_PUSH === 'true') {
    console.log(color('  ✅ 启动时强制推送已启用', 'green'));
  } else {
    console.log(color('  ⚠️ 启动时强制推送未启用', 'yellow'));
    console.log(color('     非交易时间启动将不会推送', 'gray'));
  }

  // 3. 检查特别关注配置
  console.log(color('\n3. 检查特别关注配置...', 'yellow'));
  
  if (process.env.ENABLE_SPECIAL_WATCH === 'true') {
    console.log(color('  ✅ 特别关注功能已启用', 'green'));
  } else {
    console.log(color('  ⚠️ 特别关注功能未启用', 'yellow'));
  }

  try {
    const watchList = JSON.parse(process.env.SPECIAL_WATCH_LIST || '[]');
    if (watchList.length > 0) {
      console.log(color(`  ✅ 已配置 ${watchList.length} 个特别关注ETF`, 'green'));
      watchList.forEach((item, index) => {
        console.log(color(`     ${index + 1}. ${item.name} (${item.priority}优先级)`, 'gray'));
      });
    } else {
      console.log(color('  ⚠️ 未配置特别关注ETF', 'yellow'));
    }
  } catch (error) {
    console.log(color('  ❌ 特别关注配置格式错误', 'red'));
    allPassed = false;
  }

  // 4. 检查ETF列表配置
  console.log(color('\n4. 检查ETF列表配置...', 'yellow'));
  
  try {
    const etfList = JSON.parse(process.env.ETF_SYMBOLS_JSON || '[]');
    if (etfList.length > 0) {
      console.log(color(`  ✅ 已配置 ${etfList.length} 个ETF标的`, 'green'));
    } else {
      console.log(color('  ❌ 未配置ETF标的', 'red'));
      allPassed = false;
    }
  } catch (error) {
    console.log(color('  ❌ ETF列表配置格式错误', 'red'));
    allPassed = false;
  }

  // 5. 检查Git安全配置
  console.log(color('\n5. 检查Git安全配置...', 'yellow'));
  
  if (fs.existsSync('.gitignore')) {
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    if (gitignoreContent.includes('config/.env')) {
      console.log(color('  ✅ .gitignore 已配置保护敏感文件', 'green'));
    } else {
      console.log(color('  ⚠️ .gitignore 可能未完全保护敏感文件', 'yellow'));
    }
  } else {
    console.log(color('  ❌ .gitignore 文件不存在', 'red'));
    allPassed = false;
  }

  // 6. 检查必要目录
  console.log(color('\n6. 检查必要目录...', 'yellow'));
  
  const requiredDirs = ['src', 'config', 'scripts', 'docs'];
  requiredDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      console.log(color(`  ✅ ${dir}/ 目录存在`, 'green'));
    } else {
      console.log(color(`  ❌ ${dir}/ 目录不存在`, 'red'));
      allPassed = false;
    }
  });

  // 7. 检查核心模块
  console.log(color('\n7. 检查核心模块...', 'yellow'));
  
  try {
    const SpecialWatchManager = require('../src/utils/specialWatch');
    const manager = new SpecialWatchManager();
    console.log(color('  ✅ 特别关注模块加载成功', 'green'));
    console.log(color(`     启用状态: ${manager.enabled}`, 'gray'));
    console.log(color(`     关注列表: ${manager.watchList.length} 项`, 'gray'));
  } catch (error) {
    console.log(color('  ❌ 特别关注模块加载失败', 'red'));
    console.log(color(`     错误: ${error.message}`, 'gray'));
    allPassed = false;
  }

  // 8. 检查最新报告
  console.log(color('\n8. 检查最新报告...', 'yellow'));
  
  if (fs.existsSync('data/reports/enhanced_etf_report.json')) {
    try {
      const report = JSON.parse(fs.readFileSync('data/reports/enhanced_etf_report.json', 'utf8'));
      console.log(color('  ✅ 最新增强报告存在', 'green'));
      console.log(color(`     报告时间: ${report.date}`, 'gray'));
      
      if (report.specialWatchAlerts && report.specialWatchAlerts.length > 0) {
        console.log(color(`     特别关注提示: ${report.specialWatchAlerts.length} 个`, 'green'));
        report.specialWatchAlerts.forEach(alert => {
          console.log(color(`       - ${alert.name}: ${alert.triggeredConditions.map(c => c.message).join(', ')}`, 'gray'));
        });
      } else {
        console.log(color('     特别关注提示: 无', 'gray'));
      }
    } catch (error) {
      console.log(color('  ⚠️ 报告文件格式错误', 'yellow'));
    }
  } else {
    console.log(color('  ⚠️ 最新报告不存在，请先运行策略', 'yellow'));
  }

  // 总结
  console.log(color('\n📋 验证总结', 'bold'));
  if (allPassed) {
    console.log(color('✅ 所有核心功能验证通过！', 'green'));
    console.log(color('🚀 系统已准备就绪，可以开始使用', 'green'));
  } else {
    console.log(color('⚠️ 发现一些问题，请根据上述提示进行修复', 'yellow'));
  }

  console.log(color('\n📚 相关文档:', 'bold'));
  console.log(color('- 安全配置指南: docs/SECURITY_GUIDE.md', 'gray'));
  console.log(color('- 命令使用说明: docs/COMMANDS.md', 'gray'));
  console.log(color('- 快速参考: QUICK_REFERENCE.md', 'gray'));
  
  console.log(color('\n🧪 推荐测试命令:', 'bold'));
  console.log(color('npm run quick-test    # 测试企业微信推送', 'gray'));
  console.log(color('npm run strategy      # 运行完整策略', 'gray'));
  console.log(color('npm run auto          # 启动定时推送', 'gray'));
}

verifyFeatures().catch(console.error);
