"""
ASTRA MT5 bridge — connects the ASTRA terminal to your own MetaTrader 5 terminal.

Why: public price feeds are delayed (usually 15 minutes for indices, metals and oil)
and closed at weekends. Your MT5 terminal already receives your broker's real tick
stream. This little program reads it and hands it to ASTRA on your own PC only —
nothing leaves the machine, and it never places an order.

Setup once:
    pip install MetaTrader5
Then keep MetaTrader 5 open and logged in, and double-click START-MT5-Bridge.bat.

Endpoints (localhost only):
    /health                       is the bridge up, which account, which symbols
    /quotes?symbols=A,B           current prices
    /candles?symbol=X&tf=1h       candles
    /positions                    open positions (read-only, for later steps)
"""
import json
import os
import re
import sys
import time
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
except ImportError:
    raise SystemExit(
        "The MetaTrader5 package is missing.\n"
        "Open a command window and run:  pip install MetaTrader5\n"
    )

# The Windows console defaults to a legacy codepage, which turns dashes and
# arrows into question marks. Ask for UTF-8 so the messages read properly.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

PORT = 8644
TF = {
    "1m": mt5.TIMEFRAME_M1,
    "5m": mt5.TIMEFRAME_M5,
    "15m": mt5.TIMEFRAME_M15,
    "1h": mt5.TIMEFRAME_H1,
    "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
    "1w": mt5.TIMEFRAME_W1,
}
SUB_MINUTE = {"1s": 1, "30s": 30}     # built from ticks, not from MT5 candles
SAFE = re.compile(r"^[A-Za-z0-9._#/-]{1,32}$")

_lock = threading.Lock()
_symbols_cache = {"t": 0.0, "list": []}


CONFIG = os.path.join(os.path.expanduser("~"), "astra-data", "mt5-path.txt")


def candidate_terminals():
    """Where a broker-branded MetaTrader 5 might live.

    JustMarkets (and every other broker) ships the same MetaQuotes terminal under
    its own name, in its own folder. The Python package's automatic search looks
    for a standard MetaTrader 5 install, so on a broker build it often finds
    nothing — or worse, finds a different terminal you also have installed.
    So we look properly, and we say what we found."""
    seen, out = set(), []

    def add(p):
        if p and p not in seen and os.path.isfile(p):
            seen.add(p)
            out.append(p)

    # 1. an explicit choice always wins
    add(os.environ.get("ASTRA_MT5_PATH"))
    try:
        with open(CONFIG, "r", encoding="utf-8") as fh:
            add(fh.read().strip())
    except OSError:
        pass

    # 2. every Program Files folder that mentions a terminal
    roots = [os.environ.get("ProgramFiles", r"C:\Program Files"),
             os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
             os.path.join(os.path.expanduser("~"), "AppData", "Local", "Programs")]
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        try:
            entries = os.listdir(root)
        except OSError:
            continue
        # brokers first, so a branded build beats a plain MetaTrader install
        entries.sort(key=lambda d: (0 if "just" in d.lower() else
                                    1 if "mt5" in d.lower() or "meta" in d.lower() else 2))
        for d in entries:
            low = d.lower()
            if "meta" in low or "mt5" in low or "trader" in low or "just" in low:
                add(os.path.join(root, d, "terminal64.exe"))
                add(os.path.join(root, d, "terminal.exe"))

    # 3. portable installs registered under MetaQuotes
    base = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "MetaQuotes", "Terminal")
    if os.path.isdir(base):
        try:
            for d in os.listdir(base):
                add(os.path.join(base, d, "terminal64.exe"))
        except OSError:
            pass
    return out


