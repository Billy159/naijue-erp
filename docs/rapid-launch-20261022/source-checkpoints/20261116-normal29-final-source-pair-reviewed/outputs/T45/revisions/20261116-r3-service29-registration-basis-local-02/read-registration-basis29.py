"""One original-channel read of the exact registrar basis; no registration calls."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex

H=Path(__file__).resolve().parent
REPO=H.parents[3]
REGISTRAR=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE29-COMPILE-CLASSIFICATION-02/register_cas.py'
REGISTRAR_SHA='75df85f9bb7da65da15f8b8d02b2c2089ed774429c924a8f26e963be851619ab'
RULES=REPO/'outputs/T45/revisions/20261116-r3-normal29-source-local-01/CANDIDATE-01/PHASES29.UNISSUED.json'
RULES_SHA='c0d6763389998c439b4ee1e611f131ce3709a519d13ee5f6dd897591216411e6'
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
keys=[value for phase,value in JOBS.items() if phase!='materialize'];present=[];key_facts=[]
material_key=JOBS['materialize'];accepted_material=None;material_terminal=None
for grant in ('b16447fbc81f4d64','5cc58239751e4e2a'):
 c=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+grant)
 worker=B.with_name('grant-'+grant)
 for phase,key in JOBS.items():
  paths=(c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'jobs'/key,c/'results'/(key+'.json'),worker/'jobs'/key)
  found=[str(p) for p in paths if os.path.lexists(p)]
  if phase=='materialize' and grant=='b16447fbc81f4d64':
   try:
    root=worker/'jobs'/key/'r3-outer-terminal.json';raw,_=read(root);public,_=read(c/'results'/(key+'.json'),owner=1000)
    terminal=json.loads(raw)
    assert sha(raw)=='db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8' and raw==public
    assert (terminal['jobId'],terminal['status'],terminal['exitCode'])==(key,'COMPLETED',0)
    proof,_=read(R/'state/installed-real-operation-batched-root03-20261116-01/source-materialization.json')
    assert sha(proof)=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec'
    assert json.loads(proof)['sourceSetSha256']=='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e'
    accepted_material=sha(proof);material_terminal=sha(raw)
    key_facts.append({'grant':grant,'phase':phase,'key':key,'state':'EXACT_EXISTING_COMPLETED_MATERIALIZATION_ONLY'})
   except Exception as error:
    present.append({'grant':grant,'phase':phase,'key':key,'presentPaths':found,'state':'MATERIALIZATION_UNCONFIRMED'})
    errors.append({'stage':'EXISTING_MATERIALIZATION','path':str(worker/'jobs'/key),'exceptionClass':type(error).__name__})
  else:
   key_facts.append({'grant':grant,'phase':phase,'key':key,'state':'PRESENT_READ_ORIGINAL_ONLY' if found else 'ABSENT'})
   if found:present.append({'grant':grant,'phase':phase,'key':key,'presentPaths':found})
registration_paths={p:metadata(Path(p)) for p in PATHS}
units=None;port_absent=None;containers=[];current_containers={}
try:
 raw=call(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating',
  'naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'])
 units=[s.split()[0] for s in raw.decode().splitlines() if s.strip()]
except Exception as error:errors.append({'stage':'OPERATION_UNITS','exceptionClass':type(error).__name__})
try:port_absent=not call(['/usr/bin/ss','-H','-ltn','sport = :56791']).strip()
except Exception as error:errors.append({'stage':'TARGET_PORT','exceptionClass':type(error).__name__})
for cid in ('0fe68379c491aa5d7cdbdf83eed54d7bb0eae8d3f714d72d5a3ffe1d8efcdcb9',
            'b9020f198b8dafed8c79b6fdffb33766d5912abad40ae45b24b1cb8f5fd28b50',
            '0cbf0e2fa1350650a13dcd1e150359a774fcc566637943ee250936e3aa57ca89'):
 try:
  form='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"startedAt":{{json .State.StartedAt}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
  value=json.loads(call(['/usr/bin/docker','inspect','--format',form,cid]));assert value['id']==cid
  containers.append(value)
 except Exception as error:errors.append({'stage':'OWNED28_CONTAINER','id':cid,'exceptionClass':type(error).__name__})
for generation in (26,29):
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
marker=R/'state/native-services/ordinary28-auth-20261116-01/restored.json'
marker_meta=metadata(marker)
if marker_meta['present']:
 s=marker.lstat();marker_meta.update(uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),bytes=s.st_size)
 marker_meta['protectedRestoredMarker']=stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077
restoration_receipt=False;source28={};failed28={}
try:
 restore_path=B/'jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-result.json'
 restore=json.loads(bodies[str(restore_path)])
 restoration_receipt=(restore['result']['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True
  and restore['result']['naturalExpiryCountedAsRestoration'] is False and restore['result']['runtimeAuthChanged'] is False
  and restore['result']['membershipsOrRoleAttributesChanged'] is False
  and restore['result']['databaseStillStopped'] is True and restore['cleanup']['ownContainerStopped'] is True
  and restore['cleanup']['ownedPidAbsent'] is True
  and pins[str(restore_path)]=='b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc')
 proof_path=R/'authority/fresh35-current-production-service-v2-service-28.json';proof=json.loads(bodies[str(proof_path)])
 source28={'path':str(proof_path),'sha256':pins[str(proof_path)],'metadata':metadata(proof_path),
  'requestKey':proof['requestKey'],'physical':proof['physical'],'historicalStoppedService':True,
  'container':proof['sharedPostgresNamespace']['container']}
 key='t45-first-r3-native-service-start-20261116-28';boot=R/'state/native-services'/key
 terminal=json.loads(bodies[str(B/'jobs'/key/'r3-outer-terminal.json')])
 incomplete=json.loads(bodies[str(B/'jobs'/key/'results/normal-service-incomplete.json')])
 clean=json.loads(bodies[str(boot/'failed-start-cleanup.json')])
 ack=json.loads(bodies[str(boot/'retained-ack.json')])
 assert (terminal['jobId'],terminal['status'],terminal['exitCode'])==(key,'FAILED',2)
 assert incomplete['requestKey']==key and incomplete['confirmed'] is True and incomplete['containerStopped'] is True
 assert incomplete['successfulResultHandoff'] is False and incomplete['retainedAckValidated'] is True
 assert incomplete['currentProofSha256']==pins[str(proof_path)] and incomplete['retainedAckSha256']==pins[str(boot/'retained-ack.json')]
 assert incomplete['cleanStop']['cleanupSha256']==pins[str(boot/'failed-start-cleanup.json')]
 assert clean['requestKey']==key and clean['originalPGDATAAndCleanStateVerified'] is True
 assert ack=={'requestKey':key,'proofSha256':pins[str(proof_path)],'serviceLeaseExpiresAt':proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']}
 failed28={'closureKind':'FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED','requestKey':key,'terminalStatus':terminal['status'],
  'terminalSha256':pins[str(B/'jobs'/key/'r3-outer-terminal.json')],
  'cleanupSha256':pins[str(boot/'failed-start-cleanup.json')],'incompleteRootSha256':pins[str(B/'jobs'/key/'results/normal-service-incomplete.json')],
  'retainedAckSha256':pins[str(boot/'retained-ack.json')],'cleanDataVerified':True,'successfulResultHandoff':False,'standaloneStop28Used':False}
except Exception as error:errors.append({'stage':'ORIGINAL28_NONSECRET_CLOSURE_RECEIPTS','exceptionClass':type(error).__name__})
data=R/'state'/R.name/'data'
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'oldIdentities':old,'actualPins':pins,
 'basisMismatches':mismatches,'executionLockMatches':old.get('executionLock')==LOCK_ID,
 'grantExpiresAtEpoch':expiry,'grantExpiryIdentity':expiry_identity,'grantExpiresAtUTC':expiry_utc,
 'candidateKeys':keys,'presentCandidateKeys':present,'candidateKeyStates':key_facts,
 'registrationPaths':{p:v['present'] for p,v in registration_paths.items()},'registrationPathMetadata':registration_paths,
 'activeOperationUnits':units,'targetPortAbsent':port_absent,'postmasterPidAbsent':not os.path.lexists(data/'postmaster.pid'),
 'dataMetadata':metadata(data),'priorContainers':containers,'allThree28ContainersStopped':len(containers)==3 and all(v['running'] is False and v['pid']==0 for v in containers),
 'currentContainers':current_containers,'original28RestoredMarkerMetadata':marker_meta,
 'original28AuthenticationRestorationReceiptVerified':restoration_receipt,'privateAuthenticationRechecked':False,
 'current28SourceProof':source28,'current28FailedStartClosure':failed28,
 'acceptedMaterializationSha256':accepted_material,'acceptedMaterializationTerminalSha256':material_terminal,
 'readErrors':errors,'databaseConnections':0,'mutations':0,'privateAuthenticationBodiesRead':False,
 'originalKeysResubmitted':False,'registrationExecuted':False},sort_keys=True))
'''

def prepare():
    raw=REGISTRAR.read_bytes();assert hashlib.sha256(raw).hexdigest()==REGISTRAR_SHA
    value=runpy.run_path(str(REGISTRAR),run_name='local_metadata_only')
    assert hashlib.sha256(RULES.read_bytes()).hexdigest()==RULES_SHA
    rules=json.loads(RULES.read_bytes())
    expected={str(p):pin for p,pin in value['BASIS'].items()};jobs=value['JOBS']
    assert len(expected)==93 and jobs=={phase:rule['jobId'] for phase,rule in rules['jobs'].items()}
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
    path=H/('REGISTRATION-BASIS29-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
    with path.open('xb') as out:out.write(raw)
    value=json.loads(raw)
    print(json.dumps({'receipt':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'registrarSourceReadSha256':REGISTRAR_SHA,
        **{k:value[k] for k in ('checkedAtUTC','basisMismatches','executionLockMatches','grantExpiresAtEpoch','grantExpiresAtUTC',
         'presentCandidateKeys','registrationPaths','activeOperationUnits','targetPortAbsent','postmasterPidAbsent',
         'allThree28ContainersStopped','priorContainers','currentContainers','original28RestoredMarkerMetadata',
         'original28AuthenticationRestorationReceiptVerified','privateAuthenticationRechecked','current28SourceProof','current28FailedStartClosure',
         'acceptedMaterializationSha256','acceptedMaterializationTerminalSha256','readErrors','mutations')}},sort_keys=True))

if __name__=='__main__':main()
