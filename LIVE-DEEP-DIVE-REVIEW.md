# Live Trading in Deep Dive

Saved on codex-round-1. Read-only UI change; no storage keys, ledger formats, arming gates or bridge endpoints changed.

- Live Trading appears first above the existing paper Deep Dive.
- Reads broker positions and closing history; refreshes every 15 seconds while mounted. Failed refreshes retain the last snapshot with a warning.
- Shows realised closing net, floating profit plus swap, open and closed-position counts, winners/losers/flat, win rate, and buy/sell results.
- Filters by side, status and instrument. Expand each position for execution tickets, order tickets, closing volume, price, timestamp, profit, commission, swap, fees and broker comment. Open positions show entry/current prices and broker SL/TP.
- Exact matching successful local entry records add the original bot, timeframe, signal and initial levels. No inferred attribution from broker SL comments. Expanded panels survive refresh.
- Broker timestamps are labelled as broker time. Local entry-log timestamps use PC time.

Validation: five browser calculation checks passed (fees, partial closes, direction, position grouping, empty history). Real broker report loaded inside Deep Dive; buy filter returned four positions, sell filter seven; details and refresh preservation exercised, console clean. JavaScript syntax and whitespace checks passed. No real trades sent.

Coverage limitations are displayed: current bridge endpoint returns at most 500 closing executions within 365 days and omits entry-side charges and historic stop modifications. This is not a full account statement; missing fields stay unavailable. Read-only endpoints can return cached MT5 state, so snapshot time is not labelled an authenticated trading connection.

Desktop session deliberately left running under the owner's existing preference. It loads these files on its next restart. No commit made.
