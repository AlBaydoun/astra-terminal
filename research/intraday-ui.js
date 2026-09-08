document.getElementById('runStudy').onclick=async()=>{
  const button=document.getElementById('runStudy');button.disabled=true;
  try {
    const data=await fetch('intraday-data.json').then(r=>r.json());
    const previous=await fetch('channel20-results.json').then(r=>r.json());
    const result=await IntradayStudy.run(data,previous,text=>document.getElementById('status').textContent=text);
    const saved=await fetch('intraday-results.json').then(r=>r.json());
    // Compare every reported metric and trade against the independent local
    // replay. Wall-clock run time is intentionally excluded.
    if(JSON.stringify(result.results)!==JSON.stringify(saved.results)) throw Error('Browser results differ from the saved independent replay');
    document.getElementById('raw').textContent=JSON.stringify(result,null,2);
    document.getElementById('status').textContent='48 separate half-tests completed. Every metric and trade matches the independent replay. No parameters changed.';
    document.getElementById('verdicts').innerHTML=result.verdicts.map(v=>'<p><b>'+esc(v.name)+'</b>: '+esc(v.verdict)+
      '. Both halves positive: '+esc(v.positiveBothHalves.join(', ')||'none')+'. Without unknown overnight financing: '+esc(v.positiveWithoutOvernight.join(', ')||'none')+'.</p>').join('');
    document.getElementById('table').innerHTML='<table><thead><tr>'+['Candidate','Market','Half','Trades','Win %','PF','Average R','Max DD %','Net USD'].map(h=>'<th>'+h+'</th>').join('')+
      '</tr></thead><tbody>'+result.results.map(r=>'<tr class="'+(r.netPnl>0?'gain':'loss')+'">'+
        [r.candidate,r.symbol,r.half,r.trades,r.winRate.toFixed(1),Number(r.profitFactor).toFixed(2),r.averageR.toFixed(3),r.maxDrawdownPct.toFixed(2),r.netPnl.toFixed(2)].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    console.info('ASTRA intraday comparison completed: 48 folds');
  } catch(e){document.getElementById('status').textContent='Study failed: '+e.message;console.error(e);}
  finally {button.disabled=false;}
};
