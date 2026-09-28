/* ASTRA Terminal — crypto heatmap (treemap sized by market cap, colored by 24h change) */
const Heat = {
  data: null,
  src: '',
  rects: [],
  timer: null,
  /* ⚙ the heatmap your way: tile order, which markets, how many tiles, tile size */
  CFG_KEY: 'astra_heatcfg',
  SORTS: [['move', 'Biggest moves first'], ['best', 'Best → worst'], ['worst', 'Worst → best'], ['az', 'A → Z'], ['group', 'Grouped by market']],
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {}; return { sort: c.sort || 'move', groups: c.groups || null, watchOnly: !!c.watchOnly, count: c.count || 60, size: c.size || 'equal' }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.draw(); this.cfgView(); },
  groupOf(name){ try { return (typeof Bots !== 'undefined' && Bots.groupOfAny) ? (Bots.groupOfAny(name) || 'other') : 'other'; } catch(e){ return 'other'; } },
  groups(){ try { return typeof Bots !== 'undefined' ? Bots.marketGroups() : {}; } catch(e){ return {}; } },
  /* the tiles to draw, in your order (the treemap fills from the top-left in this order) */
  arranged(){
    const c = this.cfg(), broker = typeof MarketSources !== 'undefined' && !MarketSources.binanceOn();
    let L = this.data.slice();
    if (broker){
      if (c.watchOnly && typeof Watch !== 'undefined'){ const w = new Set(Watch.list.map(s => Feed.brokerName ? Feed.brokerName(s) : s)); L = L.filter(i => w.has(i.name) || w.has(Feed.brokerName ? Feed.brokerName(i.name) : i.name)); }
      if (c.groups) L = L.filter(i => c.groups.includes(this.groupOf(i.name)));
      L.forEach(i => { i.w = c.size === 'move' ? 0.25 + Math.min(8, Math.abs(i.pct || 0)) : 1; });
    }
    const by = { move: (a, b) => Math.abs(b.pct) - Math.abs(a.pct), best: (a, b) => b.pct - a.pct, worst: (a, b) => a.pct - b.pct, az: (a, b) => a.name.localeCompare(b.name) };
    if (c.sort === 'group'){ const G = this.groups(), keys = Object.keys(G); L.sort((a, b) => keys.indexOf(this.groupOf(a.name)) - keys.indexOf(this.groupOf(b.name)) || Math.abs(b.pct) - Math.abs(a.pct)); }
    else if (by[c.sort] && (broker || c.sort !== 'move')) L.sort(by[c.sort]);
    return L.slice(0, c.count);
  },
  cfgView(){
    const box = document.getElementById('heatCfgBox'), btn = document.getElementById('heatCfg'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), G = this.groups(), broker = typeof MarketSources !== 'undefined' && !MarketSources.binanceOn();
    const opt = (L, v) => L.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${t}</option>`).join('');
    box.innerHTML = `<label>Order <select data-hsort="1">${opt(this.SORTS, c.sort)}</select></label>
      <label>Tiles <select data-hcount="1">${opt([[30, '30'], [60, '60'], [100, '100'], [200, '200']], c.count)}</select></label>
      ${broker ? `<label>Size <select data-hsize="1">${opt([['equal', 'All equal'], ['move', 'Bigger move = bigger tile']], c.size)}</select></label>
      <label><input type="checkbox" data-hwatch="1" ${c.watchOnly ? 'checked' : ''}> Only my watchlist</label>
      <div class="hGroups">Markets ${Object.entries(G).map(([id, g]) => `<label><input type="checkbox" data-hgroup="${id}" ${!c.groups || c.groups.includes(id) ? 'checked' : ''}> ${esc(g.label)}</label>`).join('')}</div>` : ''}
      <button class="bMini" data-hreset="1">↺ Reset</button>`;
  },

  async load(){
    const revision = typeof MarketSources !== 'undefined' ? MarketSources.revision : 0;
    if (typeof MarketSources !== 'undefined' && !MarketSources.binanceOn()){
      this.data = MarketSources.brokerList().filter(s => Number.isFinite(STORE.tickers.get(s)?.pct)).map(s => {
        const t = STORE.tickers.get(s);
        return { name: s, full: s, w: 1, pct: t.pct, price: t.last };
      });
      this.src = 'JustMarkets · equal tiles · price change'; return;
    }
    try {
      const d = await API.gecko('/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h');
      if (typeof MarketSources !== 'undefined' && revision !== MarketSources.revision) return this.load();
      this.data = d.filter(x => x.market_cap > 0).map(x => ({
        name: (x.symbol || '').toUpperCase(),
        full: x.name,
        w: x.market_cap,
        pct: x.price_change_percentage_24h != null ? x.price_change_percentage_24h : 0,
        price: x.current_price,
      }));
      this.src = 'CoinGecko · sized by market cap · colored by 24h change';
    } catch(e){
      this.data = STORE.universe.slice(0, 80).map(s => {
        const t = STORE.tickers.get(s);
        return { name: baseAsset(s), full: s, w: t.quoteVol, pct: t.pct, price: t.last };
      });
      this.src = 'Binance · sized by 24h volume · colored by 24h change';
    }
  },

  async show(){
    if (!this.data){
      await this.load();
      if (!this.timer) this.timer = setInterval(() => this.load().then(() => this.draw()), 90000);
    }
    this.draw();
  },

  draw(){
    const cv = document.getElementById('heatCanvas');
    const wrap = document.getElementById('heatWrap');
    if (!cv || !wrap || !this.data) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight - 4;
    if (W < 20 || H < 20) return;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const items = this.arranged();
    if (!items.length){ this.rects = []; const s = document.getElementById('heatSrc'); if (s) s.textContent = 'Nothing to show with these ⚙ choices'; return; }
    const total = items.reduce((a, b) => a + b.w, 0);
    this.rects = [];
    this.split(items.map(i => ({ ...i, area: i.w / total * W * H })), 0, 0, W, H);
    for (const r of this.rects) this.cell(ctx, r);
    const srcEl = document.getElementById('heatSrc');
    if (srcEl){ const c = this.cfg(); srcEl.textContent = this.src + ' · ' + items.length + ' tiles · ' + (this.SORTS.find(x => x[0] === c.sort) || [, ''])[1].toLowerCase(); }
  },

  /* recursive weighted binary split treemap */
  split(items, x, y, w, h){
    if (!items.length) return;
    if (items.length === 1){ this.rects.push({ ...items[0], x, y, w, h }); return; }
    const total = items.reduce((a, b) => a + b.area, 0);
    let acc = 0, i = 0;
    while (i < items.length - 1 && acc + items[i].area < total / 2) acc += items[i++].area;
    const g1 = items.slice(0, Math.max(1, i)), g2 = items.slice(Math.max(1, i));
    const f = g1.reduce((a, b) => a + b.area, 0) / total;
    if (w >= h){
      this.split(g1, x, y, w * f, h);
      this.split(g2, x + w * f, y, w * (1 - f), h);
    } else {
      this.split(g1, x, y, w, h * f);
      this.split(g2, x, y + h * f, w, h * (1 - f));
    }
  },

  cell(ctx, r){
    const pct = Math.max(-8, Math.min(8, r.pct));
    const t = Math.abs(pct) / 8;
    let color;
    if (pct > 0.05) color = `rgba(0, ${Math.round(160 + 70 * t)}, ${Math.round(115 + 45 * t)}, ${0.28 + 0.5 * t})`;
    else if (pct < -0.05) color = `rgba(255, ${Math.round(85 - 30 * t)}, ${Math.round(120 - 40 * t)}, ${0.28 + 0.5 * t})`;
    else color = 'rgba(110,130,170,0.25)';
    const light = STORE.theme === 'light';
    ctx.fillStyle = color;
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(4,7,15,0.95)';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (r.w > 44 && r.h > 30){
      ctx.textAlign = 'center';
      ctx.fillStyle = light ? 'rgba(15,30,60,0.95)' : 'rgba(240,250,255,0.95)';
      ctx.font = `700 ${Math.min(24, Math.max(10, r.w / 6))}px Rajdhani, sans-serif`;
      ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2 - 2);
      ctx.font = `500 ${Math.min(13, Math.max(9, r.w / 9))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = light
        ? (r.pct >= 0 ? 'rgba(0,95,65,0.95)' : 'rgba(155,20,50,0.95)')
        : (r.pct >= 0 ? 'rgba(190,255,230,0.92)' : 'rgba(255,195,210,0.92)');
      ctx.fillText(fmtPct(r.pct), r.x + r.w / 2, r.y + r.h / 2 + 14);
    }
  },

  hit(x, y){
    return this.rects.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  },

  wire(){
    document.getElementById('heatCfg')?.addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    const box = document.getElementById('heatCfgBox');
    box?.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.hsort) c.sort = t.value; else if (t.dataset.hcount) c.count = +t.value; else if (t.dataset.hsize) c.size = t.value;
      else if (t.dataset.hwatch) c.watchOnly = t.checked;
      else if (t.dataset.hgroup){ const all = Object.keys(this.groups()); let g = c.groups || all.slice(); g = t.checked ? g.concat([t.dataset.hgroup]) : g.filter(x => x !== t.dataset.hgroup); c.groups = g.length === all.length ? null : g; }
      else return;
      this.saveCfg(c);
    });
    box?.addEventListener('click', e => { if (e.target.closest('[data-hreset]')){ lsSet(this.CFG_KEY, {}); this.draw(); this.cfgView(); } });
    const cv = document.getElementById('heatCanvas');
    const tip = document.getElementById('heatTip');
    cv.addEventListener('mousemove', e => {
      const b = cv.getBoundingClientRect();
      const r = this.hit(e.clientX - b.left, e.clientY - b.top);
      if (r){
        tip.style.display = 'block';
        tip.style.left = Math.min(e.clientX - b.left + 14, b.width - 170) + 'px';
        tip.style.top = (e.clientY - b.top + 14) + 'px';
        tip.innerHTML = `<b>${esc(r.full)}</b><span>${esc(r.name)} · $${fmtPrice(r.price)}</span>` +
          `<span class="${pctClass(r.pct)}">${fmtPct(r.pct)} (24h)</span>`;
      } else tip.style.display = 'none';
    });
    cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    cv.addEventListener('click', e => {
      const b = cv.getBoundingClientRect();
      const r = this.hit(e.clientX - b.left, e.clientY - b.top);
      if (!r) return;
      const sym = typeof MarketSources !== 'undefined' && !MarketSources.binanceOn() ? r.name : r.name + 'USDT';
      if (STORE.tickers.has(sym)) (typeof WorkspaceUI!=='undefined'?WorkspaceUI.openChart(sym):App.setSymbol(sym));
      else toast(r.name + ' is not tradable on Binance as a USDT pair', 'warn');
    });
    new ResizeObserver(() => this.draw()).observe(document.getElementById('heatWrap'));
  },
};
