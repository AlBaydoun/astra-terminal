/* ASTRA — presentation and navigation only. No order, ledger or setting writes.
   Search/expansion live in this window; all trading actions keep their existing handlers. */
const WorkspaceUI = {
  query: '',
  opened: false,
  pendingWindows:new Map(),
  paths: {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bot: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M1 12h3m16 0h3M8 16h8M8 11v1m8-1v1"/>',
    chart: '<path d="M3 3v18h18M7 14l4-5 4 3 6-8"/>',
    positions: '<path d="M4 7h16M4 17h16M8 3L4 7l4 4m8 2l4 4-4 4"/>',
    scanner: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l7-7M12 3v2M3 12h2M12 19v2M19 12h2"/>',
    manual: '<path d="M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zM15 8h2m-2 4h2M7 16h10"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    report: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 17v-3m4 3v-6m4 6v-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    exit: '<path d="M9 4H4v16h5m5-13l5 5-5 5M8 12h12"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 00-10 0v5zM10 21h4"/>',
    layers: '<path d="M12 3l10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  },
  icon(name){
    return '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (this.paths[name] || this.paths.bot) + '</svg>';
  },
  name(b){ return b.name.replace(/^[▦★◎●◈]\s*/, ''); },
  group(b){
    if (b.dash || b.trades || b.report || b.analysis) return 'Overview';
    if (b.manual || b.liveManual || b.id === 'confluence') return 'Trading desk';
    if (b.scan || b.confluenceScanner || b.fit || b.brain) return 'Scanners & research';
    if (b.live || b.id === 'permissions' || b.id === 'botsettings') return 'Settings & safety';
    return 'Strategy bots'; // Every future registry entry remains reachable.
  },
  botIcon(b){
    return b.dash ? 'dashboard' : b.trades ? 'positions' : b.manual ? 'manual'
      : b.scan || b.confluenceScanner ? 'scanner' : b.explorer ? 'layers' : b.report || b.fit || b.analysis ? 'report'
      : b.live || b.id === 'permissions' ? 'shield' : b.id === 'botsettings' ? 'manual' : 'bot';
  },
  nav(active){
    const entries = BOTS.filter(b => !Bots.disabled(b.id)).concat({id:'permissions', name:'Instrument permissions'}, {id:'botsettings', name:'Bots on / off'});
    return `<div class="wsNavTop"><span class="wsEyebrow">YOUR WORKSPACE</span>
      <label class="wsSearch">${this.icon('search')}<input id="wsBotSearch" type="search" aria-label="Search bots and pages" placeholder="Find a bot or page…" value="${esc(this.query)}" autocomplete="off"></label></div>
      <div class="wsNavGroups">` + ['Overview','Trading desk','Scanners & research','Strategy bots','Settings & safety'].map(group =>
      `<section class="wsNavGroup" data-ws-group="${esc(group)}"><h3>${esc(group)}</h3>` + (() => {
        const members = Bots.ordered(entries.filter(b => this.group(b) === group));
        const ids = members.map(b => b.id).join(',');
        return members.map((b, i) =>
        `<div class="wsNavItem"><button data-bot="${esc(b.id)}" data-ws-search="${esc((this.name(b)+' '+group).toLowerCase())}" class="${b.id === active ? 'active' : ''}"${b.id === active ? ' aria-current="page"' : ''}>
        ${this.icon(this.botIcon(b))}<span>${esc(this.name(b))}</span>${b.live ? '<small class="wsReal">REAL</small>' : ''}</button>` +
        `<button type="button" class="wsGuide" data-guide="${esc(b.id)}" title="How it works">?</button>` +
        `<span class="wsMove"><button type="button" data-mv="-1" data-mvid="${esc(b.id)}" data-mvgroup="${esc(ids)}" title="Move up"${i === 0 ? ' disabled' : ''}>▲</button>` +
        `<button type="button" data-mv="1" data-mvid="${esc(b.id)}" data-mvgroup="${esc(ids)}" title="Move down"${i === members.length - 1 ? ' disabled' : ''}>▼</button></span></div>`).join('');
      })() + '</section>').join('') +
      '<p class="wsNoResults" hidden>No matching bot or page. Clear the search to see everything.</p></div>';
  },
  bindNav(nav){
    nav.querySelector('#wsBotSearch').addEventListener('input', e => { this.query = e.target.value; this.filterNav(nav); });
    nav.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      Bots.moveBot(b.dataset.mvid, +b.dataset.mv, b.dataset.mvgroup.split(','));
    }));
    this.filterNav(nav);
  },
  filterNav(nav){
    const q = this.query.trim().toLowerCase();
    nav.querySelectorAll('[data-bot]').forEach(b => { b.hidden = !b.dataset.wsSearch.includes(q); });
    nav.querySelectorAll('.wsNavItem').forEach(it => { it.hidden = !!it.querySelector('[data-bot][hidden]'); });
    nav.querySelectorAll('.wsNavGroup').forEach(g => { g.hidden = !g.querySelector('[data-bot]:not([hidden])'); });
    nav.querySelector('.wsNoResults').hidden = !!nav.querySelector('[data-bot]:not([hidden])');
  },
  sync(active){
    document.querySelectorAll('#botNav [data-bot], [data-ws-bot]').forEach(el => {
      const on = (el.dataset.bot || el.dataset.wsBot) === active;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  },
  openBot(id){
    if (id !== 'permissions' && id !== 'botsettings' && !BOT_BY_ID[id]) return;
    // Use the normal render route, including its manual-ticket draft handling.
    Bots.active = id;
    const tab = document.querySelector('#botTabs [data-tab="bots"]');
    /* clicking an already-active tab cycles its size, so only click it to
       switch TO the Bots tab; otherwise render in place and make sure the
       panel is open */
    if (tab && !tab.classList.contains('active')) tab.click();
    else {
      const bp = document.getElementById('bottomPanel');
      if (bp && bp.classList.contains('collapsed')) bp.classList.remove('collapsed');
      Bots.render();
    }
    this.sync(id);
    document.getElementById('botBody').scrollTop = 0;
  },
  expand(on){
    document.getElementById('bot-bots')?.classList.toggle('wsExpanded', on);
    const btn = document.getElementById('wsExpand');
    if (btn){ btn.setAttribute('aria-pressed', String(on)); btn.innerHTML = this.icon('expand') + (on ? 'Restore' : 'Expand'); }
  },
  pair(sym,label){
    return `<button type="button" class="pairLink" data-pair-chart="${esc(sym)}" title="Open ${esc(sym)} chart">${esc(label ?? baseAsset(sym))} ↗</button>`;
  },
  openChart(sym){
    if(sym) App.setSymbol(sym);
    if(document.documentElement.dataset.panel && document.documentElement.dataset.panel!=='chart'){
      const w=Popout.open('chart');
      if(w){const message={type:'astra-chart',sym:STORE.symbol};this.pendingWindows.set(w,message);w.postMessage(message,location.origin);}
      return;
    }
    this.expand(false);
    document.getElementById('bottomPanel')?.classList.add('collapsed');
    document.getElementById('chartGrid')?.scrollIntoView({block:'nearest'});
  },
  openManual(sym,dir,tf=STORE.tf){
    if(!sym)return toast('Choose a chart instrument first.','info');
    if(document.documentElement.dataset.panel && document.documentElement.dataset.panel!=='bots'){
      const w=Popout.open('bots');
      const message={type:'astra-ticket',sym,dir,tf};
      if(w){this.pendingWindows.set(w,message);w.postMessage(message,location.origin);}
      return;
    }
    this.openBot('manual');this.expand(true);
    document.getElementById('bottomPanel')?.classList.remove('collapsed');
    const picker=document.getElementById('mbSym');
    // Prices and lot sizes from another contract must never carry into this ticket.
    if(picker.dataset.val!==sym){
      for(const id of ['mbAmt','mbQty','mbSl','mbTp','mbEntry','mbNote'])document.getElementById(id).value='';
      document.getElementById('mbPct').value=0;
    }
    picker.dataset.val=sym;picker.innerHTML=esc(baseAsset(sym))+' <i>▾</i>';
    document.getElementById('mbTf').value=tf;
    document.getElementById('mbOrderType').value='market';
    document.querySelector('[data-mbside="'+dir+'"]').click();
    Bots.manualCalc();document.getElementById('mbSl').focus();
  },
  init(){
    const wrap = document.querySelector('.botsWrap');
    if (!wrap || document.getElementById('wsToolbar')) return;
    document.getElementById('chartLabelBar')?.insertAdjacentHTML('beforeend',
      '<span class="chartTradeActions"><button class="buy" data-chart-ticket="1" title="Prepare a buy in the manual paper ticket">BUY · Manual</button><button class="sell" data-chart-ticket="-1" title="Prepare a sell in the manual paper ticket">SELL · Manual</button></span>');
    document.addEventListener('click',e=>{
      const pair=e.target.closest('[data-pair-chart], [data-ws-chart]');
      if(pair){e.preventDefault();e.stopPropagation();this.openChart(pair.dataset.pairChart ?? pair.dataset.wsChart);return;}
      const ticket=e.target.closest('[data-chart-ticket]');
      if(ticket){e.preventDefault();e.stopPropagation();this.openManual(ticket.dataset.ticketSym||STORE.symbol,+ticket.dataset.chartTicket,ticket.dataset.ticketTf||STORE.tf);}
    },true);
    window.addEventListener('message',e=>{
      if(e.origin!==location.origin || !e.source || e.source===window)return;
      const m=e.data;
      if(m?.type==='astra-desk-ready' && this.pendingWindows.has(e.source)){
        e.source.postMessage(this.pendingWindows.get(e.source),location.origin);this.pendingWindows.delete(e.source);return;
      }
      if(m?.type==='astra-ticket' && typeof m.sym==='string' && [1,-1].includes(m.dir) && document.documentElement.dataset.panel==='bots')this.openManual(m.sym,m.dir,m.tf);
      if(m?.type==='astra-chart' && typeof m.sym==='string' && document.documentElement.dataset.panel==='chart')App.setSymbol(m.sym);
    });
    if(window.opener)window.opener.postMessage({type:'astra-desk-ready'},location.origin);
    const link = (id, label, icon) => `<button data-ws-bot="${id}">${this.icon(icon)}<span>${label}</span></button>`;
    wrap.insertAdjacentHTML('afterbegin', `<nav id="wsToolbar" aria-label="Trading workspace shortcuts">
      ${link('dash','Overview','dashboard')}${link('manual','Manual','manual')}${link('open','Open trades','positions')}${link('confluenceScanner','Scanner','scanner')}
      <span class="wsToolbarSpacer"></span><button data-ws-chart="">${this.icon('chart')}<span>Chart</span></button>
      <button data-ws-news>${this.icon('news')}<span>News</span></button>
      <button data-ws-settings title="Market sources — which feeds and markets ASTRA uses (JustMarkets, Binance…)">${this.icon('manual')}<span>Markets</span></button></nav>`);
    const tabs = document.getElementById('botTabs');
    const icons = {screener:'search',heatmap:'layers',observer:'target',intel:'chart',news:'news',bots:'bot'};
    tabs.querySelectorAll('[data-tab]').forEach(btn => {
      // Preserve the news count element and the original tab listeners.
      btn.insertAdjacentHTML('afterbegin', this.icon(icons[btn.dataset.tab]));
    });
    tabs.querySelector('[data-tab="news"]').childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) n.textContent = n.textContent.replace('◉ ', '');
    });
    document.getElementById('botCollapse').insertAdjacentHTML('beforebegin', '<button id="wsExpand" title="Expand or restore the bot workspace" aria-pressed="false"></button>');
    this.expand(false);
    document.getElementById('wsExpand').addEventListener('click', () => this.expand(!document.getElementById('bot-bots').classList.contains('wsExpanded')));
    tabs.querySelector('[data-tab="bots"]').addEventListener('click', () => {
      if (!this.opened && !document.documentElement.dataset.panel){ this.opened = true; this.expand(true); }
      this.sync(Bots.active);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.querySelector('.modal.show, .mOverlay.show')) this.expand(false);
    });
    document.getElementById('bottomPanel').addEventListener('click', e => {
      const bot = e.target.closest('[data-ws-bot]');
      if (bot) return this.openBot(bot.dataset.wsBot);
      const chart = e.target.closest('[data-ws-chart]');
      if (chart){
        this.openChart(chart.dataset.wsChart);
      }
      if (e.target.closest('[data-ws-news]')){
        if (document.documentElement.dataset.panel) Popout.open('news');
        else document.querySelector('#botTabs [data-tab="news"]').click();
      }
      if (e.target.closest('[data-ws-settings]')) document.getElementById('marketSettingsBtn').click();
    });
    const sideIcons = {watch:'layers',book:'positions',alerts:'bell',portfolio:'report',ai:'bot',notes:'news'};
    document.querySelectorAll('#sideTabs [data-tab]').forEach(b => b.insertAdjacentHTML('afterbegin', this.icon(sideIcons[b.dataset.tab])));
  },
  equity(L){
    const points = (L.equityCurve || []).filter(p => Number.isFinite(p.eq) && Number.isFinite(p.t));
    if (points.length < 2) return '';
    const lo = Math.min(...points.map(p => p.eq)), hi = Math.max(...points.map(p => p.eq));
    const t0 = points[0].t, span = points[points.length-1].t - t0;
    const xy = points.map((p,i) => `${(8 + (span > 0 ? (p.t-t0)/span : i/(points.length-1))*584).toFixed(2)},${(hi === lo ? 42 : 76-(p.eq-lo)/(hi-lo)*64).toFixed(2)}`).join(' ');
    const sign = points[points.length-1].eq >= points[0].eq ? 'up' : 'down';
    const date = t => new Date(t).toLocaleString();
    return `<section class="wsEquity"><div><span class="wsEyebrow">${this.icon('chart')} EQUITY HISTORY</span>
      <p>Recorded paper equity · includes open P&amp;L</p><small>${esc(date(t0))} → ${esc(date(points[points.length-1].t))}</small></div>
      <div class="wsEquityPlot"><svg viewBox="0 0 600 84" preserveAspectRatio="none" role="img" aria-label="Recorded equity, range ${lo.toFixed(2)} to ${hi.toFixed(2)}" class="${sign}">
      <path d="M8 76H592M8 42H592M8 12H592" class="wsGridLine"/><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
      <span>Low ${esc(fmtNum(lo))} <i>High ${esc(fmtNum(hi))}</i></span></div></section>`;
  },
  priceMap(p, l){
    const marks = [{label:'Stop',v:p.sl,c:'down'},{label:'Entry',v:p.entry,c:''},{label:l.stale?'Last / fallback':'Now',v:l.px,c:'current'},{label:'Target',v:p.tp,c:'up'}]
      .filter(m => Number.isFinite(m.v) && m.v > 0);
    if (marks.length < 2) return '';
    const low = Math.min(...marks.map(m=>m.v)), high = Math.max(...marks.map(m=>m.v));
    // Saved levels only; editing the form must not imply a stop was already applied.
    return `<div class="wsPriceTitle">${this.icon('target')} Saved price levels <span>${l.stale?'Awaiting fresh quote':'Current quote'}</span></div>
      <div class="wsPriceRail" role="img" aria-label="${esc(marks.map(m=>m.label+' '+fmtPrice(m.v)).join(', '))}">${marks.map(m=>
      `<i class="${m.c}" title="${esc(m.label)} ${fmtPrice(m.v)}" style="left:${high===low?50:4+(m.v-low)/(high-low)*92}%"></i>`).join('')}</div>
      <div class="wsPriceLegend">${marks.map(m=>`<span class="${m.c}"><i></i>${esc(m.label)} <b>${fmtPrice(m.v)}</b></span>`).join('')}</div>`;
  },
};
