#!/usr/bin/python3
"""Scoped successor of the retained provision_schema_target.py.
Inert on import. Only the original T45 dispatcher executes --execute after the
actual environment permission. A plan/hash is configuration, not an approval.
No approval, DB window, installation record or source guard is manufactured.
"""
import argparse, datetime, hashlib, io, json, os, re, stat, subprocess, tarfile, time
from pathlib import Path, PurePosixPath

GRANT='5cc58239751e4e2a'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
PRIVATE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1')
NAME='t45-fresh35-deb13-20261105-r1'
BASE='docker.io/library/debian@sha256:7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392'
SOURCE='0e6b01ec154bd089dbfad61715cf194d339ed6e3bb56311bbd91971e5aa5cf2f'
ARCHIVE_SHA='b91bf14ebf482c607ed790580883274adea6e0d2f2a539d82236673a7e769920'
ARCHIVE_BYTES=70967936
FILE_COUNT=3717
MANIFEST_SHA='0028a358eb8745a25761aa4d85b44a67581d4191b54c70336fed0ef26e8c86cc'
LOCK_SHA='0aaf271430d37313a4e83ff58d8af7c58c36b3d38b629eca9b3cdfe1681f9e9b'
LIBPQ_SHA='f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d'
KEY='t45-f35-5b26-ordinary-20261105-01'
DEPLOY='/opt/naijue-erp/fresh35-combined-v1'
STATE='/var/lib/naijue-erp/fresh35-isolated'
WORK='cloud-pg-fresh35-20261105-r1'
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
 p=subprocess.run(args,input=data,capture_output=True,timeout=seconds)
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
 new_json(ROOT/'prepare-started.json',{'operationId':plan['operationId'],'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA})
 for n,data in files.items():
  p=ROOT/n;new_parents(p.parent);new_file(p,data,modes[n])
 # 0711 gives ordinary UID traversal to the public0644 record. Secret files stay
 # 0400/0600. A0700 authority parent would break the original ordinary host.
 for name,mode in [('authority',0o711),('state',0o755),('image-context',0o700)]:
  (ROOT/name).mkdir(mode=mode);os.chmod(ROOT/name,mode)
 new_file(ROOT/'authority/fresh35-isolated-deployment-v1.json',files['metadata/deployment-manifest.json'],0o400)
 return lock

def image_context(lock):
 ctx=ROOT/'image-context';need(len(lock['packages'])==84 and not lock['unresolved'],'EXACT_LOCK_REQUIRED');args=[]
 for p in lock['packages']:
  need(re.fullmatch('[a-z0-9][a-z0-9+.-]*',p['Package']) and re.fullmatch('[A-Za-z0-9+:.~_-]+',p['Version']),'LOCK_PACKAGE_INVALID')
  need(not p['Package'].startswith('postgresql'),'NO_PG_MAINTAINER_SCRIPTS');args.append(p['Package']+'='+p['Version'])
 # This is standard Debian signature verification; no custom repository/keyring,
 # unauthenticated option, pin rewrite or host apt operation.
 dockerfile=('FROM '+BASE+'\nARG DEBIAN_FRONTEND=noninteractive\n'
  'RUN printf "#!/bin/sh\\nexit 101\\n" > /usr/sbin/policy-rc.d && chmod 755 /usr/sbin/policy-rc.d\n'
  'COPY install-locked.sh /work/install-locked.sh\nCOPY locked-versions.txt /work/locked-versions.txt\nCOPY locked-deb-sha256.txt /work/locked-deb-sha256.txt\nRUN /bin/sh /work/install-locked.sh\n'
  'RUN groupadd --gid 61035 naijue_f35qa && useradd --uid 61035 --gid 61035 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --password "!" naijue_f35qa\n'
  'COPY deploy '+DEPLOY+'\nCOPY libpq.so.5.17 /work/libpq.so.5.17\n'
  'RUN test ! -e /usr/lib/x86_64-linux-gnu/libpq.so.5.17 && test ! -e /usr/lib/x86_64-linux-gnu/libpq.so.5 && install -m 644 /work/libpq.so.5.17 /usr/lib/x86_64-linux-gnu/libpq.so.5.17 && ln -s libpq.so.5.17 /usr/lib/x86_64-linux-gnu/libpq.so.5 && ldconfig\n'
  'COPY check_abi.py /work/check_abi.py\nRUN python3 /work/check_abi.py\n'
  'RUN mkdir -p /etc/naijue-erp '+STATE+'\nUSER 0:0\n')
 new_file(ctx/'locked-deb-sha256.txt',('\n'.join(x['SHA256'] for x in lock['packages'])+'\n').encode(),0o644)
 new_file(ctx/'locked-versions.txt',('\n'.join(x['Package']+' '+x['Version'] for x in lock['packages'])+'\n').encode(),0o644)
 install=("#!/bin/sh\nset -eu\napt-get -o APT::Update::Error-Mode=any update\n"
  +"apt-get --simulate --no-install-recommends --no-remove install "+' '.join(args)+" > /work/apt-simulation.txt\n"
  +"awk 'NR==FNR {v[$1]=$2; next} /^Inst / {n=$2; sub(/:.*/,\"\",n); x=$0; sub(/^[^(]*\\(/,\"\",x); split(x,a,\" \"); if (!(n in v) || (v[n] \"x\")!=(a[1] \"x\")) exit 9}' /work/locked-versions.txt /work/apt-simulation.txt\n"
  +"mkdir -p /work/debs/partial\napt-get -y --download-only -o Dir::Cache::archives=/work/debs --no-install-recommends --no-remove install "+' '.join(args)+"\nfor f in /work/debs/*.deb; do test -f \"$f\" || continue; h=$(sha256sum \"$f\"); h=${h%% *}; grep -Fx \"$h\" /work/locked-deb-sha256.txt >/dev/null || exit 9; done\n"
  +"apt-get -y --no-download -o Dir::Cache::archives=/work/debs --no-install-recommends --no-remove install "+' '.join(args)+"\n"
  +"dpkg-query -W -f='${Package} ${Version} ${db:Status-Status}\\n' "+' '.join(x['Package'] for x in lock['packages'])+" > /work/installed-versions.txt\n"
  +"awk 'NR==FNR {v[$1]=$2; next} {if (!( $1 in v) || (v[$1] \"x\")!=($2 \"x\") || $3!=\"installed\") exit 9; seen[$1]=1} END {for (n in v) if (!(n in seen)) exit 9}' /work/locked-versions.txt /work/installed-versions.txt\n")
 new_file(ctx/'install-locked.sh',install.encode(),0o644)
 new_file(ctx/'Dockerfile',dockerfile.encode(),0o644)
 # Copy only this new root's already verified public files, no symlink following.
 import shutil
 shutil.copytree(ROOT/'deploy',ctx/'deploy',symlinks=False)
 pq=read_file(ROOT/'deploy/runtime/pg/usr/lib/x86_64-linux-gnu/libpq.so.5.17',1024*1024);need(sha(pq)==LIBPQ_SHA,'LIBPQ_DIFFERS');new_file(ctx/'libpq.so.5.17',pq,0o644)
 abi=("import pathlib,subprocess,sys\nroot=pathlib.Path('"+DEPLOY+"')\nfiles=[root/'runtime/node/bin/node']+list((root/'runtime/pg/usr/lib/postgresql/17').rglob('*'))\nfor p in files:\n if not p.is_file():continue\n with p.open('rb') as f:magic=f.read(4)\n if magic!=b'\\x7fELF':continue\n r=subprocess.run(['/usr/bin/ldd',str(p)],capture_output=True,text=True)\n if r.returncode or 'not found' in r.stdout+r.stderr:sys.exit('ABI_DEPENDENCY_UNSATISFIED:'+str(p))\nprint('STANDARD_LDD_DEPENDENCIES_RESOLVED_NO_PG_START')\n")
 new_file(ctx/'check_abi.py',abi.encode(),0o644);return ctx

def inspect(cid):
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"memory":{{json .HostConfig.Memory}},"swap":{{json .HostConfig.MemorySwap}},"cpu":{{json .HostConfig.NanoCpus}},"pids":{{json .HostConfig.PidsLimit}},"caps":{{json .HostConfig.CapAdd}},"capDrop":{{json .HostConfig.CapDrop}},"security":{{json .HostConfig.SecurityOpt}},"pidMode":{{json .HostConfig.PidMode}},"ipcMode":{{json .HostConfig.IpcMode}},"usernsMode":{{json .HostConfig.UsernsMode}},"labels":{{json .Config.Labels}},"privileged":{{json .HostConfig.Privileged}},"devices":{{json .HostConfig.Devices}},"restart":{{json .HostConfig.RestartPolicy.Name}},"shm":{{json .HostConfig.ShmSize}},"tmpfs":{{json .HostConfig.Tmpfs}},"mounts":{{json .Mounts}}}'
 return strict(run(['docker','inspect','--format',fmt,cid]))
def mount(args,src,dst,ro=False):return args+['--mount','type=bind,src='+str(src)+',dst='+dst+(',readonly' if ro else '')]
def common(image,remaining,operation):
 need(remaining>90,'ORIGINAL_WINDOW_TOO_SHORT')
 a=['docker','run','--detach','--pull=never','--restart=no','--name',NAME,'--user','0:0','--network','none','--read-only','--cpus','2','--memory','3g','--memory-swap','3g','--pids-limit','256','--shm-size','64m','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m','--label','t45.operation='+operation,'--label','t45.source='+SOURCE]
 for c in ['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE']:a+=['--cap-add',c]
 for src,dst,ro in [('deploy',DEPLOY,True),('authority','/etc/naijue-erp',False),('state',STATE,False)]:a=mount(a,ROOT/src,dst,ro)
 return a+['--entrypoint','/usr/bin/timeout',image,'--signal=TERM','--kill-after=3s',str(remaining),'/usr/bin/sleep','infinity']
def owned(info,receipt,plan):
 need(info['id']==receipt['cid'] and info['image']==receipt['image'] and info['name']=='/'+NAME and info['labels'].get('t45.operation')==plan['operationId'] and info['labels'].get('t45.source')==SOURCE,'CONTAINER_OWNERSHIP_DIFFERS')
 need(info['network']=='none' and not info['ports'] and info['user']=='0:0' and info['readonly'] and info['pidMode']=='' and info['ipcMode']!='host' and info['usernsMode'] in ['', 'private'],'CONTAINER_ISOLATION_DIFFERS')
 need(info['memory']==3*1024**3 and info['swap']==3*1024**3 and info['cpu']==2000000000 and info['pids']==256,'CONTAINER_BUDGET_DIFFERS')
 expected={DEPLOY:(str(ROOT/'deploy'),False),'/etc/naijue-erp':(str(ROOT/'authority'),True),STATE:(str(ROOT/'state'),True)}
 binds={x['Destination']:(x['Source'],x['RW']) for x in info['mounts'] if x['Type']=='bind'};need(binds==expected and all(x['Type'] in ['bind','tmpfs'] for x in info['mounts']),'EXACT_MOUNTS_REQUIRED')
 need({x.removeprefix('CAP_') for x in info['caps']}=={'CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'} and info['capDrop']==['ALL'] and bool(info['security']) and set(info['security'])<={'no-new-privileges','no-new-privileges=true'},'CONTAINER_POLICY_DIFFERS')

 need(not info['privileged'] and not info['devices'] and info['restart']=='no' and info['shm']==64*1024**2 and info['tmpfs']=={'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'CONTAINER_EXTRAS_DIFFERS')

def provision_input(path,digest):
 b=read_file(job_input(path),65536,True);need(sha(b)==digest,'PROVISION_INPUT_HASH_DIFFERS');a=strict(b)
 need(a.get('format')=='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1' and a.get('decision')=='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','ORIGINAL_PROVISION_AUTHORITY_REQUIRED')
 need(a.get('proposal')==PROPOSAL and a.get('sourceSetSha256')==SOURCE and a.get('deploymentManifestSha256')==MANIFEST_SHA and a.get('postgresUid')==61035 and a.get('postgresGid')==61035,'EXACT_SOURCE_TARGET_REQUIRED')
 need(set(a)=={'format','decision','deploymentManifestSha256','sourceSetSha256','proposal','postgresUid','postgresGid','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'} and isinstance(a['independentSafetyReviewSha256'],str) and re.fullmatch('[a-f0-9]{64}',a['independentSafetyReviewSha256']) and isinstance(a['authorizationReference'],str) and 0<len(a['authorizationReference'])<=512,'ORIGINAL_PROVISION_CLOSED_INPUT_REQUIRED')
 now=int(time.time()*1000);need(type(a.get('startsAt')) is int and type(a.get('expiresAt')) is int and a['startsAt']<=now<a['expiresAt']-90000 and 0<a['expiresAt']-a['startsAt']<=1200000,'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED');return b,a

def preparation_remaining(plan):
 remaining=(plan['imagePreparationExpiresAt']-int(time.time()*1000))//1000;need(remaining>0,'PREPARATION_DEADLINE_EXPIRED');return remaining

def prepare_image(plan):
 need(int(time.time()*1000)<plan['imagePreparationExpiresAt'],'PREPARATION_DEADLINE_EXPIRED');lock=materialize(plan,staged_archive(plan));ctx=image_context(lock)
 run(['docker','pull','--platform','linux/amd64',BASE],seconds=preparation_remaining(plan))
 iid=ROOT/'image.iid';new_file(ROOT/'image-build-intent.json',json.dumps({'base':BASE,'operation':plan['operationId']}).encode())
 # Existing Docker/apt are the build mechanism. No manager, alternate repo,
 # custom signature implementation, ELF parser, or global SSH timeout change.
 run(['docker','build','--pull=false','--iidfile',str(iid),str(ctx)],seconds=preparation_remaining(plan))
 image=iid.read_text().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image]));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE}

