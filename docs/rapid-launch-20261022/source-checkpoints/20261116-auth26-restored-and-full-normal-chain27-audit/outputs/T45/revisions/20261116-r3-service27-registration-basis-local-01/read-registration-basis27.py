"""Read exact selected registrar basis and original keys only. Never invoke registration."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex
H=Path(__file__).resolve().parent;REPO=H.parents[3]
registrar=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE27-FULLCHAIN-01/register_cas.py'
rhash=hashlib.sha256(registrar.read_bytes()).hexdigest()
assert rhash=='e868374a7de44e592195c85cc26cd1ac1d4d1fd6cb02b532d8ff8787b3df9337','FINAL_REGISTRAR_SOURCE_CHANGED_DO_NOT_READ_OR_REPLACE'
basis=runpy.run_path(str(registrar))
expected={str(p):h for p,h in basis['BASIS'].items()};keys=[v for k,v in basis['JOBS'].items() if k!='materialize']
assert len(keys)==6
paths=[str(basis[k]) for k in ('ENTRY','AUDIT','NEW_MODULE','NEW_POLICY')]
paths += [str(basis['P']/'.direct27-fullchain-dispatcher.pending')]
client=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py'
assert hashlib.sha256(client.read_bytes()).hexdigest()=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']()
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
EXPECTED=EXPECTED_LITERAL
KEYS=KEYS_LITERAL
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
present=[]
for grant in ['b16447fbc81f4d64','5cc58239751e4e2a']:
 c=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+grant)
 b=Path('/root/erp-release-20261006-01-worker')/('grant-'+grant)
 for key in KEYS:
  found=[str(p) for p in (c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'jobs'/key,c/'results'/(key+'.json'),b/'jobs'/key) if os.path.lexists(p)]
  if found:present.append({'grant':grant,'key':key,'presentPaths':found})
root=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5)
containers=[]
for cid in ['f855a86b0eab87bc6ec273386e566c3b93c67f560d90392318edaa15b3a74187','43cadec18a77343fc97d67d87912b033077b44d9ae37f5295d63a872c2e370ab','698334aec0449e513c9e6d082e5d0e11e8f277bb12cd7b5baf0758c8c7011981']:
 c=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid],capture_output=True,check=True,timeout=5)
 containers.append({'id':cid,**json.loads(c.stdout)})
proof,_=read(root/'state/installed-real-operation-batched-root03-20261116-01/source-materialization.json')
assert sha(proof)=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec'
materialization=json.loads(proof);assert materialization['sourceSetSha256']=='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e'
material_key='t45-r3-batched-root03-source-delta-20261116-01'
material_terminal,_=read(Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/material_key/'r3-outer-terminal.json')
assert sha(material_terminal)=='db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8' and json.loads(material_terminal)['status']=='COMPLETED'
other=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a');oc=Path('/home/naijue/erp-release-20261006-01-control/grant-5cc58239751e4e2a')
assert not any(os.path.lexists(p) for p in (other/'jobs'/material_key,oc/'jobs'/material_key,oc/'requests'/(material_key+'.json'),oc/'requests'/(material_key+'.tmp'),oc/'results'/(material_key+'.json')))
q25=subprocess.run(['/usr/bin/docker','ps','-a','--no-trunc','--filter','label=t45.operation=t45-first-r3-native-service-start-20261116-26','--format','{{.ID}}'],capture_output=True,check=True,timeout=5)
assert not q25.stdout.strip()
grant_file=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/grant.json')
grant_raw,grant_meta=read(grant_file)
grant=json.loads(grant_raw);expiry=grant.get('expiresAtEpoch')
assert type(expiry) in (int,float) and 0<expiry<10**11,'ACTUAL_GRANT_EXPIRY_METADATA_MISSING_OR_INVALID'
port=subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,check=True,timeout=5)
current_containers={}
for generation in (26,27):
 key='t45-first-r3-native-service-start-20261116-'+str(generation)
 raw=subprocess.run(['/usr/bin/docker','ps','-a','--no-trunc','--filter','label=t45.operation='+key,'--format','{{.ID}}'],capture_output=True,check=True,timeout=5).stdout
 current_containers[key]=raw.decode().splitlines()
marker=root/'state/native-services/ordinary26-auth-20261116-01/restored.json'
st=marker.lstat();assert stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o077
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'oldIdentities':old,'actualPins':pins,
 'grantExpiresAtEpoch':expiry,'grantExpiryIdentity':ident(grant_meta),'grantExpiresAtUTC':datetime.fromtimestamp(expiry,timezone.utc).isoformat(),
 'targetPortAbsent':not port.stdout.strip(),'currentContainers':current_containers,
 'original26RestoredMarkerMetadata':{'uid':st.st_uid,'gid':st.st_gid,'mode':stat.S_IMODE(st.st_mode),'bytes':st.st_size},
 'basisMismatches':mismatches,'executionLockMatches':old['executionLock']==LOCK_ID,'candidateKeys':KEYS,
 'presentCandidateKeys':present,'registrationPaths':{p:os.path.lexists(p) for p in PATHS},
 'activeOperationUnits':[x.split()[0] for x in q.stdout.decode().splitlines() if x.strip()],
 'postmasterPidAbsent':not os.path.lexists(root/'state'/root.name/'data/postmaster.pid'),
 'priorContainers':containers,'acceptedMaterializationSha256':sha(proof),'databaseConnections':0,'mutations':0,'originalKeysResubmitted':False},sort_keys=True))
'''.replace('EXPECTED_LITERAL',repr(expected)).replace('KEYS_LITERAL',repr(keys)).replace('PATHS_LITERAL',repr(paths)).replace('LOCK_LITERAL',repr(basis['LOCK_ID']))
raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
p=H/('REGISTRATION-BASIS27-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
with p.open('xb') as f:f.write(raw)
v=json.loads(raw)
print(json.dumps({'receipt':str(p),'sha256':hashlib.sha256(raw).hexdigest(),'registrarSourceReadSha256':rhash,**{k:v[k] for k in ('checkedAtUTC','grantExpiresAtEpoch','grantExpiresAtUTC','targetPortAbsent','currentContainers','basisMismatches','executionLockMatches','presentCandidateKeys','registrationPaths','activeOperationUnits','postmasterPidAbsent','priorContainers','acceptedMaterializationSha256','mutations')}},sort_keys=True))
