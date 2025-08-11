// WebSocketManager Class - Enhanced Connection Management
class WebSocketManager {
    constructor(url, tradingPlatform) {
        this.url = url;
        this.platform = tradingPlatform;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
    }
    
    connect() {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        this.socket = io(this.url, {
            transports: ['websocket', 'polling'],
            timeout: 5000
        });
        
        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            this.platform.showStatus('Connected to live data feed', 'success');
            const badge = document.getElementById('connectionStatus');
            const textEl = document.getElementById('connectionStatusText');
            if (badge) badge.innerHTML = '<i class="fas fa-circle"></i> Live';
            if (textEl) textEl.textContent = 'Live';
        });
        
        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.isConnecting = false;
            const badge = document.getElementById('connectionStatus');
            const textEl = document.getElementById('connectionStatusText');
            if (badge) badge.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
            if (textEl) textEl.textContent = 'Disconnected';
            this.attemptReconnect();
        });
        
        this.socket.on('price_update', (stockData) => {
            try {
                this.platform.updateRealTimePrice(stockData);
            } catch (e) {
                console.error('Failed to process price_update', e);
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.isConnecting = false;
            const badge = document.getElementById('connectionStatus');
            const textEl = document.getElementById('connectionStatusText');
            if (badge) badge.innerHTML = '<i class="fas fa-circle"></i> Disconnected';
            if (textEl) textEl.textContent = 'Disconnected';
            this.attemptReconnect();
        });
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.platform.showError('Failed to connect to live data feed');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        setTimeout(() => {
            console.log(`Reconnection attempt ${this.reconnectAttempts}`);
            this.connect();
        }, delay);
    }
}

// Institutional Trading Platform V5.0 - Live Data Only
class InstitutionalTradingPlatform {
    constructor() {
        this.portfolios = new Map();
        this.activePortfolio = null;
        this.liveStocks = new Map();
        this.charts = new Map();
        this.orderBook = [];
        this.watchlist = new Set();
        this.symbolMeta = new Map(); // cache: symbol -> { sector }
        this._miRefreshTimer = null; // debounce timer for market intelligence refresh
        
        // Auto-detect API URL based on environment
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:5000' : window.location.origin;
        this.stockAPI = `${baseUrl}/api`;
        
        // Replace the old socket initialization with WebSocketManager
        this.webSocketManager = new WebSocketManager(baseUrl, this);
        this.socket = null; // Will be set by WebSocketManager
        
        // Auto-refresh intervals
        this.refreshIntervals = {
            dashboard: null,    // 5 seconds - portfolio and main data
            marketData: null,   // 5 seconds - stock prices and market intelligence
            time: null          // 1 second - time and quick metrics
        };
        
        // UI update guards (prevent flicker)
        this.updateGuards = new Set();
        
        // Debounced portfolio update for real-time price changes
        this.portfolioUpdateTimeouts = new Map(); // symbol -> timeout
        
        // Initialize the platform
        this.init();
    }

