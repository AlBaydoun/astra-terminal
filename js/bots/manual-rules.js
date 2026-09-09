/* The operator owns Manual's PAPER rules. Keep them in its existing configuration,
   save explicitly, and never rebuild a draft while quotes or ledgers refresh. */
const ManualRules = {
  fields: [
    ['riskPct','Risk per trade (% of equity)',0.001,100,0.001,'risk',0.5],
    ['maxNotionalPct','Total position value (% of equity)',0.001,null,0.001,'risk',100],
    ['maxDailyLossPct','Daily loss budget (% of starting equity)',0.001,100,0.001,'risk',2],
    ['minEquity','Minimum equity to enter',0,null,0.01,'risk',100],
    ['maxOpen','Maximum open positions',0,Number.MAX_SAFE_INTEGER,1,'count',20],
    ['maxPerSymbol','Positions per instrument',0,Number.MAX_SAFE_INTEGER,1,'count',10],
    ['maxCorrelated','Related positions',0,Number.MAX_SAFE_INTEGER,1,'count',2],
    ['maxSpreadManualPct','Maximum spread (% of price)',0,null,0.001,'risk',1.5],
    ['maxSpreadAtrPct','Maximum spread (% of stop distance)',0,null,0.01,'risk',25],
    ['staleQuoteSec','Quote age limit (seconds)',1,180,1,'risk',180],
    ['manualAutoStopAtr','Automatic stop × ATR(14)',0.01,null,0.01,'extra',1.5],
    ['manualFallbackPct','Fallback stop (%; 0 = market default)',0,100,0.01,'extra',0],
    ['timeLimitBars','Exit after candles (0 = no time limit)',0,Number.MAX_SAFE_INTEGER,1,'extra',240],
  ],
  values(cfg = Bots.manualCfg()){
    const R = BotEngine.rules(cfg), out = {};
    for(const [key,,,,,kind,def] of this.fields)
      out[key] = kind === 'extra' ? (cfg[key] ?? def) : R[key];
    if(out.timeLimitBars === Number.MAX_SAFE_INTEGER) out.timeLimitBars = 0;
    out.paused = !!cfg.paused; out.manualAllowWiderStop = !!cfg.manualAllowWiderStop;out.manualAutoFit=cfg.manualAutoFit!==false;
    return out;
  },
  message(text){ const el = document.getElementById('mrStatus'); if(el)el.textContent = text; },
  view(){
    const v = this.values();
    return `<details class="manualRules" open><summary>Manual trading rules — you choose the budgets</summary>
      <form id="manualRulesForm"><div class="manualRuleGrid">${this.fields.map(([key,label,min,max,step,kind])=>{
        const unlimited = kind === 'count' && v[key] === Number.MAX_SAFE_INTEGER;
        return `<div><label class="bc" for="mr_${key}">${esc(label)}</label>
          <input id="mr_${key}" name="${key}" type="number" value="${unlimited?'':v[key]}" min="${min}" ${max==null?'':`max="${max}"`} step="any" ${unlimited?'disabled':''} required>
          ${kind==='count'?`<label class="mrUnlimited"><input type="checkbox" data-unlimited="${key}" ${unlimited?'checked':''}> No count limit</label>`:''}</div>`;
      }).join('')}</div>
      <div class="botCtl">
        <label><input name="manualAutoFit" type="checkbox" ${v.manualAutoFit?'checked':''}> Automatically fit size and levels to my budgets</label>
        <label><input name="paused" type="checkbox" ${v.paused?'checked':''}> Pause new entries</label>
        <label><input name="manualAllowWiderStop" type="checkbox" ${v.manualAllowWiderStop?'checked':''}> Allow wider stop edits within my current risk budget</label>
        <button type="submit" class="bBtn go">Save manual rules</button>
        <button type="button" class="bBtn" data-mr="defaults">Load default rules</button>
        <button type="button" class="bBtn" data-mr="reload">Reload saved rules</button>
        <button type="button" class="bBtn" data-mr="unlock">Recheck daily lock</button>
        <button type="button" class="bBtn" data-act="permissions">Instrument permissions</button>
      </div></form>
      <p class="botNote" id="mrStatus" role="status">Saved rules apply to market entries and waiting orders when they trigger.</p>
      <p class="botNote">Automatic fitting adjusts the draft size to broker lots and your remaining budgets. It can tighten a stop to fit the minimum lot, or move levels to the correct side and outside the spread. Review the updated prices and cash figures before entering. Turn it off and save to keep exact values. It never increases your saved budgets or changes an existing position or waiting instruction.</p>
      <p class="botNote">Total position value is shared by all open manual trades: 100% = 1× equity, 500% = 5× equity.
        Raising it permits leveraged exposure and larger losses. Open trades keep their allocation; leverage never replenishes it.
        Count 0 blocks entries unless “No count limit” is checked. Daily loss includes open stop risk; an existing daily lock must be rechecked after raising its budget.
        Time-limit changes affect new trades. Wider stop edits preserve the original trade risk in the history.
        Broker minimum/step/maximum lots, fresh live prices, valid stops and instrument permissions still apply.
        Pro commission is 0%; spread and 0.005% slippage per side remain.</p></details>`;
  },
  fill(v){
    const form = document.getElementById('manualRulesForm'); if(!form)return;
    for(const [key,,,,,kind] of this.fields){
      const el=form.elements.namedItem(key), no=form.querySelector(`[data-unlimited="${key}"]`);
      if(no)no.checked = kind==='count' && v[key]===Number.MAX_SAFE_INTEGER;
      el.disabled=!!no?.checked; el.value=el.disabled?'':v[key];
    }
    for(const k of ['paused','manualAllowWiderStop','manualAutoFit'])form.elements.namedItem(k).checked=!!v[k];
  },
  validate(v){
    for(const [key,label,min,max,step] of this.fields){
      if(!Number.isFinite(v[key]) || v[key]<min || (max!=null&&v[key]>max) || (step===1&&!Number.isSafeInteger(v[key])))
        return label + ': enter a valid ' + (step===1?'whole ':'') + 'number from ' + min + (max==null?'': ' to '+max) + '.';
    }
    return '';
  },
  async save(v){
    const error=this.validate(v); if(error){this.message(error);return false;}
    try{
      await ManualOrders.exclusive(()=>{
        const old=Bots.cfg('manual')||{}, cfg={...old,risk:{...(old.risk||{})}};
        for(const [key,,,,,kind] of this.fields){
          if(kind==='risk')cfg.risk[key]=v[key];
          else { cfg[key]=key==='timeLimitBars'&&v[key]===0?Number.MAX_SAFE_INTEGER:v[key];
            if(kind==='count')delete cfg.risk[key]; }
        }
        cfg.paused=!!v.paused;cfg.manualAllowWiderStop=!!v.manualAllowWiderStop;
        cfg.manualAutoFit=v.manualAutoFit!==false;
        if(lsSet('astra_botcfg_manual',cfg)===false)throw Error('Could not save rules. Previous rules remain active.');
        Bots.cfgs.manual=cfg;
      });
      this.message('Manual rules saved. Market and pending entries now use these budgets.'); Bots.manualCalc();return true;
    }catch(e){this.message(e.message);console.error('ASTRA manual rules:',e.message);return false;}
  },
  async unlock(){
    try{
      await ManualOrders.exclusive(()=>{
        const L=Bots.ledgers.manual,R=BotEngine.rules(Bots.manualCfg());
        const pnl=BotEngine.dailyPnl(L,Date.now());
        const floating=L.open.reduce((n,p)=>n+Math.min(0,BotEngine.cashPnl(p,((p.last??p.entry)-p.entry)*p.dir*p.qty)),0);
        if(![pnl,floating,R.maxDailyLossPct,L.startEquity].every(Number.isFinite) ||
          pnl+floating<=-L.startEquity*R.maxDailyLossPct/100)throw Error('Daily losses still exceed your saved budget. The lock remains.');
        const old=L.lockedUntil;L.lockedUntil=0;
        if(!BotEngine.save('manual',L)){L.lockedUntil=old;throw Error('Could not save the daily lock change.');}
        this.message('Daily lock rechecked. Loss history and open-risk checks remain in force.');
      });Bots.manualCalc();
    }catch(e){this.message(e.message);}
  },
  bind(host){
    const form=host.querySelector('#manualRulesForm');if(!form)return;
    form.addEventListener('input',()=>this.message('Unsaved rules — press Save manual rules to apply.'));
    form.querySelectorAll('[data-unlimited]').forEach(box=>box.addEventListener('change',()=>{
      const input=form.elements.namedItem(box.dataset.unlimited);input.disabled=box.checked;
      if(!box.checked&&!input.value)input.value='1';
    }));
    form.addEventListener('submit',e=>{
      e.preventDefault();const v={};
      for(const [key] of this.fields){const el=form.elements.namedItem(key);
        v[key]=form.querySelector(`[data-unlimited="${key}"]`)?.checked?Number.MAX_SAFE_INTEGER:el.value.trim()===''?NaN:Number(el.value);}
      for(const key of ['paused','manualAllowWiderStop','manualAutoFit'])v[key]=form.elements.namedItem(key).checked;
      this.save(v);
    });
    form.querySelectorAll('[data-mr]').forEach(btn=>btn.addEventListener('click',()=>{
      if(btn.dataset.mr==='unlock'){this.unlock();return;}
      if(btn.dataset.mr==='reload'){
        ManualOrders.syncPreferences();this.fill(this.values());this.message('Saved rules loaded.');return;
      }
      const v=Object.fromEntries(this.fields.map(([key,,,,,,def])=>[key,def]));
      v.paused=this.values().paused;v.manualAllowWiderStop=false;v.manualAutoFit=true;
      this.fill(v);this.message('Defaults loaded into the form. Press Save manual rules to apply; history is kept.');
    }));
  },
};
