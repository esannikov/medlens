import type {LensModel, Scope} from './model.ts';
import {overlaps, type Point, type Measure, type Rect} from './layout.ts';

const TAU=Math.PI*2;
const positive=(a:number)=>(a%TAU+TAU)%TAU;
const polar=(cx:number,cy:number,r:number,a:number)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];

export function orbitArc(cx:number,cy:number,r:number,from:number,to:number){
  const a=polar(cx,cy,r,from),b=polar(cx,cy,r,to);
  return `M${a[0]},${a[1]} A${r},${r} 0 ${Math.abs(to-from)>Math.PI?1:0} ${to>=from?1:0} ${b[0]},${b[1]}`;
}

/** True bearings and independently spaced captions. Labels may separate along
 * the orbit, but the coloured ticks always retain the projected direction. */
export function compassLayout(lm:LensModel,scope:Scope,points:Point[],radius:number,width:number,height:number,measure:Measure,family:string,obstacles:Rect[]=[],previous:ReadonlyMap<string,number>=new Map(),activeGroup:string|null=null){
  const cx=width/2,cy=height/2,ring=radius+(width<600?5:18);
  const fontSize=width<600?10.5:12;
  const byId=new Map(points.map(p=>[p.id,p]));
  // The current section is already represented inside the lens. Removing it
  // before placement also removes its bearing, connector and reserved space.
  const items=lm.groups.filter(id=>id!==activeGroup&&lm.contextual(id,scope)).map(id=>{
    const n=lm.nodes.get(id)!,p=byId.get(id)!;
    let dx=p.x-cx,dy=p.y-cy;
    if(Math.hypot(dx,dy)<radius*.08){
      const children=n.children.map(id=>byId.get(id)!).filter(p=>p.active);
      dx=children.reduce((s,p)=>s+p.x-cx,0);dy=children.reduce((s,p)=>s+p.y-cy,0);
    }
    const bearing=positive(Math.atan2(dy,dx));
    const span=(measure(n.title,`500 ${fontSize}px ${family}`)+22)/ring;
    return {id,title:n.title,color:n.color,bearing,angle:bearing,span};
  }).sort((a,b)=>a.bearing-b.bearing);
  // Cut in the empty part of the orbit, never through a converged cluster.
  let cut=0,gap=-1;
  items.forEach((item,i)=>{const next=items[(i+1)%items.length];const d=positive(next.bearing-item.bearing);if(d>gap){gap=d;cut=(i+1)%items.length;}});
  const ordered=[...items.slice(cut),...items.slice(0,cut)];
  ordered.forEach((item,i)=>{if(i&&item.angle<ordered[i-1].angle)item.angle+=TAU;});
  for(let pass=0;pass<16;pass++)for(let i=1;i<ordered.length;i++){
    const a=ordered[i-1],b=ordered[i],lack=(a.span+b.span)/2+.045-(b.angle-a.angle);
    if(lack>0){a.angle-=lack/2;b.angle+=lack/2;}
  }
  const boundsAt=(angle:number,span:number)=>{
    const contour=Array.from({length:13},(_,i)=>angle-span/2+i*span/12)
      .flatMap(a=>[polar(cx,cy,ring+3,a),polar(cx,cy,ring+fontSize+10,a)]);
    const x=Math.min(...contour.map(p=>p[0]))-3,y=Math.min(...contour.map(p=>p[1]))-3;
    return {x,y,w:Math.max(...contour.map(p=>p[0]))-x+3,h:Math.max(...contour.map(p=>p[1]))-y+3};
  };
  type Slot={angle:number;bounds:Rect};
  const turn=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
  // A small joint search prevents one greedy caption from stranding the last
  // cluster on top of another. Clinical captions retain first use of space.
  let beam:{slots:Slot[];score:number}[]=[{slots:[],score:0}];
  for(const item of ordered){
    const remembered=previous.get(item.id);
    const angles=[...(remembered===undefined?[]:[remembered]),item.angle,
      ...Array.from({length:64},(_,i)=>item.angle+(i%2?1:-1)*(Math.floor(i/2)+1)*.095)];
    const candidates=angles.map(angle=>({angle,bounds:boundsAt(angle,item.span)})).filter(({angle,bounds:b})=>
      turn(angle,item.bearing)<1.15&&
      b.x>=3&&b.y>=44&&b.x+b.w<=width-3&&b.y+b.h<=height-36&&
      !obstacles.some(other=>overlaps(b,other,6)));
    const next=beam.flatMap(state=>candidates.filter(c=>!state.slots.some(s=>overlaps(c.bounds,s.bounds,10))).map(c=>({
      slots:[...state.slots,c],score:state.score+turn(c.angle,item.bearing)*2+(remembered===undefined?0:turn(c.angle,remembered)*.6)
    }))).sort((a,b)=>a.score-b.score).slice(0,20);
    if(!next.length){beam=[];break;}
    beam=next;
  }
  const settled=ordered.map((item,i)=>({...item,...(beam[0]?.slots[i]||{angle:item.angle,bounds:boundsAt(item.angle,item.span)})}));
  return {cx,cy,ring,fontSize,items:settled.map(item=>{
    const marker=polar(cx,cy,ring,item.bearing);
    const middle=positive(item.angle),half=item.span/2;
    // Bottom arcs read right-to-left geometrically so their glyphs stay upright.
    const reverse=Math.sin(middle)>0;
    const textPath=orbitArc(cx,cy,ring+3,middle+(reverse?half:-half),middle+(reverse?-half:half));
    const delta=Math.atan2(Math.sin(item.angle-item.bearing),Math.cos(item.angle-item.bearing));
    return {...item,x:marker[0],y:marker[1],textPath,
      connector:Math.abs(delta)>.025?orbitArc(cx,cy,ring,item.bearing,item.bearing+delta):'',
      degrees:item.bearing*180/Math.PI};
  })};
}
