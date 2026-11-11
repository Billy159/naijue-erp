// Independent post-commit projection using the existing ordinary runtime read lease.
export const runtimeReadbackSql = `
WITH published AS MATERIALIZED (
  SELECT b.id AS baseline_id, d.id AS document_id, r.id AS publish_id, r.completed_at,
    a.after_values->'request'->>'cutoff_at' AS cutoff_at
  FROM naijue_erp.import_batch b
  JOIN naijue_erp.import_batch d ON d.id=$2::uuid
    AND d.source_hash=b.source_hash AND d.source_name=b.source_name AND d.cutoff_at=b.cutoff_at
  JOIN naijue_erp.operation_receipt r ON r.id=$6::uuid AND r.target_id=d.id
    AND r.target_type='IMPORT' AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
  JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_id=d.id
    AND a.object_type=r.target_type AND a.action=r.action
    AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
  WHERE b.id=$1::uuid AND b.source_hash=$3::text AND b.status='IMPORTED' AND d.status='IMPORTED'
    AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
    AND d.inventory_mode='DOCUMENT_CONVERSION' AND d.mapping_version='DOCUMENT_CONVERSION_V1'
    AND r.result_data @> jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','status','IMPORTED','phase','DOCUMENT_PUBLISH',
      'baselineBatchId',b.id::text,'documentBatchId',d.id::text,'packageManifestSha256',$3::text,'planSha256',$4::text)
    AND a.after_values->'whole_package_v2'->>'root_operation'=$5::text
    AND a.after_values->'request'->>'plan_sha256'=$4::text
    AND (a.after_values->'request'->>'cutoff_at')::timestamptz=b.cutoff_at
), sealed AS MATERIALIZED (
  SELECT a.after_values->'records'->0->'fields'->'inventory_baseline_scope' AS scope
  FROM published p
  JOIN naijue_erp.operation_receipt r ON r.target_id=p.baseline_id AND r.completed_at=p.completed_at
    AND r.target_type='IMPORT' AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
    AND r.result_data @> jsonb_build_object('phase','BASELINE_SEAL','status','IMPORTED',
      'baselineBatchId',p.baseline_id::text,'documentBatchId',p.document_id::text,'packageManifestSha256',$3::text,'planSha256',$4::text)
  JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_id=r.target_id
    AND a.object_type=r.target_type AND a.action=r.action
    AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
    AND a.after_values->'whole_package_v2'->>'root_operation'=$5::text
  JOIN naijue_erp.import_record s ON s.id=(a.after_values->'records'->0->>'id')::uuid
    AND s.import_batch_id=p.baseline_id AND s.target_type='IMPORT_BATCH' AND s.target_id=p.baseline_id AND s.status='IMPORTED'
    AND s.source_entity_type='STANDARD_BASELINE_APPROVAL' AND s.source_key='FINAL_BASELINE_SCOPE_V1'
    AND s.source_key=a.after_values->'records'->0->>'source_key'
    AND s.source_record_hash=a.after_values->'records'->0->>'source_hash'
    AND s.decision_reason::jsonb=jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id)
  WHERE a.after_values->'records'->0->'fields'->'inventory_baseline_scope' @>
    jsonb_build_object('format_version','INVENTORY_BASELINE_SCOPE_V1','sha256',$7::text,'cutoff_at',p.cutoff_at)
), source_records AS MATERIALIZED (
  SELECT s.id,s.import_batch_id,s.target_id,s.target_type,s.source_key,s.source_record_hash,s.decision_reason
  FROM published p JOIN naijue_erp.import_record s ON s.status='IMPORTED' AND
    ((s.import_batch_id=p.baseline_id AND s.target_type='INVENTORY_KEY') OR
     (s.import_batch_id=p.document_id AND s.target_type='SALES_SETTLEMENT'))
), immutable AS MATERIALIZED (
  SELECT s.id AS record_id,s.target_type,item.value->'fields' AS fields,item.value ? 'explicit_zero_evidence' AS approved_zero
  FROM published p
  JOIN naijue_erp.audit_change a ON a.object_type='IMPORT' AND a.action='IMPORT_CHUNK' AND
    ((a.object_id=p.baseline_id AND a.after_values->>'phase'='KEYS') OR
     (a.object_id=p.document_id AND a.after_values->>'phase'='DOCUMENTS'))
  JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id AND r.target_id=a.object_id
    AND r.target_type=a.object_type AND r.action=a.action AND r.status='COMMITTED'
    AND r.actor_account_id=a.actor_account_id AND r.completed_at=a.occurred_at
  CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
  JOIN source_records s ON s.id=(item.value->>'id')::uuid AND s.import_batch_id=a.object_id
    AND s.target_type=item.value->>'target_type' AND s.target_id=(item.value->>'target_id')::uuid
    AND s.source_key=item.value->>'source_key' AND s.source_record_hash=item.value->>'source_hash'
    AND s.decision_reason::jsonb=jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id)
  WHERE a.after_values->'whole_package_v2'->>'root_operation'=$5::text
    AND r.result_data->>'packageManifestSha256'=$3::text AND r.result_data->>'planSha256'=$4::text
), stock AS (
  SELECT (fields->>'warehouse_id')::uuid AS warehouse_id,(fields->>'sku_id')::uuid AS sku_id,
    (fields->>'quantity')::bigint AS quantity,approved_zero
  FROM immutable WHERE target_type='INVENTORY_KEY'
), warehouse_stock AS (
  SELECT s.warehouse_id,count(*)::text AS explicit_keys,count(DISTINCT s.sku_id)::text AS distinct_keys,
    count(*) FILTER (WHERE NOT s.approved_zero)::text AS source_listed_keys,
    count(*) FILTER (WHERE NOT s.approved_zero AND s.quantity=0)::text AS source_listed_zero_keys,
    count(*) FILTER (WHERE s.approved_zero AND s.quantity=0)::text AS approved_absence_zero_keys,
    count(*) FILTER (WHERE s.quantity>0)::text AS positive_keys,
    count(*) FILTER (WHERE s.quantity<0)::text AS negative_keys,
    count(*) FILTER (WHERE s.quantity=0)::text AS zero_quantity_keys,
    sum(s.quantity)::text AS signed_quantity,
    coalesce(sum(s.quantity) FILTER (WHERE s.quantity>0),0)::text AS positive_quantity,
    coalesce(sum(s.quantity) FILTER (WHERE s.quantity<0),0)::text AS negative_quantity,
    encode(sha256(convert_to(string_agg(format('["%s","%s","%s","%s"]',s.warehouse_id,s.sku_id,s.quantity,
      CASE WHEN s.approved_zero THEN 'APPROVED_ABSENCE_ZERO' ELSE 'SOURCE_LISTED' END)||chr(10),'' ORDER BY s.sku_id),'UTF8')),'hex') AS exact_key_sha256,
    count(b.sku_id)::text AS current_present_keys,count(*) FILTER (WHERE b.sku_id IS NULL)::text AS current_missing_keys,
    count(*) FILTER (WHERE b.sku_id IS NOT NULL AND b.quantity<>s.quantity)::text AS current_changed_keys,
    sum(b.quantity)::text AS current_known_signed_quantity
  FROM stock s LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=s.warehouse_id AND b.sku_id=s.sku_id
  GROUP BY s.warehouse_id
), warehouse_master AS (
  SELECT w.id
  FROM published p JOIN naijue_erp.import_record s ON s.import_batch_id=p.baseline_id
    AND s.status='IMPORTED' AND s.target_type='WAREHOUSE'
  JOIN naijue_erp.warehouse w ON w.id=s.target_id
), sku_master AS MATERIALIZED (
  SELECT k.id
  FROM published p JOIN naijue_erp.import_record s ON s.import_batch_id=p.baseline_id
    AND s.status='IMPORTED' AND s.target_type='SKU'
  JOIN naijue_erp.sku k ON k.id=s.target_id
), witness_warehouse AS (
  SELECT w.id
  FROM warehouse_master w LEFT JOIN warehouse_stock ws ON ws.warehouse_id=w.id
  WHERE coalesce(ws.explicit_keys::bigint,0)<(SELECT count(*) FROM sku_master)
  ORDER BY w.id LIMIT 1
), witness AS (
  SELECT w.id AS warehouse_id,k.id AS sku_id
  FROM witness_warehouse w CROSS JOIN sku_master k
  WHERE NOT EXISTS (SELECT 1 FROM stock s WHERE s.warehouse_id=w.id AND s.sku_id=k.id)
  ORDER BY k.id LIMIT 1
), original_cash AS (
  SELECT fields->>'direction' AS direction,count(*)::text AS rows,
    count(*) FILTER (WHERE (fields->>'amount')::numeric<=0)::text AS nonpositive_rows,
    trunc(sum((fields->>'amount')::numeric)*100)::text AS amount_cents
  FROM immutable WHERE target_type='SALES_SETTLEMENT' GROUP BY fields->>'direction'
), current_cash AS (
  SELECT s.direction,count(*)::text AS rows,trunc(sum(s.amount)*100)::text AS amount_cents
  FROM published p JOIN naijue_erp.sales_header h ON h.import_batch_id=p.document_id
  JOIN naijue_erp.sales_settlement s ON s.sales_id=h.id GROUP BY s.direction
)
SELECT current_database() AS database,pg_current_snapshot()::text AS snapshot,p.publish_id::text,p.cutoff_at,
  sealed.scope->>'sha256' AS scope_sha256,
  sealed.scope->'explicit_values'->>'records_sha256' AS scope_explicit_values_sha256,
  sealed.scope->'explicit_values'->>'count' AS scope_explicit_keys,
  sealed.scope->'warehouses'->>'count' AS scope_warehouse_count,
  sealed.scope->'skus'->>'count' AS scope_sku_count,
  sealed.scope->>'universe_count' AS scope_universe_count,
  (SELECT count(DISTINCT id)::text FROM sku_master) AS sku_count,
  (SELECT count(*)::text FROM source_records WHERE target_type='INVENTORY_KEY') AS inventory_records,
  (SELECT count(*)::text FROM naijue_erp.inventory_balance b WHERE NOT EXISTS (
    SELECT 1 FROM stock s WHERE s.warehouse_id=b.warehouse_id AND s.sku_id=b.sku_id)) AS current_extra_keys,
  (SELECT jsonb_build_object(
    'omitted',naijue_erp.standard_inventory_key_proof(w.warehouse_id,w.sku_id),
    'balance_exists',EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=w.warehouse_id AND b.sku_id=w.sku_id),
    'ledger_exists',EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.warehouse_id AND l.sku_id=w.sku_id),
    'outside_warehouse',naijue_erp.standard_inventory_key_proof('00000000-0000-0000-0000-000000000000'::uuid,w.sku_id)->>'state',
    'outside_sku',naijue_erp.standard_inventory_key_proof(w.warehouse_id,'00000000-0000-0000-0000-000000000000'::uuid)->>'state')
  FROM witness w) AS scope_witness,
  (SELECT count(*)::text FROM source_records WHERE target_type='SALES_SETTLEMENT') AS settlement_records,
  (SELECT count(DISTINCT record_id)::text FROM immutable WHERE target_type='SALES_SETTLEMENT') AS immutable_settlement_records,
  (SELECT jsonb_agg(coalesce(to_jsonb(ws),'{}'::jsonb)||jsonb_build_object('warehouse_id',coalesce(w.id,ws.warehouse_id),'warehouse_present',w.id IS NOT NULL)
    ORDER BY coalesce(w.id,ws.warehouse_id)) FROM warehouse_master w FULL JOIN warehouse_stock ws ON w.id=ws.warehouse_id) AS warehouses,
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.direction) FROM original_cash c) AS original_cash,
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.direction) FROM current_cash c) AS current_cash
FROM published p CROSS JOIN sealed`;

