/* ASTRA Terminal — where each bot may trade.
   One card per market (Crypto, Forex, Metals, Indices, Energy…). Switch a
   whole market on or off, or go inside it and mark every pair:
     allowed   — the bot may trade it (default)
     ★ preferred — looked at FIRST on every cycle, so when the bot has room
                  for only one or two trades these get the chance before the rest
     ✕ blocked  — never traded by this bot
   Stored on the bot's own settings (groups / preferred / blocked). The
   Prohibited list still has the last word over everything here. */
const BotMarkets = {
  q: {},                                  // search text per bot
  short(sym){ const b = baseAsset(sym); const i = b.lastIndexOf('.'); return i > 0 && b.length - i <= 5 ? b.slice(0, i) : b; },

  /* the pairs a bot's old whitelist (instruments) excluded count as blocked */
  effectiveBlocked(cfg, pool){
    const blocked = new Set(cfg.blocked || []);
    if (cfg.instruments && cfg.instruments.length) for (const s of pool) if (!cfg.instruments.includes(s)) blocked.add(s);
    return blocked;
  },
  stateOf(cfg, sym, blocked){
    if (blocked.has(sym)) return 'blocked';
    if ((cfg.preferred || []).includes(sym)) return 'preferred';
    return 'allowed';
  },

  view(b, cfg){
    const G = Bots.marketGroups();
    const chosen = cfg.groups && cfg.groups.length ? cfg.groups : null;      // null = every market
    const stats = Bots.perInstrument(b.id);
    const resolved = Bots.allowed(b);
    const q = (this.q[b.id] || '').toLowerCase();
    const presets = Object.entries(G).map(([id, g]) =>
      `<button class="bMini${chosen && chosen.length === 1 && chosen[0] === id ? ' on' : ''}" data-mkonly="${esc(id)}" title="Trade ${esc(g.label)} and nothing else">Only ${esc(g.label)}</button>`).join('') +
      `<button class="bMini${!chosen ? ' on' : ''}" data-mkonly="*" title="Every market">All markets</button>`;

    const cards = Object.entries(G).map(([id, g]) => {
      const on = chosen ? chosen.includes(id) : (id !== 'stocks' && id !== 'other');     /* shares and the leftovers are opt-in */
      const blocked = this.effectiveBlocked(cfg, g.syms);
      const pref = g.syms.filter(s => (cfg.preferred || []).includes(s)).length;
      const nBlocked = g.syms.filter(s => blocked.has(s)).length;
      const nLive = g.syms.filter(s => resolved.includes(s)).length;
      const chips = on ? g.syms.filter(s => !q || s.toLowerCase().includes(q) || baseAsset(s).toLowerCase().includes(q)).map(sym => {
        const st = this.stateOf(cfg, sym, blocked);
        const rec = stats[sym];
        const recTxt = rec ? (rec.net >= 0 ? '+' : '') + fmtNum(rec.net) + ' · ' + rec.n + ' trades' : 'no trades yet';
        const live = typeof Feed !== 'undefined' ? Feed.isLive(sym) : true;
        return `<button class="mkPair ${st}${rec ? (rec.net > 0 ? ' good' : rec.net < 0 ? ' bad' : '') : ''}${live ? '' : ' off'}" data-mkpair="${esc(id)}|${esc(sym)}"
          title="${esc(baseAsset(sym) + ' — ' + recTxt + (live ? '' : ' · no live price right now') + ' — click: allowed → ★ preferred → ✕ blocked')}">
          <i>${st === 'preferred' ? '★' : st === 'blocked' ? '✕' : ''}</i>${esc(this.short(sym))}<small>${rec ? (rec.net >= 0 ? '+' : '') + fmtNum(rec.net) : ''}</small></button>`;
      }).join('') : '';
      return `<div class="mkCard${on ? '' : ' off'}">
        <div class="mkCardHead">
          <label class="bsSwitch" title="${on ? 'Switch this whole market off for this bot' : 'Switch this market on for this bot'}"><input type="checkbox" data-mkgroup="${esc(id)}" ${on ? 'checked' : ''}><i></i></label>
          <b>${esc(g.label)}</b>
          <span class="dim2">${(id === 'stocks' || id === 'other') && !on ? (id === 'stocks' ? 'US share CFDs' : 'European share CFDs and anything else the account offers') + ' — off unless you switch them on · ' + g.syms.length + ' names' : on ? nLive + ' tradable now · ' + (g.syms.length - nBlocked) + ' of ' + g.syms.length + ' allowed' + (pref ? ' · ' + pref + ' ★' : '') + (nBlocked ? ' · ' + nBlocked + ' ✕' : '') : 'off — ' + g.syms.length + ' pairs'}</span>
          ${on ? `<span class="mkCardTools">
            <button class="bMini" data-mkall="${esc(id)}|allow" title="Allow every pair in this market">All allowed</button>
            <button class="bMini" data-mkall="${esc(id)}|block" title="Block every pair, then allow the ones you want">All blocked</button>
            <button class="bMini" data-mkall="${esc(id)}|winners" title="Prefer the pairs this bot has actually earned on">★ its winners</button>
          </span>` : ''}
        </div>
        ${on ? `<div class="mkPairs">${chips || '<span class="dim2">nothing matches the search</span>'}</div>` : ''}
      </div>`;
    }).join('');

    const prefAll = (cfg.preferred || []).filter(s => resolved.includes(s));
    return `<div class="mkWrap">
      <div class="mkPresets"><span class="insLbl">Quick</span>${presets}</div>
      <div class="mkSearchRow">
        <input type="search" class="mkSearch" data-mksearch="1" placeholder="Find a pair in the lists below…" value="${esc(this.q[b.id] || '')}">
        <span class="mkLegend"><i class="allowed"></i> allowed <i class="preferred">★</i> preferred — looked at first <i class="blocked">✕</i> blocked</span>
      </div>
      ${cards}
      <div class="mkSummary">This bot may trade <b>${resolved.length}</b> instrument${resolved.length === 1 ? '' : 's'} right now${prefAll.length ? ' — it looks at <b>' + prefAll.map(s => this.short(s)).join(', ') + '</b> first' : ''}.
        Closed markets and the Prohibited list are taken out automatically.</div>
    </div>`;
  },

  bind(host, b){
    const cfg = () => Bots.cfg(b.id);
    const save = () => { Bots.saveCfg(b.id); Bots.render(); };
    host.querySelectorAll('[data-mkonly]').forEach(el => el.addEventListener('click', () => {
      const c = cfg(); const id = el.dataset.mkonly;
      c.groups = id === '*' ? null : [id];
      save(); toast(id === '*' ? WorkspaceUI.name(b) + ' may trade every market' : WorkspaceUI.name(b) + ' now trades ' + Bots.marketGroups()[id].label + ' only', 'ok');
    }));
    host.querySelectorAll('[data-mkgroup]').forEach(el => el.addEventListener('change', () => {
      const c = cfg(); const all = Object.keys(Bots.marketGroups()); const id = el.dataset.mkgroup;
      const dflt = all.filter(g => g !== 'stocks' && g !== 'other');
      let list = (c.groups && c.groups.length) ? c.groups.slice() : dflt.slice();
      list = el.checked ? (list.includes(id) ? list : list.concat([id])) : list.filter(x => x !== id);
      if (!list.length){ toast('A bot needs at least one market', 'warn'); Bots.render(); return; }
      c.groups = (list.length === dflt.length && dflt.every(g => list.includes(g))) ? null : list;
      save();
    }));
    host.querySelectorAll('[data-mkpair]').forEach(el => el.addEventListener('click', () => {
      const c = cfg(); const [gid, sym] = el.dataset.mkpair.split('|');
      const pool = (Bots.marketGroups()[gid] || {}).syms || [];
      /* the old whitelist becomes an explicit blocked list the first time a pair is touched */
      if (c.instruments && c.instruments.length){ c.blocked = [...this.effectiveBlocked(c, Bots.groupSymbols(Object.keys(Bots.marketGroups())))]; c.instruments = null; }
      const blocked = new Set(c.blocked || []), pref = new Set(c.preferred || []);
      const st = this.stateOf(c, sym, blocked);
      if (st === 'allowed'){ pref.add(sym); }
      else if (st === 'preferred'){ pref.delete(sym); blocked.add(sym); }
      else { blocked.delete(sym); }
      c.preferred = [...pref]; c.blocked = [...blocked];
      save();
    }));
    host.querySelectorAll('[data-mkall]').forEach(el => el.addEventListener('click', () => {
      const c = cfg(); const [gid, what] = el.dataset.mkall.split('|');
      const pool = (Bots.marketGroups()[gid] || {}).syms || [];
      if (c.instruments && c.instruments.length){ c.blocked = [...this.effectiveBlocked(c, Bots.groupSymbols(Object.keys(Bots.marketGroups())))]; c.instruments = null; }
      let blocked = new Set(c.blocked || []), pref = new Set(c.preferred || []);
      if (what === 'allow'){ for (const s of pool){ blocked.delete(s); } }
      if (what === 'block'){ for (const s of pool){ blocked.add(s); pref.delete(s); } }
      if (what === 'winners'){
        const stats = Bots.perInstrument(b.id);
        const winners = pool.filter(s => stats[s] && stats[s].net > 0);
        if (!winners.length) return toast('This bot has not earned on any pair in ' + Bots.marketGroups()[gid].label + ' yet', 'warn');
        for (const s of winners){ pref.add(s); blocked.delete(s); }
      }
      c.blocked = [...blocked]; c.preferred = [...pref];
      save();
    }));
    const search = host.querySelector('[data-mksearch]');
    if (search) search.addEventListener('input', () => { this.q[b.id] = search.value; Bots.render(); const s2 = document.querySelector('[data-mksearch]'); if (s2){ s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } });
  },
};
