/** R3 synthetic inputs only. The public compile function takes an admission
 * from the caller's reviewed host for V2 and never connects or executes SQL. */
import {createHash} from 'node:crypto';
import {copyFile, mkdir, open, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {createSyntheticPackage} from '../../tests/fixtures/unified-import/synthetic-package.ts';
import {createSyntheticFresh35WholePackageInput} from '../../tests/fixtures/unified-import/whole-package-synthetic.ts';
import {SCHEMA_DECLARATIONS_SHA256, TABLE_SCHEMAS, registryTargetId, sha256} from '../../packages/application/src/unified-import-contract.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {buildHistoricalSalesHallInitializationIntent, historicalSalesHallApprovalWire} from '../../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {historicalLineAmountEvidenceWire, readHistoricalLineAmountEvidence} from '../../packages/application/src/unified-historical-line-amount-evidence.ts';
import {historicalSettlementRetentionWire, readHistoricalSettlementRetentionApproval} from '../../packages/application/src/unified-historical-settlement-retention.ts';
import {closeExplicitZeroApproval} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {readExplicitZeroCliApproval} from '../../tools/unified-import/explicit-zero-cli-input.mjs';
import {readHistoricalHallCliApproval} from '../../tools/unified-import/historical-hall-cli-input.mjs';
import {streamPreflight} from '../../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../../tools/unified-import/stream-plan.mjs';
import {assertStreamProgramRequestSize, buildStreamProgram} from '../../tools/unified-import/stream-program.mjs';

import {syntheticTransferRows} from './transfer-profile.mjs';

const profiles = {
  smoke: {
    customer: 4, supplier: 3, staff: 5, warehouse: 4, product: 5, payment_account: 4,
    product_category: 2, color: 3, fit: 2, size: 8, size_group: 2, size_group_member: 8,
    barcode_scheme: 6, hall: 3, payment_method: 2, sku: 17, inventory_baseline: 19,
    transfer_header: 3, transfer_line: 8, sales_header: 34, sales_line: 51,
    sales_settlement: 34, payment_account_hall: 8, sku_barcode: 12, product_image: 0, season: 0,
  },
  full: {
    customer: 263, supplier: 222, staff: 103, warehouse: 54, product: 2973, payment_account: 80,
    product_category: 47, color: 182, fit: 6, size: 256, size_group: 4, size_group_member: 35,
    barcode_scheme: 6, hall: 44, payment_method: 12, sku: 14819, inventory_baseline: 39496,
    transfer_header: 15135, transfer_line: 282947, sales_header: 29081, sales_line: 84186,
    sales_settlement: 26538, payment_account_hall: 985, sku_barcode: 13760, product_image: 0, season: 0,
  },
};
const baseSmoke = {...profiles.smoke, sales_header: 8, sales_line: 20, sales_settlement: 6};
const admin = {
  staff_id: stableImportId('D1_SYNTHETIC_MIXED', 'admin-staff'),
  account_id: stableImportId('D1_SYNTHETIC_MIXED', 'admin-account'),
  login_name: 'synthetic-d1-mixed-admin',
  staff_name: 'SYNTHETIC D1 mixed admin',
};
const offlineTarget = {
  protocol: 'STANDARD_IMPORT_SQL_V1',
  system_identifier: '123456789', database_oid: '42',
  database_name: 'synthetic_d1_mixed_offline', catalog_sha256: 'a'.repeat(64),
};
const spread = (i, count) => (i - 1) % count + 1;
const slots = (i, total, groups) => Math.floor(total / groups) + Number(i <= total % groups);
const money = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
const formatKey = (table, i) => `${table}:${String(i).padStart(i < 100 ? 2 : 8, '0')}`;
const jsonLine = value => JSON.stringify(value) + '\n';

function countsFor(scale, baseProfile) {
  const counts = baseProfile ? baseSmoke : profiles[scale];
  if (!counts || (baseProfile && scale !== 'smoke')) throw Error('USE_SMOKE_OR_FULL');
  return counts;
}

export function expectedWorkload(scale = 'smoke', {baseProfile = false} = {}) {
  const counts = countsFor(scale, baseProfile);
  const master = Object.keys(counts).filter(t => !['inventory_baseline', 'sales_header', 'sales_line', 'sales_settlement', 'transfer_header', 'transfer_line'].includes(t));
  const masterRows = master.reduce((sum, t) => sum + counts[t], 0);
  const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const registryRows = rows - counts.inventory_baseline - counts.size_group_member - counts.payment_account_hall;
  const steps = {
    MASTER: Math.ceil(masterRows / 500),
    KEYS: Math.ceil(counts.inventory_baseline / 100),
    BASELINE_PUBLISH: 1,
    DOCUMENT_STAGE: 1,
    DOCUMENT_CHUNK: counts.sales_header + counts.transfer_header,
    DOCUMENT_PUBLISH: 1,
  };
  return {counts, rows, registryRows, steps, stepCount: Object.values(steps).reduce((sum, n) => sum + n, 0)};
}

// The format requires exact per-file pins. Buffer only a small block, as the
// existing large-synthetic-package writer does, regardless of profile.
async function writePinned(directory, relative_path, chunks) {
  const file = await open(join(directory, relative_path), 'wx', 0o600);
  const digest = createHash('sha256');
  let bytes = 0;
  let pending = '';
  const flush = async () => {
    const block = Buffer.from(pending);
    if (block.length) {
      await file.writeFile(block);
      digest.update(block);
      bytes += block.length;
      pending = '';
    }
  };
  try {
    for await (const chunk of chunks) {
      pending += chunk;
      if (pending.length >= 256 * 1024) await flush();
    }
    await flush();
  } finally {
    await file.close();
  }
  return {relative_path, bytes, sha256: digest.digest('hex')};
}

async function writeRows(directory, path, rows) {
  let row_count = 0;
  const chunks = (function* () {
    for (const row of rows) {
      row_count++;
      yield jsonLine(row);
    }
  })();
  return {...await writePinned(directory, path, chunks), row_count};
}

function* range(n, row) {
  for (let i = 1; i <= n; i++) yield row(i);
}

export async function writeMixedSyntheticPackage(root, {scale = 'smoke', baseProfile = false, hallExtraRefs = 0, hallExtraRefPercent = 0} = {}) {
  const counts = countsFor(scale, baseProfile);
  if (scale !== 'full') throw Error('TRANSFER_PROFILE_REQUIRES_FULL');
  if (!Number.isInteger(hallExtraRefs) || hallExtraRefs < 0 || hallExtraRefs > 98 ||
      !Number.isInteger(hallExtraRefPercent) || hallExtraRefPercent < 0 || hallExtraRefPercent > 100) {
    throw Error('HALL_REFERENCE_LAYER_OUT_OF_RANGE');
  }
  if (baseProfile && (hallExtraRefs || hallExtraRefPercent)) throw Error('HALL_REFERENCE_LAYER_REQUIRES_V2');
  const seed = baseProfile ? undefined : createSyntheticFresh35WholePackageInput(null, 'settlement-retention25');
  const {manifest, records, reports, artifacts, registry} = seed?.pkg ?? createSyntheticPackage();
  const namespace = manifest.source_namespace;
  const sourceHash = manifest.inventory_source.source_file_sha256;
  const packageDir = join(root, 'package');
  const approvalDir = join(root, 'approvals');
  const scopeDir = join(approvalDir, 'scope');
  const sourceDir = join(root, 'synthetic-sources');
  await mkdir(root, {mode: 0o700});
  await mkdir(packageDir);
  await mkdir(approvalDir);
  await mkdir(scopeDir);
  await mkdir(sourceDir);
  await writeFile(join(sourceDir, 'SYNTHETIC-source-description.txt'), 'SYNTHETIC ONLY source spreadsheet fixture, NOT user data');
  await writeFile(join(sourceDir, 'SYNTHETIC-alignment-evidence.txt'), 'SYNTHETIC ONLY cutoff alignment evidence');
  for (const [path, source] of Object.entries(seed?.syntheticSourceFiles ?? {})) {
    await writeFile(join(sourceDir, path), source);
  }

  const sourceRef = (table, i) => ({file_sha256: sourceHash, sheet: `SYNTHETIC_${table.toUpperCase()}`, row: i});
  const identityCache = new Map();
  const masterTables = new Set(Object.keys(counts).filter(t => !/^(sales_|transfer_|inventory_)/.test(t)));
  const id = (table, i) => {
    if (!masterTables.has(table)) return registryTargetId(namespace, table.toUpperCase(), formatKey(table, i));
    if (!identityCache.has(table)) identityCache.set(table, []);
    const entries = identityCache.get(table);
    return entries[i] ??= registryTargetId(namespace, table.toUpperCase(), formatKey(table, i));
  };
  const row = (table, i, patch) => ({
    source_key: formatKey(table, i),
    source_refs: [sourceRef(table, i)],
    fields: {...records[table][0].fields, ...(TABLE_SCHEMAS[table].id ? {id: id(table, i)} : {}), ...patch},
  });
  const warehouseHall = w => spread(w, counts.hall);
  const productGroup = p => spread(p, counts.size_group);
  const names = (table, i) => `SYNTHETIC ${table.toUpperCase()} ${i}`;
  const nameRows = (table, patch) => range(counts[table], i => row(table, i, {name: names(table, i), ...patch?.(i)}));
  const codeRows = (table, prefix) => nameRows(table, i => ({code: `${prefix}${String(i).padStart(4, '0')}`}));
  const groupOffsets = [0];
  for (let i = 1; i <= counts.size_group; i++) groupOffsets[i] = groupOffsets[i - 1] + slots(i, counts.size_group_member, counts.size_group);
  const inventoryWarehouses = [...range(counts.warehouse, i => id('warehouse', i))].sort();
  const inventorySkus = [...range(counts.sku, i => id('sku', i))].sort();
  function* inventoryValues() {
    for (const [warehouseIndex, warehouse_id] of inventoryWarehouses.entries()) {
      const take = slots(warehouseIndex + 1, counts.inventory_baseline, counts.warehouse);
      const skus = Array.from({length: take}, (_, i) => inventorySkus[(warehouseIndex * 97 + i) % counts.sku]).sort();
      for (const [skuIndex, sku_id] of skus.entries()) {
        const amount = (warehouseIndex + skuIndex) % 97 + 1;
        const quantity = String((warehouseIndex + skuIndex) % 5 === 0 ? -amount : amount);
        yield {warehouse_id, sku_id, quantity};
      }
    }
  }

  const transfers = syntheticTransferRows(inventoryWarehouses, inventorySkus, inventoryValues());
  const seedProof = seed?.historicalSalesHallApproval;
  const sourceCaptures = [...(seedProof?.source_captures ?? [])];
  const bridges = [...(seedProof?.identity_bridges ?? [])];
  const resolutions = [...(seedProof?.resolutions ?? [])];
  const hallEvidence = [undefined, seedProof?.records[0].evidence];
  const seedSalesCount = seed?.pkg.records.sales_header.length ?? 0;
  const ordinarySales = counts.sales_header - seedSalesCount;
  const ordinaryLines = counts.sales_line - (seed?.pkg.records.sales_line.length ?? 0);
  const ordinarySettled = counts.sales_settlement - (seed?.pkg.records.sales_settlement.length ?? 0);
  let linkedSourceHash;
  if (seed && (hallExtraRefs || hallExtraRefPercent)) {
    // Every added reference names a deterministic occurrence in this synthetic
    // source. The compact range index avoids materializing a second sale table.
    const sheets = Array.from({length: hallExtraRefs + Number(hallExtraRefPercent > 0)}, (_, i) =>
      ({sheet: `SYNTHETIC_HISTORY_LINK_${i + 1}`, first_row: 1, last_row: ordinarySales, source_document_offset: seedSalesCount}));
    const linkedSource = await writePinned(sourceDir, 'SYNTHETIC-history-links.json', [jsonLine({synthetic_only: true, sheets})]);
    manifest.source_files.push(linkedSource);
    linkedSourceHash = linkedSource.sha256;
  }
  const proofRef = member => ({evidence_sha256: member.evidence_sha256, record_key: member.record_key});
  if (seed) {
    for (let w = 2; w <= Math.min(counts.warehouse, ordinarySales); w++) {
      const warehouse_id = id('warehouse', w);
      const selected_hall_id = id('hall', warehouseHall(w));
      const runtimeWarehouse = stableImportId('D1_SYNTHETIC_V2_SOURCE', 'warehouse', String(w));
      const runtimeHall = stableImportId('D1_SYNTHETIC_V2_SOURCE', 'hall', String(warehouseHall(w)));
      const observation = {
        source_namespace: 'D1_SYNTHETIC_V2_SOURCE', warehouse_source_key: formatKey('warehouse', w),
        runtime_warehouse_id: runtimeWarehouse, source_native_version: 1, effective_version: 1,
        runtime_hall_ids: [runtimeHall], captured_at: '2026-11-02T08:00:00Z',
        transaction_snapshot: `SYNTHETIC_ONLY:${w}:${w + 1}`,
        relation_basis: 'SYNTHETIC_FIXTURE_OBSERVATION_NOT_REAL_RUNTIME',
      };
      const capturePin = await writePinned(sourceDir, `SYNTHETIC-capture-${w}.json`, [jsonLine({synthetic_only: true, observation})]);
      const capture = {capture_evidence_sha256: capturePin.sha256, ...observation};
      const bridge = {
        record_key: `SYNTHETIC-BRIDGE-${w}`, entity_type: 'WAREHOUSE',
        source_namespace: observation.source_namespace, warehouse_source_key: observation.warehouse_source_key,
        runtime_warehouse_id: runtimeWarehouse, target_namespace: namespace, target_warehouse_id: warehouse_id,
        source_capture_sha256: capturePin.sha256,
        hall_links: [{runtime_hall_id: runtimeHall, target_hall_id: selected_hall_id}],
        source_refs: [sourceRef('warehouse', w)], scope: 'FIXED_CAPTURE_SCOPE_ONLY',
      };
      const bridgePin = await writePinned(sourceDir, `SYNTHETIC-bridge-${w}.json`, [jsonLine({synthetic_only: true, record: bridge})]);
      const pinnedBridge = {evidence_sha256: bridgePin.sha256, ...bridge};
      manifest.source_files.push(capturePin, bridgePin);
      sourceCaptures.push(capture);
      bridges.push(pinnedBridge);
      hallEvidence[w] = buildHistoricalSalesHallInitializationIntent({
        basis: 'MIGRATION_DERIVED', original_hall_id: null, selected_hall_id, warehouse_id,
        target_snapshot: {warehouse_id, hall_id: selected_hall_id, version: 1, captured_at: null},
        source_capture: capture, identity_bridge: proofRef(pinnedBridge), resolution: null,
        has_difference: false, review_required: false,
      });
    }
  }

  const saleWarehouse = i => spread(i, counts.warehouse);
  const saleLines = i => slots(i, ordinaryLines, ordinarySales);
  const saleCents = i => BigInt(100 + i % 37);
  const saleGross = i => money(saleCents(i) * BigInt(saleLines(i)));
  const saleId = i => id('sales_header', i + seedSalesCount);
  const paymentPairs = [...range(counts.payment_account_hall, i => {
    if (i <= counts.hall) return {account: 1, hall: i};
    const offset = i - counts.hall - 1;
    const account = 2 + offset % (counts.payment_account - 1);
    return {account, hall: spread(account + Math.floor(offset / (counts.payment_account - 1)), counts.hall)};
  })];
  const methodFor = account => spread(account, counts.payment_method);
  const paymentForHall = Array.from({length: counts.hall + 1}, () => []);
  for (const pair of paymentPairs) paymentForHall[pair.hall].push(pair.account);
  function* saleHeadersWithWarehouse() {
    if (seed) {
      for (const header of records.sales_header) yield {header, w: 1};
    }
    for (let i = 1; i <= ordinarySales; i++) {
      const w = saleWarehouse(i);
      const gross = saleGross(i);
      const header = row('sales_header', i + seedSalesCount, {
        number: `SYNTHETIC-SALE-${i}`, warehouse_id: id('warehouse', w), hall_id: id('hall', warehouseHall(w)),
        customer_id: id('customer', spread(i, counts.customer)), gross_amount: gross, net_due: gross,
      });
      if (seed) header.historical_hall_evidence = hallEvidence[w];
      const n = hallExtraRefs + Number((i * 37) % 100 < hallExtraRefPercent);
      for (let j = 1; j <= n; j++) {
        header.source_refs.push({file_sha256: linkedSourceHash, sheet: `SYNTHETIC_HISTORY_LINK_${j}`, row: i});
      }
      yield {header, w};
    }
  }
  function* documentLines(table, headers, lines, parentKey, make) {
    let i = 0;
    for (let h = 1; h <= headers; h++) {
      for (let line_no = 1; line_no <= lines(h); line_no++) {
        i++;
        const offset = seed && table === 'sales_line' ? records.sales_line.length : 0;
        const sku = spread(h * 13 + line_no, counts.sku);
        yield row(table, i + offset, {
          [parentKey]: table === 'sales_line' ? saleId(h) : id('transfer_header', h), line_no, sku_id: id('sku', sku),
          ...make(h, line_no),
        });
      }
    }
  }
  const streams = {
    customer: () => codeRows('customer', 'SC'),
    supplier: () => codeRows('supplier', 'SS'),
    staff: () => nameRows('staff', i => ({hall_id: id('hall', spread(i, counts.hall)), contact: null, ...(seed ? {departure_date: null} : {})})),
    warehouse: () => nameRows('warehouse', i => ({hall_id: id('hall', warehouseHall(i))})),
    product_category: () => nameRows('product_category'),
    color: () => codeRows('color', 'C'),
    fit: () => nameRows('fit', i => ({code: String.fromCharCode(64 + i)})),
    size: () => nameRows('size', i => ({code: String(899 + i)})),
    size_group: () => codeRows('size_group', 'SG'),
    size_group_member: function* () {
      let i = 0;
      for (let g = 1; g <= counts.size_group; g++) {
        for (let m = 1; m <= groupOffsets[g] - groupOffsets[g - 1]; m++) {
          yield row('size_group_member', ++i, {size_group_id: id('size_group', g), size_id: id('size', groupOffsets[g - 1] + m), display_order: m});
        }
      }
    },
    product: () => nameRows('product', i => ({
      product_code: `SYNTHETIC-P-${i}`, system_item_code: String(100000 + i),
      category_id: id('product_category', spread(i, counts.product_category)),
      supplier_id: id('supplier', spread(i, counts.supplier)), size_group_id: id('size_group', productGroup(i)),
      season_id: null, season_ids: [],
    })),
    product_image: () => [],
    season: () => [],
    sku: function* () {
      let i = 0;
      for (let p = 1; p <= counts.product; p++) {
        const group = productGroup(p);
        for (let v = 1; v <= slots(p, counts.sku, counts.product); v++) {
          i++;
          yield row('sku', i, {
            product_id: id('product', p), sku_code: `SYNTHETIC-SKU-${i}`,
            size_id: id('size', groupOffsets[group - 1] + v),
            fit_id: id('fit', spread(v, counts.fit)), color_id: id('color', spread(p, counts.color)),
          });
        }
      }
    },
    barcode_scheme: () => records.barcode_scheme,
    sku_barcode: () => range(counts.sku_barcode, i => row('sku_barcode', i, {
      sku_id: id('sku', i), barcode: String(i).padStart(15, '0'),
    })),
    hall: () => nameRows('hall', i => ({default_customer_id: id('customer', spread(i, counts.customer)), default_sales_warehouse_id: id('warehouse', i)})),
    payment_method: () => nameRows('payment_method'),
    payment_account: () => nameRows('payment_account', i => ({payment_method_id: id('payment_method', methodFor(i))})),
    payment_account_hall: () => paymentPairs.map(({account, hall}, i) => row('payment_account_hall', i + 1, {
      payment_account_id: id('payment_account', account), hall_id: id('hall', hall),
    })),
    sales_header: function* () {
      for (const {header} of saleHeadersWithWarehouse()) yield header;
    },
    sales_line: function* () {
      if (seed) yield* records.sales_line;
      yield* documentLines('sales_line', ordinarySales, saleLines, 'sales_id', h => ({quantity: '1', deal_price: money(saleCents(h)), line_amount: money(saleCents(h))}));
    },
    sales_settlement: function* () {
      if (seed) yield* records.sales_settlement;
      for (let h = 1; h <= ordinarySettled; h++) {
        const options = paymentForHall[warehouseHall(saleWarehouse(h))];
        const account = options[(h - 1) % options.length];
        const offset = seed?.pkg.records.sales_settlement.length ?? 0;
        yield row('sales_settlement', h + offset, {
          sales_id: saleId(h), line_no: 1, direction: 'RECEIVE', amount: saleGross(h),
          payment_account_id: id('payment_account', account),
          payment_method_id_snapshot: id('payment_method', methodFor(account)),
        });
      }
    },
    transfer_header: () => range(counts.transfer_header, i => {
      const {status, from_warehouse_id, to_warehouse_id} = transfers[i-1];
      return row('transfer_header', i, {number: `SYNTHETIC-TRANSFER-${i}`, status, from_warehouse_id, to_warehouse_id});
    }),
    transfer_line: function* () {
      let i = 0;
      for (const [h, transfer] of transfers.entries()) {
        const transfer_id = id('transfer_header', h+1);
        for (const [j, sku_id] of transfer.skuIds.entries()) {
          yield row('transfer_line', ++i, {transfer_id, sku_id, line_no:j+1, quantity:String(1+(h+j+2)%17)});
        }
      }
    },
    inventory_baseline: function* () {
      let i = 0;
      for (const value of inventoryValues()) yield row('inventory_baseline', ++i, value);
    },
  };

  manifest.assets = [];
  const countRows = {};
  for (const pin of manifest.files) {
    const result = await writeRows(packageDir, pin.relative_path, streams[pin.table]());
    Object.assign(pin, result);
    countRows[pin.table] = result.row_count;
  }
  const fixedSchemes = new Map(registry.filter(entry => entry.entity_type === 'BARCODE_SCHEME')
    .map(entry => [entry.canonical_source_key, entry]));
  function* registryRows() {
    for (const table of Object.keys(TABLE_SCHEMAS)) {
      if (!TABLE_SCHEMAS[table].id) continue;
      const entity_type = table.toUpperCase();
      for (const r of streams[table]()) {
        yield table === 'barcode_scheme' ? fixedSchemes.get(r.source_key) : {
          entity_type, source_namespace: namespace, canonical_source_key: r.source_key, target_id: r.fields.id,
          aliases: [], identity_basis: 'STABLE_IMPORT_ID_V1', source_refs: r.source_refs,
        };
      }
    }
  }
  manifest.identity_registry = await writeRows(packageDir, 'identity-registry.jsonl', registryRows());
  manifest.inventory_source.warehouse_registry_sha256 = manifest.identity_registry.sha256;
  manifest.inventory_source.sku_registry_sha256 = manifest.identity_registry.sha256;
  const reconciliation = reports['reconciliation.json'];
  for (const [table, n] of Object.entries(countRows)) {
    reconciliation.tables[table] = {source_rows: n, retained_rows: n, rejected_rows: 0};
  }
  for (const pin of manifest.reports) {
    const bytes = pin.role === 'RECONCILIATION' ? jsonLine(reconciliation) : artifacts[pin.relative_path];
    Object.assign(pin, await writePinned(packageDir, pin.relative_path, [bytes instanceof Uint8Array ? Buffer.from(bytes).toString('utf8') : bytes]));
  }

  const stockPin = async (path, values) => {
    const {relative_path, row_count, sha256} = await writeRows(scopeDir, path, values);
    return {relative_path, row_count, sha256, records_sha256: sha256};
  };
  await copyFile(join(packageDir, manifest.identity_registry.relative_path), join(scopeDir, 'registry.jsonl'));
  const scopeInput = {
    source_namespace: namespace, batch_key: 'D1_SYNTHETIC_MIXED_BASELINE',
    inventory_file_sha256: sourceHash, cutoff_at: manifest.inventory_source.cutoff_at,
    identity_registry: {
      relative_path: 'registry.jsonl', sha256: manifest.identity_registry.sha256, row_count: manifest.identity_registry.row_count,
    },
    warehouses: await stockPin('warehouses.jsonl', inventoryWarehouses.map(id => ({id}))),
    skus: await stockPin('skus.jsonl', inventorySkus.map(id => ({id}))),
    explicit_values: await stockPin('explicit.jsonl', inventoryValues()),
    unknown_mask: await stockPin('unknown.jsonl', []),
  };
  const scopeManifest = await writePinned(scopeDir, 'input-manifest.json', [jsonLine({format_version: 'EXPLICIT_ZERO_SCOPE_INPUT_V2', ...scopeInput})]);
  const universe = counts.warehouse * counts.sku;
  const scope = await writePinned(scopeDir, 'approval.json', [jsonLine({
    format_version: 'INVENTORY_BASELINE_SCOPE_V1', ...scopeInput, decision_ref: 'SYNTHETIC_ACCEPTANCE_ONLY',
    input_manifest: {relative_path: scopeManifest.relative_path, sha256: scopeManifest.sha256},
    counts: {universe, explicit_confirmed: counts.inventory_baseline, zero: universe - counts.inventory_baseline, unknown: 0, explicit_unknown_overlap: 0},
  })]);

  const evidence = {scope: {...scope, relative_path: 'scope/approval.json'}};
  if (seedProof) {
    function* hallChunks() {
      const fields = {
        format_version: seedProof.format_version, source_namespace: namespace, evidence_sha256: seedProof.evidence_sha256,
        source_captures: sourceCaptures, identity_bridges: bridges, resolutions,
      };
      yield JSON.stringify(fields).slice(0, -1) + ',"records":[';
      let first = true;
      for (const {header, w} of saleHeadersWithWarehouse()) {
        const warehouse_source_key = formatKey('warehouse', w);
        if (!first) yield ',';
        first = false;
        yield JSON.stringify({
          source_key: header.source_key, target_id: header.fields.id, source_refs: header.source_refs,
          evidence: header.historical_hall_evidence, target_initialization: {warehouse_source_key},
        });
      }
      yield ']}';
    }
    evidence.hall = await writePinned(approvalDir, 'historical-hall.json', hallChunks());
    evidence.amount = await writePinned(approvalDir, 'historical-line-amount.json',
      [historicalLineAmountEvidenceWire(seed.historicalLineAmountEvidence).utf8]);
    evidence.settlement = await writePinned(approvalDir, 'historical-settlement-retention.json',
      [historicalSettlementRetentionWire(seed.historicalSettlementRetentionApproval).utf8]);
  } else {
    manifest.schema_contract.source_declarations_sha256 = SCHEMA_DECLARATIONS_SHA256;
  }
  const manifestBytes = Buffer.from(jsonLine(manifest));
  await writeFile(join(packageDir, 'manifest.json'), manifestBytes, {flag: 'wx'});
  const result = {
    scale, baseProfile, manifestSha256: sha256(manifestBytes), evidence, admin,
    expected: expectedWorkload(scale, {baseProfile}),
  };
  await writeFile(join(root, 'fixture.json'), jsonLine(result), {flag: 'wx'});
  return result;
}

async function openPreflight(root, reportDir) {
  const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'));
  const packageDir = join(root, 'package');
  const approvalDir = join(root, 'approvals');
  const manifestBytes = await readFile(join(packageDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.package_kind !== 'SYNTHETIC' || fixture.manifestSha256 !== sha256(manifestBytes)) {
    throw Error('D1_SYNTHETIC_FIXTURE_REQUIRED');
  }
  const sourceNamespace = manifest.source_namespace;
  const sourceHashes = new Set(manifest.source_files.map(pin => pin.sha256));
  const options = {allowSynthetic: true, expectedManifestSha256: fixture.manifestSha256};
  const readEvidence = async (name, parse) => {
    const pin = fixture.evidence[name];
    return parse({bytes: await readFile(join(approvalDir, pin.relative_path)), trustedSha256: pin.sha256, sourceNamespace, sourceHashes});
  };
  if (fixture.evidence.hall) {
    options.historicalSalesHallApproval = await readHistoricalHallCliApproval(packageDir, manifest,
      join(approvalDir, fixture.evidence.hall.relative_path), fixture.evidence.hall.sha256);
    options.historicalLineAmountEvidence = await readEvidence('amount', readHistoricalLineAmountEvidence);
    options.historicalSettlementRetentionApproval = await readEvidence('settlement', readHistoricalSettlementRetentionApproval);
  }
  const scope = fixture.evidence.scope;
  options.explicitZeroApproval = await readExplicitZeroCliApproval(packageDir, manifest, join(approvalDir, scope.relative_path), scope.sha256);
  try {
    const summary = await streamPreflight(packageDir, reportDir, options);
    if (!summary.checks_passed || !summary.complete_package_validation || summary.import_eligible) {
      throw Error(`D1_PREFLIGHT_REJECTED: ${join(reportDir, 'issues.jsonl')}`);
    }
    return {summary, fixture, manifestBytes, options};
  } catch (error) {
    closeExplicitZeroApproval(options.explicitZeroApproval);
    throw error;
  }
}

export async function preflightMixedSyntheticPackage(root, reportDir) {
  const {summary, options} = await openPreflight(root, reportDir);
  closeExplicitZeroApproval(options.explicitZeroApproval);
  return {
    counts: summary.counts, issueCount: summary.issue_count, importEligible: summary.import_eligible,
    hallApprovalBytes: options.historicalSalesHallApproval
      ? Buffer.byteLength(historicalSalesHallApprovalWire(options.historicalSalesHallApproval).utf8) : 0,
    hallApprovals: options.historicalSalesHallApproval?.records.length ?? 0,
    amountDifferences: summary.historical_line_amount_differences ?? 0,
  };
}

export async function compileMixedSyntheticPackage(root, reportDir, {target, historicalSalesAdmission} = {}) {
  const {summary, fixture, manifestBytes, options} = await openPreflight(root, reportDir);
  const index = join(reportDir, 'index.sqlite');
  let plan;
  try {
    plan = await prepareStreamPlan(index, summary, manifestBytes, {
      ...options, target, historicalSalesAdmission, initialization_identity: fixture.admin,
    });
    const build = () => buildStreamProgram(plan, index, summary, fixture.admin, {coalesce: false});
    const native = await build();
    return {
      identity: native.identity, initialize: native.initialize, expected: fixture.expected,
      expectedCounts: summary.counts, totals: plan.totals,
      explicitZeroApproval: options.explicitZeroApproval,
      steps: {async *[Symbol.asyncIterator]() {yield* (await build()).steps;}},
      async dispose() {
        try {await plan.dispose();} finally {closeExplicitZeroApproval(options.explicitZeroApproval);}
      },
    };
  } catch (error) {
    try {await plan?.dispose();} finally {closeExplicitZeroApproval(options.explicitZeroApproval);}
    throw error;
  }
}

function stepName({method, request: {payload}}) {
  if (method === 'masterChunk') return 'MASTER';
  if (method === 'publish') return payload.phase === 'BASELINE' ? 'BASELINE_PUBLISH' : 'DOCUMENT_PUBLISH';
  if (method === 'documentChunk') return payload.mode === 'STAGE' ? 'DOCUMENT_STAGE' : 'DOCUMENT_CHUNK';
  if (method === 'baselineKeys') return 'KEYS';
  throw Error(`UNKNOWN_STEP_METHOD: ${method}`);
}

export async function summarizeMixedProgram(program) {
  const steps = {};
  let rows = 0;
  let maxStepBytes = 0;
  for await (const step of program.steps) {
    const name = stepName(step);
    steps[name] = (steps[name] ?? 0) + 1;
    rows += step.request.payload.rows?.length ?? 0;
    maxStepBytes = Math.max(maxStepBytes, assertStreamProgramRequestSize(step.request, name).wire_bytes);
  }
  return {
    steps, rows, maxStepBytes, stepCount: Object.values(steps).reduce((sum, n) => sum + n, 0),
    initialize: assertStreamProgramRequestSize(program.initialize, 'INITIALIZE'),
    planSha256: program.identity.planSha256,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {
      scale: {type: 'string', default: 'full'},
      'base-profile': {type: 'boolean', default: false},
      'hall-extra-refs': {type: 'string', default: '0'},
      'hall-extra-ref-percent': {type: 'string', default: '0'},
    },
  });
  const [command, root, reportDir] = positionals;
  const baseProfile = values['base-profile'];
  const scale = values.scale;
  if (command === 'counts' && !root) {
    console.log(JSON.stringify(expectedWorkload(scale, {baseProfile}), null, 2));
  } else if (command === 'generate' && root && !reportDir) {
    const result = await writeMixedSyntheticPackage(root, {
      scale, baseProfile, hallExtraRefs: Number(values['hall-extra-refs']),
      hallExtraRefPercent: Number(values['hall-extra-ref-percent']),
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'preflight' && root && reportDir) {
    console.log(JSON.stringify(await preflightMixedSyntheticPackage(root, reportDir), null, 2));
  } else if (command === 'compile-base-smoke' && root && reportDir) {
    const fixture = JSON.parse(await readFile(join(root, 'fixture.json'), 'utf8'));
    if (!fixture.baseProfile || fixture.scale !== 'smoke') throw Error('BASE_PROFILE_SMOKE_REQUIRED');
    const program = await compileMixedSyntheticPackage(root, reportDir, {target: offlineTarget});
    try {console.log(JSON.stringify(await summarizeMixedProgram(program), null, 2));}
    finally {await program.dispose();}
  } else {
    throw Error('Usage: counts [--scale smoke|full] | generate NEW_DIR [--scale smoke|full] [--base-profile] [--hall-extra-refs N] [--hall-extra-ref-percent N] | preflight DIR NEW_REPORT | compile-base-smoke DIR NEW_REPORT');
  }
}
