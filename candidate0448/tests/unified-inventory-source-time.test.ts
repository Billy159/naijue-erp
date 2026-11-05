import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256,validateUnifiedPackage} from '../packages/application/src/unified-import-contract.ts';
import type {UnifiedPackage} from '../packages/application/src/unified-import-contract.ts';
import {readCurrentEffectiveAlignmentEvidence,currentEffectiveAlignmentMatchesManifest,currentEffectiveAlignmentDescriptor} from '../packages/application/src/unified-current-effective-alignment.ts';
import {readExplicitZeroApproval,compileExplicitZeroRecords} from '../packages/application/src/unified-explicit-zero-approval.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
import {readPinnedPackageForExecution} from '../tools/unified-import/execution-plan.ts';
// @ts-ignore Offline JS tools are intentionally exercised with synthetic files only.
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
// @ts-ignore Offline planner only, never a business database connection.
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
// @ts-ignore Request compilation is not request execution.
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';
// @ts-ignore Shared external-file intake, no database.
import {readCurrentEffectiveAlignmentCliEvidence} from '../tools/unified-import/current-effective-alignment-cli-input.mjs';

const docTables=['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'];
const admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'};
const target={protocol:'STANDARD_IMPORT_SQL_V1' as const,system_identifier:'123456789',database_oid:'42',database_name:'synthetic_time',catalog_sha256:'a'.repeat(64)};
function fixture(p=createSyntheticPackage()) {
 p.manifest.inventory_source.exported_at=null;
 const fact={format_version:'CURRENT_EFFECTIVE_ALIGNMENT_V1',scope:'CURRENT_EFFECTIVE',source_namespace:p.manifest.source_namespace,inventory_file_sha256:p.manifest.inventory_source.source_file_sha256,inventory_exported_at:null,cutoff_at:p.manifest.inventory_source.cutoff_at,registry_sha256:p.manifest.identity_registry.sha256,document_files:docTables.map(table=>{const {relative_path,bytes,sha256,row_count}=p.manifest.files.find(f=>f.table===table)!;return{table,relative_path,bytes,sha256,row_count};}),reviewed_by:'SYNTHETIC independent reviewer',review_reference:'SYNTHETIC review record 1',alignment_basis:'SYNTHETIC fixture explicitly models all effective documents at the independently reviewed inventory cutoff; export time is unknown.',decision:'CURRENT_EFFECTIVE_DOCUMENTS_MATCH_INVENTORY_CUTOFF'};
 const bytes=Buffer.from(JSON.stringify(fact)+'\n'),pin=sha256(bytes),evidence=readCurrentEffectiveAlignmentEvidence({bytes,trustedSha256:pin});
 p.manifest.source_files.push({relative_path:'SYNTHETIC-current-effective-review.json',bytes:bytes.length,sha256:pin});
 p.manifest.document_cutoff_alignment.evidence_sha256=pin;
 return{p,fact,bytes,pin,evidence};
}
const codes=(p:UnifiedPackage,evidence?:ReturnType<typeof readCurrentEffectiveAlignmentEvidence>)=>validateUnifiedPackage(p,{allowSynthetic:true,...(evidence?{currentEffectiveAlignmentEvidence:evidence}:{})}).issues.map(i=>i.code);
async function writePackage(p:UnifiedPackage,dir:string) {
 await mkdir(dir);for(const[name,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),bytes);}
 const manifestBytes=Buffer.from(JSON.stringify(p.manifest)+'\n');await writeFile(join(dir,'manifest.json'),manifestBytes);return manifestBytes;
}

