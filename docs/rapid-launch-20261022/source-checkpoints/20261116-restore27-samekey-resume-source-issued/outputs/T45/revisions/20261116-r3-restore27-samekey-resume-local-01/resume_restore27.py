"""One fixed unsubmitted restore control-package repair, through original receiver only."""
from pathlib import Path
from types import ModuleType
import base64,fcntl,hashlib,json,os,re,signal,stat,subprocess,sys,time
GRANT='b16447fbc81f4d64';KEY='t45-r3-ordinary27-auth-restore-20261116-01'
B=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)
C=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+GRANT)
P=Path('/usr/local/lib/naijue-erp-night')/('grant-'+GRANT)
ENTRY=B/'restore27-samekey-resume-source-20261116-01/resume_restore27.py'
AUDIT=B/'restore27-samekey-resume-audit-20261116-01'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
CONTROL=C/'jobs'/KEY/'bundle';APPLY=B/'jobs/t45-r3-ordinary27-auth-apply-20261116-01/bundle'
MISSING='normal_service04.py';HOST='host-authorization.json'
POLICY_SHA='89f49225c19c1043e4a4a59c876876972b49abb9d5e0b29bcb699d5d069b2094'
DISPATCHER_SHA='f411beed0cd78307742f59aa6668a6e693ce8c6bae4b24e26182820a27869fec'
OLD_HOST_SHA='2853199786b4b436055dd679077d093afa4cfce5bbce2949d461154e28dee223'
OLD_MANIFEST_SHA='45a65e4c6cab43f144cd1a6d7731a1f534ab156ac4c64564ab32e7ebd760bbed'
RESTORATION_DEADLINE=1794774389953
STATIC={
 'ordinary05_roles_job.py':(33152,'e5b26381f382e469986dcbf37e877a5c26425050370c7aea10f8d85d0e1abb47'),
 'normal_service04_proof.py':(9403,'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73'),
 'fresh35-production-carrier.py':(185047,'40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360'),
 'ordinary05_roles.py':(21656,'d1fa8d926cfd2b4d6cb93b92dad95dc83942f67936870ed18bf43be87374966e'),
 'roles-authorization.json':(1837,'4332d0e4a868fc52f7e5a78c49505aaac4021ab8e48c4ff96251391b9d32c2f6'),
 MISSING:(34276,'60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5')}
OLD_INODES={'ordinary05_roles_job.py':28838633,'normal_service04_proof.py':28838634,
 'fresh35-production-carrier.py':28838635,HOST:28838636,'ordinary05_roles.py':28838637,'roles-authorization.json':28838638}
def need(v,c):
 if not v:raise ValueError('RESTORE27_RESUME_'+c)
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return time.time_ns()//1000000
def pack(v):return(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def identity(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def root_ancestors(p):
 for q in [*reversed(p.parent.parents),p.parent]:
  st=q.lstat();need(q.resolve()==q and stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,'PROTECTED_ROOT_ANCESTOR_REQUIRED')
def read(p,owner=0,maximum=262144):
 need(p.resolve()==p,'CANONICAL_FILE_REQUIRED')
 if owner==0:root_ancestors(p)
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode) and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=maximum,'PROTECTED_FILE_REQUIRED')
  raw=f.read(maximum+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(p.lstat()),'FILE_CHANGED')
 return raw,identity(s)
