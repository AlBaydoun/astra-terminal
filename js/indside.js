/* ASTRA Terminal — the Indicators list as a tab of the right side panel (IND).
   It is the SAME list as the Indicators window: its body is moved into the side panel
   while that tab is open and moved back when the top-bar button opens the window. So
   every setting, the search, the ⚙ properties card and APPLY behave identically. */
const IndSide = {
  init(){
    this.host = document.getElementById('indSideHost');
    this.modal = document.getElementById('indModal');
    this.body = this.modal && this.modal.querySelector('.mBody');
    if (!this.host || !this.body || typeof App === 'undefined') return;
    this.home = this.body.parentElement;
    const orig = App.openIndicators.bind(App);
    App.openIndicators = (...a) => {
      if (this.toSide){ orig(...a); App.hideModal('indModal'); this.host.appendChild(this.body); this.body.classList.add('indInSide'); return; }
      /* the window takes the list back */
      if (this.body.parentElement !== this.home){ this.home.appendChild(this.body); this.body.classList.remove('indInSide'); this.placeholder(); }
      return orig(...a);
    };
    /* APPLY from the side panel keeps the list where it is, freshly read back */
    const apply = App.applyIndicators.bind(App);
    App.applyIndicators = (...a) => { const r = apply(...a); if (this.body.parentElement === this.host) setTimeout(() => this.show(), 0); return r; };
    document.querySelector('#sideTabs [data-tab="ind"]')?.addEventListener('click', () => this.show());
    this.host.innerHTML = '<div class="empty">Loading the indicators…</div>';
  },
  placeholder(){
    if (this.body.parentElement === this.host) return;
    this.host.innerHTML = '<div class="empty">The list is open in the Indicators window. Press IND again to bring it back here.</div>';
  },
  show(){
    this.toSide = true;
    /* clear only the placeholder text — the list itself must stay attached while it is redrawn */
    for (const n of [...this.host.childNodes]) if (n !== this.body) n.remove();
    try { App.openIndicators(); } finally { this.toSide = false; }
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => IndSide.init(), 0));
