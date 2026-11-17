"""Original root job lifecycle around the fixed offline maintenance auth leaf."""
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
from pathlib import Path
from types import ModuleType

ROOT = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE = Path('/var/lib/naijue-erp/fresh35-production')
DEPLOY = ROOT.with_name('fresh35-first-production-20261109-r1') / 'deploy'
DEPLOY_INSIDE = '/opt/naijue-erp/fresh35-combined-v1'
IMAGE = 'sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
WORKER = Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
INSIDE = Path('/run/t45-maint/source')
RESULTS = Path('/run/t45-maint/results')
PHASES = {'restore': ('t45-r3-ordinary41-original-auth-rollback-20261117-02', 't45-r3-ordinary41-original-auth-rollback-20261117-02')}
STATIC_PINS = {'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'prior_preserved38.py': '5e281d37eb8d87fbcb5312ba1292370d1d5bb1b5b38a9c28832e089d19e8542a'}
PRIOR_CID = '3ebc60712697f9a4fe8bd333fec07a6128b57a9c7b879c865332859acc237967'
PRIOR_NAME = 't45-fresh35-first-production-20261110-r3-service-34'
CURRENT_NAME = 't45-fresh35-first-production-20261110-r3-service-41'
CURRENT_KEY = 't45-first-r3-native-service-start-20261117-41'
CURRENT_SOURCE = 'c7368468dca6327424d7415254de6fa17b1013ad23712b592393670b73667db2'
CURRENT_PROOF_SOURCE = '225a4ca13d03e9b41e55aa06f90e239cd98ef6c2f357a6be8dc9bd87101c67ad'
PLAN_SHA = '7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d'
APP09_NAME = 't45-fresh35-first-production-20261110-r3-service-09'
HOST_WORK_SECONDS = 220
CLEANUP_RESERVE_SECONDS = 80
INSIDE_ALARM_SECONDS = 200


def need(ok, code):
    if not ok:
        raise ValueError(code)


def present(path):
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    return True


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def read(path, limit=262144):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == s.st_gid == 0 and s.st_nlink == 1
             and not s.st_mode & 0o022 and 0 < s.st_size <= limit, 'MAINT_JOB_PROTECTED_INPUT_REQUIRED')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            raw = f.read(limit + 1)
        need(len(raw) == s.st_size, 'MAINT_JOB_INPUT_CHANGED')
        return raw
    finally:
        os.close(fd)


def write(path, value):
    raw = encode(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as f:
            need(f.write(raw) == len(raw), 'MAINT_JOB_SHORT_RECEIPT')
            f.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def scope(phase='restore'):
    need(phase in PHASES, 'MAINT_JOB_FIXED_PHASE_REQUIRED')
    key, name = PHASES[phase]
    return {'format': 'T45_R3_ORIGINAL41_AUTH_ROLLBACK_ONLY_ROOT_JOB_V1', 'phase': phase,
            'requestKey': key, 'containerName': name, 'imageId': IMAGE,
            'maximumOperationSeconds': 300,
            'decision':'ROLLBACK_EXACT_ORIGINAL_AUTH_ONLY', 'service': {'containerId': 'cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c', 'containerStartedAt': '2026-11-17T13:42:11.910047227Z', 'postmasterStart': '2026-11-17 13:42:13.196867+00', 'proofSha256': 'c31d0e8ab940538ce17612834b23681a6413ca2c9fc1106fe82600e68f9c6cfa', 'serviceKey': 't45-first-r3-native-service-start-20261117-41'},
            'guardianCleanupSha256':'9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac',
            'historicalRolesAuthoritySha256':'0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c', 'networkMode': 'none', 'hostPorts': [],
            'dataDirectoryDevice': 66304, 'dataDirectoryInode': 13502421,
            'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'}


def validate(a, phase, now):
    fixed=scope(phase)
    extra={'startsAt','expiresAt','authorizationReference','independentReviewSha256','rolesAuthoritySha256','rolesSourceSha256','hostSourceSha256','originalRecoveryStat9'}
    need(phase=='restore'and type(a)is dict and set(a)==set(fixed)|extra and all(a[k]==v for k,v in fixed.items()),'ROLLBACK_JOB_EXACT_ONLY_SCOPE_REQUIRED')
    need(type(now)is type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now and now+300000<a['expiresAt']<=a['startsAt']+900000,'ROLLBACK_JOB_NEW_REAL_FIFTEEN_MINUTE_WINDOW_REQUIRED')
    need(type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512 and all(type(a[k])is str and re.fullmatch('[a-f0-9]{64}',a[k])for k in('independentReviewSha256','rolesAuthoritySha256','rolesSourceSha256','hostSourceSha256')),'ROLLBACK_JOB_EXTERNAL_REVIEW_REQUIRED')
    stats=a['originalRecoveryStat9'];need(type(stats)is dict and set(stats)=={'original-auth.json','finite-auth.json','applied.json'}and all(type(row)is list and len(row)==9 and all(type(v)is int for v in row)for row in stats.values()),'ROLLBACK_JOB_ACTUAL_SNAPSHOT_STAT9_REQUIRED')


def module(raw, path, name):
    m = ModuleType(name)
    m.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), m.__dict__)
    return m


