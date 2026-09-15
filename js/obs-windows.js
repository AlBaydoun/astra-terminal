/* ASTRA Terminal — the Market Clock and Trade Replay as three-state windows.
   Both pages were built as modal dialogs. This wraps them, without changing
   how they work inside, so each can be:
     max    — the whole screen, its content scaled to fit without scrolling
     normal — a tab in the lower panel, like the Screener
     min    — the lower panel folded to its tab strip
   The tab button cycles closed → max → normal → min → max; Esc drops a
   maximised window to normal; ✕ closes it. */
const ObsWindows = {
  win: {},     // name -> { dialog, wrap, module, panel, btn, state }
  overlay: null,

  register(name, dialogId, btnId, module){
    const dialog = document.getElementById(dialogId);
    if (!dialog || this.win[name]) return;
    /* every child of the dialog moves into a wrapper we can carry around */
    const wrap = document.createElement('div');
    wrap.className = 'obsDialog obsWrap';
    while (dialog.firstChild) wrap.appendChild(dialog.firstChild);
    dialog.hidden = true;
    /* the modules talk to their host as a dialog — keep that contract */
    Object.defineProperty(dialog, 'open', { get: () => this.win[name].state !== 'closed', configurable: true });
    dialog.showModal = () => this.set(name, 'max');
    dialog.close = () => this.close(name);
    Object.defineProperty(wrap, 'open', { get: () => this.win[name].state !== 'closed', configurable: true });
    wrap.showModal = dialog.showModal; wrap.close = dialog.close;
    module.host = wrap;
    /* the lower-panel tab that holds it in the normal state */
    const anyPanel = document.querySelector('.botPanel');
    const panel = document.createElement('div');
    panel.className = 'botPanel obsPanel'; panel.id = 'bot-obs-' + name;
    anyPanel.parentElement.appendChild(panel);
    const btn = document.getElementById(btnId);
    this.win[name] = { dialog, wrap, module, panel, btn, state: 'closed', zoom: 1 };
    /* the tab button cycles the states; the module's own listener is skipped */
    btn.addEventListener('click', e => {
      e.stopImmediatePropagation(); e.preventDefault();
      const w = this.win[name];
      for (const k of Object.keys(this.win)) if (k !== name && this.win[k].state === 'max') this.set(k, 'behind');
      if (w.state === 'closed' || w.state === 'behind'){ module.show(); if (w.state !== 'max') this.set(name, 'max'); }
      else if (w.state === 'max') this.set(name, 'normal');
      else if (w.state === 'normal') this.set(name, 'min');
      else this.set(name, 'max');
    }, true);
    /* another lower tab pushes the window behind */
    document.querySelectorAll('#botTabs [data-tab]').forEach(t => t.addEventListener('click', () => {
      const w = this.win[name];
      if (w.state === 'max') this.set(name, 'behind');
      else if (w.state === 'normal' || w.state === 'min'){ w.state = 'behind'; btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
    }, true));

    /* the ✕ inside the page closes it */
    wrap.querySelector('[data-close]')?.addEventListener('click', e => { e.stopImmediatePropagation(); this.close(name); }, true);
    if (name === 'replay') this.replayExtras(wrap);
  },

  /* the replay: fold the upper part so the chart gets the screen, and open it
     in a window of its own for another monitor */
  replayExtras(wrap){
    const review = wrap.querySelector('#trReview'); if (!review) return;
    review.insertAdjacentHTML('afterbegin', `<div class="trFoldBar">
      <button class="bMini" data-trfold title="Hide the filters, the trade list and the facts — the chart takes the whole window">▲ Chart only</button>
      <button class="bMini" data-trown title="Open the replay in a window of its own — drag it to another monitor">⧉ Own window</button>
      <span class="dim2">Esc → lower panel · the tab button cycles full screen / panel / folded</span></div>`);
    const fold = wrap.querySelector('[data-trfold]');
    /* the replay chart was created at a fixed height; when its box changes it has to be told */
    const sizeChart = () => {
      const el = wrap.querySelector('#trChart'), T = window.TradeReview;
      if (!el || !T || !T.chart) return;
      const h = wrap.classList.contains('trChartOnly') ? Math.max(300, el.clientHeight) : 370;
      try { T.chart.applyOptions({ width: el.clientWidth, height: h }); } catch(e){}
    };
    fold.addEventListener('click', () => {
      const on = wrap.classList.toggle('trChartOnly');
      fold.textContent = on ? '▼ Show everything' : '▲ Chart only';
      setTimeout(() => { sizeChart(); window.dispatchEvent(new Event('resize')); }, 60);
    });
    window.addEventListener('resize', () => setTimeout(sizeChart, 80));
    this._sizeReplayChart = sizeChart;
    wrap.querySelector('[data-trown]').addEventListener('click', () => {
      if (typeof Popout === 'undefined') return;
      const w = Popout.open('replay', { fresh: false });
      if (!w) toast('The window was blocked — allow pop-ups for ASTRA', 'warn');
    });
  },

  ensureOverlay(){
    if (this.overlay) return this.overlay;
    const o = document.createElement('div'); o.id = 'obsMax'; o.hidden = true;
    o.innerHTML = `<div class="obsMaxBar"><span class="obsMaxHint">Esc or the tab button → back into the lower panel · ✕ closes</span>
      <span class="paneCtl"><button data-obsact="normal" title="Into the lower panel (Esc)">▢</button><button data-obsact="close" title="Close">×</button></span></div><div class="obsMaxBody"></div>`;
    document.body.appendChild(o);
    o.querySelectorAll('[data-obsact]').forEach(b => b.addEventListener('click', () => { const name = o.dataset.name; if (!name) return; b.dataset.obsact === 'close' ? this.close(name) : this.set(name, 'normal'); }));
    window.addEventListener('resize', () => { if (o.dataset.name && !o.hidden) this.fit(o.dataset.name); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && o.dataset.name && !o.hidden) this.set(o.dataset.name, 'normal'); });
    return this.overlay = o;
  },

  set(name, state){
    const w = this.win[name]; if (!w) return;
    const o = this.ensureOverlay(), bp = document.getElementById('bottomPanel');
    w.state = state;
    if (state === 'max'){
      if (o.dataset.name && o.dataset.name !== name) this.set(o.dataset.name, 'behind');
      o.dataset.name = name; o.querySelector('.obsMaxBody').replaceChildren(w.wrap); o.hidden = false;
      this.tabsInto(o);
      document.querySelectorAll('#botTabs [data-tab]').forEach(x => x.classList.remove('active'));
      w.panel.classList.remove('active');
      if (typeof App !== 'undefined' && App.setPanelMax) App.setPanelMax(false);
      this.fit(name);
    } else if (state === 'normal' || state === 'min'){
      if (o.dataset.name === name){ o.hidden = true; o.dataset.name = ''; this.tabsBack(); }
      w.wrap.style.zoom = ''; w.panel.appendChild(w.wrap);
      document.querySelectorAll('#botTabs [data-tab]').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.botPanel').forEach(p => p.classList.toggle('active', p === w.panel));
      for (const k of Object.keys(this.win)) if (k !== name && ['normal', 'min'].includes(this.win[k].state)) this.win[k].state = 'behind';
      if (typeof App !== 'undefined' && App.setPanelMax) App.setPanelMax(false);
      bp.classList.toggle('collapsed', state === 'min');
      if (state === 'normal'){
        const h = parseFloat(bp.style.height) || bp.getBoundingClientRect().height;
        if (!(h >= 160)){ bp.style.height = Math.max(300, Math.min(window.innerHeight - 220, 420)) + 'px'; }
      }
      if (document.documentElement.dataset.chartmax === '1' && typeof App !== 'undefined' && App.setMax) App.setMax(false);
    } else if (state === 'behind'){
      if (o.dataset.name === name){ o.hidden = true; o.dataset.name = ''; this.tabsBack(); }
      w.wrap.style.zoom = ''; w.panel.appendChild(w.wrap);
    }
    for (const k of Object.keys(this.win)){
      const on = ['max', 'normal', 'min'].includes(this.win[k].state);
      this.win[k].btn.classList.toggle('active', on); this.win[k].btn.setAttribute('aria-expanded', String(on));
    }
    /* the replay chart measures its box — give it a nudge */
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch(e){} if (name === 'replay' && this._sizeReplayChart) this._sizeReplayChart(); if (w.module && w.module.chart && w.module.draw) try { w.module.draw(); } catch(e){} }, 80);
  },

  /* the Screener / Heatmap / … / Bots strip moves into the full-screen bar,
     so you can switch to anything else from there, and goes home afterwards */
  tabsInto(o){
    const tabs = document.getElementById('botTabs'); if (!tabs || tabs.parentElement === o.querySelector('.obsMaxBar')) return;
    if (!this._tabsHome) this._tabsHome = { parent: tabs.parentElement, next: tabs.nextSibling };
    o.querySelector('.obsMaxBar').prepend(tabs);
  },
  tabsBack(){
    const tabs = document.getElementById('botTabs'), h = this._tabsHome;
    if (!tabs || !h || tabs.parentElement === h.parent) return;
    h.parent.insertBefore(tabs, h.next && h.next.parentElement === h.parent ? h.next : null);
  },

  close(name){
    const w = this.win[name]; if (!w) return;
    const o = this.ensureOverlay();
    if (o.dataset.name === name){ o.hidden = true; o.dataset.name = ''; this.tabsBack(); }
    w.wrap.style.zoom = ''; w.panel.appendChild(w.wrap); w.panel.classList.remove('active');
    w.state = 'closed';
    w.btn.classList.remove('active'); w.btn.setAttribute('aria-expanded', 'false');
    /* their own close listeners (timers, chart disposal) still run */
    try { w.dialog.dispatchEvent(new Event('close')); } catch(e){}
    /* back to the tab that was showing before */
    const first = document.querySelector('#botTabs [data-tab="screener"]');
    if (first && !document.querySelector('.botPanel.active')) first.click();
  },

  /* scale the page so the whole thing fits the screen, nothing removed */
  fit(name){
    const w = this.win[name], o = this.overlay; if (!w || !o || o.dataset.name !== name) return;
    /* full size always — the page scrolls; nothing is shrunk */
    w.wrap.style.zoom = ''; w.zoom = 1; o.querySelector('.obsMaxHint').textContent = 'Esc or the tab button → lower panel · ✕ closes';
    return;
    const body = o.querySelector('.obsMaxBody');
    const availW = body.clientWidth - 8, availH = body.clientHeight - 8;
    /* smaller zoom = wider layout = more cards per row = fewer rows, so the
       right scale has to be found by trying, largest first */
    const floor = name === 'replay' ? 0.5 : 0.4;
    let z = 1;
    for (; z >= floor - 1e-9; z = Math.round((z - 0.05) * 100) / 100){
      w.wrap.style.zoom = String(z);
      const fits = w.wrap.scrollHeight * z <= availH && w.wrap.scrollWidth * z <= availW;
      if (fits) break;
    }
    z = Math.max(floor, z);
    w.wrap.style.zoom = String(z); w.zoom = z;
    o.querySelector('.obsMaxHint').textContent = (z < 1 ? 'Scaled to ' + Math.round(z * 100) + '% so everything fits · ' : '') + 'Esc or the tab button → lower panel · ✕ closes';
  },
  refit(name){ const w = this.win[name]; if (w && w.state === 'max') clearTimeout(w._t), w._t = setTimeout(() => this.fit(name), 80); },
};

