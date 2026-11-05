#!/usr/bin/python3
"""Scoped successor of the retained provision_schema_target.py.
Inert on import. Only the original T45 dispatcher executes --execute after the
actual environment permission. A plan/hash is configuration, not an approval.
No approval, DB window, installation record or source guard is manufactured.
"""
import argparse, hashlib, io, json, os, re, stat, subprocess, tarfile, time
from pathlib import Path, PurePosixPath

GRANT='5cc58239751e4e2a'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
PRIVATE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1')
NAME='t45-fresh35-deb13-20261106-r2'
BASE='docker.io/library/debian@sha256:7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392'
ENV_ROOT=ROOT
ROOT=ENV_ROOT/'phaseb-application-r2'
ENV_SOURCE='0e6b01ec154bd089dbfad61715cf194d339ed6e3bb56311bbd91971e5aa5cf2f'
ENV_IMAGE='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
ENV_RECEIPT_SHA='e475f85c3501dbf9f9a18ddcc5be94384f82582712cd5a939f3326628237a47f'
ENV_RECIPE_SHA='e9e9d026b4eae3ddd8640b5cde7f5e3760fb146b726b03179d6294665a8761ac'
ENV_OPERATION='t45-f35-5b26-exact-five-downgrades-20261105-01'
ENV_ARCHIVE_SHA='b91bf14ebf482c607ed790580883274adea6e0d2f2a539d82236673a7e769920'
# Deliberately unresolved until C freezes D1 + launcher + any D2 consumer.
# These are not dummy digests or runtime-selectable arguments.
SOURCE='b3d8e62ca216a710855145082e9ea69263823e1161dcbf3387a685a4219bd951'
ARCHIVE_SHA='f3126f335c8d2afcd9d7975460357c3e3b790724d80c0fe2436dcaf30e52ed56'
ARCHIVE_BYTES=83663631
FILE_COUNT=7292
MANIFEST_SHA='9fbe885be22279772a377bcd4ff1f50edd0e2f05c611e8bfb82a6a1233462e5d'
LOCK_SHA='0aaf271430d37313a4e83ff58d8af7c58c36b3d38b629eca9b3cdfe1681f9e9b'
LIBPQ_SHA='f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d'
NODE_SHA='7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'
KEY='f35-223598-ordinary-20261106-01'
DEPLOY='/opt/naijue-erp/fresh35-combined-v1'
STATE='/var/lib/naijue-erp/fresh35-isolated'
WORK='cloud-pg-fresh35-20261105-r1'
CAPACITY_PROFILE='/run/naijue-rewrite/capacity/owner-profile.json'
PROOF_EVIDENCE_SOURCE_SHA='de6600758975733d4e45c38e873f159aafad82aa951df18224ae86a892037c58'
PLAN_KEYS={'enabled','authorizationReference','operationId','opsSourceSha256','stagingAuthoritySha256','imagePreparationExpiresAt'}
PROPOSAL={'database':'synthetic_fresh35_20261105_r1','admin':'fresh35_admin_20261105_r1','owner':'fresh35_owner_20261105_r1','controller':'fresh35_controller_20261105_r1','runtime':'fresh35_runtime_20261105_r1','host':'127.0.0.1','port':18651,'workspaceDirectory':STATE+'/'+WORK}

def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def strict(b):
 def pairs(items):
  d={}
  for k,v in items:need(k not in d,'DUPLICATE_KEY');d[k]=v
  return d
 return json.loads(b,object_pairs_hook=pairs)
def trusted(p,root=True):
 p=Path(p);need(p.is_absolute() and str(p)==os.path.normpath(str(p)),'CANONICAL_PATH_REQUIRED')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and not s.st_mode&0o022,'PROTECTED_PATH_REQUIRED')
  if root:need(s.st_uid==0,'ROOT_OWNER_REQUIRED')
 return p
