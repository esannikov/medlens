// Browser contract for the implemented branch-first reader; no private inputs.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const revision='edfaf88447668409717873f4b0cb9c38a7603f01b94c668b76a8c0504c9b422f';
 const flc='EV-ST-72D72BAB7426522F',ldh='EV-ST-176D7E131B1E3CDC',blood='SP-SM-D5F42D460E844B28';
 const forbidden=[ldh,'EV-ST-04982C78F1EF4617','EV-ST-FDCDA56787FC7BA5'];
 const results=['OB-RB-6C5ABFBA6915A58A','OB-RB-78178B03C22D5F6D','OB-RB-B2D94AC53B216EF7','OB-RB-0E1E300F7DD2D1F5','OB-RB-2CF083D0B0D6CE17','OB-RB-52A8C861602232DD','OB-RB-9375E212CD2EBC35'];
 const checks=[],errors=[];const capture=e=>errors.push(e.message);page.on('pageerror',capture);
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const focus=()=>page.locator('.lens-view').getAttribute('data-focus-caption');
 const labels=()=>page.locator('[data-label-for]').evaluateAll(els=>els.map(e=>e.getAttribute('data-label-for')));
 const enter=async(id)=>{await page.goto(base+'?at='+id+'&revision='+revision);await page.locator('.lens-boundary').waitFor();await page.waitForTimeout(500);await page.mouse.move(20,220);};
 try{
  await page.setViewportSize({width:1440,height:1000});await enter('PT-CASE024');
  check((await labels()).length===5,'Dossier has only patient and four department captions');
  await enter(flc);let ids=await labels();
  check(results.every(id=>ids.includes(id)),'All seven light-chain results are readable on desktop');
  check(ids.includes(blood)&&ids.includes('SP-SM-4132FDD86266A9E6'),'Blood and urine bridge the study to results');
  check(forbidden.every(id=>!ids.includes(id)),'LDH, glucose and myelogram have no automatic captions');
  check(await page.locator('[data-lens-node]').count()===189,'All objects and navigation groups remain in geometry');
  for(const id of results)check(Number(await page.locator(`[data-graph-edge="${id}"]`).getAttribute('opacity'))>=.62,'Readable connection: '+id);
  await page.screenshot({path:'output/playwright/reveal-light-chains.png'});
  await page.locator(`[data-lens-node="${ldh}"]`).hover();await page.waitForTimeout(60);
  ids=await labels();check(ids.includes(ldh),'Explicit hover reveals LDH');
  check(await focus()===flc,'Preview leaves the reading focus unchanged');
  check(!ids.includes('EV-ST-FDCDA56787FC7BA5'),'LDH preview does not expand other laboratory studies');
  await page.mouse.move(20,220);check(!(await labels()).includes(ldh),'Preview disappears when the pointer leaves');
  await page.getByRole('button',{name:'Дані',exact:true}).click();
  const delta=await page.locator(`[data-lens-node="${blood}"]`).evaluate(el=>{
   const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');
   return {x:b.x+b.width*.45,y:b.y+b.height*.5,dx:Number(c.getAttribute('cx'))-m.e,dy:Number(c.getAttribute('cy'))-m.f};
  });
  await page.mouse.move(delta.x,delta.y);await page.mouse.down();await page.mouse.move(delta.x+delta.dx,delta.y+delta.dy);
  check(await focus()===flc,'Brief crossing does not immediately change the reading focus');
  await page.waitForTimeout(230);
  check(await focus()===blood,'Stable target commits during drag without waiting for mouseup');
  check(await page.locator('.focus-rail').getAttribute('data-reader-object')===blood,'Reader and lens commit the same focus');
  check(await page.locator('[data-compass-cluster="group:laboratory_panel"]').count()===0,'Compass uses the same department');
  await page.mouse.up();await page.waitForTimeout(100);
  ids=await labels();check(!ids.includes('SP-SM-4132FDD86266A9E6'),'Blood focus does not expand the urine sibling');
  check(forbidden.every(id=>!ids.includes(id)),'No unrelated captions after drag');
  await enter(flc);
  const interrupted=await page.locator(`[data-lens-node="${blood}"]`).evaluate(el=>{
   const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');
   return {x:b.x+b.width*.45,y:b.y+b.height*.5,dx:Number(c.getAttribute('cx'))-m.e,dy:Number(c.getAttribute('cy'))-m.f};
  });
  await page.mouse.move(interrupted.x,interrupted.y);await page.mouse.down();await page.mouse.move(interrupted.x+interrupted.dx,interrupted.y+interrupted.dy);await page.mouse.up();
  await page.locator('[data-compass-cluster="group:imaging_study"]').focus();await page.keyboard.press('Enter');
  await page.waitForTimeout(200);check(await focus()==='group:imaging_study','Explicit navigation cancels a pending reading target');
  await enter('group:imaging_study');
  const box=await page.locator('.lens-svg').boundingBox(),r=Number(await page.locator('.lens-boundary').getAttribute('r'));
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.45+r*.4,box.y+box.height*.5+r*.1,{steps:12});await page.waitForTimeout(220);await page.mouse.up();
  check(await focus()==='group:imaging_study','Regression pan remains in imaging');
  check(!(await labels()).includes('EV-ST-FDCDA56787FC7BA5'),'Myelogram stays unlabeled in the formerly failing pan phase');
  check((await labels()).every(id=>id==='PT-CASE024'||id==='group:imaging_study'||id.startsWith('EV-')),'Imaging overview does not expand findings');
  await page.screenshot({path:'output/playwright/reveal-imaging-pan.png'});
  await page.locator('.lens-svg').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(520);
  check((await focus()).startsWith('EV-'),'Keyboard opens the next logical level');
  await page.keyboard.press('Enter');await page.waitForTimeout(100);
  check(await page.locator('.focus-rail').getAttribute('data-reader-object')===await focus(),'Keyboard reading stays aligned');
  await page.setViewportSize({width:390,height:844});await enter(flc);
  ids=await labels();check(forbidden.every(id=>!ids.includes(id)),'No unrelated mobile captions');
  await page.getByRole('button',{name:'Усі результати · 7',exact:true}).click();
  check(await page.locator('.lens-coverage-content li').count()===7,'All seven results remain accessible on mobile');
  await page.getByRole('button',{name:'Закрити перелік',exact:true}).click();await page.screenshot({path:'output/playwright/reveal-mobile.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await enter('group:imaging_study');
  await page.locator('.lens-svg').focus();await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);check((await focus()).startsWith('EV-'),'Explicit reduced-motion navigation has no dwell delay');
  await page.emulateMedia({reducedMotion:'no-preference'});
  check(errors.length===0,'No page errors');
  return {status:'PASS',checks,errors};
 }finally{page.off('pageerror',capture);}
}
