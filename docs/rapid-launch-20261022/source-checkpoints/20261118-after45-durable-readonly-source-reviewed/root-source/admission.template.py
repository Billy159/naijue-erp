"""One new exact readonly admission; no authority issuance or server mutation."""
from pathlib import Path
import os,time
KEY='t45-r3-original-businessroot-durable-after45-readonly-20261118-01'
POLICY_NAME='after45-businessroot-durable-readonly-20261118-01.json'
EXPECTED_BUNDLE=None

from types import ModuleType
import subprocess
HISTORY=__HISTORY__
POLICY_FORMAT=__POLICY_FORMAT__
AUTHORITY_FORMAT=__AUTHORITY_FORMAT__
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
