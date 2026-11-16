"""Refresh only the time fields of the verified, unpublished start32 authority."""
import hashlib
import json
from pathlib import Path
import runpy
import sys
import time


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTROL = ROOT / 'outputs/主控'
T45 = ROOT / 'outputs/T45/revisions'
ACTUAL = T45 / '20261116-r3-service32-registration-actual-01'
RULES = T45 / '20261116-r3-normal32-install-session-successor-local-01/CANDIDATE-01/PHASES32.UNISSUED.json'
RULES_SHA = '31a8a26901410e5a48dbcb79e06632fa69e2981776cd9d81a6b06b376f4ff180'
ORIGINAL = CONTROL / '20261116-r3-direct-service32-start-window-01/service-start-authorization.json'
ORIGINAL_SHA = 'e435f34b95043f78711b9eab597f0f2988608b5cf338de4d50f22e6c12cbe37b'
REGISTRATION = CONTROL / '20261116-r3-direct32-registration-window-01'
OUT = CONTROL / '20261116-r3-direct-service32-start-samekey-window-02'
KEY = 't45-first-r3-native-service-start-20261116-32'

# Prepare/upload, publish, start, descriptor handoff, install, stop, restore, readbacks.
BUDGET_MS = (60 + 20 + 300 + 120 + 780 + 120 + 300 + 180) * 1000


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(path, pin):
    raw = Path(path).read_bytes()
    assert sha(raw) == pin, path
    return json.loads(raw)


def issue(review_path, review_pin, dry_run=False):
    review = checked(review_path, review_pin)
    assert review['state'] == 'SAME_KEY_START32_RESUME_SOURCE_PASS'
    assert review['requestKey'] == KEY and review['rulesSha256'] == RULES_SHA
    assert review['mainReissuerSha256'] == sha(Path(__file__).read_bytes())
    assert review['originalAuthoritySha256'] == ORIGINAL_SHA
    witness = checked(RULES, RULES_SHA)
    original = checked(ORIGINAL, ORIGINAL_SHA)
    start = checked(ACTUAL/'start/READBACK-01.json',
                    'dc14397b3286bea2afdf2260d0255596c4594ed5709d524e76048a7a79870fa7')
    staged = checked(ACTUAL/'start/ORIGINAL-STAGING-READBACK.json',
                     'b76edcae7b604f51dc51f0880e721639af541bef28e27882da7e749d7d3cd21a')
    apply = checked(ACTUAL/'apply/READBACK-01.json',
                    '5ec66516cb681ac03524c1fed741621c82a6c848b64895c768e98ad39c3ba445')
    assert start['requestKey'] == staged['requestKey'] == original['requestKey'] == KEY
    assert start['requestPresent'] is start['rootJobPresent'] is False
    assert start['pgdataPidAbsent'] is start['noOtherOperationUnits'] is True
    for grant in staged['grants'].values():
        assert all(grant[k] is False for k in ('request','requestTmp','rootJob','publicTerminal'))
    assert len(staged['grants']['b16447fbc81f4d64']['stagedBundleMetadata']) == 9
    assert (apply['terminal']['status'],apply['terminal']['exitCode']) == ('COMPLETED',0)
    assert apply['resultObjectsEqual'] is True
    assert apply['rootPins']['terminal'] == original['applyTerminalSha256']
    assert apply['publicResultSha256'] == original['applyResultSha256']

    issued = json.loads((REGISTRATION/'ISSUED.json').read_bytes())
    assert issued['rulesSha256'] == RULES_SHA
    roles = checked(REGISTRATION/'roles-authorization.json', issued['rolesSha256'])
    policy = checked(REGISTRATION/'direct32-batched-real.json', issued['policySha256'])
    assert policy['jobs']['start'] == witness['jobs']['start']
    assert policy['jobs']['start']['jobId'] == KEY
    assert roles['restorationDeadline'] == issued['restorationDeadline']
    now = time.time_ns() // 1_000_000
    assert policy['startsAt'] <= original['startsAt'] < original['expiresAt'] <= now
    assert now+BUDGET_MS < min(roles['controllerValidUntil'],roles['backupAdminValidUntil'],
                              roles['restorationDeadline'],policy['expiresAt'],original['serviceLeaseExpiresAt']-35000)
    seconds = (original['serviceLeaseExpiresAt'] - now) // 1000
    assert 0 < seconds <= original['maximumServiceSeconds']
    lease = now + seconds * 1000
    assert roles['backupAdminValidUntil'] < lease-35000 < policy['expiresAt']
    expires = min(now+900_000,roles['controllerValidUntil']-120_000)
    assert now+480_000 < expires <= policy['expiresAt']
    renewed = dict(original, startsAt=now, expiresAt=expires, maximumServiceSeconds=seconds,
                   serviceLeaseExpiresAt=lease, capacityExpiresAt=lease)
    proof = Path(witness['phaseDirectories']['start'])/'normal_service05_after08_proof.py'
    assert sha(proof.read_bytes()) == witness['jobs']['start']['bundlePins'][proof.name]
    runpy.run_path(str(proof), run_name='local_authority')['validate_authority'](renewed,now)
    raw = (json.dumps(renewed,sort_keys=True,indent=2)+'\n').encode()
    result = dict(state='DRY_RUN_NO_AUTHORITY_FILE_CREATED' if dry_run else 'ISSUED_UNPUBLISHED_ORIGINAL_START32_INSTALL_ONLY',
                  key=KEY, path=str(OUT/ORIGINAL.name), sha256=sha(raw), bytes=len(raw),
                  startsAt=now, expiresAt=expires, serviceLeaseExpiresAt=lease,
                  originalServiceLeaseExpiresAt=original['serviceLeaseExpiresAt'],
                  originalAuthoritySha256=ORIGINAL_SHA, independentReviewSha256=review_pin,
                  rolesAuthoritySha256=issued['rolesSha256'], policySha256=issued['policySha256'],
                  installationAndCloseoutBudgetSeconds=BUDGET_MS//1000, serverAction=False)
    if not dry_run:
        OUT.mkdir(mode=0o700)
        with (OUT/ORIGINAL.name).open('xb') as stream:
            stream.write(raw)
        with (OUT/'ISSUED.json').open('x') as stream:
            json.dump(result,stream,sort_keys=True)
    print(json.dumps(result,sort_keys=True))


if __name__ == '__main__':
    issue(*sys.argv[1:3], dry_run='--dry-run' in sys.argv[3:])
