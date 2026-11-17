"""Main only, exact frozen one-observation issuance after real readonly fresh."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,os,runpy,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
DECISION=ROOT/'outputs/主控/20261118-r3-after45-businessroot-durable-decision-01/DECISION.json'
WINDOW=ROOT/'outputs/主控/20261118-r3-after45-durable-readonly-window-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
pack=lambda v:(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return raw
def source_files(folder,pins):
 for leaf,row in pins['files'].items():
  pin=row['sha256']if type(row)is dict else row
  raw=checked(folder/leaf,pin)
  if type(row)is dict:assert len(raw)==row['bytes']
def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw);source_files(HERE,source)
 h=json.loads((HERE/'HISTORY.json').read_bytes());b=json.loads((HERE/'CONSUMER-BINDING.json').read_bytes());key=h['newJobId']
 q=json.loads(checked(review_file,review_pin));cq=json.loads(checked(consumer_review_file,consumer_review_pin))
 assert consumer_review_pin==h['consumerReviewSha256']
 assert q['sourceOnly']is cq['sourceOnly']is True and q['findings']==cq['findings']==[]and q['rootPairReviewComplete']is True
 assert q['sourcePinsSha256']==sha(source_raw)and q['consumerReviewSha256']==consumer_review_pin and q['consumerSourcePinsSha256']==h['consumerSourcePinsSha256']and cq['sourcePinsSha256']==h['consumerSourcePinsSha256']
 decision=json.loads(DECISION.read_bytes())
 assert decision['state']=='AUTHORIZE_EXACT_AFTER45_BUSINESSROOT_DURABLE_WINDOW_AFTER_REVIEW'and decision['jobId']==key and decision['sourcePinsSha256']==sha(source_raw)and decision['reviewSha256']==review_pin
 assert decision['maximumWindowSeconds']==900 and decision['readOnlyObservationOnly']is True and decision['roleChangesAuthorized']is False and decision['businessWritesAuthorized']is False
 for ref in (h['mainScope'],h['planIdentityAddendum']):checked(ref['path'],ref['sha256'])
 folder=Path(b['consumerSourceDirectory']);cs=json.loads(checked(folder/'SOURCE-PINS.json',h['consumerSourcePinsSha256']));source_files(folder,cs)
 basis=json.loads(checked(basis_file,basis_pin));cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='after45_registration_source')
 assert basis['state']=='READONLY_AFTER45_BUSINESSROOT_DURABLE_BASIS'and basis['dispatcherSha256']==h['dispatcherSha256']and basis['originalAuthRestored']is True and basis['restorationResultSha256']==h['restore']['resultSha256']
 assert basis['PGConnections']==basis['mutations']==0 and basis['ownedPID0']is True and basis['pgdataPidAbsent']is True and basis['noOtherActiveOperations']is True
 assert set(basis['oldIdentities'])==set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}|{'executionLock'}and basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])
 assert (set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}).isdisjoint({str(cas[k])for k in ('NEW_MODULE','NEW_POLICY','AUDIT','PENDING')})
 stamp=datetime.fromisoformat(basis['checkedAtUTC']);assert stamp.tzinfo is not None
 out=Path(output_directory).resolve();assert out==WINDOW and not out.exists()
 # Unique clock only after exact two reviews, decision, source, and actual fresh.
 now=time.time_ns()//1000000
 assert 0<=now-int(stamp.timestamp()*1000)<=120000 and now+900000<=int(basis['grantExpiresAtEpoch']*1000)
 expires=now+900000;ref='One fixed original business root durable readonly observation after actual45 auth restoration; no role or business changes, no import replay.'
 pins=b['rule']['bundlePins'];authority=dict(format=b['authorityFormat'],requestKey=key,startsAt=now,expiresAt=expires,sourceReviewSha256=review_pin,scopeSha256=pins['scope.json'],authorizationReference=ref);authority_raw=pack(authority)
 policy=dict(format=b['policyFormat'],requestKey=key,startsAt=now,expiresAt=expires,authoritySha256=sha(authority_raw),sourceReviewSha256=review_pin,bundlePins=pins);policy_raw=pack(policy);cas['validate_policy_delta'](policy)
 files={'module':(HERE/'r3_after45_businessroot_durable_readonly.py').read_bytes(),'policy':policy_raw,'dispatcherTemplate':(HERE/'admin_exec.DURABLE-UNREGISTERED.py').read_bytes()}
 registration=dict(format='T45_AFTER45_BUSINESSROOT_DURABLE_REGISTRATION_CAS_V1',jobs={'observe':key},sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+180000,authorizationReference=ref,independentReviewSha256=review_pin)
 reg_raw=pack(registration);b64=lambda v:base64.b64encode(v).decode()
 metadata=dict(state='ISSUED_AFTER45_DURABLE_NOT_REGISTERED_OR_OBSERVED',sourcePinsSha256=sha(source_raw),jobId=key,requestKey=key,authoritySha256=sha(authority_raw),registrationSha256=sha(reg_raw),policySha256=sha(policy_raw),authorizationDecisionSha256=sha(DECISION.read_bytes()),startsAt=now,expiresAt=expires,oldHardMet=False,roleChangesAuthorized=False,businessWritesAuthorized=False,observationDoesNotAuthorizeImport=True)
 outputs={'host-authorization.json':authority_raw,'registered-policy.json':policy_raw,'registration-authorization.json':reg_raw,'registration-packet.json':pack({'authorization':b64(reg_raw),'files':{k:b64(v)for k,v in files.items()}}),'ISSUED.json':pack(metadata)}
 out.mkdir(mode=0o700)
 for leaf,raw in outputs.items():
  with os.fdopen(os.open(out/leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as f:f.write(raw)
 return metadata
