from pathlib import Path
from datetime import datetime, timezone
import base64
import hashlib
import json
import os
import runpy
import shlex
import subprocess
import sys
import time

basis, authority_pin, carrier_pin, policy_pin, destination = sys.argv[1:]
basis, destination = map(Path, (basis, destination))
def sha(raw): return hashlib.sha256(raw).hexdigest()
def read(name): return (basis/name).read_bytes()
def unpack(raw): return base64.b64decode(raw, validate=True)

cas=read('registration-authorization.json')
carrier=read('original-cas-restore26-carrier.ISSUED.py')
envelope=read('registration-envelope.json')
policy=read('direct26-batched-real.json')
assert list(map(sha,(cas,carrier,policy)))==[authority_pin,carrier_pin,policy_pin]
a=json.loads(cas); e=json.loads(envelope)
assert unpack(e['packet']['authorization'])==cas and sha(unpack(e['source']))==a['sourceSha256']
assert {k:sha(unpack(b))for k,b in e['packet']['files'].items()}==a['sourcePins']
assert unpack(e['packet']['files']['policy'])==policy
n=time.time_ns()//1_000_000
assert a['startsAt']<=n and n+30000<a['expiresAt'] and n+900000<json.loads(policy)["expiresAt"]
client=Path('../monitor/normal-admission-20261112-01/admin_client.py')
assert sha(client.read_bytes())=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
cfg=runpy.run_path(str(client))['state']()
assert cfg['grantId']=='b16447fbc81f4d64'
os.umask(0o077)
destination.mkdir()
with (destination/'EXECUTION-ATTEMPT.json').open('x') as f:
  json.dump(dict(utc=datetime.now(timezone.utc).isoformat(),authoritySha256=authority_pin,carrierSha256=carrier_pin,policySha256=policy_pin,once=True),f)
  f.write('\n');f.flush();os.fsync(f.fileno())
args=['/usr/bin/ssh','-i',cfg['keyFile'],'-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','BatchMode=yes','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',cfg['host']]
command=shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',carrier.decode()])
try:
    r=subprocess.run(args+[command],input=envelope,capture_output=True,timeout=50)
    result=json.loads(r.stdout) if r.stdout.strip() else {}
    proof=dict(returncode=r.returncode,result=result,stderrBytes=len(r.stderr))
except (ValueError,subprocess.TimeoutExpired) as problem:
    proof=dict(status='CAS_RESPONSE_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY',exceptionClass=type(problem).__name__)
if proof.get('returncode'):
    lines = r.stderr.decode(errors='replace').splitlines()
    import re
    proof['safeError'] = next((v for v in reversed(lines) if re.fullmatch(r'(?:AssertionError|ValueError)(?:: [A-Z0-9_]+)?',v)),None)
(destination/'ROOT-ENTRY-RESULT.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
raise SystemExit(0 if proof.get('returncode')==0 else 2)
