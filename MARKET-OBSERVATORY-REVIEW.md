# Market Clock, Trade Replay and US stock news

Ready for review on `codex-round-1`, 15 September 2026.

## Where to find it

- **Market Clock** in the lower navigation opens market cards, local-time countdowns, searchable broker instruments and US stock bot diagnostics. Expand a card for individual instrument clocks. Motion can be paused.
- **Trade Replay** opens recorded paper bot history, including disabled bots. Combine filters for bot, instrument, direction, outcome, dates, profit/loss, R, holding time, score, management and reasons. Select **Inspect** to review a trade, play completed candles, step, jump to entry/exit, inspect OHLC/volume, or view EMA/RSI. Export the filtered list as CSV.
- **Inspect / replay** above the main chart reviews a separate copy of that chart.
- **News & Alerts** now has a US stocks filter and Wall Street Watch highlights.

The two new navigation buttons use the existing tab styling and matching outline SVG icons. The chart shortcut also matches its toolbar. Replay has distinct bordered sections and a compact sticky header. Price and RSI panels share the same candle positions and aligned price-scale widths.

## Why US share bots were quiet on 14 September

The browser history inspected on 14 September contained 647 completed paper trades and no US share entries that day. The saved standard-bot scope excluded shares; Confluence was paused despite its scanner being on; manual automatic entries were stopped. The check was also after the US regular session, with stale US share quotes. These are verified blockers, not a complete reconstruction of earlier activity: retained decision logs were bounded and did not prove every scan that happened that day. No bots or trading scopes were enabled to force trades.

Browser installations have separate local history. The in-app browser used for final visual verification contained 164 completed trades. The diagnostic panel always reads the currently open installation and local date.

## Sources and limits

- [NYSE calendar](https://www.nyse.com/trade/hours-calendars): regular US cash session, holidays and early closes for 2026–2028.
- [JustMarkets trading hours](https://get.justmarkets.help/hc/en-us/articles/14206580923420-What-Are-the-Trading-Hours-on-JustMarkets): published weekly broker profiles and exceptions, checked 14 September 2026.
- Read-only MT5 contract paths identified 122 US and 43 European share symbols. Unknown new shares are not automatically assumed to be US shares.

Clocks are planning estimates, not order permissions. US cash-exchange hours differ from broker share CFD hours; the interface states the published two-minute earlier broker close. Other schedules use published weekly profiles and an Eastern European server-time daylight-saving assumption. Special holidays, halts, maintenance and individual MT5 specifications take precedence.

Replay uses available historical candles, up to 5,000 per request. It reports missing coverage and gaps, excludes incomplete candles, and labels the broker-time conversion assumption. It cannot reconstruct tick order, original stop edits or unavailable history. Saved trade outcomes and costs are displayed without recalculation. Review does not pause existing bots.

No order endpoints, live arming logic, cost assumptions, storage keys or ledger formats were changed. Lightweight Charts remains version 4; there is no build step.

## Verification

- Observatory browser checks: 26/26 passed.
- Existing news browser checks: 9/9 passed.
- News server checks: 4/4 passed.
- Changed JavaScript syntax checks and Git whitespace checks passed.
- Running app at localhost:8642: inspected matching navigation and toolbar icons, market search and per-instrument countdown, trade filtering, completed-trade replay, stepping/play/pause, aligned RSI panel and saved facts. Browser warning/error console was empty during final verification.

Committing records this update in Git; it is not required for the running app to display saved code changes after a refresh.
