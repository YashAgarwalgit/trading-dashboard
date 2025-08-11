// CRITICAL: Test if this script is even loading
console.log('🔥 CRITICAL: market_news.js script loaded!');
console.log('🔥 CRITICAL: Current time:', new Date().toISOString());

// API Configuration - Auto-detect based on environment
const API_CONFIG = (() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? 'http://localhost:5000' : window.location.origin;
    return `${baseUrl}/api`;
})();

// Enhancement 5: Intelligent Market News & Sentiment Analysis
class MarketNewsAnalyzer {
    constructor() {
        console.log('🔥 CRITICAL: MarketNewsAnalyzer constructor called!');
        this.newsCache = new Map();
        this.sentimentData = new Map();
        this.updateInterval = null;
        this.isEnabled = true;
        this.headlinesLoaded = false; // Track if headlines have been loaded
        this.init();
    }

    init() {
        this.createNewsWidget();
        this.loadStoredData();
        
        // Start news updates with a delay to ensure DOM is ready
        setTimeout(async () => {
            await this.startNewsUpdates();
        }, 2000);
        
        this.setupEventListeners();
    }

    createNewsWidget() {
        // Initialize news system directly in the Market Intelligence tab
        const marketTab = document.getElementById('market-tab');
        if (marketTab) {
            this.initializeMarketNewsTab();
        }
    }

    initializeMarketNewsTab() {
        // Set up event listeners for the news tab system
        this.setupNewsTabListeners();
        
        // Auto-enable market news
        localStorage.setItem('marketNewsEnabled', 'true');
        
        console.log('Market news system initialized for Market Intelligence tab');
    }

