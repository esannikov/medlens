import {useMemo,useState,type CSSProperties,type KeyboardEvent} from "react";
import {date,kindNames,label,value} from "../model.ts";
import type {LensModel,LensNode,Scope} from "../focus/model.ts";
import {LENS_FONT_FAMILY} from "../focus/typography.ts";
import {regroupLayout,regroupObjects,scopedObjects,type RegroupBy} from "./model.ts";
import "./experiments.css";

export default function Experiments({lm,scope,fontFamily=LENS_FONT_FAMILY,onExit}:{lm:LensModel;scope:Scope;fontFamily?:string;initialVariant?:"regroup";onExit?:()=>void}){
 return <section className="experiments exp-regroup" style={{"--exp-font":fontFamily} as CSSProperties}><header className="exp-heading"><h2>Перегрупування записів</h2><button onClick={onExit}>До лінзи</button></header><RegroupView lm={lm} scope={scope}/></section>;
}

function keyActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
}

function ObjectRead({ lm, node }: { lm: LensModel; node?: LensNode }) {
  if (!node?.object) return <p className="exp-empty">Оберіть запис, щоб прочитати його дані й джерело.</p>;
  const o = node.object, sources = lm.m.sourceFor(o), study = lm.eventFor(node);
  const observation = o.object_type === "observation";
  return <article className="exp-reader" aria-label={`Відкритий запис: ${node.title}`}>
    <div className="exp-record-kind">{kindNames[node.kind]} · {lm.times.get(node.id)?.text || "Досьє"}</div>
    <h3>{node.title}</h3>
    {observation && <p className="exp-reading-value">{value(o)}{o.payload.source_unit ? ` ${o.payload.source_unit}` : " · одиницю в записі не зазначено"}</p>}
    {study && study.object_id !== node.id && <p className="exp-reading-study">{label(study)}</p>}
    {o.payload.details && o.payload.details !== node.title && <p className="exp-exact-text">{o.payload.details}</p>}
    {node.kind === "temporal_relation" && <p className="exp-exact-text">{o.payload.interpretation_uk || o.payload.source_literal || lm.summary(node)}</p>}
    {sources.length > 0 ? <div className="exp-source-list">
      <h4>Дослівне джерело · {sources.length}</h4>
      {sources.map(source => <details key={source.id} open>
        <summary>{source.id}{source.derived_pdf_page !== null ? ` · стор. ${source.derived_pdf_page}` : ""}</summary>
        <p className="exp-exact-text">{source.literal}</p>
      </details>)}
    </div> : <p>Дослівного джерела для цього запису в опублікованому пакеті немає.</p>}
    <details className="exp-identifiers"><summary>Ідентифікатори запису</summary>
      <dl><dt>Об’єкт</dt><dd>{o.object_id}</dd><dt>Версія</dt><dd>{o.version_id}</dd>
        <dt>Клінічна дата запису</dt><dd>{o.clinical_time.start ? date(o.clinical_time.start) : "Не зазначено"}</dd>
        <dt>Статус клінічної дати</dt><dd>{o.clinical_time.status}</dd></dl>
    </details>
  </article>;
}

function MemberList({ lm, nodes, selected, onSelect, label: listLabel }: {
  lm: LensModel; nodes: LensNode[]; selected?: string; onSelect: (id: string) => void; label: string;
}) {
  return <ol className="exp-members" aria-label={listLabel}>
    {nodes.map(n => <li key={n.id} data-experiment-record={n.id}>
      <button type="button" aria-pressed={selected === n.id} onClick={() => onSelect(n.id)}>
        <span className="exp-member-title">{n.title}</span>
        <span className="exp-member-meta">{kindNames[n.kind]} · {lm.times.get(n.id)?.text || "Досьє"}</span>
        {n.kind === "observation" && <span className="exp-member-value">{value(n.object!)} {n.object!.payload.source_unit || "· одиницю не зазначено"}</span>}
      </button>
    </li>)}
  </ol>;
}

