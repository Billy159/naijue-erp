"""Single SOURCE registration using the original shared lock/publish CAS protocol."""
from pathlib import Path
from types import ModuleType
import base64,fcntl,hashlib,json,os,re,socket,stat,subprocess,sys,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
ENTRY=B/'root07-source-registration-20261117-01/register_cas.py'
AUDIT=B/'root07-source-registration-cas-20261117-01'
NEW_MODULE=P/'r3_root07_source_admission.py'
NEW_POLICY=H/'root07-source-only-20261117-01.json'
PENDING=P/'.root07-source-dispatcher.pending'
OLD_DISPATCHER='e46f75794d7e151b0fba870c3b33786dacb54585e0476736db432fa8e60b4f8c'
STATIC={'actualRootPins': {'dispatcher': 'e46f75794d7e151b0fba870c3b33786dacb54585e0476736db432fa8e60b4f8c', 'helper': '3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d', 'policy': '51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e'}, 'authority': None, 'basis': {'/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/results/final33-prepare-result.json': '111dd7b6c011ae7cd85326df4ce7efd986ec336a3062ff72e2cbd68fa0a38df6', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/results/maintenance-auth-result.json': '28ea93fa6f66b93479fe7d0696a1d167dd6344bb18737e0cb6f1df83846069be', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '25242a3faa21121b89378436a36e1a36105a313f65542b0c6b857eee6fb39d8d', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-final33-plan-prepare-20261116-04.json': '96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary38-auth-restore-20261116-01.json': 'f6c2773391ac2aa1c3c76181905b310517d736d933bdf7c6b55678c132e60747', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary38-preserve-stop-20261116-01.json': '2f87bec15310fd9b6d0f28a8084e54ee4b926681c7d2dee07e0473ab51411dec', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/r3-outer-terminal.json': '96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/results/final33-prepare-result.json': '81d92aadb2f8b298660924b11fddbf8b074609f36d70e767860ef967f5f93bfa', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/r3-outer-terminal.json': 'f6c2773391ac2aa1c3c76181905b310517d736d933bdf7c6b55678c132e60747', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/results/maintenance-auth-result.json': '83c86cc684d3fbe63c752b73bdfa42cc4046145f5ea754baa10561ca1fd2486f', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/r3-outer-terminal.json': '2f87bec15310fd9b6d0f28a8084e54ee4b926681c7d2dee07e0473ab51411dec', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '2815ba3c28d758f273cef7cff94bdcf1ff5bb4c95fa3bcf64f6f14c8493a6b55', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct38-batched-real.json': '51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-38.json': 'a9e740c7dff329838f8fd82572d90353378c6e8b3fb1a3c29ac1fdd2362837e3', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': 'e46f75794d7e151b0fba870c3b33786dacb54585e0476736db432fa8e60b4f8c', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct38_aux_prepare.py': '3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d'}, 'failedPrepare': {'nativeConnectionCleanup': 'UNKNOWN', 'state': 'UNKNOWN'}, 'format': 'D1_ROOT07_SOURCE_ADMISSION_STATIC_INPUTS_V1', 'freshStoppedBasis': None, 'privateCustodyStatOnly': {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/applied.json': {'bytes': 493, 'device': 66304, 'gid': 0, 'inode': 13666453, 'mode': 256, 'uid': 0}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/finite-auth.json': {'bytes': 2549, 'device': 66304, 'gid': 0, 'inode': 13666450, 'mode': 256, 'uid': 0}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/original-auth.json': {'bytes': 2533, 'device': 66304, 'gid': 0, 'inode': 13666447, 'mode': 256, 'uid': 0}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restore-attempt.json': {'bytes': 114, 'device': 66304, 'gid': 0, 'inode': 13666510, 'mode': 256, 'uid': 0}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restored.json': {'bytes': 466, 'device': 66304, 'gid': 0, 'inode': 13666512, 'mode': 256, 'uid': 0}}, 'restoreSafeValue': {'automaticReplay': False, 'databaseStillStopped': True, 'exactOriginalVerifierAndExpiryVerifiedPrivately': True, 'membershipsOrRoleAttributesChanged': False, 'naturalExpiryCountedAsRestoration': False, 'privateRecoveryBasisRetained': True, 'requestKey': 't45-r3-ordinary38-auth-restore-20261116-01', 'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'], 'runtimeAuthChanged': False, 'status': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'}, 'restoredReceiptReportedSha256': 'ce98579474ee7adfff5a521f59d0e6e91e54eb964770f758a1dc695eb36c0f15', 'rule': {'authorityLeaf': 'materialize-authorization.json', 'bundlePins': {'batched161-run.mjs': '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4', 'fresh35-host-session.mjs': '36f5e49c10a4e7541ed6a77cc377030b7ff343b7bd462ab2001a41040488d368', 'materialize-batched-source.py': '666adbbb3143aeccf88289cbd15277f806e2d9c5bc73ae3e9b2cbc34c7afb40a', 'source-description.json': 'c0b18a897fa32f956f0c8d2950b2631c3be1a8debb517fc53f67097e84d3f7b9', 'source-rows.json': '74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e'}, 'deadlineField': 'expiresAt', 'jobId': 't45-r3-batched-root07-source-delta-20261117-01', 'script': 'materialize-batched-source.py', 'timeoutSeconds': 300}, 'service': {'containerId': '4a2be3fca19bf1f46151c0271d5a0cb2cd10b280cd43c483e93d478be85f18d2', 'containerStartedAt': '2026-11-17T02:16:22.168473079Z', 'postmasterStart': '2026-11-17 02:16:23.493239+00', 'proofSha256': 'a9e740c7dff329838f8fd82572d90353378c6e8b3fb1a3c29ac1fdd2362837e3', 'serviceKey': 't45-first-r3-native-service-start-20261116-38'}, 'sourceReview': None, 'stop': {'businessAdvanced': False, 'checkedAtUTC': '2026-11-17T02:34:04.915478+00:00', 'cleanupSha256': '35f2d4075a0726d07a7d8a69d45e789f0b21f02aaae5bdf6666492359e921b69', 'currentBatchTerminals': {'t45-r3-batched-install-20261116-02': {'state': 'COMPLETED', 'terminalSha256': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2'}, 't45-r3-batched-real-execute-20261115-01': {'state': 'NOT_SUBMITTED'}, 't45-r3-batched161-command-successor-20261116-01': {'state': 'COMPLETED', 'terminalSha256': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb'}, 't45-r3-final33-plan-prepare-20261116-04': {'state': 'FAILED', 'terminalSha256': '96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c'}}, 'holdRetained': True, 'originalKeyReplayed': False, 'pgStopped': True, 'preserveMode': 'ACTIVE_HOLD', 'requestKey': 't45-r3-ordinary38-preserve-stop-20261116-01', 'service': {'containerId': '4a2be3fca19bf1f46151c0271d5a0cb2cd10b280cd43c483e93d478be85f18d2', 'containerStartedAt': '2026-11-17T02:16:22.168473079Z', 'postmasterStart': '2026-11-17 02:16:23.493239+00', 'proofSha256': 'a9e740c7dff329838f8fd82572d90353378c6e8b3fb1a3c29ac1fdd2362837e3', 'serviceKey': 't45-first-r3-native-service-start-20261116-38'}, 'status': 'NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED', 'writerTerminalSha256': 'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e', 'writerTerminalStatus': 'FAILED'}}

