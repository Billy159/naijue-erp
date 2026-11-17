"""Bind T45 recovery consumer only after its final SOURCE is available."""
from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];OLD=D.with_name('20261117-r3-ordinary41-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def replace_assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY.json').read_bytes());binding=json.loads((D/'CONSUMER-BINDING.json').read_bytes());h.update(binding['history']);rule=binding['rule'];h['jobs']={'rollback':h['newJobId']}
 module=(D/'admission.template.py').read_text().replace('__HISTORY__',repr(h)).replace('__RULE__',repr(rule))
 s=(OLD/'r3_normal41_continuation.py').read_text();cls=next(n for n in ast.parse(s).body if isinstance(n,ast.ClassDef)and n.name=='Normal41Continuation');fz=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='frozen');lines=s.splitlines(True);helper=''.join(lines[fz.lineno-1:fz.end_lineno]);module=module.replace(' def frozen(self,phase,job,private):\n__FROZEN__',helper.rstrip())
 # Append frozen under the class, not after a top-level declaration.
 compile(module,'recovery_admission','exec');(D/'r3_original_auth41_rollback02.py').write_text(module)
 actual=(D/'ACTUAL121-DISPATCHER.py').read_bytes();assert sha(actual)==h['dispatcherSha256']
 text=actual.decode();tree=ast.parse(text);n=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));keys=ast.literal_eval(n.value);assert len(keys)==121 and h['newJobId']not in keys
 text=text.replace(ast.get_source_segment(text,n),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[h['newJobId']]),1)
 const="ORIGINAL_AUTH41_ROLLBACK02_KEY = "+repr(h['newJobId'])+"\nORIGINAL_AUTH41_ROLLBACK02_MODULE_SHA256 = "+repr(sha(module.encode()))+"\nORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256 = None\n\n"
 text=text.replace('def check(value, code):',const+'def check(value, code):',1)
 helper='''def original_auth41_rollback02(core,prior,cfg):
    from types import ModuleType
    prior=normal41_continuation(core,prior,cfg)
    path=canonical(PUBLIC/'r3_original_auth41_rollback02.py');raw=core.read(path)
    check(ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==ORIGINAL_AUTH41_ROLLBACK02_MODULE_SHA256,'R3_CONTINUITY_ORIGINAL_AUTH41_ROLLBACK02_NOT_REGISTERED')
    module=ModuleType('original_auth41_rollback02');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.Rollback(core,prior,cfg,ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256)

'''
 text=text.replace('def fixed_install_code_member(cfg,job,row):',helper+'def fixed_install_code_member(cfg,job,row):',1)
 marker="                    if job['jobId']==R3_05_EXECUTE_KEY:"
 text=text.replace(marker,"                    if job['jobId']==ORIGINAL_AUTH41_ROLLBACK02_KEY:\n                        hold=original_auth41_rollback02(continuity,hold,cfg)\n"+marker,1)
 compile(text,'recovery_dispatcher','exec');(D/'admin_exec.ROLLBACK-UNREGISTERED.py').write_text(text)
 cas=(OLD/'register_cas.py').read_text();cas=replace_assignment(cas,'JOBS',{'rollback':h['newJobId']});cas=replace_assignment(cas,'EXPECTED_RULES',{'rollback':rule});cas=replace_assignment(cas,'OLD',h['dispatcherSha256'])
 for a,b in [('r3-normal41-registration','r3-original-auth41-rollback02-registration'),('r3_normal41_continuation.py','r3_original_auth41_rollback02.py'),('direct41-batched-real.json','original-auth41-rollback-only-20261117-02.json'),('.normal41-dispatcher.pending','.original-auth41-rollback02-dispatcher.pending'),('NORMAL41_POLICY_SHA256','ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256'),('T45_NORMAL41_REGISTRATION_CAS_V1','T45_ORIGINAL_AUTH41_ROLLBACK02_REGISTRATION_CAS_V1'),('EXACT_NORMAL41_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED','EXACT_ORIGINAL_AUTH41_ROLLBACK02_ROOT_REGISTERED_NO_ROLLBACK_SUBMITTED'),('old115AndThreeGuardsPreserved','old121AndThreeGuardsPreserved')]:cas=cas.replace(a,b)
 extra="PRESERVE.update({str(P/'r3_normal41_continuation.py'):'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce',str(H/'direct41-batched-real.json'):'5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9'})\n"
 cas=cas.replace('sha=lambda raw:',extra+'sha=lambda raw:',1)
 cas=cas.replace('sha=lambda raw:', "PRESERVE.update({str(P/'r3_original_auth41_rollback.py'):"+repr(h['rollback01ModuleSha256'])+",str(H/'original-auth41-rollback-only-20261117-01.json'):"+repr(h['rollback01PolicySha256'])+"})\n"+'sha=lambda raw:',1)
 for leaf,pin in [('r3-outer-terminal.json',h['failedRollback01']['terminalSha256']),('results/maintenance-auth-result.json',h['failedRollback01']['resultSha256'])]:cas=cas.replace('sha=lambda raw:',"PRESERVE.update({str(B/'jobs/"+h['failedRollback01']['key']+"/"+leaf+"'):"+repr(pin)+"})\n"+'sha=lambda raw:',1)
 # No stopped-PG fiction: registration is admitted only for this live owned C41.
 tree=ast.parse(cas);n=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='quiet')
 quiet='''def closed41():
 from types import ModuleType
 raw,_=read(P/'admin_exec.py');w=ModuleType('actual_root120');w.__file__=str(P/'admin_exec.py');exec(compile(raw,w.__file__,'exec'),w.__dict__)
 cfg=json.loads(read(P/'grant.json')[0]);core,prior=w.r3_continuity(cfg);prior=w.normal41_continuation(core,prior,cfg)
 raw,_=read(ENTRY.with_name('r3_original_auth41_rollback02.py'));m=ModuleType('recovery_live');m.__file__=str(ENTRY.with_name('r3_original_auth41_rollback02.py'));exec(compile(raw,m.__file__,'exec'),m.__dict__)
 return m.closed41(core,prior,need)

def quiet(expected_diagnostic=None):
 import subprocess
 closure=closed41()
 for grant in (B,C,B.with_name('grant-5cc58239751e4e2a'),C.with_name('grant-5cc58239751e4e2a')):
  for key in KEYS:need(not any(os.path.lexists(grant/rel)for rel in('jobs/'+key,'requests/'+key+'.json','requests/'+key+'.tmp','results/'+key+'.json')),'RECOVERY_KEY_ALREADY_PRESENT_NO_REPLAY')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-*'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and not q.stdout.strip(),'NO_OTHER_ACTIVE_OPERATION_REQUIRED')
 return dict(closure,newRollbackKeyAbsent=True,PGConnections=0,mutations=0)
'''
 cas=cas.replace(ast.get_source_segment(cas,n),quiet,1)
 tree=ast.parse(cas);n=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='validate_policy_delta')
 validator="""def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_ORIGINAL_AUTH41_ROLLBACK02_ONLY_V1'and p['grantId']=='b16447fbc81f4d64'and set(p['jobs'])=={'rollback'},'EXACT_SINGLE_RECOVERY_POLICY_REQUIRED')
 r=dict(p['jobs']['rollback']);pins=dict(r['bundlePins']);inner=pins.pop('roles-authorization.json',None);r['bundlePins']=pins
 need(r==EXPECTED_RULES['rollback']and type(inner)is str and re.fullmatch('[a-f0-9]{64}',inner),'EXACT_ROLLBACK_INNER_PIN_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=p['startsAt']+900000,'ORIGINAL_C41_AND_RESTORE_DEADLINES_REQUIRED')
"""
 cas=cas.replace(ast.get_source_segment(cas,n),validator,1)
 cas=cas.replace("module.Normal41Continuation(core,prior,cfg,sha(policy_raw))","module.Rollback(core,wrapper.normal41_continuation(core,prior,cfg),cfg,sha(policy_raw))")
 cas=cas.replace("now()+600000<policy['expiresAt']","now()+30000<policy['expiresAt']")
 fixed={str(Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_normal41_continuation.py')):h['module41Sha256'],str(Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct41-batched-real.json')):h['policy41Sha256']}
 base='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'
 for key,pin in binding['actualCurrentBatchTerminals'].items():fixed[base+key+'/r3-outer-terminal.json']=pin
 fixed[base+h['service']['serviceKey']+'/r3-outer-terminal.json']=h['startPins']['terminal']
 fixed[base+h['service']['serviceKey']+'/results/normal-service-result.json']=h['startPins']['result']
 fixed[base+h['failedStop']['key']+'/results/normal05-preserve-stop-result.json']=h['failedStop']['resultSha256']
 cas=cas.replace('sha=lambda raw:', 'RECOVERY_SERVICE='+repr(h['service'])+'\nPRESERVE.update('+repr(fixed)+')\nsha=lambda raw:',1)
 # This new rollback-only stage has never been used.
 cas=cas.replace('sha=lambda raw:', 'CUSTODY.extend(Path(path)for path in '+repr(list(h['snapshotMetadata6']))+')\nsha=lambda raw:',1)
 compile(cas,'rollback_cas','exec');(D/'register_cas.py').write_text(cas)
 (D/'HISTORY.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n');print('Rendered root121 safety source only; no running entry invoked.')
if __name__=='__main__':main()
