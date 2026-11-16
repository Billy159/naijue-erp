#!/usr/bin/python3
"""Fixed first-install carrier for erp_fresh35_20261110_r3.
Inert on import. Only the original T45 dispatcher executes --execute after the
actual environment permission. A plan/hash is configuration, not an approval.
No approval, DB window, installation record or source guard is manufactured.
"""
import argparse, hashlib, io, json, os, re, stat, subprocess, sys, tarfile, time
from pathlib import Path, PurePosixPath

GRANT='5cc58239751e4e2a'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
PRIVATE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
ENV_ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1')
SOURCE_ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261109-r1')
ROOT=SOURCE_ROOT.with_name('fresh35-first-production-20261110-r3')
NAME='t45-'+ROOT.name
BASE='docker.io/library/debian@sha256:7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392'
SHARED_REAL_PACKAGE=SOURCE_ROOT/'input/package'
SHARED_REAL_BINDING_SHA='6ea3a3beeab93bb3354047a25af53566eb59685cd5c3aac6a64928b5c9c1d830'
SHARED_REAL_MANIFEST='1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9'
ENV_SOURCE='0e6b01ec154bd089dbfad61715cf194d339ed6e3bb56311bbd91971e5aa5cf2f'
ENV_IMAGE='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
ENV_RECEIPT_SHA='e475f85c3501dbf9f9a18ddcc5be94384f82582712cd5a939f3326628237a47f'
ENV_RECIPE_SHA='e9e9d026b4eae3ddd8640b5cde7f5e3760fb146b726b03179d6294665a8761ac'
ENV_OPERATION='t45-f35-5b26-exact-five-downgrades-20261105-01'
ENV_ARCHIVE_SHA='b91bf14ebf482c607ed790580883274adea6e0d2f2a539d82236673a7e769920'
# Deliberately unresolved until C freezes D1 + launcher + any D2 consumer.
# These are not dummy digests or runtime-selectable arguments.
SOURCE='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16'
BASE_SOURCE='8694c5c7e1bc4b09f9511869f2665e8ec9fad65d6aa832b139a24d47258f998d'
ARCHIVE_SHA='99c7245e0222b300b6bd6c4b3e84990c3dbd183dd3008e5500a84211ec2fe4b4'
ARCHIVE_BYTES=83705857
FILE_COUNT=7294
MANIFEST_SHA='53de9b380bc7c6aec1bcd136fa554bc43077e7557b0f441710032c89f8aaab9e'
BASE_MANIFEST_SHA='e7b612814be23afe4fbc1b2b1ecaf680b5933cbed777bf26caeee31381d0ff62'
LOCK_SHA='0aaf271430d37313a4e83ff58d8af7c58c36b3d38b629eca9b3cdfe1681f9e9b'
LIBPQ_SHA='f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d'
NODE_SHA='7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'
KEY='f35-3b82c4-first-production-20261109-r1'
NATIVE_MATERIALIZE_JOB='t45-first-r1-native-materialize-20261109-01'
NATIVE_COPY_MODE='VERIFIED_R3_LOCAL_COPY'
NATIVE_COPY_ROOT=ENV_ROOT/'phaseb-application-production-20261107-r3'
NATIVE_COPY_FILES_SHA='396fe54319fcd2add2dfa849efdff360718eeb332a4f1ed2914bad5f74e1ee21'
NATIVE_COPY_RECEIPT_SHA='a8ccc7731c9328b169b44aa31206451a93c2db244a05c330b9a635635bbe720a'
NATIVE_COPY_ROOT_ID=(66304,14309740,0,0,0o700,4096,7,1794012363719244902,1794012363719244902)
NATIVE_REMAINING_JOB='t45-first-r1-native-remaining-20261109-01'
NATIVE_PARTIAL_JOB='t45-first-r1-native-partial-readonly-20261109-01'
NATIVE_FAILED_SHA='4e8975a5fc29d395bd19b3d351d16f50601bb21f5d70dd4b5e21cd2c791a96ff'
NATIVE_PARTIAL_TERMINAL_SHA='cfaaf8e126af2f8e021c920fd1cfcc0b3ddf987c9b98004f7126e6f2c2d77165'
NATIVE_PARTIAL_SHA='edb423bfd7f3c1c9418dd01e2e53ba6731baae6577ca1b092999c96be4e5f968'
NATIVE_MISSING_SHA='f7504fb496b948af415cd279da99f34afae24a0ee5fc61913a3bdbeac4bbad55'
NATIVE_PARTIAL_ROOT_ID=(66304,13238273,0,0,0o700,4096,3,1794234219716815515,1794234219716815515)
NATIVE_ORIGINAL_AUTH_SHA='e8c6449e4cc03eaa0356d1f51be254dc0872ee82e72ee76ef653890708142f01'
NATIVE_ORIGINAL_PLAN_SHA='a6cf179ce6f726782e755e61c0914b28183fc2ec14b763e657fee7a78cd18f70'
DEPLOY='/opt/naijue-erp/fresh35-combined-v1'
STATE='/var/lib/naijue-erp/fresh35-isolated'
WORK='cloud-pg-fresh35-20261105-r1'
CAPACITY_PROFILE='/run/naijue-rewrite/capacity/owner-profile.json'
PROOF_EVIDENCE_SOURCE_SHA='b853ffe1379e187d88b31889c21650995711a17531b36b6a8093917beda421f3'
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
def read_application_member(p,expected,deployment_root=None):
 root=ROOT/'deploy' if deployment_root is None else deployment_root
 p=Path(p);need(p.is_relative_to(root),'APPLICATION_MEMBER_SCOPE_REQUIRED')
 if p.stat().st_size:return read_file(p,max(1,p.stat().st_size))
 name=str(p.relative_to(root));need(expected.get(name)=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','EMPTY_APPLICATION_MEMBER_NOT_REGISTERED')
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

def exact_plan_keys(p,keys):
 return set(p)==keys or set(p)==keys|{'sourceMode'} and p['sourceMode']==NATIVE_COPY_MODE

def load_plan(path,digest):
 path=job_input(path)
 b=read_file(path,65536,True);need(sha(b)==digest,'PLAN_HASH_DIFFERS');p=strict(b)
 need(exact_plan_keys(p,PLAN_KEYS) and p['enabled'] is True and isinstance(p['authorizationReference'],str) and 0<len(p['authorizationReference'])<=512,'EXPLICIT_SCOPE_CONFIGURATION_REQUIRED')
 need(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',p['operationId']) is not None,'OPERATION_ID_REQUIRED')
 for k in ['opsSourceSha256','stagingAuthoritySha256']:need(isinstance(p[k],str) and re.fullmatch('[a-f0-9]{64}',p[k]),'EXACT_PIN_REQUIRED')
 need(p['opsSourceSha256']==sha(Path(__file__).read_bytes()),'OPS_SOURCE_CHANGED')
 need(type(p['imagePreparationExpiresAt']) is int,'EXTERNAL_PREPARATION_DEADLINE_REQUIRED');return p

def staged_artifact(key,source_field,source_digest,archive_bytes,archive_digest,authority_digest,ready_digest):
 namespace='artifacts' if source_field=='sourceSetSha256' else 'private-standard-import-data'
 target=trusted(CONTROL/namespace/key,False)
 ts=target.lstat();need(stat.S_ISDIR(ts.st_mode) and ts.st_uid==ts.st_gid==1000 and stat.S_IMODE(ts.st_mode)==0o700,
                       'STAGED_DIRECTORY_IDENTITY_DIFFERS')
 ready_path=target/'ready.json';raw=read_file(ready_path,65536,True,False)
 rs=ready_path.lstat();need(rs.st_uid==rs.st_gid==1000 and stat.S_IMODE(rs.st_mode)==0o600,
                           'STAGED_READY_OWNER_OR_MODE_DIFFERS')
 need(type(ready_digest) is str and re.fullmatch('[a-f0-9]{64}',ready_digest) and sha(raw)==ready_digest,
      'EXACT_STAGED_READY_DIGEST_REQUIRED')
 ready=strict(raw)
 need(set(ready)=={'status','artifactKey',source_field,'archiveSha256','archiveBytes','authoritySha256','fileIdentity'}
      and ready['status']=='READY' and ready['artifactKey']==key and ready[source_field]==source_digest
      and ready['archiveSha256']==archive_digest and ready['archiveBytes']==archive_bytes
      and ready['authoritySha256']==authority_digest,'EXACT_STAGED_READY_REQUIRED')
 archive=trusted(target/'archive.bin',False)
 def identity(s):return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
 before=archive.lstat();need(before.st_uid==before.st_gid==1000 and stat.S_IMODE(before.st_mode)==0o600
                             and identity(before)==ready['fileIdentity'],'STAGED_ARCHIVE_IDENTITY_CHANGED')
 data=read_file(archive,archive_bytes,True,False)
 need(len(data)==archive_bytes and sha(data)==archive_digest and identity(archive.lstat())==identity(before)
      and read_file(ready_path,65536,True,False)==raw and identity(ready_path.lstat())==identity(rs)
      and identity(target.lstat())==identity(ts),
      'STAGED_ARCHIVE_OR_READY_CHANGED')
 return data

def staged_archive(plan,ready_digest):
 return staged_artifact(KEY,'sourceSetSha256',SOURCE,ARCHIVE_BYTES,ARCHIVE_SHA,plan['stagingAuthoritySha256'],ready_digest)

def archive_files(b):
 # Validate the entire immutable byte snapshot BEFORE creating the new root.
 members={};modes={}
 with tarfile.open(fileobj=io.BytesIO(b),mode='r:gz') as t:
  for m in t:
   n=m.name;q=PurePosixPath(n)
   need(m.isfile() and not q.is_absolute() and str(q)==n and '..' not in q.parts and '\\' not in n and n not in members and m.mode in [0o644,0o755],'REGULAR_EXACT_ARCHIVE_REQUIRED')
   members[n]=t.extractfile(m).read();modes[n]=m.mode
 return members,modes,verify_native_members(members)

def verify_native_members(members):
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
 return strict(lock)

def new_parents(p):
 missing=[];q=p
 while not q.exists():need(q!=ROOT and q.is_relative_to(ROOT),'NEW_ROOT_ONLY');missing.append(q);q=q.parent
 trusted(q)
 for q in reversed(missing):q.mkdir(mode=0o755);os.chmod(q,0o755)

def require_preparation_time(plan):
 need(int(time.time()*1000)<plan['imagePreparationExpiresAt'],'PREPARATION_DEADLINE_EXPIRED')

def materialize(plan,b):
 files,modes,lock=archive_files(b)
 write_native_members(plan,files,modes)
 return lock

def write_native_members(plan,files,modes):
 trusted(ROOT.parent)
 require_preparation_time(plan)
 ROOT.mkdir(mode=0o700);syncdir(ROOT.parent)
 require_preparation_time(plan)
 new_json(ROOT/'prepare-started.json',application_receipt(plan))
 write_missing_native_files(plan,files,modes,set())
 write_native_fixed_leaves(plan,files)

def write_missing_native_files(plan,files,modes,present):
 for name,data in files.items():
  if name in present:continue
  require_preparation_time(plan)
  path=ROOT/name
  new_parents(path.parent)
  require_preparation_time(plan)
  new_file(path,data,modes[name])

def write_native_fixed_leaves(plan,files):
 # 0711 gives ordinary UID traversal to the public0644 record. Secret files stay
 # 0400/0600. A0700 authority parent would break the original ordinary host.
 for name,mode in [('authority',0o711),('state',0o755)]:
  require_preparation_time(plan)
  (ROOT/name).mkdir(mode=mode);os.chmod(ROOT/name,mode)
 # Reserve only an empty inode for the fixed read-only file mount. It is NOT a
 # usable capacity profile or authority: real target/child/volume facts do not
 # exist yet. The original collector rejects it until the original parent
 # fills that same inode through the writable STATE alias before business.
 require_preparation_time(plan)
 (ROOT/'state/capacity').mkdir(mode=0o700)
 require_preparation_time(plan)
 new_file(ROOT/'state/capacity/owner-profile.json',b'',0o644)
 require_preparation_time(plan)
 new_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',files['metadata/deployment-manifest.json'],0o400)

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
 write_missing_native_files(plan,files,modes,present)
 written=len(files.keys()-present)
 for name,mode in [('authority',0o711),('state',0o755),('state/capacity',0o700)]:
  path=ROOT/name
  if not path.exists():path.mkdir(mode=mode);os.chmod(path,mode);syncdir(path.parent)
 for name in ['authority/fresh35-isolated-deployment-v1.json','state/capacity/owner-profile.json']:
  if name not in present:new_file(ROOT/name,fixed[name],all_modes[name]);written+=1
 verify_materialized_application(plan)
 return {'existingExactFilesReused':len(present),'missingFilesWritten':written,'existingFilesOverwritten':0}

def materialize_remaining_application(plan,ready_digest):
 require_frozen_application();need(int(time.time()*1000)<plan['imagePreparationExpiresAt'],'PREPARATION_DEADLINE_EXPIRED')
 image=environment_image();result=materialize_remaining(plan,staged_archive(plan,ready_digest))
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
 composition={'mode':'CANONICAL_FULL_ARCHIVE','artifactKey':KEY,'authoritySha256':plan['stagingAuthoritySha256']}
 if plan.get('sourceMode')==NATIVE_COPY_MODE:
  composition={'mode':NATIVE_COPY_MODE,'authoritySha256':plan['stagingAuthoritySha256'],
               'sourceReceiptSha256':NATIVE_COPY_RECEIPT_SHA,'fileSetSha256':NATIVE_COPY_FILES_SHA}
 return {'operationId':plan['operationId'],'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA,'deploymentManifestSha256':MANIFEST_SHA,'environmentImage':ENV_IMAGE,'environmentReceiptSha256':ENV_RECEIPT_SHA,'sourceComposition':composition}

def original_source_manifest():
 require_frozen_application()
 source=trusted(SOURCE_ROOT).lstat();deploy=trusted(SOURCE_ROOT/'deploy').lstat()
 need(stat.S_ISDIR(source.st_mode) and stat.S_ISDIR(deploy.st_mode)
      and (source.st_dev,source.st_ino,deploy.st_dev,deploy.st_ino)==(66304,13238273,66304,13240826),
      'ORIGINAL_READONLY_SOURCE_IDENTITY_DIFFERS')
 original={'operationId':'t45-first-20261109-r1-install-preparation','sourceMode':NATIVE_COPY_MODE,
           'stagingAuthoritySha256':NATIVE_ORIGINAL_AUTH_SHA}
 receipt={**application_receipt(original),'sourceSet':BASE_SOURCE,'deploymentManifestSha256':BASE_MANIFEST_SHA}
 need(strict(read_file(SOURCE_ROOT/'prepare-started.json',65536,True))==receipt,
      'CURRENT_APPLICATION_RECEIPT_DIFFERS')
 raw=read_file(SOURCE_ROOT/'metadata/deployment-manifest.json',2*1024*1024)
 need(sha(raw)==BASE_MANIFEST_SHA and read_file(SOURCE_ROOT/'authority/fresh35-isolated-deployment-v1.json',2*1024*1024,True)==raw,
      'CURRENT_APPLICATION_AUTHORITY_MANIFEST_DIFFERS')
 need(strict(read_file(SOURCE_ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==BASE_SOURCE,
      'CURRENT_APPLICATION_SOURCE_DIFFERS')
 return raw

def first_manifest_entries(raw):
 manifest=strict(raw)
 need(set(manifest)=={'format','files'} and manifest['format']=='FRESH35_ISOLATED_DEPLOYMENT_V1','CURRENT_APPLICATION_MANIFEST_FORMAT')
 expected={}
 for row in manifest['files']:
  need(set(row)=={'path','sha256'} and row['path'] not in expected,'CURRENT_APPLICATION_MANIFEST_MEMBER')
  name=row['path'];q=PurePosixPath(name)
  need(not q.is_absolute() and str(q)==name and '..' not in q.parts and chr(92) not in name,'CURRENT_APPLICATION_PATH')
  expected[name]=row['sha256']
 return manifest,expected


def first_install_manifest(raw):
 need(sha(raw)==BASE_MANIFEST_SHA,'FIRST_INSTALL_BASE_MANIFEST_DIFFERS')
 manifest,entries=first_manifest_entries(raw)
 need(len(entries)==FILE_COUNT and all(entries.get(rel)==base for rel,(base,_) in FIRST_NATIVE_DELTA.items()),
      'FIRST_INSTALL_BASE_NATIVE_PINS_DIFFER')
 for row in manifest['files']:
  if row['path'] in FIRST_NATIVE_DELTA:
   row['sha256']=FIRST_NATIVE_DELTA[row['path']][1]
 updated=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode()
 need(sha(updated)==MANIFEST_SHA,'FIRST_INSTALL_CANDIDATE_MANIFEST_DIFFERS')
 return updated


def first_native_launcher(rel):
 return ROOT/'native-launchers'/Path(rel).name


def first_native_launcher_bytes(path,rel):
 raw=read_file(path,262144,True)
 need(sha(raw)==FIRST_NATIVE_DELTA[rel][1],'FIRST_INSTALL_NATIVE_LAUNCHER_DIFFERS')
 return raw


def verify_materialized_application(plan):
 base=original_source_manifest()
 raw=first_install_manifest(base)
 identity=materialized_root_identity(plan)
 terminal=strict(read_file(CONTROL/'results'/(FIRST_BIND_JOB+'.json'),65536,root=False))
 bound=strict(read_file(CONTROL/'jobs'/FIRST_BIND_JOB/'results/fresh35-materialize-app-result.json',65536,root=False))
 marker=strict(read_file(ROOT/'prepare-started.json',65536,True))
 need(terminal.get('taskId')=='T45' and terminal.get('jobId')==FIRST_BIND_JOB
      and terminal.get('status')=='COMPLETED' and terminal.get('exitCode')==0
      and bound.get('status')=='FIRST_R3_READONLY_SOURCE_BOUND_NO_DB_WINDOW'
      and bound.get('postgresStarted') is False and bound.get('identity')==identity
      and all(bound.get(k)==marker[k] for k in ('planSha256','materializationSha256','sourceSetSha256',
               'deploymentManifestSha256'))
      and type(bound.get('allocatedTargetBytes')) is int and 0<bound['allocatedTargetBytes']<=FIRST_STAGE_CAP,
      'R3_ORIGINAL_MATERIALIZATION_TERMINAL_REQUIRED')
 need(read_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',2*1024*1024,True)==raw,
      'CURRENT_APPLICATION_AUTHORITY_MANIFEST_DIFFERS')
 need(sha(raw)==MANIFEST_SHA,'CURRENT_APPLICATION_MANIFEST_DIFFERS')
 _,base_expected=first_manifest_entries(base)
 _,expected=first_manifest_entries(raw)
 actual={}
 for path in (SOURCE_ROOT/'deploy').rglob('*'):
  trusted(path)
  if path.is_file():
   name=str(path.relative_to(SOURCE_ROOT/'deploy'))
   actual[name]=sha(read_application_member(path,base_expected,SOURCE_ROOT/'deploy'))
 need(actual==base_expected,'CURRENT_APPLICATION_BASE_CLOSURE_DIFFERS')
 for rel in FIRST_NATIVE_DELTA:
  actual[rel]=sha(first_native_launcher_bytes(first_native_launcher(rel),rel))
 need(actual==expected,'CURRENT_APPLICATION_CLOSURE_DIFFERS')

def native_host_admission(plan):
 parent=trusted(ROOT.parent);space=os.statvfs(parent)
 need(parent.stat().st_dev==66304 and space.f_bavail*space.f_frsize>=28*1024**3,
      'FIRST_NATIVE_HOST_VOLUME_OR_SPACE_DIFFERS')
 require_preparation_time(plan)

def materialize_application(plan,ready_digest):
 require_frozen_application()
 require_preparation_time(plan)
 image=environment_image();data=staged_archive(plan,ready_digest)
 native_host_admission(plan)
 materialize(plan,data)
 require_preparation_time(plan)
 verify_materialized_application(plan)
 require_preparation_time(plan)
 return {'status':'CURRENT_APPLICATION_MATERIALIZED_NO_DB_WINDOW','application':application_receipt(plan),'stageReadySha256':ready_digest,'image':image['image'],'environmentReceiptUnchanged':True,'imageBuilt':False,'postgresStarted':False}

def local_copy_identity(info):
 return (info.st_dev,info.st_ino,info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode),
         info.st_size,info.st_nlink,info.st_mtime_ns,info.st_ctime_ns)

def local_copy_expected(job,plan,path,digest):
 need(path==str(job/'bundle/copy-binding.json') and digest==plan['stagingAuthoritySha256'],
      'FIRST_NATIVE_COPY_EXTERNAL_BINDING_REQUIRED')
 raw=read_file(job_input(path),65536,True)
 need(sha(raw)==digest,'FIRST_NATIVE_COPY_BINDING_DIGEST_DIFFERS')
 binding=strict(raw)
 fixed={'format':'T45_FIRST_R1_NATIVE_LOCAL_COPY_V1',
        'decision':'AUTHORIZE_EXACT_R3_TO_R1_MATERIAL_COPY_ONLY',
        'jobId':NATIVE_MATERIALIZE_JOB,'sourceRoot':str(NATIVE_COPY_ROOT),'targetRoot':str(ROOT),
        'sourceSetSha256':SOURCE,'canonicalArchiveSha256':ARCHIVE_SHA,'deploymentManifestSha256':MANIFEST_SHA,
        'expectedFileSetSha256':NATIVE_COPY_FILES_SHA,'sourceReceiptSha256':NATIVE_COPY_RECEIPT_SHA,
        'decisionReference':plan['authorizationReference'],'expiresAt':plan['imagePreparationExpiresAt']}
 need(set(binding)==set(fixed)|{'startsAt'} and all(binding[k]==value for k,value in fixed.items()),
      'FIRST_NATIVE_COPY_BINDING_DIFFERS')
 need(type(binding['startsAt']) is int and type(binding['expiresAt']) is int
      and binding['startsAt']<=int(time.time()*1000)<binding['expiresAt']<=binding['startsAt']+600000,
      'FIRST_NATIVE_COPY_WINDOW_REQUIRED')
 return native_file_set(job)

def native_file_set(job):
 raw=read_file(job/'bundle/r3-members.json',4*1024*1024,True)
 need(sha(raw)==NATIVE_COPY_FILES_SHA,'FIRST_NATIVE_COPY_EXPECTED_FILE_SET_DIFFERS')
 entries=strict(raw)['entries']
 files={name:(digest,size,mode) for name,digest,size,mode in entries}
 need(len(entries)==len(files)==FILE_COUNT+4,'FIRST_NATIVE_COPY_FILE_COUNT_DIFFERS')
 directories={}
 for name in files:
  child=PurePosixPath(name)
  need(not child.is_absolute() and str(child)==name and '..' not in child.parts
       and child.parts[0] in ('deploy','metadata'),'FIRST_NATIVE_COPY_MEMBER_PATH_REFUSED')
  while len(child.parts)>1:
   directories.setdefault(str(child.parent),set()).add(child.name)
   child=child.parent
 need(not files.keys() & directories.keys(),'FIRST_NATIVE_COPY_MEMBER_PATH_CONFLICT')
 return files,directories

def local_copy_leaf(parent,name,expected,plan,capture,device):
 digest,size,mode=expected
 before=os.stat(name,dir_fd=parent,follow_symlinks=False)
 need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_dev==device
      and (before.st_uid,before.st_gid,before.st_size,stat.S_IMODE(before.st_mode))==(0,0,size,mode),
      'FIRST_NATIVE_COPY_MEMBER_METADATA_DIFFERS')
 stamp=local_copy_identity(before)
 fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_NOATIME,dir_fd=parent)
 data=bytearray() if capture else None
 h=hashlib.sha256()
 with os.fdopen(fd,'rb') as stream:
  need(local_copy_identity(os.fstat(fd))==stamp,'FIRST_NATIVE_COPY_MEMBER_CHANGED')
  remaining=size
  while remaining:
   require_preparation_time(plan)
   block=stream.read(min(1024*1024,remaining))
   need(bool(block),'FIRST_NATIVE_COPY_MEMBER_TRUNCATED')
   remaining-=len(block)
   h.update(block)
   if data is not None:data.extend(block)
  need(not stream.read(1) and h.hexdigest()==digest
       and stamp==local_copy_identity(os.fstat(fd))==local_copy_identity(os.stat(name,dir_fd=parent,follow_symlinks=False)),
       'FIRST_NATIVE_COPY_MEMBER_CONTENT_DIFFERS')
 return stamp,data

def local_copy_tree(root,files,directories,plan,capture,missing=frozenset()):
 root=trusted(root)
 device=root.lstat().st_dev
 stamps={root:local_copy_identity(root.lstat())}
 data={}
 seen=set()
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME

 def visit(parent,name,relative):
  require_preparation_time(plan)
  path=root/relative
  fd=os.open(name,flags,dir_fd=parent)
  try:
   before=os.fstat(fd)
   need((before.st_dev,before.st_uid,before.st_gid,stat.S_IMODE(before.st_mode))==(device,0,0,0o755)
        and local_copy_identity(path.lstat())==local_copy_identity(before),
        'FIRST_NATIVE_COPY_DIRECTORY_METADATA_DIFFERS')
   stamps[path]=local_copy_identity(before)
   with os.scandir(fd) as entries:
    names=set()
    for entry in entries:
     require_preparation_time(plan)
     need(entry.name in directories[relative],'FIRST_NATIVE_COPY_DIRECTORY_CLOSURE_DIFFERS')
     names.add(entry.name)
   need(missing or names==directories[relative],'FIRST_NATIVE_COPY_DIRECTORY_CLOSURE_DIFFERS')
   for child in sorted(names):
    member=relative+'/'+child
    if member in directories:
     visit(fd,child,member)
    else:
     need(member not in missing,'FIRST_NATIVE_REMAINING_LEAF_ALREADY_PRESENT')
     stamp,value=local_copy_leaf(fd,child,files[member],plan,capture,device)
     stamps[root/member]=stamp
     seen.add(member)
     if capture:data[member]=value
   need(local_copy_identity(os.fstat(fd))==stamps[path],'FIRST_NATIVE_COPY_TREE_CHANGED')
  finally:
   os.close(fd)

 fd=os.open(root,flags)
 try:
  need(local_copy_identity(os.fstat(fd))==stamps[root],'FIRST_NATIVE_COPY_TREE_CHANGED')
  for top in ('deploy','metadata'):
   if not missing or os.path.lexists(root/top):visit(fd,top,top)
 finally:
  os.close(fd)
 need(seen==files.keys()-missing,'FIRST_NATIVE_COPY_TREE_CLOSURE_DIFFERS')
 check_local_copy_identity(stamps,plan)
 return stamps,data

def check_local_copy_identity(stamps,plan):
 for path,stamp in stamps.items():
  require_preparation_time(plan)
  need(local_copy_identity(path.lstat())==stamp,'FIRST_NATIVE_COPY_TREE_CHANGED')

def local_copy_no_mounts():
 for row in Path('/proc/self/mountinfo').read_text().splitlines():
  mount_path=Path(row.split(' ',5)[4])
  need(not mount_path.is_relative_to(NATIVE_COPY_ROOT) and not mount_path.is_relative_to(ROOT),
       'FIRST_NATIVE_COPY_NESTED_MOUNT_REFUSED')

def materialize_local_copy(job,plan,path,digest):
 files,directories=local_copy_expected(job,plan,path,digest)
 require_frozen_application()
 image=environment_image()
 native_host_admission(plan)
 need(not os.path.lexists(ROOT),'FIRST_NATIVE_COPY_TARGET_ALREADY_PRESENT_NO_REPLAY')
 local_copy_no_mounts()
 old=trusted(NATIVE_COPY_ROOT)
 need(local_copy_identity(old.lstat())==NATIVE_COPY_ROOT_ID,'FIRST_NATIVE_COPY_R3_ROOT_DIFFERS')
 original,contents=local_copy_tree(old,files,directories,plan,True)
 need(original[old]==NATIVE_COPY_ROOT_ID,'FIRST_NATIVE_COPY_R3_ROOT_DIFFERS')
 verify_native_members(contents)
 check_local_copy_identity(original,plan)
 native_host_admission(plan)
 write_native_members(plan,contents,{name:row[2] for name,row in files.items()})
 del contents
 copied,_=local_copy_tree(ROOT,files,directories,plan,False)
 need(not ({stamp[:2] for stamp in original.values()} & {stamp[:2] for stamp in copied.values()}),
      'FIRST_NATIVE_COPY_TARGET_SHARES_SOURCE_INODE')
 require_preparation_time(plan)
 need(strict(read_file(ROOT/'prepare-started.json',65536,True))==application_receipt(plan)
      and sha(read_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',2*1024*1024,True))==MANIFEST_SHA,
      'FIRST_NATIVE_COPY_TARGET_BINDING_DIFFERS')
 check_local_copy_identity(original,plan)
 local_copy_no_mounts()
 require_preparation_time(plan)
 return {'status':'CURRENT_APPLICATION_MATERIALIZED_NO_DB_WINDOW','application':application_receipt(plan),
         'sourceCopy':{'sourceReceiptSha256':NATIVE_COPY_RECEIPT_SHA,'fileSetSha256':NATIVE_COPY_FILES_SHA,
                       'membersBeforeAndAfter':len(files),'bytes':sum(row[1] for row in files.values()),
                       'independentInodes':True,'sourceIdentityStable':True},
         'image':image['image'],'environmentReceiptUnchanged':True,'imageBuilt':False,'postgresStarted':False}

def native_remaining_lineage():
 return {'originalJobId':NATIVE_MATERIALIZE_JOB,'originalTerminalSha256':NATIVE_FAILED_SHA,
         'diagnosticJobId':NATIVE_PARTIAL_JOB,'diagnosticTerminalSha256':NATIVE_PARTIAL_TERMINAL_SHA,
         'diagnosticResultSha256':NATIVE_PARTIAL_SHA,'originalPlanSha256':NATIVE_ORIGINAL_PLAN_SHA,
         'expectedFileSetSha256':NATIVE_COPY_FILES_SHA,'missingPathsSha256':NATIVE_MISSING_SHA}

def native_remaining_authority(job,plan,path,digest):
 need(plan.get('sourceMode')==NATIVE_COPY_MODE and plan['stagingAuthoritySha256']==NATIVE_ORIGINAL_AUTH_SHA
      and path==str(job/'bundle/remaining-binding.json'),'FIRST_NATIVE_REMAINING_ORIGINAL_PLAN_REQUIRED')
 raw=read_file(job_input(path),65536,True)
 need(sha(raw)==digest,'FIRST_NATIVE_REMAINING_BINDING_DIGEST_DIFFERS')
 binding=strict(raw)
 fixed={'format':'T45_FIRST_R1_NATIVE_REMAINING_V1','decision':'AUTHORIZE_EXACT_R1_MISSING_NATIVE_LEAVES_ONLY',
        'jobId':NATIVE_REMAINING_JOB,'targetRoot':str(ROOT),'sourceRoot':str(NATIVE_COPY_ROOT),
        'targetIdentity':list(NATIVE_PARTIAL_ROOT_ID),'sourceSetSha256':SOURCE,
        'decisionReference':plan['authorizationReference'],'expiresAt':plan['imagePreparationExpiresAt'],
        **native_remaining_lineage()}
 need(set(binding)==set(fixed)|{'startsAt'} and all(binding[k]==value for k,value in fixed.items()),
      'FIRST_NATIVE_REMAINING_BINDING_DIFFERS')
 need(type(binding['startsAt']) is int and type(binding['expiresAt']) is int
      and binding['startsAt']<=int(time.time()*1000)<binding['expiresAt']<=binding['startsAt']+600000,
      'FIRST_NATIVE_REMAINING_WINDOW_REQUIRED')
 return binding

def native_remaining_missing(files):
 def terminal(job_id,digest,status,code):
  raw=read_file(CONTROL/'results'/(job_id+'.json'),65536,root=False)
  need(sha(raw)==digest,'FIRST_NATIVE_REMAINING_TERMINAL_DIGEST_DIFFERS')
  value=strict(raw)
  need(value['jobId']==job_id and value['taskId']=='T45' and value['status']==status
       and value['exitCode']==code,'FIRST_NATIVE_REMAINING_TERMINAL_DIFFERS')
  return value
 failed=terminal(NATIVE_MATERIALIZE_JOB,NATIVE_FAILED_SHA,'FAILED',124)
 need(failed['errorCode']=='PHASE_TIMEOUT_UNKNOWN_OUTCOME_NO_REPLAY' and not failed['exports'],
      'FIRST_NATIVE_REMAINING_ORIGINAL_TIMEOUT_REQUIRED')
 terminal(NATIVE_PARTIAL_JOB,NATIVE_PARTIAL_TERMINAL_SHA,'COMPLETED',0)
 raw=read_file(CONTROL/'jobs'/NATIVE_PARTIAL_JOB/'results/native-partial-readback.json',1024*1024,root=False)
 need(sha(raw)==NATIVE_PARTIAL_SHA,'FIRST_NATIVE_REMAINING_DIAGNOSTIC_DIGEST_DIFFERS')
 value=strict(raw)
 current=value['newClosure']
 missing=current['missingPaths']
 need(value['jobId']==NATIVE_PARTIAL_JOB and value['originalJobId']==NATIVE_MATERIALIZE_JOB
      and value['status']=='PARTIAL_ON_DISK_PRESERVED_NO_REPLAY'
      and value['partialRootIdentity']==list(NATIVE_PARTIAL_ROOT_ID)
      and value['originalPlanSha256']==NATIVE_ORIGINAL_PLAN_SHA and current['matchedDeploy']==6878
      and current['matchedMetadata']==0 and not current['invalidPaths'] and not current['unexpectedParentDirectories']
      and current['fixedLeaves']=={'prepare-started.json':'MATCH',
          'authority/fresh35-isolated-deployment-v1.json':'ABSENT','state/capacity/owner-profile.json':'ABSENT'}
      and len(missing)==len(set(missing))==420 and set(missing)<=files.keys()
      and sha((json.dumps(missing,separators=(',',':'))+'\n').encode())==NATIVE_MISSING_SHA,
      'FIRST_NATIVE_REMAINING_DIAGNOSTIC_DIFFERS')
 return frozenset(missing)

def native_directory_names(path,mode):
 fd=os.open(trusted(path),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME)
 try:
  info=os.fstat(fd)
  need((info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))==(0,0,mode)
       and local_copy_identity(info)==local_copy_identity(path.lstat()),'FIRST_NATIVE_REMAINING_DIRECTORY_DIFFERS')
  with os.scandir(fd) as entries:names={entry.name for entry in entries}
  need(local_copy_identity(os.fstat(fd))==local_copy_identity(info),'FIRST_NATIVE_REMAINING_DIRECTORY_CHANGED')
  return names
 finally:
  os.close(fd)

def materialize_native_remaining(job,plan,path,digest,*,plan_sha256):
 native_remaining_authority(job,plan,path,digest)
 files,directories=native_file_set(job)
 missing=native_remaining_missing(files)
 image=environment_image()
 native_host_admission(plan)
 local_copy_no_mounts()
 need(local_copy_identity(trusted(ROOT).lstat())==NATIVE_PARTIAL_ROOT_ID
      and native_directory_names(ROOT,0o700)=={'deploy','prepare-started.json'},
      'FIRST_NATIVE_REMAINING_PARTIAL_ROOT_DIFFERS')
 marker=ROOT/'prepare-started.json'
 marker_identity=local_copy_identity(marker.lstat())
 need(strict(read_file(marker,65536,True))==application_receipt(plan)
      and marker_identity[2:5]==(0,0,0o600),'FIRST_NATIVE_REMAINING_MARKER_DIFFERS')
 existing,_=local_copy_tree(ROOT,files,directories,plan,False,missing)
 old=trusted(NATIVE_COPY_ROOT)
 need(local_copy_identity(old.lstat())==NATIVE_COPY_ROOT_ID,'FIRST_NATIVE_COPY_R3_ROOT_DIFFERS')
 original,contents=local_copy_tree(old,files,directories,plan,True)
 need(original[old]==NATIVE_COPY_ROOT_ID,'FIRST_NATIVE_COPY_R3_ROOT_DIFFERS')
 verify_native_members(contents)
 check_local_copy_identity(existing,plan)
 check_local_copy_identity(original,plan)
 need(local_copy_identity(marker.lstat())==marker_identity
      and native_directory_names(ROOT,0o700)=={'deploy','prepare-started.json'},'FIRST_NATIVE_REMAINING_MARKER_OR_ROOT_CHANGED')
 native_host_admission(plan)
 write_missing_native_files(plan,contents,{name:row[2] for name,row in files.items()},files.keys()-missing)
 write_native_fixed_leaves(plan,contents)
 del contents
 copied,_=local_copy_tree(ROOT,files,directories,plan,False)
 need(all(copied[p]==stamp for p,stamp in existing.items() if str(p.relative_to(ROOT)) in files)
      and not ({stamp[:2] for stamp in original.values()} & {stamp[:2] for stamp in copied.values()}),
      'FIRST_NATIVE_REMAINING_EXISTING_OR_SOURCE_INODE_CHANGED')
 need(copied[ROOT][:5]==NATIVE_PARTIAL_ROOT_ID[:5] and local_copy_identity(marker.lstat())==marker_identity
      and native_directory_names(ROOT,0o700)=={'deploy','metadata','prepare-started.json','authority','state'}
      and native_directory_names(ROOT/'authority',0o711)=={'fresh35-isolated-deployment-v1.json'}
      and native_directory_names(ROOT/'state',0o755)=={'capacity'}
      and native_directory_names(ROOT/'state/capacity',0o700)=={'owner-profile.json'},
      'FIRST_NATIVE_REMAINING_FINAL_CLOSURE_DIFFERS')
 alias=ROOT/'authority/fresh35-isolated-deployment-v1.json'
 owner=ROOT/'state/capacity/owner-profile.json'
 owner_info=trusted(owner).lstat()
 need(local_copy_identity(alias.lstat())[2:5]==(0,0,0o400)
      and sha(read_file(alias,2*1024*1024,True))==MANIFEST_SHA and stat.S_ISREG(owner_info.st_mode)
      and local_copy_identity(owner_info)[2:7]==(0,0,0o644,0,1),
      'FIRST_NATIVE_REMAINING_FIXED_LEAF_DIFFERS')
 check_local_copy_identity(original,plan)
 check_local_copy_identity(copied,plan)
 local_copy_no_mounts()
 require_preparation_time(plan)
 return {'status':'FIRST_R1_NATIVE_REMAINING_MATERIALIZED_NO_DB_WINDOW','application':application_receipt(plan),
         'planSha256':plan_sha256,
         'continuation':{**native_remaining_lineage(),'remainingAuthoritySha256':digest,
                         'targetIdentity':list(copied[ROOT][:5]),'existingReused':len(files)-len(missing),
                         'missingWritten':len(missing),'fixedWritten':2,'membersVerified':len(files),
                         'existingOverwritten':0,'independentInodes':True,'sourceIdentityStable':True},
         'image':image['image'],'imageBuilt':False,'postgresStarted':False}

def inspect(cid):
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"memory":{{json .HostConfig.Memory}},"swap":{{json .HostConfig.MemorySwap}},"cpu":{{json .HostConfig.NanoCpus}},"pids":{{json .HostConfig.PidsLimit}},"caps":{{json .HostConfig.CapAdd}},"capDrop":{{json .HostConfig.CapDrop}},"security":{{json .HostConfig.SecurityOpt}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"usernsMode":{{json .HostConfig.UsernsMode}},"labels":{{json .Config.Labels}},"privileged":{{json .HostConfig.Privileged}},"devices":{{json .HostConfig.Devices}},"restart":{{json .HostConfig.RestartPolicy.Name}},"shm":{{json .HostConfig.ShmSize}},"tmpfs":{{json .HostConfig.Tmpfs}},"mounts":{{json .Mounts}}}'
 return strict(run(['docker','inspect','--format',fmt,cid]))
def mount(args,src,dst,ro=False):return args+['--mount','type=bind,src='+str(src)+',dst='+dst+(',readonly' if ro else '')]
def common(image,remaining,operation,cpus=2,memory_gib=3):
 need(image==ENV_IMAGE,'ACTUAL_ENVIRONMENT_IMAGE_DIFFERS')
 need(remaining>90,'ORIGINAL_WINDOW_TOO_SHORT')
 a=['docker','run','--detach','--pull=never','--restart=no','--name',NAME,'--user','0:0','--network','none','--read-only','--cpus',str(cpus),'--memory',f'{memory_gib}g','--memory-swap',f'{memory_gib}g','--pids-limit','256','--shm-size','64m','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--label','t45.operation='+operation,'--label','t45.source='+SOURCE]
 for c in ['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE']:a+=['--cap-add',c]
 for src,dst,ro in [(SOURCE_ROOT/'deploy',DEPLOY,True),(ROOT/'authority','/etc/naijue-erp',False),
                    (ROOT/'state',STATE,False),(SOURCE_ROOT/'deploy/runtime/node/bin/node','/usr/local/bin/node',True),
                    (ROOT/'state/capacity/owner-profile.json',CAPACITY_PROFILE,True)]:a=mount(a,src,dst,ro)
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

PRODUCTION_STATE='/var/lib/naijue-erp/fresh35-production'
FIRST_WORK=ROOT.name
FIRST_OPERATION='t45-first-20261110-r3-install-preparation'
FIRST_ALIAS='naijue-rewrite-fresh35-first-20261110-r3-app'
FIRST_FRONT_ID='f1caea1ce82b4804b7ba8b84d2c55fbe7d0a44d57e6e8d8f8ab90ac21628584c'
FIRST_BIND_JOB='t45-first-r3-native-bind-20261110-05'
FIRST_STAGE_CAP=64*1024**2
FIRST_ROLES={kind:'erp35_'+kind+'_20261110_r3' for kind in ('admin','owner','controller','runtime')}
FIRST_FRONT='naijue-fresh35-first-20261109-r1-front'
FIRST_TARGET={'database':'erp_fresh35_20261110_r3',**FIRST_ROLES,'host':'127.0.0.1','port':56791,
              'workspaceDirectory':PRODUCTION_STATE+'/'+FIRST_WORK}
FIRST_REAL_KEY=r't45-first-20261110-r3-real-(prepare|execute|inspect)-[0-9]{8}-[0-9]{2}'
PRODUCTION_MEMORY=7*1024**3
PRODUCTION_CPU=3*10**9
FIRST_ADMISSION_FREE=28*1024**3
FIRST_STATE_GID=61035
FIRST_STATE_MODE=0o710
FIRST_NATIVE_DELTA={
 'scripts/release/unified-install/launch-fresh35-isolated-v1.py': ('81ff199b977380f92886808567f3fdbe50d76b334094fd7c6ba6b14fa1e95e34', 'a56afc4a5fcd965f00306d4493586b27d4465896d4973e8535fe151975504d75'),
 'scripts/release/unified-install/launch-fresh35-production-v2.py': ('f2adbe41b24faeaf38b89cf4a633ba6f6a6f462b9bee06e34231ded4a5c2ab73', 'b72a0e5aeeb156a27488e32dbd5275f70de76887679f80c5803e8d44b2a8ee59'),
}
FIRST_CAPACITY_STOP='first-install-capacity-stop.json'

def assert_first_proposal(authority):
 proposal=authority['proposal'];ordinary=authority['ordinary']
 need(proposal==FIRST_TARGET
      and ordinary.get('connectHost')==FIRST_TARGET['host']
      and ordinary.get('connectPort')==FIRST_TARGET['port'],
      'FIRST_PRODUCTION_PROPOSAL_REQUIRED')

def first_host_capacity():
 available=next((int(l.split()[1])*1024 for l in Path('/proc/meminfo').read_text().splitlines()
                 if l.startswith('MemAvailable:')),0)
 need(available>=10*1024**3 and len(os.sched_getaffinity(0))>=4,
      'FIRST_PRODUCTION_HOST_CAPACITY_INSUFFICIENT')

def first_install_directory_profile(s,gid,mode):
 return stat.S_ISDIR(s.st_mode) and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,gid,mode)


def first_install_root_identities(root,state):
 need(root.st_dev==state.st_dev==66304 and first_install_directory_profile(root,0,0o700)
      and first_install_directory_profile(state,FIRST_STATE_GID,FIRST_STATE_MODE),
      'FIRST_INSTALL_HOST_VOLUME_CHANGED')
 return {'root':[root.st_dev,root.st_ino],'state':[state.st_dev,state.st_ino]}


def create_first_install_state(path):
 path.mkdir(mode=0o700)
 os.chown(path,0,FIRST_STATE_GID)
 path.chmod(FIRST_STATE_MODE)
 syncdir(path)
 syncdir(path.parent)


def first_capacity_sample(path,identity,mount,admission):
 path=trusted(path)
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);before=path.lstat()
  need((opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino)==tuple(identity)
       and real_mount(str(path))==mount,'FIRST_INSTALL_VOLUME_CHANGED')
  need(all(first_install_directory_profile(s,FIRST_STATE_GID,FIRST_STATE_MODE) for s in (opened,before)),
       'FIRST_INSTALL_STATE_ACCESS_DIFFERS')
  space=os.fstatvfs(fd);available=space.f_bavail*space.f_frsize
  after=path.lstat()
  need((after.st_dev,after.st_ino)==tuple(identity) and real_mount(str(path))==mount,
       'FIRST_INSTALL_VOLUME_CHANGED')
  need(first_install_directory_profile(after,FIRST_STATE_GID,FIRST_STATE_MODE),'FIRST_INSTALL_STATE_ACCESS_DIFFERS')
 finally:os.close(fd)
 if admission:need(available>=FIRST_ADMISSION_FREE,'FIRST_INSTALL_ADMISSION_SPACE_INSUFFICIENT')
 else:need(available>REAL_STOP_FLOOR,'FIRST_INSTALL_SPACE_FLOOR_REACHED')

