/** The existing 35-table whole-import/runtime successor. No zero Cartesian
 * product, new storage, role grants, transaction wrapper or automatic install. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {loadFresh35SalesHallCandidate} from './fresh35-sales-hall-candidate.mjs';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {loadFresh35HistoricalSettlementDifferenceCandidate} from './fresh35-historical-settlement-difference-candidate.mjs';
import {loadFresh35AdminProvisionCandidate} from './fresh35-admin-provision-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature as normalize} from './fresh35-retirement-source.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),need=(v,c)=>{if(!v)throw Error('FRESH35_BASELINE_SCOPE_'+c);};
const modulePath='scripts/release/unified-install/fresh35-baseline-scope-candidate.mjs',patchPath='adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql';
const loadedHash=hash(await readFile(new URL(import.meta.url)));
const pins={assert_document_migration:'b3896913f7dc67074ac7d5874a5b97b13c14fb006a98049c0023a6bbdf3a8ff5',standard_whole_package_verify_v2:'103dad3f9486c17f315fb627abf0920305ad6c0df7ec23cc8f3f295679f2f5b1',validate_import_accounting_final_record_commit:'7a337f3a2e9b2c961790c6f6a5adbb55850067a765898ce4fa13fce33828a15c',standard_whole_package_command_v2:'071119364504d6a818ea3454514ec139763784f8a914fa5cbc4284fccaaa520b',standard_inventory_key_proof:'687848f69a5ca3e139c35aafc9b9be8c31cd23f9d70a07cb34d4bde9021d7d66',guard_cutoff_ledger:'65cd4ff3d8671651ba21ea9c87e2bbcb8d0d1f9613b50698fae6d953202de939',guard_recorded_live_balance_pair:'891aea0441b73343caf02b249515b757884e760fefc444c644a5f25b74e88d0f',validate_sparse_balance_commit:'b4fcf066b75f334152e997080ce3157c578731bea4fd98366bd93e5e1ff88d64',validate_transfer_effect:'f7296739bc086cc8a7ed293272b1061480ffd3d83c92e40552697fe812f79f1a'};
const role="'erp_unified27_runtime_2393dbc6db9581c2'";
const zero="naijue_erp.standard_inventory_key_proof(NEW.warehouse_id,NEW.sku_id)->>'state'";
function add(spec,body,before,after){need(before&&body.split(before).length===2,'EXACT_ANCHOR_'+spec.signature.split('.')[1].split('(')[0]);spec.replacements.push({before,after});return body.replace(before,()=>after);}
export function generateFresh35BaselineScopePatch(predecessors){
 need(predecessors.length===154,'EXACT154_REQUIRED');const specs=[];
 for(const [name,pin]of Object.entries(pins)){
  const r=predecessors.find(r=>r.signature.includes('.'+name+'('));need(r&&hash(r.body)===pin,'EXACT_PREDECESSOR_'+name);
  const spec={signature:r.signature,predecessor_sha256:pin,replacements:[]};let body=r.body;
  const change=(before,after)=>{body=add(spec,body,before,after);};
  if(name==='assert_document_migration'||name==='standard_whole_package_verify_v2'){
   change("jsonb_array_length(sr_approval->'documents')<>25","(jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'))");
   if(name==='standard_whole_package_verify_v2'){
    change('IF sr_count<>25 THEN',"IF sr_count<>jsonb_array_length(sr_approval->'documents') THEN");
    change('IF sr_rows<>27 THEN',"IF sr_rows<>(CASE jsonb_array_length(sr_approval->'documents') WHEN 24 THEN 26 ELSE 27 END) THEN");
   }
  }else if(name==='validate_import_accounting_final_record_commit'){
   change("THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END)","THEN CASE WHEN proof->'fields'->'inventory_baseline_scope'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN 'FINAL_BASELINE_SCOPE_V1' ELSE 'FINAL_EXPLICIT_KEYS' END ELSE 'FINAL_DOCUMENT_CONVERSION' END)");
  }else if(name==='standard_whole_package_command_v2'){
   const from=body.indexOf("   IF jsonb_typeof(zero_descriptor) IS DISTINCT FROM 'object'"),to=body.indexOf("  END IF;",from),before=body.slice(from,to);
   const baseline=`   IF zero_descriptor->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    IF zero_descriptor-ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals']<>'{}'
     OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals'])
     OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace' OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('sha256','inventory_file_sha256','input_manifest_sha256','registry_sha256') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true))
     OR zero_descriptor->>'registry_sha256' IS DISTINCT FROM payload->>'registry_sha256'
     OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
     OR coalesce(length(btrim(zero_descriptor->>'batch_key')),0)=0
     OR jsonb_typeof(zero_descriptor->'warehouse_totals') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('universe_count','nonzero_count') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'number' OR (v.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT zero_descriptor->k FROM unnest(ARRAY['warehouses','skus','explicit_values']) k LOOP
     IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['sha256','records_sha256','count']<>'{}' OR NOT(item ?& ARRAY['sha256','records_sha256','count'])
      OR (item->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (item->>'records_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
      OR jsonb_typeof(item->'count') IS DISTINCT FROM 'number' OR (item->>'count' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true
     THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_PIN_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF (zero_descriptor->'warehouses'->>'count')::numeric<1 OR (zero_descriptor->'skus'->>'count')::numeric<1
     OR (zero_descriptor->>'universe_count')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric*(zero_descriptor->'skus'->>'count')::numeric
     OR zero_descriptor->'explicit_values'->'count' IS DISTINCT FROM payload->'expected'->'INVENTORY_KEY'
     OR zero_descriptor->'nonzero_count' IS DISTINCT FROM payload->'expected'->'INVENTORY_EFFECT'
     OR jsonb_array_length(zero_descriptor->'warehouse_totals')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
${before}   END IF;
`;
   change(before,baseline);
   change("'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END","'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN CASE WHEN cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN 'FINAL_BASELINE_SCOPE_V1' ELSE 'FINAL_EXPLICIT_KEYS' END ELSE 'FINAL_DOCUMENT_CONVERSION' END");
   const approvalFields="   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');";
   change(approvalFields,approvalFields+"\n   IF phase='BASELINE_SEAL' AND cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN fields:=fields||jsonb_build_object('inventory_baseline_scope',cfg->'explicit_zero_approval'); END IF;");
   // The current24 wire is the externally pinned exact prior economic subset;
   // the original25/27 route and every original per-document check stay intact.
   change("IF jsonb_array_length(sr_approval->'documents')<>25 THEN","IF jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b') THEN");
   change('IF cardinality(sr_rows)<>27 OR NOT sr_used THEN',"IF cardinality(sr_rows)<>(CASE jsonb_array_length(sr_approval->'documents') WHEN 24 THEN 26 ELSE 27 END) OR NOT sr_used THEN");
   change('IF sr_count<>25 OR sr_rows<>27 THEN',"IF sr_count<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 24 ELSE 25 END) OR sr_rows<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 26 ELSE 27 END) THEN");
   // A scope descriptor never authorizes a fabricated explicit source row.
   change("     IF entry ? 'explicit_zero_evidence' THEN",`     IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' AND entry ? 'explicit_zero_evidence' THEN RAISE EXCEPTION 'INVENTORY_SCOPE_REQUIRES_REAL_EXPLICIT_ROWS' USING ERRCODE='23514'; END IF;
     IF entry ? 'explicit_zero_evidence' THEN`);
   const seal="  IF phase='BASELINE_SEAL' THEN\n   IF cfg ? 'explicit_zero_approval' THEN";
   change(seal,`  IF phase='BASELINE_SEAL' THEN
   IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    zero_descriptor:=cfg->'explicit_zero_approval';
    FOR kind IN SELECT unnest(ARRAY['WAREHOUSE','SKU']) LOOP
     SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(format('{"id":"%s"}',src.target_id)||chr(10),'' ORDER BY src.target_id),''),'UTF8')),'hex') INTO n,zero_hash
      FROM naijue_erp.import_record src WHERE src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type=kind;
     item:=zero_descriptor->CASE kind WHEN 'WAREHOUSE' THEN 'warehouses' ELSE 'skus' END;
     IF n IS DISTINCT FROM (item->>'count')::numeric OR zero_hash IS DISTINCT FROM item->>'records_sha256' THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_MEMBERS_DIFFERS' USING ERRCODE='23514'; END IF;
    END LOOP;
    WITH actual AS MATERIALIZED (
     SELECT approved->'fields' AS f FROM naijue_erp.audit_change prior_audit
      CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
      JOIN naijue_erp.import_record src ON src.id=(approved->>'id')::uuid AND src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type='INVENTORY_KEY'
      WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch AND prior_audit.after_values->>'phase'='KEYS'
       AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
    ), totals AS (
     SELECT w.target_id, count(f)::integer explicit_count,count(f) FILTER(WHERE f->>'quantity'<>'0')::integer nonzero_count,coalesce(sum((f->>'quantity')::numeric),0)::text quantity
      FROM naijue_erp.import_record w LEFT JOIN actual ON (f->>'warehouse_id')::uuid=w.target_id
      WHERE w.import_batch_id=batch AND w.status='IMPORTED' AND w.target_type='WAREHOUSE' GROUP BY w.target_id
    )
    SELECT (SELECT count(*) FROM actual),(SELECT count(*) FROM actual WHERE f->>'quantity'<>'0'),
     (SELECT encode(sha256(convert_to(coalesce(string_agg(format('{"warehouse_id":"%s","sku_id":"%s","quantity":"%s"}',f->>'warehouse_id',f->>'sku_id',f->>'quantity')||chr(10),'' ORDER BY f->>'warehouse_id' COLLATE "C",f->>'sku_id' COLLATE "C"),''),'UTF8')),'hex') FROM actual),
     (SELECT jsonb_agg(jsonb_build_object('warehouse_id',target_id,'explicit_count',explicit_count,'nonzero_count',nonzero_count,'quantity',quantity) ORDER BY target_id) FROM totals)
     INTO zero_consumed,zero_unique,zero_hash,actual;
    IF zero_consumed IS DISTINCT FROM (zero_descriptor->'explicit_values'->>'count')::bigint OR zero_unique IS DISTINCT FROM (zero_descriptor->>'nonzero_count')::bigint
     OR zero_hash IS DISTINCT FROM zero_descriptor->'explicit_values'->>'records_sha256' OR actual IS DISTINCT FROM zero_descriptor->'warehouse_totals'
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cfg ? 'explicit_zero_approval' THEN`);
  }else if(name==='standard_inventory_key_proof'){
   change(" IF NOT FOUND THEN RETURN jsonb_build_object('state','UNKNOWN','baseline_batch_id',b.id); END IF;",` IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record approved
    WHERE approved.import_batch_id=b.id AND approved.target_type='IMPORT_BATCH' AND approved.target_id=b.id AND approved.status='IMPORTED' AND approved.source_entity_type='STANDARD_BASELINE_APPROVAL' AND approved.source_key='FINAL_BASELINE_SCOPE_V1')
   AND EXISTS(SELECT 1 FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=warehouse AND
     (EXISTS(SELECT 1 FROM naijue_erp.import_record src WHERE src.import_batch_id=b.id AND src.status='IMPORTED' AND src.target_type='WAREHOUSE' AND src.target_id=w.id)
      OR naijue_erp.native_creation_operation_valid('WAREHOUSE',w.id,w.created_operation_id)))
   AND EXISTS(SELECT 1 FROM naijue_erp.sku k JOIN naijue_erp.product p ON p.id=k.product_id JOIN naijue_erp.color c ON c.id=k.color_id JOIN naijue_erp.fit f ON f.id=k.fit_id JOIN naijue_erp.size z ON z.id=k.size_id
     JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=k.size_id WHERE k.id=sku AND
      (EXISTS(SELECT 1 FROM naijue_erp.import_record src WHERE src.import_batch_id=b.id AND src.status='IMPORTED' AND src.target_type='SKU' AND src.target_id=k.id)
       OR naijue_erp.native_creation_operation_valid('SKU',k.id,k.created_operation_id)))
  THEN RETURN jsonb_build_object('state','EXPLICIT_ZERO','basis','PUBLISHED_BASELINE_SCOPE_OR_NATIVE_CREATION','baseline_batch_id',b.id); END IF;
  RETURN jsonb_build_object('state','UNKNOWN','baseline_batch_id',b.id);
 END IF;`);
  }else if(name==='guard_cutoff_ledger'){
   change('OR NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance balance_row WHERE balance_row.warehouse_id=NEW.warehouse_id AND balance_row.sku_id=NEW.sku_id) THEN',`OR (NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance balance_row WHERE balance_row.warehouse_id=NEW.warehouse_id AND balance_row.sku_id=NEW.sku_id)
        AND (${zero} IS DISTINCT FROM 'EXPLICIT_ZERO' OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id))) THEN`);
  }else if(name==='guard_recorded_live_balance_pair'){
   change('    IF NOT FOUND OR NEW.quantity_before IS DISTINCT FROM current_quantity THEN',`    IF NOT FOUND THEN
      IF ${zero} IS DISTINCT FROM 'EXPLICIT_ZERO' OR NEW.quantity_before<>0
       OR (NEW.event_kind<>'APPROVE' AND NEW.baseline_anchor_operation_id IS NULL) OR NEW.reverses_entry_id IS NOT NULL
       OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id)
      THEN RAISE EXCEPTION 'STANDARD_FIRST_SCOPE_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;
    ELSIF NEW.quantity_before IS DISTINCT FROM current_quantity THEN`);
  }else if(name==='validate_sparse_balance_commit'){
   change("    RAISE EXCEPTION 'STANDARD_MISSING_BALANCE_IS_UNKNOWN' USING ERRCODE='23514';",`    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id;
    IF ${zero} IS DISTINCT FROM 'EXPLICIT_ZERO' OR r.target_type NOT IN ('SALES','TRANSFER') OR r.action NOT IN ('APPROVE','UNAPPROVE') OR r.status<>'COMMITTED'
    THEN RAISE EXCEPTION 'STANDARD_FIRST_SCOPE_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT coalesce(sum(l.quantity_delta::numeric),0),count(*) INTO total,effects FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id AND l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id;
    SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
    IF effects=0 OR final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    THEN RAISE EXCEPTION 'STANDARD_FIRST_SCOPE_REAL_EFFECT_DIFFERS' USING ERRCODE='23514'; END IF;
    RETURN NULL;`);
  }else if(name==='validate_transfer_effect'){
   change("      RAISE EXCEPTION 'STANDARD_MISSING_BALANCE_IS_UNKNOWN' USING ERRCODE='23514';",`      IF ${zero} IS DISTINCT FROM 'EXPLICIT_ZERO' THEN RAISE EXCEPTION 'STANDARD_FIRST_SCOPE_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;`);
   change('OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id)',`OR (CASE WHEN current_user=${role} THEN ${zero} IS DISTINCT FROM 'EXPLICIT_ZERO' ELSE NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) END)`);
  }
  spec.successor_sha256=hash(body);specs.push(spec);
 }
 const patchSql=`-- Same35 baseline+scope successor of SQL36; SQL37 per-zero successor is not required.
BEGIN;
DO $baseline_scope_patch$
DECLARE specs jsonb:=$baseline_scope_changes$${JSON.stringify(specs)}$baseline_scope_changes$;
 spec jsonb; change jsonb; routine regprocedure; before_body text; after_body text; definition text; before_meta jsonb; after_meta jsonb;
BEGIN
 FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
  routine:=to_regprocedure(spec->>'signature');
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO before_body,before_meta FROM pg_proc p WHERE p.oid=routine;
  IF before_body IS NULL OR encode(sha256(convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
   OR (before_meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
  THEN RAISE EXCEPTION 'BASELINE_SCOPE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
  definition:=pg_get_functiondef(routine);after_body:=before_body;
  FOR change IN SELECT value FROM jsonb_array_elements(spec->'replacements') LOOP
   IF length(change->>'before')=0 OR (length(after_body)-length(replace(after_body,change->>'before','')))/length(change->>'before')<>1
    OR (length(definition)-length(replace(definition,change->>'before','')))/length(change->>'before')<>1
   THEN RAISE EXCEPTION 'BASELINE_SCOPE_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
   after_body:=replace(after_body,change->>'before',change->>'after');definition:=replace(definition,change->>'before',change->>'after');
  END LOOP;
  IF encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256' THEN RAISE EXCEPTION 'BASELINE_SCOPE_BODY_DIFFERS' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO after_body,after_meta FROM pg_proc p WHERE p.oid=routine;
  IF before_meta IS DISTINCT FROM after_meta OR encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
  THEN RAISE EXCEPTION 'BASELINE_SCOPE_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $baseline_scope_patch$;
COMMIT;
`;
 return {patchSql,specs};
}
export function compileFresh35BaselineScopeCandidate(predecessors,patchSql){
 const generated=generateFresh35BaselineScopePatch(predecessors);need(patchSql===generated.patchSql,'EXACT_GENERATED_PATCH_REQUIRED');
 const changedBodies=generated.specs.map(spec=>{const r=predecessors.find(r=>normalize(r.signature)===normalize(spec.signature));const body=applyRetirementSourceReplacement(r.body,spec);return {signature:r.signature,body,sha256:hash(body)};});
 return {patchSql,reviewSql:patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $baseline_review_only$ BEGIN RAISE EXCEPTION 'BASELINE_SCOPE_REVIEW_ONLY'; END $baseline_review_only$;"),specs:generated.specs,changedBodies,newRoutines:[],predecessorBodies:predecessors.filter(r=>changedBodies.some(c=>c.signature===r.signature)),manifest:{format:'FRESH35_INVENTORY_BASELINE_SCOPE_SOURCE_V1',patchSqlSha256:hash(patchSql),tableCount:35,newTables:0,newColumns:0,newRoutines:0,routineCount:154,permissionChanges:[],permissionsChanged:false,tablePrivilegesChanged:false,columnChanges:[],constraintChanges:[],triggerChanges:[],routineChanges:generated.specs.map(s=>({signature:s.signature,before:s.predecessor_sha256,after:s.successor_sha256})),successorRoutinePins:predecessors.map(r=>({signature:r.signature,sha256:changedBodies.find(c=>c.signature===r.signature)?.sha256??r.sha256})),sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false}};
}
export async function loadFresh35BaselineScopePredecessors(root){
 const base=await loadFresh35RetirementPlan(root),routines=new Map(base.retainedRoutines.map(r=>[normalize(r.signature),r]));let parent;
 for(const load of [loadFresh35SalesHallCandidate,loadFresh35HistoricalAmountCandidate,loadFresh35HistoricalSettlementCandidate,loadFresh35HistoricalSettlementDifferenceCandidate,loadFresh35AdminProvisionCandidate]){parent=await load(root);for(const r of [...parent.changedBodies,...(parent.newRoutines??[])])routines.set(normalize(r.signature),r);}
 return {routines:[...routines.values()],parent};
}
export async function loadFresh35BaselineScopeCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedHash,'RUNNING_MODULE_SOURCE_DIFFERS');const {routines,parent}=await loadFresh35BaselineScopePredecessors(root),candidate=compileFresh35BaselineScopeCandidate(routines,await readFile(resolve(root,patchPath),'utf8'));
 const sourcePins=new Map(parent.manifest.sourcePins.map(p=>[p.path,p]));for(const path of [modulePath,patchPath])sourcePins.set(path,{path,sha256:hash(await readFile(resolve(root,path)))});
 candidate.manifest.sourcePins=[...sourcePins.values()].sort((a,b)=>a.path.localeCompare(b.path));candidate.manifest.predecessorSourceSetSha256=parent.manifest.sourceSetSha256;candidate.manifest.sourceSetSha256=hash(JSON.stringify(candidate.manifest.sourcePins));return candidate;
}
