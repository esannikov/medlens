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
import { NodeGlyph } from "./NodeGlyph";
import { nodeKinds, preview } from "./layout.ts";
import { TreeTable } from "./TreeTable";
import { Timeline } from "./Timeline";
import "./style.css";
import { FALLBACK_FONT_FAMILY, loadLensTypeface } from "./typography.ts";
import {RecordInsights} from '../features/RecordInsights';
import {unitDisplay} from '../features/clinical';
import {emptyTaskQuery,filterTaskNodes,queryDescription,type TaskQuery} from '../features/query';
import {TaskFilters} from '../features/TaskFilters';
import {Places} from '../session/Places';
import {viewFromURL,writeViewURL,type ViewState} from '../session/state';
import './workspace-upgrades.css';

const Experiments=lazy(()=>import('../experiments/Experiments'));

const ALL: Scope = { cutoff: null, undated: true, group: null };
type Mode = "2d" | "table" | "dual" | "regroup" | "lab";
const readMode=():Mode=>{const m=new URLSearchParams(location.search).get('lens');return ['table','dual','regroup','lab'].includes(m||'')?m as Mode:'2d';};
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
    [history, setHistory] = useState<string[]>([]),
    [pinned, setPinned] = useState<string | null>(initial?.pinned||null);
  const [centerKey, setCenterKey] = useState(0);
  const [readerOpen, setReaderOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [navigationId, setNavigationId] = useState(initial?.focus||initial?.selected||lm.root);
  const [cameraTarget,setCameraTarget]=useState(initial?.focus||initial?.selected||lm.root);
  const [scope, setScope] = useState<Scope>(initial?.scope||ALL),
    [baselineDay, setBaselineDay] = useState<string | null>(initial?.baseline||null),
    [query, setQuery] = useState(""),
    [sourceId, setSourceId] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<"contents" | "links" | "compare">(
    "contents",
  );
  const [textScale,setTextScale]=useState(initial?.textScale||1);
  const [normalized,setNormalized]=useState(initial?.normalized||false);
  const [showRelations,setShowRelations]=useState(false);
  const [task,setTask]=useState<TaskQuery>(emptyTaskQuery);
  const [searchOpen,setSearchOpen]=useState(false);
  const embedded=new URLSearchParams(location.search).get('embed')==='1';
  const search = useRef<HTMLInputElement>(null),
    rail = useRef<HTMLElement>(null);
  const node = lm.nodes.get(selected)!,
    baseline = baselineDay ? { ...scope, cutoff: baselineDay } : null;
  const study = lm.eventFor(node);
  const nearby =
    study && !node.children.length
      ? lm.m
          .resultsFor(study.object_id)
          .map((o) => lm.nodes.get(o.object_id)!)
          .filter((n) => n.id !== selected && lm.eligible(n.id, scope))
      : [];
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
        search.current?.focus({preventScroll:true});
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const selectedInB=lm.eligible(selected,scope);
  const selectedOnlyA=Boolean(mode==='table'&&baseline&&!selectedInB&&lm.eligible(selected,baseline));
  const selectedEligible = selectedInB || selectedOnlyA,
    visibleChildren = node.children.filter((id) => lm.contextual(id, scope));
  const searchResults=useMemo(()=>filterTaskNodes(lm,ALL,{...task,text:query}),[lm,task,query]);
  const visibleResults = lm.m.results.filter((o) =>
    lm.eligible(o.object_id, scope),
  );
  const unknown = lm.m.results.filter(
    (o) => lm.times.get(o.object_id)!.basis === "unknown" && (!scope.group || lm.groupFor(o.object_id)===scope.group),
  ).length;
  const studyGrouped = visibleResults.filter(
    (o) => lm.times.get(o.object_id)!.basis === "study",
  ).length;
  const issueGrouped = visibleResults.filter(o => lm.times.get(o.object_id)!.basis === "issued").length;
  const timeControls = (
    <Timeline
      lm={lm}
      scope={scope}
      baseline={baselineDay}
      onChange={(cutoff) => setScope((s) => ({ ...s, cutoff }))}
      onBaseline={setBaselineDay}
      onClose={timeOpen ? () => setTimeOpen(false) : undefined}
      compact={!timeOpen}
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
  function restore(v:ViewState){setSelected(v.selected);setNavigationId(v.focus);setCameraTarget(v.focus);setPinned(v.pinned);setScope(v.scope);setBaselineDay(v.baseline);setMode(v.mode);setTextScale(v.textScale);setNormalized(v.normalized);setCenterKey(k=>k+1);setSourceId(null);setSearchOpen(false);}
  useEffect(()=>{const pop=()=>{const v=viewFromURL(location.href,lm);if(v)restore(v);setMode(readMode());};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[lm]);
  const openRecord=(id:string)=>{choose(id);setReaderOpen(true);requestAnimationFrame(()=>rail.current?.focus({preventScroll:true}));};
  const openSource=(id:string)=>{openRecord(id);const o=lm.nodes.get(id)?.object;setSourceId(o?lm.m.sourceFor(o)[0]?.id||null:null);};
  if(mode==='lab'||mode==='dual'||mode==='regroup')return <div className={`experiment-app ${embedded?'embedded':''}`} style={{'--lens-font':fontFamily} as CSSProperties}>
    <Suspense fallback={<p role="status">Відкриваємо експеримент…</p>}><Experiments lm={lm} scope={scope} fontFamily={fontFamily} initialVariant={mode} onExit={()=>swapMode('2d')}/></Suspense>
  </div>;
  return (
    <div className={`focus-app ${embedded?'embedded':''} ${timeOpen?'time-is-open':''}`} data-typeface={fontFamily} style={{"--lens-font":fontFamily} as CSSProperties}>
      <a className="skip-link" href="#graph-workspace">До карти й результатів</a>
      <header className="focus-header">
        <button
          className="brand"
          onClick={() => choose(lm.root)}
          aria-label="До всього досьє"
        >
          <Icon type="graph" />
          <strong>MedLens</strong>
        </button>
        <h1>
          Карта пацієнта <span>{data.case_id}</span>
        </h1>
        <span className="prototype-tag">
          HematoBoard · експериментальний перегляд
        </span>
        {!embedded&&<button className="lab-entry" onClick={()=>swapMode('lab')}>Лабораторія варіантів</button>}
      </header>
      <section className="focus-toolbar">
        <nav aria-label="Спосіб перегляду">
          {(
            [
              ["2d", "Лінза 2D"],
              ["table", "Граф + таблиця"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              className={mode === id ? "active" : ""}
              aria-pressed={mode === id}
              aria-label={text}
              onClick={() => swapMode(id)}
            >
              {text}
              {id === "table" && <small>тест</small>}
            </button>
          ))}
        </nav>
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
            placeholder="Показник, дослідження або фрагмент джерела"
            aria-label="Пошук у всьому досьє"
          />
          <kbd>⌘ K</kbd>
        </label>
        {searchOpen&&<section className="search-popover" aria-label="Пошук і прозорий відбір">
          <div className="search-heading"><h2>Знайти у досьє</h2><button aria-label="Закрити пошук" onClick={()=>setSearchOpen(false)}>×</button></div>
          <TaskFilters lm={lm} query={{...task,text:query}} onChange={next=>{setTask(next);setQuery(next.text);}} count={searchResults.length}/>
          <p className="search-count" role="status" aria-live="polite">{searchResults.length} записів · {queryDescription({...task,text:query})}</p>
          <p className="help">Пошук у всьому пакеті. Поточний часовий відбір не приховує знайдені записи; вони позначені окремо.</p>
          <div className="search-results-list">{searchResults.map(n=><NodeRow key={n.id} n={n} lm={lm} scope={scope} onSelect={openRecord}/>)}</div>
          {!searchResults.length&&<p>Нічого не знайдено. Скоротіть запит або скиньте умови.</p>}
        </section>}
        </div>
        <button
          className="time-toggle"
          aria-controls="lens-time-controls"
          aria-expanded={timeOpen}
          onClick={() => setTimeOpen((open) => !open)}
        >
          {scope.cutoff ? `Час: до ${date(scope.cutoff)}` : "Час: усі дати"}
        </button>
        <button
          className="reader-toggle"
          aria-expanded={readerOpen}
          onClick={() => {
            if (!readerOpen) choose(navigationId);
            setReaderOpen((open) => !open);
          }}
        >
          {readerOpen ? "Згорнути дані" : "Дані фокуса"}
        </button>
      </section>
      <div className="focus-filters">
        <div className="domain-filters">
          <button
            aria-pressed={!scope.group}
            onClick={() => setScope((s) => ({ ...s, group: null }))}
          >
            Усе досьє
          </button>
          {lm.groups.map((id) => {
            const n = lm.nodes.get(id)!;
            return (
              <button
                key={id}
                aria-pressed={scope.group === id}
                onClick={() => {
                  setScope((s) => ({
                    ...s,
                    group: s.group === id ? null : id,
                  }));
                  choose(id);
                }}
              >
                <i style={{ background: n.color }} />
                {n.title}
              </button>
            );
          })}
        </div>
        <label>
          <input
            type="checkbox"
            checked={scope.undated}
            onChange={(e) =>
              setScope((s) => ({ ...s, undated: e.target.checked }))
            }
          />
          Без дати <small>{unknown}</small>
        </label>
        <span className="coverage" role="status" aria-live="polite">
          {scope.group==="group:temporal" ? `${lm.m.temporal.filter(o=>lm.eligible(o.object_id,scope)).length} / ${lm.m.temporal.length} порівнянь` : `${visibleResults.length} / ${lm.m.results.length} результатів`}
        </span>
        <div className="workspace-tools">
          <Places lm={lm} current={view} onRestore={restore} history={history} onSelect={openRecord}/>
          <details className="reading-control"><summary>Вигляд</summary><div className="reading-panel">
            <label>Розмір тексту<select aria-label="Масштаб тексту" value={textScale} onChange={e=>setTextScale(Number(e.target.value))}><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option></select></label>
            <label><input type="checkbox" checked={normalized} onChange={e=>setNormalized(e.target.checked)}/>Унормований запис одиниць</label>
            <p>Лише наявна відповідність у пакеті, без перерахунку значень. Оригінал доступний у джерелі.</p>
            <label><input type="checkbox" checked={showRelations} onChange={e=>setShowRelations(e.target.checked)}/>Структурні зв’язки відкритого вузла</label>
            <label><input type="checkbox" disabled/>Гіпотези — не підключені до цього пакета</label>
          </div></details>
        </div>
      </div>
      {timeOpen && timeControls}
      <main
        id="graph-workspace"
        className={`focus-workspace ${readerOpen ? "reader-open" : "reader-closed"}`}
      >
        <section className="graph-workspace" aria-label="Граф і фокус">
          <div className="focus-breadcrumb">
            <button
              aria-label="Назад до попереднього фокуса"
              disabled={!history.length}
              onClick={back}
            >
              <Icon type="back" />
            </button>
            <div>
              {lm
                .ancestors(mode === "table" ? selected : navigationId)
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => choose(n.id)}
                    title={n.title}
                  >
                    {n.title}
                  </button>
                ))}
            </div>
            <button className="reset-focus" onClick={() => choose(lm.root)}>
              Весь граф
            </button>
          </div>
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
              sourceTrace={Boolean(sourceId)}
              onReadSource={openSource}
              onSelect={openRecord}
              onNavigate={choose}
              onFocusChange={setNavigationId}
              onRead={openRecord}
            />
          )}
          <div className="graph-foot">
            <span>
              {mode === "table"
                ? "Групування й атрибути мають спільний вибір"
                : "Перетягуйте лінзу: дані розкриваються в центрі. Натискання відкриває запис."}
            </span>
            <button
              onClick={() => {
                choose(mode === "table" ? selected : navigationId);
                setRailTab("links");
                setReaderOpen(true);
                requestAnimationFrame(() =>
                  rail.current?.scrollIntoView({ block: "nearest" }),
                );
              }}
            >
              Усі зв’язки фокуса
            </button>
          </div>
        </section>
        <aside
          className="focus-rail"
          ref={rail}
          tabIndex={-1}
          aria-label="Вибраний об’єкт і повні дані"
        >
          <div className="mobile-reader-bar"><span>Відкрито: {node.title}</span><button aria-label="Закрити запис" onClick={()=>setReaderOpen(false)}>×</button></div>
          {readerOpen && navigationId !== selected && (
            <div className="reader-context-switch">
              <span><b>Відкрито:</b> {node.title}<br/><b>У лінзі:</b> {lm.nodes.get(navigationId)?.title}</span>
              <button onClick={() => openRecord(navigationId)}>Читати центр</button>
              <button onClick={() => {setNavigationId(selected);setCameraTarget(selected);setCenterKey(k=>k+1);}}>До відкритого</button>
            </div>
          )}
          {pinned && (
            <div className="pinned">
              <Icon type="pin" />
              <button onClick={() => choose(pinned)}>
                {lm.nodes.get(pinned)!.title}
              </button>
              <button
                aria-label="Відкріпити об’єкт"
                onClick={() => setPinned(null)}
              >
                ×
              </button>
            </div>
          )}
          <div className="rail-header">
            <div>
              <h2>
                <NodeGlyph kind={node.kind} color={node.color} />
                {node.kind === "finding" ? "Опис знахідки" : node.title}
              </h2>
              {node.kind !== "finding" && (
                <span className="object-kind">{nodeKinds[node.kind]}</span>
              )}
            </div>
            <button
              className={
                pinned === selected ? "pin-button active" : "pin-button"
              }
              onClick={() => setPinned(pinned === selected ? null : selected)}
              aria-label={
                pinned === selected
                  ? "Відкріпити об’єкт"
                  : "Закріпити об’єкт для порівняння"
              }
            >
              <Icon type="pin" />
            </button>
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
          <nav className="rail-tabs" aria-label="Вміст фокуса">
            <button
              aria-pressed={railTab === "contents"}
              onClick={() => {
                setRailTab("contents");
                setSourceId(null);
              }}
            >
              Дані
            </button>
            <button
              aria-pressed={railTab === "links"}
              onClick={() => {
                setRailTab("links");
                setSourceId(null);
              }}
            >
              Зв’язки
            </button>
            <button
              aria-pressed={railTab === "compare"}
              onClick={() => {
                setRailTab("compare");
                setSourceId(null);
              }}
            >
              Зіставлення
            </button>
          </nav>
          <div className="rail-content">
            {selectedOnlyA&&<p className="comparison-reader-note" role="status">Запис тільки у A · {date(baselineDay)}. Дані та джерело відкриті для зіставлення; відбір B не змінено.</p>}
            {sourceId && selectedEligible ? (
              <>
                <button className="back-text" onClick={() => setSourceId(null)}>
                  <Icon type="back" />
                  До об’єкта
                </button>
                <h3>Точний текст джерела</h3>
                <nav className="source-path" aria-label="Шлях до джерела">{lm.ancestors(selected).filter(n=>n.object).map(n=><button key={n.id} onClick={()=>openRecord(n.id)}>{n.title}</button>)}</nav>
                {data.sources
                  .filter((s) => s.id === sourceId)
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
            ) : railTab === "compare" ? (
              <Comparison
                node={node}
                pinned={pinned ? lm.nodes.get(pinned)! : null}
                lm={lm}
                scope={scope}
                baseline={baseline}
                onSelect={choose}
              />
            ) : (
              <>
                {!selectedEligible && node.object && (
                  <div className="outside">
                    <strong>Запис поза обраним відбором</strong>
                    <p>
                      {lm.times.get(selected)?.text}. Значення й джерела
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
                    onSource={setSourceId}
                    onSelect={choose}
                  />
                )}
                {node.object&&selectedEligible&&<RecordInsights lm={lm} node={node} scope={selectedOnlyA?baseline!:scope} normalized={normalized} onSelect={openRecord}/>}
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
                    <p className="help">
                      Оберіть гілку на карті або в списку. Змінюйте дату внизу —
                      фокус і таблиця залишаться синхронними.
                    </p>
                  </div>
                )}
                {visibleChildren.length > 0 && (
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
                {node.children.length > visibleChildren.length && (
                  <p className="help">
                    Ще {node.children.length - visibleChildren.length} елементів
                    поза відбором.
                  </p>
                )}
                {nearby.length > 0 && (
                  <details className="nearby-results">
                    <summary>
                      Інші результати цього дослідження · {nearby.length}
                    </summary>
                    {nearby.map((n) => (
                      <NodeRow
                        key={n.id}
                        n={n}
                        lm={lm}
                        scope={scope}
                        onSelect={choose}
                      />
                    ))}
                  </details>
                )}
              </>
            )}
          </div>
        </aside>
      </main>
      {!timeOpen && timeControls}
      <div className="focus-footer">
        <span>
          {data.objects.length} об’єктів · {data.edges.length} структурних
          зв’язків · {data.graph_hash.slice(0, 8)}
        </span>
        <span>
          {studyGrouped
            ? `${studyGrouped} результатів згруповано за датою дослідження; власна дата відсутня. `
            : ""}
          {issueGrouped ? `${issueGrouped} результатів — за датою видачі. ` : ""}
          Публічний знімок · без гіпотез · не для клінічних рішень.
        </span>
      </div>
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
  onSource,
  onSelect,
  normalized=false,
}: {
  n: LensNode;
  lm: LensModel;
  onSource: (id: string) => void;
  onSelect: (id: string) => void;
  normalized?: boolean;
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
          <span>{unitDisplay(o,normalized) || "одиницю не зазначено"}</span>
        </div>
      )}
      {n.kind === "finding" && <p className="finding-full">{n.title}</p>}
      {!["patient"].includes(n.kind) && (
        <dl>
          <dt>Дата</dt>
          <dd>
            {t.text}
            {t.basis === "study" && <small>Власної дати запису немає.</small>}
            {t.basis === "issued" && <small>Клінічна дата не визначена. Для відбору використано дату видачі дослідження.</small>}
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
      {n.kind === "clinical_event" && o.payload.times?.length > 0 && (
        <div className="event-times">
          {o.payload.times.map((v: any, i: number) => (
            <span key={i}>
              {timeRoles[v.kind] || v.kind}: {date(v.date)}
            </span>
          ))}
        </div>
      )}
      {lm.m.sourceFor(o).length > 0 && (
        <div className="source-links">
          {lm.m.sourceFor(o).map((s) => (
            <button key={s.id} onClick={() => onSource(s.id)}>
              <Icon type="source" />
              <span>
                Сторінка {s.derived_pdf_page ?? "не зазначена"} · запис{" "}
                {s.source_order}
              </span>
              <b>›</b>
            </button>
          ))}
        </div>
      )}
      {n.kind !== "patient" && (
        <details>
          <summary>Повні поля запису</summary>
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
function Comparison({
  node,
  pinned,
  lm,
  scope,
  baseline,
  onSelect,
}: {
  node: LensNode;
  pinned: LensNode | null;
  lm: LensModel;
  scope: Scope;
  baseline: Scope | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <h3>Зіставлення фокусів</h3>
      {pinned && pinned.id !== node.id ? (
        <div className="compare-pair">
          {[pinned, node].map((n, i) => (
            <section key={n.id}>
              <small>{i ? "Поточний фокус" : "Закріплений фокус"}</small>
              <h4>{n.title}</h4>
              <p>
                {lm.eligible(n.id, scope) ? lm.summary(n) : "Поза відбором"}
              </p>
              <p>{lm.times.get(n.id)?.text}</p>
              <button onClick={() => onSelect(n.id)}>У фокус</button>
            </section>
          ))}
        </div>
      ) : (
        <p className="help">
          Закріпіть один об’єкт кнопкою поруч із заголовком, потім виберіть
          інший.
        </p>
      )}
      <h3>Два часові відбори</h3>
      {baseline ? (
        <>
          <p>
            A: {date(baseline.cutoff)}
            <br />
            B: {scope.cutoff ? date(scope.cutoff) : "усі дати"}
          </p>
          <p className="help">
            У режимі «Граф + таблиця» видно належність кожного об’єкта до A та
            B. Порівнюється склад записів поточної ревізії, не реконструйований
            фізіологічний стан.
          </p>
        </>
      ) : (
        <p className="help">
          Відкрийте «Час», виберіть дату й натисніть «Зафіксувати цю дату як A».
          Потім виберіть дату B. Таблиця покаже записи обох відборів.
        </p>
      )}
    </>
  );
}
function SourceLiteral({literal,target}:{literal:string;target:string}){
  // Mark only an exact literal match; no rewritten or generated source text.
  const at=target&&target!=='—'?literal.indexOf(target):-1;
  return at<0?<>{literal}</>:<>{literal.slice(0,at)}<mark>{literal.slice(at,at+target.length)}</mark>{literal.slice(at+target.length)}</>;
}
createRoot(document.getElementById("root")!).render(<App />);
