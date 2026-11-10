/* ASTRA Terminal — a time range for the Deep Dive.

   A foldable panel under the Deep Dive's path, working alongside the ticks in the
   cards: From and To, hours inside each day (which may cross midnight), weekdays
   and timeframes, measured on closing or opening time. Every card, chart and total
   reads the narrowed set. The paper and live pages each remember their own range.

   Two sliders set the minimum and maximum by dragging their points: one across the
   whole trading history, one across the hours of a day, each over a small chart of
   when trades happened. Drag the hour points past each other for an overnight
   window. Fields and sliders always show the same range.

   Date and time fields are made for typing: each part selects itself on entry, two
   digits jump to the next part (and from From to To, then to Hours), a separator or
   Tab jumps early, Backspace on an empty part goes back, and the up and down arrows
   change the value. The panel survives the page redrawing, so a half-typed field
   and the cursor stay where they were. Times are this PC's local time.

   Signals: the same filter as ⚑ Filter labels on the chart, over what opened
   each trade (TD9, CE Buy, Hammer …). Untick names, All or None, "only" for one,
   or search. Remembered per page; a new signal shows by default.

   Read only: it changes what is shown and nothing about any bot or trade. */
const JMRange = {
  DEF: { from: '', to: '', hFrom: '', hTo: '', tf: [], dow: [], sig: [], basis: 'exit' },
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  TF_ORDER: ['1s', '30s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
  PRESETS: [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['month', 'This month']],
  MAX: { d: 31, m: 12, h: 23, n: 59 },
  nodes: new WeakMap(),

  key(page){ return 'astra_range_' + (page.PAGE || 'explorer'); },
  get(page){ return Object.assign({}, this.DEF, lsGet(this.key(page), {}) || {}); },
  set(page, r){ lsSet(this.key(page), r); page._rangeC = null; },
  folded(page){ return !!lsGet(this.key(page) + '_fold', false); },
  active(r){ return !!(r.from || r.to || r.hFrom || r.hTo || r.tf.length || r.dow.length || (r.sig && r.sig.length)); },
  trig(t){ try { return Explorer.triggerOf(t); } catch(e){ return 'Not recorded'; } },
  mins(s){ const m = /^(\d\d):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; },
  p2(n){ return String(n).padStart(2, '0'); },

  /* parsed once per change: excluded() runs for every trade on every render */
  compiled(page){
    return page._rangeC || (page._rangeC = this.compile(this.get(page)));
  },
  compile(r){
    const a = r.from ? new Date(r.from).getTime() : null, b = r.to ? new Date(r.to).getTime() + 59999 : null;
    const hasH = !!(r.hFrom || r.hTo);
    return { r, on: this.active(r), a, b, hasH, h1: hasH ? (this.mins(r.hFrom) ?? 0) : 0, h2: hasH ? (this.mins(r.hTo) ?? 1439) : 1439,
      tf: new Set(r.tf), dow: new Set(r.dow), sig: new Set(r.sig || []) };
  },
  pass(page, t){
    if (page._rangeOff) return true;
    return this.passC(this.compiled(page), t, page._sigOff);
  },
  passC(C, t, skipSig){
    if (!C.on) return true;
    if (!skipSig && C.sig.size && C.sig.has(this.trig(t))) return false;
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

  stamp(d){ const p = n => this.p2(n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); },
  preset(name){
    const now = new Date(), day = (back, h, m) => { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h, m, 0, 0); return this.stamp(d); };
    if (name === 'today') return { from: day(0, 0, 0), to: '' };
    if (name === 'yesterday') return { from: day(1, 0, 0), to: day(1, 23, 59) };
    if (name === '7') return { from: day(6, 0, 0), to: '' };
    if (name === '30') return { from: day(29, 0, 0), to: '' };
    if (name === 'month') return { from: this.stamp(new Date(now.getFullYear(), now.getMonth(), 1)), to: '' };
    return { from: '', to: '' };
  },

  /* ---------- the markup ---------- */
  /* day, month and year in the order this PC writes dates */
  dateOrder(){
    if (this._order) return this._order;
    let o = ['d', 'm', 'y'];
    try { const parts = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(2026, 10, 5)).map(p => p.type);
      const seen = parts.filter(x => ['day', 'month', 'year'].includes(x)).map(x => x[0]); if (seen.length === 3) o = seen; } catch(e){}
    return this._order = o;
  },
  seg(part, label){
    const ph = { d: 'DD', m: 'MM', y: 'YYYY', h: 'HH', n: 'MM' }[part];
    return `<input class="jmSeg jmSeg-${part}" data-part="${part}" inputmode="numeric" autocomplete="off" maxlength="${part === 'y' ? 4 : 2}" placeholder="${ph}" aria-label="${esc(label)} ${{ d: 'day', m: 'month', y: 'year', h: 'hour', n: 'minute' }[part]}">`;
  },
  dateField(key, label){
    const date = this.dateOrder().map(p => this.seg(p, label)).join('<i>/</i>');
    return `<div class="jmField"><span class="jmLabel">${label}</span><div class="jmInput" data-field="${key}">${date}<span class="jmGap"></span>${this.seg('h', label)}<i>:</i>${this.seg('n', label)}
      <button type="button" class="jmCal" data-rgcal="${key}" tabindex="-1" title="Pick from a calendar" aria-label="Pick ${label} from a calendar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg></button></div></div>`;
  },
  hourField(key, label){
    return `<div class="jmField"><span class="jmLabel">${label}</span><div class="jmInput" data-field="${key}">${this.seg('h', label)}<i>:</i>${this.seg('n', label)}</div></div>`;
  },
  build(page){
    const el = document.createElement('section');
    el.className = 'jmRange';
    el.innerHTML = `<div class="jmHead">
        <button type="button" class="jmFold" data-rgfold="1" aria-expanded="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><b>Time range</b></button>
        <span class="jmSummary"></span><span class="jmCount"></span>
        <button type="button" class="bMini" data-rgclear="1">Clear</button>
      </div>
      <div class="jmHidden" hidden></div>
      <div class="jmBody">
        <div class="jmGroup jmPeriod"><h4>Period</h4>
          ${this.sliderHtml('period', 'Period')}
          <div class="jmFields">${this.dateField('from', 'From')}${this.dateField('to', 'To')}</div>
          <div class="jmChips">${this.PRESETS.map(([id, t]) => `<button type="button" class="jmChip" data-rgpreset="${id}">${t}</button>`).join('')}</div>
        </div>
        <div class="jmGroup jmHours"><h4>Hours each day</h4>
          ${this.sliderHtml('hours', 'Hours')}
          <div class="jmFields">${this.hourField('hFrom', 'From')}${this.hourField('hTo', 'To')}</div>
          <div class="jmSeg2" role="group" aria-label="Measure on"><button type="button" data-rgbasis="exit">Closing time</button><button type="button" data-rgbasis="entry">Opening time</button></div>
        </div>
        <div class="jmGroup"><h4>Weekdays</h4>
          <div class="jmChips">${this.DAYS.map((d, i) => `<button type="button" class="jmChip" data-rgdow="${i}">${d}</button>`).join('')}</div>
          <div class="jmChips"><button type="button" class="jmLink" data-rgweek="work">Mon to Fri</button><button type="button" class="jmLink" data-rgweek="all">Every day</button></div>
        </div>
        <div class="jmGroup"><h4>Timeframes</h4><div class="jmChips jmTfs"></div></div>
        <div class="jmGroup jmSigs"><div class="jmSigHead"><h4>Signals that opened the trades</h4><span class="jmSigCount"></span>
            <input type="search" class="jmSigQ" placeholder="Find a signal, e.g. TD9" autocomplete="off" aria-label="Find a signal">
            <button type="button" class="jmLink" data-rgsig="all">All</button><button type="button" class="jmLink" data-rgsig="none">None</button></div>
          <div class="jmSigList"></div></div>
      </div>
      <input type="date" class="jmPicker" tabindex="-1" aria-hidden="true">`;
    this.bindEvents(page, el);
    return el;
  },

  /* ---------- fields <-> stored range ---------- */
  parts(el, key){ const o = {}; el.querySelectorAll(`[data-field="${key}"] .jmSeg`).forEach(s => { o[s.dataset.part] = s.value.trim(); }); return o; },
  /* returns a stored value, '' for an empty field, or null while incomplete or invalid */
  read(el, key){
    const p = this.parts(el, key), isDate = key === 'from' || key === 'to';
    if (!Object.values(p).some(Boolean)) return '';
    const hm = (hd, nd) => { const h = p.h === '' ? hd : +p.h, n = p.n === '' ? nd : +p.n; return (h <= 23 && n <= 59) ? this.p2(h) + ':' + this.p2(n) : null; };
    if (!isDate) return p.h === '' ? null : hm(0, key === 'hTo' ? 59 : 0);
    if (!p.d || !p.m) return null;
    const y = p.y === '' ? new Date().getFullYear() : (p.y.length === 2 ? 2000 + +p.y : +p.y), m = +p.m, d = +p.d;
    if (y < 1000) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    const t = key === 'to' ? hm(23, 59) : hm(0, 0);
    return t ? y + '-' + this.p2(m) + '-' + this.p2(d) + 'T' + t : null;
  },
  fill(el, key, v){
    const box = el.querySelector(`[data-field="${key}"]`), set = (part, x) => { const s = box.querySelector(`[data-part="${part}"]`); if (s) s.value = x; };
    const m = /^(?:(\d{4})-(\d\d)-(\d\d)T)?(\d\d):(\d\d)$/.exec(v || '');
    if (m){ set('y', m[1] || ''); set('m', m[2] || ''); set('d', m[3] || ''); set('h', m[4]); set('n', m[5]); }
    else ['y', 'm', 'd', 'h', 'n'].forEach(p => set(p, ''));
    box.classList.remove('bad');
  },
  /* whatever is complete takes effect; a half-typed field keeps its last good value */
  commit(page, el, force){
    clearTimeout(el._timer); el._pending = false;
    const r = this.get(page), a = document.activeElement; let changed = false;
    for (const k of ['from', 'to', 'hFrom', 'hTo']){
      if (!force && el.querySelector(`[data-field="${k}"]`).contains(a)) continue;
      const v = this.read(el, k); if (v != null && v !== r[k]){ r[k] = v; changed = true; } }
    if (changed) this.apply(page, r);
  },
  schedule(page, el){ clearTimeout(el._timer); el._pending = true; el._timer = setTimeout(() => this.commit(page, el), 650); },

  apply(page, r){
    this.set(page, r); page.dirty = true;
    const el = this.nodes.get(page), a = document.activeElement;
    if (el && el.contains(a)) el._keep = { a, s: a.classList.contains('jmSeg') ? a.selectionStart : null, e: a.classList.contains('jmSeg') ? a.selectionEnd : null };
    Bots.render();
  },

  /* ---------- show the state ---------- */
  label(v){ if (!v) return ''; const d = new Date(v); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ' ' + v.slice(11); },
  summary(r){
    const out = [];
    if (r.from || r.to) out.push((r.from ? this.label(r.from) : 'start') + ' → ' + (r.to ? this.label(r.to) : 'now'));
    if (r.hFrom || r.hTo) out.push((r.hFrom || '00:00') + '–' + (r.hTo || '23:59') + ' daily');
    if (r.dow.length) out.push(r.dow.slice().sort().map(i => this.DAYS[i]).join(' '));
    if (r.tf.length) out.push(r.tf.map(v => v === '?' ? 'not recorded' : v).join(' '));
    if (r.sig && r.sig.length) out.push(r.sig.length + ' signal' + (r.sig.length > 1 ? 's' : '') + ' hidden');
    if (r.basis === 'entry' && out.length) out.push('by opening time');
    return out.join('  ·  ') || 'All trades';
  },
  sync(page, el){
    const r = this.get(page), all = page.all(), on = this.active(r), folded = this.folded(page);
    el.classList.toggle('on', on); el.classList.toggle('folded', folded);
    el.style.colorScheme = STORE.theme === 'light' ? 'light' : 'dark';
    const fb = el.querySelector('[data-rgfold]'); fb.setAttribute('aria-expanded', String(!folded));
    const kept = on ? all.filter(t => this.pass(page, t)).length : all.length, bad = r.from && r.to && r.from > r.to;
    el.querySelector('.jmSummary').textContent = this.summary(r);
    const c = el.querySelector('.jmCount'); c.classList.toggle('warn', !!bad || !kept);
    c.textContent = bad ? 'From is later than To' : (kept === all.length ? all.length.toLocaleString() + ' trades' : kept.toLocaleString() + ' of ' + all.length.toLocaleString() + ' trades');
    el.querySelector('[data-rgclear]').disabled = !on;
    const a = document.activeElement;
    for (const k of ['from', 'to', 'hFrom', 'hTo']){ const box = el.querySelector(`[data-field="${k}"]`), v = this.read(el, k);
      /* never overwrite what is being typed, or a part-typed or invalid field */
      if (el._pending || box.contains(a) || (el._keep && box.contains(el._keep.a)) || v == null || v === r[k]) continue;
      this.fill(el, k, r[k]); }
    el.querySelectorAll('[data-rgpreset]').forEach(b => { const p = this.preset(b.dataset.rgpreset); b.classList.toggle('on', r.from === p.from && r.to === p.to); });
    el.querySelectorAll('[data-rgdow]').forEach(b => { const x = r.dow.includes(+b.dataset.rgdow); b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); });
    el.querySelectorAll('[data-rgbasis]').forEach(b => { const x = r.basis === b.dataset.rgbasis; b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); });
    this.syncSliders(page, el, r);
    this.sigList(page, el, r);
    this.hiddenNote(page, el, r);
    const tfs = [...new Set(all.map(t => t.tf || '?'))];
    tfs.sort((x, y) => { const p = this.TF_ORDER.indexOf(x), q = this.TF_ORDER.indexOf(y); return (p < 0 ? 99 : p) - (q < 0 ? 99 : q) || x.localeCompare(y); });
    el.querySelector('.jmTfs').innerHTML = tfs.length ? tfs.map(v => { const x = r.tf.includes(v), n = all.filter(t => (t.tf || '?') === v).length;
      return `<button type="button" class="jmChip${x ? ' on' : ''}" data-rgtf="${esc(v)}" aria-pressed="${x}">${esc(v === '?' ? 'Not recorded' : v)} <small>${n}</small></button>`; }).join('') : '<span class="jmNone">No trades yet</span>';
  },

  /* ---------- the sliders: two points set the minimum and the maximum ---------- */
  sliderHtml(id, label){
    return `<div class="jmSlider" data-slider="${id}"><div class="jmHist" aria-hidden="true"></div><div class="jmRail"><i></i><i></i></div>
      <button type="button" class="jmKnob" data-knob="a" role="slider" aria-label="${label} minimum"><span></span></button>
      <button type="button" class="jmKnob" data-knob="b" role="slider" aria-label="${label} maximum"><span></span></button>
      <div class="jmEnds"><span></span><span></span></div></div>`;
  },
  /* the slider's scale, and the step a drag snaps to */
  domain(page, id, r){
    if (id === 'hours') return { lo: 0, hi: 1440, step: 15, big: 60 };
    const all = page.all(), time = t => r.basis === 'entry' ? (t.entryTime || t.exitTime) : (t.exitTime || t.entryTime);
    const first = all.length ? Math.min(...all.map(time)) : Date.now() - 30 * 86400000, lo = new Date(first); lo.setHours(0, 0, 0, 0);
    const hi = new Date(); hi.setHours(23, 59, 0, 0);
    const span = hi.getTime() - lo.getTime(), DAY = 86400000;
    return span > 21 * DAY ? { lo: lo.getTime(), hi: hi.getTime(), step: DAY, big: 7 * DAY, day: true } : { lo: lo.getTime(), hi: hi.getTime(), step: 3600000, big: DAY };
  },
  /* stored range -> the two points */
  points(id, r, D){
    if (id === 'hours') return { a: this.mins(r.hFrom) ?? 0, b: r.hTo ? (this.mins(r.hTo) === 1439 ? 1440 : this.mins(r.hTo)) : 1440 };
    const clamp = v => Math.max(D.lo, Math.min(D.hi, v));
    return { a: r.from ? clamp(new Date(r.from).getTime()) : D.lo, b: r.to ? clamp(new Date(r.to).getTime()) : D.hi };
  },
  /* the moved point -> a stored range. The other end keeps its exact value, and a
     point at the very end means "no limit" */
  withPoints(id, r, D, P, which){
    const o = Object.assign({}, r);
    if (id === 'hours'){ const hm = v => this.p2(Math.floor(v / 60)) + ':' + this.p2(v % 60);
      if (P.a === 0 && P.b === 1440){ o.hFrom = ''; o.hTo = ''; return o; }
      if (which === 'a') o.hFrom = hm(P.a); else o.hTo = hm(Math.min(P.b, 1439));
      return o; }
    if (which === 'a'){ o.from = P.a <= D.lo ? '' : this.stamp(new Date(P.a)); return o; }
    if (P.b >= D.hi) o.to = '';
    else { const end = new Date(P.b); if (D.day) end.setHours(23, 59, 0, 0); else end.setMinutes(59, 0, 0); o.to = this.stamp(end); }
    return o;
  },
  snap(id, D, v){
    if (id === 'hours') return Math.max(0, Math.min(1440, Math.round(v / D.step) * D.step));
    v = Math.max(D.lo, Math.min(D.hi, v));
    if (v >= D.hi - D.step / 2) return D.hi;
    const d = new Date(v);
    if (D.day){ if (d.getHours() >= 12) d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); }
    else { if (d.getMinutes() >= 30) d.setHours(d.getHours() + 1); d.setMinutes(0, 0, 0); }
    return Math.max(D.lo, Math.min(D.hi, d.getTime()));
  },
  tip(id, v){ if (id === 'hours') return v >= 1440 ? '24:00' : this.p2(Math.floor(v / 60)) + ':' + this.p2(v % 60);
    const d = new Date(v); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (d.getHours() || d.getMinutes() ? ' ' + this.p2(d.getHours()) + ':' + this.p2(d.getMinutes()) : ''); },
  /* draw one slider: points, the filled part (two parts when overnight), chart bars */
  paint(sl, id, D, P){
    const pct = v => (v - D.lo) / (D.hi - D.lo) * 100, a = pct(P.a), b = pct(P.b), wrap = id === 'hours' && P.a > P.b;
    const [k1, k2] = [sl.querySelector('[data-knob="a"]'), sl.querySelector('[data-knob="b"]')], [f1, f2] = sl.querySelectorAll('.jmRail i');
    k1.style.left = a + '%'; k2.style.left = b + '%';
    if (wrap){ f1.style.left = '0'; f1.style.width = b + '%'; f2.style.left = a + '%'; f2.style.width = (100 - a) + '%'; }
    else { f1.style.left = a + '%'; f1.style.width = (b - a) + '%'; f2.style.width = '0'; }
    for (const [k, v] of [[k1, P.a], [k2, P.b]]){ const t = this.tip(id, v); k.firstElementChild.textContent = t; k.setAttribute('aria-valuetext', t); k.setAttribute('aria-valuemin', D.lo); k.setAttribute('aria-valuemax', D.hi); k.setAttribute('aria-valuenow', v); }
    sl.querySelectorAll('.jmHist b').forEach(bar => { const m = +bar.dataset.at; bar.classList.toggle('in', wrap ? (m >= a || m <= b) : (m >= a && m <= b)); });
  },
  chart(page, sl, id, D, r){
    const N = id === 'hours' ? 24 : 48, n = new Array(N).fill(0), span = D.hi - D.lo;
    for (const t of page.all()){ const ms = r.basis === 'entry' ? (t.entryTime || t.exitTime) : (t.exitTime || t.entryTime);
      const i = id === 'hours' ? new Date(ms).getHours() : Math.min(N - 1, Math.floor((ms - D.lo) / span * N)); if (i >= 0 && i < N) n[i]++; }
    const top = Math.max(1, ...n);
    sl.querySelector('.jmHist').innerHTML = n.map((v, i) => `<b data-at="${((i + .5) / N * 100).toFixed(2)}" style="height:${v ? Math.max(10, v / top * 100) : 0}%"></b>`).join('');
    const ends = sl.querySelectorAll('.jmEnds span');
    ends[0].textContent = this.tip(id, D.lo); ends[1].textContent = id === 'hours' ? '24:00' : 'Today';
  },
  syncSliders(page, el, r){
    el.querySelectorAll('[data-slider]').forEach(sl => { const id = sl.dataset.slider, D = this.domain(page, id, r);
      if (sl._drag) return; sl._D = D; this.chart(page, sl, id, D, r); this.paint(sl, id, D, this.points(id, r, D)); });
  },
  preview(page, el, r){
    const all = page.all(), C = this.compile(r), kept = C.on ? all.filter(t => this.passC(C, t)).length : all.length;
    el.querySelector('.jmSummary').textContent = this.summary(r);
    const c = el.querySelector('.jmCount'); c.classList.toggle('warn', !kept); c.textContent = kept === all.length ? all.length.toLocaleString() + ' trades' : kept.toLocaleString() + ' of ' + all.length.toLocaleString() + ' trades';
    for (const k of ['from', 'to', 'hFrom', 'hTo']) this.fill(el, k, r[k]);
  },
  bindSlider(page, el, sl){
    const id = sl.dataset.slider, at = e => { const R = sl.getBoundingClientRect(), D = sl._D; return D.lo + Math.max(0, Math.min(1, (e.clientX - R.left) / R.width)) * (D.hi - D.lo); };
    const setP = (P, which, v) => { const D = sl._D; v = this.snap(id, D, v);
      if (id === 'period'){ if (which === 'a') v = Math.min(v, P.b - D.step); else v = Math.max(v, P.a + D.step); v = Math.max(D.lo, Math.min(D.hi, v)); }
      P[which] = v; return P; };
    const show = (P, which) => { const r = this.withPoints(id, this.get(page), sl._D, P, which); this.paint(sl, id, sl._D, P); this.preview(page, el, r); return r; };
    sl.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault();
      const r0 = this.get(page), P = this.points(id, r0, sl._D), v = at(e), hit = e.target.closest('[data-knob]');
      const which = hit ? hit.dataset.knob : (Math.abs(v - P.a) <= Math.abs(v - P.b) ? 'a' : 'b'), knob = sl.querySelector(`[data-knob="${which}"]`);
      knob.focus({ preventScroll: true }); sl.classList.add('dragging'); knob.classList.add('active'); sl.setPointerCapture(e.pointerId);
      sl._drag = { P, which, r: null, moved: !hit }; if (!hit){ setP(P, which, v); sl._drag.r = show(P, which); }
    });
    sl.addEventListener('pointermove', e => { const g = sl._drag; if (!g) return; g.moved = true; setP(g.P, g.which, at(e)); g.r = show(g.P, g.which); });
    const end = () => { const g = sl._drag; if (!g) return; sl._drag = null; sl.classList.remove('dragging'); sl.querySelector('.jmKnob.active')?.classList.remove('active'); if (g.r) this.apply(page, g.r); };
    sl.addEventListener('pointerup', end); sl.addEventListener('pointercancel', end);
    sl.addEventListener('keydown', e => { const k = e.target.closest('[data-knob]'); if (!k) return;
      /* repeated presses build on each other before the page redraws */
      const D = sl._D, base = el._draft || this.get(page), P = this.points(id, base, D), w = k.dataset.knob, by = { ArrowLeft: -D.step, ArrowDown: -D.step, ArrowRight: D.step, ArrowUp: D.step, PageDown: -D.big, PageUp: D.big }[e.key];
      if (by == null && e.key !== 'Home' && e.key !== 'End') return; e.preventDefault();
      setP(P, w, e.key === 'Home' ? D.lo : e.key === 'End' ? D.hi : P[w] + by);
      const r = this.withPoints(id, base, D, P, w); el._draft = r; this.paint(sl, id, D, this.points(id, r, D)); this.preview(page, el, r);
      clearTimeout(el._kt); el._kt = setTimeout(() => { el._draft = null; this.apply(page, r); }, 450); });
  },

  /* the signals in the open view (time range and ticks applied, the signal filter not) */
  sigList(page, el, r){
    let rows = [];
    try { page._sigOff = true; rows = page.filtered(); } catch(e){} finally { page._sigOff = false; }
    const n = {}; for (const t of rows){ const k = this.trig(t); n[k] = (n[k] || 0) + 1; }
    const hid = new Set(r.sig || []), names = [...new Set(Object.keys(n).concat([...hid]))].sort((a, b) => (n[b] || 0) - (n[a] || 0) || a.localeCompare(b));
    el._sigNames = names;
    const q = el.querySelector('.jmSigQ').value.trim().toLowerCase(), shown = names.filter(x => !q || x.toLowerCase().includes(q));
    el.querySelector('.jmSigCount').textContent = names.length ? (names.length - names.filter(x => hid.has(x)).length) + ' of ' + names.length + ' shown' : '';
    el.querySelector('.jmSigList').innerHTML = shown.length ? shown.map(x => `<label class="jmSigItem${n[x] ? '' : ' zero'}"><input type="checkbox" data-rgsigname="${esc(x)}"${hid.has(x) ? '' : ' checked'}>
        <span title="${esc(x)}">${esc(x)}</span><small>${n[x] || 0}</small><button type="button" class="jmSigOnly" data-rgsigonly="${esc(x)}" title="Show only ${esc(x)}">only</button></label>`).join('')
      : `<span class="jmNone">${names.length ? 'No signal matches.' : 'No trades here.'}</span>`;
  },

  /* A saved range can hide everything in the doll you open, and the page then
     looks empty for no visible reason. Say so plainly, with the way out. */
  hiddenNote(page, el, r){
    const box = el.querySelector('.jmHidden');
    let shown = 0, base = 0;
    if (this.active(r)){
      try { shown = page.filtered().length; page._rangeOff = true; base = page.filtered().length; } catch(e){} finally { page._rangeOff = false; }
    }
    const hid = base - shown;
    if (!hid){ box.hidden = true; el.classList.remove('hiding'); return; }
    const bot = (page.path || []).find(f => f.dim === 'bot'), where = bot ? ' for ' + bot.label : ' here';
    box.hidden = false; el.classList.add('hiding'); el.classList.toggle('hidingAll', !shown);
    box.innerHTML = `<span>${!shown ? 'Your filters are hiding <b>all ' + base.toLocaleString() + '</b> trades' + esc(where) : 'Your filters are hiding <b>' + hid.toLocaleString() + ' of ' + base.toLocaleString() + '</b> trades' + esc(where)}: ${esc(this.summary(r))}.</span>
      <button type="button" class="bMini" data-rgclear="1">Clear range</button>${this.folded(page) ? '<button type="button" class="bMini" data-rgfold="1">Show range</button>' : ''}`;
    const empty = el.parentElement && el.parentElement.querySelector('.exEmpty');
    if (empty && !shown) empty.textContent = 'No trades pass the filters above. ' + base.toLocaleString() + ' trades here are filtered out. Clear the filters to see them.';
  },

  /* ---------- typing and clicking ---------- */
  bindEvents(page, el){
    el.querySelectorAll('[data-slider]').forEach(sl => this.bindSlider(page, el, sl));
    const segs = () => [...el.querySelectorAll('.jmSeg')];
    const move = (s, by) => { const l = segs(), n = l[l.indexOf(s) + by]; if (n){ n.focus(); n.select(); } return !!n; };
    const pad = s => { const v = s.value; if (!v) return; if (s.dataset.part === 'y'){ if (v.length === 2) s.value = String(2000 + +v); } else if (v.length === 1) s.value = '0' + v; };
    el.addEventListener('focusin', e => { if (!e.target.classList.contains('jmSeg')) return; el._cur = e.target; el._blurAt = null; e.target.select(); });
    el.addEventListener('focusout', e => { const s = e.target; if (!s.classList.contains('jmSeg')) return; el._blurAt = performance.now();
      setTimeout(() => { if (!el.isConnected || document.activeElement === s) return; pad(s);
        const box = s.closest('[data-field]'); if (box.contains(document.activeElement)) return;
        const k = box.dataset.field, filled = Object.values(this.parts(el, k)).some(Boolean); box.classList.toggle('bad', filled && this.read(el, k) == null); this.schedule(page, el); }, 0); });
    el.addEventListener('input', e => { const s = e.target; if (!s.classList.contains('jmSeg')) return;
      s.value = s.value.replace(/\D/g, ''); s.closest('[data-field]').classList.remove('bad');
      const part = s.dataset.part, v = s.value, max = this.MAX[part];
      const done = part === 'y' ? v.length === 4 : (v.length === 2 || (v.length === 1 && +v > Math.floor(max / 10)));
      if (done){ pad(s); if (!move(s, 1)) this.commit(page, el, true); } });
    el.addEventListener('keydown', e => { const s = e.target; if (!s.classList.contains('jmSeg')) return;
      if (e.key === 'Enter'){ e.preventDefault(); pad(s); this.commit(page, el, true); return; }
      if (e.key === 'Backspace' && s.value === ''){ e.preventDefault(); move(s, -1); return; }
      if (e.key === 'ArrowLeft' && s.selectionStart === 0 && s.selectionEnd === 0 || e.key === 'ArrowLeft' && s.selectionEnd - s.selectionStart === s.value.length){ e.preventDefault(); move(s, -1); return; }
      if (e.key === 'ArrowRight' && (s.selectionStart === s.value.length || s.selectionEnd - s.selectionStart === s.value.length)){ e.preventDefault(); move(s, 1); return; }
      if (['/', ':', '.', '-', ' '].includes(e.key)){ e.preventDefault(); if (s.value){ pad(s); move(s, 1); } return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); const part = s.dataset.part, by = e.key === 'ArrowUp' ? 1 : -1;
        const low = part === 'd' || part === 'm' ? 1 : 0, top = part === 'y' ? 2100 : this.MAX[part], now = new Date();
        const start = { d: now.getDate(), m: now.getMonth() + 1, y: now.getFullYear(), h: now.getHours(), n: 0 }[part];
        let v = s.value === '' ? start : +s.value + by; if (part !== 'y'){ if (v > top) v = low; if (v < low) v = top; }
        s.value = part === 'y' ? String(v) : this.p2(v); s.select(); } });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b && e.target.closest('.jmHead')){ this.setFold(page, el); return; }
      if (b && b.dataset.knob) return;
      if (!b || b.disabled) return;
      if (b.dataset.rgfold){ this.setFold(page, el); return; }
      if (b.dataset.rgcal){ const pk = el.querySelector('.jmPicker'); pk.dataset.key = b.dataset.rgcal;
        const cur = this.read(el, b.dataset.rgcal); pk.value = cur ? cur.slice(0, 10) : '';
        try { pk.showPicker(); } catch(x){ pk.focus(); } return; }
      const r = this.get(page), toggle = (list, v) => list.includes(v) ? list.filter(x => x !== v) : list.concat([v]);
      if (b.dataset.rgpreset) Object.assign(r, this.preset(b.dataset.rgpreset));
      else if (b.dataset.rgdow != null) r.dow = toggle(r.dow, +b.dataset.rgdow);
      else if (b.dataset.rgweek) r.dow = b.dataset.rgweek === 'work' ? [0, 1, 2, 3, 4] : [];
      else if (b.dataset.rgtf != null) r.tf = toggle(r.tf, b.dataset.rgtf);
      else if (b.dataset.rgbasis) r.basis = b.dataset.rgbasis;
      else if (b.dataset.rgsig === 'all') r.sig = [];
      else if (b.dataset.rgsig === 'none') r.sig = (el._sigNames || []).slice();
      else if (b.dataset.rgsigonly != null) r.sig = (el._sigNames || []).filter(n => n !== b.dataset.rgsigonly);
      else if (b.dataset.rgclear){ Object.assign(r, this.DEF, { basis: r.basis, tf: [], dow: [], sig: [] }); ['from', 'to', 'hFrom', 'hTo'].forEach(k => this.fill(el, k, '')); }
      else return;
      for (const k of ['from', 'to']) if (b.dataset.rgpreset) this.fill(el, k, r[k]);
      this.apply(page, r);
      /* timeframe chips are redrawn, so keyboard focus returns to the same one */
      if (b.dataset.rgtf != null) el.querySelector(`[data-rgtf="${CSS.escape(b.dataset.rgtf)}"]`)?.focus();
    });
    el.querySelector('.jmSigList').addEventListener('change', e => { const n = e.target.dataset.rgsigname; if (n == null) return;
      const r = this.get(page), h = new Set(r.sig || []); if (e.target.checked) h.delete(n); else h.add(n); r.sig = [...h]; this.apply(page, r); });
    el.querySelector('.jmSigQ').addEventListener('input', () => this.sigList(page, el, this.get(page)));
    el.querySelector('.jmPicker').addEventListener('change', e => {
      const pk = e.target, m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(pk.value), box = el.querySelector(`[data-field="${pk.dataset.key}"]`); if (!m) return;
      box.querySelector('[data-part="y"]').value = m[1]; box.querySelector('[data-part="m"]').value = m[2]; box.querySelector('[data-part="d"]').value = m[3];
      const hour = box.querySelector('[data-part="h"]'); hour.focus(); hour.select(); this.commit(page, el);
    });
  },
  setFold(page, el){
    const f = !this.folded(page); lsSet(this.key(page) + '_fold', f);
    if (f) this.commit(page, el);
    this.sync(page, el);
  },

  /* keep the same panel through every page redraw */
  place(page, host){
    const wrap = host.querySelector('.exWrap'), crumbs = wrap && wrap.querySelector(':scope > .exCrumbs');
    if (!crumbs) return;
    let el = this.nodes.get(page);
    if (!el){ el = this.build(page); this.nodes.set(page, el); }
    /* a redraw removes the panel for a moment, which takes the cursor with it */
    const c = el._cur, lost = !el.isConnected && c && (el._blurAt == null || performance.now() - el._blurAt < 300);
    if (lost && !el._keep) el._keep = { a: c, s: c.value.length, e: c.value.length };
    crumbs.after(el);
    this.sync(page, el);
    const k = el._keep; el._keep = null;
    if (k && el.contains(k.a) && document.activeElement !== k.a){ k.a.focus(); try { if (k.s != null) k.a.setSelectionRange(k.s, k.e); } catch(e){} }
  },

  install(){
    if (typeof Explorer === 'undefined') return;
    document.head.insertAdjacentHTML('beforeend', `<style>
      .jmRange{ --jmA:#39bda8; display:block; border:1px solid var(--border); border-radius:12px; background:var(--panel); font-size:12px; overflow:hidden; }
      .jmRange.on{ border-color:color-mix(in srgb, var(--jmA) 65%, transparent); }
      .jmHead{ display:flex; align-items:center; gap:12px; padding:9px 12px; cursor:pointer; min-height:40px; box-sizing:border-box; }
      .jmFold{ display:inline-flex; align-items:center; gap:7px; padding:3px 6px 3px 2px; background:none; border:0; border-radius:6px; color:var(--text); font:inherit; cursor:pointer; }
      .jmFold b{ font-weight:600; font-size:12.5px; } .jmFold svg{ transition:transform .15s ease; color:var(--jmA); }
      .jmRange.folded .jmFold svg{ transform:rotate(-90deg); }
      .jmSummary{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dim); }
      .jmRange.on .jmSummary{ color:var(--jmA); }
      .jmCount{ white-space:nowrap; font-variant-numeric:tabular-nums; color:var(--dim); } .jmCount.warn{ color:#ffb74d; }
      .jmBody{ display:grid; grid-template-columns:minmax(320px,1.8fr) minmax(210px,1.1fr) minmax(200px,.9fr) minmax(170px,.8fr); border-top:1px solid var(--border); }
      .jmRange.folded .jmBody{ display:none; }
      .jmGroup{ display:flex; flex-direction:column; gap:9px; padding:11px 14px 13px; min-width:0; border-left:1px solid var(--border); }
      .jmGroup:first-child{ border-left:0; }
      .jmGroup h4{ margin:0; font-size:10.5px; font-weight:600; letter-spacing:.03em; color:var(--dim); }
      .jmSlider{ position:relative; height:58px; margin:0 8px; touch-action:none; cursor:pointer; user-select:none; }
      .jmHist{ position:absolute; left:0; right:0; top:0; height:26px; display:flex; align-items:flex-end; gap:1px; pointer-events:none; }
      .jmHist b{ flex:1; min-width:0; border-radius:1px 1px 0 0; background:var(--dim); opacity:.28; }
      .jmHist b.in{ background:var(--jmA); opacity:.75; }
      .jmRail{ position:absolute; left:0; right:0; top:31px; height:4px; border-radius:2px; background:var(--border); }
      .jmRail i{ position:absolute; top:0; height:100%; border-radius:2px; background:var(--jmA); }
      .jmKnob{ position:absolute; top:33px; width:16px; height:16px; margin:-8px 0 0 -8px; padding:0; border:2px solid var(--jmA); border-radius:50%; background:var(--panel); box-shadow:0 1px 3px rgba(0,0,0,.4); cursor:grab; touch-action:none; }
      .jmKnob:hover, .jmKnob.active{ background:var(--jmA); } .jmKnob.active{ cursor:grabbing; }
      .jmKnob span{ position:absolute; bottom:calc(100% + 5px); left:50%; transform:translateX(-50%); padding:1px 6px; border-radius:5px; background:var(--jmA); color:#04120f; font-size:10.5px; font-weight:600; white-space:nowrap; opacity:0; pointer-events:none; }
      .jmKnob:hover span, .jmKnob:focus-visible span, .jmKnob.active span{ opacity:1; }
      .jmEnds{ position:absolute; left:-8px; right:-8px; bottom:0; display:flex; justify-content:space-between; font-size:10px; color:var(--dim); pointer-events:none; }
      .jmFields{ display:flex; flex-wrap:wrap; gap:8px 10px; }
      .jmField{ display:flex; flex-direction:column; gap:3px; } .jmLabel{ font-size:10.5px; color:var(--dim); }
      .jmInput{ display:inline-flex; align-items:center; height:30px; padding:0 4px 0 7px; border:1px solid var(--border); border-radius:7px; background:rgba(127,127,127,.07); }
      .jmInput:focus-within{ border-color:var(--jmA); box-shadow:0 0 0 2px color-mix(in srgb, var(--jmA) 22%, transparent); }
      .jmInput.bad{ border-color:#f6465d; }
      .jmInput i{ font-style:normal; color:var(--dim); opacity:.7; padding:0 1px; } .jmGap{ width:7px; }
      .jmSeg{ width:21px; height:22px; padding:0; border:0; border-radius:3px; background:transparent; color:var(--text); font:inherit; font-variant-numeric:tabular-nums; text-align:center; outline:0; }
      .jmSeg-y{ width:37px; } .jmSeg::placeholder{ color:var(--dim); opacity:.5; font-size:10px; }
      .jmSeg:focus{ background:color-mix(in srgb, var(--jmA) 24%, transparent); }
      .jmCal{ display:inline-flex; margin-left:4px; padding:4px; background:none; border:0; border-radius:5px; color:var(--dim); cursor:pointer; } .jmCal:hover{ color:var(--jmA); }
      .jmChips{ display:flex; flex-wrap:wrap; gap:5px; }
      .jmChip{ height:26px; padding:0 10px; background:none; color:var(--text); border:1px solid var(--border); border-radius:999px; font:inherit; font-size:11.5px; cursor:pointer; }
      .jmChip small{ opacity:.6; font-size:10px; margin-left:2px; } .jmChip:hover{ border-color:var(--jmA); }
      .jmChip.on{ color:var(--jmA); border-color:var(--jmA); background:color-mix(in srgb, var(--jmA) 14%, transparent); font-weight:600; }
      .jmLink{ padding:0; margin-right:8px; background:none; border:0; color:var(--dim); font:inherit; font-size:11px; cursor:pointer; text-decoration:underline; text-underline-offset:2px; } .jmLink:hover{ color:var(--jmA); }
      .jmSeg2{ display:inline-flex; align-self:flex-start; padding:2px; border:1px solid var(--border); border-radius:8px; }
      .jmSeg2 button{ height:24px; padding:0 9px; background:none; border:0; border-radius:6px; color:var(--dim); font:inherit; font-size:11px; cursor:pointer; }
      .jmSeg2 button.on{ background:color-mix(in srgb, var(--jmA) 18%, transparent); color:var(--jmA); font-weight:600; }
      .jmRange :is(button,input):focus-visible{ outline:2px solid var(--jmA); outline-offset:1px; } .jmRange .jmSeg:focus-visible{ outline:0; }
      .jmNone{ color:var(--dim); }
      .jmSigs{ grid-column:1 / -1; border-left:0; border-top:1px solid var(--border); }
      .jmSigHead{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; } .jmSigHead h4{ margin:0; }
      .jmSigCount{ color:var(--dim); font-size:11px; flex:1; }
      .jmSigQ{ width:200px; max-width:100%; padding:3px 7px; background:transparent; color:var(--text); border:1px solid var(--border); border-radius:6px; font:inherit; }
      .jmSigList{ display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:2px 10px; max-height:150px; overflow:auto; }
      .jmSigItem{ display:flex; align-items:center; gap:6px; padding:3px 4px; border-radius:5px; cursor:pointer; }
      .jmSigItem:hover{ background:rgba(127,127,127,.1); } .jmSigItem span{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .jmSigItem small{ color:var(--dim); font-variant-numeric:tabular-nums; } .jmSigItem.zero span{ opacity:.55; }
      .jmSigOnly{ display:none; background:none; border:1px solid var(--border); border-radius:4px; color:var(--dim); font:inherit; font-size:10px; padding:0 4px; cursor:pointer; }
      .jmSigItem:hover .jmSigOnly, .jmSigOnly:focus-visible{ display:inline-block; }
      .jmHidden{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px; border-top:1px solid var(--border); background:rgba(255,183,77,.1); color:#ffcc80; }
      .jmHidden[hidden]{ display:none; } .jmHidden span{ flex:1; min-width:200px; } .jmHidden b{ color:#ffb74d; }
      .jmRange.hidingAll{ border-color:#ffb74d; }
      .jmPicker{ position:absolute; width:0; height:0; padding:0; border:0; opacity:0; pointer-events:none; }
      @media (max-width:1250px){ .jmBody{ grid-template-columns:1fr 1fr; } .jmGroup:nth-child(3){ border-left:0; } .jmGroup:nth-child(n+3){ border-top:1px solid var(--border); } }
      @media (max-width:700px){ .jmBody{ grid-template-columns:1fr; } .jmGroup{ border-left:0; border-top:1px solid var(--border); } .jmGroup:first-child{ border-top:0; } .jmSummary{ display:none; } .jmCount{ margin-left:auto; } }
      @media (prefers-reduced-motion:reduce){ .jmFold svg{ transition:none; } }
    </style>`);
    const excluded = Explorer.excluded, bind = Explorer.bind;
    Explorer.excluded = function(t){ return !JMRange.pass(this, t) || excluded.call(this, t); };
    Explorer.bind = function(host){ bind.call(this, host); try { JMRange.place(this, host); } catch(e){ console.warn('ASTRA range:', e.message); } };
  },
};
JMRange.install();
