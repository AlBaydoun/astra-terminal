/* ASTRA Terminal — window buttons for the price chart and the split charts.
   Minimise folds a chart to its header; maximise gives it the whole grid;
   close (split charts only) hides that chart until the layout is chosen
   again. Nothing here touches indicators, symbols or trades. */
const ChartWindows = {
  state: lsGet('astra_gridwin', { mainMin: false, max: null, hidden: {}, min: {} }),
  save(){ lsSet('astra_gridwin', this.state); },

  ctl(withClose){
    return `<span class="paneCtl gridCtl">` +
      `<button data-gw="min" title="Minimise for now">_</button>` +
      `<button data-gw="max" title="Maximise">⛶</button>` +
      (withClose ? `<button data-gw="close" title="Close this split chart (the layout buttons bring it back)">×</button>` : '') +
      `</span>`;
  },

  /* ---- the price chart ---- */
  initMain(){
    const wrap = document.getElementById('mainWrap');
    if (!wrap || wrap.querySelector('.gridCtl')) return;
    wrap.insertAdjacentHTML('beforeend', this.ctl(false));
    wrap.querySelectorAll('[data-gw]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      this.action('main', b.dataset.gw);
    }));
    /* a minimised price chart restores when its strip is clicked */
    document.getElementById('chartArea').addEventListener('click', e => {
      if (this.state.mainMin && e.target.closest('#mainWrap') && !e.target.closest('.gridCtl')) this.action('main', 'restore');
    });
  },

  /* ---- one split chart ---- */
  initCell(cell){
    const head = cell.el.querySelector('.miniHead');
    if (!head || head.querySelector('.gridCtl')) return;
    head.insertAdjacentHTML('beforeend', this.ctl(true));
    head.querySelectorAll('[data-gw]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      this.action('cell' + cell.i, b.dataset.gw, cell);
    }));
    cell.el.addEventListener('click', e => {
      if (this.state.min['cell' + cell.i] && !e.target.closest('.gridCtl') && !e.target.closest('.miniHead')) this.action('cell' + cell.i, 'restore', cell);
    });
  },

  action(who, what, cell){
    const S = this.state;
    if (what === 'close' && cell){
      S.hidden[who] = true; delete S.min[who]; if (S.max === who) S.max = null;
      this.save(); this.apply();
      toast('Split chart closed — press the layout button again to bring it back', 'info');
      return;
    }
    if (what === 'restore'){ if (who === 'main') S.mainMin = false; else delete S.min[who]; }
    else if (what === 'min'){
      if (who === 'main') S.mainMin = !S.mainMin; else if (S.min[who]) delete S.min[who]; else S.min[who] = true;
      if (S.max === who) S.max = null;
    } else if (what === 'max'){
      if (who === 'main' && (typeof Multi === 'undefined' || Multi.layout <= 1)){
        /* alone on the grid: maximise means the whole screen, as the M key does */
        if (typeof App !== 'undefined' && App.setMax) App.setMax(document.documentElement.dataset.chartmax !== '1');
        return;
      }
      S.max = S.max === who ? null : who;
      if (who === 'main') S.mainMin = false; else delete S.min[who];
    }
    this.save(); this.apply();
  },

  apply(){
    const S = this.state, grid = document.getElementById('chartGrid'), area = document.getElementById('chartArea');
    if (!grid || !area) return;
    area.classList.toggle('mainMin', !!S.mainMin);
    const mainBtn = area.querySelector('#mainWrap [data-gw="min"]');
    if (mainBtn){ mainBtn.textContent = S.mainMin ? '▢' : '_'; mainBtn.title = S.mainMin ? 'Restore the price chart' : 'Minimise the price chart for now'; }
    const maxBtn = area.querySelector('#mainWrap [data-gw="max"]');
    if (maxBtn) maxBtn.classList.toggle('on', S.max === 'main');
    area.classList.toggle('gridMax', S.max === 'main');
    if (typeof Multi !== 'undefined'){
      for (const c of Multi.cells){
        const key = 'cell' + c.i;
        c.el.classList.toggle('miniHidden', !!S.hidden[key]);
        c.el.classList.toggle('miniMin', !!S.min[key]);
        c.el.classList.toggle('gridMax', S.max === key);
        const mb = c.el.querySelector('[data-gw="min"]');
        if (mb){ mb.textContent = S.min[key] ? '▢' : '_'; }
        const xb = c.el.querySelector('[data-gw="max"]');
        if (xb) xb.classList.toggle('on', S.max === key);
      }
      /* a maximised chart that is no longer on the grid must not blank it */
      if (S.max && S.max !== 'main' && !Multi.cells.some(c => 'cell' + c.i === S.max)){ S.max = null; this.save(); }
    }
    grid.classList.toggle('cellMax', !!S.max);
    setTimeout(() => {
      try { Chart.main.applyOptions({}); } catch(e){}
      if (typeof Draw !== 'undefined'){ try { Draw.resize(); Draw.redraw(); } catch(e){} }
      window.dispatchEvent(new Event('resize'));
    }, 60);
  },

  /* choosing a layout again brings closed charts back */
  onLayout(){
    this.state.hidden = {}; this.state.min = {};
    if (this.state.max !== 'main') this.state.max = null;
    this.save();
    if (typeof Multi !== 'undefined') for (const c of Multi.cells) this.initCell(c);
    this.apply();
  },
};

