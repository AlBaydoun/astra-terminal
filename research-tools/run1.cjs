const B=require('./bt.cjs'), S=require('./strats.cjs');
const f=v=>v==null?'—':v===Infinity?'inf':(+v).toFixed(2);
const out=[];
for (const tf of (process.argv[2]||'1h,15m').split(',')) for (const [nm,mk] of Object.entries(S)) for (const dirs of [[1],[1,-1]]){
  const st=mk(dirs); const ev=B.evaluate(st,B.SYMS,tf);
  const g={}; for(const t of ev.trades){ const k=B.GROUP(t.sym); (g[k]=g[k]||[]).push(t); }
  const gs=Object.entries(g).map(([k,ts])=>k+' '+ts.length+' PF'+f(B.stats(ts).pf)).join(' | ');
  console.log(tf.padEnd(3), nm.padEnd(12), (dirs.length>1?'both':'long').padEnd(4), 'n',String(ev.tot.n).padStart(5),'win',f(ev.tot.winRate).padStart(6),'PF',f(ev.tot.pf),'netR',f(ev.tot.netR).padStart(8),'| halves PF',f(ev.h1.pf),f(ev.h2.pf),'| random PF',f(ev.rnd.pf),'avgR',f(ev.rnd.avgR),'vs',f(ev.tot.avgR),'\n      ',gs);
}
