# Channel 20 intraday candidate — frozen study plan

Written before downloading or evaluating this candidate's market history on
6 September 2026. One candidate, one parameter set, no optimisation.

The research starting points are the original Turtle rules published by a
participant, and Moskowitz, Ooi and Pedersen's time-series momentum research.
The latter studied much longer horizons. Neither demonstrates that this new
hourly adaptation works on JustMarkets CFDs.

- https://tradingblox.com/originalturtles/originalturtlerules.htm
- https://www.aqr.com/insights/research/journal-article/time-series-momentum

Rules: use hourly broker candles, with a 60-bar warm-up. Buy when the last CLOSED
candle closes above the highest high of its preceding 20 candles; sell on the
opposite breakout. Enter at the next candle's open, only from 10:00 through
17:00 inclusive in the broker's recorded server clock. Use ATR(20), a stop two
ATR away and a target four ATR away. Hold at most four candles including the
entry candle. No trailing, partial exits, pyramiding or learning. One position
per instrument/account. The short holding window is intended to avoid ordinary
overnight funding; any trade crossing a broker date boundary will be reported
as a limitation, never quietly removed.

Use the repaired paper risk engine: 0.5% stop-risk ceiling, 100% total allocation
ceiling, 2% daily loss budget, and actual broker minimum/step/maximum lots.
Keep commission 0.003% per side on FX/metals/energy and zero on indices/crypto;
slippage 0.005% per side. For each instrument freeze spread at the GREATER of
the existing Pro profile and the captured broker spread as a percentage.
This does not reduce any cost assumption. Fees are deducted on BOTH sides
when computing study trade statistics, independently of old ledger reports.

Markets fixed in advance: BTCUSD.s, ETHUSD.s, XAUUSD.s, US100.s, EURUSD.s,
GBPUSD.s, WTI.s and XAGUSD.s. Request 5,000 H1 broker candles for each. Exclude
the newest potentially unfinished bar. Keep the returned history; report
missing or invalid data. No replacement markets selected after seeing results.

Split each instrument's history chronologically into equal halves and start a
fresh 10,000 account for each half. Warm up independently in each half. Record
dates, trades, win rate, profit factor, average net R, maximum marked-equity
drawdown, net cash P&L and rejection reasons. Include gap-through-stop handling
at the adverse open and force the last position closed at the final price.
Check that summed net trade P&L reconciles to ending cash.

The candidate survives only if BOTH halves have positive net P&L and profit
factor above 1 on at least two instruments. Fewer than 100 completed trades
per passing instrument remains insufficient evidence for promotion. Every
market's result is retained. If it fails, report the failure without retuning.

This study is separate from the production bot registry and runs with disposable
ledgers. It creates no localStorage key, changes no ledger shape and cannot
arm or submit a live order. Passing this historical screen would still require
fresh forward paper trading before any claim of readiness.
