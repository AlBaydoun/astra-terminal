/* ASTRA data service: filings and headlines for one share, for the ✦ Check card.

   Reads fixed public addresses only. The ticker is validated and there is no
   arbitrary-URL proxy. SEC requires a contact in the User-Agent, taken from the
   SEC_USER_AGENT environment variable; without it filings are skipped and the
   reason is returned, and headlines still work.

   Ported from the trader-analyst and trader-news skills: filed numbers come from
   XBRL, Q4 is the 10-K year minus three quarters and marked derived, growth is
   against the same quarter a year earlier. */
const CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenuesNetOfInterestExpense',
            'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'],
  grossProfit: ['GrossProfit'],
  operating: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'],
};
const ITEMS = {
  '1.01': 'material agreement', '1.02': 'agreement ended', '1.03': 'bankruptcy', '1.05': 'cybersecurity incident',
  '2.01': 'acquisition or sale of assets', '2.02': 'earnings results', '2.03': 'new debt', '2.04': 'debt acceleration',
  '2.05': 'restructuring costs', '2.06': 'impairment', '3.01': 'delisting notice', '3.02': 'unregistered share sale',
  '3.03': 'shareholder rights change', '4.01': 'auditor change', '4.02': 'past financials no longer reliable',
  '5.01': 'change in control', '5.02': 'director or officer change', '5.03': 'bylaws or fiscal year change',
  '5.07': 'shareholder vote results', '7.01': 'Regulation FD disclosure', '8.01': 'other events',
};
const IMPORTANT = new Set(['1.03', '1.05', '2.02', '2.04', '2.06', '3.01', '4.02', '5.01', '5.02']);
const SEVERE = new Set(['1.03', '3.01', '4.02']);
const TAGS = [
  ['earnings', /\bearnings\b|\bresults\b|\bEPS\b|\bguidance\b|\bforecast\b/i],
  ['legal', /\blawsuit\b|\bsued\b|\bprobe\b|\binvestigation\b|\bSEC charges\b|\bantitrust\b|\bjudge\b|\bcourt\b/i],
  ['deal', /\bacquir|\bmerger\b|\btakeover\b|\bbuyout\b/i],
  ['capital', /\bdividend\b|\bbuyback\b|\brepurchase\b|\boffering\b/i],
  ['people', /\bCEO\b|\bCFO\b|\bsteps down\b|\bresign/i],
  ['risk', /\bbankrupt|\brecall\b|\bdefault\b|\bhack|\bbreach\b|\bdowngrade\b/i],
  ['analyst', /\bupgrade\b|\bprice target\b|\banalyst/i],
];
const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

function factsFor(cf, concept, unit){
  const node = cf.facts && cf.facts['us-gaap'] && cf.facts['us-gaap'][concept];
  if (!node || !node.units) return [];
  return node.units[unit] || node.units[Object.keys(node.units)[0]] || [];
}

/* three-month values by period end; a later filing's restatement wins */
function quarterly(facts){
  const latest = new Map();
  for (const f of facts){
    if (!f.start || !/^(10-Q|10-K|20-F|40-F)/.test(f.form || '')) continue;
    const k = f.start + '|' + f.end, old = latest.get(k);
    if (!old || (f.filed || '') > (old.filed || '')) latest.set(k, f);
  }
  const q = {}, years = [];
  for (const f of latest.values()){
    const d = days(f.start, f.end);
    if (d >= 80 && d <= 100) q[f.end] = { value: f.val, start: f.start, end: f.end, derived: false, filed: f.filed };
    else if (d >= 350 && d <= 380) years.push(f);
  }
  for (const y of years){
    if (q[y.end]) continue;
    const inside = Object.values(q).filter(v => v.start >= y.start && v.end < y.end);
    if (inside.length !== 3) continue;
    q[y.end] = { value: y.val - inside.reduce((s, v) => s + v.value, 0), end: y.end, start: y.start, derived: true, filed: y.filed };
  }
  return q;
}
function series(cf, key){
  const unit = key === 'eps' ? 'USD/shares' : 'USD', merged = {};
  for (const c of CONCEPTS[key]){
    const q = quarterly(factsFor(cf, c, unit));
    for (const e of Object.keys(q)) if (!merged[e]) merged[e] = q[e];
  }
  return merged;
}
function yearAgo(s, end){
  let best = null;
  for (const e of Object.keys(s)){
    const gap = Math.abs(days(e, end) - 365);
    if (gap <= 10 && (!best || gap < best.gap)) best = { gap, v: s[e] };
  }
  return best ? best.v.value : null;
}
const pct = (a, b) => (a == null || b == null || b === 0) ? null : (a - b) / Math.abs(b) * 100;

function analyse(cf, quarters){
  const S = {}; for (const k of Object.keys(CONCEPTS)) S[k] = series(cf, k);
  const ends = Object.keys(S.revenue).concat(Object.keys(S.netIncome)).filter((e, i, a) => a.indexOf(e) === i).sort().reverse();
  return ends.slice(0, quarters || 4).map(end => {
    const v = k => S[k][end] ? S[k][end].value : null;
    const rev = v('revenue'), derived = !!(S.revenue[end] && S.revenue[end].derived) || !!(S.netIncome[end] && S.netIncome[end].derived);
    const margin = k => (rev && v(k) != null) ? v(k) / rev * 100 : null;
    return { end, derived, filed: (S.revenue[end] || S.netIncome[end] || {}).filed || null, revenue: rev, revenueYoY: pct(rev, yearAgo(S.revenue, end)),
      netIncome: v('netIncome'), netIncomeYoY: pct(v('netIncome'), yearAgo(S.netIncome, end)),
      eps: v('eps'), epsYoY: pct(v('eps'), yearAgo(S.eps, end)), grossMargin: margin('grossProfit'), opMargin: margin('operating'),
      oneOff: v('netIncome') != null && v('operating') != null && v('netIncome') > v('operating') };
  });
}

