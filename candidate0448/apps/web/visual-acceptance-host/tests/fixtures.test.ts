import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAcceptanceInventory, createAcceptanceProducts, createAcceptanceSales, createAcceptanceTransfers, acceptanceProducts, acceptanceCategories, acceptanceWarehouses } from '../fixtures.ts';
import { emptyInventoryFilter } from '../../src/inventory/contracts.ts';
import type { QueryRead } from '../../src/loading/latest-query.ts';
const report = () => {};
function read<const T>(parameters: T): QueryRead<T> { return { parameters, signal: new AbortController().signal, identity: { accountId: 'SYNTHETIC-ONLY', sessionRevision: 'NO-LOGIN', permissionRevision: 'NO-WRITES' }, routeInstanceId: 'fixture-test', entityId: null }; }
test('finite visual inventory candidates and target facts agree', async () => {
  const inventory = createAcceptanceInventory(report), products = createAcceptanceProducts(report);
  for (const [kind, total] of [['product',3], ['category',3], ['warehouse',6]] as const) {
    const result = await inventory.readCandidates(read({ kind, search: '', page: 1, pageSize: 20, selectedIds: [], categoryIds: [] }));
    assert.equal(result.exactTotal, total); assert.equal(result.items.length, total);
  }
  assert.equal(acceptanceCategories.filter(item => item.parentId === acceptanceCategories[0]!.id).length, 2);
  const page = await inventory.readInventory(read({ filter: emptyInventoryFilter(), page: 1, pageSize: 100 }));
  assert.equal(page.exactTotalProducts, 3); assert.equal(page.warehouseLabels.length, 6);
  assert.equal(BigInt(page.allMatchesTotal.knownQuantity), page.products.reduce((sum, product) => sum + BigInt(product.total.knownQuantity), 0n));
  const retail = [];
  for (const product of page.products) {
    const basics = await products.readProductBasics(read({ productId: product.id }));
    const specifications = await products.readProductSpecifications(read({ productId: product.id }));
    assert.equal(basics?.code, product.code); assert.equal(basics?.name, product.name); retail.push(basics?.retailPrice);
    const skus = new Set(specifications?.skus.map(sku => sku.id));
    for (const group of product.colorFits) for (const row of group.rows) {
      assert.equal(BigInt(row.total.knownQuantity), Object.values(row.cells).reduce((sum, cell) => sum + (cell.state === 'known' ? BigInt(cell.quantity) : 0n), 0n));
      for (const cell of Object.values(row.cells)) if (cell.state === 'known') assert.ok(skus.has(cell.skuId));
    }
  }
  assert.deepEqual(retail, [null, '0.00', '128.50']);
  const filtered = await inventory.readInventory(read({ filter: { ...emptyInventoryFilter(), warehouses: [acceptanceWarehouses[4]!] }, page: 1, pageSize: 100 }));
  for (let i = 0; i < page.products.length; i++) assert.deepEqual(filtered.products[i]!.colorFits[0]!.rows[0]!.cells, page.products[i]!.colorFits[0]!.rows[4]!.cells, 'warehouse filtering must not change stock facts');
  const category = await inventory.readInventory(read({ filter: { ...emptyInventoryFilter(), categories: [acceptanceCategories[2]!] }, page: 1, pageSize: 100 }));
  assert.deepEqual(category.products.map(item => item.id), [acceptanceProducts[2].id]);
});
test('sales and transfer use six matching finite warehouse candidates', async () => {
  const sales = await createAcceptanceSales(report).references.readReferences(read({ kind: 'warehouse', search: '', page: 1, pageSize: 20 }));
  const transfer = await createAcceptanceTransfers(report).references.readWarehouses(read({ search: '', selectedIds: [], page: 1, pageSize: 20 }));
  assert.equal(sales.exactTotal, '6'); assert.equal(transfer.exactTotal, '6');
  assert.deepEqual(sales.items.map(item => item.id), transfer.items.map(item => item.id));
});
