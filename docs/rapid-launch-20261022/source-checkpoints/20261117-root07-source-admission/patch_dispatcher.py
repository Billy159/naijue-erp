"""One-key delta of the actual e46 dispatcher, preserving all 101 old keys."""
import ast
import hashlib
import re
KEY = 't45-r3-batched-root07-source-delta-20261117-01'
BASE = 'e46f75794d7e151b0fba870c3b33786dacb54585e0476736db432fa8e60b4f8c'
BRANCH = "                    if job['jobId']==ROOT07_SOURCE_KEY:\n                        hold=root07_source_continuation(continuity,hold,cfg)\n"
ADAPTER = """def root07_source_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_root07_source_admission.py');raw=core.read(path)
    check(ROOT07_SOURCE_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==ROOT07_SOURCE_MODULE_SHA256,'R3_CONTINUITY_ROOT07_SOURCE_NOT_REGISTERED')
    module=ModuleType('root07_source_admission');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(module.KEY==ROOT07_SOURCE_KEY,'R3_CONTINUITY_ROOT07_SOURCE_KEY_DIFFERS')
    return module.Root07SourceAdmission(core,prior,cfg,ROOT07_SOURCE_POLICY_SHA256)

"""


def render(actual, module_pin, policy_pin=None):
    assert hashlib.sha256(actual).hexdigest() == BASE
    assert re.fullmatch('[a-f0-9]{64}', module_pin)
    assert policy_pin is None or re.fullmatch('[a-f0-9]{64}', policy_pin)
    text = actual.decode()
    tree = ast.parse(text)
    assert not any(isinstance(n, ast.Name) and n.id.startswith('ROOT07_SOURCE_') for n in ast.walk(tree))
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'R3_ORIGINAL02_ABSENT_KEYS' for t in n.targets))
    prefix = ast.literal_eval(node.value)
    assert len(prefix) == 101 and KEY not in prefix and len(set(prefix)) == 101
    old = ast.get_source_segment(text, node)
    new = 'R3_ORIGINAL02_ABSENT_KEYS = ' + repr(prefix + [KEY])
    assert text.count(old) == 1
    result = text.replace(old, new)
    constants = 'ROOT07_SOURCE_KEY = ' + repr(KEY) + '\nROOT07_SOURCE_MODULE_SHA256 = ' + repr(module_pin) + '\nROOT07_SOURCE_POLICY_SHA256 = ' + repr(policy_pin) + '\n\n'
    assert result.count('def check(value, code):') == 1
    result = result.replace('def check(value, code):', constants + 'def check(value, code):')
    assert result.count('def fixed_install_code_member(cfg,job,row):') == 1
    result = result.replace('def fixed_install_code_member(cfg,job,row):', ADAPTER + 'def fixed_install_code_member(cfg,job,row):')
    anchor = "                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
    assert result.count(anchor) == 1
    result = result.replace(anchor, BRANCH + anchor)
    tree2 = ast.parse(result)
    old_functions = {n.name: ast.dump(n, include_attributes=False) for n in tree.body if isinstance(n, ast.FunctionDef)}
    new_functions = {n.name: ast.dump(n, include_attributes=False) for n in tree2.body if isinstance(n, ast.FunctionDef)}
    assert [n for n in old_functions if old_functions[n] != new_functions[n]] == ['execute']
    execute = next(n for n in tree2.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')
    for parent in ast.walk(execute):
        for name, value in ast.iter_fields(parent):
            if isinstance(value, list):
                value[:] = [n for n in value if not (isinstance(n, ast.If) and 'ROOT07_SOURCE_KEY' in ast.dump(n.test))]
    assert ast.dump(execute, include_attributes=False) == old_functions['execute']
    guards = [n for n in ast.walk(tree2) if isinstance(n, ast.Compare) and any(isinstance(x, ast.Name) and x.id == 'R3_ORIGINAL02_ABSENT_KEYS' for x in n.comparators)]
    assert len(guards) == 3
    assert len(result.encode()) <= 131072
    return result.encode()
