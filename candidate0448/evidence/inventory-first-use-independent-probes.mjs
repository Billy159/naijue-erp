/** Independent scripted-query and source-contract evidence only. No PostgreSQL parser, engine, real locks, concurrency or durability. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PostgresPostingBalances } from '../adapters/postgres/src/inventory-posting-balances.ts';
import { applyInventoryEntry, assertPostingCoverage } from '../packages/application/src/inventory-posting.ts';
import { entityId, quantity, version, businessDate } from '../packages/domain/src/values.ts';

const id = (kind, n) => entityId(kind, `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`);
const w = id('warehouse', 1), w2 = id('warehouse', 2), sku = id('sku', 11), sku2 = id('sku', 12), batch = id('operation', 90);
const time = '2026-10-20T12:00:00.000000Z';
const counts = { WAREHOUSE: 2, SKU: 2, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
const publication = () => ({ id: batch, checkpoint: { sequence: 2, cursor: 5, counts: { ...counts }, expected: { ...counts } }, completed: true, final_approval: true });
const zero = (warehouse = w, s = sku) => ({ warehouse_id: warehouse, sku_id: s, warehouse_published: true, sku_published: true, balance_absent: true, ledger_absent: true, valid_size: true });
const balance = (amount = '0', v = 1) => ({ warehouse_id: w, sku_id: sku, quantity: amount, version: v, last_operation_id: null, updated_at: time });
const entry = (n = 20, amount = '-2') => ({ id: id('ledger', n), operationId: id('operation', 80), eventKind: 'APPROVE', warehouseId: w, skuId: sku,
  quantityDelta: quantity(amount), source: { kind: 'SALES', salesId: id('sales', 70), salesLineId: id('salesLine', n + 100), endpoint: 'SALES_WAREHOUSE' },
  sourceDocumentVersion: version(2), reversesEntryId: null, businessDate: businessDate('2026-10-20'), postedAt: time });
function rig({ loaded = [], pub = [publication()], guards = true, keyRows = [zero()], insertCount = 1, updateCount = 1 } = {}) {
  const calls = [], effects = [];
  const balances = new PostgresPostingBalances(async (sql, values = []) => {
    calls.push({ sql, values: structuredClone(values) });
    if (/^SELECT naijue_erp.inventory_key_lock/.test(sql)) return { rows: [], rowCount: 1 };
    if (/FOR UPDATE OF b/.test(sql)) return { rows: structuredClone(loaded), rowCount: loaded.length };
    if (/posting:publication/.test(sql)) return { rows: structuredClone(pub), rowCount: pub.length };
    if (/posting:guards/.test(sql)) return { rows: [{ integrity_guards_present: guards }], rowCount: 1 };
    if (/posting:zero-key/.test(sql)) return { rows: structuredClone(keyRows), rowCount: keyRows.length };
    if (/^INSERT INTO naijue_erp.inventory_balance/.test(sql)) return { rows: [], rowCount: insertCount };
    if (/^UPDATE naijue_erp.inventory_balance/.test(sql)) return { rows: [], rowCount: updateCount };
    throw new Error(`Unexpected scripted query: ${sql}`);
  });
  const tx = { async getBalance(warehouse, s) { return balances.get(warehouse, s); }, async assertAbsentBalanceIsPublishedZero(warehouse, s) { await balances.assertZero(warehouse, s); },
    async appendLedger(row) { balances.assertCanAppend(row); effects.push(structuredClone(row)); balances.didAppend(row); }, async putBalance(row) { await balances.put(row); } };
  return { calls, effects, balances, tx };
}
const writes = r => r.calls.filter(c => /^(?:INSERT|UPDATE|DELETE)/.test(c.sql));
const callsOf = (r, tag) => r.calls.filter(c => c.sql.includes(tag));

test('independent: canonical advisory order deduplicates the exact importer binary JSON key tuples before any row lock', async () => {
  const r = rig(); const keys = [{ warehouseId: w2, skuId: sku2 }, { warehouseId: w, skuId: sku2 }, { warehouseId: w2, skuId: sku }, { warehouseId: w, skuId: sku2 }];
  await r.balances.lock(keys);
  const expected = [...new Set(keys.map(k => JSON.stringify([k.warehouseId, k.skuId])))].sort().map(k => JSON.parse(k));
  assert.deepEqual(r.calls.filter(c => c.sql.startsWith('SELECT naijue_erp.inventory_key_lock')).map(c => c.values), expected);
  assert.equal(r.calls.at(-1).sql.includes('FOR UPDATE OF b'), true);
  assert.equal(writes(r).length, 0);
  await assert.rejects(r.balances.lock(keys), { code: 'TRANSACTION_SCOPE' });
});

test('independent: synthetic adapter without explicit trusted proof fails closed before effects', async () => {
  const calls = [];
  const tx = { async getBalance() { return undefined; }, async appendLedger(row) { calls.push(row); }, async putBalance(row) { calls.push(row); } };
  await assert.rejects(assertPostingCoverage(tx, [entry()]), { code: 'INVENTORY_NOT_READY' });
  await assert.rejects(applyInventoryEntry(tx, entry()), { code: 'INVENTORY_NOT_READY' });
  assert.deepEqual(calls, []);
});

test('independent: missing UNAPPROVE never requests a zero proof or appends an inverse', async () => {
  let proofs = 0, writes = 0;
  const tx = { async getBalance() { return undefined; }, async assertAbsentBalanceIsPublishedZero() { proofs++; }, async appendLedger() { writes++; }, async putBalance() { writes++; } };
  const reverse = { ...entry(), eventKind: 'UNAPPROVE', reversesEntryId: id('ledger', 500) };
  await assert.rejects(assertPostingCoverage(tx, [reverse]), { code: 'INVENTORY_NOT_READY' });
  await assert.rejects(applyInventoryEntry(tx, reverse), { code: 'INVENTORY_NOT_READY' });
  assert.equal(proofs, 0); assert.equal(writes, 0);
});

for (const [name, tweak, code] of [
  ['missing publication', r => { r.pub = []; }, 'INVENTORY_NOT_READY'],
  ['duplicate publication', r => { r.pub = [publication(), publication()]; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['incomplete checkpoint', r => { r.pub[0].checkpoint.counts.SKU = 1; r.pub[0].checkpoint.cursor = 4; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['missing final approval', r => { r.pub[0].final_approval = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['missing completion', r => { r.pub[0].completed = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['missing native capability', r => { r.guards = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['unpublished exact warehouse', r => { r.keyRows[0].warehouse_published = false; }, 'INVENTORY_NOT_READY'],
  ['unpublished exact SKU', r => { r.keyRows[0].sku_published = false; }, 'INVENTORY_NOT_READY'],
  ['prior ledger with missing balance', r => { r.keyRows[0].ledger_absent = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['balance appeared after locked read', r => { r.keyRows[0].balance_absent = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['invalid native size membership', r => { r.keyRows[0].valid_size = false; }, 'INVENTORY_INTEGRITY_FAILED'],
  ['wrong exact key', r => { r.keyRows[0].sku_id = sku2; }, 'INVENTORY_NOT_READY'],
  ['duplicate exact key row', r => { r.keyRows.push(zero()); }, 'INVENTORY_NOT_READY']
]) test(`independent: ${name} fails before ledger or balance effects`, async () => {
  const config = { pub: [publication()], guards: true, keyRows: [zero()] }; tweak(config); const r = rig(config);
  await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  await assert.rejects(assertPostingCoverage(r.tx, [entry()]), { code });
  assert.deepEqual(r.effects, []); assert.equal(writes(r).length, 0);
});

test('independent: repeated same-key real lines yield first exact nonzero delta then cumulative quantity/version per line', async () => {
  const r = rig(); await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  const effects = [entry(20, '-2'), entry(21, '5'), entry(22, '-3')];
  await assertPostingCoverage(r.tx, effects); assert.equal(writes(r).length, 0);
  for (const row of effects) await applyInventoryEntry(r.tx, row);
  const posted = writes(r);
  assert.equal(posted.length, 3); assert.match(posted[0].sql, /^INSERT/);
  assert.deepEqual(posted.map(c => [c.values[2], c.values[3], c.values[6]]), [['-2', 1, undefined], ['3', 2, 1], ['0', 3, 2]]);
  assert.equal(callsOf(r, 'posting:publication').length, 1); assert.equal(callsOf(r, 'posting:guards').length, 1); assert.equal(callsOf(r, 'posting:zero-key').length, 1);
  assert.equal(r.effects.length, 3); assert.equal(r.balances.get(w, sku).quantity, 0n); assert.equal(r.balances.get(w, sku).version, 3);
  assert.ok(r.calls.every(c => !/CROSS JOIN|jsonb_agg|SUM\(/i.test(c.sql)));
});

test('independent: first append must be followed by its exact balance, never a zero placeholder or repeated pending effect', async () => {
  const r = rig(); await r.balances.lock([{ warehouseId: w, skuId: sku }]); await r.balances.assertZero(w, sku);
  const first = entry(); r.balances.assertCanAppend(first); r.balances.didAppend(first);
  assert.throws(() => r.balances.assertCanAppend(entry(21)), { code: 'TRANSACTION_SCOPE' });
  await assert.rejects(r.balances.put({ warehouseId: w, skuId: sku, quantity: quantity('0'), version: version(1), lastOperationId: first.operationId, updatedAt: time }), { code: 'INVENTORY_NOT_READY' });
  assert.equal(writes(r).length, 0);
});

test('independent: first-insert conflict fails CAS without manufacturing cached balance', async () => {
  const r = rig({ insertCount: 0 }); await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  await assert.rejects(applyInventoryEntry(r.tx, entry()), { code: 'VERSION_CONFLICT' });
  assert.equal(r.balances.get(w, sku), undefined); assert.equal(r.effects.length, 1); assert.match(writes(r)[0].sql, /ON CONFLICT \(warehouse_id, sku_id\) DO NOTHING/);
});

test('independent: existing negative retained balance uses CAS without zero proof; conflicting update leaves cache unchanged', async () => {
  const r = rig({ loaded: [balance('-5', 7)], updateCount: 0 }); await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  await assert.rejects(applyInventoryEntry(r.tx, entry(20, '2')), { code: 'VERSION_CONFLICT' });
  assert.equal(r.balances.get(w, sku).quantity, -5n); assert.equal(r.balances.get(w, sku).version, 7);
  assert.equal(callsOf(r, 'posting:').length, 0); assert.deepEqual(writes(r)[0].values.slice(2), ['-3', 8, id('operation', 80), time, 7]);
});

test('independent: cloned returned balances cannot alter locked CAS cache', async () => {
  const r = rig({ loaded: [balance('-5', 7)] }); await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  const read = r.balances.get(w, sku); read.quantity = quantity('100'); read.version = version(42);
  await applyInventoryEntry(r.tx, entry(20, '2'));
  assert.equal(r.balances.get(w, sku).quantity, -3n); assert.equal(r.balances.get(w, sku).version, 8); assert.equal(writes(r)[0].values[6], 7);
});

test('independent: proof is limited to locked exact keys and new helper instances start unproven', async () => {
  const r = rig(); await r.balances.lock([{ warehouseId: w, skuId: sku }]); await r.balances.assertZero(w, sku);
  await assert.rejects(r.balances.assertZero(w, sku2), { code: 'TRANSACTION_SCOPE' }); assert.throws(() => r.balances.get(w2, sku), { code: 'TRANSACTION_SCOPE' });
  const r2 = rig({ pub: [] }); await r2.balances.lock([{ warehouseId: w, skuId: sku }]);
  await assert.rejects(r2.balances.assertZero(w, sku), { code: 'INVENTORY_NOT_READY' });
  assert.equal(writes(r2).length, 0);
});

const sql7 = readFileSync(new URL('../adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql', import.meta.url), 'utf8');
const sql8 = readFileSync(new URL('../adapters/postgres/migrations/0008_runtime_sparse_first_use.sql', import.meta.url), 'utf8');
const sql4 = readFileSync(new URL('../adapters/postgres/migrations/0004_transfer_runtime.sql', import.meta.url), 'utf8');
function functionBody(sql, name) {
  const marker = `FUNCTION naijue_erp.${name}()`; const start = sql.indexOf(marker); assert.ok(start >= 0);
  const bodyStart = sql.indexOf('AS $$', start); const end = sql.indexOf('\n$$;', bodyStart); assert.ok(end > bodyStart);
  return sql.slice(bodyStart + 5, end);
}
const sparse7 = functionBody(sql7, 'validate_sparse_balance_commit'); const sparse8 = functionBody(sql8, 'validate_sparse_balance_commit');
const transfer4 = functionBody(sql4, 'validate_transfer_effect'); const transfer8 = functionBody(sql8, 'validate_transfer_effect');
test('independent SQL source: 0008 changes exactly two function definitions and schema version, no relation/column/trigger/index mutation', () => {
  assert.deepEqual([...sql8.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.(\w+)/g)].map(m => m[1]), ['validate_sparse_balance_commit', 'validate_transfer_effect']);
  assert.doesNotMatch(sql8, /CREATE (?:TABLE|INDEX|TRIGGER|CONSTRAINT)|ALTER TABLE|DROP (?:TABLE|INDEX|TRIGGER|CONSTRAINT)|ADD COLUMN/i);
  assert.deepEqual([...sql8.matchAll(/INSERT INTO ([\w.]+)/g)].map(m => m[1]), ['naijue_erp.schema_migration']);
});
test('independent SQL source: exact IMPORT tail and UPDATE behavior are preserved from 0007', () => {
  const importStart = "  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger WHERE operation_id = r.id";
  assert.equal(sparse8.slice(sparse8.indexOf(importStart)), sparse7.slice(sparse7.indexOf(importStart)));
  const update = body => body.slice(body.indexOf("  IF TG_OP = 'UPDATE' THEN"), body.indexOf("  IF r.target_type", body.indexOf('    RETURN NULL;')));
  assert.equal(update(sparse8).replace(/    --.*\n/g, ''), update(sparse7).replace(/    --.*\n/g, ''));
});
test('independent SQL source: full existing transfer source/reversal guard remains, only coverage gap is bounded', () => {
  const gap = body => body.indexOf('  IF NOT FOUND THEN'); const reversal = body => body.indexOf("  IF NEW.event_kind = 'UNAPPROVE' THEN\n    SELECT * INTO STRICT original");
  assert.equal(transfer8.slice(0, gap(transfer8)), transfer4.slice(0, gap(transfer4)));
  assert.equal(transfer8.slice(reversal(transfer8)), transfer4.slice(reversal(transfer4)));
  const relaxed = transfer8.slice(gap(transfer8), reversal(transfer8));
  assert.match(relaxed, /NEW.event_kind <> 'APPROVE' OR NEW.reverses_entry_id IS NOT NULL/);
  assert.match(relaxed, /published_inventory_key\(NEW.warehouse_id, NEW.sku_id\)/);
  assert.match(relaxed, /EXISTS \(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id\)/);
});
test('independent SQL source: first insert exact final quantity/version reconciles only this operation/key, with retained prior use blocked', () => {
  assert.match(sparse8, /r.action <> 'APPROVE' OR r.status <> 'COMMITTED'/);
  assert.match(sparse8, /h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED'/);
  assert.match(sparse8, /warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id/);
  assert.match(sparse8, /SELECT COALESCE\(SUM\(quantity_delta::numeric\), 0\), COUNT\(\*\) INTO total, effects FROM naijue_erp.inventory_ledger\s+WHERE operation_id = r.id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;/);
  assert.match(sparse8, /final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects/);
  assert.match(sparse8, /final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at/);
  assert.doesNotMatch(sparse8, /\bxmin\b|txid_current|pg_current_xact_id|INSERT INTO naijue_erp.inventory_(?:balance|ledger)/);
});

test('independent SQL source: every required native trigger/table capability exists in final 0001–0008 composition', () => {
  // Enumerate the actual ordered migration sources rather than guessing historical filenames.
  const dir = new URL('../adapters/postgres/migrations/', import.meta.url);
  const migrations = readdirSync(dir).filter(p => /^000[1-8].*\.sql$/.test(p)).sort();
  assert.equal(migrations.length, 8);
  const triggers = new Map();
  for (const path of migrations) {
    const sql = readFileSync(new URL(path, dir), 'utf8');
    const events = [...sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER (\w+)\s+(?:BEFORE|AFTER)[\s\S]*?\bON naijue_erp\.(\w+)|DROP TRIGGER (\w+) ON naijue_erp\.(\w+)/g)];
    for (const match of events) {
      if (match[1]) triggers.set(JSON.stringify([match[2], match[1]]), true);
      else triggers.delete(JSON.stringify([match[4], match[3]]));
    }
  }
  const helper = readFileSync(new URL('../adapters/postgres/src/inventory-posting-balances.ts', import.meta.url), 'utf8');
  const required = helper.slice(helper.indexOf('AND NOT EXISTS (SELECT 1 FROM (VALUES'), helper.indexOf('AS required(table_name, trigger_name)'));
  const pairs = [...required.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(m => [m[1], m[2]]);
  assert.equal(pairs.length, 28);
  for (const pair of pairs) assert.ok(triggers.has(JSON.stringify(pair)), `Missing final composed trigger ${pair.join('.')}`);
});

test('independent final source: exact size-group membership is joined and SHARE-locked with its SKU/product', async () => {
  const helper = readFileSync(new URL('../adapters/postgres/src/inventory-posting-balances.ts', import.meta.url), 'utf8');
  const proof = helper.slice(helper.indexOf('  async assertZero('), helper.indexOf('  assertCanAppend('));
  assert.match(proof, /JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id/);
  assert.match(proof, /WHERE w.id = \$1::uuid FOR SHARE OF w, h, s, p, c, f, m/);
  assert.doesNotMatch(proof, /LEFT JOIN naijue_erp.size_group_member/);
});
test('independent final protocol: absent exact native join, including missing size membership, fails closed as NOT_READY', async () => {
  const r = rig({ keyRows: [] }); await r.balances.lock([{ warehouseId: w, skuId: sku }]);
  await assert.rejects(assertPostingCoverage(r.tx, [entry()]), { code: 'INVENTORY_NOT_READY' });
  assert.deepEqual(r.effects, []); assert.equal(writes(r).length, 0);
});
