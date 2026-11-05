import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileFresh35SourceReviewCandidate,loadFresh35SourceReviewCandidate,SOURCE_REVIEW_BATCH_GUARDS,SOURCE_REVIEW_DEFERRED_BATCH_GUARDS} from '../scripts/release/unified-install/fresh35-source-review-candidate.mjs';
import {readSourceReviewApproval,sourceReviewCaptureRecords,sourceReviewRecordId,sourceReviewApprovalSegments} from '../packages/application/src/unified-historical-sales-source-review.ts';
const root=new URL('..',import.meta.url).pathname;
const predecessorPath='/workspace/shared/fresh35-install-review-plan-20261105-r2/01-schema-REVIEW-ONLY.sql';
const predecessorSql=await readFile(predecessorPath,'utf8');
const kernelSql=await readFile(new URL('../adapters/postgres/patches/0035_source_review_kernel_candidate.sql',import.meta.url),'utf8');
const designText=await readFile(new URL('../evidence/historical-hall-contract-20261105/source-review-contract.md',import.meta.url),'utf8');
const input={predecessorSql,kernelSql,designText};const c=compileFresh35SourceReviewCandidate(input);
const h=value=>createHash('sha256').update(value).digest('hex');
const body=name=>{const pattern=new RegExp('CREATE FUNCTION naijue_erp\\.'+name+'\\([\\s\\S]*? AS \\$sr\\$([\\s\\S]*?)\\$sr\\$;');const m=kernelSql.match(pattern);assert.ok(m,name);return m[1];};
test('new successor is review only, 35 tables / 166 routines, and cannot be substituted for old evidence',()=>{
 assert.deepEqual([c.manifest.tableCount,c.manifest.newTables,c.manifest.newColumns,c.manifest.predecessorRoutineCount,c.manifest.newRoutines,c.manifest.routineCount],[35,0,0,152,14,166]);
 assert.equal(c.manifest.permissionsChanged,true);assert.equal(c.manifest.ordinaryPermissionsExpanded,false);
 for(const field of ['engineParsed','engineVerified','installationReady','targetAdmitted','durableCaptureVerified','freshBootstrapClosed','reprocessingImplemented'])assert.equal(c.manifest[field],false);
 assert.match(c.reviewSql,/BEGIN;\nDO \$source_review_not_admitted\$ BEGIN\n RAISE EXCEPTION 'SOURCE_REVIEW_SCHEMA_SUCCESSOR_NOT_ADMITTED'/);
 assert.ok(c.reviewSql.indexOf('RAISE EXCEPTION')<c.reviewSql.indexOf('CREATE FUNCTION'));
 assert.equal('patchSql' in c,false);assert.equal('transactionBody' in c,false);
 assert.equal(c.manifest.reviewSqlSha256,h(c.reviewSql));
});
test('source compilation requires exact independently pinned r2 and reviewed design',()=>{
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,predecessorSql:predecessorSql+'\n'}),/EXACT_R2_REQUIRED/);
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,designText:designText+'\n'}),/REVIEWED_DESIGN_REQUIRED/);
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:kernelSql+'\nCREATE TABLE bad(x text);'}),/KERNEL_SCOPE/);
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:kernelSql+'\nCOMMIT;\nBEGIN;'}),/KERNEL_ONLY_ROUTINE_DECLARATIONS/);
 const escaped=kernelSql.replace('END $sr$;',"END $sr$\n;\nCOMMIT;\nDO $outside$ BEGIN RAISE NOTICE 'OUTSIDE_REVIEW_TRANSACTION'; END $outside$;");
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:escaped}),/KERNEL_ONLY_ROUTINE_DECLARATIONS/);
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:kernelSql.replace('SECURITY DEFINER','SECURITY INVOKER')}),/EXACT_DEFINER_APIS/);
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:kernelSql.replace('source_review_keys_v1(value jsonb, keys text[])','source_review_keys_v1(value jsonb, keys text)')}),/EXACT_NEW_ROUTINES/);
 const movedDefiner=kernelSql.replace('LANGUAGE plpgsql SET','LANGUAGE plpgsql SECURITY DEFINER SET');
 const commandStart=movedDefiner.indexOf('CREATE FUNCTION naijue_erp.source_review_command_v1');
 assert.throws(()=>compileFresh35SourceReviewCandidate({...input,kernelSql:movedDefiner.slice(0,commandStart)+movedDefiner.slice(commandStart).replace('SECURITY DEFINER','SECURITY INVOKER')}),/EXACT_ROUTINE_SECURITY/);
});
test('all thirteen old routine bodies survive byte-for-byte after removing their sole new prefix',()=>{
 assert.equal(c.changedBodies.length,13);
 for(const r of c.changedBodies){const pivot='\nBEGIN\n';const index=r.predecessorBody.indexOf(pivot)+pivot.length;
  assert.ok(index>=pivot.length);assert.ok(r.successorBody.startsWith(r.predecessorBody.slice(0,index)));
  assert.ok(r.successorBody.endsWith(r.predecessorBody.slice(index)),r.signature);
  assert.equal(h(r.predecessorBody),r.before);assert.equal(h(r.successorBody),r.after);
 }
 for(const name of [...SOURCE_REVIEW_BATCH_GUARDS,...SOURCE_REVIEW_DEFERRED_BATCH_GUARDS]){
  const r=c.changedBodies.find(r=>r.signature==='naijue_erp.'+name+'()');assert.ok(r);
  assert.match(r.successorBody,/PERFORM naijue_erp.source_review_transition_v1/);
  assert.match(r.successorBody,/SOURCE_REVIEW_MODE_IMMUTABLE/);
 }
 assert.ok(!c.changedBodies.some(r=>/guard_unified_document|whole_package_command/.test(r.signature)));
});
test('four effective runtime policies are replaced with positive visible-parent predicates, never added',()=>{
 assert.equal((c.reviewSql.match(/^ALTER POLICY /gm)||[]).length,4);assert.equal((c.reviewSql.match(/^CREATE POLICY /gm)||[]).length,0);
 for(const p of c.manifest.replacementPolicies){assert.equal(p.mode,'REPLACE_EXISTING_NOT_ADD_PERMISSIVE');assert.doesNotMatch(p.predicate,/NOT EXISTS/);
  if(p.table!=='import_batch')assert.match(p.predicate,/EXISTS\(SELECT 1 FROM naijue_erp.import_batch b WHERE/);
  assert.doesNotMatch(p.predicate,/profile/);
 }
 for(const p of c.manifest.replacementPolicies){const sql=c.reviewSql.slice(c.reviewSql.indexOf('ALTER POLICY standard_published_runtime ON naijue_erp.'+p.table));assert.match(sql.slice(0,sql.indexOf(';')+1),/WITH CHECK \(naijue_erp.standard_business_ready\(\) AND/);}
});
test('only command/read are SECURITY DEFINER and only exact protected IMPORTER executes are proposed',()=>{
 assert.equal((kernelSql.match(/SECURITY DEFINER/g)||[]).length,2);
 assert.equal((kernelSql.match(/SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC'/g)||[]).length,14);
 const grants=c.reviewSql.split('\n').filter(l=>l.startsWith('GRANT '));assert.equal(grants.length,2);
 for(const line of grants)assert.match(line,/GRANT EXECUTE ON FUNCTION naijue_erp.source_review_(command|read)_v1\(jsonb,text\) TO erp_unified27_importer_2393dbc6db9581c2;/);
 assert.equal((c.reviewSql.match(/^REVOKE ALL ON FUNCTION naijue_erp\.source_review_/gm)||[]).length,14);
 for(const name of ['source_review_command_v1','source_review_read_v1'])assert.match(body(name),/actor:=naijue_erp.standard_import_identity\(session_token,'IMPORTER'\)/);
 assert.doesNotMatch(kernelSql,/request->>'actor|payload->>'actor|request->>'session/);
});
test('cutoff remains nonnull for both ordinary modes and quarantine has no ordinary writer',()=>{
 assert.match(c.reviewSql,/WHEN inventory_mode='SOURCE_REVIEW' THEN cutoff_at IS NULL/);
 assert.match(c.reviewSql,/ELSE cutoff_at IS NOT NULL AND mapping_version<>'HISTORICAL_SALES_SOURCE_REVIEW_V1'/);
 assert.doesNotMatch(kernelSql,/INSERT INTO naijue_erp\.(sales_header|sales_line|sales_settlement|warehouse|hall|staff|inventory_ledger|inventory_balance)/);
 assert.match(body('source_review_command_v1'),/NULL,NULL,'QUARANTINED'/);
 assert.match(body('source_review_command_v1'),/'HISTORICAL_SALES_SOURCE_REVIEW_V1','SOURCE_REVIEW','STAGED'/);
 assert.match(body('source_review_record_proof_v1'),/source_row->'reviewed_at' IS DISTINCT FROM 'null'::jsonb/);
 assert.doesNotMatch(c.reviewSql,/ALTER TABLE naijue_erp\.sales_header/);
});
test('approval bytes are retained contiguously with canonical base64, complete hash and unique JSON keys',()=>{
 const a=body('source_review_approval_v1');assert.match(a,/ORDER BY new_version/);assert.match(a,/offset'\)::integer<>octet_length\(bytes\)/);
 assert.match(a,/bytes:=bytes\|\|part/);assert.match(a,/encode\(sha256\(bytes\),'hex'\) IS DISTINCT FROM stage->>'approval_sha256'/);
 assert.match(a,/convert_from\(bytes,'UTF8'\)/);assert.match(a,/IS JSON OBJECT WITH UNIQUE KEYS/);
 const cmd=body('source_review_command_v1');assert.ok(cmd.indexOf('approved:=naijue_erp.source_review_approval_v1(batch)')<cmd.indexOf("IF phase='REVIEW_CAPTURE' THEN"));
 assert.match(cmd,/SOURCE_REVIEW_APPROVAL_DECLARED_SET_DIFFERS/);
});
test('raw source hash uses exact retained UTF8, never jsonb reserialization, and pointer read is bounded',()=>{
 const proof=body('source_review_wrapper_v1');assert.match(proof,/sha256\(convert_to\(item->>'source_hash_preimage','UTF8'\)\)/);
 assert.match(proof,/\(item->>'source_hash_preimage'\)::jsonb IS DISTINCT FROM tuple/);
 assert.match(proof,/IS JSON ARRAY WITH UNIQUE KEYS/);
 assert.doesNotMatch(proof,/sha256\(convert_to\(.*::text/);
 const read=body('source_review_read_v1');assert.match(read,/WITH page AS MATERIALIZED/);assert.match(read,/LIMIT \(request->>'limit'\)::integer/);
 assert.doesNotMatch(read,/source_review_approval_v1|jsonb_array_elements/);
 assert.match(body('source_review_record_proof_v1'),/->'records'->\(pointer->>'recordOrdinal'\)::integer/);
});
test('SQL preserves semantic integer coordinates while matching app raw-shape and UTF16 boundaries',()=>{
 const source=body('source_review_source_v1');
 assert.match(source,/source_review_utf16_length_v1\(source->>'source_key'\)>65536/);
 assert.match(source,/cell.key IN \('__proto__','prototype','constructor'\)/);
 assert.match(source,/count\(\*\) FROM jsonb_object_keys\(cells\)\)>2048/);
 assert.match(source,/source_review_utf16_length_v1\(cell.key\) NOT BETWEEN 1 AND 1024/);
 assert.match(source,/source_review_utf16_length_v1\(cell.value#>>'\{\}'\)>262144/);
 assert.match(source,/trunc\(\(ref->>'row'\)::numeric\)<>\(ref->>'row'\)::numeric/);
 assert.match(body('source_review_occurrence_v1'),/row'\)::numeric::integer\)::text/);
 assert.match(body('source_review_utf16_length_v1'),/length\(value\)\+regexp_count\(value COLLATE "C"/);
 assert.match(body('source_review_approval_v1'),/jsonb_array_length\(approved->'records'\) NOT BETWEEN 1 AND 250000/);
 const namespace='synthetic.numeric',file='c'.repeat(64),manifest='d'.repeat(64);
 const record={source_entity_type:'SALES_LINE',source_key:'',group_key:null,source_ref:{file_sha256:file,sheet:null,row:1,occurrence:0},
  raw_fields:{count:'1.0'},normalized_fields:null,normalization_version:null,raw_warehouse_value:null,reliable_original_hall_evidence:null,reason:'WAREHOUSE_UNRESOLVED',grouping:'ORPHAN'};
 const text=JSON.stringify({format_version:'HISTORICAL_SALES_SOURCE_REVIEW_APPROVAL_V1',source_namespace:namespace,package_manifest_sha256:manifest,records:[record]}).replace('"row":1,"occurrence":0','"row":1.0,"occurrence":0.0');
 const bytes=Buffer.from(text),approval=readSourceReviewApproval({bytes,trustedSha256:h(bytes),sourceNamespace:namespace,packageManifestSha256:manifest,sourceHashes:new Set([file])});
 const capture=sourceReviewCaptureRecords(approval)[0];assert.equal(capture.source.source_ref.row,1);assert.equal(capture.source.raw_fields.count,'1.0');
 assert.deepEqual(Buffer.concat(sourceReviewApprovalSegments(approval).map(x=>Buffer.from(x.bytes_base64,'base64'))),bytes);
 assert.equal(capture.occurrence_key,h(JSON.stringify([namespace,'SALES_LINE',file,null,1,0])));
});
test('seal checks exact membership, source proofs and ordinary no-effect; resolution remains honestly unavailable',()=>{
 const cmd=body('source_review_command_v1');assert.match(cmd,/actual_set IS DISTINCT FROM expected_set/);
 assert.match(cmd,/source_review_record_proof_v1\(item,false\)/);assert.match(cmd,/source_review_complete_operation_v1\(operation\)/);
 assert.doesNotMatch(cmd,/SET CONSTRAINTS ALL/);assert.match(cmd,/naijue_erp.receipt_requires_same_kind_audit IMMEDIATE/);assert.match(cmd,/SOURCE_REVIEW_RESOLUTION_NOT_IMPLEMENTED/);
 assert.doesNotMatch(cmd,/MATERIALIZED|REVIEWED_READY|EXCLUDED/);
 const complete=body('source_review_complete_operation_v1');assert.match(complete,/SOURCE_REVIEW_OPERATION_OCCURRENCE_SET/);
 assert.match(complete,/FROM naijue_erp\.inventory_ledger/);
});
test('idempotency and concurrency checks precede new writes and cross-batch source duplication is explicit',()=>{
 const cmd=body('source_review_command_v1');assert.ok(cmd.indexOf('pg_advisory_xact_lock')<cmd.indexOf('SELECT * INTO prior'));
 assert.ok(cmd.indexOf('RETURN prior.result_data')<cmd.indexOf('INSERT INTO'));
 assert.match(cmd,/prior.request_hash IS DISTINCT FROM request_sha/);assert.match(cmd,/SOURCE_REVIEW_BATCH_OR_SEQUENCE_CONFLICT/);
 assert.match(cmd,/source_system=b.source_name[\s\S]*source_key=item->>'occurrence_key'/);
});
test('synthetic app wrappers follow SQL primitive occurrence tuple and v8 algorithm without loss of raw originals',()=>{
 const namespace='synthetic.sql.review',file='a'.repeat(64),manifest='b'.repeat(64);
 const sources=Array.from({length:3},(_,i)=>({source_entity_type:i?'SALES_LINE':'SALES_HEADER',source_key:i?'':'重复业务键',group_key:null,
  source_ref:{file_sha256:file,sheet:i===2?null:'原始\n表🧥',row:i+1,occurrence:0},raw_fields:{warehouse:'',amount:'0003.20',nil:null},
  normalized_fields:null,normalization_version:null,raw_warehouse_value:'',reliable_original_hall_evidence:null,reason:'WAREHOUSE_UNRESOLVED',grouping:i?'ORPHAN':'AMBIGUOUS'}));
 const bytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SALES_SOURCE_REVIEW_APPROVAL_V1',source_namespace:namespace,package_manifest_sha256:manifest,records:sources}));
 const a=readSourceReviewApproval({bytes,trustedSha256:h(bytes),sourceNamespace:namespace,packageManifestSha256:manifest,sourceHashes:new Set([file])});
 for(const item of sourceReviewCaptureRecords(a)){const r=item.source;
  const sqlPrimitiveText='['+[namespace,r.source_entity_type,r.source_ref.file_sha256,r.source_ref.sheet,r.source_ref.row,r.source_ref.occurrence].map(v=>JSON.stringify(v)).join(',')+']';
  assert.equal(h(sqlPrimitiveText),item.occurrence_key);const k=item.occurrence_key;
  const sqlId=k.slice(0,8)+'-'+k.slice(8,12)+'-8'+k.slice(13,16)+'-'+'89ab'[(parseInt(k.slice(16,18),16)>>4)%4]+k.slice(17,20)+'-'+k.slice(20,32);
  assert.equal(sqlId,sourceReviewRecordId(k));assert.equal(item.source_record_sha256,h(item.source_hash_preimage));
  assert.equal(JSON.parse(item.source_hash_preimage).length,15);assert.equal(r.raw_fields.amount,'0003.20');assert.equal(r.raw_fields.warehouse,'');
 }
 assert.deepEqual(Buffer.concat(sourceReviewApprovalSegments(a).map(x=>Buffer.from(x.bytes_base64,'base64'))),bytes);
 // The above is a cross-language algorithm model, not execution by PostgreSQL.
 assert.equal(c.manifest.engineVerified,false);
});
test('loader emits separate current pins and never alters old combined installer profiles',async()=>{
 const loaded=await loadFresh35SourceReviewCandidate(root,{predecessorPath});
 assert.ok(loaded.manifest.sourcePins.length>=9);assert.equal(loaded.manifest.relativeSourceImportClosureCollected,true);
 for(const path of ['packages/application/src/unified-import-contract.ts','tools/unified-import/explicit-zero-cli-input.mjs','package.json','package-lock.json'])assert.ok(loaded.manifest.sourcePins.some(p=>p.path===path),path);
 assert.equal(loaded.manifest.sourceSetSha256,h(JSON.stringify(loaded.manifest.sourcePins)));
 const combined=await readFile(new URL('../scripts/release/unified-install/fresh35-combined-source-v1.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(combined,/fresh35-source-review-candidate|source_review_kernel_candidate/);
});
