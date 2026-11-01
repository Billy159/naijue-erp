import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLegacyJsonText, legacyDecimalText} from '../scripts/import-v3/native-cleaning/legacy-json.mjs';
import {minimumPriceFromLegacyJsonText} from '../scripts/import-v3/native-cleaning/effective-source-rules.mjs';

const price = (profileJson = '{}', overlayJson = '{}', sourcePayloadJson = '{}') =>
  minimumPriceFromLegacyJsonText({profileJson, overlayJson, sourcePayloadJson});

test('raw numeric tokens preserve large integers, scale, sign and exponent', () => {
  for (const token of ['9007199254740993.1234', '1.2300', '-0', '1e400', '-12.300e+2']) {
    const decoded = parseLegacyJsonText(`{"value":${token}}`);
    assert.equal(legacyDecimalText(decoded.value), token);
    assert.throws(() => JSON.stringify(decoded), /EXPLICIT_CONVERSION/);
    assert.equal(price(`{"minimumPrice":${token}}`), token);
  }
});
test('strings/null/booleans/keys remain distinct; no coercion of previously rounded numbers', () => {
  const decoded = parseLegacyJsonText('{"price":"1.2300","empty":"","nil":null,"enabled":false,"rows":[2]}');
  assert.equal(legacyDecimalText(decoded.price), '1.2300');
  assert.equal(legacyDecimalText(decoded.empty), '');
  assert.equal(legacyDecimalText(decoded.nil), null);
  assert.equal(decoded.enabled, false);
  assert.equal(legacyDecimalText(decoded.rows[0]), '2');
  for (const value of [undefined, 1.23, true, {}, []]) assert.throws(() => legacyDecimalText(value), /EXACT_LEGACY/);
});
test('invalid JSON never includes private source excerpts in diagnostics', () => {
  for (const raw of ['{"private":"synthetic-sensitive",', '[01]', 'NaN']) {
    assert.throws(() => parseLegacyJsonText(raw), {message: 'INVALID_LEGACY_JSON_TEXT'});
  }
  assert.throws(() => parseLegacyJsonText(null), /LEGACY_JSON_TEXT_REQUIRED/);
});
test('prototype-like JSON keys remain inert own data', () => {
  const decoded = parseLegacyJsonText('{"__proto__":{"pollution":true},"value":3}');
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.hasOwn(decoded, '__proto__'), true);
  assert.equal({}.pollution, undefined);
});
test('profile and overlay explicit null stop lower values, missing fields fall through', () => {
  assert.equal(price('{"minimumPrice":null}', '{"minimumPrice":4}', '{"minimumPrice":5}'), null);
  assert.equal(price('{}', '{"minimumPrice":null}', '{"minimumPrice":5}'), null);
  assert.equal(price('{}', '{"minimumPrice":4.5600}', '{"minimumPrice":5}'), '4.5600');
  assert.equal(price(null, null, null), null);
});
test('source null falls through to original floor; empty string and zero do not', () => {
  assert.equal(price('{}', '{}', '{"minimumPrice":null,"source":{"最低售价":7.4000}}'), '7.4000');
  assert.equal(price('{}', '{}', '{"minimumPrice":"","source":{"最低售价":7}}'), '');
  assert.equal(price('{}', '{}', '{"minimumPrice":0,"source":{"最低售价":7}}'), '0');
  assert.equal(price('{}', '{}', '{"source":{"最低售价":null}}'), null);
});
test('selected invalid price refuses; unused lower price does not override the selected value', () => {
  for (const value of ['false', '{}', '[]']) assert.throws(() => price(`{"minimumPrice":${value}}`), /EXACT_LEGACY/);
  assert.equal(price('{"minimumPrice":1.2500}', '{"minimumPrice":false}', 'not decoded because unused'), '1.2500');
  assert.equal(price('{}', '{}', '{"minimumPrice":2.5000,"source":false}'), '2.5000');
  assert.throws(() => price('[]'), /PLAIN_JSON_OBJECT_REQUIRED/);
});
