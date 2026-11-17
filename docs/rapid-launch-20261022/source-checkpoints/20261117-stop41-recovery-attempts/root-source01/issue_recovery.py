"""Main seven-argument issuer for one safety stop; no new roles or leases."""
from pathlib import Path
from datetime import datetime
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
KEY='t45-r3-ordinary41-preserve-stop-recovery-20261117-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
pack=lambda v:(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(p,pin):
 b=Path(p).read_bytes();assert sha(b)==pin,p;return b
def issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin):
 source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 h=json.loads((HERE/'HISTORY.json').read_bytes());binding=json.loads((HERE/'CONSUMER-BINDING.json').read_bytes())
 q=json.loads(checked(review_file,review_pin));cq=json.loads(checked(consumer_review_file,consumer_review_pin))
 assert q['sourceOnly']is cq['sourceOnly']is True and q['findings']==cq['findings']==[]and q['rootPairReviewComplete']is True
 assert q['sourcePinsSha256']==sha(source_raw)and q['consumerReviewSha256']==consumer_review_pin and q['consumerSourcePinsSha256']==h['consumerSourcePinsSha256']
 assert consumer_review_pin==h['consumerReviewSha256']and cq['sourcePinsSha256']==h['consumerSourcePinsSha256']
 folder=Path(binding['consumerDirectory']);consumer_source=Path(binding['consumerSourceDirectory']);cs=json.loads(checked(consumer_source/'SOURCE-PINS.json',h['consumerSourcePinsSha256']))
 for leaf,row in cs['files'].items():assert len(checked(consumer_source/leaf,row['sha256']))==row['bytes']
 basis=json.loads(checked(basis_file,basis_pin));cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main_safety_cas_source')
 assert basis['state']=='READONLY_EXACT_RUNNING_C41_RECOVERY_REGISTRATION_BASIS'and basis['dispatcherSha256']==h['dispatcherSha256']and basis['service']==h['service']and basis['exactExistingC41Running']is True
 assert basis['PGConnections']==basis['mutations']==0 and basis['noOtherActiveOperations']is True
 assert set(basis['oldIdentities'])==set(cas['PRESERVE'])|{str(p)for p in cas['CUSTODY']}|{'executionLock'}and basis['oldIdentities']['executionLock']==list(cas['LOCK_ID'])
 stamp=datetime.fromisoformat(basis['checkedAtUTC']);assert stamp.tzinfo is not None
 out=Path(output_directory).resolve();assert out.parent==ROOT/'outputs/主控'and not out.exists()
 rule=binding['rule'];host_path=folder/rule['script'];sys.path.insert(0,str(folder))
 host=runpy.run_path(str(host_path),run_name='main_recovery_stop_scope_only')
 expected=host['scope']();assert expected['requestKey']==KEY
 original_roles=ROOT/'outputs/主控/20261117-r3-normal41-registration-window-01/roles-authorization.json'
 roles=json.loads(checked(original_roles,h['originalRolesSha256']));assert roles['restorationDeadline']==h['originalRestorationDeadline']
 now=time.time_ns()//1000000
 assert 0<=now-int(stamp.timestamp()*1000)<=120000
 expiry=min(now+240000,h['originalWorkDeadline'],h['originalRestorationDeadline'])
 assert now+rule['timeoutSeconds']*1000+35000<expiry,'ORIGINAL_WINDOW_INSUFFICIENT_NO_EXTENSION'
 a=dict(expected,service=h['service'],startsAt=now,expiresAt=expiry,writerTerminalSha256='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e',policySha256='25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',sourceSha256=sha(host_path.read_bytes()),currentBatchTerminals=binding['actualCurrentBatchTerminals'],authorizationReference='Exact current C41 guardian recovery stop only after original STOP failed; original authentication restoration deadlines unchanged.')
 host['validate'](a,now);raw_a=pack(a)
 policy=dict(format='T45_R3_STOP41_RECOVERY_ONLY_V1',grantId='b16447fbc81f4d64',startsAt=now,expiresAt=expiry,jobs={'stop':rule});cas['validate_policy_delta'](policy)
 files={'module':(HERE/'r3_stop41_recovery.py').read_bytes(),'policy':pack(policy),'dispatcherTemplate':(HERE/'admin_exec.RECOVERY-UNREGISTERED.py').read_bytes()}
 auth=dict(format='T45_STOP41_RECOVERY_REGISTRATION_CAS_V1',jobs={'stop':KEY},sourceSha256=sha((HERE/'register_cas.py').read_bytes()),sourcePins={k:sha(v)for k,v in files.items()},oldIdentities=basis['oldIdentities'],startsAt=now,expiresAt=min(now+180000,expiry-30000),authorizationReference='One exact running-C41 safety registration, no PG start or business action.',independentReviewSha256=review_pin)
 raw=pack(auth);b64=lambda v:base64.b64encode(v).decode()
 metadata=dict(state='RECOVERY_STOP_AND_REGISTRATION_ISSUED_NOT_SUBMITTED',sourcePinsSha256=sha(source_raw),authoritySha256=sha(raw_a),registrationSha256=sha(raw),policySha256=sha(files['policy']),rolesReissued=False,jobId=KEY)
 outputs={rule['authorityLeaf']:raw_a,'stop41-recovery-only-20261117-01.json':files['policy'],'registration-authorization.json':raw,'registration-packet.json':pack({'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}),'ISSUED.json':pack(metadata)}
 out.mkdir(mode=0o700)
 for leaf,raw in outputs.items():
  with os.fdopen(os.open(out/leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as f:f.write(raw)
 return metadata
