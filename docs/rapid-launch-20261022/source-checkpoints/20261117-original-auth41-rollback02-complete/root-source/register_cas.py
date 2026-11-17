"""Unexecuted one-key CAS successor using the existing packet/lock/publish seam."""
from pathlib import Path
import base64,fcntl,hashlib,json,os,re,socket,stat,sys,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=(66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015)
JOBS={'rollback': 't45-r3-ordinary41-original-auth-rollback-20261117-02'}
KEYS=tuple(JOBS.values())
EXPECTED_RULES={'rollback': {'jobId': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': 'ae787f26a0b4f4129e3bf776c10ad9314f38da4920c71893caefa4621ff7cea3', 'ordinary05_roles_job.py': 'e5e594ef0a2937ec0e9734163be5ed89620aad43db73a65c71d3c82352ec8ddb', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'timeoutSeconds': 300, 'deadlineField': 'expiresAt'}}
ENTRY=B/'r3-original-auth41-rollback02-registration-source-20261117-01/register_cas.py'
AUDIT=B/'r3-original-auth41-rollback02-registration-cas-20261117-01'
NEW_MODULE=P/'r3_original_auth41_rollback02.py'
NEW_POLICY=H/'original-auth41-rollback-only-20261117-02.json'
PENDING=P/'.original-auth41-rollback02-dispatcher.pending'
OLD='ade6214cc9ff142bfb0bab75fe77b0ce0a006ee5049a2ca1aa7a1f0c95b8102a'
PRESERVE={str(P/'admin_exec.py'):OLD,str(P/'r3_normal39_continuation.py'):'b8ec4823753f791332631a1f907a79c4f9d752e2e74108d7b572510b7f610785',str(H/'direct39-batched-real.json'):'104048251747ed638ffb6464d9c12777855d7355c30261b53b75407f8dfc4173',str(P/'r3_root07_source_admission.py'):'76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080',str(H/'root07-source-only-20261117-01.json'):'b87fa978f93da13582569027b8453cd3aedaaf3bd700aa26fdb8a500f6050189'}
PRESERVE.update({str(P/'r3_core0_durable_readonly.py'):'0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f',str(H/'core0-durable-readonly-20261117-01.json'):'b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/r3-outer-terminal.json'):'8e8af93929b3a17f3b81f7e7e394fa03d54ca4d13a82c105646b5b6ba361af5b',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/bundle/durable_readonly_job.py'):'b65d7c50c8aedc11faa736cdc5fc72183ff83abd5df8e6660ff009cb3b0f74a0'})
PRESERVE.update({str(P/'r3_core0_durable_readonly_02.py'):'f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257',str(H/'core0-durable-readonly-20261117-02.json'):'4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5',str(P/'r3_direct38_aux_prepare.py'):'3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d',str(H/'direct38-batched-real.json'):'51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e'})
CUSTODY=[Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01')/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json')]
PRESERVE.update({str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/r3-outer-terminal.json'):'400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7',str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/results/maintenance-auth-result.json'):'08f94d2ddcc78e733cac57313d04b0573a8003d81fe76a1ad482c6d716ecbeca',str(P/'r3_root08_source_admission.py'):'3ddf6b72a9054babbc8121388241dcd6c005bb4b7fa8d5f3e67ba14ecd34ae64',str(H/'root08-source-only-20261117-01.json'):'a973b27718e8bc4bebbf168528b17097dccbf16cec09b4a3bd3c5b1e9ae58652',str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/r3-outer-terminal.json'):'e8849c90c8836a9d28e016b2216c3e5a725fd9998b39dc1c940a8f499d6f70b3',str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/results/batched-source-materialization.json'):'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c',str(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01/source-materialization.json')):'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c',str(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-39/retained-ack.json')):'d035fa81890f8cbc0b7ded918c5ceac7f28259c2c126e3c651f8ff364c9bdb8f'})
PRESERVE.update({str(P/'r3_normal40_continuation.py'):'96dbb198f0424298e90096a704c998b8f2e2629f8afae387f07b230b978052f0',str(H/'direct40-batched-real.json'):'7ce698a4dc6e5ba41828192bbeee37febcf604ebf178c7ec190a1bfb33abab03',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/r3-outer-terminal.json'):'83d71ed2e1ae38a56168e290b4a9fc26bef1d8f609559cd158bf377a14b8f0d3',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/results/normal-service-result.json'):'5c6abca56245e16b9a889b2740b9be56e6497f2309686c5a57230b9bfbc93c3f',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/results/normal-service-incomplete.json'):'8d00467d9b6d23acdaa86ba359840ed3406998fdc8a21794573d1b0eb97eac53',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/r3-outer-terminal.json'):'95f3f3fa5eaf68c0b4ab12a0bc3225fc1e74f535665dc87367123362e3f561f2',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/results/maintenance-auth-result.json'):'9502e078f1a550522371db45800c0d1c64fa1496b6bfb72d77521d3f614a0bc9',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/results/maintenance-auth-cleanup.json'):'5afd8b63ab6cb339664e864a714678e7974fd2d6791224db948c57d34fb3f050'})
CUSTODY.extend(Path(path)for path in ['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/applied.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/restore-attempt.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/restored.json'])
PRESERVE.update({str(P/'r3_normal41_continuation.py'):'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce',str(H/'direct41-batched-real.json'):'5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9'})
PRESERVE.update({str(P/'r3_original_auth41_rollback.py'):'b7af59ad9fc3517324aaf6b407e21d7d90708e3c226846714860c8ef194afacc',str(H/'original-auth41-rollback-only-20261117-01.json'):'c4379f1716fd98fc50bf774f7e1e3e698a584b3207585aadfc33d5b2ec627de5'})
PRESERVE.update({str(B/'jobs/t45-r3-ordinary41-original-auth-rollback-20261117-01/r3-outer-terminal.json'):'16ae761461af0353d77dbc98aa3610287d01594a17ab89d50f00fd0861816566'})
PRESERVE.update({str(B/'jobs/t45-r3-ordinary41-original-auth-rollback-20261117-01/results/maintenance-auth-result.json'):'07978734fcce13e68db82f3913168af14580bc1d89849cfdf8292e34ee50c422'})
RECOVERY_SERVICE={'containerId': 'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c', 'containerStartedAt': '2026-11-17T13:42:11.910047227Z', 'postmasterStart': '2026-11-17 13:42:13.196867+00', 'proofSha256': 'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa', 'serviceKey': 't45-first-r3-native-service-start-20261117-41'}
PRESERVE.update({'/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_normal41_continuation.py': 'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct41-batched-real.json': '5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261116-02/r3-outer-terminal.json': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-real-execute-20261115-01/r3-outer-terminal.json': '00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/r3-outer-terminal.json': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-05/r3-outer-terminal.json': '2f7a11142ced7b8056c52eb5af5ba5f2dcfad78d11918fe88f4cc4350d8795d1', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary41-preserve-stop-20261117-01/r3-outer-terminal.json': 'd7e54f8934700ba6feb74be64e2927f5e2de7c6367b664d4a4847a5ec79133bb', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-settlement24-three-routine-upgrade41-20261117-01/r3-outer-terminal.json': 'f797d647162d0b256cabb3f7c5be8518daa291146338fb780613124235b47575', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261117-41/r3-outer-terminal.json': 'bff45b1ff8381697f3fa914c04a7ce4ac88a4a8aa590dd8e846bca1846de68f1', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261117-41/results/normal-service-result.json': '9132db0e45e635fd26f7423a62cd815605bb2ef0076c921127e8c587eaaeeee5', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary41-preserve-stop-20261117-01/results/normal05-preserve-stop-result.json': '35e73f8a425127559e6e65df96978fd12f316222b1e85ebeca77da2ea2d5dd4d'})
CUSTODY.extend(Path(path)for path in ['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/applied.json'])
sha=lambda raw:hashlib.sha256(raw).hexdigest()
now=lambda:time.time_ns()//1000000
def need(ok,code):
 if not ok:raise ValueError(code)
def identity(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(path):
 need(path.resolve()==path,'CANONICAL_ROOT_FILE_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=131072,'PROTECTED_BOUNDED_ROOT_FILE_REQUIRED')
  raw=f.read(131073);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'ROOT_INPUT_CHANGED')
 return raw,identity(s)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,raw,mode=0o600):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
 sync(path.parent)
def basis():
 out={}
 for path,pin in PRESERVE.items():
  raw,ident=read(Path(path));need(sha(raw)==pin,'RECORDED_CURRENT_ROOT_BASE_DIFFERS');out[path]=list(ident)
 for path in CUSTODY:
  s=path.lstat();need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,'ORIGINAL_SNAPSHOT_STAT_ONLY_REQUIRED');out[str(path)]=list(identity(s))
 need(identity(LOCK.lstat())==LOCK_ID,'ORIGINAL_LOCK_DIFFERS');out['executionLock']=list(LOCK_ID)
 return out
def snapshot(old,new_dispatcher=None):
 need(set(old)==set(PRESERVE)|{str(path)for path in CUSTODY}|{'executionLock'},'EXACT_ROOT_BASIS_SET_REQUIRED')
 for path,pin in PRESERVE.items():
  raw,ident=read(Path(path));changed=path==str(P/'admin_exec.py')and new_dispatcher is not None
  need(sha(raw)==(new_dispatcher if changed else pin)and(changed or list(ident)==old[path]),'ORIGINAL_ROOT_CHANGED')
 for path in CUSTODY:need(list(identity(path.lstat()))==old[str(path)],'ORIGINAL_SNAPSHOT_STAT_CHANGED')
 need(identity(LOCK.lstat())==LOCK_ID==tuple(old['executionLock']),'ORIGINAL_LOCK_CHANGED')
def diagnostic_closed():
 import subprocess
 key='t45-r3-core0-durable-readonly-20261117-02';job=B/'jobs'/key
 def one(leaf):
  raw,_=read(job/leaf);return raw,json.loads(raw)
 terminal_raw,terminal=one('r3-outer-terminal.json')
 result_raw,result=one('results/durable-readonly-result.json')
 cleanup_raw,cleanup=one('results/durable-readonly-cleanup.json')
 need(sha(terminal_raw)=='68ef74f754d803b13788fe420517900570cd4f5c714e264a16b204182d7f65a6'
  and sha(result_raw)=='67e2ba34665b3f86123bdc6f49cdec697defb3a51091389cf95d60b36a481fd4'
  and sha(cleanup_raw)=='efa0d88a847a8bf83f1beb2decb5dd3c90918d28155616cef1db338426b3e45a','ACTUAL_DIAGNOSTIC02_RECEIPTS_CHANGED')
 need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted'))==(key,'COMPLETED',0,True),'DIAGNOSTIC_NOT_COMPLETED_NO_ROOT08')
 need(result.get('status')=='DURABLE_READONLY_RESULT_AND_OWN_CONTAINER_CLEANUP_CONFIRMED'
  and result.get('requestKey')==key and result.get('businessDML')is False
  and result.get('automaticReplay')is False and result.get('cleanup')==cleanup
  and all(cleanup.get(k)is True for k in ('ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','dataPreserved')),
  'DIAGNOSTIC_CLEANUP_UNCONFIRMED_NO_ROOT08')
 inside=result['snapshot']['cleanup']
 need(all(inside.get(k)is True for k in ('childReaped','descendantsAbsent','cleanClusterAfterRead')),'DIAGNOSTIC_SINGLE_USER_CLEANUP_UNCONFIRMED')
 cid=cleanup.get('actualContainerId');need(cid=='5a815d05577502f9d1c18906e19f4cd42e4659d9fbb5264946407ac38f7fd9f7','ACTUAL_DIAGNOSTIC_CONTAINER_REQUIRED')
 q=subprocess.run(['/usr/bin/docker','inspect','--format','{{json .State}}',cid],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=16384,'ACTUAL_DIAGNOSTIC_CONTAINER_STATE_UNAVAILABLE')
 state=json.loads(q.stdout);need(state['Running']is False and state['Pid']==0,'ACTUAL_DIAGNOSTIC_CONTAINER_NOT_STOPPED')
 custody={}
 root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state')
 for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'):
  path=root/'native-services/ordinary39-auth-20261116-01'/name;s=path.lstat()
  need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,'ORIGINAL39_SNAPSHOT_STAT_ONLY_REQUIRED')
  custody[str(path)]=list(identity(s))
 return {'state':'ACTUAL_DIAGNOSTIC_COMPLETED_CLEANED_PG_STOPPED_SOURCE_ONLY_BASIS',
  'requestKey':key,'terminalSha256':sha(terminal_raw),'resultSha256':sha(result_raw),'cleanupSha256':sha(cleanup_raw),
  'completed':True,'cleanupConfirmed':True,'actualContainerStopped':True,'actualContainerId':cid,'pgdataPidAbsent':True,
  'custodyStat9':custody,'authenticationSnapshotBodiesRead':False,'SQLUpgradePerformed':False,
  'businessDurableState':'NOT_CLASSIFIED_BY_SOURCE_REGISTRATION','PGConnections':0,'mutations':0}

