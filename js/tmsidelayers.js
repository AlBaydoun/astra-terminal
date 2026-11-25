/* ASTRA · new look — Layers as a side-panel tab.
   The Layers panel (Scene, the Studio look and its layers, More overlays) can
   now sit in the side panel as its own tab, beside Watch, Signals and Trade.
   It is the same panel, moved: every switch, fold and dragged order is the
   one the floating panel has. Pressing the Layers button on the dock still
   opens it floating; while it floats, the tab offers to bring it back. */
const SideLayers = {
  ICON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 12 10 5 10-5"/><path d="m2 16 10 5 10-5"/></svg>',
  $(id){ return document.getElementById(id); },
  init(){
    if (this.$('tab-tslayers')) return true;
    const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'), bar = this.$('chartLabelBar');
    if (!st || !body || !bar) return false;
    this.home = bar.parentNode; this.next = bar.nextSibling;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'tslayers'; b.className = 'tsOnlyFace'; b.title = 'Layers: everything drawn on the chart';
    b.innerHTML = this.ICON + '<span>LAYERS</span>';
    const tabs = st.querySelectorAll('button[data-tab]'), last = tabs[tabs.length - 1];
    st.insertBefore(b, last ? last.nextSibling : null);
    b.addEventListener('click', () => {
      st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-tslayers'));
      try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){}
      this.sync();
    });
    const p = document.createElement('div'); p.id = 'tab-tslayers'; p.className = 'sidePanel tsOnlyFace';
    p.innerHTML = '<div class="slAway" id="slAway" hidden><b>Layers is open as the floating panel.</b><button type="button" data-sl="here">Bring it here</button></div><div id="slHost"></div>';
    body.appendChild(p);
    p.addEventListener('click', e => { if (e.target.closest('[data-sl="here"]')) this.here(); });
    st.addEventListener('click', () => setTimeout(() => this.sync(), 30));
    new MutationObserver(() => this.sync()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-face', 'data-tmlayers', 'data-tmroom', 'data-chartmax'] });
    const main = this.$('main'); if (main) new MutationObserver(() => this.sync()).observe(main, { attributes: true, attributeFilter: ['class'] });
    try { if (typeof TabOrder !== 'undefined' && TabOrder.apply) TabOrder.apply(); } catch(e){}
    this.sync(); return true;
  },
  active(){ const p = this.$('tab-tslayers'), m = this.$('main'), H = document.documentElement;
    return !!p && p.classList.contains('active') && H.dataset.face === 'tm' && !(m && (m.classList.contains('sideClosed') || m.classList.contains('sideMin'))); },
  /* the panel goes to the side while its tab is open and it is not floating; anywhere else it is back where Classic keeps it */
  sync(){
    const bar = this.$('chartLabelBar'), host = this.$('slHost'), H = document.documentElement; if (!bar || !host) return;
    const on = this.active(), floating = H.dataset.tmlayers === '1', want = on && !floating;
    if (want && bar.parentNode !== host){
      host.appendChild(bar);
      let y = 0; try { y = +localStorage.getItem('astra_layers_scroll') || 0; } catch(e){} setTimeout(() => { bar.scrollTop = y; }, 30);
    } else if (!want && bar.parentNode === host && this.home){
      this.home.insertBefore(bar, this.next && this.next.parentNode === this.home ? this.next : null);
    }
    H.classList.toggle('tsLayTab', want);
    const away = this.$('slAway'); if (away) away.hidden = !(on && floating);
  },
  /* close the floating panel and keep it here */
  here(){ const H = document.documentElement; H.dataset.tmlayers = ''; try { if (Face.bLayers) Face.bLayers.classList.remove('on'); } catch(e){} this.sync(); },
  /* open the Layers tab (a shortcut, or the floating panel's own way here) */
  show(){ const b = document.querySelector('#sideTabs button[data-tab="tslayers"]'); if (b) b.click(); },
};
(function start(n){ if (SideLayers.init() || n > 40) return; setTimeout(() => start(n + 1), 250); })(0);
