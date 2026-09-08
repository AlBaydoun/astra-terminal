/* Disposable study only: no saved ledgers, automatic bots or live-order scripts. */
const IntradayStudy = {
  checkCausality(data){
    let checked=0;
    for(const candidate of IntradayCandidates.list){
      let examples=0;
      for(const market of data.markets){
        const bars=market.candles.slice(0,-1).map(b=>({rawTime:b[0],time:b[0],open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]}));
        const complete=IntradayCandidates.prepare(bars);
        for(let i=IntradayCandidates.warmup;i<bars.length && examples<3;i++){
          const signal=IntradayCandidates.signal(candidate.id,complete,i);
          if(!signal) continue;
          const prefix=bars.slice(0,i).concat([{...bars[i],high:bars[i].open,low:bars[i].open,close:bars[i].open,volume:0}]);
          const known=IntradayCandidates.signal(candidate.id,IntradayCandidates.prepare(prefix),i);
          if(JSON.stringify(signal)!==JSON.stringify(known)) throw Error(candidate.name+': signal used future candle information');
          examples++; checked++;
        }
        if(examples===3) break;
      }
      if(examples<3) throw Error(candidate.name+': insufficient non-empty signals for causality verification');
    }
    return checked;
  },
  half(candidate,market,bars,half,oldSpread){
    const L=BotEngine.blank('study'), cfg={tf:'15m',maxOpen:1,maxPerSymbol:1,timeLimitBars:12,noLearn:true};
    BotEngine.replays.add(L); Feed.specs[market.symbol]=market.spec;
    if(!market.spec || !market.quote || !(market.quote.last>0) || !(market.quote.ask>=market.quote.bid))
      throw Error(market.symbol+': missing specifications or spread');
    const spreadPct=Math.max(BROKER.costsFor(market.symbol).spreadPct,oldSpread,
      (market.quote.ask-market.quote.bid)/market.quote.last*100);
    const ctx=IntradayCandidates.prepare(bars), starts=new Map(), rejected={}, overnight=new Set();
    let lastEntryDay=null, peak=L.startEquity, maxDD=0, signals=0;
    const mark=eq=>{ if(!Number.isFinite(eq)) throw Error('Invalid equity'); peak=Math.max(peak,eq); maxDD=Math.max(maxDD,(peak-eq)/peak*100); };
    const liquidation=price=>L.equity+L.open.reduce((sum,p)=>{
      const fill=price(p)*(1-p.dir*BotEngine.RISK.slippagePct/100);
      return sum+(fill-p.entry)*p.dir*p.qty-fill*p.qty*BotEngine.commissionFrac(p.sym,BotEngine.RISK);
    },0);
    if(bars.length<=IntradayCandidates.warmup) throw Error('Insufficient history');
    for(let i=IntradayCandidates.warmup;i<bars.length;i++){
      const bar=bars[i], day=Math.floor(bar.rawTime/86400); cfg.nowTs=bar.rawTime*1000;
      // Opening information is available before entry; later extremes are not.
      mark(liquidation(()=>bar.open));
      for(const p of L.open.slice()){
        if(Math.floor(p.entryTime/86400000)!==day) overnight.add(p.id);
        if((bar.open-p.sl)*p.dir<=0) BotEngine.close(L,cfg,p,bar.open,'gap through stop');
      }
      const sig=IntradayCandidates.signal(candidate.id,ctx,i);
      if(sig && lastEntryDay!==day){
        signals++; sig.sym=market.symbol;
        const quote={price:bar.open,spread:bar.open*spreadPct/100,ageSec:0};
        const gate=BotEngine.check(L,cfg,sig,quote);
        if(gate.ok){
          const p=BotEngine.open(L,cfg,sig,quote,gate);
          if(p){starts.set(p.id,{feeIn:p.feeIn,risk:p.riskCash});lastEntryDay=day;}
        } else rejected[gate.reason]=(rejected[gate.reason]||0)+1;
      }
      // Charge the adverse excursion before allowing any profitable exit. A
      // normal stop limits it at the stop; an opening gap already used the open.
      mark(liquidation(p=>p.dir>0 ? Math.max(p.sl,Math.min(bar.open,bar.low)) : Math.min(p.sl,Math.max(bar.open,bar.high))));
      for(const p of L.open.slice()) BotEngine.step(L,cfg,p,bar,{price:bar.close});
      if(bar.rawTime%86400>=20*3600+45*60){
        for(const p of L.open.slice()) BotEngine.close(L,cfg,p,bar.close,'session end');
      }
      mark(liquidation(()=>bar.close));
    }
    const last=bars[bars.length-1];
    for(const p of L.open.slice()) BotEngine.close(L,cfg,p,last.close,'study end');
    mark(L.equity);
    const trades=L.closed.map(t=>{
      const opening=starts.get(t.id); if(!opening) throw Error('Entry record missing');
      const pnl=t.pnl-opening.feeIn;
      return {...t,pnl,r:pnl/opening.risk};
    });
    const wins=trades.filter(t=>t.pnl>0), losses=trades.filter(t=>t.pnl<0);
    const grossWin=wins.reduce((n,t)=>n+t.pnl,0), grossLoss=-losses.reduce((n,t)=>n+t.pnl,0);
    const sum=trades.reduce((n,t)=>n+t.pnl,0), net=L.equity-L.startEquity;
    if(Math.abs(sum-net)>0.02) throw Error(market.symbol+': trades do not reconcile to cash');
    return {candidate:candidate.name,id:candidate.id,symbol:market.symbol,half,bars:bars.length,
      from:new Date(bars[IntradayCandidates.warmup].rawTime*1000).toISOString(),to:new Date(last.rawTime*1000).toISOString(),
      timestampBasis:'broker server clock labels, not UTC',trades:trades.length,
      winRate:trades.length?wins.length/trades.length*100:0,
      profitFactor:grossLoss?grossWin/grossLoss:grossWin?'Infinity':0,
      averageR:trades.length?trades.reduce((n,t)=>n+t.r,0)/trades.length:0,maxDrawdownPct:maxDD,netPnl:net,
      spreadPct,commissionPct:BotEngine.commissionFrac(market.symbol,BotEngine.RISK)*100,
      slippagePct:BotEngine.RISK.slippagePct,overnightTrades:overnight.size,cashReconciliationError:sum-net,
      signals,rejected,tradeRecords:trades};
  },
  async run(data,previous,progress=()=>{}){
    if(data.accountCurrency!=='USD') throw Error('Expected a USD account snapshot');
    const causalityChecks=this.checkCausality(data);
    const results=[];
    for(const candidate of IntradayCandidates.list) for(const market of data.markets){
      const bars=market.candles.slice(0,-1).map(b=>({rawTime:b[0],time:b[0],open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]}));
      if(bars.some((b,i)=>![b.rawTime,b.open,b.high,b.low,b.close].every(Number.isFinite) || b.low<=0 ||
        b.high<Math.max(b.open,b.close) || b.low>Math.min(b.open,b.close) || (i && b.rawTime<=bars[i-1].rawTime))) throw Error(market.symbol+': invalid history');
      const old=previous.results.filter(r=>r.symbol===market.symbol);
      if(!old.length) throw Error('Previous cost baseline missing for '+market.symbol);
      const oldSpread=Math.max(...old.map(r=>r.spreadPct)), cut=Math.floor(bars.length/2);
      for(const [half,part] of [['first',bars.slice(0,cut)],['second',bars.slice(cut)]]){
        progress(candidate.name+' · '+market.symbol+' · '+half); await new Promise(resolve=>setTimeout(resolve,0));
        results.push(this.half(candidate,market,part,half,oldSpread));
      }
    }
    const verdicts=IntradayCandidates.list.map(c=>{
      const passing=data.markets.map(m=>m.symbol).filter(sym=>{
        const rows=results.filter(r=>r.id===c.id && r.symbol===sym);
        return rows.length===2 && rows.every(r=>r.netPnl>0 && Number(r.profitFactor)>1);
      });
      const withoutOvernight=passing.filter(sym=>results.filter(r=>r.id===c.id && r.symbol===sym).every(r=>!r.overnightTrades));
      const sufficient=withoutOvernight.filter(sym=>results.filter(r=>r.id===c.id && r.symbol===sym).reduce((n,r)=>n+r.trades,0)>=100);
      return {id:c.id,name:c.name,positiveBothHalves:passing,positiveWithoutOvernight:withoutOvernight,positiveWith100Trades:sufficient,
        verdict:sufficient.length>=2?'Historical screen passed; fresh forward paper evidence required':'NOT QUALIFIED — failed or insufficient evidence'};
    });
    return {capturedAt:data.capturedAt,evaluatedAt:new Date().toISOString(),timeframe:'15m',causalityChecks,verdicts,results};
  },
};
