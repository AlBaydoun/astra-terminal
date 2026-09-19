/* Trade Replay is a read-only reconstruction. It copies ledgers and candles;
   neither the live chart nor any order runner receives replay prices. */
const TradeReview = {
  page:0, rows:[], bars:[], index:0, version:0, speed:2, selected:null,
  fmt(v,d=4){return v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:d});},
  records(){const out=[];for(const b of BOTS){if(Bots.isPage(b))continue;const L=Bots.ledgers[b.id];for(const t of L?.closed||[])out.push({...t,bot:b.id,botName:WorkspaceUI.name(b)});}return out;},
  init(){
    document.getElementById('tradeReviewBtn')?.addEventListener('click',()=>this.show());
    const button=document.createElement('button');button.id='chartReviewBtn';button.innerHTML=WorkspaceUI.icon('clock')+'<span>Inspect / replay</span>';button.title='Review a frozen copy of this chart with candle details';button.onclick=()=>this.current();document.getElementById('chartLabelBar')?.append(button);
    const h=document.createElement('dialog');h.id='tradeReview';h.className='obsDialog';
    h.innerHTML=`<div class="obsHead"><div><small>ASTRA / TRADE FORENSICS</small><h1>Rewind. Inspect. <em>Understand.</em></h1><p>Read-only paper history, including disabled bots. Prices never reach an order runner.</p></div><button data-close aria-label="Close trade replay">✕</button></div><div class="obsToolbar" id="trFilters"></div><div id="trStats" class="trStats"></div><div class="trList"><div class="obsTableScroll" id="trRows"></div></div><div class="obsToolbar"><button id="trPrev">← Previous page</button><span id="trPage"></span><button id="trNext">Next page →</button><button id="trExport">↓ Export filtered CSV</button><button id="trCurrent">Inspect current chart</button></div><section id="trReview" hidden><div class="trLayout"><div class="trStage"><div class="trReviewHead"><h2 id="trTitle"></h2><button id="trListBack">↑ Trade list</button></div><p id="trNotice" class="trNotice" role="status"></p><div class="trControls"><label>Timeframe <select id="trTf">${['1m','5m','15m','30m','1h','4h','1d'].map(v=>`<option>${v}</option>`).join('')}</select></label><label>Clock <select id="trClock"><option value="broker">MT5 server time → UTC</option><option value="utc">Already UTC</option></select></label><label>Overlay <select id="trOverlay"><option value="none">Candles only</option><option value="ema">EMA 20 / 50</option><option value="rsi">RSI 14</option></select></label><button id="trReload">Load history</button></div><div id="trChart" class="trCanvas"></div><div id="trRsi" class="trPane" hidden></div><div id="trBarInfo" class="trBarInfo"></div><div class="trControls"><button id="trBack" aria-label="Previous candle">◀</button><button id="trPlay">▶ Play</button><button id="trStep" aria-label="Next candle">▶|</button><select id="trSpeed" aria-label="Replay speed"><option value="1">1 bar/s</option><option value="2" selected>2 bars/s</option><option value="5">5 bars/s</option><option value="10">10 bars/s</option></select><input id="trSeek" type="range" min="0" max="0" value="0" aria-label="Replay candle"><span id="trPosition"></span><label class="trFollow"><input type="checkbox" id="trFollow" checked> Follow playback</label></div><div class="trControls"><label>Jump to UTC <input id="trJump" type="datetime-local"></label><button id="trJumpGo">Go</button><button id="trEntry">Entry</button><button id="trExit">Exit</button><button id="trFit">Fit chart</button></div><p class="trNotice">Hover a candle to inspect OHLC and volume. Drag / scroll to pan and zoom. Each step reveals one completed candle; it cannot show the order of ticks inside that candle. RSI / EMA are calculated on the visible prefix only.</p></div><aside id="trFacts" class="trFacts"></aside></div></section><footer class="obsFoot">Trade amounts and outcomes are preserved exactly as recorded, with no cost recalculation. Stops and targets are the last saved levels, not an edit timeline. Historical candles may be unavailable; gaps and clock assumptions are shown explicitly. Reviewing a chart does not pause active bots.</footer>`;
    document.body.append(h);this.host=h;h.querySelector('[data-close]').onclick=()=>h.close();h.addEventListener('close',()=>{const b=document.getElementById('tradeReviewBtn');b?.setAttribute('aria-expanded','false');b?.classList.remove('active');this.pause();this.version++;this.controller?.abort();this.dispose();});
    h.querySelector('#trListBack').onclick=()=>{this.pause();h.classList.remove('trInspect');h.scrollTop=0;};
    h.querySelector('#trCurrent').onclick=()=>this.current();h.querySelector('#trPrev').onclick=()=>{this.page--;this.filter(false);};h.querySelector('#trNext').onclick=()=>{this.page++;this.filter(false);};h.querySelector('#trExport').onclick=()=>this.export();
    h.querySelector('#trRows').onclick=e=>{const b=e.target.closest('[data-tr-row]');if(b)this.select(this.rows[+b.dataset.trRow]);};
    h.querySelector('#trReload').onclick=()=>this.load();h.querySelector('#trOverlay').onchange=()=>this.draw();h.querySelector('#trClock').onchange=()=>this.prepare();
    h.querySelector('#trBack').onclick=()=>this.step(-1);h.querySelector('#trStep').onclick=()=>this.step(1);h.querySelector('#trPlay').onclick=()=>this.timer?this.pause():this.play();
    h.querySelector('#trSpeed').onchange=()=>{if(this.timer){this.pause();this.play();}};h.querySelector('#trSeek').oninput=e=>{this.pause();this.index=+e.target.value;this.draw();};
    h.querySelector('#trEntry').onclick=()=>this.jump(this.selected?.entryTime);h.querySelector('#trExit').onclick=()=>this.jump(this.selected?.exitTime);h.querySelector('#trJumpGo').onclick=()=>{const v=h.querySelector('#trJump').value;if(v)this.jump(Date.parse(v+'Z'));};h.querySelector('#trFit').onclick=()=>this.chart?.timeScale().fitContent();
  },
  show(){this.host.classList.remove('trInspect');const reopen=!this.host.open;if(reopen)this.host.showModal();const b=document.getElementById('tradeReviewBtn');b?.setAttribute('aria-expanded','true');b?.classList.add('active');this.buildFilters();this.filter();if(reopen&&this.original?.length)this.prepare();},
  buildFilters(){
    const previous=Object.fromEntries([...this.host.querySelectorAll('[data-tr-filter]')].map(e=>[e.dataset.trFilter,e.value]));
    const records=this.records(),opt=(key,label,values)=>`<label>${label}<select data-tr-filter="${key}"><option value="">All</option>${values.map(v=>`<option value="${esc(v[0])}">${esc(v[1])}</option>`).join('')}</select></label>`,unique=k=>[...new Set(records.map(t=>t[k]).filter(Boolean))].sort().map(v=>[v,v]);
    this.host.querySelector('#trFilters').innerHTML=opt('bot','Bot',[...new Map(records.map(t=>[t.bot,[t.bot,t.botName]])).values()])+opt('sym','Instrument',unique('sym'))+opt('tf','Timeframe',unique('tf'))+opt('side','Direction',[['buy','Buy'],['sell','Sell']])+opt('outcome','Outcome',[['win','Winning'],['loss','Losing'],['flat','Breakeven']])+opt('touched','Management',[['yes','Hand-adjusted'],['no','Bot only']])+opt('reason','Exit reason',unique('reason'))+`<label>Search notes / reasons<input type="search" data-tr-filter="query"></label>`+[['from','Closed from','date'],['to','Closed through','date'],['min','Minimum P/L','number'],['max','Maximum P/L','number'],['rmin','Minimum R','number'],['rmax','Maximum R','number'],['holdmin','Min hold (minutes)','number'],['holdmax','Max hold (minutes)','number'],['score','Minimum score','number']].map(([k,l,t])=>`<label>${l}<input type="${t}" step="any" data-tr-filter="${k}"></label>`).join('')+`<label>Sort<select data-tr-filter="sort"><option value="recent">Newest close</option><option value="old">Oldest close</option><option value="best">Highest P/L</option><option value="worst">Lowest P/L</option><option value="hold">Longest held</option></select></label><button id="trReset">Clear filters</button>`;
    this.host.querySelectorAll('[data-tr-filter]').forEach(e=>{if(previous[e.dataset.trFilter]!=null)e.value=previous[e.dataset.trFilter];});
    this.host.querySelectorAll('[data-tr-filter]').forEach(e=>e.addEventListener('input',()=>this.filter()));this.host.querySelector('#trReset').onclick=()=>{this.host.querySelectorAll('[data-tr-filter]').forEach(e=>e.value=e.dataset.trFilter==='sort'?'recent':'');this.filter();};
  },
  match(t,f){
    for(const k of ['bot','sym','tf','reason'])if(f[k]&&t[k]!==f[k])return false;
    if(f.side&&(f.side==='buy'?t.dir<=0:t.dir>=0))return false;
    if(f.outcome&&(f.outcome==='win'?!(t.pnl>0):f.outcome==='loss'?!(t.pnl<0):t.pnl!==0))return false;
    if(f.touched&&!!t.touched!==(f.touched==='yes'))return false;
    const day=BotDash.dayOf(t.exitTime);if(f.from&&day<f.from||f.to&&day>f.to)return false;
    const mins=(t.exitTime-t.entryTime)/60000;
    for(const [k,v,min]of [['min',t.pnl,true],['max',t.pnl,false],['rmin',t.r,true],['rmax',t.r,false],['holdmin',mins,true],['holdmax',mins,false],['score',t.score,true]])if(f[k]!==''&&f[k]!=null&&(!Number.isFinite(v)||(min?v<+f[k]:v>+f[k])))return false;
    return !f.query||JSON.stringify(t).toLowerCase().includes(f.query.toLowerCase());
  },
  filter(reset=true){
    if(reset)this.page=0;const f=Object.fromEntries([...this.host.querySelectorAll('[data-tr-filter]')].map(e=>[e.dataset.trFilter,e.value]));
    this.rows=this.records().filter(t=>this.match(t,f)).sort((a,b)=>f.sort==='old'?a.exitTime-b.exitTime:f.sort==='best'?b.pnl-a.pnl:f.sort==='worst'?a.pnl-b.pnl:f.sort==='hold'?(b.exitTime-b.entryTime)-(a.exitTime-a.entryTime):b.exitTime-a.exitTime);
    const rows=this.rows,valid=rows.filter(t=>Number.isFinite(t.pnl)),wins=valid.filter(t=>t.pnl>0),loss=valid.filter(t=>t.pnl<0),net=valid.reduce((s,t)=>s+t.pnl,0),gp=wins.reduce((s,t)=>s+t.pnl,0),gl=-loss.reduce((s,t)=>s+t.pnl,0),rs=valid.filter(t=>Number.isFinite(t.r));
    this.host.querySelector('#trStats').innerHTML=[['Trades',rows.length],['Wins / losses',wins.length+' / '+loss.length],['Recorded P/L',this.fmt(net,2)],['Profit factor',gl?this.fmt(gp/gl,2):gp?'∞':'—'],['Average R',rs.length?this.fmt(rs.reduce((s,t)=>s+t.r,0)/rs.length,2):'—']].map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('');
    this.page=Math.max(0,Math.min(this.page,Math.ceil(rows.length/50)-1));const start=this.page*50;
    this.host.querySelector('#trRows').innerHTML=`<table><thead><tr><th>Replay</th><th>Bot</th><th>Pair / side</th><th>TF</th><th>Opened · local time</th><th>Closed · local time</th><th>Recorded P/L</th><th>R</th><th>Exit</th></tr></thead><tbody>${rows.slice(start,start+50).map((t,i)=>`<tr><td><button data-tr-row="${start+i}">▷ Inspect</button></td><td>${esc(t.botName)}</td><td>${esc(t.sym)} ${t.dir>0?'BUY':'SELL'}</td><td>${esc(t.tf||'—')}</td><td>${new Date(t.entryTime).toLocaleString()}</td><td>${new Date(t.exitTime).toLocaleString()}</td><td class="${t.pnl>=0?'pos':'neg'}">${this.fmt(t.pnl,2)}</td><td>${this.fmt(t.r,2)}</td><td>${esc(t.reason||'—')}${t.touched?' · adjusted':''}</td></tr>`).join('')||'<tr><td colspan="9">No completed paper trades match these filters.</td></tr>'}</tbody></table>`;
    this.host.querySelector('#trPage').textContent=`${rows.length?start+1:0}–${Math.min(start+50,rows.length)} of ${rows.length}`;this.host.querySelector('#trPrev').disabled=this.page===0;this.host.querySelector('#trNext').disabled=start+50>=rows.length;
  },
  async select(t){
    if(!t)return;this.host.classList.add('trInspect');this.selected={...t};this.sym=t.sym;this.snapshot=false;this.host.querySelector('#trTf').value=['1m','5m','15m','30m','1h','4h','1d'].includes(t.tf)?t.tf:'15m';
    this.host.querySelector('#trReview').hidden=false;this.host.querySelector('#trTitle').textContent=`${t.sym} · ${t.dir>0?'BUY':'SELL'} · ${t.botName}`;
    const fields=[['Entry',this.fmt(t.entry)],['Exit',this.fmt(t.exit)],['Last saved stop',this.fmt(t.sl)],['Last saved target',this.fmt(t.tp)],['Quantity',this.fmt(t.qty)],['Lots',this.fmt(t.lots)],['Recorded P/L',this.fmt(t.pnl,2)],['Recorded R',this.fmt(t.r,2)],['Fees recorded',this.fmt(t.fees)],['Slippage recorded',this.fmt(t.slippage)],['Best excursion (saved)',this.fmt(t.mfe,2)],['Worst excursion (saved)',this.fmt(t.mae,2)],['Score',this.fmt(t.score)],['Bars held',this.fmt(t.barsHeld,0)],['Hand-adjusted',t.touched?'Yes':'No'],['Saved edit count',this.fmt(t.edits,0)]];
    this.host.querySelector('#trFacts').innerHTML=`<h3>Recorded trade facts</h3><dl>${fields.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p class="trNotice">Entry UTC: ${new Date(t.entryTime).toISOString()}<br>Exit UTC: ${new Date(t.exitTime).toISOString()}</p><h3>Entry reasoning</h3><p>${esc((t.reasons||[]).join(' · ')||t.note||'No entry reasoning saved.')}</p><p>Exit: ${esc(t.reason||'Not recorded')}</p><details><summary>Every saved field · exact record</summary><pre>${esc(JSON.stringify(t,null,2))}</pre></details>`;
    this.host.querySelector('#trReview').scrollIntoView({block:'start'});await this.load();
  },
  current(){
    this.show();this.host.classList.add('trInspect');this.pause();this.version++;this.controller?.abort();this.selected=null;this.sym=STORE.symbol;this.snapshot=true;this.loadedTf=STORE.tf;this.original=Chart.raw.map(b=>({...b}));
    this.host.querySelector('#trTf').value=STORE.tf;this.host.querySelector('#trReview').hidden=false;this.host.querySelector('#trTitle').textContent=this.sym+' · current chart snapshot';this.host.querySelector('#trFacts').innerHTML='<h3>Chart inspection</h3><p>This is a frozen copy of the chart at the moment you opened it. Replay, inspect individual candles, or choose another timeframe and Load history.</p><p>No trade is selected. No hypothetical P/L is presented as a real result.</p>';this.setClock();this.prepare();this.host.querySelector('#trReview').scrollIntoView({block:'start'});
  },
  setClock(){this.host.querySelector('#trClock').value=Feed.route(this.sym).kind==='bridge'&&Feed.bridgeClock?.offset!==0?'broker':'utc';},
  async load(){
    this.pause();const v=++this.version;this.controller?.abort();this.controller=new AbortController();this.bars=[];this.original=[];this.dispose();this.controls(false);this.host.querySelector('#trNotice').textContent='Loading up to 5,000 historical candles…';
    try{const tf=this.host.querySelector('#trTf').value;if(!tf)throw Error('Choose a supported timeframe.');
      /* a finished trade is loaded from well before its entry right up to NOW, so it
         can be walked forward past the exit — did the target ever get hit? */
      const t=this.selected,secs={'1s':1,'30s':30,'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800}[tf]||900;
      const from=t&&Number.isFinite(t.entryTime)&&!['1s','30s'].includes(tf)?Math.floor(t.entryTime/1000-secs*250-6*3600):null;
      const bars=await API.klines(this.sym,tf,from?60000:5000,{signal:this.controller.signal,from});if(v!==this.version||!this.host.open)return;this.original=bars.map(b=>({...b}));this.loadedTf=tf;this.snapshot=false;this.setClock();this.prepare();}
    catch(e){if(v!==this.version)return;this.host.querySelector('#trNotice').textContent='History unavailable: '+e.message+'. The saved trade details remain available.';console.warn('ASTRA trade review:',e.message);}
  },
  normalize(bar){
    let t=bar.rawTime;if(this.host.querySelector('#trClock').value==='broker'){const d=new Date(t*1000);t=MarketClock.instant(d.toISOString().slice(0,10),d.getUTCHours()*60+d.getUTCMinutes(),'Europe/Helsinki')/1000+d.getUTCSeconds();}
    return {...bar,time:t,rawTime:t};
  },
  prepare(){
    this.pause();this.dispose();this.bars=[];const seen=new Set();
    for(const raw of this.original||[]){const b=this.normalize(raw);if(![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||seen.has(b.time))continue;seen.add(b.time);this.bars.push(b);}
    this.bars.sort((a,b)=>a.time-b.time);this.bars=this.bars.filter(b=>(b.time+this.seconds())*1000<=Date.now());const omitted=(this.original?.length||0)-this.bars.length;const t=this.selected;
    if(!this.bars.length){this.controls(false);this.host.querySelector('#trNotice').textContent='No valid candles returned. Saved facts remain available.';return;}
    const first=this.bars[0].time,last=this.bars.at(-1).time,seconds=this.seconds(),has=t&&t.entryTime/1000>=first&&t.exitTime/1000<last+seconds;
    this.index=t?Math.max(0,this.bars.findIndex(b=>b.time+seconds>t.entryTime/1000)):Math.min(49,this.bars.length-1);
    const gaps=this.bars.slice(1).filter((b,i)=>b.time-this.bars[i].time>seconds*1.5).length;
    this.host.querySelector('#trNotice').textContent=`${this.bars.length} candles · ${new Date(first*1000).toISOString()} → ${new Date(last*1000).toISOString()}. ${gaps} session breaks / gaps. ${omitted} incomplete, duplicate or invalid candles excluded. `+(t?(has?'Trade interval covered by returned candles. ':'Trade interval is NOT fully covered; replay is partial. '):'Frozen chart snapshot. ')+(this.host.querySelector('#trClock').value==='broker'?'Clock assumes JustMarkets EET/EEST server timestamps, converted to UTC. ':'Candle timestamps treated as UTC. ');
    this.createChart();this.controls(true);this.draw();this.focus();this.afterExit();
  },
  /* What happened AFTER the trade closed: did price ever reach the saved target,
     did it go through the stop first, how far did it run — and a way to jump there. */
  afterExit(){
    const t=this.selected,host=this.host.querySelector('#trFacts');if(!host)return;host.querySelector('#trAfter')?.remove();if(!t||!this.bars.length)return;
    const secs=this.seconds(),dir=t.dir>0?1:-1,fmt=v=>this.fmt(v),after=this.bars.filter(b=>b.time>=t.exitTime/1000),last=this.bars.at(-1);
    const hit=(lvl,side)=>{if(!(lvl>0))return -1;return after.findIndex(b=>side>0?b.high>=lvl:b.low<=lvl);};
    const tpIdx=hit(t.tp,dir),slIdx=hit(t.sl,-dir);
    let best=t.exit,bestAt=null;for(const b of after){const v=dir>0?b.high:b.low;if((v-best)*dir>0){best=v;bestAt=b.time;}}
    const span=ms=>{const m=Math.round(ms/60000);return m<60?m+' min':m<1440?(m/60).toFixed(1)+' h':(m/1440).toFixed(1)+' days';};
    const jumpBtn=(label,time)=>`<button class="trAfterJump" data-tr-jump="${time}">${label}</button>`;
    const bestPct=t.exit>0?((best-t.exit)/t.exit*dir*100):0;
    let verdict;
    if(tpIdx>=0&&(slIdx<0||tpIdx<=slIdx))verdict=`<b class="pos">✓ The target ${fmt(t.tp)} WAS reached</b> — ${span(after[tpIdx].time*1000-t.exitTime)} after the exit${slIdx>=0?', before the stop side':''}. ${jumpBtn('▶▶ Jump to the target hit',after[tpIdx].time*1000)}`;
    else if(slIdx>=0&&tpIdx<0)verdict=`<b class="neg">✗ The target was never reached</b> — price went through the stop level ${fmt(t.sl)} ${span(after[slIdx].time*1000-t.exitTime)} after the exit instead. ${jumpBtn('▶▶ Jump to the stop hit',after[slIdx].time*1000)}`;
    else if(slIdx>=0&&tpIdx>slIdx)verdict=`<b class="neg">✗ The stop side came first</b> — price crossed ${fmt(t.sl)} ${span(after[slIdx].time*1000-t.exitTime)} after the exit; the target ${fmt(t.tp)} was only reached ${span(after[tpIdx].time*1000-t.exitTime)} later. ${jumpBtn('▶▶ Stop hit',after[slIdx].time*1000)} ${jumpBtn('▶▶ Target hit',after[tpIdx].time*1000)}`;
    else verdict=`<b>— The target ${t.tp>0?fmt(t.tp):'(none saved)'} has not been reached up to ${new Date(last.time*1000).toLocaleString()}</b>${bestAt?` — the best price since the exit was ${fmt(best)} (${bestPct>=0?'+':''}${bestPct.toFixed(2)}% in the trade’s favour) ${jumpBtn('▶▶ Best price',bestAt*1000)}`:''}`;
    const coverage=after.length?`${after.length} candles after the exit, up to ${new Date(last.time*1000).toLocaleString()} (${span(last.time*1000-t.exitTime)} later).`:'No candles after the exit were returned — reload with a longer timeframe.';
    host.insertAdjacentHTML('afterbegin',`<div id="trAfter" class="trAfter"><h3>After the exit — walking forward to now</h3><p>${verdict}</p><p class="trNotice">${coverage} Use ▶ Play, ▶| or the slider to walk past the exit; ${jumpBtn('▶▶ To now',last.time*1000)}</p></div>`);
    host.querySelectorAll('[data-tr-jump]').forEach(b=>b.onclick=()=>{this.jump(+b.dataset.trJump);});
  },
  seconds(){return {'1s':1,'30s':30,'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800}[this.loadedTf]||900;},
  controls(on){for(const id of ['trBack','trPlay','trStep','trSeek','trJumpGo','trFit'])this.host.querySelector('#'+id).disabled=!on;for(const id of ['trEntry','trExit'])this.host.querySelector('#'+id).disabled=!on||!this.selected;},
  createChart(){
    const el=this.host.querySelector('#trChart');this.chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:370,layout:{background:{color:'#142139'},textColor:'#c9d9ed'},grid:{vertLines:{color:'#243650'},horzLines:{color:'#243650'}},timeScale:{timeVisible:true,secondsVisible:this.seconds()<60},rightPriceScale:{borderColor:'#38506f',minimumWidth:96}});
    this.series=this.chart.addCandlestickSeries({upColor:'#5be8cf',downColor:'#ff879b',wickUpColor:'#5be8cf',wickDownColor:'#ff879b',borderVisible:false,priceFormat:{type:'price',precision:Math.min(8,Feed.specFor(this.sym)?.digits??5),minMove:10**-(Math.min(8,Feed.specFor(this.sym)?.digits??5))}});
    this.ema20=this.chart.addLineSeries({color:'#f2c369',lineWidth:1,priceLineVisible:false,lastValueVisible:false});this.ema50=this.chart.addLineSeries({color:'#9c9bff',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
    const t=this.selected;if(t)for(const [key,title,color]of [['entry','Entry','#80baff'],['sl','Last saved SL','#ff879b'],['tp','Last saved TP','#5be8cf']])if(Number.isFinite(t[key])&&t[key]>0)this.series.createPriceLine({price:t[key],color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title});
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(range&&this.rsiChart)this.rsiChart.timeScale().setVisibleLogicalRange(range);});
    this.chart.subscribeCrosshairMove(p=>{if(p.time){const b=this.bars.find(b=>b.time===p.time);if(b)this.barInfo(b);}});
    this.resize=new ResizeObserver(()=>{if(this.chart)this.chart.applyOptions({width:el.clientWidth});if(this.rsiChart)this.rsiChart.applyOptions({width:el.clientWidth});});this.resize.observe(el);
  },
  draw(){
    if(!this.series||!this.bars.length)return;const bars=this.bars.slice(0,this.index+1),kind=this.host.querySelector('#trOverlay').value;this.series.setData(bars);
    const ema=n=>{let v=bars[0].close;return bars.map(b=>{v+=2/(n+1)*(b.close-v);return {time:b.time,value:v};});};this.ema20.setData(kind==='ema'?ema(20):[]);this.ema50.setData(kind==='ema'?ema(50):[]);
    const t=this.selected,markers=[];if(t)for(const [at,label,color,shape,position]of [[t.entryTime,'ENTRY','#80baff','arrowUp','belowBar'],[t.exitTime,'EXIT','#f5cc77','arrowDown','aboveBar']]){const b=this.bars.find(b=>b.time<=at/1000&&at/1000<b.time+this.seconds());if(b&&b.time<=bars.at(-1).time)markers.push({time:b.time,position,color,shape,text:label});}
    if(t){const dir=t.dir>0?1:-1,after=bars.filter(b=>b.time>=t.exitTime/1000);const tpB=t.tp>0?after.find(b=>dir>0?b.high>=t.tp:b.low<=t.tp):null;const slB=t.sl>0?after.find(b=>dir>0?b.low<=t.sl:b.high>=t.sl):null;
      if(tpB)markers.push({time:tpB.time,position:dir>0?'aboveBar':'belowBar',color:'#5be8cf',shape:'circle',text:'TARGET HIT'});if(slB)markers.push({time:slB.time,position:dir>0?'belowBar':'aboveBar',color:'#ff879b',shape:'circle',text:'STOP SIDE'});}
    this.series.setMarkers(markers.sort((a,b)=>a.time-b.time));
    const pane=this.host.querySelector('#trRsi');pane.hidden=kind!=='rsi';if(kind==='rsi'){
      if(!this.rsiChart){this.rsiChart=LightweightCharts.createChart(pane,{width:pane.clientWidth,height:140,handleScroll:false,handleScale:false,layout:{background:{color:'#142139'},textColor:'#c9d9ed'},timeScale:{timeVisible:true},rightPriceScale:{autoScale:true,minimumWidth:96}});this.rsiSeries=this.rsiChart.addLineSeries({color:'#b399ff',lineWidth:2});for(const v of [30,70])this.rsiSeries.createPriceLine({price:v,color:'#52667f',lineWidth:1,lineStyle:2,axisLabelVisible:true});}
      const values=IND.rsi(bars.map(b=>b.close),14);this.rsiSeries.setData(bars.map((b,i)=>Number.isFinite(values[i])?{time:b.time,value:values[i]}:{time:b.time}));const range=this.chart.timeScale().getVisibleLogicalRange();if(range)this.rsiChart.timeScale().setVisibleLogicalRange(range);
    }
    this.host.querySelector('#trSeek').max=this.bars.length-1;this.host.querySelector('#trSeek').value=this.index;this.host.querySelector('#trPosition').textContent=`${this.index+1} / ${this.bars.length}`;this.barInfo(bars.at(-1));if(this.host.querySelector('#trFollow').checked)this.focus();
  },
  focus(){if(this.chart)this.chart.timeScale().setVisibleLogicalRange({from:Math.max(-3,this.index-80),to:this.index+6});},
  barInfo(b){this.host.querySelector('#trBarInfo').textContent=`${new Date(b.time*1000).toISOString()} · O ${this.fmt(b.open)} · H ${this.fmt(b.high)} · L ${this.fmt(b.low)} · C ${this.fmt(b.close)} · Volume ${this.fmt(b.volume,0)} (source units; MT5 may be tick volume) · Range ${this.fmt((b.high-b.low)/b.open*100,3)}%`;},
  jump(ms){if(!Number.isFinite(ms)||!this.bars.length)return;this.pause();const idx=this.bars.findIndex(b=>b.time<=ms/1000&&ms/1000<b.time+this.seconds());if(idx<0){this.host.querySelector('#trNotice').textContent='Requested time is outside available candles or in a session gap. Choose another timeframe / load history. No approximate entry has been substituted.';return;}this.index=idx;this.draw();this.focus();},
  step(n){this.pause();this.index=Math.max(0,Math.min(this.bars.length-1,this.index+n));this.draw();},
  play(){if(!this.bars.length)return;if(this.index>=this.bars.length-1)this.index=0;this.host.querySelector('#trPlay').textContent='Ⅱ Pause';this.timer=setInterval(()=>{if(this.index>=this.bars.length-1)return this.pause();this.index++;this.draw();},1000/Number(this.host.querySelector('#trSpeed').value));},
  pause(){clearInterval(this.timer);this.timer=null;this.host?.querySelector('#trPlay')&&(this.host.querySelector('#trPlay').textContent='▶ Play');},
  dispose(){this.resize?.disconnect();this.chart?.remove();this.rsiChart?.remove();this.chart=null;this.series=null;this.rsiChart=null;this.rsiSeries=null;},
  export(){
    const keys=['botName','sym','tf','dir','entryTime','exitTime','entry','exit','qty','lots','sl','tp','pnl','r','fees','slippage','mfe','mae','reason','score','touched','note'];
    const cell=v=>typeof v==='number'&&Number.isFinite(v)?String(v):'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const text=[keys.join(','),...this.rows.map(t=>keys.map(k=>cell(t[k])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='astra-filtered-trades.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};
document.addEventListener('DOMContentLoaded',()=>TradeReview.init());
