import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// Exact bytes reviewed for this fixed demo release. A different clinical
// revision needs a fresh publication review, not only updated version labels.
export const approvedInputs = Object.freeze({
  graph: '2f381b72f78a28b8892a781c222d37541d7bc8249091c104ff1764e60c8f10d3',
  publicPackage: 'e66ed2645575028c2ff9d211dcb87f473b18cc2a02b030bd07a2eceef9832a7e',
});
export function verifyInput(bytes, expected) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected,
    'Input bytes differ from the reviewed publication basis');
}
