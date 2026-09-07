import { type LensModel, type LensNode, type Scope } from "../focus/model.ts";

export type TaskQuery = {
  text: string; domain: string; from: string; to: string;
  basis: "all" | "clinical" | "issued" | "unknown"; kinds: string[];
};
export const emptyTaskQuery = (): TaskQuery => ({text: "", domain: "", from: "", to: "", basis: "all", kinds: []});

export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const epoch = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === day;
}

export function queryErrors(query: TaskQuery): string[] {
  const errors = [];
  if (query.from && !validDay(query.from)) errors.push("Початкова дата некоректна.");
  if (query.to && !validDay(query.to)) errors.push("Кінцева дата некоректна.");
  if (query.from && query.to && query.from > query.to) errors.push("Початкова дата пізніша за кінцеву.");
  return errors;
}

/** AND across controls and text tokens. Display date basis is retained; undated rows fail date ranges. */
export function filterTaskNodes(lm: LensModel, scope: Scope, query: TaskQuery): LensNode[] {
  if (queryErrors(query).length) return [];
  return lm.order.filter(node => {
    if (!node.object || node.kind === "patient" || !lm.eligible(node.id, scope)) return false;
    if (query.domain && lm.groupFor(node.id) !== query.domain) return false;
    if (query.kinds.length && !query.kinds.includes(node.kind)) return false;
    const time = lm.times.get(node.id)!;
    if (query.basis === "clinical" && !["own", "study"].includes(time.basis)) return false;
    if (query.basis === "issued" && time.basis !== "issued") return false;
    if (query.basis === "unknown" && time.basis !== "unknown") return false;
    if ((query.from || query.to) && (!time.day || !validDay(time.day))) return false;
    if (query.from && time.day! < query.from) return false;
    if (query.to && time.day! > query.to) return false;
    return !query.text.trim() || lm.matches(node.id, query.text);
  });
}

export function queryDescription(query: TaskQuery): string {
  const parts = ["Усі умови діють разом."];
  if (query.text.trim()) parts.push("Усі слова мають трапитися в назві, значенні, матеріалі, даті або дослівному джерелі.");
  if (query.from || query.to) parts.push("Період включає обидві кінцеві дати; записи без дати виключено.");
  if (query.basis === "all") parts.push("Клінічна дата має пріоритет; за її відсутності використано позначену дату видачі.");
  if (query.basis === "clinical") parts.push("Клінічна дата запису або його дослідження.");
  if (query.basis === "issued") parts.push("Дата видачі документа; дата вимірювання невідома.");
  if (query.basis === "unknown") parts.push("Записи без визначеної дати.");
  return parts.join(" ");
}
