"""Main-only normal39 registration/roles issuance, after final paired source + fresh basis."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,runpy,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
HUMAN=ROOT/'outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json'
HUMAN_SHA='836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0'
DECISION=ROOT/'outputs/主控/20261117-r3-normal39-prepare05-source-continuation-decision-01/DECISION.json'
DECISION_SHA='247e9972441b302fbd6d6399b978792e08a9a834c24b33f7565588c933ed9a4b'
WIP_PENDING=False
REF='Existing human REAL continuation; exact normal39/outer05/native01 after actual closed38 and completed ROOT07. No replay INPUT02/ROOT06/ROOT07/install32/catalog35/failed01-04, no renewal of completed source authority.'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(v):return(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw

def checked_consumer(witness,consumer_review_file,consumer_review_pin):
 folder=Path(witness['consumerSourceDirectory']);source=json.loads(checked(folder/'SOURCE-PINS.json',witness['consumerSourcePinsSha256']))
 assert source['sourceOnly']is True and source['serverActions']==source['PGConnections']==source['clockCalls']==0 and source['authoritiesIssued']is False
 interface=json.loads(checked(folder/'INTERFACE.UNISSUED.json',witness['consumerInterfaceSha256']))
 assert source['interfaceSha256']==witness['consumerInterfaceSha256']and source['rulesSha256']==witness['consumerRulesSha256']
 assert interface['clock']is interface['dynamicAuthorities']is interface['role39Authority']is interface['current39ServiceProof']is None
 review=json.loads(checked(consumer_review_file,consumer_review_pin))
 assert review['sourceOnly']is True and review['findings']==[]and review['state'].startswith('SOURCE_PASS_NORMAL39_')
 assert review['sourcePinsSha256']==witness['consumerSourcePinsSha256']and review['interfaceSha256']==witness['consumerInterfaceSha256']
 return folder,source,interface

def checked_static_rules(witness,cas,decision,folder,interface):
 blueprint=json.loads(checked(folder/'PHASES39.UNISSUED.json',witness['consumerRulesSha256']))
 mapping=dict(outerPreparationAttemptKey=decision['outerPreparationAttemptKey'],nativeLogicalPreparationKey=decision['nativeLogicalPreparationRequestKey'],businessWriterRequestKey=decision['businessWriterRequestKey'],batchPlanPath=decision['batchPlanPath'])
 assert blueprint['preparationIdentityMapping']==interface['preparationIdentityMapping']==witness['preparationIdentityMapping']==mapping
 assert witness['jobs']==interface['jobs']==decision['jobs']==cas['STATIC']['jobs']=={k:r['jobId']for k,r in blueprint['jobs'].items()}
 fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'};rules={};folders={}
 for phase,item in blueprint['jobs'].items():
  assert set(item)==fields|{'authoritySha256','rolesAuthoritySha256','sourceDirectory'}and item['authoritySha256']is None
  assert item['rolesAuthoritySha256']==(None if phase in ('apply','restore')else'NOT_APPLICABLE')
  rule={k:item[k]for k in fields};assert rule==cas['STATIC']['expectedRules'][phase]
  directory=Path(witness['phaseDirectories'][phase]).resolve(strict=True)
  assert directory==folder/phase/'bundle'and directory==Path(item['sourceDirectory'])
  assert rule['script']in rule['bundlePins']and rule['authorityLeaf']not in rule['bundlePins']
  for leaf,pin in rule['bundlePins'].items():checked(directory/leaf,pin)
  rules[phase]=json.loads(json.dumps(rule));folders[phase]=directory
 return rules,folders

def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 assert WIP_PENDING is False,'NORMAL39_FINAL_PAIR_REQUIRED'
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw);review=json.loads(checked(review_file,review_pin))
 assert review['sourceOnly']is True and review['findings']==[]and review['state'].startswith('SOURCE_PASS_NORMAL39_')
 assert review['sourcePinsSha256']==sha(source_raw)and review['consumerReviewSha256']==consumer_review_pin
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 witness_raw=(HERE/'SIX-PHASES.UNISSUED.json').read_bytes();witness=json.loads(witness_raw)
 assert review['rulesSha256']==sha(witness_raw)and review['consumerSourcePinsSha256']==witness['consumerSourcePinsSha256']
 human=json.loads(checked(HUMAN,HUMAN_SHA));assert human['messageId']=='01a1df2e-293d-7061-ab16-5b0cc2e0e753'
 decision=json.loads(checked(DECISION,DECISION_SHA));assert decision['state']=='MAIN_NORMAL39_PREPARE05_SOURCE_CONTINUATION_ONLY_NO_FINITE_AUTHORITY_OR_RUNTIME'
 assert witness['continuationDecision']=={'path':str(DECISION),'sha256':DECISION_SHA}
 assert decision['businessWriterNeverSubmitted']is True and decision['finiteAuthorityIssued']is False and decision['normalGeneration']==39
 assert witness['root07MaterializationAlreadyCompleted']is True and witness['root07NeverResubmit']is True
 assert witness['sourceLineage']==dict(lineageSha256=decision['sourceLineage']['proofSha256'],materializationTerminalSha256=decision['actualRoot07']['terminalSha256'],materializationResultSha256=decision['actualRoot07']['rootResultAndOperatorReadySha256'],materializationPublicResultSha256=decision['actualRoot07']['publicResultSha256'])
 folder,consumer,interface=checked_consumer(witness,consumer_review_file,consumer_review_pin)
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main_normal39_registration_source')
 rules,folders=checked_static_rules(witness,cas,decision,folder,interface)
 basis=json.loads(checked(basis_file,basis_pin))
 assert basis['state']=='READONLY_NORMAL39_REGISTRATION_BASIS'and basis['executionLockMatches']is True and basis['basisMismatches']==[]
 assert basis['activeOperationUnits']==basis['presentCandidateKeys']==[]and set(basis['candidateKeys'])==set(witness['jobs'].values())
 assert basis['actual38StoppedAndOriginalAuthRestored']is basis['root07AlreadyCompleted']is basis['original38AckSHAReadBackMatchesDerivedExpected']is True
 assert basis['authenticationSnapshotBodiesOrDigestsRead']is False and basis['actualPins']==cas['STATIC']['basis']
 assert set(basis['oldIdentities'])==set(cas['STATIC']['basis'])|set(cas['STATIC']['privateCustodyStatOnly'])|{'executionLock'}
 assert basis['oldIdentities']['executionLock']==cas['LOCK_ID']
 for name,expected in cas['STATIC']['privateCustodyStatOnly'].items():
  ident=basis['oldIdentities'][name];assert len(ident)==9 and dict(device=ident[0],inode=ident[1],uid=ident[2],gid=ident[3],mode=ident[4],bytes=ident[6])==expected and ident[5]==1
 role_file=folders['apply']/'ordinary05_roles.py';host_file=folders['apply']/'ordinary05_roles_job.py'
 assert role_file.read_bytes()==(folders['restore']/role_file.name).read_bytes()and host_file.read_bytes()==(folders['restore']/host_file.name).read_bytes()
 role=runpy.run_path(str(role_file),run_name='main_normal39_role_issuer');host=runpy.run_path(str(host_file),run_name='main_normal39_apply_issuer')
 captured=int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp()*1000)
 # Main is the only caller: no clock until complete source, reviews, actual basis and bytes match.
 now=time.time_ns()//1000000;limit=int(basis['grantExpiresAtEpoch']*1000)
 assert 0<=now-captured<=900000 and now+10800000<=limit,'FRESH_BASIS_AND_FULL_NORMAL39_WINDOW_REQUIRED'
 roles=dict(role['scope'](),startsAt=now,expiresAt=now+1800000,controllerValidUntil=now+7200000,backupAdminValidUntil=now+7320000,restorationDeadline=now+9000000,authorizationReference=REF,rolesSourceSha256=sha(role_file.read_bytes()),independentReviewSha256=review_pin)
 role['validate'](roles,now);role_raw=encode(roles)
 apply=dict(host['scope']('apply'),startsAt=now,expiresAt=roles['expiresAt'],authorizationReference=REF,independentReviewSha256=review_pin,rolesAuthoritySha256=sha(role_raw),rolesSourceSha256=roles['rolesSourceSha256'],hostSourceSha256=sha(host_file.read_bytes()))
 host['validate'](apply,'apply',now)
 for phase in ('apply','restore'):rules[phase]['bundlePins']['roles-authorization.json']=sha(role_raw)
 policy=dict(format='T45_R3_NORMAL39_BATCHED_REAL_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=now+10800000,jobs=rules)
 cas['validate_policy_delta'](policy,{'grantId':'b16447fbc81f4d64'})
 files={'module':(HERE/'r3_normal39_continuation.py').read_bytes(),'policy':encode(policy),'dispatcherTemplate':(HERE/'admin_exec.NORMAL39-UNREGISTERED.py').read_bytes()};dispatcher=cas['render'](files)
 authorization=dict(cas['scope'](),sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+900000,authorizationReference=REF,independentReviewSha256=review_pin)
 raw=encode(authorization);carrier=(HERE/'original-cas-normal39-carrier.UNISSUED.py').read_text();assert 'SOURCE='+repr(sha((HERE/'register_cas.py').read_bytes()))in carrier
 for name,value in [('AUTH_SHA_LITERAL',repr(sha(raw))),('AUTH_START_LITERAL',str(now)),('AUTH_EXPIRES_LITERAL',str(authorization['expiresAt']))]:assert carrier.count(name)==1;carrier=carrier.replace(name,value)
 compile(carrier,'normal39_original_cas_carrier','exec')
 manifest=dict(state='ISSUED_NORMAL39_SIX_PHASE_REGISTRATION_NO_PHASE_SUBMITTED',startsAt=now,registrationExpiresAt=authorization['expiresAt'],roleApplyExpiresAt=roles['expiresAt'],controllerValidUntil=roles['controllerValidUntil'],backupAdminValidUntil=roles['backupAdminValidUntil'],restorationDeadline=roles['restorationDeadline'],policyExpiresAt=policy['expiresAt'],rulesSha256=sha(witness_raw),basisSha256=basis_pin,independentReviewSha256=review_pin,consumerSourcePinsSha256=witness['consumerSourcePinsSha256'],consumerReviewSha256=consumer_review_pin,rolesSha256=sha(role_raw),applyHostSha256=sha(encode(apply)),policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),registrationSha256=sha(raw),jobs=witness['jobs'],phaseSubmitted=False)
 b64=lambda b:base64.b64encode(b).decode();packet={'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}
 outputs={'roles-authorization.json':role_raw,'host-authorization.json':encode(apply),'direct39-batched-real.json':files['policy'],'admin_exec.ISSUED.py':dispatcher,'registration-authorization.json':raw,'registration-envelope.json':encode({'source':b64((HERE/'register_cas.py').read_bytes()),'packet':packet}),'original-cas-normal39-carrier.ISSUED.py':carrier.encode(),'ISSUED.json':encode(manifest)}
 out=Path(output_directory).resolve();assert out.parent==ROOT/'outputs/主控'and not out.exists();out.mkdir(mode=0o700)
 for leaf,body in outputs.items():
  with(out/leaf).open('xb')as stream:stream.write(body)
 return manifest