/* =================== the right-hand side panel (watchlist, depth, alerts…) =================== */
const SideWindow = {
  state: lsGet('astra_sidewin', { min: false, max: false, closed: false, width: 300 }),
  save(){ lsSet('astra_sidewin', this.state); },
  init(){
    const tabs = document.getElementById('sideTabs');
    if (!tabs || tabs.querySelector('.sideCtl')) return;
    tabs.insertAdjacentHTML('beforeend', `<span class="paneCtl sideCtl">` +
      `<button data-sw="min" title="Minimise the side panel">_</button>` +
      `<button data-sw="max" title="Maximise the side panel">⛶</button>` +
      `<button data-sw="close" title="Close the side panel (the Watchlist button on the chart brings it back)">×</button></span>`);
    /* the left edge drags to resize */
    const sb0 = document.getElementById('sidebar');
    sb0.insertAdjacentHTML('afterbegin', `<div class="sideGrip" title="Drag to resize the side panel"></div>`);
    sb0.querySelector('.sideGrip').addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX, startW = sb0.getBoundingClientRect().width;
      document.body.classList.add('resizing');
      const move = ev => { const w = Math.max(200, Math.min(window.innerWidth * 0.6, startW - (ev.clientX - startX))); this.state.width = Math.round(w); this.applyWidth(); };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); this.save(); window.dispatchEvent(new Event('resize')); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    tabs.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault(); this.action(b.dataset.sw);
    }));
    const sb = document.getElementById('sidebar');
    sb.insertAdjacentHTML('afterbegin', `<button class="sideStrip" title="Restore the side panel"><span>WATCHLIST · DEPTH · ALERTS · PAPER · AI · NOTES</span><b>▢</b></button>`);
    sb.querySelector('.sideStrip').addEventListener('click', () => this.action('restore'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.state.max) this.action('max'); });
    this.apply();
  },
  action(what){
    const S = this.state;
    if (what === 'restore'){ S.min = false; S.closed = false; }
    else if (what === 'min'){ S.min = !S.min; S.max = false; S.closed = false; }
    else if (what === 'max'){ S.max = !S.max; S.min = false; S.closed = false; }
    else if (what === 'close'){ S.closed = true; S.min = false; S.max = false; toast('Side panel closed — the “Watchlist” button above the chart brings it back', 'info'); }
    this.save(); this.apply();
  },
  applyWidth(){
    const main = document.getElementById('main');
    if (main) main.style.setProperty('--sideW', (this.state.width || 300) + 'px');
  },
  apply(){
    const S = this.state, main = document.getElementById('main'), sb = document.getElementById('sidebar');
    if (!main || !sb) return;
    this.applyWidth();
    main.classList.toggle('sideClosed', !!S.closed);
    const cb = document.getElementById('sideFromChart');
    if (cb) cb.textContent = S.closed ? 'Watchlist ◂ open' : S.min ? 'Watchlist ◂' : 'Watchlist ▸';
    main.classList.toggle('sideMin', !!S.min);
    sb.classList.toggle('sideMax', !!S.max);
    const mb = sb.querySelector('[data-sw="min"]'); if (mb){ mb.textContent = S.min ? '▢' : '_'; }
    const xb = sb.querySelector('[data-sw="max"]'); if (xb){ xb.classList.toggle('on', !!S.max); xb.title = S.max ? 'Back to the normal size' : 'Maximise the side panel'; }
    setTimeout(() => { try { Chart.main.applyOptions({}); } catch(e){} if (typeof Draw !== 'undefined'){ try { Draw.resize(); Draw.redraw(); } catch(e){} } window.dispatchEvent(new Event('resize')); }, 60);
  },
};

