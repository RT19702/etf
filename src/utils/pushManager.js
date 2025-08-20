// 🤖 推送管理器：控制休息时间、频控、去重与合并
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');

// 配置dayjs时区插件
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

class PushManager {
  constructor(options = {}) {
    // 配置（支持从外部传入，或读取环境变量）
    this.config = {
      // 交易时间（工作日 9:30-11:30, 13:00-15:00）
      tradingHours: options.tradingHours || {
        morning: { start: '09:30', end: '11:30' },
        afternoon: { start: '13:00', end: '15:00' }
      },
      // 是否允许非交易时间推送
      allowNonTradingHours: options.allowNonTradingHours === true || process.env.ALLOW_NON_TRADING_HOURS === 'true',
      // 节假日（YYYY-MM-DD）
      holidays: Array.isArray(options.holidays) ? options.holidays : (() => {
        try { return JSON.parse(process.env.HOLIDAYS_JSON || '[]'); } catch { return []; }
      })(),
      // 频控与去重
      minIntervalSec: Number(process.env.PUSH_MIN_INTERVAL_SEC) || 600, // 同类推送最小间隔 10 分钟
      duplicateWindowHours: Number(process.env.PUSH_DUP_WINDOW_HOURS) || 24, // 内容重复窗口 24 小时
      staticDescWindowHours: Number(process.env.PUSH_STATIC_DESC_WINDOW_HOURS) || 24, // 说明类内容 24 小时内不重复
      maxPerHour: Number(process.env.PUSH_MAX_PER_HOUR) || 6,
      mergeWindowSec: Number(process.env.PUSH_MERGE_WINDOW_SEC) || 300, // 5 分钟合并窗口
      allowedTypes: (() => {
        try { return JSON.parse(process.env.PUSH_ALLOWED_TYPES || '[]'); } catch { return []; }
      })(),
      quietLogsNonTrading: process.env.QUIET_LOGS_NON_TRADING !== 'false',
      // 数据与日志路径
      stateFile: options.stateFile || path.join('.', 'data', 'push_state.json')
    };

    this.state = this._loadState();
  }

  // ====== 休息时间/交易时间判断 ======
  isHoliday(date = dayjs()) {
    const d = dayjs(date).format('YYYY-MM-DD');
    return this.config.holidays.includes(d);
  }

  isWeekend(date = dayjs()) {
    const day = dayjs(date).day();
    return day === 0 || day === 6;
  }

  isTradingTime(date = dayjs()) {
    const d = dayjs(date);
    if (this.isHoliday(d) || this.isWeekend(d)) return false;
    const [h, m] = d.format('HH:mm').split(':').map(Number);
    const timeNum = h * 60 + m;
    const toMin = (hhmm) => {
      const [hh, mm] = hhmm.split(':').map(Number);
      return hh * 60 + mm;
    };
    const am = this.config.tradingHours.morning;
    const pm = this.config.tradingHours.afternoon;
    const inMorning = timeNum >= toMin(am.start) && timeNum <= toMin(am.end);
    const inAfternoon = timeNum >= toMin(pm.start) && timeNum <= toMin(pm.end);
    return inMorning || inAfternoon;
  }

  shouldSuppressLogs(now = dayjs()) {
    if (!this.config.quietLogsNonTrading) return false;
    return !this.isTradingTime(now);
  }

  // ====== 频控与去重 ======
  _hash(content) {
    return crypto.createHash('sha1').update(content || '').digest('hex');
  }

  _loadState() {
    try {
      if (fs.existsSync(this.config.stateFile)) {
        return JSON.parse(fs.readFileSync(this.config.stateFile, 'utf8'));
      }
    } catch {}
    return { lastPushAt: 0, lastTypeAt: {}, contentHashes: {}, hourBuckets: {} , sections: {} };
  }

  _saveState() {
    try {
      const dir = path.dirname(this.config.stateFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.config.stateFile, JSON.stringify(this.state, null, 2));
    } catch (e) {
      // 忽略持久化失败，避免影响主流程
    }
  }

  _withinMinInterval(type, now = Date.now()) {
    const lastTypeTime = this.state.lastTypeAt[type] || 0;
    return (now - lastTypeTime) / 1000 < this.config.minIntervalSec;
  }

  _rateLimitExceeded(now = dayjs()) {
    const bucket = now.format('YYYYMMDDHH');
    const count = this.state.hourBuckets[bucket] || 0;
    return count >= this.config.maxPerHour;
  }

  _tickBucket(now = dayjs()) {
    const bucket = now.format('YYYYMMDDHH');
    this.state.hourBuckets[bucket] = (this.state.hourBuckets[bucket] || 0) + 1;
  }

  canPush(type = 'default', priority = 'normal', now = dayjs()) {
    const checks = [];

    // 类型白名单检查
    if (Array.isArray(this.config.allowedTypes) && this.config.allowedTypes.length > 0) {
      if (!this.config.allowedTypes.includes(type)) {
        checks.push({ passed: false, reason: '类型未允许', critical: true });
      } else {
        checks.push({ passed: true, reason: '类型检查通过' });
      }
    }

    // 非交易时间限制检查（若不允许）
    const isTradingTime = this.isTradingTime(now);
    if (!this.config.allowNonTradingHours && !isTradingTime) {
      checks.push({ passed: false, reason: '非交易时间', critical: priority !== 'high' });
    } else {
      checks.push({ passed: true, reason: isTradingTime ? '交易时间内' : '允许非交易时间推送' });
    }

    // 高频限制检查
    const rateLimitExceeded = this._rateLimitExceeded(now);
    if (rateLimitExceeded && priority !== 'high') {
      checks.push({ passed: false, reason: '超过每小时上限', critical: true });
    } else {
      checks.push({ passed: true, reason: rateLimitExceeded ? '高优先级穿透频率限制' : '频率限制检查通过' });
    }

    // 最小间隔检查
    const withinMinInterval = this._withinMinInterval(type, now.valueOf());
    if (withinMinInterval && priority !== 'high') {
      checks.push({ passed: false, reason: '未达到最小间隔', critical: true });
    } else {
      checks.push({ passed: true, reason: withinMinInterval ? '高优先级穿透间隔限制' : '间隔检查通过' });
    }

    // 综合判断
    const criticalFailures = checks.filter(c => !c.passed && c.critical);
    const allow = criticalFailures.length === 0;

    return {
      allow,
      reason: allow ? '所有检查通过' : criticalFailures.map(c => c.reason).join(', '),
      checks,
      priority
    };
  }

