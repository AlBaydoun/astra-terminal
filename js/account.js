/* ASTRA Terminal — your real account, always in view.
   Balance, equity, free margin and open profit are read from MetaTrader through
   the bridge every few seconds and shown in the top bar. Reading only: this
   file never sends an order. Red dot = the bridge is not connected. */
const AccountPill = {
  last: null, timer: null,
  el(){ return document.getElementById('acctPill'); },
  async poll(){
    const pill = this.el(); if (!pill) return;
    let j = null;
    try {
      const r = await fetch(Feed.BRIDGE_URL + '/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (r.ok) j = await r.json();
    } catch(e){ j = null; }
    if (!j || !Number.isFinite(j.balance)){
      pill.classList.add('off');
      pill.querySelector('.apName').textContent = 'MT5 NOT CONNECTED';
      pill.querySelector('.apLogin').textContent = '';
      pill.querySelector('.apBal').textContent = '—';
      pill.title = 'The MetaTrader bridge is not answering — start START-MT5-Bridge.bat and log MetaTrader in';
      const sb = document.getElementById('stBal'); if (sb){ sb.textContent = 'MT5 off'; sb.className = 'stv down'; }
      return;
    }
    const bal = j.balance, eq = Number.isFinite(j.equity) ? j.equity : bal, free = Number.isFinite(j.margin_free) ? j.margin_free : null;
    const pl = eq - bal;
    const cur = j.currency || 'USD';
    pill.classList.remove('off');
    pill.querySelector('.apName').textContent = (j.server || 'JUSTMARKETS').replace(/-Live$/i, '').toUpperCase() + (/live/i.test(j.server || '') ? ' · LIVE' : '');
    pill.querySelector('.apLogin').textContent = j.account ? '#' + j.account : '';
    pill.querySelector('.apBal').textContent = fmtNum(bal);
    pill.querySelector('.apCur').textContent = cur;
    pill.querySelector('.apEq').textContent = fmtNum(eq);
    pill.querySelector('.apFree').textContent = free == null ? '—' : fmtNum(free);
    const plEl = pill.querySelector('.apPl');
    plEl.textContent = (pl >= 0 ? '+' : '') + fmtNum(pl);
    plEl.className = 'apPl ' + (pl > 0.005 ? 'up' : pl < -0.005 ? 'down' : '');
    pill.title = 'Balance ' + fmtNum(bal) + ' ' + cur + ' · equity ' + fmtNum(eq) + ' · free margin ' + (free == null ? '—' : fmtNum(free)) +
      ' · open profit ' + (pl >= 0 ? '+' : '') + fmtNum(pl) + '\nRead from MetaTrader ' + (j.server || '') + ' — click for the Live page';
    /* a change in balance flashes, so a closed trade is never missed */
    if (this.last != null && Math.abs(bal - this.last) > 0.005){
      pill.classList.remove('flashUp', 'flashDown'); void pill.offsetWidth;
      pill.classList.add(bal > this.last ? 'flashUp' : 'flashDown');
    }
    const sb = document.getElementById('stBal'), sp = document.getElementById('stPl');
    if (sb){ sb.textContent = fmtNum(bal) + ' ' + cur; }
    if (sp){ sp.textContent = pl ? ('open ' + (pl >= 0 ? '+' : '') + fmtNum(pl)) : ''; sp.className = 'stv ' + (pl > 0.005 ? 'up' : pl < -0.005 ? 'down' : ''); }
    this.last = bal;
    if (typeof Feed !== 'undefined') Feed.account = Object.assign({}, Feed.account || {}, { balance: bal, equity: eq, currency: cur, login: j.account, server: j.server });
  },
  init(){
    const pill = this.el(); if (!pill) return;
    const go = () => { if (typeof WorkspaceUI !== 'undefined'){ WorkspaceUI.openBot('live'); WorkspaceUI.expand(true); } };
    /* folded by default: just the balance. One click opens the full card, the
       next folds it again. Double-click, or the ↗ inside the card, goes to the Live page. */
    this.folded = lsGet('astra_acctfold', true) !== false;
    pill.classList.toggle('folded', this.folded);
    pill.addEventListener('click', e => {
      if (e.target.closest('.apGo')) return go();
      this.folded = !this.folded; lsSet('astra_acctfold', this.folded);
      pill.classList.toggle('folded', this.folded);
    });
    pill.addEventListener('dblclick', go);
    const st = document.getElementById('stAcct'); if (st) st.addEventListener('click', go);
    this.poll();
    this.timer = setInterval(() => this.poll(), 5000);
  },
};
document.addEventListener('DOMContentLoaded', () => AccountPill.init());
