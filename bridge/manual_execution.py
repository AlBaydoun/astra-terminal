"""Manual ticket valuation and final checks. Injected MT5 API makes tests non-trading."""
import math
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone


class ManualExecution:
    def __init__(self, api, magic):
        self.api, self.magic = api, magic
        self.previews = {}
        self.ticks = {}
        self.uncertain = False
        self.lock = threading.Lock()

    @staticmethod
    def number(value, label, positive=True):
        try:
            n = float(value)
        except (TypeError, ValueError):
            raise ValueError(label + ' is required')
        if not math.isfinite(n) or (positive and n <= 0):
            raise ValueError(label + ' must be a finite positive number')
        return n

    def evaluate(self, body):
        m = self.api
        sym, side = str(body.get('symbol', '')), body.get('side')
        if side not in ('buy', 'sell'):
            raise ValueError('Choose Buy or Sell')
        account, terminal = m.account_info(), m.terminal_info()
        if account is None or terminal is None or not terminal.connected:
            raise ValueError('MetaTrader is not connected')
        equity = self.number(account.equity, 'Account equity')
        free = self.number(account.margin_free, 'Free margin', False)
        spec, tick = m.symbol_info(sym), m.symbol_info_tick(sym)
        if spec is None or tick is None:
            raise ValueError('The broker cannot quote this instrument')
        # This broker encodes its wall clock in tick epochs. Observe a newly arriving
        # tick instead of treating a three-hour clock offset as fresh (or stale) data.
        stamp = getattr(tick, 'time_msc', tick.time * 1000)
        seen = self.ticks.get(sym)
        if seen is None:
            self.ticks[sym] = (stamp, None)
        elif stamp > seen[0]:
            self.ticks[sym] = (stamp, time.time())
        elif stamp < seen[0]:
            self.ticks[sym] = (stamp, None)
        observed = self.ticks[sym][1]
        if observed is None or time.time()-observed >= 180:
            raise ValueError('Waiting for a new broker tick. Refresh the preview when the market is moving')
        if not spec.visible and not m.symbol_select(sym, True):
            raise ValueError('The instrument cannot be selected in MetaTrader')
        if spec.trade_mode != m.SYMBOL_TRADE_MODE_FULL:
            raise ValueError('The broker has restricted trading in this instrument')
        bid, ask = self.number(tick.bid, 'Bid'), self.number(tick.ask, 'Ask')
        if ask < bid:
            raise ValueError('The broker spread is invalid')
        point = self.number(spec.point, 'Price point')
        quantum = self.number(spec.trade_tick_size, 'Price step')
        sl = round(self.number(body.get('sl'), 'Stop-loss') / quantum) * quantum
        tp_input = self.number(body.get('tp', 0), 'Take-profit', False)
        if tp_input < 0:
            raise ValueError('Take-profit cannot be negative')
        tp = round(tp_input / quantum) * quantum if tp_input else 0
        if sl <= 0 or (tp_input > 0 and tp <= 0):
            raise ValueError('A protection price rounds to zero at the broker price step')
        direction = 1 if side == 'buy' else -1
        entry, close_price = (ask, bid) if side == 'buy' else (bid, ask)
        if tp and (tp-entry)*direction <= 0:
            raise ValueError('Take-profit must be beyond the entry on the profit side')
        distance = max(spec.trade_stops_level * point, quantum)
        if (close_price-sl)*direction < distance-quantum*1e-6:
            raise ValueError('Move the stop beyond the broker minimum distance on the loss side')
        if tp and (tp-close_price)*direction < distance-quantum*1e-6:
            raise ValueError('Move the target beyond the broker minimum distance on the profit side')
        caps = {}
        for k in ('riskPct','maxLots','maxOpen','maxDailyLossPct','maxTotalLossPct','maxNotionalPct','maxCorrelated'):
            caps[k] = self.number(body.get(k), k)
        caps['maxPerSymbol'] = self.number(body.get('maxPerSymbol',1), 'Positions per pair')
        if any(caps[k] > 100 for k in ('riskPct','maxDailyLossPct','maxTotalLossPct')):
            raise ValueError('Risk and loss percentages cannot exceed 100%')
        if any(caps[k] != int(caps[k]) for k in ('maxOpen','maxCorrelated','maxPerSymbol')):
            raise ValueError('Position limits must be whole numbers')
        positions, pending = m.positions_get(), m.orders_get()
        if positions is None or pending is None:
            raise ValueError('Cannot read all broker positions and waiting orders')
        # Pending broker orders can add exposure while this ticket is being prepared.
        if pending:
            raise ValueError('Broker pending orders exist. Manage them in MT5 before using this live ticket')
        if len(positions) >= caps['maxOpen']:
            raise ValueError('Maximum open positions reached across the real account')
        same = sum(p.symbol == sym for p in positions)
        if same and getattr(account,'margin_mode',None) != getattr(m,'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING',2):
            raise ValueError('A real position already exists in this pair on a netting account; manage it in MT5 first')
        if same >= caps['maxPerSymbol']:
            raise ValueError('A real position already exists at your per-pair limit')
        keys = {spec.currency_base, spec.currency_profit} - {''}
        correlated = 0
        for p in positions:
            ps = m.symbol_info(p.symbol)
            if ps is None:
                raise ValueError('Cannot measure existing correlated exposure')
            if keys.intersection({ps.currency_base, ps.currency_profit} - {''}):
                correlated += 1
        if correlated >= caps['maxCorrelated']:
            raise ValueError('Correlated exposure limit reached (shared contract currencies)')
        now = datetime.now(timezone.utc)
        rows = m.history_deals_get(now.replace(hour=0,minute=0,second=0,microsecond=0), now+timedelta(seconds=1))
        if rows is None:
            raise ValueError('Cannot read today’s full account history')
        day = sum(sum(self.number(getattr(d,k,0),'Broker daily '+k,False) for k in ('profit','commission','swap','fee')) for d in rows if d.type in (0,1))
        floating = sum(min(0,self.number(p.profit,'Floating profit',False)+self.number(getattr(p,'swap',0),'Floating swap',False)) for p in positions)
        base = self.number(body.get('startBalance') or account.balance, 'Linked starting balance')
        if equity <= base*(1-caps['maxTotalLossPct']/100):
            raise ValueError('Total account loss limit reached since linking')
        daily_remaining = max(0,equity*caps['maxDailyLossPct']/100+min(0,day+floating))
        kind = m.ORDER_TYPE_BUY if side == 'buy' else m.ORDER_TYPE_SELL
        # Budget for the requested broker deviation as well as the current spread.
        worst_entry = entry+direction*20*point
        def profit(volume, exit_price):
            value = m.order_calc_profit(kind,sym,volume,worst_entry,exit_price)
            return self.number(value, 'Broker profit calculation', False)
        risk_per_lot = -profit(1,sl)
        if risk_per_lot <= 0:
            raise ValueError('The stop does not define a loss')
        value_per_lot = abs(profit(1,worst_entry*2))
        self.number(value_per_lot, 'Contract position value')
        used_value = 0
        for p in positions:
            pkind = m.ORDER_TYPE_BUY if p.type == 0 else m.ORDER_TYPE_SELL
            used_value += abs(self.number(m.order_calc_profit(pkind,p.symbol,p.volume,p.price_current,p.price_current*2),'Existing position value',False))
        margin_per_lot = self.number(m.order_calc_margin(kind,sym,1,worst_entry), 'Broker margin')
        step, minimum, maximum = [self.number(v,n) for v,n in ((spec.volume_step,'Volume step'),(spec.volume_min,'Minimum lots'),(spec.volume_max,'Maximum lots'))]
        budget = min(equity*caps['riskPct']/100,daily_remaining,max(0,equity-base*(1-caps['maxTotalLossPct']/100)))
        value_budget = max(0,equity*caps['maxNotionalPct']/100-used_value)
        bound = min(budget/risk_per_lot,value_budget/value_per_lot,caps['maxLots'],maximum,max(0,free)*0.95/margin_per_lot)
        requested = self.number(body.get('lots',0) or 0,'Lots',False)
        if requested < 0:
            raise ValueError('Lots cannot be negative')
        if requested:
            bound = min(bound,requested)
        lots = round(math.floor((bound+step*1e-9)/step)*step,8)
        if lots < minimum or lots > maximum or lots <= 0:
            raise ValueError('The smallest broker size exceeds your current risk, position-value or free-margin budget')
        risk = -profit(lots,sl)
        margin = self.number(m.order_calc_margin(kind,sym,lots,worst_entry),'Broker margin')
        if risk > budget+1e-7 or margin > free or lots*value_per_lot > value_budget+1e-7:
            raise ValueError('Account budgets changed; refresh the preview')
        reward = profit(lots,tp) if tp else None
        request = dict(action=m.TRADE_ACTION_DEAL,symbol=sym,volume=lots,type=kind,price=entry,sl=round(sl,spec.digits),
                       deviation=20,magic=self.magic,comment='ASTRA liveManual',type_time=m.ORDER_TIME_GTC,type_filling=m.ORDER_FILLING_IOC)
        if tp:
            request['tp'] = round(tp,spec.digits)
        return dict(ok=True,account=account.login,server=account.server,currency=account.currency,balance=account.balance,equity=equity,
                    freeMargin=free,entry=entry,bid=bid,ask=ask,lots=lots,sl=request['sl'],tp=request.get('tp',0),risk=risk,reward=reward,
                    margin=margin,notional=lots*value_per_lot,dayPnl=day,openCount=len(positions),request=request,
                    volumeMin=minimum,volumeStep=step,volumeMax=maximum,digits=spec.digits,at=time.time())

    def preview(self, body):
        with self.lock:
            result = self.evaluate(body)
            self.previews = {k:v for k,v in self.previews.items() if time.time()-v['at'] < 120}
            token = secrets.token_urlsafe(24)
            self.previews[token] = dict(body=dict(body),result=result,at=time.time(),used=False)
            return {k:v for k,v in result.items() if k != 'request'} | {'previewId':token}

    def send(self, token):
        with self.lock:
            if self.uncertain:
                return dict(ok=False,unknown=True,message='An earlier manual order needs review in MT5 before another submission')
            saved = self.previews.get(token)
            if not saved or saved['used'] or time.time()-saved['at'] > 30:
                raise ValueError('Preview expired or already submitted. Check MT5 before preparing another order')
            saved['used'] = True  # Consume before any broker call; timeouts must never retry a trade.
            current = self.evaluate(saved['body'])
            old = saved['result']
            if current['account'] != old['account'] or current['server'] != old['server']:
                raise ValueError('The connected broker account changed')
            if current['lots'] != old['lots'] or current['risk'] > old['risk']*1.01+0.01 or current['margin'] > old['margin']*1.01+0.01:
                raise ValueError('Price or size changed materially. Review a fresh preview')
            terminal, account = self.api.terminal_info(), self.api.account_info()
            if not terminal.trade_allowed or not account.trade_allowed or not account.trade_expert:
                raise ValueError('Enable algorithmic trading in MetaTrader before submitting')
            checked = self.api.order_check(current['request'])
            if checked is None or checked.retcode != 0:
                raise ValueError('Broker preflight refused: '+str(getattr(checked,'comment','no response')))
            try:
                result = self.api.order_send(current['request'])
            except Exception:
                self.uncertain = True
                return dict(ok=False,unknown=True,message='Broker execution raised an error. Check MT5 positions and history before another entry')
            if result is None:
                self.uncertain = True
                return dict(ok=False,unknown=True,message='No broker response. Inspect MT5 positions and history; do not retry blindly')
            if result.retcode == getattr(self.api,'TRADE_RETCODE_DONE_PARTIAL',10010):
                self.uncertain = True
            return dict(ok=result.retcode==self.api.TRADE_RETCODE_DONE,retcode=result.retcode,comment=result.comment,
                        ticket=result.order,deal=result.deal,price=result.price,volume=result.volume,
                        partial=result.retcode==getattr(self.api,'TRADE_RETCODE_DONE_PARTIAL',10010))

    def acknowledge(self):
        with self.lock:
            self.uncertain = False
            self.previews.clear()  # Re-review size and price after resolving an uncertain execution.
