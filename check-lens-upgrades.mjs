import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLensModel, focusPoint } from "./src/focus/model.ts";
import { activeResultCoverage, exactStructuralEdges, keyboardDestination, lensGeometry, lensTypography, placeLabels, preview, graphCaption, overlaps } from "./src/focus/layout.ts";

const data = JSON.parse(readFileSync(new URL("./public/data/case024.json", import.meta.url), "utf8"));
const frozen = JSON.stringify(data);
const lm = createLensModel(data);
const all = { cutoff: null, undated: true, group: null };
const scopes = [all, { ...all, cutoff: lm.days[3] }, { ...all, undated: false }, { ...all, group: "group:laboratory_panel" }];
const measure = (text, font) => Array.from(text).reduce((sum, char) => sum + (/\s/.test(char) ? 4 : /[МШЩЖW]/.test(char) ? 11 : 7), 0) * Number(font.match(/([\d.]+)px/)?.[1] || 12.5) / 12.5;
let coverageChecks = 0;
for (const scope of scopes) {
  assert.equal(activeResultCoverage(lm, lm.root, scope, []), null, "Dossier counts are not result coverage");
  for (const group of lm.groups) assert.equal(activeResultCoverage(lm, group, scope, []), null, "Grouping context does not masquerade as results");
  for (const owner of lm.order.filter(n => n.kind === "clinical_event" || n.kind === "specimen")) {
    const expected = owner.kind === "clinical_event" ? lm.m.resultsFor(owner.id).map(o => o.object_id)
      : lm.m.results.filter(o => lm.m.specimenFor(o)?.object_id === owner.id && lm.m.resultParent.get(o.object_id) === owner.parent).map(o => o.object_id);
    const eligible = expected.filter(id => lm.eligible(id, scope));
    for (const [width, height, scale] of [[1440, 700, 1], [390, 380, 1.3]]) {
      const geometry = lensGeometry(lm, lm.root, scope, owner.p2, width, height);
      const labels = placeLabels(lm, lm.root, scope, geometry.points, geometry.paths, width, height, measure, new Map(), false, undefined,
        { textScale: scale, centerId: geometry.centerId });
      const coverage = activeResultCoverage(lm, owner.id, scope, labels);
      assert.equal(coverage.owner.id, owner.id);
      assert.deepEqual([...coverage.all].sort(), [...expected].sort(), "Coverage follows exact study/material ownership");
      assert.deepEqual([...coverage.eligible].sort(), [...eligible].sort(), "Date/category filters apply before coverage");
      assert.deepEqual([...coverage.displayed, ...coverage.hidden].sort(), [...eligible].sort(), "Every eligible result is accounted for once");
      assert.equal(new Set([...coverage.displayed, ...coverage.hidden]).size, eligible.length);
      assert(coverage.displayed.every(id => labels.some(label => label.id === id && label.opacity >= 0.95)));
      assert(coverage.excluded.every(id => !lm.eligible(id, scope)));
      for (const label of labels) {
        assert(label.x >= 10 && label.y >= 10 && label.x + label.w <= width - 10 && label.y + label.h <= height - 48);
        for (const other of labels) if (other.id !== label.id) assert(!overlaps(label, other), "Scaled labels do not collide");
        for (const line of label.contentLines) assert(measure(line, `${label.detailSize}px`) <= label.w - 8 + 1e-6, "Scaled values remain complete");
      }
      coverageChecks++;
    }
  }
}
const specimenResult = lm.order.find(n => n.kind === "observation" && lm.nodes.get(n.parent)?.kind === "specimen");
const coverage = activeResultCoverage(lm, specimenResult.id, all, [{id: specimenResult.id, opacity: 0.5}]);
assert.equal(coverage.owner.id, specimenResult.parent);
assert(coverage.hidden.includes(specimenResult.id), "A faded caption cannot be claimed readable");
assert(!coverage.displayed.includes(specimenResult.id));
assert.equal(activeResultCoverage(lm, specimenResult.id, all, [{id: specimenResult.id, opacity: 1}, {id: specimenResult.id, opacity: 1}]).displayed.length, 1);

