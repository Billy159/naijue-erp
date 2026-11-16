"""Existing original-lock CAS pattern, limited to final input receiver registration."""
from pathlib import Path
from types import ModuleType
import base64
import fcntl
import hashlib
import json
import os
import re
import socket
import stat
import subprocess
import sys
import time

GRANT = 'b16447fbc81f4d64'
B = Path('/root/erp-release-20261006-01-worker/grant-' + GRANT)
P = Path('/usr/local/lib/naijue-erp-night/grant-' + GRANT)
H = B / 'r3-05-write-continuity'
LOCK = B.with_name('grant-5cc58239751e4e2a') / 'execution.lock'
LOCK_ID = [66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
ENTRY = B / 'r3-final33-input-recovery-registration-source-20261116-01/register_cas.py'
AUDIT = B / 'r3-final33-input-recovery-registration-cas-20261116-01'
NEW_MODULE = P / 'r3_final33_input_recovery.py'
NEW_POLICY = H / 'final33-input-reception-recovery.json'
OLD_DISPATCHER = '5094e41828fafad55af2715e0523ce5656787b87699ccbcff1a336910bf7939e'
HELPER = '4ce801c947084c2d4870bac073cc85d844453d6b79e96129b065b94496e26722'
TEMPLATE = '9ba20e12d8ca7033dcc7dcf60dd6c52f7c3c83b497b843b65fc7d565c1721db3'
BASIS = {
    P / 'admin_exec.py': OLD_DISPATCHER,
    P / 'r3_direct32_batched.py': '4ff1a618c2e10c2119a16bd19a621d3c0c48a3ba92fe01229baec809fbb29316',
    P / 'r3_write_continuity.py': '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d',
    P / 'r3_failed19_readonly.py': '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e',
    P / 'r3_final33_input.py': '4441d264213d5abf3c2c4af1a56d7df0bd275f0a4587e66c1e1bf156c0793d3f',
    H / 'final33-input-reception.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
    H / 'active.json': '0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
    H / 'policy.json': '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
    H / 'direct32-batched-real.json': '99ea865df185eef2cd1c01cc9303d5c08e9bd8d90202c8b9557b5723820fac6a',
}


def need(ok, code):
    if not ok:
        raise ValueError('FINAL33_INPUT_REGISTRATION_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return time.time_ns() // 1000000


def pack(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read(path):
    need(path.resolve() == path, 'CANONICAL_FILE_REQUIRED')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_uid == before.st_gid == 0
             and before.st_nlink == 1 and not before.st_mode & 0o022
             and 0 < before.st_size <= 131072, 'PROTECTED_BOUNDED_FILE_REQUIRED')
        raw = stream.read(131073)
        need(len(raw) == before.st_size and identity(before) == identity(os.fstat(stream.fileno()))
             == identity(path.lstat()), 'FILE_CHANGED')
    return raw, identity(before)


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def put(path, raw, mode=0o600):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as stream:
        need(stream.write(raw) == len(raw), 'SHORT_WRITE')
        stream.flush()
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())
    sync(path.parent)


def scope():
    return dict(format='T45_FINAL33_INPUT_REGISTRATION_CAS_V1', grantId=GRANT,
                oldDispatcherSha256=OLD_DISPATCHER, newModuleSha256=HELPER,
                dispatcherTemplateSha256=TEMPLATE, newModulePath=str(NEW_MODULE),
                newPolicyPath=str(NEW_POLICY), publishOrder=['module', 'policy', 'dispatcher'],
                sourceRegistrationOnly=True, businessDatabaseWrites=0, oldHistoryChanged=False)


def render(files):
    need(set(files) == {'module', 'policy', 'dispatcherTemplate'}
         and sha(files['module']) == HELPER and sha(files['dispatcherTemplate']) == TEMPLATE
         and sha(files['policy']) == 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
         'REVIEWED_SOURCE_DIFFERS')
    needle = b"FINAL33_INPUT_POLICY_SHA256 = 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182'"
    need(files['dispatcherTemplate'].count(needle) == 1, 'EXACT_PLACEHOLDER_REQUIRED')
    result = files['dispatcherTemplate'].replace(needle,
              ('FINAL33_INPUT_POLICY_SHA256 = ' + repr(sha(files['policy']))).encode())
    compile(result, str(P / 'admin_exec.py'), 'exec')
    compile(files['module'], str(NEW_MODULE), 'exec')
    return result


def decode(packet, expected):
    need(set(packet) == {'authorization', 'files'}, 'EXACT_PACKET_REQUIRED')
    raw = base64.b64decode(packet['authorization'], validate=True)
    need(sha(raw) == expected, 'EXTERNAL_AUTHORITY_DIFFERS')
    a = json.loads(raw)
    fixed = scope()
    need(set(a) == set(fixed) | {'sourceSha256', 'sourcePins', 'oldIdentities', 'startsAt', 'expiresAt',
                               'authorizationReference', 'independentReviewSha256'}
         and all(a[key] == value for key, value in fixed.items())
         and type(a['startsAt']) is type(a['expiresAt']) is int
         and a['startsAt'] <= now() < now() + 30000 < a['expiresAt'] <= a['startsAt'] + 900000
         and a['sourceSha256'] == sha(read(Path(__file__))[0]), 'FINITE_EXACT_AUTHORITY_REQUIRED')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512
         and type(a['independentReviewSha256']) is str
         and re.fullmatch('[a-f0-9]{64}', a['independentReviewSha256']),
         'REVIEW_REFERENCE_REQUIRED')
    need(set(packet['files']) == set(a['sourcePins']) == {'module', 'policy', 'dispatcherTemplate'}
         and set(a['oldIdentities']) == {str(path) for path in BASIS} | {'executionLock'}, 'EXACT_INPUT_KEYS_REQUIRED')
    files = {key: base64.b64decode(value, validate=True) for key, value in packet['files'].items()}
    need(all(0 < len(data) <= 131072 and sha(data) == a['sourcePins'][key]
             for key, data in files.items()), 'EXACT_PACKET_BYTES_REQUIRED')
    render(files)
    return a, files, raw


