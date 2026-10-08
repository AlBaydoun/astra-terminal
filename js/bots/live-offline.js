/* Shutdown preparation never invents stops, changes positions or sends orders.
   It pauses ASTRA and checks what the broker has actually accepted. */
const LiveOffline = {
  busy: false, result: null,
  view(){
    let r = this.result;
    if(r?.ok && (Date.now()-r.at>60000 || Live.armedList().length))
      r={...r,ok:false,message:'The protection check has expired or live entries were restarted. Check again before switching off.'};
    return `<section class="liveOffline"><div><b>Prepare to switch off</b><p>Pause new live entries and check broker-held stop loss and take profit on every open position. Existing trades stay open. Trailing stops and new signals stop when this PC is off.</p></div><button class="bBtn" data-act="lvoffline" ${this.busy?'disabled':''}>${this.busy?'Checking…':'Pause entries & check protection'}</button>${r?`<div class="botNote ${r.ok?'':'warn'}"><b>${r.ok?'PROTECTION VERIFIED':'NOT READY'}</b> · ${esc(r.message)}<br><small>Checked ${new Date(r.at).toLocaleTimeString()}. Recheck after changing trades or restarting entries. Broker stops are not guaranteed fill prices.</small>${(r.rows||[]).map(p=>`<div>${esc(p.symbol)} · #${esc(String(p.ticket))} · SL ${esc(String(p.sl||'MISSING'))} · TP ${esc(String(p.tp||'MISSING'))}</div>`).join('')}</div>`:''}</section>`;
  },
  assess(j){
    if (!j || j.ok!==true || !j.account || !Array.isArray(j.positions) || !Number.isInteger(j.pendingOrders) || j.pendingOrders<0)
      throw Error('The broker returned an incomplete protection check. Keep the PC on.');
    const missing = j.positions.filter(p=>!Number.isFinite(p.sl)||p.sl<=0||!Number.isFinite(p.tp)||p.tp<=0);
    if (j.pendingOrders) return {ok:false,message:`${j.pendingOrders} pending broker order(s) can still open new trades. Review these in MetaTrader before switching off.`,rows:j.positions};
    if (missing.length) return {ok:false,message:`${missing.length} position(s) lack a broker stop or target. Set those levels in MetaTrader, then check again. No levels were changed automatically.`,rows:j.positions};
    return {ok:true,message:j.positions.length?`${j.positions.length} open position(s) have SL and TP saved at the broker. ASTRA entries are paused. Only those fixed broker levels continue with the PC off.`:'No open positions or pending broker orders. ASTRA live entries are paused.',rows:j.positions};
  },
  async prepare(){
    if(this.busy)return;
    this.busy=true;this.result=null;
    try{
      Live.kill('Preparing to switch off — new entries paused');
      if(typeof LiveManual!=='undefined')LiveManual.unlocked=false;
      // A request already sent can finish after the pause. Wait before reading
      // positions; never retry it and never assume a timeout means no fill.
      const deadline=Date.now()+22000;
      while((Live.inFlight||0)||(typeof LiveManual!=='undefined'&&LiveManual.busy)||(typeof LiveDesk!=='undefined'&&LiveDesk.busy)){
        if(Date.now()>deadline)throw Error('An order is still being processed. Keep the PC on and check again.');
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(Live.uncertainOrder||(typeof LiveManual!=='undefined'&&LiveManual.uncertain))
        throw Error('An earlier order has an uncertain outcome. Review MetaTrader before switching off.');
      const r=await fetch(Live.BRIDGE+'/shutdown-check',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!r.ok)throw Error('Cannot verify broker protection. Keep the PC on; check the bridge and MetaTrader connection.');
      const j=await r.json();
      if(Live.bridge.account&&j.account!==Live.bridge.account)throw Error('Broker account changed. Verify the account in MetaTrader.');
      if(Live.armedList().length || (typeof LiveDesk !== 'undefined' && LiveDesk.load().on))throw Error('Entries were armed again during this check. Pause and check again.');
      this.result={...this.assess(j),at:Date.now()};
    }catch(e){this.result={ok:false,message:e.message,at:Date.now()};}
    finally{this.busy=false;}
    return this.result;
  },
};
