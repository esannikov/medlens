import {date} from "../model.ts";
import type {LensModel,Scope} from "./model.ts";
import {validDay} from "../features/query.ts";

export function Timeline({lm,scope,onChange,onClose}:{lm:LensModel;scope:Scope;onChange:(day:string|null)=>void;onClose:()=>void}){
 const days=lm.days,first=days[0],last=days.at(-1),current=scope.cutoff||last;
 const epoch=(day:string)=>Date.parse(day+"T00:00:00Z");
 const jump=(direction:number)=>{const next=direction>0?days.find(d=>d>current!):[...days].reverse().find(d=>d<current!);if(next)onChange(next);};
 return <section id="lens-time-controls" className="timeline" aria-label="Часовий відбір">
  <div className="time-panel-heading"><h2>Час</h2><button aria-label="Закрити час" onClick={onClose}>×</button></div>
  {first&&last&&current?<><div className="time-buttons">
   <button aria-label="Попередня наявна дата записів" disabled={current<=first} onClick={()=>jump(-1)}>←</button>
   <input type="date" aria-label="Кінцева дата відбору" min={first} max={last} value={current} onChange={e=>validDay(e.target.value)&&onChange(e.target.value)}/>
   <button aria-label="Наступна наявна дата записів" disabled={current>=last} onClick={()=>jump(1)}>→</button>
   <button onClick={()=>onChange(null)}>Усі дати</button>
  </div>
  <input className="quiet-time-range" type="range" aria-label="Часовий курсор" aria-valuetext={scope.cutoff?"До "+date(scope.cutoff):"Усі дати"} min={epoch(first)} max={epoch(last)} step={86400000} value={epoch(current)} disabled={days.length<2} onChange={e=>onChange(new Date(Number(e.target.value)).toISOString().slice(0,10))}/>
  <p className="time-state" role="status">{scope.cutoff?"Записи до "+date(scope.cutoff)+" включно":"Усі дати"}</p>
  <p className="time-basis">Якщо клінічної дати немає, використано позначену дату видачі.</p></>:<p>Дати не визначені.</p>}
 </section>;
}
