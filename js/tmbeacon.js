/* ASTRA / Timurila — beacons: the entry and the exit of a trade, drawn so the eye finds them at once.

   A beacon is a small set of DOM elements laid over a chart canvas: a glowing core, two light rings
   that pulse outwards, a faint beam of light through the candle, a glowing level line to the right
   edge, and a label. When the point is outside the visible part of the chart it becomes a glowing
   tab on that edge, pointing the way; a click on it brings the point back into view.

   Beacon.render(host, items, bounds)
     host    the element that holds the canvas (position: relative)
     items   [{ key, x, y, kind: 'entry'|'exit', color, tag, sub, dim, onClick }]
     bounds  { w, h }  the plot area, in CSS pixels from the host's top-left corner
   Elements are kept between calls (by key), so the animations run on without restarting. */
const Beacon = {
  render(host, items, bounds){
    if (!host) return; let layer = host.querySelector(':scope > .bcnLayer');
    if (!layer){ layer = document.createElement('div'); layer.className = 'bcnLayer'; host.appendChild(layer); host._bcn = {};
      layer.addEventListener('click', e => { const t = e.target.closest('[data-bk]'); if (!t) return; const f = host._bcn[t.dataset.bk]; if (f){ e.stopPropagation(); f(); } }); }
    layer.style.width = bounds.w + 'px'; layer.style.height = bounds.h + 'px'; layer.style.setProperty('--cw', Math.max(6, bounds.cw || 0) + 'px'); layer.classList.toggle('close', !!bounds.close);
    const keep = new Set();
    for (const it of items || []){ if (!isFinite(it.x) || !isFinite(it.y)) continue; keep.add(it.key);
      let el = layer.querySelector('[data-k="' + CSS.escape(it.key) + '"]');
      if (!el){ el = document.createElement('div'); el.dataset.k = it.key; el.innerHTML = '<i class="bcnBeam"></i><i class="bcnLevel"></i><i class="bcnRing"></i><i class="bcnRing r2"></i><b class="bcnCore" data-bk="' + it.key.replace(/"/g, '') + '"></b><span class="bcnTag" data-bk="' + it.key.replace(/"/g, '') + '"><b></b><small></small></span><span class="bcnEdge" data-bk="' + it.key.replace(/"/g, '') + '"></span>'; layer.appendChild(el); }
      host._bcn[it.key] = it.onClick || null;
      const off = it.x < 0 ? 'left' : it.x > bounds.w ? 'right' : '', y = Math.max(10, Math.min(bounds.h - 10, it.y)), x = off === 'left' ? 0 : off === 'right' ? bounds.w : it.x;
      el.className = 'bcn ' + (it.kind || 'entry') + (off ? ' off ' + off : '') + (it.dim ? ' dim' : '') + (it.mini ? ' mini' : '') + (it.noLevel ? ' nolevel' : '') + (it.y < 46 ? ' low' : '') + (it.flip || x > bounds.w - 150 ? ' flip' : '');
      el.style.setProperty('--c', it.color || '#4FD8F7'); el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      el.style.setProperty('--h', bounds.h + 'px'); el.style.setProperty('--y', y.toFixed(1) + 'px'); el.style.setProperty('--lw', Math.max(0, bounds.w - x).toFixed(1) + 'px');
      el.querySelector('.bcnCore').title = it.title || ((it.tag || '') + ' ' + (it.sub || '')).trim(); const tg = el.querySelector('.bcnTag'); tg.firstChild.textContent = it.tag || ''; tg.lastChild.textContent = it.sub || ''; tg.style.cursor = it.onClick ? 'pointer' : 'default';
      el.querySelector('.bcnEdge').textContent = (off === 'left' ? '◀ ' : '') + (it.kind === 'exit' ? 'EXIT' : 'ENTRY') + (off === 'right' ? ' ▶' : ''); }
    for (const el of [...layer.children]) if (!keep.has(el.dataset.k)){ el.remove(); delete host._bcn[el.dataset.k]; }
  },
  clear(host){ const l = host && host.querySelector(':scope > .bcnLayer'); if (l) l.innerHTML = ''; },
};
