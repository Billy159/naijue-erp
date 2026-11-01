import test from 'node:test';
import assert from 'node:assert/strict';
import { productMembership, minimumPriceText, mergeProductMasterRecord, replaceBusinessMasterRecord } from '../scripts/import-v3/native-cleaning/effective-source-rules.mjs';
const p = (profile: unknown = {}, overlay: unknown = {}, sourcePayload: unknown = {}) => minimumPriceText({ profile, overlay, sourcePayload });
const record = (body: Record<string, unknown>, rest: Record<string, unknown> = {}) => ({ kind: 'warehouses', id: 'opaque-text-key', body, ...rest });

test('source wins matching nondeleted overlay; tombstone suppresses source and overlay-only', () => {
  assert.deepEqual(productMembership({ sourceRows: [{ id: 'same', name: 'source' }, { id: 'hidden' }], overlayRows: [
    { id: 'same', deleted: false, name: 'overlay' }, { id: 'hidden', deleted: true },
    { id: 'new', deleted: false }, { id: 'gone', deleted: true },
  ] }), [{ id: 'same', branch: 'SOURCE' }, { id: 'new', branch: 'OVERLAY_ONLY' }]);
});
test('profiles cannot originate membership; text IDs remain exact and are never merged by code/name', () => {
  const profileOnly = { id: 'profile-only', body: { name: 'same-name' } };
  const actual = productMembership({ sourceRows: [{ id: 'A', name: 'same-name' }, { id: 'a', name: 'same-name' }], overlayRows: [] });
  assert.deepEqual(actual.map(x => x.id), ['A', 'a']);
  assert.equal(actual.some(x => x.id === profileOnly.id), false);
});
test('membership refuses duplicate IDs and untyped deleted flags rather than inventing precedence', () => {
  assert.throws(() => productMembership({ sourceRows: [{ id: 'x' }, { id: 'x' }], overlayRows: [] }), { code: 'DUPLICATE_SOURCE_ID' });
  assert.throws(() => productMembership({ sourceRows: [], overlayRows: [{ id: 'x', deleted: null }] }), { code: 'TYPED_DELETED_BOOLEAN_REQUIRED' });
});
test('profile own-key null CLEARS lower minimum floor; missing falls through', () => {
  assert.equal(p({ minimumPrice: null }, { minimumPrice: '12.3456' }, { minimumPrice: '99' }), null);
  assert.equal(p({}, { minimumPrice: '12.3456' }, { minimumPrice: '99' }), '12.3456');
});
test('overlay own-key null CLEARS source floor; no undefined-as-null', () => {
  assert.equal(p({}, { minimumPrice: null }, { minimumPrice: '9' }), null);
  assert.throws(() => p({ minimumPrice: undefined }), { code: 'UNSUPPORTED_PRICE_JSON_TYPE' });
});
test('source payload uses COALESCE rather than upper-layer own-key null semantics', () => {
  assert.equal(p({}, {}, { minimumPrice: null, source: { '最低售价': '7.4000' } }), '7.4000');
  assert.equal(p({}, {}, { minimumPrice: '0', source: { '最低售价': '7.4' } }), '0');
  assert.equal(p({}, {}, { source: { '最低售价': null } }), null);
});
test('verbatim empty/four-decimal/large decimal strings are not rounded or converted', () => {
  for (const value of ['', '0', '1.2300', '9007199254740993.1234']) assert.equal(p({ minimumPrice: value }), value);
  assert.equal(minimumPriceText({ profile: null, overlay: null, sourcePayload: null }), null);
});
test('price unknown number/bool/object/nonobject roots refuse, not zero/fallback', () => {
  for (const bad of [0, false, {}, []]) assert.throws(() => p({ minimumPrice: bad }), { code: 'UNSUPPORTED_PRICE_JSON_TYPE' });
  assert.throws(() => minimumPriceText({ profile: [], overlay: {}, sourcePayload: {} }), { code: 'PLAIN_JSON_OBJECT_REQUIRED' });
});
test('product-master shallow merge retains missing base key, explicit null/false replace', () => {
  const base = record({ name: 'source', enabled: true, optional: 'value', nested: { a: 1, b: 2 } }, { version: 0, deleted: false, baseOnly: 'not-in-overlay' });
  const overlay = record({ enabled: false, optional: null, nested: { a: 3 } }, { version: 2, deleted: true });
  assert.deepEqual(mergeProductMasterRecord({ base, overlay }), record({ name: 'source', enabled: false, optional: null, nested: { a: 3 } }, { version: 2, deleted: true }));
});
test('business-master whole replacement never resurrects a missing source field or sourceFacts', () => {
  const base = record({ name: 'source', enabled: true, hallRelations: ['old-hall'] }, { version: 0, sourceFacts: { source: 'old' } });
  const maintained = record({ name: 'maintained', enabled: false }, { version: 4, sourceFacts: {} });
  const actual = replaceBusinessMasterRecord({ base, maintained });
  assert.deepEqual(actual, maintained);
  assert.equal(Object.hasOwn(actual.body, 'hallRelations'), false);
  assert.deepEqual(actual.sourceFacts, {});
});
test('new overlay master has no invented source; kind/id mismatch cannot merge by name', () => {
  assert.deepEqual(mergeProductMasterRecord({ base: null, overlay: record({ name: 'new' }, { version: 1 }) }), record({ name: 'new' }, { version: 1 }));
  assert.throws(() => mergeProductMasterRecord({ base: record({ name: 'same' }), overlay: { ...record({ name: 'same' }), id: 'different' } }), { code: 'EXACT_KIND_AND_ID_REQUIRED' });
  assert.throws(() => replaceBusinessMasterRecord({ base: record({ name: 'same' }), maintained: { ...record({ name: 'same' }), kind: 'halls', sourceFacts: {} } }), { code: 'EXACT_KIND_AND_ID_REQUIRED' });
});
test('models do not mutate inputs or alias outputs', () => {
  const base = record({ nested: { old: 1 } }), overlay = record({ nested: { new: 2 } }, { sourceFacts: { stable: true } });
  const before = structuredClone({ base, overlay });
  const merged = mergeProductMasterRecord({ base, overlay });
  const replaced = replaceBusinessMasterRecord({ base, maintained: overlay });
  (merged.body.nested as Record<string, unknown>).new = 77; replaced.sourceFacts.stable = false;
  assert.deepEqual({ base, overlay }, before);
});
test('ordinary JSON object only: no accessors, prototype inheritance or sparse arrays', () => {
  let calls = 0;
  const profile = Object.defineProperty({}, 'minimumPrice', { enumerable: true, get() { calls++; return '4'; } });
  assert.throws(() => p(profile), { code: 'JSON_OWN_DATA_REQUIRED' });
  assert.equal(calls, 0);
  assert.throws(() => p(Object.create({ minimumPrice: '4' })), { code: 'PLAIN_JSON_OBJECT_REQUIRED' });
  assert.throws(() => productMembership({ sourceRows: new Array(1), overlayRows: [] }), { code: 'DENSE_JSON_ARRAY_REQUIRED' });
});
test('frozen JSON inputs are accepted without mutation', () => {
  const base = Object.freeze(record(Object.freeze({ enabled: true, note: 'source' })));
  const overlay = Object.freeze(record(Object.freeze({ enabled: false }), { sourceFacts: Object.freeze({}) }));
  assert.equal(mergeProductMasterRecord({ base, overlay }).body.note, 'source');
  assert.equal(replaceBusinessMasterRecord({ base, maintained: overlay }).body.note, undefined);
  const sourceRows = Object.freeze([Object.freeze({ id: 'fixed' })]);
  assert.deepEqual(productMembership({ sourceRows, overlayRows: Object.freeze([]) }), [{ id: 'fixed', branch: 'SOURCE' }]);
});
test('own __proto__ remains inert JSON data; unknown non-JSON values refuse', () => {
  const body = JSON.parse('{"__proto__":{"syntheticPollution":true},"name":"safe"}');
  const result = mergeProductMasterRecord({ base: record({ enabled: true }), overlay: record(body) });
  assert.equal(Object.getPrototypeOf(result.body), Object.prototype);
  assert.equal(Object.hasOwn(result.body, '__proto__'), true);
  assert.deepEqual(result.body['__proto__'], { syntheticPollution: true });
  assert.equal('syntheticPollution' in {}, false);
  for (const value of [NaN, Infinity, undefined, () => null]) {
    assert.throws(() => mergeProductMasterRecord({ base: null, overlay: record({ unknown: value }) }));
  }
});

