"""Main-only finite issuer, defined but uncalled in SOURCE preparation."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,os,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
WINDOW=ROOT/'outputs/主控/20261117-r3-root08-source-materialization-window-01'
KEY='t45-r3-batched-root08-source-delta-20261117-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
pack=lambda value:(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return raw
def issue_once(review_file,review_pin,closure_file,closure_pin,registry_file,registry_pin,authorization_reference):
 # No static SOURCE result or saved clock can authorize this call.
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 verified={}
 for leaf,row in source['files'].items():
  raw=checked(HERE/leaf,row['sha256']);assert len(raw)==row['bytes'];verified[leaf]=raw
 static=json.loads(verified['STATIC-INPUTS.json'])
 review=json.loads(checked(review_file,review_pin))
 assert review['sourceOnly']is True and review['findings']==[]and review['sourcePinsSha256']==sha(source_raw)
 assert review['consumerSourcePinsSha256']==static['consumerSourcePinsSha256']and review['consumerReviewSha256']==static['consumerReviewSha256']
 assert review['rootPairReviewComplete']is True
 closure=json.loads(checked(closure_file,closure_pin));registry=json.loads(checked(registry_file,registry_pin))
 assert closure['state']=='ACTUAL_DIAGNOSTIC_COMPLETED_CLEANED_PG_STOPPED_SOURCE_ONLY_BASIS'
 assert closure['requestKey']=='t45-r3-core0-durable-readonly-20261117-02'
 actual=static['requiredActualDiagnosticClosure']
 assert all(closure[k]==actual[k]for k in ('terminalSha256','resultSha256','cleanupSha256','actualContainerId'))
 recovery=static['actualDiagnosticEvidence']['recoveryDecision']
 decision=json.loads(checked(recovery['path'],recovery['sha256']))
 assert decision['actualRootDispatcherSha256']==static['baselineRootPins']['dispatcher']and decision['actualTerminal']==actual['terminalSha256']
 assert decision['SQLUpgradeAlreadyPerformed']is False and decision['originalFailedWriterPermanentlyConsumed']is True
 assert all(closure[k]is True for k in ('completed','cleanupConfirmed','actualContainerStopped','pgdataPidAbsent'))
 assert closure['PGConnections']==closure['mutations']==0 and closure['SQLUpgradePerformed']is False and closure['authenticationSnapshotBodiesRead']is False
 assert all(type(closure[k])is str and len(closure[k])==64 for k in ('terminalSha256','resultSha256','cleanupSha256'))
 assert registry['dispatcherSha256']==static['baselineRootPins']['dispatcher']and registry['PGConnections']==registry['mutations']==0 and registry['registryOrJobSubmitted']is False
 # The SOURCE has exact current safe root files and custody path set. Their
 # actual identities are only provided by the real paired read after cleanup.
 code=verified['register_exact.py'].decode()
 import ast
 tree=ast.parse(code);ns={'Path':Path}
 for node in tree.body:
  if isinstance(node,ast.Assign)and any(isinstance(t,ast.Name)and t.id in ('B','C','P','H','LOCK','LOCK_ID','OLD','PRESERVE','CUSTODY')for t in node.targets):
   exec(compile(ast.Module(body=[node],type_ignores=[]),'root08-static-paths','exec'),ns)
  elif isinstance(node,ast.Expr)and isinstance(node.value,ast.Call)and isinstance(node.value.func,ast.Attribute)and isinstance(node.value.func.value,ast.Name)and node.value.func.value.id=='PRESERVE':
   exec(compile(ast.Module(body=[node],type_ignores=[]),'root08-static-paths','exec'),ns)
 identities=registry['oldIdentities']
 assert set(identities)==set(ns['PRESERVE'])|{str(p)for p in ns['CUSTODY']}|{'executionLock'}
 assert closure['custodyStat9']=={str(path):identities[str(path)]for path in ns['CUSTODY']}
 assert identities['executionLock']==list(ns['LOCK_ID'])
 assert closure['custodyStat9']=={str(p):identities[str(p)]for p in ns['CUSTODY']}
 for path,values in identities.items():
  assert type(values)is list and len(values)==9 and all(type(n)is int and n>=0 for n in values)
  if path!='executionLock':assert values[2]==0 and not values[4]&0o022 and values[5]==1 and 0<values[6]<=131072
 closure_time=datetime.fromisoformat(closure['checkedAtUTC']);registry_time=datetime.fromisoformat(registry['checkedAtUTC'])
 assert closure_time.tzinfo is not None and registry_time.tzinfo is not None
 assert type(authorization_reference)is str and 0<len(authorization_reference)<=512 and not WINDOW.exists()
 scope=static['sourceScope'];bundle=static['bundle']
 module=verified['r3_root08_source_admission.py'];template=verified['admin_exec.ROOT08-UNREGISTERED.py']
 # All static source, review and actual paired-basis checks precede Main's clock.
 stamp=time.time_ns()//1000000
 assert 0<=stamp-int(closure_time.timestamp()*1000)<=120000 and 0<=stamp-int(registry_time.timestamp()*1000)<=120000
 expires=stamp+900000
 assert expires<=int(registry['grantExpiresAtEpoch']*1000)
 authority=dict(scope,startsAt=stamp,expiresAt=expires,authorizationReference=authorization_reference,independentReviewSha256=review_pin,sourceSha256=bundle['materialize-batched-source.py']['sha256'])
 authority_raw=pack(authority)
 policy={'format':'T45_ROOT08_SOURCE_ONLY_REGISTERED_V1','requestKey':KEY,'startsAt':stamp,'expiresAt':expires,
  'authoritySha256':sha(authority_raw),'sourceReviewSha256':review_pin,'consumerReviewSha256':static['consumerReviewSha256'],
  'baselineRootPins':static['baselineRootPins'],'bundlePins':{k:v['sha256']for k,v in bundle.items()},'bundleBytes':{k:v['bytes']for k,v in bundle.items()},
  'freshBasisPins':{'closure':closure_pin,'registry':registry_pin},
  'diagnosticClosedPins':{k:closure[k]for k in ('terminalSha256','resultSha256','cleanupSha256')}}
 policy_raw=pack(policy);files={'module':module,'policy':policy_raw,'dispatcherTemplate':template}
 registration={'format':'T45_ROOT08_SOURCE_REGISTRATION_ONLY_V1','requestKey':KEY,'sourceSha256':sha(verified['register_exact.py']),
  'sourcePins':{k:sha(v)for k,v in files.items()},'oldIdentities':identities,'startsAt':stamp,'expiresAt':stamp+300000,
  'independentReviewSha256':review_pin,'authorizationReference':authorization_reference}
 registration_raw=pack(registration)
 packet={'authorization':base64.b64encode(registration_raw).decode(),'files':{k:base64.b64encode(v).decode()for k,v in files.items()}}
 WINDOW.mkdir(mode=0o700,exist_ok=False)
 output={'materialize-authorization.json':authority_raw,'registered-policy.json':policy_raw,'registration-authorization.json':registration_raw,'registration-packet.json':pack(packet)}
 for name,raw in output.items():
  with (WINDOW/name).open('xb')as f:os.fchmod(f.fileno(),0o600);f.write(raw);f.flush();os.fsync(f.fileno())
 issued={'state':'MAIN_ROOT08_FINITE_SOURCE_AUTHORITY_ISSUED_NOT_REGISTERED_OR_EXECUTED','requestKey':KEY,
  'sourcePinsSha256':sha(source_raw),'reviewSha256':review_pin,'closureBasisSha256':closure_pin,'registryBasisSha256':registry_pin,
  'startsAt':stamp,'expiresAt':expires,'authoritySha256':sha(authority_raw),'policySha256':sha(policy_raw),
  'registrationAuthoritySha256':sha(registration_raw),'registryCASExecuted':False,'materializationSubmitted':False,'SQLExecuted':False}
 (WINDOW/'ISSUED.json').write_bytes(pack(issued));return issued
