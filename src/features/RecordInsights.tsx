import { date, label, value } from "../model.ts";
import { type LensModel, type LensNode, type Scope } from "../focus/model.ts";
import { basisLabel, comparableSeries, recordQuality, recordStates, stateLabel, unitDisplay } from "./clinical.ts";

export function RecordInsights({ lm, node, scope, onSelect, normalized = false }: {
  lm: LensModel; node: LensNode; scope: Scope; onSelect: (id: string) => void; normalized?: boolean;
}) {
  const object = node.object;
  if (!object || node.kind === "patient") return null;
  const flags = recordQuality(lm, node), states = recordStates(object);
  const series = node.kind === "observation" ? comparableSeries(lm, node, scope) : null;
  const plotted = series && !series.reason ? series.points : [];
  const values = plotted.map(p => p.value!), timestamps = plotted.map(p => Date.parse(`${p.day}T00:00:00Z`));
  const low = Math.min(...values), high = Math.max(...values), first = Math.min(...timestamps), last = Math.max(...timestamps);
  return <section className="record-insights" aria-label="Якість та зіставлення запису">
    <h3>Поля запису</h3>
    <dl className="record-states">
      <div><dt>Твердження</dt><dd>{stateLabel(states.assertion)}</dd></div>
      <div><dt>Перевірка</dt><dd>{stateLabel(states.verification)}</dd></div>
      <div><dt>Сумісність у джерелі</dt><dd>{stateLabel(states.compatibility)}</dd></div>
      {node.kind === "observation" && <div><dt>Одиниця</dt><dd>{unitDisplay(object, normalized)}{normalized && object.payload.canonical_unit && <small>Канонічний запис: {object.payload.canonical_unit} · у джерелі: {unitDisplay(object)}</small>}</dd></div>}
    </dl>
    {flags.length > 0 && <ul className="quality-list">{flags.map(flag => <li key={flag.code} data-quality={flag.code}>
      <strong>{flag.label}</strong><span>{flag.detail}</span>
      {flag.relatedIds?.map(id => <button key={id} onClick={() => onSelect(id)}>Відкрити пов’язаний запис · {lm.times.get(id)?.text || "без дати"}</button>)}
    </li>)}</ul>}
    {series && <section className="record-series" aria-label="Зіставлення точних записів показника">
      <h3>Записи цього показника · {series.allPoints.length}</h3>
      {series.reason && <p className="series-status">{series.reason}</p>}
      {plotted.length > 1 && <>
        <svg className="series-points" viewBox="0 0 320 120" role="group" aria-label={`${label(object)}: ${plotted.length} сумісних вимірювань. Точні значення й джерела наведено списком нижче.`}>
          <line x1="38" y1="88" x2="306" y2="88" stroke="currentColor" opacity=".25" />
          <text x="4" y="19" fontSize="10">{new Intl.NumberFormat("uk-UA").format(high)}</text>
          <text x="4" y="90" fontSize="10">{new Intl.NumberFormat("uk-UA").format(low)}</text>
          {plotted.map((point, i) => <g key={point.id} role="button" tabIndex={0} data-series-point={point.id}
            aria-label={`Відкрити вимірювання ${date(point.day)}: ${value(point.object)} ${unitDisplay(point.object, normalized)}`}
            onClick={()=>onSelect(point.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(point.id);}}}>
            <circle cx={44 + (timestamps[i] - first) / Math.max(1, last - first) * 252} cy={high === low ? 52 : 88 - (point.value! - low) / (high - low) * 68} r="14" fill="transparent" />
            <circle cx={44 + (timestamps[i] - first) / Math.max(1, last - first) * 252} cy={high === low ? 52 : 88 - (point.value! - low) / (high - low) * 68} r="4" fill="currentColor">
              <title>{date(point.day)} · {value(point.object)} {unitDisplay(point.object, normalized)} · {basisLabel(point.basis)}</title>
            </circle>
          </g>)}
          <text x="38" y="110" fontSize="10">{date(plotted[0].day)}</text>
          <text x="306" y="110" fontSize="10" textAnchor="end">{date(plotted.at(-1)!.day)}</text>
        </svg>
        <p>{series.caption}</p>
      </>}
      <ul className="series-records">{series.allPoints.map(point => {
        const excluded = series.excluded.find(e => e.id === point.id);
        const specimen = lm.m.specimenFor(point.object);
        return <li key={point.id} data-series-record={point.id}>
          <button className="series-record-open" onClick={() => onSelect(point.id)} aria-current={point.id === node.id ? "true" : undefined}>
            <strong>{value(point.object)} {unitDisplay(point.object, normalized)}</strong>
            <span>{date(point.day)} · {basisLabel(point.basis)}</span>
          </button>
          <span>{specimen ? label(specimen) : "Матеріал не зазначено"} · метод: {typeof point.object.payload.method === "string" ? point.object.payload.method : point.object.payload.method ? JSON.stringify(point.object.payload.method) : "не зазначено"}</span>
          <small>Джерела: {point.sourceIds.join(", ") || "не надано"}</small>
          {excluded && <small className="series-exclusion">{excluded.reasons.join(" · ")}</small>}
        </li>;
      })}</ul>
      <small>Натисніть значення, щоб відкрити запис і дослівний фрагмент. Дати видачі позначають документи; їх не використано для графіка вимірювань.</small>
    </section>}
  </section>;
}
