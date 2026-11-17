"""One local joint SOURCE check on real historical metadata; no issuance or runtime."""
from pathlib import Path
import ast,base64,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()

def checked(path,pin):
 raw=Path(path).read_bytes();assert sha(raw)==pin;return json.loads(raw)

def source_scope(source,collector):
 env={}
 for n in ast.parse(source).body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:value=ast.literal_eval(n.value)
   except (TypeError,ValueError):
    try:value=collector['path_expression'](n.value,env)
    except (KeyError,TypeError,ValueError):continue
   env[n.targets[0].id]=value
 return env

def main():
 witness=json.loads((HERE/'SIX-PHASES.UNISSUED.json').read_text())
 consumer=Path(witness['consumerSourceDirectory']);cp=checked(consumer/'SOURCE-PINS.json',witness['consumerSourcePinsSha256'])
 interface=checked(consumer/'INTERFACE.UNISSUED.json',witness['consumerInterfaceSha256'])
 cas=runpy.run_path(str(HERE/'register_cas.py'),run_name='source_constants_only')
 helper=runpy.run_path(str(HERE/'r3_direct38_aux_prepare.py'),run_name='source_constants_only_helper')
 issuer=runpy.run_path(str(HERE/'issue_registration.py'),run_name='source_issuer_definitions_only')
 rules,folders=issuer['checked_static_rules'](witness,cas)
 for path in HERE.glob('*.py'):compile(path.read_bytes(),str(path),'exec')
 assert len((HERE/'r3_direct38_aux_prepare.py').read_bytes())<=131072 and len((HERE/'register_cas.py').read_bytes())<=131072
 assert cas['HELPER']==sha((HERE/'r3_direct38_aux_prepare.py').read_bytes())and cas['TEMPLATE']==sha((HERE/'admin_exec.NORMAL38-UNREGISTERED.py').read_bytes())
 # Actual SOURCE scope, not finite authority, current epoch or target construction.
 phase=runpy.run_path(str(HERE/'issue_phase.py'),run_name='source_phase_definitions_only')
 pair=phase['load_issuer_pair']();host=runpy.run_path(str(folders['prepare']/'final33_host.py'),run_name='source_host_scope_only')
 assert pair['MAPPING']==witness['preparationIdentityMapping']==interface['preparationIdentityMapping']
 assert host['PREPARE']==pair['OUTER']=='t45-r3-final33-plan-prepare-20261116-04' and host['LOGICAL_PREPARE']==pair['LOGICAL']=='t45-r3-final33-plan-prepare-20261116-01'
 assert host['scope']()['batchPlanPath']==pair['MAPPING']['batchPlanPath']
 decision=checked(witness['continuationDecision']['path'],witness['continuationDecision']['sha256'])
 assert decision['normalGeneration']==38 and decision['finiteAuthorityIssued']is False and decision['outerPreparationAttemptKey']==pair['OUTER']
 # Reconstruct new rows from pinned typed existing37 input fields, without generation replace.
 prior=checked(ROOT/'outputs/D1/20261117-r3-normal37-root-source-02/EXISTING-PATH-MAP.json','a8d82e43eb983e5303e8deb6df38f25fe4f820a751e696e7a99f1555716de123')
 actual=json.loads((HERE/'EXISTING-PATH-MAP.json').read_text());inputs=json.loads((HERE/'EXISTING37-INPUTS.json').read_text())['rows'];actualpins={str(k):v for k,v in cas['BASIS'].items()}
 assert actualpins==actual['existingPins'] and len(actualpins)==324
 for row in inputs.values():assert checked(row['path'],row['sha256'])==row['value']
 check=runpy.run_path(str(HERE/'history_guard_assertions.py'),run_name='static_history_assertions');dispatcher=str(cas['P']/'admin_exec.py');check['assert_preserved_history'](actualpins,prior['existingPins'],dispatcher,decision['activeRootBaseline']['dispatcherSha256'])
 assert len(cas['CUSTODY_FILES'])==20 and cas['CUSTODY_FILES']==helper['CUSTODY_FILES']==actual['privateMetadataOnlyPaths']
 assert cas['HISTORY37']==helper['HISTORY37']==actual['history37']
 for phase_name,row in actual['history37'].items():
  typed=inputs[phase_name]['value'];assert row['key']==typed['terminal']['jobId'] and row['terminal']==typed['rootPins']['terminal'] and row['root']==typed['rootPins']['result'] and row['public']==typed['publicResultSha256']
 h=str(cas['HOST'])if'HOST'in cas else'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
 assert actualpins[h+'/state/native-services/ordinary36-auth-20261116-01/restored.json']=='60d6d5a5b16b321c334222ffaef9dc8ac0a0bf69e822878743a920151bfdbb4d'
 assert actualpins[h+'/state/native-services/ordinary36-auth-20261116-01/authority.json']=='d8341c2a2f0067bf33073a1001e1f50f7f91f6fb872b626a8d2dbd9d57bea57f'
 assert actualpins[h+'/state/native-services/ordinary37-auth-20261116-01/restored.json']==cas['CLOSED37_RESTORED_SHA']=='9a4711ac1b3feb35520261f3830e06f08c4ff3d824a66be0f7979cdaeae8d7c9'
 # Bind the declared original37 registration source path to its genuine Main envelope.
 original=json.loads((ROOT/'outputs/主控/20261117-r3-normal37-registration-window-01/registration-envelope.json').read_text())
 assert sha(base64.b64decode(original['source'],validate=True))==actualpins[str(cas['B']/'r3-normal37-registration-source-20261117-01/register_cas.py')]
 collector=runpy.run_path(str(HERE/'collect_guard_paths.py'),run_name='static_actual_guard_collection')
 cs=(HERE/'register_cas.py').read_text();hs=(HERE/'r3_direct38_aux_prepare.py').read_text()
 rows=collector['collect'](cs,('quiet','register'),source_scope(cs,collector))+collector['collect'](hs,('admit',),source_scope(hs,collector))
 check['assert_no_guard_collision']([*actualpins,*cas['CUSTODY_FILES']],rows)
 # The same assertions reject the real failed SOURCE01 P04-R01; no fabricated malformed map.
 oldsource=ROOT/'outputs/D1/20261117-r3-normal37-live-pending04-source-01/live_cas.py';osource=oldsource.read_text();otree=ast.parse(osource);oldmap=next(ast.literal_eval(n.value)for n in otree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='ACTUAL'for t in n.targets));oldrows=collector['collect'](osource,('custody',),source_scope(osource,collector));rejected=[]
 for label,fn,args in [('history',check['assert_preserved_history'],(oldmap,prior['existingPins'],dispatcher,decision['activeRootBaseline']['dispatcherSha256'])),('must_absent',check['assert_no_guard_collision'],(list(oldmap),oldrows))]:
  try:fn(*args)
  except AssertionError:rejected.append(label)
 assert rejected==['history','must_absent']
 template=ast.parse((HERE/'admin_exec.NORMAL38-UNREGISTERED.py').read_text());protected=next(ast.literal_eval(n.value)for n in template.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));old=ast.parse((ROOT/'outputs/主控/20261117-r3-normal37-registration-window-01/admin_exec.ISSUED.py').read_text());prefix=next(ast.literal_eval(n.value)for n in old.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));guards=[n for n in ast.walk(template)if isinstance(n,ast.Compare)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.comparators)]
 assert protected[:len(prefix)]==prefix and set(cas['JOBS'].values())<=set(protected)and len(guards)==3
 assert helper['JOBS']=={**helper['JOBS'],**cas['JOBS']} and len(cas['JOBS'])==6 and len(helper['JOBS'])==9
 assert set(helper['JOBS'])-set(cas['JOBS'])=={'catalog_update','input_materialize','materialize'}
 # Static source/wrapper preparation precedes first actual Main time read.
 for name,func in [('issue_registration.py','issue'),('issue_phase.py','issue')]:
  text=(HERE/name).read_text();ft=next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef)and n.name==func)
  clocks=[n.lineno for n in ast.walk(ft)if isinstance(n,ast.Call)and ast.unparse(n.func)=='time.time_ns'];compiles=[n.lineno for n in ast.walk(ft)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='compile']
  assert clocks and any(n<min(clocks)for n in compiles)
 report=dict(state='LOCAL_JOINT_SOURCE38_REAL_METADATA_PASS_NOT_RUNTIME',consumerSourcePinsSha256=witness['consumerSourcePinsSha256'],rulesSha256=sha((HERE/'SIX-PHASES.UNISSUED.json').read_bytes()),existingPins=324,privateStatOnly=20,actualGuardPaths=len({r['path']for r in rows}),guardIntersections=[],sameAssertionsRejectRealBe853=rejected,protectedOldPrefix=len(prefix),protectedCurrentTotal=len(protected),allSixCurrentJobsCoveredByThreeExistingGuards=True,helperBytes=len((HERE/'r3_direct38_aux_prepare.py').read_bytes()),casBytes=len((HERE/'register_cas.py').read_bytes()),staticSourcesCompiledBeforeMainClock=True,sourceOnly=True,serverActions=0,PGConnections=0,clockRead=False,issuerCalled=False,syntheticOrFutureAuthorityOrTargetFixtureCreated=False)
 return report,rows
if __name__=='__main__':
 report,rows=main();(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');(HERE/'GUARD-PATHS.json').write_text(json.dumps({'state':'STATIC_SOURCE_PATHS_NOT_RUNTIME_ABSENCE','rows':rows,'paths':sorted({r['path']for r in rows})},sort_keys=True,indent=2)+'\n');print(json.dumps(report,sort_keys=True))
