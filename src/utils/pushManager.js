// 🤖 推送管理器：控制休息时间、频控、去重与合并
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dayjs = require('dayjs');

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
      allowNonTradingHours: options.allowNonTradingHours === true,
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
    // 类型白名单
    if (Array.isArray(this.config.allowedTypes) && this.config.allowedTypes.length > 0) {
      if (!this.config.allowedTypes.includes(type)) return { allow: false, reason: '类型未允许' };
    }

    // 非交易时间限制（若不允许）
    if (!this.config.allowNonTradingHours && !this.isTradingTime(now)) {
      return { allow: false, reason: '非交易时间' };
    }

    // 高频限制（非高优先级也受限）
    if (this._rateLimitExceeded(now)) {
      if (priority !== 'high') return { allow: false, reason: '超过每小时上限' };
    }

    // 最小间隔（高优先级可穿透）
    if (this._withinMinInterval(type, now.valueOf())) {
      if (priority !== 'high') return { allow: false, reason: '未达到最小间隔' };
    }

    return { allow: true };
  }

  // 内容去重：在 duplicateWindowHours 内，若内容哈希出现过则视为重复
  isDuplicateContent(content, now = dayjs()) {
    const hash = this._hash(content);
    const rec = this.state.contentHashes[hash];
    if (!rec) return false;
    const hours = (now.valueOf() - rec.ts) / 3600000;
    return hours < this.config.duplicateWindowHours;
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

