"""Fixed normal retained REAL batched caller, with original private transport and cleanup."""
from pathlib import Path
from types import ModuleType
import base64,hashlib,json,os,re,runpy,selectors,signal,stat,subprocess,sys,time
WRITER='t45-r3-batched-real-execute-20261115-01'
READER='t45-first-20261110-r3-real-readback-20261114-22-04'
KEY=os.environ.get('ERP_SHARED_JOB_ID','t45-r3-batched-real-execute-20261115-01')
# Parent job directory selects only the two fixed keys; no caller path is accepted.
if not KEY:KEY=Path(os.environ.get('ERP_SHARED_JOB_DIR','/')).name
PHASE='writer'if KEY==WRITER else 'readback'

START='t45-first-r3-native-service-start-20261116-26'
FAILED='t45-first-20261110-r3-real-execute-20261114-02'
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
JOBS=BASE/'jobs';JOB=JOBS/KEY
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
HOST_STATE=HOST/'state';STATE=Path('/var/lib/naijue-erp/fresh35-production')
PROJECTION='retained26-private'
OPERATOR='installed-real-operation-batched-root03-20261116-01'
NODE='/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
INITIALIZER_BYTES=51225175
NODE_SHA='7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'
CORE_SHA='1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d'
OPS_SHA='efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4'
ROLE='erp35_controller_20261110_r3'
DB='erp_fresh35_20261110_r3'
A_ROOT=JOBS;A_KEY='t45-r3-baseline-scope-admin-provision-20261113-05'
ORIGINAL_A_KEY='t45-r3-baseline-scope-admin-provision-20261111-01'
A_CUSTODY_KEY='t45-r3-first-admin-custody-receive-20261113-01'
UUID=re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\Z')
TRACK={'childEntered':False,'accessEntered':False,'projection':None}
PINS={'normal05_retained_stop.py': '61a1d67349a910cebe2118e760cb18b4cb8699d780155398f42f3603bff0ccc0', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385', 'materialized-profile.json': 'ce6d6a3c71497701f1dab5ddf5fac89cc93d0824324b0aa75512dfc05177d904', 'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6', 'r3_05_runtime.py': '4401d003240bf791fd4d48424160aa8572c322ed0b2cc4639aee530bb0a292bb', 'retained24-run.mjs': '89a8eba0bc1cd3245d0b31407b9e2b4437a9b71fff49ea54a8618e3688677f86'}

SOURCE_ROWS_SHA256='399d3ac7ce1e7d903ba37b7243ea3c9d694712d9cb8f9fec06137125d7c89109'
SOURCE_SET_SHA256='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e'
ORIGINAL06_READBACK_PINS={'original06-readonly-inspect-process-cleanup.json': {'objectsEqual': True, 'publicSha256': '9dfbb6106448139d70a3d0c0c330faae32938f228054e75c781cd26f6e7820aa', 'rootSha256': '9b69502e2f956520450bd9130300335bbe27cc170256ee9a85bdbdc3bcc40033'}, 'original06-readonly-inspect-result.json': {'objectsEqual': True, 'publicSha256': '4f802da791fd685a894395daef5fa56226db1b0e8cb1a5f40725abc25979f5e4', 'rootSha256': '3836f40139addea497b08f3ca85000cba4ea7ad6d892f65c50a471c541d357dc'}, 'retained23-readback-child-cleanup.json': {'objectsEqual': True, 'publicSha256': '349a8299e9b1cffd3ff48a3dada30cecdd563dae7c52b09e2c0a6251e9aac1ef', 'rootSha256': 'aaae244a42d5b79cfcf314a500a6ff75849fdd19ffd5bac90062c2ab5744426b'}}

def need(v,c):
 if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return time.time_ns()//1000000
def encode(v):return(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def identity(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read(path,maximum=65536,owner=0,exact_bytes=None):
 need(path.resolve()==path,'ORIGINAL_INSPECT_CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1
   and not s.st_mode&0o022 and 0<s.st_size<=maximum,'ORIGINAL_INSPECT_PROTECTED_INPUT_REQUIRED')
  need(exact_bytes is None or s.st_size==exact_bytes,'RETAINED22_EXACT_INITIALIZER_BYTES_REQUIRED')
  raw=f.read(maximum+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'ORIGINAL_INSPECT_INPUT_CHANGED')
 return raw

def load(name,pin):
 path=JOB/'bundle'/name;raw=read(path,262144)
 need(sha(raw)==pin,'ORIGINAL_INSPECT_EXACT_SOURCE_REQUIRED')
 m=ModuleType(name[:-3]);m.__file__=str(path);sys.modules[m.__name__]=m;exec(compile(raw,str(path),'exec'),m.__dict__);return m

def put(path,raw,mode=0o600,gid=0):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  need(f.write(raw)==len(raw),'ORIGINAL_INSPECT_SHORT_PROJECTION_WRITE');f.flush();os.fchown(f.fileno(),0,gid);os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
 sync(path.parent)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def group_directory(path,new=True):
 if new:
  path.mkdir(mode=0o700);os.chown(path,0,61035);path.chmod(0o710);sync(path.parent)
 s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,61035,0o710),'ORIGINAL_INSPECT_PROJECTION_DIRECTORY_DIFFERS')
def scope():
 return dict(format='T45_R3_BATCHED_RETAINED24_PRIVATE_HOST_V1',requestKey=WRITER,phase='WRITER',
  originalWriterKey='t45-first-20261110-r3-real-execute-20261114-06',
  retainedPrepareKey='t45-first-20261110-r3-real-prepare-20261114-09',
  sourceRowsSha256=SOURCE_ROWS_SHA256,operatorSourceSetSha256=SOURCE_SET_SHA256,
  originalInitializerSha256='c6daca9c353957b3d74e48d5bdbf379992d02cd6362a06106c1ba93b1abae580',
  maximumChildSeconds=2780,database=DB,
  adminProvisionReceiptSha256='12826d6714f6750feab4ddbc224392f77f253c32bbb981f0892225980f33a9e5',
  compact={'admin154SuccessorSha256':'96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e'},
  originalWriterReplayed=False,automaticReplay=False,businessWritesPermitted=True)

def validate(a,at):
 fixed=scope()
 need(all(type(v) is str and re.fullmatch('[a-f0-9]{64}',v) for v in (SOURCE_ROWS_SHA256,SOURCE_SET_SHA256)), 'BATCHED24_FROZEN_SOURCE_REQUIRED')
 variable={'service','startsAt','expiresAt','authorizationReference','sourceSha256','independentReviewSha256',
  'operatorReadySha256','startTerminalSha256','startResultSha256','lockCapacitySettingsSha256',
  'applyTerminalSha256','applyResultSha256','accessPlan','accessPlanSha256',
  'executionAuthoritySha256','executionAuthorityBase64','expectedBinding','installTerminalSha256','installResultSha256','batchedCatalog'}
 need(KEY==WRITER and set(a)==set(fixed)|variable and all(a[k]==v for k,v in fixed.items()),'BATCHED24_EXACT_AUTHORITY_REQUIRED')
 for k in variable:
  if k.endswith('Sha256'):need(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]),'BATCHED24_EXACT_PIN_REQUIRED')
 need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=at<at+180000<a['expiresAt']<=a['startsAt']+14400000,
  'BATCHED24_FINITE_WINDOW_REQUIRED')
 need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'BATCHED24_REFERENCE_REQUIRED')
 s=a['service']
 need(type(s) is dict and set(s)=={'serviceKey','proofSha256','containerId','containerStartedAt','postmasterStart'}
  and s['serviceKey']==START and all(type(s[k]) is str and re.fullmatch('[a-f0-9]{64}',s[k]) for k in ('proofSha256','containerId'))
  and all(type(s[k]) is str and 0<len(s[k])<=64 for k in ('containerStartedAt','postmasterStart')),'BATCHED24_GENERATION_REQUIRED')
 need(a['expectedBinding'].get('transactionMode')=='BATCHED_V1'
  and a['expectedBinding'].get('batchedDbCandidatePinsSha256')=='dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9'
  and type(a['batchedCatalog']) is dict and set(a['batchedCatalog'])=={'sourceSetSha256','catalogSpecSha256','modelSha256'}
  and all(type(x) is str and re.fullmatch('[a-f0-9]{64}',x) for x in a['batchedCatalog'].values())
  and a['expectedBinding'].get('batchedSourceSetSha256')==a['batchedCatalog']['sourceSetSha256']
  and a['expectedBinding'].get('batchedCatalogSpecSha256')==a['batchedCatalog']['catalogSpecSha256']
  and a['expectedBinding'].get('batchedModelSha256')==a['batchedCatalog']['modelSha256']
  and a['expectedBinding'].get('currentServiceSha256')==s['proofSha256']
  and a['expectedBinding'].get('postmasterStart')==s['postmasterStart'],'BATCHED24_BINDING_REQUIRED')
 return a

