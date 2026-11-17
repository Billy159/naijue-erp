"""Fixed stopped-R3 owner/controller authentication and exact restoration.

Imported only by the root maintenance carrier. No standalone CLI, service start,
new role, membership, HBA, runtime password or application writer.
"""
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import stat
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

STATE = Path('/var/lib/naijue-erp/fresh35-production')
WORK = STATE / 'fresh35-first-production-20261110-r3'
DATA = WORK / 'data'
CUSTODY = STATE / 'native-services/ordinary39-auth-20261116-01'
CAPTURE = WORK / 'ordinary39-auth-capture-20261116-01'
DATABASE = 'erp_fresh35_20261110_r3'
CONTROLLER = 'erp35_controller_20261110_r3'
BACKUP_ADMIN = 'erp35_admin_20261110_r3'
ROLES = (CONTROLLER, BACKUP_ADMIN)
FIXED_ROLES = (*ROLES, 'erp35_owner_20261110_r3', 'erp35_runtime_20261110_r3')
PHYSICAL = {'systemIdentifier': '7706545564479176741', 'databaseOid': '16393',
            'database': DATABASE, 'serverVersionNum': '170011'}
DATA_IDENTITY = (66304, 13502421, 61035, 61035, 0o700)
PHASES = ('before', 'apply-readback', 'restore-before', 'restore-readback', 'recovery-readback')


def need(ok, code):
    if not ok:
        raise ValueError(code)


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def quote(value):
    need(type(value) is str and '\x00' not in value, 'MAINT_STRING_REQUIRED')
    return "'" + value.replace("'", "''") + "'"


def timestamp(epoch):
    need(type(epoch) is int, 'MAINT_EPOCH_REQUIRED')
    seconds, millis = divmod(epoch, 1000)
    return datetime.fromtimestamp(seconds, timezone.utc).strftime('%Y-%m-%d %H:%M:%S') + (
        ('.' + str(millis).zfill(3)).rstrip('0') if millis else '') + '+00'


def scope():
    return {'format': 'T45_R3_ORDINARY05_CONTROLLER_BACKUP_FINITE_AUTH_V1',
            'decision': 'CAPTURE_SET_FINITE_AUTH_AND_RESTORE_EXACT_ORIGINAL_AUTH_SAME_STOPPED_R3',
            'requestKey': 't45-r3-ordinary39-auth-apply-20261116-01',
            'restoreRequestKey': 't45-r3-ordinary39-auth-restore-20261116-01',
            'previousServiceRequestKey': 't45-first-r3-native-service-start-20261116-38',
            'ordinaryServiceRequestKey': 't45-first-r3-native-service-start-20261116-39',
            'dataDirectory': str(DATA), 'dataDirectoryIdentity': list(DATA_IDENTITY),
            'physical': PHYSICAL, 'roles': list(ROLES), 'maximumOfflineStepSeconds': 30,
            'coldCopyCompleteSha256': 'f081eb73e96650c1623ab158dd11923c395600dd37f51e4d6940a7bb633148c1',
            'installationRecordSha256': '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'}


def validate(authority, now, restoring=False):
    fixed = scope()
    extra = {'startsAt', 'expiresAt', 'controllerValidUntil', 'backupAdminValidUntil', 'restorationDeadline',
             'authorizationReference', 'rolesSourceSha256', 'independentReviewSha256'}
    need(type(authority) is dict and set(authority) == set(fixed) | extra
         and all(authority[k] == v for k, v in fixed.items()), 'MAINT_EXACT_AUTHORITY_REQUIRED')
    a = authority
    need(all(type(a[k]) is int for k in ('startsAt', 'expiresAt', 'controllerValidUntil', 'backupAdminValidUntil', 'restorationDeadline'))
         and a['startsAt'] < a['expiresAt'] <= a['startsAt'] + 1800000
         and a['expiresAt'] < a['controllerValidUntil'] <= a['backupAdminValidUntil'] < a['restorationDeadline']
         <= a['startsAt'] + 12600000, 'MAINT_FINITE_AUTH_AND_RESTORATION_WINDOW_REQUIRED')
    deadline = a['restorationDeadline'] if restoring else a['expiresAt']
    need(type(now) is int and a['startsAt'] <= now and now + 30000 < deadline,
         'MAINT_ORIGINAL_WINDOW_EXPIRED')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512
         and all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}', a[k])
                 for k in ('rolesSourceSha256', 'independentReviewSha256')), 'MAINT_EXTERNAL_REVIEW_REQUIRED')


