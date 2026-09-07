import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLensModel,focusPoint,focusForAnchor,norm} from './src/focus/model.ts';
import {readerContent} from './src/focus/readerData.ts';
const data=JSON.parse(readFileSync('public/data/case024.json','utf8')),frozen=JSON.stringify(data);
const lm=createLensModel(data),scope={cutoff:null,undated:true,group:null};
let anchors=0;
for(const node of lm.order)for(let i=0;i<24;i++)for(const r of [0,.3,.8,.98]){
  const target=[r*Math.cos(i*Math.PI/12),r*Math.sin(i*Math.PI/12)];
  const camera=focusForAnchor(node.p2,target),actual=focusPoint(node.p2,camera);
  assert(norm(camera)<1);assert(actual.every(Number.isFinite));
  assert(norm(actual.map((v,j)=>v-target[j]))<1e-7,'Grabbed point follows cursor');anchors++;
}
const cbc=readerContent(lm,lm.nodes.get('EV-ST-EC9BE96D4DEE8C1F'),scope);
assert.equal(cbc.results.length,12);assert.equal(cbc.sources.length,11);
assert.equal(cbc.groups.length,1);assert.equal(cbc.groups[0].title,'кров');
assert.equal(cbc.results.filter(n=>n.title==='Еритроцити').length,2,'Do not merge duplicate results');
assert.equal(cbc.sources.find(s=>s.id==='SR-0845FEA2BE58-P0016').title,'Гемоглобін');
const path=readerContent(lm,lm.nodes.get('EV-ST-2CC125988DECAA58'),scope);
assert.equal(path.results.length,4);assert(path.results.every(n=>n.kind==='finding'));
assert.equal(path.sources.length,3);assert(path.results.some(n=>n.title==='Імуногістохімічне дослідження: недоцільно.'));
let collections=0;
for(const n of lm.order.filter(n=>['clinical_event','specimen'].includes(n.kind))){
  for(const cutoff of [null,...lm.days]){
    const s={...scope,cutoff},content=readerContent(lm,n,s);
    assert(content.results.every(r=>n.descendants.includes(r.id)&&lm.eligible(r.id,s)));
    assert.equal(new Set(content.results.map(r=>r.id)).size,content.results.length);
    assert.equal(content.groups.flatMap(g=>g.results).length,content.results.length);
    for(const source of content.sources)assert.equal(source.literal,data.sources.find(s=>s.id===source.id).literal);
    if(!lm.eligible(n.id,s))assert.equal(content.sources.length,0);
    collections++;
  }
}
assert.equal(JSON.stringify(data),frozen);
console.log(JSON.stringify({status:'PASS',anchors,collections,scope:'Exact pointer anchoring; grouped results; distinct duplicate records; source literals and scoped visibility; immutable data'}));
