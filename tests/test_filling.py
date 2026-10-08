"""Offline contract-policy regression tests. No broker connection."""
import sys
import pathlib
import unittest
from types import SimpleNamespace as NS
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'bridge'))
from filling import market_filling

class FillingTests(unittest.TestCase):
    api = NS(ORDER_FILLING_FOK=0, ORDER_FILLING_IOC=1, ORDER_FILLING_RETURN=2)
    def test_broker_flags_are_not_order_enums(self):
        for flags, expected in [(1,0),(2,1),(3,0)]:
            self.assertEqual(market_filling(self.api,NS(filling_mode=flags,trade_exemode=2)),expected)
    def test_market_never_falls_back_to_return(self):
        for flags in [0,4]:
            with self.assertRaises(ValueError):market_filling(self.api,NS(filling_mode=flags,trade_exemode=2))
    def test_execution_mode_exceptions(self):
        for mode, expected in [(0,0),(1,0),(3,2)]:
            self.assertEqual(market_filling(self.api,NS(filling_mode=0,trade_exemode=mode)),expected)
    def test_unknown_spec_fails_closed(self):
        with self.assertRaises(ValueError):market_filling(self.api,None)

if __name__ == '__main__':unittest.main()
