import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import threading
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from werkzeug.exceptions import BadRequest
import re
import sqlite3
import json
from contextlib import contextmanager
import os
import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from market_metrics_enhanced import compute_enhanced_market_overview

class RateLimiter:
    def __init__(self, max_calls=200, window_seconds=60):  # Increased from 100 to 200
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self.calls = deque()
        self._lock = threading.Lock()
    
    def can_make_call(self):
        now = time.time()
        with self._lock:
            # Remove old calls outside the window
            while self.calls and self.calls[0] <= now - self.window_seconds:
                self.calls.popleft()
            
            if len(self.calls) < self.max_calls:
                self.calls.append(now)
                return True
            return False

class StockDataService:
    def __init__(self):
        self.active_tickers = {}
        # Enhanced caching with timestamps and TTL
        self.price_cache = {}
        self.cache_ttl = 30  # 30 seconds cache TTL
        self.rate_limiter = RateLimiter(max_calls=200, window_seconds=60)  # Increased rate limit
        self._ticker_resolution_cache = {}
        self._search_resolution_cache = {}
        self.executor = ThreadPoolExecutor(max_workers=8)  # Thread pool for parallel requests
        
    def _is_cache_valid(self, ticker):
        """Check if cached data is still valid based on TTL"""
        if ticker not in self.price_cache:
            return False
        
        cached_time = self.price_cache[ticker].get('timestamp')
        if not cached_time:
            return False
            
        return (time.time() - cached_time) < self.cache_ttl
    
    def _get_cached_data(self, ticker):
        """Retrieve cached data if valid"""
        if self._is_cache_valid(ticker):
            return self.price_cache[ticker]['data']
        return None
    
    def _cache_data(self, ticker, data):
        """Store data in cache with timestamp"""
        self.price_cache[ticker] = {
            'data': data,
            'timestamp': time.time()
        }
    
    def cleanup_expired_cache(self):
        """Remove expired cache entries to prevent memory bloat"""
        current_time = time.time()
        expired_keys = [
            ticker for ticker, cache_entry in self.price_cache.items()
            if (current_time - cache_entry.get('timestamp', 0)) > self.cache_ttl
        ]
        for key in expired_keys:
            del self.price_cache[key]
        
    def format_indian_ticker(self, ticker):
        """Optimized ticker resolution with enhanced caching and reduced API calls"""
        t = ticker.upper().strip()

        # If explicit market suffix is provided, use as-is
        if t.endswith('.NS') or t.endswith('.BO'):
            return t

        # Use cached resolution if available
        if t in self._ticker_resolution_cache:
            return self._ticker_resolution_cache[t]

        # Try NSE first (most common), then raw, then BSE - optimized order
        candidates = [f"{t}.NS", t, f"{t}.BO"]
        for cand in candidates:
            if not self.rate_limiter.can_make_call():
                break
            try:
                # Use minimal data fetch for faster validation
                hist = yf.Ticker(cand).history(period="1d", interval="1d", auto_adjust=False, prepost=False)
                if not hist.empty and len(hist) > 0:
                    self._ticker_resolution_cache[t] = cand
                    return cand
            except Exception:
                # Ignore and try next candidate
                continue

        # If none resolved, cache and return the original (will surface error upstream)
        self._ticker_resolution_cache[t] = t
        return t
    
    def get_stock_data(self, ticker, period="1d", interval="1m"):
        # Check cache first
        cached_data = self._get_cached_data(ticker)
        if cached_data:
            return cached_data
            
        if not self.rate_limiter.can_make_call():
            return {
                "error": "Rate limit exceeded. Please try again later.",
                "error_type": "RATE_LIMIT"
            }
        try:
            formatted_ticker = self.format_indian_ticker(ticker)
            stock = yf.Ticker(formatted_ticker)
            
            # Get basic info with error handling
            try:
                info = stock.info
            except Exception:
                info = {}
            
            # Get historical data with optimized parameters for speed
            hist_data = stock.history(period="1d", interval="1m", prepost=False, auto_adjust=True, back_adjust=False)
            
            if hist_data.empty:
                error_result = {
                    "error": f"No data found for ticker '{ticker}'. Please check the symbol and try again.",
                    "error_type": "NO_DATA"
                }
                # Cache error for short time to prevent repeated failed calls
                self._cache_data(ticker, error_result)
                return error_result
            
            # Get current price
            current_price = hist_data['Close'].iloc[-1]
            prev_close = info.get('previousClose', hist_data['Close'].iloc[-2] if len(hist_data) > 1 else current_price)
            
            # Calculate change
            price_change = current_price - prev_close
            percent_change = (price_change / prev_close) * 100 if prev_close != 0 else 0
            
            result = {
                "symbol": ticker,
                "formatted_symbol": formatted_ticker,
                "current_price": float(current_price),
                "previous_close": float(prev_close),
                "change": float(price_change),
                "change_percent": float(percent_change),
                "volume": 0 if pd.isna(hist_data['Volume'].iloc[-1]) or hist_data['Volume'].iloc[-1] <= 0 else int(hist_data['Volume'].iloc[-1]),
                "market_cap": info.get('marketCap', 'N/A'),
                "pe_ratio": info.get('trailingPE', 'N/A'),
                "day_high": float(hist_data['High'].iloc[-1]),
                "day_low": float(hist_data['Low'].iloc[-1]),
                "last_updated": datetime.now().isoformat(),
                "currency": info.get('currency', 'INR' if formatted_ticker.endswith(('.NS', '.BO')) else 'USD'),
                "market": "NSE" if formatted_ticker.endswith('.NS') else "BSE" if formatted_ticker.endswith('.BO') else "US",
                "status": "success"
            }
            
            # Cache successful result
            self._cache_data(ticker, result)
            return result
            
        except Exception as e:
            error_result = {
                "error": f"Failed to fetch data for '{ticker}': {str(e)}",
                "error_type": "API_ERROR"
            }
            # Cache error for short time
            self._cache_data(ticker, error_result)
            return error_result
    
    def get_historical_data(self, ticker, period="1mo"):
        """Get historical price data for charts"""
        try:
            formatted_ticker = self.format_indian_ticker(ticker)
            stock = yf.Ticker(formatted_ticker)
            hist_data = stock.history(period=period)
            
            if hist_data.empty:
                return {"error": f"No historical data found for {ticker}"}
            
            # Format data for frontend charts
            chart_data = []
            for date, row in hist_data.iterrows():
                chart_data.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": 0 if pd.isna(row['Volume']) or row['Volume'] <= 0 else int(row['Volume'])
                })
            
            return {
                "symbol": ticker,
                "data": chart_data
            }
            
        except Exception as e:
            return {"error": str(e)}
        
