#!/usr/bin/env python3
"""Bounded C02 candidate stage/entry activation. Importing this module is inert.

Only the existing T45 dispatcher may execute mutations on naijue-server.
Private runtime JSON is checked in memory and mounted by reference, never exported.
No SQL, migration, Docker pull/build/prune, old app/DB change, or backup replay.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import stat
import subprocess
import tarfile
import time
import threading
import pwd
import select
import errno

ROOT = Path('/srv/naijue-erp/rapid-launch-20261022')
OLD = Path('/srv/naijue-erp/prod')
ORIGIN = 'https://1n5635n614.goho.co'
HOST = '1n5635n614.goho.co'
DATABASE = 'erp_rewrite_20261022_r1'
ROLE = 'erp_rewrite_runtime_20261022'
OLD_NAMES = ('naijue-prod-app-1', 'naijue-prod-web-1', 'naijue-prod-db-1')
HASH = re.compile(r'[a-f0-9]{64}\Z')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}\Z')
RUNTIME26_PROFILE = 'source-confirmed-native-exact26-r1-v1'
RUNTIME26_REVIEW = '/run/naijue-rewrite/runtime26/C-RUNTIME-REVIEW.json'
RUNTIME26_INDEPENDENT = '/run/naijue-rewrite/runtime26/INDEPENDENT-REVIEW.json'
RUNTIME26_QB_SHA256 = '73c879a85bd5c1318648fd96ea3e0de6970521c93109eacb729dec9d74c1594f'
RUNTIME26_TARGET = {'database': DATABASE, 'databaseOid': '1027659', 'actingRole': ROLE, 'sessionUser': ROLE,
                    'serverAddress': '172.18.0.3/32', 'serverPort': 5432, 'postmasterStart': '2026-10-04 08:16:07.895273+00'}
RUNTIME26_CATALOG = {'format': 'EXACT26_RUNTIME_CATALOG_EXPORT_V1', 'sha256': 'f62de0a301d485da548324a89e97bd902f184ca45e0778901ab8d4be8dab15c7',
                     'patchLevel': '26_v7_media_color_swap'}
RUNTIME26_PURPOSES = ['PRODUCT_SEASONS_READ', 'CURRENT_CUSTOMER_READ_WRITE', 'CURRENT_FORM_READ', 'HISTORY_READ', 'INVENTORY_ADMISSION']
FULL_REFERENCES = {'metadata', 'review', 'independentReview', 'buildReceipt', 'sourceManifest', 'buildManifest', 'publication', 'backupCoverage'}
# BEGIN GENERATED RELEASE CONTRACT
# Generated from config/release-contract.json; edit that source, then regenerate.
RELEASE_CONTRACT = json.loads(r'''{"format":"naijue-release-contract-v1","migrationCount":26,"fontLicense":{"source":"apps/web/demo-replica/frontend/assets/fonts/LICENSE.txt","member":"web/source-styles/assets/fonts/LICENSE.txt"},"runtimeSqlPatches":[{"source":"adapters/postgres/patches/0026-v9-empty-history-publication-dispatch.sql","member":"patches/0026-v9-empty-history-publication-dispatch.sql"},{"source":"adapters/postgres/patches/0026-v11-document-specification-save.sql","member":"patches/0026-v11-document-specification-save.sql"},{"source":"adapters/postgres/patches/0026-v14-core-initialization.sql","member":"patches/0026-v14-core-initialization.sql"},{"source":"adapters/postgres/patches/0026-history-revision-current-base.sql","member":"patches/0026-history-revision-current-base.sql"},{"source":"adapters/postgres/patches/0026-category-reorder-undo.sql","member":"patches/0026-category-reorder-undo.sql"},{"source":"adapters/postgres/patches/0026-v19-barcode-scheme-initialization.sql","member":"patches/0026-v19-barcode-scheme-initialization.sql"},{"source":"adapters/postgres/patches/0026-v20-history-insert-source-identity.sql","member":"patches/0026-v20-history-insert-source-identity.sql"},{"source":"adapters/postgres/patches/0026-v22-staged-prefix-bind.sql","member":"patches/0026-v22-staged-prefix-bind.sql"},{"source":"adapters/postgres/patches/0026-history-responsible-null-successor.sql","member":"patches/0026-history-responsible-null-successor.sql"},{"source":"adapters/postgres/patches/0026-category-depth-successor.sql","member":"patches/0026-category-depth-successor.sql"},{"source":"adapters/postgres/patches/0026-history-revision-set-guards-successor.sql","member":"patches/0026-history-revision-set-guards-successor.sql"},{"source":"adapters/postgres/patches/0026-live-ledger-balance-pairs.sql","member":"patches/0026-live-ledger-balance-pairs.sql"}],"full":{"profile":"source-confirmed-native-exact26-r3-v1","patchLevel":"26_hv2_history_set_guards_from_v22","catalogProfiles":{"legacy-v1":{"format":"EXACT26_RUNTIME_CATALOG_EXPORT_V1","patchLevel":"26_hv2_history_set_guards_from_v22","aclProofField":null},"complete-write-v6":{"format":"EXACT26_RUNTIME_CATALOG_EXPORT_V6","patchLevel":"26_hv2_history_set_guards_complete_write_xmin_from_v22","aclProofField":"complete_write_xmin_acl_match"},"recorded-live-ledger-v7":{"format":"EXACT26_RUNTIME_CATALOG_EXPORT_V7","patchLevel":"26_hv2_live_ledger_pairs_complete_write_xmin_from_v22","aclProofField":"complete_write_xmin_acl_match","observationProofField":"recorded_live_balance_contract_match","requiredObservation":"RECORDED_LIVE_LEDGER_PAIRS_V7","runtimeSqlPatch":"adapters/postgres/patches/0026-live-ledger-balance-pairs.sql"},"recorded-live-write-v8":{"format":"EXACT26_RUNTIME_CATALOG_EXPORT_V8","patchLevel":"26_hv2_live_pairs_complete_write_acl_v8_from_v7","aclProofField":"complete_write_system_acl_match_v8","deleteAclProofField":"normal_delete_acl_match_v8","observationProofField":"recorded_live_balance_contract_match","requiredObservation":"RECORDED_LIVE_LEDGER_PAIRS_COMPLETE_WRITE_V8","runtimeSqlPatch":"adapters/postgres/patches/0026-live-ledger-balance-pairs.sql"}}},"node":"24.21.0","requestBodyBudgets":[{"path":"/api/products/media/uploads","bytes":8388608},{"path":"/api/imported-history/sales/revise","bytes":4194304},{"path":"/api/imported-history/transfers/revise","bytes":4194304},{"path":"/api/products/commands","bytes":1048576},{"path":"/api/products/v2/commands","bytes":1048576},{"path":"/api/catalogue/categories/commands","bytes":1048576},{"path":"/api/sales/prepare-create","bytes":131072},{"path":"/api/sales/prepare-existing","bytes":131072},{"path":"/api/sales/commands","bytes":524288},{"path":"/api/transfers/prepare-create","bytes":131072},{"path":"/api/transfers/prepare-existing","bytes":131072},{"path":"/api/transfers/commands","bytes":524288}],"entrypoints":{"frontend":{"source":"apps/web/demo-replica/frontend/production-bootstrap.ts","member":"web/application.js"},"backend":{"source":"apps/api/src/production-main.ts","member":"backend/production-main.js"}}}''')
RELEASE_CONTRACT_SOURCE = json.loads(r'''{"path":"config/release-contract.json","bytes":5072,"sha256":"1edbdedcf4297393e6946142f400c6c7596dde4e42e95240af058beee8a6c1f1"}''')
# END GENERATED RELEASE CONTRACT
FULL_PROFILE = RELEASE_CONTRACT['full']['profile']
FULL_PATCH = RELEASE_CONTRACT['full']['patchLevel']


class Refused(Exception):
    pass


def need(condition, code):
    if not condition:
        raise Refused(code)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


def relative(value):
    need(isinstance(value, str) and 0 < len(value) <= 1024 and not re.search(r'[\\\x00-\x20\x7f:]', value), 'UNSAFE_RELATIVE_MEMBER')
    p = PurePosixPath(value)
    need(not p.is_absolute() and str(p) == value and all(x not in ('', '.', '..') and not x.startswith('.') for x in p.parts), 'UNSAFE_RELATIVE_MEMBER')
    return value


def canonical(value, kind='file', private=False, root=None):
    need(isinstance(value, (str, Path)), 'ABSOLUTE_REFERENCE_REQUIRED')
    p = Path(value)
    need(p.is_absolute() and str(p) == os.path.normpath(str(value)), 'CANONICAL_ABSOLUTE_REFERENCE_REQUIRED')
    if root is not None:
        need(p != root and p.is_relative_to(root), 'REFERENCE_OUTSIDE_OWNED_ROOT')
    for q in [*reversed(p.parents), p]:
        need(not q.is_symlink(), 'SYMLINK_REFERENCE_REFUSED')
    s = p.lstat()
    need(stat.S_ISDIR(s.st_mode) if kind == 'directory' else stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'REGULAR_REFERENCE_REQUIRED')
    need(not s.st_mode & 0o022, 'REFERENCE_WRITABLE_BY_OTHERS')
    need(p.resolve() == p, 'NONCANONICAL_REFERENCE_REFUSED')
    if private:
        need(not (s.st_mode & 0o077), 'PRIVATE_REFERENCE_PERMISSIONS_REQUIRED')
    return p


def bytes_file(filename, limit=2 * 1024 * 1024, private=False):
    p = canonical(filename, private=private)
    before = p.lstat()
    need(before.st_size <= limit, 'REFERENCE_SIZE_LIMIT')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'REFERENCE_CHANGED')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            data = f.read(limit + 1)
        after = p.lstat()
        need(len(data) == before.st_size and len(data) <= limit and
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) ==
             (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns), 'REFERENCE_CHANGED')
        return data
    finally:
        os.close(fd)


def json_file(filename, private=False):
    try:
        return json.loads(bytes_file(filename, private=private))
    except (json.JSONDecodeError, UnicodeError):
        raise Refused('REFERENCE_JSON_INVALID') from None


def reference(ref, limit=2 * 1024 * 1024):
    need(isinstance(ref, dict) and HASH.fullmatch(ref.get('sha256', '')), 'HASH_BOUND_REFERENCE_REQUIRED')
    data = bytes_file(ref.get('path'), limit)
    need(digest(data) == ref['sha256'], 'REFERENCE_SHA256_CHANGED')
    try:
        return json.loads(data)
    except (json.JSONDecodeError, UnicodeError):
        raise Refused('REFERENCE_JSON_INVALID') from None


def fresh_time(value, maximum):
    try:
        instant = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        need(instant.tzinfo is not None, 'EVIDENCE_UTC_REQUIRED')
        age = (dt.datetime.now(dt.timezone.utc) - instant).total_seconds()
    except (TypeError, ValueError, AttributeError):
        raise Refused('EVIDENCE_TIME_INVALID') from None
    need(-30 <= age <= maximum, 'EVIDENCE_STALE_OR_FUTURE')


def new_json(filename, value):
    data = encoded(value)
    fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


def replace_json(filename, value):
    p = canonical(filename, private=True)
    temporary = p.with_name(p.name + '.new')
    new_json(temporary, value)
    os.replace(temporary, p)
    fd = os.open(p.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def file_identity(filename):
    s = canonical(filename, private=True).stat()
    # A private configuration's content/hash never enters public plans or receipts.
    return {'device': s.st_dev, 'inode': s.st_ino, 'bytes': s.st_size, 'mtimeNs': s.st_mtime_ns,
            'uid': s.st_uid, 'gid': s.st_gid, 'mode': stat.S_IMODE(s.st_mode)}


# Exact baseline approved source/member mapping. Candidate successors require SQL-owner approval.
APPROVED_SQL_PATCHES = {row['source']: row['member'] for row in RELEASE_CONTRACT['runtimeSqlPatches']}


def validate_sql_members(manifest, source, approvedPatchMap):
    expected = {}
    migrations = []
    for row in source.get('files', []):
        name = row.get('path', '')
        if re.fullmatch(r'adapters/postgres/migrations/[0-9]{4}_[A-Za-z0-9_-]+\.sql', name):
            need(name not in expected, 'DUPLICATE_SQL_SOURCE')
            expected[name] = row
            migrations.append(name)
    need(len(migrations) == RELEASE_CONTRACT['migrationCount'] and {int(PurePosixPath(n).name.split('_', 1)[0]) for n in migrations} == set(range(1, RELEASE_CONTRACT['migrationCount'] + 1)), 'FULL_SAME_MIGRATION_SOURCES_REQUIRED')
    sources = {r['path']: r for r in source.get('files', [])}
    mapping = {name: name.removeprefix('adapters/postgres/') for name in migrations}
    for name, member in approvedPatchMap.items():
        need(re.fullmatch(r'adapters/postgres/patches/[A-Za-z0-9_-]+\.sql', name) and member == name.removeprefix('adapters/postgres/') and name in sources, 'APPROVED_PATCH_SOURCE_REQUIRED')
        mapping[name] = member
        expected[name] = sources[name]
    rows = [r for r in manifest['members'] if r.get('role') == 'migration' or r.get('path', '').startswith(('migrations/', 'patches/'))]
    need(len(rows) == len(mapping) and len({r['path'] for r in rows}) == len(rows), 'EXACT_SQL_MEMBER_SET_REQUIRED')
    seen = set()
    for row in rows:
        name = row.get('sourcePath')
        need(row.get('role') == 'migration' and name in mapping and row['path'] == mapping[name] and name not in seen and
             all(row.get(k) == expected[name].get(k) for k in ('bytes', 'sha256')), 'EXACT_SQL_SOURCE_BINDING_REQUIRED')
        seen.add(name)
    need(seen == set(mapping), 'EXACT_SQL_MEMBER_SET_REQUIRED')
    return {'migrationCount': RELEASE_CONTRACT['migrationCount'], 'patchCount': len(approvedPatchMap)}


def member_allowed(name, approvedPatchMap=None):
    relative(name)
    # Exact approved migration, not product-media data; archive/hash checks still apply.
    if name == 'migrations/0022_product_media_retained_delete.sql':
        return
    runtime_media_module = bool(re.fullmatch(r'web/chunks/product-editor-media-[A-Z0-9]{8}\.js', name))
    need(runtime_media_module or not re.search(r'(?:^|[/_.-])(?:secret|private|password|credential|token|backup|fixture|synthetic|test|media|node_modules)(?:s?)(?:$|[/_.-])', name, re.I), 'NON_RUNTIME_ARCHIVE_MEMBER')
    if name in ('release-manifest.json', 'package.json', 'package-lock.json', RELEASE_CONTRACT['fontLicense']['member']) or name in (APPROVED_SQL_PATCHES if approvedPatchMap is None else approvedPatchMap).values():
        return
    need(bool(re.fullmatch(r'web/[A-Za-z0-9_./-]+\.(?:html|js|mjs|css|json|svg|woff2?)', name)) or
         bool(re.fullmatch(r'backend/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|json)', name)) or
         bool(re.fullmatch(r'migrations/[0-9]{4}_[A-Za-z0-9_-]+\.sql', name)), 'NON_RUNTIME_ARCHIVE_MEMBER')


def verified_archive(archive_ref, manifest_ref, build_id, source_commit):
    """Read and validate before any destination/daemon action; no tarfile.extract(all)."""
    manifest_bytes = bytes_file(manifest_ref.get('path'), 16 * 1024 * 1024)
    need(digest(manifest_bytes) == manifest_ref.get('sha256'), 'RELEASE_MANIFEST_SHA256_MISMATCH')
    manifest = json.loads(manifest_bytes)
    need(manifest.get('format') == 'naijue-release-v1' and manifest.get('buildId') == build_id and
         manifest.get('sourceCommit') == source_commit and manifest.get('publicOrigin') == ORIGIN and manifest.get('apiPrefix') == '/api', 'RELEASE_IDENTITY_MISMATCH')
    records = manifest.get('members')
    need(isinstance(records, list) and 1 <= len(records) < 10000, 'FINITE_ARCHIVE_MEMBER_MANIFEST_REQUIRED')
    expected = {}
    for row in records:
        member_allowed(row.get('path'))
        need(row['path'] != 'release-manifest.json' and row['path'] not in expected and
             HASH.fullmatch(row.get('sha256', '')) and isinstance(row.get('bytes'), int) and 0 <= row['bytes'] <= 64 * 1024 * 1024, 'INVALID_ARCHIVE_MEMBER_RECORD')
        expected[row['path']] = row
    expected['release-manifest.json'] = {'path': 'release-manifest.json', 'bytes': len(manifest_bytes), 'sha256': digest(manifest_bytes)}
    need({'package.json', 'package-lock.json', 'web/index.html', RELEASE_CONTRACT['entrypoints']['backend']['member']} <= set(expected), 'RUNTIME_ENTRY_MEMBERS_REQUIRED')
    archive = canonical(archive_ref.get('path'))
    data = bytes_file(archive, 128 * 1024 * 1024)
    need(len(data) == archive_ref.get('bytes') and digest(data) == archive_ref.get('sha256'), 'ARCHIVE_SHA256_OR_SIZE_MISMATCH')
    entries, directories, total, count = {}, set(), 0, 0
    with tarfile.open(archive, 'r:gz') as tar:
        for item in tar:
            count += 1
            need(count <= 20000, 'ARCHIVE_ENTRY_COUNT_LIMIT')
            name = item.name
            if name in ('.', './') and item.isdir():
                continue
            if name.startswith('./'):
                name = name[2:]
            if item.isdir():
                name = name.rstrip('/')
                relative(name)
                need(name not in directories, 'DUPLICATE_ARCHIVE_DIRECTORY')
                directories.add(name)
                continue
            member_allowed(name)
            need(item.isfile() and not item.issparse() and not item.linkname and name in expected and name not in entries,
                 'ARCHIVE_LINK_EXTRA_OR_DUPLICATE_MEMBER')
            need(item.size == expected[name]['bytes'], 'ARCHIVE_MEMBER_SIZE_MISMATCH')
            total += item.size
            need(total <= 256 * 1024 * 1024, 'ARCHIVE_EXPANSION_LIMIT')
            f = tar.extractfile(item)
            need(f is not None, 'ARCHIVE_FILE_UNREADABLE')
            content = f.read(item.size + 1)
            need(len(content) == item.size and digest(content) == expected[name]['sha256'], 'ARCHIVE_MEMBER_HASH_MISMATCH')
            entries[name] = content
    need(set(entries) == set(expected), 'ARCHIVE_MEMBER_SET_MISMATCH')
    parents = {str(parent) for name in entries for parent in PurePosixPath(name).parents if str(parent) != '.'}
    need(directories <= parents, 'EXTRA_ARCHIVE_DIRECTORY')
    need(entries['release-manifest.json'] == manifest_bytes, 'EMBEDDED_RELEASE_MANIFEST_MISMATCH')
    return manifest, entries


def nginx_configuration(app_name):
    need(re.fullmatch(r'naijue-rewrite-[a-z0-9-]{1,55}-app', app_name), 'EXACT_CANDIDATE_APP_NAME_REQUIRED')
    def location(path, body=None, read_seconds=30):
        settings = '      proxy_pass http://\'\'\' + app_name + \'\'\':3000;\n      proxy_http_version 1.1;\n      proxy_set_header Connection "";\n      proxy_set_header Host \'\'\' + HOST + \'\'\';\n      proxy_set_header Forwarded "";\n      proxy_set_header X-Forwarded-For "";\n      proxy_set_header X-Real-IP "";\n      proxy_set_header X-Forwarded-Host "";\n      proxy_set_header X-Forwarded-Proto "";\n      proxy_set_header X-Forwarded-Port "";\n      proxy_connect_timeout 5s;\n      proxy_read_timeout 30s;\n      proxy_send_timeout 30s;\n      proxy_next_upstream off;\n      proxy_cache off;\n      proxy_redirect off;\n'
        settings = settings.replace("''' + app_name + '''", app_name).replace("''' + HOST + '''", HOST)
        settings = settings.replace('proxy_read_timeout 30s;', 'proxy_read_timeout %ss;' % read_seconds)
        budget = ('      client_max_body_size %s;\n' % body) if body is not None else ''
        return '    location ' + path + ' {\n' + budget + settings + '    }\n'
    locations = location('/')
    for row in RELEASE_CONTRACT['requestBodyBudgets']:
        locations += location('= ' + row['path'], row['bytes'])
    locations += location('= /api/inventory/output/query', read_seconds=130)
    return ('''worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 256; }
http {
  server_tokens off;
  access_log off;
  client_body_temp_path /tmp/client_body;
  proxy_temp_path /tmp/proxy;
  client_max_body_size 64k;
  # The captured application owns successful immutable-asset policy. Retain
  # no-store for proxy errors or any upstream response without a policy.
  map "$upstream_status:$upstream_http_cache_control" $naijue_response_cache_control {
    ~^200:.+ $upstream_http_cache_control;
    default "no-store";
  }
  server {
    listen 8080;
    server_name ''' + HOST + ''';
    if ($http_host != "''' + HOST + '''") { return 421; }
    proxy_hide_header Cache-Control;
    add_header Cache-Control $naijue_response_cache_control always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
''' + locations + '''
  }
}
''').encode()


def exact26_r1(p):
    selector = p.get('runtimeSelector', 'schema19')
    need(selector in ('schema19', 'exact26-r1'), 'UNKNOWN_RUNTIME_SELECTOR')
    if selector == 'schema19':
        need('runtime26' not in p, 'EXACT26_INPUTS_REQUIRE_EXPLICIT_SELECTOR')
        return False
    refs = p.get('runtime26')
    need(isinstance(refs, dict) and set(refs) == {'upgradeReceipt', 'review', 'independentReview', 'buildReceipt', 'sourceManifest', 'buildManifest'}, 'CLOSED_EXACT26_REFERENCES_REQUIRED')
    for row in refs.values():
        need(isinstance(row, dict) and set(row) == {'path', 'sha256'} and HASH.fullmatch(row.get('sha256', '')), 'HASH_BOUND_EXACT26_REFERENCE_REQUIRED')
        canonical(row.get('path'), root=capacity_artifact_root(p))
    need(len({row['path'] for row in refs.values()}) == len(refs), 'DISTINCT_EXACT26_REFERENCES_REQUIRED')
    return True


def credential_key_binding(p):
    """Private file stat identity only. Never read/hash credential bytes."""
    key = p['runtime26Full']['credentialRequestKey']
    need(isinstance(key, dict) and set(key) == {'hostFile', 'containerFile'}, 'CLOSED_CREDENTIAL_KEY_REFERENCE_REQUIRED')
    need(key.get('containerFile') == '/run/naijue-rewrite/credential-request.key', 'EXACT_PRIVATE_CREDENTIAL_CONTAINER_FILE_REQUIRED')
    host = key.get('hostFile')
    need(isinstance(host, str) and not re.search(r'[\s,:\\\x00-\x1f]', host), 'EXACT_PRIVATE_CREDENTIAL_HOST_FILE_REQUIRED')
    filename = canonical(host, private=True, root=ROOT)
    need(not filename.is_relative_to(ROOT / 'releases') and not filename.is_relative_to(Path(p['runtime26Full']['media']['hostRoot'])), 'SEPARATE_PRIVATE_CREDENTIAL_FILE_REQUIRED')
    if 'inventorySpool' in p['runtime26Full']:
        need(not filename.is_relative_to(Path(p['runtime26Full']['inventorySpool']['hostRoot'])), 'SEPARATE_PRIVATE_CREDENTIAL_FILE_REQUIRED')
    identity = file_identity(filename)
    need(identity['bytes'] == 32 and identity['mode'] == 0o600 and identity['uid'] == int(p['limits']['app']['user'].split(':')[0]), 'EXACT_PRIVATE_CREDENTIAL_FILE_IDENTITY_REQUIRED')
    need(not filename.parent.stat().st_mode & 0o022, 'PRIVATE_CREDENTIAL_PARENT_REQUIRED')
    return {'hostFile': str(filename), 'containerFile': key['containerFile'], 'identity': identity}


def validate_full_credential(p, runtime):
    selected = runtime.get('staffMaintenance') is True
    present = 'credentialRequestKey' in p['runtime26Full']
    need(selected == present and selected == ('staffCredentialRequestKeyFile' in runtime), 'STAFF_PRIVATE_CREDENTIAL_SELECTION_MISMATCH')
    if selected:
        key = credential_key_binding(p)
        need(runtime['staffCredentialRequestKeyFile'] == key['containerFile'], 'STAFF_PRIVATE_CREDENTIAL_PATH_MISMATCH')


def exact26_full(p):
    if p.get('runtimeSelector') != 'exact26-full':
        return False
    need('runtime26' not in p, 'FULL_MUST_NOT_REUSE_R1_REFERENCES')
    full = p.get('runtime26Full')
    need(isinstance(full, dict) and {'references', 'media'} <= set(full) <= {'references', 'media', 'inventorySpool', 'credentialRequestKey', 'catalogProfile'}, 'CLOSED_FULL_REFERENCES_REQUIRED')
    full_catalog_profile(p)
    refs = full['references']
    need(isinstance(refs, dict) and set(refs) == FULL_REFERENCES, 'CLOSED_FULL_REFERENCES_REQUIRED')
    for ref in refs.values():
        need(isinstance(ref, dict) and set(ref) == {'path', 'sha256'} and HASH.fullmatch(ref.get('sha256', '')), 'PINNED_FULL_REFERENCE_REQUIRED')
        path = Path(ref.get('path', ''))
        need(path.is_absolute() and str(path) == os.path.normpath(str(path)) and path != ROOT and path.is_relative_to(ROOT), 'PERMANENT_FULL_REFERENCE_REQUIRED')
    need(len({r['path'] for r in refs.values()}) == len(refs), 'DISTINCT_FULL_REFERENCES_REQUIRED')
    media = full['media']
    need(isinstance(media, dict) and set(media) == {'hostRoot', 'containerRoot', 'rootKey', 'writable'} and media['writable'] is True, 'FULL_R3_PRIVATE_WRITABLE_MEDIA_REQUIRED')
    for key in ('hostRoot', 'containerRoot'):
        path = Path(media.get(key, ''))
        need(path.is_absolute() and str(path) == os.path.normpath(str(path)) and not re.search(r'[\s,:\\\x00-\x1f]', str(path)), 'EXACT_FULL_MEDIA_PATH_REQUIRED')
    need(Path(media['hostRoot']) != ROOT and Path(media['hostRoot']).is_relative_to(ROOT) and not Path(media['hostRoot']).is_relative_to(ROOT / 'releases') and
         media['containerRoot'].startswith('/run/naijue-rewrite/media/') and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', media.get('rootKey', '')), 'PRIVATE_FULL_MEDIA_ROOT_REQUIRED')
    need(p.get('newDatabaseReceipt') == refs['metadata'], 'FULL_CURRENT_METADATA_NOT_OLD_SCHEMA19_REQUIRED')
    if 'inventorySpool' in full:
        spool = full['inventorySpool']
        need(isinstance(spool, dict) and set(spool) == {'hostRoot', 'containerRoot'} and spool['containerRoot'] == '/private/inventory-exports', 'FULL_PRIVATE_SPOOL_REQUIRED')
        path = Path(spool.get('hostRoot', ''))
        need(path.is_absolute() and str(path) == os.path.normpath(str(path)) and path != ROOT and path.is_relative_to(ROOT) and
             not path.is_relative_to(ROOT / 'releases') and not re.search(r'[\s,:\\\x00-\x1f]', str(path)) and
             not path.is_relative_to(Path(media['hostRoot'])) and not Path(media['hostRoot']).is_relative_to(path), 'SEPARATE_FULL_PRIVATE_SPOOL_REQUIRED')
    if 'credentialRequestKey' in full:
        credential_key_binding(p)
    return True


def exact26_selected(p):
    if exact26_full(p):
        return True
    need('runtime26Full' not in p, 'FULL_REFERENCES_REQUIRE_EXPLICIT_SELECTOR')
    return exact26_r1(p)


def runtime_references(p):
    return p['runtime26Full']['references'] if exact26_full(p) else p['runtime26']


def runtime_binding(p):
    # Public reference/stat binding only; never hash the private runtime bytes.
    if not exact26_selected(p):
        return None
    value = {'selector': p['runtimeSelector'], 'references': runtime_references(p), 'runtimeFile': p['runtimeConfiguration'],
             'capacityHost': p.get('capacityHost'), 'capacityGate': p.get('capacityGate'), 'capacityFinalInput': p.get('capacityFinalInput')}
    if 'capacityQaObserver' in p: value['capacityQaObserver'] = p['capacityQaObserver']
    if exact26_full(p):
        profile = full_catalog_profile(p)
        if p['runtime26Full'].get('catalogProfile', 'legacy-v1') != 'legacy-v1':
            value['catalogBindingVersion'] = 2
            value['catalogProfile'] = profile
        value['media'] = p['runtime26Full']['media']
        value['inventorySpool'] = p['runtime26Full'].get('inventorySpool')
        if 'credentialRequestKey' in p['runtime26Full']:
            value['credentialRequestKey'] = credential_key_binding(p)
    return digest(encoded(value))


def validate_runtime_build(p, manifest, refs):
    source, build, receipt = reference(refs['sourceManifest'], 16 * 1024 * 1024), reference(refs['buildManifest'], 16 * 1024 * 1024), reference(refs['buildReceipt'])
    need(refs['sourceManifest']['sha256'] == manifest.get('sourceManifestSha256') and refs['buildManifest']['sha256'] == manifest.get('buildManifestSha256') and
         source.get('format') == 'naijue-release-source-v1' and build.get('format') == 'naijue-release-build-v1' and
         receipt.get('format') == 'naijue-production-build-receipt-v1' and receipt.get('status') == 'REAL_BUILD_AND_PACK_CONTRACT_VALIDATED' and
         all(row.get('sourceCommit') == p['sourceCommit'] and row.get('buildId') == p['buildId'] for row in (source, build, receipt)) and
         receipt.get('sourceManifestSha256') == refs['sourceManifest']['sha256'] and receipt.get('buildManifestSha256') == refs['buildManifest']['sha256'] and
         receipt.get('node') == RELEASE_CONTRACT['node'], 'EXACT26_SAME_FIXED_BUILD_REQUIRED')
    graph = manifest.get('graphs', {}).get('backend', {})
    component = build.get('components', {}).get('backend', {})
    inputs = graph.get('inputs', [])
    required = {RELEASE_CONTRACT['entrypoints']['backend']['source'], 'apps/api/src/production-provider-composition.ts', 'apps/api/src/production-application-host.ts',
                'apps/api/src/postgres-read-api.ts', 'adapters/postgres/src/bounded-pool.ts', 'adapters/postgres/src/native-import-accounting-capability.ts'}
    if exact26_full(p):
        required.add('adapters/postgres/src/history-revision-store.ts')
    source_inputs = {row['path']: row for row in source.get('files', [])}
    need(source_inputs.get(RELEASE_CONTRACT_SOURCE['path']) == RELEASE_CONTRACT_SOURCE,
         'EXACT_RELEASE_CONTRACT_SOURCE_REQUIRED')
    need(manifest.get('entrypoints', {}).get('backend') == RELEASE_CONTRACT['entrypoints']['backend']['member'] and
         graph.get('entrySource') == component.get('entrySource') == RELEASE_CONTRACT['entrypoints']['backend']['source'] and
         graph.get('entryOutput') == component.get('entryOutput') == RELEASE_CONTRACT['entrypoints']['backend']['member'] and
         inputs and inputs == component.get('inputs') and required <= {row['path'] for row in inputs} and
         all(row == source_inputs.get(row['path']) for row in inputs), 'EXACT26_NATIVE_BACKEND_GRAPH_REQUIRED')
    build_outputs = {row.get('member'): row for row in build.get('files', []) if row.get('role') == 'backend'}
    need(graph.get('outputs') and all(name in build_outputs and any(row['path'] == name and row['sha256'] == build_outputs[name]['sha256'] and
         row['bytes'] == build_outputs[name]['bytes'] for row in manifest['members']) for name in graph['outputs']), 'EXACT26_NATIVE_OUTPUT_BINDING_REQUIRED')



CAPACITY_VOLUMES = ('postgres', 'wal', 'backup', 'system', 'media')
CAPACITY_DIRECTORY = '/run/naijue-rewrite/capacity'
CAPACITY_COLLECTOR = CAPACITY_DIRECTORY + '/capacity-live-statfs.mjs'
CAPACITY_PROFILE = CAPACITY_DIRECTORY + '/owner-profile.json'


def capacity_bag(value, keys):
    need(type(value) is dict and set(value) == set(keys), 'CLOSED_CAPACITY_FIELDS_REQUIRED')
    return value


def capacity_number(value, positive=True):
    return type(value) is int and (value > 0 if positive else value >= 0) and value <= 9007199254740991


def capacity_text(value):
    return isinstance(value, str) and 0 < len(value) <= 4096 and not re.search(r'[\x00-\x1f\x7f]', value)


def capacity_path(value):
    return capacity_text(value) and Path(value).is_absolute() and os.path.normpath(value) == value and not re.search(r'[,\s\\]', value)


def capacity_bytes(value):
    capacity_bag(value, CAPACITY_VOLUMES)
    need(all(isinstance(v, str) and re.fullmatch(r'(?:0|[1-9][0-9]*)', v) for v in value.values()), 'EXPLICIT_CAPACITY_BYTES_REQUIRED')


def capacity_host_binding(p, verify_files=True):
    artifact_root = capacity_artifact_root(p)
    host = capacity_bag(p.get('capacityHost'), ('collector', 'profile', 'interpreter', 'reviewSha256'))
    need(isinstance(host['reviewSha256'], str) and HASH.fullmatch(host['reviewSha256']), 'CAPACITY_REVIEW_PIN_REQUIRED')
    for key, destination in [('collector', CAPACITY_COLLECTOR), ('profile', CAPACITY_PROFILE)]:
        row = capacity_bag(host[key], ('hostFile', 'containerFile', 'sha256'))
        need(capacity_path(row['hostFile']) and Path(row['hostFile']).is_relative_to(artifact_root) and
             row['containerFile'] == destination and isinstance(row['sha256'], str) and HASH.fullmatch(row['sha256']), 'EXACT_CAPACITY_ARTIFACT_REQUIRED')
        if verify_files:
            source = canonical(row['hostFile'], root=artifact_root)
            info, parent = source.stat(), source.parent.stat()
            need(info.st_uid in (0, int(p['limits']['app']['user'].split(':')[0])) and parent.st_uid in (0, info.st_uid) and
                 not parent.st_mode & 0o022 and (info.st_mode & 0o004 or key == 'profile' and info.st_uid == int(p['limits']['app']['user'].split(':')[0]) and info.st_mode & 0o400) and info.st_size <= 65536 and
                 (key != 'collector' or info.st_mode & 0o111) and file_hash(source) == row['sha256'], 'CAPACITY_ARTIFACT_IDENTITY_CHANGED')
            if key == 'collector':
                need(bytes_file(source).startswith(b'#!/usr/local/bin/node\n'), 'PINNED_CAPACITY_INTERPRETER_REQUIRED')
    interpreter = capacity_bag(host['interpreter'], ('containerFile', 'sha256', 'imageId'))
    need(interpreter['containerFile'] == '/usr/local/bin/node' and isinstance(interpreter['sha256'], str) and HASH.fullmatch(interpreter['sha256']) and
         interpreter['imageId'] == p['images']['node']['id'], 'EXACT_CAPACITY_INTERPRETER_IMAGE_REQUIRED')
    return host


def capacity_runtime_configuration(p, runtime, pending=False):
    """Validate the complete private host field BEFORE stripping it for original closed business guards."""
    if pending:
        need(type(runtime) is dict and 'capacityLaunch' not in runtime, 'PROVISIONAL_MUST_NOT_REUSE_CAPACITY_APPROVAL')
        capacity_host_binding(p); capacity_gate_binding(p)
        return dict(runtime)
    need(type(runtime) is dict and 'capacityLaunch' in runtime, 'EXPLICIT_CAPACITY_LAUNCH_REQUIRED')
    c = capacity_bag(runtime['capacityLaunch'], ('schemaVersion', 'profile', 'target', 'window', 'process', 'budgets',
        'minimumFreeBytes', 'safetyBytes', 'probeTtlMillis', 'probeTimeoutMillis', 'maxProbeWaiters', 'retryAfterSeconds', 'producer'))
    need(type(c['schemaVersion']) is int and c['schemaVersion'] == 1 and c['profile'] == 'OWNER_REVIEWED_CAPACITY_EXEC_V1', 'CAPACITY_PROFILE_REQUIRED')
    target = capacity_bag(c['target'], ('host', 'port', 'database', 'role', 'databaseOid', 'postmasterStart'))
    need(all(capacity_text(target[k]) for k in ('host', 'database', 'role', 'postmasterStart')) and capacity_number(target['port']) and target['port'] <= 65535 and
         isinstance(target['databaseOid'], str) and re.fullmatch(r'[1-9][0-9]*', target['databaseOid']), 'CAPACITY_EXACT_TARGET_REQUIRED')
    actual = runtime.get('postgres', {}).get('target', {})
    need(all(target[a] == actual.get(b) for a, b in [('host', 'host'), ('port', 'port'), ('database', 'database'), ('role', 'user')]), 'CAPACITY_RUNTIME_TARGET_MISMATCH')
    window = capacity_bag(c['window'], ('approved', 'token', 'inventoryObservedAt', 'startsAt', 'expiresAt', 'binding'))
    need(window['approved'] is True and capacity_text(window['token']) and len(window['token']) <= 256 and
         all(capacity_number(window[k]) for k in ('inventoryObservedAt', 'startsAt', 'expiresAt')) and
         window['inventoryObservedAt'] <= window['startsAt'] < window['expiresAt'] and window['startsAt'] <= time.time() * 1000 < window['expiresAt'], 'FRESH_APPROVED_CAPACITY_WINDOW_REQUIRED')
    binding = capacity_bag(window['binding'], ('candidateFingerprint', 'targetFingerprint', 'writerTopologyFingerprint', 'inventoryFingerprint',
        'processInstanceId', 'restartGeneration', 'writerCount', 'physicalVolumes'))
    need(all(capacity_text(binding[k]) and len(binding[k]) <= 256 for k in ('candidateFingerprint', 'targetFingerprint', 'writerTopologyFingerprint', 'inventoryFingerprint', 'processInstanceId')) and
         binding['candidateFingerprint'] == p['sourceCommit'] and capacity_number(binding['restartGeneration'], False) and
         type(binding['writerCount']) is int and binding['writerCount'] == 1, 'EXACT_SINGLE_WRITER_CAPACITY_BINDING_REQUIRED')
    capacity_bag(binding['physicalVolumes'], CAPACITY_VOLUMES)
    need(all(capacity_text(v) and len(v) <= 256 for v in binding['physicalVolumes'].values()), 'CAPACITY_PHYSICAL_VOLUME_REQUIRED')
    process = capacity_bag(c['process'], ('pid', 'linuxStartTicks', 'linuxBootId'))
    need(capacity_number(process['pid']) and isinstance(process['linuxStartTicks'], str) and re.fullmatch(r'(?:0|[1-9][0-9]*)', process['linuxStartTicks']) and
         isinstance(process['linuxBootId'], str) and re.fullmatch(r'[a-f0-9-]{36}', process['linuxBootId']) and
         binding['processInstanceId'] == f"{process['linuxBootId']}:{process['pid']}:{process['linuxStartTicks']}", 'CAPACITY_PROCESS_BINDING_REQUIRED')
    capacity_bag(c['budgets'], ('session', 'upload'))
    for value in c['budgets'].values():
        capacity_bag(value, ('maxAdmissions', 'maxInFlight', 'worstCaseBytes'))
        need(capacity_number(value['maxAdmissions']) and capacity_number(value['maxInFlight']) and value['maxInFlight'] <= value['maxAdmissions'], 'FINITE_CAPACITY_BUDGET_REQUIRED')
        capacity_bytes(value['worstCaseBytes'])
        need(any(int(v) > 0 for v in value['worstCaseBytes'].values()), 'NONZERO_CAPACITY_DEMAND_REQUIRED')
    for k in ('minimumFreeBytes', 'safetyBytes'): capacity_bytes(c[k])
    need(all(capacity_number(c[k]) for k in ('probeTtlMillis', 'probeTimeoutMillis', 'maxProbeWaiters', 'retryAfterSeconds')) and
         c['probeTimeoutMillis'] <= c['probeTtlMillis'] <= 30000, 'BOUNDED_CAPACITY_PROBE_REQUIRED')
    producer = capacity_bag(c['producer'], ('executable', 'sha256', 'args', 'timeoutMillis', 'maxOutputBytes', 'reviewSha256', 'volumes'))
    host = capacity_host_binding(p)
    need(producer['executable'] == CAPACITY_COLLECTOR and producer['sha256'] == host['collector']['sha256'] and
         producer['reviewSha256'] == host['reviewSha256'] and producer['args'] == ['--profile=' + host['profile']['sha256']] and
         capacity_number(producer['timeoutMillis']) and producer['timeoutMillis'] <= c['probeTimeoutMillis'] and
         capacity_number(producer['maxOutputBytes']) and producer['maxOutputBytes'] <= 65536, 'OWNER_FIXED_CAPACITY_PRODUCER_REQUIRED')
    capacity_bag(producer['volumes'], CAPACITY_VOLUMES)
    profile = json.loads(bytes_file(host['profile']['hostFile'], 65536))
    remote = profile.get('profile') == 'OWNER_QA_FIFO_STATFS_V1'
    capacity_bag(profile, ('schemaVersion', 'profile', 'reviewSha256', 'target', 'binding', 'windowToken', 'startsAt', 'expiresAt', 'maxAgeMillis',
                           'ipc' if remote else 'namespace', 'volumes'))
    need(type(profile['schemaVersion']) is int and profile['schemaVersion'] == 1 and
         profile['profile'] in ('OWNER_FIXED_STATFS_V1', 'OWNER_QA_FIFO_STATFS_V1') and
         profile['reviewSha256'] == host['reviewSha256'] and profile['target'] == target and profile['binding'] == binding and
         profile['windowToken'] == window['token'] and profile['startsAt'] == window['startsAt'] and profile['expiresAt'] == window['expiresAt'] and
         profile['maxAgeMillis'] == c['probeTtlMillis'], 'OWNER_CAPACITY_PROFILE_MISMATCH')
    if remote:
        capacity_qa_binding(p)
        need(profile['ipc'] == {'request': CAPACITY_LIVE+'/request.fifo', 'response': CAPACITY_LIVE+'/response.fifo'} and
             target == CAPACITY_QA_TARGET and window['expiresAt']-window['startsAt'] <= 240000 and
             window['expiresAt'] <= p['capacityQaObserver']['deadlineAt'], 'EXACT_QA_OBSERVER_PROFILE_REQUIRED')
    else:
        need(capacity_text(profile['namespace']), 'OWNER_CAPACITY_NAMESPACE_REQUIRED')
    capacity_bag(profile['volumes'], CAPACITY_VOLUMES)
    devices, physical = {}, {}
    for k, mapping in producer['volumes'].items():
        capacity_bag(mapping, ('path', 'physicalVolume', 'namespace'))
        observed = capacity_bag(profile['volumes'][k], ('path', 'physicalVolume', 'namespace', 'device', 'filesystemType'))
        need(capacity_path(mapping['path']) and mapping['physicalVolume'] == binding['physicalVolumes'][k] and
             capacity_text(mapping['namespace']) and (remote or mapping['namespace'] == profile['namespace']) and
             all(observed[n] == mapping[n] for n in mapping) and
             all(isinstance(observed[n], str) and re.fullmatch(r'(?:0|[1-9][0-9]*)', observed[n]) for n in ('device', 'filesystemType')), 'OWNER_CAPACITY_VOLUME_MISMATCH')
        if remote:
            need(mapping['path'] == CAPACITY_QA_PATHS[k], 'FIXED_QA_VOLUME_PATH_REQUIRED')
            identity = (observed['namespace'], observed['device'], observed['filesystemType'])
            need(devices.get(identity, mapping['physicalVolume']) == mapping['physicalVolume'] and
                 physical.get(mapping['physicalVolume'], identity) == identity, 'QA_PHYSICAL_VOLUME_ALIAS_MISMATCH')
            devices[identity], physical[mapping['physicalVolume']] = mapping['physicalVolume'], identity
    if 'productMedia' in runtime: need(producer['volumes']['media']['path'] == runtime['productMedia']['root'], 'CAPACITY_MEDIA_ROOT_MISMATCH')
    return {k: v for k, v in runtime.items() if k != 'capacityLaunch'}


def full_catalog_profile(p):
    """Finite explicit V1/V6/V7/V8 semantics; never infer compatibility from review bytes."""
    full = p.get('runtime26Full')
    need(isinstance(full, dict), 'CLOSED_FULL_REFERENCES_REQUIRED')
    selected = full.get('catalogProfile', 'legacy-v1')
    need(isinstance(selected, str) and selected in RELEASE_CONTRACT['full']['catalogProfiles'],
         'EXPLICIT_SUPPORTED_FULL_CATALOG_PROFILE_REQUIRED')
    return RELEASE_CONTRACT['full']['catalogProfiles'][selected]


def validate_full_metadata(p, runtime, review, metadata, independent, capacity_pending=False):
    """Fresh original issuer observation/review, without old C38/catalog constants."""
    runtime = capacity_runtime_configuration(p, runtime, capacity_pending)
    refs = runtime_references(p)
    required = {'schemaVersion', 'profile', 'documentCommands', 'publicOrigin', 'http', 'assets', 'build', 'postgres', 'authentication', 'runtime26Review', 'existingPreparation', 'productMedia'}
    optional = {'organizationMaintenance', 'catalogueMaintenance', 'paymentMaintenance', 'partyMaintenance', 'staffMaintenance', 'productMaintenance', 'inventoryOutputSpool', 'staffCredentialRequestKeyFile'}
    need(isinstance(runtime, dict) and required <= set(runtime) and set(runtime) <= required | optional and runtime['schemaVersion'] == 1 and
         runtime['profile'] == FULL_PROFILE and runtime['documentCommands'] == 'NATIVE_RUNTIME' and runtime['publicOrigin'] == ORIGIN and
         runtime['http'] == {'host': '0.0.0.0', 'port': 3000, 'acceptedHosts': [HOST]} and runtime['assets'] == {'root': '/app/web', 'entry': 'index.html'} and
         runtime['build'] == {'buildId': p['buildId'], 'sourceCommit': p['sourceCommit']} and runtime['runtime26Review'] ==
         {'reviewFile': RUNTIME26_REVIEW, 'trustedReviewSha256': refs['review']['sha256']}, 'CLOSED_FULL_R3_RUNTIME_REQUIRED')
    validate_full_credential(p, runtime)
    preparation = runtime['existingPreparation']
    need(isinstance(preparation, dict) and set(preparation) == {'sales', 'transfers'} and all(type(v) is bool for v in preparation.values()) and
         all(runtime[k] is True for k in optional - {'inventoryOutputSpool', 'staffCredentialRequestKeyFile'} if k in runtime), 'EXPLICIT_FULL_CAPABILITIES_REQUIRED')
    need(runtime['productMedia'] == {'root': p['runtime26Full']['media']['containerRoot'], 'rootKey': p['runtime26Full']['media']['rootKey']}, 'FULL_MEDIA_BINDING_CHANGED')
    need(('inventoryOutputSpool' in runtime) == ('inventorySpool' in p['runtime26Full']), 'FULL_SPOOL_SELECTION_CHANGED')
    if 'inventoryOutputSpool' in runtime:
        need(runtime['inventoryOutputSpool'] == {'directory': '/private/inventory-exports', 'maxBytes': 536870912, 'maxConcurrent': 1, 'maxDurationMs': 120000}, 'EXACT_FULL_OUTPUT_SPOOL_REQUIRED')
    catalog_profile = full_catalog_profile(p)
    v8_observation = catalog_profile.get('requiredObservation') == 'RECORDED_LIVE_LEDGER_PAIRS_COMPLETE_WRITE_V8'
    recorded_observation = v8_observation or catalog_profile.get('requiredObservation') == 'RECORDED_LIVE_LEDGER_PAIRS_V7'
    if recorded_observation:
        need(isinstance(review, dict) and isinstance(review.get('catalog'), dict) and
             set(review['catalog']) == {'format', 'patchLevel', 'sha256'}, 'CLOSED_V8_REVIEW_CATALOG_REQUIRED' if v8_observation else 'CLOSED_V7_REVIEW_CATALOG_REQUIRED')
    purposes = set(RUNTIME26_PURPOSES + ['PRODUCT_MAINTENANCE', 'HISTORY_REVISION'])
    need(isinstance(review, dict) and set(review) == {'version', 'decision', 'target', 'catalog', 'purposes', 'scope', 'independentReview', 'realImportExecutionAuthorized'} and
         review['version'] == 'C_NATIVE_RUNTIME26_REVIEW_V1' and review['decision'] == 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA' and
         review['scope'] == 'EXACT_TARGET_METADATA_ONLY' and review['realImportExecutionAuthorized'] is False and
         isinstance(review['purposes'], list) and len(review['purposes']) == len(purposes) and set(review['purposes']) == purposes and
         review['catalog'].get('format') == catalog_profile['format'] and review['catalog'].get('patchLevel') == catalog_profile['patchLevel'] and
         HASH.fullmatch(review['catalog'].get('sha256', '')), 'FRESH_FULL_PURPOSE_PROFILE_REVIEW_REQUIRED')
    need(independent.get('result') == 'PASS' and review['independentReview'] == {'path': RUNTIME26_INDEPENDENT, 'sha256': refs['independentReview']['sha256'], 'result': 'PASS'}, 'FULL_INDEPENDENT_REVIEW_REQUIRED')
    acl_field = catalog_profile['aclProofField']
    observation_field = catalog_profile.get('observationProofField')
    delete_acl_field = catalog_profile.get('deleteAclProofField')
    metadata_fields = {'identity', 'migration_versions', 'catalog_sha256', 'source_routines_match'}
    if acl_field is not None:
        metadata_fields.add(acl_field)
    if observation_field is not None:
        metadata_fields.add(observation_field)
    if delete_acl_field is not None:
        metadata_fields.add(delete_acl_field)
    need(isinstance(metadata, dict) and set(metadata) == metadata_fields and
         (acl_field is None or metadata.get(acl_field) is True) and
         (observation_field is None or metadata.get(observation_field) is True) and
         (delete_acl_field is None or metadata.get(delete_acl_field) is True) and
         metadata['migration_versions'] == list(range(1, 27)) and metadata['source_routines_match'] is True and metadata['catalog_sha256'] == review['catalog']['sha256'], 'FULL_CURRENT_SCHEMA_SOURCE_ACL_PROOF_REQUIRED')
    identity, target = metadata['identity'], review['target']
    if recorded_observation:
        # Match the genuine issuer's exact observation envelope, not a summary mock.
        need(isinstance(identity, dict) and set(identity) == {'database', 'database_oid', 'database_owner',
             'current_user', 'session_user', 'server_version_num', 'server_addr', 'server_port',
             'postmaster_start', 'replication_role'}, 'CLOSED_V8_ISSUER_IDENTITY_REQUIRED' if v8_observation else 'CLOSED_V7_ISSUER_IDENTITY_REQUIRED')
    need(isinstance(target, dict) and set(target) == {'database', 'databaseOid', 'actingRole', 'sessionUser', 'serverAddress', 'serverPort', 'postmasterStart'} and
         target.get('database') == DATABASE and target.get('actingRole') == ROLE and target.get('sessionUser') == ROLE and
         isinstance(target.get('databaseOid'), str) and re.fullmatch(r'[1-9][0-9]*', target['databaseOid']) and
         isinstance(target.get('postmasterStart'), str) and target['postmasterStart'] and
         (target['serverAddress'] is None or isinstance(target['serverAddress'], str) and target['serverAddress']) and
         (target['serverPort'] is None or type(target['serverPort']) is int and 1 <= target['serverPort'] <= 65535) and
         all(identity.get(a) == target.get(b) for a, b in [('database', 'database'), ('database_oid', 'databaseOid'), ('current_user', 'actingRole'), ('session_user', 'sessionUser'),
             ('server_addr', 'serverAddress'), ('server_port', 'serverPort'), ('postmaster_start', 'postmasterStart')]) and identity.get('replication_role') == 'origin', 'FULL_CURRENT_TARGET_CHANGED')


def validate_runtime26_full(p, manifest, runtime, capacity_pending=False):
    capacity_runtime_configuration(p, runtime, capacity_pending)
    refs = runtime_references(p)
    review = reference(refs['review'], 65536)
    validate_full_metadata(p, runtime, review, reference(refs['metadata']), reference(refs['independentReview'], 8 * 1024 * 1024), capacity_pending)
    validate_runtime_build(p, manifest, refs)
    source = reference(refs['sourceManifest'], 16 * 1024 * 1024)
    validate_sql_members(manifest, source, APPROVED_SQL_PATCHES)
    publication = reference(refs['publication'])
    batch, record = publication.get('batch', {}), publication.get('receipt', {})
    cp, result = batch.get('checkpoint', {}), record.get('result_data', {})
    need(batch.get('status') == 'IMPORTED' and batch.get('history_validation_passed') is True and HASH.fullmatch(batch.get('history_payload_hash', '')) and
         cp.get('counts') == cp.get('expected') and cp.get('counts', {}).get('IMPORT_BATCH') == 1 and cp.get('counts', {}).get('INVENTORY_LEDGER', 0) > 0 and
         record.get('action') == 'IMPORT_PUBLISH' and record.get('target_type') == 'IMPORT' and record.get('target_id') == batch.get('id') and record.get('status') == 'COMMITTED' and
         result.get('batchId') == batch.get('id') and result.get('operationId') == record.get('id') and result.get('status') == 'IMPORTED' and
         result.get('sequence') == cp.get('sequence') and result.get('cursor') == cp.get('cursor'), 'ACTUAL_FULL_PUBLISH_READBACK_REQUIRED')
    coverage = reference(refs['backupCoverage'])
    need(coverage.get('database') == DATABASE and coverage.get('buildId') == p['buildId'] and coverage.get('sourceCommit') == p['sourceCommit'] and
         coverage.get('schemaVersions') == list(range(1, 27)) and coverage.get('catalogSha256') == review['catalog']['sha256'] and coverage.get('target') == review['target'] and
         coverage.get('backupReceiptSha256') == p['backupReceipt']['sha256'] and coverage.get('runtimeIdentity') == p['runtimeConfiguration']['identity'] and
         coverage.get('media') == p['runtime26Full']['media'] and coverage.get('r1Protected') is True and
         coverage.get('isolatedRestore', {}).get('currentAppLoginRepresentativeRead') == 'PASS', 'CURRENT_FULL_R1_CONFIG_MEDIA_RESTORE_COVERAGE_REQUIRED')
    media = canonical(p['runtime26Full']['media']['hostRoot'], kind='directory', root=ROOT)
    need(media.stat().st_uid == int(p['limits']['app']['user'].split(':')[0]), 'FULL_PRIVATE_MEDIA_APP_OWNER_REQUIRED')
    if 'inventorySpool' in p['runtime26Full']:
        spool = canonical(p['runtime26Full']['inventorySpool']['hostRoot'], kind='directory', root=ROOT)
        need(spool.stat().st_uid == media.stat().st_uid, 'FULL_PRIVATE_SPOOL_APP_OWNER_REQUIRED')
    for key in ('review', 'independentReview'):
        need(canonical(refs[key]['path'], root=ROOT).stat().st_mode & 0o004, 'NONROOT_METADATA_READ_REQUIRED')


def validate_runtime26(p, manifest, db, runtime, capacity_pending=False):
    if exact26_full(p):
        return validate_runtime26_full(p, manifest, runtime, capacity_pending)
    runtime = capacity_runtime_configuration(p, runtime, capacity_pending)
    refs = p['runtime26']
    upgrade = reference(refs['upgradeReceipt'])
    before, after = upgrade.get('before', {}), upgrade.get('after', {})
    identity = after.get('identity', {})
    need(upgrade.get('status') == 'PASS_ACTUAL_R1_EXACT26_EMPTY_SCHEMA_AND_MINIMAL_READONLY_ACL_ONLY' and
         upgrade.get('migrationOutcome') == 'COMMIT_RETURNED_SUCCESS' and upgrade.get('finalPatches') == 'SOURCE68_0026_INCLUDES_BYTE_IDENTICAL_C31_V6_AND_C33_V7' and
         identity.get('database') == DATABASE and identity.get('databaseOid') == RUNTIME26_TARGET['databaseOid'] and
         identity.get('owner') == db['actual'].get('owner') == 'erp_rewrite_owner_20261022' and
         identity.get('postmasterStartedAt') == RUNTIME26_TARGET['postmasterStart'] == db['actual'].get('postmasterStartedAt') and
         [row.get('version') for row in before.get('registrations', [])] == list(range(1, 20)) and
         after.get('registrations', [])[:19] == before.get('registrations') and
         [row.get('version') for row in after.get('registrations', [])] == list(range(1, 27)) and
         len(after.get('tableRows', {})) == 56 and after.get('accounts') == 0 and after.get('sourceRows') == 0 and
         len(after.get('routinePins', [])) == 121, 'EXACT_ACTUAL_R1_UPGRADE_RECEIPT_REQUIRED')
    rows = upgrade.get('normalizedMigrations', [])
    need([row.get('version') for row in rows] == list(range(20, 27)), 'EXACT_SEVEN_UPGRADE_MIGRATIONS_REQUIRED')
    expected = {row['version']: row['sha256'] for row in db.get('appliedMigrations', [])}
    need(len(expected) == 19 and set(expected) == set(range(1, 20)), 'EXACT_PREFIX19_RECEIPT_REQUIRED')
    expected.update({row['version']: row['sourceSha256'] for row in rows})
    migrations = [row for row in manifest['members'] if row.get('role') == 'migration']
    need(len(migrations) == RELEASE_CONTRACT['migrationCount'] and {int(PurePosixPath(row['path']).name.split('_', 1)[0]): row['sha256'] for row in migrations} == expected,
         'EXACT26_RELEASE_MIGRATION_HASH_MISMATCH')
    validate_runtime_build(p, manifest, refs)
    need(isinstance(runtime, dict) and set(runtime) == {'schemaVersion', 'profile', 'documentCommands', 'publicOrigin', 'http', 'assets', 'build', 'postgres', 'authentication', 'runtime26Review'} and
         runtime.get('schemaVersion') == 1 and runtime.get('profile') == RUNTIME26_PROFILE and runtime.get('documentCommands') == 'DISABLED' and
         runtime.get('runtime26Review') == {'reviewFile': RUNTIME26_REVIEW, 'trustedReviewSha256': refs['review']['sha256']} and
         runtime.get('postgres', {}).get('target', {}).get('ssl') is False, 'CLOSED_EXACT26_R1_RUNTIME_REQUIRED')
    need(file_identity(p['runtimeConfiguration']['path'])['bytes'] <= 65536, 'BOUNDED_EXACT26_RUNTIME_REQUIRED')
    review, independent = reference(refs['review'], 65536), reference(refs['independentReview'], 8 * 1024 * 1024)
    need(refs['independentReview']['sha256'] == RUNTIME26_QB_SHA256 and independent.get('result') == 'PASS' and
         set(review) == {'version', 'decision', 'target', 'catalog', 'purposes', 'scope', 'independentReview', 'realImportExecutionAuthorized'} and
         review.get('version') == 'C_NATIVE_RUNTIME26_REVIEW_V1' and review.get('decision') == 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA' and
         review.get('target') == RUNTIME26_TARGET and review.get('catalog') == RUNTIME26_CATALOG and
         review.get('purposes') == RUNTIME26_PURPOSES and review.get('scope') == 'EXACT_TARGET_METADATA_ONLY' and
         review.get('realImportExecutionAuthorized') is False and review.get('independentReview') ==
         {'path': RUNTIME26_INDEPENDENT, 'sha256': RUNTIME26_QB_SHA256, 'result': 'PASS'}, 'EXACT_R1_OUTSIDE_REVIEW_REQUIRED')
    for key in ('review', 'independentReview'):
        # Both files contain public metadata and must be readable by the nonroot app.
        need(canonical(refs[key]['path'], root=ROOT).stat().st_mode & 0o004, 'NONROOT_METADATA_READ_REQUIRED')


def read_plan(filename):
    p = json_file(filename)
    required = {'format', 'operationId', 'buildId', 'sourceCommit', 'publicOrigin', 'archive', 'manifest', 'packReceipt', 'backupReceipt',
                'backupMaxAgeSeconds', 'newDatabaseReceipt', 'schemaVersions', 'releaseDirectory', 'images', 'networks', 'names',
                'limits', 'runtimeConfiguration', 'nginxConfiguration', 'beforeCAS'}
    need(isinstance(p, dict) and required <= set(p) and p['format'] == 'naijue-candidate-deployment-v1', 'EXPLICIT_DEPLOYMENT_PLAN_REQUIRED')
    need(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,70}', p['operationId']) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', p['buildId']) and
         re.fullmatch(r'[a-f0-9]{40}', p['sourceCommit']) and p['publicOrigin'] == ORIGIN, 'EXACT_BUILD_AND_OPERATION_IDENTITY_REQUIRED')
    need(p['schemaVersions'] == list(range(1, 27) if exact26_selected(p) else range(1, 20)), 'EXACT_SELECTED_SCHEMA_REQUIRED')
    need(isinstance(p['backupMaxAgeSeconds'], int) and 1 <= p['backupMaxAgeSeconds'] <= 86400, 'EXPLICIT_BACKUP_MAX_AGE_REQUIRED')
    release = Path(p['releaseDirectory'])
    need(release.parent == ROOT / 'releases' and release.name == p['buildId'], 'EXACT_NEW_RELEASE_DIRECTORY_REQUIRED')
    need(set(p['images']) == {'node', 'web'}, 'EXACT_TWO_RUNTIME_IMAGES_REQUIRED')
    for key in ('node', 'web'):
        need(isinstance(p['images'].get(key), dict) and IMAGE.fullmatch(p['images'][key].get('id', '')), 'IMMUTABLE_LOCAL_IMAGE_ID_REQUIRED')
    need(p['images']['node'].get('nodeVersion') == RELEASE_CONTRACT['node'] and re.fullmatch(r'11\.[0-9]+\.[0-9]+', p['images']['node'].get('npmVersion', '')), 'EXACT_NODE_AND_NPM_VERSION_REQUIRED')
    need(p['images']['node'].get('platform') == 'linux/amd64' and p['images']['web'].get('platform') == 'linux/amd64', 'LINUX_AMD64_IMAGE_REQUIRED')
    for key in ('front', 'data', 'install'):
        row = p['networks'].get(key)
        need(isinstance(row, dict) and HASH.fullmatch(row.get('id', '')) and isinstance(row.get('name'), str)
             and re.fullmatch(r'naijue-prod-(?:front|data|ingress)', row['name']), 'EXPLICIT_EXISTING_NETWORK_REQUIRED')
    need(p['networks']['front']['name'] == 'naijue-prod-front' and p['networks']['data']['name'] == 'naijue-prod-data' and
         p['networks']['install']['name'] == 'naijue-prod-ingress', 'NO_NEW_OR_HOST_NETWORK_ALLOWED')
    need(set(p['names']) == {'app', 'stageWeb', 'publicWeb', 'installer'}, 'EXACT_FOUR_CANDIDATE_NAMES_REQUIRED')
    for key, suffix in [('app', 'app'), ('stageWeb', 'stage-web'), ('publicWeb', 'web'), ('installer', 'installer')]:
        need(re.fullmatch(r'naijue-rewrite-[a-z0-9-]{1,55}-' + suffix, p['names'].get(key, '')), 'EXACT_OWNED_CONTAINER_NAMES_REQUIRED')
    need(len(set(p['names'].values())) == 4, 'DISTINCT_CANDIDATE_NAMES_REQUIRED')
    for key in ('app', 'web', 'install'):
        row = p['limits'].get(key)
        need(isinstance(row, dict) and isinstance(row.get('memoryMiB'), int) and 64 <= row['memoryMiB'] <= 2048
             and isinstance(row.get('cpus'), (int, float)) and 0.1 <= row['cpus'] <= 2, 'EXPLICIT_FINITE_CONTAINER_LIMITS_REQUIRED')
        logging_config(p, key)
    need(re.fullmatch(r'[1-9][0-9]{0,5}:[1-9][0-9]{0,5}', p['limits']['app'].get('user', '')) and p['limits']['web'].get('user') == '101:101', 'NONROOT_APPLICATION_AND_NGINX_UID_REQUIRED')
    need(set(p['beforeCAS'].get('services', {})) == set(OLD_NAMES), 'EXACT_OLD_THREE_SERVICE_CAS_REQUIRED')
    need(isinstance(p['beforeCAS'].get('files'), list) and p['beforeCAS']['files'], 'EXACT_OLD_CONFIG_CAS_REQUIRED')
    for row in p['beforeCAS']['files']:
        canonical(row.get('path'), root=OLD)
        need(row['path'].endswith(('.json', '.conf')) and '/secrets/' not in row['path'] and HASH.fullmatch(row.get('sha256', '')), 'PUBLIC_OLD_CONFIG_REFERENCE_ONLY')
    for expected in p['beforeCAS']['services'].values():
        need(HASH.fullmatch(expected.get('id', '')) and IMAGE.fullmatch(expected.get('imageId', '')) and
             isinstance(expected.get('startedAt'), str) and isinstance(expected.get('restartCount'), int), 'COMPLETE_OLD_CONTAINER_IDENTITY_REQUIRED')
    runtime = p['runtimeConfiguration']
    need(isinstance(runtime, dict) and Path(runtime.get('path', '')).is_relative_to(ROOT) and isinstance(runtime.get('identity'), dict), 'PRIVATE_RUNTIME_FILE_REFERENCE_REQUIRED')
    return p


def file_hash(filename):
    return digest(bytes_file(filename, 16 * 1024 * 1024))


def validate_references(p, capacity_pending=False):
    manifest, entries = verified_archive(p['archive'], p['manifest'], p['buildId'], p['sourceCommit'])
    pack = reference(p['packReceipt'])
    need(pack.get('status') == 'PACKED_AND_EXTRACTED_READBACK_MATCH' and pack.get('archiveExtractions') == 1 and
         pack.get('buildId') == p['buildId'] and pack.get('sourceCommit') == p['sourceCommit'] and
         pack.get('archive', {}).get('sha256') == p['archive']['sha256'] and pack.get('manifestSha256') == p['manifest']['sha256'] and
         pack.get('members') == len(entries), 'EXACT_PACK_ACCEPTANCE_REQUIRED')
    backup = reference(p['backupReceipt'])
    need(backup.get('status') == 'PASS_FRESH_CURRENT_APP_DB_WAL_MEDIA_CONFIG_PRESERVED' and backup.get('physicalVerifiedOnce') is True and
         backup.get('mediaAndConfigurationShapesStable') is True and backup.get('databaseFiles', 0) > 0 and backup.get('walRanges'), 'COMPLETE_CURRENT_BACKUP_REQUIRED')
    fresh_time(backup.get('finishedAtUtc'), p['backupMaxAgeSeconds'])
    for name, before in p['beforeCAS']['services'].items():
        b = backup.get('services', {}).get(name, {})
        need(b.get('imageId') == before.get('imageId') and b.get('startedAt') == before.get('startedAt'), 'BACKUP_OLD_RUNTIME_CAS_MISMATCH')
    db = reference(p['newDatabaseReceipt'])
    if not exact26_full(p):
        need(db.get('status') == 'PASS_NEW_DATABASE_SCHEMA19_ONLY_NOT_IMPORT_NOT_AUTH' and db.get('actual', {}).get('database') == DATABASE and
             db['actual'].get('versions') == (list(range(1, 20)) if exact26_selected(p) else p['schemaVersions']) and db['actual'].get('tables') == 50, 'EXACT_NEW_DATABASE_SCHEMA_RECEIPT_REQUIRED')
    migrations = {int(PurePosixPath(row['path']).name.split('_', 1)[0]): row['sha256'] for row in manifest['members'] if row.get('role') == 'migration'}
    if not exact26_selected(p):
        need(migrations == {row['version']: row['sha256'] for row in db.get('appliedMigrations', [])} and set(migrations) == set(range(1, 20)), 'RELEASE_SCHEMA_MIGRATION_HASH_MISMATCH')
    need(file_identity(p['runtimeConfiguration']['path']) == p['runtimeConfiguration']['identity'], 'PRIVATE_RUNTIME_FILE_IDENTITY_CHANGED')
    runtime = json_file(p['runtimeConfiguration']['path'], private=True)
    need(runtime.get('build') == {'buildId': p['buildId'], 'sourceCommit': p['sourceCommit']} and runtime.get('publicOrigin') == ORIGIN and
         runtime.get('documentCommands') == ('NATIVE_RUNTIME' if exact26_full(p) else 'DISABLED') and runtime.get('http') == {'host': '0.0.0.0', 'port': 3000, 'acceptedHosts': [HOST]} and
         runtime.get('assets') == {'root': '/app/web', 'entry': 'index.html'} and
         runtime.get('profile') == (FULL_PROFILE if exact26_full(p) else RUNTIME26_PROFILE if exact26_selected(p) else 'source-confirmed-native-v1'), 'R1_RUNTIME_CONFIGURATION_MISMATCH')
    if exact26_selected(p):
        validate_runtime26(p, manifest, db, runtime, capacity_pending)
    else:
        capacity_runtime_configuration(p, runtime, capacity_pending)
    target = runtime.get('postgres', {}).get('target', {})
    need(target.get('database') == DATABASE and target.get('user') == ROLE and target.get('host') == 'naijue-prod-db-1' and target.get('port') == 5432,
         'OLD_OR_WRONG_DATABASE_CONFIGURATION_REFUSED')
    need(bool(target.get('password')) and file_identity(p['runtimeConfiguration']['path'])['uid'] == int(p['limits']['app']['user'].split(':')[0]),
         'APPLICATION_PRIVATE_RUNTIME_OWNER_REQUIRED')
    nginx = p['nginxConfiguration']
    canonical(nginx['path'], root=ROOT)
    need(file_hash(nginx['path']) == nginx.get('sha256') and bytes_file(nginx['path']) == nginx_configuration(p['names']['app']), 'EXACT_CANDIDATE_PROXY_CONFIGURATION_REQUIRED')
    need(file_identity(p['runtimeConfiguration']['path']) == p['runtimeConfiguration']['identity'], 'PRIVATE_RUNTIME_FILE_CHANGED_DURING_VALIDATION')
    return manifest, entries


class Docker:
    def __init__(self):
        self.commands = []

    def run(self, args, seconds=60):
        # Never print raw stdout/stderr/argv, especially runtime mount paths or installation diagnostics.
        r = subprocess.run(['/usr/bin/docker', *args], capture_output=True, timeout=seconds,
                           env={'PATH': '/usr/bin:/bin', 'HOME': '/root', 'LANG': 'C.UTF-8'})
        self.commands.append({'program': 'docker', 'verb': args[0], 'exitCode': r.returncode})
        need(r.returncode == 0, 'DOCKER_' + re.sub('[^A-Z_]', '', args[0].upper()) + '_FAILED')
        need(len(r.stdout) <= 4 * 1024 * 1024, 'DOCKER_OUTPUT_LIMIT')
        return r.stdout

    def inspect(self, name, seconds=60):
        result = json.loads(self.run(['container', 'inspect', name], seconds))
        need(len(result) == 1, 'EXACT_CONTAINER_REQUIRED')
        return result[0]


def snapshot(info):
    return {'id': info['Id'], 'imageId': info['Image'], 'startedAt': info['State']['StartedAt'],
            'restartCount': info['RestartCount'], 'running': info['State']['Running']}


def check_old(p, docker, web_running=True, web_restart=False):
    for row in p['beforeCAS']['files']:
        need(file_hash(row['path']) == row['sha256'], 'OLD_CONFIGURATION_CHANGED')
    for name, expected in p['beforeCAS']['services'].items():
        current = docker.inspect(name)
        actual = snapshot(current)
        need(actual['id'] == expected.get('id') and actual['imageId'] == expected.get('imageId') and
             actual['restartCount'] == expected.get('restartCount') and actual['running'] is (web_running if name == OLD_NAMES[1] else True), 'OLD_CONTAINER_CAS_CHANGED')
        if not (name == OLD_NAMES[1] and web_restart):
            need(actual['startedAt'] == expected.get('startedAt'), 'OLD_CONTAINER_START_CAS_CHANGED')
        if name != OLD_NAMES[1]:
            need(not current['HostConfig'].get('PortBindings'), 'OLD_APP_OR_DB_PUBLIC_BINDING_REFUSED')
        else:
            need(current['HostConfig'].get('PortBindings') == {'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18080'}]}, 'EXACT_OLD_ENTRY_BINDING_REQUIRED')


def check_images_networks(p, docker):
    for row in p['images'].values():
        info = json.loads(docker.run(['image', 'inspect', row['id']]))[0]
        need(info['Id'] == row['id'] and info['Os'] == 'linux' and info['Architecture'] == 'amd64', 'LOCAL_IMAGE_OS_OR_ID_CHANGED')
    for key, row in p['networks'].items():
        info = json.loads(docker.run(['network', 'inspect', row['id']]))[0]
        need(info['Id'] == row['id'] and info['Name'] == row['name'] and info['Driver'] == 'bridge' and
             info['Internal'] is (key != 'install'), 'EXISTING_NETWORK_ID_OR_ISOLATION_CHANGED')


def own_container_fingerprint(info):
    # Only the tool's controlled, secret-free spec fields. Runtime config content is not included.
    value = {'id': info['Id'], 'image': info['Image'], 'config': {k: info['Config'].get(k) for k in ['User', 'WorkingDir', 'Entrypoint', 'Cmd', 'Env', 'Labels']},
             'host': {k: info['HostConfig'].get(k) for k in ['Binds', 'Mounts', 'PortBindings', 'ReadonlyRootfs', 'CapDrop', 'SecurityOpt', 'Memory', 'MemorySwap', 'NanoCpus', 'RestartPolicy', 'Tmpfs', 'LogConfig']},
             'networks': {name: {'id': row.get('NetworkID'), 'aliases': row.get('Aliases')} for name, row in info['NetworkSettings']['Networks'].items()}}
    return digest(encoded(value))


def assert_own(info, p, role, public=False):
    need(info['Config'].get('Labels', {}).get('naijue.rapid-launch.build-id') == p['buildId'] and
         info['Config']['Labels'].get('naijue.rapid-launch.archive-sha256') == p['archive']['sha256'] and
         info['Config']['Labels'].get('naijue.rapid-launch.role') == role, 'FOREIGN_CANDIDATE_CONTAINER_REFUSED')
    image = p['images']['node' if role == 'app' else 'web']['id']
    need(info['Image'] == image and info['HostConfig']['ReadonlyRootfs'] and
         not info['HostConfig'].get('Privileged') and not info['HostConfig'].get('CapAdd'), 'CANDIDATE_IMAGE_OR_PRIVILEGE_CHANGED')
    need(info['HostConfig'].get('LogConfig') == logging_config(p, 'app' if role == 'app' else 'web'),
         'CANDIDATE_LOG_ROTATION_CHANGED')
    ports = info['HostConfig'].get('PortBindings') or {}
    need(ports == ({'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18080'}]} if public else {}), 'CANDIDATE_PUBLIC_BINDING_CHANGED')


def logging_config(p, key):
    row = p['limits'][key].get('logging')
    need(isinstance(row, dict) and set(row) == {'maxSizeBytes', 'maxFiles', 'compress'} and
         type(row['maxSizeBytes']) is int and row['maxSizeBytes'] > 0 and
         type(row['maxFiles']) is int and row['maxFiles'] > 0 and type(row['compress']) is bool,
         'EXPLICIT_FINITE_LOG_ROTATION_REQUIRED')
    return {'Type': 'json-file', 'Config': {'max-size': str(row['maxSizeBytes']),
            'max-file': str(row['maxFiles']), 'compress': str(row['compress']).lower()}}


def limits_args(p, key):
    row = p['limits'][key]
    log = logging_config(p, key)
    args = ['--memory', str(row['memoryMiB']) + 'm', '--memory-swap', str(row['memoryMiB']) + 'm', '--cpus', str(row['cpus']), '--pids-limit', '128',
            '--log-driver', log['Type']]
    for name, value in log['Config'].items():
        args += ['--log-opt', name + '=' + value]
    return args


def labels(p, role):
    return ['--label', 'naijue.rapid-launch.build-id=' + p['buildId'], '--label', 'naijue.rapid-launch.archive-sha256=' + p['archive']['sha256'],
            '--label', 'naijue.rapid-launch.role=' + role, '--label', 'naijue.rapid-launch.created-by=' + p['operationId']]


def mount(source, target, readonly=True):
    need(',' not in str(source) and ',' not in target, 'MOUNT_SEPARATOR_REFUSED')
    return ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + (',readonly' if readonly else '')]


def runtime_mount_arguments(p):
    host = capacity_host_binding(p)
    args = [*mount(host['collector']['hostFile'], CAPACITY_COLLECTOR), *mount(host['profile']['hostFile'], CAPACITY_PROFILE)]
    if exact26_selected(p):
        refs = runtime_references(p)
        args += [*mount(refs['review']['path'], RUNTIME26_REVIEW), *mount(refs['independentReview']['path'], RUNTIME26_INDEPENDENT)]
    if exact26_full(p):
        if 'credentialRequestKey' in p['runtime26Full']:
            key = credential_key_binding(p)
            args += mount(key['hostFile'], key['containerFile'], True)
        media = p['runtime26Full']['media']
        args += mount(media['hostRoot'], media['containerRoot'], False)
        if 'inventorySpool' in p['runtime26Full']:
            spool = p['runtime26Full']['inventorySpool']
            args += mount(spool['hostRoot'], spool['containerRoot'], False)
    return args


def runtime_entry_arguments(p):
    return (['--exact26-full'] if exact26_full(p) else ['--exact26-r1'] if exact26_selected(p) else []) + ['/run/naijue-rewrite/runtime.json']



CAPACITY_GATE_PATH = '/run/naijue-rewrite/capacity-gate'
CAPACITY_GATE_BODY = 'IFS= read -r decision < /run/naijue-rewrite/capacity-gate || exit 1; [ "$decision" = "$1" ] || exit 1; shift; exec "$@"'


def capacity_fifo_identity(filename, root=None):
    if root is None: root = ROOT
    path = Path(filename)
    need(capacity_path(str(path)) and path.is_relative_to(root), 'EXACT_CAPACITY_FIFO_PATH_REQUIRED')
    canonical(path.parent, kind='directory', private=True, root=root)
    value = path.lstat()
    need(stat.S_ISFIFO(value.st_mode) and not path.is_symlink() and stat.S_IMODE(value.st_mode) == 0o600, 'EXACT_PRIVATE_CAPACITY_FIFO_REQUIRED')
    return {'device': value.st_dev, 'inode': value.st_ino, 'uid': value.st_uid, 'gid': value.st_gid, 'mode': stat.S_IMODE(value.st_mode)}


def create_capacity_gate_fifo(p):
    """New candidate only; existing FIFO or parent modes are never changed."""
    gate = p.get('capacityGate', {})
    filename = Path(gate.get('hostFifo', ''))
    artifact_root = capacity_artifact_root(p)
    need(capacity_path(str(filename)) and filename.is_relative_to(artifact_root) and not os.path.lexists(filename), 'NEW_CAPACITY_FIFO_ONLY')
    canonical(filename.parent, kind='directory', private=True, root=artifact_root)
    uid, gid = map(int, p['limits']['app']['user'].split(':'))
    os.mkfifo(filename, 0o600)
    os.chown(filename, uid, gid, follow_symlinks=False)
    return capacity_fifo_identity(filename, artifact_root)


def capacity_gate_binding(p):
    gate = capacity_bag(p.get('capacityGate'), ('hostFifo', 'identity', 'nonce', 'deadlineAt', 'shell'))
    need(capacity_text(gate['nonce']) and re.fullmatch(r'[a-f0-9]{64}', gate['nonce']) and capacity_number(gate['deadlineAt']) and
         time.time()*1000 < gate['deadlineAt'] <= time.time()*1000 + 300000, 'BOUNDED_CAPACITY_GATE_REQUIRED')
    shell = capacity_bag(gate['shell'], ('containerFile', 'sha256', 'imageId'))
    need(shell['containerFile'] == '/bin/sh' and isinstance(shell['sha256'], str) and HASH.fullmatch(shell['sha256']) and
         shell['imageId'] == p['images']['node']['id'], 'EXACT_CAPACITY_GATE_SHELL_REQUIRED')
    identity = capacity_fifo_identity(gate['hostFifo'], capacity_artifact_root(p))
    need(identity == gate['identity'] and identity['uid'] == int(p['limits']['app']['user'].split(':')[0]) and
         identity['gid'] == int(p['limits']['app']['user'].split(':')[1]), 'CAPACITY_FIFO_IDENTITY_CHANGED')
    return gate


def capacity_gate_arguments(p):
    gate = capacity_gate_binding(p)
    return ['--entrypoint', gate['shell']['containerFile'], p['images']['node']['id'], '-c', CAPACITY_GATE_BODY,
            'naijue-capacity-gate', gate['nonce'], '/usr/local/bin/node', '/app/' + RELEASE_CONTRACT['entrypoints']['backend']['member'],
            *runtime_entry_arguments(p)]


def same_inode_runtime_write(filename, expected, contents):
    """Original owner-only private carrier may fill a candidate file; never replace a bind-mounted inode."""
    need(isinstance(contents, bytes) and 0 < len(contents) <= 65536 and file_identity(filename) == expected, 'PRIVATE_RUNTIME_WRITE_CAS_REQUIRED')
    fd = os.open(filename, os.O_RDWR | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need((info.st_dev, info.st_ino, info.st_uid, stat.S_IMODE(info.st_mode)) ==
             (expected['device'], expected['inode'], expected['uid'], expected['mode']), 'OPENED_PRIVATE_RUNTIME_CAS_CHANGED')
        os.lseek(fd, 0, os.SEEK_SET)
        with os.fdopen(fd, 'r+b', closefd=False) as file:
            file.write(contents); file.truncate(); file.flush(); os.fsync(fd); file.seek(0)
            need(file.read(65537) == contents, 'PRIVATE_RUNTIME_READBACK_FAILED')
        final = file_identity(filename)
        need((final['device'], final['inode']) == (expected['device'], expected['inode']), 'PRIVATE_RUNTIME_INODE_REPLACED')
        return final
    finally:
        os.close(fd)


def capacity_gate_stop(p, docker, cid):
    """Only the exact candidate, never any old writer or shared service."""
    info = docker.inspect(cid, 3)
    assert_own(info, p, 'app')
    need(info['Id'] == cid and info['Config'].get('Labels', {}).get('naijue.rapid-launch.created-by') == p['operationId'], 'ONLY_OWN_CAPACITY_CANDIDATE')
    if info['State']['Running']: docker.run(['stop', '--time', '5', cid], 10)
    need(not docker.inspect(cid, 3)['State']['Running'], 'CAPACITY_CANDIDATE_STOP_UNCONFIRMED')


def release_capacity_fifo(p, docker, cid, process, final_identity, final_guard):
    """Final owner carrier supplies exact approval; nonce is synchronization only. No approval is manufactured here."""
    gate = capacity_gate_binding(p)
    deadline = time.monotonic() + max(0, (gate['deadlineAt'] - time.time()*1000)/1000)
    fd = None
    frozen_ctime = Path(p['runtimeConfiguration']['path']).lstat().st_ctime_ns
    try:
        need(type(process) is dict and set(process) == {'pid', 'linuxStartTicks', 'linuxBootId'}, 'FINAL_PROCESS_TUPLE_REQUIRED')
        info = docker.inspect(cid, 3); assert_own(info, p, 'app')
        need(info['Id'] == cid and info['State']['Running'] and info['HostConfig']['RestartPolicy'] == {'Name':'no','MaximumRetryCount':0} and
             info['Config'].get('Labels', {}).get('naijue.rapid-launch.created-by') == p['operationId'], 'EXACT_LIVE_CAPACITY_CANDIDATE_REQUIRED')
        need(file_identity(p['runtimeConfiguration']['path']) == final_identity == p['runtimeConfiguration']['identity'], 'FINAL_PRIVATE_RUNTIME_IDENTITY_REQUIRED')
        runtime = json_file(p['runtimeConfiguration']['path'], private=True)
        capacity_runtime_configuration(p, runtime)
        need(runtime['capacityLaunch']['process'] == process and process['pid'] == 1, 'FINAL_NAMESPACE_PID1_REQUIRED')
        # This callback is an explicit original owner-controller function, never a CLI/config path or runtime callback.
        # It must verify final helper/plan hash, tuple/CID/source/target/producer/CAS and all original closed guards.
        need(callable(final_guard) and final_guard(p, cid, process, final_identity) is True, 'FINAL_OWNER_APPROVAL_GUARD_REQUIRED')
        need(file_identity(p['runtimeConfiguration']['path']) == final_identity and Path(p['runtimeConfiguration']['path']).lstat().st_ctime_ns == frozen_ctime, 'PRIVATE_RUNTIME_CHANGED_AFTER_FINAL_GUARD')
        while True:
            need(time.monotonic() < deadline and time.time()*1000 < gate['deadlineAt'], 'CAPACITY_FIFO_DEADLINE_EXPIRED')
            need(capacity_fifo_identity(gate['hostFifo'], capacity_artifact_root(p)) == gate['identity'], 'CAPACITY_FIFO_REPLACED')
            try:
                fd = os.open(gate['hostFifo'], os.O_WRONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
                break
            except OSError as error:
                if error.errno != __import__('errno').ENXIO: raise Refused('CAPACITY_FIFO_OPEN_FAILED') from None
                time.sleep(min(0.01, max(0, deadline-time.monotonic())))
        actual = os.fstat(fd)
        need(actual.st_ino == gate['identity']['inode'] and actual.st_dev == gate['identity']['device'] and stat.S_ISFIFO(actual.st_mode), 'OPENED_CAPACITY_FIFO_CHANGED')
        need(file_identity(p['runtimeConfiguration']['path']) == final_identity and Path(p['runtimeConfiguration']['path']).lstat().st_ctime_ns == frozen_ctime and time.monotonic() < deadline and time.time()*1000 < gate['deadlineAt'], 'FINAL_RELEASE_CAS_OR_DEADLINE_CHANGED')
        data=(gate['nonce']+'\n').encode('ascii')
        need(os.write(fd, data) == len(data), 'CAPACITY_FIFO_RELEASE_NOT_COMPLETE')
        return {'released': True, 'runtimeIdentity': final_identity, 'process': process, 'containerId': cid}
    except Exception:
        capacity_gate_stop(p, docker, cid)
        raise
    finally:
        if fd is not None: os.close(fd)


def create_capacity_gate_app(p, docker):
    capacity_host_binding(p)
    gate = capacity_gate_binding(p)
    args = ['create', '--name', p['names']['app'], '--pull=never', '--network', p['networks']['front']['id'], '--network-alias', p['names']['app'], '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--restart=no', '--user', p['limits']['app']['user'], '--workdir', '/app',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', *limits_args(p, 'app'), *labels(p, 'app'),
            *mount(Path(p['releaseDirectory']) / 'payload', '/app'), *mount(p['runtimeConfiguration']['path'], '/run/naijue-rewrite/runtime.json')]
    args += runtime_mount_arguments(p)
    args += mount(gate['hostFifo'], CAPACITY_GATE_PATH, True)
    args += capacity_gate_arguments(p)
    cid = docker.run(args).decode().strip()
    need(HASH.fullmatch(cid), 'CREATED_CANDIDATE_ID_REQUIRED')
    docker.run(['network', 'connect', p['networks']['data']['id'], cid])
    return cid



def capacity_process_tuple(p, docker, cid, phase='shell'):
    """Finite metadata-only exec in the same container namespace; never starts application code."""
    gate = capacity_gate_binding(p); host = capacity_host_binding(p)
    code = "const f=require('node:fs'),c=require('node:crypto');const s=f.readFileSync('/proc/1/stat','utf8'),e=s.lastIndexOf(')'),ticks=s.slice(e+2).split(/\\s+/)[19],boot=f.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();const hash=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');process.stdout.write(JSON.stringify({pid:1,linuxStartTicks:ticks,linuxBootId:boot,nodeSha256:hash('/usr/local/bin/node'),shellSha256:hash('/bin/sh'),pidOneExeSha256:hash('/proc/1/exe')}));"
    value = json.loads(docker.run(['exec', cid, '/usr/local/bin/node', '-e', code], 5))
    need(type(value) is dict and set(value) == {'pid', 'linuxStartTicks', 'linuxBootId', 'nodeSha256', 'shellSha256', 'pidOneExeSha256'} and value['pid'] == 1 and
         value['nodeSha256'] == host['interpreter']['sha256'] and value['shellSha256'] == gate['shell']['sha256'] and
         value['pidOneExeSha256'] == (host['interpreter']['sha256'] if phase == 'node' else gate['shell']['sha256']) and
         isinstance(value['linuxStartTicks'], str) and re.fullmatch(r'[0-9]+', value['linuxStartTicks']) and
         isinstance(value['linuxBootId'], str) and re.fullmatch(r'[a-f0-9-]{36}', value['linuxBootId']), 'ACTUAL_NAMESPACE_TUPLE_OR_EXECUTABLE_PIN_MISMATCH')
    return {k: value[k] for k in ('pid', 'linuxStartTicks', 'linuxBootId')}



def capacity_transport_json(raw):
    def pairs(rows):
        value = {}
        for key, item in rows:
            need(key not in value, 'DUPLICATE_CAPACITY_TRANSPORT_KEY'); value[key] = item
        return value
    return json.loads(raw.decode('utf8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Refused('FINITE_CAPACITY_TRANSPORT_JSON_REQUIRED')))


def capacity_control_read(filename, owner_uid, limit=65536):
    source = canonical(filename, private=True)
    before = source.lstat()
    need(before.st_uid == owner_uid and before.st_nlink == 1 and before.st_size <= limit, 'EXACT_CAPACITY_CONTROL_OWNER_REQUIRED')
    return bytes_file(source, limit, private=True)


def capacity_control_summary(directory, name, value):
    need(name in ('gate-ready.json', 'content-ready.json', 'delivery-result.json'), 'FINITE_CAPACITY_SUMMARY_NAME')
    need(os.geteuid() == 0, 'ORIGINAL_ROOT_CONTROLLER_SUMMARY_REQUIRED')
    path = directory / name
    new_json(path, value)
    # This newly-created safe summary is readable to the control owner, but stays root-owned.
    os.chmod(path, 0o644)
    return digest(encoded(value))


def capacity_wait_control_packet(p, docker, cid, directory, uid, phase, scope, deadline):
    names = {'CONTENT': ('capacity-launch.json', 'owner-profile.json', 'content-manifest.json'),
             'APPROVAL': ('approved-final-delivery.json', 'approval-manifest.json')}[phase]
    marker = directory / (phase.lower() + '.complete')
    while True:
        need(time.monotonic() < deadline and time.time()*1000 < scope['deadlineAt'], 'CAPACITY_OWNER_FINAL_INPUT_DEADLINE')
        state = docker.inspect(cid, 3)
        need(state['Id'] == cid and state['State']['Running'], 'CAPACITY_GATE_EXITED_BEFORE_APPROVAL')
        if os.path.lexists(marker):
            data = capacity_control_read(marker, uid, 64)
            # A marker can be visible between O_EXCL and its sole atomic short write.
            if len(data) == 64: break
            need(len(data) == 0, 'CAPACITY_COMPLETE_MARKER_INVALID')
        time.sleep(min(.05, max(0, deadline-time.monotonic())))
    need(re.fullmatch(b'[a-f0-9]{64}', data), 'CAPACITY_COMPLETE_FINGERPRINT_REQUIRED')
    files = {name: capacity_control_read(directory/name, uid) for name in names}
    need(sum(map(len, files.values())) <= 196608, 'CAPACITY_CONTROL_BATCH_LIMIT')
    records = {name: {'text': raw.decode('utf8'), 'bytes': len(raw), 'sha256': digest(raw)} for name, raw in files.items()}
    request_sha = digest(encoded({'phase': phase, 'scope': scope, 'files': records}))
    need(request_sha.encode() == data, 'CAPACITY_CONTROL_PACKET_FINGERPRINT_CHANGED')
    manifest = capacity_transport_json(files[names[-1]])
    expected_keys = ('format', 'scope', 'files') if phase == 'CONTENT' else ('format', 'scope', 'files', 'decisionReference')
    capacity_bag(manifest, expected_keys)
    need(manifest['format'] == ('CAPACITY_CONTENT_MANIFEST_V1' if phase == 'CONTENT' else 'CAPACITY_APPROVAL_MANIFEST_V1') and
         manifest['scope'] == scope and manifest['files'] == {n: {'bytes': len(files[n]), 'sha256': digest(files[n])} for n in names[:-1]}, 'CAPACITY_MANIFEST_SCOPE_CHANGED')
    return files, request_sha


def capacity_frozen_identity(filename):
    return {**file_identity(filename), 'ctimeNs': Path(filename).lstat().st_ctime_ns}


def capacity_install_content(p, scope, files, provisional, provisional_profile, private):
    """Only two typed operational objects enter. Credentials remain in the original private runtime in memory."""
    c = capacity_transport_json(files['capacity-launch.json'])
    profile = capacity_transport_json(files['owner-profile.json'])
    need(type(c) is dict and set(c) == {'schemaVersion','profile','target','window','process','budgets','minimumFreeBytes','safetyBytes',
         'probeTtlMillis','probeTimeoutMillis','maxProbeWaiters','retryAfterSeconds','producer'}, 'ONLY_CAPACITY_CONTENT_ALLOWED')
    need(c['process'] == scope['process'] and digest(encoded(c['target'])) == scope['targetFingerprint'] and
         c.get('window', {}).get('binding', {}).get('candidateFingerprint') == scope['sourceCommit'] and
         c.get('window', {}).get('binding', {}).get('targetFingerprint') == scope['targetFingerprint'] and
         c.get('window', {}).get('expiresAt', float('inf')) <= scope['deadlineAt'], 'CAPACITY_CONTENT_APPROVED_SCOPE_MISMATCH')
    need(file_identity(p['runtimeConfiguration']['path']) == provisional and
         file_identity(p['capacityHost']['profile']['hostFile']) == provisional_profile, 'PROVISIONAL_PRIVATE_INODES_CHANGED')
    runtime = json_file(p['runtimeConfiguration']['path'], private=True)
    need('capacityLaunch' not in runtime, 'PROVISIONAL_MUST_NOT_CONTAIN_OLD_APPROVAL')
    final = json.loads(json.dumps(p))
    profile_bytes = encoded(profile)
    need(len(profile_bytes) <= 65536, 'CAPACITY_PROFILE_SIZE_LIMIT')
    same_inode_runtime_write(p['capacityHost']['profile']['hostFile'], provisional_profile, profile_bytes)
    final['capacityHost']['profile']['sha256'] = digest(profile_bytes)
    runtime['capacityLaunch'] = c
    # Validate the whole data shape against the original business object BEFORE runtime mutation.
    capacity_runtime_configuration(final, runtime)
    final['runtimeConfiguration']['identity'] = same_inode_runtime_write(p['runtimeConfiguration']['path'], provisional, encoded(runtime))
    final_ref = {'path': str(private/'approved-capacity-final-plan.json'), 'sha256': digest(encoded(final))}
    new_json(final_ref['path'], final)
    return final, final_ref



_CAPACITY_ORIGINAL_OWNER_PROOF = object()


def capacity_original_owner_authority(p, scope, directory, authority, authority_ref):
    """Consume the existing lease and frozen job delegation, not a new dynamic signing/approval system."""
    need(os.geteuid() == 0 and os.environ.get('ERP_SHARED_TASK_ID') == 'T45', 'ORIGINAL_T45_ROOT_PHASE_REQUIRED')
    job = canonical(Path(os.environ.get('ERP_SHARED_JOB_DIR', '/nonexistent')), kind='directory', private=True)
    control = canonical(Path(os.environ.get('ERP_SHARED_CONTROL_DIR', '/nonexistent')), kind='directory', private=True)
    need(job.name == scope['jobId'] == control.name and directory == control/'capacity-final', 'ORIGINAL_LIVE_JOB_CHANNEL_REQUIRED')
    config_path = Path('/usr/local/lib/naijue-erp-night')/('grant-'+scope['grantId'])/'grant.json'
    grant_file = canonical(config_path)
    need(grant_file.stat().st_uid == 0 and not grant_file.stat().st_mode & 0o022, 'ORIGINAL_ROOT_GRANT_CONFIGURATION_REQUIRED')
    grant = json_file(grant_file)
    need(grant.get('grantId') == scope['grantId'] and grant.get('scope') == 'ERP_EXISTING_TASKS_THROUGH_T51' and
         not grant.get('revoked') and type(grant.get('expiresAtEpoch')) in (int, float) and
         time.time()*1000 < scope['deadlineAt'] <= grant['expiresAtEpoch']*1000 and
         grant.get('private') == str(job.parent.parent) and grant.get('control') == str(control.parent.parent) and
         grant.get('humanAuthorization', {}).get('sourceChat') == '01a0f6f9-0e2f-7be0-b410-2001c6f81356', 'ORIGINAL_ACTIVE_HUMAN_GRANT_REQUIRED')
    account = pwd.getpwnam(grant['user'])
    need(control.stat().st_uid == directory.stat().st_uid == account.pw_uid and
         control.stat().st_gid == directory.stat().st_gid == account.pw_gid and account.pw_uid != 0, 'ORIGINAL_AUTHENTICATED_CONTROL_OWNER_REQUIRED')
    request_file = canonical(job/'request.json', private=True)
    manifest_file = canonical(job/'bundle/bundle-manifest.json', private=True)
    need(job.stat().st_uid == request_file.stat().st_uid == manifest_file.stat().st_uid == 0, 'ROOT_FROZEN_ORIGINAL_REQUEST_REQUIRED')
    request = json_file(request_file, private=True)
    receipt = json_file(control.parent.parent/'results'/(job.name+'.json'))
    need(receipt.get('status') == 'RUNNING' and receipt.get('jobId') == scope['jobId'] and receipt.get('taskId') == 'T45' and
         receipt.get('grantId') == scope['grantId'], 'ORIGINAL_JOB_MUST_STILL_BE_RUNNING')
    manifest_raw = bytes_file(manifest_file, 131072, private=True)
    manifest = capacity_transport_json(manifest_raw)
    need(request.get('jobId') == scope['jobId'] and request.get('taskId') == 'T45' and request.get('grantId') == scope['grantId'] and
         request.get('scope') == grant['scope'] and request.get('manifestSha256') == digest(manifest_raw) and
         manifest.get('jobId') == scope['jobId'] and manifest.get('taskId') == 'T45', 'ORIGINAL_REQUEST_MANIFEST_BINDING_REQUIRED')
    records = {r['name']: r for r in manifest.get('files', [])}
    frozen_authority = canonical(job/'bundle/capacity-input-authority.json', private=True)
    frozen_helper = canonical(job/'bundle/deploy-candidate.py', private=True)
    need(frozen_authority.stat().st_uid == frozen_helper.stat().st_uid == 0 and
         file_hash(frozen_helper) == scope['helperSha256'], 'ROOT_FROZEN_AUTHORITY_AND_HELPER_REQUIRED')
    need(authority_ref['path'] == str(job/'bundle/capacity-input-authority.json') and
         records.get('capacity-input-authority.json', {}).get('sha256') == authority_ref['sha256'] and
         records.get('deploy-candidate.py', {}).get('sha256') == scope['helperSha256'] == file_hash(Path(__file__)) and
         reference(authority_ref) == authority and authority.get('action') == 'ONE_FINAL_CAPACITY_PLAN_ONLY' and
         authority.get('target') is not None and digest(encoded(authority['target'])) == scope['targetFingerprint'] and
         authority.get('sourceCommit') == scope['sourceCommit'] and authority.get('deadlineAt') == scope['deadlineAt'] and
         authority.get('operationId') == p['operationId'] and authority.get('buildId') == p['buildId'], 'ORIGINAL_SCOPED_FINAL_INPUT_DELEGATION_REQUIRED')
    # This original authenticated account already has the scoped ONE_FINAL input
    # delegation. Its later exact decision is DATA consumed under that authority,
    # not an authority inferred from uid0, a JSON claim, nonce or a new signature.
    return _CAPACITY_ORIGINAL_OWNER_PROOF


def capacity_verify_final_decision(authority, scope, ready, ready_sha, approval, owner_proof=None):
    capacity_bag(approval, ('format','scope','decisionReference','decision','contentReadySha256','finalPlanSha256'))
    ref = capacity_bag(approval['decisionReference'], ('sourcePath','sha256'))
    decision = capacity_bag(approval['decision'], ('format','scope','contentReadySha256','finalPlanSha256','finalRuntimeIdentity','finalProfileIdentity','authority'))
    need(approval['format'] == 'CAPACITY_APPROVED_DELIVERY_V1' and approval['scope'] == scope and
         approval['contentReadySha256'] == ready_sha and approval['finalPlanSha256'] == ready['finalPlanSha256'] and
         decision['format'] == 'C_APPROVED_CAPACITY_FINAL_PLAN_V1' and decision['scope'] == scope and decision['authority'] == scope['authority'] and
         decision['contentReadySha256'] == ready_sha and decision['finalPlanSha256'] == ready['finalPlanSha256'] and
         decision['finalRuntimeIdentity'] == ready['finalRuntimeIdentity'] and decision['finalProfileIdentity'] == ready['finalProfileIdentity'] and
         isinstance(ref['sourcePath'], str) and Path(ref['sourcePath']).is_absolute() and Path(ref['sourcePath']).name == 'C-CAPACITY-FINAL-APPROVAL.json' and
         ref['sha256'] == digest(encoded(decision)), 'C_FINAL_DECISION_SCOPE_OR_BYTES_CHANGED')
    # No circular pre-binding of unpredictable final ctime/plan bytes. The root
    # derives this capability only by revalidating its original active grant,
    # frozen request/manifest, scoped delegation and original control account.
    need(owner_proof is _CAPACITY_ORIGINAL_OWNER_PROOF, 'ORIGINAL_FINAL_INPUT_AUTHORITY_UNCONFIRMED')

    return True


def wait_capacity_owner_final(p, docker, cid, process, provisional, provisional_profile, journal):
    gate = capacity_gate_binding(p)
    delivery = capacity_bag(p.get('capacityFinalInput'), ('path', 'authority'))
    private_job = Path(os.environ.get('ERP_SHARED_JOB_DIR', '/nonexistent'))
    private = canonical(Path(delivery['path']).parent, kind='directory', private=True)
    need(private == private_job/'inputs-private' and private.stat().st_uid == 0 and
         Path(delivery['path']).name == 'approved-capacity-final-delivery.json', 'ORIGINAL_JOB_FIXED_PRIVATE_DESTINATION_REQUIRED')
    authority_ref = capacity_bag(delivery['authority'], ('path', 'sha256'))
    need(authority_ref['path'] == str(private_job/'bundle/capacity-input-authority.json'), 'ORIGINAL_FROZEN_AUTHORITY_REQUIRED')
    authority = reference(authority_ref)
    keys = {'format','jobId','operationId','buildId','sourceCommit','archiveSha256','target','deadlineAt','controlOwnerUid','action'}
    need(type(authority) is dict and set(authority) == keys, 'CLOSED_ORIGINAL_CAPACITY_AUTHORITY_REQUIRED')
    need(authority['format'] == 'OWNER_CAPACITY_FINAL_INPUT_AUTHORITY_V1' and authority['action'] == 'ONE_FINAL_CAPACITY_PLAN_ONLY' and
         authority['controlOwnerUid'] == 0 and authority['jobId'] == private_job.name and authority['operationId'] == p['operationId'] and
         authority['buildId'] == p['buildId'] and authority['sourceCommit'] == p['sourceCommit'] and authority['archiveSha256'] == p['archive']['sha256'] and
         authority['deadlineAt'] == gate['deadlineAt'], 'EXACT_ORIGINAL_CAPACITY_AUTHORITY_REQUIRED')
    control = canonical(Path(os.environ.get('ERP_SHARED_CONTROL_DIR', '/nonexistent')), kind='directory', private=True)
    need(control.name == private_job.name and control.parent.name == 'jobs' and control.stat().st_uid != 0, 'ORIGINAL_UNPRIVILEGED_CONTROL_JOB_REQUIRED')
    uid, gid = control.stat().st_uid, control.stat().st_gid
    directory = control/'capacity-final'
    if not os.path.lexists(directory):
        directory.mkdir(mode=0o700); os.chown(directory, uid, gid, follow_symlinks=False)
    canonical(directory, kind='directory', private=True)
    need(directory.stat().st_uid == uid and directory.stat().st_gid == gid, 'ORIGINAL_CONTROL_OWNER_INBOX_REQUIRED')
    scope = {'jobId': private_job.name, 'taskId':'T45', 'grantId':control.parent.parent.name.removeprefix('grant-'), 'containerId':cid,
             'sourceCommit':p['sourceCommit'], 'helperSha256':file_hash(Path(__file__)), 'authority':authority_ref, 'deadlineAt':gate['deadlineAt'],
             'process':process, 'targetFingerprint':digest(encoded(authority['target'])), 'producerReviewSha256':p['capacityHost']['reviewSha256']}
    need(re.fullmatch(r'[a-f0-9]{16}', scope['grantId']), 'ORIGINAL_CONTROL_GRANT_REQUIRED')
    capacity_original_owner_authority(p,scope,directory,authority,authority_ref)
    capacity_control_summary(directory, 'gate-ready.json', {'format':'CAPACITY_GATE_READY_V1','scope':scope,
         'provisionalRuntimeIdentity':provisional,'provisionalProfileIdentity':provisional_profile})
    deadline = time.monotonic()+max(0,(gate['deadlineAt']-time.time()*1000)/1000)
    files, request_sha = capacity_wait_control_packet(p,docker,cid,directory,uid,'CONTENT',scope,deadline)
    capacity_original_owner_authority(p,scope,directory,authority,authority_ref)
    final, final_ref = capacity_install_content(p,scope,files,provisional,provisional_profile,private)
    ready = {'format':'CAPACITY_CONTENT_READY_V1','scope':scope,'contentManifestSha256':digest(files['content-manifest.json']),
             'finalPlanSha256':final_ref['sha256'],'finalRuntimeIdentity':capacity_frozen_identity(final['runtimeConfiguration']['path']),
             'finalProfileIdentity':capacity_frozen_identity(final['capacityHost']['profile']['hostFile'])}
    ready_sha = capacity_control_summary(directory,'content-ready.json',ready)
    files, request_sha = capacity_wait_control_packet(p,docker,cid,directory,uid,'APPROVAL',scope,deadline)
    approval = capacity_transport_json(files['approved-final-delivery.json'])
    try:
        owner_proof = capacity_original_owner_authority(p,scope,directory,authority,authority_ref)
        capacity_verify_final_decision(authority,scope,ready,ready_sha,approval,owner_proof)
    except Refused:
        capacity_control_summary(directory,'delivery-result.json',{'format':'CAPACITY_DELIVERY_RESULT_V1','scope':scope,'phase':'APPROVAL','status':'REFUSED',
             'requestSha256':request_sha,'safeCode':'ORIGINAL_FINAL_INPUT_AUTHORITY_OR_SCOPE_UNCONFIRMED'})
        raise
    need(reference(authority_ref) == authority and reference(final_ref) == final and capacity_frozen_identity(final['runtimeConfiguration']['path']) == ready['finalRuntimeIdentity'] and
         capacity_frozen_identity(final['capacityHost']['profile']['hostFile']) == ready['finalProfileIdentity'], 'FINAL_OWNER_REFERENCE_OR_IDENTITY_CHANGED')
    body={'format':'OWNER_CAPACITY_FINAL_PLAN_DELIVERY_V1','authority':authority_ref,'containerId':cid,'process':process,
          'provisionalRuntimeIdentity':provisional,'provisionalProfileIdentity':provisional_profile,'fifoIdentity':gate['identity'],
          'helperSha256':scope['helperSha256'],'finalRuntimeCtimeNs':ready['finalRuntimeIdentity']['ctimeNs'],
          'finalProfileCtimeNs':ready['finalProfileIdentity']['ctimeNs'],'finalPlan':final_ref}
    new_json(delivery['path'],body)
    capacity_control_summary(directory,'delivery-result.json',{'format':'CAPACITY_DELIVERY_RESULT_V1','scope':scope,'phase':'APPROVAL','status':'VERIFIED_FOR_FINAL_CLOSED_GUARDS',
          'requestSha256':request_sha,'safeCode':'NO_FIFO_RELEASE_CLAIM'})
    journal.event('CAPACITY_EXACT_FINAL_INPUT_RECEIVED',containerId=cid)
    return final,final_ref


def run_capacity_gate_controller(p, docker, journal):
    """No detached provisional return. On every failure/deadline stop only this candidate and preserve its evidence."""
    gate = capacity_gate_binding(p)
    provisional = file_identity(p['runtimeConfiguration']['path'])
    need(provisional == p['runtimeConfiguration']['identity'], 'PROVISIONAL_PRIVATE_IDENTITY_CHANGED')
    # Missing actual authority/channel refuses BEFORE allocating a container.
    delivery = capacity_bag(p.get('capacityFinalInput'), ('path', 'authority'))
    reference(capacity_bag(delivery['authority'], ('path', 'sha256')))
    cid = create_capacity_gate_app(p, docker)
    finished = threading.Event(); expired = threading.Event(); watchdog_failure = []
    remaining = max(0, (gate['deadlineAt'] - time.time()*1000)/1000)
    def watch_deadline():
        if not finished.wait(remaining):
            expired.set()
            try: capacity_gate_stop(p, docker, cid)
            except Exception: watchdog_failure.append(True)
    watchdog = threading.Thread(target=watch_deadline, name='capacity-candidate-deadline', daemon=False)
    watchdog.start()
    try:
        spec = docker.inspect(cid, 3)
        need(spec['Id'] == cid and spec['Config'].get('Entrypoint') == ['/bin/sh'] and
             spec['Config'].get('Cmd') == capacity_gate_arguments(p)[3:] and not spec['HostConfig'].get('Init') and
             spec['Config'].get('User') == p['limits']['app']['user'] and
             any(m.get('Source') == gate['hostFifo'] and m.get('Destination') == CAPACITY_GATE_PATH and m.get('RW') is False for m in spec.get('Mounts', [])), 'EXACT_PID1_GATE_AND_READONLY_FIFO_REQUIRED')
        docker.run(['start', cid], 5)
        process = capacity_process_tuple(p, docker, cid)
        profile_identity = file_identity(p['capacityHost']['profile']['hostFile'])
        journal.event('CAPACITY_GATE_WAITING_OWNER_FINAL_INPUT', containerId=cid, process=process, provisionalRuntimeIdentity=provisional,
                      deadlineAt=gate['deadlineAt'], provisionalProfileIdentity=profile_identity)
        final, final_ref = wait_capacity_owner_final(p, docker, cid, process, provisional, profile_identity, journal)
        final_profile_identity = file_identity(final['capacityHost']['profile']['hostFile'])
        final_profile_ctime = Path(final['capacityHost']['profile']['hostFile']).lstat().st_ctime_ns
        def final_guard(plan, candidate, actual_process, identity):
            need(reference(final_ref) == plan, 'FINAL_PLAN_CHANGED_AFTER_DELIVERY')
            validate_references(plan)  # All original source/backup/metadata/business/target guards.
            check_old(plan, docker); check_images_networks(plan, docker)
            need(capacity_process_tuple(plan, docker, candidate) == actual_process, 'SAME_PID_EXEC_TUPLE_CHANGED_BEFORE_RELEASE')
            need(file_identity(plan['runtimeConfiguration']['path']) == identity and
                 file_identity(plan['capacityHost']['profile']['hostFile']) == final_profile_identity and
                 Path(plan['capacityHost']['profile']['hostFile']).lstat().st_ctime_ns == final_profile_ctime, 'FINAL_RUNTIME_CHANGED_DURING_CLOSED_GUARDS')
            return True
        release_capacity_fifo(final, docker, cid, process, final['runtimeConfiguration']['identity'], final_guard)
        exec_deadline = min(gate['deadlineAt'], time.time()*1000 + 5000)
        while True:
            try:
                need(capacity_process_tuple(final, docker, cid, phase='node') == process, 'SAME_PID_EXEC_TUPLE_CHANGED_AFTER_RELEASE')
                break
            except Refused:
                need(time.time()*1000 < exec_deadline, 'CAPACITY_NODE_EXEC_NOT_CONFIRMED')
                time.sleep(0.01)
        need(not expired.is_set() and not watchdog_failure, 'CAPACITY_CONTROLLER_DEADLINE_OR_STOP_UNCONFIRMED')
        # Return the FINAL plan explicitly; caller must never persist/reuse provisional identity.
        return cid, final, final_ref
    except Exception:
        capacity_gate_stop(p, docker, cid)
        raise
    finally:
        finished.set(); watchdog.join(17)
        need(not watchdog.is_alive() and not watchdog_failure, 'CAPACITY_DEADLINE_WATCHDOG_STOP_UNCONFIRMED')
        need(not expired.is_set(), 'CAPACITY_CONTROLLER_DEADLINE_EXPIRED')



# Dedicated isolated QA seam. The formal read_plan/validate_references and networks
# remain unchanged and do not accept capacityQaObserver. Only the existing original
# bounded root job may call these functions, after its frozen authority is checked.
CAPACITY_LIVE = '/run/naijue-rewrite/capacity/live'
CAPACITY_QA_ROOT = Path('/srv/naijue-erp/isolated-qa/qa897-20261029-01/capacity-e2e-266')
CAPACITY_QA_PG = '4ef68faedf28b431cd884fedc5a40435f20b2bc16ea6475e59424426a54a8251'
CAPACITY_QA_IMAGE = 'sha256:b3721d9bd40bf0da8dde2ef10bb0557d5b6615cbf12f63c448acbf5279b417c2'
CAPACITY_QA_TARGET = {'host':'127.0.0.1','port':5432,'database':'naijue_erp_test_hv2_qa897_20261029_01',
    'role':'hv2_qa897_runtime_20261029_01','databaseOid':'21551','postmasterStart':'2026-10-28 08:36:13.490836+00'}
CAPACITY_QA_PATHS = {'postgres':'/var/lib/postgresql/data','wal':'/var/lib/postgresql/data/pg_wal',
    'system':'/srv/naijue-erp','media':'/srv/naijue-erp/isolated-qa/qa897-20261029-01/media',
    'backup':'/srv/naijue-erp/isolated-qa/qa897-20261029-01/recovery-backups'}


def capacity_artifact_root(p):
    if 'capacityQaObserver' not in p: return ROOT
    capacity_qa_binding(p, files=False)
    return CAPACITY_QA_ROOT/p['capacityQaObserver']['case']


def capacity_qa_binding(p, files=True, closing=False):
    q = capacity_bag(p.get('capacityQaObserver'), ('format','case','deadlineAt','pg','timeoutSha256'))
    need(q['format'] == 'QA21551_BOUNDED_JOB_STATFS_V1' and q['case'] in ('ok','noapproval','wrongconfig','timeout') and
         p['runtimeSelector'] == 'exact26-r1' and p['limits']['app']['user'] == '10001:10001' and
         p['images']['node']['id'] == 'sha256:20eea9b7258e90078cb24ed89abde93e9e4253416d7304073ae8cb18c35cb77f' and
         p['images']['node']['nodeVersion'] == RELEASE_CONTRACT['node'] and p['images']['node']['platform'] == 'linux/amd64' and
         type(p['limits']['app']['memoryMiB']) is int and 64 <= p['limits']['app']['memoryMiB'] <= 2048 and
         type(p['limits']['app']['cpus']) in (int,float) and 0.1 <= p['limits']['app']['cpus'] <= 2 and
         p['names']['app'] == 'naijue-rewrite-qa897-capacity-e2e-266-'+q['case']+'-app' and
         capacity_number(q['deadlineAt']) and (closing or time.time()*1000 < q['deadlineAt'] <= time.time()*1000+240000) and
         q['deadlineAt'] == p['capacityGate']['deadlineAt'] and HASH.fullmatch(q['timeoutSha256']), 'EXACT_BOUNDED_QA_OBSERVER_REQUIRED')
    need(q['pg'] == {'id':CAPACITY_QA_PG,'imageId':CAPACITY_QA_IMAGE,'pid':2419003,
         'startedAt':'2026-10-28T08:36:11.455335721Z','restartCount':0}, 'EXACT_EXISTING_QA_PG_REQUIRED')
    live = CAPACITY_QA_ROOT/q['case']/'live'
    if files:
        parent = canonical(live.parent, kind='directory', private=True)
        need(parent.stat().st_uid == 0 and stat.S_IMODE(parent.stat().st_mode) == 0o700, 'QA_PRIVATE_PARENT_REQUIRED')
        info = live.lstat()
        need(stat.S_ISDIR(info.st_mode) and not live.is_symlink() and (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode)) == (0,10001,0o510), 'QA_PIPE_DIRECTORY_ONLY')
        for name,mode in [('request.fifo',0o620),('response.fifo',0o640)]:
            value = (live/name).lstat()
            need(stat.S_ISFIFO(value.st_mode) and value.st_nlink == 1 and not (live/name).is_symlink() and
                 (value.st_uid,value.st_gid,stat.S_IMODE(value.st_mode)) == (0,10001,mode), 'QA_FIXED_FIFO_ONLY')
    return live


def capacity_qa_pg_cas(p, docker, closing=False):
    capacity_qa_binding(p,closing=closing)
    info = docker.inspect(CAPACITY_QA_PG, 2)
    need(info['Id'] == CAPACITY_QA_PG and info['Image'] == CAPACITY_QA_IMAGE and info['State']['Running'] and
         info['State']['Pid'] == 2419003 and info['State']['StartedAt'] == '2026-10-28T08:36:11.455335721Z' and
         info['RestartCount'] == 0 and info['HostConfig']['NetworkMode'] == 'none' and not info.get('Mounts') and
         not info['HostConfig'].get('PortBindings') and
         info['HostConfig'].get('Tmpfs') == {'/var/lib/postgresql/data':'rw,size=512m'}, 'EXISTING_QA_PG_CAS_CHANGED')
    return ['--network','container:'+CAPACITY_QA_PG]


def capacity_qa_mount_arguments(p):
    live = capacity_qa_binding(p)
    # Only pipe traffic is writable. Ordinary application uid has no directory write.
    return mount(live, CAPACITY_LIVE, False)


# No caller path, command, shell text or user is interpolated from a live request.
# Existing PG uid999 observes metadata; no credentials or SQL are accessed.
_CAPACITY_PG_STAT = r"""set -eu
LC_ALL=C; export LC_ALL
[ "$(/usr/bin/sha256sum /usr/bin/timeout | /usr/bin/cut -d' ' -f1)" = "$1" ] || exit 2
exec /usr/bin/timeout --signal=TERM --kill-after=0.1s 0.6s /bin/sh -c '
set -eu
/usr/bin/readlink /proc/self/ns/mnt
for d in /var/lib/postgresql/data /var/lib/postgresql/data/pg_wal; do
 [ "$(/usr/bin/readlink -f "$d")" = "$d" ] || exit 2
 /usr/bin/stat -c "%F|%d|%i" "$d"
 /usr/bin/stat -f -c "%t|%a|%S" "$d"
 /usr/bin/stat -c "%F|%d|%i" "$d"
