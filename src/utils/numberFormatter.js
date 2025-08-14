// 📊 数值格式化工具模块
const decimal = require('decimal.js');

// 设置 decimal.js 精度配置
decimal.set({ 
  precision: 20, 
  rounding: decimal.ROUND_HALF_UP 
});

class NumberFormatter {
  /**
   * 格式化技术评分
   * @param {number} score - 技术评分
   * @param {number} decimals - 小数位数，默认1位
   * @returns {string} 格式化后的评分
   */
  static formatTechnicalScore(score, decimals = 1) {
    if (score === null || score === undefined || isNaN(score)) {
      return 'N/A';
    }
    
    // 使用 decimal.js 处理精度问题
    const decimalScore = new decimal(score);
    return decimalScore.toDecimalPlaces(decimals).toString();
  }

  /**
   * 格式化价格
   * @param {number} price - 价格
   * @param {number} decimals - 小数位数，如果不指定则自动判断
   * @returns {string} 格式化后的价格
   */
  static formatPrice(price, decimals = null) {
    if (price === null || price === undefined || isNaN(price)) {
      return 'N/A';
    }

    // 自动判断小数位数
    if (decimals === null) {
      decimals = this.determinePriceDecimals(price);
    }

    const decimalPrice = new decimal(price);
    return decimalPrice.toDecimalPlaces(decimals).toString();
  }

  /**
   * 格式化百分比
   * @param {number} value - 数值
   * @param {number} decimals - 小数位数，默认2位
   * @param {boolean} includePercent - 是否包含%符号，默认true
   * @returns {string} 格式化后的百分比
   */
  static formatPercentage(value, decimals = 2, includePercent = true) {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A';
    }

    const decimalValue = new decimal(value);
    const formatted = decimalValue.toDecimalPlaces(decimals).toString();
    return includePercent ? `${formatted}%` : formatted;
  }

  /**
   * 格式化RSI指标
   * @param {number} rsi - RSI值
   * @param {number} decimals - 小数位数，默认1位
   * @returns {string} 格式化后的RSI
   */
  static formatRSI(rsi, decimals = 1) {
    if (rsi === null || rsi === undefined || isNaN(rsi)) {
      return 'N/A';
    }

    const decimalRSI = new decimal(rsi);
    return decimalRSI.toDecimalPlaces(decimals).toString();
  }

  /**
   * 格式化MACD指标
   * @param {Object} macd - MACD对象
   * @param {number} decimals - 小数位数，默认4位
   * @returns {string} 格式化后的MACD
   */
  static formatMACD(macd, decimals = 4) {
    if (!macd || typeof macd !== 'object') {
      return 'N/A';
    }

    const macdValue = macd.macd !== undefined ? new decimal(macd.macd).toDecimalPlaces(decimals).toString() : 'N/A';
    const signalValue = macd.signal !== undefined ? new decimal(macd.signal).toDecimalPlaces(decimals).toString() : 'N/A';
    
    return `${macdValue}/${signalValue}`;
  }

  /**
   * 格式化KDJ指标
   * @param {Object} kdj - KDJ对象
   * @param {number} decimals - 小数位数，默认1位
   * @returns {Object} 格式化后的KDJ对象
   */
  static formatKDJ(kdj, decimals = 1) {
    if (!kdj || typeof kdj !== 'object') {
      return { k: 'N/A', d: 'N/A', j: 'N/A' };
    }

    return {
      k: kdj.k !== undefined ? new decimal(kdj.k).toDecimalPlaces(decimals).toString() : 'N/A',
      d: kdj.d !== undefined ? new decimal(kdj.d).toDecimalPlaces(decimals).toString() : 'N/A',
      j: kdj.j !== undefined ? new decimal(kdj.j).toDecimalPlaces(decimals).toString() : 'N/A'
    };
  }

  /**
   * 格式化ATR指标
   * @param {Object} atr - ATR对象
   * @param {number} decimals - 小数位数，默认2位
   * @returns {Object} 格式化后的ATR对象
   */
  static formatATR(atr, decimals = 2) {
    if (!atr || typeof atr !== 'object') {
      return { value: 'N/A', percentage: 'N/A' };
    }

    return {
      value: atr.value !== undefined ? new decimal(atr.value).toDecimalPlaces(decimals).toString() : 'N/A',
      percentage: atr.percentage !== undefined ? new decimal(atr.percentage).toDecimalPlaces(decimals).toString() : 'N/A'
    };
  }

  /**
   * 根据价格大小自动确定小数位数
   * @param {number} price - 价格
   * @returns {number} 建议的小数位数
   */
  static determinePriceDecimals(price) {
    if (price >= 100) return 2;
    if (price >= 10) return 3;
    if (price >= 1) return 3;
    return 4;
  }

  /**
   * 格式化通用数值
   * @param {number} value - 数值
   * @param {number} decimals - 小数位数
   * @param {string} defaultValue - 默认值，当数值无效时返回
   * @returns {string} 格式化后的数值
   */
  static formatNumber(value, decimals = 2, defaultValue = 'N/A') {
    if (value === null || value === undefined || isNaN(value)) {
      return defaultValue;
    }

    const decimalValue = new decimal(value);
    return decimalValue.toDecimalPlaces(decimals).toString();
  }

  /**
   * 批量格式化对象中的数值字段
   * @param {Object} obj - 要格式化的对象
   * @param {Object} formatConfig - 格式化配置
   * @returns {Object} 格式化后的对象
   */
  static formatObjectNumbers(obj, formatConfig = {}) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const formatted = { ...obj };
    
    // 默认格式化配置
    const defaultConfig = {
      technicalScore: { decimals: 1, formatter: 'formatTechnicalScore' },
      price: { decimals: null, formatter: 'formatPrice' },
      rsi: { decimals: 1, formatter: 'formatRSI' },
      percentage: { decimals: 2, formatter: 'formatPercentage' }
    };

    const config = { ...defaultConfig, ...formatConfig };

    Object.keys(formatted).forEach(key => {
      const value = formatted[key];
      
      // 检查是否需要格式化
      if (config[key] && typeof value === 'number') {
        const { decimals, formatter } = config[key];
        formatted[key] = this[formatter] ? this[formatter](value, decimals) : this.formatNumber(value, decimals);
      }
      
      // 递归处理嵌套对象
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        formatted[key] = this.formatObjectNumbers(value, formatConfig);
      }
    });

    return formatted;
  }
}

module.exports = NumberFormatter;
