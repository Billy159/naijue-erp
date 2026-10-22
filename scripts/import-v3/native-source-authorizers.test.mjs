import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { createNativeSourceStepAuthorizer, NATIVE_SOURCE_STEP_KINDS, openNativeBindingRegistry } from './native-source-authorizers.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = b => createHash('sha256').update(b).digest('hex'), pin = 'a'.repeat(64);
test('every direct-store kind needs its real source authorizer; source verdict flags are not accepted', async () => {
  const calls = [], h = Object.fromEntries(NATIVE_SOURCE_STEP_KINDS.map(k => [k, async p => { calls.push(k); assert.equal(p.marker, k); }]));
  const authorize = createNativeSourceStepAuthorizer(h);
  for (const k of NATIVE_SOURCE_STEP_KINDS) await authorize({ kind: k, payload: { marker: k } });
  assert.deepEqual(calls, NATIVE_SOURCE_STEP_KINDS); delete h.PRODUCT; assert.throws(() => createNativeSourceStepAuthorizer(h), /ALL_AUTHORITIZERS_REQUIRED/);
  await assert.rejects(authorize({ kind: 'invented', payload: {} }), /UNKNOWN_STEP/);
});
test('callback mutation, boolean grants and approval-map tampering are rejected', async () => {
  const h = Object.fromEntries(NATIVE_SOURCE_STEP_KINDS.map(k => [k, async () => {}]));
  h.PRODUCT = async () => true; await assert.rejects(createNativeSourceStepAuthorizer(h)({ kind: 'PRODUCT', payload: {} }), /AUTHORIZER_PROTOCOL/);
  h.SETTLEMENT = async p => { p.approvals.set('x', 'changed'); };
  await assert.rejects(createNativeSourceStepAuthorizer(h)({ kind: 'SETTLEMENT', payload: { approvals: new Map([['x', 'original']]) } }), /AUTHORIZER_PROTOCOL/);
});
test('externally pinned real registry supplies exact product resolver and refuses target/source/binding/file changes', async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'native-source-test-'));
  try {
    const fields = { '来源编号': 'p', '款号': 'synthetic' }, rows = [{ entity: 'PRODUCT', sourceKey: 'p', nativeId: id(2), normalizedHash: requestHash(fields) }];
    const files = [];
    for (const [name, value] of [['native-identity-registry.json', rows], ['party-reference-candidates.json', []]]) {
      const b = Buffer.from(JSON.stringify(value)); await writeFile(join(dir, name), b); files.push({ name, bytes: b.length, sha256: hash(b) });
    }
    const binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:namespace', selectionSha256: pin, cutoffAt: '2026-10-04T12:00:00+08:00' };
    const manifest = Buffer.from(JSON.stringify({ version: 'NATIVE_BINDING_REVIEW_CANDIDATE_V1', ...binding, files, registryFile: 'native-identity-registry.json' }));
    await writeFile(join(dir, 'review-candidate-manifest.json'), manifest);
    await assert.rejects(openNativeBindingRegistry({ directory: dir, binding, trustedManifestSha256: null }), /OUTSIDE_PIN_REQUIRED/);
    await assert.rejects(openNativeBindingRegistry({ directory: dir, binding: { ...binding, batchId: id(9) }, trustedManifestSha256: hash(manifest) }), /REGISTRY_BINDING/);
    const registry = await openNativeBindingRegistry({ directory: dir, binding, trustedManifestSha256: hash(manifest) });
    const q = { entity: 'PRODUCT', sourceKey: 'p', rawFields: fields, normalizedFields: fields };
    assert.deepEqual(await registry.resolveNativeBinding(q), { product: { sourceKey: 'p', nativeId: id(2), expectedVersion: 1 }, blankPricePolicy: 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET' });
    await assert.rejects(registry.resolveNativeBinding({ ...q, normalizedFields: { ...fields, '款号': 'wrong' } }), /NORMALIZED_CHANGED/);
    await writeFile(join(dir, 'native-identity-registry.json'), JSON.stringify(rows) + ' '); await assert.rejects(registry.verify(), /FILE_CHANGED/);
    registry.close(); await assert.rejects(registry.resolveNativeBinding(q), /REGISTRY_CLOSED/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
