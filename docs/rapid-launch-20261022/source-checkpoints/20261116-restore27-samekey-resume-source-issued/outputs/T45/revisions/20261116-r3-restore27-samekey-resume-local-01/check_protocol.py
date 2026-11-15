"""Compare pure transport output with actual original preflight; no root or DB mocks."""
from pathlib import Path
import ast,hashlib,json,runpy
H=Path(__file__).resolve().parent;REPO=H.parents[3]
source=H/'resume_restore27.py';ast.parse(source.read_bytes());api=runpy.run_path(str(source))
actual=REPO/'outputs/T45/revisions/20261116-r3-service27-registration-and-apply-actual-01'
host=(actual/'restore/bundle/host-authorization.json').read_bytes()
assert hashlib.sha256(host).hexdigest()==api['OLD_HOST_SHA']
manifest,request=api['protocol'](host)
expected=json.loads((actual/'restore/receipts/SUBMISSION-PREFLIGHT.json').read_bytes())
assert request==expected and hashlib.sha256(manifest).hexdigest()==expected['manifestSha256']==api['OLD_MANIFEST_SHA']
assert api['request_wire'](request)==json.dumps(expected).encode()
rows=json.loads(manifest)['files'];assert len(rows)==7
for row in rows:
 raw=(actual/'restore/bundle'/row['name']).read_bytes();assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256']
r=dict(state='LOCAL_ORIGINAL_PROTOCOL_MATCH_ONLY',helperSha256=hashlib.sha256(source.read_bytes()).hexdigest(),actualPreflightSha256=hashlib.sha256((actual/'restore/receipts/SUBMISSION-PREFLIGHT.json').read_bytes()).hexdigest(),manifestSha256=hashlib.sha256(manifest).hexdigest(),requestFieldsIdentical=True,originalClientRequestWireIdentical=True,actualSevenBundleMemberRowsMatched=True,serverActions=0,nativeOrDatabaseExecuted=False,rootUidOrClockMocked=False,currentCopySourceIdentityKnown=False)
p=H/'LOCAL-PROTOCOL-CHECK.json';p.write_text(json.dumps(r,sort_keys=True,indent=2)+'\n');print(json.dumps(r))
