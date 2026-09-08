/* One fixed rule shared by chart labels, the paper bot and the split study. */
const Confluence = {
  id: 'confluence', name: 'ASTRA Confluence', warmup: 250,
  defaults: {tf:'15m',tfAuto:false,minScore:100,maxOpen:1,maxPerSymbol:1,maxCorrelated:1,
    paused:true,timeLimitBars:12,noLearn:true,risk:{riskPct:0.5,maxNotionalPct:100,maxDailyLossPct:2}},
  inspect(bars, i=bars.length-1, tf='15m'){
    const wait = why => ({dir:0,score:0,failed:[why],checks:[]});
    if(tf!=='15m') return wait('Use the 15-minute timeframe');
    if(i<this.warmup) return wait('Waiting for 250 completed candles');
    const w=bars.slice(i-this.warmup,i), now=bars[i], j=w.length-1, p=j-1;
    if(!now || !Number.isFinite(now.rawTime) || now.rawTime-w[j].rawTime!==900)
      return wait('Wait for a continuous completed 15-minute candle');
    if(w.some(b=>![b.open,b.high,b.low,b.close,b.rawTime].every(Number.isFinite) || b.low<=0 || b.high<Math.max(b.open,b.close) || b.low>Math.min(b.open,b.close)))
      return wait('Candle data is incomplete');
    const c=w.map(b=>b.close), fast=IND.ema(c,20), slow=IND.ema(c,100), atr=IND.atr(w,14)[j];
    const adx=IND.adx(w,14).adx[j], rsi=IND.rsi(c,14)[j];
    const volumes=w.slice(j-20,j).map(b=>b.volume), mean=volumes.reduce((a,b)=>a+b,0)/20;
    const ratio=volumes.every(v=>Number.isFinite(v)&&v>0) && Number.isFinite(w[j].volume) && mean>0 ? w[j].volume/mean : null;
    const trend=fast[j]>slow[j] && slow[j]>slow[j-4] ? 1 : fast[j]<slow[j] && slow[j]<slow[j-4] ? -1 : 0;
    const cross=trend===1 ? c[p]<=fast[p] && c[j]>fast[j] : trend===-1 && c[p]>=fast[p] && c[j]<fast[j];
    const hour=Math.floor((now.rawTime%86400)/3600), session=hour>=11 && hour<=17;
    const checks=[
      {name:'Trend',ok:!!trend,value:trend>0?'Up':trend<0?'Down':'Mixed'},
      {name:'Pullback',ok:!!cross,value:cross?'Confirmed close':'Waiting for EMA20 reclaim'},
      {name:'ADX strength',ok:Number.isFinite(adx)&&adx>=25,value:Number.isFinite(adx)?adx.toFixed(1)+' / 25':'Unavailable'},
      {name:'RSI momentum',ok:Number.isFinite(rsi)&&(trend>0?rsi>=50&&rsi<=70:trend<0&&rsi>=30&&rsi<=50),value:Number.isFinite(rsi)?rsi.toFixed(1):'Unavailable'},
      {name:'Tick activity',ok:ratio!=null&&ratio>=1,value:ratio!=null?ratio.toFixed(2)+'× prior 20 bars':'Unavailable'},
    ];
    const dir=session && atr>0 && checks.every(c=>c.ok) ? trend : 0;
    const entry=now.open, sl=entry-dir*2*atr, tp=entry+dir*4*atr;
    const failed=checks.filter(c=>!c.ok).map(c=>c.name+': '+c.value);
    if(!session) failed.unshift('Outside 11:00–17:45 broker time');
    const valid=dir && [entry,sl,tp,atr].every(v=>Number.isFinite(v)&&v>0);
    return {dir:valid?dir:0,near:trend,score:checks.filter(c=>c.ok).length*20,checks,failed,
      entry,sl:valid?sl:null,tp:valid?tp:null,atr,fast:fast[j],slow:slow[j],tf:'15m',model:this.name,
      signalTime:w[j].rawTime,entryBar:now.rawTime,session:String(Math.floor(now.rawTime/86400)),
      reasons:checks.map(c=>c.name+': '+c.value),factors:{},meta:{brokerDay:Math.floor(now.rawTime/86400)}};
  },
  alreadyTraded(L, day, sym){
    const key=s=>typeof Feed!=='undefined'?Feed.brokerName(s):s;
    return !!L && [...L.open,...L.closed].some(p=>p.meta?.brokerDay===day && (!sym || key(p.sym)===key(sym)));
  },
  signal(bars,cfg={},L){
    const s=this.inspect(bars,bars.length-1,cfg.tf||'15m');
    if(s.dir && this.alreadyTraded(L,s.meta.brokerDay,cfg.sym)) return {...s,dir:0,failed:['Already traded this pair today']};
    return s;
  },
};
