/** NEW fixed303 PRE-CUTOFF fixture. Its own private brand, never old105 authority. */
import { buildScaledSourcePlan } from '../../scaled-retained-native-source/scaled-source.mjs';
import { seedCommands, assertNoPublicationOrBusiness } from '../../../opt00/pg-component/seed.mjs';
import { SETUP_COLUMNS, setupInsert } from '../../../opt00/pg-component/contract.mjs';
import { need, freeze } from './fixture.mjs';
import { identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';

const fixtures = new WeakSet();
export function assertScaledFixture(value) { need(fixtures.has(value), 'ORIGINAL_SCALED_303_FIXTURE_REQUIRED'); return value; }
export function buildScaledReferenceFixture() {
  need(arguments.length === 0, 'CLOSED_SCALED_FIXTURE_NO_INPUT_REQUIRED');
  const sourcePlan = buildScaledSourcePlan(), p = sourcePlan.publication, alternate = sourcePlan.retainedProducts[2];
  const f = freeze({ scope: 'FIXED_SCALED303_REFERENCE_ONLY_NOT_RUNTIME_AUTHORITY', datasetId: sourcePlan.datasetId,
    reference: sourcePlan.parentReference, warehouses: sourcePlan.warehouses, skus: sourcePlan.retainedSkus,
    alternateProduct: { id: alternate.id, code: alternate.code, name: alternate.name, retailPrice: alternate.retailPrice, groupId: alternate.sizeGroupId },
    season: sourcePlan.season, scheme: sourcePlan.scheme, baselines: sourcePlan.baselines, absentPairs: sourcePlan.absentPairs,
    expected: p.expected, namespace: p.namespace, batchId: p.batchId, cutoffAt: p.cutoffAt,
    artifacts: sourcePlan.artifacts, commands: p.commands, commandHashes: p.commandHashes,
    checkpoints: p.checkpoints, expectedResults: p.predictedResults,
    referenceRows: 303, originalReferenceRows: 99, extraReferenceRows: 204, referenceCounts: sourcePlan.referenceCounts,
    sourcePlan, native: sourcePlan.native, sourceOnly: true, physicalTargetAssigned: false, executionApproved: false,
    noMaintainedSupplierOrProductCreated: true, noV2ProductOrHistorySource: true });
  fixtures.add(f); return f;
}

/** Full original99 +204 deterministic pre-cutoff rows. Parameters contain the
 * RAM-only host password hash: do NOT log/serialize commands or query values. */
export function scaledReferenceCommands(input, passwordHash) {
  const f = assertScaledFixture(input), plan = f.sourcePlan;
  const rows = [...seedCommands(f.reference, passwordHash)];
  const add = (table, values) => rows.push({ table, ...setupInsert(table, values) });
  for (const w of f.warehouses) rows.push({ table: 'warehouse', text: 'INSERT INTO naijue_erp.warehouse (id,hall_id,name,enabled,version,created_operation_id) VALUES ($1,$2,$3,$4,$5,$6)',
    values: [w.id,w.hall_id,w.name,w.enabled,w.version,w.created_operation_id] });
  for (const p of plan.retainedProducts.slice(2)) {
    const data = { id:p.id,product_code:p.code,name:p.name,category_id:p.categoryId,supplier_id:p.supplierId,season_id:p.seasonId,
      size_group_id:p.sizeGroupId,...p.prices,enabled:p.enabled,version:p.version,system_item_code:p.systemItemCode };
    add('product', SETUP_COLUMNS.product.map(col => { need(Object.hasOwn(data,col),'CLOSED_SCALED_PRODUCT_COLUMN_REQUIRED'); return data[col]; }));
  }
  for (const s of plan.retainedSkus.slice(2)) add('sku',SETUP_COLUMNS.sku.map(col=>s[col]));
  for (const c of plan.extraColors) add('color',SETUP_COLUMNS.color.map(col=>c[col]));
  rows.push({table:'season',text:'INSERT INTO naijue_erp.season (id,code,name,display_order) VALUES ($1,$2,$3,$4)',
    values:[f.season.id,f.season.code,f.season.name,f.season.display_order]});
  rows.push({table:'barcode_scheme',text:'INSERT INTO naijue_erp.barcode_scheme (id,name,barcode_type,rule_description,code_length,rule_version,status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    values:[f.scheme.id,f.scheme.name,f.scheme.barcode_type,f.scheme.rule_description,f.scheme.code_length,f.scheme.rule_version,f.scheme.status]});
  need(rows.length===303&&Object.entries(f.referenceCounts).every(([table,count])=>rows.filter(row=>row.table===table).length===count), 'EXACT_SCALED_303_PARAMETER_ROWS_REQUIRED');
  return freeze(rows);
}

/** Fixed dependency order; each group's original source row order is retained.
 * Parameter packets are sensitive RAM inputs, never evidence/artifact payloads. */
export const SCALED_SETUP_TABLE_ORDER = Object.freeze(['hall','staff','user_account','product_category','color','fit','size',
  'size_group','size_group_member','season','barcode_scheme','product','sku','warehouse']);
const scaledColumns=freeze({...SETUP_COLUMNS,warehouse:['id','hall_id','name','enabled','version','created_operation_id'],
  season:['id','code','name','display_order'],barcode_scheme:['id','name','barcode_type','rule_description','code_length','rule_version','status']});
export function scaledReferenceInsertPlan(input,passwordHash) {
  const f=assertScaledFixture(input),rows=scaledReferenceCommands(f,passwordHash);
  need(SCALED_SETUP_TABLE_ORDER.length===Object.keys(f.referenceCounts).length
    &&SCALED_SETUP_TABLE_ORDER.every(table=>Object.hasOwn(f.referenceCounts,table)),'CLOSED_SCALED_SEED_TABLE_ORDER_REQUIRED');
  return freeze(SCALED_SETUP_TABLE_ORDER.map(table=>{
    const selected=rows.filter(row=>row.table===table),cols=scaledColumns[table];
    need(selected.length===f.referenceCounts[table]&&selected.every(row=>row.values.length===cols.length),'COMPLETE_FIXED_SCALED_INSERT_GROUP_REQUIRED');
    const values=selected.flatMap(row=>row.values);
    const tuples=selected.map((_row,i)=>'('+cols.map((_col,j)=>'$'+(i*cols.length+j+1)).join(',')+')');
    return {table,rowCount:selected.length,columns:cols,
      text:`INSERT INTO naijue_erp.${identifier(table)} (${cols.map(identifier).join(',')}) VALUES ${tuples.join(',')} RETURNING 1 AS inserted`,values};
  }));
}

/** Caller owns actual owner-only transaction, guards and original send fence.
 * Inserts PRE-CUTOFF reference rows only; no native CREATE/audit/receipt forgery. */
export async function seedScaledReferenceFixture(query,input,passwordHash) {
  const f=assertScaledFixture(input);need(typeof query==='function','FENCED_SCALED_OWNER_SOURCE_QUERY_REQUIRED');
  const batches=scaledReferenceInsertPlan(f,passwordHash); // reject inputs before query
  await assertNoPublicationOrBusiness(query);
  for(const batch of batches){const inserted=await query(batch.text,batch.values);
    need(inserted.rowCount===batch.rowCount&&Array.isArray(inserted.rows)&&inserted.rows.length===batch.rowCount
      &&inserted.rows.every(row=>row.inserted===1),'EXACT_SCALED_INSERT_ACK_REQUIRED:'+batch.table);
  }
  await query('SET CONSTRAINTS ALL IMMEDIATE');await assertNoPublicationOrBusiness(query);
  for(const [table,count] of Object.entries(f.referenceCounts)) {
    const result=(await query(`SELECT count(*)::text n FROM naijue_erp.${identifier(table)}`)).rows;
    need(result.length===1&&result[0].n===String(count),'EXACT_SCALED_REFERENCE_COUNT_REQUIRED:'+table);
  }
  return freeze({scope:f.scope,referenceRows:303,sourceTableCounts:f.referenceCounts,constraintsForcedImmediate:true,
    serviceProduced:false,publication:false,passwordAndHashNotReturned:true,
    fixedInsertGroups:14,exactAcknowledgedInsertedRows:303});
}
