<!-- AUTOMATICALLY GENERATED / MAINTAINED DOCUMENTATION (Updated: 2025-08-10) -->

# Live Trading & Market Intelligence Platform (V6.0)

Institutional‑style, client‑side rich paper trading & market intelligence platform featuring:

* Real‑time multi‑market (US + NSE/BSE) price streaming (WebSocket / 5s cadence)
* Intelligent ticker resolution (automatic .NS / .BO suffix detection & fallback)
* Portfolio lifecycle: create, value, transact (BUY/SELL), delete, repair & integrity audit
* Enhanced Market Intelligence: regime scoring, Fear & Greed, breadth, sentiment scraping, correlations, India focus dashboard
* Watchlist sentiment & news headline scoring (TextBlob polarity → normalized 0‑100)
* Historical OHLC retrieval for interactive charts
* Robust database self‑healing & corruption mitigation tools
* Extensible modular vanilla JS frontend (no framework lock‑in) with pluggable enhancement modules

> DISCLAIMER: This is a paper / simulation environment. Market data sourced via yfinance (subject to delays, gaps, occasional inconsistencies). Do **NOT** use for production order routing or capital deployment without rigorous validation, compliance, and licensed data feeds.

---

## 📚 Table of Contents

1. [Architecture Summary](#architecture-summary)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Concepts](#core-concepts)
5. [Backend Components](#backend-components)
6. [Frontend Modules](#frontend-modules)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)
9. [Real‑Time & Caching Model](#real-time--caching-model)
10. [Enhanced Market Intelligence](#enhanced-market-intelligence)
11. [Portfolio Engine](#portfolio-engine)
12. [Security & Validation](#security--validation)
13. [Performance Strategies](#performance-strategies)
14. [Local Development](#local-development)
15. [Deployment](#deployment)
16. [Maintenance & Recovery](#maintenance--recovery)
17. [Troubleshooting](#troubleshooting)
18. [Roadmap](#roadmap)
19. [Contributing](#contributing)

---

## 1. Architecture Summary

```
┌───────────────┐   HTTPS / WebSocket   ┌────────────────────┐
│  Frontend     │◄────────────────────►│  Flask API + WS     │
│  (Vanilla JS) │                      │  (stock_service.py) │
└──────┬────────┘                      └─────────┬──────────┘
       │   DOM events / modules                   │
       ▼                                          ▼
┌───────────────┐                          ┌───────────────┐
│  UI Modules   │                          │  SQLite (ACID) │
│  (Watchlist,  │                          │  portfolios +  │
│  Portfolio,   │                          │  transactions  │
│  Intelligence)│                          └──────┬────────┘
└───────────────┘                                 │
                                                  ▼
                                           ┌───────────────┐
                                           │ yfinance /    │
                                           │ Web scraping  │
                                           └───────────────┘
```

### Data & Event Pipelines
* Live Quotes: yfinance pull → rate limit + formatting → broadcast per session room (5s loop)
* Historical Data: on‑demand OHLC fetch (period param) → chart payload
* Market Intelligence: concurrent index snapshots + technical + breadth + sentiment + regime scoring
* Portfolio Actions: request → validation → transactional DB update → in‑memory cache sync → response

---

## 2. Technology Stack

### Backend
| Category | Packages |
|----------|----------|
| Web / WS | Flask 3.0.0, Flask-SocketIO 5.3.6, Flask-CORS 4.0.0 |
| Data     | yfinance 0.2.65, pandas 2.1.4, numpy 1.26.4 |
| Parsing  | beautifulsoup4 4.12.2, lxml 4.9.3 |
| NLP      | textblob 0.17.1 |
| Transport| requests 2.31.0, python-socketio 5.10.0 |
| Storage  | SQLite (stdlib) |

### Frontend (No build step) 
Vanilla ES6 modules + Socket.IO client (CDN) + Chart.js (charts) + semantic CSS (custom design system).

---

## 3. Project Structure
```
JAVA-DASHBOARD/
├─ backend/
│  ├─ stock_service.py              # REST + WebSocket server & portfolio engine
│  ├─ market_metrics_enhanced.py    # Advanced market intelligence & sentiment
│  ├─ requirements.txt
│  └─ data/trading_platform.db      # SQLite (auto-created)
├─ frontend/
│  ├─ index.html                    # Multi-tab shell (dashboard, trading, portfolio, market intel)
│  ├─ app.js                        # Core platform class + WebSocket manager
│  ├─ market_intelligence_enhanced.js  # Regime, sentiment, correlations UI
│  ├─ portfolio-enhancements.js     # Extended analytics, deletion, export
│  ├─ technical_indicators.js       # (Optional external tech indicator API hook)
│  └─ style.css                     # Component + layout system
├─ run.bat                          # Windows bootstrap helper
└─ README.md                        # This file
```

---

## 4. Core Concepts
| Concept | Description |
|---------|-------------|
| Intelligent Ticker Resolution | Attempts raw → .NS → .BO; caches first success to reduce API load. |
| Session-Scoped Subscriptions | Each WebSocket client tracks 1 active ticker at a time (simple room mapping). |
| Dual Caching Layers | (a) Ticker resolution cache (suffix discovery) (b) Short index snapshot cache (10s TTL) for regime panel. |
| Regime Score (0‑10) | Weighted composite of volatility, momentum, cross-asset signals, local risk (India VIX), currency pressure, etc. |
| Sentiment Scoring | Headline polarity aggregation mapped to 0–100 with qualitative labels. |
| Breadth & Sector Pulse | Per‑sector daily % delta & advance/decline derived breadth score. |
| Database Resilience | Integrity scan + selective repair (invalid numeric fields) + optional purge of unrecoverable rows. |

---

## 5. Backend Components

### RateLimiter
Sliding window call accounting (thread‑safe) guarding yfinance + scraping pressure.

### StockDataService
* Real‑time fetch & formatting (change %, volume normalization, currency inference)
* Historical OHLC aggregator (period selectable)
* NSE/BSE auto suffix logic + caching

### PortfolioManager
* CRUD: create, read, value, delete
* Transactional BUY / SELL with average price recomputation
* Transaction ledger persistence (portfolio_transactions)
* Integrity audit + repair & reload sequence

### AdvancedMarketIntelligence
* Concurrent index snapshot retrieval (ThreadPoolExecutor with timeout budget)
* Technical overlay (SMA, RSI, MACD, Bollinger, volatility, support/resistance)
* Fear & Greed (composite weighting)
* Breadth (sector change distribution)
* Watchlist sentiment scraping (Yahoo Finance headlines + TextBlob polarity)
* Crypto / commodities / FX context (BTC, crude, gold, USD Index, USD/INR)
* Correlation matrix (sanitized, finite float rounding)
* Regime factor sanitation (NaN / Inf neutralization)

---

## 6. Frontend Modules
| Module | Purpose |
|--------|---------|
| app.js | Core platform orchestration: watchlist, WebSocket, portfolio UI, order flow. |
| market_intelligence_enhanced.js | Renders regime score radar, Fear & Greed gauge, sentiment grid, correlations, India focus panel. |
| portfolio-enhancements.js | Adds analytics (best/worst, diversification), multi-view positions, CSV export, deletion modal. |
| technical_indicators.js | Optional hook to an external technical indicator microservice (port 5002). |

Key UI Concepts: progressive enhancement (modules check DOM presence), resilient reconnection, accessible status toasts, dynamic tab activation.

---

## 7. Database Schema
Primary tables (auto-created if missing):

```sql
-- Portfolios (serialized positions JSON for atomic reads)
CREATE TABLE portfolios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capital REAL NOT NULL,
  available_cash REAL NOT NULL,
  description TEXT DEFAULT '',
  positions TEXT DEFAULT '{}',
  created_date TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

-- Transaction ledger
CREATE TABLE portfolio_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  total_value REAL NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY(portfolio_id) REFERENCES portfolios(id)
);
```

Indices added (if absent):
```
CREATE INDEX IF NOT EXISTS idx_portfolio_id ON portfolio_transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON portfolio_transactions(timestamp);
```

Portfolio positions are denormalized (JSON) for faster composite valuation; normalization table scaffold (`portfolio_positions`) is present but currently not used in active flows.

---

## 8. API Reference
Base URL (dev): `http://localhost:5000/api`

### System & Status
| Method | Path | Purpose |
|--------|------|---------|
| GET | /status | Basic health, active subscriptions, data source meta |

### Stock Data
| Method | Path | Notes |
|--------|------|-------|
| GET | /stock/{ticker} | Real-time snapshot (auto NSE/BSE suffix attempt) |
| GET | /stock/{ticker}/history?period=1mo | OHLC series (period values: 1d,5d,1mo,3mo,6mo,1y, max…) |
| GET | /search/{query} | Symbol + sector search across curated US + Indian universes |

### Market Intelligence
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | /market/enhanced | `{ "watchlist": ["AAPL","RELIANCE"] }` | Returns indices, India focus slice, regime, fear_greed_index, market_breadth, sentiment_analysis, correlations, summary |

### Portfolios
| Method | Path | Description |
|--------|------|-------------|
| GET | /portfolios | List all portfolios |
| POST | /portfolios | Create portfolio (`name`, `capital`, `description?`) |
| GET | /portfolios/{id} | Get single portfolio (cached view) |
| DELETE | /portfolios/{id} | Delete portfolio + transactions |
| GET | /portfolios/{id}/value | Aggregated valuation + PnL metrics |
| GET | /portfolios/{id}/positions | Current position map (from JSON) |
| GET | /portfolios/{id}/transactions | Transaction history (most recent first) |
| POST | /portfolios/{id}/buy | `{symbol,quantity,price}` average cost recompute |
| POST | /portfolios/{id}/sell | `{symbol,quantity,price}` partial/ full exit logic |

### Administration
| Method | Path | Purpose |
|--------|------|---------|
| POST | /admin/repair-database | Integrity scan, attempt repair, reload cache |

### Error Contract (sample)
```json
{ "error": "Rate limit exceeded. Please try again later.", "error_type": "RATE_LIMIT" }
```

### Sample Stock Response (abbrev.)
```json
{
  "symbol":"AAPL","formatted_symbol":"AAPL","current_price":192.15,
  "previous_close":191.02,"change":1.13,"change_percent":0.59,
  "volume":48934500,"market":"US","currency":"USD","status":"success"
}
```

---

## 9. Real-Time & Caching Model
| Aspect | Detail |
|--------|--------|
| Update Loop | Background thread → every 5s iterate subscribed session tickers, emit `price_update` |
| Subscription | Client emits `subscribe` with { ticker } (one tracked per session id); `unsubscribe` removes mapping |
| Ticker Resolution Cache | Maps raw input to resolved suffix variant to prevent redundant yfinance lookups |
| Index Snapshot Cache | 10s TTL to smooth regime / dashboard oscillation & reduce concurrency load |

WebSocket Events:
* subscribe → server stores `sid:ticker`
* unsubscribe → mapping removal
* price_update → per session emission with latest snapshot

---

## 10. Enhanced Market Intelligence
Returned JSON (top level keys):
```
{
  timestamp, indices{...}, india_focus{...}, regime{score,factors[],interpretation},
  fear_greed_index{score,label,components}, market_breadth{breadth_score,sector_performance},
  sentiment_analysis{TICKER:{sentiment_score,label,headlines[]}}, correlations{assetA:{assetB:ρ}},
  market_summary
}
```
Highlights:
* Regime Factors (examples): VIX Fear Index, S&P 500 Momentum, Dollar Index impact, Bitcoin Sentiment, Crude Oil Pressure, Safe Haven Demand, India VIX, Nifty Momentum, USD/INR Pressure.
* Sentiment: Headlines (up to 5) truncated; fallback neutral if scrape fails or timeout.
* Correlation Matrix: Sanitized (no self‑correlation duplicates, NaN→0). Assets: sp500, nifty50, gold, bitcoin, usdinr.
* India Focus: Dedicated extraction of key NSE thematic indices for localized lens.

---

## 11. Portfolio Engine
| Feature | Logic |
|---------|-------|
| BUY | Weighted average price recalculation; available_cash decremented; transaction logged |
| SELL | Partial: adjust quantity & total_cost; Full: remove symbol; proceeds added to cash |
| Valuation | available_cash + Σ(qty * current_price_cached_or_avg) |
| PnL | (total_value - initial_capital) absolute & % |
| Deletion | Cascade remove transactions + in‑memory eviction |
| Integrity | Numeric coercion, corrupted row skip + reporting; repair sets defaults & reloads cache |

Diversification Score (frontend heuristic): counts distinct symbols, qualitative band (Poor → Excellent).

---

## 12. Security & Validation
| Layer | Measure |
|-------|---------|
| Input | Regex whitelist for tickers (`^[A-Z0-9.-]{1,20}$`), numeric coercion with explicit error branches |
| DB | Parameterized queries only; foreign keys enforced; atomic commit/rollback on operation blocks |
| Rate Limiting | Shared in‑process queue; denies excess calls with error_type RATE_LIMIT |
| Sanitization | Regime factors & correlations cleaned (NaN/Inf → neutral 0) prior to JSON response |

---

## 13. Performance Strategies
| Area | Technique |
|------|-----------|
| External Calls | Sliding window limiter + resolution cache + batched index concurrency |
| DOM Updates | Attribute targeting `[data-ticker]`, minimal innerHTML churn, chart reflows isolated |
| Sentiment | Parallel scraping with executor, global 15s timeout, neutral fallback injection |
| DB | Narrow writes (JSON positions field update) + indexes for transaction lookups |

Potential Future Optimizations: Redis shared cache, async event loop (uvicorn + Socket.IO ASGI), vectorized pre-fetch for multi-symbol watchlists.

---

## 14. Local Development
Prerequisites: Python 3.11+, pip; (Optional) virtual environment.

### Quick Start (Windows PowerShell)
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python stock_service.py
```
Open: http://localhost:5000

### Alternate (run.bat)
Double‑click `run.bat` (ensure it activates environment & launches server as configured).

### Environment Variables (optional overrides)
| Variable | Purpose | Default |
|----------|---------|---------|
| FLASK_ENV | dev / production mode | (unset) |
| SECRET_KEY | Session / WS signing | hardcoded dev key |
| RATE_LIMIT_MAX_CALLS | Override default limiter count | 100 |

---

## 15. Deployment
Minimal container example:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
COPY frontend/ frontend/
EXPOSE 5000
CMD ["python", "backend/stock_service.py"]
```
Recommended Hardening:
* Provide SECRET_KEY via env var
* Reverse proxy (nginx) WebSocket upgrade pass-through
* Distinct production DB file path / mapped volume
* Add structured logging (JSON) & metrics sidecar (future roadmap)

---

## 16. Maintenance & Recovery
| Task | Action |
|------|--------|
| Integrity Scan | POST /api/admin/repair-database |
| Remove Portfolio | DELETE /api/portfolios/{id} |
| Clear Corrupt Rows | Trigger repair endpoint (auto deletes irreparable) |
| Reset Cache | Restart process (in‑memory caches rebuilt) |

Logging outputs console diagnostics: repair counts, skipped corrupt rows, regime sanitation state.

---

## 17. Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Repeating RATE_LIMIT errors | Burst yfinance calls | Back off; expand cache layer or raise window thresholds |
| All indices 0 | Upstream network timeout | Retry; inspect console for timeout messages |
| Sentiment all Neutral | Scrape blocked / structure change | Verify HTML selectors; increase user-agent rotation (future) |
| Portfolio missing after restart | Corrupt row skipped | Run repair endpoint; inspect logs for skipped ID |
| WebSocket no updates | Disconnected or unsubscribed | Check network tab, ensure `subscribe` event fired |

---

## 18. Roadmap
Near‑Term:
* Redis / persistent caching layer for cross‑process scaling
* Authentication & multi-user isolation
* Technical indicator microservice integration (internal) instead of external port placeholder
* Enhanced chart overlays (EMA ribbons, volume profile)

Mid‑Term:
* Strategy sandbox & backtester (vectorized pandas workflows)
* Risk engine (VaR, expected shortfall, position concentration alerts)
* Multi‑currency accounting (FX translation layer)

Long‑Term:
* Service decomposition (market-intel, portfolio, stream multiplexer)
* ML signals & feature store integration
* Mobile / responsive PWA refinements, offline snapshot persistence

---

## 19. Contributing
1. Fork & branch: `feature/<slug>`
2. Keep changes modular (one concern per PR)
3. Update this README if API / architecture contracts change
4. Provide before/after reasoning in PR description

Code Style:
* Python: PEP8 + docstrings for public methods
* JS: ES6 modules, descriptive method names, guard clauses for resilience
* Commit Messages: Conventional style (feat:, fix:, chore:, docs:, refactor:, perf:, test:)

Security / Data Boundary Note: Avoid adding user secrets directly in code. Introduce .env loader for secrets when auth is implemented.

---

### Appendix: Sample Regime Factors Payload Slice
```json
{
  "regime": {
    "score": 6.4,
    "factors": [
      {"name":"VIX Fear Index","value":13.2,"score":8.5},
      {"name":"S&P 500 Momentum","value":0.42,"score":7.1}
    ],
    "interpretation":"Bullish Regime - Generally positive market conditions"
  }
}
```