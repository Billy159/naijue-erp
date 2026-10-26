// Offline source. T45 starts/restores/stops its exact registered copy externally.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {withB07QaIdentityFixture,QA_IDENTITY,SQL as fixtureSql} from './qa-identity-schema19.mjs';
import {runDraftNormalHistory,runDraftNormalHistoryCommittedContinuation} from './draft-normal-history-v16.mjs';
import {withB07QaIdentityCredentialRenewal,validateCredentialRenewalInput,credentialPermissionProofFromOriginal} from './qa-identity-credential-renewal.mjs';
const must=(ok,code)=>{if(!ok)throw Error(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const P='/Users/billy/Desktop/Workspace/project-007-业务管理系统';
export const OUTPUT=P+'/work/local-takeover-20261021-private-data/rapid-launch-20261022/b07-normal-identity-draft-20261026-07';
export const EFFECTIVE_VALUE_PROFILE='26_v21_history_effective_value_from_v16_v14';
const OLD_EFFECTIVE_BODY='c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7';
const NEW_EFFECTIVE_BODY='4fbbebd6b335359b80c7df38efc99a30cb666902158c3e1f911e3c869ebac363';
const EFFECTIVE_INPUTS={patch:{bytes:6623,sha256:'c8fb573e62af9055cd4532266890b64e680e0db4556edeb3e33c1bf6c5c33d57'},
 metadata:{bytes:21680,sha256:'d41119c66a2267d44a631d386990c2065fcec386dfc34799ddac6b1064e15153'},
 finiteCheck:{bytes:2593,sha256:'9cb96045ba4eafe41183243d967a8355adaca19037e27385d0bde2762a0ac497'}};
const CHILDREN={
 upgrade:{bytes:8610,sha256:'bdc80798752cb3c9be6d533fc7f590e6938d5b838f0ae20c8c2d37e10af6bde5',literal:"B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution/B07-EXISTING-COPY-V16-UPGRADE-SUCCESSOR-20261026'"},
 role:{bytes:11744,sha256:'01a2b14ab308c97d860134c7581257a6b6c22e91e862c342c157a5ee4f10eafe',literal:"B=P+'/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/server-execution/B07-ORDINARY-RUNTIME-ACL-PREPARATION-20261026'"}
};
const ORIGINAL_INPUTS={
 upgrade:{'V16-UPGRADE-REGISTRATION.json':'7875e12ebd045a54aa9b5e66d42e76e366382f19b4d2367b8c10dfaa7eef8cfb'},
 role:{'ORDINARY-ROLE-REGISTRATION.json':'0da7bdb661a6f9193990a65e55e9a9960a193a7c5bdc2bf911394c60c7b1a92e',
 'EXACT-ORDINARY-ROLE.sql':'cb6e8876f6c832efba88b40931085e3c9049e4a4d8bf353541c37c564ae5dc96',
 'METADATA-V16-FROM-V14.sql':'66addf1e6c1f9d548f9b60e0c12d3dde2eb2f5a0f6408dee586436b87a2458a7',
 'CATALOGUE-V16-FROM-V14.sql':'1013d1d52df60725adf226ccba259838c245a34ae5b8f4474d6e735197adbf48'}
};
export function prepareOrdinaryConfiguration(config,target){
 const pg=config.postgres.target;
 must(pg.password===null&&pg.database===target.database&&pg.host===target.unix_socket_directories&&pg.port===target.port&&pg.ssl===false,'B07_CONFIGURATION_MUST_NOT_STORE_CREDENTIALS');
 // Existing Unix-only trust decides authentication. This RAM-only random value
 // satisfies bounded config shape; it is not a role-password claim or change.
 return {...config,postgres:{...config.postgres,target:{...pg,password:randomBytes(32).toString('base64url')}}};
}
export const ordinaryDriver=Pool=>options=>new Pool({...options,options:'-c default_transaction_read_only=off'});
export async function pinned(ref,max=2*1024*1024){
 must(ref&&resolve(ref.path)===ref.path&&Number.isInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=max&&/^[0-9a-f]{64}$/.test(ref.sha256),'B07_PARENT_PIN_REQUIRED');
 const s=await lstat(ref.path);must(s.isFile()&&!s.isSymbolicLink()&&s.size===ref.bytes,'B07_PARENT_FILE_REQUIRED');
 const b=await readFile(ref.path);must(b.length===ref.bytes&&hash(b)===ref.sha256,'B07_PARENT_PIN_CHANGED');return b;
}
/** Only the original single B output-directory literal changes. SQL, target,
 * reference reads, assertions and original result recording remain unchanged. */
export function relocateOriginalChild(source,oldLiteral,newDirectory){
 must(typeof source==='string'&&source.split(oldLiteral).length===2&&oldLiteral.startsWith("B=P+'")&&oldLiteral.endsWith("'"),'B07_EXACT_ORIGINAL_OUTPUT_LITERAL_REQUIRED');
 must(resolve(newDirectory)===newDirectory,'B07_PARENT_OUTPUT_REQUIRED');
 return source.replace(oldLiteral,'B='+JSON.stringify(newDirectory));
}
async function record(directory,name,value){await writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
const stable=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function loadEffectiveValueInputs(refs){
 must(refs&&Object.keys(refs).sort().join(',')==='finiteCheck,metadata,patch','B07_EFFECTIVE_VALUE_INPUTS_REQUIRED');
 const sql={};for(const [name,expected] of Object.entries(EFFECTIVE_INPUTS)){
  must(refs[name]?.bytes===expected.bytes&&refs[name]?.sha256===expected.sha256,'B07_EFFECTIVE_VALUE_EXACT_PIN_REQUIRED');
  sql[name]=(await pinned(refs[name])).toString('utf8');
 }return sql;
}
export function assertOnlyEffectiveValueBodyChanged(before,after){
 const normalize=(manifest,body)=>{
  const copy=structuredClone(manifest);delete copy.identity;
  must(Array.isArray(copy.routines)&&copy.routines.length===129,'B07_EFFECTIVE_VALUE_EXACT_129_REQUIRED');
  const rows=copy.routines.filter(x=>x.name==='history_effective_writes_closed'&&x.identity_arguments==='');
  must(rows.length===1&&rows[0].body_sha256===body&&typeof rows[0].source==='string'&&hash(rows[0].source)===body
   &&rows[0].body_md5===createHash('md5').update(rows[0].source).digest('hex')&&/^[a-f0-9]{64}$/.test(rows[0].definition_sha256),'B07_EFFECTIVE_VALUE_EXACT_BODY_REQUIRED');
  for(const key of ['source','body_md5','body_sha256','definition_sha256'])delete rows[0][key];return copy;
 };
 must(stable(normalize(before,OLD_EFFECTIVE_BODY))===stable(normalize(after,NEW_EFFECTIVE_BODY)),'B07_UNRELATED_CATALOG_CHANGE_REFUSED');
}
const lastCommand=answer=>(Array.isArray(answer)?answer:[answer]).at(-1)?.command;
async function fileRef(path){const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:hash(bytes)};}
/** The only new actual step: exact fixed SQL leaf, finite substatements and
 * ordinary-role metadata. No application password is supplied to this scope. */
export async function applyEffectiveValueSuccessor({plan,input,Client}){
 const sql=await loadEffectiveValueInputs(plan.effectiveValue);
 const catalogRef=plan.role.files.find(x=>x.name==='CATALOGUE-V16-FROM-V14.sql')?.ref;
 must(catalogRef?.bytes===7145&&catalogRef.sha256===ORIGINAL_INPUTS.role['CATALOGUE-V16-FROM-V14.sql'],'B07_ORIGINAL_CATALOG_PIN_REQUIRED');
 const catalogSql=(await pinned(catalogRef)).toString('utf8');
 const roleRef=plan.role.files.find(x=>x.name==='ORDINARY-ROLE-REGISTRATION.json')?.ref;
 must(roleRef?.sha256===ORIGINAL_INPUTS.role['ORDINARY-ROLE-REGISTRATION.json'],'B07_ORIGINAL_ROLE_PIN_REQUIRED');
 const runtimeRole=JSON.parse((await pinned(roleRef)).toString('utf8')).runtimeRole;
 const before=JSON.parse(await readFile(join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-FULL-CATALOG.json'),'utf8'));
 const beforeMetadata=JSON.parse(await readFile(join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-METADATA.json'),'utf8'));
 const directory=join(plan.outputDirectory,'history-effective-value');await mkdir(directory,{mode:0o700});
 const out={status:'STARTED',stage:'CONNECT_SETUP',installAttempted:false,commitReturned:false,finiteRollbackReturned:false,metadataReadReturned:false,clientsClosed:false};
 const clients=[];let ordinary,reading=false,readCommitAttempted=false;
 const connect=async user=>{const client=new Client({host:input.target.unix_socket_directories,port:input.target.port,database:input.target.database,user,
  password:()=>{throw Error('B07_NO_CREDENTIAL_FALLBACK');},ssl:false,application_name:'t45_b07_effective_value_successor',connectionTimeoutMillis:3000,query_timeout:30000,statement_timeout:25000,lock_timeout:4000});clients.push(client);await client.connect();return client;};
 const identity=async(client,role,sessionRole)=>{
  const {unix_socket_directories,...expected}=input.target;
  must(client.connectionParameters?.host===unix_socket_directories&&client.connectionParameters?.port===expected.port,'B07_CONNECTED_TRANSPORT_CHANGED');
  const rows=(await client.query(fixtureSql.target)).rows;
  must(rows.length===1&&stable(rows[0])===stable({...expected,role,session_role:sessionRole}),'B07_EFFECTIVE_VALUE_TARGET_CHANGED');
 };
 try{
  const owner=await connect(input.target.session_role);await owner.query('SET ROLE naijue_erp_test');await owner.query('SET default_transaction_read_only=off');
  await identity(owner,'naijue_erp_test',input.target.session_role);
  out.stage='INSTALL';await record(directory,'INSTALL-INTENT.json',{patch:plan.effectiveValue.patch,target:input.target,profile:EFFECTIVE_VALUE_PROFILE,automaticReplay:false});
  out.installAttempted=true;const installed=await owner.query(sql.patch);must(lastCommand(installed)==='COMMIT','B07_EFFECTIVE_VALUE_COMMIT_UNCONFIRMED');out.commitReturned=true;
  await record(directory,'INSTALL-COMMIT.json',{commitReturned:true,patch:plan.effectiveValue.patch,profile:EFFECTIVE_VALUE_PROFILE});
  out.stage='CONNECT_ORDINARY';ordinary=await connect(runtimeRole);await identity(ordinary,runtimeRole,runtimeRole);out.ordinaryRole=runtimeRole;
  out.stage='FINITE_CHECK';await record(directory,'FINITE-CHECK-INTENT.json',{sql:plan.effectiveValue.finiteCheck,ordinaryRole:runtimeRole,noBusinessDml:true});
  const checked=await ordinary.query(sql.finiteCheck);must(lastCommand(checked)==='ROLLBACK','B07_EFFECTIVE_VALUE_FINITE_ROLLBACK_UNCONFIRMED');
  out.finiteRollbackReturned=true;await record(directory,'FINITE-CHECK-RESULT.json',{status:'PASS_EXACT_THREE_SRF_SUBSTATEMENTS_NOT_BUSINESS_ACCEPTANCE',rollbackReturned:true});
  out.stage='NEW_METADATA';await ordinary.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');reading=true;
  const m=(await ordinary.query(sql.metadata)).rows,c=(await ordinary.query(catalogSql)).rows;
  must(m.length===1&&c.length===1,'B07_EFFECTIVE_VALUE_METADATA_REQUIRED');const metadata=m[0].row_to_json,catalog=c[0].manifest;
  must(metadata?.source_routines_match===true&&stable(metadata.migration_versions)===stable(Array.from({length:26},(_,i)=>i+1))
   &&metadata.catalog_sha256===c[0].canonical_sha256&&/^[a-f0-9]{64}$/.test(metadata.catalog_sha256)
   &&metadata.catalog_sha256!==beforeMetadata.catalog_sha256,'B07_EFFECTIVE_VALUE_NEW_CATALOG_REQUIRED');
  const i=metadata.identity,t=input.target;
  must(i?.database===t.database&&i.database_oid===t.oid&&i.current_user===runtimeRole&&i.session_user===runtimeRole
   &&i.postmaster_start===t.postmaster_started_at&&i.server_addr===null&&i.server_port===null&&i.replication_role==='origin','B07_EFFECTIVE_VALUE_METADATA_IDENTITY_CHANGED');
  assertOnlyEffectiveValueBodyChanged(before,catalog);
  readCommitAttempted=true;await ordinary.query('COMMIT');reading=false;out.metadataReadReturned=true;
  await record(directory,'ACTUAL-V21-METADATA.json',metadata);await record(directory,'ACTUAL-V21-FULL-CATALOG.json',catalog);
  out.metadataRef=await fileRef(join(directory,'ACTUAL-V21-METADATA.json'));out.catalogRef=await fileRef(join(directory,'ACTUAL-V21-FULL-CATALOG.json'));
  out.catalogSha256=metadata.catalog_sha256;out.profile=EFFECTIVE_VALUE_PROFILE;out.status='PASS_V21_INSTALL_FINITE_AND_CURRENT_METADATA';
 }catch(e){out.status='STOP_V21_INSTALL_OR_OUTCOME_UNCERTAIN_NO_REPLAY';if(typeof e.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code))out.databaseErrorCode=e.code;
  if(reading&&!readCommitAttempted)try{await ordinary.query('ROLLBACK');out.metadataFailureRollbackReturned=true;}catch{out.metadataFailureRollbackReturned=false;}
 }finally{
  out.clientsClosed=true;for(const client of clients)try{await client.end();}catch{out.clientsClosed=false;out.status='STOP_V21_CLIENT_CLEANUP_UNKNOWN';}
  await record(directory,'SUCCESSOR-RESULT.json',out);
 }
 if(out.status!=='PASS_V21_INSTALL_FINITE_AND_CURRENT_METADATA'||!out.clientsClosed){const error=Error('B07_V21_SUCCESSOR_NOT_READY');error.successorResult=out;throw error;}
 return out;
}
export async function runOriginalChild({node,source,timeoutMs}){
 must(resolve(node)===node&&Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=260000,'B07_BOUNDED_CHILD_REQUIRED');
 // No password/cookie/config/body in argv, environment or stdin. Source contains
 // only the original reviewed child and its relocated private output path.
 await new Promise((ok,no)=>{
  const child=spawn(node,['--input-type=module'],{env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',TZ:'Asia/Shanghai'},stdio:['pipe','pipe','pipe']});
  let bytes=0,failed=false,settled=false;
  const interrupt=()=>{failed=true;child.kill('SIGKILL');};
  process.once('SIGTERM',interrupt);process.once('SIGINT',interrupt);
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);process.removeListener('SIGTERM',interrupt);process.removeListener('SIGINT',interrupt);error?no(Error(error)):ok();};
  const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},timeoutMs);
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;if(bytes>1024*1024){failed=true;child.kill('SIGKILL');}});
  child.once('error',()=>finish('B07_ORIGINAL_CHILD_START_FAILED'));
  child.once('close',code=>finish(failed||code!==0?'B07_ORIGINAL_CHILD_FAILED_OR_UNKNOWN':null));
  child.stdin.on('error',()=>{});child.stdin.end(source);
 });
}
export async function waitForPurposeGate(path,waitMs){
 must(resolve(path)===path&&Number.isInteger(waitMs)&&waitMs>=0&&waitMs<=300000,'B07_BOUNDED_PURPOSE_WAIT_REQUIRED');
 const deadline=Date.now()+waitMs;
 for(;;){
  try{const s=await lstat(path);must(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=65536&&(s.mode&0o077)===0,'B07_PRIVATE_PURPOSE_GATE_REQUIRED');return JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw Error('B07_PURPOSE_GATE_INVALID');}
  must(Date.now()<deadline,'B07_CURRENT_PURPOSE_GATE_NOT_READY');await delay(Math.min(1000,deadline-Date.now()));
 }
}
async function originalChild(plan,kind,directory){
 const child=plan[kind],source=(await pinned(child.script)).toString('utf8');
 await mkdir(directory,{mode:0o700});
 for(const file of child.files){must(/^[A-Za-z0-9._-]+$/.test(file.name),'B07_FIXED_CHILD_FILE_REQUIRED');await writeFile(join(directory,file.name),await pinned(file.ref),{flag:'wx',mode:0o600});}
 await runOriginalChild({node:plan.node,source:relocateOriginalChild(source,child.outputLiteral,directory),timeoutMs:child.timeoutMs});
 const result=JSON.parse(await readFile(join(directory,child.resultFile),'utf8'));
 must(result.status===child.expectedStatus&&result.clientsEnded!==false&&result.clientEnded!==false,'B07_ORIGINAL_CHILD_RESULT_REQUIRED');
 return result;
}
async function runOrdinaryHistoryScope({plan,input,successor,withNormalSession,result,resources,runHistory=runDraftNormalHistory,committedContinuation}){
 const at=p=>import(pathToFileURL(resolve(input.sourceRoot,p)).href);
    const gate=await waitForPurposeGate(plan.purposeGateFile,plan.purposeWaitMs);
    must(gate?.format==='B07_CURRENT_NORMAL_HISTORY_PURPOSE_GATE_1','B07_CURRENT_PURPOSE_GATE_REQUIRED');
    const template=JSON.parse((await pinned(gate.runtimeConfiguration)).toString('utf8'));
    const config=prepareOrdinaryConfiguration(template,input.target);
    const draft=JSON.parse((await pinned(gate.draftInput)).toString('utf8'));
    const review=JSON.parse((await pinned(gate.review,65536)).toString('utf8'));
    must(review.catalog?.patchLevel===EFFECTIVE_VALUE_PROFILE&&review.catalog?.sha256===successor.catalogSha256,'B07_NEW_V21_REVIEW_REQUIRED');
    must(config.runtime26Review.reviewFile===gate.review.path&&config.runtime26Review.trustedReviewSha256===gate.review.sha256,'B07_EXACT_PURPOSE_PIN_REQUIRED');
    const pg=config.postgres.target,t=input.target;must(pg.user===successor.ordinaryRole,'B07_EXACT_SUCCESSOR_ORDINARY_ROLE_REQUIRED');
    must(pg.database===t.database&&pg.host===t.unix_socket_directories&&pg.port===t.port&&pg.ssl===false&&pg.user===review.target.actingRole
     &&review.target.database===t.database&&review.target.databaseOid===t.oid&&review.target.sessionUser===pg.user
     &&review.target.postmasterStart===t.postmaster_started_at&&review.target.serverAddress===null&&review.target.serverPort===null,'B07_CURRENT_NONOWNER_REVIEW_REQUIRED');
    must(draft.actor.accountId===QA_IDENTITY.accountId&&draft.actor.hallId===null&&draft.target.database===t.database&&draft.target.oid===t.oid&&draft.target.role===pg.user
     &&draft.sourceRoot===input.sourceRoot&&draft.origin===config.publicOrigin,'B07_EXPLICIT_QA_SUCCESSOR_INPUT_REQUIRED');
    const {Pool}=await at('node_modules/pg/esm/index.mjs');
    // Exact ordinary-role sessions only; preserve the postmaster default and
    // shared HBA. Normal auth/HREV BEGIN must not inherit diagnostic READ ONLY.
    const driver=ordinaryDriver(Pool);
    const {createProductionRuntime26HistoryRevisionApplicationApi}=await at('apps/api/src/production-provider-composition.ts');
    const {BoundedPostgresPool}=await at('adapters/postgres/src/bounded-pool.ts');
    const {createNativeRuntime26Issuer}=await at('adapters/postgres/src/native-import-accounting-capability.ts');
    const api=await createProductionRuntime26HistoryRevisionApplicationApi(config,{profile:'SOURCE_CONFIRMED_HISTORY_REVISION_V16'},driver);
    resources.api=api;
    const readPool=new BoundedPostgresPool(config.postgres,driver);resources.readPool=readPool;
    const issuer=await createNativeRuntime26Issuer(readPool,{...config.runtime26Review,verificationProfile:'DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1'});
    await withNormalSession(api,async({privateCookie})=>{
     try{
      const actual=await runHistory({api,pool:issuer.pool,runtime26:issuer.runtime26,input:draft,privateCookie,...(committedContinuation?{committedContinuation}:{}),
       recordRequest:value=>record(plan.outputDirectory,'REQUEST-'+value.phase+'.json',value),recordObservation:value=>record(plan.outputDirectory,'HTTP-'+value.phase+'-'+value.comparisonStage+'.json',value),readBackgroundFailureCount:()=>api.postgresBackgroundFailureCount+readPool.backgroundFailureCount});
      await record(plan.outputDirectory,'DRAFT-ACTUAL-RESULT.json',actual);result.httpActual=true;
     }catch(e){if(e.b07Result)await record(plan.outputDirectory,'DRAFT-ACTUAL-RESULT.json',e.b07Result);throw Error('B07_DRAFT_FAILED_OR_OUTCOME_UNCERTAIN');}
    });
}
export async function runB07QaIdentityParent(plan){
 must(plan?.contract==='B07_QA_SAME_PARENT_1'&&plan.outputDirectory===OUTPUT&&plan.purposeGateFile===join(OUTPUT,'CURRENT-PURPOSE-GATE.json'),'B07_PARENT_REGISTRATION_REQUIRED');
 const input=plan.fixtureInput;must(input?.target?.role==='naijue_erp_test','B07_SETUP_ROLE_REQUIRED');
 must(typeof input.target.postmaster_started_at==='string'&&input.target.postmaster_started_at.length>0
  &&typeof input.sourceActorAccountId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.sourceActorAccountId)
  &&typeof input.createdAt==='string'&&new Date(input.createdAt).toISOString()===input.createdAt
  &&typeof input.preservedSnapshotReference==='string'&&input.preservedSnapshotReference.length>0,'B07_LIVE_FIXTURE_REGISTRATION_REQUIRED');
 must(input.sourceRoot===P+'/work/erp-local-source-20261022'&&plan.node===P+'/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node','B07_FIXED_SOURCE_AND_NODE_REQUIRED');
 must(plan.upgrade.resultFile==='V16-UPGRADE-RESULT.json'&&plan.role.resultFile==='ROLE-ACL-RESULT.json','B07_ORIGINAL_RESULT_FILES_REQUIRED');
 must(plan.upgrade.timeoutMs+plan.role.timeoutMs+plan.purposeWaitMs<=800000,'B07_TOTAL_PRIVATE_WINDOW_REQUIRED');
 must(plan.upgrade.expectedStatus==='PASS_EXACT_V16_SCHEMA_ONLY_NORMAL_ROLE_SESSION_AND_REVIEW_STILL_REQUIRED'
  &&plan.role.expectedStatus==='PASS_ISOLATED_ORDINARY_ROLE_ACL_ONLY_FRESH_PURPOSE_REVIEW_AND_NORMAL_AUTH_PENDING','B07_ORIGINAL_CHILD_STATUSES_REQUIRED');
 await loadEffectiveValueInputs(plan.effectiveValue);
 // All leaf pins and both exact output replacements are checked before connect.
 for(const kind of ['upgrade','role']){const c=plan[kind],expected=CHILDREN[kind];must(c.script.bytes===expected.bytes&&c.script.sha256===expected.sha256&&c.outputLiteral===expected.literal,'B07_ORIGINAL_CHILD_SOURCE_REQUIRED');relocateOriginalChild((await pinned(c.script)).toString('utf8'),c.outputLiteral,join(plan.outputDirectory,kind));must(c.files.length===Object.keys(ORIGINAL_INPUTS[kind]).length&&new Set(c.files.map(f=>f.name)).size===c.files.length,'B07_ORIGINAL_INPUT_SET_REQUIRED');for(const f of c.files){must(ORIGINAL_INPUTS[kind][f.name]===f.ref.sha256,'B07_ORIGINAL_INPUT_PIN_REQUIRED');await pinned(f.ref);}}
 const d=resolve(input.sourceRoot,'../local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D1/B07-NORMAL-HISTORY-ACTUAL-v1');
 await pinned({path:join(d,'DRAFT-V16-COPY-UPGRADE-PLAN.json'),bytes:5825,sha256:'4dd7176e926c7fc0d419040cb2b2ded0b2ccacca6620a8582a3d42395e368664'});
 await pinned({path:join(d,'DRAFT-V16-TARGET-PRESENCE.sql'),bytes:1489,sha256:'a507d8cb85efd0c08882646e4215cad6c1f8e6180e29123ab4183493ecf18976'});
 await mkdir(plan.outputDirectory,{mode:0o700});
 const at=p=>import(pathToFileURL(resolve(input.sourceRoot,p)).href);
 const {Client}=await at('node_modules/pg/esm/index.mjs');
 const setup=new Client({host:input.target.unix_socket_directories,port:input.target.port,database:input.target.database,user:input.target.session_role,
  password:()=>{throw Error('B07_NO_CREDENTIAL_FALLBACK');},ssl:false,application_name:'t45_b07_same_parent_qa_fixture',connectionTimeoutMillis:3000,query_timeout:30000,statement_timeout:25000,lock_timeout:4000});
 let setupEnded=false;const resources={};const result={status:'STARTED',fixtureActual:false,httpActual:false,automaticRetry:false};
 try{
  await setup.connect();await setup.query('SET ROLE naijue_erp_test');await setup.query('SET default_transaction_read_only=off');
  const safe=await withB07QaIdentityFixture({client:setup,input,recordPreparation:value=>record(plan.outputDirectory,'FIXTURE-INSERT-INTENT.json',value),
   afterSeed:async({withNormalSession})=>{
    result.fixtureActual=true;
    await setup.end();setupEnded=true;
    await originalChild(plan,'upgrade',join(plan.outputDirectory,'upgrade'));
    await originalChild(plan,'role',join(plan.outputDirectory,'role'));
    let successor;try{successor=await applyEffectiveValueSuccessor({plan,input,Client});result.historyEffectiveValue=successor;}catch(e){result.historyEffectiveValue=e.successorResult??{status:'FAILED_BEFORE_INSTALL',clientsClosed:true};throw e;}
    await record(plan.outputDirectory,'CURRENT-METADATA-READY.json',{status:'WAITING_ORIGINAL_INDEPENDENT_PURPOSE',profile:EFFECTIVE_VALUE_PROFILE,metadataPath:successor.metadataRef.path,catalogPath:successor.catalogRef.path,metadataRef:successor.metadataRef,catalogRef:successor.catalogRef,catalogSha256:successor.catalogSha256,qaIdentity:QA_IDENTITY});
    await runOrdinaryHistoryScope({plan,input,successor,withNormalSession,result,resources});
   }});
  result.status=safe.status;
 }catch(e){result.status='STOP_SAME_PARENT_OR_OUTCOME_UNCERTAIN_NO_REPLAY';result.errorCode=typeof e.message==='string'&&/^B07_[A-Z0-9_]+$/.test(e.message)?e.message:'B07_PARENT_FAILED_DETAIL_OMITTED';if(typeof e.pgCode==='string'&&/^[0-9A-Z]{5}$/.test(e.pgCode))result.databaseErrorCode=e.pgCode;}
 finally{
  result.clientsClosed=result.historyEffectiveValue?.clientsClosed!==false;
  for(const close of [()=>resources.api?.close(),()=>resources.readPool?.dispose(),()=>!setupEnded?setup.end():undefined])try{await close();}catch{result.clientsClosed=false;result.status='STOP_SAME_PARENT_CLEANUP_UNKNOWN';}
  await record(plan.outputDirectory,'PARENT-RESULT.json',result);
 }
 must(result.status==='QA_FIXTURE_AND_NORMAL_SESSION_SCOPE_COMPLETED'&&result.clientsClosed,'B07_PARENT_STOPPED_SEE_PRIVATE_RESULT');
 return result;
}
export const COMMITTED_CONTINUATION_OUTPUT=join(OUTPUT,'credential-continuation-01');
export async function withB07QaManagedNormalSession({api,password,authVersion,work}){
 must(api?.app?.server?.listening===false&&typeof api.trustedOrigin==='string'&&typeof password==='string'&&password.length>0&&Number.isInteger(authVersion)&&authVersion>1&&typeof work==='function','B07_RENEWAL_NORMAL_SESSION_INPUT_REQUIRED');
 let cookie=null;
 try{
  const response=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:api.trustedOrigin,'content-type':'application/json'},payload:{loginName:QA_IDENTITY.loginName,password}});
  must(response.statusCode===200,'B07_RENEWAL_NORMAL_LOGIN_FAILED');
  const raw=response.headers['set-cookie'],cookies=typeof raw==='string'?[raw]:raw;must(Array.isArray(cookies)&&cookies.length>0,'B07_RENEWAL_COOKIE_MISSING');cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const session=await api.app.inject({method:'GET',url:'/auth/session',headers:{origin:api.trustedOrigin,cookie}});must(session.statusCode===200,'B07_RENEWAL_NORMAL_SESSION_FAILED');const a=session.json().principal;
  must(a?.accountId===QA_IDENTITY.accountId&&a.staffId===QA_IDENTITY.staffId&&a.role==='WAREHOUSE'&&a.hallId===null&&a.authVersion===authVersion,'B07_RENEWAL_PRINCIPAL_CHANGED');
  return await work({actor:{accountId:QA_IDENTITY.accountId,hallId:null},privateCookie:cookie});
 }finally{if(cookie){const out=await api.app.inject({method:'POST',url:'/auth/logout',headers:{origin:api.trustedOrigin,cookie,'content-type':'application/json'},payload:{}});must(out.statusCode===204,'B07_RENEWAL_LOGOUT_UNKNOWN');}cookie=null;password=null;}
}
export async function runB07QaIdentityCommittedContinuationParent(plan){
 must(plan?.contract==='B07_QA_COMMITTED_CONTINUATION_PARENT_1'&&plan.outputDirectory===COMMITTED_CONTINUATION_OUTPUT&&plan.purposeGateFile===join(COMMITTED_CONTINUATION_OUTPUT,'CURRENT-PURPOSE-GATE.json'),'B07_RENEWAL_PARENT_REGISTRATION_REQUIRED');
 must(Number.isInteger(plan.purposeWaitMs)&&plan.purposeWaitMs>0&&plan.purposeWaitMs<=300000,'B07_RENEWAL_BOUNDED_PURPOSE_REQUIRED');
 must(plan.permissionProof?.bytes===7000&&plan.permissionProof.sha256==='5422ea93dcf609be06c2664607c48bf0a86a282ab37b65028c1abce940d81f6f','B07_RENEWAL_EXACT_PERMISSION_PROOF_REQUIRED');
 const originalProof=JSON.parse((await pinned(plan.permissionProof,65536)).toString('utf8'));
 const base={...plan.renewalInput,ordinaryRole:plan.ordinaryRole,catalogSha256:plan.catalogSha256};
 const proof=credentialPermissionProofFromOriginal(originalProof,base);
 const input={...base,permissionProof:proof};
 must(input.sourceRoot===P+'/work/erp-local-source-20261022'&&plan.node===P+'/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node','B07_FIXED_SOURCE_AND_NODE_REQUIRED');
 must(typeof plan.ordinaryRole==='string'&&plan.ordinaryRole!==input.target.role&&plan.catalogSha256===proof.catalogSha256,'B07_RENEWAL_CURRENT_CATALOG_REQUIRED');
 must(plan.originalRequest?.path===join(OUTPUT,'REQUEST-DRAFT_SALES_QUANTITY_NO_STOCK.json'),'B07_RENEWAL_ORIGINAL_REQUEST_REQUIRED');
 const requestBytes=await pinned(plan.originalRequest,65536),request=JSON.parse(requestBytes.toString('utf8'));
 must(request.actor?.accountId===QA_IDENTITY.accountId&&request.actor.hallId===null&&request.phase==='DRAFT_SALES_QUANTITY_NO_STOCK'&&request.command?.expectedVersion===1&&request.target?.role===plan.ordinaryRole&&request.target.database===input.target.database&&request.target.oid===input.target.oid,'B07_RENEWAL_ORIGINAL_COMMITTED_REQUEST_REQUIRED');
 const {requestHash}=await import(pathToFileURL(resolve(input.sourceRoot,'packages/application/src/request-hash.ts')).href);
 input.originalSales={requestKey:request.command.requestKey,documentId:request.command.documentId,requestHash:requestHash({actorAccountId:QA_IDENTITY.accountId,command:request.command})};validateCredentialRenewalInput(input);
 await pinned(plan.currentMetadata);await pinned(plan.currentCatalog);
 const at=p=>import(pathToFileURL(resolve(input.sourceRoot,p)).href),{Client}=await at('node_modules/pg/esm/index.mjs');
 let connectCleanupUnknown=false,recoveryClientsClosed=true;
 const connect=async(readOnly=false)=>{const client=new Client({host:input.target.unix_socket_directories,port:input.target.port,database:input.target.database,user:input.target.session_role,password:()=>{throw Error('B07_NO_CREDENTIAL_FALLBACK');},ssl:false,application_name:'t45_b07_registered_qa_credential_lifecycle',connectionTimeoutMillis:3000,query_timeout:30000,statement_timeout:25000,lock_timeout:4000});
  try{await client.connect();await client.query('SET ROLE naijue_erp_test');await client.query(readOnly?'SET default_transaction_read_only=on':'SET default_transaction_read_only=off');return client;}catch(e){try{await client.end();}catch{connectCleanupUnknown=true;}throw e;}};
 await mkdir(plan.outputDirectory,{mode:0o700});
 let setup,setupEnded=false;const resources={},result={status:'STARTED',credentialRenewalActual:false,httpActual:false,automaticRetry:false};
 try{
  setup=await connect();
  const safe=await withB07QaIdentityCredentialRenewal({client:setup,input,recordPreparation:value=>record(plan.outputDirectory,'CREDENTIAL-RENEWAL-INTENT.json',value),runNormalSession:withB07QaManagedNormalSession,
   withRecoveryClient:async work=>{const recovery=await connect(true);try{return await work(recovery);}finally{try{await recovery.end();}catch{recoveryClientsClosed=false;throw Error('B07_RENEWAL_RECOVERY_CLOSE_UNKNOWN');}}},
   afterRenewal:async({withNormalSession,authVersion})=>{
    result.credentialRenewalActual=true;result.authVersion=authVersion;await setup.end();setupEnded=true;
    await record(plan.outputDirectory,'CURRENT-METADATA-READY.json',{status:'WAITING_ORIGINAL_INDEPENDENT_PURPOSE',profile:EFFECTIVE_VALUE_PROFILE,metadataPath:plan.currentMetadata.path,catalogPath:plan.currentCatalog.path,metadataRef:plan.currentMetadata,catalogRef:plan.currentCatalog,catalogSha256:plan.catalogSha256,qaIdentity:QA_IDENTITY});
    await runOrdinaryHistoryScope({plan,input,successor:{ordinaryRole:plan.ordinaryRole,catalogSha256:plan.catalogSha256},withNormalSession,result,resources,runHistory:runDraftNormalHistoryCommittedContinuation,committedContinuation:{requestBytes,sha256:plan.originalRequest.sha256}});
   }});
  result.status=safe.status;result.commitRecovered=safe.commitRecovered;
 }catch(e){result.status='STOP_CREDENTIAL_CONTINUATION_OR_OUTCOME_UNCERTAIN_NO_RETRY';result.errorCode=typeof e.message==='string'&&/^B07_[A-Z0-9_]+$/.test(e.message)?e.message:'B07_RENEWAL_PARENT_FAILED_DETAIL_OMITTED';if(e.b07RenewalFailure)result.renewalFailure=e.b07RenewalFailure;}
 finally{result.clientsClosed=!connectCleanupUnknown&&recoveryClientsClosed;for(const close of [()=>resources.api?.close(),()=>resources.readPool?.dispose(),()=>setup&&!setupEnded?setup.end():undefined])try{await close();}catch{result.clientsClosed=false;result.status='STOP_SAME_PARENT_CLEANUP_UNKNOWN';}if(!result.clientsClosed)result.status='STOP_SAME_PARENT_CLEANUP_UNKNOWN';await record(plan.outputDirectory,'PARENT-RESULT.json',result);}
 must(result.status==='QA_CREDENTIAL_RENEWAL_AND_NORMAL_SESSION_SCOPE_COMPLETED'&&result.clientsClosed,'B07_RENEWAL_PARENT_STOPPED_SEE_PRIVATE_RESULT');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{must(process.argv.length===4&&process.argv[2]==='--registration','B07_PARENT_REGISTRATION_ARGUMENT_REQUIRED');
  const s=await lstat(process.argv[3]);must(s.isFile()&&!s.isSymbolicLink()&&s.size<=65536&&(s.mode&0o077)===0,'B07_PRIVATE_PARENT_REGISTRATION_REQUIRED');
  const plan=JSON.parse(await readFile(process.argv[3],'utf8'));const result=await (plan.contract==='B07_QA_COMMITTED_CONTINUATION_PARENT_1'?runB07QaIdentityCommittedContinuationParent(plan):runB07QaIdentityParent(plan));console.log(JSON.stringify(result));
 }catch{console.error('B07_PARENT_STOPPED_NO_AUTOMATIC_REPLAY');process.exitCode=2;}
}
