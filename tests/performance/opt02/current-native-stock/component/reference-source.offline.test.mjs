/** New finite logical source/authorization only; no driver/pool/PG execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceFixture, assertFixture, additionalReferenceCommands, DATASET_ID, SCHEME_ROW } from './fixture.mjs';
import { createReferenceSourceAuthorizer, snapshotSource } from './authorizer.mjs';
import { NODE_SCRYPT_DUMMY_HASH } from '../../../../../packages/authentication/src/passwords.ts';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
const fixture = buildReferenceFixture();
const readArtifact = async name => Buffer.from(fixture.artifacts.find(file => file.path === name)?.utf8 ?? 'MISSING');
test('new source is exactly105 setup rows, two warehouses/three SKUs and4nonzero/2explicitabsence pairs', () => {
  assert.equal(assertFixture(fixture), fixture); assert.equal(fixture.referenceRows, 105);
  assert.equal(fixture.originalReferenceRows, 99); assert.equal(fixture.extraReferenceRows, 6);
  assert.equal(fixture.warehouses.length, 2); assert.equal(fixture.skus.length, 3);
  assert.equal(fixture.baselines.length, 4); assert.equal(fixture.absentPairs.length, 2);
  const pairs = [...fixture.baselines, ...fixture.absentPairs].map(row => row.warehouseId + '/' + row.skuId);
  assert.equal(new Set(pairs).size, 6); assert.ok(fixture.baselines.every(row => BigInt(row.quantity) !== 0n));
  assert.ok(fixture.absentPairs.every(row => row.quantity === '0'));
  assert.equal(fixture.noV2ProductOrHistorySource, true); assert.equal(fixture.noMaintainedSupplierOrProductCreated, true);
});
test('fresh artifacts/namespace and original4commands have stable full hashes with no borrowed b001 approval or secrets', async () => {
  assert.equal(fixture.artifacts.length, 3); assert.equal(fixture.commands.length, 4);
  assert.deepEqual(fixture.commands.map(c => c.action), ['IMPORT_STAGE','IMPORT_CHUNK','IMPORT_CHUNK','IMPORT_PUBLISH']);
  assert.equal(fixture.commands[0].sourceHash, fixture.artifacts[2].sha256);
  assert.ok(fixture.artifacts.every(a => a.path.includes(DATASET_ID) && !a.path.includes('b001')));
  assert.ok(fixture.artifacts.every(a => !a.utf8.includes('FAKE_SCRYPT_SECRET')));
  const auth = createReferenceSourceAuthorizer(fixture, readArtifact); await auth.verify();
  for (let i = 0; i < 4; i++) {
    const allowed = await auth.assertAllowed(fixture.reference.actor.accountId, fixture.commands[i]);
    assert.equal(allowed.commandIndex, i); assert.equal(allowed.commandSha256, requestHash(fixture.commands[i]));
  }
});
test('all command fields/actor/artifact bytes are bound; five PUBLISH attestations cannot bypass actual file verification', async () => {
  const auth = createReferenceSourceAuthorizer(fixture, readArtifact);
  await assert.rejects(auth.assertAllowed('00000000-0000-4000-a000-000000000001', fixture.commands[0]), /ACTOR/);
  for (const mutate of [c => { c.sourceHash = '0'.repeat(64); }, c => { c.approval.completeScope = false; }, c => { c.requestKey += ':copy'; }]) {
    const c = structuredClone(fixture.commands[3]); mutate(c);
    await assert.rejects(auth.assertAllowed(fixture.reference.actor.accountId, c), error => ['INCOMPLETE_IMPORT_SCOPE', 'EXACT_COMPLETE_NEW_SOURCE_COMMAND_REQUIRED'].includes(error.code));
  }
  const corrupted = createReferenceSourceAuthorizer(fixture, async name => Buffer.concat([await readArtifact(name),Buffer.from('\n')]));
  await assert.rejects(corrupted.assertAllowed(fixture.reference.actor.accountId, fixture.commands[3]), /ARTIFACT_BYTES/);
});
test('source snapshot rejects getters/hidden keys/symbols/cycles and never invokes coercion', () => {
  let reads = 0; const getter = { get action() { reads++; return 'IMPORT_PUBLISH'; } };
  assert.throws(() => snapshotSource(getter), /OWN_DATA/); assert.equal(reads, 0);
  const hidden = {}; Object.defineProperty(hidden, 'approval', { value: true }); assert.throws(() => snapshotSource(hidden), /OWN_DATA/);
  assert.throws(() => snapshotSource({ [Symbol()]: true }), /SYMBOL/);
  const cycle = {}; cycle.self = cycle; assert.throws(() => snapshotSource(cycle), /FINITE_PLAIN/);
  assert.throws(() => assertFixture({ ...fixture }), /ORIGINAL_NEW_REFERENCE/);
});
test('extra6setup rows are parameterized and literal7field2026scheme is preserved, not ordinary Product/Supplier CREATE', () => {
  const commands = additionalReferenceCommands(fixture, NODE_SCRYPT_DUMMY_HASH) // Public work-only vector; never a DB/account seed.;
  assert.equal(commands.length, 6); assert.deepEqual(commands.map(row => row.table), ['warehouse','warehouse','product','sku','season','barcode_scheme']);
  assert.deepEqual(commands.at(-1).values, [SCHEME_ROW.id,SCHEME_ROW.name,SCHEME_ROW.barcode_type,SCHEME_ROW.rule_description,SCHEME_ROW.code_length,SCHEME_ROW.rule_version,SCHEME_ROW.status]);
  assert.ok(commands.every(row => !row.text.includes('FAKE_SCRYPT_SECRET_FOR_SOURCE_TEST_ONLY')));
  assert.equal(fixture.sourceOnly, true); assert.equal(fixture.physicalTargetAssigned, false); assert.equal(fixture.executionApproved, false);
});
