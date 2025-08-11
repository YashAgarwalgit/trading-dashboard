"""
Technical Indicators Service - Clean Implementation
Optimized microservice for technical analysis with zero conflicts
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import yfinance as yf
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class TechnicalIndicatorsService:
    """Advanced technical indicators calculator with caching and error handling"""
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes cache
        
        # Supported indices mapping
        self.indices_map = {
            'NIFTY50': '^NSEI',
            'BANKNIFTY': '^NSEBANK',
            'S&P500': '^GSPC',
            'NASDAQ': '^IXIC',
            'DOW': '^DJI',
            'FTSE': '^FTSE',
            'NIKKEI': '^N225',
            'USDINR': 'USDINR=X',
            'EURUSD': 'EURUSD=X',
            'GBPUSD': 'GBPUSD=X'
        }
        
        # Period mapping
        self.period_map = {
            '1H': '1d',    # 1 hour data from 1 day
            '3H': '5d',    # 3 hour data from 5 days
            '6H': '5d',    # 6 hour data from 5 days
            '1D': '1mo',   # 1 day data from 1 month
            '3D': '3mo',   # 3 day data from 3 months
            '5D': '3mo',   # 5 day data from 3 months
            '1M': '6mo',   # 1 month data from 6 months
            '3M': '1y',    # 3 month data from 1 year
            '6M': '2y',    # 6 month data from 2 years
            '1Y': '5y',    # 1 year data from 5 years
            '3Y': '10y'    # 3 year data from 10 years
        }
        
        # Interval mapping
        self.interval_map = {
            '1H': '1h',
            '3H': '1h',
            '6H': '1h',
            '1D': '1d',
            '3D': '1d',
            '5D': '1d',
            '1M': '1wk',
            '3M': '1mo',
            '6M': '1mo',
            '1Y': '3mo',
            '3Y': '3mo'
        }
        
        logger.info("Technical Indicators Service initialized")

    def get_cache_key(self, symbol: str, period: str) -> str:
        """Generate cache key for symbol and period"""
        return f"{symbol}_{period}_{datetime.now().strftime('%Y%m%d_%H%M')}"

    def is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid"""
        if cache_key not in self.cache:
            return False
        
        cache_time = self.cache[cache_key].get('timestamp', 0)
        return (datetime.now().timestamp() - cache_time) < self.cache_ttl

    def resolve_symbol(self, symbol: str) -> str:
        """Resolve symbol to yfinance format"""
        symbol = symbol.upper().strip()
        
        # Check indices mapping first
        if symbol in self.indices_map:
            return self.indices_map[symbol]
        
        # Handle Indian stocks
        indian_stocks = [
            'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'HINDUNILVR',
            'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
            'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
            'NESTLEIND', 'HDFC', 'BAJFINANCE', 'WIPRO', 'M&M',
            'ULTRACEMCO', 'TATASTEEL', 'BAJAJFINSV', 'TECHM', 'POWERGRID'
        ]
        
        if symbol in indian_stocks:
            return f"{symbol}.NS"
        
        # US stocks - return as is
        return symbol

    def fetch_stock_data(self, symbol: str, period: str) -> Optional[pd.DataFrame]:
        """Fetch stock data using yfinance with error handling"""
        try:
            resolved_symbol = self.resolve_symbol(symbol)
            yf_period = self.period_map.get(period, '1mo')
            interval = self.interval_map.get(period, '1d')
            
            logger.info(f"Fetching data for {resolved_symbol}, period: {yf_period}, interval: {interval}")
            
            ticker = yf.Ticker(resolved_symbol)
            data = ticker.history(period=yf_period, interval=interval)
            
            if data.empty:
                logger.warning(f"No data found for {resolved_symbol}")
                return None
                
            # Clean data
            data = data.dropna()
            
            if len(data) < 10:
                logger.warning(f"Insufficient data for {resolved_symbol} ({len(data)} records)")
                return None
                
            logger.info(f"Successfully fetched {len(data)} records for {resolved_symbol}")
            return data
            
        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {str(e)}")
            return None

    def calculate_sma(self, data: pd.DataFrame, window: int = 20) -> float:
        """Calculate Simple Moving Average"""
        try:
            if len(data) < window:
                return 0.0
            return float(data['Close'].rolling(window=window).mean().iloc[-1])
        except:
            return 0.0

    def calculate_ema(self, data: pd.DataFrame, span: int = 20) -> float:
        """Calculate Exponential Moving Average"""
        try:
            if len(data) < span:
                return 0.0
            return float(data['Close'].ewm(span=span).mean().iloc[-1])
        except:
            return 0.0

    def calculate_rsi(self, data: pd.DataFrame, window: int = 14) -> float:
        """Calculate Relative Strength Index"""
        try:
            if len(data) < window + 1:
                return 50.0
                
            delta = data['Close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
            
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            
            return float(rsi.iloc[-1])
        except:
            return 50.0

    def calculate_macd(self, data: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, float]:
        """Calculate MACD (Moving Average Convergence Divergence)"""
        try:
            if len(data) < slow:
                return {'line': 0.0, 'signal': 0.0, 'histogram': 0.0}
                
            ema_fast = data['Close'].ewm(span=fast).mean()
            ema_slow = data['Close'].ewm(span=slow).mean()
            
            macd_line = ema_fast - ema_slow
            macd_signal = macd_line.ewm(span=signal).mean()
            macd_histogram = macd_line - macd_signal
            
            return {
                'line': float(macd_line.iloc[-1]),
                'signal': float(macd_signal.iloc[-1]),
                'histogram': float(macd_histogram.iloc[-1])
            }
        except:
            return {'line': 0.0, 'signal': 0.0, 'histogram': 0.0}

    def calculate_bollinger_bands(self, data: pd.DataFrame, window: int = 20, std_dev: float = 2.0) -> Dict[str, float]:
        """Calculate Bollinger Bands"""
        try:
            if len(data) < window:
                current_price = float(data['Close'].iloc[-1]) if len(data) > 0 else 0.0
                return {'upper': current_price, 'middle': current_price, 'lower': current_price}
                
            rolling_mean = data['Close'].rolling(window=window).mean()
            rolling_std = data['Close'].rolling(window=window).std()
            
            upper_band = rolling_mean + (rolling_std * std_dev)
            lower_band = rolling_mean - (rolling_std * std_dev)
            
            return {
                'upper': float(upper_band.iloc[-1]),
                'middle': float(rolling_mean.iloc[-1]),
                'lower': float(lower_band.iloc[-1])
            }
        except:
            current_price = float(data['Close'].iloc[-1]) if len(data) > 0 else 0.0
            return {'upper': current_price, 'middle': current_price, 'lower': current_price}

    def calculate_volume_analysis(self, data: pd.DataFrame, window: int = 20) -> Dict[str, float]:
        """Calculate volume indicators"""
        try:
            if len(data) < window or 'Volume' not in data.columns:
                return {'volume_avg': 0.0, 'current_volume': 0.0, 'volume_ratio': 1.0}
                
            volume_avg = data['Volume'].rolling(window=window).mean().iloc[-1]
            current_volume = data['Volume'].iloc[-1]
            volume_ratio = current_volume / volume_avg if volume_avg > 0 else 1.0
            
            return {
                'volume_avg': float(volume_avg),
                'current_volume': float(current_volume),
                'volume_ratio': float(volume_ratio)
            }
        except:
            return {'volume_avg': 0.0, 'current_volume': 0.0, 'volume_ratio': 1.0}

    def calculate_all_indicators(self, symbol: str, period: str) -> Optional[Dict[str, Any]]:
        """Calculate all technical indicators for a symbol"""
        cache_key = self.get_cache_key(symbol, period)
        
        # Check cache first
        if self.is_cache_valid(cache_key):
            logger.info(f"Returning cached data for {symbol} ({period})")
            return self.cache[cache_key]['data']
        
        # Fetch fresh data
        data = self.fetch_stock_data(symbol, period)
        if data is None:
            return None
        
        try:
            # Calculate all indicators
            indicators = {
                'sma_20': self.calculate_sma(data, 20),
                'sma_50': self.calculate_sma(data, 50),
                'ema_20': self.calculate_ema(data, 20),
                'ema_50': self.calculate_ema(data, 50),
                'rsi': self.calculate_rsi(data),
                'macd': self.calculate_macd(data),
                'bollinger': self.calculate_bollinger_bands(data),
                'volume': self.calculate_volume_analysis(data)
            }
            
            # Prepare historical data (last 50 points for charts)
            historical_data = []
            chart_data = data.tail(50)
            
            for index, row in chart_data.iterrows():
                historical_data.append({
                    'timestamp': index.isoformat(),
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close']),
                    'volume': float(row.get('Volume', 0))
                })
            
            result = {
                'symbol': symbol,
                'resolved_symbol': self.resolve_symbol(symbol),
                'period': period,
                'indicators': indicators,
                'data': historical_data,
                'last_updated': datetime.now().isoformat(),
                'data_points': len(data)
            }
            
            # Cache the result
            self.cache[cache_key] = {
                'data': result,
                'timestamp': datetime.now().timestamp()
            }
            
            logger.info(f"Calculated indicators for {symbol} ({period})")
            return result
            
        except Exception as e:
            logger.error(f"Error calculating indicators for {symbol}: {str(e)}")
            return None

# Initialize service
technical_service = TechnicalIndicatorsService()

@app.route('/api/technical/indicators', methods=['POST'])
def get_technical_indicators():
    """Get technical indicators for a symbol and period"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        ticker = data.get('ticker', '').strip()
        period = data.get('period', '1D')
        
        if not ticker:
            return jsonify({'error': 'Ticker symbol is required'}), 400
        
        if period not in technical_service.period_map:
            return jsonify({'error': f'Invalid period. Supported: {list(technical_service.period_map.keys())}'}), 400
        
        result = technical_service.calculate_all_indicators(ticker, period)
        
        if result is None:
            return jsonify({'error': f'No data available for {ticker}'}), 404
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in get_technical_indicators: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/technical/supported', methods=['GET'])
def get_supported_symbols():
    """Get supported indices and sample stock symbols"""
    try:
        # Sample popular stocks for suggestions
        popular_stocks = {
            'Indian Stocks': [
                'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'HINDUNILVR',
                'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
                'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA'
            ],
            'US Stocks': [
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
                'META', 'NVDA', 'NFLX', 'AMD', 'CRM',
                'UBER', 'ZOOM', 'PYPL', 'SQ', 'SHOP'
            ],
            'Indices': list(technical_service.indices_map.keys()),
            'Periods': list(technical_service.period_map.keys())
        }
        
        return jsonify({
            'supported_symbols': popular_stocks,
            'periods': {period: f"{period} timeframe" for period in technical_service.period_map.keys()},
            'total_symbols': sum(len(stocks) for stocks in popular_stocks.values() if isinstance(stocks, list))
        })
        
    except Exception as e:
        logger.error(f"Error in get_supported_symbols: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/technical/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        cache_size = len(technical_service.cache)
        return jsonify({
            'status': 'healthy',
            'service': 'Technical Indicators Service',
            'version': '2.0.0',
            'cache_size': cache_size,
            'supported_periods': len(technical_service.period_map),
            'supported_indices': len(technical_service.indices_map),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

@app.route('/api/technical/cache/clear', methods=['POST'])
def clear_cache():
    """Clear all cached data"""
    try:
        cache_size_before = len(technical_service.cache)
        technical_service.cache.clear()
        
        return jsonify({
            'message': 'Cache cleared successfully',
            'items_removed': cache_size_before,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        return jsonify({'error': 'Failed to clear cache'}), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

@app.after_request
def after_request(response):
    """Add headers to all responses"""
    response.headers.add('X-Service', 'Technical-Indicators-Service')
    response.headers.add('X-Version', '2.0.0')
    return response

if __name__ == '__main__':
    logger.info("Starting Technical Indicators Service...")
    logger.info(f"Supported periods: {list(technical_service.period_map.keys())}")
    logger.info(f"Supported indices: {list(technical_service.indices_map.keys())}")
    
    # Run on different port to avoid conflicts with main service
    app.run(
        host='0.0.0.0',
        port=5001,  # Different port
        debug=False,
        threaded=True
    )