/* =================== the drawing tools bar on the left =================== */
const ToolsBar = {
  state: lsGet('astra_toolswin', { min: false, wide: false, width: 0 }),
  save(){ lsSet('astra_toolswin', this.state); },
  init(){
    const bar = document.getElementById('lefttools');
    if (!bar || bar.querySelector('.toolsCtl')) return;
    bar.insertAdjacentHTML('afterbegin', `<span class="toolsCtl">` +
      `<button data-tw="min" title="Fold the tools bar away">_</button>` +
      `<button data-tw="wide" title="Show the tool names">⛶</button></span>`);
    bar.querySelectorAll('[data-tw]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault(); this.action(b.dataset.tw);
    }));
    /* the names come from each button's own tooltip, so they are always right */
    bar.querySelectorAll('button[data-tool], button[id]').forEach(b => {
      if (b.closest('.toolsCtl') || b.querySelector('.toolName') || !b.title) return;
      b.insertAdjacentHTML('beforeend', `<span class="toolName">${esc(b.title.replace(/\s*\(.*\)\s*$/, ''))}</span>`);
    });
    bar.insertAdjacentHTML('afterbegin', `<button class="toolsStrip" title="Show the tools bar">▸</button>`);
    bar.querySelector('.toolsStrip').addEventListener('click', () => this.action('restore'));
    /* the right edge drags to resize; past 90 px the names appear by themselves */
    bar.insertAdjacentHTML('beforeend', `<div class="toolsGrip" title="Drag to resize the tools bar"></div>`);
    bar.querySelector('.toolsGrip').addEventListener('mousedown', e => {
      e.preventDefault();
      const startX = e.clientX, startW = bar.getBoundingClientRect().width;
      document.body.classList.add('resizing');
      const move = ev => {
        const w = Math.max(36, Math.min(260, startW + (ev.clientX - startX)));
        this.state.width = Math.round(w); this.state.wide = w >= 90; this.state.min = false;
        this.apply(true);
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); this.save(); window.dispatchEvent(new Event('resize')); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    this.apply();
  },
  action(what){
    const S = this.state;
    if (what === 'restore') S.min = false;
    else if (what === 'min'){ S.min = !S.min; }
    else if (what === 'wide'){ S.wide = !S.wide; S.min = false; S.width = S.wide ? Math.max(S.width || 0, 150) : 44; }
    this.save(); this.apply();
  },
  apply(quiet){
    const S = this.state, main = document.getElementById('main'), bar = document.getElementById('lefttools');
    if (!main || !bar) return;
    main.classList.toggle('toolsMin', !!S.min);
    main.classList.toggle('toolsWide', !!S.wide && !S.min);
    const w = S.width || (S.wide ? 150 : 44);
    main.style.setProperty('--toolsW', w + 'px');
    if (quiet) return;
    const wb = bar.querySelector('[data-tw="wide"]'); if (wb){ wb.classList.toggle('on', !!S.wide); wb.title = S.wide ? 'Icons only' : 'Show the tool names'; }
    setTimeout(() => { try { Chart.main.applyOptions({}); } catch(e){} if (typeof Draw !== 'undefined'){ try { Draw.resize(); Draw.redraw(); } catch(e){} } window.dispatchEvent(new Event('resize')); }, 60);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  ChartWindows.initMain();
  ChartWindows.apply();
  SideWindow.init();
  ToolsBar.init();
  /* the chart's own switches for the two side areas */
  const bar = document.getElementById('chartLabelBar');
  if (bar && !document.getElementById('sideFromChart')){
    const tools = bar.querySelector('.chartTools');
    (tools || bar).insertAdjacentHTML('beforeend',
      `<button id="toolsFromChart" class="bMini" title="Fold / show the drawing tools bar on the left">◂ Tools</button>` +
      `<button id="sideFromChart" class="bMini" title="Minimise / restore the side panel on the right">Watchlist ▸</button>` +
      `<button id="sideMaxFromChart" class="bMini" title="Maximise the side panel over the screen">⛶ Watchlist</button>`);
    document.getElementById('toolsFromChart').addEventListener('click', () => ToolsBar.action(ToolsBar.state.min ? 'restore' : 'min'));
    document.getElementById('sideFromChart').addEventListener('click', () => SideWindow.action(SideWindow.state.min || SideWindow.state.closed ? 'restore' : 'min'));
    SideWindow.apply();
    document.getElementById('sideMaxFromChart').addEventListener('click', () => SideWindow.action('max'));
  }
});