def authority(raw):return validate(json.loads(raw),now())

def registered_authority(a):
 policy=json.loads(read(BASE/'r3-05-write-continuity/direct26-batched-real.json',262144))
 need(policy['grantId']==GRANT and policy['jobs']['start']['jobId']==START
  and policy['jobs']['writer']['jobId']==KEY and policy['jobs']['writer']['script']=='batched_real_host.py'
  and policy['jobs']['writer']['bundlePins']['batched_real_host.py']==a['sourceSha256']
  and policy['startsAt']<=a['startsAt']<=now()<a['expiresAt']<=policy['expiresAt'],'BATCHED24_REGISTERED_POLICY_REQUIRED')

def installed(a):
 key='t45-r3-batched-install-20261115-01'
 raw=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)==a['installTerminalSha256'] and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED24_INSTALL_TERMINAL_REQUIRED')
 raw=read(JOBS/key/'results/batched-install-result.json');v=json.loads(raw)
 need(sha(raw)==a['installResultSha256'] and v['requestKey']==key and v['service']==a['service']
  and v['state']=='DB05_CATALOG_INSTALLED_AND_CAPTURED' and v['connectionCleanup']=='CLOSED'
  and v['sourceSetSha256']==SOURCE_SET_SHA256 and v['roleRestoreAcknowledged'] is True
  and v['batchedCatalog']==a['batchedCatalog'],'BATCHED24_INSTALLED_CATALOG_REQUIRED')


