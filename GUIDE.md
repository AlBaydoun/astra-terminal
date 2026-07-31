# ASTRA Crypto Terminal — User Guide

## Starting

Two ways to open the terminal — both are the same app:

1. **On this PC:** double-click **`START-ASTRA-Terminal.bat`** — opens in its own window.
2. **Anywhere online:** open **https://albaydoun.github.io/astra-terminal/** — works on any computer or phone browser.

Internet is required (all prices stream live from Binance).

## Sign-in & sync

The terminal is **private** — it asks for your username and password when it opens
(you chose them; they are not written down anywhere public). One account, full access.

Once signed in, **everything syncs automatically**: watchlist, alerts, drawings, notes,
workspaces, indicator settings, your paper account and the Observer's entire brain and
fund travel with you between the PC and any other device. Changes save to the cloud a
few seconds after you make them (watch the SYNC light in the bottom bar). If two devices
are open at once, the one that saved last wins. "Continue offline" on the sign-in screen
skips sync for that device.

## What you see

| Area | What it is |
|---|---|
| **Center** | The chart. Drag = move, mouse wheel = zoom. |
| **Top** | Switch coin, timeframe (1m–1W), chart type, Indicators, Alert, Replay, theme, fullscreen |
| **Left** | Drawing tools: trend line, ray, horizontal line, Fibonacci, alert bell, delete |
| **Right** | Watchlist · Order book (DEPTH) · Alerts · Paper trading (PAPER) |
| **Bottom** | Screener (640+ coins, sortable) and Heatmap |
| **Footer** | Live status, total market cap, BTC/ETH dominance, Fear & Greed, clock |

## The essentials

- **Switch coin:** just start typing (e.g. `SOL`) — the search opens by itself. Or click the coin button top-left.
- **Indicators:** "Indicators" button — moving averages (EMA or SMA), Bollinger Bands, VWAP, SuperTrend, Volume, RSI, MACD, Stochastic and ATR. Turn on/off, adjust lengths.
- **Drawing:** pick a tool on the left, then click in the chart (trend line / Fibonacci = 2 clicks). Drawings are saved per coin.
- **Alerts:** bell in the top bar, or the bell tool on the left (then click the chart). When the price crosses your level: sound + popup. Manage them in the ALERTS tab.
- **Bar replay:** "Replay" button, then click a candle — the chart rewinds to that moment. Play, step bar by bar, change speed, and watch how the market unfolded. ✕ exits.
- **Paper trading:** PAPER tab on the right. You start with 100,000 USDT of play money, buy/sell at the real live price and watch profit/loss live. Real money is NEVER involved.
- **Screener:** bottom panel. Click a column header to sort (e.g. 24H % for the day's winners). Click a row to open that coin.
- **Heatmap:** tab next to the screener. Size = market cap, color = 24h change. Click a tile to open the coin.
- **Theme:** the moon button switches light/dark. **Dark is the default.**
- **Multi-chart layouts:** the layout buttons (top right area) switch between 1, 2 or 4 charts. The extra charts are independent — each has its own coin and timeframe, all live. Your setup is remembered.
- **Compare:** the "Compare" button overlays another coin on the main chart (up to 3). The price scale switches to percent so you can see who's stronger — e.g. BTC vs ETH. Remove with the × on the little colored chip.
- **Straight from the screener:** hover a row — the ★ adds/removes the coin from your watchlist, the bell sets a price alert for it. No need to open the coin first.
- **The Observer (AI tab + OBSERVER panel):** the terminal's flagship. **16 strategies** vote UP or DOWN on the current chart — EMA cross, RSI, MACD, SuperTrend, Bollinger, VWAP, Stochastic, volume bursts, trend slope, Donchian breakouts, ADX trend strength, Ichimoku cross, and real candle patterns (hammers, engulfings, morning/evening stars, three soldiers/crows, tweezers). When enough agree it writes a **signal note**, then grades itself ~10 candles later: right calls raise trust in those strategies, wrong calls lower it, and every miss triggers a retrospective ("which strategy would have caught this?").
  - **Its own fund:** the Observer trades **10,000 USDT of its own play money** — real virtual buys and sells at live prices with a **0.1% fee on every side**, exactly like a real exchange. Strong UP signals buy, opposite signals or the signal window ending sell.
  - **Research:** on every coin you open it backtests all 16 strategies against the loaded history (fees included) and shifts trust toward what actually earned.
  - **Radar:** every 10 minutes (or via the Scan button) it analyzes your whole watchlist and notes the strongest signals — it trades those too.
  - **Full reports** in the bottom OBSERVER panel: equity curve, P&L, fees paid, win rate, profit factor, max drawdown, open positions, closed trades, per-strategy research table, signal radar and its journal.
  - **News awareness (INTEL panel):** it reads live crypto headlines (CoinDesk, Cointelegraph — shown as links with credit), scores the mood on a −100…+100 scale, and votes "News mood" when the flow is clearly positive or negative.
  - **The power of history:** a built-in **history book** of market shocks (COVID crash, the Ukraine invasion in Feb 2022, LUNA, FTX, bank stress, ETF approval, halvings…) with what each did to the market and the lesson. When today's headlines echo one of those events — e.g. war words — the Observer shows a ⚠ warning, quotes the lesson, and automatically becomes more careful with bullish calls.
  - **History echoes:** it loads ~9 years of Bitcoin daily history and searches for past 30-day patterns that look like the last 30 days — then shows what happened next each time. It also checks ~8 years of Fear & Greed history: "after days that felt like today, BTC averaged X% a month later."
  - **Chat with it (AI tab):** ask in plain words — "what do you think of SOL?", "why did you buy?", "how is your fund?", "what's the news mood?", "what does history say?", "what did you learn?" It answers from its real analysis and records. It is not a general chatbot — it talks about the market and itself.
  - **It is an experiment with play money only — not financial advice.**
- **Candle patterns on the chart:** hammers, engulfings, stars and more are marked directly on the candles (arrows with names). Turn off in the Indicators dialog.
- **Your notes (NOTES tab):** write free trading notes — each is stamped with the coin, price and time. Filter by current coin, click a note to edit it, × deletes. Saved on your device.
- **Draw freely:** the pencil tool sketches anything on the chart (chart panning pauses while sketching, Esc stops). The **T** tool writes a text note directly on the chart. Both are saved per coin like all drawings.
- **Screenshots:** the camera button saves a PNG of your chart (with drawings, panes and a title bar) straight to Downloads.
- **Workspaces:** the bookmark button saves your whole screen setup (coin, timeframe, layout, mini charts, indicators, compares) under a name — e.g. "Scalping" or "Overview" — and loads it back with one click.
- **Top movers strip:** the scrolling band under the top bar shows the day's biggest gainers and losers. Hover to pause, click to open.
- **Volume profile:** in the Indicators dialog. Shows sideways volume bars on the right — where the most trading happened. The yellow line (POC) marks the busiest price level.
- **Mini-chart EMA:** each side chart has a small "EMA" button for 20/50 EMA lines.

## What gets saved

Watchlist, alerts, drawings, indicator settings, theme and the paper account are stored in the browser and restored on the next start.

## Honest limitations

- Prices come from **Binance** (spot, USDT pairs). Coins not tradable there are missing.
- Alerts only work **while the window is open** (there is no server behind it).
- It is an analysis and practice tool — **it cannot trade real money**, on purpose.
- Without internet the chart will not load.
