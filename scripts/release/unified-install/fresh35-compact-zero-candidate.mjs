/** One finite post-admin154 source successor. Compiles source only; never
 * installs SQL, issues execution authority or relabels an existing record. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {loadFresh35SalesHallCandidate} from './fresh35-sales-hall-candidate.mjs';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {loadFresh35HistoricalSettlementDifferenceCandidate} from './fresh35-historical-settlement-difference-candidate.mjs';
import {loadFresh35AdminProvisionCandidate} from './fresh35-admin-provision-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature as normalize,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),need=(v,c)=>{if(!v)throw Error('FRESH35_COMPACT_ZERO_'+c);};
const modulePath='scripts/release/unified-install/fresh35-compact-zero-candidate.mjs',patchPath='adapters/postgres/patches/0037_compact_zero_scope_successor.sql';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const COMPACT_ZERO_PREDECESSOR_BODY_SHA256='071119364504d6a818ea3454514ec139763784f8a914fa5cbc4284fccaaa520b';
export function compileFresh35CompactZeroCandidate(predecessors,patchSql,explicitZeroPatchSql){
 need(Array.isArray(predecessors)&&predecessors.length===154&&new Set(predecessors.map(r=>normalize(r.signature))).size===154,'EXACT154_REQUIRED');
 const parts=patchSql.split('$compact_zero_changes$');need(parts.length===3,'EXACT_PATCH_PAYLOAD_REQUIRED');const spec=JSON.parse(parts[1]);
 need(normalize(spec.signature)===normalize('naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)')&&spec.predecessor_sha256===COMPACT_ZERO_PREDECESSOR_BODY_SHA256&&spec.replacements.length===2,'EXACT_ROUTINE_AND_PREDECESSOR_REQUIRED');
 const previous=predecessors.find(r=>normalize(r.signature)===normalize(spec.signature));need(previous&&hash(previous.body)===spec.predecessor_sha256,'EXACT_PREDECESSOR_REQUIRED');
 need(typeof explicitZeroPatchSql==='string'&&generateFresh35CompactZeroPatch(previous,explicitZeroPatchSql).patchSql===patchSql,'EXACT_GENERATED_PATCH_REQUIRED');
 const body=applyRetirementSourceReplacement(previous.body,spec);need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');
 const stripped=patchSql.replace(/^--.*$/gm,'');need(!/\b(?:CREATE\s+(?:TABLE|FUNCTION|ROLE|INDEX)|ALTER\s+(?:TABLE|ROLE)|GRANT|REVOKE|DISABLE TRIGGER|DROP|TRUNCATE|DELETE FROM)\b/i.test(stripped),'UNEXPECTED_SCHEMA_OR_PRIVILEGE_CHANGE');
 need(patchSql.includes('before_meta IS DISTINCT FROM after_meta')&&(patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'ATOMIC_METADATA_PRESERVATION_REQUIRED');
 const changedBodies=[{signature:previous.signature,body,sha256:hash(body)}],routineChanges=[{signature:previous.signature,before:spec.predecessor_sha256,after:spec.successor_sha256}];
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $compact_zero_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_COMPACT_ZERO_REVIEW_ONLY' USING ERRCODE='55000'; END $compact_zero_review_only$;");
 return {patchSql,reviewSql,specs:[spec],changedBodies,newRoutines:[],predecessorBodies:[previous],manifest:{format:'FRESH35_COMPACT_ZERO_SOURCE_CANDIDATE_V2',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),tableCount:35,newTables:0,newColumns:0,newRoutines:0,routineCount:154,predecessorRoutineCount:154,routineChanges,permissionChanges:[],permissionsChanged:false,tablePrivilegesChanged:false,columnChanges:[],constraintChanges:[],triggerChanges:[],successorRoutinePins:predecessors.map(r=>({signature:r.signature,sha256:normalize(r.signature)===normalize(previous.signature)?hash(body):r.sha256})),sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,installationRecordHandling:'PRESERVE_ADMIN154_RECORD; REQUIRE_DISTINCT_COMPACT_ZERO_SUCCESSOR_RECORD_AND_AUTHORITY'}};
}
export async function loadFresh35CompactZeroCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');const base=await loadFresh35RetirementPlan(root),routines=new Map(base.retainedRoutines.map(r=>[normalize(r.signature),r]));let parent;
 for(const load of [loadFresh35SalesHallCandidate,loadFresh35HistoricalAmountCandidate,loadFresh35HistoricalSettlementCandidate,loadFresh35HistoricalSettlementDifferenceCandidate,loadFresh35AdminProvisionCandidate]){parent=await load(root);for(const r of [...parent.changedBodies,...(parent.newRoutines??[])])routines.set(normalize(r.signature),r);}
 const candidate=compileFresh35CompactZeroCandidate([...routines.values()],await readFile(resolve(root,patchPath),'utf8'),await readFile(resolve(root,'adapters/postgres/patches/0027_explicit_zero_evidence_successor.sql'),'utf8')),pins=new Map(parent.manifest.sourcePins.map(p=>[p.path,p]));for(const path of [modulePath,patchPath])pins.set(path,{path,sha256:hash(await readFile(resolve(root,path)))});
 candidate.manifest.sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));candidate.manifest.predecessorSourceSetSha256=parent.manifest.sourceSetSha256;candidate.manifest.sourceSetSha256=hash(JSON.stringify(candidate.manifest.sourcePins));return candidate;
}

/** Pure deterministic SQL source generation. Callback replacements preserve SQL\n * regex literals containing a dollar followed by a quote without JS expansion. */
export function generateFresh35CompactZeroPatch(routine,explicitZeroPatchSql){
 need(routine&&hash(routine.body)===COMPACT_ZERO_PREDECESSOR_BODY_SHA256,'EXACT_GENERATOR_PREDECESSOR_REQUIRED');
const old=JSON.parse(explicitZeroPatchSql.split('$explicit_zero_changes$')[1]);
const initOld=old.replacements.find(r=>r.after.includes('EXPLICIT_ZERO_DESCRIPTOR_INVALID')).after;
const initBefore=initOld.slice(initOld.indexOf("  IF payload ? 'explicit_zero_approval'"),initOld.lastIndexOf('  -- SQL49:'));
const initV2=`   IF zero_descriptor->>'format_version'='EXPLICIT_ZERO_SCOPE_MERKLE_V2' THEN
    IF zero_descriptor-ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','unknown_mask','universe_count','explicit_confirmed_count','explicit_unknown_overlap_count']<>'{}'
     OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','unknown_mask','universe_count','explicit_confirmed_count','explicit_unknown_overlap_count'])
     OR octet_length(convert_to(zero_descriptor::text,'UTF8'))>4096
     OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace'
     OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
     OR octet_length(convert_to(zero_descriptor->>'source_namespace','UTF8')) NOT BETWEEN 1 AND 256
     OR octet_length(convert_to(zero_descriptor->>'batch_key','UTF8')) NOT BETWEEN 1 AND 128
     OR zero_descriptor->>'batch_key'<>btrim(zero_descriptor->>'batch_key')
     OR zero_descriptor->>'batch_key' ~ '[[:cntrl:]]'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) e WHERE e.key IN ('format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','merkle_root_sha256','batch_key','input_manifest_sha256','registry_sha256') AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['sha256','inventory_file_sha256','merkle_root_sha256','input_manifest_sha256','registry_sha256']) k WHERE (zero_descriptor->>k ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
     OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['record_count','universe_count','explicit_confirmed_count','explicit_unknown_overlap_count']) k WHERE jsonb_typeof(zero_descriptor->k) IS DISTINCT FROM 'number' OR (zero_descriptor->>k ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true)
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
    FOR zero_fact IN SELECT zero_descriptor->k FROM unnest(ARRAY['warehouses','skus','explicit_values','unknown_mask']) k LOOP
     IF jsonb_typeof(zero_fact) IS DISTINCT FROM 'object' OR zero_fact-ARRAY['sha256','records_sha256','count']<>'{}'
      OR NOT(zero_fact ?& ARRAY['sha256','records_sha256','count'])
      OR jsonb_typeof(zero_fact->'sha256') IS DISTINCT FROM 'string' OR jsonb_typeof(zero_fact->'records_sha256') IS DISTINCT FROM 'string'
      OR (zero_fact->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (zero_fact->>'records_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
      OR jsonb_typeof(zero_fact->'count') IS DISTINCT FROM 'number' OR (zero_fact->>'count' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true
     THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_PIN_INVALID' USING ERRCODE='23514'; END IF;
     IF (zero_fact->>'count')::numeric>5000000 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_COUNT_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF (zero_descriptor->>'record_count')::numeric NOT BETWEEN 1 AND 5000000
     OR (zero_descriptor->>'universe_count')::numeric NOT BETWEEN 1 AND 5000000
     OR (zero_descriptor->'warehouses'->>'count')::numeric<1 OR (zero_descriptor->'skus'->>'count')::numeric<1
     OR (zero_descriptor->>'universe_count')::numeric<>(zero_descriptor->'warehouses'->>'count')::numeric*(zero_descriptor->'skus'->>'count')::numeric
     OR (zero_descriptor->'unknown_mask'->>'count')::numeric<>0 OR (zero_descriptor->>'explicit_unknown_overlap_count')::numeric<>0
     OR (zero_descriptor->>'explicit_confirmed_count')::numeric<>(zero_descriptor->'explicit_values'->>'count')::numeric
     OR (zero_descriptor->>'universe_count')::numeric<>(zero_descriptor->>'record_count')::numeric+(zero_descriptor->>'explicit_confirmed_count')::numeric
     OR (zero_descriptor->>'universe_count')::numeric IS DISTINCT FROM (payload->'expected'->>'INVENTORY_KEY')::numeric
     OR (zero_descriptor->'warehouses'->>'count')::numeric IS DISTINCT FROM (payload->'expected_master_counts'->>'WAREHOUSE')::numeric
     OR (zero_descriptor->'skus'->>'count')::numeric IS DISTINCT FROM (payload->'expected_master_counts'->>'SKU')::numeric
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_PARTITION_OR_MASTERS_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
`;
let initAfter=initBefore.replace("   zero_descriptor:=payload->'explicit_zero_approval';", ()=>"   zero_descriptor:=payload->'explicit_zero_approval';\n"+initV2);
const last=initAfter.lastIndexOf('  END IF;');initAfter=initAfter.slice(0,last)+'   END IF;\n'+initAfter.slice(last);
const keysOld=old.replacements.find(r=>r.after.includes('EXPLICIT_ZERO_EVIDENCE_INVALID')).after;
const keyBefore=keysOld.slice(keysOld.indexOf("     IF entry ? 'explicit_zero_evidence'"));
const keyV2=`      IF zero_descriptor->>'format_version'='EXPLICIT_ZERO_SCOPE_MERKLE_V2' THEN
       IF jsonb_typeof(zero_evidence) IS DISTINCT FROM 'object'
        OR zero_evidence-ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof']<>'{}'
        OR NOT(zero_evidence ?& ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])
        OR zero_evidence->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_ABSENCE_V2' OR fields->>'quantity' IS DISTINCT FROM '0'
        OR zero_evidence->>'inventory_file_sha256' IS DISTINCT FROM zero_descriptor->>'inventory_file_sha256'
        OR zero_evidence->>'cutoff_at' IS DISTINCT FROM zero_descriptor->>'cutoff_at'
        OR zero_evidence->>'approval_sha256' IS DISTINCT FROM zero_descriptor->>'sha256'
        OR jsonb_typeof(zero_evidence->'approval_row') IS DISTINCT FROM 'number' OR (zero_evidence->>'approval_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
        OR jsonb_typeof(zero_evidence->'approval_line') IS DISTINCT FROM 'string'
        OR octet_length(convert_to(zero_evidence->>'approval_line','UTF8')) NOT BETWEEN 1 AND 1024
        OR strpos(zero_evidence->>'approval_line',chr(10))>0 OR strpos(zero_evidence->>'approval_line',chr(13))>0
        OR left(zero_evidence->>'approval_line',1)=chr(65279)
        OR (zero_evidence->>'approval_line' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
        OR jsonb_typeof(zero_evidence->'merkle_proof') IS DISTINCT FROM 'array'
       THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_EVIDENCE_INVALID' USING ERRCODE='23514'; END IF;
       IF (zero_evidence->>'approval_row')::numeric>(zero_descriptor->>'record_count')::numeric
        OR jsonb_array_length(zero_evidence->'merkle_proof')>23
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(zero_evidence->'merkle_proof') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string' OR (s#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
        OR entry->'source_refs' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('file_sha256',zero_descriptor->>'sha256','sheet',NULL,'row',1))
       THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_PROOF_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
       zero_fact:=(zero_evidence->>'approval_line')::jsonb;
       IF zero_fact IS DISTINCT FROM jsonb_build_object('format_version','EXPLICIT_ZERO_SCOPE_FACT_V2','source_namespace',request->>'namespace',
        'batch_key',zero_descriptor->>'batch_key','approval_sha256',zero_descriptor->>'sha256',
        'inventory_file_sha256',zero_descriptor->>'inventory_file_sha256','cutoff_at',request->>'cutoff_at','source_key',source_key,
        'warehouse_id',fields->>'warehouse_id','sku_id',fields->>'sku_id','quantity','0','decision','CONFIRMED_ABSENT_IS_ZERO')
        OR source_key IS DISTINCT FROM 'zero:v2:'||(fields->>'warehouse_id')||':'||(fields->>'sku_id')
       THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_FACT_DIFFERS' USING ERRCODE='23514'; END IF;
       zero_index:=(zero_evidence->>'approval_row')::integer-1;zero_width:=(zero_descriptor->>'record_count')::integer;
       zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_LEAF_V2'||chr(10)||(zero_index+1)::text||chr(10)||(zero_evidence->>'approval_line'),'UTF8')),'hex');
       FOR zero_sibling IN SELECT value FROM jsonb_array_elements_text(zero_evidence->'merkle_proof') LOOP
        IF zero_width<=1 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_PROOF_DEPTH_INVALID' USING ERRCODE='23514'; END IF;
        IF mod(zero_index,2)=0 THEN
         IF zero_index+1>=zero_width AND zero_sibling IS DISTINCT FROM zero_hash THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_ODD_SIBLING' USING ERRCODE='23514'; END IF;
         zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V2'||chr(10)||zero_hash||chr(10)||zero_sibling,'UTF8')),'hex');
        ELSE zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V2'||chr(10)||zero_sibling||chr(10)||zero_hash,'UTF8')),'hex'); END IF;
        zero_index:=zero_index/2;zero_width:=(zero_width+1)/2;
       END LOOP;
       IF zero_width<>1 OR zero_hash IS DISTINCT FROM zero_descriptor->>'merkle_root_sha256' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_SCOPE_MEMBERSHIP_INVALID' USING ERRCODE='23514'; END IF;
      ELSE
`;
let keyAfter=keyBefore.replace("      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';",()=>"      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';\n"+keyV2);
const tail=keyAfter.lastIndexOf('     END IF;');keyAfter=keyAfter.slice(0,tail)+'      END IF;\n'+keyAfter.slice(tail);
const replacements=[{before:initBefore,after:initAfter},{before:keyBefore,after:keyAfter}];let after=routine.body;
for(const r of replacements){if(after.split(r.before).length!==2)throw Error('EXACT_ANCHOR');after=after.replace(r.before,()=>r.after);}
const spec={signature:routine.signature,predecessor_sha256:hash(routine.body),successor_sha256:hash(after),replacements};
const template=explicitZeroPatchSql;
let sql=template.replace(/^--[\s\S]*?BEGIN;/,'-- Compact V2 zero scope, streamed to the original per-key audit/import path.\n-- SOURCE ONLY; exact 154 predecessor, unchanged 35 tables and privileges.\nBEGIN;');
const parts=sql.split('$explicit_zero_changes$');sql=parts[0]+'$compact_zero_changes$'+JSON.stringify(spec)+'$compact_zero_changes$'+parts[2];sql=sql.replaceAll('$explicit_zero_profile$','$compact_zero_profile$').replaceAll('EXPLICIT_ZERO_PREDECESSOR_DIFFERS','COMPACT_ZERO_PREDECESSOR_DIFFERS');
 return {patchSql:sql,spec};
}
