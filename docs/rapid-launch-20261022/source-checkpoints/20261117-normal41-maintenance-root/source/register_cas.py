"""Unexecuted one-key CAS successor using the existing packet/lock/publish seam."""
from pathlib import Path
import base64,fcntl,hashlib,json,os,re,socket,stat,sys,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=(66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015)
JOBS={'apply': 't45-r3-ordinary41-auth-apply-20261117-01', 'start': 't45-first-r3-native-service-start-20261117-41', 'upgrade': 't45-r3-settlement24-three-routine-upgrade41-20261117-01', 'stop': 't45-r3-ordinary41-preserve-stop-20261117-01', 'restore': 't45-r3-ordinary41-auth-restore-20261117-01'}
KEYS=tuple(JOBS.values())
EXPECTED_RULES={'apply': {'jobId': 't45-r3-ordinary41-auth-apply-20261117-01', 'deadlineField': 'expiresAt', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': 'ee8ed3b8b09980945ccd4fce122a278bb0699a355134af629f5f37267b1edc03', 'ordinary05_roles_job.py': '1e76b032015ef9547df8660cc4b2476d84a79e13575c5303a34e26959d9e1333', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'timeoutSeconds': 300}, 'start': {'jobId': 't45-first-r3-native-service-start-20261117-41', 'deadlineField': 'expiresAt', 'bundlePins': {'batched161-run.mjs': '0f45396df7aec8bac9651591c685b30f7d318066feffb0f7f4e98df592855af6', 'catalog-successor-run.mjs': '7c993880d5ff96afae689a0d255067ff79583561105fc3bc54dcc23b180a129f', 'final33-run.mjs': '1be01cec400b242cbcf7ff45451e5e60f0bbc87a1d0ea3f7bb2e527d56ee8851', 'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service05_after08.py': 'c7368468dca6327424d7415254de6fa17b1013ad23712b592393670b73667db2', 'normal_service05_after08_proof.py': '225a4ca13d03e9b41e55aa06f90e239cd98ef6c2f357a6be8dc9bd87101c67ad', 'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae', 'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184', 'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e', 'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'production-plan.json': '7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d', 'r3_05_cli.py': 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0', 'r3_05_readonly.py': '18a77c85ebc45c93dd12a818e9459d346232b54d06c77ac3c41b87afd07a00f4', 'r3_05_runtime.py': '58341573251f393dfd13843fcca18502927dddfcf2c53bfc110b0a6ebcaa6252', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'root07_material.py': '55ac6600ac982367b9d99678193b3a80dfe8e05b76828022c0c1aeb24a8864e2', 'source-catalog-lineage.json': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'source_lineage.py': 'c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736', 'start_owned_describe.py': 'ffe0b7b736c73cb367d112ebe80d1ce14e03b71c41a5843ec27d26124642dd3d', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'script': 'normal_service05_after08.py', 'authorityLeaf': 'service-start-authorization.json', 'timeoutSeconds': 300}, 'upgrade': {'jobId': 't45-r3-settlement24-three-routine-upgrade41-20261117-01', 'deadlineField': 'expiresAt', 'bundlePins': {'batched161_command_update_host.py': '66e67a6c85d11c277ae0fc9ef8999cc64fa704d34181197116e2f0f943da6a49', 'catalog-pg-driver.mjs': 'cdfb4fdeb6919364c5795c1e2ccb6f58650337b0b7bc59aa71d102b3e9a1a87f', 'catalog-successor-run.mjs': '7c993880d5ff96afae689a0d255067ff79583561105fc3bc54dcc23b180a129f', 'catalog_transport.py': '5b352e19ef115a8ffdc30acd2ba98d3b666bbbd5a749b1955ad51dfcb8422db7', 'diagnostic02-readback.json': 'b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'historical-catalog35.json': '4691772528f237973a6a2b0d636edde1ffcf7916c30db0f55bc0e714dd11547e', 'historical-writer39-failed.json': 'dbd5e1c4f8baa4d3489a9eda8fd7c29e5a834097aad6ba808e96aa07973e9aaa', 'main-recovery-decision.json': 'b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78', 'normal05_retained_stop.py': '0c27df9e48f20d78616938619d763804dbb26939e988e02b5755cea683c8a244'}, 'script': 'batched161_command_update_host.py', 'authorityLeaf': 'catalog-update-authorization.json', 'timeoutSeconds': 780}, 'stop': {'jobId': 't45-r3-ordinary41-preserve-stop-20261117-01', 'deadlineField': 'expiresAt', 'bundlePins': {'normal05_preserve_stop.py': 'f24daf308e252a8ac9e5840ef51fac9094bbc7ebd7bb1f9d6680fa940380d015', 'normal05_retained_stop.py': 'e25a6b467964a0403fd6deb593afc19c5040be841efbcfc1cdddab341a985783'}, 'script': 'normal05_preserve_stop.py', 'authorityLeaf': 'normal05-preserve-stop-input.json', 'timeoutSeconds': 120}, 'restore': {'jobId': 't45-r3-ordinary41-auth-restore-20261117-01', 'deadlineField': 'expiresAt', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': 'ee8ed3b8b09980945ccd4fce122a278bb0699a355134af629f5f37267b1edc03', 'ordinary05_roles_job.py': '1e76b032015ef9547df8660cc4b2476d84a79e13575c5303a34e26959d9e1333', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'timeoutSeconds': 300}}
ENTRY=B/'r3-normal41-registration-source-20261117-01/register_cas.py'
AUDIT=B/'r3-normal41-registration-cas-20261117-01'
NEW_MODULE=P/'r3_normal41_continuation.py'
NEW_POLICY=H/'direct41-batched-real.json'
PENDING=P/'.normal41-dispatcher.pending'
OLD='0864546416726e3290f571f86344bf0f7288c54e80e3fce86fd2426d7f38edff'
PRESERVE={str(P/'admin_exec.py'):OLD,str(P/'r3_normal39_continuation.py'):'b8ec4823753f791332631a1f907a79c4f9d752e2e74108d7b572510b7f610785',str(H/'direct39-batched-real.json'):'104048251747ed638ffb6464d9c12777855d7355c30261b53b75407f8dfc4173',str(P/'r3_root07_source_admission.py'):'76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080',str(H/'root07-source-only-20261117-01.json'):'b87fa978f93da13582569027b8453cd3aedaaf3bd700aa26fdb8a500f6050189'}
PRESERVE.update({str(P/'r3_core0_durable_readonly.py'):'0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f',str(H/'core0-durable-readonly-20261117-01.json'):'b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/r3-outer-terminal.json'):'8e8af93929b3a17f3b81f7e7e394fa03d54ca4d13a82c105646b5b6ba361af5b',str(B/'jobs/t45-r3-core0-durable-readonly-20261117-01/bundle/durable_readonly_job.py'):'b65d7c50c8aedc11faa736cdc5fc72183ff83abd5df8e6660ff009cb3b0f74a0'})
PRESERVE.update({str(P/'r3_core0_durable_readonly_02.py'):'f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257',str(H/'core0-durable-readonly-20261117-02.json'):'4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5',str(P/'r3_direct38_aux_prepare.py'):'3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d',str(H/'direct38-batched-real.json'):'51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e'})
CUSTODY=[Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01')/name for name in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json')]
PRESERVE.update({str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/r3-outer-terminal.json'):'400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7',str(B/'jobs/t45-r3-ordinary39-auth-restore-20261116-01/results/maintenance-auth-result.json'):'08f94d2ddcc78e733cac57313d04b0573a8003d81fe76a1ad482c6d716ecbeca',str(P/'r3_root08_source_admission.py'):'3ddf6b72a9054babbc8121388241dcd6c005bb4b7fa8d5f3e67ba14ecd34ae64',str(H/'root08-source-only-20261117-01.json'):'a973b27718e8bc4bebbf168528b17097dccbf16cec09b4a3bd3c5b1e9ae58652',str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/r3-outer-terminal.json'):'e8849c90c8836a9d28e016b2216c3e5a725fd9998b39dc1c940a8f499d6f70b3',str(B/'jobs/t45-r3-batched-root08-source-delta-20261117-01/results/batched-source-materialization.json'):'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c',str(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01/source-materialization.json')):'5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c',str(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-39/retained-ack.json')):'d035fa81890f8cbc0b7ded918c5ceac7f28259c2c126e3c651f8ff364c9bdb8f'})
PRESERVE.update({str(P/'r3_normal40_continuation.py'):'96dbb198f0424298e90096a704c998b8f2e2629f8afae387f07b230b978052f0',str(H/'direct40-batched-real.json'):'7ce698a4dc6e5ba41828192bbeee37febcf604ebf178c7ec190a1bfb33abab03',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/r3-outer-terminal.json'):'83d71ed2e1ae38a56168e290b4a9fc26bef1d8f609559cd158bf377a14b8f0d3',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/results/normal-service-result.json'):'5c6abca56245e16b9a889b2740b9be56e6497f2309686c5a57230b9bfbc93c3f',str(B/'jobs/t45-first-r3-native-service-start-20261117-40/results/normal-service-incomplete.json'):'8d00467d9b6d23acdaa86ba359840ed3406998fdc8a21794573d1b0eb97eac53',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/r3-outer-terminal.json'):'95f3f3fa5eaf68c0b4ab12a0bc3225fc1e74f535665dc87367123362e3f561f2',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/results/maintenance-auth-result.json'):'9502e078f1a550522371db45800c0d1c64fa1496b6bfb72d77521d3f614a0bc9',str(B/'jobs/t45-r3-ordinary40-auth-restore-20261117-01/results/maintenance-auth-cleanup.json'):'5afd8b63ab6cb339664e864a714678e7974fd2d6791224db948c57d34fb3f050'})
CUSTODY.extend(Path(path)for path in ['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/applied.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/restore-attempt.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary40-auth-20261117-01/restored.json'])
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