def start_target(plan,path,digest):
 image=strict(read_file(ROOT/'image-receipt.json',65536));need(image['operationId']==plan['operationId'] and image['sourceSet']==SOURCE,'ORIGINAL_IMAGE_RECEIPT_REQUIRED');raw,a=provision_input(path,digest)
 need(not (ROOT/'authority/fresh35-combined-execution-v1.json').exists(),'NO_STALE_INSTALL_AUTHORITY')
 new_file(ROOT/'authority/fresh35-isolated-provision-v1.json',raw,0o400)
 new_json(ROOT/'start-intent.json',{'operation':plan['operationId'],'expiresAt':a['expiresAt'],'image':image['image']})
 remaining=(a['expiresAt']-int(time.time()*1000))//1000-5
 need(not run(['docker','ps','-a','--filter','name=^/'+NAME+'$','--format','{{.ID}}']).strip(),'TARGET_NAME_ALREADY_EXISTS_NO_REPLAY')
 cid=run(common(image['image'],remaining,plan['operationId'])).decode().strip();need(re.fullmatch('[a-f0-9]{64}',cid),'ACTUAL_NEW_CID_REQUIRED')
 receipt={'cid':cid,'image':image['image'],'expiresAt':a['expiresAt'],'operationId':plan['operationId']};new_json(ROOT/'container-receipt.json',receipt);owned(inspect(cid),receipt,plan)
 cmd='umask 077; exec /usr/bin/python3 -I -S '+DEPLOY+'/scripts/release/unified-install/launch-fresh35-isolated-v1.py --run-authorized-once > '+STATE+'/launcher.private.log 2>&1'
 run(['docker','exec','--detach','--user','0:0',cid,'/bin/sh','-c',cmd])
 work=ROOT/'state'/WORK
 while int(time.time()*1000)<a['expiresAt']-90000:
  if (work/'program-description.json').is_file() and (work/'target-binding.json').is_file():
   target=strict(read_file(work/'target-binding.json',1024*1024));program=strict(read_file(work/'program-description.json',1024*1024));need(program.get('sourceSetSha256')==SOURCE,'DESCRIBED_SOURCE_DIFFERS')
   # Return/release original dispatcher's execution.lock while the ORIGINAL
   # bounded launcher/guardian waits. The next same-dispatcher phase only copies
   # genuine external install bytes, never creates an approval or replays start.
   return {'status':'WAITING_EXTERNAL_INSTALL_AUTHORITY','cid':cid,'target':target,'program':program,'expiresAt':a['expiresAt']}
  if (work/'failure.json').exists() or not inspect(cid)['running']:break
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

