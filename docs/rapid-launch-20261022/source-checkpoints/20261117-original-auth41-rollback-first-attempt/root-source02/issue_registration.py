"""Main7, independently approved15-minute original-auth rollback ticket only."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
DECISION=ROOT/'outputs/主控/20261117-r3-original-auth41-rollback-decision-01/DECISION.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
pack=lambda v:(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 b=Path(path).read_bytes();assert sha(b)==pin,path;return b
def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 h=json.loads((HERE/'HISTORY.json').read_bytes());binding=json.loads((HERE/'CONSUMER-BINDING.json').read_bytes());key=h['newJobId']
 q=json.loads(checked(review_file,review_pin));cq=json.loads(checked(consumer_review_file,consumer_review_pin))
 assert consumer_review_pin==h['consumerReviewSha256']
 assert q['sourceOnly']is cq['sourceOnly']is True and q['findings']==cq['findings']==[]and q['rootPairReviewComplete']is True
 assert q['sourcePinsSha256']==sha(source_raw)and q['consumerReviewSha256']==consumer_review_pin and q['consumerSourcePinsSha256']==h['consumerSourcePinsSha256']and cq['sourcePinsSha256']==h['consumerSourcePinsSha256']
 decision=json.loads(DECISION.read_bytes())
 assert decision['state']=='AUTHORIZE_EXACT_ORIGINAL_AUTH41_ROLLBACK_WINDOW_AFTER_REVIEW'and decision['jobId']==key and decision['sourcePinsSha256']==sha(source_raw)and decision['reviewSha256']==review_pin
 assert decision['maximumWindowSeconds']==900 and decision['temporaryRoleExpiryExtended']is False and decision['applyAuthorized']is False
 folder=Path(binding['consumerDirectory']);source_folder=Path(binding['consumerSourceDirectory']);cs=json.loads(checked(source_folder/'SOURCE-PINS.json',h['consumerSourcePinsSha256']))
 for leaf,row in cs['files'].items():assert len(checked(source_folder/leaf,row['sha256']))==row['bytes']
 basis=json.loads(checked(basis_file,basis_pin));cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='rollback_registration_source')
 assert basis['state']=='READONLY_ORIGINAL_AUTH41_ROLLBACK_BASIS'and basis['dispatcherSha256']==h['dispatcherSha256']and basis['service']==h['service']and basis['exactExistingC41Stopped']is True and basis['cleanupSha256']==h['cleanupSha256']
 assert basis['PGConnections']==basis['mutations']==0 and basis['ownedPID0']is True and basis['pgdataPidAbsent']is True and basis['noOtherActiveOperations']is True
 assert set(basis['oldIdentities'])==set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}|{'executionLock'}and basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])
 for path,expected in h['snapshotMetadata6'].items():
  ident=basis['oldIdentities'][path];assert len(ident)==9 and ident[5]==1
  if expected is not None:assert dict(device=ident[0],inode=ident[1],uid=ident[2],gid=ident[3],mode=ident[4],bytes=ident[6])==expected
 stamp=datetime.fromisoformat(basis['checkedAtUTC']);assert stamp.tzinfo is not None
 out=Path(output_directory).resolve();assert out.parent==ROOT/'outputs/主控'and not out.exists()
 sys.path.insert(0,str(folder));role_path=folder/'ordinary05_roles.py';host_path=folder/'ordinary05_roles_job.py'
 role=runpy.run_path(str(role_path),run_name='original_auth_rollback_only_scope');host=runpy.run_path(str(host_path),run_name='original_auth_rollback_job_scope')
 # A new clock after final review, Main approval and actual fresh. It does not
 # update any original finite role ticket or temporary login expiry.
 now=time.time_ns()//1000000
 assert 0<=now-int(stamp.timestamp()*1000)<=120000 and now+900000<=int(basis['grantExpiresAtEpoch']*1000)
 expiry=now+900000;ref='Separately approved original authentication rollback only; no apply, temporary login renewal, service or business operation.'
 inner=dict(h['innerScopeFixed'],startsAt=now,expiresAt=expiry,authorizationReference=ref,independentReviewSha256=review_pin,rolesSourceSha256=sha(role_path.read_bytes()),originalRecoveryStat9={Path(path).name:basis['oldIdentities'][path]for path in h['snapshotMetadata6']})
 role['validate'](inner,now,True)
 inner_raw=pack(inner)
 outer=dict(h['outerScopeFixed'],startsAt=now,expiresAt=expiry,authorizationReference=ref,independentReviewSha256=review_pin,rolesAuthoritySha256=sha(inner_raw),rolesSourceSha256=sha(role_path.read_bytes()),hostSourceSha256=sha(host_path.read_bytes()),originalRecoveryStat9=inner['originalRecoveryStat9'])
 host['validate'](outer,'restore',now)
 outer_raw=pack(outer);rule=json.loads(json.dumps(binding['rule']));rule['bundlePins']['roles-authorization.json']=sha(inner_raw)
 policy=dict(format='T45_R3_ORIGINAL_AUTH41_ROLLBACK_ONLY_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=expiry,jobs={'rollback':rule});cas['validate_policy_delta'](policy)
 files={'module':(HERE/'r3_original_auth41_rollback.py').read_bytes(),'policy':pack(policy),'dispatcherTemplate':(HERE/'admin_exec.ROLLBACK-UNREGISTERED.py').read_bytes()}
 auth=dict(format='T45_ORIGINAL_AUTH41_ROLLBACK_REGISTRATION_CAS_V1',jobs={'rollback':key},sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=now+180000,authorizationReference=ref,independentReviewSha256=review_pin)
 raw=pack(auth);b64=lambda v:base64.b64encode(v).decode()
 metadata=dict(state='ORIGINAL_AUTH41_ROLLBACK_ISSUED_NOT_REGISTERED_OR_EXECUTED',sourcePinsSha256=sha(source_raw),jobId=key,authoritySha256=sha(outer_raw),rolesAuthoritySha256=sha(inner_raw),registrationSha256=sha(raw),policySha256=sha(files['policy']),authorizationDecisionSha256=sha(DECISION.read_bytes()),originalTemporaryRolesAuthoritySha256=h['originalRolesSha256'],startsAt=now,expiresAt=expiry,originalHardDeadline=h['originalRestorationDeadline'],originalHardDeadlineClaimedMet=False,applyAuthorized=False,temporaryRoleExpiryExtended=False)
 outputs={binding['rule']['authorityLeaf']:outer_raw,'roles-authorization.json':inner_raw,'original-auth41-rollback-only-20261117-01.json':files['policy'],'registration-authorization.json':raw,'registration-packet.json':pack({'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}),'ISSUED.json':pack(metadata)}
 out.mkdir(mode=0o700)
 for leaf,body in outputs.items():
  with os.fdopen(os.open(out/leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as f:f.write(body)
 return metadata
