"""Only the newly affected generation/dependency/closure/window source delta."""
from pathlib import Path
import ast,json,hashlib,difflib
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'NORMAL41-THREE-ROUTINE-MAINTENANCE-SOURCE-01'
checks=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ck(name,value):
 assert value,name
 checks.append(name)
def functions(p):return {n.name:n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)}
def constants(p):
 out={}
 for n in ast.parse(p.read_bytes()).body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except (ValueError,TypeError):pass
 return out
def same(a,b):return ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
i=json.loads((HERE/'INTERFACE.UNISSUED.json').read_bytes())
ck('five exact42 phases and actual122 baseline',i['generation']==42 and i['oldProtectedKeys']==122 and i['candidateRootKeys']==127 and len({r['jobId']for r in i['jobs'].values()})==5)
ck('root policy and adapter format exact42',i['rootPolicyFormat']=='T45_R3_NORMAL42_BATCHED_REAL_V1' and "policy.get('format')=='T45_R3_NORMAL42_BATCHED_REAL_V1'"in(HERE/'phase_cli.py').read_text())
ck('original phase budgets preserved',[i['jobs'][p]['timeoutSeconds']for p in i['phaseOrder']]==[300,300,780,120,300]and i['parentBudgetSeconds']==5100)
for phase,rule in i['jobs'].items():
 b=HERE/phase/'bundle'
 ck('exact static bundle closure '+phase,set(p.name for p in b.iterdir()if p.is_file())==set(rule['bundlePins'])and all(sha(b/k)==v for k,v in rule['bundlePins'].items()))
 ck('no future tickets '+phase,not(b/rule['authorityLeaf']).exists()and not(b/'roles-authorization.json').exists())
start=HERE/'start/bundle'
for phase in('upgrade','stop'):
 c=constants(HERE/phase/'bundle/normal05_retained_stop.py')
 ck('actual42 support identity '+phase,c['SERVICE']==i['jobs']['start']['jobId']and c['NAME']=='t45-fresh35-first-production-20261110-r3-service-42'and c['PROOF_NAME']=='fresh35-current-production-service-v2-service-42.json')
 ck('derived exact42 live helper edges '+phase,c['READONLY_SHA']==sha(start/'r3_05_readonly.py')and c['NORMAL05_SHA']==sha(start/'normal_service05_after08.py')and c['PROOF_SHA']==sha(start/'normal_service05_after08_proof.py'))
 old=functions(OLD/phase/'bundle/normal05_retained_stop.py');new=functions(HERE/phase/'bundle/normal05_retained_stop.py')
 for f in('inspect_birth','matches_process','generation_present','close_exact','data_identity','tcp_rows'):
  ck('retained lifecycle unchanged '+phase+'/'+f,same(old[f],new[f]))
 ck('public proof metadata scoped to service_evidence '+phase,'NORMAL05_STOP_PUBLIC_PROOF_METADATA_REQUIRED'in ast.get_source_segment((HERE/phase/'bundle/normal05_retained_stop.py').read_text(),new['service_evidence']))
stop=constants(HERE/'stop/bundle/normal05_preserve_stop.py')
ck('stop exact support edge',stop['STOP_REFERENCE']==sha(HERE/'stop/bundle/normal05_retained_stop.py'))
host=constants(HERE/'upgrade/bundle/batched161_command_update_host.py')
ck('upgrade static member dependencies exact',host['PINS']=={p.name:sha(p)for p in(HERE/'upgrade/bundle').iterdir()if p.name!='batched161_command_update_host.py'})
ck('three approved SQL and routine pins unchanged',host['SQL_SHA256']=='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'and host['ROUTINE_PINS']==constants(OLD/'upgrade/bundle/batched161_command_update_host.py')['ROUTINE_PINS'])
ck('driver reused without Node rerun',(HERE/'upgrade/bundle/catalog-pg-driver.mjs').read_bytes()==(OLD/'upgrade/bundle/catalog-pg-driver.mjs').read_bytes())
native=(HERE/'upgrade/bundle/catalog-successor-run.mjs').read_text();prior=(OLD/'upgrade/bundle/catalog-successor-run.mjs').read_text()
for a,b in [('t45-r3-settlement24-three-routine-upgrade41-20261117-01',i['jobs']['upgrade']['jobId']),('t45-first-r3-native-service-start-20261117-41',i['jobs']['start']['jobId']),('fresh35-settlement24-three-routine-41-v1.json','fresh35-settlement24-three-routine-42-v1.json')]:prior=prior.replace(a,b)
ck('native only static identity delta no SQL algorithm change',native==prior)
oldhost=functions(OLD/'upgrade/bundle/batched161_command_update_host.py');newhost=functions(HERE/'upgrade/bundle/batched161_command_update_host.py')
for name in('validate','installed','recovery_facts'):
 ck('upgrade program and transaction admission unchanged '+name,same(oldhost[name],newhost[name]))
