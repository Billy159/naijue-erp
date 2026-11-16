"""Continue the one unaccepted apply stage. No setup, replacement or retry loop."""
from pathlib import Path
from types import SimpleNamespace
import ast,fcntl,hashlib,json,os,runpy,shlex,time

HERE=Path(__file__).resolve().parent
KEY='t45-r3-ordinary33-auth-apply-20261116-01'
sha=lambda b:hashlib.sha256(b).hexdigest()

def save(name,value):
    with (HERE/name).open('x') as f:
        json.dump(value,f,sort_keys=True,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())

def main():
    os.umask(0o077)
    assert sha((HERE/'seven_phase_client600.py').read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
    client=runpy.run_path(str(HERE/'seven_phase_client600.py'))['load_client']()
    cfg=client['state']();assert cfg['grantId']=='b16447fbc81f4d64'
    proposal=json.loads((HERE/'APPLY-TRANSPORT-RECOVERY-PROPOSAL.json').read_bytes())
    assert sha((HERE/'APPLY-TRANSPORT-RECOVERY-PROPOSAL.json').read_bytes())=='54318cb5eb95e938e8c433c044101f5262c702188494471cee57a4ec082ba798'
    audit=json.loads((HERE/'ACTUAL-APPLY-TRANSPORT-AUDIT-01.json').read_bytes())
    assert sha((HERE/'ACTUAL-APPLY-TRANSPORT-AUDIT-01.json').read_bytes())=='002c8ea306ebfcb8ad620ae2886e16ba17e264893355829b8ca14587d0131fc6'
    args=SimpleNamespace(task='T45',job_id=KEY,script='ordinary05_roles_job.py',rewrite=[],phase_arg=['133ef37831a0d6eab788567e711ce104ce70184e5a1e8e52e27aa57712996b47'],timeout_seconds=300)
    files=client['collect_bundle_files'](cfg,args,HERE/'apply/bundle',KEY)
    tree=ast.parse(Path(client['__file__']).read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='submit')
    nodes=[n for n in fn.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('manifest','raw','request') for t in n.targets)]
    assert len(nodes)==3
    scope=dict(client,files=files,args=args,cfg=cfg,job_id=KEY,proofs={})
    exec(compile(ast.Module(body=nodes,type_ignores=[]),client['__file__'],'exec'),scope)
    manifest,raw,request=(scope[k] for k in ('manifest','raw','request'))
    assert manifest==proposal['completeManifest'] and sha(raw)==proposal['completeManifestSha256']
    assert request==proposal['originalRequest'] and sha(json.dumps(request).encode())==proposal['requestBytesSha256']
    original=client['HERE'];history_path=original/'release-submissions.json'
    control=cfg['control']+'/jobs/'+KEY
    expected=dict(audit['uploadedBundle'])
    fixed_deadline=1794840231546
    def valid_time():
        assert time.time_ns()//1000000+30000<fixed_deadline,'ORIGINAL_APPLY_AUTHORITY_EXPIRED_NO_SUBMISSION'
    def probe(label):
        valid_time()
        program="""
from pathlib import Path
import hashlib,json,os,stat,time,subprocess
C=Path(CONTROL);K=KEY;J=C/'jobs'/K;B=Path(PRIVATE)
expected=EXPECTED
def row(p):
 s=p.lstat();assert p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==1000 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=4*1024**2
 return {'state':'PRESENT','device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size,'directory':False,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for p,ino in [(J,28841506),(J/'bundle',28841507)]:
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,ino,1000,1000,0o700)
assert {p.name for p in (J/'bundle').iterdir()}==set(expected)
for n,v in expected.items():assert row(J/'bundle'/n)==v
assert not any(os.path.lexists(p)for p in (B/'jobs'/K,C/'requests'/(K+'.json'),C/'requests'/(K+'.tmp'),C/'results'/(K+'.json')))
assert not os.path.lexists('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data/postmaster.pid')
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
assert q.returncode==0 and not q.stdout.strip() and not q.stderr
for d in Path('/proc').iterdir():
 if not d.name.isdecimal() or int(d.name)==os.getpid():continue
 try:
  if d.stat().st_uid in (0,1000) and (d/'comm').read_text().strip() in ('python','python3','cat','sh','bash','dash'):assert K.encode() not in (d/'cmdline').read_bytes()
 except (FileNotFoundError,ProcessLookupError,PermissionError):pass
print(json.dumps({'state':'EXACT_ORIGINAL_PARTIAL_STAGE_MATCHES_NO_REQUEST_OR_PROCESS','checkedAtMs':time.time_ns()//1000000,'originalKey':K,'originalControlInodes':[28841506,28841507],'bundle':{n:row(J/'bundle'/n)for n in expected},'requestAbsent':True,'rootJobAbsent':True,'activeOperationsEmpty':True,'PGStopped':True,'mutations':0},sort_keys=True))
""".replace('C=Path(CONTROL);K=KEY;J=C/\'jobs\'/K;B=Path(PRIVATE)', 'C=Path('+repr(cfg['control'])+');K='+repr(KEY)+";J=C/'jobs'/K;B=Path("+repr(cfg['private'])+')').replace('expected=EXPECTED','expected='+repr(expected))
        received=client['remote'](cfg,'sudo -n /usr/bin/python3 -I -S -c '+shlex.quote(program))
        with (HERE/label).open('xb') as f:f.write(received)
        return sha(received)
    def upload(name,data):
        valid_time();digest=sha(data)
        program="""
from pathlib import Path
import hashlib,json,os,stat,sys
parent=Path(PARENT);name=LEAF
s=parent.lstat();assert parent.resolve()==parent and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,28841507,1000,1000,0o700)
raw=sys.stdin.buffer.read(LENGTH+1);assert len(raw)==LENGTH and hashlib.sha256(raw).hexdigest()==DIGEST
with os.fdopen(os.open(parent/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
 assert f.write(raw)==len(raw);f.flush();os.fsync(f.fileno())
p=parent/name;s=p.lstat();assert p.resolve()==p and s.st_nlink==1 and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(1000,1000,0o600) and hashlib.sha256(p.read_bytes()).hexdigest()==DIGEST
print(json.dumps({'state':'PRESENT','device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size,'directory':False,'sha256':DIGEST},sort_keys=True))
""".replace('PARENT',repr(control+'/bundle')).replace('LEAF',repr(name)).replace('LENGTH',str(len(data))).replace('DIGEST',repr(digest))
        body=client['remote'](cfg,'python3 -c '+shlex.quote(program),data)
        expected[name]=json.loads(body)
        save('APPLY-RECOVERY-UPLOAD-'+name+'.json',expected[name])
    with (original/'release-client.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        history=json.loads(history_path.read_text()) if history_path.exists() else {}
        assert KEY not in history,'EXISTING_HISTORY_READ_ORIGINAL_NO_REPLAY'
        before=probe('ACTUAL-APPLY-RECOVERY-BEFORE.json')
        status=client['dispatch'](cfg,'status');assert status.get('status')=='READY'
        save('APPLY-RECOVERY-ONCE-INTENT.json',dict(state='ONE_CONTINUATION_OF_UNACCEPTED_STAGE',key=KEY,atMs=time.time_ns()//1000000,
            beforeSha256=before,manifestSha256=sha(raw),requestSha256=sha(json.dumps(request).encode()),preservedThreeLeaves=sorted(expected),
            authoritySha256=args.phase_arg[0],transportSeconds=600,serverJobSeconds=300,automaticReplay=False))
        for name in proposal['missingLeafNames']:upload(name,files[name])
        upload('bundle-manifest.json',raw)
        complete=probe('ACTUAL-APPLY-RECOVERY-COMPLETE-STAGE.json')
        valid_time()
        history_now=json.loads(history_path.read_text()) if history_path.exists() else {}
        assert history_now==history and KEY not in history_now
        # The original v3 history/request/move/start sequence is retained exactly.
        history[KEY]={'taskId':args.task,'grantId':cfg['grantId'],'state':'PREPARED_DO_NOT_REPLAY','request':request}
        history_path.write_text(json.dumps(history,indent=2)+'\n');os.chmod(history_path,0o600)
        temp=cfg['control']+'/requests/'+KEY+'.tmp';target=cfg['control']+'/requests/'+KEY+'.json'
        save('APPLY-RECOVERY-REQUEST-ONCE.json',dict(key=KEY,completeStageSha256=complete,atMs=time.time_ns()//1000000))
        client['remote'](cfg,'umask 077; cat > '+shlex.quote(temp),json.dumps(request).encode())
        client['remote'](cfg,'mv '+shlex.quote(temp)+' '+shlex.quote(target))
        value=client['dispatch'](cfg,'start',KEY)
        output=HERE/'apply/receipts';output.mkdir(parents=True,exist_ok=True)
        with (output/('release-submission-'+KEY+'.json')).open('x') as f:f.write(json.dumps(request,indent=2)+'\n')
        save('APPLY-RECOVERY-START-REPLY.json',value)
        print(json.dumps(value),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as e:
        save('APPLY-RECOVERY-STOPPED-READ-ORIGINAL.json',dict(state='STOP_READ_ORIGINAL_APPLY_KEY_NO_MORE_TRANSFERS',errorClass=type(e).__name__,
            safeCode=str(e) if isinstance(e,(ValueError,AssertionError)) and __import__('re').fullmatch('[A-Z0-9_]+',str(e)) else None,automaticReplay=False))
        raise SystemExit('APPLY_RECOVERY_STOP_READ_ORIGINAL_KEY') from None
