/** Actual finite-source comparison, never a publication receipt or runtime capability. */
import { seedCommands } from '../../../opt00/pg-component/seed.mjs';
import { SETUP_COLUMNS } from '../../../opt00/pg-component/contract.mjs';
import { identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { assertFixture, additionalReferenceCommands, need, freeze } from './fixture.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
const columns = Object.freeze({ ...SETUP_COLUMNS,
  warehouse: ['id','hall_id','name','enabled','version','created_operation_id'],
  season: ['id','code','name','display_order'],
  barcode_scheme: ['id','name','barcode_type','rule_description','code_length','rule_version','status'] });
export function referenceComparisonPlan(input, passwordHash) {
  const f = assertFixture(input), rows = [...seedCommands(f.reference,passwordHash),...additionalReferenceCommands(f,passwordHash)];
  need(rows.length === 105, 'EXACT_NEW_105_COMPARISONS_REQUIRED');
  return freeze(rows.map(row => {
    const cols = columns[row.table]; need(cols && cols.length === row.values.length, 'SOURCE_BOUND_REFERENCE_COLUMN_VALUES_REQUIRED');
    return { table: row.table, text: `SELECT count(*)::int n FROM naijue_erp.${identifier(row.table)} WHERE `
      + cols.map((col,index) => `${identifier(col)} IS NOT DISTINCT FROM $${index+1}`).join(' AND '), values: row.values };
  }));
}
export async function verifyReferenceSource(query, input, passwordHash, commandIndex) {
  const f = assertFixture(input);
  need(typeof query === 'function' && Number.isInteger(commandIndex) && commandIndex >= 0 && commandIndex < 4,
    'EXACT_REFERENCE_SOURCE_COMMAND_INDEX_REQUIRED');
  for (const expected of referenceComparisonPlan(f,passwordHash)) {
    const actual = (await query(expected.text,expected.values)).rows;
    need(actual.length === 1 && actual[0].n === 1, 'ACTUAL_REFERENCE_LITERAL_ROW_DIFFERS:' + expected.table);
  }
  for (const [table,count] of Object.entries(f.referenceCounts)) {
    const rows = (await query(`SELECT count(*)::int n FROM naijue_erp.${identifier(table)}`)).rows;
    need(rows.length === 1 && rows[0].n === count, 'ACTUAL_REFERENCE_TABLE_CLOSURE_DIFFERS:' + table);
  }
  const importCounts = (await query('SELECT (SELECT count(*)::int FROM naijue_erp.import_batch) batches,(SELECT count(*)::int FROM naijue_erp.import_source_row) typed_sources')).rows;
  need(importCounts.length === 1 && importCounts[0].batches === (commandIndex === 0 ? 0 : 1)
    && importCounts[0].typed_sources === 0, 'NEW_REFERENCE_LEGACY_BATCH_NOT_TYPED_PRODUCT_SOURCE');
  return freeze({ matchedSourceRows:105, tableClosure:true, commandIndex, typedProductOrHistorySourceRows:0,
    passwordAndHashNotReturned:true, scope:'SOURCE_LITERAL_COMPARISON_NOT_RECEIPT_OR_RUNTIME_APPROVAL' });
}
export const REFERENCE_BALANCES_SQL = 'SELECT warehouse_id,sku_id,quantity::text,version,last_operation_id FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id';
export async function verifyReferenceBalances(query,input) {
  const f=assertFixture(input), expected=f.baselines.map(b=>({warehouse_id:b.warehouseId,sku_id:b.skuId,quantity:b.quantity,
    version:1,last_operation_id:f.expectedResults[2].operationId})).sort((a,b)=>a.warehouse_id.localeCompare(b.warehouse_id,'en')||a.sku_id.localeCompare(b.sku_id,'en'));
  const actual=(await query(REFERENCE_BALANCES_SQL)).rows;
  need(requestHash(actual)===requestHash(expected),'REFERENCE_COMPLETE_FOUR_NONZERO_TWO_ABSENT_BALANCES_DIFFER');
  return freeze({ nonzeroRows:4, absentSourcePairs:2, completeWarehouseSkuPairs:6, matchedSource:true,
    phase:'MUST_BE_CHECKED_BEFORE_ORIGINAL_PUBLISH_NOT_AFTER_ONLY',publicationOrRuntimeApproval:false });
}
