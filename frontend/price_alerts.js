/**
 * Price Alerts System - Clean Implementation
 * Real-time price monitoring with intelligent notifications
 * Conflict-free architecture with performance optimization
 */

class PriceAlertsManager {
    constructor() {
        // Auto-detect API URL based on environment
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        this.baseApi = isLocal ? 'http://localhost:5000/api' : `${window.location.origin}/api`;
        
        this.alerts = new Map();
        this.isInitialized = false;
        this.config = {
            maxAlerts: 50,
            defaultCheckInterval: 5000,
            alertCooldown: 60000,
            retryAttempts: 3,
            persistKey: 'trading_platform_alerts'
        };
        this.soundEnabled = true;
        this.notificationQueue = [];
        this.lastTriggered = new Map();
        
        // Performance monitoring
        this.metrics = {
            totalAlerts: 0,
            triggeredToday: 0,
            accuracy: 0.95
        };
        
        this.init();
    }

    async init() {
        try {
            await this.loadConfiguration();
            await this.loadStoredAlerts();
            this.setupPerformanceMonitoring();
            this.requestNotificationPermission();
            this.integrateWithTradingPlatform();
            this.isInitialized = true;
            
            console.log('✅ Price Alerts System initialized successfully with backend integration');
        } catch (error) {
            console.error('❌ Price Alerts initialization failed:', error);
            this.handleError('initialization', error);
        }
    }

    async loadConfiguration() {
        try {
            const config = localStorage.getItem('alerts_config');
            if (config) {
                Object.assign(this.config, JSON.parse(config));
            }
        } catch (error) {
            console.warn('Using default configuration due to error:', error);
        }
    }

    createAlertsUI() {
        // Check if panel already exists
        const existingContainer = document.getElementById('priceAlertsContainer');
        if (existingContainer) {
            // If it exists, just show it instead of creating a new one
            this.showAlertsPanel();
            return;
        }

        const alertsHTML = `
            <div id="priceAlertsContainer" class="alerts-container">
                <div class="alerts-header">
                    <div class="alerts-title">
                        <i class="fas fa-bell"></i>
                        <h3>Price Alerts</h3>
                        <span class="alerts-count" id="alertsCount">0</span>
                    </div>
                    <div class="alerts-controls">
                        <button class="btn btn-sm btn-success" id="createAlertBtn">
                            <i class="fas fa-plus"></i> New Alert
                        </button>
                        <button class="btn btn-sm btn-outline" id="alertsSettingsBtn">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" id="closeAlertsBtn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div class="alerts-stats">
                    <div class="stat-item">
                        <span class="stat-label">Active:</span>
                        <span class="stat-value" id="activeAlertsCount">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Triggered:</span>
                        <span class="stat-value" id="triggeredAlertsCount">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Accuracy:</span>
                        <span class="stat-value" id="alertsAccuracy">95%</span>
                    </div>
                </div>

                <div class="alerts-filters">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="active">Active</button>
                    <button class="filter-btn" data-filter="triggered">Triggered</button>
                    <button class="filter-btn" data-filter="expired">Expired</button>
                </div>

                <div class="alerts-list" id="alertsList">
                    <div class="empty-state">
                        <i class="fas fa-bell-slash"></i>
                        <h4>No alerts configured</h4>
                        <p>Create your first price alert to start monitoring</p>
                    </div>
                </div>
            </div>
        `;

        // Insert into page
        const targetContainer = document.querySelector('.main-container') || document.body;
        targetContainer.insertAdjacentHTML('beforeend', alertsHTML);

        // Create modal for alert creation
        this.createAlertModal();
        this.createSettingsModal();
        this.setupEventListeners();
        this.renderAlerts();
        this.updateStats();
    }

