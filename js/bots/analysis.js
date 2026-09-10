/* Read-only analysis of retained paper history. No repricing, ledger writes or saved filters. */
const TradeAnalysis = {
  f: {bot:'all',sym:'all',tf:'all',from:'',to:'',edited:'all'},
  page: 0,
  number(v){ return typeof v === 'number' && Number.isFinite(v); },
  money(v){ return this.number(v) ? (v > 0 ? '+' : '') + v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'; },
  cash(v){ return this.number(v) ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'; },
  value(v,d=2){ return this.number(v) ? v.toLocaleString(undefined,{maximumFractionDigits:d}) : '—'; },
  date(ts){ return this.number(ts) && ts > 0 && Number.isFinite(new Date(ts).getTime()) ? new Date(ts) : null; },
  day(ts){ const d=this.date(ts); return d ? [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-') : ''; },
  when(ts){ return this.date(ts)?.toLocaleString() || 'Unknown date'; },
  accounts(){ return BOTS.filter(b=>!Bots.isPage(b) && Bots.ledger(b.id)); },
  all(){
    return this.accounts().flatMap(b=>(Bots.ledger(b.id).closed||[]).map(t=>this.record(t,b)));
  },
  record(t,b){
    // Engine.close includes exit/partial fees in pnl, but entry fees left cash at entry.
    // Only Confluence retained an exact entry fee. Never reconstruct it using today's rates,
    // remaining quantity after a partial close, or a stop that may have been moved.
    const fees=this.number(t.fees)&&t.fees>=0?t.fees:null;
    const savedEntry=t.meta?.entryFee;
    const entry=fees===0?0:this.number(savedEntry)&&savedEntry>=0&&fees!==null&&savedEntry<=fees+0.0001?savedEntry:null;
    const valid=this.number(t.pnl)&&(t.dir===1||t.dir===-1);
    const net=valid?t.pnl-(entry??0):null;
    const risk=t.meta?.initialRisk;
    const r=entry!==null && this.number(risk)&&risk>0 ? net/risk : entry===0 && this.number(t.r)?t.r:null;
    return {t,bot:b.id,botName:b.name,valid,net,fees,entry,r,uncertain:entry===null,
      lower:valid&&entry===null ? fees===null?null:net-fees : net};
  },
  matches(x){
    const f=this.f,t=x.t,d=this.day(t.exitTime);
    return (f.bot==='all'||x.bot===f.bot)&&(f.sym==='all'||t.sym===f.sym)&&
      (f.tf==='all'||t.tf===f.tf)&&(!f.from||(d&&d>=f.from))&&(!f.to||(d&&d<=f.to))&&
      (f.edited==='all'||!!t.touched===(f.edited==='yes'));
  },
  stats(rows){
    const a=rows.filter(x=>x.valid), wins=a.filter(x=>x.net>0),losses=a.filter(x=>x.net<0),flat=a.length-wins.length-losses.length;
    const sum=(r,key)=>r.reduce((n,x)=>n+x[key],0),win=sum(wins,'net'),loss=-sum(losses,'net'),net=win-loss;
    const dated=a.filter(x=>this.date(x.t.exitTime)).sort((a,b)=>a.t.exitTime-b.t.exitTime);
    // Aggregate simultaneous closes before measuring the realised curve: ordering ties must not invent drawdown.
    const points=[];
    for(const x of dated){const p=points[points.length-1];if(p&&p.time===x.t.exitTime)p.delta+=x.net;else points.push({time:x.t.exitTime,delta:x.net});}
    let cash=0,peak=0,dd=0;for(const p of points){cash+=p.delta;p.cash=cash;peak=Math.max(peak,cash);dd=Math.max(dd,peak-cash);}
    const rs=a.filter(x=>this.number(x.r)),dur=a.filter(x=>this.date(x.t.entryTime)&&this.date(x.t.exitTime)&&x.t.exitTime>=x.t.entryTime);
    return {n:a.length,w:wins.length,l:losses.length,flat,win,loss,net,rate:a.length?wins.length/a.length*100:null,
      pf:loss?win/loss:win?Infinity:null,avg:a.length?net/a.length:null,avgWin:wins.length?win/wins.length:null,
      avgLoss:losses.length?-loss/losses.length:null,best:a.length?Math.max(...a.map(x=>x.net)):null,worst:a.length?Math.min(...a.map(x=>x.net)):null,
      fees:sum(a.filter(x=>x.fees!==null),'fees'),missingFees:a.filter(x=>x.fees===null).length,
      unknown:a.filter(x=>x.uncertain).length,lower:a.some(x=>x.lower===null)?null:sum(a,'lower'),
      avgR:rs.length?sum(rs,'r')/rs.length:null,rCount:rs.length,points,dd:dated.length?dd:null,undated:a.length-dated.length,
      duration:dur.length?dur.reduce((n,x)=>n+x.t.exitTime-x.t.entryTime,0)/dur.length:null,
      touched:a.filter(x=>x.t.touched).length};
  },
  headline(b,s){
    if(!b.n&&!s.n)return 'Your next completed trade starts the story';
    if(!b.n||!s.n)return 'One direction has no completed trades yet';
    if((b.unknown||s.unknown)&&(b.lower===null||s.lower===null||!(b.lower>s.net||s.lower>b.net)))return 'The Buy / Sell lead is uncertain after older entry fees';
    if(Math.abs(b.net-s.net)<0.00005)return 'Buy and Sell finished level';
    const side=b.net>s.net?'Buy':'Sell',v=Math.max(b.net,s.net);
    return v>0?side+' earned more net profit':v<0?side+' lost less — both directions lost money':side+' broke even; the other direction lost money';
  },
  select(key,label,items){return `<label>${label}<select data-an-filter="${key}">${items.map(([v,n])=>`<option value="${esc(v)}"${this.f[key]===v?' selected':''}>${esc(n)}</option>`).join('')}</select></label>`;},
  view(){
    const all=this.all(),unique=k=>[...new Set(all.map(x=>x.t[k]).filter(Boolean))].sort().map(v=>[v,v]);
    return `<div class="anWrap"><div class="anFilters">
      ${this.select('bot','Paper account',[['all','All bot accounts'],...this.accounts().map(b=>[b.id,b.name])])}
      ${this.select('sym','Instrument',[['all','All instruments'],...unique('sym')])}
      ${this.select('tf','Timeframe',[['all','All timeframes'],...unique('tf')])}
      <label>Closed from<input type="date" data-an-filter="from" value="${esc(this.f.from)}"></label>
      <label>Closed through<input type="date" data-an-filter="to" value="${esc(this.f.to)}"></label>
      ${this.select('edited','Trade adjustments',[['all','All trades'],['no','Unedited only'],['yes','Edited only']])}
      <button class="bBtn" data-an-reset>Reset filters</button><button class="bBtn" data-an-refresh>↻ Refresh</button>
      </div><div id="anResults">${this.results(all)}</div></div>`;
  },
  card(s,side){
    return `<article class="anCard anSide ${side.toLowerCase()}"><div class="anKicker">${side==='BUY'?'↗':'↘'} ${side} · ${s.n} completed trades</div>
      <h2 class="${s.net<0?'anNegative':'anPositive'}">${this.money(s.net)}${s.unknown?'*':''}</h2><p>Net result · paper ledger units</p>
      <div class="anMini"><div><b>${s.w}</b><span>Wins</span></div><div><b>${s.l}</b><span>Losses</span></div><div><b>${s.flat}</b><span>Break-even</span></div><div><b>${s.rate===null?'—':s.rate.toFixed(1)+'%'}</b><span>Win rate</span></div></div>
      <div class="anOutcome" role="img" aria-label="${side}: ${s.w} wins, ${s.l} losses, ${s.flat} break-even">${s.n?`<i class="anWon" style="width:${s.w/s.n*100}%"></i><i class="anLost" style="width:${s.l/s.n*100}%"></i><i class="anFlat" style="width:${s.flat/s.n*100}%"></i>`:''}</div>
      <div class="anFoot"><span class="anPositive">Won ${this.money(s.win)}</span><span class="anNegative">Lost ${this.money(-s.loss)}</span></div>
      ${s.unknown?`<p class="anFeeRange">* Net after missing entry fees: ${s.lower===null?'unknown':this.money(s.lower)+' to '+this.money(s.net)}</p>`:''}</article>`;
  },
  bars(b,s){
    const max=Math.max(b.win,b.loss,Math.abs(b.net),s.win,s.loss,Math.abs(s.net),1);
    return ['win','loss','net'].map((k,i)=>`<div class="anBarGroup"><h4>${['Money won','Money lost','Net result'][i]}</h4>${[[b,'BUY'],[s,'SELL']].map(([v,n])=>`<div class="anBarRow"><span>${n}</span><div class="anTrack"><i class="${n.toLowerCase()}" style="width:${Math.abs(v[k])/max*100}%"></i></div><b>${this.money(k==='loss'?-v[k]:v[k])}</b></div>`).join('')}</div>`).join('');
  },
  curve(b,s){
    const points=[...b.points,...s.points];if(!points.length)return '<p class="anEmpty">No dated completed trades to plot.</p>';
    const first=Math.min(...points.map(p=>p.time)),last=Math.max(...points.map(p=>p.time)),span=last-first||1;
    let lo=Math.min(0,...points.map(p=>p.cash)),hi=Math.max(0,...points.map(p=>p.cash));if(hi===lo){hi++;lo--;}
    const x=t=>70+(t-first)/span*620,y=v=>190-(v-lo)/(hi-lo)*160;
    const path=v=>{let d=`M70 ${y(0)}`;for(const p of v.points)d+=` H${x(p.time)} V${y(p.cash)}`;return d+` H690`;};
    return `<svg class="anCurve" viewBox="0 0 720 230" role="img" aria-label="Cumulative realised Buy and Sell results by close time; details in the comparison table">
      ${[lo,(lo+hi)/2,hi].map(v=>`<line x1="70" x2="690" y1="${y(v)}" y2="${y(v)}" class="anGrid"/><text x="64" y="${y(v)+4}" text-anchor="end">${esc(this.value(v,0))}</text>`).join('')}
      <line x1="70" x2="690" y1="${y(0)}" y2="${y(0)}" class="anZero"/>
      ${[[b,'buy'],[s,'sell']].map(([v,c])=>v.points.length?`<path d="${path(v)}" class="${c}"/>`:'').join('')}
      <text x="70" y="216">${esc(this.day(first))}</text><text x="690" y="216" text-anchor="end">${esc(this.day(last))}</text></svg>`;
  },
  table(b,s){
    const m=v=>this.money(v),v=v=>this.value(v),pf=v=>v===Infinity?'∞ (no losses)':v===null?'—':v.toFixed(2);
    const rows=[['Completed trades','n',v],['Winning trades','w',v],['Losing trades','l',v],['Break-even trades','flat',v],['Win rate','rate',v=>v===null?'—':v.toFixed(1)+'%'],['Money won (winning results)','win',m],['Money lost (losing results)','loss',v=>m(-v)],['Net result','net',m],['Recorded commission fees¹','fees',v=>this.cash(v)],['Average per trade','avg',m],['Average winner','avgWin',m],['Average loser','avgLoss',m],['Profit factor²','pf',pf],['Average R³','avgR',v=>v===null?'—':v.toFixed(2)+' R'],['Trades with usable R','rCount',v],['Best trade','best',m],['Worst trade','worst',m],['Largest realised drawdown⁴','dd',v=>this.cash(v)],['Average holding time','duration',v=>v===null?'—':this.value(v/3600000,1)+' hours'],['Manually adjusted trades','touched',v]];
    return `<div class="anTableScroll"><table class="anTable"><thead><tr><th>Measure</th><th class="anBuy">↗ Buy</th><th class="anSell">↘ Sell</th></tr></thead><tbody>${rows.map(([n,k,fmt])=>`<tr><th>${n}</th><td>${fmt(b[k])}</td><td>${fmt(s[k])}</td></tr>`).join('')}</tbody></table></div>`;
  },
  breakdown(rows,key){
    const groups=new Map();for(const x of rows){const k=key==='bot'?x.botName:(x.t[key]||'Unknown');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
    const a=[...groups].map(([name,r])=>({name,b:this.stats(r.filter(x=>x.t.dir===1)),s:this.stats(r.filter(x=>x.t.dir===-1))})).sort((x,y)=>(y.b.net+y.s.net)-(x.b.net+x.s.net));
    return `<div class="anTableScroll anBreakdown"><table class="anTable"><thead><tr><th>${key==='sym'?'Instrument':key==='tf'?'Timeframe':'Bot account'}</th><th>Buy trades</th><th>Buy net</th><th>Sell trades</th><th>Sell net</th><th>Combined net</th></tr></thead><tbody>${a.map(g=>`<tr><th>${key==='sym'&&g.name!=='Unknown'?WorkspaceUI.pair(g.name):esc(g.name)}</th><td>${g.b.n}</td><td class="${g.b.net<0?'anNegative':'anPositive'}">${this.money(g.b.net)}</td><td>${g.s.n}</td><td class="${g.s.net<0?'anNegative':'anPositive'}">${this.money(g.s.net)}</td><td>${this.money(g.b.net+g.s.net)}</td></tr>`).join('')||'<tr><td colspan="6">No completed trades match.</td></tr>'}</tbody></table></div>`;
  },
  log(rows){
    const sorted=rows.slice().sort((a,b)=>(b.t.exitTime||0)-(a.t.exitTime||0));
    const pages=Math.max(1,Math.ceil(sorted.length/50));this.page=Math.min(this.page,pages-1);
    return `<div class="anLogNav"><span>${rows.length} trades · page ${this.page+1} of ${pages}</span><button class="bBtn" data-an-page="-1" ${!this.page?'disabled':''}>← Previous</button><button class="bBtn" data-an-page="1" ${this.page>=pages-1?'disabled':''}>Next →</button></div>
      <div class="anTableScroll"><table class="anTable"><thead><tr><th>Closed / opened</th><th>Pair · bot</th><th>Side · timeframe</th><th>Entry → exit</th><th>Final lots</th><th>Net result</th><th>Fees</th><th>R</th><th>Exit / adjustments</th></tr></thead><tbody>${sorted.slice(this.page*50,(this.page+1)*50).map(x=>`<tr><td>${esc(this.when(x.t.exitTime))}<small>${esc(this.when(x.t.entryTime))}</small></td><td>${WorkspaceUI.pair(x.t.sym||'Unknown')}<small>${esc(x.botName)}</small></td><td class="${x.t.dir===1?'anBuy':'anSell'}">${x.t.dir===1?'BUY':'SELL'}<small>${esc(x.t.tf||'—')}</small></td><td>${this.value(x.t.entry,6)} → ${this.value(x.t.exit,6)}</td><td>${this.value(x.t.lots,4)}</td><td class="${x.net<0?'anNegative':'anPositive'}">${this.money(x.net)}${x.uncertain?'*':''}</td><td>${this.money(x.fees)}</td><td>${this.value(x.r)}</td><td>${esc(x.t.reason||'—')}<small>${x.t.touched?'Edited by hand':'Unedited'}</small></td></tr>`).join('')||'<tr><td colspan="9">No completed trades match.</td></tr>'}</tbody></table></div>`;
  },
  results(all=this.all()){
    if(this.f.from&&this.f.to&&this.f.from>this.f.to)return '<div class="anNotice" role="status">Choose an end date on or after the start date.</div>';
    const selected=all.filter(x=>this.matches(x)),rows=selected.filter(x=>x.valid),b=this.stats(rows.filter(x=>x.t.dir===1)),s=this.stats(rows.filter(x=>x.t.dir===-1)),total=this.stats(rows);
    const open=this.accounts().filter(b=>this.f.bot==='all'||b.id===this.f.bot).reduce((n,b)=>n+(Bots.ledger(b.id).open||[]).length,0);
    const capped=this.accounts().filter(b=>(this.f.bot==='all'||b.id===this.f.bot)&&(Bots.ledger(b.id).closed||[]).length>=500).length;
    return `<section class="anHero"><div><div class="anKicker">◈ DIRECTION ANALYSIS · PAPER HISTORY</div><h2>${this.headline(b,s)}</h2><p>${rows.length} completed trades · ${new Set(rows.map(x=>x.t.sym)).size} instruments · ${total.touched} adjusted by hand</p></div><div class="anTotal"><span>Combined net${total.unknown?'*':''}</span><strong class="${total.net<0?'anNegative':'anPositive'}">${this.money(total.net)}</strong><small>Recorded paper ledger units</small></div></section>
      <p class="anScope">${open} currently open positions in the selected account scope are excluded. Filters use local closing dates. Each bot is a separate virtual account; this is retained history, not a live broker statement.</p>
      ${total.unknown?`<div class="anNotice">* ${total.unknown} trades lack an exact saved entry fee. Their displayed results may overstate net profit. ${total.lower!==null?'Combined net is between '+this.money(total.lower)+' and '+this.money(total.net)+' after those entry fees.':'A reliable net range cannot be calculated because some fee records are missing.'} Charts and win/loss statistics use the displayed results.</div>`:''}
      ${selected.length!==rows.length?`<div class="anNotice">${selected.length-rows.length} records excluded: missing or invalid profit/direction. Missing numbers are never treated as zero.</div>`:''}
      ${capped?`<div class="anNotice">${capped} selected accounts have reached the 500-trade retention limit. Earlier history may no longer be available.</div>`:''}
      <div class="anColumns">${this.card(b,'BUY')}${this.card(s,'SELL')}</div>
      <div class="anColumns"><section class="anCard"><h3>▥ Where the money came from</h3><p>Same cash scale for every bar. Losses show money given back.</p>${this.bars(b,s)}</section>
      <section class="anCard"><h3>⌁ Profit over time</h3><p><span class="anBuy">━ Buy</span> &nbsp; <span class="anSell">┄ Sell</span> · cumulative completed results</p>${this.curve(b,s)}<p>${total.undated?total.undated+' trades without valid close dates are excluded from this curve.':'Both lines start at zero for the selected period.'} This is a realised P&amp;L curve, not account equity.</p></section></div>
      <section class="anCard"><h3>≋ Buy vs Sell · the full comparison</h3>${this.table(b,s)}<div class="anNotes"><p>¹ Recorded commissions are shown separately for reference; do not subtract them again. Saved entry fees are deducted when known. Spread and slippage are already reflected in fills; history is never repriced. ${total.missingFees} trades lack a commission record.</p><p>² Profit factor = money won ÷ money lost. ³ R compares profit with the trade’s original risk. Missing R is excluded; saved legacy R is retained when entry fees are zero. ⁴ Drawdown is the largest fall from a peak in the dated, completed-trade curve, in cash units; it excludes open losses. Cash comparisons also reflect different sizes and trade counts, not just signal quality.</p></div></section>
      <section class="anCard"><h3>◎ Which instruments delivered?</h3><p>Ranked by combined net. Click a pair to open its chart.</p>${this.breakdown(rows,'sym')}</section>
      <div class="anColumns"><section class="anCard"><h3>◷ By timeframe</h3>${this.breakdown(rows,'tf')}</section><section class="anCard"><h3>▦ By bot account</h3>${this.breakdown(rows,'bot')}</section></div>
      <section class="anCard"><h3>☷ Every completed trade</h3><p>Partial exits are included once when the remaining position closes. Final lots may be smaller than the original position.</p><div id="anLog">${this.log(rows)}</div></section>
      <p class="anScope">Updated ${esc(new Date().toLocaleTimeString())}. Historical paper results describe what happened; they do not establish a future trading advantage.</p>`;
  },
  refresh(){
    const el=document.getElementById('anResults');if(!el)return;
    // Keep date pickers, selects and focus intact during the workspace's 30-second tick.
    const focused=el.contains(document.activeElement);if(focused)return;
    const all=this.all();
    // A newly closed instrument should become filterable without rebuilding an open picker.
    for(const key of ['sym','tf']){
      const select=document.querySelector(`[data-an-filter="${key}"]`);
      if(!select||select===document.activeElement)continue;
      const known=new Set([...select.options].map(o=>o.value));
      for(const value of [...new Set(all.map(x=>x.t[key]).filter(Boolean))].sort()){
        if(known.has(value))continue;
        const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);
      }
    }
    el.innerHTML=this.results(all);
  },
  bind(host){
    host.querySelectorAll('[data-an-filter]').forEach(el=>el.addEventListener('change',()=>{this.f[el.dataset.anFilter]=el.value;this.page=0;this.refresh();}));
    host.querySelector('[data-an-reset]').addEventListener('click',()=>{this.f={bot:'all',sym:'all',tf:'all',from:'',to:'',edited:'all'};this.page=0;host.dataset.bot='';Bots.render();});
    host.querySelector('[data-an-refresh]').addEventListener('click',()=>this.refresh());
    host.querySelector('#anResults').addEventListener('click',e=>{const btn=e.target.closest('[data-an-page]');if(!btn)return;this.page+=Number(btn.dataset.anPage);const log=host.querySelector('#anLog');log.innerHTML=this.log(this.all().filter(x=>x.valid&&this.matches(x)));});
  },
};
