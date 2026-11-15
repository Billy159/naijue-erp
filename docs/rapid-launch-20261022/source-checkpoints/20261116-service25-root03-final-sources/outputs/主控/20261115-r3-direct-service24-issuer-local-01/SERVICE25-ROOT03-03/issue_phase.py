"""Issue finite direct24 phases from actual predecessor receipts; no server execution."""
from pathlib import Path
import base64
import hashlib
import json
import os
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parent.parent
ROOT = HERE.parents[3]
T45 = ROOT / 'outputs/T45/revisions'
OLD_WRITER = 'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'
OLD_HOLD = '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'
CONTROLLER = 'erp35_controller_20261110_r3'
ADMIN = 'erp35_admin_20261110_r3'

def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path, pin=None):
    raw = Path(path).read_bytes()
    if pin is not None:
        assert sha(raw) == pin, path
    return json.loads(raw)


def api(path, rule):
    assert sha(path.read_bytes()) == rule['bundlePins'][path.name]
    sys.path.insert(0, str(path.parent))
    return runpy.run_path(str(path), run_name='local_authority')


def normalize_apply(apply, policy, roles):
    result = apply['result']
    inside = result['result']
    assert apply['terminal']['jobId'] == result['requestKey'] == policy['jobs']['apply']['jobId']
    assert (apply['terminal']['status'], apply['terminal']['exitCode']) == ('COMPLETED', 0)
    assert result['phase'] == 'apply'
    assert inside['status'] == 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'
    assert inside['runtimeAuthChanged'] is False and inside['membershipsOrRoleAttributesChanged'] is False
    assert result['cleanup']['ownContainerStopped'] and result['cleanup']['ownedPidAbsent']
    deadlines = inside['credentialValidUntilByRole']
    assert deadlines == {CONTROLLER: roles['controllerValidUntil'], ADMIN: roles['backupAdminValidUntil']}
    return deadlines


