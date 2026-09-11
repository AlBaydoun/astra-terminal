# Oscillators catalogue update

Ready to commit on codex-round-1. This is a chart-only update, separate from the previous manual/live desk changes still in the working tree.

## Available in Indicators → Oscillators

The folder contains the 15 standard MetaTrader oscillator types: Average True Range, Bears Power, Bulls Power, Chaikin Oscillator, Commodity Channel Index, DeMarker, Force Index, MACD (MetaTrader), Momentum, Moving Average of Oscillator (OsMA), Relative Strength Index, Relative Vigor Index, Stochastic, Triple Exponential Average (TRIX), and Williams %R.

Seven chart definitions were added: MetaTrader-style MACD, OsMA, Bulls Power, Bears Power, Chaikin, RVI and TRIX. Existing definitions supply the other eight. Full names make RSI, ATR and CCI searchable by the names shown in MetaTrader. The original EMA-signal MACD remains separately available under All indicators and Other & custom.

The Prepare RSI + MetaTrader MACD button selects RSI in Window 1 and MACD in Window 2. APPLY uses the existing chart-preference mechanism. It preserves other indicators and their settings. Inputs, colours, thickness and chart windows remain configurable.

Opening multiple oscillator windows exposed a layout bug: their preferred heights could collapse the candle chart to zero height. The layout now reserves price-chart space while allowing indicator windows to shrink. Existing saved pane-height preferences are retained.

## Calculation boundaries

These are local chart calculations using ASTRA candle history, rather than imported live MT5 indicator buffers. Values can differ with the amount of warm-up history or existing smoothing conventions. No strategy helper, signal gate, cost assumption, trading endpoint, ledger or storage key was changed. The existing RSI/bot calculations remain untouched.

New MACD uses EMA differences and an SMA signal. Its bars show MACD itself; OsMA separately shows MACD minus signal. TRIX uses fractional change, not percent, verified against MetaQuotes' source linked below. Chaikin uses the chart volume, commonly broker tick activity; missing volume yields no values rather than invented activity. RVI uses four-bar symmetric smoothing of body and range plus its signal. New indicators stay off until selected.

## Verification

22/22 browser checks at /tests/oscillator-checks.html: catalogue completeness, MACD/SMA/OsMA separation, power signs, RVI weighting, TRIX units, missing volume, short/flat inputs, and rendering every oscillator with the pinned lightweight-charts 4.2.0. Test-page and main-app error consoles were empty.

In the running app: opened the Oscillators folder (15 entries), searched Relative Strength Index, applied the RSI/MACD shortcut, inspected both plotted panes, reloaded and confirmed selections and price-chart visibility. JavaScript syntax and git whitespace checks passed. No bridge restart is needed for this chart update.

## Primary references

- Standard list: https://www.metatrader5.com/en/terminal/help/indicators/oscillators
- MACD: https://www.metatrader5.com/en/terminal/help/indicators/oscillators/macd
- OsMA: https://www.metatrader5.com/en/terminal/help/indicators/oscillators/mao
- Bears/Bulls: https://www.metatrader5.com/en/terminal/help/indicators/oscillators/bears and https://www.metatrader5.com/en/terminal/help/indicators/oscillators/bulls
- Chaikin: https://www.metatrader5.com/en/terminal/help/indicators/oscillators/chaikin
- RVI: https://www.metatrader5.com/en/terminal/help/indicators/oscillators/rvi
- TRIX formula and MetaQuotes source: https://www.mql5.com/en/code/76 and https://www.mql5.com/en/code/download/76/trix.mq5
