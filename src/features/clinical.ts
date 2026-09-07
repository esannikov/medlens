import { label, type Obj } from "../model.ts";
import { type DateInfo, type LensModel, type LensNode, type Scope } from "../focus/model.ts";
import { validDay } from "./query.ts";

const supplied = (v: unknown): v is string => typeof v === "string" && Boolean(v.trim());
const exactText = (v: unknown) => supplied(v) ? v.normalize("NFC").trim() : null;
const readableUnits: Record<string, string> = {
  "10*9/L": "10⁹/л", "10*12/L": "10¹²/л", "g/L": "г/л", "mg/L": "мг/л",
  "ug/L": "мкг/л", "umol/L": "мкмоль/л", "mmol/L": "ммоль/л", "mm/h": "мм/год",
};
const sameScaleAliases:Record<string,string[]>={
  '10*9/L':['Г/л','×10⁹/л','10⁹/л'], '10*12/L':['Т/л','×10¹²/л','10¹²/л'],
  'g/L':['г/л'], 'mg/L':['мг/л'], 'ug/L':['мкг/л'], 'umol/L':['мкмоль/л'],
  'mmol/L':['ммоль/л'], 'mm/h':['мм/год'],
};

/** Presentation only: use a supplied canonical unit; never derive units or convert values. */
export function unitDisplay(o: Obj, normalized = false): string {
  const canonical = exactText(o.payload.canonical_unit);
  const source=exactText(o.payload.source_unit);
  // Normalizing spelling is safe only for known same-scale notation. Merely
  // supplying a canonical unit does not authorize changing the value's scale.
  if (normalized && canonical && source && (source===canonical || sameScaleAliases[canonical]?.includes(source))) return readableUnits[canonical] || canonical;
  return supplied(o.payload.source_unit) ? o.payload.source_unit : "Не зазначено";
}

export const basisLabel = (basis: DateInfo["basis"]) => ({
  own: "клінічна дата запису", study: "клінічна дата дослідження", issued: "дата видачі",
  comparison: "дата пізнішого запису порівняння", unknown: "дату не визначено", none: "дата не застосовується",
})[basis];

/** Only present states supplied by the record. A source receipt is not clinical acceptance. */
export function recordStates(o: Obj) {
  const states = (key: string) => {
    const entries = [o.provenance[key], o.payload[key]].filter(supplied);
    return [...new Set(entries)].join(" / ") || "not supplied";
  };
  return {
    assertion: states("assertion_mode"),
    verification: states("verification_state"),
    compatibility: supplied(o.payload.compatibility_receipt?.status)
      ? o.payload.compatibility_receipt.status as string : "not supplied",
  };
}

export const stateLabel = (state: string) => ({
  "not supplied": "не надано", source_stated: "зазначено у джерелі",
  source_verified: "звірено з джерелом", partial: "часткова", compatible: "сумісна",
  incompatible: "несумісна", unknown: "невідома", inferred: "виведене твердження",
} as Record<string, string>)[state] || state;

/** Keep literal identity alongside supplied coding: candidate mappings never merge aliases. */
export function analyteIdentity(o: Obj): string | null {
  if (o.object_type !== "observation") return null;
  const concept = o.payload.concept, literal = exactText(concept?.source_literal);
  if (!literal) return null;
  const coding = concept?.coding;
  return JSON.stringify([literal, exactText(coding?.system), exactText(coding?.code),
    exactText(coding?.version), exactText(concept?.mapping_status)]);
}

export type QualityFlag = { code: string; label: string; detail: string; relatedIds?: string[] };

export function sharedSourceCandidates(lm: LensModel, node: LensNode): LensNode[] {
  const o = node.object;
  if (!o || !["observation", "finding"].includes(o.object_type)) return [];
  const sources = new Set(lm.m.sourceFor(o).map(s => s.id));
  if (!sources.size) return [];
  return lm.order.filter(n => n.id !== node.id && n.kind === node.kind && n.object &&
    (o.object_type === "observation" ? analyteIdentity(n.object) === analyteIdentity(o) && Boolean(analyteIdentity(o))
      : label(n.object) === label(o)) && lm.m.sourceFor(n.object).some(s => sources.has(s.id)));
}

export function recordQuality(lm: LensModel, node: LensNode): QualityFlag[] {
  const o = node.object;
  if (!o) return [];
  const flags: QualityFlag[] = [], time = lm.times.get(node.id), states = recordStates(o);
  if (o.object_type === "observation" && typeof o.payload.value?.number === 'number' && !supplied(o.payload.source_unit)) flags.push({
    code: "missing_unit", label: "Одиницю окремо не зазначено",
    detail: "Поле одиниці джерела порожнє. Одиниця може бути частиною дослівного значення; автоматично її не виділяємо.",
  });
  const related = sharedSourceCandidates(lm, node);
  if (related.length) flags.push({
    code: "shared_source", label: "Можливий повтор зі спільного джерела",
    detail: "Записи мають ту саму точну назву показника та спільний фрагмент джерела. Це привід перевірити повтор; усі записи залишено окремо.",
    relatedIds: related.map(n => n.id),
  });
  if (time?.basis === "issued") flags.push({
    code: "issued_date", label: "Відбір за датою видачі",
    detail: "Клінічної дати немає. Дата видачі впорядковує документи і не визначає дату вимірювання.",
  });
  if (time?.basis === "unknown") flags.push({
    code: "unknown_date", label: "Дата не визначена", detail: "У записі та його дослідженні немає придатної клінічної дати або однозначної дати видачі.",
  });
  if (states.assertion === "not supplied") flags.push({code: "assertion_missing", label: "Статус твердження не надано", detail: "Поле assertion_mode відсутнє."});
  if (states.verification === "not supplied") flags.push({code: "verification_missing", label: "Статус перевірки не надано", detail: "Поле verification_state відсутнє."});
  return flags;
}