const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const integer=/^(0|-?[1-9][0-9]*)$/;
const directions=['RECEIVE','REFUND'];
const requireValue=(condition,code)=>{if(!condition)throw Error(code);};
const total=(rows,field)=>rows.reduce((sum,row)=>sum+BigInt(row[field]??'0'),0n).toString();
const unsigned=value=>typeof value==='string'&&integer.test(value)&&!value.startsWith('-');

function validateProjection(row,binding){
 requireValue(row?.database===binding.database&&typeof row.snapshot==='string'&&row.snapshot.length>0&&row.publish_id===binding.publishOperationId&&typeof row.cutoff_at==='string'&&
  unsigned(row.inventory_records)&&unsigned(row.settlement_records)&&Array.isArray(row.warehouses),'RUNTIME_READBACK_BINDING_DIFFERS');
 requireValue(new Set(row.warehouses.map(w=>w.warehouse_id)).size===row.warehouses.length&&
  row.warehouses.every(w=>w.warehouse_present===true&&uuid.test(w.warehouse_id)&&w.explicit_keys===w.distinct_keys)&&
  total(row.warehouses,'explicit_keys')===row.inventory_records,'RUNTIME_READBACK_INVENTORY_PROJECTION_INCOMPLETE');
 requireValue(row.scope_sha256===binding.scopeSha256&&digest.test(row.scope_explicit_values_sha256)&&
  row.scope_explicit_keys===row.inventory_records&&row.scope_warehouse_count===String(row.warehouses.length)&&
  unsigned(row.sku_count)&&row.scope_sku_count===row.sku_count&&unsigned(row.current_extra_keys)&&
  row.scope_universe_count===(BigInt(row.scope_warehouse_count)*BigInt(row.sku_count)).toString(),
  'RUNTIME_READBACK_SCOPE_DIFFERS');
 const witness=row.scope_witness;
 requireValue(witness?.omitted?.state==='EXPLICIT_ZERO'&&witness.omitted.basis==='PUBLISHED_BASELINE_SCOPE_OR_NATIVE_CREATION'&&
  witness.omitted.baseline_batch_id===binding.baselineBatchId&&witness.outside_warehouse==='UNKNOWN'&&witness.outside_sku==='UNKNOWN'&&
  typeof witness.balance_exists==='boolean'&&typeof witness.ledger_exists==='boolean','RUNTIME_READBACK_SCOPE_WITNESS_DIFFERS');
 for(const group of [row.original_cash,row.current_cash]){
  const cash=group??[];
  requireValue(Array.isArray(cash)&&new Set(cash.map(c=>c.direction)).size===cash.length&&cash.every(c=>
   directions.includes(c.direction)&&unsigned(c.rows)&&unsigned(c.amount_cents)),'RUNTIME_READBACK_SETTLEMENT_PROJECTION_INVALID');
 }
 requireValue(total(row.original_cash??[],'rows')===row.settlement_records&&row.immutable_settlement_records===row.settlement_records&&
  (row.original_cash??[]).every(c=>c.nonpositive_rows==='0'),'RUNTIME_READBACK_SETTLEMENT_PROJECTION_INCOMPLETE');
}

