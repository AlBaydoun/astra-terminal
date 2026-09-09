# Ready to commit: ticker, Pro costs, indicator search and manual rules

Branch: `codex-round-1`. No commit made by Codex. The earlier chart-label selector changes remain in this working tree too.

## Scrolling market line

The ticker now includes every canonical instrument reported by the connected JustMarkets bridge: **271 unique pairs/instruments** in the running app. It inserts **55 repeated spotlight slots** among the full alphabetical list. Fresh Confluence BUY/SELL SETUP entries rank first, incomplete WATCH candidates next, then large completed M15 swings. A swing is the last completed candle's true range divided by its preceding 20-candle average; 1.5× starts the swing label. These labels do not place orders. Stale prices and prohibited pairs cannot advertise an actionable BUY/SELL setup.

Prices cover the whole catalogue in batches of 40, two requests at a time, every 30 seconds. Requests time out after 8 seconds; missing/failed quotes appear in the strip tooltip. Refreshes preserve the scrolling track so late alphabet pairs eventually appear. All 271 base slots plus spotlights take about 24 minutes per complete loop; a spotlight appears approximately every 27 seconds. Hover, focus a pair or press Pause to stop scrolling. Click a pair for its M15 chart; click the pair count for the full scanner. Percent change is from the broker daily candle open, not rolling 24 hours. Closed-market prices are visibly marked STALE.

## Corrected Pro commission

JustMarkets Pro and Standard have **zero commission**, confirmed in the [official account terms](https://get.justmarkets.help/hc/en-us/articles/14317768789532-Trading-account-types). Pro is a separate account type from Raw Spread. All Pro asset groups now use zero commission. Live spreads, fallback spreads and 0.005% per-side slippage are unchanged. Legacy per-pair commission overrides no longer override the account tariff; their saved data is retained and any spread override still applies. Historical trades were not repriced.

The corrected [Confluence report](research/confluence-pro-results.md) is separate from the archived study. Eight instruments, both halves independently, 84 trades. Gold and GBP/USD are positive in both halves; GBP/USD's second-half profit is only **$0.15**. No instrument reaches 100 completed trades. Verdict: **NOT QUALIFIED — insufficient evidence**, not a recommendation for live trading. No strategy rules were tuned. Every metric and trade matches in the browser and independent replay. The former-cost archive also reproduces exactly and its result files remain unchanged.

## Search indicators

Indicators now has a search field covering names, IDs and descriptions. “Hammer” also finds the original candle-pattern labels. In the running main chart there are 52 searchable entries; split charts have their own searchable list of 49 supported entries. Filtering hides rows while retaining their settings, and clearing restores them. No-results text is explicit. Input, Style and Visibility tabs continue to work on filtered results. Apply keeps changes to both visible and filtered-out indicators.

## Manual trading rules

Open **Bots → Manual Trading Bot → Manual trading rules**. Edit and press **Save manual rules**. Controls include:

- Risk per trade, total position value, daily loss budget and minimum equity.
- Total open positions, positions per instrument and related positions, each with an explicit No count limit checkbox. Without that checkbox, zero still blocks entries.
- Maximum spread as a percentage of price and of stop distance, and quote age up to the existing 180-second live limit.
- Automatic stop ATR multiplier, percentage fallback, exit after a chosen number of candles (zero means no time limit for new positions).
- Pause new entries and an optional permission to widen existing manual stops within the current risk and daily budgets. Original risk, original stop and edit history are preserved.

Total position value may exceed 100% when the operator explicitly saves a higher allocation: 500% means at most five times equity across all open manual positions. Existing positions still reserve their full allocation; leverage never replenishes the budget. Risk per trade and daily loss remain positive percentages up to 100%; higher limits are not automatically selected. The original 0.5% risk, 100% allocation and 2% daily loss defaults were retained in the actual terminal.

The minimum-lot rejection gives required stop-risk cash, its percentage of equity, minimum position value and available budgets. The subsequent [automatic ticket change](MANUAL-TICKET-REVIEW.md) now fits an undersized draft to the broker minimum when affordable, and supports explicit broker FX conversion for manual paper trades such as AIRF. With automatic fitting off, exact-size refusals remain explanatory. A valid stop, fresh price, supported valuation and instrument permission still apply.

Reload saved rules discards the rule draft. Load default rules prepares defaults and requires Save; it never deletes trades. Recheck daily lock uses the saved loss budget and clears an existing lock only if actual daily losses are within that budget. Daily loss history is retained and pending entries still reserve/check open risk at execution. Failed saves keep previous settings active. Settings use the existing `astra_botcfg_manual` key; no new key or trade-ledger shape. Market entries and pending triggers read the same saved rules under the existing writer lock.

These are **paper trades**. Saved stops and targets survive a restart, but paper orders cannot execute while the PC/browser is off. Live arming, `live.js`, `liveui.js`, and bridge `/order` and `/close` are unchanged.

## Verification

All were run in browser at localhost:8642 with the actual application scripts and disposable test balances:

| Checks | Result |
|---|---:|
| Risk and execution costs | 44/44 |
| Manual pending entries and expanded manual rules | 29/29 |
| Confluence strategy/scanner/indicator | 31/31 |
| Full catalogue ticker | 8/8 |
| Market sources | 14/14 |
| Instrument permissions | 5/5 |

Real terminal UI: indicator searches and clearing, split-chart search, all 271 ticker instruments and 55 focus slots, pause/resume, scanner shortcut, manual field edits/reload, explicit save with unchanged budgets, then full-page reload restoring those saved rules. Screenshot inspected at 1280px with no page overflow. Current terminal console and passing test runs checked for errors. No broker order was placed. Syntax and whitespace checks passed. No build step or library upgrade.