def observation(plan,wait=True):
 receipt=strict(read_file(ROOT/'container-receipt.json',65536));work=ROOT/'state'/WORK
 while wait and int(time.time()*1000)<receipt['expiresAt']-5000 and not (work/'result.json').is_file():
  owned(inspect(receipt['cid']),receipt,plan);time.sleep(.25)
 result=strict(read_file(work/'result.json',1024*1024)) if (work/'result.json').is_file() else {'state':'UNKNOWN','cleanup':{'cleanupComplete':False}}
 info=inspect(receipt['cid']);owned(info,receipt,plan)
 # Stop only exact owned CID after original result, explicit finally failure,
 # or deadline. Stopping/killing does NOT prove DB/credential cleanup.
 stop_allowed=(work/'result.json').is_file() or int(time.time()*1000)>=receipt['expiresAt']-5000
 if info['running'] and stop_allowed:
  run(['docker','stop','--time','3',receipt['cid']],seconds=8);info=inspect(receipt['cid']);owned(info,receipt,plan)
 ok=(result.get('state')=='ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED' and result.get('syntheticImportVerified') is True and result.get('recordPublished') is True and result.get('businessVerified') is False and result.get('cleanup',{}).get('cleanupComplete') is True and not info['running'])
 return {'status':'PASS_SCOPED_SYNTHETIC_AND_CLEANUP' if ok else 'WAITING_ORIGINAL_LAUNCHER' if result.get('state')=='UNKNOWN' and info['running'] and not stop_allowed else 'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY','sourceResult':result,'containerStopped':not info['running'],'forcedStopIsNotCleanShutdownProof':True,'cid':receipt['cid']}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['prepare-image','start-target','deliver-install','observe'],required=True);parser.add_argument('--plan',required=True);parser.add_argument('--plan-sha256',required=True);parser.add_argument('--external-input');parser.add_argument('--external-sha256');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 need(args.execute,'EXPLICIT_EXECUTION_NOT_REQUESTED');need(os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_DISPATCHER_REQUIRED')
 job=trusted(Path(os.environ['ERP_SHARED_JOB_DIR']));need(job.parent==PRIVATE and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',job.name),'ORIGINAL_PRIVATE_JOB_REQUIRED');plan=load_plan(args.plan,args.plan_sha256);result=None
 try:
  if args.phase=='prepare-image':result=prepare_image(plan)
  elif args.phase=='start-target':need(args.external_input and args.external_sha256,'EXTERNAL_PROVISION_INPUT_REQUIRED');result=start_target(plan,args.external_input,args.external_sha256)
  elif args.phase=='deliver-install':
   need(args.external_input and args.external_sha256,'EXTERNAL_INSTALL_INPUT_REQUIRED');copied=delivery(plan,args.external_input,args.external_sha256);result=observation(plan);result['delivery']=copied
  else:result=observation(plan,wait=False)
 except Exception as e:
  result={'status':'STOP_OR_UNKNOWN_NO_REPLAY','phase':args.phase,'errorCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__}
  # Do not race the live guardian or infer rollback. It/PID1 still owns the
  # ORIGINAL deadline; this exact container remains available to observe.
  if (ROOT/'start-intent.json').is_file() and not (ROOT/'container-receipt.json').exists():
   try:recover_original_cid(plan)
   except Exception as recovery:result['originalNameReadback']='UNCONFIRMED_'+type(recovery).__name__
  if (ROOT/'container-receipt.json').is_file():
   try:result['readback']=observation(plan,wait=False)
   except Exception as cleanup:result['cleanupReadback']='UNCONFIRMED_'+type(cleanup).__name__
 finally:
  if result is not None:new_json(job/'results'/('fresh35-'+args.phase+'-result.json'),result)
 need(result is not None and result['status'] not in ['STOP_OR_UNKNOWN_NO_REPLAY','FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY'],'OPERATION_NOT_CONFIRMED')
if __name__=='__main__':
 try:main()
 except Exception as e:sys_exit=2;print(json.dumps({'status':'STOP_NO_REPLAY','errorCode':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]+',str(e)) else type(e).__name__}));raise SystemExit(sys_exit)
