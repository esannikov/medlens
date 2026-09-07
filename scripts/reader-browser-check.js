// Real-browser regression: reserved navigation, direct manipulation, data-first reader.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const revision='edfaf88447668409717873f4b0cb9c38a7603f01b94c668b76a8c0504c9b422f';
 const pathology='EV-ST-2CC125988DECAA58',cbc='EV-ST-EC9BE96D4DEE8C1F',ihc='FD-RB-DD627CBB69EE9A83';
 const checks=[],errors=[],drags=[];const listen=e=>errors.push(e.message);page.on('pageerror',listen);
 const check=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
 const enter=async(id)=>{await page.goto(base+'?at='+id+'&revision='+revision);await page.locator('.lens-boundary').waitFor();await page.waitForTimeout(500);await page.mouse.move(10,200);};
 const geometry=()=>page.locator('.lens-boundary').evaluate(el=>{const b=el.getBoundingClientRect();return [b.x,b.y,b.width,b.height];});
 const point=async(id)=>page.locator(`[data-lens-node="${id}"]`).evaluate(el=>{const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');return {x:b.x+m.e,y:b.y+m.f,cx:b.x+Number(c.getAttribute('cx')),cy:b.y+Number(c.getAttribute('cy'))};});
 try{
  for(const size of [{width:2048,height:1150},{width:1440,height:900},{width:1000,height:900},{width:390,height:844}]){
   await page.setViewportSize(size);await enter(ihc);
   const gap=await page.locator('.focus-breadcrumb').evaluate(el=>{
    const bottom=el.getBoundingClientRect().bottom,s=document.querySelector('.lens-svg');
    const ring=s.querySelector('.lens-orbit-compass');
    return {bottom,canvas:s.getBoundingClientRect().top,ring:ring?.getBoundingClientRect().top};
   });
   check(gap.canvas>gap.bottom&&gap.ring>gap.bottom,'Chips cannot overlap the canvas or compass: '+size.width);
   const before=await geometry();await page.getByRole('button',{name:'Дані',exact:true}).click();
   await page.getByRole('button',{name:'Час',exact:true}).click();
   check(JSON.stringify(before)===JSON.stringify(await geometry()),'Reader and time keep fixed lens geometry: '+size.width);
   await page.getByRole('button',{name:'Закрити час'}).click();await page.getByRole('button',{name:'Закрити запис'}).click();
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No viewport overflow: '+size.width);
  }
  await page.setViewportSize({width:1440,height:1000});await enter(pathology);
  const findings=await page.evaluate(async id=>{const d=await fetch('data/case024.json').then(r=>r.json());return d.edges.filter(e=>e.source===id&&e.relation==='yields_finding').map(e=>e.target);},pathology);
  for(const id of findings){
   await enter(pathology);const a=await point(id);
   await page.mouse.move(a.x,a.y);await page.mouse.down();let worst=0;
   for(let step=1;step<=12;step++){
    const x=a.x+(a.cx-a.x)*step/12,y=a.y+(a.cy-a.y)*step/12;
    await page.mouse.move(x,y);const p=await point(id);worst=Math.max(worst,Math.hypot(p.x-x,p.y-y));
   }
   await page.waitForTimeout(230);check(worst<2,'Far finding stays under cursor throughout drag: '+id);
   check(await page.locator('.lens-view').getAttribute('data-focus-caption')===id,'One drag brings finding into reading focus: '+id);
   await page.mouse.up();await page.waitForTimeout(100);
   check(!await page.locator('.focus-rail').isVisible(),'Drag does not accidentally open a record: '+id);drags.push({id,worst});
  }
  await enter(pathology);
  const label=page.locator(`[data-label-for="${ihc}"] text`).first(),box=await label.boundingBox(),anchor=await point(ihc);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+anchor.cx-anchor.x,box.y+box.height/2+anchor.cy-anchor.y,{steps:16});
  await page.waitForTimeout(230);const end=await point(ihc);
  check(Math.hypot(end.x-end.cx,end.y-end.cy)<2,'Dragging the caption keeps its node offset and reaches centre');
  await page.mouse.up();await page.waitForTimeout(100);
  await enter(pathology);await page.getByRole('button',{name:'Дані',exact:true}).click();
  check(await page.locator('[data-reader-result]').count()===4,'Four pathology descriptions immediately available');
  check((await page.locator('.reader-results').innerText()).includes('Імуногістохімічне дослідження: недоцільно.'),'Full description and negation retained');
  check(await page.locator('.reader-sources').getAttribute('open')===null,'Sources collapsed on arrival');
  check(await page.locator('.focus-rail .node-row').count()===0,'No intermediate tissue navigation required');
  await page.screenshot({path:'output/playwright/reader-pathology.png'});
  await enter(cbc);await page.getByRole('button',{name:'Дані',exact:true}).click();
  check(await page.locator('[data-reader-result]').count()===12,'All twelve CBC objects displayed');
  check(await page.locator('[data-reader-result="OB-RB-8A398C58DC4BAF5A"]').innerText().then(t=>t.includes('5,3')&&t.includes('одиницю не зазначено')),'Missing unit is not silently repaired');
  check(await page.locator('.reader-sources [data-source-id]').count()===11,'Eleven distinct source fragments, not twelve');
  check(await page.locator('.reader-sources').getAttribute('open')===null,'New study has collapsed sources');
  await page.screenshot({path:'output/playwright/reader-cbc.png'});
  await page.locator('.reader-sources > summary').click();
  const hb=page.locator('[data-source-id="SR-0845FEA2BE58-P0016"]');
  check((await hb.innerText()).includes('Гемоглобін'),'Source caption identifies its content');
  await hb.click();check((await page.locator('.source-text blockquote').innerText()).includes('Гемоглобін: 142 г/л;'),'Exact source text opens');
  await page.getByRole('button',{name:'До об’єкта',exact:true}).click();
  check(await page.locator('[data-reader-result]').count()===12,'Back restores results');
  await page.locator('[data-reader-result="OB-RB-770F06DBAA4E7964"]').click();await page.waitForTimeout(550);
  check((await page.locator('.rail-header h2').innerText())==='Гемоглобін','Result row opens that observation');
  check(await page.locator('.reader-sources').getAttribute('open')===null,'Observation source block starts collapsed');
  await page.setViewportSize({width:390,height:844});await enter(pathology);await page.getByRole('button',{name:'Дані',exact:true}).click();
  check(await page.locator('[data-reader-result]').count()===4,'Mobile also exposes descriptions');
  check(await page.locator('.rail-content').evaluate(el=>el.scrollWidth<=el.clientWidth),'No horizontal reader overflow');
  check(await page.locator('.rail-header h2').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Long mobile header is not clipped');
  await page.screenshot({path:'output/playwright/reader-mobile.png'});
  check(errors.length===0,'No page errors');return {status:'PASS',checks,drags,errors};
 }finally{page.off('pageerror',listen);}
}