def snapshot(a, dispatcher=OLD_DISPATCHER):
    for path, pin in BASIS.items():
        raw, meta = read(path)
        need(sha(raw) == (dispatcher if path == P / 'admin_exec.py' else pin)
             and (path == P / 'admin_exec.py' and dispatcher != OLD_DISPATCHER
                  or meta == a['oldIdentities'][str(path)]), 'ORIGINAL_BASIS_CHANGED')


def consumer(dispatcher, cfg, module_raw=None, policy_raw=None):
    wrapper = ModuleType('exact_input_dispatcher_readback')
    wrapper.__file__ = str(P / 'admin_exec.py')
    exec(compile(dispatcher, wrapper.__file__, 'exec'), wrapper.__dict__)
    core, hold = wrapper.r3_continuity(cfg)
    need(hold.__class__.__name__ == 'Original02AbsentContinuation', 'EXACT_ORIGINAL_CONTINUATION_REQUIRED')
    if module_raw:
        need(read(NEW_MODULE)[0] == module_raw and read(NEW_POLICY)[0] == policy_raw, 'INSTALLED_INPUT_BYTES_DIFFER')
        hold = wrapper.final33_input_continuation(core, hold, cfg)
        need(hold.__class__.__name__ == 'Final33InputContinuation', 'EXACT_INPUT_CONTINUATION_REQUIRED')
        hold.stopped_basis()
    return core, hold


def quiet():
    need(not os.path.lexists(P / 'artifact-staging-authorization.json'), 'PREVIOUS_INPUT_POLICY_NOT_WITHDRAWN')
    pgdata = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data')
    need(not os.path.lexists(pgdata / 'postmaster.pid'), 'DATABASE_NOT_STOPPED')
    writer = 't45-r3-batched-real-execute-20261115-01'
    for grant in (GRANT, '5cc58239751e4e2a'):
        b = B.with_name('grant-' + grant)
        c = Path('/home/naijue/erp-release-20261006-01-control/grant-' + grant)
        need(not any(os.path.lexists(path) for path in (b / 'jobs' / writer, c / 'jobs' / writer,
                 c / 'requests' / (writer + '.json'), c / 'requests' / (writer + '.tmp'),
                 c / 'results' / (writer + '.json'))), 'ORIGINAL_WRITER_PRESENT_READ_ORIGINAL_ONLY')
    result = subprocess.run(['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain',
        '--state=active,activating,deactivating', 'naijue-erp-op-b16447fb-*.service',
        'naijue-erp-op-5cc58239-*.service'], capture_output=True, timeout=5)
    need(result.returncode == 0 and not result.stdout.strip() and not result.stderr, 'ACTIVE_OPERATION_OR_UNKNOWN')


