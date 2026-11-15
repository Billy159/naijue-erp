"""Describe the genuine installed candidate against actual27; never opens PG."""
from pathlib import Path
import hashlib,json,runpy,shlex,sys
HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
rules=HERE/'PHASES27.UNISSUED.json'
assert sha(rules.read_bytes())=='b85ed78aeadb85b29d71d5cfdd45e6483e5079371695c96dbc66e4e26b1a8234'
w=json.loads(rules.read_bytes())
roles_path,roles_sha,start_path,start_sha,destination=sys.argv[1:]
def load(p,pin):
 b=Path(p).read_bytes();assert sha(b)==pin;return json.loads(b)
roles=load(roles_path,roles_sha);start=load(start_path,start_sha)
assert (start['terminal']['status'],start['terminal']['exitCode'])==('COMPLETED',0)
service=start['service'];assert service['serviceKey']==w['jobs']['start']['jobId']
client=HERE.parents[4].parent/'monitor/normal-admission-20261112-01/admin_client.py'
assert sha(client.read_bytes())=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']()
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,signal,stat,subprocess,time
SERVICE=SERVICE_LITERAL
VALID_UNTIL=VALID_LITERAL
RUNNER_SHA=RUNNER_LITERAL
DESC_SHA=DESC_LITERAL
HOST=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
STATE='/var/lib/naijue-erp/fresh35-production'
NODE='/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node'
ROOT=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
sha=lambda b:hashlib.sha256(b).hexdigest()
def protected(p,max_bytes=262144):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=max_bytes
  b=f.read(max_bytes+1);assert len(b)==s.st_size;return b
material=HOST/'state/installed-real-operation-batched-root03-20261116-01'
m=json.loads(protected(material/'source-materialization.json'))
assert sha(protected(material/'source-materialization.json'))=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec' and m['sourceDescriptionSha256']==DESC_SHA
t=json.loads(protected(ROOT/'t45-r3-batched-root03-source-delta-20261116-01/r3-outer-terminal.json'))
assert (t['status'],t['exitCode'])==('COMPLETED',0)
assert sha(protected(HOST/'state/native-services'/SERVICE['serviceKey']/'batched161-run.mjs',65536))==RUNNER_SHA
raw=protected(HOST/'authority/fresh35-current-production-service-v2-service-27.json');proof=json.loads(raw)
assert sha(raw)==SERVICE['proofSha256'] and proof['requestKey']==SERVICE['serviceKey']
assert proof['sharedPostgresNamespace']['container']['id']==SERVICE['containerId']
auth=json.loads(protected(HOST/'state/native-services'/SERVICE['serviceKey']/'service-start-authorization.json'))
install_starts=time.time_ns()//1000000
payload={'service':SERVICE,'backupAdminValidUntil':VALID_UNTIL,'installStartsAt':install_starts,
 'installExpiresAt':min(install_starts+1200000,VALID_UNTIL,proof['sharedPostgresNamespace']['serviceLeaseExpiresAt'])}
assert install_starts+900000<payload['installExpiresAt'],'NEW_INDEPENDENT_UPGRADE_BUDGET_INSUFFICIENT_NO_INSTALL_SUBMITTED'
body=json.dumps(payload,sort_keys=True).encode()
# The child only runs its public describe branch; no credentials are supplied.
code=r"""
import json,os,signal,subprocess,sys
c=subprocess.Popen(['/opt/naijue-erp/fresh35-combined-v1/runtime/node/bin/node','--no-global-search-paths',
 '/var/lib/naijue-erp/fresh35-production/native-services/t45-first-r3-native-service-start-20261116-27/batched161-run.mjs','describe'],
 stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','HOME':'/','LC_ALL':'C','TZ':'UTC'},start_new_session=True)
try:
 out,_=c.communicate(sys.stdin.buffer.read(65537),timeout=20)
 assert 0<len(out)<=131072
 print(json.dumps({'nativeExitCode':c.returncode,'nativeReply':json.loads(out)}))
finally:
 if c.poll() is None:
  os.killpg(c.pid,signal.SIGTERM)
  try:c.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(c.pid,signal.SIGKILL);c.wait(timeout=2)
"""
p=subprocess.run(['/usr/bin/docker','exec','-i','--user','0:0',SERVICE['containerId'],'/usr/bin/python3','-I','-S','-c',code],input=body,capture_output=True,timeout=26)
if p.returncode!=0:
 print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'state':'READONLY_DESCRIPTOR_FAILED_NO_INSTALL_SUBMITTED','returncode':p.returncode,'nativeReply':json.loads(p.stdout) if p.stdout.strip() else None,'stderrBytes':len(p.stderr),'databaseConnections':0,'mutations':0},sort_keys=True));raise SystemExit(0)
assert 0<len(p.stdout)<=131072,'READONLY_DESCRIPTOR_UNCONFIRMED_NO_INSTALL_SUBMITTED'
envelope=json.loads(p.stdout);v=envelope['nativeReply']
if envelope['nativeExitCode']!=0 or v.get('state')!='PROGRAM_DESCRIBED_NO_PG_OR_WRITE':
 print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'state':'READONLY_DESCRIPTOR_FAILED_NO_INSTALL_SUBMITTED',**envelope,'databaseConnections':0,'mutations':0},sort_keys=True));raise SystemExit(0)
assert v['databaseConnections']==v['mutations']==0
# The root readback reports the actual proof deadline. Preserve the runner's
# additional conservative reserve separately instead of mislabelling it.
v['runnerConservativeWorkDeadline']=v['liveFacts']['actualSharedServiceWorkDeadline']
assert v['runnerConservativeWorkDeadline']==proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']-35000
v['liveFacts']['actualSharedServiceWorkDeadline']=proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']
v['liveFacts']['workDeadlineBasis']='PROTECTED_CURRENT27_SHARED_POSTGRES_NAMESPACE'
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),**v,'descriptionChildReaped':True,'privateBodiesRead':False},sort_keys=True))
'''.replace('SERVICE_LITERAL',repr(service)).replace('VALID_LITERAL',str(roles['backupAdminValidUntil']))
runner_sha=w['jobs']['start']['bundlePins']['batched161-run.mjs']
assert runner_sha==w['jobs']['install']['bundlePins']['batched161-run.mjs']
program=program.replace('RUNNER_LITERAL',repr(runner_sha)).replace('DESC_LITERAL',repr(w['sourceDescriptionSha256']))
raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
v=json.loads(raw);dest=Path(destination);dest.mkdir(mode=0o700)
items=[('READONLY-DESCRIBE.json',v)] if v.get('state')!='PROGRAM_DESCRIBED_NO_PG_OR_WRITE' else [('READONLY-DESCRIBE.json',v),('DESCRIPTOR.json',v['descriptor']),('LIVE-FACTS.json',v['liveFacts'])]
for name,value in items:
 b=(json.dumps(value,sort_keys=True,indent=2)+'\n').encode()
 with (dest/name).open('xb') as f:f.write(b)
 print(json.dumps({'receipt':str(dest/name),'sha256':sha(b)}))
