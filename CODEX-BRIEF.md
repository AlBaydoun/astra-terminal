# Brief for an AI working on ASTRA Terminal

Read this whole file before changing anything. It replaces a lot of rediscovery,
and three of the rules below exist because breaking them has already cost real
measurement errors in this project.

---

## What this is

A trading terminal that runs as plain files in a browser: charts, drawing tools,
indicators, and a fleet of ~20 paper-trading bots. It also has a Python bridge to
a live MetaTrader 5 terminal (JustMarkets account) for real broker prices, and a
live-trading path that is off by default.

The owner is **not a programmer**. He starts the app by double-clicking a `.bat`
file. Explain things in plain language, never ask him to run terminal commands.

**Nothing in this app has ever traded real money. Every figure you will see is
paper.**

---

## How it is built — constraints you must not break

| | |
|---|---|
| Language | Plain JavaScript, classic `<script>` tags. **No modules, no imports, no build step.** |
| Charts | **lightweight-charts v4.2.0 — pinned. Do NOT upgrade to v5.** The v5 API is different and would break every chart in the app. |
| Load order | Set by `index.html` and it matters. `pairrules.js` must load before `bots.js`, or the bots cannot consult the permitted-instruments list. |
| Data | All bot ledgers, settings and drawings live in the browser's **localStorage**, not in files. Changing a storage key or a ledger shape destroys the owner's 645 trades of history. |
| Server | `server/astra-api.cjs` on port 8642. No database. |
| Bridge | `bridge/astra_mt5.py`, port 8644. Needs Python + the `MetaTrader5` package and a running MT5 terminal. |

Layout: `js/` holds the terminal (chart, draw, indicators, feed), `js/bots/` holds
the trading system (engine, strategies, backtest, the bot registry, the UI pages).

---

## The three rules that matter most

### 1. Never change a cost assumption to improve a result

The cost model is the foundation every conclusion rests on. Measured live from
this account:

- **Commission:** 0.003% per side on FX, metals and energy. **Zero** on indices
  and crypto. Resolved per instrument in `BotEngine.commissionFrac()`.
- **Spread:** read live from MT5 when the bridge runs, else the profile in
  `js/broker.js`.
- **Slippage:** 0.005% per side (`RISK.slippagePct`).

A unit bug here — commission being treated as a fraction instead of a percent —
charged **33 to 100 times too much** on every trade and made the whole fleet look
like it had lost 90,000 when it had not. If you believe a cost figure is wrong,
say so and show the evidence. Do not simply lower it.

### 2. Report negative results plainly

Most strategies do not work. That is the expected outcome, and finding it is
valuable. Do not tune parameters until a backtest looks good — that is
curve-fitting, and it produces a strategy that fails the moment it meets real
money.

Anything you claim works must survive a **split test**: profitable in the first
half of the history *and* in the second half, separately. `js/bots/marketfit.js`
already does this. Of 62 strategy/market/timeframe combinations measured, exactly
one survived.

### 3. Verify in the running app, not in your head

The app runs at `http://localhost:8642`. Open it, exercise the thing you changed,
read the console. A change that "should work" has repeatedly turned out not to —
`drawPencil` was called in two places and never existed, which killed the whole
canvas repaint silently for weeks.

---

## What to work on

### Hunt bugs — the highest-value work here

There are certainly more of the kind already found:

- a method called but never defined (`drawPencil`)
- a percent treated as a fraction (commission)
- a hardcoded list repeated in six files that drifted apart (pseudo-bot filters)
- `coordinateToTime` returning null right of the last candle, so tools silently
  refused to work there
- a 30-second re-render wiping a half-typed form
- `hi >= pos.tp` reading as `hi >= 0` when the target was null, closing a
  position instantly

Look especially for: unit confusion (percent vs fraction, lots vs units), guards
that are bypassed in one code path, state that is written in one place and read
in another with a different shape, and anything that silently swallows an error.

### The known open problem: position sizing

Size is `riskCash / stopDistance`. When a stop is very close, this produces
enormous positions — the record contains a **13,589,155 position on a 10,000
account**, returning 378 times its own risk. The money at risk stays correct, but
the notional is absurd and unfillable, and a handful of such trades dominate every
aggregate figure.

This needs a notional ceiling as well as a risk ceiling. It is the single most
valuable fix available, and it matters more than any strategy change.

### Make the measurement trustworthy

- Position sizing must respect broker `volumeMin`/`volumeStep`/`volumeMax` (specs
  come from the bridge's `/specs` endpoint).
- The backtest's fill model should be checked against reality: it assumes the
  stop is hit first when a candle spans both stop and target, which is
  deliberately pessimistic and should stay that way.
- Trades adjusted by hand are flagged `touched` and that flag reaches the closed
  record. Keep it — a bot's record must never silently include trades the
  strategy did not run itself.

### Then, and only then, strategy work

Any new or changed strategy must be measured across several instruments and both
halves of the history before it is described as working. Report the number of
trades, win rate, profit factor, average R and maximum drawdown, and state
plainly when it does not work.

---

## Do not touch without asking

- **The live-trading arming path** (`js/bots/live.js`, `js/bots/liveui.js`). Four
  separate manual gates guard the only route to real money. Do not simplify,
  streamline or bypass any of them.
- **The bridge's write endpoints** (`/order`, `/close` in `bridge/astra_mt5.py`).
  These send real orders to a real account.
- **The live-only rule.** A price counts as live only from the MT5 bridge or an
  exchange stream, and only if fresh within 180 seconds. The owner has been
  explicit: never trade on delayed data.
- **localStorage keys and ledger shapes** — see the data warning above.

---

## What "ready for live trading" actually requires

Code quality is necessary and nowhere near sufficient. Before real money, a
strategy needs:

1. A positive expectancy that survives the split test
2. At least 100 finished paper trades, ideally over weeks
3. Profitability on more than one instrument
4. A drawdown the owner can sit through
5. Costs modelled at or worse than reality

The bots do not currently meet this. Saying so clearly is more useful than making
a backtest look good.

---

## Working habits

- One coherent change at a time, then verify it, then commit it. The repo is
  `github.com/AlBaydoun/astra-terminal`; the owner commits through GitHub Desktop.
- Leave a comment explaining *why* whenever the reason is not obvious from the
  code. The existing comments are written that way on purpose — read them before
  rewriting a function that looks strange.
- If you find something you were not asked about, say so rather than fixing it
  silently.
