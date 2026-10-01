import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { command, detail, RUNTIME } from '../../../server/runtime/runtime.ts';
import { transaction, SOURCE } from '../../../server/runtime/db.ts';

const revision = 'transfer-supplement-decisions-20260930-v1';
const root = new URL('./', import.meta.url);
const sourceFile = new URL('../../../inputs/tplus-current/调拨单导出.xlsx', import.meta.url);
const reviews = JSON.parse(readFileSync(new URL('same-serial-transfer-differences-and-status.json', root), 'utf8'));
const expectedSha = '2476f388189b68d771911e1381856d27a000d7cf600fbdd4d087d151f3432cdb';
const sourceSha = createHash('sha256').update(readFileSync(sourceFile)).digest('hex');
assert.equal(sourceSha, expectedSha, 'The reviewed transfer workbook changed');
const mode = process.argv[2];
assert.ok(['--prepare', '--apply', '--verify'].includes(mode || ''), 'Choose --prepare, --apply, or --verify');
if (mode === '--verify') assert.ok(process.env.POSTGRES_DB === 'business_management' || /^demo_8877_[a-z0-9_]+$/.test(process.env.POSTGRES_DB || ''), 'Explicit verification database required');
else assert.equal(process.env.POSTGRES_DB, 'business_management');
assert.equal(process.env.POSTGRES_SCHEMA, SOURCE);
const numbers = reviews.map((r: any) => r.oldOut.number);
assert.deepEqual(numbers, ['ALAL-2026-09-0128', 'ALAL-2026-09-0157', 'ALAL-2026-09-0158']);

async function snapshot() {
  return transaction(RUNTIME, async tx => {
    await tx.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const documents = (await tx.query(`SELECT d.*, r.body FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.document_type='TRANSFER' AND d.number IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY d.number`, [JSON.stringify(numbers)])).rows;
    assert.equal(documents.length, 3);
    const sourceControls: any = {};
    for (const table of ['tplus_history_document', 'tplus_history_line', 'tplus_inventory_balance_source', 'variant']) {
      sourceControls[table] = (await tx.query(`SELECT count(*)::int rows, md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) digest FROM ${SOURCE}.${table} t`)).rows[0];
    }
    const barcodeControls = (await tx.query(`SELECT count(*)::int rows,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY sku_id),'')) digest FROM generated_barcode t`)).rows[0];
    const delta = (await tx.query('SELECT * FROM inventory_delta ORDER BY warehouse_id,sku_id')).rows;
    const revisions = (await tx.query(`SELECT r.* FROM revision r JOIN document d ON d.id=r.document_id WHERE d.number IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY r.document_id,r.revision`, [JSON.stringify(numbers)])).rows;
    return { documents, sourceControls, barcodeControls, delta, revisions };
  });
}

function exportEvidence(review: any) {
  return { revision, sourceFile: 'T+数据/调拨单导出.xlsx', sourceSha256: sourceSha, sheet: '调拨单', firstRow: review.new.row, lastRow: review.new.lastRow,
    sourceNumber: review.new.number, originalImportedNumber: review.oldOut.number, sourceStatus: review.new.status, sourceAuditor: review.new.auditor || null,
    sourceAuditDate: review.new.auditDate || null, userDecision: review.new.number.endsWith('0128') ? '尺码按最新调拨导出' : '保留单据并记录为未审核',
    importedOriginalRevisionPreserved: true };
}

