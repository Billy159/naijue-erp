"""Only four fixed artifact policy jobs, paired to actual closed post-writer evidence."""
from pathlib import Path
from types import ModuleType
import os,stat,subprocess,time
WIP_PENDING=False
PROFILES={'app': {'bundlePins': {'APP-PACK-RECEIPT.json': 'ed0fbf97e004c8409af5335a62853159e7c6a18464d4538909767e08c3491377', 'APP-READY.LOCAL.json': '18e666855c5784503ee23142d0abbbebb4ad3d187b997fe456b1f860293ef87b', 'FIXED-SCOPE.json': '49490f279529035fb539ceadf605afbfffc6b56c4a396a668b5410560561a95b', 'receiver_client.py': '954342825d020435db0b1ba36573054e5010ba8a4e531fc0cac7dcf4162a3b81', 'reception_scope.py': '0cb22a932c3504a12795b0dcd3917192bd5004193f710465ed2bf71c9f21dd9f', 'root_policy.py': 'bc90e4859f3b38b1ada0d66ec1761ac0fcd90ad6fff49dab8f20b6c4681c1724'}, 'fixedScope': {'archiveBytes': 7690353, 'archiveSha256': '13b8de7b328e791782bf39a99bf071df01cc05e768ea763418b4a785b6b99cc1', 'artifactKey': 'r3-final33-ordinary161-a7bab2ee-20261117-01', 'decision': 'AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING', 'format': 'T45_ORDINARY_ARTIFACT_STAGING_V1', 'grantId': 'b16447fbc81f4d64', 'kind': 'ORDINARY_SOURCE_AND_TOOLS', 'sourceSetSha256': '57a302e1c06f420fb281084133a71ad8de3473dc86c59148b7efdb7642103abf', 'targetDirectory': '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/artifacts/r3-final33-ordinary161-a7bab2ee-20261117-01', 'taskId': 'T45'}, 'installKey': 't45-r3-final33-a7bab2-artifact-policy-install-20261117-01', 'maximumWindowMs': 1080000, 'restoreKey': 't45-r3-final33-a7bab2-artifact-policy-restore-20261117-01', 'timeoutSeconds': 35}, 'private': {'bundlePins': {'FIXED-SCOPE.json': 'c742f0b5495ff57c73a75a63a576ea110ce1a9da332b03eec87b1b3b2043fc37', 'receiver_client.py': '954342825d020435db0b1ba36573054e5010ba8a4e531fc0cac7dcf4162a3b81', 'reception_scope.py': '3b07b2d9594cbb433f943566c41347f6dc599dad16db3554022e7538c4b15cee', 'root_policy.py': '733aa01d0d8cde6bbbf76ad6b791e997d783f1594ebe15c7471c14e92592153a'}, 'fixedScope': {'archiveBytes': 40960, 'archiveSha256': '244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d', 'artifactKey': 'r3-final33-recovery-input-20261117-01', 'decision': 'AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING', 'format': 'T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1', 'fragmentIndex': 1, 'fragmentOffset': 0, 'grantId': 'b16447fbc81f4d64', 'kind': 'PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT', 'manifestSha256': '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679', 'targetDirectory': '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/private-standard-import-data/r3-final33-recovery-input-20261117-01', 'taskId': 'T45'}, 'installKey': 't45-r3-final33-recovery-artifact-policy-install-20261117-01', 'maximumWindowMs': 600000, 'restoreKey': 't45-r3-final33-recovery-artifact-policy-restore-20261117-01', 'timeoutSeconds': 35}}
KEYS={'t45-r3-final33-a7bab2-artifact-policy-install-20261117-01': ('app', 'installKey'), 't45-r3-final33-a7bab2-artifact-policy-restore-20261117-01': ('app', 'restoreKey'), 't45-r3-final33-recovery-artifact-policy-install-20261117-01': ('private', 'installKey'), 't45-r3-final33-recovery-artifact-policy-restore-20261117-01': ('private', 'restoreKey')}  # Final SOURCE pair179; runtime evidence still required.
POLICY_NAME='two-fixed-artifact-admission-20261117-01.json'
FORMAT='T45_TWO_FIXED_ARTIFACT_ROOT_ADMISSION_V1'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
WRITER='t45-r3-batched-real-execute-20261115-01'
def evidence_paths(profile):
 keys=profile['phaseKeys']
 return {name:B/'jobs'/keys[phase]/'r3-outer-terminal.json'for name,phase in [('writerTerminal','writer'),('stopTerminal','stop'),('restoreTerminal','restore')]}|{
  'writerResult':B/'jobs'/keys['writer']/'results/final33-writer-result.json',
  'stopResult':B/'jobs'/keys['stop']/'results/normal05-preserve-stop-result.json',
  'restoreResult':B/'jobs'/keys['restore']/'results/maintenance-auth-result.json',
  'restoredReceipt':Path(profile['restoredReceiptPath']),'currentProof':Path(profile['currentProofPath'])}
