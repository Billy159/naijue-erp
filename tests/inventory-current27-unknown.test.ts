import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedInventorySnapshot } from '../packages/application/src/inventory-query-response.ts';
import { parseInventoryQuery } from '../packages/application/src/inventory-query-validation.ts';
import { inventoryActor, inventoryId, inventoryParameters, inventoryScope, syntheticInventorySnapshot } from './support/synthetic-inventory-query.ts';

test('inventory contract retains absent stock as unknown and aggregates it separately from exact known quantities', () => {
 const parameters = parseInventoryQuery(inventoryParameters());
 const read = { actor: inventoryActor, scope: inventoryScope, parameters, signal: new AbortController().signal };
 const snapshot = structuredClone(syntheticInventorySnapshot(read)) as any;
 const p = snapshot.data.products[0], f = p.colorFits[0], size = inventoryId('size',12), sku = inventoryId('sku',10002);
 f.rows[0].cells[size] = {state:'unknown',skuId:sku};
 const mixed = {knownQuantity:'-2',unknownCells:1,completeness:'incomplete'};
 const unknown = {knownQuantity:'0',unknownCells:1,completeness:'incomplete'};
 f.rows[0].total = mixed; f.total = mixed; p.total = mixed; snapshot.data.allMatchesTotal = mixed;
 f.sizeTotals[size] = unknown; p.sizeTotals[size] = unknown;
 const result = checkedInventorySnapshot(snapshot, parameters, inventoryScope);
 assert.deepEqual(result.data.products[0]!.colorFits[0]!.rows[0]!.cells[size], {state:'unknown',skuId:sku});
 assert.deepEqual(result.data.allMatchesTotal,mixed);
 for (const invalid of [{...mixed,completeness:'complete'}, {...mixed,unknownCells:0}, {...mixed,unknownCells:-1}]) {
   snapshot.data.allMatchesTotal = invalid; assert.throws(() => checkedInventorySnapshot(snapshot, parameters, inventoryScope));
 }
});
