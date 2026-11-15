"""Issue the reviewed existing CAS packet for the seven fixed direct REAL jobs."""
from datetime import datetime, timezone
from pathlib import Path
import base64
import hashlib
import json
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
T45 = ROOT / 'outputs/T45/revisions'
AUTHORITY = ROOT / 'outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json'
AUTHORITY_SHA = '836d9281a81ca798eb6a989112012508a8e0696c58cf2d9ae44c186563786fc0'
REFERENCE = ('Human direct REAL import instruction, origin chat 01a19f9f-97b5-7f81-b1ea-5479df73b469 '
             'message 01a1df2e-293d-7061-ab16-5b0cc2e0e753, verified by main; '
             'approved existing batch and same private T45 channel, no rehearsal gate. '
             'Source outputs/主控/20261115-r3-direct-real-import-route-01/USER-AUTHORITY.json')


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
    human = json.loads(checked(AUTHORITY, AUTHORITY_SHA))
    assert human['messageId'] == '01a1df2e-293d-7061-ab16-5b0cc2e0e753'
    assert human['originThreadId'] == '01a19f9f-97b5-7f81-b1ea-5479df73b469'
    witness = json.loads(checked(rule_file, rules_pin))
    basis = json.loads(checked(basis_file, basis_pin))
    cas_path = HERE / 'register_cas.py'
    cas = runpy.run_path(str(cas_path), run_name='local_authority')
    jobs = cas['JOBS']
    assert set(witness['jobs']) == set(witness['phaseDirectories']) == set(jobs)
    assert witness['externallyIssuedStaticLeaves'] == {
        'apply': ['roles-authorization.json'], 'restore': ['roles-authorization.json']}
    rules = json.loads(json.dumps(witness['jobs']))
    folders = {}
    for phase, rule in rules.items():
        assert rule['jobId'] == jobs[phase]
        folder = Path(witness['phaseDirectories'][phase]).resolve(strict=True)
        assert folder.is_relative_to(T45.resolve()) and folder.name == 'bundle', folder
        folders[phase] = folder
        assert len(rule['bundlePins']) < 127
        for leaf, pin in rule['bundlePins'].items():
            assert Path(leaf).name == leaf
            checked(folder / leaf, pin)

    assert witness['materializationAlreadyCompleted'] is True and witness['materializeNeverResubmit'] is True
    assert witness['materializationAlreadyCompletedOperatorReadySha256'] == 'cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec'
    assert witness['materializationReusedFromKey'] == jobs['materialize']
    assert basis['acceptedMaterializationSha256'] == witness['materializationAlreadyCompletedOperatorReadySha256']
    assert basis['basisMismatches'] == [] and basis['executionLockMatches'] is True
    assert basis['activeOperationUnits'] == basis['presentCandidateKeys'] == []
    assert set(basis['candidateKeys']) >= set(jobs.values()) - {jobs['materialize']}
    assert basis['actualPins'][str(cas['P'] / 'admin_exec.py')] == cas['OLD_DISPATCHER']
    now = time.time_ns() // 1_000_000
    captured = int(datetime.fromisoformat(basis['checkedAtUTC']).timestamp() * 1000)
    assert 0 <= now - captured <= 900_000, 'fresh real CAS basis required'
    assert set(basis['oldIdentities']) == {str(p) for p in cas['BASIS']} | {'executionLock'}
    assert all(basis['actualPins'][str(p)] == pin for p, pin in cas['BASIS'].items())
    assert basis['oldIdentities']['executionLock'] == cas['LOCK_ID']

    role_file = folders['apply'] / 'ordinary05_roles.py'
    host_file = folders['apply'] / 'ordinary05_roles_job.py'
    assert (folders['restore'] / role_file.name).read_bytes() == role_file.read_bytes()
    assert (folders['restore'] / host_file.name).read_bytes() == host_file.read_bytes()
    role = runpy.run_path(str(role_file), run_name='local_authority')
    host = runpy.run_path(str(host_file), run_name='local_authority')
    roles = dict(role['scope'](), startsAt=now, expiresAt=now + 1_800_000,
                 controllerValidUntil=now + 5_400_000, backupAdminValidUntil=now + 5_520_000,
                 restorationDeadline=now + 6_900_000, authorizationReference=REFERENCE,
                 rolesSourceSha256=sha(role_file.read_bytes()), independentReviewSha256=review_pin)
    role['validate'](roles, now)
    role_raw = encode(roles)
    host_authority = dict(host['scope']('apply'), startsAt=now, expiresAt=roles['expiresAt'],
                          authorizationReference=REFERENCE, independentReviewSha256=review_pin,
                          rolesAuthoritySha256=sha(role_raw), rolesSourceSha256=roles['rolesSourceSha256'],
                          hostSourceSha256=sha(host_file.read_bytes()))
    host['validate'](host_authority, 'apply', now)
    for phase in ('apply', 'restore'):
        assert 'roles-authorization.json' not in rules[phase]['bundlePins']
        rules[phase]['bundlePins']['roles-authorization.json'] = sha(role_raw)
    policy = dict(format='T45_R3_DIRECT26_BATCHED_REAL_V1', grantId=cas['GRANT'],
                  startsAt=now, expiresAt=now + 7_200_000, jobs=rules)
    cas['validate_policy_delta'](policy, {'grantId': cas['GRANT']})
    files = {'module': (HERE / 'r3_direct26_batched.py').read_bytes(),
             'policy': encode(policy),
             'dispatcherTemplate': (HERE / 'admin_exec.DIRECT26-UNREGISTERED.py').read_bytes()}
    dispatcher = cas['render_dispatcher'](files)
    registration = dict(cas['scope'](), sourceSha256=sha(cas_path.read_bytes()),
                        sourcePins={key: sha(data) for key, data in files.items()},
                        oldIdentities=basis['oldIdentities'], startsAt=now, expiresAt=now + 900_000,
                        authorizationReference=REFERENCE, independentReviewSha256=review_pin)
    registration_raw = encode(registration)
    carrier = (HERE / 'original-cas-direct26-carrier.UNISSUED.py').read_bytes()
    assert ("SOURCE='" + registration['sourceSha256'] + "'").encode() in carrier
    for name, value in (('AUTH_SHA_LITERAL', repr(sha(registration_raw))),
                        ('AUTH_START_LITERAL', str(now)),
                        ('AUTH_EXPIRES_LITERAL', str(registration['expiresAt']))):
        assert carrier.count(name.encode()) == 1
        carrier = carrier.replace(name.encode(), value.encode())
    compile(carrier, 'root-carrier', 'exec')
    b64 = lambda data: base64.b64encode(data).decode()
    packet = {'source': b64(cas_path.read_bytes()),
              'packet': {'authorization': b64(registration_raw),
                         'files': {name: b64(data) for name, data in files.items()}}}
    report = dict(state='ISSUED_EXACT_ROOT03_SUCCESSOR_REGISTRATION_NO_SERVER_ACTION',
                  directory=str(Path(output_directory).resolve()), startsAt=now,
                  registrationExpiresAt=registration['expiresAt'], roleApplyExpiresAt=roles['expiresAt'],
                  controllerValidUntil=roles['controllerValidUntil'],
                  backupAdminValidUntil=roles['backupAdminValidUntil'],
                  restorationDeadline=roles['restorationDeadline'], policyExpiresAt=policy['expiresAt'],
                  sourceAuthoritySha256=AUTHORITY_SHA, rulesSha256=rules_pin, basisSha256=basis_pin,
                  independentReviewSha256=review_pin, rolesSha256=sha(role_raw),
                  applyHostSha256=sha(encode(host_authority)), policySha256=sha(files['policy']),
                  dispatcherSha256=sha(dispatcher), registrationSha256=sha(registration_raw),
                  carrierSha256=sha(carrier), jobs=jobs, phaseSubmitted=False)
    if dry_run:
        return {**report, 'dryRun': True, 'state': 'DRY_RUN_NO_AUTHORITY_FILE_CREATED'}
    output = Path(output_directory)
    assert output.parent.resolve() == (ROOT/'outputs/主控').resolve() and not output.exists()
    output.mkdir(mode=0o700)
    for name, data in (
        ('roles-authorization.json', role_raw), ('host-authorization.json', encode(host_authority)),
        ('registration-authorization.json', registration_raw),
        ('registration-envelope.json', encode(packet)),
        ('original-cas-direct26-carrier.ISSUED.py', carrier),
        ('direct26-batched-real.json', files['policy']), ('admin_exec.ISSUED.py', dispatcher),
        ('ISSUED.json', encode(report))):
        with (output / name).open('xb') as stream:
            stream.write(data)
    return report


if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:8], dry_run='--dry-run' in sys.argv[8:])))
