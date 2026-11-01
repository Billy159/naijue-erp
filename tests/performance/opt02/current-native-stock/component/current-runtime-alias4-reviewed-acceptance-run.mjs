/** ONE fresh source-reviewed finite acceptance only. No engine on import/help. Independently
 * frozen source-only339 reference first; live e005 requires a separately trusted review.
 * No self-signed review/expected, replay, renewal, old target or production. */
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
import { compileAliasFourReadPolicy } from '../reference-compiler-alias4-v1/alias4-policy.mjs';
import { MATERIAL, ADDENDUM } from '../contract.mjs';
import { SUCCESSOR_OBSERVATION, renderSequenceSystemCanonicalObservation, inspectSequenceSystemCanonicalObservation } from '../sequence-system-successor-observation.mjs';
import { NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE as probe } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { createCapturedQueryBoundary, preparePublishedCurrentReferenceAlias4 } from './current-runtime-host.mjs';
import { observeAliasFourPolicy } from './policy-observer.mjs';
import { runCurrentRuntimeBusiness, BUSINESS_PURPOSES } from './current-runtime-business.mjs';
import { INTERNAL_TRIGGER_BINDINGS_SQL } from './current-runtime-catalog-diagnostic-run.mjs';

const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const SHA = bytes => createHash('sha256').update(bytes).digest('hex');
export const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
const WORK = '/workspace/scratch/1f717a486422', EVIDENCE = path.join(WORK, 'development-results-20261031');
const MATERIAL_ROOT = path.join(EVIDENCE, 'current-runtime-feasibility-independent-review');
const PG = path.join(WORK, 'toolchain/postgresql-17/root'), BIN = path.join(PG, 'usr/lib/postgresql/17/bin');
const RECEIPT = path.join(WORK, 'toolchain/postgresql-17/receipts/TOOLCHAIN-RESTORED.json');
const RECEIPT_SHA = '4c8f5c8b2699cdec2444dd6e9e838fa31b494bbed290bca1d5f1b1af33dbe7d6';
export const ACCEPTANCE = Object.freeze({ runId: 'c20261101e005', port: 18575,
  base: path.join(EVIDENCE, 'pg-current-runtime-acceptance-c20261101e005'),
  sourceRoot: path.join(EVIDENCE, 'cumulative-C12-work/candidate'),
  pinsPath: path.join(EVIDENCE, 'performance-resume-20261101/current-alias4-reviewed-acceptance-e005/SOURCE-PINS.json') });
export const HELP = 'Finite acceptance ONLY: --run-current-runtime-alias4-reviewed-acceptance <independently-reviewed-SOURCE-PINS-sha256>\nFresh e005/127.0.0.1:18575; never reference/old targets. No engine on import/help.\n';
export function parseAcceptanceArgs(args) {
  need(Array.isArray(args) && Object.getPrototypeOf(args) === Array.prototype && Reflect.ownKeys(args).length === args.length + 1, 'CLOSED_ACCEPTANCE_ARGUMENTS_REQUIRED');
  for (let i=0;i<args.length;i++) { const d=Object.getOwnPropertyDescriptor(args,String(i));need(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='string','PRIMITIVE_ACCEPTANCE_ARGUMENT_REQUIRED'); }
  if (args.length===0 || args.length===1 && args[0]==='--help') return null;
  need(args.length===2 && args[0]==='--run-current-runtime-alias4-reviewed-acceptance' && /^[a-f0-9]{64}$/.test(args[1]), 'EXACT_ACCEPTANCE_FLAG_AND_TRUSTED_PIN_REQUIRED');
  return Object.freeze({ trustedPinsSha256: args[1] });
}
const environment = () => ({ PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',LD_LIBRARY_PATH:path.join(PG,'usr/lib/x86_64-linux-gnu') });
export const EXPECTED_ROOT=path.join(EVIDENCE,'performance-resume-20261101/independent-e001-expected-review');
export const ALIAS_REFERENCE_ROOT=path.join(EVIDENCE,'performance-resume-20261101/independent-alias-read-policy-review');
// New339 reference is source-only derived from immutable old2b95 plus four
// exact source-read ACL cells. It is NOT an earlier339 PG target approval.
export const EXPECTED=Object.freeze({canonicalPath:path.join(ALIAS_REFERENCE_ROOT,'PROPOSED-EXPECTED-CANONICAL-UTF8.txt'),catalogSha256:'bd68ad5e539c16a7ff3131770cb7ee69437b0a8e25c2eec995092740c8ac6622',
  reviewPath:path.join(ALIAS_REFERENCE_ROOT,'SOURCE-ONLY-REVIEW.json'),manifestPath:path.join(ALIAS_REFERENCE_ROOT,'SOURCE-MANIFEST.json'),templatePath:path.join(EXPECTED_ROOT,'E002-ISSUER-REVIEW-TEMPLATE.PENDING.json'),contractPath:path.join(EXPECTED_ROOT,'E002-ORIGINAL-ISSUER-REVIEW-CONTRACT.json'),
  reviewSha256:'12ee9e42b79b599a21b3294edee0efaf50132f1d7493a655b56407121375c4cb',manifestSha256:'7a13e2d37397d2a526cbaf47936def718e4b1aa2368de3b23e6e3e919409d6c7',
  templateSha256:'103fd6f6670d7355fe6417b5eeb030d576ac128c259d6ad91736777576f158ee',contractSha256:'7d8cd504f0819037ac9da9f6bedfa7819453ca072a4d43e679db502aafdb4822'});
export const SEMANTICS=Object.freeze({
 rulesPath:path.join(ALIAS_REFERENCE_ROOT,'SOURCE-EXPECTED-RULES.json'),
 rulesSha256:'f21d42ee1f5905e75961475f128749c91ae02c0822aa3c0f27ef2bcfba831de3',
 checkerPath:path.join(ALIAS_REFERENCE_ROOT,'check-semantics-alias4.py'),
 checkerSha256:'b690cb759405a0ef4896003c57813aeca6c59567a4a9b2b5c421860a56e28d6d'});
export const REVIEWER_FIXED_INPUTS=Object.freeze(['verify-e005-wait-review.mjs','E005-SOURCE-SEMANTIC-PROOF.PENDING.json','E005-INDEPENDENT-REVIEW.PENDING.json','E005-ISSUER-REVIEW.PENDING.json','REVIEW-CONTRACT.json','PREPARATION.PENDING.json','SOURCE-MANIFEST.json'].map(name=>path.join(EVIDENCE,'performance-resume-20261101/independent-e005-target-review',name)));
const PIN_FIELDS=Object.freeze(['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs']);
function samePinBirth(expected, actual) { for(const key of PIN_FIELDS)need(expected[key]===actual[key],'IMMUTABLE_ACCEPTANCE_PIN_DRIFT:'+key); }
async function captureAcceptanceFile(file, expectedSha, maximum=256*1024*1024) {
  need(typeof file==='string' && path.isAbsolute(file) && path.resolve(file)===file && typeof expectedSha==='string' && /^[a-f0-9]{64}$/.test(expectedSha)
    && Number.isSafeInteger(maximum)&&maximum>0&&maximum<=256*1024*1024, 'PRIMITIVE_CANONICAL_ACCEPTANCE_PIN_REQUIRED');
  const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(maximum)&&await realpath(file)===file,'CANONICAL_REGULAR_ACCEPTANCE_FILE_REQUIRED');
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try { const s=await fd.stat({bigint:true});samePinBirth(before,s);const bytes=await fd.readFile(),after=await lstat(file,{bigint:true});samePinBirth(before,after);
    need(after.isFile()&&!after.isSymbolicLink()&&BigInt(bytes.length)===before.size&&await realpath(file)===file&&SHA(bytes)===expectedSha,'ACCEPTANCE_FILE_OR_HASH_CHANGED');
    return {bytes,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,before[key]])))};
  } finally { await fd.close(); }
}
export async function canonicalAcceptanceFile(file,expectedSha,maximum) { return (await captureAcceptanceFile(file,expectedSha,maximum)).bytes; }
async function boundedPins(items, work) {
  let cursor=0;const outcomes=await Promise.allSettled(Array.from({length:Math.min(32,items.length)},async()=>{while(cursor<items.length){const i=cursor++;await work(items[i]);}}));
  const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;
}
/** Explicit test-host validation cadence: full SHA capture/bookends plus an
 * immutable no-adaptation registry at every verifySources call. Reads do not
 * change ctime. Restored bytes/mtime are NOT accepted after any identity drift. */
