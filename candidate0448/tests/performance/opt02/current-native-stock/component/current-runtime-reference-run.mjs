/** ONE fresh reference compilation only. No engine on import/help; no issuer,
 * expected/review self-signing, acceptance target, old target or production. */
import { Client } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { mkdir, readFile, writeFile, appendFile, lstat, realpath, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { captureData, createBudget, assertPhysicalIdentity, assertBootstrapIdentity, closedPortEvidence,
  runChildCommand, trackForeground, stopForeground, budgetedQuery, identifier } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { PIPE_PYTHON, pipeCommand } from '../../../../integration/runtime26-baseline/schema-objects-only/stdin-pipe-bridge.mjs';
import { stoppedControlEvidence } from '../../legacy-cutoff/physical-send.mjs';
import { loadPairedSourcePlan } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { compileFinitePolicy, LOGICAL } from '../reference-compiler-cohort-v2/universe.mjs';
import { MATERIAL, ADDENDUM } from '../contract.mjs';
import { SUCCESSOR_OBSERVATION, renderSequenceSystemCanonicalObservation, inspectSequenceSystemCanonicalObservation } from '../sequence-system-successor-observation.mjs';
import { NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE as probe } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { createCapturedQueryBoundary, preparePublishedCurrentReference } from './current-runtime-host.mjs';
import { observeFinitePolicy } from './policy-observer.mjs';

const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const SHA = bytes => createHash('sha256').update(bytes).digest('hex');
export const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
const WORK = '/workspace/scratch/1f717a486422', EVIDENCE = path.join(WORK, 'development-results-20261031');
const MATERIAL_ROOT = path.join(EVIDENCE, 'current-runtime-feasibility-independent-review');
const PG = path.join(WORK, 'toolchain/postgresql-17/root'), BIN = path.join(PG, 'usr/lib/postgresql/17/bin');
const RECEIPT = path.join(WORK, 'toolchain/postgresql-17/receipts/TOOLCHAIN-RESTORED.json');
const RECEIPT_SHA = '4c8f5c8b2699cdec2444dd6e9e838fa31b494bbed290bca1d5f1b1af33dbe7d6';
export const REFERENCE = Object.freeze({ runId: 'c20261101e001', port: 18571,
  base: path.join(EVIDENCE, 'pg-current-runtime-reference-c20261101e001'),
  sourceRoot: path.join(EVIDENCE, 'cumulative-C12-work/candidate'),
  pinsPath: path.join(EVIDENCE, 'performance-resume-20261101/current-reference-e001/SOURCE-PINS.json') });
export const HELP = 'Reference ONLY: --run-current-runtime-reference <independently-reviewed-SOURCE-PINS-sha256>\nFresh e001/127.0.0.1:18571; never acceptance/old targets. No engine on import/help.\n';
export function parseReferenceArgs(args) {
  need(Array.isArray(args) && Object.getPrototypeOf(args) === Array.prototype && Reflect.ownKeys(args).length === args.length + 1, 'CLOSED_REFERENCE_ARGUMENTS_REQUIRED');
  for (let i=0;i<args.length;i++) { const d=Object.getOwnPropertyDescriptor(args,String(i));need(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='string','PRIMITIVE_REFERENCE_ARGUMENT_REQUIRED'); }
  if (args.length===0 || args.length===1 && args[0]==='--help') return null;
  need(args.length===2 && args[0]==='--run-current-runtime-reference' && /^[a-f0-9]{64}$/.test(args[1]), 'EXACT_REFERENCE_FLAG_AND_TRUSTED_PIN_REQUIRED');
  return Object.freeze({ trustedPinsSha256: args[1] });
}
const environment = () => ({ PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',LD_LIBRARY_PATH:path.join(PG,'usr/lib/x86_64-linux-gnu') });
const PIN_FIELDS=Object.freeze(['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs']);
function samePinBirth(expected, actual) { for(const key of PIN_FIELDS)need(expected[key]===actual[key],'IMMUTABLE_REFERENCE_PIN_DRIFT:'+key); }
async function captureReferenceFile(file, expectedSha, maximum=256*1024*1024) {
  need(typeof file==='string' && path.isAbsolute(file) && path.resolve(file)===file && typeof expectedSha==='string' && /^[a-f0-9]{64}$/.test(expectedSha)
    && Number.isSafeInteger(maximum)&&maximum>0&&maximum<=256*1024*1024, 'PRIMITIVE_CANONICAL_REFERENCE_PIN_REQUIRED');
  const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(maximum)&&await realpath(file)===file,'CANONICAL_REGULAR_REFERENCE_FILE_REQUIRED');
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try { const s=await fd.stat({bigint:true});samePinBirth(before,s);const bytes=await fd.readFile(),after=await lstat(file,{bigint:true});samePinBirth(before,after);
    need(after.isFile()&&!after.isSymbolicLink()&&BigInt(bytes.length)===before.size&&await realpath(file)===file&&SHA(bytes)===expectedSha,'REFERENCE_FILE_OR_HASH_CHANGED');
    return {bytes,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,before[key]])))};
  } finally { await fd.close(); }
}
export async function canonicalReferenceFile(file,expectedSha,maximum) { return (await captureReferenceFile(file,expectedSha,maximum)).bytes; }
async function boundedPins(items, work) {
  let cursor=0;const outcomes=await Promise.allSettled(Array.from({length:Math.min(32,items.length)},async()=>{while(cursor<items.length){const i=cursor++;await work(items[i]);}}));
  const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;
}
/** Explicit test-host validation cadence: full SHA capture/bookends plus an
 * immutable no-adaptation registry at every verifySources call. Reads do not
 * change ctime. Restored bytes/mtime are NOT accepted after any identity drift. */