def fixed_history():
 for path,pin in {
  BASE/'r3-05-write-continuity/policy.json':'25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
  BASE/'r3-05-write-continuity/active.json':'0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
  JOBS/FAILED/'r3-outer-terminal.json':'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'}.items():
  need(sha(read(path))==pin,'BATCHED24_ORIGINAL_HOLD_CHANGED')
 key='t45-first-20261110-r3-real-readback-20261114-23-01'
 raw=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)=='7ed2e4ac060832c92da712c2dfd84351ad9c488cc8822d676fbdac2c2b8c6d28'
  and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED24_ORIGINAL06_ABSENCE_TERMINAL_REQUIRED')
 for leaf,pins in ORIGINAL06_READBACK_PINS.items():
  raw=read(JOBS/key/'results'/leaf);public=read(CONTROL/'jobs'/key/'results'/leaf,owner=1000)
  need(sha(raw)==pins['rootSha256'] and sha(public)==pins['publicSha256'] and json.loads(raw)==json.loads(public),'BATCHED24_ORIGINAL06_READBACK_REQUIRED')
  if leaf=='original06-readonly-inspect-result.json':
   v=json.loads(raw)
   need(v['state']=='ABSENT' and v['originalWriterKey']=='t45-first-20261110-r3-real-execute-20261114-06'
    and v['service']['serviceKey']=='t45-first-r3-native-service-start-20261114-23'
    and v['originalCombinationMatched'] and v['rollbackAcknowledged'] and v['connectionCleanup']=='CLOSED'
    and v['businessWrites']==0 and v['originalRecoveryRuns']==0,'BATCHED24_ORIGINAL06_ABSENCE_REQUIRED')