def materialized_root_identity(plan):
 identity=first_install_root_identities(trusted(ROOT).lstat(),trusted(ROOT/'state').lstat())
 r=strict(read_file(ROOT/'prepare-started.json',65536,True))
 need(set(r)=={'operationId','sourceSetSha256','deploymentManifestSha256',
              'planSha256','materializationSha256','identity'}
      and r['operationId']==FIRST_OPERATION and r['sourceSetSha256']==SOURCE
      and r['deploymentManifestSha256']==MANIFEST_SHA
      and r['planSha256']==plan['rawPlanSha256'] and r['identity']==identity
      and type(r['materializationSha256']) is str and re.fullmatch('[a-f0-9]{64}',r['materializationSha256']),
      'R3_MATERIALIZATION_RECEIPT_DIFFERS')
 return identity

def first_host_install_volume(admission,plan):
 identities=materialized_root_identity(plan)
 state=trusted(ROOT/'state');s=state.lstat()
 mount=real_mount(str(state))
 need(real_mount(str(ROOT))==mount==real_mount(str(SOURCE_ROOT/'state'))
      and [s.st_dev,s.st_ino]==identities['state'], 'FIRST_INSTALL_HOST_VOLUME_CHANGED')
 identity=(s.st_dev,s.st_ino)
 first_capacity_sample(state,identity,mount,admission)
 return identity

def first_capacity_paths(work,device,mount,observed):
 for path in (work,work/'data',work/'data/pg_wal'):
  if not os.path.lexists(path):
   need(path not in observed,'FIRST_INSTALL_PGDATA_OR_WAL_VOLUME_CHANGED')
   continue
  s=trusted(path,root=False).lstat();identity=(s.st_dev,s.st_ino)
  need(stat.S_ISDIR(s.st_mode) and s.st_dev==device and real_mount(str(path))==mount
       and observed.setdefault(path,identity)==identity,'FIRST_INSTALL_PGDATA_OR_WAL_VOLUME_CHANGED')

def before_r3_install_cutoff(provision):
 return int(time.time()*1000)<provision['expiresAt']//1000*1000-270000

def require_r3_install_cutoff(provision):
 need(before_r3_install_cutoff(provision),'R3_INSTALL_WINDOW_OR_STOP_RESERVE_TOO_SHORT')

