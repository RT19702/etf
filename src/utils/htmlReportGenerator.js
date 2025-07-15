// 📊 HTML报告生成器
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

class HTMLReportGenerator {
  constructor() {
    this.templatePath = path.join(__dirname, '../templates');
    this.outputPath = './data/reports';
    
    // 确保输出目录存在
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  /**
   * 生成增强版ETF分析HTML报告
   * @param {Object} report - 报告数据
   * @returns {string} HTML文件路径
   */
  generateEnhancedReport(report) {
    const html = this._generateEnhancedHTML(report);
    const filename = `etf_report.html`;
    const filepath = path.join(this.outputPath, filename);
    
    fs.writeFileSync(filepath, html, 'utf8');
    return filepath;
  }

  /**
   * 生成增强版HTML内容
   * @private
   */
  _generateEnhancedHTML(report) {
    const strongBuys = report.data.filter(d => d.交易信号.includes('强烈买入'));
    const normalBuys = report.data.filter(d => d.交易信号.includes('买入') && !d.交易信号.includes('强烈买入'));
    const holds = report.data.filter(d => d.交易信号.includes('持有'));
    const sells = report.data.filter(d => d.交易信号.includes('卖出'));

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ETF轮动策略分析报告 - ${report.date}</title>
    <style>
        ${this._getCSS()}
    </style>
</head>
<body>
    <div class="container">
        <!-- 头部 -->
        <header class="header">
            <h1>📊 ETF轮动策略分析报告</h1>
            <div class="report-info">
                <span class="date">📅 ${report.date}</span>
                <span class="version">🚀 ${report.version}</span>
            </div>
        </header>

        <!-- 核心推荐 -->
        <section class="summary-section">
            <h2>🎯 策略推荐</h2>
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>推荐操作</h3>
                    <p class="highlight">${report.summary.推荐操作}</p>
                </div>
                <div class="summary-card">
                    <h3>推荐标的</h3>
                    <p>${report.summary.推荐标的}</p>
                </div>
                <div class="summary-card">
                    <h3>市场趋势</h3>
                    <p>${report.summary.市场趋势}</p>
                </div>
            </div>
        </section>

        <!-- 技术分析统计 -->
        <section class="stats-section">
            <h2>📈 技术分析统计</h2>
            <div class="stats-grid">
                <div class="stat-item strong-buy">
                    <span class="stat-number">${report.technicalAnalysis.强烈买入}</span>
                    <span class="stat-label">强烈买入</span>
                </div>
                <div class="stat-item buy">
                    <span class="stat-number">${report.technicalAnalysis.买入}</span>
                    <span class="stat-label">买入</span>
                </div>
                <div class="stat-item hold">
                    <span class="stat-number">${report.technicalAnalysis.持有}</span>
                    <span class="stat-label">持有</span>
                </div>
                <div class="stat-item sell">
                    <span class="stat-number">${report.technicalAnalysis.卖出}</span>
                    <span class="stat-label">卖出</span>
                </div>
                <div class="stat-item conflict">
                    <span class="stat-number">${report.technicalAnalysis.信号矛盾}</span>
                    <span class="stat-label">信号矛盾</span>
                </div>
            </div>
        </section>

        ${this._generateSpecialWatchSection(report.specialWatchAlerts)}
        ${this._generateOpportunitySection('💡 强烈买入机会', strongBuys, 'strong-buy')}
        ${this._generateOpportunitySection('📈 买入机会', normalBuys.slice(0, 10), 'buy')}
        ${this._generateETFTableSection(report.data)}
        ${this._generateDataSourceSection(report.dataSourceStatus)}

        <!-- 页脚 -->
        <footer class="footer">
            <p>📊 ETF轮动策略系统 | 生成时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}</p>
            <p>⚠️ 本报告仅供参考，投资有风险，决策需谨慎</p>
        </footer>
    </div>

    <script>
        ${this._getJavaScript()}
    </script>
</body>
</html>`;
  }

  /**
   * 生成特别关注部分
   * @private
   */
  _generateSpecialWatchSection(alerts) {
    if (!alerts || alerts.length === 0) {
      return '';
    }

    let html = `
        <section class="special-watch-section">
            <h2>🔍 特别关注提示</h2>
            <div class="alerts-grid">`;

    alerts.forEach(alert => {
      const priorityClass = alert.priority === 'high' ? 'high-priority' : 
                           alert.priority === 'medium' ? 'medium-priority' : 'low-priority';
      const priorityIcon = alert.priority === 'high' ? '🔴' : 
                          alert.priority === 'medium' ? '🟡' : '🟢';

      html += `
                <div class="alert-card ${priorityClass}">
                    <div class="alert-header">
                        <span class="priority-icon">${priorityIcon}</span>
                        <h3>${alert.name} (${alert.symbol})</h3>
                    </div>
                    <p class="alert-reason">${alert.reason}</p>
                    <div class="alert-conditions">
                        ${alert.triggeredConditions.map(c => `<span class="condition-tag">${c.message}</span>`).join('')}
                    </div>
                    <div class="alert-data">
                        <span>价格: ¥${alert.currentData.price}</span>
                        <span>RSI: ${alert.currentData.rsi || 'N/A'}</span>
                        <span>评分: ${alert.currentData.technicalScore || 'N/A'}</span>
                    </div>
                </div>`;
    });

    html += `
            </div>
        </section>`;

    return html;
  }

  /**
   * 生成投资机会部分
   * @private
   */
  _generateOpportunitySection(title, etfs, className) {
    if (!etfs || etfs.length === 0) {
      return '';
    }

    let html = `
        <section class="opportunity-section">
            <h2>${title}</h2>
            <div class="opportunity-grid">`;

    etfs.forEach(etf => {
      html += `
                <div class="opportunity-card ${className}">
                    <h3>${etf.ETF} (${etf.代码})</h3>
                    <div class="price-info">
                        <span class="current-price">¥${etf.当前价格}</span>
                        <span class="price-change ${parseFloat(etf.价格偏离) >= 0 ? 'positive' : 'negative'}">${etf.价格偏离}</span>
                    </div>
                    <div class="technical-info">
                        <div class="tech-item">
                            <span class="label">技术评分:</span>
                            <span class="value">${etf.技术评分}/100</span>
                        </div>
                        <div class="tech-item">
                            <span class="label">RSI:</span>
                            <span class="value">${etf.RSI}</span>
                        </div>
                        <div class="tech-item">
                            <span class="label">风险等级:</span>
                            <span class="value">${etf.风险等级}</span>
                        </div>
                    </div>
                    <div class="trade-range">
                        <span>买入: ¥${etf.买入阈值}</span>
                        <span>→</span>
                        <span>卖出: ¥${etf.卖出阈值}</span>
                    </div>
                </div>`;
    });

    html += `
            </div>
        </section>`;

    return html;
  }

  /**
   * 生成ETF详细表格部分
   * @private
   */
  _generateETFTableSection(data) {
    let html = `
        <section class="table-section">
            <h2>📋 详细分析数据</h2>
            <div class="table-container">
                <table class="etf-table">
                    <thead>
                        <tr>
                            <th>ETF名称</th>
                            <th>代码</th>
                            <th>当前价格</th>
                            <th>交易信号</th>
                            <th>技术评分</th>
                            <th>RSI</th>
                            <th>价格偏离</th>
                            <th>风险等级</th>
                        </tr>
                    </thead>
                    <tbody>`;

    data.forEach(etf => {
      const signalClass = this._getSignalClass(etf.交易信号);
      const priceChangeClass = parseFloat(etf.价格偏离) >= 0 ? 'positive' : 'negative';

      html += `
                        <tr>
                            <td class="etf-name">${etf.ETF}</td>
                            <td class="etf-code">${etf.代码}</td>
                            <td class="price">¥${etf.当前价格}</td>
                            <td class="signal ${signalClass}">${etf.交易信号}</td>
                            <td class="score">${etf.技术评分}</td>
                            <td class="rsi">${etf.RSI}</td>
                            <td class="price-change ${priceChangeClass}">${etf.价格偏离}</td>
                            <td class="risk">${etf.风险等级}</td>
                        </tr>`;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </section>`;

    return html;
  }

