"""Read exact selected registrar basis and original keys only. Never invoke registration."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex
H=Path(__file__).resolve().parent;REPO=H.parents[3]
registrar=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/RESTORE26-PRECONTAINER-01/register_cas.py'
rhash=hashlib.sha256(registrar.read_bytes()).hexdigest();basis=runpy.run_path(str(registrar))
expected={str(p):h for p,h in basis['BASIS'].items()};keys=list(basis['JOBS'].values())
paths=[str(basis[k]) for k in ('ENTRY','AUDIT','NEW_MODULE')]+[str(basis['ENTRY'].parent)]
paths += [str(basis['P']/'.restore26-precontainer-dispatcher.pending'),str(basis['H']/'.restore26-precontainer-policy.pending')]
client=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py'
assert hashlib.sha256(client.read_bytes()).hexdigest()=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']()
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
EXPECTED=EXPECTED_LITERAL
KEYS=KEYS_LITERAL
KNOWN=KNOWN_LITERAL
PATHS=PATHS_LITERAL
LOCK_ID=LOCK_LITERAL
sha=lambda b:hashlib.sha256(b).hexdigest()
def ident(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def read(p,limit=524288):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=limit
  b=f.read(limit+1);assert len(b)==s.st_size and ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat())
 return b,s
old={};pins={};mismatches=[]
for name,pin in EXPECTED.items():
 b,s=read(Path(name));h=sha(b);old[name]=ident(s);pins[name]=h
 if h!=pin:mismatches.append({'path':name,'expectedSha256':pin,'actualSha256':h})
lock=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/execution.lock')
old['executionLock']=ident(lock.lstat())
present=[];submitted=[]
for grant in ['b16447fbc81f4d64','5cc58239751e4e2a']:
 c=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+grant)
 b=Path('/root/erp-release-20261006-01-worker')/('grant-'+grant)
 for key in KEYS:
  found=[str(p) for p in (c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'jobs'/key,c/'results'/(key+'.json'),b/'jobs'/key) if os.path.lexists(p)]
  if found:
   if grant=='b16447fbc81f4d64' and key in KNOWN:
    raw,_=read(b/'jobs'/key/'r3-outer-terminal.json');t=json.loads(raw)
    assert sha(raw)==KNOWN[key][0] and t['status']==KNOWN[key][1] and t['exitCode']==KNOWN[key][2]
    submitted.append({'grant':grant,'key':key,'status':t['status'],'exitCode':t['exitCode'],'terminalSha256':sha(raw)})
   else:present.append({'grant':grant,'key':key,'presentPaths':found})
root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5)
containers=[]
for cid in ['f855a86b0eab87bc6ec273386e566c3b93c67f560d90392318edaa15b3a74187','43cadec18a77343fc97d67d87912b033077b44d9ae37f5295d63a872c2e370ab']:
 c=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid],capture_output=True,check=True,timeout=5)
 containers.append({'id':cid,**json.loads(c.stdout)})
proof,_=read(root/'state/installed-real-operation-batched-20261115-01/source-materialization.json')
boot=root/'state/native-services/t45-first-r3-native-service-start-20261116-26'
q26=subprocess.run(['/usr/bin/docker','ps','-a','--no-trunc','--filter','label=t45.operation=t45-first-r3-native-service-start-20261116-26','--format','{{.ID}}'],capture_output=True,check=True,timeout=5)
assert not q26.stdout.strip()
bootnames=sorted(p.name for p in boot.iterdir())
assert len(bootnames)==15
assert not os.path.lexists(root/'authority/fresh35-current-production-service-v2-service-26.json')
bootmeta={}
for name in ['authority-61035','launchers-61035']:
 path=boot/name;s=path.lstat();assert stat.S_ISDIR(s.st_mode);bootmeta[name]={'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'children':sorted(p.name for p in path.iterdir())}
for path in (boot/'authority-61035').iterdir():
 s=path.lstat();assert stat.S_ISREG(s.st_mode) and not path.is_symlink();bootmeta[str(path.relative_to(boot))]={'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size}
publiccode={n:sha(read(boot/n)[0]) for n in ['normal_service05_after08.py','normal_service05_after08_proof.py','fresh35-production-carrier.py','r3_05_readonly.py','operator-host.mjs','operator-stream-program.mjs','operator-stream-import-cli.mjs','operator-manifest.json','batched161-run.mjs']}
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'oldIdentities':old,'actualPins':pins,
 'basisMismatches':mismatches,'executionLockMatches':old['executionLock']==LOCK_ID,'candidateKeys':KEYS,
 'presentUnsubmittedKeys':present,'knownSubmittedOriginalKeys':submitted,'registrationPaths':{p:os.path.lexists(p) for p in PATHS},
 'activeOperationUnits':[x.split()[0] for x in q.stdout.decode().splitlines() if x.strip()],
 'postmasterPidAbsent':not os.path.lexists(root/'state'/root.name/'data/postmaster.pid'),
 'priorContainers':containers,'predecessorMaterializationSha256':sha(proof),'failed26ContainerIds':[],'proof26Present':False,'boot26Children':bootnames,'boot26Metadata':bootmeta,'boot26PublicCodePins':publiccode,'authorityBodiesRead':False,'databaseConnections':0,'mutations':0,'originalKeysResubmitted':False},sort_keys=True))
'''.replace('EXPECTED_LITERAL',repr(expected)).replace('KEYS_LITERAL',repr(keys)).replace('PATHS_LITERAL',repr(paths)).replace('LOCK_LITERAL',repr(basis['LOCK_ID'])).replace('KNOWN_LITERAL',repr({'t45-r3-batched-root03-source-delta-20261116-01':('db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8','COMPLETED',0),'t45-r3-ordinary26-auth-apply-20261116-01':('c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0','COMPLETED',0),'t45-first-r3-native-service-start-20261116-26':('853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39','FAILED',2)}))
raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
p=H/('RESTORE26-REGISTRATION-BASIS-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
with p.open('xb') as f:f.write(raw)
v=json.loads(raw)
print(json.dumps({'receipt':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'registrarSourceReadSha256':rhash,**{k:v[k] for k in ('checkedAtUTC','basisMismatches','executionLockMatches','presentUnsubmittedKeys','knownSubmittedOriginalKeys','registrationPaths','activeOperationUnits','postmasterPidAbsent','priorContainers','predecessorMaterializationSha256','mutations')}},sort_keys=True))
