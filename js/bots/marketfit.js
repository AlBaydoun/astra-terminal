/* ASTRA Terminal — Market Fit.

   The question "which strategy works on which market, and on what timeframe" can
   only be answered by measuring, and it has to be re-measured as markets change.
   This runs the whole grid — every strategy against every market group at every
   timeframe — and then does the one test that separates a real edge from a lucky
   stretch: it splits the history in half and checks whether what worked in the
   first half still worked in the second.

   Almost nothing passes that test. That is the honest and useful result: a sweep
   over sixty combinations will always produce a handsome winner by chance, and
   the split is what exposes it. */
const MarketFit = {

  /* ---------- the instrument catalogue ----------
     Broker symbols only. The forex and silver rows used to be Yahoo proxies
     (EURUSD=X, SI=F), which live-only mode refuses at the trade gate — so those
     markets reported "no trades" while in fact every trade had been blocked.
     Measuring on anything other than the prices you can actually be filled at
     was never meaningful anyway.

     The list used to be fourteen symbols typed in by hand, which silently hid
     three quarters of the account: platinum, the S&P, Hong Kong and sixteen
     currency pairs were all tradable and simply never offered. It is now built
     from BROKER.LIST and filtered to what the account actually answers to, so a
     new instrument added there appears here on its own.

     TWO lists, deliberately:
       GROUPS        — everything tradable. This is what the market picker offers.
       studyGroups() — a capped handful per market. This is what the sweep and the
                       split test measure, because a sweep is symbols × timeframes
                       × bots backtests running inside the browser: the whole
                       catalogue would take the best part of an hour and answer
                       the same question. */
  GROUP_DEFS: [
    ['crypto',  'Crypto',  'crypto'],
    ['gold',    'Metals',  'metal'],
    ['forex',   'Forex',   'fx'],
    ['indices', 'Indices', 'index'],
    ['energy',  'Energy',  'energy'],
  ],

  /* Binance pairs that already carry months of trade history — kept so that
     record is not orphaned. Everything else comes from the broker. */
  EXTRA: { crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },

  /* used only when the MT5 bridge is closed and nothing resolves */
  FALLBACK: {
    crypto:  { label: 'Crypto',  syms: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
    gold:    { label: 'Metals',  syms: ['XAUUSD.m', 'XAGUSD.m'] },
    forex:   { label: 'Forex',   syms: ['EURUSD.m', 'GBPUSD.m', 'USDJPY.m'] },
    indices: { label: 'Indices', syms: ['US100.std', 'US30.std'] },
    energy:  { label: 'Energy',  syms: ['WTI.m', 'BRENT.m'] },
  },

  STUDY_PER_GROUP: 4,
  _groups: null,
  _groupsKey: '',

  buildGroups(){
    const key = (typeof MarketSources !== 'undefined' ? MarketSources.revision + ':' + MarketSources.brokerList().join(',') + ':' : '') + ((typeof Feed !== 'undefined' && Feed.bridge)
      ? 'b' + Feed.bridge.symbols.size + ':' + (Feed.aliasCount || 0) : 'none');
    if (this._groups && this._groupsKey === key) return this._groups;
    const out = {};
    if (typeof BROKER !== 'undefined'){
      for (const [id, label, bg] of this.GROUP_DEFS){
        const syms = BROKER.byGroup(bg)
          .filter(s => typeof Feed === 'undefined' || Feed.bridgeHas(s) || Feed.isLive(s));
        for (const e of (this.EXTRA[id] || [])) if (!syms.includes(e)) syms.push(e);
        const enabled = syms.filter(s => typeof MarketSources === 'undefined' || MarketSources.allowed(s));
        if (enabled.length) out[id] = { label, syms: enabled };
      }
    }
    this._groups = Object.keys(out).length || typeof MarketSources !== 'undefined' ? out : this.FALLBACK;
    this._groupsKey = key;
    return this._groups;
  },

  get GROUPS(){ return this.buildGroups(); },

  /* the capped subset the study actually measures */
  studyGroups(){
    const out = {};
    for (const [id, g] of Object.entries(this.GROUPS))
      out[id] = { label: g.label, syms: g.syms.slice(0, this.STUDY_PER_GROUP) };
    return out;
  },
  studySyms(gid){ return (this.studyGroups()[gid] || { syms: [] }).syms; },

  /* 5m and 15m are deliberately absent: the feeds only reach back a few days
     there, which is far too little to conclude anything from. */
  TFS: ['1h', '4h'],

  /* what a combination has to show before it is worth believing */
  BAR: { trades: 20, coverage: 0.6 },

  state: null,
  busy: false,
  sort: { key: 'avgR', dir: -1 },

  load(){
    this.state = lsGet('astra_marketfit', null) || { rows: [], at: 0, splits: {} };
    return this.state;
  },
  save(){ lsSet('astra_marketfit', this.state); },

  bots(){
    return BOTS.filter(b => !Bots.isPage(b) && !b.manual)
      .concat(BOT_BY_ID.scanner ? [BOT_BY_ID.scanner] : []);
  },

  /* ---------- one pass over the grid ---------- */
  async sweep(onProgress){
    if (this.busy) return { error: 'already running' };
    this.busy = true;
    this.load();
    const rows = [];
    const bots = this.bots();
    const groups = Object.entries(this.studyGroups());
    let done = 0;
    const total = groups.reduce((a, [, g]) => a + g.syms.length, 0) * this.TFS.length * bots.length;

    try {
      for (const [gid, g] of groups){
        for (const sym of g.syms){
          for (const tf of this.TFS){
            for (const b of bots){
              if (onProgress) onProgress(++done, total, g.label + ' ' + baseAsset(sym) + ' ' + tf + ' · ' + b.name);
              let r;
              try { r = await Backtest.run(b, { sym, tf, cfg: Object.assign({}, b.defaults) }); }
              catch(e){ continue; }
              await new Promise(x => setTimeout(x));
              if (r.error) continue;
              const s = r.stats;
              rows.push({ group: gid, sym, tf, bot: b.id, botName: b.name,
                trades: s.trades, win: +s.winRate.toFixed(1),
                pf: s.profitFactor === Infinity ? null : +s.profitFactor.toFixed(2),
                avgR: +s.avgR.toFixed(3), net: +s.pnl.toFixed(2), dd: +s.maxDD.toFixed(1),
                signals: r.signals, bars: r.bars });
            }
          }
        }
      }
      this.state.rows = rows;
      this.state.at = Date.now();
      this.state.splits = {};
      this.save();
      this.archive();
      return { rows: rows.length };
    } finally { this.busy = false; }
  },

  /* pool a group's instruments together for one bot and timeframe */
  combos(){
    this.load();
    const map = {};
    for (const r of this.state.rows){
      const k = r.group + '|' + r.bot + '|' + r.tf;
      const a = map[k] = map[k] || { key: k, group: r.group, bot: r.bot, botName: r.botName, tf: r.tf,
        trades: 0, net: 0, wins: 0, syms: 0, symsWon: 0, dd: 0, rSum: 0, signals: 0 };
      a.trades += r.trades; a.net += r.net; a.wins += r.trades * r.win / 100;
      a.syms++; if (r.net > 0) a.symsWon++;
      a.dd = Math.max(a.dd, r.dd); a.rSum += r.avgR * r.trades; a.signals += r.signals;
    }
    return Object.values(map).map(a => Object.assign(a, {
      win: a.trades ? +(a.wins / a.trades * 100).toFixed(1) : 0,
      avgR: a.trades ? +(a.rSum / a.trades).toFixed(3) : 0,
      net: +a.net.toFixed(0),
      coverage: a.syms ? a.symsWon / a.syms : 0,
      split: this.state.splits[a.key] || null,
    })).sort((x, y) => y.avgR - x.avgR);
  },

  /* the table's own ordering, so any column can lead */
  sorted(){
    const k = this.sort.key, d = this.sort.dir;
    const val = c => {
      if (k === 'group') return (this.GROUPS[c.group] || {}).label || c.group;
      if (k === 'coverage') return c.coverage;
      if (k === 'first')  return c.split ? c.split.first.avgR : -99;
      if (k === 'second') return c.split ? c.split.second.avgR : -99;
      return c[k];
    };
    return this.combos().sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'string' || typeof y === 'string')
        return String(x || '').localeCompare(String(y || '')) * d;
      return ((x || 0) - (y || 0)) * d;
    });
  },

  setSort(key){
    if (this.sort.key === key) this.sort.dir = -this.sort.dir;
    else { this.sort.key = key; this.sort.dir = -1; }
  },

  clearHistory(){ lsSet(this.HIST_KEY, []); },

  worthSplitting(c){
    return c.trades >= this.BAR.trades && c.avgR > 0 && c.coverage >= this.BAR.coverage;
  },

  /* ---------- the test that matters ---------- */
  async splitTest(onProgress){
    this.load();
    const shortlist = this.combos().filter(c => this.worthSplitting(c));
    let i = 0;
    for (const c of shortlist){
      const syms = this.studySyms(c.group);
      const halves = {};
      for (const slice of ['first', 'second']){
        let trades = 0, net = 0, rSum = 0, wins = 0, won = 0, n = 0;
        for (const sym of syms){
          const b = BOT_BY_ID[c.bot];
          if (!b) continue;
          const r = await Backtest.run(b, { sym, tf: c.tf, cfg: Object.assign({}, b.defaults), slice });
          await new Promise(x => setTimeout(x));
          if (r.error) continue;
          n++; trades += r.stats.trades; net += r.stats.pnl;
          rSum += r.stats.avgR * r.stats.trades; wins += r.stats.trades * r.stats.winRate / 100;
          if (r.stats.pnl > 0) won++;
        }
        halves[slice] = { trades, net: +net.toFixed(0), avgR: trades ? +(rSum / trades).toFixed(3) : 0,
                          win: trades ? +(wins / trades * 100).toFixed(1) : 0, coverage: n ? won / n : 0 };
      }
      halves.holds = halves.first.avgR > 0 && halves.second.avgR > 0;
      this.state.splits[c.key] = halves;
      if (onProgress) onProgress(++i, shortlist.length, c.botName + ' · ' + c.tf);
      this.save();
    }
    this.archive();
    return { tested: shortlist.length, held: shortlist.filter(c => (this.state.splits[c.key] || {}).holds).length };
  },

  /* ================= history =================
     One study is a snapshot, and a snapshot is exactly the thing that fools
     people: a strategy that tops the table today can be losing money next week.
     Every completed run is archived so the same combination can be followed over
     time, and the number that actually matters becomes visible — not "is it good
     today" but "how OFTEN has it held".

     A combination that held 6 times out of 7 is worth something. One that held
     once out of five was luck, however handsome today's figure looks. */
  HIST_KEY: 'astra_marketfit_hist',
  MAX_RUNS: 40,

  history(){ return lsGet(this.HIST_KEY, []); },

  archive(){
    const hist = this.history();
    const entry = {
      at: Date.now(),
      combos: this.combos().filter(c => c.trades > 0).map(c => ({
        key: c.key, group: c.group, bot: c.bot, botName: c.botName, tf: c.tf,
        trades: c.trades, win: c.win, avgR: c.avgR, net: c.net,
        coverage: +(c.coverage || 0).toFixed(2),
        holds: !!(c.split && c.split.holds),
        split: !!c.split,
        first: c.split ? c.split.first.avgR : null,
        second: c.split ? c.split.second.avgR : null,
      })),
    };
    /* a sweep followed by a split-test is ONE study, not two — fold them */
    if (hist.length && Date.now() - hist[hist.length - 1].at < 45 * 60 * 1000)
      hist[hist.length - 1] = entry;
    else hist.push(entry);
    while (hist.length > this.MAX_RUNS) hist.shift();
    lsSet(this.HIST_KEY, hist);
    return hist.length;
  },

  /* how one combination has behaved across every run that measured it */
  trend(key){
    return this.history().map(h => {
      const c = (h.combos || []).find(x => x.key === key);
      return c ? { at: h.at, avgR: c.avgR, net: c.net, trades: c.trades, holds: c.holds, split: c.split } : null;
    }).filter(Boolean);
  },

  /* every combination ever seen, ranked by how reliably it has held up */
  stability(){
    const hist = this.history();
    if (!hist.length) return [];
    const map = {};
    for (const run of hist){
      for (const c of (run.combos || [])){
        const m = map[c.key] = map[c.key] || {
          key: c.key, group: c.group, botName: c.botName, tf: c.tf,
          runs: 0, tested: 0, held: 0, rs: [], lastAvgR: 0, lastAt: 0, trades: 0,
        };
        m.runs++;
        m.rs.push(c.avgR);
        if (c.split){ m.tested++; if (c.holds) m.held++; }
        if (run.at >= m.lastAt){ m.lastAt = run.at; m.lastAvgR = c.avgR; m.trades = c.trades; }
      }
    }
    return Object.values(map).map(m => Object.assign(m, {
      holdRate: m.tested ? m.held / m.tested : null,
      avgOfRuns: m.rs.length ? +(m.rs.reduce((a, x) => a + x, 0) / m.rs.length).toFixed(3) : 0,
      worst: m.rs.length ? +Math.min.apply(null, m.rs).toFixed(3) : 0,
      best: m.rs.length ? +Math.max.apply(null, m.rs).toFixed(3) : 0,
      /* positive on average AND held more often than not */
      trustworthy: m.tested >= 2 && (m.held / m.tested) >= 0.6 &&
                   m.rs.reduce((a, x) => a + x, 0) / m.rs.length > 0,
    })).sort((a, b) => (b.holdRate || 0) - (a.holdRate || 0) || b.avgOfRuns - a.avgOfRuns);
  },

  /* ================= turning the findings into settings =================
     The useful answer is neither "let the bots follow blindly" nor "build more
     bots". It is to CONFIGURE the bots that already exist: point each surviving
     one at the timeframe and the instruments where it actually held up, and stop
     the ones that did not.

     A bot that held in more than one market at the SAME timeframe gets both
     instrument sets merged. If it held at two different timeframes, the one with
     the better pooled average R wins. A bot with nothing that held is paused,
     never deleted — unpausing is one click. */
  plan(){
    const held = this.combos().filter(c => c.split && c.split.holds);
    const byBot = {};
    for (const c of held){
      const b = byBot[c.bot] = byBot[c.bot] || {};
      const t = b[c.tf] = b[c.tf] || { tf: c.tf, syms: new Set(), rSum: 0, trades: 0, groups: [] };
      for (const sym of this.studySyms(c.group)) t.syms.add(sym);
      t.rSum += c.avgR * c.trades;
      t.trades += c.trades;
      t.groups.push(c.group);
    }

    const out = [];
    for (const b of this.bots()){
      const cfg = (typeof Bots !== 'undefined' && Bots.cfg) ? (Bots.cfg(b.id) || {}) : {};
      let tfs = byBot[b.id];

      /* A SPECIALIST bot — one that ships with its own instrument list, like
         Pattern · Oil or Pattern · Crypto — was tuned for that market: its
         reward multiple, ATR ceiling and minimum edge only mean anything there.
         Letting the study point it at a different market would silently turn it
         into a different bot, and the evidence that "held" would not transfer.
         So a specialist is only kept where it held IN ITS OWN market. */
      const own = b.defaults && b.defaults.instruments;
      if (own && own.length && tfs){
        const kept = {};
        for (const [tf, t] of Object.entries(tfs)){
          const mine = [...t.syms].filter(s => own.includes(s));
          if (mine.length) kept[tf] = Object.assign({}, t, { syms: new Set(mine) });
        }
        tfs = Object.keys(kept).length ? kept : null;
      }

      if (!tfs){
        out.push({ botId: b.id, botName: b.name, action: 'pause', wasPaused: !!cfg.paused,
                   why: (b.defaults && b.defaults.instruments && b.defaults.instruments.length)
                     ? 'nothing held in its own market'
                     : 'nothing held out of sample' });
        continue;
      }
      const best = Object.values(tfs)
        .map(t => Object.assign(t, { avgR: t.trades ? t.rSum / t.trades : 0 }))
        .sort((x, y) => y.avgR - x.avgR)[0];
      const instruments = [...best.syms];
      out.push({
        botId: b.id, botName: b.name, action: 'configure',
        tf: best.tf, instruments,
        groups: [...new Set(best.groups)].map(g => (this.GROUPS[g] || {}).label || g),
        avgR: +best.avgR.toFixed(3), trades: best.trades,
        changes: [
          cfg.tf !== best.tf ? 'timeframe ' + (cfg.tf || '—') + ' → ' + best.tf : null,
          JSON.stringify(cfg.instruments || null) !== JSON.stringify(instruments)
            ? instruments.length + ' instrument' + (instruments.length === 1 ? '' : 's') : null,
          cfg.paused ? 'un-pause' : null,
        ].filter(Boolean),
      });
    }
    return out.sort((a, b) => (b.avgR || -9) - (a.avgR || -9));
  },

  apply(){
    const plan = this.plan();
    let configured = 0, paused = 0;
    for (const p of plan){
      const cfg = Bots.cfg(p.botId);
      if (!cfg) continue;
      if (p.action === 'pause'){
        if (!cfg.paused){ cfg.paused = true; paused++; }
      } else {
        cfg.tf = p.tf;
        cfg.tfAuto = false;                 // the study picked the timeframe; do not drift off it
        cfg.instruments = p.instruments;
        cfg.paused = false;
        configured++;
      }
      Bots.saveCfg(p.botId);
    }
    this.load();
    this.state.appliedAt = Date.now();
    this.save();
    return { configured, paused };
  },

  verdict(c){
    if (!c.trades) return { cls: 'idle', text: 'never traded' };
    if (c.trades < this.BAR.trades) return { cls: 'idle', text: 'only ' + c.trades + ' trades — cannot judge' };
    if (c.avgR <= 0) return { cls: 'bad', text: 'loses money' };
    if (c.coverage < this.BAR.coverage)
      return { cls: 'bad', text: 'earns on only ' + c.symsWon + ' of ' + c.syms + ' instruments' };
    if (!c.split) return { cls: 'warn', text: 'positive — not split-tested yet' };
    if (c.split.holds) return { cls: 'good', text: 'held in both halves (' + c.split.first.avgR + 'R → ' + c.split.second.avgR + 'R)' };
    return { cls: 'bad', text: 'collapsed out of sample (' + c.split.first.avgR + 'R → ' + c.split.second.avgR + 'R)' };
  },
};