test('SYNTHETIC unknown export stays null with independently reviewed exact cutoff/document binding',()=>{
 const{p,evidence}=fixture(),before=JSON.stringify(p.manifest),result=validateUnifiedPackage(p,{allowSynthetic:true,currentEffectiveAlignmentEvidence:evidence});
 assert.equal(result.valid,true,JSON.stringify(result.issues));assert.equal(result.import_eligible,false);assert.equal(result.database_import_implemented,false);
 assert.equal(JSON.stringify(p.manifest),before);assert.equal(p.manifest.inventory_source.exported_at,null);
 assert.equal(currentEffectiveAlignmentMatchesManifest(evidence,p.manifest),true);
 assert.equal(currentEffectiveAlignmentDescriptor(evidence).reviewed_by,'SYNTHETIC independent reviewer');
});
test('known export remains compatible; null does not substitute for independent alignment proof',()=>{
 assert.deepEqual(codes(createSyntheticPackage()),[]);
 const{p,evidence}=fixture();assert.ok(codes(p).includes('BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN'));
 assert.ok(codes(p,structuredClone(evidence)).includes('BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN'));
 const cloned=structuredClone(evidence);assert.throws(()=>currentEffectiveAlignmentDescriptor(cloned),/UNVERIFIED/);
 for(const exported of ['', 'unknown', '2026-11-02T16:00:00',undefined]){const changed=structuredClone(p);changed.manifest.inventory_source.exported_at=exported as never;assert.ok(codes(changed,evidence).includes('STOCK_SOURCE_NOT_VERIFIED'));}
 const reused=createSyntheticPackage();reused.manifest.document_cutoff_alignment.evidence_sha256=reused.manifest.inventory_source.source_file_sha256;assert.ok(codes(reused).includes('BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN'));
});
test('review capability rejects transplanted package identity, original hash, cutoff and every document pin dimension',()=>{
 const{p,evidence}=fixture();
 const mutations:Array<(x:UnifiedPackage)=>void>=[
  x=>{x.manifest.source_namespace+='-other';},x=>{x.manifest.inventory_source.source_file_sha256='f'.repeat(64);},
  x=>{x.manifest.inventory_source.cutoff_at='2026-11-03T16:00:00+08:00';},x=>{x.manifest.identity_registry.sha256='f'.repeat(64);},
  x=>{x.manifest.document_cutoff_alignment.evidence_sha256='e'.repeat(64);},x=>{x.manifest.source_files.at(-1)!.bytes++;},
  x=>{x.manifest.files.find(f=>f.table==='sales_line')!.sha256='e'.repeat(64);},x=>{x.manifest.files.find(f=>f.table==='sales_line')!.bytes++;},
  x=>{x.manifest.files.find(f=>f.table==='sales_line')!.row_count++;},x=>{x.manifest.files.find(f=>f.table==='sales_line')!.relative_path='different.jsonl';},
  x=>{x.manifest.files=x.manifest.files.filter(f=>f.table!=='sales_settlement');},x=>{x.manifest.files.push({...x.manifest.files.find(f=>f.table==='sales_line')!});},
 ];
 for(const mutate of mutations){const changed=structuredClone(p);mutate(changed);assert.equal(currentEffectiveAlignmentMatchesManifest(evidence,changed.manifest),false);assert.ok(codes(changed,evidence).includes('BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN'));}
});
test('bounded closed independently pinned review records own their bytes and cannot fabricate export time',()=>{
 const{fact,bytes,pin,p}=fixture();assert.throws(()=>readCurrentEffectiveAlignmentEvidence({bytes,trustedSha256:'0'.repeat(64)}),/HASH/);
 const e=readCurrentEffectiveAlignmentEvidence({bytes,trustedSha256:pin});bytes.fill(0);assert.equal(currentEffectiveAlignmentMatchesManifest(e,p.manifest),true);
 for(const change of [(v:any)=>{v.inventory_exported_at='2026-11-02T16:00:00+08:00';},(v:any)=>{v.reviewed_by='';},(v:any)=>{v.review_reference='';},(v:any)=>{v.alignment_basis='';},(v:any)=>{v.document_files.pop();},(v:any)=>{v.document_files[1]={...v.document_files[0]};},(v:any)=>{v.extra=true;},(v:any)=>{v.scope='HISTORY';}]){const value=structuredClone(fact);change(value);const b=Buffer.from(JSON.stringify(value)+'\n');assert.throws(()=>readCurrentEffectiveAlignmentEvidence({bytes:b,trustedSha256:sha256(b)}),/FACT/);}
 assert.throws(()=>readCurrentEffectiveAlignmentEvidence({bytes:Buffer.alloc(65537),trustedSha256:pin}),/SIZE/);
 const duplicate=Buffer.from(JSON.stringify(fact).replace('{','{"scope":"CURRENT_EFFECTIVE",')+'\n');assert.throws(()=>readCurrentEffectiveAlignmentEvidence({bytes:duplicate,trustedSha256:sha256(duplicate)}));
});
test('review declaration cannot waive actual cutoff, timezone, current-row or original-stock checks',()=>{
 for(const change of [(p:UnifiedPackage)=>{p.manifest.inventory_source.cutoff_at=null;},(p:UnifiedPackage)=>{p.manifest.inventory_source.source_timezone=null;},(p:UnifiedPackage)=>{p.manifest.source_files=p.manifest.source_files.filter(f=>f.sha256!==p.manifest.inventory_source.source_file_sha256);}]){const{p,evidence}=fixture();change(p);assert.ok(codes(p,evidence).includes('STOCK_SOURCE_NOT_VERIFIED'));}
 for(const table of ['sales_line','transfer_line']){const p=createSyntheticPackage();p.records[table]![0]!.fields.is_current=false;repinSyntheticPackage(p);const{evidence}=fixture(p);assert.ok(codes(p,evidence).includes('CURRENT_EFFECTIVE_REQUIRED'));}
});
test('unknown export preserves independently approved absent-zero original hash/cutoff and approval-file row semantics',()=>{
 const p=createSyntheticPackage(),old=p.records.inventory_baseline![0]!;
 const fact={format_version:'EXPLICIT_ZERO_APPROVAL_V1',source_namespace:p.manifest.source_namespace,inventory_file_sha256:p.manifest.inventory_source.source_file_sha256,cutoff_at:p.manifest.inventory_source.cutoff_at!,source_key:old.source_key,warehouse_id:old.fields.warehouse_id as string,sku_id:old.fields.sku_id as string,quantity:'0',decision:'CONFIRMED_ABSENT_IS_ZERO'};
 const bytes=Buffer.from(JSON.stringify(fact)+'\n'),pin=sha256(bytes),approval=readExplicitZeroApproval({bytes,trustedSha256:pin,sourceNamespace:fact.source_namespace,inventoryFileSha256:fact.inventory_file_sha256,cutoffAt:fact.cutoff_at});
 p.manifest.source_files.push({relative_path:'SYNTHETIC-zero-approval.jsonl',bytes:bytes.length,sha256:pin});
 p.records.inventory_baseline![0]=compileExplicitZeroRecords(approval,new Set([fact.warehouse_id]),new Set([fact.sku_id]),new Set())[0]!;repinSyntheticPackage(p);
 const{evidence}=fixture(p),options={allowSynthetic:true,explicitZeroApproval:approval,currentEffectiveAlignmentEvidence:evidence};
 assert.equal(validateUnifiedPackage(p,options).valid,true);
 const row=p.records.inventory_baseline![0]!;assert.deepEqual(row.source_refs,[{file_sha256:pin,sheet:null,row:1}]);
 assert.equal(row.explicit_zero_evidence!.inventory_file_sha256,fact.inventory_file_sha256);assert.equal(row.explicit_zero_evidence!.cutoff_at,fact.cutoff_at);
 assert.equal(row.explicit_zero_evidence!.approval_row,1);assert.notEqual(row.source_refs[0]!.file_sha256,p.manifest.inventory_source.source_file_sha256);
 assert.equal(validateUnifiedPackage(p,{allowSynthetic:true,currentEffectiveAlignmentEvidence:evidence}).valid,false);
 row.explicit_zero_evidence!.approval_row=2;repinSyntheticPackage(p);assert.ok(validateUnifiedPackage(p,options).issues.some(i=>i.code==='EXPLICIT_ZERO_APPROVAL_REQUIRED'));
});
test('materialized/streamed offline plans preserve evidence binding; missing proof and changed summary fail closed',async()=>{
 const{p,evidence}=fixture(),root=await mkdtemp(join(tmpdir(),'unknown-export-offline-'));
 try{
  const dir=join(root,'package'),manifestBytes=await writePackage(p,dir),options={allowSynthetic:true,currentEffectiveAlignmentEvidence:evidence,expectedManifestSha256:sha256(manifestBytes)};
  const summary=await streamPreflight(dir,join(root,'passed'),options);assert.equal(summary.checks_passed,true,await readFile(join(root,'passed','issues.jsonl'),'utf8'));assert.equal(summary.business_database_writes,false);
  const loaded=await readPinnedPackageForExecution(dir,options),program=compileStandardWholePackageProfile({...loaded,initialization_identity:admin,target});
  const plan=await prepareStreamPlan(join(root,'passed','index.sqlite'),summary,manifestBytes,{...options,target,initialization_identity:admin});
  try{
   assert.equal(plan.planHash,program.plan_sha256);const streamed=await buildStreamProgram(plan,join(root,'passed','index.sqlite'),summary,admin);assert.deepEqual(streamed.initialize,program.initialize);
   const steps=[];for await(const step of streamed.steps)steps.push(step);assert.deepEqual(steps,program.steps);
   const changed=structuredClone(summary);changed.current_effective_alignment!.evidence_sha256='0'.repeat(64);await assert.rejects(()=>buildStreamProgram(plan,join(root,'passed','index.sqlite'),changed,admin),/SUMMARY_MISMATCH/);
  }finally{await plan.dispose();}
  await assert.rejects(()=>prepareStreamPlan(join(root,'passed','index.sqlite'),summary,manifestBytes,{allowSynthetic:true,target,initialization_identity:admin}),/ALIGNMENT_BINDING_INVALID/);
  const rejected=await streamPreflight(dir,join(root,'rejected'),{allowSynthetic:true,expectedManifestSha256:sha256(manifestBytes)});assert.equal(rejected.checks_passed,false);assert.match(await readFile(join(root,'rejected','issues.jsonl'),'utf8'),/BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('actual offline CLI accepts externally pinned synthetic alignment and rejects inside-package evidence',async()=>{
 const{p,bytes,pin}=fixture(),root=await mkdtemp(join(tmpdir(),'unknown-export-cli-'));
 try{
  const dir=join(root,'package'),manifestBytes=await writePackage(p,dir),evidenceFile=join(root,'review.json');await writeFile(evidenceFile,bytes);
  assert.equal(currentEffectiveAlignmentMatchesManifest(await readCurrentEffectiveAlignmentCliEvidence(dir,p.manifest,evidenceFile,pin),p.manifest),true);
  const inside=join(dir,'not-independent-review.json');await writeFile(inside,bytes);await assert.rejects(()=>readCurrentEffectiveAlignmentCliEvidence(dir,p.manifest,inside,pin),/OUTSIDE_PACKAGE_REQUIRED/);await rm(inside);
  const run=spawnSync(process.execPath,['tools/unified-import/cli.mjs','stream-preflight','--package',dir,'--report',join(root,'cli-report'),'--manifest-sha256',sha256(manifestBytes),'--allow-synthetic','--current-effective-alignment',evidenceFile,'--current-effective-alignment-sha256',pin],{encoding:'utf8'});
  process.stdout.write('SYNTHETIC offline stream-preflight CLI raw stdout: '+run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,run.stdout+run.stderr+await readFile(join(root,'cli-report','issues.jsonl'),'utf8'));assert.equal(JSON.parse(run.stdout).checks_passed,true);
  const targetFile=join(root,'target.json'),adminFile=join(root,'admin.json');await writeFile(targetFile,JSON.stringify(target));await writeFile(adminFile,JSON.stringify(admin));
  const prepared=spawnSync(process.execPath,['tools/unified-import/cli.mjs','stream-prepare','--package',dir,'--report',join(root,'cli-prepared'),'--manifest-sha256',sha256(manifestBytes),'--allow-synthetic','--target',targetFile,'--admin',adminFile,'--current-effective-alignment',evidenceFile,'--current-effective-alignment-sha256',pin],{encoding:'utf8'});
  process.stdout.write('SYNTHETIC offline stream-prepare CLI raw stdout: '+prepared.stdout);process.stderr.write(prepared.stderr);assert.equal(prepared.status,0,prepared.stdout+prepared.stderr);assert.equal(JSON.parse(prepared.stdout).state,'OFFLINE_PREPARED');assert.equal(JSON.parse(prepared.stdout).business_database_writes,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
