"""Read existing STOP36 evidence only; no PG, native program or job invocation."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, socket, stat, subprocess

B = Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C = Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
R = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
PREPARE = 't45-r3-final33-plan-prepare-20261116-02'
START = 't45-first-r3-native-service-start-20261116-36'
WRITER = 't45-r3-batched-real-execute-20261115-01'
SERVICE = {
    'serviceKey': START,
    'proofSha256': '1c2e696ca6708c438e93e917a2d6003fd579c5a777529c7a8fb43a4110461801',
    'containerId': '8f1705b2cdb8277170196bf9fd4132e59d0f639380385d5c5952ff2797eaf2e9',
    'containerStartedAt': '2026-11-16T21:21:12.05366201Z',
    'postmasterStart': '2026-11-16 21:21:13.328927+00',
}
EXPECTED_TERMINALS = {
    't45-r3-batched-install-20261116-02': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2',
    't45-r3-batched161-command-successor-20261116-01': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
    PREPARE: 'fb41bffdf48ee9447cf3f51653e0c3764e9e2f77ae1eb303d4a6dcf070177aac',
    WRITER: None,
}
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def take(path, owner=0):
    assert path.resolve() == path
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        s = os.fstat(f.fileno())
        assert stat.S_ISREG(s.st_mode) and s.st_uid == owner and s.st_nlink == 1
        assert not s.st_mode & 0o022 and 0 < s.st_size <= 65536
        raw = f.read(65537)
        ident = lambda z: (z.st_dev, z.st_ino, z.st_uid, z.st_gid, z.st_mode,
                           z.st_nlink, z.st_size, z.st_mtime_ns, z.st_ctime_ns)
        assert len(raw) == s.st_size and ident(s) == ident(os.fstat(f.fileno())) == ident(path.lstat())
    return raw


def main():
    assert os.getuid() == os.geteuid() == 0 and socket.gethostname() == 'naijue-server'
    proof_raw = take(R / 'authority/fresh35-current-production-service-v2-service-36.json')
    assert sha(proof_raw) == SERVICE['proofSha256']
    proof = json.loads(proof_raw)
    birth = proof['sharedPostgresNamespace']['container']
    observed_service = dict(serviceKey=proof['requestKey'], proofSha256=sha(proof_raw),
                            containerId=birth['id'], containerStartedAt=birth['startedAt'],
                            postmasterStart=proof['physical']['postmasterStart'])
    assert observed_service == SERVICE
    assert proof['physical'] == dict(databaseOid='16393', postmasterStart=SERVICE['postmasterStart'],
                                    serverVersionNum='170011', systemIdentifier='7706545564479176741')
    base = R / 'state'
    data = base / R.name / 'data'
    ds = data.lstat()
    identity = dict(device=ds.st_dev, inode=ds.st_ino, uid=ds.st_uid, gid=ds.st_gid,
                    mode=stat.S_IMODE(ds.st_mode))
    assert data.resolve() == data and stat.S_ISDIR(ds.st_mode)
    assert identity == proof['dataDirectoryIdentity'] == dict(device=66304, inode=13502421,
                                                             uid=61035, gid=61035, mode=0o700)
    ack_raw = take(base / 'native-services' / START / 'retained-ack.json')
    assert json.loads(ack_raw) == dict(requestKey=START, proofSha256=SERVICE['proofSha256'],
                                      serviceLeaseExpiresAt=proof['sharedPostgresNamespace']['serviceLeaseExpiresAt'])
    assert json.loads(take(base / 'native-services' / START / 'carrier-birth.json')) == birth
    fmt = ('{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
           '"startedAt":{{json .State.StartedAt}},"image":{{json .Image}},'
           '"operation":{{json (index .Config.Labels "t45.operation")}}}')
    q = subprocess.run(['/usr/bin/docker', 'inspect', '--format', fmt, birth['id']],
                       capture_output=True, check=True, timeout=5)
    assert not q.stderr and len(q.stdout) <= 4096
    container = json.loads(q.stdout)
    assert container == dict(id=birth['id'], running=True, pid=birth['hostPid'],
                             startedAt=birth['startedAt'], image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',
                             operation=START)
    units = subprocess.run(['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain',
                            '--state=active,activating,deactivating',
                            'naijue-erp-op-b16447fb-*.service', 'naijue-erp-op-5cc58239-*.service'],
                           capture_output=True, check=True, timeout=5)
    assert not units.stderr
    active = [row.split()[0] for row in units.stdout.decode().splitlines() if row.strip()]
    terminals, states, absences = {}, {}, {}
    for key, expected in EXPECTED_TERMINALS.items():
        if expected is not None:
            raw = take(B / 'jobs' / key / 'r3-outer-terminal.json')
            assert sha(raw) == expected and raw == take(C / 'results' / (key + '.json'), 1000)
            value = json.loads(raw)
            required = ('FAILED', 2) if key == PREPARE else ('COMPLETED', 0)
            assert value['jobId'] == key and value.get('finishedAtUTC')
            assert (value['status'], value['exitCode']) == required
            terminals[key] = sha(raw)
            states[key] = dict(status=value['status'], exitCode=value['exitCode'], terminalSha256=sha(raw))
        else:
            facts = {}
            for grant in ('b16447fbc81f4d64', '5cc58239751e4e2a'):
                worker, control = B.with_name('grant-' + grant), C.with_name('grant-' + grant)
                for name, path in {'workerJob': worker / 'jobs' / key,
                                   'controlJob': control / 'jobs' / key,
                                   'request': control / 'requests' / (key + '.json'),
                                   'pendingRequest': control / 'requests' / (key + '.tmp'),
                                   'publicResult': control / 'results' / (key + '.json')}.items():
                    facts[grant + '/' + name] = os.path.lexists(path)
            assert not any(facts.values())
            terminals[key], states[key], absences[key] = None, {'state': 'NOT_SUBMITTED'}, facts
    assert terminals == EXPECTED_TERMINALS
    metadata = {}
    for leaf in ('real-first-20261110-r3/reports/' + PREPARE,
                 'real-first-20261110-r3/reports/' + PREPARE + '/batched-plan.sqlite',
                 'real-first-20261110-r3/reports/' + PREPARE + '/original-initializer.json',
                 'final33-private/' + PREPARE + '/scratch',
                 'native-services/' + START + '/authority-61035/fresh35-batched-preparation-v1.json'):
        path = base / leaf
        item = {'exists': os.path.lexists(path)}
        if item['exists']:
            s = path.lstat()
            assert path.resolve() == path
            item.update(uid=s.st_uid, gid=s.st_gid, mode=stat.S_IMODE(s.st_mode),
                        bytes=s.st_size, directory=stat.S_ISDIR(s.st_mode))
            if leaf.endswith('/scratch'):
                item['empty'] = not any(path.iterdir())
        metadata[leaf] = item
    bq = subprocess.run(['/usr/bin/systemctl', 'list-units', '--no-legend', '--plain', '--type=service',
                         '--state=active,activating,deactivating', '*naijue*backup*', '*naijue*capture*'],
                        capture_output=True, check=True, timeout=5)
    assert not bq.stderr
    backup_units = [row.split()[0] for row in bq.stdout.decode().splitlines() if row.strip()]
    pq = subprocess.run(['/bin/ps', '-eo', 'comm='], capture_output=True, check=True, timeout=5)
    assert not pq.stderr
    backup_names = [name.strip() for name in pq.stdout.decode().splitlines()
                    if name.strip() in ('pg_basebackup', 'pg_dump', 'pg_dumpall', 'pgbackrest', 'wal-g', 'barman')]
    fs = os.statvfs(R)
    free = fs.f_bavail * fs.f_frsize
    return dict(state='READONLY_ORIGINAL_FAILED_PREPARE02_STOP36_BASIS',
                checkedAtUTC=datetime.now(timezone.utc).isoformat(), serverOwnerVerified=True,
                exactService=observed_service, retainedAckSha256=sha(ack_raw), currentContainer=container,
                writerSettled=not active and states[WRITER].get('state') == 'NOT_SUBMITTED',
                writerUnsubmitted=states[WRITER].get('state') == 'NOT_SUBMITTED',
                currentBatchTerminals=terminals, currentBatchStates=states, originalKeyAbsences=absences,
                noOtherOperationUnits=not active, activeOperationUnits=active,
                backupNotActive=not backup_units and not backup_names,
                backupEvidence=dict(activeRelevantUnits=backup_units, runningBackupProgramNames=backup_names),
                pgdataPidAbsent=not os.path.lexists(data / 'postmaster.pid'),
                dataDirectoryIdentity=identity, metadataOnly=metadata, availableBytes=free,
                reserve28GiBSatisfied=free >= 28 * 1024**3, PGConnections=0, mutations=0,
                authenticationSnapshotBodiesOrDigestsRead=False, nativeOrDescribeOrJobExecuted=False)


if __name__ == '__main__':
    print(json.dumps(main(), sort_keys=True))
