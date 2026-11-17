"""Narrow static protocol check. No policy/authority/future receipt construction."""
from pathlib import Path
import ast,hashlib,json,types
H=Path(__file__).resolve().parent
ROOT=H.parents[2]
sha=lambda raw:hashlib.sha256(raw).hexdigest()
trees={p.name:ast.parse(p.read_bytes(),str(p))for p in H.glob('*.py')}
module=types.ModuleType('pure_root07_patch');exec(compile((H/'patch_dispatcher.py').read_text(),str(H/'patch_dispatcher.py'),'exec'),module.__dict__)
actual=(H/'ACTUAL38-DISPATCHER.py').read_bytes();template=(H/'admin_exec.ROOT07-UNREGISTERED.py').read_bytes();admission=(H/'r3_root07_source_admission.py').read_bytes()
assert sha(actual)==module.BASE
assert module.render(actual,sha(admission),None)==template
def prefix(tree):
 return next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.targets))
old=prefix(trees['ACTUAL38-DISPATCHER.py']);new=prefix(trees['admin_exec.ROOT07-UNREGISTERED.py'])
assert len(old)==101 and new==old+[module.KEY]and len(new)==len(set(new))==102
for filename in ['ACTUAL38-DISPATCHER.py','admin_exec.ROOT07-UNREGISTERED.py']:
 assert len([n for n in ast.walk(trees[filename])if isinstance(n,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.comparators)])==3
cas=trees['register_cas.py'];values={n.targets[0].id:ast.literal_eval(n.value)for n in cas.body if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id in ('MODULE_SHA256','TEMPLATE_SHA256','OLD_DISPATCHER')}
assert values['MODULE_SHA256']==sha(admission)and values['TEMPLATE_SHA256']==sha(template)and values['OLD_DISPATCHER']==module.BASE
prior=ROOT/'outputs/D1/20261117-r3-normal38-root-source-02/register_cas.py'
ptree=ast.parse(prior.read_bytes());fns=lambda tree:{n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
for name in ['need','sha','now','pack','identity','read','sync','put']:
 assert ast.dump(fns(cas)[name],include_attributes=False)==ast.dump(fns(ptree)[name],include_attributes=False),name
static=json.loads((H/'STATIC-INPUTS.json').read_bytes());assert len(static['basis'])==17 and len(static['privateCustodyStatOnly'])==5
assert not(set(static['basis'])&set(static['privateCustodyStatOnly']))
closed=fns(trees['r3_root07_source_admission.py'])['validate_closed38']
private_loop=next(n for n in closed.body if isinstance(n,ast.For)and 'privateCustodyStatOnly'in ast.dump(n.iter))
assert 'lstat' in ast.dump(private_loop)and not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('read','read_bytes','open','sha')for n in ast.walk(private_loop))
admit=next(n for n in trees['r3_root07_source_admission.py'].body if isinstance(n,ast.ClassDef)).body
admit=next(n for n in admit if isinstance(n,ast.FunctionDef)and n.name=='admit')
assert 'bundle-manifest.json'in ast.get_source_segment(admission.decode(),admit)
freeze=fns(trees['ACTUAL38-DISPATCHER.py'])['freeze'];assert "bundle-manifest.json"in ast.get_source_segment(actual.decode(),freeze)
material=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ROOT07-MATERIALIZATION-SOURCE-01'
mpraw=(material/'SOURCE-PINS.json').read_bytes();assert sha(mpraw)=='919c10d32c1ed59cea733a96fcfbaa206e17e471fe76cdb9ab59160661e7588d'
material_pins=json.loads(mpraw);assert material_pins['bundlePins']==static['rule']['bundlePins']
for leaf,pin in static['rule']['bundlePins'].items():assert sha((material/'bundle'/leaf).read_bytes())==pin
assert static['rule']['jobId']==module.KEY and static['rule']['timeoutSeconds']==300
issuer=fns(trees['issue_source_registration.py'])['issue'];issuer_text=ast.get_source_segment((H/'issue_source_registration.py').read_text(),issuer)
assert issuer_text.index('now=time.time_ns()')>issuer_text.index("basis['actual38StoppedAndOriginalAuthRestored']")
assert issuer_text.index('now=time.time_ns()')>issuer_text.index("review['sourcePinsSha256']")
assert 'roles-authorization.json'not in issuer_text
for p in H.glob('*.py'):assert len(p.read_bytes())<=131072,p.name
report=dict(state='STATIC_SOURCE_ONLY_ROOT07_REGISTRATION_CHECKS_PASS',sourceOnly=True,oldProtectedPrefix=101,newProtectedPrefix=102,guardCount=3,oldNormalPolicyAndHelperUnchanged=True,originalCASPrimitivesByteASTEqual=True,privateCustodyStatOnly=True,privateCustodyIdentities=5,actualBasisPins=17,materializerSourcePinsSha256=sha(mpraw),clockCalls=0,issuerInvocations=0,serverActions=0,PGConnections=0,futurePositiveFixture=False,actualNewKeyAbsence=None,actualSourceAuthority=None,executionReady=False)
(H/'LOCAL-CHECKS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
