/* ASTRA Terminal — personal trading notes (per coin or general, saved locally) */
const Notes = {
  list: lsGet('astra_usernotes', []),
  filter: 'all',
  /* the order of the notes: your own (new ones on top), newest, oldest, by instrument; 📌 pinned always first */
  SORTS: [['list', 'Your order (new notes on top)'], ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['sym', 'By instrument']],
  sort(){ return (lsGet('astra_notescfg', {}) || {}).sort || 'list'; },
  setSort(v){ const c = lsGet('astra_notescfg', {}) || {}; c.sort = v; lsSet('astra_notescfg', c); this.render(); },
  ordered(shown){
    const s = this.sort(), L = shown.slice();
    if (s === 'newest') L.sort((a, b) => b.t - a.t); else if (s === 'oldest') L.sort((a, b) => a.t - b.t);
    else if (s === 'sym') L.sort((a, b) => baseAsset(a.sym).localeCompare(baseAsset(b.sym)) || b.t - a.t);
    return L.filter(n => n.pin).concat(L.filter(n => !n.pin));
  },
  /* moving a note rewrites YOUR order (the list itself) and switches to it */
  moveNote(id, target, after){
    const i = this.list.findIndex(n => n.id === id); if (i < 0) return;
    const [n] = this.list.splice(i, 1);
    let j = this.list.findIndex(x => x.id === target); if (j < 0) j = this.list.length;
    this.list.splice(after ? j + 1 : j, 0, n);
    if (this.sort() !== 'list'){ const c = lsGet('astra_notescfg', {}) || {}; c.sort = 'list'; lsSet('astra_notescfg', c); if (typeof SideLayout !== 'undefined' && SideLayout.setups.notes) SideLayout.view('notes'); }
    this.save();
  },

  init(){
    document.getElementById('noteAdd').addEventListener('click', () => this.add());
    const ta = document.getElementById('noteText');
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.add();
    });
    document.querySelectorAll('#noteFilter button').forEach(b =>
      b.addEventListener('click', () => {
        this.filter = b.dataset.f;
        document.querySelectorAll('#noteFilter button').forEach(x => x.classList.toggle('active', x === b));
        this.render();
      }));
    BUS.on('symbol', () => this.render());
    this.render();
  },

  add(){
    const ta = document.getElementById('noteText');
    const text = ta.value.trim();
    if (!text){ toast('Write something first', 'warn'); return; }
    const t = STORE.tickers.get(STORE.symbol);
    this.list.unshift({
      id: Date.now(), sym: STORE.symbol,
      price: t ? t.last : null, t: Date.now(), text,
    });
    ta.value = '';
    this.save();
    toast('Note saved', 'ok');
  },

  save(){
    if (this.list.length > 300) this.list.length = 300;
    lsSet('astra_usernotes', this.list);
    this.render();
  },

  render(){
    const host = document.getElementById('notesBody');
    if (!host) return;
    const shown = this.filter === 'sym' ? this.list.filter(n => n.sym === STORE.symbol) : this.list;
    const fb = document.querySelector('#noteFilter button[data-f="sym"]');
    if (fb) fb.textContent = baseAsset(STORE.symbol);
    host.innerHTML = shown.length ? '' : '<div class="empty">No notes' + (this.filter === 'sym' ? ' for this coin' : '') + ' yet.<br>Write your thoughts above —<br>they stay on this device.</div>';
    const list = this.ordered(shown).slice(0, 60), mine = this.sort() === 'list';
    list.forEach((n, idx) => {
      const div = document.createElement('div');
      div.className = 'noteRow' + (n.pin ? ' pinned' : '');
      div.innerHTML =
        `<div class="noteHead"><b>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(n.sym):esc(baseAsset(n.sym))}</b>` +
        (n.price != null ? `<span class="dim2">@ ${fmtPrice(n.price)}</span>` : '') +
        `<span class="dim2">${new Date(n.t).toLocaleString()}</span>` +
        `<button class="notePin${n.pin ? ' on' : ''}" title="${n.pin ? 'Unpin' : 'Pin to the top'}">📌</button>` +
        (mine ? `<span class="noteMv"><button data-nmv="-1" title="Move up"${idx === 0 ? ' disabled' : ''}>▲</button><button data-nmv="1" title="Move down"${idx === list.length - 1 ? ' disabled' : ''}>▼</button></span>` : '') +
        `<button class="noteDel" title="Delete">×</button></div>` +
        `<div class="noteBody" contenteditable="true" spellcheck="false">${esc(n.text)}</div>`;
      div.querySelector('.notePin').addEventListener('click', () => { n.pin = !n.pin; this.save(); });
      div.querySelectorAll('[data-nmv]').forEach(b => b.addEventListener('click', () => { const t = list[idx + +b.dataset.nmv]; if (t) this.moveNote(n.id, t.id, +b.dataset.nmv > 0); }));
      if (mine){
        const head = div.querySelector('.noteHead'); head.draggable = true;
        head.addEventListener('dragstart', e => { this._drag = n.id; div.classList.add('wDragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(n.id)); } catch(err){} });
        head.addEventListener('dragend', () => { this._drag = null; div.classList.remove('wDragging'); host.querySelectorAll('.wDropAbove,.wDropBelow').forEach(r => r.classList.remove('wDropAbove', 'wDropBelow')); });
        div.addEventListener('dragover', e => { if (this._drag == null || this._drag === n.id) return; e.preventDefault(); const r = div.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2; div.classList.toggle('wDropBelow', below); div.classList.toggle('wDropAbove', !below); });
        div.addEventListener('dragleave', () => div.classList.remove('wDropAbove', 'wDropBelow'));
        div.addEventListener('drop', e => { e.preventDefault(); const below = div.classList.contains('wDropBelow'); div.classList.remove('wDropAbove', 'wDropBelow'); if (this._drag != null && this._drag !== n.id) this.moveNote(this._drag, n.id, below); });
      }
      div.querySelector('.noteDel').addEventListener('click', () => {
        this.list = this.list.filter(x => x.id !== n.id);
        this.save();
      });
      const body = div.querySelector('.noteBody');
      body.addEventListener('blur', () => {
        const v = body.textContent.trim();
        if (v && v !== n.text){ n.text = v; lsSet('astra_usernotes', this.list); toast('Note updated', 'ok'); }
        else if (!v) body.textContent = n.text;
      });
      host.appendChild(div);
    });
  },
};
