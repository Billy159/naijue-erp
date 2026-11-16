"""Fixed private receiver consumer. No upload, issuer, READY creation or public extraction."""
from pathlib import Path,PurePosixPath
import hashlib,io,json,os,stat,tarfile
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
KEY='r3-final33-recovery-input-20261117-01'
ARCHIVE_SHA='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d'
ARCHIVE_BYTES=40960
MANIFEST='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
MEMBERS={'WAREHOUSE-KEY-EXPECTATIONS.private.json':('9c68bbfdbf36ca8c2d84e3801fef1aa189d9d2f029ce4b25efa5c6fec29a7a79',27743),'AGGREGATE-READBACK-EXPECTATIONS.private.json':('12ed1911ab70edf9c567460cb793078b40c3de6e444263f215610206efd6c291',347),'app-readiness-owner.cjs':('24a179568c89f3e40d94125cb8f89d02be09c0f1bba968b4ad083e28dfbab950',4431)}
def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p,pin=None,limit=65536,uid=0):
 need(p.resolve()==p,'RECOVERY_ARTIFACT_CANONICAL_REQUIRED')
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=limit,'RECOVERY_ARTIFACT_METADATA_REQUIRED');b=f.read(limit+1)
  ident=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
  need(len(b)==s.st_size and ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat()) and (pin is None or sha(b)==pin),'RECOVERY_ARTIFACT_CAS_OR_PIN_DIFFERS')
 return b
def valid_pin(v):return type(v) is str and len(v)==64 and all(c in '0123456789abcdef' for c in v)
def unpack(raw):
 need(len(raw)==ARCHIVE_BYTES and sha(raw)==ARCHIVE_SHA,'RECOVERY_EXACT_PRIVATE_ARCHIVE_REQUIRED');out={}
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as t:
  rows=t.getmembers();need(len(rows)==len(MEMBERS),'RECOVERY_PRIVATE_ARCHIVE_EXACT_MEMBERS_REQUIRED')
  for row in rows:
   need(row.isfile() and not row.issym() and not row.islnk() and row.name in MEMBERS and row.name not in out and str(PurePosixPath(row.name))==row.name,'RECOVERY_PRIVATE_ARCHIVE_MEMBER_REFUSED')
   pin,size=MEMBERS[row.name];need(row.size==size,'RECOVERY_PRIVATE_MEMBER_SIZE_DIFFERS');b=t.extractfile(row).read(size+1);need(len(b)==size and sha(b)==pin,'RECOVERY_PRIVATE_MEMBER_PIN_DIFFERS');out[row.name]=b
 return out
def members(ref):
 need(type(ref) is dict and set(ref)=={'artifactKey','archiveSha256','archiveBytes','readySha256','authoritySha256'} and ref['artifactKey']==KEY and ref['archiveSha256']==ARCHIVE_SHA and type(ref['archiveBytes']) is int and ref['archiveBytes']==ARCHIVE_BYTES and valid_pin(ref['readySha256']) and valid_pin(ref['authoritySha256']),'RECOVERY_EXACT_SIGNED_PRIVATE_REFERENCE_REQUIRED')
 root=CONTROL/'private-standard-import-data'/KEY
 for p in (root.parent,root):
  s=p.lstat();need(p.resolve()==p and stat.S_ISDIR(s.st_mode) and s.st_uid==1000 and stat.S_IMODE(s.st_mode)==0o700,'RECOVERY_ACTUAL_PRIVATE_DIRECTORY_REQUIRED')
 ready=json.loads(read(root/'ready.json',ref['readySha256'],uid=1000));binding=json.loads(read(root/'binding.json',uid=1000));a=binding.get('authority')
 need(set(binding)=={'authoritySha256','authority'} and binding['authoritySha256']==ref['authoritySha256'],'RECOVERY_ORIGINAL_RECEIVER_BINDING_REQUIRED')
 recovery_private_authority(a,str(CONTROL),'b16447fbc81f4d64')
 fields={'status','artifactKey','archiveSha256','archiveBytes','authoritySha256','fileIdentity','manifestSha256','fragmentIndex','fragmentOffset'}
 need(type(ready) is dict and set(ready)==fields and ready['status']=='READY' and all(ready[k]==ref[k] for k in ('artifactKey','archiveSha256','archiveBytes','authoritySha256')) and ready['manifestSha256']==MANIFEST and type(ready['fragmentIndex']) is type(ready['fragmentOffset']) is int and ready['fragmentIndex']==1 and ready['fragmentOffset']==0,'RECOVERY_ACTUAL_PRIVATE_READY_REQUIRED')
 path=root/'archive.bin';s=path.lstat();actual=[s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
 need(type(ready['fileIdentity']) is list and len(ready['fileIdentity'])==5 and all(type(x) is int for x in ready['fileIdentity']) and actual==ready['fileIdentity'] and s.st_uid==1000 and stat.S_IMODE(s.st_mode)==0o600,'RECOVERY_READY_ARCHIVE_IDENTITY_REQUIRED')
 raw=read(path,ARCHIVE_SHA,ARCHIVE_BYTES,uid=1000);need([path.lstat().st_dev,path.lstat().st_ino,path.lstat().st_size,path.lstat().st_mtime_ns,path.lstat().st_ctime_ns]==actual,'RECOVERY_ARCHIVE_IDENTITY_CHANGED')
 # Upload authority expiry bounds upload only. Immutable archive readback uses
 # the actual signed consumer reference, exact original READY and file CAS.
 return unpack(raw)
def stage_readiness_owner(ref):
 need(os.getuid()==os.geteuid()==0,'RECOVERY_ROOT_STAGE_REQUIRED')
 raw=members(ref)['app-readiness-owner.cjs'];p=Path(__file__).with_name('app-readiness-owner.cjs')
 if os.path.lexists(p):need(read(p,MEMBERS[p.name][0],16384)==raw,'RECOVERY_EXISTING_SUPPORT_DIFFERS')
 else:
  with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400),'wb') as f:
   need(f.write(raw)==len(raw),'RECOVERY_SUPPORT_SHORT_WRITE');f.flush();os.fchmod(f.fileno(),0o400);os.fsync(f.fileno())
  fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(fd)
  finally:os.close(fd)
 return p
RECOVERY_KEY='r3-final33-recovery-input-20261117-01'
def recovery_private_scope(control, grant):
    if control!='/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64' or grant!='b16447fbc81f4d64':
        raise ValueError('RECOVERY_EXACT_EXISTING_GRANT_REQUIRED')
    return dict(format='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1',
        decision='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING',taskId='T45',grantId=grant,
        artifactKey=RECOVERY_KEY,manifestSha256='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
        archiveSha256='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d',archiveBytes=40960,
        targetDirectory=control+'/private-standard-import-data/'+RECOVERY_KEY,
        kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',fragmentIndex=1,fragmentOffset=0)
def recovery_private_authority(a, control, grant):
    fixed=recovery_private_scope(control,grant)
    if (type(a) is not dict or set(a)!=set(fixed)|{'startsAt','expiresAt','decisionReference'}
        or not all(a[k]==v for k,v in fixed.items())
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('RECOVERY_EXACT_PRIVATE_SCOPE_REQUIRED')

