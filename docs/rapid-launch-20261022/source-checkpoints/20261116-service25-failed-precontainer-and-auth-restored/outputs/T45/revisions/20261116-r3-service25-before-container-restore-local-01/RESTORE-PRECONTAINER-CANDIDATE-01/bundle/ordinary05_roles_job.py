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
PHASES = {'apply': ('t45-r3-ordinary25-auth-apply-20261116-01', 't45-r3-ordinary25-auth-apply-20261116-01'), 'restore': ('t45-r3-ordinary25-auth-restore-20261116-01', 't45-r3-ordinary25-auth-restore-20261116-01')}
STATIC_PINS = {
    'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
    'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5',
    'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73',
}
PRIOR_CID = 'f855a86b0eab87bc6ec273386e566c3b93c67f560d90392318edaa15b3a74187'
PRIOR_NAME = 't45-fresh35-first-production-20261110-r3-service-24'
CURRENT_NAME = 't45-fresh35-first-production-20261110-r3-service-25'
CURRENT_KEY = 't45-first-r3-native-service-start-20261116-25'
CURRENT_SOURCE = '3ea7979bd8e7a6ad69247331dad49b9c348c281df70733f0f64bd03b169df1dc'
CURRENT_PROOF_SOURCE = 'f2cd59a11222656b8697367abd20e790dbbc1ddd4edbadf838fe6584ceec446b'
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


def scope(phase):
    need(phase in PHASES, 'MAINT_JOB_FIXED_PHASE_REQUIRED')
    key, name = PHASES[phase]
    return {'format': 'T45_R3_ORDINARY05_FINITE_AUTH_ROOT_JOB_V1', 'phase': phase,
            'requestKey': key, 'containerName': name, 'imageId': IMAGE,
            'maximumOperationSeconds': 300, 'networkMode': 'none', 'hostPorts': [],
            'dataDirectoryDevice': 66304, 'dataDirectoryInode': 13502421,
            'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'}


def validate(a, phase, now):
    fixed = scope(phase)
    extra = {'startsAt', 'expiresAt', 'authorizationReference', 'independentReviewSha256',
             'rolesAuthoritySha256', 'rolesSourceSha256', 'hostSourceSha256'}
    if phase == 'restore':
        extra |= {'service', 'writerTerminalSha256', 'policySha256', 'stopRequestKey',
                  'stopTerminalSha256', 'stopResultSha256', 'stopCleanupSha256'}
    need(type(a) is dict and set(a) == set(fixed) | extra
         and all(a[k] == v for k, v in fixed.items()), 'MAINT_JOB_EXACT_EXTERNAL_SCOPE_REQUIRED')
    need(type(now) is int and type(a['startsAt']) is type(a['expiresAt']) is int
         and a['startsAt'] <= now and now + 300000 < a['expiresAt'] <= a['startsAt'] + 1800000,
         'MAINT_JOB_EXTERNAL_WINDOW_REQUIRED')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512
         and all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}', a[k]) for k in
                 ('independentReviewSha256', 'rolesAuthoritySha256', 'rolesSourceSha256', 'hostSourceSha256')),
         'MAINT_JOB_EXTERNAL_REVIEW_REQUIRED')


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
         and prior['Config']['Labels'].get('t45.operation') == 't45-first-r3-native-service-start-20261115-24'
         and not prior['State']['Running'] and prior['State']['Pid'] == 0
         and prior['State']['StartedAt']=='2026-11-15T15:21:17.835078029Z',
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
        result = (leaf.prepare if a['phase'] == 'apply' else leaf.restore)(factory.core, roles_raw, roles_pin)
        need(ops.read_file(normal.WORK / 'data/pg_hba.conf', 65536, True, False) == hba,
             'MAINT_JOB_ORIGINAL_HBA_CHANGED')
        write(RESULTS / 'maintenance-auth-inside.json', {'phase': a['phase'], 'requestKey': a['requestKey'], 'result': result})
    finally:
        signal.alarm(0)


