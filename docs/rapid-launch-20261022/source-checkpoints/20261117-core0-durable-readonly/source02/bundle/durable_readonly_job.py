"""Unregistered source: one fixed, offline, read-only durable-state snapshot."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import re
import signal
import stat
import subprocess
import sys
import time

KEY = 't45-r3-core0-durable-readonly-20261117-01'
ROOT = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE = Path('/var/lib/naijue-erp/fresh35-production')
DATA = STATE / 'fresh35-first-production-20261110-r3/data'
HOST_DATA = ROOT / 'state/fresh35-first-production-20261110-r3/data'
DEPLOY = Path('/opt/naijue-erp/fresh35-combined-v1')
HOST_DEPLOY = ROOT.with_name('fresh35-first-production-20261109-r1') / 'deploy'
BIN = DEPLOY / 'runtime/pg/usr/lib/postgresql/17/bin'
WORKER = Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
JOB = WORKER / KEY
INSIDE = Path('/run/t45-durable-source')
POLICY = WORKER.parent / 'r3-05-write-continuity/core0-durable-readonly-20261117-01.json'
IMAGE = 'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
LOCK = Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/execution.lock')
LOCK_ID = (66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015)
TOOLS = {'postgres':'6468a969338215cb3912cf9c0b894bdbbd37b9a709926db078e9a5bf8bdc3e16','pg_controldata':'b54c1bdeeab0953598b8447127b2230b1748ea1989dd972e6ee02455f256f180'}
TERMINALS = {'t45-r3-batched-real-execute-20261115-01':('00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35','FAILED',2),'t45-r3-ordinary39-preserve-stop-20261116-01':('18b47182038fbb44f5541adf2bbce8baeda4c90acd05a1092f0481b393ebd575','COMPLETED',0),'t45-r3-ordinary39-auth-restore-20261116-01':('400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7','COMPLETED',0)}
sha = lambda raw: hashlib.sha256(raw).hexdigest()
now = lambda: time.time_ns() // 1000000
DEADLINE = None
RUN_BEGAN = None

def need(ok, code):
    if not ok:
        raise ValueError(code)

def read(path, limit=131072):
    need(path.resolve() == path, 'CANONICAL_PROTECTED_FILE_REQUIRED')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        s = os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1 and not s.st_mode & 0o022 and 0 < s.st_size <= limit, 'PROTECTED_BOUNDED_FILE_REQUIRED')
        raw = f.read(limit + 1)
        ident = lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
        need(len(raw) == s.st_size and ident(s) == ident(os.fstat(f.fileno())) == ident(path.lstat()), 'INPUT_CHANGED')
    return raw

def put(path, obj):
    raw = (json.dumps(obj, sort_keys=True, separators=(',', ':')) + '\n').encode()
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as f:
        f.write(raw); f.flush(); os.fsync(f.fileno())

def cmd(args, timeout=5, **extra):
    if DEADLINE is not None:
        need(time.monotonic() < DEADLINE, 'FINITE_WORK_OR_CLEANUP_BUDGET_EXHAUSTED')
        timeout = min(timeout, max(0.1, DEADLINE-time.monotonic()))
    q = subprocess.run(args, capture_output=True, timeout=timeout, **extra)
    need(q.returncode == 0, 'FIXED_PRIVATE_COMMAND_FAILED')
    return q.stdout

def data_stopped(path):
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode)) == (66304,13502421,61035,61035,0o700), 'EXACT_ORIGINAL_DATA_IDENTITY_REQUIRED')
    need(not os.path.lexists(path / 'postmaster.pid'), 'ORIGINAL_DATA_NOT_STOPPED')

def verify_parent_lock():
    s = LOCK.lstat()
    need(LOCK.resolve() == LOCK and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns) == LOCK_ID, 'ORIGINAL_SHARED_LOCK_DIFFERS')
    parent = os.getppid()
    need(Path('/proc',str(parent)).stat().st_uid == 0, 'ORIGINAL_ROOT_WORKER_REQUIRED')
    token = f'{os.major(s.st_dev):02x}:{os.minor(s.st_dev):02x}:{s.st_ino}'
    need(any(len(v)>=6 and v[1:4]==['FLOCK','ADVISORY','WRITE'] and v[4]==str(parent) and v[5]==token for v in (row.split() for row in Path('/proc/locks').read_text().splitlines())), 'ORIGINAL_WORKER_SERIAL_LOCK_REQUIRED')

def closed_basis():
    for key, (pin,status,code) in TERMINALS.items():
        raw = read(WORKER / key / 'r3-outer-terminal.json')
        v = json.loads(raw)
        need(sha(raw)==pin and v['jobId']==key and (v['status'],v['exitCode'])==(status,code), 'EXACT_CLOSED39_TERMINAL_REQUIRED')
    r = json.loads(read(WORKER / 't45-r3-ordinary39-auth-restore-20261116-01/results/maintenance-auth-inside.json'))['result']
    need(r['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and r['naturalExpiryCountedAsRestoration'] is False and r['runtimeAuthChanged'] is False and r['membershipsOrRoleAttributesChanged'] is False and r['databaseStillStopped'] is True, 'EXACT_AUTH_RESTORATION_REQUIRED')
    for cid in ('a17a885412cb8122e8b77a65d5058f1653c69a3cc20d1a11a3950e4fe6e4e1d5','f0ad869843705829c962e3942e04f1c20769d68093a05326a534ee454b4baf07'):
        old = json.loads(cmd(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid]))
        need(old==dict(id=cid,running=False,pid=0), 'ORIGINAL39_AND_RESTORE_CONTAINERS_MUST_STAY_STOPPED')
    data_stopped(HOST_DATA)
    need(not cmd(['/usr/bin/ss','-H','-ltn','sport = :56791']).strip(), 'ORIGINAL_PORT_MUST_REMAIN_ABSENT')
    active = cmd(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'])
    own = 'naijue-erp-op-b16447fb-' + sha(KEY.encode())[:12] + '.service'
    need(all(row.split()[0] == own for row in active.decode().splitlines() if row.strip()), 'OTHER_OPERATION_ACTIVE')
    backup_units = cmd(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','*naijue*backup*','*naijue*capture*'])
    programs = cmd(['/bin/ps','-eo','comm=']).decode().splitlines()
    need(not backup_units.strip() and not any(s.strip() in ('pg_dump','pg_dumpall','pg_basebackup','pgbackrest','wal-g','barman') for s in programs), 'BACKUP_ACTIVE')
    fs = os.statvfs(ROOT)
    need(fs.f_bavail * fs.f_frsize >= 28*1024**3, 'RESERVE_28GIB_REQUIRED')

def load(base, pin, external):
    raw = read(base / 'host-authorization.json')
    need(sha(raw) == pin, 'EXACT_EXTERNAL_AUTHORITY_ARGUMENT_REQUIRED')
    a = json.loads(raw)
    scope_raw = read(base / 'scope.json')
    scope = json.loads(scope_raw)
    need(set(a)=={'format','requestKey','startsAt','expiresAt','sourceReviewSha256','scopeSha256','authorizationReference'} and a['format']=='T45_R3_CORE0_DURABLE_READONLY_AUTHORITY_V1' and a['requestKey']==KEY and a['scopeSha256']==sha(scope_raw), 'EXACT_DIAGNOSTIC_AUTHORITY_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=now() and now()+300000<a['expiresAt']<=a['startsAt']+900000, 'FINITE_DIAGNOSTIC_WINDOW_REQUIRED')
    need(scope['requestKey']==KEY and scope['imageId']==IMAGE and scope['maximumOperationSeconds']==300 and scope['reserveBytes']==28*1024**3, 'EXACT_SCOPE_REQUIRED')
    sql = read(base / 'durable-readonly.sql', 32768)
    need(sha(sql)==scope['querySha256'], 'FIXED_SQL_DIFFERS')
    if external:
        policy = json.loads(read(POLICY))
        need(policy['format']=='T45_R3_CORE0_DURABLE_READONLY_REGISTERED_V1' and policy['requestKey']==KEY and policy['authoritySha256']==pin and policy['sourceReviewSha256']==a['sourceReviewSha256'] and policy['startsAt']<=a['startsAt']<a['expiresAt']<=policy['expiresAt'], 'NEW_EXACT_REGISTERED_POLICY_REQUIRED')
        need(set(policy['bundlePins'])=={'durable_readonly_job.py','durable-readonly.sql','scope.json'} and all(sha(read(base / leaf))==value for leaf,value in policy['bundlePins'].items()), 'REGISTERED_FIXED_BUNDLE_REQUIRED')
    return a, scope, sql

def safe_error(error):
    code = error.args[0] if type(error) is ValueError and len(error.args)==1 and type(error.args[0]) is str and re.fullmatch('[A-Z0-9_]{1,120}',error.args[0]) else 'UNKNOWN_PRIVATE_ERROR_REDACTED'
    return {'safeCode':code,'errorType':type(error).__name__ if type(error).__name__ in ('ValueError','TimeoutExpired','FileNotFoundError','PermissionError') else 'UNKNOWN'}

def inside(base, pin):
    a, scope, sql = load(base,pin,False)
    need(Path(__file__)==INSIDE/'durable_readonly_job.py', 'EXACT_INSIDE_ENTRY_REQUIRED')
    env = {'PATH':'/usr/bin:/bin','HOME':str(DATA.parent),'LC_ALL':'C','TZ':'UTC'}
    for tool, expected in TOOLS.items():
        need(sha(read(BIN/tool,32*1024**2))==expected, 'ORIGINAL_REVIEWED_PG_TOOL_DIFFERS')
    def control():
        data_stopped(DATA)
        raw = cmd([str(BIN/'pg_controldata'),'-D',str(DATA)],5,env=env,user=61035,group=61035,extra_groups=[])
        need(re.search(rb'^Database cluster state:\s*shut down\s*$',raw,re.M) and re.search(rb'^Database system identifier:\s*7706545564479176741\s*$',raw,re.M), 'CLEAN_EXACT_CLUSTER_REQUIRED')
    control()
    args = [str(BIN/'postgres'),'--single','-D',str(DATA)]
    for value in ('default_transaction_read_only=on','search_path=pg_catalog,naijue_erp','statement_timeout=120000','lock_timeout=5000','log_statement=none','log_min_error_statement=panic','log_min_messages=panic','client_min_messages=error','logging_collector=off','log_min_duration_statement=-1','log_duration=off','log_connections=off','log_disconnections=off','shared_preload_libraries=','session_preload_libraries=','local_preload_libraries=','TimeZone=UTC','DateStyle=ISO,YMD','standard_conforming_strings=on','fsync=on','synchronous_commit=on','full_page_writes=on'):
        args += ['-c',value]
    args.append(scope['database'])
    # Single-user input uses one physical line per statement; the fixed SELECT
    # is folded locally without accepting any arbitrary SQL argument.
    lines = sql.decode().strip().splitlines()
    need(lines[0]=='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' and lines[-1]=='ROLLBACK;', 'FIXED_READONLY_TRANSACTION_REQUIRED')
    input_bytes = (lines[0]+'\n'+' '.join(lines[1:-1])+'\n'+lines[-1]+'\n').encode()
    child = None
    cleanup = {'childReaped':False,'descendantsAbsent':False,'cleanClusterAfterRead':False,'networkConnectionsOpened':0}
    try:
        child = subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,user=61035,group=61035,extra_groups=[],start_new_session=True,umask=0o077)
        pid = child.pid
        try:
            stdout, stderr = child.communicate(input_bytes, timeout=160)
        except subprocess.TimeoutExpired:
            os.killpg(pid,signal.SIGTERM)
            try:child.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(pid,signal.SIGKILL);child.communicate(timeout=5)
            raise ValueError('SINGLE_USER_TIMEOUT_OUTCOME_UNCONFIRMED') from None
        need(child.returncode==0 and len(stdout)<=262144, 'SINGLE_USER_QUERY_UNCONFIRMED')
        matches = re.findall(rb'T45_R3_DURABLE_HEX_V1:([a-f0-9]+)', stdout)
        need(len(matches)==1 and len(matches[0])<=131072, 'EXACT_SAFE_RESULT_REQUIRED')
        result = json.loads(bytes.fromhex(matches[0].decode()))
        need(type(result) is dict and result.get('format')=='T45_R3_CORE0_DURABLE_READONLY_V1' and result.get('databaseMatches') is True and result.get('databaseOid')=='16393' and result.get('serverVersionNum')=='170011' and result.get('transactionReadOnly') is True and result.get('defaultTransactionReadOnly') is True, 'ACTUAL_PHYSICAL_AND_READONLY_BOUNDARY_REQUIRED')
        need(set(result['tableCounts'])==set(scope['tableNames']) and all(type(v) is int and v>=0 for v in result['tableCounts'].values()), 'FIXED_TABLE_COUNTS_REQUIRED')
        result['threeBodiesMatchExpectedBefore']={name:result['functionBodySha256'].get(name)==expected for name,expected in scope['expectedBeforeBodies'].items()}
        result['catalogCountsMatchExpectedBefore']=result['catalog']==scope['expectedCatalogCounts']
        return {'status':'FIXED_DURABLE_READONLY_SNAPSHOT_OBSERVED','evidence':result,'actualSingleUserPid':pid,'singleUserPostmasterEpoch':'NOT_APPLICABLE','transactionEnd':'ROLLBACK','physicalPGDATAFileWritesPossible':True,'roleOrCredentialChanges':False,'cleanup':cleanup}
    finally:
        if child is not None:
            if child.poll() is None:
                os.killpg(child.pid,signal.SIGTERM)
                try:child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=5)
            cleanup['childReaped']=child.poll() is not None
            survivors=[]
            for p in Path('/proc').iterdir():
                if p.name.isdecimal():
                    try:
                        fields=(p/'stat').read_text().rsplit(')',1)[1].split()
                        if int(fields[2])==child.pid:survivors.append(p.name)
                    except (FileNotFoundError,ProcessLookupError):pass
            cleanup['descendantsAbsent']=not survivors
            need(cleanup['childReaped'] and cleanup['descendantsAbsent'], 'SINGLE_USER_CHILD_CLEANUP_UNCONFIRMED')
        control()
        cleanup['cleanClusterAfterRead']=True

def inspect(cid):
    value = json.loads(cmd(['/usr/bin/docker','inspect',cid]))[0]
    need(value['Id']==cid and value['Name']=='/'+KEY and value['Image']==IMAGE and value['Config']['Labels'].get('t45.operation')==KEY and value['HostConfig']['NetworkMode']=='none', 'OWN_EXACT_DIAGNOSTIC_CONTAINER_REQUIRED')
    return value

def host(base,pin):
    global DEADLINE
    DEADLINE=RUN_BEGAN+210
    a, scope, sql = load(base,pin,True)
    verify_parent_lock();closed_basis()
    need(not cmd(['/usr/bin/docker','ps','-a','--filter','name=^/'+KEY+'$','--format','{{.ID}}']).strip(), 'DIAGNOSTIC_IDENTITY_ALREADY_EXISTS_NO_REPLAY')
    service_lock = ROOT/'state/native-services/service-operation.lock'
    fd = os.open(service_lock,os.O_RDWR|os.O_NOFOLLOW)
    st = os.fstat(fd)
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600, 'EXISTING_SERVICE_LOCK_REQUIRED')
    fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    began=time.monotonic();cid=None;attempted=False;out=None
    cleanup={'createAttempted':False,'ownContainerStopped':False,'ownedPidAbsent':False,'pgdataPidAbsent':False,'originalPortAbsent':False,'dataPreserved':True,'physicalPGDATAFileWritesPossible':True}
    args=['/usr/bin/docker','create','--name',KEY,'--network','none','--user','0:0','--read-only','--cap-drop','ALL','--cap-add','SETUID','--cap-add','SETGID','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--label','t45.operation='+KEY,'--label','t45.durable-authority='+pin,'--tmpfs','/run:rw,nosuid,nodev,size=16m,mode=0755','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777']
    for source,target,readonly in ((HOST_DEPLOY,DEPLOY,True),(HOST_DATA,DATA,False),(base,INSIDE,True)):
        need(source.resolve()==source and source.is_dir(), 'FIXED_CANONICAL_MOUNT_REQUIRED')
        args += ['--mount','type=bind,src='+str(source)+',dst='+str(target)+(',readonly' if readonly else '')]
    args += ['--entrypoint','/usr/bin/python3',IMAGE,'-I','-S',str(INSIDE/'durable_readonly_job.py'),'--inside',pin]
    try:
        attempted=True;cleanup['createAttempted']=True
        cid=cmd(args,10).decode().strip();need(re.fullmatch('[a-f0-9]{64}',cid) is not None,'ACTUAL_CONTAINER_ID_REQUIRED')
        inspect(cid)
        raw=cmd(['/usr/bin/docker','start','-a',cid],min(200,max(1,int(a['expiresAt']/1000-time.time()-90))))
        need(len(raw)<=131072, 'BOUNDED_SAFE_CAPSULE_RESULT_REQUIRED')
        out=json.loads(raw)
        need(out.get('status')=='FIXED_DURABLE_READONLY_SNAPSHOT_OBSERVED' and out['cleanup']['childReaped'] and out['cleanup']['descendantsAbsent'] and out['cleanup']['cleanClusterAfterRead'], 'CAPSULE_RESULT_AND_CLEANUP_REQUIRED')
    finally:
        DEADLINE=RUN_BEGAN+300
        try:
            if cid is None and attempted:
                ids=cmd(['/usr/bin/docker','ps','-a','--no-trunc','--filter','name=^/'+KEY+'$','--format','{{.ID}}']).decode().splitlines()
                need(len(ids)<=1,'AMBIGUOUS_DIAGNOSTIC_CONTAINER')
                cid=ids[0] if ids else None
            if cid:
                v=inspect(cid)
                if v['State']['Running']:cmd(['/usr/bin/docker','stop','--time','25',cid],30)
                v=inspect(cid)
                cleanup.update(ownContainerStopped=not v['State']['Running'],ownedPidAbsent=v['State']['Pid']==0,actualContainerId=cid,actualContainerStartedAt=v['State']['StartedAt'])
            else:cleanup.update(ownContainerStopped=True,ownedPidAbsent=True,containerNotCreated=True)
            data_stopped(HOST_DATA);cleanup['pgdataPidAbsent']=True
            cleanup['originalPortAbsent']=not cmd(['/usr/bin/ss','-H','-ltn','sport = :56791']).strip()
            need(cleanup['ownContainerStopped'] and cleanup['ownedPidAbsent'] and cleanup['originalPortAbsent'], 'EXACT_LIFECYCLE_CLEANUP_UNCONFIRMED')
        finally:
            put(JOB/'results/durable-readonly-cleanup.json',cleanup)
            fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
    return {'status':'DURABLE_READONLY_RESULT_AND_OWN_CONTAINER_CLEANUP_CONFIRMED','requestKey':KEY,'snapshot':out,'cleanup':cleanup,'elapsedSeconds':round(time.monotonic()-began,6),'businessDML':False,'authorityReusedFrom39':False,'automaticReplay':False}

def main():
    global RUN_BEGAN, DEADLINE
    RUN_BEGAN=time.monotonic()
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'FIXED_ISOLATED_ROOT_ENTRY_REQUIRED')
    os.umask(0o077)
    internal=len(sys.argv)==3 and sys.argv[1]=='--inside'
    DEADLINE=RUN_BEGAN+(180 if internal else 210)
    def interrupted(*_):
        raise ValueError('DIAGNOSTIC_INTERRUPTED_OUTCOME_UNCONFIRMED')
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
    base=INSIDE if internal else JOB/'bundle'
    need(Path(__file__)==base/'durable_readonly_job.py','FIXED_SOURCE_ENTRY_REQUIRED')
    pin=sys.argv[2] if internal else sys.argv[1] if len(sys.argv)==2 else None
    need(type(pin) is str and re.fullmatch('[a-f0-9]{64}',pin),'ONE_ACTUAL_AUTHORITY_SHA_ARGUMENT_REQUIRED')
    if not internal:need(os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB),'ORIGINAL_REVIEWED_DISPATCHER_ONLY')
    try:result=inside(base,pin) if internal else host(base,pin)
    except BaseException as error:
        result=dict(status='DURABLE_READONLY_UNKNOWN_OR_REFUSED_ORIGINAL_KEY_ONLY',requestKey=KEY,automaticReplay=False,**safe_error(error))
    if internal:print(json.dumps(result,sort_keys=True))
    else:put(JOB/'results/durable-readonly-result.json',result)
    return 0 if result.get('status') in ('FIXED_DURABLE_READONLY_SNAPSHOT_OBSERVED','DURABLE_READONLY_RESULT_AND_OWN_CONTAINER_CLEANUP_CONFIRMED') else 2

if __name__=='__main__':
    raise SystemExit(main())
