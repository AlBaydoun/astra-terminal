/* ASTRA Terminal — the Back button.
   One button, always in the bottom-left corner (above every window, the
   full-screen Trade Replay and Market Clock included), that takes you one
   step back: the page, the lower-panel tab, the chart, its timeframe, the
   window you had open — whatever you were looking at before.

   How it knows: every half second it takes a small snapshot of "where you
   are". When that changes, the previous snapshot goes on a stack. Back pops
   it and puts everything back. This way EVERY route into a page counts —
   a click, a shortcut, "On chart ↗", "Open in replay" — without each of
   them having to report itself.

   Before stepping back it first closes whatever sits on top: an open
   pop-up (guide, settings, a confirmation box). Inside the replay, a trade
   you picked from its list goes back to that list.
   Also: Alt+← and the mouse's back side-button. Read only — Back never
   touches a trade, an order or a setting. */
const Nav = {
  stack: [],
  cur: null,
  restoring: false,
  lastPush: 0,
  MAX: 60,

  /* ---------- where you are ---------- */
  snap(){
    const tabBtn = document.querySelector('#botTabs [data-tab].active');
    const bp = document.getElementById('bottomPanel');
    const obs = {};
    if (typeof ObsWindows !== 'undefined') for (const [k, w] of Object.entries(ObsWindows.win || {})) obs[k] = w.state;
    const tab = tabBtn ? tabBtn.dataset.tab : null;
    const review = document.getElementById('trReview');
    const body = document.getElementById('botBody');
    return {
      sym: typeof STORE !== 'undefined' ? STORE.symbol : null,
      tf: typeof STORE !== 'undefined' ? STORE.tf : null,
      tab,
      bot: tab === 'bots' && typeof Bots !== 'undefined' ? Bots.active : null,
      collapsed: !!(bp && bp.classList.contains('collapsed')),
      wide: !!document.querySelector('#bot-bots.wsExpanded'),
      chartmax: document.documentElement.dataset.chartmax === '1',
      obs,
      trTrade: !!(review && !review.hidden && obs.replay && obs.replay !== 'closed' && obs.replay !== 'behind'),
      scroll: body ? body.scrollTop : 0,
    };
  },
  /* what counts as "a different place" — the scroll position does not */
  sig(s){ return JSON.stringify([s.sym, s.tf, s.tab, s.bot, s.collapsed, s.wide, s.chartmax, s.obs, s.trTrade]); },

  watch(){
    if (this.restoring) return;
    const now = this.snap();
    if (!this.cur){ this.cur = now; return; }
    if (this.sig(now) === this.sig(this.cur)){ this.cur.scroll = now.scroll; return; }
    /* several changes in a burst (one click that switches tab AND page) are one step */
    if (Date.now() - this.lastPush > 900){
      this.stack.push(this.cur);
      if (this.stack.length > this.MAX) this.stack.shift();
    }
    this.lastPush = Date.now();
    this.cur = now;
    this.paint();
  },

  /* ---------- going back ---------- */
  /* something on top? close that first — it is the most recent step */
  closeTop(){
    const conf = document.getElementById('posConfirm');
    if (conf){ if (typeof PosLines !== 'undefined') PosLines.cancelPending(); else conf.remove(); return true; }
    const modals = [...document.querySelectorAll('.modal.show')];
    if (modals.length){
      const m = modals[modals.length - 1];
      const x = m.querySelector('.mClose');
      if (x) x.click(); else m.classList.remove('show');
      return true;
    }
    return false;
  },

  back(){
    if (this.closeTop()){ this.paint(); return; }
    const now = this.snap();
    let prev = this.stack.pop();
    while (prev && this.sig(prev) === this.sig(now)) prev = this.stack.pop();
    if (!prev){ this.paint(); return toast('Nothing to go back to — this is where you started', 'info'); }
    this.restore(prev);
  },

  restore(s){
    this.restoring = true;
    const run = (f) => { try { f(); } catch(e){ console.warn('ASTRA back:', e.message); } };
    const now = this.snap();
    /* 1. the full-screen windows (Trade Replay, Market Clock) */
    if (typeof ObsWindows !== 'undefined'){
      for (const [k, want] of Object.entries(s.obs || {})){
        const w = ObsWindows.win[k]; if (!w || w.state === want) continue;
        if (want === 'closed'){ if (w.state !== 'closed') run(() => ObsWindows.close(k)); }
        else if (want === 'behind'){ if (w.state !== 'closed') run(() => ObsWindows.set(k, 'behind')); }
        else if (want === 'max' || want === 'normal' || want === 'min'){
          if (w.state === 'closed') run(() => w.module.show && w.module.show());
          run(() => ObsWindows.set(k, want));
        }
      }
    }
    const obsOpen = Object.values(s.obs || {}).some(v => v === 'max' || v === 'normal' || v === 'min');
    /* inside the replay: you came from its trade list → back to the list */
    if (now.trTrade && !s.trTrade && s.obs && ['max', 'normal', 'min'].includes(s.obs.replay)){
      const b = document.getElementById('trListBack'); if (b) run(() => b.click());
    }
    /* 2. the lower-panel tab and the bot page */
    if (!obsOpen && s.tab){
      if (s.tab === 'bots' && s.bot && typeof WorkspaceUI !== 'undefined'){
        const t = document.querySelector('#botTabs [data-tab="bots"]');
        if (t && !t.classList.contains('active')) run(() => t.click());
        if (typeof Bots !== 'undefined' && Bots.active !== s.bot) run(() => WorkspaceUI.openBot(s.bot));
      } else {
        const t = document.querySelector('#botTabs [data-tab="' + s.tab + '"]');
        if (t && !t.classList.contains('active')) run(() => t.click());
      }
    }
    if (typeof WorkspaceUI !== 'undefined' && s.wide !== now.wide) run(() => WorkspaceUI.expand(s.wide));
    /* 3. the chart: instrument, timeframe, maximised or not */
    if (typeof App !== 'undefined'){
      if (s.sym && s.sym !== STORE.symbol) run(() => App.setSymbol(s.sym));
      if (s.tf && s.tf !== STORE.tf) run(() => App.setTf(s.tf));
      if (App.setMax && s.chartmax !== (document.documentElement.dataset.chartmax === '1')) run(() => App.setMax(s.chartmax));
    }
    /* 4. the lower panel folded or open — last, because a tab click opens it */
    setTimeout(() => {
      const bp = document.getElementById('bottomPanel');
      if (bp && !obsOpen) bp.classList.toggle('collapsed', s.collapsed);
      const body = document.getElementById('botBody');
      if (body && s.scroll) body.scrollTop = s.scroll;
      window.dispatchEvent(new Event('resize'));
    }, 120);
    /* whatever that produced is now "here" — it must not be pushed as a new step */
    setTimeout(() => { this.cur = this.snap(); this.cur.scroll = s.scroll; this.restoring = false; this.paint(); }, 700);
  },

  /* ---------- the button ---------- */
  where(s){
    if (!s) return '';
    const openObs = Object.entries(s.obs || {}).find(([, v]) => v === 'max' || v === 'normal' || v === 'min');
    if (openObs) return openObs[0] === 'replay' ? 'Trade Replay' : 'Market Clock';
    if (s.tab === 'bots' && s.bot){
      const b = typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID[s.bot];
      const name = b ? (typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)
        : s.bot === 'permissions' ? 'Instrument permissions' : s.bot === 'botsettings' ? 'Bots on / off' : s.bot;
      if (!s.collapsed) return name;
    }
    const chart = 'chart ' + (typeof baseAsset === 'function' ? baseAsset(s.sym || '') : s.sym) + ' ' + (s.tf || '');
    if (s.collapsed || !s.tab) return chart;
    return (s.tab || '').replace(/^./, c => c.toUpperCase()) + ' · ' + chart;
  },
  paint(){
    const b = document.getElementById('navBack'); if (!b) return;
    const top = document.querySelector('.modal.show') || document.getElementById('posConfirm');
    const prev = this.stack[this.stack.length - 1];
    const can = !!(top || prev);
    b.disabled = !can;
    b.title = top ? 'Back — close this window (Alt+←)'
      : prev ? 'Back to: ' + this.where(prev) + '  (Alt+← or the mouse back button)'
      : 'Nothing to go back to yet';
    b.querySelector('small').textContent = top ? 'close' : prev ? this.where(prev) : '';
  },

  init(){
    if (document.getElementById('navBack')) return;
    document.body.insertAdjacentHTML('beforeend', '<button id="navBack" type="button" aria-label="Back one step"><b>←</b> Back<small></small></button>');
    const b = document.getElementById('navBack');
    b.addEventListener('click', e => { e.preventDefault(); this.back(); });
    /* the mouse's side button */
    window.addEventListener('mouseup', e => { if (e.button === 3){ e.preventDefault(); this.back(); } });
    window.addEventListener('mousedown', e => { if (e.button === 3) e.preventDefault(); });
    this.cur = this.snap();
    setInterval(() => { this.watch(); this.paint(); }, 500);
    this.paint();
  },
};

document.addEventListener('DOMContentLoaded', () => setTimeout(() => Nav.init(), 900));
