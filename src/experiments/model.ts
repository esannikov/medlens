import { date, kindNames, label, type Obj } from "../model.ts";
import { type LensModel, type LensNode, type Scope } from "../focus/model.ts";

export const experimentVariants = ["dual", "regroup", "lab"] as const;
export type ExperimentVariant = (typeof experimentVariants)[number];
export const paneVariants = ["2d", "control", "dual", "regroup"] as const;
export type PaneVariant = (typeof paneVariants)[number];
export type RegroupBy = "material" | "date" | "type";
export type ExperimentalPoint = { id: string; x: number; y: number; ordinal: number };
export type Regroup = { key: string; title: string; nodes: LensNode[] };

export function isExperimentVariant(value: unknown): value is ExperimentVariant {
  return experimentVariants.includes(value as ExperimentVariant);
}

/** Only local, known surfaces can become iframe URLs. Current search/hash is discarded. */
export function experimentUrl(variant: string, baseHref: string, embedded = false): string {
  if (![...paneVariants, "lab"].includes(variant)) throw new Error("Невідомий варіант лінзи");
  if (embedded && variant === "lab") throw new Error("Лабораторію не можна вкладати в панель");
  const base = new URL(".", baseHref);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Непідтримувана адреса");
  const url = new URL(variant === "control" ? "./control/index.html" : "./", base);
  if (variant !== "control") url.searchParams.set("lens", variant);
  if (embedded) url.searchParams.set("embed", "1");
  return url.href;
}

export function scopedObjects(lm: LensModel, scope: Scope): LensNode[] {
  return lm.order.filter(n => n.object && lm.eligible(n.id, scope));
}

/** Membership is the existing hierarchy, never a name-based clinical entity match. */
export function studyMembers(lm: LensModel, id: string, scope: Scope): LensNode[] {
  const study = lm.nodes.get(id);
  if (study?.kind !== "clinical_event" || !lm.eligible(id, scope)) return [];
  return [study, ...study.descendants.map(child => lm.nodes.get(child)!)]
    .filter(n => n.object && lm.eligible(n.id, scope));
}

export function pairedStudyMembers(lm: LensModel, ids: readonly string[], scope: Scope) {
  return ids.slice(0, 2).map(id => ({ id, nodes: studyMembers(lm, id, scope) }));
}

function materialGroup(lm: LensModel, n: LensNode): { key: string; title: string } {
  if (n.kind === "patient") return { key: "patient", title: "Досьє" };
  const specimen = n.kind === "specimen" ? n.object : lm.m.specimenFor(n.object!);
  const specimens = specimen ? [specimen] : n.kind === "clinical_event" ? lm.m.specimensFor(n.id) : [];
  const titles = [...new Set(specimens.map(label))].sort();
  return titles.length ? { key: JSON.stringify(titles), title: titles.join("; ") }
    : { key: "unspecified", title: "Матеріал не зазначено для запису" };
}

/** Searches only text belonging to this object; shared study/source text is not propagated. */
export function matchesTextMention(o: Obj, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("uk-UA");
  if (!q) return true;
  const text = [label(o), o.payload.details, o.payload.source_literal, o.payload.concept?.source_literal,
    o.payload.value?.text].filter(v => typeof v === "string").join(" ").toLocaleLowerCase("uk-UA");
  return q.split(/\s+/u).every(token => text.includes(token));
}

export function regroupObjects(lm: LensModel, scope: Scope, by: RegroupBy, mention = ""): Regroup[] {
  const groups = new Map<string, Regroup>();
  for (const n of scopedObjects(lm, scope).filter(n => matchesTextMention(n.object!, mention))) {
    let grouping: { key: string; title: string };
    if (by === "material") grouping = materialGroup(lm, n);
    else if (by === "date") {
      const time = lm.times.get(n.id)!;
      const basis = time.basis === "issued" ? "issued" : time.basis === "comparison" ? "comparison" : "clinical";
      grouping = n.kind === "patient" ? { key: "patient", title: "Досьє" }
        : !time.day ? { key: "unknown", title: "Дата не визначена" }
        : { key: `${time.day}:${basis}`, title: `${date(time.day)} · ${basis === "issued" ? "дата видачі" : basis === "comparison" ? "дата часового зв’язку" : "клінічна дата / дата дослідження"}` };
    } else {
      const type = n.kind === "clinical_event" ? lm.groupFor(n.id) : n.kind;
      grouping = { key: type || n.kind, title: n.kind === "clinical_event"
        ? `Дослідження · ${lm.nodes.get(lm.groupFor(n.id) || "")?.title || "Інше"}` : kindNames[n.kind] || n.kind };
    }
    if (!groups.has(grouping.key)) groups.set(grouping.key, { ...grouping, nodes: [] });
    groups.get(grouping.key)!.nodes.push(n);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(g => ({
    ...g, nodes: [...g.nodes].sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

export function regroupLayout(groups: readonly Regroup[], columns = 3) {
  const safeColumns = Math.max(1, Math.floor(columns));
  let top = 28;
  const rows = groups.map(group => {
    const height = Math.max(88, Math.ceil(group.nodes.length / safeColumns) * 64 + 24);
    const points = group.nodes.map((n, i) => ({ id: n.id, ordinal: i + 1,
      x: 240 + (i % safeColumns) * 270, y: top + 32 + Math.floor(i / safeColumns) * 64 }));
    const row = { key: group.key, title: group.title, top, height, points };
    top += height + 18;
    return row;
  });
  return { rows, width: 260 + safeColumns * 270, height: Math.max(180, top + 12) };
}

/** Only explicit, version-resolved source relations qualify as existing comparisons. */
export function explicitStudyComparisons(lm: LensModel, a: string, b: string, scope: Scope): LensNode[] {
  if (a === b) return [];
  return scopedObjects(lm, scope).filter(n => {
    if (n.kind !== "temporal_relation") return false;
    const endpoints = [n.object!.payload.prior, n.object!.payload.current].map(ref => {
      if (ref?.resolution_status !== "resolved") return null;
      const endpoint = lm.nodes.get(ref.object_id);
      if (!endpoint?.object || endpoint.object.version_id !== ref.version_id || !lm.eligible(endpoint.id, scope)) return null;
      return lm.eventFor(endpoint)?.object_id ?? null;
    });
    return endpoints.includes(a) && endpoints.includes(b);
  });
}