def command(args, seconds=10):
    q = subprocess.run(args, capture_output=True, timeout=seconds)
    need(len(q.stdout) + len(q.stderr) <= 1048576, 'MAINT_JOB_COMMAND_OUTPUT_BOUNDS')
    need(q.returncode == 0, 'MAINT_JOB_COMMAND_FAILED_' + str(abs(q.returncode)))
    return q.stdout


def inspect(cid):
    raw = command(['docker', 'inspect', cid], 5)
    need(len(raw) <= 262144, 'MAINT_JOB_INSPECTION_BOUNDS')
    values = json.loads(raw)
    need(type(values) is list and len(values) == 1, 'MAINT_JOB_EXACT_CONTAINER_REQUIRED')
    return values[0]


def owned(cid, a):
    v = inspect(cid)
    need(v['Id'] == cid and v['Name'] == '/' + a['containerName'] and v['Image'] == IMAGE
         and v['Config']['Labels'].get('t45.operation') == a['requestKey']
         and v['Config']['Labels'].get('t45.maintenance-authority') == a['rolesAuthoritySha256']
         and v['HostConfig']['NetworkMode'] == 'none' and not v['HostConfig']['PortBindings']
         and v['Config']['User'] == '0:0', 'MAINT_JOB_OWNED_CONTAINER_DIFFERS')
    return v


def find_owned(a):
    raw = command(['docker', 'ps', '-a', '--no-trunc', '--filter', 'name=^/' + a['containerName'] + '$', '--format', '{{.ID}}'], 5)
    ids = raw.decode().splitlines()
    need(len(ids) <= 1, 'MAINT_JOB_MULTIPLE_CONTAINERS_REFUSED')
    if not ids:
        return None
    need(re.fullmatch('[a-f0-9]{64}', ids[0]), 'MAINT_JOB_INVALID_CID')
    owned(ids[0], a)
    return ids[0]


