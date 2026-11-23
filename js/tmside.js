/* ASTRA / Timurila — the right-hand side panel in the new look.

   INDICATORS   the side panel's Indicators tab drawn like the gallery on top: every indicator as a
                little picture of itself on the chart you have open; hover shows it large beside the
                panel, click puts it on the chart or takes it off. Above the list, a map of the chart
                and its three extra windows shows what sits where; move an indicator by clicking the
                window you want it in.
   NEWS         a stream at the foot of the side panel: headlines about the market on the chart come
                first, then the rest, one after another, each staying a few seconds. Full screen is
                the News room.

   Classic's own Indicators panel is kept and comes back with the Classic look. Read-only apart from
   switching indicators on, off, or to another window, exactly as Classic's own list does. */
const Side = {
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  WIN: [['main', 'Price'], ['p1', 'Window 1'], ['p2', 'Window 2'], ['p3', 'Window 3']],
  COL: { main: '#4FD8F7', p1: '#FFB648', p2: '#A78BFA', p3: '#3DDC97' },
  fam: 'on', q: '',
  isOn(id){ const s = Chart.settings[id]; return !!(s && s.on); },
  where(id){ try { return Chart.targetsOf(Chart.settings[id]); } catch(e){ return ['main']; } },
  defWhere(d){ const c = Object.assign({}, d.def || {}, Chart.settings[d.id] || {}); try { return Chart.targetsOf(c); } catch(e){ return [d.kind === 'osc' ? 'p1' : 'main']; } },

  init(){
    const panel = this.$('tab-ind'); if (!panel || this.$('tmSideInd')) return;
    const box = document.createElement('div'); box.id = 'tmSideInd';
    box.innerHTML = '<div class="tsMap" id="tsMap"></div><div class="tsSearch"><input id="tsQ" type="text" placeholder="Search indicators…" autocomplete="off" spellcheck="false"></div><div class="tsFams" id="tsFams"></div><div class="tsGrid" id="tsGrid"></div>';
    panel.appendChild(box);
    const tip = document.createElement('div'); tip.id = 'tsTip'; tip.hidden = true; tip.innerHTML = '<canvas></canvas><h4></h4><p></p><div class="tsTipWin"></div>'; document.body.appendChild(tip);
    box.addEventListener('click', e => { const t = e.target.closest('[data-ts]'); if (!t) return; const [k, v, w] = t.dataset.ts.split(':');
      if (k === 'fam'){ this.fam = v; this.fill(); } else if (k === 'tog') this.toggle(v); else if (k === 'mv') this.move(v, w); else if (k === 'win'){ this.fam = 'on'; this.focusWin = this.focusWin === v ? null : v; this.fill(); } });
    box.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (t) this.tip(t.dataset.tip, t); });
    box.addEventListener('mouseleave', () => { tip.hidden = true; });
    this.$('tsQ').addEventListener('input', e => { this.q = e.target.value.trim().toLowerCase(); if (this.q) this.fam = 'all'; this.fill(); });
    /* draw when the tab is open, and again when the chart changes */
    const st = this.$('sideTabs'); if (st) st.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab === 'ind') setTimeout(() => this.fill(), 30); });
    try { BUS.on('symbol', () => setTimeout(() => this.visible() && this.fill(), 900)); } catch(e){}
    let lastN = 0; setInterval(() => { if (!this.visible()) return; const n = (Chart.raw || []).length + '|' + STORE.tf + '|' + INDS.filter(d => this.isOn(d.id)).length; if (n !== lastN){ lastN = n; this.fill(); } }, 2500);
    if (this.visible()) this.fill();
  },
  visible(){ const b = this.$('tmSideInd'); return !!b && b.offsetParent !== null; },
  toggle(id){ const c = Chart.settings[id]; if (!c) return; c.on = !c.on; try { lsSet('astra_ind', Chart.settings); Chart.renderAll(); } catch(e){ console.warn('indicator', e); } this.fill(); },
  move(id, w){ const c = Chart.settings[id]; if (!c) return; c.target = w; delete c.targets; if (!c.on) c.on = true; try { lsSet('astra_ind', Chart.settings); Chart.renderAll(); } catch(e){ console.warn('indicator', e); } this.fill(); },
  /* the chart and its windows, drawn to scale, with what sits in each */
  map(){ const on = INDS.filter(d => this.isOn(d.id)), by = { main: [], p1: [], p2: [], p3: [] }; for (const d of on) for (const w of this.where(d.id)) (by[w] || by.main).push(d);
    const used = this.WIN.filter(w => w[0] === 'main' || by[w[0]].length);
    return '<div class="tsMapHead"><b>On the chart</b><span>' + on.length + ' indicator' + (on.length === 1 ? '' : 's') + ' · click a window to see only it</span></div><div class="tsMapBox">' +
      used.map(w => '<button type="button" class="tsWin' + (w[0] === 'main' ? ' main' : '') + (this.focusWin === w[0] ? ' sel' : '') + '" data-ts="win:' + w[0] + '" style="--c:' + this.COL[w[0]] + '"><span>' + w[1] + '</span><em>' + (by[w[0]].length ? by[w[0]].map(d => '<i>' + this.esc(d.label.replace(/\s*\(.*$/, '').slice(0, 18)) + '</i>').join('') : '<i class="none">nothing</i>') + '</em></button>').join('') +
      (used.length < 4 ? '<div class="tsWinFree">' + (4 - used.length) + ' more window' + (4 - used.length === 1 ? '' : 's') + ' free under the chart</div>' : '') + '</div>'; },
  fill(){
    if (!this.$('tsGrid') || typeof INDS === 'undefined' || typeof Face === 'undefined') return;
    this.$('tsMap').innerHTML = this.map();
    const fams = Face.FAM, nOn = INDS.filter(d => this.isOn(d.id)).length;
    this.$('tsFams').innerHTML = fams.map(f => '<button type="button" data-ts="fam:' + f[0] + '" class="' + (f[0] === this.fam ? 'on' : '') + '">' + f[1] + (f[0] === 'on' ? ' ' + nOn : '') + '</button>').join('');
    const q = this.q; let list = INDS.filter(d => (this.fam === 'all' || (this.fam === 'on' ? this.isOn(d.id) : Face.famOf(d) === this.fam)) && (!q || (d.label + ' ' + d.id + ' ' + (d.note || '')).toLowerCase().includes(q)));
    if (this.fam === 'on' && this.focusWin) list = list.filter(d => this.where(d.id).includes(this.focusWin));
    if (this.fam === 'on' && !list.length && !this.focusWin){ this.fam = 'all'; return this.fill(); }
    this.$('tsGrid').innerHTML = list.length ? list.map(d => { const on = this.isOn(d.id), w = on ? this.where(d.id) : this.defWhere(d);
      return '<div class="tsCard' + (on ? ' on' : '') + '" data-tip="' + d.id + '"><button type="button" class="tsPic" data-ts="tog:' + d.id + '" title="' + (on ? 'Take it off the chart' : 'Put it on the chart') + '"><canvas></canvas><span class="tsOn">' + (on ? 'ON' : '+') + '</span></button>' +
        '<div class="tsMeta"><b>' + this.esc(d.label) + '</b><span class="tsWhere">' + this.WIN.map(x => '<button type="button" data-ts="mv:' + d.id + ':' + x[0] + '" class="' + (w.includes(x[0]) ? (on ? 'here' : 'would') : '') + '" style="--c:' + this.COL[x[0]] + '" title="' + (on ? 'Move it to ' : 'Put it on ') + (x[0] === 'main' ? 'the price chart' : x[1]) + '">' + (x[0] === 'main' ? 'P' : x[0].slice(1)) + '</button>').join('') + '</span></div></div>'; }).join('') : '<div class="tsEmpty">No indicator matches.</div>';
    const cards = [...this.$('tsGrid').querySelectorAll('.tsCard')]; let i = 0;
    const run = () => { if (!this.visible()) return; for (let k = 0; k < 5 && i < cards.length; k++, i++){ const def = INDS.find(d => d.id === cards[i].dataset.tip); try { Face.indDraw(cards[i].querySelector('canvas'), def, false); } catch(e){} } if (i < cards.length) setTimeout(run, 0); }; run();
  },
  /* the large example, to the left of the panel */
  tip(id, el){ const def = INDS.find(d => d.id === id), t = this.$('tsTip'); if (!def || !t) return; const r = el.getBoundingClientRect(), on = this.isOn(id), w = on ? this.where(id) : this.defWhere(def);
    t.hidden = false; t.style.top = Math.max(70, Math.min(window.innerHeight - 330, r.top - 40)) + 'px'; t.style.left = Math.max(90, r.left - 392) + 'px';
    t.querySelector('h4').textContent = def.label; const note = def.note || (def.kind === 'osc' ? 'Drawn in its own window under the price.' : 'Drawn on the price itself.'); t.querySelector('p').textContent = note.length > 260 ? note.slice(0, 257) + '…' : note;
    t.querySelector('.tsTipWin').innerHTML = (on ? 'On the chart, in ' : 'Would go in ') + w.map(x => '<b style="color:' + this.COL[x] + '">' + (x === 'main' ? 'the price chart' : this.WIN.find(y => y[0] === x)[1]) + '</b>').join(' and ');
    try { Face.indDraw(t.querySelector('canvas'), def, true); } catch(e){} },

  /* ---------- news, coming and going at the foot of the panel ---------- */
  KW: { EUR: 'euro|ecb|eurozone|lagarde', USD: 'dollar|fed|fomc|powell|treasury|payrolls|cpi|jobs report', GBP: 'sterling|pound|bank of england|boe|britain|uk', JPY: 'yen|boj|japan', CHF: 'franc|snb|swiss', AUD: 'aussie|rba|australia', NZD: 'kiwi|rbnz|new zealand', CAD: 'loonie|bank of canada|canada', CNH: 'yuan|china', PLN: 'zloty|poland',
    XAU: 'gold|bullion', XAG: 'silver', XPT: 'platinum', XPD: 'palladium', BTC: 'bitcoin|crypto', ETH: 'ether|ethereum|crypto', SOL: 'solana|crypto', XRP: 'xrp|ripple|crypto',
    US500: 's&p|wall street|stocks|equities', US100: 'nasdaq|tech stocks|wall street', US30: 'dow|wall street', DE40: 'dax|german', UK100: 'ftse|britain', JP225: 'nikkei|japan', FR40: 'cac|france', HK50: 'hang seng|hong kong', AU200: 'asx|australia',
    BRENT: 'oil|crude|opec|brent', WTI: 'oil|crude|opec', XNG: 'natural gas|lng', NGAS: 'natural gas|lng' },
  FXC: ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'CNH', 'PLN'],
  /* the words that make a headline about this market. A currency pair uses both currencies; gold, bitcoin, an index or oil only
     its own name (BTCUSD is not news about the dollar) */
  words(sym){ const b = String(sym).replace(/\.(s|m|std)$/i, '').toUpperCase(), out = [], asset = Object.keys(this.KW).filter(k => !this.FXC.includes(k)).find(k => b.startsWith(k) || b === k);
    if (asset) out.push(this.KW[asset]); else if (/^[A-Z]{6}$/.test(b) && this.FXC.includes(b.slice(0, 3)) && this.FXC.includes(b.slice(3))) out.push(this.KW[b.slice(0, 3)], this.KW[b.slice(3)]);
    if (!out.length && /^[A-Z]{1,5}$/.test(b)) out.push(b.toLowerCase()); return out.length ? new RegExp('\\b(' + out.join('|') + ')', 'i') : null; },
  group(sym){ try { return (typeof MarketFit !== 'undefined' && MarketFit.marketOf(sym)) || ''; } catch(e){ return ''; } },
  TAG: { fx: 'FX', metal: 'Gold', index: 'Indices', crypto: 'Crypto', energy: 'Energy', stock: 'Stocks' },
  news(){ if (typeof MarketNews === 'undefined' || !MarketNews.data) return []; const re = this.words(STORE.symbol), tag = this.TAG[this.group(STORE.symbol)];
    return MarketNews.ranked().slice(0, 60).map(n => { const hit = re && re.test(n.title) ? 2 : tag && n.tags.includes(tag) ? 1 : 0; return Object.assign({}, n, { rel: hit }); })
      .sort((a, b) => b.rel - a.rel || b.impact - a.impact || (b.publishedAt || 0) - (a.publishedAt || 0)); },
  initNews(){
    const sb = this.$('sidebar'); if (!sb || this.$('tsNews')) return;
    const box = document.createElement('section'); box.id = 'tsNews'; let open = true; try { open = localStorage.getItem('astra_side_news') !== '0'; } catch(e){}
    box.classList.toggle('shut', !open);
    box.innerHTML = '<div class="tsNHead"><i class="tsLive"></i><b id="tsNTitle">News</b><span id="tsNCount"></span><button type="button" data-tn="full" title="All the news, full screen">⤢</button><button type="button" data-tn="shut" title="Fold the news away">▾</button></div><div class="tsNBody" id="tsNBody"></div>';
    sb.appendChild(box);
    box.addEventListener('click', e => { const b = e.target.closest('[data-tn]'); if (!b) return; const k = b.dataset.tn;
      if (k === 'shut'){ const s = !box.classList.contains('shut'); box.classList.toggle('shut', s); try { localStorage.setItem('astra_side_news', s ? '0' : '1'); } catch(er){} }
      else if (k === 'full'){ if (typeof Face !== 'undefined') Face.go('news'); } });
    box.addEventListener('mouseenter', () => { this.hold = true; }); box.addEventListener('mouseleave', () => { this.hold = false; });
    this.ni = 0; this.tick(); setInterval(() => this.tick(), 7000);
    try { BUS.on('symbol', () => { this.ni = 0; setTimeout(() => this.tick(true), 600); }); } catch(e){}
  },
  tick(force){
    const body = this.$('tsNBody'); if (!body || (this.hold && !force)) return; const list = this.news(), rel = list.filter(n => n.rel).length, base = String(STORE.symbol).replace(/\.(s|m|std)$/i, '');
    this.$('tsNTitle').textContent = rel ? 'News on ' + base : 'Market news'; this.$('tsNCount').textContent = list.length ? (rel ? rel + ' about this chart · ' : '') + list.length + ' in all' : '';
    if (!list.length){ body.innerHTML = '<div class="tsNEmpty">' + (typeof MarketNews !== 'undefined' && MarketNews.error ? 'News sources unavailable right now.' : 'Reading the news…') + '</div>'; return; }
    const show = 3, start = this.ni % list.length; this.ni = (this.ni + 1) % list.length; const pick = []; for (let k = 0; k < Math.min(show, list.length); k++) pick.push(list[(start + k) % list.length]);
    const card = (n, enter) => { const url = MarketNews.safeUrl(n.url), mins = n.publishedAt ? Math.max(0, Math.round((Date.now() - n.publishedAt) / 60000)) : null, age = mins == null ? '' : mins < 60 ? mins + 'm' : mins < 1440 ? Math.round(mins / 60) + 'h' : Math.round(mins / 1440) + 'd';
      return '<a class="tsNCard lvl' + n.impact + (n.rel ? ' rel' : '') + (enter ? ' enter' : '') + '"' + (url ? ' href="' + this.esc(url) + '" target="_blank" rel="noopener noreferrer"' : '') + ' title="' + this.esc(n.why) + '"><span class="tsNTop">' + (n.rel === 2 ? '<em>' + this.esc(base) + '</em>' : n.rel ? '<em class="soft">' + this.esc(n.tags[0] || '') + '</em>' : '') + '<i>' + this.esc(n.topic) + '</i><time>' + age + '</time></span><b>' + this.esc(n.title) + '</b><small>' + this.esc(n.source || '') + '</small></a>'; };
    body.innerHTML = pick.map((n, k) => card(n, k === pick.length - 1 && !force)).join('');
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { Side.init(); Side.initNews(); } catch(e){ console.warn('side', e); } }, 1500));