export async function createReferencePinRegistry(entries, aliases=[]) {
  need(Array.isArray(entries)&&Object.getPrototypeOf(entries)===Array.prototype&&entries.length>0&&entries.length<=20000&&Array.isArray(aliases),'BOUNDED_REFERENCE_REGISTRY_REQUIRED');
  const records=[],links=[],seen=new Set();
  // Capture hash and all metadata around the SAME no-follow descriptor read.
  for(const input of entries){const e=captureData(input,['path','sha256']);need(!seen.has(e.path),'DUPLICATE_REFERENCE_REGISTRY_PATH');seen.add(e.path);const full=await captureReferenceFile(e.path,e.sha256);records.push(Object.freeze({...e,birth:full.birth}));}
  for(const input of aliases){const a=captureData(input,['path','target']);need(typeof a.path==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target),'EXACT_REFERENCE_REGISTRY_ALIAS_REQUIRED');const birth=await lstat(a.path,{bigint:true});need(await realpath(a.path)===a.target,'REFERENCE_REGISTRY_ALIAS_TARGET_CHANGED');links.push(Object.freeze({...a,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,birth[key]])))}));}
  return Object.freeze({files:records.length,aliases:links.length,totalBytes:records.reduce((n,r)=>n+Number(r.birth.size),0),
    async verify(){
      await boundedPins(records,async r=>{const actual=await lstat(r.path,{bigint:true});samePinBirth(r.birth,actual);need(actual.isFile()&&!actual.isSymbolicLink()&&await realpath(r.path)===r.path,'REFERENCE_REGISTRY_CANONICAL_PATH_CHANGED');});
      await boundedPins(links,async a=>{samePinBirth(a.birth,await lstat(a.path,{bigint:true}));need(await realpath(a.path)===a.target,'REFERENCE_REGISTRY_ALIAS_CHANGED');});
      return {files:records.length,aliases:links.length,immutableBirthFields:[...PIN_FIELDS],noAdaptiveRehash:true};
    }});
}
async function readPins(trusted) {
  const raw=await canonicalReferenceFile(REFERENCE.pinsPath,trusted,2*1024*1024), p=captureData(JSON.parse(raw),['format','files','aliases']);
  need(p.format==='CURRENT_RUNTIME_REFERENCE_E001_SOURCE_PINS_V1'&&Array.isArray(p.files)&&Array.isArray(p.aliases)&&p.files.length>100,'COMPLETE_REFERENCE_SOURCE_PINS_REQUIRED');
  const receipt=JSON.parse(await canonicalReferenceFile(RECEIPT,RECEIPT_SHA)), libraries=new Map(receipt.runtimeSharedLibraries.map(x=>[x.path,x.sha256]));
  const python=await realpath(PIPE_PYTHON),node=await realpath(process.execPath),seen=new Set();
  const materialFiles=[MATERIAL.filename,ADDENDUM.filename,'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json','SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'].map(x=>path.join(MATERIAL_ROOT,x));
  for (const input of p.files) { const f=captureData(input,['path','sha256','kind']);
    need(typeof f.path==='string'&&path.isAbsolute(f.path)&&path.resolve(f.path)===f.path&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&['source','binary'].includes(f.kind)&&!seen.has(f.path)&&f.path!==REFERENCE.pinsPath,'CLOSED_UNIQUE_REFERENCE_FILE_PIN');
    need(f.path.startsWith(ROOT+'/')||f.path.startsWith(REFERENCE.sourceRoot+'/')||f.path.startsWith(path.join(WORK,'toolchain')+'/')||materialFiles.includes(f.path)||f.kind==='binary'&&(f.path===python||f.path===node||libraries.get(f.path)===f.sha256),'REFERENCE_PIN_OUTSIDE_SOURCE_BINARY_SCOPE');
    seen.add(f.path);await canonicalReferenceFile(f.path,f.sha256);
  }
  const own=path.join(ROOT,'tests/performance/opt02/current-native-stock/component');
  const required=['current-runtime-reference-run.mjs','current-runtime-reference-run.offline.test.mjs','current-runtime-host.mjs','policy-observer.mjs','five-role-guard.mjs','fixture.mjs','authorizer.mjs','publication.mjs','source-verification.mjs','install-source-schema.mjs'].map(x=>path.join(own,x));
  required.push(path.join(ROOT,'package.json'),path.join(ROOT,'package-lock.json'),path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),RECEIPT,python,node,...libraries.keys(),...materialFiles,...['postgres','initdb','pg_controldata'].map(x=>path.join(BIN,x)));
  const share=path.join(PG,'usr/share/postgresql/17');
  for(const entry of await readdir(share,{recursive:true,withFileTypes:true}))if(entry.isFile())required.push(path.join(entry.parentPath,entry.name));
  need(required.every(x=>seen.has(x)),'MANDATORY_REFERENCE_SOURCE_BINARY_LOCK_PINS_REQUIRED');
  for (const input of p.aliases) { const a=captureData(input,['path','target']);
    need(typeof a.path==='string'&&typeof a.target==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target)&&p.files.find(f=>f.path===a.target)?.kind==='binary'
      && (a.path===PIPE_PYTHON||a.path===process.execPath||a.path.startsWith(PG+'/'))&&await realpath(a.path)===a.target,'EXACT_REFERENCE_BINARY_ALIAS_REQUIRED'); }
  need(p.aliases.some(a=>a.path===PIPE_PYTHON&&a.target===python),'PINNED_ANONYMOUS_PIPE_INTERPRETER_REQUIRED');
  return { raw, p };
}
const absent=async p=>{try{await lstat(p);throw Error('REFERENCE_FRESH_PATH_ALREADY_EXISTS:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}};
async function physical(p) { const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(p)===p,'REFERENCE_PRIVATE_OWNED0700_REQUIRED');return {path:p,uid:s.uid,mode:s.mode&0o777,device:s.dev,inode:s.ino,canonical:true,symbolicLink:false}; }
async function freePort(port) { await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen({host:'127.0.0.1',port,exclusive:true},()=>s.close(resolve));}); }
async function portProof(port) { return await new Promise(resolve=>{let done=false;const s=createConnection({host:'127.0.0.1',port}),finish=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.setTimeout(1000);s.once('connect',()=>finish({state:'OPEN'}));s.once('error',e=>finish(closedPortEvidence(e.code)));s.once('timeout',()=>finish({state:'UNKNOWN',reason:'TIMEOUT'}));}); }
export function assertReferenceChild(actual, expected) {
  need(actual.uid===expected.uid&&actual.executable===expected.executable&&actual.data===expected.data&&actual.pid===expected.pid&&Number.isInteger(actual.pid)&&actual.pid>1,'OWNED_REFERENCE_FOREGROUND_IDENTITY_REQUIRED');
}
async function childIdentity(child, data) { const pid=child.pid,s=await lstat('/proc/'+pid),args=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0');const actual={pid,uid:s.uid,executable:args[0],data:args.includes('-D')?args[args.indexOf('-D')+1]:null};assertReferenceChild(actual,{pid,uid:process.getuid(),executable:path.join(BIN,'postgres'),data});return actual; }
export function assertReferenceObservation(row, target) {
  const r=captureData(row,['identity','migration_versions','catalog_sha256','source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match','observed_canonical_text']);
  need(JSON.stringify(r.migration_versions)===JSON.stringify(Array.from({length:26},(_,i)=>i+1)),'REFERENCE_EXACT_SCHEMA26_REQUIRED');
  for(const key of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])need(r[key]===true,'REFERENCE_ORIGINAL_PROOF_FALSE:'+key);
  const i=captureData(r.identity,['database','database_oid','database_owner','current_user','session_user','server_addr','server_port','server_version_num','postmaster_start','replication_role']);
  need(i.database===target.database&&i.database_oid===target.databaseOid&&i.database_owner===target.owner&&i.current_user===LOGICAL.runtime&&i.session_user===LOGICAL.runtime&&i.server_addr==='127.0.0.1/32'&&i.server_port===REFERENCE.port&&i.server_version_num==='170011'&&i.postmaster_start===target.postmasterStart&&i.replication_role==='origin','REFERENCE_CANONICAL_DIRECT_IDENTITY_REQUIRED');
  return inspectSequenceSystemCanonicalObservation({observed_canonical_text:r.observed_canonical_text,catalog_sha256:r.catalog_sha256});
}
export function referenceTerminal(result) { return !result.firstFailure&&!result.unknownOutcome&&result.observationPassed===true&&result.otherClients===0&&result.clientsClosed===true&&result.stopExitCode===0&&result.foregroundDefinitiveClose===true&&result.portState==='CLOSED'&&result.pidFileAbsent===true&&result.processAbsent===true&&result.controlShutDown===true&&result.sourcePostflight===true?'PASS_REFERENCE_OBSERVATIONS_ONLY_PENDING_INDEPENDENT_EXPECTED_REVIEW':'FAILED_REFERENCE_QUARANTINED_NO_REPLAY'; }

