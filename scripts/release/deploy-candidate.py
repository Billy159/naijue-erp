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
RELEASE_CONTRACT = json.loads(r'''{"format":"naijue-release-contract-v1","migrationCount":26,"fontLicense":{"source":"apps/web/demo-replica/frontend/assets/fonts/LICENSE.txt","member":"web/source-styles/assets/fonts/LICENSE.txt"},"runtimeSqlPatches":[{"source":"adapters/postgres/patches/0026-v8-bootstrap-field-provenance.sql","member":"patches/0026-v8-bootstrap-field-provenance.sql"},{"source":"adapters/postgres/patches/0026-v9-empty-history-publication-dispatch.sql","member":"patches/0026-v9-empty-history-publication-dispatch.sql"},{"source":"adapters/postgres/patches/0026-v10-native-creation-trigger-record-scope.sql","member":"patches/0026-v10-native-creation-trigger-record-scope.sql"},{"source":"adapters/postgres/patches/0026-v11-document-specification-save.sql","member":"patches/0026-v11-document-specification-save.sql"}],"full":{"profile":"source-confirmed-native-exact26-r3-v1","patchLevel":"26_v20_history_insert_identity_from_v19"},"node":"24.21.0","requestBodyBudgets":[{"path":"/api/products/media/uploads","bytes":8388608},{"path":"/api/imported-history/sales/revise","bytes":4194304},{"path":"/api/imported-history/transfers/revise","bytes":4194304},{"path":"/api/products/commands","bytes":1048576},{"path":"/api/products/v2/commands","bytes":1048576},{"path":"/api/catalogue/categories/commands","bytes":1048576}]}''')
RELEASE_CONTRACT_SOURCE = json.loads(r'''{"path":"config/release-contract.json","bytes":1632,"sha256":"18dbb9988107905ba07df5fa45907d8a3a45aac52a75bcbd5d77b618266ba1de"}''')
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
    need({'package.json', 'package-lock.json', 'web/index.html', 'backend/production-main.js'} <= set(expected), 'RUNTIME_ENTRY_MEMBERS_REQUIRED')
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
        canonical(row.get('path'), root=ROOT)
    need(len({row['path'] for row in refs.values()}) == len(refs), 'DISTINCT_EXACT26_REFERENCES_REQUIRED')
    return True


def exact26_full(p):
    if p.get('runtimeSelector') != 'exact26-full':
        return False
    need('runtime26' not in p, 'FULL_MUST_NOT_REUSE_R1_REFERENCES')
    full = p.get('runtime26Full')
    need(isinstance(full, dict) and {'references', 'media'} <= set(full) <= {'references', 'media', 'inventorySpool'}, 'CLOSED_FULL_REFERENCES_REQUIRED')
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
    value = {'selector': p['runtimeSelector'], 'references': runtime_references(p), 'runtimeFile': p['runtimeConfiguration']}
    if exact26_full(p):
        value['media'] = p['runtime26Full']['media']
        value['inventorySpool'] = p['runtime26Full'].get('inventorySpool')
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
    required = {'apps/api/src/production-main.ts', 'apps/api/src/production-provider-composition.ts', 'apps/api/src/production-application-host.ts',
                'apps/api/src/postgres-read-api.ts', 'adapters/postgres/src/bounded-pool.ts', 'adapters/postgres/src/native-import-accounting-capability.ts'}
    if exact26_full(p):
        required.add('adapters/postgres/src/history-revision-store.ts')
    source_inputs = {row['path']: row for row in source.get('files', [])}
    need(source_inputs.get(RELEASE_CONTRACT_SOURCE['path']) == RELEASE_CONTRACT_SOURCE,
         'EXACT_RELEASE_CONTRACT_SOURCE_REQUIRED')
    need(manifest.get('entrypoints', {}).get('backend') == 'backend/production-main.js' and
         graph.get('entrySource') == component.get('entrySource') == 'apps/api/src/production-main.ts' and
         graph.get('entryOutput') == component.get('entryOutput') == 'backend/production-main.js' and
         inputs and inputs == component.get('inputs') and required <= {row['path'] for row in inputs} and
         all(row == source_inputs.get(row['path']) for row in inputs), 'EXACT26_NATIVE_BACKEND_GRAPH_REQUIRED')
    build_outputs = {row.get('member'): row for row in build.get('files', []) if row.get('role') == 'backend'}
    need(graph.get('outputs') and all(name in build_outputs and any(row['path'] == name and row['sha256'] == build_outputs[name]['sha256'] and
         row['bytes'] == build_outputs[name]['bytes'] for row in manifest['members']) for name in graph['outputs']), 'EXACT26_NATIVE_OUTPUT_BINDING_REQUIRED')


