/* Timurila — Markets room: the radar (every instrument on the account) and the chart studio. */
const Markets = {
  group: 'all', q: '', sym: null, tf: '1h', chart: null,
  LAYERS: [['zones', 'Zones', 'support and resistance'], ['channel', 'Trend channel', 'the leg in progress'], ['events', 'Bounces and breaks', 'on the zones'], ['ma', 'Moving average', '20-candle EMA'], ['signals', 'Signal labels', 'TD, UT Bot, Chandelier'], ['range', 'Usual range', 'next 24 candles'],
    ['fvg', 'Fair value gaps', 'still open'], ['ob', 'Order blocks', 'still standing'], ['bos', 'Structure breaks', 'BOS and CHoCH'], ['sweep', 'Liquidity sweeps', 'a swing taken and rejected'], ['div', 'RSI divergences', 'price and RSI disagree'],
    ['classic', 'Classic zones', 'sloped, from Patterns']],
  SCENES: { clean: [], studio: ['zones', 'channel', 'events', 'ma'], research: ['ma', 'signals', 'range'], structure: ['zones', 'fvg', 'ob', 'bos', 'sweep', 'div'], all: ['zones', 'channel', 'events', 'ma', 'signals', 'range', 'fvg', 'ob', 'bos', 'sweep', 'div'], classic: ['classic'] },
  TFS: ['15m', '1h', '4h', '1d'],

  init(){
    const el = document.getElementById('room-markets');
    el.innerHTML = `
      <div class="head"><div><h1>Markets</h1><p id="mkSub">Every instrument on your account.</p></div><div class="pills" id="mkGroups"></div></div>
      <div class="cols">
        <section class="card radar" aria-label="Radar">
          <div class="hd"><h2>Radar</h2><span class="sub" id="mkCount"></span></div>
          <input id="mkSearch" type="search" placeholder="Find a market" aria-label="Find a market">
          <div class="rows" id="mkRows"></div>
        </section>
        <section class="card studio" aria-label="Chart studio">
          <div class="hd">
            <div class="title"><h2 id="mkName">Pick a market</h2><span class="px" id="mkPx"></span><span class="sub" id="mkChg"></span><span class="sub mono" id="mkOhlc"></span></div>
            <div class="pills" id="mkTf"></div>
          </div>
          <div class="pills"><span class="sub">Scene</span><span class="pills" id="mkScenes"></span></div>
          <div class="cols">
            <div class="chartBox" id="mkChart"><div class="msg" id="mkMsg">Waiting for the MT5 bridge…</div></div>
            <div class="layers" id="mkLayers"><h3>Layers</h3></div>
          </div>
          <div class="regime" id="mkRegime"></div>
          <div id="mkFile"></div>
        </section>
      </div>`;
    this.tf = T.load('tf', '1h'); this.sym = T.load('sym', null);
    this.chart = new TChart(document.getElementById('mkChart'));
    this.chart.layers = Object.assign(this.chart.layers, T.load('layers2', {}));
    this.chart.onHover = b => { document.getElementById('mkOhlc').textContent = b ? 'O ' + this.chart.fmt(b.open) + '  H ' + this.chart.fmt(b.high) + '  L ' + this.chart.fmt(b.low) + '  C ' + this.chart.fmt(b.close) : ''; };
    document.getElementById('mkTf').innerHTML = this.TFS.map(t => `<button class="pill" data-tf="${t}">${t}</button>`).join('');
    document.getElementById('mkScenes').innerHTML = [['clean', 'Clean'], ['studio', 'Studio'], ['structure', 'Structure'], ['research', 'Research'], ['all', 'Everything'], ['classic', 'Classic zones']].map(s => `<button class="pill" data-scene="${s[0]}">${s[1]}</button>`).join('');
    document.getElementById('mkLayers').insertAdjacentHTML('beforeend', this.LAYERS.map(l => `<button class="layer" data-layer="${l[0]}"><i></i><span><b>${l[1]}</b><small>${l[2]}</small></span><em></em></button>`).join(''));
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.group){ this.group = b.dataset.group; this.renderRadar(); }
      else if (b.dataset.sym) this.open(b.dataset.sym);
      else if (b.dataset.tf){ this.tf = b.dataset.tf; T.save('tf', this.tf); this.loadChart(true); }
      else if (b.dataset.scene){ const on = this.SCENES[b.dataset.scene]; for (const l of this.LAYERS) this.chart.layers[l[0]] = on.includes(l[0]); this.syncLayers(); }
      else if (b.dataset.layer){ this.chart.layers[b.dataset.layer] = !this.chart.layers[b.dataset.layer]; this.syncLayers(); }
    });
    document.getElementById('mkSearch').addEventListener('input', e => { this.q = e.target.value.trim().toUpperCase(); this.renderRadar(); });
    T.on('symbols', () => { if (!this.sym || !T.symbols.includes(this.sym)) this.sym = T.symbols.find(s => /^XAUUSD/.test(s)) || T.symbols[0]; this.renderRadar(); this.loadChart(true); });
    T.on('quotes', () => { this.renderRadar(); this.renderTitle(); });
    T.on('health', () => { if (!T.online) document.getElementById('mkMsg').textContent = 'The MT5 bridge is not answering. Start it with START-MT5-Bridge.bat and this fills in by itself.'; });
    setInterval(() => { if (App.room === 'markets' && !T.hidden() && T.online) this.loadChart(false); }, 20000);
    this.syncLayers();
  },
  show(on){ this.chart.active = on; if (on){ this.chart.resize(); } },
  open(sym){ this.sym = sym; T.save('sym', sym); this.renderRadar(); this.loadChart(true); },

  syncLayers(){
    T.save('layers2', this.chart.layers); const L = this.chart.layers;
    document.querySelectorAll('#mkLayers .layer').forEach(b => { const on = !!L[b.dataset.layer]; b.setAttribute('aria-pressed', on); b.querySelector('em').textContent = on ? 'on' : 'off'; });
    const cur = Object.keys(this.SCENES).find(k => this.LAYERS.every(l => this.SCENES[k].includes(l[0]) === !!L[l[0]]));
    document.querySelectorAll('#mkScenes .pill').forEach(b => b.setAttribute('aria-pressed', b.dataset.scene === cur));
    document.querySelectorAll('#mkTf .pill').forEach(b => b.setAttribute('aria-pressed', b.dataset.tf === this.tf));
    this.chart.draw();
  },

  /* ---- radar ---- */
  renderRadar(){
    const counts = {}; for (const s of T.symbols){ const g = T.groupOf(s); counts[g] = (counts[g] || 0) + 1; }
    document.getElementById('mkGroups').innerHTML = `<button class="pill" data-group="all" aria-pressed="${this.group === 'all'}">All ${T.symbols.length}</button>` +
      T.GROUPS.filter(g => counts[g[0]]).map(g => `<button class="pill" data-group="${g[0]}" aria-pressed="${this.group === g[0]}">${g[1]} ${counts[g[0]]}</button>`).join('');
    const strat = T.strategies(), rank = s => strat.some(x => x.stage === 'proven' && x.match && x.match(s)) ? 2 : strat.some(x => x.stage === 'leaning' && x.match && x.match(s)) ? 1 : 0;
    const list = T.symbols.filter(s => (this.group === 'all' || T.groupOf(s) === this.group) && (!this.q || s.toUpperCase().includes(this.q)))
      .map(s => ({ s, r: rank(s), pct: (T.quotes[s] || {}).pct })).sort((a, b) => b.r - a.r || Math.abs(b.pct || 0) - Math.abs(a.pct || 0) || a.s.localeCompare(b.s));
    document.getElementById('mkCount').textContent = list.length + ' shown · proven first, then biggest movers';
    const box = document.getElementById('mkRows'), keep = box.scrollTop;
    box.innerHTML = list.slice(0, 300).map(({ s, r, pct }) => { const q = T.quotes[s], sp = T.spreadPct(s), pv = r === 2 ? strat.find(x => x.stage === 'proven' && x.match && x.match(s)) : null;
      return `<button class="rowBtn" data-sym="${T.esc(s)}" aria-current="${s === this.sym}">
        <span class="l1"><b>${T.esc(T.base(s))}</b><span class="mono ${T.cls(pct)}">${q ? T.signed(pct, 2, '%') : ''}</span></span>
        ${pv ? `<span class="star">★ ${T.esc(pv.name)} is proven here</span>` : ''}
        <span class="l2"><span>${T.groupName(T.groupOf(s))}${sp != null ? ' · spread ' + T.num(sp, 3) + '%' : ''}</span><span class="mono">${q ? T.px(q.last, s) : ''}</span></span></button>`; }).join('')
      || `<div class="empty">${T.online ? 'Nothing matches.' : 'Waiting for the MT5 bridge.'}</div>`;
    box.scrollTop = keep;
    document.getElementById('mkSub').textContent = T.symbols.length ? 'Every instrument on your account, live from MT5. Markets with a proven strategy come first.' : 'Every instrument on your account.';
  },
  renderTitle(){
    if (!this.sym) return; const q = T.quotes[this.sym];
    document.getElementById('mkName').textContent = T.base(this.sym);
    document.getElementById('mkPx').textContent = q ? T.px(q.last, this.sym) : '';
    const c = document.getElementById('mkChg'); c.textContent = q ? T.signed(q.pct, 2, '% today') + ' · ' + T.groupName(T.groupOf(this.sym)) + ' · ' + this.tf + ' candles, broker time' : ''; c.className = 'sub';
  },

  /* ---- chart ---- */
  async loadChart(fresh){
    if (!this.sym || !T.online) return; const sym = this.sym, tf = this.tf, msg = document.getElementById('mkMsg');
    if (fresh){ msg.textContent = 'Loading ' + T.base(sym) + '…'; msg.style.display = ''; this.syncLayers(); this.renderTitle(); }
    try {
      const c = await T.candles(sym, tf, 600); if (sym !== this.sym || tf !== this.tf) return;
      if (c.length < 30){ msg.textContent = 'The broker has no ' + tf + ' candles for ' + T.base(sym) + ' right now.'; msg.style.display = ''; this.chart.set([], sym, tf); document.getElementById('mkRegime').innerHTML = ''; return; }
      msg.style.display = 'none';
      if (fresh || this.chart.sym !== sym || this.chart.tf !== tf) this.chart.set(c, sym, tf); else this.chart.tick(c);
      this.renderRegime(c); this.renderFile();
    } catch(e){ if (fresh){ msg.textContent = 'Could not load ' + T.base(sym) + ' from the bridge.'; msg.style.display = ''; } }
  },

  /* ---- the six regime readings: a description of the market, not a signal ---- */
  renderRegime(raw){
    const c = raw.slice(0, -1), n = c.length, el = document.getElementById('mkRegime'); if (n < 60){ el.innerHTML = ''; return; }
    const cl = c.map(b => b.close), last = cl[n - 1];
    let path = 0; for (let i = n - 20; i < n; i++) path += Math.abs(cl[i] - cl[i - 1]);
    const er = path ? Math.abs(last - cl[n - 21]) / path : 0, A = T.adx(c, 14) || { adx: 0, pdi: 0, mdi: 0 };
    const atr = T.atr(c, 14), atrPct = atr.map((v, i) => v ? v / cl[i] * 100 : null), win = atrPct.slice(-300).filter(v => v != null), cur = atrPct[n - 1], rankV = win.filter(v => v <= cur).length / win.length * 100;
    const m20 = T.sma(cl, 20)[n - 1]; let v = 0; for (let i = n - 20; i < n; i++) v += (cl[i] - m20) ** 2; const sd = Math.sqrt(v / 20), stretch = sd ? (last - m20) / sd : 0;
    const widths = []; for (let k = Math.max(20, n - 200); k <= n; k++){ const s = cl.slice(k - 20, k), mu = s.reduce((a, b) => a + b, 0) / 20; widths.push(Math.sqrt(s.reduce((a, b) => a + (b - mu) ** 2, 0) / 20) / mu); }
    const wNow = widths[widths.length - 1], wRank = widths.filter(x => x <= wNow).length / widths.length * 100, coiled = wRank <= 15;
    const vol = c.map(b => b.volume), vAvg = vol.slice(-21, -1).reduce((a, b) => a + b, 0) / 20, part = vAvg ? vol[n - 1] / vAvg : null;
    const up = A.pdi > A.mdi, dirTxt = Math.abs(A.pdi - A.mdi) < 4 ? 'flat' : up ? '▲ up' : '▼ down';
    let name, why;
    if (Math.abs(stretch) >= 2){ name = 'Stretched'; why = `Price sits ${T.num(Math.abs(stretch), 1)} standard deviations ${stretch > 0 ? 'above' : 'below'} its 20-candle average.`; }
    else if (coiled){ name = 'Coiled'; why = `The range is tighter than ${T.num(100 - wRank, 0)}% of the last 200 candles.`; }
    else if (er >= 0.4 && A.adx >= 25){ name = 'Trending ' + (up ? 'up' : 'down'); why = `${T.num(er * 100, 0)}% of the path walked was progress, and ADX reads ${T.num(A.adx, 0)}.`; }
    else if (er < 0.25 && A.adx < 20){ name = 'Ranging'; why = `Only ${T.num(er * 100, 0)}% of the path walked was progress, and ADX reads ${T.num(A.adx, 0)}.`; }
    else { name = 'No clear regime'; why = `ADX reads ${T.num(A.adx, 0)}, but only ${T.num(er * 100, 0)}% of the path walked was progress. The readings disagree.`; }
    const tile = (k, val, cls = '') => `<div class="tile"><span class="k">${k}</span><span class="mono ${cls}">${val}</span></div>`;
    el.innerHTML = `<div class="verdict"><span class="sub">Regime on the last closed ${this.tf} candle</span><b>${name}</b><span style="color:var(--text2);text-wrap:pretty">${why} This describes the market. As a trade trigger it lost to random entries, so it is never used as one.</span></div>
      <div class="six">${tile('Trend strength', T.num(er, 2) + ' · ADX ' + T.num(A.adx, 0))}${tile('Direction', dirTxt, up && dirTxt !== 'flat' ? 'up' : dirTxt === 'flat' ? '' : 'down')}${tile('Volatility', T.num(cur, 2) + '% · ' + T.num(rankV, 0) + 'th')}${tile('Compression', coiled ? 'on' : 'off')}${tile('Stretch', T.signed(stretch, 2, 'σ'))}${tile('Participation', part != null ? T.num(part, 2) + '×' : '–')}</div>`;
  },
  renderFile(){
    const pv = T.onFile(this.sym, 'proven'), ln = T.onFile(this.sym, 'leaning'), el = document.getElementById('mkFile');
    const row = (s, cls) => `<a class="item ${cls}" href="#lab/${s.id}"><b>${T.esc(s.name)}</b><span>${T.esc(s.line)} · ${T.esc(s.origin)}</span></a>`;
    el.innerHTML = `<div class="hd" style="margin-bottom:8px"><h3 style="font-family:var(--font-head);font-size:14px">On file for ${T.esc(T.base(this.sym))}</h3></div><div class="list">` +
      (pv.length || ln.length ? pv.map(s => row(s, 'proven')).join('') + ln.map(s => row(s, 'info')).join('') : `<div class="empty">Nothing proven or leaning applies to this market yet.</div>`) + `</div>`;
  },
};