function stableValue(value: unknown): string | null {
  if (supplied(value)) return ["unknown", "not_recorded", "not supplied", "not_supplied"].includes(value.trim()) ? null : value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const record = value as Record<string, unknown>;
  // A status-only object does not identify a measurement method.
  return entries.length && [record.code, record.source_literal, record.text, record.name].some(supplied) ? JSON.stringify(entries) : null;
}

export function materialIdentity(lm: LensModel, o: Obj): string | null {
  const specimen = lm.m.specimenFor(o);
  if (!specimen) return null;
  const type = exactText(specimen.payload.specimen_type), literal = exactText(specimen.payload.source_literal);
  return type && type !== "unknown" && literal ? JSON.stringify([type, literal]) : null;
}

export type SeriesPoint = {
  id: string; object: Obj; day: string | null; basis: DateInfo["basis"];
  value: number | null; sourceIds: string[];
};
export type SeriesExclusion = { id: string; reasons: string[] };
export type ComparableSeries = {
  points: SeriesPoint[]; allPoints: SeriesPoint[]; excluded: SeriesExclusion[];
  reason: string | null; caption: string;
};

/** Exact structural comparison, with explicit unknowns. No parsed text numbers or date interpolation. */
export function comparableSeries(lm: LensModel, node: LensNode, scope: Scope): ComparableSeries {
  const caption = "Однакові назва й кодування, матеріал, одиниця джерела та зазначений метод. Тільки числові значення з клінічною датою; лінії між точками не проводяться.";
  const o = node.object, identity = o && analyteIdentity(o);
  const result: ComparableSeries = {points: [], allPoints: [], excluded: [], reason: null, caption};
  if (!o || !identity) return {...result, reason: "Для серії потрібен запис показника з точною назвою."};
  const material = materialIdentity(lm, o), unit = exactText(o.payload.source_unit), method = stableValue(o.payload.method);
  const anchorProblems = [!material && "матеріал не визначено", !unit && "одиницю джерела не зазначено", !method && "метод не зазначено"].filter(Boolean);
  for (const n of lm.order) {
    if (!n.object || analyteIdentity(n.object) !== identity) continue;
    const next = n.object, time = lm.times.get(n.id)!, number = next.payload.value?.number;
    const point: SeriesPoint = {id: n.id, object: next, day: time.day, basis: time.basis,
      value: typeof number === "number" && Number.isFinite(number) ? number : null,
      sourceIds: lm.m.sourceFor(next).map(s => s.id)};
    result.allPoints.push(point);
    const reasons: string[] = [];
    if (!lm.eligible(n.id, scope)) reasons.push("Поза поточним відбором");
    if (point.value === null) reasons.push("Точного числового поля немає");
    if (next.payload.comparator && !["eq", "="].includes(next.payload.comparator)) reasons.push("Граничне значення з компаратором");
    if (!material || !materialIdentity(lm, next)) reasons.push("Матеріал не визначено");
    else if (materialIdentity(lm, next) !== material) reasons.push("Інший матеріал або його точний опис");
    if (!unit || !exactText(next.payload.source_unit)) reasons.push("Одиницю джерела не зазначено");
    else if (exactText(next.payload.source_unit) !== unit) reasons.push("Інша одиниця джерела; перерахунок не виконується");
    if (!method || !stableValue(next.payload.method)) reasons.push("Метод не зазначено; сумісність не підтверджено");
    else if (stableValue(next.payload.method) !== method) reasons.push("Інший метод");
    if (!time.day || !validDay(time.day) || !["own", "study"].includes(time.basis)) reasons.push(time.basis === "issued" ? "Є тільки дата видачі, дата вимірювання невідома" : "Придатної клінічної дати немає");
    if (!point.sourceIds.length) reasons.push("Фрагмент джерела не надано");
    if (sharedSourceCandidates(lm, n).length) reasons.push("Можливий повтор зі спільного джерела потребує перевірки");
    if (reasons.length) result.excluded.push({id: n.id, reasons}); else result.points.push(point);
  }
  const chronological = (a: SeriesPoint, b: SeriesPoint) => (a.day || "9999").localeCompare(b.day || "9999") || a.id.localeCompare(b.id);
  result.points.sort(chronological);
  result.allPoints.sort(chronological);
  if (anchorProblems.length) result.reason = `Порівнюваність не підтверджено: ${anchorProblems.join("; ")}.`;
  else if (result.points.length < 2) result.reason = "Менше двох сумісних числових записів із клінічними датами. Причини для кожного запису наведено нижче.";
  else if (new Set(result.points.map(p => p.day)).size < 2) result.reason = "Усі сумісні записи мають одну дату; зміна в часі не визначена.";
  return result;
}
