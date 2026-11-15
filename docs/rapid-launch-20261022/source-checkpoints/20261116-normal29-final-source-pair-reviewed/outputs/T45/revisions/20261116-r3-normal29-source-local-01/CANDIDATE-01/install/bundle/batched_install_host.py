"""Finite exact DB05 install consumer on the retained ordinary24 service."""
from pathlib import Path
from types import ModuleType
import base64,hashlib,json,os,re,signal,stat,sys,time

KEY='t45-r3-batched-install-20261115-01'
GRANT='b16447fbc81f4d64'
BASE=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)
JOB=BASE/'jobs'/KEY
CONTROL=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+GRANT)
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
START='t45-first-r3-native-service-start-20261116-29'
ADMIN='erp35_admin_20261110_r3'
STATE=Path('/var/lib/naijue-erp/fresh35-production')
OPERATOR='installed-real-operation-batched-root03-20261116-01'
SOURCE_SET_SHA256='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e'
SOURCE_ROWS_SHA256='399d3ac7ce1e7d903ba37b7243ea3c9d694712d9cb8f9fec06137125d7c89109'
PINS={'normal05_retained_stop.py': 'c7ee82062402fb7bd48f902d224d9365bb69016a4476f18a7c1f42d89fc67b9a', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'batched161-run.mjs': '8dedecf39f0edc4591e4305a32f6d1866783d3e12db3c6b2ef972e9d6d54d1da', 'private_transport.py': '0be320fb8dc269f048f0fb9cbfda741a2663fdb7b3582399cfd3039d38e9b007'}

def need(v,c):
    if not v:raise ValueError(c)
