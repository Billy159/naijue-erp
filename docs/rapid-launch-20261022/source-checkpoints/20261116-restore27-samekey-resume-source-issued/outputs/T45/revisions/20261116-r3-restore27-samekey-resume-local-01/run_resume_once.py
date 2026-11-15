"""One exact issued packet through the existing forty-second private channel."""
from pathlib import Path
from datetime import datetime,timezone
import base64,hashlib,json,runpy,shlex,sys
H=Path(__file__).resolve().parent;REPO=H.parents[3]
def sha(raw):return hashlib.sha256(raw).hexdigest()
issued,expected,destination=sys.argv[1:];issued=Path(issued);destination=Path(destination)
assert issued.resolve()==issued and issued.is_relative_to(REPO/'outputs/主控')
assert destination.resolve()==destination and destination.is_relative_to(REPO/'outputs/T45')
b=(issued/'ISSUED.json').read_bytes();assert sha(b)==expected;a=json.loads(b)
carrier=(issued/'carrier.ISSUED.py').read_bytes();envelope=(issued/'envelope.json').read_bytes();e=json.loads(envelope)
assert sha(carrier)==a['carrierSha256'] and sha(envelope)==a['envelopeSha256']
assert sha(base64.b64decode(e['source'],validate=True))==a['helperSha256']==sha((H/'resume_restore27.py').read_bytes())
assert sha(base64.b64decode(e['packet']['preparationAuthority'],validate=True))==a['preparationAuthoritySha256']
assert sha(base64.b64decode(e['packet']['hostAuthority'],validate=True))==a['hostAuthoritySha256']
assert sha(base64.b64decode(e['packet']['oldPreflight'],validate=True))=='e8614b14596bde5fd33a2bb79aba5719a84cb25763ad4869c1c02a98c1e82091'
client=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py';assert sha(client.read_bytes())=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']();assert cfg['grantId']=='b16447fbc81f4d64'
destination.mkdir(mode=0o700)
with (destination/'EXECUTION-ATTEMPT.json').open('x') as f:json.dump(dict(utc=datetime.now(timezone.utc).isoformat(),issuedSha256=expected,carrierSha256=a['carrierSha256'],envelopeSha256=a['envelopeSha256'],once=True),f);f.write('\n')
try:
 raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',carrier.decode()]),envelope)
 value=json.loads(raw);proof=dict(state='ORIGINAL_CARRIER_REPLY',result=value)
except Exception as error:proof=dict(state='ENTRY_OR_DISPATCH_UNKNOWN_READ_ORIGINAL_ONLY',exceptionClass=type(error).__name__,automaticReplay=False)
(destination/'ENTRY-RESULT.json').write_text(json.dumps(proof,sort_keys=True,indent=2)+'\n')
print(json.dumps(proof));raise SystemExit(0 if proof.get('result',{}).get('state')=='ORIGINAL_DISPATCHER_RETURNED_QUEUED' else 2)