def current(ops,support,a):
 fixed_history();boot=HOST_STATE/'native-services'/START
 raw=read(HOST/'authority/fresh35-current-production-service-v2-service-26.json');p=json.loads(raw);s=a['service'];b=p['sharedPostgresNamespace']['container']
 need(sha(raw)==s['proofSha256']and p['requestKey']==START and p['physical']['postmasterStart']==s['postmasterStart']
  and p['physical']['systemIdentifier']=='7706545564479176741'and p['physical']['databaseOid']=='16393'
  and b['id']==s['containerId']and b['startedAt']==s['containerStartedAt']
  and now()<a['expiresAt']<=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],'ORIGINAL_INSPECT_CURRENT_GENERATION_DIFFERS')
 support.inspect_birth(b,True)
 need(json.loads(read(boot/'carrier-birth.json'))==b and json.loads(read(boot/'retained-ack.json'))=={
  'requestKey':START,'proofSha256':s['proofSha256'],'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'ORIGINAL_INSPECT_CURRENT_RETAINED_ACK_REQUIRED')
 terminal=read(JOBS/START/'r3-outer-terminal.json');t=json.loads(terminal)
 need(sha(terminal)==a['startTerminalSha256']and terminal==read(CONTROL/'results'/(START+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(START,'COMPLETED',0),'ORIGINAL_INSPECT_START_TERMINAL_REQUIRED')
 result=read(JOBS/START/'results/normal-service-result.json');r=json.loads(result)
 need(sha(result)==a['startResultSha256']and r['requestKey']==START and r['proofSha256']==s['proofSha256']
  and r['lockCapacitySettingsSha256']==a['lockCapacitySettingsSha256'],'ORIGINAL_INSPECT_START_RESULT_REQUIRED')
 cap=read(boot/'lock-capacity-settings.json');c=json.loads(cap)
 need(sha(cap)==a['lockCapacitySettingsSha256']and r['lockCapacitySettings']==c and c['requestKey']==START
  and c['parameterInputsMatchedReviewedBudget']is True and c['capacityB']==31 and c['lockSlots']==2031616
  and c['settings']['max_locks_per_transaction']==65536 and c['cgroup']['memory.max']==7516192768,
  'ORIGINAL_INSPECT_MEASURED_CAPACITY_REQUIRED')
 return p,json.loads(read(boot/'service-start-authorization.json'))

def controller(a):
 key='t45-r3-ordinary26-auth-apply-20261116-01'
 terminal=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(terminal)
 need(sha(terminal)==a['applyTerminalSha256']and terminal==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'ORIGINAL_INSPECT_ROLE_APPLY_TERMINAL_REQUIRED')
 raw=read(JOBS/key/'results/maintenance-auth-result.json');r=json.loads(raw)
 need(sha(raw)==a['applyResultSha256']and r['requestKey']==key and r['phase']=='apply'
  and r['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'
  and r['result']['status']=='EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'
  and r['result']['runtimeAuthChanged']is False and r['result']['membershipsOrRoleAttributesChanged']is False
  and (a['expiresAt']==r['result']['credentialValidUntilByRole'][ROLE] if KEY==WRITER
   else a['expiresAt']<=r['result']['credentialValidUntilByRole'][ROLE])
  and r['cleanup']['ownContainerStopped']is True and r['cleanup']['ownedPidAbsent']is True,'ORIGINAL_INSPECT_FINITE_ROLE_READBACK_REQUIRED')
 path=HOST_STATE/'native-services/ordinary26-auth-20261116-01'/(ROLE+'.json');s=path.lstat()
 need((s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o400),'ORIGINAL_INSPECT_CONTROLLER_CUSTODY_REQUIRED')
 cfg=json.loads(read(path));fixed={'host':'127.0.0.1','port':56791,'database':DB,'user':ROLE,'ssl':False}
 need(set(cfg)==set(fixed)|{'password'}and all(cfg[k]==v for k,v in fixed.items())and re.fullmatch('[a-f0-9]{64}',cfg['password']),'ORIGINAL_INSPECT_EXACT_CONTROLLER_REQUIRED')
 return cfg


def pinned(ops, path, pin, *, private=False, root=True):
    raw = ops.read_file(path,65536,private,root)
    cli.require(cli.digest(pin) and sha(raw)==pin,'R3_05_PROTECTED_RECEIPT_BYTES_DIFFER')
    return raw


def admin_material(ops, desc, service_authority):
    result = ops.strict(pinned(ops,A_ROOT/A_KEY/'native-private/committed-result.json',
                               desc['adminProvisionReceiptSha256'],private=True))
    native = result['nativeResult']
    cli.require(result['requestKey']==A_KEY and result['phase']=='ADMIN_PROVISION_ONLY'
                and result['status']=='ADMIN154_NATIVE_ADMIN_RESULT_RETAINED_NOT_BUSINESS_ACCEPTANCE'
                and service_authority['phaseResults']['ADMIN_PROVISION_ONLY']==desc['adminProvisionReceiptSha256']
                and result['currentServiceSha256']==service_authority['ddlServiceProofSha256']=='76326acb7db45e6a65a1eb6b88b9b44a1cf6ed7bf8bae09d5f99e2f3184a8727'
                and result['postmasterStart']==service_authority['ddlPostmasterStart']
                and native['state'] in ('COMMITTED','ALREADY_COMMITTED')
                and native['connection_cleanup']=='CLOSED'
                and result['successorRecordSha256']==desc['compact']['admin154SuccessorSha256'],
                'R3_05_ACTUAL_A_COMMIT_REQUIRED')
    custody = A_ROOT/A_CUSTODY_KEY
    seal = ops.strict(ops.read_file(custody/'results/a-custody-status.json',65536,True))
    cli.require(seal.get('jobId')==A_CUSTODY_KEY and seal.get('originalAKey')==ORIGINAL_A_KEY
                and seal.get('status') in ('SEALED_ROOT_CUSTODY','REUSED_IDENTICAL_ORIGINAL')
                and seal.get('originalExported') is False and seal.get('sqlConnections')==0,
                'R3_05_ORIGINAL_A_CUSTODY_REQUIRED')
    path = custody/'custody/original-a.json'
    before = access.metadata(path)
    cli.require(before['uid']==before['gid']==0 and before['mode']=='0o400',
                'R3_05_ORIGINAL_A_PRIVATE_IDENTITY_CHANGED')
    raw = pinned(ops,path,result['originalAdminInputSha256'],private=True)
    cli.require(access.metadata(path)==before,'R3_05_ORIGINAL_A_PRIVATE_IDENTITY_CHANGED')
    value = ops.strict(raw)
    request,secret = value['request'],value['encodedScrypt']
    admin = request['admin']
    origin = result['provisionOrigin']
    cli.require(set(value)=={'request','encodedScrypt'}
                and request['format_version']=='FIRST_ADMIN_SETUP_V1' and request['mode']=='ADMIN_PROVISION_ONLY'
                and request['installation_record_sha256']==runtime.INSTALLATION
                and set(admin)=={'account_id','staff_id','login_name','staff_name'}
                and all(UUID.fullmatch(admin[k]) for k in ('account_id','staff_id'))
                and admin['login_name']=='admin' and admin['staff_name']=='系统管理员'
                and set(origin)=={'operation_id','request_sha256'}
                and UUID.fullmatch(origin['operation_id']) and origin['operation_id']==request['operation_id']
                and cli.digest(origin['request_sha256'])
                and sha(encode(admin).rstrip(b'\n'))==result['adminIdentitySha256']
                and type(secret) is str and 0<len(secret.encode())<=4096
                and '\x00' not in secret and '\n' not in secret and '\r' not in secret,
                'R3_05_EXACT_ORIGINAL_A_PROJECTION_REQUIRED')
    return encode(admin),secret.encode(),encode(origin)




CHILD=r"""
import ctypes,hashlib,json,os,select,signal,stat,subprocess,sys,time
from pathlib import Path
node,projection,digest,cutoff,net,g,p,node_sha=PACKET
def need(v):
 if not v:raise ValueError('READBACK_EXACT_CHILD_SCOPE_REQUIRED')
def now():return time.time_ns()//1000000
def same():
 s=Path('/proc/self/ns/net').stat()
 need((s.st_dev,s.st_ino)==(net['device'],net['inode']))
 for x,u in ((g,0),(p,61035)):
  d=Path('/proc')/str(x['pid'])
  f=(d/'stat').read_text().rsplit(')',1)[1].split()
  need(f[0] not in ('Z','X') and d.stat().st_uid==u and f[19]==x['starttime']
       and os.readlink(d/'exe')==x['exe'] and (u==0 or int(f[1])==g['pid']))
same()
need(hashlib.sha256(Path(node).read_bytes()).hexdigest()==node_sha)
need(ctypes.CDLL(None,use_errno=True).prctl(36,1,0,0,0)==0)
body=sys.stdin.buffer.readline(65537)
need(0<len(body)<=65536 and body.endswith(b'\n') and now()+12000<cutoff)
def interrupt(*_):raise ValueError('READBACK_CHILD_INTERRUPTED')
for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupt)
child=subprocess.Popen([node,'--no-global-search-paths',projection+'/retained24-run.mjs',digest],
 stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
 env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC','TMPDIR':projection+'/scratch','SQLITE_TMPDIR':projection+'/scratch'},user=61035,group=61035,
 extra_groups=[],start_new_session=True)
complete=False
received=False
problem=False
try:
 pending=body
 while True:
  need(not select.select([sys.stdin],[],[],0)[0])
  remaining=(cutoff-now())/1000-8
  need(remaining>0)
  try:
   out,_=child.communicate(pending,timeout=min(0.5,remaining))
   break
  except subprocess.TimeoutExpired:
   pending=None
 need(0<len(out)<=65536 and not select.select([sys.stdin],[],[],0)[0])
 received=True
 same()
 complete=True
except BaseException:
 problem=True
finally:
 try:
  if not complete:
   try:os.killpg(child.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:child.wait(timeout=3)
   except subprocess.TimeoutExpired:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    child.wait(timeout=3)
 finally:
  children=Path('/proc/self/task')/str(os.getpid())/'children'
  reap_until=time.monotonic()+max(0,min(2.5,(cutoff-now())/1000-0.5))
  while True:
   remaining=children.read_text().split()
   if not remaining:break
   need(time.monotonic()<reap_until)
   for pid in remaining:
    need(time.monotonic()<reap_until)
    try:
     with_pid=int(pid)
     need(int((Path('/proc')/pid/'stat').read_text().rsplit(')',1)[1].split()[1])==os.getpid())
     os.kill(with_pid,signal.SIGKILL)
     os.waitpid(with_pid,os.WNOHANG)
    except (ChildProcessError,FileNotFoundError,ProcessLookupError):pass
   time.sleep(min(0.05,max(0,reap_until-time.monotonic())))
try:result=json.loads(out)if received else None
except Exception:result=None
parsed=isinstance(result,dict)
if not parsed:result={'state':'UNKNOWN','safeCode':'RETAINED20_CHILD_RESULT_UNCONFIRMED','connectionCleanup':'UNKNOWN'}
print(json.dumps({'exitCode':child.returncode,'result':result,'childReaped':True,'descendantsReaped':True,
 'exclusiveProcessReaped':True,'resultReceived':received and parsed,
 'lifecycleConfirmed':complete and not problem}))
"""

def child_run(proof,a,payload):
 birth=proof['sharedPostgresNamespace']['container'];cutoff=min(a['expiresAt']-80000,now()+a['maximumChildSeconds']*1000)
 packet=(NODE,str(STATE/PROJECTION/KEY),sha(read(JOB/'bundle/writer-authorization.json',131072)),cutoff,birth['networkNamespace'],proof['guardian'],proof['postmaster'],NODE_SHA)
 source='PACKET='+repr(packet)+'\n'+CHILD
 argv=['/usr/bin/docker','exec','-i','--user','0:0',birth['id'],'/usr/bin/python3','-I','-S','-c',source]
 child=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 raw=bytearray()
 try:
  try:
   child.stdin.write(encode(payload));child.stdin.flush()
   with selectors.DefaultSelector()as mux:
    mux.register(child.stdout,selectors.EVENT_READ)
    while True:
     left=(cutoff+20000-now())/1000;need(left>0,'RETAINED20_CHILD_REAP_RECEIPT_DEADLINE')
     if not mux.select(min(1,left)):continue
     block=os.read(child.stdout.fileno(),min(8192,65537-len(raw)))
     if not block:break
     raw.extend(block);need(len(raw)<=65536,'ORIGINAL_INSPECT_CHILD_RECEIPT_BOUNDS')
   child.wait(timeout=max(.1,(cutoff+20000-now())/1000))
  finally:
   child.stdin.close()
   if child.poll()is None:
    try:child.wait(timeout=8)
    except subprocess.TimeoutExpired:
     child.terminate()
     try:child.wait(timeout=3)
     except subprocess.TimeoutExpired:
      child.kill();child.wait(timeout=3)
  need(child.returncode==0 and 0<len(raw)<=65536,'ORIGINAL_INSPECT_REMOTE_CHILD_CLEANUP_UNKNOWN')
  receipt=json.loads(raw)
  need(receipt.get('childReaped')is True and receipt.get('descendantsReaped')is True and receipt.get('exclusiveProcessReaped')is True,'ORIGINAL_INSPECT_CHILD_NOT_REAPED')
  put(JOB/('native-private/'+PHASE+'-process-cleanup.json'),encode(dict(requestKey=KEY,childReaped=True,descendantsReaped=True,remoteExitCode=receipt['exitCode'],resultReceiptSha256=sha(bytes(raw)))))
  return receipt
 finally:child.stdout.close()


def execution_projection(a,raw=None,expected=None):
 path=HOST_STATE/'native-services'/START/'authority-61035/fresh35-compact-zero-execution-v2.json'
 parent=path.parent;s=parent.lstat()
 need(parent.resolve()==parent and stat.S_ISDIR(s.st_mode)and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,61035,0o750),
  'RETAINED20_EXACT_EXISTING_AUTHORITY_MOUNT_REQUIRED')
 if raw is not None:
  cli.require_execute_authority(raw,a['executionAuthoritySha256'],a['expectedBinding'],now(),a['expiresAt'],json.loads)
  need(json.loads(raw)['expiresAt']==a['expiresAt'],'RETAINED22_INNER_OUTER_DEADLINE_DIFFERS')
  need(not os.path.lexists(path),'RETAINED20_EXECUTION_PROJECTION_ALREADY_PRESENT_NO_OVERWRITE')
  put(path,raw,0o440,61035);return identity(path.lstat())
 need(expected is not None and identity(path.lstat())==expected
  and sha(read(path))==a['executionAuthoritySha256'],'RETAINED20_OWN_EXECUTION_PROJECTION_CHANGED')
 path.unlink();sync(parent)

def original_source_facts():
 key='t45-first-20261110-r3-real-prepare-20261114-09'
 path=HOST_STATE/'real-first-20261110-r3/reports'/key/'stream.stdout'
 raw=read(path,65536)
 need(sha(raw)=='04fcf408d9b9ae066f7c30f42e64421721626707450c925361bdd82c23887f79',
  'RETAINED20_ORIGINAL09_STDOUT_DIFFERS')
 value=json.loads(raw)
 need(value['state']=='COMPACT_ZERO_PREPARED'and value['plan_sha256']=='8a99c0acb2170dabb1001da3f3daf0b4b6cbce2c99baabc708a6d6694f418fbd',
  'RETAINED20_ORIGINAL09_PREPARE_REQUIRED')
 return value['source_counts'],value['source_totals']

def preserve_initializer(projection):
 folder=projection/'owned-private';m=folder.lstat()
 need(folder.resolve()==folder and stat.S_ISDIR(m.st_mode)and(m.st_uid,m.st_gid,stat.S_IMODE(m.st_mode))==(61035,61035,0o700),'RETAINED20_OWNED_PRIVATE_DIRECTORY_DIFFERS')
 path=folder/'original-initializer.json'
 if not os.path.lexists(path):return None
 raw=read(path,INITIALIZER_BYTES,owner=61035,exact_bytes=INITIALIZER_BYTES);s=path.lstat()
 need(s.st_gid==61035 and stat.S_IMODE(s.st_mode)==0o600,'RETAINED20_PRIVATE_INITIALIZER_METADATA_DIFFERS')
 # The pinned Node callback only receives the c6d-checked initializer, never the password.
 put(JOB/'native-private/original-initializer.json',raw,0o400)
 return sha(raw)

def retain_closed_scratch(projection):
 # Only the newly-created per-key worker directory, after exact child reaping.
 # Preserve a failed graph privately rather than deleting its evidence.
 scratch=projection/'scratch';s=scratch.lstat()
 need(scratch.resolve()==scratch and stat.S_ISDIR(s.st_mode)
  and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(61035,61035,0o700),
  'RETAINED20_OWN_SCRATCH_DIRECTORY_DIFFERS')
 if not any(scratch.iterdir()):return False
 retained=projection/'private-retained';retained.mkdir(mode=0o700);sync(projection)
 need(retained.lstat().st_uid==0 and stat.S_IMODE(retained.lstat().st_mode)==0o700,
  'RETAINED20_PRIVATE_SCRATCH_CUSTODY_REQUIRED')
 os.rename(scratch,retained/'scratch-after-child');sync(retained);sync(projection)
 scratch.mkdir(mode=0o700);os.chown(scratch,61035,61035);scratch.chmod(0o700);sync(projection)
 return True

def run(a,raw,ops,support):
 global cli,runtime,access
 cli=load('r3_05_cli.py',PINS['r3_05_cli.py']);runtime=load('r3_05_runtime.py',PINS['r3_05_runtime.py'])
 access=load('nonroot_input_access.py',PINS['nonroot_input_access.py'])
 proof,start_authority=current(ops,support,a);pg=controller(a)
 installed(a)
 ready=read(HOST_STATE/OPERATOR/'source-materialization.json');v=json.loads(ready)
 need(sha(ready)==a['operatorReadySha256']and v['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
  and v['sourceRowsSha256']==a['sourceRowsSha256'] and v['sourceFiles']==381,
  'RETAINED20_NEW_OPERATOR_INSTALL_REQUIRED')
 original_record=read(HOST/'authority/fresh35-compact-zero-successor-v2.json')
 need(sha(original_record)=='d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e','RETAINED20_ORIGINAL_SQL38_REQUIRED')
 record=json.loads(original_record)
 target=dict(protocol='STANDARD_IMPORT_SQL_V1',system_identifier='7706545564479176741',database_oid='16393',database_name=DB,catalog_sha256=record['successor']['catalogSha256'])
 admin,secret,origin=admin_material(ops,a,start_authority)
 payload={'admin':json.loads(admin),'encodedScrypt':secret.decode(),'provision':json.loads(origin),'postgres':pg,'target':target}
 root=HOST_STATE/PROJECTION;group_directory(root,not os.path.lexists(root))
 projection=root/KEY;group_directory(projection);TRACK['projection']=projection
 private=JOB/'native-private';private.mkdir(mode=0o700);sync(JOB)
 for name,body in [('retained24-run.mjs',read(JOB/'bundle/retained24-run.mjs',262144)),('writer-authorization.json',raw)]:
  if name.endswith('.mjs'):need(sha(body)==PINS[name],'RETAINED20_NODE_SOURCE_DIFFERS')
  put(projection/name,body,0o440,61035)
 for folder in('scratch','owned-private'):
  path=projection/folder;path.mkdir(mode=0o700);os.chown(path,61035,61035);path.chmod(0o700);sync(projection)
 plan_dir=HOST_STATE/'real-first-20261110-r3/reports/t45-r3-batched-real-persist-20261115-01'
 need(not os.path.lexists(plan_dir),'BATCHED24_PLAN_EXISTS_READ_ORIGINAL_KEY')
 plan_dir.mkdir(mode=0o700);os.chown(plan_dir,61035,61035);plan_dir.chmod(0o700);sync(plan_dir.parent)
 ledger=None;active_attempted=False;child_started=False;receipt=None;error=None;execution_identity=None;result_binding_matched=False
 cleanup={'requestKey':KEY,'service':a['service'],'childReaped':False,'descendantsReaped':False,
  'connectionCleanup':'NOT_OPENED','originalInputMetadataRestored':False,'scratchEmpty':False}
 try:
  if KEY==WRITER:
   need(a['accessPlan']['requestKey']==KEY and sha(access.encode(a['accessPlan']))==a['accessPlanSha256'],
    'RETAINED20_ORIGINAL49_PLAN_REQUIRED')
   need(sha(read(access.REAL/access.POINTER))=='8c2f65e76ded8df610359435e90b5eb68783ffb108379a11d66a2f273e2ae98d',
    'RETAINED22_EXACT_READER22_03_RESTORED_POINTER_REQUIRED')
   profile=read(JOB/'bundle/materialized-profile.json');need(sha(profile)==runtime.PROFILE_SHA,'RETAINED20_ORIGINAL_PROFILE_REQUIRED')
   ledger=access.ledger_directory(KEY);active_attempted=True;TRACK['accessEntered']=True
   access.prepare(profile,access.encode({**a,'mode':'EXECUTE'}),access.encode(a['accessPlan']),json.loads,ops.read_file,lambda:current(ops,support,a))
   execution_raw=base64.b64decode(a['executionAuthorityBase64'],validate=True)
   need(0<len(execution_raw)<=65536 and sha(execution_raw)==a['executionAuthoritySha256'],'RETAINED20_C_ISSUED_EXECUTION_BYTES_REQUIRED')
   execution_identity=execution_projection(a,execution_raw)
  else:
   counts,totals=original_source_facts();payload.update(sourceCounts=counts,sourceTotals=totals)
   init=read(JOBS/WRITER/'native-private/original-initializer.json',INITIALIZER_BYTES,exact_bytes=INITIALIZER_BYTES)
   need(sha(init)==a['initializerFileSha256'],'RETAINED20_ORIGINAL_INITIALIZER_HANDOFF_DIFFERS')
   put(projection/'original-initializer.private.json',init,0o440,61035)
  current(ops,support,a);child_started=True;TRACK['childEntered']=True
  receipt=child_run(proof,a,payload)
  candidate=receipt.get('result',{})
  result_binding_matched=candidate.get('requestKey')==KEY and candidate.get('inputSha256')==sha(raw)and candidate.get('service')==a['service']
  need(result_binding_matched or candidate.get('state')=='UNKNOWN','RETAINED20_NATIVE_RESULT_BINDING_DIFFERS')
 except BaseException as problem:error=problem
 finally:
  payload.clear();pg=None;admin=secret=origin=None
  child_reaped=receipt is not None and receipt.get('childReaped')is True and receipt.get('descendantsReaped')is True
  can_restore=child_reaped or not child_started
  if can_restore:
   cleanup.update(childReaped=True,descendantsReaped=True)
   child_result=(receipt or{}).get('result',{})
   actual_connection=child_result.get('connectionCleanup','UNKNOWN')if result_binding_matched and receipt.get('lifecycleConfirmed')is True else 'NOT_OPENED'if not child_started else 'UNKNOWN'
   cleanup['connectionCleanup']=actual_connection if actual_connection in('CLOSED','NOT_OPENED')else 'REAPED_EXCLUSIVE_PROCESS'
   cleanup['connectionCleanupBasis']='NATIVE_ACK_OR_NOT_OPENED'if cleanup['connectionCleanup']!='REAPED_EXCLUSIVE_PROCESS'else 'ALL_EXCLUSIVE_NODE_AND_DESCENDANT_PROCESSES_REAPED'
   if execution_identity is not None:execution_projection(a,expected=execution_identity)
   if active_attempted and ledger is not None and os.path.lexists(ledger/'description.json'):
    access.restore(ledger,True,ops.read_file)
    restored=json.loads(ops.read_file(ledger/'restored.json',65536,True))
    cleanup['originalInputMetadataRestored']=restored['state']=='ORIGINAL_INPUT_METADATA_RESTORED'and restored['childReaped']is True
    cleanup['inputRestoreReceiptSha256']=sha(ops.read_file(ledger/'restored.json',65536,True))
   else:cleanup['originalInputMetadataRestored']=True
   cleanup['scratchRetainedPrivately']=retain_closed_scratch(projection)
   cleanup['scratchEmpty']=not any((projection/'scratch').iterdir())
   if KEY==WRITER and child_reaped:
    pin=preserve_initializer(projection)
    if pin:cleanup['retainedInitializerFileSha256']=pin
   put(JOB/('results/batched24-'+PHASE+'-child-cleanup.json'),encode(cleanup))
  else:cleanup['connectionCleanup']='UNCONFIRMED'
 result=(receipt or{}).get('result',{'requestKey':KEY,'state':'UNKNOWN','connectionCleanup':'NOT_OPENED'if not child_started else 'UNKNOWN'})
 # Native facts are retained privately; public result never republishes source amounts or INIT.
 put(JOB/'native-private/native-result.json',encode(result),0o400)
 public={'requestKey':KEY,'phase':PHASE.upper(),'service':a['service'],'state':result.get('state','UNKNOWN')if result_binding_matched else 'UNKNOWN',
  'nativeResultSha256':sha(encode(result)),'nativeConnectionCleanup':result.get('connectionCleanup','UNKNOWN'),
  'processCleanup':cleanup,'nativeOutcomeInferredFromOuterStatus':False,'automaticReplay':False,
  'nativeResultBindingMatched':result_binding_matched,'lifecycleConfirmed':bool(receipt and receipt.get('lifecycleConfirmed')is True),
  'sqlstate':result.get('sqlstate'),'safeCode':result.get('safeCode'),
  'sql':result.get('sql',[]),'rollbackAcknowledged':result.get('rollbackAcknowledged',False),
  'actualControllerRole':result.get('actualControllerRole')}
 if result_binding_matched:
  public['verification']=result.get('verification');public['readbackConnectionCleanup']=result.get('readbackConnectionCleanup')
  public['batchPlanPath']=str(STATE/'real-first-20261110-r3/reports/t45-r3-batched-real-persist-20261115-01/batched-plan.sqlite')
 if result_binding_matched and KEY==WRITER and 'catalogFailure' in result:
  public['catalogFailure']=result['catalogFailure']
 if error:
  public['safeCode']=str(error)if isinstance(error,ValueError)and re.fullmatch('[A-Z0-9_]{1,160}',str(error))else 'RETAINED20_HOST_UNCONFIRMED'
 put(JOB/('results/batched24-'+PHASE+'-result.json'),encode(public))
 if error:put(JOB/('results/batched24-'+PHASE+'-incomplete.json'),encode(public))
 safe=all(cleanup.get(k)is True for k in('childReaped','descendantsReaped','originalInputMetadataRestored','scratchEmpty'))
 return 0 if error is None and receipt and receipt['exitCode']==0 and receipt.get('resultReceived')is True and receipt.get('lifecycleConfirmed')is True and result_binding_matched and safe else 2

def main():
 need(sys.platform=='linux'and os.getuid()==os.geteuid()==0 and KEY==WRITER 
  and Path(__file__)==JOB/'bundle/batched_real_host.py'and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
  and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB)and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),
  'RETAINED20_FIXED_ROOT_ENTRY_REQUIRED')
 os.umask(0o077)
 def interrupted(*_):raise ValueError('RETAINED20_HOST_INTERRUPTED')
 for sig in(signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
 raw=read(JOB/'bundle/writer-authorization.json',131072)
 need(sha(raw)==sys.argv[1],'RETAINED20_AUTHORITY_HASH_REQUIRED');a=authority(raw)
 need(a['sourceSha256']==sha(read(Path(__file__),262144)),'RETAINED20_HOST_SOURCE_DIFFERS')
 registered_authority(a)
 return run(a,raw,load('fresh35-production-carrier.py',OPS_SHA),load('normal05_retained_stop.py',PINS['normal05_retained_stop.py']))
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as error:
  safe=str(error)if isinstance(error,ValueError)and re.fullmatch('[A-Z0-9_]{1,160}',str(error))else 'RETAINED20_ROOT_PREFLIGHT_UNCONFIRMED'
  if os.path.lexists(JOB/'results'):
   leaf=JOB/('results/batched24-'+PHASE+'-incomplete.json')
   if not os.path.lexists(leaf):put(leaf,encode({'requestKey':KEY,'state':'UNKNOWN','safeCode':safe,'automaticReplay':False}))
   cleanup=JOB/('results/batched24-'+PHASE+'-child-cleanup.json')
   if KEY==WRITER and not TRACK['childEntered']and not TRACK['accessEntered']and not os.path.lexists(cleanup):
    projection=TRACK['projection'];scratch=projection/'scratch'if projection else None
    empty=scratch is None or not os.path.lexists(scratch)or not any(scratch.iterdir())
    put(cleanup,encode({'requestKey':KEY,'childReaped':True,'descendantsReaped':True,
     'connectionCleanup':'NOT_OPENED','originalInputMetadataRestored':True,'scratchEmpty':empty,
     'childStarted':False,'originalInputMetadataChanges':0}))
  raise SystemExit(2)
