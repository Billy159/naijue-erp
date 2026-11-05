import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {createNumericFitSyntheticPackage,writeNumericFitSyntheticPackage,NUMERIC_FIT_BARCODE_EXAMPLE} from './fixtures/unified-import/numeric-fit-synthetic-package.mjs';
import {SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,sha256,validateUnifiedPackage} from '../packages/application/src/unified-import-contract.ts';
import {stableImportId} from '../packages/application/src/inventory-cutoff-import.ts';
import {generateSkuBarcode} from '../packages/application/src/barcode-generation.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';
import {createWholePackageSqlKernel} from '../tools/unified-import/whole-package-sql-kernel.ts';
import {WHOLE_INSTALL_PATCHES} from '../scripts/release/unified-install/render-whole-package-local.mjs';

const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_numeric_profile_offline',catalog_sha256:'a'.repeat(64)};
const admin={staff_id:stableImportId('SYNTHETIC_NUMERIC_FIT','staff'),account_id:stableImportId('SYNTHETIC_NUMERIC_FIT','account'),login_name:'synthetic-numeric-fit',staff_name:'SYNTHETIC numeric fit admin'};
const options={target,initialization_identity:admin,allowSynthetic:true};
const manifestBytes=p=>Buffer.from(JSON.stringify(p.manifest,null,2)+'\n');
function compiler(p){const bytes=manifestBytes(p);return compileStandardWholePackageProfile({pkg:p,manifestBytes:bytes,expectedManifestSha256:sha256(bytes),...options});}
async function fixture(parent,label,p){
 const root=join(parent,label),report=join(parent,label+'-report');await mkdir(root);
 for(const [path,bytes] of Object.entries(p.artifacts)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
 const bytes=manifestBytes(p);await writeFile(join(root,'manifest.json'),bytes);
 const summary=await streamPreflight(root,report,{expectedManifestSha256:sha256(bytes),allowSynthetic:true});
 const issueText=await readFile(join(report,'issues.jsonl'),'utf8');
 return {root,report,bytes,summary,issues:issueText.trim()?issueText.trim().split('\n').map(JSON.parse):[]};
}
async function withWorkspace(body){const dir=await mkdtemp(join(tmpdir(),'numeric-fit-profile-'));try{await body(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function steps(program){const rows=[];for await(const step of program.steps)rows.push(step);return rows;}

test('explicit numeric synthetic replacement preserves identities, manual barcode, exact stock and hall assignment',()=>{
 const base=createSyntheticPackage(),before=JSON.stringify(base),pkg=createNumericFitSyntheticPackage();
 assert.deepEqual(pkg,createNumericFitSyntheticPackage());assert.equal(JSON.stringify(base),before);
 assert.equal(base.manifest.schema_contract.source_declarations_sha256,SCHEMA_DECLARATIONS_SHA256);
 assert.equal(pkg.manifest.schema_contract.source_declarations_sha256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256);
 assert.deepEqual(pkg.registry,base.registry);assert.deepEqual(pkg.records.sku_barcode,base.records.sku_barcode);
 assert.deepEqual(pkg.records.inventory_baseline,base.records.inventory_baseline);assert.deepEqual(pkg.records.warehouse,base.records.warehouse);assert.deepEqual(pkg.records.hall,base.records.hall);
 assert.deepEqual(pkg.manifest.source_files,base.manifest.source_files);assert.deepEqual(pkg.reports,base.reports);
 const normalized=structuredClone(pkg.records);normalized.fit=base.records.fit;normalized.color=base.records.color;assert.deepEqual(normalized,base.records);
 assert.equal(validateUnifiedPackage(pkg,{allowSynthetic:true}).valid,true);
});

test('fixture writer creates a fresh package with explicit profile and refuses to overwrite',async()=>withWorkspace(async dir=>{
 const root=join(dir,'numeric'),result=await writeNumericFitSyntheticPackage(root);
 assert.equal(result.business_database_writes,false);assert.equal(result.manifest_sha256,sha256(await readFile(join(root,'manifest.json'))));
 assert.equal(result.schema_declarations_sha256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256);
 await assert.rejects(writeNumericFitSyntheticPackage(root),{code:'EEXIST'});
 const summary=await streamPreflight(root,join(dir,'preflight'),{expectedManifestSha256:result.manifest_sha256,allowSynthetic:true});
 assert.equal(summary.checks_passed,true);assert.equal(summary.import_eligible,false);assert.equal(summary.business_database_writes,false);
}));

test('legacy profile still rejects fit 5 and accepts historical A through full stream preflight',async()=>withWorkspace(async dir=>{
 const bad=createNumericFitSyntheticPackage();bad.manifest.schema_contract.source_declarations_sha256=SCHEMA_DECLARATIONS_SHA256;
 const rejected=await fixture(dir,'legacy-digit',bad);assert.equal(rejected.summary.checks_passed,false);
 assert(rejected.issues.some(i=>i.code==='FIELD_TYPE'&&i.file==='fit.jsonl'&&i.row===1&&i.field==='code'));
 assert(rejected.issues.some(i=>i.code==='REGISTRY_TARGET_ROW_MISSING'));
 await assert.rejects(prepareStreamPlan(join(rejected.report,'index.sqlite'),rejected.summary,rejected.bytes,options),/STREAM_PLAN_BINDING_INVALID/);
 const accepted=await fixture(dir,'legacy-letter',createSyntheticPackage());assert.deepEqual(accepted.issues,[]);assert.equal(accepted.summary.checks_passed,true);
}));

test('explicit numeric and departure profiles accept only declared fit codes, keeping uppercase A',async()=>withWorkspace(async dir=>{
 for(const [index,code] of ['3','5','6','7','8','9','A','Z','0','1','2','4','05','a','AA',''].entries()){
  const p=createNumericFitSyntheticPackage();p.records.fit[0].fields.code=code;repinSyntheticPackage(p);
  const expected=['3','5','6','7','8','9','A','Z'].includes(code),full=validateUnifiedPackage(p,{allowSynthetic:true});
  assert.equal(full.valid,expected,JSON.stringify({code,issues:full.issues}));
  const f=await fixture(dir,'code-'+index,p);assert.equal(f.summary.checks_passed,expected,JSON.stringify({code,issues:f.issues}));
  if(!expected)assert(f.issues.some(i=>i.code==='FIELD_TYPE'&&i.file==='fit.jsonl'&&i.field==='code'));
 }
 const p=createNumericFitSyntheticPackage();p.manifest.schema_contract.source_declarations_sha256=STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256;
 for(const row of p.records.staff)row.fields.departure_date=null;repinSyntheticPackage(p);
 const f=await fixture(dir,'departure',p);assert.deepEqual(f.issues,[]);assert.equal(f.summary.schema_declarations_sha256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256);
}));

for(const profile of ['numeric','departure'])test(profile+' profile stays identical across manifest, stream plan, ordinary and coalesced requests',async()=>withWorkspace(async dir=>{
 const p=createNumericFitSyntheticPackage();if(profile==='departure'){p.manifest.schema_contract.source_declarations_sha256=STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256;for(const r of p.records.staff)r.fields.departure_date=null;repinSyntheticPackage(p);}
 const f=await fixture(dir,'package',p);assert.deepEqual(f.issues,[]);const index=join(f.report,'index.sqlite'),reference=compiler(p);
 const plan=await prepareStreamPlan(index,f.summary,f.bytes,options),repeat=await prepareStreamPlan(index,f.summary,f.bytes,options);
 try{
  assert.equal(plan.planHash,reference.plan_sha256);assert.equal(plan.planHash,repeat.planHash);assert.equal(plan.v2Hash,reference.source_plan_sha256);
  const wire=await buildStreamProgram(plan,index,f.summary,admin),again=await buildStreamProgram(repeat,index,f.summary,admin);
  assert.deepEqual(wire.initialize,reference.initialize);assert.deepEqual(wire.initialize,again.initialize);
  const actual=await steps(wire);assert.deepEqual(actual,reference.steps);assert.deepEqual(actual,await steps(again));
  const fit=actual.flatMap(s=>s.request.payload.rows??[]).find(r=>r.entity_type==='FIT');assert.equal(fit.fields.code,'5');
  const manual=actual.flatMap(s=>s.request.payload.rows??[]).find(r=>r.entity_type==='SKU_BARCODE');assert.deepEqual(manual.fields,p.records.sku_barcode[0].fields);
  const packed=await buildStreamProgram(plan,index,f.summary,admin,{coalesce:true});assert.equal(packed.initialize.payload.schema_declarations_sha256,p.manifest.schema_contract.source_declarations_sha256);
  assert.notEqual(packed.initialize.plan_sha256,wire.initialize.plan_sha256);
  const packedFit=(await steps(packed)).flatMap(s=>s.request.payload.rows??[]).find(r=>r.entity_type==='FIT');assert.deepEqual(packedFit.fields,fit.fields);
  await assert.rejects(buildStreamProgram(plan,index,{...f.summary,schema_declarations_sha256:SCHEMA_DECLARATIONS_SHA256},admin),/STREAM_PLAN_SUMMARY_MISMATCH/);
  await assert.rejects(prepareStreamPlan(index,{...f.summary,schema_declarations_sha256:SCHEMA_DECLARATIONS_SHA256},f.bytes,options),/STREAM_PLAN_MANIFEST_MISMATCH/);
 }finally{await plan.dispose();await repeat.dispose();}
}));

test('changing only an explicit profile changes plan and operation bindings; unknown profiles are refused',async()=>{
 const a=createSyntheticPackage(),b=structuredClone(a);b.manifest.schema_contract.source_declarations_sha256=NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256;
 const old=compiler(a),numeric=compiler(b);assert.notEqual(old.plan_sha256,numeric.plan_sha256);assert.notEqual(old.initialize.operation_id,numeric.initialize.operation_id);
 assert.deepEqual(a.records,b.records);
 b.manifest.schema_contract.source_declarations_sha256='f'.repeat(64);assert.throws(()=>compiler(b),/WHOLE_PACKAGE_PROFILE_SCHEMA_UNKNOWN/);
 await withWorkspace(async dir=>{await assert.rejects(fixture(dir,'unknown',b),/UNKNOWN_SCHEMA_PROFILE/);});
});

test('SQL adapter forwards the numeric profile and exact fit fields without rewriting (mock transport only)',async()=>withWorkspace(async dir=>{
 const p=createNumericFitSyntheticPackage(),f=await fixture(dir,'numeric',p),index=join(f.report,'index.sqlite');
 const plan=await prepareStreamPlan(index,f.summary,f.bytes,options);
 try{
  const wire=await buildStreamProgram(plan,index,f.summary,admin),all=await steps(wire),master=all.find(s=>s.method==='masterChunk'&&s.request.payload.rows.some(r=>r.entity_type==='FIT')),captured=[];
  const client={async query(sql,values=[]){
   if(sql.startsWith('SET LOCAL'))return {command:'SET',rows:[]};
   const request=JSON.parse(values[sql.includes('_step_')?3:0]);captured.push({sql,request});
   const reply=sql.includes('_inspect_')?{state:'ABSENT'}:{protocol:'STANDARD_IMPORT_SQL_V1',operation_id:request.operation_id,batch_id:request.batch_id,request_sha256:'e'.repeat(64),state:'PENDING_TRANSACTION',sequence:0,cursor:0,receipt:{}};
   return {command:'SELECT',rows:[{result_json:JSON.stringify(reply)}]};
  }};
  const kernel=createWholePackageSqlKernel('naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128));
  await kernel.lockAndInspect(client,wire.identity,wire.initialize);await kernel.initialize(client,wire.identity,wire.initialize);await kernel.applyStep(client,master,all.indexOf(master)+1);
  assert.deepEqual(captured.slice(0,2).map(c=>c.request),[wire.initialize,wire.initialize]);assert.deepEqual(captured[2].request,master.request);
  assert.equal(captured[0].request.payload.schema_declarations_sha256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256);
  assert.equal(captured[2].request.payload.rows.find(r=>r.entity_type==='FIT').fields.code,'5');
 }finally{await plan.dispose();}
}));

test('SQL source recognizes the same three profile hashes and installs the numeric constraint first (source only)',async()=>{
 const source=await readFile(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_v2.sql',import.meta.url),'utf8');
 const match=source.match(/payload->>'schema_declarations_sha256' NOT IN \(([^)]+)\)/);assert(match);
 assert.deepEqual([...match[1].matchAll(/'([a-f0-9]{64})'/g)].map(m=>m[1]),[SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256]);
 const fitPatch='0027_fit_numeric_business_codes_successor.sql';assert(WHOLE_INSTALL_PATCHES.indexOf(fitPatch)>=0);assert(WHOLE_INSTALL_PATCHES.indexOf(fitPatch)<WHOLE_INSTALL_PATCHES.indexOf('0027_standard_import_whole_package_v2.sql'));
 const fitSql=await readFile(new URL('../adapters/postgres/patches/'+fitPatch,import.meta.url),'utf8');assert.match(fitSql,/CHECK\s*\(code ~ '\^\[A-Z356789\]\$'\)/);
});

test('2026 pure generation uses numeric reference fields without altering the retained manual barcode',()=>{
 const p=createNumericFitSyntheticPackage(),before=JSON.stringify(p.records.sku_barcode),e=NUMERIC_FIT_BARCODE_EXAMPLE;
 assert.equal(generateSkuBarcode({...e,fitCode:p.records.fit[0].fields.code,colorCode:p.records.color[0].fields.code,sizeCode:p.records.size[0].fields.code}),e.expectedBarcode);
 assert.equal(JSON.stringify(p.records.sku_barcode),before);
 assert.throws(()=>generateSkuBarcode({...e,fitCode:'A'}),{code:'PRODUCT_BARCODE_FIT_CODE_REQUIRED'});
 assert.equal(createSyntheticPackage().records.fit[0].fields.code,'A');
});
