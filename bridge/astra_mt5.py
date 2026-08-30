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
import re
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
except ImportError:
    raise SystemExit(
        "The MetaTrader5 package is missing.\n"
        "Open a command window and run:  pip install MetaTrader5\n"
    )

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
SAFE = re.compile(r"^[A-Za-z0-9._#/-]{1,32}$")

_lock = threading.Lock()
_symbols_cache = {"t": 0.0, "list": []}


def connect():
    """Attach to the running MetaTrader 5 terminal."""
    if not mt5.initialize():
        raise RuntimeError("cannot reach MetaTrader 5 — is it open and logged in? (%s)" % (mt5.last_error(),))
    info = mt5.account_info()
    term = mt5.terminal_info()
    print("connected:", getattr(info, "server", "?"), "account", getattr(info, "login", "?"),
          "| terminal", getattr(term, "name", "?"))
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


def candles(symbol, tf, limit):
    if not ensure_selected(symbol):
        return None
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
