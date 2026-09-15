/* ASTRA Terminal — Trade Replay extras: any chart indicator on the replay,
   and a video of the playback saved to your PC.
   Bolted onto TradeReview without changing its own code: the indicator
   picker draws into the replay's chart, the recorder films the chart's
   canvases while it plays. Read-only. */
const ReplayExtras = {
  inds: [],            // indicator ids added to the replay
  series: {},          // 'id|key' -> series (price chart or pane)
  rec: null,

  init(){
    const T = TradeReview; if (!T || !T.host) return;
    const controls = T.host.querySelector('#trReload')?.parentElement; if (!controls) return;
    /* ---- indicator picker ---- */
    const opts = INDS.filter(d => !d.mainOnly && !/^(bot|sig)_/.test(d.id)).map(d => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join('');
    controls.insertAdjacentHTML('beforeend',
      `<label>Add indicator <select id="rxPick"><option value="">— choose —</option>${opts}</select></label><button id="rxAdd">+ Add</button>` +
      `<span id="rxList" class="rxList"></span>` +
      `<button id="rxRec" title="Record the playback as a video and save it to your PC">⏺ Record video</button>`);
    T.host.querySelector('#rxAdd').onclick = () => { const id = T.host.querySelector('#rxPick').value; if (id && !this.inds.includes(id)){ this.inds.push(id); this.renderList(); this.draw(); } };
    T.host.querySelector('#rxRec').onclick = () => this.rec ? this.stopRecording() : this.startRecording();
    /* redraw our lines whenever the replay redraws or rebuilds its chart */
    const draw = T.draw.bind(T); T.draw = () => { draw(); this.draw(); };
    const dispose = T.dispose.bind(T); T.dispose = () => { this.series = {}; this.paneChart = null; dispose(); };
    this.renderList();
  },
  renderList(){
    const el = TradeReview.host.querySelector('#rxList'); if (!el) return;
    el.innerHTML = this.inds.map(id => `<span class="rxChip">${esc((IND_BY_ID[id] || {}).label || id)}<button data-rxoff="${esc(id)}" title="Remove">×</button></span>`).join('');
    el.querySelectorAll('[data-rxoff]').forEach(b => b.onclick = () => { this.inds = this.inds.filter(x => x !== b.dataset.rxoff); this.clearSeries(b.dataset.rxoff); this.renderList(); this.draw(); });
  },
  clearSeries(id){
    for (const k of Object.keys(this.series)) if (k.startsWith(id + '|')){ try { this.series[k].chart.removeSeries(this.series[k].s); } catch(e){} delete this.series[k]; }
  },

  /* the same builders the main chart uses, fed the replay's visible candles */
  draw(){
    const T = TradeReview; if (!T.chart || !T.series || !T.bars || !T.bars.length) return;
    const v = T.bars.slice(0, T.index + 1).map(b => ({ ...b, rawTime: b.time }));
    const ctx = { v, closes: v.map(c => c.close), line: arr => { const out = []; for (let i = 0; i < arr.length; i++) if (arr[i] != null) out.push({ time: v[i].time, value: arr[i] }); return out; }, srcOf: cfg => IND.src(v, cfg.src || 'close') };
    const alive = new Set();
    for (const id of this.inds){
      const def = IND_BY_ID[id]; if (!def) continue;
      const cfg = Object.assign({}, def.def, (typeof Chart !== 'undefined' && Chart.settings[id]) || {});
      let specs; try { specs = def.build(ctx, cfg) || []; } catch(e){ continue; }
      const onPane = def.kind === 'osc' || def.kind === 'vol';
      const chart = onPane ? this.pane() : T.chart;
      if (!chart) continue;
      for (const spec of specs){
        if (!spec.data || !spec.data.length) continue;
        const key = id + '|' + spec.key; alive.add(key);
        const part = (def.parts || []).find(p => p.key === spec.key);
        const color = (cfg.colors || {})[spec.key] || spec.color || (part && part.color) || def.color || '#8fa3c8';
        let e = this.series[key];
        if (!e || e.chart !== chart){
          if (e) try { e.chart.removeSeries(e.s); } catch(err){}
          const s = spec.type === 'hist' ? chart.addHistogramSeries({ color, priceLineVisible: false, lastValueVisible: false, priceScaleId: onPane ? 'right' : 'rx_' + def.id })
            : chart.addLineSeries({ color, lineWidth: spec.width || 1, lineStyle: spec.lineStyle || 0, priceLineVisible: false, lastValueVisible: false, priceScaleId: onPane ? 'right' : (def.kind === 'price' ? 'right' : 'rx_' + def.id) });
          if (!onPane && def.kind !== 'price') try { chart.priceScale('rx_' + def.id).applyOptions({ scaleMargins: { top: 0.7, bottom: 0 }, visible: false }); } catch(err){}
          e = this.series[key] = { s, chart };
        }
        try { e.s.setData(spec.data); } catch(err){}
      }
    }
    for (const k of Object.keys(this.series)) if (!alive.has(k)){ try { this.series[k].chart.removeSeries(this.series[k].s); } catch(e){} delete this.series[k]; }
    /* a pane with nothing on it folds away */
    const paneEl = TradeReview.host.querySelector('#rxPane');
    if (paneEl) paneEl.hidden = !Object.keys(this.series).some(k => this.series[k].chart === this.paneChart);
  },
  pane(){
    const T = TradeReview;
    let el = T.host.querySelector('#rxPane');
    if (!el){ el = document.createElement('div'); el.id = 'rxPane'; el.className = 'trPane'; T.host.querySelector('#trRsi').after(el); }
    el.hidden = false;
    if (!this.paneChart){
      const stage = T.host.querySelector('#trChart');
      this.paneChart = LightweightCharts.createChart(el, { width: stage.clientWidth, height: 140, handleScroll: false, handleScale: false,
        layout: { background: { color: '#142139' }, textColor: '#c9d9ed' }, grid: { vertLines: { color: '#243650' }, horzLines: { color: '#243650' } },
        timeScale: { timeVisible: true }, rightPriceScale: { autoScale: true, minimumWidth: 96 } });
      T.chart.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && this.paneChart) try { this.paneChart.timeScale().setVisibleLogicalRange(r); } catch(e){} });
      new ResizeObserver(() => { if (this.paneChart) this.paneChart.applyOptions({ width: stage.clientWidth }); }).observe(stage);
    }
    return this.paneChart;
  },

  /* ---- video: film the chart canvases while the replay plays ---- */
  startRecording(){
    const T = TradeReview; if (!T.chart || !T.bars || !T.bars.length) return toast('Load a trade or chart first', 'warn');
    if (!window.MediaRecorder) return toast('Video recording is not available in this window', 'warn');
    const stage = T.host.querySelector('#trChart'), pane = T.host.querySelector('#rxPane'), rsi = T.host.querySelector('#trRsi');
    const canvases = () => [stage, rsi && !rsi.hidden ? rsi : null, pane && !pane.hidden ? pane : null].filter(Boolean)
      .map(host => ({ host, list: [...host.querySelectorAll('canvas')] }));
    const W = Math.max(320, stage.clientWidth), H = canvases().reduce((a, c) => a + c.host.clientHeight, 0) + 28;
    const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2;
    const ctx = out.getContext('2d'); ctx.scale(2, 2);
    const stream = out.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      cancelAnimationFrame(this.rec && this.rec.raf);
      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'astra-replay-' + (T.sym || 'chart').replace(/[^A-Za-z0-9]/g, '') + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.webm';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast('Video saved to your Downloads folder (' + Math.round(blob.size / 1024) + ' KB)', 'ok');
      this.rec = null; const b = T.host.querySelector('#rxRec'); if (b){ b.textContent = '⏺ Record video'; b.classList.remove('on'); }
    };
    const title = () => `${T.sym || ''} · ${T.host.querySelector('#trTf')?.value || ''} · ${T.host.querySelector('#trPosition')?.textContent || ''} · ASTRA`;
    const frame = () => {
      ctx.fillStyle = '#0b1324'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#c9d9ed'; ctx.font = '12px system-ui'; ctx.fillText(title(), 8, 18);
      let y = 28;
      for (const { host, list } of canvases()){
        for (const c of list){ try { ctx.drawImage(c, 0, y, host.clientWidth, host.clientHeight); } catch(e){} }
        y += host.clientHeight;
      }
      if (this.rec) this.rec.raf = requestAnimationFrame(frame);
    };
    this.rec = { rec, raf: 0 };
    rec.start(200); frame();
    const b = T.host.querySelector('#rxRec'); if (b){ b.textContent = '⏹ Stop & save'; b.classList.add('on'); }
    /* start the playback if it is not running; stop the film when it ends */
    if (!T.timer) T.play();
    const watch = setInterval(() => { if (!this.rec){ clearInterval(watch); return; } if (!T.timer && T.index >= T.bars.length - 1) { clearInterval(watch); this.stopRecording(); } }, 300);
    toast('Recording — the video stops with the playback, or press ⏹', 'info');
  },
  stopRecording(){ if (this.rec){ try { this.rec.rec.stop(); } catch(e){} } },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => ReplayExtras.init(), 10));
