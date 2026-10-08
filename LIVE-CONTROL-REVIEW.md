# Live control centre — 7 October 2026

Branch: codex-round-1. Code changes ready to review and commit; actual live budget/risk changes are pending the user's per-trade loss choice.

## What changed

- Connection, status, shadow arming, Go live and stop controls share a permanent control centre at the top of Live connection & safety. Saved layout choices cannot hide this centre. Existing deliberate confirmations remain.
- Account ceilings moved alongside the Bot money controls, removing the duplicate limit editor. Legacy individually armed bots remain in Advanced.
- Budget presets include $400, $800 and 100% of the current balance. The existing allocation calculation caps the pool at the available balance.
- A dollar stop-risk field sets the equivalent existing risk percentage; the dollar amount therefore changes as bot money changes. It does not create a separate fixed-dollar policy or a new storage key.
- BTC/USD, ETH/USD, gold/USD and silver/USD receive prominent sizing cards when available in the permitted live universe. Cards distinguish selected bots' scope from sizing feasibility. Calculations use a clearly labelled sample stop; actual strategy stops may require a different minimum risk.
- The fit preview now uses the execution sizing routine, including broker steps, lot ceilings and the existing margin estimate, rather than displaying a lot amount execution would reject.
- A bad session-code order response clears the code and linked status and puts armed bots into shadow. Reconnection cannot silently resume real entries. Linking now requires the expected ticket-zero validation response, rather than accepting arbitrary server errors.

## Verification

Nine isolated browser checks passed at `/tests/live-control-checks.html`, with memory-only storage and simulated broker responses. They cover minimum lot risk, rounded sizing, maximum lot constraints, rejected-session pause, failed/successful linking, control placement, dollar-to-percent conversion, and the complete simulated order-rejection path. The fixture console was clean.

The updated control centre was also opened and visually inspected in the full application at localhost:8642. The full app console contains an unrelated existing Research error: `Identifier 'RESEARCH_CANDIDATES' has already been declared`. This update does not fix that error. Syntax and Git whitespace checks passed.

## Operational limits and remaining work

The existing live bridge launcher and session-code requirement remain. This update consolidates the in-app controls; it does not automatically start or restart the external Python bridge. No bridge order/close implementation, cost assumption, storage key or ledger format changed.

The desktop app was not reloaded, reconnected, armed or given higher risk limits during this work. No real orders were placed by these tests. The user still needs to specify the intended stop-risk budget per trade before actual live sizing settings are raised. Increasing allocation alone does not guarantee every instrument can trade: minimum lot, signal stop distance, live quote, market scope, margin and loss limits still matter.

Refresh the desktop app to load the code after review. Committing saves the version in Git; it does not activate a live session. Final activation remains a deliberate user action.
