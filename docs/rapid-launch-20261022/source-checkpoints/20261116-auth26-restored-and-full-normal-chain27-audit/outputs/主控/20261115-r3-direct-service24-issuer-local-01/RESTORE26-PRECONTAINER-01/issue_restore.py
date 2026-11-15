"""Issue only actual FAILED start26 before-container authentication restoration."""
from pathlib import Path
import hashlib
import json
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parent.parent
START = 't45-first-r3-native-service-start-20261116-26'
TERMINAL = '853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39'
RESULT = '5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca'
ROLE_SHA = 'ded926b105af374beec177489926c49a0fe3778565516926a63fb317f3037ee6'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def checked(path,pin):
    raw = Path(path).read_bytes()
    assert sha(raw) == pin,path
    return json.loads(raw)

def issue(rules_file,rules_pin,registration_directory,failed_file,failed_pin,
          boundary_file,boundary_pin,review_file,review_pin,output_directory):
    checked(review_file,review_pin)
    witness = checked(rules_file,rules_pin)
    registration = Path(registration_directory).resolve()
    assert registration.parent == CONTROL.resolve()
    manifest = json.loads((registration/'ISSUED.json').read_bytes())
    assert manifest['rulesSha256'] == rules_pin
    assert manifest['independentReviewSha256'] == review_pin
    policy = checked(registration/'direct26-batched-real.json',manifest['policySha256'])
    roles = checked(registration/'roles-authorization.json',ROLE_SHA)
    assert manifest['rolesSha256'] == ROLE_SHA and manifest['rolesLifetimeExtended'] is False
    failed = checked(failed_file,failed_pin)
    terminal,result = failed['terminal'],failed['result']
    assert terminal['jobId'] == result['requestKey'] == START
    assert (terminal['status'],terminal['exitCode'],terminal['phaseStarted']) == ('FAILED',2,True)
    assert failed['rootPins']['terminal'] == TERMINAL and failed['rootPins']['result'] == RESULT
    assert failed['resultObjectsEqual'] is True and failed['pgdataPidAbsent'] is True
    assert result['safeCode'] == 'FileExistsError'
    boundary = checked(boundary_file,boundary_pin)
    assert boundary['requestKey'] == START
    assert boundary['activeOperationUnits'] == boundary['start26OwnedContainers'] == []
    assert boundary['postmasterPidAbsent'] and boundary['targetPortAbsent']
    assert boundary['proofPresent'] is False and boundary['restoreMarkerPresent'] is False
    assert boundary['dataIdentity'] == [66304,13502421,61035,61035,448]
    assert set(boundary['bootChildren']) == set(['authority-61035', 'batched161-run.mjs', 'fresh35-production-carrier.py', 'launchers-61035', 'materialize-r3-r2.py', 'materialized-profile.json', 'normal_service05_after08.py', 'normal_service05_after08_proof.py', 'operator-host.mjs', 'operator-manifest.json', 'operator-stream-import-cli.mjs', 'operator-stream-program.mjs', 'r3_05_readonly.py', 'readonly-mount-plan.json', 'service-start-authorization.json'])
    assert not boundary['normal-service-intent.json']['present']
    assert not boundary['normal-service-incomplete.json']['present']
    original = boundary['normal-service-result.json']
    assert original['rootSha256'] == RESULT and original['objectsEqual'] is True
    assert original['publicSha256'] == failed['publicResultSha256']
    assert original['result'] == result
    rule = policy['jobs']['restore']
    assert rule['jobId'] == 't45-r3-ordinary26-auth-restore-20261116-01'
    folder = Path(witness['phaseDirectories']['restore']).resolve(strict=True)
    assert folder.is_relative_to((CONTROL.parent/'T45/revisions').resolve()) and folder.name == 'bundle'
    for leaf,pin in rule['bundlePins'].items():
        raw = (registration/leaf).read_bytes() if leaf == 'roles-authorization.json' else (folder/leaf).read_bytes()
        assert sha(raw) == pin
    host_file = folder/rule['script']
    host = runpy.run_path(str(host_file),run_name='local_authority')
    now = time.time_ns()//1_000_000
    expiry = min(now+900_000,roles['restorationDeadline'],policy['expiresAt'])
    assert policy['startsAt'] <= now and now+300_000 < expiry
    authority = dict(host['scope']('restore'),service=None,writerTerminalSha256=None,
                     policySha256=None,stopRequestKey=START,stopTerminalSha256=TERMINAL,
                     stopResultSha256=RESULT,stopCleanupSha256=None,
                     startsAt=now,expiresAt=expiry,
                     authorizationReference='Verified human direct authority 01a1df2e-293d-7061-ab16-5b0cc2e0e753; restore original two-role auth after exact start26 failure before container creation. No fabricated stop or cleanup receipt; preserve original failed job and partial boot.',
                     independentReviewSha256=review_pin,rolesAuthoritySha256=ROLE_SHA,
                     rolesSourceSha256=rule['bundlePins']['ordinary05_roles.py'],
                     hostSourceSha256=sha(host_file.read_bytes()))
    host['validate'](authority,'restore',now)
    raw = (json.dumps(authority,sort_keys=True,indent=2)+'\n').encode()
    output = Path(output_directory)
    assert output.parent.resolve() == CONTROL.resolve() and not output.exists()
    output.mkdir(mode=0o700)
    with (output/'host-authorization.json').open('xb') as stream:
        stream.write(raw)
    report = dict(path=str(output/'host-authorization.json'),sha256=sha(raw),
                  bytes=len(raw),key=rule['jobId'],startsAt=now,expiresAt=expiry,
                  failedReadbackSha256=failed_pin,boundarySha256=boundary_pin,
                  sourceReviewSha256=review_pin,stopCleanupSha256=None,
                  rolesLifetimeExtended=False,serverAction=False)
    with (output/'ISSUED.json').open('x') as stream:
        json.dump(report,stream,sort_keys=True)
    return report

if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:])))
