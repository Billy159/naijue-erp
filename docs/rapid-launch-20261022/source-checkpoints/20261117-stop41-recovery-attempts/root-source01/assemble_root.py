"""Bind T45 recovery consumer only after its final SOURCE is available."""
from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];OLD=D.with_name('20261117-r3-ordinary41-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def replace_assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY.json').read_bytes());binding=json.loads((D/'CONSUMER-BINDING.json').read_bytes());h.update(binding['history']);rule=binding['rule'];h['jobs']={'stop':h['newJobId']}
 module=(D/'admission.template.py').read_text().replace('__HISTORY__',repr(h)).replace('__RULE__',repr(rule))
 s=(OLD/'r3_normal41_continuation.py').read_text();cls=next(n for n in ast.parse(s).body if isinstance(n,ast.ClassDef)and n.name=='Normal41Continuation');fz=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='frozen');lines=s.splitlines(True);helper=''.join(lines[fz.lineno-1:fz.end_lineno]);module=module.replace(' def frozen(self,phase,job,private):\n__FROZEN__',helper.rstrip())
 # Append frozen under the class, not after a top-level declaration.
 compile(module,'recovery_admission','exec');(D/'r3_stop41_recovery.py').write_text(module)
 old=R/'outputs/主控/20261117-r3-normal41-registration-window-01/admin_exec.ISSUED.py';actual=old.read_bytes();assert sha(actual)==h['dispatcherSha256'];(D/'ACTUAL120-DISPATCHER.py').write_bytes(actual)
 text=actual.decode();tree=ast.parse(text);n=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));keys=ast.literal_eval(n.value);assert len(keys)==120 and h['newJobId']not in keys
 text=text.replace(ast.get_source_segment(text,n),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[h['newJobId']]),1)
 const="STOP41_RECOVERY_KEY = "+repr(h['newJobId'])+"\nSTOP41_RECOVERY_MODULE_SHA256 = "+repr(sha(module.encode()))+"\nSTOP41_RECOVERY_POLICY_SHA256 = None\n\n"
 text=text.replace('def check(value, code):',const+'def check(value, code):',1)
 helper='''def stop41_recovery(core,prior,cfg):
    from types import ModuleType
    prior=normal41_continuation(core,prior,cfg)
    path=canonical(PUBLIC/'r3_stop41_recovery.py');raw=core.read(path)
    check(STOP41_RECOVERY_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==STOP41_RECOVERY_MODULE_SHA256,'R3_CONTINUITY_STOP41_RECOVERY_NOT_REGISTERED')
    module=ModuleType('stop41_recovery');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.Recovery(core,prior,cfg,STOP41_RECOVERY_POLICY_SHA256)

'''
 text=text.replace('def fixed_install_code_member(cfg,job,row):',helper+'def fixed_install_code_member(cfg,job,row):',1)
 marker="                    if job['jobId']==R3_05_EXECUTE_KEY:"
 text=text.replace(marker,"                    if job['jobId'] in (STOP41_RECOVERY_KEY,'t45-r3-ordinary41-auth-restore-20261117-01'):\n                        hold=stop41_recovery(continuity,hold,cfg)\n"+marker,1)
 compile(text,'recovery_dispatcher','exec');(D/'admin_exec.RECOVERY-UNREGISTERED.py').write_text(text)
 cas=(OLD/'register_cas.py').read_text();cas=replace_assignment(cas,'JOBS',{'stop':h['newJobId']});cas=replace_assignment(cas,'EXPECTED_RULES',{'stop':rule});cas=replace_assignment(cas,'OLD',h['dispatcherSha256'])
 for a,b in [('r3-normal41-registration','r3-stop41-recovery-registration'),('r3_normal41_continuation.py','r3_stop41_recovery.py'),('direct41-batched-real.json','stop41-recovery-only-20261117-01.json'),('.normal41-dispatcher.pending','.stop41-recovery-dispatcher.pending'),('NORMAL41_POLICY_SHA256','STOP41_RECOVERY_POLICY_SHA256'),('T45_NORMAL41_REGISTRATION_CAS_V1','T45_STOP41_RECOVERY_REGISTRATION_CAS_V1'),('EXACT_NORMAL41_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED','EXACT_STOP41_RECOVERY_ROOT_REGISTERED_NO_STOP_SUBMITTED'),('old115AndThreeGuardsPreserved','old120AndThreeGuardsPreserved')]:cas=cas.replace(a,b)
 extra="PRESERVE.update({str(P/'r3_normal41_continuation.py'):'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce',str(H/'direct41-batched-real.json'):'5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9'})\n"
 cas=cas.replace('sha=lambda raw:',extra+'sha=lambda raw:',1)
 # No stopped-PG fiction: registration is admitted only for this live owned C41.
 tree=ast.parse(cas);n=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='quiet')
 quiet='''def running41():
 from types import ModuleType
 raw,_=read(P/'admin_exec.py');w=ModuleType('actual_root120');w.__file__=str(P/'admin_exec.py');exec(compile(raw,w.__file__,'exec'),w.__dict__)
 cfg=json.loads(read(P/'grant.json')[0]);core,prior=w.r3_continuity(cfg);prior=w.normal41_continuation(core,prior,cfg)
 raw,_=read(ENTRY.with_name('r3_stop41_recovery.py'));m=ModuleType('recovery_live');m.__file__=str(ENTRY.with_name('r3_stop41_recovery.py'));exec(compile(raw,m.__file__,'exec'),m.__dict__)
 m.running41(core,prior,need)
 return cfg

def quiet(expected_diagnostic=None):
 import subprocess
 running41()
 for grant in (B,C,B.with_name('grant-5cc58239751e4e2a'),C.with_name('grant-5cc58239751e4e2a')):
  for key in KEYS:need(not any(os.path.lexists(grant/rel)for rel in('jobs/'+key,'requests/'+key+'.json','requests/'+key+'.tmp','results/'+key+'.json')),'RECOVERY_KEY_ALREADY_PRESENT_NO_REPLAY')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-*'],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and not q.stdout.strip(),'NO_OTHER_ACTIVE_OPERATION_REQUIRED')
 return {'exactExistingC41Running':True,'newRecoveryKeyAbsent':True,'PGConnections':0,'mutations':0}
'''
 cas=cas.replace(ast.get_source_segment(cas,n),quiet,1)
 tree=ast.parse(cas);n=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='validate_policy_delta')
 validator="""def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_STOP41_RECOVERY_ONLY_V1'and p['grantId']=='b16447fbc81f4d64'and p['jobs']==EXPECTED_RULES,'EXACT_SINGLE_RECOVERY_POLICY_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=min(p['startsAt']+300000,1794926342048,1794926977752),'ORIGINAL_C41_AND_RESTORE_DEADLINES_REQUIRED')
"""
 cas=cas.replace(ast.get_source_segment(cas,n),validator,1)
 cas=cas.replace("module.Normal41Continuation(core,prior,cfg,sha(policy_raw))","module.Recovery(core,wrapper.normal41_continuation(core,prior,cfg),cfg,sha(policy_raw))")
 cas=cas.replace("now()+600000<policy['expiresAt']","now()+30000<policy['expiresAt']")
 fixed={str(Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_normal41_continuation.py')):h['module41Sha256'],str(Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct41-batched-real.json')):h['policy41Sha256']}
 base='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'
 for key,pin in binding['actualCurrentBatchTerminals'].items():fixed[base+key+'/r3-outer-terminal.json']=pin
 fixed[base+h['service']['serviceKey']+'/r3-outer-terminal.json']=h['startPins']['terminal']
 fixed[base+h['service']['serviceKey']+'/results/normal-service-result.json']=h['startPins']['result']
 fixed[base+h['failedStop']['key']+'/results/normal05-preserve-stop-result.json']=h['failedStop']['resultSha256']
 cas=cas.replace('sha=lambda raw:', 'RECOVERY_SERVICE='+repr(h['service'])+'\nPRESERVE.update('+repr(fixed)+')\nsha=lambda raw:',1)
 compile(cas,'recovery_cas','exec');(D/'register_cas.py').write_text(cas)
 (D/'HISTORY.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n');print('Rendered root121 safety source only; no running entry invoked.')
if __name__=='__main__':main()
