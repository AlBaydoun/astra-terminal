/* ASTRA Terminal — the market forecasts, as found by research run 2 (2026-10-15).
   Written by research-tools/predict-publish.cjs; read by js/forecast.js. Nothing here trades.
   status: proven = passed every test; leaning = better than chance but below the bar; a group not listed has NO forecast. */
const FORECASTS = {
 "found": "2026-10-15",
 "tested": "24 instruments · 5 methods × 2 settings × 3 timeframes, per market group · settings fixed in advance · verdict needs both halves of 2 years",
 "groups": {
  "indices": {
   "tf": "4h",
   "mk": "stretch",
   "p": 2.5,
   "status": "proven",
   "method": "Over-stretched — snaps back",
   "horizon": 6,
   "calls": 833,
   "hit": 58,
   "base": 48.9,
   "z": 5.2,
   "halves": [
    57.3,
    58.6
   ],
   "halvesZ": [
    3.5,
    3.9
   ],
   "avgAtr": 0.23,
   "pf": 1.4,
   "cone": {
    "q25": -0.76,
    "q50": 0.27,
    "q75": 1.32
   },
   "agree": "9 of 9",
   "per": [
    {
     "name": "US100",
     "n": 110,
     "hit": 56.4,
     "base": 48.7,
     "avgAtr": 0.27
    },
    {
     "name": "US30",
     "n": 108,
     "hit": 63,
     "base": 48.6,
     "avgAtr": 0.42
    },
    {
     "name": "US500",
     "n": 102,
     "hit": 54.9,
     "base": 48.7,
     "avgAtr": 0.27
    },
    {
     "name": "DE40",
     "n": 102,
     "hit": 55.9,
     "base": 49,
     "avgAtr": 0.14
    },
    {
     "name": "EU50",
     "n": 85,
     "hit": 56.5,
     "base": 49.3,
     "avgAtr": 0.25
    },
    {
     "name": "FR40",
     "n": 76,
     "hit": 59.2,
     "base": 49.5,
     "avgAtr": 0.18
    },
    {
     "name": "UK100",
     "n": 80,
     "hit": 55,
     "base": 48.7,
     "avgAtr": 0.1
    },
    {
     "name": "AU200",
     "n": 74,
     "hit": 58.1,
     "base": 49.6,
     "avgAtr": 0.24
    },
    {
     "name": "JP225",
     "n": 96,
     "hit": 62.5,
     "base": 48.5,
     "avgAtr": 0.12
    }
   ],
   "period": "2024-12-04 – 2026-10-13"
  },
  "forex": {
   "tf": "4h",
   "mk": "rangefade",
   "p": 20,
   "status": "leaning",
   "method": "Rejection at the edge of a range",
   "horizon": 6,
   "calls": 623,
   "hit": 52.6,
   "base": 47.9,
   "z": 2.4,
   "halves": [
    53.5,
    51.7
   ],
   "halvesZ": [
    1.8,
    1.6
   ],
   "avgAtr": 0.13,
   "pf": 1.2,
   "cone": {
    "q25": -1.04,
    "q50": 0.1,
    "q75": 1.06
   },
   "agree": "6 of 8",
   "per": [
    {
     "name": "EURUSD",
     "n": 64,
     "hit": 57.8,
     "base": 49.3,
     "avgAtr": -0.17
    },
    {
     "name": "GBPUSD",
     "n": 70,
     "hit": 55.7,
     "base": 49.2,
     "avgAtr": 0.31
    },
    {
     "name": "USDJPY",
     "n": 90,
     "hit": 50,
     "base": 46.2,
     "avgAtr": 0.08
    },
    {
     "name": "AUDUSD",
     "n": 89,
     "hit": 50.6,
     "base": 49.7,
     "avgAtr": 0.08
    },
    {
     "name": "USDCAD",
     "n": 60,
     "hit": 46.7,
     "base": 48.1,
     "avgAtr": -0.3
    },
    {
     "name": "USDCHF",
     "n": 72,
     "hit": 56.9,
     "base": 48.3,
     "avgAtr": 0.24
    },
    {
     "name": "EURJPY",
     "n": 85,
     "hit": 55.3,
     "base": 46.9,
     "avgAtr": 0.41
    },
    {
     "name": "GBPJPY",
     "n": 93,
     "hit": 49.5,
     "base": 46.5,
     "avgAtr": 0.2
    }
   ],
   "period": "2024-12-05 – 2026-10-14"
  },
  "gold": {
   "tf": "1d",
   "mk": "momentum",
   "p": 72,
   "status": "leaning",
   "method": "Trend continuation (momentum)",
   "horizon": 5,
   "calls": 84,
   "hit": 65.5,
   "base": 52.2,
   "z": 2.4,
   "halves": [
    75,
    52.8
   ],
   "halvesZ": [
    2.4,
    0.9
   ],
   "avgAtr": 0.64,
   "pf": 2.47,
   "cone": {
    "q25": -0.58,
    "q50": 0.78,
    "q75": 1.92
   },
   "agree": "2 of 2",
   "per": [
    {
     "name": "XAUUSD",
     "n": 42,
     "hit": 66.7,
     "base": 52.9,
     "avgAtr": 0.6
    },
    {
     "name": "XAGUSD",
     "n": 42,
     "hit": 64.3,
     "base": 51.5,
     "avgAtr": 0.68
    }
   ],
   "period": "2025-08-22 – 2026-09-23"
  }
 },
 "none": {
  "energy": "None of the 30 tested methods beat chance on oil (WTI, Brent).",
  "crypto": "None of the 30 tested methods beat chance on crypto after its spread (BTC, ETH, SOL)."
 }
};
