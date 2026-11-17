"""Main-only: validate final reviews/fresh stopped basis before one real clock.

Does not issue roles or a future service. D1 never invokes this entry.
"""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,runpy,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
MATERIAL=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ROOT07-MATERIALIZATION-SOURCE-01'
MATERIAL_PIN='919c10d32c1ed59cea733a96fcfbaa206e17e471fe76cdb9ab59160661e7588d'
DECISION=ROOT/'outputs/主控/20261117-r3-root07-single-leaf-source-decision-01/DECISION.json'
DECISION_PIN='f5f7e4c6c2a5fbec2e61624f5d8d74e2e6e8c7ee3440a7a174761c4860e1b197'
LINEAGE_REVIEW=ROOT/'outputs/QB/20261117-r3-root07-source-lineage-review-01/RESULT.json'
LINEAGE_REVIEW_PIN='bfe6ab7d8061ec0e9ef6f82a7436f19f3434e5f5a170f76d36a07753f0c1c43f'
REFERENCE='Main f5f7 ROOT07 source-only single leaf materialization before next normal role clock; original e46/3b/51da and exact closed38 retained; never replay ROOT06 or any used prepare/catalog/role key.'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(v):return(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw

def issue(review_file,review_pin,basis_file,basis_pin,output_directory):
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 review=json.loads(checked(review_file,review_pin))
 assert review['sourceOnly']is True and review['findings']==[]and review['state'].startswith('SOURCE_PASS_ROOT07_')
 assert review['sourcePinsSha256']==sha(source_raw)and review['materializerSourcePinsSha256']==MATERIAL_PIN
 assert review['lineageReviewSha256']==LINEAGE_REVIEW_PIN
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 material=json.loads(checked(MATERIAL/'SOURCE-PINS.json',MATERIAL_PIN))
 assert material['sourceOnly']is True and material['sourceFiles']==387 and material['changedRuntimeLeaves']==1 and material['inheritedRuntimeLeaves']==386
 assert material['PGConnections']==material['serverActions']==material['clockCalls']==0 and material['actualExecution']is False
 for leaf,row in material['files'].items():assert len(checked(MATERIAL/leaf,row['sha256']))==row['bytes']
 lineage=json.loads(checked(LINEAGE_REVIEW,LINEAGE_REVIEW_PIN));assert lineage['sourceOnly']is True and lineage['findings']==[]and lineage['state']=='SOURCE_PASS_ROOT07_SOURCE_LINEAGE_CONTRACT_ONLY'
 decision=json.loads(checked(DECISION,DECISION_PIN));assert decision['materializationBeforeNextFiniteRoleClock']is True and decision['newMaterializationCompletionReceipt']is None and decision['businessWriterNeverSubmitted']is True
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main_source_registration')
 assert material['requestKey']==cas['STATIC']['rule']['jobId']==decision['newMaterializationRequestKey']
 assert material['bundlePins']==cas['STATIC']['rule']['bundlePins']
 basis=json.loads(checked(basis_file,basis_pin))
 assert basis['state']=='READONLY_ROOT07_SOURCE_REGISTRATION_BASIS'and basis['basisMismatches']==[]and basis['executionLockMatches']is True
 assert basis['activeOperationUnits']==basis['presentCandidateKeys']==[]and basis['candidateKeys']==[material['requestKey']]
 assert basis['actual38StoppedAndOriginalAuthRestored']is True and basis['authenticationSnapshotBodiesOrDigestsRead']is False
 assert basis['actualPins']==cas['STATIC']['basis']
 assert set(basis['oldIdentities'])==set(cas['STATIC']['basis'])|set(cas['STATIC']['privateCustodyStatOnly'])|{'executionLock'}
 assert basis['oldIdentities']['executionLock']==cas['LOCK_ID']
 for name,expected in cas['STATIC']['privateCustodyStatOnly'].items():
  ident=basis['oldIdentities'][name]
  assert len(ident)==9 and dict(device=ident[0],inode=ident[1],uid=ident[2],gid=ident[3],mode=ident[4],bytes=ident[6])==expected and ident[5]==1
 materializer=runpy.run_path(str(MATERIAL/'bundle/materialize-batched-source.py'),run_name='main_source_authority_issuer')
 captured=int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp()*1000)
 # All missing, stale or mismatched source/review/basis checks above run BEFORE clock.
 now=time.time_ns()//1000000
 assert 0<=now-captured<=900000 and now+1800000<=int(basis['grantExpiresAtEpoch']*1000),'FRESH_STOPPED_BASIS_AND_SOURCE_WINDOW_REQUIRED'
 authority=dict(materializer['scope'](),startsAt=now,expiresAt=now+1800000,authorizationReference=REFERENCE,independentReviewSha256=review_pin,sourceSha256=material['materializerSha256'])
 materializer['validate'](authority,now);authority_raw=encode(authority)
 profile=dict(format='T45_ROOT07_SOURCE_ONLY_ADMISSION_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=authority['expiresAt'],authoritySha256=sha(authority_raw),sourceReviewSha256=review_pin,decisionReference=REFERENCE,baselineRootPins=cas['STATIC']['actualRootPins'],rule=cas['STATIC']['rule'],custodyIdentities={name:basis['oldIdentities'][name]for name in cas['STATIC']['privateCustodyStatOnly']})
 profile_raw=encode(profile)
 files=dict(module=(HERE/'r3_root07_source_admission.py').read_bytes(),policy=profile_raw,dispatcherTemplate=(HERE/'admin_exec.ROOT07-UNREGISTERED.py').read_bytes())
 dispatcher=cas['render'](files)
 registration=dict(cas['scope'](),sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+900000,authorizationReference=REFERENCE,independentReviewSha256=review_pin)
 registration_raw=encode(registration)
 packet={'authorization':base64.b64encode(registration_raw).decode(),'files':{k:base64.b64encode(v).decode()for k,v in files.items()}}
 carrier=(HERE/'original-cas-root07-carrier.UNISSUED.py').read_text().replace('AUTH_SHA_LITERAL',repr(sha(registration_raw))).replace('AUTH_START_LITERAL',str(registration['startsAt'])).replace('AUTH_EXPIRES_LITERAL',str(registration['expiresAt']))
 compile(carrier,'source-cas-carrier','exec')
 outputs={'registration-authorization.json':registration_raw,'registration-envelope.json':encode({'source':base64.b64encode((HERE/'register_cas.py').read_bytes()).decode(),'packet':packet}),'root07-source-only-20261117-01.json':profile_raw,'materialize-authorization.json':authority_raw,'admin_exec.ISSUED.py':dispatcher,'original-cas-root07-carrier.ISSUED.py':carrier.encode()}
 out=Path(output_directory);out.mkdir(parents=True,exist_ok=False)
 for leaf,raw in outputs.items():
  with (out/leaf).open('xb')as stream:stream.write(raw)
 result={'state':'MAIN_EXACT_ROOT07_SOURCE_AUTHORITY_ISSUED_NO_ROLE_OR_JOB_SUBMITTED','reviewSha256':review_pin,'basisSha256':basis_pin,'files':{k:{'sha256':sha(v),'bytes':len(v)}for k,v in outputs.items()},'rolesIssued':False,'serviceOrEpochConstructed':False,'sourceJobSubmitted':False,'PGConnections':0}
 (out/'ISSUED.json').write_bytes(encode(result));return result
