import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLensModel,focusPoint} from './src/focus/model.ts';
import {lensGeometry,placeLabels,graphCaption,overlaps} from './src/focus/layout.ts';
import {compassLayout} from './src/focus/compass.ts';
const data=JSON.parse(readFileSync(new URL('./public/data/case024.json',import.meta.url),'utf8'));
const frozen=JSON.stringify(data),lm=createLensModel(data),all={cutoff:null,undated:true,group:null};
const owner=lm.nodes.get('SP-SM-B63E3EEA4109AC5E');
const measure=(s,font)=>Array.from(s).length*Number(font.match(/([\d.]+)px/)[1])*.5;
let revealChecks=0,bearingChecks=0,activeExclusionChecks=0;
for(const [w,h] of [[1440,934],[1888,1267]]){
  const g=lensGeometry(lm,owner.id,all,owner.p2,w,h);
  const base=placeLabels(lm,owner.id,all,g.points,g.paths,w,h,measure);
  assert(base.filter(b=>owner.children.includes(b.id)).length>=17,'Dense punctate branch has compact readable captions');
  assert(base.filter(b=>owner.children.includes(b.id)).every(b=>b.opacity===1),'Active results never inherit the remote-context fade');
  for(const id of owner.children){
    const labels=placeLabels(lm,owner.id,all,g.points,g.paths,w,h,measure,new Map(),false,undefined,{attentionId:id});
    const revealed=labels.find(b=>b.id===id);
    assert(revealed,`Every punctate result can reveal without changing camera: ${id}`);
    assert.equal(revealed.opacity,1);
    assert.equal(revealed.lines.join(' '),graphCaption(lm,lm.nodes.get(id)).title.replace(/\s+/g,' '));
    assert(labels.every(b=>b.id===id||!overlaps(b,revealed)));
    revealChecks++;
  }
}
for(const [w,h] of [[1440,934],[1888,1267],[390,736]])for(const node of lm.order){
  const g=lensGeometry(lm,node.id,all,node.p2,w,h),c=compassLayout(lm,all,g.points,g.radius,w,h,measure,'monospace');
  assert.equal(c.items.length,4);
  const active=lm.groupFor(node.id);
  const contextualCompass=compassLayout(lm,all,g.points,g.radius,w,h,measure,'monospace',[],new Map(),active);
  assert.equal(contextualCompass.items.length,active?3:4);
  assert(!contextualCompass.items.some(item=>item.id===active),'Active section and descendants never point back to themselves');
  activeExclusionChecks++;
  assert(c.ring>g.radius);
  for(const item of c.items){
    const p=g.points.find(p=>p.id===item.id);
    assert(Number.isFinite(item.angle)&&!item.textPath.includes('NaN'));
    if(Math.hypot(...p.p)>=.08){
      const expected=Math.atan2(p.y-h/2,p.x-w/2);
      assert(Math.abs(Math.atan2(Math.sin(item.bearing-expected),Math.cos(item.bearing-expected)))<1e-10,'Tick retains true projected bearing');
    }
    assert(Math.abs(Math.hypot(item.x-w/2,item.y-h/2)-c.ring)<1e-8);
    bearingChecks++;
  }
}
const scope={...all,group:'group:laboratory_panel'};
const g=lensGeometry(lm,owner.id,scope,owner.p2,1440,934);
assert.deepEqual(compassLayout(lm,scope,g.points,g.radius,1440,934,measure,'monospace').items.map(i=>i.id),[scope.group]);
assert.equal(compassLayout(lm,scope,g.points,g.radius,1440,934,measure,'monospace',[],new Map(),scope.group).items.length,0,'A scope containing only the active section has no outside directions');
const moved=focusPoint([.08,-.04],owner.p2.map(v=>-v));
const a=lensGeometry(lm,owner.id,all,owner.p2,1440,934),b=lensGeometry(lm,owner.id,all,moved,1440,934);
assert.notDeepEqual(compassLayout(lm,all,a.points,a.radius,1440,934,measure,'monospace').items.map(i=>i.bearing),compassLayout(lm,all,b.points,b.radius,1440,934,measure,'monospace').items.map(i=>i.bearing));
assert.equal(JSON.stringify(data),frozen);
console.log(JSON.stringify({status:'PASS',revealChecks,bearingChecks,activeExclusionChecks,scope:'active-branch opacity, all 27 punctate hover reveals, projected cluster bearings, active section exclusion, scope, unchanged data'}));
