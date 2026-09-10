# Connected manual desk — ready-to-review change

Branch: `codex-round-1`.

The manual account now displays the same full trade cards as Open Trades: price map, cash figures, stop and target edits, trailing controls, partial exits and close. New or closed positions are reconciled without rebuilding the order ticket or surviving cards. Saved size, level and trailing-state changes refresh in place.

Instrument names in trade/history tables, the dashboard, scanners, watchlist, portfolio, alerts, notes and research results open their chart. Existing selectors still select instruments. Ticker and heatmap navigation reveal the chart too. Buy/Sell buttons on the main and split charts prepare the exact instrument, direction and timeframe in the manual paper ticket; they do not submit an order. Changing instruments clears the old contract's prices and size.

## Automatic choices

- **At my chosen price:** prepares the existing Limit or Stop-entry ticket. Each saved instruction fills once, with its existing cancellation and execution checks.
- **ASTRA Confluence signals:** explicitly started paper session. Select the ticket pair or all connected JustMarkets instruments, buy/sell/both, signal exits or percentage distances, a per-entry position-value percentage, and a session entry count. Zero removes that session count limit. Saved manual risk and exposure limits still apply.

Confluence uses the existing M15 completed-candle signal, broker-time session, 90-second freshness window and price-chasing check. Later signals may add positions; the same pair/candle cannot repeat. Entries are labelled `Manual Auto · Confluence`. The per-entry cap is position value, not risk. The engine sizes within both caps and broker volume specifications; it does not increase budgets or move a strategy stop just to force a fill.

Confluence sessions stop on reload. Their controls are kept only for the current window session; no new storage key was introduced. Existing pending-price instructions, positions and saved stops/targets retain their normal persistence. Paper exits require the PC, browser and bridge to be running. Stopping a Confluence session leaves open positions and separately placed price instructions active.

No new profitability claim or parameter optimization is made. This is an experimental execution option, not a strategy shown to be profitable across the full catalogue.

## Technical boundaries

- The new runner uses the existing manual-ledger writer lock, reloads current settings at execution, and calls the normal engine checks again at the final fill.
- A separate browser session lock allows only one manual automatic runner across windows. Stop invalidates requests already waiting for prices or scans.
- Existing position metadata records the originating signal; no top-level ledger format or storage keys were changed. Costs, live arming scripts and broker write endpoints were not edited.
- Failed saves stop new automatic entries and retain the unsaved in-memory position. Daily-loss locks are saved even if no position opens.
- Plain scripts; lightweight-charts remains pinned to v4.2.0.

## Validation

Browser suites at localhost:8642 use disposable in-memory accounts and no live-order scripts:

- Workspace/manual ticket: 52 checks, including handoff into a newly loaded separate manual window.
- Manual automatic mode: 60 checks, including duplicate prevention after closing/reloading, Stop during a request, exclusive ownership, current risk limits, source/spec/freshness restrictions, broker minimum sizes, shared capital, entry-count stops and failed saves.
- Risk regression: 44 checks.

The first two suites share the original manual-ticket/workspace regressions; these totals are not unique test counts. Main-app chart Buy and split-chart Sell navigation were also exercised with connected broker instruments. Real orders were not submitted. Syntax parsing and Git whitespace checks passed.

Suggested commit title: `Connect manual trade cards, chart tickets and selectable paper automation`.
