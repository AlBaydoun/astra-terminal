# Manual trading follow-up

Branch `codex-round-1`; not committed or pushed automatically.

## Ready to commit: manual form, funds and restart behaviour

The manual form now remains in place when prices or bot results refresh. The
selected instrument, timeframe, amount, lots, stop, target, note and focused
input survive. Editing the stop/target of an existing position also prevents
that editor being replaced mid-entry. A draft is retained in memory when
switching away from and back to the manual page.

The order form requests its selected broker instrument directly, even when it
is not on the watchlist. Quotes and specifications reach all requested symbol
aliases, including `.m` and `.s` names for the same broker contract.

The observed ETH tick clock was three hours ahead of UTC. JustMarkets describes
its server clock as [GMT+3](https://get.justmarkets.help/hc/en-us/articles/14298246774428-How-to-%D0%A1hange-a-Time-Zone-in-MetaTrader),
and its [trading-hours page](https://get.justmarkets.help/hc/en-us/articles/14206580923420-What-Are-the-Trading-Hours-on-JustMarkets)
also lists GMT+2 in winter. The feed adapter now verifies an advancing broker
tick before applying a supported server-clock offset. It does not set old ticks
to the current time: frozen and closed-market quotes remain stale. The source
requirement and 180-second maximum age remain enforced. No bridge write code
or live arming code was changed.

Available allocation now deducts the full value of existing positions, not just
their tiny leveraged margin. All positions in a virtual account share its
100%-of-equity value ceiling. Partial exits release allocation. The percentage
buttons use what remains available; "100%" means 100% of that remainder. Typed
amounts and lots cannot bypass it, and the separate stop-risk limit still
applies. Estimated broker margin is labelled separately from account allocation.

Stops and targets already belong to saved open-trade records. Their storage
keys and record structure are preserved. Open instruments are now refreshed
directly before managing saved positions after startup, even when unwatched.
Storage failures are no longer swallowed: ASTRA warns and blocks further
entries in an unsaved ledger until saving succeeds.

Paper execution pauses while the PC or browser is off. On reopening, ASTRA loads
the saved levels and resumes against fresh prices. This does not execute stops
while the machine is off or invent fills for prices missed during that period.

## Browser evidence

- A manually entered ETH draft retained its symbol, 4h timeframe, amount, stop,
  target, note and cursor through several background refreshes.
- ETHUSD.m changed from "no verified live price" to an actual broker quote and
  valid 0.4-lot preview after the clock check.
- A disposable manual paper trade opened at about 2,491.57, allocating 996.63
  from 10,000. The next 100% button selected about 9,003.37, not another 10,000.
- A page restart restored its 2,400 stop and 2,700 target. After editing them,
  a second restart restored the new 2,450 stop and 2,650 target.
- A second typed 10,000 position was rejected by the actual submit button for
  exceeding the remaining allocation. The first test position was subsequently
  closed, leaving zero manual test positions open.
- The expanded running-browser suite passed 37/37 checks, including full-value
  allocation, stale/frozen broker clocks, aliases, serialization of edited
  levels, a restored stop executing, failed saves and repeated form refreshes.
- Browser warning/error logs were empty after verification.

All execution checks used disposable in-memory data or the separate offline
verification browser profile. No real order was sent and the owner's existing
645-trade history was not migrated or rewritten.

## Research result

The requested new bot was implemented as a separate research candidate, with
fixed rules and captured broker data. It failed the required multi-market
split test and was not promoted to automatic trading. Full trades, win rates,
profit factors, average R and drawdowns for all 16 instrument/half combinations
are in [the research report](research/channel20-results.md).

The earlier live-risk proposal remains pending permission. This follow-up did
not edit `live.js`, `liveui.js`, the bridge's `/order` or `/close`, storage keys,
ledger shapes, chart versions or script load order.
