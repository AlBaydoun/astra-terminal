/* Timurila — what is known about each strategy, and how it is known.
   Two sources, kept apart:
     · EARLIER: figures already measured inside ASTRA (research runs 2 and 4, js/stregime.js, and the
       signal tests of 5 to 9 Nov 2026). Copied here as they were reported.
     · RUN 5: Timurila's own research run (research/run.cjs -> research/results.js), read live. */
(() => {
  const P = 'pass', F = 'fail', W = 'wait';
  const EARLIER = [
    { id: 'st_metals', stage: 'proven', name: 'SuperTrend Regime · gold and silver 4h', line: 'PF 2.15 against 1.26 random · 66 trades', match: s => /^(XAU|XAG)USD/.test(T.base(s)),
      note: 'Measured on gold and silver, 4-hour candles. Profit factor (PF) is money won divided by money lost.',
      checks: [['Enough trades', '66', P], ['Beats random entries', '2.15 against 1.26', P], ['Holds in both halves', '1.92 and 2.56', P], ['Still pays at double spread', '2.09', P],
        ['Works in both directions', 'buy 2.75 · sell 1.41', P], ['More than one market', 'gold 2.53 · silver 1.81', P], ['Paper record of 40 trades', 'not started', W], ['Shadow run on live prices', 'not started', W]],
      verdict: 'Proven in research. A paper record comes next, then a shadow run, before any real money.' },
    { id: 'p_snap', stage: 'proven', name: 'Indices snap-back · 4h', line: '58.0% right against 48.9% by chance · 833 calls', match: s => T.groupOf(s) === 'indices',
      note: 'When an index is over-stretched on the 4-hour chart it tends to snap back. Found in research run 2.',
      checks: [['Enough calls', '833', P], ['Right more often than chance', '58.0% against 48.9%', P], ['Holds in both halves', '57.3% and 58.6%', P], ['Across markets', '9 of 9 indices', P],
        ['Profit factor', '1.40', P], ['Has a bot', 'not built', W], ['Paper record of 40 trades', 'not started', W], ['Shadow run on live prices', 'not started', W]],
      verdict: 'Proven in research, but no bot trades it yet.' },
    { id: 'p_candles', stage: 'proven', name: 'Proven candles', line: '56 rules kept from 247,680 setups',
      note: 'Candle setups that survived data they had never seen and a test against shuffled fakes. Research run 4. Shares were not part of it.',
      checks: [['Setups tested', '247,680', P], ['Survived unseen data', '1,068', P], ['Bar set above luck', '93 lucky fakes', P], ['Still pays at double spread', 'all 56', P],
        ['Grades', '13 A · 43 B', P], ['Shadow run on live prices', 'not started', W]],
      verdict: 'Proven in research. The live record is still too short to judge.' },
    { id: 'l_range', stage: 'leaning', name: 'Forex range-edge · 4h', line: 'Leaning in research run 2', note: 'Fading the edges of a range on forex pairs, 4-hour candles.',
      checks: [['Showed a lean in research run 2', 'yes', P], ['Cleared the proof bar', 'not yet', W]], verdict: 'Leaning. Needs a larger sample before it can be called proven.' },
    { id: 'l_gold', stage: 'leaning', name: 'Gold daily momentum', line: 'Leaning in research run 2', note: 'Following gold in the direction of its daily move.',
      checks: [['Showed a lean in research run 2', 'yes', P], ['Cleared the proof bar', 'not yet', W]], verdict: 'Leaning. Needs a larger sample before it can be called proven.' },
    { id: 'l_stfx', stage: 'leaning', name: 'SuperTrend Regime · forex majors 4h', line: 'PF 1.21 against 1.03 random · 288 trades', note: 'The rule that is proven on gold and silver, measured on the forex majors.',
      checks: [['Enough trades', '288', P], ['Beats random entries', '1.21 against 1.03', P], ['Margin over random', 'thin', W]], verdict: 'Leaning. The margin over random is thin.' },
    { id: 'b_labels', stage: 'benched', name: 'Signal Labels bot', line: '−0.08R a trade over 1,216 trades', note: 'Trades the TD9, TD13, divergence, CHoCH and BOS labels. 1-hour candles, 12 markets.',
      checks: [['Enough trades', '1,216', P], ['Beats random entries', '−0.083R against −0.059R', F], ['Holds in both halves', 'PF 0.95 and 0.91', F], ['Across markets', '3 of 12', F]], verdict: 'Benched. It loses slightly more than random entries do.' },
    { id: 'b_trend', stage: 'benched', name: 'Trend Labels bot', line: '−0.05R a trade over 1,310 trades', note: 'Trades the UT Bot, Chandelier and squeeze labels.',
      checks: [['Enough trades', '1,310 on 1h', P], ['Profit factor above 1', '0.96', F], ['Other timeframes', '15m −0.194R · 4h −0.045R', F]], verdict: 'Benched. Negative on every timeframe measured.' },
    { id: 'b_regime', stage: 'benched', name: 'Regime bots', line: 'Lost to random on 1,349 signals', note: 'Three bots built on the regime readings: squeeze, vortex and fade.',
      checks: [['Enough signals', '1,349', P], ['Beats random entries', 'no', F]], verdict: 'Benched. The regime readings stay as a description of the market, not as a trigger.' },
    { id: 'b_signals', stage: 'benched', name: 'Signals rule', line: '0 of 36 charts passed · 1,102 calls', note: 'RSI pullback in the direction of the trend.',
      checks: [['Enough calls', '1,102', P], ['Charts that passed', '0 of 36', F]], verdict: 'Benched. It stays on the chart as a drawing aid only.' },
  ];
  const MACRO = ['forex', 'metals', 'energy', 'indices', 'crypto'];
  const groupsOf = id => id === 'snap4h_other' || id === 'rsi2_macro' ? ['forex', 'metals', 'energy', 'crypto'] : /_shares$|^rotation/.test(id) ? ['shares'] : /_indices$/.test(id) ? ['indices'] : /_macro$/.test(id) ? MACRO : /_forex$/.test(id) ? ['forex'] : [];
  const DIP_KIN = ['ibs_indices', 'down3_indices', 'bb_indices', 'rsi2_4h_indices'];

  T.research = () => (typeof window.TIMURILA_RESEARCH !== 'undefined' ? window.TIMURILA_RESEARCH : null);
  T.strategies = () => {
    const out = EARLIER.map(s => Object.assign({ origin: 'Measured earlier inside ASTRA' }, s)), R = T.research();
    if (R) for (const t of R.tests){
      const stage = t.verdict === 'proven' ? 'proven' : t.verdict === 'leaning' ? 'leaning' : 'benched', g = groupsOf(t.id), failed = (t.checks || []).filter(c => !c.pass).map(c => c.label.toLowerCase());
      out.push({ id: 'r' + (t.run || 5) + '_' + t.id, stage, isNew: true, runNo: t.run || 5, run5: t, name: t.name, line: (t.id === 'pairs' ? t.instruments + ' close pairs' : t.universe.replace(/ · daily.*$| · 4-hour$| · monthly.*$/, '')) + (t.avgR != null ? ' · ' + T.signed(t.exR, 2) + 'R above random · ' + T.num(t.n, 0) + ' trades' : ' · too few trades'),
        note: t.rule, source: t.source, universe: t.universe, origin: 'Timurila research round ' + (t.run || 5),
        match: t.id === 'intraday_mom_us' ? s => /^US(500|100|30)$/.test(T.base(s)) : g.length ? s => g.includes(T.groupOf(s)) : null,
        checks: (t.checks || []).map(c => [c.label, c.value, c.pass ? P : F]),
        verdict: (t.verdict === 'proven' ? 'Passed every check. Next: a paper record, then a shadow run, before any real money.'
          : t.verdict === 'leaning' ? 'Leaning: it beats random entries in both halves, but fails on ' + failed.join('; ') + '. With ' + R.tests.length + ' rules tested at once, one reaching this level by luck would not be unusual, so it needs a paper record before it counts.'
          : t.verdict === 'not enough trades' ? 'Too few trades to judge.' : 'Benched. It fails on ' + failed.join('; ') + '.')
          + (DIP_KIN.includes(t.id) ? ' It is a close relative of the round 5 dip rule: the same dips seen through a different trigger, not a second independent discovery.' : '')
          + (/^nr7_/.test(t.id) ? ' Daily candles cannot say which side broke first on a day that broke both ways. Those days are counted the cautious way here, as the worse of the two possible trades.' : '') });
    }
    /* run 5 re-tested the indices snap-back on older history; if that did not hold, say so and move it down */
    const snap = R && R.tests.find(t => t.id === 'snap4h_indices'), ps = out.find(s => s.id === 'p_snap');
    if (snap && snap.h1 && ps && !(snap.h1.exR > 0 && snap.avgR > 0)){
      ps.stage = 'leaning'; ps.downgraded = true; ps.line = 'Right in 2024 to 2026 · no edge in 2019 to 2024';
      ps.checks = ps.checks.filter(c => c[2] !== W).concat([
        ['Timurila re-test, last two years', T.num(snap.h2.hit, 1) + '% against ' + T.num(snap.h2.baseHit, 1) + '% by chance', P],
        ['Timurila re-test, 2019 to Oct 2024', T.num(snap.h1.hit, 1) + '% against ' + T.num(snap.h1.baseHit, 1) + '% by chance', F],
        ['Makes money after the spread, all years', T.signed(snap.avgR, 3) + 'R a trade', snap.avgR > 0 ? P : F]]);
      ps.verdict = 'Moved from proven to leaning. It beat chance in the two years the earlier research looked at, and Timurila’s re-test agrees for those years. On the five years before, which that research never saw, it did no better than chance.';
    }
    return out;
  };
  T.queued = () => { const R = T.research();
    return R ? R.notTested.map((q, i) => ({ id: 'q' + i, stage: 'queued', name: q.name, line: 'Not tested yet', note: q.why, checks: [['Tested on your own markets', 'not yet', W]], verdict: 'Not tested. Nothing is assumed to work until it passes the same court.', origin: 'Waiting' }))
      : ['Trend following', 'Dip buying', 'Turn of the month', 'Share rotation', 'Pairs', 'Carry', 'Session-open drift'].map((n, i) => ({ id: 'q' + i, stage: 'queued', name: n, line: 'Research run 5 has not finished', note: 'Waiting for the research run.', checks: [['Tested on your own markets', 'not yet', W]], verdict: 'Not tested yet.', origin: 'Waiting' })); };
  T.onFile = (sym, stage) => T.strategies().filter(s => s.stage === stage && s.match && s.match(sym));
  T.STAGES = { proven: { label: 'Proven', color: 'var(--amber)', about: 'Beat random entries, in both halves, at double cost.' }, leaning: { label: 'Leaning', color: 'var(--cyan)', about: 'Shows a lean, has not cleared the bar.' },
    queued: { label: 'Queued', color: 'var(--text2)', about: 'Not tested on your markets yet.' }, benched: { label: 'Benched', color: 'var(--down-text)', about: 'Tested and did not beat random entries.' } };
})();
