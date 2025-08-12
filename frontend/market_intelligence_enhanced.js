// Enhanced Market Intelligence Frontend Module
// Advanced visualizations and sentiment analysis
class EnhancedMarketIntelligence {
    constructor() {
        // Auto-detect API URL based on environment
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:5000' : window.location.origin;
        this.baseApi = `${baseUrl}/api`;
        this.charts = {};
        this.updateInterval = null;
        this.isInitialized = false;
        this.watchlistSymbols = [];
        
        // Race condition protection
        this.isLoading = false;
        this.loadingPromise = null;
        
        // Chart color schemes
        this.colors = {
            primary: '#1FB8CD',
            secondary: '#2563eb',
            success: '#16a34a',
            danger: '#dc2626',
            warning: '#d97706',
            info: '#0891b2',
            gradient: ['#1FB8CD', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#8b5cf6']
        };
        
        // Active update guards
        this.updateGuards = new Set();
        
        // Initialize connection status and loading state management
        this.initializeVisualEnhancements();
    }

    // ===== VISUAL ENHANCEMENTS SYSTEM =====
    
    initializeVisualEnhancements() {
        // Create connection status indicator
        this.createConnectionStatus();
        
        // Set up loading state management
        this.loadingStates = new Map();
        
        // Initialize data freshness tracking
        this.dataFreshness = new Map();
        
        // Add global error handling for visual feedback
        window.addEventListener('unhandledrejection', (event) => {
            this.showConnectionStatus('error', 'Connection Error');
        });
    }

    createConnectionStatus() {
        const statusElement = document.createElement('div');
        statusElement.id = 'connection-status';
        statusElement.className = 'connection-status hidden';
        document.body.appendChild(statusElement);
        this.connectionStatusElement = statusElement;
    }

    // Loading State Management
    showLoadingState(elementId, type = 'default') {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Set loading state
        this.loadingStates.set(elementId, true);
        element.classList.add('loading');

        // Create skeleton content based on type
        const skeletonContent = this.createSkeletonContent(type);
        element.innerHTML = skeletonContent;
    }

    hideLoadingState(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        this.loadingStates.set(elementId, false);
        element.classList.remove('loading');
        
        // CRITICAL FIX: Remove any skeleton content that's blocking actual content
        const skeletons = element.querySelectorAll('.loading-skeleton, [data-loading="true"]');
        skeletons.forEach(skeleton => skeleton.remove());
        
        // If element is still empty or only has skeleton content, clear it completely
        if (element.innerHTML.trim() === '' || 
            element.querySelector('.skeleton-line, .skeleton-content')) {
            element.innerHTML = '';
        }
    }

    createSkeletonContent(type) {
        switch (type) {
            case 'card':
                return `
                    <div class="skeleton-loader skeleton-title"></div>
                    <div class="skeleton-loader skeleton-price"></div>
                    <div class="skeleton-loader skeleton-text"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 80%;"></div>
                `;
            case 'chart':
                return `
                    <div class="skeleton-loader skeleton-title"></div>
                    <div class="skeleton-loader skeleton-chart"></div>
                `;
            case 'list':
                return `
                    <div class="skeleton-loader skeleton-text"></div>
                    <div class="skeleton-loader skeleton-text"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 90%;"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 70%;"></div>
                `;
            default:
                return `
                    <div class="loading-spinner">
                        <span>Loading</span>
                        <div class="spinner-dot"></div>
                        <div class="spinner-dot"></div>
                        <div class="spinner-dot"></div>
                    </div>
                `;
        }
    }

    // Connection Status Management
    showConnectionStatus(status, message) {
        if (!this.connectionStatusElement) return;

        const statusClasses = {
            'online': 'status-online',
            'offline': 'status-offline', 
            'loading': 'status-loading',
            'error': 'status-offline'
        };

        const statusMessages = {
            'online': 'Connected',
            'offline': 'Disconnected',
            'loading': 'Connecting...',
            'error': message || 'Connection Error'
        };

        this.connectionStatusElement.innerHTML = `
            <div class="status-indicator ${statusClasses[status]}">
                <div class="status-dot"></div>
                <span>${statusMessages[status]}</span>
            </div>
        `;

        // Show status temporarily
        this.connectionStatusElement.classList.remove('hidden');
        
        if (status === 'online') {
            setTimeout(() => {
                this.connectionStatusElement.classList.add('hidden');
            }, 2000);
        }
    }

    // Data Freshness Management  
    updateDataFreshness(elementId, timestamp) {
        this.dataFreshness.set(elementId, timestamp);
        
        const element = document.getElementById(elementId);
        if (!element) return;

        const now = Date.now();
        const age = now - timestamp;
        const ageMinutes = Math.floor(age / (1000 * 60));

        // Find or create timestamp element
        let timestampElement = element.querySelector('.data-timestamp');
        if (!timestampElement) {
            timestampElement = document.createElement('div');
            timestampElement.className = 'data-timestamp';
            element.appendChild(timestampElement);
        }

        // Determine freshness status
        let freshnessClass = 'data-fresh';
        if (ageMinutes > 5) freshnessClass = 'data-stale';
        if (ageMinutes > 15) freshnessClass = 'data-error';

        timestampElement.className = `data-timestamp ${freshnessClass}`;
        timestampElement.innerHTML = `
            <div class="freshness-dot"></div>
            <span>Updated ${ageMinutes === 0 ? 'now' : `${ageMinutes}m ago`}</span>
        `;
    }

    // Market Session Status
    updateSessionStatus() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const dayOfWeek = now.getDay();

        // Weekend check
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return this.setSessionStatus('closed', 'Weekend');
        }

