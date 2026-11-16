"""Single-use live35 policy CAS. No database connection, credential change or job submit."""
from pathlib import Path
from types import ModuleType
import base64, fcntl, hashlib, json, os, re, socket, stat, subprocess, sys, time

GRANT='b16447fbc81f4d64'
B=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
P=Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT)
C=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
H=B/'r3-05-write-continuity'
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
POLICY=H/'direct35-batched-real.json'
DISPATCHER=P/'admin_exec.py'
AUDIT=B/'r3-normal35-live-spec-cas-20261117-01'
STAGE=B/'r3-normal35-live-spec-source-20261117-01'
PENDING=P/'.normal35-live-spec-dispatcher.pending'
POLICY_PENDING=H/'.normal35-live-spec-policy.pending'
OLD_DISPATCHER='34e31910f3417e88865b41938bb692245332e0b3f3fb7a6ca148d10973ba4f37'
OLD_POLICY='54078b491c94ba23901ad32190ff03e74cc5b3c9ec5cb771df84c52df04049b2'
HELPER='46741990f7567458e53e55a0dd79b6538d4361a49193508b68ef09db4b2ef7e4'
ROLE='9e436ae9bed8f6d5dff1b2860e94b0f7490ebaacd8208d63d97c5884e5bc5322'
SERVICE={'serviceKey':'t45-first-r3-native-service-start-20261116-35','proofSha256':'82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0','containerId':'ed42d33a198fe1c35a72d5c27b3c138d2cd5e8bc892a73d39f83fc77c88c8c14','containerStartedAt':'2026-11-16T18:33:46.920948412Z','postmasterStart':'2026-11-16 18:33:48.303258+00'}
DEADLINES={'controller':1794860582387,'admin':1794860702387,'restore':1794862382387,'parent':1794864182387}
JOBS={'prepare':'t45-r3-final33-plan-prepare-20261116-01','writer':'t45-r3-batched-real-execute-20261115-01','stop':'t45-r3-ordinary35-preserve-stop-20261116-01','restore':'t45-r3-ordinary35-auth-restore-20261116-01'}
OLD_HOST='6a1247e3bb3e9ec8a66c84c97d53de781aad887b0309f8c511addd3d15310482'
# Filled from the independently frozen two-host consumer successor before review.
NEW_HOST='3bf28414d6949de2ee81070d3aba14efcc61e6d96a872b67f095a8bec5baed7d'
ACTUAL={'/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.before-r3-05-continuity.py': '5bf72fc20dfa597c81a9eb5ae8956c497a980b1497e2cfbfe8d469932b27ad49', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched.py': 'd60c68633383f5da9e5054d518010bb6a4f34d3a068c51f87fa738d6f36a6cef', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched_apply02.py': 'da4303f6597962842d0db5993396ca1012e2181ee2224ddec9f4bd01b1a69eef', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_batched.py': '57d8ea9c363f4c4db743b99bfacafdafecdb644d8e65894a416ec2a418aa2810', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_restore_precontainer.py': 'ec89f4f472f559e621974b8f8187308b1de0d4049ddb568c9a1aa5cd545aadea', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_batched.py': 'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_restore_precontainer.py': '165c5c4c2c1f6d3f6b6ba9f555aee42d112b6881740b61384aed45d7669ace0b', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct27_batched.py': '45ee118981ebddd278240dc5bcd1ff0e05769092668e8021f8070c6ce0c04eba', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct28_batched.py': '0fa08870dbf5fec3daf5a2c4d2300e3719666091252cff9ac12ec8fcfacc3261', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct29_batched.py': '096f8ebca3ec5aee1f3091a18842e533e42932fb7b26d3da689e7a4d7a1de799', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct30_batched.py': '95b2054ea4c7c95ebcfbe6c1fc1a1ab893c1255c8e52cd91424e5fd3c0dc28ed', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct31_batched.py': '365a696b1ee113ce337e36c8159f6be28eccf3ce1e0a314ef61aeddaa76e93c9', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct32_batched.py': '4ff1a618c2e10c2119a16bd19a621d3c0c48a3ba92fe01229baec809fbb29316', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_after_preparation.py': 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_batched.py': 'b700b3b5b13c20222aa00847d95ef31975ca25e5b5baae0f5ee98b95e43a085c', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_input02.py': 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_restore02_only.py': '5aaa31f25ba1ed44a30c576fdd93df563646b3ad8b6c077632626a15da91e530', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct34_apply02.py': '3db008f0476be4413bd14d9014d2c3a5e2591618c03c6be74d5afd8a05c8cf09', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct34_normal.py': 'e539ceac12353067b4e5abe61e28766fa82843bc7446235a4be386236e3eb3ee', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py': '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input.py': '4441d264213d5abf3c2c4af1a56d7df0bd275f0a4587e66c1e1bf156c0793d3f', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_cached03.py': '17b7c5af2072cb525be2a0c9d02db20bcb6dc89bb9b89063369ec0345223ad63', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_recovery.py': '4ce801c947084c2d4870bac073cc85d844453d6b79e96129b065b94496e26722', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_continuation.py': '162dfa8b90549da125465cde04d0936cf2d0592c6702a763e13fc47dca0d4c2e', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_inspect03.py': 'fd84d560bc8903746fc31babfcab04e85f339ad1c2eff0bf31a5482a75d0591f', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent_continuation.py': '909abe203293f791cdaa909227a5a90e0ae16da2ab6fa45390d271f16f2ec19a', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_apply02.py': '720e1c9344650f55351e8654b409d7a3b3c9e38e442be06911893907911c814d', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_continuation.py': '982e5b0178bd69a07d0d659d8793033a36093283c16632ea7811a9f53588dd1f', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_inspect04.py': 'd39aac90e056fec55e23e1eea2086b62c52590edd61d7e438c55449a28401d95', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original04_absent22_continuation.py': '87c543d66e6a6d19f50d640cf8c1d483fb3e16a4eac4fcabcb6d1e1a2147a781', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_absent22_continuation.py': '16e54ec54cf945c086e547050fa7893e856b05e217f3b0b6feb650797e56e4fa', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_unknown22_inspect.py': '32aecd9f5ee7079f243b78f89d5a58e051610e16e10490cb8a12538a74a9863f', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py': '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': '34e31910f3417e88865b41938bb692245332e0b3f3fb7a6ca148d10973ba4f37', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct35-batched-real.json': '54078b491c94ba23901ad32190ff03e74cc5b3c9ec5cb771df84c52df04049b2', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct35_normal.py': '46741990f7567458e53e55a0dd79b6538d4361a49193508b68ef09db4b2ef7e4', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal35-registration-cas-20261117-01/result.json': '88b096d36fa6f8fc1613d58e815c8e84dc58049d1ab2b368cc5a3c1e3074c145', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-35.json': '82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/authority.json': '9e436ae9bed8f6d5dff1b2860e94b0f7490ebaacd8208d63d97c5884e5bc5322', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/r3-outer-terminal.json': '3b24ffb55ccd8e5f75a4d498e088557c472519b6093fd7799439c33fd45870b0', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary35-auth-apply-20261116-01.json': '3b24ffb55ccd8e5f75a4d498e088557c472519b6093fd7799439c33fd45870b0', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/results/maintenance-auth-result.json': '2050ce32e573dc7f6d960dc2b2a917cc7a68da52d462b15d62bebc08752b57a8', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/results/maintenance-auth-result.json': 'e54cad2e1469c24084d95027021666659502dc6ef2bd7d045556868ec7bfddfe', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/r3-outer-terminal.json': '0bd548166072b27a28adf2784f754fbc13774bfde68fd05b687831836cce2426', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-first-r3-native-service-start-20261116-35.json': '0bd548166072b27a28adf2784f754fbc13774bfde68fd05b687831836cce2426', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/results/normal-service-result.json': 'd282fea89a6c981c0a8fb3292bfa8843e82d4c99321e6fdbff23c9e844cbb899', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/results/normal-service-result.json': 'b7280b0c9d2152d38331ef966e786bd409955928516d53b87d38a724fffdb5d6', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/r3-outer-terminal.json': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-batched161-command-successor-20261116-01.json': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/results/batched161-command-update-result.json': 'a474d758af30d53a4154f90081066213df351a33cb1226f976d6231ed7fdb020', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/results/batched161-command-update-result.json': '2698e7d0e259037adac1c92af3ce0942a11289469fe942f4f91f14e52b75eee5', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-35/retained-ack.json': '7cb3a553fe96de7de11f35eff948da30f9933ae50403b5e0f7393b9671a5692a'}

def need(ok,code):
    if not ok: raise ValueError(code)

def sha(raw): return hashlib.sha256(raw).hexdigest()
def now(): return time.time_ns()//1000000
def pack(value): return (json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
def identity(s): return [s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]

def directory(path):
    for p in [*reversed(path.parents),path]:
        s=p.lstat();need(p.resolve()==p and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,'PROTECTED_DIRECTORY_REQUIRED')

def read(path,owner=0):
    need(path.resolve()==path,'CANONICAL_FILE_REQUIRED')
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode) and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=4*1024**2,'PROTECTED_FILE_REQUIRED')
        raw=f.read(4*1024**2+1)
        need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'FILE_CHANGED')
        return raw,identity(s)

