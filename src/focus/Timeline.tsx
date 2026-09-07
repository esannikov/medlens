import { date } from "../model.ts";
import { compareScopes, type LensModel, type Scope } from "./model.ts";
import { timelineCounts } from "../features/time.ts";

export function Timeline({
  lm,
  scope,
  baseline,
  onChange,
  onBaseline,
  onClose,
  compact = false,
}: {
  lm: LensModel;
  scope: Scope;
  baseline: string | null;
  onChange: (day: string | null) => void;
  onBaseline: (day: string | null) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const days = lm.days,
    first = days[0],
    last = days[days.length - 1],
    current = scope.cutoff || last;
  if (!days.length)
    return (
      <footer id="lens-time-controls" className="timeline">
        <strong>Дати для відбору не визначені.</strong>
        <span>Усі записи доступні у відборі «Без дати».</span>
      </footer>
    );
  const counts = lm.count(lm.root, scope),
    difference = baseline
      ? compareScopes(lm, { ...scope, cutoff: baseline }, scope)
      : null;
  const basisCounts = timelineCounts(lm, scope);
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
      className={`timeline ${onClose ? "timeline-expanded" : ""} ${compact ? "timeline-compact" : ""}`}
      aria-label="Спільний часовий відбір"
    >
      <div className="time-summary">
        <div>
          <strong>
            {scope.cutoff
              ? `Записи до ${date(scope.cutoff)}`
              : "Усі дати записів"}
          </strong>
          <span>
            {temporalScope ? `${lm.m.temporal.filter(o=>lm.eligible(o.object_id,scope)).length} із ${lm.m.temporal.length} порівнянь · від дати пізнішого запису` : `${basisCounts.clinical} за клінічною датою · ${basisCounts.issued} за видачею · ${basisCounts.unknown} без дати`}
          </span>
          {!temporalScope && !compact && <span>{counts.visibleResults} із {counts.results} результатів у відборі</span>}
        </div>
        <div className="time-buttons">
          <button
            aria-label="Попередня наявна дата записів"
            onClick={() => jump(-1)}
            disabled={current <= first}
          >
            ←
          </button>
          <input
            aria-label="Кінцева дата відбору"
            type="date"
            min={first}
            max={last}
            value={current}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
          <button
            aria-label="Наступна наявна дата записів"
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
            {baseline ? "Скасувати порівняння" : "Зафіксувати цю дату як A"}
          </button>
          {onClose && <button onClick={onClose}>Повернутись до лінзи</button>}
        </div>
      </div>
      {!compact && <div className="time-rail">
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
          aria-valuetext={scope.cutoff ? `До ${date(scope.cutoff)} включно` : `Усі дати до ${date(last)}`}
          type="range"
          min={min}
          max={max}
          disabled={days.length < 2}
          step={86400000}
          value={epoch(current)}
          onChange={(e) =>
            onChange(new Date(+e.target.value).toISOString().slice(0, 10))
          }
        />
      </div>}
      {!compact && <p className="time-explanation">
        {baseline
          ? `Дата A — ${date(baseline)}. Тепер оберіть другу дату B. У таблиці можна зіставити склад записів.`
          : "Оберіть дату: залишаться записи до неї включно. «Усі дати» скасовує цей відбір."}{" "}
        Якщо клінічної дати немає, використано дату видачі з позначкою «видано». Записи без обох дат керуються перемикачем «Без дати».
      </p>}
      {!compact && <div className="time-foot">
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
      </div>}
    </footer>
  );
}
