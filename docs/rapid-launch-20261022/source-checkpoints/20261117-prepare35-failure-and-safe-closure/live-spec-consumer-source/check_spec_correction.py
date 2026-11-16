"""Real35 metadata predicate regression; no authority/target/native fixture."""
from pathlib import Path
from types import SimpleNamespace
import ast,hashlib,json,os,re,runpy,stat
D=Path(__file__).resolve().parent;R=D.parent;O=R/'NORMAL35-UNISSUED-03'
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((O/'SOURCE-PINS.json').read_bytes())=='8b8f63b0ed37613c816db0d3c8c16b1acf5902d61266be6b8b8cc7cd93bb193a'
start=R/'NORMAL35-RUNTIME-01/start/ACTUAL-START35-RESULT.json'
update=R/'NORMAL35-RUNTIME-01/catalog_update/ACTUAL-CATALOG35-RESULT.json'
assert sha(start.read_bytes())=='e1b0ce527d733738e82d7cb4cb041bcc23d673ddb3f64dde8c299387433297a0'
assert sha(update.read_bytes())=='4691772528f237973a6a2b0d636edde1ffcf7916c30db0f55bc0e714dd11547e'
s=json.loads(start.read_bytes());u=json.loads(update.read_bytes())
binding=s['liveFacts']['finalPreparationBinding'];service=s['service']
old='05609b8c0eb2b4be1fb84e2e3ef1d8b1737f82afe712cd49cd111860e22675bb'
new='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29'
assert binding['batchedCatalogSpecSha256']==s['descriptor']['batchedCatalog']['catalogSpecSha256']==u['result']['batchedCatalog']['catalogSpecSha256']==new
def predicate(code):
 tree=ast.parse(code)
 call=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='need' and len(n.args)==2 and isinstance(n.args[1],ast.Constant) and n.args[1].value=='FINAL33_NATIVE_BINDING_REQUIRED')
 return bool(eval(compile(ast.Expression(call.args[0]),'actual-native-binding-predicate','eval'),{'binding':binding,'s':service}))
base=json.loads((O/'SOURCE-PINS.json').read_bytes());changes=[];unchanged=0
for name,e in base['files'].items():
 if '/bundle/' not in name:continue
 before=(O/name).read_bytes();after=(D/name).read_bytes();assert sha(before)==e['sha256']
 if before!=after:
  assert name in ('prepare/bundle/final33_host.py','writer/bundle/final33_host.py')
  assert before.decode().count(old)==1 and after==before.replace(old.encode(),new.encode())
  compile(after,str(D/name),'exec')
  assert predicate(before.decode()) is False and predicate(after.decode()) is True
  changes.append(name)
 else:unchanged+=1
assert len(changes)==2 and unchanged==50
# Original native source constants and same real metadata are reused, without
# invoking its validator, factory, source compiler or target APIs.
native=R.parents[2]/'D1/20261116-r3-final-source-prepare-01/work/tools/unified-import/batched-stream-cli-state.mjs'
assert sha(native.read_bytes())=='609879727a851cf6a79a4ab589096cb0cfe560476557ae9ef5d42d826df7613c'
code=native.read_text();section=code.split('export const FINAL_R3_SOURCE=Object.freeze({',1)[1].split('});',1)[0]
constants=dict(re.findall(r"(\w+):'([a-f0-9]{64})'",section))
assert len(constants)==4 and all(binding['inputBinding'][k]==v for k,v in constants.items())
assert old not in code and new not in code
entry=(D/'start/bundle/batched161-run.mjs').read_text()
assert binding['batchedDbCandidatePinsSha256']=='dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9' in entry
cli=runpy.run_path(str(D/'phase_cli.py'));assert cli['HERE']==D
assert (D/'phase_cli.py').read_bytes()==(O/'phase_cli.py').read_bytes()
plan=json.loads((D/'PHASES35.UNISSUED.json').read_bytes());interface=json.loads((D/'INTERFACE.UNISSUED.json').read_bytes())
assert Path(interface['executionCLI']['source'])==D/'phase_cli.py'
for phase,j in plan['jobs'].items():
 assert Path(j['sourceDirectory'])==D/phase/'bundle' and j==interface['jobs'][phase]
 assert j['jobId']==json.loads((O/'PHASES35.UNISSUED.json').read_bytes())['jobs'][phase]['jobId']
 for name,pin in j['bundlePins'].items():assert sha((D/phase/'bundle'/name).read_bytes())==pin
for item in interface['consumerSourceInterfaces'].values():
 assert Path(item['path']).is_relative_to(D) and sha(Path(item['path']).read_bytes())==item['sha256']
# Run only the original real collector function on these two pending source
# bundles. No client main, state, submit or remote is loaded or called.
client=R.parents[3].parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py'
assert sha(client.read_bytes())=='08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'
tree=ast.parse(client.read_bytes());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='collect_bundle_files')
env={'Path':Path,'os':os,'stat':stat,'re':re,'hashlib':hashlib};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(client),'exec'),env)
for phase in ('prepare','writer'):
 j=plan['jobs'][phase];files=env['collect_bundle_files']({'private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64','grantId':'b16447fbc81f4d64'},SimpleNamespace(task='T45',script=j['script'],rewrite=[]),D/phase/'bundle',j['jobId'])
 assert {n:sha(b) for n,b in files.items()}==j['bundlePins']
out={'state':'LOCAL_SPEC_ONLY_CORRECTION_REAL_BINDING_RED_GREEN','changedRuntimeMembers':changes,'unchangedRuntimeMembers':50,'oldPredicateOnActual35Binding':False,'newPredicateOnSameActual35Binding':True,'actualStartAndCommittedCatalogSpecMatched':new,'nativeSourceSha256':sha(native.read_bytes()),'nativeFourSourceConstantsAndDbCandidatePinMatched':True,'nativeNoStaleOrNewHardcodedCatalogSpecLiteral':True,'CLIBytesAndCurrentHEREPaired':True,'realV3TwoPendingBundlesMatched':True,'usedRoleAndSource03FilesUnchanged':True,'newAuthorityTargetCapabilityOrFixtureCreated':False,'nativeOrIssuerOrCompilerInvoked':False,'serverActions':0,'PGConnections':0,'newJobSubmitted':False,'clockIssued':False,'runtimePass':False}
with (D/'LOCAL-CHECKS.json').open('x') as f:json.dump(out,f,sort_keys=True,indent=2);f.write('\n')
print(json.dumps(out,sort_keys=True))
