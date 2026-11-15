"""Reissue only the expired, unsubmitted restore host input using the reviewed API."""
from pathlib import Path
import hashlib
import json
import os
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTROL = ROOT / 'outputs/主控'
CORE = HERE.parent / 'SERVICE27-FULLCHAIN-02/issue_phase.py'
CORE_SHA = 'd755b54b6ed6f26c5d40545c2477d9e72955a570986daad5b63104b9e4d6bc8d'
RULES = ROOT / 'outputs/T45/revisions/20261116-r3-full-normal-chain27-local-01/CANDIDATE-02/PHASES27.UNISSUED.json'
RULES_SHA = 'b85ed78aeadb85b29d71d5cfdd45e6483e5079371695c96dbc66e4e26b1a8234'
REG = CONTROL / '20261116-r3-direct27-registration-window-01'
ACTUAL = ROOT / 'outputs/T45/revisions/20261116-r3-service27-registration-and-apply-actual-01'
KEY = 't45-r3-ordinary27-auth-restore-20261116-01'
OUTPUT = CONTROL / '20261116-r3-direct-service27-restore-window-02'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, pin):
    raw = path.read_bytes()
    assert sha(raw) == pin, path
    return json.loads(raw)


def build():
    assert sha(CORE.read_bytes()) == CORE_SHA
    api = runpy.run_path(str(CORE), run_name='local_restore_reissue')
    witness = read(RULES, RULES_SHA)
    manifest = read(REG / 'ISSUED.json', '72d59045657758442b43ba0fe67a975a77b450a7bb84ff429dd2e529a2f80be4')
    policy = read(REG / 'direct27-batched-real.json', '89f49225c19c1043e4a4a59c876876972b49abb9d5e0b29bcb699d5d069b2094')
    roles = read(REG / 'roles-authorization.json', '4332d0e4a868fc52f7e5a78c49505aaac4021ab8e48c4ff96251391b9d32c2f6')
    old = read(CONTROL / '20261116-r3-direct-service27-restore-window-01/host-authorization.json',
               '2853199786b4b436055dd679077d093afa4cfce5bbce2949d461154e28dee223')
    start = read(ACTUAL / 'start/READBACK-01.json', '11aeae69a8455cfbe5757ed674a99adc2c15431f10fb239a6d02822a9be132da')
    stopped = read(ACTUAL / 'stop/READBACK-01.json', 'c5ff8d7b0ac6494f401df6fdea0158636c50ce7cbea8438dbfc0f2a6459d7552')
    assert manifest['rulesSha256'] == RULES_SHA
    rule = policy['jobs']['restore']
    assert rule['jobId'] == old['requestKey'] == KEY
    folder = Path(witness['phaseDirectories']['restore'])
    for leaf, pin in rule['bundlePins'].items():
        path = REG / leaf if leaf == 'roles-authorization.json' else folder / leaf
        assert sha(path.read_bytes()) == pin, leaf
    now = time.time_ns() // 1_000_000
    assert old['expiresAt'] < now and policy['startsAt'] <= now < policy['expiresAt']
    os.environ['ERP_SHARED_JOB_ID'] = KEY
    authority = api['preservation_authority']('restore', witness, rule, start, stopped, roles, policy, now)
    assert authority['requestKey'] == KEY
    assert now + rule['timeoutSeconds'] * 1000 < authority['expiresAt'] <= roles['restorationDeadline']
    # The original role authorization and every non-window host field stay identical.
    assert {k: v for k, v in authority.items() if k not in ('startsAt', 'expiresAt')} == {
        k: v for k, v in old.items() if k not in ('startsAt', 'expiresAt')}
    return authority, manifest


def issue(review_path, review_pin, dry_run=False):
    review = read(Path(review_path), review_pin)
    assert review['state'] == 'RESTORE27_SAMEKEY_RESUME_SOURCE_PASS'
    assert review['requestKey'] == KEY
    assert review['mainReissuerSha256'] == sha(Path(__file__).read_bytes())
    authority, manifest = build()
    raw = (json.dumps(authority, sort_keys=True, indent=2) + '\n').encode()
    report = dict(state='RESTORE_ONLY_SAME_KEY_HOST_REISSUED_NO_SERVER_ACTION',
                  path=str(OUTPUT / 'host-authorization.json'), sha256=sha(raw), bytes=len(raw),
                  key=KEY, startsAt=authority['startsAt'], expiresAt=authority['expiresAt'],
                  originalExpiredAuthoritySha256='2853199786b4b436055dd679077d093afa4cfce5bbce2949d461154e28dee223',
                  rolesAuthoritySha256=manifest['rolesSha256'], resumeReviewSha256=review_pin,
                  roleDeadlinesExtended=False, sameKeyFreshReceiverPrecheckRequired=True)
    if dry_run:
        return {**report, 'state': 'DRY_RUN_NO_AUTHORITY_FILES_CREATED'}
    OUTPUT.mkdir(mode=0o700)
    for name, data in [('host-authorization.json', raw),
                       ('ISSUED.json', (json.dumps(report, sort_keys=True, indent=2) + '\n').encode())]:
        with (OUTPUT / name).open('xb') as stream:
            stream.write(data)
    return report


if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:3], dry_run='--dry-run' in sys.argv[3:])))
