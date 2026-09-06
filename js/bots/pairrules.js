/* ASTRA Terminal — the permitted / prohibited instrument list.

   One list, consulted by every bot before it is allowed to open anything. It
   answers a single question: may a bot trade this pair at all?

   Two things decide it:

     THE RECORD — pooled across every bot. A pair that has lost money over enough
     trades is prohibited automatically. EUR/USD is the case that prompted this:
     it won 108 and lost 1.7K, so it kept costing money while every bot was still
     free to enter it.

     YOUR DECISION — a pair you prohibit or permit by hand always beats the
     automatic verdict, and is never quietly overturned by a later good day.

   The block is applied at the moment a bot chooses what to scan, so it holds in
   every mode: manual groups, Follow Market Fit and Follow its own record alike.
   It stops NEW positions only — anything already open still manages itself out
   through its own stop and target, because abandoning a live position would be
   worse than the loss that prompted the block. */
const PairRules = {

  /* How much evidence before an automatic verdict may stop a pair. Below this a
     losing pair is only flagged: four bad trades is noise, and blocking on noise
     would strangle a pair that never had a fair run. */
  MIN_TRADES: 5,

  /* A loss has to be worth acting on. Half a percent of one virtual account —
     50 on 10,000 — separates "this pair is costing money" from "this pair is
     break-even". Without it WTI was prohibited for being 9 down over 49 trades,
     which is noise, not danger. */
  LOSS_PCT: 0.5,

  /* a profit factor this low is a rout, not a bad patch */
  SEVERE_PF: 0.5,

  minLoss(){
    const start = (typeof BotEngine !== 'undefined' && BotEngine.RISK)
      ? BotEngine.RISK.startEquity : 10000;
    return start * this.LOSS_PCT / 100;
  },

  state: null,

  load(){
    if (this.state) return this.state;
    const s = lsGet('astra_pairrules', null) || {};
    this.state = { auto: s.auto !== false, rules: s.rules || {} };
    return this.state;
  },
  save(){ this._cache = null; return lsSet('astra_pairrules', this.state); },

  // Read old choices as they stand; do not migrate saved keys or trade records.
  // A suffix, letter case or exchange alias must not evade the same permission.
  key(sym){ return BotEngine.symbolKey(String(sym).trim().replace(/\//g, '')); },
  update(change){
    const before = this.load();
    this.state = { auto: before.auto, rules: { ...before.rules } };
    change(this.state);
    if (this.save()) return true;
    this.state = before;
    toast('Instrument permissions were not saved. Your previous choices still apply.', 'warn');
    return false;
  },

  autoOn(){ return this.load().auto; },
  setAuto(on){ return this.update(s => { s.auto = !!on; }); },

  /* 'block' | 'allow' | null (null = leave it to the record) */
  manualOf(sym){
    const key = this.key(sym);
    const choices = Object.entries(this.load().rules).filter(([s]) => this.key(s) === key).map(([, v]) => v);
    // Conflicting old aliases remain blocked until the user makes one choice.
    return choices.includes('block') ? 'block' : choices.includes('allow') ? 'allow' : null;
  },
  setManual(sym, v){
    if (!String(sym).trim() || ![null, 'block', 'allow'].includes(v)) return false;
    return this.update(S => {
      for (const s of Object.keys(S.rules)) if (this.key(s) === this.key(sym)) delete S.rules[s];
      if (v) S.rules[String(sym).trim()] = v;
    });
  },
  clearAll(){ return this.update(s => { s.rules = {}; }); },

  /* ---------- the record, pooled over every bot ----------
     Cached briefly: allowed() runs on every scan cycle and would otherwise walk
     every ledger each time. */
  _cache: null,
  _cacheAt: 0,

  book(){
    if (this._cache && Date.now() - this._cacheAt < 4000) return this._cache;
    const map = {};
    if (typeof BOTS !== 'undefined' && typeof Bots !== 'undefined' && Bots.ledger){
      for (const b of BOTS){
        if (Bots.isPage(b)) continue;
        const L = Bots.ledger(b.id);
        if (!L) continue;
        for (const t of (L.closed || [])){
          const key = this.key(t.sym);
          const m = map[key] = map[key] ||
            { sym: t.sym, n: 0, won: 0, lost: 0, gw: 0, gl: 0, net: 0, last: 0, bots: [] };
          m.n++; m.net += t.pnl;
          if (t.pnl > 0){ m.won++; m.gw += t.pnl; } else { m.lost++; m.gl += Math.abs(t.pnl); }
          if (t.exitTime > m.last) m.last = t.exitTime;
          if (m.bots.indexOf(b.name) === -1) m.bots.push(b.name);
        }
      }
    }
    for (const m of Object.values(map))
      m.pf = m.gl > 0 ? m.gw / m.gl : (m.gw > 0 ? Infinity : 0);
    this._cache = map;
    this._cacheAt = Date.now();
    return map;
  },

  statsOf(sym){ return this.book()[this.key(sym)] || null; },

  /* what the numbers alone say, before any decision of yours */
  autoVerdict(m){
    const n = x => (typeof fmtNum === 'function' ? fmtNum(Math.abs(x)) : Math.abs(x).toFixed(2));
    if (!m || !m.n) return { block: false, watch: false, why: 'never traded — nothing to judge' };
    if (m.net >= 0)
      return { block: false, watch: false,
        why: 'up ' + n(m.net) + ' over ' + m.n + ' trade' + (m.n === 1 ? '' : 's') };
    if (m.n < this.MIN_TRADES)
      return { block: false, watch: true,
        why: 'down ' + n(m.net) + ' but only ' + m.n + ' trade' + (m.n === 1 ? '' : 's') +
             ' — too little to judge' };
    if (Math.abs(m.net) < this.minLoss())
      return { block: false, watch: true,
        why: 'level after ' + m.n + ' trades — down only ' + n(m.net) + ', which is noise' };
    return { block: true, watch: false, severe: m.pf < this.SEVERE_PF,
      why: 'lost ' + n(m.net) + ' over ' + m.n + ' trades — won ' + n(m.gw) + ' against ' + n(m.gl) };
  },

  /* the full picture for one pair */
  verdict(sym){
    const S = this.load();
    const manual = this.manualOf(sym);
    const m = this.statsOf(sym);
    const auto = this.autoVerdict(m);
    let state, source;
    if (manual === 'block'){ state = 'blocked'; source = 'your decision'; }
    else if (manual === 'allow'){ state = 'allowed'; source = 'your decision'; }
    else if (S.auto && auto.block){ state = 'blocked'; source = 'the record'; }
    else if (auto.watch){ state = 'watch'; source = 'the record'; }
    else { state = 'allowed'; source = m && m.n ? 'the record' : 'no record yet'; }
    return { sym, state, source, manual, auto, m,
      /* an automatic block that is currently switched off is still worth showing */
      wouldBlock: auto.block };
  },

  /* the one question every bot asks */
  blocked(sym){ return this.verdict(sym).state === 'blocked'; },

  /* every instrument worth offering: traded, ruled on, scannable, or in the
     broker's own catalogue */
  searchPool(){
    const out = [];
    const seen = new Set();
    const add = s => { if (s && !seen.has(this.key(s))){ seen.add(this.key(s)); out.push(s); } };
    for (const m of Object.values(this.book())) add(m.sym);
    for (const s of Object.keys(this.load().rules)) add(s);
    if (typeof Bots !== 'undefined' && Bots.universe) { try { for (const s of Bots.universe()) add(s); } catch(e){} }
    if (typeof BROKER !== 'undefined') for (const s of BROKER.all()) add(s);
    return out;
  },

  /* the two columns, ready to render */
  columns(query){
    const q = (query || '').trim().toUpperCase().replace(/\//g, '');
    const list = this.searchPool().filter(s => q ? s.toUpperCase().includes(q) : this.statsOf(s) || this.manualOf(s));
    const rows = list.map(s => this.verdict(s));
    const rank = (a, b) => {
      const an = a.m ? a.m.n : 0, bn = b.m ? b.m.n : 0;
      if (!!an !== !!bn) return bn - an;                 // anything with a record first
      return (a.m ? a.m.net : 0) - (b.m ? b.m.net : 0);  // worst first inside each side
    };
    return {
      blocked: rows.filter(r => r.state === 'blocked').sort(rank),
      allowed: rows.filter(r => r.state !== 'blocked').sort((a, b) => -rank(a, b)),
      searching: !!q,
      /* how many instruments are permitted purely because nothing is known yet */
      untested: this.searchPool().filter(s => !this.statsOf(s) && !this.manualOf(s)).length,
    };
  },
};
