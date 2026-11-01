/** Complete fixed303 source closure by typed per-table sets, not per-row IO.
 * Owner/setup only; never runtime capability or publication approval. */
import { SETUP_COLUMNS } from '../../../opt00/pg-component/contract.mjs';
import { identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { need, freeze } from './fixture.mjs';
import { assertScaledFixture, scaledReferenceCommands } from './scaled-fixture.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
const columns=freeze({...SETUP_COLUMNS,warehouse:['id','hall_id','name','enabled','version','created_operation_id'],
  season:['id','code','name','display_order'],barcode_scheme:['id','name','barcode_type','rule_description','code_length','rule_version','status']});
const keyColumns=table=>table==='size_group_member'?['size_group_id','size_id']:['id'];
export function scaledReferenceComparisonPlan(input,passwordHash) {
  const f=assertScaledFixture(input), all=scaledReferenceCommands(f,passwordHash);
  return freeze(Object.entries(f.referenceCounts).map(([table,count])=>{
    need(Object.hasOwn(columns,table),'CLOSED_SCALED_SOURCE_TABLE_REQUIRED');
    const cols=columns[table], keys=keyColumns(table), expected=all.filter(row=>row.table===table).map(row=>{
      need(row.values.length===cols.length,'EXACT_SCALED_COLUMN_ARITY_REQUIRED');
      const item=Object.fromEntries(cols.map((col,i)=>[col,row.values[i]]));
      need(Object.values(item).every(value=>value===null||['string','boolean','number'].includes(typeof value)),'SCALED_REFERENCE_LITERAL_SCALARS_ONLY');return item;
    });
    need(expected.length===count&&new Set(expected.map(row=>JSON.stringify(keys.map(key=>row[key])))).size===count,'DISTINCT_COMPLETE_SCALED_EXPECTED_KEYS_REQUIRED');
    // jsonb_populate_recordset uses the ACTUAL installed row type for UUID,
    // numeric and timestamptz casts. Only the original explicit setup columns
    // participate in equality; omitted schema defaults are not guessed.
    const text=`/* scaled-reference:complete-table */ WITH expected AS MATERIALIZED (
      SELECT * FROM jsonb_populate_recordset(NULL::naijue_erp.${identifier(table)},$1::jsonb)
    ), matches AS (
      SELECT (SELECT count(*)::int FROM naijue_erp.${identifier(table)} a WHERE ${cols.map(col=>`a.${identifier(col)} IS NOT DISTINCT FROM e.${identifier(col)}`).join(' AND ')}) AS n FROM expected e
    ) SELECT (SELECT count(*)::int FROM expected) expected_rows,
      (SELECT count(*)::int FROM (SELECT DISTINCT ${keys.map(identifier).join(',')} FROM expected) keys) expected_distinct_keys,
      (SELECT count(*)::int FROM naijue_erp.${identifier(table)}) actual_rows,
      coalesce(bool_and(n=1),false) AS every_expected_exactly_one FROM matches`;
    return {table,expectedCount:count,text,values:[JSON.stringify(expected)],columns:cols,keyColumns:keys};
  }));
}
export async function verifyScaledReferenceSource(query,input,passwordHash,commandIndex) {
  const f=assertScaledFixture(input);need(typeof query==='function'&&Number.isInteger(commandIndex)&&commandIndex>=0&&commandIndex<4,'EXACT_SCALED_REFERENCE_COMMAND_INDEX_REQUIRED');
  const plan=scaledReferenceComparisonPlan(f,passwordHash);
  for(const expected of plan){const rows=(await query(expected.text,expected.values)).rows;
    need(rows.length===1&&rows[0].expected_rows===expected.expectedCount&&rows[0].expected_distinct_keys===expected.expectedCount
      &&rows[0].actual_rows===expected.expectedCount&&rows[0].every_expected_exactly_one===true,'ACTUAL_SCALED_SOURCE_TABLE_NOT_EXACT:'+expected.table);}
  const rows=(await query('SELECT (SELECT count(*)::int FROM naijue_erp.import_batch) batches,(SELECT count(*)::int FROM naijue_erp.import_source_row) typed_sources')).rows;
  need(rows.length===1&&rows[0].batches===(commandIndex===0?0:1)&&rows[0].typed_sources===0,'SCALED_REFERENCE_LEGACY_BATCH_NOT_TYPED_SOURCE');
  return freeze({matchedSourceRows:303,tableClosure:true,expectedDistinctKeys:true,completeColumnEquality:true,commandIndex,
    typedProductOrHistorySourceRows:0,sourceTableQueries:plan.length,passwordAndHashNotReturned:true,
    scope:'COMPLETE_SCALED_SOURCE_COMPARISON_NOT_RECEIPT_OR_RUNTIME_APPROVAL'});
}
export const SCALED_REFERENCE_BALANCES_SQL='SELECT warehouse_id,sku_id,quantity::text,version,last_operation_id FROM naijue_erp.inventory_balance ORDER BY warehouse_id,sku_id';
export async function verifyScaledReferenceBalances(query,input) {
  const f=assertScaledFixture(input);need(typeof query==='function','FENCED_SCALED_BALANCE_QUERY_REQUIRED');
  const expected=f.baselines.map(b=>({warehouse_id:b.warehouseId,sku_id:b.skuId,quantity:b.quantity,version:1,last_operation_id:f.expectedResults[2].operationId}))
    .sort((a,b)=>a.warehouse_id<b.warehouse_id?-1:a.warehouse_id>b.warehouse_id?1:a.sku_id<b.sku_id?-1:a.sku_id>b.sku_id?1:0);
  const actual=(await query(SCALED_REFERENCE_BALANCES_SQL)).rows;
  need(requestHash(actual)===requestHash(expected),'SCALED_COMPLETE_FOUR_NONZERO_196_ABSENT_BALANCES_DIFFER');
  return freeze({nonzeroRows:4,absentSourcePairs:196,completeWarehouseSkuPairs:200,matchedSource:true,
    phase:'MUST_BE_CHECKED_BEFORE_ORIGINAL_PUBLISH_NOT_AFTER_ONLY',publicationOrRuntimeApproval:false});
}
