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
| **Top** | Switch instrument, timeframe (**1 second to 1 week**), chart type, Indicators, Alert, Replay, Compare, Markets, theme, fullscreen |
| **Left** | Drawing tools: trend line, ray, horizontal line, Fibonacci, alert bell, delete |
| **Right** | Watchlist · Order book (DEPTH) · Alerts · Paper trading (PAPER) |
| **Bottom** | Screener (640+ coins, sortable) and Heatmap |
| **Footer** | Live status, total market cap, BTC/ETH dominance, Fear & Greed, clock |

## The essentials

- **Switch coin:** just start typing (e.g. `SOL`) — the search opens by itself. Or click the coin button top-left.
- **Indicators:** the "Indicators" button opens the full catalogue — **29 indicators**. Each row has:
  - a **tick box** to switch it on,
  - its **settings** (lengths, multipliers, and the average type: EMA / SMA / WMA / SMMA),
  - **"Apply to"** — exactly like MetaTrader: Close, Open, High, Low, Median (H+L)/2,
    Typical (H+L+C)/3 or Weighted (H+L+2C)/4,
  - a **◑ style button** — pick the **colour of every single line**, the **thickness** (1–5) and
    **solid / dotted / dashed**,
  - **"Show in"** — *Price chart*, *Window 1*, *Window 2* or *Window 3*.

  Two indicators pointed at the same window are drawn **together in that one window**, an
  oscillator can be laid straight **over the price chart**, and windows appear and vanish by
  themselves, each labelled with what it holds.

  **On the price:** 3 moving averages, Bollinger Bands, Envelopes, Keltner Channel,
  Donchian Channel, VWAP, SuperTrend, Parabolic SAR, Alligator, Ichimoku Cloud,
  Pivot Points and Fractals.
  **In a window:** Volume, RSI, Stochastic, MACD, CCI, Williams %R, Money Flow Index,
  On Balance Volume, Momentum, Awesome Oscillator, DeMarker, Force Index, ATR,
  Standard Deviation and ADX + DI.
  Plus Volume Profile and candle-pattern markers at the bottom of the dialog.

  **Reading the values (like MetaTrader's window title):** each window shows its indicators
  with their settings and their current numbers — for example `RSI(14) 39.46   MACD(12,26,9)
  -100.75 -131.55 -30.79` — in the line colours. Move the crosshair and the numbers follow the
  bar under your mouse; move away and they snap back to the newest bar. Indicators placed on the
  price chart get the same line just under the main legend.

  **Mixing very different indicators in one window:** RSI runs 0–100 while MACD may sit at 0.18.
  Put them in the same window and each keeps **its own scale**, so neither flattens the other —
  the visible axis on the right belongs to the first one. Indicators that share a natural range
  (RSI, Stochastic, Money Flow, Williams %R, ADX) deliberately share **one** axis instead, so
  they stay directly comparable.
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

## Markets — what you can chart

ASTRA is no longer crypto-only. The **Markets** button (top bar) opens the browser where you
tick ★ next to anything you want to monitor. Seven groups:

| Group | What is in it |
|---|---|
| **JustMarkets** | Your MT5 instruments with their exact names — XAUUSD.m, XAGUSD.m, BTCUSD.m, US100.std, US30.std, WTI.m, BRENT.m, the forex majors and crosses, and more |
| **Crypto** | All 650+ Binance USDT pairs |
| **Forex** | Major and exotic currency pairs |
| **US stocks** | Apple, Microsoft, NVIDIA, Tesla and ~50 more |
| **Europe** | Germany, France, Netherlands, UK, Switzerland, Italy, Spain, Scandinavia |
| **Indices** | S&P 500, Dow, Nasdaq, DAX, CAC, FTSE, Nikkei, Hang Seng … |
| **Commodities** | Gold, silver, platinum, copper, oil, gas, wheat, coffee |

Type 2+ letters in the Markets search and it looks up **any listed company worldwide**, not just
the ones in the list. Everything you star lands in your watchlist and in the Observer's radar.

## Second-by-second charts

The timeframe row now starts at **1S** and **30S** — one candle per second, and one per
30 seconds. These are for scalping: you see every tick forming the candle.

Where they work:

| Instrument | 1S / 30S |
|---|---|
| Crypto (and BTCUSD.m, ETHUSD.m …) | ✅ live from the Binance stream — about 33 minutes of 1-second history |
| Anything through the **MT5 bridge** | ✅ built from your broker's real ticks |
| Stocks, indices, metals and oil without the bridge | ❌ the free public feeds have no second data — the chart falls back to 1 minute and tells you |

30-second candles are folded from the 1-second stream in the terminal, aligned to the clock
(:00 and :30), so they line up with any other platform.

## Why prices sometimes look "behind" — and what to do about it

This is important, so here it is plainly. **Not all markets update at the same speed**, and ASTRA
now tells you the truth on every chart with a small badge next to the symbol:

| Badge | Meaning |
|---|---|
| **LIVE** (green) | Real time. Crypto from Binance, or anything coming from your own MT5 bridge. |
| **DELAYED 15m** (amber) | The free public feed for that market runs behind the exchange — normal for indices, metals and oil. |
| **CLOSED** (grey) | The market is shut (weekend, or outside its trading hours). The price is the last close, not a lag. |

Most "lag" you saw was the third case: stock, index and commodity markets **close on Friday night
and reopen Monday**, so gold, US100 and oil sit frozen all weekend. Crypto never does.

**To remove the delay completely, use the MT5 bridge** (below). Then every instrument shows LIVE,
straight from JustMarkets, exactly the prices you trade on.

## Linking ASTRA to your JustMarkets account

ASTRA reads your MetaTrader 5 terminal directly. **No password, login or investor
number is ever needed, asked for, or stored** — the bridge simply reads the terminal
you are already signed into, on your own computer. Nothing leaves the machine, and
there is no order path: it can look, never touch.

**Do this once:**

1. Open a command window and run: `pip install MetaTrader5`
2. Open MetaTrader 5 and log in to your JustMarkets account as normal.
3. In MT5, right-click the **Market Watch** panel → **Show All**, so every instrument
   you want ASTRA to see is available (XAUUSD.m, US100.std, WTI.m and the rest).

**Then, each time you want live broker data:**

1. Double-click **`START-MT5-Bridge.bat`** and leave that small window open.

**A note that matters on your PC:** you have two MetaTrader terminals installed —
`JustMarkets MetaTrader 5` and a plain `MetaTrader 5`. The bridge deliberately tries the
**broker build first** and prints which one it attached to, plus the account number and
server. If it ever connects to the wrong one it says so in capital letters rather than
pretending to work — that is the one failure that would otherwise look like success.
If you ever need to force it:

    python astra_mt5.py --path "C:\Program Files\JustMarkets MetaTrader 5	erminal64.exe"

The choice is remembered, so afterwards a plain double-click is enough.
2. Within a few seconds the **FEED** light in ASTRA's bottom bar turns green and reads
   `MT5 · <your server>`. Every price badge flips to **LIVE**.

**Tell ASTRA which account type you have.** Click the **FEED** light → *Account type* →
**JustMarkets Pro**. This matters more than it sounds: Pro is a raw-spread account
(tight spreads plus a commission), Standard is wider spreads with no commission. Bots
and backtests price every trade using that profile, so choosing the wrong one makes
every result wrong. When the bridge is running ASTRA uses the **real spread from your
terminal** instead of any estimate, and says so.

What the link gives you:

| | Without the bridge | With the bridge |
|---|---|---|
| Prices | Public feeds, ~15 min delayed, closed at weekends | Your broker's live tick prices |
| Symbols | Public equivalents (GC=F for gold) | Your exact instruments (XAUUSD.m) |
| Spread used in tests | Estimated for your account type | The real spread your account pays |
| Seconds charts | Crypto only | Every instrument, built from real ticks |

## The MT5 bridge — your broker's own prices, no delay

You already run MetaTrader 5 for JustMarkets. The bridge lets ASTRA read the prices your terminal
already receives. Nothing leaves your computer, and **it never places an order**.

**One-time setup:**
1. Open a command window and run: `pip install MetaTrader5`
2. Make sure MetaTrader 5 is open and logged in.

**Every time you want live broker data:** double-click **`START-MT5-Bridge.bat`** and leave that
small window open. ASTRA notices it within seconds — the FEED indicator in the bottom bar turns
green and reads `MT5 · <your server>`, and every badge flips to LIVE.

When the bridge is running, XAUUSD.m, US100.std, WTI.m and the rest come from your broker with
the same numbers your MT5 chart shows, at about one update per second.

## Starting the terminal

Double-click **`START-ASTRA-Terminal.bat`**. It now starts a small data service on your PC (that is
what fetches stocks, forex, indices and commodities) and opens the terminal. Crypto never needs it.

The **FEED** indicator in the bottom bar always shows where prices are coming from — click it to
see all three sources and their status.

## What gets saved

Watchlist, alerts, drawings, indicator settings, theme and the paper account are stored in the browser and restored on the next start.

## Honest limitations

- Crypto comes from **Binance** (spot, USDT pairs) and is always real time.
- Stocks, forex, indices and commodities come from free public feeds: usually **15 minutes delayed**, and closed at weekends. Run the MT5 bridge for real-time broker prices.
- ASTRA reads prices only. **It cannot place a trade** — on purpose.
- Alerts only work **while the window is open** (there is no server behind it).
- It is an analysis and practice tool — **it cannot trade real money**, on purpose.
- Without internet the chart will not load.
