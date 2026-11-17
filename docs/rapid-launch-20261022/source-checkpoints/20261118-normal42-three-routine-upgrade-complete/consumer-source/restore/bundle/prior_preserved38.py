"""Actual41 start, guardian closure and rollback02; no successful Stop41 invented."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat,subprocess

KEY='t45-first-r3-native-service-start-20261117-41'
ROLLBACK='t45-r3-ordinary41-original-auth-rollback-20261117-02'
SERVICE={'serviceKey':KEY,'containerId':'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c','containerStartedAt':'2026-11-17T13:42:11.910047227Z','postmasterStart':'2026-11-17 13:42:13.196867+00','proofSha256':'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa'}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
CUSTODY=R/'state/native-services/ordinary41-auth-20261117-01'
BINDINGS={'previousTerminalSha256':'bff45b1ff8381697f3fa914c04a7ce4ac88a4a8aa590dd8e846bca1846de68f1','previousResultSha256':'9132db0e45e635fd26f7423a62cd815605bb2ef0076c921127e8c587eaaeeee5','previousCleanupSha256':'9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac','previousCurrentProofSha256':SERVICE['proofSha256'],'previousRetainedAckSha256':'6b4e2a4d28521c869f0d5aef6c3cace4c37b6a0c290da8610379f1f2107a1d9a','restoreTerminalSha256':'2be96680dde0686d0221f8bd07bd42a21f07263bf27a8017742a6d5975073d45','restoreResultSha256':'915b0a5749a22b1dbbdf6938616db414d37a96df90a86bfdfff24a01ea79b14c','restoreCleanupSha256':'59d36f5e3290a5b1ca6e48399c6e72334079db6ab96dabb6415dc159aa6af178','restoreSafeReceiptSha256':'84585d7a0cfb13f096a81037a6b1437934e63488107fe04c3fb82f628e603136'}
SNAPSHOTS={'original-auth.json':[66304,13667483,0,0,256,1,2533,1794922727254004756,1794922727254004756],'finite-auth.json':[66304,13667486,0,0,256,1,2549,1794922727364004596,1794922727364004596],'applied.json':[66304,13667489,0,0,256,1,493,1794922728387003106,1794922728387003106]}
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def need(ok,code):
 if not ok:raise ValueError('CLOSED41_'+code)
def binding():return dict(BINDINGS)
def validate(ops,control,authority=None):
 # The original successful39/closed40 implementation is retained as history.
 path=Path(__file__).with_name('closed40_history.py');raw=ops.read_file(path,65536,True)
 need(sha(raw)=='5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a','EXACT_CLOSED40_SOURCE_REQUIRED')
 old=ModuleType('closed40_history');old.__file__=str(path);exec(compile(raw,str(path),'exec'),old.__dict__);old.validate(ops,control)
 if authority is not None:need(all(authority.get(k)==v for k,v in binding().items()),'ACTUAL41_BINDINGS_REQUIRED')
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
 proof=R/'authority/fresh35-current-production-service-v2-service-41.json';z=proof.lstat()
 need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'PUBLIC_PROOF_METADATA_REQUIRED')
 raw=ops.read_file(proof,65536,False);p=json.loads(raw);need(sha(raw)==SERVICE['proofSha256']and p['requestKey']==KEY and p['physical']['postmasterStart']==SERVICE['postmasterStart']and p['physical']['databaseOid']=='16393'and p['physical']['systemIdentifier']=='7706545564479176741','ACTUAL41_PROOF_REQUIRED')
 boot=R/'state/native-services'/KEY
 ack=json.loads(root(boot/'retained-ack.json',BINDINGS['previousRetainedAckSha256']))
 work=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'];outer=json.loads(ops.read_file(boot/'service-start-authorization.json',65536,True))['serviceLeaseExpiresAt']
 need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=work)and start['serviceLeaseExpiresAt']==work and outer-work==35000,'ACTUAL_WORK_AND_OUTER_LEASE_REQUIRED')
 cleanup=json.loads(root(boot/'cleanup.json',BINDINGS['previousCleanupSha256']))
 need(cleanup['requestKey']==KEY and cleanup['retained']is True and cleanup['runtimeMaterialPreserved']is True and cleanup['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and all(cleanup['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ACTUAL_GUARDIAN_CLOSE_REQUIRED')
 # These really failed; none is promoted to a successful stop or upgrade.
 for key,pin in [('t45-r3-settlement24-three-routine-upgrade41-20261117-01','f797d647162d0b256cabb3f7c5be8518daa291146338fb780613124235b47575'),('t45-r3-ordinary41-preserve-stop-20261117-01','d7e54f8934700ba6feb74be64e2927f5e2de7c6367b664d4a4847a5ec79133bb'),('t45-r3-ordinary41-original-auth-rollback-20261117-01','16ae761461af0353d77dbc98aa3610287d01594a17ab89d50f00fd0861816566')]:terminal(key,pin,'FAILED',2)
 terminal(ROLLBACK,BINDINGS['restoreTerminalSha256'],'COMPLETED',0)
 restored=pair(ROLLBACK,'maintenance-auth-result.json',BINDINGS['restoreResultSha256']);inner=restored['result']
 clean=pair(ROLLBACK,'maintenance-auth-cleanup.json',BINDINGS['restoreCleanupSha256'])
 need(restored['requestKey']==ROLLBACK and restored['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'and inner['requestKey']==ROLLBACK and inner['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'and inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['databaseStillStopped']is True and all(inner[k]is False for k in('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))and all(clean[k]is True for k in('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ACTUAL_ORIGINAL_AUTH_RESTORED_REQUIRED')
 need(json.loads(root(CUSTODY/'original-auth-rollback-restored.json',BINDINGS['restoreSafeReceiptSha256']))==inner,'SAFE_RESTORATION_RECEIPT_REQUIRED')
 for leaf,expected in SNAPSHOTS.items():
  path=CUSTODY/leaf;s=path.lstat();actual=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  need(path.resolve()==path and stat.S_ISREG(s.st_mode)and actual==expected,'ORIGINAL41_STAT_ONLY_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 for cid,name,operation in [(SERVICE['containerId'],'t45-fresh35-first-production-20261110-r3-service-41',KEY),(clean['cid'],ROLLBACK,ROLLBACK)]:
  q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,check=True,timeout=5)
  need(not q.stderr and len(q.stdout)<=4096 and json.loads(q.stdout)==dict(id=cid,name='/'+name,image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',running=False,pid=0,operation=operation),'ACTUAL_CLOSED_CONTAINER_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED',bindings=binding())
