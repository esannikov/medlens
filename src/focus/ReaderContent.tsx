import {value} from '../model.ts';
import {unitDisplay} from '../features/clinical.ts';
import type {LensModel,LensNode,Scope} from './model.ts';
import {readerContent} from './readerData.ts';

export function ResultContents({lm,node,scope,normalized,onSelect}:{lm:LensModel;node:LensNode;scope:Scope;normalized:boolean;onSelect:(id:string)=>void}){
  const content=readerContent(lm,node,scope);
  return <div className="reader-results">
    {content.groups.map(group=><section key={group.id} aria-label={group.title}>
      <h3>{group.title}<small>{group.results.length}</small></h3>
      {group.results.map(n=><button key={n.id} className={`reader-result ${n.kind}`} data-reader-result={n.id} data-select-object={n.id} onClick={()=>onSelect(n.id)}>
        <span>{n.title}</span>
        {n.kind==='observation'&&<strong>{value(n.object!)} <small>{n.object!.payload.source_unit?.trim()?unitDisplay(n.object!,normalized):'одиницю не зазначено'}</small></strong>}
      </button>)}
    </section>)}
    {content.hidden>0&&<p className="help">Ще {content.hidden} результатів поза відбором.</p>}
    {!content.results.length&&!content.hidden&&<p className="help">Результатів у цьому записі немає.</p>}
  </div>;
}

export function SourceDisclosure({lm,node,scope,onSource}:{lm:LensModel;node:LensNode;scope:Scope;onSource:(id:string)=>void}){
  const {sources}=readerContent(lm,node,scope);
  if(!sources.length)return null;
  return <details className="reader-sources">
    <summary>Звірити з джерелом <small>{sources.length} фрагм.</small></summary>
    <div className="source-links">
      {sources.map(s=><button key={s.id} data-source-id={s.id} onClick={()=>onSource(s.id)}>
        <span><strong>{s.title}</strong>{s.title!==s.literal&&<span className="source-excerpt">{s.literal}</span>}<small>стор. {s.derived_pdf_page??'не зазначена'} · фрагмент {s.source_order}</small></span>
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m7 4 6 6-6 6"/></svg>
      </button>)}
    </div>
  </details>;
}
