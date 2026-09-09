document.getElementById('run').addEventListener('click',async()=>{
  const button=document.getElementById('run'), status=document.getElementById('status');button.disabled=true;
  try{
    const [data,prior,saved]=await Promise.all(['intraday-data.json','channel20-results.json','confluence-pro-results.json'].map(async u=>{
      const r=await fetch(u);if(!r.ok)throw Error(u+': HTTP '+r.status);return r.json();
    }));
    const out=await IntradayStudy.run(data,prior,s=>status.textContent=s);
    if(JSON.stringify(out.results)!==JSON.stringify(saved.results))throw Error('Browser and independent replay disagree');
    const v=out.verdicts[0], n=out.results.reduce((a,r)=>a+r.trades,0);
    status.textContent=`Pro commission 0% · 16 half-tests · ${n} simulated trades. Every metric and trade matches the independent replay. Closed-candle causality checks passed.`;
    document.getElementById('result').innerHTML=`<div class="card"><b>${v.verdict}</b><p>Positive in both halves: ${v.positiveBothHalves.join(', ')||'none'}. This does not establish future profitability.</p></div><table><thead><tr><th>Instrument / half</th><th>Trades</th><th>Win rate</th><th>PF</th><th>Avg R</th><th>Max DD</th><th>Net USD</th></tr></thead><tbody>`+out.results.map(r=>`<tr><td>${r.symbol} / ${r.half}</td><td>${r.trades}</td><td>${r.winRate.toFixed(1)}%</td><td>${Number(r.profitFactor).toFixed(2)}</td><td>${r.averageR.toFixed(3)}</td><td>${r.maxDrawdownPct.toFixed(2)}%</td><td class="${r.netPnl<0?'negative':''}">${r.netPnl.toFixed(2)}</td></tr>`).join('')+'</tbody></table>';
  }catch(e){status.textContent='FAILED: '+e.message;console.error(e);}finally{button.disabled=false;}
});
