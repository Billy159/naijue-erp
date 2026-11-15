"""Stop only the recorded 05 generation after a terminal writer and retain its hold."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import sys
import time


KEY = 't45-r3-ordinary27-preserve-stop-20261116-01'
WRITER = 't45-first-20261110-r3-real-execute-20261114-02'
GRANT = 'b16447fbc81f4d64'
ROOT = Path('/root/erp-release-20261006-01-worker/grant-' + GRANT)
CONTROL = Path('/home/naijue/erp-release-20261006-01-control/grant-' + GRANT)
JOB = ROOT / 'jobs' / KEY
HOLD = ROOT / 'r3-05-write-continuity'
STOP_REFERENCE = '9c0a617bb75a5c8ce12d78c09ad312094e19ee006489f207be3bf1ab7229e213'
SERVICE_KEY = 't45-first-r3-native-service-start-20261116-27'
SERVICE_FIELDS = {'serviceKey', 'proofSha256', 'containerId', 'containerStartedAt', 'postmasterStart'}
TERMINALS = {'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'}
CURRENT_BATCH_OPERATIONS = ('t45-r3-batched-install-20261115-01', 't45-r3-batched-real-execute-20261115-01')
DIGEST = re.compile('[0-9a-f]{64}')


def need(condition, code):
    if not condition:
        raise ValueError(code)


def pin(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(meta):
    return (meta.st_dev, meta.st_ino, meta.st_uid, meta.st_gid, meta.st_mode,
            meta.st_nlink, meta.st_size, meta.st_mtime_ns, meta.st_ctime_ns)


def read(path, owner=0, maximum=65536, expected=None):
    need(path.resolve() == path, 'PRESERVE_FIXED_PATH_REQUIRED')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        s = os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid == owner and s.st_nlink == 1 and not s.st_mode & 0o022
             and 0 < s.st_size <= maximum, 'PRESERVE_FIXED_FILE_METADATA_REQUIRED')
        raw = f.read(maximum+1)
        need(len(raw) == s.st_size and identity(s) == identity(os.fstat(f.fileno())) == identity(path.lstat()),
             'PRESERVE_FILE_IDENTITY_CHANGED')
    need(expected is None or pin(raw) == expected, 'PRESERVE_FIXED_FILE_DIGEST_DIFFERS')
    return raw


def publish(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f, sort_keys=True)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())


def write_stop_intent(path, payload):
    need(path == JOB/'results/normal05-stop-intent.json', 'PRESERVE_EXACT_STOP_INTENT_REQUIRED')
    publish(path.with_name('normal05-preserve-stop-intent.json'), json.loads(payload))


def scope():
    return dict(format='T45_R3_FAILED19_READONLY20_SERVICE_STOP_V1', requestKey=KEY, writerJobId=WRITER)


def validate(a, now):
    fixed = scope()
    need(type(a) is dict and set(a) == set(fixed) | {'service', 'writerTerminalSha256',
         'policySha256', 'startsAt', 'expiresAt', 'authorizationReference', 'sourceSha256', 'currentBatchTerminals'}
         and all(a[k] == v for k,v in fixed.items()), 'PRESERVE_EXACT_AUTHORITY_REQUIRED')
    need(type(a['currentBatchTerminals']) is dict
         and set(a['currentBatchTerminals']) == set(CURRENT_BATCH_OPERATIONS)
         and all(v is None or type(v) is str and DIGEST.fullmatch(v)
                 for v in a['currentBatchTerminals'].values()), 'PRESERVE_CURRENT_BATCH_SCOPE_REQUIRED')
    service = a['service']
    need(type(service) is dict and service.keys() == SERVICE_FIELDS and service['serviceKey'] == SERVICE_KEY
         and all(DIGEST.fullmatch(service[k]) for k in ('proofSha256', 'containerId'))
         and DIGEST.fullmatch(a['sourceSha256'])
         and ((a['writerTerminalSha256'] is None and a['policySha256'] is None)
              or all(type(a[k]) is str and DIGEST.fullmatch(a[k])
                     for k in ('writerTerminalSha256', 'policySha256'))),
         'PRESERVE_EXACT_SERVICE_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is int
         and a['startsAt'] <= now < a['expiresAt'] <= a['startsAt'] + 300000
         and isinstance(a['authorizationReference'], str) and 0 < len(a['authorizationReference']) <= 512,
         'PRESERVE_FINITE_AUTHORITY_REQUIRED')


def confirmed_original_before_phase_refusal():
    old = 't45-first-20261110-r3-real-execute-20261113-01'
    terminal_sha = '3c37324ed46152a69f369afe789ecf428de6e313a69b2d4e666427ce9bcf581f'
    raw = read(CONTROL/'results'/(old+'.json'), 1000, expected=terminal_sha)
    value = json.loads(raw)
    need((value.get('jobId'),value.get('taskId'),value.get('grantId'),value.get('status'),
          value.get('exitCode'),value.get('errorCode')) ==
         (old,'T45',GRANT,'REFUSED_R3_CONTINUITY_BEFORE_PHASE',2,
          'R3_CONTINUITY_ORIGINAL_FROZEN_REQUEST_REQUIRED'),
         'PRESERVE_EXACT_ORIGINAL_BEFORE_PHASE_REFUSAL_REQUIRED')
    private = ROOT/'jobs'/old
    frozen = read(private/'request.json', expected='fd81bfd531dbdcd0233d97a5ab348e2d3a85ad429624935079b42ddcdeabca32')
    uploaded = read(CONTROL/'requests'/(old+'.json'),1000,
                    expected='b0447a885b6497f321de7a5e04629ee97921a56e25b14aaa0d47b8aa225350a4')
    need(json.loads(frozen)==json.loads(uploaded), 'PRESERVE_REFUSED_REQUEST_OBJECT_CHANGED')
    read(private/'bundle/bundle-manifest.json',expected='ff1ee40571001b3592f184952d0395dac17ff8bd2c72229ff717b7c28d71a2ac')
    read(private/'bundle/fresh35-production-carrier.py',maximum=262144,expected='efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4')
    real = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/real-first-20261110-r3')
    absent = [private/name for name in ('phase.private.log','r3-outer-terminal.json',
              'r3-continuity-failure.json','results/fresh35-production-real-05-result.json','results/writer-commit.json')]
    absent += [real/'nonroot-access'/old,real/'reports'/old]
    need(not any(map(os.path.lexists,absent)), 'PRESERVE_REFUSED_PHASE_ACTIVITY_PRESENT')
    need(pin(read(real/'nonroot-access-current.json'))=='11f4abf5ed504e1a16bb90171dd45b644e275851dfe083c6a11a8dfb00902bc9',
         'PRESERVE_EXACT_PREPARE09_RESTORED_POINTER_REQUIRED')
    unit = 'naijue-erp-op-'+GRANT[:8]+'-'+pin(old.encode())[:12]+'.service'
    q = subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain',
                        '--state=active,activating,deactivating',unit],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip(), 'PRESERVE_REFUSED_ORIGINAL_UNIT_STILL_ACTIVE')
    return {'status':'ORIGINAL_REQUEST_REFUSED_BEFORE_PHASE_NEW_OUTER_NEVER_SUBMITTED',
            'refusedOriginal':{'requestKey':old,'terminalSha256':terminal_sha,
             'status':value['status'],'errorCode':value['errorCode'],'phaseNeverStarted':True},
            'newOuterRequestKey':WRITER,'newOuterSubmitted':False}


def terminal_and_hold(a):
    if a['writerTerminalSha256'] is None:
        need(not os.path.lexists(HOLD / 'active.json'), 'PRESERVE_PREWRITER_HOLD_ALREADY_ACTIVE')
        for grant in (GRANT, '5cc58239751e4e2a'):
            c, w = CONTROL.with_name('grant-' + grant), ROOT.with_name('grant-' + grant)
            need(not any(os.path.lexists(p) for p in (c/'requests'/(WRITER+'.json'), c/'requests'/(WRITER+'.tmp'),
                c/'jobs'/WRITER, c/'results'/(WRITER+'.json'), w/'jobs'/WRITER)),
                'PRESERVE_PREWRITER_ORIGINAL_KEY_PRESENT')
        return confirmed_original_before_phase_refusal(), None
    root = read(ROOT / 'jobs' / WRITER / 'r3-outer-terminal.json', expected=a['writerTerminalSha256'])
    outer = read(CONTROL / 'results' / (WRITER + '.json'), 1000, expected=a['writerTerminalSha256'])
    value = json.loads(root)
    need(root == outer and value['jobId'] == WRITER and value['taskId'] == 'T45'
         and value['grantId'] == GRANT and value['status'] in TERMINALS and value.get('finishedAtUTC'),
         'PRESERVE_ORIGINAL_WRITER_TERMINAL_REQUIRED')
    policy = json.loads(read(HOLD / 'policy.json', expected=a['policySha256']))
    active = json.loads(read(HOLD / 'active.json'))
    need(policy['grantId'] == GRANT and policy['jobs']['writer'] == WRITER
         and policy['service'] == active['service']
         and policy['service']['serviceKey']=='t45-first-r3-native-service-start-20261114-19'
         and a['service']['serviceKey']==SERVICE_KEY
         and active['policySha256'] == a['policySha256']
         and policy['namespaceEvidenceSha256'] == active['namespaceEvidenceSha256'],
         'PRESERVE_ACTIVE_HOLD_REQUIRED')
    need(a['writerTerminalSha256']=='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'
         and a['policySha256']=='25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
         'PRESERVE_ORIGINAL_FAILED19_BINDING_REQUIRED')
    return value, active


def current_batch_terminals(a):
    observed = {}
    for key in CURRENT_BATCH_OPERATIONS:
        expected = a['currentBatchTerminals'][key]
        if expected is None:
            for grant in (GRANT, '5cc58239751e4e2a'):
                c, w = CONTROL.with_name('grant-' + grant), ROOT.with_name('grant-' + grant)
                need(not any(os.path.lexists(p) for p in (c/'requests'/(key+'.json'), c/'requests'/(key+'.tmp'),
                     c/'jobs'/key, c/'results'/(key+'.json'), w/'jobs'/key)),
                     'PRESERVE_CURRENT_OPERATION_ALREADY_PRESENT_OR_UNKNOWN')
            observed[key] = {'state': 'NOT_SUBMITTED'}
            continue
        raw = read(ROOT/'jobs'/key/'r3-outer-terminal.json', expected=expected)
        public = read(CONTROL/'results'/(key+'.json'), 1000, expected=expected)
        value = json.loads(raw)
        need(raw == public and value.get('jobId') == key and value.get('taskId') == 'T45'
             and value.get('grantId') == GRANT and value.get('status') in TERMINALS
             and value.get('finishedAtUTC'), 'PRESERVE_CURRENT_OPERATION_TERMINAL_REQUIRED')
        unit = 'naijue-erp-op-' + GRANT[:8] + '-' + pin(key.encode())[:12] + '.service'
        q = subprocess.run(['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain',
                            '--state=active,activating,deactivating', unit], capture_output=True, timeout=5)
        need(q.returncode == 0 and not q.stdout.strip(), 'PRESERVE_CURRENT_OPERATION_UNIT_STILL_ACTIVE')
        observed[key] = {'state': value['status'], 'terminalSha256': expected}
    return observed


def preservation_stop(a):
    need(a['writerTerminalSha256']=='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'
         and a['policySha256']=='25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757','PRESERVE_ORIGINAL_FAILED19_BINDING_REQUIRED')
    current = current_batch_terminals(a)
    terminal, active = terminal_and_hold(a)
    source = JOB / 'bundle/normal05_retained_stop.py'
    raw = read(source, expected=STOP_REFERENCE)
    original = runpy.run_path(str(source))
    target, boot = original['TARGET'], original['HOST_BOOT']
    service = a['service']
    proof = json.loads(read(target / 'authority' / original['PROOF_NAME'], expected=service['proofSha256']))
    birth = proof['sharedPostgresNamespace']['container']
    need(proof['requestKey'] == SERVICE_KEY == proof['sharedPostgresNamespace']['creationOperationId']
         and birth['id'] == service['containerId'] and birth['startedAt'] == service['containerStartedAt']
         and proof['physical']['postmasterStart'] == service['postmasterStart']
         and proof['physical']['systemIdentifier'] == '7706545564479176741'
         and proof['physical']['databaseOid'] == '16393', 'PRESERVE_EXACT_05_PROOF_REQUIRED')
    need(json.loads(read(boot / 'carrier-birth.json')) == birth
         and json.loads(read(boot / 'retained-ack.json')) == dict(requestKey=SERVICE_KEY,
         proofSha256=service['proofSha256'],
         serviceLeaseExpiresAt=proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']),
         'PRESERVE_ORIGINAL_05_ACK_REQUIRED')
    writer_unit = 'naijue-erp-op-' + GRANT[:8] + '-' + pin(WRITER.encode())[:12] + '.service'
    unit = original['run'](['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain',
                             '--state=active,activating,deactivating', writer_unit])
    need(not unit.strip(), 'PRESERVE_WRITER_UNIT_STILL_ACTIVE')
    running = original['run']([original['DOCKER'], 'inspect', '--type', 'container',
                               '--format', '{{.State.Running}}', birth['id']]).strip()
    need(running in (b'true', b'false'), 'PRESERVE_05_STATE_UNKNOWN')
    original['inspect_birth'](birth, running == b'true')
    cleanup_path = boot / 'cleanup.json'
    data = target / 'state' / target.name / 'data'
    need(original['data_identity'](data) == proof['dataDirectoryIdentity'], 'PRESERVE_ORIGINAL_PGDATA_REQUIRED')
    if running == b'true':
        # The proof stores PID values in the container's namespace.
        checker = """import json,os,sys
