test('Analysis is a page, excluded from every trading-account list',()=>{
  assert(Bots.isPage(BOT_BY_ID.analysis),'Analysis could run as a bot');
  assert(!Bots.tradingBots().some(b=>b.id==='analysis'),'Analysis counted as a trading account');
  assert(WorkspaceUI.group(BOT_BY_ID.analysis)==='Overview','Analysis missing from Overview');
});
test('Analysis mounts through the actual workspace and refresh preserves date controls',()=>{
  const before=JSON.stringify(Bots.ledgers);
  Bots.active='analysis';Bots.render();
  const input=document.querySelector('[data-an-filter="from"]');
  assert(input&&document.querySelector('.anHero'),'Analysis route did not render');
  input.value='2026-09-01';input.focus();Bots.render();
  assert(input===document.querySelector('[data-an-filter="from"]')&&input.value==='2026-09-01'&&document.activeElement===input,'Tick replaced date controls');
  assert(JSON.stringify(Bots.ledgers)===before,'Analysis changed saved account data');input.blur();
});
