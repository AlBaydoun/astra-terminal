/* Chart-only MetaTrader-style oscillators. No strategy helpers are replaced.
   Formulas: metatrader5.com/en/terminal/help/indicators/oscillators
   Moving averages need warm-up history; leading values stay null, never zero. */
const MT5Osc = {
  period(n){return Math.max(1,Math.min(500,Math.trunc(Number(n))||14));},
  ema(values,n){
    n=this.period(n);
    const out=Array(values.length).fill(null),alpha=2/(n+1);let prev=null;
    for(let i=0;i<values.length;i++){
      if(!Number.isFinite(values[i]))continue;
      prev=prev===null?values[i]:alpha*values[i]+(1-alpha)*prev;out[i]=prev;
    }
    return out;
  },
  sma(values,n){
    n=this.period(n);
    const out=Array(values.length).fill(null);let sum=0,count=0;
    for(let i=0;i<values.length;i++){
      if(Number.isFinite(values[i])){sum+=values[i];count++;}
      if(i>=n&&Number.isFinite(values[i-n])){sum-=values[i-n];count--;}
      if(i>=n-1&&count===n)out[i]=sum/n;
    }
    return out;
  },
  macd(src,f=12,s=26,n=9){
    f=this.period(f);s=this.period(s);n=this.period(n);
    const fast=this.ema(src,f),slow=this.ema(src,s);
    const main=src.map((_,i)=>i<s-1?null:fast[i]-slow[i]);
    const signal=this.sma(main,n);
    return {main,signal,osma:main.map((v,i)=>v===null||signal[i]===null?null:v-signal[i])};
  },
  power(bars,n,side){
    n=this.period(n);
    const ema=this.ema(bars.map(b=>b.close),n);
    return bars.map((b,i)=>i<n-1?null:b[side==='bull'?'high':'low']-ema[i]);
  },
  chaikin(bars,f=3,s=10){
    f=this.period(f);s=this.period(s);
    let total=0;
    const ad=bars.map(b=>{
      if(!Number.isFinite(b.volume)||b.volume<0)return null;
      total+=b.high===b.low?0:((2*b.close-b.high-b.low)/(b.high-b.low))*b.volume;
      return total;
    });
    // Missing volume is not invented as zero activity.
    if(ad.some(v=>v===null))return bars.map(()=>null);
    const fast=this.ema(ad,f),slow=this.ema(ad,s);
    return ad.map((_,i)=>i<Math.max(f,s)-1?null:fast[i]-slow[i]);
  },
  rvi(bars,n=10){
    const weighted=values=>values.map((v,i)=>i<3||values.slice(i-3,i+1).some(x=>!Number.isFinite(x))?null:(v+2*values[i-1]+2*values[i-2]+values[i-3])/6);
    const numerator=this.sma(weighted(bars.map(b=>b.close-b.open)),n);
    const denominator=this.sma(weighted(bars.map(b=>b.high-b.low)),n);
    const main=numerator.map((v,i)=>v===null||denominator[i]===null?null:denominator[i]===0?0:v/denominator[i]);
    return {main,signal:weighted(main)};
  },
  trix(src,n=14){
    n=this.period(n);
    const third=this.ema(this.ema(this.ema(src,n),n),n);
    // Ratio units follow MetaTrader's published formula (not multiplied by 100).
    return third.map((v,i)=>i<3*(n-1)+1||!third[i-1]?null:(v-third[i-1])/third[i-1]);
  },
  histogram(ctx,values){return values.flatMap((v,i)=>Number.isFinite(v)?[{time:ctx.v[i].time,value:v,color:v>=0?'#2ebd85':'#f6465d'}]:[]);},
};
