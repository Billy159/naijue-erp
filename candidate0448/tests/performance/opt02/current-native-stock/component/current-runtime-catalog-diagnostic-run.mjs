/** ONE fresh e003 diagnostic only. Persist exact actual canonical and raw internal-trigger
 * evidence BEFORE strict independent e001 comparison. Never issuer/business,
 * expected/review self-signing, old-target replay or production. */
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
export const DIAGNOSTIC = Object.freeze({ runId: 'c20261101e003', port: 18573,
  base: path.join(EVIDENCE, 'pg-current-runtime-catalog-diagnostic-c20261101e003'),
  sourceRoot: path.join(EVIDENCE, 'cumulative-C12-work/candidate'),
  pinsPath: path.join(EVIDENCE, 'performance-resume-20261101/current-catalog-diagnostic-e003/SOURCE-PINS.json') });
export const HELP = 'Diagnostic ONLY: --run-current-runtime-catalog-diagnostic <independently-reviewed-SOURCE-PINS-sha256>\nFresh e003/127.0.0.1:18573; never acceptance/old targets. No engine on import/help.\n';
export function parseDiagnosticArgs(args) {
  need(Array.isArray(args) && Object.getPrototypeOf(args) === Array.prototype && Reflect.ownKeys(args).length === args.length + 1, 'CLOSED_DIAGNOSTIC_ARGUMENTS_REQUIRED');
  for (let i=0;i<args.length;i++) { const d=Object.getOwnPropertyDescriptor(args,String(i));need(d?.enumerable&&Object.hasOwn(d,'value')&&typeof d.value==='string','PRIMITIVE_DIAGNOSTIC_ARGUMENT_REQUIRED'); }
  if (args.length===0 || args.length===1 && args[0]==='--help') return null;
  need(args.length===2 && args[0]==='--run-current-runtime-catalog-diagnostic' && /^[a-f0-9]{64}$/.test(args[1]), 'EXACT_DIAGNOSTIC_FLAG_AND_TRUSTED_PIN_REQUIRED');
  return Object.freeze({ trustedPinsSha256: args[1] });
}
const environment = () => ({ PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',LD_LIBRARY_PATH:path.join(PG,'usr/lib/x86_64-linux-gnu') });
export const EXPECTED_ROOT=path.join(EVIDENCE,'performance-resume-20261101/independent-e001-expected-review');
export const EXPECTED=Object.freeze({canonicalPath:path.join(EXPECTED_ROOT,'EXPECTED-CANONICAL-UTF8.txt'),catalogSha256:'2b950148a6f5afb155d30931a2917965a747153bd0cd654b4e4502164395d95d',
  reviewPath:path.join(EXPECTED_ROOT,'REVIEW.json'),manifestPath:path.join(EXPECTED_ROOT,'SOURCE-MANIFEST.json'),templatePath:path.join(EXPECTED_ROOT,'E002-ISSUER-REVIEW-TEMPLATE.PENDING.json'),contractPath:path.join(EXPECTED_ROOT,'E002-ORIGINAL-ISSUER-REVIEW-CONTRACT.json'),
  reviewSha256:'67826af405aaa245973114e5eaf726baf2b873e1d6483f3d7c908347398ff68c',manifestSha256:'f9bd875aaef1fdc54999d94d4399f9da7ce6d60347cf23ef45b9c0948a05085c',
  templateSha256:'103fd6f6670d7355fe6417b5eeb030d576ac128c259d6ad91736777576f158ee',contractSha256:'7d8cd504f0819037ac9da9f6bedfa7819453ca072a4d43e679db502aafdb4822'});
const PIN_FIELDS=Object.freeze(['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs']);
function samePinBirth(expected, actual) { for(const key of PIN_FIELDS)need(expected[key]===actual[key],'IMMUTABLE_DIAGNOSTIC_PIN_DRIFT:'+key); }
async function captureDiagnosticFile(file, expectedSha, maximum=256*1024*1024) {
  need(typeof file==='string' && path.isAbsolute(file) && path.resolve(file)===file && typeof expectedSha==='string' && /^[a-f0-9]{64}$/.test(expectedSha)
    && Number.isSafeInteger(maximum)&&maximum>0&&maximum<=256*1024*1024, 'PRIMITIVE_CANONICAL_DIAGNOSTIC_PIN_REQUIRED');
  const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(maximum)&&await realpath(file)===file,'CANONICAL_REGULAR_DIAGNOSTIC_FILE_REQUIRED');
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try { const s=await fd.stat({bigint:true});samePinBirth(before,s);const bytes=await fd.readFile(),after=await lstat(file,{bigint:true});samePinBirth(before,after);
    need(after.isFile()&&!after.isSymbolicLink()&&BigInt(bytes.length)===before.size&&await realpath(file)===file&&SHA(bytes)===expectedSha,'DIAGNOSTIC_FILE_OR_HASH_CHANGED');
    return {bytes,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,before[key]])))};
  } finally { await fd.close(); }
}
export async function canonicalDiagnosticFile(file,expectedSha,maximum) { return (await captureDiagnosticFile(file,expectedSha,maximum)).bytes; }
async function boundedPins(items, work) {
  let cursor=0;const outcomes=await Promise.allSettled(Array.from({length:Math.min(32,items.length)},async()=>{while(cursor<items.length){const i=cursor++;await work(items[i]);}}));
  const failed=outcomes.find(o=>o.status==='rejected');if(failed)throw failed.reason;
}
/** Explicit test-host validation cadence: full SHA capture/bookends plus an
 * immutable no-adaptation registry at every verifySources call. Reads do not
 * change ctime. Restored bytes/mtime are NOT accepted after any identity drift. */
