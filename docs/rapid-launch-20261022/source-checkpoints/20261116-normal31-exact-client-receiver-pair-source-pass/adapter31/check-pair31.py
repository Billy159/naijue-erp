"""Local actual collector->canonical manifest->receiver member-buffer block; no admission, clock or network."""
from pathlib import Path
from types import SimpleNamespace
import ast,copy,hashlib,json,os,re,runpy,shutil,stat,tempfile
H=Path(__file__).resolve().parent;ROOT=H.parents[3];T=H.parent
M=ROOT/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE31-INSTALL-TRANSPORT-02'
C=T/'20261116-r3-normal31-source-local-01/CANDIDATE-01';B=T/'20261116-r3-service31-registration-basis-local-01/read-registration-basis31.py'
sha=lambda b:hashlib.sha256(b).hexdigest();checks=[]
def ok(label,value):assert value,label;checks.append(label)
def refused(label,fn,code=None):
 try:fn()
 except ValueError as error:
  assert code is None or str(error)==code,(label,str(error));checks.append(label)
 else:raise AssertionError(label)

a=runpy.run_path(str(H/'register_issued31_once.py'),run_name='local_metadata_only');a['check_local_pair']()
ok('main02_complete_pins',sha((M/'PINS.json').read_bytes())=='184e65b96ab721b88853e5028971343fad46134748b110b3910f109f212f07e8' and all(sha((M/n).read_bytes())==h for n,h in json.loads((M/'PINS.json').read_bytes()).items()))
client=a['TRANSPORT_CLIENT'];api=runpy.run_path(str(client),run_name='local_pure_collector_only');tree=ast.parse(client.read_bytes())
submit=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='submit')
manifest_nodes=[n for n in submit.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('manifest','raw')];assert len(manifest_nodes)==2
receiver=M/'admin_exec.DIRECT31-UNREGISTERED.py';rt=ast.parse(receiver.read_bytes());freeze=next(n for n in rt.body if isinstance(n,ast.FunctionDef) and n.name=='freeze')
# The exact unchanged receiver AST segment starts after its real admission/clock checks
# and ends before d0_admit. No future authority is supplied and no successful admission is simulated.
start=next(i for i,n in enumerate(freeze.body) if isinstance(n,ast.Assign) and any(isinstance(v,ast.Name) and v.id=='source' for v in n.targets))
end=next(i for i,n in enumerate(freeze.body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='d0_admit')
member_nodes=freeze.body[start:end]
functions=[n for n in rt.body if isinstance(n,ast.FunctionDef) and n.name in ('check','canonical','fixed_install_code_member','read_fixed_install_code')]
ns=dict(Path=Path,os=os,stat=stat,hashlib=hashlib,re=re,json=json)
exec(compile(ast.Module(body=functions,type_ignores=[]),str(receiver),'exec'),ns)
member_code=compile(ast.Module(body=member_nodes,type_ignores=[]),str(receiver),'exec')
w=json.loads((C/'PHASES31.UNISSUED.json').read_bytes());rule=w['jobs']['install'];jobid=rule['jobId'];code=(C/'install/bundle/private_transport.py').read_bytes()
fixtures=T/'20261116-r3-normal31-source-local-01/transport-manifest-inputs/install'
args=SimpleNamespace(task='T45',script=rule['script'],rewrite=[])
cfg={'grantId':'b16447fbc81f4d64','private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'}
files=api['collect_bundle_files'](cfg,args,fixtures,jobid)
ok('actual846_collector_all_canonical_install_members',set(files)==set(rule['bundlePins'])|{rule['authorityLeaf']} and all(sha(files[n])==p for n,p in rule['bundlePins'].items()))
ms=dict(args=args,job_id=jobid,files=files,hashlib=hashlib,json=json);exec(compile(ast.Module(body=manifest_nodes,type_ignores=[]),str(client),'exec'),ms)
manifest=ms['manifest'];raw=ms['raw']
ok('actual_submit_manifest_matches_canonical_install',manifest=={'taskId':'T45','jobId':jobid,'files':[dict(name=n,bytes=len(files[n]),sha256=sha(files[n])) for n in sorted(files)]})
def receive(temp,change_job=None,change_manifest=None,change_cfg=None,change_fs=None):
 c=Path(temp)/'control';p=Path(temp)/'private';c.mkdir();p.mkdir();source=c/'jobs'/jobid/'bundle';source.mkdir(parents=True)
 for name,body in files.items():(source/name).write_bytes(body)
 m=copy.deepcopy(manifest);j=dict(taskId='T45',jobId=jobid,grantId=cfg['grantId'],script=rule['script'],args=[],manifestSha256=sha(raw))
 cf={**cfg,'private':str(p)}
 if change_job:change_job(j)
 if change_manifest:change_manifest(m)
 if change_cfg:change_cfg(cf)
 mr=(json.dumps(m,sort_keys=True)+'\n').encode();j['manifestSha256']=sha(mr);(source/'bundle-manifest.json').write_bytes(mr)
 if change_fs:change_fs(source,p)
 scope={**ns,'c':c,'p':p,'job':j,'job_id':jobid,'cfg':cf};exec(member_code,scope)
 assert not (p/'jobs').exists(),'NO_PRIVATE_FREEZE_OR_ADMISSION_EXECUTED'
 return scope['buffers']
def trial(**kwargs):
 with tempfile.TemporaryDirectory(prefix='pair31-',dir=H) as temp:return receive(temp,**kwargs)
received=trial();ok('actual_receiver_member_read_hash_buffers_equal_uploaded_bytes',received==files and received['private_transport.py']==code)
for label,change in [('wrong_task',lambda j:j.update(taskId='T44')),('wrong_job',lambda j:j.update(jobId='t45-r3-batched-real-execute-20261115-01')),('wrong_request_grant',lambda j:j.update(grantId='5cc58239751e4e2a'))]:
 kw={'change_job':change}
 if label=='wrong_task':kw['change_manifest']=lambda m:m.update(taskId='T44')
 refused('receiver_'+label,lambda kw=kw:trial(**kw),'BUNDLE_MEMBER_REFUSED')
refused('receiver_wrong_cfg_grant',lambda:trial(change_cfg=lambda cf:cf.update(grantId='5cc58239751e4e2a')),'BUNDLE_MEMBER_REFUSED')
def row_change(field,value):
 def edit(m):next(row for row in m['files'] if row['name']=='private_transport.py')[field]=value
 return edit
refused('receiver_row_length_mismatch',lambda:trial(change_manifest=row_change('bytes',12282)),'BUNDLE_MEMBER_REFUSED')
refused('receiver_row_sha_mismatch',lambda:trial(change_manifest=row_change('sha256','0'*64)),'BUNDLE_MEMBER_REFUSED')
wrong=bytearray(code);wrong[4]=(wrong[4]+1)%128
refused('receiver_same_length_body_changed',lambda:trial(change_fs=lambda s,p:(s/'private_transport.py').write_bytes(wrong)),'FIXED_INSTALL_CODE_SHA_REFUSED')
old=(T/'20261116-r3-normal30-source-local-01/CANDIDATE-01/install/bundle/private_transport.py').read_bytes()
refused('receiver_old30_bytes_and_row',lambda:trial(change_manifest=row_change('sha256',sha(old)),change_fs=lambda s,p:(s/'private_transport.py').write_bytes(old)),'BUNDLE_MEMBER_REFUSED')
for name in ('secret.json','password.json','credentials.json','token.json','cookie.json','private_other.py'):
 def extra(m,name=name):m['files'].append(dict(name=name,bytes=1,sha256=sha(b'x')))
 def fs(s,p,name=name):(s/name).write_bytes(b'x')
 refused('receiver_other_sensitive_'+name,lambda extra=extra,fs=fs:trial(change_manifest=extra,change_fs=fs),'BUNDLE_MEMBER_REFUSED')
def symlink(s,p):
 (s/'private_transport.py').unlink();(s/'private_transport.py').symlink_to(C/'install/bundle/private_transport.py')
refused('receiver_symlink',lambda:trial(change_fs=symlink),'NONCANONICAL_OR_SYMLINK_REFUSED')
def hardlink(s,p):os.link(s/'private_transport.py',s/'second-link')
refused('receiver_hardlink',lambda:trial(change_fs=hardlink),'FIXED_INSTALL_CODE_FILE_REFUSED')
refused('receiver_existing_original_private_job',lambda:trial(change_fs=lambda s,p:(p/'jobs'/jobid).mkdir(parents=True)),'JOB_ALREADY_PRESENT_NO_REPLAY')
b=runpy.run_path(str(B),run_name='local_metadata_only');program,expected,jobs,paths=b['prepare']();ast.parse(program)
ok('basis128_six_future_paths_no_completed04_absence',len(expected)==128 and len(paths)==6 and 'installed-real-operation-batched-root04' not in '\n'.join(paths))
p=ast.parse(program);out=next(n for n in ast.walk(p) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='dumps' and n.args and isinstance(n.args[0],ast.Dict))
keys=[ast.literal_eval(k) for k in out.args[0].keys];ok('basis_output_no_stale29_or_new04_absence',not any('29' in k or 'newRoot04OutputAbsent'==k for k in keys))
ok('basis_six_phase_candidate_excludes_material04',"candidate_jobs={phase:key for phase,key in JOBS.items() if phase!='materialize'}" in program)
issuer=ast.parse((M/'issue_registration.py').read_bytes());report=next(n for n in ast.walk(issuer) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='dict' and any(k.arg=='state' for k in n.keywords));state=next(ast.literal_eval(k.value) for k in report.keywords if k.arg=='state')
ok('adapter_issued_state_matches_actual31_issuer',state=='ISSUED_EXACT_COMPLETED_ROOT04_REUSE_REGISTRATION_NO_SERVER_ACTION' and state in (H/'register_issued31_once.py').read_text())
ok('runner_actual_client_and_rule_pins_bound',a['RUNNER_SHA']==sha((C/'run_frozen_phase31.py').read_bytes()) and a['TRANSPORT_CLIENT_SHA']==sha(client.read_bytes()) and a['RULES']==sha((C/'PHASES31.UNISSUED.json').read_bytes()))
for file in [H/'register_issued31_once.py',H/'read-registration31-original.py',B]:
 tree=ast.parse(file.read_bytes())
 for n in tree.body:
  if isinstance(n,ast.Assign) and isinstance(n.value,ast.Constant) and isinstance(n.value.value,str) and any(isinstance(v,ast.Name) and v.id in ('PROGRAM','program') for v in n.targets):ast.parse(n.value.value.replace('EXPECTED_LITERAL','{}').replace('JOBS_LITERAL','{}').replace('PATHS_LITERAL','[]').replace('LOCK_LITERAL','[]'))
result=dict(state='PASS_LOCAL31_02_COLLECTOR_MANIFEST_RECEIVER_MEMBER_BUFFER_ONLY',checks=checks,checksPassed=len(checks),mainPinsSha256=sha((M/'PINS.json').read_bytes()),clientSha256=sha(client.read_bytes()),runnerSha256=a['RUNNER_SHA'],receiverSha256=sha(receiver.read_bytes()),installManifestWithOpaquePrior30FixtureSha256=sha(raw),receiverMemberBlockSourceLines=[member_nodes[0].lineno,member_nodes[-1].end_lineno],basisFiles=128,futureCandidatePhases=6,completed04NeverResubmit=True,authoritySemanticsOrAdmissionTested=False,receiverPrivateJobCreated=False,actual31AuthorityIssued=False,networkCalls=0,clockOrUidMocks=False,postgresActions=0,actualRuntimeOrFullFreezeTested=False,priorChecks43ReusedNotRepeated=True)
(H/'CHECKS-PAIR31.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