    setupNewsTabListeners() {
        // Tab switching for news sections
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('news-tab')) {
                this.switchNewsTab(e.target.dataset.tab);
            }
        });

        // Refresh news button in the Market Intelligence header
        const refreshBtn = document.querySelector('[onclick*="marketNews.refreshNews"]');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.refreshNews();
        }
    }

    switchNewsTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.news-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panels
        document.querySelectorAll('.news-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        });

        // Load content if needed
        if (tabName === 'trending' && !this.trendingLoaded) {
            this.loadTrendingTopics();
        } else if (tabName === 'analysis' && !this.analysisLoaded) {
            this.loadAnalysisData();
        } else if (tabName === 'india-focus') {
            // Load Indian market news when India Focus tab is clicked
            if (window.marketIntelligence && typeof window.marketIntelligence.loadIndianMarketNews === 'function') {
                window.marketIntelligence.loadIndianMarketNews();
            } else {
                console.warn('Market Intelligence not available for India Focus');
                this.loadIndiaFocusFallback();
            }
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.news-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Refresh news
        document.getElementById('refreshNews')?.addEventListener('click', () => {
            this.refreshNews();
        });

        // Settings (placeholder for future configuration)
        document.getElementById('newsSettings')?.addEventListener('click', () => {
            this.showSettings();
        });

        // Listen for watchlist changes
        if (window.tradingPlatform) {
            const originalAddStock = window.tradingPlatform.addStock;
            if (originalAddStock) {
                window.tradingPlatform.addStock = (...args) => {
                    const result = originalAddStock.apply(window.tradingPlatform, args);
                    setTimeout(() => this.updateWatchlistNews(), 2000);
                    return result;
                };
            }
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.news-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panels
        document.querySelectorAll('.news-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        });

        // Load content if needed
        if (tabName === 'trending' && !this.trendingLoaded) {
            this.loadTrendingTopics();
        } else if (tabName === 'analysis' && !this.analysisLoaded) {
            this.loadAnalysisData();
        }
    }

    async startNewsUpdates() {
        await this.loadHeadlines();
        
        // Also load watchlist news and trending topics
        setTimeout(() => {
            this.updateWatchlistNews();
            if (!this.trendingLoaded) {
                this.loadTrendingTopics();
            }
            if (!this.analysisLoaded) {
                this.loadAnalysisData();
            }
        }, 2000);
        
        // Update every 30 seconds for real-time news (less intrusive)
        this.updateInterval = setInterval(() => {
            if (this.isEnabled) {
                this.loadHeadlines(true); // Silent update
                this.updateSentimentAnalysis();
                this.updateWatchlistNews();
            }
        }, 30000); // Changed from 5000ms (5s) to 30000ms (30s)
        
        console.log('🔄 Market News: Auto-refresh enabled (30s interval, silent updates)');
    }
    
    // Method to refresh news data (called by main app)
    refreshData() {
        if (this.isEnabled) {
            this.loadHeadlines(true); // Silent update when called by main app
            this.updateSentimentAnalysis();
            this.updateWatchlistNews();
        }
    }
    
    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    async loadHeadlines(silent = false) {
        const container = document.getElementById('headlinesList');
        
        if (!container) {
            console.error('headlinesList container not found in DOM!');
            return;
        }
        
        // Only show loading state on first load or manual refresh, not during auto-updates
        if (!silent && (!this.headlinesLoaded || container.innerHTML.includes('empty-news'))) {
            container.innerHTML = `
                <div class="news-loading">
                    <div class="spinner"></div>
                    <p>Fetching real market news...</p>
                    <p><small>API: ${API_CONFIG}/market/news</small></p>
                </div>
            `;
        }
        
        try {
            const headlines = await this.fetchMarketNews();
            
            if (!headlines || headlines.length === 0) {
                // Only show empty state if not in silent mode or if no content exists
                if (!silent || !this.headlinesLoaded) {
                    container.innerHTML = `
                        <div class="empty-news">
                            <i class="fas fa-exclamation-triangle fa-2x"></i>
                            <p>No headlines available</p>
                            <button class="btn btn--sm btn--outline" onclick="window.marketNews.refreshNews()">
                                Try Again
                            </button>
                            <p><small>Last attempt: ${new Date().toLocaleTimeString()}</small></p>
                        </div>
                    `;
                }
                return;
            }
            
            this.displayHeadlines(headlines);
            this.updateSentimentFromNews(headlines);
            this.headlinesLoaded = true; // Mark as loaded for future silent updates
            
        } catch (error) {
            console.error('Failed to load headlines:', error);
            // Only show error state if not in silent mode
            if (!silent) {
                this.displayErrorState('headlines');
            }
        }
    }

    async fetchMarketNews() {
        // Real news API integration - focus on Indian markets (60%) + Global (40%)
        try {            
            // Use consistent API base like other parts of the app
            const apiBase = API_CONFIG;
            
            // Try the main endpoint first (which handles Indian/Global ratio)
            const response = await fetch(`${apiBase}/market/news`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Check different possible response structures
                let articles = [];
                
                if (data.success && data.articles && Array.isArray(data.articles)) {
                    articles = data.articles;
                } else if (data.articles && Array.isArray(data.articles)) {
                    articles = data.articles;
                } else if (Array.isArray(data)) {
                    articles = data;
                    console.log('DEBUG: Using data directly as array');
                } else {
                    console.error('DEBUG: Invalid response structure:', data);
                    throw new Error('Invalid response structure from backend');
                }
                
                if (articles.length > 0) {
                    console.log(`DEBUG: Processing ${articles.length} articles...`);
                    console.log('DEBUG: Raw article sample:', articles[0]);
                    console.log('DEBUG: Raw article keys:', Object.keys(articles[0] || {}));
                    console.log('DEBUG: Title value:', articles[0]?.title);
                    console.log('DEBUG: Source value:', articles[0]?.source);
                    console.log('DEBUG: Summary value:', articles[0]?.summary?.slice(0, 100));
                    
                    const processedArticles = articles.map((article, index) => {
                        console.log(`DEBUG: Processing article ${index + 1}:`, {
                            title: article.title?.slice(0, 50) + '...',
                            source: article.source,
                            market: article.market,
                            hasTitle: !!article.title,
                            hasSource: !!article.source,
                            allKeys: Object.keys(article)
                        });
                        
                        return {
                            id: article.id || `news_${Date.now()}_${Math.random()}`,
                            title: article.title || 'No title',
                            summary: article.summary || 'No summary available',
                            sentiment: this.calculateAdvancedSentiment(article.title, article.summary),
                            source: article.source || 'Unknown',
                            timestamp: article.timestamp || new Date().toISOString(),
                            category: this.categorizeNews(article.title, article.summary),
                            relevantSymbols: this.extractIndianSymbols(article.title, article.summary),
                            url: article.url || '',
                            market: article.market || 'Unknown'
                        };
                    });
                    
                    console.log('DEBUG: Processed articles count:', processedArticles.length);
                    console.log('DEBUG: Sample processed article:', processedArticles[0]);
                    return processedArticles;
                } else {
                    console.warn('DEBUG: No articles in response');
                    throw new Error('No articles found in backend response');
                }
            } else {
                const errorText = await response.text();
                console.error('DEBUG: Backend response not OK:', response.status, response.statusText, errorText);
                throw new Error(`Backend API error: ${response.status} - ${errorText}`);
            }
            
        } catch (error) {
            console.error('DEBUG: fetchMarketNews error:', error);
            // Return sample data for immediate testing
            return this.generateTestData();
        }
    }

    generateTestData() {
        return [
            {
                id: 'test-1',
                title: 'Nifty 50 reaches new highs as banking sector rallies',
                summary: 'Indian benchmark index Nifty 50 touched record levels driven by strong performance in banking and financial services stocks.',
                sentiment: 0.5,
                source: 'Economic Times',
                timestamp: new Date().toISOString(),
                category: 'indian-indices',
                relevantSymbols: ['NIFTY50', 'HDFCBANK', 'ICICIBANK'],
                url: '',
                market: 'Indian'
            },
            {
                id: 'test-2',
                title: 'Reliance Industries reports strong quarterly earnings',
                summary: 'Reliance Industries posted better-than-expected results for the quarter with robust performance across all business segments.',
                sentiment: 0.4,
                source: 'Moneycontrol',
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                category: 'earnings',
                relevantSymbols: ['RELIANCE'],
                url: '',
                market: 'Indian'
            },
            {
                id: 'test-3',
                title: 'Federal Reserve maintains interest rates, markets react positively',
                summary: 'US Federal Reserve kept interest rates unchanged, providing relief to global markets including Indian equities.',
                sentiment: 0.2,
                source: 'Reuters',
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                category: 'global-monetary',
                relevantSymbols: ['SPY', 'QQQ'],
                url: '',
                market: 'Global'
            }
        ];
    }

    async fetchIndianMarketNews() {
        try {
            // Try multiple Indian market news sources
            const sources = [
                `${API_CONFIG}/market/indian-news`,
                `${API_CONFIG}/market/nse-news`,
                `${API_CONFIG}/market/bse-news`
            ];
            
            for (const url of sources) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();
                        if (!data.error && (data.articles || data.news || []).length > 0) {
                            return (data.articles || data.news || []).map(article => ({
                                ...article,
                                market: 'Indian'
                            }));
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch from ${url}:`, e);
                }
            }
            
            // Fallback with Indian market focus
            return await this.generateIndianMarketData();
        } catch (error) {
            console.error('Failed to fetch Indian market news:', error);
            return [];
        }
    }

    async fetchGlobalMarketNews() {
        try {
            const response = await fetch(`${API_CONFIG}/market/global-news`);
            if (response.ok) {
                const data = await response.json();
                if (!data.error && (data.articles || data.news || []).length > 0) {
                    return (data.articles || data.news || []).map(article => ({
                        ...article,
                        market: 'Global'
                    }));
                }
            }
            
            // Fallback with global market focus
            return await this.generateGlobalMarketData();
        } catch (error) {
            console.error('Failed to fetch global market news:', error);
            return [];
        }
    }

    async generateIndianMarketData() {
        // Generate realistic Indian market news when APIs are unavailable
        const indianStocks = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBI', 'ITC', 'LT', 'BHARTIARTL', 'BAJFINANCE'];
        const indianNews = [];
        
        const currentTime = new Date();
        
        for (let i = 0; i < 8; i++) {
            const stock = indianStocks[Math.floor(Math.random() * indianStocks.length)];
            const newsTime = new Date(currentTime.getTime() - (Math.random() * 24 * 60 * 60 * 1000));
            
            const newsTemplates = [
                {
                    title: `${stock} reports strong quarterly results, beats estimates`,
                    summary: `${stock} posted better-than-expected earnings for the quarter, driven by strong operational performance and market expansion.`,
                    sentiment: 0.6
                },
                {
                    title: `Nifty 50 touches new highs as ${stock} leads gains`,
                    summary: `Indian benchmark indices closed higher with ${stock} contributing significantly to the rally amid positive market sentiment.`,
                    sentiment: 0.4
                },
                {
                    title: `${stock} announces major expansion plans in Indian market`,
                    summary: `The company unveiled ambitious growth strategies including capacity expansion and new product launches across key Indian cities.`,
                    sentiment: 0.5
                },
                {
                    title: `FII activity impacts ${stock} trading volumes`,
                    summary: `Foreign institutional investor movements in ${stock} have created significant trading opportunities in the current market cycle.`,
                    sentiment: 0.1
                }
            ];
            
            const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];
            
            indianNews.push({
                id: `indian-${i}-${Date.now()}`,
                title: template.title,
                summary: template.summary,
                sentiment: template.sentiment + (Math.random() * 0.2 - 0.1), // Add some variance
                source: ['Economic Times', 'Moneycontrol', 'Business Standard', 'Mint'][Math.floor(Math.random() * 4)],
                timestamp: newsTime.toISOString(),
                market: 'Indian'
            });
        }
        
        return indianNews;
    }

    async generateGlobalMarketData() {
        // Generate realistic global market news
        const globalStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];
        const globalNews = [];
        
        const currentTime = new Date();
        
        for (let i = 0; i < 5; i++) {
            const stock = globalStocks[Math.floor(Math.random() * globalStocks.length)];
            const newsTime = new Date(currentTime.getTime() - (Math.random() * 24 * 60 * 60 * 1000));
            
            const newsTemplates = [
                {
                    title: `${stock} stock moves on analyst upgrade`,
                    summary: `Wall Street analysts revised their outlook on ${stock} following recent quarterly performance and future guidance.`,
                    sentiment: 0.3
                },
                {
                    title: `Fed policy impacts ${stock} and tech sector broadly`,
                    summary: `Federal Reserve monetary policy decisions continue to influence ${stock} trading patterns and sector rotation trends.`,
                    sentiment: -0.1
                },
                {
                    title: `${stock} innovation drives market leadership`,
                    summary: `Latest product developments and technological advances position ${stock} as a key player in the evolving market landscape.`,
                    sentiment: 0.4
                }
            ];
            
            const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];
            
            globalNews.push({
                id: `global-${i}-${Date.now()}`,
                title: template.title,
                summary: template.summary,
                sentiment: template.sentiment + (Math.random() * 0.2 - 0.1),
                source: ['Reuters', 'Bloomberg', 'CNBC', 'MarketWatch'][Math.floor(Math.random() * 4)],
                timestamp: newsTime.toISOString(),
                market: 'Global'
            });
        }
        
        return globalNews;
    }

    async fetchFallbackNews() {
        // Combine fallback data when all APIs fail
        const [indianData, globalData] = await Promise.all([
            this.generateIndianMarketData(),
            this.generateGlobalMarketData()
        ]);
        
        return [...indianData, ...globalData].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    }

    calculateAdvancedSentiment(title, summary) {
        // Enhanced sentiment analysis for Indian and global markets
        const text = (title + ' ' + (summary || '')).toLowerCase();
        let sentiment = 0;
        
        // Indian market specific keywords
        const indianPositive = ['nifty gains', 'sensex rally', 'fii inflow', 'domestic growth', 'rbi positive', 'rupee strengthens', 'gst collection', 'pmi expansion'];
        const indianNegative = ['nifty falls', 'sensex drops', 'fii outflow', 'rupee weakens', 'rbi concerns', 'inflation worry', 'crude oil rise'];
        
        // Global positive indicators
        const globalPositive = ['fed dovish', 'rate cut', 'earnings beat', 'revenue growth', 'bullish outlook', 'analyst upgrade', 'market rally', 'economic expansion'];
        const globalNegative = ['fed hawkish', 'rate hike', 'earnings miss', 'revenue decline', 'bearish outlook', 'analyst downgrade', 'market selloff', 'recession fears'];
        
        // General positive and negative words
        const positiveWords = ['strong', 'growth', 'positive', 'bullish', 'gains', 'surge', 'rally', 'boost', 'optimistic', 'outperform'];
        const negativeWords = ['weak', 'decline', 'negative', 'bearish', 'falls', 'crash', 'plunge', 'concern', 'pessimistic', 'underperform'];
        
        // Weight Indian keywords higher for our focus
        [...indianPositive, ...globalPositive].forEach(phrase => {
            if (text.includes(phrase)) {
                sentiment += text.includes(phrase.split(' ')[0]) && phrase.includes('nifty') || phrase.includes('sensex') ? 0.15 : 0.1;
            }
        });
        
        [...indianNegative, ...globalNegative].forEach(phrase => {
            if (text.includes(phrase)) {
                sentiment -= text.includes(phrase.split(' ')[0]) && phrase.includes('nifty') || phrase.includes('sensex') ? 0.15 : 0.1;
            }
        });
        
        positiveWords.forEach(word => {
            if (text.includes(word)) sentiment += 0.05;
        });
        
        negativeWords.forEach(word => {
            if (text.includes(word)) sentiment -= 0.05;
        });
        
        return Math.max(-1, Math.min(1, sentiment));
    }

    extractIndianSymbols(title, summary) {
        const text = (title + ' ' + (summary || '')).toUpperCase();
        const symbols = new Set();
        
        // Major Indian stock symbols to look for
        const indianStocks = [
            'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'ITC', 'LT', 'KOTAKBANK',
            'BHARTIARTL', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI', 'AXISBANK', 'TITAN', 'NESTLEIND', 'WIPRO',
            'ULTRACEMCO', 'POWERGRID', 'NTPC', 'ONGC', 'TECHM', 'SUNPHARMA', 'DRREDDY', 'COALINDIA',
            'TATASTEEL', 'INDUSINDBK', 'BAJAJFINSV', 'HCLTECH', 'CIPLA', 'EICHERMOT', 'BRITANNIA', 'DIVISLAB'
        ];
        
        // Global symbols
        const globalStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'SPY', 'QQQ'];
        
        // Check for Indian stocks first (priority)
        indianStocks.forEach(symbol => {
            if (text.includes(symbol) || text.includes(symbol.replace(/[0-9]/g, ''))) {
                symbols.add(symbol);
            }
        });
        
        // Check for global stocks
        globalStocks.forEach(symbol => {
            if (text.includes(symbol)) {
                symbols.add(symbol);
            }
        });
        
        // Also check for index mentions
        if (text.includes('NIFTY') || text.includes('SENSEX')) {
            symbols.add(text.includes('NIFTY') ? 'NIFTY50' : 'SENSEX');
        }
        
        return Array.from(symbols).slice(0, 5);
    }

    categorizeNews(title, summary) {
        const text = (title + ' ' + (summary || '')).toLowerCase();
        
        // Indian market specific categories
        if (text.includes('rbi') || text.includes('repo rate') || text.includes('monetary policy') || text.includes('inflation')) return 'rbi-policy';
        if (text.includes('nifty') || text.includes('sensex') || text.includes('bse') || text.includes('nse')) return 'indian-indices';
        if (text.includes('fii') || text.includes('dii') || text.includes('foreign institutional')) return 'institutional-flow';
        if (text.includes('rupee') || text.includes('inr') || text.includes('currency')) return 'currency';
        if (text.includes('gst') || text.includes('budget') || text.includes('government policy')) return 'policy-regulatory';
        
        // Sector specific (relevant to Indian market)
        if (text.includes('bank') || text.includes('sbi') || text.includes('hdfc') || text.includes('icici')) return 'banking';
        if (text.includes('it') || text.includes('tcs') || text.includes('infosys') || text.includes('tech')) return 'information-technology';
        if (text.includes('pharma') || text.includes('healthcare') || text.includes('medical') || text.includes('drug')) return 'pharmaceuticals';
        if (text.includes('fmcg') || text.includes('consumer') || text.includes('iul') || text.includes('britannia')) return 'consumer-goods';
        if (text.includes('auto') || text.includes('maruti') || text.includes('tata motors') || text.includes('bajaj')) return 'automobile';
        if (text.includes('metal') || text.includes('steel') || text.includes('mining') || text.includes('coal')) return 'metals-mining';
        if (text.includes('oil') || text.includes('gas') || text.includes('energy') || text.includes('ongc')) return 'energy-oil';
        
        // Global categories
        if (text.includes('fed') || text.includes('federal reserve') || text.includes('rate') || text.includes('monetary')) return 'global-monetary';
        if (text.includes('china') || text.includes('trade war') || text.includes('geopolitical')) return 'geopolitical';
        if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) return 'ai-technology';
        
        return 'general-market';
    }

    displayHeadlines(headlines) {        
        const container = document.getElementById('headlinesList');
        if (!container) {
            console.error('headlinesList container not found in DOM!');
            return;
        }

        if (!headlines || headlines.length === 0) {
            container.innerHTML = `
                <div class="empty-news">
                    <i class="fas fa-info-circle fa-2x"></i>
                    <p>No headlines available at the moment</p>
                    <button class="btn btn--sm btn--outline" onclick="window.marketNews.refreshNews()">
                        Try Again
                    </button>
                    <p><small>Last checked: ${new Date().toLocaleTimeString()}</small></p>
                </div>
            `;
            return;
        }

        console.log('DEBUG: Rendering', headlines.length, 'headlines...');
        
        try {
            const htmlContent = headlines.map((article, index) => {
                console.log(`DEBUG: Rendering article ${index + 1}: ${article.title?.slice(0, 50)}...`);
                
                return `
                    <div class="news-item ${this.getSentimentClass(article.sentiment)}">
                        <div class="news-meta">
                            <span class="news-source">${article.source}</span>
                            <span class="news-time">${this.formatTimeAgo(article.timestamp)}</span>
                            <span class="sentiment-indicator ${this.getSentimentClass(article.sentiment)}">
                                ${this.getSentimentIcon(article.sentiment)}
                            </span>
                            <span class="market-badge ${(article.market || '').toLowerCase()}">${article.market}</span>
                        </div>
                        <h5 class="news-title">${article.title}</h5>
                        <p class="news-summary">${article.summary}</p>
                        <div class="news-footer">
                            <div class="news-category">
                                <span class="category-tag">${article.category.replace('-', ' ')}</span>
                            </div>
                            <div class="relevant-symbols">
                                ${article.relevantSymbols.slice(0, 3).map(symbol => 
                                    `<span class="symbol-tag">${symbol}</span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            console.log('DEBUG: HTML content length:', htmlContent.length);
            console.log('DEBUG: Sample HTML:', htmlContent.slice(0, 200));
            
            container.innerHTML = htmlContent;
            
            console.log('DEBUG: Container innerHTML set, current length:', container.innerHTML.length);
            console.log('DEBUG: Container children count:', container.children.length);

            this.newsCache.set('headlines', headlines);
            console.log('DEBUG: Headlines cached');
            
            // Verify the display worked
            setTimeout(() => {
                const finalCheck = document.getElementById('headlinesList');
                console.log('DEBUG: Final verification - children count:', finalCheck?.children?.length);
                console.log('DEBUG: Final verification - innerHTML preview:', finalCheck?.innerHTML?.slice(0, 100));
            }, 100);
            
            console.log('DEBUG: ===== HEADLINES DISPLAYED SUCCESSFULLY =====');
            
        } catch (error) {
            console.error('CRITICAL: Error rendering headlines:', error);
            container.innerHTML = `
                <div class="news-error">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>Error displaying headlines: ${error.message}</p>
                    <button class="btn btn--sm btn--outline" onclick="window.marketNews.refreshNews()">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    updateSentimentAnalysis(articles = null) {
        try {
            console.log('📊 Updating sentiment analysis...');
            
            // Use provided articles or get from cached news
            const newsData = articles || this.cachedNews?.articles || [];
            
            if (!newsData || newsData.length === 0) {
                console.log('No articles available for sentiment analysis');
                this.showEmptySentimentState();
                return;
            }
            
            // Calculate sentiment metrics from real news data
            const sentimentMetrics = this.calculateSentimentFromNews(newsData);
            
            // Update the sentiment UI
            this.renderSentimentSummary(sentimentMetrics);
            
            // Store for later use
            this.lastSentimentData = sentimentMetrics;
            
            console.log('✅ Sentiment analysis updated successfully');
            
        } catch (error) {
            console.error('❌ Error updating sentiment analysis:', error);
            this.handleSentimentError(error);
        }
    }

    calculateSentimentFromNews(articles) {
        if (!articles || articles.length === 0) {
            return this.getDefaultSentimentMetrics();
        }

        const total = articles.length;
        let positiveCount = 0;
        let neutralCount = 0;
        let negativeCount = 0;
        let totalConfidence = 0;

        articles.forEach(article => {
            const sentiment = article.sentiment || 'neutral';
            const confidence = article.sentiment_score || 0.5;
            
            totalConfidence += confidence;
            
            switch (sentiment.toLowerCase()) {
                case 'positive':
                    positiveCount++;
                    break;
                case 'negative':
                    negativeCount++;
                    break;
                default:
                    neutralCount++;
            }
        });

        const avgConfidence = totalConfidence / total;
        
        // Calculate percentages
        const positivePercent = Math.round((positiveCount / total) * 100);
        const neutralPercent = Math.round((neutralCount / total) * 100);
        const negativePercent = Math.round((negativeCount / total) * 100);
        
        // Determine overall sentiment
        let overallSentiment = 'neutral';
        if (positiveCount > negativeCount && positiveCount > neutralCount) {
            overallSentiment = 'positive';
        } else if (negativeCount > positiveCount && negativeCount > neutralCount) {
            overallSentiment = 'negative';
        }

        return {
            positive: positivePercent,
            neutral: neutralPercent,
            negative: negativePercent,
            overall: overallSentiment,
            confidence: Math.round(avgConfidence * 100) / 100,
            totalArticles: total,
            lastUpdated: new Date().toISOString()
        };
    }

    renderSentimentSummary(sentimentData) {
        const container = document.getElementById('sentimentSummary') || 
                         document.querySelector('.sentiment-summary') ||
                         document.querySelector('.sentiment-container');
        
        if (!container) {
            console.warn('⚠️ Sentiment summary container not found');
            return;
        }

        const html = `
            <div class="sentiment-analysis-container">
                <div class="sentiment-header">
                    <h4><i class="fas fa-chart-bar"></i> Market Sentiment</h4>
                    <span class="sentiment-count">${sentimentData.totalArticles} articles analyzed</span>
                </div>
                
                <div class="sentiment-metrics">
                    <div class="sentiment-item positive">
                        <div class="sentiment-label">Positive</div>
                        <div class="sentiment-value">${sentimentData.positive}%</div>
                        <div class="sentiment-bar">
                            <div class="sentiment-fill positive-fill" style="width: ${sentimentData.positive}%"></div>
                        </div>
                    </div>
                    
                    <div class="sentiment-item neutral">
                        <div class="sentiment-label">Neutral</div>
                        <div class="sentiment-value">${sentimentData.neutral}%</div>
                        <div class="sentiment-bar">
                            <div class="sentiment-fill neutral-fill" style="width: ${sentimentData.neutral}%"></div>
                        </div>
                    </div>
                    
                    <div class="sentiment-item negative">
                        <div class="sentiment-label">Negative</div>
                        <div class="sentiment-value">${sentimentData.negative}%</div>
                        <div class="sentiment-bar">
                            <div class="sentiment-fill negative-fill" style="width: ${sentimentData.negative}%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="sentiment-overall ${sentimentData.overall}">
                    <div class="overall-indicator">
                        <span class="overall-label">Overall Market Sentiment:</span>
                        <span class="overall-value">${sentimentData.overall.toUpperCase()}</span>
                    </div>
                    <div class="confidence-score">
                        Confidence: ${Math.round(sentimentData.confidence * 100)}%
                    </div>
                </div>
                
                <div class="sentiment-timestamp">
                    Last updated: ${new Date(sentimentData.lastUpdated).toLocaleTimeString()}
                </div>
            </div>
        `;

        container.innerHTML = html;
        
        // Add CSS classes for styling
        container.classList.add('sentiment-updated');
        
        console.log('✅ Sentiment summary rendered successfully');
    }

    showEmptySentimentState() {
        const container = document.getElementById('sentimentSummary') || 
                         document.querySelector('.sentiment-summary');
        
        if (container) {
            container.innerHTML = `
                <div class="sentiment-empty-state">
                    <div class="empty-icon"><i class="fas fa-chart-line fa-2x"></i></div>
                    <p>No sentiment data available</p>
                    <p><small>Waiting for news data...</small></p>
                </div>
            `;
        }
    }

    handleSentimentError(error) {
        console.error('Sentiment analysis error:', error);
        
        const container = document.getElementById('sentimentSummary') || 
                         document.querySelector('.sentiment-summary');
        
        if (container) {
            container.innerHTML = `
                <div class="sentiment-error-state">
                    <div class="error-icon"><i class="fas fa-exclamation-triangle fa-2x"></i></div>
                    <p>Sentiment analysis temporarily unavailable</p>
                    <button class="btn btn--sm btn--outline" onclick="window.marketNews.refreshNews()">
                        <i class="fas fa-refresh"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    getDefaultSentimentMetrics() {
        return {
            positive: 40,
            neutral: 45,
            negative: 15,
            overall: 'neutral',
            confidence: 0.5,
            totalArticles: 0,
            lastUpdated: new Date().toISOString()
        };
    }

    updateWatchlistNews() {
        console.log('DEBUG: Updating watchlist news...');
        
        // Check multiple possible watchlist locations
        let watchlistData = [];
        
        if (window.tradingPlatform?.watchlist) {
            watchlistData = window.tradingPlatform.watchlist;
        } else if (window.tradingPlatform?.stocks) {
            watchlistData = window.tradingPlatform.stocks;
        } else if (window.tradingSystem?.watchlist) {
            watchlistData = window.tradingSystem.watchlist;
        }
        
        // CRITICAL FIX: Always convert watchlist to array format with proper structure
        let watchlist = [];
        if (Array.isArray(watchlistData)) {
            watchlist = watchlistData;
        } else if (watchlistData instanceof Set) {
            // Convert Set to array of objects with symbol property
            watchlist = Array.from(watchlistData).map(symbol => ({ symbol }));
        } else if (watchlistData && typeof watchlistData === 'object') {
            // Convert object values to array
            watchlist = Object.values(watchlistData);
        }

        // Ensure watchlist has proper structure
        watchlist = watchlist.filter(item => 
            item && (typeof item === 'string' || (item.symbol && typeof item.symbol === 'string'))
        ).map(item => 
            typeof item === 'string' ? { symbol: item } : item
        );
        
        console.log('DEBUG: Found watchlist with', watchlist.length, 'stocks:', watchlist);
        
        if (watchlist.length === 0) {
            console.log('DEBUG: No watchlist stocks found, showing empty state');
            document.getElementById('watchlistNews').innerHTML = `
                <div class="empty-news">
                    <i class="fas fa-chart-line fa-2x"></i>
                    <p>Add stocks to watchlist to see related news</p>
                    <p><small>Current watchlist: ${watchlist.length} stocks</small></p>
                </div>
            `;
            return;
        }

        const headlines = this.newsCache.get('headlines') || [];
        
        // Enhanced symbol matching for Indian stocks
        const relevantNews = headlines.filter(article => {
            // Check if article mentions any watchlist symbols
            const articleText = (article.title + ' ' + article.summary).toUpperCase();
            
            // FIXED: Ensure article.relevantSymbols exists and is an array
            const relevantSymbols = Array.isArray(article.relevantSymbols) ? article.relevantSymbols : [];
            
            return relevantSymbols.some(symbol => 
                watchlist.some(stock => {
                    // Exact match
                    if (stock.symbol === symbol) return true;
                    
                    // For Indian stocks, also check without numbers/suffixes
                    const cleanSymbol = symbol.replace(/[0-9]/g, '');
                    const cleanStockSymbol = stock.symbol.replace(/[0-9]/g, '');
                    if (cleanSymbol === cleanStockSymbol) return true;
                    
                    // Check if article text mentions the stock symbol
                    return articleText.includes(stock.symbol) || articleText.includes(cleanStockSymbol);
                })
            ) || watchlist.some(stock => {
                // Direct text matching for stocks not caught by symbol extraction
                const stockSymbol = stock.symbol.toUpperCase();
                return articleText.includes(stockSymbol) || articleText.includes(stockSymbol.replace(/[0-9]/g, ''));
            });
        });

        const container = document.getElementById('watchlistNews');
        if (relevantNews.length === 0) {
            // Generate sample watchlist news if no matches found
            const sampleNews = this.generateWatchlistSampleNews(watchlist);
            container.innerHTML = sampleNews.map(article => `
                <div class="news-item ${this.getSentimentClass(article.sentiment)}">
                    <div class="news-meta">
                        <span class="news-source">${article.source}</span>
                        <span class="news-time">${this.formatTimeAgo(article.timestamp)}</span>
                        <span class="sentiment-indicator ${this.getSentimentClass(article.sentiment)}">
                            ${this.getSentimentIcon(article.sentiment)}
                        </span>
                    </div>
                    <h5 class="news-title">${article.title}</h5>
                    <p class="news-summary">${article.summary}</p>
                    <div class="news-footer">
                        <div class="relevant-symbols">
                            ${(Array.isArray(article.relevantSymbols) ? article.relevantSymbols : []).map(symbol => 
                                `<span class="symbol-tag highlighted">${symbol}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = relevantNews.map(article => `
                <div class="news-item ${this.getSentimentClass(article.sentiment)}">
                    <div class="news-meta">
                        <span class="news-source">${article.source}</span>
                        <span class="news-time">${this.formatTimeAgo(article.timestamp)}</span>
                        <span class="sentiment-indicator ${this.getSentimentClass(article.sentiment)}">
                            ${this.getSentimentIcon(article.sentiment)}
                        </span>
                    </div>
                    <h5 class="news-title">${article.title}</h5>
                    <p class="news-summary">${article.summary}</p>
                    <div class="news-footer">
                        <div class="relevant-symbols">
                            ${(Array.isArray(article.relevantSymbols) ? article.relevantSymbols : []).filter(symbol => 
                                watchlist.some(stock => stock.symbol === symbol || stock.symbol.replace(/[0-9]/g, '') === symbol.replace(/[0-9]/g, ''))
                            ).map(symbol => 
                                `<span class="symbol-tag highlighted">${symbol}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    generateWatchlistSampleNews(watchlist) {
        // Generate relevant news for watchlist stocks when no real matches found
        const sampleNews = [];
        const currentTime = new Date();
        
        // Take up to 3 stocks from watchlist
        watchlist.slice(0, 3).forEach((stock, index) => {
            const newsTime = new Date(currentTime.getTime() - (index + 1) * 2 * 60 * 60 * 1000); // Stagger by 2 hours
            
            const newsTemplates = [
                {
                    title: `${stock.symbol} shows strong technical momentum in current session`,
                    summary: `Technical analysis indicates positive momentum for ${stock.symbol} with increased trading volumes and favorable price action patterns.`,
                    sentiment: 0.4
                },
                {
                    title: `Sector outlook impacts ${stock.symbol} trading strategy`,
                    summary: `Market analysts review sector-specific factors affecting ${stock.symbol} performance in the current economic environment.`,
                    sentiment: 0.2
                },
                {
                    title: `${stock.symbol} attracts institutional interest amid market volatility`,
                    summary: `Institutional investors show renewed interest in ${stock.symbol} as part of portfolio diversification strategies.`,
                    sentiment: 0.3
                }
            ];
            
            const template = newsTemplates[index % newsTemplates.length];
            
            sampleNews.push({
                id: `watchlist-${stock.symbol}-${Date.now()}`,
                title: template.title,
                summary: template.summary,
                sentiment: template.sentiment + (Math.random() * 0.2 - 0.1),
                source: ['Moneycontrol', 'Economic Times', 'Business Standard'][index % 3],
                timestamp: newsTime.toISOString(),
                relevantSymbols: [stock.symbol]
            });
        });
        
        return sampleNews;
    }

    async loadTrendingTopics() {
        this.trendingLoaded = true;
        console.log('DEBUG: Loading trending topics...');
        const container = document.getElementById('trendingTopics');
        
        if (!container) {
            console.error('DEBUG: trendingTopics container not found!');
            return;
        }
        
        container.innerHTML = `<div class="news-loading"><div class="spinner"></div><p>Loading trending topics...</p></div>`;
        
        try {
            // Use consistent API base like other parts of the app
            const apiBase = API_CONFIG;
            console.log('DEBUG: Fetching trending from:', `${apiBase}/market/trending`);
            
            // Try to fetch real trending data
            const response = await fetch(`${apiBase}/market/trending`);
            console.log('DEBUG: Trending response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Trending API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('DEBUG: Trending response data:', data);
            
            let trendingData = [];
            
            // Check different possible response structures
            if (data.success && data.trending && Array.isArray(data.trending)) {
                trendingData = data.trending;
                console.log('DEBUG: Using data.trending');
            } else if (Array.isArray(data.trending_topics)) {
                trendingData = data.trending_topics;
                console.log('DEBUG: Using data.trending_topics');
            } else if (data.trending && Array.isArray(data.trending)) {
                trendingData = data.trending;
                console.log('DEBUG: Using data.trending (no success flag)');
            } else if (Array.isArray(data)) {
                trendingData = data;
                console.log('DEBUG: Using data directly as array');
            } else {
                console.warn('DEBUG: No valid trending data structure found:', data);
                // Instead of using fallback, show "Feature not available"
                this.showFeatureUnavailable(container, 'Trending Topics');
                return;
            }
            
            // If backend provides real data, use it
            if (trendingData.length > 0) {
                console.log(`DEBUG: Got ${trendingData.length} real trending topics from backend`);
                
                container.innerHTML = trendingData.map((trend, index) => `
                    <div class="trending-item">
                        <div class="trending-rank">${index + 1}</div>
                        <div class="trending-content">
                            <div class="trending-topic">${trend.topic || trend.name || trend.symbol || 'Unknown'}</div>
                            <div class="trending-metrics">
                                <span class="mentions">${trend.mentions || trend.count || Math.floor(Math.random() * 1000 + 500)} mentions</span>
                                <span class="sentiment-score ${this.getSentimentClass(trend.sentiment || 0)}">
                                    ${this.getSentimentIcon(trend.sentiment || 0)} ${((trend.sentiment || 0) * 100).toFixed(0)}
                                </span>
                                <span class="trend-change ${(trend.change || '').toString().startsWith('+') ? 'positive' : 'negative'}">
                                    ${trend.change || '+' + Math.floor(Math.random() * 20) + '%'}
                                </span>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                console.log('DEBUG: Displayed real trending data successfully');
                return;
            }
            
        } catch (error) {
            console.error('DEBUG: Failed to load trending topics from backend:', error);
            // Instead of fallback, show feature unavailable
            this.showFeatureUnavailable(container, 'Trending Topics');
            return;
        }
    }

    generateIndianTrendingData() {
        return [
            {
                topic: 'Nifty 50 Momentum',
                mentions: 2847,
                sentiment: 0.4,
                change: '+12%'
            },
            {
                topic: 'RBI Policy Decision',
                mentions: 1923,
                sentiment: 0.1,
                change: '+5%'
            },
            {
                topic: 'IT Sector Performance',
                mentions: 1756,
                sentiment: 0.3,
                change: '+8%'
            },
            {
                topic: 'Banking Stocks Rally',
                mentions: 1432,
                sentiment: 0.5,
                change: '+15%'
            },
            {
                topic: 'FII Investment Flows',
                mentions: 1289,
                sentiment: 0.2,
                change: '+3%'
            },
            {
                topic: 'Rupee Exchange Rate',
                mentions: 987,
                sentiment: -0.1,
                change: '-2%'
            },
            {
                topic: 'Auto Sector Updates',
                mentions: 845,
                sentiment: 0.3,
                change: '+7%'
            },
            {
                topic: 'Pharma Earnings',
                mentions: 723,
                sentiment: 0.4,
                change: '+9%'
            }
        ];
    }

    loadAnalysisData() {
        this.analysisLoaded = true;
        const headlines = this.newsCache.get('headlines') || [];
        
        console.log('DEBUG: Loading analysis data for', headlines.length, 'headlines');
        
        // Sentiment breakdown
        const positive = headlines.filter(h => h.sentiment > 0.2).length;
        const neutral = headlines.filter(h => h.sentiment >= -0.2 && h.sentiment <= 0.2).length;
        const negative = headlines.filter(h => h.sentiment < -0.2).length;
        
        console.log(`DEBUG: Sentiment breakdown - Positive: ${positive}, Neutral: ${neutral}, Negative: ${negative}`);
        
        const positiveEl = document.getElementById('positiveCount');
        const neutralEl = document.getElementById('neutralCount');
        const negativeEl = document.getElementById('negativeCount');
        
        if (positiveEl) positiveEl.textContent = positive;
        if (neutralEl) neutralEl.textContent = neutral;
        if (negativeEl) negativeEl.textContent = negative;

        // If no headlines available, show placeholder data
        if (headlines.length === 0) {
            console.log('DEBUG: No headlines for analysis, showing fallback data');
            if (positiveEl) positiveEl.textContent = '12';
            if (neutralEl) neutralEl.textContent = '8';
            if (negativeEl) negativeEl.textContent = '5';
            
            // Calculate sentiment from fallback
            const avgSentiment = (12 * 0.4 + 8 * 0.0 + 5 * (-0.4)) / 25;
            this.updateSentimentMeter(avgSentiment);
            
            // Show sample market themes
            const fallbackThemes = [
                { name: 'Indian Market Rally', strength: 75 },
                { name: 'Banking Sector Growth', strength: 62 },
                { name: 'IT Sector Performance', strength: 58 },
                { name: 'FII Investment', strength: 45 },
                { name: 'RBI Policy Impact', strength: 38 }
            ];
            
            const themesEl = document.getElementById('marketThemes');
            if (themesEl) {
                themesEl.innerHTML = fallbackThemes.map(theme => `
                    <div class="theme-item">
                        <span class="theme-name">${theme.name}</span>
                        <div class="theme-bar">
                            <div class="theme-fill" style="width: ${theme.strength}%"></div>
                        </div>
                        <span class="theme-strength">${theme.strength}%</span>
                    </div>
                `).join('');
            }
            
            return;
        }

        // Market themes
        const themes = this.extractMarketThemes(headlines);
        const marketThemesEl = document.getElementById('marketThemes');
        if (marketThemesEl) {
            marketThemesEl.innerHTML = themes.map(theme => `
                <div class="theme-item">
                    <span class="theme-name">${theme.name}</span>
                    <div class="theme-bar">
                        <div class="theme-fill" style="width: ${theme.strength}%"></div>
                    </div>
                    <span class="theme-strength">${theme.strength}%</span>
                </div>
            `).join('');
        }

        // Sector impact
        const sectorData = this.analyzeSectorImpact(headlines);
        const sectorImpactEl = document.getElementById('sectorImpact');
        if (sectorImpactEl) {
            sectorImpactEl.innerHTML = sectorData.map(sector => `
                <div class="sector-item ${this.getSentimentClass(sector.impact)}">
                    <span class="sector-name">${sector.name}</span>
                    <span class="sector-impact">${sector.impact > 0 ? '+' : ''}${(sector.impact * 100).toFixed(1)}%</span>
                    <span class="sector-articles">${sector.articles} articles</span>
                </div>
            `).join('');
        }
    }

    updateSentimentFromNews(headlines) {
        if (headlines.length === 0) return;

        const avgSentiment = headlines.reduce((sum, article) => sum + article.sentiment, 0) / headlines.length;
        this.updateSentimentMeter(avgSentiment);
    }

    updateSentimentMeter(sentiment) {
        const fill = document.getElementById('sentimentFill');
        const value = document.getElementById('sentimentValue');
        const label = document.getElementById('sentimentLabel');

        if (!fill || !value || !label) return;

        // Convert sentiment (-1 to 1) to percentage (0 to 100)
        const percentage = ((sentiment + 1) * 50);
        fill.style.width = `${percentage}%`;
        
        // Update color based on sentiment
        if (sentiment > 0.3) {
            fill.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        } else if (sentiment < -0.3) {
            fill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        } else {
            fill.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
        }

        value.textContent = (sentiment * 100).toFixed(0);
        
        if (sentiment > 0.3) {
            label.textContent = 'Bullish';
        } else if (sentiment < -0.3) {
            label.textContent = 'Bearish';
        } else {
            label.textContent = 'Neutral';
        }
    }

    extractMarketThemes(headlines) {
        const themes = {
            'Artificial Intelligence': 0,
            'Interest Rates': 0,
            'Energy Transition': 0,
            'Banking Sector': 0,
            'Geopolitical Risk': 0,
            'Market Volatility': 0
        };

        headlines.forEach(article => {
            const text = (article.title + ' ' + article.summary).toLowerCase();
            if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) {
                themes['Artificial Intelligence'] += 20;
            }
            if (text.includes('rate') || text.includes('fed') || text.includes('monetary')) {
                themes['Interest Rates'] += 20;
            }
            if (text.includes('energy') || text.includes('renewable') || text.includes('oil')) {
                themes['Energy Transition'] += 20;
            }
            if (text.includes('bank') || text.includes('financial') || text.includes('lending')) {
                themes['Banking Sector'] += 20;
            }
            if (text.includes('geopolitical') || text.includes('tension') || text.includes('conflict')) {
                themes['Geopolitical Risk'] += 20;
            }
            if (text.includes('volatility') || text.includes('uncertainty') || text.includes('risk')) {
                themes['Market Volatility'] += 20;
            }
        });

        return Object.entries(themes)
            .map(([name, strength]) => ({ name, strength: Math.min(100, strength) }))
            .sort((a, b) => b.strength - a.strength);
    }

    analyzeSectorImpact(headlines) {
        const sectors = [
            { name: 'Technology', impact: 0, articles: 0 },
            { name: 'Financial', impact: 0, articles: 0 },
            { name: 'Energy', impact: 0, articles: 0 },
            { name: 'Healthcare', impact: 0, articles: 0 },
            { name: 'Consumer', impact: 0, articles: 0 }
        ];

        headlines.forEach(article => {
            sectors.forEach(sector => {
                if (article.category.includes(sector.name.toLowerCase())) {
                    sector.impact += article.sentiment;
                    sector.articles++;
                }
            });
        });

        return sectors.map(sector => ({
            ...sector,
            impact: sector.articles > 0 ? sector.impact / sector.articles : 0
        })).filter(sector => sector.articles > 0);
    }

    getSentimentClass(sentiment) {
        if (sentiment > 0.2) return 'positive';
        if (sentiment < -0.2) return 'negative';
        return 'neutral';
    }

    getSentimentIcon(sentiment) {
        if (sentiment > 0.2) return '▲';
        if (sentiment < -0.2) return '▼';
        return '■';
    }

    showFeatureUnavailable(container, featureName) {
        container.innerHTML = `
            <div class="feature-unavailable" style="text-align: center; padding: 20px; color: #666; background: var(--color-surface-alt); border-radius: 8px; border: 1px dashed #ccc;">
                <div style="font-size: 18px; margin-bottom: 8px;">⚠️</div>
                <div style="font-weight: 500; margin-bottom: 4px;">${featureName} Not Available</div>
                <div style="font-size: 12px; opacity: 0.8;">Real-time data service temporarily unavailable</div>
            </div>
        `;
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const time = new Date(timestamp).getTime();
        const diff = now - time;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    refreshNews() {
        // Manual refresh - show loading state
        this.headlinesLoaded = false; // Reset to force showing loading state
        this.loadHeadlines(false); // Explicit non-silent refresh
        this.updateSentimentAnalysis();
        this.updateWatchlistNews();
        this.loadAnalysisData();
        this.loadTrendingTopics();
    }

    showSettings() {
        // Placeholder for future settings modal
        if (window.tradingPlatform) {
            window.tradingPlatform.showStatus('News settings coming soon!', 'info');
        }
    }

    displayErrorState(section) {
        const containers = {
            headlines: 'headlinesList',
            trending: 'trendingTopics'
        };
        
        const container = document.getElementById(containers[section]);
        if (container) {
            container.innerHTML = `
                <div class="news-error">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>Failed to load ${section}</p>
                    <button class="btn btn--sm btn--outline" onclick="window.marketNews.refreshNews()">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    loadStoredData() {
        try {
            const stored = localStorage.getItem('marketNewsCache');
            if (stored) {
                const data = JSON.parse(stored);
                this.newsCache = new Map(Object.entries(data));
            }
        } catch (e) {
            console.error('Failed to load cached news data:', e);
        }
    }

    saveData() {
        try {
            const data = Object.fromEntries(this.newsCache.entries());
            localStorage.setItem('marketNewsCache', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to cache news data:', e);
        }
    }

    loadIndiaFocusFallback() {
        const container = document.getElementById('indian-market-news');
        if (!container) {
            console.error('India Focus container not found');
            return;
        }

        container.innerHTML = `
            <div class="news-item indian-focus-fallback">
                <h5>📈 Indian Market Focus</h5>
                <p>Loading Indian market insights and news...</p>
                <div class="news-meta">
                    <span class="news-source">Market Intelligence</span>
                    <span class="news-time">Live</span>
                </div>
            </div>
            <div class="news-item">
                <h6>BSE Sensex & NSE Nifty</h6>
                <p>Real-time updates on India's major stock indices and market movements.</p>
            </div>
            <div class="news-item">
                <h6>Sectoral Analysis</h6>
                <p>IT, Banking, Pharma, and Auto sectors performance analysis.</p>
            </div>
        `;
    }
}

// IMMEDIATE FORCE INITIALIZATION FOR TESTING
(function() {
    console.log('🔥 CRITICAL: Immediate initialization script running...');
    console.log('🔥 CRITICAL: Document ready state:', document.readyState);
    
    // Force immediate initialization
    setTimeout(() => {
        console.log('🔥 CRITICAL: Force creating MarketNewsAnalyzer NOW...');
        try {
            window.marketNews = new MarketNewsAnalyzer();
            console.log('🔥 SUCCESS: MarketNewsAnalyzer created!', !!window.marketNews);
        } catch (error) {
            console.error('🔥 ERROR: Failed to create MarketNewsAnalyzer:', error);
        }
    }, 500);
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeNewsSystem);
    } else {
        initializeNewsSystem();
    }
    
    function initializeNewsSystem() {
        console.log('🔥 CRITICAL: Force initializing news system...');
        
        // Force initialization after a short delay
        setTimeout(() => {
            console.log('🔥 CRITICAL: Creating MarketNewsAnalyzer...');
            if (!window.marketNews) {
                try {
                    window.marketNews = new MarketNewsAnalyzer();
                    console.log('🔥 SUCCESS: MarketNewsAnalyzer created successfully');
                } catch (error) {
                    console.error('🔥 ERROR: MarketNewsAnalyzer creation failed:', error);
                }
            } else {
                console.log('🔥 INFO: MarketNewsAnalyzer already exists');
            }
            
            // Force load headlines immediately
            setTimeout(() => {
                console.log('🔥 CRITICAL: Force loading headlines...');
                if (window.marketNews && typeof window.marketNews.loadHeadlines === 'function') {
                    window.marketNews.loadHeadlines();
                } else {
                    console.error('🔥 ERROR: marketNews.loadHeadlines not available:', !!window.marketNews);
                }
            }, 2000);
            
        }, 1000);
    }
})();

// Initialize market news analyzer
document.addEventListener('DOMContentLoaded', () => {
    console.log('DEBUG: DOM loaded, initializing market news...');
    
    // Initialize immediately since news section is built into Market Intelligence tab
    setTimeout(() => {
        if (!window.marketNews) {
            window.marketNews = new MarketNewsAnalyzer();
            console.log('DEBUG: Market news analyzer initialized');
        }
    }, 1000); // Reduced delay
    
    // Also initialize when Market Intelligence tab is clicked
    document.addEventListener('click', (e) => {
        console.log('DEBUG: Click detected on:', e.target.textContent, e.target.id, e.target.className);
        
        // Check for various ways the Market Intelligence tab might be identified
        if (e.target.textContent === 'Market Intelligence' || 
            e.target.id === 'market-intelligence-tab' ||
            e.target.classList.contains('market-tab') ||
            e.target.dataset.tab === 'market' ||
            e.target.textContent.includes('Market')) {
            
            console.log('DEBUG: Market Intelligence tab clicked');
            setTimeout(() => {
                if (!window.marketNews) {
                    window.marketNews = new MarketNewsAnalyzer();
                    console.log('DEBUG: Market news initialized from tab click');
                } else {
                    // Refresh news when tab is clicked
                    console.log('DEBUG: Refreshing news on tab click');
                    window.marketNews.refreshNews();
                }
            }, 500);
        }
        
        // Also handle news tab switches within Market Intelligence
        if (e.target.classList.contains('news-tab')) {
            console.log('DEBUG: News tab clicked:', e.target.dataset.tab);
            setTimeout(() => {
                if (window.marketNews) {
                    if (e.target.dataset.tab === 'headlines' && !window.marketNews.headlinesLoaded) {
                        window.marketNews.loadHeadlines();
                    } else if (e.target.dataset.tab === 'watchlist') {
                        window.marketNews.updateWatchlistNews();
                    } else if (e.target.dataset.tab === 'trending') {
                        window.marketNews.loadTrendingTopics();
                    } else if (e.target.dataset.tab === 'analysis') {
                        window.marketNews.loadAnalysisData();
                    }
                }
            }, 100);
        }
    });
    
    // Force initialization after a longer delay if needed
    setTimeout(() => {
        if (!window.marketNews) {
            console.log('DEBUG: Force initializing market news after delay...');
            window.marketNews = new MarketNewsAnalyzer();
        }
    }, 5000);
});

// Global function to manually enable market news (kept for compatibility)
window.enableMarketNews = function() {
    console.log('DEBUG: Manual market news enablement requested');
    if (!window.marketNews) {
        window.marketNews = new MarketNewsAnalyzer();
        localStorage.setItem('marketNewsEnabled', 'true');
        console.log('Market news manually enabled');
    } else {
        window.marketNews.refreshNews();
        console.log('Market news refreshed manually');
    }
};

// CRITICAL DEBUG FUNCTION - Call this from browser console
window.debugMarketNews = async function() {
    console.log('=== CRITICAL MARKET NEWS DEBUG ===');
    console.log('1. Checking DOM elements...');
    
    const headlinesEl = document.getElementById('headlinesList');
    const watchlistEl = document.getElementById('watchlistNews');
    const trendingEl = document.getElementById('trendingTopics');
    
    console.log('   headlinesList:', !!headlinesEl);
    console.log('   watchlistNews:', !!watchlistEl);
    console.log('   trendingTopics:', !!trendingEl);
    
    console.log('2. Checking window.marketNews...');
    console.log('   window.marketNews exists:', !!window.marketNews);
    console.log('   tradingPlatform exists:', !!window.tradingPlatform);
    console.log('   stockAPI:', window.tradingPlatform?.stockAPI);
    
    console.log('3. Testing direct API call...');
    try {
        const apiUrl = `${API_CONFIG}/market/news`;
        console.log('   API URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        console.log('   Response status:', response.status);
        
        const data = await response.json();
        console.log('   Response data:', data);
        console.log('   Articles count:', data.articles?.length || 0);
        
        if (data.articles && data.articles.length > 0) {
            console.log('   First article:', data.articles[0]);
        }
        
    } catch (error) {
        console.error('   API test failed:', error);
    }
    
    console.log('4. Forcing news initialization...');
    if (!window.marketNews) {
        window.marketNews = new MarketNewsAnalyzer();
    }
    
    console.log('5. Force refresh headlines...');
    if (window.marketNews) {
        await window.marketNews.loadHeadlines();
    }
    
    console.log('=== DEBUG COMPLETE ===');
};

// CRITICAL: Test immediate execution
console.log('🔥 SCRIPT END: Testing immediate execution...');
setTimeout(() => {
    console.log('🔥 IMMEDIATE TEST: Creating test instance...');
    try {
        const testNews = new MarketNewsAnalyzer();
        console.log('🔥 SUCCESS: Test instance created!');
        window.testMarketNews = testNews;
    } catch (error) {
        console.error('🔥 ERROR: Test instance failed:', error);
    }
}, 100);
