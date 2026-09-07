import { useEffect, useRef, useState, type CSSProperties } from "react";
import { kindNames, reference, value } from "../model.ts";
import { type LensModel, type Scope } from "./model.ts";
import { unitDisplay } from "../features/clinical.ts";
import { comparisonRows, tableMembership } from "../features/table.ts";
export { comparisonRows, tableMembership } from "../features/table.ts";

export function TreeTable({
  lm,
  scope,
  selected,
  baseline,
  onSelect,
  normalized = false,
}: {
  lm: LensModel;
  scope: Scope;
  selected: string;
  baseline: Scope | null;
  onSelect: (id: string) => void;
  normalized?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCollapsed(previous => { const next = new Set(previous); lm.ancestors(selected).forEach(n => next.delete(n.id)); return next; });
    const frame = requestAnimationFrame(() => {
      const container = scroll.current, row = container?.querySelector<HTMLElement>(`[data-table-object="${CSS.escape(selected)}"]`);
      if (container && row) container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 2 + row.clientHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, lm, scope.cutoff, scope.group, scope.undated, baseline?.cutoff, baseline?.group, baseline?.undated]);
  const hiddenByParent = (id: string) =>
    lm
      .ancestors(id)
      .slice(0, -1)
      .some((n) => collapsed.has(n.id));
  const rows = comparisonRows(lm, scope, baseline).filter(n => !hiddenByParent(n.id));
  return (
    <section className="table-view" aria-label="Граф із таблицею атрибутів">
      <div className="table-actions">
        <span>{baseline ? "Усі записи з A або B та їхні батьківські групи" : "Записи поточного відбору та їхні батьківські групи"}</span>
        <button onClick={() => setCollapsed(new Set())}>Розкрити все</button>
        <button onClick={() => setCollapsed(new Set(lm.groups))}>
          Згорнути групи
        </button>
      </div>
      <p className="table-scroll-hint" id="table-scroll-hint">Назва відкриває запис і джерело. + / − розгортає групу. Прокрутіть убік для інших полів.</p>
      <div className="table-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Рядки графа та атрибути" aria-describedby="table-scroll-hint">
        <table data-comparing={Boolean(baseline)}>
          <thead>
            <tr>
              <th>Об’єкт і його належність</th>
              <th>Результат</th>
              <th>Одиниця</th>
              <th>Тип</th>
              <th>Референс джерела</th>
              <th>Дата / підстава</th>
              {baseline && <th>Відбір A</th>}
              <th>{baseline ? "Відбір B" : "Джерела"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr
                key={n.id}
                data-table-object={n.id}
                data-graph-object={n.object?.object_id}
                className={`${selected === n.id ? "selected" : ""} ${!n.object ? "group-row" : ""}`}
              >
                <td>
                  <div
                    className="tree-cell"
                    style={{ "--tree-depth": n.depth } as CSSProperties}
                  >
                    {n.children.length ? (
                      <button
                        className="tree-toggle"
                        aria-label={`${collapsed.has(n.id) ? "Розкрити" : "Згорнути"} ${n.title}`}
                        aria-expanded={!collapsed.has(n.id)}
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(n.id) ? "+" : "−"}
                      </button>
                    ) : (
                      <span className="tree-terminal" aria-hidden="true" />
                    )}
                    <button
                      className="table-name"
                      onClick={() => onSelect(n.id)}
                      title={n.title}
                      aria-label={`Відкрити ${n.title}`}
                    >
                      <i style={{ background: n.color }} />
                      <span>{n.title}</span>
                    </button>
                  </div>
                </td>
                <td className="numeric">
                  {n.kind === "observation"
                    ? value(n.object!)
                    : n.kind === "temporal_relation"
                      ? n.object!.payload.compatibility_receipt?.status ===
                        "partial"
                        ? "Часткова сумісність"
                        : "Зв’язок"
                      : n.kind === "clinical_event"
                        ? lm.summary(n)
                        : "—"}
                </td>
                <td>{n.kind === "observation" ? unitDisplay(n.object!, normalized) : "—"}</td>
                <td>{n.kind === "group" ? "Групування" : kindNames[n.kind]}</td>
                <td>{n.kind === "observation" ? reference(n.object!) : "—"}</td>
                <td>{lm.times.get(n.id)?.text || "—"}</td>
                {baseline && (
                  <td className={!lm.eligible(n.id, baseline) ? "muted" : ""}>
                    {tableMembership(lm, n.id, baseline)}
                  </td>
                )}
                <td className={baseline && !lm.eligible(n.id, scope) ? "muted" : ""}>
                  {baseline
                    ? tableMembership(lm, n.id, scope)
                    : n.object
                      ? lm.m.sourceFor(n.object).length || "—"
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
