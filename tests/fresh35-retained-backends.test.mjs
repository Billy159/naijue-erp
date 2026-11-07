import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRetainedRestartReceipt} from '../scripts/release/unified-install/fresh35-installed-real-window-v1.mjs';
import {
 loadRetainedBackendProof,retainedBackendSetPredicate,retainedProcStatMatches,validateRetainedBackendProof
} from '../scripts/release/unified-install/fresh35-retained-backends-v1.mjs';

const bootId='a1234567-aaaa-aaaa-aaaa-0123456789ab';
const proc=(pid,fd)=>({pid,fd,device:'11',inode:String(80+pid),startTicks:String(100+pid)});
const procStat=({pid,startTicks},parent,state='S')=>
 [pid,'(synthetic name with ) inside)',state,parent,...Array(17).fill(0),startTicks,0].join(' ');
function fixture(){
 const binding={requestKey:'t45-r4-real-prepare-20261107-01',currentSourceSetSha256:'1'.repeat(64),operationParametersSha256:'2'.repeat(64),
  installationRecordSha256:'3'.repeat(64),restartReceiptSha256:'4'.repeat(64),startsAt:1000,expiresAt:901000};
 const {startsAt,...proofBinding}=binding;
 const guardian=proc(60,13),postmaster=proc(61,14);
 const backends=[
  {...proc(62,15),backendType:'checkpointer',datid:null,usesysid:null},
  {...proc(63,16),backendType:'logical replication launcher',datid:null,usesysid:10}
 ];
 const proof={format:'FRESH35_RETAINED_BACKENDS_V1',...proofBinding,bootId,pidNamespace:{device:'9',inode:'1001'},
  capturedAt:1020,guardian,postmaster,backends};
 const dirs=new Map([guardian,postmaster,...backends].map(p=>[
  '/proc/self/fd/'+p.fd,{dev:BigInt(p.device),ino:BigInt(p.inode),isDirectory:()=>true}
 ]));
 dirs.set('/proc/self/ns/pid',{dev:9n,ino:1001n});
 const contents=new Map([
  ['/proc/sys/kernel/random/boot_id',bootId+'\n'],['/proc/self/fdinfo/12','pos:\t0\nflags:\t02100000\n'],
  ['/proc/self/fd/13/stat',procStat(guardian,1)],['/proc/self/fd/14/stat',procStat(postmaster,guardian.pid)],
  ...backends.map(p=>['/proc/self/fd/'+p.fd+'/stat',procStat(p,postmaster.pid)])
 ]);
 const clock={now:1025},opened={mode:0o100400n,inode:14n,uid:0n,gid:0n,nlink:1n},reads=[];
 const io={
  fstatSync(fd){assert.equal(fd,12);return {isFile:()=>true,dev:1n,ino:opened.inode,uid:opened.uid,gid:opened.gid,
   mode:opened.mode,nlink:opened.nlink,size:BigInt(Buffer.byteLength(JSON.stringify(proof))),mtimeNs:2n,ctimeNs:3n};},
  readSync(fd,buf,offset,size,position){
   assert.equal(fd,12);reads.push(position);
   return Buffer.from(JSON.stringify(proof)).copy(buf,offset,position,position+Math.min(size,100));
  },
  async readFile(path){assert(contents.has(path),path);return contents.get(path);},
  async stat(path){assert(dirs.has(path),path);return dirs.get(path);}
 };
 return {binding,proof,clock,opened,contents,dirs,reads,load:()=>loadRetainedBackendProof(binding,'12',io,()=>clock.now)};
}

test('same read-only descriptors survive a long preflight and are reread on each host open',async()=>{
 const f=fixture(),first=await f.load();
 f.clock.now+=685521;
 await first.current();
 const second=await f.load();
 assert.deepEqual(first.backends,second.backends);
 assert.deepEqual(first.backends.map(({pid,datid,usesysid})=>[pid,datid,usesysid]),[[62,null,null],[63,null,10]]);
 assert(Object.isFrozen(first.backends)&&Object.isFrozen(first.backends[0]));
 assert.equal(f.reads.filter(position=>position===0).length,5);
 f.clock.now=f.proof.expiresAt;
 await assert.rejects(first.current(),/FINITE_WINDOW_REQUIRED/);
 await assert.rejects(f.load(),/FINITE_WINDOW_REQUIRED/);
});

