# Shared manual desk and signal sources

Ready for review on codex-round-1. No real order was placed or live account armed during development.

## What changed

- Paper and LIVE use one ticket renderer, `Bots.manualTicketView`, with the same sizing slider, percentage shortcuts, direction buttons and instrument picker. Future markup and style edits to this renderer reach both desks. Execution-specific behavior remains in separate adapters; paper settings do not silently overwrite real-money limits.
- Automatic entries uses a shared searchable catalogue of registered strategy bots and the Market Scanner. Account/report pages are excluded because they do not generate entry signals. One source can be selected per session, with one instrument or all connected JustMarkets instruments. Source market filters, timeframe, higher-timeframe confirmation, minimum score, hours and session guards remain effective. There is no 24-pair scan-depth cut-off in this adapter.
- Signals are calculated from existing strategies without running or writing the source bot’s account. Close-only signals never turn into short entries. Errors show the affected source and pair. Entries still pass the manual risk controls and fresh broker-quote checks.
- Real signal automation is opt-in, session-only, separately locked across windows, and requires existing strategy qualification plus all live arming gates. Leaving the live desk, editing its ticket or pressing Stop cancels subsequent entries. An order already sent to the broker cannot be recalled by Stop. Duplicate signal/session identities are kept in the existing live audit text, including uncertain outcomes.
- Real amount/slider sizing is evaluated by MT5 in the actual account currency. This account reports USD. Both position-value and margin amount modes retain all account risk and broker volume ceilings. The bridge advertises the new sizing capability so an older bridge cannot silently ignore the amount.
- The live trade cards reuse the paper desk’s saved-price graphic. All position profits are labelled with account currency. Connection/unlock controls are expandable so they do not displace the ticket.

## Deliberate distinctions

Paper and real balances, permissions and execution limits remain separate. This does not qualify any strategy as profitable. Real automatic entries remain blocked when the selected source fails the existing readiness checks. Pending price instructions, trailing stops and editing broker protection levels are still managed in MT5; the shared live ticket currently submits market entries with broker-held SL/TP. Unsupported controls are disabled or hidden, not silently simulated.

No cost assumptions, storage keys, paper ledger structure, existing bridge /order or /close implementations, chart-library version or build/load architecture changed.

## Verification

- 75/75 workspace browser checks, including shared sizing, real-vs-paper separation, all existing live gates, qualified signal routing through the guarded manual endpoint, duplicate prevention and Stop cancellation. Broker writes in these tests are fake transports.
- 64/64 manual automation browser checks, including different signal sources, higher timeframe, session deduplication, error reporting and existing sizing/exposure limits.
- 32/32 Python broker execution tests with a fake MT5 API.
- Actual account read-only probe: a 10% USD allocation produced an ETH position value below the selected dollar ceiling, respecting 0.01 minimum/step lots. The probe makes order_send and order_check unavailable.
- Main app: signal search filtered engulfing sources; shared real slider and SL/TP buttons exercised; screenshots reviewed; browser error console empty. Syntax, Python compilation and whitespace checks passed.

## Runtime activation

The current bridge process still runs the previous code. Its restart was rejected earlier by automatic approval review with “blocked by policy”; it has not been stopped or worked around. Close the ordinary bridge window and open START-MT5-Bridge.bat to load the new read-only preview support. Real execution still requires the separate live startup and explicit unlock steps performed by the owner. Committing records the code; committing itself does not restart a running bridge.