def start_authority(witness, rule, apply, roles, policy, now):
    normalize_apply(apply, policy, roles)
    folder = Path(witness['phaseDirectories']['start'])
    proof = api(folder / 'normal_service05_after08_proof.py', rule)
    previous_base = CONTROL / '20261115-r3-direct-service24-start-window-01'
    a = read(previous_base / 'service-start-authorization.json')
    a.update(proof['scope']())
    seconds = min(6000, (roles['restorationDeadline'] - 600_000 - now) // 1000)
    assert seconds > 3600
    lease = now + seconds * 1000
    expiry = min(now + 900_000, roles['controllerValidUntil'] - 120_000)
    assert now + 480_000 < expiry < roles['controllerValidUntil']
    assert roles['backupAdminValidUntil'] < lease - 35_000 < policy['expiresAt']
    a.update(startsAt=now, expiresAt=expiry, maximumServiceSeconds=seconds,
             serviceLeaseExpiresAt=lease, capacityExpiresAt=lease,
             authorizationReference='Finite same-PGDATA service25 for the approved direct REAL batch and exact DB05 install.',
             normalServiceSha256=rule['bundlePins']['normal_service05_after08.py'],
             proofSourceSha256=rule['bundlePins']['normal_service05_after08_proof.py'],
             previousTerminalSha256=witness['priorStartTerminalSha256'],
             previousResultSha256=witness['priorStartPublicResultSha256'],
             previousCleanupSha256=witness['priorStopCleanupSha256'],
             previousCurrentProofSha256=witness['priorService']['proofSha256'],
             previousStopTerminalSha256=witness['priorStopTerminalSha256'],
             previousStopResultSha256=witness['priorStopPublicResultSha256'],
             restoreTerminalSha256=witness['priorRestoreTerminalSha256'],
             restoreResultSha256=witness['priorRestorePublicResultSha256'],
             applyTerminalSha256=apply['rootPins']['terminal'],
             applyResultSha256=apply['publicResultSha256'])
    proof['validate_authority'](a, now)
    return a


def observation(start, policy, witness):
    service = start['service']
    physical = start['physical']
    assert set(service) == set(witness['priorService'])
    assert service['serviceKey'] == start['requestKey'] == policy['jobs']['start']['jobId']
    assert service['containerId'] != witness['priorService']['containerId']
    assert service['postmasterStart'] == physical['postmasterStart']
    assert service['postmasterStart'] > witness['priorService']['postmasterStart']
    assert physical['systemIdentifier'] == '7706545564479176741' and physical['databaseOid'] == '16393'
    assert physical['serverVersionNum'] == '170011'
    assert start['retainedAckConfirmed'] and start['readOnlyReadiness'] and start['resultObjectsEqual']
    assert start['actualSharedServiceWorkDeadline'] + 35000 == start['outerAuthorityLeaseExpiresAt'] <= policy['expiresAt']
    return service


def preservation_authority(phase, witness, rule, start, evidence, roles, policy, now):
    if phase == 'stop':
        service = observation(start, policy, witness)
        assert evidence['serverOwnerVerified'] and evidence['exactService'] == service
        assert evidence['writerSettled']
        assert set(evidence['currentBatchTerminals']) == {policy['jobs'][p]['jobId'] for p in ('install', 'writer')}
        assert evidence['noOtherOperationUnits'] and evidence['backupNotActive']
        src = Path(witness['phaseDirectories']['stop']) / rule['script']
        host = api(src, rule)
        expiry = min(now + 300_000, start['actualSharedServiceWorkDeadline'])
        assert expiry > now + 150_000
        authority = dict(host['scope'](), service=service, startsAt=now, expiresAt=expiry,
                         writerTerminalSha256=OLD_WRITER, policySha256=OLD_HOLD, sourceSha256=sha(src.read_bytes()),
                         currentBatchTerminals=evidence['currentBatchTerminals'],
                         authorizationReference='Cleanly stop exact generation 25 and preserve its data directory.')
        host['validate'](authority, now)
        return authority
    service = observation(start, policy, witness) if start is not None else None
    src = Path(witness['phaseDirectories']['restore']) / rule['script']
    host = api(src, rule)
    expiry = min(now + 900_000, roles['restorationDeadline'], policy['expiresAt'])
    assert expiry > now + 300_000
    writer_pin, hold_pin = OLD_WRITER, OLD_HOLD
    if service is None:
        writer_pin, hold_pin = None, None
        assert evidence['pgdataPidAbsent'] and evidence['noOtherOperationUnits']
        if evidence.get('startUnsubmitted') is True:
            stop_fields = dict(stopRequestKey=None, stopTerminalSha256=None,
                               stopResultSha256=None, stopCleanupSha256=None)
        else:
            terminal, result = evidence['terminal'], evidence['incomplete']
            assert terminal['jobId'] == result['requestKey'] == policy['jobs']['start']['jobId']
            assert (terminal['status'], terminal['exitCode'], terminal['phaseStarted']) == ('FAILED', 2, True)
            assert result['confirmed'] and result['containerStopped'] and result['pid'] == 0
            assert result['runtimeMaterialPreserved'] and evidence['retainedAckAbsent'] and evidence['portAbsent']
            assert result['cleanStop']['cleanupSha256'] == evidence['rootPins']['cleanup']
            stop_fields = dict(stopRequestKey=terminal['jobId'], stopTerminalSha256=evidence['rootPins']['terminal'],
                               stopResultSha256=evidence['rootPins']['result'], stopCleanupSha256=evidence['rootPins']['cleanup'])
    else:
        result = evidence['result']
        assert result['requestKey'] == evidence['terminal']['jobId'] == policy['jobs']['stop']['jobId']
        assert result['service'] == service and result['pgStopped'] is True and evidence['pgdataPidAbsent'] is True
        assert result['cleanupSha256'] == evidence['rootPins']['cleanup']
        assert (evidence['terminal']['status'], evidence['terminal']['exitCode']) == ('COMPLETED', 0)
        stop_fields = dict(stopRequestKey=result['requestKey'], stopTerminalSha256=evidence['rootPins']['terminal'],
                           stopResultSha256=evidence['rootPins']['result'], stopCleanupSha256=evidence['rootPins']['cleanup'])
    authority = dict(host['scope']('restore'), service=service, startsAt=now, expiresAt=expiry,
                     writerTerminalSha256=writer_pin, policySha256=hold_pin,
                     authorizationReference='Restore the original two database role authentication fields on the stopped data directory.',
                     independentReviewSha256=roles['independentReviewSha256'],
                     rolesAuthoritySha256=rule['bundlePins']['roles-authorization.json'],
                     rolesSourceSha256=rule['bundlePins']['ordinary05_roles.py'], hostSourceSha256=sha(src.read_bytes()),
                     **stop_fields)
    host['validate'](authority, 'restore', now)
    return authority


def materialize_authority(witness, rule, policy, manifest, now):
    folder = Path(witness['phaseDirectories']['materialize'])
    description_pin = rule['bundlePins']['source-description.json']
    description = read(folder / 'source-description.json', description_pin)
    assert description['format'] == 'T45_R3_EXACT_THREE_FILE_SOURCE_DELTA_V1'
    assert description['predecessorMaterializationSha256'] == '7306aa53eefd744a43c5b5781a1bc8eadd6fef4009bc308dfa27f93663492ce3'
    host = api(folder / rule['script'], rule)
    fixed = host['scope']()
    assert fixed['outputDirectory'] == '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root03-20261116-01'
    assert fixed['sourceDescriptionSha256'] == description_pin
    authority = dict(fixed, startsAt=now, expiresAt=min(now+900_000,policy['expiresAt']),
                     authorizationReference='Exact approved three-file source delta; original materialization preserved; no database or service action.',
                     independentReviewSha256=manifest['independentReviewSha256'],
                     sourceSha256=rule['bundlePins'][rule['script']])
    host['validate'](authority, now)
    return authority


def normal_common(phase, witness, rule, context, roles, policy, manifest, now):
    normalize_apply(context['apply'], policy, roles)
    start = context['start']
    service = observation(start, policy, witness)
    folder = Path(witness['phaseDirectories'][phase])
    host = api(folder / rule['script'], rule)
    fields = dict(service=service, startsAt=now,
                  authorizationReference='Verified human direct REAL instruction 01a1df2e-293d-7061-ab16-5b0cc2e0e753; exact existing private channel and same approved original business keys.',
                  independentReviewSha256=manifest['independentReviewSha256'],
                  sourceSha256=rule['bundlePins'][rule['script']],
                  operatorReadySha256=context['operatorReadySha256'],
                  startTerminalSha256=start['terminalRootPublicSha256'],
                  startResultSha256=start['rootResultSha256'],
                  lockCapacitySettingsSha256=start['rawCapacitySettingsSha256'],
                  applyTerminalSha256=context['apply']['rootPins']['terminal'],
                  applyResultSha256=context['apply']['rootPins']['result'])
    assert len(fields['operatorReadySha256']) == 64
    return host, fields


def install_authority(witness, rule, described, context, roles, policy, manifest, now):
    host, fields = normal_common('install', witness, rule, context, roles, policy, manifest, now)
    d = described['descriptor']
    assert described['state'] == 'PROGRAM_DESCRIBED_NO_PG_OR_WRITE'
    assert described['databaseConnections'] == described['mutations'] == 0
    assert d['backupAdminValidUntil'] == roles['backupAdminValidUntil']
    assert d['currentServiceSha256'] == fields['service']['proofSha256']
    assert d['postmasterStart'] == fields['service']['postmasterStart']
    inner_path = Path(context['innerAuthorityPath'])
    assert inner_path.resolve().parent.parent == CONTROL.resolve()
    inner = inner_path.read_bytes()
    assert sha(inner) == context['innerAuthoritySha256']
    a = dict(host['scope'](), **fields, expiresAt=d['expiresAt'],
             upgradeDescriptor=d, innerAuthoritySha256=sha(inner),
             innerAuthorityBase64=base64.b64encode(inner).decode(),
             backupAdminValidUntil=roles['backupAdminValidUntil'],
             installStartsAt=d['startsAt'], installExpiresAt=d['expiresAt'])
    host['validate'](a, now)
    return a, host['encode']


def writer_authority(witness, rule, installed, context, roles, policy, manifest, now):
    host, fields = normal_common('writer', witness, rule, context, roles, policy, manifest, now)
    terminal, result = installed['terminal'], installed['result']
    assert terminal['jobId'] == result['requestKey'] == policy['jobs']['install']['jobId']
    assert (terminal['status'], terminal['exitCode']) == ('COMPLETED', 0)
    assert result['service'] == fields['service']
    assert result['state'] == 'DB05_CATALOG_INSTALLED_AND_CAPTURED'
    assert result['connectionCleanup'] == 'CLOSED' and result['roleRestoreAcknowledged'] is True
    catalog = result['batchedCatalog']
    assert set(catalog) == {'sourceSetSha256', 'catalogSpecSha256', 'modelSha256'}
    assert catalog['catalogSpecSha256'] == result['successorCatalogSpecSha256']
    assert catalog['modelSha256'] == result['successorModelSha256']
    expiry = roles['controllerValidUntil']
    assert expiry + 120_000 <= context['start']['actualSharedServiceWorkDeadline']
    assert expiry <= policy['expiresAt']
    assert now + rule['timeoutSeconds'] * 1000 < expiry
    facts_path = ROOT / 'outputs/T45/revisions/20261115-r3-batched-real-first-live-01/NORMAL-PRODUCER-PUBLIC-FACTS.json'
    facts = read(facts_path, 'e6a76d0a1753ddd90d74b240d807e082e7bc2c6b5e36ce68f1228582ffaf4eb7')
    binding = dict(facts['originalPreparedBinding'])
    binding.update(currentServiceSha256=fields['service']['proofSha256'],
                   postmasterStart=fields['service']['postmasterStart'], transactionMode='BATCHED_V1',
                   batchedDbCandidatePinsSha256='dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9',
                   batchedSourceSetSha256=catalog['sourceSetSha256'],
                   batchedCatalogSpecSha256=catalog['catalogSpecSha256'],
                   batchedModelSha256=catalog['modelSha256'])
    inner = dict(format='FRESH35_COMPACT_ZERO_EXECUTION_AUTHORIZATION_V2',
                 decision='AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK',
                 binding=binding, startsAt=now, expiresAt=expiry,
                 authorizationReference=fields['authorizationReference'],
                 independentSafetyReviewSha256=manifest['independentReviewSha256'])
    raw_inner = host['encode'](inner)
    folder = Path(witness['phaseDirectories']['writer'])
    cli = api(folder / 'r3_05_cli.py', rule)
    cli['require_execute_authority'](raw_inner, sha(raw_inner), binding, now, expiry, json.loads)
    access = api(folder / 'nonroot_input_access.py', rule)
    access_plan = json.loads(Path(witness['accessPlanPath']).read_bytes())
    assert sha(access['encode'](access_plan)) == witness['accessPlanSha256']
    a = dict(host['scope'](), **fields, expiresAt=expiry, accessPlan=access_plan,
             accessPlanSha256=witness['accessPlanSha256'],
             executionAuthoritySha256=sha(raw_inner),
             executionAuthorityBase64=base64.b64encode(raw_inner).decode(), expectedBinding=binding,
             batchedCatalog=catalog,
             installTerminalSha256=installed['rootPins']['terminal'],
             installResultSha256=installed['rootPins']['result'])
    host['validate'](a, now)
    return a, host['encode']


def issue(phase, rules_file, rules_pin, registration_directory,
          evidence_path=None, evidence_pin=None, predecessor_path=None, predecessor_pin=None):
    witness = read(rules_file, rules_pin)
    issued = Path(registration_directory).resolve()
    assert issued.parent == CONTROL.resolve()
    manifest = read(issued/'ISSUED.json')
    assert manifest['rulesSha256'] == rules_pin
    policy = read(issued/'direct25-batched-real.json',manifest['policySha256'])
    roles = read(issued/'roles-authorization.json',manifest['rolesSha256'])
    rule = policy['jobs'][phase]
    folder = Path(witness['phaseDirectories'][phase]).resolve(strict=True)
    assert folder.is_relative_to(T45.resolve()) and folder.name == 'bundle'
    for leaf,pin in rule['bundlePins'].items():
        raw = (issued/leaf).read_bytes() if leaf=='roles-authorization.json' else (folder/leaf).read_bytes()
        assert sha(raw)==pin
    evidence = read(evidence_path,evidence_pin) if evidence_path else None
    predecessor = read(predecessor_path,predecessor_pin) if predecessor_path else None
    os.environ['ERP_SHARED_JOB_ID']=rule['jobId']
    now=time.time_ns()//1_000_000
    assert policy['startsAt']<=now<policy['expiresAt']
    encode_authority=lambda value:(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
    if phase=='materialize':
        assert evidence is None and predecessor is None
        authority=materialize_authority(witness,rule,policy,manifest,now)
    elif phase=='start':
        authority=start_authority(witness,rule,evidence,roles,policy,now)
    elif phase=='install':
        authority,encode_authority=install_authority(witness,rule,evidence,predecessor,roles,policy,manifest,now)
    elif phase=='writer':
        authority,encode_authority=writer_authority(witness,rule,evidence,predecessor,roles,policy,manifest,now)
    else:
        assert phase in ('stop','restore')
        authority=preservation_authority(phase,witness,rule,predecessor,evidence,roles,policy,now)
    assert authority['requestKey']==rule['jobId']
    assert policy['startsAt']<=authority['startsAt']<=now
    assert now+rule['timeoutSeconds']*1000<authority['expiresAt']<=policy['expiresAt']
    raw=encode_authority(authority)
    directory=CONTROL/('20261116-r3-direct-service25-'+phase+'-window-01')
    directory.mkdir(mode=0o700)
    with (directory/rule['authorityLeaf']).open('xb') as stream:stream.write(raw)
    report=dict(path=str(directory/rule['authorityLeaf']),sha256=sha(raw),bytes=len(raw),
                key=rule['jobId'],expiresAt=authority['expiresAt'],startsAt=authority['startsAt'])
    with (directory/'ISSUED.json').open('x') as stream:json.dump(report,stream,sort_keys=True)
    return report


if __name__=='__main__':
    print(json.dumps(issue(*sys.argv[1:])))
