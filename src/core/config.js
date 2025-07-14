// 📋 配置管理模块
require('dotenv').config({ path: './config/.env' });

const CONFIG = {
  // 基础策略参数
  lookbackDays: Number(process.env.LOOKBACK_DAYS) || 20,
  momentumWindow: Number(process.env.MOMENTUM_WINDOW) || 20,
  rotationThreshold: Number(process.env.ROTATION_THRESHOLD) || 1.0,
  marketTrendThreshold: Number(process.env.MARKET_TREND_THRESHOLD) || 0.5,
  minBuySellGap: Number(process.env.MIN_BUY_SELL_GAP) || 0.02,
  returnDecimals: Number(process.env.RETURN_DECIMALS || 2),

  // API配置
  REALTIME_API: process.env.REALTIME_API,
  KLINE_API: process.env.KLINE_API,
  marketIndexSymbol: process.env.MARKET_INDEX_SYMBOL || 'sh000300',

  // ETF配置
  symbols: JSON.parse(process.env.ETF_SYMBOLS_JSON || '[]'),
  
  // 实时策略参数
  updateInterval: Number(process.env.UPDATE_INTERVAL) || 30000,
  signalConfirmCount: Number(process.env.SIGNAL_CONFIRM_COUNT) || 3,
  maxPositionSize: Number(process.env.MAX_POSITION_SIZE) || 0.3,
  stopLossPercent: Number(process.env.STOP_LOSS_PERCENT) || 0.05,
  takeProfitPercent: Number(process.env.TAKE_PROFIT_PERCENT) || 0.15,
  
  // 数据获取优化
  apiRateLimit: Number(process.env.API_RATE_LIMIT) || 500,
  maxConcurrentRequests: Number(process.env.MAX_CONCURRENT_REQUESTS) || 5,
  requestTimeout: Number(process.env.REQUEST_TIMEOUT) || 5000,
  
  // 风险控制
  maxDailyTrades: Number(process.env.MAX_DAILY_TRADES) || 10,
  maxTotalPosition: Number(process.env.MAX_TOTAL_POSITION) || 0.8,
  volatilityThreshold: Number(process.env.VOLATILITY_THRESHOLD) || 3.0,
  
  // 交易时间设置
  tradingHours: {
    morning: { start: '09:30', end: '11:30' },
    afternoon: { start: '13:00', end: '15:00' }
  },
  
  // 企业微信配置
  wechat: {
    webhookUrl: process.env.WECHAT_WEBHOOK_URL,
    retryCount: Number(process.env.WECHAT_RETRY_COUNT) || 3,
    retryDelay: Number(process.env.WECHAT_RETRY_DELAY) || 1000,
    timeout: Number(process.env.WECHAT_TIMEOUT) || 10000,
    enableLog: process.env.WECHAT_ENABLE_LOG !== 'false',
    mentionedList: JSON.parse(process.env.WECHAT_MENTIONED_LIST || '[]'),
    mentionedMobileList: JSON.parse(process.env.WECHAT_MENTIONED_MOBILE_LIST || '[]')
  },

  // 定时任务配置
  scheduler: {
    timezone: process.env.SCHEDULER_TIMEZONE || 'Asia/Shanghai',
    enabled: process.env.ENABLE_SCHEDULER !== 'false',
    schedules: {
      preMarket: process.env.SCHEDULE_PRE_MARKET,
      intraday: process.env.SCHEDULE_INTRADAY,
      postMarket: process.env.SCHEDULE_POST_MARKET,
      dailyReport: process.env.SCHEDULE_DAILY_REPORT,
      weeklyReport: process.env.SCHEDULE_WEEKLY_REPORT
    }
  },

  // 功能开关
  features: {
    enableScheduler: process.env.ENABLE_SCHEDULER !== 'false',
    enableWeChatPush: process.env.ENABLE_WECHAT_PUSH !== 'false',
    allowNonTradingHours: process.env.ALLOW_NON_TRADING_HOURS === 'true',
    enableSpecialWatch: process.env.ENABLE_SPECIAL_WATCH !== 'false',
    forceStartupPush: process.env.FORCE_STARTUP_PUSH !== 'false'
  },

  // 特别关注配置
  specialWatch: {
    enabled: process.env.ENABLE_SPECIAL_WATCH !== 'false',
    maxAlerts: Number(process.env.MAX_WATCH_ALERTS) || 5,
    priorityOrder: (process.env.WATCH_PRIORITY_ORDER || 'high,medium,low').split(','),
    watchList: (() => {
      try {
        return JSON.parse(process.env.SPECIAL_WATCH_LIST || '[]');
      } catch (error) {
        console.warn('⚠️ 特别关注列表配置解析失败，使用空列表');
        return [];
      }
    })()
  },

  // 路径配置
  paths: {
    data: './data',
    reports: './data/reports',
    logs: './logs',
    config: './config'
  }
};

// 配置验证函数
function validateConfig() {
  const errors = [];

  // 验证企业微信配置
  if (CONFIG.features.enableWeChatPush && !CONFIG.wechat.webhookUrl) {
    errors.push('企业微信推送已启用但未配置 WECHAT_WEBHOOK_URL');
  }

  // 验证ETF标的配置
  if (!CONFIG.symbols || CONFIG.symbols.length === 0) {
    errors.push('未配置ETF标的或配置为空');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = { CONFIG, validateConfig };
