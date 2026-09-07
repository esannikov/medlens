import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLensModel,compactPoint,expandPoint,lensCompression,focusPoint,focusForAnchor,norm} from './src/focus/model.ts';
import {lensGeometry} from './src/focus/layout.ts';
const data=JSON.parse(readFileSync('public/data/case024.json','utf8')),frozen=JSON.stringify(data);
const lm=createLensModel(data),original=createLensModel(data,'original'),scope={cutoff:null,undated:true,group:null};
assert.deepEqual(lm.order.map(n=>n.p2),original.order.map(n=>n.p2),'No new embedding, reordered branches or mutated world coordinates');
assert.equal(lensCompression(167),0);assert.equal(lensCompression(400),1);
let inverses=0,anchors=0,edges=0,long=0,reductions=[];
for(const strength of [0,.25,.5,1]){
 let last=-1;
 for(let i=0;i<1000;i++){
  const r=i/1000,p=[r,0],mapped=compactPoint(p,'compact',strength);
  assert(mapped[0]>last);last=mapped[0];assert(mapped[0]<=r+1e-12);
  if(r<=.5)assert.deepEqual(mapped,p,'The reading zone is unchanged');
  assert(norm(expandPoint(mapped,'compact',strength).map((v,j)=>v-p[j]))<1e-9);inverses++;
 }
 for(const n of lm.order)for(const target of [[.1,.2],[.65,0],[-.8,.1],[0,-.94]]){
  const camera=focusForAnchor(n.p2,expandPoint(target,'compact',strength));
  const actual=compactPoint(focusPoint(n.p2,camera),'compact',strength);
  assert(norm(actual.map((v,j)=>v-target[j]))<1e-6,'Pointer inverse includes the rendered compaction');anchors++;
 }
}
for(const node of lm.order){
 const a=lensGeometry(original,node.id,scope,node.p2,1440,1000),b=lensGeometry(lm,node.id,scope,node.p2,1440,1000);
 assert.equal(a.centerId,b.centerId,'Compaction does not redefine reading ownership');
 const points=new Map(b.points.map(p=>[p.id,p]));
 for(let i=0;i<a.paths.length;i++){
  const before=a.paths[i],after=b.paths[i];
  assert.equal(before.source,after.source);assert.equal(before.target,after.target);
  for(const [id,p] of [[after.source,after.points[0]],[after.target,after.points.at(-1)]]){
   const n=points.get(id);assert(Math.hypot(n.x-p[0],n.y-p[1])<1e-5,'Line remains attached to its node');
  }
  const length=path=>path.points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-path.points[i][0],p[1]-path.points[i][1]),0);
  const oldLength=length(before),newLength=length(after);
  if(oldLength>a.radius*.75){assert(newLength<oldLength,'Every long connection is shortened');reductions.push(1-newLength/oldLength);long++;}
  edges++;
 }
}
assert.equal(JSON.stringify(data),frozen);
console.log(JSON.stringify({status:'PASS',inverses,anchors,edges,long,meanLongReduction:reductions.reduce((a,b)=>a+b)/long,maxLongReduction:Math.max(...reductions),scope:'One radial map for all entities, monotone branch order, exact endpoints and pointer inverse, unchanged focus identity/data, screen-aware strength'}));
