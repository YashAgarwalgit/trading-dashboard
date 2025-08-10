"""Deprecated standalone Technical Indicators microservice.

Unified into main backend (stock_service.py). This file retained for reference
but should not be executed. If needed, you can re-enable by fixing imports
and running separately on a distinct port.
"""

import json
from flask import Flask, request, jsonify
from stock_service import StockDataService  # noqa: F401 (used for legacy compatibility)

app = Flask(__name__)

# Supported indices
INDICES = {
    'NIFTY50': '^NSEI',
    'S&P 500': '^GSPC',
    'USD/INR': 'USDINR=X',
    'BANKNIFTY': '^NSEBANK',
}

PERIODS = {
    '1M': '1mo',
    '3M': '3mo',
    '6M': '6mo',
    '1Y': '1y',
    '3Y': '3y',
}

def calculate_technical_indicators(data):
    # Example: Calculate simple moving average (SMA)
    closes = [d['close'] for d in data]
    sma = sum(closes[-20:]) / 20 if len(closes) >= 20 else None
    return {
        'sma_20': sma,
        # Add more indicators as needed
    }

stock_service = StockDataService()

@app.route('/api/technical/indicators', methods=['POST'])
def get_technical_indicators():
    req = request.get_json()
    ticker = req.get('ticker')
    period = req.get('period', '1M')
    yf_period = PERIODS.get(period, '1mo')
    if ticker in INDICES:
        symbol = INDICES[ticker]
    else:
        symbol = ticker
    result = stock_service.get_historical_data(symbol, yf_period)
    if not result or 'error' in result:
        return jsonify({'error': result.get('error', 'No data found')}), 404
    data = result['data']
    indicators = calculate_technical_indicators(data)
    return jsonify({'symbol': symbol, 'period': yf_period, 'indicators': indicators, 'data': data})

@app.route('/api/technical/supported', methods=['GET'])
def get_supported():
    # For now, just return the indices and a static list of example tickers
    tickers = ['RELIANCE', 'TCS', 'AAPL', 'TSLA', 'INFY', 'MSFT', 'GOOGL']
    return jsonify({'indices': list(INDICES.keys()), 'tickers': tickers})

if __name__ == '__main__':
    print("Standalone technical_indicators_service is deprecated. Use unified /api/technical endpoints on main service.")
