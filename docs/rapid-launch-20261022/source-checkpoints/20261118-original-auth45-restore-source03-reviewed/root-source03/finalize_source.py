from pathlib import Path
import ast,json,hashlib,sys
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-original-auth45-guardian-restore-root-source-03')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assign(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main(binding_path):
 h=json.loads((D/'HISTORY.json').read_bytes());b=json.loads(Path(binding_path).read_bytes());h.update(b['history']);rule=b['rule'];assert rule['jobId']==h['newJobId']and rule['timeoutSeconds']==300
 (D/'CONSUMER-BINDING.json').write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n');(D/'HISTORY.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
 module=(D/'admission.template.py').read_text().replace('__HISTORY__',repr(h)).replace('__RULE__',repr(rule));compile(module,'guardian45_admission','exec');(D/'r3_original_auth45_guardian_restore.py').write_text(module)
 text=(D/'ACTUAL142-DISPATCHER.py').read_text();n=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));keys=ast.literal_eval(n.value);assert len(keys)==142 and h['newJobId']not in keys;text=text.replace(ast.get_source_segment(text,n),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[h['newJobId']]),1)
 const='ORIGINAL_AUTH45_GUARDIAN_RESTORE_KEY = '+repr(h['newJobId'])+'\nORIGINAL_AUTH45_GUARDIAN_RESTORE_MODULE_SHA256 = '+repr(sha(module.encode()))+'\nORIGINAL_AUTH45_GUARDIAN_RESTORE_POLICY_SHA256 = None\n\n';text=text.replace('def check(value, code):',const+'def check(value, code):',1)
 helper='''def original_auth45_guardian_restore(core,prior,cfg):
    from types import ModuleType
    prior=normal45_continuation(core,prior,cfg)
    path=canonical(PUBLIC/'r3_original_auth45_guardian_restore.py');raw=core.read(path)
    check(ORIGINAL_AUTH45_GUARDIAN_RESTORE_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==ORIGINAL_AUTH45_GUARDIAN_RESTORE_MODULE_SHA256,'R3_CONTINUITY_ORIGINAL_AUTH45_GUARDIAN_RESTORE_NOT_REGISTERED')
    module=ModuleType('original_auth45_guardian_restore');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.Rollback(core,prior,cfg,ORIGINAL_AUTH45_GUARDIAN_RESTORE_POLICY_SHA256)

''';text=text.replace('def fixed_install_code_member(cfg,job,row):',helper+'def fixed_install_code_member(cfg,job,row):',1);marker="                    if job['jobId']==R3_05_EXECUTE_KEY:";assert text.count(marker)==1;text=text.replace(marker,"                    if job['jobId']==ORIGINAL_AUTH45_GUARDIAN_RESTORE_KEY:\n                        hold=original_auth45_guardian_restore(continuity,hold,cfg)\n"+marker,1);compile(text,'guardian45_dispatcher','exec');(D/'admin_exec.ROLLBACK-UNREGISTERED.py').write_text(text)
 cas=assign((D/'register_cas.template.py').read_text(),'EXPECTED_RULES',{'rollback':rule});compile(cas,'guardian45_cas','exec');(D/'register_cas.py').write_text(cas)
 print('FINAL_ROOT_RENDERED_NOT_FROZEN',sha(module.encode()))
if __name__=='__main__':main(sys.argv[1])
