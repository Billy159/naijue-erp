/** Separate review-only SOURCE_REVIEW successor. No database client, installer
 * dispatch, old pin mutation, host capability, production action or activation.
 * The generated SQL begins with an unconditional review-only rejection. */
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_SOURCE_REVIEW_'+code)};
export const SOURCE_REVIEW_PREDECESSOR_SHA256='5fc8508ea96062898a42dc4c03c3a6ebe166158037cc6c7c3130a13d3ee14931';
export const SOURCE_REVIEW_DESIGN_SHA256='82bc2c89dd116142a47c1f66c34b682374702693a067098518b040f2d32bf6b3';
export const SOURCE_REVIEW_KERNEL_PATH='adapters/postgres/patches/0035_source_review_kernel_candidate.sql';
const modulePath='scripts/release/unified-install/fresh35-source-review-candidate.mjs';
const loadedModuleHash=hash(await readFile(new URL(import.meta.url)));
const runtime='erp_unified27_runtime_2393dbc6db9581c2',importer='erp_unified27_importer_2393dbc6db9581c2',initializer='erp_unified27_initializer_2393dbc6db9581c2';
export const SOURCE_REVIEW_BATCH_GUARDS=Object.freeze(['guard_import_batch','guard_history_typed_publication','guard_import_accounting_publication',
 'guard_header_native_reference_publication','guard_history_publication','guard_native_catalogue_publication','guard_native_payment_publication','guard_successor_publication26']);
export const SOURCE_REVIEW_DEFERRED_BATCH_GUARDS=Object.freeze(['validate_import_batch_commit','validate_import_accounting_checkpoint_commit']);
const newSignatures=Object.freeze([
 'source_review_keys_v1(jsonb,text[])','source_review_occurrence_v1(text,jsonb)','source_review_record_id_v1(text)',
 'source_review_utf16_length_v1(text)','source_review_source_v1(jsonb)','source_review_wrapper_v1(text,jsonb)','source_review_approval_v1(uuid)',
 'source_review_expected_v1(jsonb)','source_review_operation_v1(uuid,boolean)',
 'source_review_transition_v1(jsonb,jsonb,text,boolean)','source_review_record_proof_v1(jsonb,boolean)',
 'source_review_complete_operation_v1(uuid)','source_review_command_v1(jsonb,text)','source_review_read_v1(jsonb,text)']);
