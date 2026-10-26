// SELECT-only fragments. All JSON returned from evidence is checked BEFORE it leaves PostgreSQL.
const arr=keys=>`ARRAY[${keys.map(k=>`'${k}'`).join(',')}]::text[]`;
export const columns={
 HALL:['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'],
 WAREHOUSE:['id','hall_id','name','enabled','version','created_operation_id'],
 STAFF:['id','name','hall_id','role','contact','employment_status','version'],
 CUSTOMER:['id','code','name','enabled','version','created_at','updated_at']
};
export const memberKeys=['sourceRowId','entity','sourceKey','nativeId'];
export const accountKeys=['id','staff_id','login_enabled','auth_version','version','created_at','updated_at'];
export const proofShape={origin:'string',reason:'string',evidence_ref:'string',raw:{
 version:'string',profile:'string',
 binding:Object.fromEntries(['batch_id','fixed_source_namespace','selection_sha256','authorized_payload_sha256','stage_command_sha256','operation_id','actor_account_id'].map(k=>[k,'string'])),
 authority:Object.fromEntries(['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256'].map(k=>[k,'string'])),
 expected_counts:{accounts:'number',direct_original_employee_links:'number',approved_current_person_links:'number'},
 staff:{source_row_id:'string',source_key:'string',source_row_sha256:'string',native_staff_id:'string'},
 accounts:[{source_account_id:'string',source_account_version:'number|string',source_employee_native_id:'string|null',source_employee_code:'string|null',identity_link_kind:'string',current_person_key:'string|null',source_plan_row:'number|string|null',native_snapshot:{id:'string',staff_id:'string',login_enabled:'boolean',auth_version:'number',version:'number',created_at:'string',updated_at:'string'}}]
}};
export function shapeSql(expr,shape,level=0){
 if(typeof shape==='string')return `jsonb_typeof(${expr})=ANY(${arr(shape.split('|'))})`;
 if(Array.isArray(shape)){const alias=`z${level}`;return `(CASE WHEN jsonb_typeof(${expr})='array' THEN jsonb_array_length(${expr})=1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${expr}) ${alias}(v) WHERE (${shapeSql(`${alias}.v`,shape[0],level+1)}) IS NOT TRUE) ELSE false END)`;}
 return `(CASE WHEN jsonb_typeof(${expr})='object' THEN ${expr} ?& ${arr(Object.keys(shape))} AND ${expr}-${arr(Object.keys(shape))}='{}'::jsonb AND ${Object.entries(shape).map(([k,v])=>shapeSql(`(${expr}->'${k}')`,v,level+1)).join(' AND ')} ELSE false END)`;
}
const exactScalar=(expr,keys,partial=false)=>`(CASE WHEN jsonb_typeof(${expr})='object' THEN ${partial?'true':`${expr} ?& ${arr(keys)}`} AND ${expr}-${arr(keys)}='{}'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_each(${expr}) k WHERE jsonb_typeof(k.value) NOT IN ('string','number','boolean','null')) ELSE false END)`;
export const identitySql=`/* projection:identity */ SELECT jsonb_build_object('database',current_database(),'databaseOid',d.oid::text,'role',current_user,'sessionUser',session_user,'serverAddress',inet_server_addr()::text,'serverPort',inet_server_port(),'postmasterStartedAt',pg_postmaster_start_time()::text,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'replicationRole',current_setting('session_replication_role')) AS identity FROM pg_catalog.pg_database d WHERE d.datname=current_database()`;
export const birthSql=`/* projection:birth */ SELECT b.id::text AS batch_id,b.source_name,b.source_hash,b.cutoff_at::text,b.mapping_version,b.status,b.checkpoint,
 r.id::text AS core_receipt_id,r.request_hash AS command_hash,r.actor_account_id::text,r.completed_at::text,
 a.after_values->>'coreSourceDigest' AS core_source_digest,
 CASE WHEN jsonb_typeof(a.after_values->'coreSourceMembers'->'parties')='array' AND jsonb_array_length(a.after_values->'coreSourceMembers'->'parties')=115
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'coreSourceMembers'->'parties') p(v) WHERE (${shapeSql('p.v',Object.fromEntries(memberKeys.map(k=>[k,'string'])))}) IS NOT TRUE)
 THEN a.after_values->'coreSourceMembers'->'parties' ELSE NULL END AS members,
 (a.action=r.action AND a.object_type='IMPORT' AND a.object_id=b.id AND a.actor_account_id=r.actor_account_id
 AND a.old_version=1 AND a.new_version=2 AND a.occurred_at=r.completed_at AND r.completed_at=b.created_at
 AND a.after_values->>'phase'='CORE_INITIALIZED_V1' AND a.after_values->'authority'->>'commandHash'=r.request_hash
 AND a.after_values->'authority'->>'actorAccountId'=r.actor_account_id::text
 AND a.after_values->'authority'->>'batchId'=b.id::text AND a.after_values->'authority'->>'namespace'=b.source_name
 AND a.after_values->'authority'->>'selectionSha256'=b.source_hash) AS birth_link_ok
 FROM naijue_erp.import_batch b JOIN naijue_erp.operation_receipt r ON r.target_id=b.id AND r.target_type='IMPORT'
 JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE b.id=$1::uuid AND r.id=$2::uuid AND r.action='IMPORT_CORE_STAGE' AND r.status='COMMITTED'
 AND a.after_values->>'coreSourceDigest'=$3 LIMIT 2`;
