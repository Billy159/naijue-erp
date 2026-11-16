"""Read existing PREPARE/WRITER receipts only; never dispatch or open PG."""
from pathlib import Path
import hashlib, json, runpy, shlex, sys

HERE = Path(__file__).resolve().parent
POLICY = HERE.parents[3] / '主控/20261117-r3-normal35-live-native-spec-window-01/direct35-batched-real.json'
POLICY_SHA = '8ede4587599742ec45ad90eef7b01e43d21d83635ce2689c85181691dca679e7'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
phase, authority_pin, destination = sys.argv[1:]
assert phase in ('prepare', 'writer') and len(authority_pin) == 64
assert sha(POLICY.read_bytes()) == POLICY_SHA
rule = json.loads(POLICY.read_bytes())['jobs'][phase]
key = rule['jobId']
program = r'''
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, stat, subprocess
PHASE=PHASE_LITERAL
KEY=KEY_LITERAL
AUTHORITY=AUTHORITY_LITERAL
SCRIPT=SCRIPT_LITERAL
TIMEOUT=TIMEOUT_LITERAL
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def take(p,uid=0,empty=False):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and (0 if empty else 1)<=s.st_size<=65536
  raw=f.read(65537);assert len(raw)==s.st_size
  ident=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
  assert ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat())
 return raw
DIAGNOSTIC_ENUMS = {'format': ('FINAL33_FAILURE_DIAGNOSTIC_V1',), 'stage': ('PREFLIGHT', 'BIND_INPUTS', 'PREPARE_READERS', 'PREPARE_CALL', 'PREPARE_RESULT', 'EXECUTION_BINDING', 'UNKNOWN'), 'errorType': ('Error', 'AssertionError', 'TypeError', 'RangeError', 'SyntaxError', 'UNKNOWN'), 'systemCode': ('ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_OUT_OF_RANGE', 'ERR_MODULE_NOT_FOUND', 'ERR_UNKNOWN_FILE_EXTENSION', 'ERR_ACCESS_DENIED', 'EACCES', 'EPERM', 'ENOENT', 'ELOOP', 'ENOTDIR', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRINUSE', 'UNKNOWN'), 'guardCode': ('FINAL33_APPROVAL_CANONICAL_REQUIRED', 'FINAL33_APPROVAL_OUTSIDE_PACKAGE_REQUIRED', 'FINAL33_CANONICAL_INPUT_REQUIRED', 'FINAL33_CURRENT_SERVICE_DIFFERS', 'FINAL33_ENV_REFUSED', 'FINAL33_FINITE_AUTHORITY_REQUIRED', 'FINAL33_FIXED_CONTROLLER_REQUIRED', 'FINAL33_FIXED_PROCESS_REQUIRED', 'FINAL33_INITIALIZER_BOUND', 'FINAL33_INPUT_CHANGED', 'FINAL33_NATIVE_OUTCOME_UNCONFIRMED', 'FINAL33_ORIGINAL_PREPARE_BINDING_REQUIRED', 'FINAL33_PERSISTED_INITIALIZER_BINDING_DIFFERS', 'FINAL33_PERSISTED_SCOPE_BINDING_DIFFERS', 'FINAL33_PREFLIGHT_REFUSED', 'FINAL33_PRIVATE_INPUT_BOUND', 'FINAL33_PRIVATE_PLAN_DIRECTORY_REQUIRED', 'FINAL33_PROTECTED_INPUT_REQUIRED', 'FINAL33_PROTECTED_PARENT_REQUIRED', 'FINAL33_RESTORED_SCOPE_DIFFERS', 'FINAL33_SCRATCH_REQUIRED', 'FINAL33_SOURCE_MATERIALIZATION_DIFFERS', 'UNKNOWN'), 'sqlstate': ('42601', '42702', '42501', '42P01', '42703', '42883', '23502', '23503', '23505', '23514', '22012', '22P02', '40001', '40P01', '57014', '55P03', '55000', 'P0001', '28P01', '3D000', '53300', '57P01', '08006', None)}

def project_failure_diagnostic(value):
    if type(value) is not dict or set(value) != set(DIAGNOSTIC_ENUMS):
        return None
    for key, allowed in DIAGNOSTIC_ENUMS.items():
        item = value[key]
        if item is not None and type(item) is not str:
            return None
        if item not in allowed:
            return None
    return {key: value[key] for key in DIAGNOSTIC_ENUMS}

out={'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'requestKey':KEY,'phase':PHASE,
 'requestPresent':os.path.lexists(C/'requests'/(KEY+'.json')),'rootJobPresent':os.path.lexists(B/KEY),
 'databaseConnections':0,'mutations':0,'privateBodiesRead':False,'automaticReplay':False,'rootPins':{}}
terminal=B/KEY/'r3-outer-terminal.json'
if terminal.is_file():
 raw=take(terminal);pub=take(C/'results'/(KEY+'.json'),1000);assert raw==pub
 out.update(terminal=json.loads(raw),terminalRootPublicSha256=sha(raw));out['rootPins']['terminal']=sha(raw)
 for kind in ('result','child-cleanup','incomplete'):
  leaf='final33-'+PHASE+'-'+kind+'.json';p=B/KEY/'results'/leaf
  if p.is_file():
   raw=take(p,empty=True);public_path=C/'jobs'/KEY/'results'/leaf
   public=take(public_path,1000,empty=True) if public_path.is_file() else None
   value=json.loads(raw);public_value=json.loads(public) if public is not None else None
   same=isinstance(value,dict) and value==public_value
   if isinstance(value,dict) and 'failureDiagnostic' in value:
    diagnostic=project_failure_diagnostic(value['failureDiagnostic'])
    value=dict(value)
    value.pop('failureDiagnostic')
    if diagnostic is not None:value['failureDiagnostic']=diagnostic
    else:out['failureDiagnosticOmittedInvalid']=True
   if kind=='result':
    out.update(result=value,resultObjectsEqual=same,publicResultSha256=sha(public) if public is not None else None)
    out['rootPins']['result']=sha(raw)
   else:out[leaf]={'rootSha256':sha(raw),'publicSha256':sha(public) if public is not None else None,'objectsEqual':same,'value':value}
request_path=B/KEY/'request.json'
if request_path.is_file():
 raw=take(request_path);request=json.loads(raw)
 assert request['jobId']==KEY and request['args']==[AUTHORITY] and request['timeoutSeconds']==TIMEOUT and request['script']==SCRIPT
 out.update(actualServerRequestSha256=sha(raw),actualServerRequestArgs=request['args'])
units=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5)
active=[row.split()[0] for row in units.stdout.decode().splitlines() if row.strip()]
unit='naijue-erp-op-b16447fb-'+sha(KEY.encode())[:12]+'.service'
out.update(activeOperationUnits=active,noOtherOperationUnits=all(name==unit for name in active),ownOperationUnitInactive=unit not in active,
 pgdataPidAbsent=not os.path.lexists(R/'state'/R.name/'data/postmaster.pid'))
q=subprocess.run(['/usr/bin/systemctl','show','--property=ActiveState,SubState','--no-pager',unit],capture_output=True,timeout=5)
out['operationUnit']={'name':unit,'returncode':q.returncode,'state':q.stdout.decode().strip().splitlines()}
if out.get('terminal',{}).get('status')=='COMPLETED' and out['terminal']['exitCode']==0:
 assert out['resultObjectsEqual'] and out['result']['requestKey']==KEY and out['result']['service']['proofSha256']=='82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0'
 assert out['result']['nativeResultBindingMatched'] and out['result']['lifecycleConfirmed']
 assert out['result']['nativeConnectionCleanup']=='CLOSED'
 assert all(out['result']['processCleanup'][k] is True for k in ('childReaped','descendantsReaped','nativeAuthorityRemoved','scratchEmpty'))
 current=take(R/'authority/fresh35-current-production-service-v2-service-35.json')
 assert sha(current)==out['result']['service']['proofSha256'];out['originalCurrent35ProofMatched']=True
print(json.dumps(out,sort_keys=True))
'''
for name, value in {'PHASE_LITERAL': phase, 'KEY_LITERAL': key, 'AUTHORITY_LITERAL': authority_pin,
                    'SCRIPT_LITERAL': rule['script'], 'TIMEOUT_LITERAL': rule['timeoutSeconds']}.items():
    program = program.replace(name, repr(value))
client = runpy.run_path(str(HERE.parent / 'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'))['load_client']()
raw = client['remote'](client['state'](), shlex.join(['sudo', '-n', '/usr/bin/python3', '-I', '-S', '-c', program]))
out = Path(destination)
with out.open('xb') as f:
    f.write(raw)
value = json.loads(raw)
print(json.dumps({'receipt': str(out), 'sha256': sha(raw), 'checkedAtUTC': value['checkedAtUTC'],
                  'requestKey': key, 'terminal': value.get('terminal'), 'state': value.get('result', {}).get('state'),
                  'activeOperationUnits': value['activeOperationUnits'], 'pgdataPidAbsent': value['pgdataPidAbsent']}, sort_keys=True))
