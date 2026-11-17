"""Actual42 successful start, preservation stop and exact original auth restoration."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat,subprocess

KEY='t45-first-r3-native-service-start-20261117-42'
ROLLBACK='t45-r3-ordinary42-auth-restore-20261117-01'
SERVICE={'serviceKey': 't45-first-r3-native-service-start-20261117-42', 'containerId': '90bfb5f1dd6f74f157c002d31f7e51d2003bc65cc6942cac28998e5a5e258f91', 'containerStartedAt': '2026-11-17T16:27:46.424906086Z', 'postmasterStart': '2026-11-17 16:27:47.780746+00', 'proofSha256': 'e789550dfaf241d8885af1ed4d433eaa68ab175b20fb3895059b1f9b51b6d35a'}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
CUSTODY=R/'state/native-services/ordinary42-auth-20261117-01'
BINDINGS={'previousTerminalSha256': '2f9287f0a468b9f6b1cc18ba3d3966d2529913b5b8d1baec2b569e0a1413f267', 'previousResultSha256': '606bd8180330e0e72e6a24461d46d23bc417510de2db556e646a67fc808a0677', 'previousCleanupSha256': '1b3f4495209cb228d2d271dedc87e8153efa5464d66d6e3b251cc4d710eff091', 'previousCurrentProofSha256': 'e789550dfaf241d8885af1ed4d433eaa68ab175b20fb3895059b1f9b51b6d35a', 'previousRetainedAckSha256': None, 'restoreTerminalSha256': '7f10ff02d069efb568f66218e9906d0ddce7cc12b630dfc5b3794750dbbfc4d6', 'restoreResultSha256': 'ca96543508c89e4a8cc0455dc40a8e5f2cd3e86a0ff076395c246d550a0fc7f8', 'restoreCleanupSha256': 'c6ddae25d7b998a51f6fc67bfcf58bd6e17cf8769134b5ddf2be17c63b8d1067', 'restoreSafeReceiptSha256': 'aeb681666f04086e7a797a070c33a2b22688867c54d988e8ae86c06fcee38c05'}
SNAPSHOTS={'applied.json': [66304, 13667553, 0, 0, 256, 1, 493, 1794932688213360359, 1794932688213360359], 'finite-auth.json': [66304, 13667550, 0, 0, 256, 1, 2549, 1794932687140371255, 1794932687140371255], 'original-auth.json': [66304, 13667547, 0, 0, 256, 1, 2533, 1794932686998372698, 1794932686998372698], 'restore-attempt.json': [66304, 13667615, 0, 0, 256, 1, 114, 1794933702452069802, 1794933702452069802], 'restored.json': [66304, 13667617, 0, 0, 256, 1, 466, 1794933703566064455, 1794933703566064455]}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def need(ok,code):
 if not ok:raise ValueError('CLOSED42_'+code)
def binding():return dict(BINDINGS)
def validate(ops,control,authority=None):
 # The original successful39/closed40 implementation is retained as history.
 path=Path(__file__).with_name('closed41_history.py');raw=ops.read_file(path,65536,True)
 need(sha(raw)=='80c318d92b7043e829bf8b08451db1dcc83c38ff7177e99ff8e23d3ab775dafc','EXACT_CLOSED40_SOURCE_REQUIRED')
 old=ModuleType('closed40_history');old.__file__=str(path);exec(compile(raw,str(path),'exec'),old.__dict__);old.validate(ops,control)
 if authority is not None:need(all(authority.get(k)==v for k,v in binding().items() if v is not None),'ACTUAL42_BINDINGS_REQUIRED')
 def root(path,pin):
  raw=ops.read_file(path,65536,True);need(sha(raw)==pin,'EXACT_ROOT_RECEIPT_REQUIRED');return raw
 def terminal(key,pin,status,code):
  raw=root(B/key/'r3-outer-terminal.json',pin);need(raw==ops.read_file(control/'results'/(key+'.json'),65536,False,False),'TERMINAL_PAIR_REQUIRED');v=json.loads(raw)
  need((v['jobId'],v['taskId'],v['grantId'],v['status'],v['exitCode'])==(key,'T45','b16447fbc81f4d64',status,code),'ACTUAL_TERMINAL_REQUIRED')
 def pair(key,leaf,pin):
  raw=root(B/key/'results'/leaf,pin);v=json.loads(raw);need(v==json.loads(ops.read_file(control/'jobs'/key/'results'/leaf,65536,False,False)),'RESULT_PAIR_REQUIRED');return v
 terminal(KEY,BINDINGS['previousTerminalSha256'],'COMPLETED',0)
 start=pair(KEY,'normal-service-result.json',BINDINGS['previousResultSha256'])
 need(start['requestKey']==KEY and start['cid']==SERVICE['containerId']and start['proofSha256']==SERVICE['proofSha256']and start['readOnlyReadiness']is True and start['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE','ACTUAL41_START_REQUIRED')
 proof=R/'authority/fresh35-current-production-service-v2-service-42.json';z=proof.lstat()
 need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'PUBLIC_PROOF_METADATA_REQUIRED')
 raw=ops.read_file(proof,65536,False);p=json.loads(raw);need(sha(raw)==SERVICE['proofSha256']and p['requestKey']==KEY and p['physical']['postmasterStart']==SERVICE['postmasterStart']and p['physical']['databaseOid']=='16393'and p['physical']['systemIdentifier']=='7706545564479176741','ACTUAL41_PROOF_REQUIRED')
 boot=R/'state/native-services'/KEY
 ackraw=ops.read_file(boot/'retained-ack.json',65536,True)
 if authority is not None:need(sha(ackraw)==authority['previousRetainedAckSha256'],'ACTUAL_ACK_SHA_FROM_FRESH_REQUIRED')
 ack=json.loads(ackraw)
 work=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'];outer=json.loads(ops.read_file(boot/'service-start-authorization.json',65536,True))['serviceLeaseExpiresAt']
 need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=work)and start['serviceLeaseExpiresAt']==work and outer-work==35000,'ACTUAL_WORK_AND_OUTER_LEASE_REQUIRED')
 cleanup=json.loads(root(boot/'cleanup.json',BINDINGS['previousCleanupSha256']))
 need(cleanup['requestKey']==KEY and cleanup['retained']is True and cleanup['runtimeMaterialPreserved']is True and cleanup['reason']=='EXACT_GUARDIAN_STOP_REQUESTED'and all(cleanup['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ACTUAL_GUARDIAN_CLOSE_REQUIRED')
 stopkey='t45-r3-ordinary42-preserve-stop-20261117-01'
 terminal(stopkey,'8b8971ec716c33f0fb1a78cc0de5dd2abf090170addb4636186e70b846242a6f','COMPLETED',0)
 stop=pair(stopkey,'normal05-preserve-stop-result.json','76693db7e3348093766de365032735f8c82d680c7f114f8040d299c2f613e8dd')
 need(stop['service']==SERVICE and stop['status']=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED' and stop['pgStopped']is True and stop['holdRetained']is True and stop['businessAdvanced']is False and stop['cleanupSha256']==BINDINGS['previousCleanupSha256'],'ACTUAL42_STOP_REQUIRED')
 terminal(ROLLBACK,BINDINGS['restoreTerminalSha256'],'COMPLETED',0)
 restored=pair(ROLLBACK,'maintenance-auth-result.json',BINDINGS['restoreResultSha256']);inner=restored['result']
 clean=pair(ROLLBACK,'maintenance-auth-cleanup.json',BINDINGS['restoreCleanupSha256'])
 need(restored['requestKey']==ROLLBACK and restored['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'and inner['requestKey']==ROLLBACK and inner['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['databaseStillStopped']is True and all(inner[k]is False for k in('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))and all(clean[k]is True for k in('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ACTUAL_ORIGINAL_AUTH_RESTORED_REQUIRED')
 need(json.loads(root(CUSTODY/'restored.json',BINDINGS['restoreSafeReceiptSha256']))==inner,'SAFE_RESTORATION_RECEIPT_REQUIRED')
 for leaf,expected in SNAPSHOTS.items():
  path=CUSTODY/leaf;s=path.lstat();actual=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  need(path.resolve()==path and stat.S_ISREG(s.st_mode)and actual==expected,'ORIGINAL41_STAT_ONLY_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 for cid,name,operation in [(SERVICE['containerId'],'t45-fresh35-first-production-20261110-r3-service-42',KEY),(clean['cid'],ROLLBACK,ROLLBACK)]:
  q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,check=True,timeout=5)
  need(not q.stderr and len(q.stdout)<=4096 and json.loads(q.stdout)==dict(id=cid,name='/'+name,image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',running=False,pid=0,operation=operation),'ACTUAL_CLOSED_CONTAINER_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