def original_stopped(phase):
    prior = inspect(PRIOR_CID)
    need(prior['Id'] == PRIOR_CID and prior['Name'] == '/' + PRIOR_NAME and prior['Image'] == IMAGE
         and prior['Config']['Labels'].get('t45.operation') == 't45-first-r3-native-service-start-20261116-34'
         and not prior['State']['Running'] and prior['State']['Pid'] == 0
         and prior['State']['StartedAt']=='2026-11-16T17:11:20.986520431Z',
         'MAINT_JOB_ORIGINAL_08_NOT_STOPPED')
    for name in (CURRENT_NAME, APP09_NAME):
        ids = command(['docker', 'ps', '-a', '--no-trunc', '--filter', 'name=^/' + name + '$', '--format', '{{.ID}}'], 5).decode().splitlines()
        need(len(ids) <= 1, 'MAINT_JOB_SERVICE_NAME_AMBIGUOUS')
        if ids:
            need(phase == 'restore' and name == CURRENT_NAME, 'MAINT_JOB_SERVICE_ORDER_VIOLATION')
            value = inspect(ids[0])
            need(value['Name'] == '/' + name and value['Image'] == IMAGE
                 and value['Config']['Labels'].get('t45.operation') == CURRENT_KEY
                 and not value['State']['Running'] and value['State']['Pid'] == 0,
                 'MAINT_JOB_10_MUST_BE_STOPPED_BEFORE_RESTORE')
    data = ROOT / 'state/fresh35-first-production-20261110-r3/data'
    s = data.lstat()
    need(stat.S_ISDIR(s.st_mode) and not data.is_symlink()
         and (s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (66304, 13502421, 61035, 61035, 0o700)
         and not present(data / 'postmaster.pid'), 'MAINT_JOB_ORIGINAL_STOPPED_DATA_REQUIRED')


def docker_args(a, job, ops):
    args = ['docker', 'create', '--name', a['containerName'], '--network', 'none', '--user', '0:0',
            '--read-only', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'SETUID', '--cap-add', 'SETGID',
            '--cap-add', 'DAC_OVERRIDE', '--security-opt', 'no-new-privileges', '--pids-limit', '128',
            '--memory', '512m', '--cpus', '1', '--label', 't45.operation=' + a['requestKey'],
            '--label', 't45.maintenance-authority=' + a['rolesAuthoritySha256'],
            '--tmpfs', '/run:rw,nosuid,nodev,size=16m,mode=0755',
            '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777']
    mounts = [(ROOT / 'authority', '/etc/naijue-erp', True),
              (DEPLOY, DEPLOY_INSIDE, True),
              (ROOT / 'state', str(STATE), False),
              (job / 'bundle', str(INSIDE), True),
              (job / 'results', str(RESULTS), False)]
    for rel in ops.FIRST_NATIVE_DELTA:
        mounts.append((ops.first_native_launcher(rel), DEPLOY_INSIDE + '/' + rel, True))
    for source, target, readonly in mounts:
        args += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + (',readonly' if readonly else '')]
    return args + ['--entrypoint', '/usr/bin/python3', IMAGE, '-I', '-S', str(INSIDE / 'ordinary05_roles_job.py'), '--inside']


def inside(base, a, roles_raw, roles_pin, ops, normal, proof, leaf):
    need(sys.flags.isolated and sys.flags.no_site and Path(__file__) == INSIDE / 'ordinary05_roles_job.py',
         'MAINT_JOB_FIXED_ISOLATED_INSIDE_REQUIRED')
    old, factory, record = normal.context(ops, proof)
    need(sha(record) == a['installationRecordSha256'], 'MAINT_JOB_INSTALLATION_DIFFERS')
    hba = ops.read_file(normal.WORK / 'data/pg_hba.conf', 65536, True, False)
    need(hba == factory.core.hba_text(old['proposal']).encode(), 'MAINT_JOB_ORIGINAL_HBA_DIFFERS')
    def interrupted(*_):
        raise ValueError('MAINT_JOB_FINITE_STEP_INTERRUPTED_UNKNOWN_NO_REPLAY')
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
        signal.signal(sig, interrupted)
    signal.alarm(INSIDE_ALARM_SECONDS)
    try:
        result = leaf.restore(factory.core, roles_raw, roles_pin)
        need(ops.read_file(normal.WORK / 'data/pg_hba.conf', 65536, True, False) == hba,
             'MAINT_JOB_ORIGINAL_HBA_CHANGED')
        write(RESULTS / 'maintenance-auth-inside.json', {'phase': a['phase'], 'requestKey': a['requestKey'], 'result': result})
    finally:
        signal.alarm(0)