def validate_full_metadata(p, runtime, review, metadata, independent):
    """Fresh original issuer observation/review, without old C38/catalog constants."""
    refs = runtime_references(p)
    required = {'schemaVersion', 'profile', 'documentCommands', 'publicOrigin', 'http', 'assets', 'build', 'postgres', 'authentication', 'runtime26Review', 'existingPreparation', 'productMedia'}
    optional = {'organizationMaintenance', 'catalogueMaintenance', 'paymentMaintenance', 'partyMaintenance', 'staffMaintenance', 'productMaintenance', 'inventoryOutputSpool'}
    need(isinstance(runtime, dict) and required <= set(runtime) and set(runtime) <= required | optional and runtime['schemaVersion'] == 1 and
         runtime['profile'] == FULL_PROFILE and runtime['documentCommands'] == 'NATIVE_RUNTIME' and runtime['publicOrigin'] == ORIGIN and
         runtime['http'] == {'host': '0.0.0.0', 'port': 3000, 'acceptedHosts': [HOST]} and runtime['assets'] == {'root': '/app/web', 'entry': 'index.html'} and
         runtime['build'] == {'buildId': p['buildId'], 'sourceCommit': p['sourceCommit']} and runtime['runtime26Review'] ==
         {'reviewFile': RUNTIME26_REVIEW, 'trustedReviewSha256': refs['review']['sha256']}, 'CLOSED_FULL_R3_RUNTIME_REQUIRED')
    preparation = runtime['existingPreparation']
    need(isinstance(preparation, dict) and set(preparation) == {'sales', 'transfers'} and all(type(v) is bool for v in preparation.values()) and
         all(runtime[k] is True for k in optional - {'inventoryOutputSpool'} if k in runtime), 'EXPLICIT_FULL_CAPABILITIES_REQUIRED')
    need(runtime['productMedia'] == {'root': p['runtime26Full']['media']['containerRoot'], 'rootKey': p['runtime26Full']['media']['rootKey']}, 'FULL_MEDIA_BINDING_CHANGED')
    need(('inventoryOutputSpool' in runtime) == ('inventorySpool' in p['runtime26Full']), 'FULL_SPOOL_SELECTION_CHANGED')
    if 'inventoryOutputSpool' in runtime:
        need(runtime['inventoryOutputSpool'] == {'directory': '/private/inventory-exports', 'maxBytes': 536870912, 'maxConcurrent': 1, 'maxDurationMs': 120000}, 'EXACT_FULL_OUTPUT_SPOOL_REQUIRED')
    purposes = set(RUNTIME26_PURPOSES + ['PRODUCT_MAINTENANCE', 'HISTORY_REVISION'])
    need(isinstance(review, dict) and set(review) == {'version', 'decision', 'target', 'catalog', 'purposes', 'scope', 'independentReview', 'realImportExecutionAuthorized'} and
         review['version'] == 'C_NATIVE_RUNTIME26_REVIEW_V1' and review['decision'] == 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA' and
         review['scope'] == 'EXACT_TARGET_METADATA_ONLY' and review['realImportExecutionAuthorized'] is False and
         isinstance(review['purposes'], list) and len(review['purposes']) == len(purposes) and set(review['purposes']) == purposes and
         review['catalog'].get('format') == 'EXACT26_RUNTIME_CATALOG_EXPORT_V1' and review['catalog'].get('patchLevel') == FULL_PATCH and
         HASH.fullmatch(review['catalog'].get('sha256', '')), 'FRESH_FULL_PURPOSE_PROFILE_REVIEW_REQUIRED')
    need(independent.get('result') == 'PASS' and review['independentReview'] == {'path': RUNTIME26_INDEPENDENT, 'sha256': refs['independentReview']['sha256'], 'result': 'PASS'}, 'FULL_INDEPENDENT_REVIEW_REQUIRED')
    need(isinstance(metadata, dict) and set(metadata) == {'identity', 'migration_versions', 'catalog_sha256', 'source_routines_match'} and
         metadata['migration_versions'] == list(range(1, 27)) and metadata['source_routines_match'] is True and metadata['catalog_sha256'] == review['catalog']['sha256'], 'FULL_CURRENT_SCHEMA_SOURCE_ACL_PROOF_REQUIRED')
    identity, target = metadata['identity'], review['target']
    need(isinstance(target, dict) and set(target) == {'database', 'databaseOid', 'actingRole', 'sessionUser', 'serverAddress', 'serverPort', 'postmasterStart'} and
         target.get('database') == DATABASE and target.get('actingRole') == ROLE and target.get('sessionUser') == ROLE and
         isinstance(target.get('databaseOid'), str) and re.fullmatch(r'[1-9][0-9]*', target['databaseOid']) and
         isinstance(target.get('postmasterStart'), str) and target['postmasterStart'] and
         (target['serverAddress'] is None or isinstance(target['serverAddress'], str) and target['serverAddress']) and
         (target['serverPort'] is None or type(target['serverPort']) is int and 1 <= target['serverPort'] <= 65535) and
         all(identity.get(a) == target.get(b) for a, b in [('database', 'database'), ('database_oid', 'databaseOid'), ('current_user', 'actingRole'), ('session_user', 'sessionUser'),
             ('server_addr', 'serverAddress'), ('server_port', 'serverPort'), ('postmaster_start', 'postmasterStart')]) and identity.get('replication_role') == 'origin', 'FULL_CURRENT_TARGET_CHANGED')


