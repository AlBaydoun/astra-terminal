/* ASTRA Terminal — ⚙ arrange the Observer tab.

   Six sections live in four columns. Each section can be put in any column,
   moved up or down inside it, or hidden; a column left empty disappears and
   the others take the room. The sections are MOVED (never rebuilt), so every
   live update, the Scan button and the fund reset keep working.
   Stored under astra_obslayout: { col: {id: 0-3}, order: [ids], hidden: [ids] }. */
const ObsLayout = {
  KEY: 'astra_obslayout',
  SECS: [
    ['fund', 'Fund (play money) and its curve', 'obFund', 0], ['positions', 'Open positions', 'obPositions', 0],
    ['trades', 'Closed trades', 'obTrades', 1], ['strats', 'Strategy research', 'obStrats', 2],
    ['radar', 'Signal radar (Scan)', 'obRadar', 3], ['journal', 'Journal', 'obJournal', 3],
  ],
  WIDTHS: ['250px', '1.2fr', '1.3fr', '1fr'],
  open: false,
  cfg(){
    const c = lsGet(this.KEY, {}) || {}, ids = this.SECS.map(s => s[0]);
    const order = (c.order || []).filter(x => ids.includes(x)); for (const id of ids) if (!order.includes(id)) order.push(id);
    const col = {}; for (const [id, , , d] of this.SECS) col[id] = c.col && Number.isInteger(c.col[id]) ? c.col[id] : d;
    return { order, col, hidden: (c.hidden || []).filter(x => ids.includes(x)) };
  },
  save(c){ lsSet(this.KEY, c); this.apply(); this.view(); },

  /* once: every section gets a wrapper (its title + what follows it) */
  init(){
    const wrap = document.querySelector('#bot-observer .obWrap'); if (!wrap || wrap.querySelector('.obSec')) return;
    this.wrap = wrap; this.cols = [...wrap.querySelectorAll(':scope > .obCol')];
    for (const col of this.cols){
      let cur = null;
      for (const el of [...col.children]){
        if (el.classList.contains('obTitle')){ cur = document.createElement('div'); cur.className = 'obSec'; col.insertBefore(cur, el); }
        if (cur) cur.appendChild(el);
      }
    }
    for (const [id, , elId] of this.SECS){ const el = document.getElementById(elId); const sec = el && el.closest('.obSec'); if (sec) sec.dataset.obs = id; }
    const btn = document.createElement('button'); btn.className = 'bMini obArrangeBtn'; btn.textContent = '⚙ Arrange'; btn.title = 'Which column each section sits in, its order, hide sections';
    const box = document.createElement('div'); box.className = 'obArrangeBox'; box.hidden = true;
    wrap.parentElement.append(btn, box);
    btn.addEventListener('click', () => { this.open = !this.open; this.view(); });
    box.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.obscol) c.col[t.dataset.obscol] = +t.value;
      else if (t.dataset.obson) c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.obson) : c.hidden.concat([t.dataset.obson]);
      else return;
      this.save(c);
    });
    box.addEventListener('click', e => {
      const m = e.target.closest('[data-obsmv]');
      if (m){
        /* up / down among the sections of the SAME column */
        const c = this.cfg(), [id, d] = m.dataset.obsmv.split('|'), same = c.order.filter(x => c.col[x] === c.col[id]);
        const i = same.indexOf(id), j = i + +d; if (j < 0 || j >= same.length) return;
        const a = c.order.indexOf(id), b = c.order.indexOf(same[j]); c.order[a] = same[j]; c.order[b] = id; this.save(c); return;
      }
      if (e.target.closest('[data-obsreset]')){ lsSet(this.KEY, {}); this.apply(); this.view(); }
    });
    this.apply();
  },
  apply(){
    if (!this.wrap) return;
    const c = this.cfg();
    for (const id of c.order){
      const sec = this.wrap.querySelector('.obSec[data-obs="' + id + '"]'); if (!sec) continue;
      const col = this.cols[c.col[id]] || this.cols[0]; col.appendChild(sec); sec.hidden = c.hidden.includes(id);
    }
    /* a column with nothing visible disappears; the others share the width */
    const widths = [];
    this.cols.forEach((col, i) => { const any = [...col.querySelectorAll(':scope > .obSec')].some(s => !s.hidden); col.hidden = !any; if (any) widths.push(this.WIDTHS[i]); });
    this.wrap.style.gridTemplateColumns = widths.join(' ') || '1fr';
    try { if (typeof Brain !== 'undefined' && Brain.drawEquity) Brain.drawEquity(); } catch(e){}
  },
  view(){
    const box = document.querySelector('.obArrangeBox'), btn = document.querySelector('.obArrangeBtn'); if (!box) return;
    box.hidden = !this.open; btn.classList.toggle('on', this.open);
    if (!this.open){ box.innerHTML = ''; return; }
    const c = this.cfg();
    const rows = [0, 1, 2, 3].map(ci => c.order.filter(id => c.col[id] === ci)).map((ids, ci) => ids.length ? `<div class="obArrCol"><b>Column ${ci + 1}</b>${ids.map((id, i) => {
      const [, label] = this.SECS.find(s => s[0] === id);
      return `<div class="bkRow"><label><input type="checkbox" data-obson="${id}" ${c.hidden.includes(id) ? '' : 'checked'}> ${esc(label)}</label>
        <span><select data-obscol="${id}" title="Which column">${[0, 1, 2, 3].map(n => `<option value="${n}"${n === ci ? ' selected' : ''}>col ${n + 1}</option>`).join('')}</select>
        <button data-obsmv="${id}|-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-obsmv="${id}|1" ${i === ids.length - 1 ? 'disabled' : ''}>▼</button></span></div>`; }).join('')}</div>` : '').join('');
    box.innerHTML = rows + `<div class="obArrFoot"><small>A column left empty disappears and the others take the room.</small><button class="bMini" data-obsreset="1">↺ Reset</button></div>`;
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => ObsLayout.init(), 400));
