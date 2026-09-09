/* Every broker instrument keeps a place in the loop. Quotes never restart it,
   otherwise a long catalogue would never scroll as far as the final pairs. */
const Strip = {
  el:null,key:null,slots:[],busy:false,paused:false,lastError:'',quotesAt:0,
  catalogue(){return [...new Set(MarketSources.brokerList().map(s=>Feed.brokerName(s)))].sort();},
  init(){
    this.el=document.getElementById('tickerStrip');this.build();
    this.el.addEventListener('click',e=>{
      const chip=e.target.closest('[data-sym]');
      if(chip && MarketSources.allowed(chip.dataset.sym)){
        App.setTf('15m');App.setSymbol(chip.dataset.sym);return;
      }
      if(e.target.closest('[data-strip="pause"]')){this.paused=!this.paused;this.build();}
      if(e.target.closest('[data-strip="board"]')){
        document.querySelector('#botTabs button[data-tab="bots"]')?.click();
        Bots.active='confluenceScanner';Bots.wire();Bots.render();
      }
    });
    setInterval(()=>this.build(),5000);
    setInterval(()=>this.refreshQuotes(),30000);
    BUS.on('marketSources',()=>{this.build();this.refreshQuotes();});
    this.refreshQuotes();
  },
  async refreshQuotes(){
    if(this.busy)return;this.busy=true;
    const syms=this.catalogue();let cursor=0;const errors=[];
    try{
      await Promise.all(Array.from({length:Math.min(2,Math.ceil(syms.length/40))},async()=>{
        while(cursor<syms.length){
          const batch=syms.slice(cursor,cursor+=40),controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),8000);
          try{
            const quotes=await Feed.quotes(batch,{signal:controller.signal,strict:true});
            MK.applyQuotes(quotes.filter(q=>MarketSources.allowed(q.symbol)));
            if(quotes.length<batch.length)errors.push((batch.length-quotes.length)+' missing quotes');
          }catch(e){errors.push(controller.signal.aborted?'quote request timed out':e.message);}
          finally{clearTimeout(timeout);}
        }
      }));
      this.quotesAt=Date.now();this.lastError=errors.join('; ');
    }finally{this.busy=false;this.build();}
  },
  item(sym,rows){
    const t=STORE.tickers.get(sym),live=Feed.isLive(sym)&&MarketSources.executable(sym,Feed.srcOf[sym]);
    const row=rows.get(sym),s=row?.signal,q=live?Bots.quoteFor(sym):null;
    const blocked=PairRules.blocked(sym),offset=Feed.bridgeClock?.offset;
    const age=Number.isFinite(offset)&&s?Date.now()/1000+offset-s.entryBar:Infinity;
    const recent=age>=0&&age<900;
    let badge=!t?'NO PRICE':!live?'STALE':'',priority=0;
    let why=!live?'No fresh broker price — no entry indication':blocked?'Blocked in Instrument permissions':'';
    if(live && !blocked && s?.dir && !ConfluenceBot.entryReason(s,q)){
      if(['SETUP','READY'].includes(row.status)){badge=(s.dir>0?'BUY':'SELL')+' SETUP';priority=3;why='Confluence M15 setup; the bot still checks account limits before entry';}
      else if(row.status==='OPENED'){badge='OPENED';why='The paper bot already entered this signal';}
      else if(row.status==='BLOCKED'){badge='BLOCKED';why=row.why;}
    }else if(live && !blocked && recent && !s?.dir && s?.near && s.score>=80 && !s.failed?.some(x=>x.startsWith('Outside'))){
      badge=(s.near>0?'BUY':'SELL')+' WATCH';priority=2;why='Confluence '+s.score/20+'/5 checks; '+(s.failed?.join('; ')||'waiting for a new trigger')+' — not an entry signal';
    }
    const move=row?.move,moveAge=Number.isFinite(offset)&&move?Date.now()/1000+offset-move.time:Infinity;
    const swing=live&&moveAge>=900&&moveAge<1800&&Number.isFinite(move.ratio)?move.ratio:0;
    if(swing>=1.5 && !priority && badge!=='OPENED' && badge!=='BLOCKED'){
      badge='SWING '+swing.toFixed(1)+'×';priority=1;why=(why?why+'; ':'')+'Last completed M15 true range / preceding 20-bar average. A large move is not a trade signal';
    }
    const day=Number.isFinite(t?.open)&&t.open>0&&Number.isFinite(t.last)?(t.last/t.open-1)*100:null;
    return {sym,t,live,day,badge,priority,swing,why};
  },
  ranked(items){return items.slice().sort((a,b)=>b.priority-a.priority || Number(b.live)-Number(a.live) || b.swing-a.swing || Math.abs(b.day||0)-Math.abs(a.day||0) || a.sym.localeCompare(b.sym));},
  build(){
    if(!this.el)return;
    const syms=this.catalogue(),key=syms.join('|');
    const rows=new Map((typeof ConfluenceScanner!=='undefined'?ConfluenceScanner.rows:[]).map(r=>[Feed.brokerName(r.sym),r]));
    const items=syms.map(s=>this.item(s,rows)),bySym=new Map(items.map(r=>[r.sym,r]));
    const hot=this.ranked(items).filter(x=>x.live).slice(0,8);
    if(key!==this.key){
      this.key=key;this.slots=[];
      syms.forEach((sym,i)=>{if(i%5===0)this.slots.push({kind:'focus',sym:null,rank:Math.floor(i/5)});this.slots.push({kind:'all',sym});});
      const group=this.slots.map((slot,i)=>`<button class="tsChip" data-slot="${i}" data-kind="${slot.kind}"><b></b><span class="tsPrice"></span><i></i><em></em></button>`).join('');
      this.el.innerHTML=`<button class="tsControl" data-strip="board" title="Open the full Confluence scanner">${syms.length} pairs</button><button class="tsControl" data-strip="pause" aria-label="Pause ticker">Ⅱ</button><div class="tsWindow"><div class="tsTrack" style="--tsDuration:${Math.max(1,this.slots.length)*310/70}s"><div class="tsGroup">${group}</div><div class="tsGroup" aria-hidden="true">${group}</div></div></div>`;
      this.el.querySelectorAll('.tsGroup[aria-hidden] button').forEach(b=>b.tabIndex=-1);
    }
    const frozen=this.paused||this.el.matches(':hover')||!!this.el.querySelector('.tsChip:focus');
    for(const slot of this.slots)if(slot.kind==='focus'&&(!frozen||!bySym.has(slot.sym)))slot.sym=hot.length?hot[slot.rank%hot.length].sym:syms[slot.rank%syms.length];
    for(const chip of this.el.querySelectorAll('.tsChip')){
      const slot=this.slots[Number(chip.dataset.slot)],r=bySym.get(slot.sym);if(!r)continue;
      chip.dataset.sym=r.sym;chip.dataset.signal=r.badge;chip.dataset.live=String(r.live);
      chip.querySelector('b').textContent=r.sym;chip.querySelector('.tsPrice').textContent=Number.isFinite(r.t?.last)?fmtPrice(r.t.last):'—';
      const pct=chip.querySelector('i');pct.textContent=r.day==null?'day —':fmtPct(r.day)+' day';pct.className=r.live&&r.day!=null?pctClass(r.day):'dim2';
      chip.querySelector('em').textContent=r.badge||(slot.kind==='focus'?'FOCUS':'');
      chip.classList.toggle('tsSetup',r.priority===3);chip.classList.toggle('tsWatch',r.priority===2);chip.classList.toggle('tsStale',!r.live);
      chip.title=r.sym+' · '+(r.why||'Day change is measured from the broker daily candle open')+' · Click for M15 chart';
    }
    const track=this.el.querySelector('.tsTrack');if(track)track.style.animationPlayState=this.paused?'paused':'';
    const pause=this.el.querySelector('[data-strip="pause"]');if(pause){pause.textContent=this.paused?'▶':'Ⅱ';pause.setAttribute('aria-label',this.paused?'Resume ticker':'Pause ticker');}
    this.el.title=syms.length+' JustMarkets instruments · complete loop with repeated spotlights · day change, not rolling 24h · hover to pause'+(this.lastError?' · Quote refresh: '+this.lastError:'');
  },
};
