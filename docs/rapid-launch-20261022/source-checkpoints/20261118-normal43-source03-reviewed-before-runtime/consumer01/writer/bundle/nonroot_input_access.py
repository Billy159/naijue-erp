"""R3 05 profile specialization of the original nonroot access ledger."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

from r3_05_cli import APPROVALS, KEY, ROOT as CONTAINER_ROOT
from r3_05_runtime import BASELINE_SCOPE_DIRECTORY, BASELINE_SCOPE_SIDECARS, HOST_ROOT, MATERIALIZED, PROFILE_SHA, STATE_DEVICE

INSPECT_KEY = 't45-r3-original-transaction-inspect-20261114-01'
ROOT_UID = ORIGINAL_GID = 0
UID = GID = 61035
REAL = HOST_ROOT / 'state' / CONTAINER_ROOT.name
DIRECTORIES = ('package', 'package/tables', 'approvals', 'approvals/final-source-r7-r2', BASELINE_SCOPE_DIRECTORY)
ALIAS = 'approvals/final-source-r7-r2/registry.jsonl'
PRIMARY = 'package/registry.jsonl'
POINTER = 'nonroot-access-current.json'
PROBE_KEY = 't45-r3-ordinary19-preprepare-probes-20261114-01'
PREVIOUS_PROBE_KEY = 't45-r3-ordinary18-prepare08-postpreflight-diagnostic-20261114-02'
_PROBE_OWNER = False
PLAN_FORMAT = 'FRESH35_R3_COMPACT05_NONROOT_ACCESS_V1'
REFERENCE_FORMAT = 'REAL_ACCESS_METADATA_REFERENCE_V1'


def need(ok, code):
    if not ok:
        raise ValueError(code)


def encode(value):
    return (json.dumps(value, sort_keys=True) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def metadata(path):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), 'ACCESS_CANONICAL_PATH_REQUIRED')
    for parent in [*reversed(path.parents), path]:
        value = parent.lstat()
        need(not stat.S_ISLNK(value.st_mode) and not value.st_mode & 0o022, 'ACCESS_PATH_CHANGED')
    value = path.lstat()
    directory = stat.S_ISDIR(value.st_mode)
    need(directory or stat.S_ISREG(value.st_mode) and value.st_nlink == 1, 'ACCESS_REGULAR_OR_DIRECTORY_REQUIRED')
    result = {'device': value.st_dev, 'inode': value.st_ino, 'uid': value.st_uid,
              'gid': value.st_gid, 'mode': oct(stat.S_IMODE(value.st_mode)), 'directory': directory}
    if not directory:
        result.update(nlink=value.st_nlink, bytes=value.st_size, mtimeNs=value.st_mtime_ns, ctimeNs=value.st_ctime_ns)
    return result


def same_object(actual, expected, include_metadata=True):
    keys = ['device', 'inode', 'directory']
    if not actual['directory']:
        keys += ['nlink', 'bytes', 'mtimeNs']
    if include_metadata:
        keys += ['uid', 'gid', 'mode']
    return all(actual[k] == expected[k] for k in keys)


def syncdir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path, data, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())
    syncdir(path.parent)


def save(path, value):
    write_new(path, encode(value))


def read_json(path, read):
    return json.loads(read(path, 131072, True))


def require_no_acl(path_or_fd):
    if sys.platform == 'linux':
        names = os.listxattr(path_or_fd)
        need(not {'system.posix_acl_access','system.posix_acl_default'}.intersection(names),
             'ACCESS_EXISTING_ACL_SCOPE_UNBOUND')


def scope(raw, strict):
    need(sha(raw) == PROFILE_SHA, 'ACCESS_EXACT_MATERIALIZED_PROFILE_REQUIRED')
    profile = strict(raw)
    need(profile['targetHostRoot'] == str(HOST_ROOT) and profile['containerIntakeRoot'] == str(CONTAINER_ROOT)
         and HOST_ROOT/profile['materializedRelativePath'] == MATERIALIZED, 'ACCESS_EXACT_MATERIALIZED_TARGET_REQUIRED')
    files = {'package/'+row['relative_path']:row['bytes'] for row in profile['members']}
    approvals = {name:row['logicalBytes'] for row in profile['sidecars']
                 if (name := row['targetRelativePath']) in {'approvals/'+x for x in APPROVALS.values()}}
    baseline = {row['targetRelativePath']:row['logicalBytes'] for row in profile['sidecars']
                if row['targetRelativePath'] in BASELINE_SCOPE_SIDECARS}
    need(set(baseline) == set(BASELINE_SCOPE_SIDECARS), 'ACCESS_BASELINE_SCOPE_SIDECARS_REQUIRED')
    aliases = [row for row in profile['sidecars'] if 'sameInodeAs' in row]
    need(len(files) == 31 and len(approvals) == 6 and len(aliases) == 1
         and aliases[0]['targetRelativePath'] == ALIAS and aliases[0]['sameInodeAs'] == PRIMARY
         and files[PRIMARY] == aliases[0]['logicalBytes'], 'ACCESS_EXACT_FD_SCOPE_REQUIRED')
    files.update(approvals)
    files.update(baseline)
    need(all(type(size) is int and size >= 0 and Path(path).parent.as_posix() in DIRECTORIES
             for path, size in files.items()), 'ACCESS_EXACT_FD_SCOPE_REQUIRED')
    return files


def observe_scope(files):
    # Only the bind targets' intake ancestor is traversed by the worker.
    # The materializer's host-only parent and the unmounted 0-byte alias
    # placeholder never receive worker permissions.
    paths = {REAL: None}
    paths.update({MATERIALIZED/name: None for name in DIRECTORIES})
    paths.update({MATERIALIZED/name: size for name, size in files.items()})
    paths[MATERIALIZED/ALIAS] = 0
    entries = {}
    for path, size in paths.items():
        row = metadata(path)
        need(row['uid'] == ROOT_UID and row['directory'] == (size is None)
             and (size is None or row['bytes'] == size), 'ACCESS_EXACT_ORIGINAL_METADATA_REQUIRED')
        entries[str(path)] = row
    ids = {(v['device'],v['inode']) for v in entries.values()}
    need(len(ids) == len(entries) and {v['device'] for v in entries.values()} == {STATE_DEVICE},
         'ACCESS_EXACT_UNIQUE_SAME_VOLUME_REQUIRED')
    return entries


def make_plan(raw_profile, request_key, strict):
    match = ('', 'inspect') if request_key == INSPECT_KEY else ('', 'execute') if request_key == 't45-r3-batched-real-after42-execute-20261118-01' else KEY.fullmatch(request_key)
    need(match is not None and match[1] in ('prepare','execute','inspect'), 'ACCESS_EXACT_05_JOB_REQUIRED')
    entries = observe_scope(scope(raw_profile, strict))
    changes = []
    for path, before in entries.items():
        if path == str(MATERIALIZED/ALIAS):
            need((before['gid'],before['mode']) == (ORIGINAL_GID,'0o400'), 'ACCESS_ALIAS_PLACEHOLDER_CHANGED')
            continue
        if path == str(REAL):
            mode = int(before['mode'], 8)
            if mode & 0o001 or before['gid'] == GID and mode & 0o010:
                continue
            need(before['gid'] == ORIGINAL_GID and mode == 0o700, 'ACCESS_INTAKE_ANCESTOR_NOT_ORIGINAL')
            mode = '0o710'
        else:
            need((before['gid'],before['mode']) == (ORIGINAL_GID,'0o700' if before['directory'] else '0o400'),
                 'ACCESS_MATERIALIZED_MODE_NOT_ORIGINAL')
            mode = '0o750' if before['directory'] else '0o440'
        require_no_acl(path)
        changes.append({'before':dict(before,path=path),'after':{'uid':ROOT_UID,'gid':GID,'mode':mode}})
    return {'format':PLAN_FORMAT,'requestKey':request_key,'profileSha256':PROFILE_SHA,
            'entries':entries,'changes':changes}


def ledger_directory(request_key):
    return REAL/'nonroot-access'/request_key


def pointer(base, read):
    path = base/POINTER
    return read(path,65536,True) if os.path.lexists(path) else None


def publish(phase, ledger, plan, description_raw, access_raw, previous, read):
    entries = {path:metadata(path) for path in plan['entries']}
    frame = {'phase':phase,'requestKey':ledger.name,'accessPlanSha256':sha(access_raw),
             'descriptionSha256':sha(description_raw),'planLedgerSha256':sha(read(ledger/'before.json',131072,True)),
             'previousPointerSha256':sha(previous) if previous is not None else None,'entries':entries}
    frame_raw = encode(frame)
    write_new(ledger/(phase+'-metadata.json'),frame_raw)
    reference = {'format':REFERENCE_FORMAT,'requestKey':ledger.name,'phase':phase,
                 'ledgerSha256':sha(frame_raw),'previousPointerSha256':frame['previousPointerSha256']}
    raw = encode(reference)
    write_new(ledger/(phase+'-reference-receipt.json'),raw)
    need(pointer(REAL,read) == previous, 'ACCESS_OBSERVATION_PREDECESSOR_CHANGED')
    temp = ledger/(phase+'-reference.json')
    write_new(temp,raw)
    need(pointer(REAL,read) == previous, 'ACCESS_OBSERVATION_PREDECESSOR_CHANGED')
    os.replace(temp, REAL/POINTER)
    syncdir(REAL)
    need(pointer(REAL,read) == raw, 'ACCESS_OBSERVATION_REFERENCE_READBACK_DIFFERS')
    return raw


def reference(base, read):
    raw = pointer(base, read)
    if raw is None:
        return None, None, None
    ref = json.loads(raw)
    need(set(ref) == {'format','requestKey','phase','ledgerSha256','previousPointerSha256'}
         and ref['format'] == REFERENCE_FORMAT
         and (ref['requestKey'] == INSPECT_KEY or KEY.fullmatch(ref['requestKey']) is not None or
              ref['requestKey'] == 't45-first-20261110-r3-real-readback-20261114-21' and ref['phase'] == 'restored' or
              ref['requestKey'] == 't45-first-20261110-r3-real-readback-20261114-22' and ref['phase'] == 'restored' or
              ref['requestKey'] == 't45-first-20261110-r3-real-readback-20261114-22-03' and ref['phase'] == 'restored' or
              ref['requestKey'] == 't45-first-20261110-r3-real-readback-20261114-23-01' and ref['phase'] == 'restored' or
              ref['requestKey'] == PROBE_KEY and (_PROBE_OWNER or ref['phase'] == 'restored') or
              ref['requestKey'] == PREVIOUS_PROBE_KEY and ref['phase'] == 'restored')
         and ref['phase'] in ('before','active','restored'), 'ACCESS_OBSERVATION_REFERENCE_REQUIRED')
    ledger = base/'nonroot-access'/ref['requestKey']
    frame = read(ledger/(ref['phase']+'-metadata.json'),131072,True)
    need(sha(frame) == ref['ledgerSha256'] and raw == read(ledger/(ref['phase']+'-reference-receipt.json'),65536,True),
         'ACCESS_OBSERVATION_LEDGER_CHANGED')
    parsed = json.loads(frame)
    need((parsed['requestKey'],parsed['phase'],parsed['previousPointerSha256']) ==
         (ref['requestKey'],ref['phase'],ref['previousPointerSha256']), 'ACCESS_OBSERVATION_REFERENCE_DIFFERS')
    return raw, ledger, parsed


def change(row, restoring=False, *, expected_current=None):
    path = Path(row['before']['path'])
    before = {key: value for key, value in row['before'].items() if key != 'path'}
    current = metadata(path)
    expected = {**before, **row['after']}
    if restoring:
        need(current == expected_current and same_object(current, expected), 'ACCESS_METADATA_CAS_DIFFERS')
    else:
        need(current == before, 'ACCESS_METADATA_CAS_DIFFERS')
    desired = before if restoring else row['after']
    flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if current['directory'] else os.O_NONBLOCK)
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev,opened.st_ino,opened.st_uid,opened.st_gid,oct(stat.S_IMODE(opened.st_mode))) ==
             tuple(current[k] for k in ('device','inode','uid','gid','mode')), 'ACCESS_OPEN_IDENTITY_CHANGED')
        if not current['directory']:
            need((opened.st_nlink,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns) ==
                 tuple(current[k] for k in ('nlink','bytes','mtimeNs','ctimeNs')), 'ACCESS_OPEN_IDENTITY_CHANGED')
        require_no_acl(fd)
        os.fchown(fd, desired['uid'], desired['gid'])
        os.fchmod(fd, int(desired['mode'],8))
        os.fsync(fd)
    finally:
        os.close(fd)
    actual = metadata(path)
    need(same_object(actual, before if restoring else expected), 'ACCESS_READBACK_DIFFERS')
    return actual


def prepare(raw_profile, description_raw, access_raw, strict, read, current):
    need(os.getuid() == os.geteuid() == ROOT_UID, 'ACCESS_ROOT_FIXED_LEDGER_REQUIRED')
    description = strict(description_raw)
    key = description['requestKey']
    match = ('', 'inspect') if key == INSPECT_KEY else ('', 'execute') if key == 't45-r3-batched-real-after42-execute-20261118-01' else KEY.fullmatch(key)
    plan = strict(access_raw)
    need(match is not None and match[1].upper() == description['mode']
         and description['accessPlanSha256'] == sha(access_raw)
         and plan == make_plan(raw_profile,key,strict), 'ACCESS_EXACT_C_BOUND_PLAN_REQUIRED')
    ledger = ledger_directory(key)
    previous, prior_ledger, prior = reference(REAL,read)
    if prior is not None:
        need(prior['phase'] == 'restored' and read_json(prior_ledger/'restored.json',read)['childReaped'] is True,
             'ACCESS_PREVIOUS_LEDGER_NOT_RESTORED')
    current()
    if not ledger.parent.exists():
        ledger.parent.mkdir(mode=0o711)
        ledger.parent.chmod(0o711)
        syncdir(REAL)
    meta = metadata(ledger.parent)
    need(meta['uid'] == ROOT_UID and meta['directory'] and meta['mode'] == '0o711', 'ACCESS_LEDGER_PARENT_CHANGED')
    ledger.mkdir(mode=0o711)
    ledger.chmod(0o711)
    syncdir(ledger.parent)
    save(ledger/'before.json',plan)
    write_new(ledger/'description.json',description_raw)
    write_new(ledger/'access-plan.original.json',access_raw)
    save(ledger/'previous-reference.json',{'bytes':previous.decode() if previous is not None else None})
    before = publish('before',ledger,plan,description_raw,access_raw,previous,read)
    for number, row in enumerate(plan['changes']):
        current()
        save(ledger/f'change-{number:02d}-intent.json',row)
        actual = change(row)
        save(ledger/f'change-{number:02d}-done.json',{'done':True,'metadata':actual})
    current()
    publish('active',ledger,plan,description_raw,access_raw,before,read)
    return ledger


def observe(raw_profile, description_raw, strict, read):
    """Same 05 mount namespace. Root reads ledger metadata only."""
    desc = strict(description_raw)
    raw, ledger, frame = reference(CONTAINER_ROOT,read)
    need(raw is not None and frame['phase'] == 'active' and frame['requestKey'] == desc['requestKey']
         and frame['descriptionSha256'] == sha(description_raw)
         and frame['accessPlanSha256'] == desc['accessPlanSha256'], 'ACCESS_EXACT_ACTIVE_CONTEXT_REQUIRED')
    plan_raw = read(ledger/'before.json',131072,True)
    access_raw = read(ledger/'access-plan.original.json',131072,True)
    plan = strict(plan_raw)
    files = scope(raw_profile,strict)
    names = {str(REAL), *(str(MATERIALIZED/name) for name in (*DIRECTORIES,*files,ALIAS))}
    need(sha(plan_raw) == frame['planLedgerSha256'] and sha(access_raw) == frame['accessPlanSha256']
         and strict(access_raw) == plan and set(plan['entries']) == set(frame['entries']) == names,
         'ACCESS_OBSERVATION_EXACT_SCOPE_DIFFERS')
    for path, expected in frame['entries'].items():
        if path == str(MATERIALIZED/ALIAS):
            continue  # The real alias in this namespace is the source inode.
        target = CONTAINER_ROOT if path == str(REAL) else CONTAINER_ROOT/Path(path).relative_to(MATERIALIZED)
        need(metadata(target) == expected, 'ACCESS_OBSERVATION_METADATA_CHANGED')
    need(metadata(CONTAINER_ROOT/ALIAS) == frame['entries'][str(MATERIALIZED/PRIMARY)],
         'ACCESS_REGISTRY_ALIAS_DIFFERS')
    return frame


def restore(ledger, child_reaped, read):
    """The original result or a proven pre-child failure decides reaping."""
    need(os.getuid() == os.geteuid() == ROOT_UID and ledger == ledger_directory(ledger.name)
         and child_reaped is True, 'ACCESS_CHILD_REAP_REQUIRED')
    previous, selected, frame = reference(REAL,read)
    need(selected == ledger, 'ACCESS_RESTORE_REFERENCE_DIFFERS')
    if frame['phase'] == 'restored':
        need(read_json(ledger/'restored.json',read)['childReaped'] is True, 'ACCESS_CHILD_REAP_REQUIRED')
        return
    plan_raw = read(ledger/'before.json',131072,True)
    access_raw = read(ledger/'access-plan.original.json',131072,True)
    desc = read(ledger/'description.json',65536,True)
    plan = json.loads(plan_raw)
    need(sha(plan_raw) == frame['planLedgerSha256'] and sha(access_raw) == frame['accessPlanSha256']
         and sha(desc) == frame['descriptionSha256'] and json.loads(access_raw) == plan
         and plan['requestKey'] == ledger.name, 'ACCESS_ORIGINAL_LEDGER_PLAN_REQUIRED')
    changes = {row['before']['path']:(i,row) for i,row in enumerate(plan['changes'])}
    pending = []
    for path,before in plan['entries'].items():
        actual = metadata(path)
        if path not in changes:
            need(actual == before, 'ACCESS_RESTORE_UNOBSERVED_METADATA_CHANGED')
            continue
        number,row = changes[path]
        done = ledger/f'change-{number:02d}-done.json'
        restored = ledger/f'restore-{number:02d}-done.json'
        if restored.is_file():
            need(actual == read_json(restored,read)['metadata'] and same_object(actual,before),
                 'ACCESS_RESTORED_METADATA_CHANGED')
        elif done.is_file():
            expected = read_json(done,read)['metadata']
            need(actual == expected, 'ACCESS_RESTORE_UNOBSERVED_METADATA_CHANGED')
            pending.append((number,row,expected))
        else:
            need(actual == before, 'ACCESS_RESTORE_UNOBSERVED_METADATA_CHANGED')
    for number,row,expected in reversed(pending):
        save(ledger/f'restore-{number:02d}-intent.json',row)
        actual = change(row,restoring=True,expected_current=expected)
        save(ledger/f'restore-{number:02d}-done.json',{'metadata':actual})
    restored = ledger/'restored.json'
    if not restored.exists():
        save(restored,{'state':'ORIGINAL_INPUT_METADATA_RESTORED','childReaped':True,'transactionRollbackInferred':False})
    publish('restored',ledger,plan,desc,access_raw,previous,read)
