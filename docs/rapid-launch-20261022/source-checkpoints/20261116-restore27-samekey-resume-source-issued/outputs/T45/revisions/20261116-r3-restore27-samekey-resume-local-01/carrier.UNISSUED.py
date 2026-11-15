"""Existing fixed private-stdin staging pattern, specialized to original restore27."""
from pathlib import Path
import base64,contextlib,hashlib,io,json,os,re,runpy,stat,sys,time
STAGE=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/restore27-samekey-resume-source-20261116-01')
AUDIT=STAGE.parent/'restore27-samekey-resume-audit-20261116-01'
SOURCE='PENDING_HELPER_SHA256'
AUTH='PENDING_PREPARATION_SHA256'
STARTS=0
EXPIRES=0
os.umask(0o077)
assert os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and STARTS<=time.time_ns()//1000000<EXPIRES-10000
raw=sys.stdin.buffer.read(262145);assert 0<len(raw)<=262144
e=json.loads(raw);assert set(e)=={'source','packet'}
source=base64.b64decode(e['source'],validate=True);assert 0<len(source)<=32768 and hashlib.sha256(source).hexdigest()==SOURCE
prep=base64.b64decode(e['packet']['preparationAuthority'],validate=True);assert hashlib.sha256(prep).hexdigest()==AUTH
compile(source,'resume_restore27.py','exec')
for p in [*reversed(STAGE.parent.parents),STAGE.parent]:
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022
assert not os.path.lexists(STAGE) and not os.path.lexists(AUDIT),'ORIGINAL_RESUME_STAGE_OR_AUDIT_PRESENT_READ_ONLY'
def put(p,b):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as f:
  assert f.write(b)==len(b);f.flush();os.fsync(f.fileno())
 fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
STAGE.mkdir(mode=0o700);put(STAGE/'resume_restore27.py',source)
result={'requestKey':'t45-r3-ordinary27-auth-restore-20261116-01','state':'PREPARATION_ENTRY_UNCONFIRMED_READ_ORIGINAL_AUDIT_ONLY','automaticReplay':False}
captured=io.StringIO()
try:
 sys.argv=[str(STAGE/'resume_restore27.py'),AUTH]
 sys.stdin=io.TextIOWrapper(io.BytesIO(json.dumps(e['packet']).encode()))
 with contextlib.redirect_stdout(captured):
  try:runpy.run_path(str(STAGE/'resume_restore27.py'),run_name='__main__')
  except SystemExit as error:
   if error.code not in (0,2):raise
 result=json.loads(captured.getvalue())
except BaseException as error:
 result.update(exceptionClass=type(error).__name__,safeCode=str(error) if isinstance(error,ValueError) and re.fullmatch('RESTORE27_RESUME_[A-Z0-9_]{1,150}',str(error)) else None)
put(STAGE/'entry-result.json',(json.dumps(result,sort_keys=True)+'\n').encode())
print(json.dumps(result,sort_keys=True))
raise SystemExit(0 if result.get('state')=='ORIGINAL_DISPATCHER_RETURNED_QUEUED' else 2)