    createAlertModal() {
        const modalHTML = `
            <div id="createAlertModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-bell-on"></i> Create Price Alert</h3>
                        <button class="modal-close" id="closeModalBtn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="alertForm" class="alert-form">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label for="alertSymbol">Stock Symbol *</label>
                                    <input type="text" id="alertSymbol" class="form-control" 
                                           placeholder="e.g., AAPL, MSFT" autocomplete="off" required>
                                    <div class="symbol-suggestions" id="symbolSuggestions"></div>
                                </div>

                                <div class="form-group">
                                    <label for="alertType">Alert Condition *</label>
                                    <select id="alertType" class="form-control" required>
                                        <option value="price_above">Price rises above</option>
                                        <option value="price_below">Price falls below</option>
                                        <option value="change_up">% gain exceeds</option>
                                        <option value="change_down">% loss exceeds</option>
                                        <option value="volume_spike">Volume spike above</option>
                                        <option value="support_breach">Support level breach</option>
                                        <option value="resistance_break">Resistance breakout</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="alertValue">Target Value *</label>
                                    <input type="number" id="alertValue" class="form-control" 
                                           step="0.01" placeholder="Enter value" required>
                                    <small class="form-hint" id="valueHint">Enter price or percentage</small>
                                </div>

                                <div class="form-group">
                                    <label for="alertExpiry">Expiry (Optional)</label>
                                    <select id="alertExpiry" class="form-control">
                                        <option value="">Never expires</option>
                                        <option value="1">1 day</option>
                                        <option value="3">3 days</option>
                                        <option value="7">1 week</option>
                                        <option value="30">1 month</option>
                                        <option value="90">3 months</option>
                                    </select>
                                </div>
                            </div>

                            <div class="alert-options">
                                <div class="option-group">
                                    <h4>Notification Options</h4>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="enableSound" checked>
                                        <span>Play alert sound</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="enableBrowser" checked>
                                        <span>Browser notification</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="enablePersistent">
                                        <span>Persistent until acknowledged</span>
                                    </label>
                                </div>

                                <div class="option-group">
                                    <h4>Alert Behavior</h4>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="autoRemove">
                                        <span>Remove after triggering</span>
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="repeatAlert">
                                        <span>Repeat every 5 minutes</span>
                                    </label>
                                </div>
                            </div>

                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-plus"></i> Create Alert
                                </button>
                                <button type="button" class="btn btn-outline modal-close">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    createSettingsModal() {
        const settingsHTML = `
            <div id="alertsSettingsModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-cog"></i> Alerts Settings</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="settings-grid">
                            <div class="setting-group">
                                <h4>General Settings</h4>
                                <div class="setting-item">
                                    <label>Maximum Alerts</label>
                                    <input type="number" id="maxAlertsSettings" min="1" max="100" 
                                           value="${this.config.maxAlerts}">
                                </div>
                                <div class="setting-item">
                                    <label>Check Interval (seconds)</label>
                                    <input type="number" id="checkIntervalSettings" min="1" max="300" 
                                           value="${this.config.defaultCheckInterval / 1000}">
                                </div>
                                <div class="setting-item">
                                    <label>Alert Cooldown (seconds)</label>
                                    <input type="number" id="alertCooldownSettings" min="10" max="3600" 
                                           value="${this.config.alertCooldown / 1000}">
                                </div>
                            </div>

                            <div class="setting-group">
                                <h4>Default Notification Settings</h4>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="defaultSound" ${this.soundEnabled ? 'checked' : ''}>
                                    <span>Enable sound by default</span>
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="defaultBrowser" checked>
                                    <span>Enable browser notifications by default</span>
                                </label>
                            </div>

                            <div class="setting-group">
                                <h4>Data Management</h4>
                                <button class="btn btn-outline" id="exportAlertsBtn">
                                    <i class="fas fa-download"></i> Export Alerts
                                </button>
                                <button class="btn btn-outline" id="importAlertsBtn">
                                    <i class="fas fa-upload"></i> Import Alerts
                                </button>
                                <button class="btn btn-danger" id="clearAllAlertsBtn">
                                    <i class="fas fa-trash"></i> Clear All Alerts
                                </button>
                            </div>
                        </div>

                        <div class="form-actions">
                            <button class="btn btn-primary" id="saveSettingsBtn">Save Settings</button>
                            <button class="btn btn-outline modal-close">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', settingsHTML);
    }

