"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY={'service': {'containerId': 'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c', 'containerStartedAt': '2026-11-17T13:42:11.910047227Z', 'postmasterStart': '2026-11-17 13:42:13.196867+00', 'proofSha256': 'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa', 'serviceKey': 't45-first-r3-native-service-start-20261117-41'}, 'startPins': {'result': '9132db0e45e635fd26f7423a62cd815605bb2ef0076c921127e8c587eaaeeee5', 'terminal': 'bff45b1ff8381697f3fa914c04a7ce4ac88a4a8aa590dd8e846bca1846de68f1'}, 'failedStop': {'key': 't45-r3-ordinary41-preserve-stop-20261117-01', 'terminalSha256': 'd7e54f8934700ba6feb74be64e2927f5e2de7c6367b664d4a4847a5ec79133bb', 'resultSha256': '35e73f8a425127559e6e65df96978fd12f316222b1e85ebeca77da2ea2d5dd4d'}, 'originalWorkDeadline': 1794926342048, 'originalLeaseExpiresAt': 1794926377048, 'originalRestorationDeadline': 1794926977752, 'originalRolesSha256': '0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c', 'originalRegisteredSourcePinsSha256': 'aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8', 'dispatcherSha256': 'ade6214cc9ff142bfb0bab75fe77b0ce0a006ee5049a2ca1aa7a1f0c95b8102a', 'module41Sha256': 'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce', 'policy41Sha256': '5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9', 'newJobId': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'oldProtectedKeys': 121, 'newProtectedKeys': 122, 'consumerSourcePinsSha256': '3af811e1aba655bb0ae07015eebd00afb2f8fc3cc8985ef7edaef3b2f1bfcda0', 'finiteAuthority': None, 'consumerInterfaceSha256': '7f01da0f4e4a650ee24a454a7c8bd4e9be76ed6f51756f6853718c7214b0af78', 'jobs': {'rollback': 't45-r3-ordinary41-original-auth-rollback-20261117-02'}, 'consumerReviewSha256': 'cc9cbfb4c0ac2511aacbad10fbff9b55eb41c9517d5f0fb268407e6246846bfe', 'cleanupSha256': '9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac', 'closedObservation': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL41-GUARDIAN-EXPIRY-METADATA-01/ACTUAL-GUARDIAN-CLOSE-METADATA.json', 'sha256': 'd771a74f49d71d6cb44b4c31403d1e231262f849f35ddb4e25782e1af14358c4'}, 'newAuthorizationWindow': None, 'scope': 'RESTORE_ORIGINAL_AUTH_ONLY_NO_APPLY_OR_RENEWAL', 'innerScopeFixed': {'coldCopyCompleteSha256': 'f081eb73e96650c1623ab158dd11923c395600dd37f51e4d6940a7bb633148c1', 'dataDirectory': '/var/lib/naijue-erp/fresh35-production/fresh35-first-production-20261110-r3/data', 'dataDirectoryIdentity': [66304, 13502421, 61035, 61035, 448], 'decision': 'RESTORE_EXISTING_ORIGINAL_TWO_ROLE_AUTH_ONLY', 'format': 'T45_R3_ORIGINAL41_AUTH_ROLLBACK_ONLY_V1', 'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e', 'maximumOfflineStepSeconds': 30, 'ordinaryServiceRequestKey': 't45-first-r3-native-service-start-20261117-41', 'physical': {'database': 'erp_fresh35_20261110_r3', 'databaseOid': '16393', 'serverVersionNum': '170011', 'systemIdentifier': '7706545564479176741'}, 'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-39', 'requestKey': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'restoreRequestKey': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3']}, 'outerScopeFixed': {'containerName': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'dataDirectoryDevice': 66304, 'dataDirectoryInode': 13502421, 'decision': 'ROLLBACK_EXACT_ORIGINAL_AUTH_ONLY', 'format': 'T45_R3_ORIGINAL41_AUTH_ROLLBACK_ONLY_ROOT_JOB_V1', 'guardianCleanupSha256': '9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac', 'historicalRolesAuthoritySha256': '0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c', 'hostPorts': [], 'imageId': 'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769', 'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e', 'maximumOperationSeconds': 300, 'networkMode': 'none', 'phase': 'restore', 'requestKey': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'service': {'containerId': 'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c', 'containerStartedAt': '2026-11-17T13:42:11.910047227Z', 'postmasterStart': '2026-11-17 13:42:13.196867+00', 'proofSha256': 'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa', 'serviceKey': 't45-first-r3-native-service-start-20261117-41'}}, 'snapshotMetadata6': {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/original-auth.json': None, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/finite-auth.json': None, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary41-auth-20261117-01/applied.json': None}, 'rollback01ModuleSha256': 'b7af59ad9fc3517324aaf6b407e21d7d90708e3c226846714860c8ef194afacc', 'rollback01PolicySha256': 'c4379f1716fd98fc50bf774f7e1e3e698a584b3207585aadfc33d5b2ec627de5', 'failedRollback01': {'key': 't45-r3-ordinary41-original-auth-rollback-20261117-01', 'terminalSha256': '16ae761461af0353d77dbc98aa3610287d01594a17ab89d50f00fd0861816566', 'resultSha256': '07978734fcce13e68db82f3913168af14580bc1d89849cfdf8292e34ee50c422', 'publicResultSha256': '505fd0d848cf20435ac41738edb26c7195121c369f2952342bdb2d874e666ccf'}}
RULE={'jobId': 't45-r3-ordinary41-original-auth-rollback-20261117-02', 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': 'ae787f26a0b4f4129e3bf776c10ad9314f38da4920c71893caefa4621ff7cea3', 'ordinary05_roles_job.py': 'e5e594ef0a2937ec0e9734163be5ed89620aad43db73a65c71d3c82352ec8ddb', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'timeoutSeconds': 300, 'deadlineField': 'expiresAt'}
KEY='t45-r3-ordinary41-original-auth-rollback-20261117-02'
SERVICE=HISTORY['service']
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
POLICY='original-auth41-rollback-only-20261117-02.json'
JOBS={'rollback':KEY}
def fixed(core,need,path,pin):
 raw=core.read(path);need(core.sha(raw)==pin,'ACTUAL41_RECEIPT_CHANGED');return core.strict(raw)
def failed_stop(core,need):
 x=HISTORY['failedStop'];job=B/'jobs'/x['key']
 t=fixed(core,need,job/'r3-outer-terminal.json',x['terminalSha256'])
 r=fixed(core,need,job/'results/normal05-preserve-stop-result.json',x['resultSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'FAILED',2)and r['safeCode']=='NORMAL05_STOP_PINNED_MODULE_DIFFERS','ACTUAL_FAILED_STOP41_REQUIRED')
def failed_rollback01(core,need):
 x=HISTORY['failedRollback01'];b=B/'jobs'/x['key']
 t=fixed(core,need,b/'r3-outer-terminal.json',x['terminalSha256']);r=fixed(core,need,b/'results/maintenance-auth-result.json',x['resultSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'FAILED',2)and r['safeCode']=='PRIVATE_INPUT_REQUIRED','FAILED_ROLLBACK01_PRESERVED_REQUIRED')
def closed41(core,prior,need):
 failed_rollback01(core,need)
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
  self.need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_ORIGINAL_AUTH41_ROLLBACK02_ONLY_V1'and p['grantId']==cfg['grantId']==core.GRANT and set(p['jobs'])=={'rollback'},'SINGLE_ROLLBACK_ONLY_RULE_REQUIRED')
  r=dict(p['jobs']['rollback']);pins=dict(r['bundlePins']);inner=pins.pop('roles-authorization.json',None);r['bundlePins']=pins
  self.need(r==RULE and core.digest(inner),'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_PIN_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'SEPARATE_FINITE_ROLLBACK_WINDOW_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_ORIGINAL_AUTH41_ROLLBACK_'+code)
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
  a=self.frozen('rollback',job,private);self.prior.original_basis();closed=closed41(self.core,self.prior,self.need)
  self.need(a.get('requestKey')==KEY and a['guardianCleanupSha256']==closed['cleanupSha256'],'EXACT_CLOSED_C41_ROLLBACK_REQUIRED')
  inner=self.core.strict(self.core.read(private/'bundle/roles-authorization.json'))
  self.need(a['rolesAuthoritySha256']==self.policy['jobs']['rollback']['bundlePins']['roles-authorization.json']and all(inner.get(k)==v for k,v in HISTORY['innerScopeFixed'].items())and a['originalRecoveryStat9']==inner['originalRecoveryStat9'],'EXACT_ROLLBACK_ONLY_INNER_AUTHORITY_REQUIRED')
  for path,expected in HISTORY['snapshotMetadata6'].items():
   z=Path(path).lstat();actual=[z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode&0o777,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
   self.need(actual==inner['originalRecoveryStat9'][Path(path).name]and z.st_nlink==1,'ORIGINAL41_SNAPSHOT_REAL_STAT9_REQUIRED')
   if expected is not None:self.need(dict(device=z.st_dev,inode=z.st_ino,uid=z.st_uid,gid=z.st_gid,mode=z.st_mode&0o777,bytes=z.st_size)==expected,'ORIGINAL41_SNAPSHOT_SOURCE_METADATA_REQUIRED')
  return 'original-auth41-rollback02'
 def finish(self,phase):
  if phase=='original-auth41-rollback02':return None
  return self.prior.finish(phase)
