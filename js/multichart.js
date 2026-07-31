/* ASTRA Terminal — multi-chart layouts: 1 main chart + up to 3 independent mini charts */
const Multi = {
  layout: parseInt(localStorage.getItem('astra_layout'), 10) || 1,
  minis: lsGet('astra_minis', [
    { sym: 'ETHUSDT', tf: '1h' },
    { sym: 'SOLUSDT', tf: '1h' },
    { sym: 'BNBUSDT', tf: '1h' },
  ]),
  cells: [],

  init(){
    this.grid = document.getElementById('chartGrid');
    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.addEventListener('click', () => this.setLayout(parseInt(b.dataset.l, 10))));
    BUS.on('tickers', ch => this.tick(ch));
    if (this.layout > 1) this.setLayout(this.layout);
    else this.markActive();
  },

  markActive(){
    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.l, 10) === this.layout));
  },

  setLayout(n){
    this.layout = n;
    localStorage.setItem('astra_layout', n);
    this.grid.className = 'layout-' + n;
    this.markActive();
    this.cells.forEach(c => this.destroyCell(c));
    this.cells = [];
    for (let i = 0; i < n - 1; i++) this.createCell(i);
  },

  createCell(i){
    const conf = this.minis[i] || { sym: 'ETHUSDT', tf: '1h' };
    const el = document.createElement('div');
    el.className = 'miniCell';
    el.innerHTML =
      `<div class="miniHead">` +
      `<button class="miniSym"><b></b><span class="miniPx"></span><span class="miniPct"></span></button>` +
      `<select class="miniTf">${CFG.TFS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` +
      `</div><div class="miniChart"></div>`;
    this.grid.appendChild(el);
    const chart = LightweightCharts.createChart(el.querySelector('.miniChart'), Chart.chartOpts());
    const series = chart.addCandlestickSeries({
      upColor: CFG.UP, downColor: CFG.DOWN, wickUpColor: CFG.UP, wickDownColor: CFG.DOWN, borderVisible: false,
    });
    const cell = { i, sym: conf.sym, tf: conf.tf, el, chart, series, sock: null };
    el.querySelector('.miniSym').addEventListener('click', () =>
      SymbolSearch.open(sym => { cell.sym = sym; this.saveMinis(); this.loadCell(cell); }));
    const tfSel = el.querySelector('.miniTf');
    tfSel.value = conf.tf;
    tfSel.addEventListener('change', () => { cell.tf = tfSel.value; this.saveMinis(); this.loadCell(cell); });
    this.cells.push(cell);
    this.loadCell(cell);
  },

  async loadCell(cell){
    if (cell.sock){ cell.sock.close(); cell.sock = null; }
    cell.el.querySelector('.miniSym b').textContent = baseAsset(cell.sym) + '/USDT';
    this.tick([cell.sym]);
    let data;
    try { data = await API.klines(cell.sym, cell.tf, 300); }
    catch(e){ toast('Could not load ' + baseAsset(cell.sym), 'error'); return; }
    if (!this.cells.includes(cell)) return;
    cell.series.setData(data.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    try { cell.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 80), to: data.length + 4 }); } catch(e){}
    cell.sock = new Sock([`${cell.sym.toLowerCase()}@kline_${cell.tf}`], d => {
      const k = d.k;
      if (!k) return;
      try { cell.series.update({ time: k.t / 1000 + TZ_OFF, open: +k.o, high: +k.h, low: +k.l, close: +k.c }); } catch(e){}
    }, 'mini' + cell.i);
  },

  destroyCell(cell){
    if (cell.sock) cell.sock.close();
    try { cell.chart.remove(); } catch(e){}
    cell.el.remove();
  },

  saveMinis(){
    this.minis = this.cells.map(c => ({ sym: c.sym, tf: c.tf }));
    lsSet('astra_minis', this.minis);
  },

  tick(changed){
    for (const cell of this.cells){
      if (changed.indexOf(cell.sym) === -1) continue;
      const t = STORE.tickers.get(cell.sym);
      if (!t) continue;
      cell.el.querySelector('.miniPx').textContent = fmtPrice(t.last);
      const p = cell.el.querySelector('.miniPct');
      p.textContent = fmtPct(t.pct);
      p.className = 'miniPct ' + pctClass(t.pct);
    }
  },

  applyTheme(){
    const c = Chart.themeColors();
    const opts = {
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    };
    this.cells.forEach(cell => { try { cell.chart.applyOptions(opts); } catch(e){} });
  },
};
