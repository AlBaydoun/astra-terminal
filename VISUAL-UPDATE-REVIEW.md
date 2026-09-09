# ASTRA visual workspace update

Branch: `codex-round-1`. Ready for review in GitHub Desktop; not committed automatically.

## What changed

- Clearer dark backgrounds, stronger panel borders, larger labels, and matching light-mode styling across the terminal.
- Consistent SVG icons on the main tabs, sidebar tabs, bot navigation, page headers and trade sections.
- Bot pages organised into Overview, Trading desk, Scanners & research, Strategy bots, and Settings & safety. The search includes every registered bot and automatically includes future bots.
- Clicking BOTS opens a larger workspace on the first visit. Expand / Restore and Escape control its size. No new saved preference is needed.
- Workspace shortcuts connect Overview, Manual, Open trades, Confluence Scanner, Chart, News and Market settings. Each open trade links to its exact instrument chart and originating bot.
- Open trade cards separate position facts, saved price levels, stop/target controls, trailing stops, and exit actions. A price rail shows the saved stop, entry, current quote and target. Missing quotes are labelled; an absent target is not drawn at zero.
- Bot performance includes a small chart of its existing recorded equity. Empty histories do not get invented data. Open positions, history, decisions and lessons have distinct panels.
- Manual risk settings initially fold away so the order ticket is easier to reach. All existing settings remain available under “Manual trading rules — risk & budgets.”

## Scope

Presentation and navigation only. No strategy parameters, execution calculations, costs, broker endpoints, live arming gates, storage keys or ledger formats were changed. Charts remain on lightweight-charts 4.2.0 with classic scripts and no build step.

The equity graphic describes recorded paper equity, including open P&L. It is not a forecast. The price rail uses saved position levels; typing an edit does not falsely show it as already applied.

## Verification

Checked in the running terminal at http://localhost:8642:

- Expanded and restored the workspace; checked searchable navigation and clearing the search.
- Viewed actual open trade cards, their separate controls, and a bot's existing equity/history graphic.
- Opened the Confluence Scanner, manual ticket, news, and market-settings panel through the shortcuts.
- Used an open gold trade's Chart shortcut and verified that XAUUSD.m returned to the visible chart.
- Checked dark and light mode, then restored dark mode.
- Browser console: no errors during the final review.

Browser checks using disposable in-memory ledgers (no live-order scripts):

- `tests/workspace-checks.html`: **45/45 passed**. Includes 35 existing entry-order/manual-ticket checks and 10 checks for navigation, draft retention, graphic refresh, missing/flat data, and the existing protection handler in the new layout.
- `tests/risk-checks.html`: **44/44 passed**.
- JavaScript syntax checks and `git diff --check` passed.

Suggested commit title: **Improve terminal navigation and visual separation**.
