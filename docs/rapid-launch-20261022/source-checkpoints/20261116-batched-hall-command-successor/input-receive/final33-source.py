"""Only finite D3 slices; no connection or credential use."""
from pathlib import Path
import hashlib,json,os,stat
HERE=Path(__file__).resolve().parent
PROFILE=HERE.parent/'input-profile.json'
PROFILE_SHA='62e01d1cb13553c826e63d3454f3ff79da3158c4d35fd6a0bf70c8b4e20ab80d'
def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def record(path,row):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w')as f:json.dump(row,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
 d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(d)
 finally:os.close(d)
def source_descriptor(key):
 raw=PROFILE.read_bytes();need(sha(raw)==PROFILE_SHA,'FINAL33_FROZEN_PROFILE_DIFFERS');p=json.loads(raw)
 rows=[(a,r)for a in p['archives']for r in a['fragments']if r['key']==key]
 need(len(rows)==1,'FINAL33_FIXED_SLICE_REQUIRED');a,r=rows[0]
 return r,Path(a['localArchive']),a['archiveBytes'],p['manifestSha256']
def read_source(path,size,offset,count):
 need(path.resolve()==path and 0<count<=2097152 and 0<=offset<=size-count,'FINAL33_EXACT_SLICE_REQUIRED')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_nlink==1 and not s.st_mode&0o077 and s.st_size==size,'FINAL33_PRIVATE_SOURCE_REQUIRED')
  raw=os.pread(fd,count,offset);identity=lambda s:(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
  need(len(raw)==count and identity(s)==identity(os.fstat(fd))==identity(path.lstat()),'FINAL33_SOURCE_CHANGED');return raw
 finally:os.close(fd)
