"""Issue the one restore02 host input; never reissue finite role credentials."""
from pathlib import Path
import json,os,runpy,sys,time
_registration=runpy.run_path(str(Path(__file__).resolve().with_name('issue_registration.py')),run_name='restore33_issuer_api')
HERE,ROOT,CONTROL,HOST,HOST_PIN,ROLE_SHA,REFERENCE,sha,pack,checked,reviewed=(_registration[k]for k in ('HERE','ROOT','CONTROL','HOST','HOST_PIN','ROLE_SHA','REFERENCE','sha','pack','checked','reviewed'))
TEMPLATE_SHA='44aa12c0f7adf3a794c232f528154e68ee3c0f9b2ec2b1e58c75cc9ba765dd71'
def issue(registration_directory,review_file,review_pin,outdir):
 _,host=reviewed(review_file,review_pin);registration=Path(registration_directory).resolve();assert registration.parent==CONTROL.resolve()
 manifest=json.loads((registration/'ISSUED.json').read_bytes());assert manifest['state']=='ISSUED_RESTORE33_ONLY_REGISTRATION_NO_PHASE_SUBMITTED'and manifest['independentReviewSha256']==review_pin and manifest['rolesLifetimeExtended']is False and manifest['hostSourcePinsSha256']==HOST_PIN
 roles_raw=checked(registration/'roles-authorization.json',ROLE_SHA);roles=json.loads(roles_raw)
 policy=json.loads(checked(registration/'direct33-restore02-only.json',manifest['policySha256']));cas=runpy.run_path(str(HERE/'register_cas.py'));cas['validate_policy_delta'](policy,cas['ORIGINAL_POLICY'])
 template=json.loads(checked(HOST/'HOST-AUTHORITY.UNISSUED.json',TEMPLATE_SHA));now=time.time_ns()//1000000
 expires=min(now+900000,roles['restorationDeadline'],policy['expiresAt']);assert policy['startsAt']<=now and now+300000<expires
 assert template['rolesAuthoritySha256']==ROLE_SHA and template['requestKey']==host['jobId']==manifest['restoreRequestKey']
 authority={**template,'startsAt':now,'expiresAt':expires,'authorizationReference':REFERENCE,'independentReviewSha256':review_pin}
 # Same frozen T45 validator, with its exact private job key, no native invocation.
 folder=Path(host['bundleDirectory']);sys.path.insert(0,str(folder));os.environ['ERP_SHARED_JOB_ID']=host['jobId'];os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+host['jobId']
 api=runpy.run_path(str(folder/host['script']),run_name='local_authority');api['validate'](authority,'restore',now)
 raw=pack(authority);out=Path(outdir).resolve();assert out.parent==CONTROL.resolve()and not out.exists();out.mkdir(mode=0o700)
 report={'state':'ISSUED_RESTORE02_HOST_ONLY_NOT_EXECUTED','path':str(out/'host-authorization.json'),'sha256':sha(raw),'bytes':len(raw),'key':host['jobId'],'startsAt':now,'expiresAt':expires,'rolesSha256':ROLE_SHA,'rolesLifetimeExtended':False,'restorationDeadline':roles['restorationDeadline'],'policyExpiresAt':policy['expiresAt'],'sourceReviewSha256':review_pin,'hostSourcePinsSha256':HOST_PIN,'serverAction':False}
 for name,body in [('host-authorization.json',raw),('ISSUED.json',pack(report))]:
  with(out/name).open('xb')as f:f.write(body)
 return report
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:])))
