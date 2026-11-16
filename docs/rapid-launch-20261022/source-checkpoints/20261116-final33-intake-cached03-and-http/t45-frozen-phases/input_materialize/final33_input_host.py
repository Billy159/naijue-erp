"""Finite root-only materialization of two already-received D3 archives. No PG or mount action."""
from pathlib import Path,PurePosixPath
from types import SimpleNamespace
import hashlib,io,json,os,re,runpy,stat,sys,tarfile,time
KEY='t45-r3-final33-input-materialize-20261116-01'
GRANT='b16447fbc81f4d64'
WORKER=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
JOB=WORKER/'jobs'/KEY
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
PROFILE_SHA='71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7'
IO_SHA='27a393b3b50eb60fa33963396172bc7b001862878314a0fe2ace0188ed449f56'
INSTALLATION_SHA='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'
def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def strict(b):
 def pairs(rows):
  d={}
  for k,v in rows:need(k not in d,'FINAL33_DUPLICATE_KEY');d[k]=v
  return d
 return json.loads(b,object_pairs_hook=pairs)
def ident(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def safe_open(path,uid,maximum,exact=None):
 need(path.resolve()==path,'FINAL33_CANONICAL_PATH_REQUIRED')
 for p in (*reversed(path.parents),path):
  s=p.lstat();need(not stat.S_ISLNK(s.st_mode) and not s.st_mode&0o022,'FINAL33_PROTECTED_PATH_REQUIRED')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd)
  need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and 0<s.st_size<=maximum
       and (exact is None or s.st_size==exact) and ident(s)==ident(path.lstat()),'FINAL33_PROTECTED_FILE_REQUIRED')
  return fd,s
 except BaseException:os.close(fd);raise
def small(path,uid=0,pin=None):
 fd,s=safe_open(path,uid,262144)
 try:
  b=os.read(fd,262145)
  need(len(b)==s.st_size and ident(s)==ident(os.fstat(fd))==ident(path.lstat()) and (pin is None or sha(b)==pin),'FINAL33_SMALL_FILE_CHANGED')
  return b
 finally:os.close(fd)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,b):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:
  need(f.write(b)==len(b),'FINAL33_SHORT_WRITE');f.flush();os.fsync(f.fileno())
 sync(path.parent)
def pack(v):return (json.dumps(v,sort_keys=True)+'\n').encode()
def received(row,binding,manifest):
 d=CONTROL/'private-standard-import-data'/row['key'];ready=small(d/'ready.json',1000,binding['readySha256'])
 for p in (d.parent,d):
  s=p.lstat();need(stat.S_ISDIR(s.st_mode) and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(1000,1000,0o700),'FINAL33_RECEIVE_DIRECTORY_DIFFERS')
 path=d/'archive.bin';fd,s=safe_open(path,1000,row['archiveBytes'],row['archiveBytes'])
 try:
  need((s.st_gid,stat.S_IMODE(s.st_mode))==(1000,0o600),'FINAL33_RECEIVE_FILE_MODE_DIFFERS')
  old_identity=[s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  expected={'status':'READY','artifactKey':row['key'],'manifestSha256':manifest,
   'archiveBytes':row['archiveBytes'],'archiveSha256':row['archiveSha256'],
   'authoritySha256':binding['authoritySha256'],'fileIdentity':old_identity,
   'fragmentIndex':row['fragmentIndex'],'fragmentOffset':row['fragmentOffset']}
  need(strict(ready)==expected,'FINAL33_RECEIVE_READY_DIFFERS');return path,fd,s
 except BaseException:os.close(fd);raise
def fragments(archive,bindings,manifest,guard):
 total=hashlib.sha256();seen=0
 for row in archive['fragments']:
  guard.checkpoint();need(seen==row['fragmentOffset'],'FINAL33_FRAGMENT_ORDER_DIFFERS')
  p,fd,s=received(row,bindings[row['key']],manifest);part=hashlib.sha256();count=0
  with os.fdopen(fd,'rb')as stream:
   for b in iter(lambda:stream.read(65536),b''):
    guard.checkpoint();count+=len(b);seen+=len(b)
    need(count<=row['archiveBytes'],'FINAL33_FRAGMENT_EXCESS');part.update(b);total.update(b);yield b
   need(count==row['archiveBytes'] and part.hexdigest()==row['archiveSha256'] and ident(s)==ident(os.fstat(stream.fileno()))==ident(p.lstat()),'FINAL33_FRAGMENT_CHANGED')
 need(seen==archive['archiveBytes'] and total.hexdigest()==archive['archiveSha256'],'FINAL33_ARCHIVE_CHANGED')
class Joined(io.RawIOBase):
 def __init__(self,blocks):super().__init__();self.blocks=iter(blocks);self.remaining=b''
 def readable(self):return True
 def readinto(self,target):
  if not self.remaining:self.remaining=next(self.blocks,b'')
  if not self.remaining:return 0
  n=min(len(target),len(self.remaining));target[:n]=self.remaining[:n];self.remaining=self.remaining[n:];return n
 def close(self):
  try:self.blocks.close()
  finally:super().close()
def mkdir_chain(root,path):
 need(path.is_relative_to(root),'FINAL33_MEMBER_OUTSIDE_ROOT')
 if path==root:return
 mkdir_chain(root,path.parent)
 try:path.mkdir(mode=0o700);os.chown(path,0,61035);path.chmod(0o750);sync(path.parent)
 except FileExistsError:
  s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode) and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,61035,0o750),'FINAL33_MEMBER_PARENT_DIFFERS')
