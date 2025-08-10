import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from math import sqrt
import requests
from bs4 import BeautifulSoup
import re
from textblob import TextBlob
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
import warnings
warnings.filterwarnings('ignore')

# Enhanced Market Intelligence with Sentiment Analysis
class AdvancedMarketIntelligence:
    def __init__(self):
        self.index_tickers = {
            'nifty50': '^NSEI',
            'banknifty': '^NSEBANK', 
            'usdinr': 'USDINR=X',
            'sp500': '^GSPC',
            'vix': '^VIX',
            'niftyfmcg': '^CNXFMCG',
            'niftyit': '^CNXIT',
            'niftypharma': '^CNXPHARMA',
            'niftyauto': '^CNXAUTO',
            'nasdaq': '^IXIC',
            'dxy': 'DX-Y.NYB',  # Dollar Index
            'gold': 'GC=F',     # Gold Futures
            'crude': 'CL=F',    # Crude Oil
            'bitcoin': 'BTC-USD',
            # India-focused additions
            'indiavix': '^INDIAVIX',
            'niftymetal': '^CNXMETAL',
            'niftyinfra': '^CNXINFRA',
            'niftyenergy': '^CNXENERGY',
            'niftypsubank': '^CNXPSUBANK'
        }
        
        self.sentiment_sources = {
            'yahoo_finance': 'https://finance.yahoo.com/quote/{}/news',
            'marketwatch': 'https://www.marketwatch.com/investing/stock/{}',
            'reuters': 'https://www.reuters.com/markets/stocks'
        }
        
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        # Short-term cache for index snapshots to stabilize UI and reduce load
        self._index_cache = {}
        self._index_cache_ttl = 10  # seconds

    # --- Phase 2 Additions: Watchlist Deep Analytics ---
    def compute_watchlist_analytics(self, watchlist_symbols):
        """Compute deep analytics for the provided watchlist.
        Returns dict with per-stock enriched metrics and aggregated summaries.
        """
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
            for symbol in watchlist_symbols[:40]:  # sanity cap
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
                    # Enhanced technical analysis with more robust calculations
                    tech = self._calculate_technical_indicators(hist)
                    rsi = tech.get('rsi') if tech else None
                    # Ensure RSI is valid and finite
                    if rsi is None or not np.isfinite(rsi):
                        rsi = None
                    
                    # Approx realized volatility (20d) if returns
                    returns = close.pct_change().dropna()
                    vol_20 = float(returns[-20:].std() * np.sqrt(252) * 100) if len(returns) >= 10 else None
                    
                    info = {}
                    try:
                        info = tk.info or {}
                    except Exception:
                        info = {}
                    sector = info.get('sector') or self._guess_sector_from_symbol(symbol) or 'Unknown'
                    
                    # Enhanced volume spike detection with better baseline
                    vol_ratio = None
                    try:
                        vol_series = hist['Volume'].dropna()
                        if len(vol_series) >= 10:
                            current_vol = float(vol_series.iloc[-1])
                            avg_vol = float(vol_series.rolling(min(20, len(vol_series)-1)).mean().iloc[-1])
                            if avg_vol > 0:
                                vol_ratio = current_vol / avg_vol
                    except Exception:
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
                        'technical': {
                            'sma_20': tech.get('sma_20'),
                            'sma_50': tech.get('sma_50'),
                            'macd': tech.get('macd'),
                            'macd_signal': tech.get('macd_signal'),
                            'trend': tech.get('trend')
                        }
                    }
                    stocks_data.append(stock_entry)
                    # Sector distributions
                    result['sector_breakdown'][sector] = result['sector_breakdown'].get(sector, 0) + 1
                    sector_changes.setdefault(sector, []).append(change_pct)
                except Exception as e:
                    print(f"Watchlist analytics error {symbol}: {e}")
            # Sector performance avg
            for sec, arr in sector_changes.items():
                if arr:
                    result['sector_performance'][sec] = round(float(np.mean(arr)), 2)
            # Top movers
            movers_sorted = sorted(stocks_data, key=lambda x: x['change_percent'])
            result['top_movers']['losers'] = movers_sorted[:3]
            result['top_movers']['gainers'] = list(reversed(movers_sorted[-3:]))
            # Enhanced RSI extremes detection with better thresholds
            for s in stocks_data:
                r = s.get('rsi')
                if r is None or not np.isfinite(r): 
                    continue
                if r >= 75:  # More stringent overbought threshold
                    result['overbought'].append(s)
                elif r <= 25:  # More stringent oversold threshold
                    result['oversold'].append(s)
                # Enhanced volume spike threshold
                vr = s.get('volume_ratio')
                if vr and np.isfinite(vr) and vr >= 1.8:  # Lower threshold for more signals
                    result['vol_spikes'].append(s)
            # Stats summary
            if stocks_data:
                avg_change = np.mean([s['change_percent'] for s in stocks_data])
                avg_vol = np.mean([s['volatility_ann'] for s in stocks_data if s.get('volatility_ann')]) if any(s.get('volatility_ann') for s in stocks_data) else None
                result['stats'] = {
                    'count': len(stocks_data),
                    'avg_change_percent': round(float(avg_change), 2),
                    'avg_volatility_ann': round(float(avg_vol), 2) if avg_vol else None,
                    'advancers': sum(1 for s in stocks_data if s['change_percent'] > 0),
                    'decliners': sum(1 for s in stocks_data if s['change_percent'] < 0)
                }
            result['stocks'] = stocks_data
        except Exception as e:
            print(f"Watchlist analytics failure: {e}")
        return result

    # --- Phase 2 Additions: Sector Rotation (Relative Strength vs Momentum) ---
    def compute_sector_rotation(self):
        """Compute short-term vs medium-term returns for sector / thematic indices to build a rotation matrix.
        Returns list of {sector, short_return, medium_return, quadrant}.
        Quadrants:
            Leading: medium>0 & short>0
            Weakening: medium>0 & short<0
            Lagging: medium<0 & short<0
            Improving: medium<0 & short>0
        """
        # Correct Yahoo Finance index symbols (caret-prefixed) instead of invalid NIFTY*.NS forms
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
                    hist = yf.download(ticker, period='1mo', interval='1d', progress=False, threads=False)
                    if hist is None or hist.empty:
                        continue
                    # Normalize close to a 1-D Series (avoid ambiguous DataFrame boolean evaluations)
                    close = None
                    if isinstance(hist.columns, pd.MultiIndex):
                        # Try level 0 'Close'
                        levels0 = hist.columns.get_level_values(0)
                        if 'Close' in levels0:
                            close_candidate = hist.xs('Close', axis=1, level=0)
                        else:
                            # search any level for 'Close'
                            found = None
                            for lvl in range(hist.columns.nlevels):
                                if 'Close' in hist.columns.get_level_values(lvl):
                                    found = lvl
                                    break
                            if found is not None:
                                close_candidate = hist.xs('Close', axis=1, level=found)
                            else:
                                continue
                        if isinstance(close_candidate, pd.DataFrame):
                            if close_candidate.shape[1] == 0:
                                continue
                            close = close_candidate.iloc[:, 0]
                        else:
                            close = close_candidate
                    else:
                        if 'Close' not in hist.columns:
                            continue
                        close = hist['Close']
                    if close is None or not isinstance(close, pd.Series):
                        continue
                    close = close.dropna()
                    if close.empty:
                        continue
                    latest = float(close.iloc[-1])
                    # Determine bases with graceful fallback if insufficient history
                    if len(close) >= 6:
                        base_5 = float(close.iloc[-6])
                    else:
                        base_5 = float(close.iloc[0])
                    if len(close) >= 21:
                        base_20 = float(close.iloc[-21])
                    else:
                        base_20 = float(close.iloc[0])
                    short_ret = (latest / base_5 - 1) * 100 if base_5 else 0.0
                    med_ret = (latest / base_20 - 1) * 100 if base_20 else 0.0
                    short_ret = float(short_ret)
                    med_ret = float(med_ret)
                    # Enhanced quadrant logic with threshold for noise reduction
                    threshold = 0.1  # 0.1% threshold to avoid noise
                    if med_ret > threshold and short_ret > threshold:
                        quadrant = 'Leading'
                    elif med_ret > threshold and short_ret < -threshold:
                        quadrant = 'Weakening'
                    elif med_ret < -threshold and short_ret < -threshold:
                        quadrant = 'Lagging'
                    elif med_ret < -threshold and short_ret > threshold:
                        quadrant = 'Improving'
                    else:
                        # Neutral zone - classify by dominant trend
                        if abs(med_ret) > abs(short_ret):
                            quadrant = 'Leading' if med_ret > 0 else 'Lagging'
                        else:
                            quadrant = 'Improving' if short_ret > 0 else 'Weakening'
                    rotation.append({
                        'sector': name,
                        'short_return': round(short_ret, 2),
                        'medium_return': round(med_ret, 2),
                        'quadrant': quadrant
                    })
                except Exception as e:
                    print(f"Sector rotation fetch fail {name}: {e}")
        except Exception as e:
            print(f"Sector rotation overall failure: {e}")
        return rotation

    def _fetch_stock_data(self, ticker, period='1mo'):
        """Fetch stock data with error handling"""
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period=period)
            if hist.empty:
                raise ValueError(f"No data for {ticker}")
            return hist
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
            return pd.DataFrame()

    def _calculate_technical_indicators(self, data):
        """Calculate advanced technical indicators"""
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
        macd_histogram = macd - macd_signal
        
        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Bollinger Bands
        bb_middle = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        bb_upper = bb_middle + (bb_std * 2)
        bb_lower = bb_middle - (bb_std * 2)
        
        # Volume indicators
        volume_sma = volume.rolling(20).mean()
        volume_ratio = volume.iloc[-1] / volume_sma.iloc[-1] if not volume_sma.empty else 1
        
        # Volatility
        returns = close.pct_change().dropna()
        volatility = returns.std() * np.sqrt(252) * 100  # Annualized
        
        # Support and Resistance
        recent_high = high.rolling(20).max().iloc[-1]
        recent_low = low.rolling(20).min().iloc[-1]
        
        return {
            'sma_20': float(sma_20.iloc[-1]) if not sma_20.empty else None,
            'sma_50': float(sma_50.iloc[-1]) if not sma_50.empty else None,
            'rsi': float(rsi.iloc[-1]) if not rsi.empty else None,
            'macd': float(macd.iloc[-1]) if not macd.empty else None,
            'macd_signal': float(macd_signal.iloc[-1]) if not macd_signal.empty else None,
            'bb_upper': float(bb_upper.iloc[-1]) if not bb_upper.empty else None,
            'bb_lower': float(bb_lower.iloc[-1]) if not bb_lower.empty else None,
            'volume_ratio': float(volume_ratio),
            'volatility': float(volatility),
            'support': float(recent_low),
            'resistance': float(recent_high),
            'trend': 'Bullish' if close.iloc[-1] > sma_20.iloc[-1] else 'Bearish'
        }

    def _analyze_comprehensive_technicals(self):
        """Analyze technical indicators for key indices over the past month"""
        print("[DEBUG] Starting comprehensive technical analysis...")
        try:
            key_symbols = {
                'NIFTY50': '^NSEI',
                'SP500': '^GSPC', 
                'USDINR': 'USDINR=X',
                'BANKNIFTY': '^NSEBANK'
            }
            
            technical_analysis = {}
            
            for name, ticker in key_symbols.items():
                print(f"[DEBUG] Analyzing technical indicators for {name} ({ticker})")
                try:
                    # Get 1 month of data for comprehensive analysis
                    data = self._fetch_stock_data(ticker, '1mo')
                    if not data.empty and len(data) >= 20:
                        tech_indicators = self._calculate_technical_indicators(data)
                        print(f"[DEBUG] Technical indicators for {name}: {tech_indicators}")
                        
                        # Enhanced analysis
                        current_price = data['Close'].iloc[-1]
                        
                        # Trend analysis
                        sma_20 = tech_indicators.get('sma_20')
                        sma_50 = tech_indicators.get('sma_50')
                        rsi = tech_indicators.get('rsi', 50)
                        macd = tech_indicators.get('macd', 0)
                        macd_signal = tech_indicators.get('macd_signal', 0)
                        
                        # Determine trend strength
                        trend_strength = 'Neutral'
                        if sma_20 and sma_50:
                            if current_price > sma_20 > sma_50 and rsi > 55:
                                trend_strength = 'Strong Bullish'
                            elif current_price > sma_20 and rsi > 50:
                                trend_strength = 'Bullish'
                            elif current_price < sma_20 < sma_50 and rsi < 45:
                                trend_strength = 'Strong Bearish'  
                            elif current_price < sma_20 and rsi < 50:
                                trend_strength = 'Bearish'
                        
                        # MACD momentum
                        macd_momentum = 'Neutral'
                        if macd > macd_signal and macd > 0:
                            macd_momentum = 'Strong Bullish'
                        elif macd > macd_signal:
                            macd_momentum = 'Bullish'
                        elif macd < macd_signal and macd < 0:
                            macd_momentum = 'Strong Bearish'
                        elif macd < macd_signal:
                            macd_momentum = 'Bearish'
                        
                        # RSI interpretation
                        rsi_signal = 'Neutral'
                        if rsi > 70:
                            rsi_signal = 'Overbought'
                        elif rsi > 60:
                            rsi_signal = 'Bullish'
                        elif rsi < 30:
                            rsi_signal = 'Oversold'
                        elif rsi < 40:
                            rsi_signal = 'Bearish'
                        
                        technical_analysis[name] = {
                            'indicators': tech_indicators,
                            'trend_strength': trend_strength,
                            'macd_momentum': macd_momentum,
                            'rsi_signal': rsi_signal,
                            'current_price': float(current_price)
                        }
                        
                except Exception as e:
                    print(f"Technical analysis failed for {name}: {e}")
                    technical_analysis[name] = None
            
            return technical_analysis
            
        except Exception as e:
            print(f"Comprehensive technical analysis failed: {e}")
            return {}

    def _get_news_sentiment(self, symbol):
        """Scrape and analyze news sentiment for a stock"""
        try:
            # Try Yahoo Finance first
            url = f"https://finance.yahoo.com/quote/{symbol}/news"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Extract headlines and snippets
                headlines = []
                
                # Yahoo Finance news structure
                news_items = soup.find_all(['h3', 'h4'], class_=re.compile('.*headline.*|.*title.*'))
                for item in news_items[:10]:  # Limit to 10 items
                    text = item.get_text().strip()
                    if text and len(text) > 10:
                        headlines.append(text)
                
                # If no headlines found, try different selectors
                if not headlines:
                    news_items = soup.find_all('a', href=re.compile('.*news.*'))
                    for item in news_items[:10]:
                        text = item.get_text().strip()
                        if text and len(text) > 20:
                            headlines.append(text)
                
                # Analyze sentiment
                if headlines:
                    sentiments = []
                    for headline in headlines:
                        try:
                            blob = TextBlob(headline)
                            sentiment = blob.sentiment.polarity  # -1 to 1
                            sentiments.append(sentiment)
                        except:
                            continue
                    
                    if sentiments:
                        avg_sentiment = np.mean(sentiments)
                        sentiment_score = (avg_sentiment + 1) * 50  # Convert to 0-100 scale
                        
                        return {
                            'sentiment_score': round(sentiment_score, 2),
                            'sentiment_label': self._get_sentiment_label(sentiment_score),
                            'news_count': len(headlines),
                            'headlines': headlines[:5]  # Return top 5 headlines
                        }
            
            # Fallback: return neutral sentiment
            return {
                'sentiment_score': 50.0,
                'sentiment_label': 'Neutral',
                'news_count': 0,
                'headlines': []
            }
            
        except Exception as e:
            print(f"Error getting sentiment for {symbol}: {e}")
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

    def _calculate_market_breadth(self):
        """Calculate market breadth indicators"""
        print("[DEBUG] Starting market breadth calculation...")
        try:
            # Get sector performance
            sectors = {
                'IT': '^CNXIT',
                'Banking': '^NSEBANK',
                'FMCG': '^CNXFMCG',
                'Pharma': '^CNXPHARMA',
                'Auto': '^CNXAUTO'
            }
            
            sector_performance = {}
            for name, ticker in sectors.items():
                print(f"[DEBUG] Fetching sector data for {name} ({ticker})")
                try:
                    data = self._fetch_stock_data(ticker, '5d')
                    if not data.empty and len(data) >= 2:
                        change = ((data['Close'].iloc[-1] - data['Close'].iloc[-2]) / data['Close'].iloc[-2]) * 100
                        sector_performance[name] = round(change, 2)
                        print(f"[DEBUG] {name} sector change: {change:.2f}%")
                    else:
                        print(f"[DEBUG] No data available for {name}")
                        sector_performance[name] = 0.0
                except Exception as e:
                    print(f"[DEBUG] Error fetching {name}: {e}")
                    sector_performance[name] = 0.0
            
            # Calculate advance/decline ratio (simplified)
            positive_sectors = sum(1 for change in sector_performance.values() if change > 0)
            total_sectors = len(sector_performance)
            advance_decline_ratio = positive_sectors / total_sectors if total_sectors > 0 else 0.5
            
            result = {
                'sector_performance': sector_performance,
                'advance_decline_ratio': advance_decline_ratio,
                'breadth_score': advance_decline_ratio * 100
            }
            print(f"[DEBUG] Market breadth result: positive_sectors={positive_sectors}/{total_sectors}, breadth_score={result['breadth_score']}")
            return result
        except Exception as e:
            print(f"[DEBUG] Error calculating market breadth: {e}")
            return {
                'sector_performance': {},
                'advance_decline_ratio': 0.5,
                'breadth_score': 50.0
            }

    def _calculate_fear_greed_index(self, market_data):
        """Calculate a simplified Fear & Greed Index"""
        try:
            # Components: VIX, Market Momentum, Breadth, Safe Haven Demand
            components = {}
            
            # VIX component (0-100, lower VIX = higher greed)
            vix_data = self._fetch_stock_data(self.index_tickers['vix'], '5d')
            if not vix_data.empty:
                current_vix = vix_data['Close'].iloc[-1]
                vix_score = max(0, min(100, 100 - (current_vix - 10) * 2.5))  # Scale VIX 10-50 to 100-0
                components['vix'] = vix_score
            else:
                components['vix'] = 50
            
            # Market momentum (S&P 500 vs 125-day MA)
            sp500_data = self._fetch_stock_data(self.index_tickers['sp500'], '6mo')
            if not sp500_data.empty and len(sp500_data) >= 125:
                current_price = sp500_data['Close'].iloc[-1]
                ma_125 = sp500_data['Close'].rolling(125).mean().iloc[-1]
                momentum_score = 50 + ((current_price - ma_125) / ma_125) * 500  # Scale to 0-100
                components['momentum'] = max(0, min(100, momentum_score))
            else:
                components['momentum'] = 50
            
            # Market breadth
            breadth_data = self._calculate_market_breadth()
            components['breadth'] = breadth_data['breadth_score']
            
            # Safe haven demand (Gold vs stocks)
            try:
                gold_data = self._fetch_stock_data(self.index_tickers['gold'], '1mo')
                if not gold_data.empty and len(gold_data) >= 20:
                    gold_change = ((gold_data['Close'].iloc[-1] - gold_data['Close'].iloc[-20]) / gold_data['Close'].iloc[-20]) * 100
                    safe_haven_score = 50 - (gold_change * 2)  # Inverse relationship
                    components['safe_haven'] = max(0, min(100, safe_haven_score))
                else:
                    components['safe_haven'] = 50
            except:
                components['safe_haven'] = 50
            
            # Calculate weighted average
            weights = {'vix': 0.3, 'momentum': 0.3, 'breadth': 0.25, 'safe_haven': 0.15}
            fear_greed_score = sum(components[key] * weights[key] for key in components)
            
            return {
                'score': round(fear_greed_score, 1),
                'label': self._get_fear_greed_label(fear_greed_score),
                'components': components
            }
            
        except Exception as e:
            print(f"Error calculating Fear & Greed Index: {e}")
            return {
                'score': 50.0,
                'label': 'Neutral',
                'components': {}
            }

    def _get_fear_greed_label(self, score):
        """Convert Fear & Greed score to label"""
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

    def analyze_watchlist_sentiment(self, watchlist_symbols):
        """Analyze sentiment for watchlist stocks"""
        if not watchlist_symbols:
            return {}
        
        sentiment_results = {}
        
        # Use ThreadPoolExecutor for parallel processing with safe timeout handling
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_symbol = {
                executor.submit(self._get_news_sentiment, symbol): symbol
                for symbol in watchlist_symbols[:10]
            }
            neutral_payload = {
                'sentiment_score': 50.0,
                'sentiment_label': 'Neutral',
                'news_count': 0,
                'headlines': []
            }
            try:
                for future in as_completed(future_to_symbol, timeout=15):
                    symbol = future_to_symbol[future]
                    try:
                        result = future.result()
                        sentiment_results[symbol] = result
                    except Exception as e:
                        print(f"Error processing sentiment for {symbol}: {e}")
                        sentiment_results[symbol] = dict(neutral_payload)
            except TimeoutError:
                print("Sentiment analysis timed out; defaulting remaining symbols to neutral")
            finally:
                # Fill in any remaining symbols with neutral sentiment
                for fut, symbol in future_to_symbol.items():
                    if symbol not in sentiment_results:
                        sentiment_results[symbol] = dict(neutral_payload)
        
        return sentiment_results

    def compute_enhanced_market_overview(self, watchlist_symbols=None):
        """Compute comprehensive market overview with sentiment analysis"""
        print("[DEBUG] Starting compute_enhanced_market_overview...")
        try:
            # Basic market data
            market_data = {}

            # Fetch key indices concurrently with a global timeout budget
            def fetch_index_snapshot(name, ticker):
                # short-term cache for index snapshots (reduces volatility and API load)
                print(f"[DEBUG] Fetching index snapshot for {name} ({ticker})")
                try:
                    now = time.time()
                    cached = self._index_cache.get(name)
                    if cached and now - cached.get('ts', 0) < self._index_cache_ttl:
                        print(f"[DEBUG] Using cached data for {name}")
                        return name, cached['data']
                except Exception:
                    pass
                try:
                    data = self._fetch_stock_data(ticker, '5d')
                    if not data.empty and len(data) >= 2:
                        current = data['Close'].iloc[-1]
                        previous = data['Close'].iloc[-2]
                        change = current - previous
                        change_pct = (change / previous) * 100 if previous else 0

                        tech_indicators = self._calculate_technical_indicators(data)

                        result = {
                            'price': round(current, 4 if name == 'usdinr' else 2),
                            'change': round(change, 4 if name == 'usdinr' else 2),
                            'change_percent': round(change_pct, 3 if name == 'usdinr' else 2),
                            'technical': tech_indicators
                        }
                        print(f"[DEBUG] Successfully fetched {name}: price={result['price']}, change%={result['change_percent']}")
                        try:
                            self._index_cache[name] = {'data': result, 'ts': time.time()}
                        except Exception:
                            pass
                        return name, result
                except Exception as e:
                    print(f"[DEBUG] Error processing {name}: {e}")
                return name, {
                    'price': 0,
                    'change': 0,
                    'change_percent': 0,
                    'technical': {}
                }

            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = {
                    executor.submit(fetch_index_snapshot, name, ticker): name
                    for name, ticker in self.index_tickers.items()
                }
                try:
                    for future in as_completed(futures, timeout=12):
                        name, result = future.result()
                        market_data[name] = result
                except TimeoutError:
                    print("Index snapshot fetch timed out; using defaults for remaining indices")
                finally:
                    # Ensure all indices have a value
                    for name in self.index_tickers.keys():
                        if name not in market_data:
                            market_data[name] = {
                                'price': 0,
                                'change': 0,
                                'change_percent': 0,
                                'technical': {}
                            }
            
            # Calculate Fear & Greed Index
            print("[DEBUG] Calculating Fear & Greed Index...")
            fear_greed = self._calculate_fear_greed_index(market_data)
            print(f"[DEBUG] Fear & Greed result: {fear_greed}")
            
            # Market breadth analysis
            print("[DEBUG] Calculating Market Breadth...")
            breadth_analysis = self._calculate_market_breadth()
            print(f"[DEBUG] Market Breadth result: {breadth_analysis}")
            
            # Sentiment analysis for watchlist
            sentiment_analysis = {}
            if watchlist_symbols:
                print("[DEBUG] Analyzing watchlist sentiment...")
                sentiment_analysis = self.analyze_watchlist_sentiment(watchlist_symbols)
            else:
                print("[DEBUG] No watchlist symbols provided, skipping sentiment analysis")
            
            # Enhanced regime scoring
            print("[DEBUG] Calculating enhanced regime factors...")
            regime_factors = self._calculate_enhanced_regime_factors(market_data)
            print(f"[DEBUG] Regime factors result: {regime_factors}")
            
            # Correlation analysis
            print("[DEBUG] Calculating correlations...")
            correlation_matrix = self._calculate_correlations()
            
            # Comprehensive technical analysis for key indices
            print("[DEBUG] Performing comprehensive technical analysis...")
            technical_analysis = self._analyze_comprehensive_technicals()
            print(f"[DEBUG] Technical analysis result keys: {list(technical_analysis.keys()) if technical_analysis else 'None'}")
            
            # Build India-focused slice
            india_focus_keys = [
                'nifty50','banknifty','niftyit','niftypharma','niftyauto','niftyfmcg',
                'niftypsubank','niftymetal','niftyinfra','niftyenergy','indiavix','usdinr'
            ]
            india_focus = {k: market_data.get(k, {}) for k in india_focus_keys if market_data.get(k)}
            print(f"[DEBUG] India focus data keys: {list(india_focus.keys())}")

            print("[DEBUG] Generating market summary with technical analysis...")
            market_summary = self._generate_market_summary(market_data, fear_greed, breadth_analysis, regime_factors, technical_analysis)
            print(f"[DEBUG] Generated market summary: {market_summary}")

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
                    'niftypsubank': market_data.get('niftypsubank', {}),
                    'niftymetal': market_data.get('niftymetal', {}),
                    'niftyinfra': market_data.get('niftyinfra', {}),
                    'niftyenergy': market_data.get('niftyenergy', {})
                },
                'india_focus': india_focus,
                'regime': regime_factors,
                'fear_greed_index': fear_greed,
                'market_breadth': breadth_analysis,
                'sentiment_analysis': sentiment_analysis,
                'correlations': correlation_matrix,
                'market_summary': market_summary
            }
            # Final safeguard: sanitize regime factors numeric fields and log
            try:
                factors = overview.get('regime', {}).get('factors', [])
                def _finite(x):
                    try:
                        return np.isfinite(float(x))
                    except Exception:
                        return False
                all_finite = True
                for f in factors:
                    if not _finite(f.get('score')):
                        f['score'] = 0.0
                        all_finite = False
                    if not _finite(f.get('value')):
                        f['value'] = 0.0
                        all_finite = False
                print(f"[Regime factors] count={len(factors)}, all_finite={all_finite}")
                if not all_finite:
                    bad = [f for f in factors if not _finite(f.get('score')) or not _finite(f.get('value'))]
                    print("[Regime factors] invalid entries:", bad)
            except Exception as _e:
                print("Regime sanitation/log failed:", _e)
            # Phase 2: Add watchlist analytics if provided
            if watchlist_symbols:
                try:
                    overview['watchlist_analytics'] = self.compute_watchlist_analytics(watchlist_symbols)
                except Exception as e:
                    print(f"Watchlist analytics integration error: {e}")
            # Sector rotation
            try:
                overview['sector_rotation'] = self.compute_sector_rotation()
            except Exception as e:
                print(f"Sector rotation integration error: {e}")
            # Volatility spike events based on index realized vol changes (simple heuristic)
            try:
                vol_events = []
                for key, idx in market_data.items():
                    tech = idx.get('technical', {}) if isinstance(idx, dict) else {}
                    # Expect realized volatility if computed earlier; placeholder: use abs change pct
                    cpct = idx.get('change_percent', 0)
                    if abs(cpct) >= 2.5:  # threshold
                        vol_events.append({'index': key, 'change_percent': cpct})
                overview['volatility_events'] = vol_events
            except Exception as e:
                print(f"Volatility events integration error: {e}")
            return overview

        except Exception as e:
            print(f"Error in compute_enhanced_market_overview: {e}")
            # Return minimal data structure
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

    def _guess_sector_from_symbol(self, symbol):
        """Guess sector from symbol patterns - Enhancement 1: Smart Sector Classification"""
        symbol = symbol.upper()
        tech_patterns = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX']
        finance_patterns = ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C']
        healthcare_patterns = ['JNJ', 'PFE', 'UNH', 'MRK', 'ABBV']
        energy_patterns = ['XOM', 'CVX', 'COP', 'EOG', 'SLB']
        
        if any(p in symbol for p in tech_patterns):
            return 'Technology'
        elif any(p in symbol for p in finance_patterns):
            return 'Financial Services'
        elif any(p in symbol for p in healthcare_patterns):
            return 'Healthcare'
        elif any(p in symbol for p in energy_patterns):
            return 'Energy'
        else:
            return 'Unknown'

    def _calculate_enhanced_regime_factors(self, market_data):
        """Calculate enhanced regime factors"""
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
                'details': f'Current: {vix_level:.1f} (Lower is better)'
            })
            scores.append(vix_score)
            
            # Market Momentum
            sp500_change = market_data.get('sp500', {}).get('change_percent', 0)
            momentum_score = max(0, min(10, 5 + sp500_change * 0.5))
            factors.append({
                'name': 'S&P 500 Momentum',
                'value': sp500_change,
                'score': round(momentum_score, 2),
                'details': f'{sp500_change:+.2f}% daily change'
            })
            scores.append(momentum_score)
            
            # Dollar Strength
            dxy_change = market_data.get('dxy', {}).get('change_percent', 0)
            dollar_score = max(0, min(10, 5 - dxy_change * 0.3))  # Weaker dollar is better for risk assets
            factors.append({
                'name': 'Dollar Index',
                'value': dxy_change,
                'score': round(dollar_score, 2),
                'details': f'{dxy_change:+.2f}% (Weaker USD favors risk assets)'
            })
            scores.append(dollar_score)
            
            # Crypto Risk Appetite
            btc_change = market_data.get('bitcoin', {}).get('change_percent', 0)
            crypto_score = max(0, min(10, 5 + btc_change * 0.1))
            factors.append({
                'name': 'Bitcoin Sentiment',
                'value': btc_change,
                'score': round(crypto_score, 2),
                'details': f'{btc_change:+.2f}% (Risk-on indicator)'
            })
            scores.append(crypto_score)
            
            # Commodity Inflation
            crude_change = market_data.get('crude', {}).get('change_percent', 0)
            commodity_score = max(0, min(10, 5 - crude_change * 0.2))  # Rising oil can be negative
            factors.append({
                'name': 'Crude Oil Pressure',
                'value': crude_change,
                'score': round(commodity_score, 2),
                'details': f'{crude_change:+.2f}% (High oil pressures growth)'
            })
            scores.append(commodity_score)
            
            # Safe Haven Demand
            gold_change = market_data.get('gold', {}).get('change_percent', 0)
            safe_haven_score = max(0, min(10, 5 - gold_change * 0.3))  # Rising gold indicates fear
            factors.append({
                'name': 'Safe Haven Demand',
                'value': gold_change,
                'score': round(safe_haven_score, 2),
                'details': f'Gold {gold_change:+.2f}% (Rising gold = fear)'
            })
            scores.append(safe_haven_score)

            # India VIX (risk sentiment for Indian markets)
            indiavix_level = market_data.get('indiavix', {}).get('price', 15)
            indiavix_score = max(0, min(10, 10 - (indiavix_level - 12) * 0.35))
            factors.append({
                'name': 'India VIX (Risk Sentiment)',
                'value': indiavix_level,
                'score': round(indiavix_score, 2),
                'details': f'India VIX: {indiavix_level:.1f} (Lower is better)'
            })
            scores.append(indiavix_score)

            # Nifty momentum (daily change)
            nifty_change = market_data.get('nifty50', {}).get('change_percent', 0)
            nifty_momo_score = max(0, min(10, 5 + nifty_change * 0.6))
            factors.append({
                'name': 'Nifty Momentum',
                'value': nifty_change,
                'score': round(nifty_momo_score, 2),
                'details': f'{nifty_change:+.2f}% daily change (India)'
            })
            scores.append(nifty_momo_score)

            # USD/INR (currency pressure: stronger INR positive for equities)
            usdinr_change = market_data.get('usdinr', {}).get('change_percent', 0)
            inr_score = max(0, min(10, 5 - usdinr_change * 0.8))
            factors.append({
                'name': 'USD/INR Pressure',
                'value': usdinr_change,
                'score': round(inr_score, 2),
                'details': f'USD/INR {usdinr_change:+.3f}% (INR strength favors risk)'
            })
            scores.append(inr_score)
            
            # Calculate overall regime score
            overall_score = np.mean(scores) if scores else 5.0
            
            return {
                'score': round(overall_score, 2),
                'factors': factors,
                'interpretation': self._interpret_regime_score(overall_score)
            }
            
        except Exception as e:
            print(f"Error calculating regime factors: {e}")
            return {
                'score': 5.0,
                'factors': [],
                'interpretation': 'Neutral market regime'
            }

    def _interpret_regime_score(self, score):
        """Interpret regime score"""
        if score >= 8:
            return 'Strong Bull Market - High risk appetite, favorable conditions'
        elif score >= 6:
            return 'Bullish Regime - Generally positive market conditions'
        elif score >= 4:
            return 'Neutral Regime - Mixed signals, cautious approach recommended'
        elif score >= 2:
            return 'Bearish Regime - Risk-off sentiment, defensive positioning'
        else:
            return 'Bear Market - High fear, significant risk aversion'

    def _calculate_correlations(self):
        """Calculate asset correlations"""
        try:
            # Get 1-month data for key assets
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
                # Compute correlations and sanitize NaN/Inf to 0 for JSON safety
                corr_matrix = df.corr().replace([np.inf, -np.inf], np.nan).fillna(0)
                
                # Convert to dictionary format with safe float rounding
                correlations = {}
                for i, asset1 in enumerate(corr_matrix.index):
                    correlations[asset1] = {}
                    for j, asset2 in enumerate(corr_matrix.columns):
                        if i != j:  # Exclude self-correlation
                            val = corr_matrix.iloc[i, j]
                            try:
                                corr_val = round(float(val), 3)
                            except Exception:
                                corr_val = 0.0
                            correlations[asset1][asset2] = corr_val
                
                return correlations
            
            return {}
            
        except Exception as e:
            print(f"Error calculating correlations: {e}")
            return {}

    def _generate_market_summary(self, market_data, fear_greed, breadth_analysis, regime_factors=None, technical_analysis=None):
        """Generate comprehensive AI-powered market analysis using all available data including technical indicators"""
        print("[DEBUG] Starting market summary generation...")
        print(f"[DEBUG] Market data keys: {list(market_data.keys()) if market_data else 'None'}")
        print(f"[DEBUG] Fear & greed: {fear_greed}")
        print(f"[DEBUG] Breadth analysis: {breadth_analysis}")
        print(f"[DEBUG] Technical analysis keys: {list(technical_analysis.keys()) if technical_analysis else 'None'}")
        
        try:
            # Gather comprehensive market intelligence
            nifty_data = market_data.get('nifty50', {})
            sp500_data = market_data.get('sp500', {})
            vix_data = market_data.get('vix', {})
            usdinr_data = market_data.get('usdinr', {})
            gold_data = market_data.get('gold', {})
            crude_data = market_data.get('crude', {})
            bitcoin_data = market_data.get('bitcoin', {})
            
            # Extract key metrics with proper defaults
            nifty_change = nifty_data.get('change_percent', 0) or 0
            sp500_change = sp500_data.get('change_percent', 0) or 0
            vix_level = vix_data.get('price', 20) or 20
            usdinr_change = usdinr_data.get('change_percent', 0) or 0
            fear_greed_score = fear_greed.get('score', 50) or 50
            breadth_score = breadth_analysis.get('breadth_score', 50) or 50
            
            # Enhanced technical analysis insights
            nifty_tech = technical_analysis.get('NIFTY50', {}) if technical_analysis else {}
            sp500_tech = technical_analysis.get('SP500', {}) if technical_analysis else {}
            banknifty_tech = technical_analysis.get('BANKNIFTY', {}) if technical_analysis else {}
            usdinr_tech = technical_analysis.get('USDINR', {}) if technical_analysis else {}
            
            # Market regime analysis
            regime_score = 50
            if regime_factors and 'factors' in regime_factors:
                regime_score = np.mean([f.get('score', 50) for f in regime_factors['factors'] if isinstance(f.get('score'), (int, float))])
            
            # AI-powered market analysis components with technical integration
            print("[DEBUG] Calling market tone analysis...")
            try:
                market_tone = self._analyze_market_tone_with_technicals(nifty_change, sp500_change, fear_greed_score, nifty_tech, sp500_tech)
                print(f"[DEBUG] Market tone result: {market_tone}")
            except Exception as e:
                print(f"[DEBUG] Market tone error: {e}")
                market_tone = "Market sentiment mixed."
            
            print("[DEBUG] Calling technical environment assessment...")
            try:
                technical_outlook = self._assess_technical_environment(nifty_tech, sp500_tech, banknifty_tech)
                print(f"[DEBUG] Technical outlook result: {technical_outlook}")
            except Exception as e:
                print(f"[DEBUG] Technical outlook error: {e}")
                technical_outlook = "Technical indicators neutral."
            
            print("[DEBUG] Calling volatility assessment...")
            try:
                volatility_assessment = self._assess_volatility_environment(vix_level, breadth_score)
                print(f"[DEBUG] Volatility assessment result: {volatility_assessment}")
            except Exception as e:
                print(f"[DEBUG] Volatility assessment error: {e}")
                volatility_assessment = "Volatility environment stable."
            
            print("[DEBUG] Calling sector rotation analysis...")
            try:
                sector_rotation = self._analyze_sector_dynamics(market_data)
                print(f"[DEBUG] Sector rotation result: {sector_rotation}")
            except Exception as e:
                print(f"[DEBUG] Sector rotation error: {e}")
                sector_rotation = "Sector rotation ongoing."
                
            print("[DEBUG] Calling currency technical analysis...")
            try:
                currency_technical = self._assess_currency_with_technicals(usdinr_change, usdinr_tech)
                print(f"[DEBUG] Currency technical result: {currency_technical}")
            except Exception as e:
                print(f"[DEBUG] Currency technical error: {e}")
                currency_technical = "Currency impact neutral."
                
            print("[DEBUG] Calling risk factors analysis...")
            try:
                risk_factors = self._identify_technical_risks(market_data, fear_greed, regime_score, technical_analysis)
                print(f"[DEBUG] Risk factors result: {risk_factors}")
            except Exception as e:
                print(f"[DEBUG] Risk factors error: {e}")
                risk_factors = "Risk environment manageable."
            
            # Generate intelligent summary with technical insights
            summary_parts = [market_tone, technical_outlook, volatility_assessment, sector_rotation, currency_technical, risk_factors]
            
            # Filter out empty parts and join
            valid_parts = [part.strip() for part in summary_parts if part and part.strip()]
            print(f"[DEBUG] Summary parts: {summary_parts}")
            print(f"[DEBUG] Valid parts: {valid_parts}")
            if not valid_parts:
                print("[DEBUG] No valid parts found, using fallback summary")
                return self._fallback_market_summary(market_data, fear_greed, breadth_analysis)
            
            summary = ' '.join(valid_parts)
            print(f"[DEBUG] Generated summary before processing: {summary}")
            
            # Ensure exactly ~50 words while maintaining intelligence
            words = summary.split()
            if len(words) > 55:
                summary = ' '.join(words[:50]) + "..."
            elif len(words) < 45:
                additional_tech = self._get_additional_technical_insight(technical_analysis)
                summary += f" {additional_tech}."
            
            # Add disclaimer
            summary += " Note: This is not financial advice. Please conduct your own research before investing."
            
            print(f"[DEBUG] Final summary: {summary}")
            return summary.strip()
            
        except Exception as e:
            print(f"Error generating AI market summary: {e}")
            return self._fallback_market_summary(market_data, fear_greed, breadth_analysis)
    
    def _analyze_market_tone_with_technicals(self, nifty_change, sp500_change, fear_greed_score, nifty_tech, sp500_tech):
        """Analyze overall market sentiment and tone with technical indicator support"""
        try:
            avg_change = (float(nifty_change) + float(sp500_change)) / 2
            
            # Integrate technical signals
            nifty_rsi = nifty_tech.get('rsi', {}).get('value', 50)
            sp500_rsi = sp500_tech.get('rsi', {}).get('value', 50)
            avg_rsi = (nifty_rsi + sp500_rsi) / 2
            
            nifty_trend = nifty_tech.get('trend_strength', 50)
            sp500_trend = sp500_tech.get('trend_strength', 50)
            avg_trend = (nifty_trend + sp500_trend) / 2
            
            if avg_change > 1.5 and fear_greed_score > 60 and avg_trend > 70:
                return "Strong bullish momentum with technical breakouts and elevated risk appetite."
            elif avg_change > 0.5 and avg_rsi < 70:
                return "Cautious optimism with healthy technical conditions."
            elif avg_change > -0.5 and avg_trend > 40:
                return "Consolidation phase with neutral technical indicators."
            elif fear_greed_score < 30 and avg_rsi < 40:
                return "Oversold conditions create potential contrarian opportunities."
            else:
                return "Bearish sentiment with technical weakness requiring defensive positioning."
        except Exception:
            return "Markets showing mixed sentiment with unclear technical signals."
    
    def _assess_technical_environment(self, nifty_tech, sp500_tech, banknifty_tech):
        """Assess overall technical environment across major indices"""
        try:
            indices_tech = [nifty_tech, sp500_tech, banknifty_tech]
            valid_tech = [tech for tech in indices_tech if tech]
            
            if not valid_tech:
                return "Technical indicators remain inconclusive."
            
            # Calculate average trend strength
            trend_strengths = []
            rsi_values = []
            macd_signals = []
            
            for tech in valid_tech:
                trend_strengths.append(tech.get('trend_strength', 50))
                rsi_values.append(tech.get('rsi', {}).get('value', 50))
                macd_momentum = tech.get('macd_momentum', 'neutral')
                macd_signals.append(1 if macd_momentum == 'bullish' else -1 if macd_momentum == 'bearish' else 0)
            
            avg_trend = sum(trend_strengths) / len(trend_strengths)
            avg_rsi = sum(rsi_values) / len(rsi_values)
            avg_macd = sum(macd_signals) / len(macd_signals)
            
            if avg_trend > 70 and avg_macd > 0.3:
                return "Technical indicators show strong bullish alignment across indices."
            elif avg_trend > 50 and avg_rsi < 70:
                return "Technical setup remains constructive with room for upside."
            elif avg_trend < 30 and avg_macd < -0.3:
                return "Technical breakdown signals require caution."
            else:
                return "Mixed technical signals suggest range-bound conditions."
                
        except Exception:
            return "Technical analysis inconclusive."
    
    def _assess_currency_with_technicals(self, usdinr_change, usdinr_tech):
        """Assess currency impact with technical analysis"""
        try:
            usdinr_change = float(usdinr_change)
            
            # Get technical insights
            rsi_value = usdinr_tech.get('rsi', {}).get('value', 50)
            trend_strength = usdinr_tech.get('trend_strength', 50)
            macd_momentum = usdinr_tech.get('macd_momentum', 'neutral')
            
            if usdinr_change > 0.5 and trend_strength > 60:
                return "Rupee weakness creates FII outflow pressure."
            elif usdinr_change < -0.5 and rsi_value < 40:
                return "Rupee strength supports FII inflow potential."
            elif abs(usdinr_change) < 0.2 and macd_momentum == 'neutral':
                return "Currency stability supports market confidence."
            else:
                return "Currency volatility adds market uncertainty."
                
        except Exception:
            return "Currency impact remains mixed."
    
    def _identify_technical_risks(self, market_data, fear_greed, regime_score, technical_analysis):
        """Identify key market risks with technical validation"""
        try:
            risks = []
            
            # VIX spike risk
            vix_level = float(market_data.get('vix', {}).get('price', 20))
            if vix_level > 25:
                risks.append("elevated volatility")
            
            # Technical breakdown risk
            if technical_analysis:
                nifty_trend = technical_analysis.get('NIFTY50', {}).get('trend_strength', 50)
                sp500_trend = technical_analysis.get('SP500', {}).get('trend_strength', 50)
                
                if nifty_trend < 30 and sp500_trend < 30:
                    risks.append("technical breakdown")
                    
                # Overbought conditions
                nifty_rsi = technical_analysis.get('NIFTY50', {}).get('rsi', {}).get('value', 50)
                if nifty_rsi > 75:
                    risks.append("overbought levels")
            
            # Fear extreme risk
            fear_score = float(fear_greed.get('score', 50))
            if fear_score < 20:
                risks.append("extreme fear")
            elif fear_score > 80:
                risks.append("excessive greed")
            
            if risks:
                risk_text = ", ".join(risks[:2])  # Limit to 2 key risks
                return f"Key risks: {risk_text}."
            else:
                return "Risk environment appears manageable."
                
        except Exception:
            return "Risk assessment requires monitoring."
    
    def _get_additional_technical_insight(self, technical_analysis):
        """Get additional technical insight for summary padding"""
        try:
            if not technical_analysis:
                return "Technical setup requires monitoring"
                
            # Get NIFTY50 insights
            nifty_tech = technical_analysis.get('NIFTY50', {})
            rsi_interpretation = nifty_tech.get('rsi', {}).get('interpretation', 'neutral')
            macd_momentum = nifty_tech.get('macd_momentum', 'neutral')
            
            if rsi_interpretation == 'oversold' and macd_momentum == 'bullish':
                return "Technical reversal signals emerging"
            elif rsi_interpretation == 'overbought':
                return "Overbought conditions warrant caution"
            elif macd_momentum == 'bullish':
                return "MACD shows positive momentum"
            else:
                return "Technical indicators remain neutral"
                
        except Exception:
            return "Technical analysis ongoing"
    
    def _assess_volatility_environment(self, vix_level, breadth_score):
        """Assess volatility and market structure"""
        try:
            vix_level = float(vix_level)
            breadth_score = float(breadth_score)
            
            if vix_level > 25:
                return f"Elevated volatility (VIX: {vix_level:.0f}) signals heightened uncertainty."
            elif vix_level < 15:
                return f"Low volatility (VIX: {vix_level:.0f}) suggests complacent conditions."
            else:
                breadth_desc = "broad-based" if breadth_score > 60 else "narrow"
                return f"Moderate volatility with {breadth_desc} participation."
        except Exception:
            return "Volatility environment remains uncertain."
    
    def _analyze_sector_dynamics(self, market_data):
        """Analyze sector rotation and leadership patterns"""
        try:
            sectors = ['niftyit', 'niftypharma', 'niftyauto', 'niftyfmcg', 'niftymetal', 'niftyenergy']
            sector_performance = []
            
            for sector in sectors:
                sector_data = market_data.get(sector, {})
                change = sector_data.get('change_percent', 0) or 0
                if abs(float(change)) > 0.1:  # Only consider sectors with meaningful moves
                    sector_performance.append((sector.replace('nifty', '').upper(), float(change)))
            
            if not sector_performance:
                return "Sector rotation remains muted."
            
            # Find best and worst performing sectors
            sector_performance.sort(key=lambda x: x[1], reverse=True)
            leader = sector_performance[0]
            laggard = sector_performance[-1]
            
            if leader[1] > 1:
                return f"{leader[0]} leads sector rotation (+{leader[1]:.1f}%)."
            elif laggard[1] < -1:
                return f"{laggard[0]} underperforms significantly ({laggard[1]:.1f}%)."
            else:
                return "Sector performance remains balanced."
        except Exception:
            return "Sector analysis unavailable."
    
    def _assess_currency_trends(self, usdinr_change, usdinr_data):
        """Assess currency trends and FII impact"""
        try:
            change = float(usdinr_change) if usdinr_change else 0
            
            if abs(change) < 0.2:
                return "Currency stability supports FII flows."
            elif change > 0.3:
                return f"Rupee weakness (+{change:.1f}%) may pressure FII sentiment."
            else:
                return f"Rupee strength ({change:.1f}%) attracts foreign capital."
        except Exception:
            return "Currency trends remain stable."
    
    def _identify_key_risks(self, market_data, fear_greed, regime_score):
        """Identify primary market risks and opportunities"""
        try:
            risks = []
            
            vix_level = market_data.get('vix', {}).get('price', 20) or 20
            fear_score = fear_greed.get('score', 50) or 50
            
            if float(fear_score) > 75:
                risks.append("extreme greed warns of potential correction")
            elif float(fear_score) < 25:
                risks.append("oversold conditions favor contrarian plays")
            
            if float(vix_level) > 30:
                risks.append("high volatility demands selective approach")
            elif float(regime_score) < 40:
                risks.append("regime uncertainty counsels caution")
            
            if not risks:
                return "Risk-reward balance appears favorable for selective opportunities."
            
            return f"Key considerations: {risks[0]}."
        except Exception:
            return "Market risks remain manageable."
    
    def _get_technical_outlook(self, nifty_tech, sp500_tech):
        """Generate technical analysis outlook"""
        outlooks = []
        
        nifty_rsi = nifty_tech.get('rsi', 50)
        if nifty_rsi > 70:
            outlooks.append("overbought conditions")
        elif nifty_rsi < 30:
            outlooks.append("oversold bounce potential")
        
        if outlooks:
            return outlooks[0]
        return "neutral momentum"
    
    def _fallback_market_summary(self, market_data, fear_greed, breadth_analysis):
        """Fallback summary if AI analysis fails"""
        print("[DEBUG] Using fallback market summary!")
        try:
            sp500_change = market_data.get('sp500', {}).get('change_percent', 0)
            vix_level = market_data.get('vix', {}).get('price', 20)
            fear_greed_score = fear_greed.get('score', 50)
            breadth_score = breadth_analysis.get('breadth_score', 50)
            
            # Generate summary based on conditions
            summary_parts = []
            
            # Market direction
            if sp500_change > 1:
                summary_parts.append("Markets showing strong bullish momentum")
            elif sp500_change > 0:
                summary_parts.append("Markets posting modest gains")
            elif sp500_change > -1:
                summary_parts.append("Markets showing minor weakness")
            else:
                summary_parts.append("Markets under significant pressure")
            
            # Fear/Greed context
            if fear_greed_score > 70:
                summary_parts.append("with extreme greed levels suggesting potential overextension")
            elif fear_greed_score > 60:
                summary_parts.append("amid elevated risk appetite")
            elif fear_greed_score < 30:
                summary_parts.append("with extreme fear creating potential opportunities")
            elif fear_greed_score < 40:
                summary_parts.append("as fear dominates sentiment")
            
            # VIX context
            if vix_level > 30:
                summary_parts.append(f"High volatility (VIX: {vix_level:.1f}) indicates elevated uncertainty")
            elif vix_level < 15:
                summary_parts.append(f"Low volatility (VIX: {vix_level:.1f}) suggests complacency")
            
            # Breadth context
            if breadth_score > 70:
                summary_parts.append("Broad-based sector participation supports the move")
            elif breadth_score < 30:
                summary_parts.append("Narrow market breadth raises sustainability concerns")
            
            return ". ".join(summary_parts) + "."
            
        except Exception as e:
            print(f"Error generating market summary: {e}")
            return "Market analysis temporarily unavailable due to data processing issues."

# Global instance
market_intelligence = AdvancedMarketIntelligence()

def compute_market_overview():
    """Legacy function for backward compatibility"""
    return market_intelligence.compute_enhanced_market_overview()

def compute_enhanced_market_overview(watchlist_symbols=None):
    """Enhanced market overview with sentiment analysis"""
    print("=== ENHANCED MARKET OVERVIEW CALLED ===")
    return market_intelligence.compute_enhanced_market_overview(watchlist_symbols)