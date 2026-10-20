// Independent bounded protocol/source probes. No PostgreSQL, listener, network or installation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PostgresInventoryQueryReader } from '../adapters/postgres/src/inventory-query-reader.ts';

const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ids = { account: uuid(1), hall: uuid(2), product: uuid(3), group: uuid(4), color: uuid(5), fit: uuid(6), batch: uuid(7), operation: uuid(8) };
const actor = { accountId: ids.account, hallId: ids.hall };
const baseScope = { hallIds: [ids.hall], warehouses: [
  { id: uuid(12), hallId: ids.hall, label: 'Second identifier first in authorized order' },
  { id: uuid(11), hallId: ids.hall, label: 'First identifier second in authorized order' }
] };
const input = () => ({ page: 1, pageSize: 100, filter: { productIds: [], categoryId: null, warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } });
const code = expected => error => error?.code === expected;
const blankFlags = { invalid_category_tree: false, missing_sizes: false, uncovered_sku: false, invalid_sku_size: false, invalid_balance: false };
class ProbePool {
  calls = []; releases = []; connects = 0; flags = { ...blankFlags }; scope = structuredClone(baseScope);
  sizes = [{ id: uuid(21), name: '170/M source order first' }, { id: uuid(20), name: '165/S source order second' }, { id: uuid(22), name: '175/L source absent coordinate' }];
  skuCount = 2; amount = '-9223372036854775808'; empty = false; hook; failed; candidateKind = 'category';
  async connect() { this.connects++; return this; }
  release(error) { this.releases.push(error); }
  async query(sql, values = []) {
    const stage = /\/\* inventory:([a-z-]+) \*\//.exec(sql)?.[1] ?? sql;
    this.calls.push({ stage, sql, values: structuredClone(values) });
    if (this.failed === stage) throw new Error(`Independent simulated ${stage} failure`);
    let rows;
    switch (stage) {
      case 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY': case 'COMMIT': case 'ROLLBACK': rows = []; break;
      case 'publication': {
        const counts = { WAREHOUSE: this.scope.warehouses.length, SKU: this.empty ? 0 : this.skuCount, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
        rows = [{ id: ids.batch, completed: true, final_approval: true, checkpoint: { sequence: 2, cursor: Object.values(counts).reduce((a, b) => a + b, 0), counts, expected: counts } }]; break;
      }
      case 'guards': rows = [{ integrity_guards_present: true }]; break;
      case 'warehouses': rows = this.scope.warehouses.filter(w => values[0].includes(w.id)).map(w => ({ id: w.id, hall_id: w.hallId, name: w.label, published: true })); break;
      case 'catalog-status': rows = [{ ...this.flags, exact_total: this.empty ? '0' : '1', quantity: sql.includes("'0'::text AS quantity") || this.empty ? '0' : (BigInt(this.amount) * BigInt(this.scope.warehouses.length)).toString() }]; break;
      case 'products': rows = this.empty || Number(values[9]) > 0 ? [] : [{ id: ids.product, product_code: '00001', name: 'Independent native product', size_group_id: ids.group, size_group_name: 'Native exact size group', category_name: 'Native child', supplier_name: null, season_name: null }]; break;
      case 'sizes': rows = this.sizes.map((size, display_order) => ({ product_id: ids.product, size_group_id: ids.group, size_id: size.id, size_name: size.name, display_order })); break;
      case 'skus': rows = this.sizes.slice(0, this.skuCount).map((size, index) => ({ id: uuid(31 + index), product_id: ids.product, size_id: size.id, color_id: ids.color, fit_id: ids.fit, color_name: 'Native color', fit_name: 'Native retained fit' })); break;
      case 'balances': rows = this.scope.warehouses.flatMap(w => [{ warehouse_id: w.id, sku_id: uuid(31), quantity: this.amount, version: 1, last_operation_id: ids.operation }]); break;
      case 'candidate-count': rows = [{ exact_total: '1' }]; break;
      case 'candidates': rows = Number(values[10]) > 0 ? [] : this.candidateKind === 'category'
        ? [{ id: uuid(50), label: 'Native child', parent_label: 'Native parent', disabled: null, depth: 1, category_valid: true }]
        : [{ id: this.candidateKind === 'warehouse' ? this.scope.warehouses[0].id : this.candidateKind === 'product' ? ids.product : this.candidateKind === 'fit' ? ids.fit : uuid(50),
          label: this.candidateKind === 'warehouse' ? this.scope.warehouses[0].label : 'Native reference', parent_label: null, disabled: this.candidateKind === 'season' ? null : false }]; break;
      case 'candidate-integrity': rows = [{ ...this.flags }]; break;
      default: assert.fail(`Unexpected independent protocol stage: ${stage}`);
    }
    this.hook?.(stage, rows);
    return { rows, rowCount: rows.length };
  }
}
const request = (pool, parameters = input(), signal = new AbortController().signal) => ({ actor: { ...actor }, scope: structuredClone(pool.scope), parameters, signal });
const stages = pool => pool.calls.map(call => call.stage);

test('independent: exact negative below signed-bigint aggregate, proven absent balance, missing SKU and source size/warehouse order', async () => {
  const pool = new ProbePool(); const result = await new PostgresInventoryQueryReader(pool).readInventory(request(pool));
  const product = result.data.products[0]; const group = product.colorFits[0];
  assert.deepEqual(product.sizes.map(s => s.label), pool.sizes.map(s => s.name));
  assert.deepEqual(group.rows.map(row => row.warehouse.id), baseScope.warehouses.map(w => w.id));
  for (const row of group.rows) {
    assert.deepEqual(Object.values(row.cells).map(cell => cell.state), ['known', 'known', 'not-applicable']);
    assert.equal(row.cells[uuid(21)].quantity, '-9223372036854775808'); assert.equal(row.cells[uuid(20)].quantity, '0');
  }
  assert.equal(result.data.allMatchesTotal.knownQuantity, '-18446744073709551616');
  assert.equal(product.total.knownQuantity, result.data.allMatchesTotal.knownQuantity);
  assert.equal(pool.connects, 1); assert.deepEqual(pool.releases, [undefined]); assert.equal(pool.calls.length, 10);
  for (const call of pool.calls.filter(c => ['catalog-status', 'products', 'balances'].includes(c.stage))) {
    assert.deepEqual(call.values[0], baseScope.warehouses.map(w => w.id)); assert.deepEqual(call.values[1], [ids.hall]);
  }
});

test('independent: mutable direct-reader parameters and scope cannot change while pool acquisition is pending', async () => {
  const pool = new ProbePool(); let resume; let entered; const arrived = new Promise(resolve => { entered = resolve; });
  pool.connect = async () => { pool.connects++; entered(); return new Promise(resolve => { resume = () => resolve(pool); }); };
  const raw = request(pool); const pending = new PostgresInventoryQueryReader(pool).readInventory(raw); await arrived;
  raw.parameters.page = 2; raw.parameters.filter.productIds.push(uuid(999)); raw.scope.warehouses[0].label = 'Changed outside read'; raw.scope.warehouses.reverse(); resume();
  const result = await pending; assert.equal(result.data.page, 1); assert.deepEqual(result.data.warehouseLabels, baseScope.warehouses.map(w => w.label));
  assert.deepEqual(pool.calls.find(c => c.stage === 'catalog-status').values[2], []);
});

test('independent: abort after delayed acquisition releases exactly once without BEGIN or data queries', async () => {
  const pool = new ProbePool(); let resume; let entered; const arrived = new Promise(resolve => { entered = resolve; });
  pool.connect = async () => { pool.connects++; entered(); return new Promise(resolve => { resume = () => resolve(pool); }); };
  const controller = new AbortController(); const pending = new PostgresInventoryQueryReader(pool).readInventory(request(pool, input(), controller.signal)); await arrived; controller.abort(); resume();
  await assert.rejects(pending, code('INVENTORY_READ_ABORTED')); assert.deepEqual(pool.calls, []); assert.equal(pool.releases.length, 1); assert.ok(pool.releases[0] instanceof Error);
});

test('independent: abort during acknowledged COMMIT still rejects stale result and discards acquired client', async () => {
  const pool = new ProbePool(); const controller = new AbortController(); pool.hook = stage => { if (stage === 'COMMIT') controller.abort(); };
  await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(request(pool, input(), controller.signal)), code('INVENTORY_READ_ABORTED'));
  assert.deepEqual(stages(pool).slice(-2), ['COMMIT', 'ROLLBACK']); assert.equal(pool.releases.length, 1); assert.ok(pool.releases[0] instanceof Error);
});