def need(ok, code):
    if not ok:
        raise ValueError('NORMAL34_REGISTRATION_' + code)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return time.time_ns() // 1000000

def pack(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()

def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]

def read(path, owner=0):
    need(path.resolve() == path, 'CANONICAL_INPUT_REQUIRED')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        s = os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid == owner and (s.st_nlink == 1) and (not s.st_mode & 18) and (0 < s.st_size <= 4 * 1024 ** 2), 'PROTECTED_INPUT_REQUIRED')
        raw = f.read(4 * 1024 ** 2 + 1)
        need(len(raw) == s.st_size and identity(s) == identity(os.fstat(f.fileno())) == identity(path.lstat()), 'INPUT_CHANGED')
    return (raw, identity(s))

def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def put(path, raw, mode=384):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 384), 'wb') as stream:
        need(stream.write(raw) == len(raw), 'SHORT_WRITE')
        stream.flush()
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())
    sync(path.parent)

MODULE_SHA256 = '76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080'
TEMPLATE_SHA256 = 'd7bac1fce532896704a32e1c51048106afaecfa8da85b1f4975a32faee51596c'

def scope():
    return dict(format='T45_ROOT07_SOURCE_ONLY_REGISTRATION_CAS_V1',grantId='b16447fbc81f4d64',oldRootPins=STATIC['actualRootPins'],newModuleSha256=MODULE_SHA256,dispatcherTemplateSha256=TEMPLATE_SHA256,newModulePath=str(NEW_MODULE),newPolicyPath=str(NEW_POLICY),sourceJobKey=STATIC['rule']['jobId'],publishOrder=['module','policy','dispatcher'],sourceRegistrationOnly=True,businessDatabaseWrites=0,normalPolicyChanged=False)

