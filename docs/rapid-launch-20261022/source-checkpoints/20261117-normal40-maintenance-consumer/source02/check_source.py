"""Affected ordinary40 maintenance source checks; no runtime/PG/issuer."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent;V=HERE.parent;BASE=V/'NORMAL39-SOURCE-SUCCESSOR-02';HOST=V/'SETTLEMENT24-UPGRADE-HOST-SOURCE-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
def parse(path):return ast.parse(path.read_bytes())
def funcs(path):return {n.name:ast.dump(n,include_attributes=False)for n in parse(path).body if isinstance(n,ast.FunctionDef)}
def literals(path):
 out={}
 for n in parse(path).body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except(ValueError,TypeError):pass
 return out
checks=[]
def ck(name,value):
 assert value,name;checks.append(name)
def main():
 interface=json.loads((HERE/'INTERFACE.UNISSUED.json').read_bytes());blue=json.loads((HERE/'PHASES40.UNISSUED.json').read_bytes())
 ck('five exact phases no prepare/writer registered',set(interface['jobs'])==set(blue['jobs'])=={'apply','start','upgrade','stop','restore'})
 keys=[x['jobId']for x in interface['jobs'].values()];ck('five unique successor IDs',len(set(keys))==5)
 base=literals(HERE/'ACTUAL110-DISPATCHER.py');ck('all five outside actual protected110',len(base['R3_ORIGINAL02_ABSENT_KEYS'])==110 and not set(keys)&set(base['R3_ORIGINAL02_ABSENT_KEYS']))
 ck('future runtime C/epoch/temp role/auth/window absent',interface['futureCOrEpochOrRolesTemporaryValuesOrAuthorityOrWindow']is None and interface['futureClock']is None and interface['futureFiniteRoles']is None)
 for phase,rule in interface['jobs'].items():
  root=HERE/phase/'bundle'
  ck(phase+' exact static bundle pin/bytes closure',set(rule['bundlePins'])=={p.name for p in root.iterdir()if p.is_file()}and all(sha((root/n).read_bytes())==pin and(root/n).stat().st_size==rule['bundleBytes'][n]for n,pin in rule['bundlePins'].items()))
  ck(phase+' no authority bytes/role credentials generated',rule['authorityLeaf']not in rule['bundlePins']and'roles-authorization.json'not in rule['bundlePins']and rule['authoritySha256']is None)
  for f in root.glob('*.py'):
   ast.parse(f.read_bytes())
   lit=literals(f)
   for field in ('PINS','STATIC_PINS'):
    if field in lit:ck(phase+'/'+f.name+' '+field+' edge pins',all((root/n).is_file()and sha((root/n).read_bytes())==pin for n,pin in lit[field].items()))
 ck('role apply/restore sources byte-identical',all((HERE/'apply/bundle'/leaf).read_bytes()==(HERE/'restore/bundle'/leaf).read_bytes()for leaf in ['ordinary05_roles.py','ordinary05_roles_job.py']))
 for leaf in ['ordinary05_roles.py','ordinary05_roles_job.py']:
  prior=funcs(BASE/'apply/bundle'/leaf);new=funcs(HERE/'apply/bundle'/leaf)
  unchanged=['snapshot_sql','validate_snapshot','offline','capture','verifier','desired','change_sql','restore','prepare']if leaf=='ordinary05_roles.py'else['docker_args','inside','find_owned','owned','host','require_failed19_history']
  # Host lifecycle depends on new static metadata via globals, not new behavior.
  for name in unchanged:
   if name in prior:ck('retained exact auth/lifecycle '+leaf+':'+name,prior[name]==new[name])
 roles=literals(HERE/'apply/bundle/ordinary05_roles.py');ck('only original two role names',(roles['CONTROLLER'],roles['BACKUP_ADMIN'])==('erp35_controller_20261110_r3','erp35_admin_20261110_r3'))
 service=funcs(HERE/'start/bundle/normal_service05_after08.py');before=funcs(BASE/'start/bundle/normal_service05_after08.py')
 for name in ['inside','context','close_start','close_failed_start','record_precontainer_failure','failed_start_publication','record_start_cleanup','wait_runtime_ready','query_runtime']:
  ck('unchanged service startup/cleanup '+name,service[name]==before[name])
 describe=funcs(HERE/'start/bundle/start_owned_describe.py');prior=funcs(BASE/'start/bundle/start_owned_describe.py')
 for name in ['capture','put','stored','safe_native_failure','phase_trace']:ck('unchanged describe capture/reap '+name,describe[name]==prior[name])
 ds=(HERE/'start/bundle/start_owned_describe.py').read_text();ck('maintenance describe no business admin/provision original read',all(s not in ds for s in ['original-a.json','committed-result.json','finalIdentity']))
 ck('maintenance descriptor exact new3 format',"FRESH35_SETTTLEMENT"not in ds and "FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1"in ds)
 native=(HERE/'upgrade/bundle/catalog-successor-run.mjs').read_text();original=(HOST/'bundle/catalog-successor-run.mjs').read_text()
 for name in ['REQUEST','START','INNER']:
  newnode=next(line for line in native.splitlines()if line.startswith('const '+name+'='));oldnode=next(line for line in original.splitlines()if line.startswith('const '+name+'='));native=native.replace(newnode,oldnode,1)
 ck('native exact reviewed source except3 static identity slots',native==original)
 ck('describe/apply exact same bound native bytes',(HERE/'start/bundle/catalog-successor-run.mjs').read_bytes()==(HERE/'upgrade/bundle/catalog-successor-run.mjs').read_bytes())
 for leaf in ['catalog-pg-driver.mjs','fresh35-production-carrier.py','normal05_retained_stop.py']:ck('upgrade dependency inherited '+leaf,(HERE/'upgrade/bundle'/leaf).read_bytes()==(HOST/'bundle'/leaf).read_bytes())
 transport=funcs(HERE/'upgrade/bundle/catalog_transport.py');oldtransport=funcs(HOST/'bundle/catalog_transport.py');ck('upgrade transport full lifecycle functions unchanged',transport==oldtransport)
 h=funcs(HERE/'upgrade/bundle/batched161_command_update_host.py');oldh=funcs(HOST/'bundle/batched161_command_update_host.py');ck('H01 compiled predecessor layering predicate retained',h['validate']==oldh['validate'])
 ck('all old host functions except exact policy action name preserved',all(h[n]==oldh[n]for n in h if n!='main'))
 ck('stop waits this upgrade settled/absent',interface['jobs']['upgrade']['jobId']in literals(HERE/'stop/bundle/normal05_preserve_stop.py')['CURRENT_BATCH_OPERATIONS'])
 ck('prior39 original provenance not rewritten as current40',all((HERE/ph/'bundle/prior_preserved38.py').read_bytes()==(HERE/'prior_preserved39.py').read_bytes()for ph in ['apply','start','restore']))
 priorlit=literals(HERE/'prior_preserved39.py');ck('prior original39 source hash kept',priorlit['OLD_MAIN']=='8f87d994ce56007446dfa8b60c64ab28dc9d8bbb34a9c08db4f088a49f866eea')
 obs=literals(HERE/'read_phase.py');compile(obs['PROGRAM'].replace('KEY_LITERAL',repr(keys[0])).replace('LEAVES_LITERAL',repr([])),'fixed_observer_syntax','exec')
 result={'state':'SOURCE_ONLY_NORMAL40_FIVE_MAINTENANCE_AFFECTED_CHECKS','checks':checks,'checkCount':len(checks),'oldRoleNativeH01SQLAndConsumerChecksReusedNotRerun':True,'serverPGRoleIssuerClockOrNativeApplicationCalls':0,'positiveRuntimeFixtureCreated':False,'SQLInstalled':False,'runtimeReady':False,'nodeSyntaxVersion':'v25.8.2 syntax only; no native execution, no Node24 runtime claim'}
 (HERE/'CHECK-RESULT.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(json.dumps({'state':result['state'],'checks':len(checks),'sha256':sha((HERE/'CHECK-RESULT.json').read_bytes())}))
if __name__=='__main__':main()
