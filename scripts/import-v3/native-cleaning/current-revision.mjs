// Pure source selection / reconciliation only. No imports, I/O, target IDs or authority.
// Input is one complete, upstream-bounded source cohort, not a paginated fragment.
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const integer = /^(?:0|[1-9]\d*|-[1-9]\d*)$/;
function refuse(code) { throw Object.assign(new Error(code), { code }); }
function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) refuse('SOURCE_RECORD_REQUIRED');
  return value;
}
function own(value, key) {
  record(value);
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) refuse('SOURCE_OWN_DATA_FIELD_REQUIRED');
  return d.value;
}
function rows(value) {
  if (!Array.isArray(value)) refuse('DENSE_SOURCE_ARRAY_REQUIRED');
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, 'value')) refuse('DENSE_SOURCE_ARRAY_REQUIRED');
    result.push(record(d.value));
  }
  return result;
}
function sourceUuid(value) {
  if (typeof value !== 'string' || !uuid.test(value)) refuse('CANONICAL_SOURCE_UUID_REQUIRED');
  return value; // Exact PostgreSQL uuid::text representation; never cast/name-match/generate.
}
function int32(value) {
  if (typeof value === 'number' && Number.isInteger(value) && !Object.is(value, -0)
      && value >= -2147483648 && value <= 2147483647) return value;
  if (typeof value === 'string' && value.length <= 11 && integer.test(value)) {
    const n = BigInt(value);
    if (n >= -2147483648n && n <= 2147483647n) return Number(n);
  }
  refuse('INVALID_PG_INT32_REPRESENTATION');
}

/** command.js:136–143 joins r.document_id=d.id AND r.revision=d.current_revision.
 * Returned indices identify supplied original rows; bodies and other header fields
 * are neither read recursively nor copied/serialized/transformed. No write eligibility.
 */
export function selectCurrentRevisionPointers({ documents, revisions }) {
  const headers = rows(documents), history = rows(revisions), byDocument = new Map();
  for (let documentIndex = 0; documentIndex < headers.length; documentIndex++) {
    const d = headers[documentIndex], id = sourceUuid(own(d, 'id'));
    const currentRevision = int32(own(d, 'current_revision'));
    if (byDocument.has(id)) refuse('DUPLICATE_DOCUMENT_ID');
    byDocument.set(id, { documentIndex, currentRevision, revisions: new Map() });
  }
  for (let revisionIndex = 0; revisionIndex < history.length; revisionIndex++) {
    const r = history[revisionIndex], id = sourceUuid(own(r, 'document_id'));
    const n = int32(own(r, 'revision')), originalImported = own(r, 'original_imported');
    if (typeof originalImported !== 'boolean') refuse('ORIGINAL_IMPORTED_BOOLEAN_REQUIRED');
    // jsonb NOT NULL permits JSON null. Missing/undefined cannot represent that fact.
    if (own(r, 'body') === undefined) refuse('REVISION_BODY_REPRESENTATION_REQUIRED');
    const owner = byDocument.get(id);
    if (!owner) refuse('REVISION_DOCUMENT_OUTSIDE_COHORT');
    if (owner.revisions.has(n)) refuse('DUPLICATE_REVISION_KEY');
    owner.revisions.set(n, { revisionIndex, originalImported });
  }
  const selected = [];
  for (const [documentId, h] of byDocument) {
    const r = h.revisions.get(h.currentRevision);
    if (!r) refuse('CURRENT_REVISION_MISSING');
    selected.push({ documentIndex: h.documentIndex, revisionIndex: r.revisionIndex,
      documentId, currentRevision: h.currentRevision, originalImported: r.originalImported });
  }
  return { selected, counts: { documents: headers.length, revisions: history.length,
    selected: selected.length, unselectedRevisions: history.length - selected.length } };
}
