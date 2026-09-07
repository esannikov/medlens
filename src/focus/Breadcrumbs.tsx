import {useLayoutEffect,useRef,type CSSProperties} from 'react';
import type {LensNode} from './model.ts';

export function Breadcrumbs({path,onSelect,onBack,canBack}:{path:readonly LensNode[];onSelect:(id:string)=>void;onBack:()=>void;canBack:boolean}){
  const scroller=useRef<HTMLOListElement>(null);
  const current=path.at(-1)?.id;
  useLayoutEffect(()=>{
    const el=scroller.current;
    if(el)el.scrollLeft=el.scrollWidth;
  },[current]);
  useLayoutEffect(()=>{
    const el=scroller.current;
    if(!el)return;
    const observer=new ResizeObserver(()=>{el.scrollLeft=el.scrollWidth;});
    observer.observe(el);
    return ()=>observer.disconnect();
  },[]);
  return <nav className="focus-breadcrumb" aria-label="Шлях до поточного фокусу">
    <button type="button" aria-label="Назад до попереднього фокуса" disabled={!canBack} onClick={onBack}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 12H4m6-6-6 6 6 6"/></svg>
    </button>
    <ol className="breadcrumb-chips" ref={scroller}>
      {path.map((n,index)=><li key={n.id} style={{'--crumb-color':n.color} as CSSProperties}>
        {index>0&&<span className="crumb-separator" aria-hidden="true">/</span>}
        <button type="button" className="crumb-chip" data-crumb-id={n.id} data-crumb-color={n.color}
          aria-current={n.id===current?'location':undefined} title={n.title} onClick={()=>onSelect(n.id)}>
          <span>{n.title}</span>
        </button>
      </li>)}
    </ol>
  </nav>;
}
