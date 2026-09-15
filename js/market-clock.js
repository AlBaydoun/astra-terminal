/* Read-only market observatory. Published schedules are planning estimates,
   never execution permission. No storage, order calls, or changes to bot gates.
   Sources verified 2026-09-14; US exchange calendar valid through 2028. */
const MarketClock = {
  source:'https://get.justmarkets.help/hc/en-us/articles/14206580923420-What-Are-the-Trading-Hours-on-JustMarkets',
  nyse:'https://www.nyse.com/trade/hours-calendars',
  // Share regions read from this MT5 catalogue (US Shares / EU Shares), 2026-09-14.
  // New, unclassified shares stay unmapped until their region is verified.
  us:new Set(["AAPL","AIG","AMZN","AXP","BA","BABA","BAC","C","CSCO","CVX","EBAY","F","FDX","GE","GM","GOOG","GS","HLT","HPQ","IBM","ILMN","INTC","JNJ","JPM","KO","MA","MCD","MSFT","NFLX","ORCL","PFE","PG","QCOM","RACE","T","TEVA","TSLA","V","XOM","SPCE","HOOD","UBER","SNAP","MRVL","SBUX","NKE","META","ABNB","ACB","ADBE","AFRM","APA","AZN","BG","BIDU","BKNG","BKR","BNTX","BSAC","CAT","CCL","CGC","CMCSA","COIN","CPRT","CRM","CRON","DBX","DELL","DIS","EQIX","ETSY","FOXA","GILD","GPRO","GRMN","GT","HOG","HON","HUM","LMT","LYFT","MCHP","MDLZ","MMM","MRNA","MS","NEM","PEP","PINS","PLTR","PM","PYPL","RL","RYAAY","SPOT","TEAM","TLRY","TM","TME","TMUS","TRIP","UPWK","VFC","VOD","VZ","WFC","WIX","WMT","WYNN","XRX","YELP","ZM","SHOP","JD","VFS","NVD","BHP","UAL","CAR","OXY","SPCX"]),
  eu:new Set('ADSGN AIRF ALVG BAYGN BMWG BNPP CBKG DANO DBKGN DPWGN EONGN IBE LHAG LVMH MAP SAN SIEGN SOGN TEF TOTF VOWG_P ACA ADP AFX AIR ALO BAS BOSS CDI CON HEN3 ITX MBG ML OR PIRC PUM REP RNO SW TUI1 UBI UCG'.split(' ')),
  holidays:{
    2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],
    2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],
    2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25']
  },
  early:new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']),
  profiles:[
    {id:'us',name:'Wall Street',sub:'NYSE · Nasdaq regular session',zone:'America/New_York',open:570,close:960,icon:'🇺🇸',color:'#5be8cf',calendar:true},
    {id:'eu',name:'European shares',sub:'JustMarkets · published share CFD hours',zone:'Europe/Helsinki',open:605,close:1108,icon:'🇪🇺',color:'#8d9dff'},
    {id:'fx',name:'Foreign exchange',sub:'JustMarkets · currency pairs',zone:'Europe/Helsinki',open:0,close:1440,icon:'💱',color:'#52c8ff'},
    {id:'metal',name:'Precious metals',sub:'JustMarkets · gold, silver & platinum',zone:'Europe/Helsinki',open:60,close:1437,icon:'◈',color:'#f8c873'},
    {id:'index',name:'Global indices',sub:'JustMarkets · index CFDs, not cash exchanges',zone:'Europe/Helsinki',open:60,close:1438,icon:'📈',color:'#b399ff'},
    {id:'energy',name:'Energy',sub:'JustMarkets · oil & natural gas',zone:'Europe/Helsinki',open:60,close:1438,icon:'🛢',color:'#fa9b78'},
    {id:'crypto',name:'Digital assets',sub:'JustMarkets · daily / weekend maintenance',zone:'Europe/Helsinki',open:0,close:1440,icon:'₿',color:'#f7b45c'},
    {id:'other',name:'Unmapped contracts',sub:'Individual MT5 specification required',zone:'UTC',icon:'◎',color:'#abb8c9'}
  ],
  base(s){return String(s).replace(/\.[a-z]{1,4}$/i,'').toUpperCase();},
  group(sym){
    const base=this.base(sym);if(this.eu.has(base))return 'eu';if(this.us.has(base))return 'us';
    let g=BROKER.costGroup(sym);if(g==='other')g=MarketFit.guessGroup(sym);
    return g==='stock'?'other':g;
  },
  formatters:new Map(), instants:new Map(),
  parts(ms,zone){if(!this.formatters.has(zone))this.formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));const p=Object.fromEntries(this.formatters.get(zone).formatToParts(ms).map(x=>[x.type,x.value]));return p;},
  // Convert wall time with IANA rules; a fixed UTC offset fails across DST.
  instant(day,minute,zone){
    const key=day+'|'+minute+'|'+zone;if(this.instants.has(key))return this.instants.get(key);
    const [y,m,d]=day.split('-').map(Number),wall=Date.UTC(y,m-1,d,0,minute);let guess=wall;
    for(let i=0;i<4;i++){const p=this.parts(guess,zone);const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);guess+=wall-shown;}
    if(this.instants.size>10000)this.instants.clear();this.instants.set(key,guess);return guess;
  },
  day(ms,zone){const p=this.parts(ms,zone);return `${p.year}-${p.month}-${p.day}`;},
  ranges(p,day,sym){
    const dow=new Date(day+'T12:00:00Z').getUTCDay(),base=this.base(sym||'');
    if(p.id==='other')return [];
    if(p.calendar){if(!this.holidays[day.slice(0,4)])return [];if(dow===0||dow===6||this.holidays[day.slice(0,4)]?.includes(day.slice(5)))return [];return [[p.open,this.early.has(day)?780:p.close]];}
    if(p.id==='crypto'){
      if(base==='BTCXAU')return dow===0||dow===6?[]:[[dow===1?2:1,1377]];
      const late=/^(BTCUSD|BTCEUR|BTCJPY|BCHUSD|ETHUSD|LTCUSD|XRPUSD)$/.test(base);
      if(base==='BTCGBP')return dow===6?[[5,775],[845,1440]]:dow===0?[[5,9],[19,1440]]:[[0,1440]];
      return dow===0?[[late?5:0,9],[19,1440]]:[[late?5:0,1440]];
    }
    if(dow===0||dow===6)return [];
    let a=p.open,b=p.close;
    if(p.id==='fx'&&dow===5)b=1438;
    if(p.id==='energy'&&base==='BRENT')a=180;
    if(p.id==='index'&&base==='ES35'){a=540;b=1258;}
    if(p.id==='metal'&&base==='XAUUSD'){a=dow===1?61:0;b=1438;}
    return [[a,b]];
  },
  status(p,now=Date.now(),sym=''){
    const day=this.day(now,p.zone);
    if(p.id==='other'||(p.calendar&&!this.holidays[day.slice(0,4)]))return {label:'Schedule unverified',open:false,next:null};
    const sessions=[];const origin=Date.parse(day+'T12:00:00Z');
    for(let i=0;i<12;i++){const d=new Date(origin+i*86400000).toISOString().slice(0,10);for(const [a,b]of this.ranges(p,d,sym))sessions.push({start:this.instant(d,a,p.zone),end:this.instant(d,b,p.zone)});}
    // Join adjacent days (FX), so midnight is not presented as a market close.
    const joined=[];for(const s of sessions){const last=joined.at(-1);if(last&&last.end===s.start)last.end=s.end;else joined.push({...s});}
    const current=joined.find(s=>s.start<=now&&now<s.end),next=joined.find(s=>s.start>now);
    const holiday=p.calendar&&this.holidays[day.slice(0,4)].includes(day.slice(5));
    if(current)return {open:true,label:p.calendar?'Regular session open':'Within standard hours',next:current.end,start:current.start,end:current.end};
    return {open:false,label:holiday?'Exchange holiday':'Outside standard hours',next:next?.start,start:next?.start,end:next?.end};
  },
  duration(ms){const s=Math.max(0,Math.ceil(ms/1000));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');},
  local(ms){return ms?new Date(ms).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Unavailable';},
  skyline(){return '<svg class="mcSkyline" viewBox="0 0 600 130" aria-hidden="true"><path d="M0 120H35V75H65V120H90V45H120V120H145V65H175V120H200V28H215V5H218V28H235V120H260V80H285V120H310V54H350V120H375V34H410V120H435V68H465V120H490V20H520V120H550V82H580V120H600"/><path class="mcPulseLine" d="M0 100H60L100 84L142 90L188 48L225 62L279 39L320 56L365 27L408 43L458 22L495 45L542 12L600 28"/></svg>';},
  init(){
    document.getElementById('marketClockBtn')?.addEventListener('click',()=>this.show());
    const dialog=document.createElement('dialog');dialog.id='marketObservatory';dialog.className='obsDialog';
    dialog.innerHTML=`<div class="obsHead"><div><small>ASTRA / GLOBAL MARKET OBSERVATORY</small><h1>Follow the <em>market pulse.</em></h1><p>Every session. Every countdown. Your broker’s instruments.</p></div><button data-close aria-label="Close market clock">✕</button></div><div class="mcHero">${this.skyline()}<div class="mcOrbit">◎</div><div><small>YOUR LOCAL TIME</small><strong id="mcNow"></strong><span id="mcZone"></span></div><p>Session clocks are planning information. Live quotes and broker rules still decide whether an order is possible.</p></div><div class="obsToolbar"><label>Find a market or instrument<input id="mcSearch" type="search" placeholder="Apple, EURUSD, US100, energy…"></label><label>Show<select id="mcFilter"><option value="all">All sessions</option><option value="open">Within standard hours</option><option value="closed">Outside standard hours</option></select></label><button id="mcMotion" aria-pressed="false">Ⅱ Pause motion</button><button id="mcDiagnostics">⌕ US stock bot activity</button></div><div id="mcCards" class="mcGrid"></div><section id="mcAudit" class="obsBox" hidden></section><footer class="obsFoot">US exchange holidays / early closes: 2026–2028. Broker schedules are published weekly estimates; special holidays, halts and maintenance can override them. Broker server-time estimates use Eastern European daylight-saving rules. Individual MT5 specifications take precedence. <a href="${this.source}" target="_blank" rel="noopener">JustMarkets hours ↗</a> · <a href="${this.nyse}" target="_blank" rel="noopener">NYSE calendar ↗</a> · Verified 14 Sep 2026.</footer>`;
    document.body.append(dialog);this.host=dialog;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearInterval(this.timer);const b=document.getElementById('marketClockBtn');b?.setAttribute('aria-expanded','false');b?.classList.remove('active');});
    dialog.querySelector('#mcSearch').oninput=()=>this.render();dialog.querySelector('#mcFilter').onchange=()=>this.render();
    dialog.querySelector('#mcMotion').onclick=e=>{const paused=dialog.classList.toggle('obsStill');e.target.textContent=paused?'▶ Resume motion':'Ⅱ Pause motion';e.target.setAttribute('aria-pressed',paused);};
    dialog.querySelector('#mcDiagnostics').onclick=()=>{this.audit();dialog.querySelector('#mcAudit').scrollIntoView({block:'start',behavior:'smooth'});};
    dialog.addEventListener('toggle',()=>this.tick(),true);
    dialog.addEventListener('click',e=>{const b=e.target.closest('[data-mc-pair]');if(b){dialog.close();WorkspaceUI.openChart(b.dataset.mcPair);}});
  },
  show(){this.host.showModal();const b=document.getElementById('marketClockBtn');b?.setAttribute('aria-expanded','true');b?.classList.add('active');this.render();this.tick();clearInterval(this.timer);this.timer=setInterval(()=>this.tick(),1000);},
  tick(){
    if(!this.host.open)return;const now=Date.now();if(this.nextRefresh&&now>=this.nextRefresh){this.render();return;}this.host.querySelector('#mcNow').textContent=new Date(now).toLocaleTimeString();this.host.querySelector('#mcZone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;
    for(const el of this.host.querySelectorAll('[data-mc-clock]')){const p=this.profiles.find(p=>p.id===el.dataset.mcClock),s=this.status(p,now,el.dataset.sym);el.querySelector('.mcCountdown').textContent=s.next?this.duration(s.next-now):'—';el.querySelector('.mcState').textContent=s.label;el.querySelector('.mcUntil').textContent=s.next?(s.open?'Closes in':'Opens in'):'Check MT5 specification';el.classList.toggle('mcOpen',s.open);el.querySelector('.mcNext').textContent=s.next?this.local(s.next):'Schedule unavailable';if(s.next)this.nextRefresh=Math.min(this.nextRefresh,s.next);}
    for(const el of this.host.querySelectorAll('details[open] [data-mc-instrument]')){const p=this.profiles.find(p=>p.id===el.dataset.group),s=this.status(p,now,el.dataset.mcInstrument);el.textContent=s.next?(s.open?'Closes in ':'Opens in ')+this.duration(s.next-now):'Schedule unverified';}
  },
  render(){
    this.nextRefresh=Date.now()+60000;const expanded=[...this.host.querySelectorAll('[data-mc-clock]')].filter(el=>el.querySelector('details')?.open).map(el=>el.dataset.mcClock);
    const q=this.host.querySelector('#mcSearch').value.trim().toLowerCase(),filter=this.host.querySelector('#mcFilter').value,syms=MarketSources.brokerList();
    const html=this.profiles.map(p=>{
      const all=syms.filter(s=>this.group(s)===p.id),matches=all.filter(s=>(s+' '+(MK.names[s]||'')).toLowerCase().includes(q));
      if(q&&!matches.length&&!(p.name+' '+p.sub).toLowerCase().includes(q))return '';
      const shown=q&&matches.length?matches:all;
      const s=this.status(p,Date.now(),shown[0]);if(filter==='open'&&!s.open||filter==='closed'&&s.open)return '';
      return `<article class="mcCard" style="--mc-accent:${p.color}" data-mc-clock="${p.id}" data-sym="${esc(shown[0]||'')}"><header><span class="mcEmblem">${p.icon}</span><span class="mcState"></span></header><h2>${p.name}</h2><p>${p.sub}</p><p class="mcReference">Countdown reference: ${esc(shown[0]||"standard session")}</p><div class="mcDial"><span class="mcUntil"></span><strong class="mcCountdown"></strong><small class="mcNext"></small></div><div class="mcRail"><i></i></div><p class="mcHours">${p.id==='us'?'09:30–16:00 New York · broker’s published share close is 2 minutes earlier':p.id==='other'?'No generic hours assigned':String(Math.floor(p.open/60)).padStart(2,'0')+':'+String(p.open%60).padStart(2,'0')+'–'+String(Math.floor(p.close/60)).padStart(2,'0')+':'+String(p.close%60).padStart(2,'0')+' broker server time · standard profile'}<br>${p.id==='us'?'US index CFDs have their own card below.': 'Exact instruments and exceptions below.'}</p><details><summary>${shown.length} instrument${shown.length===1?'':'s'} · expand to explore</summary><div class="mcPairs">${shown.map(sym=>{const ss=this.status(p,Date.now(),sym);return `<div><button data-mc-pair="${esc(sym)}">${esc(sym)} ↗</button><small>${Feed.isLive(sym)?'● Fresh quote':'○ No fresh quote'} · ${p.id==='us'?'Exchange reference':ss.label}<br>${ss.next?(ss.open?'Close ':'Open ')+this.local(ss.next):'Schedule unverified'}</small><small data-mc-instrument="${esc(sym)}" data-group="${p.id}"></small></div>`;}).join('')||'<p>Connect MT5 to list account instruments.</p>'}</div></details></article>`;
    }).join('');this.host.querySelector('#mcCards').innerHTML=html||'<p class="obsBox">No matching markets. Try another search.</p>';for(const id of expanded){const el=this.host.querySelector('[data-mc-clock="'+id+'"] details');if(el)el.open=true;}this.tick();
  },
  audit(){
    const day=new Date().toDateString(),us=new Set(MarketSources.brokerList().filter(s=>this.group(s)==='us').map(s=>Feed.brokerName(s))),rows=[];
    for(const b of BOTS.filter(b=>!Bots.isPage(b)||b.id==='confluence')){
      const L=Bots.ledgers[b.id];if(!L)continue;const cfg=Bots.cfg(b.id)||{},trades=[...(L.closed||[]),...(L.open||[])].filter(t=>us.has(Feed.brokerName(t.sym))&&new Date(t.entryTime).toDateString()===day);
      const decisions=(L.decisions||[]).filter(d=>new Date(d.t).toDateString()===day&&us.has(Feed.brokerName(d.sym||'')));
      const allowed=b.manual?[]:Bots.allowed(b).filter(s=>us.has(Feed.brokerName(s)));
      rows.push({name:WorkspaceUI.name(b),disabled:Bots.disabled(b.id),paused:!!cfg.paused,locked:Number.isFinite(L.equity)&&L.equity<BotEngine.rules(cfg).minEquity,allowed:allowed.length,trades:trades.length,decisions,groups:b.manual?'Manual ticket / separate automation':b.id==='confluence'?'Own full-catalogue scanner':cfg.groups?.join(', ')||'Default groups (shares excluded)',mode:cfg.marketMode||'manual',equity:L.equity,lock:L.lockedUntil,open:(L.open||[]).length});
    }
    const notes=rows.flatMap(b=>b.decisions.map(d=>({...d,bot:b.name}))).sort((a,b)=>b.t-a.t).slice(0,60),h=this.host.querySelector('#mcAudit');h.hidden=false;
    h.innerHTML=`<h2>⌕ US stocks · today’s evidence</h2><p>${esc(day)} · local day · ${us.size} US share contracts · ${rows.reduce((a,b)=>a+b.trades,0)} paper entries recorded today. Disabled bots are included. This is a snapshot; press the activity button to refresh.</p><p>Standard bots exclude shares by default. Confluence and manual automatic entries have separate scanners. Current eligibility is not proof of what was enabled earlier today. Decision logs are bounded; missing records do not prove that no scan happened.</p><div class="obsTableScroll"><table><thead><tr><th>Bot</th><th>State now</th><th>US eligible now*</th><th>Entries today</th><th>Paper equity</th><th>Open positions</th><th>Saved scope</th></tr></thead><tbody>${rows.map(b=>`<tr><td>${esc(b.name)}</td><td>${b.disabled?'Disabled':b.paused?'Paused':b.locked?'Paper funds below minimum':'Enabled'}</td><td>${b.allowed}</td><td>${b.trades}</td><td>${Number(b.equity).toFixed(2)}</td><td>${b.open}</td><td>${esc(b.mode+' · '+b.groups)}</td></tr>`).join('')}</tbody></table></div><p>*Standard bot filter, including fresh quotes. Confluence: scanner ${ConfluenceBot.config().scannerOn?'on':'off'}, ${ConfluenceScanner.rows.filter(r=>us.has(r.sym)).length} US rows in the latest scan. Manual automatic entries: ${ManualAuto.running?'running':'stopped'}.</p><h3>Latest saved US decisions</h3>${notes.map(d=>`<p><time>${new Date(d.t).toLocaleTimeString()}</time> · ${esc(d.bot)} · ${esc(d.sym)} · ${esc(d.kind)} — ${esc(d.text)}</p>`).join('')||'<p>No US-specific decisions remain in the saved log for today.</p>'}<h3>Latest Confluence scan · US shares</h3><p>Scanner on does not mean the Confluence entry bot is running. The frozen strategy only considers its configured session window; outside it, waiting is expected.</p><div class="obsTableScroll"><table><thead><tr><th>Pair</th><th>Status</th><th>Reason</th></tr></thead><tbody>${ConfluenceScanner.rows.filter(r=>us.has(r.sym)).map(r=>`<tr><td>${esc(r.sym)}</td><td>${esc(r.status)}</td><td>${esc(r.why)}</td></tr>`).join('')}</tbody></table></div>`;
  }
};
document.addEventListener('DOMContentLoaded',()=>MarketClock.init());
