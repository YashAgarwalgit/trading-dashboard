// Enhancement 3: Real-time Price Alerts System - Header Popup Only
class PriceAlertsManager {
    constructor() {
        this.alerts = new Map(); // symbol -> [{id, type, value, triggered, created}]
        this.alertSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmEcBjiRxvPE'); // Beep sound
        this.init();
    }

    init() {
        // Only setup event listeners and load data, don't create UI automatically
        this.loadStoredAlerts();
        this.setupEventListeners();
    }

    createAlertsUI() {
        // Only create UI when explicitly called via header button
        if (document.getElementById('priceAlertsPopup')) {
            return; // Already exists
        }

        // Create floating alerts popup
        const alertsContainer = document.createElement('div');
        alertsContainer.id = 'priceAlertsPopup';
        alertsContainer.className = 'price-alerts-popup hidden';
        alertsContainer.innerHTML = `
            <div class="alerts-popup-content">
                <div class="alerts-header">
                    <h4><i class="fas fa-bell"></i> Price Alerts</h4>
                    <div class="alerts-controls">
                        <button class="btn btn--sm btn--outline" id="addAlertBtn">
                            <i class="fas fa-plus"></i> Add Alert
                        </button>
                        <button class="btn btn--sm btn--secondary" id="closeAlertsPopup">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="alerts-list" id="alertsList">
                    <div class="empty-alerts">No alerts set</div>
                </div>
            </div>
        `;

        // Add to body as floating popup
        document.body.appendChild(alertsContainer);
        
        // Create modal for adding alerts
        this.createAddAlertModal();
        
        // Setup event listeners for the newly created UI
        this.setupUIEventListeners();
        
        // Load and render existing alerts
        this.renderAlerts();
        this.updateAlertCount();
    }

