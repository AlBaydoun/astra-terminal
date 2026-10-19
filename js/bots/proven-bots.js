/* ASTRA Terminal — ★ PROVEN CANDLES paper bots (15m · 1h · 4h).

   They trade exactly the signals the ★ Proven chart tool draws — the same finder
   (ProvenCandles.scan), the same 56 rules from research run 4 (js/research/candle-edges.js):
     · only on the market groups where that timeframe has a proven rule,
     · signal on the last CLOSED candle, entry at the open of the next one, as tested —
       if price has already run more than 0.25 ATR away from that open, the trade is
       skipped (the tested entry is gone; chasing it was never measured),
     · stop beyond the pattern + 0.1 ATR, target = the rule's R multiple, and the rule's
       own time limit (32 / 24 / 12 candles),
     · one trade per signal candle (the engine's session guard), grade A or A+B (setting).

   Paper only. Like every bot, it reaches real money only through the Live desk and its gates. */
const ProvenBots = {
  TF: ['15m', '1h', '4h'],
  GROUP_ID: { indices: 'indices', metals: 'gold', forex: 'forex', energy: 'energy', crypto: 'crypto' },
  NAME_G: { indices: 'indices', metals: 'gold & silver', forex: 'forex', energy: 'oil', crypto: 'crypto' },
  rules(tf, grades){ return typeof CANDLE_EDGES === 'undefined' ? [] : CANDLE_EDGES.rules.filter(r => r.tf === tf && (grades || 'AB').includes(r.grade)); },
  def(tf){
    const R = this.rules(tf), groups = [...new Set(R.map(r => this.GROUP_ID[r.group]))];
    const named = [...new Set(R.map(r => this.NAME_G[r.group]))].join(', ');
    return {
      id: 'proven' + tf, name: '★ Proven candles · ' + tf, proven: true,
      blurb: `Trades only the candle signals that survived research run 4 on ${tf}: ${R.length} rules for ${named}. Entry at the next open as tested, stop beyond the pattern, target and time limit from each rule. Grade A + B by default ("grades": "A" for the strongest only).`,
      defaults: { tf, tfAuto: false, minScore: 0, maxOpen: 3, groups, timeLimitBars: ProvenCandles.MAXB[tf], grades: 'AB' },
      warmup: 900, sessionGuard: true,
      signal: (w, cfg) => this.signal(w, cfg, tf),
    };
  },
  signal(w, cfg, tf){
    if (typeof ProvenCandles === 'undefined') return { dir: 0, failed: ['the Proven candles tool is not loaded'] };
    const sym = cfg.sym, g = ProvenCandles.groupOf(sym);
    if (!g) return { dir: 0, failed: ['no proven candle rules for this market'] };
    const rules = this.rules(tf, cfg.grades).filter(r => r.group === g);
    if (!rules.length) return { dir: 0, failed: ['no proven rule for this market on ' + tf] };
    if (!w || w.length < 900) return { dir: 0, failed: ['warming up (needs ~900 candles for the 800-average)'] };
    const R = ProvenCandles.scan(w, sym, tf, g, rules);
    const s = R.sigs[R.sigs.length - 1];
    if (!s || !s.pending) return { dir: 0, failed: ['no proven candle on the last closed ' + tf + ' candle'] };
    const forming = w[w.length - 1], px = forming.close;
    if (Math.abs(px - forming.open) > 0.25 * s.at) return { dir: 0, failed: [`signal on ${ProvenCandles.NAME[s.fam][s.dir > 0 ? 0 : 1]}, but price already ran ${(Math.abs(px - forming.open) / s.at).toFixed(2)} ATR from the open — the tested entry is gone, skipped`] };
    const r = s.rule, sd = (px - s.stop) * s.dir;
    if (!(sd > 0)) return { dir: 0, failed: ['price is already beyond the stop'] };
    const nm = ProvenCandles.NAME[s.fam][s.dir > 0 ? 0 : 1];
    return {
      dir: s.dir, score: r.grade === 'A' ? 90 : 75, entry: px, sl: s.stop, tp: px + s.dir * r.R * sd,
      session: String(s.sigTime), model: '★' + r.grade + ' ' + nm,
      reasons: ['★' + r.grade + ' ' + nm + ' · ' + tf, r.atoms.length ? r.atoms.map(a => ProvenCandles.ATOM[a]).join(', ') : 'the pattern itself',
        `unseen test: ${r.oos.n} trades, won ${Math.round(r.oos.win)}%, ${r.oos.avgR >= 0 ? '+' : ''}${r.oos.avgR.toFixed(2)}R each, PF ${r.oos.pf}`, 'target ' + r.R + 'R · time limit ' + r.maxBars + ' candles'],
    };
  },
  install(){
    for (const tf of this.TF){
      const b = this.def(tf); if (BOT_BY_ID[b.id]) continue;
      BOTS.push(b); BOT_BY_ID[b.id] = b;
    }
  },
};
ProvenBots.install();