        // Market hours (9:30 AM - 4:00 PM EST)
        const marketOpen = hours > 9 || (hours === 9 && minutes >= 30);
        const marketClose = hours < 16;
        const isMarketHours = marketOpen && marketClose;

        // Pre-market (4:00 AM - 9:30 AM)
        const isPreMarket = hours >= 4 && (hours < 9 || (hours === 9 && minutes < 30));

        // After-hours (4:00 PM - 8:00 PM)
        const isAfterHours = hours >= 16 && hours < 20;

        if (isMarketHours) {
            this.setSessionStatus('open', 'Market Open');
        } else if (isPreMarket) {
            this.setSessionStatus('pre-market', 'Pre-Market');
        } else if (isAfterHours) {
            this.setSessionStatus('after-hours', 'After Hours');
        } else {
            this.setSessionStatus('closed', 'Market Closed');
        }
    }

    setSessionStatus(status, text) {
        const sessionElements = document.querySelectorAll('.session-indicator');
        sessionElements.forEach(element => {
            element.className = `session-indicator session-${status}`;
            element.textContent = text;
        });
    }

    // DOM Update Utilities (prevent flicker)
    updateElementContent(element, newContent, useFragment = true) {
        if (!element || this.updateGuards.has(element.id)) return;
        
        if (useFragment && typeof newContent === 'string') {
            // Use document fragment to minimize reflow
            const template = document.createElement('template');
            template.innerHTML = newContent.trim();
            
            // Only update if content actually changed
            if (element.innerHTML.trim() !== newContent.trim()) {
                this.updateGuards.add(element.id);
                element.replaceChildren(...template.content.childNodes);
                setTimeout(() => this.updateGuards.delete(element.id), 100);
            }
        } else {
            // Direct update for simple content
            if (element.textContent !== newContent) {
                element.textContent = newContent;
            }
        }
    }

    safeUpdateHTML(elementId, newHTML) {
        const element = document.getElementById(elementId);
        if (element) {
            this.updateElementContent(element, newHTML);
        }
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Auto-detect API from main app
            if (window.tradingPlatform && window.tradingPlatform.stockAPI) {
                this.baseApi = window.tradingPlatform.stockAPI;
            }
            
            // Get watchlist symbols from main app
            if (window.tradingPlatform && window.tradingPlatform.watchlist) {
                this.watchlistSymbols = Array.from(window.tradingPlatform.watchlist);
            }
            
            await this.loadMarketData();
            this.setupEventListeners();
            // REMOVED: this.startAutoRefresh() - Auto-refresh disabled for Market Intelligence
            
            this.isInitialized = true;
            console.log('✅ Enhanced Market Intelligence initialized (without auto-refresh)');
            
        } catch (error) {
            console.error('❌ Failed to initialize Market Intelligence:', error);
            this.showError('Failed to initialize market intelligence');
        }
    }

    async loadMarketData() {
        // Less aggressive race condition prevention - allow overlapping requests but throttle them
        if (this.isLoading) {
            console.log('Market data loading in progress, will queue update...');
            // Don't return early - allow the update to proceed after a short delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        this.isLoading = true;
        
        try {
            // Show connection status
            this.showConnectionStatus('loading', 'Fetching market data...');
            
            // Show loading states for key components
            // REMOVED: this.showLoadingState('enhancedMarketOverview', 'card') - AI Market Overview moved to widget
            this.showLoadingState('fearGreedGauge', 'chart');
            this.showLoadingState('marketBreadthChart', 'chart');
            
            this.showLoading(true);
            
            // Fetch enhanced market data with watchlist
            const response = await fetch(`${this.baseApi}/market/enhanced`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ watchlist: this.watchlistSymbols })
            });
            
            if (!response.ok) {
                this.showConnectionStatus('error', `API Error: ${response.status}`);
                throw new Error(`API request failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Show successful connection
            this.showConnectionStatus('online', 'Data refreshed');
            
            // Hide loading states
            // REMOVED: this.hideLoadingState('enhancedMarketOverview') - AI Market Overview moved to widget
            this.hideLoadingState('fearGreedGauge');
            this.hideLoadingState('marketBreadthChart');
            
            // Cache full payload for merging with lightweight realtime updates
            this.lastData = data;
            
            // Update all components with data freshness tracking
            const updateTimestamp = Date.now();
            this.updateHeader(data);
            // REMOVED: this.updateMarketOverview(data) - AI Market Overview moved to separate widget
            // REMOVED: this.updateDataFreshness('enhancedMarketOverview', updateTimestamp) - No longer needed
            this.updateMarketAnalytics(data); // <-- Connect analytics here
            this.updateRegimeDashboard(data);
            this.updateFearGreedIndex(data);
            this.updateDataFreshness('fearGreedGauge', updateTimestamp);
            this.updateSentimentAnalysis(data);
            this.updateCorrelationMatrix(data);
            this.updateMarketBreadth(data);
            this.updateDataFreshness('marketBreadthChart', updateTimestamp);
            // Extended analytics folded into Market Analytics section instead of separate card
            this.updateSectorRotation(data);
            this.updateVolatilityEvents(data);
            
            // Legacy methods for compatibility
            this.updateWatchlistAnalysis(data.watchlist_analysis || []);
            this.updateMarketTrends(data.market_trends || {});
            
            // Load India-specific news
            this.loadIndianMarketNews();
            
            // Update session status
            this.updateSessionStatus();
            
        } catch (error) {
            console.error('Error loading market data:', error);
            this.showConnectionStatus('error', 'Failed to load data');
            
            // Hide loading states on error
            // REMOVED: this.hideLoadingState('enhancedMarketOverview') - AI Market Overview moved to widget
            this.hideLoadingState('fearGreedGauge');
            this.hideLoadingState('marketBreadthChart');
            
            this.showError('Failed to load market data');
        } finally {
            this.showLoading(false);
            this.isLoading = false;
            this.loadingPromise = null;
        }
    }

    async loadIndianMarketNews() {
        try {
            const response = await fetch(`${this.baseApi}/market/indian-news`);
            if (response.ok) {
                const indianNews = await response.json();
                this.updateIndianNewsSection(indianNews);
            } else {
                console.warn('Indian news endpoint not available, using fallback');
                this.showIndianNewsFallback();
            }
        } catch (error) {
            console.error('Error loading Indian market news:', error);
            this.showIndianNewsFallback();
        }
    }

    updateIndianNewsSection(newsData) {
        const newsContainer = document.querySelector('.indian-news-section') || 
                            document.getElementById('indian-market-news');
        
        if (!newsContainer) {
            console.warn('Indian news container not found');
            return;
        }

        const newsHtml = newsData.articles ? newsData.articles.map(article => `
            <div class="news-item indian-news">
                <div class="news-header">
                    <h6>${article.title}</h6>
                    <span class="news-time">${article.published || 'Recent'}</span>
                </div>
                <p class="news-summary">${article.summary || article.description || 'Indian market update'}</p>
                <div class="news-meta">
                    <span class="news-source">${article.source || 'Indian Markets'}</span>
                    ${article.sentiment ? `<span class="sentiment-${article.sentiment.toLowerCase()}">${article.sentiment}</span>` : ''}
                </div>
            </div>
        `).join('') : '<div class="empty-state"><p>No Indian market news available</p></div>';

        this.updateElementContent(newsContainer, `
            <div class="indian-market-news">
                <h4><i class="fas fa-flag-india"></i> India Market Focus</h4>
                <div class="news-list">
                    ${newsHtml}
                </div>
            </div>
        `);
    }

    showIndianNewsFallback() {
        const newsContainer = document.querySelector('.indian-news-section') || 
                            document.getElementById('indian-market-news');
        
        if (newsContainer) {
            this.updateElementContent(newsContainer, `
                <div class="indian-market-news">
                    <h4><i class="fas fa-flag-india"></i> India Market Focus</h4>
                    <div class="fallback-message">
                        <p><i class="fas fa-info-circle"></i> Indian market news will be updated shortly</p>
                        <small>Check back in a few minutes for the latest updates</small>
                    </div>
                </div>
            `);
        }
    }

    updateHeader(data) {
        try {
            const indices = data.indices || {};
            
            // Update header metrics with better formatting
            this.updateHeaderMetric('idxNifty', 'Nifty 50', indices.nifty50);
            this.updateHeaderMetric('idxBankNifty', 'Bank Nifty', indices.banknifty);
            this.updateHeaderMetric('idxUSDINR', 'USD/INR', indices.usdinr);
            this.updateHeaderMetric('idxSPX', 'S&P 500', indices.sp500);
            
            // Update regime score with better styling
            const regimeScoreEl = document.getElementById('regimeScore');
            if (regimeScoreEl && data.regime) {
                const score = data.regime.score || 5;
                regimeScoreEl.innerHTML = `
                    <div class="regime-score-container">
                        <span class="regime-score-value">${score.toFixed(1)}</span>
                        <span class="regime-score-max">/10</span>
                    </div>
                `;
                regimeScoreEl.className = `metric-value ${score >= 6 ? 'positive' : score <= 4 ? 'negative' : 'neutral'}`;
            }
            
        } catch (error) {
            console.error('Error updating header:', error);
        }
    }

    updateHeaderMetric(elementId, label, data) {
        if (!data) return;
        
        // Update only the value elements, preserve the existing structure
        const valueElement = document.getElementById(elementId);
        const changeElement = document.getElementById(elementId.replace('idx', '') === 'Nifty' ? 'niftyChange' :
                                                    elementId.replace('idx', '') === 'BankNifty' ? 'bankNiftyChange' :
                                                    elementId.replace('idx', '') === 'USDINR' ? 'usdInrChange' :
                                                    elementId.replace('idx', '') === 'SPX' ? 'sp500Change' : null);
        
        if (valueElement) {
            const price = data.price || 0;
            // Format price appropriately based on metric type
            if (elementId === 'idxUSDINR') {
                valueElement.textContent = price.toFixed(2);
            } else {
                valueElement.textContent = price.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
        }
        
        if (changeElement) {
            const change = data.change || 0;
            const changePct = data.change_percent || 0;
            
            changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
            changeElement.className = `metric-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
    }

    updateMarketOverview(data) {
        // AI Market Overview has been moved to a separate widget
        // This function is now obsolete - the overview is handled by AIMarketOverviewWidget
        console.log('📝 Market Intelligence: updateMarketOverview called but AI Market Overview moved to widget');
        
        // Check if the old container still exists (should not after migration)
        const container = document.getElementById('enhancedMarketOverview');
        if (container) {
            console.warn('⚠️ Old enhancedMarketOverview container still exists - should be removed');
            container.innerHTML = `
                <div class="migration-notice">
                    <i class="fas fa-info-circle"></i>
                    <h3>AI Market Overview Moved</h3>
                    <p>The AI Market Overview is now available as a header widget. Click the "AI Market Overview" button in the header to access it.</p>
                </div>
            `;
        }
        
        // If the widget exists and is visible, update it with the new data
        if (window.aiMarketWidget && window.aiMarketWidget.isVisible && data) {
            console.log('🔄 Updating AI Market Overview Widget with new data');
            window.aiMarketWidget.currentData = data;
            window.aiMarketWidget.renderOverview(data);
        }
    }

    createIndexCard(name, data, icon) {
        if (!data) return '';
        
        const price = data.price || 0;
        const change = data.change || 0;
        const changePct = data.change_percent || 0;
        const technical = data.technical || {};
        
        return `
            <div class="index-card">
                <div class="index-header">
                    <i class="${icon}"></i>
                    <span class="index-name">${name}</span>
                </div>
                <div class="index-price">${this.formatNumber(price)}</div>
                <div class="index-change ${change >= 0 ? 'positive' : 'negative'}">
                    ${change >= 0 ? '+' : ''}${this.formatNumber(change)} 
                    (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)
                </div>
                ${technical.rsi ? `
                    <div class="technical-indicators">
                        <div class="tech-item">
                            <span>RSI:</span>
                            <span class="${this.getRSIClass(technical.rsi)}">${technical.rsi.toFixed(1)}</span>
                        </div>
                        ${technical.trend ? `
                            <div class="tech-item">
                                <span>Trend:</span>
                                <span class="${technical.trend.toLowerCase()}">${technical.trend}</span>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    updateRegimeDashboard(data) {
        const container = document.querySelector('#regimeFactorsBody');
        if (!container || !data.regime) return;
        
        try {
            const factors = data.regime.factors || [];
            const interpretation = data.regime.interpretation || 'Analysis pending...';
            
            // Update factors table
            const fragment = document.createDocumentFragment();
            factors.forEach(factor => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div class="factor-name">
                            ${factor.name}
                            <div class="factor-details">${factor.details}</div>
                        </div>
                    </td>
                    <td class="text-right">
                        <span class="factor-value">${this.formatNumber(factor.value)}</span>
                    </td>
                    <td class="text-right">
                        <span class="factor-score score-${this.getScoreClass(factor.score)}">
                            ${factor.score.toFixed(1)}
                        </span>
                    </td>
                    <td>
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${(factor.score / 10) * 100}%"></div>
                        </div>
                    </td>
                `;
                fragment.appendChild(row);
            });
            
            // Only replace if content changed
            if (container.children.length !== factors.length) {
                container.replaceChildren(fragment);
            }
            
            // Update interpretation
            const interpretationEl = document.querySelector('.regime-interpretation');
            if (interpretationEl) {
                interpretationEl.textContent = interpretation;
            }
            
            // Update regime charts
            this.updateRegimeCharts(data.regime);
            
        } catch (error) {
            console.error('Error updating regime dashboard:', error);
        }
    }

    updateRegimeCharts(regimeData) {
        if (!regimeData || !Array.isArray(regimeData.factors) || regimeData.factors.length === 0) {
            const factorCanvas = document.getElementById('factorScoresChart');
            if (factorCanvas) {
                const ctx = factorCanvas.getContext('2d');
                ctx.clearRect(0, 0, factorCanvas.width, factorCanvas.height);
            }
            const regimeCanvas = document.getElementById('regimeScoreChart');
            if (regimeCanvas) {
                const ctx = regimeCanvas.getContext('2d');
                ctx.clearRect(0, 0, regimeCanvas.width, regimeCanvas.height);
            }
            return;
        }
        
        try {
            // Factor scores chart
            const factorCanvas = document.getElementById('factorScoresChart');
            if (factorCanvas) {
                const ctx = factorCanvas.getContext('2d');
                
                if (this.charts.factorScores) {
                    this.charts.factorScores.destroy();
                }
                
                const labels = regimeData.factors.map(f => f.name);
                const scores = regimeData.factors.map(f => f.score);
                
                this.charts.factorScores = new Chart(ctx, {
                    type: 'radar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Factor Scores',
                            data: scores,
                            backgroundColor: 'rgba(31, 184, 205, 0.2)',
                            borderColor: this.colors.primary,
                            borderWidth: 2,
                            pointBackgroundColor: this.colors.primary,
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                beginAtZero: true,
                                max: 10,
                                ticks: {
                                    stepSize: 2
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }
            
            // Regime score gauge
            const regimeCanvas = document.getElementById('regimeScoreChart');
            if (regimeCanvas) {
                const ctx = regimeCanvas.getContext('2d');
                
                if (this.charts.regimeScore) {
                    this.charts.regimeScore.destroy();
                }
                
                this.charts.regimeScore = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        datasets: [{
                            data: [regimeData.score, 10 - regimeData.score],
                            backgroundColor: [
                                regimeData.score >= 6 ? this.colors.success : 
                                regimeData.score <= 4 ? this.colors.danger : this.colors.warning,
                                '#e5e7eb'
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }
            
        } catch (error) {
            console.error('Error updating regime charts:', error);
        }
    }

    updateFearGreedIndex(data) {
        const container = document.querySelector('.fear-greed-container');
        if (!container || !data.fear_greed_index) return;
        
        try {
            const fearGreed = data.fear_greed_index;
            const score = fearGreed.score || 50;
            const label = fearGreed.label || 'Neutral';
            
            container.innerHTML = `
                <div class="fear-greed-widget">
                    <h4><i class="fas fa-thermometer-half"></i> Fear & Greed Index</h4>
                    <div class="fear-greed-gauge">
                        <div class="gauge-container">
                            <canvas id="fearGreedGauge" width="200" height="200"></canvas>
                            <div class="gauge-center">
                                <div class="gauge-score">${score.toFixed(0)}</div>
                                <div class="gauge-label">${label}</div>
                            </div>
                        </div>
                    </div>
                    <div class="fear-greed-components">
                        ${this.createFearGreedComponents(fearGreed.components)}
                    </div>
                </div>
            `;
            
            // Create gauge chart
            this.createFearGreedGauge(score);
            
        } catch (error) {
            console.error('Error updating Fear & Greed Index:', error);
        }
    }

    createFearGreedGauge(score) {
        const canvas = document.getElementById('fearGreedGauge');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (this.charts.fearGreed) {
            this.charts.fearGreed.destroy();
        }
        
        this.charts.fearGreed = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [score, 100 - score],
                    backgroundColor: [
                        this.getFearGreedColor(score),
                        '#e5e7eb'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                cutout: '75%',
                rotation: -90,
                circumference: 180,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    createFearGreedComponents(components) {
        if (!components) return '';
        
        return Object.entries(components).map(([key, value]) => `
            <div class="component-item">
                <span class="component-name">${this.formatComponentName(key)}</span>
                <div class="component-bar">
                    <div class="component-fill" style="width: ${value}%; background-color: ${this.getFearGreedColor(value)}"></div>
                </div>
                <span class="component-value">${value.toFixed(0)}</span>
            </div>
        `).join('');
    }

    updateSentimentAnalysis(data) {
        const container = document.querySelector('.sentiment-analysis-container');
        if (!container || !data.sentiment_analysis) return;
        
        try {
            const sentiments = data.sentiment_analysis;
            
            if (Object.keys(sentiments).length === 0) {
                container.innerHTML = `
                    <div class="sentiment-empty">
                        <i class="fas fa-newspaper fa-2x"></i>
                        <h4>No Sentiment Data</h4>
                        <p>Add stocks to your watchlist to see sentiment analysis</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = `
                <div class="sentiment-widget">
                    <h4><i class="fas fa-newspaper"></i> Watchlist Sentiment Analysis</h4>
                    <div class="sentiment-grid">
                        ${Object.entries(sentiments).map(([symbol, sentiment]) => 
                            this.createSentimentCard(symbol, sentiment)
                        ).join('')}
                    </div>
                    <div class="sentiment-summary">
                        ${this.createSentimentSummary(sentiments)}
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error updating sentiment analysis:', error);
        }
    }

    createSentimentCard(symbol, sentiment) {
        const score = sentiment.sentiment_score || 50;
        const label = sentiment.sentiment_label || 'Neutral';
        const newsCount = sentiment.news_count || 0;
        const headlines = sentiment.headlines || [];
        
        return `
            <div class="sentiment-card">
                <div class="sentiment-header">
                    <span class="sentiment-symbol">${symbol}</span>
                    <span class="sentiment-score score-${this.getSentimentClass(score)}">${score.toFixed(0)}</span>
                </div>
                <div class="sentiment-label">${label}</div>
                <div class="sentiment-news-count">${newsCount} news articles</div>
                ${headlines.length > 0 ? `
                    <div class="sentiment-headlines">
                        ${headlines.slice(0, 2).map(headline => `
                            <div class="headline-item">${headline.substring(0, 80)}...</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    createSentimentSummary(sentiments) {
        const scores = Object.values(sentiments).map(s => s.sentiment_score || 50);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        const positive = scores.filter(s => s > 60).length;
        const negative = scores.filter(s => s < 40).length;
        const neutral = scores.length - positive - negative;
        
        return `
            <div class="sentiment-summary-stats">
                <div class="summary-item">
                    <span class="summary-label">Average Sentiment:</span>
                    <span class="summary-value score-${this.getSentimentClass(avgScore)}">${avgScore.toFixed(1)}</span>
                </div>
                <div class="sentiment-breakdown">
                    <div class="breakdown-item positive">
                        <i class="fas fa-thumbs-up"></i>
                        <span>Positive: ${positive}</span>
                    </div>
                    <div class="breakdown-item neutral">
                        <i class="fas fa-minus"></i>
                        <span>Neutral: ${neutral}</span>
                    </div>
                    <div class="breakdown-item negative">
                        <i class="fas fa-thumbs-down"></i>
                        <span>Negative: ${negative}</span>
                    </div>
                </div>
            </div>
        `;
    }

    updateCorrelationMatrix(data) {
        const container = document.querySelector('.correlation-matrix-container');
        if (!container || !data.correlations) return;
        
        try {
            const correlations = data.correlations;
            
            container.innerHTML = `
                <div class="correlation-widget">
                    <h4><i class="fas fa-project-diagram"></i> Asset Correlations</h4>
                    <div class="correlation-matrix">
                        ${this.createCorrelationMatrix(correlations)}
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error updating correlation matrix:', error);
        }
    }

    createCorrelationMatrix(correlations) {
        const assets = Object.keys(correlations);
        if (assets.length === 0) return '<div class="no-data">Correlation data unavailable</div>';
        
        let matrix = '<table class="correlation-table"><thead><tr><th></th>';
        
        // Header row
        assets.forEach(asset => {
            matrix += `<th>${this.formatAssetName(asset)}</th>`;
        });
        matrix += '</tr></thead><tbody>';
        
        // Data rows
        assets.forEach(asset1 => {
            matrix += `<tr><td class="asset-label">${this.formatAssetName(asset1)}</td>`;
            assets.forEach(asset2 => {
                if (asset1 === asset2) {
                    matrix += '<td class="correlation-cell self">1.00</td>';
                } else {
                    const corr = correlations[asset1]?.[asset2] || 0;
                    const corrClass = this.getCorrelationClass(corr);
                    matrix += `<td class="correlation-cell ${corrClass}">${corr.toFixed(2)}</td>`;
                }
            });
            matrix += '</tr>';
        });
        
        matrix += '</tbody></table>';
        return matrix;
    }

    updateMarketBreadth(data) {
        const container = document.querySelector('.market-breadth-container');
        if (!container || !data.market_breadth) return;
        
        try {
            const breadth = data.market_breadth;
            const sectorPerf = breadth.sector_performance || {};
            const breadthScore = breadth.breadth_score || 50;
            
            container.innerHTML = `
                <div class="breadth-widget">
                    <h4><i class="fas fa-chart-bar"></i> Market Breadth</h4>
                    <div class="breadth-score">
                        <div class="breadth-gauge">
                            <div class="breadth-fill" style="width: ${breadthScore}%"></div>
                        </div>
                        <div class="breadth-label">Breadth Score: ${breadthScore.toFixed(0)}%</div>
                    </div>
                    <div class="sector-performance">
                        <h5>Sector Performance</h5>
                        <div class="sector-grid">
                            ${Object.entries(sectorPerf).map(([sector, perf]) => `
                                <div class="sector-item">
                                    <span class="sector-name">${sector}</span>
                                    <span class="sector-perf ${perf >= 0 ? 'positive' : 'negative'}">
                                        ${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error updating market breadth:', error);
        }
    }

    updateMarketAnalytics(data) {
        // This expects data to have a 'watchlist' or 'stocks' array/object with change_percent
        const totalStocksCount = document.getElementById('totalStocksCount');
        const gainersCount = document.getElementById('gainersCount');
        const losersCount = document.getElementById('losersCount');
        const avgChange = document.getElementById('avgChange');
        let stocks = [];
        // Prefer real-time liveStocks from tradingPlatform for immediate UI reflection
        if (window.tradingPlatform && window.tradingPlatform.liveStocks && window.tradingPlatform.liveStocks.size > 0) {
            stocks = Array.from(window.tradingPlatform.liveStocks.values());
        } else if (data && data.watchlist_analytics && data.watchlist_analytics.stocks) {
            stocks = data.watchlist_analytics.stocks;
        } else if (data && data.stocks) {
            stocks = Array.isArray(data.stocks) ? data.stocks : Object.values(data.stocks);
        }
        let gainers = 0, losers = 0, avg = 0;
        if (stocks.length > 0) {
            for (const s of stocks) {
                if (s.change_percent > 0) gainers++;
                else if (s.change_percent < 0) losers++;
                avg += s.change_percent;
            }
            avg = avg / stocks.length;
        }
        if (totalStocksCount) totalStocksCount.textContent = stocks.length;
        if (gainersCount) gainersCount.textContent = gainers;
        if (losersCount) losersCount.textContent = losers;
        if (avgChange) avgChange.textContent = avg.toFixed(2) + '%';
        // Extended watchlist analytics embedding
        const host = document.getElementById('marketAnalytics');
        if (!host) return;
        // Merge with last full dataset if current payload is lightweight
        let wa = data.watchlist_analytics || {};
        const hasDetailed = wa.top_movers || wa.sector_performance || wa.overbought || wa.oversold;
        if (!hasDetailed && this.lastData && this.lastData.watchlist_analytics) {
            // Preserve previously fetched rich analytics
            wa = { ...this.lastData.watchlist_analytics, stocks: wa.stocks || this.lastData.watchlist_analytics.stocks };
        } else if (hasDetailed) {
            // Update cache with fresh detailed analytics
            if (!this.lastData) this.lastData = {};
            this.lastData.watchlist_analytics = wa;
        }
        if (!wa || !wa.stocks) return; // nothing to show
        let extended = document.getElementById('waExtended');
        if (!extended) {
            extended = document.createElement('div');
            extended.id = 'waExtended';
            extended.className = 'wa-extended';
            extended.style.marginTop = '16px';
            host.appendChild(extended);
        }
        // Derive movers if missing
        if (!wa.top_movers && wa.stocks.length) {
            const sorted = [...wa.stocks].sort((a,b)=>a.change_percent-b.change_percent);
            wa.top_movers = {
                losers: sorted.slice(0,3),
                gainers: sorted.slice(-3).reverse()
            };
        }
        const topG = (wa.top_movers?.gainers||[]).map(s=>`<span class="tag positive">${s.symbol} ${s.change_percent}%</span>`).join(' ');
        const topL = (wa.top_movers?.losers||[]).map(s=>`<span class="tag negative">${s.symbol} ${s.change_percent}%</span>`).join(' ');
        const overbought = (wa.overbought||[]).map(s=>`<span class="tag warn">${s.symbol} RSI ${s.rsi}</span>`).join(' ');
        const oversold = (wa.oversold||[]).map(s=>`<span class="tag info">${s.symbol} RSI ${s.rsi}</span>`).join(' ');
        const volSpikes = (wa.vol_spikes||[]).map(s=>`<span class="tag accent">${s.symbol} x${s.volume_ratio}</span>`).join(' ');
        const sectorPerf = Object.entries(wa.sector_performance||{})
            .sort((a,b)=>b[1]-a[1])
            .slice(0,6)
            .map(([sec,val])=>`<div class="sector-perf-item"><span>${sec}</span><span class="${val>=0?'positive':'negative'}">${val>=0?'+':''}${val}%</span></div>`).join('');
        const adv = wa.stats?.advancers || gainers;
        const dec = wa.stats?.decliners || losers;
        let breadthNote = '';
        if (adv+dec>0) {
            const ratio = (adv/(adv+dec))*100;
            breadthNote = ratio>60? 'Bullish breadth' : ratio<40? 'Bearish breadth' : 'Neutral breadth';
        }
        extended.innerHTML = `
            <div class="wa-section">
                <h4 style="margin:4px 0 8px;"><i class="fas fa-chart-pie"></i> Watchlist Internals</h4>
                <div class="wa-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
                    <div class="wa-block"><strong>Top Gainers</strong><div class="tags">${topG||'-'}</div></div>
                    <div class="wa-block"><strong>Top Losers</strong><div class="tags">${topL||'-'}</div></div>
                    <div class="wa-block"><strong>Overbought</strong><div class="tags">${overbought||'-'}</div></div>
                    <div class="wa-block"><strong>Oversold</strong><div class="tags">${oversold||'-'}</div></div>
                    <div class="wa-block"><strong>Volume Spikes</strong><div class="tags">${volSpikes||'-'}</div></div>
                    <div class="wa-block"><strong>Breadth</strong><div class="tags">${adv} adv / ${dec} dec<br><span class="breadth-note">${breadthNote}</span></div></div>
                </div>
                <div class="wa-sector-wrapper" style="margin-top:14px;">
                    <strong>Sector Performance (avg %)</strong>
                    <div class="wa-sector-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:6px;">
                        ${sectorPerf||'<div>No sector data</div>'}
                    </div>
                </div>
            </div>`;
    }

    // Sector rotation scatter (short vs medium returns) in Market Analytics area
    updateSectorRotation(data) {
        const rotation = data.sector_rotation;
        if(!rotation || rotation.length === 0) return;
        const analytics = document.getElementById('marketAnalytics');
        if(!analytics) return;
        let canvas = document.getElementById('sectorRotationChart');
        if(!canvas) {
            const wrapper = document.createElement('div');
            wrapper.style.marginTop = '20px';
            wrapper.innerHTML = `<h4 style="margin-bottom:8px;"><i class='fas fa-sync-alt'></i> Sector Rotation</h4><canvas id="sectorRotationChart" height="260"></canvas>`;
            analytics.appendChild(wrapper);
            canvas = wrapper.querySelector('canvas');
        }
        const ctx = canvas.getContext('2d');
        if(this.charts.sectorRotation) this.charts.sectorRotation.destroy();
        const colors = {Leading:'#16a34a',Weakening:'#d97706',Lagging:'#dc2626',Improving:'#2563eb'};
        const datasets = Object.keys(colors).map(q=>({
            label: q,
            data: rotation.filter(r=>r.quadrant===q).map(r=>({x:r.medium_return,y:r.short_return,sector:r.sector})),
            backgroundColor: colors[q],
            pointRadius: 8,  // Enhancement 2: Larger scatter dots
            pointHoverRadius: 12,
            pointBorderWidth: 2,
            pointBorderColor: '#ffffff'
        }));
        // Determine dynamic axis bounds for tighter view
        const xs = rotation.map(r=>r.medium_return);
        const ys = rotation.map(r=>r.short_return);
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const pad = 0.5; // percentage padding
        function padRange(min, max){
            if (min === max) return [min-1, max+1];
            const span = max - min;
            return [min - span*pad, max + span*pad];
        }
        const [sxMin, sxMax] = padRange(xMin, xMax);
        const [syMin, syMax] = padRange(yMin, yMax);
        this.charts.sectorRotation = new Chart(ctx, {
            type: 'scatter',
            data: {datasets},
            options: {
                responsive:true,
                aspectRatio: 1.15,
                plugins:{
                    legend:{position:'bottom'},
                    tooltip:{
                        callbacks:{
                            label:(ctx)=>`${ctx.raw.sector}: Medium ${ctx.raw.x}% | Short ${ctx.raw.y}%`,
                            title: (ctx) => `${ctx[0].raw.sector} Sector`
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#1FB8CD',
                        borderWidth: 1
                    }
                },
                scales:{
                    x:{title:{display:true,text:'Medium-Term Return (%)'},grid:{color:'rgba(255,255,255,0.08)'},min:sxMin,max:sxMax},
                    y:{title:{display:true,text:'Short-Term Return (%)'},grid:{color:'rgba(255,255,255,0.08)'},min:syMin,max:syMax}
                }
            }
        });
    }

    // Volatility spike list
    updateVolatilityEvents(data){
        const events = data.volatility_events;
        if(!events) return;
        const analytics = document.getElementById('marketAnalytics');
        if(!analytics) return;
        let list = document.getElementById('volatilityEvents');
        if(!list){
            const wrapper = document.createElement('div');
            wrapper.style.marginTop='16px';
            wrapper.innerHTML = `<h4 style="margin:12px 0 4px;"><i class='fas fa-bolt'></i> Volatility Spikes</h4><ul id='volatilityEvents' class='mini-list'></ul>`;
            analytics.appendChild(wrapper);
            list = wrapper.querySelector('ul');
        }
        list.innerHTML = events.length ? events.map(e=>`<li>${e.index}: ${e.change_percent.toFixed(2)}%</li>`).join('') : '<li>No spikes</li>';
    }

    // Legacy compatibility methods
    updateWatchlistAnalysis(watchlistData) {
        console.log('📊 Updating watchlist analysis:', watchlistData);
        // This method provides backward compatibility
        // The actual watchlist analytics are now handled in updateMarketAnalytics
        if (Array.isArray(watchlistData) && watchlistData.length > 0) {
            // Process watchlist data if needed for legacy components
            const container = document.getElementById('watchlistAnalysisContainer');
            if (container) {
                container.innerHTML = `
                    <div class="watchlist-summary">
                        <p>Watchlist contains ${watchlistData.length} stocks</p>
                    </div>
                `;
            }
        }
    }

    updateMarketTrends(trendsData) {
        console.log('📈 Updating market trends:', trendsData);
        // Legacy compatibility method for market trends
        const container = document.getElementById('marketTrendsContainer');
        if (container && trendsData && Object.keys(trendsData).length > 0) {
            const trendsHtml = Object.entries(trendsData).map(([key, value]) => 
                `<div class="trend-item">
                    <span class="trend-label">${key}:</span>
                    <span class="trend-value">${value}</span>
                </div>`
            ).join('');
            
            container.innerHTML = `
                <div class="market-trends">
                    <h4>Market Trends</h4>
                    ${trendsHtml}
                </div>
            `;
        }
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.querySelector('.market-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }
        
        // Tab switching for market intelligence
        document.querySelectorAll('.market-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.switchMarketTab(tabId);
            });
        });
    }

    switchMarketTab(tabId) {
        // Remove active class from all tabs
        document.querySelectorAll('.market-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.market-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Activate selected tab
        const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
        const tabContent = document.getElementById(`${tabId}-content`);
        
        if (tabBtn) tabBtn.classList.add('active');
        if (tabContent) tabContent.classList.add('active');
    }

    // REMOVED: startAutoRefresh() - No longer needed since AI Market Overview is extracted
    // Auto-refresh functionality disabled to prevent unnecessary API calls
    // Market Intelligence tab now refreshes only on manual request
    
    // Method to refresh data (called by main app)
    refreshData() {
        // Allow refresh if not currently loading OR if enough time has passed
        const now = Date.now();
        const lastRefresh = this.lastRefreshTime || 0;
        const timeSinceLastRefresh = now - lastRefresh;
        
        if (this.isLoading && timeSinceLastRefresh < 2000) {
            console.log('Refresh throttled - recent refresh in progress');
            return;
        }
        
        if (this.isInitialized) {
            this.lastRefreshTime = now;
            this.loadingPromise = this.loadMarketData();
            return this.loadingPromise;
        }
    }
    
    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    showLoading(show) {
        const loader = document.querySelector('.market-loading');
        if (loader) {
            loader.style.display = show ? 'block' : 'none';
        }
    }

    showError(message) {
        const errorContainer = document.querySelector('.market-error');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${message}
                </div>
            `;
            errorContainer.style.display = 'block';
            
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 5000);
        }
    }

    // Utility methods
    formatNumber(value) {
        if (typeof value !== 'number') return value;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    formatAssetName(asset) {
        const names = {
            'sp500': 'S&P 500',
            'nifty50': 'Nifty 50',
            'gold': 'Gold',
            'bitcoin': 'Bitcoin',
            'usdinr': 'USD/INR'
        };
        return names[asset] || asset.toUpperCase();
    }

    formatComponentName(component) {
        const names = {
            'vix': 'VIX',
            'momentum': 'Momentum',
            'breadth': 'Breadth',
            'safe_haven': 'Safe Haven'
        };
        return names[component] || component.replace('_', ' ').toUpperCase();
    }

    getRSIClass(rsi) {
        if (rsi > 70) return 'overbought';
        if (rsi < 30) return 'oversold';
        return 'neutral';
    }

    getScoreClass(score) {
        if (score >= 7) return 'high';
        if (score >= 4) return 'medium';
        return 'low';
    }

    getSentimentClass(score) {
        if (score >= 70) return 'very-positive';
        if (score >= 60) return 'positive';
        if (score >= 40) return 'neutral';
        if (score >= 30) return 'negative';
        return 'very-negative';
    }

    getCorrelationClass(corr) {
        if (corr > 0.7) return 'strong-positive';
        if (corr > 0.3) return 'positive';
        if (corr > -0.3) return 'neutral';
        if (corr > -0.7) return 'negative';
        return 'strong-negative';
    }

    getFearGreedColor(score) {
        if (score >= 80) return '#dc2626'; // Extreme Greed - Red
        if (score >= 60) return '#d97706'; // Greed - Orange
        if (score >= 40) return '#65a30d'; // Neutral - Green
        if (score >= 20) return '#0891b2'; // Fear - Blue
        return '#7c3aed'; // Extreme Fear - Purple
    }

    destroy() {
        // Clean up charts and intervals
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.isInitialized = false;
    }
}

// Global instance
window.EnhancedMarketIntelligence = EnhancedMarketIntelligence;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for main app to initialize
    setTimeout(() => {
        if (!window.marketIntelligence) {
            window.marketIntelligence = new EnhancedMarketIntelligence();
            window.marketIntelligence.init();
        }
    }, 2000);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedMarketIntelligence;
}
