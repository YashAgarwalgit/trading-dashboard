// Portfolio enhancements for enhanced functionality
// This file provides additional features for the portfolio manager
console.log('📝 Portfolio-enhancements.js loading...');

// Initialize when DOM is ready and trading platform exists
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initializePortfolioEnhancements();
    }, 1000); // Wait for trading platform to initialize
});

function initializePortfolioEnhancements() {
    if (!window.tradingPlatform) {
        console.log('Trading platform not ready, retrying...');
        setTimeout(initializePortfolioEnhancements, 1000);
        return;
    }

    console.log('🚀 Initializing Enhanced Portfolio Features');

    // Add enhanced methods to the existing trading platform
    enhanceTradingPlatform();
    
    // Fix the quick buy price memory issue
    fixQuickBuyPriceMemory();
    
    // Add portfolio analytics
    addPortfolioAnalytics();
    
    console.log('✅ Enhanced Portfolio Features Initialized');
}

function enhanceTradingPlatform() {
    const platform = window.tradingPlatform;
    
    // FEATURE 1: Portfolio Analytics Calculator
    platform.calculatePortfolioAnalytics = function(positions) {
        let totalMarketValue = 0;
        let totalCost = 0;
        let bestPerformer = { symbol: '', pnlPercent: -Infinity };
        let worstPerformer = { symbol: '', pnlPercent: Infinity };
        let positionCount = Object.keys(positions).length;
        
        for (const [symbol, position] of Object.entries(positions)) {
            const marketValue = position.quantity * position.current_price;
            const pnl = marketValue - position.total_cost;
            const pnlPercent = (pnl / position.total_cost) * 100;
            
            totalMarketValue += marketValue;
            totalCost += position.total_cost;
            
            if (pnlPercent > bestPerformer.pnlPercent) {
                bestPerformer = { symbol, pnlPercent, pnl };
            }
            if (pnlPercent < worstPerformer.pnlPercent) {
                worstPerformer = { symbol, pnlPercent, pnl };
            }
        }
        
        const totalPnL = totalMarketValue - totalCost;
        const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
        const diversificationScore = this.calculateDiversificationScore(positions);
        
        return {
            totalMarketValue,
            totalCost,
            totalPnL,
            totalPnLPercent,
            bestPerformer,
            worstPerformer,
            positionCount,
            diversificationScore
        };
    };
    
    // FEATURE 2: Refresh Portfolio Analytics (called after buy/sell transactions)
    platform.refreshPortfolioAnalytics = async function() {
        if (!this.activePortfolio) return;
        
        console.log('🔄 Refreshing portfolio analytics after transaction...');
        
        try {
            // Get fresh portfolio data
            const positionsData = await this.getPortfolioPositions(this.activePortfolio.id);
            if (positionsData && positionsData.positions) {
                // Update analytics display
                this.updateAnalyticsDisplay(positionsData.positions);
                
                // Fetch and display transaction history
                await this.updateTransactionHistory();
                
                console.log('✅ Portfolio analytics refreshed successfully');
            }
        } catch (error) {
            console.error('❌ Error refreshing portfolio analytics:', error);
        }
    };
    
    // FEATURE 3: Update Analytics Display
    platform.updateAnalyticsDisplay = function(positions) {
        const analytics = this.calculatePortfolioAnalytics(positions);
        
        // Update analytics values in the DOM
        const elements = {
            totalReturn: document.getElementById('portfolioTotalReturn'),
            bestStock: document.getElementById('portfolioBestStock'),
            worstStock: document.getElementById('portfolioWorstStock'),
            diversification: document.getElementById('portfolioDiversification')
        };
        
        if (elements.totalReturn) {
            elements.totalReturn.textContent = `${analytics.totalPnLPercent.toFixed(2)}%`;
            elements.totalReturn.className = `analytics-value ${analytics.totalPnLPercent >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (elements.bestStock) {
            if (analytics.bestPerformer.symbol) {
                elements.bestStock.textContent = `${analytics.bestPerformer.symbol} (+${analytics.bestPerformer.pnlPercent.toFixed(1)}%)`;
                elements.bestStock.className = 'analytics-value positive';
            } else {
                elements.bestStock.textContent = 'No positions yet';
                elements.bestStock.className = 'analytics-value';
            }
        }
        
        if (elements.worstStock) {
            if (analytics.worstPerformer.symbol) {
                elements.worstStock.textContent = `${analytics.worstPerformer.symbol} (${analytics.worstPerformer.pnlPercent.toFixed(1)}%)`;
                elements.worstStock.className = 'analytics-value negative';
            } else {
                elements.worstStock.textContent = 'No positions yet';
                elements.worstStock.className = 'analytics-value';
            }
        }
        
        if (elements.diversification) {
            elements.diversification.textContent = `${analytics.diversificationScore}/10`;
        }
        
        // Show analytics section
        const analyticsSection = document.getElementById('portfolioAnalytics');
        if (analyticsSection) {
            analyticsSection.style.display = 'block';
        }
    };
    
    // FEATURE 4: Transaction History
    platform.updateTransactionHistory = async function() {
        try {
            const response = await fetch(`${this.stockAPI}/portfolios/${this.activePortfolio.id}/transactions`);
            const data = await response.json();
            
            if (response.ok && data.transactions && data.transactions.length > 0) {
                this.displayTransactionHistory(data.transactions);
            }
        } catch (error) {
            console.error('Error fetching transaction history:', error);
        }
    };
    
    // FEATURE 5: Display Transaction History
    platform.displayTransactionHistory = function(transactions) {
        let historyContainer = document.getElementById('transactionHistory');
        
        if (!historyContainer) {
            // Create transaction history container
            const portfolioTab = document.getElementById('portfolio-tab');
            if (portfolioTab) {
                const historyHTML = `
                    <div class="card" id="transactionHistoryCard">
                        <div class="card__header">
                            <h3><i class="fas fa-history"></i> Transaction History</h3>
                            <span class="badge">${transactions.length} transactions</span>
                        </div>
                        <div class="card__body">
                            <div id="transactionHistory" class="transaction-list"></div>
                        </div>
                    </div>
                `;
                portfolioTab.insertAdjacentHTML('beforeend', historyHTML);
                historyContainer = document.getElementById('transactionHistory');
            }
        }
        
        if (historyContainer) {
            // Transactions are already sorted by timestamp DESC from backend
            const historyHTML = transactions.slice(0, 15).map(transaction => `
                <div class="transaction-item ${transaction.transaction_type}">
                    <div class="transaction-main">
                        <div class="transaction-symbol">
                            <strong>${transaction.symbol}</strong>
                            <span class="transaction-type ${transaction.transaction_type}">${transaction.transaction_type.toUpperCase()}</span>
                        </div>
                        <div class="transaction-details">
                            <span class="quantity">${transaction.quantity} shares</span>
                            <span class="price">@ ₹${parseFloat(transaction.price).toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="transaction-meta">
                        <div class="transaction-value">₹${parseFloat(transaction.total_value).toFixed(2)}</div>
                        <div class="transaction-time">${new Date(transaction.timestamp).toLocaleDateString()}</div>
                    </div>
                </div>
            `).join('');
            
            historyContainer.innerHTML = historyHTML;
            
            // Update the badge count
            const badge = document.querySelector('#transactionHistoryCard .badge');
            if (badge) {
                badge.textContent = `${transactions.length} transactions`;
            }
        }
    };

    // FEATURE 2: Diversification Score Calculator
    platform.calculateDiversificationScore = function(positions) {
        const positionCount = Object.keys(positions).length;
        if (positionCount <= 1) return 'Poor';
        if (positionCount <= 3) return 'Fair';
        if (positionCount <= 7) return 'Good';
        if (positionCount <= 15) return 'Very Good';
        return 'Excellent';
    };

    // FEATURE 3: Portfolio View Switcher
    platform.switchPortfolioView = function(viewType) {
        // Remove active class from all tabs and views
        document.querySelectorAll('.portfolio-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.portfolio-view').forEach(view => view.classList.remove('active'));
        
        // Activate selected tab and view
        const tabBtn = document.querySelector(`[data-view="${viewType}"]`);
        const viewEl = document.getElementById(`${viewType}View`);
        
        if (tabBtn) tabBtn.classList.add('active');
        if (viewEl) viewEl.classList.add('active');
    };

    // FEATURE 4: Enhanced Portfolio Display
    const originalDisplayPortfolioPositions = platform.displayPortfolioPositions;
    platform.displayPortfolioPositions = async function(positions) {
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

        // Calculate analytics
        const analytics = this.calculatePortfolioAnalytics(positions);
        
        // Create enhanced tabular view
        let positionsHTML = `
            <div class="currency-notice" style="background: var(--color-success-light); padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 0.9em;">
                <i class="fas fa-info-circle"></i> 
                <strong>Portfolio Currency:</strong> All positions stored and displayed in INR. USD prices automatically converted at purchase time.
            </div>
            
            <div class="portfolio-tabs">
                <button class="portfolio-tab-btn active" data-view="table" onclick="tradingPlatform.switchPortfolioView('table')">
                    <i class="fas fa-table"></i> Table View
                </button>
                <button class="portfolio-tab-btn" data-view="cards" onclick="tradingPlatform.switchPortfolioView('cards')">
                    <i class="fas fa-th-large"></i> Card View
                </button>
                <button class="portfolio-tab-btn" data-view="analytics" onclick="tradingPlatform.switchPortfolioView('analytics')">
                    <i class="fas fa-chart-bar"></i> Analytics
                </button>
            </div>
            
            <div id="tableView" class="portfolio-view active">
                <div class="card">
                    <div class="card__header">
                        <h3><i class="fas fa-table"></i> Positions Table</h3>
                        <div class="table-controls">
                            <button class="btn btn--sm btn--outline" onclick="tradingPlatform.exportPositions()">
                                <i class="fas fa-download"></i> Export
                            </button>
                            <button class="btn btn--sm btn--primary" onclick="tradingPlatform.refreshPositions()">
                                <i class="fas fa-sync"></i> Refresh
                            </button>
                        </div>
                    </div>
                    <div class="card__body">
                        <div class="table-container">
                            <table class="positions-table">
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th class="text-right">Quantity</th>
                                        <th class="text-right">Avg Price (₹)</th>
                                        <th class="text-right">Current Price (₹)</th>
                                        <th class="text-right">Market Value (₹)</th>
                                        <th class="text-right">P&L (₹)</th>
                                        <th class="text-right">P&L %</th>
                                        <th class="text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;
        
        // Sort positions by market value
        const sortedPositions = Object.entries(positions).sort((a, b) => {
            const valueA = a[1].quantity * a[1].current_price;
            const valueB = b[1].quantity * b[1].current_price;
            return valueB - valueA;
        });
        
        for (const [symbol, position] of sortedPositions) {
            const currentValue = position.quantity * position.current_price;
            const pnl = currentValue - position.total_cost;
            const pnlPercent = (pnl / position.total_cost) * 100;
            
            positionsHTML += `
                <tr class="position-row" data-symbol="${symbol}">
                    <td>
                        <div class="symbol-cell">
                            <strong>${symbol}</strong>
                        </div>
                    </td>
                    <td class="text-right">${position.quantity.toLocaleString()}</td>
                    <td class="text-right">${this.formatCurrency(position.avg_price, 'INR', false)}</td>
                    <td class="text-right">
                        <span class="live-price" data-symbol="${symbol}">
                            ${this.formatCurrency(position.current_price, 'INR', false)}
                        </span>
                    </td>
                    <td class="text-right">
                        <strong>${this.formatCurrency(currentValue, 'INR', false)}</strong>
                    </td>
                    <td class="text-right">
                        <span class="${pnl >= 0 ? 'positive' : 'negative'}">
                            ${this.formatCurrency(pnl, 'INR', false)}
                        </span>
                    </td>
                    <td class="text-right">
                        <span class="${pnl >= 0 ? 'positive' : 'negative'}">
                            ${pnlPercent.toFixed(2)}%
                        </span>
                    </td>
                    <td class="text-center">
                        <div class="action-buttons">
                            <button class="btn btn--xs btn--outline" onclick="tradingPlatform.showBuyModal('${symbol}')" title="Buy More">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="btn btn--xs btn--outline" onclick="tradingPlatform.showSellModal('${symbol}', ${position.quantity})" title="Sell">
                                <i class="fas fa-minus"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
        
        positionsHTML += `
                                </tbody>
                                <tfoot>
                                    <tr class="totals-row">
                                        <td><strong>TOTAL</strong></td>
                                        <td class="text-right"><strong>${Object.values(positions).reduce((sum, p) => sum + p.quantity, 0).toLocaleString()}</strong></td>
                                        <td></td>
                                        <td></td>
                                        <td class="text-right"><strong>${this.formatCurrency(analytics.totalMarketValue, 'INR', false)}</strong></td>
                                        <td class="text-right">
                                            <strong class="${analytics.totalPnL >= 0 ? 'positive' : 'negative'}">
                                                ${this.formatCurrency(analytics.totalPnL, 'INR', false)}
                                            </strong>
                                        </td>
                                        <td class="text-right">
                                            <strong class="${analytics.totalPnLPercent >= 0 ? 'positive' : 'negative'}">
                                                ${analytics.totalPnLPercent.toFixed(2)}%
                                            </strong>
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="cardsView" class="portfolio-view">
                <div class="positions-grid">`;
        
        // Card view
        for (const [symbol, position] of sortedPositions) {
            const currentValue = position.quantity * position.current_price;
            const pnl = currentValue - position.total_cost;
            const pnlPercent = (pnl / position.total_cost) * 100;
            
            positionsHTML += `
                <div class="position-card enhanced" data-symbol="${symbol}">
                    <div class="position-header">
                        <div class="symbol-info">
                            <h4>${symbol}</h4>
                        </div>
                        <div class="position-weight">
                            ${((currentValue / analytics.totalMarketValue) * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div class="position-metrics">
                        <div class="metric-row">
                            <span>Quantity:</span>
                            <span><strong>${position.quantity.toLocaleString()}</strong> shares</span>
                        </div>
                        <div class="metric-row">
                            <span>Avg Price:</span>
                            <span>${this.formatCurrency(position.avg_price, 'INR', false)}</span>
                        </div>
                        <div class="metric-row">
                            <span>Current Price:</span>
                            <span class="live-price" data-symbol="${symbol}">
                                ${this.formatCurrency(position.current_price, 'INR', false)}
                            </span>
                        </div>
                        <div class="metric-row">
                            <span>Market Value:</span>
                            <span><strong>${this.formatCurrency(currentValue, 'INR', false)}</strong></span>
                        </div>
                        <div class="metric-row">
                            <span>P&L:</span>
                            <span class="${pnl >= 0 ? 'positive' : 'negative'}">
                                <strong>${this.formatCurrency(pnl, 'INR', false)} (${pnlPercent.toFixed(2)}%)</strong>
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
                </div>`;
        }
        
        positionsHTML += `
                </div>
            </div>
            
            <div id="analyticsView" class="portfolio-view">
                <div class="analytics-dashboard">
                    <div class="analytics-header">
                        <h3><i class="fas fa-chart-bar"></i> Portfolio Analytics</h3>
                    </div>
                    
                    <div class="analytics-grid">
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="analytics-content">
                                <h4>Best Performer</h4>
                                <div class="analytics-value positive">
                                    ${analytics.bestPerformer.symbol}
                                </div>
                                <div class="analytics-change positive">
                                    +${analytics.bestPerformer.pnlPercent.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                        
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-chart-line-down"></i>
                            </div>
                            <div class="analytics-content">
                                <h4>Worst Performer</h4>
                                <div class="analytics-value negative">
                                    ${analytics.worstPerformer.symbol}
                                </div>
                                <div class="analytics-change negative">
                                    ${analytics.worstPerformer.pnlPercent.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                        
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-balance-scale"></i>
                            </div>
                            <div class="analytics-content">
                                <h4>Diversification</h4>
                                <div class="analytics-value">
                                    ${analytics.diversificationScore}
                                </div>
                                <div class="analytics-change">
                                    ${analytics.positionCount} positions
                                </div>
                            </div>
                        </div>
                        
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-percentage"></i>
                            </div>
                            <div class="analytics-content">
                                <h4>Total Return</h4>
                                <div class="analytics-value ${analytics.totalPnLPercent >= 0 ? 'positive' : 'negative'}">
                                    ${analytics.totalPnLPercent.toFixed(2)}%
                                </div>
                                <div class="analytics-change ${analytics.totalPnL >= 0 ? 'positive' : 'negative'}">
                                    ${this.formatCurrency(analytics.totalPnL, 'INR', false)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        positionsContainer.innerHTML = positionsHTML;
        
        // Update analytics in sidebar
        this.updatePortfolioAnalyticsDisplay(analytics);
    };

    // FEATURE 5: Export Positions
    platform.exportPositions = function() {
        if (!this.activePortfolio) {
            this.showError('No active portfolio to export');
            return;
        }
        
        this.getPortfolioPositions(this.activePortfolio.id).then(data => {
            if (!data || !data.positions) return;
            
            const positions = data.positions;
            let csvContent = 'Symbol,Quantity,Avg Price,Current Price,Market Value,P&L,P&L %\n';
            
            for (const [symbol, position] of Object.entries(positions)) {
                const marketValue = position.quantity * position.current_price;
                const pnl = marketValue - position.total_cost;
                const pnlPercent = (pnl / position.total_cost) * 100;
                
                csvContent += `${symbol},${position.quantity},${position.avg_price},${position.current_price},${marketValue},${pnl},${pnlPercent.toFixed(2)}\n`;
            }
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.activePortfolio.name}_positions_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            this.showStatus('Positions exported successfully', 'success');
        });
    };

    // FEATURE 6: Refresh Positions
    platform.refreshPositions = async function() {
        if (!this.activePortfolio) return;
        
        const refreshBtn = document.querySelector('.table-controls .btn--primary');
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            refreshBtn.disabled = true;
        }
        
        try {
            await this.updatePortfolioDisplay();
            this.showStatus('Positions refreshed with live data', 'success');
        } catch (error) {
            this.showError('Failed to refresh positions');
        } finally {
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
                refreshBtn.disabled = false;
            }
        }
    };

    // FEATURE 7: Update Portfolio Analytics Display
    platform.updatePortfolioAnalyticsDisplay = function(analytics) {
        const analyticsEl = document.getElementById('portfolioAnalytics');
        if (analyticsEl && analytics) {
            analyticsEl.style.display = 'block';
            
            const totalReturnEl = document.getElementById('portfolioTotalReturn');
            const bestStockEl = document.getElementById('portfolioBestStock');
            const worstStockEl = document.getElementById('portfolioWorstStock');
            const diversificationEl = document.getElementById('portfolioDiversification');
            
            if (totalReturnEl) {
                totalReturnEl.textContent = `${analytics.totalPnLPercent.toFixed(2)}%`;
                totalReturnEl.className = `analytics-value ${analytics.totalPnLPercent >= 0 ? 'positive' : 'negative'}`;
            }
            if (bestStockEl) {
                bestStockEl.textContent = `${analytics.bestPerformer.symbol} (+${analytics.bestPerformer.pnlPercent.toFixed(2)}%)`;
            }
            if (worstStockEl) {
                worstStockEl.textContent = `${analytics.worstPerformer.symbol} (${analytics.worstPerformer.pnlPercent.toFixed(2)}%)`;
            }
            if (diversificationEl) {
                diversificationEl.textContent = `${analytics.diversificationScore} (${analytics.positionCount} positions)`;
            }
        }
    };
}

function fixQuickBuyPriceMemory() {
    const platform = window.tradingPlatform;
    
    // Override the showBuyModal method to fix price memory issue
    const originalShowBuyModal = platform.showBuyModal;
    platform.showBuyModal = function(symbol = '') {
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
            totalCostEl.textContent = '$0.00';
            
            // Auto-fetch current price if symbol provided
            if (symbol) {
                this.fetchStockData(symbol).then(data => {
                    if (data && !data.error) {
                        priceInput.value = data.current_price.toFixed(2);
                        priceInput.placeholder = `Current: ${this.formatCurrency(data.current_price)}`;
                    }
                }).catch(e => {
                    priceInput.placeholder = 'Enter price manually';
                });
            }
            
            modal.classList.remove('hidden');
        }
    };
}

function addPortfolioAnalytics() {
    // Add analytics section to the HTML if it doesn't exist
    const portfolioTab = document.getElementById('portfolio-tab');
    if (portfolioTab) {
        const analyticsSection = document.getElementById('portfolioAnalytics');
        if (!analyticsSection) {
            const analyticsHTML = `
                <div class="card" id="portfolioAnalytics" style="display: none;">
                    <div class="card__header">
                        <h3><i class="fas fa-chart-bar"></i> Portfolio Analytics</h3>
                        <button class="btn btn--outline btn--sm" onclick="tradingPlatform.updatePortfolioDisplay()">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                    </div>
                    <div class="card__body">
                        <div class="analytics-grid">
                            <div class="analytics-item">
                                <span class="analytics-label">Total Return:</span>
                                <span class="analytics-value" id="portfolioTotalReturn">0.00%</span>
                            </div>
                            <div class="analytics-item">
                                <span class="analytics-label">Best Performer:</span>
                                <span class="analytics-value" id="portfolioBestStock">-</span>
                            </div>
                            <div class="analytics-item">
                                <span class="analytics-label">Worst Performer:</span>
                                <span class="analytics-value" id="portfolioWorstStock">-</span>
                            </div>
                            <div class="analytics-item">
                                <span class="analytics-label">Diversification:</span>
                                <span class="analytics-value" id="portfolioDiversification">-</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const portfolioPositions = document.getElementById('portfolioPositions');
            if (portfolioPositions) {
                portfolioPositions.insertAdjacentHTML('afterend', analyticsHTML);
            }
        }
    }
}

// Make functions globally available
window.switchPortfolioView = function(viewType) {
    if (window.tradingPlatform && window.tradingPlatform.switchPortfolioView) {
        window.tradingPlatform.switchPortfolioView(viewType);
    }
};

window.exportPositions = function() {
    if (window.tradingPlatform && window.tradingPlatform.exportPositions) {
        window.tradingPlatform.exportPositions();
    }
};

window.refreshPositions = function() {
    if (window.tradingPlatform && window.tradingPlatform.refreshPositions) {
        window.tradingPlatform.refreshPositions();
    }
};

    // FEATURE 11: Delete Portfolio
    if (window.tradingPlatform) {
        window.tradingPlatform.deletePortfolio = async function(portfolioId) {
            if (!portfolioId) {
                this.showError('No portfolio ID provided');
                return;
            }

        const portfolio = this.portfolios.get(portfolioId);
        if (!portfolio) {
            this.showError('Portfolio not found');
            return;
        }

        try {
            const response = await fetch(`${this.stockAPI}/portfolios/${portfolioId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Remove from local storage
                this.portfolios.delete(portfolioId);
                
                // Clear active portfolio if it was the deleted one
                if (this.activePortfolio && this.activePortfolio.id === portfolioId) {
                    this.activePortfolio = null;
                }
                
                // Update UI
                this.updatePortfolioSelector();
                this.updatePortfolioSummary();
                this.updatePortfolioDisplay();
                
                this.showStatus(`Portfolio "${portfolio.name}" deleted successfully`, 'success');
                
                // Switch to dashboard tab if no portfolios left
                if (this.portfolios.size === 0) {
                    this.switchTab('dashboard');
                }
                
            } else {
                throw new Error(result.error || 'Failed to delete portfolio');
            }

        } catch (error) {
            console.error('Portfolio deletion failed:', error);
            this.showError(`Failed to delete portfolio: ${error.message}`);
        }
    };

    // FEATURE 12: Show Delete Confirmation Modal
    platform.showDeletePortfolioModal = function(portfolioId) {
        const portfolio = this.portfolios.get(portfolioId);
        if (!portfolio) {
            this.showError('Portfolio not found');
            return;
        }

        // Create delete confirmation modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'deletePortfolioModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-exclamation-triangle" style="color: var(--color-danger);"></i> Delete Portfolio</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="delete-warning">
                        <p><strong>Are you sure you want to delete the portfolio "${portfolio.name}"?</strong></p>
                        <p>This action will permanently delete:</p>
                        <ul>
                            <li>All positions and holdings</li>
                            <li>Complete transaction history</li>
                            <li>All portfolio analytics data</li>
                            <li>Portfolio configuration and settings</li>
                        </ul>
                        <div class="warning-box">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>This action cannot be undone!</strong>
                        </div>
                    </div>
                    <div class="confirmation-input">
                        <label for="confirmPortfolioName">Type the portfolio name to confirm:</label>
                        <input type="text" id="confirmPortfolioName" class="form-control" placeholder="${portfolio.name}">
                        <small class="form-help">This helps prevent accidental deletions</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn--outline modal-close">Cancel</button>
                    <button type="button" class="btn btn--danger" id="confirmDeleteBtn" disabled>
                        <i class="fas fa-trash"></i> Delete Portfolio
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.remove('hidden');

        // Handle confirmation input
        const confirmInput = modal.querySelector('#confirmPortfolioName');
        const confirmBtn = modal.querySelector('#confirmDeleteBtn');
        
        confirmInput.addEventListener('input', (e) => {
            const isMatch = e.target.value.trim() === portfolio.name;
            confirmBtn.disabled = !isMatch;
            confirmBtn.className = isMatch ? 'btn btn--danger' : 'btn btn--danger disabled';
        });

        // Handle delete confirmation
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            confirmBtn.disabled = true;
            
            try {
                await this.deletePortfolio(portfolioId);
                document.body.removeChild(modal);
            } catch (error) {
                confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Portfolio';
                confirmBtn.disabled = false;
            }
        });

        // Handle modal close
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    };
    } // Close the if (window.tradingPlatform) check
