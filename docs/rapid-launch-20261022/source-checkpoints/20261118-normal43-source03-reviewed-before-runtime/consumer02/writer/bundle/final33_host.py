"""Fixed normal retained REAL batched caller, with original private transport and cleanup."""
from datetime import datetime
from pathlib import Path
from types import ModuleType
import base64,hashlib,json,os,re,runpy,selectors,signal,stat,subprocess,sys,time
WRITER='t45-r3-batched-real-after42-execute-20261118-01'
PREPARE='t45-r3-final33-plan-prepare-20261116-05'
LOGICAL_PREPARE='t45-r3-final33-plan-prepare-20261116-01'
PREPARATION_IDENTITY_MAPPING={'batchPlanPath': '/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-05/batched-plan.sqlite', 'businessWriterRequestKey': 't45-r3-batched-real-execute-20261115-01', 'nativeLogicalPreparationKey': 't45-r3-final33-plan-prepare-20261116-01', 'outerPreparationAttemptKey': 't45-r3-final33-plan-prepare-20261116-05'}
HISTORICAL_CATALOG_SERVICE={'containerId': 'ed42d33a198fe1c35a72d5c27b3c138d2cd5e8bc892a73d39f83fc77c88c8c14', 'containerStartedAt': '2026-11-16T18:33:46.920948412Z', 'postmasterStart': '2026-11-16 18:33:48.303258+00', 'proofSha256': '82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0', 'serviceKey': 't45-first-r3-native-service-start-20261116-35'}
PLAN_REL=Path('real-first-20261110-r3/reports')/PREPARE
def fixed_job_key(env):
 directory=env.get('ERP_SHARED_JOB_DIR')
 if directory is None:
  if env.get('ERP_SHARED_JOB_ID') is not None:raise ValueError('FINAL33_REGISTERED_JOB_DIRECTORY_REQUIRED')
  return '' # Local module inspection only; main refuses an absent registered directory.
 path=Path(directory);key=path.name
 if not (path.is_absolute() and str(path)==directory
  and path.parent==Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
  and key == WRITER):raise ValueError('FINAL33_REGISTERED_JOB_DIRECTORY_REQUIRED')
 if env.get('ERP_SHARED_JOB_ID') not in (None,key):raise ValueError('FINAL33_JOB_ID_ENV_MISMATCH')
 return key
KEY=fixed_job_key(os.environ)
PHASE='prepare' if KEY==PREPARE else 'writer'