def closed41():
 from types import ModuleType
 raw,_=read(P/'admin_exec.py');w=ModuleType('actual_root120');w.__file__=str(P/'admin_exec.py');exec(compile(raw,w.__file__,'exec'),w.__dict__)
 cfg=json.loads(read(P/'grant.json')[0]);core,prior=w.r3_continuity(cfg);prior=w.normal41_continuation(core,prior,cfg)
 raw,_=read(ENTRY.with_name('r3_original_auth41_rollback02.py'));m=ModuleType('recovery_live');m.__file__=str(ENTRY.with_name('r3_original_auth41_rollback02.py'));exec(compile(raw,m.__file__,'exec'),m.__dict__)
 return m.closed41(core,prior,need)

def quiet(expected_diagnostic=None):
 import subprocess
 closure=closed41()
 for grant in (B,C,B.with_name('grant-5cc58239751e4e2a'),C.with_name('grant-5cc58239751e4e2a')):
  for key in KEYS:need(not any(os.path.lexists(grant/rel)for rel in('jobs/'+key,'requests/'+key+'.json','requests/'+key+'.tmp','results/'+key+'.json')),'RECOVERY_KEY_ALREADY_PRESENT_NO_REPLAY')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-*'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and not q.stdout.strip(),'NO_OTHER_ACTIVE_OPERATION_REQUIRED')
 return dict(closure,newRollbackKeyAbsent=True,PGConnections=0,mutations=0)

