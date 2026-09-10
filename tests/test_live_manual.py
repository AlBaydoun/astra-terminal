"""No real MetaTrader import or connection. Every API call is a disposable fake."""
import importlib.util
import pathlib
import sys
import time
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

BRIDGE = pathlib.Path(__file__).resolve().parents[1] / 'bridge'
sys.path.insert(0, str(BRIDGE))
from manual_execution import ManualExecution


class FakeMT5:
    SYMBOL_TRADE_MODE_FULL=4
    ORDER_TYPE_BUY=0
    ORDER_TYPE_SELL=1
    TRADE_ACTION_DEAL=1
    ORDER_TIME_GTC=0
    ORDER_FILLING_IOC=1
    TRADE_RETCODE_DONE=10009
    TRADE_RETCODE_DONE_PARTIAL=10010
    TIMEFRAME_M1=1
    TIMEFRAME_M5=5
    TIMEFRAME_M15=15
    TIMEFRAME_H1=60
    TIMEFRAME_H4=240
    TIMEFRAME_D1=1440
    TIMEFRAME_W1=10080

    def __init__(self):
        self.account=NS(login=1,server='Mock',currency='USD',equity=1000,balance=1000,margin_free=1000,trade_allowed=True,trade_expert=True)
        self.terminal=NS(connected=True,trade_allowed=True)
        self.spec=NS(visible=True,trade_mode=4,point=.01,trade_tick_size=.01,trade_stops_level=1,currency_base='ETH',currency_profit='USD',volume_min=.01,volume_step=.01,volume_max=100,digits=2)
        self.tick=NS(time=int(time.time())+10800,time_msc=(int(time.time())+10800)*1000,bid=100,ask=100.1)
        self.positions=[];self.orders=[];self.deals=[];self.sent=[];self.check_code=0;self.no_response=False;self.profit_missing=False
    def account_info(self):return self.account
    def terminal_info(self):return self.terminal
    def symbol_info(self,s):return self.spec
    def symbol_info_tick(self,s):return self.tick
    def symbol_select(self,*a):return True
    def positions_get(self):return self.positions
    def orders_get(self):return self.orders
    def history_deals_get(self,*a):return self.deals
    def order_calc_profit(self,side,sym,volume,entry,exit):return None if self.profit_missing else (exit-entry)*volume*10*(1 if side==0 else -1)
    def order_calc_margin(self,side,sym,volume,entry):return volume*100
    def order_check(self,r):return NS(retcode=self.check_code,comment='mock check')
    def order_send(self,r):
        self.sent.append(r.copy())
        return None if self.no_response else NS(retcode=10009,comment='mock filled',order=123,deal=124,price=r['price'],volume=r['volume'])


