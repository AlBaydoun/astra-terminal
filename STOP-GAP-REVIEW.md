# Stop prices after gaps — ready to commit

Branch: `codex-round-1`. Suggested commit title: `Use available prices when stops are crossed by gaps`.

This is a separate change from the waiting manual entry orders described in
MANUAL-ENTRY-REVIEW.md. Its files are `js/bots/engine.js`,
`tests/risk-checks.js` and this note.

## What changed

A paper trade with a stop at 95 could receive its next fresh price at 90 and
still record an exit near 95. The same problem occurred when a historical
candle opened beyond the stop. This understated the loss, including after
reopening a saved trade following an outage.

Stop exits now use the worse of the stop and the available price. For a
fresh quote this is the observed price; for a historical candle it is the
opening price. An ordinary crossing within a candle still uses the stop,
and a candle covering both stop and target still takes the stop first.
The candle's later closing price is never used to decide an opening-gap fill.

Saved stop and target levels remain attached to the record. Existing slippage
and commissions apply once through the existing exit calculation. The same
logic covers long and short positions, including stops moved to breakeven or
trailed. No strategy rules or parameters changed.

Paper positions cannot execute while the PC/browser is off. On reopening,
ASTRA keeps the saved levels and waits for a fresh permitted price. A gap can
produce a loss larger than the amount initially budgeted at the stop.

## Observed browser verification — 7 September 2026

The actual application scripts ran at `http://localhost:8642` with disposable
in-memory ledgers and controlled quotes/candles. No real order or existing
trade-history write was used for these checks.

Before the fix, all five new gap checks failed and the previous 37 passed.
The browser console showed the incorrect prices:

| Case | Before | After |
| --- | ---: | ---: |
| Long: stop 95, first fresh price 90 | 94.99525 | 89.99550 |
| Short: stop 105, first fresh price 110 | 105.00525 | 110.00550 |

These prices include the unchanged 0.005% adverse exit slippage. The checks
also exercised both candle directions with and without gaps, a restored
position refusing a stale price before executing on a fresh one, and the
actual historical backtester with a gap after entry.

After the fix:

- Risk checks: **42/42 passed**.
- Manual entry-order checks: **20/20 passed**.
- Instrument-permission checks: **5/5 passed**.
- Fresh verification consoles contained no warnings or errors.
- JavaScript syntax checks and Git whitespace checks passed.

Commission assumptions, live arming files, bridge write endpoints, storage
keys, ledger shapes and the pinned chart library were not changed by this
fix. Existing closed trades were not recalculated. Historical reports still
have the separate entry-fee accounting limitation documented in
ROUND-1-REVIEW.md; this change does not validate their reported profitability.
