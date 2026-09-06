// Offline, explicit export only. Input files are never copied into the repository.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { approvedInputs, verifyInput } from './approved-inputs.mjs';
const [graphPath, scopePath, packagePath] = process.argv.slice(2);
assert(graphPath && scopePath && packagePath, 'Usage: node scripts/export-publication.mjs GRAPH SCOPE PUBLIC_PACKAGE');
verifyInput(readFileSync(graphPath), approvedInputs.graph);
verifyInput(readFileSync(packagePath), approvedInputs.publicPackage);
const parse = p => JSON.parse(readFileSync(p, 'utf8'));
const graph = parse(graphPath), scope = parse(scopePath), published = parse(packagePath);
const entry = scope.cases.find(c => c.case_id === graph.case_scope.case_id);
assert(entry?.privacy_review?.human_verified === true);
assert(entry.privacy_review.external_publication === true);
assert.equal(entry.status, 'published_candidate');
assert.equal(entry.source_document_sha256, entry.privacy_review.deidentified_sha256);
assert.equal(graph.case_scope.source_document_sha256, entry.source_document_sha256);
assert.equal(graph.case_scope.clinical_input_sha256, entry.clinical_input_sha256);
assert.equal(published.publication.publication_authorized_by_user, true);
assert(!published.publication.review_hold, 'A review hold prevents this export');
assert.equal(published.publication.source_case_id, entry.case_id);
assert.equal(published.publication.patient_graph_state_sha256, graph.state_manifest.graph_state_sha256);
assert.equal(published.projection.clinical_input_sha256, entry.clinical_input_sha256);
const publicObjects = new Map(published.patient_projection.objects.map(o => [o.object_id, o]));
const allowedPayload = {
  patient: ['age_as_of','age_years','case_id','direct_identifiers_included','display_label','sex'],
  clinical_event: ['collection_time_status','date_binding_status','event_kind','order_date_status','order_group_id','result_issue_time_status','source_fact_ids','structured_observation_status','study_id','times','title_uk'],
  specimen: ['collection_time_status','event_id','source_literal','specimen_key','specimen_type'],
  observation: ['canonical_unit','clinical_time_role','comparator','concept','event_id','method','reference_range','source_binding_id','source_fact_ids','source_unit','specimen_id','value'],
  finding: ['assertion_status','body_site_basis','body_sites','details','event_id','finding_type','source_binding_id','source_fact_ids','specimen_id'],
  temporal_relation: ['compatibility_receipt','current','prior','relation_type'],
};
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k,o[k]]));
const objects = graph.objects.map(o => {
  assert.equal(publicObjects.get(o.object_id)?.version_id, o.version_id, 'Object version differs from the public release');
  const payload = pick(o.payload, allowedPayload[o.object_type]);
  assert.deepEqual(payload, o.payload, 'Unexpected payload field: review before publication');
  assert(o.object_type !== 'patient' || payload.direct_identifiers_included === false);
  return {
    ...pick(o, ['object_id','version_id','object_type','clinical_time']), payload,
    provenance: pick(o.provenance, ['source_record_ids','source_record_pages','verification_state','transcription_status','assertion_mode']),
  };
});
const sources = published.projection.source_records.map(s => ({
  ...pick(s, ['id','literal','source_order','derived_pdf_page']),
  locator: pick(s.locator || {}, ['page','paragraph_index','table_index','row_index','cell_index']),
}));
const sourceIds = new Set(sources.map(s => s.id));
for (const o of objects) for (const id of o.provenance.source_record_ids || [])
  assert(sourceIds.has(id), 'Source is absent from the approved public package');
const snapshot = {
  schema: 'hematoboard.experimental.radial/0.1', case_id: entry.case_id,
  graph_hash: graph.state_manifest.graph_state_sha256, candidate_hash: '',
  graph_only: true, clinician_accepted: false, semantic_issue: null, review_hold: null,
  objects,
  edges: graph.structural_edges.map(e => pick(e, ['id','relation','source','target','context_ref'])),
  facts: published.projection.facts.map(f => pick(f, ['id','source_record_ids','label','value'])),
  sources, hypotheses: [], relations: [],
};
const bytes = JSON.stringify(snapshot, null, 2) + '\n';
assert(!/\/Users\/|["\s]\.local\/|file:\/\/|session=|localhost|127\.0\.0\.1|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bytes), 'Private locator or identifier in export');
const sha = data => createHash('sha256').update(data).digest('hex');
writeFileSync(new URL('../public/data/case024.json', import.meta.url), bytes);
writeFileSync(new URL('../public/data/publication.json', import.meta.url), JSON.stringify({
  schema: 'medlens.publication/1.0', case_id: entry.case_id, exported_on: '2026-09-06',
  source: 'https://esannikov.github.io/hematoboard/case024/public-dashboard.v1.json',
  source_package_sha256: sha(readFileSync(packagePath)), source_graph_file_sha256: approvedInputs.graph,
  patient_graph_sha256: snapshot.graph_hash, projection_sha256: sha(bytes),
  privacy_receipt_sha256: entry.privacy_review.receipt_sha256,
  external_publication_authorized: true, objects: objects.length,
  results: objects.filter(o => ['observation','finding'].includes(o.object_type)).length,
  structural_edges: snapshot.edges.length,
  component_available: true, case_wired: true,
  technical_verification: 'npm test, npm run build, plus separate live-browser deployment check',
  clinician_accepted: false,
  exclusions: ['original documents','images','local paths','session credentials','candidate hypotheses','private receipts'],
}, null, 2) + '\n');
console.log(JSON.stringify({status:'PASS', objects:objects.length, sources:sources.length, projection_sha256:sha(bytes)}));
