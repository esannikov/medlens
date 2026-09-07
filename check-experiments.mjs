import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLensModel } from "./src/focus/model.ts";
import { pairedStudyMembers, experimentUrl, explicitStudyComparisons, matchesTextMention, paneVariants,
  regroupLayout, regroupObjects, scopedObjects, studyMembers } from "./src/experiments/model.ts";

const data = JSON.parse(readFileSync(new URL("./public/data/case024.json", import.meta.url), "utf8"));
const before = JSON.stringify(data);
const freeze = value => {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); }
};
freeze(data);
const lm = createLensModel(data), all = { cutoff: null, undated: true, group: null };
const scopes = [all, { ...all, undated: false }, ...lm.days.map(cutoff => ({ ...all, cutoff })),
  ...lm.groups.map(group => ({ ...all, group })), { ...all, cutoff: "1900-01-01", undated: false }];
let memberships = 0;
for (const scope of scopes) {
  const expected = scopedObjects(lm, scope).map(n => n.id).sort();
  for (const by of ["material", "date", "type"]) {
    const groups = regroupObjects(lm, scope, by), layout = regroupLayout(groups);
    const ids = layout.rows.flatMap(row => row.points.map(p => p.id));
    assert.deepEqual([...ids].sort(), expected, `${by} must preserve every allowed object once`);
    assert.equal(new Set(ids).size, ids.length);
    for (const row of layout.rows) for (const point of row.points) {
      assert(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert(point.x > 0 && point.x < layout.width && point.y > 0 && point.y < layout.height);
      assert(lm.eligible(point.id, scope)); memberships++;
    }
    for (const query of ["кістков", "не визначено", "unmatchable-token"]) {
      for (const n of regroupObjects(lm, scope, by, query).flatMap(g => g.nodes)) {
        assert(expected.includes(n.id));
        assert(matchesTextMention(n.object, query));
      }
    }
  }
  const studies = scopedObjects(lm, scope).filter(n => n.kind === "clinical_event");
  for (let i = 0; i < studies.length; i++) {
    const a = studies[i].id, b = studies[(i + 1) % studies.length].id;
    const layout = pairedStudyMembers(lm, [a, b], scope);
    for (const pole of layout) {
      const members = studyMembers(lm, pole.id, scope);
      const expectedMembers = [lm.nodes.get(pole.id), ...lm.nodes.get(pole.id).descendants.map(id => lm.nodes.get(id))]
        .filter(n => n.object && lm.eligible(n.id, scope)).map(n => n.id).sort();
      assert.deepEqual(members.map(n => n.id).sort(), expectedMembers, "full study membership");
      assert.deepEqual(pole.nodes.map(n => n.id).sort(), expectedMembers, "every member remains available in each linked lens inventory");
      assert.equal(new Set(pole.nodes.map(n => n.id)).size, members.length);
      for (const p of pole.nodes) {
        assert(lm.eligible(p.id, scope)); memberships++;
      }
    }
    for (const n of explicitStudyComparisons(lm, a, b, scope)) {
      assert.equal(n.kind, "temporal_relation"); assert(lm.eligible(n.id, scope));
      assert.deepEqual(explicitStudyComparisons(lm, a, b, scope), explicitStudyComparisons(lm, b, a, scope));
    }
  }
}
assert.equal(scopedObjects(lm, all).length, data.objects.length);
assert.deepEqual(studyMembers(lm, "missing", all), []);
assert.deepEqual(studyMembers(lm, lm.root, all), []);
assert.deepEqual(explicitStudyComparisons(lm, lm.m.events[0].object_id, lm.m.events[0].object_id, all), []);

const mentionObject = { object_type: "finding", payload: { details: "Легені без інфільтратів." } };
assert(matchesTextMention(mentionObject, "легені"), "negated mentions are still literal mentions, never localization claims");
assert(!matchesTextMention(mentionObject, "кістковий мозок"));
assert(!matchesTextMention({ object_type: "observation", payload: { concept: { source_literal: "Гемоглобін" }, value: { number: 112 } },
  provenance: { source_record_ids: ["легені"] } }, "легені"), "provenance and shared source IDs are not object mentions");

for (const pane of paneVariants) {
  for (const embedded of [false, true]) {
    const url = new URL(experimentUrl(pane, "https://example.org/medlens/?query=private-text#source", embedded));
    assert.equal(url.origin, "https://example.org");
    assert.equal(url.pathname, pane === "control" ? "/medlens/control/index.html" : "/medlens/");
    assert.equal(url.searchParams.get("embed"), embedded ? "1" : null);
    assert.equal(url.searchParams.get("lens"), pane === "control" ? null : pane);
    assert(!url.href.includes("private-text")); assert.equal(url.hash, "");
  }
}
assert.equal(new URL(experimentUrl("dual", "https://example.org/medlens/index.html?query=x")).pathname, "/medlens/");
assert.throws(() => experimentUrl("lab", "https://example.org/medlens/", true));
assert.throws(() => experimentUrl("https://outside.example", "https://example.org/medlens/"));
assert.throws(() => experimentUrl("../control", "https://example.org/medlens/"));
assert.throws(() => experimentUrl("dual", "file:///private/record"));
assert(!paneVariants.includes("lab"), "iframe selector must never offer recursive labs");
assert.equal(JSON.stringify(data), before, "experiment helpers must never change the clinical snapshot");
console.log(`Experiment checks passed: ${scopes.length} scopes, ${memberships} memberships, exact IDs and local URL allowlist.`);
