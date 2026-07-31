/* ASTRA Terminal — personal trading notes (per coin or general, saved locally) */
const Notes = {
  list: lsGet('astra_usernotes', []),
  filter: 'all',

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
    shown.slice(0, 60).forEach(n => {
      const div = document.createElement('div');
      div.className = 'noteRow';
      div.innerHTML =
        `<div class="noteHead"><b>${esc(baseAsset(n.sym))}</b>` +
        (n.price != null ? `<span class="dim2">@ ${fmtPrice(n.price)}</span>` : '') +
        `<span class="dim2">${new Date(n.t).toLocaleString()}</span>` +
        `<button class="noteDel" title="Delete">×</button></div>` +
        `<div class="noteBody" contenteditable="true" spellcheck="false">${esc(n.text)}</div>`;
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