test('different binding, unsupported process, invalid lifetime, and duplicate handles fail closed',()=>{
 for(const field of ['requestKey','currentSourceSetSha256','operationParametersSha256','installationRecordSha256','restartReceiptSha256']){
  const f=fixture();
  f.proof[field]=field==='requestKey'?'t45-r4-real-prepare-20261107-02':'a'.repeat(64);
  assert.throws(()=>validateRetainedBackendProof(f.proof,f.binding,f.clock.now),/WRONG_REQUEST_KEY|WRONG_PROVENANCE/);
 }
 const f=fixture(),verify=()=>validateRetainedBackendProof(f.proof,f.binding,f.clock.now),first=f.proof.backends[0];
 f.proof.backends.push({...first,pid:70});
 assert.throws(verify,/DUPLICATE_PROCESS/);
 f.proof.backends.pop();
 first.backendType='client backend';
 assert.throws(verify,/EXACT_PROCESS_SET_REQUIRED/);
 first.backendType='checkpointer';
 first.datid=177;
 assert.throws(verify,/EXACT_PROCESS_SET_REQUIRED/);
 first.datid=null;
 f.proof.expiresAt++;
 assert.throws(verify,/FINITE_WINDOW_REQUIRED/);
});

test('live proof rejects changed bytes, file identity, root mode, and writable descriptor',async()=>{
 const f=fixture(),token=await f.load();
 f.proof.backends[0].inode='1420';
 await assert.rejects(token.current(),/PROOF_FD_CHANGED/);
 f.proof.backends[0].inode='142';
 f.opened.inode++;
 await assert.rejects(token.current(),/PROOF_FD_CHANGED/);
 f.opened.uid=61035n;
 await assert.rejects(f.load(),/ROOT_PROOF_REQUIRED/);
 f.opened.uid=0n;f.opened.mode=0o100600n;
 await assert.rejects(f.load(),/ROOT_PROOF_REQUIRED/);
 f.opened.mode=0o100400n;
 f.contents.set('/proc/self/fdinfo/12','flags:\t02100002\n');
 await assert.rejects(f.load(),/READ_ONLY_PROOF_REQUIRED/);
});

test('live proof rejects replacement, foreign parent, dead process, reboot, and namespace change',async()=>{
 const f=fixture(),token=await f.load(),row=f.proof.backends[0],dir='/proc/self/fd/'+row.fd;
 const original=f.dirs.get(dir);
 f.dirs.set(dir,{...original,ino:9999n});
 await assert.rejects(token.current(),/PROC_HANDLE_CHANGED/);
 f.dirs.set(dir,original);
 for(const [p,parent,state] of [[{...row,startTicks:'999'},61,'S'],[row,60,'S'],[row,61,'Z']]){
  f.contents.set(dir+'/stat',procStat(p,parent,state));
  await assert.rejects(token.current(),/PROC_IDENTITY_CHANGED/);
 }
 f.contents.set(dir+'/stat',procStat(row,61));
 f.contents.set('/proc/sys/kernel/random/boot_id','b'+bootId.slice(1));
 await assert.rejects(token.current(),/LINUX_NAMESPACE_CHANGED/);
 f.contents.set('/proc/sys/kernel/random/boot_id',bootId);
 f.dirs.set('/proc/self/ns/pid',{dev:9n,ino:1002n});
 await assert.rejects(token.current(),/LINUX_NAMESPACE_CHANGED/);
 assert.equal(retainedProcStatMatches(procStat(row,61).replace(/^62 /,'64 '),62,row.startTicks,61),false);
});

test('rendered controller predicate uses visible columns and compares the exact multiset both ways',async()=>{
 const f=fixture(),{backends}=await f.load(),sql=retainedBackendSetPredicate(backends);
 assert.match(sql,/VALUES \(62::integer,NULL::oid,NULL::oid\),\(63::integer,NULL::oid,10::oid\)/);
 assert.match(sql,/observed AS MATERIALIZED \(SELECT a\.pid,a\.datid,a\.usesysid FROM pg_catalog\.pg_stat_activity a\s+WHERE a\.pid IS DISTINCT FROM pg_catalog\.pg_backend_pid\(\)\)/);
 assert.match(sql,/SELECT \* FROM observed EXCEPT ALL SELECT \* FROM expected/);
 assert.match(sql,/SELECT \* FROM expected EXCEPT ALL SELECT \* FROM observed/);
 assert.doesNotMatch(sql,/backend_type|backendType/);
 assert.match(retainedBackendSetPredicate([]),/SELECT NULL::integer,NULL::oid,NULL::oid WHERE false/);
 assert.throws(()=>retainedBackendSetPredicate([backends[0],backends[0]]),/EXACT_SQL_SET_REQUIRED/);
 assert.throws(()=>retainedBackendSetPredicate([{...backends[0],pid:'62 OR true'}]),/EXACT_SQL_SET_REQUIRED/);
});