INSTALL_KEY='t45-r3-batched-install-20261116-02'
CATALOG_UPDATE_KEY='t45-r3-batched161-command-successor-20261116-01'
CATALOG_UPDATE_RESULT='batched161-command-update-result.json'
REVIEWED_CATALOG_INPUT_SHA256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7'
INSTALL_START='t45-first-r3-native-service-start-20261116-32'
INSTALL_PROOF='fresh35-current-production-service-v2-service-32.json'
INSTALL_TERMINAL_SHA='01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2'
INSTALL_RESULT_SHA='e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792'
INSTALL_PUBLIC_RESULT_SHA='c3f11ec9de8c87c59fbd39201f8cfb9a82069485096a9ca3a7c2da14132b6749'
INSTALL_PROOF_SHA='f1d1a4e9f85492cba0028febc4bf05390b490161cd2983afbe76209199d8480d'
INSTALL_PROGRAM_SHA='f2bc8f29c659aacf7dbf60e5bf227d5043f7e3f1f32cf3587a4cf661dd6f11e5'
INSTALL_COMPLETION_SHA='c10ffe419c2ef4cef52ed1c2e110d1b8f9b1d1d4d3974782836f8e9832de6d3f'
INSTALL_CATALOG_SHA='6da5ccda084f3d02d6e5dcf3b2121adaf7890c839c0f3e602b9a13d1aea9e3f9'
INSTALL_OPERATOR_SOURCE_SHA='23991537d21caa7fc6db4d06a395e2441392637f0dd70f7fcf763216f5e6f1d6'
SERVICE_KEY=re.compile(r't45-first-r3-native-service-start-([0-9]{8})-([0-9]{2})\Z')
PHYSICAL={'systemIdentifier':'7706545564479176741','databaseOid':'16393','serverVersionNum':'170011'}
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}
FAILED='t45-first-20261110-r3-real-execute-20261114-02'
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
JOBS=BASE/'jobs';JOB=JOBS/KEY
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
HOST_STATE=HOST/'state';STATE=Path('/var/lib/naijue-erp/fresh35-production')
INPUT_ROOT=HOST_STATE/'r3-final33-private-import-input-20261116-01'
PROJECTION='final33-private'
OPERATOR='installed-real-operation-batched-root08-20261117-01'
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
PINS = {'normal05_retained_stop.py': '74a845fafc9dc347600628539a3816c400c86f7761a3f8405a6b5f4c1e028ce0', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'nonroot_input_access.py': 'e560173dc463f376e95c18b0f8ca85fa7a488d40adf43951822c29280ed766c0', 'final33-run.mjs': 'b5670113befd5f61e4b113ea48c4521082de391efa86ced4f66d2029e4c563e8', 'after42-source-catalog-lineage.json': 'cc6e6544cf3c99b62c837675c7b92452af95d6f7cdbbaff72d28dcfac739c5b6', 'historical-prepare05.json': '78fcd3f7811343615343f6c59c841fe06a70aaadeeee3a41a6845abe26d86ee2', 'r3_05_cli.py': 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0', 'historical_source_lineage.py': 'c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736', 'r3_05_runtime.py': 'e647eb84a66630d4b6c0dcbe81f98c268e3b0cec39f8bf93e13c046aabefb021', 'source-catalog-lineage.json': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'source_lineage.py': '0fb01ca460ea35b48d2f28f303a91901af34083aee710bb61cc67d99e03a88da'}

SOURCE_ROWS_SHA256='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'
SOURCE_SET_SHA256='ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3'
FINAL_INPUT_MANIFEST_SHA256=None
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
 return dict(format='T45_R3_FINAL33_PRIVATE_HOST_V1',requestKey=KEY,phase=PHASE.upper(),
  sourceRowsSha256=SOURCE_ROWS_SHA256,operatorSourceSetSha256=SOURCE_SET_SHA256,
  sourceLineage={'lineageSha256': 'cc6e6544cf3c99b62c837675c7b92452af95d6f7cdbbaff72d28dcfac739c5b6', 'materializationTerminalSha256': 'e8849c90c8836a9d28e016b2216c3e5a725fd9998b39dc1c940a8f499d6f70b3', 'materializationResultSha256': '5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c', 'materializationPublicResultSha256': '18c0487f2c884d51c970e3ef84fcef51ce8d4bd819d0c5465d43019c9de4ef0a', 'upgradeTerminalSha256': 'd6e9b9fbba71248f93560603d7108bde2f35ebacb80468b5a925f476a357514d', 'upgradeResultSha256': 'edde0904a28d8795b28611d9fd98104979abd475edea5857680065221216241e', 'upgradeCompletionSha256': '5e6fd6bf2cf98d19836e22d8b4b3774d9fa807afc1c0e08c289502db395667ab'},operatorReadySha256='5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c',
  inputManifestSha256='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
  inputMaterializationProfileSha256='71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7',
  preparationRequestKey=LOGICAL_PREPARE,preparationIdentityMapping=PREPARATION_IDENTITY_MAPPING,writerRequestKey=WRITER,batchPlanPath=str(STATE/PLAN_REL/'batched-plan.sqlite'),
  maximumChildSeconds=650 if KEY==PREPARE else 2780,
  maximumCleanupSeconds=130 if KEY==PREPARE else 220,maximumJobSeconds=780 if KEY==PREPARE else 3000,
  database=DB,adminProvisionReceiptSha256='12826d6714f6750feab4ddbc224392f77f253c32bbb981f0892225980f33a9e5',
  compact={'admin154SuccessorSha256':'96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e'},
  originalWriterReplayed=False,automaticReplay=False,businessWritesPermitted=KEY==WRITER)

def validate(a,at):
 fixed=scope()
 variable={'service','startsAt','expiresAt','authorizationReference','sourceSha256','independentReviewSha256',
  'operatorReadySha256','startTerminalSha256','startResultSha256','lockCapacitySettingsSha256',
  'applyTerminalSha256','applyResultSha256','nativeAuthoritySha256','nativeAuthorityBase64','expectedBinding',
  'installTerminalSha256','installResultSha256','batchedCatalog','catalogUpdateTerminalSha256',
  'catalogUpdateResultSha256','catalogUpdateCompletionSha256','inputMaterializationTerminalSha256','inputMaterializationResultSha256','sourceLineage'}
 if KEY==WRITER:variable|={'prepareTerminalSha256','prepareResultSha256','originalPreparedBinding','originalExecutionBinding','planCustody'}
 need(KEY == WRITER and type(a) is dict and set(a)==set(fixed)|variable
  and all(a[k]==v for k,v in fixed.items()),'FINAL33_EXACT_AUTHORITY_REQUIRED')
 for k in variable:
  if k.endswith('Sha256'):need(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]),'FINAL33_EXACT_PIN_REQUIRED')
 need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=at
  and at+a['maximumJobSeconds']*1000<a['expiresAt']<=a['startsAt']+14400000,'FINAL33_FINITE_WINDOW_REQUIRED')
 need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'FINAL33_REFERENCE_REQUIRED')
 s=a['service']
 need(type(s) is dict and set(s)=={'serviceKey','proofSha256','containerId','containerStartedAt','postmasterStart'}
  and s['serviceKey']=='t45-first-r3-native-service-start-20261118-43'
  and all(type(s[k]) is str and re.fullmatch('[a-f0-9]{64}',s[k]) for k in ('proofSha256','containerId'))
  and all(type(s[k]) is str and 0<len(s[k])<=64 for k in ('containerStartedAt','postmasterStart')),
  'FINAL33_EXACT_CURRENT_SERVICE_REQUIRED')
 binding=a['expectedBinding']
 need(type(binding) is dict and binding.get('currentServiceSha256')==s['proofSha256']
  and binding.get('postmasterStart')==s['postmasterStart'] and binding.get('transactionMode')=='BATCHED_V1'
  and binding.get('batchedModelSha256')=='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'
  and binding.get('batchedSourceSetSha256')=='a5f721749c1c7e59ce532ea6a287a310b2604ccbc77e0f1f2f0d831c5a2f8f6e'
  and binding.get('batchedCatalogSpecSha256')=='aefbfd2ea3425a7cf6f9ad7bd22f8f98d4a946d7a90cc0f3c75ea539fdea4f17',
  'FINAL33_NATIVE_BINDING_REQUIRED')
 if KEY==PREPARE:
  need(binding.get('format')=='FRESH35_BATCHED_PREPARATION_BINDING_V1'
   and binding.get('preparationScope')=={'requestKey':LOGICAL_PREPARE,'batchPlanPath':a['batchPlanPath']},'FINAL33_PREPARATION_SCOPE_REQUIRED')
 else:
  need(binding.get('manifestSha256')==fixed['inputManifestSha256'] and type(a['originalPreparedBinding']) is dict,
   'FINAL33_ORIGINAL_PREPARED_BINDING_REQUIRED')
 return a

def authority(raw):return validate(json.loads(raw),now())

