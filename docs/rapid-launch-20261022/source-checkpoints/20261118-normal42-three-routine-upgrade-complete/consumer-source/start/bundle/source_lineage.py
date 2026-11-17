"""One exact source lineage, paired with actual protected ROOT07 receipts.

Static source proof is never a live catalog result. No PG, clock, issuer or retry.
The caller retains its existing full catalog35 validator and physical PREPARE.
"""
import hashlib
import json

LINEAGE_SHA256 = 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0'
ROOT07_KEY = 't45-r3-batched-root07-source-delta-20261117-01'
OPERATOR = 'installed-real-operation-batched-root07-20261117-01'
HOST_SOURCE_ROOT = '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/' + OPERATOR + '/operation'
SOURCE_ROOT = '/var/lib/naijue-erp/fresh35-production/' + OPERATOR + '/operation'
ROOT06_SHA256 = '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171'
OLD_ROWS = '078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9'
OLD_SOURCE = 'd20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898'
ROWS = '74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e'
SOURCE = 'f9a7f170360185a2993b2e4e6d5fb3d1eb1767bcc325d71b72b2723c16faae7e'
DESCRIPTION = 'c0b18a897fa32f956f0c8d2950b2631c3be1a8debb517fc53f67097e84d3f7b9'
INSTALLER = '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4'
MODEL = '626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811'
HISTORICAL_CATALOG = dict(sourceSetSha256='cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c',
                          catalogSpecSha256='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29', modelSha256=MODEL)
CURRENT_SOURCE_CATALOG = dict(sourceSetSha256='db127efd32e1953fa550e56bd715b6ea334cc9d7e141217c4da8151bcd8c7803',
                              catalogSpecSha256='344ccd895e1e65dedf0fdae5be71e291a6226ba5c21d9c0f4276b2be5490f362', modelSha256=MODEL)
HISTORY_PINS = dict(catalogUpdateTerminalSha256='515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
                    catalogUpdateResultSha256='a474d758af30d53a4154f90081066213df351a33cb1226f976d6231ed7fdb020',
                    catalogUpdateCompletionSha256='fe89ee20df99555feec98782c7542730a199a9edffeb9e43b2c4f98388aa2207')


def need(ok, code):
    if not ok:
        raise ValueError('SOURCE_LINEAGE_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pin(value):
    return type(value) is str and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def check_lineage(raw):
    need(sha(raw) == LINEAGE_SHA256, 'EXACT_REVIEWED_PROOF_REQUIRED')
    p = json.loads(raw)
    need(p['format'] == 'D1_R3_SOURCE_CATALOG_LINEAGE_V1'
         and p['state'] == 'STATIC_SOURCE_LINEAGE_PROVED_NOT_LIVE_CATALOG_PASS'
         and p['historicalCatalog'] == HISTORICAL_CATALOG and p['currentSourceCatalog'] == CURRENT_SOURCE_CATALOG
         and p['runtimeLeafChanges'] == 1 and p['inheritedUnchangedFiles'] == 386
         and p['sourcePathsUnchanged'] is True and p['onlySourceObservationTagChanged'] is True
         and p['modelAndGuardSQLUnchanged'] is True and p['metadataOperationRequired'] is False
         and p['nativeCatalogRuntimeProven'] is False, 'STATIC_METADATA_LINEAGE_REQUIRED')
    return p


def check_marker(raw):
    m = json.loads(raw)
    need(m.get('requestKey') == ROOT07_KEY and m.get('state') == 'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
         and m.get('sourceRoot') == HOST_SOURCE_ROOT and m.get('sourceRowsSha256') == ROWS and m.get('sourceSetSha256') == SOURCE
         and m.get('sourceDescriptionSha256') == DESCRIPTION and m.get('sourceFiles') == 387
         and m.get('changedFiles') == 1 and m.get('inheritedUnchangedFiles') == 386
         and m.get('predecessorMaterializationSha256') == ROOT06_SHA256
         and m.get('installerRunnerSha256') == INSTALLER
         and m.get('originalSourcePreserved') is True and m.get('nodeModulesChanged') is False
         and m.get('databaseConnections') == 0 and m.get('databaseWrites') == 0
         and m.get('serviceStarted') is False and m.get('liveCatalogVerified') is False
         and m.get('automaticReplay') is False, 'ACTUAL_ROOT07_MARKER_REQUIRED')
    return m


def validate(a, read, jobs, control, host_state, job):
    refs = a.get('sourceLineage')
    need(type(refs) is dict and set(refs) == {'lineageSha256', 'materializationTerminalSha256', 'materializationResultSha256', 'materializationPublicResultSha256'}
         and all(pin(value) for value in refs.values()) and refs['lineageSha256'] == LINEAGE_SHA256,
         'EXACT_RECEIPT_REFERENCES_REQUIRED')
    check_lineage(read(job / 'bundle/source-catalog-lineage.json', 131072))
    need(all(a[k] == value for k, value in HISTORY_PINS.items()), 'ACTUAL_CATALOG35_PINS_REQUIRED')
    b = a['expectedBinding']
    need({k: b.get('batched' + k[0].upper() + k[1:]) for k in CURRENT_SOURCE_CATALOG} == CURRENT_SOURCE_CATALOG, 'CURRENT_BINDING_REQUIRED')
    prior_raw = read(host_state / 'installed-real-operation-batched-root06-20261116-01/source-materialization.json')
    prior = json.loads(prior_raw)
    need(sha(prior_raw) == ROOT06_SHA256 and prior['sourceRowsSha256'] == OLD_ROWS
         and prior['sourceSetSha256'] == OLD_SOURCE and prior['sourceFiles'] == 387
         and prior['state'] == 'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION', 'ROOT06_HISTORY_REQUIRED')
    terminal_raw = read(jobs / ROOT07_KEY / 'r3-outer-terminal.json')
    t = json.loads(terminal_raw)
    need(sha(terminal_raw) == refs['materializationTerminalSha256']
         and terminal_raw == read(control / 'results' / (ROOT07_KEY + '.json'), owner=1000)
         and (t.get('jobId'), t.get('taskId'), t.get('grantId'), t.get('status'), t.get('exitCode'))
         == (ROOT07_KEY, 'T45', 'b16447fbc81f4d64', 'COMPLETED', 0)
         and t.get('phaseStarted') is True and t.get('finishedAtUTC'), 'ACTUAL_COMPLETED_TERMINAL_REQUIRED')
    raw = read(jobs / ROOT07_KEY / 'results/batched-source-materialization.json')
    public_raw = read(control / 'jobs' / ROOT07_KEY / 'results/batched-source-materialization.json', owner=1000)
    marker_raw = read(host_state / OPERATOR / 'source-materialization.json')
    need(sha(raw) == refs['materializationResultSha256'] == a['operatorReadySha256']
         and sha(public_raw) == refs['materializationPublicResultSha256']
         and json.loads(raw) == json.loads(public_raw) and marker_raw == raw, 'EXACT_ROOT_PUBLIC_MARKER_REQUIRED')
    return check_marker(raw)