done'
"""


def capacity_qa_native_observation(p):
    """One actual metadata batch. A failed/unknown child yields no capacity result."""
    q = p['capacityQaObserver']
    command = ['/usr/bin/docker','exec','--user','999:999',CAPACITY_QA_PG,'/bin/sh','-c',_CAPACITY_PG_STAT,
               'capacity-fixed-statfs',q['timeoutSha256']]
    # subprocess.run communicates and reaps the CLI on success and timeout. A CLI
    # timeout does NOT prove its remote exec settled: refuse the whole QA window.
    result = subprocess.run(command, capture_output=True, timeout=1.5,
        env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C'})
    need(result.returncode == 0 and not result.stderr and 0 < len(result.stdout) <= 4096, 'QA_NATIVE_STATFS_UNSETTLED_OR_FAILED')
    rows = result.stdout.decode('ascii').splitlines()
    need(len(rows) == 7 and re.fullmatch(r'mnt:\[[0-9]+\]',rows[0]), 'QA_NATIVE_STATFS_FRAME_REQUIRED')
    observed = {}
    for k,offset in [('postgres',1),('wal',4)]:
        before,fs,after = rows[offset].split('|'),rows[offset+1].split('|'),rows[offset+2].split('|')
        need(before == after and len(before) == len(fs) == 3 and before[0] == 'directory' and
             all(re.fullmatch(r'[0-9]+',v) for v in before[1:]+fs[1:]) and re.fullmatch(r'[a-fA-F0-9]+',fs[0]) and int(fs[2]) > 0,
             'QA_NATIVE_STATFS_IDENTITY_CHANGED')
        observed[k] = {'namespace':'linux:'+rows[0],'device':before[1],'filesystemType':str(int(fs[0],16)),
                       'availableBytes':str(int(fs[1])*int(fs[2]))}
    namespace = 'linux:'+os.readlink('/proc/self/ns/mnt')
    for k in ('system','media','backup'):
        filename = Path(CAPACITY_QA_PATHS[k])
        need(filename.resolve(strict=True) == filename, 'QA_HOST_VOLUME_ALIAS_REFUSED')
        before = filename.lstat()
        need(stat.S_ISDIR(before.st_mode) and not filename.is_symlink(), 'QA_HOST_DIRECTORY_REQUIRED')
        # stat -f supplies real filesystem type, unavailable from Python statvfs.
        result = subprocess.run(['/usr/bin/stat','-f','-c','%t',str(filename)],capture_output=True,timeout=.3,
                                env={'PATH':'/usr/bin:/bin','LANG':'C'})
        need(result.returncode == 0 and not result.stderr and len(result.stdout) <= 32 and
             re.fullmatch(rb'[a-fA-F0-9]+\n',result.stdout), 'QA_HOST_STATFS_FAILED')
        fs,after = os.statvfs(filename),filename.lstat()
        need((before.st_dev,before.st_ino) == (after.st_dev,after.st_ino) and stat.S_ISDIR(after.st_mode), 'QA_HOST_DIRECTORY_CHANGED')
        observed[k] = {'namespace':namespace,'device':str(before.st_dev),'filesystemType':str(int(result.stdout,16)),
                       'availableBytes':str(fs.f_bavail*fs.f_frsize)}
    return observed


class _CapacityQaClosing(Exception):
    pass


class CapacityQaObserver:
    """Lives only inside one original bounded job; no detached thread or second DB pool."""
    def __init__(self, p, docker, cid):
        self.p,self.docker,self.cid = p,docker,cid
        self.stop = threading.Event(); self.failure = None; self.count = 0; self.challenges = set()
        self.thread = None; self.fd = None; self.identities = {}; self.request_deadline = None
        self.deadline = time.monotonic()+min(240,max(0,(p['capacityQaObserver']['deadlineAt']-time.time()*1000)/1000))

    def check(self):
        if self.stop.is_set(): raise _CapacityQaClosing()
        need(time.monotonic() < self.deadline and
             time.time()*1000 < self.p['capacityQaObserver']['deadlineAt'], 'QA_OBSERVER_DEADLINE_EXPIRED')
        need(self.request_deadline is None or time.monotonic() < self.request_deadline, 'QA_OBSERVER_REQUEST_EXPIRED')
        live = capacity_qa_binding(self.p)
        for name,expected in self.identities.items():
            v = (live/name).lstat()
            need((v.st_dev,v.st_ino,v.st_uid,v.st_gid,stat.S_IMODE(v.st_mode)) == expected and stat.S_ISFIFO(v.st_mode), 'QA_OBSERVER_FIFO_REPLACED')
        info = self.docker.inspect(self.cid, .5); assert_own(info,self.p,'app')
        need(info['Id'] == self.cid and info['State']['Running'] and info['Config']['User'] == '10001:10001' and
             info['HostConfig']['NetworkMode'] == 'container:'+CAPACITY_QA_PG, 'QA_OBSERVER_CANDIDATE_CHANGED')
        capacity_qa_pg_cas(self.p,self.docker)

    def observe(self, request):
        self.check()
        need(self.count < 32 and type(request) is dict and set(request) == {'format','challenge','target','windowToken','binding','volumes','producerReviewSha256','requestedAt'}, 'QA_OBSERVER_REQUEST_LIMIT_OR_FIELDS')
        runtime = json_file(self.p['runtimeConfiguration']['path'],private=True)
        capacity_runtime_configuration(self.p,runtime)
        c = runtime['capacityLaunch']; profile = json.loads(bytes_file(self.p['capacityHost']['profile']['hostFile'],65536))
        expected = {'format':'CAPACITY_LIVE_REQUEST_V1','target':c['target'],'windowToken':c['window']['token'],
                    'binding':c['window']['binding'],'volumes':c['producer']['volumes'],'producerReviewSha256':c['producer']['reviewSha256']}
        need(all(request[k] == v for k,v in expected.items()) and capacity_text(request['challenge']) and
             request['challenge'] not in self.challenges and capacity_number(request['requestedAt']) and
             c['window']['startsAt'] <= request['requestedAt'] <= time.time()*1000 < min(c['window']['expiresAt'],request['requestedAt']+c['probeTtlMillis']),
             'QA_OBSERVER_REQUEST_BINDING_OR_FRESHNESS')
        need(capacity_process_tuple(self.p,self.docker,self.cid,'node') == c['process'], 'QA_OBSERVER_PROCESS_CHANGED')
        self.request_deadline = min(self.deadline,time.monotonic()+max(0,(request['requestedAt']+c['probeTtlMillis']-time.time()*1000)/1000))
        self.challenges.add(request['challenge']); self.count += 1
        identity = capacity_frozen_identity(self.p['capacityHost']['profile']['hostFile'])
        started = int(time.time()*1000)
        observed = capacity_qa_native_observation(self.p)  # ALWAYS after this live request
        self.check()
        need(capacity_frozen_identity(self.p['capacityHost']['profile']['hostFile']) == identity and
             int(time.time()*1000)-request['requestedAt'] < c['probeTtlMillis'], 'QA_OBSERVER_PROFILE_CHANGED_OR_STALE')
        volumes,devices,physical = {},{},{}
        for k in CAPACITY_VOLUMES:
            v,configured = observed[k],profile['volumes'][k]
            need(all(v[n] == configured[n] for n in ('namespace','device','filesystemType')) and
                 re.fullmatch(r'(?:0|[1-9][0-9]*)',v['availableBytes']), 'QA_OBSERVED_VOLUME_IDENTITY_MISMATCH')
            device = (v['namespace'],v['device'],v['filesystemType']); label = configured['physicalVolume']
            need(devices.get(device,label) == label and physical.get(label,device) == device, 'QA_OBSERVED_PHYSICAL_ALIAS_MISMATCH')
            devices[device],physical[label] = label,device
            volumes[k] = dict(request['volumes'][k],availableBytes=v['availableBytes'])
        return dict(format='CAPACITY_LIVE_RESULT_V1',challenge=request['challenge'],target=request['target'],windowToken=request['windowToken'],
                    binding=request['binding'],producerReviewSha256=request['producerReviewSha256'],collectionStartedAt=started,
                    collectionFinishedAt=int(time.time()*1000),volumes=volumes)

    def serve(self):
        try:
            buffer = bytearray(); frame_deadline = None
            while not self.stop.is_set():
                self.check()
                need(frame_deadline is None or time.monotonic() < frame_deadline, 'QA_OBSERVER_INCOMPLETE_FRAME')
                if not select.select([self.fd],[],[],.01)[0]: continue
                part = os.read(self.fd,65537)
                need(part and len(buffer)+len(part) <= 65536, 'QA_OBSERVER_FRAME_LIMIT')
                if frame_deadline is None: frame_deadline = time.monotonic()+1
                buffer.extend(part)
                if b'\n' not in buffer: continue
                need(buffer.endswith(b'\n') and buffer.count(b'\n') == 1, 'QA_OBSERVER_SINGLE_FRAME_REQUIRED')
                request = capacity_transport_json(bytes(buffer[:-1])); buffer.clear(); frame_deadline = None
                response = encoded(self.observe(request))
                need(len(response) <= 65536 and not select.select([self.fd],[],[],0)[0], 'QA_OBSERVER_OVERLAPPING_REQUEST_REFUSED')
                writer = None
                try:
                    live = capacity_qa_binding(self.p)
                    while writer is None:
                        self.check()
                        try: writer = os.open(live/'response.fifo',os.O_WRONLY|os.O_NONBLOCK|os.O_NOFOLLOW)
                        except OSError as error:
                            if error.errno != errno.ENXIO: raise
                            self.stop.wait(.002)
                    info = os.fstat(writer)
                    need((info.st_dev,info.st_ino,info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode)) == self.identities['response.fifo'], 'QA_OBSERVER_RESPONSE_FIFO_CHANGED')
                    sent = 0
                    while sent < len(response):
                        self.check()
                        try:
                            count = os.write(writer,response[sent:]); need(count > 0,'QA_OBSERVER_SHORT_WRITE'); sent += count
                        except BlockingIOError: self.stop.wait(.002)
                finally:
                    if writer is not None: os.close(writer)
                self.request_deadline = None
        except _CapacityQaClosing:
            pass
        except Exception as error:
            self.failure = type(error).__name__  # never export raw native output or config
            self.stop.set()

    def __enter__(self):
        live = capacity_qa_binding(self.p)
        for name in ('request.fifo','response.fifo'):
            value = (live/name).lstat()
            self.identities[name] = (value.st_dev,value.st_ino,value.st_uid,value.st_gid,stat.S_IMODE(value.st_mode))
        self.fd = os.open(live/'request.fifo',os.O_RDWR|os.O_NONBLOCK|os.O_NOFOLLOW)
        actual = os.fstat(self.fd)
        if (actual.st_dev,actual.st_ino,actual.st_uid,actual.st_gid,stat.S_IMODE(actual.st_mode)) != self.identities['request.fifo']:
            os.close(self.fd); self.fd = None
            raise Refused('QA_OBSERVER_OPEN_FIFO_CHANGED')
        self.thread = threading.Thread(target=self.serve,name='original-job-capacity-statfs',daemon=False)
        self.thread.start(); return self

    def __exit__(self, kind, value, trace):
        self.stop.set()
        if self.thread is not None: self.thread.join(5)
        try:
            need(self.thread is not None and not self.thread.is_alive(), 'QA_NATIVE_OBSERVER_SETTLEMENT_UNCONFIRMED')
            need(self.failure is None, 'QA_OBSERVER_FAILED_UNKNOWN_CAPACITY')
        finally:
            if self.thread is None or not self.thread.is_alive():
                if self.fd is not None: os.close(self.fd); self.fd = None
        return False


def capacity_qa_original_proof(p, cid='NOT_CREATED'):
    """Reuse original live grant/request/manifest/account checks. No new signer."""
    job = Path(os.environ.get('ERP_SHARED_JOB_DIR','/nonexistent'))
    control = Path(os.environ.get('ERP_SHARED_CONTROL_DIR','/nonexistent'))
    ref = p['capacityFinalInput']['authority']; authority = reference(ref)
    control = canonical(control,kind='directory',private=True)
    need(control.name == job.name and control.parent.name == 'jobs' and control.stat().st_uid != 0, 'ORIGINAL_UNPRIVILEGED_CONTROL_JOB_REQUIRED')
    directory = control/'capacity-final'
    if not os.path.lexists(directory):
        directory.mkdir(mode=0o700); os.chown(directory,control.stat().st_uid,control.stat().st_gid,follow_symlinks=False)
    canonical(directory,kind='directory',private=True)
    scope = {'jobId':job.name,'grantId':control.parent.parent.name.removeprefix('grant-'),'containerId':cid,
        'sourceCommit':p['sourceCommit'],'helperSha256':file_hash(Path(__file__)),
        'targetFingerprint':digest(encoded(CAPACITY_QA_TARGET)),'deadlineAt':p['capacityQaObserver']['deadlineAt']}
    need(authority.get('target') == CAPACITY_QA_TARGET and authority.get('archiveSha256') == p['archive']['sha256'] and
         authority.get('deadlineAt') == scope['deadlineAt'], 'QA_ORIGINAL_AUTHORITY_TARGET_REQUIRED')
    need(re.fullmatch(r'[a-f0-9]{16}',scope['grantId']) and type(authority) is dict and
         set(authority) == {'format','jobId','operationId','buildId','sourceCommit','archiveSha256','target','deadlineAt','controlOwnerUid','action'} and
         authority['format'] == 'OWNER_CAPACITY_FINAL_INPUT_AUTHORITY_V1' and authority['jobId'] == job.name and
         authority['controlOwnerUid'] == 0, 'QA_ORIGINAL_CLOSED_AUTHORITY_REQUIRED')
    proof = capacity_original_owner_authority(p,scope,directory,authority,ref)
    # The extra QA shape is data in this exact frozen original request, never
    # derived from root uid, a standalone review, or producer stdin.
    frozen = job/'bundle/capacity-qa-input.json'
    manifest = json_file(job/'bundle/bundle-manifest.json',private=True)
    records = {r['name']:r for r in manifest['files']}
    keys = ('capacityQaObserver','sourceCommit','buildId','operationId','archive','manifest','packReceipt','images','names','limits','runtime26')
    frozen_raw = bytes_file(frozen,65536,private=True)
    need(frozen.stat().st_uid == 0 and records.get('capacity-qa-input.json',{}).get('sha256') == digest(frozen_raw) and
         capacity_transport_json(frozen_raw) == {k:p[k] for k in keys}, 'QA_EXACT_FROZEN_INPUT_REQUIRED')
    return proof


def create_capacity_qa_live_fifos(p):
    """New case only; do not chmod or replace an existing directory or pipe."""
    capacity_qa_binding(p,files=False); capacity_qa_original_proof(p)
    root = capacity_artifact_root(p)
    canonical(CAPACITY_QA_ROOT,kind='directory',private=True)
    need(CAPACITY_QA_ROOT.stat().st_uid == 0 and not os.path.lexists(root), 'QA_NEW_CASE_ONLY')
    root.mkdir(mode=0o700)
    live = root/'live'; live.mkdir(mode=0o700)
    os.chown(live,0,10001,follow_symlinks=False); os.chmod(live,0o510,follow_symlinks=False)
    for name,mode in [('request.fifo',0o620),('response.fifo',0o640)]:
        os.mkfifo(live/name,mode); os.chown(live/name,0,10001,follow_symlinks=False); os.chmod(live/name,mode,follow_symlinks=False)
    capacity_qa_binding(p)
    return str(live)


def create_capacity_qa_gate_app(p, docker):
    """Separate ephemeral carrier. Never used by formal deploy/boot entry."""
    capacity_qa_original_proof(p)
    capacity_host_binding(p); gate = capacity_gate_binding(p)
    root = capacity_artifact_root(p)
    need(p['releaseDirectory'] == str(root) and p['runtimeConfiguration']['path'] == str(root/'runtime.json') and
         gate['hostFifo'] == str(root/'gate.fifo'), 'QA_FIXED_ARTIFACT_LOCATIONS_REQUIRED')
    canonical(root/'payload',kind='directory',root=root)
    # Do not call formal create_capacity_gate_app or attach either formal network.
    args = ['create','--name',p['names']['app'],'--pull=never',*capacity_qa_pg_cas(p,docker),
        '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--restart=no','--user','10001:10001','--workdir','/app',
        '--tmpfs','/tmp:rw,noexec,nosuid,size=16m',*limits_args(p,'app'),*labels(p,'app'),
        *mount(root/'payload','/app'),*mount(root/'runtime.json','/run/naijue-rewrite/runtime.json'),
        *runtime_mount_arguments(p),*capacity_qa_mount_arguments(p),*mount(gate['hostFifo'],CAPACITY_GATE_PATH),*capacity_gate_arguments(p)]
    cid = docker.run(args,5).decode().strip()
    need(HASH.fullmatch(cid),'QA_CREATED_CANDIDATE_ID_REQUIRED')
    return cid


def capacity_qa_references(p, pending=False):
    """QA-specific exact target; formal target/schema/backup guards stay untouched."""
    capacity_qa_original_proof(p)
    root = capacity_artifact_root(p)
    need(p['releaseDirectory'] == str(root) and p['runtimeConfiguration']['path'] == str(root/'runtime.json'), 'QA_FIXED_PRIVATE_RUNTIME_REQUIRED')
    need(file_identity(root/'runtime.json') == p['runtimeConfiguration']['identity'], 'QA_PRIVATE_RUNTIME_CHANGED')
    runtime = json_file(root/'runtime.json',private=True)
    business = capacity_runtime_configuration(p,runtime,pending)
    need(set(business) == {'schemaVersion','profile','documentCommands','publicOrigin','http','assets','build','postgres','authentication','runtime26Review'} and
         business['schemaVersion'] == 1 and business['profile'] == RUNTIME26_PROFILE and business['documentCommands'] == 'DISABLED' and
         business['build'] == {'buildId':p['buildId'],'sourceCommit':p['sourceCommit']} and business['publicOrigin'] == ORIGIN and
         business['http'] == {'host':'0.0.0.0','port':3000,'acceptedHosts':[HOST]} and
         business['assets'] == {'root':'/app/web','entry':'index.html'}, 'QA_CLOSED_MINIMAL_R1_RUNTIME_REQUIRED')
    target = business['postgres']['target']
    need(all(target.get(k) == v for k,v in {'host':'127.0.0.1','port':5432,'database':CAPACITY_QA_TARGET['database'],
         'user':CAPACITY_QA_TARGET['role'],'ssl':False}.items()) and bool(target.get('password')) and
         p['runtimeConfiguration']['identity']['uid'] == 10001, 'QA_ORDINARY_EXACT21551_ROLE_REQUIRED')
    refs = runtime_references(p)
    review, independent = reference(refs['review']), reference(refs['independentReview'])
    need(business['runtime26Review'] == {'reviewFile':RUNTIME26_REVIEW,'trustedReviewSha256':refs['review']['sha256']} and
         set(review) == {'version','decision','target','catalog','purposes','scope','independentReview','realImportExecutionAuthorized'} and
         review['version'] == 'C_NATIVE_RUNTIME26_REVIEW_V1' and review['decision'] == 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA' and
         review['scope'] == 'EXACT_TARGET_METADATA_ONLY' and review['realImportExecutionAuthorized'] is False and
         review['purposes'] == RUNTIME26_PURPOSES and
         review['catalog']['format'] == 'EXACT26_RUNTIME_CATALOG_EXPORT_V1' and review['catalog']['patchLevel'] == FULL_PATCH and
         HASH.fullmatch(review['catalog']['sha256']) and independent.get('result') == 'PASS' and
         review['independentReview'] == {'path':RUNTIME26_INDEPENDENT,'sha256':refs['independentReview']['sha256'],'result':'PASS'},
         'QA_FRESH_V1_R1_REVIEW_REQUIRED')
    need(review['target'] == {'database':CAPACITY_QA_TARGET['database'],'databaseOid':'21551',
         'actingRole':CAPACITY_QA_TARGET['role'],'sessionUser':CAPACITY_QA_TARGET['role'],
         'serverAddress':'127.0.0.1/32','serverPort':5432,'postmasterStart':CAPACITY_QA_TARGET['postmasterStart']}, 'QA_REVIEW_EXACT_TARGET_REQUIRED')
    manifest,entries = verified_archive(p['archive'],p['manifest'],p['buildId'],p['sourceCommit'])
    validate_runtime_build(p,manifest,refs)
    pack = reference(p['packReceipt'])
    need(pack.get('status') == 'PACKED_AND_EXTRACTED_READBACK_MATCH' and pack.get('buildId') == p['buildId'] and
         pack.get('sourceCommit') == p['sourceCommit'] and pack.get('archive',{}).get('sha256') == p['archive']['sha256'] and
         pack.get('manifestSha256') == p['manifest']['sha256'] and pack.get('members') == len(entries), 'QA_EXISTING_EXACT_PACK_REQUIRED')
    return runtime


def capacity_qa_wait_ready(p,docker,cid,observer):
    # This HTTP request does not create a DB pool. It is a fixed GET inside the
    # exact candidate; production main itself owns the one preflight pool.
    code = "const h=require('node:http');const q=h.get({host:'127.0.0.1',port:3000,path:'/readyz',headers:{host:'"+HOST+"'}},r=>{let b='';r.on('data',c=>{b+=c;if(b.length>4096)q.destroy()});r.on('end',()=>{if(r.statusCode===200){try{const v=JSON.parse(b);if(v.status==='READY'){process.stdout.write('READY');return}}catch{}}process.exitCode=2})});q.setTimeout(200,()=>q.destroy());q.on('error',()=>{process.exitCode=2});"
    while True:
        need(observer.failure is None,'QA_OBSERVER_FAILED_UNKNOWN_CAPACITY')
        observer.check()
        try:
            result = docker.run(['exec','--user','10001:10001',cid,'/usr/local/bin/node','-e',code],.6)
            if result == b'READY':
                need(observer.count > 0 and observer.failure is None,'QA_REAL_OBSERVER_REQUEST_REQUIRED')
                return {'readyz':True,'observerRequests':observer.count,'sameOwnedPoolPreflight':'BEFORE_MAIN_LISTEN',
                        'businessAccepted':False,'loginTested':False,'capacityAcquireTested':False}
        except Refused:
            pass
        observer.stop.wait(.02)


def run_capacity_qa_gate_controller(p,docker,journal):
    """One original job, final input → observer → exec → readyz → own stop/readback.
    Not a CLI phase and never a persistent boot candidate. Environment approval
    and exact prepared inputs still have to arrive through the original job.
    """
    capacity_qa_binding(p); capacity_qa_references(p,pending=True)
    provisional = file_identity(p['runtimeConfiguration']['path'])
    profile_identity = file_identity(p['capacityHost']['profile']['hostFile'])
    cid = create_capacity_qa_gate_app(p,docker)
    done,expired = threading.Event(),threading.Event(); watchdog_failure = []
    def watch():
        if not done.wait(max(0,(p['capacityGate']['deadlineAt']-time.time()*1000)/1000)):
            expired.set()
            try: capacity_gate_stop(p,docker,cid)
            except Exception: watchdog_failure.append(True)
    watchdog = threading.Thread(target=watch,name='original-job-qa-deadline',daemon=False); watchdog.start()
    outcome = None
    try:
        spec = docker.inspect(cid,2); assert_own(spec,p,'app')
        need(spec['Config'].get('Entrypoint') == ['/bin/sh'] and spec['Config'].get('Cmd') == capacity_gate_arguments(p)[3:] and
             spec['Config'].get('User') == '10001:10001' and not spec['HostConfig'].get('Init') and
             spec['HostConfig']['NetworkMode'] == 'container:'+CAPACITY_QA_PG, 'QA_EXACT_PID1_GATE_REQUIRED')
        expected = [(str(capacity_artifact_root(p)/'payload'),'/app',False),
                    (p['runtimeConfiguration']['path'],'/run/naijue-rewrite/runtime.json',False),
                    (p['capacityHost']['collector']['hostFile'],CAPACITY_COLLECTOR,False),
                    (p['capacityHost']['profile']['hostFile'],CAPACITY_PROFILE,False),
                    (p['runtime26']['review']['path'],RUNTIME26_REVIEW,False),
                    (p['runtime26']['independentReview']['path'],RUNTIME26_INDEPENDENT,False),
                    (str(capacity_qa_binding(p)),CAPACITY_LIVE,True),(p['capacityGate']['hostFifo'],CAPACITY_GATE_PATH,False)]
        need(sorted((v['Source'],v['Destination'],v['RW']) for v in spec.get('Mounts',[])) == sorted(expected), 'QA_EXACT_MOUNTS_ONLY')
        docker.run(['start',cid],3)
        process = capacity_process_tuple(p,docker,cid)
        journal.event('QA_CAPACITY_GATE_WAITING_OWNER_FINAL_INPUT',containerId=cid,process=process)
        final,final_ref = wait_capacity_owner_final(p,docker,cid,process,provisional,profile_identity,journal)
        frozen_profile = capacity_frozen_identity(final['capacityHost']['profile']['hostFile'])
        def guard(plan,candidate,actual,identity):
            need(reference(final_ref) == plan and actual == process and candidate == cid and
                 capacity_frozen_identity(plan['capacityHost']['profile']['hostFile']) == frozen_profile,'QA_FINAL_CONTENT_CHANGED')
            capacity_qa_references(plan); capacity_qa_pg_cas(plan,docker)
            check_old(plan,docker)
            need(capacity_process_tuple(plan,docker,candidate) == actual,'QA_SAME_PROCESS_REQUIRED')
            return True
        with CapacityQaObserver(final,docker,cid) as observer:
            release_capacity_fifo(final,docker,cid,process,final['runtimeConfiguration']['identity'],guard)
            result = capacity_qa_wait_ready(final,docker,cid,observer)
        need(not expired.is_set() and not watchdog_failure,'QA_WINDOW_EXPIRED_OR_STOP_UNKNOWN')
        outcome = {'containerId':cid,'finalPlan':final_ref,'result':result,'ephemeral':True}
        return outcome
    finally:
        try:
            capacity_gate_stop(p,docker,cid)
            capacity_qa_pg_cas(p,docker,closing=True)
            if outcome is not None: outcome.update(qaStoppedReadback=True,originalPgCasUnchanged=True,observerJoined=True)
        finally:
            done.set(); watchdog.join(17)
            need(not watchdog.is_alive() and not watchdog_failure,'QA_WATCHDOG_SETTLEMENT_UNCONFIRMED')


def create_app(p, docker):
    raise Refused('CAPACITY_USE_BOUNDED_CONTROLLER_WITH_FINAL_PLAN_REQUIRED')


def create_web(p, docker, public=False):
    name = p['names']['publicWeb' if public else 'stageWeb']
    args = ['create', '--name', name, '--pull=never', '--network', p['networks']['front']['id'], '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--restart=no', '--user', p['limits']['web']['user'], '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
            *limits_args(p, 'web'), *labels(p, 'web'), *mount(p['nginxConfiguration']['path'], '/etc/nginx/nginx.conf')]
    if public:
        args += ['--publish', '127.0.0.1:18080:8080/tcp']
    args += ['--entrypoint', 'nginx', p['images']['web']['id'], '-c', '/etc/nginx/nginx.conf', '-g', 'daemon off;']
    cid = docker.run(args).decode().strip()
    need(HASH.fullmatch(cid), 'CREATED_CANDIDATE_ID_REQUIRED')
    return cid


def health(p, docker, app_id, via_web=None):
    # Identity/liveness is not readiness: issue both freshly against the same target.
    script = r"""const h=require('node:http');
