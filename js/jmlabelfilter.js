/* ASTRA Terminal — choose which chart labels to show.

   One filter for every label the chart draws on the candles: Candlestick Patterns
   (Hammer, Bullish engulfing …), ✦ Signal Labels (TD9, TD9★, CE Buy, UT Sell …)
   and the other label sources (ASTRA Confluence, strategy markers). Untick a name
   and it leaves the chart; tick only the ones you want to study. The choice is
   remembered, and a name you have never seen before shows by default.

   Only what is drawn changes. The detectors, bots and the Signal Labels card keep
   reading every signal. */
const JMLabelFilter = {
  KEY: 'astra_label_filter',
  KNOWN: {
    'Candlestick patterns': ['Hammer', 'Shooting star', 'Bullish engulfing', 'Bearish engulfing', 'Morning star', 'Evening star',
      'Three soldiers', 'Three crows', 'Tweezer bottom', 'Tweezer top', 'Doji'],
    'Signal Labels': ['TD9', 'TD9★', 'TD13', 'Bull div', 'Bear div', 'BOS', 'CHoCH', 'UT Buy', 'UT Sell', 'CE Buy', 'CE Sell', 'Squeeze ▲', 'Squeeze ▼'],
    'Other labels': [],
  },
  seen: {},          /* group -> {name: count} on the open chart */

  hidden(){ const v = lsGet(this.KEY, null); return new Set(v && Array.isArray(v.hidden) ? v.hidden : []); },
  saveHidden(set){ lsSet(this.KEY, { hidden: [...set] }); this.syncBtn(); try { Chart.renderPatternMarkers(); } catch(e){} },

  /* called by the chart with each source's markers; returns what to draw */
  apply(groups){
    const hid = this.hidden(), out = [];
    this.seen = {}; this.shownBy = {};
    for (const [g, list] of groups){
      const s = this.seen[g] = {};
      for (const m of list){
        const n = String(m.text || '');
        s[n] = (s[n] || 0) + 1;
        if (!hid.has(n)){ out.push(m); this.shownBy[g] = (this.shownBy[g] || 0) + 1; }
      }
    }
    this.lastShown = out.length; this.lastTotal = groups.reduce((a, g) => a + g[1].length, 0);
    this.syncBtn();
    const p = document.getElementById('jmLfPanel'); if (p && !p.contains(document.activeElement)) this.fillPanel(p);
    return out;
  },

  names(g){ const seen = this.seen[g] || {}; return [...new Set((this.KNOWN[g] || []).concat(Object.keys(seen)))]; },

  syncBtn(){
    const b = document.getElementById('jmLfBtn'); if (!b) return;
    const n = this.hidden().size;
    b.classList.toggle('on', n > 0);
    b.textContent = n ? '⚑ Filter · ' + n + ' hidden' : '⚑ Filter labels';
    b.title = n ? 'Some chart labels are hidden: ' + (this.lastShown ?? '?') + ' of ' + (this.lastTotal ?? '?') + ' shown. Press to choose.' : 'Choose which chart labels to show: candlestick patterns, Signal Labels and others';
  },

  fillPanel(p){
    const hid = this.hidden(), q = (p.querySelector('#jmLfQ') || {}).value || '';
    const body = p.querySelector('.jmLfBody'), f = q.trim().toLowerCase();
    body.innerHTML = Object.keys(this.KNOWN).map(g => {
      const names = this.names(g).filter(n => !f || n.toLowerCase().includes(f));
      if (!names.length) return '';
      const seen = this.seen[g] || {}, on = names.filter(n => !hid.has(n)).length;
      return `<div class="jmLfGroup"><div class="jmLfHead"><b>${esc(g)}</b><span>${on} of ${names.length} shown</span>
          <button type="button" class="jmLfLink" data-lfall="${esc(g)}">All</button><button type="button" class="jmLfLink" data-lfnone="${esc(g)}">None</button></div>
        <div class="jmLfGrid">${names.map(n => `<label class="jmLfItem${seen[n] ? '' : ' zero'}"><input type="checkbox" data-lfname="${esc(n)}"${hid.has(n) ? '' : ' checked'}>
          <span>${esc(n)}</span><small>${seen[n] || 0}</small><button type="button" class="jmLfOnly" data-lfonly="${esc(n)}" title="Show only ${esc(n)}">only</button></label>`).join('')}</div></div>`;
    }).join('') || '<p class="dim2">No label matches.</p>';
  },

  panel(){
    let p = document.getElementById('jmLfPanel'); if (p){ p.remove(); return; }
    document.body.insertAdjacentHTML('beforeend', `<div id="jmLfPanel" class="autoSrPanel asPanel jmLfPanel" role="dialog" aria-label="Filter chart labels">
      <div class="jmLfTop"><b>Filter chart labels</b><input id="jmLfQ" type="search" placeholder="Find a label, e.g. TD9" autocomplete="off">
        <button type="button" class="bMini" data-lfshowall="1">Show all</button></div>
      <p class="dim2" style="margin:0 0 6px">Numbers are labels on the open chart. Only the drawing changes; bots and cards still read every signal.</p>
      <div class="jmLfBody"></div></div>`);
    p = document.getElementById('jmLfPanel');
    const b = document.getElementById('jmLfBtn'), r = b && b.getBoundingClientRect();
    if (r){ p.style.left = Math.max(8, Math.min(r.left, innerWidth - 470)) + 'px'; p.style.top = (r.bottom + 6) + 'px'; }
    this.fillPanel(p);
    p.querySelector('#jmLfQ').addEventListener('input', () => this.fillPanel(p));
    p.addEventListener('change', e => { const n = e.target.dataset.lfname; if (n == null) return; const h = this.hidden(); if (e.target.checked) h.delete(n); else h.add(n); this.saveHidden(h); });
    p.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const h = this.hidden();
      if (t.dataset.lfshowall) h.clear();
      else if (t.dataset.lfall) this.names(t.dataset.lfall).forEach(n => h.delete(n));
      else if (t.dataset.lfnone) this.names(t.dataset.lfnone).forEach(n => h.add(n));
      else if (t.dataset.lfonly){ e.preventDefault(); Object.keys(this.KNOWN).forEach(g => this.names(g).forEach(n => h.add(n))); h.delete(t.dataset.lfonly); }
      else return;
      this.saveHidden(h); this.fillPanel(p);
    });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#jmLfPanel, #jmLfBtn')){ document.getElementById('jmLfPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },

  install(){
    document.head.insertAdjacentHTML('beforeend', `<style>
      .jmLfPanel{ width:460px; max-width:calc(100vw - 16px); max-height:70vh; overflow:auto; }
      .jmLfTop{ display:flex; align-items:center; gap:8px; margin-bottom:6px; } .jmLfTop input{ flex:1; min-width:0; padding:4px 7px; background:transparent; color:var(--text); border:1px solid var(--border); border-radius:6px; font:inherit; }
      .jmLfGroup{ margin:8px 0; } .jmLfHead{ display:flex; align-items:center; gap:8px; margin-bottom:4px; } .jmLfHead span{ flex:1; color:var(--dim); font-size:11px; }
      .jmLfLink{ background:none; border:0; padding:0; color:var(--accent,#00e5ff); font:inherit; font-size:11px; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
      .jmLfGrid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:2px 8px; }
      .jmLfItem{ display:flex; align-items:center; gap:6px; padding:3px 4px; border-radius:5px; cursor:pointer; font-size:12px; }
      .jmLfItem:hover{ background:rgba(127,127,127,.1); } .jmLfItem span{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .jmLfItem small{ color:var(--dim); font-variant-numeric:tabular-nums; } .jmLfItem.zero span{ opacity:.6; }
      .jmLfOnly{ display:none; background:none; border:1px solid var(--border); border-radius:4px; color:var(--dim); font:inherit; font-size:10px; padding:0 4px; cursor:pointer; }
      .jmLfItem:hover .jmLfOnly, .jmLfOnly:focus-visible{ display:inline-block; }
    </style>`);
    const status = document.getElementById('chartLabelStatus') || document.getElementById('chartLabelMode');
    if (status && !document.getElementById('jmLfBtn')){
      status.insertAdjacentHTML('beforebegin', '<button type="button" id="jmLfBtn" class="bMini">⚑ Filter labels</button>');
      document.getElementById('jmLfBtn').addEventListener('click', () => this.panel());
    }
    this.syncBtn();
  },
};
JMLabelFilter.install();
