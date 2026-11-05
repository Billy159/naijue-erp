import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCurrentRevisionPointers } from '../scripts/import-v3/native-cleaning/current-revision.mjs';
const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const document = (id: unknown = A, current_revision: unknown = 2, rest: Record<string, unknown> = {}): Record<string, unknown> => ({ id, current_revision, version: 91, active_effect_revision: 1, ...rest });
const revision = (document_id: unknown = A, n: unknown = 2, rest: Record<string, unknown> = {}): Record<string, unknown> => ({ document_id, revision: n, original_imported: true, body: { precise: '9007199254740993.1234' }, ...rest });
const select = (documents: readonly unknown[] = [document()], revisions: readonly unknown[] = [revision()]) => selectCurrentRevisionPointers({ documents, revisions });
const rejects = (fn: () => unknown, code: string) => assert.throws(fn, { code });

test('exact current_revision selects original row index, never MAX/version/active effect', () => {
  const actual = select([document()], [revision(A, 1), revision(A, 2), revision(A, 91)]);
  assert.deepEqual(actual.selected, [{ documentIndex: 0, revisionIndex: 1, documentId: A, currentRevision: 2, originalImported: true }]);
  assert.deepEqual(actual.counts, { documents: 1, revisions: 3, selected: 1, unselectedRevisions: 2 });
});
test('both document ID AND revision participate; output follows supplied header order only', () => {
  const actual = select([document(B), document(A)], [revision(A), revision(B)]);
  assert.deepEqual(actual.selected.map(x => [x.documentId, x.revisionIndex]), [[B, 1], [A, 0]]);
});
test('number and canonical decimal string are exact int32 extraction representations', () => {
  assert.equal(select([document(A, '2')], [revision(A, 2)]).selected[0]!.currentRevision, 2);
  assert.equal(select([document(A, 2)], [revision(A, '2')]).selected[0]!.currentRevision, 2);
});
test('no invented positive revision constraint: exact int32 endpoints, zero and negatives', () => {
  for (const n of [-2147483648, -1, 0, 2147483647]) {
    assert.equal(select([document(A, n)], [revision(A, String(n))]).selected[0]!.currentRevision, n);
  }
});
test('fractional/exponent/whitespace/noncanonical strings and unsafe values refuse', () => {
  for (const bad of ['02', '+2', '2.0', '2e0', ' 2', '2 ', '-0', '', '2147483648', '-2147483649', 2.1, NaN, Infinity, 2147483648, null, true, 2n, -0]) {
    rejects(() => select([document(A, bad)], [revision()]), 'INVALID_PG_INT32_REPRESENTATION');
  }
});
test('missing exact current revision refuses even when an older/newer/version-matching row exists', () => {
  rejects(() => select([document()], [revision(A, 1), revision(A, 91)]), 'CURRENT_REVISION_MISSING');
});
test('duplicate source header ID refuses rather than overwriting a Map', () => {
  rejects(() => select([document(), document()], [revision()]), 'DUPLICATE_DOCUMENT_ID');
});
test('duplicate revision compound PK refuses, including number/string alias and noncurrent rows', () => {
  rejects(() => select([document()], [revision(A, 2), revision(A, '2')]), 'DUPLICATE_REVISION_KEY');
  rejects(() => select([document()], [revision(A, 2), revision(A, 3), revision(A, '3')]), 'DUPLICATE_REVISION_KEY');
});
test('orphan within complete chosen cohort refuses; no implicit pagination/drop policy', () => {
  rejects(() => select([document()], [revision(), revision(B)]), 'REVISION_DOCUMENT_OUTSIDE_COHORT');
  rejects(() => select([], [revision()]), 'REVISION_DOCUMENT_OUTSIDE_COHORT');
});
test('empty complete cohort is empty, not a claim of real empty data', () => {
  assert.deepEqual(select([], []), { selected: [], counts: { documents: 0, revisions: 0, selected: 0, unselectedRevisions: 0 } });
});
test('body is opaque: JSON null valid, SQL NULL/JSON null not inferred from missing/undefined', () => {
  assert.equal(select([document()], [revision(A, 2, { body: null, original_imported: false })]).selected[0]!.originalImported, false);
  const missing = revision(); delete missing.body;
  rejects(() => select([document()], [missing]), 'SOURCE_OWN_DATA_FIELD_REQUIRED');
  rejects(() => select([document()], [revision(A, 2, { body: undefined })]), 'REVISION_BODY_REPRESENTATION_REQUIRED');
  rejects(() => select([document()], [revision(A, 2, { original_imported: null })]), 'ORIGINAL_IMPORTED_BOOLEAN_REQUIRED');
});
test('no traversal or serialization of original business body; result contains only pointers/counts', () => {
  let touched = 0;
  const body = Object.defineProperty({}, 'syntheticPrivateMarker', { get() { touched++; throw Error('DO_NOT_TOUCH'); } });
  const actual = select([document()], [revision(A, 2, { body })]);
  assert.equal(touched, 0);
  assert.equal(JSON.stringify(actual).includes('syntheticPrivateMarker'), false);
  assert.equal(JSON.stringify(actual).includes('precise'), false);
});
test('version and active_effect_revision are not read and cannot substitute a missing current pointer', () => {
  const d = { id: A, current_revision: 2 };
  Object.defineProperty(d, 'version', { get() { throw Error('VERSION_MUST_NOT_BE_READ'); } });
  Object.defineProperty(d, 'active_effect_revision', { get() { throw Error('EFFECT_MUST_NOT_BE_READ'); } });
  assert.equal(select([d], [revision()]).selected[0]!.currentRevision, 2);
  rejects(() => select([{ id: A, version: 2, active_effect_revision: 2 }], [revision()]), 'SOURCE_OWN_DATA_FIELD_REQUIRED');
});
test('frozen original headers/revisions/bodies remain byte-model-equivalent and unmodified', () => {
  const d = Object.freeze(document()), body = Object.freeze({ quantity: '7.0000', price: '2.1234' });
  const r = Object.freeze(revision(A, 2, { body }));
  const before = JSON.stringify({ d, r });
  select(Object.freeze([d]), Object.freeze([r]));
  assert.equal(JSON.stringify({ d, r }), before);
  assert.equal(r.body, body);
});
test('only canonical source UUID text, own-data metadata and dense arrays accepted', () => {
  rejects(() => select([document('not-a-uuid')], [revision()]), 'CANONICAL_SOURCE_UUID_REQUIRED');
  let calls = 0;
  const d = Object.defineProperty({ id: A }, 'current_revision', { enumerable: true, get() { calls++; return 2; } });
  rejects(() => select([d], [revision()]), 'SOURCE_OWN_DATA_FIELD_REQUIRED');
  assert.equal(calls, 0);
  rejects(() => select(new Array(1), []), 'DENSE_SOURCE_ARRAY_REQUIRED');
});
test('failure code never embeds source ID or business body', () => {
  try { select([document()], []); assert.fail('expected refusal'); }
  catch (error) { assert.ok(error instanceof Error && 'code' in error); assert.equal(error.code, 'CURRENT_REVISION_MISSING'); assert.equal(error.message, error.code); assert.equal(error.message.includes(A), false); }
});

// Original implementation already rejected these values; this is regression coverage, not a bug fix.
test('canonical metadata rejects final LF CR CRLF without trimming or partial regex acceptance', () => {
  for (const suffix of ['\n', '\r', '\r\n']) {
    rejects(() => select([document(A + suffix)], [revision()]), 'CANONICAL_SOURCE_UUID_REQUIRED');
    rejects(() => select([document()], [revision(A + suffix)]), 'CANONICAL_SOURCE_UUID_REQUIRED');
    rejects(() => select([document(A, '2' + suffix)], [revision()]), 'INVALID_PG_INT32_REPRESENTATION');
    rejects(() => select([document()], [revision(A, '2' + suffix)]), 'INVALID_PG_INT32_REPRESENTATION');
  }
});