def guarded_r3_native_main(job_id=None):
 script=Path(DEPLOY)/'scripts/release/unified-install/launch-fresh35-production-v2.py'
 need(sys.argv[1:]==[str(script),'--run-authorized-once'],'EXACT_R3_NATIVE_ARGUMENTS_REQUIRED')
 manifest=read_file(Path('/etc/naijue-erp/fresh35-isolated-deployment-v1.json'),2*1024*1024,True)
 need(sha(manifest)==MANIFEST_SHA,'PRODUCTION_DEPLOYMENT_MANIFEST_DIFFERS')
 pins=[row['sha256'] for row in strict(manifest)['files'] if row['path']==str(script.relative_to(DEPLOY))]
 raw=read_file(script,262144)
 need(pins==[sha(raw)],'PRODUCTION_PYTHON_SOURCE_DIFFERS')
 native={'__file__':str(script),'__name__':'fixed_r3_native_launcher'}
 exec(compile(raw,str(script),'exec'),native)
 wait_external=native['wait_external']

 def wait_r3(a,path,watch):
  received=wait_external(a,path,watch)
  if path==native['INSTALL_AUTH']:
   # The original wait includes protected readback. Recheck after it even if
   # the publisher was delayed inside the atomic filesystem operation.
   require_r3_install_cutoff(a)
  return received

 native['wait_external']=wait_r3
 sys.argv=sys.argv[1:]
 if job_id is not None:os.environ['ERP_SHARED_INITIALIZATION_JOB_ID']=job_id
 return native['main']()

def first_launch_with_capacity(identity,cid,guarded_entry):
 import ctypes,signal,threading
 state=Path(PRODUCTION_STATE);work=state/FIRST_WORK;stop=state/FIRST_CAPACITY_STOP
 child=None;init_identity=None;observed={}
 def sample(admission=False):
  first_capacity_sample(state,identity,mount,admission)
  first_capacity_paths(work,identity[0],mount,observed)
 try:
  init=Path('/proc/1');identity_read={'pid':1,'starttime':(init/'stat').read_text().rsplit(')',1)[1].split()[19],
                                    'exe':os.readlink(init/'exe')}
  need(identity_read['exe']=='/usr/bin/timeout' and real_process_matches(identity_read),
       'FIRST_INSTALL_EXACT_CONTAINER_INIT_REQUIRED')
  init_identity=identity_read
  mount=real_mount(str(state));need(mount['mountPoint']==str(state),'FIRST_INSTALL_STATE_BIND_REQUIRED')
  sample(admission=True)
  libc=ctypes.CDLL(None,use_errno=True);watcher=os.getpid()
  def stop_if_watcher_dies():
   # Linux delivers SIGTERM to the native caller if this watcher disappears.
   if libc.prctl(1,signal.SIGTERM,0,0,0)!=0 or os.getppid()!=watcher:os._exit(125)
  # Keep the original argv tail for the native supervisor and STOP identity.
  argv=['/usr/bin/python3','-I','-S','-c',guarded_entry,
        DEPLOY+'/scripts/release/unified-install/launch-fresh35-production-v2.py','--run-authorized-once']
  with (state/'launcher.private.log').open('xb') as log:
   child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
                          preexec_fn=stop_if_watcher_dies)
   while child.poll() is None:
    sample()
    time.sleep(.1)
  exit_code=child.wait()
 except Exception as error:
  code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
  def record_stop():
   try:new_json(stop,{'cid':cid,'reason':code,'automaticRetry':False,'transactionRollbackProven':False})
   except OSError:pass
  try:
   if child is not None and child.poll() is None:child.send_signal(signal.SIGTERM)
   # Neither file nor directory fsync may delay stopping the exact container.
   recorder=threading.Thread(target=record_stop,daemon=True);recorder.start()
   if child is not None:
    try:child.wait(timeout=32)
    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=3)
   recorder.join(timeout=1)
  finally:
   # The already verified timeout is PID 1 of this exact CID only.
   if init_identity is not None and real_process_matches(init_identity):os.kill(1,signal.SIGTERM)
  return 2
 new_file(state/'launcher-exit-code',f'{exit_code}\n'.encode())
 return exit_code

def first_capacity_launcher_command(identity,cid,job_id=None):
 from inspect import getsource
 constants={'PRODUCTION_STATE':PRODUCTION_STATE,'FIRST_WORK':FIRST_WORK,'FIRST_CAPACITY_STOP':FIRST_CAPACITY_STOP,
            'DEPLOY':DEPLOY,'FIRST_ADMISSION_FREE':FIRST_ADMISSION_FREE,'REAL_STOP_FLOOR':REAL_STOP_FLOOR,
            'FIRST_STATE_GID':FIRST_STATE_GID,'FIRST_STATE_MODE':FIRST_STATE_MODE}
 source='import json,os,re,stat,subprocess,time\nfrom pathlib import Path\n'
 source+='\n'.join(f'{k}={v!r}' for k,v in constants.items())+'\n'
 source+='\n'.join(getsource(f) for f in (need,trusted,real_mount,real_process_matches,syncdir,new_file,new_json,
                                          first_install_directory_profile,first_capacity_sample,first_capacity_paths,
                                          first_launch_with_capacity))
 guarded_entry='import hashlib,json,os,stat,sys,time\nfrom pathlib import Path\n'
 guarded_entry+=f'DEPLOY={DEPLOY!r}\nMANIFEST_SHA={MANIFEST_SHA!r}\n'
 guarded_entry+='\n'.join(getsource(f) for f in (need,sha,strict,trusted,read_file,
        before_r3_install_cutoff,require_r3_install_cutoff,guarded_r3_native_main))
 guarded_entry+=f'\nraise SystemExit(guarded_r3_native_main({job_id!r}))\n'
 source+=f'\nos.umask(0o077)\nraise SystemExit(first_launch_with_capacity({identity!r},{cid!r},{guarded_entry!r}))\n'
 return ['/usr/bin/python3','-I','-S','-c',source]

R3_JOB_KEYS={'materialize-app':{FIRST_BIND_JOB},
             'production-start':{'t45-first-r3-native-provision-20261110-01'},
             'production-entry':{'t45-first-r3-native-entry-20261110-01'},
             'production-facts':{'t45-first-r3-native-facts-described-20261110-01'},
             'production-install':{'t45-first-r3-native-install-20261110-01'},
             'production-recovery-stop':{'t45-first-20261110-r3-recovery-stop-20261110-01'}}

def load_production_plan(path,digest):
 b=read_file(job_input(path),65536,True);need(sha(b)==digest,'PLAN_HASH_DIFFERS');p=strict(b)
 need(set(p)==PLAN_KEYS|{'productionCarrier'} and p['enabled'] is True and isinstance(p['authorizationReference'],str) and 0<len(p['authorizationReference'])<=512,'EXPLICIT_PRODUCTION_PLAN_REQUIRED')
 need(p['operationId']==FIRST_OPERATION and p['opsSourceSha256']==sha(Path(__file__).read_bytes()) and p['stagingAuthoritySha256']==NATIVE_ORIGINAL_AUTH_SHA and type(p['imagePreparationExpiresAt']) is int,'EXACT_PRODUCTION_OPS_BINDING_REQUIRED')
 c=p['productionCarrier'];need(type(c) is dict and set(c)=={'format','front','futureAppName'} and c['format']=='FRESH35_PRODUCTION_CONTAINER_V2','CLOSED_PRODUCTION_CARRIER_REQUIRED')
 need(c['front']=={'id':FIRST_FRONT_ID,'name':FIRST_FRONT},'EXACT_EXISTING_FRONT_REQUIRED')
 need(c['futureAppName']==FIRST_ALIAS,'EXACT_FUTURE_APP_ALIAS_REQUIRED')
 need(ROOT.name==FIRST_WORK and NAME=='t45-'+FIRST_WORK,'INDEPENDENT_PRODUCTION_ROOT_AND_NAME_REQUIRED')
 return {**p,'rawPlanSha256':digest}

def materialize_r3(plan,path,digest):
 raw=read_file(job_input(path),65536,True);need(sha(raw)==digest,'R3_MATERIALIZATION_BYTES_DIFFERS')
 authority=strict(raw)
 fixed={'format':'T45_FIRST_R3_NATIVE_SOURCE_BINDING_V2','jobId':FIRST_BIND_JOB,
        'planSha256':plan['rawPlanSha256'],'targetRoot':str(ROOT),'sourceRoot':str(SOURCE_ROOT),
        'sourceSetSha256':SOURCE,'deploymentManifestSha256':MANIFEST_SHA,
        'baseSourceSetSha256':BASE_SOURCE,'baseDeploymentManifestSha256':BASE_MANIFEST_SHA}
 need(set(authority)==set(fixed)|{'startsAt','expiresAt','authorizationReference'}
      and all(authority[k]==v for k,v in fixed.items())
      and type(authority['authorizationReference']) is str and 0<len(authority['authorizationReference'])<=512,
      'R3_MATERIALIZATION_SCOPE_DIFFERS')
 starts,end=authority['startsAt'],authority['expiresAt']
 def window():
  need(type(starts) is type(end) is int and starts<=int(time.time()*1000)<end<=starts+300000,
       'R3_MATERIALIZATION_WINDOW_REQUIRED')
 def free(path):
  space=os.statvfs(path)
  return space.f_bavail*space.f_frsize
 window()
 parent=trusted(ROOT.parent).lstat();mount=real_mount(str(ROOT.parent))
 need(stat.S_ISDIR(parent.st_mode) and parent.st_dev==66304 and real_mount(str(SOURCE_ROOT/'state'))==mount,
      'FIRST_INSTALL_HOST_VOLUME_CHANGED')
 need(not os.path.lexists(ROOT),'R3_TARGET_ROOT_PRESENT_NO_REPLAY')
 need(not production_front(plan).get('Containers'),'FIRST_R3_FRONT_MUST_BE_EMPTY')
 names='^/('+NAME+'|'+NAME+'-recovery|'+FIRST_ALIAS+')$'
 need(not run(['docker','ps','-a','--filter','name='+names,'--format','{{.ID}}']).strip(),
      'PRODUCTION_NAME_EXISTS_OR_UNKNOWN_NO_REPLAY')
 image=environment_image()
 manifest=first_install_manifest(original_source_manifest())
 bundle=Path(os.environ['ERP_SHARED_JOB_DIR'])/'bundle'
 launchers={rel:first_native_launcher_bytes(bundle/Path(rel).name,rel) for rel in FIRST_NATIVE_DELTA}
 node=trusted(SOURCE_ROOT/'deploy/runtime/node/bin/node').lstat()
 need(stat.S_ISREG(node.st_mode) and node.st_dev==parent.st_dev and node.st_size==126595440
      and node.st_mode&stat.S_IXUSR,'EXACT_EXISTING_NODE_BIND_REQUIRED')
 initial=free(ROOT.parent)
 need(initial>=FIRST_ADMISSION_FREE+FIRST_STAGE_CAP,'FIRST_INSTALL_ADMISSION_SPACE_INSUFFICIENT')
 window()
 ROOT.mkdir(mode=0o700);syncdir(ROOT.parent)
 create_first_install_state(ROOT/'state')
 directories=(ROOT/'authority',ROOT/'native-launchers',ROOT/'state/capacity',ROOT/'state'/REAL_ROOT.name)
 for directory in directories:
  directory.mkdir(mode=0o700);syncdir(directory.parent)
 new_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',manifest,0o400)
 for rel,raw_leaf in launchers.items():
  new_file(first_native_launcher(rel),raw_leaf,0o400)
  first_native_launcher_bytes(first_native_launcher(rel),rel)
 new_file(ROOT/'state/capacity/owner-profile.json',b'',0o644)
 identity=first_install_root_identities(ROOT.lstat(),(ROOT/'state').lstat())
 need(real_mount(str(ROOT))==mount==real_mount(str(ROOT/'state')),'FIRST_INSTALL_HOST_VOLUME_CHANGED')
 # This fixed small tree contains no copy of the original deployment or data package.
 measured=sum(p.lstat().st_blocks*512 for p in (ROOT,*ROOT.rglob('*')))
 marker_budget=os.statvfs(ROOT).f_frsize
 need(measured+marker_budget<=FIRST_STAGE_CAP and free(ROOT)>=FIRST_ADMISSION_FREE+marker_budget,
      'FIRST_INSTALL_ADMISSION_SPACE_INSUFFICIENT')
 window()
 marker=ROOT/'prepare-started.json'
 new_json(marker,{'operationId':FIRST_OPERATION,'sourceSetSha256':SOURCE,
          'deploymentManifestSha256':MANIFEST_SHA,
          'planSha256':plan['rawPlanSha256'],'materializationSha256':digest,'identity':identity})
 measured+=marker.lstat().st_blocks*512
 available=free(ROOT)
 need(measured<=FIRST_STAGE_CAP and available>=FIRST_ADMISSION_FREE,'FIRST_INSTALL_ADMISSION_SPACE_INSUFFICIENT')
 return {'status':'FIRST_R3_READONLY_SOURCE_BOUND_NO_DB_WINDOW','identity':identity,'image':image['image'],
         'sourceSetSha256':SOURCE,'deploymentManifestSha256':MANIFEST_SHA,
         'materializationSha256':digest,
         'planSha256':plan['rawPlanSha256'],'allocatedTargetBytes':measured,'freeBeforeBytes':initial,
         'freeAfterBytes':available,'postgresStarted':False}

def production_factory():
 # Reuse the pinned original C14 validator and native receipt checker; no main,
 # no pyc, no second issuer or connection. Only two exact manifest leaves load.
 import types
 raw=read_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',2*1024*1024,True);need(sha(raw)==MANIFEST_SHA,'PRODUCTION_DEPLOYMENT_MANIFEST_DIFFERS');pins={x['path']:x['sha256'] for x in strict(raw)['files']}
 modules=[]
 for name in ['launch-fresh35-isolated-v1.py','launch-fresh35-production-v2.py']:
  rel='scripts/release/unified-install/'+name;path=first_native_launcher(rel)
  raw=first_native_launcher_bytes(path,rel);need(sha(raw)==pins.get(rel),'PRODUCTION_PYTHON_SOURCE_DIFFERS')
  m=types.ModuleType('fixed_'+name.replace('-','_'));m.__file__=str(path);exec(compile(raw,m.__file__,'exec'),m.__dict__);modules.append(m)
 modules[1].core=modules[0];return modules[1]

def production_authority(raw,starting=False):
 a=strict(raw);factory=production_factory();factory.validate_provision(a,int(time.time()*1000) if starting else a['startsAt']);assert_first_proposal(a)
 need(a['sourceSetSha256']==SOURCE and a['deploymentManifestSha256']==MANIFEST_SHA and a['postgresUid']==a['postgresGid']==61035,'EXACT_PRODUCTION_SOURCE_AND_EXISTING_UID_REQUIRED')
 return a,factory

def production_front(plan,exclude=None):
 c=plan['productionCarrier'];front=c['front'];v=strict(run(['docker','network','inspect','--format','{{json .}}',front['id']]))
 need(v['Id']==front['id'] and v['Name']==front['name'] and v['Driver']=='bridge' and v['Internal'] is True,'EXISTING_PRODUCTION_FRONT_CHANGED')
 for cid in v.get('Containers',{}):
  if cid==exclude:continue
  peer=strict(run(['docker','inspect','--format','{"name":{{json .Name}},"networks":{{json .NetworkSettings.Networks}}}',cid]))
  aliases=peer['networks'].get(front['name'],{}).get('Aliases') or [];alias=c['futureAppName'].lower()
  need(peer['name'].lower()!='/'+alias and alias not in [x.lower() for x in aliases],'PRODUCTION_FRONT_APP_ALIAS_CONFLICT')
 return v

REAL_ACCESS_CONSUMER_SHA='b269711605fff6031ae9b746d00452fbb0944d1022c4ad92e6f86f207ead2463'
def real_access_observation(description=None):
 base=REAL_ROOT if globals().get('_REAL_ACCESS_INSIDE') is True else ROOT/'state/real-first-20261109-r1'
 raw_root=REAL_ROOT/'package' if base==REAL_ROOT else SHARED_REAL_PACKAGE
 pointer=base/'nonroot-access-current.json'
 if not pointer.exists() and not pointer.is_symlink():return None
 ref=strict(read_file(pointer,65536,True));key=ref.get('requestKey')
 need(type(key) is str and re.fullmatch(r't45-first-20261109-r1-real-(prepare|execute|inspect)-[0-9]{8}-[0-9]{2}',key),'REAL_ACCESS_REFERENCE_KEY_REQUIRED')
 leaf=base/'nonroot-access'/key/'real_access_consumer.py';source=read_file(leaf,65536,True)
 need(sha(source)==REAL_ACCESS_CONSUMER_SHA or ref.get('phase')=='restored' and sha(source)=='b176281e11e25386e3d1ae24cb0063ad10ac94f0f1c84deeb519addf2a9d17f1','REAL_ACCESS_CONSUMER_SOURCE_CHANGED')
 import types
 m=types.ModuleType('fixed_access_consumer');m.__file__=str(leaf);exec(compile(source,str(leaf),'exec'),m.__dict__)
 expected=globals().get('_REAL_ACCESS_EXPECTED')
 return m.observe(base,raw_root,read_file,*(expected or (None,None)))

def shared_real_package_snapshot():
 root=trusted(SHARED_REAL_PACKAGE);s=root.lstat();need(stat.S_ISDIR(s.st_mode) and stat.S_IMODE(s.st_mode)==0o700,'FIXED_SHARED_PACKAGE_DIRECTORY_REQUIRED')
 manifest=read_file(root/'manifest.json',2*1024*1024,True);need(sha(manifest)==SHARED_REAL_MANIFEST,'FIXED_SHARED_PACKAGE_MANIFEST_DIFFERS')
 members=[]
 for p in sorted(root.rglob('*')):
  st=trusted(p).lstat()
  if stat.S_ISDIR(st.st_mode):need(stat.S_IMODE(st.st_mode)==0o700,'FIXED_SHARED_PACKAGE_DIRECTORY_REQUIRED');continue
  need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o400,'FIXED_SHARED_PACKAGE_MEMBER_REQUIRED')
  members.append({'path':str(p.relative_to(root)),'device':st.st_dev,'inode':st.st_ino,'bytes':st.st_size,'mtimeNs':st.st_mtime_ns,'ctimeNs':st.st_ctime_ns})
 need(len(members)==31 and sum(v['bytes'] for v in members)==1008361447,'FIXED_SHARED_PACKAGE_METADATA_DIFFERS')
 return {'format':'FRESH35_FIXED_SHARED_REAL_PACKAGE_V1','sourcePath':str(SHARED_REAL_PACKAGE),'consumerSourceSetSha256':SOURCE,'manifestSha256':SHARED_REAL_MANIFEST,'directory':{'device':s.st_dev,'inode':s.st_ino},'members':members}

def shared_real_package_binding():
 raw=read_file(SOURCE_ROOT/'state/shared-real-package-binding.json',65536,True)
 need(sha(raw)==SHARED_REAL_BINDING_SHA and strict(raw)==shared_real_package_snapshot(),
      'FIXED_SHARED_PACKAGE_BINDING_CHANGED')
 return SHARED_REAL_PACKAGE

def production_common(image,remaining,plan,a,*,name=NAME,service_expires_at=None):
 # The installation and service lifetimes stay separate. The existing caller
 # stops PG at the service deadline; 30s is its existing cleanup wait only.
 args=common(image,remaining,plan['operationId'],cpus=3,memory_gib=7);pos=args.index('--network');args[pos+1]=plan['productionCarrier']['front']['id'];args[pos+2:pos+2]=['--network-alias',plan['productionCarrier']['futureAppName']]
 old='type=bind,src='+str(ROOT/'state')+',dst='+STATE;need(args.count(old)==1,'ORIGINAL_STATE_MOUNT_REQUIRED');args[args.index(old)]=old.replace('dst='+STATE,'dst='+PRODUCTION_STATE)
 args[args.index('--name')+1]=name
 lease=a['serviceLease']['expiresAt'] if service_expires_at is None else service_expires_at
 args[2:2]=['--label','t45.production-service-expires-at='+str(lease)]
 pos=args.index('--entrypoint')
 for rel in FIRST_NATIVE_DELTA:
  pair=mount([],first_native_launcher(rel),DEPLOY+'/'+rel,ro=True)
  args[pos:pos]=pair
  pos+=len(pair)
 return args

def production_info(cid):
 v=inspect(cid);extra=strict(run(['docker','inspect','--format','{"id":{{json .Id}},"pid":{{json .State.Pid}},"startedAt":{{json .State.StartedAt}},"networks":{{json .NetworkSettings.Networks}}}',cid]))
 need(v['id']==extra['id'] and v['pid']==extra['pid'],'PRODUCTION_CARRIER_CHANGED_DURING_READ');v.update(extra);return v

