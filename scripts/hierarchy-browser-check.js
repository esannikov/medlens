// Run with playwright-cli run-code: inspect actual SVG strokes, not only tokens.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const data=await page.evaluate(async()=>fetch('data/case024.json').then(r=>r.json()));
 const checks=[],errors=[],samples=[];
 const listen=e=>errors.push(e.message);page.on('pageerror',listen);
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const inspect=()=>page.locator('.lens-svg').evaluate(svg=>{
  const parents=new Map([...svg.querySelectorAll('[data-lens-node]')].map(n=>[n.getAttribute('data-lens-node'),n.getAttribute('data-parent')]));
  const depth=id=>{let d=0;const seen=new Set();while(parents.get(id)){if(seen.has(id))throw Error('Cyclic hierarchy');seen.add(id);d++;id=parents.get(id);}return d;};
  return [...svg.querySelectorAll('[data-graph-edge], [data-structural-edge]')].map(p=>({
   id:p.getAttribute('data-graph-edge')||p.getAttribute('data-structural-edge'),
   depth:p.hasAttribute('data-graph-edge')?depth(p.getAttribute('data-graph-edge')):Math.max(depth(p.getAttribute('data-structural-source')),depth(p.getAttribute('data-structural-target'))),
   declared:Number(p.getAttribute('data-edge-depth')),width:parseFloat(getComputedStyle(p).strokeWidth),
  }));
 });
 const verify=async(name)=>{
  const edges=await inspect();
  check(edges.length>=188,'All display connections retained: '+name);
  check(edges.every(e=>e.declared===e.depth&&Math.abs(e.width-Math.max(.55,3.2*.64**(e.depth-1)))<1e-5),'Stroke follows actual tree depth: '+name);
  const levels=[1,2,3,4].map(d=>edges.find(e=>e.depth===d)?.width);
  check(levels.every((w,i)=>Number.isFinite(w)&&(i===0||w<levels[i-1])),'Strictly thinner at each generation: '+name);
  samples.push({name,levels,edges:edges.length});return edges;
 };
 const enter=async(id)=>{
  await page.goto(base+'?at='+encodeURIComponent(id)+'&revision='+data.graph_hash);
  await page.locator('[data-graph-edge]').first().waitFor();await page.waitForTimeout(350);
  await page.mouse.move(10,180);
 };
 try{
  const root=data.objects.find(o=>o.object_type==='patient').object_id;
  const study=data.objects.find(o=>o.object_type==='clinical_event'&&o.payload.title_uk==='Електрофорез білкових фракцій крові та сечі').object_id;
  await page.setViewportSize({width:1680,height:1100});
  for(const id of [root,'group:laboratory_panel','group:imaging_study','group:pathology_procedure','group:temporal',study]){
   await enter(id);await verify(id);
  }
  await page.screenshot({path:'output/playwright/hierarchy-study-desktop.png'});
  const child=page.locator(`[data-parent="${study}"]`).first();
  const id=await child.getAttribute('data-lens-node');
  const pos=await child.evaluate(el=>{const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');return {x:b.x+m.e,y:b.y+m.f,cx:b.x+Number(c.getAttribute('cx')),cy:b.y+Number(c.getAttribute('cy'))};});
  await page.mouse.move(pos.x,pos.y);await page.waitForTimeout(200);await verify('Hovered material');
  await page.mouse.down();await page.mouse.move(pos.cx,pos.cy,{steps:16});await page.waitForTimeout(220);await page.mouse.up();
  check(await page.locator('.lens-view').getAttribute('data-focus-caption')===id,'Material enters focus without changing hierarchy');
  await verify('Material after drag');
  await page.getByRole('button',{name:'Збільшити лінзу',exact:true}).click();await verify('Zoom');
  await page.getByRole('button',{name:'Дані',exact:true}).click();await verify('Reader overlay');
  await page.getByLabel('Інструменти та вигляд',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Структурні зв’язки',exact:true}).check();
  check(await page.locator('[data-structural-edge]').count()>0,'Exact relation layer is shown');
  await verify('Exact relations');
  await page.setViewportSize({width:390,height:844});await enter(study);await verify('Mobile');
  await page.screenshot({path:'output/playwright/hierarchy-study-mobile.png'});
  check(errors.length===0,'No browser errors');
  return {status:'PASS',checks,samples,errors};
 }finally{page.off('pageerror',listen);}
}
