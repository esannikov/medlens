// Run in the existing isolated Playwright CLI page, local preview or live site.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const revision='edfaf88447668409717873f4b0cb9c38a7603f01b94c668b76a8c0504c9b422f';
 const cbc='EV-ST-EC9BE96D4DEE8C1F',hb='OB-RB-770F06DBAA4E7964';
 const checks=[],contrasts=[];const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const enter=async(id)=>{await page.goto(base+'?at='+encodeURIComponent(id)+'&revision='+revision);await page.locator('.crumb-chip[aria-current]').waitFor();await page.waitForTimeout(500);};
 const palette=[['PT-CASE024','#6750a4'],['group:laboratory_panel','#087f71'],['group:pathology_procedure','#b03979'],['group:imaging_study','#245fc5'],['group:temporal','#9a600a'],[cbc,'#087f71'],[hb,'#087f71']];
 await page.setViewportSize({width:1440,height:900});
 for(const [id,color] of palette){
  await enter(id);
  const current=page.locator('.crumb-chip[aria-current="location"]');
  check(await current.getAttribute('data-crumb-id')===id,'Current breadcrumb identity: '+id);
  check((await current.getAttribute('data-crumb-color')).toLowerCase()===color,'Lens palette reused: '+id);
  const samples=await page.locator('.crumb-chip').evaluateAll(els=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
   const lum=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   return els.map(el=>{const c=getComputedStyle(el),a=lum(rgb(c.color)),b=lum(rgb(c.backgroundColor));return {id:el.getAttribute('data-crumb-id'),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),text:el.textContent,fg:c.color,bg:c.backgroundColor};});
  });
  check(samples.every(s=>s.ratio>=4.5),'Chip text contrast: '+id);contrasts.push(...samples);
 }
 await enter(cbc);
 check(await page.locator('.crumb-chip').count()===3,'CBC path has three chips');
 check(await page.locator('.crumb-separator').allTextContents().then(a=>a.length===2&&a.every(s=>s==='/')),'Slashes are outside the chips');
 await page.screenshot({path:'output/playwright/chips-cbc.png'});
 await page.locator('[data-crumb-id="group:laboratory_panel"]').click();await page.waitForTimeout(520);
 check(await page.locator('.lens-view').getAttribute('data-focus-caption')==='group:laboratory_panel','Parent chip preserves navigation');
 await page.getByRole('button',{name:'Назад до попереднього фокуса'}).click();await page.waitForTimeout(520);
 check(await page.locator('.crumb-chip[aria-current]').getAttribute('data-crumb-id')===cbc,'Back restores the previous focus');
 await page.locator('[data-crumb-id="group:laboratory_panel"]').focus();await page.keyboard.press('Enter');await page.waitForTimeout(520);
 check(await page.locator('.lens-view').getAttribute('data-focus-caption')==='group:laboratory_panel','Chips support keyboard navigation');
 for(const size of [{width:1000,height:900},{width:390,height:844}]){
  await page.setViewportSize(size);await enter(hb);
  const geometry=()=>page.locator('.lens-boundary').evaluate(el=>[el.getAttribute('cx'),el.getAttribute('cy'),el.getAttribute('r')]);
  const before=await geometry();await page.getByRole('button',{name:'Дані',exact:true}).click();await page.waitForTimeout(100);
  check(JSON.stringify(before)===JSON.stringify(await geometry()),'Chips and reader do not resize the lens: '+size.width);
  const visible=await page.locator('.breadcrumb-chips').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('[aria-current]').getBoundingClientRect();return b.right<=a.right+1&&b.left>=a.left-1;});
  check(visible,'Current chip remains in view: '+size.width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow: '+size.width);
  if(size.width===390){await page.getByRole('button',{name:'Закрити запис'}).click();await page.screenshot({path:'output/playwright/chips-mobile.png'});}
 }
 return {status:'PASS',checks,minContrast:Math.min(...contrasts.map(c=>c.ratio)),contrasts};
}
