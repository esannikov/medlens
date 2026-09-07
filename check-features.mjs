import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createLensModel} from "./src/focus/model.ts";
import {analyteIdentity, comparableSeries, recordQuality, recordStates, sharedSourceCandidates, unitDisplay} from "./src/features/clinical.ts";
import {comparisonRows, tableMembership} from "./src/features/table.ts";
import {emptyTaskQuery, filterTaskNodes, queryErrors} from "./src/features/query.ts";
import {timelineCounts} from "./src/features/time.ts";

const all = {cutoff: null, undated: true, group: null};
function object(id, type, payload, day = null) {
  return {object_id: id, version_id: `v-${id}`, object_type: type,
    clinical_time: {start: day, status: day ? "recorded" : "not_recorded"}, payload, provenance: {source_record_ids: []}};
}
function fixture(specs) {
  const objects = [object("patient", "patient", {display_label: "Fixture"})], edges = [], sources = [];
  for (const [i, spec] of specs.entries()) {
    const id = spec.id || `ob-${i}`, event = `ev-${i}`, specimen = `sp-${i}`, source = spec.source || `sr-${i}`;
    objects.push(object(event, "clinical_event", {title_uk: `Дослідження ${i}`, event_kind: spec.domain || "laboratory_panel",
      times: spec.issued ? [{kind: "issued", date: spec.issued}] : []}, spec.day || null));
    objects.push(object(specimen, "specimen", {specimen_type: spec.material || "serum", source_literal: spec.materialLiteral || "сироватка крові"}));
    const observation = object(id, "observation", {
      concept: {source_literal: spec.literal || "Показник Ω"},
      value: spec.value || {number: i + 1}, source_unit: "г/л", method: "METHOD-A",
      ...spec.payload,
    }, spec.ownDay || null);
    observation.provenance = {source_record_ids: [source], ...spec.provenance};
    objects.push(observation);
    edges.push({id: `e-${i}`, source: event, target: specimen, relation: "has_specimen"},
      {id: `o-${i}`, source: event, target: id, relation: "has_observation"},
      {id: `s-${i}`, source: specimen, target: id, relation: "derived_from_specimen"});
    if (!sources.some(s => s.id === source)) sources.push({id: source, literal: `Дослівне джерело фрагмент-${i}`, source_order: i, locator: {}, derived_pdf_page: i + 1});
  }
  return {schema: "hematoboard.experimental.radial/0.1", case_id: "FIXTURE", graph_hash: "fixture", candidate_hash: "fixture", clinician_accepted: false,
    objects, edges, sources, facts: [], hypotheses: [], relations: []};
}

const data = fixture([{day: "2026-01-01"}, {day: "2026-02-01"}, {issued: "2026-03-01"}, {},
  {day: "2026-04-01", payload: {method: "METHOD-B"}},
  {day: "2026-05-01", material: "blood", materialLiteral: "кров"},
  {day: "2026-06-01", payload: {source_unit: "Г/л"}},
  {day: "2026-07-01", payload: {source_unit: null, value: {text: "42 г/л"}}},
  {day: "2026-08-01", payload: {method: null}},
  {day: "2026-09-01", payload: {comparator: "lt"}},
  {day: "2026-10-01", domain: "imaging_study"},
]);
const original = JSON.stringify(data), lm = createLensModel(data), anchor = lm.nodes.get("ob-0");
assert.equal(unitDisplay(anchor.object), "г/л");
assert.equal(unitDisplay({...anchor.object, payload: {...anchor.object.payload, source_unit: "×10⁹/л", canonical_unit: "10*9/L"}}, true), "10⁹/л");
assert.equal(unitDisplay({...anchor.object, payload: {source_unit: "Г/л", canonical_unit: "g/L"}}, false), "Г/л", "Source case carries unit meaning");
assert.equal(unitDisplay({...anchor.object, payload: {source_unit: null, value: {text: "42 г/л"}}}, true), "Не зазначено", "No unit extraction from prose");
assert.equal(unitDisplay({...anchor.object, payload: {source_unit: "u", canonical_unit: "unknown-custom-unit"}}, true), "u", "Unverified scale equivalence must not change unit spelling");
assert.equal(unitDisplay({...anchor.object, payload: {source_unit: "мг/л", canonical_unit: "g/L"}}, true), "мг/л", "No scale change without a value conversion contract");
assert.equal(unitDisplay({...anchor.object, payload: {source_unit: "Г/л", canonical_unit: "g/L"}}, true), "Г/л", "Uppercase giga must not become grams");
assert.deepEqual(recordStates(anchor.object), {assertion: "not supplied", verification: "not supplied", compatibility: "not supplied"});
assert.deepEqual(recordStates({...anchor.object, provenance: {assertion_mode: "source_stated", verification_state: "source_verified"}, payload: {compatibility_receipt: {status: "partial"}}}),
  {assertion: "source_stated", verification: "source_verified", compatibility: "partial"});
