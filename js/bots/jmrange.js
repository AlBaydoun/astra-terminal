/* ASTRA Terminal — a time range for the Deep Dive.

   A bar under the Deep Dive's path, working alongside the ticks in the cards:
     From / To      exact date and time
     Hours          a window inside every day, which may cross midnight (22:00–02:00)
     Weekdays       none picked means all
     Timeframes     none picked means all
     Measured on    closing time (as the Day card does) or opening time

   Every card, chart and total on the page reads the narrowed set. The paper and
   live Deep Dives each remember their own range. Times are this PC's local time.
   Read only: it changes what is shown and nothing about any bot or trade. */
const JMRange = {
  DEF: { from: '', to: '', hFrom: '', hTo: '', tf: [], dow: [], basis: 'exit' },
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  TF_ORDER: ['1s', '30s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
  key(page){ return 'astra_range_' + (page.PAGE || 'explorer'); },
  get(page){ return Object.assign({}, this.DEF, lsGet(this.key(page), {}) || {}); },
  set(page, r){ lsSet(this.key(page), r); page._rangeC = null; },
  active(r){ return !!(r.from || r.to || r.hFrom || r.hTo || r.tf.length || r.dow.length); },
  mins(s){ const m = /^(\d\d):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; },

  /* parsed once per change: excluded() runs for every trade on every render */
  compiled(page){
    if (page._rangeC) return page._rangeC;
    const r = this.get(page), a = r.from ? new Date(r.from).getTime() : null, b = r.to ? new Date(r.to).getTime() + 59999 : null;
    const hasH = !!(r.hFrom || r.hTo);
    return page._rangeC = { r, on: this.active(r), a, b, hasH, h1: hasH ? (this.mins(r.hFrom) ?? 0) : 0, h2: hasH ? (this.mins(r.hTo) ?? 1439) : 1439,
      tf: new Set(r.tf), dow: new Set(r.dow) };
  },
  pass(page, t){
    const C = this.compiled(page); if (!C.on) return true;
    const ms = C.r.basis === 'entry' ? (t.entryTime || t.exitTime) : (t.exitTime || t.entryTime);
    if (C.a != null && !(ms >= C.a)) return false;
    if (C.b != null && !(ms <= C.b)) return false;
    const d = new Date(ms);
    if (C.hasH){ const m = d.getHours() * 60 + d.getMinutes();
      if (C.h1 <= C.h2 ? (m < C.h1 || m > C.h2) : (m < C.h1 && m > C.h2)) return false; }
    if (C.dow.size && !C.dow.has((d.getDay() + 6) % 7)) return false;
    if (C.tf.size && !C.tf.has(t.tf || '?')) return false;
    return true;
  },

  stamp(d){ const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); },
  preset(name){
    const now = new Date(), day = (back, h, m) => { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h, m, 0, 0); return this.stamp(d); };
    if (name === 'today') return { from: day(0, 0, 0), to: '' };
    if (name === 'yesterday') return { from: day(1, 0, 0), to: day(1, 23, 59) };
    if (name === '7') return { from: day(6, 0, 0), to: '' };
    if (name === '30') return { from: day(29, 0, 0), to: '' };
    if (name === 'month'){ const d = new Date(now.getFullYear(), now.getMonth(), 1); return { from: this.stamp(d), to: '' }; }
    return { from: '', to: '' };
  },

  bar(page){
    const r = this.get(page), all = page.all(), tfs = [...new Set(all.map(t => t.tf || '?'))];
    tfs.sort((x, y) => { const a = this.TF_ORDER.indexOf(x), b = this.TF_ORDER.indexOf(y); return (a < 0 ? 99 : a) - (b < 0 ? 99 : b) || x.localeCompare(y); });
    const kept = this.active(r) ? all.filter(t => this.pass(page, t)).length : all.length;
    const bad = r.from && r.to && r.from > r.to;
    const chip = (kind, val, label, on) => `<button type="button" class="jmChip${on ? ' on' : ''}" data-rg${kind}="${esc(String(val))}" aria-pressed="${on}">${esc(label)}</button>`;
    const preset = (id, label) => `<button type="button" class="bMini" data-rgpreset="${id}">${label}</button>`;
    return `<div class="jmRange${this.active(r) ? ' on' : ''}" style="color-scheme:${STORE.theme === 'light' ? 'light' : 'dark'}">
      <div class="jmRow">
        <b>Time range</b>
        <label>From <input type="datetime-local" id="jmRgFrom" value="${esc(r.from)}"></label>
        <label>To <input type="datetime-local" id="jmRgTo" value="${esc(r.to)}"></label>
        <label title="A window inside every day. It may cross midnight, for example 22:00 to 02:00">Hours <input type="time" id="jmRgH1" value="${esc(r.hFrom)}"></label>
        <label>to <input type="time" id="jmRgH2" value="${esc(r.hTo)}"></label>
        <label>Measured on <select id="jmRgBasis"><option value="exit"${r.basis === 'exit' ? ' selected' : ''}>closing time</option><option value="entry"${r.basis === 'entry' ? ' selected' : ''}>opening time</option></select></label>
      </div>
      <div class="jmRow">
        ${preset('today', 'Today')}${preset('yesterday', 'Yesterday')}${preset('7', '7 days')}${preset('30', '30 days')}${preset('month', 'This month')}
        <span class="jmSep"></span>${this.DAYS.map((d, i) => chip('dow', i, d, r.dow.includes(i))).join('')}
        <span class="jmSep"></span><span class="dim2">Timeframes</span>${tfs.map(v => chip('tf', v, v === '?' ? 'not recorded' : v, r.tf.includes(v))).join('')}
      </div>
      <div class="jmRow jmSum"><span class="${bad || !kept ? 'jmWarn' : 'dim2'}">${bad ? 'From is later than To, so nothing can match.' : (kept ? 'Showing ' + kept.toLocaleString() + ' of ' + all.length.toLocaleString() + ' trades.' : 'No trades in this range.')} Your ticks in the cards still apply on top.</span>
        <button type="button" class="bMini" data-rgclear="1"${this.active(r) ? '' : ' disabled'}>Clear range</button></div>
    </div>`;
  },

  apply(page, r, focusId){
    this.set(page, r); page.dirty = true; this._focus = focusId || null; Bots.render();
  },
  bindBar(page, host){
    const wrap = host.querySelector('.exWrap'), crumbs = wrap && wrap.querySelector(':scope > .exCrumbs');
    if (!crumbs) return;
    wrap.querySelector(':scope > .jmRange')?.remove();
    crumbs.insertAdjacentHTML('afterend', this.bar(page));
    const el = wrap.querySelector(':scope > .jmRange');
    const field = { jmRgFrom: 'from', jmRgTo: 'to', jmRgH1: 'hFrom', jmRgH2: 'hTo' };
    /* wait for a pause: the browser reports a change after each part of a date */
    let timer = null;
    for (const [id, k] of Object.entries(field)){
      el.querySelector('#' + id).addEventListener('change', e => { const v = e.target.value; clearTimeout(timer);
        timer = setTimeout(() => { const r = this.get(page); r[k] = v; this.apply(page, r, id); }, 700); });
    }
    el.querySelector('#jmRgBasis').addEventListener('change', e => { const r = this.get(page); r.basis = e.target.value; this.apply(page, r, 'jmRgBasis'); });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const r = this.get(page), toggle = (list, v) => list.includes(v) ? list.filter(x => x !== v) : list.concat([v]);
      if (b.dataset.rgpreset) Object.assign(r, this.preset(b.dataset.rgpreset));
      else if (b.dataset.rgdow != null) r.dow = toggle(r.dow, +b.dataset.rgdow);
      else if (b.dataset.rgtf != null) r.tf = toggle(r.tf, b.dataset.rgtf);
      else if (b.dataset.rgclear){ Object.assign(r, this.DEF, { basis: r.basis, tf: [], dow: [] }); }
      else return;
      this.apply(page, r);
    });
    if (this._focus){ el.querySelector('#' + this._focus)?.focus(); this._focus = null; }
  },

  install(){
    if (typeof Explorer === 'undefined') return;
    document.head.insertAdjacentHTML('beforeend', `<style>
      .jmRange{ display:flex; flex-direction:column; gap:7px; padding:9px 11px; border:1px solid var(--border); border-radius:10px; background:var(--panel); font-size:11.5px; }
      .jmRange.on{ border-color:#39bda8; }
      .jmRange .jmRow{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
      .jmRange label{ display:inline-flex; align-items:center; gap:5px; color:var(--dim); }
      .jmRange input, .jmRange select{ padding:3px 5px; background:transparent; color:var(--text); border:1px solid var(--border); border-radius:5px; font:inherit; }
      .jmRange .jmSep{ width:1px; height:16px; background:var(--border); }
      .jmChip{ padding:2px 8px; background:none; color:var(--dim); border:1px solid var(--border); border-radius:999px; font:inherit; cursor:pointer; }
      .jmChip.on{ color:#39bda8; border-color:#39bda8; background:rgba(57,189,168,.12); }
      .jmRange .jmSum{ justify-content:space-between; }
      .jmRange .jmWarn{ color:#ffb74d; }
    </style>`);
    const excluded = Explorer.excluded, bind = Explorer.bind;
    Explorer.excluded = function(t){ return !JMRange.pass(this, t) || excluded.call(this, t); };
    Explorer.bind = function(host){ bind.call(this, host); try { JMRange.bindBar(this, host); } catch(e){ console.warn('ASTRA range:', e.message); } };
  },
};
JMRange.install();
