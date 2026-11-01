// DRAFT / SOURCE-EXCERPT MODEL ONLY. No I/O, target IDs, writer, or data approval.
// Only validated JSON-shaped inputs in the explicitly documented narrow domain.
function refuse(code) { throw Object.assign(new Error(code), { code }); }
function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) refuse('PLAIN_JSON_OBJECT_REQUIRED');
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) refuse('JSON_STRING_KEYS_REQUIRED');
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('JSON_OWN_DATA_REQUIRED');
  }
  return value;
}
function jsonCopy(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).some(key => key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(String(key)))) refuse('DENSE_JSON_ARRAY_REQUIRED');
    return Array.from({ length: value.length }, (_, i) => {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !Object.hasOwn(d, 'value')) refuse('DENSE_JSON_ARRAY_REQUIRED');
      return jsonCopy(d.value);
    });
  }
  object(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonCopy(item)]));
}
function text(value) {
  if (typeof value !== 'string' || value.length === 0) refuse('EXACT_NONEMPTY_ID_REQUIRED');
  return value; // Deliberately no trim, lowercase, UUID cast, name matching or target generation.
}
function list(value) { if (!Array.isArray(value)) refuse('ARRAY_REQUIRED'); return jsonCopy(value); }
function optionalObject(value) { return value === null ? null : object(value); }
// Membership reads only required metadata, never validates or copies business body.
function uniqueRows(rows, requiredDeleted = false) {
  if (!Array.isArray(rows)) refuse('ARRAY_REQUIRED');
  if (Reflect.ownKeys(rows).some(key => key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(String(key)))) refuse('DENSE_JSON_ARRAY_REQUIRED');
  const result = new Map();
  for (let i = 0; i < rows.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(rows, String(i));
    if (!slot || !Object.hasOwn(slot, 'value')) refuse('DENSE_JSON_ARRAY_REQUIRED');
    const row = slot.value;
    if (row === null || typeof row !== 'object' || Array.isArray(row)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(row))) refuse('PLAIN_JSON_OBJECT_REQUIRED');
    const metadata = key => {
      const d = Object.getOwnPropertyDescriptor(row, key);
      if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) refuse('JSON_OWN_DATA_REQUIRED');
      return d.value;
    };
    const id = text(metadata('id'));
    if (result.has(id)) refuse('DUPLICATE_SOURCE_ID');
    const deleted = requiredDeleted ? metadata('deleted') : undefined;
    if (requiredDeleted && typeof deleted !== 'boolean') refuse('TYPED_DELETED_BOOLEAN_REQUIRED');
    result.set(id, requiredDeleted ? { id, deleted } : { id });
  }
  return result;
}

// catalog.js:29–53. This is row membership only, NOT an attribute/price merge.
// Output iteration follows supplied rows for reproducibility, not a SQL/UI ordering claim.
export function productMembership({ sourceRows, overlayRows }) {
  const source = uniqueRows(sourceRows), overlay = uniqueRows(overlayRows, true), result = [];
  for (const id of source.keys()) {
    if (overlay.get(id)?.deleted !== true) result.push({ id, branch: 'SOURCE' });
  }
  for (const [id, row] of overlay) {
    if (!row.deleted && !source.has(id)) result.push({ id, branch: 'OVERLAY_ONLY' });
  }
  return result;
}

function priceTextOrNull(value) {
  if (value !== null && typeof value !== 'string') refuse('UNSUPPORTED_PRICE_JSON_TYPE');
  return value; // No decimal coercion, precision change, unit assumption or empty-string repair.
}
// sales/references.js:14–15. Models only string/null values from ordinary JSON objects.
// profile/overlay explicit null stops; source explicit null still falls through SQL COALESCE.
export function minimumPriceText({ profile, overlay, sourcePayload }) {
  for (const body of [optionalObject(profile), optionalObject(overlay)]) {
    if (body && Object.hasOwn(body, 'minimumPrice')) return priceTextOrNull(body.minimumPrice);
  }
  const source = optionalObject(sourcePayload);
  if (!source) return null;
  if (Object.hasOwn(source, 'minimumPrice')) {
    const direct = priceTextOrNull(source.minimumPrice);
    if (direct !== null) return direct;
  }
  if (!Object.hasOwn(source, 'source') || source.source === null) return null;
  const original = object(source.source);
  return Object.hasOwn(original, '最低售价') ? priceTextOrNull(original['最低售价']) : null;
}

function master(value) {
  const row = jsonCopy(value);
  object(row); text(row.kind); text(row.id); object(row.body);
  return row;
}
function sameRecord(base, overlay) {
  if (base && (base.kind !== overlay.kind || base.id !== overlay.id)) refuse('EXACT_KIND_AND_ID_REQUIRED');
}
// products/masters.js:8–15 AFTER base-row construction, not the raw source/static factory.
export function mergeProductMasterRecord({ base, overlay }) {
  const prior = base === null ? null : master(base), next = master(overlay);
  sameRecord(prior, next);
  return { ...next, body: { ...(prior?.body ?? {}), ...next.body } };
}
// security/master-data.js:171–190 AFTER caller's specialized fund/party projection.
// Whole maintained body/sourceFacts/version replace the base; no source-key backfill.
export function replaceBusinessMasterRecord({ base, maintained }) {
  const prior = base === null ? null : master(base), next = master(maintained);
  sameRecord(prior, next);
  object(next.sourceFacts);
  return next;
}
