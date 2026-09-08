# ASTRA Confluence — fixed rules before evaluation

Requested by Al on 8 September 2026: install an experimental bot even without proof of profitability, and a combined indicator with buy/sell labels. This authorizes a new bot's ordinary configuration and paper-ledger keys; existing history is not migrated.

One new hypothesis, M15 only. No parameter search. Use the existing eight-market snapshot for an exploratory comparison; it has already been inspected, so this is NOT unseen validation. Gold is the default forward-paper market because the earlier simpler trend-pullback experiment was positive in both halves there. This does not establish the new combined strategy's profitability.

At each new bar, use exactly the preceding 250 completed candles:

- Trend: EMA20 above EMA100 and EMA100 rising over four bars for buys; inverse for sells.
- Trigger: previous close below/equal its EMA20, then newest completed close above its EMA20; inverse for sells.
- Strength: ADX14 at least 25.
- Momentum: RSI14 between 50 and 70 inclusive for buys; between 30 and 50 for sells.
- Activity: newest completed tick volume at least the mean of the PRECEDING 20 completed volumes. Missing/zero activity fails the check.
- ATR14 defines a stop 2 ATR away and a target 4 ATR away from the next open. No trailing stop or partial exits.
- Entries only 11:00–17:45 on the broker's server clock, at most one filled entry per broker day per market, one position total in the new paper account. Maximum hold 12 M15 bars (3 hours).
- Existing 0.5% risk ceiling, 100% total notional ceiling, broker volume steps/min/max, 2% daily-loss ceiling and live-price/permission guards remain.
- Forward entries expire 90 seconds after the new bar opens; refuse a gap from the previous candle or a price more than 0.25 ATR from that open. These are execution safeguards, not filters tuned against results. Historical fills at the open cannot measure latency.

Research: each half starts with a separate 10,000 USD paper balance and 250-bar warmup. Report trades, win rate, profit factor, average R, drawdown and net cash for every instrument and half, with unchanged/worse spreads, 0.003% commission per side for FX/metals/energy, zero for indices/crypto, and 0.005% slippage per side. Both fees included. Stop first on ambiguous bars. Flag overnight financing as unknown. No changes to the old research outputs.

Install paused, with a clear Start paper bot button. New code has a dedicated paper runner and cannot submit a broker order. Labels represent strategy setups, not fills or a probability of winning. Record forward paper trades separately from historical simulations. The PC, terminal and bridge must remain running to manage paper exits; saved stops cannot execute on a switched-off PC.

Sources: [Fidelity's DMI guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/DMI) explains ADX as trend strength, not direction. [Fidelity's indicator guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/overview) distinguishes trend, momentum, volatility and volume tools. [MetaTrader's rates documentation](https://www.mql5.com/en/docs/matrix/matrix_initialization/matrix_copyrates) distinguishes tick volume and real volume; the local bridge explicitly returns tick_volume. None of these sources establishes an edge for this combination or these thresholds.

## User-requested extension: automatic full-market scanner

After seeing the indicator, Al requested automatic selection across all 270+ JustMarkets instruments. The signal thresholds and M15 timeframe remain fixed. The default forward universe is now the complete canonical broker catalogue, not gold or the eight research instruments. The one-entry-per-day guard is per canonical pair; the account still holds only one position at a time. Alias names cannot reset that guard.

Later, Al explicitly requested removing those count restrictions and being able to set/reset the rules. The forward paper runner now has separate editable position counts, daily entries per pair and percentage budgets; all four counts default to 0 (no count limit). Default per-trade position value is 5% of equity so one fill leaves room for others. Risk defaults remain 0.5% per trade, 100% total position value and 2% daily loss budget. These execution preferences were not optimized against the results. A scan can open multiple ranked pairs; each distinct completed-candle signal can fill only once, including across reloads and closed-history trimming. The fixed study above and its results remain unchanged and do not measure this later execution policy.

The dedicated Confluence Scanner starts automatically, reads at most six histories concurrently, caches each completed-bar evaluation until the next M15 bar, and checks quote/readiness every 15 seconds. Candle requests time out after eight seconds; failures clear previous signals and remain visible per pair. The user can pause scanning or force a new scan. Pausing the scanner also pauses entries; existing position protection remains active. Its setting uses the new bot's already-authorized configuration key.

Eligible setups rank by the lowest estimated round-trip cost (spread + both commissions + both slippages) divided by ATR; ADX breaks ties. No claim that this ranking predicts profit. The final paper risk checks can reject the highest-ranked setup and choose another affordable one. This wider portfolio has not been profitability-tested across the full catalogue; the existing eight-market independent results are not a portfolio backtest. Unmeasured stock/other-instrument costs retain the terminal's existing assumptions, not evidence of live costs.
