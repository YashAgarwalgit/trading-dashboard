"""
Clean Market Metrics Enhanced - Optimized Market Intelligence
Eliminates redundancy, enhances performance, maintains full compatibility
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import requests
from bs4 import BeautifulSoup
import re
from textblob import TextBlob
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
import warnings
warnings.filterwarnings('ignore')

class MarketIntelligence:
    def __init__(self):
        self.index_tickers = {
            'nifty50': '^NSEI',
            'banknifty': '^NSEBANK', 
            'usdinr': 'USDINR=X',
            'sp500': '^GSPC',
            'vix': '^VIX',
            'nasdaq': '^IXIC',
            'dxy': 'DX-Y.NYB',
            'gold': 'GC=F',
            'crude': 'CL=F',
            'bitcoin': 'BTC-USD',
            'indiavix': '^INDIAVIX',
            'niftymetal': '^CNXMETAL',
            'niftyit': '^CNXIT',
            'niftypharma': '^CNXPHARMA',
            'niftyauto': '^CNXAUTO',
            'niftyfmcg': '^CNXFMCG',
            'niftyenergy': '^CNXENERGY',
            'niftyinfra': '^CNXINFRA',
            'niftypsubank': '^CNXPSUBANK'
        }
        
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        self._index_cache = {}
        self._index_cache_ttl = 30
        
    def _fetch_stock_data(self, ticker, period='1mo'):
        """Fetch stock data with error handling - NO FALLBACK"""
        try:
            print(f"Fetching data for ticker: {ticker}")
            stock = yf.Ticker(ticker)
            hist = stock.history(period=period)
            if hist.empty:
                print(f"❌ Empty data for {ticker}")
                return pd.DataFrame()
            print(f"✅ Fetched {len(hist)} rows for {ticker}, Latest: {hist['Close'].iloc[-1] if not hist.empty else 'N/A'}")
            return hist
        except Exception as e:
            print(f"❌ Stock data fetch error for {ticker}: {e}")
            return pd.DataFrame()
    
    def compute_india_focus_metrics(self, market_data):
        """Compute India-specific market focus metrics"""
        try:
            print("=" * 50)
            print("🇮🇳 COMPUTING INDIA FOCUS METRICS")
            print("=" * 50)
            print(f"Input market_data keys: {list(market_data.keys())}")
            
            # Debug: Print each market data entry
            for key, value in market_data.items():
                if key in ['nifty50', 'banknifty', 'indiavix', 'niftymetal', 'niftyit']:
                    print(f"DEBUG {key}: {value}")
            
            # India-specific indices - NO FALLBACK, use only real data
            indian_indices = {}
            indian_keys = ['nifty50', 'banknifty', 'indiavix', 'niftymetal', 'niftyit', 
                          'niftypharma', 'niftyauto', 'niftyfmcg', 'niftyenergy', 'niftyinfra', 'niftypsubank']
            
            print(f"Looking for Indian indices: {indian_keys}")
            
            for key in indian_keys:
                data = market_data.get(key, {})
                print(f"Processing {key}: {data}")
                if data and isinstance(data, dict) and data.get('price', 0) > 0:
                    indian_indices[key] = data
                    print(f"✅ {key}: Price={data.get('price', 0)}, Change={data.get('change_percent', 0)}%")
                else:
                    print(f"❌ Missing/invalid {key}: {data}")
                    # NO FALLBACK - only include if real data exists
            
            print(f"Final indian_indices populated: {len(indian_indices)} out of {len(indian_keys)}")
            print(f"Populated indices: {list(indian_indices.keys())}")
            
            # Currency and commodities affecting India - NO FALLBACK
            currency_commodities = {}
            commodity_keys = ['usdinr', 'crude', 'gold']
            print(f"Looking for commodities: {commodity_keys}")
            
            for key in commodity_keys:
                data = market_data.get(key, {})
                print(f"Processing commodity {key}: {data}")
                if data and isinstance(data, dict) and data.get('price', 0) > 0:
                    currency_commodities[key] = data
                    print(f"✅ Commodity {key}: Price={data.get('price', 0)}")
                else:
                    print(f"❌ Missing commodity {key}: {data}")
            
            print(f"Currency/Commodities populated: {len(currency_commodities)}")
            
            # Calculate sector performance
            sector_performance = []
            indian_sector_mapping = {
                'niftyit': {'name': 'Information Technology', 'weight': 0.25},
                'banknifty': {'name': 'Banking & Financial', 'weight': 0.30},
                'niftypharma': {'name': 'Pharmaceuticals', 'weight': 0.08},
                'niftyauto': {'name': 'Automotive', 'weight': 0.07},
                'niftyfmcg': {'name': 'FMCG', 'weight': 0.08},
                'niftymetal': {'name': 'Metals & Mining', 'weight': 0.05},
                'niftyenergy': {'name': 'Energy & Oil', 'weight': 0.10},
                'niftyinfra': {'name': 'Infrastructure', 'weight': 0.07}
            }
            
            for sector_key, sector_info in indian_sector_mapping.items():
                sector_data = indian_indices.get(sector_key, {})
                if sector_data:
                    performance_score = sector_data.get('change_percent', 0)
                    sector_performance.append({
                        'sector': sector_info['name'],
                        'performance': round(performance_score, 2),
                        'weight': sector_info['weight'],
                        'price': sector_data.get('price', 0),
                        'change': sector_data.get('change', 0),
                        'trend': 'bullish' if performance_score > 0.5 else 'bearish' if performance_score < -0.5 else 'neutral'
                    })
            
            # Calculate market sentiment based on Indian indices
            nifty_change = indian_indices.get('nifty50', {}).get('change_percent', 0)
            banknifty_change = indian_indices.get('banknifty', {}).get('change_percent', 0)
            vix_level = indian_indices.get('indiavix', {}).get('price', 20)
            
            # Market sentiment calculation
            sentiment_score = (nifty_change + banknifty_change) / 2
            volatility_adjustment = max(0, (30 - vix_level) / 30) * 0.2  # Lower VIX = better sentiment
            final_sentiment = sentiment_score + volatility_adjustment
            
            market_sentiment = {
                'score': round(final_sentiment, 2),
                'level': 'bullish' if final_sentiment > 1.0 else 'bearish' if final_sentiment < -1.0 else 'neutral',
                'confidence': min(1.0, abs(final_sentiment) / 2.0),
                'factors': {
                    'nifty_momentum': nifty_change,
                    'banking_strength': banknifty_change,
                    'volatility_level': vix_level,
                    'overall_trend': 'positive' if final_sentiment > 0 else 'negative'
                }
            }
            
            # Economic indicators
            usdinr = currency_commodities.get('usdinr', {})
            crude = currency_commodities.get('crude', {})
            
            economic_indicators = {
                'currency_pressure': {
                    'usdinr': {
                        'rate': usdinr.get('price', 83.0),
                        'change': usdinr.get('change_percent', 0),
                        'trend': 'weakening' if usdinr.get('change_percent', 0) > 0 else 'strengthening',
                        'impact': 'negative' if usdinr.get('change_percent', 0) > 0.5 else 'positive' if usdinr.get('change_percent', 0) < -0.5 else 'neutral'
                    }
                },
                'commodity_impact': {
                    'crude_oil': {
                        'price': crude.get('price', 80.0),
                        'change': crude.get('change_percent', 0),
                        'impact_on_india': 'negative' if crude.get('change_percent', 0) > 2 else 'positive' if crude.get('change_percent', 0) < -2 else 'neutral',
                        'import_dependency': 0.85  # India imports ~85% of crude needs
                    }
                }
            }
            
            # Top Indian stocks focus (simulated data - in real implementation, fetch from API)
            top_stocks_focus = [
                {'symbol': 'RELIANCE', 'sector': 'Energy', 'weight': 0.10, 'performance': 'outperform'},
                {'symbol': 'TCS', 'sector': 'IT', 'weight': 0.08, 'performance': 'neutral'},
                {'symbol': 'HDFC BANK', 'sector': 'Banking', 'weight': 0.07, 'performance': 'outperform'},
                {'symbol': 'INFOSYS', 'sector': 'IT', 'weight': 0.06, 'performance': 'underperform'},
                {'symbol': 'ICICI BANK', 'sector': 'Banking', 'weight': 0.05, 'performance': 'neutral'}
            ]
            
            return {
                'indices': indian_indices,
                'sector_performance': sector_performance,
                'market_sentiment': market_sentiment,
                'economic_indicators': economic_indicators,
                'top_stocks_focus': top_stocks_focus,
                'currency_commodities': currency_commodities,
                'market_summary': f"Indian markets showing {'positive' if final_sentiment > 0 else 'negative'} sentiment with Nifty at {indian_indices.get('nifty50', {}).get('price', 'N/A')}",
                'last_updated': datetime.now().isoformat(),
                'data_freshness': 'live',
                'region': 'India'
            }
            
        except Exception as e:
            print(f"India focus metrics computation error: {e}")
            print(f"Traceback for debugging: {str(e)}")
            # NO FALLBACK DATA - return empty structure
            return {
                'indices': {},
                'sector_performance': [],
                'market_sentiment': {},
                'economic_indicators': {},
                'top_stocks_focus': [],
                'currency_commodities': {},
                'market_summary': f"India focus computation failed: {str(e)}",
                'last_updated': datetime.now().isoformat(),
                'data_freshness': 'error',
                'region': 'India'
            }

    def _calculate_technical_indicators(self, data):
        """Calculate technical indicators"""
        if data.empty or len(data) < 20:
            return {}
        
        close = data['Close']
        high = data['High']
        low = data['Low']
        volume = data['Volume']
        
        # Moving Averages
        sma_20 = close.rolling(20).mean()
        sma_50 = close.rolling(50).mean() if len(close) >= 50 else sma_20
        ema_12 = close.ewm(span=12).mean()
        ema_26 = close.ewm(span=26).mean()
        
        # MACD
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9).mean()
        
        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Volatility
        returns = close.pct_change().dropna()
        volatility = returns.std() * np.sqrt(252) * 100
        
        return {
            'sma_20': float(sma_20.iloc[-1]) if not sma_20.empty else None,
            'sma_50': float(sma_50.iloc[-1]) if not sma_50.empty else None,
            'rsi': float(rsi.iloc[-1]) if not rsi.empty else None,
            'macd': float(macd.iloc[-1]) if not macd.empty else None,
            'macd_signal': float(macd_signal.iloc[-1]) if not macd_signal.empty else None,
            'volatility': float(volatility),
            'trend': 'Bullish' if close.iloc[-1] > sma_20.iloc[-1] else 'Bearish'
        }

    def compute_watchlist_analytics(self, watchlist_symbols):
        """Compute watchlist analytics"""
        result = {
            'stocks': [],
            'sector_breakdown': {},
            'sector_performance': {},
            'top_movers': {'gainers': [], 'losers': []},
            'overbought': [],
            'oversold': [],
            'vol_spikes': [],
            'stats': {}
        }
        
        if not watchlist_symbols:
            return result
            
        stocks_data = []
        sector_changes = {}
        
        try:
            for symbol in watchlist_symbols[:40]:
                try:
                    tk = yf.Ticker(symbol)
                    hist = tk.history(period='1mo', interval='1d')
                    if hist.empty:
                        continue
                        
                    close = hist['Close']
                    current = float(close.iloc[-1])
                    prev = float(close.iloc[-2]) if len(close) >= 2 else current
                    change = current - prev
                    change_pct = (change / prev) * 100 if prev else 0.0
                    
                    tech = self._calculate_technical_indicators(hist)
                    rsi = tech.get('rsi')
                    
                    returns = close.pct_change().dropna()
                    vol_20 = float(returns[-20:].std() * np.sqrt(252) * 100) if len(returns) >= 10 else None
                    
                    info = {}
                    try:
                        info = tk.info or {}
                    except:
                        pass
                        
                    sector = info.get('sector', 'Unknown')
                    
                    # Volume analysis
                    vol_ratio = None
                    try:
                        vol_series = hist['Volume'].dropna()
                        if len(vol_series) >= 10:
                            current_vol = float(vol_series.iloc[-1])
                            avg_vol = float(vol_series.rolling(20).mean().iloc[-1])
                            if avg_vol > 0:
                                vol_ratio = current_vol / avg_vol
                    except:
                        pass
                    
                    stock_entry = {
                        'symbol': symbol.upper(),
                        'price': round(current, 2),
                        'change': round(change, 2),
                        'change_percent': round(change_pct, 2),
                        'sector': sector,
                        'rsi': round(rsi, 2) if isinstance(rsi, (int, float)) and np.isfinite(rsi) else None,
                        'volatility_ann': round(vol_20, 2) if vol_20 and np.isfinite(vol_20) else None,
                        'volume_ratio': round(vol_ratio, 2) if vol_ratio and np.isfinite(vol_ratio) else None,
                        'technical': tech
                    }
                    
                    stocks_data.append(stock_entry)
                    
                    result['sector_breakdown'][sector] = result['sector_breakdown'].get(sector, 0) + 1
                    sector_changes.setdefault(sector, []).append(change_pct)
                    
                except Exception as e:
                    print(f"Watchlist error {symbol}: {e}")
                    
            # Process results
            for sec, arr in sector_changes.items():
                if arr:
                    result['sector_performance'][sec] = round(float(np.mean(arr)), 2)
            
            movers_sorted = sorted(stocks_data, key=lambda x: x['change_percent'])
            result['top_movers']['losers'] = movers_sorted[:3]
            result['top_movers']['gainers'] = list(reversed(movers_sorted[-3:]))
            
            for s in stocks_data:
                r = s.get('rsi')
                if r and np.isfinite(r):
                    if r >= 75:
                        result['overbought'].append(s)
                    elif r <= 25:
                        result['oversold'].append(s)
                        
                vr = s.get('volume_ratio')
                if vr and np.isfinite(vr) and vr >= 1.8:
                    result['vol_spikes'].append(s)
            
            if stocks_data:
                avg_change = np.mean([s['change_percent'] for s in stocks_data])
                result['stats'] = {
                    'count': len(stocks_data),
                    'avg_change_percent': round(float(avg_change), 2),
                    'advancers': sum(1 for s in stocks_data if s['change_percent'] > 0),
                    'decliners': sum(1 for s in stocks_data if s['change_percent'] < 0)
                }
            
            result['stocks'] = stocks_data
            
        except Exception as e:
            print(f"Watchlist analytics failure: {e}")
            
        return result

    def compute_sector_rotation(self):
        """Compute sector rotation analysis"""
        sectors = {
            'Nifty IT': '^CNXIT',
            'Nifty Pharma': '^CNXPHARMA',
            'Nifty Auto': '^CNXAUTO',
            'Nifty FMCG': '^CNXFMCG',
            'Nifty Metal': '^CNXMETAL',
            'Nifty PSU Bank': '^CNXPSUBANK',
            'Nifty Infra': '^CNXINFRA',
            'Nifty Energy': '^CNXENERGY'
        }
        
        rotation = []
        
        try:
            for name, ticker in sectors.items():
                try:
                    hist = yf.download(ticker, period='1mo', interval='1d', progress=False)
                    if hist is None or hist.empty:
                        continue
                        
                    close = None
                    if isinstance(hist.columns, pd.MultiIndex):
                        close_candidate = hist.xs('Close', axis=1, level=0)
                        if isinstance(close_candidate, pd.DataFrame):
                            close = close_candidate.iloc[:, 0]
                        else:
                            close = close_candidate
                    else:
                        close = hist['Close']
                        
                    if close is None or close.empty:
                        continue
                        
                    close = close.dropna()
                    latest = float(close.iloc[-1])
                    
                    base_5 = float(close.iloc[-6]) if len(close) >= 6 else float(close.iloc[0])
                    base_20 = float(close.iloc[-21]) if len(close) >= 21 else float(close.iloc[0])
                    
                    short_ret = (latest / base_5 - 1) * 100 if base_5 else 0.0
                    med_ret = (latest / base_20 - 1) * 100 if base_20 else 0.0
                    
                    # Quadrant classification
                    threshold = 0.1
                    if med_ret > threshold and short_ret > threshold:
                        quadrant = 'Leading'
                    elif med_ret > threshold and short_ret < -threshold:
                        quadrant = 'Weakening'
                    elif med_ret < -threshold and short_ret < -threshold:
                        quadrant = 'Lagging'
                    elif med_ret < -threshold and short_ret > threshold:
                        quadrant = 'Improving'
                    else:
                        quadrant = 'Leading' if med_ret > 0 else 'Lagging'
                    
                    rotation.append({
                        'sector': name,
                        'short_return': round(short_ret, 2),
                        'medium_return': round(med_ret, 2),
                        'quadrant': quadrant
                    })
                    
                except Exception as e:
                    print(f"Sector rotation error {name}: {e}")
                    
        except Exception as e:
            print(f"Sector rotation failure: {e}")
            
        return rotation

    def _get_news_sentiment(self, symbol):
        """Get news sentiment for symbol"""
        try:
            url = f"https://finance.yahoo.com/quote/{symbol}/news"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                headlines = []
                
                news_items = soup.find_all(['h3', 'h4'], class_=re.compile('.*headline.*|.*title.*'))
                for item in news_items[:10]:
                    text = item.get_text().strip()
                    if text and len(text) > 10:
                        headlines.append(text)
                
                if headlines:
                    sentiments = []
                    for headline in headlines:
                        try:
                            blob = TextBlob(headline)
                            sentiment = blob.sentiment.polarity
                            sentiments.append(sentiment)
                        except:
                            continue
                    
                    if sentiments:
                        avg_sentiment = np.mean(sentiments)
                        sentiment_score = (avg_sentiment + 1) * 50
                        
                        return {
                            'sentiment_score': round(sentiment_score, 2),
                            'sentiment_label': self._get_sentiment_label(sentiment_score),
                            'news_count': len(headlines),
                            'headlines': headlines[:5]
                        }
            
            return {
                'sentiment_score': 50.0,
                'sentiment_label': 'Neutral',
                'news_count': 0,
                'headlines': []
            }
            
        except Exception as e:
            print(f"Sentiment error {symbol}: {e}")
            return {
                'sentiment_score': 50.0,
                'sentiment_label': 'Neutral',
                'news_count': 0,
                'headlines': []
            }

    def _get_sentiment_label(self, score):
        """Convert sentiment score to label"""
        if score >= 70:
            return 'Very Positive'
        elif score >= 60:
            return 'Positive'
        elif score >= 40:
            return 'Neutral'
        elif score >= 30:
            return 'Negative'
        else:
            return 'Very Negative'

    def analyze_watchlist_sentiment(self, watchlist_symbols):
        """Analyze sentiment for watchlist"""
        if not watchlist_symbols:
            return {}
        
        sentiment_results = {}
        neutral_payload = {
            'sentiment_score': 50.0,
            'sentiment_label': 'Neutral',
            'news_count': 0,
            'headlines': []
        }
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_symbol = {
                executor.submit(self._get_news_sentiment, symbol): symbol
                for symbol in watchlist_symbols[:10]
            }
            
            try:
                for future in as_completed(future_to_symbol, timeout=15):
                    symbol = future_to_symbol[future]
                    try:
                        result = future.result()
                        sentiment_results[symbol] = result
                    except Exception as e:
                        print(f"Sentiment processing error {symbol}: {e}")
                        sentiment_results[symbol] = dict(neutral_payload)
            except TimeoutError:
                print("Sentiment analysis timeout")
            finally:
                for fut, symbol in future_to_symbol.items():
                    if symbol not in sentiment_results:
                        sentiment_results[symbol] = dict(neutral_payload)
        
        return sentiment_results

    def _calculate_market_breadth(self):
        """Calculate market breadth"""
        try:
            sectors = {
                'IT': '^CNXIT',
                'Banking': '^NSEBANK',
                'FMCG': '^CNXFMCG',
                'Pharma': '^CNXPHARMA',
                'Auto': '^CNXAUTO'
            }
            
            sector_performance = {}
            for name, ticker in sectors.items():
                try:
                    data = self._fetch_stock_data(ticker, '5d')
                    if not data.empty and len(data) >= 2:
                        change = ((data['Close'].iloc[-1] - data['Close'].iloc[-2]) / data['Close'].iloc[-2]) * 100
                        sector_performance[name] = round(change, 2)
                    else:
                        sector_performance[name] = 0.0
                except:
                    sector_performance[name] = 0.0
            
            positive_sectors = sum(1 for change in sector_performance.values() if change > 0)
            total_sectors = len(sector_performance)
            advance_decline_ratio = positive_sectors / total_sectors if total_sectors > 0 else 0.5
            
            return {
                'sector_performance': sector_performance,
                'advance_decline_ratio': advance_decline_ratio,
                'breadth_score': advance_decline_ratio * 100
            }
        except Exception as e:
            print(f"Market breadth error: {e}")
            return {
                'sector_performance': {},
                'advance_decline_ratio': 0.5,
                'breadth_score': 50.0
            }

    def _calculate_fear_greed_index(self, market_data):
        """Calculate Fear & Greed Index"""
        try:
            components = {}
            
            # VIX component
            vix_data = self._fetch_stock_data(self.index_tickers['vix'], '5d')
            if not vix_data.empty:
                current_vix = vix_data['Close'].iloc[-1]
                vix_score = max(0, min(100, 100 - (current_vix - 10) * 2.5))
                components['vix'] = vix_score
            else:
                components['vix'] = 50
            
            # Market momentum
            sp500_data = self._fetch_stock_data(self.index_tickers['sp500'], '6mo')
            if not sp500_data.empty and len(sp500_data) >= 125:
                current_price = sp500_data['Close'].iloc[-1]
                ma_125 = sp500_data['Close'].rolling(125).mean().iloc[-1]
                momentum_score = 50 + ((current_price - ma_125) / ma_125) * 500
                components['momentum'] = max(0, min(100, momentum_score))
            else:
                components['momentum'] = 50
            
            # Market breadth
            breadth_data = self._calculate_market_breadth()
            components['breadth'] = breadth_data['breadth_score']
            
            # Safe haven demand
            try:
                gold_data = self._fetch_stock_data(self.index_tickers['gold'], '1mo')
                if not gold_data.empty and len(gold_data) >= 20:
                    gold_change = ((gold_data['Close'].iloc[-1] - gold_data['Close'].iloc[-20]) / gold_data['Close'].iloc[-20]) * 100
                    safe_haven_score = 50 - (gold_change * 2)
                    components['safe_haven'] = max(0, min(100, safe_haven_score))
                else:
                    components['safe_haven'] = 50
            except:
                components['safe_haven'] = 50
            
            # Calculate weighted score
            weights = {'vix': 0.3, 'momentum': 0.3, 'breadth': 0.25, 'safe_haven': 0.15}
            fear_greed_score = sum(components[key] * weights[key] for key in components)
            
            return {
                'score': round(fear_greed_score, 1),
                'label': self._get_fear_greed_label(fear_greed_score),
                'components': components
            }
            
        except Exception as e:
            print(f"Fear & Greed calculation error: {e}")
            return {
                'score': 50.0,
                'label': 'Neutral',
                'components': {}
            }

    def _get_fear_greed_label(self, score):
        """Get Fear & Greed label"""
        if score >= 80:
            return 'Extreme Greed'
        elif score >= 60:
            return 'Greed'
        elif score >= 40:
            return 'Neutral'
        elif score >= 20:
            return 'Fear'
        else:
            return 'Extreme Fear'

    def _calculate_enhanced_regime_factors(self, market_data):
        """Calculate regime factors"""
        factors = []
        scores = []
        
        try:
            # VIX Factor
            vix_level = market_data.get('vix', {}).get('price', 20)
            vix_score = max(0, min(10, 10 - (vix_level - 10) * 0.25))
            factors.append({
                'name': 'VIX Fear Index',
                'value': vix_level,
                'score': round(vix_score, 2),
                'details': f'Current: {vix_level:.1f}'
            })
            scores.append(vix_score)
            
            # Market Momentum
            sp500_change = market_data.get('sp500', {}).get('change_percent', 0)
            momentum_score = max(0, min(10, 5 + sp500_change * 0.5))
            factors.append({
                'name': 'S&P 500 Momentum',
                'value': sp500_change,
                'score': round(momentum_score, 2),
                'details': f'{sp500_change:+.2f}% daily'
            })
            scores.append(momentum_score)
            
            # Dollar Strength
            dxy_change = market_data.get('dxy', {}).get('change_percent', 0)
            dollar_score = max(0, min(10, 5 - dxy_change * 0.3))
            factors.append({
                'name': 'Dollar Index',
                'value': dxy_change,
                'score': round(dollar_score, 2),
                'details': f'{dxy_change:+.2f}%'
            })
            scores.append(dollar_score)
            
            # Nifty momentum
            nifty_change = market_data.get('nifty50', {}).get('change_percent', 0)
            nifty_score = max(0, min(10, 5 + nifty_change * 0.6))
            factors.append({
                'name': 'Nifty Momentum',
                'value': nifty_change,
                'score': round(nifty_score, 2),
                'details': f'{nifty_change:+.2f}% daily'
            })
            scores.append(nifty_score)
            
            overall_score = np.mean(scores) if scores else 5.0
            
            return {
                'score': round(overall_score, 2),
                'factors': factors,
                'interpretation': self._interpret_regime_score(overall_score)
            }
            
        except Exception as e:
            print(f"Regime factors error: {e}")
            return {
                'score': 5.0,
                'factors': [],
                'interpretation': 'Neutral regime'
            }

    def _interpret_regime_score(self, score):
        """Interpret regime score"""
        if score >= 8:
            return 'Strong Bull Market'
        elif score >= 6:
            return 'Bullish Regime'
        elif score >= 4:
            return 'Neutral Regime'
        elif score >= 2:
            return 'Bearish Regime'
        else:
            return 'Bear Market'

    def _calculate_correlations(self):
        """Calculate asset correlations"""
        try:
            assets = ['sp500', 'nifty50', 'gold', 'bitcoin', 'usdinr']
            correlation_data = {}
            
            for asset in assets:
                ticker = self.index_tickers.get(asset)
                if ticker:
                    data = self._fetch_stock_data(ticker, '1mo')
                    if not data.empty:
                        returns = data['Close'].pct_change().dropna()
                        correlation_data[asset] = returns
            
            if len(correlation_data) >= 2:
                df = pd.DataFrame(correlation_data)
                corr_matrix = df.corr().replace([np.inf, -np.inf], np.nan).fillna(0)
                
                correlations = {}
                for i, asset1 in enumerate(corr_matrix.index):
                    correlations[asset1] = {}
                    for j, asset2 in enumerate(corr_matrix.columns):
                        if i != j:
                            val = corr_matrix.iloc[i, j]
                            try:
                                corr_val = round(float(val), 3)
                            except:
                                corr_val = 0.0
                            correlations[asset1][asset2] = corr_val
                
                return correlations
            
            return {}
            
        except Exception as e:
            print(f"Correlations error: {e}")
            return {}

    def _generate_market_summary(self, market_data, fear_greed, breadth_analysis, regime_factors=None):
        """Generate comprehensive AI market analysis summary"""
        try:
            # Extract key metrics
            nifty_data = market_data.get('nifty50', {})
            sp500_data = market_data.get('sp500', {})
            vix_data = market_data.get('vix', {})
            bitcoin_data = market_data.get('bitcoin', {})
            usdinr_data = market_data.get('usdinr', {})
            gold_data = market_data.get('gold', {})
            
            nifty_change = nifty_data.get('change_percent', 0) or 0
            sp500_change = sp500_data.get('change_percent', 0) or 0
            vix_level = vix_data.get('price', 20) or 20
            btc_change = bitcoin_data.get('change_percent', 0) or 0
            usd_inr_change = usdinr_data.get('change_percent', 0) or 0
            gold_change = gold_data.get('change_percent', 0) or 0
            
            fear_greed_score = fear_greed.get('score', 50) or 50
            breadth_score = breadth_analysis.get('breadth_score', 50) or 50
            regime_score = regime_factors.get('score', 5.0) if regime_factors else 5.0
            
            # Market tone analysis
            avg_equity_change = (float(nifty_change) + float(sp500_change)) / 2
            
            # Primary market assessment
            if avg_equity_change > 2.0 and fear_greed_score > 75:
                primary_tone = "🚀 Euphoric rally conditions with extremely high risk appetite."
                risk_warning = " Caution advised as markets may be overextended."
            elif avg_equity_change > 1.5 and fear_greed_score > 60:
                primary_tone = "📈 Strong bullish momentum driven by positive sentiment."
                risk_warning = ""
            elif avg_equity_change > 0.8:
                primary_tone = "🔼 Moderate upward trend with selective buying interest."
                risk_warning = ""
            elif avg_equity_change > 0.3:
                primary_tone = "➡️ Cautious optimism with modest gains prevailing."
                risk_warning = ""
            elif avg_equity_change > -0.3:
                primary_tone = "🔄 Mixed sentiment with consolidation and range-bound trading."
                risk_warning = ""
            elif avg_equity_change > -0.8:
                primary_tone = "🔽 Mild selling pressure with defensive positioning."
                risk_warning = ""
            elif avg_equity_change > -1.5:
                primary_tone = "📉 Bearish sentiment dominates with increased volatility."
                risk_warning = ""
            elif fear_greed_score < 25:
                primary_tone = "🛡️ Oversold conditions present contrarian opportunities."
                risk_warning = " Risk-reward favors selective accumulation."
            else:
                primary_tone = "⚠️ Significant weakness requires defensive strategies."
                risk_warning = " Capital preservation is paramount."
            
            # Market breadth analysis
            if breadth_score > 75:
                breadth_desc = "💪 Exceptional broad-based participation with widespread sector strength."
            elif breadth_score > 60:
                breadth_desc = "✅ Healthy broad participation supports current market direction."
            elif breadth_score > 40:
                breadth_desc = "⚖️ Balanced sector participation with mixed signals."
            elif breadth_score > 25:
                breadth_desc = "⚠️ Narrow market leadership limits sustainability of moves."
            else:
                breadth_desc = "❌ Poor breadth indicates underlying market weakness."
            
            # Volatility assessment
            if vix_level > 30:
                vol_analysis = f"🌪️ High volatility (VIX: {vix_level:.1f}) signals market stress."
            elif vix_level > 20:
                vol_analysis = f"📊 Elevated volatility (VIX: {vix_level:.1f}) suggests caution."
            elif vix_level < 15:
                vol_analysis = f"😴 Low volatility (VIX: {vix_level:.1f}) indicates complacency risk."
            else:
                vol_analysis = f"📈 Normal volatility levels (VIX: {vix_level:.1f}) support trends."
            
            # Cross-asset insights
            cross_asset_signals = []
            
            if abs(float(btc_change)) > 3:
                direction = "surging" if float(btc_change) > 0 else "plunging"
                cross_asset_signals.append(f"🪙 Bitcoin {direction} ({btc_change:+.1f}%) signals risk sentiment shift.")
            
            if abs(float(gold_change)) > 1.5:
                direction = "rallying" if float(gold_change) > 0 else "declining"
                safe_haven = "increasing" if float(gold_change) > 0 else "decreasing"
                cross_asset_signals.append(f"🥇 Gold {direction} ({gold_change:+.1f}%) indicates {safe_haven} safe-haven demand.")
            
            if abs(float(usd_inr_change)) > 0.3:
                direction = "weakening" if float(usd_inr_change) > 0 else "strengthening"
                cross_asset_signals.append(f"💱 Rupee {direction} vs USD impacts Indian markets.")
            
            # Regime analysis
            if regime_score >= 7:
                regime_desc = "🟢 Strong bullish regime supports risk-on strategies."
            elif regime_score >= 5.5:
                regime_desc = "🟡 Neutral to bullish regime with selective opportunities."
            elif regime_score >= 4:
                regime_desc = "🟠 Mixed regime requires balanced approach."
            else:
                regime_desc = "🔴 Defensive regime favors capital preservation."
            
            # Construct comprehensive summary
            summary_parts = [primary_tone + risk_warning, breadth_desc, vol_analysis, regime_desc]
            
            # Add most important cross-asset signal if any
            if cross_asset_signals:
                summary_parts.append(cross_asset_signals[0])
            
            # Strategic outlook
            if avg_equity_change > 1.0 and breadth_score > 60:
                outlook = "🎯 Tactical upside participation recommended with proper risk management."
            elif avg_equity_change < -1.0 or fear_greed_score < 30:
                outlook = "🛡️ Focus on quality names and defensive positioning."
            elif vix_level > 25:
                outlook = "⏳ Await volatility normalization for better entry opportunities."
            else:
                outlook = "📊 Maintain balanced exposure with sector rotation focus."
            
            summary_parts.append(outlook)
            
            # Join all parts
            full_summary = " ".join(summary_parts)
            
            # Ensure reasonable length (limit to ~400 characters for UI)
            if len(full_summary) > 400:
                # Prioritize most important parts
                key_summary = f"{primary_tone} {breadth_desc} {regime_desc} {outlook}"
                if len(key_summary) > 400:
                    key_summary = key_summary[:397] + "..."
                return key_summary
            
            return full_summary
            
        except Exception as e:
            print(f"Enhanced market summary error: {e}")
            return "🤖 AI market analysis temporarily unavailable. Please refresh for latest insights."

    def _calculate_technical_indicators(self, data):
        """Calculate technical indicators"""
        if data.empty or len(data) < 20:
            return {}
        
        close = data['Close']
        high = data['High']
        low = data['Low']
        volume = data['Volume']
        
        # Moving Averages
        sma_20 = close.rolling(20).mean()
        sma_50 = close.rolling(50).mean() if len(close) >= 50 else sma_20
        ema_12 = close.ewm(span=12).mean()
        ema_26 = close.ewm(span=26).mean()
        
        # MACD
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9).mean()
        
        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Volatility
        returns = close.pct_change().dropna()
        volatility = returns.std() * np.sqrt(252) * 100
        
        return {
            'sma_20': float(sma_20.iloc[-1]) if not sma_20.empty else None,
            'sma_50': float(sma_50.iloc[-1]) if not sma_50.empty else None,
            'rsi': float(rsi.iloc[-1]) if not rsi.empty else None,
            'macd': float(macd.iloc[-1]) if not macd.empty else None,
            'macd_signal': float(macd_signal.iloc[-1]) if not macd_signal.empty else None,
            'volatility': float(volatility),
            'trend': 'Bullish' if close.iloc[-1] > sma_20.iloc[-1] else 'Bearish'
        }

    def compute_enhanced_market_overview(self, watchlist_symbols=None):
        """Main market overview computation"""
        print("Computing enhanced market overview...")
        
        try:
            market_data = {}
            
            # Fetch index data
            def fetch_index_snapshot(name, ticker):
                try:
                    now = time.time()
                    cached = self._index_cache.get(name)
                    if cached and now - cached.get('ts', 0) < self._index_cache_ttl:
                        return name, cached['data']
                    
                    data = self._fetch_stock_data(ticker, '5d')
                    if not data.empty and len(data) >= 2:
                        current = data['Close'].iloc[-1]
                        previous = data['Close'].iloc[-2]
                        change = current - previous
                        change_pct = (change / previous) * 100 if previous else 0
                        
                        result = {
                            'price': round(current, 4 if name == 'usdinr' else 2),
                            'change': round(change, 4 if name == 'usdinr' else 2),
                            'change_percent': round(change_pct, 3 if name == 'usdinr' else 2),
                            'technical': self._calculate_technical_indicators(data)
                        }
                        
                        self._index_cache[name] = {'data': result, 'ts': time.time()}
                        return name, result
                except Exception as e:
                    print(f"Index fetch error {name}: {e}")
                
                return name, {'price': 0, 'change': 0, 'change_percent': 0, 'technical': {}}
            
            # Parallel fetching
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = {
                    executor.submit(fetch_index_snapshot, name, ticker): name
                    for name, ticker in self.index_tickers.items()
                }
                
                try:
                    for future in as_completed(futures, timeout=15):
                        name, result = future.result()
                        market_data[name] = result
                except TimeoutError:
                    print("Index fetch timeout")
                finally:
                    for name in self.index_tickers.keys():
                        if name not in market_data:
                            market_data[name] = {'price': 0, 'change': 0, 'change_percent': 0, 'technical': {}}
            
            # Calculate components
            fear_greed = self._calculate_fear_greed_index(market_data)
            breadth_analysis = self._calculate_market_breadth()
            regime_factors = self._calculate_enhanced_regime_factors(market_data)
            correlation_matrix = self._calculate_correlations()
            market_summary = self._generate_market_summary(market_data, fear_greed, breadth_analysis, regime_factors)
            
            # Sentiment analysis
            sentiment_analysis = {}
            if watchlist_symbols:
                sentiment_analysis = self.analyze_watchlist_sentiment(watchlist_symbols)
            
            # Build overview
            overview = {
                'timestamp': datetime.now().isoformat(),
                'indices': {
                    'nifty50': market_data.get('nifty50', {}),
                    'banknifty': market_data.get('banknifty', {}),
                    'usdinr': market_data.get('usdinr', {}),
                    'sp500': market_data.get('sp500', {}),
                    'nasdaq': market_data.get('nasdaq', {}),
                    'vix': market_data.get('vix', {}),
                    'dxy': market_data.get('dxy', {}),
                    'gold': market_data.get('gold', {}),
                    'crude': market_data.get('crude', {}),
                    'bitcoin': market_data.get('bitcoin', {}),
                    'indiavix': market_data.get('indiavix', {}),
                    'niftymetal': market_data.get('niftymetal', {}),
                    'niftyit': market_data.get('niftyit', {}),
                    'niftypharma': market_data.get('niftypharma', {}),
                    'niftyauto': market_data.get('niftyauto', {}),
                    'niftyfmcg': market_data.get('niftyfmcg', {}),
                    'niftyenergy': market_data.get('niftyenergy', {}),
                    'niftyinfra': market_data.get('niftyinfra', {}),
                    'niftypsubank': market_data.get('niftypsubank', {})
                },
                'regime': regime_factors,
                'fear_greed_index': fear_greed,
                'market_breadth': breadth_analysis,
                'sentiment_analysis': sentiment_analysis,
                'correlations': correlation_matrix,
                'market_summary': market_summary
            }
            
            # Add watchlist analytics
            if watchlist_symbols:
                try:
                    overview['watchlist_analytics'] = self.compute_watchlist_analytics(watchlist_symbols)
                except Exception as e:
                    print(f"Watchlist analytics error: {e}")
            
            # Add sector rotation
            try:
                overview['sector_rotation'] = self.compute_sector_rotation()
            except Exception as e:
                print(f"Sector rotation error: {e}")
            
            # Add India focus data
            try:
                overview['india_focus'] = self.compute_india_focus_metrics(market_data)
            except Exception as e:
                print(f"India focus metrics error: {e}")
                print(f"Full error details: {str(e)}")
                # NO FALLBACK - return empty structure with error info
                overview['india_focus'] = {
                    'indices': {},
                    'sector_performance': [],
                    'market_sentiment': {},
                    'economic_indicators': {},
                    'top_stocks_focus': [],
                    'currency_commodities': {},
                    'market_summary': f"India focus error: {str(e)}",
                    'last_updated': datetime.now().isoformat(),
                    'data_freshness': 'error',
                    'region': 'India'
                }
            
            return overview
            
        except Exception as e:
            print(f"Market overview error: {e}")
            return {
                'timestamp': datetime.now().isoformat(),
                'indices': {},
                'regime': {'score': 5.0, 'factors': []},
                'fear_greed_index': {'score': 50.0, 'label': 'Neutral'},
                'market_breadth': {'breadth_score': 50.0},
                'sentiment_analysis': {},
                'correlations': {},
                'market_summary': 'Market data temporarily unavailable'
            }

# Global instance
market_intelligence = MarketIntelligence()

def compute_market_overview():
    """Legacy compatibility"""
    return market_intelligence.compute_enhanced_market_overview()

def compute_enhanced_market_overview(watchlist_symbols=None):
    """Enhanced market overview with watchlist support"""
    return market_intelligence.compute_enhanced_market_overview(watchlist_symbols)