/** Use the same owned pool and read capability from the ordinary runtime issuer. */
export async function readWholePackageRuntimeProjection({pool,ordinaryRead},binding){
 const {database,baselineBatchId,documentBatchId,manifestSha256,planSha256,rootOperationId,publishOperationId,scopeSha256}=binding;
 binding={database,baselineBatchId,documentBatchId,manifestSha256,planSha256,rootOperationId,publishOperationId,scopeSha256};
 requireValue(typeof database==='string'&&database.length>0&&uuid.test(baselineBatchId)&&uuid.test(documentBatchId)&&
  baselineBatchId!==documentBatchId&&uuid.test(rootOperationId)&&uuid.test(publishOperationId)&&
  digest.test(manifestSha256)&&digest.test(planSha256)&&digest.test(scopeSha256),
  'RUNTIME_READBACK_BINDING_REQUIRED');
 const client=await pool.connect();
 let active=false,discard=false;
 try{
  const begin=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  requireValue(begin.command==='BEGIN','RUNTIME_READBACK_BEGIN_UNACKNOWLEDGED');
  active=true;
  await ordinaryRead.assertReady(client,'ORDINARY_DOCUMENT_READ');
  const result=await client.query(runtimeReadbackSql,[baselineBatchId,documentBatchId,manifestSha256,planSha256,rootOperationId,publishOperationId,scopeSha256]);
  requireValue(result.command==='SELECT'&&result.rows.length===1,'RUNTIME_READBACK_PUBLISHED_BATCH_REQUIRED');
  const row=result.rows[0];
  validateProjection(row,binding);
  await ordinaryRead.assertReady(client,'ORDINARY_DOCUMENT_READ');
  active=false;
  const rollback=await client.query('ROLLBACK');
  requireValue(rollback.command==='ROLLBACK','RUNTIME_READBACK_ROLLBACK_UNACKNOWLEDGED');
  return {binding,...row};
 }catch(error){
  discard=!active;
  if(active){
   try{discard=(await client.query('ROLLBACK')).command!=='ROLLBACK';}catch{discard=true;}
  }
  throw error;
 }finally{client.release(discard);}
}

