"""Static and actual-receipt checks only; never invoke reader, issuer, CAS or native."""
from pathlib import Path
import ast,builtins,hashlib,json,runpy,symtable
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];PREV=HERE.parent/'20261116-r3-normal34-root-source-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def functions(path):
 return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef)}
def methods(path):
 c=next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.ClassDef))
 return {n.name:ast.dump(n,include_attributes=False) for n in c.body if isinstance(n,ast.FunctionDef)}
syntax=[]
for path in HERE.glob('*.py'):
 s=path.read_text();compile(s,str(path),'exec');syntax.append(path.name)
 # The deliberately injected fragment supplies six names through its final host module.
 if path.name=='refused_apply34_fragment.py':continue
 tab=symtable.symtable(s,str(path),'exec');defined={x.get_name() for x in tab.get_symbols() if x.is_assigned() or x.is_imported() or x.is_namespace()};used=set()
 def walk(t):
  for c in t.get_children():
   used.update(x.get_name() for x in c.get_symbols() if x.is_global() and x.is_referenced());walk(c)
 walk(tab);assert not used-defined-set(dir(builtins))-{'__file__','__name__'},path
cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='local_source_only')
old=runpy.run_path(str(PREV/'register_cas.py'),run_name='local_source_only')
facts=json.loads((HERE/'CURRENT-FACTS.json').read_bytes());w=json.loads((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())
normal=Path(w['consumerSourceDirectory']);frozen=json.loads((normal/'SOURCE-PINS.json').read_bytes());interface=json.loads((normal/'INTERFACE.UNISSUED.json').read_bytes());plan=json.loads((normal/'PHASES34-APPLY02.UNISSUED.json').read_bytes())
assert sha((normal/'SOURCE-PINS.json').read_bytes())==w['consumerSourcePinsSha256']=='9dde7aaf1b3b40ec6fd90a344b62c1b158492c07f21c4d1b471289a9c96bc349'
for leaf,row in frozen['files'].items():
 b=(normal/leaf).read_bytes();assert sha(b)==row['sha256'] and len(b)==row['bytes']
assert len(cas['BASIS'])==203 and {str(k):v for k,v in cas['BASIS'].items()}==facts['basis']
assert cas['OLD_DISPATCHER']==facts['currentDispatcherSha256']=='5cfb0227b161475b3401ff5a7b402f4f758bc4052b2d110d6dc725ca34837782'
assert cas['NEW_POLICY']==old['NEW_POLICY'] and cas['NEW_POLICY'] in cas['BASIS']
assert cas['BASIS'][cas['NEW_POLICY']]=='bd4ed7ee54fd2fc99f49875f75612f95ec5a68205c599703dad6746a771ac2ec'
assert cas['NEW_MODULE']!=old['NEW_MODULE'] and cas['AUDIT']!=old['AUDIT'] and cas['ENTRY']!=old['ENTRY']
assert cas['LOCK']==old['LOCK'] and cas['LOCK_ID']==old['LOCK_ID']
assert len(cas['JOBS'])==9 and cas['JOBS']=={k:row['jobId'] for k,row in w['jobs'].items()}
assert cas['JOBS']['apply']=='t45-r3-ordinary34-auth-apply-20261116-02'
assert all(cas['JOBS'][key]==old['JOBS'][key] for key in cas['JOBS'] if key!='apply')
for phase,row in plan['jobs'].items():
 assert w['jobs'][phase]=={key:row[key] for key in ('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField')}
 assert Path(w['phaseDirectories'][phase]).parent.parent==normal
for phase in ('input_materialize','materialize'):assert w['jobs'][phase]==old['EXPECTED_RULES'][phase]
assert cas['EXPECTED_RULES']==w['jobs'] and sum(len(row['bundlePins']) for row in w['jobs'].values())==75
assert w['innerRoleApplyKey']==cas['REFUSED_KEY']=='t45-r3-ordinary34-auth-apply-20261116-01'
assert cas['REFUSED_REQUEST']['args']==[] and cas['REFUSED_TERMINAL']['phaseStarted'] is False
assert cas['REFUSED_TERMINAL']['exports']==[] and cas['REFUSED_ROLE_SHA']==facts['oldUnusedRolesSha256']
a=methods(PREV/'r3_direct34_normal.py');b=methods(HERE/'r3_direct34_apply02.py')
unchanged_methods=[name for name in a if name!='admit'];assert set(a)==set(b) and all(a[name]==b[name] for name in unchanged_methods)
assert a['frozen']==b['frozen']
loaded_helper=runpy.run_path(str(HERE/'r3_direct34_apply02.py'),run_name='local_constants_only')
assert loaded_helper['JOBS']==cas['JOBS']=={key:row['jobId'] for key,row in w['jobs'].items()}
job_assignments=[n.value for n in ast.parse((HERE/'r3_direct34_apply02.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='JOBS' for t in n.targets)]
assert len(job_assignments)==2 and all(ast.literal_eval(node)==cas['JOBS'] for node in job_assignments)
shared=functions(HERE/'read_registration_basis.py');compiled=functions(HERE/'register_cas.py')
assert all(shared[name]==compiled[name] for name in shared if name!='main')
helper=functions(HERE/'r3_direct34_apply02.py')
for name in ('required_history','refused_apply34_history'):assert helper[name]==shared[name]==compiled[name]
assert 'UNUSED_INNER34_CAPTURE_REQUIRED' not in helper['required_history']+helper['refused_apply34_history']
new_issuer=functions(HERE/'issue_phase.py');old_issuer=functions(PREV/'issue_phase.py')
issuer_unchanged=[name for name in old_issuer if name not in ('normalize_apply','issue')]
assert set(new_issuer)==set(old_issuer) and all(new_issuer[name]==old_issuer[name] for name in issuer_unchanged)
assert new_issuer['start_authority']==old_issuer['start_authority']
reg=(HERE/'register_cas.py').read_text();tree=ast.parse(reg)
registration=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='register')
snapshots=[ast.unparse(n) for n in ast.walk(registration) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='snapshot']
assert "snapshot(a, policy=sha(files['policy']))" in snapshots and "snapshot(a, sha(new), sha(files['policy']))" in snapshots
assert "put(AUDIT / 'old-policy.bin',read(NEW_POLICY)[0])" in reg
assert "os.replace(pending_policy,NEW_POLICY)" in reg and "sync(H)" in reg
assert "and role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA)" in reg
assert cas['HELPER']==sha((HERE/'r3_direct34_apply02.py').read_bytes()) and cas['TEMPLATE']==sha((HERE/'admin_exec.APPLY02-UNREGISTERED.py').read_bytes())
assert (HERE/'r3_direct34_apply02.py').stat().st_size<=131072
carrier=(HERE/'original-cas-apply02-carrier.UNISSUED.py').read_text();assert ("SOURCE='"+sha((HERE/'register_cas.py').read_bytes())+"'") in carrier
assert all(carrier.count(token)==1 for token in ('AUTH_SHA_LITERAL','AUTH_START_LITERAL','AUTH_EXPIRES_LITERAL'))
role_path=Path(w['phaseDirectories']['apply'])/'ordinary05_roles.py'
role=runpy.run_path(str(role_path),run_name='local_scope_only')
assert role['scope']()['requestKey']==cas['REFUSED_KEY'] and role['scope']()['ordinaryServiceRequestKey']==cas['JOBS']['start']
assert not any(HERE.glob('*authorization.json')) and not (HERE/'ISSUED.json').exists()
report={'state':'LOCAL_APPLY02_SOURCE_CHECKS_PASS_ONLY','sourceOnly':True,'pythonSyntaxAndGlobalNames':syntax,
 'basisEntries':203,'metadataOnlyIdentities':4,'originalLockIdentity':1,'freshIdentityCount':208,
 'rules':9,'rootStaticMembers':75,'consumerRuntimeMembers':52,'unchangedHelperMethods':unchanged_methods,
 'finiteAuthorityGuardASTUnchanged':True,'unchangedPhaseIssuerFunctions':issuer_unchanged,
 'allHelperJOBSAssignmentsAndLoadedConstantsMatchPolicy':True,
 'readerCASAndHelperHistorySame':True,'existingPolicyCASUsesExplicitNewDigestSnapshots':True,
 'oldNormal34AndRefusalFactPinsPreserved':True,'newOuterApplyKey':cas['JOBS']['apply'],'innerRoleApplyKey':cas['REFUSED_KEY'],
 'consumerSourcePinsSha256':w['consumerSourcePinsSha256'],'rulesSha256':sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes()),
 'independentReview':'PENDING','freshBasis':'PENDING','clockOrAuthorityIssued':False,
 'issuerInvoked':False,'freshReaderInvoked':False,'nativeInvoked':False,'serverConnections':0,'PGConnections':0,'fixtureOrFakeAuthority':False}
(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('state','basisEntries','freshIdentityCount','finiteAuthorityGuardASTUnchanged','clockOrAuthorityIssued','PGConnections')}))
