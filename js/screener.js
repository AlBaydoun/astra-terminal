/* ASTRA Terminal — full-market crypto screener, live-updating */
const Screener = {
  built: false,
  sortKey: 'quoteVol',
  sortDir: -1,
  query: '',
  _pend: null,

  init(){
    BUS.on('tickers', ch => { if (this.built) this.liveUpdate(ch); });
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
        this.apply();
      }));
  },

  build(){
    if (this.built || !STORE.universe.length) return;
    this.built = true;
    this.tbody = document.querySelector('#scrTable tbody');
    this.rows = new Map();
    for (const sym of STORE.universe){
      const tr = document.createElement('tr');
      tr.dataset.sym = sym;
      tr.innerHTML =
        `<td class="c-sym"><i class="dot" style="--hue:${Watch.hue(sym)}"></i>${esc(baseAsset(sym))}<span class="q">/USDT</span></td>` +
        `<td class="c-last num"></td><td class="c-pct num"></td><td class="c-high num"></td>` +
        `<td class="c-low num"></td><td class="c-vol num"></td><td class="c-cnt num"></td>`;
      tr.addEventListener('click', () => App.setSymbol(sym));
      this.rows.set(sym, tr);
      this.fill(sym);
    }
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
    tr.querySelector('.c-vol').textContent = fmtNum(t.quoteVol);
    tr.querySelector('.c-cnt').textContent = fmtNum(t.count || 0);
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
    const syms = STORE.universe.filter(s => !this.query || s.includes(this.query));
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
};
