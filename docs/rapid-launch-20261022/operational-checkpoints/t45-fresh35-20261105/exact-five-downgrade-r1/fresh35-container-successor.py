#!/usr/bin/python3
"""Scoped successor of the retained provision_schema_target.py.
Inert on import. Only the original T45 dispatcher executes --execute after the
actual environment permission. A plan/hash is configuration, not an approval.
No approval, DB window, installation record or source guard is manufactured.
"""
import argparse, datetime, gzip, hashlib, io, json, os, re, stat, subprocess, tarfile, time
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
OFFLINE_KEY='t45-f35-fixed-base-offline-20261105-01'
OFFLINE_SHA='19739f1489ea6a3a4bb8ce7a8529e422235c306b6593904ce56f54aa4d200342'
OFFLINE_BYTES=29870080
BASE_MANIFEST_SHA='7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392'
BASE_CONFIG_SHA='596c6d80c879dc94eae22cb9c59a5e18f66f4f9722e170892324c282b4eb19bc'
BASE_LAYER_SHA='37fb86c2a767b88d500c6872195f88078f64765fe0d2f9cc375cc2efbd4c0a41'
BASE_DIFF_ID='sha256:dd57f90311a2567b55ff22eeacff1602fd04ad7566e315957731359eab173b90'
EXACT_DOWNGRADES={'liblzma5':('5.8.1-1+deb13u2','5.8.1-1+deb13u1'),'libpcre2-8-0':('10.46-1~deb13u3','10.46-1~deb13u2'),'libssl3t64':('3.5.7-1~deb13u3','3.5.7-1~deb13u2'),'openssl-provider-legacy':('3.5.7-1~deb13u3','3.5.7-1~deb13u2'),'tzdata':('2026f-0+deb13u1','2026c-0+deb13u1')}
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
def public_image_output(raw,stage=None):
 # Only the fixed image preparation commands opt in. Never export environment,
 # inputs, Docker configuration, private launcher or database command output.
 text=raw.decode('utf-8','replace') if isinstance(raw,bytes) else (raw or '')
 if stage=='builder-inspect' and any(x.strip().startswith('Driver:') for x in text.splitlines()):text='\n'.join(x.strip() for x in text.splitlines() if x.strip().startswith(('Name:','Driver:','Status:','BuildKit version:','Platforms:')))
 lines=[]
 for line in text.splitlines():
  if re.search(r'password|passwd|secret|token|credential|authorization|cookie|bearer|private.?key|BEGIN .*KEY|://[^/\s]*@',line,re.I):line='[REDACTED_SENSITIVE_LINE]'
  lines.append(line)
 return '\n'.join(lines)[-16384:]

def run(args,data=None,seconds=30,public_stage=None):
 if public_stage is not None:
  prefix={'image-pull':['docker','pull'],'image-build':['docker','build'],'image-inspect':['docker','image','inspect'],'image-load':['docker','image','load'],'image-store':['docker','info'],'derived-image-inspect':['docker','image','inspect'],'builder-version':['docker','buildx','version'],'builder-inspect':['docker','buildx','inspect'],'local-context-build':['docker','buildx','build'],'exact-five-build':['docker','buildx','build']}.get(public_stage)
  need(prefix is not None and args[:len(prefix)]==prefix,'FIXED_PUBLIC_IMAGE_COMMAND_REQUIRED')
 try:p=subprocess.run(args,input=data,capture_output=True,timeout=seconds)
 except subprocess.TimeoutExpired as e:
  if public_stage is not None:
   new_json(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results'/('fresh35-'+public_stage+'-command.json'),{'stage':public_stage,'command':' '.join(prefix),'exitCode':None,'timedOut':True,'outcome':'UNKNOWN_NO_REPLAY','stdout':public_image_output(e.stdout,public_stage),'stderr':public_image_output(e.stderr,public_stage)})
  raise
 if public_stage is not None:
  new_json(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results'/('fresh35-'+public_stage+'-command.json'),{'stage':public_stage,'command':' '.join(prefix),'exitCode':p.returncode,'timedOut':False,'stdout':public_image_output(p.stdout,public_stage),'stderr':public_image_output(p.stderr,public_stage)})
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
 run(['docker','pull','--platform','linux/amd64',BASE],seconds=preparation_remaining(plan),public_stage='image-pull')
 iid=ROOT/'image.iid';new_file(ROOT/'image-build-intent.json',json.dumps({'base':BASE,'operation':plan['operationId']}).encode())
 # Existing Docker/apt are the build mechanism. No manager, alternate repo,
 # custom signature implementation, ELF parser, or global SSH timeout change.
 run(['docker','build','--pull=false','--iidfile',str(iid),str(ctx)],seconds=preparation_remaining(plan),public_stage='image-build')
 image=iid.read_text().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image],public_stage='image-inspect'));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE}


