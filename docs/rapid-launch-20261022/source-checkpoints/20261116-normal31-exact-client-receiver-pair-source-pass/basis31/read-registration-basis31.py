"""One original-channel read of the exact registrar basis; no registration calls."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex

H=Path(__file__).resolve().parent
REPO=H.parents[3]
REGISTRAR=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE31-INSTALL-TRANSPORT-02/register_cas.py'
REGISTRAR_SHA='6c9468dc661d64d629f71e2bf3a24e9b899a68f22beaa801705f10f33481f169'
RULES=REPO/'outputs/T45/revisions/20261116-r3-normal31-source-local-01/CANDIDATE-01/PHASES31.UNISSUED.json'
RULES_SHA='5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf'
CLIENT=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py'
CLIENT_SHA='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]

PROGRAM=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
EXPECTED=EXPECTED_LITERAL
JOBS=JOBS_LITERAL
PATHS=PATHS_LITERAL
LOCK_ID=LOCK_LITERAL
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
sha=lambda b:hashlib.sha256(b).hexdigest()
def ident(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def read(p,limit=524288,owner=0):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=limit
  body=f.read(limit+1);assert len(body)==s.st_size and ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat())
 return body,s
def metadata(p):
 if not os.path.lexists(p):return {'present':False}
 s=p.lstat()
 return {'present':True,'identity':ident(s),'directory':stat.S_ISDIR(s.st_mode),'regular':stat.S_ISREG(s.st_mode),'symlink':stat.S_ISLNK(s.st_mode)}
def call(argv):
 q=subprocess.run(argv,capture_output=True,timeout=5,check=True)
 assert not q.stderr
 return q.stdout
old={};pins={};mismatches=[];errors=[];bodies={}
for name,pin in EXPECTED.items():
 try:
  body,s=read(Path(name));actual=sha(body);old[name]=ident(s);pins[name]=actual;bodies[name]=body
  if actual!=pin:mismatches.append({'path':name,'expectedSha256':pin,'actualSha256':actual})
 except Exception as error:
  errors.append({'stage':'BASIS_READ','path':name,'exceptionClass':type(error).__name__})
  mismatches.append({'path':name,'expectedSha256':pin,'actualSha256':None})
lock=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
try:old['executionLock']=ident(lock.lstat())
except Exception as error:errors.append({'stage':'EXECUTION_LOCK_METADATA','path':str(lock),'exceptionClass':type(error).__name__})
candidate_jobs={phase:key for phase,key in JOBS.items() if phase!='materialize'}
keys=list(candidate_jobs.values());present=[];key_facts=[]
parent_material_key='t45-r3-batched-root03-source-delta-20261116-01'
accepted_material=None;material_terminal=None;parent_material_state=None
for grant in ('b16447fbc81f4d64','5cc58239751e4e2a'):
 c=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+grant)
 worker=B.with_name('grant-'+grant)
 for phase,key in candidate_jobs.items():
  paths=(c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'jobs'/key,c/'results'/(key+'.json'),worker/'jobs'/key)
  found=[str(p) for p in paths if os.path.lexists(p)]
  key_facts.append({'grant':grant,'phase':phase,'key':key,'state':'PRESENT_READ_ORIGINAL_ONLY' if found else 'ABSENT'})
  if found:present.append({'grant':grant,'phase':phase,'key':key,'presentPaths':found})
 # Historical03 is an independent accepted baseline, never the new04 action.
 if grant=='b16447fbc81f4d64':
  try:
   key=parent_material_key;root=worker/'jobs'/key/'r3-outer-terminal.json'
   raw,_=read(root);public,_=read(c/'results'/(key+'.json'),owner=1000);terminal=json.loads(raw)
   assert sha(raw)=='db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8' and raw==public
   assert (terminal['jobId'],terminal['status'],terminal['exitCode'])==(key,'COMPLETED',0)
   proof,_=read(R/'state/installed-real-operation-batched-root03-20261116-01/source-materialization.json')
   result,_=read(worker/'jobs'/key/'results/batched-source-materialization.json')
   public_result,_=read(c/'jobs'/key/'results/batched-source-materialization.json',owner=1000)
   assert sha(proof)==sha(result)=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec'
   value=json.loads(proof);assert value==json.loads(public_result)
   assert value['sourceSetSha256']=='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e'
   assert value['sourceRowsSha256']=='399d3ac7ce1e7d903ba37b7243ea3c9d694712d9cb8f9fec06137125d7c89109' and value['sourceFiles']==381
   assert value['requestKey']==key and value['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
   assert value['sourceRoot']==str(R/'state/installed-real-operation-batched-root03-20261116-01/operation')
   accepted_material=sha(proof);material_terminal=sha(raw)
   parent_material_state='EXACT_EXISTING_COMPLETED_PARENT03_ONLY_NEVER_RESUBMIT'
  except Exception as error:
   parent_material_state='PARENT03_MATERIALIZATION_UNCONFIRMED'
   errors.append({'stage':'EXISTING_PARENT03_MATERIALIZATION','path':str(worker/'jobs'/parent_material_key),'exceptionClass':type(error).__name__})
 else:
  parent_paths=(c/'requests'/(parent_material_key+'.json'),c/'requests'/(parent_material_key+'.tmp'),c/'jobs'/parent_material_key,c/'results'/(parent_material_key+'.json'),worker/'jobs'/parent_material_key)
  if any(os.path.lexists(p)for p in parent_paths):errors.append({'stage':'LEGACY_GRANT_PARENT03_PRESENT_READ_ORIGINAL_ONLY'})
# Historical03 remains independent; actual completed04 is the accepted reused material.
parent_material_sha=accepted_material;parent_material_terminal=material_terminal
accepted_material=None;material_terminal=None;material04_state='ACTUAL04_UNCONFIRMED'
try:
 key=JOBS['materialize'];worker=B;c=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
 raw=bodies[str(worker/'jobs'/key/'r3-outer-terminal.json')]
 public,_=read(c/'results'/(key+'.json'),owner=1000)
 terminal=json.loads(raw)
 assert raw==public and (terminal['jobId'],terminal['status'],terminal['exitCode'])==(key,'COMPLETED',0)
 proof=bodies[str(R/'state/installed-real-operation-batched-root04-20261116-01/source-materialization.json')]
 root=bodies[str(worker/'jobs'/key/'results/batched-source-materialization.json')]
 public_result,_=read(c/'jobs'/key/'results/batched-source-materialization.json',owner=1000)
 assert sha(proof)==sha(root)=='8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1'
 assert sha(public_result)=='c2d8962828b43efa37fcf6490c0874a4ebabb995e6dc9ad54ab7527f1d44150a'
 value=json.loads(proof);assert value==json.loads(public_result)
 assert value['requestKey']==key and value['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
 assert value['sourceSetSha256']=='ba6c85d25118972ba81e859a0539a854a6cb39f4360b47ed35914fdbcf183663'
 assert value['sourceRowsSha256']=='ea377da72415020f91f0f5eb9c5988dd9134cabe76e502eeceae1a30b14eafa7' and value['sourceFiles']==382
 assert value['sourceRoot']==str(R/'state/installed-real-operation-batched-root04-20261116-01/operation')
 accepted_material=sha(proof);material_terminal=sha(raw);material04_state='EXACT_EXISTING_COMPLETED04_REUSED_NEVER_RESUBMIT'
except Exception as error:errors.append({'stage':'EXISTING_ACTUAL04_MATERIALIZATION','exceptionClass':type(error).__name__})
registration_paths={p:metadata(Path(p)) for p in PATHS}
units=None;port_absent=None;containers=[];current_containers={}
try:
 raw=call(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating',
  'naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'])
 units=[s.split()[0] for s in raw.decode().splitlines() if s.strip()]
except Exception as error:errors.append({'stage':'OPERATION_UNITS','exceptionClass':type(error).__name__})
try:port_absent=not call(['/usr/bin/ss','-H','-ltn','sport = :56791']).strip()
except Exception as error:errors.append({'stage':'TARGET_PORT','exceptionClass':type(error).__name__})
for cid in ('4ef547cb7a3acdf82b8c85a32c75e46f71dbf1ea850c205a1f0d755ab00922aa',
            'b3d228b01df1ce1505f7bd8c94d6a3a65cc694e2e8e08a6b719053cef0be745c',
            '653f00ffc45e11e63c3bcd9a137fbc1293553cb3966e5403f415587942b2279e'):
 try:
  form='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"startedAt":{{json .State.StartedAt}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
  value=json.loads(call(['/usr/bin/docker','inspect','--format',form,cid]));assert value['id']==cid
  containers.append(value)
 except Exception as error:errors.append({'stage':'OWNED30_CONTAINER','id':cid,'exceptionClass':type(error).__name__})
for generation in (26,31):
 key='t45-first-r3-native-service-start-20261116-'+str(generation)
 try:current_containers[key]=call(['/usr/bin/docker','ps','-a','--no-trunc','--filter','label=t45.operation='+key,'--format','{{.ID}}']).decode().splitlines()
 except Exception as error:
  current_containers[key]=None;errors.append({'stage':'CANDIDATE_CONTAINER_LIST','key':key,'exceptionClass':type(error).__name__})
expiry=None;expiry_identity=None;expiry_utc=None
try:
 raw,s=read(P/'grant.json');value=json.loads(raw);expiry=value.get('expiresAtEpoch')
 assert type(expiry) in (int,float) and 0<expiry<10**11
 expiry_identity=ident(s);expiry_utc=datetime.fromtimestamp(expiry,timezone.utc).isoformat()
except Exception as error:errors.append({'stage':'ACTUAL_GRANT_EXPIRY_METADATA','exceptionClass':type(error).__name__})
marker=R/'state/native-services/ordinary30-auth-20261116-01/restored.json'
marker_meta=metadata(marker)
if marker_meta['present']:
 s=marker.lstat();marker_meta.update(uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),bytes=s.st_size)
 marker_meta['protectedRestoredMarker']=stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077
restoration_receipt=False;source30={};completed30={}
try:
 control=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
 def pair(key,leaf,public_pin):
  raw=bodies[str(B/'jobs'/key/'results'/leaf)]
  public,_=read(control/'jobs'/key/'results'/leaf,owner=1000)
  assert sha(public)==public_pin and json.loads(raw)==json.loads(public)
  return json.loads(raw)
 key='t45-first-r3-native-service-start-20261116-30';stop='t45-r3-ordinary30-preserve-stop-20261116-01';restore_key='t45-r3-ordinary30-auth-restore-20261116-01'
 for k in (key,stop,restore_key):
  raw=bodies[str(B/'jobs'/k/'r3-outer-terminal.json')];public,_=read(control/'results'/(k+'.json'),owner=1000)
  terminal=json.loads(raw);assert raw==public and (terminal['jobId'],terminal['status'],terminal['exitCode'])==(k,'COMPLETED',0)
 normal=pair(key,'normal-service-result.json','161b4c3cb53b057746f8fd246ea79aff8b030eb0a45e4743158f3a110f0f4fe6')
 stopped=pair(stop,'normal05-preserve-stop-result.json','46969fd0fb6dd5452f1b8e289248b0b0704dfc4a0e1a0e9bbc4c9eee0e9285d6')
 restored=pair(restore_key,'maintenance-auth-result.json','778bafff2ccebbb40edde23b75e677b7aebbecd0d266e44f78a7bb6e95037013')
 proof_path=R/'authority/fresh35-current-production-service-v2-service-30.json';proof=json.loads(bodies[str(proof_path)])
 boot=R/'state/native-services'/key;clean=json.loads(bodies[str(boot/'cleanup.json')])
 ack_raw,_=read(boot/'retained-ack.json');ack=json.loads(ack_raw)
 assert sha(ack_raw)=='602335813cab4a66c9b5d3e741203e5486a99ef2fd026125b470b880756e4218'
 assert ack=={'requestKey':key,'proofSha256':pins[str(proof_path)],'serviceLeaseExpiresAt':proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']}
 assert normal['requestKey']==key and normal['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE'
 assert normal['proofSha256']==pins[str(proof_path)] and normal['cid']=='4ef547cb7a3acdf82b8c85a32c75e46f71dbf1ea850c205a1f0d755ab00922aa'
 assert stopped['requestKey']==stop and stopped['status']=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED'
 assert stopped['pgStopped'] is True and stopped['cleanupSha256']==pins[str(boot/'cleanup.json')]
 assert stopped['businessAdvanced'] is False and stopped['originalKeyReplayed'] is False
 assert clean['requestKey']==key and clean['runtimeMaterialPreserved'] is True
 assert all(clean['cleanup'][k] is True for k in ('cleanupComplete','cleanShutdown','ownedPidAbsent','portAbsent','dataPreserved'))
 assert clean['cleanup']['databasePrivilegesChanged'] is False and clean['cleanup']['errors']==[]
 inner=restored['result'];cleanup=restored['cleanup']
 assert restored['requestKey']==restore_key and restored['phase']=='restore'
 assert inner['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inner['databaseStillStopped'] is True
 assert all(inner[k] is False for k in ('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
 assert cleanup['ownContainerStopped'] is True and cleanup['ownedPidAbsent'] is True
 birth=proof['sharedPostgresNamespace']['container']
 assert proof['requestKey']==key and birth['id']==normal['cid'] and birth['startedAt']=='2026-11-15T23:13:26.882383571Z'
 assert proof['physical']['postmasterStart']=='2026-11-15 23:13:28.123147+00'
 assert proof['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448}
 assert marker_meta.get('protectedRestoredMarker') is True
 restoration_receipt=True
 source30={'path':str(proof_path),'sha256':pins[str(proof_path)],'metadata':metadata(proof_path),
  'requestKey':key,'physical':proof['physical'],'container':birth,'historicalStoppedService':True}
 completed30={'closureKind':'COMPLETED_START_CLEAN_STOP_AUTH_RESTORED','requestKey':key,'terminalStatus':'COMPLETED','exitCode':0,
  'terminalSha256':pins[str(B/'jobs'/key/'r3-outer-terminal.json')],
  'stopRequestKey':stop,'stopTerminalSha256':pins[str(B/'jobs'/stop/'r3-outer-terminal.json')],
  'stopRootResultSha256':pins[str(B/'jobs'/stop/'results/normal05-preserve-stop-result.json')],
  'cleanupSha256':pins[str(boot/'cleanup.json')],'retainedAckSha256':sha(ack_raw),
  'restoreRequestKey':restore_key,'restoreTerminalSha256':pins[str(B/'jobs'/restore_key/'r3-outer-terminal.json')],
  'restoreRootResultSha256':pins[str(B/'jobs'/restore_key/'results/maintenance-auth-result.json')],
  'cleanDataVerified':True,'privateRestoredMarkerMetadataVerified':marker_meta.get('protectedRestoredMarker') is True}
except Exception as error:errors.append({'stage':'ORIGINAL30_NONSECRET_CLOSURE_RECEIPTS','exceptionClass':type(error).__name__})
data=R/'state'/R.name/'data'
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'oldIdentities':old,'actualPins':pins,
 'basisMismatches':mismatches,'executionLockMatches':old.get('executionLock')==LOCK_ID,
 'grantExpiresAtEpoch':expiry,'grantExpiryIdentity':expiry_identity,'grantExpiresAtUTC':expiry_utc,
 'candidateKeys':keys,'presentCandidateKeys':present,'candidateKeyStates':key_facts,
 'registrationPaths':{p:v['present'] for p,v in registration_paths.items()},'registrationPathMetadata':registration_paths,
 'activeOperationUnits':units,'targetPortAbsent':port_absent,'postmasterPidAbsent':not os.path.lexists(data/'postmaster.pid'),
 'dataMetadata':metadata(data),'priorContainers':containers,'allThree30ContainersStopped':len(containers)==3 and all(v['running'] is False and v['pid']==0 for v in containers),
 'currentContainers':current_containers,'original30RestoredMarkerMetadata':marker_meta,
 'original30AuthenticationRestorationReceiptVerified':restoration_receipt,'privateAuthenticationRechecked':False,
 'current30SourceProof':source30,'current30CompletedClosure':completed30,
 'acceptedMaterializationSha256':accepted_material,'acceptedMaterializationTerminalSha256':material_terminal,
 'acceptedMaterializationMeaning':'ACTUAL_COMPLETED04_REUSED_NEVER_RESUBMIT','parentMaterializationRequestKey':parent_material_key,'parentMaterializationState':parent_material_state,'parentMaterializationSha256':parent_material_sha,'parentMaterializationTerminalSha256':parent_material_terminal,
 'materializationReusedFromKey':JOBS['materialize'],'materializationReuseState':material04_state,'materializeNeverResubmit':True,
 'readErrors':errors,'databaseConnections':0,'mutations':0,'privateAuthenticationBodiesRead':False,
 'originalKeysResubmitted':False,'registrationExecuted':False},sort_keys=True))
'''

def prepare():
    raw=REGISTRAR.read_bytes();assert hashlib.sha256(raw).hexdigest()==REGISTRAR_SHA
    value=runpy.run_path(str(REGISTRAR),run_name='local_metadata_only')
    assert hashlib.sha256(RULES.read_bytes()).hexdigest()==RULES_SHA
    rules=json.loads(RULES.read_bytes())
    expected={str(p):pin for p,pin in value['BASIS'].items()};jobs=value['JOBS']
    assert len(expected)==128 and jobs=={phase:rule['jobId'] for phase,rule in rules['jobs'].items()}
    assert value['LOCK_ID']==LOCK_ID
    paths=[str(value['ENTRY'].parent),str(value['ENTRY']),str(value['AUDIT']),str(value['NEW_MODULE']),str(value['NEW_POLICY']),
           str(value['P']/'.direct27-fullchain-dispatcher.pending')]
    program=PROGRAM.replace('EXPECTED_LITERAL',repr(expected)).replace('JOBS_LITERAL',repr(jobs)).replace('PATHS_LITERAL',repr(paths)).replace('LOCK_LITERAL',repr(LOCK_ID))
    return program,expected,jobs,paths

def main():
    program,_,_,_=prepare()
    assert hashlib.sha256(CLIENT.read_bytes()).hexdigest()==CLIENT_SHA
    module=runpy.run_path(str(CLIENT));cfg=module['state']();assert cfg['grantId']=='b16447fbc81f4d64'
    raw=module['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
    path=H/('REGISTRATION-BASIS31-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
    with path.open('xb') as out:out.write(raw)
    value=json.loads(raw)
    print(json.dumps({'receipt':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'registrarSourceReadSha256':REGISTRAR_SHA,
        **{k:value[k] for k in ('checkedAtUTC','basisMismatches','executionLockMatches','grantExpiresAtEpoch','grantExpiresAtUTC',
         'presentCandidateKeys','registrationPaths','activeOperationUnits','targetPortAbsent','postmasterPidAbsent',
         'allThree30ContainersStopped','priorContainers','currentContainers','original30RestoredMarkerMetadata',
         'original30AuthenticationRestorationReceiptVerified','privateAuthenticationRechecked','current30SourceProof','current30CompletedClosure',
         'acceptedMaterializationSha256','acceptedMaterializationTerminalSha256','acceptedMaterializationMeaning','parentMaterializationRequestKey','parentMaterializationState','parentMaterializationSha256','parentMaterializationTerminalSha256',
         'materializationReusedFromKey','materializationReuseState','materializeNeverResubmit','readErrors','mutations')}},sort_keys=True))

if __name__=='__main__':main()
