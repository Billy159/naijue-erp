"""Read original35 stop/restore receipts and resource metadata, never run a job."""
from pathlib import Path
import hashlib, json, runpy, shlex, sys

HERE = Path(__file__).resolve().parent
phase, policy_file, policy_pin, authority_pin, destination = sys.argv[1:]
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(Path(policy_file).read_bytes())==policy_pin
rules=json.loads(Path(policy_file).read_bytes());rule=rules['jobs'][phase]
raw=(Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL39-SOURCE-SUCCESSOR-02')/phase/'bundle'/rule['authorityLeaf']).read_bytes()
assert sha(raw)==authority_pin
actual_authority=json.loads(raw);assert actual_authority['requestKey']==rule['jobId']
service=actual_authority['service']
assert service is None or service['serviceKey']=='t45-first-r3-native-service-start-20261116-39'
service_cid=service['containerId'] if service is not None else None
assert phase in ('stop', 'restore') and len(authority_pin) == 64
program = r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
PHASE=PHASE_LITERAL
AUTHORITY=AUTHORITY_LITERAL
KEY='t45-r3-ordinary39-'+('preserve-stop' if PHASE=='stop' else 'auth-restore')+'-20261116-01'
START='t45-first-r3-native-service-start-20261116-39'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/KEY
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p,uid=0):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=65536
  raw=f.read(65537);ident=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
  assert len(raw)==s.st_size and ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat())
 return raw
out={'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'requestKey':KEY,'phase':PHASE,'PGConnections':0,'mutations':0,'authenticationSnapshotBodiesOrDigestsRead':False,'rootPins':{}}
raw=read(B/'r3-outer-terminal.json');assert raw==read(C/'results'/(KEY+'.json'),1000)
out.update(terminal=json.loads(raw),terminalRootPublicSha256=sha(raw));out['rootPins']['terminal']=sha(raw)
leaves={'stop':[('normal05-preserve-stop-result.json','result')],
 'restore':[('maintenance-auth-result.json','result'),('maintenance-auth-cleanup.json','cleanup'),('maintenance-auth-inside.json','inside')]}
for leaf,field in leaves[PHASE]:
 p=B/'results'/leaf
 if not p.is_file():continue
 raw=read(p);public=read(C/'jobs'/KEY/'results'/leaf,1000);value=json.loads(raw);assert value==json.loads(public)
 out[field]=value;out['rootPins'][field]=sha(raw)
 if field=='result':out.update(resultObjectsEqual=True,publicResultSha256=sha(public))
cleanup=R/'state/native-services'/START/'cleanup.json'
if PHASE=='stop' and cleanup.is_file():
 raw=read(cleanup);out['cleanup']=json.loads(raw);out['rootPins']['cleanup']=sha(raw);out['cleanupRootSha256']=sha(raw)
 out['cleanupMatchesResult']=out.get('result',{}).get('cleanupSha256')==sha(raw)
data=R/'state'/R.name/'data';s=data.lstat();identity=dict(device=s.st_dev,inode=s.st_ino,uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode))
assert data.resolve()==data and stat.S_ISDIR(s.st_mode) and identity==dict(device=66304,inode=13502421,uid=61035,gid=61035,mode=0o700)
out.update(actualDataDirectoryIdentity=identity,pgdataPidAbsent=not os.path.lexists(data/'postmaster.pid'))
fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}'
ids=[('original36Service',SERVICE_CID_LITERAL)] if SERVICE_CID_LITERAL is not None else []
if PHASE=='restore' and out.get('cleanup',{}).get('cid'):ids.append(('ownRestoreContainer',out['cleanup']['cid']))
for field,cid in ids:
 assert len(cid)==64 and all(c in '0123456789abcdef' for c in cid)
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,cid],capture_output=True,timeout=5)
 assert q.returncode==0 and not q.stderr and len(q.stdout)<=4096
 observed=json.loads(q.stdout);assert observed['id']==cid and observed['image']=='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
 out[field]=observed
q=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,timeout=5);assert q.returncode==0 and not q.stderr;out['hostPortAbsent']=out['portAbsent']=not q.stdout.strip()
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5);assert q.returncode==0 and not q.stderr
active=[row.split()[0] for row in q.stdout.decode().splitlines() if row.strip()];out['activeOperationUnits']=active
unit='naijue-erp-op-b16447fb-'+sha(KEY.encode())[:12]+'.service';out['ownOperationUnitInactive']=unit not in active;out['noOtherOperationUnits']=all(name==unit for name in active)
if PHASE=='restore':
 custody=R/'state/native-services/ordinary39-auth-20261116-01';restored=custody/'restored.json'
 out['privateRestorationReceiptPresent']=restored.is_file()
 if restored.is_file():
  raw=read(restored);receipt=json.loads(raw);out['privateRestorationReceiptSha256']=sha(raw);out['privateRestorationReceiptMatched']=receipt==out.get('result',{}).get('result')
 metadata={}
 for leaf in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json','restored.json'):
  p=custody/leaf;exists=os.path.lexists(p);item={'exists':exists}
  if exists:
   s=p.lstat();assert p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o400 and s.st_nlink==1
   item.update(device=s.st_dev,inode=s.st_ino,uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),bytes=s.st_size)
  metadata[leaf]=item
 out['privateRecoveryFilesMetadataOnly']=metadata
request_raw=read(B/'request.json');request=json.loads(request_raw)
assert request['jobId']==KEY and request['args']==[AUTHORITY]
assert request['script']==('normal05_preserve_stop.py' if PHASE=='stop' else 'ordinary05_roles_job.py') and request['timeoutSeconds']==(120 if PHASE=='stop' else 300)
out['actualServerRequestSha256']=sha(request_raw);out['actualServerRequestArgs']=request['args']
c05=R/'state/real-first-20261110-r3';c=c05.lstat();out['retainedC05SearchMetadata']={'slot':'C05','device':c.st_dev,'inode':c.st_ino,'uid':c.st_uid,'gid':c.st_gid,'mode':stat.S_IMODE(c.st_mode)}
out['retainedC05SearchMatches']=(c05.resolve()==c05 and (c.st_dev,c.st_ino,c.st_uid,c.st_gid,stat.S_IMODE(c.st_mode))==(66304,13502393,0,61035,0o710))
print(json.dumps(out,sort_keys=True))
'''.replace('PHASE_LITERAL', repr(phase)).replace('AUTHORITY_LITERAL', repr(authority_pin)).replace('SERVICE_CID_LITERAL',repr(service_cid))
client = runpy.run_path(str(HERE.parent / 'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'))['load_client']()
raw = client['remote'](client['state'](), shlex.join(['sudo', '-n', '/usr/bin/python3', '-I', '-S', '-c', program]))
out = Path(destination)
with out.open('xb') as f:
    f.write(raw)
v = json.loads(raw)
print(json.dumps({'receipt': str(out), 'sha256': hashlib.sha256(raw).hexdigest(), 'checkedAtUTC': v['checkedAtUTC'],
                  'terminal': v['terminal'], 'rootPins': v['rootPins'], 'pgdataPidAbsent': v['pgdataPidAbsent'],
                  'activeOperationUnits': v['activeOperationUnits'], 'resultStatus': v.get('result', {}).get('status')}, sort_keys=True))
