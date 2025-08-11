// Technical Indicators - Clean Implementation
// Optimized for performance and conflict-free operation
class TechnicalIndicators {
    constructor() {
        console.log('📊 Initializing Technical Indicators...');
        
        // Environment-aware API configuration
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        this.apiBase = isLocal ? 'http://localhost:5000/api/technical' : `${window.location.origin}/api/technical`;
        
        // Default tickers for quick analysis
        this.defaultTickers = ['NIFTY50', 'S&P500', 'USDINR', 'BANKNIFTY'];
        
        // Comprehensive timeframe options - Updated with longer periods
        this.periods = [
            { label: '1H', value: '1H', description: '1 Hour - Scalping', features: ['Price Action', 'Volume', 'Support/Resistance'] },
            { label: '3H', value: '3H', description: '3 Hours - Short Term', features: ['Patterns', 'Volume Analysis', 'Breakouts'] },
            { label: '6H', value: '6H', description: '6 Hours - Intraday', features: ['RSI', 'Bollinger Bands', 'Volume Profile'] },
            { label: '1D', value: '1D', description: '1 Day - Daily Trading', features: ['All Indicators', 'Patterns', 'Volume', 'Momentum'] },
            { label: '3D', value: '3D', description: '3 Days - Short Swing', features: ['MACD', 'Trend Analysis', 'RSI'] },
            { label: '5D', value: '5D', description: '5 Days - Weekly View', features: ['Moving Averages', 'Trend', 'Volume'] },
            { label: '1M', value: '1M', description: '1 Month - Medium Term', features: ['Long MA', 'Trend', 'Fibonacci'] },
            { label: '3M', value: '3M', description: '3 Months - Quarterly', features: ['Seasonal', 'Long MA', 'Cycles'] },
            { label: '6M', value: '6M', description: '6 Months - Half Year', features: ['Investment', 'Major Trends', 'Sectors'] },
            { label: '1Y', value: '1Y', description: '1 Year - Annual', features: ['Long-term', 'Yearly Patterns', 'Cycles'] },
            { label: '3Y', value: '3Y', description: '3 Years - Investment', features: ['Long-term Investment', 'Secular Trends', 'Macro Cycles'] },
            { label: '5Y', value: '5Y', description: '5 Years - Strategic', features: ['Strategic Analysis', 'Market Cycles', 'Fundamental Shifts'] }
        ];
        
        // State management
        this.activeCards = new Map();
        this.chartInstances = new Map();
        this.refreshInterval = null;
        this.defaultPeriod = '1D';
        this.updateGuards = new Set();
        
        this.init();
    }

    async init() {
        try {
            // Render the technical indicators interface
            this.renderInterface();
            
            // Bind event listeners
            this.bindEvents();
            
            // Load default indicators
            await this.loadDefaultIndicators();
            
            // Start auto-refresh
            this.startAutoRefresh();
            
            console.log('✅ Technical Indicators ready');
            
        } catch (error) {
            console.error('❌ Technical Indicators initialization failed:', error);
        }
    }

