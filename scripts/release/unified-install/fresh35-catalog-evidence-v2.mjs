/** V2 source preparation and unreviewed file consistency only. No connection,
 * accepted evidence registry, installation record or runtime capability exists.
 * The legacy pinned predecessor loader is intentionally not changed or reused. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseStrictJson } from '../../../packages/application/src/unified-import-contract.ts';
import { loadFresh35RetirementPlan } from './fresh35-retirement-plan.mjs';
import { loadFresh35InstallationSourcePins } from './fresh35-retirement-install.mjs';
import { FRESH35_EVIDENCE_V2_INVENTORY_SQL, FRESH35_EVIDENCE_V2_CONTEXT_SQL, FRESH35_EVIDENCE_V2_DEPARSER, renderFresh35EvidenceV2CaptureSql } from './fresh35-catalog-evidence-v2-query.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_'+code);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
const closed=(v,keys,code)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort()),code);
const bindings=new WeakMap();
const shaPattern=/^[0-9a-f]{64}$/;
const positive=/^[1-9][0-9]*$/;
function unsigned(value,max){return typeof value==='string'&&positive.test(value)&&value.length<=20&&BigInt(value)<=max;}
function snapshot(value){
 if(typeof value!=='string'||value.length>1024*1024||!/^[0-9]+:[0-9]+:(?:[0-9]+(?:,[0-9]+)*)?$/.test(value))return false;
 const [lo,hi,list]=value.split(':');if(!unsigned(lo,18446744073709551615n)||!unsigned(hi,18446744073709551615n)||BigInt(lo)>BigInt(hi))return false;
 let prior=null;for(const xid of list?list.split(','):[]){if(!unsigned(xid,18446744073709551615n))return false;const n=BigInt(xid);if(n<BigInt(lo)||n>=BigInt(hi)||prior!==null&&n<=prior)return false;prior=n;}return true;
}
function instant(value){
 if(typeof value!=='string')return null;const m=value.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/);if(!m)return null;
 const base=m[1]+'.000Z',ms=Date.parse(base);if(!Number.isFinite(ms)||ms<0||new Date(ms).toISOString()!==base)return null;
 return BigInt(ms)*1000n+BigInt((m[2]??'').padEnd(6,'0'));
}
function epoch(value){if(typeof value!=='string'||!/^[0-9]{1,12}(?:\.[0-9]{1,6})?$/.test(value))return null;const [seconds,fraction='']=value.split('.');return BigInt(seconds)*1000000n+BigInt(fraction.padEnd(6,'0'));}

// Explicit public CLI local module closure, independently checked with an AST
// regression. Includes static/type imports, exports and literal dynamic imports.
// Updating an entrypoint requires rerunning that independent closure review.
export const FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES=Object.freeze([
 "packages/application/src/calendar-date.ts",
 "packages/application/src/canonical-request-value.ts",
 "packages/application/src/history-import-lifecycle.ts",
 "packages/application/src/history-storage-contract.ts",
 "packages/application/src/history-typed-closure.ts",
 "packages/application/src/history-typed-publication.ts",
 "packages/application/src/import-v2-contract.ts",
 "packages/application/src/inventory-cutoff-import.ts",
 "packages/application/src/native-barcode-import.ts",
 "packages/application/src/native-import-record-accounting.ts",
 "packages/application/src/native-import-schema-contract.ts",
 "packages/application/src/request-hash.ts",
 "packages/application/src/unified-explicit-zero-approval.ts",
 "packages/application/src/unified-historical-staff-hall-approval.ts",
 "packages/application/src/unified-import-contract.ts",
 "packages/application/src/unified-import-execution-v2-client.ts",
 "packages/application/src/unified-import-execution-v2.ts",
 "packages/application/src/unified-import-execution.ts",
 "packages/application/src/unified-import-historical-sales.ts",
 "packages/application/src/unified-import-master-chunks-v2.ts",
 "packages/application/src/unified-import-stable-identity.ts",
 "packages/application/src/unified-import-whole-package-profile.ts",
 "packages/application/src/unified-source-registration.ts",
 "packages/application/src/unified-zero-amount-archive.ts",
 "packages/authentication/src/passwords.ts",
 "packages/authentication/src/ports.ts",
 "packages/domain/src/errors.ts",
 "packages/domain/src/sales-money.ts",
 "packages/domain/src/values.ts",
 "scripts/release/unified-install/fresh27-plan.mjs",
 "scripts/release/unified-install/fresh27-portable-successors.mjs",
 "scripts/release/unified-install/fresh27-sql-bundle.mjs",
 "scripts/release/unified-install/render-whole-package-local.mjs",
 "scripts/release/unified-install/trusted-install-path.mjs",
 "scripts/release/unified-install/whole-catalog-gate.mjs",
 "scripts/release/unified-install/whole-closure-integration-candidate.mjs",
 "scripts/release/unified-install/whole-explicit-zero-integration-candidate.mjs",
 "scripts/release/unified-install/whole-installation-record.mjs",
 "scripts/release/unified-install/whole-sales-admission-v1.mjs",
 "scripts/release/unified-install/whole-sales-catalog-v1.mjs",
 "scripts/release/unified-install/whole-sales-integration-candidate.mjs",
 "scripts/release/unified-install/whole-sales-record-v1.mjs",
 "scripts/release/unified-install/whole-sales-trusted-path.mjs",
 "tools/unified-import/cli.mjs",
 "tools/unified-import/cli.ts",
 "tools/unified-import/execution-client.ts",
 "tools/unified-import/execution-plan.ts",
 "tools/unified-import/execution-v2-admission.ts",
 "tools/unified-import/explicit-zero-cli-input.mjs",
 "tools/unified-import/fresh35-receiver-diagnostics.ts",
 "tools/unified-import/package-reader.ts",
 "tools/unified-import/source-registration.mjs",
 "tools/unified-import/stream-baseline-requests.mjs",
 "tools/unified-import/stream-binding.mjs",
 "tools/unified-import/stream-document-requests.mjs",
 "tools/unified-import/stream-import-cli.mjs",
 "tools/unified-import/stream-master-graph.mjs",
 "tools/unified-import/stream-package-metadata.mjs",
 "tools/unified-import/stream-plan.mjs",
 "tools/unified-import/stream-preflight-cli.mjs",
 "tools/unified-import/stream-preflight.mjs",
 "tools/unified-import/stream-prepare-cli.mjs",
 "tools/unified-import/stream-program.mjs",
 "tools/unified-import/stream-relations.mjs",
 "tools/unified-import/stream-typed-hash.mjs",
 "tools/unified-import/whole-host-session.mjs",
 "tools/unified-import/whole-package-client.ts",
 "tools/unified-import/whole-package-host.mjs",
 "tools/unified-import/whole-package-inspect.ts",
 "tools/unified-import/whole-package-reconcile.mjs",
 "tools/unified-import/whole-package-sql-kernel.ts",
 "tools/unified-import/whole-sales-host.mjs"
]);
const sourcePaths=Object.freeze([
 ...['contract','collector','record-draft','schema-diff','postconditions','evidence-v2','evidence-v2-query'].map(n=>'scripts/release/unified-install/fresh35-catalog-'+n+'.mjs'),
 'tools/unified-import/fresh35-host-session.mjs',
 ...FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES,
]);
const loadedOwnPins=new Map(await Promise.all(['fresh35-catalog-evidence-v2.mjs','fresh35-catalog-evidence-v2-query.mjs'].map(async name=>['scripts/release/unified-install/'+name,hash(await readFile(new URL(name,import.meta.url)))])));
/** Binds the declared structural/receiver source scope as it exists locally.
 * This is not proof that the tree is final or that any bytes ran in PostgreSQL. */
