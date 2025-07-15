# 🚀 增强版ETF轮动策略系统

一个功能完整的实时ETF轮动交易策略，集成了智能信号过滤、风险控制、市场情绪分析等多项先进功能。

## ✨ 主要特性

### 🎯 核心功能
- **实时数据获取**: 动态获取ETF价格和市场数据
- **智能轮动策略**: 基于动量和波动率的ETF轮动算法
- **交易时间检测**: 自动识别交易时间，避免非交易时段执行
- **小数点精度修复**: 根据价格大小动态调整显示精度
- **🤖 企业微信推送**: 定时推送策略报告到企业微信群
- **⏰ 定时任务调度**: 灵活的定时任务配置和执行

### 🛡️ 风险控制
- **仓位管理**: 单个仓位和总仓位限制
- **止损止盈**: 动态追踪止损和固定止盈
- **每日交易限制**: 防止过度交易
- **波动率过滤**: 高波动率时降低仓位

### 🔍 信号过滤
- **信号确认机制**: 多次确认后才执行交易
- **冷却期控制**: 防止频繁交易同一标的
- **市场条件适应**: 根据市场状况调整信号敏感度
- **噪音过滤**: 减少虚假信号的影响

### 📊 市场情绪分析
- **情绪评分**: 0-100分的市场情绪量化
- **行业轮动**: 识别强势和弱势行业
- **动量分析**: 价格动量和市场广度分析
- **波动率聚类**: 市场波动率状态识别

### 🔍 动态特别关注功能
- **智能识别**: 基于实时技术指标自动识别值得关注的ETF
- **多条件监控**: RSI超卖状态、异常成交量放大、技术评分改善、价格异常波动
- **动态优先级**: 根据市场条件自动分配高/中/低优先级
- **实时推送**: 动态关注提示直接推送到企业微信群
- **无需配置**: 完全自动化，无需手动维护关注列表

### 🚀 启动时推送
- **即时反馈**: 启动定时任务时立即获得策略分析
- **忽略交易时间**: 非交易时间启动也能获得推送
- **配置灵活**: 可选择启用或禁用启动时推送

## 📁 文件结构

```
ETF/
├── 📁 src/                          # 源代码目录
│   ├── 📁 core/                     # 核心模块
│   │   ├── config.js                # 配置管理
│   │   └── dataFetcher.js           # 数据获取模块
│   ├── 📁 strategies/               # 策略模块
│   │   ├── basicStrategy.js         # 基础ETF轮动策略
│   │   ├── realTimeStrategy.js      # 实时策略框架
│   │   └── enhancedStrategy.js      # 增强版策略
│   ├── 📁 monitors/                 # 监控模块
│   │   ├── realTimeMonitor.js       # 实时数据监控
│   │   └── priceMonitor.js          # 价格监控
│   ├── 📁 utils/                    # 工具模块
│   │   ├── riskManager.js           # 风险管理
│   │   ├── signalFilter.js          # 信号过滤
│   │   └── marketSentiment.js       # 市场情绪分析
│   └── 📁 reports/                  # 报告模块
│       ├── htmlGenerator.js         # HTML报告生成
│       └── notificationSender.js    # 通知发送
├── 📁 scripts/                      # 启动脚本
│   ├── basic.js                     # 基础策略启动
│   ├── realtime.js                  # 实时策略启动
│   ├── enhanced.js                  # 增强策略启动
│   ├── monitor.js                   # 监控启动
│   └── price.js                     # 价格监控启动
├── 📁 config/                       # 配置文件
│   └── .env                         # 环境变量
├── 📁 data/                         # 数据文件
│   └── reports/                     # 生成的报告
├── 📁 logs/                         # 日志文件
├── package.json                     # 项目配置
├── README.md                        # 项目说明
└── STRUCTURE.md                     # 目录结构说明
```

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境
```bash
# 复制配置模板
cp config/.env.example config/.env

# 编辑配置文件，填入您的企业微信Webhook URL
# 详细配置说明请参考：docs/SECURITY_GUIDE.md
```

⚠️ **重要**: 请务必配置您自己的企业微信Webhook URL，不要使用示例中的地址。

### 3. 测试配置
```bash
# 测试企业微信推送
npm run quick-test

# 测试特别关注功能
node debug-watch.js
```

### 4. 动态特别关注功能
系统会自动识别值得关注的ETF，无需手动配置。支持的动态监控条件：

- **RSI超卖状态** (RSI < 30) - 高优先级
- **异常成交量放大** (成交量 > 1.5倍平均值) - 中优先级
- **技术评分改善** (评分 > 70分) - 中优先级
- **价格异常波动** (单日涨跌幅 > 3%) - 低优先级

可通过环境变量调整阈值：
```bash
DYNAMIC_RSI_OVERSOLD_THRESHOLD=30      # RSI超卖阈值
DYNAMIC_VOLUME_SPIKE_RATIO=1.5         # 成交量异常倍数
DYNAMIC_TECHNICAL_SCORE_MIN=70         # 技术评分最低要求
DYNAMIC_PRICE_CHANGE_THRESHOLD=3.0     # 价格异常波动阈值(%)
```