  /**
   * 生成数据源状态部分
   * @private
   */
  _generateDataSourceSection(dataSourceStatus) {
    if (!dataSourceStatus) {
      return '';
    }

    return `
        <section class="datasource-section">
            <h2>🔗 数据源状态</h2>
            <div class="datasource-info">
                <p>当前数据源: <strong>${dataSourceStatus.currentSource}</strong></p>
                <p>可用数据源: <strong>${dataSourceStatus.sources ? dataSourceStatus.sources.filter(s => s.status === 'active').length : 'N/A'}个</strong></p>
            </div>
        </section>`;
  }

  /**
   * 获取信号样式类
   * @private
   */
  _getSignalClass(signal) {
    if (signal.includes('强烈买入')) return 'strong-buy';
    if (signal.includes('买入')) return 'buy';
    if (signal.includes('持有')) return 'hold';
    if (signal.includes('卖出')) return 'sell';
    return 'neutral';
  }

  /**
   * 获取CSS样式
   * @private
   */
  _getCSS() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
            line-height: 1.6;
            color: #333;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 15px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .report-info {
            display: flex;
            justify-content: center;
            gap: 30px;
            font-size: 1.1em;
            color: #666;
        }

        .summary-section, .stats-section, .special-watch-section,
        .opportunity-section, .table-section, .datasource-section {
            background: rgba(255, 255, 255, 0.95);
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 25px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }

        h2 {
            font-size: 1.8em;
            margin-bottom: 20px;
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }

        .summary-card {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            padding: 20px;
            border-radius: 12px;
            color: white;
            text-align: center;
        }

        .summary-card h3 {
            font-size: 1.1em;
            margin-bottom: 10px;
            opacity: 0.9;
        }

        .summary-card p {
            font-size: 1.3em;
            font-weight: bold;
        }

        .highlight {
            font-size: 1.5em !important;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
        }

        .stat-item {
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            color: white;
            transition: transform 0.3s ease;
        }

        .stat-item:hover {
            transform: translateY(-5px);
        }

        .stat-number {
            display: block;
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.9em;
            opacity: 0.9;
        }

        .strong-buy { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
        .buy { background: linear-gradient(135deg, #4ecdc4, #44a08d); }
        .hold { background: linear-gradient(135deg, #45b7d1, #96c93d); }
        .sell { background: linear-gradient(135deg, #f093fb, #f5576c); }
        .conflict { background: linear-gradient(135deg, #feca57, #ff9ff3); }

        .alerts-grid, .opportunity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .alert-card, .opportunity-card {
            padding: 20px;
            border-radius: 12px;
            border-left: 5px solid;
            background: white;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }

        .alert-card:hover, .opportunity-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }

        .high-priority { border-left-color: #ff6b6b; }
        .medium-priority { border-left-color: #feca57; }
        .low-priority { border-left-color: #48dbfb; }

        .alert-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .priority-icon {
            font-size: 1.2em;
        }

        .alert-header h3 {
            margin: 0;
            color: #333;
        }

        .alert-reason {
            color: #666;
            margin-bottom: 15px;
            font-style: italic;
        }

        .alert-conditions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 15px;
        }

        .condition-tag {
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.85em;
            color: #495057;
            border: 1px solid #dee2e6;
        }

        .alert-data {
            display: flex;
            justify-content: space-between;
            font-size: 0.9em;
            color: #666;
        }

        .opportunity-card h3 {
            margin-bottom: 15px;
            color: #333;
        }

        .price-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .current-price {
            font-size: 1.4em;
            font-weight: bold;
            color: #333;
        }

        .price-change {
            padding: 4px 8px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 0.9em;
        }

        .positive { background: #d4edda; color: #155724; }
        .negative { background: #f8d7da; color: #721c24; }

        .technical-info {
            margin-bottom: 15px;
        }

        .tech-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 0.9em;
        }

        .tech-item .label {
            color: #666;
        }

        .tech-item .value {
            font-weight: bold;
            color: #333;
        }

        .trade-range {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
            font-size: 0.9em;
            color: #495057;
        }

        .table-container {
            overflow-x: auto;
        }

        .etf-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }

        .etf-table th,
        .etf-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }

        .etf-table th {
            background: #f8f9fa;
            font-weight: bold;
            color: #495057;
            position: sticky;
            top: 0;
        }

        .etf-table tr:hover {
            background: #f8f9fa;
        }

        .etf-name {
            font-weight: bold;
            color: #333;
        }

        .etf-code {
            font-family: monospace;
            color: #666;
        }

        .price {
            font-weight: bold;
            color: #333;
        }

        .signal {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.85em;
            font-weight: bold;
            text-align: center;
        }

        .signal.strong-buy { background: #d4edda; color: #155724; }
        .signal.buy { background: #cce5ff; color: #004085; }
        .signal.hold { background: #fff3cd; color: #856404; }
        .signal.sell { background: #f8d7da; color: #721c24; }
        .signal.neutral { background: #e2e3e5; color: #383d41; }

        .datasource-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }

        .footer {
            text-align: center;
            padding: 30px;
            color: rgba(255, 255, 255, 0.8);
            margin-top: 30px;
        }

        .footer p {
            margin-bottom: 5px;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }

            .header h1 {
                font-size: 2em;
            }

            .report-info {
                flex-direction: column;
                gap: 10px;
            }

            .summary-grid,
            .stats-grid,
            .alerts-grid,
            .opportunity-grid {
                grid-template-columns: 1fr;
            }

            .alert-data,
            .price-info,
            .trade-range {
                flex-direction: column;
                gap: 5px;
            }

            .etf-table {
                font-size: 0.85em;
            }

            .etf-table th,
            .etf-table td {
                padding: 8px 4px;
            }
        }

        @media (max-width: 480px) {
            .header {
                padding: 20px;
            }

            .summary-section, .stats-section, .special-watch-section,
            .opportunity-section, .table-section, .datasource-section {
                padding: 15px;
            }

            h2 {
                font-size: 1.5em;
            }
        }
    `;
  }

  /**
   * 获取JavaScript代码
   * @private
   */
  _getJavaScript() {
    return `
        // 页面加载完成后执行
        document.addEventListener('DOMContentLoaded', function() {
            // 添加动画效果
            const cards = document.querySelectorAll('.summary-card, .stat-item, .alert-card, .opportunity-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            });

            // 表格排序功能
            const table = document.querySelector('.etf-table');
            if (table) {
                const headers = table.querySelectorAll('th');
                headers.forEach((header, index) => {
                    header.style.cursor = 'pointer';
                    header.style.userSelect = 'none';
                    header.addEventListener('click', () => sortTable(index));

                    // 添加排序图标
                    header.innerHTML += ' <span class="sort-icon">⇅</span>';
                });
            }

            // 添加搜索功能
            addSearchFunctionality();

            // 添加主题切换功能
            addThemeToggle();

            // 添加数据刷新时间显示
            updateLastRefreshTime();
        });

        // 表格排序函数
        function sortTable(columnIndex) {
            const table = document.querySelector('.etf-table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));

            // 获取当前排序状态
            const header = table.querySelectorAll('th')[columnIndex];
            const currentSort = header.getAttribute('data-sort') || 'asc';
            const newSort = currentSort === 'asc' ? 'desc' : 'asc';

            // 清除其他列的排序状态
            table.querySelectorAll('th').forEach(th => {
                th.removeAttribute('data-sort');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.textContent = '⇅';
            });

            // 设置当前列的排序状态
            header.setAttribute('data-sort', newSort);
            const icon = header.querySelector('.sort-icon');
            if (icon) icon.textContent = newSort === 'asc' ? '↑' : '↓';

            // 排序行
            rows.sort((a, b) => {
                const aValue = a.cells[columnIndex].textContent.trim();
                const bValue = b.cells[columnIndex].textContent.trim();

                // 尝试数值比较
                const aNum = parseFloat(aValue.replace(/[^\\\\d.-]/g, ''));
                const bNum = parseFloat(bValue.replace(/[^\\\\d.-]/g, ''));

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return newSort === 'asc' ? aNum - bNum : bNum - aNum;
                } else {
                    return newSort === 'asc' ?
                        aValue.localeCompare(bValue) :
                        bValue.localeCompare(aValue);
                }
            });

            // 重新插入排序后的行
            rows.forEach(row => tbody.appendChild(row));
        }

        // 添加搜索功能
        function addSearchFunctionality() {
            const tableSection = document.querySelector('.table-section');
            if (!tableSection) return;

            const searchContainer = document.createElement('div');
            searchContainer.style.marginBottom = '15px';
            searchContainer.innerHTML = \\\`
                <input type="text" id="etf-search" placeholder="搜索ETF名称或代码..."
                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            \\\`;

            const h2 = tableSection.querySelector('h2');
            h2.parentNode.insertBefore(searchContainer, h2.nextSibling);

            const searchInput = document.getElementById('etf-search');
            const table = document.querySelector('.etf-table tbody');

            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                const rows = table.querySelectorAll('tr');

                rows.forEach(row => {
                    const etfName = row.cells[0].textContent.toLowerCase();
                    const etfCode = row.cells[1].textContent.toLowerCase();

                    if (etfName.includes(searchTerm) || etfCode.includes(searchTerm)) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                });
            });
        }

        // 添加主题切换功能
        function addThemeToggle() {
            const header = document.querySelector('.header');
            const toggleButton = document.createElement('button');
            toggleButton.innerHTML = '🌙';
            toggleButton.style.cssText = \\\`
                position: absolute;
                top: 20px;
                right: 20px;
                background: rgba(255, 255, 255, 0.2);
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                font-size: 18px;
                cursor: pointer;
                transition: all 0.3s ease;
            \\\`;

            header.style.position = 'relative';
            header.appendChild(toggleButton);

            toggleButton.addEventListener('click', function() {
                document.body.classList.toggle('dark-theme');
                this.innerHTML = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
            });
        }

        // 更新最后刷新时间
        function updateLastRefreshTime() {
            const footer = document.querySelector('.footer');
            const timeElement = document.createElement('p');
            timeElement.innerHTML = \\\`📱 最后刷新: \\\${new Date().toLocaleString('zh-CN')}\\\`;
            timeElement.style.fontSize = '0.9em';
            timeElement.style.opacity = '0.8';
            footer.appendChild(timeElement);
        }
    `;
  }
}

module.exports = HTMLReportGenerator;