def owned_production(info,receipt,plan,capacity_stopped=False,*,name=NAME):
 c=plan['productionCarrier'];front=c['front']
 need(info['id']==receipt['cid'] and info['image']==receipt['image']==ENV_IMAGE and info['name']=='/'+name and info['labels'].get('t45.operation')==plan['operationId'] and info['labels'].get('t45.source')==SOURCE and info['labels'].get('t45.production-service-expires-at')==str(receipt['expiresAt']),'PRODUCTION_CARRIER_OWNERSHIP_DIFFERS')
 need(info['network'] in [front['id'],front['name']] and not info['ports'] and info['user']=='0:0' and info['readonly'] and info['pidMode']=='' and info['ipcMode']!='host' and info['usernsMode'] in ['', 'private'],'PRODUCTION_CARRIER_ISOLATION_DIFFERS')
 need(info['memory']==info['swap']==PRODUCTION_MEMORY and info['cpu']==PRODUCTION_CPU and info['pids']==256,'CONTAINER_BUDGET_DIFFERS')
 expected={DEPLOY:(str(SOURCE_ROOT/'deploy'),False),'/etc/naijue-erp':(str(ROOT/'authority'),True),PRODUCTION_STATE:(str(ROOT/'state'),True),'/usr/local/bin/node':(str(SOURCE_ROOT/'deploy/runtime/node/bin/node'),False),CAPACITY_PROFILE:(str(ROOT/'state/capacity/owner-profile.json'),False)}
 expected.update({DEPLOY+'/'+rel:(str(first_native_launcher(rel)),False) for rel in FIRST_NATIVE_DELTA})
 binds={x['Destination']:(x['Source'],x['RW']) for x in info['mounts'] if x['Type']=='bind'};need(binds==expected and all(x['Type'] in ['bind','tmpfs'] for x in info['mounts']),'EXACT_PRODUCTION_MOUNTS_REQUIRED')
 need({x.removeprefix('CAP_') for x in info['caps']}=={'CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'} and info['capDrop']==['ALL'] and bool(info['security']) and set(info['security'])<={'no-new-privileges','no-new-privileges=true'},'CONTAINER_POLICY_DIFFERS')
 need(not info['privileged'] and not info['devices'] and info['restart']=='no' and info['shm']==64*1024**2 and info['tmpfs']=={'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'CONTAINER_EXTRAS_DIFFERS')
 if info['running'] or not capacity_stopped:
  endpoint=info['networks'].get(front['name'],{});need(endpoint.get('NetworkID')==front['id'] and c['futureAppName'] in (endpoint.get('Aliases') or []) and re.fullmatch('[a-f0-9]{64}',endpoint.get('EndpointID','')),'PRODUCTION_FRONT_ENDPOINT_REQUIRED')

def production_process_namespace(pid):
 root=Path('/proc')/str(pid);ticks=(root/'stat').read_text().rsplit(')',1)[1].split()[19];ns=(root/'ns/net').stat()
 need((root/'stat').read_text().rsplit(')',1)[1].split()[19]==ticks,'PRODUCTION_CARRIER_PROCESS_CHANGED')
 return {'startTicks':ticks,'networkNamespace':{'device':ns.st_dev,'inode':ns.st_ino}}

def recover_production_carrier(plan):
 if (ROOT/'production-container-receipt.json').exists():return
 intent=strict(read_file(ROOT/'production-start-intent.json',65536,True));need(intent['operationId']==plan['operationId'] and intent['sourceSetSha256']==SOURCE and intent['productionCarrier']==plan['productionCarrier'],'PRODUCTION_ORIGINAL_INTENT_CHANGED')
 info=production_info(NAME);receipt={'cid':info['id'],'image':intent['image'],'expiresAt':intent['serviceLeaseExpiresAt'],'operationId':plan['operationId']};owned_production(info,receipt,plan);new_json(ROOT/'production-container-receipt.json',receipt)

def production_facts(plan):
 original=strict(read_file(ROOT/'production-container-receipt.json',65536,True))
 recovery_boot=ROOT/'state'/REAL_ROOT.name/RECOVERY_BOOT.name
 recovered=os.path.lexists(recovery_boot)
 receipt=strict(read_file(recovery_boot/'container-receipt.json',65536,True)) if recovered else original
 name=RECOVERY_NAME if recovered else NAME
 info=production_info(receipt['cid'])
 capacity_stop=ROOT/'state'/FIRST_CAPACITY_STOP
 stopped=None
 if os.path.lexists(capacity_stop):
  stopped=strict(read_file(capacity_stop,65536,True));need(stopped['cid']==info['id'],'FIRST_INSTALL_CAPACITY_CID_DIFFERS')
 need(not recovered or stopped is None,'REAL_RECOVERY_CAPACITY_STOP_PRESENT')
 owned_production(info,receipt,plan,capacity_stopped=stopped is not None,name=name)
 raw=read_file(ROOT/'authority/fresh35-production-provision-v2.json',65536,True);intent=strict(read_file(ROOT/'production-start-intent.json',65536,True));need(sha(raw)==intent['externalAuthoritySha256'] and intent['operationId']==plan['operationId'] and intent['productionCarrier']==plan['productionCarrier'] and intent['sourceSetSha256']==SOURCE,'PRODUCTION_AUTHORITY_OR_INTENT_CHANGED');a,factory=production_authority(raw);work=ROOT/'state'/Path(a['proposal']['workspaceDirectory']).name
 need(original['expiresAt']==a['serviceLease']['expiresAt'],'PRODUCTION_CARRIER_LEASE_DIFFERS')
 out={'status':'PRODUCTION_CARRIER_ORIGINAL_KEY_FACTS_ONLY','cid':info['id'],'running':info['running'],'creationFacts':None,'sharedPostgresNamespace':None,'businessVerified':False,'hostEnabled':False,'automaticRetry':False}
 if stopped is not None:
  out['capacityStop']=stopped
  if (work/'cleanup.json').is_file():
   clean=strict(read_file(work/'cleanup.json',65536,True))
   out['capacityStopCleanup']={k:clean.get(k) for k in ('ownedPidAbsent','portAbsent','cleanShutdown','dataPreserved','cleanupComplete')}
  return out
 if not info['running'] or info['pid']<=1:return out
 front=production_front(plan,info['id']);ep=info['networks'][plan['productionCarrier']['front']['name']]
 need(front['Containers'][info['id']]['EndpointID']==ep['EndpointID'],'PRODUCTION_ENDPOINT_CHANGED')
 birth=production_process_namespace(info['pid']);out['carrier']={'id':info['id'],'name':name,'imageId':info['image'],'startedAt':info['startedAt'],'hostPid':info['pid'],**birth,'frontEndpoint':{'id':ep['EndpointID'],'aliases':ep['Aliases']}}
 if (work/'creation-facts.json').exists():
  facts=strict(read_file(work/'creation-facts.json',1048576,True));need(facts['state']=='NEW_EMPTY_PRODUCTION_TARGET_FACTS_ONLY' and facts['sourceSetSha256']==SOURCE and facts['target']['proposal']==a['proposal'] and facts['serviceLease']==a['serviceLease'],'ACTUAL_PRODUCTION_CREATION_FACTS_DIFFER');out['creationFacts']=facts
 else:return out
 if (work/'program-description.json').is_file():
  program=strict(read_file(work/'program-description.json',1048576,True));actual=strict(read_file(work/'target-binding.json',1048576,True))
  need(actual==facts['target'] and program.get('sourceSetSha256')==SOURCE,'PRODUCTION_PROGRAM_TARGET_DIFFERS')
  out['programBinding']={k:program[k] for k in ['programSha256','sourceSetSha256','targetSha256','catalogSha256']}
  need(all(isinstance(v,str) and re.fullmatch('[a-f0-9]{64}',v) for v in out['programBinding'].values()),'PRODUCTION_PROGRAM_PINS_REQUIRED')
 if not (work/'service-retained.json').exists():return out
 target=strict(read_file(work/'target-binding.json',1048576,True));descriptor=strict(read_file(work/'program-description.json',1048576,True));result=strict(read_file(work/'installation-result.json',65536,True));recordraw=read_file(ROOT/'authority/fresh35-combined-installation-v1.json',1048576)
 factory.assert_retention(a,target,descriptor,result,recordraw);retained=strict(read_file(work/'service-retained.json',1048576,True))
 need(retained=={'state':'DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE','recordSha256':result['recordSha256'],'sourceSetSha256':SOURCE,'target':target,'serviceLease':a['serviceLease'],'hostEnabled':False,'businessVerified':False}
      and (recovered or time.time()*1000<a['serviceLease']['expiresAt']),'PRODUCTION_SERVICE_NOT_DURABLY_RETAINED')
 generation=None
 if recovered:
  generation=read_recovery_generation(recovery_boot,work,a,recordraw,descriptor['targetSha256'])
  proof=generation['proof'];old=production_info(original['cid']);owned_production(old,original,plan,capacity_stopped=True)
  need(not old['running'] and old['pid']==0 and proof['oldCarrier']['id']==old['id']
       and proof['oldCarrier']['startedAt']==old['startedAt'] and set(front['Containers'])=={info['id']}
       and proof['newCarrier']=={'id':info['id'],'startedAt':info['startedAt'],'hostPid':info['pid'],**birth}
       and info['labels'].get('t45.same-data-recovery-key')==proof['requestKey']
       and receipt['expiresAt']==proof['serviceLeaseExpiresAt'],'REAL_RECOVERY_LIVE_CARRIER_DIFFERS')
  out['currentRecovery']={'receiptSha256':sha(generation['raw']),'requestKey':proof['requestKey'],
                          'currentPostmasterStart':proof['newPhysical']['postmasterStart']}
 # Verify the same PG process from inside its own PID namespace; metadata only.
 inside_boot=RECOVERY_BOOT if recovered else RETAINED_BOOT
 code="import os,json;from pathlib import Path;p=Path("+repr(a['proposal']['workspaceDirectory'])+");b=Path("+repr(str(inside_boot))+");v=json.loads(((b if "+repr(recovered)+" or (b/'observed-epoch.json').exists() else p)/'owned-process.json').read_bytes());q=Path('/proc')/str(v['pid']);assert q.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]==v['starttime'] and os.readlink(q/'exe')==v['exe'];print(json.dumps(v))"
 out['pgProcess']=strict(run(['docker','exec','--user','0:0',info['id'],'/usr/bin/python3','-I','-S','-c',code],seconds=5))
 data=trusted(work/'data',root=False).lstat()
 need(stat.S_ISDIR(data.st_mode) and data.st_uid==data.st_gid==61035 and stat.S_IMODE(data.st_mode)==0o700,
      'FIRST_PRODUCTION_PGDATA_IDENTITY_DIFFERS')
 out['dataDirectoryIdentity']={'device':data.st_dev,'inode':data.st_ino,'uid':data.st_uid,'gid':data.st_gid,
                               'mode':stat.S_IMODE(data.st_mode)}
 if generation is not None:
  need(out['pgProcess']==generation['postmaster'] and out['dataDirectoryIdentity']==generation['proof']['dataDirectoryAfter'],
       'REAL_RECOVERY_LIVE_DATA_OR_POSTMASTER_DIFFERS')
 latest=production_info(info['id']);owned_production(latest,receipt,plan,name=name);need(latest['running'] and latest['pid']==info['pid'] and latest['startedAt']==info['startedAt'] and production_process_namespace(info['pid'])==birth,'PRODUCTION_CARRIER_BIRTH_CHANGED')
 out['sharedPostgresNamespace']={'format':'OWNED_POSTGRES_SHARED_NAMESPACE_V1','container':out['carrier'],'creationOperationId':plan['operationId'],'sourceSetSha256':SOURCE,'targetSha256':descriptor['targetSha256'],'installationRecordSha256':sha(recordraw),'serviceLeaseExpiresAt':receipt['expiresAt']}
 out['status']='DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL';return out

def describe_r3(plan):
 provision=strict(read_file(ROOT/'authority/fresh35-production-provision-v2.json',65536,True))
 work=ROOT/'state'/FIRST_WORK
 cutoff=min(time.monotonic()+60,time.monotonic()+max(0,provision['expiresAt']//1000-330-time.time()))
 while not os.path.lexists(work/'program-description.json'):
  need(time.monotonic()<cutoff and not any(os.path.lexists(p) for p in
       (work/'caller-failure.json',ROOT/'state/launcher-exit-code',ROOT/'state'/FIRST_CAPACITY_STOP)),
       'R3_DESCRIPTION_UNCONFIRMED_OR_HANDOFF_RESERVE_NO_REPLAY')
  time.sleep(.25)
 facts=production_facts(plan)
 need(facts['running'] and facts.get('programBinding') is not None
      and time.time()*1000<provision['expiresAt']//1000*1000-330000,
      'R3_DESCRIPTION_UNCONFIRMED_OR_HANDOFF_RESERVE_NO_REPLAY')
 return facts

def publish_r3_install_authority(destination,raw,provision):
 import ctypes
 require_r3_install_cutoff(provision)
 rename=ctypes.CDLL(None,use_errno=True).renameat2
 rename.argtypes=(ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint)
 rename.restype=ctypes.c_int
 staged=destination.with_name('.'+destination.name+'.pending')
 source_name,target_name=os.fsencode(staged),os.fsencode(destination)
 new_file(staged,raw,0o600)
 try:
  # fsync and validation precede this boundary. RENAME_NOREPLACE publishes
  # complete bytes with one link, or leaves an existing decision untouched.
  need(not os.path.lexists(ROOT/'state'/FIRST_CAPACITY_STOP),'FIRST_INSTALL_CAPACITY_STOP_NO_REPLAY')
  require_r3_install_cutoff(provision)
  if rename(-100,source_name,-100,target_name,1)!=0:
   errno=ctypes.get_errno()
   raise OSError(errno,os.strerror(errno),str(destination))
  # Keep a potentially published inode as original-key evidence on ambiguity.
  published_in_window=before_r3_install_cutoff(provision)
  syncdir(destination.parent)
  need(published_in_window,'R3_INSTALL_PUBLICATION_OUTCOME_UNKNOWN_NO_REPLAY')
 finally:
  if staged.exists():
   staged.unlink()
   syncdir(staged.parent)

def production_delivery(plan,path,digest,phase):
 need(phase in ['production-entry','production-install'],'FIXED_PRODUCTION_DELIVERY_REQUIRED')
 facts=production_facts(plan);need(facts['running'] and facts['creationFacts'] is not None
      and 'currentRecovery' not in facts,'ORIGINAL_LIVE_PRODUCTION_CARRIER_REQUIRED')
 provision=read_file(ROOT/'authority/fresh35-production-provision-v2.json',65536,True);a,factory=production_authority(provision,starting=True)
 need(int(time.time()*1000)<a['expiresAt']-60000,'ORIGINAL_PRODUCTION_WINDOW_TOO_SHORT')
 raw=read_file(job_input(path),65536,True);need(sha(raw)==digest,'EXTERNAL_PRODUCTION_DELIVERY_HASH_DIFFERS');approval=strict(raw)
 if phase=='production-entry':
  factory.validate_entry(a,facts['creationFacts']['target'],approval);destination=ROOT/'authority/fresh35-production-entry-v2.json'
 else:
  require_r3_install_cutoff(a)
  work=ROOT/'state'/Path(a['proposal']['workspaceDirectory']).name
  program=strict(read_file(work/'program-description.json',1048576,True));factory.validate_install(a,program,approval);destination=ROOT/'authority/fresh35-combined-execution-v1.json'
 # Both actual V2 consumers use protected(path), whose exact default is 0600.
 first_host_install_volume(admission=False,plan=plan)
 need(not os.path.lexists(ROOT/'state'/FIRST_CAPACITY_STOP),'FIRST_INSTALL_CAPACITY_STOP_NO_REPLAY')
 if phase=='production-install':publish_r3_install_authority(destination,raw,a)
 else:new_file(destination,raw,0o600)
 need(factory.protected(destination)==raw,'PRODUCTION_DELIVERY_READBACK_DIFFERS')
 s=destination.lstat();need(s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,'PRODUCTION_DELIVERY_METADATA_DIFFERS')
 return {'status':'EXTERNAL_PRODUCTION_APPROVAL_COPIED_ONCE','phase':phase,'sha256':digest,'bytes':len(raw),'ownerUid':s.st_uid,'mode':'0600','consumerReadbackMatched':True,'cid':facts['cid'],'approvalCreated':False,'automaticRetry':False,'formalBusinessAcceptance':False}

def production_start(plan,path,digest):
 image=environment_image();verify_materialized_application(plan);raw=read_file(job_input(path),65536,True);need(sha(raw)==digest,'EXTERNAL_PRODUCTION_AUTHORITY_DIFFERS');a,_=production_authority(raw,starting=True)
 before=production_front(plan);need(not before.get('Containers'),'FIRST_R3_FRONT_MUST_BE_EMPTY');need(not run(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}']).strip(),'PRODUCTION_NAME_EXISTS_OR_UNKNOWN_NO_REPLAY')
 for filename in ['production-start-intent.json','production-container-receipt.json','authority/fresh35-production-provision-v2.json',
                  'state/launcher-exit-code','state/'+FIRST_CAPACITY_STOP,'state/'+FIRST_WORK]:
  need(not (ROOT/filename).exists() and not (ROOT/filename).is_symlink(),'PRODUCTION_ALREADY_SUBMITTED_OR_UNKNOWN_NO_REPLAY')
 first_host_capacity()
 remaining=(a['serviceLease']['expiresAt']-int(time.time()*1000)+999)//1000+30
 command=production_common(image['image'],remaining,plan,a)
 identity=first_host_install_volume(admission=True,plan=plan)
 new_file(ROOT/'authority/fresh35-production-provision-v2.json',raw,0o600)
 new_json(ROOT/'production-start-intent.json',{'operationId':plan['operationId'],'sourceSetSha256':SOURCE,'image':image['image'],'serviceLeaseExpiresAt':a['serviceLease']['expiresAt'],'productionCarrier':plan['productionCarrier'],'externalAuthoritySha256':digest})
 cid=run(command).decode().strip();need(re.fullmatch('[a-f0-9]{64}',cid),'ACTUAL_PRODUCTION_CID_REQUIRED')
 receipt={'cid':cid,'image':image['image'],'expiresAt':a['serviceLease']['expiresAt'],'operationId':plan['operationId']};new_json(ROOT/'production-container-receipt.json',receipt);owned_production(production_info(cid),receipt,plan)
 after=production_front(plan,cid);need({k:v for k,v in after['Containers'].items() if k!=cid}==before.get('Containers',{}),'PREEXISTING_FRONT_ENDPOINTS_CHANGED')
 run(['docker','exec','--detach','--user','0:0',cid,*first_capacity_launcher_command(identity,cid,Path(os.environ['ERP_SHARED_JOB_DIR']).name)])
 work=ROOT/'state'/Path(a['proposal']['workspaceDirectory']).name
 while int(time.time()*1000)<a['expiresAt']-90000:
  if os.path.lexists(ROOT/'state'/FIRST_CAPACITY_STOP):break
  if (work/'creation-facts.json').exists():return production_facts(plan)
  if (work/'caller-failure.json').exists() or (ROOT/'state/launcher-exit-code').exists() or not inspect(cid)['running']:break
  time.sleep(.25)
 raise ValueError('PRODUCTION_FACTS_NOT_CONFIRMED_OR_WINDOW_SHORT_NO_REPLAY')

# This is an ops-only successor. The original application, V2 controller,
# guardian, transaction, independent REAL authority and first window are intact.
REAL_ROOT=Path(PRODUCTION_STATE)/'real-first-20261110-r3'
RETAINED_BOOT=REAL_ROOT/'retained-restart'
RETAINED_ENTRY=REAL_ROOT/'retained-restart.py'
RECOVERY_BOOT=REAL_ROOT/'same-data-restart'
RECOVERY_NAME=NAME+'-recovery'
RECOVERY_RECEIPT=RECOVERY_BOOT/'restart-receipt.json'
RETAINED_LIFECYCLE_SHA='5cc39079994236401bdbb98fe628d7feebdc594bd8c946b917c951b323739fc7'

def load_retained_lifecycle():
 import types
 leaf=Path(os.environ['ERP_SHARED_JOB_DIR'])/'bundle/retained_lifecycle.py'
 source=read_file(leaf,65536,True)
 need(sha(source)==RETAINED_LIFECYCLE_SHA,'FIRST_RETAINED_LIFECYCLE_SOURCE_DIFFERS')
 lifecycle=types.ModuleType('first_retained_lifecycle')
 lifecycle.__file__=str(leaf)
 exec(compile(source,str(leaf),'exec'),lifecycle.__dict__)
 return lifecycle

def production_retained_phase(plan,path,digest,phase):
 return load_retained_lifecycle().run_host(sys.modules[__name__],plan,path,digest,phase)

SAME_DATA_RECOVERY_SHA='38fc5efb67a01387a99f00380bdae12fa3587066808ba7a9844354a029d5e5b5'

def production_recovery_phase(plan,path,digest,phase):
 import types
 leaf=Path(os.environ['ERP_SHARED_JOB_DIR'])/'bundle/same_data_recovery.py'
 source=read_file(leaf,65536,True)
 need(sha(source)==SAME_DATA_RECOVERY_SHA,'FIRST_RECOVERY_SOURCE_DIFFERS')
 recovery=types.ModuleType('fixed_same_data_recovery');recovery.__file__=str(leaf)
 exec(compile(source,str(leaf),'exec'),recovery.__dict__)
 return recovery.run_host(sys.modules[__name__],load_retained_lifecycle(),plan,path,digest,phase)


def read_recovery_generation(boot, work, authority, record_raw, target_sha):
 from datetime import datetime
 def protected(name):
  return read_file(boot/name,65536,True)
 need(not any(os.path.lexists(boot/name) for name in ('cleanup.json','caller-result.json'))
      and not os.path.lexists(boot.parent/'same-data-custody/credential-cleanup.json'),
      'REAL_RECOVERY_GENERATION_CLOSED')
 raw=protected('restart-receipt.json');proof=strict(raw)
 observed=strict(protected('observed-epoch.json'));postmaster=strict(protected('owned-process.json'))
 need(observed=={'receiptSha256':sha(raw),'process':postmaster},'REAL_RECOVERY_OBSERVED_EPOCH_DIFFERS')
 decision_raw=protected('restart-authorization.json');decision=strict(decision_raw)
 intent=strict(protected('launch-intent.json'))
 need(intent=={'requestKey':proof['requestKey'],'authoritySha256':sha(decision_raw),'name':RECOVERY_NAME}
      and re.fullmatch(r't45-first-20261110-r3-recovery-restart-[0-9]{8}-[0-9]{2}',proof['requestKey'])
      and decision['format']=='T45_FIRST_R3_SAME_DATA_RESTART_V1'
      and decision['decision']=='RESTART_EXACT_FIRST_R3_SAME_DATA_AFTER_OLD_LEASE',
      'REAL_RECOVERY_RESTART_AUTHORITY_DIFFERS')
 stop_raw=read_file(boot.parent/'retained-stop/stop-receipt.json',65536,True);stop=strict(stop_raw)
 service=read_file(work/'service-retained.json',1048576,True)
 old=strict(record_raw)['target']['physical'];current=proof['newPhysical']
 identity=decision['dataDirectoryIdentity'];window=decision['recoveryWindow']
 role_fields=('adminLoginValidUntil','controllerLoginValidUntil','runtimeLoginValidUntil')
 shared=('requestKey','oldStopRequestKey','previousStopReceiptSha256','oldServiceReceiptSha256',
         'oldServiceLeaseExpiresAt','authorizationReference','installationRecordSha256','targetSha256',
         'dataDirectory','startsAt','expiresAt')
 need(proof=={'format':'FRESH35_SAME_DATA_RESTART_OBSERVATION_V2',
              'state':'SAME_DATA_RESTART_OBSERVED_NOT_BUSINESS_VERIFIED',
              **{k:decision[k] for k in shared},'sourceSetSha256':SOURCE,
              'restartAuthorizationSha256':sha(decision_raw),'oldCarrier':stop['carrierBirth'],
              'newCarrier':proof['newCarrier'],'oldPhysical':old,'newPhysical':current,
              'dataDirectoryBefore':identity,'dataDirectoryAfter':identity,'checkedAt':proof['checkedAt'],
              **{k:window[k] for k in ('serviceLeaseExpiresAt','guardianExpiresAt','retentionExpiresAt')},
              **dict.fromkeys(role_fields,decision['roleLoginValidUntil'])}
      and proof['previousStopReceiptSha256']==sha(stop_raw) and proof['oldStopRequestKey']==stop['requestKey']
      and all(stop.get(k) is True for k in ('cleanShutdown','cleanupComplete','dataPreserved','ownedPidAbsent','portAbsent'))
      and decision['containerId']==proof['oldCarrier']['id']!=proof['newCarrier']['id']
      and proof['oldServiceReceiptSha256']==stop['serviceReceiptSha256']==sha(service)
      and proof['oldServiceLeaseExpiresAt']==authority['serviceLease']['expiresAt']
      and proof['installationRecordSha256']==sha(record_raw) and proof['targetSha256']==target_sha
      and proof['dataDirectory']==authority['proposal']['workspaceDirectory']+'/data',
      'REAL_RECOVERY_ORIGINAL_PROVENANCE_DIFFERS')
 def instant(value):
  canonical=value+':00' if value.endswith('+00') else value
  return int(datetime.fromisoformat(canonical).timestamp()*1000)
 now=time.time_ns()//1000000
 lease=proof['serviceLeaseExpiresAt']
 need(set(current)==set(old) and all(current[k]==old[k] for k in old if k!='postmasterStart')
      and instant(old['postmasterStart'])<instant(current['postmasterStart'])
      and proof['oldServiceLeaseExpiresAt']<proof['startsAt']<=instant(current['postmasterStart'])<=proof['checkedAt']<=now
      and proof['checkedAt']<proof['expiresAt']<=min(proof['startsAt']+300000,proof['oldServiceLeaseExpiresAt']+1800000)
      and proof['expiresAt']<lease<=proof['guardianExpiresAt']-30000<proof['retentionExpiresAt']
      and now<lease==instant(decision['roleLoginValidUntil']),
      'REAL_RECOVERY_EPOCH_OR_LEASE_DIFFERS')
 return {'raw':raw,'proof':proof,'postmaster':postmaster}

def first_restart_intent(work, restart, authorization):
 boot=RETAINED_BOOT
 decision_raw=read_file(boot/'restart-authorization.json',65536,True)
 stop_raw=read_file(boot/'previous-stop-receipt.json',65536,True)
 need(sha(decision_raw)==restart['restartAuthorizationSha256']
      and sha(stop_raw)==restart['previousStopReceiptSha256'],
      'REAL_RESTART_ORIGINAL_BINDING_DIFFERS')
 decision=strict(decision_raw);stop=strict(stop_raw)
 intent=strict(read_file(boot/'intent.json',65536,True))
 need(re.fullmatch(r't45-first-20261109-r1-retained-restart-[0-9]{8}-[0-9]{2}',decision['requestKey'])
      and intent['requestKey']==decision['requestKey']
      and intent['guardianExpiresAt']==decision['guardianExpiresAt']
      and intent['authorizationReference']==decision['authorizationReference']==authorization
      and decision['installationRecordSha256']==restart['installationRecordSha256']
      and decision['previousStopReceiptSha256']==restart['previousStopReceiptSha256']
      and decision['dataDirectory']==restart['dataDirectory']==str(work/'data')
      and all(stop.get(k) is True for k in
              ('cleanShutdown','cleanupComplete','dataPreserved','ownedPidAbsent','portAbsent')),
      'REAL_RESTART_ORIGINAL_BINDING_DIFFERS')
 return intent
REAL_MANIFEST='1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9'
REAL_ADMIN_SHA='fdadbc3062ff6e7bf4c7c8741e796a40b7a44968538cdd08614e6ba138fdf23f'
REAL_STOP_FLOOR=6*1024**3
REAL_START_MINIMUM=8207515646
REAL_VOLUME_NAMES={'data','wal','reportIndex','tmp','sqliteScratch'}
REAL_APPROVALS={'historical-hall-approval','current-effective-alignment','explicit-zero-approval','staff-hall-approval','historical-settlement-retention-approval','historical-line-amount-evidence'}
REAL_APPROVAL_FILENAMES={'historical-hall-approval':'historical-hall-approval.UNTRUSTED.DRAFT.private.json','current-effective-alignment':'current-effective-alignment.UNTRUSTED.DRAFT.json','explicit-zero-approval':'zero-approval-candidate.private.jsonl','staff-hall-approval':'staff-null-hall-approval.candidate.private.json','historical-settlement-retention-approval':'historical-settlement-retention.UNTRUSTED.DRAFT.private.json','historical-line-amount-evidence':'historical-line-amount-evidence.candidate.json'}

D3_SIDECAR='d3-exact35-first-production-readback.r4.private.mjs'
D3_READBACK_JS=r'''
const d3Mode=true;
async function loadD3(v){
 const {createHash}=await import('node:crypto');
 const {readFile}=await import('node:fs/promises');
 const {pathToFileURL}=await import('node:url');
 const {registerHooks}=await import('node:module');
 const source=await readFile(v.sidecar);
 const digest=createHash('sha256').update(source).digest('hex');
 if(digest!=='e5d3f400119418f02c4a23661bc896e7640cfaa816a33fd60daf59446fd011e3')throw Error('D3_SIDECAR_DIFFERS');
 // Keep the file URL for D3's fixed siblings and execute only the hashed bytes.
 const sidecarUrl=pathToFileURL(v.sidecar).href;
 const hooks=registerHooks({
  resolve(specifier,context,nextResolve){
   if(specifier===sidecarUrl&&context.parentURL===import.meta.url)return {url:sidecarUrl,shortCircuit:true};
   return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
   if(url===sidecarUrl)return {format:'module',source,shortCircuit:true};
   return nextLoad(url,context);
  }
 });
 let sidecar;
 try{sidecar=await import(sidecarUrl)}finally{hooks.deregister()}
 const {bindFirstProductionReadback,readFirstProductionR1}=sidecar;
 const receipts=v.receipts;
 for(const key of ['recordBytes','restartBytes','prepareParametersBytes','parametersBytes','approvalBytes'])
  receipts[key]=Buffer.from(receipts[key],'base64');
 for(const key of ['prepareJob','writerJob'])receipts[key].stdoutBytes=Buffer.from(receipts[key].stdoutBytes,'base64');
 bindFirstProductionReadback(receipts);
 return async (runtimeRoot,ownedPool,admission35)=>{
  const {state}=await readFirstProductionR1({runtimeRoot,toolRoot:v.toolRoot,ownedPool,admission35,receipts});
  if(state!=='SOURCE_PROJECTION_MATCHED')throw Error('D3_RESULT_NOT_CONFIRMED');
  return {state};
 };
}
'''

# The original status mode still only reads the eight fixed C7 identifiers.
READONLY_STATUS_JS=r'''
const STATUS_SQL=`
WITH root_receipt AS (
 SELECT r.id
 FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE r.id=$3::uuid AND r.request_key=$4::text AND r.target_id=$1::uuid
 AND r.target_type='IMPORT' AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN' AND r.status='COMMITTED'
 AND a.actor_account_id=r.actor_account_id AND a.action=r.action AND a.object_type='IMPORT' AND a.object_id=r.target_id
 AND a.after_values->'whole_package_v2'->>'root_operation'=$3::text
 AND a.after_values->'request'->>'operation_id'=$3::text AND a.after_values->'request'->>'request_key'=$4::text
 AND a.after_values->'request'->>'batch_id'=$1::text AND a.after_values->'request'->>'package_manifest_sha256'=$5::text
 AND a.after_values->'request'->>'plan_sha256'=$6::text AND a.after_values->'request'->>'namespace'=$7::text
 AND (a.after_values->'request'->>'cutoff_at')::timestamptz=$8::timestamptz
 AND a.after_values->'request'->'payload'->>'document_batch_id'=$2::text
 AND a.after_values->'request'->'payload'->'admin'->>'account_id'=r.actor_account_id::text
 AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'phase'='INITIALIZE'
 AND r.result_data->>'planSha256'=$6::text AND r.result_data->>'packageManifestSha256'=$5::text
 AND r.result_data->>'baselineBatchId'=$1::text AND r.result_data->>'documentBatchId'=$2::text
), published AS (
 SELECT r.target_id,r.result_data->>'phase' AS phase
 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
 WHERE a.object_type='IMPORT' AND a.object_id IN ($1::uuid,$2::uuid)
 AND r.target_type='IMPORT' AND r.target_id=a.object_id AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
 AND a.actor_account_id=r.actor_account_id AND a.action=r.action
 AND a.after_values->'whole_package_v2'->>'root_operation'=$3::text
 AND a.after_values->'request'->>'operation_id'=r.id::text AND a.after_values->'request'->>'request_key'=r.request_key
 AND a.after_values->'request'->>'batch_id'=r.target_id::text
 AND a.after_values->'request'->>'package_manifest_sha256'=$5::text AND a.after_values->'request'->>'plan_sha256'=$6::text
 AND a.after_values->'request'->>'namespace'=$7::text AND (a.after_values->'request'->>'cutoff_at')::timestamptz=$8::timestamptz
 AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'planSha256'=$6::text
 AND r.result_data->>'packageManifestSha256'=$5::text AND r.result_data->>'baselineBatchId'=$1::text
 AND r.result_data->>'documentBatchId'=$2::text
)
SELECT EXISTS(SELECT 1 FROM root_receipt)
 AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=$1::uuid AND b.status='IMPORTED'
  AND b.source_hash=$5::text AND b.source_name=$7::text AND b.cutoff_at=$8::timestamptz
  AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1')
 AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=$2::uuid AND b.status='IMPORTED'
  AND b.source_hash=$5::text AND b.source_name=$7::text AND b.cutoff_at=$8::timestamptz
  AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1')
 AND EXISTS(SELECT 1 FROM published WHERE target_id=$1::uuid AND phase='BASELINE_SEAL')
 AND EXISTS(SELECT 1 FROM published WHERE target_id=$2::uuid AND phase='DOCUMENT_PUBLISH') AS committed`;

async function readStatus(client,values){
 let began=false,rollbackAck=false,state='UNKNOWN',sqlState=null,rollbackSqlState=null,code=null;
 try{
  if((await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')).command!=='BEGIN')throw Error('STATUS_BEGIN_ACK');began=true;
  if((await client.query('SET LOCAL ROLE erp_unified27_runtime_2393dbc6db9581c2')).command!=='SET')throw Error('STATUS_ROLE_ACK');
  const ready=await client.query('SELECT naijue_erp.standard_business_ready() AS ready');
  if(ready.rows?.length===1&&ready.rows[0].ready===true){
   const proof=await client.query(STATUS_SQL,values);
   if(proof.rows?.length===1&&proof.rows[0].committed===true)state='COMMITTED_RECEIPT_FOUND';
  }
 }catch(error){state='UNKNOWN';code='READONLY_STATUS_NOT_CONFIRMED';if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))sqlState=error.code}
 finally{
  if(began)try{rollbackAck=(await client.query('ROLLBACK')).command==='ROLLBACK'}catch(error){rollbackAck=false;if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))rollbackSqlState=error.code}
 }
 if(!rollbackAck)state='UNKNOWN';
 return {state,sqlState,rollbackSqlState,code,readOnlyRollbackAck:rollbackAck,originalWriterRollbackInferred:false};
}

// Fixed ordinary pool and cleanup for both private calls.
const {createRequire}=await import('node:module');
const runtimeRoot='/opt/naijue-erp/fresh35-combined-v1';
const require=createRequire(runtimeRoot+'/package.json');
const {Pool}=require('pg');
const host=await import(runtimeRoot+'/tools/unified-import/fresh35-host-session.mjs');
const projection=typeof d3Mode!=='undefined';
let pool,client,cap,connectionError=false,result={state:'UNKNOWN',connectionCleanup:'UNKNOWN',readOnlyRollbackAck:false};
try{
 let raw='';for await(const b of process.stdin){raw+=b;if(Buffer.byteLength(raw)>(projection?2097152:65536))throw Error('STATUS_INPUT_BOUND')}
 const v=JSON.parse(raw),c=v.configuration.postgres.target;
 if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]+$/.test(k))||Date.now()>=v.expiresAt)throw Error('STATUS_CONTEXT_REFUSED');
 const readD3=projection?await loadD3(v):null;
 if(projection&&Date.now()>=v.expiresAt)throw Error('STATUS_CONTEXT_REFUSED');
 pool=new Pool({host:c.host,port:c.port,database:c.database,user:c.user,password:()=>c.password,ssl:false,max:1,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:5000,options:'-c search_path=pg_catalog',application_name:projection?'fresh35-d3-v2-readback':'fresh35-original-key-readonly-status'});
 pool.on('error',()=>{connectionError=true});
 cap=await host.admitFresh35OrdinaryPoolV2(pool,{host:c.host,port:c.port,database:c.database,user:c.user});
 if(readD3)result=await readD3(runtimeRoot,pool,cap);
 else{
  client=await pool.connect();await host.assertFresh35OrdinaryLeaseV2(cap,pool,client);
  result=await readStatus(client,v.parameters);
 }
 if(Date.now()>=v.expiresAt)result.state='UNKNOWN';
 await host.assertFresh35OrdinaryAdmissionCurrentV2(cap,pool);
}catch(error){result.state='UNKNOWN';result.code=projection?'D3_READBACK_NOT_CONFIRMED':'READONLY_STATUS_NOT_CONFIRMED';if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))result.sqlState=error.code}
finally{
 let closed=true;
 try{if(client)client.release(true)}catch{closed=false}
 try{if(cap)host.closeFresh35OrdinaryAdmissionV2(cap,pool)}catch{closed=false}
 try{if(pool)await pool.end()}catch{closed=false}
 result.connectionCleanup=closed&&!connectionError?'CLOSED':'FAILED';if(!closed||connectionError)result.state='UNKNOWN';
}
console.log(JSON.stringify(result));
'''

def real_writer_terminal(description):
 key=description['originalWriterJobKey'];need(re.fullmatch(r't45-first-20261109-r1-real-execute-[0-9]{8}-[0-9]{2}',key) and key!=description['requestKey'],'EXACT_ORIGINAL_WRITER_KEY_REQUIRED')
 raw=read_file(CONTROL/'results'/(key+'.json'),65536,root=False);need(sha(raw)==description['originalWriterReceiptSha256'],'ORIGINAL_WRITER_RECEIPT_DIFFERS');v=strict(raw)
 need(v.get('jobId')==key and v.get('taskId')=='T45' and v.get('status') in ['COMPLETED','FAILED'] and type(v.get('exitCode')) is int and type(v.get('finishedAtUTC')) is str,'ORIGINAL_WRITER_NOT_TERMINAL')
 unit=v.get('unit');need(type(unit) is str and re.fullmatch('naijue-erp-op-5cc58239-[a-f0-9]{12}',unit),'ORIGINAL_WRITER_UNIT_REQUIRED')
 facts=dict(line.split('=',1) for line in run(['systemctl','show',unit,'--no-pager','--property=ActiveState,SubState,MainPID,ControlPID,ControlGroup']).decode().splitlines() if '=' in line)
 need(facts.get('ActiveState') in ['inactive','failed'] and facts.get('MainPID')==facts.get('ControlPID')=='0','ORIGINAL_WRITER_UNIT_STILL_ACTIVE')
 group=facts.get('ControlGroup','')
 if group:
  need(group.startswith('/') and '..' not in PurePosixPath(group).parts,'ORIGINAL_WRITER_CGROUP_INVALID');p=Path('/sys/fs/cgroup')/group.lstrip('/')/'cgroup.procs'
  need(not p.exists() or p.read_text().strip()=='','ORIGINAL_WRITER_DESCENDANTS_STILL_ACTIVE')
 root=ROOT/'state/real-first-20261109-r1/reports'/key;result=strict(read_file(root/'ops-result.json',65536,True))
 need(result.get('requestKey')==key and result.get('mode')=='EXECUTE' and result.get('guard',{}).get('childReaped') is True and all(result.get(k)==description[k] for k in ['sourceSetSha256','targetSha256','installationRecordSha256']),'ORIGINAL_WRITER_REAP_NOT_PROVEN')
 # Its PID namespace identity is checked again inside the owned container.
 return {'originalWriterJobKey':key,'process':strict(read_file(root/'stream-process.json',65536,True)),'operationParametersSha256':result.get('operationParametersSha256'),'currentOperationSourceSetSha256':result.get('currentOperationSourceSetSha256')}

def real_readonly_status_inside(description,a,work,program,record,factory):
 need(description['startsAt']<=int(time.time()*1000)<description['expiresAt']<=a['serviceLease']['expiresAt'],'READONLY_STATUS_WINDOW_EXPIRED')
 proof=description['originalWriterProof'];need(not real_process_matches(proof['process']),'ORIGINAL_WRITER_NODE_STILL_ACTIVE')
 original=read_file(Path('/etc/naijue-erp/fresh35-production-import-v1.json'),65536,False);need(sha(original)==description['originalImportAuthoritySha256'],'ORIGINAL_IMPORT_BINDING_DIFFERS')
 authority=strict(original);v2=authority.get('format')=='FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V2';keys={'format','decision','binding','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'}|({'operationParametersSha256'} if v2 else set())
 need(set(authority)==keys and authority['format'] in ['FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V1','FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V2'] and authority['decision']=='AUTHORIZE_EXACT_REAL_BATCH_IMPORT_AND_READBACK','ORIGINAL_IMPORT_BINDING_REQUIRED')
 if v2:
  pin=authority['operationParametersSha256'];need(type(pin) is str and re.fullmatch('[a-f0-9]{64}',pin) and proof.get('operationParametersSha256')==pin and proof.get('currentOperationSourceSetSha256')==REAL_OPERATION_SUCCESSOR_SOURCE,'READONLY_ORIGINAL_PARAMETERS_PROOF_DIFFERS')
  original_parameters=read_file(REAL_PARAMETERS_PATH,65536);need(sha(original_parameters)==pin,'READONLY_ORIGINAL_PARAMETERS_CHANGED');p=strict(original_parameters)
  need(p.get('installation')=={'installationRecordSha256':sha(record),'installProgramSha256':program['programSha256'],'sourceSetSha256':SOURCE,'targetSha256':program['targetSha256'],'catalogSha256':strict(record)['catalogSha256']} and p.get('currentSourceSetSha256')==REAL_OPERATION_SUCCESSOR_SOURCE and p.get('manifestSha256')==REAL_MANIFEST and p.get('authorizationReference')==authority['authorizationReference'],'READONLY_ORIGINAL_PARAMETERS_TARGET_DIFFERS')
 b=authority['binding'];need(all(b[k]==description[k] for k in ['sourceSetSha256','targetSha256','manifestSha256','installationRecordSha256']) and b['installProgramSha256']==program['programSha256'],'READONLY_ORIGINAL_TARGET_DIFFERS')
 parameters=[b[k] for k in ['baselineBatchId','documentBatchId','initializerOperationId','initializerRequestKey','manifestSha256','planSha256','sourceNamespace','cutoffAt']]
 need(all(type(v) is str and 0<len(v)<=256 for v in parameters) and all(re.fullmatch('[a-f0-9-]{36}',v) for v in parameters[:3]) and all(re.fullmatch('[a-f0-9]{64}',v) for v in parameters[4:6]),'ORIGINAL_EIGHT_PARAMETERS_REQUIRED')
 config=real_readonly_configuration(a,factory)
 operation=trusted(REAL_ROOT/'reports')/description['requestKey'];operation.mkdir(mode=0o700);new_json(operation/'ops-intent.json',description)
 out,code,reaped=real_readonly_child(config,work,factory,{'parameters':parameters},description['expiresAt'])
 result={'status':out['state'],'mode':'READONLY_STATUS','requestKey':description['requestKey'],'originalWriterJobKey':description['originalWriterJobKey'],'sourceSetSha256':SOURCE,'targetSha256':description['targetSha256'],'installationRecordSha256':sha(record),'observation':out,'code':code,'childReaped':reaped,'readOnly':True,'runtimePrivilegeChanged':False,'writerWindowExtended':False,'originalWriterRollbackInferred':False,'automaticRetry':False,'formalBusinessAcceptance':False}
 result['currentOperationSourceSetSha256']=REAL_OPERATION_SUCCESSOR_SOURCE;result['operationParametersSha256']=authority.get('operationParametersSha256')
 new_json(operation/'ops-result.json',result);return result

def real_readonly_configuration(a,factory):
 p=a['proposal'];ordinary=a['ordinary'];config={'postgres':{'target':{'host':ordinary['connectHost'],'port':ordinary['connectPort'],'database':p['database'],'user':p['runtime'],'password':None,'ssl':False}}}
 return factory.core.hydrate_ordinary_configuration(a,config)

def real_readonly_child(config,work,factory,inputs,expires_at,*,d3=False):
 import signal
 child=None;identity=None;reaped=False;out={'state':'UNKNOWN','connectionCleanup':'UNKNOWN'};code=None
 if not d3:out['readOnlyRollbackAck']=False
 def interrupted(*_):raise ValueError('READONLY_PARENT_INTERRUPTED')
 handlers={sig:signal.signal(sig,interrupted) for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]}
 try:
  script=(D3_READBACK_JS if d3 else '')+READONLY_STATUS_JS
  child=subprocess.Popen([DEPLOY+'/runtime/node/bin/node','--no-global-search-paths','--input-type=module','--eval',script],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=factory.core.clean_env(work),cwd=DEPLOY,user=61035,group=61035,extra_groups=[],start_new_session=True)
  identity=factory.core.process_identity(child.pid);need(identity['exe']==DEPLOY+'/runtime/node/bin/node' and real_process_matches(identity),'READONLY_CHILD_IDENTITY_DIFFERS')
  packet=json.dumps({**inputs,'configuration':config,'expiresAt':expires_at}).encode()
  raw,_=child.communicate(input=packet,timeout=max(.1,min(45,(expires_at-int(time.time()*1000))/1000)))
  need(child.returncode==0 and 0<len(raw)<=65536,'READONLY_RESULT_NOT_CONFIRMED');v=strict(raw)
  success='SOURCE_PROJECTION_MATCHED' if d3 else 'COMMITTED_RECEIPT_FOUND'
  need(type(v) is dict and v.get('state') in [success,'UNKNOWN'] and v.get('connectionCleanup') in ['CLOSED','FAILED'],'READONLY_SAFE_RESULT_REQUIRED')
  fields=['state','connectionCleanup'] if d3 else ['state','connectionCleanup','readOnlyRollbackAck']
  out={k:v[k] for k in fields if k in v}
  for k in ['sqlState'] if d3 else ['sqlState','rollbackSqlState']:
   if type(v.get(k)) is str and re.fullmatch('[0-9A-Z]{5}',v[k]):out[k]=v[k]
  if d3 and v.get('code')=='D3_READBACK_NOT_CONFIRMED':code=v['code']
  if int(time.time()*1000)>=expires_at or out.get('connectionCleanup')!='CLOSED' or (not d3 and out.get('readOnlyRollbackAck') is not True):out['state']='UNKNOWN'
 except Exception as error:code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
 finally:
  try:
   # With no verified identity, no stdin/credential was sent to the child.
   if child is not None:
    if child.stdin is not None:
     try:child.stdin.close()
     except (OSError,ValueError):pass
    reaped=real_stop_status_child(child,identity,real_stop_child)
  finally:
   for sig,handler in handlers.items():signal.signal(sig,handler)
   del config
 if not reaped:out['state']='UNKNOWN'
 return out,code,reaped

def real_readonly_d3_inside(description,a,work,program,record,factory,*,private_root,receipts,closed_writes):
 # Private leaf only. The issuing path must independently authorize this
 # invocation, supply the exact historical receipts and hold the write guard.
 # No existing operation description dispatches here.
 import base64
 def current_generation():
  generation=read_recovery_generation(RECOVERY_BOOT,work,a,record,program['targetSha256'])
  need(sha(generation['raw'])==description['recoveryReceiptSha256']
       and real_process_matches(generation['postmaster']),'REAL_RECOVERY_HOST_RECEIPT_OR_POSTMASTER_DIFFERS')
  now=time.time_ns()//1000000
  need(description['startsAt']<=now<description['expiresAt']<=generation['proof']['serviceLeaseExpiresAt'],
       'D3_READBACK_WINDOW_EXPIRED')
  return generation
 def encode(raw):return base64.b64encode(raw).decode('ascii')
 sidecar=trusted(Path(private_root)/D3_SIDECAR)
 for member in (sidecar,sidecar.with_name('AGGREGATE-AND-WAREHOUSE-READBACK-EXPECTATIONS.private.json'),
                sidecar.with_name('WAREHOUSE-KEY-EXPECTATIONS.private.json')):
  need(stat.S_ISREG(trusted(member).lstat().st_mode),'D3_PRIVATE_MEMBER_REQUIRED')
 out={'state':'UNKNOWN','connectionCleanup':'UNKNOWN'}
 code='D3_READBACK_NOT_CONFIRMED';reaped=False;generation_confirmed=False
 with closed_writes:
  generation=current_generation()
  wire={'recordBytes':encode(record),'restartBytes':encode(generation['raw'])}
  for key in ('prepareParametersBytes','parametersBytes','approvalBytes'):
   wire[key]=encode(receipts[key])
  for mode,key_field,job_field in [('prepare','originalPrepareJobKey','prepareJob'),('execute','originalWriterJobKey','writerJob')]:
   key=receipts[key_field];job=receipts[job_field]
   need(re.fullmatch(r't45-first-20261109-r1-real-'+mode+r'-[0-9]{8}-[0-9]{2}',key)
        and key!=description['requestKey'],'D3_ORIGINAL_JOB_KEY_REQUIRED')
   raw=read_file(REAL_ROOT/'reports'/key/'stream.stdout',65536,True)
   need(sha(raw)==job['stdoutSha256'],'D3_ORIGINAL_STDOUT_DIFFERS')
   wire[key_field]=key
   wire[job_field]={**{k:job[k] for k in ('manager','terminal','stdoutSha256')},'stdoutBytes':encode(raw)}
  inputs={'receipts':wire,'sidecar':str(sidecar),'toolRoot':REAL_RECOVERY_OPERATION[1]}
  config=real_readonly_configuration(a,factory)
  out,code,reaped=real_readonly_child(config,work,factory,inputs,description['expiresAt'],d3=True)
  if out['state']=='SOURCE_PROJECTION_MATCHED':
   need(current_generation()['postmaster']==generation['postmaster'],'D3_READBACK_GENERATION_CHANGED')
   generation_confirmed=True
 if out['state']=='SOURCE_PROJECTION_MATCHED' and (not generation_confirmed or time.time_ns()//1000000>=description['expiresAt']):
  out['state']='UNKNOWN';code='D3_READBACK_NOT_CONFIRMED'
 return {'status':out['state'],'observation':out,'code':code,'childReaped':reaped}

def real_stop_status_child(child,identity,matched_stop):
 # Same direct-child cleanup body already reviewed in materializer9ccd.
 if identity is not None:return matched_stop(child,identity)
 if child.poll() is not None:child.wait();return True
 try:os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
 except ChildProcessError:return False
 child.terminate()
 try:child.wait(timeout=3)
 except subprocess.TimeoutExpired:
  child.kill()
  try:child.wait(timeout=3)
  except subprocess.TimeoutExpired:return False
 return child.poll() is not None

def real_process_matches(identity):
 # The original same_process is deliberately postgres-only. Do not reuse it
 # for Node or Python, and do not look up unrelated processes by name or UID.
 try:
  p=Path('/proc')/str(identity['pid'])
  return {'pid':identity['pid'],'starttime':(p/'stat').read_text().rsplit(')',1)[1].split()[19],'exe':os.readlink(p/'exe')}==identity
 except FileNotFoundError:return False

def real_mount(path):
 # Longest containing mount, in THIS process's actual mount namespace.
 def unescape(s):return re.sub(r'\\([0-7]{3})',lambda m:chr(int(m[1],8)),s)
 rows=[]
 for line in Path('/proc/self/mountinfo').read_text().splitlines():
  left,right=line.split(' - ',1);v=left.split();z=right.split();point=unescape(v[4])
  if path==point or path.startswith(point.rstrip('/')+'/'):
   rows.append({'mountId':v[0],'deviceNumber':v[2],'mountRoot':unescape(v[3]),'mountPoint':point,'fsType':z[0],'mountSource':unescape(z[1])})
 need(rows,'REAL_MOUNT_NOT_MEASURED');return max(rows,key=lambda x:len(x['mountPoint']))

def real_volume_sample(volumes,starting=False):
 ns=Path('/proc/self/ns/mnt').stat();namespace={'device':ns.st_dev,'inode':ns.st_ino};out={};physical={};devices={}
 for name in sorted(REAL_VOLUME_NAMES):
  v=volumes[name];path=trusted(Path(v['path']),root=False)
  need(v['namespace']==namespace,'REAL_MOUNT_NAMESPACE_CHANGED')
  before=path.lstat();need(stat.S_ISDIR(before.st_mode) and before.st_dev==v['device'] and before.st_ino==v['directoryInode'],'REAL_VOLUME_DIRECTORY_CHANGED')
  mount=real_mount(str(path));need(mount==v['mount'],'REAL_MOUNT_MAPPING_CHANGED')
  fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
   opened=os.fstat(fd);need((opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino),'REAL_VOLUME_DIRECTORY_CHANGED')
   measured=os.fstatvfs(fd);available=measured.f_bavail*measured.f_frsize
   after=path.lstat();need((after.st_dev,after.st_ino)==(before.st_dev,before.st_ino) and real_mount(str(path))==mount,'REAL_VOLUME_MAPPING_CHANGED_DURING_SAMPLE')
  finally:os.close(fd)
  need(type(available) is int and available>=0,'REAL_SPACE_MEASUREMENT_FAILED')
  device=(v['device'],mount['deviceNumber']);volume=v['physicalVolume']
  need(physical.setdefault(volume,device)==device and devices.setdefault(device,volume)==volume,'REAL_PHYSICAL_VOLUME_BINDING_DIFFERS')
  need(available>=(REAL_START_MINIMUM if starting else REAL_STOP_FLOOR),'REAL_START_SPACE_INSUFFICIENT' if starting else 'REAL_SPACE_FLOOR_REACHED')
  out[name]=available
 need(Path('/proc/self/ns/mnt').stat().st_ino==ns.st_ino,'REAL_MOUNT_NAMESPACE_CHANGED');return out

def real_stop_child(child,identity):
 import signal
 if child.poll() is not None:child.wait();return True
 if identity is None or not real_process_matches(identity):return False
 child.send_signal(signal.SIGTERM)
 try:child.wait(timeout=3)
 except subprocess.TimeoutExpired:
  if not real_process_matches(identity):return child.poll() is not None
  child.kill()
  try:child.wait(timeout=3)
  except subprocess.TimeoutExpired:return False
 return child.poll() is not None

def real_stop_controller(work,identity):
 import signal
 for boot in (RECOVERY_BOOT,RETAINED_BOOT):
  if (boot/'controller-process.json').is_file() and strict(read_file(boot/'controller-process.json',65536,True))==identity:
   work=boot
   break
 # Exact original creating Python controller only. Its existing finally writes
 # STOP to its guardian, which alone owns stop_owned(PG). No direct PG kill.
 if real_process_matches(identity):os.kill(identity['pid'],signal.SIGTERM)
 deadline=time.monotonic()+32
 while time.monotonic()<deadline:
  if (work/'caller-result.json').is_file() and (work/'cleanup.json').is_file():
   caller=strict(read_file(work/'caller-result.json',65536,True));clean=strict(read_file(work/'cleanup.json',65536,True))
   return {'controllerStopped':not real_process_matches(identity),'cleanupComplete':clean.get('cleanupComplete') is True,'callerState':caller.get('state'),'transactionRollbackProven':False}
  time.sleep(.1)
 return {'controllerStopped':not real_process_matches(identity),'cleanupComplete':False,'transactionRollbackProven':False}

def real_report_sample(volume,report,observed):
 # Preflight creates its report directory exclusively. Observe the actual
 # subsequently created directory/index too, without precreating either one.
 for path in [report,report/'index.sqlite']:
  if not path.exists() and not path.is_symlink():continue
  p=trusted(path,root=False);s=p.lstat();key=str(p)
  need(s.st_dev==volume['device'] and real_mount(str(p))==volume['mount'],'REAL_REPORT_VOLUME_CHANGED')
  need((stat.S_ISDIR(s.st_mode) if p==report else stat.S_ISREG(s.st_mode)) and observed.setdefault(key,(s.st_dev,s.st_ino))==(s.st_dev,s.st_ino),'REAL_REPORT_IDENTITY_CHANGED')

def real_watch(child,identity,description,controller,workspace,parent_alive,report=None,initial_sample_at=None,initial_values=None,original_deadline=None):
 # SQL execution, SQLite/preflight and output pipes cannot postpone this loop.
 # A late sample fails closed; the 6 GiB floor is not a guarantee of peak usage.
 # Carry the last actual sample across spawn and /proc identity lookup. Never
 # restart the clock on handoff to this loop or omit a child's startup gap.
 entered=time.monotonic();last=entered if initial_sample_at is None else initial_sample_at;deadline=entered+max(0,description['expiresAt']/1000-time.time()) if original_deadline is None else original_deadline;maximum_gap=0;minimum=dict(initial_values or {});samples=0;observed={}
 try:
  while True:
   begin=time.monotonic();maximum_gap=max(maximum_gap,begin-last);need(begin-last<=.25,'REAL_SPACE_SAMPLE_LATE')
   need(parent_alive(),'REAL_ORIGINAL_CALLER_LOST')
   need(real_process_matches(controller),'REAL_ORIGINAL_CONTROLLER_LOST')
   need(int(time.time()*1000)<description['expiresAt'] and time.monotonic()<deadline,'REAL_ORIGINAL_WINDOW_EXPIRED')
   values=real_volume_sample(description['volumes'])
   if report is not None:real_report_sample(description['volumes']['reportIndex'],report,observed)
   finish=time.monotonic();gap=finish-last;maximum_gap=max(maximum_gap,gap)
   need(gap<=.25,'REAL_SPACE_SAMPLE_LATE');last=finish;samples+=1
   need(int(time.time()*1000)<description['expiresAt'] and finish<deadline,'REAL_ORIGINAL_WINDOW_EXPIRED')
   for k,v in values.items():minimum[k]=min(minimum.get(k,v),v)
   code=child.poll()
   if code is not None:
    child.wait();need(int(time.time()*1000)<description['expiresAt'] and time.monotonic()<deadline,'REAL_ORIGINAL_WINDOW_EXPIRED');return {'guard':'COMPLETED','exitCode':code,'childReaped':True,'samples':samples,'maxSampleGapSeconds':maximum_gap,'minimumAvailableBytes':minimum,'transactionRollbackProven':False}
   need(real_process_matches(identity),'REAL_STREAM_CHILD_IDENTITY_CHANGED')
   time.sleep(max(0,.1-(time.monotonic()-begin)))
 except BaseException as error:
  reaped=real_stop_child(child,identity)
  try:cleanup=real_stop_controller(workspace,controller)
  except Exception:cleanup={'controllerStopped':False,'cleanupComplete':False,'transactionRollbackProven':False}
  return {'guard':'STOPPED_OUTCOME_UNKNOWN','reason':str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__,'childReaped':reaped,'exitCode':child.returncode,'samples':samples,'maxSampleGapSeconds':maximum_gap,'minimumAvailableBytes':minimum,'originalControllerCleanup':cleanup,'transactionRollbackProven':False,'automaticRetry':False}

# Historical materializer keys retain their original pins.
REAL_OPERATION_SOURCE='964a925adcad201f10d5e5b18d158cb6abd229cfa7f1d0e3402105c0dcf187b3'
REAL_OPERATION_ROOT='/var/lib/naijue-erp/fresh35-production/installed-real-operation-72eb4b8c-20261109-01/operation'
# The first R1 stream and its original-key status reader use the 75144 tool.
REAL_OPERATION_SUCCESSOR_SOURCE='50bd7bf46362487fabb6b709c47b55feb51436df318c55191c6e1433b617d96c'
REAL_OPERATION_SUCCESSOR_ROOT='/var/lib/naijue-erp/fresh35-production/installed-real-operation-75144abc-20261110-01/operation'
REAL_PARAMETERS_PATH=Path('/etc/naijue-erp/fresh35-installed-real-window-v1.json')
# Frozen local V2 tool material. Actual Linux materialization uses the separate stage.
REAL_RECOVERY_OPERATION=(
 'f9d7b100b628ecf5072a208bc0f28ed93b987a1f9150dc54398c36f785774054',
 '/var/lib/naijue-erp/fresh35-production/installed-real-operation-94152ed1-20261110-01/operation',
)

def real_operation_parameters(description,a,work,program,record,generation=None):
 raw=read_file(REAL_PARAMETERS_PATH,65536);need(sha(raw)==description['operationParametersSha256'],'REAL_OPERATION_PARAMETERS_DIFFERS');p=strict(raw)
 keys={'format','installedSourceRoot','currentSourceSetSha256','installation','manifestSha256','startsAt','expiresAt','authorizationExpiresAt','serviceReceipt','controllerLoginValidUntil','adminLoginValidUntil','authorizationReference'}
 source=REAL_OPERATION_SUCCESSOR_SOURCE if generation is None else REAL_RECOVERY_OPERATION[0]
 need(type(p) is dict and set(p)==keys|({'restartReceipt'} if 'restartReceipt' in p else set()) and p['format']=='FRESH35_INSTALLED_REAL_OPERATION_PARAMETERS_V1' and p['installedSourceRoot']==DEPLOY and p['currentSourceSetSha256']==source,'REAL_INDEPENDENT_PARAMETERS_REQUIRED')
 need(p['installation']=={'installationRecordSha256':sha(record),'installProgramSha256':program['programSha256'],'sourceSetSha256':SOURCE,'targetSha256':program['targetSha256'],'catalogSha256':strict(record)['catalogSha256']} and p['manifestSha256']==REAL_MANIFEST,'REAL_INSTALLED_PROVENANCE_DIFFERS')
 service=read_file(Path('/etc/naijue-erp/fresh35-retained-service-v1.json'),1048576)
 need(service==read_file(work/'service-retained.json',1048576,True) and p['serviceReceipt']=={'path':'/etc/naijue-erp/fresh35-retained-service-v1.json','sha256':sha(service)},'REAL_RETAINED_SERVICE_PROJECTION_DIFFERS')
 lease=a['serviceLease']['expiresAt'] if generation is None else generation['proof']['serviceLeaseExpiresAt']
 need(all(type(p[k]) is int for k in ['startsAt','expiresAt','authorizationExpiresAt']) and p['startsAt']<=description['startsAt']<=int(time.time()*1000)<description['expiresAt']<=p['expiresAt']<=p['authorizationExpiresAt'] and 0<p['expiresAt']-p['startsAt']<=5400000 and p['expiresAt']<=lease,'REAL_INDEPENDENT_FINITE_WINDOW_REQUIRED')
 need(type(p['authorizationReference']) is str and 0<len(p['authorizationReference'])<=512,'REAL_EXTERNAL_AUTHORIZATION_REFERENCE_REQUIRED')
 if generation is not None:
  proof=generation['proof']
  need(p.get('restartReceipt')=={'path':str(RECOVERY_RECEIPT),'sha256':sha(generation['raw'])}
       and p['authorizationReference']==proof['authorizationReference']
       and p['startsAt']>=proof['checkedAt']
       and all(p[k]==proof[k] for k in ('controllerLoginValidUntil','adminLoginValidUntil')),
       'REAL_RECOVERY_PARAMETERS_DIFFERS')
  return p
 import datetime
 need(type(p['controllerLoginValidUntil']) is str and datetime.datetime.fromisoformat(p['controllerLoginValidUntil'].replace('Z','+00:00')).timestamp()*1000==p['expiresAt'] and datetime.datetime.fromisoformat(p['adminLoginValidUntil'].replace('Z','+00:00')).timestamp()*1000<=min(p['authorizationExpiresAt'],a['serviceLease']['expiresAt']) and p['expiresAt']<=datetime.datetime.fromisoformat(p['adminLoginValidUntil'].replace('Z','+00:00')).timestamp()*1000,'REAL_INDEPENDENT_ROLE_LIFETIMES_REQUIRED')
 if 'restartReceipt' in p:
  ref=p['restartReceipt'];need(type(ref) is dict and set(ref)=={'path','sha256'} and ref['path']=='/etc/naijue-erp/fresh35-retained-restart-v1.json','REAL_FIXED_RESTART_RECEIPT_REQUIRED')
  observed=read_file(Path(ref['path']),65536);need(sha(observed)==ref['sha256'],'REAL_RESTART_RECEIPT_CHANGED');boot=strict(observed)
  need(boot['installationRecordSha256']==sha(record) and boot['targetSha256']==program['targetSha256'] and boot['sourceSetSha256']==SOURCE and boot['authorizationReference']==p['authorizationReference'],'REAL_RESTART_ORIGINAL_BINDING_DIFFERS')
  first_restart_intent(work,boot,p['authorizationReference'])
 return p

def real_cli_command(description,report,root=REAL_OPERATION_SUCCESSOR_ROOT):
 match=re.fullmatch(FIRST_REAL_KEY,description['requestKey'])
 need(match is not None and match[1].upper()==description['mode']
      and report==REAL_ROOT/'reports'/description['requestKey']/'runtime/stream',
      'REAL_ORIGINAL_OPERATION_KEY_REQUIRED')
 command=[DEPLOY+'/runtime/node/bin/node','--no-global-search-paths',root+'/tools/unified-import/cli.mjs','stream-import','--package',str(REAL_ROOT/'package'),'--report',str(report),'--manifest-sha256',REAL_MANIFEST,'--target',str(REAL_ROOT/'nonroot-access'/description['requestKey']/'worker/target.json'),'--admin',str(REAL_ROOT/'nonroot-access'/description['requestKey']/'worker/initialize-admin.json'),'--connection',str(REAL_ROOT/'nonroot-access'/description['requestKey']/'worker/private/controller-connection.json'),'--scrypt-file',str(REAL_ROOT/'nonroot-access'/description['requestKey']/'worker/private/initial-admin-scrypt.secret'),'--target-profile','FRESH35_PRODUCTION_REAL_IMPORT_V1','--fresh35-reference-inputs',DEPLOY+'/reference-inputs','--ack-exclusive-ddl-window']
 need(description['mode'] in ['PREPARE','EXECUTE','INSPECT'],'REAL_CLOSED_MODE_REQUIRED')
 if description['mode']=='PREPARE':command.append('--prepare-only')
 elif description['mode']=='INSPECT':command.append('--inspect-only')
 if description['registrationSha256'] is not None:command+=['--registration',str(REAL_ROOT/'registration.json')]
 for name in sorted(description['approvals']):command+=['--'+name,str(REAL_ROOT/'approvals'/REAL_APPROVAL_FILENAMES[name]),'--'+name+'-sha256',description['approvals'][name]]
 return command

def real_safe_cli_result(raw):
 try:
  v=strict(raw);need(type(v) is dict,'REAL_CLI_RESULT_INVALID')
  states={'PRODUCTION_REAL_IMPORT_PREPARED','COMMITTED','ALREADY_COMMITTED','COMMITTED_RECEIPT_FOUND','ABSENT','ROLLED_BACK','UNKNOWN','NOT_STARTED'}
  out={'state':v.get('state') if v.get('state') in states else 'UNKNOWN','connectionCleanup':v.get('connection_cleanup') if v.get('connection_cleanup') in ['CLOSED','FAILED'] else 'UNKNOWN'}
  verification=v.get('verification')
  ver=verification.get('state') if type(verification) is dict else verification
  out['verification']=ver if ver in ['NOT_RUN','VERIFIED','VERIFICATION_FAILED','VERIFICATION_UNKNOWN','REDACTED'] else 'UNKNOWN'
  if type(verification) is dict and ver in ['VERIFICATION_FAILED','VERIFICATION_UNKNOWN']:
   # Match the diagnostic enums emitted by the fixed whole-package reconciler.
   code=verification.get('code')
   codes={
    'VERIFY_REPLY_INVALID','VERIFY_COUNTS_INVALID','VERIFY_SOURCE_COUNT_MISMATCH',
    'VERIFY_TOTALS_INVALID','VERIFY_TOTAL_INVALID','VERIFY_TOTAL_PRECISION_INVALID',
    'VERIFY_SOURCE_TOTAL_MISMATCH','VERIFY_COVERAGE_INVALID','VERIFY_BEGIN_ACK_INVALID',
    'VERIFY_ROLE_ACK_INVALID','VERIFY_ROLLBACK_ACK_INVALID','VERIFY_DATABASE_OR_PROTOCOL_FAILED',
   }
   if type(code) is str and code in codes:
    out['verificationCode']=code
    field=verification.get('field')
    fields={
     'VERIFY_SOURCE_COUNT_MISMATCH':{
      'HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT',
      'SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','PRODUCT_IMAGE','SKU',
      'BARCODE_SCHEME','SKU_BARCODE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL',
      'SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT',
      'INVENTORY_KEY','IMPORT_BATCH',
     },
     'VERIFY_SOURCE_TOTAL_MISMATCH':{
      'inventory_quantity','sales_quantity','sales_line_amount','sales_net_due',
      'sales_settlement_amount','transfer_quantity',
     },
    }
    if type(field) is str and field in fields.get(code,()):
     out['verificationField']=field
  if isinstance(v.get('code'),str) and re.fullmatch('[A-Z0-9_]{1,100}',v['code']):out['code']=v['code']
  if v.get('local_cleanup')=='FAILED':out['localCleanup']='FAILED'
  # The exact prepared binding is necessary for C's original independent
  # seven-key authority. It contains metadata/request keys, never row bodies.
  if out['state']=='PRODUCTION_REAL_IMPORT_PREPARED':
   binding=v.get('binding');hashes={'installationRecordSha256','installProgramSha256','sourceSetSha256','targetSha256','catalogSha256','manifestSha256','planSha256','initializerSha256','stepsSha256'}
   labels={'sourceNamespace','cutoffAt','baselineBatchId','documentBatchId','initializerOperationId','initializerRequestKey'}
   need(type(binding) is dict and set(binding)==hashes|labels|{'format','stepCount'} and binding['format']=='FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1' and all(type(binding[k]) is str and re.fullmatch('[a-f0-9]{64}',binding[k]) for k in hashes),'REAL_PREPARED_BINDING_INVALID')
   need(type(binding['stepCount']) is int and binding['stepCount']>0 and all(type(binding[k]) is str and 0<len(binding[k])<=256 and not any(ord(c)<32 for c in binding[k]) for k in labels),'REAL_PREPARED_BINDING_INVALID')
   need(type(v.get('business_database_writes')) is bool,'REAL_PREPARED_WRITES_FLAG_INVALID');out['binding']=binding;out['businessDatabaseWrites']=v['business_database_writes']
  return out
 except Exception:return {'state':'UNKNOWN','connectionCleanup':'UNKNOWN','verification':'UNKNOWN'}

REAL_FAILURE_CODES=frozenset(['ACTUAL_ENVIRONMENT_IMAGE_DIFFERS', 'ACTUAL_NEW_CID_REQUIRED', 'ACTUAL_PRODUCTION_CID_REQUIRED', 'ACTUAL_PRODUCTION_CREATION_FACTS_DIFFER', 'ACTUAL_TARGET_PROGRAM_REQUIRED', 'APPLICATION_MEMBER_CHANGED', 'APPLICATION_MEMBER_SCOPE_REQUIRED', 'ARCHIVE_CLOSURE_DIFFERS', 'BASE_IMAGE_DIFFERS', 'BOUNDED_PROOF_EVIDENCE_REQUIRED', 'BOUNDED_REGULAR_FILE_REQUIRED', 'CANONICAL_PATH_REQUIRED', 'CLOSED_PRODUCTION_CARRIER_REQUIRED', 'CONTAINER_BUDGET_DIFFERS', 'CONTAINER_EXTRAS_DIFFERS', 'CONTAINER_ISOLATION_DIFFERS', 'CONTAINER_OWNERSHIP_DIFFERS', 'CONTAINER_POLICY_DIFFERS', 'CURRENT_APPLICATION_AUTHORITY_MANIFEST_DIFFERS', 'CURRENT_APPLICATION_CLOSURE_DIFFERS', 'CURRENT_APPLICATION_MANIFEST_DIFFERS', 'CURRENT_APPLICATION_MANIFEST_FORMAT', 'CURRENT_APPLICATION_MANIFEST_MEMBER', 'CURRENT_APPLICATION_PATH', 'CURRENT_APPLICATION_RECEIPT_DIFFERS', 'CURRENT_APPLICATION_SOURCE_DIFFERS', 'DEPENDENCY_LOCK_DIFFERS', 'DEPLOYMENT_MANIFEST_DIFFERS', 'DESCRIBED_SOURCE_DIFFERS', 'DUPLICATE_KEY', 'EMPTY_APPLICATION_MEMBER_NOT_REGISTERED', 'EMPTY_CAPACITY_INODE_CHANGED', 'EMPTY_FIXED_PROFILE_RESERVATION_REQUIRED', 'ENVIRONMENT_PROVENANCE_DIFFERS', 'ENVIRONMENT_RECEIPT_DIFFERS', 'ENVIRONMENT_RECIPE_DIFFERS', 'EXACT_BOOTSTRAP_NETWORK_EVIDENCE_REQUIRED', 'EXACT_DEPLOYMENT_FORMAT_REQUIRED', 'EXACT_EMPTY_APPLICATION_MEMBER_REQUIRED', 'EXACT_EXISTING_FRONT_REQUIRED', 'EXACT_EXISTING_NODE_BIND_REQUIRED', 'EXACT_FUTURE_APP_ALIAS_REQUIRED', 'EXACT_JOB_INPUT_REQUIRED', 'EXACT_MOUNTS_REQUIRED', 'EXACT_ORIGINAL_WRITER_KEY_REQUIRED', 'EXACT_PARTIAL_DIRECTORY_REQUIRED', 'EXACT_PARTIAL_MEMBER_CONTENT_REQUIRED', 'EXACT_PARTIAL_MEMBER_METADATA_REQUIRED', 'EXACT_PARTIAL_MEMBER_REQUIRED', 'EXACT_PARTIAL_ROOT_REQUIRED', 'EXACT_PIN_REQUIRED', 'EXACT_PRODUCTION_MOUNTS_REQUIRED', 'EXACT_PRODUCTION_OPS_BINDING_REQUIRED', 'EXACT_PRODUCTION_SOURCE_AND_EXISTING_UID_REQUIRED', 'EXACT_SOURCE_TARGET_REQUIRED', 'EXACT_STAGED_READY_REQUIRED', 'EXISTING_PRODUCTION_FRONT_CHANGED', 'EXPLICIT_EXECUTION_NOT_REQUESTED', 'EXPLICIT_PRODUCTION_PLAN_REQUIRED', 'EXPLICIT_SCOPE_CONFIGURATION_REQUIRED', 'EXTERNAL_INSTALL_AUTHORITY_HASH_DIFFERS', 'EXTERNAL_INSTALL_BINDING_DIFFERS', 'EXTERNAL_INSTALL_DECISION_REQUIRED', 'EXTERNAL_INSTALL_INPUT_REQUIRED', 'EXTERNAL_PREPARATION_DEADLINE_REQUIRED', 'EXTERNAL_PRODUCTION_AUTHORITY_DIFFERS', 'EXTERNAL_PRODUCTION_CREATION_INPUT_REQUIRED', 'EXTERNAL_PRODUCTION_DELIVERY_HASH_DIFFERS', 'EXTERNAL_PRODUCTION_DELIVERY_REQUIRED', 'EXTERNAL_PROVISION_INPUT_REQUIRED', 'EXTERNAL_REVIEW_REFERENCE_REQUIRED', 'FINAL_APPLICATION_NOT_FROZEN', 'FIXED_PRODUCTION_DELIVERY_REQUIRED', 'FIXED_PROOF_EVIDENCE_SOURCE_REQUIRED', 'FIXED_SHARED_PACKAGE_BINDING_CHANGED', 'FIXED_SHARED_PACKAGE_DIRECTORY_REQUIRED', 'FIXED_SHARED_PACKAGE_MANIFEST_DIFFERS', 'FIXED_SHARED_PACKAGE_MEMBER_REQUIRED', 'FIXED_SHARED_PACKAGE_METADATA_DIFFERS', 'INDEPENDENT_PRODUCTION_ROOT_AND_NAME_REQUIRED', 'INPUT_CHANGED', 'LAUNCHER_EXIT_RECEIPT_DIFFERS', 'MANIFEST_MEMBER_DIFFERS', 'MEMBER_HASH_DIFFERS', 'NEW_ROOT_ONLY', 'NO_STALE_INSTALL_AUTHORITY', 'OBSERVED_CID_REQUIRED', 'OPERATION_ID_REQUIRED', 'OPERATION_NOT_CONFIRMED', 'OPS_SOURCE_CHANGED', 'ORIGINAL_EIGHT_PARAMETERS_REQUIRED', 'ORIGINAL_IMPORT_BINDING_DIFFERS', 'ORIGINAL_IMPORT_BINDING_REQUIRED', 'ORIGINAL_INSTALL_FORMAT_REQUIRED', 'ORIGINAL_LIVE_PRODUCTION_CARRIER_REQUIRED', 'ORIGINAL_ORDINARY_RECEIPTS_REQUIRED', 'ORIGINAL_PRIVATE_JOB_REQUIRED', 'ORIGINAL_PRODUCTION_WINDOW_TOO_SHORT', 'ORIGINAL_PROOF_EVIDENCE_WINDOW_REQUIRED', 'ORIGINAL_PROVISION_AUTHORITY_REQUIRED', 'ORIGINAL_PROVISION_CLOSED_INPUT_REQUIRED', 'ORIGINAL_ROOT_T45_DISPATCHER_REQUIRED', 'ORIGINAL_STATE_MOUNT_REQUIRED', 'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED', 'ORIGINAL_WINDOW_TOO_SHORT', 'ORIGINAL_WRITER_BINDING_REQUIRED', 'ORIGINAL_WRITER_CGROUP_INVALID', 'ORIGINAL_WRITER_DESCENDANTS_STILL_ACTIVE', 'ORIGINAL_WRITER_NODE_STILL_ACTIVE', 'ORIGINAL_WRITER_NOT_TERMINAL', 'ORIGINAL_WRITER_REAP_NOT_PROVEN', 'ORIGINAL_WRITER_RECEIPT_DIFFERS', 'ORIGINAL_WRITER_UNIT_REQUIRED', 'ORIGINAL_WRITER_UNIT_STILL_ACTIVE', 'PLAN_HASH_DIFFERS', 'PREEXISTING_FRONT_ENDPOINTS_CHANGED', 'PREPARATION_DEADLINE_EXPIRED', 'PRIVATE_INPUT_REQUIRED', 'PRODUCTION_ALREADY_SUBMITTED_OR_UNKNOWN_NO_REPLAY', 'PRODUCTION_AUTHORITY_OR_INTENT_CHANGED', 'PRODUCTION_CARRIER_BIRTH_CHANGED', 'PRODUCTION_CARRIER_CHANGED_DURING_READ', 'PRODUCTION_CARRIER_ISOLATION_DIFFERS', 'PRODUCTION_CARRIER_LEASE_DIFFERS', 'PRODUCTION_CARRIER_OWNERSHIP_DIFFERS', 'PRODUCTION_CARRIER_PROCESS_CHANGED', 'PRODUCTION_DELIVERY_METADATA_DIFFERS', 'PRODUCTION_DELIVERY_READBACK_DIFFERS', 'PRODUCTION_DEPLOYMENT_MANIFEST_DIFFERS', 'PRODUCTION_ENDPOINT_CHANGED', 'PRODUCTION_FRONT_APP_ALIAS_CONFLICT', 'PRODUCTION_FRONT_ENDPOINT_REQUIRED', 'PRODUCTION_NAME_EXISTS_OR_UNKNOWN_NO_REPLAY', 'PRODUCTION_ORIGINAL_INTENT_CHANGED', 'PRODUCTION_PROGRAM_PINS_REQUIRED', 'PRODUCTION_PROGRAM_TARGET_DIFFERS', 'PRODUCTION_PYTHON_SOURCE_DIFFERS', 'PRODUCTION_SERVICE_NOT_DURABLY_RETAINED', 'PROTECTED_PATH_REQUIRED', 'PROVISION_INPUT_HASH_DIFFERS', 'R3_EXACT_BASE_DELTA_PREPARER_REQUIRED', 'READONLY_CHILD_IDENTITY_DIFFERS', 'READONLY_ORIGINAL_PARAMETERS_CHANGED', 'READONLY_ORIGINAL_PARAMETERS_PROOF_DIFFERS', 'READONLY_ORIGINAL_PARAMETERS_TARGET_DIFFERS', 'READONLY_ORIGINAL_TARGET_DIFFERS', 'READONLY_RESULT_NOT_CONFIRMED', 'READONLY_SAFE_RESULT_REQUIRED', 'READONLY_STATUS_WINDOW_EXPIRED', 'REAL_ACCESS_CONSUMER_SOURCE_CHANGED', 'REAL_ACCESS_REFERENCE_KEY_REQUIRED', 'REAL_ACTUAL_VOLUME_BINDING_REQUIRED', 'REAL_ALL_PHYSICAL_VOLUMES_REQUIRED', 'REAL_APPROVAL_ACCESS_LEDGER_REQUIRED', 'REAL_BOUNDED_ORIGINAL_WINDOW_REQUIRED', 'REAL_CARRIER_TARGET_DIFFERS', 'REAL_CLI_RESULT_INVALID', 'REAL_CLOSED_MODE_REQUIRED', 'REAL_C_BOUND_NONROOT_PLAN_DIFFERS', 'REAL_DEPLOYMENT_MANIFEST_DIFFERS', 'REAL_EXACT_ACTIVE_ACCESS_REQUIRED', 'REAL_EXACT_INPUT_PINS_REQUIRED', 'REAL_EXACT_OPERATION_PARAMETERS_PIN_REQUIRED', 'REAL_EXACT_TARGET_INPUT_BINDING_DIFFERS', 'REAL_EXECUTION_DESCRIPTION_DIFFERS', 'REAL_EXECUTION_DESCRIPTION_REQUIRED', 'REAL_EXISTING_APPROVAL_REQUIRED', 'REAL_EXISTING_INPUT_DIFFERS', 'REAL_EXTERNAL_AUTHORIZATION_REFERENCE_REQUIRED', 'REAL_FIXED_NONROOT_SOURCE_DIFFERS', 'REAL_FIXED_RESTART_RECEIPT_REQUIRED', 'REAL_FIXED_VOLUME_PATHS_REQUIRED', 'REAL_INDEPENDENT_FINITE_WINDOW_REQUIRED', 'REAL_INDEPENDENT_PARAMETERS_REQUIRED', 'REAL_INDEPENDENT_ROLE_LIFETIMES_REQUIRED', 'REAL_INSTALLED_PROVENANCE_DIFFERS', 'REAL_MOUNT_MAPPING_CHANGED', 'REAL_MOUNT_NAMESPACE_CHANGED', 'REAL_MOUNT_NOT_MEASURED', 'REAL_NONROOT_ACCESS_PLAN_REQUIRED', 'REAL_OPERATION_PARAMETERS_DIFFERS', 'REAL_OPS_RESULT_UNKNOWN_ORIGINAL_KEY_ONLY', 'REAL_ORIGINAL_APPROVAL_INPUTS_REQUIRED', 'REAL_ORIGINAL_CALLER_LOST', 'REAL_ORIGINAL_CONTROLLER_ARGUMENTS_DIFFER', 'REAL_ORIGINAL_CONTROLLER_LOST', 'REAL_ORIGINAL_CONTROLLER_SOURCE_DIFFERS', 'REAL_ORIGINAL_OPERATION_KEY_REQUIRED', 'REAL_ORIGINAL_WINDOW_EXPIRED', 'REAL_PHYSICAL_VOLUME_BINDING_DIFFERS', 'REAL_PREPARED_BINDING_INVALID', 'REAL_PREPARED_OUTPUT_BINDING_DIFFERS', 'REAL_PREPARED_WRITES_FLAG_INVALID', 'REAL_PRIVATE_EXISTING_INPUT_REQUIRED', 'REAL_REGISTRATION_DIFFERS', 'REAL_REPORT_IDENTITY_CHANGED', 'REAL_REPORT_VOLUME_CHANGED', 'REAL_RESTART_ORIGINAL_BINDING_DIFFERS', 'REAL_RESTART_RECEIPT_CHANGED', 'REAL_RETAINED_PRODUCTION_REQUIRED', 'REAL_RETAINED_SERVICE_PROJECTION_DIFFERS', 'REAL_ROOT_ISOLATED_PYTHON_REQUIRED', 'REAL_SPACE_MEASUREMENT_FAILED', 'REAL_SPACE_SAMPLE_LATE', 'REAL_STREAM_CHILD_IDENTITY_CHANGED', 'REAL_STREAM_CHILD_IDENTITY_DIFFERS', 'REAL_VOLUME_DIRECTORY_CHANGED', 'REAL_VOLUME_MAPPING_CHANGED_DURING_SAMPLE', 'REGULAR_EXACT_ARCHIVE_REQUIRED', 'ROOT_OWNER_REQUIRED', 'SOURCE_SET_DIFFERS', 'STAGED_ARCHIVE_DIFFERS', 'STAGED_IDENTITY_CHANGED', 'STAGED_OWNER_OR_MODE_DIFFERS', 'START_INTENT_DIFFERS', 'TARGET_NAME_ALREADY_EXISTS_NO_REPLAY'])
def real_failure_details(error,stage):
 import traceback
 classes={'ValueError','RuntimeError','FileNotFoundError','PermissionError','TimeoutExpired','OSError','KeyError','TypeError','AssertionError'}
 code=str(error) if isinstance(error,(ValueError,RuntimeError)) and (str(error) in REAL_FAILURE_CODES or str(error) in ['REAL_NODE_DESCENDANTS_NOT_REAPED', 'REAL_RETAINED_ADMIN_CLIENT_FAILED', 'REAL_RETAINED_ADMIN_REFERENCE_CHANGED', 'REAL_RETAINED_ADMIN_REFERENCE_DIFFERS', 'REAL_RETAINED_ADMIN_RESULT_BOUND', 'REAL_RETAINED_CAPTURE_SOURCE_DIFFERS', 'REAL_RETAINED_CAPTURE_WINDOW_EXPIRED', 'REAL_RETAINED_FIXED_ADMIN_QUERY_REQUIRED', 'REAL_RETAINED_NEW_BOOT_BINDING_DIFFERS', 'REAL_RETAINED_NEW_BOOT_REQUIRED', 'REAL_RETAINED_PREEXISTING_CHILDREN'] or re.fullmatch('REAL_RETAINED_ADMIN_SQLSTATE_[0-9A-Z]{5}',str(error))) else None
 return {'stage':stage,'exceptionClass':type(error).__name__ if type(error).__name__ in classes else 'Exception','code':code,'frames':[{'file':Path(f.filename).name,'line':f.lineno} for f in traceback.extract_tb(error.__traceback__)],'automaticRetry':False}

def inside_production_factory(authority):
 import types
 raw=read_file(Path('/etc/naijue-erp/fresh35-isolated-deployment-v1.json'),2*1024*1024);need(sha(raw)==MANIFEST_SHA,'REAL_DEPLOYMENT_MANIFEST_DIFFERS');pins={v['path']:v['sha256'] for v in strict(raw)['files']}
 modules=[]
 for filename in ['launch-fresh35-isolated-v1.py','launch-fresh35-production-v2.py']:
  path=Path(DEPLOY)/'scripts/release/unified-install'/filename;raw=read_file(path,262144);need(sha(raw)==pins[str(path.relative_to(DEPLOY))],'REAL_ORIGINAL_CONTROLLER_SOURCE_DIFFERS')
  module=types.ModuleType('original_real_'+filename.replace('-','_'));module.__file__=str(path);exec(compile(raw,str(path),'exec'),module.__dict__);modules.append(module)
 factory=modules[1];factory.core=modules[0];factory.validate_provision(authority,authority['startsAt']);assert_first_proposal(authority)
 return factory

def real_inside(description):
 import select,signal,sys
 work=None;controller=None;controller_verified=False
 lifecycle={'stage':'CONTEXT','nodeAttempted':False,'childReaped':True}
 try:
  need(sys.platform=='linux' and os.getuid()==0 and sys.flags.isolated and sys.flags.no_site,'REAL_ROOT_ISOLATED_PYTHON_REQUIRED')
  lifecycle['stage']='PROVISION'
  a=strict(read_file(Path('/etc/naijue-erp/fresh35-production-provision-v2.json'),65536,True));work=Path(a['proposal']['workspaceDirectory'])
  # Reuse the pinned V2 factory without main or any SQL. All caller credentials
  # are pre-existing private inputs, not generated/reset by this operation.
  lifecycle['stage']='FACTORY_INPUTS'
  factory=inside_production_factory(a)
  target=strict(read_file(work/'target-binding.json',1048576,True));program=strict(read_file(work/'program-description.json',1048576,True));install=strict(read_file(work/'installation-result.json',65536,True));record=read_file(Path('/etc/naijue-erp/fresh35-combined-installation-v1.json'),1048576)
  lifecycle['stage']='RETENTION'
  factory.assert_retention(a,target,program,install,record)
  need(description['sourceSetSha256']==SOURCE==a['sourceSetSha256'] and description['targetSha256']==program['targetSha256'] and description['programSha256']==program['programSha256'] and description['installationRecordSha256']==sha(record) and description['manifestSha256']==REAL_MANIFEST,'REAL_EXACT_TARGET_INPUT_BINDING_DIFFERS')
  if description['mode']=='READONLY_STATUS':
   lifecycle.update(nodeAttempted=True,childReaped=False,stage='READONLY_STATUS')
   return real_readonly_status_inside(description,a,work,program,record,factory)
  lifecycle['stage']='CONTROLLER'
  generation=None
  recovered=os.path.lexists(RECOVERY_BOOT)
  expected=globals().get('_REAL_RECOVERY_EXPECTED')
  need(recovered==(expected is not None),'REAL_RECOVERY_HOST_GENERATION_DIFFERS')
  if recovered:
   generation=read_recovery_generation(RECOVERY_BOOT,work,a,record,program['targetSha256'])
   need(sha(generation['raw'])==expected and real_process_matches(generation['postmaster']),
        'REAL_RECOVERY_HOST_RECEIPT_OR_POSTMASTER_DIFFERS')
  boot=RECOVERY_BOOT if recovered else RETAINED_BOOT
  entry=RECOVERY_BOOT/'entry.py' if recovered else RETAINED_ENTRY
  need((boot/'observed-epoch.json').is_file(),'REAL_RETAINED_NEW_BOOT_REQUIRED')
  controller=strict(read_file(boot/'controller-process.json',65536,True));need(real_process_matches(controller),'REAL_ORIGINAL_CONTROLLER_LOST')
  argv=(Path('/proc')/str(controller['pid'])/'cmdline').read_bytes().split(b'\0')
  need([v.decode() for v in argv if v][-3:]==['-I','-S',str(entry)],'REAL_ORIGINAL_CONTROLLER_ARGUMENTS_DIFFER')
  controller_verified=True
  lifecycle['stage']='PARAMETERS'
  parameters=real_operation_parameters(description,a,work,program,record,generation)
  lifecycle['stage']='RUN_PRECHILD'
  return real_inside_run(description,work,controller,factory,lifecycle,parameters,a['proposal'],generation)
 except BaseException as error:
  diagnostic=real_failure_details(error,lifecycle['stage'])
  ledger=REAL_ROOT/'nonroot-access'/description['requestKey'];diagnostic_persisted=False
  try:new_json(ledger/'inside-failure-diagnostic.json',diagnostic);diagnostic_persisted=True
  except BaseException:pass
  cleanup={'controllerStopped':False,'cleanupComplete':False,'transactionRollbackProven':False}
  if controller_verified:
   try:cleanup=real_stop_controller(work,controller)
   except BaseException:pass
  never_started=lifecycle['nodeAttempted'] is False
  guard={'guard':'STOPPED_OUTCOME_UNKNOWN','childNeverStarted':never_started,'childReaped':never_started or lifecycle['childReaped'] is True,'transactionRollbackProven':False,'automaticRetry':False}
  result={'status':'STOPPED_OUTCOME_UNKNOWN','requestKey':description['requestKey'],'reason':diagnostic['code'] or diagnostic['exceptionClass'],'diagnostic':diagnostic,'guard':guard,'originalControllerCleanup':cleanup,'automaticRetry':False,'transactionOutcomeInferredFromCleanup':False,'formalBusinessAcceptance':False,'diagnosticPersisted':diagnostic_persisted}
  try:
   new_json(ledger/'inside-failure.json',result);result['diagnosticPersisted']=True
  except BaseException:pass
  return result

from contextlib import contextmanager

REAL_RETAINED_PROOF_SHA = '49a9d3e2d3ad9814a7543ecb4cdfc190308df84bde19a22a3ec24af5db51c7d1'


def real_retained_admin_observer(factory, work, module, proposal):
 def observe(query, seconds):
  need(query == module.ADMIN_SQL and type(seconds) in (int, float) and 0 < seconds <= 8,
       'REAL_RETAINED_FIXED_ADMIN_QUERY_REQUIRED')
  credential = trusted(work/'credentials'/(proposal['admin']+'.pgpass'))
  before = credential.lstat()
  need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
       and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600,
       'REAL_RETAINED_ADMIN_REFERENCE_DIFFERS')
  environment = factory.core.clean_env(work, proposal['admin'])
  environment['PGPASSFILE'] = str(credential)
  result = subprocess.run([str(factory.core.BIN/'psql'), '-X', '-qAt', '--no-password',
      '--host', proposal['host'], '--port', str(proposal['port']), '--dbname', proposal['database'],
      '--username', proposal['admin'], '--set', 'ON_ERROR_STOP=1',
      '--set', 'VERBOSITY=sqlstate'], input=query.encode(), capture_output=True,
      env=environment, timeout=seconds)
  after = credential.lstat()
  fields = ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size',
            'st_mtime_ns','st_ctime_ns')
  need(tuple(getattr(before,k) for k in fields) == tuple(getattr(after,k) for k in fields),
       'REAL_RETAINED_ADMIN_REFERENCE_CHANGED')
  if result.returncode:
   codes = re.findall(rb'(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)',result.stderr)
   raise ValueError('REAL_RETAINED_ADMIN_SQLSTATE_'+codes[-1].decode()
                    if codes else 'REAL_RETAINED_ADMIN_CLIENT_FAILED')
  need(0 < len(result.stdout) <= 65536, 'REAL_RETAINED_ADMIN_RESULT_BOUND')
  return strict(result.stdout)
 return observe


@contextmanager
def real_retained_capture(description, parameters, work, controller, factory, operation, proposal, generation=None):
 import types, datetime
 source = globals().get('_REAL_RETAINED_SOURCE')
 need(type(source) is str and sha(source.encode()) == REAL_RETAINED_PROOF_SHA,
      'REAL_RETAINED_CAPTURE_SOURCE_DIFFERS')
 module = types.ModuleType('original_retained_backends')
 exec(compile(source,'<original-retained-backends>','exec'),module.__dict__)
 ref = parameters.get('restartReceipt')
 expected_path = '/etc/naijue-erp/fresh35-retained-restart-v1.json' if generation is None else str(RECOVERY_RECEIPT)
 need(type(ref) is dict and ref.get('path') == expected_path, 'REAL_FIXED_RESTART_RECEIPT_REQUIRED')
 raw = read_file(Path(expected_path),65536,generation is not None)
 need(sha(raw) == ref['sha256'], 'REAL_RESTART_RECEIPT_CHANGED')
 restart = strict(raw)
 boot = RETAINED_BOOT if generation is None else RECOVERY_BOOT
 observed = strict(read_file(boot/'observed-epoch.json',65536,True))
 postmaster = strict(read_file(boot/'owned-process.json',65536,True))
 need(strict(read_file(boot/'controller-process.json',65536,True)) == controller
      and observed['process'] == postmaster and observed['receiptSha256'] == ref['sha256'],
      'REAL_RETAINED_NEW_BOOT_BINDING_DIFFERS')
 until = lambda value: int(datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()*1000)
 if generation is None:
  intent = first_restart_intent(work,restart,parameters['authorizationReference'])
  need(observed['newPhysical'] == restart['newPhysical']
       and intent['authorizationReference'] == parameters['authorizationReference'],
       'REAL_RETAINED_NEW_BOOT_BINDING_DIFFERS')
  caps = (intent['guardianExpiresAt'],until(parameters['adminLoginValidUntil']),
          until(parameters['controllerLoginValidUntil']))
 else:
  need(raw == generation['raw'] and postmaster == generation['postmaster']
       and not os.path.lexists(boot/'cleanup.json')
       and not os.path.lexists(boot.parent/'same-data-custody/credential-cleanup.json'),
       'REAL_RECOVERY_GENERATION_CHANGED')
  caps = (restart['guardianExpiresAt']-30000,until(restart['adminLoginValidUntil']),
          until(restart['controllerLoginValidUntil']),until(restart['runtimeLoginValidUntil']))
 expires = min(description['expiresAt'],parameters['expiresAt'],parameters['authorizationExpiresAt'],
               restart['serviceLeaseExpiresAt'],*caps)
 need(type(restart['checkedAt']) is int and restart['checkedAt'] <= time.time()*1000 < expires,
      'REAL_RETAINED_CAPTURE_WINDOW_EXPIRED')
 bindings = {'requestKey':description['requestKey'],
             'operationParametersSha256':description['operationParametersSha256'],
             'installationRecordSha256':description['installationRecordSha256'],
             'restartReceiptSha256':ref['sha256'],
             'currentSourceSetSha256':parameters['currentSourceSetSha256'],'expiresAt':expires}
 if generation is not None and description['mode']=='EXECUTE':
  bindings['originalImportAuthoritySha256']=description['originalImportAuthoritySha256']
 with module.capture(operation,bindings,controller,postmaster,restart['newPhysical'],
                     real_retained_admin_observer(factory,work,module,proposal),proposal['admin'],
                     restart_raw=None if generation is None else raw) as proof:
  yield proof


def real_reap_node_descendants(child, factory):
 # Reuse the original per-process Linux subreaper/direct-child primitive. Only
 # this carrier's actual adopted children in the Node session can be signalled.
 import signal
 deadline = time.monotonic()+20
 try:
  need(child.poll() is not None, 'REAL_NODE_PARENT_NOT_REAPED')
  while True:
   children = factory.core.direct_child_pids()
   if not children:return True
   need(time.monotonic() < deadline, 'REAL_NODE_DESCENDANT_DEADLINE')
   for pid in children:
    def owned():
     path=Path('/proc')/str(pid)
     fields=(path/'stat').read_text().rsplit(')',1)[1].split()
     uid=re.search(r'^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$',
                   (path/'status').read_text(),re.M)
     need(int(fields[1]) == os.getpid() and int(fields[2]) == child.pid
          and int(fields[3]) == child.pid and uid is not None
          and all(int(x) == 61035 for x in uid.groups()), 'REAL_NODE_DESCENDANT_IDENTITY_DIFFERS')
    owned()
    reaped,_=os.waitpid(pid,os.WNOHANG)
    need(reaped in (0,pid), 'REAL_NODE_DESCENDANT_WAIT_DIFFERS')
    if reaped == pid:continue
    for sig,seconds in [(signal.SIGTERM,1),(signal.SIGKILL,2)]:
     owned();os.kill(pid,sig)
     until=min(deadline,time.monotonic()+seconds)
     while True:
      reaped,_=os.waitpid(pid,os.WNOHANG)
      need(reaped in (0,pid), 'REAL_NODE_DESCENDANT_WAIT_DIFFERS')
      if reaped == pid or time.monotonic() >= until:break
      time.sleep(.02)
     if reaped == pid:break
    need(reaped == pid, 'REAL_NODE_DESCENDANT_EXIT_UNCONFIRMED')
 except Exception:return False


def real_inside_run(description,work,controller,factory,lifecycle,parameters,proposal,generation=None):
 import select,signal,sys
 root=REAL_OPERATION_SUCCESSOR_ROOT if generation is None else REAL_RECOVERY_OPERATION[1]
 need(sha(read_file(REAL_ROOT/'package/manifest.json',2*1024*1024))==REAL_MANIFEST and sha(read_file(REAL_ROOT/'initialize-admin.json',65536,True))==REAL_ADMIN_SHA,'REAL_EXISTING_INPUT_DIFFERS')
 for name in ['target.json','controller-connection.json','initial-admin-scrypt.secret']:
  p=trusted(REAL_ROOT/name);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and 0<s.st_size<=65536 and not s.st_mode&0o077,'REAL_PRIVATE_EXISTING_INPUT_REQUIRED')
 if description['registrationSha256'] is not None:need(sha(read_file(REAL_ROOT/'registration.json',65536,True))==description['registrationSha256'],'REAL_REGISTRATION_DIFFERS')
 # Approval bytes and paired hashes are checked by the original public CLI;
 # do not add a second materialization of large historical evidence here.
 observation=real_access_observation(description)
 need(observation is not None and observation['phase']=='active','REAL_EXACT_ACTIVE_ACCESS_REQUIRED')
 for name in description['approvals']:
  p=trusted(REAL_ROOT/'approvals'/REAL_APPROVAL_FILENAMES[name]);need(str(ROOT/'state/real-first-20261109-r1/approvals'/p.name) in observation['entries'],'REAL_APPROVAL_ACCESS_LEDGER_REQUIRED');s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size>0 and s.st_uid==0 and s.st_gid==61035 and stat.S_IMODE(s.st_mode)==0o440,'REAL_EXISTING_APPROVAL_REQUIRED')
 reports=REAL_ROOT/'reports';temporary=REAL_ROOT/'tmp';scratch=REAL_ROOT/'sqlite-scratch'
 expected={'data':work/'data','wal':work/'data/pg_wal','reportIndex':reports,'tmp':temporary,'sqliteScratch':scratch}
 need({k:v['path'] for k,v in description['volumes'].items()}=={k:str(v) for k,v in expected.items()},'REAL_FIXED_VOLUME_PATHS_REQUIRED')
 operation=reports/description['requestKey'];operation.mkdir(mode=0o711);syncdir(reports);runtime=operation/'runtime';runtime.mkdir(mode=0o700);os.chown(runtime,61035,61035);report=runtime/'stream'
 # O_EXCL leaf is also the durable no-replay intent; preserve it and all partial
 # SQLite/index/graph/report data after every failure. No auto resume or removal.
 new_json(operation/'ops-intent.json',description)
 outfd=os.open(operation/'stream.stdout',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);errfd=os.open(operation/'stream.stderr',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 child=None;identity=None;outcome=None;proof_context=None;proof_entered=False
 def interrupted(*_):raise ValueError('REAL_GUARD_INTERRUPTED')
 for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,interrupted)
 def parent_alive():return not (select.select([sys.stdin],[],[],0)[0] and os.read(sys.stdin.fileno(),1)==b'')
 try:
  need(parent_alive(),'REAL_ORIGINAL_CALLER_LOST')
  environment=factory.core.clean_env(work);worker_tmp=temporary/description['requestKey'];worker_tmp.mkdir(mode=0o700);os.chown(worker_tmp,61035,61035);worker_scratch=scratch/description['requestKey'];worker_scratch.mkdir(mode=0o700);os.chown(worker_scratch,61035,61035);environment.update(TMPDIR=str(worker_tmp),SQLITE_TMPDIR=str(worker_scratch))
  original_deadline=time.monotonic()+max(0,description['expiresAt']/1000-time.time())
  factory.core.enable_child_subreaper();need(not factory.core.direct_child_pids(),'REAL_RETAINED_PREEXISTING_CHILDREN')
  lifecycle['stage']='RETAINED_ADMIN_CAPTURE'
  proof_context=real_retained_capture(description,parameters,work,controller,factory,operation,proposal,generation)
  proof_environment,proof_fds=proof_context.__enter__();proof_entered=True
  environment.update(proof_environment)
  sample_began=time.monotonic();initial_values=real_volume_sample(description['volumes'],starting=True);initial_sample_at=time.monotonic()
  need(initial_sample_at-sample_began<=.25,'REAL_SPACE_SAMPLE_LATE')
  lifecycle.update(stage='NODE_CREATE',nodeAttempted=True,childReaped=False)
  child=subprocess.Popen(real_cli_command(description,report,root),stdin=subprocess.DEVNULL,stdout=outfd,stderr=errfd,cwd=root,env=environment,user=61035,group=61035,extra_groups=[],start_new_session=True,pass_fds=proof_fds)
  lifecycle['stage']='NODE_RUN'
  if child.poll() is None:
   identity=factory.core.process_identity(child.pid);need(identity['exe']==DEPLOY+'/runtime/node/bin/node' and real_process_matches(identity),'REAL_STREAM_CHILD_IDENTITY_DIFFERS')
  outcome=real_watch(child,identity,description,controller,work,parent_alive,report,initial_sample_at,initial_values,original_deadline)
 except BaseException as error:
  reaped=(not lifecycle['nodeAttempted']) if child is None else real_stop_child(child,identity)
  try:cleanup=real_stop_controller(work,controller)
  except Exception:cleanup={'cleanupComplete':False,'transactionRollbackProven':False}
  outcome={'guard':'STOPPED_OUTCOME_UNKNOWN','reason':str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__,'childReaped':reaped,'originalControllerCleanup':cleanup,'automaticRetry':False,'transactionRollbackProven':False}
 finally:
  if proof_entered:
   parent_reaped=(not lifecycle['nodeAttempted']) if child is None else real_stop_child(child,identity)
   descendants_reaped=parent_reaped and (not factory.core.direct_child_pids() if child is None else real_reap_node_descendants(child,factory))
   if parent_reaped and descendants_reaped:
    proof_context.__exit__(None,None,None)
   else:
    # Unknown reaping retains descriptors for the remaining carrier lifetime.
    # No secret/input restoration or child-cleanup PASS is allowed in that case.
    globals().setdefault('_REAL_PENDING_RETAINED_CONTEXTS',[]).append(proof_context)
   if outcome is not None:
    outcome['nodeParentReaped']=parent_reaped;outcome['nodeDescendantsReaped']=descendants_reaped
    outcome['childReaped']=parent_reaped and descendants_reaped
    if not outcome['childReaped']:
     outcome.update(guard='STOPPED_OUTCOME_UNKNOWN',reason='REAL_NODE_DESCENDANTS_NOT_REAPED')
     outcome['originalControllerCleanup']=real_stop_controller(work,controller)
  os.close(outfd);os.close(errfd)
 lifecycle.update(stage='NODE_RESULT',childReaped=outcome.get('childReaped') is True)
 try:cli=real_safe_cli_result(read_file(operation/'stream.stdout',65536,True)) if outcome.get('childReaped') and 0<(operation/'stream.stdout').stat().st_size<=65536 else {'state':'UNKNOWN','verification':'UNKNOWN','connectionCleanup':'UNKNOWN'}
 except Exception:cli={'state':'UNKNOWN','verification':'UNKNOWN','connectionCleanup':'UNKNOWN'}
 # No persistent process-record I/O while an active Node is waiting for its
 # first sample. Preserve any real COMMIT ACK even if this later write fails.
 if identity is not None and outcome.get('childReaped'):
  try:new_json(operation/'stream-process.json',identity)
  except BaseException as error:
   outcome.update(guard='STOPPED_OUTCOME_UNKNOWN',reason=type(error).__name__)
   outcome['originalControllerCleanup']=real_stop_controller(work,controller)
 if 'binding' in cli:
  b=cli['binding'];need(all(b[k]==description[k] for k in ['installationRecordSha256','sourceSetSha256','targetSha256','manifestSha256']) and b['installProgramSha256']==description['programSha256'],'REAL_PREPARED_OUTPUT_BINDING_DIFFERS')
 in_window=outcome['guard']=='COMPLETED' and int(time.time()*1000)<description['expiresAt'] and time.monotonic()<original_deadline
 good=in_window and outcome['exitCode']==0 and cli['connectionCleanup']=='CLOSED' and cli.get('localCleanup')!='FAILED' and ((description['mode']=='PREPARE' and cli['state']=='PRODUCTION_REAL_IMPORT_PREPARED' and cli.get('businessDatabaseWrites') is False and cli['verification']=='NOT_RUN') or (description['mode']=='EXECUTE' and cli['state'] in ['COMMITTED','ALREADY_COMMITTED'] and cli['verification']=='VERIFIED') or (description['mode']=='INSPECT' and cli['state'] in ['COMMITTED_RECEIPT_FOUND','ABSENT'] and cli['verification']=='NOT_RUN'))
 if not good and outcome['guard']=='COMPLETED':
  if not in_window:outcome['reason']='REAL_RESULT_AFTER_ORIGINAL_WINDOW'
  outcome['guard']='STOPPED_OUTCOME_UNKNOWN';outcome['originalControllerCleanup']=real_stop_controller(work,controller)
 result={'status':'REAL_PREPARED_EXACT_BINDING_ONLY' if good and description['mode']=='PREPARE' else 'REAL_ORIGINAL_KEY_INSPECTED_READ_ONLY' if good and description['mode']=='INSPECT' else 'REAL_COMMITTED_AND_READBACK_VERIFIED' if good else 'STOPPED_OUTCOME_UNKNOWN','mode':description['mode'],'requestKey':description['requestKey'],'sourceSetSha256':SOURCE,'targetSha256':description['targetSha256'],'installationRecordSha256':description['installationRecordSha256'],'guard':outcome,'cli':cli,'automaticRetry':False,'transactionOutcomeInferredFromCleanup':False,'formalBusinessAcceptance':False}
 result['currentOperationSourceSetSha256']=parameters['currentSourceSetSha256'];result['operationParametersSha256']=description['operationParametersSha256']
 new_json(operation/'ops-result.json',result);return result

def real_execution_description(path,digest):
 raw=read_file(job_input(path),65536,True);need(sha(raw)==digest,'REAL_EXECUTION_DESCRIPTION_DIFFERS');description=strict(raw)
 base={'format','requestKey','sourceSetSha256','manifestSha256','targetSha256','programSha256','installationRecordSha256','startsAt','expiresAt','mode'}
 readonly=type(description) is dict and description.get('mode')=='READONLY_STATUS'
 fields=base|({'originalWriterJobKey','originalWriterReceiptSha256','originalImportAuthoritySha256'} if readonly else {'volumes','registrationSha256','approvals','operationParametersSha256','accessPlanSha256'})
 if type(description) is dict and description.get('mode')=='EXECUTE' and 'originalImportAuthoritySha256' in description:
  fields.add('originalImportAuthoritySha256')
 need(type(description) is dict and set(description)==fields and description['format']==('FRESH35_PRODUCTION_REAL_STATUS_OPS_V1' if readonly else 'FRESH35_PRODUCTION_REAL_STREAM_OPS_V2'),'REAL_EXECUTION_DESCRIPTION_REQUIRED')
 key=description['requestKey']
 match=re.fullmatch(FIRST_REAL_KEY,key) if type(key) is str else None
 need(match is not None and description['requestKey']==Path(os.environ['ERP_SHARED_JOB_DIR']).name
      and match[1].upper()==('INSPECT' if readonly else description['mode']),
      'REAL_ORIGINAL_OPERATION_KEY_REQUIRED')
 need(description['mode'] in ['PREPARE','EXECUTE','INSPECT','READONLY_STATUS'],'REAL_CLOSED_MODE_REQUIRED')
 need(type(description['startsAt']) is int and type(description['expiresAt']) is int and description['startsAt']<=int(time.time()*1000)<description['expiresAt']<=description['startsAt']+(3600000 if description['mode']=='PREPARE' else 2700000 if description['mode']=='EXECUTE' else 1200000),'REAL_BOUNDED_ORIGINAL_WINDOW_REQUIRED')
 need(all(type(description[k]) is str and re.fullmatch('[a-f0-9]{64}',description[k]) for k in ['sourceSetSha256','manifestSha256','targetSha256','programSha256','installationRecordSha256']),'REAL_EXACT_INPUT_PINS_REQUIRED')
 if readonly:
  need(all(type(description[k]) is str and re.fullmatch('[a-f0-9]{64}',description[k]) for k in ['originalWriterReceiptSha256','originalImportAuthoritySha256']),'ORIGINAL_WRITER_BINDING_REQUIRED')
  description={**description,'originalWriterProof':real_writer_terminal(description)}
 else:
  need(type(description['operationParametersSha256']) is str and re.fullmatch('[a-f0-9]{64}',description['operationParametersSha256']),'REAL_EXACT_OPERATION_PARAMETERS_PIN_REQUIRED')
  need(type(description['accessPlanSha256']) is str and re.fullmatch('[a-f0-9]{64}',description['accessPlanSha256']),'REAL_NONROOT_ACCESS_PLAN_REQUIRED')
  if 'originalImportAuthoritySha256' in description:
   pin=description['originalImportAuthoritySha256']
   need(type(pin) is str and re.fullmatch('[a-f0-9]{64}',pin),'REAL_ORIGINAL_IMPORT_AUTHORITY_PIN_REQUIRED')
  need(type(description['approvals']) is dict and set(description['approvals'])<=REAL_APPROVALS and all(type(v) is str and re.fullmatch('[a-f0-9]{64}',v) for v in description['approvals'].values()) and (description['registrationSha256'] is None or re.fullmatch('[a-f0-9]{64}',description['registrationSha256'])),'REAL_ORIGINAL_APPROVAL_INPUTS_REQUIRED')
  need(type(description['volumes']) is dict and set(description['volumes'])==REAL_VOLUME_NAMES,'REAL_ALL_PHYSICAL_VOLUMES_REQUIRED')
  for v in description['volumes'].values():
   need(type(v) is dict and set(v)=={'path','device','directoryInode','namespace','mount','physicalVolume'} and type(v['device']) is int and v['device']>=0 and type(v['directoryInode']) is int and v['directoryInode']>0 and type(v['physicalVolume']) is str and 0<len(v['physicalVolume'])<=128,'REAL_ACTUAL_VOLUME_BINDING_REQUIRED')
 return raw,description

def real_execution_facts(plan,description):
 facts=production_facts(plan);need(facts['status']=='DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL','REAL_RETAINED_PRODUCTION_REQUIRED')
 need(facts['sharedPostgresNamespace']['targetSha256']==description['targetSha256'] and facts['sharedPostgresNamespace']['installationRecordSha256']==description['installationRecordSha256'],'REAL_CARRIER_TARGET_DIFFERS')
 recovery=facts.get('currentRecovery')
 if description['mode']=='READONLY_STATUS':
  need(recovery is None,'READONLY_STATUS_ORIGINAL_V1_GENERATION_REQUIRED')
 else:
  need(('originalImportAuthoritySha256' in description)==(recovery is not None and description['mode']=='EXECUTE'),
       'REAL_ORIGINAL_IMPORT_AUTHORITY_PIN_SCOPE_DIFFERS')
 return facts

def production_real_with_prepared_inputs(plan,description,digest,facts):
 readonly=description['mode']=='READONLY_STATUS'
 recovery=facts.get('currentRecovery')
 need(int(time.time()*1000)<description['expiresAt'],'REAL_BOUNDED_ORIGINAL_WINDOW_REQUIRED')
 # The same registered ops leaf runs INSIDE the existing owned PID/mount
 # namespace. It owns Node directly, rather than just killing docker exec.
 bootstrap="import sys,json,hashlib;v=json.loads(sys.stdin.buffer.readline());assert hashlib.sha256(v['source'].encode()).hexdigest()==v['sourceSha256'];g={'__name__':'registered_real_ops','__file__':'<registered-real-ops>','_REAL_ACCESS_INSIDE':True,'_REAL_RETAINED_SOURCE':v['retainedSource'],'_REAL_RECOVERY_EXPECTED':v['recoveryReceiptSha256'],'_REAL_ACCESS_EXPECTED':(v['description'].get('accessPlanSha256'),v['accessDescriptionSha256']) if v['description'].get('mode')!='READONLY_STATUS' else None};exec(compile(v['source'],g['__file__'],'exec'),g);print(json.dumps(g['real_inside'](v['description'])),flush=True)"
 retained_source=b'' if readonly else read_file(Path(os.environ['ERP_SHARED_JOB_DIR'])/'bundle/retained_backends.py',65536,True)
 if not readonly:need(sha(retained_source)==REAL_RETAINED_PROOF_SHA,'REAL_RETAINED_CAPTURE_SOURCE_DIFFERS')
 source=Path(__file__).read_text();packet=(json.dumps({'source':source,'sourceSha256':plan['opsSourceSha256'],'description':description,'accessDescriptionSha256':digest,'retainedSource':retained_source.decode(),'recoveryReceiptSha256':None if recovery is None else recovery['receiptSha256']})+'\n').encode()
 child=subprocess.Popen(['docker','exec','-i','--user','0:0',facts['cid'],'/usr/bin/python3','-I','-S','-c',bootstrap],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 raw=b'';err=b''
 try:
  child.stdin.write(packet);child.stdin.flush()
  deadline=time.monotonic()+max(0,description['expiresAt']/1000-time.time())+45
  while child.poll() is None and time.monotonic()<deadline:time.sleep(.1)
  child.stdin.close();child.stdin=None
  try:raw,err=child.communicate(timeout=40)
  except subprocess.TimeoutExpired:
   child.terminate()
   try:child.wait(timeout=3)
   except subprocess.TimeoutExpired:child.kill();child.wait(timeout=3)
   raise ValueError('REAL_OPS_TRANSPORT_OUTCOME_UNKNOWN')
 finally:
  if child.stdin is not None:child.stdin.close()
  if child.poll() is None:
   try:child.wait(timeout=40)
   except subprocess.TimeoutExpired:
    child.terminate()
    try:child.wait(timeout=3)
    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=3)
 need(child.returncode==0 and 0<len(raw)<=65536,'REAL_OPS_RESULT_UNKNOWN_ORIGINAL_KEY_ONLY')
 return strict(raw)

def production_real(plan,path,digest):
 raw,description=real_execution_description(path,digest)
 facts=real_execution_facts(plan,description)
 if description['mode']=='READONLY_STATUS':return production_real_with_prepared_inputs(plan,description,digest,facts)
 job=Path(os.environ['ERP_SHARED_JOB_DIR']);access_source=read_file(job/'bundle/nonroot_input_access.py',65536,True)
 need(sha(access_source)=='d60497f589988c56d8a8dfcbff49095418b7ec8774db232ad6c13e6861c6b0db','REAL_FIXED_NONROOT_SOURCE_DIFFERS')
 import types
 access=types.ModuleType('exact_nonroot_input_access');exec(compile(access_source,'<exact-nonroot-access>','exec'),access.__dict__)
 access_raw=read_file(job/'bundle/nonroot-access-plan.json',65536,True);need(sha(access_raw)==description['accessPlanSha256'],'REAL_C_BOUND_NONROOT_PLAN_DIFFERS');access_plan=strict(access_raw)
 shared_real_package_binding()
 helper_path=job/'bundle/real_access_consumer.py';helper_raw=read_file(helper_path,65536,True);need(sha(helper_raw)==REAL_ACCESS_CONSUMER_SHA,'REAL_ACCESS_CONSUMER_SOURCE_CHANGED')
 consumer=types.ModuleType('fixed_access_metadata');consumer.__file__=str(helper_path);exec(compile(helper_raw,str(helper_path),'exec'),consumer.__dict__)
 ledger=ROOT/'state/real-first-20261109-r1/nonroot-access'/description['requestKey']
 try:access.prepare(access_plan,ledger,consumer,raw,access_raw,read_file)
 except BaseException:
  if (ledger/'before.json').is_file():access.restore(access_plan,ledger,True,consumer,read_file)
  raise
 globals()['_REAL_ACCESS_EXPECTED']=(description['accessPlanSha256'],digest)
 try:result=production_real_with_prepared_inputs(plan,description,digest,facts)
 except BaseException as error:
  diagnostic=real_failure_details(error,'OUTER_TRANSPORT')
  try:new_json(ledger/'outer-failure.json',{'diagnostic':diagnostic,'nodeOutcome':'UNKNOWN','inputMetadataRestored':False,'automaticRetry':False})
  except BaseException:pass
  raise
 finally:globals().pop('_REAL_ACCESS_EXPECTED',None)
 reaped=result.get('guard',{}).get('childReaped') is True
 if reaped:
  access.restore(access_plan,ledger,True,consumer,read_file);result['originalInputMetadataRestored']=True;result['projectedSecretsRetired']=True
 else:result['originalInputMetadataRestored']=False;result['projectedSecretsRetired']=False
 return result

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--phase',choices=sorted(R3_JOB_KEYS),required=True)
 parser.add_argument('--plan',required=True);parser.add_argument('--plan-sha256',required=True)
 parser.add_argument('--external-input');parser.add_argument('--external-sha256')
 parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 need(args.execute,'EXPLICIT_EXECUTION_NOT_REQUESTED')
 need(os.getuid()==os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_DISPATCHER_REQUIRED')
 os.umask(0o077)
 job=trusted(Path(os.environ['ERP_SHARED_JOB_DIR']))
 need(job.parent==PRIVATE and job.name in R3_JOB_KEYS[args.phase],'EXACT_R3_PHASE_JOB_REQUIRED')
 plan=load_production_plan(args.plan,args.plan_sha256)
 try:
  if args.phase=='production-facts':
   need(args.external_input is None and args.external_sha256 is None,'EXACT_R3_READONLY_ARGUMENTS_REQUIRED')
   result=describe_r3(plan)
  else:
   need(args.external_input and args.external_sha256,'EXACT_R3_EXTERNAL_INPUT_REQUIRED')
   if args.phase=='materialize-app':
    result=materialize_r3(plan,args.external_input,args.external_sha256)
   elif args.phase=='production-start':
    result=production_start(plan,args.external_input,args.external_sha256)
   elif args.phase in ('production-entry','production-install'):
    result=production_delivery(plan,args.external_input,args.external_sha256,args.phase)
   else:
    result=production_recovery_phase(plan,args.external_input,args.external_sha256,'stop')
 except Exception as error:
  code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
  result={'status':'STOP_OR_UNKNOWN_NO_REPLAY','phase':args.phase,'errorCode':code}
  if args.phase=='production-start':
   try:
    recover_production_carrier(plan);result['productionReadback']=production_facts(plan)
   except Exception as recovery:
    result['productionReadback']='UNCONFIRMED_'+type(recovery).__name__
 new_json(job/'results'/('fresh35-'+args.phase+'-result.json'),result)
 need(result['status']!='STOP_OR_UNKNOWN_NO_REPLAY','OPERATION_NOT_CONFIRMED')

if __name__=='__main__':
 try:main()
 except Exception as error:
  code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__
  print(json.dumps({'status':'STOP_NO_REPLAY','errorCode':code}));raise SystemExit(2)
