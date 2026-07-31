/* ASTRA Terminal — chat with the Observer.
   Not a general chatbot: it answers from its real state — analysis, trades,
   news mood, history matches, lessons. Ask 'help' for what it understands. */
const OBChat = {
  hist: lsGet('astra_chat', []),

  init(){
    document.getElementById('chatSend').addEventListener('click', () => this.submit());
    document.getElementById('chatIn').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.submit();
    });
    this.render();
    if (!this.hist.length)
      this.say('ob', "I'm the Observer. Ask me 'what do you think of BTC?', 'why did you buy?', 'how is your fund?', 'what's the news mood?', 'what does history say?' or 'help'.");
  },

  submit(){
    const inp = document.getElementById('chatIn');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = '';
    this.say('you', q);
    this.answer(q.toLowerCase(), q).then(a => this.say('ob', a));
  },

  say(role, text){
    this.hist.push({ role, text, t: Date.now() });
    if (this.hist.length > 30) this.hist.splice(0, this.hist.length - 30);
    lsSet('astra_chat', this.hist);
    this.render();
  },

  findSymbol(qRaw){
    for (const w of qRaw.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)){
      if (w.length >= 2 && w.length <= 6 && STORE.tickers.has(w + 'USDT')) return w + 'USDT';
    }
    return null;
  },

  verdictText(sym, res){
    if (!res) return 'I do not have enough data on ' + baseAsset(sym) + ' yet.';
    const conf = Math.round(res.conf * 100);
    if (!res.dir || conf < 30)
      return baseAsset(sym) + ': no clear signal right now — only ' + res.votes.length + ' of my 18 strategies see anything, and they disagree.';
    const whys = res.votes.filter(v => v.dir === res.dir).slice(0, 3).map(v => v.why).join('; ');
    let txt = baseAsset(sym) + ' looks ' + (res.dir > 0 ? 'UP' : 'DOWN') + ' to me (' + conf + '% confidence, next ' + Brain.HORIZON + ' bars). Because: ' + whys + '.';
    if (res.risk && res.risk.level >= 2)
      txt += ' But careful — ' + res.risk.label + '. ' + res.risk.lesson;
    txt += ' Remember: I am an experiment, not financial advice.';
    return txt;
  },

  async answer(q, qRaw){
    try {
      if (/^help|what can you|how do i/.test(q))
        return "You can ask me: 'what do you think of SOL?' (any coin) · 'why did you buy / sell?' · 'how is your fund doing?' · 'what's the news mood?' · 'what does history say?' · 'what did you learn?' · 'which strategies do you trust?' · 'scan the watchlist'.";

      if (/why.*(buy|bought|sell|sold)|last trade|explain.*trade/.test(q)){
        const tr = Brain.state.fund.trades[0];
        const pos = Object.entries(Brain.state.fund.positions)[0];
        if (!tr && !pos) return 'I have not traded yet. I buy only when a strong signal (55%+ confidence) appears.';
        let a = '';
        if (pos){
          const note = Brain.state.notes.find(n => n.id === pos[1].noteId);
          a += 'I am holding ' + (+pos[1].qty.toPrecision(5)) + ' ' + baseAsset(pos[0]) + ' from ' + fmtPrice(pos[1].entry) +
            (note ? ' because: ' + (note.whys || []).join('; ') + ' (' + note.conf + '% signal). ' : '. ');
        }
        if (tr) a += 'My last closed trade: ' + baseAsset(tr.sym) + ' ' + fmtPrice(tr.entry) + ' → ' + fmtPrice(tr.exit) +
          ', ' + (tr.pnl >= 0 ? 'profit ' : 'loss ') + (tr.pnl >= 0 ? '+' : '') + tr.pnl + ' USDT after ' + tr.fees + ' in fees (' + tr.reason + ').';
        return a;
      }

      if (/fund|balance|performance|profit|p.?l|how.*(doing|going)/.test(q)){
        const f = Brain.state.fund;
        const eq = Brain.fundEquity();
        const pnl = eq - f.start;
        const w = f.trades.filter(t => t.pnl > 0).length;
        return 'My fund: equity ' + fmtNum(eq) + ' USDT (' + (pnl >= 0 ? '+' : '') + fmtNum(pnl) + ' since start), cash ' + fmtNum(f.balance) +
          ', ' + f.trades.length + ' closed trades' + (f.trades.length ? ' (' + Math.round(w / f.trades.length * 100) + '% winners)' : '') +
          ', total fees paid ' + fmtNum(f.fees) + ' USDT. ' +
          (Object.keys(f.positions).length ? 'Open now: ' + Object.keys(f.positions).map(baseAsset).join(', ') + '.' : 'No open positions.');
      }

      if (/news|mood|sentiment|atmosphere|headlines/.test(q)){
        if (!Intel.newsFresh()) return 'My news feed is not available right now — I judge only by the charts at the moment.';
        const s = Intel.sentiment;
        let a = 'News mood is ' + (s > 25 ? 'clearly positive' : s < -25 ? 'clearly negative' : 'mixed') + ' (' + (s > 0 ? '+' : '') + s + ' on my -100..+100 scale). ';
        const worst = [...Intel.news].sort((x, y) => x.score - y.score)[0];
        const best = [...Intel.news].sort((x, y) => y.score - x.score)[0];
        if (best && best.score > 1) a += 'Most positive story: "' + best.title.slice(0, 80) + '" (' + best.source + '). ';
        if (worst && worst.score < -1) a += 'Most negative: "' + worst.title.slice(0, 80) + '" (' + worst.source + '). ';
        if (Intel.risk.level) a += '⚠ ' + Intel.risk.label + ' — ' + Intel.risk.lesson;
        return a;
      }

      if (/histor|similar|analog|past|before|war|echo/.test(q)){
        let a = '';
        if (Intel.analogs && Intel.analogs.picked.length){
          const p = Intel.analogs.picked[0];
          a += 'The market\'s last 30 days most resemble ' + new Date(p.t).toLocaleDateString() +
            ' (' + (p.corr * 100).toFixed(0) + '% match) — 30 days after that moment BTC moved ' + fmtPct(p.fwd) +
            '. Across my ' + Intel.analogs.picked.length + ' closest matches the average outcome was ' + fmtPct(Intel.analogs.avgFwd) + '. ';
        } else a += 'I found no strong historical twin for the current pattern. ';
        if (Intel.risk.level && Intel.risk.event)
          a += 'Today\'s headlines echo "' + Intel.risk.event.name + '" (' + Intel.risk.event.date + '): ' + Intel.risk.event.lesson;
        else a += 'And nothing in today\'s news matches my history book of shocks — that is good.';
        return a;
      }

      if (/learn|journal|lesson|mistake/.test(q)){
        const logs = Brain.state.log.slice(0, 3).map(l => l.msg);
        return logs.length ? 'My latest lessons: ' + logs.join(' — ') : 'Nothing learned yet — lessons appear when my calls get graded.';
      }

      if (/strateg|trust|weight|which.*work/.test(q)){
        const sorted = [...Brain.STRATS].sort((a, b) => Brain.w(b.id) - Brain.w(a.id));
        const top = sorted.slice(0, 3).map(s => s.name + ' (' + Brain.w(s.id).toFixed(2) + ')').join(', ');
        const low = sorted.slice(-2).map(s => s.name + ' (' + Brain.w(s.id).toFixed(2) + ')').join(', ');
        return 'Right now I trust most: ' + top + '. Least: ' + low + '. Trust shifts every time a call is graded or I research a chart\'s history.';
      }

      if (/scan|radar|watchlist/.test(q)){
        Brain.scan(true);
        return 'Scanning your watchlist now — results land in the radar (OBSERVER panel) and strong ones become signal notes.';
      }

      const sym = this.findSymbol(qRaw);
      if (sym || /think|opinion|analy|forecast|predict|view/.test(q)){
        const target = sym || STORE.symbol;
        if (target === STORE.symbol) return this.verdictText(target, Brain.analyze(Chart.raw));
        const d = await API.klines(target, STORE.tf, 220);
        return this.verdictText(target, Brain.analyze(d));
      }

      return "I didn't catch that — try 'help' to see what I can answer.";
    } catch(e){
      return 'Something went wrong while I was thinking: ' + e.message;
    }
  },

  render(){
    const host = document.getElementById('obChatLog');
    if (!host) return;
    host.innerHTML = this.hist.slice(-12).map(m =>
      `<div class="chatMsg ${m.role}">${esc(m.text)}</div>`).join('');
    host.scrollTop = host.scrollHeight;
  },
};