let edgeChecks = 0;
for (const node of lm.order) {
  const edges = exactStructuralEdges(lm, node.id);
  assert(edges.every(edge => data.edges.includes(edge)), "Exact edges retain their supplied identity");
  assert(edges.every(edge => edge.source === node.id || edge.target === node.id));
  assert.deepEqual(edges.map(edge => edge.id), node.object ? data.edges.filter(edge => edge.source === node.id || edge.target === node.id).map(edge => edge.id) : []);
  const trace = exactStructuralEdges(lm, node.id, true);
  assert.equal(new Set(trace.map(edge => edge.id)).size, trace.length);
  assert(trace.every(edge => data.edges.includes(edge)));
  assert(!trace.some(edge => edge.source.startsWith("group:") || edge.target.startsWith("group:")), "Display grouping never becomes provenance");
  for (const edge of trace) {
    const downstream = new Set([edge.target]);
    for (let i = 0; i < trace.length; i++) for (const next of trace) if (downstream.has(next.source)) downstream.add(next.target);
    assert(downstream.has(node.id), "Every highlighted edge reaches the selected object");
  }
  edgeChecks++;
}
assert.equal(keyboardDestination(lm, lm.root, all, "parent"), null);
for (const node of lm.order) {
  assert.equal(keyboardDestination(lm, node.id, all, "parent"), node.parent);
  assert.equal(keyboardDestination(lm, node.id, all, "child"), node.children[0] || null);
  assert.equal(keyboardDestination(lm, node.id, all, "root"), lm.root);
  const next = keyboardDestination(lm, node.id, all, "next");
  if (next) assert.equal(keyboardDestination(lm, next, all, "previous"), node.id);
}
for (const distance of [0, 0.4, 0.9]) assert.equal(lensTypography(distance, 1.3).titleSize, lensTypography(distance).titleSize * 1.3);
const unitNode = lm.order.find(n => n.kind === "observation" && n.object.payload.canonical_unit === "10*9/L");
assert(unitNode);
assert(preview(lm, unitNode, all, true).content.includes("10⁹/л"));
assert(preview(lm, unitNode, all).content.includes(unitNode.object.payload.source_unit));
const missingUnit = lm.order.find(n => n.kind === "observation" && !n.object.payload.source_unit);
assert(preview(lm, missingUnit, all).content.includes("одиницю не зазначено"));

// A fixed header is not a substitute for a label at the actual optical center.
let centerChecks = 0, compactDateFallbacks = 0;
for (const [width, height, textScale] of [[1440, 646, 1], [1280, 616, 1], [729, 616, 1], [390, 459, 1], [390, 400, 1.3]]) {
  for (const node of lm.order) {
    const geometry = lensGeometry(lm, lm.root, all, node.p2, width, height);
    const labels = placeLabels(lm, lm.root, all, geometry.points, geometry.paths, width, height, measure, new Map(), false, undefined,
      { textScale, centerId: geometry.centerId });
    const center = labels.find(label => label.id === node.id);
    assert(center, `Central caption must be represented in SVG: ${node.id} at ${width} / ${textScale}`);
    assert.equal(center.lines.join(" "), graphCaption(lm, node).title.replace(/\s+/g, " "), "The compact center keeps the complete navigation title");
    if (node.kind === "observation") assert.equal(center.content, preview(lm, node, all).content, "Compact observations keep their entire clinical value");
    if (node.kind === "clinical_event" && !center.dateLines.length) {
      assert(center.variant >= 7, "Dates yield only after all dated center variants fail");
      compactDateFallbacks++;
    }
    for (const other of labels) if (other.id !== node.id) assert(!overlaps(center, other));
    for (const point of geometry.points) assert(!overlaps(center, {x: point.x - point.radius, y: point.y - point.radius, w: point.radius * 2, h: point.radius * 2}), "Mandatory center does not cover another node");
    centerChecks++;
  }
}

const ct = lm.nodes.get("EV-ST-EEF79D3A39736877");
let centerMotionChecks = 0, largestCenterStep = 0;
for (const [width, height, textScale] of [[1440, 600, 1], [390, 459, 1], [390, 400, 1.3]]) {
  const memory = new Map();
  let previous;
  for (let i = 0; i <= 90; i++) {
    const angle = i / 90 * Math.PI * 2;
    const focus = focusPoint([0.12 * Math.cos(angle), 0.12 * Math.sin(angle)], ct.p2.map(value => -value));
    const geometry = lensGeometry(lm, ct.id, all, focus, width, height);
    const labels = placeLabels(lm, ct.id, all, geometry.points, geometry.paths, width, height, measure, memory, true, undefined,
      { textScale, centerId: geometry.centerId });
    const center = labels.find(label => label.id === ct.id);
    assert.equal(geometry.centerId, ct.id);
    assert(center, `The CT center stays present during mobile and desktop drag, frame ${i}`);
    assert.equal(center.lines.join(" "), ct.title);
    if (previous) {
      const step = Math.hypot(center.x - previous.x, center.y - previous.y);
      assert(step < 35, `Prefer a compact caption at the same anchor before moving it to the other side: ${step}px`);
      largestCenterStep = Math.max(largestCenterStep, step);
      centerMotionChecks++;
    }
    previous = center;
    labels.forEach(label => memory.set(label.id, label));
  }
  // Unusable memory from another viewport must not veto central presence.
  memory.set(ct.id, { ...previous, x: previous.x + 500, y: previous.y - 400 });
  const geometry = lensGeometry(lm, ct.id, all, ct.p2, width, height);
  assert(placeLabels(lm, ct.id, all, geometry.points, geometry.paths, width, height, measure, memory, true, undefined,
    { textScale, centerId: ct.id }).some(label => label.id === ct.id), "Center can release an impossible remembered drift constraint");
}
assert.equal(JSON.stringify(data), frozen, "Display and navigation never mutate the clinical payload");
console.log(JSON.stringify({ status: "PASS", coverageChecks, edgeChecks, centerChecks, centerMotionChecks, largestCenterStep, compactDateFallbacks, resultCount: lm.m.results.length, scope: "exact scoped result coverage, mandatory central captions, mobile enlarged text and drag, structural provenance, keyboard destinations, canonical units, immutable data" }));