test('independent: whole-filter uncovered SKU or deeper hierarchy rejects even zero-count empty page before paging', async () => {
  for (const [flag, expected] of [['uncovered_sku', 'INVENTORY_NOT_READY'], ['invalid_category_tree', 'INVENTORY_INTEGRITY_FAILED']]) {
    const pool = new ProbePool(); pool.empty = true; pool.flags[flag] = true;
    await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(request(pool, { ...input(), page: 2 })), code(expected));
    assert.ok(!stages(pool).includes('products')); assert.equal(stages(pool).at(-1), 'ROLLBACK');
  }
  const pool = new ProbePool(); pool.empty = true; const result = await new PostgresInventoryQueryReader(pool).readInventory(request(pool));
  assert.equal(result.data.exactTotalProducts, 0); assert.equal(result.data.allMatchesTotal.knownQuantity, '0'); assert.ok(!stages(pool).includes('skus'));
});

test('independent: matrix work budget fails before warehouse-size Cartesian matrix allocation', async () => {
  const pool = new ProbePool(); pool.scope.warehouses = Array.from({ length: 1000 }, (_, i) => ({ id: uuid(10000 + i), hallId: ids.hall, label: `Warehouse ${i}` }));
  pool.sizes = Array.from({ length: 1000 }, (_, i) => ({ id: uuid(20000 + i), name: `Exact native size ${i}` })); pool.skuCount = 1; pool.amount = '0';
  await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(request(pool)), code('INVENTORY_READ_TOO_LARGE'));
  assert.equal(stages(pool).at(-1), 'ROLLBACK'); assert.ok(!stages(pool).includes('COMMIT')); assert.deepEqual(pool.releases, [undefined]);
});

