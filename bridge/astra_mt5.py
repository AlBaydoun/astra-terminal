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
    /positions                    open positions

REAL ORDERS
    By default this bridge CANNOT place an order — the endpoint refuses every
    request. It only works when the program is started with --enable-trading,
    which is what START-LIVE-TRADING.bat does and nothing else does. A six-digit
    code is then printed in this window and ASTRA must be given that code before
    it may send anything. Closing this window stops live trading at once.

    POST /order   {code, symbol, side, lots, sl, tp, comment}
    POST /close   {code, ticket}
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

# ---------------------------------------------------------------------------
# Real orders are off unless this program was started with --enable-trading,
# which only START-LIVE-TRADING.bat does. When it is on, a six-digit code is
# generated for this run and printed in this console window only; ASTRA has to
# be given that code before the order endpoint will accept anything. Closing
# this window ends live trading immediately.
TRADING_ENABLED = False
SESSION_CODE = ""
MAGIC = 20260902          # stamps every order ASTRA sends, so they are identifiable
ORDER_LOG = os.path.join(os.path.expanduser("~"), "astra-data", "live-orders.log")


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


def log_order(line):
    """Every order attempt, accepted or refused, written outside the app.

    If the interface and the broker ever disagree about what happened, this file
    is the independent record.
    """
    try:
        os.makedirs(os.path.dirname(ORDER_LOG), exist_ok=True)
        with open(ORDER_LOG, "a", encoding="utf-8") as fh:
            fh.write("%s  %s\n" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), line))
    except OSError:
        pass


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
         "price_current": p.price_current, "profit": p.profit, "time": p.time,
         "sl": p.sl, "tp": p.tp, "magic": p.magic, "comment": p.comment,
         "swap": getattr(p, "swap", 0)}
        for p in pos
    ]


