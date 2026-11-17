"""Read exact current43 and preserved failed writer evidence only; no PG, native program or job invocation."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, socket, stat, subprocess

B = Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C = Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
R = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
PREPARE = 't45-r3-final33-plan-prepare-20261116-05'
START = 't45-first-r3-native-service-start-20261118-45'
WRITER = 't45-r3-batched-real-execute-20261115-01'
SERVICE = None
EXPECTED_TERMINALS = None
ROOT_PIN_BINDINGS = None
WRITER_TERMINAL_OUTCOME = None
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
    assert SERVICE is not None and EXPECTED_TERMINALS is not None and ROOT_PIN_BINDINGS is not None
    current_writer='t45-r3-batched-real-after44-execute-20261118-01'
    assert (EXPECTED_TERMINALS[current_writer]is None)==(WRITER_TERMINAL_OUTCOME is None)
    path=R/'authority/fresh35-current-production-service-v2-service-45.json';meta=path.lstat()
    assert path.resolve()==path and stat.S_ISREG(meta.st_mode)and meta.st_uid==meta.st_gid==0 and stat.S_IMODE(meta.st_mode)==0o444 and meta.st_nlink==1
    proof_raw = take(path)
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
    upgrade_unit='naijue-erp-op-b16447fb-'+sha(current_writer.encode())[:12]+'.service'
    assert upgrade_unit not in active
    terminals, states, absences = {}, {}, {}
    for key, expected in EXPECTED_TERMINALS.items():
        if expected is not None:
            raw = take(B / 'jobs' / key / 'r3-outer-terminal.json')
            assert sha(raw) == expected and raw == take(C / 'results' / (key + '.json'), 1000)
            value = json.loads(raw)
            assert value['jobId']==key and value['taskId']=='T45'and value['grantId']=='b16447fbc81f4d64'and value.get('finishedAtUTC')
            if key==current_writer:
                assert type(value['phaseStarted'])is bool
                assert value['status']in('COMPLETED','FAILED','INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY')or(value['status']in('REFUSED_D0_INTERLOCK_BEFORE_PHASE','REFUSED_R3_CONTINUITY_BEFORE_PHASE')and value['phaseStarted']is False and type(value['exitCode'])is int and value['exitCode']==2)
                assert tuple(value[k]for k in('status','exitCode','phaseStarted','finishedAtUTC'))==WRITER_TERMINAL_OUTCOME
            else:
                required=('FAILED',2)if key==WRITER else ('COMPLETED',0)
                assert(value['status'],value['exitCode'])==required
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
    installed = Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
    source_pins = {}
    for label, path, pin in [(label,Path(path),pin)for label,path,pin in ROOT_PIN_BINDINGS]:
        # The existing helper is larger than safe JSON receipts; it is pinned source, not secret data.
        if label=='helper':
            x=path.lstat();assert path.resolve()==path and stat.S_ISREG(x.st_mode) and x.st_uid==0 and not x.st_mode&0o022 and x.st_nlink==1 and 0<x.st_size<=131072
            body=path.read_bytes()
        else:body=take(path)
        assert sha(body)==pin;source_pins[label]=pin
    lock=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/execution.lock');z=lock.lstat()
    assert [z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]==[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
    native_public=take(B/'jobs'/WRITER/'results/final33-writer-result.json');assert sha(native_public)=='ad8746e056c391d9f9b7bd63728f53fecccb7a550c867cd47b0a443bfff70fb1'
    observed_native=json.loads(native_public);assert observed_native['state']=='ROLLED_BACK' and observed_native['nativeConnectionCleanup']=='CLOSED' and observed_native['nativeResultBindingMatched'] and observed_native['lifecycleConfirmed']
    assert all(observed_native['processCleanup'][k] for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))
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
    current_writer='t45-r3-batched-real-after44-execute-20261118-01'
    native_paths=[B/'jobs'/current_writer/'native-private',base/'final33-private'/current_writer,
                  base/'native-services'/START/'authority-61035/fresh35-compact-zero-execution-v2.json']
    upgrade_native_absence={str(path):not os.path.lexists(path)for path in native_paths}
    # Preserve actual projection metadata; a successful upgrade need not be absent.
    fs = os.statvfs(R)
    free = fs.f_bavail * fs.f_frsize
    return dict(state='READONLY_ORIGINAL_FAILED_WRITER_AND_CURRENT45_WRITER_STOP_BASIS',
                checkedAtUTC=datetime.now(timezone.utc).isoformat(), serverOwnerVerified=True,
                exactService=observed_service, retainedAckSha256=sha(ack_raw), currentContainer=container,
                writerSettled=not active and states[WRITER].get('status') == 'FAILED' and observed_native['nativeConnectionCleanup']=='CLOSED',
                writerUnsubmitted=states[WRITER].get('state') == 'NOT_SUBMITTED',
                currentWriterSettled=not active and WRITER_TERMINAL_OUTCOME is not None,
                currentWriterUnsubmitted=states[current_writer].get('state')=='NOT_SUBMITTED',
                currentWriterTerminalOutcome=WRITER_TERMINAL_OUTCOME,
                partialCommitStatus='NOT_CLASSIFIED_FROM_OUTER_STATUS',
                upgradeNativeProjectionPathAbsences=upgrade_native_absence,
                currentBatchTerminals=terminals, currentBatchStates=states, originalKeyAbsences=absences,
                activeSourcePins=source_pins, originalLockMatched=True,
                preservedNativeOutcome={k: observed_native.get(k) for k in ('state','nativeConnectionCleanup','nativeResultBindingMatched','lifecycleConfirmed','nativeResultSha256','processCleanup','failureDiagnostic','sqlstate','safeCode','verification','readbackConnectionCleanup')},
                noOtherOperationUnits=not active, activeOperationUnits=active,
                backupNotActive=not backup_units and not backup_names,
                backupEvidence=dict(activeRelevantUnits=backup_units, runningBackupProgramNames=backup_names),
                pgdataPidAbsent=not os.path.lexists(data / 'postmaster.pid'),
                dataDirectoryIdentity=identity, metadataOnly=metadata, availableBytes=free,
                reserve28GiBSatisfied=free >= 28 * 1024**3, PGConnections=0, mutations=0,
                authenticationSnapshotBodiesOrDigestsRead=False, nativeOrDescribeOrJobExecuted=False)


if __name__ == '__main__':
    print(json.dumps(main(), sort_keys=True))
