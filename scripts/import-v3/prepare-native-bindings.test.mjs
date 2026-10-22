import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeIdentityRegistry, reviewedPartyBinding, sourceEvidence } from './prepare-native-bindings.mjs';
import { prepareNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pin = 'a'.repeat(64), binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:isolated' };
test('native IDs are newly allocated and frozen; no source UUID reuse, collision, duplicate or implicit reference', () => {
  const r = createNativeIdentityRegistry(() => id(2), 2);
  assert.equal(r.add('HALL', 'old-hall', {}).nativeId, id(2));
  assert.throws(() => r.add('HALL', 'old-hall', {}), /DUPLICATE/);
  assert.throws(() => r.add('WAREHOUSE', 'old-w', {}), /NEW_UUID/);
  assert.throws(() => r.get('STAFF', 'missing'), /REFERENCE_MISSING/);
  const own = createNativeIdentityRegistry(() => id(9)); assert.throws(() => own.add('PRODUCT', id(9), {}), /NEW_UUID/);
});
test('actual source evidence preserves raw/normalized cells and row hash, without historical native UUID claims', () => {
  const raw = { entity: 'PRODUCT', sourceId: 'source-p', file: 'source.xlsx', sheet: 'sheet', row: 2, sourceSha256: pin, data: { '来源编号': 'source-p', '值': '' } };
  const result = sourceEvidence(raw, JSON.stringify(raw), { '来源编号': 'source-p', '值': '' }, binding);
  assert.deepEqual(result.rawFields, raw.data); assert.equal(result.fieldProvenance.fields['值'].raw, ''); assert.notEqual(result.id, raw.sourceId);
  assert.notEqual(result.rowSha256, sourceEvidence(raw, JSON.stringify(raw) + ' ', result.normalizedFields, binding).rowSha256);
});
test('party field decisions preserve Chinese employment status, null historical times and exact related identity; unknown enums fail', () => {
  let n = 10; const r = createNativeIdentityRegistry(() => id(n++));
  r.add('STAFF', 's', {}); r.add('HALL', 'h', {}); r.add('CUSTOMER', 'c', {});
  const staff = { '来源编号': 's', '姓名': 'synthetic', '角色': '营业员', '任职状态': '在职', '联系方式': '', '所属厅来源编号': 'h' };
  const p = reviewedPartyBinding('STAFF', staff, r, 'review:staff', '2026-10-04T12:00:00+08:00');
  assert.equal(p.nativeSnapshot.role, 'SALESPERSON'); assert.equal(p.nativeSnapshot.employment_status, '在职'); assert.equal(p.nativeSnapshot.contact, null);
  assert.equal(p.bindings['所属厅来源编号'].nativeId, r.get('HALL', 'h').nativeId);
  assert.throws(() => reviewedPartyBinding('STAFF', { ...staff, '角色': 'unknown' }, r, 'review', ''), /STAFF_ENUM/);
  const customer = reviewedPartyBinding('CUSTOMER', { '来源编号': 'c', '名称': 'synthetic-c', '原编码': '001', '状态': '正常' }, r, 'review', '');
  assert.equal(customer.nativeSnapshot.created_at, null); assert.equal(customer.nativeSnapshot.updated_at, null);
});
test('generated source/party bindings satisfy actual native party validator; warehouse keeps single hall and explicit import metadata', () => {
  let n = 20; const r = createNativeIdentityRegistry(() => id(n++)); r.add('HALL', 'h', {});
  const table = IMPORT_V2_TABLES.find(t => t.entity === 'WAREHOUSE');
  const row = Object.fromEntries(table.columns.map(c => [c.name, '']));
  Object.assign(row, { '来源编号': 'w', '仓库名称': 'synthetic warehouse', '所属厅来源编号': 'h', '状态': '正常', '切换范围': '本次完整核准' }); r.add('WAREHOUSE', 'w', row);
  const raw = { entity: 'WAREHOUSE', sourceId: 'w', file: 'source.xlsx', sheet: 'warehouses', row: 2, sourceSha256: pin, data: row };
  const input = { ...binding, selection: { source: 'BASE_V2', path: table.file, entity: 'WAREHOUSE', baseManifestSha256: pin, selectionSha256: pin, approvalSha256: pin, csvSha256: pin },
    source: sourceEvidence(raw, JSON.stringify(raw), row, binding), ...reviewedPartyBinding('WAREHOUSE', row, r, 'review:warehouse', '2026-10-04T12:00:00+08:00', () => id(99)) };
  const prepared = prepareNativePartyImportChunk([input]); assert.equal(prepared.rows[0].nativeSnapshot.hall_id, r.get('HALL', 'h').nativeId);
  assert.equal(prepared.rows[0].input.warehouseRecord.id, id(99));
});
