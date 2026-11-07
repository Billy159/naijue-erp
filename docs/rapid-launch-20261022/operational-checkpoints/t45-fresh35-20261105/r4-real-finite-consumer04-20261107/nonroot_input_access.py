"""Inert private ops seam. No main/CLI, authority, SQL, process, or automatic retry.
Caller must bind exact metadata plan and own/reap its Node before restoration.
"""
import os, stat, json, re
from pathlib import Path

UID = GID = 61035
RAW = Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1/phaseb-application-production-20261107-r2/state/real-r3/package')
ROOT = Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1/phaseb-application-production-20261107-r3')
REAL = ROOT/'state/real-r3'
PARAMS = ROOT/'authority/fresh35-installed-real-window-v1.json'
SMALL = {'controller-connection.json', 'initial-admin-scrypt.secret', 'initialize-admin.json', 'target.json'}

def need(ok, code):
    if not ok:
        raise ValueError(code)

def metadata(path):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), 'ACCESS_CANONICAL_PATH_REQUIRED')
    for parent in [*reversed(path.parents), path]:
        value = parent.lstat()
        need(not stat.S_ISLNK(value.st_mode) and not value.st_mode & 0o022, 'ACCESS_PATH_CHANGED')
    value = path.lstat()
    need(stat.S_ISDIR(value.st_mode) or stat.S_ISREG(value.st_mode), 'ACCESS_REGULAR_OR_DIRECTORY_REQUIRED')
    if stat.S_ISREG(value.st_mode):
        need(value.st_nlink == 1, 'ACCESS_SINGLE_LINK_REQUIRED')
    return {'device': value.st_dev, 'inode': value.st_ino, 'uid': value.st_uid,
            'gid': value.st_gid, 'mode': oct(stat.S_IMODE(value.st_mode)),
            'nlink': value.st_nlink, 'bytes': value.st_size, 'directory': stat.S_ISDIR(value.st_mode)}

def same_object(actual, expected, include_metadata=True):
    keys = ['device', 'inode', 'directory']
    if not actual['directory']:
        keys += ['nlink', 'bytes']
    if include_metadata:
        keys += ['uid', 'gid', 'mode']
    return all(actual[key] == expected[key] for key in keys)

def write_new(path, data, mode=0o600, owner=None, on_created=None):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        if on_created is not None:
            try:
                created = os.fstat(fd)
                on_created({'device':created.st_dev,'inode':created.st_ino})
            except BaseException:
                current = os.lstat(path)
                if (current.st_dev,current.st_ino)==(os.fstat(fd).st_dev,os.fstat(fd).st_ino):
                    os.unlink(path)
                raise
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
        if owner is not None:
            os.fchown(fd, *owner)
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)

def save(path, value):
    write_new(path, (json.dumps(value, sort_keys=True) + '\n').encode())

def allowed(path):
    return (path == RAW or path.is_relative_to(RAW) or
            path == PARAMS or path in [REAL, REAL/'approvals', REAL/'reports', REAL/'tmp', REAL/'sqlite-scratch'] or
            path.parent == REAL/'approvals')

def change(row, restoring=False):
    path = Path(row['before']['path'])
    before = {key: value for key, value in row['before'].items() if key not in ['path', 'contentRead']}
    expected = {**before, **row['after']}
    current = metadata(path)
    need(allowed(path), 'ACCESS_EXACT_SCOPE_REQUIRED')
    if restoring:
        need(same_object(current, before, include_metadata=False) and current['uid'] == before['uid'] and
             current['gid'] in [before['gid'], expected['gid']] and current['mode'] in [before['mode'], expected['mode']],
             'ACCESS_METADATA_CAS_DIFFERS')
    else:
        need(same_object(current, before), 'ACCESS_METADATA_CAS_DIFFERS')
    desired = before if restoring else row['after']
    flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if current['directory'] else 0)
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (current['device'], current['inode']), 'ACCESS_OPEN_IDENTITY_CHANGED')
        os.fchown(fd, desired['uid'], desired['gid'])
        os.fchmod(fd, int(desired['mode'], 8))
        os.fsync(fd)
    finally:
        os.close(fd)
    need(same_object(metadata(path), before if restoring else expected), 'ACCESS_READBACK_DIFFERS')