export async function createAcceptancePinRegistry(entries, aliases=[]) {
  need(Array.isArray(entries)&&Object.getPrototypeOf(entries)===Array.prototype&&entries.length>0&&entries.length<=20000&&Array.isArray(aliases),'BOUNDED_ACCEPTANCE_REGISTRY_REQUIRED');
  const records=[],links=[],seen=new Set();
  // Capture hash and all metadata around the SAME no-follow descriptor read.
  for(const input of entries){const e=captureData(input,['path','sha256']);need(!seen.has(e.path),'DUPLICATE_ACCEPTANCE_REGISTRY_PATH');seen.add(e.path);const full=await captureAcceptanceFile(e.path,e.sha256);records.push(Object.freeze({...e,birth:full.birth}));}
  for(const input of aliases){const a=captureData(input,['path','target']);need(typeof a.path==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target),'EXACT_ACCEPTANCE_REGISTRY_ALIAS_REQUIRED');const birth=await lstat(a.path,{bigint:true});need(await realpath(a.path)===a.target,'ACCEPTANCE_REGISTRY_ALIAS_TARGET_CHANGED');links.push(Object.freeze({...a,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,birth[key]])))}));}
  return Object.freeze({files:records.length,aliases:links.length,totalBytes:records.reduce((n,r)=>n+Number(r.birth.size),0),
    async verify(){
      await boundedPins(records,async r=>{const actual=await lstat(r.path,{bigint:true});samePinBirth(r.birth,actual);need(actual.isFile()&&!actual.isSymbolicLink()&&await realpath(r.path)===r.path,'ACCEPTANCE_REGISTRY_CANONICAL_PATH_CHANGED');});
      await boundedPins(links,async a=>{samePinBirth(a.birth,await lstat(a.path,{bigint:true}));need(await realpath(a.path)===a.target,'ACCEPTANCE_REGISTRY_ALIAS_CHANGED');});
      return {files:records.length,aliases:links.length,immutableBirthFields:[...PIN_FIELDS],noAdaptiveRehash:true};
    }});
}
async function readPins(trusted) {
  const raw=await canonicalAcceptanceFile(ACCEPTANCE.pinsPath,trusted,2*1024*1024), p=captureData(JSON.parse(raw),['format','files','aliases']);
  need(p.format==='CURRENT_RUNTIME_ALIAS4_REVIEWED_ACCEPTANCE_E005_SOURCE_PINS_V1'&&Array.isArray(p.files)&&Array.isArray(p.aliases)&&p.files.length>100,'COMPLETE_ACCEPTANCE_SOURCE_PINS_REQUIRED');
  const receipt=JSON.parse(await canonicalAcceptanceFile(RECEIPT,RECEIPT_SHA)), libraries=new Map(receipt.runtimeSharedLibraries.map(x=>[x.path,x.sha256]));
  const python=await realpath(PIPE_PYTHON),node=await realpath(process.execPath),seen=new Set();
  const materialFiles=[MATERIAL.filename,ADDENDUM.filename,'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json','SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'].map(x=>path.join(MATERIAL_ROOT,x));
  for (const input of p.files) { const f=captureData(input,['path','sha256','kind']);
    need(typeof f.path==='string'&&path.isAbsolute(f.path)&&path.resolve(f.path)===f.path&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&['source','binary'].includes(f.kind)&&!seen.has(f.path)&&f.path!==ACCEPTANCE.pinsPath,'CLOSED_UNIQUE_ACCEPTANCE_FILE_PIN');
    need(f.path.startsWith(ROOT+'/')||f.path.startsWith(ACCEPTANCE.sourceRoot+'/')||f.path.startsWith(path.join(WORK,'toolchain')+'/')||materialFiles.includes(f.path)||f.path.startsWith(EXPECTED_ROOT+'/')||f.path.startsWith(ALIAS_REFERENCE_ROOT+'/')||f.path===SEMANTICS.rulesPath||f.path===SEMANTICS.checkerPath||REVIEWER_FIXED_INPUTS.includes(f.path)||f.kind==='binary'&&(f.path===python||f.path===node||libraries.get(f.path)===f.sha256),'ACCEPTANCE_PIN_OUTSIDE_SOURCE_BINARY_SCOPE');
    seen.add(f.path);await canonicalAcceptanceFile(f.path,f.sha256);
  }
  const own=path.join(ROOT,'tests/performance/opt02/current-native-stock/component');
  const required=['current-runtime-alias4-reviewed-acceptance-run.mjs','current-runtime-alias4-reviewed-acceptance-run.offline.test.mjs','current-runtime-catalog-diagnostic-run.mjs','current-runtime-host.mjs','current-runtime-business.mjs','current-runtime-business.offline.test.mjs','policy-observer.mjs','five-role-guard.mjs','fixture.mjs','authorizer.mjs','publication.mjs','source-verification.mjs','install-source-schema.mjs'].map(x=>path.join(own,x));
  required.push(...['alias4-policy.mjs','alias4-policy.offline.test.mjs','ALIAS4-SOURCE-ADDENDUM.json'].map(name=>path.join(ROOT,'tests/performance/opt02/current-native-stock/reference-compiler-alias4-v1',name)),path.join(ROOT,'package.json'),path.join(ROOT,'package-lock.json'),path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),RECEIPT,python,node,...libraries.keys(),...materialFiles,...REVIEWER_FIXED_INPUTS,SEMANTICS.rulesPath,SEMANTICS.checkerPath,...[EXPECTED.canonicalPath,EXPECTED.reviewPath,EXPECTED.manifestPath,EXPECTED.templatePath,EXPECTED.contractPath],...['postgres','initdb','pg_controldata'].map(x=>path.join(BIN,x)));
  const share=path.join(PG,'usr/share/postgresql/17');
  for(const entry of await readdir(share,{recursive:true,withFileTypes:true}))if(entry.isFile())required.push(path.join(entry.parentPath,entry.name));
  need(required.every(x=>seen.has(x)),'MANDATORY_ACCEPTANCE_SOURCE_BINARY_LOCK_PINS_REQUIRED');
  for (const input of p.aliases) { const a=captureData(input,['path','target']);
    need(typeof a.path==='string'&&typeof a.target==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target)&&p.files.find(f=>f.path===a.target)?.kind==='binary'
      && (a.path===PIPE_PYTHON||a.path===process.execPath||a.path.startsWith(PG+'/'))&&await realpath(a.path)===a.target,'EXACT_ACCEPTANCE_BINARY_ALIAS_REQUIRED'); }
  need(p.aliases.some(a=>a.path===PIPE_PYTHON&&a.target===python),'PINNED_ANONYMOUS_PIPE_INTERPRETER_REQUIRED');
  return { raw, p };
}
const absent=async p=>{try{await lstat(p);throw Error('ACCEPTANCE_FRESH_PATH_ALREADY_EXISTS:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}};
async function physical(p) { const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(p)===p,'ACCEPTANCE_PRIVATE_OWNED0700_REQUIRED');return {path:p,uid:s.uid,mode:s.mode&0o777,device:s.dev,inode:s.ino,canonical:true,symbolicLink:false}; }
async function freePort(port) { await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen({host:'127.0.0.1',port,exclusive:true},()=>s.close(resolve));}); }
async function portProof(port) { return await new Promise(resolve=>{let done=false;const s=createConnection({host:'127.0.0.1',port}),finish=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.setTimeout(1000);s.once('connect',()=>finish({state:'OPEN'}));s.once('error',e=>finish(closedPortEvidence(e.code)));s.once('timeout',()=>finish({state:'UNKNOWN',reason:'TIMEOUT'}));}); }
export function assertAcceptanceChild(actual, expected) {
  need(actual.uid===expected.uid&&actual.executable===expected.executable&&actual.data===expected.data&&actual.pid===expected.pid&&Number.isInteger(actual.pid)&&actual.pid>1,'OWNED_ACCEPTANCE_FOREGROUND_IDENTITY_REQUIRED');
}
async function childIdentity(child, data) { const pid=child.pid,s=await lstat('/proc/'+pid),args=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0');const actual={pid,uid:s.uid,executable:args[0],data:args.includes('-D')?args[args.indexOf('-D')+1]:null};assertAcceptanceChild(actual,{pid,uid:process.getuid(),executable:path.join(BIN,'postgres'),data});return actual; }
export function assertAcceptanceObservation(row, target) {
  const r=captureData(row,['identity','migration_versions','catalog_sha256','source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match','observed_canonical_text']);
  need(JSON.stringify(r.migration_versions)===JSON.stringify(Array.from({length:26},(_,i)=>i+1)),'ACCEPTANCE_EXACT_SCHEMA26_REQUIRED');
  for(const key of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])need(r[key]===true,'ACCEPTANCE_ORIGINAL_PROOF_FALSE:'+key);
  const i=captureData(r.identity,['database','database_oid','database_owner','current_user','session_user','server_addr','server_port','server_version_num','postmaster_start','replication_role']);
  need(i.database===target.database&&i.database_oid===target.databaseOid&&i.database_owner===target.owner&&i.current_user===LOGICAL.runtime&&i.session_user===LOGICAL.runtime&&i.server_addr==='127.0.0.1/32'&&i.server_port===ACCEPTANCE.port&&i.server_version_num==='170011'&&i.postmaster_start===target.postmasterStart&&i.replication_role==='origin','ACCEPTANCE_CANONICAL_DIRECT_IDENTITY_REQUIRED');
  return inspectSequenceSystemCanonicalObservation({observed_canonical_text:r.observed_canonical_text,catalog_sha256:r.catalog_sha256});
}
export function acceptanceTerminal(result) { return !result.firstFailure&&!result.unknownOutcome&&result.observationPassed===true&&result.independentReviewAccepted===true&&result.businessPassed===true&&result.otherClients===0&&result.clientsClosed===true&&result.stopExitCode===0&&result.foregroundDefinitiveClose===true&&result.portState==='CLOSED'&&result.pidFileAbsent===true&&result.processAbsent===true&&result.controlShutDown===true&&result.sourcePostflight===true?'PASS_FINITE_ORIGINAL_NATIVE_CREATE_AND_STOCK_NOT_PERFORMANCE':'FAILED_ACCEPTANCE_QUARANTINED_NO_REPLAY'; }

