import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLensModel,compactPoint,expandPoint,lensCompression,focusPoint,focusForAnchor,norm,geodesic,panCamera,rotateVec} from './src/focus/model.ts';
import {lensGeometry} from './src/focus/layout.ts';
const data=JSON.parse(readFileSync('public/data/case024.json','utf8')),frozen=JSON.stringify(data);
const lm=createLensModel(data),original=createLensModel(data,'original'),scope={cutoff:null,undated:true,group:null};
assert.deepEqual(lm.order.map(n=>n.p2),original.order.map(n=>n.p2),'No new embedding, reordered branches or mutated world coordinates');
assert.equal(lensCompression(167),0);assert.equal(lensCompression(400),1);
let inverses=0,anchors=0,edges=0,long=0,cleanArcs=0,reductions=[];
for(const strength of [0,.25,.5,1]){
 let last=-1;
 for(let i=0;i<1000;i++){
  const r=i/1000,p=[r,0],mapped=compactPoint(p,'compact',strength);
  assert(mapped[0]>last);last=mapped[0];assert(mapped[0]<=r+1e-12);
  if(r<=.2)assert.deepEqual(mapped,p,'The centre is unchanged');
  assert(norm(expandPoint(mapped,'compact',strength).map((v,j)=>v-p[j]))<1e-9);inverses++;
 }
 for(const n of lm.order)for(const target of [[.1,.2],[.65,0],[-.8,.1],[0,-.94]]){
  const camera=focusForAnchor(n.p2,expandPoint(target,'compact',strength));
  const actual=compactPoint(focusPoint(n.p2,camera),'compact',strength);
  assert(norm(actual.map((v,j)=>v-target[j]))<1e-6,'Pointer inverse includes the rendered compaction');anchors++;
 }
}
// The former percentage-only gate missed a gap between two reading zones.
// Replay every parent-to-child route, not a few clinical-name fixtures.
const previousRadius=r=>{
 const start=Math.atanh(.5),delta=Math.atanh(r)-start;
 return delta<=0?r:Math.tanh(start+.35*delta+.65*Math.tanh(6*delta)/6);
};
let transitions=0,previousGaps=0,worstNearest=0;
for(const edge of lm.displayEdges){
 const parent=lm.nodes.get(edge.source),child=lm.nodes.get(edge.target);
 for(const camera of geodesic(parent.p2,child.p2,20)){
  const a=focusPoint(parent.p2,camera),b=focusPoint(child.p2,camera);
  const nearest=Math.min(norm(compactPoint(a)),norm(compactPoint(b)));
  assert(nearest<=.48,'Parent and child reading zones must overlap during a transition');
  if(Math.min(previousRadius(norm(a)),previousRadius(norm(b)))>.48)previousGaps++;
  worstNearest=Math.max(worstNearest,nearest);transitions++;
 }
}
assert(previousGaps>0,'The regression test must reproduce the formerly unreachable phases');
for(const r of [.98,.99,.995,.999])assert.deepEqual(compactPoint([r,0]),[r,0],'Keep the distant outer context at its original radius');
let transported=0,parentDrags=0,oldOrbitFailures=0,maxParentTravel=0;
const cameraPoint=(p,camera)=>rotateVec(focusPoint(p,camera.focus),camera.rotation);
for(const node of lm.order)for(const rotation of [0,.7,-1.2]){
 const from=rotateVec(focusPoint(lm.nodes.get(lm.root).p2,node.p2),rotation),to=[.25,-.3];
 const camera=panCamera(node.p2,rotation,from,to);
 for(const world of [node.p2,lm.nodes.get(lm.root).p2,lm.order.at(-1).p2]){
  const expected=focusPoint(focusPoint(rotateVec(focusPoint(world,node.p2),rotation),from),to.map(v=>-v));
  assert(norm(cameraPoint(world,camera).map((v,j)=>v-expected[j]))<1e-6,'Keep the full camera transform, including its rotation');transported++;
 }
}
for(const edge of lm.displayEdges){
 const parent=lm.nodes.get(edge.source),child=lm.nodes.get(edge.target);
 const drive=full=>{
  let camera={focus:parent.p2,rotation:0},q=[0,0],travel=0,distance=Infinity;
  for(let i=0;i<80;i++){
   const v=compactPoint(cameraPoint(child.p2,camera));distance=norm(v);
   if(distance<.035)break;
   const step=Math.min(.025,distance*.12);
   q=q.map((x,j)=>x-v[j]/distance*step);travel+=step;
   camera=full?panCamera(parent.p2,0,[0,0],expandPoint(q)):{focus:focusForAnchor(parent.p2,expandPoint(q)),rotation:0};
  }
  return {distance,travel};
 };
 const corrected=drive(true),old=drive(false);
 assert(corrected.distance<.035,'Every child is reachable by dragging its parent');
 assert(corrected.travel<norm(focusPoint(child.p2,parent.p2)),'Less travel than the old geometry requires even in a straight line');
 if(old.distance>=.035)oldOrbitFailures++;
 maxParentTravel=Math.max(maxParentTravel,corrected.travel);parentDrags++;
}
assert(oldOrbitFailures>0,'Reproduce orbiting with the former focus-only drag');
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
  const turns=new Set();
  for(let j=1;j<after.points.length-1;j++){
   const a=after.points[j-1],b=after.points[j],c=after.points[j+1];
   const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
   if(Math.abs(cross)>1e-4)turns.add(Math.sign(cross));
  }
  assert(turns.size<=1,'A connection must be one clean arc, never an S-bend');cleanArcs++;
  const length=path=>path.points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-path.points[i][0],p[1]-path.points[i][1]),0);
  const oldLength=length(before),newLength=length(after);
  // Outer context is intentionally retained on the rim. Its background spokes
  // need not shrink; the navigation links incident to the reading focus must.
  if(oldLength>a.radius*.75&&(after.source===node.id||after.target===node.id)){
   assert(newLength<oldLength,'Long focus connections are shortened');reductions.push(1-newLength/oldLength);long++;
  }
  edges++;
 }
}
assert.equal(JSON.stringify(data),frozen);
console.log(JSON.stringify({status:'PASS',inverses,anchors,edges,long,cleanArcs,transitions,previousGaps,worstNearest,transported,parentDrags,oldOrbitFailures,maxParentTravel,meanLongReduction:reductions.reduce((a,b)=>a+b)/long,maxLongReduction:Math.max(...reductions),scope:'Clean single arcs, reading-zone continuity, full camera transport without orbiting, exact endpoints and inverse, unchanged data'}));
