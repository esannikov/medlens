import { type LensModel, type Scope } from "../focus/model.ts";

/** Counts observations/findings in exactly the existing cutoff and undated scope. */
export function timelineCounts(lm: LensModel, scope: Scope) {
  const counts = {clinical: 0, issued: 0, unknown: 0, total: 0};
  for (const object of lm.m.results) {
    if (!lm.eligible(object.object_id, scope)) continue;
    counts.total++;
    const basis = lm.times.get(object.object_id)?.basis;
    if (basis === "own" || basis === "study") counts.clinical++;
    else if (basis === "issued") counts.issued++;
    else counts.unknown++;
  }
  return counts;
}
