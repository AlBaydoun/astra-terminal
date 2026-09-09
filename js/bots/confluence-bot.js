/* Deliberately separate paper runner: no call to Live or a broker write API. */
const ConfluenceBot = {
  busy:false, revision:0, last:null,
  // These execution preferences are separate from the frozen signal/study rules.
  limitFields:[
    ['maxOpen','Open positions',0,Number.MAX_SAFE_INTEGER,1,0],
    ['maxPerSymbol','Open positions per pair',0,Number.MAX_SAFE_INTEGER,1,0],
    ['maxCorrelated','Related positions',0,Number.MAX_SAFE_INTEGER,1,0],
    ['entriesPerDay','Entries per pair each day',0,Number.MAX_SAFE_INTEGER,1,0],
    ['perTradeNotionalPct','Position value per trade (% equity)',0.01,100,0.01,5],
    ['riskPct','Risk per trade (%)',0.01,100,0.01,0.5],
    ['maxNotionalPct','Total position value (% equity)',0.01,100,0.01,100],
    ['maxDailyLossPct','Daily loss budget (%)',0.01,100,0.01,2],
  ],
  defaultLimits(){return Object.fromEntries(this.limitFields.map(([key,,,,,value])=>[key,value]));},
  limits(saved){return {...this.defaultLimits(),...saved.confluenceLimits};},
  validateLimits(limits){
    for(const [key,label,min,max,step] of this.limitFields){
      const v=limits[key];
      if(!Number.isFinite(v)||v<min||v>max||(step===1&&!Number.isSafeInteger(v)))
        return label+': enter '+(step===1?'a whole number of 0 or more':'a number from '+min+' to '+max);
    }
    return null;
  },
  config(){
    const saved=lsGet('astra_botcfg_'+Confluence.id,Bots.cfg(Confluence.id)||{});
    const limits=this.limits(saved),count=v=>v===0?Number.MAX_SAFE_INTEGER:v;
    return {...Confluence.defaults,maxOpen:count(limits.maxOpen),maxPerSymbol:count(limits.maxPerSymbol),
      maxCorrelated:count(limits.maxCorrelated),entriesPerDay:limits.entriesPerDay,perTradeNotionalPct:limits.perTradeNotionalPct,
      risk:{riskPct:limits.riskPct,maxNotionalPct:limits.maxNotionalPct,maxDailyLossPct:limits.maxDailyLossPct},
      limits,configError:this.validateLimits(limits),paused:saved.paused!==false,scannerOn:saved.scannerOn!==false};
  },
  entryState(L,s){
    const key=s.meta.brokerDay+'/'+Feed.brokerName(s.sym);
    const saved=Object.values(L.daily).map(d=>d.confluenceEntries?.[key]).filter(Boolean);
    // Read old entries too. A cumulative counter survives the engine's 500-close retention.
    const prior=[...L.open,...L.closed].filter(p=>p.meta?.brokerDay===s.meta.brokerDay && Feed.brokerName(p.sym)===Feed.brokerName(s.sym));
    const oldBars=prior.map(p=>p.meta.confluenceBar ?? Math.floor((p.entryTime/1000+Feed.bridgeClock.offset)/900)*900).filter(Number.isFinite);
    return {key,count:Math.max(prior.length,...saved.map(p=>p.count),0),lastBar:Math.max(...oldBars,...saved.map(p=>p.lastBar),0)};
  },
  repeatReason(L,cfg,s){
    const state=this.entryState(L,s);
    if(state.lastBar>=s.entryBar)return 'This signal has already opened a trade — waiting for a new candle signal';
    if(cfg.entriesPerDay>0 && state.count>=cfg.entriesPerDay)return 'Daily entry limit of '+cfg.entriesPerDay+' reached for this pair';
    return null;
  },
  entryGate(L,cfg,s,q){
    const funds=BotEngine.funds(L,BotEngine.rules(cfg));
    const cap=Math.min(funds.free,funds.equity*cfg.perTradeNotionalPct/100);
    // Narrow sizing to this entry's allocation while reserving every existing position.
    // Final execution rechecks the full account budget using this approved quantity.
    const sizing={...cfg,risk:{...cfg.risk,maxNotionalPct:(funds.used+cap)/funds.equity*100}};
    return BotEngine.check(L,sizing,s,q);
  },
  saveLimits(limits){
    const why=this.validateLimits(limits);
    if(why){this.settingsMessage(why,true);return false;}
    const saved=lsGet('astra_botcfg_confluence',Bots.cfgs.confluence||{});
    const next={...saved,confluenceLimits:{...limits}};
    if(lsSet('astra_botcfg_confluence',next)===false){this.settingsMessage('Could not save these settings. Previous rules remain active.',true);return false;}
    Bots.cfgs.confluence=next;this.revision++;
    this.settingsMessage('Saved. Applies to new entries; existing trades keep their stops and targets.');
    this.refresh();return true;
  },
  settingsMessage(text,error=false){
    const el=document.getElementById('cfSettingsStatus');if(el){el.textContent=text;el.className='botNote'+(error?' down':'');}
  },
  symbol(){
    const pairs=MarketSources.brokerList();
    return pairs.includes(STORE.symbol)?STORE.symbol:pairs.find(s=>Feed.baseOf(Feed.brokerName(s))==='XAUUSD')||pairs[0]||null;
  },
  async withLedger(work){
    // Serialize this new account across tabs and read its latest saved history.
    // A failed save must keep the in-memory position; replacing it would lose it.
    if(!navigator.locks) throw Error('This browser cannot safely coordinate the paper account across tabs');
    return navigator.locks.request('astra-confluence-paper-account',()=>{
      const current=Bots.ledgers.confluence;
      const L=current && BotEngine.unsaved.has(current) ? current
        : lsGet('astra_bot_confluence',null) || current || BotEngine.blank('confluence');
      Bots.ledgers.confluence=L;
      return work(L);
    });
  },
  async manage(){
    return this.withLedger(L=>{
      let changed=false;
      for(const p of L.open.slice()){
        const q=Bots.quoteFor(p.sym);if(!q) continue;
        BotEngine.step(L,this.config(),p,null,q);changed=true;
      }
      if(changed){BotEngine.mark(L,Date.now());BotEngine.save(Confluence.id,L);}
    }).catch(e=>{console.error('ASTRA Confluence position management:',e);});
  },
  entryReason(s, q, now=Date.now()){
    if(!s.dir) return s.failed?.[0]||'Waiting for all five checks';
    const offset=Feed.bridgeClock?.offset;
    if(!Number.isFinite(offset)) return 'Waiting for the broker clock to be verified';
    const age=now/1000+offset-s.entryBar;
    if(age<0 || age>90) return 'Entry window expired — wait for a new setup';
    if(!q) return 'Waiting for a fresh JustMarkets price';
    if(Math.abs(q.price-s.entry)>s.atr*0.25) return 'Price has moved too far — do not chase';
    return null;
  },
  async run(b, inspectOnly=false, scanned=false){
    if(this.busy) return false;
    this.busy=true;
    const version=this.revision;
    let opened=false;
    try{
      if(!this.config().scannerOn && !inspectOnly){this.last={why:'Automatic Confluence scanner is paused'};return false;}
      if(!scanned)await ConfluenceScanner.scan(inspectOnly);
      const ranked=await ConfluenceScanner.quotesForSetups();
      return await this.withLedger(L=>{
        const cfg=this.config();
        if(cfg.configError){this.last={why:'Invalid trading settings: '+cfg.configError};return false;}
        let best=null,entries=[];
        for(const row of ranked){
          const sym=row.sym,s=row.signal,q=Bots.quoteFor(sym);
          const lockedUntil=L.lockedUntil;
          let why=this.entryReason(s,q);
          if(!why)why=this.repeatReason(L,cfg,s);
          // Pausing is an entry choice, not a reason to hide otherwise ready pairs.
          const gate=why?null:this.entryGate(L,{...cfg,paused:false},s,q);
          if(!why&&!gate.ok)why=gate.reason;
          // Reaching a daily loss lock is state even when no trade is opened.
          // Persist it so a reload or price rebound cannot unlock the account.
          if(L.lockedUntil!==lockedUntil && !BotEngine.save(Confluence.id,L)){
            this.last={why:'Daily loss lock could not be saved — new entries blocked'};return opened;
          }
          if(why){row.status='BLOCKED';row.why=why;continue;}
          row.status='READY';row.why='All signal, price, cost and account checks passed';
          if(!best)best={row,s,q,gate};
          if(!inspectOnly && !cfg.paused && version===this.revision && !this.config().paused && this.config().scannerOn){
            const state=this.entryState(L,s),p=BotEngine.open(L,cfg,s,q,gate);
            if(!p){row.status='BLOCKED';row.why=L.decisions[0]?.text||'Final account check refused entry';continue;}
            p.meta={...p.meta,confluenceBar:s.entryBar,entryFee:p.feeIn,initialRisk:p.riskCash};
            const day=BotEngine.dayKey(Date.now()),daily=L.daily[day] ||= {pnl:0,wins:0,losses:0,fees:0};
            (daily.confluenceEntries ||= {})[state.key]={count:state.count+1,lastBar:s.entryBar};
            row.status='OPENED';row.why='Selected by the Confluence paper bot';
            entries.push((p.dir>0?'BUY':'SELL')+' '+p.sym);opened=true;
            // Save each fill before considering the next pair; an unsaved fill stops the batch.
            if(!BotEngine.save(Confluence.id,L)){
              this.last={why:'Paper entry could not be saved — keep ASTRA open'};return opened;
            }
          }
        }
        this.last={why:entries.length?'Opened '+entries.length+' paper trade'+(entries.length===1?'':'s')+': '+entries.join(', ')
          :best?'Best eligible setup: '+best.row.sym+' '+(best.s.dir>0?'BUY':'SELL')
          :ConfluenceScanner.rows.length?'Scanning '+ConfluenceScanner.rows.length+' pairs — no setup passes every entry check':'Connect JustMarkets to load the full catalogue',at:Date.now()};
        if(inspectOnly||opened)toast(this.last.why,opened?'ok':'info');
        return opened;
      });
    } catch(e){
      this.last={why:'Could not check the setups: '+e.message};
      console.error('ASTRA Confluence:',e); return false;
    } finally {this.busy=false;ConfluenceScanner.refresh();}
  },
  setPaused(paused){
    const cfg={...lsGet('astra_botcfg_'+Confluence.id,Bots.cfg(Confluence.id)||{}),paused};
    if(!paused)cfg.scannerOn=true;
    if(lsSet('astra_botcfg_'+Confluence.id,cfg)===false){toast('Could not save the paper bot setting','warn');return;}
    Bots.cfgs[Confluence.id]=cfg; this.revision++; Bots.render();
    if(!paused) this.run(BOT_BY_ID.confluence).then(()=>Bots.render());
  },
  displayLedger(L){
    return {...L,equityCurve:[{t:0,eq:L.startEquity},...L.equityCurve],closed:L.closed.map(t=>{
      if(!Number.isFinite(t.meta?.entryFee) || !(t.meta?.initialRisk>0)) return {...t};
      const pnl=t.pnl-t.meta.entryFee;
      return {...t,pnl,r:pnl/t.meta.initialRisk};
    })};
  },
  controls(){
    const c=this.config();
    return `<div class="botCtl"><b>M15 · all ${ConfluenceScanner.catalogue().length} JustMarkets instruments · paper only</b>
      <button class="bBtn ${c.paused?'go':'danger'}" data-cf="toggle">${c.paused?'Start paper bot':'Pause paper bot'}</button>
      <button class="bBtn" data-cf="check">Scan all pairs now</button>
      <button class="bBtn" data-cf="chart" title="Opens M15 candles with ASTRA labels and preserves your candle-pattern display">Open indicator chart</button>
      <a class="bBtn" href="research/confluence.html" target="_blank" rel="noopener">Split-test results &amp; guide</a></div>
      <form id="cfLimitsForm"><div class="botCtl">${this.limitFields.map(([key,label,min,max,step])=>
        `<label class="bc" for="cfLimit_${key}">${label}<input id="cfLimit_${key}" name="${key}" type="number" min="${min}" max="${max}" step="${step}" required value="${esc(String(c.limits[key]))}"></label>`).join('')}</div>
      <div class="botCtl"><button class="bBtn go" type="submit">Save trading rules</button>
        <button class="bBtn" type="button" data-cf="maximum">Maximum trade counts</button>
        <button class="bBtn" type="button" data-cf="defaults">Reset defaults</button>
        <span class="bcNote">0 means no count limit in the first four boxes. Percentage budgets still apply. Maximum trade counts changes only those four boxes; press Save to apply.</span></div>
      <div class="botNote" id="cfSettingsStatus" role="status">Saved rules apply to new trades. Reset defaults does not erase history.</div></form>`;
  },
  rulesText(){
    const c=this.config(),n=v=>v===0?'no count limit':v;
    return `Open positions: ${n(c.limits.maxOpen)}; per pair: ${n(c.limits.maxPerSymbol)}; related positions: ${n(c.limits.maxCorrelated)}; daily entries per pair: ${n(c.entriesPerDay)}. `+
      `Each position uses at most ${c.perTradeNotionalPct}% of equity and risks at most ${c.risk.riskPct}%. All positions share ${c.risk.maxNotionalPct}% of equity and a ${c.risk.maxDailyLossPct}% daily loss budget. Broker minimum lots can prevent smaller entries.`;
  },
  view(){
    return `<div class="botNote"><b id="cfBotStatus">${this.config().paused?'PAUSED':'PAPER BOT ON'} · ${esc(this.last?.why||'Waits for a completed candle with all five checks aligned.')}</b><br>
      EMA trend + pullback trigger + ADX strength + RSI momentum + tick activity. Score is checks passed, never a win probability.
      Trades 11:00–17:45 broker time. Stop 2 ATR; target 4 ATR; maximum hold 3 hours. Repeat entries need a new completed-candle signal; refreshing cannot duplicate a signal.<br>
      <span id="cfRulesSummary">${esc(this.rulesText())}</span><br>
      Keep the PC, ASTRA and bridge running for paper exits. Saved stops return after restart; they cannot execute while the PC is off.<br>
      <b>Experimental: not established as profitable.</b> The scanner chooses exact pairs across the broker catalogue. The earlier eight-market study does not establish profitability for this wider portfolio.</div>`+ConfluenceScanner.view(true);
  },
  refresh(){
    ConfluenceScanner.refresh();
    const host=document.getElementById('botBody');if(!host||host.dataset.bot!=='confluence')return;
    const toggle=host.querySelector('[data-cf="toggle"]'),paused=this.config().paused;
    if(toggle){toggle.textContent=paused?'Start paper bot':'Pause paper bot';toggle.className='bBtn '+(paused?'go':'danger');}
    const summary=host.querySelector('#cfRulesSummary');if(summary)summary.textContent=this.rulesText();
    const ledger=host.querySelector('#cfLedger');
    if(ledger && !(ledger.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea'))){
      const L=this.displayLedger(Bots.ledger('confluence')||BotEngine.blank('confluence'));
      ledger.innerHTML=Bots.ledgerView('confluence',L,BotEngine.stats(L));Bots.bindPositionControls(ledger);
    }
  },
  async openChart(sym){
    if(!sym || !MarketSources.allowed(sym))return toast('Connect the JustMarkets bridge first','warn');
    if(!ConfluenceOverlay.setMode(Chart.settings.patterns?.on?'both':'confluence'))return;
    App.setType('candles');App.setTf('15m');App.setSymbol(sym);await Chart.load();
    document.getElementById('bottomPanel').classList.add('collapsed');toast('ASTRA Confluence · M15. Click BOTS to return to its controls.','ok');
  },
  bind(host){
    const form=host.querySelector('#cfLimitsForm');
    form.addEventListener('input',()=>this.settingsMessage('Unsaved changes — press Save trading rules to apply.'));
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const limits=Object.fromEntries(this.limitFields.map(([key])=>{
        const value=form.elements.namedItem(key).value;return [key,value.trim()===''?NaN:Number(value)];
      }));
      this.saveLimits(limits);
    });
    host.querySelectorAll('[data-cf]').forEach(el=>el.addEventListener('click',async()=>{
      if(el.dataset.cf==='toggle') this.setPaused(!this.config().paused);
      if(el.dataset.cf==='check'){await this.run(BOT_BY_ID.confluence,true);Bots.render();}
      if(el.dataset.cf==='chart')this.openChart(this.symbol());
      if(el.dataset.cf==='maximum'||el.dataset.cf==='defaults'){
        const defaults=this.defaultLimits();
        for(const [key,,,,step] of this.limitFields)if(el.dataset.cf==='defaults'||step===1)form.elements.namedItem(key).value=defaults[key];
        this.settingsMessage('Preset loaded — press Save trading rules to apply.');
      }
    }));
  },
};
const confluenceBotDef={id:Confluence.id,name:Confluence.name+' · paper experiment',fixedResearch:true,
  blurb:'A patient five-check indicator and paper bot. Waits for a completed trend pullback with ADX, RSI and tick activity aligned. Fixed M15 rules; no proven profitability.',
  defaults:Confluence.defaults,warmup:Confluence.warmup,
  signal:(w,cfg,L)=>Confluence.signal(w,cfg,L),runPaper:(b)=>ConfluenceBot.run(b),managePaper:()=>ConfluenceBot.manage()};
BOTS.splice(8,0,confluenceBotDef); BOT_BY_ID[Confluence.id]=confluenceBotDef;
