/* Full JustMarkets catalogue; one closed-bar calculation per pair per M15 bar.
   This scanner only supplies evidence. The paper runner owns every entry gate. */
const ConfluenceScanner = {
  rows:[], cache:new Map(), pending:null, timer:null, pulsing:false,
  done:0,total:0,at:0,search:'',filter:'all',scanNumber:0,
  catalogue(){return [...new Set(MarketSources.brokerList().map(s=>Feed.brokerName(s)))].sort();},
  slot(){return Math.floor(Date.now()/900000);},
  async scan(force=false){
    if(this.pending) return this.pending;
    const symbols=this.catalogue(), slot=this.slot();
    this.total=symbols.length;this.done=0;
    const rows=symbols.map(sym=>{
      const c=this.cache.get(sym);
      return c?.slot===slot && !force ? c.row : {sym,status:'QUEUED',why:'Waiting for this scan',signal:null};
    });
    const jobs=rows.filter(r=>r.status==='QUEUED' || (r.status==='ERROR' && Date.now()-(r.checkedAt||0)>60000));
    this.rows=rows;this.done=rows.length-jobs.length;
    if(!jobs.length){this.refresh();return this.rows;}
    this.scanNumber++;
    // A new slot must never retain a previously actionable signal after a failed request.
    for(const r of jobs){r.signal=null;r.move=null;r.status='QUEUED';r.why='Waiting for fresh candles';}
    let next=0;
    this.pending=(async()=>{
      await Promise.all(Array.from({length:Math.min(6,jobs.length)},async()=>{
        for(;;){
          const r=jobs[next++];if(!r) return;
          const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
          try{
            if(!MarketSources.allowed(r.sym) || !Feed.bridgeHas(r.sym)) throw Error('JustMarkets instrument disconnected');
            const bars=await API.klines(r.sym,'15m',Confluence.warmup+1,{signal:controller.signal});
            if(!MarketSources.allowed(r.sym) || !Feed.bridgeHas(r.sym)) throw Error('JustMarkets instrument disconnected');
            const s=Confluence.inspect(bars,bars.length-1,'15m');s.sym=r.sym;
            if(bars.length>=23){
              const i=bars.length-2,last=bars[i],prior=bars.slice(i-20,i);
              const tr=(b,prev)=>Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));
              const mean=prior.reduce((sum,b,j)=>sum+tr(b,bars[i-21+j]),0)/20;
              if(mean>0&&Number.isFinite(mean)&&bars[i+1].rawTime-last.rawTime===900)
                r.move={time:last.rawTime,ratio:tr(last,bars[i-1])/mean};
            }
            r.signal=s;r.status=s.dir?'SETUP':'WAIT';r.why=s.dir?'All five checks passed':s.failed?.[0]||'Waiting';
            r.adx=Number(s.checks?.find(c=>c.name==='ADX strength')?.value.split(' / ')[0])||0;
          }catch(e){
            r.status='ERROR';r.why=controller.signal.aborted?'Candle request timed out':e.message;
            // Every failure remains visible with its exact pair and reason.
          }finally{
            clearTimeout(timeout);r.checkedAt=Date.now();this.cache.set(r.sym,{slot,row:r});this.done++;
            if(this.done%12===0 || this.done===this.total)this.refresh();
          }
        }
      }));
      const enabled=new Set(this.catalogue());this.rows=this.rows.filter(r=>enabled.has(r.sym));
      for(const sym of this.cache.keys())if(!enabled.has(sym))this.cache.delete(sym);
      this.at=Date.now();return this.rows;
    })();
    this.refresh();
    try{return await this.pending;}finally{this.pending=null;this.refresh();}
  },
  async quotesForSetups(){
    const offset=Feed.bridgeClock?.offset, now=Date.now()/1000;
    const active=this.rows.filter(r=>r.signal?.dir && (!Number.isFinite(offset) || (now+offset-r.signal.entryBar>=0 && now+offset-r.signal.entryBar<=90)));
    const syms=active.map(r=>r.sym);
    for(let i=0;i<syms.length;i+=40){await Feed.loadSpecs(syms.slice(i,i+40));await Feed.quotes(syms.slice(i,i+40));}
    for(const r of this.rows){
      r.costRatio=Infinity;
      if(!r.signal?.dir) continue;
      const q=Bots.quoteFor(r.sym),why=ConfluenceBot.entryReason(r.signal,q);
      if(why){r.status='WAIT';r.why=why;continue;}
      const costs=q.spread+2*q.price*BotEngine.commissionFrac(r.sym,BotEngine.RISK)+2*q.price*BotEngine.RISK.slippagePct/100;
      r.costRatio=costs/r.signal.atr;r.status='SETUP';r.why='Fresh setup — checking account limits';
    }
    return this.rows.filter(r=>r.status==='SETUP').sort((a,b)=>a.costRatio-b.costRatio || b.adx-a.adx || a.sym.localeCompare(b.sym));
  },
  async pulse(force=false){
    if(this.pulsing || !Bots.cfgs.confluence) return;
    if(!force && !ConfluenceBot.config().scannerOn) return;
    this.pulsing=true;
    try{await this.scan(force);await ConfluenceBot.run(BOT_BY_ID.confluence,false,true);}
    catch(e){console.error('ASTRA Confluence scanner:',e);ConfluenceBot.last={why:'Scanner failed: '+e.message};}
    finally{this.pulsing=false;this.refresh();}
  },
  start(){
    if(this.timer) return;
    this.timer=setInterval(()=>this.pulse(),15000);setTimeout(()=>this.pulse(),1000);
  },
  setOn(on){
    const cfg={...lsGet('astra_botcfg_confluence',Bots.cfgs.confluence||{}),scannerOn:on};
    if(!on)cfg.paused=true;
    if(lsSet('astra_botcfg_confluence',cfg)===false)return toast('Could not save scanner setting','warn');
    Bots.cfgs.confluence=cfg;ConfluenceBot.revision++;Bots.render();
    if(on)this.pulse();
  },
  summary(){
    const ready=this.rows.filter(r=>r.status==='READY').length, setups=this.rows.filter(r=>r.signal?.dir).length;
    const errors=this.rows.filter(r=>r.status==='ERROR').length;
    return `${ConfluenceBot.config().scannerOn?'AUTOMATIC SCANNER ON':'SCANNER PAUSED'} · ${this.pending?this.done+' / '+this.total+' checked':this.rows.length+' JustMarkets instruments'} · ${setups} setups · ${ready} ready · ${errors} data issues`+
      (this.at?' · Last full scan '+new Date(this.at).toLocaleTimeString():'');
  },
  controls(){return `<div class="botCtl"><button class="bBtn" data-cfs="toggle">${ConfluenceBot.config().scannerOn?'Pause scanner':'Start automatic scanner'}</button>
    <button class="bBtn" data-cfs="scan">Scan all now</button><button class="bBtn" data-cfs="bot">Open Confluence bot</button></div>`;},
  view(compact=false){return `<div class="botNote" id="cfScanStatus">${esc(this.summary())}</div>
    <div class="botNote">All JustMarkets instruments, M15. Fresh candles checked each 15-minute bar; readiness checked every 15 seconds. Lowest estimated round-trip cost relative to ATR ranks first, then ADX strength. Ranking is not a profit forecast. Signals expire after 90 seconds. The bot can open multiple eligible pairs per scan. Set position counts, repeat entries and size budgets in Open Confluence bot. Each completed-candle signal can open only once.</div>
    ${compact?'<button class="bBtn" data-cfs="page">Open full Confluence Scanner</button>':`<div class="botCtl"><label class="bc">Find pair <input id="cfScanSearch" value="${esc(this.search)}" placeholder="e.g. ETH, gold, AAPL"></label><label class="bc">Show <select id="cfScanFilter"><option value="all"${this.filter==='all'?' selected':''}>All instruments</option><option value="signals"${this.filter==='signals'?' selected':''}>Buy / sell setups</option><option value="ready"${this.filter==='ready'?' selected':''}>Ready to enter</option><option value="issues"${this.filter==='issues'?' selected':''}>Blocked / data issues</option></select></label></div>`}
    <div style="overflow:auto;max-height:${compact?'220':'520'}px"><table class="scTable"><thead><tr><th>PAIR</th><th>SIGNAL</th><th>CHECKS</th><th>STATE</th><th>WHY</th><th>SL / TP</th><th></th></tr></thead><tbody id="cfScanRows" data-compact="${compact?'1':'0'}">${this.tableRows(compact)}</tbody></table></div>`;},
  tableRows(compact=false){
    const priority={OPENED:0,READY:1,SETUP:2,BLOCKED:3,WAIT:4,ERROR:5,QUEUED:6};
    let rows=this.rows.slice().sort((a,b)=>(priority[a.status]??9)-(priority[b.status]??9) || (b.signal?.score||0)-(a.signal?.score||0) || a.costRatio-b.costRatio || a.sym.localeCompare(b.sym));
    if(!compact){
      const q=this.search.trim().toLowerCase();if(q)rows=rows.filter(r=>r.sym.toLowerCase().includes(q));
      if(this.filter==='signals')rows=rows.filter(r=>r.signal?.dir);
      if(this.filter==='ready')rows=rows.filter(r=>r.status==='READY');
      if(this.filter==='issues')rows=rows.filter(r=>['BLOCKED','ERROR'].includes(r.status));
    }else rows=rows.slice(0,8);
    return rows.map(r=>`<tr><td><b>${esc(r.sym)}</b></td><td class="${r.signal?.dir>0?'up':r.signal?.dir<0?'down':''}">${r.signal?.dir>0?'BUY':r.signal?.dir<0?'SELL':'WAIT'}</td><td>${(r.signal?.checks||[]).filter(c=>c.ok).length}/5</td><td>${r.status}</td><td>${esc(r.why)}</td><td>${r.signal?.dir?fmtPrice(r.signal.sl)+' / '+fmtPrice(r.signal.tp):'—'}</td><td><button class="bMini" data-cf-pair="${esc(r.sym)}">Chart</button></td></tr>`).join('')||'<tr><td colspan="7">No matching instruments. The scanner waits for the connected JustMarkets catalogue.</td></tr>';
  },
  refresh(){
    if(!['confluence','confluenceScanner'].includes(Bots.active))return;
    const status=document.getElementById('cfScanStatus');if(status)status.textContent=this.summary();
    const toggle=document.querySelector('#botBody [data-cfs="toggle"]');
    if(toggle)toggle.textContent=ConfluenceBot.config().scannerOn?'Pause scanner':'Start automatic scanner';
    const rows=document.getElementById('cfScanRows');if(rows)rows.innerHTML=this.tableRows(rows.dataset.compact==='1');
    const live=document.getElementById('cfBotStatus');if(live)live.textContent=(ConfluenceBot.config().paused?'PAUSED':'PAPER BOT ON')+' · '+(ConfluenceBot.last?.why||'Waiting for scanner evidence');
  },
  bind(host){
    if(host._confluenceScannerClick)host.removeEventListener('click',host._confluenceScannerClick);
    host._confluenceScannerClick=e=>{
      const el=e.target.closest('[data-cfs],[data-cf-pair]');if(!el)return;
      if(el.dataset.cfPair)ConfluenceBot.openChart(el.dataset.cfPair);
      const a=el.dataset.cfs;
      if(a==='toggle')this.setOn(!ConfluenceBot.config().scannerOn);
      if(a==='scan')this.pulse(true);
      if(a==='bot'||a==='page'){Bots.active=a==='bot'?'confluence':'confluenceScanner';Bots.wire();Bots.render();}
    };
    host.addEventListener('click',host._confluenceScannerClick);
    host.querySelector('#cfScanSearch')?.addEventListener('input',e=>{this.search=e.target.value;this.refresh();});
    host.querySelector('#cfScanFilter')?.addEventListener('change',e=>{this.filter=e.target.value;this.refresh();});
  },
};
const confluenceScannerDef={id:'confluenceScanner',name:'Confluence Scanner',scan:true,confluenceScanner:true,
  blurb:'Automatic M15 Confluence scanner across the entire connected JustMarkets catalogue. Exact pairs, buy/sell setups and reasons for waiting. Sends eligible ranked setups to the Confluence paper bot.',
  defaults:{tf:'15m',paused:true,maxOpen:0},warmup:0,signal:()=>null};
BOTS.splice(BOTS.findIndex(b=>b.id==='confluence'),0,confluenceScannerDef);BOT_BY_ID.confluenceScanner=confluenceScannerDef;
