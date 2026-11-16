"""Check only changed source pairing; no native/target/authority fixtures."""
from pathlib import Path
import ast,hashlib,json,runpy,subprocess
D=Path(__file__).resolve().parent;R=D.parent
O=R/'NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
plan=json.loads((D/'PHASES35.UNISSUED.json').read_bytes())
old=json.loads((O/'PHASES34-APPLY02.UNISSUED.json').read_bytes())
def constants(path):
 out={}
 for n in ast.parse(path.read_bytes()).body:
  if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except (ValueError,TypeError):pass
 return out
for phase,j in plan['jobs'].items():
 b=D/phase/'bundle'
 assert set(j['bundlePins'])=={p.name for p in b.iterdir()}
 assert j['timeoutSeconds']==old['jobs'][phase]['timeoutSeconds']
 assert j['authoritySha256'] is None
 for name,pin in j['bundlePins'].items():
  p=b/name;assert sha(p.read_bytes())==pin
  if p.suffix=='.py':
   compile(p.read_bytes(),str(p),'exec');c=constants(p)
   for field in ('PINS','STATIC_PINS'):
    for leaf,pin in c.get(field,{}).items():assert sha((b/leaf).read_bytes())==pin,(phase,name,field,leaf)
expected={'apply':'t45-r3-ordinary35-auth-apply-20261116-01','start':'t45-first-r3-native-service-start-20261116-35','stop':'t45-r3-ordinary35-preserve-stop-20261116-01','restore':'t45-r3-ordinary35-auth-restore-20261116-01'}
for phase,key in expected.items():assert plan['jobs'][phase]['jobId']==key and key!=old['jobs'][phase]['jobId']
for phase in ('catalog_update','prepare','writer'):assert plan['jobs'][phase]['jobId']==old['jobs'][phase]['jobId']
start=D/'start/bundle';main=constants(start/'normal_service05_after08.py');collector=constants(start/'start_owned_describe.py');proof=constants(start/'normal_service05_after08_proof.py')
assert collector['RUNNER_SHA']==sha((start/'batched161-run.mjs').read_bytes())
for field,leaf in {'OPS_SHA':'fresh35-production-carrier.py','R3_RUNTIME_SHA':'r3_05_runtime.py','R3_CLI_SHA':'r3_05_cli.py','READONLY_SHA':'r3_05_readonly.py','PRIOR32_SHA':'prior_failed34.py'}.items():assert main[field]==sha((start/leaf).read_bytes()),field
body=(start/'normal_service05_after08.py').read_text()
assert body.count(collector['RUNNER_SHA'])==1 and body.count(sha((start/'start_owned_describe.py').read_bytes()))==2
assert proof['PREVIOUS_JOB']=='t45-first-r3-native-service-start-20261116-34'
assert proof['PREVIOUS_EPOCH']=='2026-11-16 17:11:22.392132+00'
meta=json.loads((D/'PRIOR34-C-METADATA.json').read_bytes())
for phase in ('apply','start','restore'):
 p=D/phase/'bundle/prior_failed34.py';c=constants(p)
 assert c['SERVICE']=={k:meta[k] for k in ('containerId','containerStartedAt','postmasterStart','proofSha256','serviceKey')}
 assert c['OLD_MAIN']==sha((O/'start/bundle/normal_service05_after08.py').read_bytes())
 assert c['OLD_PROOF']==sha((O/'start/bundle/normal_service05_after08_proof.py').read_bytes())
 assert c['KEY']==meta['serviceKey'] and c['RESTORE']=='t45-r3-ordinary34-auth-restore-20261116-01'
for phase in ('apply','restore'):
 b=D/phase/'bundle';c=constants(b/'ordinary05_roles_job.py')
 assert c['CURRENT_SOURCE']==sha((start/'normal_service05_after08.py').read_bytes())
 assert c['CURRENT_PROOF_SOURCE']==sha((start/'normal_service05_after08_proof.py').read_bytes())
 assert c['PHASES']=={phase:(key,key) for phase,key in expected.items() if phase in ('apply','restore')}
 s=(b/'ordinary05_roles.py').read_text();assert 'ordinary35-auth-20261116-01' in s and 'ordinary35-auth-capture-20261116-01' in s
 assert "native-services/ordinary34-auth-20261116-01/original-auth.json" in s
 assert 'require_unentered_apply01' not in (b/'ordinary05_roles_job.py').read_text()
 assert 'require_unused_apply35(ops,control)' in (b/'ordinary05_roles_job.py').read_text()
 assert (b/'ordinary05_roles.py').read_bytes()==(D/'apply/bundle/ordinary05_roles.py').read_bytes()