test('only the retained controller render consumes the activity set and clears the snapshot (window model)',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {rewriteFresh35ModelModule}=await import('./fixtures/fresh35-bootstrap-network-model.mjs');
 const targetPath='../../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
 const now=Date.parse('2026-11-07T03:14:00Z'),f=fixture(),{backends}=await f.load();
 const currentPostmasterStart='2026-11-07 03:15:00+00';
 const end=new Date(now+60000).toISOString();
 const window={value:{startsAt:now,expiresAt:now+60000,controllerLoginValidUntil:end,adminLoginValidUntil:end},retainedBackends:backends,currentPostmasterStart};
 const windowModel='data:text/javascript;base64,'+Buffer.from(
  'export function installedRealWindowData(token){if(token!==1)throw Error("WRONG_WINDOW");return '+JSON.stringify(window)+';}'
 ).toString('base64');
 const url=await rewriteFresh35ModelModule({fs:{readFile}},targetPath,[['./fresh35-installed-real-window-v1.mjs',windowModel]]);
 const {bindFresh35CombinedTarget,fresh35CombinedTargetGuard,fresh35CombinedRuntimeTargetGuard,fresh35CombinedObserverCheck}=await import(url);
 const target=bindFresh35CombinedTarget({
  purpose:'PRODUCTION_NEW_EMPTY_EXACT35',
  proposal:{database:'test_erp',owner:'test_owner',controller:'test_controller',runtime:'test_runtime',admin:'test_admin',
   host:'127.0.0.1',port:57639,workspaceDirectory:'/root/test-erp'},
  physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011',
   postmasterStart:'2026-11-07 03:14:00+00'},startsAt:now-500,expiresAt:now+1199500,
  ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.3',serverPort:5432,
   runtimeLoginValidUntil:null,referenceDirectory:'/root/references'}
 },now);
 const install=fresh35CombinedTargetGuard(target,{requireEmpty:true});
 assert.match(install,/\(pg_catalog\.fresh35_exclusive_backends\(\)\)/);
 assert.doesNotMatch(install,/observed AS MATERIALIZED/);
 const historical=fresh35CombinedRuntimeTargetGuard(target),live=fresh35CombinedRuntimeTargetGuard(target,1);
 assert.match(historical,/\(pg_catalog\.fresh35_exclusive_backends\(\)\)/);
 const observer=fresh35CombinedObserverCheck(target),clear='PERFORM pg_catalog.pg_stat_clear_snapshot();';
 assert(!historical.replace(observer,'').includes(clear));
 assert(live.includes(observer));
 const predicate=retainedBackendSetPredicate(backends),liveChecks=live.replace(observer,'');
 assert(liveChecks.indexOf(clear)>=0&&liveChecks.indexOf(clear)<liveChecks.indexOf(predicate));
 assert(live.includes(predicate));
 assert(live.includes("TIMESTAMP '2026-11-07 03:15:00'"));
 assert.throws(()=>fresh35CombinedRuntimeTargetGuard(target,2),/WRONG_WINDOW/);
});

test('retained BOOT07 provenance accepts only the exact PREPARE05 protected stop digest',()=>{
 const recordSha='a7d12f1f21f730c0e0c19dd6136c501c74d43e0e866e62d2f51aa908ea4f970f';
 const oldPhysical={systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011',
  postmasterStart:'2026-11-07 00:00:00+00'};
 const record={target:{physical:oldPhysical,proposal:{workspaceDirectory:'/synthetic/workspace'}},
  binding:{targetSha256:'1'.repeat(64),sourceSetSha256:'2'.repeat(64)}};
 const dataDirectoryIdentity={device:10,inode:20,uid:61035,gid:61035,mode:0o700};
 const receipt={
  format:'FRESH35_RETAINED_RESTART_OBSERVATION_V1',state:'SAME_DATA_RESTART_OBSERVED_NOT_BUSINESS_VERIFIED',
  installationRecordSha256:recordSha,...record.binding,oldPhysical,
  newPhysical:{...oldPhysical,postmasterStart:'2026-11-07 00:01:00+00'},
  dataDirectory:'/synthetic/workspace/data',dataDirectoryBefore:dataDirectoryIdentity,dataDirectoryAfter:{...dataDirectoryIdentity},
  previousStopReceiptSha256:'1afe2929073cff8745a91f568da6e3b281d4f919c2cad1fa0a4051eee130203a',
  restartAuthorizationSha256:'3'.repeat(64),authorizationReference:'synthetic model only',
  checkedAt:Date.parse('2026-11-07T00:01:01Z'),serviceLeaseExpiresAt:Date.parse('2026-11-07T00:02:00Z')
 };
 const now=Date.parse('2026-11-07T00:01:02Z');
 assert.equal(validateRetainedRestartReceipt(receipt,record,recordSha,now),receipt.newPhysical.postmasterStart);
 for(const digest of [
  '31b7c27366daef28aceaa59c8bbe563279d8b79a1f13cc24f30e409300f6e6c8',
  '1afa16a877625bdb1099fa7602c7c791dfb9702f1ba8fda1c2f1eb9f1992ba76',
  'ec32a189fc8028b43507ede34b5dac7359f741f14558b17cc985878dbee1aeed',
  '0'.repeat(64)
 ]){
  assert.throws(()=>validateRetainedRestartReceipt({...receipt,previousStopReceiptSha256:digest},record,recordSha,now),
   /FRESH35_REAL_WINDOW_EXACT_RESTART_PROVENANCE_REQUIRED/);
 }
});
