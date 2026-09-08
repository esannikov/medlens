import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  lensGeometry,
  placeLabels,
  overlaps,
  crosses,
  preview,
  wrapText,
  lensTypography,
  graphCaption,
  connectionStyle,
} from "./src/focus/layout.ts";
import {
  createLensModel,
  focusPoint,
  geodesic,
  norm,
  compareScopes,
  issueDate,
} from "./src/focus/model.ts";
const data = JSON.parse(
  readFileSync(new URL("./public/data/case024.json", import.meta.url), "utf8"),
);
const frozen = JSON.stringify(data),
  lm = createLensModel(data),
  all = { cutoff: null, undated: true, group: null };
assert.equal(lm.order.filter((n) => n.object).length, data.objects.length);
assert.equal(lm.order.filter((n) => n.object).length, 185);
assert.equal(lm.count(lm.root, all).visibleResults, 148);
assert.equal(new Set(lm.order.map((n) => n.id)).size, lm.order.length);
let mathChecks = 0;
for (const n of lm.order) {
  assert.equal(lm.ancestors(n.id).at(-1).id, n.id);
  if (n.parent) assert.equal(lm.nodes.get(n.parent).depth + 1, n.depth);
  if (n.object)
    assert.strictEqual(
      n.object,
      data.objects.find((o) => o.object_id === n.id),
    );
  for (const key of ["p2"]) {
    assert(norm(n[key]) < 1);
    assert(norm(focusPoint(n[key], n[key])) < 1e-7);
    for (const p of lm.order) {
      const mapped = focusPoint(p[key], n[key]);
      assert(mapped.every(Number.isFinite));
      assert(norm(mapped) < 1 + 1e-9);
      const original = focusPoint(
        mapped,
        n[key].map((v) => -v),
      );
      assert(norm(original.map((v, i) => v - p[key][i])) < 1e-7);
      mathChecks++;
    }
  }
}
for (const e of lm.displayEdges) {
  const a = lm.nodes.get(e.source),
    b = lm.nodes.get(e.target);
  for (const key of ["p2"]) {
    const path = geodesic(a[key], b[key]);
    assert(norm(path[0].map((v, i) => v - a[key][i])) < 1e-7);
    assert(norm(path.at(-1).map((v, i) => v - b[key][i])) < 1e-7);
    assert(path.every((p) => p.every(Number.isFinite) && norm(p) < 1));
  }
  if (!e.grouping)
    assert(
      data.edges.some((x) => x.source === e.source && x.target === e.target),
    );
}
const first = { ...all, cutoff: lm.days[0] },
  last = { ...all, cutoff: lm.days.at(-1) };
assert.equal(compareScopes(lm, first, last).onlyA.length, 0);
for (const n of lm.order.filter((n) => n.object && n.kind !== "patient")) {
  const t = lm.times.get(n.id);
  if (t.basis === "unknown") {
    assert(lm.eligible(n.id, first));
    assert(!lm.eligible(n.id, { ...all, undated: false }));
  }
  if (t.basis === "study") {
    assert.equal(n.object.clinical_time.start, null);
    assert.equal(t.day, lm.eventFor(n).clinical_time.start);
  }
  if (t.day && t.day > first.cutoff) assert(!lm.eligible(n.id, first));
}
const administrativeOnly = lm.m.events.filter(
  (e) =>
    e.clinical_time.start === null &&
    e.payload.times?.some((t) => t.kind === "issued"),
);
assert(administrativeOnly.length > 0);
assert(
  administrativeOnly.every(
    (e) => lm.times.get(e.object_id).basis === "issued",
  ),
  "Use the explicit issue date when clinical time is unknown",
);
assert.equal(administrativeOnly.length,7);
assert.equal(lm.m.results.filter(o=>lm.times.get(o.object_id).basis==="issued").length,76);
assert.equal(lm.days.at(-1),"2026-08-24");
for(const n of lm.order.filter(n=>n.object && n.kind!=="patient" && n.kind!=="temporal_relation")) {
  const t=lm.times.get(n.id);
  if(n.object.clinical_time.start) {
    assert.equal(t.basis,"own");
    assert.equal(t.day,n.object.clinical_time.start,"Do not replace a known clinical date with a later issue date");
  }
  if(t.basis==="issued") {
    assert.equal(n.object.clinical_time.start,null);
    assert.equal(t.day,issueDate(lm.eventFor(n)));
    const previousDay=new Date(Date.parse(t.day+"T00:00:00Z")-86400000).toISOString().slice(0,10);
    assert(!lm.eligible(n.id,{...all,cutoff:previousDay}),"Undated toggle must not bypass an issue-date cutoff");
    assert(lm.eligible(n.id,{...all,cutoff:t.day}));
  }
}
const mockEvent=(times)=>({...administrativeOnly[0],payload:{...administrativeOnly[0].payload,times}});
assert.equal(issueDate(mockEvent([{kind:"registered",date:"2026-04-09"},{kind:"ordered",date:"2026-04-10"}])),null);
assert.equal(issueDate(mockEvent([{kind:"issued",date:"2026-04-20"},{kind:"issued",date:"2026-04-21"}])),null);
assert.equal(issueDate(mockEvent([{kind:"issued",date:"2026-02-30"}])),null);
assert.equal(issueDate(mockEvent([{kind:"issued",date:"2026-04-20"},{kind:"issued",date:"2026-04-20"}])),"2026-04-20");
const urineStudy=lm.m.events.find(e=>e.payload.title_uk==="Загальний аналіз сечі");
assert(lm.matches(urineStudy.object_id,"аналіз сечі 19.08.2026"));
const lab = { ...all, group: "group:laboratory_panel" };
assert(
  lm.order
    .filter((n) => n.kind === "clinical_event" && lm.eligible(n.id, lab))
    .every((n) => n.object.payload.event_kind === "laboratory_panel"),
);
assert.equal(lm.eligible("group:imaging_study", lab), false);
assert.equal(JSON.stringify(data), frozen);
let layoutChecks = 0,
  labelsChecked = 0,
  captionFallbacks = 0,
  navigationChecks = 0;
