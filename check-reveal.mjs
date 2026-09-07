import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLensModel,focusPoint} from './src/focus/model.ts';
import {lensGeometry,placeLabels} from './src/focus/layout.ts';
import {buildRevealPlan,connectedLabels,coherentSector,shouldAdoptFocus,FOCUS_DWELL_MS} from './src/focus/reveal.ts';
const data=JSON.parse(readFileSync(new URL('./public/data/case024.json',import.meta.url),'utf8'));
const frozen=JSON.stringify(data),lm=createLensModel(data),all={cutoff:null,undated:true,group:null};
const measure=(s,f)=>Array.from(s).length*Number(f.match(/([\d.]+)px/)[1])*.5;
const flc=lm.order.find(n=>n.kind==='clinical_event'&&n.title==='Вільні легкі ланцюги крові та сечі');
const ldh=lm.order.find(n=>n.kind==='clinical_event'&&n.title==='ЛДГ і кальцій');
const myelo=lm.nodes.get('EV-ST-FDCDA56787FC7BA5');
assert(flc&&ldh);
let states=0;
for(const [w,h] of [[1440,934],[390,736]])for(const focus of lm.order){
  const g=lensGeometry(lm,focus.id,all,focus.p2,w,h),plan=buildRevealPlan(lm,focus.id,all,g.points,w);
  const owner=lm.nodes.get(plan.ownerId);
  for(const id of plan.allowedIds){
    if(plan.pathIds.has(id))continue;
    const n=lm.nodes.get(id);
    if(['patient','group'].includes(owner.kind))assert.equal(n.parent,owner.id,'Overview only expands one logical level');
    else assert(owner.descendants.includes(id),'Automatic labels stay in the reading subtree');
  }
  const paths=g.paths.map(p=>({...p,local:plan.allowedIds.has(p.source)&&plan.allowedIds.has(p.target),ancestor:plan.pathIds.has(p.source)&&plan.pathIds.has(p.target)}));
  const labels=connectedLabels(lm,plan,placeLabels(lm,focus.id,all,g.points,paths,w,h,measure,new Map(),false,undefined,{centerId:focus.id,allowedIds:plan.allowedIds,pathIds:plan.pathIds,compactPeers:true}),null);
  assert(labels.every(b=>plan.allowedIds.has(b.id)),'Layout cannot fill spare space with unrelated records');
  for(const b of labels){
    const n=lm.nodes.get(b.id);
    if(!plan.pathIds.has(b.id)&&n.parent&&plan.branchIds.has(n.parent))assert(labels.some(x=>x.id===n.parent),'No orphan child captions');
  }
  assert(plan.pathIds.has(lm.root));
  states++;
}
const g=lensGeometry(lm,flc.id,all,flc.p2,1440,934),plan=buildRevealPlan(lm,flc.id,all,g.points,1440);
assert(!plan.allowedIds.has(ldh.id));
assert(!plan.allowedIds.has(myelo.id));
assert(lm.m.resultsFor(flc.id).every(n=>plan.allowedIds.has(n.object_id)),'All seven light-chain results belong to the allowed cohort');
assert.equal(lm.m.resultsFor(flc.id).length,7);
const preview=buildRevealPlan(lm,flc.id,all,g.points,1440,ldh.id);
assert(preview.allowedIds.has(ldh.id));
assert(!preview.allowedIds.has(myelo.id),'Hovering LDH does not open the laboratory department');
assert.equal(preview.ownerId,flc.id);
const viz=lm.nodes.get('group:imaging_study');
const position=focusPoint([-.4,.1],viz.p2.map(v=>-v));
const gv=lensGeometry(lm,viz.id,all,position,1440,934);
assert.equal(gv.centerId,viz.id);
const legacy=placeLabels(lm,viz.id,all,gv.points,gv.paths,1440,934,measure);
assert(legacy.some(b=>b.id===myelo.id),'Regression fixture reproduces the old unrelated myelogram caption');
assert(!buildRevealPlan(lm,viz.id,all,gv.points,1440).allowedIds.has(myelo.id));
const root=buildRevealPlan(lm,lm.root,all,lensGeometry(lm,lm.root,all,[0,0],1440,934).points,1440);
assert.deepEqual([...root.allowedIds].sort(),[lm.root,...lm.groups].sort());
const punctate=lm.nodes.get('SP-SM-B63E3EEA4109AC5E'),gp=lensGeometry(lm,punctate.id,all,punctate.p2,1440,934);
const sector=coherentSector(punctate.children,punctate.id,gp.points,14,punctate.children[3]);
assert.equal(sector.length,14);assert(sector.includes(punctate.children[3]));assert.equal(new Set(sector).size,14);
const hiddenScope={...all,cutoff:'2026-04-01',undated:false};
assert(!buildRevealPlan(lm,lm.root,hiddenScope,g.points,1440,flc.id).previewIds.has(flc.id),'Hover respects the date filter');
const point=(id,d,active=true)=>({id,p:[d,0],x:d,y:0,radius:1,active,detail:true});
assert.equal(FOCUS_DWELL_MS,150);
assert(!shouldAdoptFocus('a','b',[point('a',.4),point('b',.37)]),'Ignore a near tie');
assert(shouldAdoptFocus('a','b',[point('a',.4),point('b',.2)]));
assert(!shouldAdoptFocus('a','b',[point('a',.4),point('b',.2,false)]));
assert(!shouldAdoptFocus('a','a',[point('a',.4)]));
assert.equal(JSON.stringify(data),frozen);
console.log(JSON.stringify({status:'PASS',states,lightChainResults:7,legacyIntruderReproduced:true,scope:'hierarchical candidate allowlist, parent closure, coherent sector, hover isolation, date filter and focus hysteresis'}));
