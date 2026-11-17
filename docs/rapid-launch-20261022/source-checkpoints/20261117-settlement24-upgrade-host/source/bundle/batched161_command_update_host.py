"""Finite exact DB05 install consumer on the retained ordinary34 service."""
from pathlib import Path
from types import ModuleType
import base64,hashlib,json,os,re,signal,stat,sys,time

KEY=None  # Actual successor unissued.
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)
JOB=BASE/'jobs'/KEY if KEY is not None else None
CONTROL=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
START=None
SERVICE_PROOF=None
APPLY_KEY=None
ADMIN_CONFIG=None
POLICY=None
INNER_LEAF=None
ROOT08_MARKER_SHA256=None
ADMIN=None
STATE=Path('/var/lib/naijue-erp/fresh35-production')
JOBS=BASE/'jobs'
HOST_STATE=HOST/'state'
INSTALL_KEY='t45-r3-batched-install-20261116-02'
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
PHYSICAL={'systemIdentifier': '7706545564479176741', 'databaseOid': '16393', 'serverVersionNum': '170011'}
DATA={'device': 66304, 'inode': 13502421, 'uid': 61035, 'gid': 61035, 'mode': 448}
REVIEWED_INPUT_SHA256='faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19'
OPERATOR='installed-real-operation-batched-root08-20261117-01'
SOURCE_SET_SHA256='ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3'
SOURCE_ROWS_SHA256='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'
PINS = {'normal05_retained_stop.py': '0c27df9e48f20d78616938619d763804dbb26939e988e02b5755cea683c8a244', 'diagnostic02-readback.json': 'b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf', 'catalog_transport.py': '93d6a1c19a60dd03473202c2f78cfe405b8e67564909ec5a107d989c750f954a', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'historical-catalog35.json': '4691772528f237973a6a2b0d636edde1ffcf7916c30db0f55bc0e714dd11547e', 'main-recovery-decision.json': 'b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78', 'catalog-successor-run.mjs': '7a7593172a8c4b05d5f9e7855c1f8c9d78c2b2896b5e0bc84afb34f60cabf821', 'catalog-pg-driver.mjs': 'cdfb4fdeb6919364c5795c1e2ccb6f58650337b0b7bc59aa71d102b3e9a1a87f', 'historical-writer39-failed.json': 'dbd5e1c4f8baa4d3489a9eda8fd7c29e5a834097aad6ba808e96aa07973e9aaa'}

def need(v,c):
    if not v:raise ValueError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def now():return time.time_ns()//1000000
