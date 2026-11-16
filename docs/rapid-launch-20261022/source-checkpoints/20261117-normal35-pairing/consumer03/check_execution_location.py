"""N35-C03 only: actual CLI HERE, blueprint and source paths, without client use."""
from pathlib import Path
import hashlib,json,runpy
D=Path(__file__).resolve().parent;O=D.parent/'NORMAL35-UNISSUED-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((O/'SOURCE-PINS.json').read_bytes())=='1fd71678c062a5024f83694a12a65867748ecbca128cb5ded02f3afa81c2d8e4'
interface=json.loads((D/'INTERFACE.UNISSUED.json').read_bytes())
blueprint=json.loads((D/'PHASES35.UNISSUED.json').read_bytes())
old=json.loads((O/'PHASES35.UNISSUED.json').read_bytes())
p=Path(interface['executionCLI']['source'])
assert p==D/'phase_cli.py' and p.resolve()==p
assert sha(p.read_bytes())==interface['executionCLI']['sha256']==sha((O/'phase_cli.py').read_bytes())
# The actual advertised entry computes HERE from __file__, without a mocked
# directory or fake policy. Its only calls below reject UNISSUED immediately.
cli=runpy.run_path(str(p));assert cli['HERE']==D
assert json.loads((cli['HERE']/'PHASES35.UNISSUED.json').read_bytes())==blueprint
members=0
for phase,j in blueprint['jobs'].items():
 expected=D/phase/'bundle'
 assert Path(j['sourceDirectory'])==expected
 assert j==interface['jobs'][phase]
 assert j['bundlePins']==old['jobs'][phase]['bundlePins']
 assert {k:v for k,v in j.items() if k!='sourceDirectory'}=={k:v for k,v in old['jobs'][phase].items() if k!='sourceDirectory'}
 assert cli['HERE']/phase/'bundle'==expected
 for leaf,pin in j['bundlePins'].items():
  assert sha((expected/leaf).read_bytes())==pin==sha((O/phase/'bundle'/leaf).read_bytes());members+=1
 try:cli['prepare'](phase,D/'PHASES35.UNISSUED.json',sha((D/'PHASES35.UNISSUED.json').read_bytes()),None,D/'never-created')
 except ValueError as e:assert str(e)=='ISSUED_POLICY_REQUIRED'
 else:raise AssertionError('UNISSUED_EXECUTION_PERMITTED')
for item in interface['consumerSourceInterfaces'].values():
 path=Path(item['path']);assert path.is_relative_to(D) and path.resolve()==path
 assert sha(path.read_bytes())==item['sha256']
def locations(value):
 if isinstance(value,dict):
  for v in value.values():yield from locations(v)
 elif isinstance(value,list):
  for v in value:yield from locations(v)
 elif isinstance(value,str) and '/NORMAL35-UNISSUED-' in value and value.startswith('/'):yield value
assert all(Path(s).is_relative_to(D) for s in locations(interface))
assert blueprint['predecessor']==old['predecessor']
assert members==52 and not (D/'never-created').exists()
out={'state':'LOCAL_N35_C03_EXECUTION_LOCATION_CORRECTION_CHECKED_SOURCE_ONLY','advertisedCLIPath':str(p),'actualCLIHere':str(cli['HERE']),'actualBlueprintPath':str(cli['HERE']/'PHASES35.UNISSUED.json'),'sevenSourceDirectoriesAndInterfacesCurrent03':True,'all52RuntimeMembersByteIdenticalTo02':True,'normativePredecessorAndScopeUnchangedFrom02':True,'sevenActualAdvertisedCLIUnissuedPhasesRejectedBeforeClientStateNetwork':True,'consumerSourceInterfacePathsAndHashesMatch':True,'serverConnections':0,'PGConnections':0,'clockOrAuthorityIssued':False,'nativeOrTargetOrBuilderInvoked':False,'actualSubmission':False,'runtimePass':False}
with (D/'EXECUTION-LOCATION-CHECKS.json').open('x') as f:json.dump(out,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps(out,sort_keys=True))
