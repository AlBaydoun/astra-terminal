/* ASTRA · new look — a key for any place.
   Every room, side-panel tab, lower-panel tab, chart tool, layer, bot page and
   drawing tool can have a key, and any key can be changed or removed in one
   list (F1, Alt+K, Settings → Shortcuts, or Ctrl+K → "Shortcuts"). Classic's
   own keys (F1 to F10…) are in the same list and change there too.
   Stored under astra_keys_face (Classic's stay under astra_keys).
   These keys work in this look; Classic's keep working in both, and when the
   two would share a key, the one just set takes it and the other is cleared.
   Every action is a press that opens or shows something: no key sends, closes
   or changes an order. */
const TmKeys = {
  KEY: 'astra_keys_face',
  /* the keys it comes with: Alt + a number for the rooms, Alt + a letter for the side tabs and the chart tools */
  DEF: {
    'room:chart': 'Alt+1', 'room:live': 'Alt+2', 'room:deep': 'Alt+3', 'room:livedive': 'Alt+4', 'room:dash': 'Alt+5',
    'room:autopsy': 'Alt+6', 'room:inspect': 'Alt+7', 'room:markets': 'Alt+8', 'room:settings': 'Alt+9',
    'side:tssig': 'Alt+S', 'side:tstrade': 'Alt+T', 'side:tslayers': 'Alt+L', 'side:watch': 'Alt+Q', 'side:ai': 'Alt+A',
    'panel:observer': 'Alt+O',
    'bar:tmPenBtn': 'Alt+P', 'bar:tmEntryBtn': 'Alt+X', 'bar:tmCleanBtn': 'Alt+C', 'bar:tmLinesBtn': 'Alt+G',
    'tool:max': 'Alt+M', 'tool:keys': 'Alt+K',
  },
  FIXED: [['Ctrl+K', 'Find anything'], ['F12', 'This look / Classic'], ['Esc', 'Close a pop-over, leave a mode']],
  /* keys that already do something nobody should lose */
  BLOCK: {
    'Ctrl+W': 'it closes the window', 'Ctrl+R': 'it reloads the app', 'F5': 'it reloads the app', 'Ctrl+Shift+R': 'it reloads the app',
    'F11': 'it is full screen', 'F12': 'it switches the look', 'Ctrl+K': 'it is Find anything', 'Ctrl+Q': 'it quits the app',
    'Ctrl+C': 'it copies', 'Ctrl+V': 'it pastes', 'Ctrl+X': 'it cuts', 'Ctrl+A': 'it selects all', 'Ctrl+Z': 'it undoes', 'Ctrl+Y': 'it redoes',
    'Ctrl+Shift+I': 'it opens the developer tools', 'Ctrl+Shift+M': 'it moves the window to the next monitor',
    'Ctrl+=': 'it zooms', 'Ctrl+-': 'it zooms', 'Ctrl+0': 'it resets the zoom', 'Alt+F4': 'it closes the window',
    'Ctrl+T': 'it opens a browser tab', 'Ctrl+N': 'it opens a browser window', 'Ctrl+L': 'it is the address bar', 'Ctrl+F': 'it finds in the page',
    'Ctrl+P': 'it prints', 'Ctrl+S': 'it saves the page', 'Tab': 'it moves between controls', 'Shift+Tab': 'it moves between controls',
    'Enter': 'it presses the button in focus', 'Escape': 'it closes things', 'Space': 'it presses the button in focus',
  },
  LABEL: { tmPenBtn: 'Pen: draw on the chart', tmEntryBtn: 'From entry: what a trade from a candle would have done', tmStudioBtn: 'Studio view of this chart',
    tmLinesBtn: 'Trade lines: hide / show', tmCleanBtn: 'Clean: only the candles', tmMarkBtn: 'Put a mark', tmMagicBtn: 'Magic pen', tmMarkList: 'My marks' },
  map: null, capture: null, grp: 'all', _cat: null, _catT: 0,

  $(id){ return document.getElementById(id); },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  faceOn(){ return document.documentElement.dataset.face === 'tm'; },
  classic(){ if (typeof Shortcuts === 'undefined') return null; try { Shortcuts.load(); } catch(e){ return null; } return Shortcuts; },
  load(){ if (!this.map){ let s = {}; try { s = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch(e){} this.map = Object.assign({}, this.DEF, s); } return this.map; },
  save(){ const out = {}; for (const [id, k] of Object.entries(this.map || {})) if (k !== (this.DEF[id] || '')) out[id] = k; try { localStorage.setItem(this.KEY, JSON.stringify(out)); } catch(e){} },
  /* the keys by where they are on the keyboard, so a letter is the same letter in any keyboard language */
  combo(e){ const c = e.code || '';
    let k = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^Numpad\d$/.test(c) ? 'Num' + c.slice(6) : (e.key && e.key.length === 1 ? e.key.toUpperCase() : e.key);
    if (k === ' ') k = 'Space';
    return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + k; },

  /* ---------- everything a key can reach ---------- */
  catalog(){
    const now = Date.now(); if (this._cat && now - this._catT < 4000) return this._cat;
    const out = [], seen = new Set(), F = typeof Face !== 'undefined' ? Face : null, txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const add = (id, group, label, run, hint) => { if (!label || seen.has(id)) return; seen.add(id); out.push({ id, group, label, run, hint: hint || '' }); };
    add('tool:keys', 'General', 'This list of shortcuts', () => this.open());
    add('tool:find', 'General', 'Find anything (also Ctrl+K)', () => { if (F) F.palette(true); });
    if (F) for (const r of F.ROOMS) if (!r.sep && r.dock !== false) add('room:' + r.id, 'Rooms', r.label, () => F.go(r.id), r.tip);
    document.querySelectorAll('#sideTabs button[data-tab]').forEach(b => { const t = b.dataset.tab, full = (F && F.SIDE && F.SIDE[t]) || b.title || txt(b);
      add('side:' + t, 'Side panel', full.split(':')[0].split('—')[0].trim() || txt(b), () => this.side(t), full); });
    document.querySelectorAll('#botTabs [data-tab]').forEach(b => { const n = b.firstChild && b.firstChild.nodeType === 3 ? b.firstChild.textContent : txt(b);
      add('panel:' + b.dataset.tab, 'Lower panel', n.replace(/^◉\s*/, '').replace(/\s+\d+\s*$/, '').trim().toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/&amp;/g, '&'), () => { if (F) F.panel(b.dataset.tab); }, b.title); });
    document.querySelectorAll('#tmMarkBar > button[id]').forEach(b => { if (/Car$/.test(b.id) || b.id === 'tmPenBtn') return;
      add('bar:' + b.id, 'Chart tools', this.LABEL[b.id] || (b.title || txt(b)).split(':')[0].trim(), () => this.chart(() => { const x = this.$(b.id); if (x) x.click(); }), b.title); });
    add('tool:layers', 'Chart tools', 'Layers, floating', () => this.chart(() => { if (F && F.bLayers) F.bLayers.click(); }));
    add('tool:candles', 'Chart tools', 'Candle shape and colours', () => this.chart(() => { if (F && F.bCandles) F.bCandles.click(); }));
    add('tool:max', 'Chart tools', 'Full-screen chart / back', () => this.chart(() => { const x = this.$('tmExpand'); if (x) x.click(); }));
    for (const [s, n] of [['clean', 'Clean'], ['studio', 'Studio'], ['structure', 'Structure'], ['all', 'Everything']])
      add('scene:' + s, 'Layers', 'Scene: ' + n, () => this.chart(() => { const x = document.querySelector('#tmLayersHead [data-scene="' + s + '"]'); if (x) x.click(); }));
    add('layer:studiolook', 'Layers', 'Studio look on / off', () => this.chart(() => { try { Studio.overlay.toggle(); if (F) F.layersSync(); } catch(e){} }));
    document.querySelectorAll('#chartLabelBar .chartTools .autoSrBtn').forEach(b => { const n = txt(b).replace(/^[✦★⚡]\s*/, ''), id = b.id || n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      add('layer:' + id, 'Layers', n, () => this.chart(() => { const x = b.id ? this.$(b.id) : b; if (x) x.click(); }), b.title); });
    try { if (typeof BOTS !== 'undefined') for (const b of BOTS) add('bot:' + b.id, 'Bots and pages', typeof WorkspaceUI !== 'undefined' && WorkspaceUI.name ? WorkspaceUI.name(b) : b.name, () => { if (F) F.bot(b.id); }); } catch(e){}
    document.querySelectorAll('#lefttools [data-tool]').forEach(b => add('draw:' + b.dataset.tool, 'Drawing tools', (b.title || b.dataset.tool).split('(')[0].split('—')[0].trim(), () => this.chart(() => b.click())));
    const S = this.classic(); if (S) for (const a of S.ACTIONS) add('classic:' + a.id, 'Classic keys', a.label, null);
    this._cat = out; this._catT = now; return out;
  },
  keyOf(it){ if (it.id.startsWith('classic:')){ const S = this.classic(), k = S && S.map[it.id.slice(8)]; return k && k !== '—' ? k : ''; } return this.load()[it.id] || ''; },
  labelOf(id){ const it = this.catalog().find(x => x.id === id); return it ? it.label : id; },

  /* ---------- getting there ---------- */
  chart(fn){ const F = typeof Face !== 'undefined' ? Face : null; if (F && F.room !== 'chart'){ F.go('chart'); setTimeout(fn, 180); } else fn(); },
  side(tab){ this.chart(() => {
    if (document.documentElement.dataset.chartmax === '1' && typeof App !== 'undefined' && App.setMax) App.setMax(false);
    const m = this.$('main'); if (m && (m.classList.contains('sideClosed') || m.classList.contains('sideMin'))){ try { SideWindow.action('restore'); } catch(e){} }
    const b = document.querySelector('#sideTabs button[data-tab="' + tab + '"]'); if (b) b.click(); }); },

  /* ---------- the keyboard ---------- */
  key(e){
    if (this.capture){ e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape'){ this.capture = null; this.paint(); return; }
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return;
      this.take(this.combo(e)); return; }
    const m = this.$('tkModal'); if (m && !m.hidden && e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
    if (!this.faceOn() || e.repeat || ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
    const isF = /^F\d{1,2}$/.test(e.key), tag = (e.target && e.target.tagName) || '';
    if (!isF && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable))) return;
    const combo = this.combo(e), S = this.classic();
    /* a Classic key: Classic's own handler runs it */
    if (S && S.map){ const sc = S.combo(e); if (Object.values(S.map).includes(sc)) return;
      /* …unless the keyboard is in another language, where Classic reads a different letter: then it is run from here */
      const ca = S.ACTIONS.find(a => S.map[a.id] === combo); if (ca){ if (ca.when && !ca.when()) return; e.preventDefault(); e.stopImmediatePropagation(); try { ca.run(); } catch(err){} return; } }
    const M = this.load(), id = Object.keys(M).find(k => M[k] === combo); if (!id) return;
    const it = this.catalog().find(x => x.id === id); if (!it || !it.run) return;
    e.preventDefault(); e.stopImmediatePropagation();
    try { it.run(); } catch(err){ console.warn('ASTRA key:', err.message); }
  },
  blocked(c){
    if (this.BLOCK[c]) return this.BLOCK[c];
    if (/^(Shift\+)?([A-Z0-9]|Num\d|Space)$/.test(c) || /^(Shift\+)?.$/.test(c)) return 'a letter or number on its own opens the symbol search, so add Alt or Ctrl';
    if (/^(Shift\+)?Arrow(Left|Right|Up|Down)$/.test(c)) return 'the arrows move the chart';
    return '';
  },
  take(combo){
    const it = this.catalog().find(x => x.id === this.capture); if (!it){ this.capture = null; this.paint(); return; }
    const why = this.blocked(combo); if (why){ this.note(combo + ' can’t be used: ' + why + '.', 'bad'); return; }
    const moved = this.set(it, combo); this.capture = null; this.paint();
    this.note('Saved: ' + combo + ' → ' + it.label + (moved ? '. It was on “' + moved + '”, which now has no key.' : '.'), 'ok');
  },
  /* one key, one place: setting it here clears it anywhere else, Classic's list included */
  set(it, combo){
    const S = this.classic(), M = this.load(); let moved = '';
    if (combo){
      for (const [id, k] of Object.entries(M)) if (k === combo && id !== it.id){ M[id] = ''; moved = this.labelOf(id); }
      if (S) for (const a of S.ACTIONS) if (S.map[a.id] === combo && 'classic:' + a.id !== it.id){ S.map[a.id] = '—'; moved = a.label; }
    }
    if (it.id.startsWith('classic:')){ if (S) S.map[it.id.slice(8)] = combo || '—'; } else M[it.id] = combo;
    this.save(); if (S) S.save(); return moved;
  },

  /* ---------- the list ---------- */
  open(){
    let m = this.$('tkModal');
    if (!m){
      m = document.createElement('div'); m.id = 'tkModal'; m.hidden = true;
      m.innerHTML = '<div class="tkBox" role="dialog" aria-label="Shortcuts">' +
        '<header class="tkHead"><div><h3>Shortcuts</h3><p>Give any place a key: press the key box on a row, then the keys. Esc cancels.</p></div>' +
        '<button type="button" class="tkBtn" data-tk="reset">Put every key back</button><button type="button" class="tkX" data-tk="close" title="Close (Esc)">✕</button></header>' +
        '<div class="tkTools"><input id="tkFind" type="search" placeholder="Find a room, a tab, a tool, a layer…" autocomplete="off" spellcheck="false"><label class="tkOnly"><input type="checkbox" id="tkOnly"><span>Only those with a key</span></label></div>' +
        '<nav class="tkGroups" id="tkGroups"></nav><div class="tkNote" id="tkNote" hidden></div><div class="tkList" id="tkList"></div><footer class="tkFoot" id="tkFoot"></footer></div>';
      document.body.appendChild(m);
      m.addEventListener('mousedown', e => { if (e.target === m) this.close(); });
      m.addEventListener('click', e => {
        const k = e.target.closest('[data-tkk]'), c = e.target.closest('[data-tkc]'), g = e.target.closest('[data-tkg]'), b = e.target.closest('[data-tk]');
        if (k){ this.capture = this.capture === k.dataset.tkk ? null : k.dataset.tkk; this.note(''); this.paint(); }
        else if (c){ const it = this.catalog().find(x => x.id === c.dataset.tkc); if (it){ this.set(it, ''); this.note('Removed the key of ' + it.label + '.', 'ok'); this.paint(); } }
        else if (g){ this.grp = g.dataset.tkg; this.capture = null; this.paint(); this.$('tkList').scrollTop = 0; }
        else if (b && b.dataset.tk === 'close') this.close();
        else if (b && b.dataset.tk === 'reset'){ if (!confirm('Put every key back as it came, Classic’s included?')) return;
          this.map = null; try { localStorage.removeItem(this.KEY); } catch(x){} this.load();
          const S = this.classic(); if (S){ S.map = null; try { lsSet(S.KEY, {}); } catch(x){} S.load(); }
          this.capture = null; this.note('Every key is back as it came.', 'ok'); this.paint(); }
      });
      this.$('tkFind').addEventListener('input', () => { this.capture = null; this.paint(); });
      this.$('tkOnly').addEventListener('change', () => this.paint());
    }
    this._cat = null; this.capture = null; this.note(''); m.hidden = false; this.paint();
    setTimeout(() => { const f = this.$('tkFind'); if (f) f.focus(); }, 30);
  },
  close(){ const m = this.$('tkModal'); if (m) m.hidden = true; this.capture = null; try { if (typeof TmSettings !== 'undefined' && TmSettings.paintKeys) TmSettings.paintKeys(); } catch(e){} },
  note(t, kind){ const n = this.$('tkNote'); if (!n) return; n.hidden = !t; n.textContent = t || ''; n.className = 'tkNote' + (kind ? ' ' + kind : ''); },
  caps(k){ return k.split(/\+(?=.)/).map(p => '<kbd>' + this.esc(p.replace(/^Arrow/, '').replace(/^Num(\d)$/, 'Num $1')) + '</kbd>').join(''); },
  paint(){
    const list = this.$('tkList'), m = this.$('tkModal'); if (!list || !m || m.hidden) return;
    const cat = this.catalog(), q = (this.$('tkFind').value || '').trim().toLowerCase(), only = this.$('tkOnly').checked, words = q.split(/\s+/).filter(Boolean);
    const fits = x => (!only || this.keyOf(x)) && words.every(w => (x.label + ' ' + x.group + ' ' + this.keyOf(x)).toLowerCase().includes(w));
    const groups = [...new Set(cat.map(x => x.group))]; if (this.grp !== 'all' && !groups.includes(this.grp)) this.grp = 'all';
    this.$('tkGroups').innerHTML = ['all'].concat(groups).map(g => { const n = cat.filter(x => (g === 'all' || x.group === g) && fits(x)).length;
      return '<button type="button" data-tkg="' + this.esc(g) + '" class="' + (this.grp === g ? 'on' : '') + (n ? '' : ' empty') + '">' + (g === 'all' ? 'Everything' : this.esc(g)) + '<em>' + n + '</em></button>'; }).join('');
    const rows = cat.filter(x => (this.grp === 'all' || x.group === this.grp) && fits(x));
    let html = '', last = '';
    for (const x of rows){
      if (x.group !== last){ html += '<h4>' + this.esc(x.group) + (x.group === 'Classic keys' ? '<small>these work in both looks</small>' : '') + '</h4>'; last = x.group; }
      const k = this.keyOf(x), cap = this.capture === x.id;
      html += '<div class="tkRow' + (cap ? ' cap' : '') + (k ? ' has' : '') + '"><span class="tkName" title="' + this.esc(x.hint || x.label) + '">' + this.esc(x.label) + '</span>' +
        '<button type="button" class="tkKey' + (k ? '' : ' none') + '" data-tkk="' + this.esc(x.id) + '" title="' + (k ? 'Press to change this key' : 'Press, then the keys you want') + '">' + (cap ? '<i>press the keys…</i>' : k ? this.caps(k) : '<i>add a key</i>') + '</button>' +
        (k ? '<button type="button" class="tkClr" data-tkc="' + this.esc(x.id) + '" title="Remove this key">✕</button>' : '<span class="tkClr"></span>') + '</div>';
    }
    const y = list.scrollTop; list.innerHTML = html || '<div class="tkNone">Nothing matches. Try another word, or Everything.</div>'; list.scrollTop = y;
    this.$('tkFoot').innerHTML = this.FIXED.map(([k, t]) => '<span>' + this.caps(k) + t + '</span>').join('') + '<span class="tkWhy">Keys wait while you type in a box; F-keys work everywhere.</span>';
    if (this.capture){ const r = list.querySelector('.tkRow.cap'); if (r) r.scrollIntoView({ block: 'nearest' }); }
  },

  /* ---------- the ways in: F1 and Settings open this list, Ctrl+K finds it ---------- */
  hook(){
    if (typeof Shortcuts !== 'undefined' && Shortcuts.open && !Shortcuts._tkOpen){ Shortcuts._tkOpen = true; const o = Shortcuts.open.bind(Shortcuts);
      Shortcuts.open = () => this.faceOn() ? this.open() : o(); }
    if (typeof Face !== 'undefined' && Face.items && !Face._tkItems){ Face._tkItems = true; const oi = Face.items.bind(Face);
      Face.items = () => { const out = oi(); out.unshift({ label: 'Shortcuts: give any place a key', hint: 'Keys', run: () => this.open() }); return out; }; }
    if (typeof TmSettings !== 'undefined' && TmSettings.paintKeys && !TmSettings._tkKeys){ TmSettings._tkKeys = true; const op = TmSettings.paintKeys.bind(TmSettings);
      TmSettings.paintKeys = () => { op(); const el = TmSettings.host && TmSettings.host.querySelector('#crKeysBody .crKeys'); if (!el) return;
        const mine = this.catalog().filter(x => !x.id.startsWith('classic:') && this.keyOf(x));
        el.insertAdjacentHTML('afterbegin', mine.map(x => '<div class="crKey"><kbd>' + this.keyOf(x).split(/\+(?=.)/).map(p => this.esc(p)).join('</kbd><i>+</i><kbd>') + '</kbd><span>' + this.esc(x.group + ': ' + x.label) + '</span></div>').join('')); }; }
    const pv = this.$('tmPopView');
    if (pv && !this.$('tkViewBtn')){ const b = document.createElement('button'); b.type = 'button'; b.id = 'tkViewBtn'; b.className = 'tkViewBtn'; b.innerHTML = '<span>⌨</span> Shortcuts: give any place a key'; pv.appendChild(b);
      b.addEventListener('click', () => { try { Face.closePops(); } catch(e){} this.open(); }); }
    return !!(pv && typeof Shortcuts !== 'undefined' && Shortcuts._tkOpen && typeof Face !== 'undefined' && Face._tkItems && (typeof TmSettings === 'undefined' || TmSettings._tkKeys));
  },
};
/* in before Classic's own handler (it starts when the page is ready), so a key being set here never also runs Classic's */
window.addEventListener('keydown', e => TmKeys.key(e), true);
(function start(n){ if (TmKeys.hook() || n > 40) return; setTimeout(() => start(n + 1), 300); })(0);
setInterval(() => TmKeys.hook(), 2000);
