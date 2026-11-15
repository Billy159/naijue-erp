"""Execute only the extracted finally AST with in-memory process/filesystem doubles."""
import ast
import json
from pathlib import Path
from types import SimpleNamespace

base = Path(__file__).resolve().parent


def evaluate(script, *, elapsed=100, cleanup_elapsed=None, success=True, fault=None,
             peak=1024, signals=None, permission=False, reaped=True, pg_stopped=True):
    source = ast.parse(script.read_text())
    final = next(node.finalbody for node in source.body if isinstance(node, ast.Try) and node.finalbody)
    code = compile(ast.fix_missing_locations(ast.Module(body=final, type_ignores=[])), '<cleanup-memory>', 'exec')
    receipts = {}
    state = {'exists': True, 'deletes': 0, 'clock_calls': 0}

    class MemoryPath:
        def __init__(self, name): self.name = name
        def __truediv__(self, name): return MemoryPath(self.name + '/' + name)
        def exists(self):
            if self.name == 'root': return state['exists']
            if self.name == 'root/pg/postmaster.pid': return not pg_stopped
            return self.name.removeprefix('base/') in receipts
        def __str__(self): return self.name

    class MemoryProcess:
        def __init__(self, pid, ended, name): self.pid, self.ended, self.args = pid, ended, [name]
        def poll(self): return 0 if self.ended else None
        def wait(self, timeout): return self.poll()

    def monotonic():
        state['clock_calls'] += 1
        return elapsed if state['clock_calls'] == 1 or cleanup_elapsed is None else cleanup_elapsed

    def rmtree(path):
        assert path.name == 'root'
        state['deletes'] += 1
        state['exists'] = False

    server = MemoryProcess(100, pg_stopped, 'postgres')
    child = MemoryProcess(101, reaped, 'node')
    env = dict(time=SimpleNamespace(monotonic=monotonic), started=0,
               WORK_SECONDS=170, TOTAL_SECONDS=180, SCRATCH_CAP=3*1024**3,
               fault=fault, success=success, stop=SimpleNamespace(set=lambda: None),
               kill_all=lambda: None, server=server, work=MemoryPath('root'),
               initdb_started=True, initdb_complete=True, children=[server, child],
               peak=peak, allocated=lambda path: peak, signal_errors=signals or [],
               permission_fault=permission, shutil=SimpleNamespace(rmtree=rmtree),
               base=MemoryPath('base'), save=lambda name, value: receipts.__setitem__(name, value),
               Path=Path, raw_log=bytearray(), raw_other=0)
    exec(code, env)
    return state['deletes'], receipts['CLEANUP.json']


old = base.parent / '20261115-r3-batched-pg-local-01/run-local.py'
new = base / 'run-local.py'
# Reproduce the exact recorded P2 without starting a process or touching a root.
removed, receipt = evaluate(old, elapsed=171)
assert removed == 1 and receipt['successful'] is False and receipt['rootPreserved'] is False

cases = [
    ('work_deadline', {'elapsed': 171}),
    ('total_deadline_after_work', {'elapsed': 100, 'cleanup_elapsed': 181}),
    ('allocated_over_cap', {'peak': 3*1024**3+1}),
    ('existing_guard_fault', {'fault': 'raw_log_cap'}),
    ('permission_fault', {'permission': True}),
    ('signal_eperm', {'signals': [{'errno': 1}]}),
    ('child_not_reaped', {'reaped': False}),
    ('postmaster_unconfirmed', {'pg_stopped': False}),
    ('prior_core_failure', {'success': False}),
]
for name, values in cases:
    removed, receipt = evaluate(new, **values)
    assert removed == 0 and receipt['rootPreserved'] is True and receipt['successful'] is False, name
removed, receipt = evaluate(new)
assert removed == 1 and receipt['successful'] is True and receipt['rootPreserved'] is False
print(json.dumps({'scope': 'finally-only AST memory check', 'oldP2Reproduced': True,
                  'failedCasesPreserved': len(cases), 'healthyCleanupRemoved': True,
                  'filesystemMutation': False, 'pgExecutions': 0}))
