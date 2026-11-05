"""Read-only bounded boot/runtime and non-credential account identity metadata."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess

J = Path(os.environ['ERP_SHARED_JOB_DIR'])
P = json.loads((J / 'bundle/PLAN.json').read_text())
O = J / 'results'
V = {'format': 'R1_BOOT_AND_ACCOUNT_IDENTITY_METADATA_V1', 'jobId': P['jobId'],
     'status': 'STARTED', 'databaseWrites': False, 'serviceChanges': False,
     'credentialValuesExported': False}

def need(value, code):
    if not value:
        raise ValueError(code)

def run(args, limit=2 * 1024 * 1024):
    result = subprocess.run(args, capture_output=True, timeout=30)
    need(len(result.stdout) <= limit, 'BOUNDED_METADATA_OUTPUT')
    return result.returncode, result.stdout.decode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def file_metadata(name):
    p = Path(name)
    if not p.is_file() or p.is_symlink():
        return {'path': name, 'regularFile': False}
    data = p.read_bytes()
    need(len(data) <= 2 * 1024 * 1024, 'BOUNDED_UNIT_HELPER')
    return {'path': name, 'regularFile': True, 'bytes': len(data), 'sha256': digest(data)}

def main():
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server'
         and J.name == P['jobId'], 'EXACT_METADATA_SCOPE')
    capture = Path(P['accountCaptureReference'])
    need(str(capture) == '/srv/naijue-erp/rapid-launch-20261022/private/account-capture-20261022-11/old-accounts.json'
         and not capture.is_symlink(), 'EXACT_PRIVATE_CAPTURE_REFERENCE')
    raw = capture.read_bytes()
    need(digest(raw) == P['accountCaptureSha256'], 'EXACT_CAPTURE_HASH')
    accounts = json.loads(raw)['rows']
    need(len(accounts) == 49, 'EXACT_ACCOUNT_COUNT')
    permitted = ['sourceAccountId', 'sourceAccountVersion', 'sourceRole', 'sourceHallId',
                 'sourceStoreId', 'sourceLoginEnabled', 'sourceEmploymentStatus', 'sourceEnabled',
                 'sourceEmployeeNativeId', 'sourceEmployeeCode', 'oldSourceBatchId']
    safe_rows = []
    for row in accounts:
        safe = {key: row.get(key) for key in permitted}
        payload = row.get('sourceEmployeePayload')
        safe['sourceEmployeePayloadKeys'] = sorted(payload) if isinstance(payload, dict) else []
        facts = row.get('sourceFacts')
        safe['sourceFactsKeys'] = sorted(facts) if isinstance(facts, dict) else []
        safe_rows.append(safe)
    (O / 'account-identity-metadata.json').write_text(json.dumps({
        'format': 'SAFE_ACCOUNT_IDENTITY_METADATA_V1', 'sourceCaptureSha256': digest(raw),
        'rows': safe_rows, 'containsCredentials': False, 'containsLoginNames': False}, indent=2) + '\n')
    units = []
    safe_properties = ['Id', 'LoadState', 'ActiveState', 'SubState', 'UnitFileState',
                       'FragmentPath', 'DropInPaths', 'Type', 'Restart', 'RemainAfterExit',
                       'After', 'Before', 'Requires', 'Wants', 'Conflicts', 'WantedBy']
    for name in ['naijue-prod.service', 'naijue-t48-prod-runtime.service', 'docker.service']:
        code, text = run(['systemctl', 'show', name, '--no-pager',
                          '--property=' + ','.join(safe_properties)])
        facts = dict(line.split('=', 1) for line in text.splitlines() if '=' in line)
        item = {'name': name, 'showExitCode': code, 'properties': facts, 'files': [], 'actions': {}}
        for path in [facts.get('FragmentPath', ''), *facts.get('DropInPaths', '').split()]:
            if path:
                item['files'].append(file_metadata(path))
        for prop in ['ExecStartPre', 'ExecStart', 'ExecStartPost', 'ExecStop', 'ExecStopPost']:
            _, action = run(['systemctl', 'show', name, '--no-pager', '--property=' + prop])
            # Never emit argv or shell text: either may contain private configuration.
            executable = re.findall(r'path=([^ ;}]+)', action)
            referenced_helpers = sorted(set(re.findall(r'/(?:usr/local|srv/naijue-erp|home/naijue)/[^\s;{}"\']+\.(?:sh|py)', action)))
            item['actions'][prop] = {'rawActionSha256': digest(action.encode()),
                                     'executables': executable,
                                     'helperFiles': [file_metadata(p) for p in referenced_helpers]}
        units.append(item)
    code, names = run(['systemctl', 'list-unit-files', 'naijue*.service', 'naijue*.timer', '--no-legend', '--no-pager'])
    discovered = []
    for line in names.splitlines():
        parts = line.split()
        if len(parts) >= 2 and re.fullmatch(r'naijue[\w.\-]+\.(service|timer)', parts[0]):
            discovered.append({'unit': parts[0], 'state': parts[1]})
    _, text = run(['docker', 'inspect', 'naijue-prod-app-1', 'naijue-prod-web-1', 'naijue-prod-db-1'])
    containers = []
    for row in json.loads(text):
        containers.append({'id': row['Id'], 'name': row['Name'], 'startedAt': row['State']['StartedAt'],
                           'status': row['State']['Status'], 'restartCount': row['RestartCount'],
                           'restartPolicy': row['HostConfig']['RestartPolicy'], 'autoRemove': row['HostConfig']['AutoRemove'],
                           'ports': row['NetworkSettings']['Ports'] if row['Name'] == '/naijue-prod-web-1' else 'not-repeated'})
    _, text = run(['docker', 'network', 'inspect', 'naijue-prod-data', 'naijue-prod-front', 'naijue-prod-ingress'])
    networks = [{key: row[key] for key in ['Name', 'Id', 'Driver', 'Internal', 'Scope']} for row in json.loads(text)]
    code, live = run(['docker', 'info', '--format', '{{json .LiveRestoreEnabled}}'])
    need(code == 0 and live.strip() in ['true', 'false'], 'LIVE_RESTORE_BOOLEAN')
    V.update(status='PASS_READONLY_METADATA_COLLECTED', units=units, discoveredUnits=discovered,
             containers=containers, networks=networks, dockerLiveRestoreEnabled=json.loads(live),
             accountMetadataRows=len(safe_rows), accountMetadataReference='account-identity-metadata.json',
             remaining='Boot helper semantics and minimum persistent entry ownership change; actual account mapping/import/authentication still pending.')

try:
    main()
except Exception as error:
    V.update(status='FAILED_READONLY_METADATA', failureCode=str(error) if isinstance(error, ValueError) else type(error).__name__)
finally:
    V['finishedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (O / 'boot-runtime-metadata.json').write_text(json.dumps(V, indent=2) + '\n')
raise SystemExit(0 if V['status'].startswith('PASS') else 2)
