/** A NEW logical reference dataset. No old b001 fixture/authorization or physical target. */
import { createHash } from 'node:crypto';
import { LOGICAL } from '../reference-compiler/universe.mjs';
import { buildFixture as originalReferenceFixture, SETUP_COLUMNS, setupInsert } from '../../../opt00/pg-component/contract.mjs';
import { seedCommands, seedReference } from '../../../opt00/pg-component/seed.mjs';
import { stableImportId, validateCutoffImportCommand } from '../../../../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';

export const DATASET_ID = 'c20261101cafe';
export const SCOPE = 'NEW_FINITE_CURRENT_NATIVE_REFERENCE_SOURCE_NOT_RUNTIME_CANONICAL_OR_PERFORMANCE_AUTHORITY';
export const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
export const SHA = value => createHash('sha256').update(value).digest('hex');
export const freeze = value => { if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fixtures = new WeakSet();
export const assertFixture = value => { need(fixtures.has(value), 'ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED'); return value; };
export const sourceUuid = label => {
  need(typeof label === 'string' && label.length > 0, 'PRIMITIVE_SOURCE_UUID_LABEL_REQUIRED');
  const h = SHA('synthetic:opt02:current-native-reference:' + DATASET_ID + ':' + label);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
};
// Exact source-declared v19:160–165 descriptor, NOT adjacent old proposal/approval hashes.
export const SCHEME_ROW = freeze({
  id: '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef', name: '2026年条码方案', barcode_type: 'Code128',
  rule_description: '原方案描述快照；保留每条原条码和已确认SKU绑定，不依据本说明重新生成、补位、截断或改码。声明总长仅保留方案说明，不代替每条历史原码。',
  code_length: 15, rule_version: 'NATIVE_SOURCE_RETAINED_V1', status: 'CURRENT',
});
const artifact = (name, utf8) => freeze({ path: 'synthetic:opt02:current-native-reference:' + DATASET_ID + '/' + name,
  utf8, bytes: Buffer.byteLength(utf8), sha256: SHA(utf8) });

export function buildReferenceFixture() {
  need(LOGICAL.database === 'naijue_erp_test_' + DATASET_ID, 'SOURCE_DATASET_AND_LOGICAL_SCHEMA_ID_MUST_MATCH');
  const reference = originalReferenceFixture({ id: DATASET_ID });
  const warehouses = [0, 1].map(index => ({ id: sourceUuid('warehouse:' + index), hall_id: reference.hallId,
    name: 'SYNTHETIC CURRENT NATIVE REFERENCE WAREHOUSE ' + index, enabled: true, version: 1, created_operation_id: null }));
  const alternateProduct = { id: sourceUuid('retained-alternate-product'), code: 'NATIVE-REF-' + DATASET_ID,
    name: 'SYNTHETIC RETAINED REFERENCE PRODUCT', retailPrice: '2.50', groupId: reference.targetGroupId };
  const skus = [...reference.skuIds.map((id, index) => ({ id, product_id: reference.productId,
    color_id: reference.colorId, fit_id: reference.fitId, size_id: reference.sizes[index === 0 ? 0 : 22].id,
    sku_code: 'SYNTHETIC-SKU-' + DATASET_ID + '-' + index, enabled: true, version: 1, created_operation_id: null })),
  { id: sourceUuid('retained-alternate-sku'), product_id: alternateProduct.id, color_id: reference.colorId,
    fit_id: reference.fitId, size_id: reference.sizes[0].id, sku_code: 'NATIVE-REF-SKU-' + DATASET_ID,
    enabled: true, version: 1, created_operation_id: null }];
  const season = { id: sourceUuid('season'), code: 'NATIVE_REFERENCE_2026', name: 'SYNTHETIC REFERENCE SEASON', display_order: 0 };
  const baselines = [
    { warehouseId: warehouses[0].id, skuId: skus[0].id, quantity: '7' },
    { warehouseId: warehouses[0].id, skuId: skus[1].id, quantity: '-2' },
    { warehouseId: warehouses[1].id, skuId: skus[0].id, quantity: '11' },
    { warehouseId: warehouses[1].id, skuId: skus[2].id, quantity: '5' },
  ].map((row, index) => ({ ...row, sourceKey: 'REFERENCE-BASELINE-' + index, businessDate: '2026-11-01' }));
  const absentPairs = warehouses.flatMap(warehouse => skus.filter(sku => !baselines.some(row => row.warehouseId === warehouse.id && row.skuId === sku.id))
    .map(sku => ({ warehouseId: warehouse.id, skuId: sku.id, quantity: '0', basis: 'CLOSED_REFERENCE_SOURCE_EXPLICIT_ABSENCE' })));
  const references = artifact('references.json', JSON.stringify({ format: 'NEW_LITERAL_REFERENCE_PLAN_V1', datasetId: DATASET_ID,
    scope: SCOPE, reference, warehouses, alternateProduct, skus, season, scheme: SCHEME_ROW,
    credentials: 'RANDOM_RAM_ONLY_DB_PASSWORDS_AND_APPLICATION_SCRYPT_HASH_NEVER_SOURCE_ARTIFACTS' }, null, 2) + '\n');
  const sourceRows = [...warehouses.map((row, index) => ({ entity: 'WAREHOUSE', sourceKey: 'REFERENCE-WAREHOUSE-' + index, native: row })),
    ...skus.map((row, index) => ({ entity: 'SKU', sourceKey: 'REFERENCE-SKU-' + index, native: row })),
    ...baselines.map(row => ({ entity: 'INVENTORY_BASELINE', sourceKey: row.sourceKey, warehouseId: row.warehouseId,
      skuId: row.skuId, signedQuantity: row.quantity, businessDate: row.businessDate }))];
  const lines = sourceRows.map(row => JSON.stringify(row)), source = artifact('source.ndjson', lines.join('\n') + '\n');
  const expected = { WAREHOUSE: 2, SKU: 3, INVENTORY_LEDGER: 4, IMPORT_BATCH: 1 };
  const namespace = 'synthetic.opt02.current-native-reference.' + DATASET_ID;
  const batchId = stableImportId('batch', namespace, 'NEW_FINITE_REFERENCE_SOURCE_V1'), cutoffAt = '2026-11-01T00:00:00.000Z';
  const manifest = artifact('manifest.json', JSON.stringify({ format: 'NEW_FINITE_REFERENCE_CUTOFF_MANIFEST_V1', scope: SCOPE,
    datasetId: DATASET_ID, namespace, batchId, cutoffAt, mappingVersion: 'synthetic-legacy-cutoff-v1',
    files: [references, source].map(({ utf8, ...descriptor }) => descriptor), expected,
    allNativeWarehouseIds: warehouses.map(row => row.id), allNativeSkuIds: skus.map(row => row.id),
    nonzeroBaselines: baselines, explicitAbsentPairs: absentPairs,
    finalDelta: { rows: [], reason: 'CLOSED_SYNTHETIC_SOURCE_NO_EXTERNAL_FEED_OR_UNRESOLVED_CHANGE' },
    noTypedProductOrHistorySource: true, referenceOnlyNoMaintainedSupplierOrProductCreated: true }, null, 2) + '\n');
  const sourceItems = sourceRows.map((row, index) => ({ sourceEntityType: row.entity, sourceKey: row.sourceKey,
    sourceRecordHash: SHA(lines[index]), sourceFileRef: source.path,
    ...(row.entity === 'INVENTORY_BASELINE' ? { targetType: 'INVENTORY_LEDGER', warehouseId: row.warehouseId,
      skuId: row.skuId, quantity: BigInt(row.signedQuantity), businessDate: row.businessDate } : { targetType: row.entity, targetId: row.native.id }) }));
  const envelope = { actorAccountId: reference.actor.accountId, batchId };
  const commands = [
    { ...envelope, action: 'IMPORT_STAGE', requestKey: DATASET_ID + ':REFERENCE:STAGE', sourceName: namespace,
      sourceHash: manifest.sha256, sourceManifestRef: manifest.path, cutoffAt, mappingVersion: 'synthetic-legacy-cutoff-v1', expected },
    { ...envelope, action: 'IMPORT_CHUNK', requestKey: DATASET_ID + ':REFERENCE:MEMBERS', expectedSequence: 0, expectedCursor: 0,
      items: sourceItems.filter(row => row.targetType !== 'INVENTORY_LEDGER') },
    { ...envelope, action: 'IMPORT_CHUNK', requestKey: DATASET_ID + ':REFERENCE:BASELINES', expectedSequence: 1, expectedCursor: 5,
      items: sourceItems.filter(row => row.targetType === 'INVENTORY_LEDGER') },
    { ...envelope, action: 'IMPORT_PUBLISH', requestKey: DATASET_ID + ':REFERENCE:PUBLISH', expectedSequence: 2, expectedCursor: 9,
      approval: { completeScope: true, absentMeansZero: true, allFilesVerified: true, finalDeltaVerified: true,
        noUnresolvedExceptions: true, sourceHash: manifest.sha256, sourceManifestRef: manifest.path } },
  ];
  commands.forEach(validateCutoffImportCommand);
  const zero = { WAREHOUSE: 0, SKU: 0, INVENTORY_LEDGER: 0, IMPORT_BATCH: 0 };
  const checkpoints = [
    { sequence: 0, cursor: 0, counts: zero, expected },
    { sequence: 1, cursor: 5, counts: { ...zero, WAREHOUSE: 2, SKU: 3 }, expected },
    { sequence: 2, cursor: 9, counts: { ...zero, WAREHOUSE: 2, SKU: 3, INVENTORY_LEDGER: 4 }, expected },
    { sequence: 3, cursor: 10, counts: expected, expected },
  ];
  const expectedResults = commands.map((command, index) => ({
    operationId: stableImportId('operation', command.actorAccountId, command.requestKey), batchId,
    sequence: checkpoints[index].sequence, cursor: checkpoints[index].cursor,
    status: index === 0 ? 'STAGED' : index === 3 ? 'IMPORTED' : 'VALIDATING',
    ledgerEntryIds: index === 2 ? command.items.map(item => stableImportId('baseline', namespace, item.sourceEntityType, item.sourceKey)).sort() : [],
  }));
  const fixture = freeze({ scope: SCOPE, datasetId: DATASET_ID, reference, warehouses, alternateProduct, skus, season,
    scheme: SCHEME_ROW, baselines, absentPairs, expected, namespace, batchId, cutoffAt,
    artifacts: [references, source, manifest], commands, commandHashes: commands.map(requestHash), checkpoints, expectedResults,
    referenceRows: 105, originalReferenceRows: 99, extraReferenceRows: 6,
    referenceCounts: { ...reference.counts, product: 3, sku: 3, warehouse: 2, season: 1, barcode_scheme: 1 },
    sourceOnly: true, physicalTargetAssigned: false, executionApproved: false,
    noMaintainedSupplierOrProductCreated: true, noV2ProductOrHistorySource: true });
  fixtures.add(fixture); return fixture;
}

export function additionalReferenceCommands(input, passwordHash) {
  const fixture = assertFixture(input), core = seedCommands(fixture.reference, passwordHash);
  const template = core.find(row => row.table === 'product' && row.values[0] === fixture.reference.productId);
  need(template, 'ORIGINAL_PARAMETERIZED_PRODUCT_REFERENCE_TEMPLATE_REQUIRED');
  const values = [...template.values];
  for (const [column, value] of Object.entries({ id: fixture.alternateProduct.id, product_code: fixture.alternateProduct.code,
    name: fixture.alternateProduct.name, retail_price: fixture.alternateProduct.retailPrice, system_item_code: 'REFERENCE-ALT' }))
    values[SETUP_COLUMNS.product.indexOf(column)] = value;
  const alternateSku = fixture.skus[2];
  return freeze([
    ...fixture.warehouses.map(row => ({ table: 'warehouse', text: 'INSERT INTO naijue_erp.warehouse (id,hall_id,name,enabled,version,created_operation_id) VALUES ($1,$2,$3,$4,$5,$6)',
      values: [row.id, row.hall_id, row.name, row.enabled, row.version, row.created_operation_id] })),
    { table: 'product', ...setupInsert('product', values) },
    { table: 'sku', ...setupInsert('sku', [alternateSku.id, alternateSku.product_id, alternateSku.color_id, alternateSku.fit_id,
      alternateSku.size_id, alternateSku.sku_code, alternateSku.enabled, alternateSku.version, alternateSku.created_operation_id]) },
    { table: 'season', text: 'INSERT INTO naijue_erp.season (id,code,name,display_order) VALUES ($1,$2,$3,$4)',
      values: [fixture.season.id, fixture.season.code, fixture.season.name, fixture.season.display_order] },
    { table: 'barcode_scheme', text: 'INSERT INTO naijue_erp.barcode_scheme (id,name,barcode_type,rule_description,code_length,rule_version,status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      values: [fixture.scheme.id, fixture.scheme.name, fixture.scheme.barcode_type, fixture.scheme.rule_description,
        fixture.scheme.code_length, fixture.scheme.rule_version, fixture.scheme.status] },
  ]);
}

export async function seedNewReference(query, input, passwordHash) {
  const fixture = assertFixture(input);
  const original = await seedReference(query, fixture.reference, passwordHash); // Exactly99 first, not >=99.
  for (const row of additionalReferenceCommands(fixture, passwordHash)) await query(row.text, row.values);
  await query('SET CONSTRAINTS ALL IMMEDIATE');
  for (const [table, count] of Object.entries(fixture.referenceCounts)) {
    const rows = (await query(`SELECT count(*)::text n FROM naijue_erp."${table}"`)).rows;
    need(rows.length === 1 && rows[0].n === String(count), 'EXACT_105_REFERENCE_ROW_COUNT_REQUIRED:' + table);
  }
  need(Object.values(fixture.referenceCounts).reduce((n, value) => n + value, 0) === 105, 'EXACT_SOURCE_REFERENCE_TOTAL_REQUIRED');
  return freeze({ scope: SCOPE, original99AcknowledgedInsideSetupTransaction: original.counts,
    referenceRows: 105, constraintsForcedImmediate: true, serviceProduced: false, publication: false });
}