def connect():
    """Attach to the running MetaTrader 5 terminal, wherever the broker put it.

    Order matters here. If more than one terminal is installed — very common, a
    broker build beside a plain MetaTrader 5 — the package's automatic search can
    silently attach to the WRONG one and report success. That failure is invisible:
    prices would arrive from another broker's terminal. So explicit, broker-first
    paths are tried before falling back to the automatic search."""
    tried = []
    candidates = candidate_terminals()

    if len(candidates) > 1:
        print("more than one MetaTrader terminal is installed — trying the broker build first:")
        for c in candidates:
            print("   ", c)

    for path in candidates:
        if mt5.initialize(path=path):
            try:
                os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
                with open(CONFIG, "w", encoding="utf-8") as fh:
                    fh.write(path)          # remember it for next time
            except OSError:
                pass
            return report(path)
        tried.append((path, mt5.last_error()))

    # nothing explicit worked — let the package look for itself
    if mt5.initialize():
        return report(None)
    tried.append(("automatic search", mt5.last_error()))

    print("\n  Could not attach to MetaTrader 5. Here is exactly what was tried:\n")
    for where, err in tried:
        print("    x %s\n        -> %s" % (where, err))
    print("""
  Two things are needed:
    1. The JustMarkets MT5 terminal must be OPEN and LOGGED IN.
    2. This bridge must be pointed at that terminal.

  If your terminal is not in the list above, find terminal64.exe inside its
  installation folder (in MT5: File -> Open Data Folder shows you where it lives),
  then start the bridge with the path, once:

      python astra_mt5.py --path "C:\\Program Files\\JustMarkets MT5 Terminal\\terminal64.exe"

  The path is remembered afterwards, so a plain double-click works from then on.
""")
    raise SystemExit(1)


def report(path):
    term = mt5.terminal_info()
    info = mt5.account_info()
    print("connected to:", getattr(term, "name", "?"), "|", getattr(term, "company", "?"))
    if path:
        print("terminal:", path)
    if info is None:
        print("\n  The terminal is open, but no account is logged in.\n"
              "  Log in to your JustMarkets account in MetaTrader 5, then restart this bridge.\n")
        raise SystemExit(1)
    print("account:", info.login, "on", info.server, "|", info.currency, info.balance)

    # a wrong-terminal connection is the one failure that looks like success
    who = (str(getattr(info, "server", "")) + " " + str(getattr(term, "company", ""))).lower()
    if "just" not in who:
        print("\n  WARNING — this does not look like a JustMarkets account.\n"
              "  Server: %s   Company: %s\n"
              "  You may have more than one MetaTrader terminal installed and this is the\n"
              "  wrong one. Point the bridge at the right terminal once:\n"
              "      python astra_mt5.py --path \"C:\\\\Program Files\\\\JustMarkets MetaTrader 5\\\\terminal64.exe\"\n"
              % (getattr(info, "server", "?"), getattr(term, "company", "?")))
    return info


def all_symbols():
    """Symbol names visible to the account (cached for a minute)."""
    now = time.time()
    if now - _symbols_cache["t"] < 60 and _symbols_cache["list"]:
        return _symbols_cache["list"]
    with _lock:
        syms = mt5.symbols_get() or []
    names = [s.name for s in syms]
    _symbols_cache.update({"t": now, "list": names})
    return names


def ensure_selected(symbol):
    """A symbol must be in Market Watch before it streams prices."""
    with _lock:
        info = mt5.symbol_info(symbol)
        if info is None:
            return False
        if not info.visible:
            mt5.symbol_select(symbol, True)
        return True


def quote(symbol):
    if not ensure_selected(symbol):
        return None
    with _lock:
        tick = mt5.symbol_info_tick(symbol)
        info = mt5.symbol_info(symbol)
        day = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 1)
    if tick is None or info is None:
        return None
    last = tick.last or tick.bid or 0.0
    if not last:
        return None
    prev_open = float(day[0]["open"]) if day is not None and len(day) else None
    high = float(day[0]["high"]) if day is not None and len(day) else None
    low = float(day[0]["low"]) if day is not None and len(day) else None
    return {
        "symbol": symbol,
        "last": last,
        "bid": tick.bid,
        "ask": tick.ask,
        "prev": prev_open,
        "pct": ((last - prev_open) / prev_open * 100) if prev_open else 0.0,
        "high": high,
        "low": low,
        "digits": info.digits,
        "currency": info.currency_profit,
        "exchange": "MT5",
        "time": tick.time,
    }


