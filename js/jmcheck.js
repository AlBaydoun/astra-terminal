/* ASTRA Terminal — ✦ CHECK: risk, filings and news for the open chart, in one card.

   Built from three trader skills, adapted to a MetaTrader account:
     RISK     trader-risk's rules read against your live account: price available,
              spread, what the smallest lot would risk, margin, duplicate positions,
              positions open, crowding in one market, today's result.
     FILINGS  trader-analyst: the last quarter as filed with the SEC. US shares only.
     NEWS     trader-news: 8-K filings and Yahoo headlines for a share, or matching
              items from ASTRA's market news for anything else.

   On the chart: a dashed line at each filing date, a dot at each headline's time,
   and the stop distance the risk rows are worked out from.

   The verdict is a rules check for a trade you are already considering. It has no
   opinion on direction and it is not a signal. A headline is a lead, not a fact.
   Read only: this file has no order path. Limits are yours, in ⚙. */
const JMCheck = {
  KEY: 'astra_check',
  DEF: { on: false, card: true, marks: true, stopLines: true, showRisk: true, showFilings: true, showNews: true,
         stopAtr: 1.5, maxRiskPct: 1, spreadWarn: 10, spreadBlock: 25, maxOpen: 5, maxGroup: 2, maxDayLossPct: 2 },
  cfg(){ return Object.assign({}, this.DEF, lsGet(this.KEY, {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._cardSig = ''; this.syncBtn(); if (typeof Draw !== 'undefined') Draw.redraw(); },
  base(s){ return String(s || '').replace(/\.[A-Za-z]{1,4}$/, '').toUpperCase(); },
  isShare(sym){
    try { const g = Bots.groupOfAny(sym); if (g) return g === 'stocks' || g === 'other'; } catch(e){}
    return false;
  },

  /* ---------- account, refreshed gently while the card is on ---------- */
  acct: { positions: null, deals: null, at: 0 },
  async refreshAccount(){
    if (this._acctBusy || Date.now() - this.acct.at < 20000 || !Feed.bridge) return;
    this._acctBusy = true;
    try {
      const get = async p => { const r = await fetch(Feed.BRIDGE_URL + p, { cache: 'no-store', signal: AbortSignal.timeout(4000) }); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
      const [p, d, h] = await Promise.all([get('/positions'), get('/deals?days=2'), get('/health')]);
      this.acct = { positions: p.positions || [], deals: d.deals || [], free: h.margin_free ?? (h.account && h.account.margin_free) ?? null, at: Date.now() };
    } catch(e){ this.acct = { positions: null, deals: null, at: Date.now() }; }
    this._acctBusy = false;
    this._cardSig = ''; Draw.redraw();
  },

  /* ---------- filings and headlines, once per share per 10 minutes ---------- */
  _res: {},
  research(sym){
    const t = this.base(sym), hit = this._res[t];
    if (hit && (hit.wait || Date.now() - hit.at < 600000)) return hit.data || null;
    this._res[t] = { wait: true, data: hit && hit.data };
    const base = Feed.apiReady ? (Feed.apiBase || '') : null;
    if (base == null){ this._res[t] = { at: Date.now(), data: { ticker: t, offline: true } }; return this._res[t].data; }
    fetch(base + '/api/research?ticker=' + encodeURIComponent(t), { cache: 'no-store', signal: AbortSignal.timeout(45000) })
      .then(r => r.ok ? r.json() : { offline: true, ticker: t })
      .catch(() => ({ offline: true, ticker: t }))
      .then(data => { this._res[t] = { at: Date.now(), data }; this._cardSig = ''; Draw.redraw(); });
    return hit && hit.data || null;
  },
  WORDS: [
    [/^XAU|GOLD/, /\bgold\b|\bbullion\b/i], [/^XAG/, /\bsilver\b/i], [/^XPT/, /\bplatinum\b/i],
    [/^(WTI|BRENT|XTI|XBR)/, /\boil\b|\bcrude\b|\bOPEC\b|\bbrent\b/i], [/^(NATGAS|XNG)/, /natural gas/i],
    [/^(BTC)/, /\bbitcoin\b|\bcrypto/i], [/^ETH/, /\bethereum\b|\bether\b|\bcrypto/i],
    [/^(US100|USTEC|NAS)/, /\bnasdaq\b|\bwall street\b|\bfed\b/i], [/^(US500|SPX)/, /\bs&p\b|\bwall street\b|\bfed\b/i], [/^US30/, /\bdow\b|\bwall street\b|\bfed\b/i],
    [/^(GER|DE4|EU50|EUSTX|FR4|FRA)/, /\bECB\b|\beurope|\beurozone\b|\bgerman/i], [/^(UK100)/, /\bFTSE\b|\bBank of England\b|\bBritain\b|\bUK\b/i],
    [/^(JP|JPN)/, /\bNikkei\b|\bBank of Japan\b|\bJapan/i], [/^(HK|CHA|CHINA)/, /\bHang Seng\b|\bChina\b/i],
  ],
  CCY: { USD: /\bFed\b|\bFederal Reserve\b|\bdollar\b|\bTreasur|\bpayroll/i, EUR: /\bECB\b|\beuro\b|\beurozone\b/i, GBP: /\bBank of England\b|\bsterling\b|\bpound\b/i, JPY: /\bBank of Japan\b|\byen\b/i, CHF: /\bSNB\b|\bSwiss\b/i, AUD: /\bRBA\b|\bAustralia/i, CAD: /\bBank of Canada\b|\bCanad/i, NZD: /\bRBNZ\b|\bNew Zealand\b/i },
  marketNews(sym){
    const b = this.base(sym); let tests = this.WORDS.filter(w => w[0].test(b)).map(w => w[1]);
    if (!tests.length && /^[A-Z]{6}$/.test(b)) tests = [this.CCY[b.slice(0, 3)], this.CCY[b.slice(3)]].filter(Boolean);
    if (!tests.length || typeof MarketNews === 'undefined') return [];
    return (MarketNews.data && MarketNews.data.items || []).filter(n => n.title && tests.some(t => t.test(n.title)))
      .map(n => ({ title: n.title, link: n.url, host: n.source || '', time: n.publishedAt, tags: [] }))
      .sort((x, y) => (y.time || 0) - (x.time || 0)).slice(0, 5);
  },

  /* ---------- the risk rules ---------- */
  risk(sym, C){
    const rows = [], add = (k, label, value, note) => rows.push({ k, label, value, note });
    const v = Chart.view ? Chart.view() : Chart.raw, c = v.slice(0, -1), atr = c.length > 20 ? IND.atr(c, 14)[c.length - 1] : null;
    const q = Bots.quoteFor(sym), px = (q && q.price) || (c.length ? c[c.length - 1].close : null);
    const stopDist = atr ? atr * C.stopAtr : null;
    add(q ? 'ok' : 'block', 'Price', q ? 'live' : 'none', q ? 'A tradable price is available now.' : 'No tradable live price: the session may be closed.');
    if (q && stopDist){
      const share = q.spread / stopDist * 100;
      add(share >= C.spreadBlock ? 'block' : share >= C.spreadWarn ? 'warn' : 'ok', 'Spread', share.toFixed(1) + '% of stop', 'Limit ' + C.spreadBlock + '%. Spread is ' + q.spread.toPrecision(3) + ' against a ' + C.stopAtr + ' ATR stop.');
    } else add('off', 'Spread', '—', 'Needs a live price and ATR.');
    const spec = Feed.specFor ? Feed.specFor(sym) : null, A = Feed.account || {}, bal = A.balance;
    if (!spec && Feed.bridgeHas && Feed.bridgeHas(sym) && !this._specAsked){ this._specAsked = sym; Feed.loadSpecs([sym]).then(() => { this._specAsked = null; this._cardSig = ''; Draw.redraw(); }); }
    const worth = spec && (spec.pointValue > 0 ? spec.pointValue : null);
    if (worth && stopDist && bal > 0 && spec.volumeMin > 0){
      const loss = stopDist * worth * spec.volumeMin, pct = loss / bal * 100;
      add(pct > C.maxRiskPct ? 'block' : pct > C.maxRiskPct * 0.75 ? 'warn' : 'ok', 'Smallest lot', pct.toFixed(2) + '% risk', spec.volumeMin + ' lot loses about ' + loss.toFixed(2) + ' ' + (A.currency || '') + ' at the stop. Limit ' + C.maxRiskPct + '%.');
      const lots = Math.floor((bal * C.maxRiskPct / 100) / (stopDist * worth) / spec.volumeStep) * spec.volumeStep;
      if (lots >= spec.volumeMin) rows[rows.length - 1].note += ' Your limit allows up to ' + (+lots.toFixed(4)) + ' lot.';
      const lev = A.leverage, free = this.acct.free;
      if (lev > 0 && free != null && px){
        const m = px * worth * spec.volumeMin / lev;
        add(m > free ? 'block' : m > free * 0.5 ? 'warn' : 'ok', 'Margin', m.toFixed(2) + ' needed', 'Estimate for the smallest lot. Free margin ' + (+free).toFixed(2) + '.');
      }
    } else add('off', 'Smallest lot', '—', 'Needs broker specifications and your balance from the MT5 bridge.');
    const P = this.acct.positions;
    if (P){
      const same = P.filter(p => this.base(p.symbol) === this.base(sym));
      add(same.length ? 'block' : 'ok', 'Duplicate', same.length ? same.length + ' open' : 'none', same.length ? 'You already hold this instrument on the broker.' : 'Nothing open on this instrument.');
      add(P.length >= C.maxOpen ? 'block' : 'ok', 'Positions', P.length + ' of ' + C.maxOpen, 'Open on the broker account.');
      let g = null; try { g = Bots.groupOfAny(sym); } catch(e){}
      if (g){ const n = P.filter(p => { try { return Bots.groupOfAny(p.symbol) === g; } catch(e){ return false; } }).length;
        add(n >= C.maxGroup ? 'block' : 'ok', 'Same market', n + ' of ' + C.maxGroup, 'Open positions in this market group.'); }
    } else add('off', 'Positions', '—', 'Could not read the broker positions.');
    if (this.acct.deals && bal > 0){
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const net = this.acct.deals.filter(d => d.time * 1000 >= from.getTime()).reduce((s, d) => s + (d.profit || 0) + (d.commission || 0) + (d.swap || 0) + (d.fee || 0), 0), pct = net / bal * 100;
      add(pct <= -C.maxDayLossPct ? 'block' : 'ok', 'Today', (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', 'Closed result today. Stop at −' + C.maxDayLossPct + '%.');
    }
    return { rows, atr, stopDist, px };
  },

  verdict(R, res){
    const blocks = R.rows.filter(r => r.k === 'block').map(r => r.label), warns = R.rows.filter(r => r.k === 'warn').map(r => r.label);
    const F = (res && res.sec && res.sec.filings) || [], age = f => (Date.now() - Date.parse(f.date)) / 86400000;
    const severe = F.find(f => f.severe && age(f) <= 7), important = F.find(f => f.important && age(f) <= 3);
    if (severe) blocks.push('8-K: ' + severe.labels.join(', '));
    else if (important) warns.push('recent 8-K: ' + important.labels.join(', '));
    if (blocks.length) return { k: 'STOP', col: '#f6465d', why: 'Blocked by ' + blocks.join(', ') + '.' };
    if (warns.length) return { k: 'CAUTION', col: '#eda100', why: 'Look again at ' + warns.join(', ') + '.' };
    if (!R.rows.some(r => r.k === 'ok')) return { k: 'NOT CHECKED', col: '#9aa7b8', why: 'The account could not be read.' };
    if (R.rows.some(r => r.k === 'off')) return { k: 'PARTLY CHECKED', col: '#9aa7b8', why: 'No rule is broken, but some could not be read.' };
    return { k: 'RULES PASS', col: '#2ebd85', why: 'Your limits allow a trade here. This says nothing about direction.' };
  },

  money(v){ if (v == null) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a.toFixed(0)); },
  pc(v){ return v == null ? '' : ' (' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%)'; },
  link(url, text){ let u = ''; try { const x = new URL(url); if (x.protocol === 'https:') u = x.href; } catch(e){} return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : esc(text); },
  ago(t){ if (!t) return ''; const h = (Date.now() - t) / 3600000; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd'; },
  DOT: { ok: '#2ebd85', warn: '#eda100', block: '#f6465d', off: 'rgba(160,160,160,.5)' },
  sect(t){ return '<div class="fcHead" style="margin-top:9px">' + t + '</div>'; },

  card(sym, R, res, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('jmChkCard');
    if (!C.card){ if (el) el.remove(); return; }
    const V = this.verdict(R, res), share = this.isShare(sym);
    let b = '<div class="fcHead">✦ CHECK · ' + esc(baseAsset(sym)) + ' ' + esc(STORE.tf) + '</div>' +
      '<div class="fcBig" style="color:' + V.col + '">' + V.k + '</div><p>' + esc(V.why) + '</p>';
    if (C.showRisk){
      b += this.sect('Risk');
      for (const r of R.rows) b += '<div style="margin-top:5px"><div style="display:flex;justify-content:space-between;gap:8px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:' + this.DOT[r.k] + '"></span>' + esc(r.label) + '</span><b style="white-space:nowrap">' + esc(r.value) + '</b></div><div style="opacity:.65;font-size:10.5px;margin-left:14px">' + esc(r.note) + '</div></div>';
    }
    const S = res && res.sec;
    if (C.showFilings && share){
      b += this.sect('Filed numbers');
      if (!res) b += '<p>Reading SEC filings…</p>';
      else if (res.offline) b += '<p>The ASTRA data service is not running.</p>';
      else if (!S || S.status !== 'ok') b += '<p>' + esc((S && S.why) || 'Not available.') + '</p>';
      else if (!S.quarters.length) b += '<p>' + esc(S.name) + ' has no XBRL quarters to read.</p>';
      else { const q = S.quarters[0];
        b += '<p><b>' + esc(S.name) + '</b>, quarter to ' + esc(q.end) + (q.derived ? ' (Q4 derived from the year)' : '') + '<br>Revenue ' + this.money(q.revenue) + this.pc(q.revenueYoY) + '<br>Net income ' + this.money(q.netIncome) + this.pc(q.netIncomeYoY) +
          (q.eps != null ? '<br>Diluted EPS ' + q.eps.toFixed(2) + this.pc(q.epsYoY) : '') + (q.grossMargin != null ? '<br>Gross margin ' + q.grossMargin.toFixed(1) + '%' : '') + (q.opMargin != null ? ' · operating ' + q.opMargin.toFixed(1) + '%' : '') + '</p>' +
          '<p style="opacity:.65;font-size:10.5px">Growth is against the same quarter a year earlier.' + (q.oneOff ? ' Net income is above operating income, so one-offs are inside it.' : '') + (S.lag ? ' A newer filing exists than these numbers: read it directly.' : '') + '</p>'; }
    }
    if (C.showNews){
      b += this.sect(share ? 'Filings and headlines' : 'Related market news');
      const F = (S && S.filings || []).filter(f => f.form === '8-K').slice(0, 3);
      for (const f of F) b += '<p style="margin:3px 0">' + (f.important ? '<b style="color:#eda100">!</b> ' : '') + this.link(f.url, '8-K ' + f.date) + (f.labels.length ? ' · ' + esc(f.labels.join(', ')) : '') + '</p>';
      const N = share ? (res && res.headlines || []) : this.marketNews(sym);
      for (const n of N.slice(0, 4)) b += '<p style="margin:3px 0">' + this.link(n.link, n.title) + ' <span style="opacity:.6">' + esc(n.host || '') + (n.time ? ' · ' + this.ago(n.time) : '') + (n.tags && n.tags.length ? ' · ' + esc(n.tags.join(', ')) : '') + '</span></p>';
      if (!F.length && !N.length) b += '<p>' + (share && !res ? 'Reading…' : 'Nothing matched for this instrument.') + '</p>';
      if (share && res && res.newsStatus && res.newsStatus !== 'ok' && res.newsStatus !== 'skipped') b += '<p>Headlines unavailable: ' + esc(res.newsStatus) + '.</p>';
    }
    b += '<p style="opacity:.6;font-size:10.5px;margin-top:8px">A rules check, not a signal or advice. Headlines are leads: open them before relying on them. Drag this card anywhere.</p>';
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="jmChkCard" class="fcCard" style="width:310px;left:12px;right:auto;top:52px"></div>');
      el = document.getElementById('jmChkCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    }
    if (b !== el._html){ el.innerHTML = b; el._html = b; }
  },

  draw(ctx){
    const C = this.cfg();
    if (!C.on){ document.getElementById('jmChkCard')?.remove(); return; }
    if (typeof Chart === 'undefined' || !Chart.priceSeries || !Chart.raw.length) return;
    const sym = STORE.symbol; this.refreshAccount();
    const share = this.isShare(sym), res = share ? this.research(sym) : null;
    let R; try { R = this.risk(sym, C); } catch(e){ console.warn('ASTRA check:', e.message); return; }
    /* the card only rewrites when its text changes, so this stays cheap */
    try { this.card(sym, R, res, C); } catch(e){ console.warn('ASTRA check card:', e.message); }
    const Y = p => Chart.priceSeries.priceToCoordinate(p), H = Draw.cssH, W = Draw.cssW;
    /* real time to the candle holding it: the chart may shift candle times, and the
       time scale only answers for whole candles */
    const last = Chart.raw[Chart.raw.length - 1], shift = last.time - (last.rawTime || last.time);
    const TX = sec => { const l = Draw.logicalFor(sec + shift); return l == null ? null : Chart.main.timeScale().logicalToCoordinate(Math.round(l)); };
    ctx.save();
    ctx.font = '600 10px sans-serif'; ctx.textBaseline = 'top';
    if (C.marks && res && res.sec && res.sec.filings){
      for (const f of res.sec.filings){
        const x = TX(Date.parse(f.date) / 1000); if (x == null || x < 0 || x > W) continue;
        const col = f.severe ? '#f6465d' : f.important ? '#eda100' : '#7f93ad';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(f.form + (f.important ? ' !' : ''), x, 20);
      }
    }
    const N = C.marks ? (share ? (res && res.headlines || []) : this.marketNews(sym)) : [];
    for (const n of N){ if (!n.time) continue; const x = TX(n.time / 1000); if (x == null || x < 0 || x > W) continue;
      ctx.beginPath(); ctx.arc(x, H - 34, 3.5, 0, 7); ctx.fillStyle = '#00e5ff'; ctx.fill(); }
    if (C.stopLines && R.stopDist && R.px){
      for (const [p, t] of [[R.px + R.stopDist, 'stop distance'], [R.px - R.stopDist, 'stop distance']]){
        const y = Y(p); if (y == null) continue;
        ctx.beginPath(); ctx.moveTo(W * .6, y); ctx.lineTo(W, y); ctx.strokeStyle = 'rgba(154,167,184,.6)'; ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#9aa7b8'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(t + ' ' + C.stopAtr + ' ATR', W * .6 + 4, y - 1);
      }
    }
    ctx.restore();
  },

  syncBtn(){ const b = document.getElementById('jmChkBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.acct.at = 0; this.save(c); },
  panel(){
    let el = document.getElementById('jmChkPanel'); if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => '<label><input type="checkbox" data-ck="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>';
    const num = (k, t, min, max, step) => '<label>' + t + ' <input type="number" data-cn="' + k + '" value="' + c[k] + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>';
    document.body.insertAdjacentHTML('beforeend', '<div id="jmChkPanel" class="autoSrPanel asPanel"><b>Check</b><div class="srLook"><b>What to show</b>' +
      chk('card', 'The check card') + chk('showRisk', 'Risk rows') + chk('showFilings', 'Filed numbers') + chk('showNews', 'Filings and headlines') + chk('marks', 'Filing lines and news dots on the chart') + chk('stopLines', 'Stop distance lines') +
      '</div><div class="srLook"><b>Your limits</b>' + num('stopAtr', 'Stop distance (ATR)', 0.5, 6, 0.25) + num('maxRiskPct', 'Most risk per trade (%)', 0.1, 10, 0.1) + num('spreadWarn', 'Spread caution (% of stop)', 1, 50, 1) + num('spreadBlock', 'Spread stop (% of stop)', 1, 100, 1) +
      num('maxOpen', 'Most positions open', 1, 100, 1) + num('maxGroup', 'Most in one market', 1, 50, 1) + num('maxDayLossPct', 'Stop after today’s loss (%)', 0.5, 50, 0.5) + '</div></div>');
    el = document.getElementById('jmChkPanel');
    const apply = e => { const t = e.target, v = this.cfg();
      if (t.dataset.ck) v[t.dataset.ck] = t.checked;
      else if (t.dataset.cn){ if (t.value === '' || !Number.isFinite(+t.value) || +t.value <= 0) return; v[t.dataset.cn] = +t.value; } else return;
      v.on = true; this.save(v); };
    el.addEventListener('change', apply);
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#jmChkPanel, #jmChkCfg')){ document.getElementById('jmChkPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('jmSigCfg') || document.getElementById('jmRegCfg');
  if (!after || document.getElementById('jmChkBtn')) return;
  after.insertAdjacentHTML('afterend', '<button id="jmChkBtn" class="bMini autoSrBtn' + (JMCheck.cfg().on ? ' on' : '') + '" title="Risk rules, SEC filed numbers and news for this chart, in one card. A rules check, not a signal">✦ Check</button><button id="jmChkCfg" class="bMini" title="Check settings and limits">⚙</button>');
  document.getElementById('jmChkBtn').addEventListener('click', () => JMCheck.toggle());
  document.getElementById('jmChkCfg').addEventListener('click', () => JMCheck.panel());
});
