// 📊 数据获取模块
const axios = require('axios');
const Bottleneck = require('bottleneck');
const fs = require('fs');
const path = require('path');
const { CONFIG } = require('./config');
const { financial, determinePriceDecimals } = require('../utils/priceUtils');

// API限制器
const limiter = new Bottleneck({
  minTime: CONFIG.apiRateLimit,
  maxConcurrent: CONFIG.maxConcurrentRequests
});

// 获取实时价格
async function fetchRealTimePrice(symbol) {
  try {
    const res = await limiter.schedule(() =>
      axios.get(`${CONFIG.REALTIME_API}?q=${symbol}`, { 
        timeout: CONFIG.requestTimeout 
      })
    );
    const match = res.data.match(/"(.*)"/);
    if (match) {
      const dataArray = match[1].split('~');
      const price = parseFloat(dataArray[3]);
      const decimals = determinePriceDecimals(price);
      return financial(price, decimals);
    }
    return null;
  } catch (error) {
    const logPath = path.join(__dirname, CONFIG.paths.logs, 'error.log');
    fs.appendFileSync(logPath, `实时价格获取失败: ${symbol} - ${error.message}\n`);
    return null;
  }
}

// 获取K线数据
async function fetchKline(symbol) {
  try {
    const res = await limiter.schedule(() =>
      axios.get(`${CONFIG.KLINE_API}?symbol=${symbol}&scale=240&datalen=${CONFIG.lookbackDays + 10}`, {
        timeout: CONFIG.requestTimeout
      })
    );
    return Array.isArray(res.data)
      ? res.data.reverse().map(d => ({ 
          date: d.day, 
          close: financial(d.close), 
          volume: parseFloat(d.volume || 0) 
        }))
      : [];
  } catch (error) {
    const logPath = path.join(__dirname, CONFIG.paths.logs, 'error.log');
    fs.appendFileSync(logPath, `K线获取失败: ${symbol} - ${error.message}\n`);
    return [];
  }
}

// 批量获取实时价格
async function fetchMultipleRealTimePrices(symbols) {
  const results = new Map();
  
  for (const symbol of symbols) {
    const price = await fetchRealTimePrice(symbol);
    if (price !== null) {
      results.set(symbol, price);
    }
  }
  
  return results;
}

// 获取市场数据
async function fetchMarketData(symbol = CONFIG.marketIndexSymbol) {
  try {
    const price = await fetchRealTimePrice(symbol);
    const kline = await fetchKline(symbol);
    
    return {
      symbol,
      currentPrice: price,
      klineData: kline,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`获取市场数据失败: ${symbol}`, error.message);
    return null;
  }
}

// 数据验证
function validatePriceData(symbol, price) {
  if (typeof price !== 'number' || isNaN(price)) {
    return { valid: false, reason: '价格不是有效数字' };
  }
  
  if (price <= 0) {
    return { valid: false, reason: '价格必须大于0' };
  }
  
  if (price > 10000) {
    return { valid: false, reason: '价格异常过高' };
  }
  
  return { valid: true };
}

// 缓存管理
class DataCache {
  constructor(ttl = 30000) { // 30秒缓存
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  clear() {
    this.cache.clear();
  }
}

const priceCache = new DataCache();

// 带缓存的价格获取
async function fetchRealTimePriceWithCache(symbol) {
  const cached = priceCache.get(symbol);
  if (cached) return cached;
  
  const price = await fetchRealTimePrice(symbol);
  if (price !== null) {
    priceCache.set(symbol, price);
  }
  
  return price;
}

module.exports = {
  fetchRealTimePrice,
  fetchKline,
  fetchMultipleRealTimePrices,
  fetchMarketData,
  fetchRealTimePriceWithCache,
  validatePriceData,
  financial,
  determinePriceDecimals,
  DataCache,
  limiter
};
