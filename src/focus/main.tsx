import React, { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import {
  date,
  kindNames,
  label,
  reference,
  timeRoles,
  value,
  type Snapshot,
} from "../model.ts";
import {
  createLensModel,
  type LensModel,
  type LensNode,
  type Scope,
} from "./model.ts";
import { Lens } from "./Lens";
import { Breadcrumbs } from './Breadcrumbs';
import {ResultContents,SourceDisclosure} from './ReaderContent';
import { NodeGlyph } from "./NodeGlyph";
import { nodeKinds, preview } from "./layout.ts";
import { TreeTable } from "./TreeTable";
import { Timeline } from "./Timeline";
import "./style.css";
import { FALLBACK_FONT_FAMILY, loadLensTypeface } from "./typography.ts";
import {RecordInsights} from '../features/RecordInsights';
import {unitDisplay} from '../features/clinical';
import {emptyTaskQuery,filterTaskNodes,type TaskQuery} from '../features/query';
import {TaskFilters} from '../features/TaskFilters';
import {Places} from '../session/Places';
import {viewFromURL,writeViewURL,type ViewState} from '../session/state';
import './workspace-upgrades.css';
import './quiet.css';

const Experiments=lazy(()=>import('../experiments/Experiments'));

const ALL: Scope = { cutoff: null, undated: true, group: null };
type Mode = "2d" | "table" | "regroup";
const readMode=():Mode=>{const m=new URLSearchParams(location.search).get('lens');return m==='table'||m==='regroup'?m:'2d';};
function Icon({
  type,
}: {
  type: "graph" | "search" | "back" | "source" | "pin";
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      {type === "search" ? (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </>
      ) : type === "back" ? (
        <path d="M20 12H4m6-6-6 6 6 6" />
      ) : type === "source" ? (
        <>
          <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" />
        </>
      ) : type === "pin" ? (
        <>
          <path d="m8 3 8 2-2 5 3 4-12-3 4-2zM10 13l-2 8" />
        </>
      ) : (
        <>
          <path d="M6 6l12 3-6 10z" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="9" r="3" />
          <circle cx="12" cy="19" r="3" />
        </>
      )}
    </svg>
  );
}
function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const [fontFamily,setFontFamily] = useState(FALLBACK_FONT_FAMILY);
  useEffect(() => {
    const ctl = new AbortController();
    const typeface = loadLensTypeface();
    fetch(`${import.meta.env.BASE_URL}data/case024.json`, { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Не вдалося завантажити публічний знімок. Перевірте з’єднання й оновіть сторінку.",
          );
        const d = await r.json();
        createLensModel(d);
        const loadedFamily = await typeface;
        if (!ctl.signal.aborted) {
          setFontFamily(loadedFamily);
          setData(d);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("Не вдалося відкрити перевірений знімок. Перевірте з’єднання та повторіть спробу. Дані не змінено.");
      });
    return () => ctl.abort();
  }, []);
  return data ? (
    <Workspace data={data} fontFamily={fontFamily} />
  ) : (
    <main className="focus-loading">
      <Icon type="graph" />
      <h1>{error ? "Карта недоступна" : "Відкриваємо досьє"}</h1>
      <p>{error || "Дослідження, результати та їхні джерела"}</p>
      {error && <button onClick={() => location.reload()}>Повторити</button>}
    </main>
  );
}
function Workspace({ data, fontFamily }: { data: Snapshot; fontFamily: string }) {
  const lm = useMemo(() => createLensModel(data), [data]);
  const initial=useMemo(()=>viewFromURL(location.href,lm),[lm]);
  const [mode, setMode] = useState<Mode>(readMode);
  const [selected, setSelected] = useState(initial?.selected||lm.root),
    [history, setHistory] = useState<string[]>([]);
  const pinned=null, baselineDay=null, baseline=null;
  const [centerKey, setCenterKey] = useState(0);
  const [readerOpen, setReaderOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [navigationId, setNavigationId] = useState(initial?.focus||initial?.selected||lm.root);
  const [cameraTarget,setCameraTarget]=useState(initial?.focus||initial?.selected||lm.root);
  const [scope, setScope] = useState<Scope>(initial?.scope||ALL),
    [query, setQuery] = useState(""),
    [sourceId, setSourceId] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<"contents" | "links">(
    "contents",
  );
  const [textScale,setTextScale]=useState(initial?.textScale||1);
  const [normalized,setNormalized]=useState(initial?.normalized||false);
  const [showRelations,setShowRelations]=useState(false);
  const [task,setTask]=useState<TaskQuery>(emptyTaskQuery);
  const [searchOpen,setSearchOpen]=useState(false);
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const embedded=new URLSearchParams(location.search).get('embed')==='1';
  const search = useRef<HTMLInputElement>(null),
    rail = useRef<HTMLElement>(null);
  const displayId=mode==='2d'?navigationId:selected;
  const node = lm.nodes.get(displayId)!;
  const sourceOwner=useRef(displayId);
  const currentSource=sourceOwner.current===displayId?sourceId:null;
  useEffect(()=>{setRailTab('contents');setAdvancedOpen(false);if(sourceOwner.current!==displayId)setSourceId(null);},[displayId]);
  const study = lm.eventFor(node);
  const choose = (id: string) => {
    setCenterKey((k) => k + 1);
    if (id !== selected) setHistory((h) => [...h.slice(-29), selected]);
    setSelected(id);
    setNavigationId(id);
    setCameraTarget(id);
    setSourceId(null);
    setQuery("");
    setSearchOpen(false);
    setRailTab("contents");
  };
  const back = () => {
    const last = history[history.length - 1];
    if (last) {
      setSelected(last);
      setHistory((h) => h.slice(0, -1));
      setSourceId(null);
      setNavigationId(last);
      setCameraTarget(last);
      setCenterKey(k=>k+1);
    }
  };
  const swapMode = (next: Mode) => {
    setMode(next);
    const u = new URL(location.href);
    u.searchParams.set("lens", next);
    window.history.replaceState(null, "", u);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape") {
        setSourceId(null);
        setQuery("");
        setSearchOpen(false);
        setReaderOpen(false);
        setTimeOpen(false);
        document.querySelectorAll('details[open].more-control').forEach(el=>el.removeAttribute('open'));
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const selectedEligible = lm.eligible(displayId,scope),
    visibleChildren = node.children.filter((id) => lm.contextual(id, scope));
  const searchResults=useMemo(()=>filterTaskNodes(lm,ALL,{...task,text:query}),[lm,task,query]);
  const hasSearch=Boolean(query.trim()||task.domain||task.from||task.to||task.basis!=='all'||task.kinds.length);
  const unknown = lm.m.results.filter(
    (o) => lm.times.get(o.object_id)!.basis === "unknown" && (!scope.group || lm.groupFor(o.object_id)===scope.group),
  ).length;
  const timeControls = (
    <Timeline
      lm={lm}
      scope={scope}
      onChange={(cutoff) => setScope((s) => ({ ...s, cutoff }))}
      onClose={() => setTimeOpen(false)}
    />
  );
  useEffect(() => {
    if (!selectedEligible) {
      setSourceId(null);
      setRailTab("contents");
    }
  }, [selectedEligible]);
  useEffect(() => {
    if(mode==='2d'||mode==='table') window.history.replaceState(null,'',writeViewURL(location.href,{version:1,graph:data.graph_hash,selected,focus:navigationId,pinned,scope,baseline:baselineDay,mode,textScale,normalized}));
  }, [mode,selected,navigationId,pinned,scope,baselineDay,textScale,normalized,data.graph_hash]);
  const view:ViewState={version:1,graph:data.graph_hash,selected,focus:navigationId,pinned,scope,baseline:baselineDay,mode:mode==='table'?'table':'2d',textScale,normalized};
  function restore(v:ViewState){setSelected(v.selected);setNavigationId(v.focus);setCameraTarget(v.focus);setScope(v.scope);setMode(v.mode);setTextScale(v.textScale);setNormalized(v.normalized);setCenterKey(k=>k+1);setSourceId(null);setSearchOpen(false);}
  useEffect(()=>{const pop=()=>{const v=viewFromURL(location.href,lm);if(v)restore(v);setMode(readMode());};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[lm]);
  const openRecord=(id:string)=>{if(!lm.contextual(id,scope))setScope(ALL);choose(id);setReaderOpen(true);requestAnimationFrame(()=>rail.current?.focus({preventScroll:true}));};
  const openSource=(id:string)=>{openRecord(id);sourceOwner.current=id;const o=lm.nodes.get(id)?.object;setSourceId(o?lm.m.sourceFor(o)[0]?.id||null:null);};
  if(mode==='regroup')return <div className={`experiment-app ${embedded?'embedded':''}`} style={{'--lens-font':fontFamily} as CSSProperties}>
    <Suspense fallback={<p role="status">Відкриваємо експеримент…</p>}><Experiments lm={lm} scope={scope} fontFamily={fontFamily} initialVariant={mode} onExit={()=>swapMode('2d')}/></Suspense>
  </div>;
  return (
    <div className={`focus-app quiet-app ${embedded?'embedded':''}`} data-typeface={fontFamily} style={{"--lens-font":fontFamily} as CSSProperties}>
      <a className="skip-link" href="#graph-workspace">До карти й результатів</a>
      <header className="quiet-bar">
        <button
          className="brand"
          onClick={() => choose(lm.root)}
          aria-label="До всього досьє"
        >
          <Icon type="graph" />
          <strong>MedLens</strong>
        </button>
        <h1><span className="sr-only">Карта пацієнта </span>{data.case_id}</h1>
        <div className="search-anchor"><label className="focus-search">
          <Icon type="search" />
          <input
            ref={search}
            type="search"
            value={query}
            name="dossier-search"
            autoComplete="off"
            onFocus={()=>setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            placeholder="Знайти у досьє"
            aria-label="Пошук у всьому досьє"
          />
          <kbd>⌘ K</kbd>
        </label>
        {searchOpen&&<section className="search-popover" aria-label="Пошук і прозорий відбір">
          <div className="search-heading"><h2>Знайти у досьє</h2><button aria-label="Закрити пошук" onClick={()=>setSearchOpen(false)}>×</button></div>
          <TaskFilters lm={lm} query={{...task,text:query}} onChange={next=>{setTask(next);setQuery(next.text);}} count={searchResults.length}/>
          <p className="search-count" role="status" aria-live="polite">{hasSearch?`${searchResults.length} записів у досьє`:'Введіть назву або виберіть умови.'}</p>
          {hasSearch&&<div className="search-results-list">{searchResults.map(n=><NodeRow key={n.id} n={n} lm={lm} scope={scope} onSelect={openRecord}/>)}</div>}
          {hasSearch&&!searchResults.length&&<p>Нічого не знайдено. Спробуйте коротшу назву.</p>}
        </section>}
        </div>
        <button
          className="time-toggle"
          aria-controls="lens-time-controls"
          aria-expanded={timeOpen}
          onClick={() => setTimeOpen((open) => !open)}
        >
          {scope.cutoff ? `До ${date(scope.cutoff)}` : "Час"}
        </button>
        <button
          className="reader-toggle"
          aria-expanded={readerOpen}
          onClick={() => {
            setReaderOpen((open) => !open);
          }}
        >
          {readerOpen ? "Закрити дані" : "Дані"}
        </button>
        <details className="more-control"><summary aria-label="Інструменти та вигляд">Ще</summary><div className="more-panel">
          <nav aria-label="Спосіб перегляду"><button aria-pressed={mode==='2d'} onClick={()=>swapMode('2d')}>Лінза</button><button aria-pressed={mode==='table'} onClick={()=>swapMode('table')}>Таблиця</button></nav>
          <label>Розділ<select aria-label="Розділ досьє" value={scope.group||''} onChange={e=>{const group=e.target.value||null;setScope(s=>({...s,group}));choose(group||lm.root);}}><option value="">Усе досьє</option>{lm.groups.map(id=><option key={id} value={id}>{lm.nodes.get(id)!.title}</option>)}</select></label>
          <label>Розмір тексту<select aria-label="Масштаб тексту" value={textScale} onChange={e=>setTextScale(Number(e.target.value))}><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option></select></label>
          <label><input type="checkbox" checked={normalized} onChange={e=>setNormalized(e.target.checked)}/>Унормовані одиниці</label>
          <label><input type="checkbox" checked={showRelations} onChange={e=>setShowRelations(e.target.checked)}/>Структурні зв’язки</label>
          <button className="more-action" onClick={e=>{setSourceId(null);setRailTab('links');setReaderOpen(true);e.currentTarget.closest('details')?.removeAttribute('open');}}>Зв’язки запису</button>
          <button className="more-action" onClick={e=>{setSourceId(null);setRailTab('contents');setAdvancedOpen(true);setReaderOpen(true);e.currentTarget.closest('details')?.removeAttribute('open');}}>Технічні дані запису</button>
          <Places lm={lm} current={view} onRestore={restore} history={history} onSelect={openRecord}/>
          <p className="demo-note">Знеособлене демо · не для клінічних рішень.</p>
        </div></details>
      </header>
      {timeOpen && <div className="time-popover">{timeControls}<label className="undated-toggle"><input type="checkbox" checked={scope.undated} onChange={e=>setScope(s=>({...s,undated:e.target.checked}))}/>Записи без дати ({unknown})</label></div>}
      <main
        id="graph-workspace"
        className={`focus-workspace ${readerOpen ? "reader-open" : "reader-closed"}`}
      >
        <section className="graph-workspace" aria-label="Граф і фокус">
          <Breadcrumbs path={lm.ancestors(displayId)} onSelect={choose} onBack={back} canBack={history.length>0}/>
          {mode === "table" ? (
            <TreeTable
              lm={lm}
              scope={scope}
              baseline={baseline}
              normalized={normalized}
              selected={selected}
              onSelect={openRecord}
            />
          ) : (
            <Lens
              readerOpen={readerOpen}
              fontFamily={fontFamily}
              lm={lm}
              scope={scope}
              centerKey={centerKey}
              cameraTarget={cameraTarget}
              selected={selected}
              pinned={pinned}
              textScale={textScale}
              canonicalUnits={normalized}
              showRelations={showRelations||railTab==='links'}
              sourceTrace={Boolean(currentSource)}
              onReadSource={openSource}
              onSelect={openRecord}
              onNavigate={choose}
              onFocusChange={setNavigationId}
              onRead={openRecord}
            />
          )}
        </section>
        <aside
          className="focus-rail"
          ref={rail}
          tabIndex={-1}
          aria-label="Вибраний об’єкт і повні дані"
          data-reader-object={displayId}
        >
          <div className="rail-header">
            <div>
              <h2>
                <NodeGlyph kind={node.kind} color={node.color} />
                {node.kind === "finding" ? "Опис знахідки" : node.title}
              </h2>
            </div>
            <button className="close-reader" aria-label="Закрити запис" onClick={()=>setReaderOpen(false)}>×</button>
          </div>
          {study && node.kind !== "clinical_event" && (
            <button
              className="study-return"
              onClick={() => choose(study.object_id)}
            >
              <NodeGlyph kind="clinical_event" color={node.color} />
              <span>
                Із дослідження
                <strong>{lm.nodes.get(study.object_id)!.title}</strong>
                <small>{lm.times.get(study.object_id)?.text}</small>
              </span>
              <b>↑</b>
            </button>
          )}
          <div className="rail-content" key={displayId}>
            {railTab==='links'&&<button className="back-text" onClick={()=>setRailTab('contents')}>До даних</button>}
            {currentSource && selectedEligible ? (
              <>
                <button className="back-text" onClick={() => setSourceId(null)}>
                  <Icon type="back" />
                  До об’єкта
                </button>
                <h3>Точний текст джерела</h3>
                {data.sources
                  .filter((s) => s.id === currentSource)
                  .map((s) => (
                    <div key={s.id} className="source-text">
                      <p>
                        Сторінка {s.derived_pdf_page ?? "не зазначена"} · запис{" "}
                        {s.source_order}
                      </p>
                      <blockquote><SourceLiteral literal={s.literal} target={node.object?value(node.object):''}/></blockquote>
                      <details>
                        <summary>Адреса джерела</summary>
                        <code>{s.id}</code>
                        <pre>{JSON.stringify(s.locator, null, 2)}</pre>
                      </details>
                    </div>
                  ))}
              </>
            ) : railTab === "links" && selectedEligible ? (
              <Links node={node} lm={lm} onSelect={choose} />
            ) : (
              <>
                {!selectedEligible && node.object && (
                  <div className="outside">
                    <strong>Запис поза обраним відбором</strong>
                    <p>
                      {lm.times.get(displayId)?.text}. Значення й джерела
                      приховані цим відбором.
                    </p>
                    <button onClick={() => setScope(ALL)}>
                      Показати в усьому досьє
                    </button>
                  </div>
                )}
                {node.object && selectedEligible && (
                  <ObjectDetail
                    n={node}
                    lm={lm}
                    normalized={normalized}
                    showTechnical={advancedOpen}
                    onSelect={choose}
                  />
                )}
                {advancedOpen&&node.object&&selectedEligible&&<RecordInsights lm={lm} node={node} scope={scope} normalized={normalized} onSelect={openRecord}/>}
                {node.kind === "group" && (
                  <p className="help">
                    {preview(lm, node, scope).content}. Вибір нижче пересуває цю
                    гілку в центр лінзи.
                  </p>
                )}
                {node.kind === "patient" && (
                  <div className="patient-overview">
                    <strong>
                      {lm.m.patient.payload.sex === "female"
                        ? "Жінка"
                        : lm.m.patient.payload.sex === "male"
                          ? "Чоловік"
                          : "Стать не зазначено"}
                      {lm.m.patient.payload.age_years != null
                        ? ` · ${lm.m.patient.payload.age_years} р.`
                        : ""}
                    </strong>
                    <p>
                      {lm.m.events.length} досліджень · {lm.m.results.length}{" "}
                      результатів · {lm.m.specimens.length} матеріалів
                    </p>
                  </div>
                )}
                {selectedEligible&&(node.kind==='clinical_event'||node.kind==='specimen') ? (
                  <ResultContents lm={lm} node={node} scope={scope} normalized={normalized} onSelect={choose}/>
                ) : visibleChildren.length > 0 && (
                  <>
                    <h3>
                      {node.kind === "specimen"
                        ? "Результати матеріалу"
                        : node.kind === "clinical_event"
                          ? "Матеріали та результати"
                          : "У цьому фокусі"}
                      <small>{visibleChildren.length}</small>
                    </h3>
                    {visibleChildren.map((id) => (
                      <NodeRow
                        key={id}
                        n={lm.nodes.get(id)!}
                        lm={lm}
                        scope={scope}
                        onSelect={choose}
                      />
                    ))}
                  </>
                )}
                {!['clinical_event','specimen'].includes(node.kind)&&node.children.length > visibleChildren.length && (
                  <p className="help">
                    Ще {node.children.length - visibleChildren.length} елементів
                    поза відбором.
                  </p>
                )}
                {selectedEligible&&<SourceDisclosure lm={lm} node={node} scope={scope} onSource={id=>{sourceOwner.current=displayId;setSourceId(id);}}/>}
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
function NodeRow({
  n,
  lm,
  scope,
  onSelect,
}: {
  n: LensNode;
  lm: LensModel;
  scope: Scope;
  onSelect: (id: string) => void;
}) {
  const eligible = lm.eligible(n.id, scope);
  return (
    <button
      className={`node-row ${eligible ? "" : "out-of-scope"}`}
      onClick={() => onSelect(n.id)}
      data-select-object={n.id}
      title={eligible?undefined:'Відкрити в усьому досьє'}
    >
      <NodeGlyph kind={n.kind} color={n.color} />
      <span>
        <strong>{n.title}</strong>
        <small>
          {[nodeKinds[n.kind], eligible ? preview(lm, n, scope).content : "Поза відбором"].filter(Boolean).join(" · ")}
          {(lm.times.get(n.id)?.day ||
            n.kind === "clinical_event" ||
            n.kind === "temporal_relation") &&
            ` · ${lm.times.get(n.id)!.text}`}
        </small>
      </span>
      <b>›</b>
    </button>
  );
}
function ObjectDetail({
  n,
  lm,
  onSelect,
  normalized=false,
  showTechnical=false,
}: {
  n: LensNode;
  lm: LensModel;
  onSelect: (id: string) => void;
  normalized?: boolean;
  showTechnical?: boolean;
}) {
  const o = n.object!,
    t = lm.times.get(n.id)!,
    specimen = lm.m.specimenFor(o);
  return (
    <div className="object-detail">
      {n.kind === "temporal_relation" && (
        <div className="temporal-endpoints">
          <p>{label(o)}</p>
          {(["prior", "current"] as const).map((slot) => {
            const ref = o.payload[slot],
              target = ref && lm.nodes.get(ref.object_id);
            return ref?.resolution_status === "resolved" &&
              target?.object?.version_id === ref.version_id ? (
              <button
                key={slot}
                data-temporal-endpoint={slot}
                onClick={() => onSelect(target.id)}
              >
                <small>
                  {slot === "prior" ? "Попередній запис" : "Поточний запис"} ·{" "}
                  {date(ref.clinical_time)}
                </small>
                <strong>{target.title}</strong>
              </button>
            ) : (
              <p key={slot}>Пов’язаний запис не під’єднано.</p>
            );
          })}
        </div>
      )}
      {n.kind === "observation" && (
        <div className="result-value">
          {value(o)}
          <span>{o.payload.source_unit?.trim()?unitDisplay(o,normalized):"одиницю не зазначено"}</span>
        </div>
      )}
      {n.kind === "finding" && <p className="finding-full">{n.title}</p>}
      {!["patient"].includes(n.kind) && (
        <dl>
          <dt>Дата</dt>
          <dd>
            {t.basis==='issued'?`${date(t.day)} · видано`:t.text}
          </dd>
          {n.kind === "observation" && (
            <>
              <dt>Референс</dt>
              <dd>{reference(o)}</dd>
            </>
          )}
          {specimen && (
            <>
              <dt>Матеріал</dt>
              <dd>{specimen.payload.source_literal}</dd>
            </>
          )}
          {n.kind === "temporal_relation" && (
            <>
              <dt>Сумісність</dt>
              <dd>
                {o.payload.compatibility_receipt?.status === "partial"
                  ? "Часткова"
                  : o.payload.compatibility_receipt?.status || "Не визначена"}
              </dd>
            </>
          )}
        </dl>
      )}
      {showTechnical && n.kind === "clinical_event" && o.payload.times?.length > 0 && (
        <details className="event-times"><summary>Дати документа</summary>
          {o.payload.times.map((v: any, i: number) => (
            <span key={i}>
              {timeRoles[v.kind] || v.kind}: {date(v.date)}
            </span>
          ))}
        </details>
      )}
      {showTechnical && n.kind !== "patient" && (
        <details>
          <summary>Технічні поля</summary>
          <code>
            {o.object_id}
            <br />
            {o.version_id}
          </code>
          <pre>{JSON.stringify(o.payload, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
function Links({
  node,
  lm,
  onSelect,
}: {
  node: LensNode;
  lm: LensModel;
  onSelect: (id: string) => void;
}) {
  const links = node.object
    ? lm.data.edges.filter((e) => e.source === node.id || e.target === node.id)
    : [];
  const names: Record<string, string> = {
    has_event: "Містить дослідження",
    has_specimen: "Матеріал дослідження",
    has_observation: "Результат дослідження",
    yields_finding: "Знахідка дослідження",
    derived_from_specimen: "Походить із матеріалу",
  };
  return (
    <>
      <h3>
        Зв’язки у Patient Graph <small>{links.length}</small>
      </h3>
      <p className="help">
        Лінза використовує дерево для навігації. Тут — усі прямі структурні
        зв’язки об’єкта, включно з іншими батьківськими зв’язками.
      </p>
      {!node.object && (
        <p>Це лише групування інтерфейсу; воно не є клінічним об’єктом.</p>
      )}
      {links.map((e) => {
        const other = lm.nodes.get(e.source === node.id ? e.target : e.source)!;
        return (
          <button
            className="link-row"
            key={e.id}
            onClick={() => onSelect(other.id)}
          >
            <small>{names[e.relation] || e.relation}</small>
            <strong>{other.title}</strong>
            <span>
              {e.source === node.id ? "Вихідний зв’язок" : "Вхідний зв’язок"}
            </span>
          </button>
        );
      })}
    </>
  );
}
function SourceLiteral({literal,target}:{literal:string;target:string}){
  // Mark only an exact literal match; no rewritten or generated source text.
  const at=target&&target!=='—'?literal.indexOf(target):-1;
  return at<0?<>{literal}</>:<>{literal.slice(0,at)}<mark>{literal.slice(at,at+target.length)}</mark>{literal.slice(at+target.length)}</>;
}
createRoot(document.getElementById("root")!).render(<App />);
