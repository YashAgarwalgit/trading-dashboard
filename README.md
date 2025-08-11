# 📈 Advanced Paper Trading Dashboard

> **A sophisticated real-time paper trading platform with institutional-grade market intelligence, technical analysis, and portfolio management capabilities.**

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0.0-green.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)
![Chart.js](https://img.shields.io/badge/Chart.js-Latest-ff6384.svg)
![Real-time](https://img.shields.io/badge/Real--time-WebSocket-brightgreen.svg)

## 🎯 Overview

This is a **paper trading dashboard** - a risk-free simulation environment for practicing stock trading without real money. Perfect for learning market dynamics, testing strategies, and developing trading skills with real market data.

### ✨ Key Features

🔴 **Real-Time Market Data**
- Live price streaming via WebSocket connections
- Multi-market support (US stocks, NSE/BSE Indian markets)
- 5-second update intervals with intelligent ticker resolution
- Automatic market suffix detection (.NS/.BO for Indian stocks)

📊 **Advanced Technical Analysis** 
- Interactive Chart.js powered technical indicators
- RSI, MACD, Moving Averages, Bollinger Bands
- Volume analysis and price momentum indicators
- Custom timeframe analysis (1D to Max historical data)

💼 **Portfolio Management**
- Create and manage multiple virtual portfolios
- Buy/sell simulation with average price calculations
- Real-time P&L tracking and performance analytics
- Transaction history and portfolio diversification metrics

🧠 **Market Intelligence**
- AI-powered market regime analysis (0-10 scoring system)
- Fear & Greed index with sentiment indicators
- Market breadth analysis and sector performance
- News sentiment analysis with headline scoring
- Cross-asset correlation matrix (stocks, crypto, commodities, forex)

📰 **News & Sentiment Analysis**
- Real-time news headline scraping and sentiment scoring
- TextBlob-powered polarity analysis (0-100 scale)
- Market sentiment dashboard with qualitative labels
- Watchlist-specific news aggregation

⚡ **Real-Time Features**
- WebSocket-powered live updates
- Price alerts and notifications
- Connection status monitoring
- Auto-reconnection capabilities

🎨 **Modern UI/UX**
- Responsive design with dark/light theme support
- Interactive charts and data visualizations
- Hover tooltips and status indicators
- Progressive enhancement with modular JavaScript

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- pip package manager

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/YashAgarwalgit/trading-dashboard.git
cd trading-dashboard
```

2. **Install dependencies**
```bash
cd backend
pip install -r requirements.txt
```

3. **Run the application**
```bash
python stock_service.py
```

4. **Access the dashboard**
Open your browser to: `http://localhost:5000`

### Alternative Quick Start (Windows)
Simply run the provided `run.bat` file for automated setup.

## 🏗️ System Architecture

```
┌─────────────────┐    WebSocket/HTTPS    ┌─────────────────────┐
│   Frontend      │◄─────────────────────►│  Flask Backend      │
│  (Vanilla JS)   │                       │  + SocketIO         │
│  - Dashboard    │                       │  - REST API         │
│  - Charts       │                       │  - Real-time Data   │
│  - Portfolio    │                       │  - Market Intel     │
└─────────────────┘                       └──────────┬──────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │     SQLite DB       │
                                          │   - Portfolios      │
                                          │   - Transactions    │
                                          │   - Price Alerts    │
                                          └─────────────────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │   External APIs     │
                                          │  - Yahoo Finance    │
                                          │  - News Sources     │
                                          │  - Market Data      │
                                          └─────────────────────┘
```

## 📁 Project Structure

```
trading-dashboard/
├── backend/                          # Python Flask backend
│   ├── stock_service.py             # Main Flask application with API routes
│   ├── market_metrics_enhanced.py   # Advanced market intelligence engine
│   ├── technical_indicators_service.py  # Technical analysis service
│   ├── requirements.txt             # Python dependencies
│   └── data/
│       └── trading_platform.db      # SQLite database (auto-generated)
├── frontend/                         # Frontend assets
│   ├── index.html                   # Main dashboard interface
│   ├── app.js                       # Core application logic
│   ├── style.css                    # Comprehensive styling system
│   ├── market_intelligence_enhanced.js  # Market intelligence UI
│   ├── portfolio-enhancements.js    # Portfolio management features
│   ├── technical_indicators.js      # Technical analysis charts
│   ├── market_news.js              # News and sentiment features
│   ├── price_alerts.js             # Price alert system
│   └── performance_monitor.js       # Performance tracking
├── render.yaml                      # Render.com deployment config
├── requirements.txt                 # Root dependencies
├── run.bat                         # Windows quick start script
└── README.md                       # This file
```

## 🔧 Core Technologies

### Backend Stack
- **Flask 3.0.0** - Web framework and REST API
- **Flask-SocketIO 5.3.6** - Real-time WebSocket communication
- **yfinance 0.2.65** - Market data sourcing
- **pandas 2.1+** - Data manipulation and analysis
- **numpy 1.26+** - Numerical computing
- **beautifulsoup4** - Web scraping for news/sentiment
- **textblob** - Natural language processing
- **SQLite** - Lightweight database (built-in)

### Frontend Stack
- **Vanilla JavaScript (ES6+)** - No framework dependencies
- **Chart.js** - Interactive financial charts
- **Socket.IO Client** - Real-time communication
- **CSS Grid/Flexbox** - Modern responsive layouts
- **Web APIs** - Native browser capabilities

## 📊 Feature Deep Dive

### 1. Paper Trading System
- **Virtual Portfolios**: Create multiple portfolios with custom capital allocation
- **Simulated Trading**: Execute buy/sell orders without real money risk
- **Average Cost Tracking**: Automatic calculation of weighted average costs
- **P&L Analytics**: Real-time profit/loss tracking with percentage metrics
- **Transaction History**: Complete audit trail of all simulated trades

### 2. Real-Time Market Data
- **Multi-Market Coverage**: US stocks, Indian NSE/BSE markets
- **Live Price Streaming**: WebSocket-powered 5-second updates
- **Smart Ticker Resolution**: Automatic suffix detection for Indian stocks
- **Volume Analysis**: Real-time volume data with historical comparisons
- **Market Status**: Connection monitoring and status indicators

### 3. Technical Analysis Suite
- **Chart Types**: Candlestick, line, and volume charts
- **Technical Indicators**:
  - RSI (Relative Strength Index)
  - MACD (Moving Average Convergence Divergence) 
  - Simple & Exponential Moving Averages
  - Bollinger Bands
  - Volume indicators
- **Multiple Timeframes**: 1D, 5D, 1M, 3M, 6M, 1Y, Max
- **Interactive Charts**: Zoom, pan, and hover tooltips

### 4. Market Intelligence Engine
- **Regime Analysis**: AI-powered market condition scoring (0-10)
- **Fear & Greed Index**: Composite sentiment indicator
- **Market Breadth**: Sector performance and advance/decline ratios
- **Correlation Analysis**: Cross-asset relationship mapping
- **India Focus**: Specialized metrics for Indian markets

### 5. News & Sentiment Analysis
- **Headline Aggregation**: Real-time news collection
- **Sentiment Scoring**: TextBlob-powered sentiment analysis (0-100)
- **Watchlist Integration**: News specific to tracked symbols
- **Sentiment Trends**: Historical sentiment tracking

### 6. Price Alert System
- **Custom Alerts**: Set price targets for any tracked symbol
- **Real-time Monitoring**: Continuous price monitoring
- **Visual Notifications**: In-app alert system
- **Alert Management**: Create, edit, and delete price alerts

## 🎨 User Interface Features

### Dashboard Layout
- **Multi-tab Interface**: Organized sections for different functionalities
- **Real-time Metrics**: Live updating cards showing key data
- **Status Indicators**: Connection and system status monitoring
- **Responsive Design**: Works on desktop, tablet, and mobile

### Visual Elements
- **Interactive Charts**: Chart.js powered financial visualizations
- **Data Tables**: Sortable and searchable data grids
- **Progress Indicators**: Loading states and progress bars
- **Hover Effects**: Rich tooltips and hover interactions
- **Color Coding**: Semantic colors for gains/losses and status

### Accessibility
- **Keyboard Navigation**: Full keyboard accessibility support
- **Screen Reader Support**: Semantic HTML and ARIA labels
- **High Contrast**: Clear visual hierarchy and contrast
- **Responsive Text**: Scalable typography system

## ⚡ Real-Time Features

### WebSocket Implementation
```javascript
// Real-time price subscription
socket.emit('subscribe', { ticker: 'AAPL' });

// Live price updates
socket.on('price_update', (data) => {
    updatePriceDisplay(data);
    updatePortfolioValue(data);
    checkPriceAlerts(data);
});
```

### Live Data Flow
1. **Client Subscription**: User selects a stock to track
2. **Server Processing**: Backend fetches latest data from Yahoo Finance
3. **Data Broadcasting**: Real-time updates sent to subscribed clients
4. **UI Updates**: Frontend updates prices, charts, and portfolio values
5. **Alert Processing**: Price alerts checked and triggered if conditions met

## 🔒 Security & Data Management

### Data Protection
- **Input Validation**: Regex-based ticker symbol validation
- **SQL Injection Prevention**: Parameterized queries only
- **Rate Limiting**: API call throttling to prevent abuse
- **Data Sanitization**: NaN/Inf value handling in financial data

### Database Management
- **ACID Compliance**: SQLite with transaction integrity
- **Automatic Backups**: Database integrity checking
- **Recovery Tools**: Built-in repair and cleanup utilities
- **Migration Support**: Schema evolution capabilities

## 📈 Performance Optimization

### Caching Strategy
- **Ticker Resolution Cache**: Reduces redundant API calls
- **Market Data Cache**: 10-second TTL for frequently requested data
- **Database Query Optimization**: Indexed queries for fast retrieval
- **Frontend Caching**: Efficient DOM updates and minimal reflows

### Rate Limiting
- **API Call Management**: Sliding window rate limiter
- **Concurrent Processing**: ThreadPoolExecutor for parallel data fetching
- **Timeout Handling**: Graceful degradation for slow responses
- **Error Recovery**: Automatic retry with exponential backoff

## 🚀 Deployment

### Local Development
```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run development server
python backend/stock_service.py

# Access at http://localhost:5000
```

### Production Deployment (Render.com)
The application includes `render.yaml` configuration for one-click deployment:

1. **Push to GitHub**: Commit your code to a GitHub repository
2. **Connect to Render**: Link your GitHub repo to Render.com
3. **Auto-Deploy**: Render automatically detects and deploys using render.yaml
4. **Live URL**: Access your deployed app at the provided Render URL

### Environment Variables
```bash
FLASK_ENV=production          # Production mode
SECRET_KEY=your-secret-key    # Session security
PYTHON_VERSION=3.11.0         # Python version
```

## 🛠️ API Documentation

### Stock Data Endpoints
```http
GET /api/stock/{ticker}                    # Real-time stock data
GET /api/stock/{ticker}/history            # Historical OHLC data
GET /api/stocks/search/{query}             # Symbol search
```

### Portfolio Management
```http
GET /api/portfolios                        # List all portfolios
POST /api/portfolios                       # Create new portfolio
GET /api/portfolios/{id}                   # Get portfolio details
DELETE /api/portfolios/{id}                # Delete portfolio
POST /api/portfolios/{id}/buy              # Execute buy order
POST /api/portfolios/{id}/sell             # Execute sell order
```

### Market Intelligence
```http
POST /api/market/enhanced                  # Advanced market analysis
GET /api/market-overview                   # Market overview data
GET /api/technical-indicators/{ticker}     # Technical analysis
```

### System Management
```http
GET /api/status                           # System health check
POST /api/admin/repair-database           # Database maintenance
```

## 🎯 Educational Value

This paper trading dashboard serves as an excellent educational tool for:

### Learning Objectives
- **Market Mechanics**: Understanding how stock prices move and markets operate
- **Technical Analysis**: Learning to read charts and technical indicators
- **Portfolio Management**: Practicing diversification and risk management
- **News Impact**: Observing how news and sentiment affect stock prices
- **Strategy Testing**: Experimenting with different trading approaches risk-free

### Skill Development
- **Data Analysis**: Working with real market data and financial metrics
- **Decision Making**: Making trading decisions based on available information
- **Risk Assessment**: Understanding volatility and market risks
- **Technology Usage**: Learning modern web technologies and real-time systems

## 📞 Contact & Support

### Developer Information

**Yash Agarwal**
- 📧 **Email**: [agayash23@gmail.com](mailto:agayash23@gmail.com)
- 💼 **LinkedIn**: [Connect with me](https://www.linkedin.com/in/yash-agarwal-73603924b)
- 📱 **Phone**: +91 7047415636
- 🐱 **GitHub**: [@YashAgarwalgit](https://github.com/YashAgarwalgit)

### Support Channels
- **Bug Reports**: Create an issue on GitHub
- **Feature Requests**: Submit via GitHub Issues
- **Technical Questions**: Email for technical support
- **Professional Inquiries**: LinkedIn or email

### Response Times
- **Email**: Usually within 24 hours
- **LinkedIn**: Within 2-3 business days
- **GitHub Issues**: Weekly review and response

## 🤝 Contributing

We welcome contributions to improve the trading dashboard! Here's how you can help:

### Ways to Contribute
1. **Bug Fixes**: Report and fix issues
2. **Feature Enhancements**: Add new functionality
3. **Documentation**: Improve README and code comments
4. **Testing**: Add test cases and improve reliability
5. **UI/UX**: Enhance user interface and experience

### Development Setup
```bash
# Fork the repository
git clone https://github.com/YourUsername/trading-dashboard.git

# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git commit -m "feat: add your feature description"

# Push and create pull request
git push origin feature/your-feature-name
```

### Code Style Guidelines
- **Python**: Follow PEP8 standards
- **JavaScript**: Use ES6+ features and descriptive naming
- **Commits**: Use conventional commit messages (feat:, fix:, docs:, etc.)
- **Documentation**: Update README for API or architecture changes

## 📄 License & Disclaimer

### Important Disclaimer
⚠️ **This is a PAPER TRADING system for educational purposes only.**

- **No Real Money**: All trading is simulated - no actual financial transactions occur
- **Educational Use**: Designed for learning and skill development
- **Market Data**: Uses delayed and potentially incomplete market data
- **Not Financial Advice**: This system does not provide investment advice
- **Risk Warning**: Real trading involves substantial risk of loss

### Usage License
This project is open source and available for educational and personal use. 

### Data Sources
- **Market Data**: Yahoo Finance (subject to their terms of service)
- **News Data**: Various financial news sources
- **Technical Analysis**: Computed using open-source libraries

## 🗺️ Roadmap & Future Enhancements

### Short Term (Q1 2025)
- [ ] **Mobile App**: Native iOS/Android applications
- [ ] **Advanced Charting**: More technical indicators and chart types
- [ ] **Strategy Backtesting**: Historical strategy testing framework
- [ ] **Social Features**: Share portfolios and trading ideas
- [ ] **Paper Trading Competitions**: Leaderboards and challenges

### Medium Term (Q2-Q3 2025)
- [ ] **Options Trading Simulation**: Paper options trading capabilities
- [ ] **Cryptocurrency Support**: Bitcoin, Ethereum, and major cryptocurrencies
- [ ] **Machine Learning**: AI-powered trading signal generation
- [ ] **Advanced Analytics**: Risk metrics, Sharpe ratios, advanced portfolio analytics
- [ ] **Multi-language Support**: Internationalization and localization

### Long Term (Q4 2025+)
- [ ] **Virtual Trading Academy**: Structured learning modules and tutorials
- [ ] **API Marketplace**: Integration with third-party trading tools
- [ ] **Institutional Features**: Team accounts and advanced permissions
- [ ] **Real Broker Integration**: Transition from paper to live trading (optional)
- [ ] **Advanced Algorithms**: Quantitative trading strategy builder

## 📊 System Metrics & Performance

### Current Capabilities
- **Concurrent Users**: Supports 100+ simultaneous connections
- **Data Latency**: 5-second real-time update intervals
- **Market Coverage**: 10,000+ US stocks, 3,000+ Indian stocks
- **Historical Data**: Up to 10 years of historical data
- **Uptime Target**: 99.9% availability
- **Response Time**: <200ms API response times

### Scalability Features
- **Horizontal Scaling**: WebSocket clustering support
- **Database Optimization**: Indexed queries and efficient schemas
- **Caching Layer**: Multi-level caching for performance
- **Rate Limiting**: Protection against API abuse
- **Error Handling**: Graceful degradation and recovery

---

## 🙏 Acknowledgments

Special thanks to:
- **Yahoo Finance** for providing market data APIs
- **Chart.js Community** for excellent charting library
- **Flask Community** for the robust web framework
- **Open Source Contributors** who make projects like this possible

---

<div align="center">

**Made with ❤️ by Yash Agarwal**

⭐ **Star this repository if it helped you learn about trading and financial markets!** ⭐

[📧 Email](mailto:agayash23@gmail.com) • [💼 LinkedIn](https://www.linkedin.com/in/yash-agarwal-73603924b) • [🐱 GitHub](https://github.com/YashAgarwalgit)

</div>
