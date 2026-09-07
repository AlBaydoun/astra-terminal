/* Browser-only fixtures. This lexical localStorage shadows real browser storage
   for every classic script on this page, including the application config. */
const sourceMemory = new Map();
const localStorage = {
  getItem:k => sourceMemory.get(k) ?? null,
  setItem:(k,v) => sourceMemory.set(k,String(v)), removeItem:k => sourceMemory.delete(k),
  key:i => [...sourceMemory.keys()][i], get length(){ return sourceMemory.size; },
};
const savedAddEventListener = window.addEventListener;
window.addEventListener = function(type, fn, options){
  if (type !== 'DOMContentLoaded') savedAddEventListener.call(window,type,fn,options);
};
const wireSockets = [];
class WebSocket {
  constructor(url){ this.url=url; this.closed=false; wireSockets.push(this); }
  close(){ this.closed=true; }
}
const MarketState = {of:()=>({})};
const OpenTrades = {stop(){}};
window.fetch = async url => { throw Error('Unexpected network request: ' + url); };
