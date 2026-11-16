"""Update this local candidate's existing pins. Never issues or executes a job."""
from pathlib import Path
import ast,hashlib,json,re
H=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def const(path,key,value):
    text=path.read_text()
    text,n=re.subn(r'^'+key+r'''\s*=\s*['"][a-f0-9]{64}['"]$''',key+" = '"+value+"'",text,flags=re.M)
    assert n==1,(path,key,n);path.write_text(text)

start=H/'start/bundle';main=start/'normal_service05_after08.py'
const(start/'start_owned_describe.py','RUNNER_SHA',sha(start/'batched161-run.mjs'))
const(main,'PRIOR30_SHA',sha(start/'prior_completed30.py'))
const(main,'MATERIAL04_SHA',sha(start/'root04_material.py'))
for key,name in [('R3_RUNTIME_SHA','r3_05_runtime.py'),('R3_CLI_SHA','r3_05_cli.py'),('READONLY_SHA','r3_05_readonly.py')]:
    const(main,key,sha(start/name))
text=main.read_text()
for name in ('start_owned_describe.py','batched161-run.mjs'):
    text,n=re.subn(r"\('"+re.escape(name)+r"','[a-f0-9]{64}'\)","('"+name+"','"+sha(start/name)+"')",text)
    assert n==1,(name,n)
text,n=re.subn(r"pinned\(ops,describe_path,'[a-f0-9]{64}'\)","pinned(ops,describe_path,'"+sha(start/'start_owned_describe.py')+"')",text)
assert n==1;main.write_text(text)
assert main.stat().st_size<=65536
assert (start/'batched161-run.mjs').read_bytes()==(H/'install/bundle/batched161-run.mjs').read_bytes()
for phase in ('install','writer','stop'):
    path=H/phase/'bundle/normal05_retained_stop.py'
    for key,name in [('NORMAL05_SHA','normal_service05_after08.py'),('PROOF_SHA','normal_service05_after08_proof.py'),('READONLY_SHA','r3_05_readonly.py')]:
        const(path,key,sha(start/name))
const(H/'stop/bundle/normal05_preserve_stop.py','STOP_REFERENCE',sha(H/'stop/bundle/normal05_retained_stop.py'))
for phase in ('apply','restore'):
    path=H/phase/'bundle/ordinary05_roles_job.py'
    const(path,'CURRENT_SOURCE',sha(main));const(path,'CURRENT_PROOF_SOURCE',sha(start/'normal_service05_after08_proof.py'))
    assert (H/phase/'bundle/prior_completed30.py').read_bytes()==(start/'prior_completed30.py').read_bytes()
    text=path.read_text()
    text,n=re.subn(r"('prior_completed30.py': ')[a-f0-9]{64}(')",lambda m:m[1]+sha(start/'prior_completed30.py')+m[2],text)
    assert n==1
    text,n=re.subn(r"('root04_material.py': ')[a-f0-9]{64}(')",lambda m:m[1]+sha(start/'root04_material.py')+m[2],text)
    assert n==1;path.write_text(text)
for phase in ('install','writer'):
    directory=H/phase/'bundle';path=directory/('batched_install_host.py' if phase=='install' else 'batched_real_host.py')
    text=path.read_text();tree=ast.parse(text)
    node=next(n for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='PINS')
    pins={name:sha(directory/name) for name in ast.literal_eval(node.value)}
    lines=text.splitlines(True);lines[node.lineno-1:node.end_lineno]=['PINS='+repr(pins)+'\n'];path.write_text(''.join(lines))
rules=H/'PHASES31.UNISSUED.json';value=json.loads(rules.read_bytes())
for phase in ('materialize','apply','start','install','writer','stop','restore'):
    directory=Path(value['phaseDirectories'][phase])
    value['jobs'][phase]['bundlePins']={p.name:sha(p) for p in sorted(directory.iterdir()) if p.is_file()}
rules.write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
for name,key in [('run_frozen_phase31.py','RULES_SHA256'),('read-current-phase31.py','RULES_SHA')]:
    const(H/name,key,sha(rules))
print(json.dumps({'phasesSha256':sha(rules),'mainSha256':sha(main),'mainBytes':main.stat().st_size,
    'helperSha256':sha(start/'start_owned_describe.py'),'runnerSha256':sha(start/'batched161-run.mjs'),
    'readerSha256':sha(H/'read-current-phase31.py'),'serverActions':0}))