def resume_image(plan):
 # Exact observed original terminal pull failure only. This is a new externally
 # bound operation, not re-entering materialize or deleting the retained root.
 remaining=preparation_remaining(plan);need(remaining<=1800,'PREPARATION_WINDOW_TOO_LONG')
 original='t45-f35-5b26-prepare-20261105-01'
 need(plan['operationId']!=original,'NEW_EXTERNAL_OPERATION_REQUIRED')
 trusted(ROOT);need(stat.S_IMODE(ROOT.stat().st_mode)==0o700,'RETAINED_ROOT_MODE_DIFFERS')
 started=read_file(ROOT/'prepare-started.json',65536)
 need(sha(started)=='b0bf4414547430508b20d5cd7a6acc3b58fa44072952cea20c482df236e0205b' and strict(started)=={'operationId':original,'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA},'ORIGINAL_PREPARATION_BINDING_DIFFERS')
 prior=strict(read_file(PRIVATE/original/'results/fresh35-prepare-image-result.json',65536,True))
 need(prior=={'errorCode':'COMMAND_FAILED_1','phase':'prepare-image','status':'STOP_OR_UNKNOWN_NO_REPLAY'},'ORIGINAL_TERMINAL_PULL_FAILURE_REQUIRED')
 for name in ['image-build-intent.json','image.iid','image-receipt.json','start-intent.json','container-receipt.json','image-resume-intent.json','image-resume-build-intent.json','image-resume.iid']:
  p=ROOT/name;need(not p.exists() and not p.is_symlink(),'NOT_ORIGINAL_PRE_BUILD_PULL_FAILURE')
 need(sha(read_file(ROOT/'metadata/deployment-manifest.json',1024*1024))==MANIFEST_SHA and sha(read_file(ROOT/'metadata/debian-runtime-dependency-lock.json',1024*1024))==LOCK_SHA,'RETAINED_MANIFEST_OR_LOCK_DIFFERS')
 need(strict(read_file(ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==SOURCE,'RETAINED_SOURCE_DIFFERS')
 target=CONTROL/'artifacts'/KEY;ready=strict(read_file(target/'ready.json',65536,root=False))
 need(ready.get('status')=='READY' and ready.get('artifactKey')==KEY and ready.get('sourceSetSha256')==SOURCE and ready.get('archiveSha256')==ARCHIVE_SHA and ready.get('archiveBytes')==ARCHIVE_BYTES and ready.get('authoritySha256')==plan['stagingAuthoritySha256'],'EXACT_STAGED_READY_REQUIRED')
 archive=trusted(target/'archive.bin',False).lstat();need(archive.st_uid==1000 and archive.st_size==ARCHIVE_BYTES and not archive.st_mode&0o077 and stat.S_ISREG(archive.st_mode) and archive.st_nlink==1 and [archive.st_dev,archive.st_ino,archive.st_size,archive.st_mtime_ns,archive.st_ctime_ns]==ready.get('fileIdentity'),'STAGED_IDENTITY_CHANGED')
 ctx=trusted(ROOT/'image-context')
 for name,digest in [('Dockerfile','ca5df9e09e6d5d47f2ea8182a42cbfcb954414ccf73fbaaa59ab70b5eb93d36e'),('install-locked.sh','4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560')]:
  need(sha(read_file(ctx/name,65536))==digest,'RETAINED_IMAGE_RECIPE_DIFFERS')
 new_json(ROOT/'image-resume-intent.json',{'operationId':plan['operationId'],'originalOperationId':original,'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'base':BASE,'expiresAt':plan['imagePreparationExpiresAt']})
 run(['docker','pull','--platform','linux/amd64',BASE],seconds=preparation_remaining(plan),public_stage='image-pull')
 # Pull must succeed before any build, signature, apt or ABI claim.
 new_json(ROOT/'image-resume-build-intent.json',{'base':BASE,'operation':plan['operationId']})
 iid=ROOT/'image-resume.iid'
 run(['docker','build','--pull=false','--iidfile',str(iid),str(ctx)],seconds=preparation_remaining(plan),public_stage='image-build')
 image=read_file(iid,1024).decode().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image],public_stage='image-inspect'));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'originalOperationId':original});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE}


def offline_archive(raw):
 need(len(raw)==OFFLINE_BYTES and sha(raw)==OFFLINE_SHA,'FIXED_OFFLINE_ARCHIVE_DIFFERS')
 expected={'oci-layout','index.json',*[('blobs/sha256/'+x) for x in [BASE_MANIFEST_SHA,BASE_CONFIG_SHA,BASE_LAYER_SHA]]};files={}
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as t:
  for m in t:
   need(m.name in expected and m.name not in files and m.isfile() and m.mode==0o644,'FIXED_OCI_MEMBERS_REQUIRED');files[m.name]=t.extractfile(m).read()
 need(set(files)==expected,'FIXED_OCI_CLOSURE_REQUIRED')
 for digest in [BASE_MANIFEST_SHA,BASE_CONFIG_SHA,BASE_LAYER_SHA]:need(sha(files['blobs/sha256/'+digest])==digest,'FIXED_OCI_BLOB_DIFFERS')
 need(strict(files['oci-layout'])=={'imageLayoutVersion':'1.0.0'} and sha(files['index.json'])=='0bb5caa73c3f4c88f3eb7854b394bb7df7ad567cfbf10ec064228457c4085cfa','FIXED_OCI_LAYOUT_DIFFERS')
 manifest=strict(files['blobs/sha256/'+BASE_MANIFEST_SHA]);config=strict(files['blobs/sha256/'+BASE_CONFIG_SHA]);index=strict(files['index.json'])
 need(manifest['mediaType']=='application/vnd.oci.image.manifest.v1+json' and 'manifests' not in manifest and manifest['config']['digest']=='sha256:'+BASE_CONFIG_SHA and manifest['config']['size']==451 and manifest['layers']==[{'mediaType':'application/vnd.oci.image.layer.v1.tar+gzip','digest':'sha256:'+BASE_LAYER_SHA,'size':29856132}],'FIXED_AMD64_MANIFEST_REQUIRED')
 need(index=={'schemaVersion':2,'mediaType':'application/vnd.oci.image.index.v1+json','manifests':[{'mediaType':manifest['mediaType'],'digest':'sha256:'+BASE_MANIFEST_SHA,'size':1021,'platform':{'os':'linux','architecture':'amd64'},'annotations':{'io.containerd.image.name':BASE}}]},'EXACT_BASE_REFERENCE_ANNOTATION_REQUIRED')
 need(config['os']=='linux' and config['architecture']=='amd64' and config['rootfs']=={'type':'layers','diff_ids':[BASE_DIFF_ID]},'FIXED_BASE_PLATFORM_REQUIRED')
 h=hashlib.sha256();n=0
 with gzip.GzipFile(fileobj=io.BytesIO(files['blobs/sha256/'+BASE_LAYER_SHA])) as f:
  while True:
   block=f.read(1024*1024)
   if not block:break
   h.update(block);n+=len(block);need(n<=81295360,'FIXED_LAYER_SIZE_DIFFERS')
 need(n==81295360 and 'sha256:'+h.hexdigest()==BASE_DIFF_ID,'FIXED_LAYER_DIFFID_DIFFERS')

