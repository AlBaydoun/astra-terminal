# Live connection and broker execution repair — 8 October 2026

Branch: codex-round-1. Ready for review/commit; no real order placed by the assistant.

## Verified cause
Today's live bridge log repeatedly reported MT5 10030 (Unsupported filling mode). BTCUSD.s, ETHUSD.s, XAUUSD.s and XAGUSD.s all report filling_mode=1 and Market execution. This is the SYMBOL_FILLING_FOK bit, not the ORDER_FILLING_IOC enum. The bridge hardcoded IOC for entry, close and manual preview requests.

Shared filling selection now obeys broker flags. No retries or increased order size were added. Actual MetaTrader order_check returned 10030 for each old request and 0/Done for each corrected request, including SL/TP. These were read-only validations, not fills.

Reference: https://www.mql5.com/en/docs/constants/environment_state/marketinfoconstants

## Connection
New authenticated /session heartbeat changes no orders. Every 10 seconds, and before automated live submissions, the app verifies the current code, terminal connection and automated-trading permission. A heartbeat expires after 20 seconds. Health alone cannot mark a session authenticated, including the manual ticket refresh path.

Temporary outages block entries and retry the same session. A confirmed changed code clears the saved code and moves armed bots to shadow; user relinking and Go live are required. Existing keys and ledger shapes are unchanged.

Desktop reloaded; production bridge restarted with the same --enable-trading option. Observed desktop transition to NOT LINKED / SHADOW when the new code invalidated the old one. New production /session validated connected=true and tradeAllowed=true without placing any orders. The currently running bridge is a hidden background process. Its startup/session-code output is in C:/Users/Al/astra-data/bridge-runtime-20261008.log; errors in the adjacent -errors.log. Do not start a second bridge while this one is running. Normal launcher applies after a PC restart.

## Protection and limits
Automated live entries require finite positive stop and target on the correct sides of entry. Broker requests contain SL/TP. These broker-held levels remain effective offline once accepted; ASTRA trailing rules and new entries require the PC/app/bridge to run. Stops can suffer gaps/slippage.

The real account now reports USD 4,621.23. Existing allocation and risk settings were preserved, not replaced with yesterday's USD800 assumptions. No strategy tuning, commission changes or ledger migrations.

## Validation
- 17 browser checks passed, clean isolated console.
- 38 Python tests passed, including read-only session state, fill flags and preservation of automated SL/TP.
- JavaScript/Python syntax and whitespace checks passed.
- Desktop UI observed after reload and bridge restart. No real fills or real open trades were available to inspect.

## Remaining
User must enter the current code and explicitly Go live. No claim of guaranteed fills or profits.
Desktop console also reports US Stocks RSI(2) strategy evaluation errors (undefined series) and a sync/push connection reset. These are separate from the selected live bots' filling rejection and remain for the next coherent repair. Do not claim the full app console is clean.
