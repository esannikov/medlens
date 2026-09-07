import type {LensModel, Scope} from '../focus/model.ts';
export type ViewState = {version:1; graph:string; selected:string; focus:string; pinned:string|null; scope:Scope; baseline:string|null; mode:'2d'|'table'; textScale:number; normalized:boolean};
const validDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function validateView(value:unknown,lm:LensModel):ViewState|null {
  if(!value||typeof value!=='object')return null;
  const v=value as ViewState;
  const focus=v.focus||v.selected;
  if(!lm.nodes.has(focus))return null;
  if(v.version!==1||v.graph!==lm.data.graph_hash||!lm.nodes.has(v.selected)||!(v.pinned===null||lm.nodes.has(v.pinned))||!v.scope)return null;
  if(!(v.scope.cutoff===null||validDay(v.scope.cutoff))||!(v.baseline===null||validDay(v.baseline))||typeof v.scope.undated!=='boolean'||!(v.scope.group===null||lm.groups.includes(v.scope.group)))return null;
  if(!['2d','table'].includes(v.mode)||![1,1.15,1.3].includes(v.textScale)||typeof v.normalized!=='boolean')return null;
  return {version:1,graph:v.graph,selected:v.selected,focus,pinned:v.pinned,scope:{cutoff:v.scope.cutoff,undated:v.scope.undated,group:v.scope.group},baseline:v.baseline,mode:v.mode,textScale:v.textScale,normalized:v.normalized};
}
export function viewFromURL(url:string,lm:LensModel):ViewState|null {
  const p=new URL(url).searchParams;if(!p.has('at'))return null;
  return validateView({version:1,graph:p.get('revision'),selected:p.get('at'),focus:p.get('focus')||p.get('at'),pinned:p.get('pin'),scope:{cutoff:p.get('date'),undated:p.get('undated')!=='0',group:p.get('group')},baseline:p.get('baseline'),mode:p.get('lens')==='table'?'table':'2d',textScale:Number(p.get('text')||1),normalized:p.get('units')==='canonical'},lm);
}
export function writeViewURL(url:string,state:ViewState):string {
  const u=new URL(url);const values:Record<string,string|null>={lens:state.mode,revision:state.graph,at:state.selected,focus:state.focus===state.selected?null:state.focus,pin:state.pinned,date:state.scope.cutoff,group:state.scope.group,undated:state.scope.undated?null:'0',baseline:state.baseline,text:state.textScale===1?null:String(state.textScale),units:state.normalized?'canonical':null};
  for(const [key,value] of Object.entries(values)){if(value===null)u.searchParams.delete(key);else u.searchParams.set(key,value);}
  // No clinical text, source literals or search queries are persisted in URLs.
  u.searchParams.delete('q');return u.href;
}
export type Bookmark={savedAt:string;view:ViewState};
export function parseBookmarks(raw:string|null,lm:LensModel):Bookmark[]{
  try{const parsed=JSON.parse(raw||'[]');if(!Array.isArray(parsed))return[];return parsed.slice(0,20).flatMap(b=>{const view=validateView(b?.view,lm);return view&&typeof b.savedAt==='string'?[{savedAt:b.savedAt,view}]:[];});}catch{return[];}
}
