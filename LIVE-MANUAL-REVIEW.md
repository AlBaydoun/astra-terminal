# LIVE trading bot

Branch: `codex-round-1`. The manual paper bot remains separate from the new **LIVE trading bot** under Trading desk. Buttons connect the two pages. The existing live setup page is now called **Live connection & safety**; its ID and saved settings are unchanged.

## What this version does

- Human-confirmed market Buy/Sell orders, exact broker symbols, lots, stop-loss and optional take-profit.
- Broker-derived account balance/equity, cash risk/reward and margin previews, with broker volume minimum/step/maximum and price precision.
- Stops and targets are submitted with the real order; accepted levels are shown from broker positions and are held by the broker while the browser/PC is off.
- Real account position cards. Closing is available only for positions tagged as this manual live bot; other positions and stop/target amendments are managed in MetaTrader.
- Named arming, shadow state, session code, explicit real-money phrase, session-only unlock and a final order-review button. Reloading does not unlock a ticket.

This is the market-order version. It does **not** copy paper waiting-entry instructions, Confluence automation, trailing stops or paper protection editing into real trading. Those controls are deliberately described as unavailable in the page rather than appearing to work on a real account.

## Execution safeguards

`/manual-preview` performs read-only broker calculations. A one-use preview expires after 30 seconds (the UI stops offering submission at 25). `/manual-order` uses the existing bridge enable-trading and session-code gates, then rechecks the exact preview on the server. `/order` and `/close` implementations are unchanged.

The new path validates positive finite numbers, correct stop/target sides, broker price increments and volume steps; it never raises the size to the broker minimum when budgets cannot support it. Risk is based on real equity and a 20-point deviation allowance. Position-value limits include existing real positions; margin leaves a 5% free-margin buffer. Daily loss checks use full current UTC-day broker deals, fees, swaps and floating losses. Account-wide position counts and shared contract-currency exposure are checked, including trades from outside ASTRA. Existing pending broker orders block a new manual order to avoid unmeasured exposure. The default per-pair limit is one; the operator can raise it on a hedging account. A netting account still blocks a second entry in that pair because it would merge into an existing position and could change its protection.

All server reads fail closed when unavailable. New broker ticks are observed locally instead of assuming that the broker's wall-clock timestamps are UTC. Unknown and partial executions block further manual submissions across the bridge until the operator explicitly reviews MetaTrader. Older preview tokens are cleared on acknowledgement. The browser also retains uncertainty in the existing live order log and requires review after remounting.

The only change to arming eligibility is for this **human-operated** ticket: named operator consent replaces automated-strategy performance readiness. Automated bots retain their existing readiness requirements. The manual live page is excluded from every paper trading/scanning/account list. No paper ledger, storage key or cost assumption is changed. Existing live settings and live order/audit arrays are used; no new localStorage keys are introduced.

## Validation and activation

- **29/29** isolated Python broker tests passed.
- **69/69** browser workspace checks passed, including separate-window navigation, paper/live separation, arming phrases, stale quotes, expired previews, changed limits/accounts, duplicate clicks and uncertain outcomes.
- JavaScript syntax, Python compilation and Git whitespace checks passed. The final browser checks and the running app console were clean.

Broker calculations were checked against the connected real account through an adapter that explicitly prohibits `order_send` and `order_check`. A read-only ETH/USD example returned 0.05 lots, 0.67 USD estimated stop risk, 1.21 USD target result and 0.24 USD margin. These are validation examples at the quoted prices, not a recommended trade.

The running main page was checked for account reading, separation from paper, blocked submission and visual layout. Submission tests use a fake broker exclusively; no real order was placed or closed.

**The running bridge still needs a restart to load the new endpoints.** Automatic approval review rejected the agent's attempt to restart the read-only bridge as “blocked by policy.” The existing process was left running unchanged. Close the ordinary bridge window and double-click `START-MT5-Bridge.bat` to load the read-only update. Live activation remains an explicit user action through the existing `START-LIVE-TRADING.bat` workflow and the page's connection/arming controls.

Calculations follow the primary MetaTrader documentation: [profit in account currency](https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py), [Python API calculation and preflight functions](https://www.mql5.com/en/docs/python_metatrader5), and [order request fields, including SL/TP](https://www.mql5.com/en/docs/python_metatrader5/mt5ordersend_py).