const snapshots=Object.entries(columns).map(([entity,keys])=>`SELECT '${entity}'::text AS entity,n.id, jsonb_build_object(${keys.map(k=>`'${k}',n.${k}`).join(',')}) AS snapshot FROM naijue_erp.${entity.toLowerCase()} n WHERE n.id=$3::uuid AND $4='${entity}'`).join('\nUNION ALL\n');
const eShape=`CASE e.entity_type ${Object.entries(columns).map(([e,c])=>`WHEN '${e}' THEN ${exactScalar('e.native_snapshot',c)}`).join(' ')} ELSE false END`;
const p=`s.field_provenance->'fields'->'bootstrap_accounts'`;
const proofSafe=shapeSql(p,proofShape);
export const memberSql=`/* projection:member-by-original-PK */ WITH current_native AS (${snapshots})
 SELECT e.source_row_id::text,e.entity_type,e.source_key,e.native_id::text,
 CASE WHEN ${eShape} THEN e.native_snapshot ELSE NULL END AS birth_snapshot,n.snapshot AS current_snapshot,
 (s.entity_type=e.entity_type AND s.source_key=e.source_key AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) AS source_equal,
 CASE WHEN e.entity_type='STAFF' AND (${proofSafe}) THEN ${p} ELSE NULL END AS bootstrap_accounts,
 CASE WHEN e.entity_type='STAFF' AND (${proofSafe}) THEN (
 ${p}->>'origin'='MIGRATION_DERIVED' AND ${p}->>'reason'='EXACT_SOURCE_ACCOUNT_BOOTSTRAP'
 AND ${p}->'raw'->>'version'='NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1' AND ${p}->'raw'->>'profile'='EXACT26'
 AND ${p}->'raw'->'binding'->>'batch_id'=e.batch_id::text
 AND ${p}->'raw'->'binding'->>'operation_id'=r.id::text
 AND ${p}->'raw'->'binding'->>'stage_command_sha256'=r.request_hash
 AND ${p}->'raw'->'binding'->>'authorized_payload_sha256'=$6
 AND ${p}->'raw'->'binding'->>'fixed_source_namespace'=a.after_values->'authority'->>'namespace'
 AND ${p}->'raw'->'binding'->>'selection_sha256'=a.after_values->'authority'->>'selectionSha256'
 AND ${p}->'raw'->'binding'->>'actor_account_id'=r.actor_account_id::text
 AND ${p}->>'evidence_ref'=a.after_values->'authority'->>'bootstrap_execution_review_sha256'
 AND ${p}->'raw'->'authority'=a.after_values->'authority'-${arr(['target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId'])}
 AND ${p}->'raw'->'expected_counts'='{"accounts":49,"direct_original_employee_links":45,"approved_current_person_links":4}'::jsonb
 AND ${p}->'raw'->'staff'=jsonb_build_object('source_row_id',s.id,'source_key',s.source_key,'source_row_sha256',s.row_sha256,'native_staff_id',e.native_id)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'coreSourceMembers'->'accounts') ac(v)
 WHERE (${shapeSql('ac.v',proofShape.raw.accounts[0].native_snapshot)}) AND ac.v=${p}->'raw'->'accounts'->0->'native_snapshot'
 AND ac.v->>'staff_id'=e.native_id::text AND EXISTS(SELECT 1 FROM naijue_erp.user_account ua WHERE ua.id=(ac.v->>'id')::uuid AND ua.staff_id=e.native_id))
 ) ELSE NULL END AS proof_link_ok
 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
 JOIN naijue_erp.operation_receipt r ON r.id=$5::uuid JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 LEFT JOIN current_native n ON n.id=e.native_id AND n.entity=e.entity_type
 WHERE e.batch_id=$1::uuid AND e.source_row_id=$2::uuid AND e.native_id=$3::uuid AND e.entity_type=$4 LIMIT 2`;
