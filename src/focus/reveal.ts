import type {LensModel, Scope} from './model.ts';
import type {Label, Point} from './layout.ts';

export const FOCUS_DWELL_MS=150;
export const FOCUS_MARGIN=.06;

/** A different nearest dot is not yet a reading decision. */
export function shouldAdoptFocus(current:string,candidate:string,points:readonly Point[]){
  if(current===candidate)return false;
  const a=points.find(p=>p.id===current),b=points.find(p=>p.id===candidate);
  if(!b?.active)return false;
  if(!a?.active)return true;
  const oldDistance=Math.hypot(...a.p),nextDistance=Math.hypot(...b.p);
  return nextDistance+FOCUS_MARGIN<oldDistance || oldDistance>.64&&nextDistance<.48;
}

/** Select a consecutive angular sector, not whichever short strings fit first. */
export function coherentSector(ids:readonly string[],parentId:string,points:readonly Point[],limit:number,focusId:string){
  if(ids.length<=limit)return [...ids];
  const map=new Map(points.map(p=>[p.id,p])),parent=map.get(parentId)!;
  const sorted=[...ids].sort((a,b)=>{
    const x=map.get(a)!,y=map.get(b)!;
    return Math.atan2(x.y-parent.y,x.x-parent.x)-Math.atan2(y.y-parent.y,y.x-parent.x);
  });
  let best:string[]=[],score=Infinity;
  for(let start=0;start<sorted.length;start++){
    const window=Array.from({length:limit},(_,i)=>sorted[(start+i)%sorted.length]);
    if(ids.includes(focusId)&&!window.includes(focusId))continue;
    const cost=window.reduce((sum,id)=>sum+Math.hypot(...map.get(id)!.p),0);
    if(cost<score-1e-9){score=cost;best=window;}
  }
  return best;
}

export function buildRevealPlan(lm:LensModel,focusId:string,scope:Scope,points:readonly Point[],width:number,hoverId:string|null=null){
  const focus=lm.nodes.get(focusId)!;
  const owner=focus.children.length?focus:lm.nodes.get(focus.parent||lm.root)!;
  const pathIds=new Set(lm.ancestors(focusId).map(n=>n.id));
  const branchIds=new Set([owner.id,...(owner.kind==='patient'||owner.kind==='group'?owner.children:owner.descendants)]
    .filter(id=>lm.contextual(id,scope)));
  const allowedIds=new Set([...pathIds,...branchIds]);
  const parentGroups=new Map<string,string[]>();
  for(const id of branchIds){
    const n=lm.nodes.get(id)!;
    if(n.parent&&['observation','finding','clinical_event','temporal_relation'].includes(n.kind)){
      const list=parentGroups.get(n.parent)||[];list.push(id);parentGroups.set(n.parent,list);
    }
  }
  const sectors=new Map<string,string[]>();
  for(const [parent,ids] of parentGroups){
    const selected=coherentSector(ids,parent,points,width<600?6:14,focusId);
    sectors.set(parent,selected);
    ids.filter(id=>!selected.includes(id)).forEach(id=>allowedIds.delete(id));
  }
  // Hover is an explicit single-record preview with its parent path, never a
  // permission to expand the entire neighbouring department.
  const previewIds=new Set<string>();
  if(hoverId&&lm.eligible(hoverId,scope))for(const n of lm.ancestors(hoverId)){
    allowedIds.add(n.id);previewIds.add(n.id);
  }
  return {focusId,ownerId:owner.id,ownerKind:owner.kind,pathIds,branchIds,allowedIds,previewIds,sectors};
}
export type RevealPlan=ReturnType<typeof buildRevealPlan>;

/** Keep the contextual tree honest after text placement. The selected label
 * may use the persistent breadcrumb as its fallback parent context. */
export function connectedLabels(lm:LensModel,plan:RevealPlan,labels:Label[],attentionId:string|null){
  const present=new Set(labels.map(b=>b.id));
  const valid=(id:string,seen=new Set<string>()):boolean=>{
    if(id===plan.focusId||id===attentionId||plan.pathIds.has(id))return true;
    const parent=lm.nodes.get(id)?.parent;
    if(!parent||!plan.branchIds.has(parent))return true;
    if(seen.has(id)||!present.has(parent))return false;
    seen.add(id);return valid(parent,seen);
  };
  return labels.filter(b=>valid(b.id));
}
