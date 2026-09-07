import {useId} from 'react';
import type {compassLayout} from './compass.ts';

export function Compass({layout,active,obscured=[],onNavigate}:{layout:ReturnType<typeof compassLayout>;active:string|null;obscured?:string[];onNavigate:(id:string)=>void}){
  const prefix=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  return <g className="lens-orbit-compass" role="group" aria-label="Напрями до кластерів">
    <circle cx={layout.cx} cy={layout.cy} r={layout.ring} fill="none" stroke="#d9cfe5" strokeWidth=".7" opacity=".65" pointerEvents="none"/>
    {layout.items.map((item,i)=><g key={item.id} className="compass-cluster" data-compass-cluster={item.id}
      data-compass-bearing={item.bearing} role="button" tabIndex={0} aria-label={`Перейти до кластера: ${item.title}`}
      aria-current={item.id===active?'true':undefined} onPointerDown={e=>e.stopPropagation()}
      onClick={e=>{e.stopPropagation();onNavigate(item.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onNavigate(item.id);}}}>
      <defs><path id={`${prefix}-${i}`} d={item.textPath}/></defs>
      <path className="compass-hit" d={item.textPath} stroke="transparent" strokeWidth="28" fill="none" pointerEvents={obscured.includes(item.id)?'none':undefined}/>
      {item.connector&&<path d={item.connector} stroke={item.color} strokeWidth=".75" opacity=".55" fill="none" pointerEvents="none"/>}
      <g transform={`translate(${item.x} ${item.y}) rotate(${item.degrees})`} pointerEvents="none">
        <path d="M-4 -3 L0 0 L-4 3" fill="none" stroke={item.color} strokeWidth={item.id===active?1.8:1.2}/>
      </g>
      <text visibility={obscured.includes(item.id)?'hidden':undefined} fontSize={layout.fontSize} fontWeight="500" fill={item.color} textAnchor="middle" dy={Math.sin(item.angle)>0?layout.fontSize+3:-5}>
        <textPath href={`#${prefix}-${i}`} startOffset="50%">{item.title}</textPath>
      </text>
    </g>)}
  </g>;
}
