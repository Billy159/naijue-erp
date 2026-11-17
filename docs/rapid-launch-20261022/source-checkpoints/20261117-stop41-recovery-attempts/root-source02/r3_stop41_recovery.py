"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY={'service': {'containerId': 'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c', 'containerStartedAt': '2026-11-17T13:42:11.910047227Z', 'postmasterStart': '2026-11-17 13:42:13.196867+00', 'proofSha256': 'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa', 'serviceKey': 't45-first-r3-native-service-start-20261117-41'}, 'startPins': {'result': '9132db0e45e635fd26f7423a62cd815605bb2ef0076c921127e8c587eaaeeee5', 'terminal': 'bff45b1ff8381697f3fa914c04a7ce4ac88a4a8aa590dd8e846bca1846de68f1'}, 'failedStop': {'key': 't45-r3-ordinary41-preserve-stop-20261117-01', 'terminalSha256': 'd7e54f8934700ba6feb74be64e2927f5e2de7c6367b664d4a4847a5ec79133bb', 'resultSha256': '35e73f8a425127559e6e65df96978fd12f316222b1e85ebeca77da2ea2d5dd4d'}, 'originalWorkDeadline': 1794926342048, 'originalLeaseExpiresAt': 1794926377048, 'originalRestorationDeadline': 1794926977752, 'originalRolesSha256': '0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c', 'originalRegisteredSourcePinsSha256': 'aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8', 'dispatcherSha256': '2b8e633af94581d2ca5fcbf9c1a970353a3bae1019a55a5f462befc063832ca0', 'module41Sha256': 'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce', 'policy41Sha256': '5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9', 'newJobId': 't45-r3-ordinary41-preserve-stop-recovery-20261117-01', 'oldProtectedKeys': 120, 'newProtectedKeys': 121, 'consumerSourcePinsSha256': 'e1f1b00c94d263dbce4a280d0c7a6fad9e5b34c8e516806f599cc381993e0de0', 'finiteAuthority': None, 'consumerInterfaceSha256': '011950babe938a49d2272f496656975f360fd4c93e5fd03d55771e46f49a56fd', 'jobs': {'stop': 't45-r3-ordinary41-preserve-stop-recovery-20261117-01'}, 'consumerReviewSha256': 'e9d821e14f4ee584d3c4dc830bcf427b9e721c335e657c159c28e416ead41d09'}
RULE={'jobId': 't45-r3-ordinary41-preserve-stop-recovery-20261117-01', 'script': 'normal41_recovery_stop.py', 'authorityLeaf': 'normal05-stop-input.json', 'bundlePins': {'normal05_retained_stop.py': '8a5af47d5f92225ae90bfef5ed2d3b04abe36a4cbd3cfb8f09744b26a9d31f7e', 'normal41_recovery_stop.py': '24489903130118c367dff8e61e739689df525deab443f96565a6d4faf101fbab'}, 'timeoutSeconds': 120, 'deadlineField': 'expiresAt'}
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
 def frozen(self, phase, job, private):
  (c, p) = (self.core, self.policy)
  rule = p['jobs'][phase]
  now = time.time_ns() // 1000000
  self.need(p['startsAt'] <= now < p['expiresAt'], 'FINITE_POLICY_EXPIRED')
  self.need(private == self.private(JOBS[phase]) and job.get('script') == rule['script'] and (job.get('taskId') == 'T45') and (job.get('grantId') == c.GRANT) and (job.get('scope') == self.cfg['scope']) and (type(job.get('timeoutSeconds')) is int) and (job['timeoutSeconds'] == rule['timeoutSeconds']) and (c.pack(c.strict(c.read(private / 'request.json'))) == c.pack(job)) and (not os.path.lexists(private / 'r3-outer-terminal.json')), 'EXACT_FROZEN_JOB_REQUIRED')
  raw = c.read(private / 'bundle/bundle-manifest.json')
  manifest = c.strict(raw)
  rows = manifest.get('files', [])
  self.need(c.sha(raw) == job.get('manifestSha256') and set(manifest) == {'taskId', 'jobId', 'files'} and (manifest['taskId'] == 'T45') and (manifest['jobId'] == JOBS[phase]) and (type(rows) is list) and (2 <= len(rows) <= 128) and all((type(row) is dict and set(row) == {'name', 'bytes', 'sha256'} and (type(row['name']) is str) and c.MEMBER.fullmatch(row['name']) and (type(row['bytes']) is int) and (0 <= row['bytes'] <= 4 * 1024 ** 2) and c.digest(row['sha256']) for row in rows)) and (len({row['name'] for row in rows}) == len(rows)) and ({row['name'] for row in rows} == set(rule['bundlePins']) | {rule['authorityLeaf']}), 'EXACT_FROZEN_MANIFEST_REQUIRED')
  (authority, authority_pin) = (None, None)
  for row in rows:
      content = c.read(private / 'bundle' / row['name'], maximum=4 * 1024 ** 2)
      pin = c.sha(content)
      self.need(len(content) == row['bytes'] and pin == row['sha256'] and (row['name'] == rule['authorityLeaf'] or pin == rule['bundlePins'][row['name']]), 'EXACT_FROZEN_MEMBER_REQUIRED')
      if row['name'] == rule['authorityLeaf']:
          (authority, authority_pin) = (c.strict(content), pin)
  self.need(type(authority) is dict and authority.get('requestKey') == JOBS[phase] and (job.get('args') == [authority_pin]) and (type(authority.get('startsAt')) is int) and (type(authority.get('expiresAt')) is int) and (p['startsAt'] <= authority['startsAt'] <= now) and (now + 240000 <= authority['expiresAt'] <= authority['startsAt'] + 300000 if phase == 'input_materialize' else now + rule['timeoutSeconds'] * 1000 < authority['expiresAt']) and (authority['expiresAt'] <= p['expiresAt']), 'EXACT_FINITE_AUTHORITY_REQUIRED')
  return authority
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
