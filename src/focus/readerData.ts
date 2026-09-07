import {label} from '../model.ts';
import type {LensModel,LensNode,Scope} from './model.ts';

/** Read the existing objects; never merge results which share a source. */
export function readerContent(lm:LensModel,node:LensNode,scope:Scope){
  const all=node.descendants.map(id=>lm.nodes.get(id)!).filter(n=>n.kind==='observation'||n.kind==='finding')
    .sort((a,b)=>(lm.m.sourceFor(a.object!)[0]?.source_order??Infinity)-(lm.m.sourceFor(b.object!)[0]?.source_order??Infinity)||a.id.localeCompare(b.id));
  const results=all.filter(n=>lm.eligible(n.id,scope));
  const groups=new Map<string,{id:string;title:string;results:LensNode[]}>();
  for(const n of results){
    const specimen=lm.m.specimenFor(n.object!);
    const id=specimen?.object_id||'unassigned';
    if(!groups.has(id))groups.set(id,{id,title:specimen?label(specimen):'Описи та показники',results:[]});
    groups.get(id)!.results.push(n);
  }
  const visible=new Set(results.flatMap(n=>lm.m.sourceFor(n.object!).map(s=>s.id)));
  const hidden=new Set(all.filter(n=>!lm.eligible(n.id,scope)).flatMap(n=>lm.m.sourceFor(n.object!).map(s=>s.id)));
  const sources=node.object&&lm.eligible(node.id,scope)?lm.m.sourceFor(node.object).filter(s=>!hidden.has(s.id)||visible.has(s.id)):[];
  return {groups:[...groups.values()],results,hidden:all.length-results.length,sources:sources.map(s=>{
    const owners=[node,...results].filter(n=>n.kind==='observation'&&lm.m.sourceFor(n.object!).some(ref=>ref.id===s.id));
    return {...s,title:[...new Set(owners.map(n=>n.title))].join(' / ')||s.literal};
  })};
}
