// 💰 价格工具函数模块
const decimal = require('decimal.js');

decimal.set({ precision: 12, rounding: decimal.ROUND_HALF_UP });

/**
 * 格式化数字为指定小数位数
 * @param {number} num - 要格式化的数字
 * @param {number} decimals - 小数位数，默认4位
 * @returns {number} 格式化后的数字
 */
function financial(num, decimals = 4) {
  return new decimal(num).toDecimalPlaces(decimals).toNumber();
}

/**
 * 根据价格大小动态确定小数位数
 * @param {number} price - 价格
 * @returns {number} 建议的小数位数
 */
function determinePriceDecimals(price) {
  if (price >= 100) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 3;
  return 4;
}

module.exports = {
  financial,
  determinePriceDecimals
};

