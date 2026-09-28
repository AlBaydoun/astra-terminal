/* Manual account automation. Paper engine only; no broker writes or new storage keys.
   A session lock prevents competing windows. The existing manual-ledger lock
   serializes auto fills with price orders and hand edits. Stop invalidates awaits. */
const ManualAuto = {
  target:'manual',
  running:false, starting:false, busy:false, revision:0, timer:null, release:null,
  count:0, seen:new Set(), events:[], status:'Stopped · choose a mode below.',
  draft:{mode:'price',source:'confluence',sources:['confluence'],scope:'pair',direction:'both',exits:'signal',allocation:5,sl:0.5,tp:1,entries:0},
  /* several signal sources can run in one session; each source's entries are
     told apart by its id. A badge beside each source (the live desk shows its
     real-money qualification) — none on the paper desk. */
  sourceBadge(){ return ''; },
  picked(){ const d=this.draft; const L=Array.isArray(d.sources)&&d.sources.length?d.sources:[d.source||'confluence']; return [...new Set(L)]; },
  /* the real-money desk says, per bot, whether it has earned a real seat (null = paper, no check) */
  sourceInfo(id){ const r=this.srcStats()[id]; return r?{ok:r.ready>=4,met:r.ready,of:(r.checks||[]).length||6,checks:r.checks||null,why:''}:{ok:false,met:0,of:0,checks:null}; },
  /* only the real-money desk locks bots that have not qualified; on paper every bot may be ticked */
  realDesk(){ return this.target!=='manual'; },
  /* folding: the bot list, and the whole Automatic entries section (per desk, remembered) */
  FOLD_KEY: 'astra_mafold',
  folded(part){ const f=lsGet(this.FOLD_KEY,{})||{}; return !!(f[this.target]||{})[part]; },
  setFolded(part,on){ const f=lsGet(this.FOLD_KEY,{})||{}; f[this.target]=f[this.target]||{}; if(on)f[this.target][part]=true; else delete f[this.target][part]; lsSet(this.FOLD_KEY,f); },
  /* the list's own view choices: search text, sort, grouping (remembered) */
  VIEW_KEY: 'astra_masrcview',
  SORTS: [['strong','Strongest first'],['pnl','Best paper result'],['pf','Best profit factor'],['trades','Most trades'],['az','A → Z']],
  GROUPS: [['status','By readiness'],['family','By family'],['none','No groups']],
  srcView(){ const v=lsGet(this.VIEW_KEY,{})||{}; return {sort:v.sort||'strong',group:v.group||'status',q:this._srcQ||''}; },
  /* every bot's paper record (from the Performance Report), refreshed at most every 5 s */
  srcStats(){ const now=Date.now(); if(this._st&&now-this._stAt<5000)return this._st; const m={}; try{ for(const r of BotReports.rows()) m[r.id]=r; }catch(e){} this._st=m; this._stAt=now; return m; },
  family(b){ const n=String(b.name||''); if(b.usStocks)return 'US stocks'; if(/^pattern/i.test(n))return 'Pattern'; if(/^research/i.test(n)||b.research)return 'Research'; if(/confluence/i.test(n))return 'Confluence'; if(b.lab||/^lab/.test(b.id))return 'Lab'; if(b.checkerBot||/^chk_/.test(b.id))return 'Strategy Checker'; return 'Strategy bots'; },
  sourcesView(){
    const on=new Set(this.picked()),list=this.sources().map(b=>({b,info:this.sourceInfo(b.id)}));
    const real=this.realDesk(),qual=list.filter(x=>x.info&&x.info.ok).length,V=this.srcView(),shut=this.folded('list');
    return `<div class="maSources${shut?' folded':''}">
      <div class="maSrcHead"><button type="button" class="maFold" data-ma-fold="list" title="${shut?'Show':'Fold'} the bot list">${shut?'▸':'▾'}</button><b>${real?'Which bots may place REAL orders':'Which bots give the signals'}</b><span data-ma-count>${on.size} chosen</span>
        <button class="bMini" data-ma-none>Untick all</button></div>
      <div class="maSrcBody"${shut?' hidden':''}>
      <div class="maSrcTools">
        <input type="search" data-ma-search placeholder="Find a bot — name, family (pattern, research, US stocks…) or “qualified”" value="${esc(V.q)}">
        <label>Sort <select data-ma-sort>${this.SORTS.map(([v,t])=>`<option value="${v}"${v===V.sort?' selected':''}>${t}</option>`).join('')}</select></label>
        <label>Group <select data-ma-group>${this.GROUPS.map(([v,t])=>`<option value="${v}"${v===V.group?' selected':''}>${t}</option>`).join('')}</select></label>
      </div>
      ${real?`<div class="maSrcNote">${qual?`<b class="up">${qual} of ${list.length}</b> bots are qualified for real money right now — tick the ones you want.`:`<b class="down">None of your ${list.length} bots is qualified for real money yet.</b> Each one first has to prove itself on paper.`}
        A bot qualifies when its paper record meets <b>at least 4 of 6</b> safety conditions — the six dots show which (green = met). Press <b>why?</b> on any bot to see its figures.
        <br><b class="down">⚠ You may also tick a bot that has NOT qualified</b> — it is your decision. You are warned when you tick it, and starting then asks you to type <b>TRADE UNQUALIFIED</b>. Every real order from such a bot is marked “override” in the log.</div>`
      :`<div class="maSrcNote">On paper <b>any bot may be ticked</b>. The status, the six dots and <b>why?</b> show how close each one is to a seat on the LIVE desk — ${qual?`<b class="up">${qual}</b> ${qual===1?'is':'are'} qualified today`:'none is qualified yet'} (4 of 6 safety conditions on its paper record).</div>`}
      <div class="maSrcList">${this.srcListHtml()}</div></div></div>`;
  },
  srcListHtml(){
    const on=new Set(this.picked()),V=this.srcView(),st=this.srcStats();
    let list=this.sources().map(b=>({b,info:this.sourceInfo(b.id),r:st[b.id]||null,fam:this.family(b)}));
    const real=this.realDesk();
    const met=x=>x.info?(x.info.met||0):(x.r?(x.r.ready||0):0), ok=x=>x.info?!!x.info.ok:false;
    const pf=x=>x.r&&x.r.trades?(x.r.pf===Infinity?99:x.r.pf):-1, pnl=x=>x.r?x.r.pnl:-1e12, trades=x=>x.r?x.r.trades:0;
    /* strongest = qualified first, then most conditions met, then profit factor, then paper result */
    const cmp={strong:(x,y)=>(ok(y)-ok(x))||(met(y)-met(x))||(pf(y)-pf(x))||(pnl(y)-pnl(x)),
      pnl:(x,y)=>pnl(y)-pnl(x), pf:(x,y)=>pf(y)-pf(x), trades:(x,y)=>trades(y)-trades(x), az:(x,y)=>String(x.b.name).localeCompare(String(y.b.name))}[V.sort]||(()=>0);
    list.sort((x,y)=>cmp(x,y)||String(x.b.name).localeCompare(String(y.b.name)));
    const status=x=>!x.info&&!x.r?'No record':ok(x)?'✓ Qualified for real money':(!x.info||x.info.of)?(met(x)>=3?'Close — '+met(x)+' of 6 met':'Far — '+met(x)+' of 6 met'):'No paper record yet';
    const q=(V.q||'').trim().toLowerCase();
    if(q) list=list.filter(x=>(x.b.name+' '+x.fam+' '+status(x)+(ok(x)?' qualified':'')+' '+met(x)+' of 6').toLowerCase().includes(q));
    const dots=info=>info&&info.checks?`<span class="maDots" title="${esc(info.checks.map(c=>(c.ok?'✓ ':'✕ ')+c.label+' — '+c.got).join('\n'))}">${info.checks.map(c=>`<i class="${c.ok?'ok':''}"></i>`).join('')}</span>`:'';
    const fig=x=>x.r&&x.r.trades?`<span class="maFig">PF <b class="${pf(x)>=1.3?'up':pf(x)<1?'down':''}">${x.r.pf===Infinity?'∞':x.r.pf.toFixed(2)}</b> · <b class="${x.r.pnl>=0?'up':'down'}">${(x.r.pnl>=0?'+':'')+fmtNum(x.r.pnl)}</b> · ${x.r.trades} trades</span>`:'<span class="maFig">no paper trades yet</span>';
    const row=x=>{const {b,info}=x;
      const warn=real&&!(info&&info.ok),checked=on.has(b.id);
      const state=!info?'':info.ok?'<em class="maOk">✓ Qualified for real money</em>':info.of?`<em class="maNo">Not yet · meets ${info.met} of ${info.of}</em>`:'<em class="maNo">No paper record yet</em>';
      return `<div class="maSrcRow${checked?' on':''}${warn?' warn':''}">
        <label title="${warn?'NOT qualified for real money — you may still tick it, at your own risk. Press why? to see what it is missing':real?'Tick to let this bot’s signals place orders':'Tick to use this bot’s signals for paper entries'}"><input type="checkbox" data-ma-src="${esc(b.id)}"${checked?' checked':''}>
          <span class="maName">${esc(b.name)}</span></label>
        ${state}${dots(info)}${fig(x)}${warn?'<em class="maWarn">⚠ ticked at your own risk</em>':''}
        ${info&&info.checks?`<button type="button" class="maWhyBtn" data-ma-why="${esc(b.id)}">${this._whyOpen&&this._whyOpen.has(b.id)?'hide':'why?'}</button>`:''}
        ${info&&info.checks?`<div class="maWhy" data-ma-whybox="${esc(b.id)}"${this._whyOpen&&this._whyOpen.has(b.id)?'':' hidden'}>${info.checks.map(c=>`<div class="${c.ok?'ok':'no'}"><b>${c.ok?'✓':'✕'}</b><span>${esc(c.label)}</span><i>${esc(c.got)}</i></div>`).join('')}
          <small>A bot needs at least 4 of these 6 on its paper record before it may trade real money${real?'':' (on paper it may be used anyway)'}.</small></div>`:''}
      </div>`;};
    if(!list.length)return '<div class="maSrcEmpty">No bot matches “'+esc(q)+'”.</div>';
    if(V.group==='none')return list.map(row).join('');
    /* groups keep the chosen sort inside them; the strongest group comes first */
    const key=x=>V.group==='family'?x.fam:(ok(x)?'1|✓ Qualified for real money':(x.info&&!x.info.of)||(!x.info&&!x.r)?'4|No paper record yet':met(x)>=3?'2|Close — 3 of 6 conditions met':'3|Further away — 2 of 6 or fewer met');
    const groups=new Map();for(const x of list){const k=key(x);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
    let keys=[...groups.keys()];
    if(V.group==='status')keys.sort();else keys.sort((a,b)=>Math.max(...groups.get(b).map(met))-Math.max(...groups.get(a).map(met))||a.localeCompare(b));
    return keys.map(k=>`<div class="maGroupHead">${esc(k.replace(/^\d\|/,''))}<span>${groups.get(k).length}</span></div>`+groups.get(k).map(row).join('')).join('');
  },
  srcRedraw(host){ const box=host.querySelector('.maSrcList'); if(!box)return; const top=box.scrollTop; box.innerHTML=this.srcListHtml(); box.scrollTop=top; this.refresh(); },
  config:null,
  sources(){return Bots.ordered(BOTS.filter(b=>!b.manual&&!Bots.disabled(b.id)&&(!Bots.isPage(b)||b.id==='scanner')&&typeof b.signal==='function'));},
  view(){
    const d=this.draft;
    const select=(key,items)=>`<select data-ma="${key}">${items.map(([v,l])=>`<option value="${esc(v)}"${String(d[key])===v?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
    const number=(key,label,min,max)=>`<label class="bc">${label}<input data-ma="${key}" type="number" min="${min}" max="${max}" step="${key==='entries'?'1':'0.01'}" value="${d[key]}"></label>`;
    const secShut=this.folded('section');
    return `<section class="manualAuto wsTradeSection${secShut?' maFoldedSec':''}" data-auto-target="${this.target}"><h3><button type="button" class="maFold" data-ma-fold="section" title="${secShut?'Show':'Fold'} automatic entries">${secShut?'▸':'▾'}</button>${WorkspaceUI.icon('bot')} Automatic entries · manual paper account</h3><div class="maSecBody"${secShut?' hidden':''}>
      <div class="botCtl"><label class="bc">Entry mode ${select('mode',[['price','At my chosen price'],['confluence','Bot / indicator signals']])}</label></div>
      <div data-ma-price><p>Choose Limit to buy lower or sell higher; choose Stop entry to buy higher or sell lower. Enter your entry, stop and target prices in the ticket, then place the instruction.</p>
        <button class="bBtn" data-ma-price-type="limit">Prepare Limit order</button> <button class="bBtn" data-ma-price-type="stop">Prepare Stop entry</button>
        <p class="botNote">Each instruction fills once. Waiting orders and their levels are saved and shown below.</p></div>
      <div data-ma-signal><fieldset data-ma-fields class="botCtl">
        ${this.sourcesView()}
        <label class="bc">Scan ${select('scope',[['pair','Ticket pair only'],['all','All JustMarkets instruments']])}</label>
        <label class="bc">Direction ${select('direction',[['both','Buy and sell'],['buy','Buy only'],['sell','Sell only']])}</label>
        <label class="bc">Stops and targets ${select('exits',[['signal','Selected strategy levels'],['percent','My percentage distances']])}</label>
        ${number('allocation','Maximum position value per entry (% equity)',0.01,100)}
        ${number('sl','Stop distance (%)',0.01,99)}${number('tp','Target distance (%)',0.01,99)}
        ${number('entries','Entries this session (0 = no count limit)',0,Number.MAX_SAFE_INTEGER)}
        </fieldset><div class="botCtl"><button class="bBtn go" data-ma-start>Start selected signals · paper</button><button class="bBtn danger" data-ma-stop>Stop new automatic entries</button></div>
        <p class="botNote">Tick one bot or several — they run together in one session, each with its own saved timeframe, score and market filters, completed candles only. One entry per pair per scan, whichever bot saw it first (the strongest signal). Uses the selected bot’s saved timeframe, score and market filters, with completed candles only. Confluence retains its M15 session filter. One entry per source, pair and signal; session strategies retain their daily guard. Close-only signals never become short entries. The per-entry percentage is position value, not stop risk. Stop to change settings. Choosing a source does not start that bot’s separate account.</p>
        <p class="botNote">Experimental, with no established profitability. Sessions stop on reload. Keep ASTRA, the bridge and PC running for paper entries and exits. Stopping automatic entries leaves existing positions and separately placed price instructions active.</p>
      </div><p id="maStatus" class="botNote" role="status"></p><div id="maEvents"></div></div></section>`;
  },
  bind(host){
    const secEl=host.matches&&host.matches('.manualAuto')?host:host.querySelector('.manualAuto[data-auto-target="'+this.target+'"]');
    if(secEl&&!secEl._maFold){secEl._maFold=true;secEl.addEventListener('click',e=>{const f=e.target.closest('[data-ma-fold]');if(!f||!secEl.contains(f))return;e.preventDefault();e.stopPropagation();
      const part=f.dataset.maFold,shut=!this.folded(part);this.setFolded(part,shut);
      const body=part==='list'?f.closest('.maSources').querySelector(':scope > .maSrcBody'):secEl.querySelector(':scope > .maSecBody');
      if(body)body.hidden=shut;f.textContent=shut?'▸':'▾';(part==='list'?f.closest('.maSources'):secEl).classList.toggle(part==='list'?'folded':'maFoldedSec',shut);});}
    /* the source list: one listener each, so a re-drawn list (search, sort, group) keeps working */
    const src=host.querySelector('.maSources');
    if(src){
      src.addEventListener('input',e=>{if(e.target.matches('[data-ma-search]')){this._srcQ=e.target.value;this.srcRedraw(host);}});
      src.addEventListener('change',e=>{const t=e.target;
        if(t.matches('[data-ma-sort],[data-ma-group]')){const v=lsGet(this.VIEW_KEY,{})||{};v[t.matches('[data-ma-sort]')?'sort':'group']=t.value;lsSet(this.VIEW_KEY,v);this.srcRedraw(host);return;}
        if(!t.matches('[data-ma-src]'))return;
        if(this.running||this.starting){t.checked=!t.checked;return;}
        /* the real desk WARNS about a bot that has not qualified — it does not forbid it */
        if(t.checked&&this.realDesk()){const inf=this.sourceInfo(t.dataset.maSrc);
          if(!(inf&&inf.ok)){const nm=BOT_BY_ID[t.dataset.maSrc]?.name||t.dataset.maSrc;
            const miss=inf&&inf.checks?inf.checks.filter(c=>!c.ok).map(c=>'  ✕ '+c.label+' — '+c.got).join('\n'):'  ✕ no paper record yet';
            if(!confirm('⚠ WARNING — '+nm+' has NOT qualified for real money'+(inf&&inf.of?' (meets '+inf.met+' of '+inf.of+', needs 4)':'')+'.\n\nWhat it is missing:\n'+miss+'\n\nIts signals would place REAL orders on your JustMarkets account. A bot that is not proven on paper is more likely to lose real money.\n\nTick it anyway, at your own risk?')){t.checked=false;return;}}}
        const set=new Set(this.picked());if(t.checked)set.add(t.dataset.maSrc);else set.delete(t.dataset.maSrc);
        this.draft.sources=[...set];this.draft.source=this.draft.sources[0]||'';
        t.closest('.maSrcRow').classList.toggle('on',t.checked);this.refresh();
      });
      src.addEventListener('click',e=>{
        const w=e.target.closest('[data-ma-why]');
        if(w){e.preventDefault();const id=w.dataset.maWhy,box=src.querySelector('[data-ma-whybox="'+id+'"]');this._whyOpen=this._whyOpen||new Set();
          if(box){box.hidden=!box.hidden;w.textContent=box.hidden?'why?':'hide';box.hidden?this._whyOpen.delete(id):this._whyOpen.add(id);}return;}
        if(e.target.closest('[data-ma-none]')){if(this.running||this.starting)return;this.draft.sources=[];this.draft.source='';src.querySelectorAll('[data-ma-src]').forEach(c=>{c.checked=false;c.closest('.maSrcRow').classList.remove('on');});this.refresh();}
      });
    }
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
    host.querySelectorAll('[data-ma-src],[data-ma-none]').forEach(el=>{el.disabled=this.running||this.starting;});
    const cnt=host.querySelector('[data-ma-count]');if(cnt)cnt.textContent=host.querySelectorAll('[data-ma-src]:checked').length+' chosen';
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
    if(c.mode==='confluence'&&!(c.sources&&c.sources.length))return 'Tick at least one signal source.';
    return null;
  },
  async start(){
    if(this.running||this.starting)return false;
    const c={...this.draft,sources:this.picked(),sym:document.getElementById('mbSym')?.dataset.val};
    c.source=c.sources[0]||'';
    const why=this.valid(c);if(why){this.status=why;this.refresh();return false;}
    if(!navigator.locks){this.status='This browser cannot coordinate automatic entries across windows.';this.refresh();return false;}
    this.starting=true;const version=++this.revision;this.refresh();
    // Keep the lifetime lock until Stop or window shutdown, without saving an ON flag.
    return new Promise(resolve=>{
      navigator.locks.request(this.target==='manual'?'astra-manual-auto-session':'astra-live-manual-auto-session',{ifAvailable:true},async lock=>{
        this.starting=false;
        if(!lock||version!==this.revision){this.status=lock?'Stopped.':'Another window has an automatic manual session. Stop it there first.';this.refresh();resolve(false);return;}
        this.config=Object.freeze(c);this.count=0;this.events=[];this.running=true;
        this.status='Running · '+(c.scope==='all'?'all JustMarkets instruments':c.sym)+' · '+this.srcNames(c.sources);
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
      const c=this.config,list=c.sources&&c.sources.length?c.sources:[c.source||'confluence'];
      /* each source is scanned and its signals entered straight away, while they are fresh
         (a signal older than 90 s is refused anyway); one entry per pair per pulse */
      const taken=new Set(),seenPairs=new Set();let found=0;
      for(const src of (this.config.sources&&this.config.sources.length?this.config.sources:list)){
        if(!this.active(version))return;
        /* a source dropped from the session meanwhile is not scanned any more */
        if(this.config.sources&&this.config.sources.length&&!this.config.sources.includes(src))continue;
        let rows;try{rows=await this.scan({...c,source:src},version);}catch(e){this.log('',(BOT_BY_ID[src]?.name||src)+': '+e.message);continue;}
        if(!this.active(version))return;
        const here=rows.filter(r=>c.scope==='all'||Feed.brokerName(r.sym)===Feed.brokerName(c.sym)).map(r=>({...r,source:src}));
        here.forEach(r=>seenPairs.add(r.sym));
        const cands=here.filter(r=>r.signal?.dir&&(c.direction==='both'||r.signal.dir===(c.direction==='buy'?1:-1))).sort((a,b)=>(b.signal?.score||0)-(a.signal?.score||0));
        found+=cands.length;
        if(!cands.length){const issue=here.find(r=>r.status==='ERROR');if(issue)this.log(issue.sym,issue.why);}
        this.status='Running · '+list.length+' source'+(list.length===1?'':'s')+' · now: '+(BOT_BY_ID[src]?.name||src)+' · '+seenPairs.size+' pairs checked · '+found+' signal candidates';this.refresh();
        for(const row of cands){
          if(!this.active(version))return;
          const k=Feed.brokerName(row.sym);if(taken.has(k))continue;taken.add(k);
          await this.enter(row,version);
        }
      }
      if(this.active(version))this.status='Running · '+list.length+' source'+(list.length===1?'':'s')+' · '+seenPairs.size+' pairs checked · '+found+' signal candidates';
      if(Bots.active==='manual'){OpenTrades.refresh();Bots.render();}
    }catch(e){console.error('ASTRA manual automation:',e);if(this.active(version))this.stop('Automatic session stopped: '+e.message);}
    finally{this.busy=false;this.refresh();}
  },
  srcNames(list){ list=list||[]; const n=list.map(id=>BOT_BY_ID[id]?.name||id); return n.length<=3?n.join(', '):n.slice(0,3).join(', ')+' +'+(n.length-3)+' more'; },
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