def validate_runtime26_full(p, manifest, runtime):
    refs = runtime_references(p)
    review = reference(refs['review'], 65536)
    validate_full_metadata(p, runtime, review, reference(refs['metadata']), reference(refs['independentReview'], 8 * 1024 * 1024))
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


def validate_runtime26(p, manifest, db, runtime):
    if exact26_full(p):
        return validate_runtime26_full(p, manifest, runtime)
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


def validate_references(p):
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
        validate_runtime26(p, manifest, db, runtime)
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

    def inspect(self, name):
        result = json.loads(self.run(['container', 'inspect', name]))
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
             'host': {k: info['HostConfig'].get(k) for k in ['Binds', 'Mounts', 'PortBindings', 'ReadonlyRootfs', 'CapDrop', 'SecurityOpt', 'Memory', 'MemorySwap', 'NanoCpus', 'RestartPolicy', 'Tmpfs']},
             'networks': {name: {'id': row.get('NetworkID'), 'aliases': row.get('Aliases')} for name, row in info['NetworkSettings']['Networks'].items()}}
    return digest(encoded(value))


def assert_own(info, p, role, public=False):
    need(info['Config'].get('Labels', {}).get('naijue.rapid-launch.build-id') == p['buildId'] and
         info['Config']['Labels'].get('naijue.rapid-launch.archive-sha256') == p['archive']['sha256'] and
         info['Config']['Labels'].get('naijue.rapid-launch.role') == role, 'FOREIGN_CANDIDATE_CONTAINER_REFUSED')
    image = p['images']['node' if role == 'app' else 'web']['id']
    need(info['Image'] == image and info['HostConfig']['ReadonlyRootfs'] and
         not info['HostConfig'].get('Privileged') and not info['HostConfig'].get('CapAdd'), 'CANDIDATE_IMAGE_OR_PRIVILEGE_CHANGED')
    ports = info['HostConfig'].get('PortBindings') or {}
    need(ports == ({'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18080'}]} if public else {}), 'CANDIDATE_PUBLIC_BINDING_CHANGED')


def limits_args(p, key):
    row = p['limits'][key]
    return ['--memory', str(row['memoryMiB']) + 'm', '--memory-swap', str(row['memoryMiB']) + 'm', '--cpus', str(row['cpus']), '--pids-limit', '128']


def labels(p, role):
    return ['--label', 'naijue.rapid-launch.build-id=' + p['buildId'], '--label', 'naijue.rapid-launch.archive-sha256=' + p['archive']['sha256'],
            '--label', 'naijue.rapid-launch.role=' + role, '--label', 'naijue.rapid-launch.created-by=' + p['operationId']]