def quiet(expected_diagnostic=None):
 import subprocess
 root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 data=root/'state/fresh35-first-production-20261110-r3/data';s=data.lstat()
 need(data.resolve()==data and stat.S_ISDIR(s.st_mode)and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'EXACT_ORIGINAL_STOPPED_DATA_REQUIRED')
 fs=os.statvfs(root);need(fs.f_bavail*fs.f_frsize>=28*1024**3,'RESERVE_28GIB_REQUIRED')
 need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_WINDOW_ACTIVE')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
 for worker_root,control_root in ((B.parent,C.parent),):
  for root in (worker_root,control_root):
   for grant in root.glob('grant-*'):
    for key in KEYS:need(not any(os.path.lexists(grant/rel)for rel in ('jobs/'+key,'requests/'+key+'.json','requests/'+key+'.tmp','results/'+key+'.json')),'NORMAL41_KEY_PRESENT_NO_REPLAY')
 closure=diagnostic_closed()
 if expected_diagnostic is not None:need({k:closure[k]for k in ('terminalSha256','resultSha256','cleanupSha256')}==expected_diagnostic,'ACTUAL_DIAGNOSTIC02_FRESH_CLOSURE_CHANGED')
 return closure
def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_NORMAL41_BATCHED_REAL_V1'and p['grantId']=='b16447fbc81f4d64','EXACT_NORMAL41_POLICY_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=p['startsAt']+5100000 and set(p['jobs'])==set(JOBS),'FIVE_PHASE_5100S_POLICY_REQUIRED')
 role_pins=[]
 for phase,rule in p['jobs'].items():
  item=dict(rule);pins=dict(item['bundlePins'])
  if phase in ('apply','restore'):role_pins.append(pins.pop('roles-authorization.json',None))
  item['bundlePins']=pins;need(item==EXPECTED_RULES[phase],'EXACT_NORMAL41_CONSUMER_RULE_REQUIRED')
 need(len(role_pins)==2 and role_pins[0]==role_pins[1]and type(role_pins[0])is str and re.fullmatch('[a-f0-9]{64}',role_pins[0]),'SAME_NEW_ROLE_PIN_REQUIRED')

