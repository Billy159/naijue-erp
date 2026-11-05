/** Pure reference command/birth/pin/metadata/terminal tests. No PG, connect,
 * initdb, port binding, process spawning or source installation. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm,readFile,utimes,lstat,rename,mkdir,chmod,link,appendFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {parseReferenceArgs,REFERENCE,ROOT,canonicalReferenceFile,createReferencePinRegistry,assertReferenceChild,assertReferenceObservation,referenceTerminal} from './current-runtime-reference-run.mjs';
import {SUCCESSOR_OBSERVATION} from '../sequence-system-successor-observation.mjs';
import {LOGICAL} from '../reference-compiler-cohort-v2/universe.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('only explicit hash+reference flag;help/default inert,no arbitraryport/database/acceptance or duplicate args',()=>{
 assert.equal(parseReferenceArgs([]),null);assert.equal(parseReferenceArgs(['--help']),null);
 assert.deepEqual(parseReferenceArgs(['--run-current-runtime-reference','a'.repeat(64)]),{trustedPinsSha256:'a'.repeat(64)});
 for(const args of [['--run-current-runtime-reference'],['--run-current-runtime-reference','A'.repeat(64)],['--run-current-runtime-reference','a'.repeat(64),'--port','18572'],['--run-current-runtime-acceptance','a'.repeat(64)],['--help','--help'],[1]])assert.throws(()=>parseReferenceArgs(args));
 const getter=[];Object.defineProperty(getter,'0',{enumerable:true,get(){assert.fail('CLIgetter invoked');}});assert.throws(()=>parseReferenceArgs(getter));
 assert.equal(REFERENCE.runId,'c20261101e001');assert.equal(REFERENCE.port,18571);assert.match(REFERENCE.base,/pg-current-runtime-reference-c20261101e001$/);assert.equal(LOGICAL.database,'naijue_erp_test_c20261101cafe');
 assert.notEqual(REFERENCE.runId,LOGICAL.database.split('_test_')[1]);assert.match(ROOT,/naijue-erp-performance-eaed143d-20261101$/);
});
test('canonical descriptor pins reject same-byte file/parent symlinks,changedhash and getter paths',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'current-reference-pins-'));try{const file=path.join(temp,'original.txt');await writeFile(file,'SOURCE');assert.equal((await canonicalReferenceFile(file,hash('SOURCE'))).toString(),'SOURCE');
 await symlink(file,path.join(temp,'leaf'));await assert.rejects(canonicalReferenceFile(path.join(temp,'leaf'),hash('SOURCE')));
 await symlink(temp,path.join(temp,'parent'));await assert.rejects(canonicalReferenceFile(path.join(temp,'parent/original.txt'),hash('SOURCE')));
 await assert.rejects(canonicalReferenceFile(file,hash('OTHER')));await assert.rejects(canonicalReferenceFile({toString(){assert.fail('coerced');}},hash('SOURCE')));
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('owned child scope binds exactcapturedPID/uid/executable/data independently of configuration/PIDfile availability',()=>{
 const e={pid:123,uid:1000,executable:'/pinned/postgres',data:'/new/private/data'};assertReferenceChild({...e},e);
 for(const [key,value]of Object.entries({pid:124,uid:0,executable:'/foreign/postgres',data:'/old/production'}))assert.throws(()=>assertReferenceChild({...e,[key]:value},e));
});
const target={database:LOGICAL.database,databaseOid:'16387',owner:LOGICAL.sourceOwner,postmasterStart:'2026-11-01 00:00:00+00'};
function row(){const text=JSON.stringify({format:SUCCESSOR_OBSERVATION.format,sequence_system_column_acls:[]});return{identity:{database:target.database,database_oid:target.databaseOid,database_owner:target.owner,current_user:LOGICAL.runtime,session_user:LOGICAL.runtime,server_addr:'127.0.0.1/32',server_port:18571,server_version_num:'170011',postmaster_start:target.postmasterStart,replication_role:'origin'},migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:hash(text),source_routines_match:true,recorded_live_balance_contract_match:true,normal_delete_acl_match_v8:true,complete_write_system_acl_match_v8:true,sequence_system_raw_acl_match:true,observed_canonical_text:text};}
test('MOCKmetadata only:exactnewformat+alloriginalguardbooleans+directLOGIN+26versions+serverUTF8digest required',()=>{
 assert.equal(assertReferenceObservation(row(),target).authority,'NONE');
 for(const k of ['source_routines_match','recorded_live_balance_contract_match','normal_delete_acl_match_v8','complete_write_system_acl_match_v8','sequence_system_raw_acl_match'])assert.throws(()=>assertReferenceObservation({...row(),[k]:false},target));
 for(const [k,v]of Object.entries({database:'foreign',database_owner:'owner_fallback',current_user:LOGICAL.sourceOwner,session_user:LOGICAL.admin,server_addr:'::1/128',server_port:18572,server_version_num:'170010',replication_role:'replica',postmaster_start:'changed'})){const r=row();r.identity[k]=v;assert.throws(()=>assertReferenceObservation(r,target));}
 assert.throws(()=>assertReferenceObservation({...row(),migration_versions:[1,2]},target));assert.throws(()=>assertReferenceObservation({...row(),catalog_sha256:'0'.repeat(64)},target));assert.throws(()=>assertReferenceObservation({...row(),extra:true},target));
});
test('terminalPASSonlyafter nonforceddefinitiveclose,allcapturedclients,closedport,pid/processabsent,sameIDcontrol,postflight',()=>{
 const good={observationPassed:true,otherClients:0,clientsClosed:true,stopExitCode:0,foregroundDefinitiveClose:true,portState:'CLOSED',pidFileAbsent:true,processAbsent:true,controlShutDown:true,sourcePostflight:true};assert.match(referenceTerminal(good),/^PASS_REFERENCE_OBSERVATIONS_ONLY_PENDING/);
 for(const [k,v]of Object.entries({observationPassed:false,otherClients:1,clientsClosed:false,stopExitCode:1,foregroundDefinitiveClose:false,portState:'UNKNOWN',pidFileAbsent:false,processAbsent:false,controlShutDown:false,sourcePostflight:false,unknownOutcome:true,firstFailure:'SQL failed'}))assert.match(referenceTerminal({...good,[k]:v}),/^FAILED/);
});
test('source-onlycomposition keeps originalpipeline,fence,cutoffbeforefifthrole,close-onlyunknown,TCP/SCRAM/pipe andnoapproval',async()=>{
 const source=await readFile(new URL('./current-runtime-reference-run.mjs',import.meta.url),'utf8');
 assert.match(source,/preparePublishedCurrentReference\(\{plan,policy,target/);assert.match(source,/createCapturedQueryBoundary\(\{budget\}\)/);
 assert.match(source,/boundary\.commit\(\(\)=>query\(`CREATE DATABASE/);assert.match(source,/if\(main&&!boundary\.gate\.quarantined\(\)\)/);
 assert.match(source,/stopForeground\(foreground\)/);assert.match(source,/await birthCheck\(\);if\(foreground\)/);
 assert.match(source,/unix_socket_directories=''/);assert.match(source,/scram-sha-256/);assert.match(source,/--pwfile=\/dev\/stdin/);assert.match(source,/pipeCommand/);
 assert.doesNotMatch(source,/\bcreateNativeRuntime26Issuer\s*\(|\bassertReady\s*:\s*(?:async\s*)?\(/);assert.match(source,/noExpectedOrReviewCreated:true/);
 assert.match(source,/beforeTriggers\.length===954&&beforeTriggers\.every\(t=>t\.enabled==='O'\)/);
 assert.match(source,/JSON\.stringify\(afterTriggers\)===JSON\.stringify\(beforeTriggers\)/);
 assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(source,/ONE_REFERENCE_READ_SNAPSHOT_REQUIRED/);
 assert.match(source,/await fullSources\('post-stop',true\);result\.sourcePostflight=true/);
 assert.match(source,/await executablePin\(path\.join\(BIN,'initdb'\)\)/);assert.match(source,/await executablePin\(path\.join\(BIN,'postgres'\)\)/);
});
test('cadence registry never adapts to samebytes rewrite even when exactmtime is restored;ctimeNs remains a hard refusal',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'reference-ns-'));try{const file=path.join(temp,'source'),fixed=new Date('2020-01-01T00:00:00.000Z');await writeFile(file,'SOURCE',{mode:0o600});await utimes(file,fixed,fixed);const before=await lstat(file,{bigint:true});const registry=await createReferencePinRegistry([{path:file,sha256:hash('SOURCE')}]);assert.equal((await registry.verify()).noAdaptiveRehash,true);
 await new Promise(r=>setTimeout(r,5));await writeFile(file,'SOURCE');await utimes(file,fixed,fixed);assert.equal((await lstat(file,{bigint:true})).mtimeNs,before.mtimeNs);
 await assert.rejects(registry.verify(),/IMMUTABLE_REFERENCE_PIN_DRIFT:ctimeNs/);await assert.rejects(registry.verify(),/IMMUTABLE_REFERENCE_PIN_DRIFT:ctimeNs/,'never rebase after a first rejection');
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('cadence registry rejects replacementinode,mode,size,hardlinks,parentalias and changedbinaryalias',async t=>{
 for(const kind of ['inode','mode','size','nlink','parent','binaryAlias'])await t.test(kind,async()=>{const temp=await mkdtemp(path.join(os.tmpdir(),'reference-drift-'));try{const dir=path.join(temp,'dir');await mkdir(dir);const file=path.join(dir,'source');await writeFile(file,'SOURCE',{mode:0o600});const alias=path.join(temp,'binary');if(kind==='binaryAlias')await symlink(file,alias);const registry=await createReferencePinRegistry([{path:file,sha256:hash('SOURCE')}],kind==='binaryAlias'?[{path:alias,target:file}]:[]);await registry.verify();
 if(kind==='inode'){const replacement=path.join(temp,'replacement');await writeFile(replacement,'SOURCE',{mode:0o600});await rename(replacement,file);}
 else if(kind==='mode')await chmod(file,0o640);else if(kind==='size')await appendFile(file,'!');else if(kind==='nlink')await link(file,path.join(temp,'hardlink'));
 else if(kind==='parent'){const moved=path.join(temp,'moved');await rename(dir,moved);await symlink(moved,dir);}
 else{await rm(alias);await symlink(file,alias);}
 await assert.rejects(registry.verify());
 }finally{await rm(temp,{recursive:true,force:true});}});
});