    createAddAlertModal() {
        if (document.getElementById('addAlertModal')) {
            return; // Already exists
        }

        const modal = document.createElement('div');
        modal.className = 'modal hidden';
        modal.id = 'addAlertModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Add Price Alert</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="addAlertForm">
                        <div class="form-group">
                            <label for="alertSymbol">Stock Symbol:</label>
                            <input type="text" id="alertSymbol" class="form-control" placeholder="e.g., AAPL" required>
                        </div>
                        <div class="form-group">
                            <label for="alertType">Alert Type:</label>
                            <select id="alertType" class="form-control" required>
                                <option value="above">Price Above</option>
                                <option value="below">Price Below</option>
                                <option value="change_up">% Change Above</option>
                                <option value="change_down">% Change Below</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="alertValue">Target Value:</label>
                            <input type="number" id="alertValue" class="form-control" step="0.01" placeholder="Enter value" required>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="alertSound" checked> Play sound when triggered
                            </label>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn--primary">Create Alert</button>
                            <button type="button" class="btn btn--outline modal-close">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    setupEventListeners() {
        // Only setup listeners for price updates and core functionality
        // UI event listeners are setup separately when UI is created
        
        // Listen for price updates
        if (window.tradingPlatform) {
            const originalUpdatePrice = window.tradingPlatform.updateRealTimePrice;
            window.tradingPlatform.updateRealTimePrice = (stockData) => {
                originalUpdatePrice.call(window.tradingPlatform, stockData);
                this.checkAlerts(stockData);
            };
        }
    }

    setupUIEventListeners() {
        // Setup event listeners for UI elements (called only when UI is created)
        document.getElementById('addAlertBtn')?.addEventListener('click', () => {
            this.showAddAlertModal();
        });

        document.getElementById('closeAlertsPopup')?.addEventListener('click', () => {
            this.hideAlertsPopup();
        });

        document.getElementById('addAlertForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAlert();
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.hideModals());
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('priceAlertsPopup');
            const toggleBtn = document.getElementById('alertsToggleBtn');
            if (popup && !popup.contains(e.target) && e.target !== toggleBtn && !toggleBtn?.contains(e.target)) {
                this.hideAlertsPopup();
            }
        });
    }

    showAddAlertModal() {
        document.getElementById('addAlertModal').classList.remove('hidden');
    }

    hideModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    createAlert() {
        const symbol = document.getElementById('alertSymbol').value.trim().toUpperCase();
        const type = document.getElementById('alertType').value;
        const value = parseFloat(document.getElementById('alertValue').value);
        const playSound = document.getElementById('alertSound').checked;

        if (!symbol || !type || !value) return;

        const alert = {
            id: Date.now(),
            symbol,
            type,
            value,
            playSound,
            triggered: false,
            created: new Date().toISOString()
        };

        if (!this.alerts.has(symbol)) {
            this.alerts.set(symbol, []);
        }
        this.alerts.get(symbol).push(alert);
        
        this.saveAlerts();
        this.renderAlerts();
        this.updateAlertCount();
        this.hideModals();
        
        if (window.tradingPlatform) {
            window.tradingPlatform.showStatus(`Alert created for ${symbol}`, 'success');
        }
    }

    toggleAlertsPopup() {
        const popup = document.getElementById('priceAlertsPopup');
        if (popup) {
            popup.classList.toggle('hidden');
        }
    }

    showAlertsPopup() {
        document.getElementById('priceAlertsPopup')?.classList.remove('hidden');
    }

    hideAlertsPopup() {
        document.getElementById('priceAlertsPopup')?.classList.add('hidden');
    }

    updateAlertCount() {
        const totalAlerts = Array.from(this.alerts.values()).reduce((sum, alerts) => 
            sum + alerts.filter(a => !a.triggered).length, 0);
        
        const countBadge = document.getElementById('alertCount');
        if (countBadge) {
            countBadge.textContent = totalAlerts;
            countBadge.style.display = totalAlerts > 0 ? 'inline' : 'none';
        }
    }

    checkAlerts(stockData) {
        const alerts = this.alerts.get(stockData.symbol);
        if (!alerts) return;

        alerts.forEach(alert => {
            if (alert.triggered) return;

            let shouldTrigger = false;
            switch (alert.type) {
                case 'above':
                    shouldTrigger = stockData.current_price >= alert.value;
                    break;
                case 'below':
                    shouldTrigger = stockData.current_price <= alert.value;
                    break;
                case 'change_up':
                    shouldTrigger = stockData.change_percent >= alert.value;
                    break;
                case 'change_down':
                    shouldTrigger = stockData.change_percent <= alert.value;
                    break;
            }

            if (shouldTrigger) {
                this.triggerAlert(alert, stockData);
            }
        });
    }

    triggerAlert(alert, stockData) {
        alert.triggered = true;
        alert.triggeredAt = new Date().toISOString();
        
        // Play sound if enabled
        if (alert.playSound) {
            this.alertSound.play().catch(() => {});
        }

        // Show notification
        this.showAlertNotification(alert, stockData);
        
        // Update UI
        this.renderAlerts();
        this.saveAlerts();
    }

    showAlertNotification(alert, stockData) {
        const typeText = {
            above: `above $${alert.value}`,
            below: `below $${alert.value}`,
            change_up: `up ${alert.value}%+`,
            change_down: `down ${alert.value}%+`
        }[alert.type];

        const message = `🔔 ${alert.symbol} is ${typeText} (Current: $${stockData.current_price.toFixed(2)})`;
        
        if (window.tradingPlatform) {
            window.tradingPlatform.showStatus(message, 'info');
        }

        // Browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification('Price Alert Triggered', {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    renderAlerts() {
        const container = document.getElementById('alertsList');
        if (!container) return;

        const allAlerts = [];
        for (const [symbol, symbolAlerts] of this.alerts.entries()) {
            allAlerts.push(...symbolAlerts.map(a => ({...a, symbol})));
        }

        if (allAlerts.length === 0) {
            container.innerHTML = '<div class="empty-alerts">No alerts set</div>';
            return;
        }

        allAlerts.sort((a, b) => new Date(b.created) - new Date(a.created));
        
        container.innerHTML = allAlerts.map(alert => `
            <div class="alert-item ${alert.triggered ? 'triggered' : 'active'}">
                <div class="alert-info">
                    <strong>${alert.symbol}</strong>
                    <span class="alert-condition">
                        ${this.formatAlertCondition(alert)}
                    </span>
                    ${alert.triggered ? 
                        `<span class="alert-status triggered">✓ Triggered</span>` :
                        `<span class="alert-status active">● Active</span>`
                    }
                </div>
                <div class="alert-actions">
                    ${!alert.triggered ? 
                        `<button class="btn btn--sm btn--outline" onclick="priceAlerts.removeAlert('${alert.symbol}', ${alert.id})">
                            <i class="fas fa-trash"></i>
                        </button>` : ''
                    }
                </div>
            </div>
        `).join('');
    }

    formatAlertCondition(alert) {
        const typeText = {
            above: `≥ $${alert.value}`,
            below: `≤ $${alert.value}`,
            change_up: `≥ +${alert.value}%`,
            change_down: `≤ ${alert.value}%`
        };
        return typeText[alert.type] || alert.type;
    }

    removeAlert(symbol, alertId) {
        const alerts = this.alerts.get(symbol);
        if (alerts) {
            const index = alerts.findIndex(a => a.id === alertId);
            if (index >= 0) {
                alerts.splice(index, 1);
                if (alerts.length === 0) {
                    this.alerts.delete(symbol);
                }
                this.saveAlerts();
                this.renderAlerts();
                this.updateAlertCount();
            }
        }
    }

    saveAlerts() {
        const alertsData = {};
        for (const [symbol, alerts] of this.alerts.entries()) {
            alertsData[symbol] = alerts;
        }
        localStorage.setItem('priceAlerts', JSON.stringify(alertsData));
    }

    loadStoredAlerts() {
        try {
            const stored = localStorage.getItem('priceAlerts');
            if (stored) {
                const alertsData = JSON.parse(stored);
                for (const [symbol, alerts] of Object.entries(alertsData)) {
                    this.alerts.set(symbol, alerts);
                }
                this.renderAlerts();
                this.updateAlertCount();
            }
        } catch (e) {
            console.error('Failed to load stored alerts:', e);
        }
    }

    // Request notification permission
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

