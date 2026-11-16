"""Fixed private stdin adapter for the reviewed refusal-successor entry."""
from pathlib import Path
import base64,contextlib,hashlib,io,json,os,re,runpy,stat,sys,time
STAGE=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal36-live-stop-source-20261117-01')
AUDIT=STAGE.parent/'r3-normal36-live-stop-cas-20261117-01'
SOURCE='612b9c02af651e2cc81129e7e3727340e77ded8db184177b94a3007fe3f8734e'
AUTH=AUTH_SHA_LITERAL
os.umask(0o077)
assert os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and AUTH_START_LITERAL<=time.time_ns()//1000000<AUTH_EXPIRES_LITERAL-10000
encoded=sys.stdin.buffer.read(20*1024**2+1);assert len(encoded)<=20*1024**2
envelope=json.loads(encoded);assert set(envelope)=={'source','packet'}
source=base64.b64decode(envelope['source'],validate=True);assert hashlib.sha256(source).hexdigest()==SOURCE
packet=envelope['packet'];authority=base64.b64decode(packet['authorization'],validate=True);assert hashlib.sha256(authority).hexdigest()==AUTH
compile(source,'live_cas.py','exec')
for p in [*reversed(STAGE.parent.parents),STAGE.parent]:
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022
assert not os.path.lexists(STAGE) and not os.path.lexists(AUDIT),'CAS_STAGE_OR_AUDIT_PRESENT_READ_ORIGINAL_OUTCOME_ONLY'
def sync(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(p,raw):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  assert f.write(raw)==len(raw);f.flush();os.fsync(f.fileno())
 sync(p.parent)
STAGE.mkdir(mode=0o700);put(STAGE/'live_cas.py',source);sync(STAGE.parent)
result={'status':'LIVE36_STOP_CAS_ENTRY_UNCONFIRMED_READ_ORIGINAL_AUDIT_ONLY','automaticReplay':False}
captured=io.StringIO()
try:
 sys.argv=[str(STAGE/'live_cas.py'),AUTH]
 sys.stdin=io.TextIOWrapper(io.BytesIO(json.dumps(packet).encode()))
 with contextlib.redirect_stdout(captured):
  try:runpy.run_path(str(STAGE/'live_cas.py'),run_name='__main__')
  except SystemExit as e:
   if e.code not in (0,2):raise
 result=json.loads(captured.getvalue())
except BaseException as error:
 result.update(exceptionClass=type(error).__name__,safeCode=str(error)if isinstance(error,ValueError)and re.fullmatch('LIVE36_STOP_CAS_[A-Z0-9_]{1,140}',str(error))else None)
put(STAGE/'entry-result.json',(json.dumps(result,sort_keys=True)+'\n').encode())
print(json.dumps(result,sort_keys=True))
raise SystemExit(0 if result['status']=='EXACT_LIVE36_PENDING_STOP_TWO_PINS_UPDATED_NO_PHASE_SUBMITTED'else 2)