def extract(root,archive,bindings,manifest,guard):
 rows={r['archivePath']:r for r in archive['members']};need(len(rows)==len(archive['members']),'FINAL33_DUPLICATE_PIN')
 need(all(not PurePosixPath(k).is_absolute() and '..' not in PurePosixPath(k).parts and str(PurePosixPath(k))==k for k in [*rows,*(r['path']for r in rows.values())]),'FINAL33_MEMBER_PATH_INVALID')
 dirs={str(p) for k in rows for p in PurePosixPath(k).parents if str(p)!='.'};seen=set();done=set()
 with Joined(fragments(archive,bindings,manifest,guard))as raw,io.BufferedReader(raw,65536)as joined:
  with tarfile.open(fileobj=joined,mode='r|gz')as tar:
   for member in tar:
    guard.checkpoint();name=member.name;need(name not in seen,'FINAL33_ARCHIVE_DUPLICATE_MEMBER');seen.add(name)
    if member.isdir():need(name.rstrip('/') in dirs,'FINAL33_ARCHIVE_DIRECTORY_REFUSED');continue
    row=rows.get(name);need(row is not None and member.isfile() and member.size==row['bytes'],'FINAL33_ARCHIVE_MEMBER_DIFFERS')
    path=root/row['path'];mkdir_chain(root,path.parent);fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    h=hashlib.sha256();n=0
    with os.fdopen(fd,'wb')as f,tar.extractfile(member)as source:
     for b in iter(lambda:source.read(65536),b''):
      guard.checkpoint();n+=len(b);need(n<=row['bytes'],'FINAL33_MEMBER_EXCESS');need(f.write(b)==len(b),'FINAL33_SHORT_MEMBER_WRITE');h.update(b)
     need(n==row['bytes'] and h.hexdigest()==row['sha256'],'FINAL33_MEMBER_HASH_DIFFERS')
     f.flush();guard.checkpoint();os.fchown(f.fileno(),0,61035);os.fchmod(f.fileno(),0o440);os.fsync(f.fileno())
    sync(path.parent);done.add(name)
  while joined.read(65536):guard.checkpoint()
 need(done==set(rows),'FINAL33_ARCHIVE_MEMBER_CLOSURE_DIFFERS')
 return len(done)
def validate(a,p,now):
 rows=[r for x in p['archives'] for r in x['fragments']]
 fixed={'format':'T45_R3_FINAL33_INPUT_MATERIALIZATION_V1','decision':'AUTHORIZE_EXACT_FINAL33_INPUT_MATERIALIZATION',
  'taskId':'T45','requestKey':KEY,'profileSha256':PROFILE_SHA,'manifestSha256':p['manifestSha256'],
  'targetRoot':str(HOST),'originalWriterKey':p['originalWriterKey'],'installationRecordSha256':INSTALLATION_SHA}
 need(type(a)is dict and set(a)==set(fixed)|{'parts','hostStateInode','startsAt','expiresAt','authorizationReference','sourceSha256'}
  and all(a[k]==v for k,v in fixed.items()),'FINAL33_EXACT_MATERIALIZATION_AUTHORITY_REQUIRED')
 need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now<a['expiresAt']<=a['startsAt']+300000
  and type(a['hostStateInode'])is int and a['hostStateInode']>0 and type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512
  and re.fullmatch('[a-f0-9]{64}',a['sourceSha256']),'FINAL33_FINITE_MATERIALIZATION_REQUIRED')
 need(type(a['parts'])is list and len(a['parts'])==len(rows) and all(type(x)is dict and set(x)=={'key','authoritySha256','readySha256'} and x['key']==r['key']
  and all(type(x[k])is str and re.fullmatch('[a-f0-9]{64}',x[k])for k in ('authoritySha256','readySha256'))for x,r in zip(a['parts'],rows)),'FINAL33_EXACT_PART_BINDINGS_REQUIRED')
