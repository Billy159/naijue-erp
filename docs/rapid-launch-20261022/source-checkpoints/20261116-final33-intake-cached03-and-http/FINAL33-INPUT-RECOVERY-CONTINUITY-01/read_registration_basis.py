"""Read metadata after exact prior withdrawal; no source/role/data writes."""
from pathlib import Path
import hashlib,json,os,stat,subprocess,time
def need(ok, code):
    if not ok:
        raise ValueError('FINAL33_INPUT_REGISTRATION_' + code)

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
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
GRANT='b16447fbc81f4d64'
BASIS={'/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': '5094e41828fafad55af2715e0523ce5656787b87699ccbcff1a336910bf7939e', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct32_batched.py': '4ff1a618c2e10c2119a16bd19a621d3c0c48a3ba92fe01229baec809fbb29316', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py': '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py': '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input.py': '4441d264213d5abf3c2c4af1a56d7df0bd275f0a4587e66c1e1bf156c0793d3f', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/active.json': '0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/policy.json': '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct32-batched-real.json': '99ea865df185eef2cd1c01cc9303d5c08e9bd8d90202c8b9557b5723820fac6a'}
LOCK=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/execution.lock')
quiet()
actual={};identities={};mismatches=[]
for text,pin in BASIS.items():
 path=Path(text);raw,meta=read(path);actual[text]=hashlib.sha256(raw).hexdigest();identities[text]=meta
 if actual[text]!=pin:mismatches.append(text)
identities['executionLock']=identity(LOCK.lstat())
grant=json.loads(read(P/'grant.json')[0])
print(json.dumps({'state':'READONLY_FINAL33_INPUT_RECOVERY_REGISTRATION_BASIS','checkedAtMs':time.time_ns()//1000000,'oldIdentities':identities,'actualPins':actual,'basisMismatches':mismatches,'grantExpiresAtEpoch':grant['expiresAtEpoch'],'candidatePaths':{p:os.path.lexists(Path(p))for p in ['/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-final33-input-recovery-registration-cas-20261116-01', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_recovery.py', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception-recovery.json', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/.final33-input-recovery-dispatcher.pending']},'postgresConnections':0,'writes':0},sort_keys=True))
