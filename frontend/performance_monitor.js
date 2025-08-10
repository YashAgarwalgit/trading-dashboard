// Enhancement 4: Advanced Performance Monitoring Dashboard
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            apiCalls: [],
            renderTimes: [],
            memoryUsage: [],
            errorRate: 0,
            totalRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            peakMemory: 0
        };
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.init();
    }

    init() {
        this.createPerformanceDashboard();
        this.setupMonitoring();
        this.interceptApiCalls();
        this.monitorMemoryUsage();
    }

    createPerformanceDashboard() {
        const dashboardContainer = document.createElement('div');
        dashboardContainer.id = 'performanceMonitor';
        dashboardContainer.className = 'performance-monitor hidden';
        dashboardContainer.innerHTML = `
            <div class="performance-header">
                <div class="performance-title">
                    <h4><i class="fas fa-tachometer-alt"></i> Performance Monitor</h4>
                    <div class="performance-status">
                        <span class="status-indicator"></span>
                        <span class="status-text">Monitoring...</span>
                    </div>
                </div>
                <div class="performance-controls">
                    <button class="btn btn--sm btn--outline" id="resetMetrics">
                        <i class="fas fa-undo"></i> Reset
                    </button>
                    <button class="btn btn--sm btn--outline" id="exportMetrics">
                        <i class="fas fa-download"></i> Export
                    </button>
                    <button class="btn btn--sm btn--secondary" id="toggleMonitoring">
                        <i class="fas fa-pause"></i> Pause
                    </button>
                    <button class="btn btn--sm btn--primary" id="hidePerformanceMonitor">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
            <div class="performance-metrics">
                <!-- Real-time Stats -->
                <div class="metrics-row">
                    <div class="metric-card">
                        <div class="metric-icon">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value" id="avgResponseTime">0ms</div>
                            <div class="metric-label">Avg Response</div>
                        </div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">
                            <i class="fas fa-memory"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value" id="memoryUsage">0MB</div>
                            <div class="metric-label">Memory Usage</div>
                        </div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value" id="errorRate">0%</div>
                            <div class="metric-label">Error Rate</div>
                        </div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">
                            <i class="fas fa-exchange-alt"></i>
                        </div>
                        <div class="metric-content">
                            <div class="metric-value" id="totalRequests">0</div>
                            <div class="metric-label">Total Requests</div>
                        </div>
                    </div>
                </div>

                <!-- Performance Charts -->
                <div class="charts-container">
                    <div class="chart-section">
                        <h6>Response Time Trends</h6>
                        <canvas id="responseTimeChart" width="400" height="150"></canvas>
                    </div>
                    
                    <div class="chart-section">
                        <h6>Memory Usage Over Time</h6>
                        <canvas id="memoryChart" width="400" height="150"></canvas>
                    </div>
                </div>

                <!-- API Call Log -->
                <div class="api-log-section">
                    <div class="log-header">
                        <h6>Recent API Calls</h6>
                        <button class="btn btn--xs btn--outline" id="clearLog">Clear</button>
                    </div>
                    <div class="api-log" id="apiLog">
                        <div class="empty-log">No API calls recorded yet</div>
                    </div>
                </div>

                <!-- System Health -->
                <div class="health-section">
                    <h6>System Health Indicators</h6>
                    <div class="health-indicators">
                        <div class="health-item">
                            <span class="health-label">WebSocket Connection:</span>
                            <span class="health-status" id="wsStatus">Checking...</span>
                        </div>
                        <div class="health-item">
                            <span class="health-label">Backend Connectivity:</span>
                            <span class="health-status" id="backendStatus">Checking...</span>
                        </div>
                        <div class="health-item">
                            <span class="health-label">Data Freshness:</span>
                            <span class="health-status" id="dataFreshness">Unknown</span>
                        </div>
                        <div class="health-item">
                            <span class="health-label">Chart Render Performance:</span>
                            <span class="health-status" id="chartPerformance">Good</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add to body
        document.body.appendChild(dashboardContainer);
        this.setupEventListeners();
        this.initCharts();
    }

    setupEventListeners() {
        document.getElementById('resetMetrics')?.addEventListener('click', () => {
            this.resetMetrics();
        });

        document.getElementById('exportMetrics')?.addEventListener('click', () => {
            this.exportMetrics();
        });

        document.getElementById('toggleMonitoring')?.addEventListener('click', () => {
            this.toggleMonitoring();
        });

        document.getElementById('hidePerformanceMonitor')?.addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('clearLog')?.addEventListener('click', () => {
            this.clearApiLog();
        });

        // Add keyboard shortcut (Ctrl + Shift + P)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                this.toggle();
            }
        });
    }

    initCharts() {
        // Response Time Chart
        const rtCtx = document.getElementById('responseTimeChart');
        if (rtCtx) {
            this.responseTimeChart = new Chart(rtCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'ms' } },
                        x: { display: false }
                    }
                }
            });
        }

        // Memory Chart
        const memCtx = document.getElementById('memoryChart');
        if (memCtx) {
            this.memoryChart = new Chart(memCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Memory Usage (MB)',
                        data: [],
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'MB' } },
                        x: { display: false }
                    }
                }
            });
        }
    }

    setupMonitoring() {
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.updateMetrics();
            this.checkSystemHealth();
        }, 2000);
    }

    interceptApiCalls() {
        // Intercept fetch calls
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const url = args[0];
            
            try {
                this.metrics.totalRequests++;
                const response = await originalFetch.apply(this, args);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                this.recordApiCall({
                    url,
                    method: args[1]?.method || 'GET',
                    status: response.status,
                    duration: Math.round(duration),
                    success: response.ok,
                    timestamp: new Date().toISOString()
                });

                if (!response.ok) {
                    this.metrics.failedRequests++;
                }

                return response;
            } catch (error) {
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                this.recordApiCall({
                    url,
                    method: args[1]?.method || 'GET',
                    status: 0,
                    duration: Math.round(duration),
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });

                this.metrics.failedRequests++;
                throw error;
            }
        };
    }

    recordApiCall(callData) {
        this.metrics.apiCalls.unshift(callData);
        if (this.metrics.apiCalls.length > 50) {
            this.metrics.apiCalls = this.metrics.apiCalls.slice(0, 50);
        }
        
        this.updateApiLog();
        this.updateResponseTimeChart(callData.duration);
    }

    monitorMemoryUsage() {
        if ('memory' in performance) {
            setInterval(() => {
                const memory = performance.memory;
                const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
                this.metrics.memoryUsage.unshift({
                    value: usedMB,
                    timestamp: Date.now()
                });
                
                if (this.metrics.memoryUsage.length > 30) {
                    this.metrics.memoryUsage = this.metrics.memoryUsage.slice(0, 30);
                }
                
                this.metrics.peakMemory = Math.max(this.metrics.peakMemory, usedMB);
                this.updateMemoryChart();
            }, 3000);
        }
    }

    updateMetrics() {
        // Calculate average response time
        const recentCalls = this.metrics.apiCalls.slice(0, 10);
        if (recentCalls.length > 0) {
            this.metrics.avgResponseTime = Math.round(
                recentCalls.reduce((sum, call) => sum + call.duration, 0) / recentCalls.length
            );
        }

        // Calculate error rate
        if (this.metrics.totalRequests > 0) {
            this.metrics.errorRate = Math.round(
                (this.metrics.failedRequests / this.metrics.totalRequests) * 100
            );
        }

        // Update UI
        this.updateMetricsDisplay();
    }

    updateMetricsDisplay() {
        document.getElementById('avgResponseTime').textContent = `${this.metrics.avgResponseTime}ms`;
        document.getElementById('errorRate').textContent = `${this.metrics.errorRate}%`;
        document.getElementById('totalRequests').textContent = this.metrics.totalRequests;
        
        const currentMemory = this.metrics.memoryUsage[0]?.value || 0;
        document.getElementById('memoryUsage').textContent = `${currentMemory}MB`;
    }

    updateApiLog() {
        const logContainer = document.getElementById('apiLog');
        if (!logContainer) return;

        if (this.metrics.apiCalls.length === 0) {
            logContainer.innerHTML = '<div class="empty-log">No API calls recorded yet</div>';
            return;
        }

        logContainer.innerHTML = this.metrics.apiCalls.slice(0, 10).map(call => `
            <div class="log-entry ${call.success ? 'success' : 'error'}">
                <div class="log-main">
                    <span class="method">${call.method}</span>
                    <span class="url">${this.truncateUrl(call.url)}</span>
                    <span class="status status-${Math.floor(call.status / 100)}xx">${call.status}</span>
                </div>
                <div class="log-details">
                    <span class="duration">${call.duration}ms</span>
                    <span class="timestamp">${new Date(call.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
    }

    updateResponseTimeChart(duration) {
        if (!this.responseTimeChart) return;

        const chart = this.responseTimeChart;
        chart.data.labels.unshift(new Date().toLocaleTimeString());
        chart.data.datasets[0].data.unshift(duration);
        
        if (chart.data.labels.length > 20) {
            chart.data.labels = chart.data.labels.slice(0, 20);
            chart.data.datasets[0].data = chart.data.datasets[0].data.slice(0, 20);
        }
        
        chart.update('none');
    }

    updateMemoryChart() {
        if (!this.memoryChart) return;

        const chart = this.memoryChart;
        const data = this.metrics.memoryUsage.slice(0, 20).reverse();
        
        chart.data.labels = data.map(() => '');
        chart.data.datasets[0].data = data.map(item => item.value);
        
        chart.update('none');
    }

    checkSystemHealth() {
        // WebSocket status
        const wsStatus = document.getElementById('wsStatus');
        if (wsStatus) {
            const isConnected = window.socket?.connected;
            wsStatus.textContent = isConnected ? 'Connected' : 'Disconnected';
            wsStatus.className = `health-status ${isConnected ? 'healthy' : 'unhealthy'}`;
        }

        // Backend status
        const backendStatus = document.getElementById('backendStatus');
        if (backendStatus) {
            const recentSuccess = this.metrics.apiCalls.slice(0, 3).some(call => call.success);
            backendStatus.textContent = recentSuccess ? 'Online' : 'Issues Detected';
            backendStatus.className = `health-status ${recentSuccess ? 'healthy' : 'warning'}`;
        }

        // Data freshness
        const dataFreshness = document.getElementById('dataFreshness');
        if (dataFreshness) {
            const lastCall = this.metrics.apiCalls[0];
            if (lastCall) {
                const age = Date.now() - new Date(lastCall.timestamp).getTime();
                const ageText = age < 30000 ? 'Fresh' : age < 60000 ? 'Recent' : 'Stale';
                const ageClass = age < 30000 ? 'healthy' : age < 60000 ? 'warning' : 'unhealthy';
                dataFreshness.textContent = ageText;
                dataFreshness.className = `health-status ${ageClass}`;
            }
        }
    }

    truncateUrl(url) {
        if (typeof url !== 'string') return '';
        const maxLength = 40;
        return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
    }

    toggleMonitoring() {
        const btn = document.getElementById('toggleMonitoring');
        if (this.isMonitoring) {
            this.isMonitoring = false;
            clearInterval(this.monitoringInterval);
            btn.innerHTML = '<i class="fas fa-play"></i> Resume';
            document.querySelector('.status-text').textContent = 'Paused';
            document.querySelector('.status-indicator').className = 'status-indicator paused';
        } else {
            this.isMonitoring = true;
            this.setupMonitoring();
            btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            document.querySelector('.status-text').textContent = 'Monitoring...';
            document.querySelector('.status-indicator').className = 'status-indicator active';
        }
    }

    resetMetrics() {
        this.metrics = {
            apiCalls: [],
            renderTimes: [],
            memoryUsage: [],
            errorRate: 0,
            totalRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            peakMemory: 0
        };
        this.updateApiLog();
        this.updateMetricsDisplay();
        
        if (this.responseTimeChart) {
            this.responseTimeChart.data.labels = [];
            this.responseTimeChart.data.datasets[0].data = [];
            this.responseTimeChart.update();
        }
        
        if (this.memoryChart) {
            this.memoryChart.data.labels = [];
            this.memoryChart.data.datasets[0].data = [];
            this.memoryChart.update();
        }
    }

    exportMetrics() {
        const data = {
            exportTime: new Date().toISOString(),
            metrics: this.metrics,
            summary: {
                totalRequests: this.metrics.totalRequests,
                failedRequests: this.metrics.failedRequests,
                avgResponseTime: this.metrics.avgResponseTime,
                errorRate: this.metrics.errorRate,
                peakMemory: this.metrics.peakMemory
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-metrics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    clearApiLog() {
        this.metrics.apiCalls = [];
        this.updateApiLog();
    }

    show() {
        document.getElementById('performanceMonitor').classList.remove('hidden');
    }

    hide() {
        document.getElementById('performanceMonitor').classList.add('hidden');
    }

    toggle() {
        const monitor = document.getElementById('performanceMonitor');
        monitor.classList.toggle('hidden');
    }
}

// Global access for console debugging
window.PerformanceMonitor = PerformanceMonitor;

// Initialize performance monitoring - disabled by default to avoid interference
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if explicitly requested
    const enablePerformanceMonitoring = localStorage.getItem('enablePerformanceMonitoring') === 'true';
    if (enablePerformanceMonitoring) {
        setTimeout(() => {
            window.performanceMonitor = new PerformanceMonitor();
        }, 10000); // Much later initialization
    }
    console.log('Performance Monitor available. Use localStorage.setItem("enablePerformanceMonitoring", "true") and reload to enable.');
});