/** Audit only: preserve both causes without reading error getters or logging
 * parameters/credentials. The host sanitizer is applied to every string. */
export function auditError(error,sanitize=String) {
  const seen=new Set();
  const walk=(value,depth)=>{
    if(value===null||typeof value!=='object')return {thrown:sanitize(typeof value==='string'?value:String(value))};
    if(seen.has(value))return {circular:true};if(depth>8)return {truncated:true};seen.add(value);
    const out={};for(const key of ['name','message','code','stack']){const d=Object.getOwnPropertyDescriptor(value,key);if(d&&Object.hasOwn(d,'value')&&['string','number','boolean'].includes(typeof d.value))out[key]=sanitize(String(d.value));}
    const cause=Object.getOwnPropertyDescriptor(value,'cause');if(cause&&Object.hasOwn(cause,'value'))out.cause=walk(cause.value,depth+1);
    const errors=Object.getOwnPropertyDescriptor(value,'errors');if(errors&&Object.hasOwn(errors,'value')&&Array.isArray(errors.value)){out.errors=[];for(let i=0;i<Math.min(errors.value.length,64);i++){const d=Object.getOwnPropertyDescriptor(errors.value,String(i));out.errors.push(d&&Object.hasOwn(d,'value')?walk(d.value,depth+1):{invalidOwnError:true});}}
    seen.delete(value);return out;
  };return walk(error,0);
}
export function assertReferenceArtifact(expectedText) {
 need(typeof expectedText==='string'&&SHA(expectedText)===EXPECTED.catalogSha256,'FROZEN_SOURCE_ONLY_ALIAS4_REFERENCE_REQUIRED');
 // Source-only339 reference is for EXTERNAL source-semantic proof, never an automatic
 // cross-cluster digest equality gate or a normalized runtime hash.
}
export function buildReviewRequest(input) {
  const {target,identity,pinsSha256,expiresAt,actualCanonical,bindings}=captureData(input,['target','identity','pinsSha256','expiresAt','actualCanonical','bindings']);
  const captured=checkedActualArtifacts(actualCanonical,bindings);
  need(/^[a-f0-9]{64}$/.test(pinsSha256)&&!['7703089336081934099','7703096890285320019','7703102194329098126','7703108941652350921'].includes(target.systemIdentifier)&&target.port===ACCEPTANCE.port&&expiresAt===target.expiresAt,'FRESH_E005_REVIEW_REQUEST_REQUIRED');
  return {format:'FINITE_E005_ALIAS4_REVIEWED_INDEPENDENT_ISSUER_REVIEW_REQUEST_V1',status:'PENDING_EXTERNAL_REVIEW_NOT_AUTHORITY',physicalRunId:ACCEPTANCE.runId,systemIdentifier:target.systemIdentifier,startsAt:target.startsAt,expiresAt,
    sourcePinsSha256:pinsSha256,referenceExpected:{path:EXPECTED.canonicalPath,sha256:EXPECTED.catalogSha256},
    issuerTarget:reviewTarget(target,identity),catalog:{format:SUCCESSOR_OBSERVATION.format,sha256:actualCanonical.catalogSha256,patchLevel:SUCCESSOR_OBSERVATION.patchLevel},purposes:[...BUSINESS_PURPOSES],
    fixedIssuerReviewPath:path.join(ACCEPTANCE.base,'issuer-review.json'),fixedIndependentReceiptPath:path.join(ACCEPTANCE.base,'independent-review.json'),
    authority:'NONE',expectedAndIssuerReviewMustBeCreatedByIndependentController:true,actualCanonical:captured.canonical,bindings:captured.bindings,sourceSemanticsExpected:SEMANTICS,fixedSourceSemanticProofPath:path.join(ACCEPTANCE.base,'source-semantic-proof.json')};
}
function reviewTarget(target,identity){return {database:target.database,databaseOid:target.databaseOid,actingRole:LOGICAL.runtime,sessionUser:LOGICAL.runtime,serverAddress:identity.server_addr,serverPort:ACCEPTANCE.port,postmasterStart:target.postmasterStart};}
/** Original consumer shape, plus this finite component's exact target, three
 * purposes and fixed external receipt. No authority is issued by this check. */
export function assertAcceptanceReview(value,target,identity,actualCanonical) {
  const r=captureData(value,['version','decision','target','catalog','purposes','scope','independentReview','realImportExecutionAuthorized']);
  need(r.version==='C_NATIVE_RUNTIME26_REVIEW_V1'&&r.decision==='ACCEPT_EXACT_RUNTIME26_TARGET_METADATA'&&r.scope==='EXACT_TARGET_METADATA_ONLY'&&r.realImportExecutionAuthorized===false,'ORIGINAL_METADATA_ONLY_REVIEW_REQUIRED');
  const t=captureData(r.target,['database','databaseOid','actingRole','sessionUser','serverAddress','serverPort','postmasterStart']),expected=reviewTarget(target,identity);
  for(const key of Object.keys(expected))need(t[key]===expected[key],'EXACT_E005_EXTERNAL_REVIEW_TARGET_REQUIRED:'+key);
  const c=captureData(r.catalog,['format','sha256','patchLevel']);need(c.format===SUCCESSOR_OBSERVATION.format&&c.sha256===actualCanonical.catalogSha256&&c.patchLevel===SUCCESSOR_OBSERVATION.patchLevel,'EXACT_ACTUAL_RAW_SUCCESSOR_CATALOG_REQUIRED');
  need(Array.isArray(r.purposes)&&Object.getPrototypeOf(r.purposes)===Array.prototype&&Reflect.ownKeys(r.purposes).length===4,'EXACT_THREE_REVIEW_PURPOSES_REQUIRED');
  for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(r.purposes,String(i));need(d&&Object.hasOwn(d,'value')&&d.enumerable&&d.value===BUSINESS_PURPOSES[i],'EXACT_THREE_REVIEW_PURPOSES_REQUIRED');}
  const p=captureData(r.independentReview,['path','sha256','result']);need(p.path===path.join(ACCEPTANCE.base,'independent-review.json')&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.result==='PASS','FIXED_INDEPENDENT_E005_PASS_RECEIPT_REQUIRED');return p;
}
/** One bounded ASCII SHA line from the independent operator. No retry or path,
 * role, module, expected, target or deadline input. No engine on pure invocation. */
