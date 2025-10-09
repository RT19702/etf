// 多数据源管理模块
const axios = require('axios');
const fs = require('fs');
const dayjs = require('dayjs');

class DataSourceManager {
  constructor(config = {}) {
    this.config = config;
    this.dataSources = {
      primary: {
        name: '腾讯财经',
        realtime: 'https://qt.gtimg.cn/q=',
        kline: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
        priority: 1,
        status: 'active'
      },
      backup1: {
        name: '新浪财经',
        realtime: 'https://hq.sinajs.cn/list=',
        kline: 'http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
        priority: 2,
        status: 'active'
      },
      backup2: {
        name: '东方财富',
        realtime: 'https://push2.eastmoney.com/api/qt/stock/get',
        kline: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
        priority: 3,
        status: 'active'
      },
      backup3: {
        name: '同花顺',
        realtime: 'https://d.10jqka.com.cn/v6/line/hs_',
        kline: 'https://d.10jqka.com.cn/v6/line/hs_',
        priority: 4,
        status: 'active'
      }
    };
    
    this.failureCount = new Map();
    this.lastSuccessTime = new Map();
    this.currentSource = 'primary';
  }
  
  /**
   * 获取实时价格数据
   * @param {string} symbol - 股票代码
   */
  async fetchRealTimePrice(symbol) {
    const sources = this.getAvailableSources();
    const results = [];

    // 并行请求多个数据源进行交叉验证
    const promises = sources.slice(0, 2).map(async (sourceKey) => {
      try {
        const startTime = Date.now();
        const price = await this.fetchFromSource(sourceKey, 'realtime', symbol);
        const responseTime = Date.now() - startTime;

        if (this.validatePriceData(price, symbol)) {
          this.recordSuccess(sourceKey, responseTime);
          return { sourceKey, price, responseTime, valid: true };
        } else {
          this.recordDataQualityIssue(sourceKey, 'invalid_price', price);
          return { sourceKey, price, responseTime, valid: false };
        }
      } catch (error) {
        this.recordFailure(sourceKey, error);
        return { sourceKey, error, valid: false };
      }
    });

    const results_data = await Promise.allSettled(promises);
    const validResults = results_data
      .filter(result => result.status === 'fulfilled' && result.value.valid)
      .map(result => result.value);

    if (validResults.length === 0) {
      // 如果并行请求都失败，尝试串行请求剩余数据源
      return this.fallbackFetchRealTimePrice(symbol, sources);
    }

    // 如果有多个有效结果，进行交叉验证
    if (validResults.length > 1) {
      const validatedPrice = this.crossValidatePrices(validResults);
      if (validatedPrice !== null) {
        return validatedPrice;
      }
    }

    // 返回最快响应的有效结果
    const bestResult = validResults.sort((a, b) => a.responseTime - b.responseTime)[0];
    return bestResult.price;
  }

  /**
   * 备用串行获取价格数据
   * @param {string} symbol - 股票代码
   * @param {Array} sources - 数据源列表
   */
  async fallbackFetchRealTimePrice(symbol, sources) {
    for (const sourceKey of sources) {
      try {
        const price = await this.fetchFromSource(sourceKey, 'realtime', symbol);
        if (this.validatePriceData(price, symbol)) {
          this.recordSuccess(sourceKey);
          return price;
        }
      } catch (error) {
        this.recordFailure(sourceKey, error);
        console.warn(`数据源 ${this.dataSources[sourceKey].name} 失败: ${error.message}`);
      }
    }

    throw new Error('所有数据源均不可用');
  }

