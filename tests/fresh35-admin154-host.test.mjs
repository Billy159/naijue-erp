/** Source/OS/wire models only: no real installation, role, socket or PG. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createFresh35BootstrapNetworkModel,prepareFresh35CatalogProgramModel} from './fixtures/fresh35-bootstrap-network-model.mjs';
import {loadFresh35Admin154Source,fresh35Admin154SourceData,resolveFresh35ReferenceInputPaths} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
import {ADMIN154_PREDECESSOR_RECORD_SHA256,ADMIN154_PREDECESSOR_SOURCE_SHA256,ADMIN154_PATCH_SHA256} from '../scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
import {buildAdminProvisionRequest} from '../tools/unified-import/first-admin-setup.mjs';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {deriveStandardSourceRegistration} from '../packages/application/src/unified-source-registration.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {withReviewedWholeSession} from '../tools/unified-import/whole-host-session.mjs';
import {admitFresh35OrdinaryPoolV2} from '../tools/unified-import/fresh35-host-session.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const paths=await resolveFresh35ReferenceInputPaths(process.env.FRESH35_TEST_REFERENCE_DIRECTORY??resolve(root,'reference-inputs'));
const network=await createFresh35BootstrapNetworkModel({proposalDate:'20261105'});after(()=>network.close());
const source=await loadFresh35Admin154Source(root,{baselineDirectory:paths.baselineDirectory}),graph=await prepareFresh35CatalogProgramModel(network,fresh35Admin154SourceData(source).base,paths);
const catalog=await graph.catalogAPI.buildFresh35Admin154Catalog(source,network.target,paths),descriptor=graph.catalogAPI.describeFresh35CombinedCatalog(catalog);
const t=network.api.describeFresh35CombinedTarget(network.target);
const admin={staff_id:'71000000-0000-0000-0000-000000000001',account_id:'72000000-0000-0000-0000-000000000001',staff_name:'SYNTHETIC ADMIN154',login_name:'synthetic-admin154'};
const encoded='naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128);
const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');

async function hostModel(){
 const dir=await fs.mkdtemp(join(tmpdir(),'admin154-host-model-')),record=join(dir,'record.json'),authority=join(dir,'authority.json'),service=join(dir,'service.json');
 await fs.writeFile(service,'SYNTHETIC SERVICE ONLY');
 const recordURL=new URL('../scripts/release/unified-install/fresh35-admin154-record-v1.mjs',import.meta.url);let recordText=await fs.readFile(recordURL,'utf8');
 const io=stub("import * as fs from 'node:fs/promises';export const readFile=fs.readFile;const root=s=>Object.create(s,{uid:{value:0n}});export async function lstat(p,o){return root(await fs.lstat(p,o))}export async function open(p,f){const h=await fs.open(p,f);return{stat:async o=>root(await h.stat(o)),readFile:(...a)=>h.readFile(...a),close:()=>h.close()}} ");
 recordText=recordText.replace("'node:fs/promises'",JSON.stringify(io)).replace("'./trusted-install-path.mjs'",JSON.stringify(stub('export async function assertTrustedRootPath(){}')))
  .replace(/export const ADMIN154_RECORD_PATH=.*?;/,'export const ADMIN154_RECORD_PATH='+JSON.stringify(record)+';').replace(/export const ADMIN154_AUTHORIZATION_PATH=.*?;/,'export const ADMIN154_AUTHORIZATION_PATH='+JSON.stringify(authority)+';')
  .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,recordURL).href));
 const recordModule=stub(recordText),records=await import(recordModule);
 const expected={predecessor:{recordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,sourceSetSha256:ADMIN154_PREDECESSOR_SOURCE_SHA256,programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),targetSha256:'3'.repeat(64)},
  successor:{patchSqlSha256:ADMIN154_PATCH_SHA256,sourceSetSha256:descriptor.sourceSetSha256,catalogSpecSha256:descriptor.catalogSpecSha256,modelSha256:descriptor.modelSha256},
  physical:{systemIdentifier:t.physical.systemIdentifier,databaseOid:t.physical.databaseOid,database:t.proposal.database,serverVersionNum:t.physical.serverVersionNum,postmasterStart:'2026-11-11 01:00:00.123456+00'},owner:t.proposal.owner};
 const value={format:'FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1',predecessor:expected.predecessor,successor:{...expected.successor,catalogSha256:'7'.repeat(64)},physical:expected.physical,
  transactionReceipt:{nonce:'8'.repeat(48),actor:t.proposal.owner,database:t.proposal.database,transactionId:'123',backendPid:123},appliedAt:'2026-11-11T01:00:01Z',authorizationSha256:'9'.repeat(64)};
 const bytes=JSON.stringify(value);await fs.writeFile(record,bytes,{mode:0o644});const successor=await records.loadFresh35Admin154Record(expected,hash(bytes));
 const url=new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),original=await fs.readFile(url,'utf8');
 const block=original.slice(original.indexOf('export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH='),original.indexOf('const ordinaryAdmissions='));
 const imports=(names,p)=>'import {'+names+'} from '+JSON.stringify(new URL(p,url).href)+';\n';
 const prefix=`import {lstat} from 'node:fs/promises';import {createHash} from 'node:crypto';
 ${imports('requestHash','../../packages/application/src/request-hash.ts')}
 ${imports('parseStrictJson','../../packages/application/src/unified-import-contract.ts')}
 ${imports('canonicalRequestValue','../../packages/application/src/canonical-request-value.ts')}
 ${imports('validateStandardImportRequest','../../packages/application/src/unified-import-execution.ts')}
 ${imports('isNodeScryptPasswordHash','../../packages/authentication/src/passwords.ts')}
 ${imports('buildAdminProvisionRequest,buildProvisionedAdminStreamProgram','./first-admin-setup.mjs')}
 ${imports('assertPublicValuesExcludePrivateInputs','./execution-client.ts')}
 ${imports('streamTypedHash,typedHashArray','./stream-typed-hash.mjs')}
 import {describeFresh35CombinedCatalog} from ${JSON.stringify(graph.catalogURL)};
 import {describeFresh35CombinedTarget} from ${JSON.stringify(network.moduleURL)};
 import {describeFresh35Admin154Record,assertFresh35Admin154RecordCurrent,loadFresh35Admin154Authorization,assertFresh35Admin154AuthorizationCurrent} from ${JSON.stringify(recordModule)};
 const currentProductionServicePath=${JSON.stringify(service)},contexts=new WeakMap(),need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)};
 async function assertFresh35ProtectedRecordSnapshotCurrent(){}
 function fresh35HostContext(token){need(contexts.has(token),'GENUINE_FIXED_CONTEXT_REQUIRED');return contexts.get(token)}
 async function assertFresh35HostCurrent(token){const c=fresh35HostContext(token);await assertFresh35Admin154RecordCurrent(c.successor);return c;}
 export function seed(successor,catalog,target,currentService){const token=Object.freeze({model:true});contexts.set(token,{admin154:true,productionImport:true,envelope:{},catalog,target,successor,currentService,currentServiceInputSha256:'a'.repeat(64),recordFileSha256:${JSON.stringify(ADMIN154_PREDECESSOR_RECORD_SHA256)},record:{programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64),binding:{sourceSetSha256:${JSON.stringify(ADMIN154_PREDECESSOR_SOURCE_SHA256)},targetSha256:'3'.repeat(64)}}});return token;}
 `;
 const text=(prefix+block+'\nexport {executeAdmin154Setup};').replace(/import\((['"])(\.{1,2}\/[^'"]+)\1\)/g,(_m,_q,p)=>'import('+JSON.stringify(new URL(p,url).href)+')');
 const api=await import(stub(text)),s=await fs.lstat(service,{bigint:true}),identity=[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
 const context=api.seed(successor,catalog,network.target,{identity,checkedAt:Date.now()-1000,expiresAt:Date.now()+60000,postmasterStart:expected.physical.postmasterStart});
 const write=async(binding,purpose)=>fs.writeFile(authority,JSON.stringify({format:'FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1',decision:purpose==='ADMIN_PROVISION_ONLY'?'AUTHORIZE_EXACT_ADMIN_PROVISION_ONLY':'AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK',binding,startsAt:Date.now()-500,expiresAt:Date.now()+30000,independentSafetyReviewSha256:'b'.repeat(64),authorizationReference:'SYNTHETIC MODEL ONLY'}),{mode:0o644});
 return {api,context,write,dir,value,close:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('admin154 setup is bound to a separate exact authority and cannot run import SQL or commit an incomplete setup',async()=>{
 const m=await hostModel();try{
  const prepared={purpose:'ADMIN_PROVISION_ONLY',request:buildAdminProvisionRequest({admin,operationId:'73000000-0000-0000-0000-000000000001',installationRecordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,setupReference:'SYNTHETIC'}),encodedScrypt:encoded};
  const binding=await m.api.describeFresh35Admin154SetupBinding(m.context,prepared);assert(!JSON.stringify(binding).includes(encoded));
  await m.write(binding,prepared.purpose);const auth=await m.api.loadFresh35ProductionImportAuthorization(m.context,binding),guard=m.api.fresh35Admin154SetupQueryGuard(m.context,auth,prepared);
  assert.throws(()=>m.api.fresh35ProductionImportQueryGuard(m.context,auth,prepared),/FIRST_REAL_MODE/);
  await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');await guard.check('SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2');
  await assert.rejects(guard.check('COMMIT'),/ORDER_INVALID/);
  const sql='SELECT naijue_erp.standard_admin_provision_only_v1($1::jsonb,$2::text)::text AS result_json';
  await assert.rejects(guard.check(sql,[JSON.stringify({...prepared.request,mode:'NEW_EMPTY'}),encoded]),/REQUEST_DIFFERS/);
  await assert.rejects(guard.check('SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json',[]),/SETUP_SQL_NOT_ALLOWED/);
  await guard.check(sql,[JSON.stringify(prepared.request),encoded]);await guard.check('SET CONSTRAINTS ALL IMMEDIATE');await guard.check('COMMIT');
 }finally{await m.close();}
});

test('admin154 setup driver reports commit only after acknowledgement and preserves rollback/unknown outcomes',async()=>{
 const m=await hostModel();try{for(const fault of [null,'write','commit']){
  const request=buildAdminProvisionRequest({admin,operationId:'73000000-0000-0000-0000-000000000001',installationRecordSha256:ADMIN154_PREDECESSOR_RECORD_SHA256,setupReference:'SYNTHETIC'}),calls=[];let discarded=false;
  const client={async query(sql){calls.push(sql);if(sql==='COMMIT'&&fault==='commit')throw Error('SYNTHETIC COMMIT ACK LOST');
   if(sql.startsWith('SELECT')){if(fault==='write')throw Error('SYNTHETIC SQL ERROR');return {command:'SELECT',rows:[{result_json:JSON.stringify({state:'PENDING_TRANSACTION',request_sha256:'a'.repeat(64),receipt:{operationId:request.operation_id,kind:'STAFF',targetId:admin.staff_id,version:1}})}]};}
   return {command:sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET')?'SET':sql};},async discard(){discarded=true;}};
  const result=await m.api.executeAdmin154Setup(client,{request,encodedScrypt:encoded});assert.equal(result.state,fault==='write'?'ROLLED_BACK':fault==='commit'?'UNKNOWN':'COMMITTED');
  assert.equal(discarded,fault==='commit');if(fault==='write')assert.equal(calls.at(-1),'ROLLBACK');
 }}finally{await m.close();}
});

test('admin154 REAL host keeps independent source cursors and binds the exact provisioned origin and complete original program',async()=>{
 const m=await hostModel();let plan;try{
  let p=createSyntheticPackage();p.manifest.package_kind='REAL';p.manifest.inventory_source.kind='NEW_AFTERNOON_SNAPSHOT';p.reports['decisions.json'].package_kind='REAL';p.reports['reconciliation.json'].package_kind='REAL';
  const reg=deriveStandardSourceRegistration({source_namespace:p.manifest.source_namespace,source_files:p.manifest.source_files,cutoff_at:p.manifest.inventory_source.cutoff_at});for(const table of ['sales_header','transfer_header'])for(const row of p.records[table])row.fields.import_batch_id=reg.batch_id;p=repinSyntheticPackage(p);
  const pkg=join(m.dir,'pkg'),report=join(m.dir,'report');for(const [path,bytes]of Object.entries(p.artifacts)){await fs.mkdir(dirname(join(pkg,path)),{recursive:true});await fs.writeFile(join(pkg,path),bytes);}
  const bytes=Buffer.from(JSON.stringify(p.manifest));await fs.writeFile(join(pkg,'manifest.json'),bytes);
  const summary=await streamPreflight(pkg,report,{expectedManifestSha256:hash(bytes)});assert(summary.checks_passed&&summary.complete_package_validation);
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:t.physical.systemIdentifier,database_oid:t.physical.databaseOid,database_name:t.proposal.database,catalog_sha256:m.value.successor.catalogSha256},index=join(report,'index.sqlite');
  plan=await prepareStreamPlan(index,summary,bytes,{target,initialization_identity:admin});
  const prepared=await m.api.prepareFresh35Admin154Import(plan,index,summary,admin,{operation_id:'73000000-0000-0000-0000-000000000001',request_sha256:'d'.repeat(64)},encoded);
  await assert.rejects(m.api.describeFresh35ProductionImportBinding(m.context,{...prepared}),/FIRST_REAL_MODE/,'a copied prepared object has no original source-plan binding');
  const binding=await m.api.describeFresh35ProductionImportBinding(m.context,prepared);await m.write(binding,prepared.purpose);
  const auth=await m.api.loadFresh35ProductionImportAuthorization(m.context,binding),guard=m.api.fresh35ProductionImportQueryGuard(m.context,auth,prepared);
  await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');await guard.check('SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2');
  await guard.check('SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json',[JSON.stringify(prepared.initialize),encoded]);
  await guard.check('SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2');
  await assert.rejects(guard.check('COMMIT'),/COMPLETE_ORIGINAL_STEPS/);
  let ordinal=1;for await(const step of prepared.steps){const phase=step.method==='masterChunk'?'MASTER':step.method==='baselineKeys'?'KEYS':step.method==='documentChunk'?'DOCUMENTS':'PUBLISH';
   await guard.check('SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json',[prepared.initialize.operation_id,ordinal++,phase,JSON.stringify(step.request)]);}
  await guard.check('SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json',[prepared.initialize.operation_id]);await guard.check('SET CONSTRAINTS ALL IMMEDIATE');await guard.check('COMMIT');
 }finally{await plan?.dispose();await m.close();}
});

test('generic wire helpers and malformed startup selection cannot mint a154 physical authority or silently choose 152',async()=>{
 let touched=false;const client={async query(){touched=true;throw Error('MUST NOT QUERY');},async discard(){}};
 await assert.rejects(withReviewedWholeSession(client,{}, {},{},async()=>{},async()=>{},'FRESH35_A53_ADMIN154_V1'),/FIXED_PHYSICAL_AUTHORIZED_HOST_REQUIRED/);assert.equal(touched,false);
 await assert.rejects(admitFresh35OrdinaryPoolV2({connect:async()=>{touched=true;}},{host:'never-connected.invalid',port:5432,database:'SYNTHETIC',user:'SYNTHETIC'},{sha256:'a'.repeat(64),capacityExpiresAt:Date.now()+1000,admin154SuccessorSha256:'invalid'}),/EXPLICIT_RECORD_SHA_REQUIRED/);assert.equal(touched,false);
});
