
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
KEY='t45-r3-ordinary43-auth-restore-20261118-01'
LEAVES=['maintenance-auth-result.json', 'maintenance-auth-cleanup.json']
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
sha=lambda b:hashlib.sha256(b).hexdigest()
def take(path,uid):
 assert path.resolve()==path
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode)and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=131072
  raw=f.read(131073);assert len(raw)==s.st_size
 return raw
out={'requestKey':KEY,'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'PGConnections':0,'mutations':0,'automaticReplay':False,'terminal':None,'results':{},'presentAcrossExistingGrants':[]}
for root in(B.parent,C.parent):
 for grant in root.glob('grant-*'):
  for rel in('jobs/'+KEY,'requests/'+KEY+'.json','requests/'+KEY+'.tmp','results/'+KEY+'.json'):
   p=grant/rel
   if os.path.lexists(p):out['presentAcrossExistingGrants'].append(str(p))
t=B/'jobs'/KEY/'r3-outer-terminal.json'
if t.is_file():
 raw=take(t,0);assert raw==take(C/'results'/(KEY+'.json'),1000);v=json.loads(raw);assert v['jobId']==KEY
 out['terminal']={'sha256':sha(raw),'value':v}
for leaf in LEAVES:
 p=B/'jobs'/KEY/'results'/leaf;q=C/'jobs'/KEY/'results'/leaf
 if p.is_file()and q.is_file():
  raw=take(p,0);public=take(q,1000);v=json.loads(raw);assert v==json.loads(public)
  out['results'][leaf]={'rootSha256':sha(raw),'publicSha256':sha(public),'objectsEqual':True,'value':v}
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5);out['activeOperationUnits']=[x.split()[0]for x in q.stdout.decode().splitlines()if x.strip()]
data=ROOT/'state'/ROOT.name/'data';s=data.lstat();assert data.resolve()==data and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)
out['pgdataPidAbsent']=not os.path.lexists(data/'postmaster.pid')
q=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,check=True,timeout=5);out['originalPortAbsent']=not q.stdout.strip()

if out['terminal']is not None and out['terminal']['value']['status']=='COMPLETED'and out['terminal']['value']['exitCode']==0:
 result=out['results']['maintenance-auth-result.json']['value'];inner=result['result'];clean=out['results']['maintenance-auth-cleanup.json']['value']
 assert result['requestKey']==inner['requestKey']==KEY and result['phase']=='restore'and inner['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
 assert inner['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and inner['databaseStillStopped']is True and all(inner[k]is False for k in('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
 custody=ROOT/'state/native-services/ordinary43-auth-20261118-01';raw=take(custody/'restored.json',0);assert json.loads(raw)==inner
 out['privateSafeRestoreReceipt']={'sha256':sha(raw),'matchesWorkerInner':True};out['authenticationSnapshotBodiesOrDigestsRead']=False;meta={}
 for leaf in('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'):
  path=custody/leaf;s=path.lstat();assert path.resolve()==path and stat.S_ISREG(s.st_mode)and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o400 and s.st_nlink==1
  meta[leaf]=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
 out['privateRecoveryMetadataOnly']=meta
 assert all(clean[k]is True for k in('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved'))
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,clean['cid']],capture_output=True,check=True,timeout=5);assert not q.stderr and len(q.stdout)<=4096;state=json.loads(q.stdout)
 assert state==dict(id=clean['cid'],name='/'+KEY,image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',running=False,pid=0,exitCode=0,operation=KEY)
 assert out['pgdataPidAbsent']and out['originalPortAbsent']and not out['activeOperationUnits'];out['actualStoppedOwnRestoreContainer']=state

print(json.dumps(out,sort_keys=True))