const beforeFile = new URL('before-user-decisions.json', root);
if (mode === '--prepare') {
  assert.ok(!existsSync(beforeFile), 'Preserve the existing before snapshot');
  const before = await snapshot();
  writeFileSync(beforeFile, JSON.stringify(before, null, 2) + '\n');
  writeFileSync(new URL('user-decisions.json', root), JSON.stringify({ revision, sourceSha256: sourceSha, inventoryCutover: 'confirmed opening inventory pending complete source file', decisions: reviews.map((r: any) => exportEvidence(r)), correction: { product: '586CS5361723', color: '蓝色', quantity: '1', oldSize: '180/104A  43', newSize: '180/108A 44', oldSku: '47b2fbd7-81f3-cae8-e059-419293281ce6', newSku: '9b2a1e67-be45-6c30-d8b6-87db0fb34a33' } }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PREPARED', documents: before.documents.map((d: any) => ({ number: d.number, status: d.status, version: d.version })), sourceControls: before.sourceControls, activeBarcodes: before.barcodeControls.rows }));
  process.exit(0);
}

assert.ok(existsSync(beforeFile), 'Prepare the before snapshot first');
const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
if (mode === '--apply') {
  const lease = await transaction(RUNTIME, tx => tx.query(`SELECT document_key FROM edit_lease WHERE expires_at>now() AND (document_key IN (SELECT jsonb_array_elements_text($1::jsonb)) OR document_key IN (SELECT id::text FROM document WHERE number IN (SELECT jsonb_array_elements_text($1::jsonb))))`, [JSON.stringify(numbers)]));
  assert.equal(lease.rowCount, 0, 'A selected transfer is currently being edited');
  for (const review of reviews) {
    const original = before.documents.find((d: any) => d.number === review.oldOut.number);
    let current = await detail(original.id);
    const already = current.body.header?.source_payload?.latestTransferExport?.revision === revision;
    if (already) continue;
    assert.equal(current.version, original.version, 'The transfer changed after preparation');
    assert.deepEqual(current.body, original.body, 'Preserve changes from other sessions');
    // Record the two source-unaudited documents through the existing stock/state
    // transaction. Their included baseline effects must be reversed consistently.
    if (review.new.status === '未审' && current.current_effect_active) {
      await command({ documentId: current.id, operation: 'unapprove', expectedVersion: current.version, requestKey: revision + ':' + current.number + ':unaudited' });
      current = await detail(current.id);
    }
    const body = structuredClone(current.body);
    if (review.new.number === 'AL-2026-09-0128') {
      const lines = body.lines.filter((l: any) => l.source_product_code === '586CS5361723' && l.source_color_name === '蓝色' && l.source_size_name === '180/104A  43');
      assert.equal(lines.length, 1);
      assert.equal(Number(lines[0].source_quantity), 1);
      const target = await transaction(RUNTIME, tx => tx.query(`SELECT v.id sku_id,v.product_id,c.id color_id,z.id size_id,z.code size_code,z.name size_name FROM ${SOURCE}.variant v JOIN ${SOURCE}.product p ON p.id=v.product_id JOIN ${SOURCE}.variant_option co ON co.variant_id=v.id JOIN ${SOURCE}.spec_dimension cd ON cd.id=co.dimension_id AND cd.code='COLOR' JOIN ${SOURCE}.spec_value c ON c.id=co.spec_value_id JOIN ${SOURCE}.variant_option zo ON zo.variant_id=v.id JOIN ${SOURCE}.spec_dimension zd ON zd.id=zo.dimension_id AND zd.code='SIZE' JOIN ${SOURCE}.spec_value z ON z.id=zo.spec_value_id WHERE p.code=$1 AND c.name=$2 AND z.name=$3`, ['586CS5361723', '蓝色', '180/108A 44']));
      assert.equal(target.rowCount, 1);
      const t = target.rows[0];
      assert.equal(t.product_id, lines[0].product_id);
      assert.equal(t.color_id, lines[0].color_id);
      lines[0].supplementaryCorrection = { ...exportEvidence(review), originalSkuId: lines[0].sku_id, originalSizeId: lines[0].size_id, originalSizeCode: lines[0].source_size_code, originalSizeName: lines[0].source_size_name };
      Object.assign(lines[0], { sku_id: t.sku_id, size_id: t.size_id, source_size_code: t.size_code, source_size_name: t.size_name });
    }
    body.header.source_payload = { ...body.header.source_payload, latestTransferExport: exportEvidence(review) };
    // AL0128 was already unaudited before this request. Preserve its existing
    // workflow state; the user approved its size correction, not a re-audit.
    assert.ok(!current.current_effect_active, 'Active historical details need a separately authorized workflow transition');
    await command({ documentId: current.id, operation: 'save', expectedVersion: current.version, requestKey: revision + ':' + current.number + ':save', body });
  }
}

const after = await snapshot();
assert.deepEqual(after.sourceControls, before.sourceControls, 'Original source facts must stay immutable');
assert.deepEqual(after.barcodeControls, before.barcodeControls, 'Approved barcodes must stay frozen');
for (const old of before.revisions) {
  assert.deepEqual(after.revisions.find((r: any) => r.document_id === old.document_id && r.revision === old.revision), old, 'Keep all previously imported revisions');
}
const expectedDelta = new Map(before.delta.map((r: any) => [r.warehouse_id + '|' + r.sku_id, Number(r.quantity)]));
for (const original of before.documents.filter((d: any) => d.number.endsWith('0157') || d.number.endsWith('0158'))) {
  if (!original.current_effect_active) continue;
  for (const line of original.body.lines) {
    for (const [warehouse, sign] of [[line.from_warehouse_id, 1], [line.to_warehouse_id, -1]] as [string, number][]) {
      const key = warehouse + '|' + line.sku_id;
      expectedDelta.set(key, (expectedDelta.get(key) || 0) + sign * Number(line.stock_quantity_contribution));
    }
  }
}
const actualDelta = new Map(after.delta.map((r: any) => [r.warehouse_id + '|' + r.sku_id, Number(r.quantity)]));
for (const key of new Set([...expectedDelta.keys(), ...actualDelta.keys()])) assert.equal(actualDelta.get(key) || 0, expectedDelta.get(key) || 0, 'Unexpected inventory change: ' + key);
for (const d of after.documents) {
  assert.equal(d.status, 'UNAUDITED');
  assert.equal(d.current_effect_active, false);
  assert.equal(d.body.header.source_payload.latestTransferExport.revision, revision);
  const original = before.documents.find((x: any) => x.id === d.id);
  assert.equal(d.body.lines.length, original.body.lines.length);
  assert.equal(d.body.lines.reduce((n: number, l: any) => n + Number(l.source_quantity), 0), original.body.lines.reduce((n: number, l: any) => n + Number(l.source_quantity), 0));
  if (d.number.endsWith('0128')) {
    const expected = structuredClone(original.body.lines);
    const line = expected.find((l: any) => l.source_product_code === '586CS5361723' && l.source_color_name === '蓝色' && l.source_size_name === '180/104A  43');
    const corrected = d.body.lines.find((l: any) => l.source_id === line.source_id);
    assert.equal(corrected.sku_id, '9b2a1e67-be45-6c30-d8b6-87db0fb34a33');
    assert.equal(corrected.source_size_code, '108');
    assert.equal(corrected.source_size_name, '180/108A 44');
    Object.assign(line, { sku_id: corrected.sku_id, size_id: corrected.size_id, source_size_code: corrected.source_size_code, source_size_name: corrected.source_size_name, supplementaryCorrection: corrected.supplementaryCorrection });
    assert.deepEqual(d.body.lines, expected, 'Only the selected size/SKU may change');
  } else assert.deepEqual(d.body.lines, original.body.lines, 'Unaudited document details must stay unchanged');
}
const report = { status: 'PASS', revision, sourceSha256: sourceSha, documents: after.documents.map((d: any) => ({ number: d.number, status: d.status, version: d.version, revision: d.current_revision, lines: d.body.lines.length, quantity: d.body.lines.reduce((n: number, l: any) => n + Number(l.source_quantity), 0) })), sizeChangedLines: 1, twoSourceUnauditedStatesRecorded: true, originalSourceFactsUnchanged: true, barcodesUnchanged: true, originalRevisionsPreserved: true, inventoryEffectCheck: 'Only the two source-unaudited transfers reverse their formerly included effects; total transfer quantity across warehouses remains zero', openingInventoryInitialized: false };
writeFileSync(new URL('user-decisions-verification.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