// Conservative deterministic metrics; browser QA independently uses actual rendered fonts.
const measure = (text, font = "12.5px") =>
  Array.from(text).reduce(
    (sum, char) => sum + (/\s/.test(char) ? 4 : /[МШЩЖW]/.test(char) ? 11 : 7),
    0,
  ) *
  (Number(font.match(/([\d.]+)px/)?.[1] || 12.5) / 12.5);
assert(lm.order.filter(n => n.kind === "finding").every(n => preview(lm,n,all).content === ""),
  "Finding labels must not repeat source boilerplate");
const longStudy = lm.order.find(n => n.kind === "clinical_event" && n.title.startsWith("Патоморфологічне"));
const studyGeometry = lensGeometry(lm,longStudy.id,all,longStudy.p2,1440,800);
const studyLabel = placeLabels(lm,longStudy.id,all,studyGeometry.points,studyGeometry.paths,1440,800,measure)
  .find(b => b.id === longStudy.id);
assert.equal(studyLabel?.lines.join(" "),longStudy.title,"The large central study title must be complete");
const serum=lm.order.find(n=>n.kind==="specimen" && n.title==="сироватка крові" && lm.eventFor(n)?.payload.title_uk==="Електрофорез та імунофіксація крові та сечі");
const serumGeometry=lensGeometry(lm,serum.id,all,serum.p2,1440,800);
assert(placeLabels(lm,serum.id,all,serumGeometry.points,serumGeometry.paths,1440,800,measure).some(b=>b.id===serum.id),
  "The central material name must remain present inside a result fan");
for(const t of [0,0.25,0.5,1]) {
  const route=connectionStyle(t,"route","balanced"),branch=connectionStyle(t,"branch","balanced"),context=connectionStyle(t,"context","balanced");
  assert(route.width>branch.width && branch.width>context.width,"Stroke hierarchy identifies navigation, branch and context");
  assert(connectionStyle(t,"branch","bold").width>branch.width && connectionStyle(t,"branch","fine").width<branch.width);
  assert(context.width>=0.65,"Context connections remain present");
}
for (const n of lm.order) {
  const caption=graphCaption(lm,n);
  assert(!caption.title.includes("…"), "Navigation captions must not be clipped clinical assertions");
  if (!caption.disclosure) assert.equal(caption.title,n.title);
  else assert(n.title.length > 110, "Short clinical statements must stay verbatim, including uncertainty");
}
for (const n of lm.order.filter(n => n.kind === "finding" && n.title.length <= 110))
  assert.equal(graphCaption(lm,n).title,n.title, "Do not lose negation or question marks");
