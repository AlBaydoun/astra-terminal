/* Market briefing: read-only headline relevance, never a trading signal.
   Kept separate from Intel so adding sources cannot change any bot's inputs. */
const MarketNews = {
  data:null,busy:false,error:'',filter:'all',query:'',muted:false,seen:new Set(),started:false,
  icons:{bolt:'M13 2 3 14h8l-1 8 11-13h-8l1-7Z',bank:'m3 9 9-6 9 6M4 10h16M6 10v9m6-9v9m6-9v9M3 21h18',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',chart:'M4 3v17h17M7 14l4-5 4 3 5-7',oil:'M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4',arrow:'M5 12h14m-6-6 6 6-6 6',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'},
  icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+this.icons[name]+'"/></svg>';},
  classify(n){
    const t=n.title.toLowerCase(),tags=new Set(),notes=[];let impact=1,icon='globe',topic='Market watch';
    const add=(level,label,glyph,markets,why)=>{impact=Math.max(impact,level);if(notes.length===0){topic=label;icon=glyph;}markets.forEach(x=>tags.add(x));notes.push(why);};
    const central=/\b(fomc|federal reserve|fed|ecb|central banks?|bank of england|bank of japan|boj|boe|lagarde|powell)\b/.test(t);
    if(/\b(fomc|monetary policy|rate decision)\b/.test(t)||(central&&/\b(rates?|inflation|policy)\b/.test(t)))add(3,'Central banks','bank',['FX','Gold','Indices'],'Policy surprises can reprice currencies, bond yields and gold. Compare the decision with expectations.');
    else if(/\b(interest rates?|mortgage rates?)\b/.test(t))add(2,'Rates & borrowing','bank',['FX','Indices'],'Borrowing costs can influence households, businesses and valuations. A lending story does not necessarily announce a central-bank decision.');
    if(/\b(inflation|cpi|pce|nonfarm|non-farm|payrolls|jobs report|employment situation|gdp|recession)\b/.test(t))add(3,'Economic data','chart',['FX','Gold','Indices'],'Growth and inflation news can change rate expectations. The surprise versus forecasts matters more than the headline alone.');
    if(/\b(war|invasion|tariffs?|sanctions|hormuz|ceasefire)\b|\bmissile (attack|strike|launch)|\b(attack|strike).{0,30}\bmissile/.test(t))add(3,'Global risk','globe',['Energy','Gold','FX','Indices'],'Geopolitical developments can disrupt supply and shift demand for safe havens; reactions can reverse quickly.');
    if(/\b(oil|opec|crude|petroleum|natural gas|inventor(?:y|ies)|refiner(?:y|ies))\b/.test(t)||n.sourceId==='energy')add(2,'Energy & supply','oil',['Energy'],'Supply, inventories and demand can affect oil and gas. Check whether the report describes a new change or historical data.');
    if(/\b(gold|silver|bullion|platinum|precious metals)\b/.test(t))add(2,'Precious metals','globe',['Gold'],'Metals respond to currency moves, real yields and demand for safe havens. Check the quoted market and timing.');
    if(/\b(dollar|euro|yen|sterling|forex|currencies|currency markets)\b/.test(t))add(2,'Currencies','globe',['FX'],'Currency news can affect related broker pairs. Compare both currencies and check whether the move has already happened.');
    if(/\b(earnings|stocks?|shares?|equities|s&p|nasdaq|dow|wall street|startup|merger|acquisition)\b/.test(t))add(2,'Equity markets','chart',['Indices','Stocks'],'Earnings and changes in market expectations can move individual shares and the indices that hold them.');
    if(/\b(bitcoin|ethereum|crypto|stablecoin)\b/.test(t))add(2,'Digital assets','bolt',['Crypto'],'Regulation, fund flows and liquidity can affect broker-listed crypto markets.');
    if(!notes.length&&(n.sourceId==='fed'||n.sourceId==='ecb'))add(1,'Central-bank release','bank',['FX','Indices'],'Official release. Open the source to distinguish monetary policy from routine banking or administrative announcements.');
    // US equity relevance is explicit; a generic European shares story is not US news.
    if(/\b(wall street|nasdaq|dow(?: jones)?|nyse|s&p|u\.s\. stocks|us stocks|u\.s\. equities|american stocks|apple|nvidia|tesla|microsoft|amazon|alphabet|meta platforms|jpmorgan|goldman sachs)\b/.test(t)||(tags.has('Indices')&&/\b(fomc|federal reserve|fed|powell|nonfarm|non-farm|payrolls)\b/.test(t)))tags.add('US stocks');
    if(!tags.size)tags.add('Global');
    return {...n,impact,topic,icon,tags:[...tags],why:notes[0]||'Read the original report for its timing and the markets involved. A headline alone does not establish a trade direction.'};
  },
  feedFresh(n,now=Date.now()){return !this.error&&!n.stale&&n.fetchedAt>0&&n.fetchedAt<=now&&now-n.fetchedAt<20*60000;},
  fresh(n,now=Date.now()){return this.feedFresh(n,now)&&n.publishedAt>0&&n.publishedAt<=now&&now-n.publishedAt<86400000;},
  ranked(){return (this.data?.items||[]).map(n=>this.classify(n)).sort((a,b)=>Number(this.fresh(b))-Number(this.fresh(a))||b.impact-a.impact||(b.publishedAt||0)-(a.publishedAt||0));},
  time(t){if(!t)return 'Publication time unavailable';const mins=Math.floor((Date.now()-t)/60000);return mins<0?'Publication time ahead of local clock':mins<1?'Just published':mins<60?mins+'m ago':mins<1440?Math.floor(mins/60)+'h ago':Math.floor(mins/1440)+'d ago';},
  safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}},
  show(){
    if(!this.opened&&!new URLSearchParams(location.search).has('panel')){
      document.getElementById('bot-news').classList.add('mnExpanded');
      const button=document.getElementById('mnExpand');button.setAttribute('aria-pressed','true');button.textContent='⛶ Restore';
    }
    this.opened=true;this.render();
  },
  init(){
    const host=document.getElementById('bot-news');if(!host)return;
    host.innerHTML=`<div class="mnShell">
      <header class="mnHeader"><div><div class="mnEyebrow">${this.icon('globe')} ASTRA MARKET BRIEFING</div><h1>News <span>& alerts</span></h1><p>The stories to read. The markets to watch.</p></div><div class="mnActions"><button id="mnMute" aria-pressed="false" title="Mute news pop-ups in this window until it is reloaded">${this.icon('bell')} Alerts on</button><button id="mnRefresh">↻ Refresh</button><button id="mnExpand" aria-pressed="false">⛶ Expand</button></div></header>
      <div id="mnStatus" role="status" class="mnStatus">Connecting to news sources…</div>
      <div id="mnMetrics" class="mnMetrics"></div>
      <div class="mnToolbar"><div id="mnFilters" aria-label="Filter market news">${['all','important','FX','Gold','Energy','Indices','Stocks','US stocks','Crypto'].map((x,i)=>`<button data-filter="${x}" class="${i?'':'on'}" aria-pressed="${!i}">${x==='all'?'All markets':x==='important'?'⚡ High impact':x}</button>`).join('')}</div><label class="mnSearch">${this.icon('search')}<input id="mnSearch" type="search" placeholder="Search headlines…" aria-label="Search news headlines"></label></div>
      <section id="mnUsDesk" class="mnUsDesk"></section><div class="mnColumns"><main><div class="mnSectionTitle"><h2>In focus</h2><span id="mnCount"></span></div><div id="mnStories"></div></main><aside><div class="mnSectionTitle"><h2>${this.icon('bell')} Alert desk</h2><span>Last 24h</span></div><div id="mnAlerts"></div><div class="mnSourceBox"><h3>Source health</h3><div id="mnSources"></div></div><p class="mnFootnote">Impact is ASTRA’s headline-based relevance estimate. It does not predict direction or guarantee a market move. RSS can be delayed; open the source for full context.</p></aside></div>
    </div>`;
    host.querySelector('#mnFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;this.filter=b.dataset.filter;host.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});this.render();});
    host.querySelector('#mnSearch').addEventListener('input',e=>{this.query=e.target.value;this.render();});
    host.addEventListener('click',e=>{if(e.target.closest('[data-us-clock]'))MarketClock.show();});
    host.querySelector('#mnRefresh').addEventListener('click',()=>this.refresh());
    host.querySelector('#mnMute').addEventListener('click',e=>{this.muted=!this.muted;const b=e.currentTarget;b.innerHTML=this.icon('bell')+(this.muted?'Alerts muted':'Alerts on');b.setAttribute('aria-pressed',String(this.muted));});
    host.querySelector('#mnExpand').addEventListener('click',()=>{const on=host.classList.toggle('mnExpanded');host.querySelector('#mnExpand').setAttribute('aria-pressed',String(on));host.querySelector('#mnExpand').textContent=on?'⛶ Restore':'⛶ Expand';});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&host.classList.contains('mnExpanded'))host.querySelector('#mnExpand').click();});
    this.refresh();this.timer=setInterval(()=>this.refresh(),5*60000);this.ageTimer=setInterval(()=>this.render(),60000);
  },
  async refresh(){
    if(this.busy)return;this.busy=true;
    const button=document.getElementById('mnRefresh');if(button){button.disabled=true;button.textContent='↻ Updating…';}
    try{
      const r=await fetch('/api/news',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('News service returned '+r.status);
      const data=await r.json();if(!Array.isArray(data.items)||!Array.isArray(data.sources))throw Error('News response is incomplete');
      this.error='';this.data=data;
      const important=this.ranked().filter(n=>n.impact===3&&this.fresh(n));
      const added=important.filter(n=>!this.seen.has(n.url));
      important.forEach(n=>this.seen.add(n.url));
      if(this.started&&!this.muted&&added.length)toast('News alert: '+added.length+' new high-impact headline'+(added.length===1?'':'s')+' — open News & alerts','info');
      if(this.seen.size>1000)this.seen=new Set(important.map(n=>n.url));
      if(data.sources.some(s=>s.status==='ok'))this.started=true;
    }catch(e){this.error=e.message;console.warn('ASTRA market news:',e.message);}
    finally{this.busy=false;if(button){button.disabled=false;button.textContent='↻ Refresh';}this.render();}
  },
  card(n,i){
    const url=this.safeUrl(n.url),fresh=this.fresh(n),label=n.impact===3?'HIGH POTENTIAL IMPACT':n.impact===2?'MARKET WATCH':'CONTEXT';
    return `<article class="mnCard ${i===0?'mnLead':''}"><div class="mnCardTop"><span class="mnTopic">${this.icon(n.icon)} ${esc(n.topic)}</span><span class="mnImpact level${n.impact}">${label}</span></div><h3>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)} ${this.icon('arrow')}</a>`:esc(n.title)}</h3><div class="mnMeta"><b>${esc(n.source)}</b><time title="${n.publishedAt?esc(new Date(n.publishedAt).toLocaleString()):''}">${esc(this.time(n.publishedAt))}</time>${!fresh?'<span class="mnArchive">'+(!this.feedFresh(n)?'Cached · update unavailable':!n.publishedAt||n.publishedAt>Date.now()?'Time unverified':'Earlier report')+'</span>':''}</div><div class="mnWhy"><span>WHY IT MATTERS</span><p>${esc(n.why)}</p></div><div class="mnTags">${n.tags.map(t=>'<span>'+esc(t)+'</span>').join('')}</div></article>`;
  },
  render(){
    const host=document.getElementById('bot-news');if(!host)return;
    const all=this.ranked(),important=all.filter(n=>n.impact===3&&this.fresh(n)),sources=this.data?.sources||[];
    const ok=sources.filter(s=>s.status==='ok'&&this.feedFresh(s)).length;
    const status=document.getElementById('mnStatus');status.classList.toggle('mnWarning',!!this.error||ok<sources.length);
    status.textContent=this.error?'News update unavailable. '+(all.length?'Showing earlier headlines with their original times.':'Use Refresh to try again.'):(this.data?`${ok}/${sources.length} sources available · Checked ${new Date(this.data.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · Refreshes every 5 minutes${ok<sources.length?' · Some feeds unavailable; see source health.':''}`:'Connecting to news sources…');
    document.getElementById('mnMetrics').innerHTML=`<div><span class="mnMetricIcon">${this.icon('bolt')}</span><b>${important.length}</b><span>High-impact headlines<small>Fresh reports · last 24h</small></span></div><div><span class="mnMetricIcon">${this.icon('globe')}</span><b>${all.length}</b><span>Stories in briefing<small>Up to 7 days of context</small></span></div><div><span class="mnMetricIcon">${this.icon('bank')}</span><b>${ok}<em>/${sources.length||5}</em></b><span>Sources available<small>Markets + official releases</small></span></div>`;
    const us=all.filter(n=>n.tags.includes('US stocks')),recentUs=us.filter(n=>this.fresh(n));
    const usDesk=document.getElementById('mnUsDesk');
    if(usDesk)usDesk.innerHTML='<div><small>🇺🇸 WALL STREET WATCH</small><h2>US stocks & index catalysts</h2><p>Earnings, Fed decisions and major company headlines from the briefing sources.</p><button data-us-clock>◷ US session & bot activity</button></div><div>'+ (recentUs.length?recentUs.slice(0,3).map(n=>'<a href="'+esc(this.safeUrl(n.url))+'" target="_blank" rel="noopener noreferrer"><b>'+esc(n.title)+'</b><small>'+esc(n.source)+' · '+esc(this.time(n.publishedAt))+' · '+(n.impact===3?'High potential impact':'Market watch')+'</small></a>').join(''):'<p>No fresh US-specific headline available. This does not mean there is no market news. Check source health below.</p>')+'</div>';
    const q=this.query.trim().toLowerCase(),shown=all.filter(n=>(this.filter==='all'||(this.filter==='important'?n.impact===3&&this.fresh(n):n.tags.includes(this.filter)))&&(!q||[n.title,n.source,n.topic,...n.tags].join(' ').toLowerCase().includes(q))).slice(0,60);
    document.getElementById('mnCount').textContent=shown.length+' headlines';
    document.getElementById('mnStories').innerHTML=shown.length?shown.map((n,i)=>this.card(n,i)).join(''):`<div class="mnEmpty">${this.icon('search')}<h3>${this.data?'No matching headlines':'Your briefing is loading'}</h3><p>${this.data?'Try another market or clear the search. Source availability appears on the right.':'Fetching market headlines and official releases.'}</p></div>`;
    document.getElementById('mnAlerts').innerHTML=important.length?important.slice(0,6).map(n=>`<a class="mnAlert" href="${esc(this.safeUrl(n.url))}" target="_blank" rel="noopener noreferrer"><span class="mnAlertDot"></span><div><small>${esc(n.topic)} · ${esc(this.time(n.publishedAt))}</small><strong>${esc(n.title)}</strong><span>${esc(n.tags.join(' · '))}</span></div></a>`).join(''):'<div class="mnQuiet">'+this.icon('bell')+'<b>No fresh high-impact headlines</b><p>'+(!ok?'News feeds are unavailable; this is not an all-clear.':'New high-impact reports will appear here. Quiet headlines do not mean a quiet market.')+'</p></div>';
    document.getElementById('mnSources').innerHTML=sources.map(s=>`<div class="mnSource"><span class="mnDot ${s.status==='ok'&&this.feedFresh(s)?'good':''}"></span><div><a href="${esc(this.safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a><small>${!this.feedFresh(s)?'Update unavailable':s.status==='ok'?'Checked · '+s.count+' recent stories':s.status==='cached'?'Using earlier headlines':'Unavailable'}${s.fetchedAt?' · fetched '+new Date(s.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</small></div></div>`).join('')||'<p class="mnFootnote">Waiting for source status…</p>';
    const badge=document.getElementById('mnBadge');if(badge){badge.textContent=important.length||'';badge.hidden=!important.length;}
  },
};