from pathlib import Path
g,p,network,live=json.loads(sys.argv[1])
ns=Path('/proc/self/ns/net').stat()
if (ns.st_dev,ns.st_ino)!=(network['device'],network['inode']):raise SystemExit(2)
rows={}
for d in Path('/proc').iterdir():
 if not d.name.isdecimal(): continue
 try:
  stat=(d/'stat').read_text()
  name=(d/'comm').read_text().strip()
 except FileNotFoundError: continue
 fields=stat.rsplit(')',1)[1].split()
 rows[int(d.name)]=(int(fields[1]),name,fields[19],fields[0])
def same(expected,uid):
 row=rows.get(expected['pid'])
 if row is None or row[2]!=expected['starttime']:return False
 d=Path('/proc')/str(expected['pid'])
 return d.stat().st_uid==uid and os.readlink(d/'exe')==expected['exe'] and row[3] not in ('Z','X')
def argv(pid):
 return (Path('/proc')/str(pid)/'cmdline').read_bytes().rstrip(bytes(1)).split(bytes(1))
def executable(pid,path):
 d=Path('/proc')/str(pid)
 return d.stat().st_uid==0 and os.readlink(d/'exe')==path
lifetime=argv(1)
if not executable(1,'/usr/bin/timeout') or len(lifetime)!=6 or lifetime[:3]!=[
 b'/usr/bin/timeout',b'--signal=TERM',b'--kill-after=3s'] or not lifetime[3].isdigit() or lifetime[4:]!=[
 b'/usr/bin/sleep',b'infinity'] or rows[1][3] in ('Z','X'):
 raise SystemExit(2)
