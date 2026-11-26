/* ASTRA · new look — one toolbar for everything you do on the chart.

     HOME      Mark, Magic, My marks, the entry measure, the Studio look, the trade lines and Clean used to float
               over the top of the chart. They now live in the toolbar on the left with the drawing tools, at the
               top, in their own colour. The toolbar scrolls when it holds more than fits (mouse wheel).
     ONE PEN   "Draw on the chart" and Magic were two pens. Magic stays; the other button is gone. (Free drawing
               that stays on the chart is still the pencil among the drawing tools.)
     ORDER     press a tool, move it up or down, let go: it takes that place. The order is kept. A plain click
               still picks the tool.

   The buttons are the same elements with the same code as before; they are only shown in another place. */
'use strict';
const ToolDock = window.ToolDock = {
  KEY: 'astra_tools_order', GONE: ['tmPenBtn', 'tmPenCar'],
  $(id){ return document.getElementById(id); },
  keyOf(el){ return el.dataset.tdk || ''; },
  /* everything that has a place in the toolbar, in the order the page built it */
  items(){ const lt = this.$('lefttools'), bar = this.$('tmMarkBar'); if (!lt) return []; const out = []; let sep = 0;
    for (const el of lt.children){ if (el === bar){ for (const b of bar.children){ if (b.tagName !== 'BUTTON' || !b.id || this.GONE.includes(b.id) || b.id === 'tmMagicCar') continue; b.dataset.tdk = b.id; out.push(b); } continue; }
      if (el.classList.contains('tsep')){ el.dataset.tdk = el.dataset.tdk || 'sep' + (el.classList.contains('tdSep') ? 'M' : sep++); out.push(el); }
      else if (el.tagName === 'BUTTON' && (el.dataset.tool || el.id === 'toolClear')){ el.dataset.tdk = el.dataset.tool || el.id; out.push(el); } }
    return out; },
  saved(){ let s = []; try { s = JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; } catch(e){} return Array.isArray(s) ? s : []; },
  sorted(){ const it = this.items(), s = this.saved(), rank = (el, i) => { const k = s.indexOf(this.keyOf(el)); return k < 0 ? 10000 + i : k; }; return it.map((el, i) => ({ el, r: rank(el, i) })).sort((a, b) => a.r - b.r).map(o => o.el); },
  apply(){ const list = this.sorted(); list.forEach((el, k) => { el.style.order = String(10 + k * 2); }); const car = this.$('tmMagicCar'), mg = this.$('tmMagicBtn'); if (car && mg) car.style.order = String((+mg.style.order || 10) + 1); return list; },
  move(drag, target, after){ const list = this.sorted().filter(el => el !== drag); let k = list.indexOf(target); if (k < 0) return; if (after) k++; list.splice(k, 0, drag); try { localStorage.setItem(this.KEY, JSON.stringify(list.map(el => this.keyOf(el)))); } catch(e){} this.apply(); },
  /* put the chart's own bar into the toolbar (once), and make sure the pen that is going away is switched off */
  dock(){ const lt = this.$('lefttools'), bar = this.$('tmMarkBar'); if (!lt || !bar || !this.$('tmCleanBtn')) return false;
    if (bar.parentElement !== lt){ const first = lt.querySelector(':scope > button[data-tool]'); lt.insertBefore(bar, first); const sep = document.createElement('div'); sep.className = 'tsep tdSep'; lt.insertBefore(sep, first); }
    const pen = this.$('tmPenBtn'); if (pen && pen.classList.contains('on')){ try { pen.click(); } catch(e){} }
    this.apply(); return true; },
  drag(){ const lt = this.$('lefttools'); if (!lt || lt._tdOn) return; lt._tdOn = true; let st = null;
    const itemOf = el => { const t = el && el.closest ? el.closest('[data-tdk]') : null; return t && lt.contains(t) ? t : null; }, mark = (el, after) => { lt.querySelectorAll('.tdDrop, .tdDropA').forEach(x => x.classList.remove('tdDrop', 'tdDropA')); if (el) el.classList.add(after ? 'tdDropA' : 'tdDrop'); };
    lt.addEventListener('pointerdown', e => { if (e.button !== 0 || document.documentElement.dataset.face !== 'tm') return; const it = itemOf(e.target); if (!it || it.classList.contains('tsep')) return; st = { el: it, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, to: null, after: false }; });
    const move = e => { if (!st) return; if (!st.on){ if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 8) return; st.on = true; this._drag = true; st.el.classList.add('tdDrag'); lt.classList.add('tdDragging'); try { lt.setPointerCapture(st.pid); } catch(x){} }
      e.preventDefault(); const t = itemOf(document.elementFromPoint(e.clientX, e.clientY)); if (t && t !== st.el){ const r = t.getBoundingClientRect(); st.to = t; st.after = e.clientY > r.top + r.height / 2; mark(t, st.after); } else { st.to = null; mark(null); }
      const g = lt.getBoundingClientRect(); if (e.clientY < g.top + 30) lt.scrollTop -= 12; else if (e.clientY > g.bottom - 30) lt.scrollTop += 12; };
    const up = () => { if (!st) return; const d = st; st = null; mark(null); lt.classList.remove('tdDragging'); d.el.classList.remove('tdDrag'); if (!d.on) return; try { lt.releasePointerCapture(d.pid); } catch(x){} if (d.to) this.move(d.el, d.to, d.after); setTimeout(() => { this._drag = false; }, 250); };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    /* letting go of a dragged tool is not a press on it */
    lt.addEventListener('click', e => { if (this._drag){ e.stopPropagation(); e.preventDefault(); } }, true); },
  init(){ const ok = this.dock(); if (ok) this.drag(); return ok; },
};
(function start(n){ let ok = false; try { ok = ToolDock.init(); } catch(e){ console.warn('tool dock', e); } if (n < 60) setTimeout(() => start(n + 1), ok ? 3000 : 500); })(0);
