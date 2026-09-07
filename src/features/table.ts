import { type LensModel, type Scope } from "../focus/model.ts";

/** Symmetric A ∪ B, preserving ancestor context and canonical traversal order. */
export function comparisonRows(lm: LensModel, scope: Scope, baseline: Scope | null = null) {
  const keep = new Set<string>();
  for (const n of lm.order) {
    if (!n.object || n.kind === "patient") continue;
    if (!lm.eligible(n.id, scope) && !(baseline && lm.eligible(n.id, baseline))) continue;
    lm.ancestors(n.id).forEach(a => keep.add(a.id));
  }
  keep.add(lm.root);
  return lm.order.filter(n => keep.has(n.id));
}

export function tableMembership(lm: LensModel, id: string, scope: Scope): string {
  const n = lm.nodes.get(id);
  if (!n) return "Запис відсутній";
  if (n.kind === "patient" || !n.object) return "Контекст";
  if (scope.group && lm.groupFor(id) !== scope.group) return "Поза обраною групою";
  const time = lm.times.get(id);
  if (!time?.day) return scope.undated ? "У відборі · без дати" : "Виключено · без дати";
  if (scope.cutoff && time.day > scope.cutoff) return "Пізніше кінцевої дати";
  return time.basis === "issued" ? "У відборі · за видачею" : "У відборі";
}
