"""Pure renderer for one unregistered key; never installs or registers anything."""
import ast
import hashlib
import re
KEY = 't45-r3-core0-durable-readonly-20261117-01'
BASE = 'eabf10a911740fc864165ff9d5e66f0e654edc755b31299924755f91aa050206'

def render(actual, module_pin, policy_pin=None):
    assert hashlib.sha256(actual).hexdigest() == BASE
    assert re.fullmatch('[a-f0-9]{64}', module_pin)
    assert policy_pin is None or re.fullmatch('[a-f0-9]{64}', policy_pin)
    text = actual.decode(); tree = ast.parse(text)
    node = next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='R3_ORIGINAL02_ABSENT_KEYS' for t in n.targets))
    old = ast.literal_eval(node.value)
    assert len(old)==107 and KEY not in old
    text = text.replace(ast.get_source_segment(text,node),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(old+[KEY]),1)
    constants = 'DURABLE_CORE0_KEY = '+repr(KEY)+'\nDURABLE_CORE0_MODULE_SHA256 = '+repr(module_pin)+'\nDURABLE_CORE0_POLICY_SHA256 = '+repr(policy_pin)+'\n\n'
    helper = '''def durable_core0_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_core0_durable_readonly.py');raw=core.read(path)
    check(DURABLE_CORE0_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==DURABLE_CORE0_MODULE_SHA256,'R3_CONTINUITY_DURABLE_NOT_REGISTERED')
    module=ModuleType('durable_core0_readonly');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(module.KEY==DURABLE_CORE0_KEY,'R3_CONTINUITY_DURABLE_KEY_DIFFERS')
    return module.DurableReadonlyContinuation(core,prior,cfg,DURABLE_CORE0_POLICY_SHA256)

'''
    anchor='def check(value, code):'
    assert text.count(anchor)==1;text=text.replace(anchor,constants+anchor)
    anchor='def fixed_install_code_member(cfg,job,row):'
    assert text.count(anchor)==1;text=text.replace(anchor,helper+anchor)
    anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
    branch="                    if job['jobId']==DURABLE_CORE0_KEY:\n                        hold=durable_core0_continuation(continuity,hold,cfg)\n"
    assert text.count(anchor)==1;text=text.replace(anchor,branch+anchor)
    changed=ast.parse(text)
    old_functions={n.name:ast.dump(n,include_attributes=False) for n in tree.body if isinstance(n,ast.FunctionDef)}
    new_functions={n.name:ast.dump(n,include_attributes=False) for n in changed.body if isinstance(n,ast.FunctionDef)}
    assert [k for k in old_functions if old_functions[k]!=new_functions[k]]==['execute']
    execute=next(n for n in changed.body if isinstance(n,ast.FunctionDef) and n.name=='execute')
    for parent in ast.walk(execute):
        for _,value in ast.iter_fields(parent):
            if isinstance(value,list):value[:]=[n for n in value if not(isinstance(n,ast.If) and 'DURABLE_CORE0_KEY' in ast.dump(n.test))]
    assert ast.dump(execute,include_attributes=False)==old_functions['execute']
    guards=[n for n in ast.walk(changed) if isinstance(n,ast.Compare) and any(isinstance(v,ast.Name) and v.id=='R3_ORIGINAL02_ABSENT_KEYS' for v in n.comparators)]
    assert len(guards)==3 and len(text.encode())<=131072
    return text.encode()