def main():
 need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
  and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB) and Path(__file__)==JOB/'bundle/final33_input_host.py'
  and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'FINAL33_FIXED_ROOT_ENTRY_REQUIRED')
 os.umask(0o077);p=strict(small(JOB/'bundle/input-profile.json',pin=PROFILE_SHA));a=strict(small(JOB/'bundle/input-materialization-authorization.json',pin=sys.argv[1]))
 validate(a,p,time.time_ns()//1000000);need(sha(small(Path(__file__)))==a['sourceSha256'],'FINAL33_HOST_SOURCE_DIFFERS')
 need(sha(small(HOST/'authority/fresh35-combined-installation-v1.json'))==INSTALLATION_SHA,'FINAL33_INSTALLATION_DIFFERS')
 state=HOST/'state';s=state.lstat();need(state.resolve()==state and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022 and (s.st_dev,s.st_ino)==(66304,a['hostStateInode']),'FINAL33_STATE_IDENTITY_DIFFERS')
 guard_path=JOB/'bundle/materialize_first_r1.py';code=small(guard_path,pin=IO_SHA);g={'__name__':'final33_original_io','__file__':str(guard_path)};exec(compile(code,str(guard_path),'exec'),g)
 root=HOST/p['materializedRelativePath'];need(not os.path.lexists(root),'FINAL33_MATERIALIZATION_EXISTS_READ_ORIGINAL_KEY')
 rows={r['key']:r for r in a['parts']};progress={'stage':'FINAL33_INPUT_MATERIALIZATION'}
 start=time.monotonic();created=False
 try:
  with g['RawVolumeGuard'](SimpleNamespace(REAL_START_MINIMUM=p['minimumFreeBytes'],REAL_STOP_FLOOR=p['minimumFreeBytes']),state,a['expiresAt'],progress)as guard:
   guard.checkpoint();root.mkdir(mode=0o700);os.chown(root,0,61035);root.chmod(0o750);sync(state);created=True
   counts=[extract(root,x,rows,p['manifestSha256'],guard)for x in p['archives']];guard.checkpoint()
   result={'requestKey':KEY,'state':'FINAL33_PRIVATE_INPUTS_MATERIALIZED_NO_PG_OR_PRECHECK_REPLAY','profileSha256':PROFILE_SHA,
    'manifestSha256':p['manifestSha256'],'deliveryIndexSha256':p['deliveryIndexSha256'],'archiveMembers':counts,
    'preflightIndex':p['preflightIndex'],'preflightSummary':p['preflightSummary'],'targetDirectory':str(root),
    'targetIdentity':{'device':root.stat().st_dev,'inode':root.stat().st_ino},'PGConnections':0,'businessDatabaseWrites':False,
    'elapsedSeconds':round(time.monotonic()-start,3),'minimumFreeBytes':p['minimumFreeBytes'],'sourceInputsOverwritten':False}
   put(root/'materialization-receipt.json',pack(result));guard.checkpoint()
  put(JOB/'results/final33-input-materialization-result.json',pack(result));return 0
 except BaseException as error:
  code=str(error)if isinstance(error,ValueError)and re.fullmatch('[A-Z0-9_]{1,160}',str(error))else type(error).__name__
  put(JOB/'results/final33-input-materialization-incomplete.json',pack({'requestKey':KEY,'state':'STOP_OR_UNKNOWN_READ_ORIGINAL_KEY_NO_REPLAY','safeCode':code,'partialDirectoryPreserved':created,'PGConnections':0}))
  return 2
if __name__=='__main__':sys.exit(main())
