import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { date, kindNames, label, value } from "../model.ts";
import { type LensModel, type LensNode, type Scope } from "../focus/model.ts";
import { LENS_FONT_FAMILY } from "../focus/typography.ts";
import { Lens } from "../focus/Lens.tsx";
import { pairedStudyMembers, experimentUrl, explicitStudyComparisons, isExperimentVariant, paneVariants,
  regroupLayout, regroupObjects, scopedObjects, studyMembers,
  type ExperimentVariant, type PaneVariant, type RegroupBy } from "./model.ts";
import "./experiments.css";

const variantNames: Record<ExperimentVariant, string> = {
  dual: "Дві пов’язані лінзи", regroup: "Перегрупування", lab: "Порівняти поруч",
};
const paneNames: Record<PaneVariant, string> = {
  "2d": "Основна лінза", control: "Контроль: до змін", dual: "Дві пов’язані лінзи", regroup: "Перегрупування",
};

export type ExperimentsProps = {
  lm: LensModel;
  scope: Scope;
  fontFamily?: string;
  initialVariant?: ExperimentVariant;
  onExit?: () => void;
};

export function Experiments({ lm, scope, fontFamily = LENS_FONT_FAMILY,
  initialVariant = "dual", onExit }: ExperimentsProps) {
  const embedded = new URLSearchParams(window.location.search).get("embed") === "1";
  const allowedVariant = (v: ExperimentVariant) => embedded && v === "lab" ? "dual" : v;
  const [variant, setVariant] = useState<ExperimentVariant>(() => allowedVariant(initialVariant));
  useEffect(() => setVariant(allowedVariant(initialVariant)), [initialVariant, embedded]);
  useEffect(() => {
    const restore = () => {
      const next = new URLSearchParams(window.location.search).get("lens");
      if (isExperimentVariant(next)) setVariant(allowedVariant(next));
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [embedded]);
  const choose = (next: ExperimentVariant) => {
    setVariant(allowedVariant(next));
    window.history.replaceState(null, "", experimentUrl(allowedVariant(next), window.location.href, embedded));
  };
  return <section className={`experiments exp-${variant}`} style={{ "--exp-font": fontFamily } as CSSProperties}
    aria-label="Експериментальні лінзи">
    <header className="exp-heading">
      <div><h2>Експериментальні лінзи</h2><p>Той самий знімок {lm.data.case_id}. Варіанти організації та читання записів.</p></div>
      {onExit ? <button type="button" onClick={onExit}>До основної лінзи</button>
        : <a href={experimentUrl("2d", window.location.href, embedded)}>До основної лінзи</a>}
    </header>
    <nav className="exp-tabs" aria-label="Варіант експерименту">
      {(Object.keys(variantNames) as ExperimentVariant[]).filter(v => !embedded || v !== "lab").map(v =>
        <button key={v} type="button" aria-pressed={variant === v} onClick={() => choose(v)}>{variantNames[v]}</button>)}
    </nav>
    {variant === "dual" ? <DualFocus lm={lm} scope={scope} fontFamily={fontFamily} />
      : variant === "regroup" ? <RegroupView lm={lm} scope={scope} /> : <ComparisonLab lm={lm} />}
  </section>;
}
export default Experiments;

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

function DualFocus({ lm, scope, fontFamily }: { lm: LensModel; scope: Scope; fontFamily: string }) {
  const studies = useMemo(() => scopedObjects(lm, scope).filter(n => n.kind === "clinical_event"), [lm, scope]);
  const [chosen, setChosen] = useState<[string, string]>(["", ""]);
  const [opened, setOpened] = useState<[string, string]>(["", ""]);
  const [focused, setFocused] = useState<[string, string]>(["", ""]);
  const first = studies.some(n => n.id === chosen[0]) ? chosen[0] : studies[0]?.id || "";
  const second = studies.some(n => n.id === chosen[1]) ? chosen[1]
    : studies.find(n => n.id !== first)?.id || "";
  const ids: [string, string] = [first, second];
  const poles = useMemo(() => pairedStudyMembers(lm, ids, scope), [lm, first, second, scope]);
  const comparisons = useMemo(() => explicitStudyComparisons(lm, first, second, scope), [lm, first, second, scope]);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const open = (pole: number, id: string) => {
    const node = lm.nodes.get(id);
    if (!node || !lm.contextual(id, scope)) return;
    setFocused(prev => pole === 0 ? [id, prev[1]] : [prev[0], id]);
    if (!node.object || !lm.eligible(id, scope)) return;
    setOpened(prev => pole === 0 ? [id, prev[1]] : [prev[0], id]);
    const study = lm.eventFor(node);
    if (study && lm.eligible(study.object_id, scope)) {
      setChosen(prev => pole === 0 ? [study.object_id, prev[1] || second] : [prev[0] || first, study.object_id]);
      setComparisonId(null);
    }
  };
  const selectStudy = (pole: number, id: string) => {
    setChosen(pole === 0 ? [id, second] : [first, id]);
    setOpened(prev => pole === 0 ? [id, prev[1]] : [prev[0], id]);
    setFocused(prev => pole === 0 ? [id, prev[1]] : [prev[0], id]);
    setComparisonId(null);
  };
  if (studies.length < 2) return <div className="exp-empty" role="status">
    <h3>Для двох фокусів потрібно два дослідження</h3>
    <p>Поточний відбір містить {studies.length}. Розширте часовий або категорійний відбір в основних контролах.</p>
    {studies[0] && <><h4>{studies[0].title}</h4><MemberList lm={lm} nodes={studyMembers(lm, studies[0].id, scope)}
      selected={opened[0]} onSelect={id => open(0, id)} label="Усі доступні записи дослідження" />
      <ObjectRead lm={lm} node={studyMembers(lm, studies[0].id, scope).find(n => n.id === opened[0])} /></>}
  </div>;
  return <div className="exp-dual-view">
    <p className="exp-explanation">Дві незалежні лінзи зі спільним відбором. Перетягуйте кожну, щоб наблизити записи;
      натискання відкриває дані у відповідній колонці. Автоматичного зіставлення клінічних сутностей немає.</p>
    <div className="exp-study-pickers">{ids.map((id, pole) => <label key={pole}>
      <span>Фокус {pole === 0 ? "A" : "B"}</span>
      <select value={id} onChange={e => selectStudy(pole, e.target.value)}>
        {studies.map(study => <option key={study.id} value={study.id}>{lm.times.get(study.id)?.text} · {study.title}</option>)}
      </select>
    </label>)}</div>
    <div className="exp-linked-lenses">{poles.map((pole, index) => {
      const focusId = lm.nodes.has(focused[index]) && lm.contextual(focused[index], scope) ? focused[index] : pole.id;
      return <section key={index} className="exp-linked-lens" aria-label={`Лінза ${index === 0 ? "A" : "B"}`}>
        <h3>Лінза {index === 0 ? "A" : "B"} · {lm.nodes.get(pole.id)!.title}</h3>
        <Lens lm={lm} selected={focusId} pinned={null} scope={scope} centerKey={0} fontFamily={fontFamily}
          onSelect={id => open(index, id)} onRead={id => open(index, id)} onFocusChange={() => {}} />
      </section>;
    })}</div>
    <p className="exp-coverage" role="status">Повні списки обраних досліджень: A — {poles[0].nodes.length} / {poles[0].nodes.length}, B — {poles[1].nodes.length} / {poles[1].nodes.length} доступних записів.
      Нижче включено дослідження, матеріал і результати. Кожна лінза окремо показує покриття активної гілки.</p>
    <div className="exp-comparison-state"><strong>Явні часові порівняння в пакеті: {comparisons.length}</strong>
      {comparisons.length ? <div>{comparisons.map(n => <button key={n.id} type="button" onClick={() => setComparisonId(n.id)}>{n.title}</button>)}</div>
        : <p>Для цієї пари в поточному відборі немає явних зв’язків з підтвердженими посиланнями на обидва дослідження.</p>}
      {comparisons.some(n => n.id === comparisonId) && <ObjectRead lm={lm} node={lm.nodes.get(comparisonId!)} />}
    </div>
    <div className="exp-dual-columns">{poles.map((pole, index) => {
      const selected = lm.nodes.get(opened[index])?.object && lm.eligible(opened[index], scope) ? opened[index] : pole.id;
      return <section key={index} aria-label={`Фокус ${index === 0 ? "A" : "B"}`}>
        <h3>Фокус {index === 0 ? "A" : "B"} · {lm.nodes.get(pole.id)!.title}</h3>
        <div className="exp-reading-window" tabIndex={0} aria-label={`Дані відкритого запису фокуса ${index === 0 ? "A" : "B"}`}>
          <ObjectRead lm={lm} node={lm.nodes.get(selected)} />
        </div>
        <h4>Усі записи дослідження · {pole.nodes.length}</h4>
        <MemberList lm={lm} nodes={pole.nodes} selected={selected} onSelect={id => open(index, id)} label={`Повний список фокуса ${index === 0 ? "A" : "B"}`} />
      </section>;
    })}</div>
  </div>;
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

function ComparisonLab({ lm }: { lm: LensModel }) {
  const [panes, setPanes] = useState<[PaneVariant, PaneVariant]>(["control", "2d"]);
  return <div className="exp-lab-view">
    <p className="exp-explanation">Оберіть два варіанти. Кожна панель має власні фокус, фільтри та відкритий запис.
      Для зіставлення встановіть однаковий відбір у двох панелях.</p>
    <p className="exp-note">Один опублікований знімок {lm.data.case_id} · ревізія {lm.data.graph_hash.slice(0, 12)}.</p>
    <div className="exp-lab-panes">{panes.map((variant, index) => <section key={index} className="exp-lab-pane" aria-label={`Панель ${index === 0 ? "A" : "B"}`}>
      <header><label><span>Панель {index === 0 ? "A" : "B"}</span>
        <select value={variant} onChange={e => setPanes(prev => index === 0 ? [e.target.value as PaneVariant, prev[1]] : [prev[0], e.target.value as PaneVariant])}>
          {paneVariants.map(v => <option key={v} value={v}>{paneNames[v]}</option>)}
        </select></label>
        <a href={experimentUrl(variant, window.location.href)} target="_blank" rel="noopener noreferrer">Відкрити окремо</a>
      </header>
      <iframe key={variant} title={`Панель ${index === 0 ? "A" : "B"}: ${paneNames[variant]}`}
        src={experimentUrl(variant, window.location.href, true)} referrerPolicy="no-referrer" />
    </section>)}</div>
  </div>;
}
