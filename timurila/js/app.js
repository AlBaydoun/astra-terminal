/* Timurila — the shell: rooms, the jump box, the bridge status. */
const App = {
  room: 'command', ROOMS: ['command', 'markets', 'lab', 'fleet', 'journal'],
  init(){
    Markets.init(); Shadow.init(); Fleet.init(); Command.init(); Lab.init(); Journal.init();
    window.addEventListener('hashchange', () => this.route()); this.route();
    T.on('health', () => { const el = document.getElementById('status'); el.className = 'status ' + (T.online ? 'on' : 'off'); el.querySelector('span').textContent = T.online ? 'MT5 linked' : 'MT5 bridge offline'; });
    /* jump box */
    const pal = document.getElementById('pal'), inp = pal.querySelector('input'), ul = pal.querySelector('ul'); let items = [], at = 0;
    const fill = () => { const q = inp.value.trim().toUpperCase();
      items = this.ROOMS.map(r => ({ label: r[0].toUpperCase() + r.slice(1), hint: 'room', go: () => { location.hash = '#' + r; } })).filter(x => !q || x.label.toUpperCase().includes(q))
        .concat(T.symbols.filter(s => !q || s.toUpperCase().includes(q)).slice(0, 40).map(s => ({ label: T.base(s), hint: T.groupName(T.groupOf(s)), go: () => { Markets.open(s); location.hash = '#markets'; } })));
      at = 0; ul.innerHTML = items.map((x, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span>${T.esc(x.label)}</span><small>${x.hint}</small></li>`).join('') || '<li><span>Nothing matches</span></li>'; };
    const open = () => { pal.classList.add('on'); inp.value = ''; fill(); inp.focus(); }, close = () => pal.classList.remove('on');
    const pick = i => { if (items[i]){ close(); items[i].go(); } };
    document.getElementById('jump').addEventListener('click', open);
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); open(); } else if (e.key === 'Escape') close(); });
    inp.addEventListener('input', fill);
    inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); at = Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
      ul.querySelectorAll('li').forEach((li, i) => { li.setAttribute('aria-selected', i === at); if (i === at) li.scrollIntoView({ block: 'nearest' }); }); } else if (e.key === 'Enter') pick(at); });
    ul.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
    pal.addEventListener('click', e => { if (e.target === pal) close(); });
    T.start();
  },
  route(){
    const [r, arg] = (location.hash || '#command').slice(1).split('/'); this.room = this.ROOMS.includes(r) ? r : 'command';
    document.querySelectorAll('.room').forEach(el => el.classList.toggle('on', el.id === 'room-' + this.room));
    document.querySelectorAll('.rail a[data-room]').forEach(a => { if (a.dataset.room === this.room) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    Markets.show(this.room === 'markets'); if (this.room === 'command') Command.show(); if (this.room === 'lab') Lab.show(arg); if (this.room === 'fleet') Fleet.show(); if (this.room === 'journal') Journal.show();
    document.title = 'Timurila · ' + this.room[0].toUpperCase() + this.room.slice(1);
  },
};
document.addEventListener('DOMContentLoaded', () => App.init());
