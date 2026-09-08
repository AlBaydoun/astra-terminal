# JustMarkets and optional Binance — ready to commit

Branch: `codex-round-1`. Suggested commit title for remaining corrections:
`Finish JustMarkets-only market controls and quiet source shutdown`.
The owner committed the main source-switch implementation during verification;
the final scan-cancellation and watchlist corrections need their own checkpoint.

Open **Market settings** in the top bar. Binance defaults to **OFF**. Enable
Binance restores its exchange pairs; Disable Binance hides them and stops its
streams, reconnects, chart requests and new entries. Public-feed instruments
are hidden. Broker crypto such as ETHUSD.m uses the JustMarkets bridge.

The bridge's account catalogue controls available broker names, including suffix
aliases. Unsupported catalogue entries disappear from market browsing, symbol
search, the watchlist, screener, heatmap and bot scans. Existing trade history
remains available. A broker being disconnected does not authorize an exchange
substitute for its CFD. Fresh prices and all existing entry guards still apply.

The approved preference key is `astra_market_sources_v1`, with a boolean Binance
choice. Missing/malformed values mean OFF. Save failures keep the previous
choice and report the error. Windows sharing the browser profile receive
setting changes; cloud sync cannot enable Binance on another device.

Disabling a source does not close existing positions or erase waiting orders,
stops, targets, alerts or watchlist choices. Their execution pauses until the
source is enabled again and a permitted fresh price arrives. Older exchange
portfolio/Observer fund paths also obey OFF; use Manual Trading for broker CFDs.

## Verification observed on localhost:8642, 8 September 2026

- **14/14** market-source checks, including aliases, missing bridge, cached
  quotes, in-flight requests, stream shutdown, waiting instructions, UI lists,
  final entry/exit guards, failed saves, cross-window events and watch removal.
- **42/42** risk checks, **20/20** manual-order checks, **5/5** permission checks:
  **81 total**, with no unexpected console warnings/errors. The failed-save
  test deliberately captures and checks its expected error report.
- Real terminal started with Binance OFF and no bridge, showing the explanation
  to connect JustMarkets. It did not fall back to exchange pairs.
- Started the existing MT5 bridge in its default read-only mode; it reported
  271 symbols for the JustMarkets account. The app then displayed that catalogue.
- Enabled Binance through the actual settings button, saw BTCUSDT appear in
  the screener, reloaded, and observed the saved ON setting. Disabled Binance:
  exchange rows disappeared immediately. Reload confirmed the saved OFF state.
- A fresh full-app console stayed clear through the corrected ON/OFF sequence.
- Selected ETHUSD.m from Markets with Binance OFF: the chart displayed
  **JustMarkets · LIVE**, price **2,481.86** at that observation.
- Actual script syntax checks passed. Protected live arming files, bridge
  endpoints, broker cost tables, package versions and ledger shapes unchanged.

Tests used disposable in-memory data or the separate offline verification
browser profile. No real order was sent. Binance was left OFF. Reload older
ASTRA windows to load the final corrections. Commission and slippage unchanged.

Availability means the symbol is reported by this JustMarkets account. Market
hours, fresh quotes, contract specifications and entry checks can still prevent
a particular order. The switch is not a guarantee of a broker fill.