def consumer(dispatcher,cfg,module_raw,policy_raw):
 from types import ModuleType
 wrapper=ModuleType('fixed_durable_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
 core,prior=wrapper.r3_continuity(cfg)
 module=ModuleType('fixed_durable_admission');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
 original=core.read
 core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
 try:module.Normal41Continuation(core,prior,cfg,sha(policy_raw))
 finally:core.read=original
def register(packet,expected):
 need(os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'and Path(__file__)==ENTRY,'EXACT_ORIGINAL_ROOT_CAS_ENTRY_REQUIRED')
 need(set(packet)=={'authorization','files'},'EXACT_ORIGINAL_PACKET_REQUIRED')
 authority=base64.b64decode(packet['authorization'],validate=True);need(sha(authority)==expected,'EXACT_EXTERNAL_REGISTRATION_AUTHORITY_REQUIRED');a=json.loads(authority)
 need(set(a)=={'format','jobs','sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','independentReviewSha256','authorizationReference'}and a['format']=='T45_NORMAL41_REGISTRATION_CAS_V1'and a['jobs']==JOBS and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_ONE_KEY_REGISTRATION_SCOPE_REQUIRED')
 need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+600000,'FINITE_REGISTRATION_WINDOW_REQUIRED')
 files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
 need(set(files)==set(a['sourcePins'])=={'module','policy','dispatcherTemplate'}and all(0<len(v)<=131072 and sha(v)==a['sourcePins'][k]for k,v in files.items()),'EXACT_APPROVED_SOURCE_PACKET_REQUIRED')
 policy=json.loads(files['policy']);validate_policy_delta(policy)
 cfg=json.loads(read(P/'grant.json')[0]);need(now()+600000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FINITE_GRANT_BUDGET_REQUIRED')
 needle=b'NORMAL41_POLICY_SHA256 = None';need(files['dispatcherTemplate'].count(needle)==1,'EXACT_UNREGISTERED_TEMPLATE_REQUIRED')
 new=files['dispatcherTemplate'].replace(needle,('NORMAL41_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
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
   out.update(status='EXACT_NORMAL41_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED',dispatcherSha256=sha(new),moduleSha256=sha(files['module']),policySha256=sha(files['policy']),old115AndThreeGuardsPreserved=True)
  except BaseException as error:out['errorType']=type(error).__name__
  put(AUDIT/'result.json',(json.dumps(out,sort_keys=True)+'\n').encode());return out
if __name__=='__main__':
 need(len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'ONE_REAL_REGISTRATION_AUTHORITY_SHA_REQUIRED')
 result=register(json.load(sys.stdin),sys.argv[1]);print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_NORMAL41_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED'else 2)
