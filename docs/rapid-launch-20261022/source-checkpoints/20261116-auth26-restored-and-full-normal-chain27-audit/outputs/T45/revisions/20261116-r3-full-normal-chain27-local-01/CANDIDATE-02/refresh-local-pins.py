"""Rebind only this draft's operational dependencies; no execution or issuance."""
from pathlib import Path
import ast,hashlib,json,re
H=Path(__file__).resolve().parent
BASE=H.parents[1]/'20261116-r3-service26-pin-closure-local-01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def const(p,key,value):
    text=p.read_text()
    text,n=re.subn(r'^'+key+r"\s*=\s*'[a-f0-9]{64}'$",key+" = '"+value+"'",text,flags=re.M)
    assert n==1,(p,key,n)
    p.write_text(text)
start=H/'start/bundle';main=start/'normal_service05_after08.py'
for key,name in [('R3_RUNTIME_SHA','r3_05_runtime.py'),('R3_CLI_SHA','r3_05_cli.py'),('READONLY_SHA','r3_05_readonly.py')]:
    const(main,key,sha(start/name))
runner=sha(H/'install/bundle/batched161-run.mjs')
assert sha(start/'batched161-run.mjs')==runner
text=main.read_text()
text,n=re.subn(r"\('batched161-run.mjs','[a-f0-9]{64}'\)","('batched161-run.mjs','"+runner+"')",text)
assert n==1;main.write_text(text)
assert main.stat().st_size<=65536
for phase in ('install','writer','stop'):
    p=H/phase/'bundle/normal05_retained_stop.py'
    for k,name in [('NORMAL05_SHA','normal_service05_after08.py'),('PROOF_SHA','normal_service05_after08_proof.py'),('READONLY_SHA','r3_05_readonly.py')]:
        const(p,k,sha(start/name))
const(H/'stop/bundle/normal05_preserve_stop.py','STOP_REFERENCE',sha(H/'stop/bundle/normal05_retained_stop.py'))
for phase in ('apply','restore'):
    p=H/phase/'bundle/ordinary05_roles_job.py'
    const(p,'CURRENT_SOURCE',sha(main))
    const(p,'CURRENT_PROOF_SOURCE',sha(start/'normal_service05_after08_proof.py'))
for phase in ('install','writer'):
    directory=H/phase/'bundle'
    p=directory/('batched_install_host.py' if phase=='install' else 'batched_real_host.py')
    text=p.read_text();tree=ast.parse(text)
    assignment=next(n for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='PINS')
    pins=ast.literal_eval(assignment.value)
    pins={name:sha(directory/name) for name in pins}
    lines=text.splitlines(True);lines[assignment.lineno-1:assignment.end_lineno]=['PINS='+repr(pins)+'\n'];p.write_text(''.join(lines))
w=json.loads((BASE/'PHASES26.UNISSUED.json').read_bytes())
for phase in ('apply','start','install','writer','stop','restore'):
    d=H/phase/'bundle';w['phaseDirectories'][phase]=str(d)
    w['jobs'][phase]['bundlePins']={p.name:sha(p) for p in sorted(d.iterdir()) if p.is_file()}
    if phase=='start':w['jobs'][phase]['jobId']='t45-first-r3-native-service-start-20261116-27'
    if phase in ('apply','restore'):w['jobs'][phase]['jobId']='t45-r3-ordinary27-auth-'+phase+'-20261116-01'
    if phase=='stop':w['jobs'][phase]['jobId']='t45-r3-ordinary27-preserve-stop-20261116-01'
w.update(status='LOCAL_COMPLETE_NORMAL_CHAIN27_DRAFT_UNISSUED',serverActions=0,postgresConnections=0,authoritiesIssued=False,
    previousFailedStartKey='t45-first-r3-native-service-start-20261116-26',
    previousFailedStartTerminalSha256='853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39',
    previousFailedStartResultSha256='5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
    priorRestoreTerminalSha256='944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63',
    priorRestorePublicResultSha256='57aff18487f294415830404abaf18f8a970b04b779d22e2d226018539c5879cb',
    priorRestoreRootResultSha256='d521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8',
    rootDescribeCallerPreparation='Stage exact caller27 from new start bundle only; completed materialized companion25 remains unchanged',
    startupHeldUntilFinalSameVersionFullChainReview=True)
(H/'PHASES27.DRAFT.UNISSUED.json').write_text(json.dumps(w,sort_keys=True,indent=2)+'\n')
print(json.dumps({'state':w['status'],'mainBytes':main.stat().st_size,'mainSha256':sha(main),'draftRulesSha256':sha(H/'PHASES27.DRAFT.UNISSUED.json'),'serverActions':0}))
