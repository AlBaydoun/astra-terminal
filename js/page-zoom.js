/* ASTRA Terminal — make a page smaller or larger.

   "− 100% +" on the lower tab strip shrinks or enlarges WHAT IS SHOWING:
     · a bot page on the Bots tab (each bot page remembers its own size)
     · the Screener, Heatmap, Observer, Intel, News & Alerts tabs
     · the Market Clock and Trade Replay — in the lower panel AND full screen
   Ctrl + mouse wheel over the lower panel or a full-screen window does the
   same. Click the percentage to go back to 100%. Nothing but the size
   changes. Stored under astra_pagezoom (bot pages keep their old keys; a tab
   is stored as "tab:<panel id>"). */
const PageZoom = {
  KEY: 'astra_pagezoom',
  STEPS: [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6],
  page(){ return (typeof Bots !== 'undefined' && Bots.active) || 'page'; },
  /* what the buttons act on right now: { key, kind, el } */
  target(){
    const o = document.getElementById('obsMax');
    if (o && !o.hidden && o.dataset.name){
      const wrap = o.querySelector('.obsMaxBody > .obsWrap');
      if (wrap) return { key: 'tab:bot-obs-' + o.dataset.name, kind: 'wrap', el: wrap };
    }
    const act = document.querySelector('#bottomPanel .botPanel.active');
    if (act && act.id && act.id !== 'bot-bots') return { key: 'tab:' + act.id, kind: 'panel', el: act };
    return { key: this.page(), kind: 'bots', el: document.getElementById('botBody') };
  },
  get(id){ const z = (lsGet(this.KEY, {}) || {})[id || this.target().key]; return Number.isFinite(z) && z > 0 ? z : 1; },
  set(z, id){
    const all = lsGet(this.KEY, {}) || {}, key = id || this.target().key;
    z = Math.max(this.STEPS[0], Math.min(this.STEPS[this.STEPS.length - 1], +z.toFixed(2)));
    if (Math.abs(z - 1) < 0.001) delete all[key]; else all[key] = z;
    lsSet(this.KEY, all); this.apply();
    /* heatmap, observer, the replay chart… measure their box — let them redraw */
    clearTimeout(this._rt); this._rt = setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch(e){} }, 60);
  },
  step(d){
    const z = this.get(), i = this.STEPS.findIndex(s => s >= z - 0.001);
    const cur = i < 0 ? this.STEPS.length - 1 : (Math.abs(this.STEPS[i] - z) < 0.001 ? i : (d > 0 ? i - 1 : i));
    this.set(this.STEPS[Math.max(0, Math.min(this.STEPS.length - 1, cur + d))]);
  },
  apply(){
    /* every lower tab and window carries its OWN size, whether showing or not */
    const all = lsGet(this.KEY, {}) || {}, zOf = k => { const z = all[k]; return Number.isFinite(z) && z > 0 ? z : 1; };
    document.querySelectorAll('#bottomPanel .botPanel').forEach(p => {
      if (p.id === 'bot-bots') return;
      const z = zOf('tab:' + p.id);
      p.style.setProperty('--pz', String(z)); p.classList.toggle('pzOn', z !== 1);
    });
    const o = document.getElementById('obsMax');
    const wrap = o && !o.hidden && o.dataset.name ? o.querySelector('.obsMaxBody > .obsWrap') : null;
    if (wrap){ const z = zOf('tab:bot-obs-' + o.dataset.name); wrap.style.zoom = z !== 1 ? String(z) : ''; }
    const body = document.getElementById('botBody');
    if (body){ const z = zOf(this.page()); body.style.setProperty('--pz', String(z)); body.classList.toggle('pzOn', z !== 1); }
    const t = this.target(), z = this.get(t.key);
    const lbl = document.getElementById('pzLabel'); if (lbl){ lbl.textContent = Math.round(z * 100) + '%'; lbl.classList.toggle('on', z !== 1); }
  },
  init(){
    const anchor = document.getElementById('wsExpand') || document.getElementById('botCollapse');
    if (!anchor || document.getElementById('pzCtl')) return;
    anchor.insertAdjacentHTML('beforebegin', `<span id="pzCtl" title="Make what is showing smaller or larger — this tab, bot page or window (Ctrl + mouse wheel over it)">
      <button data-pz="-1" aria-label="Smaller">−</button><button id="pzLabel" data-pz="0" title="Back to 100%">100%</button><button data-pz="1" aria-label="Larger">+</button></span>`);
    document.getElementById('pzCtl').addEventListener('click', e => { const b = e.target.closest('[data-pz]'); if (!b) return; e.stopPropagation(); const d = +b.dataset.pz; d ? this.step(d) : this.set(1); });
    /* Ctrl + wheel over the lower panel or a full-screen Market Clock / Replay */
    document.addEventListener('wheel', e => {
      if (!e.ctrlKey || !e.target.closest || !e.target.closest('#bottomPanel .botBody, #obsMax .obsMaxBody')) return;
      e.preventDefault(); this.step(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    /* switching tabs shows that tab's own size */
    const tabs = document.getElementById('botTabs');
    if (tabs) tabs.addEventListener('click', () => setTimeout(() => this.apply(), 30));
    /* every time a bot page is drawn, its own size applies */
    if (typeof Bots !== 'undefined' && Bots.render && !Bots._pzWrapped){
      const r = Bots.render.bind(Bots); Bots.render = function(...a){ const out = r(...a); PageZoom.apply(); return out; }; Bots._pzWrapped = true;
    }
    /* Market Clock / Trade Replay moving between full screen, panel and closed */
    if (typeof ObsWindows !== 'undefined' && !ObsWindows._pzWrapped){
      const s = ObsWindows.set.bind(ObsWindows); ObsWindows.set = function(...a){ const out = s(...a); PageZoom.apply(); return out; };
      const f = ObsWindows.fit.bind(ObsWindows); ObsWindows.fit = function(...a){ const out = f(...a); PageZoom.apply(); return out; };
      ObsWindows._pzWrapped = true;
    }
    this.apply();
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => PageZoom.init(), 600));
