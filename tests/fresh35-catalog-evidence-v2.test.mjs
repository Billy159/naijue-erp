import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFresh35EvidenceV2SourceBinding, validateFresh35EvidenceV2Candidate, loadReviewedFresh35EvidenceV2, FRESH35_EVIDENCE_V2_REQUIRED_FILES } from '../scripts/release/unified-install/fresh35-catalog-evidence-v2.mjs';
import { FRESH35_EVIDENCE_V2_INVENTORY_SQL, FRESH35_EVIDENCE_V2_CONTEXT_SQL, FRESH35_EVIDENCE_V2_DEPARSER, renderFresh35EvidenceV2CaptureSql } from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-query.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));let binding;
before(async()=>{binding=await createFresh35EvidenceV2SourceBinding(root);});
function fixture(){
 const identity={system_identifier:'123456789',database_oid:'16387',database_name:'synthetic_schema178v2_model',owner:'model_owner',actor:'model_owner',current_user:'model_owner',server_version_num:'170011'};
 const session={identity,backend_pid:'501',transaction_started_at:'1793815261.000000',server_address:'127.0.0.1',server_port:'57628',settings:{server_version_num:'170011',server_encoding:'UTF8',client_encoding:'UTF8',search_path:'pg_catalog',quote_all_identifiers:'off',standard_conforming_strings:'on',transaction_isolation:'repeatable read',transaction_read_only:'on',session_replication_role:'origin',DateStyle:'ISO, MDY',IntervalStyle:'postgres',extra_float_digits:'3',TimeZone:'UTC'},visible_snapshot:'100:100:'};
 const inventory={context:session,routines:[],relations:[],columns:[],constraints:[],indexes:[],triggers:[],policies:[],roles:[],memberships:[],default_acl:[],database_acl:{oid:identity.database_oid,owner:identity.owner,acl:null},schemas:[],dependencies:[],shared_dependencies:[],extensions:[],nonbusiness_scope:'Schema and catalog only; no runtime admission, no security probes, no formal record'};
 const context={format:'FRESH35_DEPARSE_CONTEXT_V2',exportedSnapshot:'00000001-00000001-1',before:session,after:structuredClone(session),deparser:structuredClone(FRESH35_EVIDENCE_V2_DEPARSER),exporter:{backendPid:'500',visibleSnapshot:'100:100:',exportedAt:'2026-11-04T18:00:00Z',closedAt:'2026-11-04T18:05:00Z'},inventoryWindow:{startedAt:'2026-11-04T18:01:00Z',finishedAt:'2026-11-04T18:02:00Z'},dump:{startedAt:'2026-11-04T18:01:00Z',finishedAt:'2026-11-04T18:03:00Z',serverVersionNum:'170011',toolVersionNum:'170011',toolSha256:'1'.repeat(64),exportedSnapshot:'00000001-00000001-1',options:['--schema-only','--format=plain','--quote-all-identifiers','--schema=naijue_erp']}};
 const sourceTarget={format:'FRESH35_PREDECESSOR_SOURCE_TARGET_V2',scope:'SYNTHETIC_SCHEMA_ONLY_NOT_ADMISSION',sourceBindingSha256:binding.sha256,predecessorSourceSpecSha256:binding.predecessorSourceSpecSha256,target:identity,exportedSnapshot:context.exportedSnapshot,formalRecordCreated:false,businessImported:false};
 const objects=Object.fromEntries(['relations','columns','constraints','indexes','triggers','policies','extensions'].map(k=>[k,inventory[k]]));
 const acl=Object.fromEntries(['roles','memberships','default_acl','database_acl','schemas'].map(k=>[k,inventory[k]]));
 const files=Object.fromEntries(Object.entries({'inventory.sql':FRESH35_EVIDENCE_V2_INVENTORY_SQL,'context.sql':FRESH35_EVIDENCE_V2_CONTEXT_SQL,'capture.sql':renderFresh35EvidenceV2CaptureSql(context.exportedSnapshot),'schema178-naijue-erp.sql':'-- SYNTHETIC MODEL ONLY, NOT A DATABASE DUMP\n','inventory.json':inventory,'functions.json':inventory.routines,'objects.json':objects,'acl-and-roles.json':acl,'dependencies.json':inventory.dependencies,'shared-dependencies.json':inventory.shared_dependencies,'capture-context.json':context,'source-target.json':sourceTarget}).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)]));
 return repack(files);
}
function repack(files){return {files,manifest:JSON.stringify({format:'FRESH35_PREDECESSOR_EVIDENCE_CANDIDATE_V2',sourceBindingSha256:binding.sha256,files:Object.keys(files).sort().map(path=>({path,sha256:hash(files[path]),bytes:Buffer.byteLength(files[path])}))})};}
function edit(packet,name,fn){const value=JSON.parse(packet.files[name]);fn(value);packet.files[name]=JSON.stringify(value);return repack(packet.files);}
test('V2 source binding is immutable and includes changed receiver entrypoints without registering authority',()=>{
 assert.equal(binding.sourceOnly,true);assert.equal(binding.finalSourceFreezeAuthenticated,false);assert.ok(Object.isFrozen(binding.sourcePins));
 for(const path of ['tools/unified-import/cli.mjs','tools/unified-import/cli.ts','tools/unified-import/stream-import-cli.mjs','tools/unified-import/fresh35-receiver-diagnostics.ts'])assert.ok(binding.sourcePins.some(p=>p.path===path),path);
});
test('a synthetically consistent V2 packet remains unreviewed and cannot feed old pinned renderer',async()=>{
 const value=await validateFresh35EvidenceV2Candidate(binding,fixture());assert.equal(value.state,'CONSISTENT_UNREVIEWED_CANDIDATE');
 for(const key of ['executionProvenanceAuthenticated','catalogMetadataComplete','engineVerified','installationReady','targetAdmitted','reviewedEvidenceRegistered'])assert.equal(value[key],false,key);
 const {buildFresh35CatalogPostconditions}=await import('../scripts/release/unified-install/fresh35-catalog-postconditions.mjs');assert.throws(()=>buildFresh35CatalogPostconditions(value,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
});
test('reviewed V2 loader refuses without reading any caller arguments or approval flag',()=>{
 const trap=new Proxy({},{get(){throw Error('ARGUMENT_TOUCHED');},ownKeys(){throw Error('ARGUMENT_TOUCHED');}});
 assert.throws(()=>loadReviewedFresh35EvidenceV2(trap),/FRESH35_V2_REVIEWED_PROFILE_NOT_REGISTERED/);
});
test('cloned or invented source brands and source-binding substitution fail',async()=>{
 await assert.rejects(validateFresh35EvidenceV2Candidate(structuredClone(binding),fixture()),/GENUINE_SOURCE_BINDING_REQUIRED/);
 const p=fixture(),m=JSON.parse(p.manifest);m.sourceBindingSha256='0'.repeat(64);p.manifest=JSON.stringify(m);await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/SOURCE_BINDING_DIFFERS/);
});
test('artifact hash, size, cohort and manifest duplication failures stay closed',async()=>{
 const p=fixture();p.files['functions.json']='[{}]';await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/ARTIFACT_BYTES_DIFFER/);
 for(const mutate of [x=>delete x.files['context.sql'],x=>x.files['../escape']='x']){const q=fixture();mutate(q);await assert.rejects(validateFresh35EvidenceV2Candidate(binding,q),/ARTIFACT_COHORT_DIFFERS/);}
 const q=fixture();q.manifest=q.manifest.replace('"format":','"format":"other","format":');await assert.rejects(validateFresh35EvidenceV2Candidate(binding,q));
 const r=fixture(),m=JSON.parse(r.manifest);m.files.push(m.files[0]);r.manifest=JSON.stringify(m);await assert.rejects(validateFresh35EvidenceV2Candidate(binding,r),/MANIFEST_FILE_COHORT_DIFFERS/);
 assert.equal(FRESH35_EVIDENCE_V2_REQUIRED_FILES.length,12);
});
test('unmeasured or drifting context and stale source-target identity are rejected even after rehashing',async()=>{
 for(const [field,value] of [['quote_all_identifiers','on'],['search_path','pg_catalog, naijue_erp'],['server_version_num','180001'],['transaction_read_only','off']]){
  const p=edit(fixture(),'capture-context.json',c=>{c.before.settings[field]=value;});await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/CONTEXT_/);
 }
 for(const mutate of [c=>delete c.before.settings.quote_all_identifiers,c=>c.after.identity.database_oid='9999',c=>c.after.visible_snapshot='101:101:',c=>c.deparser.constraintDefinition='pg_get_constraintdef(c.oid)',c=>c.dump.options.splice(2,1),c=>c.dump.exportedSnapshot='00000001-00000002-1']){
  const p=edit(fixture(),'capture-context.json',mutate);await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/CONTEXT_/);
 }
 const q=edit(fixture(),'source-target.json',s=>s.predecessorSourceSpecSha256='0'.repeat(64));await assert.rejects(validateFresh35EvidenceV2Candidate(binding,q),/SOURCE_TARGET_DIFFERS/);
});
test('inventory session must equal surrounding observations and derived artifact projections must agree',async()=>{
 const p=edit(fixture(),'inventory.json',v=>v.context.settings.quote_all_identifiers='on');await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/INVENTORY_CONTEXT_DIFFERS/);
 const q=fixture();q.files['objects.json']='{}';await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(q.files)),/DERIVED_ARTIFACT_DIFFERS/);
 const r=fixture();r.files['inventory.sql']+='\nSELECT 1;';await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(r.files)),/QUERY_SOURCE_DIFFERS/);
});
test('fixed V2 statements only observe catalog and actual context, and declare pretty=false explicitly',()=>{
 assert.match(FRESH35_EVIDENCE_V2_INVENTORY_SQL,/pg_get_constraintdef\(c\.oid,false\)/);assert.match(FRESH35_EVIDENCE_V2_INVENTORY_SQL,/pg_get_triggerdef\(t\.oid,false\)/);
 assert.match(FRESH35_EVIDENCE_V2_CONTEXT_SQL,/quote_all_identifiers/);assert.match(FRESH35_EVIDENCE_V2_CONTEXT_SQL,/pg_current_snapshot/);
 assert.doesNotMatch(FRESH35_EVIDENCE_V2_INVENTORY_SQL,/has_function_privilege|has_parameter_privilege|\bGRANT\b|\bREVOKE\b|\bDO\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
});
test('a genuine binding becomes unusable after its copied source changes',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'fresh35-v2-source-'));
 try{for(const pin of binding.sourcePins){const dest=resolve(dir,pin.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,await readFile(resolve(root,pin.path)));}
  const copy=await createFresh35EvidenceV2SourceBinding(dir);assert.equal(copy.sha256,binding.sha256);
  await writeFile(resolve(dir,'tools/unified-import/cli.mjs'),'// Changed after local binding\n');
  await assert.rejects(validateFresh35EvidenceV2Candidate(copy,fixture()),/SOURCE_FILE_CHANGED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('V2 exact capture SQL fixes observed settings inside one read-only imported snapshot transaction',()=>{
 const sql=renderFresh35EvidenceV2CaptureSql('00000001-00000001-1');
 assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);assert.match(sql,/SET TRANSACTION SNAPSHOT '00000001-00000001-1';/);
 assert.equal(sql.split(FRESH35_EVIDENCE_V2_CONTEXT_SQL).length,3);assert.equal(sql.split(FRESH35_EVIDENCE_V2_INVENTORY_SQL).length,2);
 assert.match(sql,/SET LOCAL TimeZone='UTC';/);assert.match(sql,/ROLLBACK;\n$/);
 assert.throws(()=>renderFresh35EvidenceV2CaptureSql("x'; COMMIT;--"),/EXPORTED_SNAPSHOT_INVALID/);
});
test('session switch, exporter expiry, undeclared dump flags and unsafe raw JSON are rejected',async()=>{
 for(const mutate of [c=>c.after.backend_pid='999',c=>c.after.transaction_started_at='1793815201.000000',c=>c.before.settings.TimeZone='Europe/London',c=>c.exporter.closedAt='2026-11-04T18:01:30Z',c=>c.dump.options.push('--no-acl'),c=>c.dump.options.push('--snapshot=x'),c=>c.dump.toolVersionNum='170010'])await assert.rejects(validateFresh35EvidenceV2Candidate(binding,edit(fixture(),'capture-context.json',mutate)),/CONTEXT_/);
 for(const raw of ['{"context":{},"\\u0063ontext":{}}','{"x":1e309}', '['.repeat(65)+']'.repeat(65)]){const p=fixture();p.files['inventory.json']=raw;await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(p.files)));}
 const p=fixture();p.files['inventory.json']=Buffer.from([0xff]);const m=JSON.parse(p.manifest);const pin=m.files.find(x=>x.path==='inventory.json');pin.bytes=1;pin.sha256=hash(p.files['inventory.json']);p.manifest=JSON.stringify(m);await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/UTF8_INVALID/);
 const q=fixture();q.files['capture.sql']+='SELECT 1;';await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(q.files)),/QUERY_SOURCE_DIFFERS/);
});
test('inventory has closed typed categories and cannot carry caller review claims',async()=>{
 for(const mutate of [i=>i.reviewed=true,i=>i.routines=true,i=>i.schemas=[true]]){
  let p=edit(fixture(),'inventory.json',mutate);const inv=JSON.parse(p.files['inventory.json']);p.files['functions.json']=JSON.stringify(inv.routines);p=repack(p.files);
  await assert.rejects(validateFresh35EvidenceV2Candidate(binding,p),/INVENTORY_/);
 }
});
test('raw BOM cannot change pinned query bytes or be silently stripped from JSON',async()=>{
 for(const name of ['inventory.sql','context.sql','capture.sql','capture-context.json']){const p=fixture();p.files[name]='\ufeff'+p.files[name];await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(p.files)),/BOM_NOT_ALLOWED/);}
});
test('actual numeric domains and microsecond chronology reject impossible observations',async()=>{
 for(const mutate of [c=>c.before.visible_snapshot='999:1:0,0',c=>c.before.visible_snapshot='100:200:101,101',c=>c.before.identity.database_oid='99999999999999999999999999999999',c=>c.before.identity.system_identifier='18446744073709551616',c=>c.before.transaction_started_at='0',c=>c.exporter.exportedAt='2026-02-31T00:00:00Z',c=>{c.exporter.exportedAt='2026-11-04T18:01:00.000002Z';c.inventoryWindow.startedAt='2026-11-04T18:01:00.000001Z';}])await assert.rejects(validateFresh35EvidenceV2Candidate(binding,edit(fixture(),'capture-context.json',mutate)),/CONTEXT_/);
});
test('V2 context renders an exact host address instead of inet text with a CIDR suffix',()=>{
 const address="'server_address',pg_catalog.host(pg_catalog.inet_server_addr()),'server_port'";
 assert.equal(FRESH35_EVIDENCE_V2_CONTEXT_SQL.split(address).length,2);
 assert.equal(FRESH35_EVIDENCE_V2_INVENTORY_SQL.split(address).length,2);
 assert.equal(renderFresh35EvidenceV2CaptureSql('00000001-00000001-1').split(address).length,4);
 assert.doesNotMatch(FRESH35_EVIDENCE_V2_CONTEXT_SQL,/inet_server_addr\(\)::text/);
});
test('canonical host output does not broaden the strict loopback candidate check',async()=>{
 for(const address of ['127.0.0.1/32','127.0.0.1/8','127.0.0.10','127.0.0.2','192.0.2.1','127.0.0.1suffix','127.0.0.1 ','localhost','::1','::ffff:127.0.0.1','',null]){
  const p=fixture(),c=JSON.parse(p.files['capture-context.json']),i=JSON.parse(p.files['inventory.json']);
  c.before.server_address=address;c.after.server_address=address;i.context.server_address=address;
  p.files['capture-context.json']=JSON.stringify(c);p.files['inventory.json']=JSON.stringify(i);
  await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(p.files)),/CONTEXT_CONNECTION_INVALID/);
 }
 const result=await validateFresh35EvidenceV2Candidate(binding,fixture());assert.equal(result.state,'CONSISTENT_UNREVIEWED_CANDIDATE');assert.equal(result.executionProvenanceAuthenticated,false);assert.equal(result.targetAdmitted,false);
});
test('old inet text capture SQL remains rejected after source binding and artifact rehash',async()=>{
 const p=fixture();for(const name of ['context.sql','inventory.sql','capture.sql'])p.files[name]=p.files[name].replaceAll('pg_catalog.host(pg_catalog.inet_server_addr())','pg_catalog.inet_server_addr()::text');
 await assert.rejects(validateFresh35EvidenceV2Candidate(binding,repack(p.files)),/QUERY_SOURCE_DIFFERS/);
});
