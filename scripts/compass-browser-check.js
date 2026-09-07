// Run through Playwright CLI on the local preview or published MedLens page.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href),owner='SP-SM-B63E3EEA4109AC5E';
 const checks=[];const check=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
 const settle=()=>page.waitForTimeout(480);
 const enter=async()=>{await page.goto(base+'?at='+owner+'&revision=edfaf88447668409717873f4b0cb9c38a7603f01b94c668b76a8c0504c9b422f');await page.locator('.lens-boundary').waitFor();await settle();};
 await page.setViewportSize({width:1440,height:1000});await enter();
 const resultIds=await page.locator('.lens-coverage').getAttribute('data-coverage-result-ids');
 const ids=resultIds.split(' ');check(ids.length===27,'All 27 punctate results remain present');
 const bare=await page.locator('.lens-coverage').getAttribute('data-coverage-visible-ids');
 check(bare.split(' ').length>=12,'At least the original readable content remains beside the compass');
 const failures=[];
 for(const id of ids){
   await page.mouse.move(20,200);await page.locator(`[data-lens-node="${id}"]`).hover();
   const label=page.locator(`[data-label-for="${id}"]`);
   if(!await label.count()||Number(await label.getAttribute('opacity'))<.95)failures.push(id);
 }
 check(!failures.length,'All 27 nodes reveal on real pointer hover: '+failures.join(','));
 await page.mouse.move(20,200);await page.screenshot({path:'output/playwright/compass-punctate.png'});
 const before=await page.locator('[data-compass-cluster]').evaluateAll(els=>els.map(el=>el.getAttribute('data-compass-bearing')));
 await page.locator('[data-compass-cluster="group:pathology_procedure"] text').click();await settle();
 check(await page.locator('.lens-view').getAttribute('data-focus-caption')==='group:pathology_procedure','Compass text navigates to its cluster');
 const after=await page.locator('[data-compass-cluster]').evaluateAll(els=>els.map(el=>el.getAttribute('data-compass-bearing')));
 check(JSON.stringify(before)!==JSON.stringify(after),'Directions change with the lens transform');
 await page.locator('[data-compass-cluster="group:laboratory_panel"]').focus();await page.keyboard.press('Enter');await settle();
 check(await page.locator('.lens-view').getAttribute('data-focus-caption')==='group:laboratory_panel','Compass keyboard navigation');
 await page.getByRole('button',{name:'До всього досьє'}).click();await settle();await page.screenshot({path:'output/playwright/compass-root.png'});
 const directions=()=>page.locator('[data-compass-cluster]').evaluateAll(els=>els.map(el=>el.getAttribute('data-compass-bearing')));
 const prior=await directions(),box=await page.locator('.lens-svg').boundingBox();
 const radius=await page.locator('.lens-boundary').getAttribute('r');
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await page.mouse.down();
 await page.mouse.move(box.x+box.width*.5+85,box.y+box.height*.55+40,{steps:18});await page.mouse.up();
 check(JSON.stringify(prior)!==JSON.stringify(await directions()),'Compass responds during real lens drag');
 check(await page.locator('.lens-boundary').getAttribute('r')===radius,'Drag and compass preserve lens radius');
 for(const size of [{width:1440,height:1000},{width:1000,height:900},{width:390,height:844}]){
   await page.setViewportSize(size);await enter();
   const g=()=>page.locator('.lens-boundary').evaluate(el=>[el.getAttribute('cx'),el.getAttribute('cy'),el.getAttribute('r')]);
   const a=await g();await page.getByRole('button',{name:'Дані',exact:true}).click();const b=await g();
   check(JSON.stringify(a)===JSON.stringify(b),'Reader keeps stable lens: '+size.width);
   await page.getByRole('button',{name:'Закрити запис',exact:true}).click();
   check(await page.locator('[data-compass-cluster]').count()===4,'Four compass clusters: '+size.width);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No viewport overflow: '+size.width);
   if(size.width===390)await page.screenshot({path:'output/playwright/compass-mobile.png'});
 }
 return {status:'PASS',checks,initialReadable:bare.split(' ').length};
}
