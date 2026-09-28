# Chart screens — as many charts as you want, every one a real chart

## What you asked for

More charts on the desk than the old 1 / 2 / 4 split allowed, and every extra
chart behaving exactly like the main one, with all of its functions.

## How to use it

In the top bar, next to the layout buttons:

| Control | What it does |
|---|---|
| **1 / 2 / 4** | one, two or four charts, as before |
| **+** | add one more chart — press it as often as you like |
| **−** | close the last chart |
| the number between them | how many charts are on the desk right now |

Each extra chart carries a thin header of its own:

| On the header | What it does |
|---|---|
| the instrument and timeframe | what that chart is showing |
| **follow** | tick it and the chart shows whatever the main chart shows |
| **⛶** | give that chart the whole desk; press again to go back |
| **×** | close that chart |

The charts arrange themselves: 2 charts side by side, 3 or 4 in a square,
5 to 9 in a 3×3, and so on. The limit is 16 extra charts — past that a single
window stops being readable, and a second window (the **Windows** button) is
the better tool.

## Separate windows, one per monitor

Yes — open as many chart windows as you have monitors (24 is the ceiling).

**Windows ▸ ➕ Another chart window**, or **Ctrl + F2**. Drag each one onto the
monitor you want it on; it stays there.

The Windows menu now has a **CHART WINDOWS** section listing every one that is
open, with what it is showing — *Chart window 2 — XAUUSD.m*. Click a row to
bring that window forward, or the **×** on the row to close just that one.

Each window is **numbered**, and the number is what makes a multi-monitor desk
work:

- Chart window 2 keeps its own instrument, timeframe and indicators, exactly
  like a screen on the desk, and opens with them again next time.
- In the desktop app each number also remembers its own size and position, so
  the window you put on the left monitor opens on the left monitor again.
- Close one and the number is free again — the next window you open takes it
  back, so the numbers stay small and meaningful.

This was broken before and is worth knowing about: the old code named a new
window from the last four characters of the clock in base 36, which repeats
every 28 minutes. Two chart windows opened far enough apart got the *same*
name, and the browser then reused the first window instead of opening a second
one — it looked as if nothing happened. Windows also all shared one set of
indicators and one instrument, so changing one changed the others on the next
start. Both are gone.

## Keyboard shortcuts

All five are in the shortcut list (**F1**) and any of them can be rebound there
— click the key, press the new one.

| Key | What it does |
|---|---|
| **Ctrl + F1** | **this chart in its own window.** Click the chart screen you mean first: that chart leaves the desk and opens as a window on its own instrument and timeframe, ready to drag onto another monitor. Pressed with no screen selected, it opens a window on the main chart. |
| **Ctrl + F2** | another chart window — press it once per monitor |
| **Ctrl + F3** | the Windows menu — any panel (bots, screener, news, watchlist…) in its own window |
| **Alt + ↑** | one more chart screen on the desk |
| **Alt + ↓** | close the last chart screen |

The keys work inside a chart screen too. A screen has no Windows menu and no
+ / − of its own, so it passes the request to the desk — which is why Ctrl+F1
pressed inside a screen moves *that* chart out, and not some other one.

## Why these are real charts

An extra chart is not a small copy. It is the whole terminal loaded again in
chart mode inside the tile, so it brings everything with it:

- the full drawing rail — trend, ray, horizontal and vertical lines, Fibonacci,
  long and short positions, forecast, bars pattern, measure, text and the rest
  (14 tools, the same ones the main chart has),
- every indicator in the catalogue, with the same settings window,
- the price rail, the position lines, your open trades drawn on the chart,
- BUY · Manual and SELL · Manual,
- Alert, Replay, Compare, Markets, Inspect / replay, the right-click menu,
  chart labels and the screenshot button.

## What each chart keeps to itself, and what is shared

| Kept per chart | Shared with every chart |
|---|---|
| instrument | drawings (per instrument) |
| timeframe | open positions and their lines |
| indicators and their settings | alerts |
| candle type | watchlist, account, theme |
| the indicator windows below the price | |