class ManualTests(unittest.TestCase):
    def setUp(self):
        self.api=FakeMT5();self.desk=ManualExecution(self.api,20260902)
        self.desk.ticks['ETHUSD.s']=(self.api.tick.time_msc,time.time())
        self.body=dict(symbol='ETHUSD.s',side='buy',sl=99,tp=103,lots=0,riskPct=1,maxLots=10,maxOpen=3,maxDailyLossPct=2,maxTotalLossPct=10,maxNotionalPct=100,maxCorrelated=2,startBalance=1000)
    def preview(self):return self.desk.preview(self.body)
    def test_broker_currency_sizing_and_levels(self):
        p=self.preview();self.assertEqual(p['lots'],.76);self.assertLessEqual(p['risk'],10);self.assertEqual(p['sl'],99);self.assertEqual(p['tp'],103);self.assertFalse(self.api.sent)
    def test_sell_uses_bid_and_direction(self):
        self.body.update(side='sell',sl=101,tp=97);p=self.preview();self.assertEqual(p['entry'],100);self.assertGreater(p['reward'],0)
    def test_close_stop_cannot_exceed_notional(self):
        self.body['sl']=99.98;p=self.preview();self.assertLessEqual(p['notional'],1000)
    def test_free_margin_limits_size(self):
        self.api.account.margin_free=5;p=self.preview();self.assertEqual(p['lots'],.04);self.assertLessEqual(p['margin'],5)
    def test_missing_currency_conversion_fails(self):
        self.api.profit_missing=True
        with self.assertRaises(ValueError):self.preview()
    def test_bad_numbers_fail_closed(self):
        for key in ('sl','lots','maxLots','riskPct','maxNotionalPct','maxOpen'):
            original=self.body[key]
            for bad in ('NaN','Infinity',-1):
                self.body[key]=bad
                with self.assertRaises(ValueError):self.preview()
            self.body[key]=original
    def test_step_and_maximum_respected(self):
        self.api.spec.volume_step=.03;self.api.spec.volume_max=.2;p=self.preview();self.assertEqual(p['lots'],.18)
    def test_minimum_never_rounded_up(self):
        self.body['lots']=.001
        with self.assertRaises(ValueError):self.preview()
    def test_wrong_side_stop_and_target(self):
        for levels in ({'sl':101},{'tp':98}):
            with self.subTest(levels=levels):
                prior=self.body.copy();self.body.update(levels)
                with self.assertRaises(ValueError):self.preview()
                self.body=prior
    def test_rounded_zero_protection_and_target_inside_spread_rejected(self):
        self.body['sl']=.001
        with self.assertRaises(ValueError):self.preview()
        self.body.update(sl=99,tp=100.05)
        with self.assertRaises(ValueError):self.preview()
    def position(self,sym='XAUUSD.s',profit=0):return NS(symbol=sym,profit=profit,swap=0,type=0,volume=.1,price_current=100)
    def test_all_account_positions_count(self):
        self.api.positions=[self.position()]*3
        with self.assertRaisesRegex(ValueError,'Maximum open'):self.preview()
    def test_same_pair_prevents_netting_or_stop_overwrite(self):
        self.api.positions=[self.position('ETHUSD.s')]
        with self.assertRaisesRegex(ValueError,'already exists'):self.preview()
    def test_multiple_same_pair_only_when_explicitly_allowed_on_hedging_account(self):
        self.api.positions=[self.position('ETHUSD.s')];self.body['maxPerSymbol']=2;self.api.account.margin_mode=2
        self.preview()
        self.api.account.margin_mode=0
        with self.assertRaisesRegex(ValueError,'netting'):self.preview()
    def test_correlated_exposure(self):
        self.api.positions=[self.position()]*2
        with self.assertRaisesRegex(ValueError,'Correlated'):self.preview()
    def test_account_value_budget_reserves_existing_exposure(self):
        self.api.positions=[self.position()];self.api.positions[0].volume=.8
        p=self.preview();self.assertLessEqual(p['notional'],200)
    def test_daily_loss_includes_other_bots_and_floating_losses(self):
        self.api.deals=[NS(type=1,profit=-18,commission=-1,swap=0,fee=0)]
        self.api.positions=[self.position(profit=-1)]
        with self.assertRaises(ValueError):self.preview()
    def test_missing_positions_or_history_not_empty(self):
        for key in ('positions','deals','orders'):
            setattr(self.api,key,None)
            with self.assertRaises(ValueError):self.preview()
            setattr(self.api,key,[])
    def test_nan_broker_losses_cannot_bypass_limits(self):
        self.api.deals=[NS(type=1,profit=float('nan'),commission=0,swap=0,fee=0)]
        with self.assertRaises(ValueError):self.preview()
    def test_pending_broker_orders_block_hidden_exposure(self):
        self.api.orders=[NS()]
        with self.assertRaises(ValueError):self.preview()
    def test_total_loss_cap(self):
        self.api.account.equity=899
        with self.assertRaisesRegex(ValueError,'Total account'):self.preview()
    def test_clock_offset_does_not_turn_old_ticks_live(self):
        self.desk.ticks={}
        with self.assertRaisesRegex(ValueError,'new broker tick'):self.preview()
        self.api.tick.time_msc+=1;self.preview()
        self.desk.ticks['ETHUSD.s']=(self.api.tick.time_msc,time.time()-181)
        with self.assertRaisesRegex(ValueError,'new broker tick'):self.preview()
    def test_one_use_preview_and_broker_levels(self):
        p=self.preview();r=self.desk.send(p['previewId']);self.assertTrue(r['ok']);self.assertEqual(self.api.sent[0]['sl'],99);self.assertEqual(self.api.sent[0]['tp'],103)
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.assertEqual(len(self.api.sent),1)
    def test_expired_preview(self):
        p=self.preview();self.desk.previews[p['previewId']]['at']-=31
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.assertFalse(self.api.sent)
    def test_account_switch_and_changed_size_rechecked(self):
        p=self.preview();self.api.account.login=2
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.api.account.login=1;p=self.preview();self.api.account.margin_free=5
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.assertFalse(self.api.sent)
    def test_mt5_order_check_refusal_never_sends(self):
        p=self.preview();self.api.check_code=10019
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.assertFalse(self.api.sent)
    def test_readonly_terminal_cannot_send(self):
        p=self.preview();self.api.terminal.trade_allowed=False
        with self.assertRaises(ValueError):self.desk.send(p['previewId'])
        self.assertFalse(self.api.sent)
    def test_uncertain_response_is_not_retried(self):
        p=self.preview();self.api.no_response=True;self.assertTrue(self.desk.send(p['previewId'])['unknown'])
        self.assertTrue(self.desk.send(p['previewId'])['unknown'])
        self.assertEqual(len(self.api.sent),1)
    def test_uncertainty_blocks_other_windows_until_explicit_review(self):
        first=self.preview();second=self.preview();self.api.no_response=True
        self.desk.send(first['previewId']);self.assertTrue(self.desk.send(second['previewId'])['unknown']);self.assertEqual(len(self.api.sent),1)
        self.desk.acknowledge()
        with self.assertRaises(ValueError):self.desk.send(second['previewId'])
    def test_bridge_still_requires_live_flag_and_session_code(self):
        with patch.dict(sys.modules,{'MetaTrader5':self.api}):
            spec=importlib.util.spec_from_file_location('astra_mock',BRIDGE/'astra_mt5.py');bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
        handler=bridge.Handler.__new__(bridge.Handler);handler.path='/manual-order';handler._read_json=lambda:{'code':'123456','previewId':'not-used'}
        responses=[];handler._send=lambda obj,status=200:responses.append((obj,status));bridge.log_order=lambda *a:None
        handler.do_POST();self.assertEqual(responses[-1][1],403)
        bridge.TRADING_ENABLED=True;bridge.SESSION_CODE='654321';handler.do_POST();self.assertEqual(responses[-1][1],403);self.assertFalse(self.api.sent)


if __name__=='__main__':unittest.main()
