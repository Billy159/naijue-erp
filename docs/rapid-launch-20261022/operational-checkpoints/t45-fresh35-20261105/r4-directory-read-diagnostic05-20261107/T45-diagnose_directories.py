"""Fixed temporary C-bound directory probe. No PG, SQL, secrets, or import CLI."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time
import types

sys.dont_write_bytecode = True
KEY = 't45-r4-real-inspect-20261107-01'
CID = '5d8eb16163d22593513a01ad3d7ddb600fd2fce482e9a98886aade33d2b3fb06'
PINS = {
    'fresh35-production-carrier.py': '79c169a03391223ee7154fac89e83db2b27d9783a63f0ceffeff518b6d52b8fd',
    'directory_open_close.mjs': '4f62342a5bde0ccd823a6be60adb6ea34e604c21339b3dcf1282e5b1904c127e',
    'run_probe_inside.py': 'dfc5ab4ed2d94ad1399e047868a613904b34663e130e2db6aee42513c7138d96',
    'nonroot_input_access.py': '29a2144ec56ba56b6ec1451381de63e07b0bc5fec4a968bbd8c76985c8fde610',
    'real_access_consumer.py': '680a360bcda7c9db1f80e7757a3160ec57a43dd14abb25fc9a0ad72a52843dd2',
    'directory-probe-plan.UNISSUED.json': '308b34854fd4910f813b8420190e576b5ed7a772daf679112e6f026edbbe5f32',
}
PREDECESSOR_SHA = '9c49bb30110942a1e1f79d756c0357a0e71048e061166e70452a6e0477f2b7b6'


def need(value, code):
    if not value:
        raise ValueError(code)


def main():
    job = Path(os.environ['ERP_SHARED_JOB_DIR'])
    need(os.getuid() == 0 and os.environ['ERP_SHARED_TASK_ID'] == 'T45' and job.name == KEY, 'ORIGINAL_T45_NEW_KEY_REQUIRED')
    need(len(sys.argv) == 2 and re.fullmatch('[a-f0-9]{64}', sys.argv[1]), 'EXACT_EXTERNAL_C_SCOPE_SHA_REQUIRED')
    bundle = job/'bundle'
    sources = {}
    for name, digest in PINS.items():
        path = bundle/name
        need(path.is_file() and not path.is_symlink(), 'FIXED_REGULAR_SOURCE_REQUIRED')
        raw = path.read_bytes()
        need(hashlib.sha256(raw).hexdigest() == digest, 'FIXED_SOURCE_DIFFERS')
        sources[name] = raw
    path = bundle/'fresh35-production-carrier.py'
    spec = importlib.util.spec_from_file_location('original_fixed_directory_metadata_ops', path)
    ops = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ops)
    need(job.parent == ops.PRIVATE, 'ORIGINAL_PRIVATE_JOB_REQUIRED')
    scope_raw = ops.read_file(bundle/'DIRECTORY-DIAGNOSTIC.json', 65536, True)
    need(ops.sha(scope_raw) == sys.argv[1], 'EXACT_EXTERNAL_C_BYTES_REQUIRED')
    scope = ops.strict(scope_raw)
    need(set(scope) == {'format','requestKey','decision','startsAt','expiresAt','accessPlanSha256','expectedPreviousPointerSha256','sourcePins'} and
         scope['format'] == 'T45_FIXED_OFFLINE_DIRECTORY_DIAGNOSTIC_V1' and scope['requestKey'] == KEY and
         scope['decision'] == 'COMPARE_OPENDIR_BEFORE_AFTER_AND_RESTORE', 'FIXED_C_SCOPE_REQUIRED')
    expected_pins = {**PINS, 'diagnose_directories.py': ops.sha(Path(__file__).read_bytes())}
    need(scope['sourcePins'] == expected_pins and scope['accessPlanSha256'] == PINS['directory-probe-plan.UNISSUED.json'] and
         scope['expectedPreviousPointerSha256'] == PREDECESSOR_SHA, 'EXACT_C_SOURCE_PLAN_AND_PREDECESSOR_REQUIRED')
    now = int(time.time()*1000)
    need(type(scope['startsAt']) is int and type(scope['expiresAt']) is int and
         scope['startsAt'] <= now and now+30000 < scope['expiresAt'] <= scope['startsAt']+180000, 'FINITE_NEW_DIAGNOSTIC_WINDOW_REQUIRED')
    info = ops.production_info(CID)
    need(info['id'] == CID and info['running'] and info['image'] == ops.ENV_IMAGE and
         info['startedAt'] == '2026-11-07T00:46:03.066896045Z' and not info['ports'], 'EXACT_RETAINED_CONTAINER_REQUIRED')
    modules = []
    for filename in ['nonroot_input_access.py', 'real_access_consumer.py']:
        module = types.ModuleType(filename)
        module.__file__ = str(bundle/filename)
        exec(compile(sources[filename], module.__file__, 'exec'), module.__dict__)
        modules.append(module)
    access, consumer = modules
    need(ops.sha(consumer.pointer_bytes(access.REAL, ops.read_file)) == PREDECESSOR_SHA, 'ACTUAL_PREDECESSOR_CHANGED')
    plan_raw = sources['directory-probe-plan.UNISSUED.json']
    plan = ops.strict(plan_raw)
    need(len(plan['observations']) == 45 and len(plan['changes']) == 3 and 'smallProjections' not in plan, 'NO_SECRET_NARROW_PLAN_REQUIRED')
    ledger = access.REAL/'nonroot-access'/KEY
    need(not ledger.exists(), 'DIAGNOSTIC_KEY_ALREADY_EXISTS_NO_REPLAY')
    active_deadline = time.monotonic()+30
    stages = []
    last_callback_finished = [None]

    def probe(stage):
        need(stage in ['before', 'after'] and time.monotonic()+12 < active_deadline and
             int(time.time()*1000)+12000 < scope['expiresAt'], 'NO_NEW_PROBE_OUTSIDE_FIXED_BUDGET')
        phase = '0710' if stage == 'before' else '0750'
        packet = {'phase': phase, 'scopeRaw': scope_raw.decode(), 'scopeSha256': sys.argv[1],
                  'nodeSource': sources['directory_open_close.mjs'].decode()}
        receipt_path = ledger/('probe-'+phase+'-result.json')
        returned = None
        try:
            returned = ops.strict(ops.run(['docker','exec','-i','--user','0:0',CID,'/usr/bin/python3','-I','-S','-c',
                                          sources['run_probe_inside.py'].decode()],
                                         data=(json.dumps(packet)+'\n').encode(), seconds=12))
        except Exception:
            # Never retry a child. A durable receipt from its original owner is
            # the only recovery source if the transport response was lost.
            pass
        if not receipt_path.is_file():
            return {'uid': None, 'gid': None, 'supplementaryGroups': [], 'childReaped': False, 'checks': []}
        receipt = ops.strict(ops.read_file(receipt_path, 16384, True))
        need(receipt['phase'] == phase and receipt['scopeSha256'] == sys.argv[1] and
             receipt['nodeSourceSha256'] == PINS['directory_open_close.mjs'], 'ORIGINAL_PHASE_RECEIPT_DIFFERS')
        if returned is not None:
            need(returned == receipt, 'TRANSPORT_AND_DURABLE_PHASE_RECEIPT_DIFFER')
        ops.new_json(job/'results'/('directory-stage-'+stage+'.json'), receipt)
        stages.append(receipt)
        observed = receipt.get('observation') or {}
        identity = observed.get('identity') or {}
        observations = observed.get('observations') or []
        checks = []
        for slot, technical_file in [('PACKAGE_ROOT','package-root'), ('TABLES_DIRECTORY','tables')]:
            found = [value for value in observations if value.get('slot') == slot]
            if len(found) == 1:
                value = found[0]
                checks.append({'technicalFile': technical_file,
                               'ok': value.get('opened') is True and value.get('closed') is True and value.get('code') == 'OK',
                               'errno': None if value.get('code') == 'OK' else value.get('code')})
        last_callback_finished[0] = time.monotonic()
        return {'uid': identity.get('uid'), 'gid': identity.get('gid'),
                'supplementaryGroups': [value for value in identity.get('groups', []) if value != identity.get('gid')],
                'childReaped': receipt.get('childReaped') is True, 'checks': checks}

    try:
        result = access.probe_directory_read_access(plan, ledger, consumer, scope_raw, plan_raw, ops.read_file, probe)
        observed = consumer.observe(access.REAL, access.RAW, ops.read_file)
        need(observed['phase'] == 'restored', 'FINAL_RESTORED_REFERENCE_REQUIRED')
        for row in plan['observations']:
            need(access.same_object(access.metadata(row['before']['path']), row['before']), 'FINAL_ORIGINAL_METADATA_DIFFERS')
        finished = time.monotonic()
        need(last_callback_finished[0] is not None and last_callback_finished[0] <= active_deadline and finished-last_callback_finished[0] <= 20 and finished-(active_deadline-30) <= 50, 'DIAGNOSTIC_TIME_BUDGET_EXCEEDED')
        result.update(cleanupObservedSeconds=finished-last_callback_finished[0], requestKey=KEY, scopeSha256=sys.argv[1], metadataObservations=45, metadataChanges=3,
                      phaseReceipts=len(stages), elapsedActiveAndCleanupSeconds=time.monotonic()-(active_deadline-30),
                      currentReference=ops.strict(consumer.pointer_bytes(access.REAL, ops.read_file)),
                      PGStarted=False, rolesChanged=False, productionSwitched=False)
        ops.new_json(job/'results/directory-diagnostic-result.json', result)
    except BaseException as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]{1,120}', str(error)) else 'FIXED_DIAGNOSTIC_FAILURE'
        ops.new_json(job/'results/directory-diagnostic-failure.json', {
            'requestKey': KEY, 'code': code, 'exceptionClass': type(error).__name__,
            'phaseReceiptCount': len(stages), 'automaticRetry': False, 'SQLExecuted': False,
            'PGStarted': False, 'cleanupNotInferredFromJobExit': True,
        })
        raise


if __name__ == '__main__':
    main()
