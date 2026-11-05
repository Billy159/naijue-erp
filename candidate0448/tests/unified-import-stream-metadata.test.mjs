import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256} from '../packages/application/src/unified-import-contract.ts';
import {createMetadataChecker} from '../tools/unified-import/stream-package-metadata.mjs';
import {initializeRelationIndex} from '../tools/unified-import/stream-relations.mjs';

async function run(mutate=()=>{}, allowSynthetic=true) {
 const p=createSyntheticPackage(); mutate(p); const issues=[]; const db=new DatabaseSync(':memory:');
 // Metadata finish uses the same private SQLite index tables as preflight.
 // This unit fixture does not scan business rows or claim full relation coverage.
 db.exec('CREATE TABLE registry_rows(ordinal INTEGER PRIMARY KEY,file TEXT,line INTEGER,raw_json TEXT NOT NULL); CREATE TABLE identities(entity TEXT,key TEXT,id TEXT,file TEXT,line INTEGER,identity_basis TEXT NOT NULL); CREATE TABLE identity_keys(entity TEXT,key TEXT,id TEXT)');
 initializeRelationIndex(db);
 const issue=async(code,file,row,field)=>issues.push({code,file,row,field});
 const readBounded=async(path,max)=>{const b=Buffer.from(p.artifacts[path]);if(b.length>max)throw Error('REPORT_LIMIT');return b;};
 const scanBinary=async(pin)=>{const b=Buffer.from(p.artifacts[pin.relative_path]);return {bytes:b.length,sha256:sha256(b),head:b.subarray(0,12)};};
 const scanJsonl=async(pin,fn)=>{const b=Buffer.from(p.artifacts[pin.relative_path]);for(const [i,s] of b.toString().trim().split('\n').entries())if(s)await fn(JSON.parse(s),pin.relative_path,i+1);};
 const counts=Object.fromEntries(Object.entries(p.records).map(([k,v])=>[k,v.length]));
 const checker=await createMetadataChecker({manifest:p.manifest,issue,readBounded,scanJsonl,scanBinary,counts,db,allowSynthetic});
 for(const r of p.registry)await checker.checkRegistry(r,'identity-registry.jsonl',1);
 for(const rows of Object.values(p.records))for(const r of rows)await checker.checkSourceRefs(r.source_refs,'data.jsonl',1);
 for(const r of p.records.product_image)await checker.checkAssetRef(r.fields,'product_image.jsonl',1);
 await checker.finish();db.close();return issues;
}
test('synthetic complete metadata passes with independently pinned reports and image',async()=>{assert.deepEqual(await run(),[]);});
test('closed manifest, provenance, identity algorithm, asset resolution and reconciliation fail privately',async()=>{
 const issues=await run(p=>{p.manifest.extra='secret-value';p.records.staff[0].source_refs=[];p.registry[0].target_id='00000000-0000-4000-8000-000000000000';p.records.product_image[0].fields.file_ref='secret-file';p.reports['reconciliation.json'].tables.staff.retained_rows=9;const b=Buffer.from(JSON.stringify(p.reports['reconciliation.json']));p.artifacts['reconciliation.json']=b;Object.assign(p.manifest.reports.find(x=>x.role==='RECONCILIATION'),{bytes:b.length,sha256:sha256(b)});});
 for(const code of ['MANIFEST_KEYS','SOURCE_REFS_REQUIRED','REGISTRY_ID_ALGORITHM_MISMATCH','IMAGE_ASSET_MISMATCH','INVALID_RECONCILIATION'])assert(issues.some(i=>i.code===code),code);
 assert(!JSON.stringify(issues).includes('secret-value'));assert(!JSON.stringify(issues).includes('secret-file'));
});
test('exception rows, report pins, cutoff and source locators fail closed',async()=>{
 const issues=await run(p=>{p.manifest.inventory_source.cutoff_at=null;p.manifest.source_files[0].sha256='bad';p.manifest.reports.find(x=>x.role==='DECISIONS').sha256='0'.repeat(64);const e={entity_type:'STAFF',source_key:'private',field:null,code:'X',observed_value:'secret-value',expected_rule:'rule',source_refs:[],severity:'BLOCK_SCHEMA',proposed_action:'fix'};const b=Buffer.from(JSON.stringify(e)+'\n');p.artifacts['exceptions.jsonl']=b;Object.assign(p.manifest.reports.find(x=>x.role==='EXCEPTIONS'),{bytes:b.length,sha256:sha256(b),row_count:1});});
 for(const code of ['STOCK_SOURCE_NOT_VERIFIED','INVALID_SOURCE_FILE','FILE_PIN_MISMATCH','SOURCE_REFS_REQUIRED','UNRESOLVED_EXCEPTION'])assert(issues.some(i=>i.code===code),code);
 assert(!JSON.stringify(issues).includes('secret-value'));
});
test('duplicate paths and asset signatures are rejected without raw values',async()=>{
 const issues=await run(p=>{p.manifest.files[0].relative_path=p.manifest.identity_registry.relative_path;p.manifest.assets[0].mime='image/jpeg';p.manifest.source_files.push({...p.manifest.source_files[0]});});
 for(const code of ['DUPLICATE_FILE_PATH','DUPLICATE_SOURCE_FILE','IMAGE_ASSET_MISMATCH'])assert(issues.some(i=>i.code===code),code);
});
test('registry closed shape, actor rule and source reference shape are enforced',async()=>{
 const issues=await run(p=>{p.registry[0]={...p.registry[0],entity_type:'USER_ACCOUNT',identity_basis:'STABLE_IMPORT_ID_V1',extra:'private'};p.registry[1].source_refs=[{file_sha256:p.manifest.source_files[0].sha256,sheet:null,row:0}];});
 for(const code of ['INVALID_REGISTRY_ENTRY','INVALID_SOURCE_REF'])assert(issues.some(i=>i.code===code),code);
});
test('report credential is rejected without echo and retained count mismatch blocks',async()=>{
 const issues=await run(p=>{p.reports['decisions.json'].password='sentinel-private';let b=Buffer.from(JSON.stringify(p.reports['decisions.json']));p.artifacts['decisions.json']=b;Object.assign(p.manifest.reports.find(x=>x.role==='DECISIONS'),{bytes:b.length,sha256:sha256(b)});p.reports['reconciliation.json'].tables.staff={source_rows:2,retained_rows:2,rejected_rows:0};b=Buffer.from(JSON.stringify(p.reports['reconciliation.json']));p.artifacts['reconciliation.json']=b;Object.assign(p.manifest.reports.find(x=>x.role==='RECONCILIATION'),{bytes:b.length,sha256:sha256(b)});});
 assert(issues.some(i=>i.code==='FORBIDDEN_CREDENTIAL'));assert(issues.some(i=>i.code==='RECONCILIATION_COUNT_MISMATCH'));assert(!JSON.stringify(issues).includes('sentinel-private'));
});

test('synthetic package requires explicit opt-in and invalid Unicode strings fail',async()=>{
 const issues=await run(p=>{p.manifest.source_namespace='bad\0namespace';},false);assert(issues.some(i=>i.code==='SYNTHETIC_REQUIRES_OPT_IN'));assert(issues.some(i=>i.code==='SOURCE_NAMESPACE_REQUIRED'));
});
test('manifest.json is reserved and cannot be reused as a report or asset',async()=>{
 const issues=await run(p=>{const original=p.manifest.reports.find(x=>x.role==='DECISIONS');p.artifacts['manifest.json']=p.artifacts[original.relative_path];original.relative_path='manifest.json';});
 assert(issues.some(i=>i.code==='DUPLICATE_FILE_PATH'));
});