test('unused nested business body never traversed or copied',()=>{let reads=0;const body=Object.defineProperty({},'private',{enumerable:true,get(){reads++;throw Error('BODY_TOUCHED');}});const source={id:'opaque',body};const overlay={id:'opaque',deleted:false,body};assert.deepEqual(productMembership({sourceRows:[source],overlayRows:[overlay]}),[{id:'opaque',branch:'SOURCE'}]);assert.equal(reads,0);assert.equal(source.body,body);assert.equal(overlay.body,body);});
test('unused row payload property is not read, frozen metadata remains unchanged',()=>{let reads=0;const source=Object.freeze(Object.defineProperty({id:'exact: A'},'body',{enumerable:true,get(){reads++;throw Error('UNUSED');}}));const overlay=Object.freeze({id:'exact: B',deleted:false,body:{original:'unchanged'}});const body=overlay.body;assert.deepEqual(productMembership({sourceRows:Object.freeze([source]),overlayRows:Object.freeze([overlay])}),[{id:'exact: A',branch:'SOURCE'},{id:'exact: B',branch:'OVERLAY_ONLY'}]);assert.equal(reads,0);assert.equal(overlay.body,body);assert.deepEqual(body,{original:'unchanged'});});
test('required metadata accessors refuse without invoking them',()=>{let reads=0;for(const [key,overlay] of [['id',false],['id',true],['deleted',true]] as const){const row={id:'x',deleted:false};Object.defineProperty(row,key,{enumerable:true,get(){reads++;throw Error('META_GETTER');}});assert.throws(()=>productMembership({sourceRows:overlay?[]:[row],overlayRows:overlay?[row]:[]}));}assert.equal(reads,0);});
test('dense metadata and exact duplicate/deleted constraints remain',()=>{for(const rows of [new Array(1),[null],[[]]])assert.throws(()=>productMembership({sourceRows:rows,overlayRows:[]}));assert.throws(()=>productMembership({sourceRows:[{id:'x'},{id:'x'}],overlayRows:[]}),{code:'DUPLICATE_SOURCE_ID'});for(const deleted of [null,undefined,0,'false'])assert.throws(()=>productMembership({sourceRows:[],overlayRows:[{id:'x',deleted}]}),{code:'TYPED_DELETED_BOOLEAN_REQUIRED'});const rows: unknown[]=[];Object.defineProperty(rows,'0',{get(){throw Error('ARRAY_GETTER');}});assert.throws(()=>productMembership({sourceRows:rows,overlayRows:[]}));});