class PortfolioManager:
    def __init__(self):
        # Ensure data directory exists
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Initialize storage
        self.portfolios = {}  # In-memory cache
        self.db_path = os.path.join(self.data_dir, 'trading_platform.db')
        self.portfolio_counter = 1
        
        # Initialize database and load existing data
        self.init_database()
        self.load_portfolios_from_db()
        
        print(f"📊 PortfolioManager initialized with {len(self.portfolios)} existing portfolios")
    
    def init_database(self):
        """Initialize SQLite database for persistence"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA foreign_keys = ON;')
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS portfolios (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        capital REAL NOT NULL,
                        available_cash REAL NOT NULL,
                        description TEXT DEFAULT '',
                        positions TEXT DEFAULT '{}',
                        created_date TEXT NOT NULL,
                        last_updated TEXT NOT NULL
                    )
                ''')
                
                # Create positions tracking table
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS portfolio_positions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        portfolio_id TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        avg_price REAL NOT NULL,
                        total_cost REAL NOT NULL,
                        purchase_date TEXT NOT NULL,
                        FOREIGN KEY (portfolio_id) REFERENCES portfolios (id),
                        UNIQUE(portfolio_id, symbol)
                    )
                ''')
                
                # Create transactions table
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS portfolio_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        portfolio_id TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        transaction_type TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        price REAL NOT NULL,
                        total_value REAL NOT NULL,
                        timestamp TEXT NOT NULL,
                        FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
                    )
                ''')
                
                conn.commit()
                print(f"✅ Enhanced database initialized: {self.db_path}")
                
        except Exception as e:
            print(f"❌ Database initialization failed: {e}")
    
    def load_portfolios_from_db(self):
        """Load existing portfolios from database into memory with error handling"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('SELECT * FROM portfolios ORDER BY created_date DESC')
                rows = cursor.fetchall()
                
                loaded_count = 0
                for row_index, row in enumerate(rows):
                    try:
                        # Validate and convert numeric fields with error handling
                        capital_value = self._safe_float_conversion(row[2], f"capital in row {row_index}")
                        available_cash_value = self._safe_float_conversion(
                            row[3] if len(row) > 3 else row[2], 
                            f"available_cash in row {row_index}"
                        )
                        
                        portfolio_data = {
                            'id': row[0],
                            'name': row[1],
                            'capital': capital_value,
                            'available_cash': available_cash_value,
                            'description': row[4] if len(row) > 4 else '',
                            'positions': json.loads(row[5]) if len(row) > 5 and row[5] else {},
                            'created_date': row[6] if len(row) > 6 else '',
                            'last_updated': row[7] if len(row) > 7 else ''
                        }
                        
                        self.portfolios[row[0]] = portfolio_data
                        loaded_count += 1
                        
                    except Exception as row_error:
                        print(f"⚠️  Skipping corrupted portfolio row {row_index}: {row_error}")
                        print(f"   Raw data: {row}")
                        continue
                
                # Update counter to avoid ID conflicts
                if self.portfolios:
                    max_id = max([int(pid.split('_')[1]) for pid in self.portfolios.keys() 
                                if pid.startswith('portfolio_')], default=0)
                    self.portfolio_counter = max_id + 1
                
                print(f"📁 Successfully loaded {loaded_count} portfolios from database")
                if loaded_count != len(rows):
                    print(f"⚠️  Skipped {len(rows) - loaded_count} corrupted portfolio records")
                
        except Exception as e:
            print(f"❌ Database load error: {e}")
            print("🔄 Starting with empty portfolio system")

    def _safe_float_conversion(self, value, field_name):
        """Safely convert value to float with detailed error reporting"""
        try:
            # Handle None or empty values
            if value is None or value == '':
                print(f"⚠️  Warning: {field_name} is empty, defaulting to 0.0")
                return 0.0
            
            # Try direct conversion
            return float(value)
            
        except (ValueError, TypeError) as e:
            print(f"❌ Invalid {field_name}: '{value}' cannot be converted to float")
            print(f"   Error: {e}")
            
            # Ask user for default action
            print(f"   Using default value 0.0 for {field_name}")
            return 0.0

    def create_portfolio(self, name, capital, description=""):
        """Create and persist a new portfolio with validation"""
        try:
            # Enhanced input validation
            if not name or not isinstance(name, str) or not name.strip():
                raise ValueError("Portfolio name must be a non-empty string")
            
            # Validate capital as numeric
            try:
                capital_float = float(capital)
                if capital_float <= 0:
                    raise ValueError("Capital must be a positive number")
            except (ValueError, TypeError):
                raise ValueError(f"Capital '{capital}' is not a valid number")
            
            # Validate description
            if description is None:
                description = ""
            
            portfolio_id = f"portfolio_{self.portfolio_counter}"
            current_time = datetime.now().isoformat()
            
            portfolio_data = {
                'id': portfolio_id,
                'name': str(name).strip(),
                'capital': capital_float,
                'available_cash': capital_float,
                'description': str(description).strip(),
                'positions': {},
                'created_date': current_time,
                'last_updated': current_time
            }
            
            # Save to database with proper parameter binding
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    INSERT INTO portfolios (id, name, capital, available_cash, description, positions, created_date, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    portfolio_id,
                    portfolio_data['name'],
                    portfolio_data['capital'],
                    portfolio_data['available_cash'],
                    portfolio_data['description'],
                    json.dumps(portfolio_data['positions']),
                    portfolio_data['created_date'],
                    portfolio_data['last_updated']
                ))
                conn.commit()
            
            # Save to memory cache
            self.portfolios[portfolio_id] = portfolio_data
            self.portfolio_counter += 1
            
            print(f"✅ Portfolio created and validated: {name} (ID: {portfolio_id})")
            return portfolio_data
            
        except Exception as e:
            print(f"❌ Failed to create portfolio '{name}': {e}")
            raise Exception(f"Portfolio creation failed: {str(e)}")
    
    def buy_stock(self, portfolio_id, symbol, quantity, price):
        """Buy stock for a portfolio"""
        try:
            if portfolio_id not in self.portfolios:
                raise Exception(f"Portfolio {portfolio_id} not found")
            
            portfolio = self.portfolios[portfolio_id]
            total_cost = quantity * price
            
            # Check if enough cash available
            if portfolio['available_cash'] < total_cost:
                raise Exception(f"Insufficient funds. Available: ${portfolio['available_cash']:.2f}, Required: ${total_cost:.2f}")
            
            # Update portfolio in memory
            if symbol in portfolio['positions']:
                # Update existing position
                existing = portfolio['positions'][symbol]
                total_quantity = existing['quantity'] + quantity
                total_invested = existing['total_cost'] + total_cost
                avg_price = total_invested / total_quantity
                
                portfolio['positions'][symbol] = {
                    'quantity': total_quantity,
                    'avg_price': avg_price,
                    'total_cost': total_invested,
                    'current_price': price,
                    'last_updated': datetime.now().isoformat()
                }
            else:
                # New position
                portfolio['positions'][symbol] = {
                    'quantity': quantity,
                    'avg_price': price,
                    'total_cost': total_cost,
                    'current_price': price,
                    'last_updated': datetime.now().isoformat()
                }
            
            # Update available cash
            portfolio['available_cash'] -= total_cost
            portfolio['last_updated'] = datetime.now().isoformat()
            
            # Save to database
            with sqlite3.connect(self.db_path) as conn:
                # Update portfolio
                conn.execute('''
                    UPDATE portfolios 
                    SET positions=?, available_cash=?, last_updated=?
                    WHERE id=?
                ''', (
                    json.dumps(portfolio['positions']),
                    portfolio['available_cash'],
                    portfolio['last_updated'],
                    portfolio_id
                ))
                
                # Record transaction
                conn.execute('''
                    INSERT INTO portfolio_transactions 
                    (portfolio_id, symbol, transaction_type, quantity, price, total_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    portfolio_id, symbol, 'BUY', quantity, price, total_cost, datetime.now().isoformat()
                ))
                
                conn.commit()
            
            print(f"✅ Bought {quantity} shares of {symbol} at ${price} for portfolio {portfolio['name']}")
            return portfolio
            
        except Exception as e:
            print(f"❌ Failed to buy stock {symbol}: {e}")
            raise Exception(str(e))
    
    def sell_stock(self, portfolio_id, symbol, quantity, price):
        """Sell stock from a portfolio"""
        try:
            if portfolio_id not in self.portfolios:
                raise Exception(f"Portfolio {portfolio_id} not found")
            
            portfolio = self.portfolios[portfolio_id]
            
            if symbol not in portfolio['positions']:
                raise Exception(f"No position found for {symbol}")
            
            position = portfolio['positions'][symbol]
            
            if position['quantity'] < quantity:
                raise Exception(f"Insufficient shares. Available: {position['quantity']}, Requested: {quantity}")
            
            total_proceeds = quantity * price
            
            # Update position
            if position['quantity'] == quantity:
                # Selling entire position
                del portfolio['positions'][symbol]
            else:
                # Partial sale
                position['quantity'] -= quantity
                position['total_cost'] = position['avg_price'] * position['quantity']
                position['last_updated'] = datetime.now().isoformat()
            
            # Update available cash
            portfolio['available_cash'] += total_proceeds
            portfolio['last_updated'] = datetime.now().isoformat()
            
            # Save to database
            with sqlite3.connect(self.db_path) as conn:
                # Update portfolio
                conn.execute('''
                    UPDATE portfolios 
                    SET positions=?, available_cash=?, last_updated=?
                    WHERE id=?
                ''', (
                    json.dumps(portfolio['positions']),
                    portfolio['available_cash'],
                    portfolio['last_updated'],
                    portfolio_id
                ))
                
                # Record transaction
                conn.execute('''
                    INSERT INTO portfolio_transactions 
                    (portfolio_id, symbol, transaction_type, quantity, price, total_value, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    portfolio_id, symbol, 'SELL', quantity, price, total_proceeds, datetime.now().isoformat()
                ))
                
                conn.commit()
            
            print(f"✅ Sold {quantity} shares of {symbol} at ${price} from portfolio {portfolio['name']}")
            return portfolio
            
        except Exception as e:
            print(f"❌ Failed to sell stock {symbol}: {e}")
            raise Exception(str(e))
    
    def get_portfolio_value(self, portfolio_id, current_prices=None):
        """Calculate current portfolio value"""
        try:
            if portfolio_id not in self.portfolios:
                return None
            
            portfolio = self.portfolios[portfolio_id]
            total_value = portfolio['available_cash']
            
            for symbol, position in portfolio['positions'].items():
                if current_prices and symbol in current_prices:
                    current_price = current_prices[symbol]
                else:
                    current_price = position.get('current_price', position['avg_price'])
                
                total_value += position['quantity'] * current_price
            
            return {
                'total_value': total_value,
                'available_cash': portfolio['available_cash'],
                'invested_value': total_value - portfolio['available_cash'],
                'initial_capital': portfolio['capital'],
                'total_pnl': total_value - portfolio['capital'],
                'total_pnl_percent': ((total_value - portfolio['capital']) / portfolio['capital']) * 100
            }
            
        except Exception as e:
            print(f"❌ Failed to calculate portfolio value: {e}")
            return None
    
    def get_all_portfolios(self):
        return list(self.portfolios.values())
    
    def get_portfolio(self, portfolio_id):
        return self.portfolios.get(portfolio_id)
    
    def get_portfolio_transactions(self, portfolio_id):
        """Get transaction history for a portfolio"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('''
                    SELECT * FROM portfolio_transactions 
                    WHERE portfolio_id=? 
                    ORDER BY timestamp DESC
                ''', (portfolio_id,))
                
                transactions = []
                for row in cursor.fetchall():
                    transactions.append({
                        'id': row[0],
                        'portfolio_id': row[1],
                        'symbol': row[2],
                        'transaction_type': row[3],
                        'quantity': row[4],
                        'price': row[5],
                        'total_value': row[6],
                        'timestamp': row[7]
                    })
                
                return transactions
                
        except Exception as e:
            print(f"❌ Failed to get transactions: {e}")
            return []

    # Portfolio Delete Functionality
    # Add these methods to the PortfolioManager class in stock_service.py

    def delete_portfolio(self, portfolio_id):
        """Delete a portfolio and all its associated data"""
        try:
            if portfolio_id not in self.portfolios:
                raise Exception(f"Portfolio {portfolio_id} not found")
            
            portfolio = self.portfolios[portfolio_id]
            portfolio_name = portfolio['name']
            
            # Delete from database
            with sqlite3.connect(self.db_path) as conn:
                # Delete transactions first (foreign key constraint)
                conn.execute('DELETE FROM portfolio_transactions WHERE portfolio_id = ?', (portfolio_id,))
                
                # Delete positions (if you have a separate positions table)
                # conn.execute('DELETE FROM portfolio_positions WHERE portfolio_id = ?', (portfolio_id,))
                
                # Delete the portfolio
                conn.execute('DELETE FROM portfolios WHERE id = ?', (portfolio_id,))
                
                conn.commit()
            
            # Remove from memory cache
            del self.portfolios[portfolio_id]
            
            print(f"✅ Portfolio '{portfolio_name}' (ID: {portfolio_id}) deleted successfully")
            return True
            
        except Exception as e:
            print(f"❌ Failed to delete portfolio {portfolio_id}: {e}")
            raise Exception(f"Portfolio deletion failed: {str(e)}")
        
    def repair_database(self):
        """Repair corrupted database entries"""
        print("🔧 Starting database repair...")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get all portfolios to check for corruption
                cursor = conn.execute('SELECT rowid, * FROM portfolios')
                all_rows = cursor.fetchall()
                
                repaired_count = 0
                deleted_count = 0
                
                for row in all_rows:
                    rowid = row[0]
                    portfolio_data = row[1:]  # Skip rowid
                    
                    try:
                        # Check if capital and available_cash can be converted
                        capital = float(portfolio_data[2])  # capital column
                        available_cash = float(portfolio_data[3]) if len(portfolio_data) > 3 else capital
                        
                        # If we get here, the data is valid
                        continue
                        
                    except ValueError as e:
                        print(f"⚠️  Found corrupted row {rowid}: {e}")
                        print(f"   Data: {portfolio_data}")
                        
                        # Try to repair or delete
                        name = portfolio_data[1]
                        if name and isinstance(name, str):
                            # Try to repair with default values
                            print(f"   Repairing portfolio '{name}' with default capital of $10000")
                            
                            conn.execute('''
                                UPDATE portfolios 
                                SET capital = ?, available_cash = ?
                                WHERE rowid = ?
                            ''', (10000.0, 10000.0, rowid))
                            repaired_count += 1
                        else:
                            # Delete completely corrupted entries
                            print(f"   Deleting completely corrupted row {rowid}")
                            conn.execute('DELETE FROM portfolios WHERE rowid = ?', (rowid,))
                            deleted_count += 1
                
                conn.commit()
                print(f"✅ Database repair completed:")
                print(f"   - Repaired: {repaired_count} portfolios")
                print(f"   - Deleted: {deleted_count} corrupted entries")
                
        except Exception as e:
            print(f"❌ Database repair failed: {e}")

    def check_database_integrity(self):
        """Check database for potential issues"""
        print("🔍 Checking database integrity...")
        
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('SELECT rowid, id, name, capital, available_cash FROM portfolios')
                rows = cursor.fetchall()
                
                issues = []
                for row in rows:
                    rowid, pid, name, capital, available_cash = row
                    
                    # Check for non-numeric values
                    try:
                        float(capital)
                    except (ValueError, TypeError):
                        issues.append(f"Row {rowid}: Invalid capital '{capital}'")
                    
                    try:
                        float(available_cash)
                    except (ValueError, TypeError):
                        issues.append(f"Row {rowid}: Invalid available_cash '{available_cash}'")
                    
                    # Check for empty names
                    if not name or not isinstance(name, str) or not name.strip():
                        issues.append(f"Row {rowid}: Invalid name '{name}'")
                
                if issues:
                    print(f"⚠️  Found {len(issues)} integrity issues:")
                    for issue in issues:
                        print(f"   {issue}")
                    return False
                else:
                    print("✅ Database integrity check passed")
                    return True
                    
        except Exception as e:
            print(f"❌ Integrity check failed: {e}")
            return False

# Initialize the enhanced portfolio manager
portfolio_manager = PortfolioManager()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
# Performance optimizations
app.config['JSON_SORT_KEYS'] = False  # Faster JSON serialization
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False  # Reduce response size
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', 
                   engineio_logger=False, socketio_logger=False)  # Disable verbose logging

stock_service = StockDataService()

# --- Technical Indicators (Unified into main backend) ---
TECH_INDICES = {
    'NIFTY50': '^NSEI',
    'S&P 500': '^GSPC',
    'S&P500': '^GSPC',  # Alias
    'SP500': '^GSPC',   # Alias
    'USD/INR': 'USDINR=X',
    'USDINR': 'USDINR=X',  # Alias
    'BANKNIFTY': '^NSEBANK'
}

TECH_PERIODS = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '3Y': '3y'
}

def _compute_indicators_from_chart(chart_rows, max_points=400):
    """Compute latest + series technical indicators from chart data rows.
    Returns {'latest': {...}, 'series': {...}}
    """
    out = {'latest': {}, 'series': {}}
    try:
        if not chart_rows:
            return out
        df = pd.DataFrame(chart_rows)
        df['close'] = pd.to_numeric(df['close'], errors='coerce')
        if df['close'].isna().all():
            return out
        # Order by date just in case
        if 'date' in df.columns:
            df.sort_values('date', inplace=True)
        # Core calculations
        # Short / medium / long-term moving averages (min_periods for early visibility)
        df['sma_20'] = df['close'].rolling(window=20, min_periods=2).mean()
        df['sma_50'] = df['close'].rolling(window=50, min_periods=2).mean()
        df['sma_100'] = df['close'].rolling(window=100, min_periods=2).mean()
        df['sma_200'] = df['close'].rolling(window=200, min_periods=2).mean()
        df['ema_20'] = df['close'].ewm(span=20, adjust=False).mean()
        df['ema_50'] = df['close'].ewm(span=50, adjust=False).mean()
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)
        roll_up = gain.rolling(window=14).mean()
        roll_down = loss.rolling(window=14).mean().replace(0, pd.NA)
        rs = roll_up / roll_down
        df['rsi_14'] = 100 - (100 / (1 + rs))
        returns = df['close'].pct_change()
        df['volatility'] = returns.rolling(window=20).std() * (252 ** 0.5)
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal = macd_line.ewm(span=9, adjust=False).mean()
        hist = macd_line - signal
        mavg = df['close'].rolling(window=20).mean()
        mstd = df['close'].rolling(window=20).std()
        upper = mavg + 2 * mstd
        lower = mavg - 2 * mstd

        latest = df.iloc[-1]
        # 52-week style stats (within provided data window)
        window_high = None
        window_low = None
        pct_from_high = None
        if len(df) >= 100:  # require some history
            window_high = df['close'].max()
            window_low = df['close'].min()
            try:
                pct_from_high = (latest['close'] - window_high) / window_high * 100.0 if window_high else None
            except Exception:
                pct_from_high = None

        out['latest'] = {
            'sma_20': _safe_float(latest.get('sma_20')),
            'sma_50': _safe_float(latest.get('sma_50')),
            'sma_100': _safe_float(latest.get('sma_100')),
            'sma_200': _safe_float(latest.get('sma_200')),
            'ema_20': _safe_float(latest.get('ema_20')),
            'ema_50': _safe_float(latest.get('ema_50')),
            'rsi_14': _safe_float(latest.get('rsi_14')),
            'volatility': _safe_float(latest.get('volatility')),
            'macd': _safe_float(macd_line.iloc[-1] if len(macd_line) else None),
            'macd_signal': _safe_float(signal.iloc[-1] if len(signal) else None),
            'macd_hist': _safe_float(hist.iloc[-1] if len(hist) else None),
            'bollinger_upper': _safe_float(upper.iloc[-1] if len(upper) else None),
            'bollinger_lower': _safe_float(lower.iloc[-1] if len(lower) else None),
            'close': _safe_float(latest.get('close')),
            'window_high': _safe_float(window_high),
            'window_low': _safe_float(window_low),
            'pct_from_high': _safe_float(pct_from_high)
        }

        # Trim series length for payload efficiency
        if len(df) > max_points:
            df = df.iloc[-max_points:]
            macd_line = macd_line.iloc[-max_points:]
            signal = signal.iloc[-max_points:]
            hist = hist.iloc[-max_points:]
            upper = upper.iloc[-max_points:]
            lower = lower.iloc[-max_points:]

        def _clean(series_obj):
            try:
                return [None if (pd.isna(v) or v is pd.NA) else float(v) for v in series_obj]
            except Exception:
                return []

        out['series'] = {
            'dates': df['date'].tolist() if 'date' in df.columns else list(range(len(df))),
            'close': _clean(df['close']),
            'sma_20': _clean(df['sma_20']),
            'sma_50': _clean(df['sma_50']),
            'sma_100': _clean(df['sma_100']),
            'sma_200': _clean(df['sma_200']),
            'ema_20': _clean(df['ema_20']),
            'ema_50': _clean(df['ema_50']),
            'rsi_14': _clean(df['rsi_14']),
            'bollinger_upper': _clean(upper),
            'bollinger_lower': _clean(lower),
            'macd': _clean(macd_line),
            'macd_signal': _clean(signal),
            'macd_hist': _clean(hist)
        }
        return out
    except Exception as e:
        print(f"Technical indicator computation error: {e}")
        return out

def _safe_float(v):
    try:
        if v is None or (isinstance(v, float) and (pd.isna(v))):
            return None
        return float(v)
    except Exception:
        return None

def _fetch_fundamentals(symbol):
    """Fetch a minimal set of fundamental metrics via yfinance.
    Returns simple JSON-serialisable dict; failures return {} silently.
    """
    out = {}
    try:
        t = yf.Ticker(symbol)
        info = {}
        try:
            info = t.info or {}
        except Exception:
            info = {}
        # Extract subset to keep payload lean
        fields = {
            'marketCap': 'market_cap',
            'trailingPE': 'pe',
            'forwardPE': 'forward_pe',
            'trailingEps': 'eps',
            'priceToBook': 'price_to_book',
            'dividendYield': 'dividend_yield',
            'returnOnEquity': 'roe',
            'profitMargins': 'profit_margins',
            'beta': 'beta',
        }
        for k, alias in fields.items():
            v = info.get(k)
            if isinstance(v, (int, float)) and (pd.isna(v)):
                v = None
            out[alias] = v
        # Convert dividend yield to percentage if numeric
        if isinstance(out.get('dividend_yield'), (int, float)):
            out['dividend_yield'] = round(out['dividend_yield'] * 100, 2)
        # Round some floats for brevity
        for key in ['pe', 'forward_pe', 'eps', 'price_to_book', 'roe', 'profit_margins', 'beta']:
            if isinstance(out.get(key), (int, float)):
                out[key] = round(out[key], 3 if key == 'eps' else 2)
    except Exception:
        return {}
    return out

def validate_ticker(ticker):
    if not ticker or not isinstance(ticker, str):
        raise BadRequest("Ticker must be a non-empty string")
    
    # Allow alphanumeric characters, dots, and hyphens
    if not re.match(r'^[A-Z0-9.-]', ticker.upper()):
        raise BadRequest("Invalid ticker format")
    
    if len(ticker) > 20:
        raise BadRequest("Ticker too long")
    
    return ticker.upper().strip()

# Static file serving
@app.route('/')
def serve_index():
    """Serve the main HTML file"""
    return send_file('../frontend/index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS)"""
    try:
        return send_from_directory('../frontend', filename)
    except FileNotFoundError:
        return send_from_directory('../frontend', 'index.html')

