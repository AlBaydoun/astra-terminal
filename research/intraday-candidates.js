/* Fixed experiments from intraday-plan.md. Pure signals; no storage or orders. */
const IntradayCandidates = {
  warmup: 150,
  prepare(bars){
    const closes=bars.map(b=>b.close);
    return {bars, ema20:IND.ema(closes,20), ema100:IND.ema(closes,100),
      atr:IND.atr(bars,14), bb:IND.bb(closes,20,2), adx:IND.adx(bars,14).adx};
  },
  signal(id,ctx,i){
    if(i<this.warmup) return null;
    const {bars,ema20,ema100,atr,bb,adx}=ctx, j=i-1, p=i-2;
    const now=bars[i], hour=new Date(now.rawTime*1000).getUTCHours();
    if(hour<11 || hour>17 || !(atr[j]>0)) return null;
    let dir=0, target=null;
    if(id==='pullback'){
      if(ema20[j]>ema100[j] && ema100[j]>ema100[j-4] && bars[p].close<=ema20[p] && bars[j].close>ema20[j]) dir=1;
      if(ema20[j]<ema100[j] && ema100[j]<ema100[j-4] && bars[p].close>=ema20[p] && bars[j].close<ema20[j]) dir=-1;
    } else if(id==='recovery'){
      if(!(adx[j]!=null && adx[j]<20)) return null;
      if(bars[p].close<bb.lo[p] && bars[j].close>bb.lo[j]) dir=1;
      if(bars[p].close>bb.up[p] && bars[j].close<bb.up[j]) dir=-1;
      target=bb.mid[j];
      if(!dir || (target-now.open)*dir<atr[j]) return null;
    } else if(id==='session'){
      const day=Math.floor(now.rawTime/86400), start=day*86400+10*3600;
      const range=bars.slice(Math.max(0,i-40),i).filter(b=>b.rawTime>=start && b.rawTime<start+3600);
      if(range.length!==4 || range.some((b,k)=>b.rawTime!==start+k*900)) return null;
      const hi=Math.max(...range.map(b=>b.high)), lo=Math.min(...range.map(b=>b.low));
      if(bars[p].close<=hi && bars[j].close>hi) dir=1;
      if(bars[p].close>=lo && bars[j].close<lo) dir=-1;
    } else throw Error('Unknown candidate '+id);
    if(!dir) return null;
    const entry=now.open, sl=entry-dir*2*atr[j], tp=target ?? entry+dir*4*atr[j];
    if(!(sl>0 && tp>0)) return null;
    return {dir,entry,sl,tp,tf:'15m',score:100,model:this.list.find(c=>c.id===id).name,
      reasons:['Fixed '+id+' rule on completed M15 bars'],factors:{}};
  },
  list:[{id:'pullback',name:'Trend pullback M15'}, {id:'recovery',name:'Range recovery M15'},
    {id:'session',name:'Session breakout M15'}],
};