def register(a, files, authority):
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server', 'EXACT_ROOT_HOST_REQUIRED')
    need(not any(os.path.lexists(path) for path in (AUDIT, NEW_MODULE, NEW_POLICY,
             P / '.final33-input-recovery-dispatcher.pending')), 'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
    for folder in (B, P, H, LOCK.parent):
        for path in [*reversed(folder.parents), folder]:
            s = path.lstat()
            need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and s.st_uid == 0
                 and not s.st_mode & 0o022, 'PROTECTED_DIRECTORY_REQUIRED')
    with os.fdopen(os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW), 'r+b') as lock:
        need(identity(os.fstat(lock.fileno())) == a['oldIdentities']['executionLock'] == LOCK_ID, 'ORIGINAL_LOCK_CHANGED')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        snapshot(a)
        quiet()
        old = read(P / 'admin_exec.py')[0]
        cfg = json.loads(read(P / 'grant.json')[0])
        core, prior = consumer(old, cfg)
        policy = core.strict(files['policy'])
        need(read(H / 'final33-input-reception.json')[0] == files['policy']
             and policy['startsAt'] <= a['startsAt'] and now() + 1800000 < policy['expiresAt']
             <= int(cfg['expiresAtEpoch'] * 1000), 'EXACT_POLICY_WINDOW_REQUIRED')
        candidate = ModuleType('candidate_final33_input')
        exec(compile(files['module'], str(NEW_MODULE), 'exec'), candidate.__dict__)
        # Validate the exact policy through the real constructor before publishing it.
        original_read = core.read
        core.read = lambda path, **kw: files['policy'] if path == NEW_POLICY else original_read(path, **kw)
        try:
            candidate.Final33InputContinuation(core, prior, cfg, sha(files['policy'])).stopped_basis()
        finally:
            core.read = original_read
        new = render(files)
        need(now() + 30000 < a['expiresAt'], 'REGISTRATION_WINDOW_TOO_SHORT')
        AUDIT.mkdir(mode=0o700)
        sync(AUDIT.parent)
        put(AUDIT / 'authorization.json', authority)
        put(AUDIT / 'old-dispatcher.bin', old)
        put(AUDIT / 'old-identities.json', pack(a['oldIdentities']))
        result = dict(status='REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY', published=[],
                      automaticReplay=False, businessDatabaseWrites=0)
        try:
            put(NEW_MODULE, files['module'], 0o644)
            result['published'].append('module')
            snapshot(a)
            quiet()
            put(NEW_POLICY, files['policy'])
            result['published'].append('policy')
            consumer(new, cfg, files['module'], files['policy'])
            put(P / '.final33-input-recovery-dispatcher.pending', new, 0o755)
            snapshot(a)
            quiet()
            need(now() < a['expiresAt'], 'REGISTRATION_EXPIRED_BEFORE_CAS')
            put(AUDIT / 'publish-intent.json', pack(dict(oldDispatcherSha256=OLD_DISPATCHER,
                dispatcherSha256=sha(new), moduleSha256=HELPER, policySha256=sha(files['policy']))))
            os.replace(P / '.final33-input-recovery-dispatcher.pending', P / 'admin_exec.py')
            sync(P)
            result['published'].append('dispatcher')
            snapshot(a, sha(new))
            quiet()
            consumer(read(P / 'admin_exec.py')[0], cfg, files['module'], files['policy'])
            need(identity(os.fstat(lock.fileno())) == LOCK_ID, 'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_FINAL33_INPUT_RECEPTION_REGISTERED_NO_PHASE_SUBMITTED',
                          dispatcherSha256=sha(new), moduleSha256=HELPER, policySha256=sha(files['policy']),
                          oldHistoryPreserved=True, originalLockPreserved=True, phaseSubmitted=False)
        except BaseException as error:
            result['exceptionClass'] = type(error).__name__
            message = str(error)
            result['safeCode'] = message if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]{1,160}', message) else None
            try:
                result['observedDispatcherSha256'] = sha(read(P / 'admin_exec.py')[0])
            except Exception:
                result['observedDispatcherSha256'] = None
        put(AUDIT / 'result.json', pack(result))
        return result


if __name__ == '__main__':
    encoded = sys.stdin.buffer.read(1048577)
    need(0 < len(encoded) <= 1048576 and len(sys.argv) == 2, 'BOUNDED_ORIGINAL_STDIN_REQUIRED')
    approved, files, raw = decode(json.loads(encoded), sys.argv[1])
    outcome = register(approved, files, raw)
    print(json.dumps(outcome, sort_keys=True))
    raise SystemExit(0 if outcome['status'] == 'EXACT_FINAL33_INPUT_RECEPTION_REGISTERED_NO_PHASE_SUBMITTED' else 2)