export async function waitReviewHash(stream,budget,signal) {
  need(stream&&typeof stream.on==='function'&&typeof stream.removeListener==='function'&&typeof stream.pause==='function'&&typeof stream.resume==='function','CAPTURED_REVIEW_STDIN_REQUIRED');
  const remaining=budget.remaining();need(!signal.aborted,'REVIEW_WAIT_ABORTED');
  return await new Promise((resolve,reject)=>{let bytes=Buffer.alloc(0),done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);stream.pause();for(const [event,fn]of [['data',onData],['end',onEnd],['error',onError]])stream.removeListener(event,fn);signal.removeEventListener('abort',onAbort);error?reject(error):resolve(value);};
    const failure=code=>Object.assign(new Error(code),{code});
    const onData=chunk=>{try{need(Buffer.isBuffer(chunk)||typeof chunk==='string','PRIMITIVE_REVIEW_SHA_BYTES_REQUIRED');bytes=Buffer.concat([bytes,Buffer.from(chunk)]);need(bytes.length<=65,'ONE_EXACT_REVIEW_SHA_LINE_REQUIRED');if(bytes.includes(10)){need(/^[a-f0-9]{64}\n$/.test(bytes.toString('ascii'))&&bytes.every(b=>b<128),'ONE_EXACT_REVIEW_SHA_LINE_REQUIRED');budget.remaining();finish(null,bytes.subarray(0,64).toString('ascii'));}}catch(e){finish(e);}};
    const onEnd=()=>finish(failure('MISSING_REVIEW_SHA_NO_REPLAY')),onError=error=>finish(error),onAbort=()=>finish(failure('REVIEW_WAIT_ABORTED'));
    const timer=setTimeout(()=>finish(failure('REVIEW_WAIT_ABSOLUTE_DEADLINE_EXPIRED')),remaining);
    stream.on('data',onData);stream.once('end',onEnd);stream.once('error',onError);signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();else if(stream.readableEnded)onEnd();else stream.resume();
  });
}
function exactTarget(value,target,identity){const actual=captureData(value,['database','databaseOid','actingRole','sessionUser','serverAddress','serverPort','postmasterStart']),expected=reviewTarget(target,identity);for(const key of Object.keys(expected))need(actual[key]===expected[key],'EXACT_SOURCE_REVIEW_TARGET_REQUIRED:'+key);}
function checkedActualArtifacts(canonical,bindings){
 const c=captureData(canonical,['path','sha256','catalogSha256','utf8Bytes']),b=captureData(bindings,['path','sha256']);
 need(c.path===path.join(ACCEPTANCE.base,'canonical-observation.json')&&b.path===path.join(ACCEPTANCE.base,'internal-trigger-bindings.json')&&[c.sha256,c.catalogSha256,b.sha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))&&Number.isSafeInteger(c.utf8Bytes)&&c.utf8Bytes>0&&c.utf8Bytes<=2*1024*1024,'EXACT_ACTUAL_METADATA_ARTIFACTS_REQUIRED');return {canonical:c,bindings:b};
}
/** These checks bind EXTERNALLY issued proof bytes to this captured target and
 * evidence. They do NOT run the semantic checker, infer PASS or write reviews. */
