
import os,sys,json,stat,hashlib,time,re
from pathlib import Path
context=CONTEXT_LITERAL

def need(v,k):
 if not v:raise ValueError(k)
def canonical(p):
 need(p.is_absolute() and str(p)==os.path.normpath(str(p)),'ARTIFACT_CANONICAL_PATH_REQUIRED')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(not stat.S_ISLNK(s.st_mode),'ARTIFACT_SYMLINK_REFUSED')
 return p
def read_regular(p,limit,root=False):
 canonical(p);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'ARTIFACT_REGULAR_INPUT_REQUIRED')
  if root:need(s.st_uid==0 and s.st_mode&0o022==0,'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
  b=os.read(fd,limit+1);z=os.fstat(fd)
  need(len(b)==s.st_size and (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'ARTIFACT_INPUT_CHANGED')
  return b
 finally:os.close(fd)
def authority():
 g=context['grantId'];need(re.fullmatch('[a-f0-9]{16}',g),'ARTIFACT_GRANT_REFUSED')
 control='/home/naijue/erp-release-20261006-01-control/grant-'+g
 need(context['control']==control,'ARTIFACT_CONTROL_REFUSED')
 p=Path('/usr/local/lib/naijue-erp-night/grant-'+g+'/artifact-staging-authorization.json')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(s.st_uid==0 and s.st_mode&0o022==0 and not stat.S_ISLNK(s.st_mode),'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
 raw=read_regular(p,65536,True);need(hashlib.sha256(raw).hexdigest()==context['authoritySha256'],'ARTIFACT_EXTERNAL_AUTHORITY_DIFFERS')
 a=json.loads(raw);need(a==context['authority'],'ARTIFACT_AUTHORITY_BINDING_DIFFERS')
 need(set(a)=={'format','decision','taskId','grantId','artifactKey','sourceSetSha256','archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'},'ARTIFACT_EXACT_AUTHORITY_REQUIRED')
 need(a['format']=='T45_ORDINARY_ARTIFACT_STAGING_V1' and a['decision']=='AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING' and a['taskId']=='T45' and a['grantId']==g and a['kind']=='ORDINARY_SOURCE_AND_TOOLS','ARTIFACT_AUTHORITY_SCOPE_REFUSED')
 need(type(a['artifactKey']) is str and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',a['artifactKey']),'ARTIFACT_KEY_REFUSED')
 need(all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]) for k in ['sourceSetSha256','archiveSha256']),'ARTIFACT_HASH_REQUIRED')
 need(type(a['archiveBytes']) is int and 0<a['archiveBytes']<2**53 and type(a['startsAt']) is int and type(a['expiresAt']) is int and a['startsAt']<a['expiresAt'],'ARTIFACT_BYTES_OR_WINDOW_REQUIRED')
 need(a['targetDirectory']==control+'/artifacts/'+a['artifactKey'],'ARTIFACT_NAMESPACE_REFUSED')
 return a

def syncdir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def own_directory(p):
 canonical(p);s=p.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and s.st_mode&0o022==0,'ARTIFACT_OWNED_DIRECTORY_REQUIRED')
def identity(s):return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def snapshot(a):
 parent=Path(a['targetDirectory']).parent
 try:own_directory(parent)
 except FileNotFoundError:return {'status':'ABSENT'}
 target=Path(a['targetDirectory'])
 try:own_directory(target)
 except FileNotFoundError:return {'status':'ABSENT'}
 try:
  r=json.loads(read_regular(target/'ready.json',65536));need(r['authoritySha256']==context['authoritySha256'] and r['archiveSha256']==a['archiveSha256'] and r['archiveBytes']==a['archiveBytes'],'ARTIFACT_RECEIPT_DIFFERS')
  p=target/'archive.bin';canonical(p);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_nlink==1 and s.st_mode&0o077==0 and identity(s)==r['fileIdentity'],'ARTIFACT_STORED_FILE_CHANGED')
  return {'status':'READY','receipt':r}
 except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError):return {'status':'PARTIAL_OR_UNKNOWN_NO_REPLAY'}

def new_file(p,b):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fsync(fd)
 finally:os.close(fd)
def upload(a,stream):
 need(a['startsAt']<=int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
 parent=Path(a['targetDirectory']).parent;own_directory(parent.parent)
 try:parent.mkdir(mode=0o700)
 except FileExistsError:pass
 own_directory(parent);target=Path(a['targetDirectory']);target.mkdir(mode=0o700);syncdir(parent)
 # Exclusive target creation is the once-only marker. Partial directories remain.
 new_file(target/'binding.json',json.dumps({'authoritySha256':context['authoritySha256'],'authority':a},sort_keys=True).encode());syncdir(target)
 part=target/'archive.part';fd=os.open(part,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);h=hashlib.sha256();left=a['archiveBytes']
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:
   while left:
    need(int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
    b=stream.read(min(left,1024*1024));need(bool(b),'ARTIFACT_SHORT_STREAM');f.write(b);h.update(b);left-=len(b)
   need(stream.read(1)==b'','ARTIFACT_EXTRA_STREAM_BYTES');f.flush();os.fsync(fd)
 finally:os.close(fd)
 need(h.hexdigest()==a['archiveSha256'],'ARTIFACT_STREAM_HASH_DIFFERS');need(int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
 final=target/'archive.bin';os.link(part,final,follow_symlinks=False);os.unlink(part);syncdir(target)
 s=final.lstat();r={'status':'READY','artifactKey':a['artifactKey'],'sourceSetSha256':a['sourceSetSha256'],'archiveSha256':a['archiveSha256'],'archiveBytes':a['archiveBytes'],'authoritySha256':context['authoritySha256'],'fileIdentity':identity(s)}
 temp=target/'ready.tmp';new_file(temp,json.dumps(r,sort_keys=True).encode());os.link(temp,target/'ready.json',follow_symlinks=False);os.unlink(temp);syncdir(target)
 return {'status':'READY','receipt':r}

def main():
 a=authority()
 if context['action']=='status':return snapshot(a)
 need(context['action']=='upload','ARTIFACT_ACTION_REFUSED')
 return upload(a,sys.stdin.buffer)
if __name__=='__main__':
 try:print(json.dumps(main()))
 except (OSError,ValueError,KeyError,TypeError) as e:
  print(json.dumps({'status':'STOP_OR_UNKNOWN_NO_REPLAY','errorCode':str(e) if isinstance(e,ValueError) else type(e).__name__}));sys.exit(2)