    // DOM Update Utilities (prevent flicker)
    updateElementContent(element, newContent, useFragment = true) {
        if (!element || this.updateGuards.has(element.id || element.className)) return;
        
        const key = element.id || element.className || 'element';
        if (useFragment && typeof newContent === 'string') {
            // Use document fragment to minimize reflow
            const template = document.createElement('template');
            template.innerHTML = newContent.trim();
            
            // Only update if content actually changed
            if (element.innerHTML.trim() !== newContent.trim()) {
                this.updateGuards.add(key);
                element.replaceChildren(...template.content.childNodes);
                setTimeout(() => this.updateGuards.delete(key), 150);
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

    async loadPortfolios() {
        try {
            const response = await fetch(`${this.stockAPI}/portfolios`);
            if (response.ok) {
                const data = await response.json();
                if (data.portfolios) {
                    this.portfolios.clear();
                    data.portfolios.forEach(portfolio => {
                        this.portfolios.set(portfolio.id, portfolio);
                    });
                }
            }
            this.updatePortfolioSelector();
        } catch (error) {
            console.error('Error loading portfolios:', error);
        }
    }

    async createPortfolio(formData) {
        try {
            const response = await fetch(`${this.stockAPI}/portfolios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.portfolios.set(result.portfolio.id, result.portfolio);
                return result.portfolio;
            } else {
                throw new Error(result.error || 'Failed to create portfolio');
            }
        } catch (error) {
            console.error('Portfolio creation failed:', error);
            throw error;
        }
    }

    async loadPortfolios() {
        try {
            const response = await fetch(`${this.stockAPI}/portfolios`);
            const data = await response.json();
            
            if (data.portfolios) {
                this.portfolios.clear();
                data.portfolios.forEach(portfolio => {
                    this.portfolios.set(portfolio.id, portfolio);
                });
                this.updatePortfolioSelector();
            }
        } catch (error) {
            console.error('Failed to load portfolios:', error);
        }
    }


    async init() {
        await this.loadPortfolios();
        this.setupEventListeners();
        this.setupTabNavigation();
        this.initializeWebSocket();
        this.updateCurrentTime();
        this.startRealTimeUpdates();
        
        // Format header metrics on initial load
        setTimeout(() => this.formatHeaderMetrics(), 1000);
        
        console.log('🚀 Live Trading Platform Initialized - No Mock Data');
    }

    initializeWebSocket() {
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
            script.onload = () => this.connectSocket();
            document.head.appendChild(script);
        } else {
            this.connectSocket();
        }
    }

    connectSocket() {
        // Use the new WebSocketManager instead of direct Socket.IO
        this.webSocketManager.connect();
        this.socket = this.webSocketManager.socket;
    }

    setupEventListeners() {
        // DASHBOARD TAB - Stock input functionality
        const stockTickerInput = document.getElementById('stockTicker');
        const addStockBtn = document.getElementById('addStockBtn');
        const refreshBtn = document.getElementById('refreshBtn');

        if (stockTickerInput) {
            stockTickerInput.addEventListener('input', async (e) => {
                const query = e.target.value;
                if (query.length > 1) {
                    const suggestions = await this.searchStocks(query);
                    const datalist = document.getElementById('stockSuggestions');
                    if (datalist) {
                        datalist.innerHTML = '';
                        suggestions.forEach(stock => {
                            const option = document.createElement('option');
                            option.value = stock.symbol;
                            option.textContent = `${stock.symbol} - ${stock.name}`;
                            datalist.appendChild(option);
                        });
                    }
                }
            });

            stockTickerInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addStockFromInput();
                }
            });
        }

        if (addStockBtn) {
            addStockBtn.addEventListener('click', () => {
                this.addStockFromInput();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshAllStocks();
            });
        }

        // TRADING TAB - Stock Lookup functionality
        const tradingStockInput = document.getElementById('tradingStockTicker');
        const lookupBtn = document.getElementById('lookupStockBtn');

        if (tradingStockInput) {
            // Auto-complete for trading tab
            tradingStockInput.addEventListener('input', async (e) => {
                const query = e.target.value;
                if (query.length > 1) {
                    const suggestions = await this.searchStocks(query);
                    const datalist = document.getElementById('tradingStockSuggestions');
                    if (datalist) {
                        datalist.innerHTML = '';
                        suggestions.forEach(stock => {
                            const option = document.createElement('option');
                            option.value = stock.symbol;
                            option.textContent = `${stock.symbol} - ${stock.name} (${stock.exchange})`;
                            datalist.appendChild(option);
                        });
                    }
                }
            });

            // Enter key support
            tradingStockInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.lookupTradingStock();
                }
            });
        }

        if (lookupBtn) {
            lookupBtn.addEventListener('click', () => {
                this.lookupTradingStock();
            });
        }

        // ===== CLEAN PORTFOLIO BUTTON IMPLEMENTATION =====
        this.initializePortfolioButtons();

        // Fix the form submission
        const createForm = document.getElementById('createPortfolioForm');
        if (createForm) {
            // Remove any existing listeners first
            createForm.replaceWith(createForm.cloneNode(true));
            const newCreateForm = document.getElementById('createPortfolioForm');
            
            newCreateForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('Portfolio form submitted - calling createNewPortfolio');
                await this.createNewPortfolio();
            });
        }

        // Also add direct button click handler as backup for portfolio creation
        const createSubmitBtn = document.querySelector('button[form="createPortfolioForm"]');
        if (createSubmitBtn) {
            createSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('Portfolio button clicked'); // Debug log
                await this.createNewPortfolio();
            });
        }

        // Portfolio selector
        const portfolioSelect = document.getElementById('portfolioSelect');
        if (portfolioSelect) {
            portfolioSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.setActivePortfolio(e.target.value);
                    // Always show delete button when portfolio is selected
                    const deleteBtn = document.getElementById('deletePortfolioBtn');
                    if (deleteBtn) {
                        deleteBtn.style.display = 'block';
                        deleteBtn.style.visibility = 'visible';
                        deleteBtn.style.opacity = '1';
                    }
                } else {
                    // Show delete button even when no specific portfolio is selected (if portfolios exist)
                    const deleteBtn = document.getElementById('deletePortfolioBtn');
                    const portfolioSelect = document.getElementById('portfolioSelect');
                    if (deleteBtn && portfolioSelect) {
                        // Show delete button if there are portfolios to delete
                        const hasPortfolios = portfolioSelect.options.length > 1 || 
                                            (portfolioSelect.options.length === 1 && portfolioSelect.options[0].value !== '');
                        deleteBtn.style.display = hasPortfolios ? 'block' : 'none';
                        deleteBtn.style.visibility = hasPortfolios ? 'visible' : 'hidden';
                        deleteBtn.style.opacity = hasPortfolios ? '1' : '0';
                    }
                }
            });
        }

        // ===== CLEAN PORTFOLIO BUTTON IMPLEMENTATION =====
        this.initializePortfolioButtons();
        
        // Initialize portfolio selector
        this.updatePortfolioSelector();

        // ORDER FORM - Live trading
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.placeOrder();
            });
        }

        // MODAL HANDLERS
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal();
            });
        });

        // Modal backdrop click to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal();
            }
        });

        // BUY/SELL MODAL FORM SUBMISSIONS
        const buyStockForm = document.getElementById('buyStockForm');
        if (buyStockForm) {
            buyStockForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!this.activePortfolio) throw new Error('No active portfolio selected');
                const symbol = document.getElementById('buySymbol').value.trim().toUpperCase();
                const quantity = parseInt(document.getElementById('buyQuantity').value, 10);
                let price = parseFloat(document.getElementById('buyPrice').value);
                if (!symbol || quantity <= 0 || price <= 0) throw new Error('Invalid buy order input');
                
                // Convert USD price to INR for US stocks before storing
                const stockCurrency = this.detectStockCurrency(symbol);
                console.log(`🔍 Stock Symbol: "${symbol}" → Detected Currency: ${stockCurrency}`);
                if (stockCurrency === 'USD') {
                    const originalPrice = price;
                    price = this.convertToINR(price);
                    console.log(`💱 Converting USD price to INR: $${originalPrice.toFixed(2)} → ₹${price.toFixed(2)}`);
                } else {
                    console.log(`💰 Indian stock - using INR price directly: ₹${price.toFixed(2)}`);
                }
                
                await this.buyStockForPortfolio(this.activePortfolio.id, symbol, quantity, price);
                this.hideModal();
                await this.updatePortfolioSummary();
                await this.updatePortfolioDisplay();
            });
        }
        const sellStockForm = document.getElementById('sellStockForm');
        if (sellStockForm) {
            sellStockForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!this.activePortfolio) throw new Error('No active portfolio selected');
                const symbol = document.getElementById('sellSymbol').value.trim().toUpperCase();
                const quantity = parseInt(document.getElementById('sellQuantity').value, 10);
                let price = parseFloat(document.getElementById('sellPrice').value);
                if (!symbol || quantity <= 0 || price <= 0) throw new Error('Invalid sell order input');
                
                // Convert USD price to INR for US stocks before storing
                const stockCurrency = this.detectStockCurrency(symbol);
                console.log(`🔍 Sell Stock Symbol: "${symbol}" → Detected Currency: ${stockCurrency}`);
                if (stockCurrency === 'USD') {
                    const originalPrice = price;
                    price = this.convertToINR(price);
                    console.log(`💱 Converting USD sell price to INR: $${originalPrice.toFixed(2)} → ₹${price.toFixed(2)}`);
                } else {
                    console.log(`💰 Indian stock - using INR sell price directly: ₹${price.toFixed(2)}`);
                }
                
                await this.sellStockFromPortfolio(this.activePortfolio.id, symbol, quantity, price);
                this.hideModal();
                await this.updatePortfolioSummary();
                await this.updatePortfolioDisplay();
            });
        }

        // BUY/SELL MODAL DYNAMIC TOTALS
        const buyQty = document.getElementById('buyQuantity');
        const buyPx = document.getElementById('buyPrice');
        const buySym = document.getElementById('buySymbol');
        const buyTot = document.getElementById('buyTotalCost');
        const recomputeBuy = async () => {
            const q = parseFloat(buyQty.value || '0');
            let p = parseFloat(buyPx.value || '0');
            const s = (buySym.value || '').trim().toUpperCase();
            if (s && (!p || p <= 0)) {
                const d = await this.fetchStockData(s);
                p = d.current_price;
                buyPx.value = p.toFixed(2);
            }
            if (q > 0 && p > 0) {
                let total = q * p;
                // Convert to INR if this is a US stock
                if (s) {
                    const stockCurrency = this.detectStockCurrency(s);
                    if (stockCurrency === 'USD') {
                        total = this.convertToINR(total);
                    }
                }
                buyTot.textContent = this.formatCurrency(total, 'INR', false);
            }
        };
        if (buyQty) buyQty.addEventListener('input', () => { recomputeBuy(); });
        if (buyPx) buyPx.addEventListener('input', () => { recomputeBuy(); });
        if (buySym) buySym.addEventListener('change', () => { recomputeBuy(); });

        const sellQty = document.getElementById('sellQuantity');
        const sellPx = document.getElementById('sellPrice');
        const sellTot = document.getElementById('sellTotalProceeds');
        const sellSym = document.getElementById('sellSymbol');
        const recomputeSell = async () => {
            const q = parseFloat(sellQty.value || '0');
            let p = parseFloat(sellPx.value || '0');
            const s = (sellSym.value || '').trim().toUpperCase();
            if (s && (!p || p <= 0)) {
                const d = await this.fetchStockData(s);
                p = d.current_price;
                sellPx.value = p.toFixed(2);
            }
            if (q > 0 && p > 0) {
                let total = q * p;
                // Convert to INR if this is a US stock
                if (s) {
                    const stockCurrency = this.detectStockCurrency(s);
                    if (stockCurrency === 'USD') {
                        total = this.convertToINR(total);
                    }
                }
                sellTot.textContent = this.formatCurrency(total, 'INR', false);
            }
        };
        if (sellQty) sellQty.addEventListener('input', () => { recomputeSell(); });
        if (sellPx) sellPx.addEventListener('input', () => { recomputeSell(); });

        // ORDER FORM COST CALC
        const orderFormEl = document.getElementById('orderForm');
        if (orderFormEl) {
            const calcBtn = Array.from(orderFormEl.querySelectorAll('.btn.btn--outline')).find(b => b.textContent.includes('Calculate'));
            const orderSymbol = orderFormEl.querySelector('#orderSymbol');
            const orderQty = orderFormEl.querySelector('#orderQuantity');
            const orderPrice = orderFormEl.querySelector('#orderPrice');
            const computeCost = async () => {
                const s = (orderSymbol.value || '').trim().toUpperCase();
                const q = parseInt(orderQty.value || '0', 10);
                if (!s || q <= 0) throw new Error('Enter symbol and quantity');
                const d = await this.fetchStockData(s);
                const p = d.current_price;
                if (orderPrice) orderPrice.value = p.toFixed(2);
                
                // Apply currency conversion for total cost display
                let finalPrice = p;
                const stockCurrency = this.detectStockCurrency(s);
                if (stockCurrency === 'USD') {
                    finalPrice = this.convertToINR(p);
                }
                const total = q * finalPrice;
                
                this.showStatus(`Est. cost for ${q} ${s}: ${this.formatCurrency(total, 'INR', false)}`, 'info');
            };
            if (calcBtn) calcBtn.addEventListener('click', async (e) => { e.preventDefault(); await computeCost(); });
            if (orderSymbol) orderSymbol.addEventListener('change', async () => { await computeCost().catch(() => {}); });
        }

        // QUICK ACTIONS
        const clearWatchlistBtn = document.querySelector('[onclick*="clearWatchlist"]');
        if (clearWatchlistBtn) {
            clearWatchlistBtn.addEventListener('click', () => {
                this.clearWatchlist();
            });
        }

        // CSV Portfolio Import Feature
        this.initializeCSVImport();
        
        // TAB NAVIGATION (if not handled elsewhere)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(btn.dataset.tab);
            });
        });

        console.log('✅ All event listeners setup complete');
    }

    // ===== CLEAN PORTFOLIO BUTTON INITIALIZATION =====
    initializePortfolioButtons() {
        console.log('🎯 Initializing clean portfolio buttons...');
        
        // Create Portfolio Button
        const createBtn = document.getElementById('createPortfolioBtn');
        if (createBtn) {
            // Force button classes and basic visibility
            createBtn.className = 'btn btn--primary btn--full-width';
            
            // Remove any existing event listeners
            const newCreateBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
            
            // Add clean event listener
            newCreateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Create Portfolio Button Clicked');
                this.showCreatePortfolioModal();
            });
            
            console.log('✅ Create Portfolio Button initialized');
        }
        
        // Delete Portfolio Button  
        const deleteBtn = document.getElementById('deletePortfolioBtn');
        if (deleteBtn) {
            // Force button classes and basic visibility
            deleteBtn.className = 'btn btn--danger btn--full-width';
            
            // Remove any existing event listeners
            const newDeleteBtn = deleteBtn.cloneNode(true);
            deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
            
            // Add clean event listener
            newDeleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('✅ Delete Portfolio Button Clicked');
                this.handleDeletePortfolioClick();
            });
            
            console.log('✅ Delete Portfolio Button initialized');
        }
        
        // Initialize modal handlers
        this.initializePortfolioModals();
    }
    
    initializePortfolioModals() {
        // Create Portfolio Modal
        const createModal = document.getElementById('createPortfolioModal');
        const createForm = document.getElementById('createPortfolioForm');
        const closeCreateModal = document.getElementById('closeCreateModal');
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        
        // Modal close handlers
        [closeCreateModal, cancelCreateBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.hideCreatePortfolioModal());
            }
        });
        
        // Form submission
        if (createForm) {
            createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleCreatePortfolioSubmit();
            });
        }
        
        // Delete Portfolio Modal
        const deleteModal = document.getElementById('deletePortfolioModal');
        const closeDeleteModal = document.getElementById('closeDeleteModal');
        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        const deleteConfirmation = document.getElementById('deleteConfirmation');
        
        // Modal close handlers
        [closeDeleteModal, cancelDeleteBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => this.hideDeletePortfolioModal());
            }
        });
        
        // Delete confirmation input
        if (deleteConfirmation && confirmDeleteBtn) {
            deleteConfirmation.addEventListener('input', (e) => {
                const isValid = e.target.value.toUpperCase() === 'DELETE';
                confirmDeleteBtn.disabled = !isValid;
            });
        }
        
        // Confirm delete button
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                this.executePortfolioDeletion();
            });
        }
        
        // Close on backdrop click
        [createModal, deleteModal].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        if (modal.id === 'createPortfolioModal') {
                            this.hideCreatePortfolioModal();
                        } else {
                            this.hideDeletePortfolioModal();
                        }
                    }
                });
            }
        });
    }

    // ===== PORTFOLIO ACTION METHODS =====
    showCreatePortfolioModal() {
        const modal = document.getElementById('createPortfolioModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Clear form
            document.getElementById('portfolioName').value = '';
            document.getElementById('portfolioCapital').value = '';
            document.getElementById('portfolioDescription').value = '';
            // Focus on name field
            setTimeout(() => document.getElementById('portfolioName').focus(), 100);
        }
    }
    
    hideCreatePortfolioModal() {
        const modal = document.getElementById('createPortfolioModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    async handleCreatePortfolioSubmit() {
        const name = document.getElementById('portfolioName').value.trim();
        const capital = parseFloat(document.getElementById('portfolioCapital').value);
        const description = document.getElementById('portfolioDescription').value.trim();
        
        if (!name || !capital || capital < 1000) {
            alert('Please provide a valid portfolio name and capital (minimum ₹1,000)');
            return;
        }
        
        try {
            console.log('📤 Creating portfolio with INR capital:', { name, capital: `₹${capital.toLocaleString()}`, description });
            
            const response = await fetch(`${this.stockAPI}/portfolios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    capital: capital,
                    currency: 'INR',
                    description: description
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('✅ Portfolio created successfully:', result.portfolio);
                
                // Add to local portfolios
                this.portfolios.set(result.portfolio.id, result.portfolio);
                
                // Update UI
                this.updatePortfolioSelector();
                this.hideCreatePortfolioModal();
                
                // Auto-select the new portfolio
                const selector = document.getElementById('portfolioSelect');
                if (selector) {
                    selector.value = result.portfolio.id;
                    this.setActivePortfolio(result.portfolio.id);
                }
                
                this.showStatus(`Portfolio "${name}" created successfully!`, 'success');
            } else {
                throw new Error(result.error || 'Failed to create portfolio');
            }
        } catch (error) {
            console.error('❌ Portfolio creation failed:', error);
            alert(`Failed to create portfolio: ${error.message}`);
        }
    }
    
    handleDeletePortfolioClick() {
        const selector = document.getElementById('portfolioSelect');
        const selectedPortfolioId = selector ? selector.value : null;
        
        if (!selectedPortfolioId) {
            alert('Please select a portfolio to delete first.');
            return;
        }
        
        const portfolio = this.portfolios.get(selectedPortfolioId);
        if (!portfolio) {
            alert('Selected portfolio not found.');
            return;
        }
        
        this.showDeletePortfolioModal(selectedPortfolioId, portfolio.name);
    }
    
    showDeletePortfolioModal(portfolioId, portfolioName) {
        const modal = document.getElementById('deletePortfolioModal');
        const nameDisplay = document.getElementById('deletePortfolioName');
        const confirmInput = document.getElementById('deleteConfirmation');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        
        if (modal && nameDisplay) {
            nameDisplay.textContent = `Portfolio: ${portfolioName}`;
            confirmInput.value = '';
            confirmBtn.disabled = true;
            
            // Store portfolio ID for deletion
            modal.dataset.portfolioId = portfolioId;
            modal.dataset.portfolioName = portfolioName;
            
            modal.classList.remove('hidden');
            
            setTimeout(() => confirmInput.focus(), 100);
        }
    }
    
    hideDeletePortfolioModal() {
        const modal = document.getElementById('deletePortfolioModal');
        if (modal) {
            modal.classList.add('hidden');
            delete modal.dataset.portfolioId;
            delete modal.dataset.portfolioName;
        }
    }
    
    async executePortfolioDeletion() {
        const modal = document.getElementById('deletePortfolioModal');
        const portfolioId = modal.dataset.portfolioId;
        const portfolioName = modal.dataset.portfolioName;
        
        if (!portfolioId) {
            alert('No portfolio selected for deletion.');
            return;
        }
        
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const originalText = confirmBtn.textContent;
        
        try {
            confirmBtn.textContent = 'Deleting...';
            confirmBtn.disabled = true;
            
            console.log('🗑️ Deleting portfolio:', portfolioId);
            
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('✅ Portfolio deleted successfully');
                
                // Remove from local portfolios
                this.portfolios.delete(portfolioId);
                
                // Clear active portfolio if it was the deleted one
                if (this.activePortfolio && this.activePortfolio.id === portfolioId) {
                    this.activePortfolio = null;
                }
                
                // Update UI
                this.updatePortfolioSelector();
                this.updatePortfolioSummary();
                this.updatePortfolioDisplay();
                this.hideDeletePortfolioModal();
                
                this.showStatus(`Portfolio "${portfolioName}" deleted successfully!`, 'success');
                
                // Switch to dashboard tab if no portfolios left
                if (this.portfolios.size === 0) {
                    this.switchTab('dashboard');
                }
            } else {
                throw new Error(result.error || 'Failed to delete portfolio');
            }
        } catch (error) {
            console.error('❌ Portfolio deletion failed:', error);
            alert(`Failed to delete portfolio: ${error.message}`);
            
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    }

    updatePortfolioSelector() {
        const selector = document.getElementById('portfolioSelect');
        const deleteBtn = document.getElementById('deletePortfolioBtn');
        
        if (!selector) return;
        
        // Clear and set default option
        selector.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Portfolio...';
        defaultOption.className = 'dropdown-option';
        selector.appendChild(defaultOption);
        
        // Add portfolio options with proper styling
        for (const [id, portfolio] of this.portfolios.entries()) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${portfolio.name} (${portfolio.capital.toLocaleString()})`;
            option.className = 'dropdown-option';
            // Force styling attributes for browser compatibility
            option.style.backgroundColor = '#f9fafb';
            option.style.color = '#1f2937';
            option.style.padding = '10px 12px';
            selector.appendChild(option);
        }
        
        // Ensure selector has proper classes
        selector.className = 'form-control portfolio-selector';
        
        // Show delete button when portfolios exist
        if (deleteBtn) {
            const hasPortfolios = this.portfolios.size > 0;
            deleteBtn.style.display = hasPortfolios ? 'block' : 'none';
            deleteBtn.style.visibility = hasPortfolios ? 'visible' : 'hidden';
            deleteBtn.style.opacity = hasPortfolios ? '1' : '0';
        }
        
        // Auto-select if only one portfolio
        if (this.portfolios.size === 1) {
            const [firstId] = this.portfolios.keys();
            selector.value = firstId;
            this.setActivePortfolio(firstId);
            // Show delete button for the auto-selected portfolio
            if (deleteBtn) {
                deleteBtn.style.display = 'block';
            }
        } else if (this.portfolios.size === 0) {
            // No portfolios available
            selector.innerHTML = '<option value="">No Portfolios Created</option>';
        }
    }

    setActivePortfolio(portfolioId) {
        const portfolio = this.portfolios.get(portfolioId);
        if (!portfolio) {
            this.activePortfolio = null;
            this.updatePortfolioSummary();
            this.updatePortfolioDisplay();
            // Update portfolio tab view if it's currently active
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'portfolio') {
                this.updatePortfolioView();
            }
            return;
        }
        this.activePortfolio = portfolio;
        this.updatePortfolioSummary();
        this.updatePortfolioDisplay();
        // Update portfolio tab view if it's currently active
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'portfolio') {
            this.updatePortfolioView();
        }
    }

    async updatePortfolioSummary() {
        const summaryEl = document.getElementById('portfolioSummary');
        const totalValueEl = document.getElementById('totalValue');
        const availableCashEl = document.getElementById('availableCash');
        const totalPLEl = document.getElementById('totalPL');
        const positionCountEl = document.getElementById('positionCount');

        if (!summaryEl) return;

        if (!this.activePortfolio) {
            summaryEl.style.display = 'none';
            return;
        }

        try {
            summaryEl.style.display = 'grid';
            const [valueData, positionsData] = await Promise.all([
                this.getPortfolioValue(this.activePortfolio.id),
                this.getPortfolioPositions(this.activePortfolio.id)
            ]);

            if (valueData) {
                console.log(`💰 Portfolio Values from Backend:`, {
                    total_value: valueData.total_value,
                    available_cash: valueData.available_cash,
                    total_pnl: valueData.total_pnl
                });
                if (totalValueEl) totalValueEl.textContent = this.formatCurrency(valueData.total_value, 'INR', false);
                if (availableCashEl) availableCashEl.textContent = this.formatCurrency(valueData.available_cash, 'INR', false);
                if (totalPLEl) {
                    totalPLEl.textContent = `${this.formatCurrency(valueData.total_pnl, 'INR', false)} (${valueData.total_pnl_percent.toFixed(2)}%)`;
                    totalPLEl.className = `metric-value ${valueData.total_pnl >= 0 ? 'positive' : 'negative'}`;
                }
            }

            if (positionsData && positionCountEl) {
                const count = positionsData.positions ? Object.keys(positionsData.positions).length : 0;
                positionCountEl.textContent = count.toString();
            }
        } catch (e) {
            console.error('Failed to update portfolio summary', e);
        }
    }

    setupTabNavigation() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(btn.dataset.tab);
            });
        });
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        const activePane = document.getElementById(`${tabId}-tab`);
        if (activePane) {
            activePane.classList.add('active');
        }

        this.initializeTabContent(tabId);
    }

    initializeTabContent(tabId) {
        switch (tabId) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'portfolio':
                this.updatePortfolioView();
                // Also update portfolio data if there's an active portfolio
                if (this.activePortfolio) {
                    this.updatePortfolioDisplay();
                }
                break;
            case 'trading':
                this.updateTradingTerminal();
                break;
            case 'market':
                this.updateMarketView();
                
                // Enhanced Market Intelligence initialization
                console.log('🎯 Market Intelligence tab activated - initializing enhanced features');
                
                // Initialize Enhanced Market Intelligence if not already done
                setTimeout(() => {
                    if (!window.marketIntelligence) {
                        console.log('🚀 Initializing Enhanced Market Intelligence...');
                        if (window.EnhancedMarketIntelligence) {
                            window.marketIntelligence = new window.EnhancedMarketIntelligence();
                            window.marketIntelligence.init();
                            console.log('✅ Enhanced Market Intelligence initialized');
                        } else {
                            console.warn('⚠️ EnhancedMarketIntelligence class not available, retrying...');
                            // Retry after scripts load
                            setTimeout(() => {
                                if (window.EnhancedMarketIntelligence && !window.marketIntelligence) {
                                    window.marketIntelligence = new window.EnhancedMarketIntelligence();
                                    window.marketIntelligence.init();
                                    console.log('✅ Enhanced Market Intelligence initialized (retry)');
                                }
                            }, 2000);
                        }
                    } else {
                        // Refresh if already initialized
                        console.log('🔄 Refreshing Enhanced Market Intelligence...');
                        if (window.marketIntelligence.loadMarketData) {
                            window.marketIntelligence.loadMarketData();
                        }
                    }
                    
                    // Ensure Market News is initialized
                    if (!window.marketNews) {
                        console.log('📰 Initializing Market News...');
                        if (window.MarketNewsAnalyzer) {
                            window.marketNews = new window.MarketNewsAnalyzer();
                        }
                    }
                }, 500);
                
                break;
        }
    }

    async addStockFromInput() {
        const stockTickerInput = document.getElementById('stockTicker');
        const addStockBtn = document.getElementById('addStockBtn');
        
        if (!stockTickerInput || !addStockBtn) return;

        let ticker;

        // Step 1: Validate ticker input first
        try {
            ticker = this.validateTickerInput(stockTickerInput.value);
        } catch (validationError) {
            this.showError(validationError.message);
            return;
        }

        // Step 2: Set loading state
        addStockBtn.textContent = 'Loading...';
        addStockBtn.disabled = true;

        // Step 3: Fetch and process stock data
        try {
            console.log('📡 Fetching stock data for:', ticker);
            const stockData = await this.fetchStockData(ticker);
            console.log('📊 Received stock data:', stockData);
            
            if (stockData && !stockData.error) {
                console.log('✅ Adding stock to watchlist:', ticker);
                this.addStockToWatchlist(stockData);
                stockTickerInput.value = '';
                this.showStatus(`✅ Added ${ticker} to watchlist`, 'success');
                console.log('🎉 Stock successfully added to watchlist');
            } else {
                console.error('❌ Stock data error:', stockData?.error);
                throw new Error(stockData?.error || 'Failed to fetch stock data');
            }
            
        } catch (error) {
            console.error('💥 Failed to add stock:', error);
            this.showError(`❌ Failed to add ${ticker}: ${error.message}`);
        } finally {
            // Step 4: Always restore button state
            addStockBtn.textContent = 'Add Stock';
            addStockBtn.disabled = false;
        }
    }

    // Add this new method:
    async lookupTradingStock() {
        const tradingStockInput = document.getElementById('tradingStockTicker');
        const lookupBtn = document.getElementById('lookupStockBtn');
        
        if (!tradingStockInput || !lookupBtn) return;

        const ticker = tradingStockInput.value.trim().toUpperCase();
        if (!ticker) {
            this.showError('Please enter a stock ticker');
            return;
        }

        lookupBtn.textContent = 'Loading...';
        lookupBtn.disabled = true;

        try {
            const stockData = await this.fetchStockData(ticker);
            if (stockData && !stockData.error) {
                this.displayTradingStockData(stockData);
                // Also add to watchlist
                this.addStockToWatchlist(stockData);
                // Auto-fill the order form
                this.autoFillOrderForm(stockData);
                tradingStockInput.value = '';
                this.showStatus(`Loaded data for ${ticker}`, 'success');
            } else {
                this.showError(`Failed to fetch data for ${ticker}: ${stockData?.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.showError(`Lookup failed: ${error.message}`);
        } finally {
            lookupBtn.textContent = 'Get Live Data';
            lookupBtn.disabled = false;
        }
    }

    displayTradingStockData(stockData) {
        const container = document.querySelector('#trading-tab .live-stock-display .card__body');
        if (!container) return;

        container.innerHTML = `
            <div class="trading-stock-data" data-ticker="${stockData.symbol}">
                <div class="stock-header">
                    <h4>${stockData.symbol} - ${stockData.market} Market</h4>
                    <span class="market-badge">${stockData.market}</span>
                </div>
                
                <div class="price-display">
                    <div class="current-price-large">
                        ${this.formatCurrency(stockData.current_price, stockData.currency)}
                    </div>
                    <div class="price-change ${stockData.change >= 0 ? 'positive' : 'negative'}">
                        ${stockData.change >= 0 ? '+' : ''}${stockData.change.toFixed(2)} 
                        (${stockData.change_percent.toFixed(2)}%)
                    </div>
                </div>

                <div class="stock-metrics">
                    <div class="metric-row">
                        <span>Day High:</span>
                        <span>${this.formatCurrency(stockData.day_high, stockData.currency)}</span>
                    </div>
                    <div class="metric-row">
                        <span>Day Low:</span>
                        <span>${this.formatCurrency(stockData.day_low, stockData.currency)}</span>
                    </div>
                    <div class="metric-row">
                        <span>Volume:</span>
                        <span>${this.formatNumber(stockData.volume)}</span>
                    </div>
                    ${stockData.pe_ratio !== 'N/A' ? `
                    <div class="metric-row">
                        <span>P/E Ratio:</span>
                        <span>${stockData.pe_ratio}</span>
                    </div>` : ''}
                </div>
                
                <div class="trading-actions">
                    <button class="btn btn--primary" onclick="tradingPlatform.quickBuy('${stockData.symbol}', ${stockData.current_price})">
                        <i class="fas fa-shopping-cart"></i> Quick Buy
                    </button>
                    <button class="btn btn--outline" onclick="tradingPlatform.showStockChart('${stockData.symbol}')">
                        <i class="fas fa-chart-line"></i> View Chart
                    </button>
                </div>
                
                <div class="last-updated">
                    Last updated: ${new Date(stockData.last_updated).toLocaleTimeString()}
                </div>
            </div>
        `;
    }

    autoFillOrderForm(stockData) {
        const symbolInput = document.getElementById('orderSymbol');
        const priceInput = document.getElementById('orderPrice');
        
        if (symbolInput) {
            symbolInput.value = stockData.symbol;
        }
        if (priceInput) {
            priceInput.value = stockData.current_price.toFixed(2);
            priceInput.placeholder = `Current: ${this.formatCurrency(stockData.current_price)}`;
        }
    }

    quickBuy(symbol, price) {
        // Open the buy modal with proper price fetching
        this.showBuyModal(symbol);
        
        // Set default quantity
        const quantityInput = document.getElementById('buyQuantity');
        if (quantityInput && !quantityInput.value) {
            quantityInput.value = '1';
        }
    }

    async fetchStockData(ticker) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000); // Reduced to 6s timeout for faster processing
            
            const url = `${this.stockAPI}/stock/${ticker}`;
            
            const response = await window.fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Stock ticker '${ticker}' not found`);
                } else if (response.status >= 500) {
                    throw new Error('Server error - please try again later');
                } else {
                    throw new Error(`Request failed with status ${response.status}`);
                }
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('⏰ Request timed out for:', ticker);
                throw new Error('Request timed out - please try again');
            }
            console.error('💥 API call failed for', ticker, ':', error);
            throw error;
        }
    }

    async fetchHistoricalData(ticker, period = '1mo') {
        try {
            const response = await fetch(`${this.stockAPI}/stock/${ticker}/history?period=${period}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Historical data fetch failed:', error);
            throw error;
        }
    }

