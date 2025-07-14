# 🚀 启动时推送功能指南

## 📋 功能概述

启动时推送功能允许您在启动定时任务系统时，立即获得一次策略分析和推送，无论当前是否为交易时间。这对于以下场景特别有用：

- 🌙 **非交易时间启动**: 晚上或周末启动系统时也能获得最新分析
- 📊 **即时反馈**: 启动后立即了解当前市场状况
- 🔍 **配置验证**: 确认系统配置正确并能正常推送

## ⚙️ 配置选项

### 1. 启用启动时强制推送

在 `config/.env` 文件中设置：

```bash
# 启动时是否强制推送（忽略交易时间限制）
FORCE_STARTUP_PUSH=true
```

### 2. 相关配置项

```bash
# 企业微信推送开关
ENABLE_WECHAT_PUSH=true

# 是否允许非交易时间运行（影响定时任务）
ALLOW_NON_TRADING_HOURS=false

# 企业微信Webhook URL
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
```

## 🎯 工作原理

### 启动流程

1. **系统启动** → 加载配置
2. **检查配置** → `FORCE_STARTUP_PUSH` 是否为 `true`
3. **强制执行** → 忽略交易时间限制，执行策略分析
4. **推送报告** → 将分析结果推送到企业微信

### 执行逻辑

```javascript
// 伪代码示例
if (FORCE_STARTUP_PUSH === true) {
  // 强制执行，忽略交易时间
  await executeStrategy('启动时策略分析', forceExecute: true);
} else {
  // 按正常逻辑，检查交易时间
  if (isTradingTime() || ALLOW_NON_TRADING_HOURS === true) {
    await executeStrategy('启动时策略分析');
  } else {
    console.log('非交易时间，跳过任务');
  }
}
```

## 📱 推送内容

启动时推送包含以下内容：

### 1. 启动通知
```
🚀 ETF策略定时推送系统已启动
```

### 2. 策略分析报告
- 📊 **策略推荐**: 当前推荐操作
- 🏆 **前三强势**: 表现最佳的ETF
- 🔍 **特别关注**: 触发关注条件的ETF
- 💡 **买入机会**: 具体投资建议
- ⚠️ **风险提示**: 高风险标的提醒

### 3. 系统状态
- ✅ 定时任务启动成功
- 📅 下次执行时间预告

## 🛠️ 使用方法

### 启动定时任务系统

```bash
# 启动增强版定时推送
npm run auto

# 或者使用完整命令
node scripts/start-enhanced-scheduler.js
```

### 预期输出

启用强制推送时，您会看到类似输出：

```
🚀 ETF策略定时推送系统启动...
📱 初始化企业微信机器人...
✅ 企业微信机器人连接成功
🚀 启动ETF策略定时调度器...
✅ 调度器启动成功，已注册 5 个定时任务
📊 启动时执行策略分析...
📊 执行任务: 启动时策略分析
🚀 强制执行任务: 启动时策略分析 (忽略交易时间限制)
✅ 策略分析完成，报告已推送
```

禁用强制推送时：

```
📊 启动时执行策略分析...
⏰ 非交易时间，跳过任务: 启动时策略分析
```

## 🔧 配置建议

### 推荐配置（大多数用户）

```bash
# 启用启动时强制推送
FORCE_STARTUP_PUSH=true

# 启用企业微信推送
ENABLE_WECHAT_PUSH=true

# 定时任务仅在交易时间运行
ALLOW_NON_TRADING_HOURS=false
```

**优点**:
- ✅ 启动时立即获得反馈
- ✅ 定时任务仅在交易时间运行，节省资源
- ✅ 适合大多数使用场景

### 保守配置（仅交易时间）

```bash
# 禁用启动时强制推送
FORCE_STARTUP_PUSH=false

# 启用企业微信推送
ENABLE_WECHAT_PUSH=true

# 定时任务仅在交易时间运行
ALLOW_NON_TRADING_HOURS=false
```

**优点**:
- ✅ 严格按交易时间执行
- ✅ 避免非交易时间的"噪音"
- ✅ 适合严格的交易策略

### 全时段配置（高频用户）

```bash
# 启用启动时强制推送
FORCE_STARTUP_PUSH=true

# 启用企业微信推送
ENABLE_WECHAT_PUSH=true

# 允许非交易时间运行
ALLOW_NON_TRADING_HOURS=true
```

**优点**:
- ✅ 24/7 监控市场
- ✅ 不错过任何机会
- ✅ 适合专业交易者

## 🧪 测试功能

### 验证配置

```bash
# 运行系统验证
npm run verify

# 测试企业微信推送
npm run quick-test
```

### 测试启动推送

```bash
# 临时启动定时任务（测试用）
npm run auto

# 观察输出，确认是否执行了启动时推送
# 按 Ctrl+C 停止
```

## ❓ 常见问题

### Q: 为什么启动时没有推送？

**A**: 检查以下配置：
1. `FORCE_STARTUP_PUSH=true` 是否设置
2. `ENABLE_WECHAT_PUSH=true` 是否启用
3. `WECHAT_WEBHOOK_URL` 是否正确配置

### Q: 启动推送的内容和定时推送有什么区别？

**A**: 内容完全相同，只是执行时机不同：
- **启动推送**: 系统启动时立即执行
- **定时推送**: 按预设时间表执行

### Q: 可以只启用启动推送，禁用定时推送吗？

**A**: 可以，设置所有定时任务为空即可：
```bash
SCHEDULE_PRE_MARKET=
SCHEDULE_INTRADAY=
SCHEDULE_POST_MARKET=
SCHEDULE_DAILY_REPORT=
SCHEDULE_WEEKLY_REPORT=
```

### Q: 启动推送会影响定时任务吗？

**A**: 不会，启动推送是独立的一次性执行，不影响后续的定时任务。

## 📞 技术支持

如果遇到问题：

1. 运行 `npm run verify` 检查系统状态
2. 查看 `logs/` 目录下的日志文件
3. 参考 [安全配置指南](SECURITY_GUIDE.md)

---

**💡 提示**: 启动时推送功能让您在任何时候启动系统都能立即了解市场状况，是一个非常实用的功能！