export function assertExternalTargetReceipt(value,proof,input){
 const {target,identity,request,snapshot}=captureData(input,['target','identity','request','snapshot']),a=checkedActualArtifacts(request.actualCanonical,request.bindings);
 const receipt=captureData(value,['format','result','physicalRunId','systemIdentifier','target','sourcePinsSha256','catalog','referenceCatalogSha256','actualCanonical','sourceSemantics','scope','realImportExecutionAuthorized','checks']);
 need(receipt.format==='FINITE_CURRENT_RUNTIME_INDEPENDENT_TARGET_REVIEW_V1'&&receipt.result==='PASS'&&receipt.scope==='EXACT_TARGET_METADATA_ONLY'&&receipt.realImportExecutionAuthorized===false,'EXTERNAL_EXACT_TARGET_PASS_RECEIPT_REQUIRED');
 const p=captureData(proof,['format','result','physicalRunId','systemIdentifier','target','sourcePinsSha256','referenceCatalogSha256','actualCanonical','bindings','rulesSha256','checkerSha256','comparison','scope']);
 need(p.format==='FINITE_CURRENT_RUNTIME_SOURCE_SEMANTIC_PROOF_V1'&&p.result==='PASS'&&p.scope==='SOURCE_SEMANTICS_ONLY_NOT_METADATA_AUTHORITY','EXTERNAL_SOURCE_SEMANTIC_PASS_PROOF_REQUIRED');
 for(const obj of [receipt,p]){need(obj.physicalRunId===ACCEPTANCE.runId&&obj.systemIdentifier===target.systemIdentifier&&obj.sourcePinsSha256===request.sourcePinsSha256&&obj.referenceCatalogSha256===EXPECTED.catalogSha256,'EXACT_EXTERNAL_PHYSICAL_SOURCE_REFERENCE_BINDING_REQUIRED');exactTarget(obj.target,target,identity);}
 const c=captureData(receipt.catalog,['format','sha256','patchLevel']);need(c.format===SUCCESSOR_OBSERVATION.format&&c.patchLevel===SUCCESSOR_OBSERVATION.patchLevel&&c.sha256===a.canonical.catalogSha256,'EXTERNAL_RECEIPT_ACTUAL_RAW_CATALOG_REQUIRED');
 const ac=captureData(receipt.actualCanonical,['path','sha256','catalogSha256']);for(const key of Object.keys(ac))need(ac[key]===a.canonical[key],'EXTERNAL_RECEIPT_ACTUAL_ARTIFACT_REQUIRED');
 const pc=captureData(p.actualCanonical,['path','sha256','catalogSha256','utf8Bytes']),pb=captureData(p.bindings,['path','sha256']);for(const key of Object.keys(pc))need(pc[key]===a.canonical[key],'EXTERNAL_PROOF_ACTUAL_ARTIFACT_REQUIRED');for(const key of Object.keys(pb))need(pb[key]===a.bindings[key],'EXTERNAL_PROOF_ACTUAL_BINDINGS_REQUIRED');
 need(p.rulesSha256===SEMANTICS.rulesSha256&&p.checkerSha256===SEMANTICS.checkerSha256,'PINNED_PREOBSERVATION_SOURCE_RULES_AND_REVIEWED_CHECKER_REQUIRED');
 const comparison=captureData(p.comparison,['status','canonicalRawSha256','sourceRuleSha256','sourceForeignKeyRoles','sourceUniqueRoles','allInternalBindings','exactUserTriggerObjects','rawCanonicalUnchanged','rawCanonicalUnchangedMeaning','issuerOrTargetAuthority','diagnosticLimits']);
 need(comparison.status==='SOURCE_SEMANTICS_MATCH_ONLY_NOT_TARGET_REVIEW'&&comparison.canonicalRawSha256===a.canonical.catalogSha256&&comparison.sourceRuleSha256===SEMANTICS.rulesSha256&&comparison.sourceForeignKeyRoles===756&&comparison.sourceUniqueRoles===2&&comparison.allInternalBindings===758&&comparison.exactUserTriggerObjects===196&&comparison.rawCanonicalUnchanged===true&&comparison.issuerOrTargetAuthority==='NONE'&&typeof comparison.rawCanonicalUnchangedMeaning==='string'&&typeof comparison.diagnosticLimits==='string','EXTERNAL_ACTUAL_SOURCE_COMPARISON_REQUIRED');
 const checks=captureData(receipt.checks,['startsAt','expiresAt','reviewedAt','sourceFiles','originalStatements','v22Parents','sourceFixtureRows','originalPublicationCommands','sourceRoutines','effectivePrivilegeCells','sourceTypeClosure','effectiveSessionReplicationRoleSetGuard','repeatableReadReadOnlySnapshot','sourceUserTriggers','totalEnabledTriggers','triggerNondrift','fullSourcePinsMatched','directOrdinaryLogin','evidence']);
 const reviewedAt=typeof checks.reviewedAt==='string'&&checks.reviewedAt.endsWith('Z')?Date.parse(checks.reviewedAt):NaN;
 need(Number.isSafeInteger(checks.startsAt)&&Number.isSafeInteger(checks.expiresAt)&&checks.startsAt===target.startsAt&&checks.expiresAt===target.expiresAt&&checks.expiresAt-checks.startsAt===1200000&&Number.isSafeInteger(reviewedAt)&&reviewedAt>=checks.startsAt&&reviewedAt<checks.expiresAt&&reviewedAt<=Date.now(),'ORIGINAL_NONRENEWED_TARGET_REVIEW_WINDOW_REQUIRED');
 for(const [key,value]of Object.entries({sourceFiles:40,originalStatements:714,v22Parents:131,sourceFixtureRows:105,originalPublicationCommands:4,sourceRoutines:137,effectivePrivilegeCells:4140,sourceUserTriggers:196,totalEnabledTriggers:954,sourceTypeClosure:true,effectiveSessionReplicationRoleSetGuard:true,triggerNondrift:true,fullSourcePinsMatched:true,directOrdinaryLogin:true}))need(checks[key]===value,'EXTERNAL_COMPLETE_SOURCE_EVIDENCE_REQUIRED:'+key);
 need(typeof snapshot==='string'&&snapshot.length>0&&checks.repeatableReadReadOnlySnapshot===snapshot,'ACTUAL_SAME_RR_READONLY_REVIEW_SNAPSHOT_REQUIRED');
 need(Array.isArray(checks.evidence)&&Object.getPrototypeOf(checks.evidence)===Array.prototype&&checks.evidence.length>0&&checks.evidence.length<=64&&Reflect.ownKeys(checks.evidence).length===checks.evidence.length+1,'BOUNDED_EXTERNAL_EVIDENCE_SHA_LIST_REQUIRED');
 for(let i=0;i<checks.evidence.length;i++){const d=Object.getOwnPropertyDescriptor(checks.evidence,String(i));need(d&&Object.hasOwn(d,'value')&&d.enumerable,'OWN_EXTERNAL_EVIDENCE_ENTRY_REQUIRED');const e=captureData(d.value,['path','sha256','bytes']);need(typeof e.path==='string'&&path.isAbsolute(e.path)&&path.resolve(e.path)===e.path&&!/[\x00-\x1f\x7f]/.test(e.path)&&typeof e.sha256==='string'&&/^[a-f0-9]{64}$/.test(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0,'EXTERNAL_EVIDENCE_REFERENCE_REQUIRED');}
 const sem=captureData(receipt.sourceSemantics,['path','sha256','result']);need(sem.path===path.join(ACCEPTANCE.base,'source-semantic-proof.json')&&typeof sem.sha256==='string'&&/^[a-f0-9]{64}$/.test(sem.sha256)&&sem.result==='PASS','FIXED_EXTERNAL_SOURCE_PROOF_PIN_REQUIRED');return sem;
}
async function readIndependentAcceptanceReview({trustedSha256,target,identity,request,snapshot}) {
 const file=path.join(ACCEPTANCE.base,'issuer-review.json'),issuerFile=await captureAcceptanceFile(file,trustedSha256,64*1024);need(issuerFile.bytes.length>0&&(issuerFile.birth.mode&0o022n)===0n,'BOUNDED_NONWRITABLE_EXTERNAL_ISSUER_REVIEW_REQUIRED');
 const review=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(issuerFile.bytes)),independent=assertAcceptanceReview(review,target,identity,request.actualCanonical);
 const receiptFile=await captureAcceptanceFile(independent.path,independent.sha256,8*1024*1024);need(receiptFile.bytes.length>0&&(receiptFile.birth.mode&0o022n)===0n,'BOUNDED_NONWRITABLE_EXTERNAL_INDEPENDENT_RECEIPT_REQUIRED');
 const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(receiptFile.bytes)),sem=captureData(receipt.sourceSemantics,['path','sha256','result']);need(sem.path===path.join(ACCEPTANCE.base,'source-semantic-proof.json')&&/^[a-f0-9]{64}$/.test(sem.sha256),'FIXED_EXTERNAL_SOURCE_PROOF_REQUIRED');
 const proofFile=await captureAcceptanceFile(sem.path,sem.sha256,8*1024*1024);need(proofFile.bytes.length>0&&(proofFile.birth.mode&0o022n)===0n,'BOUNDED_NONWRITABLE_SOURCE_PROOF_REQUIRED');
 const proof=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(proofFile.bytes));assertExternalTargetReceipt(receipt,proof,{target,identity,request,snapshot});
 const registry=await createAcceptancePinRegistry([{path:file,sha256:trustedSha256},{path:independent.path,sha256:independent.sha256},{path:sem.path,sha256:sem.sha256}]);
 return Object.freeze({reviewRef:Object.freeze({path:file,sha256:trustedSha256}),registry});
}

export function createFixedBusinessStageSaver(save) {
 need(typeof save==='function','TRUSTED_FIXED_STAGE_SAVER_REQUIRED');
 const names=new Set(['ISSUER_CREATE','IDENTITY_AND_REQUIRED_PURPOSES','SUPPLIER_EXECUTE','SUPPLIER_RECEIPT','PRODUCT_EXECUTE','PRODUCT_RECEIPT','PRODUCT_DETAIL','ALL_WAREHOUSE_STOCK_LIST','NEW_SKU_ADMISSION_AND_STORED_ZERO']);
 let next=1,busy=false;
 return async input=>{
  const e=captureData(input,['format','sequence','stage','transition','action','operationId','receipt','resultHash','error']);
  need(!busy&&e.format==='FINITE_CURRENT_RUNTIME_BUSINESS_STAGE_V1'&&Number.isSafeInteger(e.sequence)&&e.sequence===next&&e.sequence<=64&&names.has(e.stage)&&['START','RETURNED','FAILED'].includes(e.transition),'EXACT_MONOTONIC_CLOSED_BUSINESS_STAGE_REQUIRED');
  need((e.action===null||typeof e.action==='string')&&(e.operationId===null||typeof e.operationId==='string')&&(e.resultHash===null||typeof e.resultHash==='string'&&/^[a-f0-9]{64}$/.test(e.resultHash)),'TYPED_ACTUAL_BUSINESS_STAGE_METADATA_REQUIRED');
  busy=true;
  try{await save('business-stage-'+String(e.sequence).padStart(3,'0')+'-'+e.stage+'-'+e.transition+'.json',e);next++;}
  finally{busy=false;}
 };
}

