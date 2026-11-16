"""Finite exact DB05 install consumer on the retained ordinary33 service."""
from pathlib import Path
from types import ModuleType
import base64,hashlib,json,os,re,signal,stat,sys,time

KEY='t45-r3-batched161-command-successor-20261116-01'
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)
JOB=BASE/'jobs'/KEY
CONTROL=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
START='t45-first-r3-native-service-start-20261116-33'
ADMIN='erp35_admin_20261110_r3'
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
REVIEWED_INPUT_SHA256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7'
OPERATOR='installed-real-operation-batched-root06-20261116-01'
SOURCE_SET_SHA256='ed5176dd3f56b39c044aa9058e320acec2ac676221ae641cdd0625892a4e9a18'
SOURCE_ROWS_SHA256='150b8b85afb3d14572e66fa21969789c1c1994c079ae39e8f1c3b5232a2657f4'
PINS={'normal05_retained_stop.py': '0fd199cf22397f23ddb4e3c3590f63154b67358190530c5cadda76db257ddf28', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'catalog-successor-run.mjs': 'dff38300b814c5223944c55a331b3d53cdebcd303dea474a2f72d0946420b2af', 'catalog_transport.py': '15c33ed77afd8339475f7b62a36c9f5454e16d7e84f20c4a15405343ab051be5', 'catalog-pg-driver.mjs': 'cdfb4fdeb6919364c5795c1e2ccb6f58650337b0b7bc59aa71d102b3e9a1a87f'}

def need(v,c):
    if not v:raise ValueError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def now():return time.time_ns()//1000000