// Only original root fields are consumed. accounts/account_credentials never appear in the result.
export function maintenanceSql(entity){
 const keys=columns[entity];if(!keys)throw Error('Unexpected CORE entity');
 const before="(ma.before_values-ARRAY['accounts','account_credentials'])",after="(ma.after_values-ARRAY['accounts','account_credentials'])";
 return `/* projection:bounded-original-maintenance */ WITH RECURSIVE chain AS (
 SELECT 0 AS depth,$3::jsonb AS state,'[]'::jsonb AS operations,true AS valid
 UNION ALL SELECT c.depth+1,c.state||${after},c.operations||jsonb_build_array(jsonb_build_object('operationId',ma.operation_id,'fromVersion',ma.old_version,'toVersion',ma.new_version)),
 c.valid AND (${exactScalar(before,keys,true)}) AND (${exactScalar(after,keys,true)})
 AND ${before} ? 'version' AND ${after} ? 'version'
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(${before}) f WHERE NOT c.state ? f.key OR NOT naijue_erp.maintenance_evidence_matches(f.value,c.state->f.key))
 AND ${after}->>'version'=ma.new_version::text
 AND mr.target_type=ma.object_type AND mr.target_id=ma.object_id AND mr.action=ma.action AND mr.actor_account_id=ma.actor_account_id
 AND mr.status='COMMITTED' AND mr.completed_at=ma.occurred_at AND ma.occurred_at>=$5::timestamptz AND ma.occurred_at<=transaction_timestamp()
 AND mr.result_data->>'operationId'=ma.operation_id::text AND coalesce(mr.result_data->>'targetId',mr.result_data->>'customerId')=ma.object_id::text
 AND mr.result_data->>'version'=ma.new_version::text AS valid
 FROM chain c JOIN naijue_erp.audit_change ma ON ma.object_type=$1 AND ma.object_id=$2::uuid AND ma.old_version=(c.state->>'version')::integer AND ma.new_version=ma.old_version+1
 JOIN naijue_erp.operation_receipt mr ON mr.id=ma.operation_id
 WHERE c.depth<256 AND (c.state->>'version')::integer<($4::jsonb->>'version')::integer
 ) SELECT depth,operations,(valid AND naijue_erp.maintenance_complete_row_matches(state,$4::jsonb)) AS matches_current
 FROM chain ORDER BY depth DESC LIMIT 2`;
}
export const warehousesSql=`/* projection:warehouse-original-evidence-max54 */ SELECT e.source_row_id::text,e.source_key,e.native_id::text,s.row_sha256,s.file_ref,
 CASE WHEN (${shapeSql('e.warehouse_record',{id:'string',reviewedAt:'string',decisionReason:'string'})}) THEN e.warehouse_record ELSE NULL END AS warehouse_record,
 (w.id IS NOT NULL AND s.entity_type='WAREHOUSE' AND s.source_key=e.source_key AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) AS source_equal
 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
 LEFT JOIN naijue_erp.warehouse w ON w.id=e.native_id
 WHERE e.batch_id=$1::uuid AND e.entity_type='WAREHOUSE' ORDER BY e.source_key LIMIT 54`;
export const claimsSql=`/* projection:original22-claims-no-lock */ SELECT c.import_record_id::text,c.target_id::text,
 (c.target_type='WAREHOUSE' AND c.checkpoint_sequence=1 AND rec.status='IMPORTED' AND rec.source_entity_type='WAREHOUSE'
 AND rec.target_id=c.target_id AND rec.target_type=c.target_type AND e.warehouse_record->>'id'=rec.id::text
 AND e.warehouse_record->>'decisionReason'=rec.decision_reason AND (e.warehouse_record->>'reviewedAt')::timestamptz=rec.reviewed_at
 AND rec.source_key=e.source_key AND rec.source_record_hash=s.row_sha256 AND rec.source_file_ref=s.file_ref
 AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) AS claim_ok
 FROM naijue_erp.import_record_accounting_claim c LEFT JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id AND rec.import_batch_id=c.import_batch_id
 LEFT JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=c.import_batch_id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id
 LEFT JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
 WHERE c.import_batch_id=$1::uuid AND c.operation_id=$2::uuid ORDER BY c.target_id LIMIT 23`;
