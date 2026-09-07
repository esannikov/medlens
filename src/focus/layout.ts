import {
  counted,
  focusPoint,
  geodesic,
  norm,
  type LensModel,
  type LensNode,
  type Scope,
  type Vec,
} from "./model.ts";
import { value } from "../model.ts";
import { unitDisplay } from "../features/clinical.ts";
import { LENS_FONT_FAMILY } from "./typography.ts";

export const nodeKinds: Record<LensNode["kind"], string> = {
  patient: "Досьє",
  group: "Розділ",
  clinical_event: "Дослідження",
  specimen: "Матеріал",
  observation: "Показник",
  finding: "Опис знахідки",
  temporal_relation: "Зміна між дослідженнями",
};
export function preview(lm: LensModel, n: LensNode, scope: Scope, canonicalUnits = false) {
  const counts = lm.count(n.id, scope);
  const content =
    n.kind === "observation"
      ? `${value(n.object!)} ${unitDisplay(n.object!, canonicalUnits) === "Не зазначено" ? "· одиницю не зазначено" : unitDisplay(n.object!, canonicalUnits)}`.trim()
      : n.kind === "finding"
        ? ""
        : n.kind === "temporal_relation"
          ? `${n.object!.payload.relation_type === "decreased_from" ? "Зменшення" : n.object!.payload.relation_type === "unchanged_from" ? "Без змін" : "Порівняння"}${n.object!.payload.compatibility_receipt?.status === "partial" ? " · сумісність часткова" : ""}`
          : n.id === "group:temporal"
            ? counted(
                n.children.filter((id) => lm.eligible(id, scope)).length,
                ["зв’язок", "зв’язки", "зв’язків"],
              )
            : n.kind === "patient" || n.kind === "group"
              ? counted(
                  n.descendants.filter(
                    (id) =>
                      lm.nodes.get(id)!.kind === "clinical_event" &&
                      lm.contextual(id, scope),
                  ).length,
                  ["дослідження", "дослідження", "досліджень"],
                )
              : counts.visibleResults === counts.results
                ? counted(counts.results, [
                    "результат",
                    "результати",
                    "результатів",
                  ])
                : `${counts.visibleResults} із ${counts.results} результатів`;
  return {
    kind: nodeKinds[n.kind],
    content,
    time: lm.times.get(n.id)?.text || "",
    action: n.children.length ? "Розкрити вміст" : "Читати запис",
  };
}
/** Navigation text is not a clinical summary. Full source titles stay intact
 * in LensNode, the table and reader; never crop away a negation/qualification. */
export function graphCaption(lm: LensModel, n: LensNode): {title: string; disclosure: boolean} {
  if (!["finding", "temporal_relation"].includes(n.kind) || n.title.length <= 110)
    return {title: n.title, disclosure: false};
  const heading = n.title.match(/^([^:]{3,90}):\s/)?.[1];
  if (heading && !/[.!?]/u.test(heading) && !/^(ВИСНОВОК|Заключення)$/iu.test(heading))
    return {title: heading, disclosure: true};
  const current = n.kind === "temporal_relation"
    ? lm.nodes.get(n.object?.payload.current?.object_id) : n;
  const kind = current?.object?.payload.finding_type;
  const topics: Record<string,string> = {
    bone_lesion_statement: "Опис кісток",
    rib_fracture_statement: "Опис ребер",
    renal_cyst_statement: "Опис нирок",
    mesenteric_mass_statement: "Опис утворення брижі",
    source_pathology_statement: "Патоморфологічний опис",
  };
  const event = current && lm.eventFor(current);
  return {title: topics[kind] || (event?.payload.event_kind === "pathology_procedure"
    ? "Морфологічний опис" : event?.payload.event_kind === "laboratory_panel"
      ? "Коментар до дослідження" : "Розгорнутий опис"), disclosure: true};
}
export function neighborhood(lm: LensModel, selected: string, scope: Scope) {
  const node = lm.nodes.get(selected)!;
  const parent = node.parent ? lm.nodes.get(node.parent)! : null;
  const items = (node.children.length ? node.children : parent?.children || [])
    .map((id) => lm.nodes.get(id)!)
    .filter((n) => lm.contextual(n.id, scope));
  const local = new Set([selected, ...items.map((n) => n.id)]);
  const path = new Set(lm.ancestors(selected).map((n) => n.id));
  return { node, parent, items, local, path };
}

