/* Closed-candle labels. The open candle never votes on its own setup. */
const ConfluenceOverlay = {
  rows:[], averages:[], key:'', latest:null,
  mode(){return Chart.settings.patterns?.on?(Chart.settings.confluence?.on?'both':'patterns'):(Chart.settings.confluence?.on?'confluence':'none');},
  setMode(mode){
    if(!['patterns','confluence','both','none'].includes(mode))return false;
    const settings={...Chart.settings,patterns:{...Chart.settings.patterns,on:mode==='patterns'||mode==='both'},
      confluence:{...Chart.settings.confluence,on:mode==='confluence'||mode==='both'}};
    if(lsSet('astra_ind',settings)===false){toast('Could not save the chart label choice','warn');this.syncPicker();return false;}
    Object.assign(Chart.settings,settings);Chart.renderAll();return true;
  },
  syncPicker(counts){
    const picker=document.getElementById('chartLabelMode');if(!picker)return;
    const mode=this.mode();if(picker.value!==mode)picker.value=mode;
    if(counts){
      const parts=[];if(Chart.settings.patterns?.on)parts.push(counts.patterns+' pattern labels');
      if(Chart.settings.confluence?.on)parts.push(STORE.tf==='15m'?counts.confluence+' Confluence labels':'Confluence needs 15m');
      document.getElementById('chartLabelStatus').textContent=(parts.join(' · ')||'Chart labels off')+' · Display only; bot rules stay the same.';
    }
  },
  calculate(v){
    const last=v[v.length-2], key=[STORE.symbol,STORE.tf,v.length,v[0]?.rawTime,last?.rawTime,last?.close,last?.volume,v[v.length-1]?.open].join('|');
    if(key===this.key) return;
    this.key=key;this.rows=[];this.averages=[];this.latest=Confluence.inspect(v,v.length-1,STORE.tf);
    if(STORE.tf!=='15m') return;
    for(let i=Confluence.warmup;i<v.length;i++){
      const s=Confluence.inspect(v,i,'15m');
      if(Number.isFinite(s.fast)&&Number.isFinite(s.slow)) this.averages.push({time:v[i-1].time,fast:s.fast,slow:s.slow});
      if(s.dir) this.rows.push({time:v[i-1].time,signal:s});
    }
  },
  markers(v){
    if(!Chart.settings.confluence?.on) return [];
    this.calculate(v);
    return this.rows.map(r=>({time:r.time,position:r.signal.dir>0?'belowBar':'aboveBar',
      color:r.signal.dir>0?'#50edbc':'#ff8799',shape:r.signal.dir>0?'arrowUp':'arrowDown',text:'ASTRA '+(r.signal.dir>0?'BUY':'SELL')}));
  },
  panel(){
    this.syncPicker();
    const host=document.getElementById('confluencePanel'); if(!host) return;
    host.style.display=Chart.settings.confluence?.on?'block':'none';
    if(!Chart.settings.confluence?.on) return;
    const v=Chart.view(); this.calculate(v); const s=this.latest;
    const live=Feed.isLive(STORE.symbol) && MarketSources.executable(STORE.symbol,Feed.srcOf[STORE.symbol]);
    const why=Chart.replay.active?'REPLAY · historical setups':!live?'WAIT · no fresh enabled price':s.dir
      ? ConfluenceBot.entryReason(s,Bots.quoteFor(STORE.symbol)) || (s.dir>0?'BUY setup':'SELL setup')
      : 'WAIT · '+(s.failed?.[0]||'No setup');
    host.innerHTML=`<b>ASTRA CONFLUENCE · M15</b> <strong>${esc(why)}</strong>
      <div>${(s.checks||[]).map(c=>`<span class="cfCheck ${c.ok?'up':'dim2'}">${c.ok?'✓':'○'} ${esc(c.name)}: ${esc(c.value)}</span>`).join('')}</div>
      <small>${s.dir?`Setup reference ${fmtPrice(s.entry)} · SL ${fmtPrice(s.sl)} · TP ${fmtPrice(s.tp)} · `:''}Labels use completed candles. Setup ≠ executed trade. Tick activity ≠ traded volume. Experimental.</small>`;
  },
};
const confluenceIndicatorDef={id:'confluence',label:'ASTRA Confluence · BUY / SELL',kind:'price',mainOnly:true,
  def:{on:false,target:'main'},params:[],
  parts:[{key:'fast',label:'EMA20',color:'#52dbc6'},{key:'slow',label:'EMA100',color:'#d5ae69'}],
  note:'Use M15 on the main chart. Five checks: trend, EMA20 pullback, ADX14 ≥25, RSI momentum and tick activity ≥ its prior 20-bar average. ATR14 sets stop 2 ATR and target 4 ATR. Labels appear only after the signal candle closes. They do not imply a fill or guaranteed profit.',
  build(ctx){
    ConfluenceOverlay.calculate(ctx.v);
    if(STORE.tf!=='15m') return [];
    // Plot the same rolling 250-bar calculation that the bot used, including
    // its warmup boundary; a differently seeded EMA can cross on another bar.
    return ['fast','slow'].map(key=>({key,type:'line',data:ConfluenceOverlay.averages.map(r=>({time:r.time,value:r[key]}))}));
  }};
INDS.push(confluenceIndicatorDef); IND_BY_ID.confluence=confluenceIndicatorDef;
Chart.settings.confluence={...confluenceIndicatorDef.def,...lsGet('astra_ind',{}).confluence};
document.getElementById('chartLabelMode')?.addEventListener('change',e=>ConfluenceOverlay.setMode(e.target.value));
