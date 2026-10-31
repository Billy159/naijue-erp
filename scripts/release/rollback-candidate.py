#!/usr/bin/env python3
"""Restore only the previously captured entry before new business writes, or stop the new entry.

No source/DB/receipt deletion, SQL, database restore, downgrade or accounting replay.
The shared implementation is imported from the same versioned deploy script; no helper deployment is needed.
"""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import types

DEPLOYMENT_FULL_SHA256 = 'a7655f237631015c07c72cfdfce2d597d45da341cb156c588e74c9f28872ead3'
# Same independently reviewed capacity helper registered by boot-entry; not a live deployment approval.
DEPLOYMENT_CAPACITY_SHA256 = '4620ca2f1672e18991644a2da5398633eae19d75cb60057245590ebe2e3f8b25'
C = None


def deployment_implementation(selector, *, capacity=False):
    if not isinstance(selector, str) or selector not in ('schema19', 'exact26-r1', 'exact26-full'):
        raise ValueError('UNKNOWN_RUNTIME_SELECTOR')
    if type(capacity) is not bool:
        raise ValueError('EXPLICIT_CAPACITY_SELECTION_REQUIRED')
    path = Path(__file__).with_name('deploy-candidate.py')
    source = path.read_bytes()
    if capacity and hashlib.sha256(source).hexdigest() != DEPLOYMENT_CAPACITY_SHA256:
        raise ValueError('CAPACITY_REVIEWED_DEPLOYMENT_HELPER_REQUIRED')
    if not capacity and selector == 'exact26-full' and hashlib.sha256(source).hexdigest() != DEPLOYMENT_FULL_SHA256:
        raise ValueError('FULL_REVIEWED_DEPLOYMENT_HELPER_REQUIRED')
    module = types.ModuleType('naijue_candidate_deployment')
    module.__file__ = str(path)
    exec(compile(source, str(path), 'exec'), module.__dict__)
    return module


def rollback(p, mode, implementation=None):
    C = implementation or deployment_implementation(p.get('runtimeSelector', 'schema19'), capacity='capacityHost' in p)
    job = C.exact_host(p)
    with open('/run/naijue-erp-hdd-test.lock', 'a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        journal = C.Journal(p, 'rollback-' + mode)
        docker = C.Docker()
        try:
            activation = C.reference(p.get('activationReceipt'))
            C.need(activation.get('status') == 'ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK' and
                   activation.get('buildId') == p['buildId'] and activation.get('sourceCommit') == p['sourceCommit'] and
                   activation.get('archiveSha256') == p['archive']['sha256'] and activation.get('database') == C.DATABASE and
                   activation.get('oldWebId') == p['beforeCAS']['services'][C.OLD_NAMES[1]]['id'], 'EXACT_ACTIVATION_RECEIPT_REQUIRED')
            C.check_old(p, docker, web_running=False)
            public = activation['publicContainer']
            info = docker.inspect(public['id'])
            C.assert_own(info, p, 'web', True)
            stopped_full_entry = C.exact26_full(p) and mode == 'stop-entry' and info['State']['Running'] is False
            C.need(C.own_container_fingerprint(info) == public['specSha256'] and
                   (info['State']['Running'] is True or stopped_full_entry), 'ACTIVE_CANDIDATE_ENTRY_CHANGED')
            # Only restore-old-entry needs a still-closed write boundary. stop-entry is allowed after writes and retains both DBs.
            if mode == 'restore-old-entry':
                C.write_boundary(p, restore_old=True, docker=docker)
            if not stopped_full_entry:
                journal.event('STOP_EXACT_NEW_WEB_INTENT', containerId=public['id'])
                docker.run(['stop', '--time', '20', public['id']], 40)
            C.need(not docker.inspect(public['id'])['State']['Running'], 'NEW_ENTRY_STOP_UNCONFIRMED')
            full_app_stop = None
            if mode == 'restore-old-entry':
                restored = C.restore_old_entry(p, docker, journal)
                status = 'OLD_ENTRY_RESTORED_PRE_BUSINESS_WRITES_NO_DATABASE_RESTORE'
            else:
                if C.exact26_full(p):
                    full_app_stop = C.stop_full_app(p, docker, journal)
                C.check_old(p, docker, web_running=False)
                restored = None
                status = 'NEW_ENTRY_STOPPED_NO_HTTP_MAINTENANCE_RESPONSE'
            value = {'format': 'naijue-entry-rollback-v1', 'status': status, 'mode': mode, 'buildId': p['buildId'],
                     'sourceCommit': p['sourceCommit'], 'archiveSha256': p['archive']['sha256'], 'oldWeb': restored,
                     'newWebId': public['id'], 'fullAppStop': full_app_stop, 'database': C.DATABASE, 'newDatabaseAndReceiptsPreserved': True,
                     'oldAppAndDatabaseUnchanged': True, 'databaseRestoredOrDowngraded': False,
                     'publicHttpsReadbackPerformed': False, 'finishedAtUtc': C.now()}
            journal.finish(status, dockerCommands=docker.commands)
            C.new_json(job / 'results' / 'candidate-rollback.json', value)
            return value
        except Exception as error:
            # Never start either entry by guessing after an unknown stop/start outcome.
            code = str(error) if isinstance(error, C.Refused) else type(error).__name__
            value = journal.finish('ROLLBACK_FAILED_PRESERVED_REQUIRES_C_OPERATOR', failureCode=code,
                                   newDatabaseAndReceiptsPreserved=True, databaseRestoredOrDowngraded=False, dockerCommands=docker.commands)
            C.new_json(job / 'results' / 'candidate-rollback.json', value)
            raise C.Refused(code) from None


def main():
    global C
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', required=True)
    parser.add_argument('--mode', choices=['restore-old-entry', 'stop-entry'], required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    raw = Path(args.plan).read_bytes()
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('BOUNDED_DEPLOYMENT_PLAN_REQUIRED')
    preliminary = json.loads(raw)
    if not isinstance(preliminary, dict):
        raise ValueError('EXPLICIT_DEPLOYMENT_PLAN_REQUIRED')
    selector = preliminary.get('runtimeSelector', 'schema19')
    capacity = 'capacityHost' in preliminary
    C = deployment_implementation(selector, capacity=capacity)
    p = C.read_plan(args.plan)
    C.need(p.get('runtimeSelector', 'schema19') == selector and ('capacityHost' in p) == capacity, 'RUNTIME_SELECTION_CHANGED')
    if not args.execute:
        C.reference(p.get('activationReceipt'))
        print(json.dumps({'status': 'PLAN_ONLY_NOT_EXECUTED', 'mode': args.mode, 'buildId': p['buildId'],
                          'database': C.DATABASE, 'databaseRestoreAllowed': False,
                          'oldEntryRequiresZeroNewBusinessWritesAndClosedAdmission': True, 'deploymentExecuted': False}))
    else:
        value = rollback(p, args.mode, C)
        print(json.dumps({key: value.get(key) for key in ['status', 'mode', 'buildId', 'sourceCommit', 'finishedAtUtc']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if C is not None and isinstance(error, C.Refused) else 'ENTRY_ROLLBACK_FAILED_NO_REPLAY', file=__import__('sys').stderr)
        raise SystemExit(2)
