"""Small filesystem and source-binding checks only. No factories, UID mocks or DB."""
from pathlib import Path
from types import ModuleType
import ast,hashlib,json,os,re,sys,tempfile
H=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def load(p,name):
    m=ModuleType(name);m.__file__=str(p);exec(compile(p.read_bytes(),str(p),'exec'),m.__dict__);return m
def sync(p):
    fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def new_file(p,raw,mode):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        assert os.write(fd,raw)==len(raw)
        os.fchmod(fd,mode);os.fsync(fd)
    finally:os.close(fd)
syntax=[];pinpairs=[];creation=[]
for phase in ('apply','start','install','writer','stop','restore'):
    folder=H/phase/'bundle'
    for p in sorted(folder.iterdir()):
        if p.suffix!='.py':continue
        t=ast.parse(p.read_bytes(),str(p));compile(t,str(p),'exec');syntax.append(str(p.relative_to(H)))
        for n in t.body:
            if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('PINS','STATIC_PINS'):
                for name,pin in ast.literal_eval(n.value).items():
                    assert sha(folder/name)==pin,(phase,p.name,name)
                    pinpairs.append({'consumer':str(p.relative_to(H)),'input':name,'sha256':pin})
            if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='CHILD':
                ast.parse(ast.literal_eval(n.value),str(p)+':CHILD')
        for n in ast.walk(t):
            if isinstance(n,ast.Call) and (isinstance(n.func,ast.Attribute) and n.func.attr in ('mkdir','new_file','new_json','rename','link','unlink') or isinstance(n.func,ast.Name) and n.func.id in ('put','write','private_file','copy_once','write_new')):
                creation.append(dict(source=str(p.relative_to(H)),line=n.lineno,expression=ast.unparse(n)))
start=H/'start/bundle';main=start/'normal_service05_after08.py'
assert main.stat().st_size<=65536
constants={}
for n in ast.parse(main.read_bytes()).body:
    if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name):
        try:constants[n.targets[0].id]=ast.literal_eval(n.value)
        except (ValueError,TypeError):pass
staged=[]
for n in ast.walk(ast.parse(main.read_bytes())):
    if isinstance(n,ast.For) and isinstance(n.iter,ast.Tuple) and any(isinstance(e,ast.Tuple) and isinstance(e.elts[0],ast.Constant) and e.elts[0].value=='operator-manifest.json' for e in n.iter.elts):
        for e in n.iter.elts:
            name=ast.literal_eval(e.elts[0]);pin=sha(main) if name==main.name else sha(start/name) if name=='normal_service05_after08_proof.py' else ast.literal_eval(e.elts[1]) if isinstance(e.elts[1],ast.Constant) else constants[e.elts[1].id]
            assert sha(start/name)==pin,(name,pin)
            staged.append({'input':name,'sha256':pin,'bytes':(start/name).stat().st_size,'readBound':262144})
assert len(staged)==9
for key,name in [('READONLY_SHA','r3_05_readonly.py'),('R3_RUNTIME_SHA','r3_05_runtime.py'),('R3_CLI_SHA','r3_05_cli.py'),('PLAN_SHA','production-plan.json')]:assert constants[key]==sha(start/name)
sys.modules['r3_05_cli']=load(start/'r3_05_cli.py','r3_05_cli')
runtime=load(start/'r3_05_runtime.py','local_current_runtime')
old=load(H.parents[1]/'20261116-r3-service26-pin-closure-local-01/start/bundle/r3_05_runtime.py','local_prior_runtime')
with tempfile.TemporaryDirectory(prefix='t45-normal27-paths-') as temp:
    base=Path(temp);prior=base/old.PROOF_PROJECTION.name
    prior.mkdir();(prior/'preserved-proof').write_bytes(b'preserved-local-sentinel')
    before=(prior.stat().st_ino,(prior/'preserved-proof').read_bytes())
    old.PROOF_PROJECTION=prior
    try:old.prepare_proof_projection(new_file,sync)
    except FileExistsError:red=True
    else:raise AssertionError('OLD_CONFIGURED_OUTPUT_COLLISION_NOT_REPRODUCED')
    runtime.PROOF_PROJECTION=base/runtime.PROOF_PROJECTION.name
    assert runtime.PROOF_PROJECTION!=prior
    runtime.prepare_proof_projection(new_file,sync)
    assert runtime.PROOF_PROJECTION.stat().st_mode&0o777==0o755
    placeholder=runtime.PROOF_PROJECTION/'capacity/owner-profile.json'
    assert placeholder.read_bytes()==b'' and placeholder.stat().st_mode&0o777==0o400
    assert before==(prior.stat().st_ino,(prior/'preserved-proof').read_bytes())
    try:runtime.prepare_proof_projection(new_file,sync)
    except FileExistsError:exclusive=True
    else:raise AssertionError('DUPLICATE_CREATION_ALLOWED')
writer=H/'writer/bundle'
host=(writer/'batched_real_host.py').read_text();node=(writer/'retained24-run.mjs').read_text()
assert "('writer-authorization.json',raw)" in host
assert "WORK+'/writer-authorization.json'" in node and "WORK+'/retained24-authorization.json'" not in node
assert (start/'batched161-run.mjs').read_bytes()==(H/'install/bundle/batched161-run.mjs').read_bytes()
assert (H/'apply/bundle/ordinary05_roles_job.py').read_bytes()==(H/'restore/bundle/ordinary05_roles_job.py').read_bytes()
for phase in ('apply','restore'):
    code=(H/phase/'bundle/ordinary05_roles_job.py').read_text()
    assert "CURRENT_SOURCE = '"+sha(main)+"'" in code
    assert "CURRENT_PROOF_SOURCE = '"+sha(start/'normal_service05_after08_proof.py')+"'" in code
record=dict(scope='LOCAL_FILESYSTEM_AND_STATIC_OPERATIONAL_BINDINGS_ONLY',pythonFilesParsed=len(syntax),embeddedChildSourcesParsed=True,dependencyPairs=pinpairs,startStagedInputs=staged,
    original26ProjectionCollisionReproduced=red,new27ProjectionCreated=True,oldProjectionInodeAndSentinelPreserved=True,
    duplicateCurrentCreationRefused=exclusive,writerAuthorityProducerConsumerAligned=True,
    startupAndInstallRootCallerIdentical=True,applyRestoreWrapperIdentical=True,
    nativeFactoryExecuted=False,postgresConnections=0,serverActions=0,formalBusinessAccepted=False,
    notCovered=['actual Linux UID/mounts','real container cleanup and PG state','registry/issuer final pairing','real install/writer acceptance'])
(H/'LOCAL-CHECKS27.json').write_text(json.dumps(record,sort_keys=True,indent=2)+'\n')
(H/'CREATION-SITES27.json').write_text(json.dumps(creation,sort_keys=True,indent=2)+'\n')
print(json.dumps({'localChecksSha256':sha(H/'LOCAL-CHECKS27.json'),'creationSitesSha256':sha(H/'CREATION-SITES27.json'),'pythonFilesParsed':len(syntax),'stagedPinPairs':len(staged),'dependencyPairs':len(pinpairs),'localCollisionRedThenGreen':True,'serverActions':0}))