export async function createDiagnosticPinRegistry(entries, aliases=[]) {
  need(Array.isArray(entries)&&Object.getPrototypeOf(entries)===Array.prototype&&entries.length>0&&entries.length<=20000&&Array.isArray(aliases),'BOUNDED_DIAGNOSTIC_REGISTRY_REQUIRED');
  const records=[],links=[],seen=new Set();
  // Capture hash and all metadata around the SAME no-follow descriptor read.
  for(const input of entries){const e=captureData(input,['path','sha256']);need(!seen.has(e.path),'DUPLICATE_DIAGNOSTIC_REGISTRY_PATH');seen.add(e.path);const full=await captureDiagnosticFile(e.path,e.sha256);records.push(Object.freeze({...e,birth:full.birth}));}
  for(const input of aliases){const a=captureData(input,['path','target']);need(typeof a.path==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target),'EXACT_DIAGNOSTIC_REGISTRY_ALIAS_REQUIRED');const birth=await lstat(a.path,{bigint:true});need(await realpath(a.path)===a.target,'DIAGNOSTIC_REGISTRY_ALIAS_TARGET_CHANGED');links.push(Object.freeze({...a,birth:Object.freeze(Object.fromEntries(PIN_FIELDS.map(key=>[key,birth[key]])))}));}
  return Object.freeze({files:records.length,aliases:links.length,totalBytes:records.reduce((n,r)=>n+Number(r.birth.size),0),
    async verify(){
      await boundedPins(records,async r=>{const actual=await lstat(r.path,{bigint:true});samePinBirth(r.birth,actual);need(actual.isFile()&&!actual.isSymbolicLink()&&await realpath(r.path)===r.path,'DIAGNOSTIC_REGISTRY_CANONICAL_PATH_CHANGED');});
      await boundedPins(links,async a=>{samePinBirth(a.birth,await lstat(a.path,{bigint:true}));need(await realpath(a.path)===a.target,'DIAGNOSTIC_REGISTRY_ALIAS_CHANGED');});
      return {files:records.length,aliases:links.length,immutableBirthFields:[...PIN_FIELDS],noAdaptiveRehash:true};
    }});
}
async function readPins(trusted) {
  const raw=await canonicalDiagnosticFile(DIAGNOSTIC.pinsPath,trusted,2*1024*1024), p=captureData(JSON.parse(raw),['format','files','aliases']);
  need(p.format==='CURRENT_RUNTIME_CATALOG_DIAGNOSTIC_E003_SOURCE_PINS_V1'&&Array.isArray(p.files)&&Array.isArray(p.aliases)&&p.files.length>100,'COMPLETE_DIAGNOSTIC_SOURCE_PINS_REQUIRED');
  const receipt=JSON.parse(await canonicalDiagnosticFile(RECEIPT,RECEIPT_SHA)), libraries=new Map(receipt.runtimeSharedLibraries.map(x=>[x.path,x.sha256]));
  const python=await realpath(PIPE_PYTHON),node=await realpath(process.execPath),seen=new Set();
  const materialFiles=[MATERIAL.filename,ADDENDUM.filename,'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json','SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'].map(x=>path.join(MATERIAL_ROOT,x));
  for (const input of p.files) { const f=captureData(input,['path','sha256','kind']);
    need(typeof f.path==='string'&&path.isAbsolute(f.path)&&path.resolve(f.path)===f.path&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&['source','binary'].includes(f.kind)&&!seen.has(f.path)&&f.path!==DIAGNOSTIC.pinsPath,'CLOSED_UNIQUE_DIAGNOSTIC_FILE_PIN');
    need(f.path.startsWith(ROOT+'/')||f.path.startsWith(DIAGNOSTIC.sourceRoot+'/')||f.path.startsWith(path.join(WORK,'toolchain')+'/')||materialFiles.includes(f.path)||f.path.startsWith(EXPECTED_ROOT+'/')||f.kind==='binary'&&(f.path===python||f.path===node||libraries.get(f.path)===f.sha256),'DIAGNOSTIC_PIN_OUTSIDE_SOURCE_BINARY_SCOPE');
    seen.add(f.path);await canonicalDiagnosticFile(f.path,f.sha256);
  }
  const own=path.join(ROOT,'tests/performance/opt02/current-native-stock/component');
  const required=['current-runtime-catalog-diagnostic-run.mjs','current-runtime-catalog-diagnostic-run.offline.test.mjs','current-runtime-host.mjs','policy-observer.mjs','five-role-guard.mjs','fixture.mjs','authorizer.mjs','publication.mjs','source-verification.mjs','install-source-schema.mjs'].map(x=>path.join(own,x));
  required.push(path.join(ROOT,'package.json'),path.join(ROOT,'package-lock.json'),path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),RECEIPT,python,node,...libraries.keys(),...materialFiles,...[EXPECTED.canonicalPath,EXPECTED.reviewPath,EXPECTED.manifestPath,EXPECTED.templatePath,EXPECTED.contractPath],...['postgres','initdb','pg_controldata'].map(x=>path.join(BIN,x)));
  const share=path.join(PG,'usr/share/postgresql/17');
  for(const entry of await readdir(share,{recursive:true,withFileTypes:true}))if(entry.isFile())required.push(path.join(entry.parentPath,entry.name));
  need(required.every(x=>seen.has(x)),'MANDATORY_DIAGNOSTIC_SOURCE_BINARY_LOCK_PINS_REQUIRED');
  for (const input of p.aliases) { const a=captureData(input,['path','target']);
    need(typeof a.path==='string'&&typeof a.target==='string'&&path.isAbsolute(a.path)&&path.resolve(a.path)===a.path&&seen.has(a.target)&&p.files.find(f=>f.path===a.target)?.kind==='binary'
      && (a.path===PIPE_PYTHON||a.path===process.execPath||a.path.startsWith(PG+'/'))&&await realpath(a.path)===a.target,'EXACT_DIAGNOSTIC_BINARY_ALIAS_REQUIRED'); }
  need(p.aliases.some(a=>a.path===PIPE_PYTHON&&a.target===python),'PINNED_ANONYMOUS_PIPE_INTERPRETER_REQUIRED');
  return { raw, p };
}
const absent=async p=>{try{await lstat(p);throw Error('DIAGNOSTIC_FRESH_PATH_ALREADY_EXISTS:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}};
async function physical(p) { const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(p)===p,'DIAGNOSTIC_PRIVATE_OWNED0700_REQUIRED');return {path:p,uid:s.uid,mode:s.mode&0o777,device:s.dev,inode:s.ino,canonical:true,symbolicLink:false}; }
async function freePort(port) { await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen({host:'127.0.0.1',port,exclusive:true},()=>s.close(resolve));}); }
async function portProof(port) { return await new Promise(resolve=>{let done=false;const s=createConnection({host:'127.0.0.1',port}),finish=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.setTimeout(1000);s.once('connect',()=>finish({state:'OPEN'}));s.once('error',e=>finish(closedPortEvidence(e.code)));s.once('timeout',()=>finish({state:'UNKNOWN',reason:'TIMEOUT'}));}); }
export function assertDiagnosticChild(actual, expected) {
  need(actual.uid===expected.uid&&actual.executable===expected.executable&&actual.data===expected.data&&actual.pid===expected.pid&&Number.isInteger(actual.pid)&&actual.pid>1,'OWNED_DIAGNOSTIC_FOREGROUND_IDENTITY_REQUIRED');
}
async function childIdentity(child, data) { const pid=child.pid,s=await lstat('/proc/'+pid),args=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0');const actual={pid,uid:s.uid,executable:args[0],data:args.includes('-D')?args[args.indexOf('-D')+1]:null};assertDiagnosticChild(actual,{pid,uid:process.getuid(),executable:path.join(BIN,'postgres'),data});return actual; }
export function assertDiagnosticObservation(row, target) {
  const r=captureData(row,['identity','migration_versions','catalog_sha256','source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match','observed_canonical_text']);
  need(JSON.stringify(r.migration_versions)===JSON.stringify(Array.from({length:26},(_,i)=>i+1)),'DIAGNOSTIC_EXACT_SCHEMA26_REQUIRED');
  for(const key of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])need(r[key]===true,'DIAGNOSTIC_ORIGINAL_PROOF_FALSE:'+key);
  const i=captureData(r.identity,['database','database_oid','database_owner','current_user','session_user','server_addr','server_port','server_version_num','postmaster_start','replication_role']);
  need(i.database===target.database&&i.database_oid===target.databaseOid&&i.database_owner===target.owner&&i.current_user===LOGICAL.runtime&&i.session_user===LOGICAL.runtime&&i.server_addr==='127.0.0.1/32'&&i.server_port===DIAGNOSTIC.port&&i.server_version_num==='170011'&&i.postmaster_start===target.postmasterStart&&i.replication_role==='origin','DIAGNOSTIC_CANONICAL_DIRECT_IDENTITY_REQUIRED');
  return inspectSequenceSystemCanonicalObservation({observed_canonical_text:r.observed_canonical_text,catalog_sha256:r.catalog_sha256});
}
export function diagnosticTerminal(result) { return !result.firstFailure&&!result.unknownOutcome&&result.observationPassed===true&&result.otherClients===0&&result.clientsClosed===true&&result.stopExitCode===0&&result.foregroundDefinitiveClose===true&&result.portState==='CLOSED'&&result.pidFileAbsent===true&&result.processAbsent===true&&result.controlShutDown===true&&result.sourcePostflight===true?'PASS_DIAGNOSTIC_EXACT_ORIGINAL_EXPECTED_ONLY_NO_ISSUER':'FAILED_DIAGNOSTIC_QUARANTINED_NO_REPLAY'; }

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
/** Read-only actual bindings only. ALL raw trigger/constraint columns retained;
 * no normalization, excluded fields, business rows or expected derivation. */
