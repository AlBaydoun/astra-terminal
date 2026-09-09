/* Manual ticket fitting and explicit profit-currency conversion. No broker writes.
   Keep physical units/lots; save entry FX estimates in the existing meta object.
   MT5 CFD/FX profit is contract units × price change, then currency conversion.
   AIRF's tickValue is not its account-currency value per contract: do not use it
   as an FX rate. Conversion uses fresh broker bid/ask, never a public fallback. */
const ManualTicket = {
  path(from,to){
    if(from===to)return [];
    const syms=[...(Feed.bridge?.symbols||[])];
    const leg=(a,b)=>{
      const direct=syms.find(s=>Feed.baseOf(s)===a+b);if(direct)return {sym:direct,inverse:false};
      const inverse=syms.find(s=>Feed.baseOf(s)===b+a);return inverse?{sym:inverse,inverse:true}:null;
    };
    const direct=leg(from,to);if(direct)return [direct];
    const a=leg(from,'USD'),b=leg('USD',to);return a&&b?[a,b]:null;
  },
  async loadFx(sym){
    const spec=Feed.specFor(sym),from=spec?.currency,to=Feed.account?.currency;
    if(!from||!to||from===to)return;
    const path=this.path(from,to);if(path?.length)await Feed.quotes(path.map(x=>x.sym));
  },
  fx(sym){
    const spec=Feed.specFor(sym),from=spec?.currency,to=Feed.account?.currency;
    if(!spec)return {profit:1,loss:1};
    if(!from||!to){
      const ratio=spec.tickValue/spec.tickSize/spec.contractSize;
      return Math.abs(ratio-1)<1e-6?{profit:1,loss:1}:null;
    }
    if(from===to)return {profit:1,loss:1,currency:to,from};
    const path=this.path(from,to);if(!path)return null;
    let profit=1,loss=1;
    for(const leg of path){
      const q=STORE.tickers.get(leg.sym);
      if(!Feed.isLive(leg.sym)||Feed.srcOf[leg.sym]!=='bridge'||!(q?.bid>0&&q.ask>=q.bid))return null;
      profit*=leg.inverse?1/q.ask:q.bid;loss*=leg.inverse?1/q.bid:q.ask;
    }
    return {profit,loss,currency:to,from,at:Date.now(),via:path.map(x=>x.sym).join(' / ')};
  },
  fit(L,cfg,sig,q){
    const R=BotEngine.rules(cfg),spec=Feed.specFor(sig.sym),fx=this.fx(sig.sym);
    const none=reason=>({ok:false,reason});
    if(!q||!(q.price>0))return none('Waiting for a broker price.');
    if(!fx)return none('Loading a fresh broker currency-conversion quote…');
    let draft={...sig},adjustments=[];
    const auto=cfg.manualAutoFit!==false;
    const spread=q.spread??q.price*0.0002,fill=q.price*(1+sig.dir*R.slippagePct/100)+sig.dir*spread/2;
    const tick=spec?.tickSize||Math.max(fill*1e-8,1e-8);
    const round=(v,up)=>+(Math[up?'ceil':'floor'](v/tick+(up?-1:1)*1e-8)*tick).toPrecision(12);
    if(auto){
      const floor=Math.max(tick,(spec?.stopsLevel||0)*10**-(spec?.digits??8),R.maxSpreadAtrPct>0?spread*100/R.maxSpreadAtrPct:0);
      let dist=Number.isFinite(draft.sl)&&draft.sl>0?Math.abs(q.price-draft.sl):q.price*((cfg.manualFallbackPct||0)||({metal:0.6,energy:1.2,index:0.5,fx:0.3,crypto:1.5}[BROKER.costGroup(sig.sym)]||1))/100;
      const sl=round(q.price-sig.dir*Math.max(dist,floor),sig.dir<0);
      if(sl!==draft.sl){draft.sl=sl;adjustments.push('Stop aligned to the trade side and broker price step');}
      if(draft.tp!=null){
        dist=Math.max(Math.abs(draft.tp-q.price),Math.abs(fill-q.price)+tick,floor);
        const tp=round(q.price+sig.dir*dist,sig.dir>0);
        if(tp!==draft.tp){draft.tp=tp;adjustments.push('Target aligned to the trade side and broker price step');}
      }
      // Fit size to all remaining cash budgets BEFORE asking the strict engine.
      const equity=Math.min(L.equity,BotEngine.equityNow(L));
      const day=R.maxDailyLossPct*L.startEquity/100+Math.min(0,BotEngine.dailyPnl(L,Date.now()));
      const reserved=L.open.reduce((n,p)=>n+BotEngine.remainingRisk(p,R),0);
      const budget=Math.max(0,Math.min(equity*R.riskPct/100,day-reserved));
      const unitLoss=sl=>{
        const exit=sl*(1-sig.dir*R.slippagePct/100);
        return ((fill-exit)*sig.dir+(fill+exit)*BotEngine.commissionFrac(sig.sym,R))*fx.loss;
      };
      const minQty=spec?spec.volumeMin*spec.contractSize:0;
      if(minQty>0&&minQty*unitLoss(draft.sl)>budget){
        const fee=BotEngine.commissionFrac(sig.sym,R);
        const stop=(sig.dir*fill+fill*fee-budget/(minQty*fx.loss))/((sig.dir-fee)*(1-sig.dir*R.slippagePct/100));
        const tightened=round(stop,sig.dir>0);
        if((q.price-tightened)*sig.dir>=floor-1e-9 && tightened>0){draft.sl=tightened;adjustments.push('Stop tightened so the minimum lot fits your risk budget');}
      }
      const loss=unitLoss(draft.sl),free=BotEngine.funds(L,R).free;
      let maxQty=Math.min(budget/loss,free/(fill*fx.loss),spec?spec.volumeMax*spec.contractSize:Infinity);
      if(spec)maxQty=BotEngine.floorLots(maxQty/spec.contractSize,spec.volumeStep)*spec.contractSize;
      if(maxQty>=minQty && maxQty>0){
        let wanted=draft.requestedQty==null?maxQty:draft.requestedQty;
        if(Number.isFinite(wanted)&&wanted>0){
          wanted=Math.min(maxQty,Math.max(minQty,wanted));
          if(spec)wanted=BotEngine.floorLots(wanted/spec.contractSize,spec.volumeStep)*spec.contractSize;
          if(draft.requestedQty!=null&&Math.abs(wanted-draft.requestedQty)>1e-9)adjustments.push('Size adjusted to '+(spec?wanted/spec.contractSize+' lot':wanted+' units')+' within your saved budgets');
          draft.requestedQty=wanted;
        }
      }
    }
    const gate=BotEngine.check(L,cfg,draft,q);
    // A blocked entry still has an estimate; keep it separate from permission.
    const estimate=gate.ok?gate:BotEngine.size(L,R,draft,q,spread);
    return {ok:gate.ok,reason:gate.ok?'':gate.reason,gate:gate.ok?gate:null,estimate:estimate.ok?estimate:null,sig:draft,adjustments};
  },
};