def encode(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def scope():
    return dict(format='T45_R3_BATCHED161_COMMAND_SUCCESSOR_HOST_V1',requestKey=KEY,
        decision='UPDATE_EXACT_DB05_SIX_ARG_COMMAND_ONLY',database='erp_fresh35_20261110_r3',
        sourceSetSha256=SOURCE_SET_SHA256,sourceRowsSha256=SOURCE_ROWS_SHA256,
        maximumChildSeconds=700,businessImported=False,automaticReplay=False)
def validate(a,at):
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
    need(type(d) is dict and d['format']=='FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1'
        and d['sourceSetSha256']==SOURCE_SET_SHA256 and d['currentServiceSha256']==s['proofSha256']
        and d['postmasterStart']==s['postmasterStart'] and d['startsAt']==a['installStartsAt'] and d['expiresAt']==a['installExpiresAt']
        and d['requestKey']==KEY and d['backupAdminValidUntil']==a['backupAdminValidUntil']
        and d['reviewedInputSha256']==REVIEWED_INPUT_SHA256
        and d['functionIdentity']=='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)'
        and d['installedBatchedCatalog']==a['batchedCatalog']
        and d['predecessorBatchedCatalog']['modelSha256']==a['batchedCatalog']['modelSha256']
        and d['batchedCatalog']['modelSha256']!=a['batchedCatalog']['modelSha256'],
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
 for index,step in enumerate(program['steps'],1):
  ack=dict(order=index,name=step['name'],sqlSha256=step['sha256'],commitAcknowledged=True)
  need(json.loads(read(capture/f'commit-{index:02}.json'))==ack==done['commits'][index-1],
   'BATCHED24_INSTALL_LAYER_ACK_REQUIRED')
 catalog=read(capture/'catalog-161.json',16*1024*1024)
 need(catalog.endswith(b'\n') and sha(catalog[:-1])==INSTALL_CATALOG_SHA,
  'BATCHED24_INSTALLED_161_CAPTURE_REQUIRED')
 return old

def private_admin(h,a):
    key='t45-r3-ordinary33-auth-apply-20261116-01'
    raw=read(BASE/'jobs'/key/'r3-outer-terminal.json');t=json.loads(raw)
    need(sha(raw)==a['applyTerminalSha256'] and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
        and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED_INSTALL_ROLE_APPLY_REQUIRED')
    raw=read(BASE/'jobs'/key/'results/maintenance-auth-result.json');r=json.loads(raw)
    need(sha(raw)==a['applyResultSha256'] and json.loads(read(CONTROL/'jobs'/key/'results/maintenance-auth-result.json',owner=1000))==r
        and r['requestKey']==key and r['phase']=='apply'
        and r['result']['credentialValidUntilByRole'][ADMIN]==a['backupAdminValidUntil']
        and r['result']['runtimeAuthChanged'] is False and r['result']['membershipsOrRoleAttributesChanged'] is False
        and r['cleanup']['ownContainerStopped'] and r['cleanup']['ownedPidAbsent'],'BATCHED_INSTALL_FINITE_ADMIN_REQUIRED')
    p=HOST/'state/native-services/ordinary33-auth-20261116-01'/(ADMIN+'.json')
    s=p.lstat();need((s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o400),'BATCHED_INSTALL_PRIVATE_CUSTODY_REQUIRED')
    cfg=json.loads(read(p));fixed={'host':'127.0.0.1','port':56791,'database':'erp_fresh35_20261110_r3','user':ADMIN,'ssl':False}
    need(set(cfg)==set(fixed)|{'password'} and all(cfg[k]==v for k,v in fixed.items()) and re.fullmatch('[a-f0-9]{64}',cfg['password']),
        'BATCHED_INSTALL_FIXED_ADMIN_REQUIRED')
    return cfg

def main():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
        and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB) and Path(__file__)==JOB/'bundle/batched161_command_update_host.py'
        and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'BATCHED_INSTALL_REGISTERED_ENTRY_REQUIRED')
    os.umask(0o077)
    def interrupted(*_):raise ValueError('BATCHED_INSTALL_INTERRUPTED')
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
    raw=read(JOB/'bundle/catalog-update-authorization.json');need(sha(raw)==sys.argv[1],'BATCHED_INSTALL_OUTER_HASH_REQUIRED')
    a=validate(json.loads(raw),now());need(a['sourceSha256']==sha(read(Path(__file__))),'BATCHED_INSTALL_SELF_DIFFERS')
    policy=json.loads(read(BASE/'r3-05-write-continuity/direct33-batched-real.json'))
    need(policy['grantId']==GRANT and policy['jobs']['catalog_update']['jobId']==KEY
        and policy['jobs']['catalog_update']['script']=='batched161_command_update_host.py'
        and policy['jobs']['catalog_update']['bundlePins']['batched161_command_update_host.py']==a['sourceSha256']
        and policy['startsAt']<=a['startsAt']<=now()<a['expiresAt']<=policy['expiresAt'],'BATCHED_INSTALL_REGISTERED_POLICY_REQUIRED')
    h=load('catalog_transport.py');ops=h.load('fresh35-production-carrier.py',PINS['fresh35-production-carrier.py'])
    support=h.load('normal05_retained_stop.py',PINS['normal05_retained_stop.py'])
    prior=installed(a)
    proof,start_authority=h.current(ops,support,a)
    apply_key='t45-r3-ordinary33-auth-apply-20261116-01'
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
    writer='t45-r3-batched-real-execute-20261115-01'
    for grant in (GRANT,'5cc58239751e4e2a'):
        c=CONTROL.with_name('grant-'+grant);w=BASE.with_name('grant-'+grant)
        need(not any(os.path.lexists(p) for p in (c/'requests'/(writer+'.json'),c/'requests'/(writer+'.tmp'),
            c/'jobs'/writer,c/'results'/(writer+'.json'),w/'jobs'/writer)),'DB05_COMMAND_WRITER_ALREADY_PRESENT')
    free=os.statvfs(data);need(free.f_bavail*free.f_frsize>28*1024**3,'DB05_COMMAND_RESERVE_REQUIRED')
    material=read(HOST/'state'/OPERATOR/'source-materialization.json');m=json.loads(material)
    need(sha(material)==a['operatorReadySha256'] and m['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
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
    leaf=HOST/'state/native-services'/START/'authority-61035/fresh35-batched161-command-successor-v1.json'
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
        and public['state']=='DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK' and public['connectionCleanup']=='CLOSED'
        and all(public.get(k) is True for k in ('commitAcknowledged','postCommitReadback','roleRestoreAcknowledged','innerAuthorityRemoved'))
        and public.get('commitOutcomeUnknown') is False
        and public.get('batchedCatalog')==a['upgradeDescriptor']['batchedCatalog']
        and public.get('captureDirectoryLeaf')=='batched161-command-'+public['programSha256']
        and all(re.fullmatch('[a-f0-9]{64}',public.get(k,'')) for k in ('completionSha256','beforeCatalogSha256','catalogSha256','routineAttributesSha256'))) else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        if os.path.isdir(JOB/'results'):
            safe=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'BATCHED_INSTALL_ROOT_PREFLIGHT_UNCONFIRMED'
            p=JOB/'results/batched161-command-update-incomplete.json'
            with p.open('x') as f:json.dump({'requestKey':KEY,'state':'UNKNOWN','safeCode':safe,'automaticReplay':False},f)
        raise SystemExit(2)
