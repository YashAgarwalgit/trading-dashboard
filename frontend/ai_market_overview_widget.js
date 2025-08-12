/**
 * AI Market Overview Widget - Extracted from Market Intelligence Tab
 * Provides on-demand access to AI market analysis without automatic refresh
 */
class AIMarketOverviewWidget {
    constructor() {
        this.isVisible = false;
        this.currentData = null;
        this.isLoading = false;
        this.lastRefreshTime = null;
        
        // Use the same API detection logic as Market Intelligence
        this.baseApi = this.detectApiUrl();
        
        console.log('🤖 Widget Debug - Current location:', window.location.href);
        console.log('🤖 Widget Debug - Final API URL:', this.baseApi);
        
        this.initializeWidget();
        
        console.log('🤖 AI Market Overview Widget initialized with API:', this.baseApi);
    }
    
    detectApiUrl() {
        // First try to use the same API as Market Intelligence if available
        if (window.marketIntelligence && window.marketIntelligence.baseApi) {
            console.log('🤖 Widget: Using Market Intelligence API URL');
            return window.marketIntelligence.baseApi;
        }
        
        // Fallback to same logic as Market Intelligence
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:5000' : window.location.origin;
        return `${baseUrl}/api`;
    }
    
    initializeWidget() {
        // Setup header button click handler
        const headerBtn = document.getElementById('ai-market-overview-btn');
        if (headerBtn) {
            headerBtn.addEventListener('click', () => {
                this.toggleWidget();
            });
        } else {
            console.warn('🤖 Widget: Header button not found during initialization');
        }
        
        // Setup manual refresh button
        const refreshBtn = document.getElementById('refresh-overview-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        } else {
            console.warn('🤖 Widget: Refresh button not found during initialization');
        }
        
        // Setup close button
        const closeBtn = document.getElementById('close-overview-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideWidget();
            });
        } else {
            console.warn('🤖 Widget: Close button not found during initialization');
        }
        
        // Close widget when clicking outside
        document.addEventListener('click', (event) => {
            const widget = document.getElementById('ai-overview-widget');
            const backdrop = document.getElementById('ai-overview-backdrop');
            const headerBtn = document.getElementById('ai-market-overview-btn');
            
            if (this.isVisible && widget && headerBtn && !widget.contains(event.target) && !headerBtn.contains(event.target)) {
                this.hideWidget();
            }
            
            // Also close when clicking on backdrop
            if (backdrop && event.target === backdrop) {
                this.hideWidget();
            }
        });
        
        // Close widget on Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isVisible) {
                this.hideWidget();
            }
        });
    }
    
    toggleWidget() {
        if (this.isVisible) {
            this.hideWidget();
        } else {
            this.showWidget();
        }
    }
    
    showWidget() {
        const widget = document.getElementById('ai-overview-widget');
        const backdrop = document.getElementById('ai-overview-backdrop');
        if (!widget) {
            console.error('🤖 Widget: Widget container not found');
            return;
        }
        
        widget.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        this.isVisible = true;
        
        // Ensure refresh button exists now that widget is visible
        this.ensureRefreshButtonExists();
        
        // Load data only if not already loaded or data is stale (older than 5 minutes)
        const now = Date.now();
        const dataAge = this.lastRefreshTime ? now - this.lastRefreshTime : Infinity;
        const fiveMinutes = 5 * 60 * 1000;
        
        if (!this.currentData || dataAge > fiveMinutes) {
            this.refreshData();
        }
        
        console.log('🤖 AI Market Overview Widget opened');
    }
    
    ensureRefreshButtonExists() {
        const refreshBtn = document.getElementById('refresh-overview-btn');
        if (!refreshBtn) {
            console.warn('🤖 Widget: Creating missing refresh button');
            // Create the refresh button if it doesn't exist
            const widgetControls = document.querySelector('.widget-controls');
            if (widgetControls) {
                const refreshBtn = document.createElement('button');
                refreshBtn.id = 'refresh-overview-btn';
                refreshBtn.className = 'btn-refresh';
                refreshBtn.title = 'Refresh Data';
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.addEventListener('click', () => this.refreshData());
                widgetControls.insertBefore(refreshBtn, widgetControls.firstChild);
            }
        }
    }
    
    hideWidget() {
        const widget = document.getElementById('ai-overview-widget');
        const backdrop = document.getElementById('ai-overview-backdrop');
        if (!widget) return;
        
        widget.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        this.isVisible = false;
        
        console.log('🤖 AI Market Overview Widget closed');
    }
    
    async refreshData() {
        if (this.isLoading) {
            console.log('🤖 Widget: Refresh already in progress, skipping...');
            return;
        }
        
        this.isLoading = true;
        
        try {
            // Show loading state
            this.showLoadingState();
            
            console.log('🤖 Widget: Fetching market overview data...');
            
            // Get watchlist symbols from global trading platform if available
            let watchlistSymbols = [];
            if (window.tradingPlatform && window.tradingPlatform.watchlist) {
                watchlistSymbols = Array.from(window.tradingPlatform.watchlist);
            }
            
            // Fetch data from existing backend endpoint using POST method (same as Market Intelligence)
            const response = await fetch(`${this.baseApi}/market/enhanced`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ watchlist: watchlistSymbols })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            this.currentData = data;
            this.lastRefreshTime = Date.now();
            
            // Render the overview using the same logic as the original implementation
            this.renderOverview(data);
            
            // Update refresh button state
            this.updateRefreshButton(false);
            
            console.log('🤖 Widget: Data refreshed successfully');
            
        } catch (error) {
            console.error('🤖 Widget: Failed to refresh data:', error);
            this.showErrorState(error.message);
        } finally {
            this.isLoading = false;
        }
    }
    
    showLoadingState() {
        const content = document.getElementById('ai-overview-widget-content');
        if (!content) return;
        
        content.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-sync fa-spin fa-2x"></i>
                <h3>Loading AI Market Analysis...</h3>
                <p>Fetching latest market intelligence</p>
            </div>
        `;
        
        this.updateRefreshButton(true);
    }
    
    showErrorState(errorMessage) {
        const content = document.getElementById('ai-overview-widget-content');
        if (!content) return;
        
        content.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle fa-2x" style="color: var(--color-danger);"></i>
                <h3>Failed to Load Data</h3>
                <p>${errorMessage}</p>
                <button onclick="window.aiMarketWidget && window.aiMarketWidget.refreshData()" class="retry-btn">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
        
        this.updateRefreshButton(false);
    }
    
    updateRefreshButton(isLoading) {
        const refreshBtn = document.getElementById('refresh-overview-btn');
        if (!refreshBtn) {
            console.warn('🤖 Widget: Refresh button not found');
            return;
        }
        
        const icon = refreshBtn.querySelector('i');
        if (!icon) {
            console.warn('🤖 Widget: Refresh button icon not found');
            return;
        }
        
        try {
            if (isLoading) {
                icon.className = 'fas fa-sync fa-spin';
                refreshBtn.disabled = true;
                refreshBtn.style.opacity = '0.6';
            } else {
                icon.className = 'fas fa-sync-alt';
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '1';
            }
        } catch (error) {
            console.error('🤖 Widget: Error updating refresh button:', error);
        }
    }
    
    renderOverview(data) {
        const content = document.getElementById('ai-overview-widget-content');
        if (!content) return;
        
        try {
            // Use the exact same rendering logic as the original updateMarketOverview function
            const indices = data.indices || {};
            const summary = data.market_summary || 'Market data loading...';
            
            // Enhanced analysis (same logic as original)
            let detailedSummary = summary;
            if (data && data.stocks) {
                const stocks = Array.isArray(data.stocks) ? data.stocks : Object.values(data.stocks);
                const gainers = stocks.filter(s => s.change_percent > 0);
                const losers = stocks.filter(s => s.change_percent < 0);
                const avgChange = stocks.length > 0 ? (stocks.reduce((a, s) => a + s.change_percent, 0) / stocks.length) : 0;
                detailedSummary += `<br/><strong>Market Breadth:</strong> ${gainers.length} gainers, ${losers.length} losers.<br/>`;
                detailedSummary += `<strong>Average Change:</strong> ${avgChange.toFixed(2)}%.<br/>`;
                if (avgChange > 0.5) {
                    detailedSummary += '<span style="color:green">Bullish momentum is building across the watchlist.</span>';
                } else if (avgChange < -0.5) {
                    detailedSummary += '<span style="color:red">Bearish sentiment dominates the current session.</span>';
                } else {
                    detailedSummary += 'Market is trading sideways with no clear trend.';
                }
                if (gainers.length > losers.length) {
                    detailedSummary += '<br/>More stocks are advancing than declining.';
                } else if (losers.length > gainers.length) {
                    detailedSummary += '<br/>Decliners outnumber advancers, caution advised.';
                }
                // Highlight top gainer/loser
                if (stocks.length > 0) {
                    const topGainer = stocks.reduce((a, b) => a.change_percent > b.change_percent ? a : b);
                    const topLoser = stocks.reduce((a, b) => a.change_percent < b.change_percent ? a : b);
                    detailedSummary += `<br/><strong>Top Gainer:</strong> ${topGainer.symbol} (${topGainer.change_percent.toFixed(2)}%)`;
                    detailedSummary += `<br/><strong>Top Loser:</strong> ${topLoser.symbol} (${topLoser.change_percent.toFixed(2)}%)`;
                }
            }
            
            let html = `
                <div class="ai-market-summary-card">
                    <div class="ai-summary-header">
                        <h4><i class="fas fa-brain pulse-icon"></i> AI Market Analysis</h4>
                        <div class="ai-badge">
                            <i class="fas fa-robot"></i>
                            <span>Live Intelligence</span>
                        </div>
                    </div>
                    <div class="ai-summary-content">
                        <p class="market-analysis-text">${detailedSummary}</p>
                        <div class="summary-metrics">
                            <div class="metric-badge fear-greed">
                                <span class="metric-label">Fear & Greed</span>
                                <span class="metric-value">${data.fear_greed_index?.score ? Math.round(data.fear_greed_index.score) : 'N/A'}</span>
                            </div>
                            <div class="metric-badge breadth">
                                <span class="metric-label">Market Breadth</span>
                                <span class="metric-value">${data.market_breadth?.breadth_score !== undefined && data.market_breadth?.breadth_score !== null ? Math.round(data.market_breadth.breadth_score) + '%' : 'N/A'}</span>
                            </div>
                            <div class="metric-badge volatility">
                                <span class="metric-label">VIX Level</span>
                                <span class="metric-value">${indices.vix?.price ? indices.vix.price.toFixed(1) : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="summary-timestamp">
                        <i class="fas fa-clock"></i>
                        Analysis updated: ${new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                </div>
                <div class="indices-grid">
                    ${this.createIndexCard('S&P 500', indices.sp500, 'fas fa-chart-line')}
                    ${this.createIndexCard('NASDAQ', indices.nasdaq, 'fas fa-microchip')}
                    ${this.createIndexCard('Nifty 50', indices.nifty50, 'fas fa-rupee-sign')}
                    ${this.createIndexCard('Bank Nifty', indices.banknifty, 'fas fa-university')}
                    ${this.createIndexCard('VIX', indices.vix, 'fas fa-exclamation-triangle')}
                    ${this.createIndexCard('Dollar Index', indices.dxy, 'fas fa-dollar-sign')}
                    ${this.createIndexCard('Gold', indices.gold, 'fas fa-coins')}
                    ${this.createIndexCard('Crude Oil', indices.crude, 'fas fa-oil-can')}
                    ${this.createIndexCard('Bitcoin', indices.bitcoin, 'fab fa-bitcoin')}
                </div>
            `;
            
            // India Focus panel (same logic as original)
            const ifocus = data.india_focus || {};
            const indiaKeys = [
                ['Nifty 50', 'nifty50'],
                ['Bank Nifty', 'banknifty'],
                ['Nifty IT', 'niftyit'],
                ['Nifty Pharma', 'niftypharma'],
                ['Nifty Auto', 'niftyauto'],
                ['Nifty FMCG', 'niftyfmcg'],
                ['Nifty PSU Bank', 'niftypsubank'],
                ['Nifty Metal', 'niftymetal'],
                ['Nifty Infra', 'niftyinfra'],
                ['Nifty Energy', 'niftyenergy'],
                ['India VIX', 'indiavix']
            ];
            
            const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);
            const indiaIndices = ifocus.indices || {};
            
            let indiaCards = indiaKeys.map(([label, key]) => {
                const obj = indiaIndices[key];
                if (!obj) return '';
                if (!isFiniteNum(obj.price) || !isFiniteNum(obj.change_percent)) return '';
                return this.createIndexCard(label, obj, 'fas fa-chart-area');
            }).filter(Boolean).join('');
            
            // Add currency/commodities from india_focus.currency_commodities
            const currencyComm = ifocus.currency_commodities || {};
            if (currencyComm.usdinr && isFiniteNum(currencyComm.usdinr.price)) {
                const usdinrCard = this.createIndexCard('USD/INR', currencyComm.usdinr, 'fas fa-exchange-alt');
                indiaCards += usdinrCard;
            }
            
            html += `
                <div class="market-summary-card">
                    <h4><i class="fas fa-flag"></i> India Focus</h4>
                    <div class="indices-grid">
                        ${indiaCards || '<div class="empty-state"><p>No valid India data available</p></div>'}
                    </div>
                </div>
            `;
            
            content.innerHTML = html;
            
        } catch (error) {
            console.error('🤖 Widget: Error rendering overview:', error);
            this.showErrorState('Error rendering market overview');
        }
    }
    
    createIndexCard(name, data, iconClass) {
        if (!data || typeof data.price === 'undefined') {
            return `
                <div class="index-card unavailable">
                    <div class="index-header">
                        <span class="index-name">${name}</span>
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="index-price">N/A</div>
                    <div class="index-change neutral">Data Unavailable</div>
                </div>
            `;
        }

        const price = parseFloat(data.price);
        const change = parseFloat(data.change || 0);
        const changePct = parseFloat(data.change_percent || 0);
        
        const changeClass = changePct > 0 ? 'positive' : changePct < 0 ? 'negative' : 'neutral';
        const changeIcon = changePct > 0 ? '📈' : changePct < 0 ? '📉' : '➡️';
        
        return `
            <div class="index-card ${changeClass}">
                <div class="index-header">
                    <span class="index-name">${name}</span>
                    <i class="${iconClass}"></i>
                </div>
                <div class="index-price">${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                <div class="index-change ${changeClass}">
                    ${changeIcon} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)
                </div>
            </div>
        `;
    }
}

// Global widget instance
let aiMarketWidget = null;

// Initialize widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    aiMarketWidget = new AIMarketOverviewWidget();
    
    // Make widget globally accessible for integration with other modules
    window.aiMarketWidget = aiMarketWidget;
});