function RegroupView({ lm, scope }: { lm: LensModel; scope: Scope }) {
  const [by, setBy] = useState<RegroupBy>("material");
  const [mention, setMention] = useState("");
  const [selected, setSelected] = useState("");
  const groups = useMemo(() => regroupObjects(lm, scope, by, mention), [lm, scope, by, mention]);
  const layout = useMemo(() => regroupLayout(groups), [groups]);
  const objects = groups.flatMap(g => g.nodes);
  const activeId = objects.some(n => n.id === selected) ? selected : objects[0]?.id;
  const total = scopedObjects(lm, scope).length;
  return <div className="exp-regroup-view">
    <p className="exp-explanation">Розміщення тих самих записів за атрибутами з пакета. Ряди показують навігаційні групи;
      належність до одного ряду не встановлює клінічного зв’язку.</p>
    <div className="exp-regroup-controls">
      <label><span>Групувати за</span><select value={by} onChange={e => setBy(e.target.value as RegroupBy)}>
        <option value="material">Матеріалом</option><option value="date">Датою дослідження / видачі</option><option value="type">Типом запису</option>
      </select></label>
      <label><span>Згадка в тексті запису</span><input type="search" value={mention} onChange={e => setMention(e.target.value)}
        placeholder="Наприклад, кістковий мозок" aria-describedby="exp-mention-note" /></label>
      {mention && <button type="button" onClick={() => setMention("")}>Скинути пошук згадки</button>}
    </div>
    <p id="exp-mention-note" className="exp-note">Пошук знаходить текстові згадки, зокрема заперечення. Згадка анатомічного терміна не є перевіреною локалізацією.</p>
    <p className="exp-coverage" role="status">У розміщенні {objects.length} з {total} записів поточного відбору · {groups.length} груп. Повні назви й тексти — у списках нижче.
      {mention && " Решта не містить усіх введених слів у власному тексті запису."}</p>
    {objects.length === 0 ? <div className="exp-empty"><h3>Згадок не знайдено</h3><p>Змініть слова або скиньте пошук згадки.</p></div>
      : <>
        <div className="exp-regroup-content">
          <div className="exp-diagram-scroll" tabIndex={0} aria-label="Перегрупована карта; прокрутка відкриває решту рядів">
            <svg className="exp-regroup-diagram" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label="Двовимірне розміщення всіх відібраних записів">
              {layout.rows.map(row => <g key={row.key}>
                <path d={`M 210 ${row.top + 20} V ${row.top + row.height - 10}`} stroke="#cfc2df" fill="none" />
                <text x="24" y={row.top + 32} className="exp-group-title">{row.title.length > 24 ? `${row.title.slice(0, 23)}…` : row.title}<title>{row.title}</title></text>
                <text x="24" y={row.top + 54} className="exp-group-count">{row.points.length} записів</text>
                {row.points.map(point => { const n = lm.nodes.get(point.id)!; return <g key={point.id} role="button" tabIndex={0}
                  className="exp-graph-record" aria-label={`Прочитати: ${n.title}`}
                  onClick={() => setSelected(n.id)} onKeyDown={e => keyActivate(e, () => setSelected(n.id))}>
                  <title>{n.title} · {lm.summary(n)}</title>
                  <circle cx={point.x} cy={point.y} r="22" fill={activeId === n.id ? "#e6dcf1" : "transparent"} />
                  <circle cx={point.x} cy={point.y} r={activeId === n.id ? 8 : 5} fill={n.color} />
                  <text x={point.x + 14} y={point.y - 2}>{n.title.length > 27 ? `${n.title.slice(0, 26)}…` : n.title}</text>
                  <text x={point.x + 14} y={point.y + 16} className="exp-regroup-meta">{kindNames[n.kind]} · {lm.times.get(n.id)?.day ? date(lm.times.get(n.id)!.day) : "без дати"}{lm.times.get(n.id)?.basis==='issued'?' · видано':''}</text>
                </g>; })}
              </g>)}
            </svg>
          </div>
          <div className="exp-regroup-reader" tabIndex={0} aria-label="Дані відкритого запису"><ObjectRead lm={lm} node={lm.nodes.get(activeId!)} /></div>
        </div>
        <div className="exp-group-inventory">{groups.map(group => <details key={group.key} open>
          <summary>{group.title} · {group.nodes.length}</summary>
          <MemberList lm={lm} nodes={group.nodes} selected={activeId} onSelect={setSelected} label={`Повний список: ${group.title}`} />
        </details>)}</div>
      </>}
  </div>;
}