const narrativeHeading=lm.order.find(n=>n.title.startsWith("Анаплазовані клітини не виявлені. Заключення:"));
assert(!graphCaption(lm,narrativeHeading).title.includes("Заключення"), "A narrative sentence is not a navigation heading");
// Reproduce the reported circular drag: previously the same title teleported
// 140–280px between the eight independent placement slots.
let motionChecks = 0;
for (const title of [
  "Електрофорез та імунофіксація крові та сечі",
  "Загальний аналіз сечі",
]) {
  const node = lm.order.find(n => n.kind === "clinical_event" && n.title === title);
  const memory = new Map();
  let previous;
  for (let i = 0; i < 90; i++) {
    const angle = i / 90 * Math.PI * 2;
    const focus = focusPoint([0.13 * Math.cos(angle), 0.13 * Math.sin(angle)], node.p2.map(v => -v));
    const g = lensGeometry(lm, lm.root, all, focus, 1440, 800);
    const labels = placeLabels(lm, lm.root, all, g.points, g.paths, 1440, 800, measure, memory, true);
    const current = labels.find(b => b.id === node.id);
    if (current && previous) {
      assert(Math.hypot(current.x - previous.x, current.y - previous.y) < 35,
        "A label must follow its node, not jump to a different side during drag");
      motionChecks++;
    }
    previous = current;
    labels.forEach(b => memory.set(b.id, b));
  }
  const g = lensGeometry(lm, lm.root, all, node.p2, 1440, 800);
  const labels = placeLabels(lm, lm.root, all, g.points, g.paths, 1440, 800, measure);
  assert(labels.some(b => norm(focusPoint(lm.nodes.get(b.id).p2,node.p2)) > 0.90 && lm.nodes.get(b.id).kind === "observation" && b.contentLines.length),
    "Show result values before they reach the inner lens");
}
assert.equal(motionChecks, 178, "Both long study captions must remain visible throughout the circular drag");
assert.doesNotMatch(
  readFileSync(new URL("./src/focus/Lens.tsx", import.meta.url), "utf8"),
  /\[lm, selected, scope, points, paths, size, measure,\s*moving\]/,
  "Changing only the motion flag must not invalidate the label layout on pointerup",
);
assert.doesNotMatch(readFileSync(new URL("./src/focus/Lens.tsx",import.meta.url),"utf8"),
  /useEffect\(\(\) => \{ labelMemory\.current\.clear\(\); \}/,
  "A passive effect must not erase the just-committed placement after resize");
for (let i = 1; i <= 100; i++) {
  assert(
    lensTypography(i / 100).titleSize < lensTypography((i - 1) / 100).titleSize,
  );
  assert(
    lensTypography(i / 100).detailSize <
      lensTypography((i - 1) / 100).detailSize,
  );
}
assert.equal(lensTypography(0).titleSize, 21);
assert.equal(lensTypography(1).titleSize, 11.5);
for (const [width, height] of [
  [1440, 646],
  [1280, 616],
  [729, 616],
  [390, 459],
]) {
  for (const n of lm.order) {
    const g = lensGeometry(lm, n.id, all, n.p2, width, height);
    assert.equal(
      g.paths.length,
      lm.displayEdges.length,
      "Peripheral connections must not be culled",
    );
    assert(
      g.points.every((p) => p.radius >= 3.8),
      "Peripheral marks must remain visible",
    );
    assert(
      g.points.every(
        (p) => p.id === lm.root || g.paths.some((e) => e.target === p.id),
      ),
      "Every non-root node has a connection",
    );
    const browsing = lensGeometry(lm, lm.root, all, n.p2, width, height);
    assert.equal(
      browsing.centerId,
      n.id,
      "Geometric focus must not stay on the last clicked node",
    );
    assert.equal(browsing.ctx.node.id, n.id, "Context follows the moving lens");
    navigationChecks++;
    const boxes = placeLabels(
      lm,
      n.id,
      all,
      g.points,
      g.paths,
      width,
      height,
      measure,
    );
    if (!boxes.some((b) => b.id === n.id)) {
      // A persistent exact-title focus caption is always visible. At tightly
      // clustered positions do not force a body over another clinical record.
      const point = g.points.find((p) => p.id === n.id);
      assert(
        Math.abs(point.x - width / 2) < 1e-5 &&
          Math.abs(point.y - height / 2) < 1e-5,
      );
      assert(n.title.trim().length > 0);
      captionFallbacks++;
    }
    for (const b of boxes) {
      const nodePoint=g.points.find(p=>p.id===b.id);
      if(nodePoint.x>=b.x+b.w)assert.equal(b.textAnchor,"end","Left-hand captions align toward their own node");
      if(nodePoint.x<=b.x)assert.equal(b.textAnchor,"start","Right-hand captions align toward their own node");
      assert(b.textX>=b.x+4 && b.textX<=b.x+b.w-4);
      assert.equal(b.lines.join(" "),graphCaption(lm,lm.nodes.get(b.id)).title.replace(/\s+/g," "),
        "Every displayed label is complete navigation text");
      assert.equal(b.contentLines.join(" "),b.content.replace(/\s+/g," "), "Displayed values must not be ellipsized");
      for(const line of b.contentLines)
        assert(measure(line,`${b.detailSize}px`) <= b.w-8+1e-6,`Full value fits: ${b.id}, variant ${b.variant}, needs ${measure(line,`${b.detailSize}px`)}, available ${b.w-8}`);
      assert(b.h >= (b.variant>=9?32:44), "Compact ink boxes are separate from 44px SVG hit areas");
      for (const other of boxes)
        if (other.id !== b.id) assert(!overlaps(b, other), "Label collision");
      const anchor = g.points.find((p) => p.id === b.id);
      const separation = Math.hypot(
        Math.max(b.x - anchor.x, 0, anchor.x - b.x - b.w),
        Math.max(b.y - anchor.y, 0, anchor.y - b.y - b.h),
      );
      assert(
        separation <= (anchor.radius + 12 + (b.anchor>=32?26:0)) * Math.SQRT2 + 1e-6,
        "Text must remain beside its node",
      );
      assert(b.anchor>=0&&b.anchor<64,'Only the immediate or nearby fallback anchor ring');
      for (const p of g.points)
        assert(
          !overlaps(b, {
            x: p.x - p.radius,
            y: p.y - p.radius,
            w: p.radius * 2,
            h: p.radius * 2,
          }),
          "Text covers a node",
        );
      for (const path of g.paths) {
        if (path.source === b.id || path.target === b.id) continue;
        if (!path.local && !path.ancestor) continue;
        const points = path.points;
        const inner = {
          x: b.x + 0.02,
          y: b.y + 0.02,
          w: b.w - 0.04,
          h: b.h - 0.04,
        };
        for (let i = 1; i < points.length; i++)
          assert(
            !crosses(inner, points[i - 1], points[i]),
            "Active branch connection crosses another label",
          );
      }
      assert(
        b.lines.every(
          (line) =>
            measure(line, `${b.weight} ${b.titleSize}px`) <= b.w - 8 + 1e-9,
        ),
        `Wrapped title exceeds box ${b.id}: ${Math.max(...b.lines.map((line) => measure(line, `${b.weight} ${b.titleSize}px`))) - (b.w - 8)}px`,
      );
      if (
        ["clinical_event", "temporal_relation"].includes(
          lm.nodes.get(b.id).kind,
        )
      )
        assert(
          b.dateLines.length > 0,
          "Study/comparison date must be labelled",
        );
      labelsChecked++;
    }
    layoutChecks++;
  }
}
const longWord = "М".repeat(90);
for (const t of lm.m.temporal) {
  const current = lm.m.byId.get(t.payload.current.object_id);
  assert.equal(
    lm.nodes.get(t.object_id).title,
    current.payload.details.replace(/^ВИСНОВОК:\s*/iu, ""),
  );
  assert.equal(lm.times.get(t.object_id).basis, "comparison");
  assert(
    !lm.eligible(t.object_id, {
      ...all,
      cutoff: t.payload.prior.clinical_time,
    }),
    "A later comparison must not appear at the earlier endpoint date",
  );
  assert(
    lm.eligible(t.object_id, {
      ...all,
      cutoff: t.payload.current.clinical_time,
    }),
  );
}
assert.equal(
  new Set(lm.m.temporal.map((t) => lm.nodes.get(t.object_id).title)).size,
  lm.m.temporal.length,
  "Comparison captions identify different subjects",
);
assert(wrapText(longWord, 120, measure).every((line) => measure(line) <= 120));
for (const file of ["Lens.tsx", "model.ts", "main.tsx", "layout.ts"]) {
  const source = readFileSync(
    new URL(`./src/focus/${file}`, import.meta.url),
    "utf8",
  );
  assert(
    !/Canvas3D|\bp3\b|from ["']three["']|Лінза 3D/.test(source),
    `Removed lens code remains in ${file}`,
  );
}
assert(
  !readFileSync(
    new URL("./src/focus/Lens.tsx", import.meta.url),
    "utf8",
  ).includes("<line "),
  "Leader lines must not return",
);
const appSource = readFileSync(new URL("./src/focus/main.tsx", import.meta.url), "utf8");
assert.match(appSource, /const displayId=mode==='2d'\?navigationId:selected/, "Reader and links follow the actual lens focus without recentering it");
assert.match(appSource, /const node = lm.nodes.get\(displayId\)!/, "The focused node owns the reader content");
assert.match(appSource, /sourceOwner.current===displayId\?sourceId:null/, "An old record source must not leak into a new focus");
for (const n of lm.order.filter(
  (n) => n.kind === "clinical_event" || n.kind === "specimen",
))
  assert(
    preview(lm, n, first).content.includes(
      String(lm.count(n.id, first).visibleResults),
    ),
  );
console.log(
  JSON.stringify({
    status: "PASS",
    objects: data.objects.length,
    results: 148,
    displayDays: lm.days.length,
    navigationGroups: lm.order.filter((n) => !n.object).length,
    mathChecks,
    layoutChecks,
    labelsChecked,
    captionFallbacks,
    navigationChecks,
    motionChecks,
    scope:
      "2D focus navigation; thin context connections; unboxed adjacent text protecting nodes and active branch; continuous type scale; dates and comparison endpoints; no clinical mutation",
  }),
);
