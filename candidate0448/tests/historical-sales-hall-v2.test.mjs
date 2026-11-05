import test from 'node:test';import assert from 'node:assert/strict';
import {parseHistoricalSalesHallEvidence,buildHistoricalSalesHallEvidence} from '../packages/application/src/historical-sales-hall-evidence.ts';
import {readHistoricalSalesHallApproval,validateHistoricalSalesHallEvidence,historicalSalesHallApprovalWire} from '../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256 as V1,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256 as V2,isHistoricalSalesHallSourceProfile,historicalSalesHallEvidenceMatchesProfile,sha256} from '../packages/application/src/unified-import-contract.ts';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),dig=n=>String(n).repeat(64);
function fixture(dual=false){
 const refs=[{file_sha256:dig(1),sheet:'source',row:1}],capture={capture_evidence_sha256:dig(2),source_namespace:'runtime:scoped-capture',warehouse_source_key:'SOURCE-CODE',runtime_warehouse_id:id(1),source_native_version:null,effective_version:0,runtime_hall_ids:dual?[id(2),id(3)]:[id(2)],captured_at:'2026-11-05T03:00:00Z',transaction_snapshot:'123:125:124',relation_basis:'OBSERVED_EXACT_RUNTIME_RELATIONS'};
 const bridge={evidence_sha256:dig(3),record_key:'warehouse:exact',entity_type:'WAREHOUSE',source_namespace:capture.source_namespace,warehouse_source_key:capture.warehouse_source_key,runtime_warehouse_id:capture.runtime_warehouse_id,target_namespace:'target:batch',target_warehouse_id:id(11),source_capture_sha256:dig(2),hall_links:capture.runtime_hall_ids.map((x,i)=>({runtime_hall_id:x,target_hall_id:id(i+12)})),source_refs:refs,scope:'FIXED_CAPTURE_SCOPE_ONLY'};
 const resolution={evidence_sha256:dig(4),record_key:'approved:dual',source_namespace:capture.source_namespace,warehouse_source_key:capture.warehouse_source_key,runtime_warehouse_id:capture.runtime_warehouse_id,target_namespace:'target:batch',target_warehouse_id:id(11),source_capture_sha256:dig(2),selected_target_hall_id:id(12),runtime_hall_ids:capture.runtime_hall_ids,source_refs:refs,scope:'FIXED_CAPTURE_SCOPE_ONLY'};
 const evidence={format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V2',basis:'MIGRATION_DERIVED',original_hall_id:null,selected_hall_id:id(12),warehouse_id:id(11),target_snapshot:{warehouse_id:id(11),hall_id:id(12),version:1,captured_at:'2026-11-05T03:01:00Z'},source_capture:capture,identity_bridge:{evidence_sha256:bridge.evidence_sha256,record_key:bridge.record_key},resolution:dual?{evidence_sha256:resolution.evidence_sha256,record_key:resolution.record_key}:null,has_difference:dual,review_required:false};
 const bundle={format_version:'HISTORICAL_SALES_HALL_APPROVAL_V2',source_namespace:'target:batch',evidence_sha256:dig(1),records:[{source_key:'sale:1',target_id:id(20),source_refs:refs,evidence}],source_captures:[structuredClone(capture)],identity_bridges:[bridge],resolutions:dual?[resolution]:[]};
 const hashes=new Set([1,2,3,4].map(dig));const read=b=>{const bytes=Buffer.from(JSON.stringify(b));return readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:'target:batch',sourceHashes:hashes})};
 const context={sourceNamespace:'target:batch',sourceKey:'sale:1',targetId:id(20),sourceRefs:refs,fields:{stock_basis:'CUTOFF_HISTORY',warehouse_id:id(11),hall_id:id(12)},warehouse:{id:id(11),hall_id:id(12),version:1}};
 return {evidence,bundle,read,context,hashes};
}
test('V2 preserves true source zero/null and distinct target identity/version, old V1 remains exact',()=>{
 const f=fixture(),a=f.read(f.bundle),v=validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval:a});assert.equal(v.source_capture.effective_version,0);assert.equal(v.source_capture.source_native_version,null);assert.equal(v.target_snapshot.version,1);assert.notEqual(v.source_capture.runtime_warehouse_id,v.warehouse_id);assert.equal(v.original_hall_id,null);assert(Object.isFrozen(v.source_capture.runtime_hall_ids));
 for(const native of [0,null]){const raw=structuredClone(f.bundle);raw.records[0].evidence.source_capture.source_native_version=native;raw.source_captures[0].source_native_version=native;const proof=f.read(raw);assert.equal(validateHistoricalSalesHallEvidence(raw.records[0].evidence,{...f.context,approval:proof}).source_capture.source_native_version,native);}
 const old=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:id(1),warehouseHallId:id(2),warehouseVersion:1,capturedAt:'2026-11-05T03:00:00Z'});assert.equal(parseHistoricalSalesHallEvidence(old).format_version,'HISTORICAL_SALES_HALL_EVIDENCE_V1');assert.throws(()=>parseHistoricalSalesHallEvidence({...old,warehouse_version:0}),/CAPTURE_REQUIRED/);
 assert.notEqual(V1,V2);assert(isHistoricalSalesHallSourceProfile(V1)&&isHistoricalSalesHallSourceProfile(V2));assert(historicalSalesHallEvidenceMatchesProfile(v,V2));assert(!historicalSalesHallEvidenceMatchesProfile(v,V1));assert(!historicalSalesHallEvidenceMatchesProfile(old,V2));
});
test('dual observed halls stay intact and require exact externally reviewed resolution',()=>{
 const f=fixture(true),a=f.read(f.bundle),e=validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval:a});assert.equal(e.source_capture.runtime_hall_ids.length,2);assert.equal(e.has_difference,true);assert.equal(e.review_required,false);
 for(const mutate of [b=>b.resolutions=[],b=>b.resolutions[0].selected_target_hall_id=id(13),b=>b.resolutions[0].runtime_hall_ids=[id(2),id(99)],b=>b.records[0].evidence.has_difference=false,b=>b.records[0].evidence.source_capture.runtime_hall_ids=[id(2)]]){const b=structuredClone(f.bundle);mutate(b);assert.throws(()=>f.read(b),/HISTORICAL_HALL_/);}
});
test('bad source capture/bridge/member/source pin and self-declared trusted flag reject',()=>{
 const f=fixture();for(const mutate of [b=>b.records[0].evidence.source_capture.effective_version=1,b=>b.records[0].evidence.source_capture.runtime_warehouse_id=id(99),b=>b.identity_bridges[0].target_warehouse_id=id(99),b=>b.identity_bridges[0].source_namespace='other',b=>b.identity_bridges[0].warehouse_source_key='other',b=>b.identity_bridges[0].hall_links[0].target_hall_id=id(99),b=>b.identity_bridges[0].source_capture_sha256=dig(9),b=>b.identity_bridges[0].source_refs[0].file_sha256=dig(9),b=>b.source_captures.push(structuredClone(b.source_captures[0])),b=>b.identity_bridges[0].trusted=true,b=>b.records[0].evidence.source_capture.source_native_version=-1]){const b=structuredClone(f.bundle);mutate(b);assert.throws(()=>f.read(b),/HISTORICAL_HALL_/);}
 const bytes=Buffer.from(JSON.stringify(f.bundle));assert.throws(()=>readHistoricalSalesHallApproval({bytes,trustedSha256:dig(9),sourceNamespace:'target:batch',sourceHashes:f.hashes}),/APPROVAL_HASH/);
 const missing=new Set(f.hashes);missing.delete(dig(2));assert.throws(()=>readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:'target:batch',sourceHashes:missing}),/MEMBER|SOURCE/);
});
test('target snapshot remains positive and exact to current target warehouse',()=>{
 const f=fixture(),a=f.read(f.bundle);for(const warehouse of [{...f.context.warehouse,version:2},{...f.context.warehouse,id:id(99)},{...f.context.warehouse,hall_id:id(99)}])assert.throws(()=>validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval:a,warehouse}),/CAPTURE_STALE/);
 for(const mutate of [e=>e.target_snapshot.version=0,e=>e.target_snapshot.warehouse_id=id(99),e=>e.target_snapshot.hall_id=id(99),e=>e.source_capture.source_native_version='0',e=>e.source_capture.captured_at='2026-02-30T03:00:00Z']){const e=structuredClone(f.evidence);mutate(e);assert.throws(()=>parseHistoricalSalesHallEvidence(e),/HISTORICAL_HALL_/);}
 assert.throws(()=>validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval:structuredClone(a)}),/APPROVAL_REQUIRED/);
 assert.throws(()=>historicalSalesHallApprovalWire(structuredClone(a)),/UNVERIFIED/);
 const wire=historicalSalesHallApprovalWire(a);assert.equal(sha256(wire.utf8),wire.sha256);
});

