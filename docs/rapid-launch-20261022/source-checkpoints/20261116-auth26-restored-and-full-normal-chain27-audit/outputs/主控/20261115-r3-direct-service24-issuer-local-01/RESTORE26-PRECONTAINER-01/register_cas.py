"""Existing three-file CAS registration for seven exact direct REAL phases."""
from pathlib import Path
from types import ModuleType,SimpleNamespace
import base64,fcntl,hashlib,json,os,re,stat,subprocess,sys,time
GRANT='b16447fbc81f4d64'
B=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
P=Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT)
C=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
ENTRY=B/'r3-restore26-precontainer-registration-source-20261116-01/register_cas.py'
AUDIT=B/'r3-restore26-precontainer-registration-cas-20261116-01'
OLD_DISPATCHER='8dc501d8125789b9b9fdab34a123647098f712f71637389ef9f0872119c97c14'
CORE='1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d'
HELPER='165c5c4c2c1f6d3f6b6ba9f555aee42d112b6881740b61384aed45d7669ace0b'
TEMPLATE='f769d21db10f432ef074888a235cbb0d7b6f58e6d4c4355186041095bf2ebc1d'
JOBS={'apply': 't45-r3-ordinary26-auth-apply-20261116-01', 'install': 't45-r3-batched-install-20261115-01', 'materialize': 't45-r3-batched-root03-source-delta-20261116-01', 'restore': 't45-r3-ordinary26-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-26', 'stop': 't45-r3-ordinary26-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
BASIS={
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_absent22_continuation.py'):'16e54ec54cf945c086e547050fa7893e856b05e217f3b0b6feb650797e56e4fa',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-absent22-continuation.json'):'27c9b661d7ade353bb42be2b23f104879462749c117779d971d3c4d5b9cd6282',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_unknown22_inspect.py'):'32aecd9f5ee7079f243b78f89d5a58e051610e16e10490cb8a12538a74a9863f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-unknown22-inspect.json'):'7fe44435553def39809cf8ad1a63532cd1aeb23f9bd8f1d45d13acef2d7c0e04',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original04_absent22_continuation.py'):'87c543d66e6a6d19f50d640cf8c1d483fb3e16a4eac4fcabcb6d1e1a2147a781',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original04-absent22-continuation.json'):'d2698af3e4d2acebf3198c93086af46cc9e20007b2ed4cac6839cc865730e913',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_inspect04.py'):'d39aac90e056fec55e23e1eea2086b62c52590edd61d7e438c55449a28401d95',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-inspect04.json'):'a3b5b3e3f0616c6f23007f3cf0a7ed34aead49b5cf2e486ded76c99e3961e99a',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_apply02.py'):'720e1c9344650f55351e8654b409d7a3b3c9e38e442be06911893907911c814d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-apply02.json'):'322a6ad5ab56f2ef268a9c93b5641d00c43b6076213652cd2289d411ae3e9a65',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_continuation.py'):'982e5b0178bd69a07d0d659d8793033a36093283c16632ea7811a9f53588dd1f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-continuation.json'):'9f24ba07d7251e35c58d91e409377a46f62988a65845da92d6c1899ea097307b',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_continuation.py'):'162dfa8b90549da125465cde04d0936cf2d0592c6702a763e13fc47dca0d4c2e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-continuation.json'):'a85a825c170cdb7adfc4394d1a843511d0563668be4992955809dfed10af21da',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_inspect03.py'):'fd84d560bc8903746fc31babfcab04e85f339ad1c2eff0bf31a5482a75d0591f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-inspect03.json'):'cbed4bf8f7c5bdf28ff7187d7cdde45aff7fe049bb640631a2f42c9bfc39374e',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent_continuation.py'):'909abe203293f791cdaa909227a5a90e0ae16da2ab6fa45390d271f16f2ec19a',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent-continuation.json'):'74dea44d2b88283b1946aea35baee9c216dee6c2e2f1b19f440446e8390c377a',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py'):'4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/failed19-readonly-recovery.json'):'338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py'):'8dc501d8125789b9b9fdab34a123647098f712f71637389ef9f0872119c97c14',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py'):'1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.before-r3-05-continuity.py'):'5bf72fc20dfa597c81a9eb5ae8956c497a980b1497e2cfbfe8d469932b27ad49',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/policy.json'):'25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/active.json'):'0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/bindings/writer.json'):'f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json'):'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json'):'c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-result.json'):'2dce7c2a3b0315c9291f7f8c9076879dcadb2d2427ef71c1883653cf254e994d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-cleanup.json'):'61b30a3bec3239c283faff791e876989e3bc4544e25f2611109cc24e603d1919',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched.py'):'d60c68633383f5da9e5054d518010bb6a4f34d3a068c51f87fa738d6f36a6cef',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct24-batched-real.json'):'cb384d2176e3a8c4a46fd3ffb1ce1e4b82b293f41c5647310c10f1b8e8a10898',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/r3-outer-terminal.json'):'6d2005bfd5cc61e34fa5e25eb0e5ef58b7addfa0490306ef634221c591e63461',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/results/maintenance-auth-result.json'):'77f6c66f5252fb5238e4f3cc1ed8dff030efd00413c09876d09d8fa63f217b21',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/bundle/ordinary05_roles_job.py'):'0d677daf02c1d567295efab3965dd8b90ce755188bb78b9b75cc8c56dea27451',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched_apply02.py'):'da4303f6597962842d0db5993396ca1012e2181ee2224ddec9f4bd01b1a69eef',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/r3-outer-terminal.json'):'0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/results/normal05-preserve-stop-result.json'):'24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/r3-outer-terminal.json'):'977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-result.json'):'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-cleanup.json'):'fe681d7e4075572131519c74f64802dc964d859230255e02697cca25e474ea9b',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_batched.py'):'57d8ea9c363f4c4db743b99bfacafdafecdb644d8e65894a416ec2a418aa2810',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_restore_precontainer.py'):'ec89f4f472f559e621974b8f8187308b1de0d4049ddb568c9a1aa5cd545aadea',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct25-batched-real.json'):'8c6a2a9fa827da4fd8a81cdfce37c379d743886a02170724cc6ca221129a3afa',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/r3-outer-terminal.json'):'79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/results/normal-service-result.json'):'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/r3-outer-terminal.json'):'1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-result.json'):'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'281f7858e447a0665ad02444c43e2eb971651415c99a8e8307ad0db3c7664acd',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_batched.py'):'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct26-batched-real.json'):'ed27c318bdca44ff22250361b4b478f07ee87575119e771e707c8186dfadea59',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/r3-outer-terminal.json'):'db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/results/batched-source-materialization.json'):'cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/r3-outer-terminal.json'):'c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-result.json'):'0545e87f04e9a6f66de318e911f527003d8902ac787d1844567e02c400a998af',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-cleanup.json'):'a657740b94edbad211e2e78fafad67fb25c513c255ec592472e6b2fbc60164c6',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/r3-outer-terminal.json'):'853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/results/normal-service-result.json'):'5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
}
NEW_MODULE=P/'r3_direct26_restore_precontainer.py';NEW_POLICY=H/'direct26-batched-real.json'
FILES={'module','policy','dispatcherTemplate'}
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
def need(v,c):
 if not v:raise ValueError('RESTORE26_PRECONTAINER_REGISTRATION_'+c)
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return time.time_ns()//1000000
def pack(v):return(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def identity(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def read(path,owner=0):
 need(path.resolve()==path,'CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=4*1024**2,'PROTECTED_INPUT_REQUIRED')
  raw=f.read(4*1024**2+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
 return raw,identity(s)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,raw,mode=0o600):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fchown(f.fileno(),0,0);os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
 sync(path.parent)
def scope():
 return dict(format='T45_RESTORE26_PRECONTAINER_REGISTRATION_CAS_V1',grantId=GRANT,
  oldDispatcherSha256=OLD_DISPATCHER,originalCoreSha256=CORE,newModuleSha256=HELPER,dispatcherTemplateSha256=TEMPLATE,
  newModulePath=str(NEW_MODULE),newPolicyPath=str(NEW_POLICY),publishOrder=['module','policy','dispatcher'],
  jobKeys=JOBS,sourceRegistrationOnly=True,businessDatabaseWrites=0,oldHistoryChanged=False)
def decode(packet,expected):
 need(type(packet)is dict and set(packet)=={'authorization','files'},'EXACT_PACKET_REQUIRED')
 raw=base64.b64decode(packet['authorization'],validate=True);need(sha(raw)==expected,'EXTERNAL_AUTHORITY_BYTES_DIFFER');a=json.loads(raw);fixed=scope()
 need(set(a)==set(fixed)|{'sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','authorizationReference','independentReviewSha256'}
  and all(a[k]==v for k,v in fixed.items())and type(a['startsAt'])is type(a['expiresAt'])is int
  and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+900000,'EXACT_FINITE_AUTHORITY_REQUIRED')
 need(type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512
  and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256'])and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_REVIEWED_SOURCE_REQUIRED')
 need(set(packet['files'])==set(a['sourcePins'])==FILES and set(a['oldIdentities'])=={str(p)for p in BASIS}|{'executionLock'},'EXACT_INPUT_KEYS_REQUIRED')
 files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
 need(all(0<len(raw)<=4*1024**2 and sha(raw)==a['sourcePins'][key]for key,raw in files.items())
  and sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_NEW_BYTES_REQUIRED')
 return a,files,raw

def snapshot(a,dispatcher=OLD_DISPATCHER,policy=None):
 result={}
 for path,pin in BASIS.items():
  raw,meta=read(path);expected=dispatcher if path==P/'admin_exec.py'else policy if path==NEW_POLICY and policy is not None else pin
  need(sha(raw)==expected and(path==P/'admin_exec.py'and dispatcher!=OLD_DISPATCHER or path==NEW_POLICY and policy is not None or meta==a['oldIdentities'][str(path)]),'ORIGINAL_BASIS_CHANGED')
  result[path]=(raw,meta)
 return result

def quiet_unused():
 host=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 need(not os.path.lexists(host/'state/fresh35-first-production-20261110-r3/data/postmaster.pid'),'PG_PID_PRESENT')
 for grant in(GRANT,'5cc58239751e4e2a'):
  control=C.with_name('grant-'+grant);worker=B.with_name('grant-'+grant)
  for phase,key in JOBS.items():
   if grant==GRANT and phase in ('materialize','apply','start'):
    pin,status={'materialize':('db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8','COMPLETED'),'apply':('c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0','COMPLETED'),'start':('853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39','FAILED')}[phase]
    raw=read(worker/'jobs'/key/'r3-outer-terminal.json')[0];public=read(control/'results'/(key+'.json'),1000)[0];v=json.loads(raw)
    need(sha(raw)==pin and raw==public and v.get('jobId')==key and v.get('status')==status and v.get('exitCode')==(2 if phase=='start'else 0) and v.get('phaseStarted') is True,'EXACT_COMPLETED_OR_FAILED26_PREDECESSOR_REQUIRED');continue
   need(not any(os.path.lexists(p)for p in(control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'jobs'/key,control/'results'/(key+'.json'),worker/'jobs'/key)),'KEY_ALREADY_PRESENT_READ_ORIGINAL_ONLY')
 key=JOBS['start'];result=read(B/'jobs'/key/'results/normal-service-result.json')[0];public=read(C/'jobs'/key/'results/normal-service-result.json',1000)[0]
 need(sha(result)=='5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca' and sha(public)=='ff2e88f0b8cb3ad04ce5c4c06e07818d8b7c0456b8507b43bf81f529c34155d1' and json.loads(result)==json.loads(public),'EXACT_FAILED_START26_RESULT_REQUIRED')
 boot=host/'state/native-services'/key
 expected_names=['authority-61035', 'batched161-run.mjs', 'fresh35-production-carrier.py', 'launchers-61035', 'materialize-r3-r2.py', 'materialized-profile.json', 'normal_service05_after08.py', 'normal_service05_after08_proof.py', 'operator-host.mjs', 'operator-manifest.json', 'operator-stream-import-cli.mjs', 'operator-stream-program.mjs', 'r3_05_readonly.py', 'readonly-mount-plan.json', 'service-start-authorization.json']
 st=boot.lstat();need(stat.S_ISDIR(st.st_mode)and st.st_uid==0 and stat.S_IMODE(st.st_mode)==0o700 and set(p.name for p in boot.iterdir())==set(expected_names),'EXACT_BEFORE_CONTAINER_BOOT_REQUIRED')
 public_sources={'batched161-run.mjs': 'f69e4d748c0c1dd3e808f05f24cfa20eca16590d8e8f81423d107d88d10a2357', 'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service05_after08.py': '1d63fc62b01ac9611e3a583757ac84e42f37a04f82c68a90bbb43a905cceb84c', 'normal_service05_after08_proof.py': 'ea83a051a87261c04a244918507fb46e5b8a53b7b02f51e4ebf42c1ad6198efe', 'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae', 'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184', 'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e', 'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6', 'r3_05_readonly.py': '57caa6841a04a86f5994c98ca4ae5213e3b44e1c9b6b6497f97fc3a2e053d971'}
 for name,pin in public_sources.items():
  raw,meta=read(boot/name);need(sha(raw)==pin and meta[4]==0o400,'EXACT_BEFORE_CONTAINER_SOURCE_REQUIRED')
 need(not any(os.path.lexists(p)for p in(B/'jobs'/key/'results/normal-service-intent.json',B/'jobs'/key/'results/normal-service-incomplete.json',boot/'carrier-birth.json',boot/'cleanup.json',boot/'retained-ack.json',host/'authority/fresh35-current-production-service-v2-service-26.json')),'UNEXPECTED_START26_CREATION_EVIDENCE')
 q=subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation='+key],capture_output=True,timeout=5);need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'START26_CONTAINER_PRESENT_OR_UNKNOWN')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5);need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'OPERATION_UNIT_ACTIVE_OR_UNKNOWN')
def load(raw,path,name):
 m=ModuleType(name);m.__file__=str(path);exec(compile(raw,str(path),'exec'),m.__dict__);return m
def original_wrapper_basis(raw,cfg):
 wrapper=load(raw,P/'admin_exec.py','original_absent20_wrapper')
 _,prior=wrapper.r3_continuity(cfg)
 need(prior.__class__.__name__=='Original02AbsentContinuation'
  and prior.policy_sha256=='ed27c318bdca44ff22250361b4b478f07ee87575119e771e707c8186dfadea59',
  'EXACT_EXISTING_ABSENT21_WRAPPER_REQUIRED')
 readonly=prior.readonly
 need(readonly.__class__.__name__=='ReadOnlyRecovery'
  and readonly.policy_sha256==BASIS[H/'failed19-readonly-recovery.json'],
  'EXACT_EXISTING_READONLY_WRAPPER_REQUIRED')
 prior.original_basis()
 prior.core.stopped_generation(prior.old.service)
 need(prior.child_settled('t45-first-20261110-r3-real-execute-20261114-06','writer'),'EXACT_ORIGINAL_WRITER_PROCESS_NOT_SETTLED')
 return readonly

def installed_wrapper(raw,cfg):
 wrapper=load(raw,P/'admin_exec.py','registration_readback');core,recovery=wrapper.r3_continuity(cfg)
 need(recovery.__class__.__name__=='Original02AbsentContinuation'and recovery.policy_sha256==sha(read(NEW_POLICY)[0]),'NEW_WRAPPER_NOT_BOUND')
 recovery.original_basis()
 recovery.core.stopped_generation(recovery.old.service)
 return recovery

def validate_policy_delta(policy, previous):
 need(set(policy)=={'format','grantId','startsAt','expiresAt','jobs'}
  and policy['format']=='T45_R3_DIRECT26_BATCHED_REAL_V1'
  and policy['grantId']==previous['grantId']==GRANT
  and type(policy['startsAt']) is type(policy['expiresAt']) is int
  and 0 < policy['startsAt'] < policy['expiresAt'] <= policy['startsAt']+7200000
  and set(policy['jobs'])==set(JOBS), 'EXACT_SEVEN_DIRECT_REAL_PHASES_REQUIRED')
 entries={'materialize':('materialize-batched-source.py','materialize-authorization.json'),
  'apply':('ordinary05_roles_job.py','host-authorization.json'),
  'start':('normal_service05_after08.py','service-start-authorization.json'),
  'install':('batched_install_host.py','install-authorization.json'),
  'writer':('batched_real_host.py','writer-authorization.json'),
  'stop':('normal05_preserve_stop.py','normal05-preserve-stop-input.json'),
  'restore':('ordinary05_roles_job.py','host-authorization.json')}
 limits={'materialize':300,'apply':300,'start':300,'install':900,'writer':3600,'stop':120,'restore':300}
 for phase,rule in policy['jobs'].items():
  need(set(rule)=={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'}
   and rule['jobId']==JOBS[phase] and (rule['script'],rule['authorityLeaf'])==entries[phase]
   and type(rule['timeoutSeconds']) is int and 1<=rule['timeoutSeconds']<=limits[phase]
   and rule['deadlineField']=='expiresAt' and type(rule['bundlePins']) is dict
   and 1<=len(rule['bundlePins'])<=127 and rule['script'] in rule['bundlePins']
   and rule['authorityLeaf'] not in rule['bundlePins']
   and all(type(k)is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,120}',k)
           and type(v)is str and re.fullmatch('[a-f0-9]{64}',v) for k,v in rule['bundlePins'].items()),
   'EXACT_DIRECT_REAL_RULE_REQUIRED')

def validate_restore_only(policy,previous):
 need(all(policy[k]==previous[k] for k in ('format','grantId','startsAt','expiresAt')) and set(policy['jobs'])==set(previous['jobs'])==set(JOBS),'ORIGINAL_FINITE_POLICY_CHANGED')
 need(all(policy['jobs'][p]==previous['jobs'][p] for p in JOBS if p!='restore'),'OTHER_PHASE_RULE_CHANGED')
 need(all(policy['jobs']['restore'][k]==previous['jobs']['restore'][k] for k in ('jobId','script','authorityLeaf','timeoutSeconds','deadlineField')),'RESTORE_JOB_ID_OR_LIMIT_CHANGED')
 before=previous['jobs']['restore']['bundlePins'];after=policy['jobs']['restore']['bundlePins']
 need(set(before)==set(after) and all(after[k]==before[k] for k in before if k!='ordinary05_roles_job.py') and after['ordinary05_roles_job.py']!=before['ordinary05_roles_job.py'],'ONLY_RESTORE_WRAPPER_PIN_MAY_CHANGE')

def render_dispatcher(files):
 need(sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_WRAPPER_SOURCE_REQUIRED')
 policy=json.loads(files['policy']);need(set(policy)=={'format','grantId','startsAt','expiresAt','jobs'}and set(policy['jobs'])==set(JOBS),'EXACT_NEW_POLICY_KEYS_REQUIRED')
 needle=b'R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None';template=files['dispatcherTemplate'];need(template.count(needle)==1,'EXACT_TEMPLATE_PLACEHOLDER_REQUIRED')
 dispatcher=template.replace(needle,('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
 compile(dispatcher,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
 return dispatcher

def register(a,files,authority):
 need(not any(os.path.lexists(p)for p in(AUDIT,NEW_MODULE)),'REGISTRATION_ALREADY_PRESENT_OR_UNKNOWN_NO_REPLAY')
 for folder in(B,P,H,LOCK.parent):
  for path in[*reversed(folder.parents),folder]:
   s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022,'PROTECTED_REGISTRATION_DIRECTORY_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  need(identity(os.fstat(lock.fileno()))==a['oldIdentities']['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  old=snapshot(a);quiet_unused()
  core=load(old[P/'r3_write_continuity.py'][0],P/'r3_write_continuity.py','original_core')
  cfg=core.strict(core.read(P/'grant.json'))
  original_wrapper_basis(old[P/'admin_exec.py'][0],cfg)
  policy=core.strict(files['policy'])
  validate_policy_delta(policy,core.strict(old[NEW_POLICY][0]))
  validate_restore_only(policy,core.strict(old[NEW_POLICY][0]))
  need(policy['startsAt']==core.strict(old[NEW_POLICY][0])['startsAt'] and now()<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),
       'EXACT_REGISTRATION_POLICY_WINDOW_REQUIRED')
  dispatcher=render_dispatcher(files)
  need(now()+30000<a['expiresAt'],'REGISTRATION_WINDOW_TOO_SHORT')
  AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
  put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',old[P/'admin_exec.py'][0]);put(AUDIT/'old-policy.bin',old[NEW_POLICY][0]);put(AUDIT/'old-identities.json',pack(a['oldIdentities']))
  result={'status':'REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY','published':[],'businessDatabaseWrites':0,'automaticReplay':False};pending=P/'.restore26-precontainer-dispatcher.pending'
  try:
   put(NEW_MODULE,files['module'],0o644);result['published'].append('module')
   policy_pending=H/'.restore26-precontainer-policy.pending'
   put(policy_pending,files['policy'],old[NEW_POLICY][1][4]);snapshot(a);quiet_unused()
   need(now()<a['expiresAt'] and read(NEW_POLICY)==old[NEW_POLICY],'EXACT_POLICY_IDENTITY_CAS_FAILED')
   os.replace(policy_pending,NEW_POLICY);sync(H);result['published'].append('policy')
   need(read(NEW_MODULE)[0]==files['module']and read(NEW_POLICY)[0]==files['policy'],'NEW_FILES_READBACK_DIFFERS')
   # The original dispatcher remains active until the verified replacement.
   installed_wrapper(dispatcher,cfg)
   put(pending,dispatcher,old[P/'admin_exec.py'][1][4]);snapshot(a,policy=sha(files['policy']));quiet_unused()
   need(now()<a['expiresAt']and read(P/'admin_exec.py')==old[P/'admin_exec.py'],'EXACT_DISPATCHER_IDENTITY_CAS_FAILED')
   put(AUDIT/'publish-intent.json',pack({'oldDispatcherSha256':OLD_DISPATCHER,'newDispatcherSha256':sha(dispatcher),'newPolicySha256':sha(files['policy']),'newModuleSha256':HELPER}))
   os.replace(pending,P/'admin_exec.py');sync(P);result['published'].append('dispatcher')
   need(read(P/'admin_exec.py')[0]==dispatcher,'PUBLISHED_DISPATCHER_READBACK_DIFFERS')
   snapshot(a,sha(dispatcher),sha(files['policy']));quiet_unused();installed_wrapper(read(P/'admin_exec.py')[0],cfg)
   need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED_AFTER_PUBLICATION')
   result.update(status='EXACT_RESTORE26_PRECONTAINER_REGISTERED_NO_NEW_PHASE_SUBMITTED',
    moduleSha256=HELPER,policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),oldHistoryPreserved=True,originalLockPreserved=True,phaseSubmitted=False,rolesExecuted=False,postgresStarted=False)
  except BaseException as error:
   result.update(exceptionClass=type(error).__name__,safeCode=str(error)if isinstance(error,ValueError)and re.fullmatch('RESTORE26_PRECONTAINER_REGISTRATION_[A-Z0-9_]+',str(error))else None)
   try:result['observedDispatcherSha256']=sha(read(P/'admin_exec.py')[0])
   except Exception:result['observedDispatcherSha256']=None
  put(AUDIT/'result.json',pack(result));return result
if __name__=='__main__':
 need(sys.platform=='linux'and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0
  and sys.flags.isolated and sys.flags.no_site and Path(__file__)==ENTRY and len(sys.argv)==2
  and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'FIXED_ROOT_ENTRY_REQUIRED')
 os.umask(0o077);packet=sys.stdin.buffer.read(16*1024**2+1);need(len(packet)<=16*1024**2,'BOUNDED_PACKET_REQUIRED')
 a,files,authority=decode(json.loads(packet),sys.argv[1]);result=register(a,files,authority)
 print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_RESTORE26_PRECONTAINER_REGISTERED_NO_NEW_PHASE_SUBMITTED'else 2)