    async searchStocks(query) {
        try {
            const response = await fetch(`${this.stockAPI}/search/${query}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.suggestions || [];
        } catch (error) {
            console.error('Stock search failed:', error);
            return [];
        }
    }

    addStockToWatchlist(stockData) {
        console.log('🔄 addStockToWatchlist called with:', stockData.symbol);
        this.liveStocks.set(stockData.symbol, stockData);
        this.watchlist.add(stockData.symbol);
        console.log('📊 Current watchlist size:', this.watchlist.size);
        console.log('📊 Current liveStocks size:', this.liveStocks.size);
        this.subscribeToStock(stockData.symbol);
        this.updateLiveStockDisplay();
        console.log('🔄 updateLiveStockDisplay called');
        this.notifyMarketIntelligence();
        console.log('✅ Stock added to watchlist successfully:', stockData.symbol);
    }

    subscribeToStock(ticker) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('subscribe', { ticker: ticker });
        }
    }

    unsubscribeFromStock(ticker) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('unsubscribe', { ticker: ticker });
        }
    }

    updateRealTimePrice(stockData) {
        // Update stored data
        this.liveStocks.set(stockData.symbol, stockData);

        // Update UI elements
        const stockElements = document.querySelectorAll(`[data-ticker="${stockData.symbol}"]`);
        stockElements.forEach(element => {
            const priceEl = element.querySelector('.current-price');
            const changeEl = element.querySelector('.price-change');
            const volumeEl = element.querySelector('.volume');
            
            if (priceEl) {
                priceEl.textContent = this.formatCurrency(stockData.current_price, stockData.currency);
            }
            
            if (changeEl) {
                const changeText = `${stockData.change >= 0 ? '+' : ''}${stockData.change.toFixed(2)} (${stockData.change_percent.toFixed(2)}%)`;
                changeEl.textContent = changeText;
                changeEl.className = `price-change ${stockData.change >= 0 ? 'positive' : 'negative'}`;
            }

            if (volumeEl) {
                volumeEl.textContent = this.formatNumber(stockData.volume);
            }
        });

        // Update charts if ticker is being displayed
        this.updateStockChart(stockData.symbol);
        
        // If this stock is in the active portfolio, trigger portfolio update
        if (this.activePortfolio) {
            this.debouncedPortfolioUpdate(stockData.symbol);
        }
        
    // Throttled analytics update (price streaming)
    this.notifyMarketIntelligence(true);
    }
    
    // Debounced portfolio update for real-time price changes
    debouncedPortfolioUpdate(symbol) {
        // Clear existing timeout for this symbol
        if (this.portfolioUpdateTimeouts.has(symbol)) {
            clearTimeout(this.portfolioUpdateTimeouts.get(symbol));
        }
        
        // Set new timeout to update portfolio after 1 second of no price changes
        const timeout = setTimeout(async () => {
            console.log(`💰 Updating portfolio due to price change in ${symbol}`);
            await this.updatePortfolioSummary();
            this.portfolioUpdateTimeouts.delete(symbol);
        }, 1000);
        
        this.portfolioUpdateTimeouts.set(symbol, timeout);
    }

    updateStockChart(ticker) {
        // No-op placeholder; charts update only when explicitly requested
        // Extend this to update the live chart if open.
    }

    displayStockData(stockData) {
        const container = document.getElementById('liveStockData');
        if (!container) return;

        const stockCard = this.createStockCard(stockData);
        container.appendChild(stockCard);
    }

    createStockCard(stockData) {
        const card = document.createElement('div');
        card.className = 'stock-card card';
        card.setAttribute('data-ticker', stockData.symbol);
        
        card.innerHTML = `
            <div class="card__header">
                <h4>${stockData.symbol}</h4>
                <span class="market-badge">${stockData.market}</span>
            </div>
            <div class="card__body">
                <div class="stock-price">
                    <span class="current-price">${this.formatCurrency(stockData.current_price, stockData.currency)}</span>
                    <span class="price-change ${stockData.change >= 0 ? 'positive' : 'negative'}">
                        ${stockData.change >= 0 ? '+' : ''}${stockData.change.toFixed(2)} (${stockData.change_percent.toFixed(2)}%)
                    </span>
                </div>
                <div class="stock-details">
                    <div class="detail-row">
                        <span>Volume:</span>
                        <span class="volume">${this.formatNumber(stockData.volume)}</span>
                    </div>
                    <div class="detail-row">
                        <span>High:</span>
                        <span>${this.formatCurrency(stockData.day_high, stockData.currency)}</span>
                    </div>
                    <div class="detail-row">
                        <span>Low:</span>
                        <span>${this.formatCurrency(stockData.day_low, stockData.currency)}</span>
                    </div>
                    ${stockData.pe_ratio !== 'N/A' ? `
                    <div class="detail-row">
                        <span>P/E:</span>
                        <span>${stockData.pe_ratio}</span>
                    </div>` : ''}
                </div>
                <div class="stock-actions">
                    <button class="btn btn--sm btn--outline" onclick="tradingPlatform.showStockChart('${stockData.symbol}')">
                        Chart
                    </button>
                    <button class="btn btn--sm btn--outline" onclick="tradingPlatform.removeFromWatchlist('${stockData.symbol}')">
                        Remove
                    </button>
                </div>
            </div>
        `;

        return card;
    }

    async showStockChart(ticker) {
        try {
            const historicalData = await this.fetchHistoricalData(ticker, '3mo');
            if (historicalData && historicalData.data) {
                this.createLiveChart(ticker, historicalData.data);
            }
        } catch (error) {
            this.showError(`Failed to load chart for ${ticker}`);
        }
    }

    createLiveChart(ticker, data) {
        // Create modal for chart
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal__content modal__content--large">
                <div class="modal__header">
                    <h3>${ticker} - Live Chart</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal__body">
                    <canvas id="liveChart-${ticker}" width="800" height="400"></canvas>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.remove('hidden');

        // Create chart
        const canvas = document.getElementById(`liveChart-${ticker}`);
        const ctx = canvas.getContext('2d');

        const chartData = {
            labels: data.map(d => d.date),
            datasets: [{
                label: `${ticker} Price`,
                data: data.map(d => d.close),
                borderColor: '#1FB8CD',
                backgroundColor: 'rgba(31, 184, 205, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        };

        new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });

        // Close modal handler
        modal.querySelector('.modal-close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    removeFromWatchlist(ticker) {
        this.watchlist.delete(ticker);
        this.liveStocks.delete(ticker);
        this.unsubscribeFromStock(ticker);
        this.updateLiveStockDisplay();
        this.showStatus(`Removed ${ticker} from watchlist`, 'info');
    this.notifyMarketIntelligence();
    }

    clearWatchlist() {
        try {
            for (const ticker of this.watchlist) {
                this.unsubscribeFromStock(ticker);
            }
            this.watchlist.clear();
            this.liveStocks.clear();
            this.updateLiveStockDisplay();
            this.updateMarketView();
            this.updateDashboard();
            this.showStatus('Watchlist cleared', 'info');
            this.notifyMarketIntelligence();
        } catch (e) {
            console.error('Failed to clear watchlist', e);
            this.showError('Failed to clear watchlist');
        }
    }

    async refreshAllStocks() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.textContent = 'Refreshing...';
            refreshBtn.disabled = true;
        }

        try {
            for (const ticker of this.watchlist) {
                const stockData = await this.fetchStockData(ticker);
                if (stockData) {
                    this.updateRealTimePrice(stockData);
                }
            }
            this.showStatus('All stocks refreshed', 'success');
        } catch (error) {
            this.showError('Failed to refresh stocks');
        } finally {
            if (refreshBtn) {
                refreshBtn.textContent = 'Refresh Data';
                refreshBtn.disabled = false;
            }
        }
    }

    // Portfolio management (simplified for live data)
    async createNewPortfolio() {
        const form = document.getElementById('createPortfolioForm');
        if (!form) {
            console.error('Portfolio form not found');
            return;
        }
        
        const nameInput = form.querySelector('#portfolioName');
        const capitalInput = form.querySelector('#initialCapital');
        const descriptionInput = form.querySelector('#portfolioDescription');
        
        if (!nameInput || !capitalInput) {
            console.error('Required form inputs not found');
            this.showError('Form elements not found');
            return;
        }
        
        const name = nameInput.value.trim();
        const capital = parseFloat(capitalInput.value);
        const description = descriptionInput ? descriptionInput.value.trim() : '';

        // Validation
        if (!name || capital <= 0) {
            this.showError('Please provide valid portfolio name and capital amount (must be positive)');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.textContent : 'Create Portfolio';
        
        if (submitBtn) {
            submitBtn.textContent = 'Creating...';
            submitBtn.disabled = true;
        }

        try {
            console.log(`Creating portfolio: ${name} with capital: ${capital}`);
            
            const portfolio = await this.createPortfolio({
                name: name,
                capital: capital,
                description: description
            });
            
            console.log('Portfolio created successfully:', portfolio);
            
            this.activePortfolio = portfolio;
            this.hideModal();
            form.reset();
            this.showStatus(`✅ Portfolio "${name}" created successfully!`, 'success');
            
            // Update the UI
            this.updateDashboard();
            this.updatePortfolioSelector();
            
        } catch (error) {
            console.error('Portfolio creation failed:', error);
            this.showError(`❌ Failed to create portfolio: ${error.message}`);
        } finally {
            if (submitBtn) {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    // Portfolio Position Management Methods
    async buyStockByValue(portfolioId, symbol, targetValue) {
        try {
            // First get current stock price to calculate quantity
            const stockData = await this.fetchStockData(symbol);
            if (!stockData || stockData.error) {
                throw new Error(`Failed to fetch current price for ${symbol}`);
            }
            
            // Calculate quantity based on current market price
            const currentPrice = stockData.current_price;
            const quantity = Math.floor(targetValue / currentPrice);
            
            if (quantity <= 0) {
                throw new Error(`Target value ₹${targetValue} is too small to buy even 1 share of ${symbol} at ₹${currentPrice}`);
            }
            
            // Now buy the calculated quantity without passing price (let backend handle current price)
            return await this.buyStockForPortfolio(portfolioId, symbol, quantity);
            
        } catch (error) {
            throw new Error(`Value-based purchase failed: ${error.message}`);
        }
    }

    async buyStockForPortfolio(portfolioId, symbol, quantity, price = null) {
        try {
            const requestBody = {
                symbol: symbol,
                quantity: quantity
            };
            
            // Only include price if explicitly provided (for manual trades)
            // For CSV imports, let backend fetch current market price
            if (price !== null && price !== undefined) {
                requestBody.price = price;
            }
            
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}/buy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showStatus(`✅ ${result.message}`, 'success');
                await this.updatePortfolioSummary();
                await this.updatePortfolioDisplay();
                
                // Trigger enhanced analytics refresh (if portfolio-enhancements.js is loaded)
                if (this.refreshPortfolioAnalytics) {
                    await this.refreshPortfolioAnalytics();
                }
                
                return result.portfolio;
            } else {
                throw new Error(result.error || 'Failed to buy stock');
            }
            
        } catch (error) {
            this.showError(`Failed to buy ${symbol}: ${error.message}`);
            throw error;
        }
    }

    async sellStockFromPortfolio(portfolioId, symbol, quantity, price) {
        try {
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}/sell`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symbol: symbol,
                    quantity: quantity,
                    price: price
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showStatus(`✅ ${result.message}`, 'success');
                await this.updatePortfolioSummary();
                await this.updatePortfolioDisplay();
                
                // Trigger enhanced analytics refresh (if portfolio-enhancements.js is loaded)
                if (this.refreshPortfolioAnalytics) {
                    await this.refreshPortfolioAnalytics();
                }
                
                return result.portfolio;
            } else {
                throw new Error(result.error || 'Failed to sell stock');
            }
            
        } catch (error) {
            this.showError(`Failed to sell ${symbol}: ${error.message}`);
            throw error;
        }
    }

