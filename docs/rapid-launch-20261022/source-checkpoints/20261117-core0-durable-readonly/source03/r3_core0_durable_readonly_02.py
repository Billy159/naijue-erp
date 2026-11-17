"""One new exact readonly admission; no authority issuance or server mutation."""
from pathlib import Path
import os,time
KEY='t45-r3-core0-durable-readonly-20261117-02'
POLICY_NAME='core0-durable-readonly-20261117-02.json'
EXPECTED_BUNDLE={'scope.json': 'd81d73ddf34b406ebc3f4e70616234c5785dbdaef163990848bcaf8e0f180810', 'prior-diagnostic01-failure.json': 'be9c9c6c8d74f5c363c9645fde1b775eb3a2b619a3a9e4c757f2935aaf72b6f7', 'durable-readonly.sql': '1e1ece61f3fc9bd727219b747a1a5eda8f6230f5497c00042950d75dba270c3d', 'durable_readonly_job.py': 'b65ce7f0e750f5767383979ec63157f7d7413d1e453909c19c4c6f7e54e71f38'}
class DurableReadonly02Continuation:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg
  self.root=prior.root
  self.need(core.digest(policy_pin),'NEW_DIAGNOSTIC_POLICY_NOT_REGISTERED')
  raw=core.read(self.root/POLICY_NAME);self.need(core.sha(raw)==policy_pin,'REGISTERED_DIAGNOSTIC_POLICY_DIFFERS')
  p=self.policy=core.strict(raw)
  self.need(set(p)=={'format','requestKey','startsAt','expiresAt','authoritySha256','sourceReviewSha256','bundlePins'} and p['format']=='T45_R3_CORE0_DURABLE_READONLY_REGISTERED_V1' and p['requestKey']==KEY and p['bundlePins']==EXPECTED_BUNDLE and core.digest(p['authoritySha256']) and core.digest(p['sourceReviewSha256']),'ONE_EXACT_DIAGNOSTIC_POLICY_REQUIRED')
  self.need(type(p['startsAt']) is type(p['expiresAt']) is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'DIAGNOSTIC_WINDOW_OUTSIDE_ORIGINAL_GRANT')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_DURABLE02_'+code)
 def admit(self,job,private):
  if job.get('jobId')!=KEY:return self.prior.admit(job,private)
  c,p=self.core,self.policy;stamp=time.time_ns()//1000000
  self.need(private==self.private(KEY) and job.get('taskId')=='T45' and job.get('grantId')==c.GRANT and job.get('scope')==self.cfg['scope'] and job.get('script')=='durable_readonly_job.py' and type(job.get('timeoutSeconds')) is int and job['timeoutSeconds']==300 and job.get('args')==[p['authoritySha256']] and c.pack(c.strict(c.read(private/'request.json')))==c.pack(job) and not os.path.lexists(private/'r3-outer-terminal.json'),'EXACT_ORIGINAL_REQUEST_REQUIRED')
  raw=c.read(private/'bundle/bundle-manifest.json');m=c.strict(raw);rows=m.get('files',[])
  self.need(c.sha(raw)==job.get('manifestSha256') and set(m)=={'taskId','jobId','files'} and m['taskId']=='T45' and m['jobId']==KEY and type(rows) is list and len(rows)==5 and len({r['name'] for r in rows})==5 and {r['name'] for r in rows}==set(EXPECTED_BUNDLE)|{'host-authorization.json'},'EXACT_FIVE_MEMBER_MANIFEST_REQUIRED')
  for row in rows:
   self.need(type(row) is dict and set(row)=={'name','bytes','sha256'} and row['name'] in set(EXPECTED_BUNDLE)|{'host-authorization.json'},'EXACT_MEMBER_SCHEMA_REQUIRED')
   body=c.read(private/'bundle'/row['name'],maximum=131072)
   pin=p['authoritySha256'] if row['name']=='host-authorization.json' else EXPECTED_BUNDLE[row['name']]
   self.need(type(row['bytes']) is int and len(body)==row['bytes'] and c.sha(body)==row['sha256']==pin,'REGISTERED_MEMBER_DIFFERS')
  a=c.strict(c.read(private/'bundle/host-authorization.json'))
  self.need(set(a)=={'format','requestKey','startsAt','expiresAt','sourceReviewSha256','scopeSha256','authorizationReference'} and a['format']=='T45_R3_CORE0_DURABLE_READONLY_AUTHORITY_V1' and a['requestKey']==KEY and a['scopeSha256']==EXPECTED_BUNDLE['scope.json'] and a['sourceReviewSha256']==p['sourceReviewSha256'] and type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'EXACT_FINITE_AUTHORITY_REQUIRED')
  self.need(type(a['startsAt']) is type(a['expiresAt']) is int and p['startsAt']<=a['startsAt']<=stamp and stamp+300000<a['expiresAt']<=p['expiresAt'] and a['expiresAt']<=a['startsAt']+900000,'FINITE_READONLY_AUTHORITY_EXPIRED')
  return 'durable-core0-readonly-02'
 def finish(self,phase):
  if phase=='durable-core0-readonly-02':return None
  return self.prior.finish(phase)
