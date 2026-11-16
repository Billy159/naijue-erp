"""One authorized read of immutable existing34 public C; no mutation/PG/job."""
from pathlib import Path
import hashlib,json,runpy,shlex,ast
D=Path(__file__).resolve().parent
OUT=D/'PRIOR34-C-METADATA.json'
assert not OUT.exists(),'ORIGINAL_C_METADATA_ALREADY_SAVED_DO_NOT_REREAD'
program=r'''import os,stat,json,hashlib,datetime
from pathlib import Path
p=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-34.json')
assert os.getuid()==os.geteuid()==0 and p.resolve()==p
def ident(s):return dict(device=s.st_dev,inode=s.st_ino,uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),nlink=s.st_nlink,bytes=s.st_size,mtimeNs=s.st_mtime_ns,ctimeNs=s.st_ctime_ns)
before=p.lstat()
assert stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0 and before.st_nlink==1 and not before.st_mode&0o022 and 0<before.st_size<=65536
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
with os.fdopen(fd,'rb') as f:
 assert ident(os.fstat(f.fileno()))==ident(before)
 raw=f.read(65537)
 assert len(raw)==before.st_size and ident(os.fstat(f.fileno()))==ident(before)==ident(p.lstat())
pin=hashlib.sha256(raw).hexdigest()
assert pin=='a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d'
v=json.loads(raw);b=v['sharedPostgresNamespace']['container']
assert v['requestKey']=='t45-first-r3-native-service-start-20261116-34'
assert b['id']=='3ebc60712697f9a4fe8bd333fec07a6128b57a9c7b879c865332859acc237967'
assert b['name']=='t45-fresh35-first-production-20261110-r3-service-34'
assert b['imageId']=='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
assert type(b['startedAt']) is str and type(v['physical']['postmasterStart']) is str
assert v['dataDirectoryIdentity']==dict(device=66304,inode=13502421,uid=61035,gid=61035,mode=0o700)
print(json.dumps(dict(state='EXACT_EXISTING34_PUBLIC_C_METADATA_READ_ONLY',checkedAtUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),proofSha256=pin,serviceKey=v['requestKey'],containerId=b['id'],containerStartedAt=b['startedAt'],postmasterStart=v['physical']['postmasterStart'],fileIdentity=ident(before),sameFileIdentityAfterRead=True,PGConnections=0,serverMutations=0,credentialFilesRead=False,snapshotBodiesOrDigestsRead=False,newJobSubmitted=False),sort_keys=True))
'''
compile(program,'exact-prior34-C-readonly','exec')
loader=D.parent/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
assert hashlib.sha256(loader.read_bytes()).hexdigest()=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
m=runpy.run_path(str(loader))['load_client']()
try:
 raw=m['remote'](m['state'](),shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
 v=json.loads(raw)
 assert v['proofSha256']=='a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d'
 with OUT.open('x') as f:json.dump(v,f,sort_keys=True,indent=2);f.write('\n')
 print(json.dumps({'receipt':str(OUT),'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'safeMetadata':v}))
except Exception as e:
 # Do not print argv, transport state, credentials, stderr or private material.
 print(json.dumps({'state':'PRIOR34_C_METADATA_READ_NOT_CONFIRMED','errorType':type(e).__name__,'noNewJobOrReplay':True}))
 raise SystemExit(2)
