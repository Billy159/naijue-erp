#!/usr/bin/env python3
"""Restore only the previously captured entry before new business writes, or stop the new entry.

No source/DB/receipt deletion, SQL, database restore, downgrade or accounting replay.
The shared implementation is imported from the same versioned deploy script; no helper deployment is needed.
"""
import argparse
import fcntl
import importlib.util
import json
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('naijue_candidate_deployment', Path(__file__).with_name('deploy-candidate.py'))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


def rollback(p, mode):
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
            C.need(C.own_container_fingerprint(info) == public['specSha256'] and info['State']['Running'], 'ACTIVE_CANDIDATE_ENTRY_CHANGED')
            # Only restore-old-entry needs a still-closed write boundary. stop-entry is allowed after writes and retains both DBs.
            if mode == 'restore-old-entry':
                C.write_boundary(p)
            journal.event('STOP_EXACT_NEW_WEB_INTENT', containerId=public['id'])
            docker.run(['stop', '--time', '20', public['id']], 40)
            C.need(not docker.inspect(public['id'])['State']['Running'], 'NEW_ENTRY_STOP_UNCONFIRMED')
            if mode == 'restore-old-entry':
                restored = C.restore_old_entry(p, docker, journal)
                status = 'OLD_ENTRY_RESTORED_PRE_BUSINESS_WRITES_NO_DATABASE_RESTORE'
            else:
                C.check_old(p, docker, web_running=False)
                restored = None
                status = 'NEW_ENTRY_STOPPED_NO_HTTP_MAINTENANCE_RESPONSE'
            value = {'format': 'naijue-entry-rollback-v1', 'status': status, 'mode': mode, 'buildId': p['buildId'],
                     'sourceCommit': p['sourceCommit'], 'archiveSha256': p['archive']['sha256'], 'oldWeb': restored,
                     'newWebId': public['id'], 'database': C.DATABASE, 'newDatabaseAndReceiptsPreserved': True,
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
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', required=True)
    parser.add_argument('--mode', choices=['restore-old-entry', 'stop-entry'], required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    p = C.read_plan(args.plan)
    if not args.execute:
        C.reference(p.get('activationReceipt'))
        print(json.dumps({'status': 'PLAN_ONLY_NOT_EXECUTED', 'mode': args.mode, 'buildId': p['buildId'],
                          'database': C.DATABASE, 'databaseRestoreAllowed': False,
                          'oldEntryRequiresZeroNewBusinessWritesAndClosedAdmission': True, 'deploymentExecuted': False}))
    else:
        value = rollback(p, args.mode)
        print(json.dumps({key: value.get(key) for key in ['status', 'mode', 'buildId', 'sourceCommit', 'finishedAtUtc']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, C.Refused) else 'ENTRY_ROLLBACK_FAILED_NO_REPLAY', file=__import__('sys').stderr)
        raise SystemExit(2)