document.addEventListener('DOMContentLoaded', () => {
  /* the two modules build their dialogs on DOMContentLoaded too; we run after them */
  setTimeout(() => {
    if (typeof MarketClock !== 'undefined') ObsWindows.register('clock', 'marketObservatory', 'marketClockBtn', MarketClock);
    if (typeof TradeReview !== 'undefined') ObsWindows.register('replay', 'tradeReview', 'tradeReviewBtn', TradeReview);
    if (typeof Popout !== 'undefined' && Popout.panel && Popout.panel() === 'replay' && typeof TradeReview !== 'undefined'){
      document.documentElement.dataset.panel = 'replay';
      setTimeout(() => { TradeReview.show(); ObsWindows.set('replay', 'max'); TradeReview.current && TradeReview.current(); }, 400);
    }
    /* refit after each redraw while maximised */
    if (typeof MarketClock !== 'undefined'){ const r = MarketClock.render.bind(MarketClock); MarketClock.render = function(){ const out = r(); ObsWindows.refit('clock'); return out; }; }
    if (typeof TradeReview !== 'undefined'){
      for (const fn of ['filter', 'prepare']){ const f = TradeReview[fn]; if (typeof f === 'function') TradeReview[fn] = function(...a){ const out = f.apply(this, a); ObsWindows.refit('replay'); return out; }; }
    }
  }, 0);
});
