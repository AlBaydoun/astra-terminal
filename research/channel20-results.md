# Channel 20 study: not suitable for promotion

The fixed candidate failed the required multi-market split test. Only WTI oil
was positive in both halves. Its second-half profit factor was just 1.02 and
average R was 0.007, leaving very little margin for worse execution. This is
not evidence for a new reliably profitable bot. The parameters were not retuned,
and the candidate was not added to the automatic trading fleet.

The candidate's rules were frozen before its history was downloaded. It is an
hourly breakout experiment informed by the [original Turtle rules](https://tradingblox.com/originalturtles/originalturtlerules.htm).
The [time-series momentum research](https://www.aqr.com/insights/research/journal-article/time-series-momentum)
provides a reason to investigate trend persistence across markets, but its much
longer horizons do not establish an edge for this hourly strategy.

## Both halves, separately

Each row starts with its own 10,000 USD virtual account. Results are after the
specified spread, both commissions and slippage. These are separate instrument
tests, not returns on a combined portfolio. Drawdown is based on marked hourly
equity, not a tick-by-tick worst-case reconstruction.

| Instrument | Half | Trades | Win rate | Profit factor | Average R | Max drawdown | Net USD |
|---|---|---:|---:|---:|---:|---:|---:|
| Bitcoin | First | 60 | 45.0% | 0.85 | -0.051 | 3.44% | -129.34 |
| Bitcoin | Second | 57 | 43.9% | 1.37 | 0.101 | 2.96% | +267.21 |
| Ethereum | First | 43 | 37.2% | 0.82 | -0.051 | 3.08% | -110.45 |
| Ethereum | Second | 47 | 44.7% | 1.48 | 0.150 | 1.56% | +353.35 |
| Gold | First | 38 | 44.7% | 0.97 | -0.017 | 2.03% | -14.61 |
| Gold | Second | 72 | 44.4% | 1.19 | 0.052 | 1.94% | +124.72 |
| US100 | First | 80 | 42.5% | 0.88 | -0.047 | 4.75% | -163.62 |
| US100 | Second* | 71 | 49.3% | 1.04 | 0.018 | 4.77% | +45.10 |
| EURUSD | First | 68 | 45.6% | 0.68 | -0.111 | 2.65% | -187.01 |
| EURUSD | Second | 86 | 31.4% | 0.46 | -0.211 | 3.54% | -329.54 |
| GBPUSD | First | 81 | 42.0% | 0.58 | -0.163 | 3.47% | -335.25 |
| GBPUSD | Second | 78 | 43.6% | 0.80 | -0.096 | 1.68% | -119.55 |
| WTI oil | First | 84 | 54.8% | 1.34 | 0.088 | 1.97% | +365.64 |
| WTI oil | Second | 77 | 50.6% | 1.02 | 0.007 | 3.31% | +21.83 |
| Silver | First | 21 | 42.9% | 1.62 | 0.203 | 0.52% | +140.50 |
| Silver | Second | 17 | 41.2% | 0.49 | -0.156 | 1.74% | -115.48 |

*One US100 position crossed a broker date boundary because of a gap in the
available trading bars. Its financing cost is not available in this snapshot;
this row is provisional and cannot support a profitability claim. The trade is
retained rather than removed. No other fold contained an overnight position.

## Data and costs

Captured 5,000 hourly candles per instrument from the local MT5 bridge. The last
potentially unfinished candle was removed; halves contain 2,499 and 2,500 bars,
with 60 warm-up bars in each. Crypto spans February–September 2026; the other
markets broadly span November 2025–September 2026. Exact start/end dates for
every half are in the JSON results. MT5 bar timestamps are broker server-clock
labels, despite their epoch representation; they are not presented as UTC.

| Market | Spread used | Commission per side |
|---|---:|---:|
| Bitcoin / Ethereum | 0.050000% | 0% |
| Gold | 0.006000% | 0.003% |
| US100 | 0.009000% | 0% |
| EURUSD | 0.005166% | 0.003% |
| GBPUSD | 0.008138% | 0.003% |
| WTI oil | 0.028000% | 0.003% |
| Silver | 0.037760% | 0.003% |

Slippage stays 0.005% per side. Each spread is the greater of the existing Pro
profile and the captured broker spread. Historical variable spreads, liquidity
and unobserved execution delays cannot be reconstructed from hourly candles.
No rate was reduced to help this result.

Net trade statistics explicitly subtract entry commission as well as exit
commission, using records from each disposable replay. Their totals reconcile
to ending cash within 0.001 USD in every half. This study does not reinterpret
the owner's stored historical records. Actual broker lot constraints and the
repaired risk/allocation limits apply. Stop-first handling is retained, and a
gap through a stop receives the adverse opening price.

The study completed in the running browser with no warnings or errors. A
separate replay of the same captured data reproduced the results saved to JSON.

- [Frozen rules and acceptance requirement](channel20-plan.md)
- [Candidate code](channel20.js)
- [Browser study](channel20.html)
- [Full results and rejection diagnostics](channel20-results.json)
- [Captured market data and broker specifications](channel20-data.json)

Snapshot SHA-256:
`31C8441084EAC589F17BF90F86C0E8C1F91E36F5C8F6321B5DDC0443861FABE8`

The useful conclusion is negative: this candidate does not meet the owner's
requirement. Selecting only oil after seeing this table would introduce a new
selection decision requiring fresh unseen data, not turn this into validated
multi-market evidence.
