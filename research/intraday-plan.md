# Intraday candidates — frozen research plan, 8 September 2026

Three distinct hypotheses, one fixed parameter set each. Written before
downloading or evaluating the new 15-minute history. No parameter search and
no replacement markets after seeing results. This follows a previous failed
hourly Channel 20 study; these markets have been investigated before, so the
results are exploratory, not an untouched final holdout.

Research basis:

- [Moskowitz, Ooi and Pedersen: Time Series Momentum](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum)
  supports investigating trend persistence across markets, at much longer
  horizons than these intraday experiments. It does not establish an M15 edge.
- [John Bollinger's own rules](https://www.bollingerbands.com/bollinger-band-rules)
  caution that a band touch alone is not a reversal signal. The reversal
  candidate below waits for a closed-bar return inside the band and a weak trend.
- [Zarattini, Barbon and Aziz: Opening Range Breakout research](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284)
  examines US equities and unusual activity. Our common broker-clock session
  experiment has different markets and no stock-selection claim; it is not a
  replication of the paper or an established profitable strategy.

## Rules frozen before the run

All candidates use M15 broker candles, 150 bars of independent warm-up in each
half, and closed candles only for signals. Enter at the next candle's open.
Trade only at broker-clock hours 11 through 17 inclusive; close by the end of
the 20:45 candle, with at most 12 bars held including the entry candle.
At most one open position and one entry per instrument per broker day for each
candidate. No trailing, partial exits, learning, pyramiding or parameter tuning.

1. **Trend pullback:** EMA(20) above EMA(100), EMA(100) rising over the last four
   completed bars, previous close at/below its EMA(20), newest close above its
   EMA(20): buy. Reverse all conditions to sell. ATR(14) stop at 2 ATR from the
   next open; target at 4 ATR.
2. **Range recovery:** ADX(14) below 20. Previous close outside its own
   Bollinger(20, 2) lower band and newest close back above its own lower band:
   buy; symmetric upper-band recovery: sell. Stop 2 ATR(14); target is the
   completed bar's middle band, only if it is at least 1 ATR ahead of entry.
3. **Session breakout:** use that broker day's four completed M15 bars from
   10:00 through 10:45. Newest close crosses above their highest high while
   previous close is at/below it: buy; symmetric low break: sell. Require all
   four opening-range bars; stop 2 ATR(14), target 4 ATR.

These are original fixed experiments informed by those sources. No source
promises that these exact rules or these CFDs will be profitable.

## Data, costs and accounting

Markets fixed in advance: BTCUSD.s, ETHUSD.s, XAUUSD.s, US100.s, EURUSD.s,
GBPUSD.s, WTI.s, XAGUSD.s. Capture the bridge maximum of 5,000 M15 candles per
market plus quotes/specifications. Exclude the last potentially forming candle.
Report unavailable data without substituting another market. Do not store
account identifiers or balances in the snapshot; retain account currency only.

Chronological equal halves, each starting with a disposable USD 10,000 account.
Reuse BotEngine risk, lot and allocation controls. Spread is the greater of
the Pro profile, the previous captured Channel 20 study spread and the new
captured spread. This avoids lowering any earlier cost assumption. Commission
is 0.003% per side for FX/metals/energy, zero for indices/crypto. Slippage stays
0.005% per side. Stop-first on ambiguous candles and adverse opening-gap fills.

Net trade P&L includes entry and exit fees, computed only for these disposable
replays. Reconcile the sum with ending cash. Report trades, win rate, profit
factor, average net R, maximum drawdown, net cash and rejection diagnostics for
every candidate/market/half. Drawdown includes each bar's adverse excursion
before its exit, plus closing equity, conservatively charging exit slippage
and fees on open positions. This is a candle estimate, not tick-level evidence.
Overnight positions caused by missing bars are retained and flagged because
financing is not captured. Such a fold cannot support promotion.

## Acceptance

For each candidate separately, require positive net P&L and PF > 1 in BOTH
halves on at least two instruments, at least 100 completed trades per passing
instrument, and no uncosted overnight positions. All rows are reported even
when negative or empty. The short data window may make the 100-trade threshold
unreachable; that is insufficient evidence, not a reason to relax it.

Even a historical pass needs fresh forward paper evidence before live use.
The candidates and browser study are kept outside the production bot registry,
use no localStorage and cannot call live order endpoints. A failed candidate
will not be added to the automatic fleet or described as profitable.
