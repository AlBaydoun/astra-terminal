/* Shared manual ticket with guarded real execution and opt-in signal sessions.
   Prepared broker requests are one-use, expire after 30s, and are checked again by MT5. */
const LiveManual = {
  id:'liveManual',draft:{sym:'',side:'buy',lots:'',sl:'',tp:'',amount:'',amountMode:'value',maxNotionalPct:100,maxCorrelated:2,maxPerSymbol:1},
  preview:null,revision:0,busy:false,loading:false,uncertain:false,positions:[],health:null,message:'Refresh account to begin.',timer:null,
  cash(v){return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';},
  price(v,digits=6){const d=Number.isInteger(digits)&&digits>=0&&digits<=8?digits:6;return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:Math.min(2,d),maximumFractionDigits:d}):'—';},
  symbols(){return [...(Feed.bridge?.symbols||[])].sort();},
  capture(){
    const host=document.getElementById('lmDesk');if(!host)return;
    host.querySelectorAll('[data-lm]').forEach(el=>this.draft[el.dataset.lm]=el.value);
    if(host.querySelector('#mbAmt'))this.draft.amount=host.querySelector('#mbAmt').value;
  },
  invalidate(){this.revision++;this.preview=null;this.status();},
  view(){
    const last=Live.loadBook().orders.find(o=>o.bot===this.id);
    if(last?.brokerSaid?.startsWith('UNCERTAIN:'))this.uncertain=true;
    const d=this.draft,syms=this.symbols();if(!syms.includes(d.sym))d.sym=syms.includes(Feed.brokerName(STORE.symbol))?Feed.brokerName(STORE.symbol):syms[0]||'';
    const S=Live.load(),C=S.caps;
    const field=(key,label,value,step='any')=>`<label class="bc">${label}<input data-lm="${key}" type="number" min="0" step="${step}" value="${esc(value)}"></label>`;
    return `<div id="lmDesk" class="lmDesk"><div class="lmBanner"><div><b>LIVE Trading Bot</b><p>Real JustMarkets account · every Buy or Sell here can move real money once armed.</p></div><button class="bBtn" data-ws-bot="manual">↩ Manual Trading Bot · paper</button></div>
      <div id="lmState" class="botNote"></div>
      <details class="wsTradeSection"><summary>Connection &amp; unlock · expand when ready</summary><p>The live bridge, session code, named arming and “TRADE REAL MONEY” confirmation are all required. Each page load starts this ticket locked.</p>
      <div class="lmActions"><button class="bBtn" data-ws-bot="live">Live connection &amp; account limits</button><button class="bBtn" data-lm-act="refresh">↻ Refresh account</button><button class="bBtn danger" data-lm-act="lock">Lock this ticket</button></div>
      <div class="lmActions"><label class="bc">Type LIVE trading bot<input id="lmArmName" autocomplete="off" placeholder="LIVE trading bot"></label><button class="bBtn" data-lm-act="arm">Arm in shadow</button><label class="bc">Confirm real trading<input id="lmRealPhrase" autocomplete="off" placeholder="TRADE REAL MONEY"></label><button class="bBtn danger" data-lm-act="live">Unlock real orders for this session</button></div></details>
      <section class="wsTradeSection"><h3>2 · Your market order</h3><p id="lmQuote"></p><div class="lmForm">
      </div>${Bots.manualTicketView(true)}
      <div hidden><input id="lmSearch"><select data-lm="sym">${syms.map(s=>`<option value="${esc(s)}"${s===d.sym?' selected':''}>${esc(s)}</option>`).join('')}</select><select data-lm="side"><option value="buy">buy</option><option value="sell">sell</option></select>${field('lots','Lots',d.lots)}${field('sl','Stop',d.sl)}${field('tp','Target',d.tp)}</div>
      <details><summary>Live account rules and position budgets</summary><p>Risk, lot, count and loss limits are shared with the existing Live Trading controls. Position-value and correlation ceilings below apply to this manual ticket for this session.</p><div class="lmForm">
      ${['riskPct','maxLots','maxOpen','maxDailyLossPct','maxTotalLossPct'].map((k,i)=>field(k,['Risk per trade · % equity','Maximum lots','Maximum real positions','Daily loss · % equity (UTC)','Total loss · % since linking'][i],C[k])).join('')}
      ${field('maxNotionalPct','Total position value · % equity',d.maxNotionalPct)}${field('maxCorrelated','Positions sharing a currency',d.maxCorrelated,'1')}${field('maxPerSymbol','Positions per pair · hedging account',d.maxPerSymbol??1,'1')}
      </div><button class="bBtn" data-lm-act="save">Save shared limits &amp; allow selected pair</button><p id="lmAllowed"></p></details>
      <div class="lmActions"><button class="bBtn" data-lm-act="chart">Open pair chart ↗</button></div>
      <div id="lmPreview" class="lmPreview" hidden></div>
      <div class="lmActions"><button class="bBtn danger" id="lmSend" data-lm-act="send" disabled>Confirm real market order</button><button class="bBtn" id="lmReviewed" data-lm-act="reviewed" hidden>I checked the uncertain outcome in MT5</button></div><p id="lmMessage" role="status"></p>
      <p>Accepted SL/TP levels are held by the broker and remain active with your PC off. Gaps can fill beyond a stop. Pending orders, trailing stops and stop edits are managed in MetaTrader. Automatic market entries have their own Start control below.</p></section>
      ${typeof ManualAuto!=='undefined'?this.automation().view():''}
      <section class="wsTradeSection"><h3>3 · Real open trades</h3><div id="lmPositions"></div><p>These are broker positions across the account. Close buttons appear only for trades opened by this LIVE Trading Bot. Manage stop/target changes and other positions directly in MT5.</p></section></div>`;
  },
  unlocked:false,
  stateGate(){
    const S=Live.load(),a=S.armed[this.id];
    if(Live.loadBook().orders.find(o=>o.bot===this.id)?.brokerSaid?.startsWith('UNCERTAIN:'))this.uncertain=true;
    if(this.uncertain)return 'Previous submission needs checking in MetaTrader. This ticket is locked; do not retry the trade blindly.';
    if(!this.health||Date.now()-this.health.readAt>30000)return 'Refresh the real account before submitting.';
    if(this.health.manualTickets!==1)return 'BRIDGE UPDATE NEEDED · close the ordinary bridge window and reopen START-MT5-Bridge.bat to load this ticket’s broker support.';
    if(!this.health.trading||!Live.bridge.trading)return 'READ-ONLY · start the live bridge and enter its session code in Live connection & account limits.';
    if(!S.linked||!/^\d{6}$/.test(S.code||''))return 'Enter the live bridge session code in the connection page.';
    if(S.killedAt||!a)return 'LOCKED · explicitly arm LIVE trading bot first.';
    if(a.mode!=='live'||!this.unlocked)return 'SHADOW / LOCKED · no real orders will be sent.';
    return '';
  },
  status(){
    const host=document.getElementById('lmDesk');if(!host)return;
    const S=Live.load(),why=this.stateGate(),h=this.health;
    host.querySelector('#lmState').textContent=(why||'LIVE · this session may submit the exact trade you review.')+(h?` Account ${h.account} · ${h.server} · balance ${this.cash(h.balance)} · equity ${this.cash(h.equity)} ${h.currency}`:'');
    host.querySelector('#lmAllowed').textContent=S.caps.instruments.includes(this.draft.sym)?'Selected pair is on your live allow-list.':'Selected pair must be allowed using Save shared limits & allow selected pair.';
    host.querySelector('#lmMessage').textContent=this.message;
    const funds=host.querySelector('#mbFunds');if(funds)funds.textContent=h?`Real equity ${this.cash(h.equity)} ${h.currency} · free margin ${this.cash(h.margin_free)} ${h.currency}`:'Waiting for real account balances';
    const px=host.querySelector('#mbPx');if(px)px.textContent=this.price(STORE.tickers.get(this.draft.sym)?.last);
    host.querySelector('#lmReviewed').hidden=!this.uncertain;
    const q=STORE.tickers.get(this.draft.sym);
    host.querySelector('#lmQuote').textContent=Feed.isLive(this.draft.sym)?`${this.draft.sym} · broker Bid ${q?.bid??'—'} / Ask ${q?.ask??'—'}`:'Waiting for a fresh broker quote for '+this.draft.sym;
    const p=this.preview;
    host.querySelector('#lmSend').disabled=this.busy||!!why||!p||Date.now()-p.receivedAt>25000;
    host.querySelector('#lmSend').textContent=p?`Confirm REAL ${this.draft.side.toUpperCase()} ${p.lots} lots · ${this.draft.sym}`:'Confirm real market order';
    if(!p)host.querySelector('#lmPreview').textContent='No current order preview. Calculate again after changing any field.';
    const calc=host.querySelector('#mbCalc');if(calc)calc.innerHTML=host.querySelector('#lmPreview').innerHTML;
  },
  async json(path,options){
    const r=await fetch(Live.BRIDGE+path,{cache:'no-store',signal:AbortSignal.timeout(15000),...options});
    let j;try{j=await r.json();}catch(e){throw Error('Bridge response could not be read');}
    if(!r.ok||j.ok===false)throw Error(j.message||j.error||'Broker request refused');return j;
  },
  async refresh(){
    if(this.loading)return this.refreshPromise;this.loading=true;
    this.refreshPromise=(async()=>{
    try{
      const [h,p]=await Promise.all([this.json('/health'),this.json('/positions')]);
      if(!Array.isArray(p.positions)||!Number.isFinite(h.equity)||!h.account)throw Error('Incomplete broker account response');
      if(this.health&&(this.health.account!==h.account||this.health.server!==h.server)){this.unlocked=false;this.invalidate();this.message='Broker account changed. Reconnect and arm again.';}
      this.health={...h,readAt:Date.now()};this.positions=p.positions;
      Live.bridge={...Live.bridge,...h,checked:Date.now()};
      if(this.draft.sym)await Feed.quotes([this.draft.sym],{strict:true});
      this.renderPositions();
    }catch(e){this.health=null;this.preview=null;this.message='Account refresh failed: '+e.message;}
    finally{this.loading=false;this.status();}
    })();return this.refreshPromise;
  },
  parameters(){
    const C=Live.load().caps,d=this.draft;
    for(const k of ['riskPct','maxLots','maxOpen','maxDailyLossPct','maxTotalLossPct']){
      if(d[k]!==undefined&&Number(d[k])!==C[k])throw Error('Save your changed shared live limits before reviewing an order');
    }
    return {symbol:d.sym,side:d.side,lots:d.lots||0,sl:d.sl,tp:d.tp||0,amount:d.amount||0,amountMode:d.amountMode||'value',...Object.fromEntries(['riskPct','maxLots','maxOpen','maxDailyLossPct','maxTotalLossPct'].map(k=>[k,C[k]])),
      maxNotionalPct:d.maxNotionalPct,maxCorrelated:d.maxCorrelated,maxPerSymbol:d.maxPerSymbol??1,startBalance:Live.state.startBalance||this.health?.balance};
  },
  permission(forOrder=true){
    const d=this.draft,S=Live.load();
    if(!this.symbols().includes(d.sym))throw Error('Choose an exact instrument from this broker account');
    if(forOrder&&PairRules.blocked(d.sym))throw Error('This pair is blocked in Instrument permissions');
    if(forOrder&&!S.caps.instruments.includes(d.sym))throw Error('Allow this pair in the live rules first');
    const now=Live.hhmm(),C=S.caps;
    if(!/^\d{2}:\d{2}$/.test(C.sessionFrom)||!/^\d{2}:\d{2}$/.test(C.sessionTo))throw Error('Set valid live trading hours');
    if(forOrder&&(C.sessionFrom<=C.sessionTo?(now<C.sessionFrom||now>C.sessionTo):(now<C.sessionFrom&&now>C.sessionTo)))throw Error('Outside your live trading hours');
    if(!Feed.isLive(d.sym)||Feed.srcOf[d.sym]!=='bridge')throw Error('Waiting for a fresh broker price');
  },
  async calculate(){
    if(this.busy)return;this.capture();this.invalidate();const revision=this.revision;this.busy=true;this.message='Reading the broker’s risk and margin calculations…';this.status();
    try{
      await this.refresh();await Feed.quotes([this.draft.sym],{strict:true});this.permission(false);
      if(this.health?.manualTickets!==1)throw Error('Close the ordinary bridge window and reopen START-MT5-Bridge.bat to load the new preview support');
      if(Number(this.draft.amount)>0&&this.health?.manualTicketSizing!==2)throw Error('Restart the ordinary bridge to enable account-currency amount and slider sizing');
      const parameters=JSON.stringify(this.parameters());
      let p;
      for(let attempt=0;attempt<4;attempt++){
        try{p=await this.json('/manual-preview?'+new URLSearchParams(JSON.parse(parameters)));break;}
        catch(e){
          if(!e.message.startsWith('Waiting for a new broker tick')||attempt===3)throw e;
          this.message='Waiting for a newly arriving broker tick…';this.status();
          await new Promise(resolve=>setTimeout(resolve,750));
          if(revision!==this.revision)throw Error('The ticket changed; calculate it again');
        }
      }
      if(revision!==this.revision)return;
      if(p.account!==this.health?.account||p.server!==this.health?.server)throw Error('Broker account changed during the preview');
      if(!p.previewId||!['lots','risk','margin','entry','sl','tp'].every(k=>Number.isFinite(p[k]))||p.lots<=0||p.sl<=0)throw Error('Incomplete broker preview');
      if(parameters!==JSON.stringify(this.parameters()))throw Error('Live limits changed during the preview. Calculate again');
      this.preview={...p,parameters,receivedAt:Date.now()};this.message='Review the exact size and levels below. Preview expires after 25 seconds; no order has been sent.';
      const cell=(label,v)=>`<div><span>${label}</span><b>${v}</b></div>`;
      const host=document.getElementById('lmPreview');if(host)host.innerHTML=cell('Real lots',p.lots)+cell('Entry estimate',this.price(p.entry,p.digits))+cell('Broker stop',this.price(p.sl,p.digits))+cell('Broker target',p.tp?this.price(p.tp,p.digits):'None')+cell('Estimated stop loss','−'+this.cash(p.risk)+' '+esc(p.currency))+cell('Estimated target profit',p.reward===null?'None':this.cash(p.reward)+' '+esc(p.currency))+cell('Broker margin',this.cash(p.margin))+cell('Position value',this.cash(p.notional));
    }catch(e){this.message='Preview: '+e.message+(String(e.message).includes('not_found')?' · Restart the ordinary bridge to load this update.':'');}
    finally{this.busy=false;this.status();}
  },
  async send(){
    if(this.busy)return;const p=this.preview,revision=this.revision;
    if(!p||Date.now()-p.receivedAt>25000){this.message='Calculate a fresh preview first.';this.status();return;}
    this.busy=true;this.status();let sent=false;
    try{
      await this.refresh();await Feed.quotes([this.draft.sym],{strict:true});
      if(revision!==this.revision)throw Error('The ticket changed. Review it again');
      const why=this.stateGate();if(why)throw Error(why);this.permission();
      if(p.parameters!==JSON.stringify(this.parameters()))throw Error('Your live limits or ticket changed since review. Calculate again');
      if(p.account!==this.health.account||p.server!==this.health.server)throw Error('The connected account changed');
      this.preview=null;sent=true;
      const r=await fetch(Live.BRIDGE+'/manual-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:Live.load().code,previewId:p.previewId}),signal:AbortSignal.timeout(15000)});
      const j=await r.json();
      if(j.unknown||j.partial){this.uncertain=true;this.unlocked=false;}
      this.message=j.ok?`Broker filled ticket ${j.ticket} · ${j.volume} lots at ${j.price}. Confirm the saved stop and target in the positions below.`:j.partial?'Broker partially filled the order. Inspect the real position in MT5 before another entry.':j.message||j.comment||'Broker refused the order.';
      const saved=Live.record({bot:this.id,botName:'LIVE trading bot',sym:this.draft.sym,dir:this.draft.side==='buy'?1:-1,lots:p.lots,entry:j.price||p.entry,sl:p.sl,tp:p.tp,sent:true,ok:!!j.ok,ticket:j.ticket||null,at:Date.now(),brokerSaid:(this.uncertain?'UNCERTAIN: ':'')+this.message+(this.autoContext||'')});
      if(!saved){this.uncertain=true;this.unlocked=false;this.message+=' Local audit could not be saved. Inspect MT5 before another trade.';}
      await this.refresh();return !!j.ok&&!this.uncertain;
    }catch(e){
      if(sent){this.uncertain=true;this.unlocked=false;Live.record({bot:this.id,sym:this.draft.sym,sent:true,ok:false,at:Date.now(),brokerSaid:'UNCERTAIN: '+e.message+(this.autoContext||'')});}
      this.message=(sent?'Submission outcome uncertain; check MT5 before doing anything else. ':'Not sent: ')+e.message;
    }
    finally{this.busy=false;this.status();}
  },
  renderPositions(){
    const el=document.getElementById('lmPositions');if(!el)return;
    el.innerHTML=this.positions.map(p=>`<article class="lmPosition otCard ${p.profit>=0?'up':'down'}"><div>${WorkspaceUI.pair(p.symbol)} <b>${esc(p.type.toUpperCase())}</b> · ticket ${p.ticket}</div><div class="lmForm"><span>Lots <b>${p.volume}</b></span><span>Entry <b>${this.price(p.price_open)}</b></span><span>Now <b>${this.price(p.price_current)}</b></span><span>Profit <b class="${p.profit>=0?'up':'down'}">${this.cash(p.profit)} ${esc(this.health?.currency||'USD')}</b></span><span>Broker SL <b>${p.sl?this.price(p.sl,p.digits):'NONE'}</b></span><span>Broker TP <b>${p.tp?this.price(p.tp,p.digits):'None'}</b></span></div><div class="wsPriceMap">${WorkspaceUI.priceMap({entry:p.price_open,sl:p.sl,tp:p.tp},{px:p.price_current,stale:!this.health||Date.now()-this.health.readAt>30000})}</div>${p.comment==='ASTRA liveManual'&&p.magic===(this.health?.magic||20260902)?`<button class="bBtn danger" data-lm-close="${p.ticket}">Close this REAL position</button>`:''}</article>`).join('')||'<p>No real positions are open.</p>';
  },
  async close(ticket){
    if(this.busy||!confirm('Close REAL broker position '+ticket+' at market?'))return;
    this.busy=true;this.status();
    try{
      const account=this.health?.account;await this.refresh();const p=this.positions.find(p=>p.ticket===ticket&&p.comment==='ASTRA liveManual'&&p.magic===this.health?.magic);
      const S=Live.load();if(!p||account!==this.health?.account||!S.linked||!this.health?.trading)throw Error('Cannot verify this position and the linked account');
      const j=await this.json('/close',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:S.code,ticket})});
      this.message=j.ok?'Broker confirmed the close.':'Broker did not confirm the close.';await this.refresh();
    }catch(e){this.message='Close not confirmed. Inspect the position in MT5: '+e.message;}
    finally{this.busy=false;this.status();}
  },
  bind(host){
    this.bindSharedTicket(host);this.status();this.refresh();clearInterval(this.timer);this.timer=setInterval(()=>{if(Bots.active===this.id)this.refresh();else{clearInterval(this.timer);this.timer=null;}},5000);
    if(typeof ManualAuto!=='undefined')this.automation().bind(host);
    host.querySelectorAll('[data-lm]').forEach(el=>el.addEventListener('input',()=>{
      this.auto?.stop('Live settings changed. Start a new session when ready.');
      if(el.dataset.lm==='sym'||el.dataset.lm==='side'){
        for(const k of ['sl','tp','lots'])host.querySelector(`[data-lm="${k}"]`).value='';
      }
      this.capture();this.invalidate();
    }));
    host.querySelector('#lmSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();host.querySelectorAll('[data-lm="sym"] option').forEach(o=>o.hidden=!o.textContent.toLowerCase().includes(q));});
    host.querySelectorAll('[data-lm-level]').forEach(el=>el.addEventListener('click',()=>{const q=STORE.tickers.get(this.draft.sym),entry=this.draft.side==='buy'?q?.ask:q?.bid;if(!(entry>0)){this.message='Refresh broker prices first.';return this.status();}const sign=(el.dataset.lmLevel==='sl'?-1:1)*(this.draft.side==='buy'?1:-1);host.querySelector(`[data-lm="${el.dataset.lmLevel}"]`).value=entry*(1+sign*Number(el.dataset.pct)/100);this.capture();this.invalidate();}));
    host.querySelector('#lmPositions').addEventListener('click',e=>{const b=e.target.closest('[data-lm-close]');if(b)this.close(Number(b.dataset.lmClose));});
    host.querySelectorAll('[data-lm-act]').forEach(el=>el.addEventListener('click',async()=>{
      const action=el.dataset.lmAct;
      if(action==='preview')return this.calculate();if(action==='send')return this.send();if(action==='refresh')return this.refresh();
      if(action==='chart')return WorkspaceUI.openChart(this.draft.sym);
      if(action==='reviewed'){
        if(!confirm('Have you checked both Positions and History in MetaTrader and identified the outcome of the uncertain order? This does not retry it.'))return;
        await this.refresh();if(!this.health)return;
        try{await this.json('/manual-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:Live.load().code,acknowledgement:'CHECKED MT5'})});}
        catch(e){this.message='Could not record the broker review: '+e.message;return this.status();}
        if(!Live.record({bot:this.id,sent:false,refused:'Operator reviewed uncertain outcome in MT5',brokerSaid:'REVIEWED',at:Date.now()})){this.message='Review acknowledgement could not be saved.';return this.status();}
        this.uncertain=false;this.unlocked=false;this.invalidate();this.message='Review recorded. Explicitly unlock this session again before preparing another real entry.';
      }
      if(action==='lock'){this.auto?.stop('Live ticket locked.');this.unlocked=false;this.invalidate();Live.disarm(this.id,'manual ticket locked');this.message='Ticket locked.';}
      if(action==='save'){
        this.capture();const S=Live.load();const next={...S.caps};
        for(const k of ['riskPct','maxLots','maxOpen','maxDailyLossPct','maxTotalLossPct']){const v=Number(this.draft[k]);if(!(v>0&&Number.isFinite(v))){this.message='Enter positive, finite live limits.';return this.status();}next[k]=v;}
        if(!next.instruments.includes(this.draft.sym))next.instruments=[...next.instruments,this.draft.sym];S.caps=next;
        if(lsSet('astra_live',S)===false){this.message='Live rules could not be saved.';return this.status();}this.invalidate();this.message='Shared live limits saved; selected pair allowed.';
      }
      if(action==='arm'){
        const name=host.querySelector('#lmArmName').value;const r=Live.arm(this.id,Live.load().caps,name);this.unlocked=false;this.invalidate();this.message=r.ok?'Armed in shadow. Unlock real orders separately.':r.why;
      }
      if(action==='live'){
        await this.refresh();const r=Live.goLive(this.id,host.querySelector('#lmRealPhrase').value);this.unlocked=!!r.ok;this.invalidate();this.message=r.ok?'Real orders unlocked for this page session. Review every order before confirming.':r.why;
      }
      this.status();
    }));
  },
  bindSharedTicket(host){
    // Both desks render Bots.manualTicketView. Only this adapter touches the
    // real transport; the paper form's open/save handlers are never bound here.
    const pick=host.querySelector('#mbSym');if(!pick)return;
    const d=this.draft,box=k=>host.querySelector('[data-lm="'+k+'"]');
    const sync=()=>{
      this.auto?.stop('Ticket changed. Start a new automatic session when ready.');
      for(const [id,key] of [['mbSl','sl'],['mbTp','tp'],['mbQty','lots']])box(key).value=host.querySelector('#'+id).value;
      box('sym').value=d.sym;box('side').value=d.side;this.capture();this.invalidate();
      host.querySelector('#mbCalc').textContent='Calculate to see broker-valued profit, loss and margin in '+(this.health?.currency||'USD')+'. No order is sent by calculation.';
    };
    pick.dataset.val=d.sym;pick.textContent=d.sym||'Choose broker instrument';
    for(const [id,key] of [['mbSl','sl'],['mbTp','tp'],['mbQty','lots'],['mbAmt','amount']])host.querySelector('#'+id).value=d[key]||'';
    box('side').value=d.side;
    pick.addEventListener('click',()=>SymbolSearch.open(sym=>{
      const exact=Feed.brokerName(sym);if(!this.symbols().includes(exact)){this.message='Choose an instrument on this JustMarkets account';return this.status();}
      d.sym=exact;pick.dataset.val=exact;pick.textContent=exact;
      ['mbSl','mbTp','mbQty','mbAmt'].forEach(id=>host.querySelector('#'+id).value='');sync();this.refresh();
    }));
    // Real pending entries require a broker-held order; a browser-only imitation
    // would silently disappear with the PC off. Keep the unsupported choices clear.
    const type=host.querySelector('#mbOrderType');type.value='market';
    [...type.options].forEach(o=>{if(o.value!=='market'){o.disabled=true;o.textContent+=' · paper / MT5';}});
    host.querySelector('#mbTf').disabled=true;
    host.querySelector('#mbNote').closest('label').hidden=true;
    host.querySelector('#mbOrderHint').textContent='REAL market ticket · broker-held SL / TP · pending orders can be placed directly in MT5.';
    host.querySelectorAll('[data-mbside]').forEach(el=>el.addEventListener('click',()=>{
      d.side=+el.dataset.mbside>0?'buy':'sell';host.querySelectorAll('[data-mbside]').forEach(x=>x.classList.toggle('on',x===el));
      ['mbSl','mbTp'].forEach(id=>host.querySelector('#'+id).value='');sync();
    }));
    ['mbSl','mbTp','mbQty','mbAmt'].forEach(id=>host.querySelector('#'+id).addEventListener('input',()=>{
      if(id==='mbQty')host.querySelector('#mbAmt').value='';if(id==='mbAmt')host.querySelector('#mbQty').value='';sync();
    }));
    const share=pct=>{
      if(!(this.health?.equity>0)){this.message='Refresh the real account first';return this.status();}
      d.amountMode='value';host.querySelector('#mbPct').value=pct;
      host.querySelector('#mbAmt').value=pct>0?(this.health.equity*pct/100).toFixed(2):'';host.querySelector('#mbQty').value='';
      host.querySelectorAll('[data-mbamt]').forEach(x=>x.classList.toggle('on',x.dataset.mbamt==='value'));sync();
    };
    host.querySelector('#mbPct').addEventListener('input',e=>share(+e.target.value));
    host.querySelectorAll('[data-mbfund]').forEach(el=>el.addEventListener('click',()=>share(+el.dataset.mbfund)));
    host.querySelectorAll('[data-mbamt]').forEach(el=>el.addEventListener('click',()=>{d.amountMode=el.dataset.mbamt;host.querySelectorAll('[data-mbamt]').forEach(x=>x.classList.toggle('on',x===el));sync();}));
    host.querySelectorAll('[data-mbpct]').forEach(el=>el.addEventListener('click',()=>{
      const [which,pct]=el.dataset.mbpct.split(':'),q=STORE.tickers.get(d.sym),entry=d.side==='buy'?q?.ask:q?.bid;
      if(!(entry>0)){this.message='Waiting for a broker quote';return this.status();}
      host.querySelector(which==='sl'?'#mbSl':'#mbTp').value=+(entry*(1+(which==='sl'?-1:1)*(d.side==='buy'?1:-1)*+pct/100)).toPrecision(12);sync();
    }));
  },
  automation(){
    if(this.auto)return this.auto;
    const auto=Object.create(ManualAuto);
    Object.assign(auto,{target:'liveManual',draft:{...ManualAuto.draft,mode:'confluence'},running:false,starting:false,busy:false,revision:0,timer:null,release:null,seen:new Set(),events:[],count:0,status:'Stopped · real automatic entries require an unlocked desk and a qualified strategy.'});
    auto.view=function(){return ManualAuto.view.call(this).replace('manual paper account','REAL JustMarkets account').replace('Start selected signals · paper','Start selected signals · REAL').replace('Experimental, with no established profitability. Sessions stop on reload. Keep ASTRA, the bridge and PC running for paper entries and exits. Stopping automatic entries leaves existing positions and separately placed price instructions active.','Real automation requires the existing strategy-readiness checks. Sessions stop on reload or when you leave this desk. Keep the PC, bridge and ASTRA running for new entries. Accepted stops and targets remain at the broker. No pending price instructions are created here.');};
    const bind=auto.bind;
    auto.bind=function(host){bind.call(this,host);const mode=host.querySelector('[data-ma="mode"]');mode.value='confluence';mode.disabled=true;mode.querySelector('[value="price"]').disabled=true;};
    const refresh=auto.refresh;
    auto.refresh=function(){refresh.call(this);const host=document.querySelector('[data-auto-target="liveManual"]');if(host){host.querySelector('[data-ma="mode"]').disabled=true;host.querySelector('#maStatus').textContent=this.status+' · '+this.count+' REAL entries this session';}};
    auto.start=async function(){
      await LiveManual.refresh();const why=LiveManual.stateGate(),source=this.draft.source||'confluence',ready=Live.readiness(source);
      if(why||!ready.ok){this.status=why||ready.why||'This strategy has not passed the live-readiness checks';this.refresh();return false;}
      if(!confirm('Start REAL automatic entries from '+(BOT_BY_ID[source]?.name||source)+' using the displayed limits? Each qualifying signal can send an order until you stop this session.'))return false;
      return ManualAuto.start.call(this);
    };
    auto.stop=function(message){ManualAuto.stop.call(this,message);LiveManual.invalidate();};
    auto.enter=async function(row,version){
      if(!this.active(version))return;
      if(Bots.active!=='liveManual')return this.stop('Stopped because you left the live desk.');
      const source=this.config.source||'confluence',ready=Live.readiness(source);
      if(!ready.ok||LiveManual.stateGate())return this.stop(ready.why||LiveManual.stateGate());
      const s=row.signal,key=source+':'+row.sym+':'+s.entryBar;
      const session=s.meta?.manualAutoSession,tag=' [auto '+key+']',sessionTag=session?' [session '+source+':'+row.sym+':'+session+']':'';
      if(this.seen.has(key)||Live.loadBook().orders.some(o=>o.bot==='liveManual'&&(o.brokerSaid?.includes(tag)||(sessionTag&&o.brokerSaid?.includes(sessionTag)))))return;
      await Feed.loadSpecs([row.sym]);await Feed.quotes([row.sym]);
      if(!this.active(version))return;
      const why=this.entryReason(s,Bots.quoteFor(row.sym));if(why)return this.log(row.sym,why);
      const d=LiveManual.draft,q=STORE.tickers.get(row.sym),entry=s.dir>0?q?.ask:q?.bid;
      if(!(entry>0))return this.log(row.sym,'Waiting for a broker quote');
      Object.assign(d,{sym:row.sym,side:s.dir>0?'buy':'sell',lots:'',amount:LiveManual.health.equity*this.config.allocation/100,amountMode:'value',sl:this.config.exits==='signal'?s.sl:entry*(1-s.dir*this.config.sl/100),tp:this.config.exits==='signal'?s.tp:entry*(1+s.dir*this.config.tp/100)});
      const host=document.getElementById('lmDesk');if(!host)return this.stop('Live desk closed');
      for(const k of ['sym','side','lots','sl','tp'])host.querySelector('[data-lm="'+k+'"]').value=d[k];
      for(const [id,k] of [['mbSl','sl'],['mbTp','tp'],['mbQty','lots'],['mbAmt','amount']])host.querySelector('#'+id).value=d[k];
      host.querySelector('#mbSym').textContent=row.sym;host.querySelector('#mbSym').dataset.val=row.sym;
      host.querySelectorAll('[data-mbside]').forEach(x=>x.classList.toggle('on',+x.dataset.mbside===s.dir));
      await LiveManual.calculate();if(!this.active(version))return;
      if(!LiveManual.preview)return this.log(row.sym,LiveManual.message);
      const expired=this.entryReason(s,Bots.quoteFor(row.sym));
      if(expired||!Live.readiness(source).ok){LiveManual.invalidate();return this.log(row.sym,expired||'Strategy qualification changed');}
      // Claim before sending; an uncertain result is never retried automatically.
      this.seen.add(key);
      LiveManual.autoContext=tag+sessionTag;
      try{if(await LiveManual.send()){this.count++;this.log(row.sym,'REAL '+d.side+' confirmed by broker');}
      else return this.stop(LiveManual.message);}finally{LiveManual.autoContext='';}
      if(this.config.entries>0&&this.count>=this.config.entries)this.stop('Real session entry count reached.');
    };
    const pulse=auto.pulse;
    auto.pulse=function(){if(Bots.active!=='liveManual'){this.stop('Stopped because you left the live desk.');return;}return pulse.call(this);};
    this.auto=auto;return auto;
  },
};
