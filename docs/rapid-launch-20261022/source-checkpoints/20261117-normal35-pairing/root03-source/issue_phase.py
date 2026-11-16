"""Issue finite direct33 input materialization, native preparation and original writer phases."""
from pathlib import Path
import base64
import hashlib
import json
import os
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parents[2] / 'outputs/主控'
ROOT = HERE.parents[2]
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
    assert inside['requestKey']==roles['requestKey']==policy['jobs']['apply']['jobId']
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
    budget_ms=(sum(policy['jobs'][phase]['timeoutSeconds'] for phase in ('start','catalog_update','prepare','writer'))+240)*1000
    assert now+budget_ms<roles['controllerValidUntil'],'Insufficient complete normal-chain budget before controller expiry'
    folder=Path(witness['phaseDirectories']['start']);proof=api(folder/'normal_service05_after08_proof.py',rule)
    previous=read(CONTROL/'20261115-r3-direct-service24-start-window-01/service-start-authorization.json')
    a={**proof['scope'](),**{key:previous[key] for key in ('record38Sha256','phaseResults','phaseTerminals')}}
    seconds=min(8400,(roles['restorationDeadline']-600000-now)//1000)
    assert seconds>3600
    lease=now+seconds*1000;expiry=min(now+900000,roles['controllerValidUntil']-120000)
    assert now+480000<expiry<roles['controllerValidUntil']
    assert roles['backupAdminValidUntil']<lease-35000<policy['expiresAt']
    a.update(startsAt=now,expiresAt=expiry,maximumServiceSeconds=seconds,
        serviceLeaseExpiresAt=lease,capacityExpiresAt=lease,
        authorizationReference='Finite same-PGDATA service34 after real failed33 C/ACK clean stop and exact original authentication restore02.',
        normalServiceSha256=rule['bundlePins']['normal_service05_after08.py'],
        proofSourceSha256=rule['bundlePins']['normal_service05_after08_proof.py'],
        applyTerminalSha256=apply['rootPins']['terminal'],applyResultSha256=apply['publicResultSha256'],
        **witness['predecessor']['bindings'])
    assert a['previousRequestKey']==witness['priorService']['serviceKey'] and a['previousClosureKind']=='FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED'
    proof['validate_authority'](a,now)
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
    assert start['dataDirectoryIdentity'] == dict(device=66304, inode=13502421, uid=61035, gid=61035, mode=0o700)
    assert start['retainedAckConfirmed'] and start['readOnlyReadiness'] and start['resultObjectsEqual']
    assert start['actualSharedServiceWorkDeadline'] + 35000 == start['outerAuthorityLeaseExpiresAt'] <= policy['expiresAt']
    return service


def preservation_authority(phase, witness, rule, start, evidence, roles, policy, now):
    if phase == 'stop':
        service = observation(start, policy, witness)
        assert evidence['serverOwnerVerified'] and evidence['exactService'] == service
        assert evidence['writerSettled']
        assert set(evidence['currentBatchTerminals']) == {
            witness['historicalInstall']['requestKey'], policy['jobs']['catalog_update']['jobId'],
            policy['jobs']['prepare']['jobId'], policy['jobs']['writer']['jobId']}
        assert evidence['noOtherOperationUnits'] and evidence['backupNotActive']
        src = Path(witness['phaseDirectories']['stop']) / rule['script']
        host = api(src, rule)
        expiry = min(now + 300_000, start['actualSharedServiceWorkDeadline'])
        assert expiry > now + 150_000
        authority = dict(host['scope'](), service=service, startsAt=now, expiresAt=expiry,
                         writerTerminalSha256=OLD_WRITER, policySha256=OLD_HOLD, sourceSha256=sha(src.read_bytes()),
                         currentBatchTerminals=evidence['currentBatchTerminals'],
                         authorizationReference='Cleanly stop the exact authorized service and preserve its data directory.')
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
            terminal, incomplete = evidence['terminal'], evidence['incomplete']
            key = policy['jobs']['start']['jobId']
            assert terminal['jobId'] == incomplete['requestKey'] == key
            assert (terminal['status'], terminal['exitCode'], terminal['phaseStarted']) == ('FAILED', 2, True)
            assert evidence['ownOperationUnitInactive'] and evidence['portAbsent']
            incomplete_pin = evidence['incompleteRootSha256']
            assert incomplete_pin == evidence['rootPins']['incomplete']
            assert evidence['incompleteObjectsEqual'] is True
            assert all(type(evidence[k]) is str and len(evidence[k]) == 64 for k in
                       ('incompleteRootSha256', 'incompletePublicSha256'))
            assert incomplete['confirmed'] is True and incomplete['runtimeMaterialPreserved'] is True
            assert incomplete['originalKeyOnly'] is True and incomplete['automaticRetry'] is False
            if incomplete.get('format') == 'T45_R3_PRECONTAINER_FAILURE_V1':
                # This consumer verifies the distinct normal result for a genuine pre-create failure.
                assert all(type(evidence[k]) is str and len(evidence[k]) == 64 for k in
                           ('normalResultRootSha256', 'normalResultPublicSha256'))
                assert evidence['normalResultRootSha256'] == evidence['rootPins']['result']
                assert evidence['normalResultPublicSha256'] == evidence['publicResultSha256']
                assert evidence['resultObjectsEqual'] is True
                assert incomplete['state'] == 'PRE_CONTAINER_FAILURE_RESOURCES_ABSENT'
                assert incomplete['createAttempted'] is False and incomplete['cid'] is None
                assert 'containerStopped' not in incomplete
                expected = dict(device=66304, inode=13502421, uid=61035, gid=61035, mode=0o700)
                observed = incomplete['observation']
                assert observed['dataDirectoryIdentity'] == expected
                assert type(observed['checkedAt']) is int and observed['checkedAt'] <= now
                assert all(observed[k] is True for k in ('ownedContainerAbsent', 'postmasterPidAbsent',
                                                         'listenerAbsent', 'lifecycleOutputsAbsent'))
                assert evidence['retainedAckAbsent'] is True
                binding = incomplete['binding']
                start_rule = policy['jobs']['start']
                assert binding['normalServiceSha256'] == start_rule['bundlePins']['normal_service05_after08.py']
                assert binding['proofSourceSha256'] == start_rule['bundlePins']['normal_service05_after08_proof.py']
                assert all(type(binding[k]) is str and len(binding[k]) == 64 for k in
                           ('rootManifestSha256', 'rootRequestSha256', 'authoritySha256'))
                assert evidence['result']['requestKey'] == key
                assert evidence['result']['status'] == 'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'
                assert evidence['result']['automaticRetry'] is False
                # This field binds the real normal result for this typed case, not guardian cleanup.
                cleanup_pin = evidence['normalResultRootSha256']
            else:
                # A post-ACK failed handoff may leave an empty/malformed/missing normal result.
                # Its independent native incomplete and actual cleanup records remain authoritative.
                assert incomplete['containerStopped'] is True and incomplete['pid'] == 0
                assert incomplete['createAttempted'] is True and incomplete['successfulResultHandoff'] is False
                assert type(incomplete['cid']) is str and len(incomplete['cid']) == 64
                leaf = incomplete['cleanStop']['cleanupLeaf']
                assert leaf in ('cleanup.json', 'failed-start-cleanup.json') and evidence['cleanupLeaf'] == leaf
                cleanup_pin = evidence['cleanupRootSha256']
                assert cleanup_pin == evidence['rootPins']['cleanup'] == incomplete['cleanStop']['cleanupSha256']
                assert evidence['cleanup']['requestKey'] == key
                if leaf == 'cleanup.json':
                    assert all(evidence['cleanup']['cleanup'][k] is True for k in
                               ('cleanupComplete', 'cleanShutdown', 'dataPreserved', 'ownedPidAbsent', 'portAbsent'))
                else:
                    assert evidence['cleanup']['status'] == 'NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED'
                    assert evidence['cleanup']['originalPGDATAAndCleanStateVerified'] is True
                    assert evidence['cleanup']['dataDirectoryIdentity'] == dict(
                        device=66304, inode=13502421, uid=61035, gid=61035, mode=0o700)
                # Published C/ACK may exist on a failed handoff. Only real validated publication is accepted.
                assert evidence['retainedAckAbsent'] is True or evidence['retainedAckValidated'] is True
                if evidence['retainedAckValidated'] is True:
                    # await_retained_ack may validate the ACK and then fail before assigning ack.
                    # Closure relies on revalidated native publication, not that return flag.
                    assert incomplete['retainedAckValidated'] is True
                    assert evidence['currentProofPresent'] is True
                    assert type(evidence['currentProofSha256']) is str and len(evidence['currentProofSha256']) == 64
            stop_fields = dict(stopRequestKey=key, stopTerminalSha256=evidence['rootPins']['terminal'],
                               stopResultSha256=incomplete_pin, stopCleanupSha256=cleanup_pin)
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
    assert description['format'] == 'T45_R3_EXACT_FROZEN_SOURCE_DELTA_V1'
    for key, witness_key in (('predecessorMaterializationSha256','parentMaterializationSha256'),
                             ('predecessorSourceRowsSha256','parentSourceRowsSha256'),
                             ('sourceSetSha256','sourceSetSha256'),('sourceRowsSha256','sourceRowsSha256'),
                             ('sourceFiles','sourceFiles')):
        assert description[key] == witness[witness_key]
    assert description['changes'] == witness['sourceDelta']
    host = api(folder / rule['script'], rule)
    fixed = host['scope']()
    assert fixed['outputDirectory'] == '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01'
    assert fixed['sourceDescriptionSha256'] == description_pin
    authority = dict(fixed, startsAt=now, expiresAt=min(now+900_000,policy['expiresAt']),
                     authorizationReference='Exact reviewed runtime source delta from completed root05. Materialize the new source once without starting PostgreSQL.',
                     independentReviewSha256=manifest['independentReviewSha256'],
                     sourceSha256=rule['bundlePins'][rule['script']])
    host['validate'](authority, now)
    return authority


def normal_common(phase, witness, rule, context, roles, policy, manifest, now):
    normalize_apply(context['apply'], policy, roles)
    start = context['start']
    service = observation(start, policy, witness)
    apply = context['apply']
    assert apply['resultObjectsEqual'] is True
    assert start['applyBinding'] == dict(requestKey=policy['jobs']['apply']['jobId'],
        terminalSha256=apply['rootPins']['terminal'], publicResultSha256=apply['publicResultSha256'])
    folder = Path(witness['phaseDirectories'][phase])
    host = api(folder / rule['script'], rule)
    fields = dict(service=service, startsAt=now,
                  authorizationReference='Verified human REAL instruction 01a1e279-9ba9-7532-b40d-8ee8e094d4a1 and resumed updated November 16 input with the 11:40 business cutoff.',
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


def runtime_catalog_facts(described, service):
    assert described['descriptionSource'] == 'STORED_START_JOB_OUTPUTS_NO_NODE_RERUN'
    assert described['descriptionRootPublicObjectsMatched'] is True
    captured = described['result']['describe']
    assert captured['state'] == 'PROGRAM_DESCRIBED_NO_PG_OR_WRITE'
    assert captured['databaseConnections'] == captured['mutations'] == 0
    assert set(captured['outputs']) == {'payload', 'descriptor', 'liveFacts', 'process'}
    assert set(described['describeStoredOutputs']) == set(captured['outputs'])
    for kind, ref in captured['outputs'].items():
        stored = described['describeStoredOutputs'][kind]
        raw = stored['text'].encode('utf8')
        assert {k: stored[k] for k in ('leaf', 'bytes', 'sha256')} == ref
        assert len(raw) == ref['bytes'] and sha(raw) == ref['sha256']
    d = described['descriptor']
    assert json.loads(described['describeStoredOutputs']['descriptor']['text']) == d
    assert d['currentServiceSha256'] == service['proofSha256']
    assert d['postmasterStart'] == service['postmasterStart']
    facts = json.loads(described['describeStoredOutputs']['liveFacts']['text'])
    assert facts == described['rawLiveFacts'] and facts['service'] == service
    assert d['format'] == 'FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1'
    assert d['functionIdentity'] == 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)'
    assert d['requestKey'] == facts['requestKey']
    for key in ('installedBatchedCatalog', 'predecessorBatchedCatalog', 'batchedCatalog'):
        catalog = facts[key]
        assert catalog == d[key]
        assert set(catalog) == {'sourceSetSha256', 'catalogSpecSha256', 'modelSha256'}
        assert all(len(pin) == 64 and set(pin) <= set('0123456789abcdef') for pin in catalog.values())
    assert facts['installedBatchedCatalog']['modelSha256'] == facts['predecessorBatchedCatalog']['modelSha256']
    assert facts['predecessorBatchedCatalog']['modelSha256'] != facts['batchedCatalog']['modelSha256']
    return facts


def historical_catalog(witness, installed):
    terminal, result = installed['terminal'], installed['result']
    historical = witness['historicalInstall']
    assert terminal['jobId'] == result['requestKey'] == historical['requestKey']
    assert installed['rootPins']['terminal'] == installed['terminalRootPublicSha256'] == historical['terminalSha256']
    assert installed['rootPins']['result'] == historical['rootResultSha256']
    assert installed['publicResultSha256'] == historical['publicResultSha256']
    assert (terminal['status'], terminal['exitCode']) == ('COMPLETED', 0)
    assert result['service'] == witness['historicalInstallService']
    assert result['state'] == 'DB05_CATALOG_INSTALLED_AND_CAPTURED'
    assert result['connectionCleanup'] == 'CLOSED' and result['roleRestoreAcknowledged'] is True
    assert installed['resultObjectsEqual'] is True and result['acknowledgedLayers'] == 13
    program = result['programSha256']
    assert result['captureDirectoryLeaf'] == 'batched161-upgrade-' + program
    assert len(result['completionSha256']) == 64 and set(result['completionSha256']) <= set('0123456789abcdef')
    catalog = result['batchedCatalog']
    assert set(catalog) == {'sourceSetSha256', 'catalogSpecSha256', 'modelSha256'}
    assert catalog['catalogSpecSha256'] == result['successorCatalogSpecSha256']
    assert catalog['modelSha256'] == result['successorModelSha256']
    return catalog


def catalog_update_authority(witness, rule, installed, context, roles, policy, manifest, now):
    host, fields = normal_common('catalog_update', witness, rule, context, roles, policy, manifest, now)
    start = context['start']
    facts = runtime_catalog_facts(start, fields['service'])
    d = start['descriptor']
    assert d['requestKey'] == rule['jobId']
    assert d['reviewedInputSha256'] == host['REVIEWED_INPUT_SHA256']
    assert historical_catalog(witness, installed) == facts['installedBatchedCatalog']
    expected_payload = dict(service=fields['service'], backupAdminValidUntil=d['backupAdminValidUntil'],
                            installStartsAt=d['startsAt'], installExpiresAt=d['expiresAt'])
    assert start['describePayload'] == json.loads(start['describeStoredOutputs']['payload']['text']) == expected_payload
    assert d['backupAdminValidUntil'] == roles['backupAdminValidUntil']
    assert d['startsAt'] <= now < now + rule['timeoutSeconds'] * 1000 < d['expiresAt']
    assert d['expiresAt'] <= min(roles['backupAdminValidUntil'], start['actualSharedServiceWorkDeadline'])
    assert all(d[key] == facts[key] for key in ('sourceSetSha256', 'targetSha256', 'currentServiceSha256'))
    inner = dict(format='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1',
                 decision='AUTHORIZE_EXACT_DB05_SIX_ARG_COMMAND_ONLY',
                 independentSafetyReviewSha256=manifest['independentReviewSha256'],
                 authorizationReference=fields['authorizationReference'],
                 **{key: d[key] for key in ('programSha256', 'sourceSetSha256', 'targetSha256', 'startsAt', 'expiresAt')})
    raw_inner = host['encode'](inner)
    authority = dict(host['scope'](), **fields, expiresAt=d['expiresAt'], upgradeDescriptor=d,
                     innerAuthoritySha256=sha(raw_inner), innerAuthorityBase64=base64.b64encode(raw_inner).decode(),
                     backupAdminValidUntil=d['backupAdminValidUntil'], installStartsAt=d['startsAt'],
                     installExpiresAt=d['expiresAt'], installTerminalSha256=installed['rootPins']['terminal'],
                     installResultSha256=installed['rootPins']['result'], batchedCatalog=facts['installedBatchedCatalog'])
    host['validate'](authority, now)
    return authority, host['encode']


def verified_catalog_update(witness, evidence, start, facts, service, policy):
    terminal, result = evidence['terminal'], evidence['result']
    assert terminal['jobId'] == result['requestKey'] == policy['jobs']['catalog_update']['jobId']
    assert (terminal['status'], terminal['exitCode'], terminal['phaseStarted']) == ('COMPLETED', 0, True)
    assert evidence['rootPins']['terminal'] == evidence['terminalRootPublicSha256']
    assert evidence['resultObjectsEqual'] is True
    assert result['service'] == service and result['sourceSetSha256'] == witness['sourceSetSha256']
    assert result['state'] == 'DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK'
    assert result['programSha256'] == start['descriptor']['programSha256']
    assert result['captureDirectoryLeaf'] == 'batched161-command-' + result['programSha256']
    assert result['connectionCleanup'] == 'CLOSED'
    assert all(result[key] is True for key in ('nativeResultBindingMatched', 'childReaped', 'descendantsReaped',
                                               'innerAuthorityRemoved', 'commitAcknowledged', 'postCommitReadback',
                                               'roleRestoreAcknowledged'))
    assert all(result[key] is False for key in ('automaticReplay', 'businessImported', 'formalBusinessAccepted',
                                                'commitOutcomeUnknown'))
    assert result['batchedCatalog'] == facts['batchedCatalog']
    pins = [evidence['rootPins']['terminal'], evidence['rootPins']['result'], evidence['publicResultSha256'],
            *(result[key] for key in ('completionSha256', 'beforeCatalogSha256', 'catalogSha256', 'routineAttributesSha256'))]
    assert all(len(pin) == 64 and set(pin) <= set('0123456789abcdef') for pin in pins)
    return evidence


def input_materialize_authority(witness, rule, evidence, policy, now):
    folder = Path(witness['phaseDirectories']['input_materialize'])
    host = api(folder / rule['script'], rule)
    profile = read(folder / 'input-profile.json', rule['bundlePins']['input-profile.json'])
    assert evidence['requestKey'] == rule['jobId']
    assert evidence['PGConnections'] == evidence['writes'] == 0
    assert evidence['postmasterPidAbsent'] is True and evidence['unitState'] in ('inactive', 'unknown')
    assert evidence['unitReturnCode'] in (3, 4)
    assert 0 <= now - evidence['checkedAtMs'] <= 900000
    state = evidence['paths'][str(host['HOST'] / 'state')]
    assert (state['state'], state['device'], state['inode'], state['uid'], state['gid'], state['mode']) == (
        'PRESENT', 66304, 13502389, 0, 61035, 0o710)
    assert all(value['state'] == 'ENOENT' for name, value in evidence['paths'].items()
               if name != str(host['HOST'] / 'state'))
    rows = [r for archive in profile['archives'] for r in archive['fragments']]
    assert len(rows) == 211
    parts = evidence['receivedParts']
    assert len(parts) == len(rows)
    for part, row in zip(parts, rows):
        assert set(part) == {'key', 'authoritySha256', 'readySha256'} and part['key'] == row['key']
        assert all(len(part[key]) == 64 for key in ('authoritySha256', 'readySha256'))
    expiry = min(now + 300000, policy['expiresAt'])
    assert now + 240000 <= expiry
    a = dict(format='T45_R3_FINAL33_INPUT_MATERIALIZATION_V1',
        decision='AUTHORIZE_EXACT_FINAL33_INPUT_MATERIALIZATION', taskId='T45', requestKey=rule['jobId'],
        profileSha256=rule['bundlePins']['input-profile.json'], manifestSha256=profile['manifestSha256'],
        targetRoot=str(host['HOST']), originalWriterKey=profile['originalWriterKey'],
        installationRecordSha256=host['INSTALLATION_SHA'], parts=parts, hostStateInode=state['inode'],
        startsAt=now, expiresAt=expiry, sourceSha256=rule['bundlePins'][rule['script']],
        authorizationReference='Approved exact November16 final inputs,211 ready originals; no PostgreSQL, preflight replay or original overwrite.')
    host['validate'](a, profile, now)
    return a


def verified_input_materialization(witness, evidence, policy):
    t = evidence['terminal']
    assert (t['jobId'], t['status'], t['exitCode'], t['phaseStarted']) == (
        policy['jobs']['input_materialize']['jobId'], 'COMPLETED', 0, True)
    assert len(evidence['terminalSha256']) == 64
    leaf = evidence['final33-input-materialization-result.json']
    r = leaf['value']
    assert leaf['objectsEqual'] is True and len(leaf['rootSha256']) == len(leaf['publicSha256']) == 64
    assert leaf['rootSha256'] == evidence['materializationMarkerSha256']
    assert r['requestKey'] == t['jobId'] and r['state'] == 'FINAL33_PRIVATE_INPUTS_MATERIALIZED_NO_PG_OR_PRECHECK_REPLAY'
    assert r['profileSha256'] == witness['inputMaterializationProfileSha256']
    assert r['manifestSha256'] == '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
    assert r['PGConnections'] == 0 and r['businessDatabaseWrites'] is False
    return evidence['terminalSha256'], leaf['rootSha256']


def verified_prepare(witness, evidence, service, policy):
    t, r = evidence['terminal'], evidence['result']
    assert (t['jobId'], t['status'], t['exitCode'], t['phaseStarted']) == (
        policy['jobs']['prepare']['jobId'], 'COMPLETED', 0, True)
    assert evidence['terminalRootPublicSha256'] == evidence['rootPins']['terminal']
    assert evidence['resultObjectsEqual'] is True and all(len(evidence['rootPins'][k]) == 64 for k in ('terminal', 'result'))
    assert r['requestKey'] == t['jobId'] and r['service'] == service and r['state'] == 'BATCHED_IMPORT_PREPARED'
    assert r['nativeResultBindingMatched'] is True and r['lifecycleConfirmed'] is True and r['nativeConnectionCleanup'] == 'CLOSED'
    assert all(r['processCleanup'][k] is True for k in ('childReaped', 'descendantsReaped', 'nativeAuthorityRemoved', 'scratchEmpty'))
    prepared, execution = r['preparedBinding'], r['executionBinding']
    assert prepared['manifestSha256'] == execution['manifestSha256'] == '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
    assert execution['currentServiceSha256'] == service['proofSha256'] and execution['postmasterStart'] == service['postmasterStart']
    assert execution['transactionMode'] == 'BATCHED_V1' and len(execution['preparedBindingSha256']) == 64
    return prepared, execution


def validate_native_preparation(inner, binding, deadline):
    import subprocess
    leaf = ROOT / 'outputs/D1/20261116-r3-final-source-prepare-01/work/scripts/release/unified-install/fresh35-admin154-record-v1.mjs'
    assert sha(leaf.read_bytes()) == '49455ce58e9999fdad82806683f59537916989515b58e54f926f91a720f56c06'
    node = ROOT.parent / 'work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node'
    script = ('import {validateFresh35BatchedPreparationAuthorization as validate} from ' + json.dumps(leaf.as_uri()) +
        ';let raw="";for await(const b of process.stdin)raw+=b;const p=JSON.parse(raw);validate(p.authority,p.binding,p.deadline);process.stdout.write("VALIDATED");')
    result = subprocess.run([str(node), '--input-type=module', '-e', script],
        input=json.dumps(dict(authority=inner, binding=binding, deadline=deadline)), text=True,
        capture_output=True, timeout=20)
    assert result.returncode == 0 and result.stdout == 'VALIDATED', 'Exact native PREPARE validator rejected authority'


def final_native_authority(phase, witness, rule, installed, context, roles, policy, manifest, now):
    host, fields = normal_common(phase, witness, rule, context, roles, policy, manifest, now)
    historical = historical_catalog(witness, installed)
    facts = runtime_catalog_facts(context['start'], fields['service'])
    assert historical == facts['installedBatchedCatalog']
    live = facts['batchedCatalog']
    update = verified_catalog_update(witness, context['catalogUpdate'], context['start'], facts, fields['service'], policy)
    input_terminal, input_result = verified_input_materialization(witness, context['inputMaterialization'], policy)
    expiry = roles['controllerValidUntil']
    parent_deadline = min(context['start']['actualSharedServiceWorkDeadline'], context['start']['outerAuthorityLeaseExpiresAt'],
                          roles['restorationDeadline'], policy['expiresAt'])
    assert expiry + 120000 <= parent_deadline and now + rule['timeoutSeconds'] * 1000 < expiry
    extra = {}
    if phase == 'prepare':
        binding = facts['finalPreparationBinding']
        assert binding['format'] == 'FRESH35_BATCHED_PREPARATION_BINDING_V1'
        assert binding['preparationScope'] == {'requestKey':policy['jobs']['prepare']['jobId'],
                                               'batchPlanPath':host['scope']()['batchPlanPath']}
        input_binding = binding['inputBinding']
        assert input_binding['manifestSha256'] == host['scope']()['inputManifestSha256']
        assert input_binding['indexSha256'] == 'b5a6e1449795ccd4eef72de1599335633e2ee55cd076a7a0a920e9c4b063e9dd'
        assert input_binding['summarySha256'] == '6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d'
        inner = dict(format='FRESH35_BATCHED_PREPARATION_AUTHORIZATION_V1',
            decision='AUTHORIZE_EXACT_BATCH_PREPARATION_AND_READONLY_ROOT_INSPECTION', binding=binding,
            startsAt=now, expiresAt=expiry, maximumOperationSeconds=650, maximumCleanupSeconds=130, maximumJobSeconds=780,
            authorizationReference=fields['authorizationReference'], independentSafetyReviewSha256=manifest['independentReviewSha256'])
        validate_native_preparation(inner, binding, parent_deadline)
    else:
        prepared, binding = verified_prepare(witness, context['prepare'], fields['service'], policy)
        extra.update(prepareTerminalSha256=context['prepare']['rootPins']['terminal'],
                     prepareResultSha256=context['prepare']['rootPins']['result'], originalPreparedBinding=prepared)
        inner = dict(format='FRESH35_COMPACT_ZERO_EXECUTION_AUTHORIZATION_V2',
            decision='AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK', binding=binding,
            startsAt=now, expiresAt=expiry, authorizationReference=fields['authorizationReference'],
            independentSafetyReviewSha256=manifest['independentReviewSha256'])
    assert binding['currentServiceSha256'] == fields['service']['proofSha256']
    assert binding['postmasterStart'] == fields['service']['postmasterStart'] and binding['transactionMode'] == 'BATCHED_V1'
    assert all(binding[key] == live[other] for key, other in (
        ('batchedSourceSetSha256','sourceSetSha256'), ('batchedCatalogSpecSha256','catalogSpecSha256'), ('batchedModelSha256','modelSha256')))
    raw_inner = host['encode'](inner)
    if phase == 'writer':
        cli = api(Path(witness['phaseDirectories'][phase]) / 'r3_05_cli.py', rule)
        cli['require_execute_authority'](raw_inner, sha(raw_inner), binding, now, expiry, json.loads)
    a = dict(host['scope'](), **fields, **extra, expiresAt=expiry,
        nativeAuthoritySha256=sha(raw_inner), nativeAuthorityBase64=base64.b64encode(raw_inner).decode(), expectedBinding=binding,
        batchedCatalog=historical, catalogUpdateTerminalSha256=update['rootPins']['terminal'],
        catalogUpdateResultSha256=update['rootPins']['result'], catalogUpdateCompletionSha256=update['result']['completionSha256'],
        inputMaterializationTerminalSha256=input_terminal, inputMaterializationResultSha256=input_result,
        installTerminalSha256=installed['rootPins']['terminal'], installResultSha256=installed['rootPins']['result'])
    host['validate'](a, now)
    return a, host['encode']


FROZEN_RULES_SHA = '329dc564ebd227f2cb479e351b8854638445b906dc3818ef0410bdd53dc1dbf8'

def issue(phase, rules_file, rules_pin, registration_directory,
          evidence_path=None, evidence_pin=None, predecessor_path=None, predecessor_pin=None):
    assert rules_pin==FROZEN_RULES_SHA
    witness = read(rules_file, rules_pin)
    assert phase in ('apply','start','catalog_update','prepare','writer','stop','restore'), 'Completed input02/ROOT06 must never be reissued'
    assert witness['materializeNeverResubmit'] is True and witness['materializationAlreadyCompleted'] is True and witness['inputMaterializationAlreadyCompleted'] is True
    assert witness['inputMaterializeNeverResubmit'] is True
    for done,ref in witness['completionReadbackRefs'].items():
        actual=read(ref['path'],ref['sha256']);expected=witness['actualCompletedPreparation'][done]
        value=actual['final33-input-materialization-result.json']['value']if done=='input_materialize'else actual['result']
        assert value==expected['value'] and (actual['terminal']['jobId'],actual['terminal']['status'],actual['terminal']['exitCode'],actual['terminal']['phaseStarted'])==(expected['requestKey'],'COMPLETED',0,True)
    assert witness['materializationMode'] == 'FROZEN_SOURCE_DELTA_FROM_ACTUAL_COMPLETED_ROOT05'
    issued = Path(registration_directory).resolve()
    assert issued.parent == CONTROL.resolve()
    manifest = read(issued/'ISSUED.json')
    assert manifest['state']=='ISSUED_NORMAL35_REGISTRATION_NO_PHASE_SUBMITTED' and manifest['rulesSha256']==rules_pin and manifest['consumerSourcePinsSha256']=='8b8f63b0ed37613c816db0d3c8c16b1acf5902d61266be6b8b8cc7cd93bb193a'
    policy = read(issued/'direct35-batched-real.json',manifest['policySha256'])
    roles = read(issued/'roles-authorization.json',manifest['rolesSha256'])
    rule = policy['jobs'][phase]
    folder = Path(witness['phaseDirectories'][phase]).resolve(strict=True)
    assert folder.is_relative_to(T45.resolve()) and folder.name in ('bundle', 'final-bundle')
    for leaf,pin in rule['bundlePins'].items():
        raw = (issued/leaf).read_bytes() if leaf=='roles-authorization.json' else (folder/leaf).read_bytes()
        assert sha(raw)==pin
    evidence = read(evidence_path,evidence_pin) if evidence_path else None
    predecessor = read(predecessor_path,predecessor_pin) if predecessor_path else None
    os.environ['ERP_SHARED_JOB_ID']=rule['jobId']
    os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+rule['jobId']
    now=time.time_ns()//1_000_000
    assert policy['startsAt']<=now<policy['expiresAt']
    encode_authority=lambda value:(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
    if phase=='apply':
        authority=read(issued/'host-authorization.json',manifest['applyHostSha256'])
        assert authority['rolesAuthoritySha256']==manifest['rolesSha256'] and authority['expiresAt']==roles['expiresAt']
        host=api(folder/rule['script'],rule);host['validate'](authority,'apply',now)
    elif phase=='start':
        authority=start_authority(witness,rule,evidence,roles,policy,now)
    elif phase=='catalog_update':
        authority,encode_authority=catalog_update_authority(witness,rule,evidence,predecessor,roles,policy,manifest,now)
    elif phase in ('prepare','writer'):
        authority,encode_authority=final_native_authority(phase,witness,rule,evidence,predecessor,roles,policy,manifest,now)
    else:
        assert phase in ('stop','restore')
        authority=preservation_authority(phase,witness,rule,predecessor,evidence,roles,policy,now)
    assert authority['requestKey']==rule['jobId']
    assert policy['startsAt']<=authority['startsAt']<=now
    assert (now+240000<=authority['expiresAt']<=now+300000 if phase=='input_materialize' else now+rule['timeoutSeconds']*1000<authority['expiresAt'])
    assert authority['expiresAt']<=policy['expiresAt']
    raw=encode_authority(authority)
    directory=CONTROL/('20261117-r3-direct-service35-'+phase+'-window-01')
    directory.mkdir(mode=0o700)
    with (directory/rule['authorityLeaf']).open('xb') as stream:stream.write(raw)
    report=dict(path=str(directory/rule['authorityLeaf']),sha256=sha(raw),bytes=len(raw),
                key=rule['jobId'],expiresAt=authority['expiresAt'],startsAt=authority['startsAt'])
    with (directory/'ISSUED.json').open('x') as stream:json.dump(report,stream,sort_keys=True)
    return report


if __name__=='__main__':
    print(json.dumps(issue(*sys.argv[1:])))
