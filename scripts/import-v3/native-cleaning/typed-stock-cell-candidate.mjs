import { types } from 'node:util';
import { normalizeQuantity } from './exact-scalars.mjs';
import { validateIdentityCrosswalk } from './identity-crosswalk.mjs';
import { validateScalarReconciliation } from './record-reconciliation.mjs';
import { quantity, addQuantity } from '../../../packages/domain/src/values.ts';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const cellFields = ['runId', 'warehouseSourceId', 'skuSourceId'];
const ruleFields = ['sourceUnit', 'targetUnit', 'numerator', 'denominator', 'evidenceSha256'];
const metrics = ['OPENING', 'NET'];
function record(value, fields) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_STOCK_CANDIDATE_RECORD');
  const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(ds);
  if (keys.length !== fields.length || keys.some(k => typeof k !== 'string' || !fields.includes(k))) fail('INVALID_STOCK_CANDIDATE_FIELDS');
  const r = Object.create(null);
  for (const key of fields) {
    const d = ds[key];
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('INVALID_STOCK_CANDIDATE_PROPERTY');
    r[key] = d.value;
  }
  return r;
}
function dense(value, limit) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > limit || Reflect.ownKeys(value).length !== value.length + 1) fail('BOUNDED_STOCK_CANDIDATE_ARRAY_REQUIRED');
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('BOUNDED_STOCK_CANDIDATE_ARRAY_REQUIRED');
    result.push(d.value);
  }
  return result;
}
function text(value, limit, budget) {
  if (typeof value !== 'string' || !value.length || value.length > limit
      || value.includes('\0') || Buffer.byteLength(value) > limit) fail('INVALID_STOCK_CANDIDATE_TEXT');
  budget.bytes += Buffer.byteLength(value);
  if (budget.bytes > 32 * 1024 * 1024) fail('STOCK_CANDIDATE_INPUT_BUDGET');
  return value;
}
function cellKey(row, budget) {
  for (const field of cellFields) text(row[field], 4096, budget);
  const key = JSON.stringify(cellFields.map(f => row[f]));
  if (Buffer.byteLength(key) > 4096) fail('STOCK_CELL_TUPLE_BUDGET');
  return key;
}
function external(operation) {
  try { return operation(); } catch { fail('STOCK_CANDIDATE_CONTRACT_REJECTED'); }
}
function normalize(value, rule) {
  return external(() => normalizeQuantity({ value, sourceUnit: rule.sourceUnit, targetUnit: rule.targetUnit,
    rule: { ...rule }, nullPolicy: 'REJECT_NULL', signPolicy: 'SIGNED' }));
}
function sourceComponent(value, rule, budget) {
  text(value, 256, budget);
  // The source contract is NOT NULL numeric(18,4), with proven integer values.
  // Reject greater literal scale, fractions and a wider bigint-only source domain.
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.0{1,4})?$/.test(value)) fail('SOURCE_NUMERIC_INTEGER_REQUIRED');
  const original = normalize(value, { ...rule, targetUnit: rule.sourceUnit, numerator: '1', denominator: '1' });
  const n = BigInt(original.targetText);
  if (n < -99999999999999n || n > 99999999999999n) fail('SOURCE_NUMERIC_RANGE');
  return normalize(value, rule);
}
/** Private review data only, never a current-stock or native-writer admission token. */
export function prepareTypedStockCellReviewCandidate(input) {
  const r = record(input, ['sourceNamespace', 'targetNamespace', 'cohort', 'rules', 'sourceRows', 'expectedComponents', 'mappings']);
  const budget = { bytes: 0 };
  const sourceNamespace = text(r.sourceNamespace, 1024, budget), targetNamespace = text(r.targetNamespace, 1024, budget);
  const cohort = dense(r.cohort, 50000), sourceRows = dense(r.sourceRows, 50000),
    expectedComponents = dense(r.expectedComponents, 100000), rawRules = dense(r.rules, 50000), rawMappings = dense(r.mappings, 100000);
  const cells = new Map(), rules = new Map(), sources = new Map(), expected = new Map(), demands = new Map();
  for (const raw of cohort) {
    const c = record(raw, cellFields), key = cellKey(c, budget);
    if (cells.has(key)) fail('DUPLICATE_STOCK_COHORT_CELL');
    cells.set(key, c);
    for (const [sourceKind, sourceId] of [['WAREHOUSE', c.warehouseSourceId], ['SKU', c.skuSourceId]]) {
      demands.set(JSON.stringify([sourceKind, sourceId]), { sourceKind, sourceId, targetKind: sourceKind });
    }
  }
  for (const raw of rawRules) {
    const rule = record(raw, ruleFields);
    for (const field of ruleFields) text(rule[field], 128, budget);
    if (rules.has(rule.sourceUnit)) fail('DUPLICATE_STOCK_UNIT_RULE');
    rules.set(rule.sourceUnit, rule);
  }
  const mappings = rawMappings.map(raw => {
    const m = record(raw, ['sourceKind', 'sourceId', 'targetKind', 'targetId']);
    text(m.sourceKind, 128, budget); text(m.sourceId, 4096, budget); text(m.targetKind, 128, budget); text(m.targetId, 36, budget);
    if (!['WAREHOUSE', 'SKU'].includes(m.sourceKind) || m.targetKind !== m.sourceKind) fail('UNSUPPORTED_STOCK_MAPPING');
    return { ...m };
  });
  const crosswalk = external(() => validateIdentityCrosswalk({ sourceNamespace, targetNamespace,
    demands: [...demands.values()], mappings, references: [] }));
  const ids = new Map(crosswalk.identities.map(m => [JSON.stringify([m.sourceKind, m.sourceId]), m.targetId]));
  for (const raw of expectedComponents) {
    const e = record(raw, [...cellFields, 'metric', 'value', 'unit']), key = cellKey(e, budget);
    text(e.metric, 128, budget); text(e.value, 256, budget); text(e.unit, 128, budget);
    if (!cells.has(key) || !metrics.includes(e.metric)) fail('EXPECTED_COMPONENT_OUTSIDE_COHORT');
    const ek = JSON.stringify([key, e.metric]);
    if (expected.has(ek)) fail('DUPLICATE_EXPECTED_COMPONENT');
    expected.set(ek, e);
  }
  if (expected.size !== cells.size * 2) fail('MISSING_EXPECTED_COMPONENT');
  const groups = new Map(), mappedCells = new Set();
  for (const raw of sourceRows) {
    const s = record(raw, [...cellFields, 'sourceUnit', 'opening', 'net']), key = cellKey(s, budget);
    if (!cells.has(key)) fail('SOURCE_CELL_OUTSIDE_COHORT');
    if (sources.has(key)) fail('DUPLICATE_SOURCE_CELL');
    text(s.sourceUnit, 128, budget);
    const rule = rules.get(s.sourceUnit);
    if (!rule) fail('MISSING_STOCK_UNIT_RULE');
    const opening = sourceComponent(s.opening, rule, budget), net = sourceComponent(s.net, rule, budget);
    const warehouseId = ids.get(JSON.stringify(['WAREHOUSE', s.warehouseSourceId])), skuId = ids.get(JSON.stringify(['SKU', s.skuSourceId]));
    const mappedKey = JSON.stringify([s.runId, warehouseId, skuId]);
    if (mappedCells.has(mappedKey)) fail('MAPPED_STOCK_CELL_COLLISION');
    mappedCells.add(mappedKey);
    const componentSum = external(() => addQuantity(quantity(opening.targetText), quantity(net.targetText)).toString());
    sources.set(key, Object.freeze({ ...cells.get(key), warehouseId, skuId, sourceUnit: s.sourceUnit,
      targetUnit: rule.targetUnit, opening, net, componentSum }));
    if (!groups.has(s.sourceUnit)) groups.set(s.sourceUnit, { cohort: [], sourceRows: [], targetRows: [] });
    const group = groups.get(s.sourceUnit);
    for (const metric of metrics) {
      const slot = { sourceKind: 'TYPED_STOCK_CELL', sourceId: key, metric }, oracle = expected.get(JSON.stringify([key, metric]));
      group.cohort.push(slot);
      group.sourceRows.push({ ...slot, value: metric === 'OPENING' ? s.opening : s.net, unit: s.sourceUnit, currency: null });
      // Only caller-supplied independent oracle values, never generated candidate values.
      group.targetRows.push({ ...slot, value: oracle.value, unit: oracle.unit, currency: null });
    }
  }
  if (sources.size !== cells.size) fail('MISSING_SOURCE_CELL');
  if (groups.size !== rules.size) fail('UNUSED_STOCK_UNIT_RULE');
  let matched = 0;
  for (const [unit, group] of groups) {
    const rule = rules.get(unit);
    const checked = external(() => validateScalarReconciliation({ sourceNamespace, targetNamespace, ...group,
      rules: metrics.map(metric => ({ sourceKind: 'TYPED_STOCK_CELL', metric, kind: 'QUANTITY', ...rule,
        nullPolicy: 'REJECT_NULL', signPolicy: 'SIGNED' })) }));
    matched += checked.counts.matchedFields;
  }
  if (matched !== cells.size * 2) fail('GLOBAL_COMPONENT_COVERAGE');
  return Object.freeze({ status: cells.size === 0 ? 'EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS'
    : 'TYPED_COMPONENT_REVIEW_CANDIDATE_NOT_CURRENT_STOCK_NOT_AUTHORIZED', sourceNamespace, targetNamespace,
    cells: Object.freeze([...cells.keys()].map(key => sources.get(key))),
    counts: Object.freeze({ cells: cells.size, components: matched, unitRules: rules.size, identities: crosswalk.identities.length }) });
}
