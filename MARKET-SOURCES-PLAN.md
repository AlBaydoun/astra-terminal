# JustMarkets markets and optional Binance — implementation plan

Default to JustMarkets instruments reported by the connected MT5 bridge.
Hide unsupported catalogue entries, Binance pairs and public-feed instruments
from symbol selection, watchlists, market browsing and bot scans. Preserve saved
watchlists and all existing trade history so nothing has to be reconstructed.

Add a clearly labelled Market settings page with Binance OFF by default and an
explicit Enable/Disable control. Disabled Binance means no snapshot request,
websocket connection/reconnect, chart request or new paper entry, even through
an old saved selection or waiting order. Broker crypto such as ETHUSD.m stays
available from JustMarkets; it must not silently receive Binance prices.
Existing positions remain visible in the trade record; disabling a source does
not close them or rewrite their stops. With no enabled fresh source their paper
execution waits. Show this consequence beside the control.

Proposed persistence: ONE new preference key, `astra_market_sources_v1`, holding
`{"binance":false}` initially. This is separate from every existing ledger and
permission key. Invalid/missing settings default to OFF; save failures are
visible; another window receives changes. Exclude this preference from cloud
sync so another device cannot silently enable Binance here. The owner must
approve this new key before implementation, per CODEX-BRIEF.md.

The owner approved `astra_market_sources_v1` explicitly in this task before its
implementation. The key and value above are therefore authorized.

The production live arming files and bridge write endpoints are outside this
change. Existing live-price freshness, cost and sizing rules remain in force.
Research candidates run separately with disposable histories and no new bot
storage keys; promotion to a saved running bot requires a concrete proposal.

Verification will cover UI filtering, missing/reconnected bridge, broker crypto,
Binance OFF at startup and while requests are in flight, existing-position
visibility, final entry refusal, save/reload and cross-window setting changes.
Run these in the browser and inspect its console, alongside the existing checks.