allowed={1,os.getpid()}
sleeps=[i for i,(parent,name,_,state) in rows.items() if parent==1 and name=='sleep'
 and state not in ('Z','X') and executable(i,'/usr/bin/sleep') and argv(i)==[b'/usr/bin/sleep',b'infinity']]
if len(sleeps)!=1:raise SystemExit(2)
allowed.add(sleeps[0])
if live:
 if not same(g,0) or not same(p,61035) or rows[p['pid']][0]!=g['pid']:raise SystemExit(2)
 allowed.update((g['pid'],p['pid']))
elif any(rows.get(x['pid'],(None,None,None,None))[2]==x['starttime'] for x in (g,p)):
 raise SystemExit(2)
for i,(parent,name,_,state) in rows.items():
 if i not in allowed and not (live and parent==p['pid'] and name=='postgres' and state not in ('Z','X')):
  raise SystemExit(2)
"""
        def check_processes(live):
            original['run']([original['DOCKER'], 'exec', '-i', '--user', '0:0', birth['id'],
                             '/usr/bin/python3', '-I', '-S', '-', json.dumps([
                                 proof['guardian'], proof['postmaster'], birth['networkNamespace'], live])],
                            data=checker.encode())

        live = not os.path.lexists(cleanup_path)
        check_processes(live)
        if live and os.path.lexists(cleanup_path):
            check_processes(False)
            live = False
    else:
        live = False
    if live:
        start = json.loads(read(boot / 'service-start-authorization.json'))
        context = dict(proofSha256=service['proofSha256'], retainedSha256=pin(read(boot/'service-retained.json')),
                       startAuthoritySha256=pin(read(boot/'service-start-authorization.json')),
                       birth=birth, workDeadline=proof['sharedPostgresNamespace']['serviceLeaseExpiresAt'],
                       expiresAt=min(a['expiresAt'], start['serviceLeaseExpiresAt']),
                       outerExpiresAt=start['serviceLeaseExpiresAt'], guardian=proof['guardian'],
                       postmaster=proof['postmaster'], dataIdentity=proof['dataDirectoryIdentity'])
        io = type('LocalStopIO', (), {'read': staticmethod(read), 'strict': staticmethod(json.loads),
                 'pack': staticmethod(lambda obj: (json.dumps(obj, sort_keys=True)+'\n').encode()),
                 'write_once': staticmethod(lambda path, payload: write_stop_intent(path, payload))})
        original['close_exact'](io, JOB, context, raw)
    else:
        clean = json.loads(read(cleanup_path))
        need(clean.get('requestKey') == SERVICE_KEY and clean.get('phase') == 'SERVICE_RETAINED'
             and clean.get('retained') is True and clean.get('runtimeMaterialPreserved') is True
             and clean.get('reason') in ('EXACT_GUARDIAN_STOP_REQUESTED', 'NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED')
             and all(clean['cleanup'].get(flag) is True for flag in original['CLEANUP_FLAGS'])
             and not os.path.lexists(data/'postmaster.pid'), 'PRESERVE_ORIGINAL_CLEANUP_REQUIRED')
        if running == b'true':
            original['run']([original['DOCKER'], 'stop', '--time', '5', birth['id']], seconds=10)
    original['inspect_birth'](birth, False)
    need(not os.path.lexists(data/'postmaster.pid') and original['data_identity'](data) == proof['dataDirectoryIdentity']
         and not original['run'](['/usr/bin/ss','-H','-ltn','sport = :56791']).strip(),
         'PRESERVE_ORIGINAL_CLEAN_STOP_UNCONFIRMED')
    need((not os.path.lexists(HOLD/'active.json') if active is None
          else json.loads(read(HOLD/'active.json')) == active), 'PRESERVE_ACTIVE_HOLD_CHANGED')
    result = dict(status='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED', service=service,
                writerTerminalSha256=a['writerTerminalSha256'], writerTerminalStatus=terminal['status'],
                cleanupSha256=pin(read(cleanup_path)), pgStopped=True, holdRetained=active is not None,
                preserveMode='PRE_WRITER' if active is None else 'ACTIVE_HOLD',
                businessAdvanced=False, originalKeyReplayed=False, currentBatchTerminals=current)
    if terminal.get('refusedOriginal'):
        result.update(refusedOriginal=terminal['refusedOriginal'],newOuterRequestKey=WRITER,newOuterSubmitted=False)
    return result


def main():
    need(sys.platform == 'linux' and os.getuid() == os.geteuid() == 0
         and os.environ.get('ERP_SHARED_TASK_ID') == 'T45' and os.environ.get('ERP_SHARED_JOB_DIR') == str(JOB)
         and Path(__file__) == JOB/'bundle/normal05_preserve_stop.py' and len(sys.argv) == 2,
         'PRESERVE_EXACT_ROOT_ENTRY_REQUIRED')
    a = json.loads(read(JOB/'bundle/normal05-preserve-stop-input.json', expected=sys.argv[1]))
    validate(a, time.time_ns()//1000000)
    need(pin(Path(__file__).read_bytes()) == a['sourceSha256'], 'PRESERVE_SOURCE_DIFFERS')
    out = dict(requestKey=KEY, status='NORMAL05_PRESERVATION_OUTCOME_UNKNOWN_ORIGINAL_KEY_ONLY')
    try:
        out.update(preservation_stop(a))
    except (OSError, ValueError, KeyError, TypeError) as error:
        message = str(error)
        out['safeCode'] = message if re.fullmatch(r'(PRESERVE|NORMAL05_STOP)_[A-Z0-9_]{1,100}', message) else type(error).__name__
    out['checkedAtUTC'] = datetime.now(timezone.utc).isoformat()
    publish(JOB/'results/normal05-preserve-stop-result.json', out)
    return 0 if out['status'] == 'NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED' else 2


if __name__ == '__main__':
    sys.exit(main())
