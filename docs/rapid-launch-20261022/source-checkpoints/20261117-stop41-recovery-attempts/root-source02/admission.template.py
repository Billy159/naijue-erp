"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY=__HISTORY__
RULE=__RULE__
KEY='t45-r3-ordinary41-preserve-stop-recovery-20261117-01'
RESTORE='t45-r3-ordinary41-auth-restore-20261117-01'
SERVICE=HISTORY['service']
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
POLICY='stop41-recovery-only-20261117-01.json'
JOBS={'stop':KEY}
def fixed(core,need,path,pin):
 raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL41_RECEIPT_CHANGED');return core.strict(raw)
def failed_stop(core,need):
 x=HISTORY['failedStop'];job=B/'jobs'/x['key']
 t=fixed(core,need,job/'r3-outer-terminal.json',x['terminalSha256'])
 r=fixed(core,need,job/'results/normal05-preserve-stop-result.json',x['resultSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'FAILED',2)and r['safeCode']=='NORMAL05_STOP_PINNED_MODULE_DIFFERS','ACTUAL_FAILED_STOP41_REQUIRED')
def running41(core,prior,need):
 failed_stop(core,need);p=prior.current_service(SERVICE)
 need(SERVICE['serviceKey']=='t45-first-r3-native-service-start-20261117-41'and p['sharedPostgresNamespace']['serviceLeaseExpiresAt']==HISTORY['originalLeaseExpiresAt'],'EXACT_ORIGINAL_C41_REQUIRED')
 need(time.time_ns()//1000000<HISTORY['originalWorkDeadline'],'ORIGINAL_C41_WORK_DEADLINE_REQUIRED')
 return p
class Recovery:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root
  self.need(RULE is not None and core.digest(HISTORY['consumerSourcePinsSha256']),'FINAL_REVIEWED_RECOVERY_CONSUMER_REQUIRED')
  raw=core.read(self.root/POLICY);self.need(core.sha(raw)==policy_pin,'EXACT_REGISTERED_RECOVERY_POLICY_REQUIRED')
  self.policy=p=core.strict(raw);self.policy_sha256=policy_pin
  self.need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_STOP41_RECOVERY_ONLY_V1'and p['grantId']==cfg['grantId']==core.GRANT and p['jobs']=={'stop':RULE},'SINGLE_RECOVERY_RULE_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=min(p['startsAt']+300000,HISTORY['originalWorkDeadline'],HISTORY['originalRestorationDeadline']),'NO_EXTENSION_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_STOP41_RECOVERY_'+code)
 def frozen(self,phase,job,private):
__FROZEN__
 def admit(self,job,private):
  if job.get('jobId')==KEY:
   a=self.frozen('stop',job,private);self.prior.original_basis();running41(self.core,self.prior,self.need)
   self.need(a.get('requestKey')==KEY and a.get('service')==SERVICE and a['expiresAt']<=self.policy['expiresAt'],'EXACT_RECOVERY_STOP_AUTHORITY_REQUIRED')
   self.prior.current_batch_settled_or_absent('upgrade')
   return 'stop41-recovery-stop'
  if job.get('jobId')!=RESTORE:return self.prior.admit(job,private)
  # Only the exact recovery-stop evidence is additive; old branches remain.
  a=self.prior.frozen('restore',job,private)
  if a.get('stopRequestKey')!=KEY:return self.prior.admit(job,private)
  self.prior.original_basis();failed_stop(self.core,self.need)
  self.need(a.get('service')==SERVICE and a['expiresAt']<=HISTORY['originalRestorationDeadline'],'ORIGINAL_RESTORE_C41_AND_DEADLINE_REQUIRED')
  jobdir=B/'jobs'/KEY
  t=fixed(self.core,self.need,jobdir/'r3-outer-terminal.json',a['stopTerminalSha256'])
  r=fixed(self.core,self.need,jobdir/'results/normal05-stop-result.json',a['stopResultSha256'])
  pin,public_terminal=self.prior.old.preservation_terminal(KEY,{'COMPLETED'})
  self.need(pin==a['stopTerminalSha256']and public_terminal==t and(t['jobId'],t['status'],t['exitCode'])==(KEY,'COMPLETED',0),'ACTUAL_RECOVERY_TERMINAL_REQUIRED')
  self.need(r['requestKey']==KEY and r['status']=='NORMAL05_RETAINED_CLEAN_STOP_CONFIRMED'and r['serviceKey']==SERVICE['serviceKey']and r['serviceProofSha256']==SERVICE['proofSha256']and r['containerId']==SERVICE['containerId']and r['containerStartedAt']==SERVICE['containerStartedAt']and r['postmasterStart']==SERVICE['postmasterStart']and r['cleanupSha256']==a['stopCleanupSha256'],'ACTUAL_EXACT_C41_RECOVERY_CLOSURE_REQUIRED')
  cleanup=fixed(self.core,self.need,HOST/'state/native-services'/SERVICE['serviceKey']/'cleanup.json',a['stopCleanupSha256'])
  self.need(all(cleanup['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ACTUAL_C41_CLEANUP_REQUIRED')
  data=HOST/'state/fresh35-first-production-20261110-r3/data';s=data.lstat()
  self.need((s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode&0o777)==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_DATA_STOPPED_REQUIRED')
  return 'stop41-recovery-restore'

 def finish(self,phase):
  if phase in ('stop41-recovery-stop','stop41-recovery-restore'):return None
  return self.prior.finish(phase)
