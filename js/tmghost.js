/* ASTRA · new look — an ended trade, shown where it happened on the main chart.

   Press an ended trade in the Trade tab: the chart opens on its market and timeframe, moves to the candles of
   the trade, and draws it there:
     · the entry (where it opened), the exit (where it closed, and why), with their prices;
     · the target and the stop as lines over the life of the trade, each with its distance from the entry in
       percent;
     · the room between entry and target in green, between entry and stop in red;
     · a strip at the top with the result, a way into the Replay for the details, and ✕ to take it off.
   It is a drawing of the past on the live chart, not a replay: the candles are the chart's own. A trade older
   than the candles the chart holds cannot be drawn here; the strip says so and offers the Replay.

   It reads the trade and draws. It places nothing and changes nothing. */
'use strict';
const Ghost = window.Ghost = {
  t: null, n: 0,
  $(id){ return document.getElementById(id); },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, '').toUpperCase(); },
  px(v){ return typeof fmtPrice === 'function' ? fmtPrice(v) : String(v); },
  money(v){ if (!Number.isFinite(v)) return ''; const a = Math.abs(v); return (v > 0 ? '+' : v < 0 ? '−' : '') + (typeof fmtNum === 'function' ? fmtNum(a) : a.toFixed(2)); },
  pct(price, t){ const v = (price - t.entry) / t.entry * 100 * t.dir; return isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%' : ''; },
  /* a moment of the trade, as a place on the chart's time axis */
  logical(ms){ try { const sec = Math.floor(ms / 1000) + (typeof PosLines !== 'undefined' && PosLines.serverShift ? PosLines.serverShift() : 0) + (typeof TZ_OFF !== 'undefined' ? TZ_OFF : 0); return Draw.logicalFor(sec); } catch(e){ return null; } },
  show(t){ if (!t || !(t.entry > 0)) return; this.t = t; this.fit = true; this.old = false; const my = ++this.n;
    try { if (typeof Face !== 'undefined' && Face.room !== 'chart') Face.go('chart'); } catch(e){}
    const want = this.base(t.sym), go = () => { if (my !== this.n) return;
      try { if (this.base(STORE.symbol) !== want){ typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(t.sym) : App.setSymbol(t.sym); } } catch(e){}
      try { if (t.tf && STORE.tf !== t.tf && typeof App !== 'undefined' && App.setTf && typeof tfSeconds === 'function' && tfSeconds(t.tf)) setTimeout(() => { if (my === this.n && STORE.tf !== t.tf) App.setTf(t.tf); }, 500); } catch(e){} };
    go(); this.start(); this.paint(); },
  hide(){ this.t = null; this.n++; const l = this.$('ghLayer'); if (l){ l.innerHTML = ''; l._h = ''; } },
  start(){ if (this._tk) return; this._tk = setInterval(() => { try { this.paint(); } catch(e){} }, 80); },
  paint(){ const host = this.$('mainWrap'); if (!host) return; let layer = this.$('ghLayer'); const t = this.t; if (!t){ if (layer && layer._h){ layer._h = ''; layer.innerHTML = ''; } return; }
    if (!layer){ layer = document.createElement('div'); layer.id = 'ghLayer'; host.appendChild(layer); layer.addEventListener('click', e => { const b = e.target.closest('[data-gh]'); if (!b) return; e.stopPropagation(); if (b.dataset.gh === 'x'){ this.hide(); if (typeof TradePlus !== 'undefined'){ TradePlus.eOpen = ''; TradePlus._eSig = ''; try { TradePlus.paintEnded(true); } catch(x){} } }
        else if (b.dataset.gh === 'replay' && typeof Autopsy !== 'undefined' && typeof Face !== 'undefined'){ const id = t.id; Promise.resolve().then(() => Autopsy.collect()).catch(() => {}).then(() => { Autopsy.want = id; Face.go('autopsy'); }); }
        else if (b.dataset.gh === 'fit'){ this.fit = true; } }); }
    const E = s => this.esc(s), on = document.documentElement.dataset.face === 'tm' && document.documentElement.dataset.tmroom === 'chart', here = typeof STORE !== 'undefined' && this.base(STORE.symbol) === this.base(t.sym), raw = (typeof Chart !== 'undefined' && Chart.raw) || [];
    const side = t.dir > 0 ? 'BUY' : 'SELL', res = (t.pnl > 0 ? 'up' : t.pnl < 0 ? 'dn' : ''), name = typeof baseAsset === 'function' ? baseAsset(t.sym) : t.sym;
    const strip = msg => '<div class="ghStrip ' + res + '"><b>Ended trade</b><span>' + E(name) + ' · ' + side + (t.tf ? ' · ' + E(t.tf) : '') + (t.botName ? ' · ' + E(t.botName) : '') + '</span><em class="' + res + '">' + this.pct(t.exit, t) + ' · ' + E(this.money(t.pnl)) + '</em>' + (msg ? '<i>' + E(msg) + '</i>' : '') + '<button type="button" data-gh="fit" title="Bring the trade back into view">Find it</button><button type="button" data-gh="replay" title="Open this trade in the Replay: candle by candle, with everything known at the time">Replay ↗</button><button type="button" data-gh="x" title="Take it off the chart" aria-label="Take it off the chart">✕</button></div>';
    let html = '';
    if (!on) html = '';
    else if (!here || !raw.length || !Chart.priceSeries || !Chart.main) html = strip('opening its chart…');
    else { const lE = this.logical(t.t0), lX = this.logical(t.t1), ts = Chart.main.timeScale();
      if (lE == null || lX == null) html = strip('');
      else if (lX < 0){ html = strip('It is older than the ' + raw.length + ' candles on this chart. The Replay has it.'); }
      else { if (this.fit){ this.fit = false; try { const a = Math.max(0, lE), b = Math.max(lX, a + 2), pad = Math.max(18, (b - a) * 0.6); ts.setVisibleLogicalRange({ from: a - pad, to: b + pad }); } catch(e){} }
        let w = 0; try { w = ts.width(); } catch(e){} if (!(w > 0)){ try { w = ChartPlus.g().w; } catch(e){} } if (!(w > 0)) w = host.clientWidth - 62;   /* the plot's width, without the price scale */
        const X = l => ts.logicalToCoordinate(l), Y = p => Chart.priceSeries.priceToCoordinate(p), h = host.clientHeight; let xE = X(Math.max(0, lE)), xX = X(lX); const yE = Y(t.entry), yX = Y(t.exit);
        if (xE == null || xX == null || yE == null || yX == null){ html = strip('scroll the chart to its candles, or press Find it'); }
        else { xX = Math.max(xX, xE + 6); const L = Math.max(0, xE), R = Math.min(w, xX), vis = R > L, part = [];
          const band = (p, cls) => { if (!(p > 0) || !vis) return; const y = Y(p); if (y == null) return; const top = Math.min(y, yE), ht = Math.abs(y - yE); part.push('<div class="ghBand ' + cls + '" style="left:' + L.toFixed(1) + 'px;width:' + (R - L).toFixed(1) + 'px;top:' + top.toFixed(1) + 'px;height:' + ht.toFixed(1) + 'px"></div>'); };
          const line = (p, cls, label) => { if (!(p > 0)) return; const y = Y(p); if (y == null || y < -20 || y > h + 20) return; if (vis) part.push('<div class="ghLine ' + cls + '" style="left:' + L.toFixed(1) + 'px;width:' + (R - L).toFixed(1) + 'px;top:' + y.toFixed(1) + 'px"></div>'); const lx = Math.min(w - 8, Math.max(8, R + 8)); part.push('<div class="ghTag ' + cls + (lx > w - 190 ? ' left' : '') + '" style="left:' + (lx > w - 190 ? Math.max(8, L - 8) : lx).toFixed(1) + 'px;top:' + y.toFixed(1) + 'px">' + label + '</div>'); };
          band(t.tp, 'tp'); band(t.sl, 'sl');
          line(t.tp, 'tp', '<b>TARGET</b>' + E(this.px(t.tp)) + ' <em>' + this.pct(t.tp, t) + '</em>'); line(t.sl, 'sl', '<b>STOP</b>' + E(this.px(t.sl)) + ' <em>' + this.pct(t.sl, t) + '</em>'); line(t.entry, 'en', '<b>ENTRY · ' + side + '</b>' + E(this.px(t.entry)));
          /* the way it went: from the entry to the exit */
          if (xE > -40 && xE < w + 40) part.push('<div class="ghDot en" style="left:' + xE.toFixed(1) + 'px;top:' + yE.toFixed(1) + 'px" title="Entry"></div>');
          if (xX > -40 && xX < w + 40) part.push('<div class="ghDot ex ' + res + '" style="left:' + xX.toFixed(1) + 'px;top:' + yX.toFixed(1) + 'px"></div><div class="ghTag ex ' + res + (xX > w - 210 ? ' left' : '') + '" style="left:' + (xX > w - 210 ? xX - 12 : xX + 12).toFixed(1) + 'px;top:' + (yX + (t.exit >= t.entry ? -20 : 20)).toFixed(1) + 'px"><b>EXIT</b>' + E(this.px(t.exit)) + ' <em>' + this.pct(t.exit, t) + ' · ' + E(this.money(t.pnl)) + '</em>' + (t.reason ? ' <small>' + E(t.reason) + '</small>' : '') + '</div>');
          const dx = xX - xE, dy = yX - yE, len = Math.hypot(dx, dy); if (len > 4) part.push('<div class="ghPath ' + res + '" style="left:' + xE.toFixed(1) + 'px;top:' + yE.toFixed(1) + 'px;width:' + len.toFixed(1) + 'px;transform:rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)"></div>');
          html = '<div class="ghClip" style="width:' + Math.round(w) + 'px">' + part.join('') + '</div>' + strip(lE < 0 ? 'its entry is older than the first candle on this chart' : (!vis || xX < 0 || xE > w) ? 'it is outside the view: press Find it' : ''); } } }
    if (layer._h !== html){ layer._h = html; layer.innerHTML = html; } },
};