@app.route('/api/stock/<ticker>')
def get_stock(ticker):
    try:
        validated_ticker = validate_ticker(ticker)
        data = stock_service.get_stock_data(validated_ticker)
        return jsonify(data)
    except BadRequest as e:
        return jsonify({'error': str(e), 'error_type': 'VALIDATION_ERROR'}), 400

@app.route('/api/stock/<ticker>/history')
def get_stock_history(ticker):
    """Return historical price data for charts"""
    try:
        validated_ticker = validate_ticker(ticker)
        period = request.args.get('period', '1mo')
        data = stock_service.get_historical_data(validated_ticker, period=period)
        return jsonify(data)
    except BadRequest as e:
        return jsonify({'error': str(e), 'error_type': 'VALIDATION_ERROR'}), 400

@app.route('/api/stocks/batch', methods=['POST'])
def get_stocks_batch():
    """Optimized batch endpoint for multiple stock requests - perfect for CSV processing"""
    try:
        request_data = request.get_json()
        if not request_data or 'tickers' not in request_data:
            return jsonify({'error': 'Missing tickers in request body'}), 400
        
        tickers = request_data.get('tickers', [])
        if not tickers or len(tickers) > 50:  # Limit to 50 stocks per batch
            return jsonify({'error': 'Invalid ticker count. Maximum 50 tickers per batch.'}), 400
        
        # Use ThreadPoolExecutor for parallel processing
        def fetch_single_stock(ticker):
            try:
                validated_ticker = validate_ticker(ticker)
                return {
                    'ticker': ticker,
                    'data': stock_service.get_stock_data(validated_ticker),
                    'status': 'success'
                }
            except Exception as e:
                return {
                    'ticker': ticker,
                    'data': None,
                    'error': str(e),
                    'status': 'error'
                }
        
        # Process in parallel using thread pool
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(fetch_single_stock, tickers))
        
        return jsonify({
            'results': results,
            'total_requested': len(tickers),
            'successful': len([r for r in results if r['status'] == 'success']),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/market/enhanced', methods=['POST'])
def get_enhanced_market_overview():
    """Enhanced market overview with sentiment analysis"""
    
    # Get watchlist from request
    request_data = request.get_json() or {}
    watchlist_symbols = request_data.get('watchlist', [])
        
    # Compute enhanced market data
    data = compute_enhanced_market_overview(watchlist_symbols)
    return jsonify(data)

@app.route('/api/technical/indicators', methods=['POST'])
def api_technical_indicators():
    """Unified technical indicators endpoint.
    Request JSON: { ticker, period }
    """
    req = request.get_json(force=True, silent=True) or {}
    ticker = (req.get('ticker') or '').strip()
    period_key = (req.get('period') or '1M').upper()
    if not ticker:
        return jsonify({'error': 'Ticker required'}), 400
    yf_period = TECH_PERIODS.get(period_key, '1mo')
    # Resolve index alias
    core_symbol = TECH_INDICES.get(ticker, ticker)
    # Reuse historical fetch
    hist = stock_service.get_historical_data(core_symbol, period=yf_period)
    if not hist or 'error' in hist:
        return jsonify({'error': hist.get('error', 'No data')}), 404
    comp = _compute_indicators_from_chart(hist.get('data', []))
    fundamentals = _fetch_fundamentals(core_symbol)
    return jsonify({
        'symbol': core_symbol,
        'input_ticker': ticker,
        'period': yf_period,
        'indicators': comp.get('latest', {}),
        'series': comp.get('series', {}),
        'data': hist.get('data', []),
        'fundamentals': fundamentals
    })

@app.route('/api/technical/supported', methods=['GET'])
def api_technical_supported():
    return jsonify({'indices': list(TECH_INDICES.keys()), 'periods': list(TECH_PERIODS.keys())})

@app.route('/api/search/<query>')
def search_stocks(query):
    """Comprehensive search for US and Indian stocks with sector classification"""
    suggestions = []
    
    # COMPREHENSIVE INDIAN STOCKS DATABASE (500 stocks across 16 sectors)
    indian_stocks = {
        # Banking & Financial Services (50 stocks)
        'HDFCBANK': {'name': 'HDFC Bank Ltd', 'sector': 'Banking & Financial Services'},
        'ICICIBANK': {'name': 'ICICI Bank Ltd', 'sector': 'Banking & Financial Services'},
        'SBIN': {'name': 'State Bank of India', 'sector': 'Banking & Financial Services'},
        'KOTAKBANK': {'name': 'Kotak Mahindra Bank', 'sector': 'Banking & Financial Services'},
        'AXISBANK': {'name': 'Axis Bank Ltd', 'sector': 'Banking & Financial Services'},
        'INDUSINDBK': {'name': 'IndusInd Bank Ltd', 'sector': 'Banking & Financial Services'},
        'BANKBARODA': {'name': 'Bank of Baroda', 'sector': 'Banking & Financial Services'},
        'PNB': {'name': 'Punjab National Bank', 'sector': 'Banking & Financial Services'},
        'IDFCFIRSTB': {'name': 'IDFC First Bank Ltd', 'sector': 'Banking & Financial Services'},
        'FEDERALBNK': {'name': 'Federal Bank Ltd', 'sector': 'Banking & Financial Services'},
        'RBLBANK': {'name': 'RBL Bank Ltd', 'sector': 'Banking & Financial Services'},
        'YESBANK': {'name': 'Yes Bank Ltd', 'sector': 'Banking & Financial Services'},
        'CANBK': {'name': 'Canara Bank', 'sector': 'Banking & Financial Services'},
        'UNIONBANK': {'name': 'Union Bank of India', 'sector': 'Banking & Financial Services'},
        'INDIANB': {'name': 'Indian Bank', 'sector': 'Banking & Financial Services'},
        'CENTRALBK': {'name': 'Central Bank of India', 'sector': 'Banking & Financial Services'},
        'IOBBANK': {'name': 'Indian Overseas Bank', 'sector': 'Banking & Financial Services'},
        'PSUBANK': {'name': 'PSU Bank Index', 'sector': 'Banking & Financial Services'},
        'BAJFINANCE': {'name': 'Bajaj Finance Ltd', 'sector': 'Banking & Financial Services'},
        'BAJAJFINSV': {'name': 'Bajaj Finserv Ltd', 'sector': 'Banking & Financial Services'},
        'SBILIFE': {'name': 'SBI Life Insurance', 'sector': 'Banking & Financial Services'},
        'HDFCLIFE': {'name': 'HDFC Life Insurance', 'sector': 'Banking & Financial Services'},
        'ICICIGI': {'name': 'ICICI General Insurance', 'sector': 'Banking & Financial Services'},
        'NIACL': {'name': 'New India Assurance Co Ltd', 'sector': 'Banking & Financial Services'},
        'LICI': {'name': 'Life Insurance Corp of India', 'sector': 'Banking & Financial Services'},
        'HFCL': {'name': 'HFCL Ltd', 'sector': 'Banking & Financial Services'},
        'MUTHOOTFIN': {'name': 'Muthoot Finance Ltd', 'sector': 'Banking & Financial Services'},
        'CHOLAFIN': {'name': 'Cholamandalam Investment', 'sector': 'Banking & Financial Services'},
        'M&MFIN': {'name': 'Mahindra & Mahindra Financial', 'sector': 'Banking & Financial Services'},
        'SRTRANSFIN': {'name': 'Shriram Transport Finance', 'sector': 'Banking & Financial Services'},
        'L&TFH': {'name': 'L&T Finance Holdings', 'sector': 'Banking & Financial Services'},
        'PFC': {'name': 'Power Finance Corporation', 'sector': 'Banking & Financial Services'},
        'RECLTD': {'name': 'REC Ltd', 'sector': 'Banking & Financial Services'},
        'CANFINHOME': {'name': 'Can Fin Homes Ltd', 'sector': 'Banking & Financial Services'},
        'LICHSGFIN': {'name': 'LIC Housing Finance Ltd', 'sector': 'Banking & Financial Services'},
        'DEWAN': {'name': 'Dewan Housing Finance', 'sector': 'Banking & Financial Services'},
        'INDIABULLS': {'name': 'Indiabulls Housing Finance', 'sector': 'Banking & Financial Services'},
        'HUDCO': {'name': 'Housing & Urban Development', 'sector': 'Banking & Financial Services'},
        'GRINDWELL': {'name': 'Grindwell Norton Ltd', 'sector': 'Banking & Financial Services'},
        'CDSL': {'name': 'Central Depository Services', 'sector': 'Banking & Financial Services'},
        'BSE': {'name': 'BSE Ltd', 'sector': 'Banking & Financial Services'},
        'MCX': {'name': 'Multi Commodity Exchange', 'sector': 'Banking & Financial Services'},
        'NSDL': {'name': 'National Securities Depository', 'sector': 'Banking & Financial Services'},
        'IRFC': {'name': 'Indian Railway Finance Corp', 'sector': 'Banking & Financial Services'},
        'PFIZER': {'name': 'Pfizer Ltd', 'sector': 'Banking & Financial Services'},
        'SHRIRAMFIN': {'name': 'Shriram Finance Ltd', 'sector': 'Banking & Financial Services'},
        'CREDITACC': {'name': 'Credit Access Grameen Ltd', 'sector': 'Banking & Financial Services'},
        'SPANDANA': {'name': 'Spandana Sphoorty Financial', 'sector': 'Banking & Financial Services'},
        'EQUITAS': {'name': 'Equitas Holdings Ltd', 'sector': 'Banking & Financial Services'},
        'UJJIVAN': {'name': 'Ujjivan Financial Services', 'sector': 'Banking & Financial Services'},

        # IT Services & Technology (40 stocks)
        'TCS': {'name': 'Tata Consultancy Services', 'sector': 'IT Services & Technology'},
        'INFY': {'name': 'Infosys Ltd', 'sector': 'IT Services & Technology'},
        'WIPRO': {'name': 'Wipro Ltd', 'sector': 'IT Services & Technology'},
        'HCLTECH': {'name': 'HCL Technologies Ltd', 'sector': 'IT Services & Technology'},
        'TECHM': {'name': 'Tech Mahindra Ltd', 'sector': 'IT Services & Technology'},
        'LTIM': {'name': 'LTIMindtree Ltd', 'sector': 'IT Services & Technology'},
        'MPHASIS': {'name': 'Mphasis Ltd', 'sector': 'IT Services & Technology'},
        'PERSISTENT': {'name': 'Persistent Systems', 'sector': 'IT Services & Technology'},
        'COFORGE': {'name': 'Coforge Ltd', 'sector': 'IT Services & Technology'},
        'MINDTREE': {'name': 'Mindtree Ltd', 'sector': 'IT Services & Technology'},
        'HEXAWARE': {'name': 'Hexaware Technologies', 'sector': 'IT Services & Technology'},
        'L&TTS': {'name': 'L&T Technology Services', 'sector': 'IT Services & Technology'},
        'CYIENT': {'name': 'Cyient Ltd', 'sector': 'IT Services & Technology'},
        'SONATA': {'name': 'Sonata Software Ltd', 'sector': 'IT Services & Technology'},
        'NIITTECH': {'name': 'NIIT Technologies Ltd', 'sector': 'IT Services & Technology'},
        'INTELLECT': {'name': 'Intellect Design Arena', 'sector': 'IT Services & Technology'},
        'KPITTECH': {'name': 'KPIT Technologies Ltd', 'sector': 'IT Services & Technology'},
        'ZENSAR': {'name': 'Zensar Technologies Ltd', 'sector': 'IT Services & Technology'},
        'MASTEK': {'name': 'Mastek Ltd', 'sector': 'IT Services & Technology'},
        'ROLTA': {'name': 'Rolta India Ltd', 'sector': 'IT Services & Technology'},
        'SUBEX': {'name': 'Subex Ltd', 'sector': 'IT Services & Technology'},
        'VAKRANGEE': {'name': 'Vakrangee Ltd', 'sector': 'IT Services & Technology'},
        'ECLERX': {'name': 'eClerx Services Ltd', 'sector': 'IT Services & Technology'},
        'RAMCO': {'name': 'Ramco Systems Ltd', 'sector': 'IT Services & Technology'},
        'NELCO': {'name': 'Nelco Ltd', 'sector': 'IT Services & Technology'},
        'SAKSOFT': {'name': 'Saksoft Ltd', 'sector': 'IT Services & Technology'},
        'NEWGEN': {'name': 'Newgen Software Technologies', 'sector': 'IT Services & Technology'},
        'BHARTIAIRTEL': {'name': 'Bharti Airtel Ltd', 'sector': 'IT Services & Technology'},
        'JIOTEL': {'name': 'Reliance Jio', 'sector': 'IT Services & Technology'},
        'IDEA': {'name': 'Vodafone Idea Ltd', 'sector': 'IT Services & Technology'},
        'TATACOMM': {'name': 'Tata Communications Ltd', 'sector': 'IT Services & Technology'},
        'GTPL': {'name': 'GTPL Hathway Ltd', 'sector': 'IT Services & Technology'},
        'DEN': {'name': 'Den Networks Ltd', 'sector': 'IT Services & Technology'},
        'HATHWAY': {'name': 'Hathway Cable & Datacom', 'sector': 'IT Services & Technology'},
        'SITI': {'name': 'Siti Networks Ltd', 'sector': 'IT Services & Technology'},
        'AKSHOPTFBR': {'name': 'Aksh Optifibre Ltd', 'sector': 'IT Services & Technology'},
        'ONEPOINT': {'name': 'One Point One Solutions', 'sector': 'IT Services & Technology'},
        'ROUTE': {'name': 'Route Mobile Ltd', 'sector': 'IT Services & Technology'},
        'TANLA': {'name': 'Tanla Platforms Ltd', 'sector': 'IT Services & Technology'},
        'BIRLASOFT': {'name': 'Birlasoft Ltd', 'sector': 'IT Services & Technology'},

        # Oil & Energy (35 stocks)
        'RELIANCE': {'name': 'Reliance Industries Ltd', 'sector': 'Oil & Energy'},
        'ONGC': {'name': 'Oil & Natural Gas Corp', 'sector': 'Oil & Energy'},
        'IOC': {'name': 'Indian Oil Corp Ltd', 'sector': 'Oil & Energy'},
        'BPCL': {'name': 'Bharat Petroleum Corp', 'sector': 'Oil & Energy'},
        'HINDPETRO': {'name': 'Hindustan Petroleum', 'sector': 'Oil & Energy'},
        'GAIL': {'name': 'GAIL India Ltd', 'sector': 'Oil & Energy'},
        'NTPC': {'name': 'NTPC Ltd', 'sector': 'Oil & Energy'},
        'POWERGRID': {'name': 'Power Grid Corp of India', 'sector': 'Oil & Energy'},
        'COALINDIA': {'name': 'Coal India Ltd', 'sector': 'Oil & Energy'},
        'ADANIPORTS': {'name': 'Adani Ports & SEZ Ltd', 'sector': 'Oil & Energy'},
        'ADANIENT': {'name': 'Adani Enterprises Ltd', 'sector': 'Oil & Energy'},
        'ADANIPOWER': {'name': 'Adani Power Ltd', 'sector': 'Oil & Energy'},
        'ADANIGREEN': {'name': 'Adani Green Energy Ltd', 'sector': 'Oil & Energy'},
        'ADANITRANS': {'name': 'Adani Transmission Ltd', 'sector': 'Oil & Energy'},
        'TORNTPOWER': {'name': 'Torrent Power Ltd', 'sector': 'Oil & Energy'},
        'TATAPOWER': {'name': 'Tata Power Company Ltd', 'sector': 'Oil & Energy'},
        'JSW': {'name': 'JSW Energy Ltd', 'sector': 'Oil & Energy'},
        'NHPC': {'name': 'NHPC Ltd', 'sector': 'Oil & Energy'},
        'SJVN': {'name': 'SJVN Ltd', 'sector': 'Oil & Energy'},
        'THERMAX': {'name': 'Thermax Ltd', 'sector': 'Oil & Energy'},
        'BHEL': {'name': 'Bharat Heavy Electricals', 'sector': 'Oil & Energy'},
        'SUZLON': {'name': 'Suzlon Energy Ltd', 'sector': 'Oil & Energy'},
        'RENUKA': {'name': 'Shree Renuka Sugars Ltd', 'sector': 'Oil & Energy'},
        'RPOWER': {'name': 'Reliance Power Ltd', 'sector': 'Oil & Energy'},
        'GMR': {'name': 'GMR Infrastructure Ltd', 'sector': 'Oil & Energy'},
        'GVK': {'name': 'GVK Power & Infrastructure', 'sector': 'Oil & Energy'},
        'LANCO': {'name': 'Lanco Infratech Ltd', 'sector': 'Oil & Energy'},
        'JAIPRAKASH': {'name': 'Jaiprakash Power Ventures', 'sector': 'Oil & Energy'},
        'KSK': {'name': 'KSK Energy Ventures Ltd', 'sector': 'Oil & Energy'},
        'CESC': {'name': 'Calcutta Electric Supply', 'sector': 'Oil & Energy'},
        'JPPOWER': {'name': 'Jaiprakash Power Ventures', 'sector': 'Oil & Energy'},
        'INDIACEM': {'name': 'India Cements Ltd', 'sector': 'Oil & Energy'},
        'ORIENTCEM': {'name': 'Orient Cement Ltd', 'sector': 'Oil & Energy'},
        'JKCEMENT': {'name': 'JK Cement Ltd', 'sector': 'Oil & Energy'},
        'DALMIACEMT': {'name': 'Dalmia Bharat Ltd', 'sector': 'Oil & Energy'},

        # Pharmaceuticals & Healthcare (40 stocks)
        'SUNPHARMA': {'name': 'Sun Pharmaceutical Inds', 'sector': 'Pharmaceuticals & Healthcare'},
        'DRREDDY': {'name': 'Dr Reddys Laboratories', 'sector': 'Pharmaceuticals & Healthcare'},
        'CIPLA': {'name': 'Cipla Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'DIVISLAB': {'name': 'Divis Laboratories Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'BIOCON': {'name': 'Biocon Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'LUPIN': {'name': 'Lupin Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'AUROPHARMA': {'name': 'Aurobindo Pharma Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'CADILAHC': {'name': 'Cadila Healthcare Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'TORNTPHARM': {'name': 'Torrent Pharma', 'sector': 'Pharmaceuticals & Healthcare'},
        'ALKEM': {'name': 'Alkem Laboratories Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'GLENMARK': {'name': 'Glenmark Pharma Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'WOCKPHARMA': {'name': 'Wockhardt Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'AJANTPHARM': {'name': 'Ajanta Pharma Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'PFIZER': {'name': 'Pfizer Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'ABBOTTINDIA': {'name': 'Abbott India Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'GSKLCONS': {'name': 'GlaxoSmithKline Consumer', 'sector': 'Pharmaceuticals & Healthcare'},
        'SANOFI': {'name': 'Sanofi India Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'NOVARTIS': {'name': 'Novartis India Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'MANKIND': {'name': 'Mankind Pharma Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'GRANULES': {'name': 'Granules India Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'STRIDES': {'name': 'Strides Pharma Science', 'sector': 'Pharmaceuticals & Healthcare'},
        'LALPATHLAB': {'name': 'Dr Lal PathLabs Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'THYROCARE': {'name': 'Thyrocare Technologies', 'sector': 'Pharmaceuticals & Healthcare'},
        'METROPOLIS': {'name': 'Metropolis Healthcare Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'APOLLOHOSP': {'name': 'Apollo Hospitals Enterprise', 'sector': 'Pharmaceuticals & Healthcare'},
        'FORTIS': {'name': 'Fortis Healthcare Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'MAXHEALTH': {'name': 'Max Healthcare Institute', 'sector': 'Pharmaceuticals & Healthcare'},
        'NARAYANA': {'name': 'Narayana Hrudayalaya Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'RAINBOWHSP': {'name': 'Rainbow Childrens Medicare', 'sector': 'Pharmaceuticals & Healthcare'},
        'STAR': {'name': 'Strides Pharma Science Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'UNICHEM': {'name': 'Unichem Laboratories Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'NATCOPHAR': {'name': 'Natco Pharma Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'REDDY': {'name': 'Dr Reddys Laboratories', 'sector': 'Pharmaceuticals & Healthcare'},
        'BLUESTAR': {'name': 'Blue Star Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'RADICO': {'name': 'Radico Khaitan Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'CAPLIPOINT': {'name': 'Caplin Point Laboratories', 'sector': 'Pharmaceuticals & Healthcare'},
        'ERIS': {'name': 'Eris Lifesciences Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'SUVEN': {'name': 'Suven Life Sciences Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'PANACEA': {'name': 'Panacea Biotec Ltd', 'sector': 'Pharmaceuticals & Healthcare'},
        'DISHMAN': {'name': 'Dishman Carbogen Amcis Ltd', 'sector': 'Pharmaceuticals & Healthcare'},

        # Automobiles (35 stocks)
        'MARUTI': {'name': 'Maruti Suzuki India Ltd', 'sector': 'Automobiles'},
        'TATAMOTORS': {'name': 'Tata Motors Ltd', 'sector': 'Automobiles'},
        'M&M': {'name': 'Mahindra & Mahindra', 'sector': 'Automobiles'},
        'BAJAJ-AUTO': {'name': 'Bajaj Auto Ltd', 'sector': 'Automobiles'},
        'EICHERMOT': {'name': 'Eicher Motors Ltd', 'sector': 'Automobiles'},
        'HEROMOTOCO': {'name': 'Hero MotoCorp Ltd', 'sector': 'Automobiles'},
        'TVSMOTOR': {'name': 'TVS Motor Company', 'sector': 'Automobiles'},
        'ASHOKLEY': {'name': 'Ashok Leyland Ltd', 'sector': 'Automobiles'},
        'BHARATFORG': {'name': 'Bharat Forge Ltd', 'sector': 'Automobiles'},
        'FORCEMOT': {'name': 'Force Motors Ltd', 'sector': 'Automobiles'},
        'ESCORTS': {'name': 'Escorts Ltd', 'sector': 'Automobiles'},
        'SONALIKA': {'name': 'International Tractors Ltd', 'sector': 'Automobiles'},
        'VST': {'name': 'VST Tillers Tractors Ltd', 'sector': 'Automobiles'},
        'MAHINDCIE': {'name': 'Mahindra CIE Automotive', 'sector': 'Automobiles'},
        'MOTHERSUMI': {'name': 'Motherson Sumi Systems', 'sector': 'Automobiles'},
        'BOSCHLTD': {'name': 'Bosch Ltd', 'sector': 'Automobiles'},
        'MRF': {'name': 'MRF Ltd', 'sector': 'Automobiles'},
        'APOLLOTYRE': {'name': 'Apollo Tyres Ltd', 'sector': 'Automobiles'},
        'BALKRISIND': {'name': 'Balkrishna Industries Ltd', 'sector': 'Automobiles'},
        'CEATLTD': {'name': 'CEAT Ltd', 'sector': 'Automobiles'},
        'JKT': {'name': 'JK Tyre & Industries Ltd', 'sector': 'Automobiles'},
        'TVSSRICHAK': {'name': 'TVS Srichakra Ltd', 'sector': 'Automobiles'},
        'SUNDARMFAS': {'name': 'Sundram Fasteners Ltd', 'sector': 'Automobiles'},
        'SUNDRMFAST': {'name': 'Sundram Fasteners Ltd', 'sector': 'Automobiles'},
        'GABRIEL': {'name': 'Gabriel India Ltd', 'sector': 'Automobiles'},
        'ENDURANCE': {'name': 'Endurance Technologies', 'sector': 'Automobiles'},
        'RAMKRISHNA': {'name': 'Ramkrishna Forgings Ltd', 'sector': 'Automobiles'},
        'SUPRAJIT': {'name': 'Suprajit Engineering Ltd', 'sector': 'Automobiles'},
        'EXIDEIND': {'name': 'Exide Industries Ltd', 'sector': 'Automobiles'},
        'AMARON': {'name': 'Amara Raja Batteries Ltd', 'sector': 'Automobiles'},
        'LUMINOUS': {'name': 'Luminous Power Technologies', 'sector': 'Automobiles'},
        'HEG': {'name': 'HEG Ltd', 'sector': 'Automobiles'},
        'GRAPHITE': {'name': 'Graphite India Ltd', 'sector': 'Automobiles'},
        'SRF': {'name': 'SRF Ltd', 'sector': 'Automobiles'},
        'TIINDIA': {'name': 'Tube Investments of India', 'sector': 'Automobiles'},

        # FMCG & Consumer Goods (40 stocks)
        'HINDUNILVR': {'name': 'Hindustan Unilever Ltd', 'sector': 'FMCG & Consumer Goods'},
        'ITC': {'name': 'ITC Ltd', 'sector': 'FMCG & Consumer Goods'},
        'NESTLEIND': {'name': 'Nestle India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'BRITANNIA': {'name': 'Britannia Industries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'DABUR': {'name': 'Dabur India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'GODREJCP': {'name': 'Godrej Consumer Products', 'sector': 'FMCG & Consumer Goods'},
        'MARICO': {'name': 'Marico Ltd', 'sector': 'FMCG & Consumer Goods'},
        'COLPAL': {'name': 'Colgate Palmolive India', 'sector': 'FMCG & Consumer Goods'},
        'PGHH': {'name': 'Procter & Gamble Hygiene', 'sector': 'FMCG & Consumer Goods'},
        'EMAMI': {'name': 'Emami Ltd', 'sector': 'FMCG & Consumer Goods'},
        'BAJAJCONS': {'name': 'Bajaj Consumer Care Ltd', 'sector': 'FMCG & Consumer Goods'},
        'JYOTHYLAB': {'name': 'Jyothy Labs Ltd', 'sector': 'FMCG & Consumer Goods'},
        'PATANJALI': {'name': 'Patanjali Ayurved Ltd', 'sector': 'FMCG & Consumer Goods'},
        'VBLLEISURE': {'name': 'VBL', 'sector': 'FMCG & Consumer Goods'},
        'TATACONS': {'name': 'Tata Consumer Products', 'sector': 'FMCG & Consumer Goods'},
        'UBL': {'name': 'United Breweries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'RADICO': {'name': 'Radico Khaitan Ltd', 'sector': 'FMCG & Consumer Goods'},
        'MCDOWELL': {'name': 'United Spirits Ltd', 'sector': 'FMCG & Consumer Goods'},
        'TILAKNAGAR': {'name': 'Tilaknagar Industries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'GLOBUSS': {'name': 'Globuss Spirits Ltd', 'sector': 'FMCG & Consumer Goods'},
        'VAIBHAVGBL': {'name': 'Vaibhav Global Ltd', 'sector': 'FMCG & Consumer Goods'},
        'RELAXOHOME': {'name': 'Relaxo Footwears Ltd', 'sector': 'FMCG & Consumer Goods'},
        'BATA': {'name': 'Bata India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'VIP': {'name': 'VIP Industries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'SYMPHONY': {'name': 'Symphony Ltd', 'sector': 'FMCG & Consumer Goods'},
        'CROMPTON': {'name': 'Crompton Greaves Consumer', 'sector': 'FMCG & Consumer Goods'},
        'ORIENT': {'name': 'Orient Electric Ltd', 'sector': 'FMCG & Consumer Goods'},
        'HAVELLS': {'name': 'Havells India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'POLYCAB': {'name': 'Polycab India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'FINOLEX': {'name': 'Finolex Cables Ltd', 'sector': 'FMCG & Consumer Goods'},
        'KEI': {'name': 'KEI Industries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'VSTIND': {'name': 'VST Industries Ltd', 'sector': 'FMCG & Consumer Goods'},
        'GODFRYPHLP': {'name': 'Godfrey Phillips India', 'sector': 'FMCG & Consumer Goods'},
        'GOLDENTOB': {'name': 'Golden Tobacco Ltd', 'sector': 'FMCG & Consumer Goods'},
        'NIPPOBATRY': {'name': 'Nippo Batteries Company', 'sector': 'FMCG & Consumer Goods'},
        'EVEREADY': {'name': 'Eveready Industries India', 'sector': 'FMCG & Consumer Goods'},
        'PGHL': {'name': 'Procter & Gamble Health', 'sector': 'FMCG & Consumer Goods'},
        'WHIRLPOOL': {'name': 'Whirlpool of India Ltd', 'sector': 'FMCG & Consumer Goods'},
        'BLUESTAR': {'name': 'Blue Star Ltd', 'sector': 'FMCG & Consumer Goods'},
        'VOLTAS': {'name': 'Voltas Ltd', 'sector': 'FMCG & Consumer Goods'},

        # Metals & Mining (30 stocks)
        'TATASTEEL': {'name': 'Tata Steel Ltd', 'sector': 'Metals & Mining'},
        'JSWSTEEL': {'name': 'JSW Steel Ltd', 'sector': 'Metals & Mining'},
        'HINDALCO': {'name': 'Hindalco Industries Ltd', 'sector': 'Metals & Mining'},
        'VEDL': {'name': 'Vedanta Ltd', 'sector': 'Metals & Mining'},
        'SAIL': {'name': 'Steel Authority of India', 'sector': 'Metals & Mining'},
        'NMDC': {'name': 'NMDC Ltd', 'sector': 'Metals & Mining'},
        'JINDALSTEL': {'name': 'Jindal Steel & Power', 'sector': 'Metals & Mining'},
        'RATNAMANI': {'name': 'Ratnamani Metals & Tubes', 'sector': 'Metals & Mining'},
        'MOIL': {'name': 'MOIL Ltd', 'sector': 'Metals & Mining'},
        'WELCORP': {'name': 'Welspun Corp Ltd', 'sector': 'Metals & Mining'},
        'JSHL': {'name': 'Jindal Stainless Hisar', 'sector': 'Metals & Mining'},
        'JSLHISAR': {'name': 'Jindal Stainless Ltd', 'sector': 'Metals & Mining'},
        'NATIONALUM': {'name': 'National Aluminium Co', 'sector': 'Metals & Mining'},
        'BALRAMCHIN': {'name': 'Balrampur Chini Mills', 'sector': 'Metals & Mining'},
        'DHAMPUR': {'name': 'Dhampur Sugar Mills', 'sector': 'Metals & Mining'},
        'BAJAJHIND': {'name': 'Bajaj Hindusthan Sugar', 'sector': 'Metals & Mining'},
        'EIDPARRY': {'name': 'EID Parry India Ltd', 'sector': 'Metals & Mining'},
        'RENUKA': {'name': 'Shree Renuka Sugars Ltd', 'sector': 'Metals & Mining'},
        'TRIVENI': {'name': 'Triveni Engineering', 'sector': 'Metals & Mining'},
        'KCP': {'name': 'KCP Ltd', 'sector': 'Metals & Mining'},
        'UGARSUGAR': {'name': 'Ugar Sugar Works Ltd', 'sector': 'Metals & Mining'},
        'MAHASUGAR': {'name': 'Mawana Sugars Ltd', 'sector': 'Metals & Mining'},
        'AVANTIFEED': {'name': 'Avanti Feeds Ltd', 'sector': 'Metals & Mining'},
        'DEEPAKFERT': {'name': 'Deepak Fertilisers', 'sector': 'Metals & Mining'},
        'CHAMBLFERT': {'name': 'Chambal Fertilisers', 'sector': 'Metals & Mining'},
        'ZUARIGLOB': {'name': 'Zuari Global Ltd', 'sector': 'Metals & Mining'},
        'GSFC': {'name': 'Gujarat State Fertilizers', 'sector': 'Metals & Mining'},
        'NFL': {'name': 'National Fertilizers Ltd', 'sector': 'Metals & Mining'},
        'RCF': {'name': 'Rashtriya Chemicals', 'sector': 'Metals & Mining'},
        'KRIBHCO': {'name': 'Krishak Bharati Coop Ltd', 'sector': 'Metals & Mining'},

        # Cement & Construction Materials (25 stocks)
        'ULTRACEMCO': {'name': 'UltraTech Cement Ltd', 'sector': 'Cement & Construction Materials'},
        'SHREECEM': {'name': 'Shree Cement Ltd', 'sector': 'Cement & Construction Materials'},
        'ACC': {'name': 'ACC Ltd', 'sector': 'Cement & Construction Materials'},
        'AMBUJACEMENT': {'name': 'Ambuja Cements Ltd', 'sector': 'Cement & Construction Materials'},
        'JKCEMENT': {'name': 'JK Cement Ltd', 'sector': 'Cement & Construction Materials'},
        'DALMIACEMT': {'name': 'Dalmia Bharat Ltd', 'sector': 'Cement & Construction Materials'},
        'RAMCOCEM': {'name': 'Ramco Cements Ltd', 'sector': 'Cement & Construction Materials'},
        'INDIACEM': {'name': 'India Cements Ltd', 'sector': 'Cement & Construction Materials'},
        'PRISMCEM': {'name': 'Prism Johnson Ltd', 'sector': 'Cement & Construction Materials'},
        'HEIDELBERG': {'name': 'HeidelbergCement India', 'sector': 'Cement & Construction Materials'},
        'STAR': {'name': 'Star Cement Ltd', 'sector': 'Cement & Construction Materials'},
        'BIRLACEM': {'name': 'Birla Corporation Ltd', 'sector': 'Cement & Construction Materials'},
        'MAGMA': {'name': 'Magma Fincorp Ltd', 'sector': 'Cement & Construction Materials'},
        'MYPAINT': {'name': 'Myra Paint Ltd', 'sector': 'Cement & Construction Materials'},
        'KANSAINER': {'name': 'Kansai Nerolac Paints', 'sector': 'Cement & Construction Materials'},
        'ASIANPAINT': {'name': 'Asian Paints Ltd', 'sector': 'Cement & Construction Materials'},
        'BERGER': {'name': 'Berger Paints India Ltd', 'sector': 'Cement & Construction Materials'},
        'AKZOINDIA': {'name': 'Akzo Nobel India Ltd', 'sector': 'Cement & Construction Materials'},
        'SHALPAINTS': {'name': 'Shalimar Paints Ltd', 'sector': 'Cement & Construction Materials'},
        'INDIGO': {'name': 'Indigo Paints Ltd', 'sector': 'Cement & Construction Materials'},
        'BALPAINT': {'name': 'Balmer Lawrie & Co Ltd', 'sector': 'Cement & Construction Materials'},
        'VIP': {'name': 'VIP Industries Ltd', 'sector': 'Cement & Construction Materials'},
        'KAJARIA': {'name': 'Kajaria Ceramics Ltd', 'sector': 'Cement & Construction Materials'},
        'HSIL': {'name': 'HSIL Ltd', 'sector': 'Cement & Construction Materials'},
        'ORIENT': {'name': 'Orient Bell Ltd', 'sector': 'Cement & Construction Materials'},

        # Infrastructure & Engineering (30 stocks)
        'LT': {'name': 'Larsen & Toubro Ltd', 'sector': 'Infrastructure & Engineering'},
        'BHARTIARTL': {'name': 'Bharti Airtel Ltd', 'sector': 'Infrastructure & Engineering'},
        'IDEA': {'name': 'Vodafone Idea Ltd', 'sector': 'Infrastructure & Engineering'},
        'INDUSINDBK': {'name': 'IndusInd Bank Ltd', 'sector': 'Infrastructure & Engineering'},
        'ENGINERSIN': {'name': 'Engineers India Ltd', 'sector': 'Infrastructure & Engineering'},
        'NBCC': {'name': 'NBCC India Ltd', 'sector': 'Infrastructure & Engineering'},
        'IRCON': {'name': 'Ircon International Ltd', 'sector': 'Infrastructure & Engineering'},
        'RITES': {'name': 'RITES Ltd', 'sector': 'Infrastructure & Engineering'},
        'RAILTEL': {'name': 'RailTel Corporation of India', 'sector': 'Infrastructure & Engineering'},
        'MAZAGON': {'name': 'Mazagon Dock Shipbuilders', 'sector': 'Infrastructure & Engineering'},
        'COCHINSHIP': {'name': 'Cochin Shipyard Ltd', 'sector': 'Infrastructure & Engineering'},
        'GRSE': {'name': 'Garden Reach Shipbuilders', 'sector': 'Infrastructure & Engineering'},
        'HAL': {'name': 'Hindustan Aeronautics', 'sector': 'Infrastructure & Engineering'},
        'BEL': {'name': 'Bharat Electronics Ltd', 'sector': 'Infrastructure & Engineering'},
        'BEML': {'name': 'BEML Ltd', 'sector': 'Infrastructure & Engineering'},
        'HINDCOPPER': {'name': 'Hindustan Copper Ltd', 'sector': 'Infrastructure & Engineering'},
        'SOLARIND': {'name': 'Solar Industries India', 'sector': 'Infrastructure & Engineering'},
        'APOLLOTYRE': {'name': 'Apollo Tyres Ltd', 'sector': 'Infrastructure & Engineering'},
        'CUMMINS': {'name': 'Cummins India Ltd', 'sector': 'Infrastructure & Engineering'},
        'SCHAEFFLER': {'name': 'Schaeffler India Ltd', 'sector': 'Infrastructure & Engineering'},
        'TIMKEN': {'name': 'Timken India Ltd', 'sector': 'Infrastructure & Engineering'},
        'SKFINDIA': {'name': 'SKF India Ltd', 'sector': 'Infrastructure & Engineering'},
        'FINCABLES': {'name': 'Finolex Cables Ltd', 'sector': 'Infrastructure & Engineering'},
        'POLYCAB': {'name': 'Polycab India Ltd', 'sector': 'Infrastructure & Engineering'},
        'DLINKINDIA': {'name': 'D-Link India Ltd', 'sector': 'Infrastructure & Engineering'},
        'NETWORK18': {'name': 'Network18 Media Investment', 'sector': 'Infrastructure & Engineering'},
        'TV18BRDCST': {'name': 'TV18 Broadcast Ltd', 'sector': 'Infrastructure & Engineering'},
        'HCLINSYS': {'name': 'HCL Infosystems Ltd', 'sector': 'Infrastructure & Engineering'},
        'RCOM': {'name': 'Reliance Communications', 'sector': 'Infrastructure & Engineering'},
        'GTPL': {'name': 'GTPL Hathway Ltd', 'sector': 'Infrastructure & Engineering'},

        # Real Estate (25 stocks)
        'DLF': {'name': 'DLF Ltd', 'sector': 'Real Estate'},
        'GODREJPROP': {'name': 'Godrej Properties Ltd', 'sector': 'Real Estate'},
        'BRIGADE': {'name': 'Brigade Enterprises Ltd', 'sector': 'Real Estate'},
        'SOBHA': {'name': 'Sobha Ltd', 'sector': 'Real Estate'},
        'PRESTIGE': {'name': 'Prestige Estates Projects', 'sector': 'Real Estate'},
        'PHOENIXMILL': {'name': 'Phoenix Mills Ltd', 'sector': 'Real Estate'},
        'INDIABULLS': {'name': 'Indiabulls Real Estate', 'sector': 'Real Estate'},
        'UNITECH': {'name': 'Unitech Ltd', 'sector': 'Real Estate'},
        'SUNTECK': {'name': 'Sunteck Realty Ltd', 'sector': 'Real Estate'},
        'MAHLIFE': {'name': 'Mahindra Lifespace Developers', 'sector': 'Real Estate'},
        'KOLTE': {'name': 'Kolte Patil Developers', 'sector': 'Real Estate'},
        'SURANASOLAR': {'name': 'Surana Solar Ltd', 'sector': 'Real Estate'},
        'ANANTRAJ': {'name': 'Anant Raj Ltd', 'sector': 'Real Estate'},
        '3IINFOTECH': {'name': '3i Infotech Ltd', 'sector': 'Real Estate'},
        'ASHIANA': {'name': 'Ashiana Housing Ltd', 'sector': 'Real Estate'},
        'OMAXE': {'name': 'Omaxe Ltd', 'sector': 'Real Estate'},
        'PURAVANKARA': {'name': 'Puravankara Ltd', 'sector': 'Real Estate'},
        'GRASIM': {'name': 'Grasim Industries Ltd', 'sector': 'Real Estate'},
        'RPOWER': {'name': 'Reliance Power Ltd', 'sector': 'Real Estate'},
        'DELTACORP': {'name': 'Delta Corp Ltd', 'sector': 'Real Estate'},
        'JAYPEE': {'name': 'Jaypee Associates Ltd', 'sector': 'Real Estate'},
        'PARSVNATH': {'name': 'Parsvnath Developers Ltd', 'sector': 'Real Estate'},
        'SUPERHOUSE': {'name': 'Superhouse Ltd', 'sector': 'Real Estate'},
        'EDELWEISS': {'name': 'Edelweiss Financial Services', 'sector': 'Real Estate'},
        'AHLEAST': {'name': 'Asian Hotels East Ltd', 'sector': 'Real Estate'},

        # Textiles & Apparel (25 stocks)
        'PAGEIND': {'name': 'Page Industries Ltd', 'sector': 'Textiles & Apparel'},
        'ARVIND': {'name': 'Arvind Ltd', 'sector': 'Textiles & Apparel'},
        'RTNPOWER': {'name': 'Ratnamani Metals & Tubes', 'sector': 'Textiles & Apparel'},
        'GRASIM': {'name': 'Grasim Industries Ltd', 'sector': 'Textiles & Apparel'},
        'ADITYA': {'name': 'Aditya Birla Fashion Retail', 'sector': 'Textiles & Apparel'},
        'CENTURY': {'name': 'Century Textiles & Industries', 'sector': 'Textiles & Apparel'},
        'RSWM': {'name': 'RSWM Ltd', 'sector': 'Textiles & Apparel'},
        'VARDHMAN': {'name': 'Vardhman Textiles Ltd', 'sector': 'Textiles & Apparel'},
        'TRIDENT': {'name': 'Trident Ltd', 'sector': 'Textiles & Apparel'},
        'WELSPUN': {'name': 'Welspun India Ltd', 'sector': 'Textiles & Apparel'},
        'ALOKTEXT': {'name': 'Alok Industries Ltd', 'sector': 'Textiles & Apparel'},
        'SPENTEX': {'name': 'Spentex Industries Ltd', 'sector': 'Textiles & Apparel'},
        'RAYMOND': {'name': 'Raymond Ltd', 'sector': 'Textiles & Apparel'},
        'SIYARAM': {'name': 'Siyaram Silk Mills Ltd', 'sector': 'Textiles & Apparel'},
        'VIPIND': {'name': 'VIP Industries Ltd', 'sector': 'Textiles & Apparel'},
        'GOKEX': {'name': 'Gokaldas Exports Ltd', 'sector': 'Textiles & Apparel'},
        'ORIENTBELL': {'name': 'Orient Bell Ltd', 'sector': 'Textiles & Apparel'},
        'MIRCELECTR': {'name': 'MIRC Electronics Ltd', 'sector': 'Textiles & Apparel'},
        'DOLLAR': {'name': 'Dollar Industries Ltd', 'sector': 'Textiles & Apparel'},
        'LAXMIMACH': {'name': 'Lakshmi Machine Works', 'sector': 'Textiles & Apparel'},
        'MAFATLAL': {'name': 'Mafatlal Industries Ltd', 'sector': 'Textiles & Apparel'},
        'BALKRISHNA': {'name': 'Balkrishna Paper Mills', 'sector': 'Textiles & Apparel'},
        'BALRAMPUR': {'name': 'Balrampur Chini Mills', 'sector': 'Textiles & Apparel'},
        'KESORAMIND': {'name': 'Kesoram Industries Ltd', 'sector': 'Textiles & Apparel'},
        'SPENCERS': {'name': 'Spencers Retail Ltd', 'sector': 'Textiles & Apparel'},

        # Agriculture & Fertilizers (20 stocks)
        'COROMANDEL': {'name': 'Coromandel International', 'sector': 'Agriculture & Fertilizers'},
        'UPL': {'name': 'UPL Ltd', 'sector': 'Agriculture & Fertilizers'},
        'RALLIS': {'name': 'Rallis India Ltd', 'sector': 'Agriculture & Fertilizers'},
        'GODREJAGRO': {'name': 'Godrej Agrovet Ltd', 'sector': 'Agriculture & Fertilizers'},
        'DHANUKA': {'name': 'Dhanuka Agritech Ltd', 'sector': 'Agriculture & Fertilizers'},
        'BASF': {'name': 'BASF India Ltd', 'sector': 'Agriculture & Fertilizers'},
        'SUMICHEM': {'name': 'Sumitomo Chemical India', 'sector': 'Agriculture & Fertilizers'},
        'BIOAGRLTD': {'name': 'Bioagri Ltd', 'sector': 'Agriculture & Fertilizers'},
        'INSECTICID': {'name': 'Insecticides India Ltd', 'sector': 'Agriculture & Fertilizers'},
        'GHCL': {'name': 'GHCL Ltd', 'sector': 'Agriculture & Fertilizers'},
        'KSCL': {'name': 'Kaveri Seed Company Ltd', 'sector': 'Agriculture & Fertilizers'},
        'BIOFIL': {'name': 'Biofil Chemicals & Pharma', 'sector': 'Agriculture & Fertilizers'},
        'INDO-RAMA': {'name': 'Indo Rama Synthetics', 'sector': 'Agriculture & Fertilizers'},
        'ALKYLAMINE': {'name': 'Alkyl Amines Chemicals', 'sector': 'Agriculture & Fertilizers'},
        'PIDILITE': {'name': 'Pidilite Industries Ltd', 'sector': 'Agriculture & Fertilizers'},
        'AARTI': {'name': 'Aarti Industries Ltd', 'sector': 'Agriculture & Fertilizers'},
        'DEEPAK': {'name': 'Deepak Nitrite Ltd', 'sector': 'Agriculture & Fertilizers'},
        'CHEMCON': {'name': 'Chemcon Specialty Chemicals', 'sector': 'Agriculture & Fertilizers'},
        'ROSSARI': {'name': 'Rossari Biotech Ltd', 'sector': 'Agriculture & Fertilizers'},
        'TATACHEM': {'name': 'Tata Chemicals Ltd', 'sector': 'Agriculture & Fertilizers'},

        # Chemicals & Materials (25 stocks)
        'PIDILITE': {'name': 'Pidilite Industries Ltd', 'sector': 'Chemicals & Materials'},
        'AARTI': {'name': 'Aarti Industries Ltd', 'sector': 'Chemicals & Materials'},
        'DEEPAK': {'name': 'Deepak Nitrite Ltd', 'sector': 'Chemicals & Materials'},
        'TATACHEM': {'name': 'Tata Chemicals Ltd', 'sector': 'Chemicals & Materials'},
        'ALKYLAMINE': {'name': 'Alkyl Amines Chemicals', 'sector': 'Chemicals & Materials'},
        'CHEMCON': {'name': 'Chemcon Specialty Chemicals', 'sector': 'Chemicals & Materials'},
        'ROSSARI': {'name': 'Rossari Biotech Ltd', 'sector': 'Chemicals & Materials'},
        'GALAXY': {'name': 'Galaxy Surfactants Ltd', 'sector': 'Chemicals & Materials'},
        'VINATI': {'name': 'Vinati Organics Ltd', 'sector': 'Chemicals & Materials'},
        'CLEAN': {'name': 'Clean Science & Technology', 'sector': 'Chemicals & Materials'},
        'NAVIN': {'name': 'Navin Fluorine International', 'sector': 'Chemicals & Materials'},
        'SOLARIND': {'name': 'Solar Industries India', 'sector': 'Chemicals & Materials'},
        'NOCIL': {'name': 'NOCIL Ltd', 'sector': 'Chemicals & Materials'},
        'BALAJI': {'name': 'Balaji Amines Ltd', 'sector': 'Chemicals & Materials'},
        'SUDARSCHEM': {'name': 'Sudarshan Chemical Industries', 'sector': 'Chemicals & Materials'},
        'KANSAINER': {'name': 'Kansai Nerolac Paints', 'sector': 'Chemicals & Materials'},
        'BERGER': {'name': 'Berger Paints India Ltd', 'sector': 'Chemicals & Materials'},
        'AKZOINDIA': {'name': 'Akzo Nobel India Ltd', 'sector': 'Chemicals & Materials'},
        'ASIANPAINT': {'name': 'Asian Paints Ltd', 'sector': 'Chemicals & Materials'},
        'SRF': {'name': 'SRF Ltd', 'sector': 'Chemicals & Materials'},
        'GUJALKALI': {'name': 'Gujarat Alkalies & Chemicals', 'sector': 'Chemicals & Materials'},
        'FILATEX': {'name': 'Filatex India Ltd', 'sector': 'Chemicals & Materials'},
        'HINDCOPPER': {'name': 'Hindustan Copper Ltd', 'sector': 'Chemicals & Materials'},
        'DHUNINDIA': {'name': 'Dhundi Petrochemicals India', 'sector': 'Chemicals & Materials'},
        'CHEMPLAST': {'name': 'Chemplast Sanmar Ltd', 'sector': 'Chemicals & Materials'},

        # Media & Entertainment (15 stocks)
        'ZEEL': {'name': 'Zee Entertainment Enterprises', 'sector': 'Media & Entertainment'},
        'SUNTV': {'name': 'Sun TV Network Ltd', 'sector': 'Media & Entertainment'},
        'PVRINOX': {'name': 'PVR INOX Ltd', 'sector': 'Media & Entertainment'},
        'NETWORK18': {'name': 'Network18 Media Investment', 'sector': 'Media & Entertainment'},
        'TV18BRDCST': {'name': 'TV18 Broadcast Ltd', 'sector': 'Media & Entertainment'},
        'BALAJITELE': {'name': 'Balaji Telefilms Ltd', 'sector': 'Media & Entertainment'},
        'EROS': {'name': 'Eros International Media', 'sector': 'Media & Entertainment'},
        'TIPS': {'name': 'Tips Industries Ltd', 'sector': 'Media & Entertainment'},
        'SAREGAMA': {'name': 'Saregama India Ltd', 'sector': 'Media & Entertainment'},
        'JAGRAN': {'name': 'Jagran Prakashan Ltd', 'sector': 'Media & Entertainment'},
        'DBCORP': {'name': 'D.B. Corp Ltd', 'sector': 'Media & Entertainment'},
        'HMVL': {'name': 'HMV Ltd', 'sector': 'Media & Entertainment'},
        'GBLINFRA': {'name': 'Global Media Entertainment', 'sector': 'Media & Entertainment'},
        'MUSICBRDCST': {'name': 'Music Broadcast Ltd', 'sector': 'Media & Entertainment'},
        'NAZARA': {'name': 'Nazara Technologies Ltd', 'sector': 'Media & Entertainment'},

        # Aviation & Transportation (15 stocks)
        'SPICEJET': {'name': 'SpiceJet Ltd', 'sector': 'Aviation & Transportation'},
        'INDIGO': {'name': 'InterGlobe Aviation Ltd', 'sector': 'Aviation & Transportation'},
        'JETAIRWAYS': {'name': 'Jet Airways India Ltd', 'sector': 'Aviation & Transportation'},
        'GOKAIR': {'name': 'GoAir Ltd', 'sector': 'Aviation & Transportation'},
        'BLUEDART': {'name': 'Blue Dart Express Ltd', 'sector': 'Aviation & Transportation'},
        'ALLCARGO': {'name': 'Allcargo Logistics Ltd', 'sector': 'Aviation & Transportation'},
        'GATI': {'name': 'Gati Ltd', 'sector': 'Aviation & Transportation'},
        'MAHLOG': {'name': 'Mahindra Logistics Ltd', 'sector': 'Aviation & Transportation'},
        'TCI': {'name': 'Transport Corporation of India', 'sector': 'Aviation & Transportation'},
        'VRL': {'name': 'VRL Logistics Ltd', 'sector': 'Aviation & Transportation'},
        'ASHOKA': {'name': 'Ashoka Buildcon Ltd', 'sector': 'Aviation & Transportation'},
        'IRB': {'name': 'IRB Infrastructure Developers', 'sector': 'Aviation & Transportation'},
        'SADBHAV': {'name': 'Sadbhav Engineering Ltd', 'sector': 'Aviation & Transportation'},
        'PTC': {'name': 'PTC India Ltd', 'sector': 'Aviation & Transportation'},
        'CONCOR': {'name': 'Container Corporation of India', 'sector': 'Aviation & Transportation'}
    }

    # COMPREHENSIVE US STOCKS DATABASE (200 stocks across 11 sectors)
    us_stocks = {
        # Technology (40 stocks)
        'AAPL': {'name': 'Apple Inc', 'sector': 'Technology'},
        'MSFT': {'name': 'Microsoft Corporation', 'sector': 'Technology'},
        'GOOGL': {'name': 'Alphabet Inc Class A', 'sector': 'Technology'},
        'GOOG': {'name': 'Alphabet Inc Class C', 'sector': 'Technology'},
        'AMZN': {'name': 'Amazon.com Inc', 'sector': 'Technology'},
        'META': {'name': 'Meta Platforms Inc', 'sector': 'Technology'},
        'TSLA': {'name': 'Tesla Inc', 'sector': 'Technology'},
        'NVDA': {'name': 'NVIDIA Corporation', 'sector': 'Technology'},
        'NFLX': {'name': 'Netflix Inc', 'sector': 'Technology'},
        'ADBE': {'name': 'Adobe Inc', 'sector': 'Technology'},
        'CRM': {'name': 'Salesforce Inc', 'sector': 'Technology'},
        'ORCL': {'name': 'Oracle Corporation', 'sector': 'Technology'},
        'AMD': {'name': 'Advanced Micro Devices', 'sector': 'Technology'},
        'INTC': {'name': 'Intel Corporation', 'sector': 'Technology'},
        'QCOM': {'name': 'Qualcomm Inc', 'sector': 'Technology'},
        'AVGO': {'name': 'Broadcom Inc', 'sector': 'Technology'},
        'TXN': {'name': 'Texas Instruments', 'sector': 'Technology'},
        'AMAT': {'name': 'Applied Materials', 'sector': 'Technology'},
        'LRCX': {'name': 'Lam Research Corp', 'sector': 'Technology'},
        'KLAC': {'name': 'KLA Corporation', 'sector': 'Technology'},
        'MRVL': {'name': 'Marvell Technology', 'sector': 'Technology'},
        'IBM': {'name': 'International Business Machines', 'sector': 'Technology'},
        'HPQ': {'name': 'HP Inc', 'sector': 'Technology'},
        'HPE': {'name': 'Hewlett Packard Enterprise', 'sector': 'Technology'},
        'CSCO': {'name': 'Cisco Systems Inc', 'sector': 'Technology'},
        'PANW': {'name': 'Palo Alto Networks Inc', 'sector': 'Technology'},
        'CRWD': {'name': 'CrowdStrike Holdings Inc', 'sector': 'Technology'},
        'ZS': {'name': 'Zscaler Inc', 'sector': 'Technology'},
        'OKTA': {'name': 'Okta Inc', 'sector': 'Technology'},
        'SNOW': {'name': 'Snowflake Inc', 'sector': 'Technology'},
        'PLTR': {'name': 'Palantir Technologies Inc', 'sector': 'Technology'},
        'U': {'name': 'Unity Software Inc', 'sector': 'Technology'},
        'RBLX': {'name': 'Roblox Corporation', 'sector': 'Technology'},
        'TWLO': {'name': 'Twilio Inc', 'sector': 'Technology'},
        'ZM': {'name': 'Zoom Video Communications', 'sector': 'Technology'},
        'DOCU': {'name': 'DocuSign Inc', 'sector': 'Technology'},
        'TEAM': {'name': 'Atlassian Corporation', 'sector': 'Technology'},
        'SHOP': {'name': 'Shopify Inc', 'sector': 'Technology'},
        'SQ': {'name': 'Block Inc', 'sector': 'Technology'},
        'PYPL': {'name': 'PayPal Holdings Inc', 'sector': 'Technology'},

        # Healthcare & Pharmaceuticals (25 stocks)
        'JNJ': {'name': 'Johnson & Johnson', 'sector': 'Healthcare & Pharmaceuticals'},
        'UNH': {'name': 'UnitedHealth Group', 'sector': 'Healthcare & Pharmaceuticals'},
        'PFE': {'name': 'Pfizer Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'ABBV': {'name': 'AbbVie Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'TMO': {'name': 'Thermo Fisher Scientific', 'sector': 'Healthcare & Pharmaceuticals'},
        'DHR': {'name': 'Danaher Corporation', 'sector': 'Healthcare & Pharmaceuticals'},
        'BMY': {'name': 'Bristol Myers Squibb', 'sector': 'Healthcare & Pharmaceuticals'},
        'AMGN': {'name': 'Amgen Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'GILD': {'name': 'Gilead Sciences', 'sector': 'Healthcare & Pharmaceuticals'},
        'MRK': {'name': 'Merck & Co Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'LLY': {'name': 'Eli Lilly and Company', 'sector': 'Healthcare & Pharmaceuticals'},
        'CVS': {'name': 'CVS Health Corporation', 'sector': 'Healthcare & Pharmaceuticals'},
        'ANTM': {'name': 'Anthem Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'CI': {'name': 'Cigna Corporation', 'sector': 'Healthcare & Pharmaceuticals'},
        'HUM': {'name': 'Humana Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'BIIB': {'name': 'Biogen Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'REGN': {'name': 'Regeneron Pharmaceuticals', 'sector': 'Healthcare & Pharmaceuticals'},
        'VRTX': {'name': 'Vertex Pharmaceuticals', 'sector': 'Healthcare & Pharmaceuticals'},
        'ILMN': {'name': 'Illumina Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'MRNA': {'name': 'Moderna Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'BNTX': {'name': 'BioNTech SE', 'sector': 'Healthcare & Pharmaceuticals'},
        'ZTS': {'name': 'Zoetis Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'ISRG': {'name': 'Intuitive Surgical Inc', 'sector': 'Healthcare & Pharmaceuticals'},
        'EW': {'name': 'Edwards Lifesciences', 'sector': 'Healthcare & Pharmaceuticals'},
        'SYK': {'name': 'Stryker Corporation', 'sector': 'Healthcare & Pharmaceuticals'},

        # Financial Services (25 stocks)
        'BRK.A': {'name': 'Berkshire Hathaway Class A', 'sector': 'Financial Services'},
        'BRK.B': {'name': 'Berkshire Hathaway Class B', 'sector': 'Financial Services'},
        'JPM': {'name': 'JPMorgan Chase & Co', 'sector': 'Financial Services'},
        'BAC': {'name': 'Bank of America Corp', 'sector': 'Financial Services'},
        'WFC': {'name': 'Wells Fargo & Co', 'sector': 'Financial Services'},
        'GS': {'name': 'Goldman Sachs Group', 'sector': 'Financial Services'},
        'MS': {'name': 'Morgan Stanley', 'sector': 'Financial Services'},
        'C': {'name': 'Citigroup Inc', 'sector': 'Financial Services'},
        'V': {'name': 'Visa Inc', 'sector': 'Financial Services'},
        'MA': {'name': 'Mastercard Inc', 'sector': 'Financial Services'},
        'AXP': {'name': 'American Express Company', 'sector': 'Financial Services'},
        'USB': {'name': 'U.S. Bancorp', 'sector': 'Financial Services'},
        'PNC': {'name': 'PNC Financial Services Group', 'sector': 'Financial Services'},
        'TFC': {'name': 'Truist Financial Corporation', 'sector': 'Financial Services'},
        'SCHW': {'name': 'Charles Schwab Corporation', 'sector': 'Financial Services'},
        'COF': {'name': 'Capital One Financial Corp', 'sector': 'Financial Services'},
        'BLK': {'name': 'BlackRock Inc', 'sector': 'Financial Services'},
        'SPGI': {'name': 'S&P Global Inc', 'sector': 'Financial Services'},
        'CME': {'name': 'CME Group Inc', 'sector': 'Financial Services'},
        'ICE': {'name': 'Intercontinental Exchange', 'sector': 'Financial Services'},
        'NDAQ': {'name': 'Nasdaq Inc', 'sector': 'Financial Services'},
        'MCO': {'name': 'Moodys Corporation', 'sector': 'Financial Services'},
        'MMC': {'name': 'Marsh & McLennan Companies', 'sector': 'Financial Services'},
        'AON': {'name': 'Aon plc', 'sector': 'Financial Services'},
        'TRV': {'name': 'Travelers Companies Inc', 'sector': 'Financial Services'},

        # Consumer Goods & Retail (25 stocks)
        'COST': {'name': 'Costco Wholesale Corp', 'sector': 'Consumer Goods & Retail'},
        'WMT': {'name': 'Walmart Inc', 'sector': 'Consumer Goods & Retail'},
        'HD': {'name': 'Home Depot Inc', 'sector': 'Consumer Goods & Retail'},
        'MCD': {'name': 'McDonalds Corporation', 'sector': 'Consumer Goods & Retail'},
        'SBUX': {'name': 'Starbucks Corporation', 'sector': 'Consumer Goods & Retail'},
        'NKE': {'name': 'Nike Inc', 'sector': 'Consumer Goods & Retail'},
        'TGT': {'name': 'Target Corporation', 'sector': 'Consumer Goods & Retail'},
        'LOW': {'name': 'Lowes Companies Inc', 'sector': 'Consumer Goods & Retail'},
        'KO': {'name': 'Coca-Cola Company', 'sector': 'Consumer Goods & Retail'},
        'PEP': {'name': 'PepsiCo Inc', 'sector': 'Consumer Goods & Retail'},
        'PG': {'name': 'Procter & Gamble Company', 'sector': 'Consumer Goods & Retail'},
        'UL': {'name': 'Unilever PLC', 'sector': 'Consumer Goods & Retail'},
        'CL': {'name': 'Colgate-Palmolive Company', 'sector': 'Consumer Goods & Retail'},
        'KMB': {'name': 'Kimberly-Clark Corporation', 'sector': 'Consumer Goods & Retail'},
        'GIS': {'name': 'General Mills Inc', 'sector': 'Consumer Goods & Retail'},
        'K': {'name': 'Kellogg Company', 'sector': 'Consumer Goods & Retail'},
        'HSY': {'name': 'Hershey Company', 'sector': 'Consumer Goods & Retail'},
        'MDLZ': {'name': 'Mondelez International', 'sector': 'Consumer Goods & Retail'},
        'CPB': {'name': 'Campbell Soup Company', 'sector': 'Consumer Goods & Retail'},
        'HRL': {'name': 'Hormel Foods Corporation', 'sector': 'Consumer Goods & Retail'},
        'TSN': {'name': 'Tyson Foods Inc', 'sector': 'Consumer Goods & Retail'},
        'CAG': {'name': 'ConAgra Foods Inc', 'sector': 'Consumer Goods & Retail'},
        'KHC': {'name': 'Kraft Heinz Company', 'sector': 'Consumer Goods & Retail'},
        'LULU': {'name': 'Lululemon Athletica Inc', 'sector': 'Consumer Goods & Retail'},
        'ULTA': {'name': 'Ulta Beauty Inc', 'sector': 'Consumer Goods & Retail'},

        # Energy (20 stocks)
        'XOM': {'name': 'Exxon Mobil Corporation', 'sector': 'Energy'},
        'CVX': {'name': 'Chevron Corporation', 'sector': 'Energy'},
        'COP': {'name': 'ConocoPhillips', 'sector': 'Energy'},
        'SLB': {'name': 'Schlumberger NV', 'sector': 'Energy'},
        'EOG': {'name': 'EOG Resources Inc', 'sector': 'Energy'},
        'PXD': {'name': 'Pioneer Natural Resources', 'sector': 'Energy'},
        'KMI': {'name': 'Kinder Morgan Inc', 'sector': 'Energy'},
        'OKE': {'name': 'ONEOK Inc', 'sector': 'Energy'},
        'WMB': {'name': 'Williams Companies Inc', 'sector': 'Energy'},
        'EPD': {'name': 'Enterprise Products Partners', 'sector': 'Energy'},
        'ET': {'name': 'Energy Transfer LP', 'sector': 'Energy'},
        'MPC': {'name': 'Marathon Petroleum Corp', 'sector': 'Energy'},
        'VLO': {'name': 'Valero Energy Corporation', 'sector': 'Energy'},
        'PSX': {'name': 'Phillips 66', 'sector': 'Energy'},
        'HES': {'name': 'Hess Corporation', 'sector': 'Energy'},
        'DVN': {'name': 'Devon Energy Corporation', 'sector': 'Energy'},
        'FANG': {'name': 'Diamondback Energy Inc', 'sector': 'Energy'},
        'MRO': {'name': 'Marathon Oil Corporation', 'sector': 'Energy'},
        'APA': {'name': 'APA Corporation', 'sector': 'Energy'},
        'HAL': {'name': 'Halliburton Company', 'sector': 'Energy'},

        # Industrial (20 stocks)
        'BA': {'name': 'Boeing Company', 'sector': 'Industrial'},
        'CAT': {'name': 'Caterpillar Inc', 'sector': 'Industrial'},
        'GE': {'name': 'General Electric Co', 'sector': 'Industrial'},
        'MMM': {'name': '3M Company', 'sector': 'Industrial'},
        'HON': {'name': 'Honeywell International', 'sector': 'Industrial'},
        'UPS': {'name': 'United Parcel Service', 'sector': 'Industrial'},
        'LMT': {'name': 'Lockheed Martin Corporation', 'sector': 'Industrial'},
        'RTX': {'name': 'Raytheon Technologies', 'sector': 'Industrial'},
        'NOC': {'name': 'Northrop Grumman Corp', 'sector': 'Industrial'},
        'GD': {'name': 'General Dynamics Corporation', 'sector': 'Industrial'},
        'FDX': {'name': 'FedEx Corporation', 'sector': 'Industrial'},
        'DE': {'name': 'Deere & Company', 'sector': 'Industrial'},
        'EMR': {'name': 'Emerson Electric Co', 'sector': 'Industrial'},
        'ETN': {'name': 'Eaton Corporation PLC', 'sector': 'Industrial'},
        'PH': {'name': 'Parker-Hannifin Corporation', 'sector': 'Industrial'},
        'ROK': {'name': 'Rockwell Automation Inc', 'sector': 'Industrial'},
        'ITW': {'name': 'Illinois Tool Works Inc', 'sector': 'Industrial'},
        'DOV': {'name': 'Dover Corporation', 'sector': 'Industrial'},
        'PCAR': {'name': 'PACCAR Inc', 'sector': 'Industrial'},
        'CSX': {'name': 'CSX Corporation', 'sector': 'Industrial'},

        # Communication Services (15 stocks)
        'DIS': {'name': 'Walt Disney Company', 'sector': 'Communication Services'},
        'CMCSA': {'name': 'Comcast Corporation', 'sector': 'Communication Services'},
        'VZ': {'name': 'Verizon Communications', 'sector': 'Communication Services'},
        'T': {'name': 'AT&T Inc', 'sector': 'Communication Services'},
        'CHTR': {'name': 'Charter Communications', 'sector': 'Communication Services'},
        'TMUS': {'name': 'T-Mobile US Inc', 'sector': 'Communication Services'},
        'NWSA': {'name': 'News Corporation Class A', 'sector': 'Communication Services'},
        'FOXA': {'name': 'Fox Corporation Class A', 'sector': 'Communication Services'},
        'PARA': {'name': 'Paramount Global Class B', 'sector': 'Communication Services'},
        'WBD': {'name': 'Warner Bros Discovery Inc', 'sector': 'Communication Services'},
        'ROKU': {'name': 'Roku Inc', 'sector': 'Communication Services'},
        'DISH': {'name': 'DISH Network Corporation', 'sector': 'Communication Services'},
        'SIRI': {'name': 'Sirius XM Holdings Inc', 'sector': 'Communication Services'},
        'PINS': {'name': 'Pinterest Inc', 'sector': 'Communication Services'},
        'SNAP': {'name': 'Snap Inc', 'sector': 'Communication Services'},

        # Utilities (15 stocks)
        'NEE': {'name': 'NextEra Energy Inc', 'sector': 'Utilities'},
        'DUK': {'name': 'Duke Energy Corporation', 'sector': 'Utilities'},
        'SO': {'name': 'Southern Company', 'sector': 'Utilities'},
        'D': {'name': 'Dominion Energy Inc', 'sector': 'Utilities'},
        'EXC': {'name': 'Exelon Corporation', 'sector': 'Utilities'},
        'XEL': {'name': 'Xcel Energy Inc', 'sector': 'Utilities'},
        'SRE': {'name': 'Sempra Energy', 'sector': 'Utilities'},
        'AEP': {'name': 'American Electric Power', 'sector': 'Utilities'},
        'PCG': {'name': 'PG&E Corporation', 'sector': 'Utilities'},
        'ED': {'name': 'Consolidated Edison Inc', 'sector': 'Utilities'},
        'EIX': {'name': 'Edison International', 'sector': 'Utilities'},
        'ETR': {'name': 'Entergy Corporation', 'sector': 'Utilities'},
        'FE': {'name': 'FirstEnergy Corp', 'sector': 'Utilities'},
        'ES': {'name': 'Eversource Energy', 'sector': 'Utilities'},
        'AWK': {'name': 'American Water Works', 'sector': 'Utilities'},

        # Real Estate (10 stocks)
        'AMT': {'name': 'American Tower Corporation', 'sector': 'Real Estate'},
        'PLD': {'name': 'Prologis Inc', 'sector': 'Real Estate'},
        'CCI': {'name': 'Crown Castle International', 'sector': 'Real Estate'},
        'EQIX': {'name': 'Equinix Inc', 'sector': 'Real Estate'},
        'WELL': {'name': 'Welltower Inc', 'sector': 'Real Estate'},
        'DLR': {'name': 'Digital Realty Trust Inc', 'sector': 'Real Estate'},
        'SPG': {'name': 'Simon Property Group Inc', 'sector': 'Real Estate'},
        'O': {'name': 'Realty Income Corporation', 'sector': 'Real Estate'},
        'AVTR': {'name': 'Avantor Inc', 'sector': 'Real Estate'},
        'EQR': {'name': 'Equity Residential', 'sector': 'Real Estate'}
    }
    
    query_upper = query.upper()
    
    # Search Indian stocks
    for symbol, data in indian_stocks.items():
        if query_upper in symbol or query_upper in data['name'].upper() or query_upper in data['sector'].upper():
            suggestions.append({
                'symbol': symbol,
                'name': data['name'],
                'sector': data['sector'],
                'exchange': 'NSE'
            })
    
    # Search US stocks
    for symbol, data in us_stocks.items():
        if query_upper in symbol or query_upper in data['name'].upper() or query_upper in data['sector'].upper():
            suggestions.append({
                'symbol': symbol,
                'name': data['name'],
                'sector': data['sector'],
                'exchange': 'US'
            })
    
    return jsonify({'suggestions': suggestions[:20]})

@app.route('/api/status')
def get_system_status():
    """Get system status for frontend"""
    return jsonify({
        'status': 'connected',
        'active_connections': len(stock_service.active_tickers),
        'server_time': datetime.now().isoformat(),
        'data_source': 'Yahoo Finance (yfinance)',
        'supported_markets': ['NSE', 'BSE', 'US'],
        'update_frequency': '5 seconds'
    })

@app.route('/api/portfolios', methods=['GET'])
def get_portfolios():
    """Get all portfolios"""
    portfolios = portfolio_manager.get_all_portfolios()
    return jsonify({'portfolios': portfolios})

@app.route('/api/portfolios', methods=['POST'])
def create_portfolio():
    """Create new portfolio"""
    try:
        data = request.get_json()
        name = data.get('name')
        capital = data.get('capital')
        description = data.get('description', '')
        
        if not name or not capital:
            return jsonify({'error': 'Name and capital are required'}), 400
            
        portfolio = portfolio_manager.create_portfolio(name, capital, description)
        return jsonify({'success': True, 'portfolio': portfolio})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolios/<portfolio_id>', methods=['GET'])
def get_portfolio_route(portfolio_id):
    p = portfolio_manager.get_portfolio(portfolio_id)
    if not p:
        return jsonify({'error': 'Portfolio not found'}), 404
    return jsonify({'portfolio': p})

# Portfolio Position Management Endpoints
@app.route('/api/portfolios/<portfolio_id>/buy', methods=['POST'])
def buy_stock_for_portfolio(portfolio_id):
    """Buy stock for a specific portfolio"""
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper().strip()
        quantity = int(data.get('quantity', 0))
        provided_price = data.get('price')
        
        if not symbol or quantity <= 0:
            return jsonify({'error': 'Invalid symbol or quantity'}), 400
        
        # If price not provided, fetch current market price
        if provided_price is None or provided_price <= 0:
            stock_data = stock_service.get_stock_data(symbol)
            if stock_data.get('error'):
                return jsonify({'error': f'Failed to fetch current price for {symbol}: {stock_data["error"]}'}), 400
            
            current_price = stock_data.get('current_price')
            if not current_price or current_price <= 0:
                return jsonify({'error': f'Invalid current price for {symbol}'}), 400
            
            price = current_price
        else:
            price = float(provided_price)
        
        portfolio = portfolio_manager.buy_stock(portfolio_id, symbol, quantity, price)
        
        return jsonify({
            'success': True,
            'message': f'Bought {quantity} shares of {symbol} at ${price:.2f}',
            'portfolio': portfolio
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/portfolios/<portfolio_id>/sell', methods=['POST'])
def sell_stock_from_portfolio(portfolio_id):
    """Sell stock from a specific portfolio"""
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper().strip()
        quantity = int(data.get('quantity', 0))
        price = float(data.get('price', 0))
        
        if not symbol or quantity <= 0 or price <= 0:
            return jsonify({'error': 'Invalid symbol, quantity, or price'}), 400
        
        portfolio = portfolio_manager.sell_stock(portfolio_id, symbol, quantity, price)
        
        return jsonify({
            'success': True,
            'message': f'Sold {quantity} shares of {symbol}',
            'portfolio': portfolio
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/portfolios/<portfolio_id>/value')
def get_portfolio_value(portfolio_id):
    """Get current portfolio value and metrics"""
    try:
        value_data = portfolio_manager.get_portfolio_value(portfolio_id)
        if value_data:
            return jsonify(value_data)
        else:
            return jsonify({'error': 'Portfolio not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolios/<portfolio_id>/transactions')
def get_portfolio_transactions(portfolio_id):
    """Get transaction history for a portfolio"""
    try:
        transactions = portfolio_manager.get_portfolio_transactions(portfolio_id)
        return jsonify({'transactions': transactions})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolios/<portfolio_id>/positions')
def get_portfolio_positions(portfolio_id):
    """Get current positions in a portfolio"""
    try:
        portfolio = portfolio_manager.get_portfolio(portfolio_id)
        if portfolio:
            return jsonify({
                'positions': portfolio.get('positions', {}),
                'available_cash': portfolio.get('available_cash', 0)
            })
        else:
            return jsonify({'error': 'Portfolio not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolios/<portfolio_id>', methods=['DELETE'])
def delete_portfolio_route(portfolio_id):
    """Delete a portfolio"""
    try:
        success = portfolio_manager.delete_portfolio(portfolio_id)
        if success:
            return jsonify({
                'success': True,
                'message': f'Portfolio {portfolio_id} deleted successfully'
            })
        else:
            return jsonify({'error': 'Failed to delete portfolio'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    
@app.route('/api/admin/repair-database', methods=['POST'])
def repair_database():
    """Admin endpoint to repair corrupted database"""
    try:
        # Check integrity first
        integrity_ok = portfolio_manager.check_database_integrity()
        
        if not integrity_ok:
            # Repair the database
            portfolio_manager.repair_database()
            
            # Reload portfolios
            portfolio_manager.portfolios = {}
            portfolio_manager.load_portfolios_from_db()
            
            return jsonify({
                'success': True,
                'message': 'Database repaired successfully',
                'portfolios_loaded': len(portfolio_manager.portfolios)
            })
        else:
            return jsonify({
                'success': True,
                'message': 'Database is already healthy',
                'portfolios_loaded': len(portfolio_manager.portfolios)
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/market/news', methods=['GET'])
def get_market_news():
    """Get real market news from reliable sources - 60% Indian, 40% Global"""
    try:
        import yfinance as yf
        
        news_articles = []
        
        # INDIAN MARKET NEWS (60%) - Using major Indian stocks and indices
        indian_symbols = ['^NSEI', '^BSESN', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS']
        indian_count = 0
        
        for symbol in indian_symbols:
            if indian_count >= 12:  # Limit Indian news to 12 articles (60%)
                break
                
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:2]:  # 2 articles per symbol
                    if indian_count >= 12:
                        break
                    
                    
                    # Extract article data from nested 'content' structure
                    content = article.get('content', {})
                    if not content:
                        continue
                    
                    title = content.get('title') or content.get('headline') or f"{symbol} Market News"
                    summary = content.get('summary') or content.get('description') or f"Latest news about {symbol}"
                    publisher = content.get('provider', {}).get('displayName') or content.get('publisher') or 'Market Source'
                    link = content.get('canonicalUrl', {}).get('url') or content.get('clickThroughUrl', {}).get('url') or content.get('link') or ''
                        
                    news_articles.append({
                        'title': title,
                        'summary': summary[:200] + '...' if len(summary) > 200 else summary,
                        'source': publisher,
                        'url': link,
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"indian_{indian_count}_{int(time.time())}",
                        'market': 'Indian'
                    })
                    indian_count += 1
                    
            except Exception as e:
                continue
        
        # GLOBAL MARKET NEWS (40%) - Using major US indices  
        global_symbols = ['SPY', 'QQQ', '^GSPC']
        global_count = 0
        
        print(f"DEBUG: Fetching global market news from {len(global_symbols)} symbols...")
        
        for symbol in global_symbols:
            if global_count >= 8:  # Limit global news to 8 articles (40%)
                break
                
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:3]:  # 3 articles per symbol
                    if global_count >= 8:
                        break
                    
                    # Extract article data from nested 'content' structure
                    content = article.get('content', {})
                    if not content:
                        continue
                    
                    title = content.get('title') or content.get('headline') or f"{symbol} Market Update"
                    summary = content.get('summary') or content.get('description') or f"Latest {symbol} market analysis"
                    publisher = content.get('provider', {}).get('displayName') or content.get('publisher') or 'Financial News'
                    link = content.get('canonicalUrl', {}).get('url') or content.get('clickThroughUrl', {}).get('url') or content.get('link') or ''
                        
                    news_articles.append({
                        'title': title,
                        'summary': summary[:200] + '...' if len(summary) > 200 else summary,
                        'source': publisher,
                        'url': link,
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"global_{global_count}_{int(time.time())}",
                        'market': 'Global'
                    })
                    global_count += 1
                    
            except Exception as e:
                continue
        
        return jsonify({
            'success': True,
            'articles': news_articles,
            'timestamp': datetime.now().isoformat(),
            'indian_count': indian_count,
            'global_count': global_count
        })
        
    except Exception as e:
        print(f"DEBUG: Major error in get_market_news: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'articles': []
        }), 500


@app.route('/api/market/trending', methods=['GET'])
def get_trending_topics():
    """Get trending market topics - Indian market focused with global context"""
    try:
        trending_data = []
        
        # INDIAN MARKET TRENDING (Primary focus)
        indian_symbols = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'LT.NS', 'ITC.NS', 'SBIN.NS']
        
        for symbol in indian_symbols[:6]:  # Top 6 Indian stocks
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period='5d')
                info = ticker.info
                
                if not hist.empty:
                    # Calculate volume trend
                    avg_volume = hist['Volume'].mean()
                    latest_volume = hist['Volume'].iloc[-1]
                    volume_change = ((latest_volume - avg_volume) / avg_volume * 100) if avg_volume > 0 else 0
                    
                    # Calculate price change
                    price_change = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0] * 100)
                    
                    # Use Indian stock names
                    stock_name = symbol.replace('.NS', '')
                    if stock_name == 'RELIANCE':
                        display_name = 'Reliance Industries'
                    elif stock_name == 'TCS':
                        display_name = 'Tata Consultancy Services'
                    elif stock_name == 'HDFCBANK':
                        display_name = 'HDFC Bank'
                    elif stock_name == 'ICICIBANK':
                        display_name = 'ICICI Bank'
                    elif stock_name == 'INFY':
                        display_name = 'Infosys'
                    elif stock_name == 'SBIN':
                        display_name = 'State Bank of India'
                    else:
                        display_name = info.get('longName', stock_name)
                    
                    trending_data.append({
                        'topic': f"{stock_name} - {display_name}",
                        'mentions': int(max(100, latest_volume / 100000)),  # Volume in hundred-thousands as "mentions"
                        'sentiment': max(-1, min(1, price_change / 5)),  # Normalize price change to sentiment
                        'change': f"{'+' if price_change > 0 else ''}{price_change:.1f}%",
                        'market': 'Indian'
                    })
            except Exception as e:
                print(f"Failed to get Indian trending data for {symbol}: {e}")
                continue
        
        # GLOBAL MARKET TRENDING (Secondary)
        global_symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
        
        for symbol in global_symbols[:3]:  # Top 3 global stocks
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period='5d')
                info = ticker.info
                
                if not hist.empty:
                    avg_volume = hist['Volume'].mean()
                    latest_volume = hist['Volume'].iloc[-1]
                    price_change = ((hist['Close'].iloc[-1] - hist['Close'].iloc[0]) / hist['Close'].iloc[0] * 100)
                    
                    trending_data.append({
                        'topic': f"{symbol} - {info.get('longName', symbol)}",
                        'mentions': int(max(500, latest_volume / 1000000)),  # Volume in millions
                        'sentiment': max(-1, min(1, price_change / 10)),
                        'change': f"{'+' if price_change > 0 else ''}{price_change:.1f}%",
                        'market': 'Global'
                    })
            except Exception as e:
                print(f"Failed to get global trending data for {symbol}: {e}")
                continue
        
        # Sort by mentions (volume) descending
        trending_data.sort(key=lambda x: x['mentions'], reverse=True)
        
        return jsonify({
            'success': True,
            'trending': trending_data,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'trending': []
        }), 500


@app.route('/api/market/indian-news', methods=['GET'])
def get_indian_market_news():
    """Get news specifically for Indian market"""
    try:
        import yfinance as yf
        
        news_articles = []
        
        # Focus on Indian indices and top stocks
        indian_symbols = ['^NSEI', '^BSESN', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS']
        
        for symbol in indian_symbols:
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:3]:  # 3 articles per symbol
                    news_articles.append({
                        'title': article.get('title', 'No title'),
                        'summary': article.get('summary', '')[:200] + '...' if len(article.get('summary', '')) > 200 else article.get('summary', ''),
                        'source': article.get('publisher', 'Unknown'),
                        'url': article.get('link', ''),
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"indian_{article.get('uuid', str(hash(article.get('title', ''))))}",
                        'market': 'Indian',
                        'symbol': symbol
                    })
                    
            except Exception as e:
                print(f"Failed to fetch Indian news from {symbol}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'articles': news_articles[:15],  # Limit to 15 articles
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'articles': []
        }), 500


@app.route('/api/market/global-news', methods=['GET'])
def get_global_market_news():
    """Get news specifically for global markets"""
    try:
        import yfinance as yf
        
        news_articles = []
        
        # Focus on major global indices and stocks
        global_symbols = ['SPY', 'QQQ', '^GSPC', '^DJI', '^IXIC']
        
        for symbol in global_symbols:
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:2]:  # 2 articles per symbol
                    news_articles.append({
                        'title': article.get('title', 'No title'),
                        'summary': article.get('summary', '')[:200] + '...' if len(article.get('summary', '')) > 200 else article.get('summary', ''),
                        'source': article.get('publisher', 'Unknown'),
                        'url': article.get('link', ''),
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"global_{article.get('uuid', str(hash(article.get('title', ''))))}",
                        'market': 'Global',
                        'symbol': symbol
                    })
                    
            except Exception as e:
                print(f"Failed to fetch Global news from {symbol}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'articles': news_articles[:10],  # Limit to 10 articles
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'articles': []
        }), 500


@app.route('/api/market/nse-news', methods=['GET'])
def get_nse_news():
    """Get news specifically for NSE listed stocks"""
    try:
        import yfinance as yf
        
        news_articles = []
        
        # Major NSE stocks
        nse_symbols = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'LT.NS', '^NSEI']
        
        for symbol in nse_symbols:
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:2]:  # 2 articles per symbol
                    news_articles.append({
                        'title': article.get('title', 'No title'),
                        'summary': article.get('summary', '')[:200] + '...' if len(article.get('summary', '')) > 200 else article.get('summary', ''),
                        'source': article.get('publisher', 'Unknown'),
                        'url': article.get('link', ''),
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"nse_{article.get('uuid', str(hash(article.get('title', ''))))}",
                        'market': 'NSE',
                        'symbol': symbol
                    })
                    
            except Exception as e:
                print(f"Failed to fetch NSE news from {symbol}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'articles': news_articles[:12],
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'articles': []
        }), 500


@app.route('/api/market/bse-news', methods=['GET'])
def get_bse_news():
    """Get news specifically for BSE listed stocks"""
    try:
        import yfinance as yf
        
        news_articles = []
        
        # Major BSE stocks (using .BO suffix)
        bse_symbols = ['^BSESN', 'RELIANCE.BO', 'TCS.BO', 'INFY.BO', 'HDFCBANK.BO', 'ICICIBANK.BO']
        
        for symbol in bse_symbols:
            try:
                ticker = yf.Ticker(symbol)
                ticker_news = ticker.news
                
                for article in ticker_news[:2]:  # 2 articles per symbol
                    news_articles.append({
                        'title': article.get('title', 'No title'),
                        'summary': article.get('summary', '')[:200] + '...' if len(article.get('summary', '')) > 200 else article.get('summary', ''),
                        'source': article.get('publisher', 'Unknown'),
                        'url': article.get('link', ''),
                        'timestamp': datetime.fromtimestamp(article.get('providerPublishTime', time.time())).isoformat(),
                        'id': f"bse_{article.get('uuid', str(hash(article.get('title', ''))))}",
                        'market': 'BSE',
                        'symbol': symbol
                    })
                    
            except Exception as e:
                print(f"Failed to fetch BSE news from {symbol}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'articles': news_articles[:12],
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'articles': []
        }), 500
        
        # Sort by volume (mentions)
        trending_data.sort(key=lambda x: x['mentions'], reverse=True)
        
        return jsonify({
            'success': True,
            'trending': trending_data[:10],
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'trending': []
        }), 500


# WebSocket handlers
@socketio.on('subscribe')
def handle_subscribe(data):
    """Handle real-time stock subscription"""
    ticker = data.get('ticker')
    if ticker:
        stock_service.active_tickers[request.sid] = ticker
        emit('subscribed', {'ticker': ticker})

@socketio.on('unsubscribe')
def handle_unsubscribe():
    """Handle unsubscribe"""
    if request.sid in stock_service.active_tickers:
        del stock_service.active_tickers[request.sid]

def background_price_updates():
    """Background thread to send real-time price updates"""
    while True:
        try:
            if not stock_service.active_tickers:
                time.sleep(5)
                continue
                
            for session_id, ticker in list(stock_service.active_tickers.items()):
                try:
                    stock_data = stock_service.get_stock_data(ticker)
                    if 'error' not in stock_data:
                        socketio.emit('price_update', stock_data, room=session_id)
                except Exception as e:
                    print(f"Error updating {ticker}: {e}")
                    
            time.sleep(5)
        except Exception as e:
            print(f"Error in background updates: {e}")
            time.sleep(5)

def background_cache_cleanup():
    """Background task to clean up expired cache entries"""
    while True:
        try:
            time.sleep(300)  # Run every 5 minutes
            stock_service.cleanup_expired_cache()
            print(f"Cache cleanup completed. Current cache size: {len(stock_service.price_cache)}")
        except Exception as e:
            print(f"Error in cache cleanup: {e}")
            time.sleep(60)

@app.route('/api/health')
def health_check():
    """Health check endpoint for monitoring"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'cache_size': len(stock_service.price_cache),
        'rate_limiter_calls': len(stock_service.rate_limiter.calls),
        'version': '2.0.0-optimized'
    })

if __name__ == '__main__':
    # Start background threads
    background_thread = threading.Thread(target=background_price_updates)
    background_thread.daemon = True
    background_thread.start()
    
    cache_cleanup_thread = threading.Thread(target=background_cache_cleanup)
    cache_cleanup_thread.daemon = True
    cache_cleanup_thread.start()
    
    # Get port from environment variable (for cloud deployment)
    port = int(os.environ.get('PORT', 5000))
    host = '0.0.0.0'  # Accept connections from any IP (required for cloud hosting)
    
    # Production vs Development settings
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    
    print("🚀 Starting optimized trading platform backend...")
    print("✅ Enhanced caching enabled (30s TTL)")
    print("✅ Increased rate limits (200 calls/min)")
    print("✅ Batch processing endpoint available")
    print("✅ Background cache cleanup active")
    print(f"🔗 Server starting on http://{host}:{port}")
    print(f"🔧 Debug mode: {debug_mode}")
    
    socketio.run(app, debug=debug_mode, port=port, host=host)