export async function createFresh35EvidenceV2SourceBinding(root){
 const plan=await loadFresh35RetirementPlan(root),installation=await loadFresh35InstallationSourcePins(root,plan);
 const pins=new Map(installation.pins.map(p=>[p.path,p.sha256]));
 for(const path of sourcePaths){const digest=hash(await readFile(resolve(root,path)));need(!pins.has(path)||pins.get(path)===digest,'SOURCE_PIN_CONFLICT');need(!loadedOwnPins.has(path)||loadedOwnPins.get(path)===digest,'RUNNING_MODULE_SOURCE_DIFFERS');pins.set(path,digest);}
 const sourcePins=[...pins].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,sha256])=>({path,sha256}));
 const descriptor={format:'FRESH35_EVIDENCE_SOURCE_BINDING_V2',predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256,retirementSourceSetSha256:plan.sourceSetSha256,installationSourceSetSha256:installation.sha256,sourcePins,sourceScope:'STRUCTURAL_AND_PUBLIC_CLI_LOCAL_SOURCE_CLOSURE_NOT_WHOLE_REPOSITORY',publicCliSourceScope:{roots:['tools/unified-import/cli.mjs','tools/unified-import/cli.ts'],modulePaths:FRESH35_EVIDENCE_V2_PUBLIC_CLI_MODULES,externalRuntimeDependenciesNotAttested:['Node built-ins','pg package and its dependency tree','OS executables and runtime artifacts']},inventoryQuerySha256:hash(FRESH35_EVIDENCE_V2_INVENTORY_SQL),contextQuerySha256:hash(FRESH35_EVIDENCE_V2_CONTEXT_SQL)};
 const result=freeze({...descriptor,sha256:hash(canonical(descriptor)),sourceOnly:true,finalSourceFreezeAuthenticated:false,executionAuthorized:false});bindings.set(result,resolve(root));return result;
}
async function assertUnchanged(binding){
 const root=bindings.get(binding);need(root,'GENUINE_SOURCE_BINDING_REQUIRED');
 for(const pin of binding.sourcePins)need(hash(await readFile(resolve(root,pin.path)))===pin.sha256,'SOURCE_FILE_CHANGED:'+pin.path);
}
export const FRESH35_EVIDENCE_V2_REQUIRED_FILES=Object.freeze(['inventory.sql','context.sql','capture.sql','schema178-naijue-erp.sql','inventory.json','functions.json','objects.json','acl-and-roles.json','dependencies.json','shared-dependencies.json','capture-context.json','source-target.json'].sort());
const settings=Object.freeze({server_encoding:'UTF8',client_encoding:'UTF8',search_path:'pg_catalog',quote_all_identifiers:'off',standard_conforming_strings:'on',transaction_isolation:'repeatable read',transaction_read_only:'on',session_replication_role:'origin',DateStyle:'ISO, MDY',IntervalStyle:'postgres',extra_float_digits:'3',TimeZone:'UTC'});
const identityKeys=['system_identifier','database_oid','database_name','owner','actor','current_user','server_version_num'];
function session(v){
 closed(v,['identity','settings','backend_pid','transaction_started_at','server_address','server_port','visible_snapshot'],'CONTEXT_SESSION_INVALID');closed(v.identity,identityKeys,'CONTEXT_IDENTITY_INVALID');
 need(identityKeys.every(k=>typeof v.identity[k]==='string'&&v.identity[k].length>0&&v.identity[k].length<=256),'CONTEXT_IDENTITY_INVALID');
 need(unsigned(v.identity.system_identifier,18446744073709551615n)&&unsigned(v.identity.database_oid,4294967295n)&&/^17[0-9]{4}$/.test(v.identity.server_version_num),'CONTEXT_NUMERIC_IDENTITY_INVALID');
 need(/^synthetic_schema178v2_[a-z0-9_]+$/.test(v.identity.database_name)&&v.identity.database_name.length<=63&&/^[a-z_][a-z0-9_]{0,62}$/.test(v.identity.owner)&&v.identity.actor===v.identity.owner&&v.identity.current_user===v.identity.owner,'CONTEXT_SYNTHETIC_OWNER_REQUIRED');
 need(unsigned(v.backend_pid,2147483647n)&&epoch(v.transaction_started_at)!==null&&epoch(v.transaction_started_at)>0n&&snapshot(v.visible_snapshot),'CONTEXT_TRANSACTION_INVALID');
 need(v.server_address==='127.0.0.1'&&typeof v.server_port==='string'&&positive.test(v.server_port)&&Number(v.server_port)<=65535,'CONTEXT_CONNECTION_INVALID');
 closed(v.settings,['server_version_num',...Object.keys(settings)],'CONTEXT_SETTINGS_MISSING');need(same(v.settings,{server_version_num:v.identity.server_version_num,...settings}),'CONTEXT_SETTINGS_DIFFER');
}
function capture(c){
 closed(c,['format','exportedSnapshot','before','after','deparser','dump','exporter','inventoryWindow'],'CONTEXT_FIELDS_INVALID');need(c.format==='FRESH35_DEPARSE_CONTEXT_V2','CONTEXT_FORMAT_INVALID');
 need(typeof c.exportedSnapshot==='string'&&/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(c.exportedSnapshot),'CONTEXT_EXPORTED_SNAPSHOT_INVALID');
 session(c.before);session(c.after);need(same(c.before,c.after),'CONTEXT_SESSION_DRIFT');need(same(c.deparser,FRESH35_EVIDENCE_V2_DEPARSER),'CONTEXT_DEPARSER_DIFFERS');
 closed(c.dump,['serverVersionNum','toolVersionNum','toolSha256','exportedSnapshot','options','startedAt','finishedAt'],'CONTEXT_DUMP_FIELDS_INVALID');
 need(c.dump.serverVersionNum===c.before.identity.server_version_num&&c.dump.toolVersionNum===c.before.identity.server_version_num&&shaPattern.test(c.dump.toolSha256)&&c.dump.exportedSnapshot===c.exportedSnapshot,'CONTEXT_DUMP_BINDING_DIFFERS');
 need(same(c.dump.options,['--schema-only','--format=plain','--quote-all-identifiers','--schema=naijue_erp']),'CONTEXT_DUMP_OPTIONS_DIFFER');
 closed(c.exporter,['backendPid','visibleSnapshot','exportedAt','closedAt'],'CONTEXT_EXPORTER_FIELDS_INVALID');closed(c.inventoryWindow,['startedAt','finishedAt'],'CONTEXT_WINDOW_INVALID');
 need(unsigned(c.exporter.backendPid,2147483647n)&&c.exporter.backendPid!==c.before.backend_pid&&c.exporter.visibleSnapshot===c.before.visible_snapshot,'CONTEXT_EXPORTER_BINDING_DIFFERS');
 const start=instant(c.exporter.exportedAt),end=instant(c.exporter.closedAt);need(start!==null&&end!==null&&start<=end,'CONTEXT_EXPORTER_WINDOW_INVALID');
 for(const window of [c.inventoryWindow,c.dump]){const began=instant(window.startedAt),finished=instant(window.finishedAt);need(began!==null&&finished!==null&&start<=began&&began<=finished&&finished<=end,'CONTEXT_EXPORTER_LIFETIME_DIFFERS');}
 const transaction=epoch(c.before.transaction_started_at);need(instant(c.inventoryWindow.startedAt)<=transaction&&transaction<=instant(c.inventoryWindow.finishedAt),'CONTEXT_TRANSACTION_WINDOW_DIFFERS');
}
function bytes(v){need(typeof v==='string'||v instanceof Uint8Array,'ARTIFACT_BYTES_REQUIRED');if(typeof v==='string')need(v.isWellFormed(),'ARTIFACT_UTF8_INVALID');const b=typeof v==='string'?Buffer.from(v):Buffer.from(v);need(b.length>0&&b.length<=32*1024*1024,'ARTIFACT_SIZE_INVALID');need(!(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf),'BOM_NOT_ALLOWED');return b;}
function json(b){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{throw Error('FRESH35_V2_ARTIFACT_UTF8_INVALID');}
 // Bound nesting before invoking the shared duplicate-key rejecting parser.
 let depth=0,inString=false,escaped=false;for(const c of text){if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;}else if(c==='"')inString=true;else if(c==='{'||c==='['){depth++;need(depth<=64,'JSON_DEPTH_EXCEEDED');}else if(c==='}'||c===']')depth--;}
 const value=parseStrictJson(text);const stack=[value];while(stack.length){const item=stack.pop();if(typeof item==='number')need(Number.isFinite(item)&&(!Number.isInteger(item)||Number.isSafeInteger(item)),'JSON_NUMBER_UNSAFE');else if(item&&typeof item==='object')stack.push(...Object.values(item));}return value;
}
/** Caller files can demonstrate consistency only. Hashes, context and declared
 * process lifetimes are untrusted assertions until separately reviewed/pinned.
 * This function does not parse/execute SQL, assess privileges or validate schema
 * semantics; even an empty synthetic model can be a consistent candidate. */
