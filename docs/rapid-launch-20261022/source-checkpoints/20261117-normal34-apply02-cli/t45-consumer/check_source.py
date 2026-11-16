from pathlib import Path
import ast,json,runpy,hashlib
D=Path(__file__).resolve().parent;R=D.parent;O=R/'NORMAL34-OBSERVABLE-CANDIDATE-UNISSUED-02';sha=lambda b:hashlib.sha256(b).hexdigest()
plan=json.loads((D/'PHASES34-APPLY02.UNISSUED.json').read_bytes());oldplan=json.loads((O/'PHASES34.UNISSUED.json').read_bytes());checks={}
def c(p):
 out={}
 for n in ast.parse(p.read_bytes()).body:
  if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except(ValueError,TypeError):pass
 return out
for phase,j in plan['jobs'].items():
 b=D/phase/'bundle';assert set(j['bundlePins'])=={p.name for p in b.iterdir()}
 for name,pin in j['bundlePins'].items():
  p=b/name;assert sha(p.read_bytes())==pin
  if p.suffix=='.py':
   compile(p.read_bytes(),str(p),'exec');x=c(p)
   for key in ('PINS','STATIC_PINS'):
    for name,pin in x.get(key,{}).items():assert sha((b/name).read_bytes())==pin
for phase in ('apply','restore'):
 x=c(D/phase/'bundle/ordinary05_roles_job.py');assert x['CURRENT_SOURCE']==sha((D/'start/bundle/normal_service05_after08.py').read_bytes());assert x['CURRENT_PROOF_SOURCE']==sha((D/'start/bundle/normal_service05_after08_proof.py').read_bytes())
 x=runpy.run_path(str(D/phase/'bundle/ordinary05_roles.py'));assert x['scope']()['requestKey']=='t45-r3-ordinary34-auth-apply-20261116-01';assert (D/phase/'bundle/ordinary05_roles.py').read_bytes()==(O/phase/'bundle/ordinary05_roles.py').read_bytes()
 host=runpy.run_path(str(D/phase/'bundle/ordinary05_roles_job.py'));assert host['scope']('apply')['requestKey']==plan['jobs']['apply']['jobId'];assert host['scope']('restore')['requestKey']==oldplan['jobs']['restore']['jobId']
assert c(D/'stop/bundle/normal05_preserve_stop.py')['STOP_REFERENCE']==sha((D/'stop/bundle/normal05_retained_stop.py').read_bytes())
for phase in plan['jobs']:
 assert plan['jobs'][phase]['timeoutSeconds']==oldplan['jobs'][phase]['timeoutSeconds']
 if phase!='apply':assert plan['jobs'][phase]['jobId']==oldplan['jobs'][phase]['jobId']
checks['static52PinsPythonAndGenerationClosure']=True;checks['innerRoleCustodyAndSixOtherKeysAndBudgetsUnchanged']=True
actual=R/'NORMAL34-RUNTIME-WINDOW-01/apply/ACTUAL-APPLY-REFUSED-BEFORE-PHASE.json';assert sha(actual.read_bytes())=='5d4cbf13587694bd76ba29fd9cf7fcedff0fc0ac6e8b62515d479d32fd70df21';v=json.loads(actual.read_bytes());assert v['actualRequestArgs']==[] and v['terminal']['phaseStarted'] is False and v['new34CustodyAndCaptureAbsent'] and v['ownMaintenanceContainerAbsent']
cli=runpy.run_path(str(D/'phase_cli.py'));host=R/'NORMAL34-RUNTIME-WINDOW-01/apply/bundle/host-authorization.json';pin=sha(host.read_bytes());assert pin=='5467fa0e5bb89f7002bd7fa62a477acb9c5021dad9ad1297610bf61fcc0f6e5d'
assert cli['authority'](host,pin,v['requestKey'])==pin;cli['phase_argument']([pin],pin)
rejected=0
for args in ([],[pin,pin],['0'*64],None):
 try:cli['phase_argument'](args,pin)
 except ValueError:rejected+=1
 else:raise AssertionError('BAD_PHASE_ARGUMENT_ACCEPTED')
for bad in (None,'','0'*64):
 try:cli['authority'](host,bad,v['requestKey'])
 except ValueError:rejected+=1
 else:raise AssertionError('BAD_AUTHORITY_PIN_ACCEPTED')
try:cli['authority'](host,pin,plan['jobs']['apply']['jobId'])
except ValueError:rejected+=1
else:raise AssertionError('OLD01_HOST_ACCEPTED_AS02')
# Every UNISSUED phase is rejected before client loading/state/network, using the actual blueprint.
for phase in cli['PHASES']:
 try:cli['prepare'](phase,D/'PHASES34-APPLY02.UNISSUED.json',sha((D/'PHASES34-APPLY02.UNISSUED.json').read_bytes()),pin,D/'never-created')
 except ValueError as e:assert str(e)=='ISSUED_POLICY_REQUIRED'
 else:raise AssertionError('UNISSUED_PHASE_EXECUTABLE')
checks['actual5467ArgumentAndEightNegativeCases']=rejected==8;checks['allSevenUnissuedRejectedBeforeClientOrNetwork']=True
# Original real parser and request construction, with the actually issued5467 bytes.
client=R.parents[3].parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py';t=ast.parse(client.read_bytes());main=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='main');i=next(i for i,n in enumerate(main.body) if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='parse_args');import argparse
s={'argparse':argparse};exec(compile(ast.Module(body=main.body[:i],type_ignores=[]),str(client),'exec'),s)
args=s['parser'].parse_args(['run','--task','T45','--job-id',v['requestKey'],'--script','ordinary05_roles_job.py','--source-dir',str(host.parent),'--output-dir',str(D/'never-created'),'--phase-arg',pin]);assert args.phase_arg==[pin]
checks['actualOriginalParserPhaseArgumentBound']=True
out={'status':'SOURCE_ONLY_APPLY02_CLI_SUCCESSOR_LOCAL_CHECKS','checks':checks,'sourceAuthorityIssued':False,'serverConnections':0,'PGConnections':0,'newClock':False,'newKeyExecuted':False,'originalArgRefusalRetained':True,'roleAuthorityOriginalScope':runpy.run_path(str(D/'apply/bundle/ordinary05_roles.py'))['scope'](),'newOuterApplyHostScope':runpy.run_path(str(D/'apply/bundle/ordinary05_roles_job.py'))['scope']('apply'),'newStartScope':runpy.run_path(str(D/'start/bundle/normal_service05_after08_proof.py'))['scope']()}
with (D/'LOCAL-CHECKS.json').open('x') as f:json.dump(out,f,ensure_ascii=False,sort_keys=True,indent=2);f.write('\n')
print(json.dumps({'checks':checks,'sha256':sha((D/'LOCAL-CHECKS.json').read_bytes())}))