  // 内容去重：在 duplicateWindowHours 内，若内容哈希出现过则视为重复
  isDuplicateContent(content, now = dayjs()) {
    const hash = this._hash(content);
    const rec = this.state.contentHashes[hash];
    if (!rec) return false;
    const hours = (now.valueOf() - rec.ts) / 3600000;
    return hours < this.config.duplicateWindowHours;
  }

  /**
   * 智能推送决策
   * 综合考虑多个因素决定是否推送
   * @param {Object} options - 推送选项
   * @returns {Object} 决策结果
   */
  smartPushDecision(options = {}) {
    const {
      content,
      type = 'default',
      priority = 'normal',
      signals = [],
      priceChanges = [],
      technicalScores = [],
      now = dayjs()
    } = options;

    const decision = {
      shouldPush: false,
      reason: '',
      score: 0,
      factors: {}
    };

    // 基础推送检查
    const canPushResult = this.canPush(type, priority, now);
    decision.factors.basicChecks = canPushResult;

    // 无论基础检查是否通过，都计算各项因子用于显示
    // 信号质量评分
    let signalQualityScore = 0;
    if (signals.length > 0) {
      const validSignals = signals.filter(s => s && typeof s === 'string' && s.trim() !== '');
      if (validSignals.length > 0) {
        const strongSignals = validSignals.filter(s => s.includes('强烈买入') || s.includes('买入')).length;
        const weakSignals = validSignals.filter(s => s.includes('卖出') || s.includes('信号矛盾')).length;
        signalQualityScore = (strongSignals * 2 - weakSignals) / validSignals.length * 100;
      }
    }
    decision.factors.signalQuality = { score: signalQualityScore, signals: signals.length, validSignals: signals.filter(s => s && typeof s === 'string' && s.trim() !== '').length };

    // 价格变动评分
    let priceChangeScore = 0;
    let avgChange = 0;
    if (priceChanges.length > 0) {
      const validChanges = priceChanges.filter(change => !isNaN(change) && isFinite(change));
      if (validChanges.length > 0) {
        avgChange = validChanges.reduce((sum, change) => sum + Math.abs(change), 0) / validChanges.length;
        priceChangeScore = Math.min(avgChange * 10, 100); // 价格变动越大分数越高
      }
    }
    decision.factors.priceChange = { score: priceChangeScore, avgChange, validCount: priceChanges.filter(change => !isNaN(change) && isFinite(change)).length };

    // 技术评分
    let techScore = 0;
    if (technicalScores.length > 0) {
      const validScores = technicalScores.filter(score => !isNaN(score) && isFinite(score));
      if (validScores.length > 0) {
        techScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
      }
    }
    decision.factors.technicalScore = { score: techScore, count: technicalScores.length, validCount: technicalScores.filter(score => !isNaN(score) && isFinite(score)).length };

    if (!canPushResult.allow) {
      decision.reason = `基础检查失败: ${canPushResult.reason}`;
      return decision;
    }

    // 内容去重检查
    const isDuplicate = this.isDuplicateContent(content, now);
    decision.factors.contentDuplicate = isDuplicate;

    if (isDuplicate && priority !== 'high') {
      decision.reason = '内容重复';
      return decision;
    }



    // 综合评分计算
    decision.score = signalQualityScore * 0.4 + priceChangeScore * 0.3 + techScore * 0.3;

    // 推送决策阈值
    const pushThreshold = priority === 'high' ? 30 : priority === 'low' ? 70 : 50;
    decision.shouldPush = decision.score >= pushThreshold;
    decision.reason = decision.shouldPush ?
      `综合评分${decision.score.toFixed(1)}超过阈值${pushThreshold}` :
      `综合评分${decision.score.toFixed(1)}低于阈值${pushThreshold}`;

    return decision;
  }

  // 标记内容已发送
  markPushed(type, content, sectionsUsed = [], now = dayjs()) {
    const ts = now.valueOf();
    this.state.lastPushAt = ts;
    this.state.lastTypeAt[type] = ts;
    const hash = this._hash(content);
    this.state.contentHashes[hash] = { ts };
    sectionsUsed.forEach(sec => {
      this.state.sections[sec] = ts;
    });
    this._tickBucket(now);
    this._saveState();
  }

  // 说明类段落（如技术指标说明）控制：在 staticDescWindowHours 内仅发送一次
  allowSection(sectionKey, now = dayjs()) {
    const ts = this.state.sections[sectionKey] || 0;
    if (!ts) return true;
    const hours = (now.valueOf() - ts) / 3600000;
    return hours >= this.config.staticDescWindowHours;
  }

  // 合并相似的买入/卖出机会：按代码去重，并限制数量
  mergeSignals(signals = [], maxItems = 5) {
    const map = new Map();
    for (const s of signals) {
      const key = s.代码 || s.symbol || s.name;
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values()).slice(0, maxItems);
  }
}

module.exports = PushManager;