/** A coverage claim contains only source-backed result objects in this scope.
 * Category and dossier navigation counts deliberately have no coverage claim. */
export function activeResultCoverage(lm: LensModel, centerId: string, scope: Scope, labels: readonly Label[]) {
  const owner = [...lm.ancestors(centerId)].reverse()
    .find(n => n.kind === "specimen" || n.kind === "clinical_event");
  if (!owner) return null;
  const all = owner.descendants.filter(id => {
    const node = lm.nodes.get(id)!;
    return !!node.object && (node.kind === "observation" || node.kind === "finding");
  });
  const eligible = all.filter(id => lm.eligible(id, scope));
  // A nearly faded caption is not counted as a readable result.
  const readable = new Set(labels.filter(label => label.opacity >= 0.95).map(label => label.id));
  return {
    owner,
    all,
    eligible,
    displayed: eligible.filter(id => readable.has(id)),
    hidden: eligible.filter(id => !readable.has(id)),
    excluded: all.filter(id => !lm.eligible(id, scope)),
  };
}

export const structuralRelationNames: Record<string, string> = {
  has_event: "Досьє → дослідження",
  has_specimen: "Дослідження → матеріал",
  has_observation: "Дослідження → показник",
  yields_finding: "Дослідження → знахідка",
  derived_from_specimen: "Матеріал → результат",
};

/** These are the exact supplied edges, never the lens's display/group tree. */
export function exactStructuralEdges(lm: LensModel, selected: string, trace = false) {
  if (!lm.nodes.get(selected)?.object) return [];
  if (!trace) return lm.data.edges.filter(edge => edge.source === selected || edge.target === selected);
  const visited = new Set<string>([selected]);
  const edgeIds = new Set<string>();
  const pending = [selected];
  while (pending.length) {
    const target = pending.pop()!;
    for (const edge of lm.data.edges.filter(item => item.target === target)) {
      edgeIds.add(edge.id);
      if (!visited.has(edge.source)) {
        visited.add(edge.source);
        pending.push(edge.source);
      }
    }
  }
  return lm.data.edges.filter(edge => edgeIds.has(edge.id));
}

