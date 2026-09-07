# Manual entry orders — ready to commit

Branch: `codex-round-1`. Suggested commit title: `Add saved manual entry orders`.

## What you can do

Open **BOTS → Instrument permissions** to find a pair and choose **Block pair**,
**Allow pair**, or **Back to automatic**. The Manual Trading toolbar also links
there. The page explains whether the trading record or your choice caused a
block. This part is already included in commit `8cb7871` and verified.

In **Manual Trading Bot**, choose **Market**, **Limit**, or **Stop entry**.
For your ETH example, choose BUY, Limit, entry 2490.20, then enter the stop-loss,
take-profit and amount. SELL Limit at 2499.30 works in the opposite direction.
The waiting-order list shows the exact levels, status and a Cancel order button.
Quick stop/target percentages use the chosen entry price, and refreshes keep the
actual input controls intact while you type.

Waiting instructions keep their size and levels when saved. Their size must fit
the broker volume rules, risk ceiling and position-value ceiling. At execution,
ASTRA checks the current price, funds, pause setting, maximum positions,
correlation limit, daily loss budget and instrument permission again. A failed
check produces a visible rejection. Waiting instructions do not reserve funds;
an earlier fill can leave insufficient funds for a later instruction.

Only the approved new `astra_manual_pending_v1` storage key was added. Existing
trade-history keys and record formats remain unchanged. The list stays in the
browser where you place it; cloud sync excludes it to prevent another device
from executing a copy. Manual ledger changes use a shared browser lock so two
updated ASTRA windows cannot execute the same instruction twice. Interrupted
execution is held for review instead of being automatically retried.

These are PAPER orders. They cannot execute with the PC/browser off, and a price
touch during an outage cannot be reconstructed as a fill. Saved instructions
resume checking fresh quotes on reopening. For uninterrupted broker execution,
a separate approved live-trading change would be needed.

Close or reload older ASTRA windows once after updating so every window uses the
same version. No terminal commands are needed.

## Verification observed on localhost:8642

- 20/20 manual entry-order checks passed.
- 37/37 existing risk checks passed.
- 5/5 instrument-permission checks passed.
- All test-page and terminal consoles were clear of warnings/errors.
- Real permission page: block ETH, reload, confirm saved block, allow, then
  restore the verification profile's original automatic choice.
- Real Manual Trading page: save a distant BTC limit order at 70000 with SL 69000
  and TP 73000; reload and verify all three levels; cancel from a second window
  and observe both windows agree.
- With two windows polling, a second disposable paper limit instruction at
  80000 filled once at 79493.83, with SL 78000 and TP 83000 unchanged in the open
  position. Both windows displayed the same position #2. It was then closed;
  the verification profile has no manual positions left open.
- JavaScript syntax and git whitespace checks passed.

The verification browser uses its separate offline paper history; the owner's
existing trading history was not edited for testing. No broker order was sent.

Commission, slippage, live arming code, bridge write endpoints and the pinned
lightweight-charts version were unchanged in this change. Script loading remains
classic JavaScript with no build step. Full design: MANUAL-ENTRY-PLAN.md.
