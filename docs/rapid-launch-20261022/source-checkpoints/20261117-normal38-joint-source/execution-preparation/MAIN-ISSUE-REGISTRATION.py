"""Prepared Main-only original seven-argument call. Not run by T45."""
from pathlib import Path
import hashlib,json,runpy
HERE=Path(__file__).resolve().parent
REPO=HERE.parent.parents[3]
ROOT=REPO/'outputs/D1/20261117-r3-normal38-root-source-02'
REVIEWS=REPO/'outputs/QB/20261117-r3-normal38-joint-review-01'
BASIS=HERE/'ACTUAL-REGISTRATION-BASIS.json'
OUTPUT=REPO/'outputs/主控/20261117-r3-normal38-registration-window-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def issue_by_main_only():
    assert sha(ROOT/'SOURCE-PINS.json')=='6590c4bfd1bbbf1f370da7b9181119b1ea9dc1f1ac5a73f267753150f07b5ff7'
    assert not OUTPUT.exists()
    root=REVIEWS/'RESULT.json';consumer=REVIEWS/'CONSUMER-RESULT.json'
    # Actual reviewed files and actual fresh server evidence must exist. No
    # placeholders or synthetic positive authority is accepted here.
    args=(str(root),sha(root),str(BASIS),sha(BASIS),str(OUTPUT),str(consumer),sha(consumer))
    return runpy.run_path(str(ROOT/'issue_registration.py'),run_name='main_original_issuer')['issue'](*args)

if __name__=='__main__':
    print(json.dumps(issue_by_main_only(),sort_keys=True))
