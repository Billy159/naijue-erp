"""Fixed private stdin adapter for the reviewed refusal-successor entry."""
from pathlib import Path
import base64,contextlib,hashlib,io,json,os,re,runpy,stat,sys,time
STAGE=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct24-batched-registration-source-20261115-01')
AUDIT=STAGE.parent/'r3-direct24-batched-registration-cas-20261115-01'
SOURCE='977343c0ddc3dd0219a81d0b5600c4b59a779ba2c5848d64e63c23375df4f664'
AUTH=AUTH_SHA_LITERAL
os.umask(0o077)
assert os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and AUTH_START_LITERAL<=time.time_ns()//1000000<AUTH_EXPIRES_LITERAL-10000
encoded=sys.stdin.buffer.read(20*1024**2+1);assert len(encoded)<=20*1024**2
envelope=json.loads(encoded);assert set(envelope)=={'source','packet'}
source=base64.b64decode(envelope['source'],validate=True);assert hashlib.sha256(source).hexdigest()==SOURCE
packet=envelope['packet'];authority=base64.b64decode(packet['authorization'],validate=True);assert hashlib.sha256(authority).hexdigest()==AUTH
compile(source,'register_cas.py','exec')
for p in [*reversed(STAGE.parent.parents),STAGE.parent]:
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022
s=STAGE.lstat()
assert STAGE.resolve()==STAGE and stat.S_ISDIR(s.st_mode) and (s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(12583870,0,0,0o700)
assert sorted(p.name for p in STAGE.iterdir())==['entry-result.json','register_cas.py'] and not os.path.lexists(AUDIT),'EXACT_UNPUBLISHED_FIRST_ATTEMPT_REQUIRED'
def checked_original(leaf,pin):
 p=STAGE/leaf
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  a=os.fstat(f.fileno());assert stat.S_ISREG(a.st_mode) and a.st_uid==a.st_gid==0 and a.st_nlink==1 and stat.S_IMODE(a.st_mode)==0o600 and 0<a.st_size<=65536
  raw=f.read(65537);b=os.fstat(f.fileno());d=p.lstat()
  ident=lambda v:(v.st_dev,v.st_ino,v.st_uid,v.st_gid,v.st_mode,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
  assert len(raw)==a.st_size and ident(a)==ident(b)==ident(d) and hashlib.sha256(raw).hexdigest()==pin
 return raw
checked_original('register_cas.py','1ed3132ec702fdf80c9f742ac98b0d3f6b95726cb84625642f7d543c20c7bc03')
failed=json.loads(checked_original('entry-result.json','590b47b45ea3027caa4a1cf0aab30b1debdd0aab49d7cbcd8506648604aa6df9'))
assert failed=={'automaticReplay':False,'exceptionClass':'KeyError','safeCode':None,'status':'DIRECT24_BATCHED_REGISTRATION_ENTRY_UNCONFIRMED_READ_ORIGINAL_AUDIT_ONLY'}
def sync(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(p,raw):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  assert f.write(raw)==len(raw);f.flush();os.fsync(f.fileno())
 sync(p.parent)
put(STAGE/'register_cas-successor01.py',source)
result={'status':'DIRECT24_BATCHED_REGISTRATION_ENTRY_UNCONFIRMED_READ_ORIGINAL_AUDIT_ONLY','automaticReplay':False}
captured=io.StringIO()
try:
 sys.argv=[str(STAGE/'register_cas-successor01.py'),AUTH]
 sys.stdin=io.TextIOWrapper(io.BytesIO(json.dumps(packet).encode()))
 with contextlib.redirect_stdout(captured):
  try:runpy.run_path(str(STAGE/'register_cas-successor01.py'),run_name='__main__')
  except SystemExit as e:
   if e.code not in (0,2):raise
 result=json.loads(captured.getvalue())
except BaseException as error:
 result.update(exceptionClass=type(error).__name__,safeCode=str(error)if isinstance(error,ValueError)and re.fullmatch('DIRECT24_BATCHED_REGISTRATION_[A-Z0-9_]{1,140}',str(error))else None)
put(STAGE/'entry-result-successor01.json',(json.dumps(result,sort_keys=True)+'\n').encode())
print(json.dumps(result,sort_keys=True))
raise SystemExit(0 if result['status']=='EXACT_DIRECT24_BATCHED_REGISTERED_NO_PHASE_SUBMITTED'else 2)