def encode(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
ROUTINE_PINS=[{'signature': 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)', 'beforeBodySha256': 'cc11ea590f93b579a0e1286a2c28bd2fc7a6b423a366bc35ef54406a4cc46fba', 'beforeDefinitionSha256': '3bcc7f4bd796df962c6794e1fe2b63e1a92df269f78d431af7b0fefc7f3c97b6', 'afterBodySha256': 'ed028cc873d9d4dd556dd60b790fca8ef912550b463a949736f214acefd5dcbd', 'afterDefinitionSha256': 'ed9e5daa0797e7ced0caa920f4c6d8ad465c7edcf01ed20b903d5f3f1d4ee869', 'replacements': [{'before': "sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'", 'after': "(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"}, {'before': "CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 24", 'after': "CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 24"}, {'before': "CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 26", 'after': "CASE WHEN (cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (cfg->'historical_settlement_retention_approval'->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (initial_request->>'namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (initial_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679')) THEN 26"}]}, {'signature': 'naijue_erp.assert_document_migration(uuid)', 'beforeBodySha256': '508188784710a0bebaa7cf2d32e188f20ab82918e67a34b681d7b9d44951f5f4', 'beforeDefinitionSha256': '3b44e33fd7d32d1ba33b2b520a1c62ac93f04c55198475d404eb2cdadd3e31ce', 'afterBodySha256': '45269a5359a89ae4e36383cbf4dec7fea4017bc9677a90b96df0eaf0e011c39f', 'afterDefinitionSha256': '51f8516e6d82124fb440569ff7faae0c1eefff32c2d4b835b444eb190d2371eb', 'replacements': [{'before': "sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'", 'after': "(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (sr_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"}]}, {'signature': 'naijue_erp.standard_whole_package_verify_v2(jsonb,text)', 'beforeBodySha256': '8e490d4abdfaa1e8faa4a3ee3a7fe43d87c73521b1836818ae126db83acbbab8', 'beforeDefinitionSha256': 'fcad22a97e86d0b4c0226dbd6014600a7fecd9fa4923785aaf2983ee89b53eca', 'afterBodySha256': '005f47f4925a9d4118d7dcc461a42fe2568a4cddd21b2e73f28bae18ba5892ee', 'afterDefinitionSha256': '5433d23324c4f4d999d086f22759363232ae5484de5591f0969dd37ede2b858c', 'replacements': [{'before': "sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'", 'after': "(sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' OR (sr_wire->>'sha256'='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05' AND (sr_approval->>'source_namespace') IS NOT DISTINCT FROM 'naijue:tplus:20261102' AND (init_request->>'package_manifest_sha256') IS NOT DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'))"}]}]
BEFORE_CATALOG={'sourceSetSha256':'cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c','catalogSpecSha256':'9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29','modelSha256':'626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811'}
HISTORICAL_INSTALL32_CATALOG={'sourceSetSha256':'b7aa9fa8766d53d06ab9bd335d047fe9830cc95e8df31333e942193221ba7269','catalogSpecSha256':'4be30c87bfea605a313e48a5a94e158f8cb7bb90d6d78aa00e4a0d28dfd14b26','modelSha256':'6e0a0e039eead7714d4e2ec6c995678860dee16d35e7282245bc5748eb565e85'}
AFTER_MODEL='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'
SQL_SHA256='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
DIAGNOSTIC_KEY='t45-r3-core0-durable-readonly-20261117-02'
DIAGNOSTIC_READBACK_SHA256='b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf'
MAIN_DECISION_SHA256='b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78'

def runtime_bound():
    need(all(type(x)is str and x for x in (KEY,START,SERVICE_PROOF,ADMIN,APPLY_KEY,ADMIN_CONFIG,POLICY,INNER_LEAF,ROOT08_MARKER_SHA256)),
        'SETTLEMENT24_ACTUAL_RUNTIME_BINDINGS_UNISSUED')
    need(KEY not in ('t45-r3-batched161-command-successor-20261116-01','t45-r3-batched-real-execute-20261115-01',DIAGNOSTIC_KEY),
        'SETTLEMENT24_CONSUMED_KEY_REFUSED')
    need(re.fullmatch('[a-f0-9]{64}',ROOT08_MARKER_SHA256),'SETTLEMENT24_ACTUAL_ROOT08_REQUIRED')


def scope():
    return dict(format='T45_R3_SETTLEMENT24_THREE_ROUTINE_HOST_V1',requestKey=KEY,
        decision='UPDATE_EXACT_SETTLEMENT24_THREE_ROUTINES_ONLY',database='erp_fresh35_20261110_r3',
        sourceSetSha256=SOURCE_SET_SHA256,sourceRowsSha256=SOURCE_ROWS_SHA256,
        diagnostic02ReadbackSha256=DIAGNOSTIC_READBACK_SHA256,MainRecoveryDecisionSha256=MAIN_DECISION_SHA256,
        maximumChildSeconds=700,businessImported=False,automaticReplay=False)
def validate(a,at):
    runtime_bound()
    fixed=scope()
    need(REVIEWED_INPUT_SHA256 is not None,'DB05_COMMAND_FINAL_REVIEW_REQUIRED')
    variable={'service','startsAt','expiresAt','authorizationReference','independentReviewSha256','sourceSha256',
        'operatorReadySha256','startTerminalSha256','startResultSha256','lockCapacitySettingsSha256',
        'applyTerminalSha256','applyResultSha256','upgradeDescriptor','innerAuthoritySha256','innerAuthorityBase64',
        'backupAdminValidUntil','installStartsAt','installExpiresAt','installTerminalSha256','installResultSha256','batchedCatalog'}
    need(all(type(v) is str and re.fullmatch('[a-f0-9]{64}',v) for v in (SOURCE_SET_SHA256,SOURCE_ROWS_SHA256)),
        'BATCHED_INSTALL_FROZEN_SOURCE_REQUIRED')
    need(type(a) is dict and set(a)==set(fixed)|variable and all(a[k]==v for k,v in fixed.items()),'BATCHED_INSTALL_EXACT_SCOPE_REQUIRED')
    for k in variable:
        if k.endswith('Sha256'):need(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]),'BATCHED_INSTALL_PIN_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is type(a['backupAdminValidUntil']) is type(a['installStartsAt']) is type(a['installExpiresAt']) is int
        and a['installStartsAt']<=a['startsAt']<=at<at+180000<a['expiresAt']==a['installExpiresAt']<=a['backupAdminValidUntil']
        and a['expiresAt']-a['installStartsAt']<=1200000,'BATCHED_INSTALL_FINITE_WINDOW_REQUIRED')
    s=a['service']
    need(type(s) is dict and set(s)=={'serviceKey','proofSha256','containerId','containerStartedAt','postmasterStart'} and s['serviceKey']==START
        and all(type(s[k]) is str and re.fullmatch('[a-f0-9]{64}',s[k]) for k in ('proofSha256','containerId')),'BATCHED_INSTALL_CURRENT_SERVICE_REQUIRED')
    d=a['upgradeDescriptor']
    need(type(d) is dict and d['format']=='FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'
        and d['sourceSetSha256']==SOURCE_SET_SHA256 and d['currentServiceSha256']==s['proofSha256']
        and d['postmasterStart']==s['postmasterStart'] and d['startsAt']==a['installStartsAt'] and d['expiresAt']==a['installExpiresAt']
        and d['requestKey']==KEY and d['backupAdminValidUntil']==a['backupAdminValidUntil']
        and d['reviewedInputSha256']==REVIEWED_INPUT_SHA256
        and d['functionIdentities']==[r['signature']for r in ROUTINE_PINS]
        and d['routinePins']==ROUTINE_PINS and d['sqlSha256']==SQL_SHA256
        and d['installedBatchedCatalog']==a['batchedCatalog']==BEFORE_CATALOG
        and d['predecessorBatchedCatalog']==BEFORE_CATALOG
        and d['batchedCatalog']['modelSha256']==AFTER_MODEL,
        'BATCHED_INSTALL_EXACT_PROGRAM_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'BATCHED_INSTALL_REFERENCE_REQUIRED')
    inner=base64.b64decode(a['innerAuthorityBase64'],validate=True)
    need(0<len(inner)<=65536 and sha(inner)==a['innerAuthoritySha256'],'BATCHED_INSTALL_INNER_BYTES_REQUIRED')
    v=json.loads(inner)
    need(set(v)=={'format','decision','programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'}
        and v['format']=='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1'
        and v['decision']=='AUTHORIZE_EXACT_DB05_SIX_ARG_COMMAND_ONLY'
        and all(v[k]==d[k] for k in ('programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt'))
        and v['independentSafetyReviewSha256']==a['independentReviewSha256'],'BATCHED_INSTALL_EXACT_INNER_REQUIRED')
    return a

def read(path,maximum=262144,owner=0):
    need(path.resolve()==path,'BATCHED_INSTALL_CANONICAL_PATH_REQUIRED')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode) and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=maximum,'BATCHED_INSTALL_PROTECTED_INPUT_REQUIRED')
        raw=f.read(maximum+1)
        identity=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
        need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'BATCHED_INSTALL_INPUT_CHANGED')
        return raw