def offline_staged_bytes(path,digest):
 b=read_file(job_input(path),65536,True);need(sha(b)==digest,'OFFLINE_EXTERNAL_INPUT_DIFFERS');a=strict(b)
 keys={'format','decision','taskId','grantId','artifactKey','sourceSetSha256','archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
 target=CONTROL/'artifacts'/OFFLINE_KEY
 need(set(a)==keys and a['format']=='T45_ORDINARY_ARTIFACT_STAGING_V1' and a['decision']=='AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING' and a['taskId']=='T45' and a['grantId']==GRANT and a['kind']=='ORDINARY_SOURCE_AND_TOOLS' and a['artifactKey']==OFFLINE_KEY and a['sourceSetSha256']==SOURCE and a['archiveSha256']==OFFLINE_SHA and a['archiveBytes']==OFFLINE_BYTES and a['targetDirectory']==str(target),'EXACT_OFFLINE_STAGING_BINDING_REQUIRED')
 need(type(a['startsAt']) is int and type(a['expiresAt']) is int and a['startsAt']<a['expiresAt'] and isinstance(a['decisionReference'],str) and 0<len(a['decisionReference'])<=512,'ORIGINAL_EXTERNAL_STAGING_REFERENCE_REQUIRED')
 policy=Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT+'/artifact-staging-authorization.json')
 need(read_file(policy,65536)==b,'INDEPENDENT_ROOT_STAGING_BYTES_DIFFER')
 ready=strict(read_file(target/'ready.json',65536,root=False));need(ready.get('status')=='READY' and ready.get('artifactKey')==OFFLINE_KEY and ready.get('sourceSetSha256')==SOURCE and ready.get('archiveSha256')==OFFLINE_SHA and ready.get('archiveBytes')==OFFLINE_BYTES and ready.get('authoritySha256')==digest,'EXACT_OFFLINE_READY_REQUIRED')
 f=trusted(target/'archive.bin',False);s=f.lstat();need(s.st_uid==1000 and not s.st_mode&0o077 and s.st_nlink==1 and stat.S_ISREG(s.st_mode) and [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]==ready.get('fileIdentity'),'OFFLINE_STAGED_IDENTITY_CHANGED')
 raw=read_file(f,OFFLINE_BYTES,root=False);offline_archive(raw);return raw

def offline_load_image(plan,path,digest):
 need(preparation_remaining(plan)<=1800,'PREPARATION_WINDOW_TOO_LONG');trusted(ROOT);need(stat.S_IMODE(ROOT.stat().st_mode)==0o700,'RETAINED_ROOT_MODE_DIFFERS')
 original='t45-f35-5b26-prepare-20261105-01';resume='t45-f35-5b26-resume-image-20261105-01';need(plan['operationId'] not in [original,resume],'NEW_EXTERNAL_OPERATION_REQUIRED')
 started=read_file(ROOT/'prepare-started.json',65536);need(sha(started)=='b0bf4414547430508b20d5cd7a6acc3b58fa44072952cea20c482df236e0205b' and strict(started)=={'operationId':original,'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA},'ORIGINAL_PREPARATION_BINDING_DIFFERS')
 for job,phase in [(original,'prepare-image'),(resume,'resume-image')]:
  need(strict(read_file(PRIVATE/job/'results'/('fresh35-'+phase+'-result.json'),65536,True))=={'errorCode':'COMMAND_FAILED_1','phase':phase,'status':'STOP_OR_UNKNOWN_NO_REPLAY'},'ORIGINAL_TERMINAL_PULL_FAILURE_REQUIRED')
 need(strict(read_file(ROOT/'image-resume-intent.json',65536))=={'operationId':resume,'originalOperationId':original,'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'base':BASE,'expiresAt':1793882348609},'ORIGINAL_RESUME_INTENT_DIFFERS')
 for name in ['image-build-intent.json','image.iid','image-receipt.json','start-intent.json','container-receipt.json','image-resume-build-intent.json','image-resume.iid','offline-image-intent.json','offline-base.oci.tar','offline-base-receipt.json','offline-image-build-intent.json','image-offline.iid']:
  p=ROOT/name;need(not p.exists() and not p.is_symlink(),'NOT_ORIGINAL_FAILED_PULL_OFFLINE_STATE')
 need(sha(read_file(ROOT/'metadata/deployment-manifest.json',1024*1024))==MANIFEST_SHA and sha(read_file(ROOT/'metadata/debian-runtime-dependency-lock.json',1024*1024))==LOCK_SHA,'RETAINED_MANIFEST_OR_LOCK_DIFFERS')
 need(strict(read_file(ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==SOURCE,'RETAINED_SOURCE_DIFFERS')
 target=CONTROL/'artifacts'/KEY;ready=strict(read_file(target/'ready.json',65536,root=False))
 need(ready.get('status')=='READY' and ready.get('artifactKey')==KEY and ready.get('sourceSetSha256')==SOURCE and ready.get('archiveSha256')==ARCHIVE_SHA and ready.get('archiveBytes')==ARCHIVE_BYTES and ready.get('authoritySha256')==plan['stagingAuthoritySha256'],'EXACT_STAGED_READY_REQUIRED')
 original_file=trusted(target/'archive.bin',False).lstat();need(original_file.st_uid==1000 and original_file.st_size==ARCHIVE_BYTES and not original_file.st_mode&0o077 and stat.S_ISREG(original_file.st_mode) and original_file.st_nlink==1 and [original_file.st_dev,original_file.st_ino,original_file.st_size,original_file.st_mtime_ns,original_file.st_ctime_ns]==ready.get('fileIdentity'),'STAGED_IDENTITY_CHANGED')
 ctx=trusted(ROOT/'image-context')
 for name,expected in [('Dockerfile','ca5df9e09e6d5d47f2ea8182a42cbfcb954414ccf73fbaaa59ab70b5eb93d36e'),('install-locked.sh','4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560')]:need(sha(read_file(ctx/name,65536))==expected,'RETAINED_IMAGE_RECIPE_DIFFERS')
 fmt='{"driver":{{json .Driver}},"driverStatus":{{json .DriverStatus}},"osType":{{json .OSType}},"architecture":{{json .Architecture}}}'
 store=strict(run(['docker','info','--format',fmt],seconds=min(30,preparation_remaining(plan)),public_stage='image-store'));need(store.get('driver')=='overlayfs' and ['driver-type','io.containerd.snapshotter.v1'] in (store.get('driverStatus') or []) and store.get('osType')=='linux' and store.get('architecture') in ['amd64','x86_64'],'EXACT_CONTAINERD_IMAGE_STORE_REQUIRED')
 raw=offline_staged_bytes(path,digest)
 new_json(ROOT/'offline-image-intent.json',{'operationId':plan['operationId'],'originalOperationId':original,'resumeOperationId':resume,'offlineArchive':OFFLINE_SHA,'base':BASE,'sourceSet':SOURCE,'expiresAt':plan['imagePreparationExpiresAt']})
 snapshot=ROOT/'offline-base.oci.tar';new_file(snapshot,raw)
 run(['docker','image','load','--input',str(snapshot)],seconds=preparation_remaining(plan),public_stage='image-load')
 fmt='{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"repoDigests":{{json .RepoDigests}},"layers":{{json .RootFS.Layers}}}'
 base=strict(run(['docker','image','inspect','--format',fmt,BASE],seconds=min(30,preparation_remaining(plan)),public_stage='image-inspect'))
 refs={BASE,'debian@sha256:'+BASE_MANIFEST_SHA,'library/debian@sha256:'+BASE_MANIFEST_SHA}
 need(isinstance(base.get('id'),str) and re.fullmatch('sha256:[a-f0-9]{64}',base['id']) and base.get('os')=='linux' and base.get('arch')=='amd64' and bool(refs.intersection(base.get('repoDigests') or [])) and base.get('layers')==[BASE_DIFF_ID],'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED')
 new_json(ROOT/'offline-base-receipt.json',{'base':BASE,'actualBaseImageID':base['id'],'layers':base['layers'],'archive':OFFLINE_SHA,'operationId':plan['operationId'],'loadedExactBase':True})
 new_json(ROOT/'offline-image-build-intent.json',{'base':BASE,'operation':plan['operationId']});iid=ROOT/'image-offline.iid'
 run(['docker','build','--pull=false','--iidfile',str(iid),str(ctx)],seconds=preparation_remaining(plan),public_stage='image-build')
 image=read_file(iid,1024).decode().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image],seconds=min(30,preparation_remaining(plan)),public_stage='derived-image-inspect'));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'offlineArchive':OFFLINE_SHA});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE,'offlineBaseLoaded':True}


