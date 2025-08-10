class TechnicalIndicators {
    constructor() {
    // Unified API base (served by main Flask backend now)
    this.apiBase = '/api/technical';
        this.defaultTickers = ['NIFTY50', 'S&P500', 'USDINR', 'BANKNIFTY'];
        this.periods = [
            { label: '1M', value: '1M' },
            { label: '3M', value: '3M' },
            { label: '6M', value: '6M' },
            { label: '1Y', value: '1Y' },
            { label: '3Y', value: '3Y' }
        ];
        this.activeCards = new Map(); // ticker -> { period }
        this.chartInstances = {};
        this.init();
    }

    async init() {
        this.renderTab();
        this.bindEvents();
        // Load defaults sequentially to avoid burst (could parallel if backend robust)
        for (const ticker of this.defaultTickers) {
            await this.fetchAndRender(ticker, '1M', { silent: true });
        }
    }

    renderTab() {
        const container = document.getElementById('technical-indicators-content');
        if (!container) return;
        const periodOptions = this.periods.map(p => 
            `<option value="${p.value}" class="dropdown-option" style="background-color: #f9fafb; color: #1f2937; padding: 10px 12px;">${p.label}</option>`
        ).join('');
        container.innerHTML = `
            <div class="tech-toolbar card">
                <div class="card__header">
                    <h3><i class="fas fa-chart-bar"></i> Technical Indicators</h3>
                    <div class="tech-toolbar__actions">
                        <button id="refreshAllTech" class="btn btn--outline btn--sm" title="Refresh All"><i class="fas fa-sync"></i></button>
                    </div>
                </div>
                <div class="card__body tech-indicator-controls">
                    <input type="text" id="techTickerInput" class="form-control" placeholder="Enter ticker (RELIANCE, AAPL, BTC-USD)" />
                    <select id="techPeriodSelect" class="form-control tech-period-switch">${periodOptions}</select>
                    <button id="addTechTickerBtn" class="btn btn--primary btn--sm"><i class="fas fa-plus"></i> Add</button>
                </div>
            </div>
            <div class="indicator-key card">
                <div class="card__header"><h4>Indicator Key & Feature Descriptions</h4></div>
                <div class="card__body indicator-key-body">
                    <ul class="indicator-key-list">
                       <li><span class="key-line color-sma20"></span> SMA 20: Short-term average; reacts quickly.</li>
                       <li><span class="key-line color-sma50"></span> SMA 50: Intermediate trend gauge.</li>
                       <li><span class="key-line color-sma100"></span> SMA 100: Medium/long trend filter.</li>
                       <li><span class="key-line color-sma200"></span> SMA 200: Long-term secular trend baseline.</li>
                       <li><span class="key-line color-ema20"></span> EMA 20 / <span class="key-line color-ema50"></span> EMA 50: Exponential averages (more weight on recent price).</li>
                       <li>Bollinger Bands: Two std dev envelope for mean reversion & volatility expansion cues.</li>
                       <li>MACD (Line / Signal / Histogram): Momentum and potential trend inflection.</li>
                       <li>RSI 14: Overbought (&gt;70) / Oversold (&lt;30) oscillator of momentum extremes.</li>
                       <li>Volatility: Annualized realized volatility (20-period).</li>
                       <li>Window High/Low: Highest & lowest closes in selected period; %From High gauges pullback depth.</li>
                       <li>Badges: Golden Bias (SMA50>SMA200), Overbought/Oversold, Momentum, Volatility regime.</li>
                       <li>Fundamentals: Snapshot of valuation, profitability & capital efficiency (yfinance).</li>
                    </ul>
                </div>
            </div>
            <div id="techChartsGrid" class="tech-charts-grid"></div>
            <div id="techEmptyState" class="empty-state" style="display:none;">
                <i class="fas fa-chart-area fa-3x"></i>
                <h3>No Technical Charts</h3>
                <p>Add a ticker above to load indicator charts</p>
            </div>
        `;
    }

    bindEvents() {
        const addBtn = document.getElementById('addTechTickerBtn');
        const input = document.getElementById('techTickerInput');
        const periodSelect = document.getElementById('techPeriodSelect');
        const refreshAll = document.getElementById('refreshAllTech');

        addBtn?.addEventListener('click', async () => {
            const raw = input.value.trim();
            if (!raw) return this._notify('Enter a ticker', 'info');
            const ticker = raw.toUpperCase();
            const period = periodSelect.value;
            if (this.activeCards.has(ticker)) {
                this._notify(`${ticker} already loaded`, 'info');
                return;
            }
            await this.fetchAndRender(ticker, period);
        });

        input?.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBtn.click();
            }
        });

        refreshAll?.addEventListener('click', () => this.refreshAll());
    }

    async refreshAll() {
        for (const [ticker, meta] of this.activeCards.entries()) {
            await this.fetchAndRender(ticker, meta.period, { force: true, silent: true });
        }
        this._notify('All technical charts refreshed', 'success');
    }

    async fetchAndRender(ticker, period, { force = false, silent = false } = {}) {
        const grid = document.getElementById('techChartsGrid');
        const emptyState = document.getElementById('techEmptyState');
        if (!grid) return;

        const cardId = `tech-card-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;
        let card = document.getElementById(cardId);
        if (card && !force) {
            // Already rendered
            return;
        }
        if (!card) {
            card = document.createElement('div');
            card.className = 'tech-chart-card card';
            card.id = cardId;
            grid.appendChild(card);
            this.activeCards.set(ticker, { period });
        }
        emptyState.style.display = grid.children.length === 0 ? 'flex' : 'none';
        card.innerHTML = this._loadingTemplate(ticker, period);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(`${this.apiBase}/indicators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, period }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = await res.json();
            if (!result || !Array.isArray(result.data) || result.data.length === 0) {
                throw new Error('No timeseries data');
            }
            this.renderChartCard(card, result, ticker, period);
            if (!silent) this._notify(`Loaded indicators for ${ticker}`, 'success');
        } catch (err) {
            const msg = err.name === 'AbortError' ? 'Request timeout' : (err.message || 'Unknown error');
            card.innerHTML = this._errorTemplate(ticker, msg, period);
            if (!silent) this._notify(`Failed ${ticker}: ${msg}`, 'error');
        }
    }

    renderChartCard(card, result, ticker, period) {
        const data = result.data || [];
    const latest = result.indicators || {};
    const series = result.series || {};
    const fundamentals = result.fundamentals || {};
        const labels = (series.dates && series.dates.length) ? series.dates : data.map(d => d.date || d.time || '');
        const prices = series.close && series.close.length ? series.close : data.map(d => d.close ?? d.price ?? null);

        const indicatorSummary = this._buildIndicatorNarrative(ticker, latest);
        const indicatorList = this._buildIndicatorList(latest);

        const periodSelect = `<select class="tech-period-switch form-control form-control--inline">${this.periods.map(p => 
            `<option value="${p.value}" ${p.value===period?'selected':''} class="dropdown-option" style="background-color: #f9fafb; color: #1f2937; padding: 10px 12px;">${p.label}</option>`
        ).join('')}</select>`;

        card.innerHTML = `
            <div class="card__header tech-card-header">
                <h4>${ticker} ${periodSelect}</h4>
                <div class="tech-card-actions">
                    <button class="btn btn--outline btn--sm tech-refresh" title="Refresh"><i class="fas fa-sync"></i></button>
                    <button class="btn btn--secondary btn--sm tech-remove" title="Remove"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="card__body large-tech-body">
                <div class="overlay-toggle-bar">
                    <span class="toggle-label">Overlays:</span>
                    ${['sma_20','sma_50','sma_100','sma_200','ema_20','ema_50','bollinger'].map(k=>{
                        const labelMap = {sma_20:'SMA20',sma_50:'SMA50',sma_100:'SMA100',sma_200:'SMA200',ema_20:'EMA20',ema_50:'EMA50',bollinger:'Boll'};
                        return `<label><input type="checkbox" data-overlay="${k}" checked /> ${labelMap[k]}</label>`;
                    }).join(' ')}
                </div>
                <div class="chart-wrapper main-chart large"><canvas id="chart-${card.id}" height="480"></canvas></div>
                <div class="chart-wrapper macd-chart"><canvas id="macd-${card.id}" height="200"></canvas></div>
                <div class="chart-wrapper rsi-chart"><canvas id="rsi-${card.id}" height="180"></canvas></div>
                <div class="indicator-summary-box">
                    ${indicatorSummary}
                    ${this._buildFundamentals(fundamentals)}
                </div>
                <details class="indicator-raw-details"><summary>Detailed Indicator & Feature Values</summary>
                    <div class="tech-indicators-list">
                        <ul>${indicatorList}</ul>
                    </div>
                </details>
            </div>`;

        // Remove existing chart instance if re-render
        if (this.chartInstances[card.id]) {
            this.chartInstances[card.id].destroy();
            delete this.chartInstances[card.id];
        }

        // Build price (drawn first, below overlays)
    const datasets = [
            {
                key: 'close',
                label: 'Close',
                data: prices,
                borderColor: 'var(--color-primary)',
        backgroundColor: 'rgba(var(--color-teal-500-rgb),0.08)', // lighter fill so lines pop
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.35,
                order: 0 // ensure drawn first so fill sits behind overlays
            }
        ];

        const addOverlay = (key, arr, label, color, opts={}) => {
            if (!Array.isArray(arr)) return;
            const norm = arr.map(v => (v==null||Number.isNaN(v)?null:v));
            if (!norm.some(v=>v!==null)) return;
            datasets.push({
                key,
                label,
                data: norm,
                borderColor: color,
                borderWidth: (key==='sma_100'?2.4:(key==='sma_200'?3:1.6)),
                pointRadius: 0,
                tension: 0.25,
                fill: false,
                order: 5, // overlays after price
                ...opts
            });
        };

        addOverlay('sma_20', series.sma_20, 'SMA 20', '#ffb347');
        addOverlay('sma_50', series.sma_50, 'SMA 50', '#ff7f50');
        addOverlay('sma_100', series.sma_100, 'SMA 100', '#f06d06');
        addOverlay('sma_200', series.sma_200, 'SMA 200', '#d8345f');
        addOverlay('ema_20', series.ema_20, 'EMA 20', '#6dd5fa', { borderDash:[4,3] });
        addOverlay('ema_50', series.ema_50, 'EMA 50', '#2193b0', { borderDash:[6,4] });
        if (series.bollinger_upper && series.bollinger_lower) {
            const up = series.bollinger_upper.map(v=> (v==null||Number.isNaN(v)?null:v));
            const lo = series.bollinger_lower.map(v=> (v==null||Number.isNaN(v)?null:v));
            if (up.some(v=>v!==null)) datasets.push({ key:'bollinger_upper', group:'bollinger', label:'Bollinger Upper', data: up, borderColor:'rgba(220,220,220,0.95)', borderWidth:1.4, pointRadius:0, tension:0.2, fill:false, order:5 });
            if (lo.some(v=>v!==null)) datasets.push({ key:'bollinger_lower', group:'bollinger', label:'Bollinger Lower', data: lo, borderColor:'rgba(220,220,220,0.95)', borderWidth:1.4, pointRadius:0, tension:0.2, fill:false, order:5 });
        }

        // Keep array order stable (price first, overlays appended). Order values retained for future logic.

        const ctx = card.querySelector(`#chart-${card.id}`).getContext('2d');
        const overlayRedrawPlugin = {
            id: 'overlayRedraw',
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                chart.data.datasets.forEach((ds, i) => {
                    if (!ds) return;
                    if (ds.key && ds.key !== 'close') {
                        const meta = chart.getDatasetMeta(i);
                        if (chart.isDatasetVisible(i) && meta && meta.dataset) {
                            ctx.save();
                            ctx.globalCompositeOperation = 'source-over';
                            meta.dataset.draw(ctx);
                            ctx.restore();
                        }
                    }
                });
            }
        };

        const chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            plugins: [overlayRedrawPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            sort: (a,b) => {
                                const order = ['Close','SMA 20','SMA 50','SMA 100','SMA 200','EMA 20','EMA 50','Bollinger Upper','Bollinger Lower'];
                                return order.indexOf(a.text) - order.indexOf(b.text);
                            }
                        }
                    },
                    tooltip: { enabled: true }
                },
                scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { beginAtZero: false } }
            }
        });
        this.chartInstances[card.id] = chartInstance;

        // Overlay toggle wiring
        const toggleBar = card.querySelector('.overlay-toggle-bar');
        if (toggleBar) {
            toggleBar.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const key = cb.getAttribute('data-overlay');
                    chartInstance.data.datasets.forEach((ds, idx) => {
                        if (!ds) return;
                        const match = key==='bollinger'
                            ? (ds.key==='bollinger_upper' || ds.key==='bollinger_lower')
                            : ds.key === key;
                        if (match) {
                            chartInstance.setDatasetVisibility(idx, cb.checked);
                        }
                    });
                    chartInstance.update();
                });
            });
        }

        // MACD subchart
        if (series.macd && series.macd_signal) {
            const macdCtx = card.querySelector(`#macd-${card.id}`).getContext('2d');
            new Chart(macdCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'MACD', data: series.macd, borderColor: '#ff6384', borderWidth: 1.4, pointRadius:0, tension:0.25 },
                        { label: 'Signal', data: series.macd_signal, borderColor: '#36a2eb', borderWidth: 1.2, pointRadius:0, tension:0.25 },
                        { label: 'Hist', data: series.macd_hist, type: 'bar', backgroundColor: series.macd_hist.map(v => v > 0 ? 'rgba(54,162,235,0.5)' : 'rgba(255,99,132,0.5)'), borderWidth:0 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{ display:false } }, scales:{ x:{ display:false }, y:{ display:true, ticks:{ maxTicksLimit:3 } } } }
            });
        }

        // RSI subchart
        if (series.rsi_14 && latest.rsi_14 !== undefined) {
            const rsiCtx = card.querySelector(`#rsi-${card.id}`).getContext('2d');
            new Chart(rsiCtx, {
                type: 'line',
                data: { labels, datasets: [ { label:'RSI 14', data: series.rsi_14, borderColor:'#f6d365', borderWidth:1.4, pointRadius:0, tension:0.25 } ] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ display:false }, y:{ min:0, max:100, ticks:{ stepSize:25 } } } }
            });
        }

        // Bind action buttons
        card.querySelector('.tech-refresh')?.addEventListener('click', () => {
            const meta = this.activeCards.get(ticker);
            this.fetchAndRender(ticker, meta?.period || period, { force: true });
        });
        card.querySelector('.tech-remove')?.addEventListener('click', () => this.removeCard(ticker));
        card.querySelector('.tech-period-switch')?.addEventListener('change', (e) => {
            const newPeriod = e.target.value;
            this.activeCards.set(ticker, { period: newPeriod });
            this.fetchAndRender(ticker, newPeriod, { force: true });
        });
    }

    removeCard(ticker) {
        const cardId = `tech-card-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;
        const card = document.getElementById(cardId);
        if (card && card.parentElement) {
            card.parentElement.removeChild(card);
            this.activeCards.delete(ticker);
        }
        const grid = document.getElementById('techChartsGrid');
        const emptyState = document.getElementById('techEmptyState');
        if (grid && emptyState) emptyState.style.display = grid.children.length === 0 ? 'flex' : 'none';
        this._notify(`Removed ${ticker}`, 'info');
    }

    _buildIndicatorList(indicators) {
        const map = {
            sma_20: 'SMA 20',
            sma_50: 'SMA 50',
            sma_100: 'SMA 100',
            sma_200: 'SMA 200',
            ema_20: 'EMA 20',
            ema_50: 'EMA 50',
            rsi_14: 'RSI 14',
            macd: 'MACD',
            macd_signal: 'MACD Signal',
            macd_hist: 'MACD Hist',
            bollinger_upper: 'Bollinger Upper',
            bollinger_lower: 'Bollinger Lower',
            volatility: 'Annualized Volatility',
            window_high: 'Window High',
            window_low: 'Window Low',
            pct_from_high: '% From High'
        };
        return Object.entries(map)
            .map(([key, label]) => {
                const val = indicators[key];
                if (val === undefined || val === null || Number.isNaN(val)) return `<li>${label}: <span class="muted">N/A</span></li>`;
                const formatted = typeof val === 'number' ? (Math.abs(val) > 1000 ? val.toFixed(0) : val.toFixed(2)) : val;
                return `<li>${label}: <span>${formatted}</span></li>`;
            })
            .join('');
    }

    _buildIndicatorNarrative(ticker, ind) {
        if (!ind || Object.keys(ind).length === 0) return '<div class="muted">No indicator data available.</div>';
        const rsiText = ind.rsi_14 !== null && ind.rsi_14 !== undefined ? (ind.rsi_14 > 70 ? 'overbought' : ind.rsi_14 < 30 ? 'oversold' : 'neutral') : 'neutral';
    const trendBias = (ind.sma_50 && ind.sma_200) ? (ind.sma_50 > ind.sma_200 ? 'medium-term uptrend vs long-term average' : 'medium-term underperformance vs long-term trend') : (ind.ema_20 && ind.ema_50 ? (ind.ema_20 > ind.ema_50 ? 'short-term bullish momentum' : 'short-term weakening momentum') : 'insufficient moving average data');
        const volDesc = ind.volatility ? (ind.volatility > 0.4 ? 'elevated volatility regime' : ind.volatility < 0.15 ? 'compressed volatility environment' : 'normal volatility') : 'unknown volatility';
        return `
            <div class="narrative-text">
                <h5 class="narrative-title">Technical Synopsis</h5>
                <p><strong>${ticker}</strong> is exhibiting <em>${trendBias}</em> and a <em>${volDesc}</em>. RSI momentum state is <em>${rsiText}</em>; MACD histogram ${this._macdState(ind)}, while Bollinger bands ${this._bollState(ind)}. Current price stands ${this._distanceFromHigh(ind)} the period high, offering context on pullback vs breakout risk.<br><span class="feature-tags">${this._featureBadges(ind)}</span></p>
            </div>`;
    }

    _macdState(ind) {
        if (ind.macd_hist === null || ind.macd_hist === undefined) return 'is inconclusive';
        if (ind.macd_hist > 0) return 'indicate bullish momentum building';
        if (ind.macd_hist < 0) return 'indicate bearish pressure';
        return 'is flat';
    }

    _bollState(ind) {
        if (!ind.bollinger_upper || !ind.bollinger_lower || !ind.close) return 'lack sufficient context';
        const range = ind.bollinger_upper - ind.bollinger_lower;
        if (range <= 0) return 'are not well-defined';
        const pos = (ind.close - ind.bollinger_lower) / range;
        if (pos > 0.8) return 'suggest price is near upper band (potential over-extension)';
        if (pos < 0.2) return 'suggest price is testing lower band (potential exhaustion)';
        return 'show price trading mid-range';
    }
    _distanceFromHigh(ind){
        if (ind.pct_from_high == null) return 'at an unknown distance from';
        const v = ind.pct_from_high.toFixed(2);
        return (ind.pct_from_high > -0.5 ? 'near' : `${v}% below`);
    }
    _featureBadges(ind){
        const feats = [];
        if (ind.sma_50 && ind.sma_200) feats.push(ind.sma_50 > ind.sma_200 ? 'Golden Bias' : 'Below 200 SMA');
        if (ind.rsi_14 != null) feats.push(ind.rsi_14 > 70 ? 'Overbought' : ind.rsi_14 < 30 ? 'Oversold' : 'RSI Neutral');
        if (ind.macd_hist != null) feats.push(ind.macd_hist > 0 ? 'Bullish Momentum' : 'Bearish Momentum');
        if (ind.volatility != null) feats.push(ind.volatility > 0.4 ? 'High Volatility' : ind.volatility < 0.15 ? 'Low Volatility' : 'Normal Volatility');
        return feats.map(f=>`<span class="feat-badge">${f}</span>`).join(' ');
    }
    _buildFundamentals(f){
        if (!f || Object.keys(f).length===0) return '';
        const show = ['market_cap','pe','forward_pe','eps','price_to_book','dividend_yield','roe','profit_margins','beta'];
        const labels = {
            market_cap:'Mkt Cap', pe:'PE', forward_pe:'Fwd PE', eps:'EPS', price_to_book:'P/B', dividend_yield:'Div %', roe:'ROE', profit_margins:'Profit Margin', beta:'Beta'
        };
        const items = show.filter(k=>f[k]!=null).map(k=>`<li><strong>${labels[k]}:</strong> <span>${f[k]}</span></li>`).join('');
    if (!items) return '';
    return `<div class="fundamentals-block"><h6>Key Fundamentals</h6><ul>${items || '<li class=\"muted\">No fundamentals available</li>'}</ul></div>`;
    }

    _loadingTemplate(ticker, period) {
        return `<div class="tech-loading"><div class="spinner"></div><span>Loading ${ticker} (${period})...</span></div>`;
    }

    _errorTemplate(ticker, message, period) {
        return `<div class="tech-error"><p><strong>${ticker} (${period})</strong></p><p>${message}</p><button class="btn btn--outline btn--sm retry-btn">Retry</button></div>`;
    }

    _notify(msg, type) {
        if (window.tradingPlatform && typeof window.tradingPlatform.showStatus === 'function') {
            window.tradingPlatform.showStatus(msg, type);
        } else {
            console.log(`[${type}] ${msg}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('technical-indicators-content')) {
        window.technicalIndicators = new TechnicalIndicators();
    }
});
