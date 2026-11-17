"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY=__HISTORY__
RULE=__RULE__
KEY='t45-r3-original-auth45-guardian-restore-20261118-01'
SERVICE=HISTORY['service']
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
POLICY='original-auth45-guardian-restore-only-20261118-01.json'
JOBS={'rollback':KEY}
def fixed(core,need,path,pin):
 raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL45_RECEIPT_CHANGED');return core.strict(raw)


def closed45(core,prior,need):
 w=HISTORY['writer'];job=B/'jobs'/w['key']
 terminal=fixed(core,need,job/'r3-outer-terminal.json',w['terminalSha256'])
 result=fixed(core,need,job/'results/final33-writer-result.json',w['resultSha256'])
 cleanup=fixed(core,need,job/'results/final33-writer-child-cleanup.json',w['cleanupSha256'])
 need((terminal['jobId'],terminal['status'],terminal['exitCode'])==(w['key'],'FAILED',2)and terminal.get('phaseStarted')is True and result['state']=='UNKNOWN'and result['safeCode']=='FINAL33_NATIVE_RESULT_BINDING_REQUIRED'and result['nativeResultBindingMatched']is False and result['automaticReplay']is False,'ACTUAL45_FAILED_NATIVE_UNKNOWN_NO_REPLAY_REQUIRED')
 need(all(cleanup.get(k)is True for k in('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))and cleanup['connectionCleanup']=='REAPED_EXCLUSIVE_PROCESS'and cleanup['originalInputMetadataChanges']==0,'ACTUAL45_WRITER_REAPED_NOT_NO_WRITES_REQUIRED')
 stop=HISTORY['stopAbsentKey']
 for path in (B/'jobs'/stop/'r3-outer-terminal.json',C/'results'/(stop+'.json'),B/'jobs'/stop/'results/normal05-preserve-stop-result.json',C/'jobs'/stop/'results/normal05-preserve-stop-result.json'):
  need(not os.path.lexists(path),'ACTUAL45_STOP_RECEIPTS_MUST_REMAIN_ABSENT')
 path=HOST/'authority/fresh35-current-production-service-v2-service-45.json'
 proof=fixed(core,need,path,SERVICE['proofSha256']);shared=proof['sharedPostgresNamespace'];birth=shared['container']
 need(proof['requestKey']==shared['creationOperationId']==SERVICE['serviceKey']and birth['id']==SERVICE['containerId']and birth['startedAt']==SERVICE['containerStartedAt']and proof['physical']['postmasterStart']==SERVICE['postmasterStart'],'EXACT_C45_PROOF_REQUIRED')
 need(shared['serviceLeaseExpiresAt']==HISTORY['originalWorkDeadline']and HISTORY['originalLeaseExpiresAt']-35000==HISTORY['originalWorkDeadline'],'EXACT_WORK_AND_OUTER_SEPARATE_REQUIRED')
 boot=HOST/'state/native-services'/SERVICE['serviceKey']
 need(core.strict(core.read(boot/'carrier-birth.json'))==birth,'EXACT_CARRIER_BIRTH_REQUIRED')
 ack=fixed(core,need,boot/'retained-ack.json',HISTORY['retainedAckSha256'])
 need(ack==dict(requestKey=SERVICE['serviceKey'],proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=HISTORY['originalWorkDeadline']),'EXACT_RETAINED_ACK_REQUIRED')
 raw=core.read(boot/'cleanup.json');need(core.sha(raw)==HISTORY['cleanupSha256'],'EXACT_OBSERVED_C45_CLEANUP_REQUIRED');cleanup=core.strict(raw)
 need(cleanup['requestKey']==SERVICE['serviceKey']and cleanup['phase']=='SERVICE_RETAINED'and cleanup['retained']is True and cleanup['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and cleanup['runtimeMaterialPreserved']is True and all(cleanup['cleanup'][k]is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent'))and cleanup['cleanup']['databasePrivilegesChanged']is False,'ACTUAL_GUARDIAN45_CLOSURE_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,SERVICE['containerId']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=4096,'EXACT_CLOSED_C45_DOCKER_READ_REQUIRED')
 need(core.strict(q.stdout)==dict(id=SERVICE['containerId'],name='/t45-fresh35-first-production-20261110-r3-service-45',image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',startedAt=SERVICE['containerStartedAt'],running=False,pid=0,operation=SERVICE['serviceKey']),'EXACT_C45_STOPPED_PID0_REQUIRED')
 data=HOST/'state/fresh35-first-production-20261110-r3/data';z=data.lstat()
 need(data.resolve()==data and(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode&0o777)==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_PGDATA_CLOSED_REQUIRED')
 q=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ORIGINAL_PORT_ABSENT_REQUIRED')
 return dict(cleanupSha256=core.sha(raw),exactExistingC45Stopped=True,ownedPID0=True,pgdataPidAbsent=True)
class Rollback:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root

  self.need(RULE is not None and core.digest(HISTORY['consumerSourcePinsSha256']),'FINAL_ROLLBACK_ONLY_CONSUMER_REQUIRED')
  raw=core.read(self.root/POLICY);self.need(core.sha(raw)==policy_pin,'EXACT_REGISTERED_ROLLBACK_POLICY_REQUIRED')
  self.policy=p=core.strict(raw);self.policy_sha256=policy_pin
  self.need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_ORIGINAL_AUTH45_GUARDIAN_RESTORE_ONLY_V1'and p['grantId']==cfg['grantId']==core.GRANT and set(p['jobs'])=={'rollback'},'SINGLE_ROLLBACK_ONLY_RULE_REQUIRED')
  r=dict(p['jobs']['rollback']);pins=dict(r['bundlePins']);inner=pins.pop('roles-authorization.json',None);r['bundlePins']=pins
  self.need(r==RULE and core.digest(inner),'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_PIN_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'SEPARATE_FINITE_ROLLBACK_WINDOW_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_ORIGINAL_AUTH45_ROLLBACK_'+code)
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
  if job.get('jobId')!=KEY:return self.prior.admit(job,private)
  a=self.frozen('rollback',job,private);self.prior.original_basis();closed=closed45(self.core,self.prior,self.need)
  self.need(a.get('requestKey')==KEY and a['guardianCleanupSha256']==closed['cleanupSha256'],'EXACT_CLOSED_C45_ROLLBACK_REQUIRED')
  inner=self.core.strict(self.core.read(private/'bundle/roles-authorization.json'))
  self.need(a['rolesAuthoritySha256']==self.policy['jobs']['rollback']['bundlePins']['roles-authorization.json']and all(inner.get(k)==v for k,v in HISTORY['innerScopeFixed'].items())and a['originalRecoveryStat9']==inner['originalRecoveryStat9'],'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_REQUIRED')
  for path,expected in HISTORY['snapshotMetadata6'].items():
   z=Path(path).lstat();actual=[z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode&0o777,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
   self.need(actual==inner['originalRecoveryStat9'][Path(path).name]and z.st_nlink==1,'ORIGINAL45_SNAPSHOT_REAL_STAT9_REQUIRED')
   if expected is not None:self.need(dict(device=z.st_dev,inode=z.st_ino,uid=z.st_uid,gid=z.st_gid,mode=z.st_mode&0o777,bytes=z.st_size)==expected,'ORIGINAL45_SNAPSHOT_SOURCE_METADATA_REQUIRED')
  return 'original-auth45-guardian-restore'
 def finish(self,phase):
  if phase=='original-auth45-guardian-restore':return None
  return self.prior.finish(phase)
