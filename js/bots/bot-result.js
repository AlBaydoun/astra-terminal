/* ASTRA Terminal — "Net result" on every bot's own page.

   The Deep Dive's top picture, for this bot alone, right where you look at
   the bot — and underneath it the bot's open trades. Two parts, each can be
   folded, and the whole panel folds to a single line that still says how the
   bot stands (net · trades · win rate · open now). Remembered per bot.

     1. Closed trades — net result, won · lost, profit factor, today, best ·
        worst, streaks, deepest dip, hand closes. Every number opens the Deep
        Dive already narrowed to this bot and to that number's trades.
     2. Open trades — the bot's live position cards (the same cards as the
        Open Trades page: live P/L, stop and target, On chart, close).

   Reading only, except the position cards, which behave exactly as before. */
const BotResult = {
  KEY: 'astra_botresult',
  state(id){ const all = lsGet(this.KEY, {}) || {}; return all[id] || {}; },
  set(id, part, folded){
    const all = lsGet(this.KEY, {}) || {}; const s = all[id] || (all[id] = {});
    if (folded) s[part] = true; else delete s[part];
    if (!Object.keys(s).length) delete all[id];
    lsSet(this.KEY, all);
  },

  view(id, L){
    if (typeof Explorer === 'undefined') return '';
    const S = this.state(id);
    const rows = Explorer.all().filter(t => t.bot === id);
    const st = Explorer.stats(rows);
    const openRows = typeof OpenTrades !== 'undefined' ? OpenTrades.all().filter(r => r.bot === id) : [];
    const unreal = openRows.reduce((a, r) => { try { return a + (OpenTrades.live(r).unreal || 0); } catch(e){ return a; } }, 0);
    const openForHero = typeof BotDash !== 'undefined' ? BotDash.allOpen().filter(t => t.bot === id) : [];
    const money = v => (v >= 0 ? '+' : '') + fmtNum(v);
    const summary = `<span class="brSum"><b class="${st.net >= 0 ? 'up' : 'down'}">${money(st.net)}</b> · ${st.n} closed · ${Math.round(st.winPct)}% won · <b class="${unreal >= 0 ? 'up' : 'down'}">${openRows.length} open${openRows.length ? ' ' + money(unreal) : ''}</b></span>`;
    const part = (key, title, sub, body) => `<div class="brPart${S[key] ? ' folded' : ''}" data-brpart="${key}">
        <button type="button" class="brPartHead" data-brfold="${esc(id)}|${key}" aria-expanded="${!S[key]}"><i>${S[key] ? '▸' : '▾'}</i><b>${title}</b><span>${sub}</span></button>
        <div class="brPartBody"${S[key] ? ' hidden' : ''}>${body}</div>
      </div>`;
    const closed = rows.length ? Explorer.hero(rows, st, openForHero)
      : `<div class="empty">No closed trades yet${openRows.length ? ' — ' + openRows.length + ' still open below' : ''}. The picture fills in as trades close.</div>`;
    return `<section class="brWrap${S.all ? ' folded' : ''}" data-brbot="${esc(id)}">
      <div class="brHead">
        <button type="button" class="brFold" data-brfold="${esc(id)}|all" aria-expanded="${!S.all}" title="${S.all ? 'Unfold' : 'Fold'} the net result">${S.all ? '▸' : '▾'}</button>
        <b>Net result</b><span class="dim2">from the Deep Dive — press any number to open its trades</span>
        ${summary}
        <button type="button" class="bMini" data-brdive="${esc(id)}" title="Open this bot in the Deep Dive — split it by pair, day, hour, side…">Deep Dive ↗</button>
      </div>
      <div class="brBody"${S.all ? ' hidden' : ''}>
        ${part('closed', 'Closed trades', st.n + ' trade' + (st.n === 1 ? '' : 's') + ' · ' + money(st.net), closed)}
        ${part('open', 'Open trades', openRows.length + ' open' + (openRows.length ? ' · ' + money(unreal) + ' right now' : '') + ' — the bot runs them; step in whenever you like',
          `<section id="botPositions">${OpenTrades.view(id)}</section>`)}
      </div>
    </section>`;
  },
};

/* one listener for every bot page (the page is rebuilt every few seconds) */
document.addEventListener('click', e => {
  const t = e.target.closest ? e.target : null; if (!t) return;
  const f = t.closest('[data-brfold]');
  if (f){
    e.preventDefault();
    const [id, key] = f.dataset.brfold.split('|');
    const wrap = f.closest(key === 'all' ? '.brWrap' : '.brPart');
    const folded = !wrap.classList.contains('folded');
    wrap.classList.toggle('folded', folded);
    const body = wrap.querySelector(key === 'all' ? ':scope > .brBody' : ':scope > .brPartBody'); if (body) body.hidden = folded;
    f.setAttribute('aria-expanded', String(!folded));
    const arrow = key === 'all' ? f : f.querySelector('i'); if (arrow) arrow.textContent = folded ? '▸' : '▾';
    BotResult.set(id, key, folded);
    return;
  }
  const d = t.closest('[data-brdive]');
  if (d){ e.preventDefault(); Explorer.openBot(d.dataset.brdive); return; }
  /* a number in the picture → the Deep Dive, narrowed to this bot, then to that number */
  const a = t.closest('.brWrap .exHero [data-exact]');
  if (a){
    e.preventDefault(); e.stopPropagation();
    const id = a.closest('[data-brbot]').dataset.brbot, act = a.dataset.exact;
    if (act === 'open'){ const p = a.closest('.brWrap').querySelector('[data-brpart="open"]'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    Explorer.openBot(id);
    if (act && act !== 'list') setTimeout(() => Explorer.act(act), 60); else Explorer.act('list');
  }
});
