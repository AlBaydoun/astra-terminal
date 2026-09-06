# Round 1: paper execution and risk controls

Branch: `codex-round-1`. Ready for the owner to commit through GitHub Desktop.
Suggested commit message: `Fix paper position sizing, execution costs and risk bypasses`.
No commit or push has been made automatically.

The subsequent [manual trading follow-up](MANUAL-FOLLOWUP-REVIEW.md) extends this
round: the value ceiling now covers all open positions together, form controls
survive refreshes, broker clock handling is verified, and 37 browser checks
pass. The separate research candidate failed its multi-market split test; see
[all results](research/channel20-results.md). The sections below record the
initial checkpoint; the follow-up describes the current behaviour.

## What changes for you

- A new paper position cannot be worth more than 100% of its virtual account's
  available equity. A 10,000 account therefore cannot open the old 13.6 million
  position. The existing 0.5% risk ceiling also applies, including the modelled
  spread, slippage and commissions. Falling equity reduces both budgets.
- Broker positions require valid specifications from `/specs`. Size rounds down
  to `volumeStep`, never exceeds `volumeMax`, and is refused below `volumeMin`.
  A reduction by the Master Brain keeps units, lots and cash risk consistent.
- Typed amounts and lots pass the same checks as automatic sizing. Oversized
  requests show a reason and are refused. The preview uses the approved fill and
  size. Switching between Amount and Lots immediately recalculates the preview.
- Maximum positions applies to automatic entries, Run now, manual entries and
  the final entry operation. Zero means no new entries. Broker suffixes cannot
  disguise a second position in the same instrument.
- At most two positions per virtual account can share a related market group
  (crypto, indices, metals or energy) or an FX currency. This is a conservative
  exposure rule, not a claim that statistical correlations were measured.
- The existing 2% daily loss limit blocks at the boundary, includes floating
  losses, and reserves the losses possible at existing stops before admitting
  another position. The lock rolls over at UTC midnight.
- Pausing stops new entries while existing stops and targets continue working.
  Moving a stop by hand cannot exceed its original cash risk or the remaining
  daily budget. Hand adjustments retain their existing `touched` flag.
- Missing, future-dated, stale and delayed quotes are refused. Only actual MT5
  quotes or exchange stream events younger than 180 seconds qualify. A display
  switch or saved backtest setting cannot waive this rule for runtime trading.

## Other reproduced bugs repaired

- Manual partial exits treated a percentage as a fraction and ignored the
  instrument's commission category. They now use the same commission resolver
  and existing slippage assumption as the engine.
- Broker `.s` symbols could fall into the wrong commission category. They now
  match their instrument's category. The measured rates remain 0.003% per side
  for FX, metals and energy, and zero for indices and crypto. Slippage remains
  0.005% per side. No cost tables or strategy parameters were tuned.
- Partial exits could leave impossible broker lot sizes. Both the closed part
  and remainder must now be valid volumes. A candle reaching both targets also
  closes the remainder after the first partial exit.
- Equity could subtract entry fees twice or keep the old full position's
  floating result after a partial exit. It now adds the current quantity's
  floating result to cash that already includes those fees.
- Every 30-second price check counted as a whole timeframe candle, ending
  trades too early. Runtime holding time now follows the position's timeframe.
- Fetching candles or attempting a failed quote request could label an old
  price live. Price, source and timestamp are now published together only from
  returned quotes. Exchange events cannot overwrite a connected broker's quote.
- Strategy exceptions were silently skipped. Runtime failures now appear in
  Decisions and the console; failed historical evaluations return an error.
- Historical entries skipped their entry candle's stop/target range, and some
  records and equity points used today's clock. Entry-candle execution now runs,
  timestamps follow the replay, and initial equity is included in drawdown.
  Stop-first handling for a candle spanning stop and target is retained.
- Historical strategies no longer receive the forming candle's eventual high,
  low, close or volume. Split histories too short for warm-up fail explicitly.

## Verification completed on 6 September 2026

- The running browser page at `http://localhost:8642/tests/risk-checks.html`
  passed **31/31 checks** using the actual project scripts and disposable
  in-memory ledgers. The harness refuses storage writes and loads no live-order
  code. These are execution checks, not strategy performance results.
- In the actual terminal at `http://localhost:8642`, the manual form refused a
  typed 1,000,000 position and kept zero manual positions. A blank amount with a
  close BTC stop previewed a position capped at 10,000. Both directions of the
  Amount/Lots switch were exercised after the final correction.
- The chart and bots dashboard loaded with live stream updates. Browser error
  and warning logs were read and were empty after the final form checks.
- JavaScript syntax checks passed for all nine changed or added script files;
  the Git whitespace check passed.
- Read-only bridge specifications confirmed real lot minimum, step and maximum
  values. No broker order or close request was sent.

## Limits that remain

- These controls govern the paper bot accounts. Each bot has its own virtual
  balance; the exposure limit is not a shared real-account limit.
- Contracts requiring account-currency conversion are refused for new paper
  positions. For example, the bridge reports USDJPY's tick value in account
  cash, while the existing ledger multiplies price movement by units in JPY.
  Using those interchangeably would invent a dollar result. Existing positions
  and history are not converted by this change.
- Old daily records omit entry fees from their P&L and do not date partial
  exits. The daily guard conservatively reserves recorded fees and open partial
  losses; it can block earlier than an exact daily calculation. This is an extra
  safety reserve, not a changed commission assumption.
- Closed-record P&L still has the existing entry-fee accounting inconsistency.
  Historical profit factor, win rate and average R should not be treated as
  validated net performance. Correcting mixed historical records needs a
  separate accounting plan; this round does not rewrite the 645-trade history.
- No new strategy was proposed, no strategy parameters were changed, and no
  profitability or live-readiness claim is made. Multi-instrument split testing
  belongs after the remaining execution and accounting work.

## Specific live-code work awaiting permission

The brief explicitly protects `js/bots/live.js` and `js/bots/liveui.js`. They are
unchanged, as are the bridge, storage keys, ledger shapes and `index.html`.
lightweight-charts remains pinned to v4.2.0; there are no modules or build step.

Source review found that `Live.liveLots()` independently resizes from the real
balance, so the paper notional cap does **not** protect a live order. Its checks
also use a cached position book without reserving an order that is still being
sent, compare symbols literally, and omit an independent fresh-price check and
related-exposure limit. The daily loss comparison permits exact equality.

Proposed next change, requiring permission:

1. Update only the execution risk checks in `liveLots()`, `check()` and
   `submit()`, plus their read-only account/position refresh helpers. Retain all
   four manual arming gates, shadow mode and the existing order request format.
2. Cap each live position's value at 100% of the smaller of current real balance
   and equity, alongside the existing risk and lot caps. Include the unchanged
   execution costs, validate every specification, and refuse any currency
   conversion that cannot be valued safely.
3. Recheck a fresh MT5 execution quote, permitted instrument, broker volumes,
   stop geometry, open positions, related exposures and loss budgets immediately
   before sending. Count account-wide exposure, including positions opened
   elsewhere, rather than only ASTRA's filtered book.
4. Serialize submissions across terminal tabs, reserve pending exposure, and
   reconcile broker state before releasing an uncertain request. Never retry an
   uncertain order automatically. Count daily losses at equality and include
   open losses and reserved stop risk.
5. Exercise refusal paths with a disposable browser harness whose transport
   cannot send orders. Inspect the running app and console without arming it.

This proposal does not authorize arming or placing a real-money trade, changing
the bridge's `/order` or `/close` endpoints, or migrating stored history.
