#!/usr/bin/env python3
"""Fixed candidate boot owner. Inert import; plan by default; no SSH/SQL/Compose."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import time
import types

ROOT = Path('/srv/naijue-erp/rapid-launch-20261022')
SYSTEM = Path('/etc/systemd/system')
UNIT = 'naijue-rewrite-entry.service'
LEGACY = ('naijue-prod.service', 'naijue-t48-prod-runtime.service')
OLD = ('naijue-prod-app-1', 'naijue-prod-web-1', 'naijue-prod-db-1')
HASH = re.compile(r'[a-f0-9]{64}\Z')
IDENT = re.compile(r'[a-z0-9][a-z0-9-]{0,70}\Z')
PROPS = ('Id', 'FragmentPath', 'DropInPaths', 'UnitFileState', 'ActiveState', 'SubState')
POLICY = {'Name': 'unless-stopped', 'MaximumRetryCount': 0}
NO = {'Name': 'no', 'MaximumRetryCount': 0}
# Reviewed 842f source. A different helper requires a new reviewed boot-tool version.
DEPLOYMENT_SHA256 = 'a03a8bd34f68b2df1589a4c057a4bb8315368205b0842fc4856bb2aa882fad5a'
# Explicit exact26-r1 only; adoption depends on C90's independent source review.
DEPLOYMENT26_SHA256 = '3e9a642f82a5355b797135fc13e5012b502e8b0bd08fbd6481e1f93b82de596d'
DEPLOYMENT_CAPACITY_SHA256 = 'b313cf274ad50f47e5652bd23e24efcd41d3de92457d94934d40e0f3bf204485'
DEPLOYMENT_FULL_SHA256 = 'a2c149cd7543b82c76b249c975d01d6961d22a3fd0bb2ec26b3797e077bbe578'


class Refused(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Refused(code)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe(value, exists=True, directory=False):
    need(isinstance(value, (str, Path)), 'ABSOLUTE_CANONICAL_PATH_REQUIRED')
    p = Path(value)
    need(p.is_absolute() and str(p) == str(value) and str(p) == os.path.normpath(str(p)) and
         not re.search(r'[\s\x00-\x1f\x7f%\\]', str(p)), 'UNSAFE_PATH')
    for part in [*reversed(p.parents), p]:
        need(not part.is_symlink(), 'SYMLINK_PATH_REFUSED')
        if part.exists():
            s = part.lstat()
            need(not s.st_mode & 0o022, 'WRITABLE_PATH_COMPONENT_REFUSED')
            if part != p:
                need(stat.S_ISDIR(s.st_mode), 'ANCESTOR_NOT_DIRECTORY')
    if exists:
        s = p.lstat()
        need(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode) and s.st_nlink == 1,
             'REGULAR_SINGLE_LINK_FILE_REQUIRED')
    return p


def read(value, limit=4 * 1024 * 1024):
    p = safe(value)
    before = p.stat()
    need(before.st_size <= limit, 'BOUNDED_FILE_REQUIRED')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino), 'FILE_CHANGED')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            data = f.read(limit + 1)
        after = p.stat()
        need(len(data) <= limit and (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_dev, after.st_ino, len(data), after.st_mtime_ns), 'FILE_CHANGED')
        return data
    finally:
        os.close(fd)


def reference(ref, json_value=True):
    need(isinstance(ref, dict) and set(ref) == {'path', 'sha256'} and HASH.fullmatch(ref.get('sha256', '')),
         'EXACT_HASH_BOUND_REFERENCE_REQUIRED')
    data = read(ref['path'])
    need(sha(data) == ref['sha256'], 'REFERENCE_HASH_CHANGED')
    return json.loads(data) if json_value else data


def sync_dir(p):
    fd = os.open(p, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path, data, mode=0o600):
    p = safe(path, exists=False)
    safe(p.parent, directory=True)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    sync_dir(p.parent)


def fresh(value, seconds):
    try:
        instant = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        need(instant.tzinfo is not None, 'UTC_TIME_REQUIRED')
        age = (dt.datetime.now(dt.timezone.utc) - instant).total_seconds()
    except (AttributeError, TypeError, ValueError):
        raise Refused('INVALID_EVIDENCE_TIME') from None
    need(-30 <= age <= seconds, 'EVIDENCE_STALE_OR_FUTURE')


def owner_root(p):
    return ROOT / 'boot-entry' / p['fenceId']


def drop_path(name):
    return SYSTEM / (name + '.d') / '90-rewrite-entry-fence.conf'


def drop_bytes(p):
    return ('# Owned by rapid-launch boot-entry; no ExecStop is invoked.\n[Unit]\n'
            'ConditionPathExists=!' + str(owner_root(p) / 'FENCED') + '\n').encode()


def unit_bytes(p):
    root = owner_root(p)
    public_id = reference(p.get('activationReceipt'))['publicContainer']['id']
    need(HASH.fullmatch(public_id), 'EXACT_PUBLIC_ID_FOR_SYSTEMD_CLEANUP_REQUIRED')
    return (f'[Unit]\nDescription=Naijue exact rewrite entry\nRequires=docker.service\n'
            f'After=docker.service naijue-t15-firewall.service\nPartOf=docker.service\n'
            f'ConditionPathExists={root}/FENCED\nConditionPathExists=!{root}/DISARMED\n'
            f'[Service]\nType=oneshot\nRemainAfterExit=yes\nRestart=no\nTimeoutStartSec=420\nTimeoutStopSec=30\n'
            f'ExecStart=/usr/bin/python3 -s {root}/boot-entry.py --phase boot-start '
            f'--plan {root}/owner-plan.json --execute\n'
            f'ExecStopPost=-/usr/bin/docker stop --time 15 {public_id}\n'
            f'[Install]\nWantedBy=multi-user.target docker.service\n').encode()


def binding(p):
    return sha(encode({k: p[k] for k in ('fenceId', 'deploymentTool', 'deploymentPlan', 'stageReceipt',
                                       'legacyUnits', 'restartPolicies', 'bootAudit')}))


def deployment_binding(dp):
    """Pure plan shape checks; actual server artifacts are verified only on execution."""
    selector = dp.get('runtimeSelector', 'schema19')
    need(selector in ('schema19', 'exact26-r1', 'exact26-full'), 'UNKNOWN_DEPLOYMENT_RUNTIME_SELECTOR')
    if selector in ('exact26-r1', 'exact26-full'):
        if selector == 'exact26-full':
            full = dp.get('runtime26Full', {})
            need(isinstance(full, dict) and {'references', 'media'} <= set(full) <= {'references', 'media', 'inventorySpool', 'credentialRequestKey', 'catalogProfile'} and 'runtime26' not in dp, 'CLOSED_FULL_REFERENCES_REQUIRED')
            # Explicit versioned selection only; the pinned helper retains private-key stat checks.
            profile = full.get('catalogProfile', 'legacy-v1')
            need(isinstance(profile, str) and profile in ('legacy-v1', 'complete-write-v6', 'recorded-live-ledger-v7', 'recorded-live-write-v8'),
                 'EXPLICIT_SUPPORTED_FULL_CATALOG_PROFILE_REQUIRED')
            refs = full['references']
            expected = {'metadata', 'review', 'independentReview', 'buildReceipt', 'sourceManifest', 'buildManifest', 'publication', 'backupCoverage'}
            need(isinstance(refs, dict) and dp.get('newDatabaseReceipt') == refs.get('metadata'), 'FULL_CURRENT_METADATA_NOT_OLD_SCHEMA19_REQUIRED')
        else:
            need('runtime26Full' not in dp, 'FULL_REFERENCES_REQUIRE_EXPLICIT_SELECTOR')
            refs, expected = dp.get('runtime26'), {'upgradeReceipt', 'review', 'independentReview', 'buildReceipt', 'sourceManifest', 'buildManifest'}
        need(isinstance(refs, dict) and set(refs) == expected,
             'CLOSED_EXACT26_REFERENCES_REQUIRED')
        for ref in [*refs.values(), dp.get('newDatabaseReceipt', {})]:
            need(isinstance(ref, dict) and set(ref) == {'path', 'sha256'} and HASH.fullmatch(ref.get('sha256', '')), 'PINNED_EXACT26_REFERENCE_REQUIRED')
            safe(ref['path'], exists=False)
            need(Path(ref['path']) != ROOT and Path(ref['path']).is_relative_to(ROOT), 'PERMANENT_EXACT26_REFERENCE_REQUIRED')
        need(len({row['path'] for row in refs.values()}) == len(expected), 'DISTINCT_EXACT26_REFERENCES_REQUIRED')
    else:
        need('runtime26' not in dp and 'runtime26Full' not in dp, 'EXACT26_REFERENCES_REQUIRE_EXPLICIT_SELECTOR')
    need(dp.get('format') == 'naijue-candidate-deployment-v1' and
         re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', dp.get('buildId', '')) and
         re.fullmatch(r'[a-f0-9]{40}', dp.get('sourceCommit', '')) and
         dp.get('publicOrigin') == 'https://1n5635n614.goho.co' and
         dp.get('schemaVersions') == list(range(1, 27) if selector in ('exact26-r1', 'exact26-full') else range(1, 20)),
         'EXACT_DEPLOYMENT_IDENTITY_REQUIRED')
    need(dp.get('releaseDirectory') == str(ROOT / 'releases' / dp['buildId']) and
         HASH.fullmatch(dp.get('archive', {}).get('sha256', '')), 'EXACT_RELEASE_DIRECTORY_AND_ARCHIVE_REQUIRED')
    for key in ('manifest', 'nginxConfiguration'):
        ref = dp.get(key, {})
        need(set(ref) == {'path', 'sha256'} and HASH.fullmatch(ref.get('sha256', '')), 'PINNED_RUNTIME_ARTIFACT_REQUIRED')
        safe(ref['path'], exists=False)
        if key == 'nginxConfiguration':
            need(Path(ref['path']).is_relative_to(ROOT), 'RUNTIME_ARTIFACT_OUTSIDE_RELEASE_ROOT')
    need('capacityHost' in dp, 'CAPACITY_RELEASE_ARTIFACTS_REQUIRED')
    capacity = dp['capacityHost']
    need(isinstance(capacity, dict) and set(capacity) == {'collector', 'profile', 'interpreter', 'reviewSha256'}, 'CLOSED_CAPACITY_ARTIFACTS_REQUIRED')
    for key, suffix in [('collector', 'capacity-live-statfs.mjs'), ('profile', 'owner-profile.json')]:
        row = capacity[key]
        need(isinstance(row, dict) and set(row) == {'hostFile', 'containerFile', 'sha256'} and HASH.fullmatch(row.get('sha256', '')) and
             row.get('containerFile') == '/run/naijue-rewrite/capacity/' + suffix, 'EXACT_CAPACITY_MOUNT_REQUIRED')
        safe(row.get('hostFile'), exists=False)
        need(Path(row['hostFile']).is_relative_to(ROOT), 'CAPACITY_ARTIFACT_OUTSIDE_RELEASE_ROOT')
    interpreter = capacity['interpreter']
    need(isinstance(interpreter, dict) and set(interpreter) == {'containerFile', 'sha256', 'imageId'} and interpreter.get('containerFile') == '/usr/local/bin/node' and
         HASH.fullmatch(interpreter.get('sha256', '')) and interpreter.get('imageId') == dp.get('images', {}).get('node', {}).get('id') and
         HASH.fullmatch(capacity.get('reviewSha256', '')), 'PINNED_CAPACITY_INTERPRETER_REQUIRED')
    runtime = dp.get('runtimeConfiguration', {})
    safe(runtime.get('path'), exists=False)
    need(Path(runtime['path']).is_relative_to(ROOT) and isinstance(runtime.get('identity'), dict), 'PRIVATE_RUNTIME_REFERENCE_REQUIRED')
    need(set(dp.get('beforeCAS', {}).get('services', {})) == set(OLD), 'EXACT_OLD_SERVICE_IDS_REQUIRED')
    for row in dp['beforeCAS']['services'].values():
        need(HASH.fullmatch(row.get('id', '')) and re.fullmatch(r'sha256:[a-f0-9]{64}', row.get('imageId', '')) and
             isinstance(row.get('startedAt'), str) and type(row.get('restartCount')) is int, 'COMPLETE_OLD_SERVICE_CAS_REQUIRED')
    need(isinstance(dp['beforeCAS'].get('files'), list) and dp['beforeCAS']['files'], 'ORIGINAL_CONFIG_PINS_REQUIRED')
    for ref in dp['beforeCAS']['files']:
        safe(ref.get('path'), exists=False)
        need(Path(ref['path']).is_relative_to('/srv/naijue-erp/prod') and
             str(ref['path']).endswith(('.json', '.conf')) and HASH.fullmatch(ref.get('sha256', '')), 'OLD_PUBLIC_CONFIG_PIN_REQUIRED')
    need(set(dp.get('images', {})) == {'node', 'web'} and set(dp.get('networks', {})) == {'front', 'data', 'install'},
         'EXACT_IMAGE_AND_NETWORK_SET_REQUIRED')
    for row in dp['images'].values():
        need(re.fullmatch(r'sha256:[a-f0-9]{64}', row.get('id', '')) and row.get('platform') == 'linux/amd64', 'IMMUTABLE_IMAGE_REQUIRED')
    for key, name in [('front', 'naijue-prod-front'), ('data', 'naijue-prod-data'), ('install', 'naijue-prod-ingress')]:
        row = dp['networks'][key]
        need(row.get('name') == name and HASH.fullmatch(row.get('id', '')), 'EXACT_NETWORK_PIN_REQUIRED')
    need(set(dp.get('names', {})) == {'app', 'stageWeb', 'publicWeb', 'installer'}, 'EXACT_CANDIDATE_NAMES_REQUIRED')
    for key, suffix in [('app', 'app'), ('stageWeb', 'stage-web'), ('publicWeb', 'web'), ('installer', 'installer')]:
        need(re.fullmatch(r'naijue-rewrite-[a-z0-9-]{1,55}-' + suffix, dp['names'].get(key, '')), 'FIXED_CANDIDATE_NAME_REQUIRED')



def capacity_stage_binding(p, dp, stage):
    """Consume all three final-stage fields, including the existing exact boot-copy relocation."""
    need('capacityQaObserver' not in dp, 'EPHEMERAL_QA_CANNOT_PERSIST_OR_BOOT')
    selected = p.get('deploymentPlan')
    need(isinstance(selected, dict) and set(selected) == {'path', 'sha256'} and HASH.fullmatch(selected.get('sha256', '')), 'CAPACITY_SELECTED_FINAL_PLAN_REQUIRED')
    original = p.get('originalReferences', {}).get('deploymentPlan')
    if original is not None:
        need(isinstance(original, dict) and set(original) == {'path', 'sha256'} and selected['sha256'] == original['sha256'] and
             selected['path'] == str(owner_root(p) / 'deployment-plan.json'), 'CAPACITY_FINAL_PLAN_RELOCATION_CHANGED')
        selected = original
    need(stage.get('capacityFinalPlan') == selected, 'STAGE_CAPACITY_FINAL_PLAN_MISMATCH')
    need(stage.get('capacityFinalRuntimeIdentity') == dp.get('runtimeConfiguration', {}).get('identity') and
         isinstance(stage.get('capacityFinalRuntimeIdentity'), dict), 'STAGE_CAPACITY_RUNTIME_IDENTITY_MISMATCH')
    need(stage.get('capacityProducer') == dp.get('capacityHost') and isinstance(stage.get('capacityProducer'), dict), 'STAGE_CAPACITY_PRODUCER_MISMATCH')
    return True


def load_plan(filename):
    p = json.loads(read(filename))
    need(p.get('format') == 'naijue-boot-entry-v1', 'PLAN_FORMAT_REQUIRED')
    for k in ('operationId', 'fenceId'):
        need(IDENT.fullmatch(p.get(k, '')), 'BOUNDED_OPERATION_ID_REQUIRED')
    need(set(p.get('legacyUnits', {})) == set(LEGACY), 'EXACT_LEGACY_UNITS_REQUIRED')
    for name, row in p['legacyUnits'].items():
        need(set(row) == {'sha256', 'unitFileState', 'activeState', 'subState', 'dropIns'} and
             HASH.fullmatch(row.get('sha256', '')) and row['unitFileState'] == 'enabled' and
             row['activeState'] in ('active', 'inactive') and row['subState'] in ('exited', 'dead') and
             row['dropIns'] == [], 'KNOWN_LEGACY_BASELINE_REQUIRED_NO_EXISTING_DROPINS')
    need(p.get('restartPolicies') == {name: POLICY for name in OLD}, 'EXACT_OLD_RESTART_POLICY_REQUIRED')
    # Select from the hash-bound base plan before executing either known helper.
    dp = reference(p.get('deploymentPlan'))
    deployment_binding(dp)
    helper_sha = DEPLOYMENT_CAPACITY_SHA256 if 'capacityHost' in dp else (DEPLOYMENT_FULL_SHA256 if dp.get('runtimeSelector') == 'exact26-full' else DEPLOYMENT26_SHA256 if dp.get('runtimeSelector') == 'exact26-r1' else DEPLOYMENT_SHA256)
    # Execute only the bytes that were actually hash-checked, not a second import path lookup.
    need(p.get('deploymentTool', {}).get('sha256') == helper_sha, 'REVIEWED_DEPLOYMENT_HELPER_REQUIRED')
    source = reference(p.get('deploymentTool'), False)
    d = types.ModuleType('fixed_deployment_implementation')
    d.__file__ = p['deploymentTool']['path']
    exec(compile(source, d.__file__, 'exec'), d.__dict__)
    dp['stageReceipt'] = p['stageReceipt']
    stage = reference(p['stageReceipt'])
    capacity_stage_binding(p, dp, stage)
    need(stage.get('status') == 'CANDIDATE_STAGED_HEALTH_ONLY_NOT_BUSINESS' and
         all(stage.get(k) == dp[k] for k in ('buildId', 'sourceCommit', 'releaseDirectory')) and
         stage.get('archiveSha256') == dp['archive']['sha256'] and
         stage.get('manifestSha256') == dp['manifest']['sha256'] and
         HASH.fullmatch(stage.get('installedPayloadSha256', '')), 'EXACT_STAGE_RECEIPT_REQUIRED')
    runtime_pin = d.runtime_binding(dp) if dp.get('runtimeSelector') in ('exact26-r1', 'exact26-full') else None
    need(stage.get('schemaVersions') == dp['schemaVersions'] and stage.get('runtime26BindingSha256') == runtime_pin,
         'STAGED_RUNTIME_SELECTION_OR_REVIEW_CHANGED')
    for role in ('app', 'stageWeb'):
        need(HASH.fullmatch(stage.get('containers', {}).get(role, {}).get('id', '')) and
             HASH.fullmatch(stage['containers'][role].get('specSha256', '')), 'EXACT_CANDIDATE_IDS_REQUIRED')
    audit = reference(p['bootAudit'])
    need(audit.get('format') == 'naijue-legacy-boot-audit-v1' and audit.get('result') == 'PASS' and
         audit.get('reviewedBy') == 'C' and audit.get('monitorBehavior') == 'OBSERVATION_ONLY' and
         audit.get('otherEntryLaunchers') == 'NONE_OUTSIDE_FENCED_UNITS_AND_DOCKER_RESTART' and
         audit.get('legacyUnitSha256') == {k: v['sha256'] for k, v in p['legacyUnits'].items()},
         'BOOT_ACTOR_OR_MONITOR_SEMANTICS_UNRESOLVED')
    need(isinstance(audit.get('files'), list) and audit['files'] and
         '/srv/naijue-erp/t48/entry-monitor/monitor.py' in [x.get('path') for x in audit['files']] and
         isinstance(audit.get('enabledActors'), list) and set(LEGACY) <= set(audit['enabledActors']) and
         len(set(audit['enabledActors'])) == len(audit['enabledActors']) and
         all(re.fullmatch(r'naijue-[A-Za-z0-9_-]+\.(service|timer)', name) for name in audit['enabledActors']) and
         isinstance(audit.get('evidence'), list) and audit['evidence'], 'COMPLETE_BOOT_ACTOR_AUDIT_REQUIRED')
    for ref in [*audit['files'], *audit['evidence']]:
        need(isinstance(ref, dict) and set(ref) == {'path', 'sha256'} and HASH.fullmatch(ref.get('sha256', '')),
             'PINNED_BOOT_AUDIT_INPUT_REQUIRED')
        safe(ref['path'], exists=False)
    if p.get('activationReceipt'):
        a = reference(p['activationReceipt'])
        need(a.get('format') == 'naijue-entry-activation-v1' and
             a.get('status') == 'ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK' and
             a.get('buildId') == dp['buildId'] and a.get('sourceCommit') == dp['sourceCommit'] and
             a.get('archiveSha256') == dp['archive']['sha256'] and a.get('stageReceiptSha256') == p['stageReceipt']['sha256'] and
             a.get('oldWebId') == dp['beforeCAS']['services'][OLD[1]]['id'] and
             HASH.fullmatch(a.get('publicContainer', {}).get('id', '')) and
             HASH.fullmatch(a['publicContainer'].get('specSha256', '')), 'EXACT_ACTIVATION_RECEIPT_REQUIRED')
        need(a.get('runtime26BindingSha256') == runtime_pin, 'ACTIVATED_RUNTIME_SELECTION_OR_REVIEW_CHANGED')
    return p, d, dp, stage


def systemctl(*args, allow_missing=False):
    r = subprocess.run(['/usr/bin/systemctl', *args], capture_output=True, timeout=30,
                       env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
    need((r.returncode == 0 or allow_missing and r.returncode in (1, 4)) and len(r.stdout) < 1024 * 1024,
         'SYSTEMCTL_FAILED_OR_UNKNOWN_NO_REPLAY')
    return r.stdout.decode()


def unit_state(name):
    text = systemctl('show', name, *['--property=' + k for k in PROPS], allow_missing=name == UNIT)
    out = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
    need(set(out) == set(PROPS), 'COMPLETE_UNIT_STATE_REQUIRED')
    if out['UnitFileState'] in ('', 'not-found'):
        need(name == UNIT and out['FragmentPath'] == '' and out['DropInPaths'] == '' and
             out['ActiveState'] == 'inactive' and out['SubState'] == 'dead', 'UNKNOWN_MISSING_UNIT_STATE')
    return out


def optional_hash(path):
    safe(path, exists=False)
    return sha(read(path)) if Path(path).exists() else None


def public_by_name(dp, docker):
    result = docker.run(['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter',
                         'name=^/' + dp['names']['publicWeb'] + '$']).decode().strip()
    need(not result or HASH.fullmatch(result), 'PUBLIC_CANDIDATE_LOOKUP_UNKNOWN')
    return result or None


def observe(p, d, dp, stage):
    docker = d.Docker()
    rows = {}
    for name in OLD:
        info = docker.inspect(dp['beforeCAS']['services'][name]['id'])
        rows[name] = {**d.snapshot(info), 'name': info['Name'], 'restartPolicy': info['HostConfig']['RestartPolicy']}
    units = {name: {'state': unit_state(name), 'fileSha256': optional_hash(SYSTEM / name),
                    'dropInSha256': optional_hash(drop_path(name))} for name in LEGACY}
    root = owner_root(p)
    candidate = {}
    refs = {'app': stage['containers']['app']}
    if p.get('activationReceipt'):
        refs['publicWeb'] = reference(p['activationReceipt'])['publicContainer']
    for role, ref in refs.items():
        info = docker.inspect(ref['id'])
        candidate[role] = {**d.snapshot(info), 'specSha256': d.own_container_fingerprint(info)}
    return {'legacyUnits': units, 'oldContainers': rows, 'candidate': candidate, 'publicCandidateByName': public_by_name(dp, docker),
            'ownerUnit': {'state': unit_state(UNIT), 'sha256': optional_hash(SYSTEM / UNIT)},
            'ownedFiles': {name: optional_hash(root / name) for name in
                           ('FENCED', 'DISARMED', 'snapshot.json', 'owner-plan.json', 'boot-entry.py', 'deploy-candidate.py')}}


def audit_live(p, boot=False):
    a = reference(p['bootAudit'])
    if not boot:
        fresh(a.get('checkedAtUtc'), 86400)
    for ref in a['files']:
        reference(ref, False)
    for ref in a['evidence']:
        reference(ref)
    # Match the complete enabled ERP unit/timer inventory; our owner is the only new addition.
    text = systemctl('list-unit-files', '--no-legend', '--no-pager', '--plain', 'naijue-*.service', 'naijue-*.timer')
    enabled = sorted(line.split()[0] for line in text.splitlines() if len(line.split()) >= 2 and line.split()[1] == 'enabled')
    expected = sorted(set(a['enabledActors']) - (set(LEGACY) if boot else set()))
    need([x for x in enabled if x != UNIT] == expected, 'ENABLED_BOOT_ACTORS_CHANGED')


def old_identity(p, d, dp, docker, exact_start=True, web_running=None):
    for name in OLD:
        info = docker.inspect(dp['beforeCAS']['services'][name]['id'])
        expected = dp['beforeCAS']['services'][name]
        need(info['Id'] == expected['id'] and info['Name'] == '/' + name and info['Image'] == expected['imageId'],
             'OLD_CONTAINER_IDENTITY_CHANGED')
        if exact_start and name != OLD[1]:
            need(info['State']['StartedAt'] == expected['startedAt'] and info['RestartCount'] == expected['restartCount'] and
                 info['State']['Running'], 'PROTECTED_OLD_APP_OR_DB_RUNTIME_CHANGED')
        if name != OLD[1]:
            need(info['HostConfig']['RestartPolicy'] == POLICY and not info['HostConfig'].get('PortBindings'),
                 'PROTECTED_OLD_APP_OR_DB_SPEC_CHANGED')
        else:
            need(info['HostConfig'].get('PortBindings') == {'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18080'}]},
                 'OLD_WEB_PORT_CHANGED')
            if web_running is not None:
                need(info['State']['Running'] is web_running, 'OLD_WEB_RUNNING_STATE_CHANGED')


def candidate(p, d, dp, stage, docker, public=False):
    ref = reference(p['activationReceipt'])['publicContainer'] if public else stage['containers']['app']
    info = docker.inspect(ref['id'])
    d.assert_own(info, dp, 'web' if public else 'app', public)
    need(info['Name'] == '/' + dp['names']['publicWeb' if public else 'app'] and
         d.own_container_fingerprint(info) == ref['specSha256'] and info['HostConfig']['RestartPolicy'] == NO,
         'CANDIDATE_SPEC_OR_RESTART_POLICY_CHANGED')
    return info


def artifacts(p, d, dp, stage):
    capacity_stage_binding(p, dp, stage)
    # The staged payload carries the verified manifest; do not depend on an expiring job bundle at boot.
    manifest = d.reference({'path': str(Path(dp['releaseDirectory']) / 'payload/release-manifest.json'),
                            'sha256': dp['manifest']['sha256']})
    need(d.payload_identity(Path(dp['releaseDirectory']) / 'payload', manifest, True) == stage['installedPayloadSha256'],
         'PERSISTED_PAYLOAD_OR_DEPENDENCY_CHANGED')
    need(d.file_identity(dp['runtimeConfiguration']['path']) == dp['runtimeConfiguration']['identity'], 'PRIVATE_RUNTIME_IDENTITY_CHANGED')
    need(d.file_hash(dp['nginxConfiguration']['path']) == dp['nginxConfiguration']['sha256'], 'PROXY_CONFIGURATION_CHANGED')
    if dp.get('runtimeSelector') in ('exact26-r1', 'exact26-full'):
        need(stage.get('runtime26BindingSha256') == d.runtime_binding(dp), 'EXACT26_PERSISTED_RUNTIME_BINDING_CHANGED')
        # Reuse the pinned C90 metadata/source/build gate, without archive/backup replay or PG traffic.
        d.validate_runtime26(dp, manifest, d.reference(dp['newDatabaseReceipt']), d.json_file(dp['runtimeConfiguration']['path'], private=True))
        need(d.file_identity(dp['runtimeConfiguration']['path']) == dp['runtimeConfiguration']['identity'], 'PRIVATE_RUNTIME_CHANGED_DURING_METADATA_VALIDATION')


def persistent_references(p, dp):
    for key, filename in [('stageReceipt', 'stage-receipt.json'), ('activationReceipt', 'activation-receipt.json')]:
        need(p.get(key, {}).get('path') == str(Path(dp['releaseDirectory']) / filename), 'PERMANENT_RELEASE_RECEIPT_REQUIRED')
    audit = reference(p['bootAudit'])
    for ref in [p['bootAudit'], *audit['evidence']]:
        need(Path(ref['path']).is_relative_to(ROOT) and not Path(ref['path']).is_relative_to(owner_root(p)),
             'PERMANENT_PREEXISTING_BOOT_AUDIT_REQUIRED')
    need(Path(dp['runtimeConfiguration']['path']).is_relative_to(ROOT) and
         Path(dp['nginxConfiguration']['path']).is_relative_to(ROOT), 'PERMANENT_RUNTIME_CONFIG_REFERENCE_REQUIRED')
    if dp.get('runtimeSelector') in ('exact26-r1', 'exact26-full'):
        refs = dp['runtime26Full']['references'] if dp.get('runtimeSelector') == 'exact26-full' else dp['runtime26']
        for ref in [*refs.values(), dp['newDatabaseReceipt']]:
            need(Path(ref['path']).is_relative_to(ROOT) and not Path(ref['path']).is_relative_to(owner_root(p)),
                 'PREEXISTING_PERMANENT_EXACT26_REFERENCE_REQUIRED')


def fenced(p):
    root = owner_root(p)
    need(read(root / 'FENCED') == encode({'binding': binding(p)}), 'FENCE_MARKER_CHANGED')
    for name in LEGACY:
        need(optional_hash(SYSTEM / name) == p['legacyUnits'][name]['sha256'] and read(drop_path(name)) == drop_bytes(p),
             'LEGACY_UNIT_OR_FENCE_CHANGED')
        s = unit_state(name)
        need(s['UnitFileState'] == 'disabled' and s['FragmentPath'] == str(SYSTEM / name) and
             s['DropInPaths'] == str(drop_path(name)), 'LEGACY_STARTUP_NOT_FENCED')


class Journal:
    def __init__(self, p, phase, directory):
        self.directory = directory
        self.data = {'format': 'naijue-boot-operation-v1', 'phase': phase, 'operationId': p['operationId'],
                     'binding': binding(p), 'startedAtUtc': now(), 'events': [], 'status': 'STARTED_NO_REPLAY'}
        self.path = directory / (p['operationId'] + '.json')
        write_new(self.path, encode(self.data))

    def save(self):
        temp = self.path.with_suffix('.next')
        write_new(temp, encode(self.data))
        os.replace(temp, self.path)
        sync_dir(self.directory)

    def action(self, label, operation):
        self.data['events'].append({'action': label, 'state': 'INTENT_OUTCOME_UNKNOWN', 'atUtc': now()})
        self.save()
        result = operation()
        self.data['events'][-1].update(state='RETURNED_SUCCESS_PENDING_READBACK', returnedAtUtc=now())
        self.save()
        return result

    def finish(self, status, **values):
        self.data.update(status=status, finishedAtUtc=now(), **values)
        self.save()
        return self.data


def mkdir_new(p):
    safe(p, exists=False)
    p.mkdir(mode=0o700)
    sync_dir(p.parent)


def mkdir_if_missing(p):
    if not p.exists():
        mkdir_new(p)
    safe(p, directory=True)


def fence(p, d, dp, stage, journal):
    audit_live(p)
    docker = d.Docker()
    d.check_old(dp, docker)
    old_identity(p, d, dp, docker)
    candidate(p, d, dp, stage, docker)
    if dp.get('runtimeSelector') in ('exact26-r1', 'exact26-full'):
        artifacts(p, d, dp, stage)  # Refuse changed metadata before writing any legacy fence.
    state = observe(p, d, dp, stage)
    need(state['publicCandidateByName'] is None, 'PUBLIC_CANDIDATE_EXISTS_BEFORE_FENCE')
    need(state['ownerUnit']['sha256'] is None and state['ownerUnit']['state']['UnitFileState'] in ('', 'not-found'),
         'EXISTING_OWNER_REFUSED')
    for name in LEGACY:
        row, expected = state['legacyUnits'][name], p['legacyUnits'][name]
        need(row['fileSha256'] == expected['sha256'] and row['dropInSha256'] is None and row['state'] ==
             {'Id': name, 'FragmentPath': str(SYSTEM / name), 'DropInPaths': '', 'UnitFileState': expected['unitFileState'],
              'ActiveState': expected['activeState'], 'SubState': expected['subState']}, 'LEGACY_UNIT_CAS_CHANGED')
    need(all(state['oldContainers'][name]['restartPolicy'] == POLICY for name in OLD), 'OLD_RESTART_POLICY_CAS_CHANGED')
    root = owner_root(p)
    journal.action('CREATE_NEW_FENCE_DIRECTORY', lambda: mkdir_new(root))
    snapshot = {'format': 'naijue-boot-snapshot-v1', 'binding': binding(p), 'state': state, 'plan': p, 'savedAtUtc': now()}
    journal.action('SAVE_EXACT_PRECHANGE_SNAPSHOT', lambda: write_new(root / 'snapshot.json', encode(snapshot)))
    for name in LEGACY:
        data = read(SYSTEM / name)
        need(sha(data) == p['legacyUnits'][name]['sha256'], 'UNIT_CHANGED_BEFORE_SNAPSHOT')
        journal.action('SAVE_ORIGINAL_' + name, lambda name=name, data=data: write_new(root / name, data))
    journal.action('WRITE_PERSISTENT_LEGACY_FENCE', lambda: write_new(root / 'FENCED', encode({'binding': binding(p)})))
    for name in LEGACY:
        directory = drop_path(name).parent
        journal.action('CREATE_DROPIN_DIRECTORY_' + name, lambda directory=directory: mkdir_if_missing(directory))
        journal.action('FENCE_START_' + name, lambda name=name: write_new(drop_path(name), drop_bytes(p), 0o644))
    journal.action('RELOAD_UNIT_DEFINITIONS_NO_STOP', lambda: systemctl('daemon-reload'))
    for name in reversed(LEGACY):
        journal.action('DISABLE_NO_NOW_' + name, lambda name=name: systemctl('disable', name))
    old_identity(p, d, dp, docker)
    need(docker.inspect(dp['beforeCAS']['services'][OLD[1]]['id'])['HostConfig']['RestartPolicy'] == POLICY, 'OLD_WEB_POLICY_CHANGED')
    journal.action('OLD_WEB_RESTART_NO_EXACT_CID', lambda: docker.run(['update', '--restart=no', dp['beforeCAS']['services'][OLD[1]]['id']]))
    fenced(p)
    after = observe(p, d, dp, stage)
    need(after['oldContainers'] == {name: {**row, 'restartPolicy': NO if name == OLD[1] else POLICY}
                                  for name, row in state['oldContainers'].items()}, 'FENCE_CHANGED_LIVE_CONTAINER_STATE')
    return {'status': 'LEGACY_BOOT_FENCED_CURRENT_ENTRY_UNCHANGED', 'snapshotSha256': sha(read(root / 'snapshot.json')),
            'snapshotPath': str(root / 'snapshot.json'), 'state': after, 'bootOrRebootTested': False}


def arm(p, d, dp, stage, journal):
    need(p.get('activationReceipt') and p.get('fenceReceipt'), 'ACTIVATION_AND_FENCE_RECEIPTS_REQUIRED')
    persistent_references(p, dp)
    receipt = reference(p['fenceReceipt'])
    need(receipt.get('status') == 'LEGACY_BOOT_FENCED_CURRENT_ENTRY_UNCHANGED' and receipt.get('binding') == binding(p) and
         receipt.get('snapshotSha256') == sha(read(owner_root(p) / 'snapshot.json')), 'EXACT_COMPLETED_FENCE_REQUIRED')
    fenced(p)
    audit_live(p, boot=True)
    docker = d.Docker()
    old_identity(p, d, dp, docker, web_running=False)
    need(docker.inspect(dp['beforeCAS']['services'][OLD[1]]['id'])['HostConfig']['RestartPolicy'] == NO, 'OLD_WEB_RESTART_NOT_DISABLED')
    artifacts(p, d, dp, stage)
    d.check_images_networks(dp, docker)
    need(candidate(p, d, dp, stage, docker)['State']['Running'] and
         candidate(p, d, dp, stage, docker, True)['State']['Running'], 'ACTUAL_ACTIVATED_CANDIDATE_REQUIRED')
    need(public_by_name(dp, docker) == reference(p['activationReceipt'])['publicContainer']['id'], 'PUBLIC_CANDIDATE_NAME_ID_CHANGED')
    d.health(dp, docker, stage['containers']['app']['id'], dp['names']['publicWeb'])
    root = owner_root(p)
    need(not (root / 'DISARMED').exists() and not (SYSTEM / UNIT).exists() and not (SYSTEM / (UNIT + '.d')).exists(),
         'EXISTING_OWNER_OR_DISARMED_STATE_NO_REPLAY')
    source = read(Path(__file__).absolute())
    saved = dict(p, ownerSourceSha256=sha(source), installedAtUtc=now())
    journal.action('SAVE_BOOT_HELPER', lambda: write_new(root / 'boot-entry.py', source))
    journal.action('SAVE_PINNED_DEPLOYMENT_HELPER', lambda: write_new(root / 'deploy-candidate.py', reference(p['deploymentTool'], False)))
    # Persist a local copy of the exact base plan; its references remain immutable server paths.
    capacity_stage_binding(p, dp, stage)
    journal.action('SAVE_DEPLOYMENT_PLAN', lambda: write_new(root / 'deployment-plan.json', reference(p['deploymentPlan'], False)))
    saved['deploymentTool'] = {'path': str(root / 'deploy-candidate.py'), 'sha256': p['deploymentTool']['sha256']}
    saved['deploymentPlan'] = {'path': str(root / 'deployment-plan.json'), 'sha256': p['deploymentPlan']['sha256']}
    # Path relocation must not alter the fence identity.
    saved['originalBinding'] = binding(p)
    saved['originalReferences'] = {k: p[k] for k in ('deploymentTool', 'deploymentPlan')}
    journal.action('SAVE_FIXED_OWNER_PLAN', lambda: write_new(root / 'owner-plan.json', encode(saved)))
    journal.action('INSTALL_FIXED_OWNER_UNIT', lambda: write_new(SYSTEM / UNIT, unit_bytes(p), 0o644))
    journal.action('RELOAD_OWNER_UNIT_NO_START', lambda: systemctl('daemon-reload'))
    journal.action('ENABLE_OWNER_NO_NOW', lambda: systemctl('enable', UNIT))
    need(read(SYSTEM / UNIT) == unit_bytes(p) and unit_state(UNIT)['UnitFileState'] == 'enabled', 'OWNER_ENABLE_UNCONFIRMED')
    old_identity(p, d, dp, docker, web_running=False)
    return {'status': 'BOOT_OWNER_ARMED_NOT_REBOOT_TESTED', 'ownerUnit': UNIT, 'ownerPlanSha256': sha(read(root / 'owner-plan.json')),
            'state': observe(p, d, dp, stage), 'bootOrRebootTested': False, 'publicHttpsReadbackPerformed': False}


def cas_observation(p, d, dp, stage):
    v = reference(p.get('observedCAS'))
    need(v.get('format') == 'naijue-boot-observation-v1' and v.get('binding') == binding(p), 'EXACT_FRESH_OBSERVATION_REQUIRED')
    fresh(v.get('observedAtUtc'), 300)
    actual = observe(p, d, dp, stage)
    need(actual == v.get('state'), 'OBSERVED_STATE_CHANGED_NO_BLIND_RESUME')
    return actual


def disarm(p, d, dp, stage, journal):
    state = cas_observation(p, d, dp, stage)
    expected_public = reference(p['activationReceipt'])['publicContainer']['id'] if p.get('activationReceipt') else None
    need(state['publicCandidateByName'] == expected_public, 'UNBOUND_PUBLIC_CANDIDATE_REFUSE_ROLLBACK')
    root = owner_root(p)
    need(json.loads(read(root / 'snapshot.json')).get('binding') == binding(p), 'EXACT_SNAPSHOT_REQUIRED')
    if state['ownerUnit']['sha256'] is not None:
        need(read(SYSTEM / UNIT) == unit_bytes(p) and state['ownerUnit']['state']['DropInPaths'] == '', 'FOREIGN_OWNER_UNIT_REFUSED')
    marker = encode({'binding': binding(p), 'reason': 'NO_AUTOMATIC_ENTRY_REOPEN'})
    if state['ownedFiles']['DISARMED'] is None:
        journal.action('PERSIST_ENTRY_DISARM', lambda: write_new(root / 'DISARMED', marker))
    else:
        need(read(root / 'DISARMED') == marker, 'DISARM_MARKER_CHANGED')
    if state['ownerUnit']['state']['UnitFileState'] == 'enabled':
        journal.action('DISABLE_NEW_OWNER_NO_NOW', lambda: systemctl('disable', UNIT))
    if p.get('activationReceipt'):
        docker = d.Docker()
        info = candidate(p, d, dp, stage, docker, True)
        if info['State']['Running']:
            journal.action('STOP_EXACT_NEW_WEB_PRESERVE_DATA', lambda: docker.run(['stop', '--time', '15', info['Id']], 30))
        need(not docker.inspect(info['Id'])['State']['Running'], 'NEW_ENTRY_STOP_UNCONFIRMED')
        if dp.get('runtimeSelector') == 'exact26-full':
            state['fullAppStop'] = d.stop_full_app(dp, docker, journal)
    else:
        need(state['ownerUnit']['sha256'] is None, 'ACTIVATION_ID_REQUIRED_FOR_INSTALLED_OWNER')
    return state


def stop_entry(p, d, dp, stage, journal):
    need(p.get('activationReceipt'), 'EXACT_PUBLIC_CANDIDATE_REQUIRED')
    fenced(p)
    old_identity(p, d, dp, d.Docker(), exact_start=False, web_running=False)
    disarm(p, d, dp, stage, journal)
    return {'status': 'NEW_ENTRY_STOPPED_NO_HTTP_MAINTENANCE_RESPONSE', 'newDataPreserved': True,
            'oldEntryRestored': False, 'state': observe(p, d, dp, stage)}


def restore_boundary(d, dp):
    if dp.get('runtimeSelector') == 'exact26-full':
        return d.write_boundary(dp, restore_old=True)
    return d.write_boundary(dp)


def restore_legacy(p, d, dp, stage, journal):
    dp['writeBoundary'] = p.get('writeBoundary')
    if dp.get('runtimeSelector') == 'exact26-full':
        dp['writeFence'] = p.get('writeFence')
    restore_boundary(d, dp)  # Unknown is not zero, including during partial-operation recovery.
    old_identity(p, d, dp, d.Docker())
    state = disarm(p, d, dp, stage, journal)
    root = owner_root(p)
    snapshot = json.loads(read(root / 'snapshot.json'))
    need(snapshot['binding'] == binding(p), 'SNAPSHOT_BINDING_CHANGED')
    docker = d.Docker()
    for name in LEGACY:
        need(read(SYSTEM / name) == read(root / name) and sha(read(root / name)) == p['legacyUnits'][name]['sha256'],
             'ORIGINAL_UNIT_BYTES_CHANGED')
        current = state['legacyUnits'][name]
        need(current['state']['DropInPaths'] in ('', str(drop_path(name))) and
             current['state']['UnitFileState'] in ('enabled', 'disabled') and
             current['dropInSha256'] in (None, sha(drop_bytes(p))), 'UNKNOWN_PARTIAL_FENCE_STATE')
    web = docker.inspect(dp['beforeCAS']['services'][OLD[1]]['id'])
    need(web['HostConfig']['RestartPolicy'] in (NO, POLICY), 'UNKNOWN_OLD_WEB_POLICY')
    restore_boundary(d, dp)
    if web['HostConfig']['RestartPolicy'] != POLICY:
        journal.action('RESTORE_EXACT_OLD_WEB_RESTART_POLICY', lambda: docker.run(['update', '--restart=unless-stopped', web['Id']]))
    for name in LEGACY:
        restore_boundary(d, dp)
        if state['legacyUnits'][name]['state']['UnitFileState'] != p['legacyUnits'][name]['unitFileState']:
            journal.action('RESTORE_ENABLED_NO_NOW_' + name, lambda name=name: systemctl('enable', name))
        if state['legacyUnits'][name]['dropInSha256'] is not None:
            def remove_own(name=name):
                need(read(drop_path(name)) == drop_bytes(p), 'DROPIN_CHANGED_BEFORE_REMOVE')
                drop_path(name).unlink()
                sync_dir(drop_path(name).parent)
            journal.action('REMOVE_EXACT_OWN_DROPIN_' + name, remove_own)
    restore_boundary(d, dp)
    journal.action('RELOAD_RESTORED_LEGACY_DEFINITIONS_NO_START', lambda: systemctl('daemon-reload'))
    after = observe(p, d, dp, stage)
    need(all(after['legacyUnits'][n]['fileSha256'] == p['legacyUnits'][n]['sha256'] and
             after['legacyUnits'][n]['dropInSha256'] is None and after['legacyUnits'][n]['state']['DropInPaths'] == '' and
             after['legacyUnits'][n]['state']['UnitFileState'] == p['legacyUnits'][n]['unitFileState'] for n in LEGACY) and
         after['oldContainers'][OLD[1]]['restartPolicy'] == POLICY, 'LEGACY_POLICY_RESTORE_UNCONFIRMED')
    old_identity(p, d, dp, docker)
    return {'status': 'LEGACY_BOOT_POLICY_RESTORED_NO_ENTRY_START', 'state': after, 'newDataPreserved': True,
            'oldWebStartPerformed': False, 'originalUnitActiveStateRestored': False}


def boot_start(p, d, dp, stage, journal):
    root = owner_root(p)
    need(not (root / 'DISARMED').exists() and read(SYSTEM / UNIT) == unit_bytes(p) and
         unit_state(UNIT)['DropInPaths'] == '' and unit_state(UNIT)['UnitFileState'] == 'enabled', 'OWNER_NOT_ARMED')
    need(sha(read(root / 'boot-entry.py')) == p.get('ownerSourceSha256'), 'INSTALLED_HELPER_CHANGED')
    fenced(p)
    audit_live(p, boot=True)
    docker = d.Docker()
    old_identity(p, d, dp, docker, exact_start=False, web_running=False)
    need(docker.inspect(dp['beforeCAS']['services'][OLD[1]]['id'])['HostConfig']['RestartPolicy'] == NO, 'OLD_WEB_RESTART_NOT_DISABLED')
    artifacts(p, d, dp, stage)
    d.check_images_networks(dp, docker)
    for _ in range(30):
        db = docker.inspect(dp['beforeCAS']['services'][OLD[2]]['id'])
        if db['State']['Running'] and db['State'].get('Health', {}).get('Status') == 'healthy':
            break
        time.sleep(1)
    else:
        raise Refused('EXISTING_SHARED_PG_NOT_HEALTHY_NO_START_OR_RECREATE')
    app = candidate(p, d, dp, stage, docker)
    web = candidate(p, d, dp, stage, docker, True)
    need(not web['State']['Running'], 'BOOT_ENTRY_ALREADY_RUNNING_REQUIRES_OPERATOR')
    need(app['State']['Running'], 'CAPACITY_PROCESS_RESTART_REQUIRES_NEW_OWNER_STAGE')
    # A previous approved process tuple/window never authorizes another start.
    runtime = d.json_file(dp['runtimeConfiguration']['path'], private=True)
    d.capacity_runtime_configuration(dp, runtime)
    need(d.capacity_process_tuple(dp, docker, app['Id'], phase='node') == runtime['capacityLaunch']['process'], 'CAPACITY_BOOT_PROCESS_CHANGED')
    d.health(dp, docker, app['Id'])
    fenced(p)
    old_identity(p, d, dp, docker, exact_start=False, web_running=False)
    need(not (root / 'DISARMED').exists(), 'DISARMED_DURING_START')
    candidate(p, d, dp, stage, docker, True)
    try:
        journal.action('START_EXACT_CANDIDATE_WEB', lambda: docker.run(['start', web['Id']]))
        d.health(dp, docker, app['Id'], dp['names']['publicWeb'])
    except Exception:
        # Read the exact outcome before one safe stop; never repeat a timed-out start.
        try:
            actual = candidate(p, d, dp, stage, docker, True)
            if actual['State']['Running']:
                journal.action('FAILED_BOOT_STOP_EXACT_NEW_WEB', lambda: docker.run(['stop', '--time', '15', actual['Id']], 30))
            need(not docker.inspect(actual['Id'])['State']['Running'], 'FAILED_BOOT_STOP_UNCONFIRMED')
        except Exception:
            journal.data['requiresEntryInspection'] = True
            journal.save()
        raise
    return {'status': 'SYSTEMD_ENTRY_STARTED_INTERNAL_IDENTITY_ONLY', 'bootOrRebootTested': False,
            'publicHttpsReadbackPerformed': False, 'newDataPreserved': True}


def host(p, phase, plan_path):
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server' and
         not os.environ.get('DOCKER_HOST') and not os.environ.get('DOCKER_CONTEXT'), 'EXACT_LOCAL_SERVER_REQUIRED')
    if phase == 'boot-start':
        invocation = os.environ.get('INVOCATION_ID', '')
        need(re.fullmatch(r'[a-f0-9]{32}', invocation) and
             any(line.rsplit(':', 1)[-1].strip() == '/system.slice/' + UNIT for line in Path('/proc/self/cgroup').read_text().splitlines()) and
             Path(plan_path) == owner_root(p) / 'owner-plan.json' and Path(__file__).absolute() == owner_root(p) / 'boot-entry.py',
             'INSTALLED_SYSTEMD_OWNER_ONLY')
        p['operationId'] = 'boot-' + invocation
        return None
    need(os.environ.get('ERP_SHARED_TASK_ID') == 'T45', 'EXISTING_T45_DISPATCHER_REQUIRED')
    job = safe(os.environ.get('ERP_SHARED_JOB_DIR'), directory=True)
    need(re.fullmatch(r'/root/erp-release-20261006-01-worker/grant-[a-f0-9]{16}/jobs/[A-Za-z0-9_-]+', str(job)) and
         job.name == p['operationId'] and Path(plan_path).is_relative_to(job / 'bundle'), 'EXACT_T45_JOB_AND_PLAN_REQUIRED')
    return job


def execute(p, d, dp, stage, phase, plan_path):
    job = host(p, phase, plan_path)
    safe(ROOT, directory=True)
    lock_path = Path('/run/naijue-erp-hdd-test.lock')
    safe(lock_path, exists=False)
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if phase == 'inspect':
            value = {'format': 'naijue-boot-observation-v1', 'binding': binding(p), 'observedAtUtc': now(),
                     'state': observe(p, d, dp, stage), 'mutationsPerformed': False}
            write_new(job / 'results/boot-observation.json', encode(value))
            return value
        mkdir_if_missing(ROOT / 'boot-entry')
        mkdir_if_missing(ROOT / 'operations')
        journal = Journal(p, phase, ROOT / 'operations')
        try:
            result = globals()[phase.replace('-', '_')](p, d, dp, stage, journal)
            value = journal.finish(result.pop('status'), **result, requiresOperator=False)
        except Exception as error:
            code = str(error) if isinstance(error, (Refused, d.Refused)) else type(error).__name__
            value = journal.finish('FAILED_PRESERVED_NO_REPLAY', failureCode=code, requiresOperator=True,
                                   automaticRollbackAttempted=False, newDataPreserved=True)
            if job:
                write_new(job / 'results/boot-entry.json', encode(value))
            raise Refused(code) from None
        if job:
            write_new(job / 'results/boot-entry.json', encode(value))
        return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', required=True, choices=['fence', 'arm', 'inspect', 'stop-entry', 'restore-legacy', 'boot-start'])
    parser.add_argument('--plan', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    p, d, dp, stage = load_plan(args.plan)
    if p.get('originalReferences'):
        need(args.phase == 'boot-start', 'INSTALLED_PLAN_ONLY_FOR_SYSTEMD')
        relocated = {k: p[k] for k in p['originalReferences']}
        p.update(p['originalReferences'])
        need(binding(p) == p.get('originalBinding'), 'RELOCATED_OWNER_BINDING_CHANGED')
        # Modules/base plan are already loaded from the installed, checked copies.
        p['installedReferences'] = relocated
    if not args.execute:
        print(json.dumps({'status': 'PLAN_ONLY_NOT_EXECUTED', 'phase': args.phase, 'binding': binding(p),
                          'buildId': dp['buildId'], 'sourceCommit': dp['sourceCommit'], 'ownerUnit': UNIT,
                          'oldAppOrDbStopAllowed': False, 'automaticRollback': False, 'deploymentIntegration': 'NOT_INTEGRATED',
                          'bootOrRebootTested': False}))
        return
    result = execute(p, d, dp, stage, args.phase, args.plan)
    print(json.dumps({k: result.get(k) for k in ('status', 'binding', 'finishedAtUtc', 'requiresOperator')}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(str(e) if isinstance(e, Refused) else 'BOOT_ENTRY_FAILED_OR_UNKNOWN_NO_REPLAY', file=sys.stderr)
        raise SystemExit(2)
