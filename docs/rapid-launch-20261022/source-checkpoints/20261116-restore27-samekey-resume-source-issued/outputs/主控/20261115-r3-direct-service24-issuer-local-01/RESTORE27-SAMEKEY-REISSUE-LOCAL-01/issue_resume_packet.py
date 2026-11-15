"""Package the reviewed same-key source continuation; never contacts a server."""
from pathlib import Path
import base64
import hashlib
import json
import os
import runpy
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTROL = ROOT / 'outputs/主控'
SOURCE = ROOT / 'outputs/T45/revisions/20261116-r3-restore27-samekey-resume-local-01'
ACTUAL = ROOT / 'outputs/T45/revisions/20261116-r3-service27-registration-and-apply-actual-01'
HOST_DIR = CONTROL / '20261116-r3-direct-service27-restore-window-02'
OUTPUT = CONTROL / '20261116-r3-restore27-samekey-resume-window-01'
HELPER_SHA = '62fa918b4415653d6765e1862a067419e250d8b03ad42959b5a628c6a1b14eb1'
PINS_SHA = 'b50a6c35af49e8d214dd147559056d6872c40234aa22b281330db73ecffedadf'
KEY = 't45-r3-ordinary27-auth-restore-20261116-01'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pack(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def checked(path, pin):
    raw = path.read_bytes()
    assert sha(raw) == pin, path
    return raw


def inputs(review_path, review_pin):
    review = json.loads(checked(Path(review_path), review_pin))
    assert review['state'] == 'RESTORE27_SAMEKEY_RESUME_SOURCE_PASS'
    assert review['requestKey'] == KEY
    assert review['mainReissuerSha256'] == sha((HERE / 'issue_restore02.py').read_bytes())
    assert review['mainPacketIssuerSha256'] == sha(Path(__file__).read_bytes())
    assert review['resumeHelperSha256'] == HELPER_SHA
    pins = json.loads(checked(SOURCE / 'PINS.json', PINS_SHA))
    for name, pin in pins.items():
        checked(SOURCE / name, pin)
    helper = checked(SOURCE / 'resume_restore27.py', HELPER_SHA)
    api = runpy.run_path(str(SOURCE / 'resume_restore27.py'), run_name='local_packet_metadata')
    carrier = checked(SOURCE / 'carrier.UNISSUED.py', pins['carrier.UNISSUED.py'])
    preflight = checked(ACTUAL / 'restore/receipts/SUBMISSION-PREFLIGHT.json',
                        'e8614b14596bde5fd33a2bb79aba5719a84cb25763ad4869c1c02a98c1e82091')
    basis = json.loads(checked(ROOT / 'outputs/T45/revisions/20261116-r3-service27-registration-basis-local-01/REGISTRATION-BASIS27-20261115T183028Z.json',
                               '8a22b99a3c1aa6dcaaf7e30d7f10edbc83b55c208f5c59d491fa4d44c6957cda'))
    assert api['scope']()['requestKey'] == KEY
    return review, helper, api, carrier, preflight, basis['oldIdentities']['executionLock']


def issue(host_report_path, host_report_pin, review_path, review_pin, dry_run=False):
    _, helper, api, carrier, preflight, lock = inputs(review_path, review_pin)
    host_report_path = Path(host_report_path)
    assert host_report_path.resolve() == HOST_DIR / 'ISSUED.json'
    host_report = json.loads(checked(host_report_path, host_report_pin))
    assert host_report['key'] == KEY and host_report['roleDeadlinesExtended'] is False
    host = checked(HOST_DIR / 'host-authorization.json', host_report['sha256'])
    h = json.loads(host)
    old = json.loads(checked(CONTROL / '20261116-r3-direct-service27-restore-window-01/host-authorization.json',
                             '2853199786b4b436055dd679077d093afa4cfce5bbce2949d461154e28dee223'))
    assert {k: v for k, v in h.items() if k not in ('startsAt', 'expiresAt')} == {
        k: v for k, v in old.items() if k not in ('startsAt', 'expiresAt')}
    manifest, request = api['protocol'](host)
    wire = api['request_wire'](request)
    now = time.time_ns() // 1_000_000
    fixed = api['scope']()
    expiry = min(now + 600_000, h['expiresAt'] - 301_000, fixed['originalRestorationDeadline'])
    assert h['startsAt'] <= now and now + 120_000 < expiry
    prep = dict(fixed, startsAt=now, expiresAt=expiry, sourceSha256=HELPER_SHA,
                executionLockIdentity=lock, hostAuthoritySha256=sha(host),
                manifestSha256=sha(manifest), requestSha256=sha(wire),
                oldPreflightSha256=sha(preflight), independentReviewSha256=review_pin,
                authorizationReference='Human standing consent and active ERP launch goal; exact unsubmitted restore27 control package only; original key, role deadlines and receiver admission retained.')
    prep_raw = pack(prep)
    for marker, value in [(b'PENDING_HELPER_SHA256', HELPER_SHA.encode()),
                          (b'PENDING_PREPARATION_SHA256', sha(prep_raw).encode()),
                          (b'STARTS=0', ('STARTS=' + str(now)).encode()),
                          (b'EXPIRES=0', ('EXPIRES=' + str(expiry)).encode())]:
        assert carrier.count(marker) == 1
        carrier = carrier.replace(marker, value)
    compile(carrier, 'issued_restore27_resume_carrier', 'exec')
    b64 = lambda raw: base64.b64encode(raw).decode()
    envelope = pack(dict(source=b64(helper), packet=dict(preparationAuthority=b64(prep_raw),
                                                       hostAuthority=b64(host), oldPreflight=b64(preflight))))
    assert len(helper) <= 32768 and len(envelope) <= 262144
    report = dict(state='ISSUED_RESTORE27_SAMEKEY_RESUME_NO_SERVER_ACTION',
                  directory=str(OUTPUT), key=KEY, startsAt=now, expiresAt=expiry,
                  helperSha256=HELPER_SHA, carrierSha256=sha(carrier), envelopeSha256=sha(envelope),
                  preparationAuthoritySha256=sha(prep_raw), hostAuthoritySha256=sha(host),
                  manifestSha256=sha(manifest), requestSha256=sha(wire),
                  oldPreflightSha256=sha(preflight), independentReviewSha256=review_pin,
                  hostReportSha256=host_report_pin, sourceIdentityKnownBeforeExecution=False,
                  roleDeadlinesExtended=False, originalReceiverAdmissionRequired=True)
    if dry_run:
        return {**report, 'state': 'DRY_RUN_NO_RESUME_PACKET_FILES_CREATED'}
    OUTPUT.mkdir(mode=0o700)
    for name, raw in [('preparation-authorization.json', prep_raw), ('envelope.json', envelope),
                      ('carrier.ISSUED.py', carrier), ('NEW-MANIFEST.json', manifest),
                      ('NEW-REQUEST.json', wire), ('ISSUED.json', pack(report))]:
        with os.fdopen(os.open(OUTPUT / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as stream:
            stream.write(raw)
    return report


if __name__ == '__main__':
    print(json.dumps(issue(*sys.argv[1:5], dry_run='--dry-run' in sys.argv[5:])))
