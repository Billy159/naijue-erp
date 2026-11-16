"""Main-only normal37 registration issuance after exact source reviews and fresh basis."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
HUMAN=ROOT/'outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json'
HUMAN_SHA='836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0'
DECISION=ROOT/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/PREPARE02-OUTER-NATIVE-IDENTITY-DECISION.json'
DECISION_SHA='65b363aa97539df158bacdc19fe1baa6e1f77ed7baf87f36f7131d0e68d05e39'
REF='Existing human controlled real import continuation; exact normal37 six-phase source and outer03/native01 SOURCE continuatione65 of historical decision65b363. No replay of used catalog, old failed PREPARE, input02 or ROOT06.'
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(v):return (json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def checked(p,pin):
 b=Path(p).read_bytes();assert sha(b)==pin,p;return b

def checked_consumer(witness,consumer_review_file,consumer_review_pin):
 consumer_pin=witness['consumerSourcePinsSha256'];directory=Path(witness['consumerSourceDirectory'])
 consumer=json.loads(checked(directory/'SOURCE-PINS.json',consumer_pin))
 assert consumer['serverActions']==consumer['PGConnections']==consumer['clockCalls']==0 and consumer['authoritiesIssued'] is False
 interface_pin='2cc567338e19f69c69f486f490cf6444d9a5553a1231912c9b815b5ff5b7bdab'
 assert consumer['interfaceSha256']==interface_pin
 interface=json.loads(checked(directory/'INTERFACE.UNISSUED.json',interface_pin))
 assert interface['serverActions']==interface['PGConnections']==0
 assert interface['clock'] is interface['dynamicAuthorities'] is interface['role37Authority'] is interface['current37ServiceProof'] is None
 cr=json.loads(checked(consumer_review_file,consumer_review_pin))
 assert cr['sourceOnly'] is True and cr['findings']==[] and cr['sourcePinsSha256']==consumer_pin
 assert cr['state']=='SOURCE_PASS_NORMAL37_CONSUMER_CURRENT_LOAD_CLOSURE_ONLY'
 assert cr['interfaceSha256']==interface_pin
 for leaf,row in consumer['files'].items():
  assert not Path(leaf).is_absolute() and '..' not in Path(leaf).parts
  raw=checked(directory/leaf,row['sha256']);assert len(raw)==row['bytes']
 return consumer,interface,cr

def checked_static_rules(witness,cas):
 # Consumer phase descriptors also contain transport metadata. Only these six
 # fields are policy rules; never forward authority placeholders or paths.
 fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'}
 directory=Path(witness['consumerSourceDirectory']);blueprint=json.loads(checked(directory/'PHASES37.UNISSUED.json','e5d260233bc169d5e35e1a45bd67f4554fb7f1cf0d73cb78b39d75424310dc1e'))
 assert set(witness['jobs'])==set(witness['phaseDirectories'])==set(blueprint['jobs'])==set(cas['JOBS'])
 result={};folders={}
 for phase in cas['JOBS']:
  consumer_rule=blueprint['jobs'][phase]
  assert set(consumer_rule)==fields|{'authoritySha256','rolesAuthoritySha256','sourceDirectory'}
  assert consumer_rule['authoritySha256'] is None
  assert consumer_rule['rolesAuthoritySha256']==(None if phase in ('apply','restore') else 'NOT_APPLICABLE')
  rule={k:consumer_rule[k] for k in fields}
  assert set(witness['jobs'][phase])==fields and rule==witness['jobs'][phase]==cas['EXPECTED_RULES'][phase]
  assert rule['jobId']==cas['JOBS'][phase] and rule['deadlineField']=='expiresAt'
  assert rule['timeoutSeconds']=={'apply':300,'start':300,'prepare':780,'writer':3000,'stop':120,'restore':300}[phase]
  folder=Path(witness['phaseDirectories'][phase]).resolve(strict=True)
  assert folder==directory/phase/'bundle' and consumer_rule['sourceDirectory']==str(folder)
  assert rule['script'] in rule['bundlePins'] and rule['authorityLeaf'] not in rule['bundlePins']
  for leaf,pin in rule['bundlePins'].items():checked(folder/leaf,pin)
  result[phase]=json.loads(json.dumps(rule));folders[phase]=folder
 return result,folders

def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 review=json.loads(checked(review_file,review_pin));source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 assert review['state']=='SOURCE_PASS_NORMAL37_ROOT_PAIR_ONLY' and review['sourceOnly'] is True and review['findings']==[]
 assert review['sourcePinsSha256']==sha(source_raw) and review['consumerReviewSha256']==consumer_review_pin
 for leaf,row in source['files'].items():checked(HERE/leaf,row['sha256'])
 witness_raw=(HERE/'SIX-PHASES.UNISSUED.json').read_bytes();witness=json.loads(witness_raw)
 assert review['rulesSha256']==sha(witness_raw)
 consumer_pin=witness['consumerSourcePinsSha256']
 checked_consumer(witness,consumer_review_file,consumer_review_pin)
 assert review['consumerSourcePinsSha256']==consumer_pin
 human=json.loads(checked(HUMAN,HUMAN_SHA));decision=json.loads(checked(DECISION,DECISION_SHA))
 assert human['messageId']=='01a1df2e-293d-7061-ab16-5b0cc2e0e753' and human['originThreadId']=='01a19f9f-97b5-7f81-b1ea-5479df73b469'
 assert decision['state']=='CONTROLLER_SOURCE_MAPPING_DECISION_NOT_EXECUTION_AUTHORITY'
 assert decision['outerAttemptRequestKey']=='t45-r3-final33-plan-prepare-20261116-02' and decision['nativeLogicalPreparationRequestKey']=='t45-r3-final33-plan-prepare-20261116-01'
 continuation_ref=witness['continuationDecision']
 assert continuation_ref=={'path':str(ROOT/'outputs/主控/20261117-r3-normal37-prepare03-source-continuation-decision-01/DECISION.json'),'sha256':'e65a97ede2b12d55e37368154e2731a21e02d200adf14cf2132e82bb488c36e8'}
 continuation=json.loads(checked(continuation_ref['path'],continuation_ref['sha256']))
 assert continuation['state']=='MAIN_SOURCE_CONTINUATION_DECISION_ONLY_NO_FINITE_AUTHORITY_OR_RUNTIME' and continuation['normalGeneration']==37
 assert continuation['historicalDecisionSha256']==DECISION_SHA and continuation['historicalDecisionOuterAttemptRequestKey']==decision['outerAttemptRequestKey']
 assert continuation['currentOuterAttemptRequestKey']==witness['jobs']['prepare']['jobId']==witness['preparationIdentityMapping']['outerPreparationAttemptKey']
 assert witness['preparationIdentityMapping']['nativeLogicalPreparationKey']==decision['nativeLogicalPreparationRequestKey'] and continuation['nativeLogicalRequestKeyPreservedFromHistoricalDecision'] is True
 assert continuation['writerRequestKey']==witness['jobs']['writer']['jobId'] and continuation['writerNeverSubmitted'] is True
 assert continuation['normal36ExactRestoreReadbackSha256']==witness['actualPriorClosedSha256'] and continuation['normal36SafeClosureSha256']==witness['actual36SafeClosureSha256']
 assert continuation['finiteAuthorityIssuedByThisRecord'] is False and continuation['reserveGiB']==28 and continuation['budgetsSecondsPreserved']==[300,780,3000,5100]
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='local_registration_source')
 basis=json.loads(checked(basis_file,basis_pin));jobs=cas['JOBS']
 assert basis['state']=='READONLY_NORMAL37_REGISTRATION_BASIS' and basis['predecessorClosureKind']=='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED'
 assert basis['basisMismatches']==[] and basis['executionLockMatches'] is True and basis['activeOperationUnits']==basis['presentCandidateKeys']==[]
 assert set(basis['candidateKeys'])==set(jobs.values())
 assert set(basis['oldIdentities'])=={str(p) for p in cas['BASIS']}|set(cas['CUSTODY_FILES'])|{'executionLock'}
 assert basis['oldIdentities']['executionLock']==cas['LOCK_ID'] and all(basis['actualPins'][str(p)]==pin for p,pin in cas['BASIS'].items())
 rules,folders=checked_static_rules(witness,cas)
 # No clock, future service, native authority or credential has been constructed above.
 captured=int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp()*1000)
 now=time.time_ns()//1000000;grant_limit=int(basis['grantExpiresAtEpoch']*1000)
 assert 0<=now-captured<=900000 and now+10800000<=grant_limit,'FRESH_ORIGINAL_BASIS_AND_FULL_FINITE_WINDOW_REQUIRED'
 role_file=folders['apply']/'ordinary05_roles.py';host_file=folders['apply']/'ordinary05_roles_job.py'
 assert role_file.read_bytes()==(folders['restore']/role_file.name).read_bytes() and host_file.read_bytes()==(folders['restore']/host_file.name).read_bytes()
 role=runpy.run_path(str(role_file),run_name='main_authority_issuer');host=runpy.run_path(str(host_file),run_name='main_authority_issuer')
 roles=dict(role['scope'](),startsAt=now,expiresAt=now+1800000,controllerValidUntil=now+7200000,backupAdminValidUntil=now+7320000,restorationDeadline=now+9000000,authorizationReference=REF,rolesSourceSha256=sha(role_file.read_bytes()),independentReviewSha256=review_pin)
 role['validate'](roles,now);role_raw=encode(roles)
 apply=dict(host['scope']('apply'),startsAt=now,expiresAt=roles['expiresAt'],authorizationReference=REF,independentReviewSha256=review_pin,rolesAuthoritySha256=sha(role_raw),rolesSourceSha256=roles['rolesSourceSha256'],hostSourceSha256=sha(host_file.read_bytes()))
 host['validate'](apply,'apply',now)
 for phase in ('apply','restore'):rules[phase]['bundlePins']['roles-authorization.json']=sha(role_raw)
 policy=dict(format='T45_R3_DIRECT33_BATCHED_REAL_V1',grantId=cas['GRANT'],startsAt=now,expiresAt=now+10800000,jobs=rules)
 cas['validate_policy_delta'](policy,{'grantId':cas['GRANT']})
 files={'module':(HERE/'r3_direct37_aux_prepare.py').read_bytes(),'policy':encode(policy),'dispatcherTemplate':(HERE/'admin_exec.NORMAL37-UNREGISTERED.py').read_bytes()};dispatcher=cas['render'](files)
 authorization=dict(cas['scope'](),sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v) for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+900000,authorizationReference=REF,independentReviewSha256=review_pin)
 raw=encode(authorization);carrier=(HERE/'original-cas-normal37-carrier.UNISSUED.py').read_text()
 assert "SOURCE="+repr(sha((HERE/'register_cas.py').read_bytes())) in carrier
 for name,value in [('AUTH_SHA_LITERAL',repr(sha(raw))),('AUTH_START_LITERAL',str(now)),('AUTH_EXPIRES_LITERAL',str(authorization['expiresAt']))]:assert carrier.count(name)==1;carrier=carrier.replace(name,value)
 compile(carrier,'original-cas-normal37-carrier.ISSUED.py','exec')
 report=dict(state='ISSUED_NORMAL37_SIX_PHASE_REGISTRATION_NO_PHASE_SUBMITTED',directory=str(Path(output_directory).resolve()),startsAt=now,registrationExpiresAt=authorization['expiresAt'],roleApplyExpiresAt=roles['expiresAt'],controllerValidUntil=roles['controllerValidUntil'],backupAdminValidUntil=roles['backupAdminValidUntil'],restorationDeadline=roles['restorationDeadline'],policyExpiresAt=policy['expiresAt'],rulesSha256=sha(witness_raw),basisSha256=basis_pin,independentReviewSha256=review_pin,consumerSourcePinsSha256=consumer_pin,consumerReviewSha256=consumer_review_pin,rolesSha256=sha(role_raw),applyHostSha256=sha(encode(apply)),policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),registrationSha256=sha(raw),carrierSha256=sha(carrier.encode()),jobs=jobs,phaseSubmitted=False)
 b64=lambda x:base64.b64encode(x).decode();envelope={'source':b64((HERE/'register_cas.py').read_bytes()),'packet':{'authorization':b64(raw),'files':{k:b64(v) for k,v in files.items()}}}
 output=Path(output_directory).resolve();assert output.parent==ROOT/'outputs/主控' and not output.exists();output.mkdir(mode=0o700)
 for name,body in {'roles-authorization.json':role_raw,'host-authorization.json':encode(apply),'direct37-batched-real.json':files['policy'],'admin_exec.ISSUED.py':dispatcher,'registration-authorization.json':raw,'registration-envelope.json':encode(envelope),'original-cas-normal37-carrier.ISSUED.py':carrier.encode(),'ISSUED.json':encode(report)}.items():
  with (output/name).open('xb') as f:f.write(body)
 return report
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:]),sort_keys=True))