def render(files):
    need(set(files)=={'module','policy','dispatcherTemplate'} and sha(files['module'])==MODULE_SHA256 and sha(files['dispatcherTemplate'])==TEMPLATE_SHA256,'EXACT_SOURCE_FILES_REQUIRED')
    p=json.loads(files['policy'])
    need(p['format']=='T45_ROOT07_SOURCE_ONLY_ADMISSION_V1'and p['rule']==STATIC['rule']and p['baselineRootPins']==STATIC['actualRootPins'],'EXACT_SOURCE_POLICY_REQUIRED')
    needle=b'ROOT07_SOURCE_POLICY_SHA256 = None'
    need(files['dispatcherTemplate'].count(needle)==1,'EXACT_PROFILE_PLACEHOLDER_REQUIRED')
    result=files['dispatcherTemplate'].replace(needle,('ROOT07_SOURCE_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
    need(len(result)<=131072 and len(files['module'])<=131072,'ORIGINAL_SOURCE_CAP_REQUIRED')
    compile(result,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
    return result

def snapshot(a,dispatcher=OLD_DISPATCHER):
    need(set(a['oldIdentities'])==set(STATIC['basis'])|set(STATIC['privateCustodyStatOnly'])|{'executionLock'},'EXACT_IDENTITY_SET_REQUIRED')
    for name in STATIC['privateCustodyStatOnly']:
        need(identity(Path(name).lstat())==a['oldIdentities'][name],'PRIVATE_CUSTODY_STAT_CHANGED')
    for name,pin in STATIC['basis'].items():
        raw,meta=read(Path(name),1000 if name.startswith(str(C)+'/')else 0)
        changed=name==str(P/'admin_exec.py')and dispatcher!=OLD_DISPATCHER
        need(sha(raw)==(dispatcher if name==str(P/'admin_exec.py')else pin)and(changed or meta==a['oldIdentities'][name]),'ORIGINAL_BASIS_CHANGED')

def consumer(dispatcher,cfg,module_raw,policy_raw):
    wrapper=ModuleType('root07_source_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
    core,prior=wrapper.r3_continuity(cfg)
    need(prior.policy_sha256==STATIC['actualRootPins']['policy'],'EXACT_NORMAL38_POLICY_REQUIRED')
    module=ModuleType('root07_source_admission');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
    original=core.read
    core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
    try:
        hold=module.Root07SourceAdmission(core,prior,cfg,sha(policy_raw));hold.stopped_basis()
    finally:core.read=original
    return core,hold

def quiet():
    key=STATIC['rule']['jobId'];writer='t45-r3-batched-real-execute-20261115-01'
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_AUTHORITY_PRESENT')
    need(not os.path.lexists(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01')),'ROOT07_OUTPUT_ALREADY_PRESENT_READ_ORIGINAL')
    for grant in ('b16447fbc81f4d64','5cc58239751e4e2a'):
        worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
        for name in (key,writer):
            need(not any(os.path.lexists(path)for path in (worker/'jobs'/name,control/'jobs'/name,control/'requests'/(name+'.json'),control/'requests'/(name+'.tmp'),control/'results'/(name+'.json'))),'SOURCE_OR_WRITER_KEY_PRESENT_NO_REPLAY')
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')

def decode(packet,expected):
    need(set(packet)=={'authorization','files'},'EXACT_PACKET_REQUIRED')
    raw=base64.b64decode(packet['authorization'],validate=True);need(sha(raw)==expected,'EXACT_EXTERNAL_AUTHORITY_REQUIRED');a=json.loads(raw)
    fixed=scope();variables={'sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','authorizationReference','independentReviewSha256'}
    need(set(a)==set(fixed)|variables and all(a[k]==v for k,v in fixed.items())and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_SOURCE_REGISTRATION_AUTHORITY_REQUIRED')
    need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+900000,'FINITE_REGISTRATION_WINDOW_REQUIRED')
    need(type(a['independentReviewSha256'])is str and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256'])and type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512,'EXACT_REVIEW_REFERENCE_REQUIRED')
    files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
    need(set(files)==set(a['sourcePins'])=={'module','policy','dispatcherTemplate'}and all(0<len(v)<=131072 and sha(v)==a['sourcePins'][k]for k,v in files.items()),'EXACT_SOURCE_PACKET_REQUIRED')
    render(files);return a,files,raw

def register(a,files,authority):
    need(os.geteuid()==0 and socket.gethostname()=='naijue-server'and Path(__file__)==ENTRY,'EXACT_ROOT_ENTRY_REQUIRED')
    need(not any(os.path.lexists(path)for path in (AUDIT,NEW_MODULE,NEW_POLICY,PENDING)),'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
    for folder in (B,P,H,LOCK.parent):
        for path in [*reversed(folder.parents),folder]:
            s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&18,'PROTECTED_DIRECTORY_REQUIRED')
    with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
        need(identity(os.fstat(lock.fileno()))==a['oldIdentities']['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);snapshot(a);quiet()
        old=read(P/'admin_exec.py')[0];cfg=json.loads(read(P/'grant.json')[0]);new=render(files)
        need(json.loads(files['policy'])['startsAt']==a['startsAt']and now()+330000<json.loads(files['policy'])['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FULL_SOURCE_WINDOW_REQUIRED')
        consumer(old,cfg,files['module'],files['policy'])
        AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
        put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',old)
        put(AUDIT/'old-normal-policy.bin',read(H/'direct38-batched-real.json')[0]);put(AUDIT/'old-identities.json',pack(a['oldIdentities']))
        result=dict(status='REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY',published=[],automaticReplay=False,businessDatabaseWrites=0)
        try:
            put(NEW_MODULE,files['module'],0o644);result['published'].append('module');snapshot(a);quiet()
            put(NEW_POLICY,files['policy']);result['published'].append('policy');consumer(new,cfg,files['module'],files['policy'])
            put(PENDING,new,0o755);snapshot(a);quiet();need(now()+30000<a['expiresAt'],'REGISTRATION_EXPIRED_BEFORE_CAS')
            put(AUDIT/'publish-intent.json',pack(dict(oldDispatcherSha256=OLD_DISPATCHER,dispatcherSha256=sha(new),moduleSha256=MODULE_SHA256,policySha256=sha(files['policy']))))
            os.replace(PENDING,P/'admin_exec.py');sync(P);result['published'].append('dispatcher')
            snapshot(a,sha(new));quiet();consumer(read(P/'admin_exec.py')[0],cfg,files['module'],files['policy'])
            need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_ROOT07_SOURCE_ONLY_REGISTERED_NO_JOB_SUBMITTED',dispatcherSha256=sha(new),moduleSha256=MODULE_SHA256,policySha256=sha(files['policy']),normalPolicyUnchanged=True,originalLockPreserved=True,phaseSubmitted=False)
        except BaseException as error:
            result['exceptionClass']=type(error).__name__
            try:result['observedDispatcherSha256']=sha(read(P/'admin_exec.py')[0])
            except Exception:result['observedDispatcherSha256']=None
        put(AUDIT/'result.json',pack(result));return result

if __name__=='__main__':
    need(len(sys.argv)==2 and Path(__file__)==ENTRY,'EXACT_ENTRY_REQUIRED')
    a,files,authority=decode(json.load(sys.stdin),sys.argv[1]);result=register(a,files,authority)
    print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_ROOT07_SOURCE_ONLY_REGISTERED_NO_JOB_SUBMITTED'else 2)