def build_local_oci_context(plan):
 need(preparation_remaining(plan)<=1800,'PREPARATION_WINDOW_TOO_LONG');trusted(ROOT);need(stat.S_IMODE(ROOT.stat().st_mode)==0o700,'RETAINED_ROOT_MODE_DIFFERS')
 original='t45-f35-5b26-prepare-20261105-01';resume='t45-f35-5b26-resume-image-20261105-01';offline='t45-f35-5b26-offline-load-image-20261105-01'
 need(plan['operationId'] not in [original,resume,offline],'NEW_EXTERNAL_OPERATION_REQUIRED')
 started=read_file(ROOT/'prepare-started.json',65536);need(sha(started)=='b0bf4414547430508b20d5cd7a6acc3b58fa44072952cea20c482df236e0205b' and strict(started)=={'operationId':original,'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA},'ORIGINAL_PREPARATION_BINDING_DIFFERS')
 for job,phase in [(original,'prepare-image'),(resume,'resume-image'),(offline,'offline-load-image')]:
  need(strict(read_file(PRIVATE/job/'results'/('fresh35-'+phase+'-result.json'),65536,True))=={'errorCode':'COMMAND_FAILED_1','phase':phase,'status':'STOP_OR_UNKNOWN_NO_REPLAY'},'ORIGINAL_TERMINAL_FAILURE_CHAIN_REQUIRED')
 need(strict(read_file(ROOT/'image-resume-intent.json',65536))=={'operationId':resume,'originalOperationId':original,'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'base':BASE,'expiresAt':1793882348609},'ORIGINAL_RESUME_INTENT_DIFFERS')
 need(strict(read_file(ROOT/'offline-image-intent.json',65536))=={'operationId':offline,'originalOperationId':original,'resumeOperationId':resume,'sourceSet':SOURCE,'offlineArchive':OFFLINE_SHA,'base':BASE,'expiresAt':1793884588020} and strict(read_file(ROOT/'offline-image-build-intent.json',65536))=={'base':BASE,'operation':offline},'ORIGINAL_OFFLINE_INTENTS_DIFFER')
 prior=strict(read_file(PRIVATE/offline/'results/fresh35-image-build-command.json',65536,True))
 need(prior.get('command')=='docker build' and prior.get('stage')=='image-build' and prior.get('exitCode')==1 and prior.get('timedOut') is False and isinstance(prior.get('stderr'),str) and all(x in prior['stderr'] for x in [BASE,'Dockerfile:1','load metadata','https://registry-1.docker.io/v2/library/debian/manifests/sha256:'+BASE_MANIFEST_SHA,'connection reset by peer']),'ORIGINAL_FROM_METADATA_FAILURE_REQUIRED')
 receipt=strict(read_file(ROOT/'offline-base-receipt.json',65536));need(set(receipt)=={'base','actualBaseImageID','layers','archive','operationId','loadedExactBase'} and receipt['base']==BASE and receipt['layers']==[BASE_DIFF_ID] and receipt['archive']==OFFLINE_SHA and receipt['operationId']==offline and receipt['loadedExactBase'] is True,'ORIGINAL_BASE_LOAD_RECEIPT_REQUIRED')
 for name in ['image-build-intent.json','image.iid','image-receipt.json','start-intent.json','container-receipt.json','image-resume-build-intent.json','image-resume.iid','image-offline.iid','local-oci-context-intent-r1.json','local-base-oci-context-r1','image-local-oci-context-r1.iid']:
  p=ROOT/name;need(not p.exists() and not p.is_symlink(),'NOT_ORIGINAL_LOCAL_CONTEXT_RETRY_STATE')
 need(sha(read_file(ROOT/'metadata/deployment-manifest.json',1024*1024))==MANIFEST_SHA and sha(read_file(ROOT/'metadata/debian-runtime-dependency-lock.json',1024*1024))==LOCK_SHA,'RETAINED_MANIFEST_OR_LOCK_DIFFERS')
 need(strict(read_file(ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==SOURCE,'RETAINED_SOURCE_DIFFERS')
 for key,digest,size,authority in [(KEY,ARCHIVE_SHA,ARCHIVE_BYTES,plan['stagingAuthoritySha256']),(OFFLINE_KEY,OFFLINE_SHA,OFFLINE_BYTES,'a24505c9670723303c24dbd9ccf39da9a152ef8f3a92a1226a0ae85c4a83025a')]:
  target=CONTROL/'artifacts'/key;r=strict(read_file(target/'ready.json',65536,root=False));need(r.get('status')=='READY' and r.get('artifactKey')==key and r.get('sourceSetSha256')==SOURCE and r.get('archiveSha256')==digest and r.get('archiveBytes')==size and r.get('authoritySha256')==authority,'ORIGINAL_STAGED_READYS_DIFFER')
  f=trusted(target/'archive.bin',False).lstat();need(f.st_uid==1000 and f.st_size==size and not f.st_mode&0o077 and stat.S_ISREG(f.st_mode) and f.st_nlink==1 and [f.st_dev,f.st_ino,f.st_size,f.st_mtime_ns,f.st_ctime_ns]==r.get('fileIdentity'),'STAGED_IDENTITY_CHANGED')
 ctx=trusted(ROOT/'image-context')
 for name,expected in [('Dockerfile','ca5df9e09e6d5d47f2ea8182a42cbfcb954414ccf73fbaaa59ab70b5eb93d36e'),('install-locked.sh','4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560')]:need(sha(read_file(ctx/name,65536))==expected,'RETAINED_IMAGE_RECIPE_DIFFERS')
 raw=read_file(ROOT/'offline-base.oci.tar',OFFLINE_BYTES,True);offline_archive(raw)
 version=run(['docker','buildx','version'],seconds=min(15,preparation_remaining(plan)),public_stage='builder-version').decode().strip()
 need(version=='github.com/docker/buildx v0.37.1 0b265a9f62db554fa9aba6dd19e1bd5704bc7d8a','EXACT_BUILDX_VERSION_REQUIRED')
 info=run(['docker','buildx','inspect','default'],seconds=min(15,preparation_remaining(plan)),public_stage='builder-inspect').decode();lines=[x.strip() for x in info.splitlines()]
 def values(label):return [x.split(':',1)[1].strip() for x in lines if x.startswith(label+':')]
 need(values('Name')==['default','default'] and values('Driver')==['docker'] and values('Status')==['running'] and values('BuildKit version')==['v0.33.1'] and len(values('Platforms'))==1 and 'linux/amd64' in [x.strip() for x in values('Platforms')[0].split(',')],'EXACT_EXISTING_BUILDER_REQUIRED')
 fmt='{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"repoDigests":{{json .RepoDigests}},"layers":{{json .RootFS.Layers}}}'
 base=strict(run(['docker','image','inspect','--format',fmt,BASE],seconds=min(15,preparation_remaining(plan)),public_stage='image-inspect'));refs={BASE,'debian@sha256:'+BASE_MANIFEST_SHA,'library/debian@sha256:'+BASE_MANIFEST_SHA}
 need(base.get('id')==receipt['actualBaseImageID'] and isinstance(base.get('id'),str) and re.fullmatch('sha256:[a-f0-9]{64}',base['id']) and base.get('os')=='linux' and base.get('arch')=='amd64' and bool(refs.intersection(base.get('repoDigests') or [])) and base.get('layers')==[BASE_DIFF_ID],'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED')
 layout=ROOT/'local-base-oci-context-r1';iid=ROOT/'image-local-oci-context-r1.iid'
 new_json(ROOT/'local-oci-context-intent-r1.json',{'operationId':plan['operationId'],'priorOfflineOperationId':offline,'sourceSet':SOURCE,'base':BASE,'offlineArchive':OFFLINE_SHA,'expiresAt':plan['imagePreparationExpiresAt']})
 layout.mkdir(mode=0o700);os.chmod(layout,0o700);syncdir(ROOT)
 # offline_archive already validated exactly five ordinary OCI members. Only
 # these bytes are materialized; the image layer tar is never extracted.
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as t:
  for m in t:
   p=layout/m.name;new_parents(p.parent);new_file(p,t.extractfile(m).read(),0o644)
 context=BASE+'=oci-layout://'+str(layout)+'@sha256:'+BASE_MANIFEST_SHA
 run(['docker','buildx','build','--builder','default','--platform','linux/amd64','--pull=false','--build-context',context,'--iidfile',str(iid),str(ctx)],seconds=preparation_remaining(plan),public_stage='local-context-build')
 log=strict(read_file(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results/fresh35-local-context-build-command.json',65536,True));visible=log.get('stdout','')+'\n'+log.get('stderr','')
 need(not ('registry-1.docker.io' in visible and re.search(r'\bHEAD\b',visible,re.I)),'REMOTE_METADATA_OBSERVED_NO_FALLBACK')
 image=read_file(iid,1024).decode().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image],seconds=min(15,preparation_remaining(plan)),public_stage='derived-image-inspect'));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'offlineArchive':OFFLINE_SHA,'localOCIContext':True});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE,'localOCIContext':True}


def exact_five_guard():
 allowed='\n'.join(n+' '+a+' '+b for n,(a,b) in sorted(EXACT_DOWNGRADES.items()))
 return ("# Only the five exact approved base-to-lock downgrades, inside this image.\n"
  +"cat > /work/exact-five-allowed.txt <<'EXACT_FIVE_EOF'\n"+allowed+"\nEXACT_FIVE_EOF\n"
  +"query_status=0\ndpkg-query -W -f='${Package} ${Version} ${db:Status-Status}\\n' $(awk '{print $1}' /work/locked-versions.txt) > /work/base-installed.txt 2>/dev/null || query_status=$?\ntest \"$query_status\" -le 1\ndpkg --get-selections > /work/base-selections.txt\n"
  +"awk 'NR==FNR {n=$1; sub(/:.*/,\"\",n); if ($2==\"hold\") held[n]=1; next} /^(Inst|Conf|Remv|Purg) / {n=$2; sub(/:.*/,\"\",n); if (n in held) exit 9; if ($1==\"Remv\" || $1==\"Purg\") exit 9}' /work/base-selections.txt /work/apt-simulation.txt\n"
  +"awk 'NR==FNR {v[$1]=$2; next} /^(Inst|Conf) / {n=$2; sub(/:.*/,\"\",n); x=$0; sub(/^[^(]*\\(/,\"\",x); split(x,a,\" \"); if (!(n in v) || (v[n] \"x\")!=(a[1] \"x\")) exit 9}' /work/locked-versions.txt /work/apt-simulation.txt\n"
  +": > /work/exact-five-observed.txt\nwhile read -r package locked; do\n actual=$(awk -v n=\"$package\" '$1==n && $3==\"installed\" {print $2}' /work/base-installed.txt)\n if test -n \"$actual\" && dpkg --compare-versions \"$actual\" gt \"$locked\"; then\n  printf '%s %s %s\\n' \"$package\" \"$actual\" \"$locked\" >> /work/exact-five-observed.txt\n fi\ndone < /work/locked-versions.txt\nawk 'NR==FNR {want[$0]=1; n++; next} {if (!($0 in want) || seen[$0]++) exit 9; got++} END {if (got!=n) exit 9}' /work/exact-five-allowed.txt /work/exact-five-observed.txt\n"
  +"awk 'NR==FNR {old[$1]=$2; v[$1]=$3; next} /^Inst / {n=$2; sub(/:.*/,\"\",n); if (!(n in old)) next; if ($3!=(\"[\" old[n] \"]\")) exit 9; x=$0; sub(/^[^(]*\\(/,\"\",x); split(x,a,\" \"); if ((a[1] \"x\")!=(v[n] \"x\")) exit 9; seen[n]=1} END {for(n in old) if (!(n in seen)) exit 9}' /work/exact-five-allowed.txt /work/apt-simulation.txt\n"
  +"printf 'EXACT_FIVE_BASE_TO_LOCK_DOWNGRADES_VERIFIED\\n'\ncat /work/exact-five-observed.txt\n")

def exact_five_recipe(original):
 need(sha(original)=='4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560','ORIGINAL_INSTALL_RECIPE_DIFFERS')
 text=original.decode();lines=text.splitlines(keepends=True);positions=[i for i,x in enumerate(lines) if x.startswith('awk ') and '/work/apt-simulation.txt' in x]
 need(len(positions)==1 and text.count('apt-get -y --download-only ')==1 and text.count('apt-get -y --no-download ')==1 and '--allow-downgrades' not in text,'ORIGINAL_APT_RECIPE_SHAPE_REQUIRED')
 lines.insert(positions[0]+1,exact_five_guard());changed=''.join(lines)
 return changed.replace('apt-get -y --download-only ','apt-get -y --allow-downgrades --download-only ').replace('apt-get -y --no-download ','apt-get -y --allow-downgrades --no-download ').encode()

def build_exact_five_downgrades(plan):
 need(preparation_remaining(plan)<=1800,'PREPARATION_WINDOW_TOO_LONG');trusted(ROOT);need(stat.S_IMODE(ROOT.stat().st_mode)==0o700,'RETAINED_ROOT_MODE_DIFFERS')
 original='t45-f35-5b26-prepare-20261105-01';resume='t45-f35-5b26-resume-image-20261105-01';offline='t45-f35-5b26-offline-load-image-20261105-01';local='t45-f35-5b26-local-oci-context-20261105-01'
 need(plan['operationId'] not in [original,resume,offline,local],'NEW_EXTERNAL_OPERATION_REQUIRED')
 started=read_file(ROOT/'prepare-started.json',65536);need(sha(started)=='b0bf4414547430508b20d5cd7a6acc3b58fa44072952cea20c482df236e0205b' and strict(started)=={'operationId':original,'sourceSet':SOURCE,'archiveSHA256':ARCHIVE_SHA},'ORIGINAL_PREPARATION_BINDING_DIFFERS')
 for job,phase in [(original,'prepare-image'),(resume,'resume-image'),(offline,'offline-load-image'),(local,'build-local-oci-context')]:
  need(strict(read_file(PRIVATE/job/'results'/('fresh35-'+phase+'-result.json'),65536,True))=={'errorCode':'COMMAND_FAILED_1','phase':phase,'status':'STOP_OR_UNKNOWN_NO_REPLAY'},'ORIGINAL_TERMINAL_FAILURE_CHAIN_REQUIRED')
 need(strict(read_file(ROOT/'image-resume-intent.json',65536))=={'operationId':resume,'originalOperationId':original,'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'base':BASE,'expiresAt':1793882348609},'ORIGINAL_RESUME_INTENT_DIFFERS')
 need(strict(read_file(ROOT/'offline-image-intent.json',65536))=={'operationId':offline,'originalOperationId':original,'resumeOperationId':resume,'sourceSet':SOURCE,'offlineArchive':OFFLINE_SHA,'base':BASE,'expiresAt':1793884588020} and strict(read_file(ROOT/'offline-image-build-intent.json',65536))=={'base':BASE,'operation':offline},'ORIGINAL_OFFLINE_INTENTS_DIFFER')
 prior=strict(read_file(PRIVATE/offline/'results/fresh35-image-build-command.json',65536,True))
 need(prior.get('command')=='docker build' and prior.get('stage')=='image-build' and prior.get('exitCode')==1 and prior.get('timedOut') is False and isinstance(prior.get('stderr'),str) and all(x in prior['stderr'] for x in [BASE,'Dockerfile:1','load metadata','https://registry-1.docker.io/v2/library/debian/manifests/sha256:'+BASE_MANIFEST_SHA,'connection reset by peer']),'ORIGINAL_FROM_METADATA_FAILURE_REQUIRED')
 local_failure=strict(read_file(PRIVATE/local/'results/fresh35-local-context-build-command.json',65536,True))
 need(local_failure.get('command')=='docker buildx build' and local_failure.get('stage')=='local-context-build' and local_failure.get('exitCode')==1 and local_failure.get('timedOut') is False and isinstance(local_failure.get('stderr'),str) and all(x in local_failure['stderr'] for x in ['OCI load from client','InRelease','Packages were downgraded','without --allow-downgrades',*EXACT_DOWNGRADES]),'ORIGINAL_EXACT_FIVE_DOWNGRADE_FAILURE_REQUIRED')
 need(strict(read_file(ROOT/'local-oci-context-intent-r1.json',65536))=={'operationId':local,'priorOfflineOperationId':offline,'sourceSet':SOURCE,'base':BASE,'offlineArchive':OFFLINE_SHA,'expiresAt':1793886377837},'ORIGINAL_LOCAL_CONTEXT_INTENT_DIFFERS')
 receipt=strict(read_file(ROOT/'offline-base-receipt.json',65536));need(set(receipt)=={'base','actualBaseImageID','layers','archive','operationId','loadedExactBase'} and receipt['base']==BASE and receipt['layers']==[BASE_DIFF_ID] and receipt['archive']==OFFLINE_SHA and receipt['operationId']==offline and receipt['loadedExactBase'] is True,'ORIGINAL_BASE_LOAD_RECEIPT_REQUIRED')
 for name in ['image-build-intent.json','image.iid','image-receipt.json','start-intent.json','container-receipt.json','image-resume-build-intent.json','image-resume.iid','image-offline.iid','image-local-oci-context-r1.iid','exact-five-downgrade-intent-r1.json','image-context-exact-five-r1','exact-five-recipe-r1.json','image-exact-five-r1.iid']:
  p=ROOT/name;need(not p.exists() and not p.is_symlink(),'NOT_ORIGINAL_EXACT_FIVE_RETRY_STATE')
 need(sha(read_file(ROOT/'metadata/deployment-manifest.json',1024*1024))==MANIFEST_SHA and sha(read_file(ROOT/'metadata/debian-runtime-dependency-lock.json',1024*1024))==LOCK_SHA,'RETAINED_MANIFEST_OR_LOCK_DIFFERS')
 need(strict(read_file(ROOT/'metadata/source-descriptor.json',1024*1024))['sourceSetSha256']==SOURCE,'RETAINED_SOURCE_DIFFERS')
 for key,digest,size,authority in [(KEY,ARCHIVE_SHA,ARCHIVE_BYTES,plan['stagingAuthoritySha256']),(OFFLINE_KEY,OFFLINE_SHA,OFFLINE_BYTES,'a24505c9670723303c24dbd9ccf39da9a152ef8f3a92a1226a0ae85c4a83025a')]:
  target=CONTROL/'artifacts'/key;r=strict(read_file(target/'ready.json',65536,root=False));need(r.get('status')=='READY' and r.get('artifactKey')==key and r.get('sourceSetSha256')==SOURCE and r.get('archiveSha256')==digest and r.get('archiveBytes')==size and r.get('authoritySha256')==authority,'ORIGINAL_STAGED_READYS_DIFFER')
  f=trusted(target/'archive.bin',False).lstat();need(f.st_uid==1000 and f.st_size==size and not f.st_mode&0o077 and stat.S_ISREG(f.st_mode) and f.st_nlink==1 and [f.st_dev,f.st_ino,f.st_size,f.st_mtime_ns,f.st_ctime_ns]==r.get('fileIdentity'),'STAGED_IDENTITY_CHANGED')
 ctx=trusted(ROOT/'image-context')
 for name,expected in [('Dockerfile','ca5df9e09e6d5d47f2ea8182a42cbfcb954414ccf73fbaaa59ab70b5eb93d36e'),('install-locked.sh','4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560')]:need(sha(read_file(ctx/name,65536))==expected,'RETAINED_IMAGE_RECIPE_DIFFERS')
 raw=read_file(ROOT/'offline-base.oci.tar',OFFLINE_BYTES,True);offline_archive(raw)
 version=run(['docker','buildx','version'],seconds=min(15,preparation_remaining(plan)),public_stage='builder-version').decode().strip()
 need(version=='github.com/docker/buildx v0.37.1 0b265a9f62db554fa9aba6dd19e1bd5704bc7d8a','EXACT_BUILDX_VERSION_REQUIRED')
 info=run(['docker','buildx','inspect','default'],seconds=min(15,preparation_remaining(plan)),public_stage='builder-inspect').decode();lines=[x.strip() for x in info.splitlines()]
 def values(label):return [x.split(':',1)[1].strip() for x in lines if x.startswith(label+':')]
 need(values('Name')==['default','default'] and values('Driver')==['docker'] and values('Status')==['running'] and values('BuildKit version')==['v0.33.1'] and len(values('Platforms'))==1 and 'linux/amd64' in [x.strip() for x in values('Platforms')[0].split(',')],'EXACT_EXISTING_BUILDER_REQUIRED')
 fmt='{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"repoDigests":{{json .RepoDigests}},"layers":{{json .RootFS.Layers}}}'
 base=strict(run(['docker','image','inspect','--format',fmt,BASE],seconds=min(15,preparation_remaining(plan)),public_stage='image-inspect'));refs={BASE,'debian@sha256:'+BASE_MANIFEST_SHA,'library/debian@sha256:'+BASE_MANIFEST_SHA}
 need(base.get('id')==receipt['actualBaseImageID'] and isinstance(base.get('id'),str) and re.fullmatch('sha256:[a-f0-9]{64}',base['id']) and base.get('os')=='linux' and base.get('arch')=='amd64' and bool(refs.intersection(base.get('repoDigests') or [])) and base.get('layers')==[BASE_DIFF_ID],'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED')
 layout=trusted(ROOT/'local-base-oci-context-r1');need(stat.S_IMODE(layout.stat().st_mode)==0o700,'ORIGINAL_LOCAL_OCI_LAYOUT_MODE_DIFFERS')
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as t:
  for m in t:need(read_file(layout/m.name,m.size)==t.extractfile(m).read(),'ORIGINAL_LOCAL_OCI_MEMBER_DIFFERS')
 original_script=read_file(ctx/'install-locked.sh',65536);script=exact_five_recipe(original_script)
 newctx=ROOT/'image-context-exact-five-r1';iid=ROOT/'image-exact-five-r1.iid'
 new_json(ROOT/'exact-five-downgrade-intent-r1.json',{'operationId':plan['operationId'],'priorLocalContextOperationId':local,'base':BASE,'sourceSet':SOURCE,'allowedExactDowngrades':EXACT_DOWNGRADES,'expiresAt':plan['imagePreparationExpiresAt']})
 import shutil
 def copy_regular(src,dst):
  src=trusted(Path(src));st=src.lstat();need(stat.S_ISREG(st.st_mode) and st.st_nlink==1,'ORIGINAL_REGULAR_CONTEXT_FILE_REQUIRED');return shutil.copy2(src,dst,follow_symlinks=False)
 shutil.copytree(ctx,newctx,symlinks=True,copy_function=copy_regular)
 for member in newctx.rglob('*'):need(not member.is_symlink(),'CONTEXT_LINK_REFUSED')
 os.chmod(newctx,0o700)
 replacement=trusted(newctx/'install-locked.sh');fd=os.open(replacement,os.O_WRONLY|os.O_TRUNC|os.O_NOFOLLOW)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(script);f.flush();os.fsync(fd)
 finally:os.close(fd)
 need(read_file(ctx/'install-locked.sh',65536)==original_script and read_file(newctx/'Dockerfile',65536)==read_file(ctx/'Dockerfile',65536),'ORIGINAL_RECIPE_WAS_CHANGED')
 new_json(ROOT/'exact-five-recipe-r1.json',{'originalInstallSHA256':sha(original_script),'newInstallSHA256':sha(script),'base':BASE,'lockSHA256':LOCK_SHA,'allowedExactDowngrades':EXACT_DOWNGRADES,'operationId':plan['operationId']})
 context=BASE+'=oci-layout://'+str(layout)+'@sha256:'+BASE_MANIFEST_SHA
 run(['docker','buildx','build','--builder','default','--platform','linux/amd64','--pull=false','--build-context',context,'--iidfile',str(iid),str(newctx)],seconds=preparation_remaining(plan),public_stage='exact-five-build')
 log=strict(read_file(Path(os.environ['ERP_SHARED_JOB_DIR'])/'results/fresh35-exact-five-build-command.json',65536,True));visible=log.get('stdout','')+'\n'+log.get('stderr','')
 need(not ('registry-1.docker.io' in visible and re.search(r'\bHEAD\b',visible,re.I)),'REMOTE_METADATA_OBSERVED_NO_FALLBACK')
 image=read_file(iid,1024).decode().strip();need(re.fullmatch('sha256:[a-f0-9]{64}',image),'ACTUAL_IMAGE_ID_REQUIRED')
 obs=strict(run(['docker','image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image],seconds=min(15,preparation_remaining(plan)),public_stage='derived-image-inspect'));need(obs=={'id':image,'os':'linux','arch':'amd64'},'ACTUAL_IMAGE_PLATFORM_DIFFERS')
 new_json(ROOT/'image-receipt.json',{'image':image,'base':BASE,'operationId':plan['operationId'],'sourceSet':SOURCE,'archive':ARCHIVE_SHA,'standardAPTAndLddBuildExitZero':True,'offlineArchive':OFFLINE_SHA,'localOCIContext':True,'exactFiveDowngrades':True});return {'status':'IMAGE_PREPARED_NO_DB_WINDOW','image':image,'base':BASE,'localOCIContext':True,'exactFiveDowngrades':True}

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
 parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['prepare-image','resume-image','offline-load-image','build-local-oci-context','build-exact-five-downgrades','start-target','deliver-install','observe'],required=True);parser.add_argument('--plan',required=True);parser.add_argument('--plan-sha256',required=True);parser.add_argument('--external-input');parser.add_argument('--external-sha256');parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 need(args.execute,'EXPLICIT_EXECUTION_NOT_REQUESTED');need(os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_DISPATCHER_REQUIRED')
 job=trusted(Path(os.environ['ERP_SHARED_JOB_DIR']));need(job.parent==PRIVATE and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',job.name),'ORIGINAL_PRIVATE_JOB_REQUIRED');plan=load_plan(args.plan,args.plan_sha256);result=None
 try:
  if args.phase=='prepare-image':result=prepare_image(plan)
  elif args.phase=='resume-image':result=resume_image(plan)
  elif args.phase=='build-local-oci-context':result=build_local_oci_context(plan)
  elif args.phase=='build-exact-five-downgrades':result=build_exact_five_downgrades(plan)
  elif args.phase=='offline-load-image':
   need(args.external_input and args.external_sha256,'EXTERNAL_OFFLINE_STAGING_INPUT_REQUIRED');result=offline_load_image(plan,args.external_input,args.external_sha256)
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
