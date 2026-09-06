/* ASTRA Terminal — the automatic scheduler.

   Everything that used to need a button press, on a timer: the bots act on
   closed candles, the live ledger reconciles against MetaTrader, the Master
   Brain retrains as new finished trades arrive, the Market Fit study re-measures
   which strategy suits which market, and the Strategy Lab keeps looking for new
   recipes.

   Intervals are deliberately slow. These are heavy jobs and running them
   constantly would neither help the results nor leave the interface usable.
   Nothing here can place a real order — arming for that stays manual. */
const Auto = {

  JOBS: {
    liveSync: {
      label: 'Reconcile the live account with MetaTrader',
      every: 60 * 1000,
      when: () => typeof Live !== 'undefined' && Live.state && Live.armedList().length > 0,
      run: () => Live.sync(),
    },
    brainTrain: {
      label: 'Retrain the Master Brain on finished trades',
      every: 6 * 3600 * 1000,
      when: () => {
        const S = MasterBrain.state || MasterBrain.load();
        return S.samples.length >= MasterBrain.MIN_TRAIN &&
               S.samples.length > (S.trained || 0) + 20;   // only if genuinely new evidence
      },
      run: () => MasterBrain.train(),
    },
    marketFit: {
      label: 'Re-measure which strategy suits which market',
      every: 24 * 3600 * 1000,
      when: () => typeof MarketFit !== 'undefined' && !MarketFit.busy,
      run: async () => { await MarketFit.sweep(); await MarketFit.splitTest(); },
    },
    labResearch: {
      label: 'Look for new strategy recipes',
      every: 24 * 3600 * 1000,
      when: () => typeof StratLab !== 'undefined' && !StratLab.busy,
      run: () => StratLab.research(8),
    },
  },

  state: null,
  timer: null,
  running: null,

  load(){
    this.state = lsGet('astra_auto', null) || { on: false, last: {}, log: [] };
    if (!this.state.last) this.state.last = {};
    if (!this.state.log) this.state.log = [];
    return this.state;
  },
  save(){ lsSet('astra_auto', this.state); },

  note(text){
    this.state.log.unshift({ t: Date.now(), text });
    if (this.state.log.length > 40) this.state.log.length = 40;
    this.save();
  },

  init(){
    this.load();
    /* one slow heartbeat drives everything; each job decides if it is due */
    if (!this.timer) this.timer = setInterval(() => this.tick(), 30 * 1000);
  },

  setOn(on){
    this.load();
    this.state.on = !!on;
    this.save();
    if (typeof toast === 'function')
      toast(this.state.on
        ? 'Automatic mode on — measuring, retraining and researching on a schedule'
        : 'Automatic mode off — nothing runs unless you press it', this.state.on ? 'ok' : 'info');
    if (typeof Bots !== 'undefined' && Bots.render) Bots.render();
  },

  due(key){
    const j = this.JOBS[key];
    if (!j) return false;
    const last = this.state.last[key] || 0;
    return Date.now() - last >= j.every;
  },

  nextIn(key){
    const j = this.JOBS[key];
    const last = this.state.last[key] || 0;
    return Math.max(0, j.every - (Date.now() - last));
  },

  async tick(){
    this.load();
    if (!this.state.on || this.running) return;
    for (const [key, j] of Object.entries(this.JOBS)){
      if (!this.due(key)) continue;
      let ok = false;
      try { ok = j.when(); } catch(e){ ok = false; }
      if (!ok){
        /* not applicable right now — check again next cycle rather than spin */
        this.state.last[key] = Date.now() - j.every + 5 * 60 * 1000;
        this.save();
        continue;
      }
      this.running = key;
      try {
        await j.run();
        this.note(j.label + ' — done');
      } catch(e){
        this.note(j.label + ' — failed: ' + (e && e.message));
      }
      this.state.last[key] = Date.now();
      this.save();
      this.running = null;
      return;                       // one heavy job per cycle, never two at once
    }
  },

  /* a compact panel for the Master Brain page */
  view(){
    const S = this.load();
    const fmtIn = ms => ms < 60000 ? 'under a minute'
      : ms < 3600000 ? Math.round(ms / 60000) + ' min'
      : Math.round(ms / 3600000) + ' h';
    const rows = Object.entries(this.JOBS).map(([k, j]) => {
      const last = S.last[k];
      return `<div class="botRow">
        <b>${esc(j.label)}</b>
        <span class="dim2">every ${fmtIn(j.every)}</span>
        <span class="dim2">${last ? 'last ' + new Date(last).toLocaleString() : 'not yet run'}</span>
        <span class="${S.on ? '' : 'dim2'}">${S.on ? 'next in ' + fmtIn(this.nextIn(k)) : 'paused'}</span>
      </div>`;
    }).join('');
    return `<div class="botH">AUTOMATIC MODE
        <button class="bMini${S.on ? ' danger' : ''}" data-act="autotoggle">${S.on ? 'Turn off' : 'Turn on'}</button></div>
      <div class="botNote">${S.on
        ? 'Running on a schedule. One heavy job at a time, never two at once.'
        : 'Everything waits for a button press. Turn this on to let it measure, retrain and research on its own.'}
        Bots already act on closed candles every 30 seconds either way. Arming a bot for real money is never automatic.</div>
      ${rows}
      ${(S.log || []).slice(0, 6).map(l =>
        `<div class="botLog"><span class="dim2">${new Date(l.t).toLocaleString()}</span> ${esc(l.text)}</div>`).join('')}`;
  },
};
