/* ASTRA Terminal — Intel: the Observer's window on the world.
   Live crypto news with lexicon sentiment scoring, macro-risk detection matched
   against a curated history book of market shocks, long BTC history with
   pattern-analog matching ("history echoes"), and Fear & Greed context.
   All summaries and lessons below are original editorial notes on public facts. */
const Intel = {
  news: [],
  sentiment: 0,
  risk: { level: 0, label: '', lesson: '' },
  fetchedAt: 0,
  fng: null,
  btcDaily: null,
  analogs: null,
  fngInsight: null,

  /* sentiment lexicon (headline scoring) */
  POS: {
    approval: 3, approve: 3, etf: 2, adoption: 3, adopt: 2, partnership: 2, inflow: 3, inflows: 3,
    rally: 3, surge: 3, soar: 3, breakout: 2, record: 2, 'all-time': 3, bullish: 3, upgrade: 2,
    institutional: 2, accumulation: 2, halving: 1, launch: 1, integrate: 2, license: 2, approved: 3,
    buy: 1, buys: 2, bought: 1, gains: 2, jumps: 2, recovers: 2, recovery: 2, growth: 2, invest: 1,
  },
  NEG: {
    hack: -4, hacked: -4, exploit: -4, stolen: -3, theft: -3, ban: -3, bans: -3, banned: -3,
    lawsuit: -3, sues: -3, sued: -3, sec: -1, crackdown: -3, crash: -4, plunge: -3, plunges: -3,
    dump: -2, tumble: -2, tumbles: -2, selloff: -3, 'sell-off': -3, liquidation: -3, liquidations: -3,
    bankruptcy: -4, bankrupt: -4, insolvency: -4, insolvent: -4, default: -3, collapse: -4,
    depeg: -4, depegs: -4, war: -4, invasion: -4, invades: -4, missile: -3, missiles: -3,
    sanctions: -2, outflow: -2, outflows: -3, delist: -3, scam: -3, fraud: -3, rug: -3,
    bearish: -3, fears: -2, fear: -1, warning: -2, halt: -3, halts: -3, halted: -3, frozen: -3,
    inflation: -1, recession: -2, tariff: -2, tariffs: -2,
  },

  /* the history book: original one-line summaries of well-known market shocks */
  EVENTS: [
    { date: '2020-03-12', name: 'COVID liquidity crash', move: 'BTC roughly halved within two days',
      lesson: 'In a global panic everything is sold at once — crypto included. The first drop overshot; patient re-entry was rewarded within months.',
      triggers: ['pandemic', 'lockdown', 'virus', 'outbreak', 'quarantine'] },
    { date: '2021-05-19', name: 'China mining ban + leverage flush', move: 'BTC lost about half its value over weeks',
      lesson: 'Regulatory bans from major economies start long corrections, not one-day dips.',
      triggers: ['china ban', 'mining ban', 'bans mining', 'bans crypto'] },
    { date: '2022-02-24', name: 'Russia invades Ukraine', move: 'sharp instant risk-off drop, partial rebound within days, but pressure lasted all year',
      lesson: 'War headlines cause a violent first drop with extreme volatility. The initial panic often overshoots, but a war also feeds months of macro pressure — caution beats bravado.',
      triggers: ['war', 'invasion', 'invades', 'troops', 'missile', 'strikes', 'nuclear', 'attack on'] },
    { date: '2022-05-09', name: 'LUNA / UST collapse', move: 'a top-10 coin went to zero in days and dragged the whole market down',
      lesson: 'A stablecoin losing its peg is a systemic alarm — contagion spreads fast.',
      triggers: ['depeg', 'stablecoin collapse', 'loses peg', 'peg'] },
    { date: '2022-11-08', name: 'FTX collapse', move: 'BTC fell about a quarter in a week as a top exchange failed',
      lesson: 'When an exchange halts withdrawals, insolvency rumours are usually true — contagion follows for weeks.',
      triggers: ['withdrawals halted', 'halts withdrawals', 'insolvency', 'insolvent', 'exchange collapse', 'bankruptcy'] },
    { date: '2023-03-10', name: 'SVB bank stress / USDC wobble', move: 'USDC briefly depegged when its bank failed; it recovered in days',
      lesson: 'Bank stress hits stablecoins first; short panics around solvent issuers can reverse quickly.',
      triggers: ['bank collapse', 'bank failure', 'bank run'] },
    { date: '2024-01-10', name: 'Spot Bitcoin ETF approval', move: 'institutional inflows began a new demand regime',
      lesson: 'Big regulatory green lights change the buyer base for months, not hours.',
      triggers: ['etf approval', 'etf approved', 'spot etf'] },
    { date: '2024-04-20', name: 'Fourth halving', move: 'new supply halved; historically strength followed within 12–18 months',
      lesson: 'Halvings are slow-burning fuel, not instant fireworks.',
      triggers: ['halving'] },
    { date: '2022 (all year)', name: 'Fed rate-hike cycle', move: 'rising rates pressured all risk assets through the year',
      lesson: 'When central banks tighten, crypto swims against the current; when they cut, the current helps.',
      triggers: ['rate hike', 'rate hikes', 'hawkish', 'tightening', 'raises rates'] },
  ],

  init(){
    this.refresh();
    setInterval(() => this.refresh(), 5 * 60 * 1000);
    this.loadHistory();
  },

  /* ---------------- news + sentiment (headlines + links only, credited to their sources) ---------------- */
  FEEDS: [
    'https://cointelegraph.com/rss',
    'https://www.coindesk.com/arc/outboundfeeds/rss/',
  ],

  parseDate(d){
    const s = String(d || '');
    const t = new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime();
    return isNaN(t) ? Date.now() : t;
  },

  async refresh(){
    try {
      const results = await Promise.allSettled(this.FEEDS.map(f =>
        fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(f)).then(r => r.json())));
      const items = [];
      for (const res of results){
        if (res.status !== 'fulfilled' || !res.value || res.value.status !== 'ok') continue;
        const src = ((res.value.feed && res.value.feed.title) || 'news').split(/[.:—–-]/)[0].trim();
        for (const it of res.value.items || []){
          items.push({
            t: this.parseDate(it.pubDate),
            title: it.title || '',
            source: src,
            url: it.link || '',
            score: this.scoreTitle(it.title || ''),
          });
        }
      }
      if (!items.length) throw new Error('no items from feeds');
      items.sort((a, b) => b.t - a.t);
      this.news = items.slice(0, 40);
      this.fetchedAt = Date.now();
      this.computeSentiment();
      this.assessRisk();
      BUS.emit('intel');
      const p = document.getElementById('bot-intel');
      if (p && p.classList.contains('active')) this.render();
    } catch(e){
      console.warn('news unavailable:', e.message);
    }
  },

  scoreTitle(title){
    const words = title.toLowerCase().replace(/[^a-z0-9\- ]/g, ' ').split(/\s+/);
    let s = 0;
    for (const w of words){
      if (this.POS[w] != null) s += this.POS[w];
      if (this.NEG[w] != null) s += this.NEG[w];
    }
    const low = title.toLowerCase();
    for (const phrase of ['all-time high', 'record high']) if (low.includes(phrase)) s += 3;
    for (const phrase of ['halts withdrawals', 'withdrawals halted', 'loses peg']) if (low.includes(phrase)) s -= 4;
    return s;
  },

  computeSentiment(){
    if (!this.news.length){ this.sentiment = 0; return; }
    const now = Date.now();
    let sum = 0, wsum = 0;
    for (const n of this.news){
      const age = (now - n.t) / 3600000;
      const w = Math.pow(0.5, age / 6);         // 6h half-life
      sum += n.score * w; wsum += w;
    }
    const raw = wsum ? sum / wsum : 0;          // roughly -4..+4
    this.sentiment = Math.max(-100, Math.min(100, Math.round(raw * 25)));
  },

  assessRisk(){
    const cutoff = Date.now() - 36 * 3600000;
    const recent = this.news.filter(n => n.t > cutoff);
    let best = null, hits = 0;
    for (const ev of this.EVENTS){
      let c = 0;
      for (const n of recent){
        const low = n.title.toLowerCase();
        if (ev.triggers.some(tr => low.includes(tr))) c++;
      }
      if (c > 0 && (!best || c > hits)){ best = ev; hits = c; }
    }
    const negRatio = recent.length ? recent.filter(n => n.score <= -3).length / recent.length : 0;
    let level = 0;
    if (best && hits >= 2) level = 2;
    else if (best || negRatio > 0.3) level = 1;
    if (best && hits >= 3) level = 3;
    this.risk = best
      ? { level, label: hits + ' headline' + (hits > 1 ? 's' : '') + ' echo "' + best.name + '" (' + best.date + ')', lesson: best.lesson, event: best }
      : { level, label: level ? 'unusually negative news flow' : '', lesson: level ? 'Broadly negative headlines — signals deserve extra doubt.' : '' };
  },

  /* ---------------- long history + analogs ---------------- */
  async loadHistory(){
    try {
      this.btcDaily = await this.fetchBtcDaily();
      this.computeAnalogs();
    } catch(e){ console.warn('history unavailable:', e.message); }
    try {
      const r = await fetch('https://api.alternative.me/fng/?limit=0&format=json');
      const j = await r.json();
      this.fng = (j.data || []).map(d => ({ t: +d.timestamp * 1000, v: +d.value, cls: d.value_classification }));
      this.computeFngInsight();
    } catch(e){ console.warn('fng history unavailable:', e.message); }
    BUS.emit('intel');
  },

  async fetchBtcDaily(){
    const cached = lsGet('astra_btc1d', null);
    if (cached && Date.now() - cached.t < 86400000) return cached.d;
    let out = [], start = 1502928000000; // BTC/USDT listing era, Aug 2017
    for (let i = 0; i < 5; i++){
      const chunk = await API.fetchJSON(`/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${start}`);
      if (!chunk.length) break;
      out = out.concat(chunk.map(k => [k[0], +k[4]]));
      if (chunk.length < 1000) break;
      start = chunk[chunk.length - 1][0] + 86400000;
    }
    lsSet('astra_btc1d', { t: Date.now(), d: out });
    return out;
  },

  retVec(cl, s, W){
    const v = [];
    for (let i = s + 1; i < s + W; i++) v.push((cl[i] - cl[i - 1]) / cl[i - 1]);
    return v;
  },

  pearson(a, b){
    const n = Math.min(a.length, b.length);
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++){ ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++){
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
    }
    const den = Math.sqrt(da * db);
    return den ? num / den : 0;
  },

  computeAnalogs(){
    const d = this.btcDaily;
    if (!d || d.length < 400) return;
    const closes = d.map(x => x[1]);
    const W = 30, F = 30;
    const cur = this.retVec(closes, closes.length - W, W);
    const found = [];
    for (let s = 0; s + W + F < closes.length - 60; s++){
      const corr = this.pearson(cur, this.retVec(closes, s, W));
      if (corr > 0.6){
        const fwd = (closes[s + W + F - 1] - closes[s + W - 1]) / closes[s + W - 1] * 100;
        found.push({ i: s, t: d[s + W - 1][0], corr, fwd });
      }
    }
    found.sort((a, b) => b.corr - a.corr);
    const picked = [];
    for (const r of found){
      if (picked.every(p => Math.abs(p.i - r.i) > 20)) picked.push(r);
      if (picked.length >= 3) break;
    }
    this.analogs = {
      picked,
      avgFwd: picked.length ? +(picked.reduce((a, b) => a + b.fwd, 0) / picked.length).toFixed(1) : null,
      at: Date.now(),
    };
  },

  computeFngInsight(){
    if (!this.fng || !this.fng.length || !this.btcDaily) return;
    const cur = this.fng[0];
    const all = this.fng.map(x => x.v);
    const pct = Math.round(all.filter(v => v <= cur.v).length / all.length * 100);
    const dayIdx = new Map(this.btcDaily.map((x, i) => [Math.floor(x[0] / 86400000), i]));
    let sum = 0, n = 0;
    for (const f of this.fng){
      if (Math.abs(f.v - cur.v) > 5) continue;
      const i = dayIdx.get(Math.floor(f.t / 86400000));
      if (i == null || i + 30 >= this.btcDaily.length) continue;
      sum += (this.btcDaily[i + 30][1] - this.btcDaily[i][1]) / this.btcDaily[i][1] * 100;
      n++;
    }
    this.fngInsight = { now: cur.v, cls: cur.cls, pct, fwdAvg: n ? +(sum / n).toFixed(1) : null, n };
  },

  newsFresh(){ return this.fetchedAt && Date.now() - this.fetchedAt < 20 * 60 * 1000; },

  /* ---------------- rendering (INTEL bottom tab) ---------------- */
  render(){
    const moodEl = document.getElementById('inMood');
    if (!moodEl) return;
    const s = this.sentiment;
    const cls = s > 15 ? 'up' : s < -15 ? 'down' : 'flat';
    moodEl.innerHTML =
      `<div class="obStat"><label>NEWS MOOD</label><b class="${cls}">${s > 0 ? '+' : ''}${s} ${s > 25 ? 'positive' : s < -25 ? 'negative' : 'mixed'}</b></div>` +
      (this.fngInsight
        ? `<div class="obStat"><label>FEAR &amp; GREED</label><b>${this.fngInsight.now} · ${esc(this.fngInsight.cls)}</b></div>` +
          `<div class="obStat"><label>VS HISTORY</label><b>lower than ${100 - this.fngInsight.pct}% of all days</b></div>` +
          (this.fngInsight.fwdAvg != null
            ? `<div class="obStat"><label>AFTER SIMILAR MOOD (30D)</label><b class="${pctClass(this.fngInsight.fwdAvg)}">BTC averaged ${fmtPct(this.fngInsight.fwdAvg)} (${this.fngInsight.n} cases)</b></div>` : '')
        : '') +
      (this.risk.level
        ? `<div class="aiRisk">⚠ ${esc(this.risk.label)}<br><span>${esc(this.risk.lesson)}</span></div>`
        : '<div class="obStat"><label>MACRO RISK</label><b class="up">no shock patterns in today\'s headlines</b></div>');

    const newsEl = document.getElementById('inNews');
    newsEl.innerHTML = this.news.length ? this.news.slice(0, 25).map(n =>
      `<a class="newsRow" href="${esc(n.url)}" target="_blank" rel="noopener">` +
      `<span class="nScore ${n.score > 1 ? 'up' : n.score < -1 ? 'down' : 'flat'}">${n.score > 1 ? '▲' : n.score < -1 ? '▼' : '·'}</span>` +
      `<span class="nTitle">${esc(n.title)}</span>` +
      `<span class="dim2">${esc(n.source)} · ${new Date(n.t).toLocaleTimeString()}</span></a>`).join('')
      : '<div class="empty">News feed unavailable right now.</div>';

    document.getElementById('inEvents').innerHTML = this.EVENTS.map(ev =>
      `<div class="evRow"><b>${esc(ev.date)} — ${esc(ev.name)}</b><span>${esc(ev.move)}.</span><i>${esc(ev.lesson)}</i></div>`).join('');

    const twinEl = document.getElementById('inTwins');
    if (this.analogs && this.analogs.picked.length){
      twinEl.innerHTML = this.analogs.picked.map(p =>
        `<div class="obRow"><b>${new Date(p.t).toLocaleDateString()}</b>` +
        `<span>match ${(p.corr * 100).toFixed(0)}%</span>` +
        `<span class="${pctClass(p.fwd)}">30 days later: ${fmtPct(p.fwd)}</span></div>`).join('') +
        `<div class="aiSub" style="padding:4px 2px">Average outcome after the ${this.analogs.picked.length} closest matches: <b class="${pctClass(this.analogs.avgFwd)}">${fmtPct(this.analogs.avgFwd)}</b> — BTC daily, last 30 days vs ~8 years of history.</div>`;
    } else {
      twinEl.innerHTML = '<div class="empty">' + (this.btcDaily ? 'No strong historical match for the current pattern.' : 'Loading BTC history…') + '</div>';
    }
  },
};
