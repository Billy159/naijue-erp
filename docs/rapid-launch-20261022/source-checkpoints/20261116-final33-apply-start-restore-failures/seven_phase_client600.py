"""Private process adapter for the seven unchanged job clients; no CLI dispatch on import."""
from pathlib import Path
import ast,hashlib,runpy
CLIENT=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py')
THIN=Path(__file__).with_name('registration_transport600.py')

def load_client():
    raw=CLIENT.read_bytes()
    assert hashlib.sha256(raw).hexdigest()=='08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'
    assert hashlib.sha256(THIN.read_bytes()).hexdigest()=='7906c6cd7f04faa6d30660d97accac7445d7d142c92315fff6da560a6c1946f6'
    text=raw.decode();node=next(n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name=='remote')
    before=ast.get_source_segment(text,node);after=before.replace('timeout=40','timeout=600')
    thin_text=THIN.read_text();thin_node=next(n for n in ast.parse(thin_text).body if isinstance(n,ast.FunctionDef) and n.name=='remote')
    assert before.count('timeout=40')==1 and ast.dump(ast.parse(after))==ast.dump(ast.parse(ast.get_source_segment(thin_text,thin_node)))
    instance=runpy.run_path(str(CLIENT),run_name='private_seven_phase_client600')
    scope=instance['submit'].__globals__
    assert scope['__file__']==str(CLIENT) and scope['state'].__globals__ is scope and scope['collect'].__globals__ is scope
    scope['remote']=runpy.run_path(str(THIN))['remote']
    return scope
