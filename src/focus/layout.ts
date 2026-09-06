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

export const nodeKinds: Record<LensNode["kind"], string> = {
  patient: "Досьє",
  group: "Розділ",
  clinical_event: "Дослідження",
  specimen: "Матеріал",
  observation: "Показник",
  finding: "Опис знахідки",
  temporal_relation: "Зміна між дослідженнями",
};
export function preview(lm: LensModel, n: LensNode, scope: Scope) {
  const counts = lm.count(n.id, scope);
  const content =
    n.kind === "observation"
      ? `${value(n.object!)} ${n.object!.payload.source_unit || ""}`.trim()
      : n.kind === "finding"
        ? "Точний опис і джерело"
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
    action: n.children.length ? "Розкрити вміст" : "Читати запис і джерело",
  };
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
  anchor: number;
  variant: number;
  opacity: number;
  nodeX: number;
  nodeY: number;
  id: string;
  lines: string[];
  meta: string;
  content: string;
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
const titleFont =
  "600 12.5px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const family = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
export function lensTypography(distance: number) {
  const near = Math.max(0, Math.min(1, 1 - distance));
  return {
    titleSize: 11.5 + 14.5 * near ** 0.8,
    detailSize: 10 + 8 * near ** 0.8,
    metaSize: 10 + 3 * near ** 0.8,
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
) {
  const labels: Label[] = [];
  const candidates = points
    .filter((p) => p.active && norm(p.p) < 0.975)
    .sort((a, b) => norm(a.p) - norm(b.p));
  for (const p of candidates) {
    if (labels.length >= (width < 600 ? 12 : 24)) break;
    const n = lm.nodes.get(p.id)!,
      info = preview(lm, n, scope),
      chosen = p.id === selected;
    const remembered = previous.get(p.id);
    const distance = norm(p.p),
      typography = lensTypography(distance);
    const { titleSize, detailSize, metaSize } = typography;
    const weight = chosen ? 700 : 550;
    const titleFont = `${weight} ${titleSize}px ${family}`,
      valueFont = `${detailSize}px ${family}`,
      metaFont = `${metaSize}px ${family}`;
    const brief = info.content
          .replace(/дослідження|досліджень/g, "досл.")
          .replace(/результатів|результати|результат/g, "рез.");
    // Focus is already named in the fixed orientation bar. Do not add/remove
    // a line inside the moving label when nearest-node identity changes.
    const meta = chosen ? "Обрано" : "";
    const widths = width < 600 ? [216, 178, 142] : [284, 238, 196];
    const variants = remembered
      ? moving ? [remembered.variant] : [remembered.variant, ...[0, 1, 2].filter(i => i !== remembered.variant)]
      : [0, 1, 2];
    let placed = false;
    for (const variant of variants) {
      // Typeset once in a fixed coordinate system; scale that composition.
      // No 1/2/3-line or width switch at arbitrary lens radii.
      const scale = titleSize / 26;
      const longestWord = Math.max(...n.title.split(/\s+/).map(word => measure(word, `700 26px ${family}`)));
      const baseWidth = Math.min(width - 24, Math.max(widths[variant], longestWord + 8));
      const lines = wrapText(n.title, baseWidth - 8, measure,
        `700 26px ${family}`, n.kind === "clinical_event" ? 3 : 2);
      const limit = (baseWidth - 8) * scale + 8;
      const dateText =
        n.kind === "clinical_event" || n.kind === "temporal_relation"
          ? lm.times.get(n.id)!.text
          : "";
      const dateLines = dateText
        ? wrapText(dateText, limit - 8, measure, metaFont, 2)
        : [];
      const content =
        wrapText(brief, limit - 8, measure, valueFont, 1)[0] || "";
      const w = Math.min(
        limit,
        Math.max(
          76,
          ...lines.map((t) => measure(t, titleFont) + 8),
          ...dateLines.map((t) => measure(t, metaFont) + 8),
          measure(content, valueFont) + 8,
          meta ? measure(meta, metaFont) + 8 : 0,
        ),
      );
      const titleLineHeight = titleSize * 1.2;
      const metaBand = meta ? metaSize * 1.3 + 3 : 0;
      const dateLineHeight = metaSize * 1.25,
        dateBand = dateLines.length ? dateLines.length * dateLineHeight + 3 : 0;
      const inkHeight =
        metaBand +
        lines.length * titleLineHeight +
        dateBand +
        detailSize * 1.25 +
        3;
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
      const gap = p.radius + 12;
      const positions = Array.from({length: 32}, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 16;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const reach = Math.min((w / 2 + gap) / Math.max(1e-9, Math.abs(dx)),
          (h / 2 + gap) / Math.max(1e-9, Math.abs(dy)));
        return {x: p.x + dx * reach - w / 2, y: p.y + dy * reach - h / 2};
      });
      const anchors = remembered
        ? moving ? [0,-1,1,-2,2].map(d => (remembered.anchor + d + 32) % 32)
          : [remembered.anchor, ...positions.map((_, i) => i).filter(i => i !== remembered.anchor)]
        : positions.map((_, i) => i);
      const trials = anchors
        .map((anchor) => ({ ...positions[anchor], w, h, anchor }))
        .filter(b => !moving || !remembered || Math.hypot(
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
            !points.some((o) =>
              overlaps(b, {
                x: o.x - o.radius - 6,
                y: o.y - o.radius - 6,
                w: (o.radius + 6) * 2,
                h: (o.radius + 6) * 2,
              }),
            ),
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
      const box = trials.find(b => b.anchor === remembered?.anchor && clear(b, false)) ||
        trials.find((b) => clear(b, true)) || trials.find((b) => clear(b, false));
      if (!box) continue;
      labels.push({
        ...box,
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
