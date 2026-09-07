import {
  createModel,
  date,
  domain,
  domains,
  kindNames,
  label,
  value,
  type Obj,
  type Snapshot,
} from "../model.ts";

// Cluster identity is distinct from the purple selection state.
export const clusterColors: Record<string, string> = {
  pathology_procedure: "#B03979",
  imaging_study: "#245FC5",
  laboratory_panel: "#087F71",
  temporal: "#9A600A",
};

export type Vec = [number, number];
export type LensNode = {
  id: string;
  title: string;
  kind: Obj["object_type"] | "group";
  object?: Obj;
  parent: string | null;
  children: string[];
  depth: number;
  color: string;
  p2: Vec;
  descendants: string[];
  weight: number;
};
export type DateInfo = {
  day: string | null;
  basis: "own" | "study" | "issued" | "comparison" | "unknown" | "none";
  text: string;
};
export type Scope = {
  cutoff: string | null;
  undated: boolean;
  group: string | null;
};
export const counted = (n: number, forms: [string, string, string]) =>
  `${n} ${forms[new Intl.PluralRules("uk-UA").select(n) === "one" ? 0 : new Intl.PluralRules("uk-UA").select(n) === "few" ? 1 : 2]}`;
const norm2 = (p: Vec) => p[0] ** 2 + p[1] ** 2;
export const norm = (p: Vec) => Math.sqrt(norm2(p));
/** Display/filter fallback only. Never writes to Clinical Time. */
export function issueDate(event?: Obj): string | null {
  const issued = (event?.payload.times || []).filter((t: {kind: string}) => t.kind === "issued");
  if (!issued.length) return null;
  const dates: string[] = [];
  for (const t of issued) {
    if (typeof t.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return null;
    const epoch = Date.parse(`${t.date}T00:00:00Z`);
    if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0,10) !== t.date) return null;
    dates.push(t.date);
  }
  return new Set(dates).size === 1 ? dates[0] : null;
}
export function clampDisk(p: Vec, maximum = 0.9995): Vec {
  const r = norm(p);
  return r > maximum ? (p.map((v) => (v * maximum) / r) as Vec) : p;
}

/** Möbius translation of the open Poincaré disk: focus a is mapped to the origin.
 * Standard vector formula, independently implemented; no H3/D3-Hypertree code copied.
 */
export function focusPoint(p: Vec, a: Vec): Vec {
  const a2 = norm2(a),
    p2 = norm2(p),
    dot = a[0] * p[0] + a[1] * p[1];
  const denom = Math.max(1e-12, 1 - 2 * dot + a2 * p2);
  return p.map(
    (v, i) => ((1 - a2) * v - (1 - 2 * dot + p2) * a[i]) / denom,
  ) as Vec;
}
/** Solve w=(z-a)/(1-conj(a)z) for the camera a. Unlike a camera delta,
 * this keeps the grabbed world point z at the pointer's disk position w,
 * including when z starts at the compressed edge of the lens. */
export function focusForAnchor(world: Vec, target: Vec): Vec {
  const [zx, zy] = world, [wx, wy] = clampDisk(target, .995);
  const kx = wx * zx - wy * zy, ky = wx * zy + wy * zx;
  const bx = zx - wx, by = zy - wy;
  const denominator = Math.max(1e-12, 1 - kx * kx - ky * ky);
  return clampDisk([
    (bx + kx * bx + ky * by) / denominator,
    (by + ky * bx - kx * by) / denominator,
  ], 1 - 1e-9);
}
export const lerpVec = (a: Vec, b: Vec, t: number): Vec =>
  a.map((v, i) => v + (b[i] - v) * t) as Vec;