  /**
   * 验证价格数据质量（优化版）
   * @param {number} price - 价格数据
   * @param {string} symbol - 股票代码
   */
  validatePriceData(price, symbol) {
    // 基础验证
    if (price === null || price === undefined || isNaN(price)) {
      console.warn(`价格验证失败: ${symbol} - 价格为空或NaN`);
      return false;
    }

    // 价格必须为正数
    if (price <= 0) {
      console.warn(`价格验证失败: ${symbol} - 价格为负数或零: ${price}`);
      return false;
    }

    // 优化：根据ETF类型动态调整价格范围
    const priceRange = this.getPriceRange(symbol);
    if (price < priceRange.min || price > priceRange.max) {
      console.warn(`价格验证失败: ${symbol} - 价格超出合理范围: ${price} (范围: ${priceRange.min}-${priceRange.max})`);
      return false;
    }

    // 检查是否与历史价格差异过大
    const lastValidPrice = this.getLastValidPrice(symbol);
    if (lastValidPrice) {
      const changePercent = Math.abs(price - lastValidPrice) / lastValidPrice;

      // 优化：根据市场波动情况动态调整异常阈值
      const threshold = this.getDynamicChangeThreshold(symbol, lastValidPrice, price);

      if (changePercent > threshold) {
        console.warn(`价格异常变动: ${symbol} ${lastValidPrice} -> ${price} (${(changePercent * 100).toFixed(2)}%, 阈值${(threshold * 100).toFixed(2)}%)`);
        return false;
      }
    }

    return true;
  }

  /**
   * 获取ETF价格合理范围
   * @param {string} symbol - 股票代码
   * @returns {Object} 价格范围 {min, max}
   */
  getPriceRange(symbol) {
    // 根据ETF类型设置不同的价格范围
    if (symbol.includes('510050') || symbol.includes('510300')) {
      // 大盘ETF，价格通常在1-10元
      return { min: 0.5, max: 15.0 };
    } else if (symbol.includes('510500') || symbol.includes('512100')) {
      // 中盘ETF，价格通常在5-20元
      return { min: 2.0, max: 25.0 };
    } else if (symbol.includes('512880') || symbol.includes('515050')) {
      // 行业ETF，价格范围较广
      return { min: 0.1, max: 50.0 };
    } else if (symbol.includes('518880') || symbol.includes('588000')) {
      // 商品ETF，价格可能较高
      return { min: 0.1, max: 100.0 };
    } else {
      // 默认范围
      return { min: 0.1, max: 50.0 };
    }
  }

  /**
   * 根据ETF类型动态获取价格上限（保留兼容性）
   * @param {string} symbol - 股票代码
   * @param {number} currentPrice - 当前价格
   * @returns {number} 价格上限
   */
  getDynamicPriceLimit(symbol, currentPrice) {
    // 大部分ETF价格在0.5-10元之间
    // 少数宽基指数ETF可能在10-100元
    // 极少数如黄金ETF可能超过100元

    // 根据历史价格动态调整
    const lastValidPrice = this.getLastValidPrice(symbol);
    if (lastValidPrice) {
      // 如果有历史价格，允许在历史价格基础上有较大波动
      return Math.max(lastValidPrice * 3, 1000);
    }

    // 默认上限
    if (currentPrice < 1) return 10;      // 低价ETF上限10元
    if (currentPrice < 10) return 50;     // 中价ETF上限50元
    if (currentPrice < 50) return 200;    // 较高价ETF上限200元
    return 500;                            // 高价ETF（如黄金）上限500元
  }

  /**
   * 根据市场情况动态获取价格变动阈值
   * @param {string} symbol - 股票代码
   * @param {number} lastPrice - 上次价格
   * @param {number} currentPrice - 当前价格
   * @returns {number} 变动阈值（百分比）
   */
  getDynamicChangeThreshold(symbol, lastPrice, currentPrice) {
    // 基础阈值：20%
    let threshold = 0.20;

    // 如果价格较低（<1元），允许更大的百分比波动
    if (lastPrice < 1) {
      threshold = 0.30; // 30%
    }

    // 如果是涨跌停板附近（10%），放宽到15%
    const changePercent = Math.abs(currentPrice - lastPrice) / lastPrice;
    if (changePercent > 0.095 && changePercent < 0.105) {
      threshold = 0.15;
    }

    // 检查是否在交易时间内，交易时间内允许更大波动
    if (this.isTradingHours()) {
      threshold *= 1.2; // 交易时间内放宽20%
    }

    return threshold;
  }