const apis=new Set(['source_review_command_v1(jsonb,text)','source_review_read_v1(jsonb,text)']);
function routine(schema,name){
 const pattern=new RegExp('CREATE FUNCTION "naijue_erp"\\."'+name+'"\\(\\) RETURNS "trigger"[\\s\\S]*?    AS (\\$[^$]*\\$)([\\s\\S]*?)\\1;');
 const matches=[...schema.matchAll(new RegExp(pattern,'g'))];need(matches.length===1,'EXACT_PREDECESSOR_ROUTINE:'+name);return {sql:matches[0][0],body:matches[0][2]};
}
function prepend(schema,name,branch){
 const old=routine(schema,name);need(old.body.includes('\nBEGIN\n'),'OUTER_BEGIN_REQUIRED:'+name);
 const body=old.body.replace('\nBEGIN\n','\nBEGIN\n'+branch);
 return {signature:'naijue_erp.'+name+'()',before:hash(old.body),after:hash(body),predecessorBody:old.body,successorBody:body,
  sql:old.sql.replace(old.body,body).replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION')};
}
function batchBranch(deferred){return `  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,${deferred});
    RETURN ${deferred?'NULL':'NEW'};
  END IF;
`;}
function receiptConstraint(schema){
 const start=schema.indexOf('    CONSTRAINT "receipt_result_by_kind" CHECK (');
 const end=schema.indexOf(',\n    CONSTRAINT "receipt_target_kind"',start);
 need(start>=0&&end>start,'RECEIPT_CHECK_PREDECESSOR');
 const old=schema.slice(start,end).replace(/^    CONSTRAINT "receipt_result_by_kind" CHECK /,'');
 return {before:hash(old),sql:`ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK (
 CASE WHEN target_type='IMPORT' AND result_data->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN (
  jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','packageManifestSha256','approvalSha256','captureState']
  AND result_data-ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','packageManifestSha256','approvalSha256','captureState']='{}'::jsonb
  AND action=CASE result_data->>'phase' WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END
  AND result_data->>'phase' IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL')
  AND result_data->>'operationId'=id::text AND result_data->>'batchId'=target_id::text
  AND jsonb_typeof(result_data->'sequence')='number' AND result_data->>'sequence' ~ '^(0|[1-9][0-9]*)$'
  AND jsonb_typeof(result_data->'cursor')='number' AND result_data->>'cursor' ~ '^(0|[1-9][0-9]*)$'
  AND result_data->'ledgerEntryIds'='[]'::jsonb AND jsonb_typeof(result_data->'sourceRecordIds')='array'
  AND result_data->>'status'=CASE result_data->>'phase' WHEN 'REVIEW_STAGE' THEN 'STAGED' WHEN 'REVIEW_SEAL' THEN 'PASSED' ELSE 'VALIDATING' END
  AND result_data->>'captureState'=CASE result_data->>'phase' WHEN 'REVIEW_SEAL' THEN 'PENDING_REVIEW' ELSE 'CAPTURING' END
  AND result_data->>'packageManifestSha256' ~ '^[a-f0-9]{64}$' AND result_data->>'approvalSha256' ~ '^[a-f0-9]{64}$'
 ) IS TRUE ELSE ${old} END IS TRUE);`};
}
export function compileFresh35SourceReviewCandidate({predecessorSql,kernelSql,designText}){
 need(typeof predecessorSql==='string'&&hash(predecessorSql)===SOURCE_REVIEW_PREDECESSOR_SHA256,'EXACT_R2_REQUIRED');
 need(typeof designText==='string'&&hash(designText)===SOURCE_REVIEW_DESIGN_SHA256,'REVIEWED_DESIGN_REQUIRED');
 need(typeof kernelSql==='string'&&!/\b(?:CREATE TABLE|DROP TABLE|CREATE ROLE|TRUNCATE|DELETE FROM|ALTER ROLE|DISABLE TRIGGER|COPY)\b/i.test(kernelSql.replace(/^--.*$/gm,'')),'KERNEL_SCOPE');
 const declared=[...kernelSql.matchAll(/^CREATE FUNCTION naijue_erp\.(\w+)\(([^\n]*)\) RETURNS (\w+)$/gm)];
 const signatures=declared.map(m=>m[1]+'('+m[2].split(',').map(v=>v.trim().split(/\s+/).slice(1).join(' ')).join(',')+')');
 need(declared.length===14&&new Set(declared.map(m=>m[1])).size===14&&signatures.every(s=>newSignatures.includes(s)),'EXACT_NEW_ROUTINES');
 // SQL ends a dollar body at its first bare delimiter, regardless of where its
 // semicolon appears. Never let a later '$sr$;' swallow intervening commands.
 const remainder=kernelSql.replace(/^CREATE FUNCTION naijue_erp\.\w+\([^\n]*\) RETURNS \w+\nLANGUAGE [^\n]* AS \$sr\$(?:(?!\$sr\$)[\s\S])*\$sr\$;/gm,'').replace(/^\s*--[^\n]*$/gm,'').trim();
 need(remainder==='','KERNEL_ONLY_ROUTINE_DECLARATIONS');
 need((kernelSql.match(/SECURITY DEFINER/g)||[]).length===2,'EXACT_DEFINER_APIS');
 for(let i=0;i<declared.length;i++){
  const start=declared[i].index+declared[i][0].length+1,end=kernelSql.indexOf(' AS $sr$',start),header=kernelSql.slice(start,end);
  need(/^LANGUAGE (sql|plpgsql)\b/.test(header)&&header.endsWith("SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC'")
   &&header.includes('SECURITY DEFINER')===apis.has(signatures[i]),'EXACT_ROUTINE_SECURITY:'+signatures[i]);
 }
 const changes=[...SOURCE_REVIEW_BATCH_GUARDS.map(n=>prepend(predecessorSql,n,batchBranch(false))),
  ...SOURCE_REVIEW_DEFERRED_BATCH_GUARDS.map(n=>prepend(predecessorSql,n,batchBranch(true)))];
 changes.push(prepend(predecessorSql,'guard_import_record',`  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='SOURCE_REVIEW') THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    PERFORM 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND status IN ('STAGED','VALIDATING') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_CLOSED' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE source_system=NEW.source_system AND source_entity_type=NEW.source_entity_type AND source_key=NEW.source_key) THEN
      RAISE EXCEPTION 'SOURCE_REVIEW_OCCURRENCE_ALREADY_RETAINED' USING ERRCODE='23505'; END IF;
    PERFORM naijue_erp.source_review_record_proof_v1(to_jsonb(NEW),true);
    RETURN NEW;
  END IF;
  IF NEW.decision_reason LIKE '{%"SOURCE_REVIEW_POINTER_V1"%' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_POINTER_WRONG_BATCH' USING ERRCODE='23514'; END IF;
`));
 changes.push(prepend(predecessorSql,'validate_import_source_commit',`  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='SOURCE_REVIEW') THEN
    PERFORM naijue_erp.source_review_record_proof_v1(to_jsonb(NEW),true); RETURN NULL;
  END IF;
`));
 changes.push(prepend(predecessorSql,'validate_import_operation',`  IF NEW.result_data->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN
    PERFORM naijue_erp.source_review_complete_operation_v1(NEW.id); RETURN NULL;
  END IF;
`));
 const receipt=receiptConstraint(predecessorSql);
 const policies=[['import_batch',`inventory_mode<>'SOURCE_REVIEW'`],
  ['import_record',`EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=import_record.import_batch_id AND b.inventory_mode<>'SOURCE_REVIEW')`],
  ['audit_change',`(object_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=audit_change.object_id AND b.inventory_mode<>'SOURCE_REVIEW'))`],
  ['operation_receipt',`(target_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=operation_receipt.target_id AND b.inventory_mode<>'SOURCE_REVIEW'))`]];
 const oldPolicy=`USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());`;
 for(const [table] of policies)need(predecessorSql.includes(`CREATE POLICY "standard_published_runtime" ON "naijue_erp"."${table}" TO "${runtime}" ${oldPolicy}`),'EXACT_OLD_POLICY:'+table);
 const dependencyNames=['standard_import_identity','standard_business_ready','import_source_key_lock','reject_immutable_change'];
 const dependencies=dependencyNames.map(name=>{
  const m=predecessorSql.match(new RegExp('CREATE FUNCTION "naijue_erp"\\."'+name+'"[\\s\\S]*?    AS (\\$[^$]*\\$)([\\s\\S]*?)\\1;'));
  need(m,'REQUIRED_DEPENDENCY:'+name);return {name,sha256:hash(m[2])};
 });
 const checks=`DO $source_review_predecessor$
DECLARE item record;
BEGIN
 IF current_user IS DISTINCT FROM (SELECT r.rolname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='naijue_erp')
  OR (SELECT count(*) FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r')<>35
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152 THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_EXACT_OWNER_35_152_REQUIRED' USING ERRCODE='55000'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($source_review_pins$${JSON.stringify(changes.map(c=>({signature:c.signature,sha256:c.before})))}$source_review_pins$::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(item.value->>'signature')
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=item.value->>'sha256') THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_PREDECESSOR_BODY_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $source_review_predecessor$;`;
 const delta=`${checks}\n${kernelSql}\n${changes.map(c=>c.sql).join('\n\n')}
ALTER TABLE naijue_erp.import_batch ALTER COLUMN cutoff_at DROP NOT NULL;
ALTER TABLE naijue_erp.import_batch DROP CONSTRAINT import_batch_inventory_mode_check;
ALTER TABLE naijue_erp.import_batch ADD CONSTRAINT import_batch_inventory_mode_check CHECK (inventory_mode IN ('CUTOFF_STOCK_BASELINE','DOCUMENT_CONVERSION','SOURCE_REVIEW'));
ALTER TABLE naijue_erp.import_batch ADD CONSTRAINT source_review_mode_cutoff CHECK (
 CASE WHEN inventory_mode='SOURCE_REVIEW' THEN cutoff_at IS NULL AND mapping_version='HISTORICAL_SALES_SOURCE_REVIEW_V1'
  AND status IN ('STAGED','VALIDATING','PASSED') AND completed_at IS NULL AND history_payload_hash IS NULL
  AND history_expected_counts IS NULL AND history_actual_counts IS NULL AND NOT history_validation_passed
 ELSE cutoff_at IS NOT NULL AND mapping_version<>'HISTORICAL_SALES_SOURCE_REVIEW_V1' END IS TRUE);
${receipt.sql}
ALTER TABLE naijue_erp.audit_change ADD CONSTRAINT source_review_audit_shape CHECK (
 CASE WHEN after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN (
  object_type='IMPORT' AND jsonb_typeof(after_values)='object'
  AND after_values ?& ARRAY['profile','phase','request','checkpoint'] AND after_values-ARRAY['profile','phase','request','checkpoint']='{}'::jsonb
  AND after_values->>'phase' IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL')
  AND action=CASE after_values->>'phase' WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END
  AND after_values->'request'->>'protocol'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  AND after_values->'request'->>'operation_id'=operation_id::text AND after_values->'request'->>'batch_id'=object_id::text
 ) IS TRUE ELSE true END);
${policies.map(([table,predicate])=>`ALTER POLICY standard_published_runtime ON naijue_erp.${table} TO ${runtime}
 USING (naijue_erp.standard_business_ready() AND (${predicate}))
 WITH CHECK (naijue_erp.standard_business_ready() AND (${predicate}));`).join('\n')}
${newSignatures.map(signature=>`REVOKE ALL ON FUNCTION naijue_erp.${signature} FROM PUBLIC,${runtime},${initializer},${importer};`).join('\n')}
${[...apis].map(signature=>`GRANT EXECUTE ON FUNCTION naijue_erp.${signature} TO ${importer};`).join('\n')}
`;
 // No alternate ungated patch property/API is emitted. This is a source-review
 // artifact, not permission to remove this rejection or reuse a legacy install.
 const reviewSql=`-- REVIEW ONLY. Requires a separately admitted project-schema successor.\nBEGIN;\nDO $source_review_not_admitted$ BEGIN
 RAISE EXCEPTION 'SOURCE_REVIEW_SCHEMA_SUCCESSOR_NOT_ADMITTED' USING ERRCODE='55000';
END $source_review_not_admitted$;\n${delta}\nCOMMIT;\n`;
 return {reviewSql,changedBodies:changes,manifest:{format:'FRESH35_SOURCE_REVIEW_SOURCE_CANDIDATE_V1',
  predecessorSchemaSha256:SOURCE_REVIEW_PREDECESSOR_SHA256,reviewedDesignSha256:SOURCE_REVIEW_DESIGN_SHA256,
  kernelSha256:hash(kernelSql),reviewSqlSha256:hash(reviewSql),tableCount:35,newTables:0,newColumns:0,
  predecessorRoutineCount:152,newRoutines:14,routineCount:166,permissionsChanged:true,
  routineChanges:changes.map(({signature,before,after})=>({signature,before,after})),
  newRoutineSignatures:newSignatures.map(s=>'naijue_erp.'+s),unchangedDependencies:dependencies,
  columnChanges:[{table:'naijue_erp.import_batch',column:'cutoff_at',beforeNullable:false,afterNullable:true,scope:'NULL_ONLY_FOR_SOURCE_REVIEW'}],
  changedConstraints:['import_batch_inventory_mode_check','receipt_result_by_kind'],newConstraints:['source_review_mode_cutoff','source_review_audit_shape'],
  replacementPolicies:policies.map(([table,predicate])=>({table,policy:'standard_published_runtime',predicate,mode:'REPLACE_EXISTING_NOT_ADD_PERMISSIVE'})),
  newApiExecutes:[...apis].map(signature=>({signature:'naijue_erp.'+signature,grantee:importer})),
  commandTransactionScope:'ISOLATED_TOP_LEVEL_NO_SAVEPOINT',
  capturePhases:['REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL'],resolutionPhase:'EXPLICIT_NOT_IMPLEMENTED',
  sourceOnly:true,engineParsed:false,engineVerified:false,installationReady:false,targetAdmitted:false,
  durableCaptureVerified:false,ordinaryPermissionsExpanded:false,freshBootstrapClosed:false,reprocessingImplemented:false,
  admissionGaps:['INDEPENDENT_SOURCE_AND_FULL_CATALOG_ACL_RLS_REVIEW','EXPLICIT_PROJECT_SCHEMA_SUCCESSOR_ADMISSION',
   'AUTHORIZED_SYNTHETIC_POSTGRES_ENGINE_TESTS_AND_RECONNECT_READBACK','TRUSTED_HOST_EXTERNAL_APPROVAL_AND_RUNTIME_CAPABILITY',
   'FRESH_BOOTSTRAP_PENDING_PARTITION_SUCCESSOR','RESOLUTION_DECISION_AND_ATOMIC_CONVERSION_SUCCESSOR'],
 }};
}
export async function loadFresh35SourceReviewCandidate(root,{predecessorPath}){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleHash,'RUNNING_MODULE_CHANGED');
 const paths=[SOURCE_REVIEW_KERNEL_PATH,'evidence/historical-hall-contract-20261105/source-review-contract.md',
  'packages/application/src/historical-sales-source-review.ts','packages/application/src/unified-historical-sales-source-review.ts',
  'tools/unified-import/source-review-preflight-cli.mjs','evidence/source-review-contract-20261105/WIRE.md',modulePath,'package.json','package-lock.json'];
 const files=await Promise.all(paths.map(async path=>({path,bytes:await readFile(resolve(root,path))})));
 const result=compileFresh35SourceReviewCandidate({predecessorSql:await readFile(predecessorPath,'utf8'),kernelSql:files[0].bytes.toString('utf8'),designText:files[1].bytes.toString('utf8')});
 const collected=new Map(files.map(file=>[file.path,file]));const queue=[...paths];root=resolve(root);
 for(let i=0;i<queue.length;i++){
  const path=queue[i],file=collected.get(path);if(!/\.(?:mjs|js|ts|mts)$/.test(path))continue;
  for(const match of file.bytes.toString('utf8').matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\bimport\s*\()\s*['"](\.[^'"]+)['"]/g)){
   const full=resolve(root,dirname(path),match[1]);need(full.startsWith(root+sep),'SOURCE_IMPORT_OUTSIDE_ROOT');
   const dependency=relative(root,full).split(sep).join('/');if(collected.has(dependency))continue;
   collected.set(dependency,{path:dependency,bytes:await readFile(full)});queue.push(dependency);
  }
 }
 result.manifest.sourcePins=[...collected.values()].map(({path,bytes})=>({path,sha256:hash(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
 result.manifest.relativeSourceImportClosureCollected=true;
 result.manifest.sourceSetSha256=hash(JSON.stringify(result.manifest.sourcePins));return result;
}
