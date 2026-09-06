export type Obj = {
  object_id: string;
  version_id: string;
  object_type:
    | "patient"
    | "clinical_event"
    | "specimen"
    | "observation"
    | "finding"
    | "temporal_relation";
  clinical_time: { start: string | null; status: string; basis?: string };
  payload: Record<string, any>;
  provenance: Record<string, any>;
};
export type Relation = {
  direction: "support" | "refute" | "neutral";
  hypothesis_id: string;
  rationale: string;
  source_ref: {
    object_id: string;
    version_id: string;
    source_fact_ids: string[];
  };
};
export type Snapshot = {
  schema: string;
  case_id: string;
  graph_hash: string;
  candidate_hash: string;
  clinician_accepted: boolean;
  semantic_issue?: string | null;
  graph_only?: boolean;
  review_hold?: { status: string; reasons: string[]; receipt_sha256: string } | null;
  objects: Obj[];
  edges: {
    id: string;
    relation: string;
    source: string;
    target: string;
    context_ref?: string;
  }[];
  facts: {
    id: string;
    source_record_ids: string[];
    label: string;
    value: Record<string, any>;
  }[];
  sources: {
    id: string;
    literal: string;
    source_order: number;
    locator: Record<string, any>;
    derived_pdf_page: number | null;
  }[];
  hypotheses: {
    id: string;
    short_label: string;
    rank: number | null;
    clinical_role: string;
    summary: string;
    missing_evidence: string[];
    applicability_limits: string[];
  }[];
  relations: Relation[];
};
export const domains: Record<
  string,
  { label: string; color: string; short: string }
> = {
  pathology_procedure: { label: "Морфологія", color: "#7951a7", short: "М" },
  imaging_study: { label: "Візуалізація", color: "#306697", short: "КТ" },
  laboratory_panel: { label: "Лабораторія", color: "#2a7b79", short: "Л" },
};
export const domain = (o: Obj) =>
  domains[o.payload.event_kind] ?? {
    label: "Інше",
    color: "#606575",
    short: "Д",
  };
export const date = (v?: string | null) =>
  v ? v.split("-").reverse().join(".") : "Дату не зазначено";
export const timeRoles: Record<string, string> = {
  specimen_collection: "Забір матеріалу",
  collected: "Забір матеріалу",
  ordered: "Замовлення",
  registered: "Реєстрація",
  issued: "Видача результату",
  performed: "Проведення",
  procedure: "Процедура",
  effective: "Клінічна дата",
  completed: "Завершення",
  comparison_endpoint: "Дата порівняння",
  unknown: "Роль дати не встановлена",
};
export const directionLabels = {
  support: "Підтримує",
  refute: "Суперечить",
  neutral: "Не розмежовує",
};
export const kindNames: Record<string, string> = {
  patient: "Пацієнт",
  clinical_event: "Дослідження",
  specimen: "Матеріал",
  observation: "Спостереження",
  finding: "Знахідка",
  temporal_relation: "Часовий зв’язок",
};
export function label(o: Obj): string {
  const p = o.payload;
  if (o.object_type === "clinical_event") return p.title_uk || "Дослідження";
  if (o.object_type === "patient") return p.display_label || p.case_id;
  if (o.object_type === "specimen")
    return p.source_literal || "Матеріал не зазначено";
  if (o.object_type === "observation")
    return p.concept?.source_literal || "Показник без назви";
  if (o.object_type === "temporal_relation")
    return p.relation_type === "decreased_from"
      ? "Зменшення від попереднього дослідження"
      : p.relation_type === "unchanged_from"
        ? "Без змін від попереднього дослідження"
        : p.relation_type;
  return p.details || "Знахідка без опису";
}
export function short(s: string, n = 60) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
export function value(o: Obj) {
  const p = o.payload,
    v = p.value;
  const cmp = p.comparator
    ? { lt: "<", le: "≤", gt: ">", ge: "≥", eq: "=" }[p.comparator as string] ||
      p.comparator
    : "";
  return v?.number !== undefined
    ? `${cmp}${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 20, useGrouping: false }).format(v.number)}`
    : (v?.text ?? "—");
}
export const reference = (o: Obj): string =>
  typeof o.payload.reference_range === "string"
    ? o.payload.reference_range
    : o.payload.reference_range?.text || "Не зазначено";