function probe(path,accept,next){
 const r=h.get({host:process.argv[1],port:Number(process.argv[2]),path,headers:{Host:'1n5635n614.goho.co'}},s=>{
  let b='',size=0;
  s.on('data',c=>{size+=Buffer.byteLength(c);if(size>4096){r.destroy();process.exit(2);return}b+=c});
  s.on('error',()=>process.exit(5));
  s.on('end',()=>{let v;try{v=JSON.parse(b)}catch{process.exit(3);return}
   if(s.statusCode!==200||!v||typeof v!=='object'||!accept(v)){process.exit(2);return}next();});
 });
 r.setTimeout(3000,()=>{r.destroy();process.exit(4)});r.on('error',()=>process.exit(5));
}
probe('/healthz',v=>v.status==='HOST_ALIVE'&&v.databaseChecked===false&&v.sourceCommit===process.argv[3]&&v.buildId===process.argv[4],()=>
 probe('/readyz',v=>v.status==='READY',()=>process.stdout.write('HEALTH_IDENTITY_AND_READINESS_MATCH')));
"""
    for _ in range(15):
        try:
            result = docker.run(['exec', app_id, 'node', '-e', script, via_web or '127.0.0.1', '8080' if via_web else '3000', p['sourceCommit'], p['buildId']], 10)
            need(result == b'HEALTH_IDENTITY_AND_READINESS_MATCH', 'CANDIDATE_HEALTH_RESPONSE_MISMATCH')
            return {'path': '/healthz', 'status': 200, 'sourceCommit': p['sourceCommit'], 'buildId': p['buildId'], 'databaseChecked': False,
                    'readiness': {'path': '/readyz', 'status': 200, 'applicationChecked': True}}
        except Refused:
            time.sleep(1)
    raise Refused('CANDIDATE_INTERNAL_HEALTH_FAILED')


def loopback_health(p):
    # Independent bound-entry identity and fresh application readiness, not business acceptance.
    checks = (
        ('/healthz', lambda value: value.get('status') == 'HOST_ALIVE' and
         value.get('buildId') == p['buildId'] and value.get('sourceCommit') == p['sourceCommit'] and value.get('databaseChecked') is False),
        ('/readyz', lambda value: value.get('status') == 'READY'),
    )
    for endpoint, accepts in checks:
        connection = http.client.HTTPConnection('127.0.0.1', 18080, timeout=5)
        try:
            connection.request('GET', endpoint, headers={'Host': HOST})
            response = connection.getresponse()
            body = response.read(4097)
            try:
                value = json.loads(body)
            except (ValueError, UnicodeError):
                raise Refused('ACTUAL_LOOPBACK_ENTRY_HEALTH_MISMATCH') from None
            need(response.status == 200 and len(body) <= 4096 and isinstance(value, dict) and accepts(value),
                 'ACTUAL_LOOPBACK_ENTRY_HEALTH_MISMATCH')
        finally:
            connection.close()


def payload_identity(payload, manifest, include_dependencies=False):
    expected = {row['path']: row for row in manifest['members']}
    expected['release-manifest.json'] = None
    rows, actual = [], set()
    for directory, dirs, files in os.walk(payload, followlinks=False):
        for name in dirs:
            need(not (Path(directory) / name).is_symlink(), 'DEPENDENCY_DIRECTORY_SYMLINK_REFUSED')
        for name in files:
            f = Path(directory) / name
            relative_name = str(f.relative_to(payload))
            if relative_name.startswith('node_modules/') and not include_dependencies:
                continue
            data = bytes_file(f, 64 * 1024 * 1024)
            if not relative_name.startswith('node_modules/'):
                need(relative_name in expected, 'EXTRA_RELEASE_PAYLOAD_FILE')
                actual.add(relative_name)
                if expected[relative_name] is not None:
                    row = expected[relative_name]
                    need(len(data) == row['bytes'] and digest(data) == row['sha256'], 'INSTALLED_RELEASE_BYTES_CHANGED')
            rows.append({'path': relative_name, 'bytes': len(data), 'sha256': digest(data)})
            need(len(rows) < 20000, 'INSTALLED_MEMBER_LIMIT')
    need(actual == set(expected), 'INSTALLED_RELEASE_MEMBER_SET_CHANGED')
    return digest(encoded(sorted(rows, key=lambda row: row['path'])))


def install_linux_dependencies(p, docker, release, manifest):
    payload = release / 'payload'
    need(not (payload / 'node_modules').exists(), 'DEPENDENCY_DIRECTORY_EXISTS_NO_REPLAY')
    version_script = "const c=require('node:child_process');const v=c.execFileSync('npm',['--version'],{encoding:'utf8'}).trim();if(process.versions.node!==process.argv[1]||v!==process.argv[2])process.exit(3);process.stdout.write('EXACT_NODE_NPM')"
    docker.run(['run', '--name', p['names']['installer'], '--pull=never', '--network', p['networks']['install']['id'], '--read-only',
                '--cap-drop=ALL', '--security-opt=no-new-privileges', '--restart=no', '--user', '0:0', '--workdir', '/app',
                '--tmpfs', '/tmp:rw,nosuid,size=256m', *limits_args(p, 'install'), *mount(payload, '/app', False),
                '--entrypoint', 'node', p['images']['node']['id'], '-e', version_script, p['images']['node']['nodeVersion'], p['images']['node']['npmVersion']])
    # The version container is retained, never --rm/recreated; npm executes once in a distinct bounded container name.
    install_name = p['names']['installer'] + '-npm'
    docker.run(['run', '--name', install_name, '--pull=never', '--network', p['networks']['install']['id'], '--read-only',
                '--cap-drop=ALL', '--security-opt=no-new-privileges', '--restart=no', '--user', '0:0', '--workdir', '/app',
                '--tmpfs', '/tmp:rw,nosuid,size=256m', *limits_args(p, 'install'), *mount(payload, '/app', False),
                '--env', 'HOME=/tmp', '--entrypoint', 'npm', p['images']['node']['id'], 'ci', '--omit=dev', '--ignore-scripts', '--bin-links=false',
                '--no-audit', '--no-fund', '--cache=/tmp/npm-cache'], 900)
    need((payload / 'node_modules').is_dir(), 'LINUX_RUNTIME_DEPENDENCIES_MISSING')
    payload_identity(payload, manifest)
    need(file_hash(payload / 'release-manifest.json') == p['manifest']['sha256'], 'INSTALLED_RELEASE_MANIFEST_CHANGED')
    return payload_identity(payload, manifest, True)


def full_write_boundary(p, restore_old=False, docker=None):
    value = reference(p.get('writeBoundary'))
    review = reference(runtime_references(p)['review'], 65536)
    need(value.get('format') == 'naijue-rewrite-write-boundary-v1' and value.get('database') == DATABASE and
         value.get('buildId') == p['buildId'] and value.get('sourceCommit') == p['sourceCommit'] and
         value.get('writeAdmission') in ('CLOSED', 'CONTROLLED_PRIVATE') and type(value.get('newBusinessWrites')) is int and
         value['newBusinessWrites'] >= 0 and value.get('outcome') == 'KNOWN' and value.get('checkedBy') and value.get('target') == review['target'] and
         'firstBusinessWriteAtUtc' in value and (value['firstBusinessWriteAtUtc'] is None if value['newBusinessWrites'] == 0 else
         isinstance(value['firstBusinessWriteAtUtc'], str) and bool(value['firstBusinessWriteAtUtc'])), 'FULL_UNKNOWN_WRITE_BOUNDARY_REFUSED')
    fresh_time(value.get('checkedAtUtc'), 300)
    if not restore_old:
        return value
    # A recent JSON alone cannot prove zero writes. Every writer must still be
    # physically stopped after the registered drain/snapshot and compatible-old proof.
    fence = reference(p.get('writeFence'))
    need(value['newBusinessWrites'] == 0 and fence.get('database') == DATABASE and fence.get('target') == review['target'] and fence.get('buildId') == p['buildId'] and
         fence.get('sourceCommit') == p['sourceCommit'] and fence.get('allWriteEntrypointsClosed') is True and
         type(fence.get('inFlightTransactions')) is int and fence['inFlightTransactions'] == 0 and
         type(fence.get('snapshot', {}).get('newBusinessWrites')) is int and fence['snapshot']['newBusinessWrites'] == 0 and
         'firstBusinessWriteAtUtc' in fence['snapshot'] and fence['snapshot']['firstBusinessWriteAtUtc'] is None and
         fence['snapshot'].get('outcome') == 'KNOWN', 'NEW_WRITES_OR_UNKNOWN_REFUSE_OLD_ENTRY')
    try:
        times = [dt.datetime.fromisoformat(fence[k].replace('Z', '+00:00')) for k in ('closedAtUtc', 'drainedAtUtc', 'snapshotAtUtc')]
    except (KeyError, ValueError, TypeError):
        raise Refused('FULL_CLOSED_DRAINED_SNAPSHOT_REQUIRED') from None
    need(all(t.tzinfo is not None for t in times) and times[0] <= times[1] <= times[2], 'FULL_CLOSED_DRAINED_SNAPSHOT_REQUIRED')
    fresh_time(fence['snapshotAtUtc'], 300)
    old = fence.get('oldEntry', {})
    services = p['beforeCAS']['services']
    need(old.get('compatible') is True and old.get('appId') == services[OLD_NAMES[0]]['id'] and old.get('dbId') == services[OLD_NAMES[2]]['id'] and
         old.get('appImageId') == services[OLD_NAMES[0]]['imageId'] and old.get('catalogSha256') == review['catalog']['sha256'], 'FULL_OLD_ENTRY_COMPATIBILITY_UNPROVEN')
    writers = fence.get('writers')
    stage = reference(p.get('stageReceipt'))
    need(isinstance(writers, list) and writers and len({w.get('id') for w in writers}) == len(writers) and
         stage['containers']['app']['id'] in {w.get('id') for w in writers}, 'FULL_ALL_WRITERS_FENCE_REQUIRED')
    docker = docker or Docker()
    for writer in writers:
        need(HASH.fullmatch(writer.get('id', '')), 'FULL_EXACT_WRITER_REQUIRED')
        info = docker.inspect(writer['id'])
        need(info['State']['Running'] is False and info['State'].get('Pid') == 0 and
             info['State'].get('StartedAt') == writer.get('startedAt') and info['State'].get('FinishedAt') == writer.get('finishedAt') and
             info['HostConfig']['RestartPolicy']['Name'] == 'no', 'FULL_WRITER_RESTARTED_OR_UNKNOWN')
        try:
            finished = dt.datetime.fromisoformat(writer['finishedAt'].replace('Z', '+00:00'))
        except (KeyError, TypeError, ValueError):
            raise Refused('FULL_WRITER_STOP_TIME_REQUIRED') from None
        need(finished.tzinfo is not None and finished <= times[1], 'FULL_SNAPSHOT_BEFORE_WRITER_DRAIN')
    return value


def write_boundary(p, restore_old=False, docker=None):
    if exact26_full(p):
        return full_write_boundary(p, restore_old, docker)
    value = reference(p.get('writeBoundary'))
    need(value.get('format') == 'naijue-rewrite-write-boundary-v1' and value.get('database') == DATABASE and
         value.get('buildId') == p['buildId'] and value.get('sourceCommit') == p['sourceCommit'] and value.get('writeAdmission') == 'CLOSED' and
         type(value.get('newBusinessWrites')) is int and value['newBusinessWrites'] == 0 and
         value.get('firstBusinessWriteAtUtc') is None and value.get('checkedBy'), 'NEW_WRITES_OR_UNKNOWN_REFUSE_OLD_ENTRY')
    fresh_time(value.get('checkedAtUtc'), 300)
    return value


def acceptance(p):
    value = reference(p.get('candidateAcceptance'))
    need(value.get('format') == 'naijue-candidate-acceptance-v1' and value.get('result') == 'PASS' and
         value.get('buildId') == p['buildId'] and value.get('sourceCommit') == p['sourceCommit'] and
         value.get('archiveSha256') == p['archive']['sha256'] and value.get('schemaVersions') == p['schemaVersions'] and
         value.get('dataReady') is True, 'EXACT_REAL_CANDIDATE_ACCEPTANCE_REQUIRED')
    if exact26_selected(p):
        need(value.get('runtime26BindingSha256') == runtime_binding(p), 'EXACT26_CANDIDATE_ACCEPTANCE_BINDING_REQUIRED')
    fresh_time(value.get('checkedAtUtc'), 86400)
    for owner in ('QF', 'QB'):
        source = reference(value.get('evidence', {}).get(owner))
        need((source.get('result') or source.get('status')) == 'PASS' and source.get('candidateCommit') == p['sourceCommit'] and
             isinstance(source.get('scope'), (str, list)) and source.get('scope'), 'ORIGINAL_QF_QB_ACCEPTANCE_REQUIRED')
    return value


class Journal:
    def __init__(self, p, phase):
        self.path = ROOT / 'operations' / (p['operationId'] + '.json')
        self.data = {'format': 'naijue-deployment-operation-v1', 'operationId': p['operationId'], 'phase': phase, 'buildId': p['buildId'],
                     'sourceCommit': p['sourceCommit'], 'archiveSha256': p['archive']['sha256'], 'startedAtUtc': now(), 'status': 'STARTED_NO_REPLAY', 'events': []}
        new_json(self.path, self.data)

    def event(self, label, **values):
        self.data['events'].append({'atUtc': now(), 'event': label, **values})
        replace_json(self.path, self.data)

    def action(self, label, operation):
        self.data['events'].append({'atUtc': now(), 'action': label, 'state': 'INTENT_OUTCOME_UNKNOWN'})
        replace_json(self.path, self.data)
        result = operation()
        self.data['events'][-1].update(state='RETURNED_SUCCESS_PENDING_READBACK', returnedAtUtc=now())
        replace_json(self.path, self.data)
        return result

    def finish(self, status, **values):
        self.data.update(status=status, finishedAtUtc=now(), **values)
        replace_json(self.path, self.data)
        return self.data


def exact_host(p):
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server' and os.environ.get('ERP_SHARED_TASK_ID') == 'T45', 'EXISTING_T45_SERVER_CARRIER_REQUIRED')
    need(not os.environ.get('DOCKER_HOST') and not os.environ.get('DOCKER_CONTEXT'), 'LOCAL_DOCKER_ONLY')
    job = canonical(os.environ.get('ERP_SHARED_JOB_DIR'), 'directory')
    need(job.name == p['operationId'] and re.fullmatch(r'/root/erp-release-20261006-01-worker/grant-[a-f0-9]{16}/jobs/[A-Za-z0-9_-]+', str(job)), 'EXACT_SERVER_JOB_NAMESPACE_REQUIRED')
    canonical(ROOT, 'directory')
    for name in ('releases', 'operations'):
        target = ROOT / name
        if not target.exists():
            target.mkdir(mode=0o700)
        canonical(target, 'directory')
    return job


def current_stage(p, docker, manifest):
    stage = reference(p.get('stageReceipt'))
    need(stage.get('status') == 'CANDIDATE_STAGED_HEALTH_ONLY_NOT_BUSINESS' and stage.get('buildId') == p['buildId'] and
         stage.get('sourceCommit') == p['sourceCommit'] and stage.get('archiveSha256') == p['archive']['sha256'] and
         stage.get('manifestSha256') == p['manifest']['sha256'] and stage.get('releaseDirectory') == p['releaseDirectory'], 'EXACT_STAGED_CANDIDATE_REQUIRED')
    need(stage.get('schemaVersions') == p['schemaVersions'] and stage.get('runtime26BindingSha256') == runtime_binding(p), 'STAGED_RUNTIME_SELECTION_OR_REVIEW_CHANGED')
    need(payload_identity(Path(p['releaseDirectory']) / 'payload', manifest, True) == stage.get('installedPayloadSha256'), 'STAGED_PAYLOAD_OR_DEPENDENCIES_CHANGED')
    need(file_hash(Path(p['releaseDirectory']) / 'payload/release-manifest.json') == p['manifest']['sha256'], 'STAGED_RELEASE_MANIFEST_CHANGED')
    for role in ('app', 'stageWeb'):
        expected = stage['containers'][role]
        info = docker.inspect(expected['id'])
        assert_own(info, p, 'app' if role == 'app' else 'web')
        need(own_container_fingerprint(info) == expected['specSha256'] and info['State']['Running'], 'STAGED_CONTAINER_CHANGED_OR_STOPPED')
    return stage


def stage(p, docker, journal, manifest, entries):
    release = Path(p['releaseDirectory'])
    need(not release.exists() and not release.is_symlink(), 'RELEASE_EXISTS_NO_REPLAY')
    release.mkdir(mode=0o700)
    payload = release / 'payload'
    payload.mkdir(mode=0o755)
    journal.event('EXTRACT_EXACT_RELEASE_MEMBERS')
    for name, content in entries.items():
        target = payload / name
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444)
        with os.fdopen(fd, 'wb') as f:
            f.write(content)
    journal.event('INSTALL_LOCKED_LINUX_RUNTIME_DEPENDENCIES_ONCE')
    installed = install_linux_dependencies(p, docker, release, manifest)
    journal.event('CREATE_PRIVATE_CANDIDATE_APP')
    app, final_plan, final_ref = run_capacity_gate_controller(p, docker, journal)
    p.clear(); p.update(final_plan)
    journal.event('APP_CREATED_AND_CAPACITY_GATE_RELEASED', containerId=app)
    app_health = health(p, docker, app)
    web = create_web(p, docker)
    journal.event('PRIVATE_WEB_CREATED', containerId=web)
    docker.run(['start', web])
    web_health = health(p, docker, app, p['names']['stageWeb'])
    check_old(p, docker)
    containers = {}
    for role, cid in [('app', app), ('stageWeb', web)]:
        info = docker.inspect(cid)
        assert_own(info, p, 'app' if role == 'app' else 'web')
        containers[role] = {'id': cid, 'specSha256': own_container_fingerprint(info), 'imageId': info['Image']}
    value = {'format': 'naijue-candidate-stage-v1', 'status': 'CANDIDATE_STAGED_HEALTH_ONLY_NOT_BUSINESS', 'buildId': p['buildId'],
             'sourceCommit': p['sourceCommit'], 'archiveSha256': p['archive']['sha256'], 'manifestSha256': p['manifest']['sha256'],
             'capacityFinalPlan': final_ref, 'capacityFinalRuntimeIdentity': p['runtimeConfiguration']['identity'],
             'capacityProducer': p['capacityHost'],
             'releaseDirectory': str(release), 'installedPayloadSha256': installed, 'containers': containers,
             'health': {'app': app_health, 'proxy': web_health}, 'schemaVersions': p['schemaVersions'], 'database': DATABASE,
             'databaseQueriedByDeploymentTool': False, 'productionEntryChanged': False, 'businessAcceptance': False, 'finishedAtUtc': now()}
    if exact26_selected(p):
        value['runtime26BindingSha256'] = runtime_binding(p)
    new_json(release / 'stage-receipt.json', value)
    return value


def restore_old_entry(p, docker, journal, public_id=None):
    write_boundary(p, restore_old=True, docker=docker)
    need(file_identity(p['runtimeConfiguration']['path']) == p['runtimeConfiguration']['identity'], 'RUNTIME_CHANGED_REFUSE_OLD_ENTRY')
    check_old(p, docker, web_running=False)
    if public_id:
        info = docker.inspect(public_id)
        assert_own(info, p, 'web', True)
        if info['State']['Running']:
            docker.run(['stop', '--time', '15', public_id], 30)
        need(not docker.inspect(public_id)['State']['Running'], 'CANDIDATE_ENTRY_STOP_UNCONFIRMED')
    journal.event('RESTORE_EXACT_OLD_WEB_ID_NO_DB_RESTORE')
    docker.run(['start', p['beforeCAS']['services'][OLD_NAMES[1]]['id']])
    check_old(p, docker, web_restart=True)
    for _ in range(20):
        info = docker.inspect(p['beforeCAS']['services'][OLD_NAMES[1]]['id'])
        if info['State']['Running'] and info['State'].get('Health', {}).get('Status') == 'healthy':
            return snapshot(info)
        time.sleep(1)
    raise Refused('OLD_ENTRY_HEALTH_UNCONFIRMED')


def stop_full_app(p, docker, journal):
    need(exact26_full(p), 'EXPLICIT_FULL_STOP_REQUIRED')
    stage = reference(p.get('stageReceipt'))
    expected = stage['containers']['app']
    info = docker.inspect(expected['id'])
    assert_own(info, p, 'app')
    need(own_container_fingerprint(info) == expected['specSha256'], 'FULL_APP_CHANGED_REFUSE_GUESS')
    if info['State']['Running']:
        journal.action('STOP_EXACT_FULL_APP_PRESERVE_DATA:' + info['Id'],
                       lambda: docker.run(['stop', '--time', '20', info['Id']], 40))
    need(docker.inspect(info['Id'])['State']['Running'] is False, 'FULL_APP_STOP_UNCONFIRMED')
    return {'appId': info['Id'], 'stopped': True, 'dataPreserved': True, 'transactionOutcome': 'REQUIRES_ORIGINAL_KEY_READBACK'}


def activate(p, docker, journal, manifest):
    acceptance(p)
    write_boundary(p)
    staged = current_stage(p, docker, manifest)
    health(p, docker, staged['containers']['app']['id'], p['names']['stageWeb'])
    public_id, old_stopped = None, False
    try:
        # Persist intent before touching the entry. A lost/unknown Docker outcome is never replayed automatically.
        journal.event('STOP_EXACT_OLD_WEB_INTENT')
        docker.run(['stop', '--time', '20', p['beforeCAS']['services'][OLD_NAMES[1]]['id']], 40)
        old_stopped = True
        check_old(p, docker, web_running=False)
        write_boundary(p)
        validate_references(p)
        public_id = create_web(p, docker, True)
        journal.event('PUBLIC_WEB_CREATED', containerId=public_id)
        docker.run(['start', public_id])
        observed = health(p, docker, staged['containers']['app']['id'], p['names']['publicWeb'])
        loopback_health(p)
        check_old(p, docker, web_running=False)
        write_boundary(p)
        info = docker.inspect(public_id)
        assert_own(info, p, 'web', True)
        result = {'format': 'naijue-entry-activation-v1', 'status': 'ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK',
                  'buildId': p['buildId'], 'sourceCommit': p['sourceCommit'], 'archiveSha256': p['archive']['sha256'],
                  'publicContainer': {'id': public_id, 'specSha256': own_container_fingerprint(info)}, 'oldWebId': p['beforeCAS']['services'][OLD_NAMES[1]]['id'],
                  'health': observed, 'stageReceiptSha256': p['stageReceipt']['sha256'], 'candidateAcceptanceSha256': p['candidateAcceptance']['sha256'],
                  'backupReceiptSha256': p['backupReceipt']['sha256'], 'database': DATABASE, 'oldAppAndDatabaseUnchanged': True,
                  'databaseRestorePerformed': False, 'publicHttpsReadbackPerformed': False, 'bootPersistenceVerified': False,
                  'businessAcceptanceCreatedByDeployment': False, 'finishedAtUtc': now()}
        if exact26_selected(p):
            result['runtime26BindingSha256'] = runtime_binding(p)
        new_json(Path(p['releaseDirectory']) / 'activation-receipt.json', result)
        return result
    except Exception:
        journal.event('ACTIVATION_FAILED_RECOVERY_DECISION_REQUIRED', oldWebStopReturned=old_stopped, publicWebId=public_id)
        # Inspect the precise old ID even when stop timed out; recover only a confirmed stopped old web and a closed write boundary.
        try:
            state = docker.inspect(p['beforeCAS']['services'][OLD_NAMES[1]]['id'])
            if not state['State']['Running']:
                restored = restore_old_entry(p, docker, journal, public_id)
                journal.event('OLD_ENTRY_RESTORED', oldWeb=restored)
            else:
                check_old(p, docker, web_restart=True)
        except Exception:
            journal.event('RECOVERY_UNCONFIRMED_REQUIRES_C_OPERATOR_NO_REPLAY')
        raise


def execute(p, phase):
    job = exact_host(p)
    with open('/run/naijue-erp-hdd-test.lock', 'a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        journal = Journal(p, phase)
        docker = Docker()
        try:
            manifest, entries = validate_references(p, capacity_pending=phase == 'stage')
            check_old(p, docker)
            check_images_networks(p, docker)
            value = stage(p, docker, journal, manifest, entries) if phase == 'stage' else activate(p, docker, journal, manifest)
            journal.finish(value['status'], dockerCommands=docker.commands)
            new_json(job / 'results' / ('candidate-' + phase + '.json'), value)
            return value
        except Exception as error:
            if phase == 'stage':
                # Stop only exact new containers carrying this operation's immutable creation label. Keep all files/containers.
                for role, key in [('web', 'stageWeb'), ('app', 'app')]:
                    try:
                        info = docker.inspect(p['names'][key])
                        assert_own(info, p, role)
                        need(info['Config'].get('Labels', {}).get('naijue.rapid-launch.created-by') == p['operationId'], 'NOT_THIS_OPERATION_CONTAINER')
                        if info['State']['Running']:
                            docker.run(['stop', '--time', '15', info['Id']], 30)
                        journal.event('FAILED_STAGE_CONTAINER_STOPPED', containerId=info['Id'])
                    except Exception:
                        journal.event('FAILED_STAGE_CONTAINER_STOP_NOT_CONFIRMED', role=role)
            code = str(error) if isinstance(error, Refused) else type(error).__name__
            failure = journal.finish('FAILED_PRESERVED_NO_REPLAY', failureCode=code, dockerCommands=docker.commands,
                                     requiresOperator=True, oldAppOrDbRollbackAttempted=False)
            new_json(job / 'results' / ('candidate-' + phase + '.json'), failure)
            raise Refused(code) from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['stage', 'activate'], required=True)
    parser.add_argument('--plan', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    p = read_plan(args.plan)
    if not args.execute:
        validate_references(p)
        print(json.dumps({'status': 'PLAN_ONLY_NOT_EXECUTED', 'phase': args.phase, 'buildId': p['buildId'], 'sourceCommit': p['sourceCommit'],
                          'schemaVersions': p['schemaVersions'], 'releaseDirectory': p['releaseDirectory'], 'database': DATABASE,
                          'publicBinding': '127.0.0.1:18080', 'requiredWhenActivating': ['stageReceipt', 'candidateAcceptance', 'writeBoundary'],
                          'databaseRestoreAllowed': False, 'deploymentExecuted': False}))
    else:
        result = execute(p, args.phase)
        print(json.dumps({key: result.get(key) for key in ['status', 'buildId', 'sourceCommit', 'finishedAtUtc']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Refused) else 'CANDIDATE_DEPLOYMENT_FAILED_NO_REPLAY', file=__import__('sys').stderr)
        raise SystemExit(2)