def private_file(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as f:
            need(f.write(raw) == len(raw), 'MAINT_PRIVATE_SHORT_WRITE')
            f.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read_private_raw(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == s.st_gid == 0 and s.st_nlink == 1
             and stat.S_IMODE(s.st_mode) == 0o400 and 0 < s.st_size <= 65536,
             'MAINT_PRIVATE_RECOVERY_FILE_REQUIRED')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            raw = f.read(65537)
        need(len(raw) == s.st_size, 'MAINT_PRIVATE_RECOVERY_FILE_CHANGED')
        return raw
    finally:
        os.close(fd)


def read_private(path):
    return json.loads(read_private_raw(path))


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def stopped(core):
    s = DATA.lstat()
    need(not DATA.is_symlink() and stat.S_ISDIR(s.st_mode)
         and (s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == DATA_IDENTITY
         and not os.path.lexists(DATA / 'postmaster.pid') and core.port_absent(56791),
         'MAINT_EXACT_DATA_MUST_BE_STOPPED')
    q = subprocess.run([str(core.BIN / 'pg_controldata'), '-D', str(DATA)],
                       capture_output=True, env=core.clean_env(WORK), timeout=5,
                       user=61035, group=61035, extra_groups=[])
    need(q.returncode == 0 and re.search(rb'^Database cluster state:\s*shut down\s*$', q.stdout, re.M)
         and re.search(rb'^Database system identifier:\s*7706545564479176741\s*$', q.stdout, re.M),
         'MAINT_ORIGINAL_CLEAN_CLUSTER_REQUIRED')


def snapshot_sql():
    names = ','.join(quote(name) for name in FIXED_ROLES)
    private_names = ','.join(quote(name) for name in ROLES)
    roles = "SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('rolvaliduntil',a.rolvaliduntil::text) ORDER BY a.rolname) FROM pg_catalog.pg_authid a WHERE a.rolname IN (" + private_names + ')'
    boundary = "SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('rolvaliduntil',r.rolvaliduntil::text) ORDER BY r.rolname) FROM pg_catalog.pg_roles r WHERE r.rolname IN (" + names + ')'
    memberships = 'SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor),\'[]\'::jsonb) FROM pg_catalog.pg_auth_members m WHERE m.member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN (' + names + '))'
    settings = 'SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),\'[]\'::jsonb) FROM pg_catalog.pg_db_role_setting s WHERE s.setrole IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN (' + names + '))'
    return "jsonb_build_object('physical',jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'database',current_database(),'serverVersionNum',current_setting('server_version_num')),'roles',(" + roles + "),'boundary',(" + boundary + "),'memberships',(" + memberships + "),'settings',(" + settings + '))'


def validate_snapshot(value):
    need(type(value) is dict and set(value) == {'physical', 'roles', 'boundary', 'memberships', 'settings'}
         and value['physical'] == PHYSICAL and type(value['roles']) is list and len(value['roles']) == 2
         and [r['rolname'] for r in value['roles']] == sorted(ROLES)
         and type(value['boundary']) is list and len(value['boundary']) == 4
         and [r['rolname'] for r in value['boundary']] == sorted(FIXED_ROLES)
         and type(value['memberships']) is list and type(value['settings']) is list,
         'MAINT_EXACT_EXISTING_ROLE_SNAPSHOT_REQUIRED')
    for r in value['roles']:
        need(r['rolcanlogin'] is True, 'ORDINARY05_EXISTING_LOGIN_REQUIRED')
        if r['rolname'] == CONTROLLER:
            need(r['rolconnlimit'] == 2 and all(r[k] is False for k in (
                'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolinherit', 'rolreplication', 'rolbypassrls')),
                'ORDINARY05_EXISTING_CONTROLLER_BOUNDARY_DIFFERS')
        else:
            need(r['rolname'] == BACKUP_ADMIN and r['oid'] == '10' and r['rolsuper'] is True,
                 'ORDINARY05_EXISTING_BACKUP_ADMIN_OID_OR_PRIVILEGE_DIFFERS')
        password = r['rolpassword']
        need(password is None or type(password) is str and (
            re.fullmatch('md5[a-f0-9]{32}', password) or re.fullmatch(r'SCRAM-SHA-256\$[1-9][0-9]{0,8}:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*', password)),
            'MAINT_OLD_AUTHENTICATION_FORMAT_UNSUPPORTED')


def offline(core, sql):
    stopped(core)
    need(type(sql) is str and len(sql.encode()) <= 65536, 'MAINT_FIXED_SQL_BOUNDS')
    args = [str(core.BIN / 'postgres'), '--single', '-D', str(DATA)]
    for setting in ('log_statement=none', 'log_min_error_statement=panic', 'log_min_messages=panic',
                    'client_min_messages=error', 'logging_collector=off', 'log_min_duration_statement=-1',
                    'log_duration=off', 'log_connections=off', 'log_disconnections=off',
                    'TimeZone=UTC', 'DateStyle=ISO,YMD', 'standard_conforming_strings=on',
                    'fsync=on', 'synchronous_commit=on', 'full_page_writes=on',
                    'statement_timeout=10000'):
        args += ['-c', setting]
    args.append(DATABASE)
    try:
        q = subprocess.run(args, input=sql.encode(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env=core.clean_env(WORK), timeout=20, user=61035, group=61035,
                           extra_groups=[], start_new_session=True, umask=0o077)
    except subprocess.TimeoutExpired:
        raise ValueError('MAINT_OFFLINE_OUTCOME_UNKNOWN_NO_REPLAY') from None
    need(q.returncode == 0, 'MAINT_OFFLINE_OUTCOME_UNKNOWN_NO_REPLAY')
    stopped(core)


def capture(core, phase):
    need(phase in PHASES, 'MAINT_FIXED_CAPTURE_PHASE_REQUIRED')
    p = CAPTURE / (phase + '.csv')
    need(not os.path.lexists(p), 'MAINT_CAPTURE_ALREADY_PRESENT_NO_REPLAY')
    parent = os.open(CAPTURE, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        d = os.fstat(parent)
        need(stat.S_ISDIR(d.st_mode) and d.st_uid == d.st_gid == 61035
             and stat.S_IMODE(d.st_mode) == 0o700, 'MAINT_CAPTURE_PRIVATE_PARENT_REQUIRED')
        # PostgreSQL COPY creates a new output as0644. Create this empty slot
        # privately first: COPY truncates the same inode without widening0600.
        fd = os.open(p.name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=parent)
        try:
            # The existing container has CHOWN but no FOWNER: set the mode
            # while still owning this empty inode, then transfer it to PG.
            os.fchmod(fd, 0o600)
            os.fchown(fd, 61035, 61035)
            created = os.fstat(fd)
            need(stat.S_ISREG(created.st_mode) and created.st_nlink == 1
                 and created.st_uid == created.st_gid == 61035 and created.st_size == 0
                 and stat.S_IMODE(created.st_mode) == 0o600, 'MAINT_CAPTURE_METADATA_REQUIRED')
            os.fsync(fd)
            os.fsync(parent)
            offline(core, 'COPY (SELECT ' + snapshot_sql() + ') TO ' + quote(str(p)) + ' WITH (FORMAT csv);\n')
            s = os.fstat(fd)
            current = os.stat(p.name, dir_fd=parent, follow_symlinks=False)
            need((created.st_dev, created.st_ino) == (s.st_dev, s.st_ino)
                 == (current.st_dev, current.st_ino) and not stat.S_ISLNK(current.st_mode),
                 'MAINT_CAPTURE_IDENTITY_CHANGED')
            need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == s.st_gid == 61035
                 and stat.S_IMODE(s.st_mode) == 0o600 and 0 < s.st_size <= 65536,
                 'MAINT_CAPTURE_METADATA_REQUIRED')
            with os.fdopen(fd, 'rb', closefd=False) as f:
                raw = f.read(65537)
            need(len(raw) == s.st_size, 'MAINT_CAPTURE_LENGTH_CHANGED')
            rows = list(csv.reader(io.StringIO(raw.decode())))
            need(len(rows) == 1 and len(rows[0]) == 1, 'MAINT_CAPTURE_SINGLE_JSON_ROW_REQUIRED')
            value = json.loads(rows[0][0])
            validate_snapshot(value)
            os.fchown(fd, 0, 0)
            os.fchmod(fd, 0o400)
            os.fsync(fd)
            return value
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def verifier(password, salt):
    need(re.fullmatch('[a-f0-9]{64}', password) and type(salt) is bytes and len(salt) == 16,
         'MAINT_GENERATED_AUTH_FORMAT_REQUIRED')
    salted = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 4096)
    client = hmac.new(salted, b'Client Key', hashlib.sha256).digest()
    server = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return 'SCRAM-SHA-256$4096:' + b64(salt) + '$' + b64(hashlib.sha256(client).digest()) + ':' + b64(server)


def desired(before, materials, deadlines):
    after = json.loads(encode(before))
    need(set(materials) == set(deadlines) == set(ROLES), 'MAINT_ONLY_TWO_EXISTING_ROLES_REQUIRED')
    for r in after['roles']:
        r['rolpassword'] = materials[r['rolname']]['verifier']
        r['rolvaliduntil'] = timestamp(deadlines[r['rolname']])
    for r in after['boundary']:
        if r['rolname'] in ROLES:
            r['rolvaliduntil'] = timestamp(deadlines[r['rolname']])
    validate_snapshot(after)
    return after


def change_sql(before, after):
    validate_snapshot(before)
    validate_snapshot(after)
    expected = json.loads(encode(before))
    for i, r in enumerate(expected['roles']):
        need(r['rolname'] == after['roles'][i]['rolname'], 'MAINT_FIXED_ROLE_ORDER_REQUIRED')
        for key in ('rolpassword', 'rolvaliduntil'):
            r[key] = after['roles'][i][key]
    for i, r in enumerate(expected['boundary']):
        if r['rolname'] in ROLES:
            r['rolvaliduntil'] = after['boundary'][i]['rolvaliduntil']
    need(expected == after, 'MAINT_AUTH_ONLY_CHANGE_REQUIRED')
    expression = snapshot_sql()
    check = lambda value: 'IF (' + expression + ') IS DISTINCT FROM ' + quote(encode(value).decode().strip()) + "::jsonb THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAINT_EXACT_AUTH_STATE_REQUIRED'; END IF; "
    statements = ''
    for r in after['roles']:
        password = 'NULL' if r['rolpassword'] is None else quote(r['rolpassword'])
        # The original two temporary logins have finite expiries. ALTER ROLE
        # cannot represent SQL NULL here; refuse before changing authentication.
        need(type(r['rolvaliduntil']) is str and re.fullmatch(
            r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00', r['rolvaliduntil']),
            'MAINT_EXACT_FINITE_EXPIRY_RESTORATION_REQUIRED')
        until = quote(r['rolvaliduntil'])
        statements += 'ALTER ROLE "' + r['rolname'] + '" PASSWORD ' + password + ' VALID UNTIL ' + until + '; '
    body = check(before) + statements + check(after)
    need('$maint$' not in body, 'MAINT_PRIVATE_STATE_CONTAINS_RESERVED_SQL_DELIMITER')
    return 'BEGIN;\nDO $maint$ BEGIN ' + body + 'END $maint$;\nCOMMIT;\n'


def assert_entry(authority_raw, pin, restoring):
    need(os.getuid() == os.geteuid() == 0 and Path(__file__).name == 'ordinary05_roles.py',
         'MAINT_ORIGINAL_ROOT_CARRIER_IMPORT_REQUIRED')
    need(type(authority_raw) is bytes and 0 < len(authority_raw) <= 65536
         and type(pin) is str and re.fullmatch('[a-f0-9]{64}', pin)
         and hashlib.sha256(authority_raw).hexdigest() == pin,
         'MAINT_EXACT_EXTERNAL_AUTHORITY_BYTES_REQUIRED')
    authority = json.loads(authority_raw)
    validate(authority, time.time_ns() // 1000000, restoring)
    need(hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == authority['rolesSourceSha256'],
         'MAINT_REVIEWED_SOURCE_DIFFERS')
    for parent in (STATE, WORK, STATE / 'native-services'):
        s = parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and not parent.is_symlink() and not s.st_mode & 0o022,
             'MAINT_ORIGINAL_PROTECTED_PARENT_REQUIRED')
    for path, expected in ((Path('/etc/naijue-erp/fresh35-combined-installation-v1.json'), authority['installationRecordSha256']),
                           (STATE / 'cold-backups/admin154-before-20261111-01/complete.json', authority['coldCopyCompleteSha256'])):
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_uid == s.st_gid == 0
             and not s.st_mode & 0o022 and s.st_nlink == 1 and 0 < s.st_size <= 65536
             and hashlib.sha256(path.read_bytes()).hexdigest() == expected,
             'MAINT_ORIGINAL_RECORD_OR_COLD_COPY_DIFFERS')
    return authority


def prepare(core, authority_raw, pin):
    authority = assert_entry(authority_raw, pin, False)
    stopped(core)
    need(not os.path.lexists(CUSTODY) and not os.path.lexists(CAPTURE), 'MAINT_AUTH_OPERATION_ALREADY_PRESENT_NO_REPLAY')
    CUSTODY.mkdir(mode=0o700)
    CAPTURE.mkdir(mode=0o700)
    os.chown(CAPTURE, 61035, 61035)
    sync_directory(CUSTODY.parent)
    sync_directory(CAPTURE.parent)
    private_file(CUSTODY / 'authority.json', authority_raw)
    before = capture(core, 'before')
    prior_path = STATE / 'native-services/ordinary34-auth-20261116-01/original-auth.json'
    prior = read_private(prior_path)
    need(set(prior) == set(before) and all(prior[k] == before[k] for k in (
         'physical', 'boundary', 'memberships', 'settings')),
         'ORDINARY05_RESTORE11_ORIGINAL_BOUNDARY_DIFFERS')
    need(prior == before,'ORDINARY16_RESTORE02_ORIGINAL_TWO_ROLE_AUTH_DIFFERS')
    private_file(CUSTODY / 'original-auth.json', encode(before))
    # Verify that both original expiries are exactly expressible by ALTER ROLE
    # before generating materials or attempting either password change.
    change_sql(before, before)
    materials = {}
    for role in ROLES:
        password = secrets.token_hex(32)
        materials[role] = {'password': password, 'verifier': verifier(password, secrets.token_bytes(16))}
        private_file(CUSTODY / (role + '.json'), encode({'host': '127.0.0.1', 'port': 56791,
                     'database': DATABASE, 'user': role, 'password': password, 'ssl': False}))
    deadlines = {CONTROLLER: authority['controllerValidUntil'],
                 BACKUP_ADMIN: authority['backupAdminValidUntil']}
    after = desired(before, materials, deadlines)
    private_file(CUSTODY / 'finite-auth.json', encode(after))
    validate(authority, time.time_ns() // 1000000)
    private_file(CUSTODY / 'apply-attempt.json', encode({'requestKey': authority['requestKey'], 'state': 'ATTEMPT_ONCE_OUTCOME_UNKNOWN_UNTIL_READBACK'}))
    offline(core, change_sql(before, after))
    observed = capture(core, 'apply-readback')
    need(observed == after, 'MAINT_FINITE_AUTH_READBACK_NOT_CONFIRMED_NO_REPLAY')
    receipt = {'status': 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK',
               'requestKey': authority['requestKey'], 'roles': list(ROLES),
               'credentialValidUntilByRole': deadlines, 'runtimeAuthChanged': False,
               'membershipsOrRoleAttributesChanged': False, 'newRoles': 0, 'authenticationAttempted': False,
               'privateRecoveryBasisRetained': True, 'automaticReplay': False}
    private_file(CUSTODY / 'applied.json', encode(receipt))
    return receipt


def restore(core, authority_raw, pin):
    authority = assert_entry(authority_raw, pin, True)
    need(read_private_raw(CUSTODY / 'authority.json') == authority_raw, 'MAINT_ORIGINAL_AUTHORITY_DIFFERS')
    need(not os.path.lexists(CUSTODY / 'restore-attempt.json') and not os.path.lexists(CUSTODY / 'restored.json'),
         'MAINT_RESTORE_ALREADY_ATTEMPTED_READ_ORIGINAL_KEY')
    stopped(core)
    before = read_private(CUSTODY / 'original-auth.json')
    after = read_private(CUSTODY / 'finite-auth.json')
    observed = capture(core, 'restore-before')
    need(observed == before or observed == after, 'MAINT_CURRENT_AUTH_NOT_ORIGINAL_OR_OWN_FINITE_STATE')
    private_file(CUSTODY / 'restore-attempt.json', encode({'requestKey': authority['restoreRequestKey'], 'state': 'ATTEMPT_ONCE_OUTCOME_UNKNOWN_UNTIL_READBACK'}))
    if observed != before:
        validate(authority, time.time_ns() // 1000000, True)
        offline(core, change_sql(after, before))
    restored = capture(core, 'restore-readback')
    need(restored == before, 'MAINT_EXACT_ORIGINAL_AUTH_RESTORATION_UNCONFIRMED')
    receipt = {'status': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK',
               'requestKey': authority['restoreRequestKey'], 'roles': list(ROLES),
               'exactOriginalVerifierAndExpiryVerifiedPrivately': True, 'naturalExpiryCountedAsRestoration': False,
               'runtimeAuthChanged': False, 'membershipsOrRoleAttributesChanged': False,
               'privateRecoveryBasisRetained': True, 'databaseStillStopped': True, 'automaticReplay': False}
    private_file(CUSTODY / 'restored.json', encode(receipt))
    return receipt
