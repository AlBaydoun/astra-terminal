# Shutdown preparation and US Stocks repair — 8 October 2026

Branch: codex-round-1. Saved for review/commit. The owner chose to keep the current desktop/bridge session running and load this update on the next restart. No real orders, closes, or protection changes were sent by the assistant.

## Changes

- Live controls now include “Prepare to switch off”. This pauses live entries, waits for outstanding order/desk work, then reads a strict broker snapshot. Missing SL/TP, pending orders, uncertain requests, changed accounts, connection failures or rearmed entries return NOT READY. It never invents or modifies stop levels.
- New GET /shutdown-check distinguishes failed MT5 reads from a genuinely empty account. It checks every broker position, including positions outside ASTRA.
- US Stocks preparation now supplies price-unit ATR(14), SMA(200), and RSI(2). Missing arrays previously caused strategy evaluation exceptions or prevented RSI conditions from matching. No strategy thresholds or cost assumptions changed.
- Removed duplicate research.js script loading, which redeclared its global constant.

## Validation

- 39 Python checks passed.
- Running localhost test pages: 8 US Stocks checks and 8 shutdown checks passed; isolated consoles clean. Simulated shutdown button exercised successfully, without accessing live trading state.
- New broker snapshot function executed read-only against MT5. At the final check it reported zero positions and zero pending orders. Earlier in the session an XAUJPY position had both broker SL and TP; this is a point-in-time observation, not a permanent guarantee.
- Main browser console inspected: retained older US Stocks errors dated 19:38:18 UTC; no newer errors appeared during subsequent inspection. Desktop was deliberately not reloaded, so this is not a claim that its running code is updated.
- Whitespace checks passed. Existing previous-round changes remain in the working tree; no commit was made.

## Activation and practical limits

After restarting the PC, start MetaTrader, the live bridge, and ASTRA Desktop normally. Enter the bridge's new session code and explicitly enable live entries when wanted. Existing broker positions can be read and controlled again after reconnection. Simply committing does not restart running processes.

The current bridge process does not yet serve /shutdown-check. Until restarted, the new check correctly refuses to verify protection. Desktop visual/integration verification after restart remains outstanding by the owner's choice.

Keep the PC/app/bridge running for scanning, new entries and ASTRA trailing rules. With the PC off, only broker-held fixed stop/target levels continue; gaps and slippage remain possible. A protection check is a snapshot: recheck after changing positions or resuming entries. This work does not establish strategy profitability or prove the entire system error-free.