# 风险控制
MAX_DAILY_TRADES=10            # 每日最大交易次数
MAX_TOTAL_POSITION=0.8         # 最大总仓位80%
VOLATILITY_THRESHOLD=3.0       # 波动率阈值
```

### 3. 运行策略

#### 手动执行策略分析
```bash
npm start
# 或
npm run strategy
# 或
npm run enhanced
```

#### 启动定时推送系统
```bash
npm run auto
```

## 📊 报告说明

### JSON报告
- `./data/reports/enhanced_etf_report.json`: 增强版ETF分析报告

### HTML报告
- `./data/reports/etf_report.html`: 可视化ETF分析报告

### 日志文件
- `./logs/strategy_success.log`: 成功操作日志
- `./logs/strategy_error.log`: 错误日志
- `./logs/risk_events.log`: 风险事件日志
- `./logs/signal_filter.log`: 信号过滤日志

## 🎛️ 配置参数详解

### 基础策略参数
- `LOOKBACK_DAYS`: 历史数据回看天数
- `MOMENTUM_WINDOW`: 动量计算窗口
- `ROTATION_THRESHOLD`: 轮动阈值（收益率）
- `MARKET_TREND_THRESHOLD`: 市场趋势阈值

### 实时策略参数
- `UPDATE_INTERVAL`: 数据更新间隔（毫秒）
- `SIGNAL_CONFIRM_COUNT`: 信号确认次数
- `MAX_POSITION_SIZE`: 最大单个仓位比例
- `STOP_LOSS_PERCENT`: 止损百分比
- `TAKE_PROFIT_PERCENT`: 止盈百分比

### 风险控制参数
- `MAX_DAILY_TRADES`: 每日最大交易次数
- `MAX_TOTAL_POSITION`: 最大总仓位比例
- `VOLATILITY_THRESHOLD`: 波动率阈值

## 🔧 主要优化点

### 1. 小数点精度修复 ✅
- **问题**: 科创50ETF价格1.014显示为1.01
- **解决**: 动态确定小数位数，确保精度正确

### 2. 交易时间检测 ✅
- **功能**: 自动识别A股交易时间
- **时间**: 09:30-11:30, 13:00-15:00 (周一至周五)

### 3. 实时数据获取优化 ✅
- **频率控制**: 可配置的更新间隔
- **API限制**: 智能请求频率控制
- **错误处理**: 完善的异常处理机制

### 4. 风险控制增强 ✅
- **仓位管理**: 多层次仓位限制
- **止损止盈**: 动态追踪止损
- **交易限制**: 防止过度交易

### 5. 信号过滤优化 ✅
- **确认机制**: 多次确认减少噪音
- **冷却期**: 防止频繁交易
- **市场适应**: 根据市场状况调整

### 6. 市场情绪分析 ✅
- **情绪量化**: 0-100分情绪评分
- **行业轮动**: 识别强势行业
- **综合分析**: 多维度市场分析

## 📈 使用建议

### 交易时间使用
1. **盘前准备**: 运行基础分析了解市场状况
2. **开盘后**: 启动实时策略进行动态监控
3. **盘中调整**: 根据报告调整策略参数

### 风险管理
1. **仓位控制**: 建议总仓位不超过80%
2. **分散投资**: 避免集中持仓单一ETF
3. **止损纪律**: 严格执行止损策略

### 参数调优
1. **回测验证**: 使用历史数据验证参数
2. **渐进调整**: 小幅调整参数观察效果
3. **市场适应**: 根据市场环境调整策略

## ⚠️ 风险提示

1. **投资有风险**: 本策略仅供参考，不构成投资建议
2. **数据依赖**: 策略效果依赖于数据质量和网络稳定性
3. **参数敏感**: 不同参数设置可能产生不同结果
4. **市场变化**: 策略需要根据市场环境持续优化

## 🤖 企业微信定时推送

### 快速配置
```bash
# 1. 配置企业微信
npm run setup-wechat

# 2. 测试连接
npm run test-wechat

# 3. 启动定时推送
npm run scheduler
```

### 主要功能
- **定时策略分析**: 开盘前、盘中、收盘后自动分析
- **智能消息格式**: 专业的ETF策略报告格式
- **错误重试机制**: 自动重试失败的推送
- **灵活时间配置**: 支持自定义定时任务

### 配置说明
在 `config/.env` 文件中配置：
```bash
# 企业微信机器人Webhook地址
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY

# 定时任务配置
SCHEDULE_PRE_MARKET=30 8 * * 1-5    # 工作日8:30开盘前分析
SCHEDULE_DAILY_REPORT=0 18 * * 1-5  # 工作日18:00每日报告
```

### 常用命令
```bash
npm start              # 运行策略分析
npm run auto           # 启动定时推送系统
npm run push           # 手动推送报告
npm run quick-test     # 测试企业微信推送
npm run verify         # 验证系统配置
npm run setup-wechat   # 配置企业微信
```
