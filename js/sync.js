/* ASTRA Terminal — account login + always-on cloud sync.
   The whole app state (watchlist, alerts, drawings, notes, workspaces, paper
   account, the Observer's brain and fund…) is mirrored to the terminal's own
   private backend, gated by the account credentials. Last write wins. */
const Sync = {
  API: 'https://astra-terminal.higgsfield.app/api/sync',
  EXCLUDE: ['astra_auth', 'astra_btc1d', 'astra_syncTs', 'astra_localTs'],
  auth: lsGet('astra_auth', null),
  timer: null,
  dirty: false,

  /* track every local change */
  install(){
    const set = localStorage.setItem.bind(localStorage);
    const rem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = (k, v) => { set(k, v); this.touched(k); };
    localStorage.removeItem = k => { rem(k); this.touched(k); };
    window.addEventListener('beforeunload', () => {
      if (this.dirty && this.auth && !this.auth.offline){
        try {
          navigator.sendBeacon(this.API + '/push', new Blob([JSON.stringify(this.payload())], { type: 'application/json' }));
        } catch(e){}
      }
    });
    setInterval(() => { if (this.dirty) this.push(); }, 90000);
  },

  touched(k){
    if (!k || !k.startsWith('astra_') || this.EXCLUDE.includes(k)) return;
    localStorage.setItem('astra_localTs', String(Date.now()));
    if (!this.auth || this.auth.offline) return;
    this.dirty = true;
    this.chip('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 4000);
  },

  collect(){
    const state = {};
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith('astra_') && !this.EXCLUDE.includes(k)) state[k] = localStorage.getItem(k);
    }
    return state;
  },
  payload(){
    return { u: this.auth.u, p: this.auth.p, state: this.collect(), updatedAt: +localStorage.getItem('astra_localTs') || Date.now() };
  },

  async push(){
    if (!this.auth || this.auth.offline) return;
    this.dirty = false;
    try {
      const r = await fetch(this.API + '/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.payload()),
      });
      const j = await r.json();
      if (j.ok){
        localStorage.setItem('astra_syncTs', String(j.updatedAt));
        this.chip('ok');
      } else this.chip('error');
    } catch(e){ this.dirty = true; this.chip('error'); }
  },

  async pull(u, p){
    const r = await fetch(this.API + '/pull', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ u, p }),
    });
    if (r.status === 401) return { bad: true };
    if (!r.ok) throw new Error('server ' + r.status);
    return r.json();
  },

  applyState(state){
    const set = Storage.prototype.setItem.bind(localStorage);
    for (const [k, v] of Object.entries(state))
      if (k.startsWith('astra_') && !this.EXCLUDE.includes(k) && typeof v === 'string') set(k, v);
  },

  /* boot gate: returns once signed in (or offline mode chosen) */
  gate(){
    this.install();
    return new Promise(resolve => {
      if (this.auth){ this.startupPull().then(resolve); return; }
      this.showLogin(resolve);
    });
  },

  async startupPull(){
    if (this.auth.offline){ this.chip('offline'); return; }
    try {
      const srv = await this.pull(this.auth.u, this.auth.p);
      if (srv.bad){ this.signOut(false); location.reload(); return; }
      this.decide(srv);
      this.chip('ok');
    } catch(e){ this.chip('error'); }
  },

  /* who wins on this device: a previously-synced device trusts a newer server;
     a device with its own un-synced data keeps it and uploads it */
  decide(srv){
    const localTs = +localStorage.getItem('astra_localTs') || 0;
    const knownSync = +localStorage.getItem('astra_syncTs') || 0;
    let hasLocal = false;
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith('astra_') && !this.EXCLUDE.includes(k)){ hasLocal = true; break; }
    }
    const srvHasData = srv.state && Object.keys(srv.state).length > 0;
    if (srvHasData && srv.updatedAt > Math.max(localTs, 1) && (knownSync > 0 || !hasLocal)){
      this.applyState(srv.state);
      Storage.prototype.setItem.call(localStorage, 'astra_syncTs', String(srv.updatedAt));
      Storage.prototype.setItem.call(localStorage, 'astra_localTs', String(srv.updatedAt));
      location.reload();
      return;
    }
    if (hasLocal){ this.dirty = true; setTimeout(() => this.push(), 3000); }
  },

  showLogin(resolve){
    const gateEl = document.getElementById('loginGate');
    gateEl.classList.add('show');
    const err = document.getElementById('lgErr');
    const u = document.getElementById('lgUser'), p = document.getElementById('lgPass');
    const done = () => { gateEl.classList.remove('show'); resolve(); };
    const attempt = async () => {
      err.textContent = '';
      if (!u.value.trim() || !p.value){ err.textContent = 'Enter your username and password.'; return; }
      document.getElementById('lgBtn').disabled = true;
      try {
        const srv = await this.pull(u.value.trim(), p.value);
        if (srv.bad){ err.textContent = 'Wrong username or password.'; return; }
        this.auth = { u: u.value.trim(), p: p.value };
        Storage.prototype.setItem.call(localStorage, 'astra_auth', JSON.stringify(this.auth));
        this.decide(srv);
        this.chip('ok');
        done();
      } catch(e){
        err.textContent = 'Server not reachable — check your internet, or continue offline below.';
      } finally {
        document.getElementById('lgBtn').disabled = false;
      }
    };
    document.getElementById('lgBtn').addEventListener('click', attempt);
    p.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    u.addEventListener('keydown', e => { if (e.key === 'Enter') p.focus(); });
    document.getElementById('lgOffline').addEventListener('click', () => {
      this.auth = { offline: true };
      Storage.prototype.setItem.call(localStorage, 'astra_auth', JSON.stringify(this.auth));
      this.chip('offline');
      done();
    });
    setTimeout(() => u.focus(), 80);
  },

  signOut(reload){
    Storage.prototype.removeItem.call(localStorage, 'astra_auth');
    this.auth = null;
    if (reload !== false) location.reload();
  },

  chip(kind){
    const el = document.getElementById('stSync');
    if (!el) return;
    const map = {
      ok: ['✓ ' + (this.auth && this.auth.u ? this.auth.u : ''), 'up'],
      saving: ['● saving…', 'flat'],
      error: ['⚠ retry', 'down'],
      offline: ['offline', 'flat'],
    };
    const [txt, cls] = map[kind] || ['—', 'flat'];
    el.textContent = txt;
    el.className = 'stv ' + cls;
  },
};
