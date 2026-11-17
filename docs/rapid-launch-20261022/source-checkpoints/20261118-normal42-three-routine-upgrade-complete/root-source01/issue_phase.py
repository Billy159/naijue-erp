"""Main-only phase API; exactly apply/start/upgrade/stop/restore. No import branch."""
from pathlib import Path
import base64,hashlib,json,os,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
CONTROL=ROOT/'outputs/主控';T45=ROOT/'outputs/T45/revisions'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin,path;return raw
def read(path,pin=None):
 assert pin is not None,'EXACT_EVIDENCE_PIN_REQUIRED';return json.loads(checked(path,pin))
def verify_source():
 raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(raw)
 assert source['sourceOnly']is True
 for leaf,row in source['files'].items():assert len(checked(HERE/leaf,row['sha256']))==row['bytes']
 return sha(raw),source
def api(path,rule):
 checked(path,rule['bundlePins'][path.name]);sys.path.insert(0,str(path.parent))
 return runpy.run_path(str(path),run_name='main_unissued_consumer_api')
def witness():return json.loads((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes())
CONTROLLER='erp35_controller_20261110_r3'
ADMIN='erp35_admin_20261110_r3'
OLD_WRITER='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'
OLD_HOLD='25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'
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
        assert set(evidence['currentBatchTerminals']) == set(witness['stopCurrentBatchOperations'])
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
    assert fields['operatorReadySha256']==witness['operatorReadySha256']=='5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c'
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
    assert d['format'] == 'FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'
    assert len(d['functionIdentities']) == len(d['routinePins']) == 3
    assert d['requestKey'] == facts['requestKey']
    for key in ('installedBatchedCatalog', 'predecessorBatchedCatalog', 'batchedCatalog'):
        catalog = facts[key]
        assert catalog == d[key]
        assert set(catalog) == {'sourceSetSha256', 'catalogSpecSha256', 'modelSha256'}
        assert all(len(pin) == 64 and set(pin) <= set('0123456789abcdef') for pin in catalog.values())
    assert facts['installedBatchedCatalog']['modelSha256'] == facts['predecessorBatchedCatalog']['modelSha256']
    assert facts['predecessorBatchedCatalog']['modelSha256'] != facts['batchedCatalog']['modelSha256']
    return facts

def catalog_update_authority(witness, rule, installed, context, roles, policy, manifest, now):
    host, fields = normal_common('upgrade', witness, rule, context, roles, policy, manifest, now)
    start = context['start']
    facts = runtime_catalog_facts(start, fields['service'])
    d = start['descriptor']
    assert d['requestKey'] == rule['jobId']
    assert d['reviewedInputSha256'] == host['REVIEWED_INPUT_SHA256']
    assert host['BEFORE_CATALOG'] == facts['installedBatchedCatalog']
    assert installed['rootPins']['terminal']=='01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2' and installed['rootPins']['result']=='e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792'
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
def start_authority(witness, rule, apply, roles, policy, now):
    normalize_apply(apply, policy, roles)
    budget_ms=(sum(policy['jobs'][phase]['timeoutSeconds'] for phase in ('start','upgrade'))+240)*1000
    assert now+budget_ms<roles['controllerValidUntil'],'Insufficient complete normal-chain budget before controller expiry'
    folder=Path(witness['phaseDirectories']['start']);proof=api(folder/'normal_service05_after08_proof.py',rule)
    previous=read(CONTROL/'20261115-r3-direct-service24-start-window-01/service-start-authorization.json','bf90fa60f69519b27c9da11d1133d3544850a72218ac26029bb8574aea30130c')
    a={**proof['scope'](),**{key:previous[key] for key in ('record38Sha256','phaseResults','phaseTerminals')}}
    seconds=min(4200,(roles['restorationDeadline']-600000-now)//1000)
    assert seconds>2400
    lease=now+seconds*1000;expiry=min(now+900000,roles['controllerValidUntil']-120000)
    assert now+300000<expiry<roles['controllerValidUntil']
    assert roles['backupAdminValidUntil']<lease-35000<policy['expiresAt']
    a.update(startsAt=now,expiresAt=expiry,maximumServiceSeconds=seconds,
        serviceLeaseExpiresAt=lease,capacityExpiresAt=lease,
        authorizationReference='Finite same-PGDATA service42 after actual guardian41 closure and original authentication rollback02; no successful Stop41 fabricated.',
        normalServiceSha256=rule['bundlePins']['normal_service05_after08.py'],
        proofSourceSha256=rule['bundlePins']['normal_service05_after08_proof.py'],
        applyTerminalSha256=apply['rootPins']['terminal'],applyResultSha256=apply['publicResultSha256'],
        **witness['predecessor']['bindings'])
    assert a['previousRequestKey']==witness['priorService']['serviceKey'] and a['previousClosureKind']=='SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED'
    proof['validate_authority'](a,now)
    return a

def issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None):
 source_pin,source=verify_source();assert rules_pin==sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes());w=read(rules_file,rules_pin)
 assert rules_pin==sha((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes())and w==witness()
 assert phase in ('apply','start','upgrade','stop','restore')and w['noWriterKeySelected']is True
 issued=Path(registration_directory).resolve();assert issued.parent==CONTROL
 manifest=json.loads((issued/'ISSUED.json').read_bytes())
 assert manifest['sourcePinsSha256']==source_pin and manifest['state']=='ISSUED_NORMAL42_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED'and manifest['rulesSha256']==rules_pin and manifest['consumerSourcePinsSha256']==w['consumerSourcePinsSha256']
 assert manifest['sourcePinsSha256']==source_pin
 policy=read(issued/'direct42-batched-real.json',manifest['policySha256']);roles=read(issued/'roles-authorization.json',manifest['rolesSha256']);rule=policy['jobs'][phase]
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='main42_policy_check');cas['validate_policy_delta'](policy)
 folder=Path(w['phaseDirectories'][phase]);assert folder.is_relative_to(T45.resolve())
 for leaf,pin in rule['bundlePins'].items():checked(issued/leaf if leaf=='roles-authorization.json'else folder/leaf,pin)
 evidence=read(evidence_path,evidence_pin)if evidence_path is not None else None
 predecessor=read(predecessor_path,predecessor_pin)if predecessor_path is not None else None
 # A new phase is materialized once; ambiguity is read under the original key.
 out=issued/('phase-'+phase);assert not out.exists()
 os.environ['ERP_SHARED_JOB_ID']=rule['jobId']
 os.environ['ERP_SHARED_JOB_DIR']='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'+rule['jobId']
 now=time.time_ns()//1000000
 assert policy['startsAt']<=now<policy['expiresAt']
 if phase=='apply':
  a=read(issued/'host-authorization.json',manifest['applyHostSha256']);host=api(folder/rule['script'],rule);host['validate'](a,'apply',now)
 elif phase=='start':a=start_authority(w,rule,evidence,roles,policy,now)
 elif phase=='upgrade':
  assert evidence['operatorReadySha256']==w['operatorReadySha256']
  a,_=catalog_update_authority(w,rule,predecessor,evidence,roles,policy,manifest,now)
 else:a=preservation_authority(phase,w,rule,predecessor,evidence,roles,policy,now)
 assert now+rule['timeoutSeconds']*1000<a[rule['deadlineField']]<=policy['expiresAt']
 raw=encode(a);out.mkdir(mode=0o700)
 with os.fdopen(os.open(out/rule['authorityLeaf'],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb')as f:f.write(raw)
 report=dict(phase=phase,jobId=rule['jobId'],authoritySha256=sha(raw),sourcePinsSha256=source_pin,phaseSubmitted=False,automaticReplay=False)
 with os.fdopen(os.open(out/'ISSUED.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w')as f:json.dump(report,f,sort_keys=True)
 return report