assert constants(D/'stop/bundle/normal05_preserve_stop.py')['STOP_REFERENCE']==sha((D/'stop/bundle/normal05_retained_stop.py').read_bytes())
# The b82c single-authority CLI remains byte-for-byte except its blueprint name.
cli_source=(O/'phase_cli.py').read_text().replace('PHASES34-APPLY02.UNISSUED.json','PHASES35.UNISSUED.json')
assert (D/'phase_cli.py').read_text()==cli_source
cli=runpy.run_path(str(D/'phase_cli.py'))
for phase in cli['PHASES']:
 try:cli['prepare'](phase,D/'PHASES35.UNISSUED.json',sha((D/'PHASES35.UNISSUED.json').read_bytes()),None,D/'never-created')
 except ValueError as e:assert str(e)=='ISSUED_POLICY_REQUIRED'
 else:raise AssertionError('UNISSUED_POLICY_EXECUTABLE')
assert not (D/'never-created').exists()
prior=runpy.run_path(str(D/'start/bundle/prior_failed34.py'))
assert plan['predecessor']=={'service':prior['SERVICE'],'bindings':prior['binding']()}
assert plan['predecessor']['service']['serviceKey']=='t45-first-r3-native-service-start-20261116-34'
for name in ('catalog_update/bundle/batched161_command_update_host.py','prepare/bundle/final33_host.py','writer/bundle/final33_host.py'):
 s=(D/name).read_text();tree=ast.parse(s)
 literals=[x.value for x in ast.walk(tree) if isinstance(x,ast.Constant) and isinstance(x.value,str) and 'r3-05-write-continuity/direct' in x.value]
 assert literals==['r3-05-write-continuity/direct35-batched-real.json'],(name,literals)
assert not any(p.name in ('host-authorization.json','roles-authorization.json','service-start-authorization.json','normal05-preserve-stop-input.json','catalog-update-authorization.json') for p in D.glob('*/bundle/*'))
# Node syntax only for changed JavaScript leaves; no imports or execution.
node=R.parents[3].parent/'work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node'
assert node.exists(),str(node)
node_checked=[]
delta=json.loads((D/'DELTA.json').read_bytes())
for name in delta:
 if name.endswith('.mjs'):
  q=subprocess.run([str(node),'--check',str(D/name)],capture_output=True,text=True,timeout=15)
  assert q.returncode==0,(name,q.stderr)
  node_checked.append(name)
out={'state':'LOCAL_SOURCE_ONLY_NORMAL35_CLOSURE_CHECKED','runtimeMembers':sum(len(x['bundlePins']) for x in plan['jobs'].values()),'changedRuntimeMembers':len(delta),'checks':{'sameGeneration52StaticPinsAndPythonCompile':True,'exactActual34PredecessorAndRestoration':True,'fourNewMaintenanceKeysAndCustody35Only':True,'threeBusinessKeysAndNativeROOT06Unchanged':True,'CLIOnlyBlueprintNameChangedFromB82C':True,'sevenUnissuedPhasesRefusedBeforeStateOrNetwork':True,'noIssuedAuthorityInBundles':True,'unchangedBudgets':True,'threeActualPolicyReadsMatchDirect35':True,'normativePredecessorMatchesActual34ServiceAndEightBindings':True,'changedNodeSyntaxOnly':node_checked},'originalPrivateCReadReceiptSha256':sha((D/'PRIOR34-C-METADATA.json').read_bytes()),'sourceAssemblyServerConnections':0,'sourceAssemblyPGConnections':0,'nativeOrTargetOrAuthorityFixturesCreated':False,'newJobSubmitted':False,'clockIssued':False,'runtimeCandidatePass':False}
with (D/'LOCAL-CHECKS.json').open('x') as f:json.dump(out,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps(out,sort_keys=True))