test('actual V2 ordinary and streaming intake accept the authenticated separate source/target facts but cannot self-admit execution',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path');
 const {createSyntheticPackage,repinSyntheticPackage}=await import('./fixtures/unified-import/synthetic-package.ts');
 const {validateUnifiedPackage}=await import('../packages/application/src/unified-import-contract.ts');
 const {streamPreflight}=await import('../tools/unified-import/stream-preflight.mjs');
 const {prepareStreamPlan}=await import('../tools/unified-import/stream-plan.mjs');
 for(const dual of [false,true]){
  const p=createSyntheticPackage(),h=p.records.sales_header[0],w=p.records.warehouse[0],f=fixture(dual),pin=p.manifest.source_files[0].sha256;
  const convert=x=>Array.isArray(x)?x.map(convert):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,convert(v)])):x===id(11)?w.fields.id:x===id(12)?w.fields.hall_id:x===id(20)?h.fields.id:x==='target:batch'?p.manifest.source_namespace:typeof x==='string'&&[1,2,3,4].map(dig).includes(x)?pin:x;
  const bundle=convert(f.bundle);bundle.records[0].source_key=h.source_key;bundle.records[0].source_refs=structuredClone(h.source_refs);bundle.identity_bridges[0].source_refs=structuredClone(w.source_refs);if(dual)bundle.resolutions[0].source_refs=structuredClone(w.source_refs);
  h.historical_hall_evidence=bundle.records[0].evidence;p.manifest.schema_contract.source_declarations_sha256=V2;for(const s of p.records.staff)s.fields.departure_date=null;repinSyntheticPackage(p);
  const bytes=Buffer.from(JSON.stringify(bundle)),approval=readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(x=>x.sha256))});
  const result=validateUnifiedPackage(p,{allowSynthetic:true,historicalSalesHallApproval:approval});assert.equal(result.valid,true,JSON.stringify(result.issues));
  const dir=await mkdtemp(join(tmpdir(),'hall-v2-'));
  try{
   const pkg=join(dir,'source'),report=join(dir,'report');await mkdir(pkg);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes)}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(pkg,'manifest.json'),manifest);
   const summary=await streamPreflight(pkg,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true,historicalSalesHallApproval:approval});assert.equal(summary.checks_passed,true,await readFile(join(report,'issues.jsonl'),'utf8'));
   await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),summary,manifest,{historicalSalesHallApproval:approval,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_v2',catalog_sha256:pin}}),/WHOLE_SALES_ADMISSION_REQUIRED/);
   const mismatch=structuredClone(p);mismatch.manifest.schema_contract.source_declarations_sha256=V1;assert(validateUnifiedPackage(mismatch,{allowSynthetic:true,historicalSalesHallApproval:approval}).issues.some(i=>i.code==='HISTORICAL_HALL_PROFILE_VERSION'));
  }finally{await rm(dir,{recursive:true,force:true})}
 }
});
test('V2 SQL composition retains V1 provenance and ordinary rules while binding full V2 members and locking the actual target',async()=>{
 const {loadFresh35SalesHallCandidate}=await import('../scripts/release/unified-install/fresh35-sales-hall-candidate.mjs');
 const c=await loadFresh35SalesHallCandidate(process.cwd()),command=c.changedBodies.find(r=>r.signature.includes('standard_whole_package_command')).body,guard=c.changedBodies.find(r=>r.signature.includes('guard_unified_document')).body;
 assert.deepEqual(c.manifest.supportedSourceProfileSha256,[V1,V2]);
 for(const token of ['HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED','HISTORICAL_HALL_BRIDGE_REQUIRED','HISTORICAL_HALL_RESOLUTION_REQUIRED','HISTORICAL_HALL_UNUSED_MEMBER',"hall_target->>'version'","w.version>0 FOR SHARE",'HISTORICAL_HALL_PROFILE_VERSION',"hall_approval:=(cfg->'historical_hall_approval'->>'utf8')::jsonb",'HISTORICAL_HALL_APPROVAL_MEMBERSHIP'])assert(command.includes(token),token);
 assert(command.includes("w.version=(hall_evidence->>'warehouse_version')::integer"),'V1 positive target capture remains');
 for(const token of ["r.action='MIGRATE_DOCUMENT'","original_header->'warehouse_id' IS NOT DISTINCT FROM o->'warehouse_id'",'SALES_CURRENT_WAREHOUSE_HALL_MISMATCH','HISTORICAL_SALES_HALL_EVIDENCE_V1','HISTORICAL_SALES_HALL_EVIDENCE_V2'])assert(guard.includes(token),token);
 assert(!/w\.version=\(hall_capture->>'effective_version'\)/.test(command));assert.equal(c.manifest.newTables,0);assert.equal(c.manifest.newColumns,0);assert.equal(c.manifest.permissionsChanged,false);
});

