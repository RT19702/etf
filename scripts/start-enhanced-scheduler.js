#!/usr/bin/env node

// 增强版ETF策略定时推送启动脚本
const ETFScheduler = require('../src/core/scheduler');
const { CONFIG } = require('../src/core/config');
const dayjs = require('dayjs');
const fs = require('fs');
const PushManager = require('../src/utils/pushManager');
const pushManager = new PushManager();

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
const AUTO_ALLOW_REPEAT_PUSH = process.env.AUTO_ALLOW_REPEAT_PUSH === 'true'; // 是否允许重复推送（布尔值）
const ENABLE_AUTO_PUSH = process.env.ENABLE_AUTO_PUSH === 'true'; // 是否启用AUTO推送（布尔值）

// 价格历史缓存文件路径
const PRICE_CACHE_FILE = './data/auto_push_price_cache.json';

// 加载价格历史缓存
function loadPriceCache() {
  try {
    if (fs.existsSync(PRICE_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    console.log(color(`⚠️ 价格缓存加载失败: ${error.message}`, 'yellow'));
  }
  return {};
}

// 保存价格历史缓存
function savePriceCache(cache) {
  try {
    const dir = require('path').dirname(PRICE_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PRICE_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.log(color(`⚠️ 价格缓存保存失败: ${error.message}`, 'yellow'));
  }
}

let lastBuySignals = loadPriceCache(); // 从文件加载历史价格
let scheduler; // 全局声明scheduler

// 精简推送内容，仅保留关键信息
function formatSimplePushContent(signals) {
  if (!signals || signals.length === 0) return '无买入机会';
  let content = `【ETF买入机会推送】\n`;
  signals.forEach(s => {
    content += `- ${s.名称 || s.name || s.代码}: 当前价${s.当前价格}，信号：${s.交易信号}\n`;
  });
  return content;
}




async function checkAndPushBuyOpportunities(forcePush = false) {
  try {
    const now = dayjs();

    // 调试信息：显示环境变量配置
    if (!pushManager.shouldSuppressLogs(now) || forcePush) {
      console.log(color('🔍 AUTO推送调试信息:', 'cyan'));
      console.log(color(`  - ENABLE_AUTO_PUSH: ${ENABLE_AUTO_PUSH}`, 'gray'));
      console.log(color(`  - AUTO_ALLOW_REPEAT_PUSH: ${AUTO_ALLOW_REPEAT_PUSH}`, 'gray'));
      console.log(color(`  - AUTO_FLOAT_THRESHOLD: ${AUTO_FLOAT_THRESHOLD}%`, 'gray'));
      console.log(color(`  - forcePush: ${forcePush}`, 'gray'));
    }

    // 休息期不推送、不打印
    if (pushManager.shouldSuppressLogs(now) && !forcePush) {
      console.log(color('⏰ 非交易时间，跳过AUTO推送', 'gray'));
      return;
    }

    // 读取最新的增强版报告文件，避免重复执行策略分析
    const reportPath = './data/reports/enhanced_etf_report.json';
    if (!fs.existsSync(reportPath)) {
      if (!pushManager.shouldSuppressLogs(now)) {
        console.log(color('⚠️ 没有找到增强版报告文件，跳过推送', 'yellow'));
      }
      return;
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (!report || !report.data) {
      if (!pushManager.shouldSuppressLogs(now)) {
        console.log(color('⚠️ 报告文件无效，跳过推送', 'yellow'));
      }
      return;
    }

    const buySignals = report.data.filter(d => d.交易信号 && d.交易信号.includes('买入'));
    console.log(color(`📊 发现${buySignals.length}个买入信号`, 'blue'));

    // 合并去重，最多推送5个
    const mergedSignals = pushManager.mergeSignals(buySignals, 5);
    console.log(color(`🔄 合并后${mergedSignals.length}个信号`, 'blue'));

    let toPush = [];
    let cacheUpdated = false;

    mergedSignals.forEach(signal => {
      const last = lastBuySignals[signal.代码];

      // 确保价格为数值类型
      const currentPrice = parseFloat(signal.当前价格);
      const lastPrice = last ? parseFloat(last.当前价格) : null;

      // 计算价格变动百分比
      let priceFloat = 100; // 默认100%（首次推送）
      if (last && !isNaN(lastPrice) && !isNaN(currentPrice) && lastPrice > 0) {
        priceFloat = Math.abs(currentPrice - lastPrice) / lastPrice * 100;
      }

      // 详细的条件判断日志
      const conditions = {
        forcePush: forcePush,
        noLastRecord: !last,
        priceChanged: priceFloat > AUTO_FLOAT_THRESHOLD,
        allowRepeat: AUTO_ALLOW_REPEAT_PUSH
      };

      const shouldPush = forcePush || !last || priceFloat > AUTO_FLOAT_THRESHOLD || AUTO_ALLOW_REPEAT_PUSH;

      if (!pushManager.shouldSuppressLogs(now)) {
        console.log(color(`  📈 ${signal.代码} (${signal.名称 || signal.name}):`, 'gray'));
        console.log(color(`    - 当前价格: ${currentPrice} (${typeof signal.当前价格}: "${signal.当前价格}")`, 'gray'));
        if (last) {
          console.log(color(`    - 历史价格: ${lastPrice} (缓存时间: ${last.cacheTime || '未知'})`, 'gray'));
          console.log(color(`    - 价格差异: ${Math.abs(currentPrice - lastPrice).toFixed(6)}`, 'gray'));
        } else {
          console.log(color(`    - 历史价格: 无记录`, 'gray'));
        }
        console.log(color(`    - 价格变动: ${priceFloat.toFixed(4)}%`, 'gray'));
        console.log(color(`    - 浮动阈值: ${AUTO_FLOAT_THRESHOLD}%`, 'gray'));
        console.log(color(`    - 条件检查: forcePush=${conditions.forcePush}, noLast=${conditions.noLastRecord}, priceChanged=${conditions.priceChanged}, allowRepeat=${conditions.allowRepeat}`, 'gray'));
        console.log(color(`    - 推送决定: ${shouldPush ? '✅ 推送' : '❌ 跳过'}`, shouldPush ? 'green' : 'red'));
      }

      if (shouldPush) {
        toPush.push(signal);
        // 更新价格缓存，添加时间戳
        lastBuySignals[signal.代码] = {
          ...signal,
          cacheTime: now.format('YYYY-MM-DD HH:mm:ss')
        };
        cacheUpdated = true;
      }
    });

    // 保存更新的价格缓存
    if (cacheUpdated) {
      savePriceCache(lastBuySignals);
    }

    // 精简推送内容
    const pushContent = formatSimplePushContent(toPush);
    console.log(color(`📝 准备推送${toPush.length}个信号`, 'blue'));

    // 频控与类型判断
    const canPush = pushManager.canPush('wechat', 'normal', now);
    if (!canPush.allow) {
      console.log(color(`🚫 频率控制阻止推送: ${canPush.reason}`, 'yellow'));
      return;
    }
    console.log(color('✅ 频率控制检查通过', 'green'));

    // 内容去重
    if (pushManager.isDuplicateContent(pushContent, now)) {
      console.log(color('🚫 内容去重阻止推送: 内容重复', 'yellow'));
      return;
    }
    console.log(color('✅ 内容去重检查通过', 'green'));

    if (toPush.length > 0) {
      // 使用增强版策略的推送函数
      const { sendWeChatNotification } = require('../enhanced-strategy');
      await sendWeChatNotification({ ...report, data: toPush, _simpleContent: pushContent });

      pushManager.markPushed('wechat', pushContent, [], now);
      if (!pushManager.shouldSuppressLogs(now)) {
        console.log(color(`✅ AUTO模式推送${toPush.length}个买入机会`, 'green'));
      }
    } else {
      if (!pushManager.shouldSuppressLogs(now)) {
        console.log(color('ℹ️ 无新买入机会，无需推送', 'gray'));
      }
    }
  } catch (err) {
    if (!pushManager.shouldSuppressLogs(dayjs())) {
      console.error(color(`❌ 自动推送失败: ${err.message}`, 'red'));
    }
  }
}

async function startEnhancedScheduler() {
  try {
    // 创建调度器实例并传入配置
    scheduler = new ETFScheduler(CONFIG);
    await scheduler.start();

    // AUTO模式：定时检查买入机会（避免与调度器启动推送重复）
    if (ENABLE_AUTO_PUSH) {
      console.log(color('🚦 AUTO智能推送模式已开启', 'yellow'));
      console.log(color(`⏰ 将每${AUTO_INTERVAL_MINUTES}分钟检查买入机会`, 'gray'));

      // 延迟启动AUTO推送，避免与调度器启动推送冲突
      setTimeout(() => {
        setInterval(() => {
          checkAndPushBuyOpportunities(false);
        }, AUTO_INTERVAL_MINUTES * 60 * 1000);
      }, 30000); // 延迟30秒启动
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