transport=(HERE/'upgrade/bundle/catalog_transport.py').read_text()
ck('work lease separately bound to outer minus35000',"work==start['serviceLeaseExpiresAt']-35000"in transport and "a['expiresAt']<=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']"in transport)
ck('transport child and connection lifecycle unchanged',all(same(functions(OLD/'upgrade/bundle/catalog_transport.py')[f],functions(HERE/'upgrade/bundle/catalog_transport.py')[f])for f in('child_run','put','sync')))
for phase in('apply','restore'):
 old=functions(OLD/phase/'bundle/ordinary05_roles.py');new=functions(HERE/phase/'bundle/ordinary05_roles.py')
 ck('all role algorithms unchanged '+phase,all(same(old[name],new[name])for name in old if name!='scope'))
 h=constants(HERE/phase/'bundle/ordinary05_roles_job.py')
 ck('host42 actual source bindings '+phase,h['CURRENT_SOURCE']==sha(start/'normal_service05_after08.py')and h['CURRENT_PROOF_SOURCE']==sha(start/'normal_service05_after08_proof.py')and h['STATIC_PINS']['prior_preserved38.py']==sha(HERE/'prior_closed41.py'))
 ck('closed40 and39 original history retained '+phase,(HERE/phase/'bundle/closed40_history.py').read_bytes()==(OLD/phase/'bundle/prior_preserved38.py').read_bytes()and(HERE/phase/'bundle/successful39_history.py').read_bytes()==(OLD/phase/'bundle/successful39_history.py').read_bytes())
 for name in('host','docker_args','inside','owned','original_stopped'):
  ck('auth own lifecycle unchanged '+phase+'/'+name,same(functions(OLD/phase/'bundle/ordinary05_roles_job.py')[name],functions(HERE/phase/'bundle/ordinary05_roles_job.py')[name]))
ck('start prior source edge exact',constants(start/'normal_service05_after08.py')['PRIOR32_SHA']==sha(HERE/'prior_closed41.py'))
ck('start runtime readonly edges exact',constants(start/'normal_service05_after08.py')['READONLY_SHA']==sha(start/'r3_05_readonly.py')and constants(start/'normal_service05_after08.py')['R3_RUNTIME_SHA']==sha(start/'r3_05_runtime.py'))
ck('new projection and capture are exclusive42 paths',"authority/r3-service-42-worker-proof"in(start/'r3_05_runtime.py').read_text()and i['captureDirectory']=='ordinary42-auth-capture-20261117-01')
proof=(start/'normal_service05_after08_proof.py').read_text();prior41=(HERE/'prior_closed41.py').read_text()
ck('true41 guardian closure typed not a successful Stop41',"previousGuardianClosureReason"in proof and 'SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED'in proof and 'previousStopRequestKey'not in proof and 'previousStopTerminalSha256'not in proof)
ck('actual failed41 and rollback01 outcomes preserved',all(x in prior41 for x in('f797d647','d7e54f89','16ae7614',"terminal(key,pin,'FAILED',2)")))
ck('private snapshots stat only in prior41',"for leaf,expected in SNAPSHOTS.items()"in prior41 and "s=path.lstat()"in prior41 and 'ops.read_file(CUSTODY/leaf'not in prior41)
for name in('authority','phase_argument','execute'):
 ck('original CLI no arbitrary authority or arguments '+name,same(functions(OLD/'phase_cli.py')[name],functions(HERE/'phase_cli.py')[name]))
for p in HERE.rglob('*.py'):compile(p.read_bytes(),str(p),'exec')
ck('affected Python syntax compile only',True)
r={'state':'SOURCE42_SCOPED_DELTA_CHECKS_PASS_NOT_EXECUTED','checks':checks,'count':len(checks),'serverOrClockOrIssuerOrCASOrPGCalls':0,'NodeOrOldScaleChecksRerun':False,'runtimePositiveFixtureCreated':False}
(HERE/'DELTA42-CHECK-RESULT.json').write_text(json.dumps(r,sort_keys=True,indent=2)+'\n')
patch=''
for phase in i['phaseOrder']:
 for p in sorted((HERE/phase/'bundle').iterdir()):
  old=OLD/phase/'bundle'/p.name
  if old.is_file()and p.read_bytes()!=old.read_bytes():patch+=''.join(difflib.unified_diff(old.read_text().splitlines(True),p.read_text().splitlines(True),fromfile='source41/'+phase+'/'+p.name,tofile='source42/'+phase+'/'+p.name))
(HERE/'SOURCE-DELTA.patch').write_text(patch)
print(json.dumps({'checks':len(checks),'resultSHA':sha(HERE/'DELTA42-CHECK-RESULT.json')},sort_keys=True))
