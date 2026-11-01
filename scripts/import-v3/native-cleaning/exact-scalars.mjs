import { types } from 'node:util';
// Offline arithmetic only. No rule authenticity, mapping, write or admission authority.
const fail = code => { throw new TypeError(code); };
function record(input, keys) {
  if (input === null || typeof input !== 'object' || types.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype) fail('INVALID_RECORD');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) fail('INVALID_FIELDS');
  const result = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('INVALID_DATA_PROPERTY');
    result[key] = d.value;
  }
  return result;
}
function label(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('INVALID_UNIT_OR_CURRENCY');
}
function evidence(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('MISSING_RULE_EVIDENCE');
}
function policies(r) {
  if (!['REJECT_NULL', 'PRESERVE_NULL'].includes(r.nullPolicy)) fail('INVALID_NULL_POLICY');
  if (!['SIGNED', 'NONNEGATIVE', 'POSITIVE'].includes(r.signPolicy)) fail('INVALID_SIGN_POLICY');
}
function decimal(value) {
  if (typeof value !== 'string' || value.length > 256 || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) fail('INVALID_DECIMAL');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return { coefficient: BigInt(whole + fraction) * (negative ? -1n : 1n), denominator: 10n ** BigInt(fraction.length) };
}
function positiveInteger(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^[1-9][0-9]*$/.test(value)) fail('INVALID_RATIO');
  return BigInt(value);
}
function sign(value, policy) {
  if ((policy === 'NONNEGATIVE' && value < 0n) || (policy === 'POSITIVE' && value <= 0n)) fail('SIGN_REJECTED');
}
function nullable(r) {
  if (r.value !== null) return false;
  if (r.nullPolicy !== 'PRESERVE_NULL') fail('NULL_REJECTED');
  return true;
}
const output = (sourceText, targetText) => Object.freeze({ sourceText, targetText });
export function normalizeQuantity(input) {
  const r = record(input, ['value', 'sourceUnit', 'targetUnit', 'rule', 'nullPolicy', 'signPolicy']);
  const rule = record(r.rule, ['sourceUnit', 'targetUnit', 'numerator', 'denominator', 'evidenceSha256']);
  policies(r);
  for (const x of [r.sourceUnit, r.targetUnit, rule.sourceUnit, rule.targetUnit]) label(x);
  if (r.sourceUnit !== rule.sourceUnit || r.targetUnit !== rule.targetUnit) fail('UNIT_MISMATCH');
  evidence(rule.evidenceSha256);
  const p = positiveInteger(rule.numerator), q = positiveInteger(rule.denominator);
  if (nullable(r)) return output(null, null);
  const d = decimal(r.value), numerator = d.coefficient * p, denominator = d.denominator * q;
  if (numerator % denominator !== 0n) fail('INEXACT_QUANTITY');
  const value = numerator / denominator;
  if (value < -(2n ** 63n) || value > 2n ** 63n - 1n) fail('QUANTITY_RANGE');
  sign(value, r.signPolicy);
  return output(r.value, value.toString());
}
export function normalizeMoney(input) {
  const r = record(input, ['value', 'sourceCurrency', 'targetCurrency', 'sourceUnit', 'targetUnit', 'evidenceSha256', 'precision', 'scale', 'nullPolicy', 'signPolicy']);
  policies(r);
  for (const x of [r.sourceCurrency, r.targetCurrency, r.sourceUnit, r.targetUnit]) label(x);
  if (r.sourceCurrency !== r.targetCurrency || r.sourceUnit !== r.targetUnit) fail('CURRENCY_OR_UNIT_MISMATCH');
  evidence(r.evidenceSha256);
  if (r.precision !== '18' || r.scale !== '2') fail('TARGET_DECIMAL_CONTRACT');
  if (nullable(r)) return output(null, null);
  const d = decimal(r.value), scaled = d.coefficient * 100n;
  if (scaled % d.denominator !== 0n) fail('INEXACT_MONEY');
  const minor = scaled / d.denominator, magnitude = minor < 0n ? -minor : minor;
  if (magnitude > 999999999999999999n) fail('MONEY_RANGE');
  sign(minor, r.signPolicy);
  return output(r.value, `${minor < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`);
}
