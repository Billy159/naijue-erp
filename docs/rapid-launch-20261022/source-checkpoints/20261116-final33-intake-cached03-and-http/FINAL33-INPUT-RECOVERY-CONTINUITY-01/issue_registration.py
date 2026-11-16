"""Issue only the independently reviewed finite final-input continuation."""
from pathlib import Path
from types import ModuleType,SimpleNamespace
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
def sha(b):return hashlib.sha256(b).hexdigest()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return raw

def issue(review_file,review_pin,basis_file,basis_pin,output_directory):
 os.umask(0o077)
 review=json.loads(checked(review_file,review_pin));assert review['state']=='SOURCE_PASS_RECOVERY_BOUNDARY_INCREMENT_ONLY_NOT_REGISTERED_OR_RUNTIME' and review['findings']==[]
 for leaf,row in review['files'].items():
  raw=checked(HERE/leaf,row['sha256']);assert len(raw)==row['bytes']
 basis=json.loads(checked(basis_file,basis_pin));assert basis['state']=='READONLY_FINAL33_INPUT_RECOVERY_REGISTRATION_BASIS' and basis['basisMismatches']==[] and basis['postgresConnections']==basis['writes']==0 and not any(basis['candidatePaths'].values())
 api=runpy.run_path(str(HERE/'register_cas.py'),run_name='external_main_issuer')
 now=time.time_ns()//1000000;assert 0<=now-basis['checkedAtMs']<=900000
 assert basis['actualPins']=={str(path):pin for path,pin in api['BASIS'].items()}
 assert set(basis['oldIdentities'])==set(basis['actualPins'])|{'executionLock'} and basis['oldIdentities']['executionLock']==api['LOCK_ID']
 policy_raw=(HERE/'POLICY.RETAINED.json').read_bytes();assert sha(policy_raw)=='cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182'
 policy=json.loads(policy_raw);assert policy['startsAt']<=now and now+1800000<policy['expiresAt']<=int(basis['grantExpiresAtEpoch']*1000)
 files={'module':(HERE/'r3_final33_input_recovery.py').read_bytes(),'policy':policy_raw,'dispatcherTemplate':(HERE/'admin_exec.INPUT-RECOVERY.py').read_bytes()}
 dispatcher=api['render'](files)
 module=ModuleType('reviewed_policy_validator');exec(compile(files['module'],'reviewed_policy_validator','exec'),module.__dict__)
 root=api['H'];fake=SimpleNamespace(read=lambda p:files['policy'],sha=sha,strict=json.loads,digest=lambda s:isinstance(s,str)and len(s)==64,GRANT=api['GRANT'],need=lambda ok,code:None if ok else (_ for _ in ()).throw(ValueError(code)))
 module.Final33InputContinuation(fake,SimpleNamespace(root=root),{'grantId':api['GRANT'],'expiresAtEpoch':basis['grantExpiresAtEpoch']},sha(files['policy']))
 reference='User standing same-private-channel data reception authorization and actual November16 11:40 final batch; preserve original R3 hold, approved frozen data and never-submitted writer. Exact54 groups/211 original fragments, no PostgreSQL or role operation.'
 authorization={**api['scope'](),'sourceSha256':sha((HERE/'register_cas.py').read_bytes()),'sourcePins':{k:sha(v)for k,v in files.items()},'oldIdentities':basis['oldIdentities'],'startsAt':now,'expiresAt':now+900000,'authorizationReference':reference,'independentReviewSha256':review_pin}
 authority=api['pack'](authorization);carrier=(HERE/'original-cas-input-recovery-carrier.UNISSUED.py').read_bytes()
 assert ("SOURCE='"+authorization['sourceSha256']+"'").encode()in carrier
 for literal,value in [('AUTH_SHA_LITERAL',repr(sha(authority))),('AUTH_START_LITERAL',str(now)),('AUTH_EXPIRES_LITERAL',str(authorization['expiresAt']))]:
  assert carrier.count(literal.encode())==1;carrier=carrier.replace(literal.encode(),value.encode())
 compile(carrier,'original-root-carrier','exec')
 b64=lambda raw:base64.b64encode(raw).decode()
 envelope={'source':b64((HERE/'register_cas.py').read_bytes()),'packet':{'authorization':b64(authority),'files':{k:b64(v)for k,v in files.items()}}}
 out=Path(output_directory).resolve();assert out.parent==(ROOT/'outputs/主控').resolve();out.mkdir(mode=0o700)
 report={'state':'FINITE_FINAL33_INPUT_RECOVERY_REGISTRATION_ISSUED_NO_SERVER_ACTION','directory':str(out),'issuedAt':now,'registrationExpiresAt':authorization['expiresAt'],'policyExpiresAt':policy['expiresAt'],'registrationSha256':sha(authority),'carrierSha256':sha(carrier),'sourceSha256':authorization['sourceSha256'],'sourcePins':authorization['sourcePins'],'dispatcherSha256':sha(dispatcher),'basisSha256':basis_pin,'independentReviewSha256':review_pin,'groups':54,'originalFragments':211,'phaseSubmitted':False,'postgresConnections':0,'businessWrites':0}
 for leaf,raw in [('registration-authorization.json',authority),('registration-envelope.json',api['pack'](envelope)),('original-cas-input-recovery-carrier.ISSUED.py',carrier),('final33-input-reception-recovery.json',files['policy']),('admin_exec.ISSUED.py',dispatcher),('ISSUED.json',api['pack'](report))]:
  with(out/leaf).open('xb')as f:f.write(raw)
 return report
if __name__=='__main__':print(json.dumps(issue(*sys.argv[1:])))
