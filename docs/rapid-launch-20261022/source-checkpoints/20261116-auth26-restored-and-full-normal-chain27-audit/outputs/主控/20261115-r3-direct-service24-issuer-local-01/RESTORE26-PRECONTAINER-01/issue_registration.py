"""Issue only the exact unsubmitted restore26 rule repair, retaining all clocks."""
from datetime import datetime
from pathlib import Path
import base64
import hashlib
import json
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTROL = ROOT / 'outputs/主控'
T45 = ROOT / 'outputs/T45/revisions'
ORIGINAL = CONTROL / '20261116-r3-direct26-registration-window-01'
ROLE_SHA = 'ded926b105af374beec177489926c49a0fe3778565516926a63fb317f3037ee6'
POLICY_SHA = 'ed27c318bdca44ff22250361b4b478f07ee87575119e771e707c8186dfadea59'
HUMAN_SHA = '836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0'
REFERENCE = ('Existing verified human direct REAL instruction 01a1df2e-293d-7061-ab16-5b0cc2e0e753 '
             'and standing controlled-operation authority; exact failed-start26 before-container '
             'restoration only. Original finite role lifetime and other phase identities unchanged.')

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()

def checked(path, pin):
    raw = Path(path).read_bytes()
    assert sha(raw) == pin, path
    return raw

def issue(rule_file, rules_pin, review_file, review_pin, basis_file, basis_pin,
          output_directory, dry_run=False):
    checked(review_file, review_pin)
    human = json.loads(checked(CONTROL/'20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json', HUMAN_SHA))
    assert human['messageId'] == '01a1df2e-293d-7061-ab16-5b0cc2e0e753'
    witness = json.loads(checked(rule_file, rules_pin))
    basis = json.loads(checked(basis_file, basis_pin))
    cas_path = HERE/'register_cas.py'
    cas = runpy.run_path(str(cas_path), run_name='local_authority')
    previous = json.loads(checked(ORIGINAL/'direct26-batched-real.json', POLICY_SHA))
    roles_raw = checked(ORIGINAL/'roles-authorization.json', ROLE_SHA)
    roles = json.loads(roles_raw)
    rules = json.loads(json.dumps(witness['jobs']))
    assert set(rules) == set(witness['phaseDirectories']) == set(cas['JOBS'])
    for phase, rule in rules.items():
        assert rule['jobId'] == cas['JOBS'][phase]
        folder = Path(witness['phaseDirectories'][phase]).resolve(strict=True)
        assert folder.is_relative_to(T45.resolve()) and folder.name == 'bundle'
        for leaf, pin in rule['bundlePins'].items():
            assert Path(leaf).name == leaf
            checked(folder/leaf, pin)
    for phase in ('apply', 'restore'):
        assert 'roles-authorization.json' not in rules[phase]['bundlePins']
        rules[phase]['bundlePins']['roles-authorization.json'] = ROLE_SHA
    policy = {**previous, 'jobs': rules}
    cas['validate_policy_delta'](policy, previous)
    cas['validate_restore_only'](policy, previous)
    assert basis['basisMismatches'] == [] and basis['executionLockMatches'] is True
    assert basis['activeOperationUnits'] == basis['presentUnsubmittedKeys'] == []
    assert set(basis['oldIdentities']) == {str(p) for p in cas['BASIS']} | {'executionLock'}
    assert all(basis['actualPins'][str(p)] == pin for p, pin in cas['BASIS'].items())
    assert basis['oldIdentities']['executionLock'] == cas['LOCK_ID']
    now = time.time_ns() // 1_000_000
    captured = int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp()*1000)
    assert 0 <= now-captured <= 900_000
    assert previous['startsAt'] <= now < roles['restorationDeadline'] < previous['expiresAt']
    files = {'module': (HERE/'r3_direct26_restore_precontainer.py').read_bytes(),
             'policy': encode(policy),
             'dispatcherTemplate': (HERE/'admin_exec.RESTORE26-UNREGISTERED.py').read_bytes()}
    dispatcher = cas['render_dispatcher'](files)
    registration = dict(cas['scope'](), sourceSha256=sha(cas_path.read_bytes()),
                        sourcePins={k:sha(v) for k,v in files.items()}, oldIdentities=basis['oldIdentities'],
                        startsAt=now, expiresAt=min(now+900_000, roles['restorationDeadline']),
                        authorizationReference=REFERENCE, independentReviewSha256=review_pin)
    assert now+300_000 < registration['expiresAt']
    registration_raw = encode(registration)
    carrier = (HERE/'original-cas-restore26-carrier.UNISSUED.py').read_bytes()
    assert ("SOURCE='"+registration['sourceSha256']+"'").encode() in carrier
    for name,value in (('AUTH_SHA_LITERAL',repr(sha(registration_raw))),
                       ('AUTH_START_LITERAL',str(now)),('AUTH_EXPIRES_LITERAL',str(registration['expiresAt']))):
        assert carrier.count(name.encode()) == 1
        carrier = carrier.replace(name.encode(),value.encode())
    compile(carrier, 'restore26-carrier', 'exec')
    b64 = lambda raw:base64.b64encode(raw).decode()
    packet = {'source':b64(cas_path.read_bytes()),'packet':{'authorization':b64(registration_raw),
              'files':{name:b64(raw) for name,raw in files.items()}}}
    report = dict(state='ISSUED_EXACT_RESTORE26_PRECONTAINER_RULE_ONLY_NO_SERVER_ACTION',
                  startsAt=now,registrationExpiresAt=registration['expiresAt'],
                  policyExpiresAt=previous['expiresAt'],restorationDeadline=roles['restorationDeadline'],
                  rolesSha256=ROLE_SHA,rolesLifetimeExtended=False,rulesSha256=rules_pin,
                  basisSha256=basis_pin,independentReviewSha256=review_pin,
                  policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),
                  moduleSha256=sha(files['module']),registrationSha256=sha(registration_raw),
                  carrierSha256=sha(carrier),phaseSubmitted=False)
    if dry_run:
        return {**report,'state':'DRY_RUN_NO_AUTHORITY_FILE_CREATED','dryRun':True}
    output = Path(output_directory)
    assert output.parent.resolve() == CONTROL.resolve() and not output.exists()
    output.mkdir(mode=0o700)
    for name,raw in (('roles-authorization.json',roles_raw),('direct26-batched-real.json',files['policy']),
                     ('registration-authorization.json',registration_raw),('registration-envelope.json',encode(packet)),
                     ('original-cas-restore26-carrier.ISSUED.py',carrier),('admin_exec.ISSUED.py',dispatcher),
                     ('ISSUED.json',encode(report))):
        with (output/name).open('xb') as stream:
            stream.write(raw)
    return report

if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:8],dry_run='--dry-run' in sys.argv[8:])))
