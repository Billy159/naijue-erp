"""Existing narrow source/constant checks for normal35; no entry, issuer or native calls."""
from pathlib import Path
import ast,builtins,hashlib,json,runpy,symtable
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2];PREV=HERE.parent/'20261117-r3-normal34-apply02-root-source-02'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def methods(path):
 c=next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.ClassDef))
 return {n.name:ast.dump(n,include_attributes=False) for n in c.body if isinstance(n,ast.FunctionDef)}
def functions(path):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef)}
syntax=[]
for p in HERE.glob('*.py'):
 s=p.read_text();compile(s,str(p),'exec');syntax.append(p.name);tab=symtable.symtable(s,str(p),'exec')
 defined={x.get_name() for x in tab.get_symbols() if x.is_assigned() or x.is_imported() or x.is_namespace()};used=set()
 def walk(t):
  for c in t.get_children():
   used.update(x.get_name() for x in c.get_symbols() if x.is_global() and x.is_referenced());walk(c)
 walk(tab);assert not used-defined-set(dir(builtins))-{'__file__','__name__'},p
cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='local_constants_only')
helper=runpy.run_path(str(HERE/'r3_direct35_normal.py'),run_name='local_constants_only')
reader=runpy.run_path(str(HERE/'read_registration_basis.py'),run_name='local_constants_only')
old=runpy.run_path(str(PREV/'register_cas.py'),run_name='local_constants_only')
facts=json.loads((HERE/'CURRENT-FACTS.json').read_bytes());w=json.loads((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())
normal=Path(w['consumerSourceDirectory']);frozen=json.loads((normal/'SOURCE-PINS.json').read_bytes());plan=json.loads((normal/'PHASES35.UNISSUED.json').read_bytes())
assert sha((normal/'SOURCE-PINS.json').read_bytes())==w['consumerSourcePinsSha256']=='8b8f63b0ed37613c816db0d3c8c16b1acf5902d61266be6b8b8cc7cd93bb193a'
interface=json.loads((normal/'INTERFACE.UNISSUED.json').read_bytes())
assert Path(interface['executionCLI']['source']).resolve()==normal/'phase_cli.py'
for leaf,row in frozen['files'].items():
 raw=(normal/leaf).read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
rules={key:row['jobId'] for key,row in w['jobs'].items()}
assert helper['JOBS']==cas['JOBS']==reader['JOBS']==rules and len(rules)==9
assignments=[n.value for n in ast.parse((HERE/'r3_direct35_normal.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='JOBS' for t in n.targets)]
assert len(assignments)==2 and all(ast.literal_eval(n)==rules for n in assignments)
assert helper['ORIGINAL_JOBS']==cas['ORIGINAL_JOBS']==reader['ORIGINAL_JOBS']==old['ORIGINAL_JOBS']
assert helper['USED']==old['USED'] and helper['COMPLETED']==old['COMPLETED']
assert w['predecessor']==plan['predecessor']=={'service':facts['start34ServiceTuple'],'bindings':cas['CLOSED34_BINDINGS']}
assert w['priorService']==facts['start34ServiceTuple'] and helper['SERVICE_KEY']==rules['start']
assert str(helper['PROOF']).endswith('fresh35-current-production-service-v2-service-35.json')
assert helper['POLICY_NAME']==cas['NEW_POLICY'].name=='direct35-batched-real.json'
assert cas['NEW_POLICY'] not in cas['BASIS'] and old['NEW_POLICY'] in cas['BASIS']
assert len(cas['BASIS'])==222 and {str(k):v for k,v in cas['BASIS'].items()}==facts['basis']
assert cas['OLD_DISPATCHER']==facts['currentRoot']['dispatcher']
assert cas['CUSTODY_FILES']==helper['CUSTODY_FILES']==reader['CUSTODY_FILES']==facts['privateMetadataOnlyPaths'] and len(cas['CUSTODY_FILES'])==8
assert cas['LOCK']==old['LOCK'] and cas['LOCK_ID']==old['LOCK_ID']
assert cas['CLOSED34_SERVICE']==helper['CLOSED34_SERVICE']==reader['CLOSED34_SERVICE']==facts['start34ServiceTuple']
assert cas['CLOSED34_SERVICE']['postmasterStart']=='2026-11-16 17:11:22.392132+00'
assert cas['CLOSED34_RESTORED_SHA']=='381d10acbc171f793e785366d3b3b74899bd344bf67235e9fefd4601ee2666a2'
for phase,row in plan['jobs'].items():
 assert w['jobs'][phase]=={k:row[k] for k in ('jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField')}
 assert Path(w['phaseDirectories'][phase]).parent.parent==normal
for phase in ('input_materialize','materialize','catalog_update','prepare','writer'):assert rules[phase]==old['JOBS'][phase]
assert sum(len(row['bundlePins']) for row in w['jobs'].values())==75
assert cas['EXPECTED_RULES']==w['jobs']
a=methods(PREV/'r3_direct34_apply02.py');b=methods(HERE/'r3_direct35_normal.py');unchanged=[k for k in a if k!='admit']
assert set(a)==set(b) and all(a[k]==b[k] for k in unchanged) and a['frozen']==b['frozen']
cf=functions(HERE/'register_cas.py');rf=functions(HERE/'read_registration_basis.py');hf=functions(HERE/'r3_direct35_normal.py')
assert all(cf[k]==rf[k] for k in rf if k!='main')
assert all(hf[k]==cf[k]==rf[k] for k in ('required_history','closed34_history','refused_apply34_history'))
assert 'ordinary35-auth' not in hf['closed34_history'] and 'postmaster.pid' not in hf['closed34_history']
assert 'EXACT_CLOSED34_CONTAINERS_STOPPED_REQUIRED' in hf['closed34_history']
assert 'ordinary34-auth-20261116-01' not in cf['quiet']
assert 'ordinary35-auth-20261116-01' in cf['quiet'] and 'ordinary35-auth-capture-20261116-01' in cf['quiet']
reg=(HERE/'register_cas.py').read_text();assert "put(AUDIT / 'old-policy.bin',read(H/'direct34-batched-real.json')[0])" in reg
assert "put(NEW_POLICY,files['policy'])" in reg and 'pending_policy=' not in reg
assert 'role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA,CLOSED34_ROLE_SHA)' in reg
assert cas['HELPER']==sha((HERE/'r3_direct35_normal.py').read_bytes()) and cas['TEMPLATE']==sha((HERE/'admin_exec.NORMAL35-UNREGISTERED.py').read_bytes())
assert (HERE/'r3_direct35_normal.py').stat().st_size<=131072
carrier=(HERE/'original-cas-normal35-carrier.UNISSUED.py').read_text();assert ("SOURCE='"+sha((HERE/'register_cas.py').read_bytes())+"'") in carrier
assert all(carrier.count(token)==1 for token in ('AUTH_SHA_LITERAL','AUTH_START_LITERAL','AUTH_EXPIRES_LITERAL'))
oldf=functions(PREV/'issue_phase.py');newf=functions(HERE/'issue_phase.py');issuer_unchanged=[k for k in oldf if k not in ('normalize_apply','issue')]
assert set(oldf)==set(newf) and all(oldf[k]==newf[k] for k in issuer_unchanged)
role=runpy.run_path(str(Path(w['phaseDirectories']['apply'])/'ordinary05_roles.py'),run_name='local_scope_only')
scope=role['scope']();assert scope['requestKey']==rules['apply'] and scope['ordinaryServiceRequestKey']==rules['start'] and scope['previousServiceRequestKey']==facts['start34ServiceTuple']['serviceKey']
assert scope['restoreRequestKey']==rules['restore']
review_path=ROOT/'outputs/QB/20261117-r3-normal35-consumer-review-03/RESULT.json';review_raw=review_path.read_bytes()
assert sha(review_raw)=='f5262466669bd1120bd183fa6191dbe39a71a5fea5f3178a531fc76b0e189ae6'
review=json.loads(review_raw);assert review['state']=='SOURCE_PASS_NORMAL35_CONSUMER_03_ONLY_PENDING_ROOT_PAIR' and review['findings']==[] and review['sourceOnly'] is True
assert review['sourcePinsSha256']==w['consumerSourcePinsSha256']
issuer_source=(HERE/'issue_registration.py').read_text()
assert "consumer_review['sourcePinsSha256']==CONSUMER_PIN" in issuer_source
assert "SOURCE_PASS_NORMAL35_CONSUMER_03_ONLY_PENDING_ROOT_PAIR" in issuer_source
assert 'f5262466669bd1120bd183fa6191dbe39a71a5fea5f3178a531fc76b0e189ae6' in issuer_source
assert not any(HERE.glob('*authorization.json')) and not (HERE/'ISSUED.json').exists()
report={'state':'LOCAL_NORMAL35_SOURCE_CHECKS_PASS_ONLY','sourceOnly':True,'pythonSyntaxAndGlobalNames':syntax,
 'actualHelperCASReaderJOBSEqualsAll9Rules':True,'bothHelperJOBSAssignmentsConsistent':True,'ORIGINAL_JOBSHistoricalUnchanged':True,
 'basisEntries':222,'privateMetadataOnlyIdentities':8,'totalFreshIdentitiesIncludingLock':231,
 'predecessorExactlyReal34InBlueprintWitnessAndCode':True,'unchangedHelperMethods':unchanged,
 'finiteAuthorityGuardASTUnchanged':True,'unchangedPhaseIssuerFunctions':issuer_unchanged,
 'rootHistorySharedAcrossHelperCASReader':True,'oldCurrent34PolicyPreservedNew35PolicyPathIndependent':True,
 'consumerSourcePinsSha256':w['consumerSourcePinsSha256'],'rulesSha256':sha((HERE/'NINE-PHASES.UNISSUED.json').read_bytes()),
 'consumerIndependentReview':'SOURCE_PASS_FINAL03_F5262466_REUSED','rootIndependentReview':'PENDING',
 'rootTargetOrNativeInstances':0,'readerIssuerOrCarrierInvoked':False,'serverConnections':0,'PGConnections':0,
 'clockIssued':False,'newKeySubmitted':False,'runtimeCandidatePass':False}
(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('state','basisEntries','totalFreshIdentitiesIncludingLock','actualHelperCASReaderJOBSEqualsAll9Rules','clockIssued','PGConnections')}))