def work_left(deadline, expires_at):
    return min(deadline - time.monotonic(), (expires_at - time.time_ns() // 1000000) / 1000
               - CLEANUP_RESERVE_SECONDS)


def host(job, a, ops):
    deadline = time.monotonic() + HOST_WORK_SECONDS
    original_stopped(a['phase'])
    control = ops.CONTROL.with_name('grant-b16447fbc81f4d64')
    prior_restore = 't45-r3-ordinary24-auth-restore-20261115-01'
    prior_boot = ROOT / 'state/native-services/t45-first-r3-native-service-start-20261115-24'
    stop_key = 't45-r3-ordinary24-preserve-stop-20261115-01'
    for path, pin in (
        (control / 'results' / (stop_key + '.json'), '0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39'),
        (control / 'jobs' / stop_key / 'results/normal05-preserve-stop-result.json', '69a6c160c867b4049555a91313a6e4b42cdc10f2584aaa0d221fed3b4ede7a88'),
        (prior_boot / 'cleanup.json', '6762749b456f83beecad3d318da73d037715bb6cf9a59c1f45f0a307a8fa801e'),
        (control / 'results' / (prior_restore + '.json'), '977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825'),
        (control / 'jobs' / prior_restore / 'results/maintenance-auth-result.json',
         '47c6e57b0b1cbcfa95e019e37b082d96989aa77c09aec76a64e983601b8a9dff'),
    ):
        need(sha(ops.read_file(path, 65536, False, False)) == pin,
             'MAINT_JOB_PREDECESSOR_STOP_OR_RESTORE_EVIDENCE_DIFFERS')
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
    pins = ('writerTerminalSha256','policySha256','stopRequestKey','stopTerminalSha256',
            'stopResultSha256','stopCleanupSha256')
    if a['service'] is None:
        if a['stopRequestKey'] == CURRENT_KEY:
            verify_failed_start_closed(ops, control, a)
            return
        need(all(a[k] is None for k in pins)
             and not any(present(p) for p in (control/'requests'/(CURRENT_KEY+'.json'),
                control/'requests'/(CURRENT_KEY+'.tmp'), control/'jobs'/CURRENT_KEY,
                control/'results'/(CURRENT_KEY+'.json'), WORKER/CURRENT_KEY,
                ROOT/'state/native-services'/CURRENT_KEY,
                ROOT/'authority/fresh35-current-production-service-v2-service-25.json')),
             'ORDINARY05_EARLY_RESTORE_ONLY_BEFORE_START')
        return
    s = a['service']
    need(type(s) is dict and set(s) == {'serviceKey','proofSha256','containerId',
         'containerStartedAt','postmasterStart'} and s['serviceKey'] == CURRENT_KEY
         and all(re.fullmatch('[a-f0-9]{64}',s[k]) for k in ('proofSha256','containerId')),
         'ORDINARY05_RESTORE_SERVICE_SCOPE_REQUIRED')
    stop = a['stopRequestKey']
    is_preserve = stop == 't45-r3-ordinary25-preserve-stop-20261116-01'
    need(type(stop) is str and re.fullmatch('[a-z0-9][a-z0-9-]{0,70}',stop)
         and all(re.fullmatch('[a-f0-9]{64}',a[k]) for k in
                 ('stopTerminalSha256','stopResultSha256','stopCleanupSha256')),
         'ORDINARY05_RESTORE_STOP_SCOPE_REQUIRED')
    terminal_raw = ops.read_file(control/'results'/(stop+'.json'),65536,False,False)
    t = ops.strict(terminal_raw)
    need(sha(terminal_raw)==a['stopTerminalSha256']
         and (t['jobId'],t['taskId'],t['grantId'],t['status'],t['exitCode'])==
         (stop,'T45','b16447fbc81f4d64','COMPLETED',0),'ORDINARY05_RESTORE_STOP_TERMINAL_REQUIRED')
    name = 'normal05-preserve-stop-result.json' if is_preserve else 'normal05-stop-result.json'
    result_raw = ops.read_file(WORKER/stop/'results'/name,65536,True)
    r = ops.strict(result_raw)
    need(sha(result_raw)==a['stopResultSha256'] and r['requestKey']==stop
         and r['cleanupSha256']==a['stopCleanupSha256'],'ORDINARY05_RESTORE_STOP_RESULT_REQUIRED')
    if is_preserve:
        active = a['writerTerminalSha256'] is not None
        need(r['status']=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED'
             and r['service']==s and r['holdRetained'] is active and r['businessAdvanced'] is False
             and r['writerTerminalSha256']==a['writerTerminalSha256'],
             'ORDINARY05_RESTORE_PRESERVATION_REQUIRED')
        if active:
            need(re.fullmatch('[a-f0-9]{64}',a['policySha256'])
                 and ops.read_file(WORKER/stop/'r3-outer-terminal.json',65536,True)==terminal_raw,
                 'ORDINARY05_RESTORE_PROTECTED_STOP_TERMINAL_REQUIRED')
        else:
            need(a['policySha256'] is None and r['preserveMode']=='PRE_WRITER',
                 'ORDINARY05_RESTORE_PRE_WRITER_EVIDENCE_REQUIRED')
    else:
        need(r['status']=='NORMAL05_RETAINED_CLEAN_STOP_CONFIRMED'
             and r['serviceProofSha256']==s['proofSha256']
             and all(r[k]==s[k] for k in ('serviceKey','containerId','containerStartedAt','postmasterStart')),
             'ORDINARY05_RESTORE_NORMAL_STOP_REQUIRED')
    auth = ROOT/'authority'
    proof_raw = ops.read_file(auth/'fresh35-current-production-service-v2-service-25.json',65536)
    p = ops.strict(proof_raw)
    boot = ROOT/'state/native-services'/CURRENT_KEY
    clean_raw = ops.read_file(boot/'cleanup.json',65536,True)
    c = ops.strict(clean_raw)
    need(sha(proof_raw)==s['proofSha256'] and p['requestKey']==CURRENT_KEY
         and p['physical']['postmasterStart']==s['postmasterStart']
         and sha(clean_raw)==a['stopCleanupSha256'] and c['requestKey']==CURRENT_KEY
         and c['retained'] is True and c['runtimeMaterialPreserved'] is True
         and all(c['cleanup'].get(k) is True for k in
                 ('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),
         'ORDINARY05_RESTORE_ORIGINAL_PROOF_AND_CLEANUP_REQUIRED')
    b = inspect(s['containerId'])
    need(b['Name']=='/'+CURRENT_NAME and b['Id']==s['containerId'] and b['Image']==IMAGE
         and b['State']['StartedAt']==s['containerStartedAt'] and b['State']['Pid']==0
         and b['State']['Running'] is False and b['Config']['Labels'].get('t45.operation')==CURRENT_KEY,
         'ORDINARY05_RESTORE_EXACT_STOPPED_CONTAINER_REQUIRED')
    need(not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),
         'ORDINARY05_RESTORE_LISTENER_PRESENT')


def require_failed19_history(ops,control):
    root=WORKER.parent;hold=root/'r3-05-write-continuity'
    fixed=((hold/'policy.json','25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'),
           (hold/'active.json','0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8'),
           (hold/'bindings/writer.json','f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01'),
           (root/'jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json','ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'),
           (root/'jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json','c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a'))
    for path,pin in fixed:
        need(sha(ops.read_file(path,65536,True))==pin,'ORDINARY20_ORIGINAL_FAILED19_HISTORY_CHANGED')

def verify_exact_failed25_before_container(ops, control, a):
    need(a['service'] is None and a['stopRequestKey']==CURRENT_KEY
         and a['writerTerminalSha256'] is None and a['policySha256'] is None
         and a['stopCleanupSha256'] is None
         and a['stopTerminalSha256']=='79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738'
         and a['stopResultSha256']=='c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be',
         'ORDINARY25_EXACT_BEFORE_CONTAINER_RESTORE_SCOPE_REQUIRED')
    require_failed19_history(ops,control)
    terminal=ops.read_file(WORKER/CURRENT_KEY/'r3-outer-terminal.json',65536,True)
    public=ops.read_file(control/'results'/(CURRENT_KEY+'.json'),65536,False,False)
    t=ops.strict(terminal)
    need(sha(terminal)==a['stopTerminalSha256'] and terminal==public
         and (t['jobId'],t['taskId'],t['grantId'],t['status'],t['exitCode'])==
         (CURRENT_KEY,'T45','b16447fbc81f4d64','FAILED',2), 'ORDINARY25_BEFORE_CONTAINER_TERMINAL_DIFFERS')
    job=WORKER/CURRENT_KEY
    need(sha(ops.read_file(job/'manifest.json',65536,True))=='90c2b1759ec3f7255b2ec763884654f07e9f545a278d145a1e7734fc612f4187'
         and sha(ops.read_file(job/'bundle/service-start-authorization.json',65536,True))==
             '33fd1f33f42fa4cbb8a3724fb4bedae65c1ce646404e56997db9c69a6d1a41d3',
         'ORDINARY25_FAILED_START_MANIFEST_OR_AUTHORITY_DIFFERS')
    request=ops.strict(ops.read_file(control/'requests'/(CURRENT_KEY+'.json'),65536,False,False))
    need(request['jobId']==CURRENT_KEY and request['taskId']=='T45' and request['grantId']=='b16447fbc81f4d64'
         and request['script']=='normal_service05_after08.py'
         and request['args']==['33fd1f33f42fa4cbb8a3724fb4bedae65c1ce646404e56997db9c69a6d1a41d3']
         and request['manifestSha256']=='6dd9be96cd577b12fe660ccbf6e80435dce71ca63ba9b947f1d2e6c2fa220b18',
         'ORDINARY25_FAILED_START_ORIGINAL_REQUEST_DIFFERS')
    raw=ops.read_file(job/'results/normal-service-result.json',65536,True)
    published=ops.read_file(control/'jobs'/CURRENT_KEY/'results/normal-service-result.json',65536,False,False)
    need(sha(raw)==a['stopResultSha256']
         and sha(published)=='10afe3a1ffe08b295773a9277fd3949b4752159a682c05e63f92f466ca66a896'
         and ops.strict(raw)==ops.strict(published)=={'automaticRetry':False,'requestKey':CURRENT_KEY,
             'safeCode':'NORMAL_NEW_PRIVATE_SOURCE_DIFFERS','status':'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'},
         'ORDINARY25_BEFORE_CONTAINER_RESULT_DIFFERS')
    pins={'normal_service05_after08.py':'3ea7979bd8e7a6ad69247331dad49b9c348c281df70733f0f64bd03b169df1dc',
          'normal_service05_after08_proof.py':'f2cd59a11222656b8697367abd20e790dbbc1ddd4edbadf838fe6584ceec446b',
          'fresh35-production-carrier.py':'40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
          'r3_05_readonly.py':'521af9e82cdde7cc878986dd8181dc7c2b14debad18aad1af79bf3bc334e0445'}
    for name,pin in pins.items():
        need(sha(ops.read_file(job/'bundle'/name,262144,True))==pin,'ORDINARY25_BEFORE_CONTAINER_SOURCE_DIFFERS')
    boot=ROOT/'state/native-services'/CURRENT_KEY
    st=boot.lstat()
    need(stat.S_ISDIR(st.st_mode) and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(0,0,0o700)
         and boot.resolve()==boot and set(x.name for x in boot.iterdir())==set(pins)-{'r3_05_readonly.py'},
         'ORDINARY25_BEFORE_CONTAINER_BOOT_DIFFERS')
    for name in set(pins)-{'r3_05_readonly.py'}:
        need(sha(ops.read_file(boot/name,262144,True))==pins[name],'ORDINARY25_PARTIAL_BOOT_SOURCE_DIFFERS')
    need(not any(present(p) for p in (job/'results/normal-service-intent.json',
         job/'results/normal-service-incomplete.json',ROOT/'authority/fresh35-current-production-service-v2-service-25.json',
         ROOT/'state/fresh35-first-production-20261110-r3/data/postmaster.pid')),
         'ORDINARY25_BEFORE_CONTAINER_START_EVIDENCE_PRESENT')
    need(not command(['docker','ps','-a','--no-trunc','--filter','label=t45.operation='+CURRENT_KEY,'--format','{{.ID}}'],5).strip()
         and not command(['docker','ps','-a','--no-trunc','--filter','name=^/'+CURRENT_NAME+'$','--format','{{.ID}}'],5).strip()
         and not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),
         'ORDINARY25_BEFORE_CONTAINER_PROCESS_OR_PORT_PRESENT')
    need(not command(['/usr/bin/systemctl','list-units','--no-legend','--plain',
         '--state=active,activating,deactivating','naijue-erp-op-b16447fb-9ef232981f33.service'],5).strip(),
         'ORDINARY25_FAILED_START_UNIT_STILL_ACTIVE')
    own_unit='naijue-erp-op-b16447fb-'+sha(a['requestKey'].encode())[:12]+'.service'
    active=command(['/usr/bin/systemctl','list-units','--no-legend','--plain',
         '--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service',
         'naijue-erp-op-5cc58239-*.service'],5).decode().splitlines()
    need(all(line.split()[0]==own_unit for line in active if line.strip()),
         'ORDINARY25_OTHER_OPERATION_ACTIVE')


def verify_failed_start_closed(ops, control, a):
    if a['stopCleanupSha256'] is None:
        verify_exact_failed25_before_container(ops,control,a)
        return
    need(a['writerTerminalSha256'] is None and a['policySha256'] is None
         and all(re.fullmatch('[a-f0-9]{64}',a[k]) for k in
                 ('stopTerminalSha256','stopResultSha256','stopCleanupSha256')),
         'ORDINARY05_FAILED_START_EXACT_PINS_REQUIRED')
    require_failed19_history(ops,control)
    terminal = ops.read_file(control/'results'/(CURRENT_KEY+'.json'),65536,False,False)
    t = ops.strict(terminal)
    need(sha(terminal)==a['stopTerminalSha256'] and
         (t['jobId'],t['taskId'],t['grantId'],t['status'],t['exitCode'])==
         (CURRENT_KEY,'T45','b16447fbc81f4d64','FAILED',2),
         'ORDINARY05_FAILED_START_TERMINAL_REQUIRED')
    source = WORKER/CURRENT_KEY/'bundle'
    need(sha(ops.read_file(source/'normal_service05_after08.py',65536,True))==CURRENT_SOURCE
         and sha(ops.read_file(source/'normal_service05_after08_proof.py',65536,True))==CURRENT_PROOF_SOURCE,
         'ORDINARY05_FAILED_START_SOURCE_DIFFERS')
    root = WORKER/CURRENT_KEY/'results'
    raw = ops.read_file(root/'normal-service-incomplete.json',65536,True)
    r = ops.strict(raw)
    need(sha(raw)==a['stopResultSha256'] and r['requestKey']==CURRENT_KEY
         and r['confirmed'] is True and r['containerStopped'] is True and r['pid']==0
         and r['originalKeyOnly'] is True and r['automaticRetry'] is False
         and r['runtimeMaterialPreserved'] is True,
         'ORDINARY05_FAILED_START_CLEAN_STOP_RECEIPT_REQUIRED')
    boot = ROOT/'state/native-services'/CURRENT_KEY
    clean = ops.read_file(boot/'cleanup.json',65536,True)
    x = ops.strict(clean)
    need(sha(clean)==a['stopCleanupSha256']==r['cleanStop']['cleanupSha256']
         and x['requestKey']==CURRENT_KEY and x['runtimeMaterialPreserved'] is True
         and all(x['cleanup'].get(k) is True for k in
                 ('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent'))
         and not present(boot/'retained-ack.json'), 'ORDINARY05_FAILED_START_GUARDIAN_CLEANUP_REQUIRED')
    b = inspect(r['cid'])
    birth = ops.strict(ops.read_file(boot/'carrier-birth.json',65536,True))
    need(b['Id']==r['cid']==birth['id'] and b['Name']=='/'+CURRENT_NAME and b['Image']==IMAGE
         and b['Config']['Labels'].get('t45.operation')==CURRENT_KEY
         and b['State']['StartedAt']==birth['startedAt'] and b['State']['Pid']==0
         and b['State']['Running'] is False
         and not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),
         'ORDINARY05_FAILED_START_EXACT_STOPPED_CONTAINER_REQUIRED')


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
    modules['ordinary05_roles.py'].validate(role_authority, time.time_ns() // 1000000, phase == 'restore')
    need(role_authority['rolesSourceSha256'] == a['rolesSourceSha256'], 'MAINT_JOB_ROLE_SOURCE_BINDING_DIFFERS')
    if internal:
        try:
            inside(base, a, roles_raw, a['rolesAuthoritySha256'], modules['fresh35-production-carrier.py'],
                   modules['normal_service04.py'], modules['normal_service04_proof.py'], modules['ordinary05_roles.py'])
        except Exception as error:
            leaf = modules['ordinary05_roles.py']
            progress = {key: os.path.lexists(leaf.CUSTODY / name) for key, name in (
                ('originalRecoveryBasisPresent', 'original-auth.json'), ('finiteAuthBasisPresent', 'finite-auth.json'),
                ('applyAttemptPresent', 'apply-attempt.json'), ('finiteAuthReadbackPresent', 'applied.json'),
                ('restoreAttemptPresent', 'restore-attempt.json'), ('originalAuthReadbackPresent', 'restored.json'))}
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
        result = host(job, a, modules['fresh35-production-carrier.py'])
    except Exception as error:
        result = {'status': 'FINITE_AUTH_STEP_UNCONFIRMED_ORIGINAL_KEY_ONLY', 'requestKey': key, 'phase': phase,
                  'safeCode': str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]+', str(error)) else type(error).__name__,
                  'privateRecoveryBasisAndPartialStatePreserved': True, 'automaticReplay': False}
    write(job / 'results/maintenance-auth-result.json', result)
    return 0 if result['status'] == 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED' else 2


if __name__ == '__main__':
    raise SystemExit(main())
