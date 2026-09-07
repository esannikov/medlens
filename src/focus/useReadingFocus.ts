import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {LensModel,Scope} from './model.ts';
import type {Point} from './layout.ts';
import {FOCUS_DWELL_MS,shouldAdoptFocus} from './reveal.ts';

/** One settled focus drives labels, reader, compass and emphasized edges. */
export function useReadingFocus(lm:LensModel,scope:Scope,points:Point[],candidate:string,explicitId:string,explicitKey:number,programmaticMove:boolean){
  const [settled,setSettled]=useState(explicitId);
  const lastExplicit=useRef({id:explicitId,key:explicitKey});
  const changed=lastExplicit.current.id!==explicitId||lastExplicit.current.key!==explicitKey;
  const current=changed?explicitId:lm.contextual(settled,scope)?settled:candidate;
  useLayoutEffect(()=>{
    lastExplicit.current={id:explicitId,key:explicitKey};
    setSettled(explicitId);
  },[explicitId,explicitKey,lm]);
  useLayoutEffect(()=>{if(!lm.contextual(settled,scope))setSettled(candidate);},[lm,scope,settled,candidate]);
  const wins=shouldAdoptFocus(current,candidate,points);
  const latest=useRef({candidate,wins,programmaticMove});
  latest.current={candidate,wins,programmaticMove};
  useEffect(()=>{
    if(changed||programmaticMove||!wins)return;
    const selection=lastExplicit.current;
    const timer=window.setTimeout(()=>{
      if(lastExplicit.current===selection&&latest.current.candidate===candidate&&latest.current.wins&&!latest.current.programmaticMove)setSettled(candidate);
    },FOCUS_DWELL_MS);
    return ()=>window.clearTimeout(timer);
  },[candidate,current,wins,programmaticMove,changed]);
  return current;
}
