"""Fixed original first-group metadata only. No submission, upload, policy, role, or PG actions."""
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json,os,socket,stat,subprocess,sys
GRANTS=('b16447fbc81f4d64','5cc58239751e4e2a')
SUFFIX='6a908188b9c6240680b67ddc'
KEYS=tuple('t45-r3-final33-stage-'+action+'-20261116-'+SUFFIX for action in ('install','restore'))
PARTS=tuple('t45-r3-final33-standard-p%03d-20261116-01'%n for n in range(1,5))
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
DATA=HOST/'state/fresh35-first-production-20261110-r3/data'
BUNDLE_LEAVES={'batch_client.py','batch_remote.py','batch_transport.py','batch_policy.py','batch_protocol.py',
 'd3-chunk-policy.py','artifact-receiver.d3-chunk.py','stage-authorization.json','batch-manifest.json','bundle-manifest.json'}
def metadata(path,code=False):
 try:s=path.lstat()
 except FileNotFoundError:return {'state':'ABSENT'}
 except OSError as e:return {'state':'UNKNOWN','errno':e.errno}
 out={'state':'PRESENT','device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),
      'links':s.st_nlink,'bytes':s.st_size,'isFile':stat.S_ISREG(s.st_mode),'isDirectory':stat.S_ISDIR(s.st_mode),'isSymlink':stat.S_ISLNK(s.st_mode)}
 if code and stat.S_ISREG(s.st_mode)and not stat.S_ISLNK(s.st_mode)and s.st_nlink==1 and 0<s.st_size<=131072:
  fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
  try:
   first=os.fstat(fd);body=os.read(fd,131073);last=os.fstat(fd)
   ident=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_gid,x.st_mode,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
   if len(body)==s.st_size and ident(first)==ident(s)==ident(last)==ident(path.lstat()):out['sha256']=hashlib.sha256(body).hexdigest()
   else:out['contentCheck']='CHANGED_OR_UNKNOWN'
  finally:os.close(fd)
 return out
def unit(grant,key):
 name='naijue-erp-op-'+grant[:8]+'-'+hashlib.sha256(key.encode()).hexdigest()[:12]+'.service'
 try:
  q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating',name],capture_output=True,timeout=5)
  return {'queryExitCode':q.returncode,'anyActive':bool(q.stdout.strip()),'stderrPresent':bool(q.stderr)}
 except subprocess.TimeoutExpired:return {'state':'UNKNOWN_TIMEOUT'}
def probe():
 out={'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'scope':'FINAL33_ORIGINAL_FIRST_GROUP_METADATA_ONLY','grants':{},'databaseConnections':0,'writes':0,'originalKeysReplayed':False}
 for grant in GRANTS:
  c=Path('/home/naijue/erp-release-20261006-01-control/grant-'+grant)
  w=Path('/root/erp-release-20261006-01-worker/grant-'+grant)
  g={'jobs':{},'fragments':{},'policy':metadata(Path('/usr/local/lib/naijue-erp-night/grant-'+grant+'/artifact-staging-authorization.json')),'executionLock':metadata(w/'execution.lock')}
  for key in KEYS:
   d=c/'jobs'/key;b=d/'bundle'
   row={'request':metadata(c/'requests'/(key+'.json')),'requestTemp':metadata(c/'requests'/(key+'.tmp')),
    'terminal':metadata(c/'results'/(key+'.json')),'controlJob':metadata(d),'workerJob':metadata(w/'jobs'/key),'unit':unit(grant,key)}
   if row['controlJob']['state']=='PRESENT':
    row['bundle']={p.name:metadata(p,p.name in BUNDLE_LEAVES)for p in b.iterdir()} if b.is_dir() and not b.is_symlink() else {'state':'UNKNOWN'}
    results=d/'results';row['resultsCount']=sum(1 for _ in results.iterdir())if results.is_dir() and not results.is_symlink()else None
   g['jobs'][key]=row
  for key in PARTS:
   d=c/'private-standard-import-data'/key;m=metadata(d)
   if m['state']=='PRESENT' and m['isDirectory'] and not m['isSymlink']:
    m['layout']={leaf:metadata(d/leaf)for leaf in ('binding.json','archive.part','archive.bin','ready.tmp','ready.json')}
   g['fragments'][key]=m
  out['grants'][grant]=g
 out['r3']={'data':metadata(DATA),'postmasterPid':metadata(DATA/'postmaster.pid'),
  'service33Proof':metadata(HOST/'authority/fresh35-current-production-service-v2-service-33.json')}
 try:
  q=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,timeout=5)
  out['r3']['targetPort']={'queryExitCode':q.returncode,'listenerPresent':bool(q.stdout.strip()),'stderrPresent':bool(q.stderr)}
 except subprocess.TimeoutExpired:out['r3']['targetPort']={'state':'UNKNOWN_TIMEOUT'}
 return out
if __name__=='__main__':
 if not(sys.platform=='linux'and os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server'and len(sys.argv)==1):raise SystemExit('FINAL33_FIXED_ROOT_METADATA_ENTRY_REQUIRED')
 print(json.dumps(probe(),sort_keys=True))
