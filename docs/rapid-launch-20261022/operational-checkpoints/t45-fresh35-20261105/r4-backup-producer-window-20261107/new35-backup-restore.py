#!/usr/bin/env python3
"""Single T45 logical backup / independent restore successor. No deployment or coverage writer.

stream/budget are adapted from the delivered Nov6 backup-exact-current.py f02.
Run only with a C-bound plan. Importing this module has no environment/PG effects.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import tarfile
import time

BUILD_ROOT = '3b82c46ebc0b49b26005b023c5e97bc779c8628c'
INTEGRATION_SOURCE = 'e422d07390c5a58c44b54452983638a2de5655b7'
SOURCE = BUILD_ROOT
BUILD_ID = 'erp-3b82c46ebc0b-full-20261107'
ROLE_ACL_PROJECTION = 'INCLUDES_ATTACL_AND_CONTROL_SYSTEM_V1'
SOURCE_SET = '8694c5c7e1bc4b09f9511869f2665e8ec9fad65d6aa832b139a24d47258f998d'
INSTALL_RECORD_SHA = 'a7d12f1f21f730c0e0c19dd6136c501c74d43e0e866e62d2f51aa908ea4f970f'
INSTALL_PROGRAM_SHA = '69e1a3cfa70d2304b9fca3f7338b0ac55dc038e015bdae67f0c213238f49ad2d'
TARGET_SHA = '8b9fb64ac1cccb9bdaec4c68a3ceaf468052f71e8fb3e48baeba3581ec9bfff0'
CATALOG_SPEC_SHA = '90d9838f1896e012536d5d03bc33339832d570d0c69d894adfaa0e8b33478ef9'
ORDINARY_INTERFACE = 'erp_unified27_runtime_2393dbc6db9581c2'
IDENT = re.compile(r'[a-z][a-z0-9_]{0,62}\Z')
HEX = re.compile(r'[a-f0-9]{64}\Z')


def need(value, code):
    if not value:
        raise ValueError(code)


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def ident(value):
    need(isinstance(value, str) and IDENT.fullmatch(value), 'SQL_IDENTIFIER_REQUIRED')
    return '"' + value + '"'


def literal(value):
    need(isinstance(value, str) and '\x00' not in value, 'SQL_VALUE_REQUIRED')
    return "'" + value.replace("'", "''") + "'"


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def private_file(path):
    p = Path(path)
    s = p.lstat()
    need(stat.S_ISREG(s.st_mode) and not p.is_symlink() and s.st_uid == os.geteuid()
         and s.st_nlink == 1 and not s.st_mode & 0o077, 'PRIVATE_INPUT_REQUIRED')
    return p


def reference(ref, private=False):
    p = private_file(ref['path']) if private else Path(ref['path'])
    need(p.is_file() and not p.is_symlink() and HEX.fullmatch(ref['sha256'])
         and digest(p) == ref['sha256'], 'REFERENCE_CHANGED')
    need(p.stat().st_size <= 16 * 1024**2, 'METADATA_BOUND')
    return json.loads(p.read_text())


def original_import(receipt, expected):
    need(receipt.get('state') in ('COMMITTED', 'ALREADY_COMMITTED')
         and receipt.get('verification', {}).get('state') == 'VERIFIED'
         and receipt.get('verification', {}).get('scope') == 'SOURCE_PACKAGE_VS_CURRENT_DATABASE_WITH_IMPORT_AUDIT_CHAIN'
         and receipt.get('connection_cleanup') == 'CLOSED'
         and receipt.get('readback_connection_cleanup') == 'CLOSED'
         and receipt.get('manifest_sha256') == expected['packageSha256']
         and receipt.get('plan_sha256') == expected['planSha256'],
         'REAL_COMMIT_AND_ORIGINAL_READBACK_REQUIRED')


def closed_business(boundary, fence, target, now):
    need(boundary.get('format') == 'naijue-rewrite-write-boundary-v1'
         and boundary.get('target') == target and boundary.get('database') == target['proposal']['database']
         and boundary.get('sourceCommit') == SOURCE and boundary.get('buildId') == BUILD_ID
         and boundary.get('writeAdmission') == 'CLOSED' and boundary.get('outcome') == 'KNOWN'
         and boundary.get('newBusinessWrites') == 0 and boundary.get('firstBusinessWriteAtUtc') is None,
         'BEFORE_FIRST_NEW_BUSINESS_ONLY')
    age = now - dt.datetime.fromisoformat(boundary['checkedAtUtc'].replace('Z', '+00:00')).timestamp()
    need(0 <= age <= 300 and fence.get('target') == target
         and fence.get('database') == boundary['database'] and fence.get('buildId') == boundary['buildId']
         and fence.get('sourceCommit') == SOURCE and fence.get('allWriteEntrypointsClosed') is True
         and fence.get('inFlightTransactions') == 0
         and fence.get('snapshot', {}).get('newBusinessWrites') == 0
         and fence.get('snapshot', {}).get('firstBusinessWriteAtUtc') is None
         and fence.get('snapshot', {}).get('outcome') == 'KNOWN', 'CLOSED_DRAINED_WRITER_FENCE_REQUIRED')
    age = now - dt.datetime.fromisoformat(fence['snapshotAtUtc'].replace('Z', '+00:00')).timestamp()
    need(0 <= age <= 300, 'FRESH_WRITER_FENCE_REQUIRED')


def validate_identity(actual, endpoint, physical, database, role):
    need(actual.get('database') == database and actual.get('role') == role
         and actual.get('sessionRole') == role and actual.get('recovery') is False
         and actual.get('address') == endpoint['host'] and actual.get('port') == endpoint['port']
         and all(actual.get(k) == physical[k] for k in ('systemIdentifier', 'databaseOid', 'serverVersionNum', 'postmasterStart')),
         'ACTUAL_PHYSICAL_TARGET_DIFFERS')


def independent_restore(source_pg, source_target, restore_pg, actual, expected):
    need(restore_pg['containerId'] != source_pg['containerId']
         and restore_pg['hostDataDirectory'] != source_pg['hostDataDirectory']
         and actual.get('systemIdentifier') != source_target['physical']['systemIdentifier']
         and actual.get('database') == 'postgres' and actual.get('superuser') is True,
         'INDEPENDENT_NEW_RESTORE_TARGET_REQUIRED')
    validate_identity(actual, restore_pg, expected, 'postgres', restore_pg['user'])


def instant_millis(value):
    need(isinstance(value, str), 'FINITE_ROLE_EXPIRY_REQUIRED')
    try:
        normalized = value.replace('Z', '+00:00')
        if re.search(r'[+-][0-9]{2}$', normalized):
            normalized += ':00'
        parsed = dt.datetime.fromisoformat(normalized)
        need(parsed.tzinfo is not None, 'EXPLICIT_ROLE_EXPIRY_OFFSET_REQUIRED')
        return parsed.timestamp() * 1000
    except (ValueError, OverflowError):
        raise ValueError('FINITE_ROLE_EXPIRY_REQUIRED') from None


def r4_baseline(plan, record):
    need(plan['buildRoot'] == BUILD_ROOT and plan['sourceCommit'] == SOURCE
         and plan['integrationSourceCommit'] == INTEGRATION_SOURCE and plan['sourceSetSha256'] == SOURCE_SET,
         'FROZEN_BASELINE_DIFFERS')
    need(plan['installationRecord']['sha256'] == INSTALL_RECORD_SHA
         and record['format'] == 'FRESH35_COMBINED_INSTALLATION_RECORD_V2'
         and record['state'] == 'COMMITTED_AND_CATALOG_CHECKED'
         and record['binding'] == {'sourceSetSha256': SOURCE_SET, 'targetSha256': TARGET_SHA}
         and record['programSha256'] == INSTALL_PROGRAM_SHA and record['catalogSpecSha256'] == CATALOG_SPEC_SHA,
         'EXACT_R4_INSTALLATION_REQUIRED')


def backup_window(plan, record, retained, now):
    w = plan['backupWindow']
    need(type(w) is dict and set(w) == {'startsAt', 'expiresAt', 'adminLoginValidUntil', 'authorizationReference'}
         and type(w['startsAt']) is int and type(w['expiresAt']) is int
         and type(plan['maximumSeconds']) is int and plan['maximumSeconds'] > 5
         and 0 < w['expiresAt'] - w['startsAt'] <= plan['maximumSeconds'] * 1000
         and w['startsAt'] <= now < w['expiresAt']
         and isinstance(w['authorizationReference'], str) and 0 < len(w['authorizationReference'].strip()) <= 512,
         'EXACT_FINITE_BACKUP_WINDOW_REQUIRED')
    raw_target = {k: v for k, v in record['target'].items() if k not in ('format', 'authority')}
    lease = retained.get('serviceLease', {})
    need(retained.get('state') == 'DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE'
         and retained.get('recordSha256') == INSTALL_RECORD_SHA and retained.get('sourceSetSha256') == SOURCE_SET
         and retained.get('target') == raw_target and retained.get('hostEnabled') is False
         and retained.get('businessVerified') is False and type(lease.get('expiresAt')) is int
         and lease.get('onSuccess') == 'RETAIN_EXACT_TARGET_UNTIL_SERVICE_DEADLINE'
         and lease.get('onFailure') == 'STOP_EXACT_TARGET_PRESERVE_DATA', 'EXACT_RETAINED_R4_SERVICE_REQUIRED')
    need(w['expiresAt'] <= instant_millis(w['adminLoginValidUntil']) <= lease['expiresAt']
         and now < instant_millis(w['adminLoginValidUntil']), 'BACKUP_ADMIN_OR_SERVICE_WINDOW_EXPIRED')
    return w


BACKUP_ADMIN_SQL = "SELECT json_build_object('role',current_user,'sessionRole',session_user,'oid',r.oid::text,'super',r.rolsuper,'login',r.rolcanlogin,'validUntil',r.rolvaliduntil::text) FROM pg_roles r WHERE rolname=current_user"


def backup_admin(actual, plan, target):
    need(actual.get('role') == actual.get('sessionRole') == target['proposal']['admin']
         and actual.get('oid') == '10' and actual.get('super') is True and actual.get('login') is True
         and instant_millis(actual.get('validUntil')) == instant_millis(plan['backupWindow']['adminLoginValidUntil']),
         'ACTUAL_BACKUP_ADMIN_EXPIRY_DIFFERS')


def ordinary_login(actual, role):
    need(actual.get('role') == role and actual.get('sessionRole') == role
         and actual.get('readOnly') == 'on' and actual.get('isolation') == 'repeatable read'
         and actual.get('login') is True and actual.get('connectionLimit') == 2
         and all(actual.get(k) is False for k in ('superuser', 'createDb', 'createRole', 'inherit', 'replication', 'bypassRls'))
         and actual.get('memberships') == [[ORDINARY_INTERFACE, False, False, True]],
         'ACTUAL_ORDINARY_LOGIN_BOUNDARY_REQUIRED')


def empty_restore(actual):
    need(actual == {'databases': 0, 'roles': 0, 'otherDatabases': 0, 'otherRoles': 0},
         'NEW_EMPTY_RESTORE_TARGET_ONLY_NO_REPLAY')


def representative_sql(ref):
    p = Path(ref['path'])
    need(digest(p) == ref['sha256'] and p.stat().st_size <= 65536, 'REPRESENTATIVE_READ_CHANGED')
    sql = p.read_text().strip().rstrip(';').strip()
    need(sql and ';' not in sql and '\\' not in sql and not re.search(r'--|/\*', sql)
         and re.match(r'(?is)^(SELECT|WITH)\b', sql)
         and re.search(r'\bnaijue_erp\.', sql, re.I), 'ONE_REAL_BUSINESS_SELECT_REQUIRED')
    return sql


IDENTITY_SQL = """SELECT json_build_object(
 'database',current_database(),'role',current_user,'sessionRole',session_user,
 'systemIdentifier',(pg_control_system()).system_identifier::text,
 'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
 'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_postmaster_start_time()::text,
 'address',inet_server_addr()::text,'port',inet_server_port(),'recovery',pg_is_in_recovery(),
 'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user))"""

ORDINARY_SQL = """SELECT json_build_object('role',current_user,'sessionRole',session_user,
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'superuser',r.rolsuper,'createDb',r.rolcreatedb,'createRole',r.rolcreaterole,'inherit',r.rolinherit,
 'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'login',r.rolcanlogin,'connectionLimit',r.rolconnlimit,
 'memberships',COALESCE((SELECT json_agg(json_build_array(p.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY p.rolname)
 FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid),'[]'::json))
 FROM pg_roles r WHERE r.rolname=current_user"""


def original_sql(i):
    ids = ','.join(literal(i[k]) + '::uuid' for k in ('batchId', 'documentBatchId'))
    return """SELECT json_build_object('batches',COALESCE((SELECT json_agg(json_build_object(
     'id',id,'source_hash',source_hash,'status',status,'checkpoint',checkpoint) ORDER BY id)
     FROM naijue_erp.import_batch WHERE id IN (""" + ids + """)),'[]'::json),
     'initializer',COALESCE((SELECT json_build_object('id',r.id,'requestKey',r.request_key,'status',r.status,
     'packageSha256',a.after_values->'request'->>'package_manifest_sha256',
     'planSha256',a.after_values->'request'->>'plan_sha256')
     FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
     WHERE r.id=""" + literal(i['initializerOperationId']) + '::uuid AND r.request_key=' + literal(i['initializerRequestKey']) + "),'null'::json))"


def check_original(actual, i):
    batches = actual.get('batches', [])
    need(len(batches) == 2 and {b['id'] for b in batches} == {i['batchId'], i['documentBatchId']}
         and all(b['status'] == 'IMPORTED' and b['source_hash'] == i['packageSha256'] for b in batches),
         'ORIGINAL_IMPORT_BATCHES_NOT_COMMITTED')
    r = actual.get('initializer')
    need(isinstance(r, dict) and r == {'id': i['initializerOperationId'], 'requestKey': i['initializerRequestKey'],
         'status': 'COMMITTED', 'packageSha256': i['packageSha256'], 'planSha256': i['planSha256']},
         'ORIGINAL_REQUEST_RECEIPT_DIFFERS')


def catalog_sql(role_names=None):
    roles = "r.rolname !~ '^pg_'" if role_names is None else 'r.rolname IN (' + ','.join(literal(n) for n in role_names) + ')'
    return """SELECT json_build_object('roles',(SELECT json_agg(json_build_object('name',r.rolname,
     'super',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,
     'login',r.rolcanlogin,'replication',r.rolreplication,'bypass',r.rolbypassrls,'limit',r.rolconnlimit,
     'validUntil',r.rolvaliduntil::text,'config',r.rolconfig) ORDER BY r.rolname) FROM pg_roles r WHERE """ + roles + """),
     'memberships',(SELECT COALESCE(json_agg(json_build_array(p.rolname,r.rolname,m.admin_option,m.inherit_option,m.set_option)
     ORDER BY p.rolname,r.rolname),'[]'::json) FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
     JOIN pg_roles r ON r.oid=m.member WHERE """ + roles + """),
     'database',(SELECT json_build_object('name',datname,'owner',pg_get_userbyid(datdba),'acl',datacl::text)
     FROM pg_database WHERE datname=current_database()),
     'schemas',(SELECT json_agg(json_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname)
     FROM pg_namespace WHERE nspname='naijue_erp'),
     'relations',(SELECT json_agg(json_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relacl::text,
     c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='naijue_erp'),
     'columnAcls',(SELECT json_agg(json_build_array(c.relname,a.attname,a.attnum,a.attacl::text) ORDER BY c.relname,a.attnum)
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='naijue_erp' AND a.attnum>0 AND NOT a.attisdropped),
     'pgControlSystem',""" + control_system_observation() + """,
     'functions',(SELECT json_agg(json_build_array(p.proname,pg_get_function_identity_arguments(p.oid),
     pg_get_userbyid(p.proowner),p.proacl::text,p.prosecdef,p.proconfig) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp'),
     'defaults',(SELECT COALESCE(json_agg(json_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl::text)
     ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),'[]'::json) FROM pg_default_acl d
     LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='naijue_erp' OR d.defaclnamespace=0))"""



def canonical_absolute(value):
    need(isinstance(value, str) and Path(value).is_absolute() and os.path.normpath(value) == value,
         'CANONICAL_ABSOLUTE_PATH_REQUIRED')
    return Path(value)


def validate_pg_path_mapping(pg, expected_container_pgdata=None):
    container = canonical_absolute(pg['containerPgData'])
    host = canonical_absolute(pg['hostDataDirectory'])
    mount = pg['parentMount']
    parent_container = canonical_absolute(mount['destination'])
    parent_host = canonical_absolute(mount['source'])
    need(container != parent_container and container.is_relative_to(parent_container), 'PGDATA_NOT_IN_EXACT_PARENT_BIND')
    relative = container.relative_to(parent_container)
    need(host == parent_host / relative and (expected_container_pgdata is None or str(container) == expected_container_pgdata),
         'HOST_CONTAINER_PGDATA_MAPPING_DIFFERS')
    return str(host)


def validate_pg_mount(pg, mounts):
    validate_pg_path_mapping(pg)
    data = Path(pg['containerPgData'])
    ancestors = [m for m in mounts if data == Path(m['Destination']) or data.is_relative_to(Path(m['Destination']))]
    need(ancestors, 'EXACT_DATA_PARENT_MOUNT_REQUIRED')
    effective = max(ancestors, key=lambda m: len(Path(m['Destination']).parts))
    need(effective['Destination'] == pg['parentMount']['destination'] and effective['Source'] == pg['parentMount']['source']
         and effective.get('Type') == 'bind' and effective['RW'] is True, 'EXACT_DATA_PARENT_MOUNT_REQUIRED')
    return validate_pg_path_mapping(pg)


def validate_build_chain(plan, runtime, pack, boundary, fence):
    need(plan['buildRoot'] == SOURCE == BUILD_ROOT and plan['sourceCommit'] == SOURCE
         and plan['integrationSourceCommit'] == INTEGRATION_SOURCE and plan['sourceSetSha256'] == SOURCE_SET,
         'RELEASE_AND_INTEGRATION_SOURCE_DIFFER')
    need(runtime['build'] == {'buildId': BUILD_ID, 'sourceCommit': SOURCE}
         and all(item.get('buildId') == BUILD_ID and item.get('sourceCommit') == SOURCE for item in [pack, boundary, fence]),
         'ACTUAL_PACK_RUNTIME_BOUNDARY_BUILD_DIFFERS')


def directory_identity(path):
    p = canonical_absolute(path)
    need(not p.is_symlink() and p.resolve() == p and p.is_dir(), 'CANONICAL_MEDIA_DIRECTORY_REQUIRED')
    s = p.stat()
    return {'device': s.st_dev, 'inode': s.st_ino, 'uid': s.st_uid, 'gid': s.st_gid, 'mode': stat.S_IMODE(s.st_mode)}


def media_archive_source(plan):
    need(plan['mediaDirectory'] == plan['media']['hostRoot'], 'ACTUAL_MEDIA_ARCHIVE_MAPPING_DIFFERS')
    return {'path': plan['mediaDirectory'], 'identity': directory_identity(plan['mediaDirectory']),
            'archiveMember': 'source-0', 'mapping': plan['media']}


def compare_role_acl(actual, source):
    need(isinstance(actual.get('columnAcls'), list) and actual['columnAcls']
         and isinstance(source.get('columnAcls'), list) and source['columnAcls'], 'COLUMN_ACL_PROJECTION_REQUIRED')
    need(actual == source, 'RESTORED_ROLE_OWNER_COLUMN_ACL_DIFFERS')


def control_system_observation():
    return """(SELECT json_build_object('function','pg_catalog.pg_control_system()',
      'owner',pg_get_userbyid(p.proowner),'ownerOid',p.proowner::text,'language',l.lanname,
      'source',p.prosrc,'securityDefiner',p.prosecdef,'returnsSet',p.proretset,
      'definition',pg_get_functiondef(p.oid),'acl',(SELECT json_agg(json_build_array(
      pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text COLLATE "C",
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END COLLATE "C",x.privilege_type)
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname='pg_catalog' AND p.proname='pg_control_system' AND p.pronargs=0)"""


def validate_source_control_acl(value, proposal):
    need(isinstance(value, dict) and value.get('function') == 'pg_catalog.pg_control_system()'
         and value.get('owner') == proposal['admin'] and value.get('ownerOid') == '10'
         and value.get('language') == 'internal' and value.get('source') == 'pg_control_system'
         and value.get('securityDefiner') is False and value.get('returnsSet') is False
         and isinstance(value.get('definition'), str), 'ACTUAL_SOURCE_CONTROL_SYSTEM_REQUIRED')
    expected = sorted([[proposal['admin'], proposal[k], 'EXECUTE', False] for k in ['admin', 'owner', 'controller', 'runtime']])
    need(sorted(value.get('acl', [])) == expected, 'EXACT_SOURCE_CONTROL_EXEC_ACL_REQUIRED_NO_PUBLIC')


def mapped_control_acl(source, source_admin, restore_admin):
    need(source['owner'] == source_admin and source_admin != restore_admin, 'EXPLICIT_CONTROL_OWNER_MAPPING_REQUIRED')
    result = dict(source)
    result['owner'] = restore_admin
    result['acl'] = [[restore_admin if a == source_admin else a,
                      restore_admin if b == source_admin else b, privilege, grantable]
                     for a, b, privilege, grantable in source['acl']]
    result['acl'].sort()
    return result


def control_system_restore_sql(source, before, proposal, restore_admin):
    validate_source_control_acl(source, proposal)
    expected = mapped_control_acl(source, proposal['admin'], restore_admin)
    need({k: v for k, v in before.items() if k != 'acl'} == {k: v for k, v in expected.items() if k != 'acl'},
         'RESTORE_CONTROL_SYSTEM_BUILTIN_IDENTITY_DIFFERS')
    need(before.get('acl') and all(row in expected['acl'] for row in before['acl']),
         'UNKNOWN_RESTORE_CONTROL_ACL_REFUSED')
    return 'GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ' + ','.join(ident(proposal[k]) for k in ['owner','controller','runtime'])


class Job:
    def __init__(self, plan, mode):
        self.p, self.mode = plan, mode
        self.start = time.monotonic()
        self.dest = Path(plan['destination'])
        self.result = {'format': 'NEW35_LOGICAL_BACKUP_RESTORE_V1', 'mode': mode, 'jobId': plan['jobId'],
                       'state': 'NOT_STARTED', 'automaticRetry': False, 'databaseRestoredOrDowngradedInProduction': False,
                       'coverageWritten': False, 'startedAtUtc': stamp(), 'artifacts': {}}

    def remaining(self):
        remaining = self.p['maximumSeconds'] - (time.monotonic() - self.start)
        need(remaining > 5, 'JOB_DEADLINE')
        if self.mode == 'backup':
            window = backup_window(self.p, self.record, self.retained, int(time.time() * 1000))
            need(digest(self.p['serviceRetention']['path']) == self.p['serviceRetention']['sha256'],
                 'RETAINED_SERVICE_CHANGED')
            remaining = min(remaining, (window['expiresAt'] - time.time() * 1000) / 1000)
            need(remaining > 5, 'BACKUP_OPERATION_CLEANUP_RESERVE_EXPIRED')
        return remaining

    def budget(self, additional=0, control=False):
        used = 0
        if self.dest.exists():
            for path in self.dest.rglob('*'):
                s = path.lstat()
                need(not stat.S_ISLNK(s.st_mode), 'OUTPUT_SYMLINK_REFUSED')
                if stat.S_ISREG(s.st_mode):
                    used += s.st_size
        reserve = 0 if control else self.p['controlReserveBytes']
        need(used + additional <= self.p['maximumArtifactBytes'] - reserve, 'TOTAL_ARTIFACT_CAP')
        need(shutil.disk_usage(self.dest if self.dest.exists() else self.dest.parent).free - additional
             >= self.p['minimumFreeBytes'] + reserve, 'FREE_SPACE_FLOOR')
        if self.mode == 'restore' and 'restorePg' in self.p:
            need(shutil.disk_usage(self.p['restorePg']['hostDataDirectory']).free >= self.p['minimumFreeBytes'] + reserve,
                 'RESTORE_DATA_FREE_SPACE_FLOOR')

    def save(self, name, value, artifact=True):
        raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
        self.budget(len(raw), control=not artifact)
        with (self.dest / name).open('xb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(self.dest / name, 0o400)
        if artifact:
            self.result['artifacts'][name] = {'path': str(self.dest / name), 'bytes': len(raw), 'sha256': digest(self.dest / name)}

    def env(self):
        return {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}

    def pg_args(self, pg, tool, database):
        # Credentials remain inside the exact carrier; no connection strings or secret argv.
        return ['docker', 'exec', '-i', '--env', 'PGPASSFILE=' + pg['passFile'],
                '--env', 'PGOPTIONS=-c statement_timeout=' + str(int(self.remaining() * 1000)) + ' -c lock_timeout=3000',
                pg['containerId'], 'timeout', '--signal=TERM', '--kill-after=5s', str(max(1, int(self.remaining()))) + 's',
                str(Path(pg['binDirectory']) / tool), '--host=' + pg['host'],
                '--port=' + str(pg['port']), '--username=' + pg['user'], '--dbname=' + database, '--no-password']

    def stream(self, args, name, cap, input_path=None, input_bytes=None):
        """Nov6 f02 streaming shape, same free-space check while stdout/stderr are idle."""
        need(not (input_path and input_bytes is not None), 'ONE_CHILD_INPUT')
        self.remaining()
        path, errpath = self.dest / name, self.dest / (name + '.stderr.private')
        source = open(input_path, 'rb') if input_path else None
        child = None
        try:
            with path.open('xb', buffering=0) as output, errpath.open('xb', buffering=0) as err:
                child = subprocess.Popen(args, stdin=source if source else subprocess.PIPE,
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env(), start_new_session=True)
                sel = selectors.DefaultSelector()
                sel.register(child.stdout, selectors.EVENT_READ, (output, path, cap))
                sel.register(child.stderr, selectors.EVENT_READ, (err, errpath, self.p['controlReserveBytes']))
                try:
                    if not source:
                        if input_bytes:
                            child.stdin.write(input_bytes)
                        child.stdin.close()
                    while sel.get_map():
                        self.remaining()
                        self.budget()
                        for key, _ in sel.select(.25):
                            block = os.read(key.fd, 65536)
                            if not block:
                                sel.unregister(key.fileobj)
                                continue
                            out, outpath, limit = key.data
                            need(outpath.stat().st_size + len(block) <= limit, 'CHILD_OUTPUT_CAP')
                            self.budget(len(block))
                            need(out.write(block) == len(block), 'CHILD_OUTPUT_WRITE_FAILED')
                    child.wait(timeout=self.remaining())
                    need(child.returncode == 0, 'CHILD_FAILED_OR_OUTCOME_UNKNOWN')
                    os.fsync(output.fileno())
                finally:
                    sel.close()
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGTERM)
                        try:
                            child.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGKILL)
                            child.wait(timeout=3)
                    child.stdout.close()
                    child.stderr.close()
                    if child.stdin and not child.stdin.closed:
                        child.stdin.close()
        finally:
            if source:
                source.close()
        os.chmod(path, 0o400)
        self.result['artifacts'][name] = {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}
        return path

    def query(self, pg, database, sql, tag, read_only=True):
        script = ('BEGIN ISOLATION LEVEL REPEATABLE READ' + (' READ ONLY' if read_only else '') + ';\n'
                  + sql.rstrip(';') + ';\n' + ('ROLLBACK' if read_only else 'COMMIT') + ';\n').encode()
        args = self.pg_args(pg, 'psql', database) + ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
        output = self.stream(args, tag + '.private.jsonl', self.p['metadataMaxBytes'], input_bytes=script)
        return [json.loads(line) for line in output.read_text().splitlines() if line.strip()]

    def container(self, pg):
        # Inspect only public container identity and the owned data mount; no Env/credentials.
        command = ['docker', 'inspect', '--format',
                   '{{json .Id}}\n{{json .State.Running}}\n{{json .Image}}\n{{json .Mounts}}', pg['containerId']]
        output = self.stream(command, pg['label'] + '-container.private.jsonl', self.p['metadataMaxBytes'])
        cid, running, image, mounts = [json.loads(x) for x in output.read_text().splitlines()]
        need(cid == pg['containerId'] and running is True and image == pg['imageId'], 'EXACT_CARRIER_CHANGED')
        validate_pg_mount(pg, mounts)

    def load(self):
        p = self.p
        need(p['buildRoot'] == BUILD_ROOT and p['sourceCommit'] == SOURCE and p['integrationSourceCommit'] == INTEGRATION_SOURCE and p['sourceSetSha256'] == SOURCE_SET,
             'FROZEN_BASELINE_DIFFERS')
        helper = p['deployHelper']
        need(digest(helper['path']) == helper['sha256'], 'EXISTING_DEPLOY_HELPER_CHANGED')
        spec = importlib.util.spec_from_file_location('existing_deploy', helper['path'])
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.record = reference(p['installationRecord'])
        source, program = reference(p['sourceDescriptor']), reference(p['programDescriptor'])
        self.target = module.validate_exact35_installation_data(self.record, source, program)
        r4_baseline(p, self.record)
        if self.mode == 'backup':
            self.retained = reference(p['serviceRetention'], private=True)
            backup_window(p, self.record, self.retained, int(time.time() * 1000))
            self.result.update(backupOperationWindow=dict(p['backupWindow']), serviceRetentionSha256=p['serviceRetention']['sha256'])
        proposal, ordinary = self.target['proposal'], self.target['ordinary']
        pg = p['sourcePg']
        need(pg['host'] == ordinary['connectHost'] == ordinary['serverAddress']
             and pg['port'] == ordinary['connectPort'] == ordinary['serverPort']
             and validate_pg_path_mapping(pg, proposal['workspaceDirectory'] + '/data')
             and pg['user'] == proposal['admin'], 'EXACT_SOURCE_ADMIN_ENDPOINT_REQUIRED')
        ordinary_pg = p['sourceOrdinaryPg']
        need(all(ordinary_pg[k] == pg[k] for k in ('containerId', 'host', 'port', 'binDirectory'))
             and ordinary_pg['user'] == proposal['runtime'], 'EXACT_SOURCE_ORDINARY_ENDPOINT_REQUIRED')
        if self.mode == 'restore':
            need(all(p['restoreOrdinaryPg'][k] == p['restorePg'][k] for k in ('containerId', 'host', 'port', 'binDirectory'))
                 and p['restoreOrdinaryPg']['user'] == proposal['runtime'], 'EXACT_RESTORE_ORDINARY_ENDPOINT_REQUIRED')
        need(module.file_identity(p['runtimeConfiguration']['path']) == p['runtimeConfiguration']['identity'],
             'ORIGINAL_RUNTIME_CONFIGURATION_IDENTITY_CHANGED')
        self.business_sql = representative_sql(p['representativeRead'])
        self.result.update(buildRoot=BUILD_ROOT, sourceCommit=SOURCE, integrationSourceCommit=INTEGRATION_SOURCE, sourceSetSha256=SOURCE_SET,
                           roleAclProjection=ROLE_ACL_PROJECTION,
                           target=self.target, installationRecordSha256=p['installationRecord']['sha256'],
                           catalogSha256=self.record['catalogSha256'])

    def ordinary(self, pg, database, tag):
        login = self.query(pg, database, ORDINARY_SQL, tag + '-login')[0]
        ordinary_login(login, self.target['proposal']['runtime'])
        values = self.query(pg, database, 'SET LOCAL ROLE ' + ident(ORDINARY_INTERFACE) + ';\n' + self.business_sql, tag + '-read')
        need(len(values) == 1, 'ONE_REPRESENTATIVE_JSON_RESULT_REQUIRED')
        return values[0]

    def archive(self, name, sources):
        # Only source bytes are archived. Secrets/config/installation records are never logged or unpacked here.
        for source in sources:
            need(Path(source).is_absolute() and Path(source).exists() and not Path(source).is_symlink(), 'ARCHIVE_SOURCE_REQUIRED')
        code = ('import sys,tarfile; t=tarfile.open(fileobj=sys.stdout.buffer,mode="w|",format=tarfile.PAX_FORMAT);'
                + ' sources=' + repr(sources) + '; [(t.add(s,arcname="source-"+str(i),recursive=True)) for i,s in enumerate(sources)];t.close()')
        return self.stream(['/usr/bin/python3', '-I', '-S', '-c', code], name, self.p['archiveMaxBytes'])

    def shape(self, sources):
        rows = []
        for ordinal, source in enumerate(sources):
            p = Path(source)
            for q in [p, *(p.rglob('*') if p.is_dir() else [])]:
                s = q.lstat()
                need(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode), 'ARCHIVE_REGULAR_FILES_ONLY')
                rows.append((ordinal, str(q.relative_to(p)), s.st_size, s.st_mtime_ns, s.st_ctime_ns))
        return sorted(rows)

    def restore_files(self, archive):
        target = self.dest / 'restored-files'
        target.mkdir(mode=0o700)
        files = 0
        with tarfile.open(archive, 'r:') as tar:
            for member in tar:
                rel = Path(member.name)
                need(not rel.is_absolute() and '..' not in rel.parts and rel.parts
                     and (member.isfile() or member.isdir()), 'RESTORE_ARCHIVE_BOUNDARY')
                output = target / rel
                if member.isdir():
                    output.mkdir(mode=0o700, parents=True, exist_ok=True)
                    continue
                output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with tar.extractfile(member) as src, output.open('xb') as dst:
                    h = hashlib.sha256()
                    while True:
                        self.remaining()
                        block = src.read(65536)
                        if not block:
                            break
                        self.budget(len(block))
                        dst.write(block)
                        h.update(block)
                    dst.flush()
                    os.fsync(dst.fileno())
                need(output.stat().st_size == member.size and digest(output) == h.hexdigest(), 'RESTORED_FILE_TRUNCATED')
                os.chmod(output, member.mode & 0o777)
                files += 1
        return {'files': files, 'destination': str(target), 'archiveSha256': digest(archive), 'extracted': True}

    def backup(self):
        p, t = self.p, self.target
        original_import(reference(p['importReceipt']), p['originalImport'])
        boundary, fence = reference(p['writeBoundary']), reference(p['writeFence'])
        closed_business(boundary, fence, t, time.time())
        runtime = reference(p['runtimeConfiguration'], private=True)
        need(runtime['build'] == {'buildId': BUILD_ID, 'sourceCommit': SOURCE}
             and runtime['profile'] == 'source-confirmed-native-exact35-production-v2'
             and all(runtime['postgres']['target'][k] == v for k, v in {
                 'host': p['sourcePg']['host'], 'port': p['sourcePg']['port'], 'database': t['proposal']['database'],
                 'user': t['proposal']['runtime'], 'ssl': False}.items()), 'EXACT_ORDINARY_RUNTIME_CONFIGURATION_REQUIRED')
        pack = reference(p['appPackReceipt'])
        validate_build_chain(p, runtime, pack, boundary, fence)
        media_source = media_archive_source(p)
        need(pack['status'] == 'PACKED_AND_EXTRACTED_READBACK_MATCH' and pack['archiveExtractions'] == 1
             and pack['buildId'] == runtime['build']['buildId'] and pack['sourceCommit'] == SOURCE
             and pack['archive']['sha256'] == p['appArchive']['sha256']
             and digest(p['appArchive']['path']) == p['appArchive']['sha256'], 'ACTUAL_APP_PACK_REQUIRED')
        pg, database = p['sourcePg'], t['proposal']['database']
        self.container(pg)
        before = self.query(pg, database, IDENTITY_SQL, 'source-identity-before')[0]
        validate_identity(before, pg, t['physical'], database, pg['user'])
        need(before['superuser'] is True, 'EXISTING_VALID_TEMP_ADMIN_REQUIRED')
        backup_admin(self.query(pg, database, BACKUP_ADMIN_SQL, 'source-admin-before')[0], p, t)
        need(self.query(pg, database, "SELECT json_build_object('otherConnections',count(*)) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()", 'source-idle')[0] == {'otherConnections': 0},
             'SOURCE_WRITERS_NOT_DRAINED')
        # Check, do not replay, the original operation and both published batches.
        original = self.query(pg, database, original_sql(p['originalImport']), 'original-import')[0]
        check_original(original, p['originalImport'])
        catalog = self.query(pg, database, catalog_sql(), 'source-catalog-before')[0]
        validate_source_control_acl(catalog.get('pgControlSystem'), t['proposal'])
        business_signature_sql = "SELECT json_build_object('receipts',(SELECT count(*) FROM naijue_erp.operation_receipt),'lastReceipt',(SELECT max(completed_at)::text FROM naijue_erp.operation_receipt),'audits',(SELECT count(*) FROM naijue_erp.audit_change))"
        business_signature = self.query(pg, database, business_signature_sql, 'source-business-before')[0]
        self.save('source-catalog.private.json', catalog)
        source_read = self.ordinary(p['sourceOrdinaryPg'], database, 'source-ordinary')
        self.save('representative-source.private.json', source_read)
        dump = self.stream(self.pg_args(pg, 'pg_dump', database) + ['--format=custom', '--compress=6', '--lock-wait-timeout=3s', '--create'],
                           'database.dump', p['dumpMaxBytes'])
        with dump.open('rb') as f:
            need(f.read(5) == b'PGDMP', 'CUSTOM_DUMP_REQUIRED')
        # Includes original role attributes, membership AND password verifiers, only in a 0400 protected file.
        self.stream(self.pg_args(pg, 'pg_dumpall', database)[:-2] + ['--no-password', '--roles-only'],
                    'roles-auth-acl.protected.sql', p['metadataMaxBytes'])
        self.stream(['docker', 'exec', '-i', pg['containerId'], 'timeout', '--kill-after=5s', str(int(self.remaining())) + 's',
                     str(Path(pg['binDirectory']) / 'pg_restore'), '--list'],
                    'toc.private.txt', p['metadataMaxBytes'], input_path=dump)
        self.stream(['/bin/cat', p['appArchive']['path']], 'application.protected.pack', p['archiveMaxBytes'])
        need(self.result['artifacts']['application.protected.pack']['sha256'] == p['appArchive']['sha256'], 'APP_ARCHIVE_CHANGED')
        archive_sources = [p['mediaDirectory'], *p['configurationDirectories'],
                           *[p[k]['path'] for k in ('installationRecord', 'sourceDescriptor', 'programDescriptor',
                                                    'runtimeConfiguration', 'importReceipt', 'writeBoundary', 'writeFence', 'representativeRead', 'appPackReceipt')]]
        shape = self.shape(archive_sources)
        self.archive('app-media-config.protected.tar', archive_sources)
        need(self.shape(archive_sources) == shape and media_archive_source(p) == media_source, 'FILES_CHANGED_DURING_CAPTURE')
        need(self.query(pg, database, catalog_sql(), 'source-catalog-after')[0] == catalog, 'SOURCE_ACL_CHANGED_DURING_CAPTURE')
        validate_identity(self.query(pg, database, IDENTITY_SQL, 'source-identity-after')[0], pg, t['physical'], database, pg['user'])
        backup_admin(self.query(pg, database, BACKUP_ADMIN_SQL, 'source-admin-after')[0], p, t)
        check_original(self.query(pg, database, original_sql(p['originalImport']), 'original-import-after')[0], p['originalImport'])
        need(reference(p['writeBoundary']) == boundary and reference(p['writeFence']) == fence,
             'ORIGINAL_WRITER_FENCE_CHANGED')
        need(self.query(pg, database, business_signature_sql, 'source-business-after')[0] == business_signature,
             'NEW_BUSINESS_DURING_CAPTURE')
        self.result.update(state='BACKUP_CAPTURED_OFFLINE_TOC_ONLY', independentRestoreProven=False,
                           originalImport=p['originalImport'], runtimeIdentity=p['runtimeConfiguration']['identity'],
                           buildId=runtime['build']['buildId'], media=p['media'], mediaArchiveSource=media_source, archiveSources=archive_sources,
                           completeClosure=['database', 'rolesAuthAcl', 'app', 'media', 'configuration', 'installationAndSource', 'originalImport'],
                           appArchiveSha256=p['appArchive']['sha256'],
                           restoredInstallationRecordCreated=False)

    def restore(self):
        p = self.p
        backup = reference(p['backupReceipt'], private=True)
        need(backup['state'] == 'BACKUP_CAPTURED_OFFLINE_TOC_ONLY'
             and backup['target'] == self.target and backup['installationRecordSha256'] == p['installationRecord']['sha256']
             and backup['sourceSetSha256'] == SOURCE_SET and backup['sourceCommit'] == SOURCE
             and backup['integrationSourceCommit'] == INTEGRATION_SOURCE and backup['roleAclProjection'] == ROLE_ACL_PROJECTION, 'EXACT_NEW35_BACKUP_REQUIRED')
        for entry in backup['artifacts'].values():
            need(Path(entry['path']).stat().st_size == entry['bytes'] and digest(entry['path']) == entry['sha256'], 'BACKUP_ARTIFACT_CHANGED')
        pg = p['restorePg']
        self.container(pg)
        actual = self.query(pg, 'postgres', IDENTITY_SQL, 'restore-identity-before')[0]
        independent_restore(p['sourcePg'], self.target, pg, actual, p['restorePhysical'])
        catalog_entry = backup['artifacts']['source-catalog.private.json']
        original_catalog = reference(catalog_entry)
        roles = original_catalog['roles']
        names = [r['name'] for r in roles]
        need(pg['user'] not in names, 'DISTINCT_RESTORE_BOOTSTRAP_REQUIRED')
        database = self.target['proposal']['database']
        absent_sql = "SELECT json_build_object('databases',(SELECT count(*) FROM pg_database WHERE datname=" + literal(database) + "),'roles',(SELECT count(*) FROM pg_roles WHERE rolname IN (" + ','.join(literal(n) for n in names) + ")),'otherDatabases',(SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname<>'postgres'),'otherRoles',(SELECT count(*) FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>current_user))"
        absence = self.query(pg, 'postgres', absent_sql, 'restore-empty')[0]
        empty_restore(absence)
        globals_path = backup['artifacts']['roles-auth-acl.protected.sql']['path']
        self.stream(self.pg_args(pg, 'psql', 'postgres') + ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', '-'],
                    'restore-roles.private.txt', p['metadataMaxBytes'], input_path=globals_path)
        # --create restores database-level ACL/settings, uses the original name, and refuses an existing DB. No --clean/no-owner/no-acl.
        self.result['restoreAttempted'] = True
        self.stream(self.pg_args(pg, 'pg_restore', 'postgres') + ['--create', '--exit-on-error'],
                    'restore-database.private.txt', p['metadataMaxBytes'], input_path=backup['artifacts']['database.dump']['path'])
        restored = self.query(pg, database, IDENTITY_SQL, 'restore-identity-after')[0]
        need(restored['systemIdentifier'] == actual['systemIdentifier'] and restored['postmasterStart'] == actual['postmasterStart']
             and restored['database'] == database and restored['role'] == pg['user'], 'RESTORE_PHYSICAL_CHANGED')
        source_control = original_catalog['pgControlSystem']
        before_control = self.query(pg, database, 'SELECT ' + control_system_observation(), 'control-system-before')[0]
        sql = control_system_restore_sql(source_control, before_control, self.target['proposal'], pg['user'])
        self.query(pg, database, sql, 'control-system-original-exec', read_only=False)
        # query() launches a distinct original psql connection: never infer new
        # connection EXEC from GRANT ACK or from the admin's superuser ability.
        control_after = self.query(pg, database, 'SELECT ' + control_system_observation(), 'control-system-after-new-connection')[0]
        expected_control = mapped_control_acl(source_control, self.target['proposal']['admin'], pg['user'])
        need(control_after == expected_control, 'RESTORED_CONTROL_SYSTEM_ACL_DIFFERS')
        catalog = self.query(pg, database, catalog_sql(names), 'restored-catalog')[0]
        expected_catalog = {**original_catalog, 'pgControlSystem': expected_control}
        compare_role_acl(catalog, expected_catalog)
        check_original(self.query(pg, database, original_sql(backup['originalImport']), 'restored-original-import')[0], backup['originalImport'])
        read = self.ordinary(p['restoreOrdinaryPg'], database, 'restored-ordinary')
        source_read = reference(backup['artifacts']['representative-source.private.json'])
        need(read == source_read, 'RESTORED_REPRESENTATIVE_READ_DIFFERS')
        files = self.restore_files(backup['artifacts']['app-media-config.protected.tar']['path'])
        files['sourceMedia'] = backup['mediaArchiveSource']
        self.result.update(state='DB_RESTORED_APP_NOT_VERIFIED',
                           restoreTarget=restored, sourceTarget=self.target, originalImport=backup['originalImport'],
                           rolesAclCompared=True, ordinaryDatabaseRepresentativeRead='PASS',
                           controlSystemAclRestored=True, controlSystemAclNewConnectionReadback=True,
                           builtinAclMapping={'function':'pg_catalog.pg_control_system()',
                           'sourceAdmin':self.target['proposal']['admin'],'restoreAdmin':pg['user'],
                           'scope':'ONLY_BUILTIN_OWNER_GRANTOR_OID10'},
                           currentAppLoginRepresentativeRead='NOT_TESTED',
                           fullApplicationRestore='NOT_TESTED', opaqueFilesRestore=files,
                           buildId=backup['buildId'], sourceRuntimeIdentity=backup['runtimeIdentity'], media=backup['media'], mediaArchiveSource=backup['mediaArchiveSource'],
                           backupArtifacts=backup['artifacts'], completeClosure=backup['completeClosure'],
                           appArchiveSha256=backup['appArchiveSha256'],
                           restoredInstallationRecordCreated=False, sourceInstallationRecordReusableForRestore=False,
                           backupReceiptSha256=p['backupReceipt']['sha256'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--mode', choices=['backup', 'restore'], required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args(argv)
    plan = json.loads(private_file(args.plan).read_text())
    job = Job(plan, args.mode)
    job.load()
    if not args.execute:
        print(json.dumps({'state': 'SOURCE_PREPARATION_ONLY', 'mode': args.mode, 'serverOrPGExecuted': False,
                          'actualBackup': 'NOT_TESTED', 'actualRestore': 'NOT_TESTED', 'coverageWritten': False}))
        return 0
    need(os.geteuid() == 0 and os.environ.get('ERP_SHARED_TASK_ID') == 'T45'
         and Path(os.environ['ERP_SHARED_JOB_DIR']).name == plan['jobId'], 'ORIGINAL_T45_EXECUTION_ONLY')
    need(not job.dest.exists() and job.dest.parent.is_dir(), 'NEW_PRIVATE_DESTINATION_ONLY_NO_REPLAY')
    os.umask(0o077)
    job.dest.mkdir(mode=0o700)
    code = 0
    try:
        with open('/run/naijue-erp-hdd-test.lock', 'a+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            job.budget()
            job.remaining()
            job.result['state'] = 'RUNNING'
            (job.backup if args.mode == 'backup' else job.restore)()
    except Exception as error:
        job.result.update(state='FAILED_PARTIAL_PRESERVED_NO_REPLAY', safeCode=str(error) if type(error) is ValueError else type(error).__name__,
                          originalKeyRecoveryRequired=True, independentRestoreProven=False,
                          ownedRestorePgStopRequired=args.mode == 'restore', remoteQueryOutcome='UNKNOWN')
        code = 2
    finally:
        job.result['finishedAtUtc'] = stamp()
        job.save('result.private.json', job.result, artifact=False)
    print(json.dumps({'state': job.result['state'], 'mode': args.mode, 'automaticRetry': False,
                      'coverageWritten': False, 'credentialsExported': False}))
    return code


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('{"state":"PREPARATION_OR_EXECUTION_FAILED_NO_REPLAY","credentialsExported":false}', file=__import__('sys').stderr)
        raise SystemExit(2)