def candles_from_ticks(symbol, bucket, limit):
    """MetaTrader has no sub-minute candles, so build them from the real tick stream."""
    span = min(bucket * max(limit, 60), 6 * 3600)
    now = datetime.now(timezone.utc)
    with _lock:
        ticks = mt5.copy_ticks_range(symbol, now - timedelta(seconds=span), now, mt5.COPY_TICKS_ALL)
    if ticks is None or not len(ticks):
        return []
    bars, cur, slot = [], None, -1
    for t in ticks:
        last, bid, ask = float(t["last"]), float(t["bid"]), float(t["ask"])
        if last:
            price = last
        elif bid and ask:
            price = (bid + ask) / 2
        else:
            price = bid or ask
        if not price:
            continue
        s = int(t["time"]) // bucket * bucket
        if s != slot:
            if cur:
                bars.append(cur)
            cur = [s, price, price, price, price, 1.0]
            slot = s
        else:
            cur[2] = max(cur[2], price)
            cur[3] = min(cur[3], price)
            cur[4] = price
            cur[5] += 1.0
    if cur:
        bars.append(cur)
    return bars[-limit:]


def candles(symbol, tf, limit):
    if not ensure_selected(symbol):
        return None
    if tf in SUB_MINUTE:
        return candles_from_ticks(symbol, SUB_MINUTE[tf], min(limit, 2000))
    with _lock:
        rates = mt5.copy_rates_from_pos(symbol, TF.get(tf, mt5.TIMEFRAME_H1), 0, min(limit, 5000))
    if rates is None:
        return None
    return [
        [int(r["time"]), float(r["open"]), float(r["high"]), float(r["low"]),
         float(r["close"]), float(r["tick_volume"])]
        for r in rates
    ]


def positions():
    with _lock:
        pos = mt5.positions_get() or []
    return [
        {"ticket": p.ticket, "symbol": p.symbol, "volume": p.volume,
         "type": "buy" if p.type == 0 else "sell", "price_open": p.price_open,
         "price_current": p.price_current, "profit": p.profit, "time": p.time}
        for p in pos
    ]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == "/health":
                acc = mt5.account_info()
                return self._send({
                    "ok": True,
                    "account": getattr(acc, "login", None),
                    "server": getattr(acc, "server", ""),
                    "currency": getattr(acc, "currency", ""),
                    "balance": getattr(acc, "balance", None),
                    "equity": getattr(acc, "equity", None),
                    "symbols": all_symbols(),
                })

            if u.path == "/quotes":
                names = [s for s in (q.get("symbols", [""])[0]).split(",") if s and SAFE.match(s)][:60]
                out = []
                for s in names:
                    try:
                        r = quote(s)
                        if r:
                            out.append(r)
                    except Exception as e:
                        print("quote error", s, e)
                return self._send({"quotes": out})

            if u.path == "/candles":
                sym = (q.get("symbol", [""])[0]).strip()
                if not SAFE.match(sym):
                    return self._send({"error": "bad_symbol"}, 400)
                tf = q.get("tf", ["1h"])[0]
                limit = int(q.get("limit", ["1000"])[0] or 1000)
                c = candles(sym, tf, limit)
                if c is None:
                    return self._send({"error": "symbol_not_found"}, 404)
                return self._send({"candles": c, "meta": {"symbol": sym, "exchange": "MT5"}})

            if u.path == "/positions":
                return self._send({"positions": positions()})

            return self._send({"error": "not_found"}, 404)
        except Exception as e:
            return self._send({"error": str(e)}, 500)

    def log_message(self, *a):
        pass  # keep the console quiet


def main():
    # let the operator point at the terminal explicitly, once
    if "--path" in sys.argv:
        try:
            chosen = sys.argv[sys.argv.index("--path") + 1]
            os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
            with open(CONFIG, "w", encoding="utf-8") as fh:
                fh.write(chosen)
            print("terminal path saved:", chosen)
        except (IndexError, OSError) as e:
            print("could not save the path:", e)
    connect()
    names = all_symbols()
    print("%d symbols available. Bridge listening on http://127.0.0.1:%d" % (len(names), PORT))
    print("Leave this window open while you use ASTRA. Close it to stop.")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
