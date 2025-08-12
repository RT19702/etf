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
        name: '网易财经',
        realtime: 'https://api.money.126.net/data/feed/',
        kline: 'https://img1.money.126.net/data/hs/kline/day/history/',
        priority: 3,
        status: 'active'
      }
    };
    
    this.failureCount = new Map();
    this.lastSuccessTime = new Map();
    this.currentSource = 'primary';
  }
  
  /**
   * 获取实时价格数据（增强版）
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
   * 验证价格数据质量
   * @param {number} price - 价格数据
   * @param {string} symbol - 股票代码
   */
  validatePriceData(price, symbol) {
    if (price === null || price === undefined || isNaN(price)) {
      return false;
    }

    // 价格合理性检查
    if (price <= 0 || price > 1000) {
      return false;
    }

    // 检查是否与历史价格差异过大
    const lastValidPrice = this.getLastValidPrice(symbol);
    if (lastValidPrice) {
      const changePercent = Math.abs(price - lastValidPrice) / lastValidPrice;
      if (changePercent > 0.2) { // 20%的变动阈值
        console.warn(`价格异常变动: ${symbol} ${lastValidPrice} -> ${price} (${(changePercent * 100).toFixed(2)}%)`);
        return false;
      }
    }

    return true;
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
        return this.fetchFromNetease(symbol);
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
   * 从网易财经获取数据
   * @param {string} symbol - 股票代码
   */
  async fetchFromNetease(symbol) {
    // 网易财经API实现
    const neteaseSymbol = this.convertToNeteaseFormat(symbol);
    const response = await axios.get(`${this.dataSources.backup2.realtime}${neteaseSymbol}`, {
      timeout: 10000
    });
    
    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    }
    
    return null;
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
        return this.fetchKlineFromNetease(symbol, days);
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
   * 从网易财经获取K线数据
   * @param {string} symbol - 股票代码
   * @param {number} days - 天数
   */
  async fetchKlineFromNetease(symbol, days) {
    // 网易财经K线API实现
    const neteaseSymbol = this.convertToNeteaseFormat(symbol);
    const response = await axios.get(`${this.dataSources.backup2.kline}${neteaseSymbol}.json`, {
      timeout: 10000
    });
    
    if (response.data && response.data.data) {
      return response.data.data.slice(-days).map(d => ({
        date: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5] || 0)
      }));
    }
    
    return [];
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
   * 记录成功（增强版）
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
