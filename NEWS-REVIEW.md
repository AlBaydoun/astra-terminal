# Ready to commit: News & alerts

Branch: `codex-round-1`. No commit made. This change adds a market briefing without changing any strategy, trading control, cost, storage key or ledger.

## Using it

Click **NEWS & ALERTS** in the lower navigation. The first visit opens an expanded briefing. **Restore**, **Expand**, **Escape** and the panel collapse arrow let you return to the charts. It is also available in the existing **Windows** menu as a separate panel.

- A lead headline and illustrated cards show the source, publication age, market tags and a short, original “why it matters” explanation.
- Search headlines or filter FX, gold/precious metals, energy, indices, stocks, crypto or fresh high-impact reports.
- The alert desk and navigation badge highlight potentially important reports published in the last 24 hours. New qualifying headlines produce one in-app notification per window/session. The initial batch is quiet.
- **Alerts on / Alerts muted** controls news pop-ups in the current window until reload. It does not change existing price alerts or request desktop notification permission.
- News refreshes every five minutes while the app is running. Source health and the last check time remain visible. These are RSS headlines, not a real-time wire service or an economic-release calendar.

## Sources and relevance

The server fetches fixed public RSS feeds: CNBC Markets, CNBC Economy, the Federal Reserve, the European Central Bank and the US Energy Information Administration. Cards link directly to the publisher. Headlines and links only; no full articles are republished.

Official source references: [Federal Reserve feeds](https://www.federalreserve.gov/feeds/feeds.htm), [ECB feeds](https://www.ecb.europa.eu/home/html/rss.en.html), [CNBC Markets feed](https://www.cnbc.com/id/100003114/device/rss/rss.html), [CNBC Economy feed](https://www.cnbc.com/id/20910258/device/rss/rss.html), [EIA Today in Energy feed](https://www.eia.gov/rss/todayinenergy.xml).

Impact is a transparent headline-topic estimate, not a measured forecast or a Buy/Sell signal. Rate decisions, major economic data and geopolitical developments rank above general market stories. Routine banking releases, mortgage-demand stories and missile-factory business stories do not automatically become crisis alerts. The explanations describe possible market connections, not an expected price direction.

The existing crypto Intel/sentiment feature stays separate, so the expanded source list does not change a bot's news inputs. No Binance data service is enabled.

## Handling unavailable or unsafe data

The same-origin `/api/news` route only fetches the five fixed sources. It shares concurrent requests, caches for five minutes, applies a ten-second request timeout and checks RSS format and headline destinations. Article links must use HTTPS on the publisher's domain. Headline text is escaped in the UI.

Missing publication dates stay unknown. Items older than seven days and substantially future-dated items are excluded by the server. Unknown dates, stale fetches, failed sources and future timestamps cannot trigger fresh alerts. After an outage, retained headlines keep their original dates and are labelled cached. A complete initial outage displays unavailable sources and no invented stories; it never reports a market all-clear.

No preference storage was added. Mute/filter/search choices are local to the current page. Existing account data is not sent to news publishers. The local ASTRA data-service process was restarted to load the new route; the desktop window and MT5 bridge were not restarted.

## Verification

- **9/9 browser news checks:** ranking, routine-story exclusions, gold/FX tags, date and fetch freshness, filters/search persistence, safe HTML and links, duplicate notifications, mute, outages/recovery and expand/restore.
- **4/4 Node service checks:** RSS parsing, dates and link restrictions, concurrent cache/deduplication, stale retention and full outage.
- **44/44 existing browser risk checks.**
- Real app at localhost:8642: all five feeds responded, 47 recent deduplicated headlines were visible during verification; counts change with incoming stories. Verified market filtering, search/no-results, mute, expanded view, restore and collapse. Reviewed the actual screenshot and browser console; no console errors.
- JavaScript syntax and Git whitespace checks passed.

Suggested commit title: `Add market news briefing and high-impact headline alerts`.