def sync(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(p,raw,owner=0):
 with os.fdopen(os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as f:
  need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fchown(f.fileno(),owner,owner);os.fchmod(f.fileno(),0o600);os.fsync(f.fileno())
 sync(p.parent)
def unsubmitted():
 for grant in (GRANT,'5cc58239751e4e2a'):
  c=C.with_name('grant-'+grant);b=B.with_name('grant-'+grant)
  need(not any(os.path.lexists(p) for p in (c/'requests'/(KEY+'.json'),c/'requests'/(KEY+'.tmp'),c/'results'/(KEY+'.json'),b/'jobs'/KEY)), 'REQUEST_OR_ACCEPTED_OR_TERMINAL_PRESENT_READ_ONLY')
  if grant!=GRANT:need(not os.path.lexists(c/'jobs'/KEY),'OTHER_GRANT_CONTROL_COLLISION')
def protocol(host):
 rows=[dict(name=n,bytes=s,sha256=h) for n,(s,h) in STATIC.items()]
 rows.append(dict(name=HOST,bytes=len(host),sha256=sha(host)));rows.sort(key=lambda x:x['name'])
 manifest=(json.dumps(dict(taskId='T45',jobId=KEY,files=rows),sort_keys=True)+'\n').encode()
 request=dict(taskId='T45',jobId=KEY,grantId=GRANT,scope='ERP_EXISTING_TASKS_THROUGH_T51',script='ordinary05_roles_job.py',args=[sha(host)],timeoutSeconds=300,manifestSha256=sha(manifest),gateEvidence={},taskEvidence={},businessCutoverConfirmed=False)
 return manifest,request
def request_wire(request):return json.dumps(request).encode()
def scope():
 return dict(format='T45_RESTORE27_SAMEKEY_CONTROL_RESUME_V1',grantId=GRANT,requestKey=KEY,
  action='PREPARE_UNSUBMITTED_CONTROL_AND_ORIGINAL_DISPATCH_START_ONCE',policySha256=POLICY_SHA,
  dispatcherSha256=DISPATCHER_SHA,rolesAuthoritySha256=STATIC['roles-authorization.json'][1],oldHostSha256=OLD_HOST_SHA,
  sourceFile=str(APPLY/MISSING),sourceFileSha256=STATIC[MISSING][1],sourceIdentityKnownBeforeExecution=False,originalRestorationDeadline=RESTORATION_DEADLINE,
  controllerOrAdminDeadlineExtended=False,registryOrGuardChanged=False,rawPostgresExecution=False,maximumPreparationSeconds=60)
def decode(packet,pin):
 need(set(packet)=={'preparationAuthority','hostAuthority','oldPreflight'},'EXACT_PACKET_REQUIRED')
 raw=base64.b64decode(packet['preparationAuthority'],validate=True);need(sha(raw)==pin,'EXTERNAL_PREPARATION_AUTHORITY_DIFFERS');a=json.loads(raw)
 fixed=scope();need(set(a)==set(fixed)|{'startsAt','expiresAt','sourceSha256','executionLockIdentity','hostAuthoritySha256','manifestSha256','requestSha256','oldPreflightSha256','independentReviewSha256','authorizationReference'} and all(a[k]==v for k,v in fixed.items()),'EXACT_AUTHORITY_SCOPE_REQUIRED')
 need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=RESTORATION_DEADLINE,'FINITE_PREPARATION_WINDOW_REQUIRED')
 need(a['sourceSha256']==sha(read(ENTRY)[0]) and type(a['executionLockIdentity']) is list and len(a['executionLockIdentity'])==9,'REAL_SOURCE_AND_LOCK_IDENTITIES_REQUIRED')
 need(all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]) for k in ('hostAuthoritySha256','manifestSha256','requestSha256','oldPreflightSha256','independentReviewSha256')) and type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'REVIEWED_FINITE_PACKET_REQUIRED')
 host=base64.b64decode(packet['hostAuthority'],validate=True);preflight=base64.b64decode(packet['oldPreflight'],validate=True)
 need(0<len(host)<=65536 and sha(host)==a['hostAuthoritySha256'] and 0<len(preflight)<=65536 and sha(preflight)==a['oldPreflightSha256'],'EXACT_HOST_OR_OLD_PREFLIGHT_REQUIRED')
 manifest,request=protocol(host);need(sha(manifest)==a['manifestSha256'] and sha(request_wire(request))==a['requestSha256'],'CANONICAL_PROTOCOL_DIFFERS')
 return a,raw,host,preflight,manifest,request