export async function runReference(input) {
  const budget=createBudget(Date.now()),o=captureData(input,['trustedPinsSha256']);need(typeof o.trustedPinsSha256==='string'&&/^[a-f0-9]{64}$/.test(o.trustedPinsSha256),'TRUSTED_REFERENCE_PINS_REQUIRED');
  need(ROOT===path.join(WORK,'naijue-erp-performance-eaed143d-20261101')&&process.versions.node==='24.21.0'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.NODE_PG_FORCE_NATIVE,'EXACT_REFERENCE_ROOT_NODE_NO_LOADER_REQUIRED');
  const pins=await readPins(o.trustedPinsSha256);
  const registry=await createReferencePinRegistry([...pins.p.files.map(f=>({path:f.path,sha256:f.sha256})),{path:REFERENCE.pinsPath,sha256:o.trustedPinsSha256}],pins.p.aliases);
  const {plan,cohort}=await loadPairedSourcePlan({sourceRoot:REFERENCE.sourceRoot});
  const texts={};for(const [key,file]of Object.entries({materialText:MATERIAL.filename,addendumText:ADDENDUM.filename,closureText:'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json',universeText:'SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'}))texts[key]=await readFile(path.join(MATERIAL_ROOT,file),'utf8');
  const policy=await compileFinitePolicy(plan,texts);need(plan.sourceFingerprint==='726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb','ORIGINAL_INSTALLATION_COHORT_REQUIRED');
  const nativeText=await readFile(path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),'utf8'),canonicalQuery=renderSequenceSystemCanonicalObservation({successorSourceText:nativeText,successorProbeText:probe});
  budget.remaining();await absent(REFERENCE.base);await freePort(REFERENCE.port);await mkdir(REFERENCE.base,{mode:0o700});
  const data=path.join(REFERENCE.base,'data'),baseBirth=await physical(REFERENCE.base),password=randomBytes(32).toString('base64url'),secrets=[password];
  const registerSecret=value=>{need(typeof value==='string'&&value.length>20,'RAM_ONLY_REFERENCE_SECRET_REQUIRED');secrets.push(value);};
  const sanitize=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
  const save=async(name,value)=>{need(/^[a-zA-Z0-9_.-]+$/.test(name),'CLOSED_REFERENCE_EVIDENCE_NAME');await writeFile(path.join(REFERENCE.base,name),sanitize(typeof value==='string'?value:JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n'),{flag:'wx',mode:0o600});};
  const boundary=createCapturedQueryBoundary({budget});let dataBirth=null,config=null,foreground=null,main=null,session=null,runtimeLease=null,target=null,birthId=null,firstFailure=null;
  const result={format:'FRESH_CURRENT_RUNTIME_REFERENCE_OBSERVATIONS_V1',status:'IN_PROGRESS_NOT_REVIEW',physicalRunId:REFERENCE.runId,logicalDatabase:LOGICAL.database,port:REFERENCE.port,startsAt:budget.startsAt,expiresAt:budget.expiresAt,sourcePinsSha256:o.trustedPinsSha256,sourceFingerprint:plan.sourceFingerprint,observationPassed:false,retainedData:true,authority:'NONE',noIssuerCreated:true,noExpectedOrReviewCreated:true,sourceValidationCadence:'FULL_HASH_BOOKENDS_AND_PHASES_IMMUTABLE_NS_REGISTRY_EVERY_VERIFY_ORIGINAL_BEFORE_FILE_SQL_SHA_RETAINED'};
  const birthCheck=async()=>{assertPhysicalIdentity(baseBirth,await physical(REFERENCE.base));if(dataBirth)assertPhysicalIdentity(dataBirth,await physical(data));};
  const verifyPhysical=async()=>{await birthCheck();if(config){need(SHA(await readFile(path.join(data,'postgresql.conf')))===config.conf&&SHA(await readFile(path.join(data,'pg_hba.conf')))===config.hba,'REFERENCE_CONFIG_CHANGED');}if(foreground){need(!foreground.state().closed&&!foreground.state().error,'REFERENCE_POSTMASTER_CLOSED');await childIdentity(foreground.child,data);}};
  const verifySources=async()=>{budget.remaining();await registry.verify();budget.remaining();};
  const fullSources=async(label,cleanup=false)=>{if(!cleanup)budget.remaining();await registry.verify();await readPins(o.trustedPinsSha256);await registry.verify();await save('full-source-'+label+'.json',{files:registry.files,aliases:registry.aliases,totalBytes:registry.totalBytes,allExpectedHashesMatched:true,originalRegistryNotRebased:true});if(!cleanup)budget.remaining();};
  const executablePin=async exe=>{await registry.verify();const actual=await realpath(exe),entry=pins.p.files.find(f=>f.path===actual&&f.kind==='binary');need(entry,'PINNED_NATIVE_EXECUTABLE_REQUIRED');await canonicalReferenceFile(actual,entry.sha256);if(exe!==actual)need(pins.p.aliases.some(a=>a.path===exe&&a.target===actual),'PINNED_NATIVE_EXEC_ALIAS_REQUIRED');};
  const command=async(exe,args,input='',cleanup=false)=>{await birthCheck();await executablePin(exe);return await runChildCommand(spawn,exe,args,{cwd:ROOT,env:environment(),input,timeoutMs:Math.min(cleanup?30000:60000,cleanup?30000:budget.remaining()),sanitize});};
  const query=async(sql,values=[])=>{await verifyPhysical();await verifySources();return await boundary.query(main,sql,values);};
  const connect=async database=>{const c=new Client({host:'127.0.0.1',port:REFERENCE.port,user:LOGICAL.admin,password,database,ssl:false,application_name:'dot-current-reference-bootstrap-only',options:'-c search_path=pg_catalog',connectionTimeoutMillis:Math.min(5000,budget.remaining()),query_timeout:45000,statement_timeout:45000,lock_timeout:3000,idle_in_transaction_session_timeout:60000});boundary.capture(c,'admin');await c.connect();return c;};
  try {
    await save('source-pins-ack.json',{sha256:o.trustedPinsSha256,files:pins.p.files.length,aliases:pins.p.aliases.length,sourceRoot:REFERENCE.sourceRoot,newApplicationRoot:ROOT,separateRealBrands:true});await fullSources('pre-initdb');await absent(data);
    const init=pipeCommand(path.join(BIN,'initdb'),['-D',data,'-L',path.join(PG,'usr/share/postgresql/17'),'-U',LOGICAL.admin,'--auth-local=reject','--auth-host=scram-sha-256','--pwfile=/dev/stdin','--encoding=UTF8','--locale=C']);
    await executablePin(path.join(BIN,'initdb'));const initialized=await command(init.executable,init.args,password+'\n');await save('initdb.json',initialized);need(initialized.code===0&&!initialized.timedOut&&!initialized.spawnError,'REFERENCE_INITDB_FAILED');dataBirth=await physical(data);
    await appendFile(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${REFERENCE.port}\nunix_socket_directories=''\nmax_connections=12\nshared_buffers='32MB'\nwork_mem='4MB'\ntimezone='UTC'\nlog_timezone='UTC'\nlogging_collector=off\nlog_statement='none'\nlog_min_error_statement=panic\nlog_error_verbosity=terse\n`);
    await writeFile(path.join(data,'pg_hba.conf'),`local all all reject\nhost postgres ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.runtime} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n`,{mode:0o600});
    config={conf:SHA(await readFile(path.join(data,'postgresql.conf'))),hba:SHA(await readFile(path.join(data,'pg_hba.conf')))};
    await fullSources('post-initdb');const control=await command(path.join(BIN,'pg_controldata'),[data]);await save('birth-control.txt',control.stdout);need(control.code===0&&!control.timedOut,'REFERENCE_BIRTH_CONTROL_FAILED');birthId=control.stdout.match(/^Database system identifier:\s+([0-9]+)$/m)?.[1];need(birthId,'ONE_REFERENCE_SYSTEM_IDENTIFIER_REQUIRED');
    await verifySources();await executablePin(path.join(BIN,'postgres'));const log=await open(path.join(REFERENCE.base,'postgres.log'),'wx',0o600);try{foreground=trackForeground(spawn(path.join(BIN,'postgres'),['-D',data],{cwd:ROOT,env:environment(),stdio:['ignore',log.fd,log.fd]}));}finally{await log.close();}
    need(Number.isInteger(foreground.child.pid)&&foreground.child.pid>1,'CAPTURED_FOREGROUND_REFERENCE_PID_REQUIRED');const readyUntil=Math.min(budget.expiresAt,Date.now()+30000);let ready=false;
    while(Date.now()<readyUntil){await verifyPhysical();budget.remaining();try{const lines=(await readFile(path.join(data,'postmaster.pid'),'utf8')).trimEnd().split('\n');need(Number(lines[0])===foreground.child.pid&&lines[1]===data&&Number(lines[2])>=Math.floor(budget.startsAt/1000)-1,'REFERENCE_PIDFILE_BIRTH_MISMATCH');if(lines[7]?.trim()==='ready'){ready=true;break;}}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}
    need(ready,'REFERENCE_READY_DEADLINE');await save('birth-receipt.json',{baseBirth,dataBirth,systemIdentifier:birthId,directChildPid:foreground.child.pid,configSha256:config.conf,hbaSha256:config.hba,tcpOnly:true,memoryOnlyScram:true});
    main=await connect('postgres');const bootstrap=(await query("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('server_version_num') AS version,current_setting('data_directory') AS data,inet_server_addr()=inet '127.0.0.1' AS address_match,inet_server_port() AS port,current_setting('unix_socket_directories') AS sockets")).rows[0];await save('bootstrap-identity.json',bootstrap);assertBootstrapIdentity(bootstrap,{systemIdentifier:birthId,data,port:REFERENCE.port});
    for(const name of [LOGICAL.sourceOwner,LOGICAL.sentinel,LOGICAL.preparation])await boundary.commit(()=>query(`CREATE ROLE ${identifier(name)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0`));
    await boundary.commit(()=>query(`CREATE DATABASE ${identifier(LOGICAL.database)} OWNER ${identifier(LOGICAL.sourceOwner)} TEMPLATE template0 ENCODING 'UTF8'`));await boundary.commit(()=>query(`REVOKE ALL ON DATABASE ${identifier(LOGICAL.database)} FROM PUBLIC`));
    need((await boundary.closeClient(main)).confirmed,'BOOTSTRAP_ADMIN_CLOSE_UNCONFIRMED');main=null;main=await connect(LOGICAL.database);
    const identity=(await query('SELECT (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,pg_postmaster_start_time()::text AS start')).rows[0];
    target=cohort.sourcePlan.targetSnapshot({systemIdentifier:birthId,database:LOGICAL.database,databaseOid:identity.oid,admin:LOGICAL.admin,owner:LOGICAL.sourceOwner,sentinel:LOGICAL.sentinel,prepare:LOGICAL.preparation,port:REFERENCE.port,postmasterStart:identity.start,startsAt:budget.startsAt,expiresAt:budget.expiresAt});await save('target-identity.json',{physicalRunId:REFERENCE.runId,target});await query(cohort.sourcePlan.targetGuard(target));
    const genesis=(await query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_default_acl) AND NOT EXISTS(SELECT 1 FROM pg_prepared_xacts) AS empty")).rows[0];need(genesis?.empty===true,'FRESH_REFERENCE_EMPTY_GENESIS_REQUIRED');await save('genesis.json',genesis);
    await fullSources('pre-source-install');const prepared=await preparePublishedCurrentReference({plan,policy,target,budget,queryBoundary:boundary,adminClient:main,adminPassword:password,artifactRoot:path.join(REFERENCE.base,'synthetic-inputs'),verifyPhysical,verifySources,registerSecret,save});session=prepared.session;await fullSources('post-publication-final-role');
    const beforeTriggers=prepared.emptySchemaObservation.triggersObservationOnly;
    need(beforeTriggers.length===954&&beforeTriggers.every(t=>t.enabled==='O'),'ALL_ORIGINAL954_TRIGGERS_ENABLED_REQUIRED');
    const triggerSql="SELECT c.relname AS table_name,t.tgname AS name,p.oid::regprocedure::text AS signature,pn.nspname AS function_schema,p.pronargs AS arguments,t.tgtype::int AS type,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,t.tgisinternal AS internal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY c.relname,t.tgname";
    const afterTriggers=(await session.adminQuery(triggerSql,[])).rows.map(t=>({...t,definitionSha256:SHA(t.definition)}));
    need(JSON.stringify(afterTriggers)===JSON.stringify(beforeTriggers),'ORIGINAL_TRIGGER_DEFINITION_OR_ENABLED_STATE_CHANGED');
    await save('trigger-nondrift.json',{count:afterTriggers.length,allEnabled:true,beforeSha256:SHA(JSON.stringify(beforeTriggers)),afterSha256:SHA(JSON.stringify(afterTriggers)),scope:'TEMPORAL_REFERENCE_NONDIFT_NOT_SELF_SIGNED_CANONICAL_APPROVAL'});
    runtimeLease=await session.pool.connect();await runtimeLease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshotSql="SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,pg_current_snapshot()::text AS snapshot";
    const rrBefore=(await runtimeLease.query(snapshotSql,[])).rows[0];need(rrBefore?.isolation==='repeatable read'&&rrBefore.read_only==='on'&&typeof rrBefore.snapshot==='string','REFERENCE_RR_READONLY_SNAPSHOT_REQUIRED');
    const observation=await observeFinitePolicy({policy,runtimeQuery:(sql,values)=>runtimeLease.query(sql,values),adminQuery:session.adminQuery});await save('finite-policy-observation.json',observation);
    const actual=await runtimeLease.query(canonicalQuery.sql,[]);need(actual.rows.length===1&&actual.rowCount===1,'ONE_ACTUAL_REFERENCE_CANONICAL_ROW_REQUIRED');const parity=assertReferenceObservation(actual.rows[0],target);await save('canonical-observation.json',actual.rows[0]);await save('canonical-parity.json',parity);
    const rrAfter=(await runtimeLease.query(snapshotSql,[])).rows[0];need(JSON.stringify(rrBefore)===JSON.stringify(rrAfter),'ONE_REFERENCE_READ_SNAPSHOT_REQUIRED');await save('reference-rr-snapshot.json',{before:rrBefore,after:rrAfter});
    await runtimeLease.query('COMMIT');runtimeLease.release();runtimeLease=null;await session.pool.awaitIdle();await session.guard();await fullSources('post-canonical');
    result.observationPassed=true;result.catalogSha256=actual.rows[0].catalog_sha256;result.effectiveCells=observation.cellComparison.cells;result.functions=observation.boundaryComparison.functions;result.independentExpectedReview='PENDING_NOT_CREATED_BY_RUNNER';
  } catch(error) {firstFailure=error;result.firstFailure=sanitize(error.stack??error);result.unknownOutcome=boundary.gate.quarantined();await save('first-failure.txt',result.firstFailure).catch(()=>{});
  } finally {
    if(runtimeLease){try{runtimeLease.release();}catch(e){result.releaseError=sanitize(e.message);}runtimeLease=null;}
    try{if(session)await session.closeRuntime();}catch(e){result.runtimeCloseError=sanitize(e.message);firstFailure??=e;}
    if(main&&!boundary.gate.quarantined())try{await birthCheck();const cleanupQuery=(sql,values=[])=>budgetedQuery(boundary.fence(main),sql,values,budget,true);await cleanupQuery('ROLLBACK');await cleanupQuery('RESET ROLE');const observed=(await cleanupQuery("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('data_directory') AS data,pg_postmaster_start_time()::text AS start,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS other_clients")).rows[0];need(observed.id===birthId&&observed.data===data&&(!target||observed.start===target.postmasterStart),'REFERENCE_CLEANUP_IDENTITY_CHANGED');result.otherClients=observed.other_clients;}catch(e){result.cleanupObservationFailure=sanitize(e.message);}
    else if(boundary.gate.quarantined())result.cleanupSqlSkippedForUnknownOutcome=true;
    try{const closed=await boundary.closeAll();result.clientClosures=closed;result.clientsClosed=closed.length>0&&closed.every(c=>c.confirmed===true);}catch(e){result.clientCloseFailure=sanitize(e.message);result.clientsClosed=false;}
    try{await birthCheck();if(foreground){if(!foreground.state().closed)await childIdentity(foreground.child,data);const stopped=await stopForeground(foreground);await save('stop.json',stopped);result.stopExitCode=stopped.code===0&&!stopped.error&&!stopped.forced?0:1;result.foregroundDefinitiveClose=stopped.definitiveClose;}else result.foregroundNeverSpawned=true;}catch(e){result.stopIdentityRefused=sanitize(e.message);}
    result.portProbe=await portProof(REFERENCE.port);result.portState=result.portProbe.state;
    try{await lstat(path.join(data,'postmaster.pid'));result.pidFileAbsent=false;}catch(e){result.pidFileAbsent=e.code==='ENOENT';}
    if(foreground?.child.pid)try{await lstat('/proc/'+foreground.child.pid);result.processAbsent=false;}catch(e){result.processAbsent=e.code==='ENOENT';}
    if(dataBirth)try{const c=await command(path.join(BIN,'pg_controldata'),[data],'',true);await save('control-after.txt',c.stdout);result.stoppedControlEvidence=stoppedControlEvidence({stdout:c.stdout,code:c.code,timedOut:c.timedOut,birthId,targetId:target?.systemIdentifier??null});result.controlShutDown=result.stoppedControlEvidence.controlShutDown;}catch(e){result.controlObservationFailure=sanitize(e.message);}
    try{await fullSources('post-stop',true);result.sourcePostflight=true;}catch(e){result.sourcePostflight=false;result.sourcePostflightFailure=sanitize(e.message);}
    result.status=referenceTerminal(result);if(firstFailure)result.status='FAILED_REFERENCE_QUARANTINED_NO_REPLAY';result.finishedAt=new Date().toISOString();await save('RESULT.json',result);
  }
  need(!firstFailure&&result.status.startsWith('PASS_'),'REFERENCE_FAILED_OR_CLEANUP_UNCONFIRMED; see '+REFERENCE.base);return {base:REFERENCE.base,result};
}
export async function main(args) {let selected;try{selected=parseReferenceArgs(args);}catch(e){process.stderr.write(e.message+'\n'+HELP);return 2;}if(selected===null){process.stdout.write(HELP);return 0;}try{const done=await runReference(selected);process.stdout.write(JSON.stringify({base:done.base,status:done.result.status,catalogSha256:done.result.catalogSha256})+'\n');return 0;}catch(e){process.stderr.write(e.message+'\n');return 1;}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main(process.argv.slice(2));
