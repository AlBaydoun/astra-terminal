# ASTRA · Markets Terminal

A futuristic, real-time multi-market trading terminal — crypto, forex, US and European
stocks, indices and commodities, plus MetaTrader 5 broker instruments — that runs in the
browser with no build step.

**Live:** https://albaydoun.github.io/astra-terminal/

![ASTRA cover](https://d8j0ntlcm91z4.cloudfront.net/user_3G8Zr6H1S7zWbkItZ69aAiTK02Q/hf_20260731_084832_0f5d3a81-591d-4800-90ba-a3b8d2304956.png)

## Features

- **Live charts** across markets — 650+ Binance crypto pairs, forex, US & European stocks, indices, commodities, and MetaTrader 5 broker instruments (XAUUSD.m, US100.std, WTI.m …) — candles, Heikin Ashi, bars, line, area; 1m to 1W
- **Markets browser** — seven groups plus worldwide symbol search; star what you monitor
- **Honest data status** — every instrument is labelled LIVE / DELAYED / CLOSED, never guessed
- **MT5 bridge** — reads your own MetaTrader 5 terminal for real broker prices with no delay (read-only, never trades)
- **Timeframes from 1 second to 1 week** — 1S/30S built from the live tick stream (crypto and MT5 bridge)
- **12 indicators, placed where you want them** — EMA/SMA ×3, Bollinger Bands, VWAP, SuperTrend, Volume, RSI, Stochastic, MACD, ATR, ADX+DI; each can live on the price chart or in any of three sub-windows, and several can share one window
- **Bar replay** — rewind to any candle and play history forward at 1–10×
- **Multi-chart layouts** — 1, 2 or 4 live charts side by side, each with its own coin and timeframe
- **Compare overlay** — up to 3 coins on one chart with a percent scale (e.g. BTC vs ETH)
- **The Observer** — the flagship: a self-adjusting signal engine with its own 10,000 USDT virtual fund. 16 strategies (indicators + candle patterns) vote UP/DOWN; decisive calls become graded signal notes; strong signals trade the fund at live prices with 0.1% fees per side; outcomes re-weight the strategies; misses trigger retrospectives; every opened coin gets a fee-aware backtest research pass; a watchlist radar scans for signals; a full dashboard reports equity curve, P&L, fees, win rate, profit factor, drawdown, trades and its learning journal. Experimental, play money only — not financial advice.
- **Intel** — live news headlines (linked and credited) scored for mood; a curated history book of market shocks matched against today's headlines (war words trigger caution, with the Feb 2022 lesson attached); ~9 years of BTC daily history searched for patterns matching the present ("history echoes"); Fear & Greed percentile + what followed similar moods historically
- **Observer chat** — ask it about any coin, its trades, the news mood, history or its lessons; it answers from its real state (intent-based, not a general chatbot)
- **Candle pattern markers** — hammers, engulfings, morning/evening stars, three soldiers/crows, tweezers, dojis marked on the chart
- **Personal notes** — a NOTES tab with price/time-stamped, editable notes per coin
- **Free drawing + chart text** — pencil sketching and text annotations, saved per coin
- **Chart screenshots** — one click saves a composed PNG (chart + panes + drawings)
- **Named workspaces** — save and reload complete screen setups
- **Top movers strip** — scrolling ticker of the day's biggest gainers and losers
- **Volume profile** — sideways volume histogram with POC line, computed over the visible range
- **Drawing tools** — trend line, ray, horizontal line, Fibonacci retracement (saved per coin)
- **Screener** — every pair, live prices, sortable by 24h %, volume, high/low
- **Heatmap** — top 100 coins by market cap, colored by 24h change
- **Order book + trade tape** — live depth and executions
- **Price alerts** — sound + notification when a level is crossed
- **Paper trading** — 100,000 USDT of virtual money at real live prices; P&L tracked live
- **Market overview** — total market cap, BTC/ETH dominance, Fear & Greed index
- Dark futuristic theme (default) with a light option

## Running

- **Online:** open the live link above.
- **Locally:** double-click `index.html` (or `START-ASTRA-Terminal.bat` on Windows).
  Internet is required — prices stream live.

## Data sources (all free, no API keys)

| Source | Used for |
|---|---|
| Binance Spot REST + WebSocket | crypto candles, tickers, order book, trades — real time |
| ASTRA data service (`server/astra-api.cjs`) | stocks, forex, indices, commodities (public feeds, typically 15 min delayed) |
| MT5 bridge (`bridge/astra_mt5.py`, optional) | your broker's own live prices, read-only |
| CoinGecko | market caps, dominance, global stats |
| alternative.me | Fear & Greed index |

## Running

- **Everything (recommended):** `START-ASTRA-Terminal.bat` — starts the data service and opens the terminal.
- **Live broker prices:** `START-MT5-Bridge.bat` with MetaTrader 5 open (`pip install MetaTrader5` once).
- **Hosted:** the page is static and can be served from anywhere; point it at a data service
  (Settings → FEED) to enable the non-crypto markets. Crypto always works with no service.

## Tech

Plain HTML/CSS/JS (no framework, no build). Charts rendered with
[lightweight-charts](https://github.com/tradingview/lightweight-charts) (Apache-2.0).
All indicator math, drawing tools, replay engine, screener, heatmap and paper-trading
logic implemented from scratch in `js/`.

## Disclaimer

Analysis and practice tool only. It cannot place real orders and holds no funds.
Not financial advice.