assert.equal(recordStates({...anchor.object, provenance: {verification_state: "pending"}, payload: {verification_state: "source_verified"}}).verification, "pending / source_verified", "Conflicting supplied states remain visible");
assert(!recordQuality(lm, lm.nodes.get("ob-7")).some(f => f.code === "missing_unit"), "Text values do not imply a required physical unit");
assert(recordQuality(lm, {...anchor,object:{...anchor.object,payload:{...anchor.object.payload,source_unit:null}}}).some(f=>f.code==='missing_unit'));
assert(recordQuality(lm, lm.nodes.get("ob-2")).some(f => f.code === "issued_date"));
assert(recordQuality(lm, lm.nodes.get("ob-3")).some(f => f.code === "unknown_date"));

const series = comparableSeries(lm, anchor, {...all, group: "group:laboratory_panel"});
assert.deepEqual(series.points.map(p => p.id), ["ob-0", "ob-1"]);
assert.equal(series.reason, null);
assert.equal(series.allPoints.length, 11, "All exact-name records remain available, including exclusions");
assert(series.excluded.find(e => e.id === "ob-2").reasons.some(r => r.includes("дата видачі")));
assert(series.excluded.find(e => e.id === "ob-4").reasons.includes("Інший метод"));
assert(series.excluded.find(e => e.id === "ob-5").reasons.some(r => r.includes("Інший матеріал")));
assert(series.excluded.find(e => e.id === "ob-6").reasons.some(r => r.includes("Інша одиниця")));
assert(series.excluded.find(e => e.id === "ob-7").reasons.includes("Точного числового поля немає"));
assert(series.excluded.find(e => e.id === "ob-8").reasons.some(r => r.includes("Метод не зазначено")));
assert(series.excluded.find(e => e.id === "ob-9").reasons.some(r => r.includes("компаратором")));
assert(series.excluded.find(e => e.id === "ob-10").reasons.includes("Поза поточним відбором"));
assert(comparableSeries(lm, lm.nodes.get("ob-8"), all).reason.includes("метод не зазначено"));
assert.equal(comparableSeries(lm, lm.nodes.get("ob-8"), all).points.length, 0);
assert(comparableSeries(lm, anchor, {...all, cutoff: "2026-01-01"}).reason.includes("Менше двох"));

const repeated = createLensModel(fixture([{day: "2026-01-01", source: "shared"}, {day: "2026-02-01", source: "shared"}]));
assert.deepEqual(sharedSourceCandidates(repeated, repeated.nodes.get("ob-0")).map(n => n.id), ["ob-1"]);
assert.equal(comparableSeries(repeated, repeated.nodes.get("ob-0"), all).points.length, 0, "Potential copied source is not a second independent measurement");
assert.equal(comparableSeries(repeated, repeated.nodes.get("ob-0"), all).allPoints.length, 2, "Duplicate candidates are never merged");
const sameDate = createLensModel(fixture([{day: "2026-01-01"}, {day: "2026-01-01"}]));
assert(comparableSeries(sameDate, sameDate.nodes.get("ob-0"), all).reason.includes("одну дату"));
for (const unknownMethod of [null, "unknown", "not_recorded", {status: "unknown"}]) {
  const unknown = createLensModel(fixture([{day: "2026-01-01", payload: {method: unknownMethod}}, {day: "2026-02-01", payload: {method: unknownMethod}}]));
  assert.equal(comparableSeries(unknown, unknown.nodes.get("ob-0"), all).points.length, 0);
}
const coded = {...anchor.object, payload: {...anchor.object.payload, concept: {source_literal: "alpha", mapping_status: "candidate", coding: {system: "s", code: "c"}}}};
assert.notEqual(analyteIdentity(coded), analyteIdentity({...coded, payload: {...coded.payload, concept: {...coded.payload.concept, source_literal: "beta"}}}), "Candidate mapping does not combine aliases");

