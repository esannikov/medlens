import { kindNames } from "../model.ts";
import { type LensModel } from "../focus/model.ts";
import { emptyTaskQuery, queryDescription, queryErrors, type TaskQuery } from "./query.ts";

export function TaskFilters({lm, query, onChange, count}: {
  lm: LensModel; query: TaskQuery; onChange: (next: TaskQuery) => void; count: number;
}) {
  const errors = queryErrors(query);
  const update = (patch: Partial<TaskQuery>) => onChange({...query, ...patch});
  const active = Boolean(query.domain || query.from || query.to || query.basis !== "all" || query.kinds.length);
  return <details className="task-filters">
    <summary>Уточнити пошук{active ? " · застосовано" : ""}</summary>
    <div className="filter-grid">
      <label>Група<select value={query.domain} onChange={e => update({domain: e.target.value})}>
        <option value="">Усі групи</option>{lm.groups.map(id => <option key={id} value={id}>{lm.nodes.get(id)!.title}</option>)}
      </select></label>
      <label>Підстава дати<select value={query.basis} onChange={e => update({basis: e.target.value as TaskQuery["basis"]})}>
        <option value="all">Усі підстави</option><option value="clinical">Клінічна дата</option>
        <option value="issued">Дата видачі</option><option value="unknown">Без визначеної дати</option>
      </select></label>
      <label>Від<input type="date" value={query.from} aria-invalid={errors.length > 0} onChange={e => update({from: e.target.value})}/></label>
      <label>До включно<input type="date" value={query.to} aria-invalid={errors.length > 0} onChange={e => update({to: e.target.value})}/></label>
    </div>
    <fieldset><legend>Типи записів · без позначок показано всі</legend>
      {[...new Set(lm.order.filter(n => n.object && n.kind !== "patient").map(n => n.kind))].map(kind => <label key={kind}>
        <input type="checkbox" checked={query.kinds.includes(kind)} onChange={e => update({kinds: e.target.checked ? [...query.kinds, kind] : query.kinds.filter(k => k !== kind)})}/>{kindNames[kind]}
      </label>)}
    </fieldset>
    <p>{queryDescription(query)}</p>
    {errors.length > 0 && <p role="alert">{errors.join(" ")}</p>}
    <div className="task-filter-foot"><span role="status" aria-live="polite" aria-atomic="true">Знайдено записів: {count}</span>
      <button onClick={() => onChange({...emptyTaskQuery(), text: query.text})}>Скинути уточнення</button>
    </div>
  </details>;
}
