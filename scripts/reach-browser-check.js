// Reproduce the user's gesture: drag the PARENT to bring a CHILD into focus.
// Reading-zone continuity, not percentage shortening, is the acceptance gate.
async(page)=>{
 const base=await page.evaluate(()=>new URL('./',location.href).href);
 const data=await page.evaluate(async()=>fetch('data/case024.json').then(r=>r.json()));
 const events=data.objects.filter(o=>o.object_type==='clinical_event');
 const cbc=events.find(o=>o.payload.title_uk==='Загальний аналіз крові').object_id;
 const electro=events.find(o=>o.payload.title_uk==='Електрофорез та імунофіксація крові та сечі').object_id;
 const pairs=[['group:laboratory_panel',cbc],['group:laboratory_panel',electro],['group:imaging_study',null],['group:pathology_procedure',null],['group:temporal',null],['SP-SM-B63E3EEA4109AC5E',null],['EV-ST-2CC125988DECAA58',null]];
 const checks=[],gestures=[],errors=[];const listen=e=>errors.push(e.message);page.on('pageerror',listen);
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const point=async(id)=>page.locator(`[data-lens-node="${id}"]`).evaluate(el=>{
  const s=el.ownerSVGElement,b=s.getBoundingClientRect(),m=el.transform.baseVal.consolidate().matrix,c=s.querySelector('.lens-boundary');
  return {x:b.x+m.e,y:b.y+m.f,cx:b.x+Number(c.getAttribute('cx')),cy:b.y+Number(c.getAttribute('cy')),r:Number(c.getAttribute('r'))};
 });
 try{
  await page.setViewportSize({width:1920,height:1200});
  for(const [parent,requested] of pairs){
   await page.goto(base+'?at='+encodeURIComponent(parent)+'&revision='+data.graph_hash+'&spacing=original');
   await page.locator('.lens-boundary').waitFor();await page.waitForTimeout(300);
   const child=requested||await page.locator(`[data-parent="${parent}"]`).first().getAttribute('data-lens-node');
   const original=await point(child);
   // In the original isometric disk this is also the parent's final distance
   // when the child reaches zero: a lower bound on the old drag's travel.
   const oldLowerBound=Math.hypot(original.x-original.cx,original.y-original.cy)/original.r;
   await page.goto(base+'?at='+encodeURIComponent(parent)+'&revision='+data.graph_hash);
   await page.locator('.lens-boundary').waitFor();await page.waitForTimeout(400);await page.mouse.move(10,180);
   const start=await point(parent),aim=await point(child);
   const aimDistance=Math.hypot(aim.x-aim.cx,aim.y-aim.cy);
   const dx=(aim.cx-aim.x)/aimDistance,dy=(aim.cy-aim.y)/aimDistance;
   let x=start.x,y=start.y,steps=0,travel=0,worst=0,crossTrack=0;
   await page.mouse.move(x,y);await page.mouse.down();
   for(;steps<60;steps++){
    const a=await point(parent),b=await point(child),distance=Math.hypot(b.x-b.cx,b.y-b.cy);
    worst=Math.max(worst,Math.min(Math.hypot(a.x-a.cx,a.y-a.cy),distance)/a.r);
    crossTrack=Math.max(crossTrack,Math.abs((b.x-b.cx)*dy-(b.y-b.cy)*dx));
    if(distance<start.r*.035)break;
    const step=Math.min(start.r*.025,distance*.12);
    // One straight gesture, without steering around the camera's old orbit.
    x+=dx*step;y+=dy*step;travel+=step;
    await page.mouse.move(x,y);await page.waitForTimeout(35);
    if(parent==='group:laboratory_panel'&&steps===10)await page.screenshot({path:'output/playwright/reach-'+(child===cbc?'cbc':'electrophoresis')+'-during.png'});
   }
   await page.waitForTimeout(220);await page.mouse.up();
   const end=await point(child),distance=Math.hypot(end.x-end.cx,end.y-end.cy)/end.r;
   check(distance<.035,'Child reaches centre by dragging its parent: '+child);
   check(worst<=.50,'No empty-focus gap during the gesture: '+child);
   check(crossTrack<1,'Child does not orbit away from the straight drag: '+child);
   check(await page.locator('.lens-view').getAttribute('data-focus-caption')===child,'Reader focus arrives at the requested child: '+child);
   check(await page.locator(`[data-label-for="${child}"]`).count()===1,'Requested caption is visible: '+child);
   check(travel/start.r<oldLowerBound,'Actual parent drag is shorter than the original minimum: '+child+' / '+(travel/start.r).toFixed(3));
   gestures.push({parent,child,steps,travelRadius:travel/start.r,oldLowerBound,worstNearestRadius:worst,crossTrack,finalDistance:distance});
  }
  check(errors.length===0,'No page errors');
  return {status:'PASS',checks,gestures,errors};
 }finally{page.off('pageerror',listen);}
}
