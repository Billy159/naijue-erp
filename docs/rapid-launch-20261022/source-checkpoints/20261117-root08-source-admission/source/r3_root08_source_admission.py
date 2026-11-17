"""One exact Root08 SOURCE admission; inherited paths/keys remain with prior."""
from pathlib import Path
import os,time
KEY='t45-r3-batched-root08-source-delta-20261117-01'
POLICY_NAME='root08-source-only-20261117-01.json'
BUNDLE={'delta-00.asset.json': {'bytes': 74255, 'sha256': '3647d994a1073dab052e74aeb02c28cffc90d67849414f27cb16898000234c58'}, 'delta-01.asset.json': {'bytes': 22126, 'sha256': '5dc3bd6b6d28d537ec27e306b7f2be329750fcbf57e8edacd0e83adcc09dafc3'}, 'delta-02.asset.json': {'bytes': 105967, 'sha256': '5e4f50a53cc93f96271b1fee3956b8f14f4607db5dbab46c28eb97f02e0d46aa'}, 'delta-03.asset.json': {'bytes': 7213, 'sha256': 'daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'}, 'delta-04.asset.json': {'bytes': 939487, 'sha256': 'a49a6127ad7575c9739a2f130914afdd20fa73392e4f2c1160a17339d089a180'}, 'delta-05.asset.json': {'bytes': 975343, 'sha256': 'af82ab642d959ecf731697e8bc97618e97ce6d30bb945205ee1c1314323363c9'}, 'delta-06.asset.json': {'bytes': 977195, 'sha256': '80c31dcb7ab64ab436e07c2e4a2a1297e11d2c22a58e4dec1ddacda704a9a2c8'}, 'delta-07.asset.json': {'bytes': 5692, 'sha256': 'faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19'}, 'materialize-batched-source.py': {'bytes': 14019, 'sha256': 'f144ef127c352801601d7b94968d3a99870ddfdbd6a08a9c0b93162eb3933c99'}, 'source-profile.json': {'bytes': 6928, 'sha256': '5445b6ba2363d4f59a04edb927d91ef145873ce31a8266ea781955618b746ec6'}, 'source-rows.json': {'bytes': 72609, 'sha256': '3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'}}
ALIASES={'delta-00.asset.json': 'delta-00.asset', 'delta-01.asset.json': 'delta-01.asset', 'delta-02.asset.json': 'delta-02.asset', 'delta-03.asset.json': 'delta-03.asset', 'delta-04.asset.json': 'delta-04.asset', 'delta-05.asset.json': 'delta-05.asset', 'delta-06.asset.json': 'delta-06.asset', 'delta-07.asset.json': 'delta-07.asset'}
SCOPE={'dataIdentity': [66304, 13502421, 61035, 61035, 448], 'decision': 'MATERIALIZE_EXACT_FROZEN_SOURCE_ONLY_NO_DATABASE_OR_SERVICE', 'format': 'T45_R3_BATCHED_SOURCE_MATERIALIZATION_V1', 'grantId': 'b16447fbc81f4d64', 'maximumOperationSeconds': 300, 'minimumAvailableAfterBytes': 30064771072, 'outputDirectory': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01', 'requestKey': 't45-r3-batched-root08-source-delta-20261117-01', 'sourceDescriptionSha256': '5445b6ba2363d4f59a04edb927d91ef145873ce31a8266ea781955618b746ec6'}
BASELINE={'diagnostic02Module': 'f6aca8ef0f69f606a8166264c634c5ae44d6e0070c17851a87d02bc1405e3257', 'diagnostic02Policy': '4b9e9042efe499a2aff77b93360493d3e00ab505b81f58712410c2e019e50cc5', 'diagnosticModule': '0fb16f260ce868b68cc49b20b7ea723c5426a9342ba4aa79200d7dda1ab6d10f', 'diagnosticPolicy': 'b1f6bebd87b049d35f833b1fb6798e945be787294b9451bfa05232d5516497d3', 'dispatcher': 'b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'}
PUBLIC=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
CONSUMER_REVIEW='abfa3e0957368558fd96c7e1130302621f63998eb0216fc3896196e7c1ef39af'
class Root08SourceAdmission:
 def __init__(self,core,prior,cfg,policy_pin):
  self.core,self.prior,self.cfg=core,prior,cfg;self.root=prior.root
  self.need(core.digest(policy_pin),'SOURCE_POLICY_NOT_REGISTERED')
  raw=core.read(self.root/POLICY_NAME);self.need(core.sha(raw)==policy_pin,'REGISTERED_SOURCE_POLICY_DIFFERS')
  p=self.policy=core.strict(raw)
  self.need(set(p)=={'format','requestKey','startsAt','expiresAt','authoritySha256','sourceReviewSha256','consumerReviewSha256','baselineRootPins','bundlePins','bundleBytes','freshBasisPins','diagnosticClosedPins'}
   and p['format']=='T45_ROOT08_SOURCE_ONLY_REGISTERED_V1'and p['requestKey']==KEY
   and p['baselineRootPins']==BASELINE and p['consumerReviewSha256']==CONSUMER_REVIEW
   and p['bundlePins']=={k:v['sha256']for k,v in BUNDLE.items()}
   and p['bundleBytes']=={k:v['bytes']for k,v in BUNDLE.items()}
   and core.digest(p['authoritySha256'])and core.digest(p['sourceReviewSha256'])
   and set(p['freshBasisPins'])=={'closure','registry'}and all(core.digest(x)for x in p['freshBasisPins'].values()),'EXACT_SOURCE_POLICY_REQUIRED')
  self.need(set(p['diagnosticClosedPins'])=={'terminalSha256','resultSha256','cleanupSha256'}
   and all(core.digest(x)for x in p['diagnosticClosedPins'].values()),'ACTUAL_DIAGNOSTIC02_CLOSURE_PINS_REQUIRED')
  self.need(type(p['startsAt'])is type(p['expiresAt'])is int and 0<p['startsAt']<p['expiresAt']<=p['startsAt']+900000 and p['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FINITE_WINDOW_OUTSIDE_GRANT')
  self.need(core.sha(core.read(PUBLIC/'r3_core0_durable_readonly.py'))==BASELINE['diagnosticModule']
   and core.sha(core.read(self.root/'core0-durable-readonly-20261117-01.json'))==BASELINE['diagnosticPolicy']
   and core.sha(core.read(PUBLIC/'r3_core0_durable_readonly_02.py'))==BASELINE['diagnostic02Module']
   and core.sha(core.read(self.root/'core0-durable-readonly-20261117-02.json'))==BASELINE['diagnostic02Policy'],'REGISTERED_DIAGNOSTIC_BRANCH_CHANGED')
 def __getattr__(self,name):return getattr(self.prior,name)
 def need(self,ok,code):self.core.need(ok,'R3_CONTINUITY_ROOT08_SOURCE_'+code)
 def admit(self,job,private):
  if job.get('jobId')!=KEY:return self.prior.admit(job,private)
  c,p=self.core,self.policy;stamp=time.time_ns()//1000000
  self.need(private==self.private(KEY)and job.get('taskId')=='T45'and job.get('grantId')==c.GRANT
   and job.get('scope')==self.cfg['scope']and job.get('script')=='materialize-batched-source.py'
   and type(job.get('timeoutSeconds'))is int and job['timeoutSeconds']==300 and job.get('args')==[p['authoritySha256']]
   and c.pack(c.strict(c.read(private/'request.json')))==c.pack(job)
   and not os.path.lexists(private/'r3-outer-terminal.json'),'EXACT_ONCE_SOURCE_REQUEST_REQUIRED')
  bundle=private/'bundle';raw=c.read(bundle/'bundle-manifest.json');m=c.strict(raw);rows=m.get('files',[])
  names=set(BUNDLE)|{'materialize-authorization.json'}
  self.need(c.sha(raw)==job.get('manifestSha256')and set(m)=={'taskId','jobId','files'}and m['taskId']=='T45'and m['jobId']==KEY
   and type(rows)is list and len(rows)==len(names)and len({r['name']for r in rows})==len(names)
   and {r['name']for r in rows}==names and {x.name for x in bundle.iterdir()}==names|{'bundle-manifest.json'},'EXACT_TWELVE_MEMBER_MANIFEST_REQUIRED')
  buffers={}
  for row in rows:
   self.need(type(row)is dict and set(row)=={'name','bytes','sha256'}and row['name']in names,'EXACT_MEMBER_SCHEMA_REQUIRED')
   body=c.read(bundle/row['name'],maximum=4*1024**2)
   pin=p['authoritySha256']if row['name']=='materialize-authorization.json'else BUNDLE[row['name']]['sha256']
   self.need(type(row['bytes'])is int and len(body)==row['bytes']and c.sha(body)==row['sha256']==pin
    and(row['name']=='materialize-authorization.json'or row['bytes']==BUNDLE[row['name']]['bytes']),'EXACT_SOURCE_MEMBER_DIFFERS')
   buffers[row['name']]=body
  a=c.strict(buffers['materialize-authorization.json'])
  self.need(set(a)==set(SCOPE)|{'startsAt','expiresAt','authorizationReference','independentReviewSha256','sourceSha256'}
   and all(a[k]==v for k,v in SCOPE.items())and a['sourceSha256']==BUNDLE['materialize-batched-source.py']['sha256']
   and a['independentReviewSha256']==p['sourceReviewSha256']and type(a['authorizationReference'])is str
   and 0<len(a['authorizationReference'])<=512,'EXACT_FINITE_SOURCE_AUTHORITY_REQUIRED')
  self.need(type(a['startsAt'])is type(a['expiresAt'])is int and p['startsAt']<=a['startsAt']<=stamp
   and stamp+300000<a['expiresAt']<=p['expiresAt'],'FINITE_SOURCE_WINDOW_EXPIRED')
  diagnostic=private.parent/'t45-r3-core0-durable-readonly-20261117-02'
  for name,leaf in {'terminalSha256':'r3-outer-terminal.json','resultSha256':'results/durable-readonly-result.json','cleanupSha256':'results/durable-readonly-cleanup.json'}.items():
   self.need(c.sha(c.read(diagnostic/leaf))==p['diagnosticClosedPins'][name],'ACTUAL_DIAGNOSTIC02_CLOSURE_CHANGED')
  # The original client/dispatcher accept these exact *.json transport names.
  # Only after all bytes and authority validate, add byte-identical canonical
  # *.asset files required by the separately reviewed frozen consumer.
  self.need(all(not os.path.lexists(bundle/name)for name in ALIASES.values()),'SOURCE_ASSET_ALIAS_ALREADY_PRESENT')
  for transport,canonical in ALIASES.items():
   raw=buffers[transport]
   with os.fdopen(os.open(bundle/canonical,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
    self.need(f.write(raw)==len(raw),'SOURCE_ALIAS_SHORT_WRITE');f.flush();os.fsync(f.fileno())
  fd=os.open(bundle,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(fd)
  finally:os.close(fd)
  return 'root08-source-materialize'
 def finish(self,phase):
  if phase=='root08-source-materialize':return None
  return self.prior.finish(phase)