function initializationFixture(dual=false){
 const f=fixture(dual);f.bundle.records[0].evidence.target_snapshot.captured_at=null;
 f.bundle.records[0].target_initialization={warehouse_source_key:'canonical:target:warehouse'};
 return {...f,evidence:f.bundle.records[0].evidence,context:{...f.context,warehouseSourceKey:'canonical:target:warehouse',warehouseTargetId:id(11),requireInitializationMaster:true}};
}
test('initialization intent is input-only and requires the closed external MASTER member without altering source capture',async()=>{
 const {parseHistoricalSalesHallInputEvidence,buildHistoricalSalesHallInitializationIntent}=await import('../packages/application/src/historical-sales-hall-evidence.ts');
 for(const dual of [false,true]){
  const f=initializationFixture(dual),approval=f.read(f.bundle),original=JSON.stringify(f.evidence),wire=historicalSalesHallApprovalWire(approval);
  assert.equal(parseHistoricalSalesHallInputEvidence(f.evidence).target_snapshot.captured_at,null);
  assert.equal(validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval}).target_snapshot.captured_at,null);
  const {format_version,...intent}=f.evidence;assert.deepEqual(buildHistoricalSalesHallInitializationIntent(intent),f.evidence);
  assert.throws(()=>parseHistoricalSalesHallEvidence(f.evidence),/TARGET_SNAPSHOT_INVALID/);
  assert.equal(JSON.stringify(f.evidence),original);assert.equal(sha256(wire.utf8),wire.sha256);
  assert.equal(f.evidence.source_capture.effective_version,0);assert.equal(f.evidence.source_capture.runtime_hall_ids.length,dual?2:1);
  for(const mutate of [b=>delete b.records[0].target_initialization,b=>b.records[0].target_initialization.extra=true,b=>b.records[0].target_initialization.warehouse_source_key='',b=>b.records[0].evidence.target_snapshot.captured_at='2026-11-05T03:00:00Z']){
   const b=structuredClone(f.bundle);mutate(b);assert.throws(()=>f.read(b),/HISTORICAL_HALL_/);
  }
 }
});
test('initialization final relation requires the actual MASTER key, registry ID, hall and explicit version; early shape approval is not capture',()=>{
 const f=initializationFixture(),approval=f.read(f.bundle),{warehouse,warehouseSourceKey,warehouseTargetId,requireInitializationMaster,...early}=f.context;
 assert.equal(validateHistoricalSalesHallEvidence(f.evidence,{...early,approval}).target_snapshot.captured_at,null);
 for(const delta of [{warehouse:undefined},{warehouseSourceKey:'SOURCE-CODE'},{warehouseTargetId:id(99)},{warehouse:{...warehouse,hall_id:id(99)}},{warehouse:{...warehouse,version:2}},{warehouse:{id:id(11),hall_id:id(12)}}]){
  assert.throws(()=>validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval,...delta}),/INITIALIZATION_MASTER_REQUIRED/);
 }
 assert.throws(()=>validateHistoricalSalesHallEvidence(f.evidence,{...f.context,approval:structuredClone(approval)}),/APPROVAL_REQUIRED/);
});
test('ordinary and stream READY intake carry the authenticated null intent with the original byte hash, never a fabricated capture',async()=>{
 const {createSyntheticPackage,repinSyntheticPackage}=await import('./fixtures/unified-import/synthetic-package.ts');
 const {validateUnifiedPackage}=await import('../packages/application/src/unified-import-contract.ts');
 const {streamPreflight}=await import('../tools/unified-import/stream-preflight.mjs');
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path');
 const p=createSyntheticPackage(),h=p.records.sales_header[0],w=p.records.warehouse[0],f=initializationFixture(true),pin=p.manifest.source_files[0].sha256;
 const convert=x=>Array.isArray(x)?x.map(convert):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,convert(v)])):x===id(11)?w.fields.id:x===id(12)?w.fields.hall_id:x===id(20)?h.fields.id:x==='target:batch'?p.manifest.source_namespace:typeof x==='string'&&[1,2,3,4].map(dig).includes(x)?pin:x;
 const bundle=convert(f.bundle);bundle.records[0].source_key=h.source_key;bundle.records[0].source_refs=structuredClone(h.source_refs);bundle.records[0].target_initialization.warehouse_source_key=w.source_key;
 bundle.identity_bridges[0].source_refs=structuredClone(w.source_refs);bundle.resolutions[0].source_refs=structuredClone(w.source_refs);
 h.historical_hall_evidence=bundle.records[0].evidence;p.manifest.schema_contract.source_declarations_sha256=V2;for(const s of p.records.staff)s.fields.departure_date=null;repinSyntheticPackage(p);
 const bytes=Buffer.from(JSON.stringify(bundle)),approval=readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(x=>x.sha256))}),before=JSON.stringify(h);
 assert.equal(validateUnifiedPackage(p,{allowSynthetic:true,historicalSalesHallApproval:approval}).valid,true);
 const wrong=structuredClone(p);wrong.records.warehouse[0].fields.version=2;repinSyntheticPackage(wrong);assert(validateUnifiedPackage(wrong,{allowSynthetic:true,historicalSalesHallApproval:approval}).issues.some(i=>i.code==='HISTORICAL_HALL_INITIALIZATION_MASTER_REQUIRED'));
 const dir=await mkdtemp(join(tmpdir(),'hall-intent-'));
 try{
  const pkg=join(dir,'source'),report=join(dir,'report');await mkdir(pkg);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes)}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(pkg,'manifest.json'),manifest);
  const summary=await streamPreflight(pkg,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true,historicalSalesHallApproval:approval});assert.equal(summary.checks_passed,true,await readFile(join(report,'issues.jsonl'),'utf8'));
  assert.equal(JSON.stringify(h),before);assert.equal(h.historical_hall_evidence.target_snapshot.captured_at,null);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('C SQL source binds locked MASTER and raw row hash to receipt capture map; replay and rollback still use existing whole transaction entry',async()=>{
 const {loadFresh35SalesHallCandidate}=await import('../scripts/release/unified-install/fresh35-sales-hall-candidate.mjs');
 const c=await loadFresh35SalesHallCandidate(process.cwd()),body=name=>c.changedBodies.find(r=>r.signature.includes('.'+name+'(')).body,command=body('standard_whole_package_command_v2'),proof=body('standard_import_record_proof');
 for(const text of ['hall_master_proof:=naijue_erp.standard_import_record_proof(hall_master_id)',"hall_master_audit.after_values->>'phase' IS DISTINCT FROM 'MASTER'",'FOR SHARE',"clock_timestamp() AT TIME ZONE 'UTC'",'historical_hall_target_captures','historicalHallTargetCapturesSha256',"jsonb_build_object('input_source_record_hash',source_hash)",'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT'])assert(command.includes(text),text);
 for(const text of ['HISTORICAL_HALL_INPUT_HASH_INVALID','HISTORICAL_HALL_CAPTURE_MAP_INVALID','HISTORICAL_HALL_CAPTURE_MASTER_LINK_INVALID','master_s.source_record_hash','WHERE aa.operation_id=master_a.operation_id) IS DISTINCT FROM root_xid',"approved->'target_initialization'->>'warehouse_source_key'",'historical_hall_target_capture'])assert(proof.includes(text),text);
 assert(command.indexOf("source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex')")<command.indexOf("jsonb_build_object('input_source_record_hash',source_hash)"));
 assert(command.indexOf('historicalHallTargetCapturesSha256')<command.indexOf('INSERT INTO naijue_erp.operation_receipt'));
 assert.doesNotMatch(proof,/master_proof->>'source_hash'/,'batch manifest digest cannot substitute for source_record_hash');
 for(const name of ['guard_unified_document','assert_standard_import_operation','standard_whole_package_verify_v2'])assert(body(name).includes('historical_hall_target_capture'));
 assert.doesNotMatch(command,/UPDATE naijue_erp\.audit_change|created_operation_id\s*=/);
});
