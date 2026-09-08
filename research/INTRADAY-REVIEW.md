# Intraday research — ready to commit

Branch: `codex-round-1`. Suggested commit title: `Add fixed M15 candidate study and report all split results`.

Three research bots were implemented: trend pullback, range recovery and
session breakout. Their parameters were frozen in intraday-plan.md before
downloading the new history. Each was tested on eight JustMarkets instruments
and two chronological halves: **48 separate tests, 806 simulated trades**.

None qualified for promotion. Trend pullback had positive raw results in both
halves on gold and silver, but silver includes an overnight position with
unknown financing. Session breakout was positive in both halves only on
Bitcoin. Range recovery had no instrument positive in both halves. Passing
rows also have too few trades to meet the declared 100-trade threshold.

Every instrument's trade count, win rate, profit factor, average net R, maximum
drawdown and net cash result is in intraday-results.md. Individual simulated
trades and rejection diagnostics are in intraday-results.json. These are
separate accounts; their outcomes must not be added up as one portfolio return.

## Verification

The study ran at `http://localhost:8642/research/intraday.html`. Its browser
replay matched **every metric and trade** from the independent local replay.
The console contained no warnings or errors. Nine checks on actual non-empty
signals confirmed they were unchanged when the current candle's later data and
all future candles were removed. JavaScript syntax checks passed.

The 40,000-bar snapshot was captured from the existing read-only MT5 bridge;
the final forming bar was removed from each market. No account identifier,
balance or credential was included. Snapshot SHA-256:
`8EE07605A91B7AEEDBC0A4BFEBD42F31ED46E82134C00B9EF3600CFB13A72ADB`.

All old cost assumptions are maintained or exceeded. Trade P&L subtracts both
entry and exit commission in disposable replays and reconciles to cash within
0.00035 USD in every half. Drawdown includes adverse candle excursions and exit
costs. Historical spread variation and the flagged overnight funding remain
limitations. Costs and strategy parameters were not reduced or retuned.

The new candidates use no localStorage, cannot send broker orders and were not
added to the automatic fleet. Open the research page from **Market settings**
to inspect or rerun the comparison. The results are exploratory evidence;
selecting a favourable market now would need fresh unseen and forward paper
testing. The stored trading history and the protected live-trading code remain
unchanged.