class FixedArtifactAdmission:
 def __init__(self,core,prior,cfg,policy_pin):
  if WIP_PENDING or KEYS is None:raise ValueError('FINAL_APP_RECEIVER_PAIR_REQUIRED_NO_ADMISSION')
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root
  raw=core.read(self.root/POLICY_NAME);self.need(core.sha(raw)==policy_pin,'REGISTERED_PROFILE_DIFFERS');self.policy=core.strict(raw);p=self.policy
  fields={'format','grantId','startsAt','expiresAt','authorityPins','evidencePins','stoppedService','decisionReference','phaseKeys','restoredReceiptPath','currentProofPath','normalPolicySha256','baselineDispatcherSha256','baselineHelperSha256'}
  self.need(type(p)is dict and set(p)==fields and p['format']==FORMAT and p['grantId']==core.GRANT==cfg['grantId'],'EXACT_PROFILE_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and prior.policy['startsAt']<=p['startsAt']<p['expiresAt']<=min(prior.policy['expiresAt'],int(cfg['expiresAtEpoch']*1000)),'FINITE_PROFILE_REQUIRED')
  self.need(type(p['phaseKeys'])is dict and set(p['phaseKeys'])=={'start','writer','stop','restore'}and p['phaseKeys']=={k:prior.policy['jobs'][k]['jobId']for k in p['phaseKeys']}and p['phaseKeys']['writer']==WRITER,'ACTUAL_NORMAL_POLICY_PHASE_KEYS_REQUIRED')
  self.need(prior.policy_sha256==p['normalPolicySha256']and all(core.digest(p[k])for k in ('normalPolicySha256','baselineDispatcherSha256','baselineHelperSha256')),'ACTUAL_BASELINE_POLICY_REQUIRED')
  for name,parent in [('restoredReceiptPath',HOST/'state/native-services'),('currentProofPath',HOST/'authority')]:
   value=p[name];self.need(type(value)is str and value.startswith('/')and os.path.normpath(value)==value,'EXACT_EVIDENCE_PATH_REQUIRED');path=Path(value)
   self.need((path.name=='restored.json'and path.parent.parent==parent)if name=='restoredReceiptPath'else(path.parent==parent and path.suffix=='.json'),'EXACT_EVIDENCE_PARENT_REQUIRED')
  self.need(type(p['authorityPins'])is dict and set(p['authorityPins'])==set(PROFILES)and all(core.digest(v)for v in p['authorityPins'].values())and type(p['evidencePins'])is dict and set(p['evidencePins'])==set(evidence_paths(p))and all(core.digest(v)for v in p['evidencePins'].values()),'REAL_EXACT_AUTHORITY_AND_EVIDENCE_PINS_REQUIRED')
  self.need(type(p['decisionReference'])is str and 0<len(p['decisionReference'])<=512,'MAIN_DECISION_REFERENCE_REQUIRED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_FIXED_ARTIFACT_'+code)
 def stopped_basis(self):
  c=self.core;p=self.policy;values={};keys=p['phaseKeys']
  for name,path in evidence_paths(p).items():
   raw=c.read(path);self.need(c.sha(raw)==p['evidencePins'][name],'POST_WRITER_EVIDENCE_CHANGED');values[name]=c.strict(raw)
  for name,phase in [('writerTerminal','writer'),('stopTerminal','stop'),('restoreTerminal','restore')]:
   v=values[name];self.need((v.get('jobId'),v.get('taskId'),v.get('grantId'),v.get('status'),v.get('exitCode'),v.get('phaseStarted'))==(keys[phase],'T45',c.GRANT,'COMPLETED',0,True),'ACTUAL_COMPLETED_PHASE_REQUIRED')
  writer=values['writerResult'];stop=values['stopResult'];restore=values['restoreResult'];inside=restore['result'];service=p['stoppedService']
  self.need(writer.get('requestKey')==keys['writer']and writer.get('service')==service and writer.get('state')=='COMPLETED'and writer.get('nativeResultBindingMatched')is True and writer.get('lifecycleConfirmed')is True and writer.get('nativeConnectionCleanup')=='CLOSED'and writer.get('readbackConnectionCleanup')=='CLOSED'and writer.get('verification',{}).get('state')=='VERIFIED','ACTUAL_WRITER_AND_VERIFIED_READBACK_REQUIRED')
  self.need(all(writer.get('processCleanup',{}).get(k)is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty')),'ACTUAL_WRITER_CLEANUP_REQUIRED')
  self.need(stop.get('requestKey')==keys['stop']and stop.get('service')==service and stop.get('pgStopped')is True and stop.get('businessAdvanced')is False,'ACTUAL_PRESERVATION_STOP_REQUIRED')
  self.need(restore.get('requestKey')==keys['restore']and inside==values['restoredReceipt']and inside.get('requestKey')==keys['restore']and inside.get('status')=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately')is True and inside.get('databaseStillStopped')is True and all(inside.get(k)is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged'))and all(restore.get('cleanup',{}).get(k)is True for k in ('ownContainerStopped','ownedPidAbsent')),'ACTUAL_ORIGINAL_AUTH_RESTORE_REQUIRED')
  proof=values['currentProof'];self.need(type(service)is dict and set(service)=={'serviceKey','proofSha256','containerId','containerStartedAt','postmasterStart'}and service['serviceKey']==keys['start']and service['proofSha256']==p['evidencePins']['currentProof']and proof['requestKey']==keys['start']and proof['sharedPostgresNamespace']['container']['id']==service['containerId']and proof['sharedPostgresNamespace']['container']['startedAt']==service['containerStartedAt']and proof['physical']['postmasterStart']==service['postmasterStart'],'EXACT_ACTUAL_STOPPED_SERVICE_REQUIRED')
  data=HOST/'state/fresh35-first-production-20261110-r3/data';s=data.lstat();self.need(stat.S_ISDIR(s.st_mode)and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_DATA_STOPPED_REQUIRED')
  q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}',service['containerId']],capture_output=True,timeout=5,check=True)
  self.need(not q.stderr and 0<len(q.stdout)<=4096 and c.strict(q.stdout)==dict(id=service['containerId'],startedAt=service['containerStartedAt'],running=False,pid=0,operation=service['serviceKey']),'ACTUAL_STOPPED_CONTAINER_REQUIRED')
 def admit(self,job,private):
  if job.get('jobId')not in KEYS:return self.prior.admit(job,private)
  c,p=self.core,self.policy;kind,step=KEYS[job['jobId']];fixed=PROFILES[kind];at=time.time_ns()//1000000
  self.need(p['startsAt']<=at<at+fixed['timeoutSeconds']*1000<p['expiresAt'],'FINITE_PROFILE_EXPIRED')
  self.need(private==B/'jobs'/job['jobId']and c.strict(c.read(private/'request.json'))==job and not os.path.lexists(private/'r3-outer-terminal.json'),'EXACT_FROZEN_REQUEST_REQUIRED')
  self.need(job.get('taskId')=='T45'and job.get('grantId')==c.GRANT and job.get('scope')==self.cfg['scope']and job.get('script')=='root_policy.py'and job.get('args')==[p['authorityPins'][kind]]and type(job.get('timeoutSeconds'))is int and job['timeoutSeconds']==fixed['timeoutSeconds'],'EXACT_FIXED_JOB_REQUIRED')
  names=set(fixed['bundlePins'])|{'stage-authorization.json'};manifest_raw=c.read(private/'bundle/bundle-manifest.json');manifest=c.strict(manifest_raw)
  self.need(c.sha(manifest_raw)==job.get('manifestSha256')and c.strict(c.read(private/'manifest.json'))==manifest and type(manifest)is dict and set(manifest)=={'jobId','taskId','files'}and manifest['jobId']==job['jobId']and manifest['taskId']=='T45'and type(manifest['files'])is list and len(manifest['files'])==len(names)and all(type(r)is dict and set(r)=={'name','bytes','sha256'}and type(r['name'])is str and r['name']in names and type(r['bytes'])is int and 0<r['bytes']<=262144 and c.digest(r['sha256'])for r in manifest['files'])and{r['name']for r in manifest['files']}==names,'FROZEN_BUNDLE_REQUIRED')
  buffers={name:c.read(private/'bundle'/name,maximum=262144)for name in names}
  for row in manifest['files']:self.need(row['bytes']==len(buffers[row['name']])and row['sha256']==c.sha(buffers[row['name']]),'FROZEN_MEMBER_CHANGED')
  self.need(all(c.sha(buffers[n])==pin for n,pin in fixed['bundlePins'].items()),'EXACT_REVIEWED_CODE_REQUIRED')
  module=ModuleType('exact_existing_artifact_scope');module.__file__=str(private/'bundle/reception_scope.py');exec(compile(buffers['reception_scope.py'],module.__file__,'exec'),module.__dict__)
  authority=module.bind(buffers['stage-authorization.json'],p['authorityPins'][kind],fixed['fixedScope'],step=='installKey')
  self.need(p['startsAt']<=authority['startsAt']<authority['expiresAt']<=p['expiresAt']-30000,'STAGE_WINDOW_WITHIN_FINITE_PROFILE_REQUIRED')
  self.stopped_basis()
  if step=='restoreKey':self.need(c.read(B/'jobs'/fixed['installKey']/'bundle/stage-authorization.json')==buffers['stage-authorization.json'],'ORIGINAL_INSTALL_AUTHORITY_REQUIRED')
  return 'fixed-artifact-policy-'+kind+'-'+step
 def finish(self,phase):
  if phase in {'fixed-artifact-policy-'+k+'-'+p for k in PROFILES for p in ('installKey','restoreKey')}:return None
  return self.prior.finish(phase)
