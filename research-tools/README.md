# Research tools (not part of the app)

Used by Claude for "research runs". Nothing here is loaded by ASTRA.

1. `node fetchdata.cjs` — downloads history + spreads from the read-only MT5 bridge (127.0.0.1:8644) into `rdata/` (not committed).
2. `bt.cjs` — the backtester: closed-candle signals, next-open entry, full spread paid, stop first when stop and target share a candle, random-entry benchmark with identical exits, two halves.
3. `strats.cjs`, `session.cjs`, `rotation.cjs` — the ideas tested in research run 1 (2026-10-06).

Published ideas go to `js/research/candidates.js`.

## Research run 2 — forecasts (2026-10-15)
`predict-lib.cjs` (5 direction calls: breakout, momentum, over-stretched snap-back, pullback bounce, range-edge rejection),
`predict.cjs` (per instrument, settings chosen on the first 60 %, judged on the last 40 % — mostly FAILED: overfitting),
`predict-groups.cjs` (per market group, instruments pooled, fixed settings, both halves), `predict-publish.cjs` → `js/research/forecasts.js`.
Result: indices · over-stretched (close > 2.5 ATR from SMA20) on 4h → back over 6 candles: 58.0 % of 833 vs 48.9 % by chance,
z 5.2, both halves (57.3 / 58.6 %), 9 of 9 indices, PF 1.40 after spread = PROVEN. Forex range-edge 4h and gold daily momentum = leaning.
Oil and crypto: nothing beat chance → the app shows "No forecast" there. Chart tool: `js/forecast.js` (✦ Forecast).

## Research run 3 — do Structure levels predict? (2026-10-15)
`levels.cjs`: first touch of a level → held (turned 1 ATR away) vs failed (1 ATR through), against CONTROL levels.
Fibonacci retracements: hold-rate rises smoothly with depth; non-Fib fractions (0.45/0.55/0.70/0.72) sit on the same curve → no special effect.
Pivots R1/S1 65.1/66.7 % vs shifted controls 65.5/66.7 % → no edge. 3-touch trendlines 66.3 % vs 64.9 % (1h), worse on 4h → no edge.
`structstats.cjs` → `js/research/structure-stats.js`: per group/timeframe the measured hold-% by pullback depth and the reach-% of
the swing end / 127.2 / 161.8 % after a turn. Structure (js/autostruct.js) now shows these odds on every level.

## Research run 4 — proven candles (2026-10-15)
`candles.cjs`: 8 candle patterns (pin, engulfing, star, tweezer, three soldiers/crows, outside reversal, inside-bar breakout,
two-bar reversal; bull + bear mirror, ATR-sized) × every combination of up to 3 context conditions (with / against the trend,
liquidity sweep of the last 20 candles, stretched ≥1 ATR from the 20-EMA, big pattern ≥1.5 ATR, volume ≥1.5× average,
800-EMA agrees, active session in server hours) × long/short/both × next-open or confirmed entry × 1/1.5/2/3 R targets,
on 5 market groups × 15m/1h/4h = 247,680 setups. Stop = pattern extreme + 0.1 ATR (0.5–3 ATR), full spread ×1.5, stop first.
Chosen on the first 60 %, kept only if the unseen 40 % also paid (n≥20, ≥+0.08R, PF≥1.15), beat random entries in the same
direction by ≥0.08R and was not carried by one instrument → 1,068 survivors. PLACEBO run (random candles, same pipeline): 93.
Best rule per pattern/group/timeframe/direction, kept only above the placebo's 90th percentile (B) or maximum (A):
13 A + 43 B = 56 rules, ALL still positive with double spread (worst +0.23R). Shares were not tested (no data).
→ `js/research/candle-edges.js`, chart tool `js/provencandles.js` (★ Proven). Parity with the app checked on XAUUSD 1h.