function filingsFrom(sub, cik){
  const r = (sub.filings && sub.filings.recent) || {}, out = [];
  for (let i = 0; i < (r.form || []).length && out.length < 12; i++){
    if (!/^(8-K|10-Q|10-K)$/.test(r.form[i])) continue;
    const items = String(r.items[i] || '').split(',').map(s => s.trim()).filter(Boolean);
    out.push({ form: r.form[i], date: r.filingDate[i], items, labels: items.map(x => ITEMS[x]).filter(Boolean),
      important: items.some(x => IMPORTANT.has(x)), severe: items.some(x => SEVERE.has(x)),
      url: 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + String(r.accessionNumber[i]).replace(/-/g, '') + '/' + r.primaryDocument[i] });
  }
  return out;
}

function decode(s){
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, v) => {
    if (v[0] === '#'){ const n = v[1].toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : +v.slice(1); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[v.toLowerCase()];
  });
}
function parseRss(xml){
  const out = [];
  for (const m of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const f = n => decode((m[1].match(new RegExp('<' + n + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + n + '>', 'i')) || [])[1]);
    const title = f('title').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
    let link; try { link = new URL(f('link').trim()); } catch { continue; }
    if (!title || link.protocol !== 'https:') continue;
    const t = Date.parse(f('pubDate'));
    out.push({ title, link: link.href, host: link.hostname.replace(/^www\./, ''), time: Number.isFinite(t) ? t : null, tags: TAGS.filter(([, re]) => re.test(title)).map(([n]) => n) });
  }
  return out.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 8);
}

function createService(fetcher = fetch, env = process.env, clock = Date.now){
  const cache = new Map();
  async function cached(key, ttl, make){
    const hit = cache.get(key);
    if (hit && clock() - hit.at < ttl) return hit.value;
    const value = await make();
    cache.set(key, { at: clock(), value });
    return value;
  }
  const ua = () => { const v = String(env.SEC_USER_AGENT || '').trim(); return /\S+@\S+\.\S+/.test(v) ? v : ''; };
  async function secJson(url){
    const r = await fetcher(url, { headers: { 'user-agent': ua(), accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Error('SEC answered ' + r.status);
    return r.json();
  }
  const tickers = () => cached('tickers', DAY, async () => {
    const j = await secJson('https://www.sec.gov/files/company_tickers.json'), map = {};
    for (const row of Object.values(j)) map[String(row.ticker).toUpperCase()] = { cik: String(row.cik_str).padStart(10, '0'), name: row.title };
    return map;
  });
  async function sec(ticker){
    if (!ua()) return { status: 'no-ua', why: 'SEC_USER_AGENT is not set for the data service.' };
    const hit = (await tickers())[ticker.replace('.', '-')];
    if (!hit) return { status: 'not-us', why: 'No US SEC filer has this ticker.' };
    return cached('sec:' + ticker, 6 * 3600000, async () => {
      const [facts, sub] = await Promise.all([
        secJson('https://data.sec.gov/api/xbrl/companyfacts/CIK' + hit.cik + '.json').catch(e => { if (/404/.test(e.message)) return null; throw e; }),
        secJson('https://data.sec.gov/submissions/CIK' + hit.cik + '.json'),
      ]);
      const quarters = facts ? analyse(facts, 4) : [], filings = filingsFrom(sub, hit.cik);
      const newest = filings.find(f => f.form === '10-Q' || f.form === '10-K');
      return { status: 'ok', name: hit.name, cik: hit.cik, quarters, filings,
        lag: !!(newest && quarters[0] && newest.date > quarters[0].filed && !quarters[0].derived) };
    });
  }
  const headlines = ticker => cached('news:' + ticker, 10 * 60000, async () => {
    const r = await fetcher('https://feeds.finance.yahoo.com/rss/2.0/headline?s=' + encodeURIComponent(ticker) + '&region=US&lang=en-US',
      { headers: { 'user-agent': 'ASTRA-Terminal/1.0', accept: 'application/rss+xml,text/xml' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error('Yahoo answered ' + r.status);
    return parseRss(await r.text());
  });
  return async function research(raw){
    const ticker = String(raw || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return { error: 'bad_ticker' };
    let s; try { s = await sec(ticker); } catch(e){ s = { status: 'error', why: e.message }; }
    if (s.status === 'not-us') return { ticker, sec: s, headlines: [], newsStatus: 'skipped' };
    let news = [], newsStatus = 'ok';
    try { news = await headlines(ticker); } catch(e){ newsStatus = e.message; }
    return { ticker, sec: s, headlines: news, newsStatus, at: clock() };
  };
}
module.exports = { createService, analyse, quarterly, filingsFrom, parseRss };
