"""Normal39 delta of actual69; preserve102 and completed Root07 adapter."""
import ast
import hashlib
import re
JOBS = {'apply': 't45-r3-ordinary39-auth-apply-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-05', 'restore': 't45-r3-ordinary39-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-39', 'stop': 't45-r3-ordinary39-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
KEYS = tuple(JOBS.values())
NEW_KEYS = tuple(JOBS[p]for p in ('apply','start','prepare','stop','restore'))
BASE = '69d52a00145421a7e675685aa626a30cdb5ffe0e62fdcba7c8ba272f18c01262'
BRANCH = "                    if job['jobId'] in NORMAL39_KEYS:\n                        hold=normal39_continuation(continuity,hold,cfg)\n"
ADAPTER = """def normal39_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_normal39_continuation.py');raw=core.read(path)
    check(NORMAL39_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==NORMAL39_MODULE_SHA256,'R3_CONTINUITY_NORMAL39_NOT_REGISTERED')
    module=ModuleType('normal39_continuation');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(tuple(module.JOBS.values())==NORMAL39_KEYS,'R3_CONTINUITY_NORMAL39_KEYS_DIFFERS')
    return module.Normal39Continuation(core,prior,cfg,NORMAL39_POLICY_SHA256)

"""


def render(actual, module_pin, policy_pin=None):
    assert hashlib.sha256(actual).hexdigest() == BASE
    assert re.fullmatch('[a-f0-9]{64}', module_pin)
    assert policy_pin is None or re.fullmatch('[a-f0-9]{64}', policy_pin)
    text = actual.decode()
    tree = ast.parse(text)
    assert not any(isinstance(n, ast.Name) and n.id.startswith('NORMAL39_') for n in ast.walk(tree))
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'R3_ORIGINAL02_ABSENT_KEYS' for t in n.targets))
    prefix = ast.literal_eval(node.value)
    assert len(prefix) == 102 and len(set(prefix)) == 102 and not set(NEW_KEYS).intersection(prefix) and JOBS['writer'] in prefix
    old = ast.get_source_segment(text, node)
    new = 'R3_ORIGINAL02_ABSENT_KEYS = ' + repr(prefix + list(NEW_KEYS))
    assert text.count(old) == 1
    result = text.replace(old, new)
    constants = 'NORMAL39_KEYS = ' + repr(KEYS) + '\nNORMAL39_MODULE_SHA256 = ' + repr(module_pin) + '\nNORMAL39_POLICY_SHA256 = ' + repr(policy_pin) + '\n\n'
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
                value[:] = [n for n in value if not (isinstance(n, ast.If) and 'NORMAL39_KEYS' in ast.dump(n.test))]
    assert ast.dump(execute, include_attributes=False) == old_functions['execute']
    guards = [n for n in ast.walk(tree2) if isinstance(n, ast.Compare) and any(isinstance(x, ast.Name) and x.id == 'R3_ORIGINAL02_ABSENT_KEYS' for x in n.comparators)]
    assert len(guards) == 3
    assert len(result.encode()) <= 131072
    return result.encode()
