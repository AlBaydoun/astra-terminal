"""Read-only integration probe. The adapter explicitly refuses execution APIs."""
import json
import pathlib
import sys
import time
import urllib.request
import MetaTrader5 as mt5

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'bridge'))
from manual_execution import ManualExecution


class ReadOnlyMT5:
    def __getattr__(self,name):
        if name in ('order_send','order_check'):
            raise RuntimeError('Execution is prohibited in this read-only probe')
        return getattr(mt5,name)


if __name__=='__main__':
    health=json.load(urllib.request.urlopen('http://127.0.0.1:8644/health',timeout=5))
    if not mt5.initialize():raise SystemExit('Could not attach to the running MetaTrader terminal')
    try:
        account=mt5.account_info()
        if account is None or account.login!=health['account'] or account.server!=health['server']:
            raise SystemExit('The attached account differs from the running bridge; no check performed')
        sym=next((s for s in health['symbols'] if s.upper().startswith('ETHUSD.')),None)
        if not sym:raise SystemExit('No ETH/USD broker symbol available')
        mt5.symbol_select(sym,True)
        tick=mt5.symbol_info_tick(sym)
        body=dict(symbol=sym,side='buy',sl=tick.bid*.995,tp=tick.ask*1.01,lots=0,riskPct=.5,maxLots=.05,maxOpen=2,maxDailyLossPct=2,maxTotalLossPct=10,maxNotionalPct=100,maxCorrelated=2,startBalance=account.balance)
        desk=ManualExecution(ReadOnlyMT5(),20260902)
        for attempt in range(10):
            try:
                result=desk.preview(body)
                print(json.dumps({k:result[k] for k in ('ok','currency','entry','lots','sl','tp','risk','reward','margin','notional','volumeMin','volumeStep','volumeMax')},indent=2))
                print('READ-ONLY: no order-check or order-send API was available to the calculation.')
                break
            except ValueError as error:
                if 'new broker tick' not in str(error) or attempt==9:raise
                time.sleep(.75)
    finally:
        mt5.shutdown()
