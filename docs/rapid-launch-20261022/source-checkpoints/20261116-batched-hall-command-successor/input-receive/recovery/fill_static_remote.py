"""Append the six fixed missing static leaves to the one proven unsubmitted original bundle. Never dispatch."""
from pathlib import Path
import base64,hashlib,json,os,stat,sys
KEY='t45-r3-final33-stage-install-20261116-6a908188b9c6240680b67ddc'
GRANT='b16447fbc81f4d64'
BASE=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
TARGET=BASE/'jobs'/KEY/'bundle'
PINS = {'batch_transport.py': {'bytes': 3027, 'sha256': 'fab1b1a452b01d02825df9a5f59adce84a93ed3210dce1c46d535daabfa21b46'}, 'batch_client.py': {'bytes': 17433, 'sha256': '2f7e7aa56128efc15a56ddccd25e99a5d746214069e3153a4dbc574ec527b728'}, 'batch_remote.py': {'bytes': 5271, 'sha256': 'e59466060a593af70a4ce677c6f625b6c8dcfde2f63076eecbe07d5cb8a1e582'}, 'batch_policy.py': {'bytes': 7157, 'sha256': '2eab0a4e7d868caca2e15e50dbc03fc6658117c5d671f6429c4e418d27f3208a'}, 'd3-chunk-policy.py': {'bytes': 11793, 'sha256': 'd5a0c206b7866049ffe1245073da744aeb7f3b4475884b2c867b661f0b451175'}, 'stage-authorization.json': {'bytes': 1202, 'sha256': '6a908188b9c6240680b67ddcd5f7c5e8c220105db910be52112b2765ed712f45'}, 'batch_protocol.py': {'bytes': 16028, 'sha256': '6e704ab273b72389f41dd34881e83f2a0c80a395ba144ec3b1f702f52ff960d2'}, 'artifact-receiver.d3-chunk.py': {'bytes': 42239, 'sha256': 'bee800f2341ff1cba5400ce61a2227acce50498c82216882630f33f040c46e97'}, 'batch-manifest.json': {'bytes': 8028, 'sha256': '52a433465c79ce4b8d73cb848694a4675bc82f4c5d4208795abed9d4d3e0ad55'}}
STAGED={'batch_client.py','batch_remote.py','batch_transport.py'}
MISSING=set(PINS)-STAGED
def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def ident(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def bytes_at(path,expected):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size)==(1000,1000,0o600,1,expected['bytes']),'FINAL33_STATIC_FIXED_MEMBER_METADATA_REQUIRED')
  b=os.read(fd,131073);need(len(b)==s.st_size and sha(b)==expected['sha256'] and ident(s)==ident(os.fstat(fd))==ident(path.lstat()),'FINAL33_STATIC_FIXED_MEMBER_CHANGED')
  return b,ident(s)
 finally:os.close(fd)
def unsubmitted():
 for grant in (GRANT,'5cc58239751e4e2a'):
  c=BASE.with_name('grant-'+grant)
  for suffix in ('.json','.tmp'):need(not os.path.lexists(c/'requests'/(KEY+suffix)),'FINAL33_STATIC_REQUEST_ALREADY_PRESENT')
  need(not os.path.lexists(c/'results'/(KEY+'.json')),'FINAL33_STATIC_TERMINAL_ALREADY_PRESENT')
 for p in (BASE,BASE/'jobs',TARGET.parent,TARGET,TARGET.parent/'results'):
  s=p.lstat();need(p.resolve()==p and stat.S_ISDIR(s.st_mode)and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(1000,1000,0o700),'FINAL33_STATIC_CONTROL_IDENTITY_DIFFERS')
 need(not list((TARGET.parent/'results').iterdir()),'FINAL33_STATIC_RESULT_DIRECTORY_NOT_EMPTY')
def strict(b):
 def pairs(rows):
  d={}
  for k,v in rows:need(k not in d,'FINAL33_STATIC_DUPLICATE_KEY');d[k]=v
  return d
 return json.loads(b,object_pairs_hook=pairs)
def main():
 need(sys.platform=='linux'and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==1000 and len(sys.argv)==2 and sys.argv[1]in('status','fill'),'FINAL33_STATIC_EXACT_USER_ENTRY_REQUIRED')
 os.umask(0o077);unsubmitted();leaves={p.name for p in TARGET.iterdir()};need(STAGED<=leaves<=set(PINS),'FINAL33_STATIC_UNEXPECTED_MEMBER')
 before={leaf:bytes_at(TARGET/leaf,PINS[leaf])[1]for leaf in leaves}
 if sys.argv[1]=='status':print(json.dumps({'state':'UNSUBMITTED_FIXED_STATIC_STATUS','key':KEY,'present':sorted(leaves),'missing':sorted(set(PINS)-leaves),'requestPublished':False}));return
 packet=sys.stdin.buffer.read(196609);need(0<len(packet)<=196608,'FINAL33_STATIC_BOUNDED_PACKET_REQUIRED');data=strict(packet)
 need(type(data)is dict and set(data)==MISSING,'FINAL33_STATIC_EXACT_SIX_INPUTS_REQUIRED')
 bodies={k:base64.b64decode(v,validate=True)for k,v in data.items()}
 need(all(len(v)==PINS[k]['bytes']and sha(v)==PINS[k]['sha256']for k,v in bodies.items()),'FINAL33_STATIC_PACKET_PIN_DIFFERS')
 added=[]
 for leaf in sorted(MISSING):
  unsubmitted()
  for k,identity in before.items():need(ident((TARGET/k).lstat())==identity,'FINAL33_STATIC_EXISTING_MEMBER_CHANGED')
  if leaf in leaves:need(bytes_at(TARGET/leaf,PINS[leaf])[0]==bodies[leaf],'FINAL33_STATIC_EXISTING_FIXED_BYTES_DIFFER');continue
  path=TARGET/leaf;fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb')as f:need(f.write(bodies[leaf])==len(bodies[leaf]),'FINAL33_STATIC_SHORT_WRITE');f.flush();os.fsync(f.fileno())
  sync(TARGET);added.append(leaf);before[leaf]=bytes_at(path,PINS[leaf])[1]
 unsubmitted();need({p.name for p in TARGET.iterdir()}==set(PINS),'FINAL33_STATIC_FINAL_CLOSURE_DIFFERS')
 for leaf,row in PINS.items():bytes_at(TARGET/leaf,row)
 print(json.dumps({'state':'FIXED_STATIC_BYTES_STAGED_REQUEST_NOT_PUBLISHED','key':KEY,'appended':added,'allMembers':len(PINS),'previousFilesUnchanged':True,'requestPublished':False,'policyInstalled':False,'PGConnections':0,'dispatchCalled':False},sort_keys=True))
if __name__=='__main__':
 try:main()
 except (OSError,ValueError,TypeError,KeyError)as e:
  print(json.dumps({'state':'STOP_OR_UNKNOWN_READ_ORIGINAL_STATIC_BOUNDARY','errorType':type(e).__name__,'safeCode':str(e)if isinstance(e,ValueError)else None}));raise SystemExit(2)
