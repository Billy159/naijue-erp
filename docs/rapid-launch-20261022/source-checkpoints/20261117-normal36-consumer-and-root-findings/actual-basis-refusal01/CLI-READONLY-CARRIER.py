from pathlib import Path
import hashlib,json,os,stat,subprocess,sys,re
root=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal36-readonly-basis-source-20261117-01')
assert os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0
raw=sys.stdin.buffer.read(120315);assert len(raw)==120314
cas=raw[:118318];reader=raw[118318:]
assert hashlib.sha256(cas).hexdigest()=='e22846fa9ef6043b7f88be587b70a3d53ca4f4bc82a5c68dbae4d44d68ebbc11' and hashlib.sha256(reader).hexdigest()=='de8fa0a9f4473fb06dd6196b28ca34f76e57e48f62406db7afc6a21848746dbd'
compile(cas,'register_cas.py','exec');compile(reader,'read_registration_basis.py','exec')
for p in (root.parent,*root.parent.parents):
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022
assert not os.path.lexists(root),'READONLY_CODE_LOCATION_ALREADY_PRESENT_NO_RETRY'
os.umask(0o077);root.mkdir(mode=0o700)
for name,body in (('register_cas.py',cas),('read_registration_basis.py',reader)):
 p=root/name
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  f.write(body);f.flush();os.fsync(f.fileno())
 fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
q=subprocess.run(['/usr/bin/python3','-I','-S',str(root/'read_registration_basis.py'),str(root/'register_cas.py'),'e22846fa9ef6043b7f88be587b70a3d53ca4f4bc82a5c68dbae4d44d68ebbc11'],capture_output=True,timeout=560)
if q.returncode==0:
 value=json.loads(q.stdout);assert value['state']=='READONLY_NORMAL36_REGISTRATION_BASIS';sys.stdout.buffer.write(q.stdout)
else:
 codes=re.findall(rb'(?:ValueError|AssertionError): ([A-Z][A-Z0-9_]{0,159})(?:\r?\n|$)',q.stderr)
 print(json.dumps({'state':'READONLY_NORMAL36_BASIS_REFUSED_NO_REPLAY','readerExitCode':q.returncode,'safeCode':codes[-1].decode()if codes else 'READONLY_BASIS_ORIGINAL_READER_FAILED','automaticReplay':False},sort_keys=True))
