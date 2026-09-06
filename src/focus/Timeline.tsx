import { date } from "../model.ts";
import { compareScopes, type LensModel, type Scope } from "./model.ts";

export function Timeline({
  lm,
  scope,
  baseline,
  onChange,
  onBaseline,
  onClose,
}: {
  lm: LensModel;
  scope: Scope;
  baseline: string | null;
  onChange: (day: string | null) => void;
  onBaseline: (day: string | null) => void;
  onClose?: () => void;
}) {
  const days = lm.days,
    first = days[0],
    last = days[days.length - 1],
    current = scope.cutoff || last;
  if (!days.length)
    return (
      <footer id="lens-time-controls" className="timeline">
        <strong>Клінічні дати не визначені.</strong>
        <span>Усі записи доступні у відборі «Без дати».</span>
      </footer>
    );
  const counts = lm.count(lm.root, scope),
    difference = baseline
      ? compareScopes(lm, { ...scope, cutoff: baseline }, scope)
      : null;
  const undated = lm.m.results.filter(
    (o) =>
      lm.eligible(o.object_id, scope) &&
      lm.times.get(o.object_id)?.basis === "unknown",
  ).length;
  const temporalScope = scope.group === "group:temporal";
  const epoch = (s: string) => Date.parse(`${s}T00:00:00Z`),
    min = epoch(first),
    max = epoch(last),
    span = Math.max(86400000, max - min);
  const percent = (s: string) => ((epoch(s) - min) / span) * 100;
  const jump = (direction: -1 | 1) => {
    const next =
      direction > 0
        ? days.find((d) => d > current)
        : [...days].reverse().find((d) => d < current);
    if (next) onChange(next);
  };
  return (
    <footer
      id="lens-time-controls"
      className={`timeline ${onClose ? "timeline-expanded" : ""}`}
      aria-label="Спільний часовий відбір"
    >
      <div className="time-summary">
        <div>
          <strong>
            {scope.cutoff
              ? `Записи до ${date(scope.cutoff)}`
              : "Усі клінічні дати"}
          </strong>
          <span>
            {temporalScope ? `${lm.m.temporal.filter(o=>lm.eligible(o.object_id,scope)).length} із ${lm.m.temporal.length} порівнянь · від дати пізнішого запису` : `${counts.visibleResults-undated} датованих + ${undated} без дати · ${counts.visibleResults} із ${counts.results} результатів`}
          </span>
        </div>
        <div className="time-buttons">
          <button
            aria-label="Попередня дата дослідження"
            onClick={() => jump(-1)}
            disabled={current <= first}
          >
            ←
          </button>
          <input
            aria-label="Кінцева клінічна дата"
            type="date"
            min={first}
            max={last}
            value={current}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
          <button
            aria-label="Наступна дата дослідження"
            onClick={() => jump(1)}
            disabled={current >= last}
          >
            →
          </button>
          <button
            className={!scope.cutoff ? "active" : ""}
            onClick={() => onChange(null)}
          >
            Усі дати
          </button>
          <button
            className={baseline ? "active" : ""}
            onClick={() => onBaseline(baseline ? null : current)}
          >
            {baseline ? "Скасувати порівняння" : "Порівняти з цією датою"}
          </button>
          {onClose && <button onClick={onClose}>Повернутись до лінзи</button>}
        </div>
      </div>
      <div className="time-rail">
        <div className="time-fill" style={{ width: `${percent(current)}%` }} />
        {days.map((d) => (
          <button
            key={d}
            className="date-tick"
            title={date(d)}
            aria-label={`До ${date(d)}`}
            style={{ left: `${percent(d)}%` }}
            onClick={() => onChange(d)}
          />
        ))}
        {baseline && (
          <span
            className="baseline-tick"
            style={{ left: `${percent(baseline)}%` }}
            title={`A: ${date(baseline)}`}
          >
            A
          </span>
        )}
        <input
          aria-label="Часовий курсор"
          type="range"
          min={min}
          max={max || min + 86400000}
          step={86400000}
          value={epoch(current)}
          onChange={(e) =>
            onChange(new Date(+e.target.value).toISOString().slice(0, 10))
          }
        />
      </div>
      <p className="time-explanation">
        {baseline
          ? `Дата A — ${date(baseline)}. Тепер оберіть другу дату B. У таблиці можна зіставити склад записів.`
          : "Оберіть дату: залишаться записи до неї включно. «Усі дати» скасовує цей відбір."}{" "}
        Записи без дати керуються окремим перемикачем «Без дати».
      </p>
      <div className="time-foot">
        <span>{date(first)}</span>
        {difference ? (
          <span className="time-comparison">
            A: {date(baseline)} · B:{" "}
            {scope.cutoff ? date(scope.cutoff) : "усі дати"} · лише у B:{" "}
            {difference.onlyB.length} записів · лише у A:{" "}
            {difference.onlyA.length}
          </span>
        ) : (
          <span>
            Відбір записів за датою; значення аналізів не продовжуються між
            вимірюваннями
          </span>
        )}
        <span>{date(last)}</span>
      </div>
    </footer>
  );
}
