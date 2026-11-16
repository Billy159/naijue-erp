"""Continue the one unaccepted apply stage. No setup, replacement or retry loop."""
from pathlib import Path
from types import SimpleNamespace
import ast,fcntl,hashlib,json,os,runpy,shlex,time

HERE=Path(__file__).resolve().parent
R=HERE.parent
KEY='t45-r3-ordinary36-auth-restore-20261116-01'
sha=lambda b:hashlib.sha256(b).hexdigest()

def save(name,value):
    with (HERE/name).open('x') as f:
        json.dump(value,f,sort_keys=True,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())

def _resume(main_authority_file,main_authority_pin):
    os.umask(0o077)
    assert sha((R/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py').read_bytes())=='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
    client=runpy.run_path(str(R/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'))['load_client']()
    cfg=client['state']();assert cfg['grantId']=='b16447fbc81f4d64'
    audit_path=R/'RESTORE36-UNACCEPTED-RESUME-SOURCE-01/ACTUAL-INVENTORY.json'
    assert sha(audit_path.read_bytes())=='6c3917a736ee92bed1f1cc171a2b06f2ff37c392ecc9d15186f6f6e047770e69'
    audit=json.loads(audit_path.read_bytes());assert audit['uploadedBundle']=={}
    source=R/'NORMAL36-SOURCE-SUCCESSOR-02/restore/bundle'
    policy=R.parents[2]/'主控/20261117-r3-normal36-live-stop-window-01/direct36-batched-real.json'
    assert sha(policy.read_bytes())=='3dd91f04c776d7bd157bde7e5c5c44d63b1a3724ef167ade99cf6e9f0f13a633'
    permit=Path(main_authority_file).resolve();assert permit.name=='host-authorization.json' and permit.parent.parent==policy.parent.parent and permit.is_file() and not Path(main_authority_file).is_symlink()
    issued=permit.read_bytes();assert sha(issued)==main_authority_pin and main_authority_pin!='fbb6ccf5bc21f99fe01b381b44dea0d59938be91f9e959a91c9c77e9ce933c8e'
    authority=json.loads(issued)
    host=runpy.run_path(str(source/'ordinary05_roles_job.py'));host['validate'](authority,'restore',time.time_ns()//1000000)
    assert authority['rolesAuthoritySha256']=='d8341c2a2f0067bf33073a1001e1f50f7f91f6fb872b626a8d2dbd9d57bea57f'
    assert authority['hostSourceSha256']==sha((source/'ordinary05_roles_job.py').read_bytes()) and authority['rolesSourceSha256']==sha((source/'ordinary05_roles.py').read_bytes())
    assert authority['expiresAt']<=1794871887213
    prior=json.loads((R/'NORMAL36-RUNTIME-01/restore/SUBMIT-ONCE-INTENT.json').read_bytes())
    old=json.loads((source/'host-authorization.json').read_bytes())
    assert {k:v for k,v in authority.items() if k not in ('startsAt','expiresAt','authorizationReference')}=={k:v for k,v in old.items() if k not in ('startsAt','expiresAt','authorizationReference')}
    args=SimpleNamespace(task='T45',job_id=KEY,script='ordinary05_roles_job.py',rewrite=[],phase_arg=[main_authority_pin],timeout_seconds=300)
    files=client['collect_bundle_files'](cfg,args,source,KEY);files['host-authorization.json']=issued
    assert len(files)==9 and sha(files['roles-authorization.json'])==authority['rolesAuthoritySha256']
    rule=json.loads(policy.read_bytes())['jobs']['restore']
    assert set(files)==set(rule['bundlePins'])|{'host-authorization.json'} and all(sha(files[k])==v for k,v in rule['bundlePins'].items())
    tree=ast.parse(Path(client['__file__']).read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='submit')
    nodes=[n for n in fn.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('manifest','raw','request') for t in n.targets)]
    assert len(nodes)==3
    scope=dict(client,files=files,args=args,cfg=cfg,job_id=KEY,proofs={})
    exec(compile(ast.Module(body=nodes,type_ignores=[]),client['__file__'],'exec'),scope)
    manifest,raw,request=(scope[k] for k in ('manifest','raw','request'))
    expected_request=dict(prior['request'],args=[main_authority_pin],manifestSha256=sha(raw))
    assert request==expected_request and request['timeoutSeconds']==300
    proposal={'missingLeafNames':[name for name in audit['originalUploadOrder'] if name!='bundle-manifest.json']}
    save('NEW-ISSUED-INPUTS.json',dict(authorityFile=str(permit),authoritySha256=main_authority_pin,manifestSha256=sha(raw),request=request))
    original=client['HERE'];history_path=original/'release-submissions.json'
    control=cfg['control']+'/jobs/'+KEY
    expected=dict(audit['uploadedBundle'])
    fixed_deadline=authority['expiresAt']
    def valid_time():
        assert time.time_ns()//1000000+300000<fixed_deadline,'ORIGINAL_RESTORE36_AUTHORITY_EXPIRED_NO_SUBMISSION'
    def probe(label):
        valid_time()
        program="""
from pathlib import Path
import hashlib,json,os,stat,time,subprocess
C=Path(CONTROL);K=KEY;J=C/'jobs'/K;B=Path(PRIVATE)
expected=EXPECTED
if not expected:
 for label,p in {'job':J,'bundle':J/'bundle','results':J/'results'}.items():
  z=p.lstat();assert [z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]==INITIAL_IDENTITIES[label]
def row(p):
 s=p.lstat();assert p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==1000 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<=4*1024**2
 return {'state':'PRESENT','device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size,'identity':[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns],'directory':False,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for p,ino in [(J,28841818),(J/'bundle',28841819)]:
 s=p.lstat();assert p.resolve()==p and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,ino,1000,1000,0o700)
s=(J/'results').lstat();assert (J/'results').resolve()==J/'results' and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,28841820,1000,1000,0o700) and not any((J/'results').iterdir())
assert {p.name for p in (J/'bundle').iterdir()}==set(expected)
for n,v in expected.items():assert row(J/'bundle'/n)==v
assert not any(os.path.lexists(p)for p in (B/'jobs'/K,C/'requests'/(K+'.json'),C/'requests'/(K+'.tmp'),C/'results'/(K+'.json')))
for g in ('b16447fbc81f4d64','5cc58239751e4e2a'):
 c=C.with_name('grant-'+g);b=B.with_name('grant-'+g)
 assert not any(os.path.lexists(p)for p in (b/'jobs'/K,c/'requests'/(K+'.json'),c/'requests'/(K+'.tmp'),c/'results'/(K+'.json')))
assert not os.path.lexists(C.with_name('grant-5cc58239751e4e2a')/'jobs'/K)
for leaf in ('restore-attempt.json','restored.json'):assert not os.path.lexists(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary36-auth-20261116-01')/leaf)
assert not os.path.lexists('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data/postmaster.pid')
q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
assert q.returncode==0 and not q.stdout.strip() and not q.stderr
for d in Path('/proc').iterdir():
 if not d.name.isdecimal() or int(d.name)==os.getpid():continue
 try:
  if d.stat().st_uid in (0,1000) and (d/'comm').read_text().strip() in ('python','python3','cat','sh','bash','dash'):assert K.encode() not in (d/'cmdline').read_bytes()
 except (FileNotFoundError,ProcessLookupError,PermissionError):pass
print(json.dumps({'state':'EXACT_ORIGINAL_PARTIAL_STAGE_MATCHES_NO_REQUEST_OR_PROCESS','checkedAtMs':time.time_ns()//1000000,'originalKey':K,'originalControlInodes':[28841818,28841819],'bundle':{n:row(J/'bundle'/n)for n in expected},'requestAbsent':True,'rootJobAbsent':True,'activeOperationsEmpty':True,'PGStopped':True,'mutations':0},sort_keys=True))
""".replace('C=Path(CONTROL);K=KEY;J=C/\'jobs\'/K;B=Path(PRIVATE)', 'C=Path('+repr(cfg['control'])+');K='+repr(KEY)+";J=C/'jobs'/K;B=Path("+repr(cfg['private'])+')').replace('expected=EXPECTED','expected='+repr(expected)).replace('INITIAL_IDENTITIES',repr(audit['directoryIdentities']))
        received=client['remote'](cfg,'sudo -n /usr/bin/python3 -I -S -c '+shlex.quote(program))
        with (HERE/label).open('xb') as f:f.write(received)
        return sha(received)
    def upload(name,data):
        valid_time();digest=sha(data)
        program="""
from pathlib import Path
import hashlib,json,os,stat,sys
parent=Path(PARENT);name=LEAF
s=parent.lstat();assert parent.resolve()==parent and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,28841819,1000,1000,0o700)
raw=sys.stdin.buffer.read(LENGTH+1);assert len(raw)==LENGTH and hashlib.sha256(raw).hexdigest()==DIGEST
with os.fdopen(os.open(parent/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
 assert f.write(raw)==len(raw);f.flush();os.fsync(f.fileno())
p=parent/name;s=p.lstat();assert p.resolve()==p and s.st_nlink==1 and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(1000,1000,0o600) and hashlib.sha256(p.read_bytes()).hexdigest()==DIGEST
print(json.dumps({'state':'PRESENT','device':s.st_dev,'inode':s.st_ino,'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'bytes':s.st_size,'identity':[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns],'directory':False,'sha256':DIGEST},sort_keys=True))
""".replace('PARENT',repr(control+'/bundle')).replace('LEAF',repr(name)).replace('LENGTH',str(len(data))).replace('DIGEST',repr(digest))
        body=client['remote'](cfg,'python3 -c '+shlex.quote(program),data)
        expected[name]=json.loads(body)
        save('RESTORE36-RECOVERY-UPLOAD-'+name+'.json',expected[name])
    with (original/'release-client.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        history=json.loads(history_path.read_text()) if history_path.exists() else {}
        assert KEY not in history,'EXISTING_HISTORY_READ_ORIGINAL_NO_REPLAY'
        before=probe('ACTUAL-RESTORE36-RECOVERY-BEFORE.json')
        status=client['dispatch'](cfg,'status');assert status.get('status')=='READY'
        save('RESTORE36-RECOVERY-ONCE-INTENT.json',dict(state='ONE_CONTINUATION_OF_UNACCEPTED_STAGE',key=KEY,atMs=time.time_ns()//1000000,
            beforeSha256=before,manifestSha256=sha(raw),requestSha256=sha(json.dumps(request).encode()),preservedThreeLeaves=sorted(expected),
            authoritySha256=args.phase_arg[0],transportSeconds=600,serverJobSeconds=300,automaticReplay=False))
        for name in proposal['missingLeafNames']:upload(name,files[name])
        upload('bundle-manifest.json',raw)
        complete=probe('ACTUAL-RESTORE36-RECOVERY-COMPLETE-STAGE.json')
        valid_time()
        history_now=json.loads(history_path.read_text()) if history_path.exists() else {}
        assert history_now==history and KEY not in history_now
        # The original v3 history/request/move/start sequence is retained exactly.
        history[KEY]={'taskId':args.task,'grantId':cfg['grantId'],'state':'PREPARED_DO_NOT_REPLAY','request':request}
        history_path.write_text(json.dumps(history,indent=2)+'\n');os.chmod(history_path,0o600)
        temp=cfg['control']+'/requests/'+KEY+'.tmp';target=cfg['control']+'/requests/'+KEY+'.json'
        save('RESTORE36-RECOVERY-REQUEST-ONCE.json',dict(key=KEY,completeStageSha256=complete,atMs=time.time_ns()//1000000))
        client['remote'](cfg,'umask 077; cat > '+shlex.quote(temp),json.dumps(request).encode())
        client['remote'](cfg,'mv '+shlex.quote(temp)+' '+shlex.quote(target))
        value=client['dispatch'](cfg,'start',KEY)
        output=R/'NORMAL36-RUNTIME-01/restore';output.mkdir(parents=True,exist_ok=True)
        with (output/('release-submission-'+KEY+'.json')).open('x') as f:f.write(json.dumps(request,indent=2)+'\n')
        save('RESTORE36-RECOVERY-START-REPLY.json',value)
        print(json.dumps(value),flush=True)

def resume(main_authority_file,main_authority_pin):
    try:return _resume(main_authority_file,main_authority_pin)
    except Exception as e:
        save('RESTORE36-RECOVERY-STOPPED-READ-ORIGINAL.json',dict(state='STOP_READ_ORIGINAL_RESTORE36_KEY_NO_MORE_TRANSFERS',errorClass=type(e).__name__,safeCode=str(e) if isinstance(e,(ValueError,AssertionError)) and __import__('re').fullmatch('[A-Z0-9_]+',str(e)) else None,automaticReplay=False))
        raise SystemExit('RESTORE36_RECOVERY_STOP_READ_ORIGINAL_KEY') from None

if __name__=='__main__':
    raise SystemExit('EXACT_NEW_MAIN_ISSUED_AUTHORITY_REQUIRED_CALL_REVIEWED_RESUME_API')