def registered_authority(a,support):
 policy=json.loads(read(BASE/'r3-05-write-continuity/direct43-batched-real.json',262144))
 phase='prepare' if KEY==PREPARE else 'writer'
 need(policy['grantId']==GRANT and policy['jobs']['start']['jobId']==a['service']['serviceKey']==support.SERVICE
  and policy['jobs'][phase]['jobId']==KEY and policy['jobs'][phase]['script']=='final33_host.py'
  and policy['jobs'][phase]['bundlePins']['final33_host.py']==a['sourceSha256']
  and policy['jobs'][phase]['bundlePins']==PINS|{'final33_host.py':a['sourceSha256']}
  and policy['format']=='T45_R3_NORMAL43_BATCHED_REAL_V1' and policy['jobs']['writer']['jobId']==WRITER
  and set(policy['jobs'])=={'apply','start','writer','stop','restore'}
  and policy['startsAt']<=a['startsAt']<=now()<a['expiresAt']<=policy['expiresAt'],
  'FINAL33_EXACT_REGISTERED_POLICY_REQUIRED')
 return policy['jobs']['apply']['jobId']

def installed(a):
 key=INSTALL_KEY
 raw=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)==a['installTerminalSha256']==INSTALL_TERMINAL_SHA and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED24_INSTALL_TERMINAL_REQUIRED')
 leaf='batched-install-result.json'
 raw=read(JOBS/key/'results'/leaf);v=json.loads(raw)
 public=read(CONTROL/'jobs'/key/'results'/leaf,owner=1000)
 historical=read(HOST/'authority'/INSTALL_PROOF);old=json.loads(historical)
 birth=old['sharedPostgresNamespace']['container']
 service=dict(serviceKey=INSTALL_START,proofSha256=INSTALL_PROOF_SHA,containerId=birth['id'],
  containerStartedAt=birth['startedAt'],postmasterStart=old['physical']['postmasterStart'])
 need(sha(historical)==INSTALL_PROOF_SHA and old['requestKey']==INSTALL_START
  and old['dataDirectoryIdentity']==DATA and all(old['physical'][k]==value for k,value in PHYSICAL.items()),
  'BATCHED24_ORIGINAL_INSTALL_SERVICE_REQUIRED')
 need(sha(raw)==a['installResultSha256']==INSTALL_RESULT_SHA and sha(public)==INSTALL_PUBLIC_RESULT_SHA
  and json.loads(public)==v and v['requestKey']==key and v['service']==service
  and v['state']=='DB05_CATALOG_INSTALLED_AND_CAPTURED' and v['connectionCleanup']=='CLOSED'
  and v['sourceSetSha256']==INSTALL_OPERATOR_SOURCE_SHA and v['roleRestoreAcknowledged'] is True
  and v['programSha256']==INSTALL_PROGRAM_SHA and v['captureDirectoryLeaf']=='batched161-upgrade-'+INSTALL_PROGRAM_SHA
  and v['acknowledgedLayers']==13 and v['completionSha256']==INSTALL_COMPLETION_SHA
  and v['catalogSha256']==INSTALL_CATALOG_SHA
  and v['batchedCatalog']==a['batchedCatalog'],'BATCHED24_INSTALLED_CATALOG_REQUIRED')
 capture=HOST_STATE/HOST.name/v['captureDirectoryLeaf'];meta=capture.lstat()
 need(capture.resolve()==capture and stat.S_ISDIR(meta.st_mode)
  and (meta.st_uid,meta.st_gid,stat.S_IMODE(meta.st_mode))==(0,0,0o700),
  'BATCHED24_PROTECTED_INSTALL_CAPTURE_REQUIRED')
 completion=read(capture/'completion.json');done=json.loads(completion);program=done['program']
 need(sha(completion)==INSTALL_COMPLETION_SHA and done['format']=='FRESH35_BATCHED161_COMMITTED_CATALOG_CAPTURE_V1'
  and program['programSha256']==INSTALL_PROGRAM_SHA and program['currentServiceSha256']==INSTALL_PROOF_SHA
  and program['postmasterStart']==service['postmasterStart']
  and all(done['physical'][k]==val for k,val in PHYSICAL.items())
  and done['physical']['postmasterStart']==service['postmasterStart']
  and done['successorCatalogSha256']==INSTALL_CATALOG_SHA and done['roleRestoreAcknowledged'] is True
  and done['businessImported'] is False and done['hostEnabled'] is False
  and len(done['commits'])==len(program['steps'])==13,'BATCHED24_INSTALL_COMPLETION_REQUIRED')
 # Reuse the already verified 13-layer receipt and exact completion hash above.
 return old


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