def work_left(deadline, expires_at):
    return min(deadline - time.monotonic(), (expires_at - time.time_ns() // 1000000) / 1000
               - CLEANUP_RESERVE_SECONDS)





def host(job, a, ops, prior, material):
    deadline = time.monotonic() + HOST_WORK_SECONDS
    original_stopped(a['phase'])
    control = ops.CONTROL.with_name('grant-b16447fbc81f4d64')
    prior.validate(ops,control)
    require_failed19_history(ops,control)
    if a['phase'] == 'restore':
        verify_current_stop(ops, control, a)
        original_stopped('restore')
    need(find_owned(a) is None, 'MAINT_JOB_CONTAINER_PRESENT_READ_ORIGINAL_KEY')
    write(job / 'results/maintenance-auth-intent.json', {'requestKey': a['requestKey'], 'phase': a['phase'],
          'containerName': a['containerName'], 'rolesAuthoritySha256': a['rolesAuthoritySha256'], 'automaticReplay': False})
    cid = None
    result = None
    attempted = False
    primary = None
    cleanup = {'requestKey': a['requestKey'], 'ownContainerStopped': False, 'ownedPidAbsent': False,
               'sourceDataPreserved': True, 'confirmed': False, 'automaticReplay': False}
    try:
        need(work_left(deadline, a['expiresAt']) > 25, 'MAINT_JOB_NO_CREATE_WITHOUT_WORK_BUDGET')
        attempted = True
        raw = command(docker_args(a, job, ops))
        observed = raw.decode().strip()
        need(re.fullmatch('[a-f0-9]{64}', observed), 'MAINT_JOB_CREATE_ACK_UNCONFIRMED')
        cid = observed
        owned(cid, a)
        command(['docker', 'start', cid])
        while work_left(deadline, a['expiresAt']) > 5:
            v = owned(cid, a)
            if not v['State']['Running']:
                result_path = job / 'results/maintenance-auth-inside.json'
                need(result_path.exists(), 'MAINT_JOB_INSIDE_RESULT_UNCONFIRMED')
                result = json.loads(read(result_path))
                need(result['requestKey'] == a['requestKey'] and result['phase'] == a['phase'], 'MAINT_JOB_RESULT_BINDING_DIFFERS')
                result['containerExitCode'] = v['State']['ExitCode']
                break
            time.sleep(.2)
        need(result is not None, 'MAINT_JOB_TIMEOUT_UNKNOWN_ORIGINAL_KEY_ONLY')
    except BaseException as error:
        primary = error
        raise
    finally:
        # An ambiguous create is looked up by its original name only for cleanup.
        cleanup.update(cid=cid, createAttempted=attempted, stage='FIND_EXACT_CONTAINER')
        try:
            if cid is None and attempted:
                cid = find_owned(a)
            cleanup['cid'] = cid
            if cid is not None:
                cleanup['stage'] = 'INSPECT_OWN_CONTAINER'
                v = owned(cid, a)
                if v['State']['Running']:
                    cleanup['stage'] = 'STOP_OWN_CONTAINER'
                    command(['docker', 'stop', '--time', '25', cid], 30)
                cleanup['stage'] = 'READ_BACK_OWN_CONTAINER_STOP'
                v = owned(cid, a)
                cleanup.update(ownContainerStopped=not v['State']['Running'], ownedPidAbsent=v['State']['Pid'] == 0,
                               exitCode=v['State']['ExitCode'], oomKilled=v['State']['OOMKilled'])
                need(cleanup['ownContainerStopped'] and cleanup['ownedPidAbsent'],
                     'MAINT_JOB_OWN_CONTAINER_CLEANUP_UNCONFIRMED')
            else:
                need(not attempted, 'MAINT_JOB_CREATE_OUTCOME_UNCONFIRMED')
            cleanup['confirmed'] = True
        except Exception as error:
            code = str(error)
            cleanup['safeCode'] = (code if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]+', code)
                                   else type(error).__name__)
            if primary is None:
                raise ValueError('MAINT_JOB_OWN_CONTAINER_CLEANUP_UNCONFIRMED') from None
        finally:
            write(job / 'results/maintenance-auth-cleanup.json', cleanup)
    need(cleanup['ownContainerStopped'] and cleanup['ownedPidAbsent'], 'MAINT_JOB_OWN_CONTAINER_CLEANUP_UNCONFIRMED')
    original_stopped(a['phase'])
    expected = {'apply': 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK',
                'restore': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'}
    success = result['containerExitCode'] == 0 and result['result']['status'] == expected[a['phase']]
    return {'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED' if success else 'FINITE_AUTH_STEP_UNCONFIRMED_ORIGINAL_KEY_ONLY',
            'requestKey': a['requestKey'], 'phase': a['phase'], 'result': result['result'],
            'cleanup': cleanup, 'normal08Or05Started': False, 'newDatabaseOrRole': False,
            'SQL36OrBusinessImport': False, 'automaticReplay': False}


def verify_current_stop(ops, control, a):
    s=a['service'];boot=ROOT/'state/native-services'/CURRENT_KEY
    proof=ROOT/'authority/fresh35-current-production-service-v2-service-41.json';z=proof.lstat()
    need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ROLLBACK_EXACT41_PUBLIC_PROOF_METADATA_REQUIRED')
    proofraw=ops.read_file(proof,65536,False);p=ops.strict(proofraw)
    need(sha(proofraw)==s['proofSha256']and p['requestKey']==CURRENT_KEY and p['physical']['postmasterStart']==s['postmasterStart']and p['physical']['databaseOid']=='16393'and p['physical']['systemIdentifier']=='7706545564479176741','ROLLBACK_EXACT41_PROOF_REQUIRED')
    need(ops.strict(ops.read_file(boot/'retained-ack.json',65536,True))==dict(requestKey=CURRENT_KEY,proofSha256=s['proofSha256'],serviceLeaseExpiresAt=1794926342048),'ROLLBACK_REAL41_ACK_REQUIRED')
    cleanraw=ops.read_file(boot/'cleanup.json',65536,True);c=ops.strict(cleanraw)
    need(sha(cleanraw)==a['guardianCleanupSha256']and c['requestKey']==CURRENT_KEY and c['retained']is True and c['runtimeMaterialPreserved']is True and c['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and all(c['cleanup'].get(k)is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ROLLBACK_ACTUAL_GUARDIAN_CLEANUP_REQUIRED')
    b=inspect(s['containerId']);need(b['Id']==s['containerId']and b['Name']=='/'+CURRENT_NAME and b['Image']==IMAGE and b['State']['StartedAt']==s['containerStartedAt']and b['State']['Running']is False and b['State']['Pid']==0 and b['Config']['Labels'].get('t45.operation')==CURRENT_KEY,'ROLLBACK_EXACT_STOPPED_C41_REQUIRED')
    apply='t45-r3-ordinary41-auth-apply-20261117-01';t=ops.read_file(WORKER/apply/'r3-outer-terminal.json',65536,True);need(sha(t)=='73ca3c4dd871b684381db6c1b474504097b44f1d7f119de903052b2c1da6fda4'and t==ops.read_file(control/'results'/(apply+'.json'),65536,False,False),'ROLLBACK_ORIGINAL_APPLY_TERMINAL_REQUIRED')
    ar=ops.read_file(WORKER/apply/'results/maintenance-auth-result.json',65536,True);need(sha(ar)=='cdc51c702f155c920275b27cd89723d05d5da21b7a73f957cec185e3477dd659'and ops.strict(ar)['result']['privateRecoveryBasisRetained']is True,'ROLLBACK_ORIGINAL_APPLY_READBACK_REQUIRED')
    for leaf,expected in a['originalRecoveryStat9'].items():
        path=ROOT/'state/native-services/ordinary41-auth-20261117-01'/leaf;z=path.lstat();need(path.resolve()==path and stat.S_ISREG(z.st_mode)and [z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]==expected and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o400 and z.st_nlink==1,'ROLLBACK_SNAPSHOT_STAT_ONLY_CHANGED')
    need(not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),'ROLLBACK_NO_LISTENER_REQUIRED')
    q=command(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-*.service'],5).decode().splitlines();own='naijue-erp-op-b16447fb-'+sha(a['requestKey'].encode())[:12]+'.service';need(all(row.split()[0]==own for row in q if row.strip()),'ROLLBACK_NO_OTHER_OPERATIONS_REQUIRED')


def require_failed19_history(ops,control):
    root=WORKER.parent;hold=root/'r3-05-write-continuity'
    fixed=((hold/'policy.json','25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'),
           (hold/'active.json','0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8'),
           (hold/'bindings/writer.json','f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01'),
           (root/'jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json','ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'),
           (root/'jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json','c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a'))
    for path,pin in fixed:
        need(sha(ops.read_file(path,65536,True))==pin,'ORDINARY20_ORIGINAL_FAILED19_HISTORY_CHANGED')







def main():
    need(sys.platform == 'linux' and os.getuid() == os.geteuid() == 0, 'MAINT_JOB_LINUX_ROOT_REQUIRED')
    os.umask(0o077)
    internal = sys.argv[1:] == ['--inside']
    base = INSIDE if internal else WORKER / os.environ.get('ERP_SHARED_JOB_DIR', '').split('/')[-1] / 'bundle'
    need(Path(__file__) == base / 'ordinary05_roles_job.py', 'MAINT_JOB_FIXED_ENTRY_REQUIRED')
    raw = read(base / 'host-authorization.json', 65536)
    a = json.loads(raw)
    phase = a.get('phase')
    validate(a, phase, time.time_ns() // 1000000)
    key = a['requestKey']
    job = WORKER / key
    if not internal:
        need(os.environ.get('ERP_SHARED_TASK_ID') == 'T45' and os.environ.get('ERP_SHARED_JOB_DIR') == str(job)
             and len(sys.argv) == 2 and sha(raw) == sys.argv[1], 'MAINT_JOB_ORIGINAL_EXTERNAL_AUTHORITY_REQUIRED')
    pins = {**STATIC_PINS, 'ordinary05_roles.py': a['rolesSourceSha256'], 'ordinary05_roles_job.py': a['hostSourceSha256']}
    modules = {}
    for leaf, pin in pins.items():
        b = read(base / leaf)
        need(sha(b) == pin, 'MAINT_JOB_SOURCE_DIFFERS')
        if leaf != 'ordinary05_roles_job.py':
            modules[leaf] = module(b, base / leaf, 'fixed_' + leaf.replace('.', '_'))
    roles_raw = read(base / 'roles-authorization.json', 65536)
    need(sha(roles_raw) == a['rolesAuthoritySha256'], 'MAINT_JOB_ROLE_AUTHORITY_BYTES_DIFFER')
    role_authority = json.loads(roles_raw)
    modules['ordinary05_roles.py'].validate(role_authority, time.time_ns() // 1000000, True)
    need(role_authority['rolesSourceSha256'] == a['rolesSourceSha256'], 'MAINT_JOB_ROLE_SOURCE_BINDING_DIFFERS')
    need(role_authority['requestKey']==key and role_authority['startsAt']==a['startsAt']and role_authority['expiresAt']==a['expiresAt']and role_authority['originalRecoveryStat9']==a['originalRecoveryStat9'],'ROLLBACK_ONLY_INNER_OUTER_SAME_NEW_WINDOW_REQUIRED')
    if internal:
        try:
            inside(base, a, roles_raw, a['rolesAuthoritySha256'], modules['fresh35-production-carrier.py'],
                   modules['normal_service04.py'], modules['normal_service04_proof.py'], modules['ordinary05_roles.py'])
        except Exception as error:
            leaf = modules['ordinary05_roles.py']
            progress = {key: os.path.lexists(leaf.CUSTODY / name) for key, name in (
                ('originalRecoveryBasisPresent', 'original-auth.json'), ('finiteAuthBasisPresent', 'finite-auth.json'),
                ('applyAttemptPresent', 'apply-attempt.json'), ('finiteAuthReadbackPresent', 'applied.json'),
                ('restoreAttemptPresent', 'original-auth-rollback-attempt.json'), ('originalAuthReadbackPresent', 'original-auth-rollback-restored.json'))}
            write(RESULTS / 'maintenance-auth-inside.json', {'phase': phase, 'requestKey': key,
                  'result': {'status': 'MAINTENANCE_AUTH_INSIDE_UNCONFIRMED_ORIGINAL_KEY_ONLY', 'progress': progress,
                             'safeCode': str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]+', str(error)) else type(error).__name__,
                             'sqlstate': None, 'sqlstateEvidence': 'NOT_CAPTURED_PRIVATE_SINGLE_USER_CHANNEL', 'automaticReplay': False}})
            return 2
        return 0
    def interrupted(*_):
        raise ValueError('MAINT_JOB_ROOT_INTERRUPTED_UNKNOWN_ORIGINAL_KEY_ONLY')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        result = host(job, a, modules['fresh35-production-carrier.py'], modules['prior_preserved38.py'], modules['root06_material.py'])
    except Exception as error:
        result = {'status': 'FINITE_AUTH_STEP_UNCONFIRMED_ORIGINAL_KEY_ONLY', 'requestKey': key, 'phase': phase,
                  'safeCode': str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]+', str(error)) else type(error).__name__,
                  'privateRecoveryBasisAndPartialStatePreserved': True, 'automaticReplay': False}
    write(job / 'results/maintenance-auth-result.json', result)
    return 0 if result['status'] == 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