    async getPortfolioValue(portfolioId) {
        try {
            // Add timestamp to prevent caching and ensure fresh data
            const timestamp = Date.now();
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}/value?t=${timestamp}`);
            const data = await response.json();
            
            if (response.ok) {
                console.log(`🔄 Portfolio value refreshed: Total=${data.total_value}, P&L=${data.total_pnl}`);
                return data;
            } else {
                throw new Error(data.error || 'Failed to get portfolio value');
            }
            
        } catch (error) {
            console.error('Failed to get portfolio value:', error);
            return null;
        }
    }

    async getPortfolioPositions(portfolioId) {
        try {
            // Add timestamp to prevent caching and ensure fresh data
            const timestamp = Date.now();
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}/positions?t=${timestamp}`);
            const data = await response.json();
            
            if (response.ok) {
                console.log(`🔄 Portfolio positions refreshed: ${Object.keys(data.positions || {}).length} positions`);
                return data;
            } else {
                throw new Error(data.error || 'Failed to get portfolio positions');
            }
            
        } catch (error) {
            console.error('Failed to get portfolio positions:', error);
            return null;
        }
    }

    // Enhanced portfolio display update
    async updatePortfolioDisplay() {
        if (!this.activePortfolio) return;
        
        const positionsContainer = document.getElementById('portfolioPositions');
        const summaryContainer = document.querySelector('.portfolio-summary');
        
        // Show loading indicators
        if (positionsContainer) {
            positionsContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p>Refreshing portfolio with live prices...</p>
                </div>
            `;
        }
        
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="loading-metrics">
                    <i class="fas fa-sync fa-spin"></i> Updating...
                </div>
            `;
        }
        
        try {
            // Get current portfolio value with live prices
            const [valueData, positionsData] = await Promise.all([
                this.getPortfolioValue(this.activePortfolio.id),
                this.getPortfolioPositions(this.activePortfolio.id)
            ]);
            
            if (valueData && positionsData) {
                this.displayPortfolioMetrics(valueData);
                await this.displayPortfolioPositions(positionsData.positions);
                
                // Update enhanced analytics if available
                if (this.updateAnalyticsDisplay) {
                    this.updateAnalyticsDisplay(positionsData.positions);
                }
                
                // Update transaction history if available  
                if (this.updateTransactionHistory) {
                    await this.updateTransactionHistory();
                }
                
                // Update last refresh time in header
                if (typeof this.updateLastRefreshTime === 'function') {
                    this.updateLastRefreshTime();
                } else {
                    console.warn('updateLastRefreshTime method not available');
                }
            } else {
                throw new Error('Failed to fetch portfolio data');
            }
            
        } catch (error) {
            console.warn('Portfolio display update error (will retry automatically):', error);
            
            // Show less intrusive error state - just log and use cached data if available
            if (positionsContainer && positionsContainer.innerHTML.includes('loading-state')) {
                positionsContainer.innerHTML = `
                    <div class="info-state" style="text-align: center; padding: 20px; color: #666;">
                        <i class="fas fa-clock fa-lg"></i>
                        <h4 style="margin: 10px 0;">Portfolio Data Loading...</h4>
                        <p>Live data will refresh automatically in the next update cycle.</p>
                    </div>
                `;
            }
        }
    }

    displayPortfolioMetrics(valueData) {
        const summaryContainer = document.querySelector('.portfolio-summary');
        if (!summaryContainer) return;
        
        summaryContainer.style.display = 'grid';
        summaryContainer.innerHTML = `
            <div class="metric-card">
                <div class="metric-label">Total Value (₹)</div>
                <div class="metric-value">${this.formatCurrency(valueData.total_value, 'INR', false)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Available Cash (₹)</div>
                <div class="metric-value">${this.formatCurrency(valueData.available_cash, 'INR', false)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">P&L (₹)</div>
                <div class="metric-value ${valueData.total_pnl >= 0 ? 'positive' : 'negative'}">
                    ${this.formatCurrency(valueData.total_pnl, 'INR', false)} (${valueData.total_pnl_percent.toFixed(2)}%)
                </div>
            </div>
        `;
    }

    async displayPortfolioPositions(positions) {
        const positionsContainer = document.getElementById('portfolioPositions');
        if (!positionsContainer) return;
        
        if (Object.keys(positions).length === 0) {
            positionsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-pie fa-2x"></i>
                    <h3>No Positions</h3>
                    <p>Start buying stocks to build your portfolio</p>
                </div>
            `;
            return;
        }

        // Build sector breakdown and cards
        const sectorTotals = new Map(); // sector -> invested value
        let positionsHTML = '<h3>Current Positions</h3><div class="positions-grid">';
        const sectorFetches = [];
        
        for (const [symbol, position] of Object.entries(positions)) {
            const currentValue = position.quantity * position.current_price;
            const pnl = currentValue - position.total_cost;
            const pnlPercent = (pnl / position.total_cost) * 100;

            // Ensure sector cached
            if (!this.symbolMeta.has(symbol)) {
                sectorFetches.push(
                    this.fetchStockData(symbol).then(d => {
                        this.symbolMeta.set(symbol, { sector: d.sector || 'Unknown' });
                    })
                );
            }

            positionsHTML += `
                <div class="position-card">
                    <div class="position-header">
                        <h4>${symbol}</h4>
                        <span class="position-quantity">${position.quantity} shares</span>
                    </div>
                    <div class="position-metrics">
                        <div class="metric">
                            <span>Avg Price (₹):</span>
                            <span>${this.formatCurrency(position.avg_price)}</span>
                        </div>
                        <div class="metric">
                            <span>Current Price (₹):</span>
                            <span>${this.formatCurrency(position.current_price)}</span>
                        </div>
                        <div class="metric">
                            <span>Total Value (₹):</span>
                            <span>${this.formatCurrency(currentValue)}</span>
                        </div>
                        <div class="metric">
                            <span>P&L (₹):</span>
                            <span class="${pnl >= 0 ? 'positive' : 'negative'}">
                                ${this.formatCurrency(pnl)} (${pnlPercent.toFixed(2)}%)
                            </span>
                        </div>
                    </div>
                    <div class="position-actions">
                        <button class="btn btn--sm btn--outline" onclick="tradingPlatform.showSellModal('${symbol}', ${position.quantity})">
                            <i class="fas fa-minus"></i> Sell
                        </button>
                        <button class="btn btn--sm btn--primary" onclick="tradingPlatform.showBuyModal('${symbol}')">
                            <i class="fas fa-plus"></i> Buy More
                        </button>
                    </div>
                </div>
            `;
        }

        // Wait for sector fetches then compute totals
        if (sectorFetches.length) await Promise.all(sectorFetches);
        for (const [symbol, position] of Object.entries(positions)) {
            const currentValue = position.quantity * position.current_price;
            const meta = this.symbolMeta.get(symbol) || { sector: 'Unknown' };
            const key = meta.sector || 'Unknown';
            sectorTotals.set(key, (sectorTotals.get(key) || 0) + currentValue);
        }

        positionsHTML += '</div>';

        // Sector breakdown summary
        const totalInvested = Array.from(sectorTotals.values()).reduce((a, b) => a + b, 0);
        let sectorHTML = '<div class="card" style="margin-top:16px"><div class="card__header"><h3><i class="fas fa-layer-group"></i> Sector Allocation</h3></div><div class="card__body"><div class="table-container"><table class="orders-table"><thead><tr><th>Sector</th><th class="text-right">Value</th><th class="text-right">Weight</th></tr></thead><tbody>';
        for (const [sector, val] of sectorTotals.entries()) {
            const weight = totalInvested > 0 ? (val / totalInvested) * 100 : 0;
            sectorHTML += `<tr><td>${sector}</td><td class="text-right">${this.formatCurrency(val)}</td><td class="text-right">${weight.toFixed(2)}%</td></tr>`;
        }
        sectorHTML += '</tbody></table></div></div></div>';

        positionsContainer.innerHTML = positionsHTML + sectorHTML;
    }

    // Quick buy/sell modal methods - FIXED: Clear previous price memory
    showBuyModal(symbol = '') {
        const modal = document.getElementById('buyStockModal');
        if (modal) {
            const symbolInput = document.getElementById('buySymbol');
            const priceInput = document.getElementById('buyPrice');
            const quantityInput = document.getElementById('buyQuantity');
            const totalCostEl = document.getElementById('buyTotalCost');
            
            // Clear all previous values
            symbolInput.value = symbol;
            priceInput.value = '';
            priceInput.placeholder = 'Loading current price...';
            quantityInput.value = '';
            totalCostEl.textContent = '₹0.00';
            
            // Auto-fetch current price if symbol provided
            if (symbol) {
                this.fetchStockData(symbol).then(data => {
                    if (data && !data.error) {
                        // Show price in original currency (USD for US stocks, INR for Indian stocks)
                        const stockCurrency = this.detectStockCurrency(symbol);
                        priceInput.value = data.current_price.toFixed(2);
                        if (stockCurrency === 'USD') {
                            priceInput.placeholder = `Current: $${data.current_price.toFixed(2)} (${this.formatCurrency(data.current_price, 'USD', true)} INR)`;
                        } else {
                            priceInput.placeholder = `Current: ${this.formatCurrency(data.current_price, 'INR', false)}`;
                        }
                    }
                }).catch(e => {
                    priceInput.placeholder = 'Enter price manually';
                });
            }
            
            modal.classList.remove('hidden');
        }
    }

    showSellModal(symbol, maxQuantity) {
        const modal = document.getElementById('sellStockModal');
        if (modal) {
            document.getElementById('sellSymbol').value = symbol;
            document.getElementById('sellQuantity').max = maxQuantity;
            document.querySelector('#sellStockModal .max-quantity').textContent = `Max: ${maxQuantity}`;
            modal.classList.remove('hidden');
        }
    }

    async placeOrder() {
        const form = document.getElementById('orderForm');
        if (!form) return;
        
        const symbolInput = form.querySelector('#orderSymbol');
        const quantityInput = form.querySelector('#orderQuantity');
        const orderTypeSelect = form.querySelector('#orderType');
        
        const symbol = symbolInput ? symbolInput.value.trim().toUpperCase() : '';
        const quantity = quantityInput ? parseInt(quantityInput.value) : 0;
        const orderType = orderTypeSelect ? orderTypeSelect.value : 'Market';

        if (!symbol || quantity <= 0) {
            this.showError('Please enter valid symbol and quantity');
            return;
        }

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Executing Order...';
        submitBtn.disabled = true;

        try {
            // First, get current market price
            const stockData = await this.fetchStockData(symbol);
            if (!stockData || stockData.error) {
                this.showError(`Cannot get current price for ${symbol}: ${stockData?.error || 'Unknown error'}`);
                return;
            }

            const currentPrice = stockData.current_price;
            let finalPrice = currentPrice;
            
            // Apply currency conversion for USD stocks before storing
            const stockCurrency = this.detectStockCurrency(symbol);
            if (stockCurrency === 'USD') {
                finalPrice = this.convertToINR(currentPrice);
                console.log(`🏪 Live Trading - Converting USD to INR: $${currentPrice.toFixed(2)} → ₹${finalPrice.toFixed(2)}`);
            } else {
                console.log(`🏪 Live Trading - Using INR price directly: ₹${finalPrice.toFixed(2)}`);
            }
            
            const totalValue = finalPrice * quantity;

            // Execute the order immediately at market price
            const order = {
                id: Date.now(),
                timestamp: new Date(),
                symbol: symbol,
                type: orderType,
                quantity: quantity,
                price: finalPrice,  // Use converted INR price
                totalValue: totalValue,
                status: 'Executed',
                side: 'Buy',
                executionTime: new Date().toLocaleTimeString()
            };

            this.orderBook.push(order);
            
            // Execute against backend portfolio (requires active portfolio)
            if (!this.activePortfolio) {
                throw new Error('No active portfolio selected');
            }
            await this.buyStockForPortfolio(this.activePortfolio.id, symbol, quantity, finalPrice);  // Use converted price
            await this.updatePortfolioSummary();
            await this.updatePortfolioDisplay();

            this.updateOrdersTable();
            form.reset();

            this.showStatus(
                `✅ Executed: Bought ${quantity} shares of ${symbol} at ${this.formatCurrency(currentPrice)} 
                (Total: ${this.formatCurrency(totalValue)})`, 
                'success'
            );

        } catch (error) {
            this.showError(`Order execution failed: ${error.message}`);
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    updateOrdersTable() {
        const tableBody = document.getElementById('openOrdersBody');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';

        if (this.orderBook.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center">No orders placed</td>';
            tableBody.appendChild(row);
            return;
        }

        // Show last 10 orders (most recent first)
        const recentOrders = this.orderBook.slice(-10).reverse();
        
        recentOrders.forEach(order => {
            const row = document.createElement('tr');
            const statusClass = order.status === 'Executed' ? 'status--success' : 'status--info';
            
            row.innerHTML = `
                <td>${order.executionTime || order.timestamp.toLocaleTimeString()}</td>
                <td><strong>${order.symbol}</strong></td>
                <td>${order.side}</td>
                <td>${order.quantity.toLocaleString()}</td>
                <td>${this.formatCurrency(order.price)}</td>
                <td><span class="status ${statusClass}">${order.status}</span></td>
                <td>
                    ${order.status === 'Executed' 
                        ? `<span class="text-success">✓ ${this.formatCurrency(order.totalValue)}</span>`
                        : `<button class="btn btn--sm btn--outline" onclick="tradingPlatform.cancelOrder(${order.id})">Cancel</button>`
                    }
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    cancelOrder(orderId) {
        this.orderBook = this.orderBook.filter(order => order.id !== orderId);
        this.updateOrdersTable();
        this.showStatus('Order cancelled', 'info');
    }

    // UI Update methods
    updateDashboard() {
        const statsContainer = document.getElementById('dashboardStats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card">
                    <h4>Live Stocks</h4>
                    <span class="stat-value">${this.watchlist.size}</span>
                </div>
                <div class="stat-card">
                    <h4>Portfolios</h4>
                    <span class="stat-value">${this.portfolios.size}</span>
                </div>
                <div class="stat-card">
                    <h4>Open Orders</h4>
                    <span class="stat-value">${this.orderBook.length}</span>
                </div>
                <div class="stat-card">
                    <h4>Connection</h4>
                    <span class="stat-value ${this.socket?.connected ? 'positive' : 'negative'}">
                        ${this.socket?.connected ? 'Live' : 'Disconnected'}
                    </span>
                </div>
            `;
        }
    }

    updatePortfolioView() {
        const content = document.getElementById('portfolioContent');
        if (!content) return;

        if (!this.activePortfolio) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-briefcase fa-3x"></i>
                    <h3>No Portfolio Selected</h3>
                    <p>Create a portfolio to start tracking your live positions and execute trades</p>
                    <button class="btn btn--primary" onclick="tradingPlatform.showCreatePortfolioModal()">
                        <i class="fas fa-plus"></i> Create First Portfolio
                    </button>
                </div>
            `;
            
            // Hide analytics section when no portfolio is selected
            const analyticsSection = document.getElementById('portfolioAnalytics');
            if (analyticsSection) {
                analyticsSection.style.display = 'none';
            }
            return;
        }

        const p = this.activePortfolio;
        content.innerHTML = `
            <div class="portfolio-overview">
                <div class="metrics-row">
                    <div class="card metric-card">
                        <h4>Name</h4>
                        <div class="metric-value large">${p.name}</div>
                    </div>
                    <div class="card metric-card">
                        <h4>Initial Capital</h4>
                        <div class="metric-value large">${this.formatCurrency(p.capital, 'INR', false)}</div>
                    </div>
                    <div class="card metric-card">
                        <h4>Created</h4>
                        <div class="metric-value">${new Date(p.created_date || Date.now()).toLocaleString()}</div>
                    </div>
                </div>
                <div class="card__footer">
                    <button class="btn btn--outline btn--sm" onclick="tradingPlatform.updatePortfolioDisplay()">
                        <i class="fas fa-sync"></i> Refresh
                    </button>
                </div>
            </div>
        `;
        this.updatePortfolioDisplay();
        
        // Show and update portfolio analytics
        const analyticsSection = document.getElementById('portfolioAnalytics');
        if (analyticsSection) {
            analyticsSection.style.display = 'block';
        }
    }

    updateTradingTerminal() {
        this.updateOrdersTable();
    }

    updateMarketView() {
        const container = document.getElementById('marketOverview');
        if (!container) return;
        
        if (this.liveStocks.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-globe fa-3x"></i>
                    <h3>No Market Data</h3>
                    <p>Add stocks to your watchlist to see live market data here</p>
                </div>
            `;
            return;
        }

        // Create market overview with live data
        let marketHTML = '<h3><i class="fas fa-chart-line"></i> Live Market Overview</h3>';
        
        // Market summary stats
        let totalGainers = 0;
        let totalLosers = 0;
        let avgChange = 0;
        
        for (const [ticker, data] of this.liveStocks) {
            if (data.change_percent > 0) totalGainers++;
            else if (data.change_percent < 0) totalLosers++;
            avgChange += data.change_percent;
        }
        
        avgChange = avgChange / this.liveStocks.size;
        
        marketHTML += `
            <div class="market-summary">
                <div class="summary-card">
                    <h4>Market Sentiment</h4>
                    <div class="sentiment ${avgChange >= 0 ? 'positive' : 'negative'}">
                        ${avgChange >= 0 ? '🟢 Bullish' : '🔴 Bearish'}
                    </div>
                    <small>Avg Change: ${avgChange.toFixed(2)}%</small>
                </div>
                <div class="summary-card">
                    <h4>Gainers vs Losers</h4>
                    <div class="gainers-losers">
                        <span class="positive">↗ ${totalGainers}</span>
                        <span class="negative">↘ ${totalLosers}</span>
                    </div>
                </div>
            </div>
            <div class="live-market-grid">
        `;
        
        // Individual stock data
        for (const [ticker, data] of this.liveStocks) {
            marketHTML += `
                <div class="market-item" data-ticker="${ticker}">
                    <div class="market-symbol">
                        <strong>${ticker}</strong>
                        <span class="market-badge">${data.market}</span>
                    </div>
                    <div class="market-price">
                        <span class="current-price">${this.formatCurrency(data.current_price, data.currency)}</span>
                        <span class="price-change ${data.change >= 0 ? 'positive' : 'negative'}">
                            ${data.change >= 0 ? '+' : ''}${data.change_percent.toFixed(2)}%
                        </span>
                    </div>
                    <div class="market-volume">
                        Vol: ${this.formatNumber(data.volume)}
                    </div>
                </div>
            `;
        }
        
        marketHTML += '</div>';
        container.innerHTML = marketHTML;
    }

    updateLiveStockDisplay() {
        const container = document.getElementById('liveStockData');
        if (!container) return;
        container.innerHTML = '';
        if (this.watchlist.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line fa-3x"></i>
                    <h3>No Live Stocks Added</h3>
                    <p>Add stock tickers above to start monitoring live prices</p>
                </div>
            `;
            return;
        }
        for (const ticker of this.watchlist) {
            const stockData = this.liveStocks.get(ticker);
            if (stockData) {
                const stockCard = this.createStockCard(stockData);
                container.appendChild(stockCard);
            }
        }
    }

    // Utility methods
    startRealTimeUpdates() {
        // Clear any existing intervals
        this.stopRealTimeUpdates();
        
        // 1-second updates: time and quick metrics only
        this.refreshIntervals.time = setInterval(() => {
            this.updateCurrentTime();
            this.formatHeaderMetrics();
        }, 1000);
        
        // 30-second updates: portfolio and market data (reduced from 3s to 30s)
        this.refreshIntervals.dashboard = setInterval(async () => {
            console.log('🔄 Auto-refreshing dashboard data (30s interval)...');
            await this.refreshAllData();
        }, 30000);  // Changed from 3000 to 30000
        
        // Initial market data load
        setTimeout(() => this.refreshAllData(), 2000);
        
        console.log('✅ Auto-refresh enabled: 1s (time/metrics), 30s (portfolio/market data)');
    }
    
    // Stop all refresh intervals
    stopRealTimeUpdates() {
        Object.values(this.refreshIntervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        this.refreshIntervals = {
            dashboard: null,
            marketData: null,
            time: null
        };
    }
    
    // Comprehensive data refresh method
    async refreshAllData() {
        try {
            // Show corner indicator
            const indicator = document.getElementById('autoRefreshIndicator');
            if (indicator) {
                indicator.classList.remove('hidden');
            }
            
            // Refresh active portfolio data with live prices
            if (this.activePortfolio) {
                console.log('🔄 Refreshing portfolio data with live prices...');
                await this.updatePortfolioSummary();
                await this.updatePortfolioDisplay();
                this.updateDashboard();
                
                // Refresh analytics without full transaction history (for performance)
                if (this.updateAnalyticsDisplay) {
                    const positionsData = await this.getPortfolioPositions(this.activePortfolio.id);
                    if (positionsData && positionsData.positions) {
                        this.updateAnalyticsDisplay(positionsData.positions);
                    }
                }
            }
            
            // Refresh market intelligence if visible
            const marketIntelTab = document.querySelector('[data-tab="market-intelligence"]');
            if (marketIntelTab && marketIntelTab.classList.contains('active')) {
                this.refreshMarketIntelligence();
            }
            
            // Refresh technical indicators if visible
            const techIndicatorsTab = document.querySelector('[data-tab="technical-indicators"]');
            if (techIndicatorsTab && techIndicatorsTab.classList.contains('active')) {
                this.refreshTechnicalIndicators();
            }
            
            // Update live stock prices for watchlist
            await this.updateWatchlistPrices();
            
            console.log('✅ Auto-refresh completed successfully');
            
        } catch (error) {
            console.error('Error during auto-refresh:', error);
        } finally {
            // Hide corner indicator
            const indicator = document.getElementById('autoRefreshIndicator');
            if (indicator) {
                setTimeout(() => indicator.classList.add('hidden'), 500);
            }
        }
    }
    
    // Refresh market intelligence data
    refreshMarketIntelligence() {
        if (window.marketIntelligence && window.marketIntelligence.refreshData) {
            window.marketIntelligence.refreshData();
        }
    }
    
    // Refresh technical indicators
    refreshTechnicalIndicators() {
        if (window.technicalIndicators && typeof window.technicalIndicators.refresh === 'function') {
            window.technicalIndicators.refresh();
        }
    }
    
    // Update watchlist prices
    async updateWatchlistPrices() {
        if (this.watchlist.size === 0) return;
        
        try {
            for (const symbol of this.watchlist) {
                const data = await this.fetchStockData(symbol);
                if (data) {
                    this.liveStocks.set(symbol, data);
                    this.updateWatchlistDisplay(symbol, data);
                }
            }
        } catch (error) {
            console.error('Error updating watchlist prices:', error);
        }
    }
    
    updateCurrentTime() {
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleString();
        }
    }

    // Missing method: updateWatchlistDisplay
    updateWatchlistDisplay(symbol, data) {
        // Update individual stock card in the watchlist display
        const stockCard = document.querySelector(`[data-ticker="${symbol}"]`);
        if (stockCard) {
            const priceEl = stockCard.querySelector('.current-price');
            const changeEl = stockCard.querySelector('.price-change');
            const volumeEl = stockCard.querySelector('.volume');
            
            if (priceEl) {
                priceEl.textContent = this.formatCurrency(data.current_price, data.currency);
            }
            
            if (changeEl) {
                const changeText = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.change_percent.toFixed(2)}%)`;
                changeEl.textContent = changeText;
                changeEl.className = `price-change ${data.change >= 0 ? 'positive' : 'negative'}`;
            }

            if (volumeEl) {
                volumeEl.textContent = this.formatNumber(data.volume);
            }
        }
    }

    // Missing method: selectPortfolio
    async selectPortfolio(portfolioId) {
        const portfolio = this.portfolios.get(portfolioId);
        if (portfolio) {
            this.activePortfolio = portfolio;
            await this.updatePortfolioSummary();
            await this.updatePortfolioDisplay();
            
            // Update portfolio selector
            const selector = document.getElementById('portfolioSelect');
            if (selector) {
                selector.value = portfolioId;
            }
            
            // Show delete button
            const deleteBtn = document.getElementById('deletePortfolioBtn');
            if (deleteBtn) {
                deleteBtn.style.display = 'block';
                deleteBtn.style.visibility = 'visible';
                deleteBtn.style.opacity = '1';
            }
            
            this.showStatus(`Portfolio "${portfolio.name}" selected`, 'success');
        }
    }

    // Format header metric cards for consistent display
    formatHeaderMetrics() {
        const metricValues = document.querySelectorAll('.header-metrics-row .uniform-card .metric-value');
        
        metricValues.forEach(element => {
            const text = element.textContent.trim();
            const length = text.length;
            
            // Remove any existing length attributes
            element.removeAttribute('data-length');
            
            // Set length-based attributes for CSS targeting
            if (length <= 6) {
                element.setAttribute('data-length', 'short');
            } else if (length > 12) {
                element.setAttribute('data-length', 'long');
            } else {
                element.setAttribute('data-length', 'medium');
            }
            
            // Format numbers for better display
            if (text.includes(',') || /^\d+\.?\d*$/.test(text.replace(/[,%$+-]/g, ''))) {
                element.style.letterSpacing = '-0.5px';
            }
        });
    }

    // Enhanced method to update header metrics with proper formatting
    updateHeaderMetric(elementId, value, change = null) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Format the value based on the metric type
        let formattedValue = value;
        
        if (elementId.includes('USD') || elementId.includes('INR')) {
            // Currency formatting
            formattedValue = typeof value === 'number' ? value.toFixed(2) : value;
        } else if (elementId.includes('Nifty') || elementId.includes('SPX')) {
            // Index formatting
            formattedValue = typeof value === 'number' ? value.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) : value;
        } else if (elementId.includes('regime')) {
            // Score formatting
            formattedValue = typeof value === 'number' ? `${value.toFixed(1)}/10` : value;
        }
        
        element.textContent = formattedValue;
        
        // Apply formatting after updating content
        setTimeout(() => this.formatHeaderMetrics(), 100);
    }

    // Currency conversion utilities
    getCurrentUSDINRRate() {
        // Try to get current rate from header display
        const usdInrEl = document.getElementById('idxUSDINR');
        if (usdInrEl && usdInrEl.textContent && usdInrEl.textContent !== 'Loading...') {
            const rateText = usdInrEl.textContent;
            const rate = parseFloat(rateText);
            if (rate && rate > 0) {
                return rate;
            }
        }
        // Fallback to approximate rate if not available
        return 83.0; // Approximate USD/INR rate as fallback
    }

    convertToINR(amountUSD) {
        const rate = this.getCurrentUSDINRRate();
        return amountUSD * rate;
    }

    // Detect if a stock symbol is Indian (INR) or US (USD)
    detectStockCurrency(symbol) {
        if (!symbol) return 'USD';
        
        const upperSymbol = symbol.toString().toUpperCase();
        
        // Indian stock exchanges and symbols
        const indianIndicators = [
            '.NS',          // NSE stocks (e.g., RELIANCE.NS)
            '.BO',          // BSE stocks (e.g., RELIANCE.BO)
            'NIFTY',        // NIFTY indices
            'BANKNIFTY',    // Bank NIFTY
            'SENSEX',       // SENSEX index
            'INR'           // Direct INR references
        ];
        
        // US/USD indicators
        const usdIndicators = [
            'SPX',          // S&P 500
            'NASDAQ',       // NASDAQ
            'DJI',          // Dow Jones
            'USD'           // Direct USD references
        ];
        
        // Check for Indian indicators first
        for (const indicator of indianIndicators) {
            if (upperSymbol.includes(indicator)) {
                return 'INR';
            }
        }
        
        // Check for US indicators
        for (const indicator of usdIndicators) {
            if (upperSymbol.includes(indicator)) {
                return 'USD';
            }
        }
        
        // Default logic: if symbol length <= 4 and no dots, likely US stock
        // If symbol has dots or is longer, likely Indian
        if (upperSymbol.includes('.') || upperSymbol.length > 4) {
            return 'INR';
        }
        
        return 'USD'; // Default to USD for ambiguous cases
    }

    // ========================================
    // CSV PORTFOLIO IMPORT FUNCTIONALITY
    // ========================================
    
    initializeCSVImport() {
        const csvFile = document.getElementById('csvFile');
        const previewBtn = document.getElementById('previewCsvBtn');
        const createBtn = document.getElementById('createCsvPortfolioBtn');
        
        if (csvFile) {
            csvFile.addEventListener('change', () => {
                const createBtn = document.getElementById('createCsvPortfolioBtn');
                if (createBtn) createBtn.disabled = true;
            });
        }
        
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.previewCSVPortfolio());
        }
        
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createCSVPortfolio());
        }
    }
    
    async previewCSVPortfolio() {
        const csvFile = document.getElementById('csvFile');
        const portfolioName = document.getElementById('csvPortfolioName').value.trim();
        const portfolioValue = parseFloat(document.getElementById('csvPortfolioValue').value);
        
        if (!csvFile.files[0]) {
            this.showError('Please select a CSV file');
            return;
        }
        
        if (!portfolioName || !portfolioValue || portfolioValue < 10000) {
            this.showError('Please provide portfolio name and minimum ₹10,000 value');
            return;
        }
        
        try {
            const csvData = await this.parseCSVFile(csvFile.files[0]);
            const processedData = await this.processCSVData(csvData, portfolioValue);
            this.displayCSVPreview(processedData, portfolioValue);
            
            const createBtn = document.getElementById('createCsvPortfolioBtn');
            if (createBtn) createBtn.disabled = false;
            
        } catch (error) {
            this.showError(`CSV processing failed: ${error.message}`);
        }
    }
    
    async parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csv = e.target.result;
                    const lines = csv.split('\n').filter(line => line.trim());
                    const data = [];
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const [ticker, weight] = line.split(',').map(s => s.trim());
                        if (ticker && weight) {
                            const numWeight = parseFloat(weight);
                            if (isNaN(numWeight) || numWeight <= 0) {
                                throw new Error(`Invalid weight "${weight}" for ${ticker} at line ${i + 1}`);
                            }
                            data.push({ ticker: ticker.toUpperCase(), weight: numWeight });
                        }
                    }
                    
                    if (data.length === 0) {
                        throw new Error('No valid data found in CSV');
                    }
                    
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read CSV file'));
            reader.readAsText(file);
        });
    }
    
    async processCSVData(csvData, totalValue) {
        // Calculate total weights
        const totalWeight = csvData.reduce((sum, item) => sum + item.weight, 0);
        
        // Normalize weights if total > 1
        const normalizedData = csvData.map(item => ({
            ...item,
            normalizedWeight: totalWeight > 1 ? item.weight / totalWeight : item.weight,
            allocatedValue: totalValue * (totalWeight > 1 ? item.weight / totalWeight : item.weight)
        }));
        
        // Format Indian tickers properly and fetch prices in parallel batches
        const processedData = await this.fetchStockPricesInBatches(normalizedData, totalValue);
        
        return {
            originalTotal: totalWeight,
            normalizedTotal: normalizedData.reduce((sum, item) => sum + item.normalizedWeight, 0),
            positions: processedData,
            totalAllocated: processedData.reduce((sum, item) => sum + item.actualValue, 0),
            validPositions: processedData.filter(item => item.valid).length
        };
    }
    
    formatIndianTicker(ticker) {
        // Convert Indian stock tickers to proper yfinance format
        const upperTicker = ticker.toUpperCase();
        
        // If ticker already has .NS or .BO, use as is
        if (upperTicker.includes('.NS') || upperTicker.includes('.BO')) {
            return upperTicker;
        }
        
        // For Indian stocks without exchange suffix, try .NS first (NSE is primary)
        // List of known BSE-only stocks that should use .BO
        const bseOnlyStocks = ['FORTIS', 'APOLLO']; // Add more as needed
        
        if (bseOnlyStocks.includes(upperTicker)) {
            return `${upperTicker}.BO`;
        }
        
        // Default to .NS for Indian stocks, but we'll try .BO as fallback
        return `${upperTicker}.NS`;
    }
    
    // Enhanced batch processing using backend batch API (optional optimization)
    async fetchStocksBatch(tickers) {
        try {
            const response = await fetch(`${this.stockAPI}/stocks/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tickers: tickers })
            });
            
            if (!response.ok) {
                throw new Error(`Batch API error: ${response.status}`);
            }
            
            const batchResult = await response.json();
            return batchResult.results.map(result => ({
                ticker: result.ticker,
                valid: result.status === 'success' && result.data && !result.data.error,
                data: result.data,
                error: result.error || (result.data && result.data.error)
            }));
            
        } catch (error) {
            console.log('Batch API not available, falling back to individual requests');
            return null; // Fallback to individual requests
        }
    }

    async fetchStockPricesInBatches(normalizedData, portfolioValue) {
        const BATCH_SIZE = 8; // Process 8 stocks simultaneously for faster processing
        const BATCH_DELAY = 300; // 300ms delay between batches to prevent rate limiting
        const RETRY_DELAY = 300; // 300ms between batches
        const processedData = [];
        
        // Try backend batch API first for better performance (for smaller datasets)
        if (normalizedData.length <= 20) {
            try {
                const tickers = normalizedData.map(item => item.ticker);
                const batchResults = await this.fetchStocksBatch(tickers);
                
                if (batchResults) {
                    // Map batch results back to normalized data structure
                    for (let i = 0; i < normalizedData.length; i++) {
                        const item = normalizedData[i];
                        const batchResult = batchResults.find(r => r.ticker === item.ticker);
                        
                        if (batchResult && batchResult.valid) {
                            const stockData = batchResult.data;
                            processedData.push({
                                ticker: item.ticker,
                                weight: item.weight,
                                normalizedWeight: item.normalizedWeight,
                                price: stockData.current_price,
                                quantity: Math.floor((item.normalizedWeight * portfolioValue) / stockData.current_price),
                                actualValue: Math.floor((item.normalizedWeight * portfolioValue) / stockData.current_price) * stockData.current_price,
                                valid: true
                            });
                        } else {
                            processedData.push({
                                ticker: item.ticker,
                                weight: item.weight,
                                normalizedWeight: item.normalizedWeight,
                                price: 0,
                                quantity: 0,
                                actualValue: 0,
                                valid: false,
                                error: batchResult ? batchResult.error : 'Unknown error'
                            });
                        }
                    }
                    
                    this.showStatus(`Batch API completed: ${processedData.filter(p => p.valid).length}/${normalizedData.length} stocks processed`, 'success');
                    return processedData;
                }
            } catch (error) {
                this.showStatus('Batch API unavailable, using individual processing...', 'info');
            }
        }
        
        // Fallback to individual batch processing for larger datasets or if batch API fails
        
        // Split into batches
        for (let i = 0; i < normalizedData.length; i += BATCH_SIZE) {
            const batch = normalizedData.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(normalizedData.length / BATCH_SIZE);
            
            this.showStatus(`Processing batch ${batchNum}/${totalBatches} (${batch.length} stocks)...`, 'info');
            
            // Process batch in parallel
            const batchPromises = batch.map(async (item) => {
                return await this.fetchStockWithFallback(item);
            });
            
            const batchResults = await Promise.all(batchPromises);
            processedData.push(...batchResults);
            
            // Count successful results in this batch
            const successInBatch = batchResults.filter(result => result && result.valid).length;
            const totalSuccess = processedData.filter(result => result && result.valid).length;
            
            this.showStatus(`Batch ${batchNum}/${totalBatches} complete: ${successInBatch}/${batch.length} success (Total: ${totalSuccess}/${i + batch.length})`, 'info');
            
            // Delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < normalizedData.length) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
        
        return processedData;
    }
    
    async fetchStockWithFallback(item) {
        const attempts = [
            item.ticker, // Original ticker (for US stocks)
            this.formatIndianTicker(item.ticker), // .NS format
            item.ticker.toUpperCase() + '.BO' // .BO format as fallback
        ];
        
        // Remove duplicates
        const uniqueAttempts = [...new Set(attempts)];
        
        for (const ticker of uniqueAttempts) {
            try {
                console.log(`🔍 Trying ticker: ${ticker}`);
                const stockData = await this.fetchStockData(ticker);
                
                if (stockData && !stockData.error && stockData.current_price > 0) {
                    let price = stockData.current_price;
                    const currency = this.detectStockCurrency(ticker);
                    
                    // Convert USD stocks to INR
                    if (currency === 'USD') {
                        price = this.convertToINR(price);
                    }
                    
                    const quantity = Math.floor(item.allocatedValue / price);
                    const actualValue = quantity * price;
                    
                    console.log(`✅ Success: ${ticker} at ₹${price.toFixed(2)}`);
                    
                    return {
                        ...item,
                        ticker: ticker, // Use the successful ticker format
                        price: price,
                        currency: currency,
                        quantity: quantity,
                        actualValue: actualValue,
                        valid: quantity > 0
                    };
                }
            } catch (error) {
                console.log(`❌ Failed: ${ticker} - ${error.message}`);
                continue; // Try next format
            }
        }
        
        // All attempts failed
        console.log(`💀 All attempts failed for: ${item.ticker}`);
        return {
            ...item,
            price: 0,
            quantity: 0,
            actualValue: 0,
            valid: false,
            error: `Unable to fetch data for ${item.ticker} (tried: ${uniqueAttempts.join(', ')})`
        };
    }
    
    displayCSVPreview(data, requestedValue) {
        const previewEl = document.getElementById('csvPreview');
        const contentEl = document.getElementById('csvPreviewContent');
        const summaryEl = document.getElementById('csvSummary');
        
        if (!previewEl || !contentEl || !summaryEl) return;
        
        // Show preview section
        previewEl.style.display = 'block';
        
        // Generate preview table
        let previewHTML = `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Weight</th>
                        <th>Normalized</th>
                        <th>Price (₹)</th>
                        <th>Quantity</th>
                        <th>Value (₹)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.positions.forEach(pos => {
            const statusClass = pos.valid ? 'positive' : 'negative';
            const statusText = pos.valid ? 'Valid' : (pos.error || 'Invalid');
            
            previewHTML += `
                <tr class="${pos.valid ? '' : 'invalid-row'}">
                    <td><strong>${pos.ticker}</strong></td>
                    <td>${(pos.weight * 100).toFixed(1)}%</td>
                    <td>${(pos.normalizedWeight * 100).toFixed(1)}%</td>
                    <td>₹${pos.price.toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                    <td>${pos.quantity.toLocaleString()}</td>
                    <td>₹${pos.actualValue.toLocaleString('en-IN', {maximumFractionDigits: 0})}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                </tr>
            `;
        });
        
        previewHTML += `</tbody></table>`;
        contentEl.innerHTML = previewHTML;
        
        // Generate summary
        const utilizationPercent = (data.totalAllocated / requestedValue * 100).toFixed(1);
        summaryEl.innerHTML = `
            <div class="csv-summary-stats">
                <div class="summary-stat">
                    <span class="stat-label">Valid Positions:</span>
                    <span class="stat-value">${data.validPositions} of ${data.positions.length}</span>
                </div>
                <div class="summary-stat">
                    <span class="stat-label">Total Allocated:</span>
                    <span class="stat-value">₹${data.totalAllocated.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                </div>
                <div class="summary-stat">
                    <span class="stat-label">Utilization:</span>
                    <span class="stat-value">${utilizationPercent}%</span>
                </div>
                ${data.originalTotal > 1 ? `
                    <div class="summary-note">
                        <i class="fas fa-info-circle"></i>
                        Weights normalized from ${(data.originalTotal * 100).toFixed(1)}% to 100%
                    </div>
                ` : ''}
            </div>
        `;
        
        this.csvPreviewData = data;
        // Calculate success rate
        const successRate = ((data.validPositions / data.positions.length) * 100).toFixed(1);
        this.showStatus(`CSV processed: ${data.validPositions}/${data.positions.length} positions (${successRate}% success rate)`, 'success');
    }
    
    async createCSVPortfolio() {
        if (!this.csvPreviewData) {
            this.showError('Please preview CSV data first');
            return;
        }
        
        const portfolioName = document.getElementById('csvPortfolioName').value.trim();
        const portfolioValue = parseFloat(document.getElementById('csvPortfolioValue').value);
        
        const createBtn = document.getElementById('createCsvPortfolioBtn');
        const originalText = createBtn.textContent;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Portfolio...';
        createBtn.disabled = true;
        
        try {
            // Create portfolio with the full portfolio value in INR
            // Don't subtract totalAllocated as that creates insufficient funds
            const portfolio = await this.createPortfolio({
                name: portfolioName,
                capital: portfolioValue, // Use full portfolio value
                currency: 'INR',
                description: `CSV imported portfolio with ${this.csvPreviewData.validPositions} positions`
            });
            
            this.showStatus('Portfolio created, adding positions...', 'info');
            
            // Add all valid positions using allocation values instead of fixed quantities
            let successCount = 0;
            const validPositions = this.csvPreviewData.positions.filter(pos => pos.valid);
            
            for (const position of validPositions) {
                try {
                    // Calculate target allocation value for this position
                    const targetValue = portfolioValue * position.normalizedWeight;
                    
                    // Let the backend determine quantity based on current market price
                    // by passing the target value instead of pre-calculated quantity
                    await this.buyStockByValue(
                        portfolio.id, 
                        position.ticker, 
                        targetValue
                    );
                    successCount++;
                    this.showStatus(`Added ${position.ticker}: ₹${targetValue.toLocaleString('en-IN')} allocation`, 'success');
                } catch (error) {
                    console.error(`Failed to add ${position.ticker}:`, error);
                    this.showError(`Failed to add ${position.ticker}: ${error.message}`);
                }
            }
            
            // Update UI
            await this.updatePortfolioSelector();
            
            // Auto-select the new portfolio
            const selector = document.getElementById('portfolioSelect');
            if (selector) {
                selector.value = portfolio.id;
                await this.selectPortfolio(portfolio.id);
            }
            
            // Clear form
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPortfolioName').value = '';
            document.getElementById('csvPortfolioValue').value = '';
            document.getElementById('csvPreview').style.display = 'none';
            
            this.showStatus(`Portfolio "${portfolioName}" created with ${successCount}/${validPositions.length} positions`, 'success');
            
        } catch (error) {
            console.error('CSV portfolio creation failed:', error);
            this.showError(`Failed to create portfolio: ${error.message}`);
        } finally {
            createBtn.textContent = originalText;
            createBtn.disabled = false;
        }
    }

    // ========================================
    // END CSV PORTFOLIO IMPORT FUNCTIONALITY
    // ========================================

    formatCurrency(amount, currency = 'USD', convertToINR = true, symbol = null) {
        // Auto-detect currency from symbol if provided
        if (symbol && !currency) {
            currency = this.detectStockCurrency(symbol);
        }
        
        // If currency is already INR, don't convert - just format
        if (currency === 'INR') {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2
            }).format(amount);
        }
        
        // For USD values in Indian system, convert USD to INR and display in INR
        if (currency === 'USD' && convertToINR) {
            const inrAmount = this.convertToINR(amount);
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 2
            }).format(inrAmount);
        }
        
        // For other currencies or when conversion is disabled
        const locale = currency === 'INR' ? 'en-IN' : 'en-US';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(amount);
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-IN').format(num);
    }

    validateTickerInput(ticker) {
        if (!ticker || typeof ticker !== 'string') {
            throw new Error('Please enter a valid stock ticker');
        }
        
        const cleanTicker = ticker.trim().toUpperCase();
        
        if (cleanTicker.length === 0) {
            throw new Error('Ticker cannot be empty');
        }
        
        if (cleanTicker.length > 20) {
            throw new Error('Ticker is too long (max 20 characters)');
        }
        
        if (!/^[A-Z0-9.-]+$/.test(cleanTicker)) {
            throw new Error('Ticker contains invalid characters');
        }
        
        return cleanTicker;
    }

    showError(message) {
        this.showStatus(message, 'error');
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.createElement('div');
        statusDiv.className = `status status--${type}`;
        statusDiv.textContent = message;
        statusDiv.setAttribute('role', 'status');
        statusDiv.setAttribute('aria-live', 'polite');
        statusDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
        `;
        
        switch(type) {
            case 'error':
                statusDiv.style.backgroundColor = '#dc3545';
                break;
            case 'success':
                statusDiv.style.backgroundColor = '#28a745';
                break;
            case 'info':
                statusDiv.style.backgroundColor = '#17a2b8';
                break;
            default:
                statusDiv.style.backgroundColor = '#6c757d';
        }
        
        document.body.appendChild(statusDiv);
        
        setTimeout(() => {
            if (document.body.contains(statusDiv)) {
                document.body.removeChild(statusDiv);
            }
        }, 5000);
    }

    async confirmDeletePortfolio() {
        const portfolioSelect = document.getElementById('portfolioSelect');
        if (!portfolioSelect || !portfolioSelect.value) {
            this.showError('No portfolio selected to delete');
            return;
        }

        const portfolioId = portfolioSelect.value;
        const portfolioName = portfolioSelect.options[portfolioSelect.selectedIndex].textContent;
        
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const originalText = confirmBtn.textContent;
        
        try {
            // Show loading state
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

            console.log('🗑️ Deleting portfolio:', portfolioId);
            
            const response = await window.fetch(`${this.stockAPI}/portfolios/${portfolioId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to delete portfolio: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Successfully deleted
                this.showStatus(`✅ Portfolio "${portfolioName}" deleted successfully`, 'success');
                
                // Reset UI state
                this.activePortfolioId = null;
                
                // Hide portfolio summary
                const summary = document.getElementById('portfolioSummary');
                if (summary) {
                    summary.style.display = 'none';
                }
                
                // Hide delete button
                const deleteBtn = document.getElementById('deletePortfolioBtn');
                if (deleteBtn) {
                    deleteBtn.style.display = 'none';
                }
                
                // Refresh portfolio list
                await this.loadPortfolios();
                
                // Close modal
                this.hideModal();
                
                console.log('✅ Portfolio deletion completed successfully');
                
            } else {
                throw new Error(result.error || 'Unknown error occurred');
            }
            
        } catch (error) {
            console.error('❌ Failed to delete portfolio:', error);
            this.showError(`Failed to delete portfolio: ${error.message}`);
            
        } finally {
            // Restore button state
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalText;
        }
    }

    async deletePortfolio(portfolioId) {
        try {
            const response = await window.fetch(`${this.stockAPI}/portfolios/${portfolioId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return result;
            
        } catch (error) {
            console.error('Delete portfolio API error:', error);
            throw error;
        }
    }

    hideModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    // Notify Enhanced Market Intelligence module so Market Analytics reflects live watchlist
    notifyMarketIntelligence(isPriceUpdate = false) {
        const mi = window.marketIntelligence;
        if (!mi) return;
        // Update symbol list used for POST body
        mi.watchlistSymbols = Array.from(this.watchlist);
        // Lightweight local refresh of analytics counts using liveStocks (no network)
        const lightweight = {
            watchlist_analytics: {
                stocks: Array.from(this.liveStocks.values()).map(s => ({
                    symbol: s.symbol,
                    change_percent: typeof s.change_percent === 'number' ? s.change_percent : (typeof s.change === 'number' && s.current_price ? (s.change / (s.current_price - s.change)) * 100 : 0)
                }))
            }
        };
        try { mi.updateMarketAnalytics(lightweight); } catch (_e) {}
        // Debounce full backend refresh (structural vs streaming updates)
        if (this._miRefreshTimer) clearTimeout(this._miRefreshTimer);
        const delay = isPriceUpdate ? 20000 : 1200; // 20s for price stream, 1.2s after add/remove
        this._miRefreshTimer = setTimeout(() => {
            try { mi.loadMarketData(); } catch (_e) {}
        }, delay);
    }
}

/* ==========================================================================
   ENHANCED HEADER FUNCTIONALITY
   ========================================================================== */

class EnhancedHeader {
    constructor() {
        this.initializeHeader();
        this.setupMarketSession();
        this.setupHeaderActions();
    }

    initializeHeader() {
        // Setup refresh functionality first
        this.setupRefreshButton();
        
        // Add price alerts toggle with delay to ensure all scripts are loaded
        setTimeout(() => {
            if (typeof createPriceAlertsButton === 'function') {
                try {
                    createPriceAlertsButton();
                    console.log('✅ Price alerts button initialized successfully');
                } catch (error) {
                    console.error('❌ Price alerts button initialization failed:', error);
                }
            } else {
                console.warn('⚠️ createPriceAlertsButton function not found. Retrying in 1 second...');
                setTimeout(() => {
                    if (typeof createPriceAlertsButton === 'function') {
                        createPriceAlertsButton();
                        console.log('✅ Price alerts button initialized successfully (retry)');
                    } else {
                        console.error('❌ Price alerts function still not available after retry');
                    }
                }, 1000);
            }
        }, 100);
    }

    setupMarketSession() {
        const sessionIndicator = document.getElementById('marketSession');
        if (!sessionIndicator) return;
        
        const now = new Date();
        const istTime = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(now);
        
        const hour = parseInt(istTime.split(':')[0]);
        
        if (hour >= 9 && hour < 15) {
            sessionIndicator.textContent = 'Market Open';
            sessionIndicator.style.background = 'rgba(16, 185, 129, 0.2)';
            sessionIndicator.style.color = '#10b981';
        } else if (hour >= 15 && hour < 16) {
            sessionIndicator.textContent = 'Market Closing';
            sessionIndicator.style.background = 'rgba(251, 191, 36, 0.2)';
            sessionIndicator.style.color = '#fbbf24';
        } else {
            sessionIndicator.textContent = 'Market Closed';
            sessionIndicator.style.background = 'rgba(239, 68, 68, 0.2)';
            sessionIndicator.style.color = '#ef4444';
        }
    }

    setupRefreshButton() {
        const refreshBtn = document.getElementById('refreshAllData');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.manualRefreshAll();
            });
        }
    }

    manualRefreshAll() {
        const refreshBtn = document.getElementById('refreshAllData');
        const autoRefreshStatus = document.getElementById('autoRefreshStatus');
        
        if (refreshBtn) {
            // Add spinning animation to refresh button
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.classList.add('fa-spin');
                setTimeout(() => icon.classList.remove('fa-spin'), 2000);
            }
        }
        
        // Update auto-refresh status
        if (autoRefreshStatus) {
            const statusSpan = autoRefreshStatus.querySelector('span');
            if (statusSpan) {
                statusSpan.textContent = 'Refreshing...';
                setTimeout(() => {
                    statusSpan.textContent = 'Auto: 3s';
                }, 2000);
            }
        }
        
        // Trigger the comprehensive data refresh (call the method from the trading platform instance)
        if (window.tradingPlatform && window.tradingPlatform.refreshAllData) {
            window.tradingPlatform.refreshAllData();
        }
        
        // Also update current time and last refresh
        this.updateLastRefreshTime();
    }
    
    updateLastRefreshTime() {
        const lastUpdateEl = document.getElementById('lastUpdateTime');
        if (lastUpdateEl) {
            const now = new Date();
            lastUpdateEl.textContent = `Updated: ${now.toLocaleTimeString()}`;
        }
    }

    setupHeaderActions() {
        // Ensure price alerts button is functional
        const priceAlertsBtn = document.getElementById('priceAlertsToggle');
        if (priceAlertsBtn) {
            // Remove any existing listeners to prevent duplicates
            priceAlertsBtn.replaceWith(priceAlertsBtn.cloneNode(true));
            const freshBtn = document.getElementById('priceAlertsToggle');
            
            freshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Check if panel already exists and is visible
                const existingPanel = document.getElementById('priceAlertsContainer');
                if (existingPanel) {
                    if (existingPanel.classList.contains('show')) {
                        // Hide if already showing
                        existingPanel.classList.remove('show');
                        return;
                    } else {
                        // Show if exists but hidden
                        existingPanel.classList.add('show');
                        return;
                    }
                }
                
                // Create new panel if it doesn't exist
                if (!window.priceAlertsManager) {
                    window.priceAlertsManager = new PriceAlertsManager();
                }
                window.priceAlertsManager.createAlertsUI();
                window.priceAlertsManager.showAlertsPanel();
            });
            
            console.log('✅ Price alerts button event listener attached');
        }
    }

}

// Update the DOMContentLoaded initialization
document.addEventListener('DOMContentLoaded', () => {
    window.tradingPlatform = new InstitutionalTradingPlatform();
    
    // Initialize Enhanced Header
    window.enhancedHeader = new EnhancedHeader();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InstitutionalTradingPlatform, EnhancedHeader };
}
