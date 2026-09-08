// System-wide contraction and direct manipulation. No clinical-name exceptions.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const data=await page.evaluate(async()=>fetch('data/case024.json').then(r=>r.json()));
 const groups=[...new Set(data.objects.filter(o=>o.object_type==='clinical_event').map(o=>'group:'+o.payload.event_kind))];
 if(data.objects.some(o=>o.object_type==='temporal_relation'))groups.push('group:temporal');
 const targets=[data.objects.find(o=>o.object_type==='patient').object_id,...groups,...data.objects.filter(o=>['clinical_event','specimen'].includes(o.object_type)).map(o=>o.object_id)];
 const checks=[],comparisons=[],errors=[];const listen=e=>errors.push(e.message);page.on('pageerror',listen);
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const enter=async(id,spacing='compact')=>{await page.goto(base+'?at='+encodeURIComponent(id)+'&revision='+data.graph_hash+'&spacing='+spacing);await page.locator('.lens-boundary').waitFor();await page.waitForTimeout(220);await page.mouse.move(10,200);};
 const lengths=()=>page.locator('.lens-svg').evaluate(el=>{
  const circle=el.querySelector('.lens-boundary'),radius=Number(circle.getAttribute('r')),cx=Number(circle.getAttribute('cx')),cy=Number(circle.getAttribute('cy'));
  return {radius,points:[...el.querySelectorAll('[data-lens-node]')].map(n=>{const p=n.transform.baseVal.consolidate().matrix;return {id:n.getAttribute('data-lens-node'),parent:n.getAttribute('data-parent'),radius:Math.hypot(p.e-cx,p.f-cy)/radius};}),paths:[...el.querySelectorAll('[data-graph-edge]')].map(p=>({id:p.getAttribute('data-graph-edge'),length:p.getTotalLength()}))};
 });
 try{
  await page.setViewportSize({width:1440,height:1000});
  for(const id of targets){
   await enter(id,'original');const before=await lengths();
   await enter(id);const after=await lengths(),byId=new Map(after.paths.map(p=>[p.id,p.length]));
   check(await page.locator('.lens-view').getAttribute('data-focus-caption')===id,'Same focus identity: '+id);
   check(await page.locator(`[data-label-for="${id}"]`).count()===1,'Focused caption remains readable: '+id);
   check(before.radius===after.radius&&before.paths.length===after.paths.length,'Same disk and connections: '+id);
   const afterPoints=new Map(after.points.map(p=>[p.id,p.radius]));
   check(before.points.filter(p=>p.radius>=.98).every(p=>Math.abs(afterPoints.get(p.id)-p.radius)<1e-6),'Distant nodes retain their outer-ring positions: '+id);
   const parents=new Map(before.points.map(p=>[p.id,p.parent]));
   const long=before.paths.filter(p=>p.length>before.radius*.75&&(p.id===id||parents.get(p.id)===id));
   check(long.every(p=>byId.get(p.id)<p.length-.01),'Long focus connections contract; outer context stays on the rim: '+id);
   comparisons.push({id,long:long.length,reductions:long.map(p=>1-byId.get(p.id)/p.length)});
  }
  // Same camera movement: the parent stays inside the unchanged optical core.
  for(const spacing of ['original','compact']){
   await enter('group:laboratory_panel',spacing);
   const a=await page.locator('[data-lens-node="group:laboratory_panel"]').evaluate(el=>{const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix;return {x:b.x+m.e,y:b.y+m.f,r:Number(s.querySelector('.lens-boundary').getAttribute('r'))};});
   await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+a.r*.28,a.y,{steps:14});await page.mouse.up();await page.waitForTimeout(230);
   check(await page.locator('.lens-view').getAttribute('data-focus-caption')==='group:laboratory_panel','Lab stays in the optical core during matched pan: '+spacing);
   await page.screenshot({path:'output/playwright/spacing-'+spacing+'.png'});
  }
  // Cover each hierarchy level and category, including a dense specimen.
  const dragTargets=[...groups,...data.objects.filter(o=>o.object_type==='clinical_event').filter((o,i,a)=>a.findIndex(p=>p.payload.event_kind===o.payload.event_kind)===i).map(o=>o.object_id),...data.objects.filter(o=>o.object_type==='specimen').slice(0,3).map(o=>o.object_id)];
  for(const id of dragTargets){
   await enter(id);
   const a=await page.locator(`[data-parent="${id}"]`).first().evaluate(el=>{const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');return {id:el.getAttribute('data-lens-node'),x:b.x+m.e,y:b.y+m.f,cx:b.x+Number(c.getAttribute('cx')),cy:b.y+Number(c.getAttribute('cy'))};});
   await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.cx,a.cy,{steps:14});await page.waitForTimeout(230);await page.mouse.up();
   check(await page.locator('.lens-view').getAttribute('data-focus-caption')===a.id,'One-gesture child navigation: '+id);
  }
  await page.setViewportSize({width:390,height:844});await enter(groups[0],'original');const smallBefore=await lengths();await enter(groups[0]);
  const smallAfter=await lengths();check(smallBefore.paths.every((p,i)=>Math.abs(p.length-smallAfter.paths[i].length)<.01),'Already-short mobile connections are not crowded further');
  await page.getByRole('button',{name:'Дані',exact:true}).click();check((await lengths()).radius===smallAfter.radius,'Reader does not resize the lens');
  await page.screenshot({path:'output/playwright/spacing-mobile.png'});
  check(errors.length===0,'No page errors');
  const reductions=comparisons.flatMap(c=>c.reductions);
  return {status:'PASS',checks,containers:targets.length,longConnections:reductions.length,meanReduction:reductions.reduce((a,b)=>a+b,0)/reductions.length,maxReduction:Math.max(...reductions),errors};
 }finally{page.off('pageerror',listen);}
}