def load(name):
    path=JOB/'bundle'/name;raw=read(path)
    need(sha(raw)==PINS[name],'BATCHED_INSTALL_SOURCE_DIFFERS')
    m=ModuleType(name[:-3]);m.__file__=str(path);sys.modules[m.__name__]=m;exec(compile(raw,str(path),'exec'),m.__dict__);return m

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
  and v['batchedCatalog']==HISTORICAL_INSTALL32_CATALOG,'BATCHED24_INSTALLED_CATALOG_REQUIRED')
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
 for index,step in enumerate(program['steps'],1):
  ack=dict(order=index,name=step['name'],sqlSha256=step['sha256'],commitAcknowledged=True)
  need(json.loads(read(capture/f'commit-{index:02}.json'))==ack==done['commits'][index-1],
   'BATCHED24_INSTALL_LAYER_ACK_REQUIRED')
 catalog=read(capture/'catalog-161.json',16*1024*1024)
 need(catalog.endswith(b'\n') and sha(catalog[:-1])==INSTALL_CATALOG_SHA,
  'BATCHED24_INSTALLED_161_CAPTURE_REQUIRED')
 return old

def recovery_facts(a):
    # Existing bounded metadata receipts only. No live PG, query or payload read.
    def evidence(name):
        raw=read(JOB/'bundle'/name)
        need(sha(raw)==PINS[name],'SETTLEMENT24_FIXED_RECOVERY_EVIDENCE_REQUIRED')
        return json.loads(raw)
    diagnostic=evidence('diagnostic02-readback.json')
    decision=evidence('main-recovery-decision.json')
    writer=evidence('historical-writer39-failed.json')
    catalog=evidence('historical-catalog35.json')
    need(PINS['diagnostic02-readback.json']==DIAGNOSTIC_READBACK_SHA256
        and PINS['main-recovery-decision.json']==MAIN_DECISION_SHA256
        and decision['actualDiagnosticReadbackSha256']==DIAGNOSTIC_READBACK_SHA256
        and decision['SQLUpgradeAlreadyPerformed']is False
        and decision['sourceInputOrIdentityAlterationAuthorized']is False
        and decision['truncateDeleteOrRebuildAuthorized']is False
        and decision['originalFailedWriterPermanentlyConsumed']is True,
        'SETTLEMENT24_MAIN_FACTUAL_RECOVERY_REQUIRED')
    def receipt(key,terminal_pin,result_leaf,result_pin,result_value):
        raw=read(JOBS/key/'r3-outer-terminal.json')
        need(sha(raw)==terminal_pin and raw==read(CONTROL/'results'/(key+'.json'),owner=1000),
            'SETTLEMENT24_ORIGINAL_TERMINAL_REQUIRED')
        terminal=json.loads(raw);need(terminal['jobId']==key,'SETTLEMENT24_ORIGINAL_KEY_REQUIRED')
        raw=read(JOBS/key/'results'/result_leaf)
        need(sha(raw)==result_pin and json.loads(raw)==result_value
            and json.loads(read(CONTROL/'jobs'/key/'results'/result_leaf,owner=1000))==result_value,
            'SETTLEMENT24_ORIGINAL_RESULT_REQUIRED')
        return terminal
    term=receipt(DIAGNOSTIC_KEY,'68ef74f754d803b13788fe420517900570cd4f5c714e264a16b204182d7f65a6',
        'durable-readonly-result.json','67e2ba34665b3f86123bdc6f49cdec697defb3a51091389cf95d60b36a481fd4',diagnostic['result'])
    need((term['status'],term['exitCode'])==('COMPLETED',0),'SETTLEMENT24_DIAGNOSTIC_COMPLETE_REQUIRED')
    raw=read(JOBS/DIAGNOSTIC_KEY/'results/durable-readonly-cleanup.json')
    cleanup=diagnostic['cleanup']
    need(sha(raw)=='efa0d88a847a8bf83f1beb2decb5dd3c90918d28155616cef1db338426b3e45a'
        and json.loads(raw)==cleanup
        and json.loads(read(CONTROL/'jobs'/DIAGNOSTIC_KEY/'results/durable-readonly-cleanup.json',owner=1000))==cleanup
        and all(cleanup[k]is True for k in ('ownContainerStopped','ownedPidAbsent','pgdataPidAbsent','originalPortAbsent','dataPreserved')),
        'SETTLEMENT24_DIAGNOSTIC_OWN_CLEANUP_REQUIRED')
    snapshot=diagnostic['result']['snapshot'];facts=snapshot['evidence']
    need(snapshot['status']=='FIXED_DURABLE_READONLY_SNAPSHOT_OBSERVED'
        and snapshot['transactionEnd']=='ROLLBACK' and facts['transactionReadOnly']is True
        and all(snapshot['cleanup'][k]is True for k in ('childReaped','cleanClusterAfterRead','descendantsAbsent'))
        and facts['rootOperation']=={'committedCount':0,'count':0,'hasBatchedMarker':False,'otherStatusCount':0}
        and facts['failedSubBatch']=={'committedCount':0,'receiptCount':0}
        and facts['namespace']==decision['observedNamespace']
        and facts['tableCounts']==decision['tableCounts']
        and facts['functionBodySha256']==decision['observedThreeBeforeBodyHashes']
        and list(facts['functionBodySha256'].values())==[r['beforeBodySha256']for r in ROUTINE_PINS]
        and decision['observedFunctionDefinitions']is None and decision['prosrcObservationIsNotDefinitionProof']is True,
        'SETTLEMENT24_EXACT_DURABLE_FACTS_REQUIRED')
    # Definitions/owner/all remaining pg_proc metadata are still checked live by
    # the retained native before observation; this receipt proves prosrc only.
    key='t45-r3-batched-real-execute-20261115-01'
    term=receipt(key,'00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35',
        'final33-writer-result.json','ad8746e056c391d9f9b7bd63728f53fecccb7a550c867cd47b0a443bfff70fb1',writer['result'])
    w=writer['result']
    need((term['status'],term['exitCode'])==('FAILED',2) and w['state']=='ROLLED_BACK'
        and w['nativeConnectionCleanup']=='CLOSED' and w['lifecycleConfirmed']is True
        and all(w['processCleanup'][k]is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty')),
        'SETTLEMENT24_CONSUMED_FAILED_WRITER_CLEANUP_REQUIRED')
    key='t45-r3-batched161-command-successor-20261116-01'
    term=receipt(key,'515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
        'batched161-command-update-result.json','a474d758af30d53a4154f90081066213df351a33cb1226f976d6231ed7fdb020',catalog['result'])
    before=catalog['result']
    need((term['status'],term['exitCode'])==('COMPLETED',0) and before['batchedCatalog']==BEFORE_CATALOG
        and before['commitAcknowledged']is True and before['commitOutcomeUnknown']is False
        and before['postCommitReadback']is True and before['connectionCleanup']=='CLOSED'
        and before['completionSha256']=='fe89ee20df99555feec98782c7542730a199a9edffeb9e43b2c4f98388aa2207',
        'SETTLEMENT24_HISTORICAL_COMMAND_CATALOG_REQUIRED')

def private_admin(h,a):
    key=APPLY_KEY
    raw=read(BASE/'jobs'/key/'r3-outer-terminal.json');t=json.loads(raw)
    need(sha(raw)==a['applyTerminalSha256'] and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
        and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED_INSTALL_ROLE_APPLY_REQUIRED')
    raw=read(BASE/'jobs'/key/'results/maintenance-auth-result.json');r=json.loads(raw)
    need(sha(raw)==a['applyResultSha256'] and json.loads(read(CONTROL/'jobs'/key/'results/maintenance-auth-result.json',owner=1000))==r
        and r['requestKey']==key and r['phase']=='apply'
        and r['result']['credentialValidUntilByRole'][ADMIN]==a['backupAdminValidUntil']
        and r['result']['runtimeAuthChanged'] is False and r['result']['membershipsOrRoleAttributesChanged'] is False
        and r['cleanup']['ownContainerStopped'] and r['cleanup']['ownedPidAbsent'],'BATCHED_INSTALL_FINITE_ADMIN_REQUIRED')
    p=Path(ADMIN_CONFIG)
    need(p.is_relative_to(HOST/'state/native-services') and p.name==ADMIN+'.json','SETTLEMENT24_FIXED_ADMIN_CUSTODY_REQUIRED')
    s=p.lstat();need((s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o400),'BATCHED_INSTALL_PRIVATE_CUSTODY_REQUIRED')
    cfg=json.loads(read(p));fixed={'host':'127.0.0.1','port':56791,'database':'erp_fresh35_20261110_r3','user':ADMIN,'ssl':False}
    need(set(cfg)==set(fixed)|{'password'} and all(cfg[k]==v for k,v in fixed.items()) and re.fullmatch('[a-f0-9]{64}',cfg['password']),
        'BATCHED_INSTALL_FIXED_ADMIN_REQUIRED')
    return cfg

def main():
    runtime_bound()
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
        and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB) and Path(__file__)==JOB/'bundle/batched161_command_update_host.py'
        and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'BATCHED_INSTALL_REGISTERED_ENTRY_REQUIRED')
    os.umask(0o077)
    def interrupted(*_):raise ValueError('BATCHED_INSTALL_INTERRUPTED')
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
    raw=read(JOB/'bundle/catalog-update-authorization.json');need(sha(raw)==sys.argv[1],'BATCHED_INSTALL_OUTER_HASH_REQUIRED')
    a=validate(json.loads(raw),now());need(a['sourceSha256']==sha(read(Path(__file__))),'BATCHED_INSTALL_SELF_DIFFERS')
    policy=json.loads(read(Path(POLICY)))
    need(Path(POLICY).parent==BASE/'r3-05-write-continuity','SETTLEMENT24_FIXED_POLICY_PARENT_REQUIRED')
    need(policy['grantId']==GRANT and policy['jobs']['catalog_update']['jobId']==KEY
        and policy['jobs']['catalog_update']['script']=='batched161_command_update_host.py'
        and policy['jobs']['catalog_update']['bundlePins']['batched161_command_update_host.py']==a['sourceSha256']
        and policy['startsAt']<=a['startsAt']<=now()<a['expiresAt']<=policy['expiresAt'],'BATCHED_INSTALL_REGISTERED_POLICY_REQUIRED')
    h=load('catalog_transport.py');ops=h.load('fresh35-production-carrier.py',PINS['fresh35-production-carrier.py'])
    support=h.load('normal05_retained_stop.py',PINS['normal05_retained_stop.py'])
    need(h.KEY==KEY and h.START==START and h.SERVICE_PROOF==SERVICE_PROOF,'SETTLEMENT24_EXACT_TRANSPORT_BINDINGS_REQUIRED')
    prior=installed(a)
    recovery_facts(a)
    proof,start_authority=h.current(ops,support,a)
    apply_key=APPLY_KEY
    apply_public=read(CONTROL/'jobs'/apply_key/'results/maintenance-auth-result.json',owner=1000)
    checked_start=read(HOST_STATE/'native-services'/START/'service-start-authorization.json')
    data=HOST_STATE/HOST.name/'data'
    need(data.resolve()==data and proof['dataDirectory']==prior['dataDirectory']==str(STATE/HOST.name/'data')
        and support.data_identity(data)==proof['dataDirectoryIdentity']==prior['dataDirectoryIdentity']==DATA
        and all(proof['physical'][k]==prior['physical'][k] for k in PHYSICAL)
        and proof['physical']['postmasterStart']>prior['physical']['postmasterStart']
        and proof['sharedPostgresNamespace']['container']['id']!=prior['sharedPostgresNamespace']['container']['id']
        and all(proof[k]==prior[k] for k in ('installationRecordSha256','targetSha256','sourceSetSha256'))
        and sha(checked_start)==proof['authorizationSha256'] and json.loads(checked_start)==start_authority
        and start_authority['applyRequestKey']==apply_key and start_authority['applyTerminalSha256']==a['applyTerminalSha256']
        and start_authority['applyResultSha256']==sha(apply_public),'DB05_COMMAND_CURRENT_APPLY_OR_PHYSICAL_DIFFERS')
    free=os.statvfs(data);need(free.f_bavail*free.f_frsize>28*1024**3,'DB05_COMMAND_RESERVE_REQUIRED')
    material=read(HOST/'state'/OPERATOR/'source-materialization.json');m=json.loads(material)
    need(sha(material)==a['operatorReadySha256'] and m['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'
        and sha(material)==ROOT08_MARKER_SHA256 and m['sourceFiles']==392
        and m['SQLUpgradePerformed']is False and m['importReady']is False
        and m['oldLineageProvesNewSQLInstalled']is False and m['sourceModelSha256']==AFTER_MODEL
        and m['sourceRowsSha256']==SOURCE_ROWS_SHA256 and m['sourceSetSha256']==SOURCE_SET_SHA256,'BATCHED_INSTALL_MATERIALIZATION_REQUIRED')
    pg=private_admin(h,a)
    root=HOST/'state/batched-command33-private';root.mkdir(mode=0o700,exist_ok=True)
    s=root.lstat();need(root.resolve()==root and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o700),'BATCHED_INSTALL_PRIVATE_PARENT_REQUIRED')
    projection=root/KEY;projection.mkdir(mode=0o700);(projection/'scratch').mkdir(mode=0o700)
    runner=read(JOB/'bundle/catalog-successor-run.mjs');need(sha(runner)==PINS['catalog-successor-run.mjs'],'BATCHED_INSTALL_RUNNER_DIFFERS')
    h.put(projection/'catalog-successor-run.mjs',runner,0o400)
    driver=read(JOB/'bundle/catalog-pg-driver.mjs');need(sha(driver)==PINS['catalog-pg-driver.mjs'],'DB05_COMMAND_DRIVER_DIFFERS')
    h.put(projection/'catalog-pg-driver.mjs',driver,0o400)
    h.put(projection/'catalog-update-authorization.json',raw,0o400)
    private=JOB/'native-private';private.mkdir(mode=0o700)
    leaf=HOST/'state/native-services'/START/'authority-61035'/INNER_LEAF
    need(Path(INNER_LEAF).name==INNER_LEAF,'SETTLEMENT24_FIXED_INNER_LEAF_REQUIRED')
    inner=base64.b64decode(a['innerAuthorityBase64'],validate=True)
    receipt=None;error=None;entered=False;inner_identity=None
    try:
        h.put(leaf,inner,0o400);inner_identity=h.identity(leaf.lstat())
        payload={k:a[k] for k in ('service','backupAdminValidUntil','installStartsAt','installExpiresAt')}
        payload.update(authority=a,postgres=pg)
        # The runner compares a canonical JSON hash; no secret is part of it.
        h.current(ops,support,a);entered=True
        receipt=h.child_run(proof,a,payload)
    except BaseException as problem:error=problem
    finally:
        pg.clear()
        reaped=not entered or receipt is not None and receipt.get('childReaped') and receipt.get('descendantsReaped')
        if inner_identity is not None and reaped:
            need(h.identity(leaf.lstat())==inner_identity and sha(read(leaf))==a['innerAuthoritySha256'],'BATCHED_INSTALL_OWN_INNER_CHANGED')
            leaf.unlink();h.sync(leaf.parent)
    result=(receipt or {}).get('result',{})
    matched=result.get('requestKey')==KEY and result.get('service')==a['service'] and result.get('programSha256')==a['upgradeDescriptor']['programSha256']
    public={'requestKey':KEY,'service':a['service'],'sourceSetSha256':SOURCE_SET_SHA256,
        'state':result.get('state','UNKNOWN') if matched else 'UNKNOWN','connectionCleanup':result.get('connectionCleanup','NOT_OPENED' if not entered else 'UNKNOWN'),
        'programSha256':a['upgradeDescriptor']['programSha256'],'nativeResultBindingMatched':matched,
        'childReaped':bool(reaped),'descendantsReaped':bool(reaped),'innerAuthorityRemoved':bool(inner_identity is not None and reaped),
        'automaticReplay':False,'businessImported':False,'formalBusinessAccepted':False}
    public.update(reviewedInputSha256=a['upgradeDescriptor']['reviewedInputSha256'],sqlSha256=a['upgradeDescriptor']['sqlSha256'])
    for k in ('captureDirectoryLeaf','sqlstate','safeCode','completionSha256','commitAcknowledged','commitOutcomeUnknown',
              'rollbackAcknowledged','postCommitReadback','roleRestoreAcknowledged','beforeCatalogSha256',
              'catalogSha256','routineAttributesSha256','batchedCatalog'):
        if k in result:public[k]=result[k]
    if error:public['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'BATCHED_INSTALL_HOST_UNCONFIRMED'
    h.put(JOB/'results/batched161-command-update-result.json',encode(public))
    return 0 if (error is None and matched and receipt.get('exitCode')==0 and receipt.get('lifecycleConfirmed') and reaped
        and public['state']=='SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK' and public['connectionCleanup']=='CLOSED'
        and all(public.get(k) is True for k in ('commitAcknowledged','postCommitReadback','roleRestoreAcknowledged','innerAuthorityRemoved'))
        and public.get('commitOutcomeUnknown') is False
        and public.get('batchedCatalog')==a['upgradeDescriptor']['batchedCatalog']
        and public.get('captureDirectoryLeaf')=='settlement24-three-routine-'+public['programSha256']
        and all(re.fullmatch('[a-f0-9]{64}',public.get(k,'')) for k in ('completionSha256','beforeCatalogSha256','catalogSha256','routineAttributesSha256'))) else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        if JOB is not None and os.path.isdir(JOB/'results'):
            safe=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'BATCHED_INSTALL_ROOT_PREFLIGHT_UNCONFIRMED'
            p=JOB/'results/batched161-command-update-incomplete.json'
            with p.open('x') as f:json.dump({'requestKey':KEY,'state':'UNKNOWN','safeCode':safe,'automaticReplay':False},f)
        raise SystemExit(2)
