const MarketSources={allowed:()=>true,brokerSymbol:s=>Feed.bridgeHas(s),executable:(s,src)=>src==='bridge',brokerList:()=>['XAUUSD.s']};
const PairRules={blocked:()=>false};
const Live={armedEntry(){throw Error('A paper experiment reached live arming');},submit(){throw Error('A paper experiment attempted a real order');}};
const INDS=[],IND_BY_ID={};
const Chart={settings:{},replay:{active:false}};
Bots.render=()=>{};
