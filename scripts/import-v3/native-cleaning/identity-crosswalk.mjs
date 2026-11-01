import { types } from 'node:util';
// Given-cohort consistency only. No allocation, I/O, source authenticity or write authority.
const targetKinds = new Set(['CATEGORY', 'COLOR', 'FIT', 'SIZE', 'SIZE_GROUP', 'SEASON',
  'PRODUCT', 'SKU', 'CUSTOMER', 'SUPPLIER', 'HALL', 'WAREHOUSE', 'STAFF', 'USER_ACCOUNT',
  'PAYMENT_METHOD', 'PAYMENT_ACCOUNT']);
const refuse = code => { throw Object.assign(new TypeError(code), { code }); };
function record(value, keys) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) refuse('INVALID_CROSSWALK_RECORD');
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) refuse('INVALID_CROSSWALK_RECORD');
  const result = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) refuse('INVALID_CROSSWALK_RECORD');
    result[key] = d.value;
  }
  return result;
}
function dense(value) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > 100000 || Reflect.ownKeys(value).length !== value.length + 1) refuse('BOUNDED_DENSE_CROSSWALK_ARRAY_REQUIRED');
  const rows = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) refuse('BOUNDED_DENSE_CROSSWALK_ARRAY_REQUIRED');
    rows.push(d.value);
  }
  return rows;
}
function text(value, max, budget) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > max || value.includes('\0')) refuse('INVALID_CROSSWALK_TEXT');
  budget.bytes += Buffer.byteLength(value);
  if (budget.bytes > 32 * 1024 * 1024) refuse('CROSSWALK_METADATA_BUDGET_EXCEEDED');
  return value; // Never trim, case-fold, Unicode-normalize, name-match or cast source IDs.
}
function slot(row, budget) {
  text(row.sourceKind, 128, budget); text(row.sourceId, 4096, budget); text(row.targetKind, 128, budget);
  if (!targetKinds.has(row.targetKind)) refuse('UNSUPPORTED_UUID_TARGET_KIND');
  return { sourceKind: row.sourceKind, sourceId: row.sourceId, targetKind: row.targetKind };
}
const ownSlot = ['sourceKind', 'sourceId', 'targetKind'];
const freeze = Object.freeze;
/** Demands must be independently enumerated from a complete declared source cohort.
 * Deriving demands from mappings would only prove self-consistency, not coverage.
 * Dedicated writer/alias/composite-key/role/auth constraints remain mandatory later.
 */
export function validateIdentityCrosswalk(input) {
  const r = record(input, ['sourceNamespace', 'targetNamespace', 'demands', 'mappings', 'references']);
  const budget = { bytes: 0 };
  const sourceNamespace = text(r.sourceNamespace, 1024, budget), targetNamespace = text(r.targetNamespace, 1024, budget);
  const demands = dense(r.demands), mappings = dense(r.mappings), references = dense(r.references);
  // Namespaces are fixed for this invocation; never share these maps between calls.
  // Avoid repeating a long fixed namespace inside every stored key.
  const key = s => JSON.stringify([s.sourceKind, s.sourceId, s.targetKind]);
  const byDemand = new Map(), byMapping = new Map(), targetOwners = new Set();
  for (let demandIndex = 0; demandIndex < demands.length; demandIndex++) {
    const d = slot(record(demands[demandIndex], ownSlot), budget), k = key(d);
    if (byDemand.has(k)) refuse('DUPLICATE_IDENTITY_DEMAND');
    byDemand.set(k, { demandIndex, slot: d });
  }
  for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex++) {
    const raw = record(mappings[mappingIndex], [...ownSlot, 'targetId']), m = slot(raw, budget), k = key(m);
    if (typeof raw.targetId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(raw.targetId)) refuse('CANONICAL_TARGET_UUID_REQUIRED');
    text(raw.targetId, 36, budget);
    if (byMapping.has(k)) refuse('DUPLICATE_IDENTITY_MAPPING');
    if (!byDemand.has(k)) refuse('MAPPING_OUTSIDE_GIVEN_COHORT');
    const targetKey = JSON.stringify([m.targetKind, raw.targetId]);
    if (targetOwners.has(targetKey)) refuse('UNREVIEWED_MANY_TO_ONE_MAPPING');
    targetOwners.add(targetKey); byMapping.set(k, { mappingIndex, ...m, targetId: raw.targetId });
  }
  const identities = [];
  for (const [k, d] of byDemand) {
    const mapping = byMapping.get(k);
    if (!mapping) refuse('MISSING_EXPLICIT_IDENTITY_MAPPING');
    identities.push(freeze({ demandIndex: d.demandIndex, ...mapping }));
  }
  const referenceIds = new Set(), resolved = [];
  for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex++) {
    const raw = record(references[referenceIndex], ['referenceId', ...ownSlot]), s = slot(raw, budget);
    const referenceId = text(raw.referenceId, 4096, budget);
    if (referenceIds.has(referenceId)) refuse('DUPLICATE_REFERENCE_ID');
    referenceIds.add(referenceId);
    const k = key(s), demand = byDemand.get(k), mapping = byMapping.get(k);
    if (!demand || !mapping) refuse('REFERENCE_OUTSIDE_GIVEN_COHORT');
    resolved.push(freeze({ referenceIndex, demandIndex: demand.demandIndex,
      mappingIndex: mapping.mappingIndex, referenceId, ...s, targetId: mapping.targetId }));
  }
  return freeze({ status: 'CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED', sourceNamespace, targetNamespace,
    identities: freeze(identities), references: freeze(resolved),
    counts: freeze({ demands: demands.length, mappings: mappings.length, references: references.length }) });
}
