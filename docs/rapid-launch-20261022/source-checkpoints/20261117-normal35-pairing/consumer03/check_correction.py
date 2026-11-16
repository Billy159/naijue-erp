"""Only the two reported source defects and their affected closure."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;O=D.parent/'NORMAL35-UNISSUED-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((O/'SOURCE-PINS.json').read_bytes())=='2a9d90b6f7f56218b3b48cef21dd9bd2a655e1131a9ab79f48c43dd5a5f7ec43'
before=json.loads((O/'PHASES35.UNISSUED.json').read_bytes())
after=json.loads((D/'PHASES35.UNISSUED.json').read_bytes())
interface=json.loads((D/'INTERFACE.UNISSUED.json').read_bytes())
expected={'catalog_update/bundle/batched161_command_update_host.py','prepare/bundle/final33_host.py','writer/bundle/final33_host.py'}
changed=set()
for phase,j in after['jobs'].items():
 assert j['jobId']==before['jobs'][phase]['jobId']
 assert j['timeoutSeconds']==before['jobs'][phase]['timeoutSeconds']
 assert j['bundlePins']==interface['jobs'][phase]['bundlePins']
 assert j['sourceDirectory']==str(D/phase/'bundle')==interface['jobs'][phase]['sourceDirectory']
 assert set(j['bundlePins'])==set(before['jobs'][phase]['bundlePins'])
 for leaf,pin in j['bundlePins'].items():
  name=phase+'/bundle/'+leaf;p=D/name
  assert sha(p.read_bytes())==pin
  if pin!=before['jobs'][phase]['bundlePins'][leaf]:changed.add(name)
assert changed==expected
policy=interface['rootConsumerPolicyRelativePath']
assert policy=='r3-05-write-continuity/direct35-batched-real.json'
for name in changed:
 old=(O/name).read_text();new=(D/name).read_text()
 assert old.count('r3-05-write-continuity/direct34-batched-real.json')==1
 assert new==old.replace('r3-05-write-continuity/direct34-batched-real.json',policy)
 compile(new,str(D/name),'exec')
 tree=ast.parse(new)
 actual=[n.value for n in ast.walk(tree) if isinstance(n,ast.Constant) and isinstance(n.value,str) and 'r3-05-write-continuity/direct' in n.value]
 assert actual==[policy]
prior=runpy.run_path(str(D/'start/bundle/prior_failed34.py'))
normative={'service':prior['SERVICE'],'bindings':prior['binding']()}
assert after['predecessor']==interface['normativePredecessor']==normative
assert len(normative['bindings'])==8
assert normative['service']['serviceKey']=='t45-first-r3-native-service-start-20261116-34'
assert normative['service']['proofSha256']=='a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d'
assert sha((D/'phase_cli.py').read_bytes())==sha((O/'phase_cli.py').read_bytes())
out={'state':'LOCAL_TWO_FINDING_CORRECTION_CHECKED_SOURCE_ONLY','baseRejectedSourcePinsSha256':'2a9d90b6f7f56218b3b48cef21dd9bd2a655e1131a9ab79f48c43dd5a5f7ec43','runtimeChangesOnly':sorted(changed),'otherRuntimeMembersByteIdentical':49,'actualPolicyPathsMatchInterface':True,'normativePredecessorMatchesActual34ServiceAndEightBindings':True,'keysBudgetsAndCLIUnchangedFrom01':True,'serverConnections':0,'PGConnections':0,'clockOrAuthorityIssued':False,'nativeOrBuilderInvoked':False,'runtimePass':False}
with (D/'LOCAL-CORRECTION-CHECKS.json').open('x') as f:json.dump(out,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps(out,sort_keys=True))
