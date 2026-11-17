"""Only new41 proof/capture/identity/prior40 closure checks; no old test replay."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'NORMAL40-THREE-ROUTINE-MAINTENANCE-SOURCE-02'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def lit(p):
 out={}
 for n in ast.parse(p.read_bytes()).body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except(ValueError,TypeError):pass
 return out
def fn(p,name):return next(n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)and n.name==name)
checks=[]
def ck(name,v):assert v,name;checks.append(name)
def main():
 x=json.loads((HERE/'INTERFACE.UNISSUED.json').read_bytes());keys=[r['jobId']for r in x['jobs'].values()];protected=lit(HERE/'ACTUAL115-DISPATCHER.py')['R3_ORIGINAL02_ABSENT_KEYS']
 ck('five exact new keys outside protected actual115',len(protected)==115 and len(set(keys))==5 and not set(keys)&set(protected))
 ck('no new import or writer phase',set(x['jobs'])=={'apply','start','upgrade','stop','restore'}and x['writerSuccessorSelected']is False)
 runtime=HERE/'start/bundle/r3_05_runtime.py';prior=OLD/'start/bundle/r3_05_runtime.py';s=runtime.read_text();old=prior.read_text();expected=old.replace("PROOF_PROJECTION = HOST_ROOT/'authority/r3-service-39-worker-proof'","PROOF_PROJECTION = HOST_ROOT/'authority/r3-service-41-worker-proof'",1).replace('t45-first-r3-native-service-start-20261117-40','t45-first-r3-native-service-start-20261117-41').replace('t45-fresh35-first-production-20261110-r3-service-40','t45-fresh35-first-production-20261110-r3-service-41')
 ck('runtime only current41 identity and exclusive proof host path changed',s==expected)
 ck('strict exclusive mkdir and mount-plan bodies unchanged',all(ast.dump(fn(runtime,n))==ast.dump(fn(prior,n))for n in ['prepare_proof_projection','mount_plan','add_mounts_before_original_capacity']))
 ck('no old39 proof reused by41 runtime',"r3-service-39-worker-proof"not in s and"r3-service-41-worker-proof"in s)
 for ph in ['apply','restore']:
  role=HERE/ph/'bundle/ordinary05_roles.py';job=HERE/ph/'bundle/ordinary05_roles_job.py'
  ck(ph+' exact41 capture constant',"CAPTURE = WORK / 'ordinary41-auth-capture-20261117-01'"in role.read_text())
  ck(ph+' exclusive apply guard checks41 capture',"ROOT/'state/fresh35-first-production-20261110-r3/ordinary41-auth-capture-20261117-01'"in job.read_text()and 'ordinary40-auth-capture-'not in job.read_text())
  ck(ph+' original role change/restore algorithm not modified',all(ast.dump(fn(role,n))==ast.dump(fn(OLD/ph/'bundle/ordinary05_roles.py',n))for n in ['snapshot_sql','change_sql','prepare','restore','verifier']))
  ck(ph+' failed-start guard pins match new41 service',lit(job)['CURRENT_SOURCE']==sha((HERE/'start/bundle/normal_service05_after08.py').read_bytes())and lit(job)['CURRENT_PROOF_SOURCE']==sha((HERE/'start/bundle/normal_service05_after08_proof.py').read_bytes()))
 ck('original successful39 helper bytes preserved in3 bundles',all((HERE/ph/'bundle/successful39_history.py').read_bytes()==(OLD/'prior_preserved39.py').read_bytes()for ph in ['apply','start','restore']))
 for ph in ['apply','start','restore']:ck(ph+' actual closed40 wrapper byte bound',(HERE/ph/'bundle/prior_preserved38.py').read_bytes()==(HERE/'prior_closed40.py').read_bytes())
 api=runpy.run_path(str(HERE/'prior_closed40.py'),run_name='pure_historical_binding_only');hist=runpy.run_path(str(OLD/'prior_preserved39.py'),run_name='pure_prior39_binding_only');ck('binding API retains actual last successful39',api['binding']()==hist['binding']()and api['SERVICE']==hist['SERVICE'])
 close=(HERE/'prior_closed40.py').read_text();ck('failed40 precontainer facts no successful40C',"failure['cid']is None"in close and "failure['createAttempted']is False"in close and 'T45_R3_PRECONTAINER_FAILURE_V1'in close)
 ck('actual restore40 original-auth proof required',all(x in close for x in ['95f3f3fa5eaf68c0b4ab12a0bc3225fc1e74f535665dc87367123362e3f561f2','9502e078f1a550522371db45800c0d1c64fa1496b6bfb72d77521d3f614a0bc9','27a91d7c7cc83c6200fe6fbad49f524c0aa79b0b0b062fa0a0d51878aa2940aa',"'naturalExpiryCountedAsRestoration'",'CUSTODY40_METADATA']))
 ck('future C/epoch/temp role/window/auth None',x['futureCOrEpochOrRolesTemporaryValuesOrAuthorityOrWindow']is None and x['previousFailedStart40']['service']is None and x['previousFailedStart40']['epoch']is None)
 for ph,r in x['jobs'].items():
  folder=HERE/ph/'bundle';ck(ph+' exact derived bundle pin+size',all(sha((folder/n).read_bytes())==pin and(folder/n).stat().st_size==r['bundleBytes'][n]for n,pin in r['bundlePins'].items()))
  for p in folder.glob('*.py'):
   if p.read_bytes()!=(OLD/ph/'bundle'/p.name).read_bytes()if(OLD/ph/'bundle'/p.name).exists()else True:ast.parse(p.read_bytes())
   literals=lit(p)
   for k in ['STATIC_PINS','PINS']:
    if k in literals:ck(ph+'/'+p.name+' derived '+k,all(sha((folder/n).read_bytes())==pin for n,pin in literals[k].items()))
 # No Node24 rerun: exact old native code inverse after three identifier strings.
 native=(HERE/'upgrade/bundle/catalog-successor-run.mjs').read_text();prev=(OLD/'upgrade/bundle/catalog-successor-run.mjs').read_text()
 for name in ['REQUEST','START','INNER']:
  a=next(line for line in native.splitlines()if line.startswith('const '+name+'='));b=next(line for line in prev.splitlines()if line.startswith('const '+name+'='));native=native.replace(a,b,1)
 ck('native only three static literal identity changes',native==prev)
 ck('start and upgrade native exactsame41 bytes',(HERE/'start/bundle/catalog-successor-run.mjs').read_bytes()==(HERE/'upgrade/bundle/catalog-successor-run.mjs').read_bytes())
 for leaf in ['catalog-pg-driver.mjs','normal05_retained_stop.py']:
  ck('upgrade unchanged driver/retained helper '+leaf,(HERE/'upgrade/bundle'/leaf).read_bytes()==(OLD/'upgrade/bundle'/leaf).read_bytes())
 ck('H01 and SQL body checks unchanged',ast.dump(fn(HERE/'upgrade/bundle/batched161_command_update_host.py','validate'))==ast.dump(fn(OLD/'upgrade/bundle/batched161_command_update_host.py','validate')))
 cli=(HERE/'phase_cli.py').read_text().replace('PHASES41.UNISSUED.json','PHASES40.UNISSUED.json');ck('phaseCLI only blueprint name changed',cli==(OLD/'phase_cli.py').read_text())
 result={'state':'SOURCE41_ONLY_NEW_PROOF_CAPTURE_IDENTITIES_AND_CLOSED40_DELTA_CHECKED','checks':checks,'checkCount':len(checks),'old61_18_Node24_11_Root82_SQL91_H01_Replayed':False,'Node24CalledAgain':False,'serverPGIssuerClockRoleOrSourceRuntimeCalls':0,'futurePositiveFixtureCreated':False,'runtimeReady':False}
 (HERE/'DELTA41-CHECK-RESULT.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(json.dumps({'checks':len(checks),'sha256':sha((HERE/'DELTA41-CHECK-RESULT.json').read_bytes())}))
if __name__=='__main__':main()
