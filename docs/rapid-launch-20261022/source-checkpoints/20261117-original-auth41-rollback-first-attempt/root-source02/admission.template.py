"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY=__HISTORY__
RULE=__RULE__
KEY='t45-r3-ordinary41-original-auth-rollback-20261117-01'
SERVICE=HISTORY['service']
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
POLICY='original-auth41-rollback-only-20261117-01.json'
JOBS={'rollback':KEY}
def fixed(core,need,path,pin):
 raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL41_RECEIPT_CHANGED');return core.strict(raw)
def failed_stop(core,need):
 x=HISTORY['failedStop'];job=B/'jobs'/x['key']
 t=fixed(core,need,job/'r3-outer-terminal.json',x['terminalSha256'])
 r=fixed(core,need,job/'results/normal05-preserve-stop-result.json',x['resultSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'FAILED',2)and r['safeCode']=='NORMAL05_STOP_PINNED_MODULE_DIFFERS','ACTUAL_FAILED_STOP41_REQUIRED')
def closed41(core,prior,need):
 failed_stop(core,need)
 path=HOST/'authority/fresh35-current-production-service-v2-service-41.json'
 proof=fixed(core,need,path,SERVICE['proofSha256']);shared=proof['sharedPostgresNamespace'];birth=shared['container']
 need(proof['requestKey']==shared['creationOperationId']==SERVICE['serviceKey']and birth['id']==SERVICE['containerId']and birth['startedAt']==SERVICE['containerStartedAt']and proof['physical']['postmasterStart']==SERVICE['postmasterStart'],'EXACT_C41_PROOF_REQUIRED')
 need(shared['serviceLeaseExpiresAt']==HISTORY['originalWorkDeadline']and HISTORY['originalLeaseExpiresAt']-35000==HISTORY['originalWorkDeadline'],'EXACT_WORK_AND_OUTER_SEPARATE_REQUIRED')
 boot=HOST/'state/native-services'/SERVICE['serviceKey']
 need(core.strict(core.read(boot/'carrier-birth.json'))==birth and core.strict(core.read(boot/'retained-ack.json'))==dict(requestKey=SERVICE['serviceKey'],proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=HISTORY['originalWorkDeadline']),'EXACT_RETAINED_BIRTH_ACK_REQUIRED')
 raw=core.read(boot/'cleanup.json');need(core.sha(raw)==HISTORY['cleanupSha256'],'EXACT_OBSERVED_C41_CLEANUP_REQUIRED');cleanup=core.strict(raw)
 need(cleanup['requestKey']==SERVICE['serviceKey']and cleanup['phase']=='SERVICE_RETAINED'and cleanup['retained']is True and cleanup['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and cleanup['runtimeMaterialPreserved']is True and all(cleanup['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ACTUAL_NATURAL_GUARDIAN_CLOSURE_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,SERVICE['containerId']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=4096,'EXACT_CLOSED_C41_DOCKER_READ_REQUIRED')
 need(core.strict(q.stdout)==dict(id=SERVICE['containerId'],name='/t45-fresh35-first-production-20261110-r3-service-41',image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',startedAt=SERVICE['containerStartedAt'],running=False,pid=0,operation=SERVICE['serviceKey']),'EXACT_C41_STOPPED_PID0_REQUIRED')
 data=HOST/'state/fresh35-first-production-20261110-r3/data';z=data.lstat()
 need(data.resolve()==data and(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode&0o777)==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_PGDATA_CLOSED_REQUIRED')
 q=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ORIGINAL_PORT_ABSENT_REQUIRED')
 return dict(cleanupSha256=core.sha(raw),exactExistingC41Stopped=True,ownedPID0=True,pgdataPidAbsent=True)
class Rollback:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root

  self.need(RULE is not None and core.digest(HISTORY['consumerSourcePinsSha256']),'FINAL_ROLLBACK_ONLY_CONSUMER_REQUIRED')
  raw=core.read(self.root/POLICY);self.need(core.sha(raw)==policy_pin,'EXACT_REGISTERED_ROLLBACK_POLICY_REQUIRED')
  self.policy=p=core.strict(raw);self.policy_sha256=policy_pin
  self.need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_ORIGINAL_AUTH41_ROLLBACK_ONLY_V1'and p['grantId']==cfg['grantId']==core.GRANT and set(p['jobs'])=={'rollback'},'SINGLE_ROLLBACK_ONLY_RULE_REQUIRED')
  r=dict(p['jobs']['rollback']);pins=dict(r['bundlePins']);inner=pins.pop('roles-authorization.json',None);r['bundlePins']=pins
  self.need(r==RULE and core.digest(inner),'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_PIN_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'SEPARATE_FINITE_ROLLBACK_WINDOW_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_ORIGINAL_AUTH41_ROLLBACK_'+code)
 def frozen(self,phase,job,private):
__FROZEN__
 def admit(self,job,private):
  if job.get('jobId')!=KEY:return self.prior.admit(job,private)
  a=self.frozen('rollback',job,private);self.prior.original_basis();closed=closed41(self.core,self.prior,self.need)
  self.need(a.get('requestKey')==KEY and a['guardianCleanupSha256']==closed['cleanupSha256'],'EXACT_CLOSED_C41_ROLLBACK_REQUIRED')
  inner=self.core.strict(self.core.read(private/'bundle/roles-authorization.json'))
  self.need(a['rolesAuthoritySha256']==self.policy['jobs']['rollback']['bundlePins']['roles-authorization.json']and all(inner.get(k)==v for k,v in HISTORY['innerScopeFixed'].items())and a['originalRecoveryStat9']==inner['originalRecoveryStat9'],'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_REQUIRED')
  for path,expected in HISTORY['snapshotMetadata6'].items():
   z=Path(path).lstat();actual=[z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode&0o777,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
   self.need(actual==inner['originalRecoveryStat9'][Path(path).name]and z.st_nlink==1,'ORIGINAL41_SNAPSHOT_REAL_STAT9_REQUIRED')
   if expected is not None:self.need(dict(device=z.st_dev,inode=z.st_ino,uid=z.st_uid,gid=z.st_gid,mode=z.st_mode&0o777,bytes=z.st_size)==expected,'ORIGINAL41_SNAPSHOT_SOURCE_METADATA_REQUIRED')
  return 'original-auth41-rollback'
 def finish(self,phase):
  if phase=='original-auth41-rollback':return None
  return self.prior.finish(phase)
