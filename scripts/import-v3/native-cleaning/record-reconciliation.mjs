import { types } from 'node:util';
import { normalizeQuantity, normalizeMoney } from './exact-scalars.mjs';
// Consistency of a declared cohort only: no extraction, identity allocation or I/O.
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const slotFields = ['sourceKind', 'sourceId', 'metric'];
const commonRule = ['sourceKind', 'metric', 'kind', 'sourceUnit', 'targetUnit', 'evidenceSha256', 'nullPolicy', 'signPolicy'];
function record(value, keys) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_RECONCILIATION_RECORD');
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) fail('INVALID_RECONCILIATION_FIELDS');
  const result = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('INVALID_RECONCILIATION_PROPERTY');
    result[key] = d.value;
  }
  return result;
}
function dense(value) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > 100000 || Reflect.ownKeys(value).length !== value.length + 1) fail('BOUNDED_DENSE_ARRAY_REQUIRED');
  const rows = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail('BOUNDED_DENSE_ARRAY_REQUIRED');
    rows.push(d.value);
  }
  return rows;
}
function text(value, maxBytes, budget) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes
      || Buffer.byteLength(value) > maxBytes || value.includes('\0')) fail('INVALID_RECONCILIATION_TEXT');
  budget.bytes += Buffer.byteLength(value);
  if (budget.bytes > 32 * 1024 * 1024) fail('RECONCILIATION_BYTE_BUDGET');
  return value; // No trim, case-fold, Unicode normalization or delimiter-key encoding.
}
function slot(row, budget) {
  text(row.sourceKind, 128, budget); text(row.sourceId, 4096, budget); text(row.metric, 128, budget);
  return JSON.stringify([row.sourceKind, row.sourceId, row.metric]);
}
const ruleKey = row => JSON.stringify([row.sourceKind, row.metric]);
function checkedRule(value, budget) {
  // Inspect kind without invoking accessors; record() then checks every exact field.
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_RECONCILIATION_RULE');
  const kind = Object.getOwnPropertyDescriptor(value, 'kind');
  if (!kind || !kind.enumerable || !Object.hasOwn(kind, 'value') || !['QUANTITY', 'MONEY'].includes(kind.value)) fail('INVALID_RECONCILIATION_RULE');
  const fields = kind.value === 'QUANTITY' ? [...commonRule, 'numerator', 'denominator']
    : [...commonRule, 'sourceCurrency', 'targetCurrency', 'precision', 'scale'];
  const r = record(value, fields);
  for (const field of fields) text(r[field], 128, budget);
  return r;
}
function normalize(value, rule, target) {
  // All arithmetic, decimal grammar, NULL/sign/precision/range rules stay in the
  // existing exact-scalars module. Target identity conversion only tests canonicality.
  try {
    if (rule.kind === 'QUANTITY') return normalizeQuantity({ value,
      sourceUnit: target ? rule.targetUnit : rule.sourceUnit, targetUnit: rule.targetUnit,
      rule: { sourceUnit: target ? rule.targetUnit : rule.sourceUnit, targetUnit: rule.targetUnit,
        numerator: target ? '1' : rule.numerator, denominator: target ? '1' : rule.denominator,
        evidenceSha256: rule.evidenceSha256 }, nullPolicy: rule.nullPolicy, signPolicy: rule.signPolicy }).targetText;
    return normalizeMoney({ value, sourceCurrency: target ? rule.targetCurrency : rule.sourceCurrency,
      targetCurrency: rule.targetCurrency, sourceUnit: target ? rule.targetUnit : rule.sourceUnit,
      targetUnit: rule.targetUnit, evidenceSha256: rule.evidenceSha256, precision: rule.precision,
      scale: rule.scale, nullPolicy: rule.nullPolicy, signPolicy: rule.signPolicy }).targetText;
  } catch { fail('SCALAR_CONTRACT_REJECTED'); }
}
/** cohort must be independently enumerated upstream; this function cannot prove that. */
export function validateScalarReconciliation(input) {
  const r = record(input, ['sourceNamespace', 'targetNamespace', 'cohort', 'rules', 'sourceRows', 'targetRows']);
  const budget = { bytes: 0 };
  text(r.sourceNamespace, 1024, budget); text(r.targetNamespace, 1024, budget);
  const cohort = dense(r.cohort), rules = dense(r.rules), sourceRows = dense(r.sourceRows), targetRows = dense(r.targetRows);
  const expected = new Set(), byRule = new Map(), usedRules = new Set();
  for (const raw of cohort) {
    const item = record(raw, slotFields), key = slot(item, budget);
    if (expected.has(key)) fail('DUPLICATE_COHORT_FIELD');
    expected.add(key);
  }
  for (const raw of rules) {
    const rule = checkedRule(raw, budget), key = ruleKey(rule);
    if (byRule.has(key)) fail('DUPLICATE_SCALAR_RULE');
    byRule.set(key, rule);
  }
  function rows(values, target) {
    const result = new Map();
    for (const raw of values) {
      const row = record(raw, [...slotFields, 'value', 'unit', 'currency']), key = slot(row, budget);
      if (result.has(key)) fail('DUPLICATE_RECONCILIATION_ROW');
      if (!expected.has(key)) fail('ROW_OUTSIDE_DECLARED_COHORT');
      const rk = ruleKey(row), rule = byRule.get(rk);
      if (!rule) fail('MISSING_SCALAR_RULE');
      text(row.unit, 128, budget);
      if (row.currency !== null) text(row.currency, 128, budget);
      if (row.value !== null) text(row.value, 256, budget);
      if (row.unit !== (target ? rule.targetUnit : rule.sourceUnit)) fail('ROW_UNIT_MISMATCH');
      if (row.currency !== (rule.kind === 'QUANTITY' ? null : target ? rule.targetCurrency : rule.sourceCurrency)) fail('ROW_CURRENCY_MISMATCH');
      const canonical = normalize(row.value, rule, target);
      if (target && canonical !== row.value) fail('NONCANONICAL_TARGET_SCALAR');
      result.set(key, canonical); usedRules.add(rk);
    }
    if (result.size !== expected.size) fail('MISSING_COHORT_ROW');
    return result;
  }
  const source = rows(sourceRows, false), target = rows(targetRows, true);
  if (usedRules.size !== byRule.size) fail('UNUSED_SCALAR_RULE');
  for (const key of expected) if (source.get(key) !== target.get(key)) fail('SCALAR_VALUE_MISMATCH');
  return Object.freeze({ status: expected.size === 0 ? 'EMPTY_DECLARED_COHORT_NOT_SOURCE_COMPLETENESS'
    : 'CONSISTENT_GIVEN_DECLARED_COHORT_NOT_AUTHORIZED', counts: Object.freeze({ cohort: cohort.length,
    rules: rules.length, sourceRows: sourceRows.length, targetRows: targetRows.length, matchedFields: expected.size }) });
}
