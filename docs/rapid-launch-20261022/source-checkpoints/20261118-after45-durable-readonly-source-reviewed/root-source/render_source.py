from pathlib import Path
import ast,json,hashlib,sys
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-after45-businessroot-durable-root-source-01');sha=lambda b:hashlib.sha256(b).hexdigest()
def assign(s,name,val):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(val),1)
def main(binding_file):
 b=json.loads(Path(binding_file).read_bytes());h=json.loads((D/'HISTORY.json').read_bytes());h.update(b['history']);assert b['rule']['jobId']==h['newJobId']and b['rule']['timeoutSeconds']==300
 (D/'CONSUMER-BINDING.json').write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n');(D/'HISTORY.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
 s=(D/'admission.template.py').read_text().replace('__HISTORY__',repr(h)).replace('__POLICY_FORMAT__',repr(b['policyFormat'])).replace('__AUTHORITY_FORMAT__',repr(b['authorityFormat']));s=assign(s,'EXPECTED_BUNDLE',b['rule']['bundlePins']);compile(s,'after45_module','exec');(D/'r3_after45_businessroot_durable_readonly.py').write_text(s)
 modulepin=sha(s.encode());text=(D/'ACTUAL143-DISPATCHER.py').read_text();n=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.targets));keys=ast.literal_eval(n.value);assert len(keys)==143 and h['newJobId']not in keys;text=text.replace(ast.get_source_segment(text,n),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[h['newJobId']]),1)
 const='AFTER45_DURABLE_KEY = '+repr(h['newJobId'])+'\nAFTER45_DURABLE_MODULE_SHA256 = '+repr(modulepin)+'\nAFTER45_DURABLE_POLICY_SHA256 = None\n\n';text=text.replace('def check(value, code):',const+'def check(value, code):',1)
 helper='''def after45_businessroot_durable(core,prior,cfg):
    from types import ModuleType
    prior=original_auth45_guardian_restore(core,prior,cfg)
    path=canonical(PUBLIC/'r3_after45_businessroot_durable_readonly.py');raw=core.read(path)
    check(AFTER45_DURABLE_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==AFTER45_DURABLE_MODULE_SHA256,'R3_CONTINUITY_AFTER45_DURABLE_NOT_REGISTERED')
    module=ModuleType('after45_durable_admission');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.After45DurableReadonly(core,prior,cfg,AFTER45_DURABLE_POLICY_SHA256)

''';text=text.replace('def fixed_install_code_member(cfg,job,row):',helper+'def fixed_install_code_member(cfg,job,row):',1)
 marker="                    if job['jobId']==R3_05_EXECUTE_KEY:";assert text.count(marker)==1;text=text.replace(marker,"                    if job['jobId']==AFTER45_DURABLE_KEY:\n                        hold=after45_businessroot_durable(continuity,hold,cfg)\n"+marker,1)
 needle="['-I','-S'] if job_id==DURABLE_CORE0_02_KEY else ['-s']";assert text.count(needle)==1;text=text.replace(needle,"['-I','-S'] if job_id in (DURABLE_CORE0_02_KEY,AFTER45_DURABLE_KEY) else ['-s']",1);compile(text,'after45_dispatcher','exec');(D/'admin_exec.DURABLE-UNREGISTERED.py').write_text(text)
 s=(D/'register_cas.template.py').read_text().replace('__POLICY_FORMAT__',repr(b['policyFormat']));s=assign(s,'EXPECTED_RULES',{'observe':b['rule']});compile(s,'after45_cas','exec');(D/'register_cas.py').write_text(s)
 print('RENDERED',modulepin)
if __name__=='__main__':main(sys.argv[1])
