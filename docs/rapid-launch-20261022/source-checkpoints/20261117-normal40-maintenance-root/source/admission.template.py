"""Five maintenance phases only; no import/writer and no SOURCE-as-installed proof."""
from pathlib import Path
import hashlib,json,os,stat,subprocess,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
POLICY_NAME='direct40-batched-real.json'
FORMAT='T45_R3_NORMAL40_BATCHED_REAL_V1'
HISTORY=__HISTORY_LITERAL__
EXPECTED_RULES=__RULES_LITERAL__
JOBS=HISTORY['jobs']
SERVICE_KEY=JOBS['start']
PROOF=HOST/'authority/fresh35-current-production-service-v2-service-40.json'
def require_current_stopped(need):
 data=HOST/'state/fresh35-first-production-20261110-r3/data';s=data.lstat()
 need(data.resolve()==data and stat.S_ISDIR(s.st_mode)and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)
  and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_DATA_STOPPED_REQUIRED')
def validate_history(core,need,custody):
 def fixed(path,pin):
  raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL_HISTORY_CHANGED');return core.strict(raw)
 restore=HISTORY['original39Restore'];old=B/'jobs'/restore['key']
 fixed(old/'r3-outer-terminal.json',restore['terminalSha256'])
 fixed(old/'results/maintenance-auth-result.json',restore['rootResultSha256'])
 ack=core.read(HOST/HISTORY['retainedAck39']['relativePath']);need(core.sha(ack)==HISTORY['retainedAck39']['expectedRawSha256'],'ACTUAL_ACK39_RAW_REQUIRED')
 root=HISTORY['root08'];job=B/'jobs'/root['key']
 terminal=fixed(job/'r3-outer-terminal.json',root['terminalSha256'])
 need((terminal['jobId'],terminal['status'],terminal['exitCode'])==(root['key'],'COMPLETED',0),'ACTUAL_ROOT08_COMPLETED_REQUIRED')
 marker=fixed(HOST/'state/installed-real-operation-batched-root08-20261117-01/source-materialization.json',root['markerSha256'])
 need(marker==root['value']and marker['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'
  and marker['SQLUpgradePerformed']is False and marker['importReady']is False,'ROOT08_SOURCE_ONLY_FACT_REQUIRED')
 diagnostic=HISTORY['diagnostic02'];base=B/'jobs'/diagnostic['key']
 terminal=fixed(base/'r3-outer-terminal.json',diagnostic['pins']['terminal'])
 result=fixed(base/'results/durable-readonly-result.json',diagnostic['pins']['result'])
 cleanup=fixed(base/'results/durable-readonly-cleanup.json',diagnostic['pins']['cleanup'])
 need((terminal['status'],terminal['exitCode'])==('COMPLETED',0)and result['cleanup']==cleanup
  and all(cleanup[k]is True for k in ('ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','dataPreserved')),'ACTUAL_DIAGNOSTIC02_CLOSED_REQUIRED')
 # The successful body-only diagnostic is historical before evidence, never
 # a substitute for the native upgrade's live before definition/owner guards.
 need(result['snapshot']['evidence']['functionBodySha256']==diagnostic['beforeBodySha256'],'ACTUAL_OLD_THREE_BODY_FACTS_REQUIRED')
 for name,expected in custody.items():
  s=Path(name).lstat();need([s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]==expected,'ORIGINAL39_SNAPSHOT_STAT_CHANGED')

class Normal40Continuation:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root;self.jobs=JOBS
  self.need(core.digest(HISTORY['consumerSourcePinsSha256']),'FINAL_CONSUMER_SOURCE_PIN_REQUIRED')
  self.need(type(EXPECTED_RULES)is dict and set(EXPECTED_RULES)=={'apply','start','upgrade','stop','restore'},'FINAL_FIVE_CONSUMER_RULES_REQUIRED')
  raw=core.read(self.root/POLICY_NAME);self.need(core.digest(policy_pin)and core.sha(raw)==policy_pin,'REGISTERED_POLICY_REQUIRED')
  p=self.policy=core.strict(raw);self.policy_sha256=policy_pin
  self.need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}
   and p['format']==FORMAT and p['grantId']==core.GRANT==cfg['grantId'],'EXACT_MAINTENANCE_POLICY_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+5100000
   and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FINITE_PARENT_5100S_REQUIRED')
  self.need(set(p['jobs'])==set(JOBS)==set(EXPECTED_RULES),'EXACT_FIVE_PHASES_ONLY')
  role_pins=[]
  for phase,rule in p['jobs'].items():
   actual=dict(rule);pins=dict(actual['bundlePins'])
   if phase in ('apply','restore'):
    self.need('roles-authorization.json'in pins,'NEW_DYNAMIC_ROLE_PIN_REQUIRED');role_pins.append(pins.pop('roles-authorization.json'))
   actual['bundlePins']=pins;self.need(actual==EXPECTED_RULES[phase]and rule['jobId']==JOBS[phase],'EXACT_FROZEN_CONSUMER_RULE_REQUIRED')
  self.need(len(role_pins)==2 and role_pins[0]==role_pins[1]and core.digest(role_pins[0]),'SAME_NEW_FINITE_ROLE_PIN_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,value,code):self.core.need(value,'R3_CONTINUITY_NORMAL40_'+code)
 def original_basis(self):return validate_history(self.core,self.need,HISTORY['custodyStat9'])
 def admit(self,job,private):
  phase=next((name for name,key in JOBS.items()if job.get('jobId')==key),None)
  if phase is None:return self.prior.admit(job,private)
  authority=self.frozen(phase,job,private);self.original_basis()
  if phase in ('apply','start'):require_current_stopped(self.need)
  if phase=='start':self.successful('apply')
  elif phase=='upgrade':
   self.successful('apply');self.current_service(authority.get('service'));self.historical_install()
   d=authority.get('upgradeDescriptor',{})
   self.need(d.get('format')=='FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'
    and d.get('requestKey')==JOBS['upgrade']and d.get('predecessorBatchedCatalog',{}).get('modelSha256')==HISTORY['beforeModel']
    and d.get('batchedCatalog',{}).get('modelSha256')==HISTORY['afterModel']
    and d.get('sqlSha256')=='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
    and d.get('reviewedInputSha256')=='faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19'
    and authority.get('operatorReadySha256')==HISTORY['root08']['markerSha256'],'EXACT_THREE_ROUTINE_UPGRADE_ONLY')
  elif phase=='stop':
   self.need(self.submitted('start'),'START_SUBMISSION_REQUIRED');self.current_batch_settled_or_absent('upgrade')
  elif phase=='restore':
   self.need(self.submitted('apply'),'APPLY_SUBMISSION_REQUIRED')
   if self.submitted('start'):
    if authority.get('service')is None and authority.get('stopRequestKey')==JOBS['start']:
     pin,t=self.old.preservation_terminal(JOBS['start'],{'FAILED'})
     self.need(t.get('exitCode')==2 and authority.get('stopTerminalSha256')==pin
      and all(self.core.digest(authority.get(k))for k in ('stopResultSha256','stopCleanupSha256')),'EXACT_FAILED40_START_CLEANUP_REQUIRED')
     require_current_stopped(self.need)
    else:self.successful('stop')
   else:require_current_stopped(self.need)
  return 'normal40-'+phase
 def finish(self,phase):
  if phase in {'normal40-'+name for name in JOBS}:return None
  return self.prior.finish(phase)

__INHERITED_HELPERS__