const warehouseFields=['explicit_keys','source_listed_keys','source_listed_zero_keys','approved_absence_zero_keys','positive_keys','negative_keys','zero_quantity_keys',
 'signed_quantity','positive_quantity','negative_quantity'];
function cents(amount){
 requireValue(typeof amount==='string'&&/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(amount),'RUNTIME_READBACK_EXPECTED_MONEY_INVALID');
 return BigInt(amount.replace('.','')).toString();
}

/** Compare the original imported facts and the current first-import snapshot. */
export function compareWholePackageRuntimeProjection(projection,warehouseEvidence,aggregateEvidence){
 const manifest=projection.binding.manifestSha256;
 requireValue(warehouseEvidence.format==='R3_WAREHOUSE_SOURCE_EXPECTATIONS_V1'&&warehouseEvidence.manifest.sha256===manifest&&
  aggregateEvidence.references.manifest.sha256===manifest&&warehouseEvidence.cutoff_at===projection.cutoff_at,
  'RUNTIME_READBACK_SOURCE_MANIFEST_DIFFERS');
 const targets=new Map(projection.warehouses.map(w=>[w.warehouse_id,w]));
 const expected=warehouseEvidence.warehouse_expectations;
 const warehouseMismatches=expected.flatMap(w=>{
  const actual=targets.get(w.warehouse_id);
  targets.delete(w.warehouse_id);
  if(!actual)return [{warehouse_id:w.warehouse_id,state:'MISSING_WAREHOUSE'}];
  const noKeys=String(w.counts_and_totals.explicit_keys)==='0';
  const fields=warehouseFields.filter(key=>{
   const fact=actual[key]??(noKeys&&key.endsWith('_keys')?'0':null);
   const expected=w.counts_and_totals[key];
   return fact!==(expected===null?null:String(expected));
  });
  if((actual.exact_key_sha256??null)!==w.exact_key_sha256)fields.push('exact_key_sha256');
  return fields.length?[{warehouse_id:w.warehouse_id,state:'IMMUTABLE_KEY_FACT_DIFFERS',fields}]:[];
 });
 for(const id of targets.keys())warehouseMismatches.push({warehouse_id:id,state:'EXTRA_WAREHOUSE'});
 const sourceCash=aggregateEvidence.fixed_source_expectations.cash_source_aggregates;
 const money=[
  ['RECEIVE',String(sourceCash.receive_rows),cents(sourceCash.receive_amount)],
  ['REFUND',String(sourceCash.refund_rows),cents(sourceCash.refund_absolute_amount)]
 ];
 const cashMismatches=money.flatMap(([direction,rows,amount])=>{
  const actual=(projection.original_cash??[]).find(c=>c.direction===direction);
  return (actual?.rows??'0')===rows&&(actual?.amount_cents??'0')===amount?[]:[direction];
 });
 const currentExplicitInventory={
  missingKeys:total(projection.warehouses,'current_missing_keys'),
  changedKeys:total(projection.warehouses,'current_changed_keys'),
  extraKeys:projection.current_extra_keys
 };
 const currentCashDirectionsDiffer=directions.filter(direction=>{
  const original=(projection.original_cash??[]).find(c=>c.direction===direction);
  const current=(projection.current_cash??[]).find(c=>c.direction===direction);
  return (original?.rows??'0')!==(current?.rows??'0')||(original?.amount_cents??'0')!==(current?.amount_cents??'0');
 });
 const omittedKeyHasEffects=projection.scope_witness.balance_exists||projection.scope_witness.ledger_exists;
 const cashNetCents=group=>directions.reduce((net,direction)=>{
  const amount=BigInt(group?.find(c=>c.direction===direction)?.amount_cents??'0');
  return net+(direction==='RECEIVE'?amount:-amount);
 },0n).toString();
 const sourceMatched=warehouseMismatches.length===0&&cashMismatches.length===0;
 const currentMatched=Object.values(currentExplicitInventory).every(count=>count==='0')&&
  currentCashDirectionsDiffer.length===0&&!omittedKeyHasEffects;
 return {
  state:sourceMatched&&currentMatched?'FIRST_IMPORT_RECONCILED':'FIRST_IMPORT_DIFFERS',
  warehouseMismatches,cashMismatches,currentExplicitInventory,currentCashDirectionsDiffer,omittedKeyHasEffects,
  cashNetCents:{expected:(BigInt(money[0][2])-BigInt(money[1][2])).toString(),original:cashNetCents(projection.original_cash),current:cashNetCents(projection.current_cash)}
 };
}