export async function runAcceptance(input) {
  const budget=createBudget(Date.now()),o=captureData(input,['trustedPinsSha256']);need(typeof o.trustedPinsSha256==='string'&&/^[a-f0-9]{64}$/.test(o.trustedPinsSha256),'TRUSTED_ACCEPTANCE_PINS_REQUIRED');
  need(ROOT===path.join(WORK,'naijue-erp-performance-eaed143d-20261101')&&process.versions.node==='24.21.0'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.NODE_PG_FORCE_NATIVE,'EXACT_ACCEPTANCE_ROOT_NODE_NO_LOADER_REQUIRED');
  const pins=await readPins(o.trustedPinsSha256);
  for(const [file,digest]of [[EXPECTED.canonicalPath,EXPECTED.catalogSha256],[EXPECTED.reviewPath,EXPECTED.reviewSha256],[EXPECTED.manifestPath,EXPECTED.manifestSha256],[EXPECTED.templatePath,EXPECTED.templateSha256],[EXPECTED.contractPath,EXPECTED.contractSha256],[SEMANTICS.rulesPath,SEMANTICS.rulesSha256],[SEMANTICS.checkerPath,SEMANTICS.checkerSha256]])need(pins.p.files.find(f=>f.path===file)?.sha256===digest,'INDEPENDENT_E001_EXACT_EXPECTED_PIN_REQUIRED');
  const expectedText=(await canonicalAcceptanceFile(EXPECTED.canonicalPath,EXPECTED.catalogSha256,2*1024*1024)).toString('utf8');assertReferenceArtifact(expectedText);
  const registry=await createAcceptancePinRegistry([...pins.p.files.map(f=>({path:f.path,sha256:f.sha256})),{path:ACCEPTANCE.pinsPath,sha256:o.trustedPinsSha256}],pins.p.aliases);
  const {plan,cohort}=await loadPairedSourcePlan({sourceRoot:ACCEPTANCE.sourceRoot});
  const texts={};for(const [key,file]of Object.entries({materialText:MATERIAL.filename,addendumText:ADDENDUM.filename,closureText:'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json',universeText:'SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'}))texts[key]=await readFile(path.join(MATERIAL_ROOT,file),'utf8');
  const basePolicy=await compileFinitePolicy(plan,texts);
  const policy=compileAliasFourReadPolicy(basePolicy,{addendumText:await readFile(path.join(ROOT,'tests/performance/opt02/current-native-stock/reference-compiler-alias4-v1/ALIAS4-SOURCE-ADDENDUM.json'),'utf8'),maintenanceSourceText:await readFile(path.join(ROOT,'adapters/postgres/src/product-maintenance-store.ts'),'utf8'),schemaSourceText:await readFile(path.join(ROOT,'adapters/postgres/migrations/0011_history_storage.sql'),'utf8')});need(plan.sourceFingerprint==='726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb','ORIGINAL_INSTALLATION_COHORT_REQUIRED');
  const nativeText=await readFile(path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),'utf8'),canonicalQuery=renderSequenceSystemCanonicalObservation({successorSourceText:nativeText,successorProbeText:probe});
  budget.remaining();await absent(ACCEPTANCE.base);await freePort(ACCEPTANCE.port);await mkdir(ACCEPTANCE.base,{mode:0o700});
  const data=path.join(ACCEPTANCE.base,'data'),baseBirth=await physical(ACCEPTANCE.base),password=randomBytes(32).toString('base64url'),secrets=[password];
  const registerSecret=value=>{need(typeof value==='string'&&value.length>20,'RAM_ONLY_ACCEPTANCE_SECRET_REQUIRED');secrets.push(value);};
  const sanitize=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
  const save=async(name,value)=>{need(/^[a-zA-Z0-9_.-]+$/.test(name),'CLOSED_ACCEPTANCE_EVIDENCE_NAME');await writeFile(path.join(ACCEPTANCE.base,name),sanitize(typeof value==='string'?value:JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n'),{flag:'wx',mode:0o600});};
  const abort=new AbortController(),onInterrupt=()=>abort.abort(Object.assign(new Error('ACCEPTANCE_OPERATOR_INTERRUPTED'),{code:'ACCEPTANCE_OPERATOR_INTERRUPTED'}));
  process.on('SIGINT',onInterrupt);process.on('SIGTERM',onInterrupt);
  const boundary=createCapturedQueryBoundary({budget});let evidenceRegistry=null,externalRegistry=null,dataBirth=null,config=null,foreground=null,main=null,session=null,runtimeLease=null,target=null,birthId=null,firstFailure=null;
  const result={format:'FRESH_FINITE_CURRENT_RUNTIME_ACCEPTANCE_V1',status:'IN_PROGRESS_NOT_REVIEW',physicalRunId:ACCEPTANCE.runId,logicalDatabase:LOGICAL.database,port:ACCEPTANCE.port,startsAt:budget.startsAt,expiresAt:budget.expiresAt,sourcePinsSha256:o.trustedPinsSha256,sourceFingerprint:plan.sourceFingerprint,observationPassed:false,retainedData:true,authority:'NONE',noExpectedOrReviewCreated:true,independentReferenceCatalogSha256:EXPECTED.catalogSha256,verificationProfile:'ORIGINAL_ISSUER_FULL_METADATA_DEFAULT_NOT_PERFORMANCE',sourceValidationCadence:'FULL_HASH_BOOKENDS_AND_PHASES_IMMUTABLE_NS_REGISTRY_EVERY_VERIFY_ORIGINAL_BEFORE_FILE_SQL_SHA_RETAINED'};
  const birthCheck=async()=>{assertPhysicalIdentity(baseBirth,await physical(ACCEPTANCE.base));if(dataBirth)assertPhysicalIdentity(dataBirth,await physical(data));};
  const verifyPhysical=async()=>{await birthCheck();if(config){need(SHA(await readFile(path.join(data,'postgresql.conf')))===config.conf&&SHA(await readFile(path.join(data,'pg_hba.conf')))===config.hba,'ACCEPTANCE_CONFIG_CHANGED');}if(foreground){need(!foreground.state().closed&&!foreground.state().error,'ACCEPTANCE_POSTMASTER_CLOSED');await childIdentity(foreground.child,data);}};
  const verifySources=async()=>{need(!abort.signal.aborted,'ACCEPTANCE_OPERATOR_INTERRUPTED');budget.remaining();await registry.verify();if(evidenceRegistry)await evidenceRegistry.verify();if(externalRegistry)await externalRegistry.verify();budget.remaining();};
  const fullSources=async(label,cleanup=false)=>{if(!cleanup)budget.remaining();await registry.verify();if(evidenceRegistry)await evidenceRegistry.verify();if(externalRegistry)await externalRegistry.verify();await readPins(o.trustedPinsSha256);await registry.verify();await save('full-source-'+label+'.json',{files:registry.files,aliases:registry.aliases,totalBytes:registry.totalBytes,allExpectedHashesMatched:true,originalRegistryNotRebased:true});if(!cleanup)budget.remaining();};
  const executablePin=async exe=>{await registry.verify();const actual=await realpath(exe),entry=pins.p.files.find(f=>f.path===actual&&f.kind==='binary');need(entry,'PINNED_NATIVE_EXECUTABLE_REQUIRED');await canonicalAcceptanceFile(actual,entry.sha256);if(exe!==actual)need(pins.p.aliases.some(a=>a.path===exe&&a.target===actual),'PINNED_NATIVE_EXEC_ALIAS_REQUIRED');};
  const command=async(exe,args,input='',cleanup=false)=>{await birthCheck();await executablePin(exe);return await runChildCommand(spawn,exe,args,{cwd:ROOT,env:environment(),input,timeoutMs:Math.min(cleanup?30000:60000,cleanup?30000:budget.remaining()),sanitize});};
  const query=async(sql,values=[])=>{await verifyPhysical();await verifySources();return await boundary.query(main,sql,values);};
  const connect=async database=>{const c=new Client({host:'127.0.0.1',port:ACCEPTANCE.port,user:LOGICAL.admin,password,database,ssl:false,application_name:'dot-current-acceptance-bootstrap-only',options:'-c search_path=pg_catalog',connectionTimeoutMillis:Math.min(5000,budget.remaining()),query_timeout:45000,statement_timeout:45000,lock_timeout:3000,idle_in_transaction_session_timeout:60000});boundary.capture(c,'admin');await c.connect();return c;};
  try {
    await save('source-pins-ack.json',{sha256:o.trustedPinsSha256,files:pins.p.files.length,aliases:pins.p.aliases.length,sourceRoot:ACCEPTANCE.sourceRoot,newApplicationRoot:ROOT,separateRealBrands:true});await fullSources('pre-initdb');await absent(data);
    const init=pipeCommand(path.join(BIN,'initdb'),['-D',data,'-L',path.join(PG,'usr/share/postgresql/17'),'-U',LOGICAL.admin,'--auth-local=reject','--auth-host=scram-sha-256','--pwfile=/dev/stdin','--encoding=UTF8','--locale=C']);
    await executablePin(path.join(BIN,'initdb'));const initialized=await command(init.executable,init.args,password+'\n');await save('initdb.json',initialized);need(initialized.code===0&&!initialized.timedOut&&!initialized.spawnError,'ACCEPTANCE_INITDB_FAILED');dataBirth=await physical(data);
    await appendFile(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${ACCEPTANCE.port}\nunix_socket_directories=''\nmax_connections=12\nshared_buffers='32MB'\nwork_mem='4MB'\ntimezone='UTC'\nlog_timezone='UTC'\nlogging_collector=off\nlog_statement='none'\nlog_min_error_statement=panic\nlog_error_verbosity=terse\n`);
    await writeFile(path.join(data,'pg_hba.conf'),`local all all reject\nhost postgres ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.runtime} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n`,{mode:0o600});
    config={conf:SHA(await readFile(path.join(data,'postgresql.conf'))),hba:SHA(await readFile(path.join(data,'pg_hba.conf')))};
    await fullSources('post-initdb');const control=await command(path.join(BIN,'pg_controldata'),[data]);await save('birth-control.txt',control.stdout);need(control.code===0&&!control.timedOut,'ACCEPTANCE_BIRTH_CONTROL_FAILED');birthId=control.stdout.match(/^Database system identifier:\s+([0-9]+)$/m)?.[1];need(birthId&&!['7703089336081934099','7703096890285320019','7703102194329098126','7703108941652350921'].includes(birthId),'FRESH_NON_REFERENCE_SYSTEM_IDENTIFIER_REQUIRED');
    await verifySources();await executablePin(path.join(BIN,'postgres'));const log=await open(path.join(ACCEPTANCE.base,'postgres.log'),'wx',0o600);try{foreground=trackForeground(spawn(path.join(BIN,'postgres'),['-D',data],{cwd:ROOT,env:environment(),stdio:['ignore',log.fd,log.fd]}));}finally{await log.close();}
    need(Number.isInteger(foreground.child.pid)&&foreground.child.pid>1,'CAPTURED_FOREGROUND_ACCEPTANCE_PID_REQUIRED');const readyUntil=Math.min(budget.expiresAt,Date.now()+30000);let ready=false;
    while(Date.now()<readyUntil){await verifyPhysical();budget.remaining();try{const lines=(await readFile(path.join(data,'postmaster.pid'),'utf8')).trimEnd().split('\n');need(Number(lines[0])===foreground.child.pid&&lines[1]===data&&Number(lines[2])>=Math.floor(budget.startsAt/1000)-1,'ACCEPTANCE_PIDFILE_BIRTH_MISMATCH');if(lines[7]?.trim()==='ready'){ready=true;break;}}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}
    need(ready,'ACCEPTANCE_READY_DEADLINE');await save('birth-receipt.json',{baseBirth,dataBirth,systemIdentifier:birthId,directChildPid:foreground.child.pid,configSha256:config.conf,hbaSha256:config.hba,tcpOnly:true,memoryOnlyScram:true});
    main=await connect('postgres');const bootstrap=(await query("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('server_version_num') AS version,current_setting('data_directory') AS data,inet_server_addr()=inet '127.0.0.1' AS address_match,inet_server_port() AS port,current_setting('unix_socket_directories') AS sockets")).rows[0];await save('bootstrap-identity.json',bootstrap);assertBootstrapIdentity(bootstrap,{systemIdentifier:birthId,data,port:ACCEPTANCE.port});
    for(const name of [LOGICAL.sourceOwner,LOGICAL.sentinel,LOGICAL.preparation])await boundary.commit(()=>query(`CREATE ROLE ${identifier(name)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0`));
    await boundary.commit(()=>query(`CREATE DATABASE ${identifier(LOGICAL.database)} OWNER ${identifier(LOGICAL.sourceOwner)} TEMPLATE template0 ENCODING 'UTF8'`));await boundary.commit(()=>query(`REVOKE ALL ON DATABASE ${identifier(LOGICAL.database)} FROM PUBLIC`));
    need((await boundary.closeClient(main)).confirmed,'BOOTSTRAP_ADMIN_CLOSE_UNCONFIRMED');main=null;main=await connect(LOGICAL.database);
    const identity=(await query('SELECT (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,pg_postmaster_start_time()::text AS start')).rows[0];
    target=cohort.sourcePlan.targetSnapshot({systemIdentifier:birthId,database:LOGICAL.database,databaseOid:identity.oid,admin:LOGICAL.admin,owner:LOGICAL.sourceOwner,sentinel:LOGICAL.sentinel,prepare:LOGICAL.preparation,port:ACCEPTANCE.port,postmasterStart:identity.start,startsAt:budget.startsAt,expiresAt:budget.expiresAt});await save('target-identity.json',{physicalRunId:ACCEPTANCE.runId,target});await query(cohort.sourcePlan.targetGuard(target));
    const genesis=(await query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_default_acl) AND NOT EXISTS(SELECT 1 FROM pg_prepared_xacts) AS empty")).rows[0];need(genesis?.empty===true,'FRESH_ACCEPTANCE_EMPTY_GENESIS_REQUIRED');await save('genesis.json',genesis);
    await fullSources('pre-source-install');const prepared=await preparePublishedCurrentReferenceAlias4({plan,policy,target,budget,queryBoundary:boundary,adminClient:main,adminPassword:password,artifactRoot:path.join(ACCEPTANCE.base,'synthetic-inputs'),verifyPhysical,verifySources,registerSecret,save});session=prepared.session;await fullSources('post-publication-final-role');
    const beforeTriggers=prepared.emptySchemaObservation.triggersObservationOnly;
    need(beforeTriggers.length===954&&beforeTriggers.every(t=>t.enabled==='O'),'ALL_ORIGINAL954_TRIGGERS_ENABLED_REQUIRED');
    const triggerSql="SELECT c.relname AS table_name,t.tgname AS name,p.oid::regprocedure::text AS signature,pn.nspname AS function_schema,p.pronargs AS arguments,t.tgtype::int AS type,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,t.tgisinternal AS internal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY c.relname,t.tgname";
    const afterTriggers=(await session.adminQuery(triggerSql,[])).rows.map(t=>({...t,definitionSha256:SHA(t.definition)}));
    need(JSON.stringify(afterTriggers)===JSON.stringify(beforeTriggers),'ORIGINAL_TRIGGER_DEFINITION_OR_ENABLED_STATE_CHANGED');
    await save('trigger-nondrift.json',{count:afterTriggers.length,allEnabled:true,beforeSha256:SHA(JSON.stringify(beforeTriggers)),afterSha256:SHA(JSON.stringify(afterTriggers)),scope:'TEMPORAL_ACCEPTANCE_NONDRIFT_NOT_SELF_SIGNED_CANONICAL_APPROVAL'});
    runtimeLease=await session.pool.connect();await runtimeLease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshotSql="SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,pg_current_snapshot()::text AS snapshot";
    const rrBefore=(await runtimeLease.query(snapshotSql,[])).rows[0];await save('acceptance-rr-before.json',rrBefore);need(rrBefore?.isolation==='repeatable read'&&rrBefore.read_only==='on'&&typeof rrBefore.snapshot==='string','ACCEPTANCE_RR_READONLY_SNAPSHOT_REQUIRED');
    const observation=await observeAliasFourPolicy({policy,runtimeQuery:(sql,values)=>runtimeLease.query(sql,values),adminQuery:session.adminQuery});await save('finite-policy-observation.json',observation);
    const actual=await runtimeLease.query(canonicalQuery.sql,[]);await save('canonical-query-result.json',{rowCount:actual.rowCount,rows:actual.rows});need(actual.rows.length===1&&actual.rowCount===1,'ONE_ACTUAL_ACCEPTANCE_CANONICAL_ROW_REQUIRED');await save('canonical-observation.json',actual.rows[0]);const parity=inspectSequenceSystemCanonicalObservation({observed_canonical_text:actual.rows[0].observed_canonical_text,catalog_sha256:actual.rows[0].catalog_sha256});await save('canonical-parity.json',parity);
    const rrAfter=(await runtimeLease.query(snapshotSql,[])).rows[0];await save('acceptance-rr-snapshot.json',{before:rrBefore,after:rrAfter});need(JSON.stringify(rrBefore)===JSON.stringify(rrAfter),'ONE_ACCEPTANCE_READ_SNAPSHOT_REQUIRED');
    await runtimeLease.query('COMMIT');runtimeLease.release();runtimeLease=null;await session.pool.awaitIdle();await session.guard();await fullSources('post-canonical');
    result.observationPassed=true;result.catalogSha256=actual.rows[0].catalog_sha256;result.effectiveCells=observation.cellComparison.cells;result.functions=observation.boundaryComparison.functions;
    const bindingRows=await session.adminQuery(INTERNAL_TRIGGER_BINDINGS_SQL,[]);await save('internal-trigger-bindings.json',{querySha256:SHA(INTERNAL_TRIGGER_BINDINGS_SQL),rowCount:bindingRows.rowCount,rows:bindingRows.rows,scope:'ACTUAL_ALL_ERP_INTERNAL_TRIGGERS_RAW_CATALOG_NOT_EXPECTED_OR_NORMALIZED'});
    assertAcceptanceObservation(actual.rows[0],target);
    const actualCanonical={path:path.join(ACCEPTANCE.base,'canonical-observation.json'),sha256:SHA(await readFile(path.join(ACCEPTANCE.base,'canonical-observation.json'))),catalogSha256:actual.rows[0].catalog_sha256,utf8Bytes:Buffer.byteLength(actual.rows[0].observed_canonical_text)},bindings={path:path.join(ACCEPTANCE.base,'internal-trigger-bindings.json'),sha256:SHA(await readFile(path.join(ACCEPTANCE.base,'internal-trigger-bindings.json')))};
    evidenceRegistry=await createAcceptancePinRegistry([{path:actualCanonical.path,sha256:actualCanonical.sha256},{path:bindings.path,sha256:bindings.sha256}]);
    const reviewRequest=buildReviewRequest({target,identity:actual.rows[0].identity,pinsSha256:o.trustedPinsSha256,expiresAt:budget.expiresAt,actualCanonical,bindings});
    await save('review-request.json',reviewRequest);await fullSources('pre-independent-review');
    process.stdout.write(JSON.stringify({status:'WAIT_REVIEW',requestPath:path.join(ACCEPTANCE.base,'review-request.json'),reviewPath:path.join(ACCEPTANCE.base,'issuer-review.json'),expiresAt:budget.expiresAt})+'\n');
    const reviewSha=await waitReviewHash(process.stdin,budget,abort.signal);
    await verifyPhysical();await verifySources();
    const external=await readIndependentAcceptanceReview({trustedSha256:reviewSha,target,identity:actual.rows[0].identity,request:reviewRequest,snapshot:rrBefore.snapshot}),ref=external.reviewRef;externalRegistry=external.registry;
    await save('independent-review-accepted.json',{reviewRef:ref,referenceCatalogSha256:EXPECTED.catalogSha256,actualRawCatalogSha256:actualCanonical.catalogSha256,authority:'EXTERNAL_REVIEW_NOT_CREATED_BY_RUNNER'});result.independentReviewAccepted=true;
    await fullSources('pre-original-business');await external.registry.verify();
    const business=await runCurrentRuntimeBusiness({pool:session.pool,fixture:prepared.fixture,reviewRef:ref,budget,signal:abort.signal,onStage:createFixedBusinessStageSaver(save)});
    await save('original-business-result.json',business);result.businessPassed=business.status==='PASS_FINITE_CURRENT_RUNTIME_BUSINESS_ONLY_NOT_PERFORMANCE';need(result.businessPassed,'ORIGINAL_FINITE_BUSINESS_SUCCESS_REQUIRED');
    await session.pool.awaitIdle();await session.guard();
    const postTriggers=(await session.adminQuery(triggerSql,[])).rows.map(t=>({...t,definitionSha256:SHA(t.definition)}));need(JSON.stringify(postTriggers)===JSON.stringify(beforeTriggers),'ORIGINAL_TRIGGER_CHANGED_AFTER_REAL_CREATE');
    await save('post-business-trigger-nondrift.json',{count:postTriggers.length,allEnabled:postTriggers.every(t=>t.enabled==='O'),beforeSha256:SHA(JSON.stringify(beforeTriggers)),afterSha256:SHA(JSON.stringify(postTriggers))});
    await external.registry.verify();await canonicalAcceptanceFile(ref.path,ref.sha256,64*1024);await fullSources('post-original-business');
  } catch(error) {firstFailure=error;result.firstFailure=auditError(error,sanitize);result.unknownOutcome=boundary.gate.quarantined();await save('first-failure.json',result.firstFailure).catch(()=>{});
  } finally {
    if(runtimeLease){try{runtimeLease.release();}catch(e){result.releaseError=auditError(e,sanitize);firstFailure??=e;}runtimeLease=null;}
    try{if(session)await session.closeRuntime();}catch(e){result.runtimeCloseError=auditError(e,sanitize);firstFailure??=e;}
    if(main&&!boundary.gate.quarantined())try{await birthCheck();const cleanupQuery=(sql,values=[])=>budgetedQuery(boundary.fence(main),sql,values,budget,true);await cleanupQuery('ROLLBACK');await cleanupQuery('RESET ROLE');const observed=(await cleanupQuery("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('data_directory') AS data,pg_postmaster_start_time()::text AS start,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS other_clients")).rows[0];need(observed.id===birthId&&observed.data===data&&(!target||observed.start===target.postmasterStart),'ACCEPTANCE_CLEANUP_IDENTITY_CHANGED');result.otherClients=observed.other_clients;}catch(e){result.cleanupObservationFailure=auditError(e,sanitize);}
    else if(boundary.gate.quarantined())result.cleanupSqlSkippedForUnknownOutcome=true;
    try{const closed=await boundary.closeAll();result.clientClosures=closed;result.clientsClosed=closed.length>0&&closed.every(c=>c.confirmed===true);}catch(e){result.clientCloseFailure=auditError(e,sanitize);result.clientsClosed=false;}
    try{await birthCheck();if(foreground){if(!foreground.state().closed)await childIdentity(foreground.child,data);const stopped=await stopForeground(foreground);await save('stop.json',stopped);result.stopExitCode=stopped.code===0&&!stopped.error&&!stopped.forced?0:1;result.foregroundDefinitiveClose=stopped.definitiveClose;}else result.foregroundNeverSpawned=true;}catch(e){result.stopIdentityRefused=auditError(e,sanitize);}
    result.portProbe=await portProof(ACCEPTANCE.port);result.portState=result.portProbe.state;
    try{await lstat(path.join(data,'postmaster.pid'));result.pidFileAbsent=false;}catch(e){result.pidFileAbsent=e.code==='ENOENT';}
    if(foreground?.child.pid)try{await lstat('/proc/'+foreground.child.pid);result.processAbsent=false;}catch(e){result.processAbsent=e.code==='ENOENT';}
    if(dataBirth)try{const c=await command(path.join(BIN,'pg_controldata'),[data],'',true);await save('control-after.txt',c.stdout);result.stoppedControlEvidence=stoppedControlEvidence({stdout:c.stdout,code:c.code,timedOut:c.timedOut,birthId,targetId:target?.systemIdentifier??null});result.controlShutDown=result.stoppedControlEvidence.controlShutDown;}catch(e){result.controlObservationFailure=auditError(e,sanitize);}
    try{await fullSources('post-stop',true);result.sourcePostflight=true;}catch(e){result.sourcePostflight=false;result.sourcePostflightFailure=auditError(e,sanitize);}
    process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);result.status=acceptanceTerminal(result);if(firstFailure)result.status='FAILED_ACCEPTANCE_QUARANTINED_NO_REPLAY';result.finishedAt=new Date().toISOString();await save('RESULT.json',result);
  }
  if(firstFailure)throw new Error('ACCEPTANCE_FAILED_OR_CLEANUP_UNCONFIRMED; see '+ACCEPTANCE.base,{cause:firstFailure});need(result.status.startsWith('PASS_'),'ACCEPTANCE_FAILED_OR_CLEANUP_UNCONFIRMED; see '+ACCEPTANCE.base);return {base:ACCEPTANCE.base,result};
}
export async function main(args) {let selected;try{selected=parseAcceptanceArgs(args);}catch(e){process.stderr.write(e.message+'\n'+HELP);return 2;}if(selected===null){process.stdout.write(HELP);return 0;}try{const done=await runAcceptance(selected);process.stdout.write(JSON.stringify({base:done.base,status:done.result.status,catalogSha256:done.result.catalogSha256})+'\n');return 0;}catch(e){process.stderr.write(e.message+'\n');return 1;}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main(process.argv.slice(2));