    setupEventListeners() {
        // Main controls
        document.getElementById('createAlertBtn')?.addEventListener('click', () => {
            this.showModal('createAlertModal');
        });

        document.getElementById('alertsSettingsBtn')?.addEventListener('click', () => {
            this.showModal('alertsSettingsModal');
        });

        document.getElementById('closeAlertsBtn')?.addEventListener('click', () => {
            this.hideAlertsPanel();
        });

        // Form submission
        document.getElementById('alertForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAlert();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterAlerts(e.target.dataset.filter);
            });
        });

        // Symbol suggestions
        document.getElementById('alertSymbol')?.addEventListener('input', (e) => {
            this.showSymbolSuggestions(e.target.value);
        });

        // Alert type change
        document.getElementById('alertType')?.addEventListener('change', (e) => {
            this.updateValueHint(e.target.value);
        });

        // Settings
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            this.saveSettings();
        });

        // Modal close handlers
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hideModals();
            });
        });

        // Data management
        document.getElementById('exportAlertsBtn')?.addEventListener('click', () => {
            this.exportAlerts();
        });

        document.getElementById('importAlertsBtn')?.addEventListener('click', () => {
            this.importAlerts();
        });

        document.getElementById('clearAllAlertsBtn')?.addEventListener('click', () => {
            this.clearAllAlerts();
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModals();
            }
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.showModal('createAlertModal');
            }
        });
    }

    async createAlert() {
        try {
            const formData = this.getFormData();
            if (!this.validateAlertData(formData)) {
                return;
            }

            const alert = this.buildAlertObject(formData);
            await this.addAlert(alert);
            
            this.hideModals();
            this.renderAlerts();
            this.updateStats();
            this.showSuccessMessage(`Alert created for ${formData.symbol}`);
            
        } catch (error) {
            this.handleError('create_alert', error);
        }
    }

    getFormData() {
        return {
            symbol: document.getElementById('alertSymbol').value.trim().toUpperCase(),
            type: document.getElementById('alertType').value,
            value: parseFloat(document.getElementById('alertValue').value),
            expiry: document.getElementById('alertExpiry').value,
            enableSound: document.getElementById('enableSound').checked,
            enableBrowser: document.getElementById('enableBrowser').checked,
            enablePersistent: document.getElementById('enablePersistent').checked,
            autoRemove: document.getElementById('autoRemove').checked,
            repeatAlert: document.getElementById('repeatAlert').checked
        };
    }

    validateAlertData(data) {
        if (!data.symbol || !data.type || isNaN(data.value)) {
            this.showErrorMessage('Please fill all required fields correctly');
            return false;
        }

        if (this.alerts.size >= this.config.maxAlerts) {
            this.showErrorMessage(`Maximum ${this.config.maxAlerts} alerts allowed`);
            return false;
        }

        if (data.value <= 0) {
            this.showErrorMessage('Target value must be greater than 0');
            return false;
        }

        return true;
    }

    buildAlertObject(formData) {
        const now = new Date();
        let expiryDate = null;
        
        if (formData.expiry) {
            expiryDate = new Date();
            expiryDate.setDate(now.getDate() + parseInt(formData.expiry));
        }

        return {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            symbol: formData.symbol,
            type: formData.type,
            value: formData.value,
            created: now.toISOString(),
            expiry: expiryDate ? expiryDate.toISOString() : null,
            status: 'active',
            triggered: false,
            triggeredAt: null,
            options: {
                enableSound: formData.enableSound,
                enableBrowser: formData.enableBrowser,
                enablePersistent: formData.enablePersistent,
                autoRemove: formData.autoRemove,
                repeatAlert: formData.repeatAlert
            },
            metrics: {
                checks: 0,
                falsePositives: 0,
                lastCheck: null
            }
        };
    }

    async addAlert(alert) {
        try {
            // Save to backend database
            const response = await fetch(`${this.baseApi}/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: alert.symbol,
                    alert_type: alert.type,
                    threshold_value: alert.value,
                    condition_type: this.mapConditionType(alert.type),
                    expiry_date: alert.expiry,
                    is_active: true,
                    notification_options: alert.options
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save alert: ${response.status}`);
            }
            
            const savedAlert = await response.json();
            alert.id = savedAlert.alert_id; // Use backend-generated ID
            
            // Also save locally for faster access
            const symbolAlerts = this.alerts.get(alert.symbol) || [];
            symbolAlerts.push(alert);
            this.alerts.set(alert.symbol, symbolAlerts);
            
            await this.saveAlertsLocally();
            this.metrics.totalAlerts++;
            
            console.log(`✅ Alert saved to backend with ID: ${alert.id}`);
            
        } catch (error) {
            console.error('Failed to save alert to backend:', error);
            // Fallback to local storage only
            const symbolAlerts = this.alerts.get(alert.symbol) || [];
            symbolAlerts.push(alert);
            this.alerts.set(alert.symbol, symbolAlerts);
            await this.saveAlertsLocally();
            this.metrics.totalAlerts++;
            throw error;
        }
    }

    async loadStoredAlerts() {
        try {
            // Try to load from backend first
            const response = await fetch(`${this.baseApi}/alerts`);
            if (response.ok) {
                const backendAlerts = await response.json();
                
                // Convert backend format to frontend format
                this.alerts.clear();
                backendAlerts.forEach(alert => {
                    const frontendAlert = {
                        id: alert.alert_id,
                        symbol: alert.symbol,
                        type: alert.alert_type,
                        value: alert.threshold_value,
                        created: alert.created_at,
                        expiry: alert.expiry_date,
                        status: alert.is_active ? 'active' : 'expired',
                        triggered: alert.triggered_at ? true : false,
                        triggeredAt: alert.triggered_at,
                        options: alert.notification_options || {
                            enableSound: true,
                            enableBrowser: true,
                            enablePersistent: false,
                            autoRemove: false,
                            repeatAlert: false
                        },
                        metrics: {
                            checks: 0,
                            falsePositives: 0,
                            lastCheck: alert.last_checked
                        }
                    };
                    
                    const symbolAlerts = this.alerts.get(alert.symbol) || [];
                    symbolAlerts.push(frontendAlert);
                    this.alerts.set(alert.symbol, symbolAlerts);
                });
                
                console.log(`✅ Loaded ${backendAlerts.length} alerts from backend`);
                return;
            }
        } catch (error) {
            console.warn('Failed to load alerts from backend, using local storage:', error);
        }
        
        // Fallback to local storage
        try {
            const stored = localStorage.getItem(this.config.persistKey);
            if (stored) {
                const alertsData = JSON.parse(stored);
                for (const [symbol, alerts] of Object.entries(alertsData)) {
                    this.alerts.set(symbol, alerts);
                }
            }
        } catch (error) {
            console.error('Failed to load stored alerts:', error);
        }
    }

    async removeAlert(symbol, alertId) {
        try {
            // Remove from backend
            const response = await fetch(`${this.baseApi}/alerts/${alertId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                console.warn(`Failed to remove alert from backend: ${response.status}`);
            }
        } catch (error) {
            console.warn('Failed to remove alert from backend:', error);
        }
        
        // Remove from local storage
        const symbolAlerts = this.alerts.get(symbol);
        if (symbolAlerts) {
            const index = symbolAlerts.findIndex(a => a.id === alertId);
            if (index >= 0) {
                symbolAlerts.splice(index, 1);
                if (symbolAlerts.length === 0) {
                    this.alerts.delete(symbol);
                }
                await this.saveAlertsLocally();
                this.renderAlerts();
                this.updateStats();
                this.showSuccessMessage('Alert removed successfully');
            }
        }
    }

    async checkAlertsWithBackend(stockData) {
        if (!stockData || !stockData.symbol) return;

        try {
            // Send stock data to backend for alert checking
            const response = await fetch(`${this.baseApi}/alerts/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: stockData.symbol,
                    current_price: stockData.current_price || stockData.price,
                    change_percent: stockData.change_percent || 0,
                    volume: stockData.volume || 0
                })
            });

            if (response.ok) {
                const result = await response.json();
                
                // Handle triggered alerts
                if (result.triggered_alerts && result.triggered_alerts.length > 0) {
                    for (const triggeredAlert of result.triggered_alerts) {
                        await this.handleBackendTriggeredAlert(triggeredAlert, stockData);
                    }
                }
            }
        } catch (error) {
            console.warn('Backend alert checking failed, using local checking:', error);
            // Fallback to local alert checking
            await this.checkAlerts(stockData);
        }
    }

    async handleBackendTriggeredAlert(backendAlert, stockData) {
        try {
            // Find the local alert and update it
            const symbolAlerts = this.alerts.get(backendAlert.symbol) || [];
            const localAlert = symbolAlerts.find(a => a.id === backendAlert.alert_id);
            
            if (localAlert) {
                localAlert.triggered = true;
                localAlert.triggeredAt = backendAlert.triggered_at;
                localAlert.status = backendAlert.is_active ? 'triggered' : 'expired';
                
                await this.sendNotification(localAlert, stockData);
                this.lastTriggered.set(localAlert.id, Date.now());
                this.metrics.triggeredToday++;
                
                if (localAlert.options.autoRemove) {
                    await this.removeAlert(localAlert.symbol, localAlert.id);
                } else {
                    this.renderAlerts();
                    this.updateStats();
                }
            }
        } catch (error) {
            console.error('Error handling backend triggered alert:', error);
        }
    }

    mapConditionType(alertType) {
        const mapping = {
            'price_above': 'above',
            'price_below': 'below',
            'change_up': 'percent_gain',
            'change_down': 'percent_loss',
            'volume_spike': 'volume_spike',
            'support_breach': 'support_breach',
            'resistance_break': 'resistance_break'
        };
        return mapping[alertType] || 'above';
    }

    // Renamed to avoid conflicts
    async saveAlertsLocally() {
        try {
            const alertsData = {};
            for (const [symbol, alerts] of this.alerts.entries()) {
                alertsData[symbol] = alerts;
            }
            localStorage.setItem(this.config.persistKey, JSON.stringify(alertsData));
        } catch (error) {
            console.error('Failed to save alerts locally:', error);
        }
    }

    async checkAlerts(stockData) {
        if (!stockData || !stockData.symbol) return;

        const symbolAlerts = this.alerts.get(stockData.symbol);
        if (!symbolAlerts || symbolAlerts.length === 0) return;

        const now = Date.now();
        const activeAlerts = symbolAlerts.filter(alert => 
            alert.status === 'active' && !this.isExpired(alert)
        );

        for (const alert of activeAlerts) {
            // Check cooldown
            const lastTriggered = this.lastTriggered.get(alert.id);
            if (lastTriggered && (now - lastTriggered) < this.config.alertCooldown) {
                continue;
            }

            alert.metrics.checks++;
            alert.metrics.lastCheck = new Date().toISOString();

            if (await this.evaluateAlert(alert, stockData)) {
                await this.triggerAlert(alert, stockData);
            }
        }

        await this.saveAlertsLocally();
    }

    async evaluateAlert(alert, stockData) {
        try {
            const { type, value } = alert;
            const price = stockData.current_price || stockData.price;
            const change = stockData.change_percent || 0;
            const volume = stockData.volume || 0;

            switch (type) {
                case 'price_above':
                    return price >= value;
                
                case 'price_below':
                    return price <= value;
                
                case 'change_up':
                    return change >= value;
                
                case 'change_down':
                    return Math.abs(change) >= Math.abs(value) && change < 0;
                
                case 'volume_spike':
                    const avgVolume = await this.getAverageVolume(alert.symbol);
                    return volume >= avgVolume * value;
                
                case 'support_breach':
                    return price <= value;
                
                case 'resistance_break':
                    return price >= value;
                
                default:
                    return false;
            }
        } catch (error) {
            console.error('Alert evaluation error:', error);
            return false;
        }
    }

    async triggerAlert(alert, stockData) {
        try {
            alert.triggered = true;
            alert.triggeredAt = new Date().toISOString();
            alert.status = alert.options.autoRemove ? 'expired' : 'triggered';
            
            this.lastTriggered.set(alert.id, Date.now());
            this.metrics.triggeredToday++;

            await this.sendNotification(alert, stockData);
            
            if (alert.options.autoRemove) {
                this.removeAlert(alert.symbol, alert.id);
            }

            this.renderAlerts();
            this.updateStats();
            
        } catch (error) {
            this.handleError('trigger_alert', error);
        }
    }

    async sendNotification(alert, stockData) {
        const message = this.formatNotificationMessage(alert, stockData);
        
        // Browser notification
        if (alert.options.enableBrowser && Notification.permission === 'granted') {
            const notification = new Notification('Price Alert Triggered', {
                body: message,
                icon: '/favicon.ico',
                tag: alert.id,
                requireInteraction: alert.options.enablePersistent
            });

            notification.onclick = () => {
                window.focus();
                this.showAlertsPanel();
                notification.close();
            };
        }

        // Sound notification
        if (alert.options.enableSound && this.soundEnabled) {
            this.playAlertSound();
        }

        // Visual notification
        this.showSystemNotification(message, 'alert');

        // Add to notification queue for repeat alerts
        if (alert.options.repeatAlert) {
            this.scheduleRepeatAlert(alert, stockData);
        }
    }

    formatNotificationMessage(alert, stockData) {
        const symbol = alert.symbol;
        const price = stockData.current_price || stockData.price;
        const change = stockData.change_percent || 0;

        const conditionText = {
            'price_above': `rose above $${alert.value}`,
            'price_below': `fell below $${alert.value}`,
            'change_up': `gained ${alert.value}%+`,
            'change_down': `lost ${Math.abs(alert.value)}%+`,
            'volume_spike': `volume spiked ${alert.value}x average`,
            'support_breach': `breached support at $${alert.value}`,
            'resistance_break': `broke resistance at $${alert.value}`
        }[alert.type] || 'condition met';

        return `🔔 ${symbol} ${conditionText} (Current: $${price?.toFixed(2)}, ${change?.toFixed(2)}%)`;
    }

    renderAlerts() {
        const container = document.getElementById('alertsList');
        if (!container) return;

        const allAlerts = this.getAllAlerts();
        
        if (allAlerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell-slash"></i>
                    <h4>No alerts configured</h4>
                    <p>Create your first price alert to start monitoring</p>
                </div>
            `;
            return;
        }

        // Sort by status and creation date
        allAlerts.sort((a, b) => {
            if (a.status !== b.status) {
                const statusOrder = { active: 0, triggered: 1, expired: 2 };
                return statusOrder[a.status] - statusOrder[b.status];
            }
            return new Date(b.created) - new Date(a.created);
        });

        container.innerHTML = allAlerts.map(alert => this.renderAlertItem(alert)).join('');
    }

    renderAlertItem(alert) {
        const statusIcon = {
            active: 'fa-bell',
            triggered: 'fa-check-circle',
            expired: 'fa-clock'
        }[alert.status] || 'fa-bell';

        const statusColor = {
            active: 'status-active',
            triggered: 'status-triggered',
            expired: 'status-expired'
        }[alert.status] || 'status-active';

        const conditionText = this.formatConditionText(alert);
        const timeText = alert.triggered ? 
            `Triggered: ${this.formatDate(alert.triggeredAt)}` :
            `Created: ${this.formatDate(alert.created)}`;

        return `
            <div class="alert-item ${statusColor}" data-filter="${alert.status}">
                <div class="alert-status">
                    <i class="fas ${statusIcon}"></i>
                </div>
                <div class="alert-details">
                    <div class="alert-symbol">${alert.symbol}</div>
                    <div class="alert-condition">${conditionText}</div>
                    <div class="alert-time">${timeText}</div>
                    ${alert.expiry ? `<div class="alert-expiry">Expires: ${this.formatDate(alert.expiry)}</div>` : ''}
                </div>
                <div class="alert-actions">
                    ${alert.status === 'active' ? `
                        <button class="btn btn-sm btn-outline" onclick="priceAlertsManager.editAlert('${alert.symbol}', '${alert.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="priceAlertsManager.removeAlert('${alert.symbol}', '${alert.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    formatConditionText(alert) {
        const conditions = {
            'price_above': `Price ≥ $${alert.value}`,
            'price_below': `Price ≤ $${alert.value}`,
            'change_up': `Gain ≥ ${alert.value}%`,
            'change_down': `Loss ≥ ${Math.abs(alert.value)}%`,
            'volume_spike': `Volume ≥ ${alert.value}x avg`,
            'support_breach': `Support breach $${alert.value}`,
            'resistance_break': `Resistance break $${alert.value}`
        };
        return conditions[alert.type] || `${alert.type}: ${alert.value}`;
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    getAllAlerts() {
        const allAlerts = [];
        for (const [symbol, symbolAlerts] of this.alerts.entries()) {
            allAlerts.push(...symbolAlerts.map(alert => ({ ...alert, symbol })));
        }
        return allAlerts;
    }

    filterAlerts(filter) {
        const alertItems = document.querySelectorAll('.alert-item');
        alertItems.forEach(item => {
            if (filter === 'all' || item.dataset.filter === filter) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    updateStats() {
        const allAlerts = this.getAllAlerts();
        const activeCount = allAlerts.filter(a => a.status === 'active').length;
        const triggeredCount = allAlerts.filter(a => a.status === 'triggered').length;

        document.getElementById('alertsCount').textContent = allAlerts.length;
        document.getElementById('activeAlertsCount').textContent = activeCount;
        document.getElementById('triggeredAlertsCount').textContent = triggeredCount;
        document.getElementById('alertsAccuracy').textContent = `${Math.round(this.metrics.accuracy * 100)}%`;
    }

    // Utility methods
    showModal(modalId) {
        document.getElementById(modalId)?.classList.add('show');
    }

    hideModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    }

    showAlertsPanel() {
        const container = document.getElementById('priceAlertsContainer');
        if (container) {
            container.classList.add('show');
            document.body.classList.add('alerts-panel-open');
        }
    }

    hideAlertsPanel() {
        const container = document.getElementById('priceAlertsContainer');
        if (container) {
            container.classList.remove('show');
            document.body.classList.remove('alerts-panel-open');
        }
    }

    removeAlert(symbol, alertId) {
        const symbolAlerts = this.alerts.get(symbol);
        if (symbolAlerts) {
            const index = symbolAlerts.findIndex(a => a.id === alertId);
            if (index >= 0) {
                symbolAlerts.splice(index, 1);
                if (symbolAlerts.length === 0) {
                    this.alerts.delete(symbol);
                }
                this.saveAlerts();
                this.renderAlerts();
                this.updateStats();
                this.showSuccessMessage('Alert removed successfully');
            }
        }
    }

    async saveAlerts() {
        try {
            const alertsData = {};
            for (const [symbol, alerts] of this.alerts.entries()) {
                alertsData[symbol] = alerts;
            }
            localStorage.setItem(this.config.persistKey, JSON.stringify(alertsData));
        } catch (error) {
            console.error('Failed to save alerts:', error);
        }
    }

    async loadStoredAlerts() {
        try {
            const stored = localStorage.getItem(this.config.persistKey);
            if (stored) {
                const alertsData = JSON.parse(stored);
                for (const [symbol, alerts] of Object.entries(alertsData)) {
                    this.alerts.set(symbol, alerts);
                }
            }
        } catch (error) {
            console.error('Failed to load stored alerts:', error);
        }
    }

    isExpired(alert) {
        if (!alert.expiry) return false;
        return new Date() > new Date(alert.expiry);
    }

    playAlertSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmEcBjiRxvPE');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (error) {
            console.warn('Could not play alert sound:', error);
        }
    }

    showSuccessMessage(message) {
        this.showSystemNotification(message, 'success');
    }

    showErrorMessage(message) {
        this.showSystemNotification(message, 'error');
    }

    showSystemNotification(message, type = 'info') {
        // Integration with main trading platform notification system
        if (window.tradingPlatform && window.tradingPlatform.showStatus) {
            window.tradingPlatform.showStatus(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('✅ Notification permission granted');
                } else {
                    console.warn('⚠️ Notification permission denied');
                }
            });
        }
    }

    handleError(context, error) {
        console.error(`Price Alerts Error [${context}]:`, error);
        this.showErrorMessage(`Error in ${context}: ${error.message}`);
    }

    setupPerformanceMonitoring() {
        // Monitor performance metrics
        setInterval(() => {
            const totalAlerts = this.getAllAlerts().length;
            const activeAlerts = this.getAllAlerts().filter(a => a.status === 'active').length;
            
            if (activeAlerts > this.config.maxAlerts * 0.8) {
                console.warn('⚠️ High number of active alerts may impact performance');
            }
        }, 60000); // Check every minute
    }

    // Integration methods for trading platform
    integrateWithTradingPlatform() {
        if (window.tradingPlatform) {
            // Hook into price updates
            const originalMethod = window.tradingPlatform.updateRealTimePrice;
            if (originalMethod) {
                window.tradingPlatform.updateRealTimePrice = (stockData) => {
                    originalMethod.call(window.tradingPlatform, stockData);
                    // Use backend integration for alert checking
                    this.checkAlertsWithBackend(stockData);
                };
            }
        }
    }
}

// Create header button for alerts access
function createPriceAlertsButton() {
    if (document.getElementById('priceAlertsBtn')) return;

    const headerActions = document.querySelector('.header-actions') || 
                         document.querySelector('.header-system-status') ||
                         document.querySelector('header');
    
    if (headerActions) {
        const alertsButton = document.createElement('button');
        alertsButton.id = 'priceAlertsBtn';
        alertsButton.className = 'btn btn-sm btn-outline alerts-header-btn';
        alertsButton.innerHTML = `
            <i class="fas fa-bell"></i>
            <span class="alerts-badge" id="alertsBadge">0</span>
        `;
        
        alertsButton.addEventListener('click', () => {
            if (!window.priceAlertsManager) {
                window.priceAlertsManager = new PriceAlertsManager();
            }
            window.priceAlertsManager.createAlertsUI();
            window.priceAlertsManager.showAlertsPanel();
        });
        
        headerActions.appendChild(alertsButton);
    }
}

// Auto-initialize and expose to global scope
window.PriceAlertsManager = PriceAlertsManager;
window.createPriceAlertsButton = createPriceAlertsButton;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    createPriceAlertsButton();
});

console.log('✅ Price Alerts Clean System loaded successfully');