export function keyboardDestination(lm: LensModel, id: string, scope: Scope, direction: "parent" | "child" | "previous" | "next" | "root") {
  const node = lm.nodes.get(id);
  if (!node) return null;
  if (direction === "root") return lm.root;
  if (direction === "parent") return node.parent;
  if (direction === "child") return node.children.find(child => lm.contextual(child, scope)) || null;
  const siblings = (node.parent ? lm.nodes.get(node.parent)!.children : [id])
    .filter(sibling => lm.contextual(sibling, scope));
  const index = siblings.indexOf(id);
  return index < 0 ? null : siblings[index + (direction === "previous" ? -1 : 1)] || null;
}
export type Point = {
  id: string;
  x: number;
  y: number;
  radius: number;
  p: Vec;
  active: boolean;
  detail: boolean;
};
export type Path = {
  source: string;
  target: string;
  grouping: boolean;
  points: Vec[];
  local: boolean;
  ancestor: boolean;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type Label = Rect & {
  detailLevel: "near" | "context";
  textAnchor: "start" | "middle" | "end";
  textX: number;
  anchor: number;
  variant: number;
  opacity: number;
  nodeX: number;
  nodeY: number;
  id: string;
  lines: string[];
  meta: string;
  content: string;
  contentLines: string[];
  detailLineHeight: number;
  disclosure: boolean;
  dateLines: string[];
  dateY: number;
  dateLineHeight: number;
  titleSize: number;
  detailSize: number;
  metaSize: number;
  titleLineHeight: number;
  titleY: number;
  detailY: number;
  metaY: number;
  weight: number;
  distance: number;
};
export type Measure = (text: string, font: string) => number;
export const lineProfiles = {
  fine: { label: "Тонкі", factor: 0.75 },
  balanced: { label: "Збалансовані", factor: 1 },
  bold: { label: "Виразні", factor: 1.35 },
};
export type LineProfile = keyof typeof lineProfiles;
/** Display emphasis only, never confidence, diagnostic importance or quantity. */
export function connectionStyle(near: number, role: "route" | "branch" | "context", profile: LineProfile) {
  const t = Math.max(0, Math.min(1, near)), factor = lineProfiles[profile].factor;
  return {
    width: factor * (role === "route" ? 1.65 + 0.7*t : role === "branch" ? 0.85 + 0.7*t : 0.65 + 0.12*t),
    opacity: role === "route" ? 0.86 : role === "branch" ? 0.34 + 0.42*t : 0.2 + 0.12*t,
  };
}
const titleFont = `600 12.5px ${LENS_FONT_FAMILY}`;
export function lensTypography(distance: number, textScale = 1) {
  const near = Math.max(0, Math.min(1, 1 - distance));
  const scale = Math.max(0.85, Math.min(1.6, textScale));
  return {
    titleSize: (11.5 + 9.5 * near ** 0.8) * scale,
    detailSize: (10 + 6 * near ** 0.8) * scale,
    metaSize: (10 + 2 * near ** 0.8) * scale,
  };
}

export function wrapText(
  text: string,
  width: number,
  measure: Measure,
  font = titleFont,
  maxLines = 3,
): string[] {
  const words = text.trim().split(/\s+/),
    lines: string[] = [];
  let line = "";
  for (let word of words) {
    if (line && measure(`${line} ${word}`, font) > width) {
      lines.push(line);
      line = "";
    }
    while (measure(word, font) > width && word.length > 1) {
      let end = word.length - 1;
      while (end > 1 && measure(word.slice(0, end), font) > width) end--;
      lines.push(word.slice(0, end));
      word = word.slice(end);
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let tail = kept[maxLines - 1];
  while (tail && measure(`${tail}…`, font) > width) tail = tail.slice(0, -1);
  kept[maxLines - 1] = `${tail}…`;
  return kept;
}
export const overlaps = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap &&
  a.x + a.w + gap > b.x &&
  a.y < b.y + b.h + gap &&
  a.y + a.h + gap > b.y;
export function crosses(rect: Rect, a: Vec, b: Vec, padding = 0) {
  const r = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + 2 * padding,
    h: rect.h + 2 * padding,
  };
  let lo = 0,
    hi = 1;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ]) {
    if (Math.abs(p) < 1e-10) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return false;
  }
  return true;
}
export function lensGeometry(
  lm: LensModel,
  selected: string,
  scope: Scope,
  focus: Vec,
  width: number,
  height: number,
  zoom = 1,
) {
  const centerId = focusCenter(lm, scope, focus);
  const ctx = neighborhood(lm, centerId, scope);
  const radius = Math.min(width * 0.43, height * 0.44) * zoom;
  const project = (p: Vec): Vec => [
    width / 2 + p[0] * radius,
    height / 2 - p[1] * radius,
  ];
  const points: Point[] = lm.order.map((n) => {
    const p = focusPoint(n.p2, focus),
      [x, y] = project(p),
      detail = norm(p) < 0.72;
    const base =
      n.kind === "clinical_event" || n.kind === "group"
        ? 5
        : n.kind === "specimen"
          ? 4.3
          : 3.8;
    const size =
      base +
      (n.kind === "clinical_event" || n.kind === "group" ? 8 : 6) *
        Math.pow(Math.max(0, 1 - norm(p)), 1.3);
    return {
      id: n.id,
      p,
      x,
      y,
      radius: size,
      active: lm.contextual(n.id, scope),
      detail,
    };
  });
  const byId = new Map(points.map((p) => [p.id, p]));
  // Every navigation node keeps its parent connection, including the perimeter.
  const paths: Path[] = lm.displayEdges.map((e) => ({
    ...e,
    points: geodesic(byId.get(e.source)!.p, byId.get(e.target)!.p).map(project),
    local:
      ctx.local.has(e.target) &&
      (ctx.local.has(e.source) || e.source === ctx.parent?.id),
    ancestor: ctx.path.has(e.target) && ctx.path.has(e.source),
  }));
  return { points, paths, radius, ctx, centerId };
}

