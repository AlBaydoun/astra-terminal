/* Manual account automation. Paper engine only; no broker writes or new storage keys.
   A session lock prevents competing windows. The existing manual-ledger lock
   serializes auto fills with price orders and hand edits. Stop invalidates awaits. */
const ManualAuto = {
  target:'manual',
  running:false, starting:false, busy:false, revision:0, timer:null, release:null,
  count:0, seen:new Set(), events:[], status:'Stopped · choose a mode below.',
  draft:{mode:'price',source:'confluence',scope:'pair',direction:'both',exits:'signal',allocation:5,sl:0.5,tp:1,entries:0},
  config:null,
  sources(){return Bots.ordered(BOTS.filter(b=>!b.manual&&(!Bots.isPage(b)||b.id==='scanner')&&typeof b.signal==='function'));},
  view(){
    const d=this.draft;
    const select=(key,items)=>`<select data-ma="${key}">${items.map(([v,l])=>`<option value="${esc(v)}"${String(d[key])===v?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
    const number=(key,label,min,max)=>`<label class="bc">${label}<input data-ma="${key}" type="number" min="${min}" max="${max}" step="${key==='entries'?'1':'0.01'}" value="${d[key]}"></label>`;
    return `<section class="manualAuto wsTradeSection" data-auto-target="${this.target}"><h3>${WorkspaceUI.icon('bot')} Automatic entries · manual paper account</h3>
      <div class="botCtl"><label class="bc">Entry mode ${select('mode',[['price','At my chosen price'],['confluence','Bot / indicator signals']])}</label></div>
      <div data-ma-price><p>Choose Limit to buy lower or sell higher; choose Stop entry to buy higher or sell lower. Enter your entry, stop and target prices in the ticket, then place the instruction.</p>
        <button class="bBtn" data-ma-price-type="limit">Prepare Limit order</button> <button class="bBtn" data-ma-price-type="stop">Prepare Stop entry</button>
        <p class="botNote">Each instruction fills once. Waiting orders and their levels are saved and shown below.</p></div>
      <div data-ma-signal><fieldset data-ma-fields class="botCtl">
        <label class="bc">Find signal<input type="search" data-ma-search placeholder="Search bots and candle signals"></label>
        <label class="bc">Signal source ${select('source',this.sources().map(b=>[b.id,b.name]))}</label>
        <label class="bc">Scan ${select('scope',[['pair','Ticket pair only'],['all','All JustMarkets instruments']])}</label>
        <label class="bc">Direction ${select('direction',[['both','Buy and sell'],['buy','Buy only'],['sell','Sell only']])}</label>
        <label class="bc">Stops and targets ${select('exits',[['signal','Selected strategy levels'],['percent','My percentage distances']])}</label>
        ${number('allocation','Maximum position value per entry (% equity)',0.01,100)}
        ${number('sl','Stop distance (%)',0.01,99)}${number('tp','Target distance (%)',0.01,99)}
        ${number('entries','Entries this session (0 = no count limit)',0,Number.MAX_SAFE_INTEGER)}
        </fieldset><div class="botCtl"><button class="bBtn go" data-ma-start>Start selected signals · paper</button><button class="bBtn danger" data-ma-stop>Stop new automatic entries</button></div>
        <p class="botNote">Uses the selected bot’s saved timeframe, score and market filters, with completed candles only. Confluence retains its M15 session filter. One entry per source, pair and signal; session strategies retain their daily guard. Close-only signals never become short entries. The per-entry percentage is position value, not stop risk. Stop to change settings. Choosing a source does not start that bot’s separate account.</p>
        <p class="botNote">Experimental, with no established profitability. Sessions stop on reload. Keep ASTRA, the bridge and PC running for paper entries and exits. Stopping automatic entries leaves existing positions and separately placed price instructions active.</p>
      </div><p id="maStatus" class="botNote" role="status"></p><div id="maEvents"></div></section>`;
  },
  bind(host){
    host.querySelector('[data-ma-search]')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();host.querySelectorAll('[data-ma="source"] option').forEach(o=>o.hidden=!o.textContent.toLowerCase().includes(q));});
    host.querySelectorAll('[data-ma]').forEach(el=>el.addEventListener('change',()=>{
      if(this.running||this.starting)return;
      this.draft[el.dataset.ma]=el.type==='number'?Number(el.value):el.value;this.refresh();
    }));
    host.querySelectorAll('[data-ma-price-type]').forEach(el=>el.addEventListener('click',()=>{
      const type=document.getElementById('mbOrderType');type.value=el.dataset.maPriceType;
      type.dispatchEvent(new Event('change'));document.getElementById('mbEntry').focus();
    }));
    host.querySelector('[data-ma-start]').addEventListener('click',()=>this.start());
    host.querySelector('[data-ma-stop]').addEventListener('click',()=>this.stop());
    this.refresh();
  },
  refresh(){
    const shortcut=document.querySelector('#wsToolbar [data-ws-bot="manual"] span');
    if(shortcut&&this.target==='manual')shortcut.textContent=this.running?'Manual · AUTO ON':'Manual';
    const host=document.querySelector('.manualAuto[data-auto-target="'+this.target+'"]');if(!host)return;
    host.querySelector('[data-ma-price]').hidden=this.draft.mode!=='price';
    host.querySelector('[data-ma-signal]').hidden=this.draft.mode!=='confluence';
    host.querySelectorAll('[data-ma]').forEach(el=>{el.disabled=this.running||this.starting||(['sl','tp'].includes(el.dataset.ma)&&this.draft.exits!=='percent');});
    host.querySelector('[data-ma-start]').disabled=this.running||this.starting;
    host.querySelector('[data-ma-stop]').disabled=!this.running&&!this.starting;
    host.querySelector('#maStatus').textContent=this.status+' · '+this.count+' paper entries this session';
    host.querySelector('#maEvents').innerHTML=this.events.slice(0,8).map(e=>`<div class="botRow">${e.sym?WorkspaceUI.pair(e.sym):''}<span>${esc(e.text)}</span></div>`).join('');
  },
  valid(c){
    if(!['pair','all'].includes(c.scope)||!['both','buy','sell'].includes(c.direction)||!['signal','percent'].includes(c.exits))return 'Choose valid scan, direction and exit modes.';
    if(!Number.isFinite(c.allocation)||c.allocation<=0||c.allocation>100)return 'Position value must be above 0 and at most 100%.';
    if(!Number.isSafeInteger(c.entries)||c.entries<0)return 'Entry count must be a whole number, 0 or more.';
    if(c.exits==='percent'&&![c.sl,c.tp].every(v=>Number.isFinite(v)&&v>0&&v<100))return 'Stop and target distances must be above 0 and below 100%.';
    if(c.scope==='pair'&&!c.sym)return 'Choose a ticket pair first.';
    return null;
  },
  async start(){
    if(this.running||this.starting)return false;
    const c={...this.draft,sym:document.getElementById('mbSym')?.dataset.val};
    const why=this.valid(c);if(why){this.status=why;this.refresh();return false;}
    if(!navigator.locks){this.status='This browser cannot coordinate automatic entries across windows.';this.refresh();return false;}
    this.starting=true;const version=++this.revision;this.refresh();
    // Keep the lifetime lock until Stop or window shutdown, without saving an ON flag.
    return new Promise(resolve=>{
      navigator.locks.request(this.target==='manual'?'astra-manual-auto-session':'astra-live-manual-auto-session',{ifAvailable:true},async lock=>{
        this.starting=false;
        if(!lock||version!==this.revision){this.status=lock?'Stopped.':'Another window has an automatic manual session. Stop it there first.';this.refresh();resolve(false);return;}
        this.config=Object.freeze(c);this.count=0;this.events=[];this.running=true;
        this.status='Running · '+(c.scope==='all'?'all JustMarkets instruments':c.sym)+' · '+(c.source||'confluence');
        const held=new Promise(done=>{this.release=done;});
        this.timer=setInterval(()=>this.pulse(),15000);this.refresh();resolve(true);this.pulse();await held;
      }).catch(e=>{this.starting=false;this.status='Cannot start: '+e.message;console.error('ASTRA manual automation:',e);this.refresh();resolve(false);});
    });
  },
  stop(message='Stopped · existing trades and waiting price instructions remain active.'){
    this.revision++;this.running=false;this.starting=false;
    clearInterval(this.timer);this.timer=null;this.release?.();this.release=null;
    this.status=message;this.refresh();
  },
  active(version){return this.running && version===this.revision;},
  log(sym,text){
    if(this.events[0]?.sym!==sym||this.events[0]?.text!==text)this.events.unshift({sym,text});
    this.events=this.events.slice(0,50);this.refresh();
  },
  repeat(L,s){
    const source=s.meta?.manualAutoSource||'confluence',key=source+':'+Feed.brokerName(s.sym)+':'+s.entryBar;
    return this.seen.has(key)||[...L.open,...L.closed].some(p=>(p.meta?.manualAutoSource||'confluence')===source&&Feed.brokerName(p.sym)===Feed.brokerName(s.sym)&&(p.meta?.manualAutoBar===s.entryBar||(s.meta?.manualAutoSession&&p.meta?.manualAutoSession===s.meta.manualAutoSession)));
  },
  async enter(row,version){
    const s=row.signal,c=this.config;
    if(!this.active(version))return;
    if(!Number.isFinite(s?.entryBar)||!(s.atr>0)){this.log(row.sym,'Signal timing or volatility is invalid');return;}
    await Feed.loadSpecs([row.sym]);await ManualTicket.loadFx(row.sym);await Feed.quotes([row.sym]);
    if(!this.active(version))return;
    return ManualOrders.exclusive(()=>{
      if(!this.active(version))return;
      const L=Bots.ledgers.manual,cfg=Bots.manualCfg(),q=Bots.quoteFor(row.sym);
      let why=this.entryReason(s,q);
      if(!why&&(!MarketSources.allowed(row.sym)||!Feed.bridgeHas(row.sym)||q.source!=='bridge'))why='Waiting for a connected JustMarkets quote';
      if(!why&&this.repeat(L,s))why='Already entered this signal; waiting for a new completed candle';
      if(why){this.log(row.sym,why);return;}
      const funds=BotEngine.funds(L,BotEngine.rules(cfg)),cap=Math.min(funds.free,funds.equity*c.allocation/100);
      const sizing={...cfg,manualAutoFit:false,risk:{...cfg.risk,maxNotionalPct:(funds.used+cap)/funds.equity*100}};
      const source=s.meta?.manualAutoSource||'confluence';
      const sig={...s,sym:row.sym,tf:s.tf||'15m',manual:true,model:'Manual Auto · '+(source==='confluence'?'Confluence':BOT_BY_ID[source]?.name||source),meta:{...s.meta,manualAutoBar:s.entryBar},reasons:['Automatic '+source+' entry',...(s.reasons||[])]};
      if(c.exits==='percent'){
        const tick=Feed.specFor(row.sym)?.tickSize||1e-8;
        sig.sl=+(Math[s.dir>0?'floor':'ceil'](q.price*(1-s.dir*c.sl/100)/tick)*tick).toPrecision(12);
        sig.tp=+(Math[s.dir>0?'ceil':'floor'](q.price*(1+s.dir*c.tp/100)/tick)*tick).toPrecision(12);
        sig.tp1=null;
      }
      const locked=L.lockedUntil,plan=ManualTicket.fit(L,sizing,sig,q);
      if(L.lockedUntil!==locked&&!BotEngine.save('manual',L)){this.stop('Daily loss lock could not be saved. Entries stopped.');return;}
      if(!plan.ok){this.log(row.sym,plan.reason);return;}
      const p=BotEngine.open(L,sizing,plan.sig,q,plan.gate);
      if(!p){this.log(row.sym,L.decisions[0]?.text||'Final entry check refused this setup');return;}
      this.seen.add(source+':'+Feed.brokerName(row.sym)+':'+s.entryBar);this.count++;
      if(!BotEngine.save('manual',L)){this.stop('Could not save a paper entry. Keep ASTRA open; new entries stopped.');return;}
      this.log(row.sym,(s.dir>0?'BUY':'SELL')+' opened · '+p.lots+' lot · SL '+fmtPrice(p.sl)+' · TP '+fmtPrice(p.tp));
      if(c.entries>0&&this.count>=c.entries)this.stop('Session entry count reached. Existing positions remain active.');
    });
  },
  async pulse(){
    if(!this.running||this.busy)return;
    this.busy=true;const version=this.revision;
    try{
      const rows=await this.scan(this.config,version);if(!this.active(version))return;
      const c=this.config,scope=rows.filter(r=>c.scope==='all'||Feed.brokerName(r.sym)===Feed.brokerName(c.sym));
      const candidates=scope.filter(r=>r.signal?.dir&&(c.direction==='both'||r.signal.dir===(c.direction==='buy'?1:-1)));
      this.status='Running · '+scope.length+' pairs checked · '+candidates.length+' signal candidates · '+(c.source||'confluence');
      for(const row of candidates){if(!this.active(version))break;await this.enter(row,version);}
      if(!candidates.length){const issue=scope.find(r=>r.status==='ERROR');if(issue)this.log(issue.sym,issue.why);}
      if(Bots.active==='manual'){OpenTrades.refresh();Bots.render();}
    }catch(e){console.error('ASTRA manual automation:',e);if(this.active(version))this.stop('Automatic session stopped: '+e.message);}
    finally{this.busy=false;this.refresh();}
  },
  entryReason(s,q){
    // Confluence's drift guard is retained; other sources also need a fresh closed bar.
    if(!s.meta?.manualAutoSource||s.meta.manualAutoSource==='confluence')return ConfluenceBot.entryReason(s,q);
    const offset=Feed.bridgeClock?.offset,age=Date.now()/1000+offset-s.entryBar;
    if(!Number.isFinite(age)||age<0||age>90)return 'Entry window expired — waiting for a new completed candle';
    if(!q||!Feed.isLive(s.sym))return 'Waiting for a fresh broker quote';
    if(Math.abs(q.price-s.entry)>s.atr*0.25)return 'Price moved too far from this setup';
    return null;
  },
  async scan(c,version){
    const source=c.source||'confluence';
    if(source==='confluence')return ConfluenceScanner.scan();
    const b=this.sources().find(b=>b.id===source);if(!b)throw Error('This signal source is unavailable');
    const cfg={...b.defaults,...Bots.cfg(b.id)},symbols=[...new Set(MarketSources.brokerList().map(sym=>Feed.brokerName(sym)))].filter(sym=>c.scope==='all'||Feed.brokerName(sym)===Feed.brokerName(c.sym));
    const rows=[];
    // Bounded workers, no scan-depth truncation. Do not run another bot's runner:
    // its ledger, side effects and live arming belong to that separate account.
    let next=0;
    await Promise.all(Array.from({length:Math.min(4,symbols.length)},async()=>{
      while(this.active(version)){
        const sym=symbols[next++];if(!sym)break;
        const row={sym,signal:null,status:'WAIT',why:'No completed-candle entry'};rows.push(row);
        try{
          if(!MarketSources.allowed(sym)||!Feed.bridgeHas(sym)||PairRules.blocked(sym))continue;
          if(cfg.instruments?.length&&!cfg.instruments.some(s=>Feed.brokerName(s)===Feed.brokerName(sym)))continue;
          if(cfg.groups?.length&&!Bots.groupSymbols(cfg.groups).some(s=>Feed.brokerName(s)===Feed.brokerName(sym)))continue;
          if(cfg.hours?.length&&!cfg.hours.includes(new Date().getUTCHours()))continue;
          const bars=await API.klines(sym,cfg.tf,b.warmup+120,{signal:AbortSignal.timeout(8000)});
          if(!this.active(version)||bars.length<b.warmup)continue;
          const higher=b.needsHigher?await API.klines(sym,cfg.higherTf||'15m',300,{signal:AbortSignal.timeout(8000)}):null;
          const L=this.target==='manual'?Bots.ledgers.manual:{open:[],closed:[],daily:{},guards:{}},s=b.signal(bars,{...cfg,sym},structuredClone(L),higher);
          if(!s?.dir||s.closeLongs||s.score<(cfg.minScore||0))continue;
          const atr=s.atr||IND.atr(bars.slice(0,-1),14).at(-1);
          row.signal={...s,sym,tf:cfg.tf,atr,entryBar:bars.at(-1).rawTime,meta:{...s.meta,manualAutoSource:source,manualAutoSession:b.sessionGuard?s.session:null}};
          row.status='SETUP';
        }catch(e){row.status='ERROR';row.why=b.name+': '+e.message;}
      }
    }));
    return rows.sort((a,b)=>(b.signal?.score||0)-(a.signal?.score||0));
  },
};
