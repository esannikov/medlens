import {useState} from 'react';
import type {LensModel} from '../focus/model.ts';
import {parseBookmarks,type Bookmark,type ViewState} from './state.ts';

export function Places({lm,current,onRestore,history,onSelect}:{lm:LensModel;current:ViewState;onRestore:(s:ViewState)=>void;history:string[];onSelect:(id:string)=>void}){
  const key=`medlens-places:${lm.data.graph_hash}`;
  const [places,setPlaces]=useState<Bookmark[]>(()=>{try{return parseBookmarks(localStorage.getItem(key),lm);}catch{return[];}});
  const [notice,setNotice]=useState('');
  function persist(next:Bookmark[]){try{localStorage.setItem(key,JSON.stringify(next));setPlaces(next);setNotice('Збережено тільки у цьому браузері.');}catch{setNotice('Браузер не дозволив збереження. Можна завантажити маршрут у файл.');}}
  function download(){const blob=new Blob([JSON.stringify({schema:'medlens.route/1',graph:lm.data.graph_hash,places},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='medlens-route.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <details className="places-control"><summary>Місця</summary><div className="places-panel">
    <h3>Маршрут огляду</h3><p>Закладки зберігають фокус, дати й ревізію. Відкриття запису не означає його підтвердження.</p>
    <button onClick={()=>persist([{savedAt:new Date().toISOString(),view:current},...places].slice(0,20))}>Зберегти це місце</button>
    {places.map((p,i)=><div className="place-row" key={p.savedAt+i}><button onClick={()=>onRestore(p.view)}>{lm.nodes.get(p.view.selected)?.title}<small>{p.view.scope.cutoff||'Усі дати'} · {p.view.mode==='table'?'Таблиця':'Лінза'}</small></button><button aria-label={`Видалити закладку ${i+1}`} onClick={()=>persist(places.filter((_,j)=>j!==i))}>×</button></div>)}
    {!places.length&&<p>Збережених місць ще немає.</p>}
    <button onClick={download} disabled={!places.length}>Завантажити маршрут JSON</button>
    <h4>Попередні фокуси цієї сесії</h4>
    {[...new Set(history)].reverse().slice(0,8).map(id=><button className="recent-place" key={id} onClick={()=>onSelect(id)}>{lm.nodes.get(id)?.title}</button>)}
    <p role="status">{notice}</p>
  </div></details>;
}
