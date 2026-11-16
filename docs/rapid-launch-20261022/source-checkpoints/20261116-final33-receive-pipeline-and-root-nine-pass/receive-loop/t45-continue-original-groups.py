"""Finite local scheduling only: consume Main's issued original groups 8..54."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
REV = HERE.parent
PROJECT = REV.parents[3]
MAIN = PROJECT / 'outputs/主控'
BASE = REV / 'INPUT-RECEPTION-01/CACHED-03'
LAUNCH = REV / 'STATIC-RECOVERY-01/run_cached03_at_approved_start.py'
INDEX = MAIN / '20261115-r3-direct-service24-issuer-local-01/FINAL33-INPUT-CONTINUITY-01/GROUPS.json'
MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def need(ok, code):
    if not ok:
        raise ValueError(code)

def emit(state, **values):
    event = dict(state=state, checkedAtMs=time.time_ns() // 1000000, **values)
    raw = json.dumps(event, sort_keys=True) + '\n'
    with (HERE / 'events.jsonl').open('a') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    print(raw, end='', flush=True)

def wait_file(path):
    while not path.exists() or not path.read_bytes().endswith(b'\n'):
        need(time.time_ns() // 1000000 < 1794906551251, 'ORIGINAL_TOTAL_RECEPTION_POLICY_END_NO_NEW_ACTION')
        time.sleep(1)
    return path.read_bytes()

def closed(digest, rows):
    path = BASE / ('execution-' + digest[:24]) / 'RESULT.json'
    raw = wait_file(path)
    result = json.loads(raw)
    need(result.get('stop') is None and result.get('finalPolicyAbsent') is True and result.get('finalPolicy') == {'state': 'ENOENT'}, 'PRIOR_WINDOW_NOT_CLOSED_NO_NEXT_ACTION')
    for phase in ('installed', 'restored'):
        value = result.get(phase) or {}
        need(value.get('status') == 'COMPLETED' and value.get('exitCode') == 0, 'PRIOR_CONTROL_TERMINAL_NOT_COMPLETED_NO_REPLAY')
        action = 'install' if phase == 'installed' else 'restore'
        need(value.get('jobId') == 't45-r3-final33-stage-' + action + '-20261116-' + digest[:24], 'PRIOR_CONTROL_KEY_DIFFERS')
    keys = [row['artifactKey'] for row in rows]
    need(set(result.get('originalKeys', {})) == set(keys) and set(result.get('completedBeforeWithdrawal', [])) == set(keys), 'PRIOR_GROUP_KEYS_DIFFERS')
    for row in rows:
        value = result['originalKeys'][row['artifactKey']]
        receipt = value.get('receipt') or {}
        need(value.get('status') == 'READY' and value.get('basis') == 'EXACT_WITHDRAWN_BATCH_READONLY' and value.get('recoveryAuthoritySha256') == digest, 'PRIOR_ORIGINAL_READY_UNKNOWN_NO_REPLAY')
        need(value.get('bytes') == row['archiveBytes'] and value.get('prefixSha256') == row['archiveSha256'], 'PRIOR_ORIGINAL_BYTES_OR_SHA_DIFFERS')
        need(receipt.get('status') == 'READY' and receipt.get('manifestSha256') == MANIFEST and all(receipt.get(k) == row[k] for k in ('artifactKey', 'archiveBytes', 'archiveSha256', 'fragmentIndex', 'fragmentOffset')), 'PRIOR_ORIGINAL_RECEIPT_DIFFERS')
        need(receipt.get('fileIdentity') == value.get('fileIdentity') and (value.get('ready') or {}).get('authoritySha256') == receipt.get('authoritySha256'), 'PRIOR_ORIGINAL_READY_IDENTITY_DIFFERS')
    return str(path), sha(raw)

def main():
    os.umask(0o077)
    need(sha(INDEX.read_bytes()) == '4f6ffdc821ea5a12a7142897b508d3496e93f3b4c6ec356295326ef578fa0cf2', 'ORIGINAL_54_GROUP_INDEX_DIFFERS')
    groups = json.loads(INDEX.read_bytes())
    need(len(groups) == 54 and [x['number'] for x in groups] == list(range(1, 55)), 'ORIGINAL_GROUP_SEQUENCE_DIFFERS')
    need(sha((BASE / 'PINS.json').read_bytes()) == '87fa9d9522b6566c4edcb0135177fdf97785f3433eca3e3a035098684c21f652', 'FROZEN_CACHED03_PINS_DIFFERS')
    pins = json.loads((BASE / 'PINS.json').read_bytes())
    with (HERE / 'LOOP-ONCE.json').open('x') as stream:
        json.dump(dict(startGroup=8, endGroup=54, entrySha256=sha(Path(__file__).read_bytes()), serverExecutor='ORIGINAL_E276_LAUNCHER_ONLY', PGOperations=0), stream)
    emit('READY_LOCAL_FINITE_WAIT_GROUP7_CLOSE_THEN_8_TO_54', sourceSha256=sha(Path(__file__).read_bytes()))
    previous = 'ea37c51b148c471adb10737f98886bd10d8b11d9939c07c94acd45f906f3432a'
    for index in range(7, 54):
        prior = groups[index - 1]
        prior_rows = json.loads((Path(prior['directory']) / 'batch-manifest.json').read_bytes())
        result_path, result_sha = closed(previous, prior_rows)
        emit('PRIOR_GROUP_CLOSED_WAITING_MAIN_ISSUED_NEXT', completedGroup=prior['number'], resultPath=result_path, resultSha256=result_sha, nextGroup=index + 1)
        group = groups[index]
        name = Path(group['directory']).name.split('-', 1)[1]
        directory = MAIN / ('20261116-r3-final33-input-' + name + '-cached03-window-01')
        issued = json.loads(wait_file(directory / 'ISSUED.json'))
        need(issued.get('state') == 'FINITE_INPUT_RECEIVE_GROUP_ISSUED' and issued.get('artifactKeys') == group['artifactKeys'], 'EXACT_MAIN_ISSUED_GROUP_REQUIRED')
        need(issued['batchManifestSha256'] == group['batchManifestSha256'], 'EXACT_MAIN_MANIFEST_DIFFERS')
        auth_path, manifest_path = directory / 'stage-authorization.json', directory / 'batch-manifest.json'
        need(issued['authorizationPath'] == str(auth_path) and issued['batchManifestPath'] == str(manifest_path), 'EXACT_MAIN_ISSUED_PATH_DIFFERS')
        previous = issued['authorizationSha256']
        need(sha(auth_path.read_bytes()) == previous and sha(manifest_path.read_bytes()) == group['batchManifestSha256'], 'EXACT_MAIN_ISSUED_BYTES_DIFFERS')
        need(not (BASE / ('launch-' + previous + '.json')).exists() and not (BASE / ('execution-' + previous[:24])).exists(), 'LOCAL_ACTION_ALREADY_RECORDED_NO_REPLAY')
        need(sha(LAUNCH.read_bytes()) == pins['launcherSha256'], 'E276_LAUNCHER_DIFFERS')
        for leaf, pin in pins['codeSha256'].items():
            need(sha((BASE / leaf).read_bytes()) == pin, 'FROZEN_CACHED03_LEAF_DIFFERS')
        emit('INVOKING_ORIGINAL_E276_ONCE', group=group['number'], authoritySha256=previous, startsAt=issued['startsAt'], expiresAt=issued['expiresAt'])
        with (HERE / ('group-' + str(group['number']).zfill(2) + '.log')).open('x') as log:
            child = subprocess.run([sys.executable, '-u', str(LAUNCH), '--authorization', str(auth_path), '--manifest', str(manifest_path), '--sha256', previous], stdout=log, stderr=log, check=False)
        need(child.returncode == 0, 'ORIGINAL_CHILD_STOPPED_OR_UNKNOWN_QUERY_ORIGINAL_KEY_ONLY')
    path, pin = closed(previous, json.loads((Path(groups[-1]['directory']) / 'batch-manifest.json').read_bytes()))
    emit('ALL_ORIGINAL_54_GROUPS_CLOSED_NO_PG_OR_MATERIALIZATION', completedFragments=211, lastResultPath=path, lastResultSha256=pin)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) else type(error).__name__
        emit('STOP_LOCAL_ONLY_NO_REPLAY', code=code)
        raise SystemExit(2)
