"""One new exact readonly admission; no authority issuance or server mutation."""
from pathlib import Path
import os,time
KEY='t45-r3-original-businessroot-durable-after45-readonly-20261118-01'
POLICY_NAME='after45-businessroot-durable-readonly-20261118-01.json'
EXPECTED_BUNDLE={'durable-readonly.sql': '2cb48cb8a7e0dc5bbe48378ea109d6104588c4904197f501c1d84ad9d974bc43', 'durable_readonly_job.py': '0e17617f7919365bc85ba153bbca9810188d6226aef8b461e5d401a924110b48', 'scope.json': '2c00f4582fa6b1033ff6bbadff6ce4e4380a6c566383177972c1771e7c0e15e7'}

from types import ModuleType
import subprocess
HISTORY={'newJobId': 't45-r3-original-businessroot-durable-after45-readonly-20261118-01', 'jobs': {'observe': 't45-r3-original-businessroot-durable-after45-readonly-20261118-01'}, 'dispatcherSha256': 'f7d3d324aefca45933085b5a5e14c6802695585011ecdff48ac69df36e5c521e', 'previousModuleSha256': '6069169514a44d98869ffdcef77c2088be0fedc618967866aa42717480152904', 'previousPolicySha256': 'bf5ab07f4c86346ab8aa2341471d5a70c0c1f7f9315fbe51a72ca0ebdc8b26fb', 'mainScope': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/主控/20261118-r3-after45-durable-readonly-scope-01/SOURCE-SCOPE.json', 'sha256': '8ea720aea4b5a8358ffe69b014a3a513b03a60a98ff89602877dfaa72526b3ad'}, 'restore': {'key': 't45-r3-original-auth45-guardian-restore-20261118-01', 'terminalSha256': '09c82002e59d70c8ef086af7c65219ae049876cdc59258f480e2f69aae241210', 'resultSha256': '1b6cdcc959a65390d577143cfbf22ca63a54b5d31cb3faea731a3b9898afc113', 'cleanupSha256': 'f59857ad32d19be5baa317603be77d332278bf03ad493005e6f63873f7c86e66', 'safeReceiptSha256': '28a5928a29fdf2c9c8094798af22a7ba6a709af9f40ea50e8e27cc8b3f32b37e', 'container': {'exitCode': 0, 'id': 'db1e52517061426869b8735caac0d8c16e02e917999291d8c0f75f6dc402d33f', 'image': 'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769', 'name': '/t45-r3-original-auth45-guardian-restore-20261118-01', 'operation': 't45-r3-original-auth45-guardian-restore-20261118-01', 'pid': 0, 'running': False}}, 'restoreReadback': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ORIGINAL-AUTH45-GUARDIAN-RESTORE-EXECUTION-PREPARATION-01/runtime/rollback/ACTUAL-ORIGINAL-KEY-READBACK-01.PRIVATE.json', 'sha256': '159426159749266436f62cb92e59463e7cf190da409b3e47ef6a05895746ff36'}, 'originalHardMet': False, 'businessCommitState': 'UNKNOWN', 'sql42Result': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL42-MAINTENANCE-RESULT-01/RESULT.json', 'sha256': 'c34f8c48f037709f7ce9fc8a3341e18e336769e228b59947b550ad5c4dd95afe'}, 'consumerReviewSha256': 'be4fdbc63443a38f5543cad841f332bf231ab80b1122b614796300403c4658f1', 'clock': None, 'authorities': None, 'planIdentityAddendum': {'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/主控/20261118-r3-after45-durable-readonly-scope-01/PLAN-IDENTITY-ADDENDUM.json', 'sha256': 'ce5fc5da901de9825df325d5d30b5c0a6ad4396c06b55a30dd2b7550142bae64'}, 'consumerSourcePinsSha256': 'abc2bf91751c475befb10477e7e03473e9bbfc7b2b1dbbf0c7f3945ec76fe941', 'consumerInterfaceSha256': '845fed13bd6ffa29a6d5add33717cb02584eb71db8fe5fd906e8321911be69c3', 'businessIdentity': {'baselineBatchId': 'ee6716e0-d983-c718-bff7-98d9f872d116', 'batchedPlanSha256': '3fbb2d3a373c08871547235fec2810dddfcd8aa6bb836ed1249d493ef927addf', 'cutoffAt': '2026-11-16T11:40:00+08:00', 'documentBatchId': '9629d837-776e-7f61-4fd4-0cebd4e1a097', 'manifestSha256': '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679', 'markerPlanSha256': 'afa9a6722b9b6d24d8945048695b32a1191a2670e8b61acf98624930b768eb0e', 'namespace': 'naijue:tplus:20261102', 'originalSteps': 44910, 'rootOperationId': '7e820f8b-0770-9773-6249-9999b0e0d758'}}
POLICY_FORMAT='T45_R3_AFTER45_DURABLE_READONLY_REGISTERED_V1'
AUTHORITY_FORMAT='T45_R3_AFTER45_DURABLE_READONLY_AUTHORITY_V1'
def read_closed_basis(core,prior,need):
 root=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
 module_raw=core.read(root/'r3_original_auth45_guardian_restore.py')
 need(core.sha(module_raw)==HISTORY['previousModuleSha256'],'ACTUAL143_RESTORATION_ADMISSION_SOURCE_REQUIRED')
 m=ModuleType('accepted_guardian45_closed_source');exec(compile(module_raw,'accepted_guardian45_closed_source','exec'),m.__dict__)
 closure=m.closed45(core,prior,need)
 x=HISTORY['restore'];base=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/x['key']
 def fixed(leaf,pin):
  raw=core.read(base/leaf);need(core.sha(raw)==pin,'ACTUAL45_RESTORATION_RECORD_CHANGED');return core.strict(raw)
 t=fixed('r3-outer-terminal.json',x['terminalSha256']);r=fixed('results/maintenance-auth-result.json',x['resultSha256']);c=fixed('results/maintenance-auth-cleanup.json',x['cleanupSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'COMPLETED',0)and r['result']['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and r['result']['naturalExpiryCountedAsRestoration']is False and r['result']['runtimeAuthChanged']is False and r['result']['membershipsOrRoleAttributesChanged']is False and r['result']['originalHardDeadlineMet']is False,'ACTUAL45_ORIGINAL_AUTH_RESTORATION_RECEIPT_REQUIRED')
 need(c['ownContainerStopped']is True and c['ownedPidAbsent']is True and c['confirmed']is True and c['sourceDataPreserved']is True,'ACTUAL45_RESTORATION_HELPER_CLEANUP_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,x['container']['id']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and core.strict(q.stdout)==x['container'],'ACTUAL_RESTORATION_HELPER_STILL_STOPPED_REQUIRED')
 return dict(closure,restorationResultSha256=x['resultSha256'],originalAuthRestored=True)
class After45DurableReadonly:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg
  self.root=prior.root
  self.need(core.digest(policy_pin),'NEW_DIAGNOSTIC_POLICY_NOT_REGISTERED')
  raw=core.read(self.root/POLICY_NAME);self.need(core.sha(raw)==policy_pin,'REGISTERED_DIAGNOSTIC_POLICY_DIFFERS')
  p=self.policy=core.strict(raw)
  self.need(set(p)=={'format','requestKey','startsAt','expiresAt','authoritySha256','sourceReviewSha256','bundlePins'} and p['format']==POLICY_FORMAT and p['requestKey']==KEY and p['bundlePins']==EXPECTED_BUNDLE and core.digest(p['authoritySha256']) and core.digest(p['sourceReviewSha256']),'ONE_EXACT_DIAGNOSTIC_POLICY_REQUIRED')
  self.need(type(p['startsAt']) is type(p['expiresAt']) is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'DIAGNOSTIC_WINDOW_OUTSIDE_ORIGINAL_GRANT')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_AFTER45_DURABLE_'+code)
 def admit(self,job,private):
  if job.get('jobId')!=KEY:return self.prior.admit(job,private)
  self.prior.original_basis();read_closed_basis(self.core,self.prior,self.need)
  c,p=self.core,self.policy;stamp=time.time_ns()//1000000
  self.need(private==self.private(KEY) and job.get('taskId')=='T45' and job.get('grantId')==c.GRANT and job.get('scope')==self.cfg['scope'] and job.get('script')=='durable_readonly_job.py' and type(job.get('timeoutSeconds')) is int and job['timeoutSeconds']==300 and job.get('args')==[p['authoritySha256']] and c.pack(c.strict(c.read(private/'request.json')))==c.pack(job) and not os.path.lexists(private/'r3-outer-terminal.json'),'EXACT_ORIGINAL_REQUEST_REQUIRED')
  raw=c.read(private/'bundle/bundle-manifest.json');m=c.strict(raw);rows=m.get('files',[])
  self.need(c.sha(raw)==job.get('manifestSha256') and set(m)=={'taskId','jobId','files'} and m['taskId']=='T45' and m['jobId']==KEY and type(rows) is list and len(rows)==len(EXPECTED_BUNDLE)+1 and len({r['name'] for r in rows})==len(EXPECTED_BUNDLE)+1 and {r['name'] for r in rows}==set(EXPECTED_BUNDLE)|{'host-authorization.json'},'EXACT_FIVE_MEMBER_MANIFEST_REQUIRED')
  for row in rows:
   self.need(type(row) is dict and set(row)=={'name','bytes','sha256'} and row['name'] in set(EXPECTED_BUNDLE)|{'host-authorization.json'},'EXACT_MEMBER_SCHEMA_REQUIRED')
   body=c.read(private/'bundle'/row['name'],maximum=131072)
   pin=p['authoritySha256'] if row['name']=='host-authorization.json' else EXPECTED_BUNDLE[row['name']]
   self.need(type(row['bytes']) is int and len(body)==row['bytes'] and c.sha(body)==row['sha256']==pin,'REGISTERED_MEMBER_DIFFERS')
  a=c.strict(c.read(private/'bundle/host-authorization.json'))
  self.need(set(a)=={'format','requestKey','startsAt','expiresAt','sourceReviewSha256','scopeSha256','authorizationReference'} and a['format']==AUTHORITY_FORMAT and a['requestKey']==KEY and a['scopeSha256']==EXPECTED_BUNDLE['scope.json'] and a['sourceReviewSha256']==p['sourceReviewSha256'] and type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'EXACT_FINITE_AUTHORITY_REQUIRED')
  self.need(type(a['startsAt']) is type(a['expiresAt']) is int and p['startsAt']<=a['startsAt']<=stamp and stamp+300000<a['expiresAt']<=p['expiresAt'] and a['expiresAt']<=a['startsAt']+900000,'FINITE_READONLY_AUTHORITY_EXPIRED')
  return 'after45-businessroot-durable-readonly'
 def finish(self,phase):
  if phase=='after45-businessroot-durable-readonly':return None
  return self.prior.finish(phase)
