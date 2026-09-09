const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SOURCES,parse,createService}=require('../server/news.cjs');
const now=Date.UTC(2026,8,9,12);
const item=(title,date=new Date(now).toUTCString(),link='https://www.cnbc.com/story')=>`<item><title><![CDATA[${title}]]></title><link>${link}</link>${date?'<pubDate>'+date+'</pubDate>':''}</item>`;
const rss=body=>'<rss version="2.0"><channel>'+body+'</channel></rss>';
test('Parses real RSS conventions without publishing article markup or unsafe links',()=>{
  const result=parse(rss(item('Rates &amp; markets &#8212; <b>today</b>')+item('unsafe',undefined,'javascript:alert(1)')+item('wrong source',undefined,'https://evil.test/story')),SOURCES[0],now);
  assert.equal(result.length,1);assert.equal(result[0].title,'Rates & markets — today');assert.equal(result[0].publishedAt,now);
});
test('Missing dates stay unknown; old and future items cannot masquerade as fresh',()=>{
  const result=parse(rss(item('undated','')+item('old',new Date(now-8*86400000).toUTCString())+item('future',new Date(now+3600000).toUTCString())),SOURCES[0],now);
  assert.equal(result.length,1);assert.equal(result[0].publishedAt,null);assert.throws(()=>parse('<html>Error</html>',SOURCES[0],now));
});
test('Concurrent requests share source fetches, deduplicate, cache, and retain original ages on failure',async()=>{
  let at=now,calls=0,fail=false;
  const service=createService(async url=>{calls++;if(fail)throw Error('fixture offline');const s=SOURCES.find(x=>x.url===url);return {ok:true,text:async()=>rss(item('Shared rate decision',undefined,'https://'+s.host+'/story'))};},()=>at);
  const [a,b]=await Promise.all([service(),service()]);assert.strictEqual(a,b);assert.equal(calls,5);assert.equal(a.items.length,1);
  await service();assert.equal(calls,5);
  at+=301000;fail=true;const c=await service();assert.equal(calls,10);assert(c.sources.every(s=>s.status==='cached'));assert.equal(c.items[0].fetchedAt,now);assert(c.items[0].stale);
  at+=8*86400000;assert.equal((await service()).items.length,0);
});
test('A complete initial outage returns explicit unavailable sources and no invented news',async()=>{
  const service=createService(async()=>{throw Error('offline');},()=>now);const d=await service();assert.equal(d.items.length,0);assert.equal(d.sources.length,5);assert(d.sources.every(s=>s.status==='unavailable'&&s.fetchedAt===null));
});