export const INTERNAL_TRIGGER_BINDINGS_SQL = `/* current-catalog-diagnostic:all-internal-raw-v1 */
SELECT t.oid::text AS trigger_oid,t.tgname AS trigger_name,to_jsonb(t) AS raw_trigger,
 n.nspname AS relation_schema,c.relname AS relation_name,c.relkind AS relation_kind,
 pn.nspname AS function_schema,p.oid::regprocedure::text AS function_signature,
 pg_get_triggerdef(t.oid) AS trigger_definition,pg_get_expr(t.tgqual,t.tgrelid) AS when_expression,
 con.oid::text AS constraint_oid,cn.nspname AS constraint_schema,con.conname AS constraint_name,
 con.contype AS constraint_type,to_jsonb(con) AS raw_constraint,pg_get_constraintdef(con.oid) AS constraint_definition,
 (SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object(
   'object_identity',to_jsonb(pg_identify_object(d.classid,d.objid,d.objsubid)),
   'referenced_object_identity',to_jsonb(pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)))
   ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]'::jsonb)
  FROM pg_depend d WHERE
   (d.classid='pg_trigger'::regclass AND d.objid=t.oid) OR (d.refclassid='pg_trigger'::regclass AND d.refobjid=t.oid)
   OR (d.classid='pg_constraint'::regclass AND d.objid=con.oid) OR (d.refclassid='pg_constraint'::regclass AND d.refobjid=con.oid)
   OR (con.conindid<>0 AND ((d.classid='pg_class'::regclass AND d.objid=con.conindid)
     OR (d.refclassid='pg_class'::regclass AND d.refobjid=con.conindid)))) AS raw_dependencies,
 ownn.nspname AS owning_relation_schema,ownc.relname AS owning_relation_name,
 ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum,pos) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum ORDER BY k.pos) AS owning_columns,
 refn.nspname AS referenced_relation_schema,refc.relname AS referenced_relation_name,
 ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum,pos) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum ORDER BY k.pos) AS referenced_columns,
 ixn.nspname AS index_schema,ix.relname AS index_name,to_jsonb(ixdata) AS raw_index,
 pg_get_userbyid(c.relowner) AS relation_owner,pg_get_userbyid(ownc.relowner) AS owning_relation_owner,pg_get_userbyid(refc.relowner) AS referenced_relation_owner,
 CASE WHEN con.conindid<>0 THEN pg_get_indexdef(con.conindid) ELSE NULL END AS index_definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
 LEFT JOIN pg_constraint con ON con.oid=t.tgconstraint LEFT JOIN pg_namespace cn ON cn.oid=con.connamespace
 LEFT JOIN pg_class ownc ON ownc.oid=con.conrelid LEFT JOIN pg_namespace ownn ON ownn.oid=ownc.relnamespace
 LEFT JOIN pg_class refc ON refc.oid=con.confrelid LEFT JOIN pg_namespace refn ON refn.oid=refc.relnamespace
 LEFT JOIN pg_class ix ON ix.oid=con.conindid LEFT JOIN pg_namespace ixn ON ixn.oid=ix.relnamespace
 LEFT JOIN pg_index ixdata ON ixdata.indexrelid=con.conindid
WHERE n.nspname='naijue_erp' AND t.tgisinternal
ORDER BY n.nspname,c.relname,t.tgname,t.oid`;

