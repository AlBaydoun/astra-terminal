/* Fixed public RSS sources. Headlines/links only; no arbitrary-URL proxy,
   credentials, article scraping or dependencies. Failures keep their true age. */
const SOURCES = [
  {id:'markets',name:'CNBC Markets',url:'https://www.cnbc.com/id/100003114/device/rss/rss.html',host:'cnbc.com'},
  {id:'economy',name:'CNBC Economy',url:'https://www.cnbc.com/id/20910258/device/rss/rss.html',host:'cnbc.com'},
  {id:'fed',name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_all.xml',host:'federalreserve.gov'},
  {id:'ecb',name:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',host:'ecb.europa.eu'},
  {id:'energy',name:'US Energy Information Administration',url:'https://www.eia.gov/rss/todayinenergy.xml',host:'eia.gov'},
];
const TTL=5*60*1000, WEEK=7*86400000;
function decode(s){
  return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>{
    if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):+v.slice(1);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[v.toLowerCase()];
  });
}
function parse(xml,source,now=Date.now()){
  if(!/<rss[\s>]/i.test(xml)||!/<channel[\s>]/i.test(xml))throw Error('Invalid RSS response');
  const out=[];
  for(const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const field=name=>decode((match[1].match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))||[])[1]);
    const title=field('title').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,350);
    let url;try{url=new URL(field('link').trim());}catch{continue;}
    if(!title||url.protocol!=='https:'||!(url.hostname===source.host||url.hostname.endsWith('.'+source.host)))continue;
    const date=Date.parse(field('pubDate')),publishedAt=Number.isFinite(date)?date:null;
    if(publishedAt!=null&&(publishedAt>now+300000||now-publishedAt>WEEK))continue;
    url.hash='';
    out.push({title,url:url.href,publishedAt,source:source.name,sourceId:source.id});
    if(out.length>=40)break;
  }
  return out;
}
function createService(fetcher=fetch,clock=Date.now){
  const cache=new Map();let pending=null,last=null,checked=0;
  return async function getNews(){
    if(last&&clock()-checked<TTL)return last;
    if(pending)return pending;
    pending=(async()=>{
      const sources=await Promise.all(SOURCES.map(async s=>{
        try{
          const r=await fetcher(s.url,{signal:AbortSignal.timeout(10000),headers:{accept:'application/rss+xml, application/xml, text/xml','user-agent':'ASTRA-News/1.0 (RSS reader)'}});
          if(!r.ok)throw Error('HTTP '+r.status);
          const xml=await r.text();if(xml.length>2000000)throw Error('Feed exceeds size limit');
          const items=parse(xml,s,clock());cache.set(s.id,{items,fetchedAt:clock()});
          return {...s,status:'ok',fetchedAt:clock(),count:items.length};
        }catch(e){
          const old=cache.get(s.id);
          return {...s,status:old?'cached':'unavailable',fetchedAt:old?.fetchedAt||null,count:old?.items.length||0,error:String(e.message).slice(0,120)};
        }
      }));
      const seen=new Set(),items=[];
      for(const s of sources){for(const item of cache.get(s.id)?.items||[]){
        if(item.publishedAt!=null&&clock()-item.publishedAt>WEEK)continue;
        const key=item.title.toLowerCase().replace(/[^a-z0-9]/g,'');
        if(seen.has(item.url)||seen.has(key))continue;seen.add(key);seen.add(item.url);
        items.push({...item,stale:s.status!=='ok',fetchedAt:s.fetchedAt});
      }}
      items.sort((a,b)=>(b.publishedAt||0)-(a.publishedAt||0));
      checked=clock();last={items,sources,checkedAt:checked,refreshMs:TTL};return last;
    })();
    try{return await pending;}finally{pending=null;}
  };
}
module.exports={SOURCES,parse,createService};
