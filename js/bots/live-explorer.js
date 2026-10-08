/* Read-only broker reporting. No storage writes and no trading actions. */
const LiveExplorer = {
  selected:false, data:null, error:'', busy:false, timer:null, filter:'all', query:'',
  tabs(){return `<nav class="liveDiveTabs" aria-label="Deep Dive account"><button class="bBtn ${this.selected?'on':''}" data-livedive="live">◉ Live Trading · real account</button><button class="bBtn ${!this.selected?'on':''}" data-livedive="paper">Paper bots</button></nav>`;},
  money(v){return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';},
  // Bridge deal times use the broker clock; do not apply the PC timezone a
  // second time or today's close can appear to have happened tomorrow.
  when(v){return v?new Date(v*1000).toISOString().slice(0,19).replace('T',' ')+' · broker time':'Unavailable';},
  net(d){return ['profit','commission','swap','fee'].reduce((s,k)=>s+(Number.isFinite(d[k])?d[k]:0),0);},
  groups(deals,open){
    const groups=new Map();
    for(const d of deals){
      const id=String(d.position);
      if(!groups.has(id))groups.set(id,{id,symbol:d.symbol,side:d.type==='sell'?'buy':'sell',deals:[],net:0,open:open.some(p=>String(p.ticket)===id)});
      const g=groups.get(id);g.deals.push(d);g.net+=this.net(d);
    }
    return [...groups.values()].sort((a,b)=>Math.max(...b.deals.map(d=>d.time))-Math.max(...a.deals.map(d=>d.time)));
  },
  async refresh(){
    if(this.busy)return;this.busy=true;
    try{
      const get=async path=>{const r=await fetch(Live.BRIDGE+path,{cache:'no-store',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('Broker read failed');return r.json();};
      const [health,positions,history]=await Promise.all([get('/health'),get('/positions'),get('/deals?days=365')]);
      if(!health.account||!Array.isArray(positions.positions)||!Array.isArray(history.deals))throw Error('Broker information is incomplete');
      const magic=health.magic||20260902;
      this.data={health,open:positions.positions.filter(p=>p.magic===magic),deals:history.deals.filter(d=>d.magic===magic),capped:history.deals.length>=500,at:Date.now()};this.error='';
    }catch(e){this.error='Refresh failed. Previously loaded figures may be stale; check MetaTrader and the bridge.';}
    finally{this.busy=false;this.paint();}
  },
  view(){
    const d=this.data;
    const header=`<header class="liveDiveHead"><div><span class="liveDiveEyebrow">REAL EXECUTIONS · READ ONLY</span><h2>Live Trading</h2><p>Track ASTRA’s broker positions and closing executions, separate from paper results.</p></div><button class="bBtn" data-ldrefresh ${this.busy?'disabled':''}>${this.busy?'Refreshing…':'↻ Refresh'}</button></header>`;
    if(!d)return header+`<div class="botNote">${esc(this.error||'Loading broker records…')}</div>`;
    const groups=this.groups(d.deals,d.open), closed=groups.filter(g=>!g.open),win=closed.filter(g=>g.net>0),loss=closed.filter(g=>g.net<0);
    const net=d.deals.reduce((s,x)=>s+this.net(x),0),floating=d.open.reduce((s,p)=>s+p.profit+(p.swap||0),0);
    const sums=side=>d.deals.filter(x=>(x.type==='sell'?'buy':'sell')===side).reduce((s,x)=>s+this.net(x),0);
    const card=(label,value)=>`<div class="liveDiveStat"><small>${label}</small><strong>${value}</strong></div>`;
    const matches=(sym,side,status)=> (this.filter==='all'||this.filter===side||this.filter===status)&&String(sym).toLowerCase().includes(this.query.toLowerCase());
    const open=d.open.filter(p=>matches(p.symbol,p.type,'open')),done=groups.filter(g=>matches(g.symbol,g.side,'closed'));
    return header+`<p class="botNote ${this.error?'warn':''}">${esc(this.error||'Broker snapshot')} · ${esc(d.health.currency||'Account currency')} · Updated ${new Date(d.at).toLocaleTimeString()} · refreshes every 15 seconds while this view is open.</p>
      <div class="liveDiveStats">${card('Realised net · closing executions',this.money(net))}${card('Floating P/L + swap',this.money(floating))}${card('Open positions',d.open.length)}${card('Closed positions in returned history',closed.length)}${card('Won / lost / flat',`${win.length} / ${loss.length} / ${closed.length-win.length-loss.length}`)}${card('Win rate · closed positions',closed.length?(win.length/closed.length*100).toFixed(1)+'%':'—')}</div>
      <div class="liveDiveSides">${['buy','sell'].map(side=>`<div><b>${side==='buy'?'↗ BUY':'↘ SELL'}</b><strong class="${sums(side)>=0?'up':'down'}">${this.money(sums(side))}</strong><small>Realised net · account currency</small></div>`).join('')}</div>
      <p class="dim2">Coverage: last 365 days, at most 500 closing executions across the account${d.capped?' — limit reached; older executions omitted':''}. Includes profit, closing commission, swap and fee. Entry-side charges and unavailable history are not supplied by this endpoint. Partial closes are grouped by position; figures are not a full account statement.</p>
      <div class="liveDiveFilters"><label>Show <select data-ldfilter>${[['all','All trades'],['open','Open'],['closed','Closing history'],['buy','Buys'],['sell','Sells']].map(([v,n])=>`<option value="${v}" ${this.filter===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Instrument <input data-ldquery placeholder="Search a pair" value="${esc(this.query)}"></label></div>
      <h3>Open positions · ${open.length}</h3>${open.map(p=>`<details class="liveDiveTrade" data-live-ticket="o${p.ticket}"><summary><b>${esc(p.symbol)}</b> ${esc(p.type.toUpperCase())} · ${p.volume} lots <strong class="${p.profit>=0?'up':'down'}">${this.money(p.profit+(p.swap||0))}</strong></summary>${this.fields({'Position ticket':p.ticket,'Opened':this.when(p.time),'Entry price':p.price_open,'Current price':p.price_current,'Broker stop loss':p.sl||'Not set','Broker take profit':p.tp||'Not set','Profit':this.money(p.profit),'Swap':this.money(p.swap||0),'Broker comment':p.comment||'—'})}</details>`).join('')||'<p class="dim2">No matching open ASTRA positions.</p>'}
      <h3>Closing history · ${done.length} positions</h3>${done.map(g=>`<details class="liveDiveTrade" data-live-ticket="c${esc(g.id)}"><summary><b>${esc(g.symbol)}</b> ${g.side.toUpperCase()} · #${esc(g.id)} ${g.open?'· PARTIALLY CLOSED':''}<strong class="${g.net>=0?'up':'down'}">${this.money(g.net)}</strong></summary>${g.deals.map(t=>this.fields({'Deal ticket':t.ticket,'Order ticket':t.order,'Closed at':this.when(t.time),'Closed lots':t.volume,'Exit price':t.price,'Profit':this.money(t.profit),'Commission':this.money(t.commission),'Swap':this.money(t.swap),'Fee':this.money(t.fee),'Net':this.money(this.net(t)),'Broker comment':t.comment||'—'})).join('')}<p class="dim2">Historical entry price, stop changes and entry reasoning are not supplied by this broker endpoint.</p></details>`).join('')||'<p class="dim2">No matching closing executions.</p>'}`;
  },
  fields(values){return `<dl class="liveDiveFields">${Object.entries(values).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(String(v??'Unavailable'))}</dd></div>`).join('')}</dl>`;},
  localDetails(ticket){
    // Correlate only an exact successful ticket; never guess attribution from a
    // close comment (the broker may replace it with an SL/TP message).
    const book=typeof lsGet==='function'?lsGet('astra_livebook',null):null;
    const order=book?.orders?.find(o=>o.sent&&o.ok&&String(o.ticket)===String(ticket));
    return order?'<p class="dim2">Original entry recorded by ASTRA (stop/target may since have changed)</p>'+this.fields({'Bot':order.botName||order.bot,'Entry price':order.entry,'Initial stop':order.sl,'Initial target':order.tp,'Timeframe':order.tf,'Signal':order.model,'Recorded entry time':order.at?new Date(order.at).toLocaleString()+' · PC time':'Unavailable'}):'';
  },
  paint(){
    const host=document.getElementById('liveDive');if(!host)return;
    // Keep search focus and expanded tickets intact across background reads.
    if(host.contains(document.activeElement)&&document.activeElement.matches('input,select'))return;
    const opened=[...host.querySelectorAll('details[open]')].map(x=>x.dataset.liveTicket);
    host.innerHTML=this.view();host.querySelectorAll('details').forEach(x=>{
      x.open=opened.includes(x.dataset.liveTicket);
      const ticket=x.dataset.liveTicket.slice(1),record=x.dataset.liveTicket[0]==='o'?this.data.open.find(p=>String(p.ticket)===ticket):this.data.deals.find(d=>String(d.position)===ticket);
      x.insertAdjacentHTML('beforeend',this.localDetails(ticket)+(record?`<p><button class="bMini" data-ldchart="${esc(record.symbol)}">Open ${esc(record.symbol)} chart ↗</button></p>`:''));
    });this.controls(host);
  },
  controls(host){
    host.querySelectorAll('[data-ldchart]').forEach(b=>b.addEventListener('click',()=>{if(typeof WorkspaceUI!=='undefined')WorkspaceUI.openChart(b.dataset.ldchart);}));
    host.querySelector('[data-ldrefresh]')?.addEventListener('click',()=>this.refresh());
    host.querySelector('[data-ldfilter]')?.addEventListener('change',e=>{this.filter=e.target.value;e.target.blur();this.paint();});
    host.querySelector('[data-ldquery]')?.addEventListener('change',e=>{this.query=e.target.value;e.target.blur();this.paint();});
  },
  bind(host){
    clearInterval(this.timer);
    host.querySelectorAll('[data-livedive]').forEach(b=>b.addEventListener('click',()=>{this.selected=b.dataset.livedive==='live';Explorer.dirty=true;Bots.render();}));
    if(!this.selected)return;
    this.controls(host);this.refresh();
    this.timer=setInterval(()=>{if(document.getElementById('liveDive'))this.refresh();else clearInterval(this.timer);},15000);
  },
};