def prepare(a,authraw,host,preflight,manifest,request):
 need(sha(read(P/'admin_exec.py')[0])==DISPATCHER_SHA and sha(read(B/'r3-05-write-continuity/direct27-batched-real.json')[0])==POLICY_SHA,'ORIGINAL_RECEIVER_OR_POLICY_CHANGED')
 need(not os.path.lexists(AUDIT),'ORIGINAL_PREPARATION_ALREADY_PRESENT_READ_AUDIT_ONLY')
 need(LOCK.resolve()==LOCK,'ORIGINAL_LOCK_PATH_CHANGED');root_ancestors(LOCK)
 fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  need(identity(os.fstat(fd))==identity(LOCK.lstat())==a['executionLockIdentity'],'ORIGINAL_LOCK_CHANGED');fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  need(identity(os.fstat(fd))==identity(LOCK.lstat())==a['executionLockIdentity'],'ORIGINAL_LOCK_CHANGED_AFTER_ACQUIRE');unsubmitted()
  st=CONTROL.lstat();need(CONTROL.resolve()==CONTROL and stat.S_ISDIR(st.st_mode) and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(1000,1000,0o700),'ORIGINAL_CONTROL_DIRECTORY_CHANGED')
  need({p.name for p in CONTROL.parent.iterdir()}=={'bundle','results'} and not any((CONTROL.parent/'results').iterdir()),'CONTROL_ACCEPTED_OUTPUT_OR_UNKNOWN_MEMBER')
  allowed=set(STATIC)|{HOST,'bundle-manifest.json'};need({p.name for p in CONTROL.iterdir()}<=allowed,'UNEXPECTED_CONTROL_FILE')
  observed={};bodies={}
  for name,inode in OLD_INODES.items():
   raw,meta=read(CONTROL/name,1000);expected=OLD_HOST_SHA if name==HOST else STATIC[name][1]
   need(meta[1]==inode and meta[3]==1000 and meta[4]==0o600 and sha(raw)==expected,'ORIGINAL_STAGED_MEMBER_CHANGED');observed[name]=meta;bodies[name]=raw
  oldhost=bodies[HOST];old_manifest,old_request=protocol(oldhost);need(sha(old_manifest)==OLD_MANIFEST_SHA and json.loads(preflight)==old_request,'ORIGINAL_PREFLIGHT_DIFFERS')
  new=json.loads(host);prior=json.loads(oldhost);need(set(new)==set(prior) and {k:v for k,v in new.items() if k not in ('startsAt','expiresAt')}=={k:v for k,v in prior.items() if k not in ('startsAt','expiresAt')},'HOST_CHANGES_OUTSIDE_FINITE_TIMES_REFUSED')
  need(new['startsAt']<=now()<now()+300000<new['expiresAt']<=RESTORATION_DEADLINE and new['rolesAuthoritySha256']==STATIC['roles-authorization.json'][1],'ORIGINAL_RESTORE_BUDGET_REQUIRED')
  validation,vm=read(APPLY/'ordinary05_roles_job.py');need(sha(validation)==STATIC['ordinary05_roles_job.py'][1],'ORIGINAL_VALIDATOR_CHANGED')
  module=ModuleType('fixed_restore27_original_validator');module.__file__=str(APPLY/'ordinary05_roles_job.py');exec(compile(validation,module.__file__,'exec'),module.__dict__);module.validate(new,'restore',now())
  source,sm=read(APPLY/MISSING);need(sm[3]==0 and sm[4] in (0o400,0o600) and len(source)==STATIC[MISSING][0] and sha(source)==STATIC[MISSING][1],'PROTECTED_COPY_SOURCE_CHANGED')
  old_manifest_raw=None;old_manifest_meta=None
  if os.path.lexists(CONTROL/'bundle-manifest.json'):
   old_manifest_raw,old_manifest_meta=read(CONTROL/'bundle-manifest.json',1000);need(sha(old_manifest_raw)==OLD_MANIFEST_SHA,'EXISTING_MANIFEST_COLLISION')
  if os.path.lexists(CONTROL/MISSING):
   already,am=read(CONTROL/MISSING,1000);need(sha(already)==STATIC[MISSING][1] and len(already)==STATIC[MISSING][0] and am[3]==1000 and am[4]==0o600,'COPY_DESTINATION_COLLISION')
  AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
  for name,raw in [('preparation-authorization.json',authraw),('old-host-authorization.json',oldhost),('old-local-preflight.json',preflight),('new-host-authorization.json',host),('new-request.json',request_wire(request)),('new-manifest.json',manifest),('old-identities.json',pack(observed))]:put(AUDIT/name,raw)
  if old_manifest_raw is not None:put(AUDIT/'old-bundle-manifest.json',old_manifest_raw)
  put(AUDIT/'intent.json',pack(dict(requestKey=KEY,state='PREPARE_ONCE_NOT_DISPATCHED',sourceIdentity=sm,oldHostIdentity=observed[HOST],automaticReplay=False)))
  unsubmitted()
  for name,meta in observed.items():need(read(CONTROL/name,1000)[1]==meta,'STAGING_IDENTITY_CHANGED_BEFORE_WRITE')
  if not os.path.lexists(CONTROL/MISSING):put(CONTROL/MISSING,source,1000)
  need(read(APPLY/MISSING)[1]==sm,'PROTECTED_COPY_SOURCE_CHANGED_AFTER_READ')
  put(CONTROL/'.restore27-host.pending',host,1000);need(read(CONTROL/HOST,1000)[1]==observed[HOST],'HOST_CAS_IDENTITY_CHANGED');os.replace(CONTROL/'.restore27-host.pending',CONTROL/HOST);sync(CONTROL)
  put(CONTROL/'.restore27-manifest.pending',manifest,1000)
  if old_manifest_meta is None:need(not os.path.lexists(CONTROL/'bundle-manifest.json'),'MANIFEST_APPEARED')
  else:need(read(CONTROL/'bundle-manifest.json',1000)[1]==old_manifest_meta,'MANIFEST_CAS_IDENTITY_CHANGED')
  os.replace(CONTROL/'.restore27-manifest.pending',CONTROL/'bundle-manifest.json');sync(CONTROL)
  need({p.name for p in CONTROL.iterdir()}==set(STATIC)|{HOST,'bundle-manifest.json'},'FINAL_CONTROL_UNKNOWN_MEMBER')
  for row in json.loads(manifest)['files']:
   value,meta=read(CONTROL/row['name'],1000);need(len(value)==row['bytes'] and sha(value)==row['sha256'],'FINAL_CONTROL_MEMBER_DIFFERS')
  unsubmitted();need(now()+300000<new['expiresAt'] and now()<a['expiresAt'],'RESTORE_BUDGET_CLOSED_BEFORE_REQUEST');put(C/'requests'/(KEY+'.tmp'),request_wire(request),1000);need(not os.path.lexists(C/'requests'/(KEY+'.json')),'REQUEST_APPEARED');os.link(C/'requests'/(KEY+'.tmp'),C/'requests'/(KEY+'.json'));os.unlink(C/'requests'/(KEY+'.tmp'));sync(C/'requests')
  put(AUDIT/'prepared.json',pack(dict(requestKey=KEY,manifestSha256=sha(manifest),hostAuthoritySha256=sha(host),requestPublished=True,phaseExecuted=False,automaticReplay=False)))
 finally:os.close(fd)
 return request