def mount(source, target, readonly=True):
    need(',' not in str(source) and ',' not in target, 'MOUNT_SEPARATOR_REFUSED')
    return ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + (',readonly' if readonly else '')]


def runtime_mount_arguments(p):
    args = []
    if exact26_selected(p):
        refs = runtime_references(p)
        args += [*mount(refs['review']['path'], RUNTIME26_REVIEW), *mount(refs['independentReview']['path'], RUNTIME26_INDEPENDENT)]
    if exact26_full(p):
        media = p['runtime26Full']['media']
        args += mount(media['hostRoot'], media['containerRoot'], False)
        if 'inventorySpool' in p['runtime26Full']:
            spool = p['runtime26Full']['inventorySpool']
            args += mount(spool['hostRoot'], spool['containerRoot'], False)
    return args


def runtime_entry_arguments(p):
    return (['--exact26-full'] if exact26_full(p) else ['--exact26-r1'] if exact26_selected(p) else []) + ['/run/naijue-rewrite/runtime.json']


def create_app(p, docker):
    args = ['create', '--name', p['names']['app'], '--pull=never', '--network', p['networks']['front']['id'], '--network-alias', p['names']['app'], '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--restart=no', '--user', p['limits']['app']['user'], '--workdir', '/app',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', *limits_args(p, 'app'), *labels(p, 'app'),
            *mount(Path(p['releaseDirectory']) / 'payload', '/app'), *mount(p['runtimeConfiguration']['path'], '/run/naijue-rewrite/runtime.json')]
    args += runtime_mount_arguments(p)
    args += ['--entrypoint', 'node', p['images']['node']['id'], '/app/backend/production-main.js']
    args += runtime_entry_arguments(p)
    cid = docker.run(args).decode().strip()
    need(HASH.fullmatch(cid), 'CREATED_CANDIDATE_ID_REQUIRED')
    docker.run(['network', 'connect', p['networks']['data']['id'], cid])
    return cid


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
    # Executed in the app container to avoid starting a probe image or publishing a stage port.
    script = """const h=require('node:http');const r=h.get({host:process.argv[1],port:Number(process.argv[2]),path:'/healthz',headers:{Host:'1n5635n614.goho.co'}},s=>{let b='';s.on('data',c=>{b+=c;if(b.length>4096)r.destroy()});s.on('end',()=>{try{const v=JSON.parse(b);if(s.statusCode!==200||v.status!=='HOST_READY'||v.databaseChecked!==false||v.sourceCommit!==process.argv[3]||v.buildId!==process.argv[4])process.exit(2);else process.stdout.write('HEALTH_IDENTITY_MATCH')}catch{process.exit(3)}})});r.setTimeout(3000,()=>{r.destroy();process.exit(4)});r.on('error',()=>process.exit(5));"""
    for _ in range(15):
        try:
            result = docker.run(['exec', app_id, 'node', '-e', script, via_web or '127.0.0.1', '8080' if via_web else '3000', p['sourceCommit'], p['buildId']], 10)
            need(result == b'HEALTH_IDENTITY_MATCH', 'CANDIDATE_HEALTH_RESPONSE_MISMATCH')
            return {'path': '/healthz', 'status': 200, 'sourceCommit': p['sourceCommit'], 'buildId': p['buildId'], 'databaseChecked': False}
        except Refused:
            time.sleep(1)
    raise Refused('CANDIDATE_INTERNAL_HEALTH_FAILED')


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
    app = create_app(p, docker)
    journal.event('APP_CREATED', containerId=app)
    docker.run(['start', app])
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
        # Independently check the loopback bound port with the approved Host header, without authentication or DB traffic.
        connection = http.client.HTTPConnection('127.0.0.1', 18080, timeout=5)
        try:
            connection.request('GET', '/healthz', headers={'Host': HOST})
            response = connection.getresponse()
            body = response.read(4097)
            value = json.loads(body)
            need(response.status == 200 and len(body) <= 4096 and value.get('status') == 'HOST_READY' and
                 value.get('buildId') == p['buildId'] and value.get('sourceCommit') == p['sourceCommit'] and value.get('databaseChecked') is False,
                 'ACTUAL_LOOPBACK_ENTRY_HEALTH_MISMATCH')
        finally:
            connection.close()
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
            manifest, entries = validate_references(p)
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