def prepare(plan, ledger, consumer, description_raw, access_raw, read):
    """Only after caller verifies C-bound exact plan hash. No cleanup inference."""
    need(os.getuid() == 0 and ledger.parent == REAL/'nonroot-access' and re.fullmatch(r't45-r4-real-(prepare|execute|inspect)-20261107-[0-9]{2}', ledger.name), 'ACCESS_ROOT_FIXED_LEDGER_REQUIRED')
    need(plan['status'] == 'PREPARATION_ONLY_NOT_EXECUTED' and len(plan['smallProjections']) == 4, 'ACCESS_EXACT_PLAN_REQUIRED')
    need(len(plan['changes']) == 45 and {x['source'].rsplit('/', 1)[-1] for x in plan['smallProjections']} == SMALL, 'ACCESS_EXACT_FINITE_INPUTS_REQUIRED')
    for row in plan['changes']:
        need(allowed(Path(row['before']['path'])) and row['before']['uid'] == row['after']['uid'] == 0, 'ACCESS_NO_UID_CHANGE')
        need(row['after']['gid'] == GID and row['after']['mode']==('0o640' if Path(row['before']['path'])==PARAMS else '0o710' if row['before']['directory'] else '0o440'), 'ACCESS_EXACT_READ_ONLY_MODES_REQUIRED')
        need(same_object(metadata(row['before']['path']), row['before']), 'ACCESS_PRECHECK_DIFFERS')
    if not ledger.parent.exists():
        ledger.parent.mkdir(mode=0o711)
    need(metadata(ledger.parent)['uid'] == 0 and metadata(ledger.parent)['mode'] == '0o711', 'ACCESS_LEDGER_PARENT_CHANGED')
    ledger.mkdir(mode=0o711)
    save(ledger/'before.json', plan)
    write_new(ledger/'description.json', description_raw)
    write_new(ledger/'access-plan.original.json', access_raw)
    previous=consumer.pointer_bytes(REAL,read)
    save(ledger/'previous-reference.json',{'bytes':previous.decode() if previous is not None else None})
    write_new(ledger/'real_access_consumer.py',Path(consumer.__file__).read_bytes(),0o600)
    before_reference=consumer.publish('before',plan,ledger,description_raw,access_raw,previous,read,save)
    for number, row in enumerate(plan['changes']):
        # Intent survives a transport loss between mutation and readback.
        save(ledger/('change-%02d-intent.json' % number), row)
        change(row)
        save(ledger/('change-%02d-done.json' % number), {'done': True,'metadata':consumer.meta(row['before']['path'])})
    projection_root = ledger/'worker'
    projection_root.mkdir(mode=0o711)
    private = projection_root/'private'
    private.mkdir(mode=0o700)
    os.chown(private, UID, GID)
    projected = []
    for number, row in enumerate(plan['smallProjections']):
        source = Path(row['source'])
        need(source.parent == REAL and source.name in SMALL, 'ACCESS_FIXED_SMALL_INPUT_REQUIRED')
        need(same_object(metadata(source), row['sourceMetadata']), 'ACCESS_PRIVATE_SOURCE_CHANGED')
        size = source.stat().st_size
        need(0 < size <= 65536, 'ACCESS_SMALL_PROJECTION_BOUND')
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            need((opened.st_dev, opened.st_ino) == (row['sourceMetadata']['device'], row['sourceMetadata']['inode']), 'ACCESS_PRIVATE_SOURCE_CHANGED')
            data = os.read(fd, size + 1)
            after = os.fstat(fd)
            need(len(data) == size and (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) ==
                 (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and same_object(metadata(source), row['sourceMetadata']),
                 'ACCESS_PRIVATE_SOURCE_CHANGED')
        finally:
            os.close(fd)
        secret = source.name in ['controller-connection.json', 'initial-admin-scrypt.secret']
        destination = (private if secret else projection_root)/source.name
        intent={'path':str(destination),'secret':secret,'maximumBytes':size}
        save(ledger/('projection-%02d-intent.json' % number),intent)
        def created(identity):save(ledger/('projection-%02d-created.json' % number),{**intent,**identity})
        write_new(destination, data, 0o600 if secret else 0o444, (UID, GID) if secret else None, on_created=created)
        del data
        projected.append({'path': str(destination), 'metadata': metadata(destination), 'secret': secret})
    save(ledger/'projected-metadata.json', projected)
    save(ledger/'prepared.json', {'state': 'FIXED_NONROOT_INPUTS_PREPARED_NOT_EXECUTED', 'uid': UID, 'gid': GID})
    consumer.publish('active',plan,ledger,description_raw,access_raw,before_reference,read,save)
    return projection_root

def restore(plan, ledger, child_reaped, consumer, read):
    """Exact caller lifecycle only; never infer database rollback from restoration."""
    need(os.getuid() == 0 and ledger.parent == REAL/'nonroot-access' and re.fullmatch(r't45-r4-real-(prepare|execute|inspect)-20261107-[0-9]{2}', ledger.name) and child_reaped is True, 'ACCESS_CHILD_REAP_REQUIRED')
    need(json.loads((ledger/'before.json').read_bytes()) == plan, 'ACCESS_ORIGINAL_LEDGER_PLAN_REQUIRED')
    if (ledger/'restored.json').exists():
        consumer.observe(REAL,RAW,read)
        return
    previous=consumer.pointer_bytes(REAL,read)
    reference=json.loads(previous)
    need(reference['requestKey']==ledger.name and reference['phase'] in ['before','active'] and read(ledger/(reference['phase']+'-reference-receipt.json'),65536,True)==previous,'ACCESS_RESTORE_REFERENCE_DIFFERS')
    before=json.loads(read(ledger/'before-metadata.json',131072,True))['entries']
    for number,row in enumerate(plan['changes']):
        path=row['before']['path']
        if not (Path(path)==RAW or Path(path).is_relative_to(RAW) or Path(path)==REAL/'approvals' or Path(path).parent==REAL/'approvals'):continue
        done=ledger/('change-%02d-done.json' % number)
        expected=json.loads(read(done,65536,True))['metadata'] if done.exists() else before[path]
        # An interrupted, unacknowledged mutation is retained as unknown.
        need(consumer.meta(path)==expected,'ACCESS_RESTORE_UNOBSERVED_METADATA_CHANGED')
    for number in reversed(range(len(plan['changes']))):
        row = plan['changes'][number]
        if not (ledger/('change-%02d-intent.json' % number)).exists():
            continue
        current = metadata(row['before']['path'])
        if same_object(current, row['before']):
            continue
        change(row, restoring=True)
    for number in range(4):
        proof=ledger/('projection-%02d-created.json' % number)
        if not proof.is_file():
            continue
        row=json.loads(proof.read_bytes())
        if not row['secret']:
            continue
        path=Path(row['path'])
        need(path.parent==ledger/'worker/private' and path.name in ['controller-connection.json','initial-admin-scrypt.secret'], 'ACCESS_EXACT_SECRET_RETIREMENT_PATH_REQUIRED')
        if path.exists() or path.is_symlink():
            value=path.lstat()
            need(stat.S_ISREG(value.st_mode) and not stat.S_ISLNK(value.st_mode) and value.st_nlink==1 and
                 (value.st_dev,value.st_ino)==(row['device'],row['inode']) and value.st_uid in [0,UID] and
                 value.st_gid in [0,GID] and stat.S_IMODE(value.st_mode)==0o600 and value.st_size<=row['maximumBytes'],
                 'ACCESS_PROJECTED_SECRET_CHANGED')
            os.unlink(path)
        retired=ledger/('projection-%02d-retired.json' % number)
        if not retired.exists():
            save(retired,{'state':'EXACT_CREATED_SECRET_ABSENT','device':row['device'],'inode':row['inode']})
    if (ledger/'restored.json').exists():
        return
    save(ledger/'restored.json', {'state': 'ORIGINAL_INPUT_METADATA_RESTORED', 'childReaped': True, 'transactionRollbackInferred': False})
    consumer.publish('restored',plan,ledger,read(ledger/'description.json',65536,True),read(ledger/'access-plan.original.json',65536,True),previous,read,save)