def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_ORIGINAL_AUTH41_ROLLBACK02_ONLY_V1'and p['grantId']=='b16447fbc81f4d64'and set(p['jobs'])=={'rollback'},'EXACT_SINGLE_RECOVERY_POLICY_REQUIRED')
 r=dict(p['jobs']['rollback']);pins=dict(r['bundlePins']);inner=pins.pop('roles-authorization.json',None);r['bundlePins']=pins
 need(r==EXPECTED_RULES['rollback']and type(inner)is str and re.fullmatch('[a-f0-9]{64}',inner),'EXACT_ROLLBACK_INNER_PIN_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=p['startsAt']+900000,'ORIGINAL_C41_AND_RESTORE_DEADLINES_REQUIRED')


def consumer(dispatcher,cfg,module_raw,policy_raw):
 from types import ModuleType
 wrapper=ModuleType('fixed_durable_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
 core,prior=wrapper.r3_continuity(cfg)
 module=ModuleType('fixed_durable_admission');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
 original=core.read
 core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
 try:module.Rollback(core,wrapper.normal41_continuation(core,prior,cfg),cfg,sha(policy_raw))
 finally:core.read=original
def register(packet,expected):
 need(os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'and Path(__file__)==ENTRY,'EXACT_ORIGINAL_ROOT_CAS_ENTRY_REQUIRED')
 need(set(packet)=={'authorization','files'},'EXACT_ORIGINAL_PACKET_REQUIRED')
 authority=base64.b64decode(packet['authorization'],validate=True);need(sha(authority)==expected,'EXACT_EXTERNAL_REGISTRATION_AUTHORITY_REQUIRED');a=json.loads(authority)
 need(set(a)=={'format','jobs','sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','independentReviewSha256','authorizationReference'}and a['format']=='T45_ORIGINAL_AUTH41_ROLLBACK02_REGISTRATION_CAS_V1'and a['jobs']==JOBS and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_ONE_KEY_REGISTRATION_SCOPE_REQUIRED')
 need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+600000,'FINITE_REGISTRATION_WINDOW_REQUIRED')
 files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
 need(set(files)==set(a['sourcePins'])=={'module','policy','dispatcherTemplate'}and all(0<len(v)<=131072 and sha(v)==a['sourcePins'][k]for k,v in files.items()),'EXACT_APPROVED_SOURCE_PACKET_REQUIRED')
 policy=json.loads(files['policy']);validate_policy_delta(policy)
 cfg=json.loads(read(P/'grant.json')[0]);need(now()+30000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FINITE_GRANT_BUDGET_REQUIRED')
 needle=b'ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256 = None';need(files['dispatcherTemplate'].count(needle)==1,'EXACT_UNREGISTERED_TEMPLATE_REQUIRED')
 new=files['dispatcherTemplate'].replace(needle,('ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
 compile(new,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
 need(not any(os.path.lexists(x)for x in(AUDIT,NEW_MODULE,NEW_POLICY,PENDING)),'REGISTRATION_ALREADY_PRESENT_OR_UNKNOWN')
 for folder in(B,P,H,LOCK.parent):
  for path in[*reversed(folder.parents),folder]:
   s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022,'PROTECTED_REGISTRATION_PARENT_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  need(identity(os.fstat(lock.fileno()))==LOCK_ID,'EXACT_ORIGINAL_LOCK_REQUIRED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  snapshot(a['oldIdentities']);quiet()
  consumer(new,cfg,files['module'],files['policy'])
  AUDIT.mkdir(mode=0o700);sync(AUDIT.parent);put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',read(P/'admin_exec.py')[0])
  out={'status':'REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY','published':[],'PGStarted':False,'maintenanceSubmitted':False,'automaticReplay':False}
  try:
   put(NEW_MODULE,files['module'],0o644);out['published'].append('module');snapshot(a['oldIdentities']);quiet()
   put(NEW_POLICY,files['policy']);out['published'].append('policy');snapshot(a['oldIdentities']);quiet()
   put(PENDING,new,0o755);need(now()+30000<a['expiresAt'],'REGISTRATION_EXPIRED_BEFORE_CAS')
   put(AUDIT/'publish-intent.json',(json.dumps({'before':OLD,'after':sha(new)},sort_keys=True)+'\n').encode())
   os.replace(PENDING,P/'admin_exec.py');sync(P);out['published'].append('dispatcher');snapshot(a['oldIdentities'],sha(new));quiet()
   need(sha(read(NEW_MODULE)[0])==sha(files['module'])and sha(read(NEW_POLICY)[0])==sha(files['policy']),'REGISTRATION_READBACK_DIFFERS')
   consumer(read(P/'admin_exec.py')[0],cfg,read(NEW_MODULE)[0],read(NEW_POLICY)[0])
   out.update(status='EXACT_ORIGINAL_AUTH41_ROLLBACK02_ROOT_REGISTERED_NO_ROLLBACK_SUBMITTED',dispatcherSha256=sha(new),moduleSha256=sha(files['module']),policySha256=sha(files['policy']),old121AndThreeGuardsPreserved=True)
  except BaseException as error:out['errorType']=type(error).__name__
  put(AUDIT/'result.json',(json.dumps(out,sort_keys=True)+'\n').encode());return out
if __name__=='__main__':
 need(len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'ONE_REAL_REGISTRATION_AUTHORITY_SHA_REQUIRED')
 result=register(json.load(sys.stdin),sys.argv[1]);print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_ORIGINAL_AUTH41_ROLLBACK02_ROOT_REGISTERED_NO_ROLLBACK_SUBMITTED'else 2)
