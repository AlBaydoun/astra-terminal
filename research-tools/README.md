# Research tools (not part of the app)

Used by Claude for "research runs". Nothing here is loaded by ASTRA.

1. `node fetchdata.cjs` — downloads history + spreads from the read-only MT5 bridge (127.0.0.1:8644) into `rdata/` (not committed).
2. `bt.cjs` — the backtester: closed-candle signals, next-open entry, full spread paid, stop first when stop and target share a candle, random-entry benchmark with identical exits, two halves.
3. `strats.cjs`, `session.cjs`, `rotation.cjs` — the ideas tested in research run 1 (2026-10-06).

Published ideas go to `js/research/candidates.js`.
