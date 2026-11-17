"""Exactly one recovery stop, plus exact original restore evidence bridge."""
from pathlib import Path
import hashlib,json,os,subprocess,time
HISTORY={'service': {'containerId': 'a8a29eb7604992be310e4f23b5aa43e064acb52298bd150df49bfc66db20d127', 'containerStartedAt': '2026-11-17T20:27:41.490657182Z', 'postmasterStart': '2026-11-17 20:27:42.926095+00', 'proofSha256': '28a7657bc2f5b5ffcb189f3031a73786f5ba2f6e33d7c6630c8b3012401d2e00', 'serviceKey': 't45-first-r3-native-service-start-20261118-45'}, 'startPins': {'terminal': 'a114891f6ab46b3454dfa41702ba4e635eb69b932c51ea629b585f09a8597ec7', 'result': 'b68b771253b49f3ac3d6a052f529afe116605c9bbcff3da6b2fb298964f6ca59'}, 'originalWorkDeadline': 1794950963530, 'originalLeaseExpiresAt': 1794950998530, 'originalRestorationDeadline': 1794951598808, 'originalRolesSha256': '073384eab7a9de27501915e2481c1529ae5b2dd8c43178532d2769a999bf6c85', 'originalRegisteredSourcePinsSha256': '77b7c9e5abec43006cd7e00d09e703bcac495af6aa609a25d7d742fb2dd3d944', 'dispatcherSha256': 'a19591c74163d6b94afd12b4f165f481adb3fbf92c3bb25e7e3c0a4ecfa0cc52', 'module41Sha256': 'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce', 'policy41Sha256': '5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9', 'newJobId': 't45-r3-original-auth45-guardian-restore-20261118-01', 'oldProtectedKeys': 142, 'newProtectedKeys': 143, 'consumerSourcePinsSha256': '4cb93146e127d362aef8b9ae1e2d3b48be4cf529a5990b658e698bb3ab19da12', 'finiteAuthority': None, 'consumerInterfaceSha256': '83b45b0a3048cf2aaf5287b7e95b083103396e886f3b51201d6b20a10277df51', 'jobs': {'rollback': 't45-r3-original-auth45-guardian-restore-20261118-01'}, 'consumerReviewSha256': 'e648fbb87e1a4a7dc616353147d8c593d85c180c2bc25f32e8d0689c79f9e010', 'cleanupSha256': '43f215a347cbeb2a31221b6d5406bfc5679acac2f40af7e3decd7e807a419efe', 'closedObservation': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL45-EXECUTION-PREPARATION-01/runtime/stop/ACTUAL-FIXED45-CLOSURE-SNAPSHOT.PRIVATE.json', 'sha256': '600f80aedf0536f5092d4cb4f7ff9670de4dad82f41d6968c6b8c99051f7604f'}, 'newAuthorizationWindow': None, 'scope': 'RESTORE_ORIGINAL_AUTH_ONLY_NO_APPLY_OR_RENEWAL', 'innerScopeFixed': {'coldCopyCompleteSha256': 'f081eb73e96650c1623ab158dd11923c395600dd37f51e4d6940a7bb633148c1', 'dataDirectory': '/var/lib/naijue-erp/fresh35-production/fresh35-first-production-20261110-r3/data', 'dataDirectoryIdentity': [66304, 13502421, 61035, 61035, 448], 'decision': 'RESTORE_EXISTING_ORIGINAL_TWO_ROLE_AUTH_ONLY', 'format': 'T45_R3_ORIGINAL45_AUTH_GUARDIAN_RESTORE_ONLY_V1', 'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e', 'maximumOfflineStepSeconds': 30, 'ordinaryServiceRequestKey': 't45-first-r3-native-service-start-20261118-45', 'physical': {'database': 'erp_fresh35_20261110_r3', 'databaseOid': '16393', 'serverVersionNum': '170011', 'systemIdentifier': '7706545564479176741'}, 'previousServiceRequestKey': 't45-first-r3-native-service-start-20261117-42', 'requestKey': 't45-r3-original-auth45-guardian-restore-20261118-01', 'restoreRequestKey': 't45-r3-original-auth45-guardian-restore-20261118-01', 'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3']}, 'outerScopeFixed': {'containerName': 't45-r3-original-auth45-guardian-restore-20261118-01', 'dataDirectoryDevice': 66304, 'dataDirectoryInode': 13502421, 'decision': 'ROLLBACK_EXACT_ORIGINAL_AUTH_ONLY', 'format': 'T45_R3_ORIGINAL45_AUTH_GUARDIAN_RESTORE_ONLY_ROOT_JOB_V1', 'guardianCleanupSha256': '43f215a347cbeb2a31221b6d5406bfc5679acac2f40af7e3decd7e807a419efe', 'historicalRolesAuthoritySha256': '073384eab7a9de27501915e2481c1529ae5b2dd8c43178532d2769a999bf6c85', 'hostPorts': [], 'imageId': 'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769', 'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e', 'maximumOperationSeconds': 300, 'networkMode': 'none', 'phase': 'restore', 'requestKey': 't45-r3-original-auth45-guardian-restore-20261118-01', 'service': {'containerId': 'a8a29eb7604992be310e4f23b5aa43e064acb52298bd150df49bfc66db20d127', 'containerStartedAt': '2026-11-17T20:27:41.490657182Z', 'postmasterStart': '2026-11-17 20:27:42.926095+00', 'proofSha256': '28a7657bc2f5b5ffcb189f3031a73786f5ba2f6e33d7c6630c8b3012401d2e00', 'serviceKey': 't45-first-r3-native-service-start-20261118-45'}}, 'snapshotMetadata6': {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary45-auth-20261118-01/original-auth.json': None, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary45-auth-20261118-01/finite-auth.json': None, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary45-auth-20261118-01/applied.json': None}, 'module45Sha256': '1e4cbc156bf02eccb6af8da38774825630ebfc782b4d6c15d63011b1e254670a', 'policy45Sha256': '13116146bec4db2186847f02ff4791a8e5c39aced50d9482a130245f38fbc6d0', 'stopAbsentKey': 't45-r3-ordinary45-preserve-stop-20261118-01', 'writer': {'key': 't45-r3-batched-real-after44-execute-20261118-01', 'terminalSha256': 'a574859a24eb391e9bf9e1ec7aa1ba9918d6b0e427bbd614072e07b7406df6cd', 'resultSha256': 'cd7208c2e93ead58eae19f8abc8732f00c48abf23f60cef0e831a6c9342ccc87', 'cleanupSha256': '29ec9281a7f50c0c67dfe81d1ae75c1cc8738a05ade08cd37850bcdaf4fe37ec'}, 'retainedAckSha256': '446f34a2ed1873a97eec5de10628f9d71c17db85e17c25389078a7ac547f60b3', 'mainSourceScope': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/主控/20261118-r3-auth45-guardian-recovery-scope-01/SOURCE-SCOPE.json', 'sha256': '6cd0482137c2d8516a60464d0ecbac9f21dab8a35ce7832dbd8195f86536c364'}, 'originalHardMissedFact': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/主控/20261118-r3-normal45-registration-window-01/ORIGINAL-HARD-DEADLINE-MISSED.json', 'sha256': '512e841e06422407e80d31747bb0d323e6687e6287278e94634e3d2eeebb9eb1', 'oldHardMet': False}}
RULE={'authorityLeaf': 'host-authorization.json', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': '8009923fd8972e42d55fb28de46ab5e581e36110ca0e864ef5a888904bf8e97d', 'ordinary05_roles_job.py': '2360d986c22b92b9558d9024cd560d6f75e0463112a5f1a9883cebcb31db65b2', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'successful39_history.py': 'bfd84aee27527a0c47996a044f911cd79fa207acf635965d3e44e70ca1d37700'}, 'jobId': 't45-r3-original-auth45-guardian-restore-20261118-01', 'script': 'ordinary05_roles_job.py', 'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ORIGINAL-AUTH45-GUARDIAN-RESTORE-SOURCE-01/bundle', 'timeoutSeconds': 300}
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