/* ---------------- the page ---------------- */
Object.assign(Bots, {

  fitView(){
    const S = MarketFit.load();
    const combos = MarketFit.sorted();
    const held = combos.filter(c => c.split && c.split.holds);
    const groups = Object.entries(MarketFit.GROUPS);

    const row = c => {
      const v = MarketFit.verdict(c);
      return `<tr class="fit-${v.cls}">
        <td>${esc(MarketFit.GROUPS[c.group] ? MarketFit.GROUPS[c.group].label : c.group)}</td>
        <td class="c-sym">${esc(c.botName)}</td>
        <td>${esc(c.tf)}</td>
        <td class="num">${c.trades}</td>
        <td class="num">${c.trades ? c.win + '%' : '—'}</td>
        <td class="num ${pctClass(c.avgR)}">${c.trades ? c.avgR.toFixed(3) : '—'}</td>
        <td class="num ${pctClass(c.net)}">${c.trades ? (c.net >= 0 ? '+' : '') + fmtNum(c.net) : '—'}</td>
        <td class="num">${c.symsWon}/${c.syms}</td>
        <td class="num">${c.split ? c.split.first.avgR : '—'}</td>
        <td class="num">${c.split ? c.split.second.avgR : '—'}</td>
        <td class="fitVerdict ${v.cls}">${esc(v.text)}</td></tr>`;
    };

    const perGroup = groups.map(([gid, g]) => {
      const mine = combos.filter(c => c.group === gid);
      const best = mine.filter(c => c.trades >= MarketFit.BAR.trades).sort((a, b) => b.avgR - a.avgR)[0];
      const winner = mine.find(c => c.split && c.split.holds);
      return `<div class="fitCard ${winner ? 'good' : best && best.avgR > 0 ? 'warn' : 'bad'}">
        <b>${esc(g.label)}</b>
        <span>${esc(g.syms.map(baseAsset).join(' · '))}</span>
        ${winner
          ? `<i class="ok">${esc(winner.botName)} on ${esc(winner.tf)} held out of sample</i>`
          : best
            ? `<i>best was ${esc(best.botName)} ${esc(best.tf)} at ${best.avgR}R — ${best.split ? 'did not hold' : 'not split-tested'}</i>`
            : '<i>nothing produced enough trades to judge</i>'}
        <u>${mine.reduce((a, c) => a + c.trades, 0)} trades measured</u>
      </div>`;
    }).join('');

    return `<div class="fitWrap">
      <div class="botCtl">
        <button class="bBtn go" data-act="fitsweep">Run the whole grid</button>
        <button class="bBtn" data-act="fitsplit" ${S.rows.length ? '' : 'disabled'}>Split-test the winners</button>
        <button class="bBtn go" data-act="fitapply" ${held.length ? '' : 'disabled'}>Apply to the bots</button>
        <span class="bcNote" id="fitProgress">${S.at
          ? S.rows.length + ' measurements · last run ' + this.when(S.at)
          : 'Not measured yet. The grid takes a few minutes.'}</span>
      </div>

      <div class="lvBanner ${held.length ? 'shadow' : 'idle'}">
        <div class="lvbLeft">
          <b>${held.length} OF ${combos.length} COMBINATIONS SURVIVED</b>
          <span>A sweep this wide always throws up a handsome winner by luck. Only the ones that stayed
            positive in <b>both halves</b> of the history are worth anything.</span>
        </div>
      </div>

      <div class="fitCards">${perGroup}</div>

      ${this.fitPlanView()}

      ${this.fitHistoryView()}

      <div class="botH">EVERY COMBINATION — CLICK A HEADING TO SORT</div>
      <div class="dashScroll"><table class="dashTable">
        <thead><tr>${[
          ['group', 'Market', 0], ['botName', 'Strategy', 0], ['tf', 'TF', 0],
          ['trades', 'Trades', 1], ['win', 'Win', 1], ['avgR', 'Avg R', 1], ['net', 'Net', 1],
          ['coverage', 'Earned on', 1], ['first', '1st half R', 1], ['second', '2nd half R', 1],
        ].map(([k, label, num]) =>
          `<th class="${num ? 'num ' : ''}sortable${MarketFit.sort.key === k ? ' sorted' : ''}"
             data-fitsort="${k}">${esc(label)}${MarketFit.sort.key === k ? (MarketFit.sort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`
        ).join('')}<th>Verdict</th></tr></thead>
        <tbody>${combos.length ? combos.map(row).join('')
          : '<tr><td colspan="11" class="empty">Press “Run the whole grid”.</td></tr>'}</tbody></table></div>

      <div class="botNote warn">Backtests over a few months of one feed. Forex here carries no volume and some
        synthetic candles, so any strategy that weighs volume is handicapped on it — run the MT5 bridge to
        measure forex and gold on your broker's own data instead.</div>
    </div>`;
  },

  /* ---------------- history across runs ----------------
     The number that matters is not today's figure but how often a combination
     has held. Six holds out of seven is a finding; one out of five was luck. */
  fitHistoryView(){
    const hist = MarketFit.history();
    if (hist.length < 2)
      return `<div class="botNote">${hist.length
        ? 'One study archived so far. Run it again tomorrow and this becomes a comparison — the same combination measured on different days is the only way to tell a real edge from a good week.'
        : 'No study archived yet.'}</div>`;

    const stab = MarketFit.stability().filter(x => x.tested >= 1).slice(0, 14);
    const spark = rs => {
      if (!rs || rs.length < 2) return '';
      const lo = Math.min.apply(null, rs), hi = Math.max.apply(null, rs), span = (hi - lo) || 1;
      const pts = rs.map((v, i) => (i / (rs.length - 1) * 70).toFixed(1) + ',' +
        (18 - (v - lo) / span * 16).toFixed(1)).join(' ');
      const zero = lo <= 0 && hi >= 0 ? (18 - (0 - lo) / span * 16).toFixed(1) : null;
      return `<svg viewBox="0 0 70 20" class="fitSpark">` +
        (zero ? `<line x1="0" y1="${zero}" x2="70" y2="${zero}" stroke="rgba(140,165,215,.35)" stroke-width="0.7" stroke-dasharray="2 2"/>` : '') +
        `<polyline points="${pts}" fill="none" stroke="${rs[rs.length - 1] >= 0 ? '#2ebd85' : '#f6465d'}" stroke-width="1.4"/></svg>`;
    };

    return `<div class="botH">HISTORY · ${hist.length} STUDIES
        <span class="dim2">${new Date(hist[0].at).toLocaleDateString()} → ${new Date(hist[hist.length - 1].at).toLocaleDateString()}</span>
        <button class="bMini danger" data-act="fithistclear">Clear history</button></div>
      <div class="botNote">Every completed study is kept. A combination is only worth trusting when it keeps holding,
        so the column that matters here is <b>held</b>, not today's average.</div>
      <div class="dashScroll short"><table class="dashTable">
        <thead><tr><th>Market</th><th>Strategy</th><th>TF</th><th class="num">Studies</th>
          <th class="num">Held</th><th class="num">Avg of runs</th><th class="num">Worst</th>
          <th class="num">Best</th><th class="num">Latest</th><th>Trend</th><th>Reliability</th></tr></thead>
        <tbody>${stab.map(m => {
          const rate = m.holdRate == null ? null : Math.round(m.holdRate * 100);
          const cls = m.trustworthy ? 'good' : (rate != null && rate < 40) ? 'bad' : 'warn';
          return `<tr class="fit-${cls}">
            <td>${esc((MarketFit.GROUPS[m.group] || {}).label || m.group)}</td>
            <td class="c-sym">${esc(m.botName)}</td>
            <td>${esc(m.tf)}</td>
            <td class="num">${m.runs}</td>
            <td class="num">${m.tested ? m.held + '/' + m.tested + ' · ' + rate + '%' : '—'}</td>
            <td class="num ${pctClass(m.avgOfRuns)}">${m.avgOfRuns}</td>
            <td class="num ${pctClass(m.worst)}">${m.worst}</td>
            <td class="num ${pctClass(m.best)}">${m.best}</td>
            <td class="num ${pctClass(m.lastAvgR)}">${m.lastAvgR}</td>
            <td>${spark(m.rs)}</td>
            <td class="fitVerdict ${cls}">${m.trustworthy ? 'holds up repeatedly'
              : m.tested < 2 ? 'only measured once — too early'
              : rate < 40 ? 'rarely holds — today’s figure is noise'
              : 'mixed — keep watching'}</td></tr>`;
        }).join('')}</tbody></table></div>`;
  },

  /* what "Apply to the bots" would actually change, before it changes it */
  fitPlanView(){
    const plan = MarketFit.plan();
    if (!plan.length) return '';
    const keep = plan.filter(p => p.action === 'configure');
    const stop = plan.filter(p => p.action === 'pause');
    const S = MarketFit.load();

    return `<div class="botH">WHAT “APPLY TO THE BOTS” WOULD DO
        ${S.appliedAt ? '<span class="dim2">last applied ' + this.when(S.appliedAt) + '</span>' : ''}</div>
      <div class="botNote">It does not create anything new. It points each surviving bot at the timeframe and the
        instruments where it actually held up, and pauses the rest. Pausing is reversible — the bot keeps its history
        and one click starts it again.</div>
      <div class="fitPlan">
        ${keep.map(p => `<div class="fitPlanCard good">
            <b>${esc(p.botName)}</b>
            <span>${esc(p.tf)} · ${esc(p.groups.join(' + '))} · ${p.avgR}R over ${p.trades} trades</span>
            <i>${esc(p.instruments.map(baseAsset).join(' · '))}</i>
            ${p.changes.length ? `<u>changes: ${esc(p.changes.join(', '))}</u>` : '<u>already set this way</u>'}
          </div>`).join('')}
        ${stop.length ? `<div class="fitPlanCard bad">
            <b>${stop.length} bot${stop.length === 1 ? '' : 's'} would be paused</b>
            <span>nothing held out of sample</span>
            <i>${esc(stop.map(p => p.botName).join(' · '))}</i>
          </div>` : ''}
      </div>`;
  },

  async fitApply(){
    const plan = MarketFit.plan();
    const keep = plan.filter(p => p.action === 'configure').length;
    const stop = plan.filter(p => p.action === 'pause').length;
    if (!confirm('Configure ' + keep + ' bot' + (keep === 1 ? '' : 's') +
                 ' to what the study found, and pause ' + stop + '?\n\n' +
                 'Nothing is deleted. Pausing can be undone on each bot’s page.')) return;
    const r = MarketFit.apply();
    toast('Configured ' + r.configured + ', paused ' + r.paused + ' — they run on paper from the next cycle', 'ok');
    this.wire();
    this.render();
  },

  async fitSweep(){
    const note = () => document.getElementById('fitProgress');
    const say = t => { const n = note(); if (n) n.textContent = t; };
    say('Starting…');
    toast('Measuring every strategy against every market — a few minutes', 'info');
    const r = await MarketFit.sweep((i, n, what) => say(i + ' of ' + n + ' · ' + what));
    if (r.error) return toast(r.error, 'warn');
    toast(r.rows + ' measurements taken. Now split-test the winners.', 'ok');
    this.render();
  },

  async fitSplit(){
    const say = t => { const n = document.getElementById('fitProgress'); if (n) n.textContent = t; };
    const r = await MarketFit.splitTest((i, n, what) => say('Split-testing ' + i + ' of ' + n + ' · ' + what));
    toast(r.tested
      ? r.held + ' of ' + r.tested + ' held up out of sample'
      : 'Nothing cleared the bar to be worth split-testing', r.held ? 'ok' : 'warn');
    this.render();
  },
});
