/* ASTRA Terminal — make a bot page smaller or larger.

   Some pages (Open Trades with many cards, the Deep Dive, the Live desk) run
   over more than a screen. "− 100% +" beside Expand shrinks or enlarges the
   CONTENT of the page that is open — each page remembers its own size — and
   Ctrl + mouse wheel over the page does the same. Click the percentage to go
   back to 100%. Nothing but the size changes. Stored under astra_pagezoom. */
const PageZoom = {
  KEY: 'astra_pagezoom',
  STEPS: [0.5, 0.6, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6],
  page(){ return (typeof Bots !== 'undefined' && Bots.active) || 'page'; },
  get(id){ const z = (lsGet(this.KEY, {}) || {})[id || this.page()]; return Number.isFinite(z) && z > 0 ? z : 1; },
  set(z, id){
    const all = lsGet(this.KEY, {}) || {}, key = id || this.page();
    z = Math.max(this.STEPS[0], Math.min(this.STEPS[this.STEPS.length - 1], +z.toFixed(2)));
    if (Math.abs(z - 1) < 0.001) delete all[key]; else all[key] = z;
    lsSet(this.KEY, all); this.apply();
  },
  step(d){
    const z = this.get(), i = this.STEPS.findIndex(s => s >= z - 0.001);
    const cur = i < 0 ? this.STEPS.length - 1 : (Math.abs(this.STEPS[i] - z) < 0.001 ? i : (d > 0 ? i - 1 : i));
    this.set(this.STEPS[Math.max(0, Math.min(this.STEPS.length - 1, cur + d))]);
  },
  apply(){
    const body = document.getElementById('botBody'); if (!body) return;
    const z = this.get();
    body.style.setProperty('--pz', String(z)); body.classList.toggle('pzOn', z !== 1);
    const lbl = document.getElementById('pzLabel'); if (lbl){ lbl.textContent = Math.round(z * 100) + '%'; lbl.classList.toggle('on', z !== 1); }
  },
  init(){
    const anchor = document.getElementById('wsExpand') || document.getElementById('botCollapse');
    if (!anchor || document.getElementById('pzCtl')) return;
    anchor.insertAdjacentHTML('beforebegin', `<span id="pzCtl" title="Make this page smaller or larger (Ctrl + mouse wheel over the page)">
      <button data-pz="-1" aria-label="Smaller">−</button><button id="pzLabel" data-pz="0" title="Back to 100%">100%</button><button data-pz="1" aria-label="Larger">+</button></span>`);
    document.getElementById('pzCtl').addEventListener('click', e => { const b = e.target.closest('[data-pz]'); if (!b) return; e.stopPropagation(); const d = +b.dataset.pz; d ? this.step(d) : this.set(1); });
    const body = document.getElementById('botBody');
    if (body) body.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); this.step(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    /* every time a page is drawn, its own size applies */
    if (typeof Bots !== 'undefined' && Bots.render && !Bots._pzWrapped){
      const r = Bots.render.bind(Bots); Bots.render = function(...a){ const out = r(...a); PageZoom.apply(); return out; }; Bots._pzWrapped = true;
    }
    this.apply();
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => PageZoom.init(), 600));