test('independent: selected IDs do not become candidate grants; category emits bounded native parent metadata', async () => {
  const pool = new ProbePool(); const parameters = { kind: 'category', search: "%' OR TRUE --", page: 1, pageSize: 20, selectedIds: [uuid(999)], categoryId: uuid(999) };
  const result = await new PostgresInventoryQueryReader(pool).readCandidates(request(pool, parameters));
  assert.deepEqual(result.data.items, [{ id: uuid(50), label: 'Native child', parentLabel: 'Native parent', depth: 1 }]);
  const query = pool.calls.find(c => c.stage === 'candidates'); assert.equal(query.values[3], null); assert.equal(query.values[8], parameters.search); assert.ok(!query.sql.includes(parameters.search));
  assert.ok(!JSON.stringify(pool.calls).includes(uuid(999))); assert.equal(pool.calls.length, 7);
});

test('independent: candidate proof stays returned-ID-bound and never reads stock or broad inventory status', async () => {
  for (const kind of ['product', 'category', 'warehouse', 'supplier', 'fit', 'season']) {
    const pool = new ProbePool(); pool.candidateKind = kind; pool.flags.invalid_balance = true;
    const parameters = { kind, search: '', page: 1, pageSize: 20, selectedIds: [], categoryId: null };
    const result = await new PostgresInventoryQueryReader(pool).readCandidates(request(pool, parameters)); assert.equal(result.data.items.length, 1);
    assert.ok(!stages(pool).includes('catalog-status')); assert.ok(pool.calls.every(call => !/FROM naijue_erp\.inventory_balance|JOIN naijue_erp\.inventory_balance/.test(call.sql)));
    const integrity = pool.calls.find(c => c.stage === 'candidate-integrity');
    if (kind === 'warehouse' || kind === 'category') { assert.equal(integrity, undefined); assert.equal(pool.calls.length, 7); }
    else { assert.ok(integrity); assert.deepEqual(integrity.values[8], result.data.items.map(item => item.id)); assert.equal(pool.calls.length, 8); }
  }
  const pool = new ProbePool(); pool.candidateKind = 'product'; pool.flags.uncovered_sku = true;
  await assert.rejects(new PostgresInventoryQueryReader(pool).readCandidates(request(pool, { kind: 'product', search: '', page: 1, pageSize: 20, selectedIds: [], categoryId: null })), code('INVENTORY_NOT_READY'));
  assert.equal(stages(pool).at(-1), 'ROLLBACK'); assert.ok(stages(pool).includes('candidates')); assert.ok(!stages(pool).includes('COMMIT'));
});

test('independent: invalid returned category fails instead of silently pruning; empty candidate page skips member work', async () => {
  const parameters = { kind: 'category', search: '', page: 1, pageSize: 20, selectedIds: [], categoryId: null };
  const invalid = new ProbePool(); invalid.hook = (stage, rows) => { if (stage === 'candidates') rows[0].category_valid = false; };
  await assert.rejects(new PostgresInventoryQueryReader(invalid).readCandidates(request(invalid, parameters)), code('INVENTORY_INTEGRITY_FAILED')); assert.equal(stages(invalid).at(-1), 'ROLLBACK');
  const empty = new ProbePool(); empty.candidateKind = 'product';
  const result = await new PostgresInventoryQueryReader(empty).readCandidates(request(empty, { ...parameters, kind: 'product', page: 2 }));
  assert.equal(result.data.exactTotal, 1); assert.deepEqual(result.data.items, []); assert.ok(!stages(empty).includes('candidate-integrity'));
});

test('independent source: category parent inference shared, full-filter checks unpaged, key predicates native-typed, no writes or whole member hydration', () => {
  const source = readFileSync(new URL('../adapters/postgres/src/inventory-query-reader.ts', import.meta.url), 'utf8');
  assert.match(source, /p\.category_id = \$4::uuid OR EXISTS/); assert.match(source, /category\.parent_id = \$4::uuid/);
  assert.match(source, /WHERE parent\.parent_id IS NOT NULL\) AS invalid_category_tree/);
  assert.match(source, /r\.target_id = s\.id/); assert.doesNotMatch(source, /r\.target_id::text|p\.id::text\s*=/);
  assert.doesNotMatch(source, /readPublishedCutoffScope\(|CROSS JOIN|INSERT INTO|UPDATE naijue_erp|DELETE FROM/i);
});
