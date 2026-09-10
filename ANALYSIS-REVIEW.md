# Buy / Sell Analysis

Branch: `codex-round-1`. One coherent, read-only analysis change.

Open **Bots → Overview → Buy / Sell Analysis**, or use the new Dashboard shortcut.

- Separate Buy and Sell cards: completed trades, wins, losses, break-even, win rate, money won/lost and net.
- Shared-scale cash bars, outcome bars and cumulative realised-profit curves.
- Detailed comparison: averages, profit factor, available R, best/worst trade, realised cash drawdown, holding time and edited trades.
- Instrument, timeframe and bot-account breakdowns; clickable chart links and a paginated full trade list.
- Filters for account, instrument, timeframe, local close dates and manual adjustments. They survive normal workspace refreshes and remain session-only.

## Accounting

Analysis reads existing paper ledgers and does not change them, their keys or their formats. Open positions are excluded. Each completed position counts once, including any partial exits already accumulated in its saved closing result. Existing history may be capped at 500 closes per bot; capped accounts show a notice.

The engine's saved `pnl` includes exit fees but excludes entry fees. Exact retained `meta.entryFee` is subtracted where available; a zero saved commission total requires no adjustment. Positive-fee histories without an exact entry fee are flagged: the displayed result is an upper bound, and the conservative lower bound deducts the entire recorded commission total. Missing fee records prevent a reliable bound. The headline refuses a confident directional winner when these bounds overlap. No historical rate is guessed and no current cost is applied to past trades.

Recorded fees are reference figures and must not be subtracted again. Unknown profit/direction is excluded, zero is break-even, and missing R is excluded from its average. Realised drawdown groups simultaneous closes and starts at zero for the selected period; it does not include floating losses. All-account totals combine separate paper accounts, not a live account return.

## Verification

- Running browser calculation suite: **25/25 passed**, `/tests/analysis-checks.html`.
- Running browser workspace regression suite: **54/54 passed**, `/tests/workspace-checks.html`, including actual page routing, refresh/focus preservation and exclusion from trading-account lists.
- Actual ASTRA history: account, instrument and inclusive date filters, chart navigation and second-page trade history exercised; browser console clean.
- Dark and light presentation inspected. JavaScript syntax and Git whitespace checks passed.

No orders were placed for this change. No costs, live arming, bridge write endpoints or storage schemas were changed. No strategy was modified or claimed profitable.