export function createLensModel(data: Snapshot) {
  const m = createModel(data),
    nodes = new Map<string, LensNode>();
  if (!m.patient) throw new Error("У графі немає пацієнта");
  const root = m.patient.object_id;
  function add(
    id: string,
    title: string,
    kind: LensNode["kind"],
    parent: string | null,
    color: string,
    object?: Obj,
  ) {
    if (nodes.has(id)) throw new Error("Повторювана адреса у лінзі");
    nodes.set(id, {
      id,
      title,
      kind,
      parent,
      object,
      color,
      children: [],
      depth: 0,
      p2: [0, 0],
      descendants: [],
      weight: 1,
    });
  }
  add(root, data.case_id, "patient", null, "#6750a4", m.patient);
  const groups = [...new Set(m.events.map((e) => e.payload.event_kind))];
  for (const key of groups) {
    const d = domains[key] || { label: "Інше", color: "#616a78" };
    add(`group:${key}`, d.label, "group", root, clusterColors[key] || d.color);
  }
  if (m.temporal.length)
    add(
      "group:temporal",
      "Часові зв’язки",
      "group",
      root,
      clusterColors.temporal,
    );
  for (const e of m.events)
    add(
      e.object_id,
      label(e),
      e.object_type,
      `group:${e.payload.event_kind}`,
      clusterColors[e.payload.event_kind] || domain(e).color,
      e,
    );
  for (const s of m.specimens) {
    const owner = data.edges.find(
      (e) => e.relation === "has_specimen" && e.target === s.object_id,
    )?.source;
    const parent = owner && nodes.has(owner) ? owner : root;
    add(
      s.object_id,
      label(s),
      s.object_type,
      parent,
      nodes.get(parent)!.color,
      s,
    );
  }
  for (const r of m.results) {
    const specimen = m.specimenFor(r),
      eventId = m.resultParent.get(r.object_id)!;
    const parent =
      specimen && nodes.get(specimen.object_id)?.parent === eventId
        ? specimen.object_id
        : eventId;
    add(
      r.object_id,
      label(r),
      r.object_type,
      parent,
      nodes.get(eventId)!.color,
      r,
    );
  }
  for (const t of m.temporal) {
    const ref = t.payload.current,
      current =
        ref?.resolution_status === "resolved"
          ? m.byId.get(ref.object_id)
          : undefined;
    const subject =
      current && current.version_id === ref.version_id
        ? label(current).replace(/^ВИСНОВОК:\s*/iu, "")
        : label(t);
    add(
      t.object_id,
      subject,
      t.object_type,
      "group:temporal",
      clusterColors.temporal,
      t,
    );
  }
  if (
    [...nodes.values()].filter((n) => n.object).length !== data.objects.length
  )
    throw new Error("Лінза не охоплює всі об’єкти");
  for (const n of nodes.values())
    if (n.parent) nodes.get(n.parent)!.children.push(n.id);
  function inventory(id: string, depth = 0): string[] {
    const n = nodes.get(id)!;
    n.depth = depth;
    n.descendants = n.children.flatMap((c) => [c, ...inventory(c, depth + 1)]);
    n.weight = Math.sqrt(
      Math.max(1, n.descendants.filter((c) => nodes.get(c)!.object).length),
    );
    return n.descendants;
  }
  inventory(root);
  function place(id: string, start: number, end: number) {
    const n = nodes.get(id)!,
      angle = (start + end) / 2,
      r = Math.tanh(n.depth * 0.68);
    n.p2 = n.depth ? [r * Math.cos(angle), r * Math.sin(angle)] : [0, 0];
    let cursor = start;
    const weights = n.children.map((c) => nodes.get(c)!.weight),
      total = weights.reduce((a, b) => a + b, 0);
    n.children.forEach((c, i) => {
      const span = ((end - start) * weights[i]) / total;
      place(c, cursor + span * 0.04, cursor + span * 0.96);
      cursor += span;
    });
  }
  place(root, -Math.PI * 0.86, Math.PI * 1.14);
  const ancestors = (id: string) => {
    const path: LensNode[] = [];
    let n = nodes.get(id);
    while (n) {
      path.unshift(n);
      n = n.parent ? nodes.get(n.parent) : undefined;
    }
    return path;
  };
  const eventFor = (n: LensNode) =>
    n.kind === "clinical_event"
      ? n.object
      : ancestors(n.id).find((x) => x.kind === "clinical_event")?.object;
  const times = new Map<string, DateInfo>();
  for (const n of nodes.values()) {
    let info: DateInfo = { day: null, basis: "none", text: "" };
    if (n.object && n.kind !== "patient") {
      const own = n.object.clinical_time.start;
      const event = eventFor(n);
      if (n.kind === "temporal_relation") {
        const prior = n.object.payload.prior?.clinical_time,
          current = n.object.payload.current?.clinical_time;
        info = {
          day: prior && current ? [prior, current].sort().at(-1)! : null,
          basis: prior && current ? "comparison" : "unknown",
          text: `${date(prior)} → ${date(current)}`,
        };
      } else if (own) info = { day: own, basis: "own", text: date(own) };
      else if (event?.clinical_time.start && n.kind !== "clinical_event")
        info = {
          day: event.clinical_time.start,
          basis: "study",
          text: `${date(event.clinical_time.start)} · за дослідженням`,
        };
      else {
        const issued = issueDate(event);
        info = issued ? {
          day: issued,
          basis: "issued",
          text: `${date(issued)} · ${n.kind === "clinical_event" ? "видано" : "за датою видачі дослідження"}`,
        } : { day: null, basis: "unknown", text: "Дата не визначена" };
      }
    }
    times.set(n.id, info);
  }
  const days = [
    ...new Set([...times.values()].map((t) => t.day).filter(Boolean)),
  ].sort() as string[];
  const groupFor = (id: string) =>
    ancestors(id).find((n) => n.kind === "group")?.id || null;
  const eligible = (id: string, scope: Scope) => {
    const n = nodes.get(id);
    if (!n) return false;
    if (n.kind === "patient") return true;
    if (scope.group && groupFor(id) !== scope.group) return false;
    if (!n.object) return true;
    const t = times.get(id)!;
    return t.day ? !scope.cutoff || t.day <= scope.cutoff : scope.undated;
  };
  const contextual = (id: string, scope: Scope) =>
    eligible(id, scope) ||
    nodes
      .get(id)!
      .descendants.some((c) => nodes.get(c)!.object && eligible(c, scope));
  const count = (id: string, scope: Scope) => {
    const all = [id, ...nodes.get(id)!.descendants]
      .map((k) => nodes.get(k)!)
      .filter((n) => n.object && n.kind !== "patient");
    const results = all.filter((n) =>
      ["observation", "finding"].includes(n.kind),
    );
    return {
      all: all.length,
      visible: all.filter((n) => eligible(n.id, scope)).length,
      results: results.length,
      visibleResults: results.filter((n) => eligible(n.id, scope)).length,
    };
  };
  const title = (n: LensNode) => n.title;
  const summary = (n: LensNode) =>
    n.kind === "observation"
      ? `${value(n.object!)} ${n.object!.payload.source_unit || ""}`
      : n.kind === "clinical_event"
        ? counted(m.resultsFor(n.id).length, [
            "результат",
            "результати",
            "результатів",
          ])
        : n.kind === "group"
          ? counted(
              n.descendants.filter(
                (c) => nodes.get(c)!.kind === "clinical_event",
              ).length || n.children.length,
              n.id === "group:temporal"
                ? ["зв’язок", "зв’язки", "зв’язків"]
                : ["дослідження", "дослідження", "досліджень"],
            )
          : n.kind === "specimen"
            ? "Матеріал"
            : n.kind === "patient"
              ? `${m.events.length} досліджень · ${m.results.length} результатів`
              : kindNames[n.kind];
  const order: LensNode[] = [];
  const walk = (id: string) => {
    const n = nodes.get(id)!;
    order.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  const displayEdges = [...nodes.values()]
    .filter((n) => n.parent)
    .map((n) => ({
      source: n.parent!,
      target: n.id,
      grouping: !data.edges.some(
        (e) => e.source === n.parent && e.target === n.id,
      ),
    }));
  const matches = (id: string, query: string) => {
    const object = nodes.get(id)?.object;
    if (!object) return false;
    const displayTime = (times.get(id)?.text || "").toLocaleLowerCase("uk-UA");
    return query.trim().toLocaleLowerCase("uk-UA").split(/\s+/)
      .every(token => m.matches(object, token) || displayTime.includes(token));
  };
  return {
    m,
    data,
    root,
    nodes,
    order,
    groups: nodes.get(root)!.children,
    ancestors,
    eventFor,
    times,
    days,
    eligible,
    contextual,
    count,
    groupFor,
    title,
    summary,
    displayEdges,
    matches,
  };
}
export type LensModel = ReturnType<typeof createLensModel>;

export function compareScopes(lm: LensModel, a: Scope, b: Scope) {
  const objects = lm.order.filter((n) => n.object && n.kind !== "patient");
  return {
    a: objects.filter((n) => lm.eligible(n.id, a)),
    b: objects.filter((n) => lm.eligible(n.id, b)),
    onlyA: objects.filter((n) => lm.eligible(n.id, a) && !lm.eligible(n.id, b)),
    onlyB: objects.filter((n) => !lm.eligible(n.id, a) && lm.eligible(n.id, b)),
  };
}

export function geodesic(a: Vec, b: Vec, samples = 22): Vec[] {
  // Translate a to zero, travel radially, then apply the inverse transformation.
  const end = focusPoint(b, a),
    length = norm(end);
  const inverse = a.map((v) => -v) as Vec;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const r =
      length < 1e-10
        ? 0
        : Math.tanh((Math.atanh(Math.min(length, 0.999999)) * i) / samples) /
          length;
    return focusPoint(end.map((v) => v * r) as Vec, inverse);
  });
}
