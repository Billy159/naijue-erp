"""Exact original-client entry; no arbitrary keys, scripts, roles or SQL."""
from pathlib import Path
import ast
import hashlib
import json
import os
import runpy
import sys

HERE=Path(__file__).resolve().parent
V=HERE.parent
PROJECT=HERE.parents[4]
WINDOW=PROJECT/'outputs/主控/20261117-r3-core0-durable-readonly-window-01'
KEY='t45-r3-core0-durable-readonly-20261117-01'
LOADER=V/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
CLIENT=PROJECT.parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def prepare():
    raw=(HERE/'SOURCE-PINS.json').read_bytes();source=json.loads(raw)
    for leaf,pin in source['files'].items():assert sha((HERE/leaf).read_bytes())==pin
    issued=json.loads((WINDOW/'ISSUED.json').read_bytes())
    a=(WINDOW/'host-authorization.json').read_bytes();p=(WINDOW/'registered-policy.json').read_bytes()
    assert sha(a)==issued['authoritySha256'] and sha(p)==issued['policySha256'] and issued['requestKey']==KEY
    policy=json.loads(p)
    assert policy['requestKey']==KEY and policy['bundlePins']=={name:sha((HERE/'bundle'/name).read_bytes()) for name in ('scope.json','durable-readonly.sql','durable_readonly_job.py')}
    assert sha(LOADER.read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8' and sha(CLIENT.read_bytes())=='08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'
    client=runpy.run_path(str(LOADER))['load_client']()
    argv=['run','--task','T45','--job-id',KEY,'--source-dir',str(HERE/'bundle'),'--script','durable_readonly_job.py','--timeout-seconds','300','--output-dir',str(HERE/'runtime'),'--phase-arg',issued['authoritySha256']]
    auth=HERE/'bundle/host-authorization.json'
    if auth.exists():assert auth.read_bytes()==a and not auth.is_symlink()
    else:
        with auth.open('xb') as f:os.fchmod(f.fileno(),0o600);f.write(a)
    tree=ast.parse(CLIENT.read_bytes())
    original_main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main')
    at=next(i for i,n in enumerate(original_main.body) if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='parse_args')
    parser_scope={'argparse':client['argparse']}
    exec(compile(ast.Module(body=original_main.body[:at],type_ignores=[]),str(CLIENT),'exec'),parser_scope)
    args=parser_scope['parser'].parse_args(argv)
    cfg={'grantId':'b16447fbc81f4d64','private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'}
    files=client['collect_bundle_files'](cfg,args,HERE/'bundle',KEY)
    assert set(files)==set(policy['bundlePins'])|{'host-authorization.json'} and all(sha(files[k])==v for k,v in policy['bundlePins'].items()) and sha(files['host-authorization.json'])==issued['authoritySha256']
    submit=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='submit')
    nodes=[n for n in submit.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('manifest','raw','request') for t in n.targets)]
    assert len(nodes)==3
    state={'args':args,'cfg':cfg,'files':files,'job_id':KEY,'hashlib':hashlib,'json':json,'proofs':{}}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(CLIENT),'exec'),state)
    request=state['request']
    assert request['jobId']==KEY and request['script']=='durable_readonly_job.py' and request['args']==[issued['authoritySha256']] and request['timeoutSeconds']==300
    return client,argv,a,request

def main():
    assert sys.argv[1:] in (['prepare'],['run'])
    action=sys.argv[1];client,argv,a,request=prepare()
    if action=='prepare':
        print(json.dumps({'originalClientArgv':argv,'exactPreparedRequest':request,'registryCASStillRequired':True,'networkCalls':0}));return
    # Main must separately authorize this run after actual CAS and original-key
    # readback. The original main retains its own client lock and no-replay log.
    output=HERE/'runtime';output.mkdir(exist_ok=False)
    with (output/'SUBMIT-ONCE-INTENT.json').open('x') as f:json.dump({'requestKey':KEY,'automaticReplay':False},f)
    with (output/'EXACT-PREPARED-REQUEST.json').open('x') as f:json.dump(request,f,sort_keys=True,indent=2);f.write('\n')
    old=sys.argv
    try:sys.argv=[str(CLIENT),*argv];client['main']()
    finally:sys.argv=old

if __name__=='__main__':
    main()