export async function runDiagnostic(input) {
  const budget=createBudget(Date.now()),o=captureData(input,['trustedPinsSha256']);need(typeof o.trustedPinsSha256==='string'&&/^[a-f0-9]{64}$/.test(o.trustedPinsSha256),'TRUSTED_DIAGNOSTIC_PINS_REQUIRED');
  need(ROOT===path.join(WORK,'naijue-erp-performance-eaed143d-20261101')&&process.versions.node==='24.21.0'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.env.NODE_PG_FORCE_NATIVE,'EXACT_DIAGNOSTIC_ROOT_NODE_NO_LOADER_REQUIRED');
  const pins=await readPins(o.trustedPinsSha256);
  for(const [file,digest]of [[EXPECTED.canonicalPath,EXPECTED.catalogSha256],[EXPECTED.reviewPath,EXPECTED.reviewSha256],[EXPECTED.manifestPath,EXPECTED.manifestSha256],[EXPECTED.templatePath,EXPECTED.templateSha256],[EXPECTED.contractPath,EXPECTED.contractSha256]])need(pins.p.files.find(f=>f.path===file)?.sha256===digest,'INDEPENDENT_E001_EXACT_EXPECTED_PIN_REQUIRED');
  const expectedText=(await canonicalDiagnosticFile(EXPECTED.canonicalPath,EXPECTED.catalogSha256,2*1024*1024)).toString('utf8');
  const registry=await createDiagnosticPinRegistry([...pins.p.files.map(f=>({path:f.path,sha256:f.sha256})),{path:DIAGNOSTIC.pinsPath,sha256:o.trustedPinsSha256}],pins.p.aliases);
  const {plan,cohort}=await loadPairedSourcePlan({sourceRoot:DIAGNOSTIC.sourceRoot});
  const texts={};for(const [key,file]of Object.entries({materialText:MATERIAL.filename,addendumText:ADDENDUM.filename,closureText:'SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json',universeText:'SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json'}))texts[key]=await readFile(path.join(MATERIAL_ROOT,file),'utf8');
  const policy=await compileFinitePolicy(plan,texts);need(plan.sourceFingerprint==='726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb','ORIGINAL_INSTALLATION_COHORT_REQUIRED');
  const nativeText=await readFile(path.join(ROOT,SUCCESSOR_OBSERVATION.sourcePath),'utf8'),canonicalQuery=renderSequenceSystemCanonicalObservation({successorSourceText:nativeText,successorProbeText:probe});
  budget.remaining();await absent(DIAGNOSTIC.base);await freePort(DIAGNOSTIC.port);await mkdir(DIAGNOSTIC.base,{mode:0o700});
  const data=path.join(DIAGNOSTIC.base,'data'),baseBirth=await physical(DIAGNOSTIC.base),password=randomBytes(32).toString('base64url'),secrets=[password];
  const registerSecret=value=>{need(typeof value==='string'&&value.length>20,'RAM_ONLY_DIAGNOSTIC_SECRET_REQUIRED');secrets.push(value);};
  const sanitize=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
  const save=async(name,value)=>{need(/^[a-zA-Z0-9_.-]+$/.test(name),'CLOSED_DIAGNOSTIC_EVIDENCE_NAME');await writeFile(path.join(DIAGNOSTIC.base,name),sanitize(typeof value==='string'?value:JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n'),{flag:'wx',mode:0o600});};
  const abort=new AbortController(),onInterrupt=()=>abort.abort(Object.assign(new Error('DIAGNOSTIC_OPERATOR_INTERRUPTED'),{code:'DIAGNOSTIC_OPERATOR_INTERRUPTED'}));process.on('SIGINT',onInterrupt);process.on('SIGTERM',onInterrupt);
  const boundary=createCapturedQueryBoundary({budget});let dataBirth=null,config=null,foreground=null,main=null,session=null,runtimeLease=null,target=null,birthId=null,firstFailure=null;
  const result={format:'FRESH_CURRENT_RUNTIME_DIAGNOSTIC_OBSERVATIONS_V1',status:'IN_PROGRESS_NOT_REVIEW',physicalRunId:DIAGNOSTIC.runId,logicalDatabase:LOGICAL.database,port:DIAGNOSTIC.port,startsAt:budget.startsAt,expiresAt:budget.expiresAt,sourcePinsSha256:o.trustedPinsSha256,sourceFingerprint:plan.sourceFingerprint,observationPassed:false,retainedData:true,authority:'NONE',noIssuerCreated:true,noExpectedOrReviewCreated:true,sourceValidationCadence:'FULL_HASH_BOOKENDS_AND_PHASES_IMMUTABLE_NS_REGISTRY_EVERY_VERIFY_ORIGINAL_BEFORE_FILE_SQL_SHA_RETAINED'};
  const birthCheck=async()=>{assertPhysicalIdentity(baseBirth,await physical(DIAGNOSTIC.base));if(dataBirth)assertPhysicalIdentity(dataBirth,await physical(data));};
  const verifyPhysical=async()=>{await birthCheck();if(config){need(SHA(await readFile(path.join(data,'postgresql.conf')))===config.conf&&SHA(await readFile(path.join(data,'pg_hba.conf')))===config.hba,'DIAGNOSTIC_CONFIG_CHANGED');}if(foreground){need(!foreground.state().closed&&!foreground.state().error,'DIAGNOSTIC_POSTMASTER_CLOSED');await childIdentity(foreground.child,data);}};
  const verifySources=async()=>{need(!abort.signal.aborted,'DIAGNOSTIC_OPERATOR_INTERRUPTED');budget.remaining();await registry.verify();budget.remaining();};
  const fullSources=async(label,cleanup=false)=>{if(!cleanup)budget.remaining();await registry.verify();await readPins(o.trustedPinsSha256);await registry.verify();await save('full-source-'+label+'.json',{files:registry.files,aliases:registry.aliases,totalBytes:registry.totalBytes,allExpectedHashesMatched:true,originalRegistryNotRebased:true});if(!cleanup)budget.remaining();};
  const executablePin=async exe=>{await registry.verify();const actual=await realpath(exe),entry=pins.p.files.find(f=>f.path===actual&&f.kind==='binary');need(entry,'PINNED_NATIVE_EXECUTABLE_REQUIRED');await canonicalDiagnosticFile(actual,entry.sha256);if(exe!==actual)need(pins.p.aliases.some(a=>a.path===exe&&a.target===actual),'PINNED_NATIVE_EXEC_ALIAS_REQUIRED');};
  const command=async(exe,args,input='',cleanup=false)=>{await birthCheck();await executablePin(exe);return await runChildCommand(spawn,exe,args,{cwd:ROOT,env:environment(),input,timeoutMs:Math.min(cleanup?30000:60000,cleanup?30000:budget.remaining()),sanitize});};
  const query=async(sql,values=[])=>{await verifyPhysical();await verifySources();return await boundary.query(main,sql,values);};
  const connect=async database=>{const c=new Client({host:'127.0.0.1',port:DIAGNOSTIC.port,user:LOGICAL.admin,password,database,ssl:false,application_name:'dot-current-diagnostic-bootstrap-only',options:'-c search_path=pg_catalog',connectionTimeoutMillis:Math.min(5000,budget.remaining()),query_timeout:45000,statement_timeout:45000,lock_timeout:3000,idle_in_transaction_session_timeout:60000});boundary.capture(c,'admin');await c.connect();return c;};
  try {
    await save('source-pins-ack.json',{sha256:o.trustedPinsSha256,files:pins.p.files.length,aliases:pins.p.aliases.length,sourceRoot:DIAGNOSTIC.sourceRoot,newApplicationRoot:ROOT,separateRealBrands:true});await fullSources('pre-initdb');await absent(data);
    const init=pipeCommand(path.join(BIN,'initdb'),['-D',data,'-L',path.join(PG,'usr/share/postgresql/17'),'-U',LOGICAL.admin,'--auth-local=reject','--auth-host=scram-sha-256','--pwfile=/dev/stdin','--encoding=UTF8','--locale=C']);
    await executablePin(path.join(BIN,'initdb'));const initialized=await command(init.executable,init.args,password+'\n');await save('initdb.json',initialized);need(initialized.code===0&&!initialized.timedOut&&!initialized.spawnError,'DIAGNOSTIC_INITDB_FAILED');dataBirth=await physical(data);
    await appendFile(path.join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${DIAGNOSTIC.port}\nunix_socket_directories=''\nmax_connections=12\nshared_buffers='32MB'\nwork_mem='4MB'\ntimezone='UTC'\nlog_timezone='UTC'\nlogging_collector=off\nlog_statement='none'\nlog_min_error_statement=panic\nlog_error_verbosity=terse\n`);
    await writeFile(path.join(data,'pg_hba.conf'),`local all all reject\nhost postgres ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.admin} 127.0.0.1/32 scram-sha-256\nhost ${LOGICAL.database} ${LOGICAL.runtime} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n`,{mode:0o600});
    config={conf:SHA(await readFile(path.join(data,'postgresql.conf'))),hba:SHA(await readFile(path.join(data,'pg_hba.conf')))};
    await fullSources('post-initdb');const control=await command(path.join(BIN,'pg_controldata'),[data]);await save('birth-control.txt',control.stdout);need(control.code===0&&!control.timedOut,'DIAGNOSTIC_BIRTH_CONTROL_FAILED');birthId=control.stdout.match(/^Database system identifier:\s+([0-9]+)$/m)?.[1];need(birthId&&!['7703089336081934099','7703096890285320019'].includes(birthId),'FRESH_NON_REFERENCE_NON_ACCEPTANCE_SYSTEM_IDENTIFIER_REQUIRED');
    await verifySources();await executablePin(path.join(BIN,'postgres'));const log=await open(path.join(DIAGNOSTIC.base,'postgres.log'),'wx',0o600);try{foreground=trackForeground(spawn(path.join(BIN,'postgres'),['-D',data],{cwd:ROOT,env:environment(),stdio:['ignore',log.fd,log.fd]}));}finally{await log.close();}
    need(Number.isInteger(foreground.child.pid)&&foreground.child.pid>1,'CAPTURED_FOREGROUND_DIAGNOSTIC_PID_REQUIRED');const readyUntil=Math.min(budget.expiresAt,Date.now()+30000);let ready=false;
    while(Date.now()<readyUntil){await verifyPhysical();budget.remaining();try{const lines=(await readFile(path.join(data,'postmaster.pid'),'utf8')).trimEnd().split('\n');need(Number(lines[0])===foreground.child.pid&&lines[1]===data&&Number(lines[2])>=Math.floor(budget.startsAt/1000)-1,'DIAGNOSTIC_PIDFILE_BIRTH_MISMATCH');if(lines[7]?.trim()==='ready'){ready=true;break;}}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(r=>setTimeout(r,25));}
    need(ready,'DIAGNOSTIC_READY_DEADLINE');await save('birth-receipt.json',{baseBirth,dataBirth,systemIdentifier:birthId,directChildPid:foreground.child.pid,configSha256:config.conf,hbaSha256:config.hba,tcpOnly:true,memoryOnlyScram:true});
    main=await connect('postgres');const bootstrap=(await query("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('server_version_num') AS version,current_setting('data_directory') AS data,inet_server_addr()=inet '127.0.0.1' AS address_match,inet_server_port() AS port,current_setting('unix_socket_directories') AS sockets")).rows[0];await save('bootstrap-identity.json',bootstrap);assertBootstrapIdentity(bootstrap,{systemIdentifier:birthId,data,port:DIAGNOSTIC.port});
    for(const name of [LOGICAL.sourceOwner,LOGICAL.sentinel,LOGICAL.preparation])await boundary.commit(()=>query(`CREATE ROLE ${identifier(name)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0`));
    await boundary.commit(()=>query(`CREATE DATABASE ${identifier(LOGICAL.database)} OWNER ${identifier(LOGICAL.sourceOwner)} TEMPLATE template0 ENCODING 'UTF8'`));await boundary.commit(()=>query(`REVOKE ALL ON DATABASE ${identifier(LOGICAL.database)} FROM PUBLIC`));
    need((await boundary.closeClient(main)).confirmed,'BOOTSTRAP_ADMIN_CLOSE_UNCONFIRMED');main=null;main=await connect(LOGICAL.database);
    const identity=(await query('SELECT (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,pg_postmaster_start_time()::text AS start')).rows[0];
    target=cohort.sourcePlan.targetSnapshot({systemIdentifier:birthId,database:LOGICAL.database,databaseOid:identity.oid,admin:LOGICAL.admin,owner:LOGICAL.sourceOwner,sentinel:LOGICAL.sentinel,prepare:LOGICAL.preparation,port:DIAGNOSTIC.port,postmasterStart:identity.start,startsAt:budget.startsAt,expiresAt:budget.expiresAt});await save('target-identity.json',{physicalRunId:DIAGNOSTIC.runId,target});await query(cohort.sourcePlan.targetGuard(target));
    const genesis=(await query("SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_default_acl) AND NOT EXISTS(SELECT 1 FROM pg_prepared_xacts) AS empty")).rows[0];need(genesis?.empty===true,'FRESH_DIAGNOSTIC_EMPTY_GENESIS_REQUIRED');await save('genesis.json',genesis);
    await fullSources('pre-source-install');const prepared=await preparePublishedCurrentReference({plan,policy,target,budget,queryBoundary:boundary,adminClient:main,adminPassword:password,artifactRoot:path.join(DIAGNOSTIC.base,'synthetic-inputs'),verifyPhysical,verifySources,registerSecret,save});session=prepared.session;await fullSources('post-publication-final-role');
    const beforeTriggers=prepared.emptySchemaObservation.triggersObservationOnly;
    need(beforeTriggers.length===954&&beforeTriggers.every(t=>t.enabled==='O'),'ALL_ORIGINAL954_TRIGGERS_ENABLED_REQUIRED');
    const triggerSql="SELECT c.relname AS table_name,t.tgname AS name,p.oid::regprocedure::text AS signature,pn.nspname AS function_schema,p.pronargs AS arguments,t.tgtype::int AS type,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,t.tgisinternal AS internal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='naijue_erp' ORDER BY c.relname,t.tgname";
    const afterTriggers=(await session.adminQuery(triggerSql,[])).rows.map(t=>({...t,definitionSha256:SHA(t.definition)}));
    need(JSON.stringify(afterTriggers)===JSON.stringify(beforeTriggers),'ORIGINAL_TRIGGER_DEFINITION_OR_ENABLED_STATE_CHANGED');
    await save('trigger-nondrift.json',{count:afterTriggers.length,allEnabled:true,beforeSha256:SHA(JSON.stringify(beforeTriggers)),afterSha256:SHA(JSON.stringify(afterTriggers)),scope:'TEMPORAL_DIAGNOSTIC_NONDRIFT_NOT_SELF_SIGNED_CANONICAL_APPROVAL'});
    runtimeLease=await session.pool.connect();await runtimeLease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshotSql="SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,pg_current_snapshot()::text AS snapshot";
    const rrBefore=(await runtimeLease.query(snapshotSql,[])).rows[0];await save('diagnostic-rr-before.json',rrBefore);need(rrBefore?.isolation==='repeatable read'&&rrBefore.read_only==='on'&&typeof rrBefore.snapshot==='string','DIAGNOSTIC_RR_READONLY_SNAPSHOT_REQUIRED');
    const observation=await observeFinitePolicy({policy,runtimeQuery:(sql,values)=>runtimeLease.query(sql,values),adminQuery:session.adminQuery});await save('finite-policy-observation.json',observation);
    const actual=await runtimeLease.query(canonicalQuery.sql,[]);await save('canonical-query-result.json',{rowCount:actual.rowCount,rows:actual.rows});need(actual.rows.length===1&&actual.rowCount===1,'ONE_ACTUAL_DIAGNOSTIC_CANONICAL_ROW_REQUIRED');
    // Persist the server TEXT/identity/proofs before ANY exact expected check.
    const row=actual.rows[0];await save('canonical-observation.json',row);
    const parity=inspectSequenceSystemCanonicalObservation({observed_canonical_text:row.observed_canonical_text,catalog_sha256:row.catalog_sha256});await save('canonical-parity.json',parity);
    const rrAfter=(await runtimeLease.query(snapshotSql,[])).rows[0];await save('diagnostic-rr-snapshot.json',{before:rrBefore,after:rrAfter});need(JSON.stringify(rrBefore)===JSON.stringify(rrAfter),'ONE_DIAGNOSTIC_READ_SNAPSHOT_REQUIRED');
    await runtimeLease.query('COMMIT');runtimeLease.release();runtimeLease=null;await session.pool.awaitIdle();await session.guard();
    const bindings=await session.adminQuery(INTERNAL_TRIGGER_BINDINGS_SQL,[]);await save('internal-trigger-bindings.json',{querySha256:SHA(INTERNAL_TRIGGER_BINDINGS_SQL),rowCount:bindings.rowCount,rows:bindings.rows,scope:'ACTUAL_ALL_ERP_INTERNAL_TRIGGERS_RAW_CATALOG_NOT_EXPECTED_OR_NORMALIZED'});
    result.actualCanonicalCaptured=true;result.catalogSha256=row.catalog_sha256;result.effectiveCells=observation.cellComparison.cells;result.functions=observation.boundaryComparison.functions;
    assertDiagnosticObservation(row,target);await fullSources('post-canonical');
    result.expectedCanonicalMatched=row.catalog_sha256===EXPECTED.catalogSha256&&row.observed_canonical_text===expectedText;
    await save('strict-original-expected-comparison.json',{actualSha256:row.catalog_sha256,originalExpectedSha256:EXPECTED.catalogSha256,exactBytesMatch:result.expectedCanonicalMatched,originalExpectedPath:EXPECTED.canonicalPath,noNormalizationOrExpectedReplacement:true});
    need(result.expectedCanonicalMatched,'E003_CANONICAL_DIFFERS_FROM_PRE_FROZEN_E001_EXPECTED');result.observationPassed=true;
  } catch(error) {firstFailure=error;result.firstFailure=auditError(error,sanitize);result.unknownOutcome=boundary.gate.quarantined();await save('first-failure.json',result.firstFailure).catch(()=>{});
  } finally {
    if(runtimeLease){try{runtimeLease.release();}catch(e){result.releaseError=auditError(e,sanitize);firstFailure??=e;}runtimeLease=null;}
    try{if(session)await session.closeRuntime();}catch(e){result.runtimeCloseError=auditError(e,sanitize);firstFailure??=e;}
    if(main&&!boundary.gate.quarantined())try{await birthCheck();const cleanupQuery=(sql,values=[])=>budgetedQuery(boundary.fence(main),sql,values,budget,true);await cleanupQuery('ROLLBACK');await cleanupQuery('RESET ROLE');const observed=(await cleanupQuery("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS id,current_setting('data_directory') AS data,pg_postmaster_start_time()::text AS start,(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AS other_clients")).rows[0];need(observed.id===birthId&&observed.data===data&&(!target||observed.start===target.postmasterStart),'DIAGNOSTIC_CLEANUP_IDENTITY_CHANGED');result.otherClients=observed.other_clients;}catch(e){result.cleanupObservationFailure=auditError(e,sanitize);}
    else if(boundary.gate.quarantined())result.cleanupSqlSkippedForUnknownOutcome=true;
    try{const closed=await boundary.closeAll();result.clientClosures=closed;result.clientsClosed=closed.length>0&&closed.every(c=>c.confirmed===true);}catch(e){result.clientCloseFailure=auditError(e,sanitize);result.clientsClosed=false;}
    try{await birthCheck();if(foreground){if(!foreground.state().closed)await childIdentity(foreground.child,data);const stopped=await stopForeground(foreground);await save('stop.json',stopped);result.stopExitCode=stopped.code===0&&!stopped.error&&!stopped.forced?0:1;result.foregroundDefinitiveClose=stopped.definitiveClose;}else result.foregroundNeverSpawned=true;}catch(e){result.stopIdentityRefused=auditError(e,sanitize);}
    result.portProbe=await portProof(DIAGNOSTIC.port);result.portState=result.portProbe.state;
    try{await lstat(path.join(data,'postmaster.pid'));result.pidFileAbsent=false;}catch(e){result.pidFileAbsent=e.code==='ENOENT';}
    if(foreground?.child.pid)try{await lstat('/proc/'+foreground.child.pid);result.processAbsent=false;}catch(e){result.processAbsent=e.code==='ENOENT';}
    if(dataBirth)try{const c=await command(path.join(BIN,'pg_controldata'),[data],'',true);await save('control-after.txt',c.stdout);result.stoppedControlEvidence=stoppedControlEvidence({stdout:c.stdout,code:c.code,timedOut:c.timedOut,birthId,targetId:target?.systemIdentifier??null});result.controlShutDown=result.stoppedControlEvidence.controlShutDown;}catch(e){result.controlObservationFailure=auditError(e,sanitize);}
    try{await fullSources('post-stop',true);result.sourcePostflight=true;}catch(e){result.sourcePostflight=false;result.sourcePostflightFailure=auditError(e,sanitize);}
    process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);result.status=diagnosticTerminal(result);if(firstFailure)result.status='FAILED_DIAGNOSTIC_QUARANTINED_NO_REPLAY';result.finishedAt=new Date().toISOString();await save('RESULT.json',result);
  }
  if(firstFailure)throw new Error('DIAGNOSTIC_FAILED_OR_CLEANUP_UNCONFIRMED; see '+DIAGNOSTIC.base,{cause:firstFailure});need(result.status.startsWith('PASS_'),'DIAGNOSTIC_FAILED_OR_CLEANUP_UNCONFIRMED; see '+DIAGNOSTIC.base);return {base:DIAGNOSTIC.base,result};
}
export async function main(args) {let selected;try{selected=parseDiagnosticArgs(args);}catch(e){process.stderr.write(e.message+'\n'+HELP);return 2;}if(selected===null){process.stdout.write(HELP);return 0;}try{const done=await runDiagnostic(selected);process.stdout.write(JSON.stringify({base:done.base,status:done.result.status,catalogSha256:done.result.catalogSha256})+'\n');return 0;}catch(e){process.stderr.write(e.message+'\n');return 1;}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main(process.argv.slice(2));
