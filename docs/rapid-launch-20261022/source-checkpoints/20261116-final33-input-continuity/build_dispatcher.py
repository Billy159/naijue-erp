from pathlib import Path
import hashlib
root=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1');out=root/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/FINAL33-INPUT-CONTINUITY-01';old=(root/'outputs/主控/20261116-r3-direct32-registration-window-01/admin_exec.ISSUED.py').read_bytes();assert hashlib.sha256(old).hexdigest()=='4373d31d7e89e8201c9ee57109e17c6e92885441e394c092e175d2818cc7657d';s=old.decode();s=s.replace("R3_CONTINUITY_POLICY_SHA256 =", "FINAL33_INPUT_POLICY_SHA256 = None\nFINAL33_INPUT_MODULE_SHA256 = '"+hashlib.sha256((out/'r3_final33_input.py').read_bytes()).hexdigest()+"'\nR3_CONTINUITY_POLICY_SHA256 =",1)
helper='''def final33_input_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_final33_input.py')
    check(path.is_file() and path.lstat().st_uid==0 and not path.lstat().st_mode&0o022
          and path.lstat().st_nlink==1 and path.lstat().st_size<=32768,
          'R3_CONTINUITY_FINAL33_INPUT_PROTECTED_SOURCE_REQUIRED')
    raw=path.read_bytes()
    check(hashlib.sha256(raw).hexdigest()==FINAL33_INPUT_MODULE_SHA256,
          'R3_CONTINUITY_FINAL33_INPUT_MODULE_DIFFERS')
    module=ModuleType('fixed_final33_input');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.Final33InputContinuation(core,prior,cfg,FINAL33_INPUT_POLICY_SHA256)

'''
needle='def r3_continuity(cfg):';assert s.count(needle)==1;s=s.replace(needle,helper+needle);needle='                    continuity,hold=r3_continuity(cfg)';assert s.count(needle)==1;s=s.replace(needle,needle+"\n                    if re.fullmatch(r't45-r3-final33-stage-(install|restore)-20261116-[a-f0-9]{24}',job['jobId']):\n                        hold=final33_input_continuation(continuity,hold,cfg)");compile(s,'new-dispatcher','exec');(out/'admin_exec.INPUT-UNREGISTERED.py').write_text(s)
print(hashlib.sha256(s.encode()).hexdigest())
