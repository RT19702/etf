#!/usr/bin/env node

// 企业微信配置设置脚本
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupWeChatConfig() {
  console.log('🤖 企业微信定时推送配置向导\n');
  
  console.log('📋 配置步骤：');
  console.log('1. 在企业微信群中添加机器人');
  console.log('2. 复制机器人的Webhook URL');
  console.log('3. 配置定时任务时间表');
  console.log('4. 测试连接\n');

  try {
    // 获取Webhook URL
    const webhookUrl = await question('请输入企业微信机器人的Webhook URL: ');
    
    if (!webhookUrl || !webhookUrl.includes('qyapi.weixin.qq.com')) {
      console.log('❌ 无效的Webhook URL，请检查后重试');
      process.exit(1);
    }

    // 询问是否启用定时任务
    const enableScheduler = await question('是否启用定时任务？(y/n) [y]: ');
    const schedulerEnabled = enableScheduler.toLowerCase() !== 'n';

    // 询问是否在非交易时间运行
    const allowNonTrading = await question('是否允许在非交易时间运行？(y/n) [n]: ');
    const nonTradingAllowed = allowNonTrading.toLowerCase() === 'y';

    // 读取现有配置
    const envPath = path.join(__dirname, '../config/.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // 更新配置
    const updates = {
      'WECHAT_WEBHOOK_URL': webhookUrl,
      'ENABLE_SCHEDULER': schedulerEnabled.toString(),
      'ENABLE_WECHAT_PUSH': 'true',
      'ALLOW_NON_TRADING_HOURS': nonTradingAllowed.toString()
    };

    Object.entries(updates).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    });

    // 保存配置
    fs.writeFileSync(envPath, envContent);
    console.log('\n✅ 配置已保存到 config/.env');

    // 测试连接
    const testConnection = await question('\n是否立即测试企业微信连接？(y/n) [y]: ');
    if (testConnection.toLowerCase() !== 'n') {
      console.log('\n🧪 正在测试企业微信连接...');
      
      // 动态导入测试模块
      try {
        require('./test-wechat.js');
      } catch (error) {
        console.error('❌ 测试失败:', error.message);
      }
    }

    console.log('\n🎉 企业微信配置完成！');
    console.log('\n📚 使用说明：');
    console.log('- 运行策略: npm start');
    console.log('- 启动定时推送: npm run scheduler');
    console.log('- 测试企业微信: npm run test-wechat');
    console.log('- 查看文档: docs/WECHAT_SCHEDULER_GUIDE.md');

  } catch (error) {
    console.error('❌ 配置过程中发生错误:', error.message);
  } finally {
    rl.close();
  }
}

// 运行配置向导
setupWeChatConfig();
