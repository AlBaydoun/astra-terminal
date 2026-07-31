/* ASTRA Terminal — crypto heatmap (treemap sized by market cap, colored by 24h change) */
const Heat = {
  data: null,
  src: '',
  rects: [],
  timer: null,

  async load(){
    try {
      const d = await API.gecko('/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h');
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
    const items = this.data.slice(0, 60);
    const total = items.reduce((a, b) => a + b.w, 0);
    this.rects = [];
    this.split(items.map(i => ({ ...i, area: i.w / total * W * H })), 0, 0, W, H);
    for (const r of this.rects) this.cell(ctx, r);
    const srcEl = document.getElementById('heatSrc');
    if (srcEl) srcEl.textContent = this.src;
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
      const sym = r.name + 'USDT';
      if (STORE.tickers.has(sym)) App.setSymbol(sym);
      else toast(r.name + ' is not tradable on Binance as a USDT pair', 'warn');
    });
    new ResizeObserver(() => this.draw()).observe(document.getElementById('heatWrap'));
  },
};