def sync(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)

def put(path,raw,mode=0o600):
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb') as f:
        need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
    sync(path.parent)

def delta(old_raw,new_raw):
    need(sha(old_raw)==OLD_POLICY,'EXACT_OLD_POLICY_REQUIRED')
    old=json.loads(old_raw);new=json.loads(new_raw);expected=json.loads(old_raw)
    for phase in ('prepare','writer'):
        need(old['jobs'][phase]['bundlePins']['final33_host.py']==OLD_HOST,'OLD_HOST_DIFFERS')
        expected['jobs'][phase]['bundlePins']['final33_host.py']=NEW_HOST
    need(new==expected and old['jobs']['prepare']['timeoutSeconds']==780 and old['jobs']['writer']['timeoutSeconds']==3000,'ONLY_TWO_HOST_PINS_MAY_CHANGE')
    need(old['jobs']['apply']['bundlePins']['roles-authorization.json']==old['jobs']['restore']['bundlePins']['roles-authorization.json']==ROLE,'ORIGINAL_ROLE_BYTES_REQUIRED')
    need(old['expiresAt']==DEADLINES['parent'],'ORIGINAL_PARENT_REQUIRED')
    return new

def render(old,new_policy):
    need(sha(old)==OLD_DISPATCHER,'EXACT_OLD_DISPATCHER_REQUIRED')
    needle=('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(OLD_POLICY)).encode()
    need(old.count(needle)==1,'EXACT_SINGLE_POLICY_BINDING_REQUIRED')
    new=old.replace(needle,('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(sha(new_policy))).encode())
    compile(new,str(DISPATCHER),'exec');return new

def consumer(dispatcher):
    cfg=json.loads(read(P/'grant.json')[0]);m=ModuleType('live35_exact_dispatcher');m.__file__=str(DISPATCHER)
    need(cfg['grantId']==GRANT and cfg['priorGrant']=='5cc58239751e4e2a' and cfg['scope']=='ERP_EXISTING_TASKS_THROUGH_T51' and cfg['private']==str(B) and cfg['control']==str(C) and not cfg.get('revoked'),'ORIGINAL_GRANT_REQUIRED')
    exec(compile(dispatcher,m.__file__,'exec'),m.__dict__)
    core,hold=m.r3_continuity(cfg)
    need(hold.__class__.__name__=='Original02AbsentContinuation','EXACT_CONTINUATION_REQUIRED')
    proof=hold.current_service(SERVICE)
    return cfg,proof

def live(dispatcher):
    # PG stays running. No describe, SQL, authentication probe or target construction.
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stderr and not q.stdout.strip(),'NO_ACTIVE_OPERATION_REQUIRED')
    for g in (GRANT,'5cc58239751e4e2a'):
        b=B.with_name('grant-'+g);c=C.with_name('grant-'+g)
        for key in JOBS.values():
            need(not any(os.path.lexists(p) for p in (b/'jobs'/key,c/'jobs'/key,c/'requests'/(key+'.json'),c/'requests'/(key+'.tmp'),c/'results'/(key+'.json'))),'UNUSED_KEYS_REQUIRED_NO_REPLAY')
    pg=HOST/'state/fresh35-first-production-20261110-r3/data';s=pg.lstat()
    need(pg.resolve()==pg and stat.S_ISDIR(s.st_mode) and [s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode)]==[66304,13502421,61035,61035,448] and os.path.lexists(pg/'postmaster.pid'),'EXACT_RUNNING_ORIGINAL_DATA_REQUIRED')
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_AUTHORITY_PRESENT')
    cfg,proof=consumer(dispatcher)
    # Full prepare + 50-minute writer plus stop, restore and two-minute margin.
    at=now();need(at+(780+3000+240)*1000<min(DEADLINES['controller'],DEADLINES['admin'],proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']-35000,DEADLINES['parent'],int(cfg['expiresAtEpoch']*1000)),'INSUFFICIENT_COMPLETE_PREPARE_WRITER_BUDGET_CLEAN_STOP_RESTORE_REQUIRED')
    need(at+(780+3000+240+300+120)*1000<DEADLINES['restore'],'INSUFFICIENT_RESTORATION_BUDGET')
    return cfg,proof

def custody():
    root=HOST/'state/native-services/ordinary35-auth-20261116-01'
    result={}
    for name in ('original-auth.json','finite-auth.json','applied.json'):
        p=root/name;s=p.lstat();need(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400 and 0<s.st_size<=65536,'ORIGINAL_PRIVATE_CUSTODY_METADATA_REQUIRED');result[str(p)]=identity(s)
    need(not os.path.lexists(root/'restored.json') and not os.path.lexists(root/'restore-attempt.json'),'ROLE_ALREADY_RESTORED_OR_ATTEMPTED')
    return result

def snapshot(dispatcher_pin=OLD_DISPATCHER,policy_pin=OLD_POLICY,expected=None):
    identities={}
    for leaf,pin in ACTUAL.items():
        p=Path(leaf);raw,meta=read(p,1000 if str(p).startswith(str(C)+'/') else 0)
        target=dispatcher_pin if p==DISPATCHER else policy_pin if p==POLICY else pin
        need(sha(raw)==target,'EXACT_CURRENT_CHAIN_PIN_DIFFERS');identities[leaf]=meta
    for p in (P/'grant.json',P.with_name('grant-5cc58239751e4e2a')/'grant.json'):
        identities[str(p)]=read(p)[1]
    identities.update(custody());identities['executionLock']=identity(LOCK.lstat())
    need(identities['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
    if expected is not None:
        need(set(expected)==set(identities),'EXACT_BASIS_IDENTITIES_REQUIRED')
        need(all(meta==expected[k] for k,meta in identities.items() if k not in (str(DISPATCHER),str(POLICY))),'BASIS_CHANGED')
        if dispatcher_pin==OLD_DISPATCHER:need(identities[str(DISPATCHER)]==expected[str(DISPATCHER)],'DISPATCHER_IDENTITY_CHANGED')
        if policy_pin==OLD_POLICY:need(identities[str(POLICY)]==expected[str(POLICY)],'POLICY_IDENTITY_CHANGED')
    return identities

def basis():
    need(os.geteuid()==0 and socket.gethostname()=='naijue-server','EXACT_ROOT_HOST_REQUIRED')
    for p in (B,P,H,LOCK.parent):directory(p)
    with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);ids=snapshot();cfg,proof=live(read(DISPATCHER)[0]);need(ids==snapshot(),'BASIS_CHANGED_DURING_READ')
        return dict(state='READONLY_LIVE35_TWO_UNUSED_HOSTS_BASIS',checkedAt=now(),oldIdentities=ids,service=SERVICE,deadlines=DEADLINES,grantExpiresAtEpoch=cfg['expiresAtEpoch'],serviceLeaseExpiresAt=proof['sharedPostgresNamespace']['serviceLeaseExpiresAt'],activeOperationUnits=[],unusedKeys=JOBS,PGConnections=0,mutations=0,privateBodiesOrDigestsRead=False)

def decode(packet,pin):
    need(set(packet)=={'authorization','policy'},'EXACT_PACKET_REQUIRED')
    raw=base64.b64decode(packet['authorization'],validate=True);need(sha(raw)==pin,'EXTERNAL_AUTHORITY_DIFFERS');a=json.loads(raw)
    need(set(a)=={'format','grantId','sourceSha256','newPolicySha256','reviewSha256','oldIdentities','service','deadlines','startsAt','expiresAt','authorizationReference'} and a['format']=='LIVE35_TWO_UNUSED_HOSTS_CAS_V1' and a['grantId']==GRANT and a['service']==SERVICE and a['deadlines']==DEADLINES and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_REVIEWED_AUTHORITY_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+900000 and re.fullmatch('[a-f0-9]{64}',a['reviewSha256']) and type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512,'FINITE_REVIEWED_AUTHORITY_REQUIRED')
    policy=base64.b64decode(packet['policy'],validate=True);need(0<len(policy)<=1048576 and sha(policy)==a['newPolicySha256'],'EXACT_POLICY_BYTES_REQUIRED')
    return a,policy,raw

def install(a,policy,authority):
    need(os.geteuid()==0 and socket.gethostname()=='naijue-server','EXACT_ROOT_HOST_REQUIRED')
    for p in (B,P,H,LOCK.parent):directory(p)
    need(not any(os.path.lexists(p) for p in (AUDIT,PENDING,POLICY_PENDING)),'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
    with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b') as lock:
        need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        snapshot(expected=a['oldIdentities']);old=read(DISPATCHER)[0];old_policy=read(POLICY)[0];delta(old_policy,policy);new=render(old,policy);live(old)
        need(now()+30000<a['expiresAt'],'CAS_AUTHORITY_TOO_SHORT')
        AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
        for name,raw in {'authorization.json':authority,'old-dispatcher.bin':old,'old-policy.bin':old_policy,'old-identities.json':pack(a['oldIdentities'])}.items():put(AUDIT/name,raw)
        result=dict(status='LIVE35_CAS_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY',published=[],automaticReplay=False,phaseSubmitted=False,PGConnections=0,businessDatabaseWrites=0)
        try:
            put(PENDING,new,0o755);put(POLICY_PENDING,policy)
            snapshot(expected=a['oldIdentities']);live(old);need(now()<a['expiresAt'],'CAS_EXPIRED')
            put(AUDIT/'publish-intent.json',pack(dict(oldDispatcherSha256=OLD_DISPATCHER,oldPolicySha256=OLD_POLICY,dispatcherSha256=sha(new),policySha256=sha(policy))))
            os.replace(POLICY_PENDING,POLICY);sync(H);result['published'].append('policy')
            # Existing lock protects both replacements; interim old dispatcher rejects the new policy.
            os.replace(PENDING,DISPATCHER);sync(P);result['published'].append('dispatcher')
            snapshot(sha(new),sha(policy),a['oldIdentities']);live(read(DISPATCHER)[0])
            need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_LIVE35_TWO_UNUSED_HOSTS_UPDATED_NO_PHASE_SUBMITTED',dispatcherSha256=sha(new),policySha256=sha(policy),moduleSha256=HELPER,rolesAuthoritySha256=ROLE,deadlines=DEADLINES,service=SERVICE,originalLockPreserved=True)
        except BaseException as e:
            result.update(exceptionClass=type(e).__name__,safeCode=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z0-9_]{1,160}',str(e)) else None)
        put(AUDIT/'result.json',pack(result));return result

def readback():
    need(os.geteuid()==0 and socket.gethostname()=='naijue-server','EXACT_ROOT_HOST_REQUIRED')
    with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        a=json.loads(read(AUDIT/'authorization.json')[0]);old=read(AUDIT/'old-dispatcher.bin')[0];policy=read(POLICY)[0]
        delta(read(AUDIT/'old-policy.bin')[0],policy);dispatcher=render(old,policy)
        need(read(DISPATCHER)[0]==dispatcher,'READBACK_DISPATCHER_DIFFERS')
        snapshot(sha(dispatcher),sha(policy),a['oldIdentities']);live(dispatcher)
        result_raw=read(AUDIT/'result.json')[0];result=json.loads(result_raw)
        need(result['status']=='EXACT_LIVE35_TWO_UNUSED_HOSTS_UPDATED_NO_PHASE_SUBMITTED' and result['dispatcherSha256']==sha(dispatcher) and result['policySha256']==sha(policy),'CAS_OUTCOME_NOT_CONFIRMED_NO_REPLAY')
        return dict(state='ACTUAL_LIVE35_TWO_HOSTS_CAS_READBACK_MATCHED',dispatcherSha256=sha(dispatcher),policySha256=sha(policy),rolesAuthoritySha256=ROLE,service=SERVICE,deadlines=DEADLINES,auditResultSha256=sha(result_raw),authorizationSha256=sha(read(AUDIT/'authorization.json')[0]),checkedAt=now(),PGConnections=0,mutations=0,privateBodiesOrDigestsRead=False,unusedKeys=JOBS)

if __name__=='__main__':
    need(len(sys.argv)==2,'EXACT_ENTRY_ARGUMENT_REQUIRED')
    if sys.argv[1]=='--read-only-basis': print(json.dumps(basis(),sort_keys=True))
    elif sys.argv[1]=='--read-only-result': print(json.dumps(readback(),sort_keys=True))
    else:
        raw=sys.stdin.buffer.read(2*1024**2+1);need(0<len(raw)<=2*1024**2,'BOUNDED_PACKET_REQUIRED')
        a,policy,authority=decode(json.loads(raw),sys.argv[1]);result=install(a,policy,authority);print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_LIVE35_TWO_UNUSED_HOSTS_UPDATED_NO_PHASE_SUBMITTED' else 2)
