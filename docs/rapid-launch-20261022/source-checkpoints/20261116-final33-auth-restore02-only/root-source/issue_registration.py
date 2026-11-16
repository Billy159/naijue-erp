"""Issue only a reviewed restore02 CAS. Original clocks and roles stay exact."""
from datetime import datetime
from pathlib import Path
import base64,hashlib,json,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];CONTROL=ROOT/'outputs/主控'
ORIGINAL=CONTROL/'20261116-r3-direct-service33-after-preparation-registration-window-01'
HOST=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/AUTH-RESTORE33-SUCCESSOR-01'
HOST_PIN='9f16aae184896fda45c79e124db496b2644a681f3744d8561972117dbfb8c9f5'
HOST_REVIEW=ROOT/'outputs/QB/20261116-final33-auth-restore02-review-01/HOST-RESULT.json'
HOST_REVIEW_PIN='b9880f303d7829e4d48738decfd844c3a58288a88e5d43c4c7df64ccf5871917'
ROLE_SHA='33bcd2fbe1a81631d710f46ab40bf2687cdc40162baf02de474951e85e17d69f'
REFERENCE='Standing approved ERP controlled recovery; restore02 outer action only after exact failed start33 and restore01 pre-inner refusal. Keep original role authority, custody, all clocks and business history; no normal startup or import.'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def pack(v):return(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return raw
def reviewed(review_file,review_pin):
 review=json.loads(checked(review_file,review_pin));assert review['state']=='SOURCE_PASS_AUTH_RESTORE33_ROOT_PAIR_ONLY'and review['sourceOnly']is True and review['findings']==[]
 required={'register_cas.py','read_registration_basis.py','r3_direct33_restore02_only.py','admin_exec.RESTORE33-UNREGISTERED.py','POLICY.RESTORE02.UNISSUED.json','original-cas-restore33-carrier.UNISSUED.py','issue_registration.py','issue_restore.py'}
 assert required<=set(review['files'])
 for leaf,row in review['files'].items():assert Path(leaf).name==leaf and sha((HERE/leaf).read_bytes())==row['sha256']
 host=json.loads(checked(HOST/'SOURCE-PINS.json',HOST_PIN));independent=json.loads(checked(HOST_REVIEW,HOST_REVIEW_PIN))
 assert independent['state']=='SOURCE_PASS_AUTH_RESTORE02_CONSUMER_ONLY_ROOT_PAIR_PENDING'and independent['findings']==[] and independent['sourceOnly']is True
 for leaf,pin in host['bundlePins'].items():checked(Path(host['bundleDirectory'])/leaf,pin)
 return review,host

def issue(review_file,review_pin,basis_file,basis_pin,outdir):
 review,host=reviewed(review_file,review_pin);cas=runpy.run_path(str(HERE/'register_cas.py'));basis=json.loads(checked(basis_file,basis_pin))
 assert basis['state']=='READONLY_RESTORE33_ONLY_BASIS'and basis['basisMismatches']==basis['activeOperationUnits']==[] and basis['restore02Unused']is True and basis['executionLockMatches']is True
 assert basis['actualPins']=={str(k):v for k,v in cas['BASIS'].items()} and set(basis['oldIdentities'])==set(basis['actualPins'])|{'executionLock'}|set(cas['CUSTODY_FILES'])and basis['oldIdentities']['executionLock']==cas['LOCK_ID']
 roles_raw=checked(ORIGINAL/'roles-authorization.json',ROLE_SHA);roles=json.loads(roles_raw)
 policy_raw=(HERE/'POLICY.RESTORE02.UNISSUED.json').read_bytes();policy=json.loads(policy_raw)
 old=json.loads(checked(ORIGINAL/'direct33-batched-real.json','542e78404c0493eb9b959af59f771437dd3017184022ef82e32b3c72b05d921d'));cas['validate_policy_delta'](policy,old)
 now=time.time_ns()//1000000;captured=int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp()*1000);assert 0<=now-captured<=900000
 expires=min(now+900000,roles['restorationDeadline'],policy['expiresAt'],int(basis['grantExpiresAtEpoch']*1000));assert old['startsAt']<=now and now+300000<expires
 assert roles['restorationDeadline']==basis['restorationDeadline']==cas['RESTORATION_DEADLINE'] and policy['expiresAt']==basis['policyExpiresAt']==cas['PARENT_EXPIRES'] and basis['rolesAuthoritySha256']==ROLE_SHA
 files={'module':(HERE/'r3_direct33_restore02_only.py').read_bytes(),'policy':policy_raw,'dispatcherTemplate':(HERE/'admin_exec.RESTORE33-UNREGISTERED.py').read_bytes()};dispatcher=cas['render'](files)
 authorization={**cas['scope'](),'sourceSha256':sha((HERE/'register_cas.py').read_bytes()),'sourcePins':{k:sha(v)for k,v in files.items()},'oldIdentities':basis['oldIdentities'],'startsAt':now,'expiresAt':expires,'authorizationReference':REFERENCE,'independentReviewSha256':review_pin}
 raw=cas['pack'](authorization);carrier=(HERE/'original-cas-restore33-carrier.UNISSUED.py').read_bytes();assert ("SOURCE='"+authorization['sourceSha256']+"'").encode()in carrier
 for key,value in [('AUTH_SHA_LITERAL',repr(sha(raw))),('AUTH_START_LITERAL',str(now)),('AUTH_EXPIRES_LITERAL',str(expires))]:assert carrier.count(key.encode())==1;carrier=carrier.replace(key.encode(),value.encode())
 compile(carrier,'restore33-root-carrier','exec');b64=lambda b:base64.b64encode(b).decode();envelope={'source':b64((HERE/'register_cas.py').read_bytes()),'packet':{'authorization':b64(raw),'files':{k:b64(v)for k,v in files.items()}}}
 report={'state':'ISSUED_RESTORE33_ONLY_REGISTRATION_NO_PHASE_SUBMITTED','startsAt':now,'registrationExpiresAt':expires,'rolesSha256':ROLE_SHA,'rolesLifetimeExtended':False,'restorationDeadline':roles['restorationDeadline'],'policyExpiresAt':policy['expiresAt'],'registrationSha256':sha(raw),'policySha256':sha(policy_raw),'dispatcherSha256':sha(dispatcher),'carrierSha256':sha(carrier),'basisSha256':basis_pin,'independentReviewSha256':review_pin,'hostSourcePinsSha256':HOST_PIN,'hostReviewSha256':HOST_REVIEW_PIN,'restoreRequestKey':host['jobId'],'phaseSubmitted':False}
 out=Path(outdir).resolve();assert out.parent==CONTROL.resolve()and not out.exists();out.mkdir(mode=0o700)
 for leaf,body in [('registration-authorization.json',raw),('registration-envelope.json',pack(envelope)),('original-cas-restore33-carrier.ISSUED.py',carrier),('direct33-restore02-only.json',policy_raw),('admin_exec.ISSUED.py',dispatcher),('roles-authorization.json',roles_raw),('ISSUED.json',pack(report))]:
  with(out/leaf).open('xb')as f:f.write(body)
 return report
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:])))