def deals(days=30):
    """Closed deals straight from MetaTrader's own history.

    Live results must be read from the broker's record, never from ASTRA's
    simulation of it. This is what the live reporting is built on.
    """
    to = datetime.now() + timedelta(days=1)
    frm = datetime.now() - timedelta(days=max(1, min(365, days)))
    with _lock:
        rows = mt5.history_deals_get(frm, to) or []
    out = []
    for d in rows:
        # entry 1 = a deal that closed a position; that is what carries the result
        if getattr(d, "entry", None) != 1:
            continue
        out.append({
            "ticket": d.ticket, "position": d.position_id, "order": d.order,
            "symbol": d.symbol, "volume": d.volume, "price": d.price,
            "type": "buy" if d.type == 0 else "sell",
            "profit": d.profit, "commission": d.commission, "swap": d.swap,
            "fee": getattr(d, "fee", 0), "time": d.time,
            "magic": d.magic, "comment": d.comment,
        })
    out.sort(key=lambda r: r["time"], reverse=True)
    return out[:500]


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
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 20000:
                return None
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return None

    def do_POST(self):
        """The only place in ASTRA where real money can move.

        Nothing here is convenient by design. Two independent gates have to be
        open: this program must have been started with --enable-trading, and the
        caller must know the code printed in this window.
        """
        u = urlparse(self.path)

        if not TRADING_ENABLED:
            return self._send({"error": "trading_disabled",
                               "message": "This bridge is read-only. Close it and run "
                                          "START-LIVE-TRADING.bat if you really mean to trade."}, 403)

        body = self._read_json()
        if body is None:
            return self._send({"error": "bad_body"}, 400)
        if str(body.get("code", "")).strip() != SESSION_CODE:
            log_order("REFUSED wrong session code for %s" % u.path)
            return self._send({"error": "bad_code",
                               "message": "Wrong session code. Read the six digits in the bridge window."}, 403)

        if u.path == "/order":
            return self._order(body)
        if u.path == "/close":
            return self._close(body)
        return self._send({"error": "not_found"}, 404)

    def _order(self, b):
        sym = str(b.get("symbol", "")).strip()
        side = str(b.get("side", "")).lower()
        if not SAFE.match(sym):
            return self._send({"error": "bad_symbol"}, 400)
        if side not in ("buy", "sell"):
            return self._send({"error": "bad_side"}, 400)
        try:
            lots = float(b.get("lots", 0))
            sl = float(b.get("sl", 0))
            tp = float(b.get("tp", 0) or 0)
        except (TypeError, ValueError):
            return self._send({"error": "bad_numbers"}, 400)

        if not (lots > 0):
            return self._send({"error": "bad_lots"}, 400)
        # A stop is not optional. Not here, not ever.
        if not (sl > 0):
            return self._send({"error": "stop_required",
                               "message": "An order without a stop-loss is refused by the bridge."}, 400)
        if not ensure_selected(sym):
            return self._send({"error": "symbol_not_found"}, 404)

        with _lock:
            info = mt5.symbol_info(sym)
            tick = mt5.symbol_info_tick(sym)
        if info is None or tick is None:
            return self._send({"error": "no_quote"}, 503)

        # the broker's own limits win over whatever the interface asked for
        step = info.volume_step or 0.01
        lots = round(max(info.volume_min, min(info.volume_max, round(lots / step) * step)), 4)
        price = tick.ask if side == "buy" else tick.bid
        if not (price > 0):
            return self._send({"error": "no_price"}, 503)
        if (side == "buy" and sl >= price) or (side == "sell" and sl <= price):
            return self._send({"error": "stop_wrong_side",
                               "message": "The stop is on the wrong side of the price."}, 400)

        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": sym,
            "volume": lots,
            "type": mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL,
            "price": price,
            "sl": sl,
            "deviation": int(b.get("deviation", 20)),
            "magic": MAGIC,
            "comment": str(b.get("comment", "ASTRA"))[:31],
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        if tp > 0:
            req["tp"] = tp

        log_order("SEND %s %s %s lots sl=%s tp=%s" % (side, sym, lots, sl, tp))
        with _lock:
            r = mt5.order_send(req)
        if r is None:
            log_order("FAILED no response: %s" % (mt5.last_error(),))
            return self._send({"error": "send_failed", "message": str(mt5.last_error())}, 502)

        ok = r.retcode == mt5.TRADE_RETCODE_DONE
        log_order("RESULT %s retcode=%s ticket=%s price=%s" % (
            "OK" if ok else "REJECTED", r.retcode, getattr(r, "order", None), getattr(r, "price", None)))
        return self._send({
            "ok": ok, "retcode": r.retcode, "comment": r.comment,
            "ticket": getattr(r, "order", None), "deal": getattr(r, "deal", None),
            "price": getattr(r, "price", None), "volume": getattr(r, "volume", None),
        }, 200 if ok else 502)

    def _close(self, b):
        try:
            ticket = int(b.get("ticket", 0))
        except (TypeError, ValueError):
            return self._send({"error": "bad_ticket"}, 400)
        with _lock:
            poss = mt5.positions_get(ticket=ticket)
        if not poss:
            return self._send({"error": "not_found", "message": "No open position with that ticket."}, 404)
        pos = poss[0]
        with _lock:
            tick = mt5.symbol_info_tick(pos.symbol)
        if tick is None:
            return self._send({"error": "no_quote"}, 503)

        closing_buy = pos.type == mt5.POSITION_TYPE_SELL
        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": mt5.ORDER_TYPE_BUY if closing_buy else mt5.ORDER_TYPE_SELL,
            "position": ticket,
            "price": tick.ask if closing_buy else tick.bid,
            "deviation": 20,
            "magic": MAGIC,
            "comment": "ASTRA close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        log_order("CLOSE ticket=%s %s %s" % (ticket, pos.symbol, pos.volume))
        with _lock:
            r = mt5.order_send(req)
        if r is None:
            return self._send({"error": "send_failed", "message": str(mt5.last_error())}, 502)
        ok = r.retcode == mt5.TRADE_RETCODE_DONE
        log_order("CLOSE RESULT %s retcode=%s" % ("OK" if ok else "REJECTED", r.retcode))
        return self._send({"ok": ok, "retcode": r.retcode, "comment": r.comment}, 200 if ok else 502)

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
                    "trading": TRADING_ENABLED,
                    "magic": MAGIC,
                })

            if u.path == "/specs":
                # contract sizes and lot limits — what the broker will actually accept
                names = [s for s in (q.get("symbols", [""])[0]).split(",") if s and SAFE.match(s)][:60]
                out = {}
                for s in names:
                    if not ensure_selected(s):
                        continue
                    with _lock:
                        i = mt5.symbol_info(s)
                    if i is None:
                        continue
                    out[s] = {
                        "volumeMin": i.volume_min, "volumeMax": i.volume_max, "volumeStep": i.volume_step,
                        "contractSize": i.trade_contract_size,
                        "tickSize": i.trade_tick_size, "tickValue": i.trade_tick_value,
                        "digits": i.digits, "stopsLevel": i.trade_stops_level,
                        "currency": i.currency_profit,
                    }
                acc = mt5.account_info()
                return self._send({"specs": out,
                                   "account": {"login": getattr(acc, "login", None),
                                               "balance": getattr(acc, "balance", None),
                                               "equity": getattr(acc, "equity", None),
                                               "currency": getattr(acc, "currency", ""),
                                               "leverage": getattr(acc, "leverage", None),
                                               "server": getattr(acc, "server", "")}})

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

            if u.path == "/deals":
                days = int(q.get("days", ["30"])[0] or 30)
                return self._send({"deals": deals(days)})

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
    global TRADING_ENABLED, SESSION_CODE
    if "--enable-trading" in sys.argv:
        import random
        TRADING_ENABLED = True
        SESSION_CODE = "%06d" % random.randint(0, 999999)

    connect()
    names = all_symbols()
    print("%d symbols available. Bridge listening on http://127.0.0.1:%d" % (len(names), PORT))

    if TRADING_ENABLED:
        acc = mt5.account_info()
        print("")
        print("=" * 64)
        print("  REAL TRADING IS ENABLED ON THIS BRIDGE")
        print("  Account %s   %s   balance %s %s" % (
            getattr(acc, "login", "?"), getattr(acc, "server", "?"),
            getattr(acc, "balance", "?"), getattr(acc, "currency", "")))
        print("")
        print("  Session code:   %s" % SESSION_CODE)
        print("")
        print("  Type that code into ASTRA once, under Bots -> Live Trading.")
        print("  It is new every time this window is opened.")
        print("  CLOSING THIS WINDOW STOPS ALL LIVE TRADING IMMEDIATELY.")
        print("=" * 64)
        print("")
        log_order("BRIDGE STARTED with trading enabled, account %s" % getattr(acc, "login", "?"))
    else:
        print("Read-only: this bridge cannot place an order.")

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
