/* ASTRA Terminal — ⚙ arrange a side panel (the AI / Observer panel).

   The panel is built once in index.html; its blocks are gathered into named
   wrappers and then only MOVED and hidden — every id, button and live update
   inside them keeps working. A block marked "always" can move but never hide. */
const SideLayout = {
  setups: {},
  setup(o){
    const panel = document.getElementById(o.panelId); if (!panel || panel.querySelector('.slPart')) return;
    this.setups[o.key] = o;
    const box = document.createElement('div'); box.className = 'slBox'; box.hidden = true;
    o.head.after(box);
    for (const [id, p] of Object.entries(o.parts)){
      const w = document.createElement('div'); w.className = 'slPart'; w.dataset.sl = id;
      for (const el of p.els) if (el) w.appendChild(el);
      panel.appendChild(w);
    }
    const btn = document.createElement('button'); btn.className = 'slBtn'; btn.title = 'Arrange this panel'; btn.textContent = '⚙';
    o.head.appendChild(btn);
    btn.addEventListener('click', () => { o.open = !o.open; this.view(o.key); });
    box.addEventListener('click', e => { const m = e.target.closest('[data-slmv]'); if (!m) return; const c = this.cfg(o.key), [k, d] = m.dataset.slmv.split('|'), i = c.order.indexOf(k), j = i + +d; if (i < 0 || j < 0 || j >= c.order.length) return; c.order.splice(i, 1); c.order.splice(j, 0, k); this.save(o.key, c); });
    box.addEventListener('change', e => { const t = e.target; if (!t.dataset.slon) return; const c = this.cfg(o.key); c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.slon) : c.hidden.concat([t.dataset.slon]); this.save(o.key, c); });
    this.apply(o.key);
  },
  cfg(key){
    const o = this.setups[key], c = lsGet(o.store, {}) || {}, ids = Object.keys(o.parts);
    const order = (c.order || []).filter(x => ids.includes(x)); for (const id of ids) if (!order.includes(id)) order.push(id);
    return { order, hidden: (c.hidden || []).filter(x => ids.includes(x) && !o.parts[x].always) };
  },
  save(key, c){ lsSet(this.setups[key].store, c); this.apply(key); this.view(key); },
  apply(key){
    const o = this.setups[key], panel = document.getElementById(o.panelId), c = this.cfg(key);
    for (const k of c.order){ const el = panel.querySelector(':scope > .slPart[data-sl="' + k + '"]'); if (el){ panel.appendChild(el); el.hidden = c.hidden.includes(k); } }
  },
  view(key){
    const o = this.setups[key], panel = document.getElementById(o.panelId), box = panel.querySelector('.slBox'), btn = o.head.querySelector('.slBtn');
    box.hidden = !o.open; btn.classList.toggle('on', !!o.open);
    if (!o.open){ box.innerHTML = ''; return; }
    const c = this.cfg(key), n = c.order.length;
    box.innerHTML = `<div class="bkRows">${c.order.map((k, i) => { const p = o.parts[k];
      return `<div class="bkRow"><label${p.always ? ' title="Always shown"' : ''}><input type="checkbox" data-slon="${k}" ${c.hidden.includes(k) ? '' : 'checked'}${p.always ? ' disabled' : ''}> ${esc(p.label)}${p.always ? ' <small>· always</small>' : ''}</label>
        <span><button data-slmv="${k}|-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-slmv="${k}|1" ${i === n - 1 ? 'disabled' : ''}>▼</button></span></div>`; }).join('')}</div>
      ${o.extra ? o.extra.html() : ''}
      <button class="bMini" data-slreset="1">↺ Reset</button>`;
    if (o.extra && o.extra.bind) o.extra.bind(box);
    box.querySelector('[data-slreset]').onclick = () => { lsSet(o.store, {}); if (o.extra && o.extra.reset) o.extra.reset(); this.apply(key); this.view(key); };
  },
};

/* the AI (Observer) panel */
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  const panel = document.getElementById('tab-ai'); if (!panel) return;
  const titles = [...panel.querySelectorAll(':scope > .secTitle')];
  SideLayout.setup({
    key: 'ai', panelId: 'tab-ai', store: 'astra_aicfg', head: panel.querySelector(':scope > .sideHead'),
    parts: {
      verdict:    { label: 'The verdict (what it thinks now)',          els: [document.getElementById('aiVerdict')] },
      chat:       { label: 'Chat with the Observer',                    els: [document.getElementById('obChatBox')] },
      auto:       { label: 'Let it paper-trade its signals',            els: [panel.querySelector(':scope > .aiAutoRow')] },
      record:     { label: 'Track record',                              els: [titles[0], document.getElementById('aiNotes')] },
      trust:      { label: 'Strategy trust',                            els: [titles[1], document.getElementById('aiLeader')] },
      learned:    { label: 'What it learned',                           els: [titles[2], document.getElementById('aiLog')] },
      reset:      { label: 'Reset the Observer button',                 els: [document.getElementById('aiReset')] },
      disclaimer: { label: 'Note: experimental, not financial advice',  els: [panel.querySelector(':scope > .aiDisclaimer')], always: true },
    },
  });
}, 300));

/* the Notes panel: write box and notes in either order; the notes' own order lives in Notes */
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  const panel = document.getElementById('tab-notes'); if (!panel || typeof Notes === 'undefined') return;
  let head = panel.querySelector(':scope > .sideHead');
  if (!head){ head = document.createElement('div'); head.className = 'sideHead'; head.innerHTML = '<span>NOTES</span>'; panel.prepend(head); }
  SideLayout.setup({
    key: 'notes', panelId: 'tab-notes', store: 'astra_notescfg', head,
    parts: {
      compose: { label: 'Write a note (box, filter, Save)', els: [panel.querySelector(':scope > .noteCompose')] },
      list:    { label: 'Your notes',                        els: [document.getElementById('notesBody')] },
    },
    extra: {
      html: () => `<label>Notes order <select data-notesort="1">${Notes.SORTS.map(([v, t]) => `<option value="${v}"${v === Notes.sort() ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <small style="flex-basis:100%">📌 pinned notes always stay on top. In “Your order”, drag a note or use its ▲▼.</small>`,
      bind: box => { const s = box.querySelector('[data-notesort]'); if (s) s.onchange = () => { Notes.setSort(s.value); }; },
      reset: () => Notes.setSort('list'),
    },
  });
}, 300));