def read_file(p,limit,private=False,root=True):
 p=trusted(p,root);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=limit,'BOUNDED_REGULAR_FILE_REQUIRED')
  if private:need(not s.st_mode&0o077,'PRIVATE_INPUT_REQUIRED')
  with os.fdopen(fd,'rb',closefd=False) as f:b=f.read(limit+1)
  z=os.fstat(fd);need(len(b)==s.st_size and (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'INPUT_CHANGED')
  return b
 finally:os.close(fd)
def read_application_member(p,expected):
 p=Path(p);need(p.is_relative_to(ROOT/'deploy'),'APPLICATION_MEMBER_SCOPE_REQUIRED')
 if p.stat().st_size:return read_file(p,max(1,p.stat().st_size))
 name=str(p.relative_to(ROOT/'deploy'));need(expected.get(name)=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','EMPTY_APPLICATION_MEMBER_NOT_REGISTERED')
 p=trusted(p);before=p.lstat();fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 def identity(s):return (s.st_dev,s.st_ino,s.st_mode,s.st_nlink,s.st_uid,s.st_gid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
 try:
  st=os.fstat(fd);need(stat.S_ISREG(st.st_mode) and st.st_size==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o644,'EXACT_EMPTY_APPLICATION_MEMBER_REQUIRED')
  need(identity(before)==identity(st),'APPLICATION_MEMBER_CHANGED');raw=os.read(fd,1)
  need(raw==b'' and identity(st)==identity(os.fstat(fd))==identity(p.lstat()),'APPLICATION_MEMBER_CHANGED');return raw
 finally:os.close(fd)

def syncdir(p):
 f=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(f)
 finally:os.close(f)
def new_file(p,b,mode=0o600):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fchmod(fd,mode);os.fsync(fd)
 finally:os.close(fd)
 syncdir(p.parent)
def new_json(p,v):new_file(p,(json.dumps(v,sort_keys=True)+'\n').encode())

def run(args,data=None,seconds=30):
 try:p=subprocess.run(args,input=data,capture_output=True,timeout=seconds)
 except subprocess.TimeoutExpired:raise
 need(p.returncode==0,'COMMAND_FAILED_'+str(p.returncode));return p.stdout

def job_input(path):
 p=Path(path);need(p.parent==Path(os.environ['ERP_SHARED_JOB_DIR'])/'bundle' and p.suffix=='.json','EXACT_JOB_INPUT_REQUIRED');return p

def load_plan(path,digest):
 path=job_input(path)
 b=read_file(path,65536,True);need(sha(b)==digest,'PLAN_HASH_DIFFERS');p=strict(b)
 need(set(p)==PLAN_KEYS and p['enabled'] is True and isinstance(p['authorizationReference'],str) and 0<len(p['authorizationReference'])<=512,'EXPLICIT_SCOPE_CONFIGURATION_REQUIRED')
 need(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',p['operationId']) is not None,'OPERATION_ID_REQUIRED')
 for k in ['opsSourceSha256','stagingAuthoritySha256']:need(isinstance(p[k],str) and re.fullmatch('[a-f0-9]{64}',p[k]),'EXACT_PIN_REQUIRED')
 need(p['opsSourceSha256']==sha(Path(__file__).read_bytes()),'OPS_SOURCE_CHANGED')
 need(type(p['imagePreparationExpiresAt']) is int,'EXTERNAL_PREPARATION_DEADLINE_REQUIRED');return p

def staged_archive(plan):
 target=CONTROL/'artifacts'/KEY
 ready=strict(read_file(target/'ready.json',65536,root=False))
 need(ready.get('status')=='READY' and ready.get('artifactKey')==KEY and ready.get('sourceSetSha256')==SOURCE and ready.get('archiveSha256')==ARCHIVE_SHA and ready.get('archiveBytes')==ARCHIVE_BYTES and ready.get('authoritySha256')==plan['stagingAuthoritySha256'],'EXACT_STAGED_READY_REQUIRED')
 f=trusted(target/'archive.bin',False);s=f.lstat();need(s.st_uid==1000 and not s.st_mode&0o077,'STAGED_OWNER_OR_MODE_DIFFERS')
 need([s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]==ready.get('fileIdentity'),'STAGED_IDENTITY_CHANGED')
 b=read_file(f,ARCHIVE_BYTES,root=False);need(len(b)==ARCHIVE_BYTES and sha(b)==ARCHIVE_SHA,'STAGED_ARCHIVE_DIFFERS');return b

def archive_files(b):
 # Validate the entire immutable byte snapshot BEFORE creating the new root.
 members={};modes={}
 with tarfile.open(fileobj=io.BytesIO(b),mode='r:gz') as t:
  for m in t:
   n=m.name;q=PurePosixPath(n)
   need(m.isfile() and not q.is_absolute() and str(q)==n and '..' not in q.parts and '\\' not in n and n not in members and m.mode in [0o644,0o755],'REGULAR_EXACT_ARCHIVE_REQUIRED')
   members[n]=t.extractfile(m).read();modes[n]=m.mode
 manifest=members.get('metadata/deployment-manifest.json',b'');need(sha(manifest)==MANIFEST_SHA,'DEPLOYMENT_MANIFEST_DIFFERS');v=strict(manifest)
 need(set(v)=={'format','files'} and v['format']=='FRESH35_ISOLATED_DEPLOYMENT_V1','EXACT_DEPLOYMENT_FORMAT_REQUIRED')
 expected={}
 for r in v['files']:
  need(set(r)=={'path','sha256'} and 'deploy/'+r['path'] not in expected,'MANIFEST_MEMBER_DIFFERS');expected['deploy/'+r['path']]=r['sha256']
 metadata={'metadata/deployment-manifest.json','metadata/source-descriptor.json','metadata/base-image-registry-result.json','metadata/debian-runtime-dependency-lock.json'}
 need(len(expected)==FILE_COUNT and set(members)==set(expected)|metadata,'ARCHIVE_CLOSURE_DIFFERS')
 need(all(sha(members[n])==s for n,s in expected.items()),'MEMBER_HASH_DIFFERS')
 need(strict(members['metadata/source-descriptor.json'])['sourceSetSha256']==SOURCE,'SOURCE_SET_DIFFERS')
 need(strict(members['metadata/base-image-registry-result.json'])['immutableBase']==BASE,'BASE_IMAGE_DIFFERS')
 lock=members['metadata/debian-runtime-dependency-lock.json'];need(sha(lock)==LOCK_SHA,'DEPENDENCY_LOCK_DIFFERS')
 return members,modes,strict(lock)

def new_parents(p):
 missing=[];q=p
 while not q.exists():need(q!=ROOT and q.is_relative_to(ROOT),'NEW_ROOT_ONLY');missing.append(q);q=q.parent
 trusted(q)
 for q in reversed(missing):q.mkdir(mode=0o755);os.chmod(q,0o755)

def materialize(plan,b):
 files,modes,lock=archive_files(b);trusted(ROOT.parent);ROOT.mkdir(mode=0o700);syncdir(ROOT.parent)
 new_json(ROOT/'prepare-started.json',application_receipt(plan))
 for n,data in files.items():
  p=ROOT/n;new_parents(p.parent);new_file(p,data,modes[n])
 # 0711 gives ordinary UID traversal to the public0644 record. Secret files stay
 # 0400/0600. A0700 authority parent would break the original ordinary host.
 for name,mode in [('authority',0o711),('state',0o755)]:
  (ROOT/name).mkdir(mode=mode);os.chmod(ROOT/name,mode)
 # Reserve only an empty inode for the fixed read-only file mount. It is NOT a
 # usable capacity profile or authority: real target/child/volume facts do not
 # exist yet. The original collector rejects it until the original parent
 # fills that same inode through the writable STATE alias before business.
 (ROOT/'state/capacity').mkdir(mode=0o700)
 new_file(ROOT/'state/capacity/owner-profile.json',b'',0o644)
 new_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',files['metadata/deployment-manifest.json'],0o400)
 return lock

def materialize_remaining(plan,b):
 files,modes,lock=archive_files(b);trusted(ROOT)
 need(stat.S_IMODE(ROOT.lstat().st_mode)==0o700,'EXACT_PARTIAL_ROOT_REQUIRED')
 marker=read_file(ROOT/'prepare-started.json',65536,True)
 need(strict(marker)==application_receipt(plan),'CURRENT_APPLICATION_RECEIPT_DIFFERS')
 expected=strict(files['metadata/deployment-manifest.json']);member_hashes={r['path']:r['sha256'] for r in expected['files']}
 fixed={'prepare-started.json':marker,'authority/fresh35-isolated-deployment-v1.json':files['metadata/deployment-manifest.json'],'state/capacity/owner-profile.json':b''}
 all_files={**files,**fixed};all_modes={**modes,'prepare-started.json':0o600,'authority/fresh35-isolated-deployment-v1.json':0o400,'state/capacity/owner-profile.json':0o644}
 directories={}
 for name in all_files:
  q=(ROOT/name).parent
  while q!=ROOT:directories[str(q.relative_to(ROOT))]=0o755;q=q.parent
 directories.update({'authority':0o711,'state':0o755,'state/capacity':0o700});present=set()
 # Validate every existing component before the first missing-file write.
 for path in ROOT.rglob('*'):
  trusted(path);st=path.lstat();name=str(path.relative_to(ROOT))
  if stat.S_ISDIR(st.st_mode):need(name in directories and stat.S_IMODE(st.st_mode)==directories[name],'EXACT_PARTIAL_DIRECTORY_REQUIRED');continue
  need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and name in all_files,'EXACT_PARTIAL_MEMBER_REQUIRED')
  need(st.st_size==len(all_files[name]) and stat.S_IMODE(st.st_mode)==all_modes[name],'EXACT_PARTIAL_MEMBER_METADATA_REQUIRED')
  if name.startswith('deploy/'):raw=read_application_member(path,member_hashes)
  elif name=='state/capacity/owner-profile.json':
   # This one pre-existing fixed capacity inode must still be the original empty
   # placeholder. No usable profile or runtime state is accepted or replaced.
   fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
   def identity(x):return (x.st_dev,x.st_ino,x.st_mode,x.st_nlink,x.st_uid,x.st_gid,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
   try:
    before=os.fstat(fd);raw=os.read(fd,1)
    need(raw==b'' and identity(st)==identity(before)==identity(os.fstat(fd))==identity(path.lstat()),'EMPTY_CAPACITY_INODE_CHANGED')
   finally:os.close(fd)
  else:raw=read_file(path,max(1,len(all_files[name])),name in fixed)
  need(sha(raw)==sha(all_files[name]),'EXACT_PARTIAL_MEMBER_CONTENT_REQUIRED');present.add(name)
 written=0
 for name,data in files.items():
  if name in present:continue
  path=ROOT/name;new_parents(path.parent);new_file(path,data,modes[name]);written+=1
 for name,mode in [('authority',0o711),('state',0o755),('state/capacity',0o700)]:
  path=ROOT/name
  if not path.exists():path.mkdir(mode=mode);os.chmod(path,mode);syncdir(path.parent)
 for name in ['authority/fresh35-isolated-deployment-v1.json','state/capacity/owner-profile.json']:
  if name not in present:new_file(ROOT/name,fixed[name],all_modes[name]);written+=1
 verify_materialized_application(plan)
 return {'existingExactFilesReused':len(present),'missingFilesWritten':written,'existingFilesOverwritten':0}

def materialize_remaining_application(plan):
 require_frozen_application();need(int(time.time()*1000)<plan['imagePreparationExpiresAt'],'PREPARATION_DEADLINE_EXPIRED')
 image=environment_image();result=materialize_remaining(plan,staged_archive(plan))
 return {'status':'CURRENT_APPLICATION_REMAINING_MATERIALIZED_NO_DB_WINDOW','application':application_receipt(plan),'image':image['image'],'environmentReceiptUnchanged':True,'imageBuilt':False,'postgresStarted':False,**result}

def require_frozen_application():
 for value in [SOURCE,ARCHIVE_SHA,MANIFEST_SHA]:need(isinstance(value,str) and re.fullmatch('[a-f0-9]{64}',value),'FINAL_APPLICATION_NOT_FROZEN')
 need(type(ARCHIVE_BYTES) is int and ARCHIVE_BYTES>0 and type(FILE_COUNT) is int and FILE_COUNT>0 and isinstance(KEY,str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',KEY),'FINAL_APPLICATION_NOT_FROZEN')

def environment_image():
 # Environment proof remains bound to its actual old application provenance.
 # No image receipt is rewritten, nor compared to the new app operation/source.
 raw=read_file(ENV_ROOT/'image-receipt.json',65536,True);need(sha(raw)==ENV_RECEIPT_SHA,'ENVIRONMENT_RECEIPT_DIFFERS')
 receipt=strict(raw)
 need(receipt=={'image':ENV_IMAGE,'base':BASE,'operationId':ENV_OPERATION,'sourceSet':ENV_SOURCE,'archive':ENV_ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'offlineArchive':'19739f1489ea6a3a4bb8ce7a8529e422235c306b6593904ce56f54aa4d200342','localOCIContext':True,'exactFiveDowngrades':True},'ENVIRONMENT_PROVENANCE_DIFFERS')
 need(sha(read_file(ENV_ROOT/'exact-five-recipe-r1.json',65536,True))==ENV_RECIPE_SHA,'ENVIRONMENT_RECIPE_DIFFERS')
 actual=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',ENV_IMAGE]))
 need(actual=={'id':ENV_IMAGE,'os':'linux','arch':'amd64'},'ACTUAL_ENVIRONMENT_IMAGE_DIFFERS')
 return receipt

def application_receipt(plan):
 return {'operationId':plan['operationId'],'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA,'deploymentManifestSha256':MANIFEST_SHA,'environmentImage':ENV_IMAGE,'environmentReceiptSha256':ENV_RECEIPT_SHA}

def verify_materialized_application(plan):
 require_frozen_application();trusted(ROOT)
 need(strict(read_file(ROOT/'prepare-started.json',65536,True))==application_receipt(plan),'CURRENT_APPLICATION_RECEIPT_DIFFERS')
 raw=read_file(ROOT/'metadata/deployment-manifest.json',2*1024*1024)
 need(sha(raw)==MANIFEST_SHA,'CURRENT_APPLICATION_MANIFEST_DIFFERS')
 manifest=strict(raw);need(set(manifest)=={'format','files'} and manifest['format']=='FRESH35_ISOLATED_DEPLOYMENT_V1','CURRENT_APPLICATION_MANIFEST_FORMAT')
 expected={}
 for row in manifest['files']:
  need(set(row)=={'path','sha256'} and row['path'] not in expected,'CURRENT_APPLICATION_MANIFEST_MEMBER')
  name=row['path'];q=PurePosixPath(name)
  need(not q.is_absolute() and str(q)==name and '..' not in q.parts and '\\' not in name,'CURRENT_APPLICATION_PATH')
  expected[name]=row['sha256']
 actual={}
 for path in (ROOT/'deploy').rglob('*'):
  trusted(path)
  if path.is_file():actual[str(path.relative_to(ROOT/'deploy'))]=sha(read_application_member(path,expected))
 need(len(expected)==FILE_COUNT and actual==expected,'CURRENT_APPLICATION_CLOSURE_DIFFERS')
 need(read_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',2*1024*1024,True)==raw,'CURRENT_APPLICATION_AUTHORITY_MANIFEST_DIFFERS')
 need(strict(read_file(ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==SOURCE,'CURRENT_APPLICATION_SOURCE_DIFFERS')

def materialize_application(plan):
 require_frozen_application()
 need(int(time.time()*1000)<plan['imagePreparationExpiresAt'],'PREPARATION_DEADLINE_EXPIRED')
 image=environment_image();materialize(plan,staged_archive(plan));verify_materialized_application(plan)
 return {'status':'CURRENT_APPLICATION_MATERIALIZED_NO_DB_WINDOW','application':application_receipt(plan),'image':image['image'],'environmentReceiptUnchanged':True,'imageBuilt':False,'postgresStarted':False}

def inspect(cid):
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"memory":{{json .HostConfig.Memory}},"swap":{{json .HostConfig.MemorySwap}},"cpu":{{json .HostConfig.NanoCpus}},"pids":{{json .HostConfig.PidsLimit}},"caps":{{json .HostConfig.CapAdd}},"capDrop":{{json .HostConfig.CapDrop}},"security":{{json .HostConfig.SecurityOpt}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"usernsMode":{{json .HostConfig.UsernsMode}},"labels":{{json .Config.Labels}},"privileged":{{json .HostConfig.Privileged}},"devices":{{json .HostConfig.Devices}},"restart":{{json .HostConfig.RestartPolicy.Name}},"shm":{{json .HostConfig.ShmSize}},"tmpfs":{{json .HostConfig.Tmpfs}},"mounts":{{json .Mounts}}}'
 return strict(run(['docker','inspect','--format',fmt,cid]))
def mount(args,src,dst,ro=False):return args+['--mount','type=bind,src='+str(src)+',dst='+dst+(',readonly' if ro else '')]
def common(image,remaining,operation):
 need(image==ENV_IMAGE,'ACTUAL_ENVIRONMENT_IMAGE_DIFFERS')
 need(remaining>90,'ORIGINAL_WINDOW_TOO_SHORT')
 a=['docker','run','--detach','--pull=never','--restart=no','--name',NAME,'--user','0:0','--network','none','--read-only','--cpus','2','--memory','3g','--memory-swap','3g','--pids-limit','256','--shm-size','64m','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--label','t45.operation='+operation,'--label','t45.source='+SOURCE]
 for c in ['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE']:a+=['--cap-add',c]
 for src,dst,ro in [('deploy',DEPLOY,True),('authority','/etc/naijue-erp',False),('state',STATE,False),('deploy/runtime/node/bin/node','/usr/local/bin/node',True),('state/capacity/owner-profile.json',CAPACITY_PROFILE,True)]:a=mount(a,ROOT/src,dst,ro)
 return a+['--entrypoint','/usr/bin/timeout',image,'--signal=TERM','--kill-after=3s',str(remaining),'/usr/bin/sleep','infinity']
def owned(info,receipt,plan):
 need(info['id']==receipt['cid'] and info['image']==receipt['image']==ENV_IMAGE and info['name']=='/'+NAME and info['labels'].get('t45.operation')==plan['operationId'] and info['labels'].get('t45.source')==SOURCE,'CONTAINER_OWNERSHIP_DIFFERS')
 need(info['network']=='none' and not info['ports'] and info['user']=='0:0' and info['readonly'] and info['pidMode']=='' and info['ipcMode']!='host' and info['usernsMode'] in ['', 'private'],'CONTAINER_ISOLATION_DIFFERS')
 need(info['memory']==3*1024**3 and info['swap']==3*1024**3 and info['cpu']==2000000000 and info['pids']==256,'CONTAINER_BUDGET_DIFFERS')
 expected={DEPLOY:(str(ROOT/'deploy'),False),'/etc/naijue-erp':(str(ROOT/'authority'),True),STATE:(str(ROOT/'state'),True),'/usr/local/bin/node':(str(ROOT/'deploy/runtime/node/bin/node'),False),CAPACITY_PROFILE:(str(ROOT/'state/capacity/owner-profile.json'),False)}
 binds={x['Destination']:(x['Source'],x['RW']) for x in info['mounts'] if x['Type']=='bind'};need(binds==expected and all(x['Type'] in ['bind','tmpfs'] for x in info['mounts']),'EXACT_MOUNTS_REQUIRED')
 need({x.removeprefix('CAP_') for x in info['caps']}=={'CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'} and info['capDrop']==['ALL'] and bool(info['security']) and set(info['security'])<={'no-new-privileges','no-new-privileges=true'},'CONTAINER_POLICY_DIFFERS')

 need(not info['privileged'] and not info['devices'] and info['restart']=='no' and info['shm']==64*1024**2 and info['tmpfs']=={'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'CONTAINER_EXTRAS_DIFFERS')

def provision_input(path,digest):
 b=read_file(job_input(path),65536,True);need(sha(b)==digest,'PROVISION_INPUT_HASH_DIFFERS');a=strict(b)
 need(a.get('format')=='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1' and a.get('decision')=='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','ORIGINAL_PROVISION_AUTHORITY_REQUIRED')
 need(a.get('proposal')==PROPOSAL and a.get('sourceSetSha256')==SOURCE and a.get('deploymentManifestSha256')==MANIFEST_SHA and a.get('postgresUid')==61035 and a.get('postgresGid')==61035,'EXACT_SOURCE_TARGET_REQUIRED')
 need(set(a)=={'format','decision','deploymentManifestSha256','sourceSetSha256','proposal','postgresUid','postgresGid','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'} and isinstance(a['independentSafetyReviewSha256'],str) and re.fullmatch('[a-f0-9]{64}',a['independentSafetyReviewSha256']) and isinstance(a['authorizationReference'],str) and 0<len(a['authorizationReference'])<=512,'ORIGINAL_PROVISION_CLOSED_INPUT_REQUIRED')
 now=int(time.time()*1000);need(type(a.get('startsAt')) is int and type(a.get('expiresAt')) is int and a['startsAt']<=now<a['expiresAt']-90000 and 0<a['expiresAt']-a['startsAt']<=1200000,'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED');return b,a

def start_target(plan,path,digest):
 image=environment_image();verify_materialized_application(plan);raw,a=provision_input(path,digest)
 need(sha(read_file(ROOT/'deploy/runtime/node/bin/node',126595440))==NODE_SHA,'EXACT_EXISTING_NODE_BIND_REQUIRED')
 profile=trusted(ROOT/'state/capacity/owner-profile.json');s=profile.lstat()
 need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o644 and s.st_size==0,'EMPTY_FIXED_PROFILE_RESERVATION_REQUIRED')
 need(not (ROOT/'authority/fresh35-combined-execution-v1.json').exists(),'NO_STALE_INSTALL_AUTHORITY')
 new_file(ROOT/'authority/fresh35-isolated-provision-v1.json',raw,0o400)
 new_json(ROOT/'start-intent.json',{'operation':plan['operationId'],'expiresAt':a['expiresAt'],'image':image['image']})
 remaining=(a['expiresAt']-int(time.time()*1000))//1000-5
 need(not run(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}']).strip(),'TARGET_NAME_ALREADY_EXISTS_NO_REPLAY')
 cid=run(common(image['image'],remaining,plan['operationId'])).decode().strip();need(re.fullmatch('[a-f0-9]{64}',cid),'ACTUAL_NEW_CID_REQUIRED')
 receipt={'cid':cid,'image':image['image'],'expiresAt':a['expiresAt'],'operationId':plan['operationId']};new_json(ROOT/'container-receipt.json',receipt);owned(inspect(cid),receipt,plan)
 cmd='\n'.join(['umask 077','/usr/bin/python3 -I -S '+DEPLOY+'/scripts/release/unified-install/launch-fresh35-isolated-v1.py --run-authorized-once > '+STATE+'/launcher.private.log 2>&1','t45_launcher_rc=$?','(set -C; printf "%s\\n" "$t45_launcher_rc" > '+STATE+'/launcher-exit-code)','exit "$t45_launcher_rc"'])
 run(['docker','exec','--detach','--user','0:0',cid,'/bin/sh','-c',cmd])
 work=ROOT/'state'/WORK
 while int(time.time()*1000)<a['expiresAt']-90000:
  if (work/'program-description.json').is_file() and (work/'target-binding.json').is_file():
   target=strict(read_file(work/'target-binding.json',1024*1024));program=strict(read_file(work/'program-description.json',1024*1024));need(program.get('sourceSetSha256')==SOURCE,'DESCRIBED_SOURCE_DIFFERS')
   # Return/release original dispatcher's execution.lock while the ORIGINAL
   # bounded launcher/guardian waits. The next same-dispatcher phase only copies
   # genuine external install bytes, never creates an approval or replays start.
   return {'status':'WAITING_EXTERNAL_INSTALL_AUTHORITY','cid':cid,'target':target,'program':program,'expiresAt':a['expiresAt']}
  if (work/'failure.json').exists() or (ROOT/'state/launcher-exit-code').is_file() or not inspect(cid)['running']:break
  time.sleep(.25)
 raise ValueError('DESCRIPTOR_NOT_CONFIRMED_OR_WINDOW_SHORT_NO_REPLAY')

def recover_original_cid(plan):
 # A timed-out Docker start is resolved by inspecting its ORIGINAL unique name,
 # never by running again. Bind the observed ID to the retained start intent.
 if (ROOT/'container-receipt.json').exists():return
 intent=strict(read_file(ROOT/'start-intent.json',65536));need(intent['operation']==plan['operationId'],'START_INTENT_DIFFERS')
 info=inspect(NAME);need(re.fullmatch('[a-f0-9]{64}',info['id']),'OBSERVED_CID_REQUIRED')
 receipt={'cid':info['id'],'image':intent['image'],'expiresAt':intent['expiresAt'],'operationId':plan['operationId']};owned(info,receipt,plan);new_json(ROOT/'container-receipt.json',receipt)

def delivery(plan,path,digest):
 receipt=strict(read_file(ROOT/'container-receipt.json',65536));owned(inspect(receipt['cid']),receipt,plan);need(int(time.time()*1000)<receipt['expiresAt']-60000,'ORIGINAL_WINDOW_TOO_SHORT')
 work=ROOT/'state'/WORK;need((work/'program-description.json').is_file() and (work/'target-binding.json').is_file(),'ACTUAL_TARGET_PROGRAM_REQUIRED')
 b=read_file(job_input(path),65536,True);need(sha(b)==digest,'EXTERNAL_INSTALL_AUTHORITY_HASH_DIFFERS')
 auth=strict(b);program=strict(read_file(work/'program-description.json',1024*1024));target=strict(read_file(work/'target-binding.json',1024*1024))
 need(set(auth)=={'format','decision','programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'},'ORIGINAL_INSTALL_FORMAT_REQUIRED')
 need(auth['format']=='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1' and auth['decision']=='AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY','EXTERNAL_INSTALL_DECISION_REQUIRED')
 need(all(auth[k]==program[k] for k in ['programSha256','sourceSetSha256','targetSha256']) and auth['startsAt']==target['startsAt'] and auth['expiresAt']==target['expiresAt'],'EXTERNAL_INSTALL_BINDING_DIFFERS')
 need(isinstance(auth['independentSafetyReviewSha256'],str) and re.fullmatch('[a-f0-9]{64}',auth['independentSafetyReviewSha256']) and isinstance(auth['authorizationReference'],str) and 0<len(auth['authorizationReference'])<=512,'EXTERNAL_REVIEW_REFERENCE_REQUIRED')
 # The original fixed loader validates the closed target/program authorization.
 # This function transfers the independently issued bytes without filling them.
 new_file(ROOT/'authority/fresh35-combined-execution-v1.json',b,0o400)
 return {'status':'EXTERNAL_INSTALL_BYTES_COPIED_ONCE','sha256':digest,'cid':receipt['cid'],'approvalCreated':False}

def ordinary_proof_evidence(plan,receipt):
 # Run once only after the existing successful business/cleanup receipts, in the
 # still-owned new container. An unknown intent is read back, never retried.
 work=ROOT/'state'/WORK;out=work/'bootstrap-network-ordinary-evidence.json';intent=work/'bootstrap-network-ordinary-evidence-intent.json'
 if out.exists():return strict(read_file(out,65536,True))
 if intent.exists():return {'state':'UNKNOWN_ORIGINAL_PROBE_NO_REPLAY','sourceSetSha256':SOURCE}
 ordinary=strict(read_file(work/'ordinary-result.json',1024*1024,True));program=strict(read_file(work/'program-description.json',1024*1024,True));cleanup=strict(read_file(work/'ordinary-child-cleanup.json',65536,True))
 need(ordinary.get('state')=='FRESH35_ORDINARY_RUNNER_COMPLETED' and ordinary.get('connectionCleanup')=='CLOSED' and ordinary.get('syntheticOnly') is True and
      ordinary.get('sourceSetSha256')==SOURCE and all(ordinary.get(k)==program.get(k) and ordinary.get(k) is not None for k in ['sourceSetSha256','programSha256','targetSha256']) and cleanup.get('childReaped') is True,'ORIGINAL_ORDINARY_RECEIPTS_REQUIRED')
 code=read_file(Path(__file__).with_name('ordinary-proof-evidence.py'),65536,True)
 need(sha(code)==PROOF_EVIDENCE_SOURCE_SHA,'FIXED_PROOF_EVIDENCE_SOURCE_REQUIRED')
 owned(inspect(receipt['cid']),receipt,plan)
 need(int(time.time()*1000)<receipt['expiresAt']-40000,'ORIGINAL_PROOF_EVIDENCE_WINDOW_REQUIRED')
 new_json(intent,{'sourceSetSha256':SOURCE,'operationId':plan['operationId'],'cid':receipt['cid'],'probeSha256':PROOF_EVIDENCE_SOURCE_SHA})
 try:
  raw=run(['docker','exec','-i','--user','0:0',receipt['cid'],'/usr/bin/python3','-I','-S','-c',code.decode()],data=json.dumps({'sourceSetSha256':SOURCE,'expiresAt':receipt['expiresAt']}).encode(),seconds=40)
  need(len(raw)<=65536,'BOUNDED_PROOF_EVIDENCE_REQUIRED');result=strict(raw)
 except Exception as e:result={'state':'UNKNOWN_OR_FAILED_ORIGINAL_PROBE_NO_REPLAY','sourceSetSha256':SOURCE,'errorCode':type(e).__name__}
 new_json(out,result);return result

def observation(plan,wait=True):
 receipt=strict(read_file(ROOT/'container-receipt.json',65536));work=ROOT/'state'/WORK
 while wait and int(time.time()*1000)<receipt['expiresAt']-5000 and not (work/'result.json').is_file() and not (ROOT/'state/launcher-exit-code').is_file():
  owned(inspect(receipt['cid']),receipt,plan);time.sleep(.25)
 result=strict(read_file(work/'result.json',1024*1024)) if (work/'result.json').is_file() else {'state':'UNKNOWN','cleanup':{'cleanupComplete':False}}
 info=inspect(receipt['cid']);owned(info,receipt,plan)
 # Stop only exact owned CID after original result, explicit finally failure,
 # or deadline. Stopping/killing does NOT prove DB/credential cleanup.
 launcher_exit=None
 if (ROOT/'state/launcher-exit-code').is_file():
  raw=read_file(ROOT/'state/launcher-exit-code',16,True);need(re.fullmatch(rb'[0-9]{1,3}\n',raw) and int(raw)<=255,'LAUNCHER_EXIT_RECEIPT_DIFFERS');launcher_exit=int(raw)
 early_exit=launcher_exit is not None and not (work/'controller-process.json').exists()
 stop_allowed=(work/'result.json').is_file() or early_exit or int(time.time()*1000)>=receipt['expiresAt']-5000
 proof_evidence={}
 if info['running'] and result.get('state')=='ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED' and result.get('ordinaryBusinessVerified') is True and result.get('cleanup',{}).get('cleanupComplete') is True:
  try:proof_evidence=ordinary_proof_evidence(plan,receipt)
  except Exception as e:proof_evidence={'state':'FAILED_OR_UNVERIFIED','errorCode':type(e).__name__}
 elif (work/'bootstrap-network-ordinary-evidence.json').exists():proof_evidence=strict(read_file(work/'bootstrap-network-ordinary-evidence.json',65536,True))
 if info['running'] and stop_allowed:
  run(['docker','stop','--time','3',receipt['cid']],seconds=8);info=inspect(receipt['cid']);owned(info,receipt,plan)
 ok=(result.get('state')=='ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED' and result.get('syntheticImportVerified') is True and result.get('independentSnapshotsVerified') is True and result.get('ordinaryBusinessVerified') is True and result.get('recordPublished') is True and result.get('businessVerified') is False and result.get('productionVerified') is False and result.get('cleanup',{}).get('cleanupComplete') is True and not info['running'])
 evidence={}
 network_evidence_sha256={}
 for name in ['runtime-dependencies.json','installation-child-failure.json','installation-result.json','rollback-host-result.json','host-result.json','snapshot-after-install.json','snapshot-after-rollback.json','snapshot-after-commit.json','rollback-child-failure.json','commit-child-failure.json','ordinary-result.json','ordinary-failure.json','ordinary-child-cleanup.json','failure.json','cleanup.json','bootstrap-network-ordinary-evidence.json','bootstrap-network-observation.json']:
  if (work/name).is_file():
   public_network=name=='bootstrap-network-observation.json'
   raw=read_file(work/name,65536 if public_network else 1024*1024,not public_network)
   value=strict(raw)
   if public_network:
    need(isinstance(value,dict) and set(value)=={'format','systemIdentifier','databaseOid','serverVersionNum','postmasterStart','host','port','listenAddresses','unixSocketDirectories','adminActor','startsAt','expiresAt','sourceSetSha256'} and
         value['format']=='FRESH35_SYNTHETIC_BOOTSTRAP_NETWORK_OBSERVATION_V1' and value['sourceSetSha256']==SOURCE,'EXACT_BOOTSTRAP_NETWORK_EVIDENCE_REQUIRED')
    network_evidence_sha256[name]=sha(raw)
   evidence[name]=value
 if ok:
  ordinary=evidence.get('ordinary-result.json',{});program=strict(read_file(work/'program-description.json',1024*1024,True)) if (work/'program-description.json').is_file() else {}
  ok=(ordinary.get('state')=='FRESH35_ORDINARY_RUNNER_COMPLETED' and ordinary.get('connectionCleanup')=='CLOSED' and ordinary.get('syntheticOnly') is True and ordinary.get('sourceSetSha256')==SOURCE and all(ordinary.get(k) is not None and ordinary.get(k)==program.get(k) for k in ['sourceSetSha256','programSha256','targetSha256']) and evidence.get('ordinary-child-cleanup.json',{}).get('childReaped') is True)
 if ok:ok=(proof_evidence.get('state')=='PASS_ACTUAL_ORDINARY_PROOF_EVIDENCE' and proof_evidence.get('sourceSetSha256')==SOURCE and proof_evidence.get('metadataTouchCount')==1 and proof_evidence.get('childReaped') is True and proof_evidence.get('sqlExecuted') is False)
 return {'status':'PASS_SCOPED_SYNTHETIC_AND_CLEANUP' if ok else 'WAITING_ORIGINAL_LAUNCHER' if result.get('state')=='UNKNOWN' and info['running'] and not stop_allowed else 'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY','sourceResult':result,'ordinaryProofEvidence':proof_evidence,'evidence':evidence,'evidenceSha256':network_evidence_sha256,'launcherExitCode':launcher_exit,'containerStopped':not info['running'],'forcedStopIsNotCleanShutdownProof':True,'cid':receipt['cid']}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['materialize-app','materialize-remaining','start-target','deliver-install','observe'],required=True);parser.add_argument('--plan',required=True);parser.add_argument('--plan-sha256',required=True);parser.add_argument('--external-input');parser.add_argument('--external-sha256');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 need(args.execute,'EXPLICIT_EXECUTION_NOT_REQUESTED');require_frozen_application()
 need(os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_DISPATCHER_REQUIRED')
 job=trusted(Path(os.environ['ERP_SHARED_JOB_DIR']));need(job.parent==PRIVATE and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',job.name),'ORIGINAL_PRIVATE_JOB_REQUIRED');plan=load_plan(args.plan,args.plan_sha256);result=None
 try:
  if args.phase=='materialize-app':result=materialize_application(plan)
  elif args.phase=='materialize-remaining':result=materialize_remaining_application(plan)
  elif args.phase=='start-target':need(args.external_input and args.external_sha256,'EXTERNAL_PROVISION_INPUT_REQUIRED');result=start_target(plan,args.external_input,args.external_sha256)
  elif args.phase=='deliver-install':
   need(args.external_input and args.external_sha256,'EXTERNAL_INSTALL_INPUT_REQUIRED');copied=delivery(plan,args.external_input,args.external_sha256);result=observation(plan);result['delivery']=copied
  else:result=observation(plan,wait=False)
 except Exception as e:
  result={'status':'STOP_OR_UNKNOWN_NO_REPLAY','phase':args.phase,'errorCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__}
  if args.phase!='materialize-remaining' and (ROOT/'start-intent.json').is_file() and not (ROOT/'container-receipt.json').exists():
   try:recover_original_cid(plan)
   except Exception as recovery:result['originalNameReadback']='UNCONFIRMED_'+type(recovery).__name__
  if args.phase!='materialize-remaining' and (ROOT/'container-receipt.json').is_file():
   try:result['readback']=observation(plan,wait=False)
   except Exception as cleanup:result['cleanupReadback']='UNCONFIRMED_'+type(cleanup).__name__
 finally:
  if result is not None:new_json(job/'results'/('fresh35-'+args.phase+'-result.json'),result)
 need(result is not None and result['status'] not in ['STOP_OR_UNKNOWN_NO_REPLAY','FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY'],'OPERATION_NOT_CONFIRMED')
if __name__=='__main__':
 try:main()
 except Exception as e:sys_exit=2;print(json.dumps({'status':'STOP_NO_REPLAY','errorCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__}));raise SystemExit(sys_exit)