  /**
   * 检查是否在交易时间内
   * @returns {boolean}
   */
  isTradingHours() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay();

    // 周末不是交易时间
    if (day === 0 || day === 6) return false;

    // 上午: 9:30-11:30
    if (hour === 9 && minute >= 30) return true;
    if (hour === 10) return true;
    if (hour === 11 && minute <= 30) return true;

    // 下午: 13:00-15:00
    if (hour === 13) return true;
    if (hour === 14) return true;
    if (hour === 15 && minute === 0) return true;

    return false;
  }

  /**
   * 交叉验证多个数据源的价格
   * @param {Array} results - 价格结果数组
   */
  crossValidatePrices(results) {
    if (results.length < 2) return results[0]?.price || null;

    const prices = results.map(r => r.price);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // 检查价格一致性
    const maxDeviation = Math.max(...prices.map(p => Math.abs(p - avgPrice) / avgPrice));

    if (maxDeviation > 0.05) { // 5%的偏差阈值
      console.warn(`数据源价格不一致: ${prices.join(', ')}, 平均: ${avgPrice.toFixed(4)}`);

      // 选择偏差最小的价格
      const bestPrice = prices.reduce((best, current) => {
        const currentDev = Math.abs(current - avgPrice) / avgPrice;
        const bestDev = Math.abs(best - avgPrice) / avgPrice;
        return currentDev < bestDev ? current : best;
      });

      return bestPrice;
    }

    return avgPrice;
  }
  
  /**
   * 获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineData(symbol, days = 20) {
    const sources = this.getAvailableSources();
    
    for (const sourceKey of sources) {
      try {
        const klineData = await this.fetchKlineFromSource(sourceKey, symbol, days);
        if (klineData && klineData.length > 0) {
          this.recordSuccess(sourceKey);
          return klineData;
        }
      } catch (error) {
        this.recordFailure(sourceKey, error);
        console.warn(`K线数据源 ${this.dataSources[sourceKey].name} 失败: ${error.message}`);
      }
    }
    
    throw new Error('所有K线数据源均不可用');
  }
  
  /**
   * 从指定数据源获取实时价格
   * @param {string} sourceKey - 数据源键
   * @param {string} type - 数据类型
   * @param {string} symbol - 股票代码
   */
  async fetchFromSource(sourceKey, type, symbol) {
    const source = this.dataSources[sourceKey];
    
    switch (sourceKey) {
      case 'primary':
        return this.fetchFromTencent(symbol);
      case 'backup1':
        return this.fetchFromSina(symbol);
      case 'backup2':
        return this.fetchFromEastmoney(symbol);
      case 'backup3':
        return this.fetchFromTonghuashun(symbol);
      default:
        throw new Error(`未知数据源: ${sourceKey}`);
    }
  }
  
  /**
   * 从腾讯财经获取数据
   * @param {string} symbol - 股票代码
   */
  async fetchFromTencent(symbol) {
    const response = await axios.get(`${this.dataSources.primary.realtime}${symbol}`, {
      timeout: 10000
    });
    
    const match = response.data.match(/"(.*)"/);
    if (match) {
      const dataArray = match[1].split('~');
      const price = parseFloat(dataArray[3]);
      return isNaN(price) ? null : price;
    }
    
    return null;
  }
  
  /**
   * 从新浪财经获取数据
   * @param {string} symbol - 股票代码
   */
  async fetchFromSina(symbol) {
    // 转换股票代码格式
    const sinaSymbol = this.convertToSinaFormat(symbol);
    const response = await axios.get(`${this.dataSources.backup1.realtime}${sinaSymbol}`, {
      timeout: 10000
    });
    
    const data = response.data.split(',');
    if (data.length > 3) {
      const price = parseFloat(data[3]);
      return isNaN(price) ? null : price;
    }
    
    return null;
  }
  
  /**
   * 从东方财富获取实时价格
   * @param {string} symbol - 股票代码
   */
  async fetchFromEastmoney(symbol) {
    try {
      // 使用简化的东方财富API
      const secid = this.convertSymbolToSecid(symbol);
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com/',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      
      if (response.data && response.data.data && response.data.data.f58) {
        const price = parseFloat(response.data.data.f58);
        return isNaN(price) ? null : price;
      }
      
      return null;
    } catch (error) {
      console.warn(`东方财富实时价格获取失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 从同花顺获取实时价格
   * @param {string} symbol - 股票代码
   */
  async fetchFromTonghuashun(symbol) {
    try {
      // 使用同花顺的简化API
      const url = `https://d.10jqka.com.cn/v6/line/hs_${symbol}/01.js`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://q.10jqka.com.cn/',
          'Accept': 'application/javascript, */*'
        }
      });
      
      // 解析同花顺返回的JavaScript数据
      const priceMatch = response.data.match(/\"(\d+\.\d+)\"/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        return isNaN(price) ? null : price;
      }
      
      return null;
    } catch (error) {
      console.warn(`同花顺实时价格获取失败: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 从指定数据源获取K线数据
   * @param {string} sourceKey - 数据源键
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromSource(sourceKey, symbol, days) {
    const source = this.dataSources[sourceKey];
    
    switch (sourceKey) {
      case 'primary':
        return this.fetchKlineFromTencent(symbol, days);
      case 'backup1':
        return this.fetchKlineFromSina(symbol, days);
      case 'backup2':
        return this.fetchKlineFromEastmoney(symbol, days);
      case 'backup3':
        return this.fetchKlineFromTonghuashun(symbol, days);
      default:
        throw new Error(`未知K线数据源: ${sourceKey}`);
    }
  }
  
  /**
   * 从腾讯财经获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromTencent(symbol, days) {
    const response = await axios.get(`${this.dataSources.primary.kline}?symbol=${symbol}&scale=240&datalen=${days + 10}`, {
      timeout: 10000
    });

    if (Array.isArray(response.data)) {
      return response.data.reverse().map(d => ({
        date: d.day,
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume || 0)
      }));
    }

    return [];
  }
  
  /**
   * 从新浪财经获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromSina(symbol, days) {
    // 新浪财经K线API实现
    const sinaSymbol = this.convertToSinaFormat(symbol);
    const response = await axios.get(`${this.dataSources.backup1.kline}?symbol=${sinaSymbol}&scale=240&datalen=${days}`, {
      timeout: 10000
    });
    
    // 解析新浪财经K线数据格式
    if (response.data && Array.isArray(response.data)) {
      return response.data.map(d => ({
        date: d.day,
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume || 0)
      }));
    }
    
    return [];
  }
  
  /**
   * 从东方财富获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromEastmoney(symbol, days) {
    try {
      const secid = this.convertSymbolToSecid(symbol);
      const url = `${this.dataSources.backup2.kline}?secid=${secid}&ut=fa5fd1943c7b386f172d6893dbfba10b&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=0&end=20500000&lmt=${days + 10}`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com/',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      
      if (response.data && response.data.data && response.data.data.klines) {
        return response.data.data.klines.slice(-days).map(kline => {
          const [date, open, close, high, low, volume, amount, amplitude, changePercent, changeAmount, turnover] = kline.split(',');
          return {
            date: date,
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            volume: parseFloat(volume || 0)
          };
        });
      }
      
      return [];
    } catch (error) {
      console.warn(`东方财富K线数据获取失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 从同花顺获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromTonghuashun(symbol, days) {
    try {
      const url = `${this.dataSources.backup3.kline}${symbol}/01.js`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://q.10jqka.com.cn/',
          'Accept': 'application/javascript, */*'
        }
      });
      
      // 解析同花顺返回的JavaScript数据
      const dataMatch = response.data.match(/\[(.*?)\]/);
      if (dataMatch) {
        const dataStr = dataMatch[1];
        const klines = dataStr.split('","').map(line => {
          const fields = line.replace(/"/g, '').split(',');
          return {
            date: fields[0],
            open: parseFloat(fields[1]),
            high: parseFloat(fields[2]),
            low: parseFloat(fields[3]),
            close: parseFloat(fields[4]),
            volume: parseFloat(fields[5] || 0)
          };
        });
        
        return klines.slice(-days);
      }
      
      return [];
    } catch (error) {
      console.warn(`同花顺K线数据获取失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 转换为新浪财经格式
   * @param {string} symbol - 原始股票代码
   */
  convertToSinaFormat(symbol) {
    if (symbol.startsWith('sh')) {
      return 'sh' + symbol.substring(2);
    } else if (symbol.startsWith('sz')) {
      return 'sz' + symbol.substring(2);
    }
    return symbol;
  }
  
  /**
   * 转换为网易财经格式
   * @param {string} symbol - 原始股票代码
   */
  convertToNeteaseFormat(symbol) {
    if (symbol.startsWith('sh')) {
      return '0' + symbol.substring(2);
    } else if (symbol.startsWith('sz')) {
      return '1' + symbol.substring(2);
    }
    return symbol;
  }

  /**
   * 转换为东方财富secid格式
   * @param {string} symbol - 原始股票代码
   */
  convertSymbolToSecid(symbol) {
    if (symbol.startsWith('sh')) {
      return '1.' + symbol.substring(2);
    } else if (symbol.startsWith('sz')) {
      return '0.' + symbol.substring(2);
    }
    return symbol;
  }
  
  /**
   * 获取可用数据源列表
   */
  getAvailableSources() {
    return Object.keys(this.dataSources)
      .filter(key => this.dataSources[key].status === 'active')
      .sort((a, b) => {
        const aFailures = this.failureCount.get(a) || 0;
        const bFailures = this.failureCount.get(b) || 0;
        
        // 优先使用失败次数少的数据源
        if (aFailures !== bFailures) {
          return aFailures - bFailures;
        }
        
        // 其次按优先级排序
        return this.dataSources[a].priority - this.dataSources[b].priority;
      });
  }
  
  /**
   * 记录成功
   * @param {string} sourceKey - 数据源键
   * @param {number} responseTime - 响应时间
   */
  recordSuccess(sourceKey, responseTime = 0) {
    this.failureCount.set(sourceKey, 0);
    this.lastSuccessTime.set(sourceKey, Date.now());
    this.currentSource = sourceKey;

    // 记录性能指标
    this.updatePerformanceMetrics(sourceKey, responseTime, true);

    // 如果数据源之前被禁用，重新启用
    if (this.dataSources[sourceKey].status === 'disabled') {
      this.dataSources[sourceKey].status = 'active';
      console.log(`数据源 ${this.dataSources[sourceKey].name} 已自动重新启用`);
    }
  }

  /**
   * 记录数据质量问题
   * @param {string} sourceKey - 数据源键
   * @param {string} issueType - 问题类型
   * @param {any} data - 相关数据
   */
  recordDataQualityIssue(sourceKey, issueType, data) {
    const qualityIssues = this.qualityIssues || new Map();
    const sourceIssues = qualityIssues.get(sourceKey) || [];

    sourceIssues.push({
      timestamp: Date.now(),
      type: issueType,
      data: data
    });

    // 只保留最近100个问题记录
    if (sourceIssues.length > 100) {
      sourceIssues.splice(0, sourceIssues.length - 100);
    }

    qualityIssues.set(sourceKey, sourceIssues);
    this.qualityIssues = qualityIssues;

    // 如果质量问题过多，降低数据源优先级
    const recentIssues = sourceIssues.filter(issue =>
      Date.now() - issue.timestamp < 60 * 60 * 1000 // 最近1小时
    );

    if (recentIssues.length > 10) {
      this.dataSources[sourceKey].priority += 1;
      console.warn(`数据源 ${this.dataSources[sourceKey].name} 质量问题过多，降低优先级`);
    }
  }

  /**
   * 更新性能指标
   * @param {string} sourceKey - 数据源键
   * @param {number} responseTime - 响应时间
   * @param {boolean} success - 是否成功
   */
  updatePerformanceMetrics(sourceKey, responseTime, success) {
    if (!this.performanceMetrics) {
      this.performanceMetrics = new Map();
    }

    const metrics = this.performanceMetrics.get(sourceKey) || {
      totalRequests: 0,
      successfulRequests: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      successRate: 0
    };

    metrics.totalRequests++;
    if (success) {
      metrics.successfulRequests++;
      metrics.totalResponseTime += responseTime;
      metrics.avgResponseTime = metrics.totalResponseTime / metrics.successfulRequests;
    }

    metrics.successRate = metrics.successfulRequests / metrics.totalRequests;

    this.performanceMetrics.set(sourceKey, metrics);
  }

  /**
   * 获取最后有效价格
   * @param {string} symbol - 股票代码
   */
  getLastValidPrice(symbol) {
    if (!this.priceCache) {
      this.priceCache = new Map();
    }

    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5分钟内有效
      return cached.price;
    }

    return null;
  }

  /**
   * 缓存有效价格
   * @param {string} symbol - 股票代码
   * @param {number} price - 价格
   */
  cacheValidPrice(symbol, price) {
    if (!this.priceCache) {
      this.priceCache = new Map();
    }

    this.priceCache.set(symbol, {
      price: price,
      timestamp: Date.now()
    });
  }
  
  /**
   * 记录失败
   * @param {string} sourceKey - 数据源键
   * @param {Error} error - 错误信息
   */
  recordFailure(sourceKey, error) {
    const currentFailures = this.failureCount.get(sourceKey) || 0;
    this.failureCount.set(sourceKey, currentFailures + 1);
    
    // 如果连续失败超过3次，暂时禁用该数据源
    if (currentFailures >= 3) {
      this.dataSources[sourceKey].status = 'disabled';
      console.warn(`数据源 ${this.dataSources[sourceKey].name} 已被暂时禁用`);
      
      // 10分钟后重新启用
      setTimeout(() => {
        this.dataSources[sourceKey].status = 'active';
        this.failureCount.set(sourceKey, 0);
        console.log(`数据源 ${this.dataSources[sourceKey].name} 已重新启用`);
      }, 10 * 60 * 1000);
    }
    
    // 记录错误日志
    this.logError(sourceKey, error);
  }
  
  /**
   * 记录错误日志
   * @param {string} sourceKey - 数据源键
   * @param {Error} error - 错误信息
   */
  logError(sourceKey, error) {
    const logEntry = {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      source: this.dataSources[sourceKey].name,
      error: error.message,
      failureCount: this.failureCount.get(sourceKey) || 0
    };
    
    fs.appendFileSync('./data/datasource_error.log', JSON.stringify(logEntry) + '\n');
  }
  
  /**
   * 获取数据源状态
   */
  getStatus() {
    return {
      currentSource: this.currentSource,
      sources: Object.keys(this.dataSources).map(key => ({
        key,
        name: this.dataSources[key].name,
        status: this.dataSources[key].status,
        failureCount: this.failureCount.get(key) || 0,
        lastSuccess: this.lastSuccessTime.get(key)
      }))
    };
  }
}

module.exports = DataSourceManager;