/** Navigation focus is geometric, independent of the last opened record. */
export function focusCenter(lm: LensModel, scope: Scope, focus: Vec): string {
  let nearest = lm.root,
    distance = Infinity;
  for (const n of lm.order)
    if (lm.contextual(n.id, scope)) {
      const d = norm(focusPoint(n.p2, focus));
      if (d < distance) {
        distance = d;
        nearest = n.id;
      }
    }
  return nearest;
}

/** Free text stays next to its node; no visible boxes or leader lines. */
export function placeLabels(
  lm: LensModel,
  selected: string,
  scope: Scope,
  points: Point[],
  paths: Path[],
  width: number,
  height: number,
  measure: Measure,
  previous: ReadonlyMap<string, Label> = new Map(),
  moving = false,
  family = LENS_FONT_FAMILY,
  options: { textScale?: number; centerId?: string; canonicalUnits?: boolean } = {},
) {
  const labels: Label[] = [];
  const textScale = Math.max(0.85, Math.min(1.6, options.textScale ?? 1));
  const centerId = options.centerId || [...points].filter(p => p.active).sort((a, b) => norm(a.p) - norm(b.p))[0]?.id || selected;
  const center = lm.nodes.get(centerId)!;
  const branchOwner = center.children.length ? center : lm.nodes.get(center.parent || centerId)!;
  const branch = new Set([branchOwner.id, ...branchOwner.children]);
  const priority = (p: Point) => p.id === centerId ? 0 : branch.has(p.id) && ["clinical_event", "specimen", "group"].includes(lm.nodes.get(p.id)!.kind) ? 1 : branch.has(p.id) ? 2 : 3;
  const candidates = points
    .filter((p) => p.active && norm(p.p) < 0.975)
    .sort((a, b) => priority(a) - priority(b) || norm(a.p) - norm(b.p));
  for (const p of candidates) {
    if (labels.length >= (width < 600 ? 12 : 24)) break;
    const n = lm.nodes.get(p.id)!,
      info = preview(lm, n, scope, options.canonicalUnits),
      chosen = p.id === selected,
      centered = p.id === centerId;
    const caption = graphCaption(lm,n);
    const remembered = previous.get(p.id);
    const distance = norm(p.p),
      typography = lensTypography(distance, textScale);
    // The wider leave threshold prevents a metadata line fluttering at focus.
    const detailLevel = distance < (remembered?.detailLevel === "near" ? 0.52 : 0.44) ? "near" : "context";
    const weight = chosen ? 600 : 500;
    const fullBrief = n.kind === "observation" ? info.content : info.content
          .replace(/дослідження|досліджень/g, "досл.")
          .replace(/результатів|результати|результат/g, "рез.");
    const widths = width < 600 ? [224, 200, 180] : [320, 278, 236];
    // Center presence takes precedence over peripheral anchor memory. Compact
    // compositions retain the entire title and actual observation value; only
    // redundant navigation metadata yields to space around the center node.
    const availableVariants = centered ? [3, 4, 5, 6, 7, 8, 0, 1, 2] : [0, 1, 2];
    const rememberedVariant = remembered && availableVariants.includes(remembered.variant) ? remembered.variant : null;
    const variants = remembered
      ? moving && !centered && rememberedVariant !== null ? [rememberedVariant]
        : [...(rememberedVariant === null ? [] : [rememberedVariant]), ...availableVariants.filter(i => i !== rememberedVariant)]
      : availableVariants;
    const attempts = centered && moving && remembered
      ? [...variants.map(variant => ({ variant, releaseAnchor: false })), ...variants.map(variant => ({ variant, releaseAnchor: true }))]
      : variants.map(variant => ({ variant, releaseAnchor: false }));
    let placed = false;
    for (const { variant, releaseAnchor } of attempts) {
      // Typeset once in a fixed coordinate system; scale that composition.
      // No 1/2/3-line or width switch at arbitrary lens radii.
      const compact = variant >= 3;
      const compactIndex = variant - 3;
      const baseTitleSize = compact ? [18, 16, 14, 12, 14, 12][compactIndex] : 21;
      const targetWidth = compact ? [210, 166, 126, 180, 180, 140][compactIndex] : widths[variant];
      const { detailSize, metaSize } = compact
        ? { detailSize: Math.min(typography.detailSize, 14 * textScale), metaSize: Math.min(typography.metaSize, 10 * textScale) }
        : typography;
      const valueFont = `${detailSize}px ${family}`, metaFont = `${metaSize}px ${family}`;
      const meta = chosen && !compact ? "Обрано" : "";
      const brief = compact && n.kind !== "observation" ? "" : fullBrief;
      const longestWord = Math.max(...caption.title.split(/\s+/).map(word => measure(word, `600 ${baseTitleSize * textScale}px ${family}`)));
      const baseWidth = Math.min(width - 24, Math.max(targetWidth * textScale, longestWord + 8));
      let baseSize = baseTitleSize * textScale;
      let lines = wrapText(caption.title, baseWidth - 8, measure, `600 ${baseSize}px ${family}`, Infinity);
      while (lines.length > (n.kind === "finding" ? 4 : 3) && baseSize > 15 * textScale) {
        baseSize--;
        lines = wrapText(caption.title, baseWidth - 8, measure, `600 ${baseSize}px ${family}`, Infinity);
      }
      const titleSize = 11.5 * textScale + (baseSize - 11.5 * textScale) * Math.max(0, 1 - distance) ** 0.8;
      const titleFont = `${weight} ${titleSize}px ${family}`;
      const scale = titleSize / baseSize;
      const limit = (baseWidth - 8) * scale + 8;
      const dateText = variant < 7 &&
        (n.kind === "clinical_event" || n.kind === "temporal_relation" || (!compact && detailLevel === "near" && ["observation", "finding", "specimen"].includes(n.kind)))
          ? lm.times.get(n.id)!.text
          : "";
      // Reserve for the worst relative font/width ratio at the rim. These
      // line breaks stay fixed throughout a drag, just like the title.
      const outerType=lensTypography(1, textScale), innerType=compact
        ? { ...lensTypography(0, textScale), metaSize, detailSize }
        : lensTypography(0, textScale);
      const stableDateWidth=(baseWidth-8)*Math.min(1,(outerType.titleSize/baseSize)/(outerType.metaSize/innerType.metaSize));
      const stableValueWidth=(baseWidth-8)*Math.min(1,(outerType.titleSize/baseSize)/(outerType.detailSize/innerType.detailSize));
      const dateLines = dateText
        ? wrapText(dateText, stableDateWidth, measure, `${innerType.metaSize}px ${family}`, Infinity)
        : [];
      const contentLines = brief ? wrapText(brief, stableValueWidth, measure, `${innerType.detailSize}px ${family}`, Infinity) : [];
      const content = brief;
      const w = (caption.disclosure ? 16 : 0) + Math.min(
        limit,
        Math.max(
          44,
          ...lines.map((t) => measure(t, titleFont) + 8),
          ...dateLines.map((t) => measure(t, metaFont) + 8),
          ...contentLines.map(t => measure(t, valueFont) + 8),
          meta ? measure(meta, metaFont) + 8 : 0,
        ),
      );
      const titleLineHeight = titleSize * 1.2;
      const metaBand = meta ? metaSize * 1.3 + 3 : 0;
      const dateLineHeight = metaSize * 1.25,
        dateBand = dateLines.length ? dateLines.length * dateLineHeight + 3 : 0;
      const detailLineHeight = detailSize * 1.25;
      const inkHeight =
        metaBand +
        lines.length * titleLineHeight +
        dateBand +
        (contentLines.length ? contentLines.length * detailLineHeight + 3 : 0);
      const h = Math.max(44, inkHeight + 6),
        top = (h - inkHeight) / 2;
      const metaY = top + metaSize,
        titleY = top + metaBand + titleSize,
        dateY = top + metaBand + lines.length * titleLineHeight + metaSize + 1,
        detailY =
          top +
          metaBand +
          lines.length * titleLineHeight +
          dateBand +
          detailSize +
          3;
      const gap = p.radius + 8;
      const positions = Array.from({length: 32}, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 16;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const reach = Math.min((w / 2 + gap) / Math.max(1e-9, Math.abs(dx)),
          (h / 2 + gap) / Math.max(1e-9, Math.abs(dy)));
        return {x: p.x + dx * reach - w / 2, y: p.y + dy * reach - h / 2};
      });
      const anchors = remembered
        ? moving && !releaseAnchor ? [0,-1,1,-2,2].map(d => (remembered.anchor + d + 32) % 32)
          : [remembered.anchor, ...positions.map((_, i) => i).filter(i => i !== remembered.anchor)]
        : positions.map((_, i) => i);
      const trials = anchors
        .map((anchor) => ({ ...positions[anchor], w, h, anchor }))
        .filter(b => releaseAnchor || !moving || !remembered || Math.hypot(
          b.x - remembered.x - (p.x - remembered.nodeX),
          b.y - remembered.y - (p.y - remembered.nodeY)) < 24)
        .filter(
          (b) =>
            b.x >= 10 &&
            b.y >= 10 &&
            b.x + w <= width - 10 &&
            b.y + h <= height - 48,
        )
        .filter((b) => !labels.some((other) => overlaps(b, other, 9)))
        .filter(
          (b) =>
            !points.some((o) => {
              const clearance = compact ? 3 : 6;
              return overlaps(b, {
                x: o.x - o.radius - clearance,
                y: o.y - o.radius - clearance,
                w: (o.radius + clearance) * 2,
                h: (o.radius + clearance) * 2,
              });
            }),
        );
      // Protect the active branch. Faint context strokes may sit behind the
      // existing text halo; treating them as solid obstacles made titles flee
      // or disappear while the perimeter moved. Nodes never yield to text.
      const clear = (b: Rect, includeOwn: boolean) =>
        !paths.some(
          (path) =>
            (path.local || path.ancestor) &&
            (includeOwn || (path.source !== p.id && path.target !== p.id)) &&
            path.points
              .slice(1)
              .some((end, i) => crosses(b, path.points[i], end, 2)),
        );
      // Start in the widest quiet sector, not the first temporarily empty slot.
      // This leaves room for the adjoining branches to move during a gesture.
      const incident = paths.flatMap(path => path.source === p.id
        ? [path.points[1]] : path.target === p.id ? [path.points.at(-2)!] : []);
      const quietness = (b: Rect) => {
        const dx = b.x + b.w / 2 - p.x, dy = b.y + b.h / 2 - p.y;
        return Math.min(2, ...incident.map(([x,y]) =>
          1 - ((x - p.x) * dx + (y - p.y) * dy) /
            Math.max(1e-6, Math.hypot(x - p.x, y - p.y) * Math.hypot(dx,dy))));
      };
      const breathingRoom = (b: Rect) => Math.min(120, ...points
        .filter(o => o.id !== p.id)
        .map(o => Math.hypot(Math.max(b.x - o.x, 0, o.x - b.x - b.w),
          Math.max(b.y - o.y, 0, o.y - b.y - b.h)) - o.radius));
      trials.sort((a,b) => remembered
        ? Math.hypot(a.x - remembered.x, a.y - remembered.y) - Math.hypot(b.x - remembered.x, b.y - remembered.y)
        : breathingRoom(b) - breathingRoom(a) + 10 * (quietness(b) - quietness(a)));
      const allowOwn = centered || n.kind !== "observation";
      const box = trials.find(b => b.anchor === remembered?.anchor && clear(b, !allowOwn)) ||
        trials.find((b) => clear(b, true)) || (allowOwn ? trials.find((b) => clear(b, false)) : undefined);
      if (!box) continue;
      const textAnchor = moving && remembered && box.anchor === remembered.anchor ? remembered.textAnchor :
        p.x >= box.x + box.w ? "end" : p.x <= box.x ? "start" : "middle";
      const textLeft = box.x + 4, textRight = box.x + box.w - 4 - (caption.disclosure ? 16 : 0);
      labels.push({
        ...box,
        detailLevel,
        textAnchor,
        textX: textAnchor === "end" ? textRight : textAnchor === "start" ? textLeft : (textLeft + textRight)/2,
        variant,
        nodeX: p.x,
        nodeY: p.y,
        opacity: Math.min(1, Math.max(0, (0.975 - distance) / 0.035)),
        id: p.id,
        lines,
        meta,
        content,
        dateLines,
        dateY,
        dateLineHeight,
        ...typography,
        titleSize,
        detailSize,
        metaSize,
        contentLines,
        detailLineHeight,
        disclosure: caption.disclosure,
        titleLineHeight,
        titleY,
        detailY,
        metaY,
        weight,
        distance,
      });
      placed = true;
      break;
    }
    if (!placed) continue;
  }
  return labels;
}
