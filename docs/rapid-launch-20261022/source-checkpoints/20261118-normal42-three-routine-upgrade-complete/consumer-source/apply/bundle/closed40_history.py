"""Historical successful39 + actual failed40/restored40; no successful40 invented."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat,subprocess
KEY='t45-first-r3-native-service-start-20261116-39'
SERVICE={'containerId': 'a17a885412cb8122e8b77a65d5058f1653c69a3cc20d1a11a3950e4fe6e4e1d5', 'containerStartedAt': '2026-11-17T05:39:38.918702945Z', 'postmasterStart': '2026-11-17 05:39:40.169724+00', 'proofSha256': '9aa960bc95192c2b72f61526df793a1bfccd3a9f047aa17f01cbe0632b73b6b3', 'serviceKey': 't45-first-r3-native-service-start-20261116-39'}
BINDINGS={'previousTerminalSha256': '78f5caaae6ec9f733f97808550748a6ef486e5c14835e377a76061726b37cac2', 'previousResultSha256': 'fc3c44ea0bab6e92cc8ebd98b8db612c4329c37cf0beb7a0fbc31e6dc4138e87', 'previousCurrentProofSha256': '9aa960bc95192c2b72f61526df793a1bfccd3a9f047aa17f01cbe0632b73b6b3', 'previousRetainedAckSha256': 'd035fa81890f8cbc0b7ded918c5ceac7f28259c2c126e3c651f8ff364c9bdb8f', 'previousCleanupSha256': '5619126a8236edf660da4d132ce0483086975e75ff3f5e94482db60f4c370660', 'previousStopRequestKey': 't45-r3-ordinary39-preserve-stop-20261116-01', 'previousStopTerminalSha256': '18b47182038fbb44f5541adf2bbce8baeda4c90acd05a1092f0481b393ebd575', 'previousStopResultSha256': 'ed4c169630e1fe352dd2a54bc7da7f1448922e3410ebe3cf628c6df7b46aa42e', 'restoreTerminalSha256': '400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7', 'restoreResultSha256': '80c510bb7f1fe0e13bfd8b462aa9cd5f6ca3d1791fbaa312a97d6a409e4ad365'}
HISTORY_SHA='bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
CLOSED_FAILED_START='t45-first-r3-native-service-start-20261117-40'
CLOSED_RESTORE='t45-r3-ordinary40-auth-restore-20261117-01'
CUSTODY40_METADATA={'applied.json': {'bytes': 493, 'device': 66304, 'exists': True, 'gid': 0, 'inode': 13667449, 'mode': 256, 'uid': 0}, 'finite-auth.json': {'bytes': 2549, 'device': 66304, 'exists': True, 'gid': 0, 'inode': 13667446, 'mode': 256, 'uid': 0}, 'original-auth.json': {'bytes': 2533, 'device': 66304, 'exists': True, 'gid': 0, 'inode': 13667443, 'mode': 256, 'uid': 0}, 'restore-attempt.json': {'bytes': 114, 'device': 66304, 'exists': True, 'gid': 0, 'inode': 13667476, 'mode': 256, 'uid': 0}, 'restored.json': {'bytes': 466, 'device': 66304, 'exists': True, 'gid': 0, 'inode': 13667478, 'mode': 256, 'uid': 0}}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def need(value,code):
 if not value:raise ValueError('CLOSED40_'+code)
def binding():return dict(BINDINGS)
def validate(ops,control,authority=None):
 path=Path(__file__).with_name('successful39_history.py');body=ops.read_file(path,65536,True);need(sha(body)==HISTORY_SHA,'SUCCESSFUL39_HISTORY_SOURCE_REQUIRED')
 hist=ModuleType('successful39_history');hist.__file__=str(path);exec(compile(body,str(path),'exec'),hist.__dict__)
 previous=hist.validate(ops,control,authority)
 def root(path,pin):
  raw=ops.read_file(path,65536,True);need(sha(raw)==pin,'FIXED_ACTUAL40_RECEIPT_REQUIRED');return raw
 def terminal(key,pin,status,exit_code):
  raw=root(B/key/'r3-outer-terminal.json',pin);need(raw==ops.read_file(control/'results'/(key+'.json'),65536,False,False),'ACTUAL40_TERMINAL_ROOT_PUBLIC_REQUIRED');t=json.loads(raw)
  need((t['jobId'],t['status'],t['exitCode'],t['phaseStarted'])==(key,status,exit_code,True),'ACTUAL40_TERMINAL_OUTCOME_REQUIRED')
 def pair(key,leaf,rpin,ppin):
  raw=root(B/key/'results'/leaf,rpin);public=ops.read_file(control/'jobs'/key/'results'/leaf,65536,False,False)
  need(sha(public)==ppin and json.loads(raw)==json.loads(public),'ACTUAL40_ROOT_PUBLIC_RESULT_REQUIRED');return json.loads(raw)
 terminal(CLOSED_FAILED_START,'83d71ed2e1ae38a56168e290b4a9fc26bef1d8f609559cd158bf377a14b8f0d3','FAILED',2)
 result=pair(CLOSED_FAILED_START,'normal-service-result.json','5c6abca56245e16b9a889b2740b9be56e6497f2309686c5a57230b9bfbc93c3f','397e1d0fa3752c79943ea7bd6a09f60d05e0ef45e56db216d9f5316a837c55d5')
 failure=pair(CLOSED_FAILED_START,'normal-service-incomplete.json','8d00467d9b6d23acdaa86ba359840ed3406998fdc8a21794573d1b0eb97eac53','b1611aa8d05a29b47180f1503a2cff58c07242cadd3569f40263075933b356e2')
 need(result['requestKey']==failure['requestKey']==CLOSED_FAILED_START and result['safeCode']=='FileExistsError'
  and failure['format']=='T45_R3_PRECONTAINER_FAILURE_V1' and failure['state']=='PRE_CONTAINER_FAILURE_RESOURCES_ABSENT'
  and failure['confirmed']is True and failure['cid']is None and failure['createAttempted']is False
  and failure['runtimeMaterialPreserved']is True and all(failure['observation'][k]is True for k in('ownedContainerAbsent','listenerAbsent','postmasterPidAbsent','lifecycleOutputsAbsent')),'ACTUAL40_PRECONTAINER_ONLY_REQUIRED')
 terminal(CLOSED_RESTORE,'95f3f3fa5eaf68c0b4ab12a0bc3225fc1e74f535665dc87367123362e3f561f2','COMPLETED',0)
 restored=pair(CLOSED_RESTORE,'maintenance-auth-result.json','9502e078f1a550522371db45800c0d1c64fa1496b6bfb72d77521d3f614a0bc9','81de4646c36dd79cab8931772084f50460d523f2280cd245503d595d81529e60')
 inner=restored['result'];cleanup=restored['cleanup']
 need(restored['phase']=='restore'and restored['requestKey']==CLOSED_RESTORE and inner['requestKey']==CLOSED_RESTORE
  and inner['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
  and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['databaseStillStopped']is True
  and all(inner[k]is False for k in('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
  and all(cleanup[k]is True for k in('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ACTUAL40_AUTH_RESTORE_REQUIRED')
 safe=R/'state/native-services/ordinary40-auth-20261117-01/restored.json';need(json.loads(root(safe,'27a91d7c7cc83c6200fe6fbad49f524c0aa79b0b0b062fa0a0d51878aa2940aa'))==inner,'ACTUAL40_SAFE_RESTORATION_RECEIPT_REQUIRED')
 # Original and finite verifier snapshots are stat-only, never read/digested.
 for leaf,expected in CUSTODY40_METADATA.items():
  path=safe.with_name(leaf);s=path.lstat();need(path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_nlink==1
   and {'device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size}=={k:expected[k]for k in('device','inode','uid','gid','mode','bytes')},'ACTUAL40_CUSTODY_METADATA_ONLY_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cleanup['cid']],capture_output=True,check=True,timeout=5)
 need(not q.stderr and len(q.stdout)<=4096 and json.loads(q.stdout)=={'id':cleanup['cid'],'name':'/'+CLOSED_RESTORE,'image':'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769','running':False,'pid':0,'operation':CLOSED_RESTORE},'ACTUAL40_RESTORE_CONTAINER_STOPPED_REQUIRED')
 # No current DATA stopped check here: successful41 may be live at later phases.
 return previous  # Original successful39 service/closure/bindings API retained.