    renderInterface() {
        const container = document.getElementById('technical-indicators-content');
        if (!container) {
            console.warn('Technical indicators container not found');
            return;
        }
        
        const periodOptions = this.periods.map(p => 
            `<option value="${p.value}" ${p.value === this.defaultPeriod ? 'selected' : ''}>${p.label} - ${p.description}</option>`
        ).join('');
        
        container.innerHTML = `
            <div class="technical-indicators-interface">
                <!-- Control Panel -->
                <div class="technical-controls">
                    <div class="controls-row">
                        <div class="control-group">
                            <label for="tickerInput">Stock/Index Symbol</label>
                            <input type="text" id="tickerInput" class="form-control" 
                                   placeholder="e.g., NIFTY50, AAPL, RELIANCE" 
                                   list="tickerSuggestions">
                            <datalist id="tickerSuggestions">
                                <option value="NIFTY50">NIFTY 50 Index</option>
                                <option value="BANKNIFTY">Bank NIFTY Index</option>
                                <option value="S&P500">S&P 500 Index</option>
                                <option value="USDINR">USD/INR Currency</option>
                                <option value="AAPL">Apple Inc.</option>
                                <option value="MSFT">Microsoft Corp.</option>
                                <option value="GOOGL">Alphabet Inc.</option>
                                <option value="TSLA">Tesla Inc.</option>
                                <option value="RELIANCE">Reliance Industries</option>
                                <option value="TCS">Tata Consultancy Services</option>
                                <option value="INFY">Infosys Ltd.</option>
                                <option value="HDFCBANK">HDFC Bank Ltd.</option>
                            </datalist>
                        </div>
                        
                        <div class="control-group">
                            <label for="periodSelect">Analysis Period</label>
                            <select id="periodSelect" class="form-control">
                                ${periodOptions}
                            </select>
                        </div>
                        
                        <div class="control-group">
                            <button id="analyzeBtn" class="btn btn--primary">
                                <i class="fas fa-chart-line"></i> Analyze
                            </button>
                            <button id="clearAllBtn" class="btn btn--outline">
                                <i class="fas fa-trash"></i> Clear All
                            </button>
                        </div>
                    </div>
                    
                    <!-- Quick Preset Buttons -->
                    <div class="preset-buttons">
                        <h6>Quick Presets:</h6>
                        <div class="preset-grid">
                            <button class="preset-btn" data-ticker="NIFTY50" data-period="1D">
                                <i class="fas fa-chart-line"></i> NIFTY 1D
                            </button>
                            <button class="preset-btn" data-ticker="S&P500" data-period="1D">
                                <i class="fas fa-flag-usa"></i> S&P 500 1D
                            </button>
                            <button class="preset-btn" data-ticker="USDINR" data-period="1D">
                                <i class="fas fa-dollar-sign"></i> USD/INR 1D
                            </button>
                            <button class="preset-btn" data-ticker="BANKNIFTY" data-period="1D">
                                <i class="fas fa-university"></i> Bank NIFTY 1D
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Analysis Results Container -->
                <div id="technicalAnalysisResults" class="technical-analysis-results">
                    <div class="empty-state">
                        <i class="fas fa-chart-bar fa-3x"></i>
                        <h3>Technical Analysis Dashboard</h3>
                        <p>Enter a symbol above or use quick presets to start analyzing technical indicators</p>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Analyze button
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.handleAnalyzeClick());
        }
        
        // Clear all button
        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.clearAllAnalysis());
        }
        
        // Preset buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.preset-btn')) {
                const btn = e.target.closest('.preset-btn');
                const ticker = btn.dataset.ticker;
                const period = btn.dataset.period;
                if (ticker && period) {
                    this.analyzeSymbol(ticker, period);
                }
            }
        });
        
        // Enter key support
        const tickerInput = document.getElementById('tickerInput');
        if (tickerInput) {
            tickerInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAnalyzeClick();
                }
            });
        }
    }

    async loadDefaultIndicators() {
        console.log('Loading default technical indicators...');
        
        // Load default tickers with 1D timeframe
        for (const ticker of this.defaultTickers.slice(0, 2)) { // Limit to 2 to avoid overload
            try {
                await this.analyzeSymbol(ticker, this.defaultPeriod, true);
                // Add delay between requests to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn(`Failed to load default indicator for ${ticker}:`, error);
            }
        }
    }

    handleAnalyzeClick() {
        const tickerInput = document.getElementById('tickerInput');
        const periodSelect = document.getElementById('periodSelect');
        
        if (!tickerInput || !periodSelect) return;
        
        const ticker = tickerInput.value.trim().toUpperCase();
        const period = periodSelect.value;
        
        if (!ticker) {
            this.showError('Please enter a stock symbol');
            return;
        }
        
        this.analyzeSymbol(ticker, period);
    }

    async analyzeSymbol(ticker, period, silent = false) {
        if (!ticker || !period) return;
        
        const cardKey = `${ticker}_${period}`;
        
        if (this.activeCards.has(cardKey)) {
            if (!silent) {
                this.showError(`Analysis for ${ticker} (${period}) already exists`);
            }
            return;
        }
        
        try {
            if (!silent) {
                this.showLoading(true, `Analyzing ${ticker} for ${period} period...`);
            }
            
            const response = await fetch(`${this.apiBase}/indicators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: ticker,
                    period: period,
                    indicators: ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'volume']
                })
            });
            
            if (!response.ok) {
                throw new Error(`Technical analysis failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || !data.data || data.data.length === 0) {
                throw new Error('No technical data available');
            }
            
            this.renderAnalysisCard(ticker, period, data);
            this.activeCards.set(cardKey, { ticker, period, data });
            
            if (!silent) {
                console.log(`✅ Technical analysis completed for ${ticker} (${period})`);
            }
            
        } catch (error) {
            console.error(`Technical analysis error for ${ticker}:`, error);
            if (!silent) {
                this.showError(`Failed to analyze ${ticker}: ${error.message}`);
            }
        } finally {
            if (!silent) {
                this.showLoading(false);
            }
        }
    }

    renderAnalysisCard(ticker, period, data) {
        const resultsContainer = document.getElementById('technicalAnalysisResults');
        if (!resultsContainer) return;
        
        // Remove empty state if it exists
        const emptyState = resultsContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        const cardId = `analysis_${ticker}_${period}`;
        
        // Check if card already exists
        if (document.getElementById(cardId)) return;
        
        const indicators = data.indicators || {};
        const priceData = data.data || [];
        const currentPrice = priceData.length > 0 ? priceData[priceData.length - 1].close : 0;
        const timeframeCategory = data.timeframe_category || 'swing';
        const optimizationInfo = data.optimization_info || '';
        
        const cardHTML = `
            <div class="technical-analysis-card" id="${cardId}">
                <div class="card__header">
                    <div class="card-title-section">
                        <h4>${ticker} - ${period} Analysis</h4>
                        <div class="timeframe-info">
                            <span class="timeframe-category ${timeframeCategory}">${timeframeCategory.toUpperCase()}</span>
                        </div>
                        <div class="current-price">
                            Current: <span class="price-value">${this.formatPrice(currentPrice)}</span>
                        </div>
                        ${optimizationInfo ? `<div class="optimization-note">${optimizationInfo}</div>` : ''}
                    </div>
                    <button class="remove-card-btn" onclick="technicalIndicators.removeAnalysisCard('${cardId}', '${ticker}_${period}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="card__body">
                    <!-- Key Indicators Summary -->
                    <div class="indicators-summary">
                        ${this.renderIndicatorsSummary(indicators)}
                    </div>
                    
                    <!-- Price Chart Container -->
                    <div class="chart-container">
                        <canvas id="chart_${cardId}" width="400" height="200"></canvas>
                    </div>
                    
                    <!-- Secondary Technical Indicators Charts -->
                    <div class="secondary-charts">
                        <!-- MACD Chart -->
                        <div class="secondary-chart-container">
                            <h6 class="chart-title">📈 MACD (Moving Average Convergence Divergence)</h6>
                            <canvas id="macd_chart_${cardId}" width="400" height="120"></canvas>
                        </div>
                        
                        <!-- RSI Chart -->
                        <div class="secondary-chart-container">
                            <h6 class="chart-title">📊 RSI (Relative Strength Index)</h6>
                            <canvas id="rsi_chart_${cardId}" width="400" height="120"></canvas>
                        </div>
                    </div>
                    
                    <!-- Detailed Indicators -->
                    <div class="detailed-indicators">
                        <h6>Detailed Analysis</h6>
                        <div class="indicators-grid">
                            ${this.renderDetailedIndicators(indicators)}
                        </div>
                    </div>
                    
                    <!-- Trading Signals -->
                    <div class="trading-signals">
                        <h6>Trading Signals</h6>
                        <div class="signals-list">
                            ${this.generateTradingSignals(indicators)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        resultsContainer.insertAdjacentHTML('beforeend', cardHTML);
        
        // Initialize chart for this card with indicators for overlays
        setTimeout(() => {
            this.initializeChart(cardId, ticker, priceData, indicators);
            this.initializeMACDChart(cardId, ticker, priceData, indicators);
            this.initializeRSIChart(cardId, ticker, priceData, indicators);
        }, 100);
    }

    renderIndicatorsSummary(indicators) {
        // Handle new enhanced indicator structure
        const latest = indicators.latest || indicators;
        
        // Extract RSI with dynamic period detection
        const rsiKey = Object.keys(latest).find(key => key.startsWith('rsi_')) || 'rsi_14';
        const rsi = latest[rsiKey] || latest.rsi || 50;
        const rsiPeriod = rsiKey.split('_')[1] || '14';
        
        // Extract MACD data
        const macd = {
            line: latest.macd_line || latest['macd.line'] || 0,
            signal: latest.macd_signal || latest['macd.signal'] || 0,
            histogram: latest.macd_histogram || latest['macd.histogram'] || 0
        };
        
        // Extract moving averages with dynamic period detection  
        const smaKeys = Object.keys(latest).filter(key => key.startsWith('sma_'));
        const emaKeys = Object.keys(latest).filter(key => key.startsWith('ema_'));
        
        const sma = smaKeys.length > 0 ? latest[smaKeys[0]] : (latest.sma_20 || 0);
        const ema = emaKeys.length > 0 ? latest[emaKeys[0]] : (latest.ema_20 || 0);
        
        const smaPeriod = smaKeys.length > 0 ? smaKeys[0].split('_')[1] : '20';
        const emaPeriod = emaKeys.length > 0 ? emaKeys[0].split('_')[1] : '20';
        
        return `
            <div class="summary-grid">
                <div class="summary-item">
                    <label>RSI (${rsiPeriod})</label>
                    <span class="value ${this.getRSIClass(rsi)}">${rsi.toFixed(2)}</span>
                    <small>${this.getRSISignal(rsi)}</small>
                </div>
                
                <div class="summary-item">
                    <label>MACD Signal</label>
                    <span class="value ${this.getMACDClass(macd)}">${this.getMACDSignal(macd)}</span>
                    <small>Line: ${(macd.line || 0).toFixed(4)}</small>
                </div>
                
                <div class="summary-item">
                    <label>SMA (${smaPeriod})</label>
                    <span class="value">${this.formatPrice(sma)}</span>
                    <small>Simple Moving Average</small>
                </div>
                
                <div class="summary-item">
                    <label>EMA (${emaPeriod})</label>
                    <span class="value">${this.formatPrice(ema)}</span>
                    <small>Exponential Moving Average</small>
                </div>
            </div>
        `;
    }

    renderDetailedIndicators(indicators) {
        // Handle new enhanced indicator structure
        const latest = indicators.latest || indicators;
        
        // Dynamic indicator detection based on what's available
        const details = [];
        
        // RSI indicators (detect dynamic periods)
        Object.keys(latest).forEach(key => {
            if (key.startsWith('rsi_') && key !== 'rsi_signal') {
                const period = key.split('_')[1];
                details.push({
                    name: `RSI (${period})`, 
                    value: latest[key] || 0, 
                    format: 'decimal', 
                    suffix: ''
                });
            }
        });
        
        // MACD indicators
        if (latest.macd_line !== undefined) {
            details.push({ name: 'MACD Line', value: latest.macd_line || 0, format: 'decimal', suffix: '' });
        }
        if (latest.macd_signal !== undefined) {
            details.push({ name: 'MACD Signal', value: latest.macd_signal || 0, format: 'decimal', suffix: '' });
        }
        if (latest.macd_histogram !== undefined) {
            details.push({ name: 'MACD Histogram', value: latest.macd_histogram || 0, format: 'decimal', suffix: '' });
        }
        
        // Bollinger Bands
        if (latest.bollinger_upper !== undefined) {
            details.push({ name: 'Bollinger Upper', value: latest.bollinger_upper || 0, format: 'price', suffix: '' });
        }
        if (latest.bollinger_lower !== undefined) {
            details.push({ name: 'Bollinger Lower', value: latest.bollinger_lower || 0, format: 'price', suffix: '' });
        }
        if (latest.bollinger_middle !== undefined) {
            details.push({ name: 'Bollinger Middle', value: latest.bollinger_middle || 0, format: 'price', suffix: '' });
        }
        
        // Moving Averages (detect dynamic periods)
        Object.keys(latest).forEach(key => {
            if (key.startsWith('sma_') && key !== 'sma_trend') {
                const period = key.split('_')[1];
                details.push({
                    name: `SMA (${period})`, 
                    value: latest[key] || 0, 
                    format: 'price', 
                    suffix: ''
                });
            }
        });
        
        Object.keys(latest).forEach(key => {
            if (key.startsWith('ema_')) {
                const period = key.split('_')[1];
                details.push({
                    name: `EMA (${period})`, 
                    value: latest[key] || 0, 
                    format: 'price', 
                    suffix: ''
                });
            }
        });
        
        // Volume indicators
        if (latest.volume_avg !== undefined) {
            details.push({ name: 'Volume (Avg)', value: latest.volume_avg || 0, format: 'volume', suffix: '' });
        }
        if (latest.volume_current !== undefined) {
            details.push({ name: 'Volume (Current)', value: latest.volume_current || 0, format: 'volume', suffix: '' });
        }
        if (latest.volume_ratio !== undefined) {
            details.push({ name: 'Volume Ratio', value: latest.volume_ratio || 1.0, format: 'decimal', suffix: 'x' });
        }
        
        // Additional timeframe-specific indicators
        if (latest.stoch_k !== undefined) {
            details.push({ name: 'Stochastic %K', value: latest.stoch_k || 0, format: 'decimal', suffix: '' });
        }
        if (latest.stoch_d !== undefined) {
            details.push({ name: 'Stochastic %D', value: latest.stoch_d || 0, format: 'decimal', suffix: '' });
        }
        if (latest.adx !== undefined) {
            details.push({ name: 'ADX', value: latest.adx || 0, format: 'decimal', suffix: '' });
        }
        
        return details.map(item => `
            <div class="indicator-detail">
                <span class="indicator-name">${item.name}</span>
                <span class="indicator-value">${this.formatIndicatorValue(item.value, item.format)}${item.suffix}</span>
            </div>
        `).join('');
    }

    generateTradingSignals(indicators) {
        const signals = [];
        
        // Handle new enhanced indicator structure
        const latest = indicators.latest || indicators;
        const timeframeInfo = indicators.timeframe_info || {};
        
        // RSI signals (dynamic period detection)
        const rsiKey = Object.keys(latest).find(key => key.startsWith('rsi_')) || 'rsi_14';
        const rsi = latest[rsiKey] || latest.rsi || 50;
        const rsiSignal = latest.rsi_signal;
        
        if (rsiSignal === 'overbought') {
            signals.push({ type: 'warning', message: `RSI (${rsiKey.split('_')[1]}) indicates overbought conditions - Consider selling` });
        } else if (rsiSignal === 'oversold') {
            signals.push({ type: 'success', message: `RSI (${rsiKey.split('_')[1]}) indicates oversold conditions - Consider buying` });
        }
        
        // MACD signals
        const macdSignalType = latest.macd_signal_type;
        if (macdSignalType === 'bullish') {
            signals.push({ type: 'success', message: 'MACD line above signal - Bullish momentum' });
        } else if (macdSignalType === 'bearish') {
            signals.push({ type: 'warning', message: 'MACD line below signal - Bearish momentum' });
        }
        
        // Moving Average Trend
        const smaTrend = latest.sma_trend;
        if (smaTrend === 'bullish') {
            signals.push({ type: 'success', message: 'Fast SMA above slow SMA - Bullish trend' });
        } else if (smaTrend === 'bearish') {
            signals.push({ type: 'warning', message: 'Fast SMA below slow SMA - Bearish trend' });
        }
        
        // Volume signals
        const volumeSignal = latest.volume_signal;
        if (volumeSignal === 'high') {
            signals.push({ type: 'info', message: 'High volume detected - Increased activity' });
        } else if (volumeSignal === 'low') {
            signals.push({ type: 'info', message: 'Low volume - Decreased activity' });
        }
        
        // Bollinger Bands position
        const bollingerPosition = latest.bollinger_position;
        if (bollingerPosition === 'above_upper') {
            signals.push({ type: 'warning', message: 'Price above upper Bollinger Band - Potential reversal' });
        } else if (bollingerPosition === 'below_lower') {
            signals.push({ type: 'success', message: 'Price below lower Bollinger Band - Potential reversal' });
        }
        
        // ADX for intraday timeframes
        const adxStrength = latest.adx_strength;
        if (adxStrength === 'strong') {
            signals.push({ type: 'info', message: 'Strong trend detected (ADX) - Follow the trend' });
        } else if (adxStrength === 'weak') {
            signals.push({ type: 'neutral', message: 'Weak trend (ADX) - Range-bound market' });
        }
        
        // Overall signal
        const overallSignal = latest.overall_signal;
        const signalStrength = latest.signal_strength || 0;
        
        if (overallSignal && signalStrength > 0.6) {
            const signalType = overallSignal === 'bullish' ? 'success' : overallSignal === 'bearish' ? 'warning' : 'neutral';
            signals.push({ 
                type: signalType, 
                message: `Overall ${overallSignal.toUpperCase()} signal (${(signalStrength * 100).toFixed(0)}% confidence)` 
            });
        }
        
        // Timeframe-specific optimization note
        if (timeframeInfo.optimization) {
            signals.push({ 
                type: 'info', 
                message: `${timeframeInfo.optimization}` 
            });
        }
        
        if (signals.length === 0) {
            signals.push({ type: 'neutral', message: 'No clear signals detected - Monitor price action' });
        }
        
        return signals.map(signal => `
            <div class="signal-item signal-${signal.type}">
                <i class="fas fa-${this.getSignalIcon(signal.type)}"></i>
                <span>${signal.message}</span>
            </div>
        `).join('');
    }

    initializeChart(cardId, ticker, priceData, indicators = {}) {
        const canvas = document.getElementById(`chart_${cardId}`);
        if (!canvas) return;
        
        try {
            const ctx = canvas.getContext('2d');
            
            // Prepare chart data with enhanced overlays
            const dataLength = Math.min(50, priceData.length);
            const labels = priceData.slice(-dataLength).map(d => {
                const date = new Date(d.timestamp);
                return date.toLocaleDateString();
            });
            const prices = priceData.slice(-dataLength).map(d => d.close);
            
            // ENHANCEMENT 1: More prominent main price line with enhanced visibility
            const datasets = [{
                label: `${ticker} Price`,
                data: prices,
                borderColor: '#1FB8CD',
                backgroundColor: 'rgba(31, 184, 205, 0.15)',
                borderWidth: 3, // INCREASED from 2 to 3 for better visibility
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointBackgroundColor: '#1FB8CD',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                yAxisID: 'price',
                order: 1 // Ensure price line is on top
            }];
            
            // ENHANCEMENT 2: Better technical indicator overlays with improved visibility
            const series = indicators?.series || {};
            const latest = indicators?.latest || {};
            
            // Dynamic SMA detection with multiple periods and enhanced styling
            const smaKeys = Object.keys(latest).filter(key => key.startsWith('sma_')).sort((a, b) => {
                const periodA = parseInt(a.split('_')[1]);
                const periodB = parseInt(b.split('_')[1]);
                return periodA - periodB;
            });
            
            const smaColors = ['#FF6B6B', '#FF8E8E', '#FFB0B0']; // Red gradient for different SMA periods
            smaKeys.forEach((smaKey, index) => {
                if (series[smaKey] && series[smaKey].length > 0) {
                    const period = smaKey.split('_')[1];
                    datasets.push({
                        label: `SMA ${period}`,
                        data: series[smaKey].slice(-dataLength),
                        borderColor: smaColors[index % smaColors.length],
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: index === 0 ? [] : [5, 3], // First SMA solid, others dashed
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        yAxisID: 'price',
                        order: 10 + index
                    });
                }
            });
            
            // Dynamic EMA detection with multiple periods and enhanced styling
            const emaKeys = Object.keys(latest).filter(key => key.startsWith('ema_')).sort((a, b) => {
                const periodA = parseInt(a.split('_')[1]);
                const periodB = parseInt(b.split('_')[1]);
                return periodA - periodB;
            });
            
            const emaColors = ['#4ECDC4', '#6BD5CE', '#88DDD8']; // Teal gradient for different EMA periods
            emaKeys.forEach((emaKey, index) => {
                if (series[emaKey] && series[emaKey].length > 0) {
                    const period = emaKey.split('_')[1];
                    datasets.push({
                        label: `EMA ${period}`,
                        data: series[emaKey].slice(-dataLength),
                        borderColor: emaColors[index % emaColors.length],
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: index === 0 ? [3, 1] : [6, 2], // Different dash patterns
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        yAxisID: 'price',
                        order: 20 + index
                    });
                }
            });
            
            // ENHANCEMENT 3: Enhanced Bollinger Bands with proper fill
            if (series.bollinger_upper && series.bollinger_lower && series.bollinger_middle) {
                // Upper band
                datasets.push({
                    label: 'Bollinger Upper',
                    data: series.bollinger_upper.slice(-dataLength),
                    borderColor: 'rgba(255, 107, 107, 0.6)',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'price',
                    order: 30
                });
                
                // Middle band (SMA basis)
                datasets.push({
                    label: 'Bollinger Middle',
                    data: series.bollinger_middle.slice(-dataLength),
                    borderColor: 'rgba(255, 107, 107, 0.4)',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderDash: [2, 2],
                    fill: false,
                    pointRadius: 0,
                    yAxisID: 'price',
                    order: 32
                });
                
                // Lower band with fill between upper and lower
                datasets.push({
                    label: 'Bollinger Lower',
                    data: series.bollinger_lower.slice(-dataLength),
                    borderColor: 'rgba(255, 107, 107, 0.6)',
                    backgroundColor: 'rgba(255, 107, 107, 0.08)',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: '-2', // Fill between this and upper band (2 datasets back)
                    pointRadius: 0,
                    yAxisID: 'price',
                    order: 31
                });
            }
            
            // ENHANCEMENT 4: Volume overlay on secondary axis
            if (priceData.length > 0 && priceData[0].volume !== undefined) {
                const volumeData = priceData.slice(-dataLength).map(d => d.volume);
                datasets.push({
                    label: 'Volume',
                    data: volumeData,
                    type: 'bar',
                    backgroundColor: 'rgba(156, 163, 175, 0.4)',
                    borderColor: 'rgba(156, 163, 175, 0.6)',
                    borderWidth: 1,
                    yAxisID: 'volume',
                    order: 40
                });
            }
            
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    // ENHANCEMENT 5: Improved scales configuration
                    scales: {
                        price: {
                            type: 'linear',
                            position: 'left',
                            beginAtZero: false,
                            // COMPREHENSIVE Y-AXIS SCALING FIX - HANDLES ALL EDGE CASES
                            min: function(context) {
                                try {
                                    const chart = context.chart;
                                    if (!chart || !chart.data || !chart.data.datasets) {
                                        console.warn('⚠️ Chart or datasets not available for Y-axis scaling');
                                        return undefined;
                                    }
                                    
                                    const datasets = chart.data.datasets;
                                    const priceDatasets = datasets.filter(d => 
                                        d.yAxisID === 'price' && 
                                        d.data && 
                                        Array.isArray(d.data) && 
                                        d.data.length > 0
                                    );
                                    
                                    if (priceDatasets.length === 0) {
                                        console.warn('⚠️ No valid price datasets found for Y-axis scaling');
                                        return undefined;
                                    }
                                    
                                    let allVisiblePrices = [];
                                    
                                    priceDatasets.forEach(dataset => {
                                        try {
                                            // Multiple extraction approaches for robustness
                                            const dataToProcess = dataset.data || [];
                                            
                                            dataToProcess.forEach((point, index) => {
                                                let numericValue = null;
                                                
                                                // APPROACH 1: Direct number
                                                if (typeof point === 'number' && !isNaN(point) && isFinite(point)) {
                                                    numericValue = point;
                                                }
                                                // APPROACH 2: Chart.js point object {x, y}
                                                else if (point && typeof point === 'object' && point.y !== undefined) {
                                                    if (typeof point.y === 'number' && !isNaN(point.y) && isFinite(point.y)) {
                                                        numericValue = point.y;
                                                    }
                                                }
                                                // APPROACH 3: Array format [x, y]
                                                else if (Array.isArray(point) && point.length >= 2) {
                                                    const yValue = point[1];
                                                    if (typeof yValue === 'number' && !isNaN(yValue) && isFinite(yValue)) {
                                                        numericValue = yValue;
                                                    }
                                                }
                                                // APPROACH 4: Object with timestamp/value structure
                                                else if (point && typeof point === 'object') {
                                                    // Try common price field names
                                                    const priceFields = ['close', 'value', 'price', 'y'];
                                                    for (const field of priceFields) {
                                                        if (point[field] !== undefined && 
                                                            typeof point[field] === 'number' && 
                                                            !isNaN(point[field]) && 
                                                            isFinite(point[field])) {
                                                            numericValue = point[field];
                                                            break;
                                                        }
                                                    }
                                                }
                                                
                                                // Only add valid, reasonable price values
                                                if (numericValue !== null && numericValue > 0 && numericValue < 1000000) {
                                                    allVisiblePrices.push(numericValue);
                                                }
                                            });
                                        } catch (datasetError) {
                                            console.warn('⚠️ Error processing dataset:', datasetError);
                                        }
                                    });
                                    
                                    // Robust price calculation with outlier protection
                                    if (allVisiblePrices.length > 0) {
                                        // Remove outliers (values beyond 3 standard deviations)
                                        const mean = allVisiblePrices.reduce((a, b) => a + b, 0) / allVisiblePrices.length;
                                        const variance = allVisiblePrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / allVisiblePrices.length;
                                        const stdDev = Math.sqrt(variance);
                                        
                                        const filteredPrices = allVisiblePrices.filter(price => 
                                            Math.abs(price - mean) <= 3 * stdDev
                                        );
                                        
                                        if (filteredPrices.length > 0) {
                                            const minPrice = Math.min(...filteredPrices);
                                            const maxPrice = Math.max(...filteredPrices);
                                            const priceRange = maxPrice - minPrice;
                                            
                                            // Dynamic padding based on price range
                                            let paddingPercent = 0.02; // Default 2%
                                            if (priceRange < minPrice * 0.01) paddingPercent = 0.005; // 0.5% for tight ranges
                                            else if (priceRange > minPrice * 0.1) paddingPercent = 0.05; // 5% for wide ranges
                                            
                                            const result = minPrice * (1 - paddingPercent);
                                            
                                            console.log(`📊 Y-axis Min: ${result.toFixed(2)} (${filteredPrices.length}/${allVisiblePrices.length} prices, range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}, padding: ${(paddingPercent*100).toFixed(1)}%)`);
                                            return result;
                                        }
                                    }
                                    
                                    console.warn('⚠️ No valid price data found after filtering - using auto-scale');
                                    return undefined;
                                    
                                } catch (error) {
                                    console.error('❌ Y-axis min calculation error:', error);
                                    return undefined;
                                }
                            },
                            max: function(context) {
                                try {
                                    const chart = context.chart;
                                    if (!chart || !chart.data || !chart.data.datasets) {
                                        console.warn('⚠️ Chart or datasets not available for Y-axis scaling');
                                        return undefined;
                                    }
                                    
                                    const datasets = chart.data.datasets;
                                    const priceDatasets = datasets.filter(d => 
                                        d.yAxisID === 'price' && 
                                        d.data && 
                                        Array.isArray(d.data) && 
                                        d.data.length > 0
                                    );
                                    
                                    if (priceDatasets.length === 0) {
                                        console.warn('⚠️ No valid price datasets found for Y-axis scaling');
                                        return undefined;
                                    }
                                    
                                    let allVisiblePrices = [];
                                    
                                    priceDatasets.forEach(dataset => {
                                        try {
                                            const dataToProcess = dataset.data || [];
                                            
                                            dataToProcess.forEach((point, index) => {
                                                let numericValue = null;
                                                
                                                // APPROACH 1: Direct number
                                                if (typeof point === 'number' && !isNaN(point) && isFinite(point)) {
                                                    numericValue = point;
                                                }
                                                // APPROACH 2: Chart.js point object {x, y}
                                                else if (point && typeof point === 'object' && point.y !== undefined) {
                                                    if (typeof point.y === 'number' && !isNaN(point.y) && isFinite(point.y)) {
                                                        numericValue = point.y;
                                                    }
                                                }
                                                // APPROACH 3: Array format [x, y]
                                                else if (Array.isArray(point) && point.length >= 2) {
                                                    const yValue = point[1];
                                                    if (typeof yValue === 'number' && !isNaN(yValue) && isFinite(yValue)) {
                                                        numericValue = yValue;
                                                    }
                                                }
                                                // APPROACH 4: Object with timestamp/value structure
                                                else if (point && typeof point === 'object') {
                                                    // Try common price field names
                                                    const priceFields = ['close', 'value', 'price', 'y'];
                                                    for (const field of priceFields) {
                                                        if (point[field] !== undefined && 
                                                            typeof point[field] === 'number' && 
                                                            !isNaN(point[field]) && 
                                                            isFinite(point[field])) {
                                                            numericValue = point[field];
                                                            break;
                                                        }
                                                    }
                                                }
                                                
                                                // Only add valid, reasonable price values
                                                if (numericValue !== null && numericValue > 0 && numericValue < 1000000) {
                                                    allVisiblePrices.push(numericValue);
                                                }
                                            });
                                        } catch (datasetError) {
                                            console.warn('⚠️ Error processing dataset:', datasetError);
                                        }
                                    });
                                    
                                    // Robust price calculation with outlier protection
                                    if (allVisiblePrices.length > 0) {
                                        // Remove outliers (values beyond 3 standard deviations)
                                        const mean = allVisiblePrices.reduce((a, b) => a + b, 0) / allVisiblePrices.length;
                                        const variance = allVisiblePrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / allVisiblePrices.length;
                                        const stdDev = Math.sqrt(variance);
                                        
                                        const filteredPrices = allVisiblePrices.filter(price => 
                                            Math.abs(price - mean) <= 3 * stdDev
                                        );
                                        
                                        if (filteredPrices.length > 0) {
                                            const minPrice = Math.min(...filteredPrices);
                                            const maxPrice = Math.max(...filteredPrices);
                                            const priceRange = maxPrice - minPrice;
                                            
                                            // Dynamic padding based on price range
                                            let paddingPercent = 0.02; // Default 2%
                                            if (priceRange < minPrice * 0.01) paddingPercent = 0.005; // 0.5% for tight ranges
                                            else if (priceRange > minPrice * 0.1) paddingPercent = 0.05; // 5% for wide ranges
                                            
                                            const result = maxPrice * (1 + paddingPercent);
                                            
                                            console.log(`📊 Y-axis Max: ${result.toFixed(2)} (${filteredPrices.length}/${allVisiblePrices.length} prices, padding: ${(paddingPercent*100).toFixed(1)}%)`);
                                            return result;
                                        }
                                    }
                                    
                                    console.warn('⚠️ No valid price data found after filtering - using auto-scale');
                                    return undefined;
                                    
                                } catch (error) {
                                    console.error('❌ Y-axis max calculation error:', error);
                                    return undefined;
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.08)',
                                lineWidth: 1
                            },
                            border: {
                                color: 'rgba(0, 0, 0, 0.2)',
                                width: 1
                            },
                            title: {
                                display: true,
                                text: 'Price',
                                color: '#374151',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                }
                            },
                            ticks: {
                                color: '#6B7280',
                                font: {
                                    size: 11
                                },
                                callback: function(value) {
                                    return value.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
                                }
                            }
                        },
                        volume: {
                            type: 'linear',
                            position: 'right',
                            beginAtZero: true,
                            max: function(context) {
                                const volumeDataset = context.chart.data.datasets.find(d => d.label === 'Volume');
                                if (volumeDataset && volumeDataset.data.length > 0) {
                                    return Math.max(...volumeDataset.data) * 4; // Scale volume to 25% of chart height
                                }
                                return 1000;
                            },
                            grid: {
                                display: false // Hide volume grid to reduce clutter
                            },
                            border: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Volume',
                                color: '#9CA3AF',
                                font: {
                                    size: 10
                                }
                            },
                            ticks: {
                                display: false // Hide volume ticks to reduce clutter
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)',
                                lineWidth: 1
                            },
                            border: {
                                color: 'rgba(0, 0, 0, 0.1)',
                                width: 1
                            },
                            ticks: {
                                color: '#6B7280',
                                font: {
                                    size: 10
                                },
                                maxTicksLimit: 8
                            }
                        }
                    },
                    // ENHANCEMENT 6: Enhanced plugins configuration
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'start',
                            labels: {
                                usePointStyle: true,
                                pointStyle: 'line',
                                font: {
                                    size: 11
                                },
                                color: '#374151',
                                padding: 15,
                                filter: function(legendItem, chartData) {
                                    // Only show legend for datasets with data
                                    const dataset = chartData.datasets[legendItem.datasetIndex];
                                    return dataset.data && dataset.data.length > 0 && 
                                           dataset.data.some(val => val != null && val !== 0);
                                },
                                generateLabels: function(chart) {
                                    const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                    // Highlight the main price line in legend
                                    labels.forEach((label, index) => {
                                        if (label.text.includes('Price')) {
                                            label.fontStyle = 'bold';
                                            label.strokeStyle = label.fillStyle;
                                            label.lineWidth = 3;
                                        }
                                    });
                                    return labels;
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            titleColor: '#333',
                            bodyColor: '#666',
                            borderColor: '#ccc',
                            borderWidth: 1,
                            callbacks: {
                                title: function(context) {
                                    return context[0].label;
                                },
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    let value = context.parsed.y;
                                    
                                    if (label.includes('Volume')) {
                                        value = value.toLocaleString();
                                    } else {
                                        value = value.toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4
                                        });
                                    }
                                    
                                    return `${label}: ${value}`;
                                },
                                afterBody: function(context) {
                                    // Add additional context for main price
                                    const priceContext = context.find(c => c.dataset.label.includes('Price'));
                                    if (priceContext && context.length > 1) {
                                        const price = priceContext.parsed.y;
                                        const dataIndex = priceContext.dataIndex;
                                        
                                        if (dataIndex > 0) {
                                            const prevPrice = priceContext.dataset.data[dataIndex - 1];
                                            const change = price - prevPrice;
                                            const changePercent = ((change / prevPrice) * 100);
                                            const changeText = change >= 0 ? '+' : '';
                                            
                                            return [`Change: ${changeText}${change.toFixed(4)} (${changeText}${changePercent.toFixed(2)}%)`];
                                        }
                                    }
                                    return [];
                                }
                            }
                        }
                    },
                    // ENHANCEMENT 7: Improved animations
                    animation: {
                        duration: 750,
                        easing: 'easeInOutQuart'
                    },
                    elements: {
                        point: {
                            hoverRadius: 6,
                            hoverBorderWidth: 2
                        },
                        line: {
                            tension: 0.2
                        }
                    }
                }
            });
            
            this.chartInstances.set(cardId, chart);
            
        } catch (error) {
            console.error(`Chart initialization error for ${cardId}:`, error);
        }
    }

    initializeMACDChart(cardId, ticker, priceData, indicators = {}) {
        const canvas = document.getElementById(`macd_chart_${cardId}`);
        if (!canvas) return;
        
        try {
            const ctx = canvas.getContext('2d');
            const series = indicators?.series || {};
            
            // Prepare chart data
            const dataLength = Math.min(50, priceData.length);
            const labels = priceData.slice(-dataLength).map(d => {
                const date = new Date(d.timestamp);
                return date.toLocaleDateString();
            });
            
            const datasets = [];
            
            // MACD Line
            if (series.macd_line && series.macd_line.length > 0) {
                datasets.push({
                    label: 'MACD Line',
                    data: series.macd_line.slice(-dataLength),
                    borderColor: '#1FB8CD',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.2
                });
            }
            
            // MACD Signal Line
            if (series.macd_signal && series.macd_signal.length > 0) {
                datasets.push({
                    label: 'Signal Line',
                    data: series.macd_signal.slice(-dataLength),
                    borderColor: '#FF6B6B',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [3, 3],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.2
                });
            }
            
            // MACD Histogram
            if (series.macd_histogram && series.macd_histogram.length > 0) {
                datasets.push({
                    label: 'Histogram',
                    data: series.macd_histogram.slice(-dataLength),
                    type: 'bar',
                    backgroundColor: function(context) {
                        const value = context.parsed.y;
                        return value >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
                    },
                    borderColor: function(context) {
                        const value = context.parsed.y;
                        return value >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
                    },
                    borderWidth: 1
                });
            }
            
            const macdChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            title: {
                                display: true,
                                text: 'MACD Value',
                                font: { size: 11 }
                            },
                            ticks: {
                                font: { size: 10 },
                                callback: function(value) {
                                    return value.toFixed(4);
                                }
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.03)'
                            },
                            ticks: {
                                font: { size: 9 },
                                maxTicksLimit: 6
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 10 },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            titleColor: '#333',
                            bodyColor: '#666',
                            borderColor: '#ccc',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 500
                    }
                }
            });
            
            this.chartInstances.set(`macd_${cardId}`, macdChart);
            
        } catch (error) {
            console.error(`MACD chart initialization error for ${cardId}:`, error);
        }
    }

    initializeRSIChart(cardId, ticker, priceData, indicators = {}) {
        const canvas = document.getElementById(`rsi_chart_${cardId}`);
        if (!canvas) return;
        
        try {
            const ctx = canvas.getContext('2d');
            const series = indicators?.series || {};
            
            // Prepare chart data
            const dataLength = Math.min(50, priceData.length);
            const labels = priceData.slice(-dataLength).map(d => {
                const date = new Date(d.timestamp);
                return date.toLocaleDateString();
            });
            
            const datasets = [];
            
            // Find RSI data (detect dynamic periods)
            const rsiKeys = Object.keys(series).filter(key => key.startsWith('rsi_'));
            
            const rsiColors = ['#8B5CF6', '#EC4899', '#F59E0B']; // Purple, pink, amber
            rsiKeys.forEach((rsiKey, index) => {
                if (series[rsiKey] && series[rsiKey].length > 0) {
                    const period = rsiKey.split('_')[1] || '14';
                    datasets.push({
                        label: `RSI (${period})`,
                        data: series[rsiKey].slice(-dataLength),
                        borderColor: rsiColors[index % rsiColors.length],
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.3
                    });
                }
            });
            
            // Fallback to generic RSI if no specific periods found
            if (datasets.length === 0 && series.rsi && series.rsi.length > 0) {
                datasets.push({
                    label: 'RSI (14)',
                    data: series.rsi.slice(-dataLength),
                    borderColor: '#8B5CF6',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.3
                });
            }
            
            const rsiChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            grid: {
                                color: function(context) {
                                    // Highlight RSI threshold lines
                                    if (context.tick.value === 70 || context.tick.value === 30) {
                                        return 'rgba(239, 68, 68, 0.3)';
                                    }
                                    if (context.tick.value === 50) {
                                        return 'rgba(107, 114, 128, 0.3)';
                                    }
                                    return 'rgba(0, 0, 0, 0.05)';
                                }
                            },
                            title: {
                                display: true,
                                text: 'RSI Value',
                                font: { size: 11 }
                            },
                            ticks: {
                                font: { size: 10 },
                                stepSize: 10,
                                callback: function(value) {
                                    // Add labels for key RSI levels
                                    if (value === 70) return '70 (Overbought)';
                                    if (value === 30) return '30 (Oversold)';
                                    if (value === 50) return '50 (Neutral)';
                                    return value;
                                }
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.03)'
                            },
                            ticks: {
                                font: { size: 9 },
                                maxTicksLimit: 6
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                font: { size: 10 },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            titleColor: '#333',
                            bodyColor: '#666',
                            borderColor: '#ccc',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    let signal = '';
                                    if (value > 70) signal = ' (Overbought)';
                                    else if (value < 30) signal = ' (Oversold)';
                                    else if (Math.abs(value - 50) < 5) signal = ' (Neutral)';
                                    
                                    return `${context.dataset.label}: ${value.toFixed(1)}${signal}`;
                                },
                                afterLabel: function(context) {
                                    const value = context.parsed.y;
                                    if (value > 70) return ['⚠️ Consider selling'];
                                    if (value < 30) return ['💚 Consider buying'];
                                    return [];
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 500
                    }
                }
            });
            
            this.chartInstances.set(`rsi_${cardId}`, rsiChart);
            
        } catch (error) {
            console.error(`RSI chart initialization error for ${cardId}:`, error);
        }
    }

    removeAnalysisCard(cardId, cardKey) {
        // Remove from DOM
        const card = document.getElementById(cardId);
        if (card) {
            card.remove();
        }
        
        // Clean up all chart instances for this card
        const mainChart = this.chartInstances.get(cardId);
        if (mainChart) {
            mainChart.destroy();
            this.chartInstances.delete(cardId);
        }
        
        const macdChart = this.chartInstances.get(`macd_${cardId}`);
        if (macdChart) {
            macdChart.destroy();
            this.chartInstances.delete(`macd_${cardId}`);
        }
        
        const rsiChart = this.chartInstances.get(`rsi_${cardId}`);
        if (rsiChart) {
            rsiChart.destroy();
            this.chartInstances.delete(`rsi_${cardId}`);
        }
        
        // Remove from active cards
        this.activeCards.delete(cardKey);
        
        // Show empty state if no cards remain
        this.checkEmptyState();
        
        console.log(`Removed analysis card with all charts: ${cardId}`);
    }

    clearAllAnalysis() {
        // Remove all cards
        const resultsContainer = document.getElementById('technicalAnalysisResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-bar fa-3x"></i>
                    <h3>Technical Analysis Dashboard</h3>
                    <p>Enter a symbol above or use quick presets to start analyzing</p>
                </div>
            `;
        }
        
        // Clean up all charts
        this.chartInstances.forEach(chart => chart.destroy());
        this.chartInstances.clear();
        
        // Clear active cards
        this.activeCards.clear();
        
        console.log('All technical analysis cleared');
    }

    checkEmptyState() {
        const resultsContainer = document.getElementById('technicalAnalysisResults');
        if (!resultsContainer) return;
        
        const cards = resultsContainer.querySelectorAll('.technical-analysis-card');
        if (cards.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-bar fa-3x"></i>
                    <h3>No Active Analysis</h3>
                    <p>Use the controls above to analyze technical indicators</p>
                </div>
            `;
        }
    }

    startAutoRefresh() {
        // Auto-refresh active analyses every 5 minutes
        this.refreshInterval = setInterval(async () => {
            if (document.hidden || this.activeCards.size === 0) return;
            
            console.log('🔄 Auto-refreshing technical indicators...');
            
            for (const [cardKey, cardData] of this.activeCards) {
                try {
                    await this.refreshAnalysis(cardData.ticker, cardData.period);
                    // Add delay between refreshes
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.warn(`Failed to refresh ${cardKey}:`, error);
                }
            }
        }, 300000); // 5 minutes
    }

    async refreshAnalysis(ticker, period) {
        const cardKey = `${ticker}_${period}`;
        const cardId = `analysis_${ticker}_${period}`;
        
        try {
            const response = await fetch(`${this.apiBase}/indicators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: ticker,
                    period: period,
                    indicators: ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'volume']
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.activeCards.set(cardKey, { ticker, period, data });
                
                // Update the existing card
                this.updateAnalysisCard(cardId, ticker, period, data);
            }
            
        } catch (error) {
            console.warn(`Failed to refresh analysis for ${ticker}:`, error);
        }
    }

    updateAnalysisCard(cardId, ticker, period, data) {
        // Update indicators summary
        const summaryContainer = document.querySelector(`#${cardId} .indicators-summary`);
        if (summaryContainer) {
            summaryContainer.innerHTML = this.renderIndicatorsSummary(data.indicators || {});
        }
        
        // Update detailed indicators
        const detailsContainer = document.querySelector(`#${cardId} .indicators-grid`);
        if (detailsContainer) {
            detailsContainer.innerHTML = this.renderDetailedIndicators(data.indicators || {});
        }
        
        // Update trading signals
        const signalsContainer = document.querySelector(`#${cardId} .signals-list`);
        if (signalsContainer) {
            signalsContainer.innerHTML = this.generateTradingSignals(data.indicators || {});
        }
        
        // Update chart
        const chart = this.chartInstances.get(cardId);
        if (chart && data.data) {
            const priceData = data.data.slice(-50);
            const labels = priceData.map(d => new Date(d.timestamp).toLocaleDateString());
            const prices = priceData.map(d => d.close);
            
            chart.data.labels = labels;
            chart.data.datasets[0].data = prices;
            chart.update('none'); // Update without animation for performance
        }
    }

    // Utility methods
    formatPrice(price) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(price);
    }

    formatIndicatorValue(value, format) {
        switch (format) {
            case 'decimal':
                return value.toFixed(4);
            case 'price':
                return this.formatPrice(value);
            case 'volume':
                return value.toLocaleString();
            default:
                return value.toString();
        }
    }

    getRSIClass(rsi) {
        if (rsi > 70) return 'overbought';
        if (rsi < 30) return 'oversold';
        return 'neutral';
    }

    getRSISignal(rsi) {
        if (rsi > 70) return 'Overbought';
        if (rsi < 30) return 'Oversold';
        return 'Neutral';
    }

    getMACDClass(macd) {
        if (!macd.line || !macd.signal) return 'neutral';
        return macd.line > macd.signal ? 'bullish' : 'bearish';
    }

    getMACDSignal(macd) {
        if (!macd.line || !macd.signal) return 'No Signal';
        return macd.line > macd.signal ? 'Bullish' : 'Bearish';
    }

    getSignalIcon(type) {
        switch (type) {
            case 'success': return 'arrow-up';
            case 'warning': return 'arrow-down';
            case 'info': return 'info-circle';
            default: return 'minus';
        }
    }

    showLoading(show, message = 'Loading...') {
        // You can implement a loading indicator here if needed
        if (show) {
            console.log(`⏳ ${message}`);
        }
    }

    showError(message) {
        console.error(`❌ ${message}`);
        
        // Show error notification (if notification system exists)
        if (window.tradingPlatform && window.tradingPlatform.showNotification) {
            window.tradingPlatform.showNotification(message, 'error');
        }
    }

    // Public API
    refresh() {
        this.activeCards.forEach((cardData, cardKey) => {
            this.refreshAnalysis(cardData.ticker, cardData.period);
        });
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.chartInstances.forEach(chart => chart.destroy());
        this.chartInstances.clear();
        this.activeCards.clear();
        
        console.log('Technical Indicators destroyed');
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!window.technicalIndicators) {
            window.technicalIndicators = new TechnicalIndicators();
            console.log('✅ Technical Indicators initialized globally');
        }
    }, 1500);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.technicalIndicators) {
        window.technicalIndicators.destroy();
    }
});