def historical_applied_catalog_successor(a):
 key=CATALOG_UPDATE_KEY
 raw=read(JOBS/key/'r3-outer-terminal.json')
 terminal=json.loads(raw)
 need(sha(raw)==a['catalogUpdateTerminalSha256'] and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (terminal['jobId'],terminal['status'],terminal['exitCode'])==(key,'COMPLETED',0)
  and terminal.get('phaseStarted') is True and terminal.get('finishedAtUTC'),
  'DB05_COMMAND_SUCCESSOR_TERMINAL_REQUIRED')
 raw=read(JOBS/key/'results'/CATALOG_UPDATE_RESULT);result=json.loads(raw)
 public=read(CONTROL/'jobs'/key/'results'/CATALOG_UPDATE_RESULT,owner=1000)
 expected=dict(sourceSetSha256='cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c',
  catalogSpecSha256='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29',
  modelSha256='626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811')
 program=result['programSha256']
 need(sha(raw)==a['catalogUpdateResultSha256'] and result==json.loads(public)
  and result['requestKey']==key and result['service']==HISTORICAL_CATALOG_SERVICE
  and result['state']=='DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK'
  and result['reviewedInputSha256']==REVIEWED_CATALOG_INPUT_SHA256
  and result['connectionCleanup']=='CLOSED' and result['batchedCatalog']==expected
  and result['commitOutcomeUnknown'] is False and result['businessImported'] is False
  and all(result[k] is True for k in ('commitAcknowledged','postCommitReadback','roleRestoreAcknowledged',
   'innerAuthorityRemoved','childReaped','descendantsReaped'))
  and type(program) is str and re.fullmatch('[a-f0-9]{64}',program)
  and result['captureDirectoryLeaf']=='batched161-command-'+program
  and result['completionSha256']==a['catalogUpdateCompletionSha256'],'DB05_COMMAND_SUCCESSOR_RESULT_REQUIRED')
 capture=HOST_STATE/HOST.name/result['captureDirectoryLeaf'];s=capture.lstat()
 need(capture.resolve()==capture and stat.S_ISDIR(s.st_mode) and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o700),
  'DB05_COMMAND_PROTECTED_SUCCESSOR_CAPTURE_REQUIRED')
 commit=json.loads(read(capture/'commit.json'))
 need(commit==dict(requestKey=key,programSha256=program,commitAcknowledged=True),'DB05_COMMAND_SUCCESSOR_ACK_REQUIRED')
 completed=read(capture/'completion.json');receipt=json.loads(completed)
 need(sha(completed)==result['completionSha256'] and receipt['requestKey']==key
  and receipt['service']==HISTORICAL_CATALOG_SERVICE and receipt['programSha256']==program
  and all(receipt[k]==result[k] for k in ('commitAcknowledged','postCommitReadback','catalogSha256','beforeCatalogSha256',
   'routineAttributesSha256','batchedCatalog','reviewedInputSha256','sqlSha256','businessImported')),
  'DB05_COMMAND_SUCCESSOR_COMPLETION_DIFFERS')
 for leaf,key in (('catalog-before.json','beforeCatalogSha256'),('catalog-after.json','catalogSha256')):
  raw=read(capture/leaf,16*1024*1024)
  need(raw.endswith(b'\n') and sha(raw[:-1])==result[key],'DB05_COMMAND_SUCCESSOR_CAPTURE_DIFFERS')



def applied_catalog_successor(a):
 historical_applied_catalog_successor(a)
 helper=load('source_lineage.py',PINS['source_lineage.py'])
 helper.validate(a,read,JOBS,CONTROL,HOST_STATE,JOB)

