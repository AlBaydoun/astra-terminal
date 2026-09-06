/* ASTRA Terminal — bot performance reports.

   One page that answers a single question: WHICH BOT HAS EARNED THE RIGHT TO GO
   LIVE? Nothing in this application can send an order to a broker; every figure
   here comes from paper trades and backtests. The readiness checklist is the
   decision aid, not a permission slip. */
const BotReports = {

  /* what a bot must show before it is even a candidate for live money */
  READY: [
    { k: 'trades',  label: 'At least 40 finished paper trades', test: r => r.trades >= 40,
      got: r => r.trades + ' so far' },
    { k: 'pf',      label: 'Paper profit factor 1.30 or better', test: r => r.pf >= 1.3,
      got: r => r.trades ? (r.pf === Infinity ? '∞' : r.pf.toFixed(2)) : 'no trades' },
    { k: 'dd',      label: 'Worst drawdown 15% or less', test: r => r.trades > 0 && r.maxDD <= 15,
      got: r => r.maxDD.toFixed(1) + '%' },
    { k: 'spread',  label: 'Profitable on two or more instruments', test: r => r.symsWon >= 2,
      got: r => r.symsWon + ' of ' + r.symsTraded },
    { k: 'bt',      label: 'A backtest agrees (profit factor 1.20+)', test: r => r.bt && r.bt.pf != null && r.bt.pf >= 1.2,
      got: r => r.bt ? (r.bt.pf == null ? '∞' : r.bt.pf.toFixed(2)) : 'never measured' },
    { k: 'brain',   label: 'The Master Brain has a measured edge', test: () => {
        const m = (MasterBrain.state || MasterBrain.load()).metrics;
        return !!(m && m.edge > 1);
      }, got: () => {
        const m = (MasterBrain.state || MasterBrain.load()).metrics;
        return m ? 'edge ' + m.edge : 'not trained';
      } },
  ],

  /* ---------- data ---------- */
  rows(){
    const btLog = Bots.backtestLog();
    const out = [];
    for (const b of BOTS){
      if (Bots.isPage(b)) continue;
      const L = Bots.ledger(b.id);
      if (!L) continue;
      const st = BotEngine.stats(L);
      const per = Bots.perInstrument(b.id);
      const syms = Object.entries(per);
      const rMul = L.closed.map(t => t.r).filter(x => typeof x === 'number');
      out.push({
        id: b.id, name: b.name, lab: !!b.lab, manual: !!b.manual,
        tf: (Bots.cfg(b.id) || {}).tf,
        equity: st.equity, pnl: st.pnl, pnlPct: st.pnlPct, trades: st.trades,
        winRate: st.winRate, pf: st.profitFactor, avgR: st.avgR, maxDD: st.maxDD,
        fees: st.fees, open: st.openCount,
        symsTraded: syms.length, symsWon: syms.filter(([, v]) => v.net > 0).length,
        per, rMul, curve: (L.equityCurve || []).map(e => e.eq),
        bt: btLog[b.id] || null,
        evidence: b.recipe ? b.recipe.evidence : null,
      });
    }
    for (const r of out){
      r.checks = this.READY.map(c => ({ label: c.label, ok: !!c.test(r), got: c.got(r) }));
      r.ready = r.checks.filter(c => c.ok).length;
      /* ranking: real money made per unit of pain, weighted by how much evidence
         there is — a two-trade winner cannot outrank a hundred-trade one */
      const depth = Math.min(1, r.trades / 40);
      const pf = r.pf === Infinity ? 3 : Math.min(r.pf || 0, 3);
      r.rank = +(r.avgR * depth * (0.5 + pf / 3) * Math.max(0.2, 1 - r.maxDD / 40)).toFixed(4);
    }
    return out.sort((a, b) => b.rank - a.rank);
  },

  fleet(rows){
    const t = { trades: 0, pnl: 0, fees: 0, wins: 0, bots: rows.length, open: 0 };
    for (const r of rows){
      t.trades += r.trades; t.pnl += r.pnl; t.fees += r.fees; t.open += r.open;
      t.wins += Math.round(r.trades * r.winRate / 100);
    }
    t.winRate = t.trades ? t.wins / t.trades * 100 : 0;
    return t;
  },

  /* ---------- little charts, drawn as plain SVG so they print ---------- */
  C: { up: '#2ebd85', down: '#f6465d', dim: '#8fa3c8', grid: 'rgba(140,165,215,0.18)', accent: '#00e5ff' },

  spark(vals, w, h, color){
    if (!vals || vals.length < 2) return `<div class="rpEmpty">no equity curve yet</div>`;
    const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
    const pts = vals.map((v, i) =>
      (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - (v - lo) / span * h).toFixed(1)).join(' ');
    const base = (h - (vals[0] - lo) / span * h).toFixed(1);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="rpSpark">
      <polyline points="0,${base} ${w},${base}" stroke="${this.C.grid}" stroke-width="1" stroke-dasharray="3 3" fill="none"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  },

  donut(pct, label, sub){
    const r = 34, c = 2 * Math.PI * r;
    const on = Math.max(0, Math.min(100, pct || 0));
    const col = on >= 50 ? this.C.up : on >= 40 ? '#ffb03a' : this.C.down;
    return `<div class="rpDonut">
      <svg viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="${r}" fill="none" stroke="${this.C.grid}" stroke-width="9"/>
        <circle cx="45" cy="45" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${(c * on / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 45 45)"/>
        <text x="45" y="49" text-anchor="middle" class="rpDonutN">${Math.round(on)}%</text>
      </svg>
      <b>${esc(label)}</b><span>${esc(sub || '')}</span></div>`;
  },

  /* horizontal bars that run both ways from a centre line */
  diverging(rows, unit){
    if (!rows.length) return '<div class="rpEmpty">nothing to show yet</div>';
    const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
    return '<div class="rpBars">' + rows.map(r => {
      const pct = Math.abs(r.value) / max * 50;
      const pos = r.value >= 0;
      return `<div class="rpBar">
        <label title="${esc(r.label)}">${esc(r.label)}</label>
        <div class="rpTrack">
          <i class="${pos ? 'p' : 'n'}" style="${pos ? 'left:50%' : 'right:50%'};width:${pct.toFixed(1)}%"></i>
          <u></u>
        </div>
        <b class="${pos ? 'up' : 'down'}">${pos ? '+' : ''}${fmtNum(r.value)}${unit || ''}</b>
      </div>`;
    }).join('') + '</div>';
  },

  /* how the finished trades are spread across R multiples */
  rHist(all){
    const buckets = [
      { lo: -Infinity, hi: -2, label: '≤ −2R' }, { lo: -2, hi: -1, label: '−2 to −1R' },
      { lo: -1, hi: 0, label: '−1 to 0R' }, { lo: 0, hi: 1, label: '0 to 1R' },
      { lo: 1, hi: 2, label: '1 to 2R' }, { lo: 2, hi: Infinity, label: '≥ 2R' },
    ];
    const counts = buckets.map(b => all.filter(r => r > b.lo && r <= b.hi).length);
    const max = Math.max(1, ...counts);
    if (!all.length) return '<div class="rpEmpty">no finished trades yet</div>';
    return '<div class="rpHist">' + buckets.map((b, i) => {
      const h = counts[i] / max * 100;
      const col = b.hi <= 0 ? this.C.down : this.C.up;
      return `<div class="rpCol"><span>${counts[i]}</span>
        <i style="height:${h.toFixed(1)}%;background:${col}"></i><label>${b.label}</label></div>`;
    }).join('') + '</div>';
  },

  readyBar(r){
    const n = this.READY.length;
    return `<div class="rpReady" title="${r.ready} of ${n} conditions met">` +
      r.checks.map(c => `<i class="${c.ok ? 'ok' : ''}"></i>`).join('') +
      `<b>${r.ready}/${n}</b></div>`;
  },

  verdict(r){
    if (!r.trades) return { cls: 'idle', text: 'Never traded — nothing to judge' };
    if (r.ready === this.READY.length) return { cls: 'good', text: 'Meets every condition — still paper until you decide' };
    const missing = r.checks.filter(c => !c.ok);
    if (r.ready >= 4) return { cls: 'warn', text: 'Close — ' + missing[0].label.toLowerCase() };
    if (r.pnl < 0) return { cls: 'bad', text: 'Losing money on paper — do not consider it' };
    return { cls: 'idle', text: 'Not enough evidence — ' + missing[0].label.toLowerCase() };
  },

  pf(v){ return v == null ? '—' : (v === Infinity ? '∞' : v.toFixed(2)); },

  /* ---------- the page ---------- */
  view(){
    const rows = this.rows();
    const f = this.fleet(rows);
    const best = rows.find(r => r.trades > 0) || null;
    const traded = rows.filter(r => r.trades > 0);
    const m = (MasterBrain.state || MasterBrain.load()).metrics;
    const lab = (typeof StratLab !== 'undefined') ? StratLab.load() : { recipes: [], log: [], tried: 0 };
    const liveLab = lab.recipes.filter(r => !r.retired);

    const kpis = `<div class="botStats">
      ${Bots.stat('BOTS UNDER TEST', rows.length)}
      ${Bots.stat('PAPER TRADES', f.trades)}
      ${Bots.stat('FLEET P&L', (f.pnl >= 0 ? '+' : '') + fmtNum(f.pnl), f.pnl)}
      ${Bots.stat('FLEET WIN RATE', Math.round(f.winRate) + '%')}
      ${Bots.stat('FEES PAID', fmtNum(f.fees), -1)}
      ${Bots.stat('OPEN NOW', f.open)}
      ${Bots.stat('LAB BOTS', liveLab.length + ' of ' + lab.recipes.length)}
      ${Bots.stat('BRAIN EDGE', m ? (m.edge > 0 ? '+' : '') + m.edge : 'untrained', m ? m.edge : 0)}
    </div>`;

    const rcols = [['name', 'Bot', 0], ['tf', 'TF', 0], ['pnl', 'Paper P&L', 1], ['trades', 'Trades', 1],
      ['winRate', 'Win', 1], ['pf', 'PF', 1], ['avgR', 'Avg R', 1], ['maxDD', 'Max DD', 1],
      ['btPf', 'Backtest PF', 1], ['ready', 'Ready', 1], [null, 'Verdict', 0]];
    const sortedRows = Bots.sortRows('rpRank', rows, 'rank', (r, k) =>
      k === 'pf' ? (r.pf === Infinity ? 999 : r.pf)
      : k === 'maxDD' ? -r.maxDD
      : k === 'btPf' ? (r.bt ? (r.bt.pf == null ? 999 : r.bt.pf) : null)
      : k === 'rank' ? r.rank : r[k]);
    const table = `<table class="rpTable">
      <thead>${Bots.sortHead('rpRank', rcols, 'rank')}</thead>
      <tbody>${sortedRows.map(r => {
        const v = this.verdict(r);
        return `<tr data-gobot="${esc(r.id)}">
          <td class="c-sym">${esc(r.name)}${r.lab ? ' <i class="rpTag">LAB</i>' : ''}</td>
          <td>${esc(r.tf || '—')}</td>
          <td class="num ${pctClass(r.pnl)}">${(r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl)}</td>
          <td class="num">${r.trades}</td>
          <td class="num">${r.trades ? Math.round(r.winRate) + '%' : '—'}</td>
          <td class="num">${r.trades ? this.pf(r.pf) : '—'}</td>
          <td class="num ${pctClass(r.avgR)}">${r.trades ? r.avgR.toFixed(2) : '—'}</td>
          <td class="num">${r.trades ? '-' + r.maxDD.toFixed(1) + '%' : '—'}</td>
          <td class="num">${r.bt ? this.pf(r.bt.pf) : '—'}</td>
          <td>${this.readyBar(r)}</td>
          <td class="rpVerdict ${v.cls}">${esc(v.text)}</td></tr>`;
      }).join('')}</tbody></table>`;

    const pnlBars = this.diverging(rows.filter(r => r.trades).map(r => ({ label: r.name, value: r.pnl })));
    const donuts = traded.slice(0, 6).map(r =>
      this.donut(r.winRate, r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name,
        r.trades + ' trades · ' + this.pf(r.pf) + ' PF')).join('') || '<div class="rpEmpty">no finished trades yet</div>';
    const curves = traded.slice(0, 6).map(r =>
      `<div class="rpCurve"><label>${esc(r.name)}</label>
        ${this.spark(r.curve, 260, 46, r.pnl >= 0 ? this.C.up : this.C.down)}
        <span class="${pctClass(r.pnl)}">${(r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl)}</span></div>`).join('')
      || '<div class="rpEmpty">no equity curves yet</div>';

    const allR = [].concat(...rows.map(r => r.rMul));

    /* which instruments the whole fleet actually earns on */
    const insTotals = {};
    for (const r of rows) for (const [sym, v] of Object.entries(r.per)){
      const o = insTotals[sym] = insTotals[sym] || { net: 0, n: 0 };
      o.net += v.net; o.n += v.n;
    }
    const insBars = this.diverging(Object.entries(insTotals)
      .sort((a, b) => b[1].net - a[1].net)
      .map(([sym, v]) => ({ label: baseAsset(sym) + ' (' + v.n + ')', value: v.net })));

    const labLog = (lab.log || []).slice(0, 10).map(l =>
      `<div class="botLog"><span class="dim2">${new Date(l.t).toLocaleString()}</span> ${esc(l.text)}</div>`).join('')
      || '<div class="empty">The lab has not run yet</div>';

    return `<div class="rpWrap">
      <div class="rpHead">
        <div><b>PERFORMANCE REPORT</b><span>${new Date().toLocaleString()} · every figure below is play money</span></div>
        <div class="rpBtns">
          <button class="bBtn" data-act="assessAll">Test every bot</button>
          <button class="bBtn" data-act="xls">Export Excel</button>
          <button class="bBtn" data-act="pdf">Export PDF</button>
        </div>
      </div>
      <div class="rpLive">This page decides <b>nothing on its own</b>. There is no order path to any broker anywhere in
        ASTRA — every trade above is virtual. The point of the test is to find which single bot has earned the right to be
        considered for real money, and that decision stays yours.</div>
      ${kpis}
      ${best ? `<div class="rpBest"><span>BEST ON EVIDENCE SO FAR</span><b>${esc(best.name)}</b>
        <i>${best.trades} trades · ${Math.round(best.winRate)}% win · ${this.pf(best.pf)} profit factor ·
        ${best.avgR.toFixed(2)}R average · ${best.ready} of ${this.READY.length} live conditions met</i></div>` : ''}
      <div class="botH">RANKING — WHICH BOT WOULD YOU TRUST?</div>
      ${table}
      <div class="rpGrid">
        <div class="rpCard"><div class="botH">PROFIT AND LOSS BY BOT</div>${pnlBars}</div>
        <div class="rpCard"><div class="botH">WIN RATE</div><div class="rpDonuts">${donuts}</div></div>
        <div class="rpCard"><div class="botH">EQUITY CURVES</div>${curves}</div>
        <div class="rpCard"><div class="botH">HOW TRADES FINISHED (R MULTIPLES)</div>${this.rHist(allR)}
          <div class="botNote">1R is one unit of the risk taken. A strategy can win less than half its trades and still
          make money if the winners are bigger.</div></div>
        <div class="rpCard"><div class="botH">WHERE THE FLEET EARNS</div>${insBars}</div>
        <div class="rpCard"><div class="botH">WHAT THE LAB HAS BEEN DOING</div>${labLog}
          <div class="botNote">${lab.tried || 0} recipes tested · ${liveLab.length} published as bots</div></div>
      </div>
      <div class="rpCard"><div class="botH">THE SIX CONDITIONS FOR A LIVE SEAT</div>
        <div class="rpChecks">${this.READY.map(c => `<div class="rpCheck"><b>${esc(c.label)}</b></div>`).join('')}</div>
        <div class="botNote warn">All six met is not a recommendation to trade real money. It means the bot has stopped
          being obviously unfit. Live markets slip, gap and fill differently from any test.</div>
      </div>
    </div>`;
  },

  /* ---------- backtest every bot, so the report has something to weigh ---------- */
  async assessAll(){
    const host = document.getElementById('botBody');
    const bots = BOTS.filter(b => !Bots.isPage(b) && !b.manual);
    for (let i = 0; i < bots.length; i++){
      const b = bots[i];
      const note = document.getElementById('rpProgress');
      if (note) note.textContent = 'Testing ' + b.name + ' (' + (i + 1) + ' of ' + bots.length + ')…';
      const cfg = Bots.cfg(b.id) || b.defaults;
      const r = await Backtest.run(b, { sym: STORE.symbol, tf: cfg.tf, cfg });
      if (!r.error){
        Bots.bt[b.id] = r;
        Bots.rememberBacktest(b.id, r);
        MasterBrain.ingestBacktest(r, b);
      }
      await new Promise(res => setTimeout(res));
    }
    MasterBrain.train();
    toast('Every bot measured on ' + baseAsset(STORE.symbol) + ' — the Master Brain learned from all of it', 'ok');
    Bots.render();
  },

  /* ---------- PDF ----------
     The report is rewritten as a self-contained light-theme document and handed
     to the browser's own print dialogue, where "Save as PDF" produces the file.
     No library, no upload — the page never leaves the machine. */
  exportPdf(){
    const rows = this.rows();
    const f = this.fleet(rows);
    const lab = (typeof StratLab !== 'undefined') ? StratLab.load() : { recipes: [], log: [], tried: 0 };
    const m = (MasterBrain.state || MasterBrain.load()).metrics;
    const C = this.C;

    const kpi = (l, v) => `<div class="k"><label>${l}</label><b>${v}</b></div>`;
    const tableRows = rows.map(r => {
      const v = this.verdict(r);
      return `<tr>
        <td>${esc(r.name)}</td><td>${esc(r.tf || '')}</td>
        <td class="n ${r.pnl >= 0 ? 'g' : 'r'}">${(r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl)}</td>
        <td class="n">${r.trades}</td><td class="n">${r.trades ? Math.round(r.winRate) + '%' : '—'}</td>
        <td class="n">${r.trades ? this.pf(r.pf) : '—'}</td>
        <td class="n">${r.trades ? r.avgR.toFixed(2) : '—'}</td>
        <td class="n">${r.trades ? '-' + r.maxDD.toFixed(1) + '%' : '—'}</td>
        <td class="n">${r.bt ? this.pf(r.bt.pf) : '—'}</td>
        <td class="n">${r.ready}/${this.READY.length}</td>
        <td>${esc(v.text)}</td></tr>`;
    }).join('');

    const cards = rows.filter(r => r.trades).slice(0, 8).map(r => `
      <div class="card">
        <h3>${esc(r.name)}</h3>
        <div class="mini">
          ${this.donut(r.winRate, 'win rate', r.trades + ' trades')}
          <div class="curve">${this.spark(r.curve, 240, 54, r.pnl >= 0 ? C.up : C.down)}</div>
        </div>
        <table class="kv">
          <tr><td>Profit and loss</td><td class="${r.pnl >= 0 ? 'g' : 'r'}">${(r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl)} (${fmtPct(r.pnlPct)})</td></tr>
          <tr><td>Profit factor</td><td>${this.pf(r.pf)}</td></tr>
          <tr><td>Average result</td><td>${r.avgR.toFixed(2)}R</td></tr>
          <tr><td>Worst drawdown</td><td>-${r.maxDD.toFixed(1)}%</td></tr>
          <tr><td>Fees paid</td><td>${fmtNum(r.fees)}</td></tr>
          <tr><td>Instruments in profit</td><td>${r.symsWon} of ${r.symsTraded}</td></tr>
        </table>
        <ul class="chk">${r.checks.map(c =>
          `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${esc(c.label)} <i>${esc(String(c.got))}</i></li>`).join('')}</ul>
      </div>`).join('');

    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>ASTRA — bot performance report</title>
<style>
  *{box-sizing:border-box}
  body{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#16203a;margin:0;padding:26px 30px;background:#fff}
  h1{font-size:22px;margin:0 0 2px;letter-spacing:.06em}
  h2{font-size:13px;letter-spacing:.14em;color:#5b6b8c;margin:22px 0 8px;text-transform:uppercase;border-bottom:1px solid #dde3ee;padding-bottom:5px}
  h3{font-size:13px;margin:0 0 8px}
  .sub{color:#5b6b8c;margin-bottom:14px}
  .paper{background:#fff4e5;border:1px solid #ffc98a;border-radius:7px;padding:9px 12px;margin:12px 0 18px;color:#7a4a00}
  .kpis{display:flex;flex-wrap:wrap;gap:8px}
  .k{border:1px solid #dde3ee;border-radius:7px;padding:7px 12px;min-width:118px}
  .k label{display:block;font-size:9.5px;letter-spacing:.12em;color:#7b88a4;text-transform:uppercase}
  .k b{font-size:16px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{text-align:left;font-size:9.5px;letter-spacing:.1em;color:#7b88a4;text-transform:uppercase;border-bottom:1px solid #dde3ee;padding:5px 6px}
  td{padding:5px 6px;border-bottom:1px solid #eef1f7}
  td.n,th.num{text-align:right}
  .g{color:#12885c;font-weight:600}.r{color:#c02b3f;font-weight:600}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .card{border:1px solid #dde3ee;border-radius:9px;padding:12px;break-inside:avoid}
  .mini{display:flex;align-items:center;gap:12px;margin-bottom:8px}
  .rpDonut{text-align:center;width:92px}
  .rpDonut svg{width:78px;height:78px}
  .rpDonutN{font-size:19px;font-weight:700;fill:#16203a}
  .rpDonut b{display:block;font-size:10px}
  .rpDonut span{display:block;font-size:9px;color:#7b88a4}
  .curve{flex:1}
  .rpSpark{width:100%;height:54px}
  .kv td{padding:2.5px 0;border:0;font-size:11px}
  .kv td:last-child{text-align:right;font-weight:600}
  .chk{list-style:none;margin:8px 0 0;padding:0;font-size:10.5px}
  .chk li{padding:2px 0}
  .chk .ok{color:#12885c}.chk .no{color:#98a3ba}
  .chk i{color:#7b88a4;font-style:normal}
  .log{font-size:10.5px;color:#3d4a68}
  .log div{padding:2px 0;border-bottom:1px solid #f1f4f9}
  .foot{margin-top:20px;font-size:10px;color:#7b88a4;border-top:1px solid #dde3ee;padding-top:8px}
  @page{margin:14mm}
</style></head><body>
  <h1>ASTRA · BOT PERFORMANCE REPORT</h1>
  <div class="sub">${new Date().toLocaleString()} · account model ${fmtNum(BotEngine.RISK.startEquity)} virtual · risk ${BotEngine.RISK.riskPct}% per trade</div>
  <div class="paper"><b>Paper only.</b> ASTRA has no connection that can place an order with any broker. Every trade in this
    report is simulated against real prices, real spreads and real commission. The report exists to choose which bot might
    one day deserve real money — it does not make that decision.</div>

  <h2>The fleet</h2>
  <div class="kpis">
    ${kpi('Bots under test', rows.length)}
    ${kpi('Paper trades', f.trades)}
    ${kpi('Fleet P&amp;L', (f.pnl >= 0 ? '+' : '') + fmtNum(f.pnl))}
    ${kpi('Win rate', Math.round(f.winRate) + '%')}
    ${kpi('Fees paid', fmtNum(f.fees))}
    ${kpi('Lab bots', lab.recipes.filter(r => !r.retired).length)}
    ${kpi('Brain edge', m ? (m.edge > 0 ? '+' : '') + m.edge : 'untrained')}
  </div>

  <h2>Ranking</h2>
  <table><thead><tr><th>Bot</th><th>TF</th><th class="num">P&amp;L</th><th class="num">Trades</th><th class="num">Win</th>
    <th class="num">PF</th><th class="num">Avg R</th><th class="num">Max DD</th><th class="num">Backtest PF</th>
    <th class="num">Ready</th><th>Verdict</th></tr></thead><tbody>${tableRows}</tbody></table>

  <h2>Bot by bot</h2>
  <div class="cards">${cards || '<div class="card">No bot has finished a trade yet.</div>'}</div>

  <h2>What the Strategy Lab has been doing</h2>
  <div class="log">${(lab.log || []).slice(0, 14).map(l =>
    `<div>${new Date(l.t).toLocaleString()} — ${esc(l.text)}</div>`).join('') || '<div>The lab has not run yet.</div>'}</div>

  <div class="foot">Generated by ASTRA Terminal. Backtests describe the past only; real fills, spreads and gaps will differ.
    Nothing in this document is financial advice.</div>
</body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(frame);
    const d = frame.contentWindow.document;
    d.open(); d.write(doc); d.close();
    const go = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch(e){ toast('Could not open the print dialogue', 'warn'); }
      setTimeout(() => frame.remove(), 60000);
    };
    if (d.readyState === 'complete') setTimeout(go, 250);
    else frame.onload = () => setTimeout(go, 250);
    toast('Choose “Save as PDF” in the print dialogue', 'info');
  },
};
