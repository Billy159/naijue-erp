"""Package the reviewed, unchanged-key upload continuation locally."""
import base64
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
SOURCE = T45 / '20261116-r3-start32-samekey-resume-local-01'
PHASE = T45 / '20261116-r3-normal32-install-session-successor-local-01/CANDIDATE-01/start/bundle'
ORIGINAL = CONTROL / '20261116-r3-direct-service32-start-window-01/service-start-authorization.json'
NEW = CONTROL / '20261116-r3-direct-service32-start-samekey-window-02'
PREFLIGHT = T45 / '20261116-r3-service32-registration-actual-01/start/SUBMISSION-PREFLIGHT.json'
OUT = CONTROL / '20261116-r3-start32-samekey-resume-window-01'
PINS_SHA = '13f5a4b8499438a72459b2453cbacfaba994746a8b3f1402577b5c4a58f88e16'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(path, pin):
    raw = Path(path).read_bytes()
    assert sha(raw) == pin, path
    return raw


def pack(value):
    return (json.dumps(value,sort_keys=True,indent=2)+'\n').encode()


def issue(review_path, review_pin):
    review = json.loads(checked(review_path, review_pin))
    assert review['state'] == 'SAME_KEY_START32_RESUME_SOURCE_PASS'
    assert review['mainPacketIssuerSha256'] == sha(Path(__file__).read_bytes())
    pins = json.loads(checked(SOURCE/'PINS.json', PINS_SHA))
    for leaf, pin in pins.items():
        assert Path(leaf).name == leaf
        checked(SOURCE/leaf, pin)
    helper = checked(SOURCE/'resume_start32.py', pins['resume_start32.py'])
    assert review['resumeHelperSha256'] == sha(helper)
    api = runpy.run_path(str(SOURCE/'resume_start32.py'),run_name='local_source_helpers_only')
    render = runpy.run_path(str(SOURCE/'run_resume_once.py'),run_name='local_source_helpers_only')['render_carrier']
    assert review['requestKey'] == api['KEY']
    old = checked(ORIGINAL,api['OLD_HOST_SHA'])
    preflight = checked(PREFLIGHT,api['OLD_PREFLIGHT_SHA'])
    report = json.loads((NEW/'ISSUED.json').read_bytes())
    assert report['state'] == 'ISSUED_UNPUBLISHED_ORIGINAL_START32_INSTALL_ONLY'
    assert report['key'] == api['KEY'] and report['independentReviewSha256'] == review_pin
    host = checked(NEW/ORIGINAL.name,report['sha256'])
    manifest, request = api['protocol'](host)
    request_raw = api['wire'](request)
    now = time.time_ns() // 1_000_000
    expiry = min(now+300_000, report['expiresAt']-300_000,
                 api['CONTROLLER_UNTIL']-api['RESERVE_MILLISECONDS']-1000)
    assert now+120_000 < expiry
    authority = dict(api['scope'](), startsAt=now, expiresAt=expiry, sourceSha256=sha(helper),
                     hostAuthoritySha256=sha(host), manifestSha256=sha(manifest), requestSha256=sha(request_raw),
                     independentReviewSha256=review_pin,
                     authorizationReference='Approved ERP launch. Complete only the verified unpublished start32 upload under its original key. Retain all existing files and the original dispatcher. Scope is the database installation and closeout.')
    authority_raw = pack(authority)
    b64 = lambda raw:base64.b64encode(raw).decode()
    missing = {}
    for leaf, (size, pin) in api['MISSING'].items():
        raw = checked(PHASE/leaf,pin)
        assert len(raw) == size
        missing[leaf] = b64(raw)
    packet = dict(preparationAuthority=b64(authority_raw), oldHostAuthority=b64(old), hostAuthority=b64(host),
                  oldPreflight=b64(preflight), missing=missing)
    parsed, _, _, after, _, _, reconstructed, final_request = api['protocol_check'](packet,sha(authority_raw))
    assert parsed == authority and reconstructed == manifest and api['wire'](final_request) == request_raw
    api['validate_time'](parsed,after,time.time_ns()//1_000_000)
    carrier = render(sha(helper),sha(authority_raw),now,expiry)
    compile(carrier,'issued_start32_prepare_carrier','exec')
    envelope = pack(dict(source=b64(helper),packet=packet))
    assert 0 < len(envelope) <= 262144
    issue_report = dict(state='ISSUED_UNPUBLISHED_START32_EXACT_UPLOAD_CONTINUATION_NO_SERVER_ACTION',
                        requestKey=api['KEY'],directory=str(OUT),startsAt=now,expiresAt=expiry,
                        helperSha256=sha(helper),preparationAuthoritySha256=sha(authority_raw),
                        carrierSha256=sha(carrier),envelopeSha256=sha(envelope),hostAuthoritySha256=sha(host),
                        manifestSha256=sha(manifest),requestSha256=sha(request_raw),serverAction=False)
    OUT.mkdir(mode=0o700)
    for leaf, raw in (('preparation-authorization.json',authority_raw),('envelope.json',envelope),
                      ('NEW-MANIFEST.json',manifest),('NEW-REQUEST.json',request_raw),
                      ('carrier.ISSUED.py',carrier),('ISSUED.json',pack(issue_report))):
        with (OUT/leaf).open('xb') as stream:
            stream.write(raw)
    print(json.dumps(issue_report,sort_keys=True))


if __name__ == '__main__':
    issue(*sys.argv[1:])