def current(support,a,old,apply):
 fixed_history();s=a['service'];start=s['serviceKey'];boot=HOST_STATE/'native-services'/start
 raw=read(HOST/'authority'/support.PROOF_NAME);p=json.loads(raw);b=p['sharedPostgresNamespace']['container']
 data=HOST_STATE/HOST.name/'data'
 current_epoch=s['postmasterStart'];install_epoch=old['physical']['postmasterStart']
 need(sha(raw)==s['proofSha256'] and p['format']=='FRESH35_CURRENT_PRODUCTION_SERVICE_V2'
  and p['requestKey']==support.SERVICE==start and p['physical']['postmasterStart']==s['postmasterStart']
  and all(p[k]==old[k] for k in ('installationRecordSha256','targetSha256','sourceSetSha256'))
  and all(p['physical'][k]==old['physical'][k] for k in PHYSICAL)
  and p['dataDirectory']==old['dataDirectory']==str(STATE/HOST.name/'data') and data.resolve()==data
  and p['dataDirectoryIdentity']==old['dataDirectoryIdentity']==support.data_identity(data)
  and current_epoch.endswith('+00') and install_epoch.endswith('+00')
  and datetime.fromisoformat(current_epoch+':00')>datetime.fromisoformat(install_epoch+':00')
  and b['id']!=old['sharedPostgresNamespace']['container']['id']
  and b['id']==s['containerId']and b['startedAt']==s['containerStartedAt']
  and now()<a['expiresAt']<=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],'ORIGINAL_INSPECT_CURRENT_GENERATION_DIFFERS')
 support.inspect_birth(b,True)
 need(json.loads(read(boot/'carrier-birth.json'))==b and json.loads(read(boot/'retained-ack.json'))=={
  'requestKey':start,'proofSha256':s['proofSha256'],'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'ORIGINAL_INSPECT_CURRENT_RETAINED_ACK_REQUIRED')
 terminal=read(JOBS/start/'r3-outer-terminal.json');t=json.loads(terminal)
 need(sha(terminal)==a['startTerminalSha256']and terminal==read(CONTROL/'results'/(start+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(start,'COMPLETED',0),'ORIGINAL_INSPECT_START_TERMINAL_REQUIRED')
 result=read(JOBS/start/'results/normal-service-result.json');r=json.loads(result)
 need(sha(result)==a['startResultSha256']and r['requestKey']==start and r['proofSha256']==s['proofSha256']
  and r['lockCapacitySettingsSha256']==a['lockCapacitySettingsSha256'],'ORIGINAL_INSPECT_START_RESULT_REQUIRED')
 cap=read(boot/'lock-capacity-settings.json');c=json.loads(cap)
 need(sha(cap)==a['lockCapacitySettingsSha256']and r['lockCapacitySettings']==c and c['requestKey']==start
  and c['parameterInputsMatchedReviewedBudget']is True and c['capacityB']==31 and c['lockSlots']==2031616
  and c['settings']['max_locks_per_transaction']==65536 and c['cgroup']['memory.max']==7516192768,
  'ORIGINAL_INSPECT_MEASURED_CAPACITY_REQUIRED')
 raw=read(boot/'service-start-authorization.json');start_authority=json.loads(raw)
 apply_public=read(CONTROL/'jobs'/apply/'results/maintenance-auth-result.json',owner=1000)
 need(sha(raw)==p['authorizationSha256'] and start_authority['requestKey']==start
  and start_authority['applyRequestKey']==apply and start_authority['applyTerminalSha256']==a['applyTerminalSha256']
  and start_authority['applyResultSha256']==sha(apply_public),'BATCHED24_CURRENT_AUTH_APPLY_BINDING_REQUIRED')
 return p,start_authority

def controller(a,key):
 terminal=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(terminal)
 need(sha(terminal)==a['applyTerminalSha256']and terminal==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'ORIGINAL_INSPECT_ROLE_APPLY_TERMINAL_REQUIRED')
 raw=read(JOBS/key/'results/maintenance-auth-result.json');r=json.loads(raw)
 public=read(CONTROL/'jobs'/key/'results/maintenance-auth-result.json',owner=1000)
 need(sha(raw)==a['applyResultSha256'] and json.loads(public)==r and r['requestKey']==key and r['phase']=='apply'
  and r['status']=='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'
  and r['result']['status']=='EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'
  and r['result']['runtimeAuthChanged']is False and r['result']['membershipsOrRoleAttributesChanged']is False
  and a['expiresAt']==r['result']['credentialValidUntilByRole'][ROLE]
  and r['cleanup']['ownContainerStopped']is True and r['cleanup']['ownedPidAbsent']is True,'ORIGINAL_INSPECT_FINITE_ROLE_READBACK_REQUIRED')
 custody=key.removeprefix('t45-r3-').replace('-apply-','-')
 path=HOST_STATE/'native-services'/custody/(ROLE+'.json');s=path.lstat()
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
child=subprocess.Popen([node,'--no-global-search-paths',projection+'/final33-run.mjs',digest],
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
 birth=proof['sharedPostgresNamespace']['container'];cutoff=CHILD_CUTOFF
 packet=(NODE,str(STATE/PROJECTION/KEY),sha(read(JOB/'bundle/host-authorization.json',131072)),cutoff,birth['networkNamespace'],proof['guardian'],proof['postmaster'],NODE_SHA)
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

DIAGNOSTIC_ENUMS = {'format': ('FINAL33_FAILURE_DIAGNOSTIC_V1',), 'stage': ('PREFLIGHT', 'BIND_INPUTS', 'PREPARE_READERS', 'PREPARE_CALL', 'PREPARE_RESULT', 'EXECUTION_BINDING', 'WRITER_SCOPE', 'WRITER_CALL', 'WRITER_READBACK', 'UNKNOWN'), 'errorType': ('Error', 'AssertionError', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'UNKNOWN'), 'systemCode': ('ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_OUT_OF_RANGE', 'ERR_MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION', 'ERR_ACCESS_DENIED', 'EACCES', 'EPERM', 'ENOENT', 'ELOOP', 'ENOTDIR', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRINUSE', 'UNKNOWN'), 'guardCode': ('FINAL33_APPROVAL_CANONICAL_REQUIRED', 'FINAL33_APPROVAL_OUTSIDE_PACKAGE_REQUIRED', 'FINAL33_CANONICAL_INPUT_REQUIRED', 'FINAL33_CURRENT_SERVICE_DIFFERS', 'FINAL33_ENV_REFUSED', 'FINAL33_FINITE_AUTHORITY_REQUIRED', 'FINAL33_FIXED_CONTROLLER_REQUIRED', 'FINAL33_FIXED_PROCESS_REQUIRED', 'FINAL33_INITIALIZER_BOUND', 'FINAL33_INPUT_CHANGED', 'FINAL33_NATIVE_OUTCOME_UNCONFIRMED', 'FINAL33_ORIGINAL_PREPARE_BINDING_REQUIRED', 'FINAL33_PERSISTED_INITIALIZER_BINDING_DIFFERS', 'FINAL33_PERSISTED_SCOPE_BINDING_DIFFERS', 'FINAL33_PREFLIGHT_REFUSED', 'FINAL33_PRIVATE_INPUT_BOUND', 'FINAL33_PRIVATE_PLAN_DIRECTORY_REQUIRED', 'FINAL33_PROTECTED_INPUT_REQUIRED', 'FINAL33_PROTECTED_PARENT_REQUIRED', 'FINAL33_RESTORED_SCOPE_DIFFERS', 'FINAL33_SCRATCH_REQUIRED', 'FINAL33_SOURCE_MATERIALIZATION_DIFFERS', 'UNKNOWN'), 'sqlstate': ('42601', '42702', '42501', '42P01', '42703', '42883', '23502', '23503', '23505', '23514', '22012', '22P02', '40001', '40P01', '57014', '55P03', '55000', 'P0001', '28P01', '3D000', '53300', '57P01', '08006', None)}

def project_failure_diagnostic(value):
    if type(value) is not dict or set(value) != set(DIAGNOSTIC_ENUMS):
        return None
    for key, allowed in DIAGNOSTIC_ENUMS.items():
        item = value[key]
        if item is not None and type(item) is not str:
            return None
        if item not in allowed:
            return None
    return {key: value[key] for key in DIAGNOSTIC_ENUMS}

def run(a,raw,ops,support,apply):
 global cli,runtime,access,CHILD_CUTOFF
 cli=load('r3_05_cli.py',PINS['r3_05_cli.py']);runtime=load('r3_05_runtime.py',PINS['r3_05_runtime.py'])
 access=load('nonroot_input_access.py',PINS['nonroot_input_access.py'])
 old=installed(a);proof,start_authority=current(support,a,old,apply);applied_catalog_successor(a);final_inputs(a,proof)
 pg=controller(a,apply)
 ready=read(HOST_STATE/OPERATOR/'source-materialization.json');v=json.loads(ready)
 need(sha(ready)==a['operatorReadySha256'] and v['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'
  and v['sourceRowsSha256']==SOURCE_ROWS_SHA256 and v['sourceSetSha256']==SOURCE_SET_SHA256 and v['sourceFiles']==392,
  'FINAL33_EXACT_SOURCE_MATERIALIZATION_REQUIRED')
 record_raw=read(HOST/'authority/fresh35-compact-zero-successor-v2.json')
 need(sha(record_raw)=='d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e','FINAL33_ORIGINAL_TARGET_REQUIRED')
 target=dict(protocol='STANDARD_IMPORT_SQL_V1',system_identifier='7706545564479176741',database_oid='16393',
  database_name=DB,catalog_sha256=json.loads(record_raw)['successor']['catalogSha256'])
 admin,secret,origin=admin_material(ops,a,start_authority)
 payload={'admin':json.loads(admin),'encodedScrypt':secret.decode(),'provision':json.loads(origin),'postgres':pg,'target':target}
 if KEY==WRITER:
  payload['preparedBinding']=original_prepared(a);verify_plan_custody(a)
 root=HOST_STATE/PROJECTION;group_directory(root,not os.path.lexists(root))
 projection=root/KEY;group_directory(projection);TRACK['projection']=projection
 private=JOB/'native-private';private.mkdir(mode=0o700);sync(JOB)
 for name,body in [('final33-run.mjs',read(JOB/'bundle/final33-run.mjs',262144)),('host-authorization.json',raw)]:
  if name.endswith('.mjs'):need(sha(body)==PINS[name],'FINAL33_EXACT_RUNNER_REQUIRED')
  put(projection/name,body,0o440,61035)
 for name in ('scratch','owned-private'):
  p=projection/name;p.mkdir(mode=0o700);os.chown(p,61035,61035);p.chmod(0o700);sync(projection)
 plan_dir=HOST_STATE/PLAN_REL
 if KEY==PREPARE:
  need(not os.path.lexists(plan_dir),'FINAL33_PLAN_DIRECTORY_EXISTS_READ_ORIGINAL_KEY')
  need(plan_dir.parent.resolve()==plan_dir.parent,'FINAL33_CANONICAL_PLAN_PARENT_REQUIRED')
  plan_dir.mkdir(mode=0o700);os.chown(plan_dir,61035,61035);plan_dir.chmod(0o700);sync(plan_dir.parent)
 else:
  s=plan_dir.lstat();need(plan_dir.resolve()==plan_dir and stat.S_ISDIR(s.st_mode)
   and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(61035,61035,0o700),'FINAL33_ORIGINAL_PLAN_DIRECTORY_REQUIRED')
  p=plan_dir/'batched-plan.sqlite';s=p.lstat()
  need(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size>0
   and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(61035,61035,0o600),'FINAL33_ORIGINAL_PRIVATE_PLAN_REQUIRED')
 receipt=None;error=None;authority_identity=None;matched=False;child_started=False
 cleanup={'requestKey':KEY,'childReaped':False,'descendantsReaped':False,'connectionCleanup':'NOT_OPENED',
  'nativeAuthorityRemoved':False,'scratchEmpty':False,'originalInputMetadataChanges':0}
 try:
  authority_identity=native_projection(a,base64.b64decode(a['nativeAuthorityBase64'],validate=True))
  current(support,a,old,apply)
  CHILD_CUTOFF=min(a['expiresAt']-a['maximumCleanupSeconds']*1000,ENTRY_WALL+a['maximumChildSeconds']*1000)
  need(now()+12000<CHILD_CUTOFF,'FINAL33_OPERATION_WORK_DEADLINE_EXPIRED')
  child_started=True;TRACK['childEntered']=True;receipt=child_run(proof,a,payload)
  result=receipt.get('result',{})
  put(JOB/'native-private/native-result.json',encode(result),0o400)
  matched=result.get('requestKey')==KEY and result.get('inputSha256')==sha(raw) and result.get('service')==a['service']
  need(matched,'FINAL33_NATIVE_RESULT_BINDING_REQUIRED')
 except BaseException as problem:error=problem
 finally:
  payload.clear();pg=None;admin=secret=origin=None
  child_reaped=receipt is not None and receipt.get('childReaped') is True and receipt.get('descendantsReaped') is True
  if child_reaped or not child_started:
   cleanup.update(childReaped=True,descendantsReaped=True)
   result=(receipt or {}).get('result',{})
   connection=result.get('connectionCleanup','UNKNOWN') if matched else 'NOT_OPENED' if not child_started else 'UNKNOWN'
   cleanup['connectionCleanup']=connection if connection in ('CLOSED','NOT_OPENED') else 'REAPED_EXCLUSIVE_PROCESS'
   if authority_identity is not None:native_projection(a,expected=authority_identity)
   cleanup['nativeAuthorityRemoved']=True
   cleanup['scratchRetainedPrivately']=retain_closed_scratch(projection)
   cleanup['scratchEmpty']=not any((projection/'scratch').iterdir())
   if KEY==PREPARE:cleanup['privateInitializer']=preserve_final_initializer()
  else:cleanup['connectionCleanup']='UNCONFIRMED'
  put(JOB/('results/final33-'+PHASE+'-child-cleanup.json'),encode(cleanup))
 result=(receipt or {}).get('result',{'requestKey':KEY,'state':'UNKNOWN','connectionCleanup':'NOT_OPENED' if not child_started else 'UNKNOWN'})
 if not os.path.lexists(JOB/'native-private/native-result.json'):put(JOB/'native-private/native-result.json',encode(result),0o400)
 public={'requestKey':KEY,'phase':PHASE.upper(),'service':a['service'],
  'state':result.get('state','UNKNOWN') if matched else 'UNKNOWN','preparationIdentityMapping':a['preparationIdentityMapping'],'nativeResultSha256':sha(encode(result)),
  'nativeConnectionCleanup':result.get('connectionCleanup','UNKNOWN'),'processCleanup':cleanup,
  'nativeResultBindingMatched':matched,'lifecycleConfirmed':bool(receipt and receipt.get('lifecycleConfirmed') is True),
  'automaticReplay':False,'nativeOutcomeInferredFromOuterStatus':False,
  'safeCode':result.get('safeCode'),'sqlstate':result.get('sqlstate'),'batchPlanPath':a['batchPlanPath']}
 if matched:
  diagnostic=project_failure_diagnostic(result.get('failureDiagnostic'))
  if diagnostic is not None:public['failureDiagnostic']=diagnostic
 if matched and KEY==PREPARE and result.get('preparedBinding') is not None:
  public['preparedBinding']=result['preparedBinding'];public['executionBinding']=result.get('executionBinding')
 if matched and KEY==WRITER:public.update(verification=result.get('verification'),readbackConnectionCleanup=result.get('readbackConnectionCleanup'))
 if error:public['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'FINAL33_HOST_OUTCOME_UNCONFIRMED'
 put(JOB/('results/final33-'+PHASE+'-result.json'),encode(public))
 if error:put(JOB/('results/final33-'+PHASE+'-incomplete.json'),encode(public))
 safe=all(cleanup[k] is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))
 return 0 if error is None and receipt and receipt['exitCode']==0 and receipt.get('resultReceived') is True and receipt.get('lifecycleConfirmed') is True and matched and safe else 2

def main():
 global ENTRY_WALL
 ENTRY_WALL=now()
 need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and KEY == WRITER
  and Path(__file__)==JOB/'bundle/final33_host.py' and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
  and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB) and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),
  'FINAL33_FIXED_REGISTERED_ENTRY_REQUIRED')
 os.umask(0o077)
 def interrupted(*_):raise ValueError('FINAL33_HOST_INTERRUPTED')
 for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
 raw=read(JOB/'bundle/host-authorization.json',131072)
 need(sha(raw)==sys.argv[1],'FINAL33_EXTERNAL_AUTHORITY_DIGEST_REQUIRED');a=validate(json.loads(raw),now())
 need(a['sourceSha256']==sha(read(Path(__file__),262144)),'FINAL33_EXACT_HOST_SOURCE_REQUIRED')
 support=load('normal05_retained_stop.py',PINS['normal05_retained_stop.py'])
 apply=registered_authority(a,support)
 return run(a,raw,load('fresh35-production-carrier.py',OPS_SHA),support,apply)


def final_inputs(a,proof):
 key='t45-r3-final33-input-materialize-20261116-02'
 t_raw=read(JOBS/key/'r3-outer-terminal.json');t=json.loads(t_raw)
 need(sha(t_raw)==a['inputMaterializationTerminalSha256'] and t_raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
  and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0) and t.get('phaseStarted') is True,
  'FINAL33_ACTUAL_INPUT_MATERIALIZATION_TERMINAL_REQUIRED')
 raw=read(JOBS/key/'results/final33-input-materialization-result.json');result=json.loads(raw)
 need(sha(raw)==a['inputMaterializationResultSha256']
  and result==json.loads(read(CONTROL/'jobs'/key/'results/final33-input-materialization-result.json',owner=1000))
  and raw==read(INPUT_ROOT/'materialization-receipt.json')
  and result['state']=='FINAL33_PRIVATE_INPUTS_MATERIALIZED_NO_PG_OR_PRECHECK_REPLAY'
  and result['profileSha256']==scope()['inputMaterializationProfileSha256']
  and result['manifestSha256']==scope()['inputManifestSha256'] and result['PGConnections']==0
  and result['businessDatabaseWrites'] is False and result['targetDirectory']==str(INPUT_ROOT),
  'FINAL33_ACTUAL_INPUT_MATERIALIZATION_REQUIRED')
 st=INPUT_ROOT.lstat()
 need(INPUT_ROOT.resolve()==INPUT_ROOT and stat.S_ISDIR(st.st_mode)
  and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(0,61035,0o750)
  and result['targetIdentity']=={'device':st.st_dev,'inode':st.st_ino},'FINAL33_INPUT_ROOT_IDENTITY_CHANGED')
 # Whole state is already mounted for the original native lifecycle; require the new input subtree read-only.
 q=subprocess.run(['/usr/bin/docker','inspect','--format','{{json .Mounts}}',proof['sharedPostgresNamespace']['container']['id']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and len(q.stdout)<=65536,'FINAL33_ACTUAL_MOUNT_READBACK_REQUIRED')
 mounts=json.loads(q.stdout)
 expected={'Source':str(INPUT_ROOT),'Destination':str(STATE/INPUT_ROOT.name),'Type':'bind','RW':False}
 matches=[m for m in mounts if m.get('Destination')==expected['Destination']]
 need(len(matches)==1 and all(matches[0].get(k)==v for k,v in expected.items()),'FINAL33_READONLY_INPUT_MOUNT_REQUIRED')

def native_projection(a,raw=None,expected=None):
 leaf='fresh35-batched-preparation-v1.json' if KEY==PREPARE else 'fresh35-compact-zero-execution-v2.json'
 path=HOST_STATE/'native-services'/a['service']['serviceKey']/'authority-61035'/leaf
 s=path.parent.lstat()
 need(path.parent.resolve()==path.parent and stat.S_ISDIR(s.st_mode)
  and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,61035,0o750),'FINAL33_EXISTING_AUTHORITY_MOUNT_REQUIRED')
 if raw is not None:
  need(0<len(raw)<=65536 and sha(raw)==a['nativeAuthoritySha256'],'FINAL33_NATIVE_AUTHORITY_BYTES_REQUIRED')
  native=json.loads(raw)
  need(native.get('binding')==a['expectedBinding'] and native.get('startsAt')==a['startsAt']
   and native.get('expiresAt')==a['expiresAt'],'FINAL33_NATIVE_AUTHORITY_SCOPE_DIFFERS')
  if KEY==PREPARE:
   need(set(native)=={'format','decision','binding','startsAt','expiresAt','maximumOperationSeconds','maximumCleanupSeconds',
    'maximumJobSeconds','independentSafetyReviewSha256','authorizationReference'}
    and native['format']=='FRESH35_BATCHED_PREPARATION_AUTHORIZATION_V1'
    and native['decision']=='AUTHORIZE_EXACT_BATCH_PREPARATION_AND_READONLY_ROOT_INSPECTION'
    and native['maximumOperationSeconds']==650 and native['maximumCleanupSeconds']==130 and native['maximumJobSeconds']==780,
    'FINAL33_PREPARATION_AUTHORITY_REQUIRED')
  else:cli.require_execute_authority(raw,a['nativeAuthoritySha256'],a['expectedBinding'],now(),a['expiresAt'],json.loads)
  need(not os.path.lexists(path),'FINAL33_AUTHORITY_ALREADY_EXISTS_NO_OVERWRITE')
  put(path,raw,0o440,61035);return identity(path.lstat())
 need(expected is not None and identity(path.lstat())==expected and sha(read(path))==a['nativeAuthoritySha256'],
  'FINAL33_OWN_AUTHORITY_CHANGED')
 path.unlink();sync(path.parent)

def original_prepared(a):
 raw=read(JOBS/PREPARE/'r3-outer-terminal.json');terminal=json.loads(raw)
 need(sha(raw)==a['prepareTerminalSha256'] and raw==read(CONTROL/'results'/(PREPARE+'.json'),owner=1000)
  and (terminal['jobId'],terminal['status'],terminal['exitCode'])==(PREPARE,'COMPLETED',0)
  and terminal.get('phaseStarted') is True,'FINAL33_ACTUAL_PREPARE_TERMINAL_REQUIRED')
 raw=read(JOBS/PREPARE/'results/final33-prepare-result.json');result=json.loads(raw)
 need(sha(raw)==a['prepareResultSha256'] and result==json.loads(read(CONTROL/'jobs'/PREPARE/'results/final33-prepare-result.json',owner=1000))
  and result['requestKey']==PREPARE and result['state']=='BATCHED_IMPORT_PREPARED'
  and result['nativeResultBindingMatched'] is True and result['lifecycleConfirmed'] is True
  and result['nativeConnectionCleanup']=='CLOSED' and result['processCleanup']['childReaped'] is True
  and result['processCleanup']['descendantsReaped'] is True and result['processCleanup']['nativeAuthorityRemoved'] is True,
  'FINAL33_ACTUAL_PREPARE_RESULT_REQUIRED')
 raw=read(JOBS/PREPARE/'native-private/native-result.json');native=json.loads(raw)
 witness=json.loads(read(JOB/'bundle/historical-prepare05.json'))
 need(a['prepareTerminalSha256']==witness['terminalSha256'] and a['prepareResultSha256']==witness['rootResultSha256']
  and result['nativeResultSha256']==witness['nativeResultSha256'] and a['originalPreparedBinding']==witness['preparedBinding']
  and a['originalExecutionBinding']==witness['executionBinding'],'FINAL43_EXACT_OLD_WITNESS_REQUIRED')
 need(sha(raw)==result['nativeResultSha256'] and native['preparedBinding']==a['originalPreparedBinding']
  and native['executionBinding']==a['originalExecutionBinding'] and native['nativeResult']['root_state']=='ABSENT'
  and native['nativeResult']['business_database_writes'] is False and not native.get('localCleanup')
  and native.get('approvalCleanup')!='UNCONFIRMED','FINAL33_EXACT_ORIGINAL_PREPARE_REQUIRED')
 return native['preparedBinding']

def verify_plan_custody(a):
 expected=a['planCustody'];root=HOST_STATE/PLAN_REL
 paths={str(root):('directory',0o700),str(root/'batched-plan.sqlite'):('file',0o600),str(root/'original-initializer.json'):('file',0o600)}
 need(type(expected)is dict and set(expected)==set(paths),'FINAL43_EXACT_PLAN_CUSTODY_REQUIRED')
 for name,(kind,mode)in paths.items():
  p=Path(name);z=p.lstat();actual=[z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
  need(p.resolve()==p and actual==expected[name] and z.st_uid==z.st_gid==61035 and stat.S_IMODE(z.st_mode)==mode
   and(stat.S_ISDIR(z.st_mode)if kind=='directory'else stat.S_ISREG(z.st_mode)and z.st_nlink==1 and z.st_size>0),'FINAL43_PLAN_METADATA_DIFFERS')
 # No initializer or SQLite body read here; native persisted-program validation owns semantics.


def preserve_final_initializer():
 path=HOST_STATE/PLAN_REL/'original-initializer.json'
 if not os.path.lexists(path):return None
 raw=read(path,128*1024*1024,owner=61035);s=path.lstat()
 need(s.st_gid==61035 and stat.S_IMODE(s.st_mode)==0o600,'FINAL33_PRIVATE_INITIALIZER_METADATA_REQUIRED')
 put(JOB/'native-private/original-initializer.json',raw,0o400)
 return {'sha256':sha(raw),'bytes':len(raw)}

if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as error:
  safe=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'FINAL33_ROOT_PREFLIGHT_UNCONFIRMED'
  if os.path.lexists(JOB/'results'):
   path=JOB/('results/final33-'+PHASE+'-incomplete.json')
   if not os.path.lexists(path):put(path,encode({'requestKey':KEY,'state':'UNKNOWN','safeCode':safe,'automaticReplay':False}))
   path=JOB/('results/final33-'+PHASE+'-child-cleanup.json')
   if not TRACK['childEntered'] and not os.path.lexists(path):
    put(path,encode({'requestKey':KEY,'childStarted':False,'childReaped':True,'descendantsReaped':True,
     'connectionCleanup':'NOT_OPENED','originalInputMetadataChanges':0}))
  raise SystemExit(2)
