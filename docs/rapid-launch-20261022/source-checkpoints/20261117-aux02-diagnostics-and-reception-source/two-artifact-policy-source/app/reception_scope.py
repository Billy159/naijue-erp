import hashlib,json,os,stat,time,subprocess,re
from pathlib import Path
BUNDLE=Path(__file__).resolve().parent
GRANT='b16447fbc81f4d64'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
JOBS=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
POLICY=Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT+'/artifact-staging-authorization.json')
LOCK=JOBS.parent.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=(66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015)
def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return time.time_ns()//1000000
def strict(b):
 def pairs(items):
  out=dict(items);need(len(out)==len(items),'DUPLICATE_AUTHORITY_FIELD');return out
 return json.loads(b,object_pairs_hook=pairs)
def identity(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode,s.st_uid,s.st_gid,s.st_nlink)
def lock_identity(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(path,limit,uid=None,mode=None,links=(1,)):
 need(path.resolve()==path,'CANONICAL_ARTIFACT_PATH_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_nlink in links and 0<s.st_size<=limit and(uid is None or s.st_uid==uid)and(mode is None or stat.S_IMODE(s.st_mode)==mode),'EXACT_ARTIFACT_FILE_REQUIRED');b=f.read(limit+1)
  need(len(b)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'ARTIFACT_IDENTITY_CHANGED');return b,s
KEY='r3-final33-ordinary161-d728f374-20261116-01'
TARGET=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/artifacts/r3-final33-ordinary161-d728f374-20261116-01')
INSTALL='t45-r3-final33-d728-artifact-policy-install-20261117-01'
RESTORE='t45-r3-final33-d728-artifact-policy-restore-20261117-01'
MAX_WINDOW_MS=1080000
FIELDS='4d577c3de8eb0f2967b794791c3ceed8979b1e93a83f683b4a15b34bf6fd3024'
RECEIVER='954342825d020435db0b1ba36573054e5010ba8a4e531fc0cac7dcf4162a3b81'
PROFILE=FIELDS
def pins(uid=None,mode=None):
 raw,_=read(BUNDLE/'FIXED-SCOPE.json',65536,uid,mode);code,_=read(BUNDLE/'receiver_client.py',262144,uid,mode)
 need(sha(raw)==FIELDS and sha(code)==RECEIVER,'EXACT_REVIEWED_BUNDLE_REQUIRED');fixed=strict(raw);return dict(archiveBytes=fixed['archiveBytes'],expectedDevice=66304,readyBytes=1744,readySha256='b81e4063a20462be95dfbf342cec46bc44dcb278982fd57cea69f4002969bf6e',packReceiptBytes=587,packReceiptSha256='fdcc82a3b741cb7a520b79801ed318eeedac172046bb3377a9c064fa8e8b321d'),fixed,code
def bind(raw,digest,fixed,active):
 need(type(digest)is str and re.fullmatch('[a-f0-9]{64}',digest)and sha(raw)==digest,'EXTERNAL_AUTHORITY_PIN_REQUIRED');a=strict(raw)
 need(type(a)is dict and set(a)==set(fixed)|{'startsAt','expiresAt','decisionReference'} and all(type(a[k])is type(v)and a[k]==v for k,v in fixed.items()),'EXACT_FIXED_ARTIFACT_SCOPE_REQUIRED')
 need(type(a['startsAt'])is type(a['expiresAt'])is int and 0<a['expiresAt']-a['startsAt']<=MAX_WINDOW_MS and type(a['decisionReference'])is str and 0<len(a['decisionReference'])<=512,'FINITE_EXTERNAL_AUTHORITY_REQUIRED')
 if active:need(a['startsAt']<=now()<a['expiresAt'],'AUTHORITY_EXPIRED')
 return a
def start_upload(expires_at,current):
 need(current+30000<expires_at,'INSUFFICIENT_INSTALL_AND_RESTORE_MARGIN');return expires_at
def recovery_no_other_writers(target,proc=Path('/proc'),uid=None):
 # Old receivers hold an archive FD, new receivers may still be buffering stdin.
 # Check their exact receiver argv as well as FDs, without exporting argv contents.
 if uid is None:uid=os.getuid()
 root_view=os.geteuid()==0
 facts={'scope':'ROOT_ALL_UID_ARGV_AND_FD' if root_view else 'ORDINARY_TARGET_RECEIVERS_WITH_EXCLUSIVE_INODE',
        'noncandidateFDState':'SCANNED_WHEN_PRESENT' if root_view else 'NOT_INSPECTED','noncandidateProcesses':0}
 own=os.getpid();ancestors={own};current=own
 while True:
  try:parent=int((proc/str(current)/'stat').read_text().rsplit(')',1)[1].split()[1])
  except (OSError,ValueError,IndexError):break
  if parent<=1 or parent in ancestors:break
  ancestors.add(parent);current=parent
 for process in proc.iterdir():
  if not process.name.isdecimal() or int(process.name) in ancestors:continue
  try:
   if process.stat().st_uid!=uid:continue
   fd=os.open(process/'cmdline',os.O_RDONLY|os.O_NOFOLLOW)
   try:argv=os.read(fd,262145)
   finally:os.close(fd)
   need(len(argv)<=262144,'RECOVERY08_CONSUMER_ARGV_UNBOUNDED')
   exact=str(target).encode() in argv and (b'ARTIFACT_SHORT_STREAM' in argv or b'RECOVERY08_' in argv)
   if not exact:
    facts['noncandidateProcesses']+=1
    # Root policy gates still inspect every UID1000 fd tree. Ordinary readers
    # may only classify a noncandidate after its complete argv was readable.
    if not root_view:continue
   opened=False
   for f in (process/'fd').iterdir():
    try:opened=opened or os.readlink(f).startswith(str(target)+'/')
    except (FileNotFoundError,ProcessLookupError):continue
    except OSError:raise ValueError('RECOVERY08_CONSUMER_STATE_UNREADABLE')
   need(not exact and not opened,'RECOVERY08_OTHER_CONSUMER_PRESENT')
  except FileNotFoundError:continue
  except ProcessLookupError:continue
  except PermissionError:raise ValueError('RECOVERY08_CONSUMER_STATE_UNREADABLE')
 return facts
def quiet_check(job):
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
 own='naijue-erp-op-b16447fb-'+sha(job.name.encode())[:12]+'.service'
 need(q.returncode==0 and not q.stderr and all(row.split()[0]==own for row in q.stdout.decode().splitlines()if row.strip()),'OTHER_OPERATION_ACTIVE')
 return recovery_no_other_writers(TARGET,uid=1000)

def verify_original_worker_lock():
 # The existing dispatcher parent holds serial for the entire child job.
 # Reopening and flocking here would conflict with that same authorized worker.
 st=LOCK.lstat();need(LOCK.resolve()==LOCK and lock_identity(st)==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
 parent=os.getppid();need((Path('/proc')/str(parent)).stat().st_uid==0,'ORIGINAL_ROOT_WORKER_REQUIRED')
 identity_token=f'{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino}'
 rows=Path('/proc/locks').read_text().splitlines()
 need(any(len(row.split())>=6 and row.split()[1:4]==['FLOCK','ADVISORY','WRITE'] and row.split()[4]==str(parent) and row.split()[5]==identity_token for row in rows),'ORIGINAL_WORKER_SERIAL_LOCK_NOT_HELD')
