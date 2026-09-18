/* ASTRA Terminal — "How to trade with the live desk": a worked, illustrated
   walk-through. Opened from the 📘 button on the Live page. Every example uses
   the reader's own numbers where the desk knows them (bot money, risk, rules),
   so the pictures describe the desk as it is set right now. Reading only —
   nothing here can arm, send or change anything. */
const DeskHowTo = {

  open(){
    let m = document.getElementById('ldHowModal');
    if (!m){
      document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="ldHowModal"><div class="mBox bgBox">
        <div class="mHead"><span>HOW TO TRADE WITH THE LIVE DESK</span> <span>WORKED EXAMPLES</span><button class="mClose">×</button></div>
        <div class="mBody" id="ldHowBody"></div></div></div>`);
      m = document.getElementById('ldHowModal');
      m.querySelector('.mClose').addEventListener('click', () => m.classList.remove('show'));
      m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); });
    }
    const body = document.getElementById('ldHowBody');
    body.innerHTML = this.html();
    body.querySelectorAll('.hwNav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = body.querySelector(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    body.scrollTop = 0;
    m.classList.add('show');
  },

  /* the reader's own numbers, when the desk has them */
  nums(){
    const S = typeof LiveDesk !== 'undefined' ? LiveDesk.load() : null;
    const a = S ? LiveDesk.account() : { balance: 800.5, currency: 'USD', known: false };
    const bal = a.known ? a.balance : 800.5;
    const pool = S ? (LiveDesk.budget() || 100) : 100;
    const risk = S ? S.riskPct : 1, riskCash = +(pool * risk / 100).toFixed(2);
    const X = S ? S.exit : { targetPct: 0.5, onTarget: 'lock', lockPct: 0.1, trail: true, trailGapPct: 0.3, trailFrom: 'lock' };
    return { bal, pool, risk, riskCash, cur: a.currency || 'USD', X, daily: S ? S.maxDailyLossPct : 5, maxOpen: S ? S.maxOpen : 3, side: S ? (S.side || 'both') : 'both' };
  },

  html(){
    const n = this.nums(), f = fmtNum;
    return `<div class="hwWrap">
      <div class="hwNav">
        <a href="#hw1">1 · The money</a><a href="#hw2">2 · One trade, start to end</a><a href="#hw3">3 · Buy, sell, or both</a>
        <a href="#hw4">4 · Shaping a bot</a><a href="#hw5">5 · Reading the picture</a><a href="#hw6">6 · A day on the desk</a><a href="#hw7">7 · When it says no</a><a href="#hw8">8 · Checklist</a>
      </div>
      <p class="dim">The numbers below are yours as the desk is set right now (${f(n.pool)} ${esc(n.cur)} of bot money, ${n.risk}% per trade, target +${n.X.targetPct}%). Change a setting and reopen this page — the examples follow.</p>

      ${this.sec1(n)}${this.sec2(n)}${this.sec3(n)}${this.sec4(n)}${this.sec5(n)}${this.sec6(n)}${this.sec7(n)}${this.sec8(n)}
    </div>`;
  },

  /* ---------- 1 · the money ---------- */
  sec1(n){
    const f = fmtNum;
    const w = 560, poolW = Math.max(30, Math.min(w, w * n.pool / Math.max(n.bal, n.pool))), riskW = Math.max(6, poolW * n.risk / 100);
    return `<section class="hwSec" id="hw1"><h3><i>💰</i>1 · The money — three boxes, one inside the other</h3>
      <p>Your account is one box. The <b>bot money</b> is a smaller box inside it that you hand to the bots. Each trade may only risk a slice of that smaller box. Nothing the bots do can reach outside their box.</p>
      <svg class="hwSvg" viewBox="0 0 640 150">
        <rect x="40" y="20" width="${w}" height="70" rx="8" fill="rgba(120,150,220,.10)" stroke="#8fa3c8"/><text x="48" y="36" class="hwT b">YOUR ACCOUNT · ${f(n.bal)} ${esc(n.cur)}</text>
        <rect x="40" y="50" width="${poolW.toFixed(0)}" height="40" rx="6" fill="rgba(0,229,255,.14)" stroke="#00e5ff"/><text x="48" y="66" class="hwT ac b">BOT MONEY · ${f(n.pool)}</text>
        <rect x="40" y="76" width="${riskW.toFixed(0)}" height="14" rx="3" fill="rgba(246,70,93,.4)" stroke="#f6465d"/><text x="${(48 + riskW).toFixed(0)}" y="87" class="hwT dn">one trade may lose ${f(n.riskCash)} (${n.risk}%)</text>
        <text x="40" y="112" class="hwT">the other ${f(Math.max(0, n.bal - n.pool))} ${esc(n.cur)} is invisible to the bots</text>
        <text x="40" y="128" class="hwT">lose the ${f(n.pool)} → the desk switches itself off · lose ${n.daily}% of it in a day → no new trades today</text>
        <text x="40" y="144" class="hwT">at most ${n.maxOpen} real position${n.maxOpen === 1 ? '' : 's'} at once</text>
      </svg>
      <div class="hwEx"><b class="t">Example · how big is an order?</b>
        The desk never picks a size by feel. It asks: <i>how far is the stop, and what does one lot lose over that distance?</i> Then it buys as many lots as keep the loss under ${f(n.riskCash)} ${esc(n.cur)}.
        <table class="hwTable"><thead><tr><th>Pair</th><th>Price</th><th>Stop 0.5% away</th><th>1 lot loses</th><th>Lots for ${f(n.riskCash)}</th><th>Broker minimum</th><th>Result</th></tr></thead><tbody>
          <tr><td>ETHUSD</td><td>2,500</td><td>12.50</td><td>12.50 (contract = 1 ETH)</td><td>${(n.riskCash / 12.5).toFixed(2)}</td><td>0.01</td><td><span class="hwPill up">${n.riskCash / 12.5 >= 0.01 ? 'fits' : 'too small'}</span> ${n.riskCash / 12.5 >= 0.01 ? Math.floor(n.riskCash / 12.5 * 100) / 100 + ' lot' : ''}</td></tr>
          <tr><td>EURUSD</td><td>1.0800</td><td>0.0054</td><td>540 (contract = 100,000)</td><td>${(n.riskCash / 540).toFixed(4)}</td><td>0.01 (= 5.40 at risk)</td><td>${n.riskCash >= 5.4 ? '<span class="hwPill up">fits</span>' : '<span class="hwPill dn">refused</span> the smallest order already risks 5.40'}</td></tr>
          <tr><td>XAUUSD</td><td>2,600</td><td>13.00</td><td>1,300 (contract = 100 oz)</td><td>${(n.riskCash / 1300).toFixed(4)}</td><td>0.01 (= 13.00 at risk)</td><td>${n.riskCash >= 13 ? '<span class="hwPill up">fits</span>' : '<span class="hwPill dn">refused</span> needs ' + f(13 / n.risk * 100) + ' of bot money at ' + n.risk + '%'}</td></tr>
        </tbody></table>
        <span class="dim">That is what the <b>What fits the money</b> bars show for every pair the desk may trade. A refused pair costs nothing — the bot simply never trades it until the bot money or the risk is bigger.</span></div>
    </section>`;
  },

  /* ---------- 2 · one trade start to end ---------- */
  sec2(n){
    const X = n.X, f = fmtPrice;
    const entry = 2500, dir = 1;
    const sl = entry * (1 - 0.005), target = entry * (1 + X.targetPct / 100), lock = entry * (1 + X.lockPct / 100);
    const best = entry * (1 + (X.targetPct + 0.6) / 100), trail = best * (1 - X.trailGapPct / 100);
    const y = v => (130 - (v - sl) / (best * 1.002 - sl) * 110).toFixed(1);
    const lots = Math.max(0.01, Math.floor(n.riskCash / 12.5 * 100) / 100);
    const money = px => ((px - entry) * lots).toFixed(2);
    const exitMode = X.onTarget === 'exit';
    return `<section class="hwSec" id="hw2"><h3><i>🎯</i>2 · One trade, from the first tick to the last</h3>
      <p>A BUY on ETHUSD at 2,500 with the bot’s stop 0.5% below, ${lots} lot, under your exit rules (target +${X.targetPct}% → ${exitMode ? 'exit at the market' : 'lock the stop at +' + X.lockPct + '%'}${X.trail ? ', then trail ' + X.trailGapPct + '% behind the best price' : ''}).</p>
      <svg class="hwSvg" viewBox="0 0 640 170">
        <line x1="60" x2="600" y1="${y(entry)}" y2="${y(entry)}" stroke="#8fa3c8" stroke-dasharray="4 3"/><text x="8" y="${(+y(entry) + 3).toFixed(0)}" class="hwT">entry 2,500</text>
        <line x1="60" x2="600" y1="${y(sl)}" y2="${y(sl)}" stroke="#f6465d"/><text x="8" y="${(+y(sl) + 3).toFixed(0)}" class="hwT dn">stop ${f(sl)}</text>
        <line x1="60" x2="600" y1="${y(target)}" y2="${y(target)}" stroke="#ffd166" stroke-dasharray="2 3"/><text x="8" y="${(+y(target) + 3).toFixed(0)}" class="hwT tr">+${X.targetPct}% ${f(target)}</text>
        ${exitMode ? '' : `<line x1="300" x2="600" y1="${y(lock)}" y2="${y(lock)}" stroke="#2ebd85"/><text x="304" y="${(+y(lock) - 3).toFixed(0)}" class="hwT up">stop locked +${X.lockPct}% = ${f(lock)}</text>`}
        ${!exitMode && X.trail ? `<line x1="440" x2="600" y1="${y(trail)}" y2="${y(trail)}" stroke="#2ebd85" stroke-dasharray="3 2"/><text x="444" y="${(+y(trail) + 11).toFixed(0)}" class="hwT up">trail ${f(trail)}</text>` : ''}
        <path d="M60 ${y(entry * 0.999)} C 120 ${y(entry * 1.001)}, 170 ${y(entry * 0.997)}, 230 ${y(entry * 1.002)} S 290 ${y(target)}, 300 ${y(target)} ${exitMode ? '' : `S 380 ${y(entry * 1.004)}, 440 ${y(best)} S 520 ${y(best * 0.999)}, 600 ${y(trail * 1.0005)}`}" fill="none" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="60" cy="${y(entry)}" r="4" fill="#8fa3c8"/><text x="66" y="${(+y(entry) - 8).toFixed(0)}" class="hwT b">① entry</text>
        <circle cx="300" cy="${y(target)}" r="4" fill="#ffd166"/><text x="250" y="${(+y(target) - 8).toFixed(0)}" class="hwT b">② target reached</text>
        ${exitMode ? `<text x="310" y="${(+y(target) + 14).toFixed(0)}" class="hwT up">③ closed at the market · +${money(target)}</text>` : `<circle cx="440" cy="${y(best)}" r="4" fill="#2ebd85"/><text x="400" y="${(+y(best) - 8).toFixed(0)}" class="hwT b">③ best price</text>
        <text x="600" y="${(+y(trail * 1.0005) + 18).toFixed(0)}" class="hwT b" text-anchor="end">④ price turns → stop hit · +${money(trail)}</text>`}
      </svg>
      <div class="hwSteps">
        <div class="hwStep"><i>①</i><b>Entry</b><span>The bot fires; the desk sizes ${lots} lot so the stop costs ≤ ${fmtNum(n.riskCash)}; the order goes to the broker with the stop attached. From now on the stop holds even with the PC off.</span></div>
        <div class="hwStep"><i>②</i><b>Target +${X.targetPct}%</b><span>${exitMode ? 'The desk closes at the market: +' + money(target) + ' banked. Done.' : 'The desk tells the broker to move the stop to ' + f(lock) + ' (+' + X.lockPct + '%). The trade can no longer lose.'}</span></div>
        ${exitMode ? '' : `<div class="hwStep"><i>③</i><b>Trailing</b><span>${X.trail ? 'Every time price makes a new best, the stop follows ' + X.trailGapPct + '% behind it — only ever upward, never back.' : 'Trailing is off — the locked stop and the bot’s own target decide the rest.'}</span></div>
        <div class="hwStep"><i>④</i><b>Exit</b><span>Price turns and hits the trailed stop at ${f(trail)}: +${money(trail)} banked instead of watching it fade back to zero.</span></div>`}
      </div>
      <div class="hwEx warn"><b class="t">The same trade going wrong</b>Price never reaches +${X.targetPct}% and falls to the stop instead: −${fmtNum(n.riskCash)} — the slice you allowed, nothing more. Three such losses in a row on a bad day = −${fmtNum(n.riskCash * 3)}; at −${fmtNum(n.pool * n.daily / 100)} (${n.daily}% of the bot money) the desk stops opening new trades until tomorrow.</div>
      <div class="hwEx bad"><b class="t">The honest part</b>A stop is a request, not a promise. In a gap (weekend open, news) the broker fills the stop at the next price, which can be worse. That is why the bot money is money you can afford to lose.</div>
    </section>`;
  },

  /* ---------- 3 · buy, sell, both ---------- */
  sec3(n){
    const chart = (dir, x) => {
      const e = 100, sl = dir > 0 ? 140 : 58, tp = dir > 0 ? 52 : 146;
      return `<g transform="translate(${x} 0)">
        <rect x="0" y="6" width="300" height="186" rx="8" fill="rgba(120,150,220,.06)" stroke="#2a3550"/>
        <text x="12" y="24" class="hwT b">${dir > 0 ? '▲ BUY — you profit when price RISES' : '▼ SELL — you profit when price FALLS'}</text>
        <line x1="12" x2="288" y1="${e}" y2="${e}" stroke="#8fa3c8" stroke-dasharray="4 3"/><text x="14" y="${e - 4}" class="hwT">entry</text>
        <line x1="12" x2="288" y1="${sl}" y2="${sl}" stroke="#f6465d"/><text x="14" y="${sl + (dir > 0 ? 12 : -4)}" class="hwT dn">stop — ${dir > 0 ? 'below' : 'above'} the entry</text>
        <line x1="12" x2="288" y1="${tp}" y2="${tp}" stroke="#2ebd85"/><text x="14" y="${tp + (dir > 0 ? -4 : 12)}" class="hwT up">target — ${dir > 0 ? 'above' : 'below'} the entry</text>
        <path d="M40 ${e} C 90 ${e + (dir > 0 ? 12 : -12)}, 140 ${e + (dir > 0 ? -5 : 5)}, 190 ${dir > 0 ? tp + 14 : tp - 14} S 240 ${tp + (dir > 0 ? 6 : -6)}, 282 ${tp + (dir > 0 ? 4 : -4)}" fill="none" stroke="#00e5ff" stroke-width="2.5"/>
        <text x="150" y="172" class="hwT" text-anchor="middle">the desk ${dir > 0 ? 'raises' : 'lowers'} the stop toward profit,</text>
        <text x="150" y="184" class="hwT" text-anchor="middle">never the other way</text>
      </g>`;
    };
    return `<section class="hwSec" id="hw3"><h3><i>⇅</i>3 · Buy, sell, or both</h3>
      <p>Every bot can signal in both directions: a <b>BUY</b> when it expects price to rise, a <b>SELL</b> when it expects price to fall. On a CFD account selling is as ordinary as buying — you do not need to own anything first. The desk treats both the same way, mirrored.</p>
      <svg class="hwSvg" viewBox="0 0 640 200">${chart(1, 14)}${chart(-1, 326)}</svg>
      <p>The <b>Direction</b> chips in the Exit rules card (the desk’s default${n.side !== 'both' ? ' — yours is <b>' + esc(n.side) + ' only</b>' : ' — yours is <b>buy and sell</b>'}) and inside each bot (▸ shape it → 0 · Direction) let you say: <span class="hwPill up">▲ buy only</span> <span class="hwPill dn">▼ sell only</span> <span class="hwPill">⇅ both</span>. A signal on the wrong side is dropped before it counts.</p>
      <div class="hwEx"><b class="t">Example · a sell-only bot</b>You believe gold is in a downtrend this month. Open <i>Pattern · Gold &amp; Silver</i>, set its direction to ▼ sell only, keep the desk default at ⇅ for everyone else. From then on that bot’s BUY signals are ignored and only its SELLs reach the gates; every other bot still trades both ways.</div>
      <div class="hwEx"><b class="t">Example · a whole desk that only buys</b>Set the desk’s default to ▲ buy only. Every bot without its own choice now buys only; a bot you gave “⇅ both” inside its panel keeps selling.</div>
    </section>`;
  },

  /* ---------- 4 · shaping a bot ---------- */
  sec4(n){
    return `<section class="hwSec" id="hw4"><h3><i>🪆</i>4 · Shaping a bot — the matryoshka</h3>
      <p>Tick a bot and it runs exactly like its paper twin. Open it (<b>▸ shape it</b>) and you can decide, layer by layer, where and how it works. Anything you do not touch stays <b>automatic</b>.</p>
      <svg class="hwSvg" viewBox="0 0 640 150">
        ${[['BOT', 'Bullish Engulfing', 20, '#00e5ff'], ['MARKETS', 'Crypto ✓ Forex ✓ Metals ✗', 175, '#8b6cff'], ['PAIRS', 'ETH ✓ BTC ✓ BCH ✗ …', 330, '#ffd166'], ['TIMEFRAMES', '15m ✓ 1h ✓', 485, '#2ebd85']].map(([t, x2, x, c], i) =>
          `<rect x="${x}" y="30" width="140" height="80" rx="10" fill="rgba(8,13,28,.4)" stroke="${c}"/><text x="${x + 70}" y="52" text-anchor="middle" class="hwT b" style="fill:${c}">${t}</text><text x="${x + 70}" y="76" text-anchor="middle" class="hwT">${x2}</text>${i < 3 ? `<text x="${x + 152}" y="76" class="hwT b">›</text>` : ''}`).join('')}
        <text x="320" y="132" text-anchor="middle" class="hwT">+ direction · + its own stops and exit rules · anything untouched = automatic</text>
      </svg>
      <table class="hwTable"><thead><tr><th>You leave it…</th><th>What happens</th></tr></thead><tbody>
        <tr><td>Everything automatic</td><td>The bot’s paper signals are handed to the desk as they happen. Same pairs, same timeframe, same moments as on paper.</td></tr>
        <tr><td>You tick markets or pairs, or add a timeframe</td><td>The desk <b>runs the bot itself</b>: the same strategy function, on the pairs and timeframes you ticked, once per closed candle, through the Master Brain and the live gates. The paper twin keeps trading on paper, untouched; its signals are not doubled.</td></tr>
        <tr><td>You give it its own stops / exit rules / direction</td><td>Only that bot’s trades follow them; the desk defaults still cover the others.</td></tr>
      </tbody></table>
      <div class="hwEx"><b class="t">Example · crypto only, on 1h, sell and buy</b>Open <i>Bearish Engulfing Bot</i> → untick every market except Crypto → inside Crypto untick the pairs you never want → tick 1h (15m stays ticked or not, your call) → leave direction on ⇅. The desk now looks at each crypto pair on the hour and hands every qualifying signal to the gates, sized from the bot money.</div>
      <div class="hwEx warn"><b class="t">Worth knowing</b>A bot on a timeframe it was never tested on is an experiment. Keep such a bot in shadow for a while and read its record before trusting it with real money.</div>
    </section>`;
  },

  /* ---------- 5 · reading the picture ---------- */
  sec5(n){
    const rows = [['signals seen', 14, '#8fa3c8'], ['passed your rules', 9, '#00e5ff'], ['passed the ceilings', 6, '#ffd166'], ['sent / written down', 6, '#2ebd85']];
    return `<section class="hwSec" id="hw5"><h3><i>📡</i>5 · Reading “What is happening”</h3>
      <p>Once the desk is armed, the top card is the live picture. Everything in it refreshes by itself.</p>
      <svg class="hwSvg" viewBox="0 0 640 150">
        <circle cx="50" cy="50" r="22" fill="rgba(120,150,220,.12)" stroke="#00e5ff"/><circle cx="50" cy="50" r="30" fill="none" stroke="#00e5ff" opacity=".5"/><circle cx="50" cy="50" r="38" fill="none" stroke="#00e5ff" opacity=".2"/>
        <text x="90" y="40" class="hwT b">a pulsing ring = the bot looked at the market in the last 90 s</text><text x="90" y="56" class="hwT">“last look 12s ago” · what it runs · how many pairs · its last event</text>
        <text x="90" y="72" class="hwT">the four numbers: signals · shadow · real · refused — today</text>
        ${rows.map(([l, v, c], i) => `<text x="20" y="${104 + i * 12}" class="hwT">${l}</text><rect x="150" y="${96 + i * 12}" width="${v * 14}" height="8" rx="4" fill="${c}"/><text x="${156 + v * 14}" y="${104 + i * 12}" class="hwT">${v}</text>`).join('')}
        <text x="400" y="104" class="hwT b">the funnel</text><text x="400" y="118" class="hwT">14 signals → 9 passed your markets, pairs,</text><text x="400" y="130" class="hwT">direction and money → 6 passed the hard ceilings</text><text x="400" y="142" class="hwT">→ 6 were sent (or written down in shadow)</text>
      </svg>
      <p><b>The bot money in motion</b>: how much sits in open stops (what you lose if every stop is hit), how much margin is tied up, how much is left, and today’s result against the daily stop. The <b>money curve</b> draws itself from the first closed real trade. The <b>ticker</b> at the bottom scrolls the last events; hover it to pause.</p>
    </section>`;
  },

  /* ---------- 6 · a day on the desk ---------- */
  sec6(n){
    const ev = [['08:00', 'You start ASTRA and the bridge', '#8fa3c8'], ['08:02', 'Desk already armed from yesterday · SHADOW', '#00e5ff'], ['09:15', 'Bot A: BUY ETH 15m — written down', '#00e5ff'], ['10:40', 'Bot B: SELL EURUSD — refused: spread', '#ffb03a'], ['12:00', 'You type TRADE REAL MONEY', '#f6465d'], ['13:25', 'Bot A: REAL BUY ETH 0.05 lot · ticket 4471', '#f6465d'], ['14:10', 'target +0.5% → stop locked +0.1%', '#2ebd85'], ['15:30', 'trailed stop hit · +1.42 banked', '#2ebd85'], ['18:00', 'Back to shadow for the night', '#00e5ff']];
    return `<section class="hwSec" id="hw6"><h3><i>🕒</i>6 · A day on the desk</h3>
      <svg class="hwSvg" viewBox="0 0 640 ${40 + ev.length * 18}">
        <line x1="70" x2="70" y1="20" y2="${20 + ev.length * 18}" stroke="#2a3550"/>
        ${ev.map(([t, txt, c], i) => `<circle cx="70" cy="${28 + i * 18}" r="4" fill="${c}"/><text x="14" y="${31 + i * 18}" class="hwT">${t}</text><text x="84" y="${31 + i * 18}" class="hwT" style="fill:${c}">${esc(txt)}</text>`).join('')}
      </svg>
      <p class="dim">The desk needs ASTRA and the bridge running to open new trades and to move stops. A stop or target already at the broker holds even when everything here is off — that is why every real order carries its stop from the first second.</p>
    </section>`;
  },

  /* ---------- 7 · when it says no ---------- */
  sec7(n){
    return `<section class="hwSec" id="hw7"><h3><i>🚧</i>7 · When the desk says no</h3>
      <p>Every refusal is written once per bot and pair in the desk’s log, in plain words. The usual ones:</p>
      <table class="hwTable"><thead><tr><th>The log says…</th><th>It means</th><th>What to do</th></tr></thead><tbody>
        <tr><td>outside the markets and pairs you allow</td><td>Your ticks inside the bot, the desk defaults or a blocked pair keep it out.</td><td>Nothing, if that is what you wanted. Otherwise open the bot and tick the market or pair.</td></tr>
        <tr><td>the smallest size the broker accepts would risk X — above your limit</td><td>The pair is too big for the bot money at this risk.</td><td>Raise the bot money or the risk %, or leave the pair to bigger accounts. See “What fits the money”.</td></tr>
        <tr><td>already holding N real positions / already in PAIR</td><td>Your “positions at once” limit, or one trade per pair.</td><td>Wait, or raise the limit — the hard ceiling below the desk caps it too.</td></tr>
        <tr><td>the desk lost X today — daily stop reached</td><td>Today’s losses reached ${n.daily}% of the bot money.</td><td>Nothing today. Tomorrow it starts again.</td></tr>
        <tr><td>buying/selling is switched off for BOT</td><td>Direction set to one side.</td><td>Change the Direction chips if you meant both.</td></tr>
        <tr><td>spread … above the limit</td><td>The pair is expensive to trade right now (night, news, weekend).</td><td>Nothing — it passes again when the spread narrows.</td></tr>
        <tr><td>vetoed by the Master Brain</td><td>The learned model saw a bad context.</td><td>Nothing. It only ever vetoes or shrinks.</td></tr>
        <tr><td>the live bridge is not running / code not entered</td><td>Gate 1 or 2 is closed.</td><td>Start START-LIVE-TRADING.bat and enter its six digits in step 1.</td></tr>
      </tbody></table>
    </section>`;
  },

  /* ---------- 8 · checklist ---------- */
  sec8(n){
    return `<section class="hwSec" id="hw8"><h3><i>✅</i>8 · The checklist before real money</h3>
      <div class="hwSteps">
        <div class="hwStep"><i>💰</i><b>Bot money you can lose</b><span>Set it, and mean it.</span></div>
        <div class="hwStep"><i>📏</i><b>Pairs that fit</b><span>Green bars in “What fits the money”. Red ones will just be refused.</span></div>
        <div class="hwStep"><i>🎯</i><b>Exit rules you understand</b><span>Read section 2 with your own numbers.</span></div>
        <div class="hwStep"><i>🤖</i><b>Bots with a record</b><span>Dots on the right of each bot. Few dots = little evidence.</span></div>
        <div class="hwStep"><i>👁</i><b>Days in shadow</b><span>Read the log. Would you have taken those trades?</span></div>
        <div class="hwStep"><i>🔴</i><b>Then, and only then</b><span>START-LIVE-TRADING.bat · the code · TRADE REAL MONEY.</span></div>
      </div>
      <p class="dim">Sections on the Live page fold (▾), move (▲▼ or drag the title), and can take half the width (⇹), so the page can be arranged around what you watch most. “↺ layout” puts everything back.</p>
    </section>`;
  },
};