const early = {...all, cutoff: "2026-01-01", undated: false};
const late = {...all, cutoff: "2026-02-01", undated: false};
assert.deepEqual(comparisonRows(lm, early, late).map(n => n.id), comparisonRows(lm, late, early).map(n => n.id), "A union B is symmetric when B predates A");
assert(comparisonRows(lm, early, late).some(n => n.id === "ob-1"), "A-only records remain when current B is earlier");
assert.equal(tableMembership(lm, "ob-1", early), "Пізніше кінцевої дати");
assert.equal(tableMembership(lm, "ob-1", late), "У відборі");
assert.equal(tableMembership(lm, "ob-3", all), "У відборі · без дати");
assert.equal(tableMembership(lm, "ob-3", early), "Виключено · без дати");
const lab = {...all, group: "group:laboratory_panel"}, imaging = {...all, group: "group:imaging_study"};
assert.deepEqual(comparisonRows(lm, lab, imaging).map(n => n.id), comparisonRows(lm, imaging, lab).map(n => n.id));
for (const row of comparisonRows(lm, early, late)) for (const ancestor of lm.ancestors(row.id)) assert(comparisonRows(lm, early, late).some(n => n.id === ancestor.id));
assert.equal(tableMembership(lm, "ob-10", lab), "Поза обраною групою");

const query = emptyTaskQuery();
assert.equal(filterTaskNodes(lm, all, query).length, data.objects.length - 1);
assert.deepEqual(filterTaskNodes(lm, all, {...query, text: "Показник Ω", kinds: ["observation"], from: "2026-02-01", to: "2026-03-01"}).map(n => n.id), ["ob-1", "ob-2"]);
assert.deepEqual(filterTaskNodes(lm, all, {...query, kinds: ["observation"], basis: "issued"}).map(n => n.id), ["ob-2"]);
assert(!filterTaskNodes(lm, all, {...query, basis: "clinical"}).some(n => n.id === "ob-2"));
assert.deepEqual(filterTaskNodes(lm, all, {...query, basis: "unknown", kinds: ["observation"]}).map(n => n.id), ["ob-3"]);
assert.equal(filterTaskNodes(lm, all, {...query, basis: "unknown", from: "2026-01-01"}).length, 0, "Unknown dates cannot pass an explicit range");
assert.equal(filterTaskNodes(lm, all, {...query, from: "2026-02-30"}).length, 0);
assert(queryErrors({...query, from: "2026-02-01", to: "2026-01-01"}).length);
assert.equal(filterTaskNodes(lm, all, {...query, text: "nonexistent", domain: "group:imaging_study"}).length, 0);
assert.deepEqual(filterTaskNodes(lm, all, {...query, text: "Дослівне фрагмент-1", kinds: ["observation"], domain: "group:laboratory_panel"}).map(n => n.id), ["ob-1"]);
assert.deepEqual(timelineCounts(lm, all), {clinical: 9, issued: 1, unknown: 1, total: 11});
assert.deepEqual(timelineCounts(lm, early), {clinical: 1, issued: 0, unknown: 0, total: 1});
assert.equal(JSON.stringify(data), original, "Helpers must not mutate supplied data");

const published = JSON.parse(readFileSync(new URL("./public/data/case024.json", import.meta.url), "utf8"));
const before = JSON.stringify(published), publicModel = createLensModel(published);
for (const node of publicModel.order.filter(n => n.object)) {
  unitDisplay(node.object); unitDisplay(node.object, true); recordStates(node.object); recordQuality(publicModel, node);
  if (node.kind === "observation") {
    const series = comparableSeries(publicModel, node, all);
    assert(series.allPoints.some(point => point.id === node.id));
    for (const point of series.points) assert(["own", "study"].includes(point.basis));
  }
}
const dates = timelineCounts(publicModel, all);
assert.equal(dates.clinical + dates.issued + dates.unknown, dates.total);
assert.equal(dates.total, publicModel.m.results.length);
assert.equal(JSON.stringify(published), before);
console.log("Feature checks passed: source/canonical units; quality fields; strict series and candidate lists; symmetric table union; date/query semantics; published snapshot immutability.");