// Function to create price alerts toggle button in header (call manually when needed)
function createPriceAlertsToggle() {
    // Only create the header button when called explicitly
    if (document.getElementById('alertsToggleBtn')) {
        return; // Already exists
    }

    // Add alerts button to the main header system status section
    const headerSystemStatus = document.querySelector('.header-system-status');
    if (headerSystemStatus) {
        const alertsButton = document.createElement('button');
        alertsButton.id = 'alertsToggleBtn';
        alertsButton.className = 'btn btn--sm btn--outline alerts-toggle-btn';
        alertsButton.innerHTML = '<i class="fas fa-bell"></i> <span class="alert-count" id="alertCount">0</span>';
        alertsButton.style.marginLeft = '1rem';
        alertsButton.addEventListener('click', () => {
            // Initialize price alerts system on first click
            if (!window.priceAlerts) {
                window.priceAlerts = new PriceAlertsManager();
                window.priceAlerts.requestNotificationPermission();
            }
            // Create UI if it doesn't exist
            window.priceAlerts.createAlertsUI();
            // Toggle the popup
            window.priceAlerts.toggleAlertsPopup();
        });
        headerSystemStatus.appendChild(alertsButton);
    }
}

// Export the function to global scope
window.createPriceAlertsToggle = createPriceAlertsToggle;

// NOTE: Auto-initialization removed - price alerts are now only accessible via header popup
// To enable price alerts, call: window.createPriceAlertsToggle()
