import os,stat,json,hashlib,time
from pathlib import Path
job=Path(os.environ['ERP_SHARED_JOB_DIR']);assert os.getuid()==0 and os.environ['ERP_SHARED_TASK_ID']=='T45'
oldhash='a24505c9670723303c24dbd9ccf39da9a152ef8f3a92a1226a0ae85c4a83025a';newhash='b7b9015ba3feed3bf400ea3652c93a5b59c9b13bb052f318fd1b610bb8990f6c'
p=Path('/usr/local/lib/naijue-erp-night/grant-5cc58239751e4e2a/artifact-staging-authorization.json')
for q in [*reversed(p.parents),p]:
 s=q.lstat();assert s.st_uid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode)
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o444
old=p.read_bytes();assert hashlib.sha256(old).hexdigest()==oldhash
new=(job/'bundle/artifact-staging-5d70-authorization-01.json').read_bytes();assert hashlib.sha256(new).hexdigest()==newhash;a=json.loads(new);assert a['startsAt']<=int(time.time()*1000)<a['expiresAt'] and a['artifactKey']=='f35-5d70-ordinary-20261106-01' and a['archiveSha256']=='9dc78883dc896a7498ef6d9023692e12222feaa5c215b7a26d8eadc4c12008b7' and a['archiveBytes']==83652102
backup=job/'staging-policy-before.json'
def write(path,b,mode):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
write(backup,old,0o400);assert backup.read_bytes()==old
before={'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'sha256':oldhash,'backupPath':str(backup)};write(job/'staging-policy-before-metadata.json',json.dumps(before).encode(),0o600)
tmp=p.with_name('artifact-staging-authorization.ordinary-5d70-01.tmp');write(tmp,new,0o444)
assert p.lstat().st_ino==s.st_ino and p.read_bytes()==old
os.replace(tmp,p);fd=os.open(p.parent,os.O_RDONLY|os.O_DIRECTORY)
try:os.fsync(fd)
finally:os.close(fd)
z=p.lstat();assert z.st_uid==0 and z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1 and hashlib.sha256(p.read_bytes()).hexdigest()==newhash
out={'status':'EXTERNAL_ORDINARY_POLICY_INSTALLED_OLD_BYTES_PRESERVED','before':before,'after':{'uid':z.st_uid,'gid':z.st_gid,'mode':oct(stat.S_IMODE(z.st_mode)),'nlink':z.st_nlink,'sha256':newhash},'approvalCreated':False,'oldSourceArtifactOrReadyChanged':False,'restore':'Use retained exact old bytes and metadata via original root controlled channel only after no live ordinary staging consumption; preserve new policy evidence.'}
write(job/'results/ordinary-policy-readback.json',json.dumps(out).encode(),0o600)
