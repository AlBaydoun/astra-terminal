/* Reproduce the browser study without a browser or any network/storage access. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const context=vm.createContext({console,setTimeout,Map,Set,WeakSet,Date,Intl});
for(const file of ['tests/risk-fixture.js','js/broker.js','js/feed.js','js/indicators.js','js/bots/engine.js',
  'research/intraday-candidates.js','research/intraday-study.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
context.snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'intraday-data.json'),'utf8').replace(/^\uFEFF/,''));
context.previous=JSON.parse(fs.readFileSync(path.join(__dirname,'channel20-results.json'),'utf8'));
async function main(){
  // Signals may see only the next open. Changing its eventual close/range and
  // all later bars must not change a signal already available at entry time.
  vm.runInContext(`
    const checkBars=snapshot.markets[0].candles.slice(0,600).map(b=>({rawTime:b[0],time:b[0],open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]}));
    const prepared=IntradayCandidates.prepare(checkBars);
    for(const i of [151,200,350,500]){
      const changed=checkBars.map((b,k)=>k<i?b:{...b,high:b.high*2,low:b.low/2,close:b.close*1.5,volume:999999});
      const changedContext=IntradayCandidates.prepare(changed);
      for(const c of IntradayCandidates.list){
        if(JSON.stringify(IntradayCandidates.signal(c.id,prepared,i))!==JSON.stringify(IntradayCandidates.signal(c.id,changedContext,i)))
          throw Error(c.id+': future-price leakage');
      }
    }
  `,context);
  const result=await vm.runInContext('IntradayStudy.run(snapshot,previous)',context);
  fs.writeFileSync(path.join(__dirname,'intraday-results.json'),JSON.stringify(result,null,2)+'\n');
  let report='# Intraday candidate results\n\n';
  report+='Three fixed M15 experiments on eight JustMarkets markets; no parameters or costs were reduced after seeing results. Each instrument/half starts with its own USD 10,000 paper account. These are separate tests, not portfolio returns.\n\n';
  for(const v of result.verdicts) report+='- **'+v.name+'**: '+v.verdict+'. Positive in both halves: '+(v.positiveBothHalves.join(', ')||'none')+'. Without unknown overnight financing: '+(v.positiveWithoutOvernight.join(', ')||'none')+'.\n';
  report+='\n| Candidate | Instrument | Half | Trades | Win rate | Profit factor | Average R | Max drawdown | Net USD |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for(const r of result.results) report+='| '+[r.candidate,r.symbol,r.half,r.trades,r.winRate.toFixed(1)+'%',Number(r.profitFactor).toFixed(2),r.averageR.toFixed(3),r.maxDrawdownPct.toFixed(2)+'%',r.netPnl.toFixed(2)].join(' | ')+' |\n';
  report+='\n## What this establishes\n\n';
  report+='These are exploratory results. Three hypotheses and eight markets create selection risk; picking the best row after the fact would need fresh unseen data. No candidate is established as profitable or ready for real money. No failed candidate was added to automatic trading.\n\n';
  report+='The bridge supplied 5,000 M15 bars for each market. The newest bar was discarded, leaving halves of 2,499 and 2,500 bars, each with 150 warm-up bars. This is a short recent sample and the once-per-day rule limits the number of trades. None of these historical trades counts as new forward paper evidence. Exact dates and every individual trade appear in the JSON output. Timestamps are broker server-clock labels, not UTC instants.\n\n';
  report+='Costs use the greater of the prior study spread, new captured spread and unchanged Pro profile. Commission stays 0.003% per side on FX/metals/energy and zero on indices/crypto; slippage stays 0.005% per side. Both entry and exit fees are included. Trades reconcile to cash in every fold. No stored history was rewritten.\n\n';
  report+='Maximum drawdown uses conservative adverse candle excursions and estimated liquidation costs before exits, plus closing equity. Historical variable spreads, liquidity, latency and unseen ticks remain unknown. Any overnight positions below have unknown financing and cannot support promotion.\n\n';
  const over=result.results.filter(r=>r.overnightTrades);
  report+=over.length?over.map(r=>'- '+r.candidate+', '+r.symbol+', '+r.half+': '+r.overnightTrades+' overnight position(s).').join('\n')+'\n':'No positions crossed a broker date boundary in these runs.\n';
  report+='\nResearch basis and exact predeclared rules: [study plan](intraday-plan.md). [Run the browser study](intraday.html). [Full results and trades](intraday-results.json). [Captured data and broker specifications](intraday-data.json).\n';
  fs.writeFileSync(path.join(__dirname,'intraday-results.md'),report);
  console.log(JSON.stringify({verdicts:result.verdicts,folds:result.results.length,trades:result.results.reduce((n,r)=>n+r.trades,0),
    maxReconciliationError:Math.max(...result.results.map(r=>Math.abs(r.cashReconciliationError)))},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
