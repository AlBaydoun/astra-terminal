# Ready to commit: automatic manual ticket fitting

Branch: `codex-round-1`. No commit made. Earlier market ticker, Pro commission, indicator search and manual-rule changes are still in this working tree; see `MARKET-MANUAL-REVIEW.md` for that work.

## What the user gets

In **Bots → Manual Trading Bot**, automatic fitting is on by default. It rounds size to the broker's volume step, raises undersized drafts to the minimum lot when affordable, and reduces oversized drafts to the remaining risk and position-value budgets. If the minimum lot would exceed stop risk, it can tighten the draft stop. It also aligns prices to broker ticks, the trade direction and the configured spread-to-stop limit. Changed prices and cash estimates are visible before entry. It never raises a saved budget. An impossible minimum allocation remains blocked.

Typing updates the estimate immediately; finishing a field or using a quick button applies the fitted values. The 0.5% stop and target buttons show cash loss and profit, including the existing entry spread, adverse slippage and applicable commission. Buying/Selling changes the levels to the corresponding side instead of clearing them. A blank market stop still invokes the existing automatic ATR/fallback calculation on submission. Periodic refreshes leave the draft fields alone.

The checkbox **Automatically fit size and levels to my budgets** can be switched off with **Save manual rules**. It uses the existing `astra_botcfg_manual` preference. No new storage key. Previously submitted waiting instructions and existing open-position levels are not automatically rewritten. Waiting entries still undergo fresh checks when triggered.

## AIRF currency valuation

AIRF's price and profit currency are EUR; the connected account currency is USD. Its bridge specifications report a 100-share contract, 0.01 minimum lot, 0.01 tick size and 0.01 tick value. Treating that tick value as a complete account-currency conversion is wrong.

Read-only MT5 verification on 2026-09-09: `order_calc_profit` for BUY AIRF, 0.01 lot, a EUR 1 price increase returned approximately USD 1.16; a EUR 1 decrease returned approximately USD -1.16. The broker EUR/USD quote was approximately 1.1633. No broker order was sent. The [official MT5 calculation documentation](https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py) specifies account-currency results; [symbol calculation modes](https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants) document the contract-size formula for FX/CFDs.

Manual paper tickets now convert quote-currency values using fresh broker FX bid/ask quotes. Direct, inverse and two-leg USD conversions are supported. Physical units and broker lots stay unchanged. Conservative loss and profit conversion rates are saved inside the existing position `meta` object and carried into its closed record. Position allocation, stop risk, floating equity, partial/final P&L, Open Trades and dashboard cash values use those rates. Old records without that metadata keep their former accounting.

**Limit:** this is a linear FX/CFD paper valuation estimate. The conversion rate is fixed at entry and labelled as such; it does not reproduce later currency-rate movements in a broker's realized P&L. Missing/stale FX quotes prevent new converted entries and recover automatically when a fresh quote arrives. No broker endpoint or live-trading arming code was changed.

## Additional bugs found during browser verification

- An exact 25% spread-to-stop boundary could reject AIRF as “25% exceeds 25%” because decimal prices became slightly unequal in binary arithmetic. A numerical tolerance fixes equality; a truly excessive spread is still refused.
- The cash preview accessed missing plan fields while a conversion quote was loading, producing a browser-console exception. It now shows the loading reason and recovers without losing the form.
- Blocked execution and unavailable valuation were conflated. A last-price cash estimate can remain visible while a stale/nontradable entry is disabled. The estimate never becomes execution permission.

## Verification

All checks ran in the browser at localhost:8642, using the actual application scripts and disposable paper ledgers. No test wrote to the user's trade history or sent a broker order.

| Browser suite | Passed |
| --- | ---: |
| Automatic manual ticket, currency and Open Trades | 35/35 |
| Core risk | 44/44 |
| Waiting orders and saved manual rules | 29/29 |
| Confluence | 31/31 |
| Market sources | 14/14 |
| Instrument permissions | 5/5 |
| Market ticker | 8/8 |

The ticket suite repeats 20 existing waiting-order checks with the new helper loaded. It also verifies minimum/maximum sizing, stop tightening, actual Buy/Sell paper fills, converted pending fills, partial exits, save/reload, missing-FX recovery, stale-price estimates and the actual Open Trades cash display. The core checks retain daily loss, exposure, broker-volume, live-price and failed-save protections.

In the full running app, a gold amount of 100 fitted to 0.01 lot and the 0.5% buttons displayed approximately 22.49 loss and 21.43 profit at the observed quote. AIRF fitted an amount of 100 to 0.07 lot, displayed USD cash estimates and enabled entry. A final AIRF Sell preview showed SL 11.75, TP 11.51, approximately 1.11 loss and 0.85 profit. These are observed preview examples, not trade outcomes; quotes and spread change. Draft persistence and the final application console were checked. JavaScript syntax and Git whitespace checks passed.

Suggested commit title: `Fix manual ticket auto-sizing and account-currency cash previews`.
