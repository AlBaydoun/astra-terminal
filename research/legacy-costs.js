/* ARCHIVE ONLY. Never load this script in index.html.
   Preserve pre-2026-09-09 experiments so correcting the live Pro profile does
   not silently change their saved results. These were assumptions, not the
   verified current Pro tariff. New terminal calculations use broker.js. */
BROKER.account='pro';
for(const [group,commissionPct] of Object.entries({metal:0.003,energy:0.003,index:0,fx:0.003,crypto:0,other:0.002}))
  BROKER.COSTS.pro[group].commissionPct=commissionPct;
BotEngine.RISK.commissionPct=0.003;
