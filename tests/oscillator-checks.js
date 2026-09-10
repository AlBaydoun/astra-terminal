const output=document.getElementById('results');let passed=0,total=0;
const assert=(v,message)=>{if(!v)throw Error(message);};
const near=(a,b)=>Math.abs(a-b)<1e-9;
function check(name,fn){total++;try{fn();passed++;output.textContent+='PASS '+name+'\n';}catch(e){output.textContent+='FAIL '+name+' · '+e.message+'\n';console.error(name,e);}}
check('The folder contains all 15 standard oscillator types with unique IDs',()=>{assert(MT5_OSCILLATORS.length===15&&new Set(INDS.map(d=>d.id)).size===INDS.length,'Missing or duplicate definitions');MT5_OSCILLATORS.forEach(id=>assert(IND_BY_ID[id]?.category==='oscillators',id));});
check('MetaTrader MACD uses a simple signal; OsMA is a separate difference',()=>{
  const src=Array.from({length:80},(_,i)=>100+i+Math.sin(i)*3),m=MT5Osc.macd(src,12,26,9);
  for(let i=33;i<src.length;i++){
    const reference=m.main.slice(i-8,i+1).reduce((a,b)=>a+b,0)/9;
    assert(near(m.signal[i],reference)&&near(m.osma[i],m.main[i]-reference),'Wrong SMA or histogram');
  }
  assert(m.main.slice(0,25).every(v=>v===null)&&m.signal[32]===null,'Invented warm-up values');
  assert(IND.macd(src,12,26,9).signal.some((v,i)=>v!==null&&Math.abs(v-m.signal[i])>.001),'Original EMA variant was replaced');
});
check('Bulls and Bears Power use high/low minus the EMA',()=>{const bars=Array.from({length:40},()=>({open:100,close:100,high:103,low:98}));assert(MT5Osc.power(bars,13,'bull').at(-1)===3&&MT5Osc.power(bars,13,'bear').at(-1)===-2,'Wrong sign or reference price');});
check('RVI constant body/range is 0.5 for both lines, with proper warm-up',()=>{const bars=Array.from({length:40},()=>({open:10,close:12,high:13,low:9})),r=MT5Osc.rvi(bars,10);assert(r.main[11]===null&&r.signal[14]===null&&near(r.main.at(-1),.5)&&near(r.signal.at(-1),.5),'Wrong RVI weighting');});
check('TRIX is a fractional change, not an accidentally multiplied percentage',()=>{const v=MT5Osc.trix([1,2,4,8,16],1);assert(v[0]===null&&v.slice(1).every(x=>x===1),'Wrong TRIX units');assert(MT5Osc.trix(Array(80).fill(10),14).at(-1)===0,'Flat price is not zero');});
check('Chaikin uses cumulative money flow and fails visibly on missing volume',()=>{
  const bars=Array.from({length:30},()=>({open:9,close:10,high:10,low:8,volume:1}));
  const v=MT5Osc.chaikin(bars,1,2); // AD=1,2,3...; EMA2 approaches AD minus 0.5.
  assert(near(v.at(-1),.5),'Wrong money-flow sign or accumulation');
  bars[4].volume=null;assert(MT5Osc.chaikin(bars).every(x=>x===null),'Missing volume became invented activity');
});
check('Flat and short histories produce no NaN or Infinity',()=>{
  for(const length of [0,1,3,20,100]){
    const bars=Array.from({length},()=>({open:100,close:100,high:100,low:100,volume:0}));
    const arrays=[MT5Osc.chaikin(bars),MT5Osc.power(bars,13,'bear'),MT5Osc.rvi(bars).main,MT5Osc.rvi(bars).signal,MT5Osc.trix(bars.map(b=>b.close)),MT5Osc.macd(bars.map(b=>b.close)).osma];
    arrays.forEach(a=>assert(a.length===length&&a.every(v=>v===null||Number.isFinite(v)),'Invalid warm-up or divide by zero'));
  }
});
const bars=Array.from({length:400},(_,i)=>{const close=100+i*.01+Math.sin(i*.13)*2,open=close+Math.sin(i*.29)*.4;return {time:1700000000+i*900,open,close,high:Math.max(open,close)+.6,low:Math.min(open,close)-.5,volume:100+i%23};});
const ctx={v:bars,srcOf:c=>bars.map(b=>b[c.src||'close']),line:values=>values.flatMap((value,i)=>Number.isFinite(value)?[{time:bars[i].time,value}]:[])};
for(const id of MT5_OSCILLATORS)check('Render '+IND_BY_ID[id].label,()=>{
  const def=IND_BY_ID[id],built=def.build(ctx,def.def),card=document.createElement('section');card.className='card';
  const title=document.createElement('h2');title.textContent=def.label;card.append(title);const canvas=document.createElement('div');card.append(canvas);document.getElementById('charts').append(card);
  const chart=LightweightCharts.createChart(canvas,{height:180,width:400,layout:{background:{color:'#0b1422'},textColor:'#aabbd2'},grid:{vertLines:{visible:false},horzLines:{visible:false}},rightPriceScale:{borderVisible:false}});
  for(const part of built){assert(part.data.length>20&&part.data.every(p=>Number.isFinite(p.value)),'Missing or invalid plotted values');const series=part.type==='hist'?chart.addHistogramSeries():chart.addLineSeries();series.setData(part.data);}
  chart.timeScale().fitContent();assert(canvas.querySelector('canvas'),'Chart canvas missing');
});
output.textContent+='\n'+passed+'/'+total+' passed.';
