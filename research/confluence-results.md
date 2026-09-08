# ASTRA Confluence: fixed M15 split test

**NOT QUALIFIED — failed or insufficient evidence**. Positive in both halves: XAUUSD.s.

One new combination, no tuning. Eight JustMarkets markets, separate 10,000 USD accounts for each half. This reuses already-inspected data and is exploratory, not unseen validation. The bot is installed as a paused paper experiment at the owner’s request.

| Instrument | Half | Trades | Win rate | Profit factor | Average R | Max drawdown | Net USD |
|---|---|---:|---:|---:|---:|---:|---:|
| BTCUSD.s | first | 3 | 0.0% | 0.00 | -1.000 | 1.36% | -136.49 |
| BTCUSD.s | second | 2 | 100.0% | Infinity | 0.880 | 0.37% | 70.68 |
| ETHUSD.s | first | 5 | 20.0% | 0.45 | -0.433 | 1.64% | -108.33 |
| ETHUSD.s | second | 2 | 50.0% | 8.81 | 0.325 | 0.65% | 32.44 |
| XAUUSD.s | first | 10 | 60.0% | 2.63 | 0.584 | 1.05% | 215.73 |
| XAUUSD.s | second | 4 | 50.0% | 2.78 | 0.525 | 0.65% | 73.90 |
| US100.s | first | 5 | 20.0% | 0.04 | -0.765 | 1.68% | -126.19 |
| US100.s | second | 4 | 25.0% | 0.99 | -0.093 | 0.70% | -0.44 |
| EURUSD.s | first | 5 | 20.0% | 0.37 | -0.345 | 0.41% | -23.47 |
| EURUSD.s | second | 3 | 66.7% | 4.21 | 0.378 | 0.09% | 10.19 |
| GBPUSD.s | first | 4 | 50.0% | 2.95 | 0.104 | 0.24% | 22.97 |
| GBPUSD.s | second | 7 | 42.9% | 0.90 | -0.003 | 0.22% | -3.84 |
| WTI.s | first | 10 | 40.0% | 1.21 | 0.111 | 1.76% | 45.46 |
| WTI.s | second | 8 | 50.0% | 0.54 | -0.216 | 1.76% | -85.24 |
| XAGUSD.s | first | 5 | 40.0% | 1.09 | -0.034 | 0.97% | 7.52 |
| XAGUSD.s | second | 7 | 42.9% | 0.52 | -0.285 | 1.43% | -65.52 |

Costs: the greater of the Pro profile, prior study spread and captured spread. Commission 0.003% per side FX/metals/energy, zero indices/crypto. Slippage 0.005% per side. Both entry and exit fees included. Broker minimum, step and maximum lots enforced. Stop first on ambiguous bars. Intrabar drawdown uses the conservative candle model from the earlier study. Variable historical spreads, latency, tick paths and financing remain unknown.

Any row with zero trades has no evidence; zero drawdown is not safety. The 250-bar warmup is discarded separately in each half. Every trade and exact period appear in the JSON. Timestamps represent broker clock labels, not UTC instants. Historical open fills do not measure the forward bot’s 90-second expiry or 0.25 ATR chase guard.

- Unknown overnight financing: XAGUSD.s, first, 1 trade(s).

## How to use the experiment

Open Bots → ASTRA Confluence → Open indicator chart. Use M15 with ordinary candles. Green ASTRA BUY and red ASTRA SELL mean all five checks passed on a completed candle. SELL proposes a short; it is not an instruction to close a buy. The panel shows the reference entry, stop and target only for the current setup. Historical labels remain visible but must not be chased. The chart labels every qualifying setup; the bot additionally applies daily, position, cost, quote and permission checks, so labels are not trade records.

At the owner’s subsequent request, the Confluence Scanner now automatically checks the entire JustMarkets catalogue. It chooses eligible pairs by lower round-trip cost relative to ATR, then ADX strength. The forward bot can open multiple pairs per scan and repeat a pair on a new completed-candle signal. Position counts and daily entries per pair are editable, with 0 meaning no count limit. Default size is at most 5% of equity per trade; all trades share the editable risk and allocation budgets. Open Bots → ASTRA Confluence to Save trading rules, load Maximum trade counts or Reset defaults, and Start paper bot to enable entries. It waits for 11:00–17:45 broker time. Keep ASTRA, MT5 and the PC running for exits. These eight independent historical tests used the original frozen rules and do not establish profitability for the expanded portfolio, multiple positions, repeat entries or changed allocations.

No most-profitable method has been established. Do not infer a win probability from the five-check score. The new bot has its own paper ledger and no broker-order route. Its bot page includes both entry and exit fees using the original fee and risk saved in strategy metadata; this is a display calculation, not a history migration. Existing terminal-wide reports retain their legacy convention. No old trade record was rewritten. Forward drawdown is sampled from available quotes, not every tick; the existing curve retains at most 1,500 points.

[Frozen rules and sources](confluence-plan.md) · [Browser study and guide](confluence.html) · [Every simulated trade](confluence-results.json)
