# Manual entry orders — approved design

The Instrument permissions page is verified: five browser checks pass, the real
page blocks/allows ETH, and its choice survives reload. The old permission key
and history format are unchanged. These changes are already in commit 8cb7871.

The next change adds Market, Limit and Stop entry choices to Manual Trading.
A buy limit waits for the simulated executable buy price at or below the entry;
a sell limit waits for the sell price at or above it. Stop entries work in the
opposite direction. Existing spread, commission and slippage remain in effect.
SL and TP are explicit fixed prices attached to the instruction and copied to
the paper position if it opens. Every trigger rechecks current quotes, risk,
position counts, correlations, pair permissions and available account value.
An invalid triggered order is shown as rejected; it is not silently retried.

Waiting orders show the pair, side, type, entry, quantity, SL, TP and Cancel.
No trade record is created until an actual paper fill. Existing trade ledgers
and their formats stay as they are.

Approved after the owner was asked and replied "continue": add one separate browser-storage key,
`astra_manual_pending_v1`, holding only the waiting-order list and processing
status. Each entry contains an ID, symbol, direction, order type, entry price,
quantity, stop-loss, take-profit, timeframe, note, creation time and status.
This lets the orders and their levels return after restarting in the same browser. The list is excluded from cloud sync so another device cannot duplicate an instruction. A processing
instruction interrupted during saving is held for review instead of risking a
duplicate trade. No existing storage key is renamed or removed.

Pending instructions do not guarantee execution or reserve a broker position.
Funds and all risk controls are checked when an instruction triggers; an order
cannot reuse allocation already consumed by an open position.

These are browser-managed PAPER orders. They cannot execute while the browser
or PC is off. On reopening, fresh quotes are required; ASTRA cannot pretend a
price touch during the outage was a fill. Broker-hosted orders would require a
separate approved change to the protected live-trading path.

Order-direction reference: [MetaTrader 5 order definitions](https://www.metatrader5.com/en/terminal/help/trading/general_concept). ASTRA retains its existing simulated fill, including spread and 0.005% slippage, for trigger comparisons. This is deliberately a paper execution model.
