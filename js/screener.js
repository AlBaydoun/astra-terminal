/* ASTRA Terminal — full-market crypto screener, live-updating */
const Screener = {
  built: false,
  sortKey: 'quoteVol',
  sortDir: -1,
  query: '',
  _pend: null,

  /* ⚙ the columns your way: drag a title or use ▲▼, show / hide; the sort is remembered */
  CFG_KEY: 'astra_scrcfg',
  COLS: [['sym', 'Pair', 'symbol', true], ['last', 'Price', 'last'], ['pct', '24h %', 'pct'], ['high', '24h high', 'high'], ['low', '24h low', 'low'],
         ['vol', 'Volume (exchange pairs only)', 'quoteVol'], ['cnt', 'Trades (exchange pairs only)', 'count'], ['act', '★ watch / 🔔 alert buttons', null, true]],
  cfg(){
    const c = lsGet(this.CFG_KEY, {}) || {}, ids = this.COLS.map(x => x[0]);
    const order = (c.order || []).filter(x => ids.includes(x)); for (const id of ids) if (!order.includes(id)) order.push(id);
    return { order, hidden: (c.hidden || []).filter(x => ids.includes(x) && !this.col(x)[3]), sortKey: c.sortKey || 'quoteVol', sortDir: c.sortDir || -1 };
  },
  col(id){ return this.COLS.find(x => x[0] === id); },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.applyCols(); this.cfgView(); },
  /* the column cells carry these classes: c-sym c-last c-pct c-high c-low c-vol c-cnt c-act (the head: th[data-col]) */
  applyCols(){
    const c = this.cfg(), table = document.getElementById('scrTable'); if (!table) return;
    const head = table.querySelector('thead tr');
    for (const id of c.order){ const th = head.querySelector('[data-col="' + id + '"]'); if (th) head.appendChild(th); }
    if (this.rows) this.rows.forEach(tr => { for (const id of c.order){ const td = tr.querySelector(':scope > .c-' + id); if (td) tr.appendChild(td); } });
    for (const [id] of this.COLS) table.classList.toggle('noc-' + id, c.hidden.includes(id));
  },
  cfgView(){
    const box = document.getElementById('scrCfgBox'), btn = document.getElementById('scrCfg'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), n = c.order.length;
    box.innerHTML = `<div class="bkRows">${c.order.map((id, i) => { const [, label, , always] = this.col(id);
        return `<div class="bkRow"><label><input type="checkbox" data-sccol="${id}" ${c.hidden.includes(id) ? '' : 'checked'}${always ? ' disabled' : ''}> ${esc(label)}${always ? ' <small>· always</small>' : ''}</label>
        <span><button data-scmv="${id}|-1" ${i === 0 ? 'disabled' : ''}>◂</button><button data-scmv="${id}|1" ${i === n - 1 ? 'disabled' : ''}>▸</button></span></div>`; }).join('')}</div>
      <small>Or drag a column title left or right. Click a title to sort — the sort is remembered. Volume and trades exist only for exchange pairs; your JustMarkets instruments show “—” there.</small>
      <button class="bMini" data-screset="1">↺ Reset columns</button>`;
  },
  moveCol(id, target, after){
    const c = this.cfg(), i = c.order.indexOf(id); if (i < 0) return;
    c.order.splice(i, 1); let j = c.order.indexOf(target); if (j < 0) j = c.order.length; c.order.splice(after ? j + 1 : j, 0, id); this.saveCfg(c);
  },

  init(){
    { const c = this.cfg(); this.sortKey = c.sortKey; this.sortDir = c.sortDir;
      /* name every column head so it can be moved; show the remembered sort */
      const keyToCol = Object.fromEntries(this.COLS.filter(x => x[2]).map(x => [x[2], x[0]]));
      document.querySelectorAll('#scrTable thead th').forEach(th => { th.dataset.col = th.dataset.k ? keyToCol[th.dataset.k] : 'act';
        th.classList.remove('asc', 'desc'); if (th.dataset.k === this.sortKey) th.classList.add(this.sortDir > 0 ? 'asc' : 'desc'); });
      document.getElementById('scrCfg')?.addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
      const box = document.getElementById('scrCfgBox');
      box?.addEventListener('click', e => {
        const m = e.target.closest('[data-scmv]'); if (m){ const c = this.cfg(), [id, d] = m.dataset.scmv.split('|'), i = c.order.indexOf(id), j = i + +d; if (i >= 0 && j >= 0 && j < c.order.length) this.moveCol(id, c.order[j], +d > 0); return; }
        if (e.target.closest('[data-screset]')){ const c = this.cfg(); lsSet(this.CFG_KEY, { sortKey: c.sortKey, sortDir: c.sortDir }); this.applyCols(); this.cfgView(); }
      });
      box?.addEventListener('change', e => { const t = e.target; if (!t.dataset.sccol) return; const c = this.cfg(); c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.sccol) : c.hidden.concat([t.dataset.sccol]); this.saveCfg(c); });
      /* drag a column title onto another to move it */
      document.querySelectorAll('#scrTable thead th').forEach(th => {
        th.draggable = true;
        th.addEventListener('dragstart', e => { this._dragCol = th.dataset.col; th.classList.add('scDragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', th.dataset.col); } catch(err){} });
        th.addEventListener('dragend', () => { this._dragCol = null; th.classList.remove('scDragging'); document.querySelectorAll('#scrTable th.scDropL,#scrTable th.scDropR').forEach(x => x.classList.remove('scDropL', 'scDropR')); });
        th.addEventListener('dragover', e => { if (!this._dragCol || this._dragCol === th.dataset.col) return; e.preventDefault(); const r = th.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2; th.classList.toggle('scDropR', right); th.classList.toggle('scDropL', !right); });
        th.addEventListener('dragleave', () => th.classList.remove('scDropL', 'scDropR'));
        th.addEventListener('drop', e => { e.preventDefault(); const right = th.classList.contains('scDropR'); th.classList.remove('scDropL', 'scDropR'); if (this._dragCol && this._dragCol !== th.dataset.col) this.moveCol(this._dragCol, th.dataset.col, right); });
      });
      this.applyCols();
    }
    BUS.on('tickers', ch => { if (this.built) this.liveUpdate(ch); });
    BUS.on('watch', () => {
      if (!this.built) return;
      this.rows.forEach((tr, sym) =>
        tr.querySelector('.rStar').classList.toggle('on', Watch.list.includes(sym)));
    });
    document.getElementById('scrSearch').addEventListener('input', e => {
      this.query = e.target.value.trim().toUpperCase();
      this.apply();
    });
    document.querySelectorAll('#scrTable th[data-k]').forEach(th =>
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (this.sortKey === k) this.sortDir *= -1;
        else { this.sortKey = k; this.sortDir = (k === 'symbol') ? 1 : -1; }
        document.querySelectorAll('#scrTable th[data-k]').forEach(x => x.classList.remove('asc', 'desc'));
        th.classList.add(this.sortDir > 0 ? 'asc' : 'desc');
        { const c = lsGet(this.CFG_KEY, {}) || {}; c.sortKey = this.sortKey; c.sortDir = this.sortDir; lsSet(this.CFG_KEY, c); }
        this.apply();
      }));
  },

  build(){
    if (this.built) return;
    this.built = true;
    this.tbody = document.querySelector('#scrTable tbody');
    this.rows = new Map();
    for (const sym of this.symbols()){
      const tr = document.createElement('tr');
      tr.dataset.sym = sym;
      tr.innerHTML =
        `<td class="c-sym"><i class="dot" style="--hue:${Watch.hue(sym)}"></i>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(sym,MK.short(sym)):esc(MK.short(sym))}</td>` +
        `<td class="c-last num"></td><td class="c-pct num"></td><td class="c-high num"></td>` +
        `<td class="c-low num"></td><td class="c-vol num"></td><td class="c-cnt num"></td>` +
        `<td class="c-act"><button class="rAct rStar${Watch.list.includes(sym) ? ' on' : ''}" title="Add / remove watchlist">★</button>` +
        `<button class="rAct rBell" title="Set price alert">` +
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></button></td>`;
      tr.addEventListener('click', e => {
        const star = e.target.closest('.rStar');
        if (star){
          if (Watch.list.includes(sym)) Watch.remove(sym);
          else Watch.add(sym);
          return;
        }
        if (e.target.closest('.rBell')){ Alerts.openModal(null, sym); return; }
        (typeof WorkspaceUI!=='undefined'?WorkspaceUI.openChart(sym):App.setSymbol(sym));
      });
      this.rows.set(sym, tr);
      this.fill(sym);
    }
    this.applyCols();
    this.apply();
  },

  fill(sym){
    const t = STORE.tickers.get(sym), tr = this.rows.get(sym);
    if (!t || !tr) return;
    tr.querySelector('.c-last').textContent = fmtPrice(t.last);
    const pc = tr.querySelector('.c-pct');
    pc.textContent = fmtPct(t.pct);
    pc.className = 'c-pct num ' + pctClass(t.pct);
    tr.querySelector('.c-high').textContent = fmtPrice(t.high);
    tr.querySelector('.c-low').textContent = fmtPrice(t.low);
    const broker = typeof MarketSources !== 'undefined' && MarketSources.brokerSymbol(sym);
    tr.querySelector('.c-vol').textContent = broker ? '—' : fmtNum(t.quoteVol);
    tr.querySelector('.c-cnt').textContent = broker ? '—' : fmtNum(t.count || 0);
  },

  liveUpdate(changed){
    if (this._pend){ changed.forEach(s => this._pend.add(s)); return; }
    this._pend = new Set(changed);
    requestAnimationFrame(() => {
      const p = this._pend; this._pend = null;
      p.forEach(s => this.fill(s));
    });
  },

  apply(){
    if (!this.built) return;
    const syms = this.symbols().filter(s => this.rows.has(s) && (!this.query || s.toUpperCase().includes(this.query)));
    const get = s => {
      if (this.sortKey === 'symbol') return s;
      const t = STORE.tickers.get(s);
      return t ? (t[this.sortKey] != null ? t[this.sortKey] : 0) : 0;
    };
    syms.sort((a, b) => {
      const va = get(a), vb = get(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * this.sortDir;
    });
    const frag = document.createDocumentFragment();
    syms.slice(0, 400).forEach(s => frag.appendChild(this.rows.get(s)));
    this.tbody.innerHTML = '';
    this.tbody.appendChild(frag);
    document.getElementById('scrCount').textContent = syms.length + ' pairs';
  },
  symbols(){ return typeof MarketSources !== 'undefined' ? MarketSources.list() : STORE.universe; },
  rebuild(){ this.built = false; this.build(); },
};
