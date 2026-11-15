"""Externally issue only the actual described154-to161 install program's nine fields."""
from pathlib import Path
import hashlib
import json
import re
import sys
import time

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parent.parent
HEX = re.compile('[a-f0-9]{64}')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, pin):
    raw = Path(path).read_bytes()
    assert sha(raw) == pin, path
    return json.loads(raw)


def issue(description_file, description_pin, live_facts_file, live_facts_pin,
          review_file, review_pin, output_directory):
    read(review_file, review_pin)
    d = read(description_file, description_pin)
    live = read(live_facts_file, live_facts_pin)
    assert d['format'] == 'FRESH35_BATCHED161_UPGRADE_PROGRAM_V1'
    assert d['authenticationMode'] == 'EXISTING_FINITE_ADMIN_SESSION_SET_ROLE_OWNER'
    assert d['sessionUser'] == 'erp35_admin_20261110_r3'
    assert d['effectiveUser'] == 'erp35_owner_20261110_r3'
    assert d['ownerLoginRequired'] is False
    assert all(type(d[k]) is str and HEX.fullmatch(d[k]) for k in (
        'programSha256', 'sourceSetSha256', 'targetSha256', 'currentServiceSha256',
        'historicalMetadataTargetSha256', 'predecessorRecordSha256',
        'predecessorCatalogSpecSha256', 'prefixCatalogSpecSha256',
        'successorSourceSetSha256', 'successorCatalogSpecSha256', 'successorModelSha256',
        'dbCandidatePinsSha256', 'installOrderSha256'))
    assert d['predecessorRecordSha256'] == '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'
    assert d['dbCandidatePinsSha256'] == 'dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9'
    assert len(d['steps']) == 13
    assert d['steps'][-1]['sha256'] == '332c0b6b18a434054ba845ff74e386038f31f6347f862835d8e6aeacf3971cd3'
    assert all(d[k] is False for k in ('businessRowsWritten', 'rolesCreated',
                                      'serviceCreated', 'changesOriginalInputTarget'))
    assert live['requestKey'] == 't45-r3-batched-install-20261115-01'
    assert live['service']['serviceKey'] == 't45-first-r3-native-service-start-20261116-28'
    assert live['physical']['systemIdentifier'] == '7706545564479176741'
    assert live['physical']['databaseOid'] == '16393'
    assert live['physical']['serverVersionNum'] == '170011'
    assert d['postmasterStart'] == live['physical']['postmasterStart'] == live['service']['postmasterStart']
    assert d['currentServiceSha256'] == live['currentServiceSha256']
    assert d['sourceSetSha256'] == live['sourceSetSha256']
    assert d['targetSha256'] == live['targetSha256']
    assert d['successorCatalogSpecSha256'] == live['successorCatalogSpecSha256']
    assert d['successorModelSha256'] == live['successorModelSha256']
    assert set(live['batchedCatalog']) == {'sourceSetSha256', 'catalogSpecSha256', 'modelSha256'}
    assert d['successorSourceSetSha256'] == live['batchedCatalog']['sourceSetSha256']
    assert d['successorCatalogSpecSha256'] == live['batchedCatalog']['catalogSpecSha256']
    assert d['successorModelSha256'] == live['batchedCatalog']['modelSha256']
    now = time.time_ns() // 1_000_000
    assert type(d['startsAt']) is type(d['expiresAt']) is int
    assert type(d['backupAdminValidUntil']) is int
    assert d['backupAdminValidUntil'] == live['backupAdminValidUntil']
    assert d['startsAt'] <= now < now + 900_000 < d['expiresAt'] <= d['backupAdminValidUntil']
    assert d['expiresAt'] <= live['actualSharedServiceWorkDeadline']
    authority = dict(format='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1',
                     decision='AUTHORIZE_EXACT_154_TO161_CATALOG_UPGRADE_ONLY',
                     programSha256=d['programSha256'], sourceSetSha256=d['sourceSetSha256'],
                     targetSha256=d['targetSha256'], startsAt=d['startsAt'], expiresAt=d['expiresAt'],
                     independentSafetyReviewSha256=review_pin,
                     authorizationReference='Verified human direct REAL instruction, origin message 01a1df2e-293d-7061-ab16-5b0cc2e0e753; exact current28 finite existing154-to161 catalog program only. No rehearsal or business import authority is created by this file.')
    raw = (json.dumps(authority, sort_keys=True, indent=2) + '\n').encode()
    output = Path(output_directory)
    assert output.parent.resolve() == CONTROL.resolve() and not output.exists()
    output.mkdir(mode=0o700)
    with (output / 'fresh35-batched161-upgrade-v1.json').open('xb') as stream:
        stream.write(raw)
    report = dict(path=str(output / 'fresh35-batched161-upgrade-v1.json'),
                  protectedDestination='/etc/naijue-erp/fresh35-batched161-upgrade-v1.json',
                  sha256=sha(raw), bytes=len(raw), descriptionSha256=description_pin,
                  liveFactsSha256=live_facts_pin, startsAt=d['startsAt'], expiresAt=d['expiresAt'],
                  programSha256=d['programSha256'], serverAction=False)
    with (output / 'ISSUED.json').open('x') as stream:
        json.dump(report, stream, sort_keys=True)
    return report


if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:])))