def sha(v):return hashlib.sha256(v).hexdigest()
def now():return time.time_ns()//1000000
def encode(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def scope():
    return dict(format='T45_R3_BATCHED161_INSTALL_HOST_V1',requestKey=KEY,
        decision='INSTALL_EXACT_ACCEPTED_154_TO161_CATALOG_ONLY',database='erp_fresh35_20261110_r3',
        sourceSetSha256=SOURCE_SET_SHA256,sourceRowsSha256=SOURCE_ROWS_SHA256,
        maximumChildSeconds=700,businessImported=False,automaticReplay=False)
def validate(a,at):
    fixed=scope()
    variable={'service','startsAt','expiresAt','authorizationReference','independentReviewSha256','sourceSha256',
        'operatorReadySha256','startTerminalSha256','startResultSha256','lockCapacitySettingsSha256',
        'applyTerminalSha256','applyResultSha256','upgradeDescriptor','innerAuthoritySha256','innerAuthorityBase64',
        'backupAdminValidUntil','installStartsAt','installExpiresAt'}
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
    need(type(d) is dict and d['format']=='FRESH35_BATCHED161_UPGRADE_PROGRAM_V1'
        and d['sourceSetSha256']==SOURCE_SET_SHA256 and d['currentServiceSha256']==s['proofSha256']
        and d['postmasterStart']==s['postmasterStart'] and d['startsAt']==a['installStartsAt'] and d['expiresAt']==a['installExpiresAt']
        and d['backupAdminValidUntil']==a['backupAdminValidUntil'] and d['dbCandidatePinsSha256']=='dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9'
        and len(d['steps'])==13 and d['steps'][-1]['sha256']=='332c0b6b18a434054ba845ff74e386038f31f6347f862835d8e6aeacf3971cd3',
        'BATCHED_INSTALL_EXACT_PROGRAM_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'BATCHED_INSTALL_REFERENCE_REQUIRED')
    inner=base64.b64decode(a['innerAuthorityBase64'],validate=True)
    need(0<len(inner)<=65536 and sha(inner)==a['innerAuthoritySha256'],'BATCHED_INSTALL_INNER_BYTES_REQUIRED')
    v=json.loads(inner)
    need(set(v)=={'format','decision','programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'}
        and v['format']=='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1'
        and v['decision']=='AUTHORIZE_EXACT_154_TO161_CATALOG_UPGRADE_ONLY'
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

def private_admin(h,a):
    key='t45-r3-ordinary29-auth-apply-20261116-01'
    raw=read(BASE/'jobs'/key/'r3-outer-terminal.json');t=json.loads(raw)
    need(sha(raw)==a['applyTerminalSha256'] and raw==read(CONTROL/'results'/(key+'.json'),owner=1000)
        and (t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'BATCHED_INSTALL_ROLE_APPLY_REQUIRED')
    raw=read(BASE/'jobs'/key/'results/maintenance-auth-result.json');r=json.loads(raw)
    need(sha(raw)==a['applyResultSha256'] and r['requestKey']==key and r['phase']=='apply'
        and r['result']['credentialValidUntilByRole'][ADMIN]==a['backupAdminValidUntil']
        and r['result']['runtimeAuthChanged'] is False and r['result']['membershipsOrRoleAttributesChanged'] is False
        and r['cleanup']['ownContainerStopped'] and r['cleanup']['ownedPidAbsent'],'BATCHED_INSTALL_FINITE_ADMIN_REQUIRED')
    p=HOST/'state/native-services/ordinary29-auth-20261116-01'/(ADMIN+'.json')
    s=p.lstat();need((s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o400),'BATCHED_INSTALL_PRIVATE_CUSTODY_REQUIRED')
    cfg=json.loads(read(p));fixed={'host':'127.0.0.1','port':56791,'database':'erp_fresh35_20261110_r3','user':ADMIN,'ssl':False}
    need(set(cfg)==set(fixed)|{'password'} and all(cfg[k]==v for k,v in fixed.items()) and re.fullmatch('[a-f0-9]{64}',cfg['password']),
        'BATCHED_INSTALL_FIXED_ADMIN_REQUIRED')
    return cfg

def main():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45'
        and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB) and Path(__file__)==JOB/'bundle/batched_install_host.py'
        and len(sys.argv)==2 and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'BATCHED_INSTALL_REGISTERED_ENTRY_REQUIRED')
    os.umask(0o077)
    def interrupted(*_):raise ValueError('BATCHED_INSTALL_INTERRUPTED')
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
    raw=read(JOB/'bundle/install-authorization.json');need(sha(raw)==sys.argv[1],'BATCHED_INSTALL_OUTER_HASH_REQUIRED')
    a=validate(json.loads(raw),now());need(a['sourceSha256']==sha(read(Path(__file__))),'BATCHED_INSTALL_SELF_DIFFERS')
    policy=json.loads(read(BASE/'r3-05-write-continuity/direct29-batched-real.json'))
    need(policy['grantId']==GRANT and policy['jobs']['install']['jobId']==KEY
        and policy['jobs']['install']['script']=='batched_install_host.py'
        and policy['jobs']['install']['bundlePins']['batched_install_host.py']==a['sourceSha256']
        and policy['startsAt']<=a['startsAt']<=now()<a['expiresAt']<=policy['expiresAt'],'BATCHED_INSTALL_REGISTERED_POLICY_REQUIRED')
    h=load('private_transport.py');ops=h.load('fresh35-production-carrier.py',PINS['fresh35-production-carrier.py'])
    support=h.load('normal05_retained_stop.py',PINS['normal05_retained_stop.py'])
    proof,_=h.current(ops,support,a)
    material=read(HOST/'state'/OPERATOR/'source-materialization.json');m=json.loads(material)
    need(sha(material)==a['operatorReadySha256'] and m['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
        and m['sourceRowsSha256']==SOURCE_ROWS_SHA256,'BATCHED_INSTALL_MATERIALIZATION_REQUIRED')
    pg=private_admin(h,a)
    root=HOST/'state/batched-install29-private';root.mkdir(mode=0o700,exist_ok=True)
    s=root.lstat();need(root.resolve()==root and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(0,0,0o700),'BATCHED_INSTALL_PRIVATE_PARENT_REQUIRED')
    projection=root/KEY;projection.mkdir(mode=0o700);(projection/'scratch').mkdir(mode=0o700)
    runner=read(JOB/'bundle/batched161-run.mjs');need(sha(runner)==PINS['batched161-run.mjs'],'BATCHED_INSTALL_RUNNER_DIFFERS')
    h.put(projection/'batched161-run.mjs',runner,0o400)
    h.put(projection/'install-authorization.json',raw,0o400)
    private=JOB/'native-private';private.mkdir(mode=0o700)
    leaf=HOST/'state/native-services'/START/'authority-61035/fresh35-batched161-upgrade-v1.json'
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
    for k in ('sqlstate','safeCode','upgradeFailure','completionSha256','acknowledgedLayers','connectionIdentity','roleRestoreAcknowledged',
              'successorCatalogSpecSha256','successorModelSha256','catalogSha256','batchedCatalog'):
        if k in result:public[k]=result[k]
    if error:public['safeCode']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'BATCHED_INSTALL_HOST_UNCONFIRMED'
    h.put(JOB/'results/batched-install-result.json',encode(public))
    return 0 if (error is None and matched and receipt.get('exitCode')==0 and receipt.get('lifecycleConfirmed') and reaped
        and public['state']=='DB05_CATALOG_INSTALLED_AND_CAPTURED' and public['connectionCleanup']=='CLOSED'
        and public.get('roleRestoreAcknowledged') is True) else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        if os.path.isdir(JOB/'results'):
            safe=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(error)) else 'BATCHED_INSTALL_ROOT_PREFLIGHT_UNCONFIRMED'
            p=JOB/'results/batched-install-incomplete.json'
            with p.open('x') as f:json.dump({'requestKey':KEY,'state':'UNKNOWN','safeCode':safe,'automaticReplay':False},f)
        raise SystemExit(2)
