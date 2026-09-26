/* ASTRA Terminal — your own notes on every bot.

   A "📝 My notes" strip under each bot's title. Type anything — the steps
   you took, why you blocked a market, what to check next week. It saves
   itself while you type (no button), is kept per bot, and travels with the
   rest of ASTRA's saved state (sync + backup) under astra_botnotes.

   The bot page is rebuilt every few seconds while bots run; the page skips
   that rebuild while your cursor is in the notes box, so nothing you type
   is ever lost or interrupted. Notes are yours only — no bot reads them. */
const BotNotes = {
  KEY: 'astra_botnotes',
  timers: {},
  all(){ const v = lsGet(this.KEY, {}); return v && typeof v === 'object' ? v : {}; },
  get(id){ return this.all()[id] || null; },
  put(id, text){
    const all = this.all();
    if (text.trim()) all[id] = { text, at: Date.now(), open: all[id] ? all[id].open !== false : true };
    else delete all[id];
    lsSet(this.KEY, all);
    return all[id] || null;
  },
  setOpen(id, open){ const all = this.all(); if (all[id]){ all[id].open = open; lsSet(this.KEY, all); } else this._open[id] = open; },
  _open: {},
  isOpen(id){ const n = this.get(id); return n ? n.open !== false : !!this._open[id]; },

  when(at){
    if (!at) return '';
    const d = new Date(at), today = new Date().toDateString() === d.toDateString();
    return (today ? 'today ' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ') + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },
  preview(text){ const first = (text || '').split('\n').find(l => l.trim()) || ''; return first.length > 90 ? first.slice(0, 90) + '…' : first; },

  view(id){
    const n = this.get(id), open = this.isOpen(id);
    return `<div class="bnWrap${open ? ' open' : ''}${n ? ' has' : ''}" data-bn="${esc(id)}">
      <button type="button" class="bnHead" data-bntoggle aria-expanded="${open}">
        <span class="bnIcon">📝</span><b>My notes</b>
        <span class="bnPrev">${n ? esc(this.preview(n.text)) : 'Write down your own steps and reminders for this bot — saved automatically'}</span>
        <small class="bnSaved">${n ? 'saved ' + esc(this.when(n.at)) : ''}</small><i>${open ? '▾' : '▸'}</i>
      </button>
      <div class="bnBody"${open ? '' : ' hidden'}>
        <textarea class="bnText" rows="4" spellcheck="true" placeholder="e.g. 26 Sep — blocked metals, it lost on silver twice. Check its crypto record again next Friday.">${n ? esc(n.text) : ''}</textarea>
        <div class="bnFoot"><span class="dim2">Saved automatically as you type · only you see this · no bot reads it</span>
          <button type="button" class="bMini" data-bnstamp title="Add today’s date on a new line">+ date</button></div>
      </div>
    </div>`;
  },

  bind(host, id){
    const w = host.querySelector('.bnWrap[data-bn="' + CSS.escape(id) + '"]'); if (!w) return;
    const ta = w.querySelector('.bnText'), saved = w.querySelector('.bnSaved'), prev = w.querySelector('.bnPrev');
    const save = () => {
      const n = this.put(id, ta.value);
      saved.textContent = n ? 'saved ' + this.when(n.at) : '';
      prev.textContent = n ? this.preview(n.text) : 'Write down your own steps and reminders for this bot — saved automatically';
      w.classList.toggle('has', !!n);
      if (typeof WorkspaceUI !== 'undefined' && WorkspaceUI.markNotes) WorkspaceUI.markNotes();
    };
    ta.addEventListener('input', () => { saved.textContent = 'saving…'; clearTimeout(this.timers[id]); this.timers[id] = setTimeout(save, 400); });
    ta.addEventListener('blur', () => { clearTimeout(this.timers[id]); save(); });
    w.querySelector('[data-bntoggle]').addEventListener('click', () => {
      const open = !w.classList.contains('open');
      w.classList.toggle('open', open); w.querySelector('.bnBody').hidden = !open;
      w.querySelector('.bnHead i').textContent = open ? '▾' : '▸';
      w.querySelector('.bnHead').setAttribute('aria-expanded', String(open));
      this.setOpen(id, open);
      if (open) ta.focus();
    });
    w.querySelector('[data-bnstamp]').addEventListener('click', () => {
      const d = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      ta.value = (ta.value && !ta.value.endsWith('\n') ? ta.value + '\n' : ta.value) + d + ' — ';
      ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; save();
    });
    /* the box grows with what is in it */
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(360, Math.max(84, ta.scrollHeight + 2)) + 'px'; };
    ta.addEventListener('input', fit); setTimeout(fit, 0);
  },

  /* true while you are typing in a notes box on this page — the page must not rebuild */
  typing(host){ const a = document.activeElement; return !!(a && a.classList && a.classList.contains('bnText') && host.contains(a)); },
};
