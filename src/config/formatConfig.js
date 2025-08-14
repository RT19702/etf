// 📊 全局数值格式化配置
const NumberFormatter = require('../utils/numberFormatter');

/**
 * 全局格式化配置
 * 定义系统中各种数值的标准格式化规则
 */
const FORMAT_CONFIG = {
  // 技术指标格式化配置
  technicalIndicators: {
    rsi: { decimals: 1, formatter: 'formatRSI' },
    technicalScore: { decimals: 1, formatter: 'formatTechnicalScore' },
    macd: { decimals: 4, formatter: 'formatMACD' },
    kdj: { decimals: 1, formatter: 'formatKDJ' },
    atr: { decimals: 2, formatter: 'formatATR' },
    cci: { decimals: 2, formatter: 'formatNumber' },
    williamsR: { decimals: 2, formatter: 'formatNumber' }
  },

  // 价格相关格式化配置
  prices: {
    current: { decimals: null, formatter: 'formatPrice' }, // 自动判断小数位数
    buy: { decimals: null, formatter: 'formatPrice' },
    sell: { decimals: null, formatter: 'formatPrice' },
    ma5: { decimals: null, formatter: 'formatPrice' },
    ma10: { decimals: null, formatter: 'formatPrice' },
    ma20: { decimals: null, formatter: 'formatPrice' }
  },

  // 百分比格式化配置
  percentages: {
    priceChange: { decimals: 2, formatter: 'formatPercentage' },
    volatility: { decimals: 2, formatter: 'formatPercentage' },
    deviation: { decimals: 2, formatter: 'formatPercentage' },
    return: { decimals: 2, formatter: 'formatPercentage' }
  },

  // 比率格式化配置
  ratios: {
    volume: { decimals: 2, formatter: 'formatNumber' },
    pe: { decimals: 2, formatter: 'formatNumber' },
    pb: { decimals: 2, formatter: 'formatNumber' }
  },

  // 推送消息格式化配置
  pushMessage: {
    technicalScore: { decimals: 0, formatter: 'formatTechnicalScore' },
    rsi: { decimals: 1, formatter: 'formatRSI' },
    price: { decimals: null, formatter: 'formatPrice' },
    percentage: { decimals: 2, formatter: 'formatPercentage' }
  },

  // 报告格式化配置
  report: {
    technicalScore: { decimals: 1, formatter: 'formatTechnicalScore' },
    rsi: { decimals: 1, formatter: 'formatRSI' },
    price: { decimals: null, formatter: 'formatPrice' },
    percentage: { decimals: 2, formatter: 'formatPercentage' },
    macd: { decimals: 4, formatter: 'formatMACD' }
  }
};

/**
 * 格式化工具类
 * 提供统一的数值格式化接口
 */
class FormatManager {
  /**
   * 根据配置格式化数值
   * @param {*} value - 要格式化的值
   * @param {string} category - 配置类别
   * @param {string} field - 字段名
   * @returns {string} 格式化后的值
   */
  static format(value, category, field) {
    const config = FORMAT_CONFIG[category]?.[field];
    if (!config) {
      return value?.toString() || 'N/A';
    }

    const { decimals, formatter } = config;
    if (NumberFormatter[formatter]) {
      return NumberFormatter[formatter](value, decimals);
    }

    return NumberFormatter.formatNumber(value, decimals);
  }

  /**
   * 批量格式化对象
   * @param {Object} obj - 要格式化的对象
   * @param {string} category - 配置类别
   * @returns {Object} 格式化后的对象
   */
  static formatObject(obj, category) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const formatted = { ...obj };
    const categoryConfig = FORMAT_CONFIG[category];

    if (categoryConfig) {
      Object.keys(categoryConfig).forEach(field => {
        if (formatted[field] !== undefined) {
          formatted[field] = this.format(formatted[field], category, field);
        }
      });
    }

    return formatted;
  }

  /**
   * 格式化ETF数据对象
   * @param {Object} etfData - ETF数据
   * @returns {Object} 格式化后的ETF数据
   */
  static formatETFData(etfData) {
    if (!etfData) return etfData;

    const formatted = { ...etfData };

    // 格式化价格相关字段
    ['current', 'buy', 'sell', 'ma5', 'ma10', 'ma20'].forEach(field => {
      if (formatted[field] !== undefined) {
        formatted[field] = this.format(formatted[field], 'prices', field);
      }
    });

    // 格式化技术指标
    if (formatted.technicalIndicators) {
      formatted.technicalIndicators = this.formatObject(formatted.technicalIndicators, 'technicalIndicators');
    }

    // 格式化技术评分
    if (formatted.technicalScore?.score !== undefined) {
      formatted.technicalScore.score = this.format(formatted.technicalScore.score, 'technicalIndicators', 'technicalScore');
    }

    // 格式化百分比字段
    ['volatility', 'priceChange', 'deviation'].forEach(field => {
      if (formatted[field] !== undefined) {
        formatted[field] = this.format(formatted[field], 'percentages', field);
      }
    });

    return formatted;
  }

  /**
   * 格式化推送消息数据
   * @param {Object} messageData - 推送消息数据
   * @returns {Object} 格式化后的推送消息数据
   */
  static formatPushMessage(messageData) {
    return this.formatObject(messageData, 'pushMessage');
  }

  /**
   * 格式化报告数据
   * @param {Object} reportData - 报告数据
   * @returns {Object} 格式化后的报告数据
   */
  static formatReport(reportData) {
    if (!reportData) return reportData;

    const formatted = { ...reportData };

    // 格式化数据数组
    if (Array.isArray(formatted.data)) {
      formatted.data = formatted.data.map(item => this.formatObject(item, 'report'));
    }

    // 格式化特别关注数据
    if (Array.isArray(formatted.specialWatchAlerts)) {
      formatted.specialWatchAlerts = formatted.specialWatchAlerts.map(alert => {
        if (alert.currentData) {
          alert.currentData = this.formatObject(alert.currentData, 'report');
        }
        return alert;
      });
    }

    return formatted;
  }

  /**
   * 获取格式化配置
   * @param {string} category - 配置类别
   * @returns {Object} 配置对象
   */
  static getConfig(category) {
    return FORMAT_CONFIG[category] || {};
  }

  /**
   * 更新格式化配置
   * @param {string} category - 配置类别
   * @param {string} field - 字段名
   * @param {Object} config - 新配置
   */
  static updateConfig(category, field, config) {
    if (!FORMAT_CONFIG[category]) {
      FORMAT_CONFIG[category] = {};
    }
    FORMAT_CONFIG[category][field] = config;
  }
}

module.exports = {
  FORMAT_CONFIG,
  FormatManager
};
