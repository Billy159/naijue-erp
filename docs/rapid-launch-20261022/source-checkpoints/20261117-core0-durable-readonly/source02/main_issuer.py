"""Main-only exact finite issuer. Defined here; never called by the job or CLI."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import base64
import json
import os
import time

HERE=Path(__file__).resolve().parent
PROJECT=HERE.parents[4]
WINDOW=PROJECT/'outputs/主控/20261117-r3-core0-durable-readonly-window-01'
KEY='t45-r3-core0-durable-readonly-20261117-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def issue_once(review_file,review_pin,fresh_restore_basis_file,fresh_basis_pin,fresh_registry_basis_file,registry_basis_pin,authorization_reference):
    # Call only in Main after actual narrow review and an independently read
    # fresh stopped basis. No runtime self-signing and no authority placeholders.
    source_raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(source_raw)
    verified={}
    for leaf,pin in source['files'].items():
        body=(HERE/leaf).read_bytes();assert sha(body)==pin;verified[leaf]=body
    raw=Path(review_file).read_bytes();assert sha(raw)==review_pin
    review=json.loads(raw)
    assert review['sourceOnly'] is True and review['findings']==[] and review['sourcePinsSha256']==sha(source_raw)
    raw=Path(fresh_restore_basis_file).read_bytes();assert sha(raw)==fresh_basis_pin
    basis=json.loads(raw);inside=basis['result']['result']
    assert basis['requestKey']=='t45-r3-ordinary39-auth-restore-20261116-01'
    assert basis['rootPins']['terminal']=='400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7'
    assert basis['terminal']['status']=='COMPLETED' and basis['terminal']['exitCode']==0
    assert inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] and not inside['naturalExpiryCountedAsRestoration'] and not inside['runtimeAuthChanged'] and not inside['membershipsOrRoleAttributesChanged']
    assert basis['pgdataPidAbsent'] and basis['hostPortAbsent'] and basis['activeOperationUnits']==[]
    assert basis['original36Service']['id']=='a17a885412cb8122e8b77a65d5058f1653c69a3cc20d1a11a3950e4fe6e4e1d5' and not basis['original36Service']['running'] and basis['original36Service']['pid']==0
    assert not basis['ownRestoreContainer']['running'] and basis['ownRestoreContainer']['pid']==0
    raw=Path(fresh_registry_basis_file).read_bytes();assert sha(raw)==registry_basis_pin
    registry=json.loads(raw)
    assert set(registry)=={'checkedAtUTC','dispatcherSha256','oldIdentities','PGConnections','mutations','registryOrJobSubmitted'} and registry['PGConnections']==0
    assert registry['dispatcherSha256']=='eabf10a911740fc864165ff9d5e66f0e654edc755b31299924755f91aa050206' and registry['mutations']==0 and registry['registryOrJobSubmitted'] is False
    root='/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/'
    hold='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/'
    expected={root+'admin_exec.py',root+'r3_normal39_continuation.py',root+'r3_root07_source_admission.py',hold+'direct39-batched-real.json',hold+'root07-source-only-20261117-01.json','executionLock'}
    identities=registry['oldIdentities'];assert type(identities) is dict and set(identities)==expected
    assert identities['executionLock']==[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
    for path,values in identities.items():
        assert type(values) is list and len(values)==9 and all(type(value) is int and value>=0 for value in values)
        if path!='executionLock':assert values[2]==0 and not values[4]&0o022 and values[5]==1 and 0<values[6]<=131072
    checked_restore=datetime.fromisoformat(basis['checkedAtUTC'])
    checked_registry=datetime.fromisoformat(registry['checkedAtUTC'])
    assert checked_restore.tzinfo is not None and checked_registry.tzinfo is not None
    restore_ms=int(checked_restore.timestamp()*1000);registry_ms=int(checked_registry.timestamp()*1000)
    assert type(authorization_reference) is str and 0<len(authorization_reference)<=512
    scope_pin=sha(verified['bundle/scope.json'])
    pins={name:sha(verified['bundle/'+name]) for name in ('durable_readonly_job.py','durable-readonly.sql','scope.json')}
    module=verified['r3_core0_durable_readonly.py'];template=verified['admin_exec.DURABLE-UNREGISTERED.py'];registration_source_pin=sha(verified['register_exact.py'])
    assert not WINDOW.exists()
    # Both actual basis objects and all static bytes/fields/identities have
    # been checked. Only Main now samples its sole issuance clock.
    stamp=time.time_ns()//1000000
    assert 0<=stamp-restore_ms<=120000 and 0<=stamp-registry_ms<=120000
    expires=stamp+900000
    authority={'format':'T45_R3_CORE0_DURABLE_READONLY_AUTHORITY_V1','requestKey':KEY,'startsAt':stamp,'expiresAt':expires,'sourceReviewSha256':review_pin,'scopeSha256':scope_pin,'authorizationReference':authorization_reference}
    authority_raw=(json.dumps(authority,sort_keys=True)+'\n').encode()
    policy={'format':'T45_R3_CORE0_DURABLE_READONLY_REGISTERED_V1','requestKey':KEY,'startsAt':stamp,'expiresAt':expires,'authoritySha256':sha(authority_raw),'sourceReviewSha256':review_pin,'bundlePins':pins}
    policy_raw=(json.dumps(policy,sort_keys=True)+'\n').encode()
    WINDOW.mkdir(exist_ok=False)
    for name,body in (('host-authorization.json',authority_raw),('registered-policy.json',policy_raw)):
        with (WINDOW/name).open('xb') as f:os.fchmod(f.fileno(),0o600);f.write(body);f.flush();os.fsync(f.fileno())
    files={'module':module,'policy':policy_raw,'dispatcherTemplate':template}
    registration={'format':'T45_R3_CORE0_DURABLE_REGISTRATION_ONLY_V1','requestKey':KEY,'sourceSha256':registration_source_pin,'sourcePins':{name:sha(body) for name,body in files.items()},'oldIdentities':registry['oldIdentities'],'startsAt':stamp,'expiresAt':stamp+300000,'independentReviewSha256':review_pin,'authorizationReference':authorization_reference}
    registration_raw=(json.dumps(registration,sort_keys=True)+'\n').encode()
    packet={'authorization':base64.b64encode(registration_raw).decode(),'files':{name:base64.b64encode(body).decode() for name,body in files.items()}}
    with (WINDOW/'registration-authorization.json').open('xb') as f:os.fchmod(f.fileno(),0o600);f.write(registration_raw)
    with (WINDOW/'registration-packet.json').open('x') as f:os.fchmod(f.fileno(),0o600);json.dump(packet,f,sort_keys=True);f.write('\n')
    issued={'requestKey':KEY,'authoritySha256':sha(authority_raw),'policySha256':sha(policy_raw),'registrationAuthoritySha256':sha(registration_raw),'startsAt':stamp,'expiresAt':expires,'freshBasisSha256':fresh_basis_pin,'registryBasisSha256':registry_basis_pin,'reviewSha256':review_pin,'registryCASExecuted':False,'diagnosticSubmitted':False}
    with (WINDOW/'ISSUED.json').open('x') as f:json.dump(issued,f,sort_keys=True,indent=2);f.write('\n')
    return issued
