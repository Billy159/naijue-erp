// Offline source. T45 starts/restores/stops its exact registered copy externally.
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {withB07QaIdentityFixture,QA_IDENTITY} from './qa-identity-schema19.mjs';
import {runDraftNormalHistory} from './draft-normal-history-v16.mjs';
const must=(ok,code)=>{if(!ok)throw Error(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const P='/Users/billy/Desktop/Workspace/project-007-业务管理系统';
export const OUTPUT=P+'/work/local-takeover-20261021-private-data/rapid-launch-20261022/b07-normal-identity-draft-20261026-01';
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
 let setupEnded=false,api,readPool;const result={status:'STARTED',fixtureActual:false,httpActual:false,automaticRetry:false};
 try{
  await setup.connect();await setup.query('SET ROLE naijue_erp_test');await setup.query('SET default_transaction_read_only=off');
  const safe=await withB07QaIdentityFixture({client:setup,input,recordPreparation:value=>record(plan.outputDirectory,'FIXTURE-INSERT-INTENT.json',value),
   afterSeed:async({withNormalSession})=>{
    result.fixtureActual=true;
    await setup.end();setupEnded=true;
    await originalChild(plan,'upgrade',join(plan.outputDirectory,'upgrade'));
    await originalChild(plan,'role',join(plan.outputDirectory,'role'));
    await record(plan.outputDirectory,'CURRENT-METADATA-READY.json',{status:'WAITING_ORIGINAL_INDEPENDENT_PURPOSE',metadataPath:join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-METADATA.json'),catalogPath:join(plan.outputDirectory,'role','ACTUAL-ORDINARY-V16-FULL-CATALOG.json'),qaIdentity:QA_IDENTITY});
    const gate=await waitForPurposeGate(plan.purposeGateFile,plan.purposeWaitMs);
    must(gate?.format==='B07_CURRENT_NORMAL_HISTORY_PURPOSE_GATE_1','B07_CURRENT_PURPOSE_GATE_REQUIRED');
    const template=JSON.parse((await pinned(gate.runtimeConfiguration)).toString('utf8'));
    const config=prepareOrdinaryConfiguration(template,input.target);
    const draft=JSON.parse((await pinned(gate.draftInput)).toString('utf8'));
    const review=JSON.parse((await pinned(gate.review,65536)).toString('utf8'));
    must(config.runtime26Review.reviewFile===gate.review.path&&config.runtime26Review.trustedReviewSha256===gate.review.sha256,'B07_EXACT_PURPOSE_PIN_REQUIRED');
    const pg=config.postgres.target,t=input.target;
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
    api=await createProductionRuntime26HistoryRevisionApplicationApi(config,{profile:'SOURCE_CONFIRMED_HISTORY_REVISION_V16'},driver);
    readPool=new BoundedPostgresPool(config.postgres,driver);
    const issuer=await createNativeRuntime26Issuer(readPool,{...config.runtime26Review,verificationProfile:'DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1'});
    await withNormalSession(api,async({privateCookie})=>{
     try{
      const actual=await runDraftNormalHistory({api,pool:issuer.pool,runtime26:issuer.runtime26,input:draft,privateCookie,
       recordRequest:value=>record(plan.outputDirectory,'REQUEST-'+value.phase+'.json',value),readBackgroundFailureCount:()=>api.postgresBackgroundFailureCount+readPool.backgroundFailureCount});
      await record(plan.outputDirectory,'DRAFT-ACTUAL-RESULT.json',actual);result.httpActual=true;
     }catch(e){if(e.b07Result)await record(plan.outputDirectory,'DRAFT-ACTUAL-RESULT.json',e.b07Result);throw Error('B07_DRAFT_FAILED_OR_OUTCOME_UNCERTAIN');}
    });
   }});
  result.status=safe.status;
 }catch(e){result.status='STOP_SAME_PARENT_OR_OUTCOME_UNCERTAIN_NO_REPLAY';result.errorCode=typeof e.message==='string'&&/^B07_[A-Z0-9_]+$/.test(e.message)?e.message:'B07_PARENT_FAILED_DETAIL_OMITTED';}
 finally{
  result.clientsClosed=true;
  for(const close of [()=>api?.close(),()=>readPool?.dispose(),()=>!setupEnded?setup.end():undefined])try{await close();}catch{result.clientsClosed=false;result.status='STOP_SAME_PARENT_CLEANUP_UNKNOWN';}
  await record(plan.outputDirectory,'PARENT-RESULT.json',result);
 }
 must(result.status==='QA_FIXTURE_AND_NORMAL_SESSION_SCOPE_COMPLETED'&&result.clientsClosed,'B07_PARENT_STOPPED_SEE_PRIVATE_RESULT');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{must(process.argv.length===4&&process.argv[2]==='--registration','B07_PARENT_REGISTRATION_ARGUMENT_REQUIRED');
  const s=await lstat(process.argv[3]);must(s.isFile()&&!s.isSymbolicLink()&&s.size<=65536&&(s.mode&0o077)===0,'B07_PRIVATE_PARENT_REGISTRATION_REQUIRED');
  const result=await runB07QaIdentityParent(JSON.parse(await readFile(process.argv[3],'utf8')));console.log(JSON.stringify(result));
 }catch{console.error('B07_PARENT_STOPPED_NO_AUTOMATIC_REPLAY');process.exitCode=2;}
}
