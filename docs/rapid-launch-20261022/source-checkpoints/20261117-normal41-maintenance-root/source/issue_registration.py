"""Main-only finite registration API. SOURCE defines this function without calling it."""
from pathlib import Path
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控';T45=ROOT/'outputs/T45/revisions'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def read(path,pin=None):
 assert pin is not None,'EXACT_EVIDENCE_PIN_REQUIRED';return json.loads(checked(path,pin))
def verify_source():
 raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(raw)
 assert source['sourceOnly']is True
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 return sha(raw),source
def api(path,rule):
 checked(path,rule['bundlePins'][path.name]);sys.path.insert(0,str(path.parent))
 return runpy.run_path(str(path),run_name='main_unissued_consumer_api')
def witness():return json.loads((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes())

from datetime import datetime
def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 source_pin,source=verify_source();w=witness()
 for ref in w['actualInputs']:checked(ref['path'],ref['sha256'])
 human=read(ROOT/'outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json','836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0')
 assert human['messageId']=='01a1df2e-293d-7061-ab16-5b0cc2e0e753'
 review=read(review_file,review_pin);consumer_review=read(consumer_review_file,consumer_review_pin)
 assert review['sourceOnly']is True and review['findings']==[]and review['rootPairReviewComplete']is True
 assert review['sourcePinsSha256']==source_pin and review['consumerSourcePinsSha256']==w['consumerSourcePinsSha256']and review['consumerReviewSha256']==consumer_review_pin
 assert consumer_review_pin==w['consumerReviewSha256']
 assert consumer_review['sourceOnly']is True and consumer_review['findings']==[]
 assert consumer_review['sourcePinsSha256']==w['consumerSourcePinsSha256']and consumer_review['interfaceSha256']==w['consumerInterfaceSha256']
 folder=Path(w['consumerSourceDirectory']);consumer=read(folder/'SOURCE-PINS.json',w['consumerSourcePinsSha256'])
 interface=read(folder/'INTERFACE.UNISSUED.json',w['consumerInterfaceSha256'])
 read(folder/'PHASES41.UNISSUED.json',w['consumerRulesSha256'])
 assert consumer['sourceOnly']is True and interface['phaseOrder']==['apply','start','upgrade','stop','restore']
 for leaf,row in consumer['files'].items():assert len(checked(folder/leaf,row['sha256']))==row['bytes']
 basis=read(basis_file,basis_pin);cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main41_registration_source')
 assert basis['state']=='READONLY_NORMAL41_REGISTRATION_BASIS'and basis['dispatcherSha256']==cas['OLD']
 assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True
 assert basis['PGConnections']==basis['mutations']==0 and basis['original39AckSHAReadBackMatchesDerivedExpected']is True
 assert basis['executionLockMatches']is True and basis['candidateKeysAbsent']is True and basis['stoppedPGDATA']is True
 assert set(basis['oldIdentities'])==set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}|{'executionLock'}
 assert basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])
 for path,expected in w['closedFailed40']['custodyMetadata6'].items():
  ident=basis['oldIdentities'][path];assert len(ident)==9 and ident[5]==1 and dict(device=ident[0],inode=ident[1],uid=ident[2],gid=ident[3],mode=ident[4],bytes=ident[6])==expected
 assert {str(p):basis['oldIdentities'][str(p)]for p in cas['CUSTODY']}=={**w['custodyStat9'],**{path:basis['oldIdentities'][path]for path in w['closedFailed40']['custodyMetadata6']}}
 rules=json.loads(json.dumps(w['expectedRules']));folders={p:Path(w['phaseDirectories'][p])for p in rules}
 for phase,rule in rules.items():
  assert folders[phase]==folder/phase/'bundle'
  for leaf,pin in rule['bundlePins'].items():checked(folders[phase]/leaf,pin)
 role_file=folders['apply']/'ordinary05_roles.py';host_file=folders['apply']/'ordinary05_roles_job.py'
 role=api(role_file,rules['apply']);host=api(host_file,rules['apply'])
 assert role['scope']()==interface['rolesFixedScope']and host['scope']('apply')==interface['jobs']['apply']['hostFixedScope']
 stamp=datetime.fromisoformat(basis['checkedAtUTC']);assert stamp.tzinfo is not None
 out=Path(output_directory).resolve();assert out.parent==CONTROL and not out.exists()
 # Sole Main clock, after exact source/review/fresh checks. No saved SOURCE clock.
 now=time.time_ns()//1000000
 assert 0<=now-int(stamp.timestamp()*1000)<=120000 and now+5100000<=int(basis['grantExpiresAtEpoch']*1000)
 ref='Main ordinary41 exact five-step maintenance only; no import or writer; original39 authentication preserved and restored.'
 roles=dict(role['scope'](),startsAt=now,expiresAt=now+900000,controllerValidUntil=now+3600000,backupAdminValidUntil=now+3720000,restorationDeadline=now+4500000,authorizationReference=ref,rolesSourceSha256=sha(role_file.read_bytes()),independentReviewSha256=review_pin)
 role['validate'](roles,now);roles_raw=encode(roles)
 apply=dict(host['scope']('apply'),startsAt=now,expiresAt=roles['expiresAt'],authorizationReference=ref,independentReviewSha256=review_pin,rolesAuthoritySha256=sha(roles_raw),rolesSourceSha256=roles['rolesSourceSha256'],hostSourceSha256=sha(host_file.read_bytes()))
 host['validate'](apply,'apply',now)
 for phase in ('apply','restore'):rules[phase]['bundlePins']['roles-authorization.json']=sha(roles_raw)
 policy=dict(format='T45_R3_NORMAL41_BATCHED_REAL_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=now+5100000,jobs=rules)
 cas['validate_policy_delta'](policy)
 files={'module':(HERE/'r3_normal41_continuation.py').read_bytes(),'policy':encode(policy),'dispatcherTemplate':(HERE/'admin_exec.NORMAL41-UNREGISTERED.py').read_bytes()}
 dispatcher=files['dispatcherTemplate'].replace(b'NORMAL41_POLICY_SHA256 = None',('NORMAL41_POLICY_SHA256 = '+repr(sha(files['policy']))).encode());assert dispatcher!=files['dispatcherTemplate']
 authorization=dict(format='T45_NORMAL41_REGISTRATION_CAS_V1',jobs=w['jobs'],sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+600000,authorizationReference=ref,independentReviewSha256=review_pin)
 raw=encode(authorization);b64=lambda raw:base64.b64encode(raw).decode()
 manifest=dict(state='ISSUED_NORMAL41_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED',sourcePinsSha256=source_pin,rulesSha256=sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes()),consumerSourcePinsSha256=w['consumerSourcePinsSha256'],consumerReviewSha256=consumer_review_pin,independentReviewSha256=review_pin,basisSha256=basis_pin,rolesSha256=sha(roles_raw),applyHostSha256=sha(encode(apply)),policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),registrationSha256=sha(raw),jobs=w['jobs'],phaseSubmitted=False)
 outputs={'roles-authorization.json':roles_raw,'host-authorization.json':encode(apply),'direct41-batched-real.json':files['policy'],'admin_exec.ISSUED.py':dispatcher,'registration-authorization.json':raw,'registration-packet.json':encode({'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}),'ISSUED.json':encode(manifest)}
 out.mkdir(mode=0o700)
 for leaf,body in outputs.items():
  with os.fdopen(os.open(out/leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as stream:stream.write(body)
 return manifest