export function eventDate(o: Obj) {
  const times = o.payload.times ?? [];
  const exact = times.filter((t: any) => t.date === o.clinical_time.start);
  return `${date(o.clinical_time.start)} · ${
    exact.length
      ? exact
          .map((t: any) => timeRoles[t.kind] || t.kind)
          .join(" / ")
          .toLocaleLowerCase("uk-UA")
      : "дата дослідження"
  }`;
}
export function createModel(data: Snapshot) {
  if (data.schema !== "hematoboard.experimental.radial/0.1")
    throw new Error("Непідтримуваний формат графа");
  const byId = new Map(data.objects.map((o) => [o.object_id, o]));
  if (byId.size !== data.objects.length)
    throw new Error("Повторювана ідентичність об’єкта");
  for (const e of data.edges)
    if (!byId.has(e.source) || !byId.has(e.target))
      throw new Error("Неповний зв’язок у графі");
  const order = Object.keys(domains);
  const events = data.objects
    .filter((o) => o.object_type === "clinical_event")
    .sort(
      (a, b) =>
        order.indexOf(a.payload.event_kind) -
          order.indexOf(b.payload.event_kind) ||
        (a.clinical_time.start || "9999").localeCompare(
          b.clinical_time.start || "9999",
        ) ||
        a.object_id.localeCompare(b.object_id),
    );
  const results = data.objects.filter((o) =>
    ["observation", "finding"].includes(o.object_type),
  );
  const specimens = data.objects.filter((o) => o.object_type === "specimen");
  const temporal = data.objects.filter(
    (o) => o.object_type === "temporal_relation",
  );
  const resultParent = new Map<string, string>();
  for (const o of results) {
    const parents = data.edges.filter(
      (e) =>
        ["has_observation", "yields_finding"].includes(e.relation) &&
        e.target === o.object_id,
    );
    if (parents.length !== 1)
      throw new Error("Неоднозначна належність результату");
    resultParent.set(o.object_id, parents[0].source);
  }
  const resultsFor = (id: string) =>
    results
      .filter((o) => resultParent.get(o.object_id) === id)
      .sort(
        (a, b) =>
          (a.provenance.source_record_ids?.[0] || "").localeCompare(
            b.provenance.source_record_ids?.[0] || "",
          ) || a.object_id.localeCompare(b.object_id),
      );
  const specimensFor = (id: string) =>
    specimens.filter((o) =>
      data.edges.some(
        (e) =>
          e.source === id &&
          e.target === o.object_id &&
          e.relation === "has_specimen",
      ),
    );
  const specimenFor = (o: Obj) =>
    byId.get(
      data.edges.find(
        (e) =>
          e.relation === "derived_from_specimen" && e.target === o.object_id,
      )?.source || "",
    );
  const sourceFor = (o: Obj) => {
    const ids = new Set<string>(o.provenance.source_record_ids || []);
    for (const f of data.facts)
      if ((o.payload.source_fact_ids || []).includes(f.id))
        f.source_record_ids.forEach((id) => ids.add(id));
    return data.sources
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.source_order - b.source_order);
  };
  const related = (o: Obj, h?: string) =>
    data.relations.filter(
      (r) =>
        r.source_ref.object_id === o.object_id &&
        r.source_ref.version_id === o.version_id &&
        (!h || r.hypothesis_id === h),
    );
  const searchText = new Map(
    data.objects.map((o) => [
      o.object_id,
      `${label(o)} ${value(o)} ${o.payload.source_unit || ""} ${date(o.clinical_time.start)} ${specimenFor(o) ? label(specimenFor(o)!) : ""} ${sourceFor(
        o,
      )
        .map((s) => s.literal)
        .join(" ")}`.toLocaleLowerCase("uk-UA"),
    ]),
  );
  const matches = (o: Obj, q: string) =>
    q
      .trim()
      .toLocaleLowerCase("uk-UA")
      .split(/\s+/u)
      .every((t) => searchText.get(o.object_id)?.includes(t));
  return {
    data,
    byId,
    events,
    results,
    specimens,
    temporal,
    resultsFor,
    specimensFor,
    specimenFor,
    sourceFor,
    related,
    matches,
    resultParent,
    patient: data.objects.find((o) => o.object_type === "patient")!,
  };
}
export type Model = ReturnType<typeof createModel>;
export type Point = { x: number; y: number };
export type Orbit = {
  event: Obj;
  angle: number;
  point: Point;
  textPoint: Point;
  labelLines: string[];
  labelHeight: number;
  leader: Point[];
  side: number;
  results: { object: Obj; point: Point }[];
  index: number;
};
export const polar = (a: number, r: number): Point => ({
  x: 450 + Math.cos(a) * r,
  y: 420 + Math.sin(a) * r,
});
export function wrapLabel(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/u)) {
    if (lines.length && measure(lines.at(-1)! + " " + word) <= width) {
      lines[lines.length - 1] += " " + word;
    } else if (measure(word) <= width) {
      lines.push(word);
    } else {
      let part = "";
      for (const ch of word) {
        if (part && measure(part + ch) > width) {
          lines.push(part);
          part = "";
        }
        part += ch;
      }
      if (part) lines.push(part);
    }
  }
  return lines;
}
export function layout(
  model: Model,
  measure: (text: string) => number = (text) => text.length * 8,
): Orbit[] {
  const keys = [...new Set(model.events.map((e) => e.payload.event_kind))];
  const gap = (12 * Math.PI) / 180,
    step = (2 * Math.PI - keys.length * gap) / model.events.length;
  let cursor = (-106 * Math.PI) / 180;
  const rows: Orbit[] = [];
  keys.forEach((key) => {
    model.events
      .filter((e) => e.payload.event_kind === key)
      .forEach((event) => {
        const angle = cursor + step / 2,
          point = polar(angle, 185),
          side = Math.cos(angle) >= 0 ? 1 : -1;
        const children = model.resultsFor(event.object_id);
        const rings = Math.ceil(children.length / 9),
          perRing = Math.ceil(children.length / rings);
        const results = children.map((object, j) => {
          const ring = Math.floor(j / perRing),
            col = j % perRing,
            n = Math.min(perRing, children.length - ring * perRing);
          return {
            object,
            point: polar(
              angle + ((col + 0.5) / n - 0.5) * step * 0.84,
              240 + ring * 12,
            ),
          };
        });
        const labelLines = wrapLabel(label(event), 152, measure);
        const labelHeight = labelLines.length * 18 + 23;
        rows.push({
          event,
          angle,
          point,
          textPoint: {
            x: side > 0 ? 746 : 154,
            y: polar(angle, 315).y - labelHeight / 2,
          },
          labelLines,
          labelHeight,
          leader: [],
          side,
          results,
          index: rows.length + 1,
        });
        cursor += step;
      });
    cursor += gap;
  });
  for (const side of [-1, 1]) {
    const labels = rows
      .filter((r) => r.side === side)
      .sort((a, b) => a.textPoint.y - b.textPoint.y);
    labels.forEach(
      (r, i) =>
        (r.textPoint.y = Math.max(
          r.textPoint.y,
          55,
          i ? labels[i - 1].textPoint.y + labels[i - 1].labelHeight + 16 : 0,
        )),
    );
    for (let i = labels.length - 1; i >= 0; i--) {
      const bottom =
        i === labels.length - 1 ? 795 : labels[i + 1].textPoint.y - 16;
      labels[i].textPoint.y = Math.min(
        labels[i].textPoint.y,
        bottom - labels[i].labelHeight,
      );
    }
  }
  for (const row of rows) {
    // Exit tangentially from the actual event perimeter, then travel in the
    // corridor between adjacent result fans. Labels have their own lanes.
    const corridorAngle = row.angle + step * 0.49;
    const outer = polar(corridorAngle, 292);
    const end = {
      x: row.textPoint.x - row.side * 8,
      y: row.textPoint.y + row.labelHeight / 2,
    };
    const laneX = 450 + row.side * 286;
    row.leader = [
      {
        x: row.point.x - Math.sin(row.angle) * 20,
        y: row.point.y + Math.cos(row.angle) * 20,
      },
      polar(corridorAngle, 211),
      outer,
      { x: laneX, y: outer.y },
      { x: laneX, y: end.y },
      end,
    ];
  }
  return rows;
}