// Technical Indicators specific CSS
const technicalStyles = `
<style>
.technical-indicators-interface {
    padding: var(--space-16);
}

.technical-controls {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-20);
    margin-bottom: var(--space-20);
}

.controls-row {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr;
    gap: var(--space-16);
    margin-bottom: var(--space-16);
}

.control-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
}

.control-group label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
}

.preset-buttons {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-16);
}

.preset-buttons h6 {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
}

.preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-8);
}

.preset-btn {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-8) var(--space-12);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    color: var(--color-text);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-standard);
}

.preset-btn:hover {
    background: var(--color-primary);
    color: white;
    transform: translateY(-1px);
}

.technical-analysis-results {
    display: grid;
    gap: var(--space-20);
}

.technical-analysis-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-base);
    overflow: hidden;
}

.card-title-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.current-price {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
}

.price-value {
    font-family: var(--font-family-mono);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
}

.remove-card-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: var(--space-4);
    border-radius: var(--radius-base);
    transition: all var(--duration-fast) var(--ease-standard);
}

.remove-card-btn:hover {
    background: var(--color-error);
    color: white;
}

.indicators-summary {
    margin-bottom: var(--space-20);
}

.summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-16);
}

.summary-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-12);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border);
}

.summary-item label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-semibold);
}

.summary-item .value {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    font-family: var(--font-family-mono);
}

.summary-item small {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

.value.overbought {
    color: var(--color-error);
}

.value.oversold {
    color: var(--color-success);
}

.value.neutral {
    color: var(--color-text);
}

.value.bullish {
    color: var(--color-success);
}

.value.bearish {
    color: var(--color-error);
}

.chart-container {
    height: 250px;
    margin-bottom: var(--space-20);
    position: relative;
}

.secondary-charts {
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    margin-bottom: var(--space-20);
}

.secondary-chart-container {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-16);
    transition: all var(--duration-fast) var(--ease-standard);
}

.secondary-chart-container:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px rgba(31, 184, 205, 0.1);
    transform: translateY(-1px);
}

.secondary-chart-container .chart-title {
    color: var(--color-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-12);
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding-bottom: var(--space-8);
    border-bottom: 2px solid var(--color-border);
}

.secondary-chart-container canvas {
    height: 120px !important;
    border-radius: var(--radius-base);
    background: rgba(255, 255, 255, 0.8);
}

/* ENHANCED TECHNICAL INDICATORS CHART STYLING */
.technical-analysis-card .chart-container {
    height: 320px !important; /* Increased height for better visibility */
    background: var(--color-surface) !important;
    border: 2px solid rgba(31, 184, 205, 0.12);
    border-radius: var(--radius-lg);
    padding: var(--space-16);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

.technical-analysis-card .chart-container:hover {
    border-color: rgba(31, 184, 205, 0.25);
    box-shadow: 
        inset 0 2px 4px rgba(0, 0, 0, 0.04),
        0 8px 16px rgba(31, 184, 205, 0.08);
    transform: translateY(-1px);
}

.technical-analysis-card .chart-container canvas {
    background: transparent !important;
    border-radius: 8px;
    transition: all 0.3s ease;
}

/* Enhanced chart legend styling */
.technical-analysis-card .chart-container .chartjs-legend {
    padding: 8px 0;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

/* Chart loading state */
.chart-container.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(31, 184, 205, 0.02);
    border-style: dashed;
}

.chart-container.loading::before {
    content: "📊 Loading chart...";
    color: #6B7280;
    font-size: 14px;
}

.detailed-indicators {
    margin-bottom: var(--space-20);
}

.detailed-indicators h6 {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    margin-bottom: var(--space-12);
}

.indicators-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-8);
}

.indicator-detail {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-8);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
}

.indicator-name {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
}

.indicator-value {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-family-mono);
    color: var(--color-text);
}

.trading-signals h6 {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    margin-bottom: var(--space-12);
}

.signals-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
}

.signal-item {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-12);
    border-radius: var(--radius-base);
    font-size: var(--font-size-sm);
}

.signal-success {
    background: #f0fdf4;
    color: var(--color-success);
    border: 1px solid #bbf7d0;
}

.signal-warning {
    background: #fef3c7;
    color: var(--color-warning);
    border: 1px solid #fed7aa;
}

.signal-info {
    background: #eff6ff;
    color: var(--color-info);
    border: 1px solid #bfdbfe;
}

.signal-neutral {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
}

@media (max-width: 1024px) {
    .controls-row {
        grid-template-columns: 1fr 1fr;
        gap: var(--space-12);
    }
    
    .preset-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .summary-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .indicators-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 768px) {
    .controls-row {
        grid-template-columns: 1fr;
    }
    
    .preset-grid {
        grid-template-columns: 1fr;
    }
    
    .summary-grid {
        grid-template-columns: 1fr;
    }
}
</style>
`;

// Inject technical indicators styles
if (!document.getElementById('technical-indicators-styles')) {
    const styleEl = document.createElement('div');
    styleEl.id = 'technical-indicators-styles';
    styleEl.innerHTML = technicalStyles;
    document.head.appendChild(styleEl);
}