A **new chart starts as a copy of the main chart** — same instrument, same
indicators — and goes its own way from the first change you make to it. Until
you change its indicators it keeps following the main chart's indicator
changes; after that it is its own.

A line you draw on one chart appears on every chart showing that instrument.
That is deliberate: a support level is a fact about the instrument, not about
the window it was drawn in.

The desk is remembered: the charts, their instruments, their timeframes and
their follow ticks all come back the way you left them, and they are saved into
your workspaces too.

## What was tested

On the running terminal, with the live broker feed connected:

- Nine charts at once (main + 8) in a 3×3 grid, all showing candles.
- Timeframe changed on one chart to 1H: that chart alone moved, the main chart
  and the other chart stayed on 15m, and it was still 1H after a restart.
- An indicator switched on in one chart: only that chart's settings changed
  (20 KB saved under its own name), the main chart's settings byte-identical,
  and a third chart still mirroring the main chart.
- **follow** ticked on one chart: the main chart moved to XAUUSD.m and that
  chart followed; the chart without the tick stayed on AMZN.
- All 14 drawing tools present inside a chart, and arming one puts that chart
  into drawing mode.
- Maximise hides the others and restores; close frees the slot.
- Closing a chart also deletes its stored settings, so browser storage does not
  silently fill up with the leftovers of charts you closed.

## The lower panel can be resized again

Screener, Heatmap, Observer, Intel, News & Alerts — and the Market Clock and
Trade Replay when they sit in the panel rather than filling the screen — all
share the lower panel, and the bar on its top edge sets its height.

**That bar was three pixels tall.** It lived inside the panel, the panel clips
its own overflow (so half of it was cut away), and the tab strip covered the
rest. Three pixels is not something a mouse can catch, which is why resizing
"did not work" in every one of those tabs.

It is now a bar of its own between the charts and the panel: **10 pixels tall,
the full width**, with a line in the middle that lights up when you are on it
and an up-down arrow for a cursor. Drag it up for a bigger panel, down for a
bigger chart. **Double-click it** to fold the panel away and again to bring it
back. The height is remembered.

Two smaller things went with it: the panel used to ease into its new height over
0.2 s, so it lagged behind the cursor during a drag — it now follows exactly —
and the drag is on pointer events with capture, so it no longer stops when the
cursor runs off the bar or out of the window, and it works with a finger on a
touch screen.

Tested with a real mouse drag: 480 → 586 px dragging up, 586 → 481 dragging
down, saved both times, with the Screener active and again with the Market Clock
open in the panel (its content followed, 534 → 429).

**Market Clock and Trade Replay** have three sizes of their own — full screen,
in the panel, folded to the tab strip — and the tab button cycles them. Dragging
only applies in the middle one; full screen is full screen. Click the tab again
to bring the window down into the panel, then drag it to whatever height you
want.

## Honest notes

- Nine charts means nine live price streams. On a normal desk that is fine; on a
  slow machine or a weak connection, fewer charts update more smoothly.
- The extra charts share the room under the top bar with the lower panel
  (screener, heatmap, news). With many charts, drag the divider down so the
  candles get the height — otherwise each chart is mostly toolbar.
- Very small tiles drop the "chart labels" row automatically so the candles keep
  what is left. Everything else stays.
- The logo, the account pill, the theme switch and the workspace button are not
  repeated inside every chart — they belong to the terminal, not to one chart.
- Screens share one window; **windows** are the right tool for a second and
  third monitor. Both are real charts, and Ctrl+F1 moves one from the desk into
  a window of its own.
- The test browser used here has no pop-up windows — it follows the link in
  place — so the windows could not be watched opening. What was checked instead,
  with the opening call intercepted: six chart windows asked for in a row got six
  different window names and six different chart numbers (w1…w6, no reuse);
  closing number 3 and asking again put the next window back into number 3; a
  window opened for a particular instrument had that instrument written into its
  own settings before it opened (XAUUSD.m, 1h); and the menu listed all six with
  their instruments and a close button each. On your PC the windows themselves
  are opened by the same code you already use from the Windows menu.
