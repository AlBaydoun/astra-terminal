/* ASTRA Terminal — the Research page.

   New bot ideas, researched in a Claude Code chat on this folder ("research run"),
   land here with their evidence. Each idea is a card: what it does, where and on
   which timeframe, what the backtest found after spread, what RANDOM entries
   found on the same markets over the same period, whether both halves of the
   history held up, and why it should work. Two buttons: Add as paper bot, Dismiss.

   Where the ideas come from: js/research/candidates.js, written by Claude after a
   run (RESEARCH_CANDIDATES.push({...})). Each idea carries its own strategy code
   (signal) - it becomes an ordinary paper bot exactly the way the Strategy
   Checker mounts its bots, and it is remembered across restarts.

   Paper only. A researched bot can reach real money ONLY the way every other bot
   can: through the Live desk on "Live connection & safety", its four gates and
   your typed confirmations. Nothing on this page talks to a broker.

   Storage (new key, nothing else changes shape): astra_research
     { added: { id: at }, dismissed: { id: at }, removed: { id: at } } */
const RESEARCH_CANDIDATES = [];

const Research = {
  KEY: 'astra_research',
  /* the bar an idea has to clear before it is even shown as "passes" (Al's research prompt) */
  BAR: { minTrades: 30, minPf: 1.3, maxDdPct: 15 },

  state(){
    const s = lsGet(this.KEY, null) || {};
    s.added = s.added || {}; s.dismissed = s.dismissed || {}; s.removed = s.removed || {};
    return s;
  },
  save(s){ lsSet(this.KEY, s); },
  all(){ return RESEARCH_CANDIDATES.filter(c => c && c.id && typeof c.signal === 'function'); },
  byId(id){ return this.all().find(c => c.id === id) || null; },

  /* ---------- turning an idea into a paper bot (the Checker's way) ---------- */
  toBot(c){
    return {
      id: c.id, name: 'Researched · ' + c.name, researched: true,
      blurb: (c.summary || '') + (c.found ? ' Found by research on ' + c.found + '.' : '') + ' Paper only until it earns a seat on the Live desk.',
      defaults: Object.assign({ tf: c.tf || '15m', tfAuto: false, minScore: 0, maxOpen: c.maxOpen || 2 },
        c.timeLimitBars ? { timeLimitBars: c.timeLimitBars } : {},
        c.markets && c.markets.length ? { groups: c.markets.slice() } : {},
        c.instruments && c.instruments.length ? { instruments: c.instruments.slice() } : {}),
      warmup: c.warmup || 120,
      needsHigher: !!c.needsHigher,
      signal: (w, cfg, ledger, higher) => {
        try { return c.signal(w, cfg, ledger, higher); } catch(e){ return { dir: 0, failed: ['research strategy error: ' + e.message] }; }
      },
    };
  },
  mount(c){
    if (!c || BOT_BY_ID[c.id]) return null;
    const bot = this.toBot(c);
    BOTS.push(bot); BOT_BY_ID[bot.id] = bot;
    if (typeof Bots !== 'undefined' && Bots.ledgers){
      Bots.cfgs[bot.id] = Object.assign({}, bot.defaults, lsGet('astra_botcfg_' + bot.id, {}));
      Bots.ledgers[bot.id] = BotEngine.load(bot.id);
    }
    if (typeof StratIndReg !== 'undefined') try { StratIndReg.add(bot); } catch(e){}
    return bot;
  },
  /* every idea you added comes back on start (called from Bots.init, beside Checker.mountAll) */
  mountAll(){
    const s = this.state();
    for (const id of Object.keys(s.added)){ if (s.removed[id]) continue; const c = this.byId(id); if (c) this.mount(c); }
  },
  add(id){
    const c = this.byId(id); if (!c) return toast('That idea is no longer in the research file', 'warn');
    const s = this.state(); s.added[id] = Date.now(); delete s.dismissed[id]; delete s.removed[id]; this.save(s);
    this.mount(c);
    toast('Added as a paper bot: Researched · ' + c.name + ' — it trades on paper from now on', 'ok');
    this.redraw();
  },
  remove(id){
    const c = this.byId(id);
    if (!confirm('Take "Researched · ' + (c ? c.name : id) + '" out of your bots?\n\nIts paper record is kept; adding it again brings it back with that record.')) return;
    const s = this.state(); s.removed[id] = Date.now(); delete s.added[id]; this.save(s);
    const i = BOTS.findIndex(b => b.id === id); if (i >= 0) BOTS.splice(i, 1); delete BOT_BY_ID[id];
    if (typeof Bots !== 'undefined'){ delete Bots.cfgs[id]; delete Bots.ledgers[id]; }
    toast('Removed from your bots — its record is kept', 'info');
    this.redraw();
  },
  dismiss(id){ const s = this.state(); s.dismissed[id] = Date.now(); this.save(s); this.redraw(); },
  undismiss(id){ const s = this.state(); delete s.dismissed[id]; this.save(s); this.redraw(); },

  /* ---------- the verdict, from the evidence the idea carries ---------- */
  checks(c){
    const e = c.evidence || {}, r = e.random || {}, h = e.halves || {};
    const pf = v => v == null ? '—' : v === Infinity ? '∞' : (+v).toFixed(2);
    return [
      { label: 'At least ' + this.BAR.minTrades + ' trades in the test', ok: (e.trades || 0) >= this.BAR.minTrades, got: (e.trades || 0) + ' trades' },
      { label: 'Profit factor ' + this.BAR.minPf + ' or better, after spread', ok: (e.pf || 0) >= this.BAR.minPf, got: 'PF ' + pf(e.pf) },
      { label: 'Beats random entries on the same markets', ok: e.pf != null && r.pf != null && e.pf > r.pf && (e.netR == null || r.netR == null || e.netR > r.netR), got: 'PF ' + pf(e.pf) + ' vs random ' + pf(r.pf) },
      { label: 'Both halves of the history profitable', ok: !!(h.first && h.second && h.first.pf > 1 && h.second.pf > 1), got: h.first && h.second ? 'PF ' + pf(h.first.pf) + ' / ' + pf(h.second.pf) : 'not measured' },
      { label: 'Worst drawdown ' + this.BAR.maxDdPct + '% or less', ok: e.maxDdPct != null && e.maxDdPct <= this.BAR.maxDdPct, got: e.maxDdPct != null ? (+e.maxDdPct).toFixed(1) + '%' : 'not measured' },
    ];
  },

  /* ---------- the page ---------- */
  view(){
    const s = this.state(), list = this.all();
    const live = list.filter(c => !s.dismissed[c.id]), gone = list.filter(c => s.dismissed[c.id]);
    const added = live.filter(c => s.added[c.id] && !s.removed[c.id]);
    const fresh = live.filter(c => !(s.added[c.id] && !s.removed[c.id]));
    const prompt = 'Research run. Find new strong bots for [markets, e.g. gold and US indices] on [timeframes, e.g. 15m and 1h].\n1. Read a copy of my real bot records first: what works, what fails, which markets and hours.\n2. Design new strategies that are NOT copies of my existing bots.\n3. Backtest each on broker data through the read-only bridge, after spread, and compare it with random entries on the same markets.\n4. Put only the ones that clearly beat random entries on the Research page: at least 30 trades, a profit factor above 1.3, and a drawdown I could live with. Include the reason each one works.\n5. Add nothing as a bot yet. Report the top 3 to me in plain words.';
    const card = c => {
      const e = c.evidence || {}, r = e.random || {}, ch = this.checks(c), passed = ch.filter(x => x.ok).length;
      const isAdded = !!(s.added[c.id] && !s.removed[c.id]), dis = !!s.dismissed[c.id];
      const pf = v => v == null ? '—' : v === Infinity ? '∞' : (+v).toFixed(2);
      const num = (label, val, cls) => `<span><label>${esc(label)}</label><b class="${cls || ''}">${val}</b></span>`;
      return `<div class="rsxCard${isAdded ? ' added' : ''}${dis ? ' dismissed' : ''}" data-rsx="${esc(c.id)}">
        <div class="rsxHead">
          <b class="rsxName">${esc(c.name)}</b>
          <span class="rsxTags">${(c.markets || []).map(m => `<em>${esc(((Bots.marketGroups && Bots.marketGroups()[m]) || {}).label || m)}</em>`).join('')}<em>${esc(c.tf || '')}</em>${c.direction ? `<em>${esc(c.direction)}</em>` : ''}</span>
          <span class="rsxVerdict ${passed === ch.length ? 'up' : passed >= 3 ? 'warn' : 'down'}">${passed} of ${ch.length} checks passed</span>
          ${c.found ? `<span class="dim2 rsxFound">found ${esc(c.found)}</span>` : ''}
        </div>
        ${c.summary ? `<p class="rsxSummary">${esc(c.summary)}</p>` : ''}
        <div class="rsxNums">
          ${num('Trades', e.trades != null ? e.trades : '—')}
          ${num('Win rate', e.winRate != null ? Math.round(e.winRate) + '%' : '—')}
          ${num('Profit factor', pf(e.pf), e.pf >= this.BAR.minPf ? 'up' : e.pf != null && e.pf < 1 ? 'down' : '')}
          ${num('Net result', e.netR != null ? (e.netR >= 0 ? '+' : '') + (+e.netR).toFixed(1) + ' R' : '—', e.netR >= 0 ? 'up' : 'down')}
          ${num('Worst drawdown', e.maxDdPct != null ? (+e.maxDdPct).toFixed(1) + '%' : '—')}
          ${num('Random entries', r.pf != null ? 'PF ' + pf(r.pf) + (r.netR != null ? ' · ' + (r.netR >= 0 ? '+' : '') + (+r.netR).toFixed(1) + ' R' : '') : '—', 'dim2')}
          ${e.period ? num('Tested on', esc(e.period)) : ''}
        </div>
        <div class="rsxChecks">${ch.map(x => `<div class="${x.ok ? 'ok' : 'no'}"><b>${x.ok ? '✓' : '✕'}</b><span>${esc(x.label)}</span><i>${esc(x.got)}</i></div>`).join('')}</div>
        <details class="rsxMore"><summary>Why it should work · risks · per market</summary>
          ${c.why ? `<p><b>Why:</b> ${esc(c.why)}</p>` : ''}
          ${c.risks ? `<p><b>Risks:</b> ${esc(c.risks)}</p>` : ''}
          ${c.rules ? `<p><b>The rules:</b> ${esc(c.rules)}</p>` : ''}
          ${(e.perMarket || []).length ? `<table class="dashTable rsxPer"><thead><tr><th>Market / pair</th><th class="num">Trades</th><th class="num">Win %</th><th class="num">PF</th><th class="num">Net R</th></tr></thead><tbody>${e.perMarket.map(m => `<tr><td>${esc(m.name)}</td><td class="num">${m.trades ?? '—'}</td><td class="num">${m.winRate != null ? Math.round(m.winRate) : '—'}</td><td class="num ${m.pf >= 1 ? 'up' : 'down'}">${pf(m.pf)}</td><td class="num ${m.netR >= 0 ? 'up' : 'down'}">${m.netR != null ? (+m.netR).toFixed(1) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
        </details>
        <div class="rsxActs">
          ${dis ? `<button class="bMini" data-rsxundo="${esc(c.id)}">↺ Bring back</button>`
            : isAdded ? `<span class="rsxAddedTag">✓ Added as a paper bot</span><button class="bMini" data-ws-bot="${esc(c.id)}">Open the bot ↗</button><button class="bMini" data-rsxremove="${esc(c.id)}">Take out of my bots</button>`
            : `<button class="bBtn go" data-rsxadd="${esc(c.id)}">＋ Add as paper bot</button><button class="bMini" data-rsxdismiss="${esc(c.id)}">Dismiss</button>`}
        </div>
      </div>`;
    };
    return `<div class="rsxPage">
      <div class="botNote rsxIntro">New bot ideas found by research in a Claude Code chat on this folder. Every idea shows the evidence it was found on — including what <b>random entries</b> did on the same markets over the same period, because a strategy is only worth something if it beats chance. <b>Add as paper bot</b> makes it an ordinary paper bot; real money only ever goes through the Live desk and its gates.</div>
      <div class="botStats">${Bots.stat('IDEAS', live.length)}${Bots.stat('NEW', fresh.length, fresh.length ? 1 : 0)}${Bots.stat('ADDED AS BOTS', added.length)}${Bots.stat('DISMISSED', gone.length)}</div>
      ${fresh.length ? `<h3 class="rsxH">New ideas</h3><div class="rsxList">${fresh.map(card).join('')}</div>` : ''}
      ${added.length ? `<h3 class="rsxH">Added as paper bots</h3><div class="rsxList">${added.map(card).join('')}</div>` : ''}
      ${!live.length ? `<div class="empty rsxEmpty">No research ideas yet. Ask for a research run in a Claude Code chat on this folder — the ideas that beat random entries appear here.</div>` : ''}
      ${gone.length ? `<details class="rsxGone"><summary>Dismissed (${gone.length})</summary><div class="rsxList">${gone.map(card).join('')}</div></details>` : ''}
      <details class="rsxHow"><summary>How to ask for a research run</summary>
        <p>Open a Claude Code chat on the ASTRA folder, set the effort to <b>High</b>, and send this (change the markets and timeframes in brackets, or leave them out to search everything):</p>
        <pre class="rsxPrompt">${esc(prompt)}</pre>
        <button class="bMini" data-rsxcopy="1">Copy the prompt</button>
        <p>When you like an idea: press <b>Add as paper bot</b> here, or tell Claude “add [name] as a paper bot”. After a research run, commit in GitHub Desktop and restart ASTRA so the new ideas load.</p>
      </details>
    </div>`;
  },
  redraw(){ if (typeof Bots !== 'undefined' && Bots.active === 'research') Bots.render(); },
  bind(host){
    if (host._rsx) return; host._rsx = true;
    host.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-rsxadd],[data-rsxdismiss],[data-rsxundo],[data-rsxremove],[data-rsxcopy]'); if (!t) return;
      if (t.dataset.rsxadd) return this.add(t.dataset.rsxadd);
      if (t.dataset.rsxdismiss) return this.dismiss(t.dataset.rsxdismiss);
      if (t.dataset.rsxundo) return this.undismiss(t.dataset.rsxundo);
      if (t.dataset.rsxremove) return this.remove(t.dataset.rsxremove);
      if (t.dataset.rsxcopy){ const pre = host.querySelector('.rsxPrompt'); try { navigator.clipboard.writeText(pre.textContent); toast('Prompt copied', 'ok'); } catch(err){ toast('Select the text and copy it by hand', 'warn'); } }
    });
  },
};

/* the page itself, beside the Strategy Checker under Scanners & research */
BOTS.push({ id: 'research', name: 'Research', analysis: true, researchDesk: true,
  blurb: 'New bot ideas found by research, each with its evidence against random entries. Add the ones you like as paper bots.',
  defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 }, warmup: 0, signal: () => null });
BOT_BY_ID.research = BOTS[BOTS.length - 1];
