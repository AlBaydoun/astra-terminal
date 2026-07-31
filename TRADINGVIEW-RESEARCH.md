# TradingView — Research & what ASTRA covers

As of July 2026. Compiled from the official feature pages of tradingview.com.
Own summary in own words — no content copied.

## 1. What TradingView is

TradingView is the world's biggest charting and analysis platform (web, desktop app,
mobile app — all synchronized). The core is the "Supercharts" chart; around it: screeners,
heatmaps, alerts, a social network with ~100M traders, paper trading, broker connections
and its own programming language (Pine Script). The desktop app is essentially the same
platform packaged as its own program with multi-monitor comfort.

## 2. The offering in detail

**Charts ("Supercharts")**
- 21 chart types: candles, hollow candles, bars, line, area, baseline, Heikin Ashi,
  Renko, Kagi, line break, point & figure, range, volume variants and more
- Up to 16 charts at once in one layout, synchronized
- 400+ built-in indicators, 100,000+ from the community
- 110+ drawing tools (lines, Fibonacci, patterns, positions …)
- Bar Replay (play back price history), pattern recognition, multi-timeframe analysis
- Custom intervals, second-based charts, spreads/formulas (e.g. BTC/Gold)

**Crypto-specific**
- Coin ranking (market cap, volume, categories such as DeFi/memes)
- Crypto coins screener + CEX screener (40+ exchanges) + DEX screener (on-chain pairs)
- Crypto heatmap (size = market cap, color = change)
- Dominance charts (BTC.D etc.), total-market metrics

**Screeners** — stocks, crypto (coins/CEX/DEX), forex, ETFs, bonds; 400+ filter fields,
results update live.

**Alerts** — price, indicator, drawing and script alerts, server-side, delivered via
push/email/webhook.

**Trading** — paper trading with play money; real orders through 100+ connected brokers;
orders directly on the chart.

**Community** — publish ideas, Minds/streams, script library.

**Pine Script** — write, backtest and share your own indicators/strategies.

**Other** — news feeds (Reuters, Dow Jones …), economic calendar, stock fundamentals,
options tools, mobile/desktop sync, subscription tiers (Free to Ultimate).

## 3. What ASTRA (your terminal) covers

| TradingView | ASTRA | Note |
|---|---|---|
| Live candle charts | ✅ | Binance live data, 1m–1W, 1000 candles of history |
| Chart types | ✅ 5 | Candles, Heikin Ashi, bars, line, area |
| Indicators | ✅ 12 | 3×MA (EMA/SMA), Bollinger, VWAP, SuperTrend, Volume, RSI, MACD, Stochastic, ATR — all adjustable |
| Bar Replay | ✅ | Click a candle, play/step/speed — like the original |
| Drawing tools | ✅ 4 + alert | Trend line, ray, horizontal, Fibonacci; saved per coin |
| Type-to-search symbols | ✅ | Just start typing, like the original |
| Watchlist | ✅ | Live prices, sparklines, your own list |
| Crypto screener | ✅ | 640+ USDT pairs, live, sortable and filterable |
| Crypto heatmap | ✅ | Top 100 by market cap (CoinGecko), clickable |
| Order book + trades | ✅ | Live depth and trade tape (TradingView doesn't even show this) |
| Price alerts | ✅ local | Sound + notification; only while the window is open |
| Paper trading | ✅ | 100k USDT play money, positions, live P&L, history |
| Market overview | ✅ | Market cap, BTC/ETH dominance, Fear & Greed, live |
| Light/dark theme | ✅ | Dark by default |
| Pine Script | ❌ | A custom scripting language would be its own big project |
| Community/ideas | ❌ | Needs a server + users |
| Real broker trading | ❌ | Deliberately left out — no real money |
| Stocks/forex/news | ❌ | ASTRA is deliberately a pure crypto terminal |
| Server-side alerts, mobile app | ❌ | Would need a cloud server |
| 16-chart layouts | ❌ | Candidate for a future round |

## 4. ASTRA's data sources

| Source | Used for | Cost |
|---|---|---|
| Binance Spot API + WebSocket | Candles, tickers, order book, trades — all live | free, no key |
| CoinGecko | Heatmap (market caps), total market, dominance | free, no key |
| alternative.me | Fear & Greed index | free |

## 5. Legal note

ASTRA is an independently developed program with its own name, its own design and its
own code. It borrows feature *ideas* from TradingView (charts, screener, heatmap …) but
no code, graphics, texts or trademarks. The chart library (lightweight-charts) is open
source (Apache-2.0) and free to use.