export async function validateFresh35EvidenceV2Candidate(binding,input){
 await assertUnchanged(binding);closed(input,['manifest','files'],'INPUT_FIELDS_INVALID');closed(input.files,FRESH35_EVIDENCE_V2_REQUIRED_FILES,'ARTIFACT_COHORT_DIFFERS');
 const mb=bytes(input.manifest);need(mb.length<=128*1024,'MANIFEST_SIZE_INVALID');const manifest=json(mb);closed(manifest,['format','sourceBindingSha256','files'],'MANIFEST_FIELDS_INVALID');
 need(manifest.format==='FRESH35_PREDECESSOR_EVIDENCE_CANDIDATE_V2','MANIFEST_FORMAT_INVALID');need(manifest.sourceBindingSha256===binding.sha256,'SOURCE_BINDING_DIFFERS');
 need(Array.isArray(manifest.files)&&same(manifest.files.map(x=>x?.path),FRESH35_EVIDENCE_V2_REQUIRED_FILES),'MANIFEST_FILE_COHORT_DIFFERS');
 let total=0;const artifacts={};for(const pin of manifest.files){closed(pin,['path','sha256','bytes'],'MANIFEST_PIN_INVALID');need(shaPattern.test(pin.sha256)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=32*1024*1024,'MANIFEST_PIN_INVALID');const b=bytes(input.files[pin.path]);total+=b.length;need(total<=96*1024*1024,'TOTAL_SIZE_EXCEEDED');need(b.length===pin.bytes&&hash(b)===pin.sha256,'ARTIFACT_BYTES_DIFFER:'+pin.path);artifacts[pin.path]=pin.path.endsWith('.json')?json(b):new TextDecoder('utf-8',{fatal:true}).decode(b);}
 need(artifacts['inventory.sql']===FRESH35_EVIDENCE_V2_INVENTORY_SQL&&artifacts['context.sql']===FRESH35_EVIDENCE_V2_CONTEXT_SQL,'QUERY_SOURCE_DIFFERS');
 const c=artifacts['capture-context.json'];capture(c);need(artifacts['capture.sql']===renderFresh35EvidenceV2CaptureSql(c.exportedSnapshot),'QUERY_SOURCE_DIFFERS');const inv=artifacts['inventory.json'];
 const arrayKeys=['routines','relations','columns','constraints','indexes','triggers','policies','roles','memberships','default_acl','schemas','dependencies','shared_dependencies','extensions'];
 closed(inv,['context','database_acl','nonbusiness_scope',...arrayKeys],'INVENTORY_FIELDS_INVALID');
 need(arrayKeys.every(key=>inv[key]===null||Array.isArray(inv[key])&&inv[key].every(row=>row&&typeof row==='object'&&!Array.isArray(row))),'INVENTORY_CATEGORY_TYPE_INVALID');
 need(inv.nonbusiness_scope==='Schema and catalog only; no runtime admission, no security probes, no formal record','INVENTORY_SCOPE_DIFFERS');
 need(same(inv.context,c.before),'INVENTORY_CONTEXT_DIFFERS');
 closed(inv.database_acl,['oid','owner','acl'],'INVENTORY_DATABASE_ACL_INVALID');need(inv.database_acl.oid===c.before.identity.database_oid&&inv.database_acl.owner===c.before.identity.owner&&(inv.database_acl.acl===null||Array.isArray(inv.database_acl.acl)&&inv.database_acl.acl.every(item=>typeof item==='string')),'INVENTORY_DATABASE_ACL_INVALID');
 const source=artifacts['source-target.json'];closed(source,['format','scope','sourceBindingSha256','predecessorSourceSpecSha256','target','exportedSnapshot','formalRecordCreated','businessImported'],'SOURCE_TARGET_FIELDS_INVALID');
 need(source.format==='FRESH35_PREDECESSOR_SOURCE_TARGET_V2'&&source.scope==='SYNTHETIC_SCHEMA_ONLY_NOT_ADMISSION'&&source.sourceBindingSha256===binding.sha256&&source.predecessorSourceSpecSha256===binding.predecessorSourceSpecSha256&&same(source.target,c.before.identity)&&source.exportedSnapshot===c.exportedSnapshot&&source.formalRecordCreated===false&&source.businessImported===false,'SOURCE_TARGET_DIFFERS');
 for(const [file,key] of [['functions.json','routines'],['dependencies.json','dependencies'],['shared-dependencies.json','shared_dependencies']])need(Object.hasOwn(inv,key)&&same(artifacts[file],inv[key]),'DERIVED_ARTIFACT_DIFFERS:'+file);
 for(const [file,keys] of [['objects.json',['relations','columns','constraints','indexes','triggers','policies','extensions']],['acl-and-roles.json',['roles','memberships','default_acl','database_acl','schemas']]]){need(keys.every(k=>Object.hasOwn(inv,k)),'DERIVED_ARTIFACT_DIFFERS:'+file);need(same(artifacts[file],Object.fromEntries(keys.map(k=>[k,inv[k]]))),'DERIVED_ARTIFACT_DIFFERS:'+file);}
 await assertUnchanged(binding);
 return freeze({format:'FRESH35_EVIDENCE_CANDIDATE_CONSISTENCY_REPORT_V2',state:'CONSISTENT_UNREVIEWED_CANDIDATE',sourceBindingSha256:binding.sha256,manifestSha256:hash(mb),artifactPins:manifest.files,target:source.target,sourceMatchesLocalFiles:true,declaredContextConsistent:true,executionProvenanceAuthenticated:false,catalogMetadataComplete:false,engineDependenciesVerified:false,engineVerified:false,installationReady:false,targetAdmitted:false,reviewedEvidenceRegistered:false});
}
/** Intentionally no registry parameter, environment override or approve flag. */
export function loadReviewedFresh35EvidenceV2(){throw Error('FRESH35_V2_REVIEWED_PROFILE_NOT_REGISTERED');}
