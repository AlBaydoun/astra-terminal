/* Reuse the audited intraday execution model without changing its old results. */
const IntradayCandidates={warmup:Confluence.warmup,
  list:[{id:'confluence',name:'ASTRA Confluence M15'}],
  prepare:bars=>({bars}),
  signal(id,ctx,i){const s=Confluence.inspect(ctx.bars,i,'15m');return s.dir?s:null;},
};