def main():
 need(sys.platform=='linux' and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0 and sys.flags.isolated and sys.flags.no_site and Path(__file__)==ENTRY and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'FIXED_ROOT_ISOLATED_ENTRY_REQUIRED')
 os.umask(0o077)
 def interrupted(*_):raise ValueError('RESTORE27_RESUME_PREPARATION_INTERRUPTED_READ_ORIGINAL_AUDIT')
 for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,interrupted)
 signal.alarm(60)
 raw=sys.stdin.buffer.read(262145);need(0<len(raw)<=262144,'BOUNDED_PACKET_REQUIRED');a,auth,host,preflight,manifest,request=decode(json.loads(raw),sys.argv[1]);prepare(a,auth,host,preflight,manifest,request)
 actual_copy=json.loads(read(AUDIT/'intent.json')[0])['sourceIdentity']
 result=dict(requestKey=KEY,state='DISPATCH_OUTCOME_UNKNOWN_READ_ORIGINAL_KEY',automaticReplay=False,phaseOutcomeInferred=False,actualCopySourceIdentity=actual_copy,copySourceSha256=STATIC[MISSING][1],sourceIdentityKnownBeforeExecution=False)
 try:
  need(now()<a['expiresAt'] and now()+300000<json.loads(host)['expiresAt'],'RESTORE_BUDGET_CLOSED_BEFORE_DISPATCH')
  need(not os.path.lexists(B/'jobs'/KEY) and not os.path.lexists(C/'results'/(KEY+'.json')),'ACCEPTED_AFTER_PREPARE_READ_ORIGINAL_ONLY')
  r=subprocess.run(['/usr/bin/python3','-s',str(P/'admin_exec.py'),'--action','start','--job-id',KEY],capture_output=True,timeout=20)
  need(len(r.stdout)<=65536 and len(r.stderr)<=65536,'DISPATCH_REPLY_BOUNDS')
  if r.stdout:result['originalDispatcherReply']=json.loads(r.stdout)
  result['dispatcherReturnCode']=r.returncode;result['state']='ORIGINAL_DISPATCHER_RETURNED_QUEUED' if r.returncode==0 and result.get('originalDispatcherReply',{}).get('status')=='QUEUED' else result['state']
 except (OSError,ValueError,subprocess.SubprocessError) as error:result['exceptionClass']=type(error).__name__
 put(AUDIT/'result.json',pack(result));print(json.dumps(result,sort_keys=True));return 0 if result['state']=='ORIGINAL_DISPATCHER_RETURNED_QUEUED' else 2
if __name__=='__main__':raise SystemExit(main())
