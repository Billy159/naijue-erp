# Rapid-launch C transport, retaining the existing bounded T45 dispatcher protocol.
# T45 is the existing operations carrier, not a restart of the historical task queue.
# Original client SHA256: 54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6
"""Temporary SSH identity + one bounded root dispatcher; no password fallback."""
import argparse, base64, fcntl, hashlib, json, os, re, shlex, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

CONNECTION_REF=os.environ.get('ERP_RELEASE_CONNECTION_REF','')
if not CONNECTION_REF or not Path(CONNECTION_REF).is_absolute():raise SystemExit('EXPLICIT_CONNECTION_FILE_REFERENCE_REQUIRED')
STATE=Path(CONNECTION_REF)
if STATE.name!='release-connection.json' or STATE.resolve()!=STATE:raise SystemExit('CANONICAL_EXISTING_CONNECTION_REFERENCE_REQUIRED')
HERE=STATE.parent
PROJECT=Path(__file__).resolve().parents[2]
CONTROL=PROJECT.parent/'local-takeover-20261021-control'
JOB_ROOT=CONTROL/'reports/controller/rapid-launch-20261022/server-jobs'
HISTORY=JOB_ROOT/'job-registry.json'

def ident(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,70}',value):raise ValueError('UNIQUE_JOB_ID_REQUIRED')
    return value

def state():
    if not STATE.is_file() or STATE.is_symlink():raise ValueError('RELEASE_GRANT_NOT_INSTALLED')
    cfg=json.loads(STATE.read_text())
    if cfg.get('host')!='naijue@100.91.40.86' or not re.fullmatch(r'[a-f0-9]{16}',cfg.get('grantId','')):raise ValueError('RELEASE_GRANT_IDENTITY_REFUSED')
    grant=cfg['grantId']
    if cfg.get('dispatcher')!='/usr/local/lib/naijue-erp-night/grant-'+grant+'/admin_exec.py' or cfg.get('control')!='/home/naijue/erp-release-20261006-01-control/grant-'+grant or cfg.get('private')!='/root/erp-release-20261006-01-worker/grant-'+grant:
        raise ValueError('RELEASE_GRANT_NAMESPACE_REFUSED')
    key=Path(cfg['keyFile']);expected=HERE/('release-'+cfg['grantId']+'.key')
    if key!=expected or key.is_symlink() or key.stat().st_mode&0o077 or key.stat().st_uid!=os.getuid():raise ValueError('PRIVATE_KEY_LOCATION_OR_PERMISSIONS_REFUSED')
    return cfg

def remote(cfg,command,data=None):
    args=['/usr/bin/ssh','-i',cfg['keyFile'],'-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','BatchMode=yes','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3',cfg['host'],command]
    p=subprocess.run(args,input=data,capture_output=True,timeout=40)
    if p.returncode:raise ValueError('LEASED_CHANNEL_OR_DISPATCHER_FAILED_NO_PASSWORD_FALLBACK')
    return p.stdout

def dispatch(cfg,action,job=None,force=False):
    argv=['sudo','-n','/usr/bin/python3','-s',cfg['dispatcher'],'--action',action]
    if job:argv+=['--job-id',ident(job)]
    if force:argv+=['--force']
    return json.loads(remote(cfg,' '.join(shlex.quote(x) for x in argv)))

def directory(value,task):
    p=Path(value).absolute()
    if task!='T45' or p.resolve()!=p or not p.is_relative_to(JOB_ROOT):raise ValueError('EXACT_RAPID_LAUNCH_JOB_DIRECTORY_REQUIRED')
    return p

def submit(cfg,args):
    if not re.fullmatch(r'T(10|15|16|17|18|19|3[6-9]|4[0-9]|5[01])',args.task):raise ValueError('TASK_OUTSIDE_RELEASE_SCOPE')
    job_id=ident(args.job_id);source=directory(args.source_dir,args.task);output=directory(args.output_dir,args.task)
    JOB_ROOT.mkdir(parents=True,exist_ok=True)
    history_path=HISTORY;history=json.loads(history_path.read_text()) if history_path.exists() else {}
    original_history=HERE/'release-submissions.json'
    if original_history.exists() and job_id in json.loads(original_history.read_text()):raise ValueError('ORIGINAL_JOB_ID_ALREADY_EXISTS_NO_REPLAY')
    if job_id in history:raise ValueError('WORK_ALREADY_SUBMITTED_OR_UNKNOWN_NO_REPLAY')
    current=dispatch(cfg,'status')
    if current.get('status')!='READY':raise ValueError('RELEASE_GRANT_NOT_READY')
    private=cfg['private']+'/jobs/'+job_id;control=cfg['control']+'/jobs/'+job_id
    files={}
    for path in source.iterdir():
        if not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,120}',path.name) or path.suffix not in {'.py','.mjs','.js','.json','.sh','.sql','.yaml','.yml','.md'} or re.search(r'(^|[_.-])(private|secret|credentials?|password|token|cookie)([_.-]|$)',path.name,re.I):continue
        if path.is_symlink() or not path.is_file() or path.stat().st_size>4*1024*1024:raise ValueError('BOUNDED_REGULAR_BUNDLE_REQUIRED')
        text=path.read_text()
        for prefix in sorted(args.rewrite,key=len,reverse=True):text=text.replace(prefix,private)
        files[path.name]=text.encode()
    if args.script not in files or len(files)>128 or sum(map(len,files.values()))>32*1024*1024:raise ValueError('PHASE_OR_BOUNDED_BUNDLE_REQUIRED')
    proofs=json.loads(Path(args.evidence).read_text()) if args.evidence else {}
    for section in ['gateEvidence','taskEvidence']:
        for proof in proofs.get(section,{}).values():
            proof_path=Path(proof.get('sourcePath','')).absolute()
            if proof_path.resolve()!=proof_path or not proof_path.is_relative_to(PROJECT/'outputs') or not proof_path.is_file() or hashlib.sha256(proof_path.read_bytes()).hexdigest()!=proof.get('sourceSha256'):
                raise ValueError('ACTUAL_ACCEPTANCE_SOURCE_DIGEST_REQUIRED')
    manifest={'taskId':args.task,'jobId':job_id,'files':[{'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(files.items())]}
    raw=(json.dumps(manifest,sort_keys=True)+'\n').encode()
    request={'taskId':args.task,'jobId':job_id,'grantId':cfg['grantId'],'scope':'ERP_EXISTING_TASKS_THROUGH_T51','script':args.script,'args':args.phase_arg,'timeoutSeconds':args.timeout_seconds,'manifestSha256':hashlib.sha256(raw).hexdigest(),'gateEvidence':proofs.get('gateEvidence',{}),'taskEvidence':proofs.get('taskEvidence',{}),'businessCutoverConfirmed':proofs.get('businessCutoverConfirmed',False)}
    setup="from pathlib import Path;p=Path("+repr(control)+");assert not p.exists(),'JOB_ALREADY_PRESENT_NO_REPLAY';p.mkdir(mode=0o700);[(p/n).mkdir(mode=0o700) for n in ['bundle','results']]"
    remote(cfg,'python3 -c '+shlex.quote(setup))
    for name,data in [*files.items(),('bundle-manifest.json',raw)]:remote(cfg,'umask 077; cat > '+shlex.quote(control+'/bundle/'+name),data)
    temp=cfg['control']+'/requests/'+job_id+'.tmp';target=cfg['control']+'/requests/'+job_id+'.json'
    history[job_id]={'taskId':args.task,'grantId':cfg['grantId'],'state':'PREPARED_DO_NOT_REPLAY','request':request}
    history_path.write_text(json.dumps(history,indent=2)+'\n');os.chmod(history_path,0o600)
    remote(cfg,'umask 077; cat > '+shlex.quote(temp),json.dumps(request).encode());remote(cfg,'mv '+shlex.quote(temp)+' '+shlex.quote(target))
    value=dispatch(cfg,'start',job_id)
    output.mkdir(parents=True,exist_ok=True);(output/('release-submission-'+job_id+'.json')).write_text(json.dumps(request,indent=2)+'\n')
    print(json.dumps(value,ensure_ascii=False))

FIXED_D0_COLLECT_KEYS = {'t45-r48-d0-arm-20261016-323', 't45-r48-d0-activate-20261016-324', 't45-r48-d0-close-20261016-325'}
FIXED_D0_EXPORTS = {'d0-window-status.json', 'd0-activation.json', 'd0-restoration.json'}

def collect_fixed_d0(cfg,args,dest):
    # Read only this fixed original job's already-redacted public receipts.
    # One existing remote() call replaces receipt + three sequential SSH calls.
    script = """import base64,json,re
from pathlib import Path
control=Path(CONTROL_LITERAL)
job=JOB_LITERAL
task=TASK_LITERAL
allowed={'d0-window-status.json','d0-activation.json','d0-restoration.json'}
def read(path,limit):
    assert path.is_file() and not path.is_symlink() and path.stat().st_size<=limit,'BOUNDED_ORIGINAL_RECEIPT_REQUIRED'
    data=path.read_bytes()
    assert len(data)<=limit,'BOUNDED_ORIGINAL_RECEIPT_REQUIRED'
    return data
path=control/'results'/(job+'.json')
if not path.exists():
    print(json.dumps({'receipt':None,'exports':{}}))
else:
    raw=read(path,131072)
    value=json.loads(raw)
    assert value.get('jobId')==job and value.get('taskId')==task,'RECEIPT_SCOPE_MISMATCH'
    names=value.get('exports',[])
    assert isinstance(names,list) and len(names)<=3 and len(set(names))==len(names) and set(names)<=allowed,'FIXED_D0_EXPORT_SET_REQUIRED'
    files={name:base64.b64encode(read(control/'jobs'/job/'results'/name,16*1024*1024)).decode() for name in names}
    print(json.dumps({'receipt':base64.b64encode(raw).decode(),'exports':files}))
"""
    script=script.replace('CONTROL_LITERAL',repr(cfg['control'])).replace('JOB_LITERAL',repr(args.job_id)).replace('TASK_LITERAL',repr(args.task))
    raw=remote(cfg,'python3 -c '+shlex.quote(script))
    if len(raw)>3*24*1024*1024+262144:raise ValueError('BOUNDED_FIXED_D0_COLLECTION_REQUIRED')
    packet=json.loads(raw)
    if packet.get('receipt') is None:
        if packet.get('exports')!={}:raise ValueError('FIXED_D0_EXPORT_WITHOUT_RECEIPT_REFUSED')
        print(json.dumps({'jobId':args.job_id,'status':'WAITING_RECEIPT_NO_REPLAY'}));return
    receipt=base64.b64decode(packet['receipt'],validate=True)
    if len(receipt)>131072:raise ValueError('BOUNDED_ORIGINAL_RECEIPT_REQUIRED')
    value=json.loads(receipt)
    if value.get('jobId')!=args.job_id or value.get('taskId')!=args.task:raise ValueError('RECEIPT_TASK_SCOPE_MISMATCH')
    names=value.get('exports',[])
    if not isinstance(names,list) or len(names)>3 or any(not isinstance(name,str) for name in names) or len(set(names))!=len(names) or not set(names)<=FIXED_D0_EXPORTS or set(packet.get('exports',{}))!=set(names):raise ValueError('FIXED_D0_EXPORT_SET_REQUIRED')
    files={name:base64.b64decode(packet['exports'][name],validate=True) for name in names}
    if any(len(data)>16*1024*1024 for data in files.values()):raise ValueError('BOUNDED_FIXED_D0_EXPORT_REQUIRED')
    # Validate the complete packet before updating any local evidence.
    for data in files.values():json.loads(data)
    for name,data in [*files.items(),('job.json',receipt)]:
        target=dest/name;temp=dest/(name+'.tmp');temp.write_bytes(data);os.replace(temp,target)
    print(json.dumps({k:value.get(k) for k in ['jobId','taskId','status','exitCode','elapsedSeconds']},ensure_ascii=False))

def collect(cfg,args):
    ident(args.job_id);output=directory(args.output_dir,args.task);dest=output/'release-receipts'/args.job_id;dest.mkdir(parents=True,exist_ok=True)
    if args.task=='T45' and args.job_id in FIXED_D0_COLLECT_KEYS:return collect_fixed_d0(cfg,args,dest)
    path=cfg['control']+'/results/'+args.job_id+'.json';raw=remote(cfg,'if test -f '+shlex.quote(path)+'; then cat '+shlex.quote(path)+'; fi')
    if not raw:print(json.dumps({'jobId':args.job_id,'status':'WAITING_RECEIPT_NO_REPLAY'}));return
    value=json.loads(raw)
    if value.get('taskId')!=args.task:raise ValueError('RECEIPT_TASK_SCOPE_MISMATCH')
    (dest/'job.json').write_bytes(raw)
    for name in value.get('exports',[]):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.json',name) or re.search('private|secret|password|token|cookie',name,re.I):raise ValueError('TYPED_EXPORT_NAME_REFUSED')
        data=remote(cfg,'cat '+shlex.quote(cfg['control']+'/jobs/'+args.job_id+'/results/'+name));(dest/name).write_bytes(data)
    print(json.dumps({k:value.get(k) for k in ['jobId','taskId','status','exitCode','elapsedSeconds']},ensure_ascii=False))

def end_grant(cfg,force,reason):
    if cfg.get('installed')=='REVOKED':
        return {'status':'CLOSED','grantId':cfg['grantId'],'reason':cfg.get('revokedReason'),'alreadyClosed':True}
    value=dispatch(cfg,'revoke',force=force)
    if value.get('status') not in {'REVOKED','CLOSED'}:raise ValueError('REVOKE_NOT_CONFIRMED')
    cfg.update(installed='REVOKED',revokedReason=reason,revokedAtUTC=datetime.now(timezone.utc).isoformat())
    temp=STATE.with_suffix('.tmp');temp.write_text(json.dumps(cfg,indent=2)+'\n');os.chmod(temp,0o600);os.replace(temp,STATE)
    return dict(value,reason=reason)

def main():
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='action',required=True);sub.add_parser('status');end=sub.add_parser('end');end.add_argument('--force',action='store_true');end.add_argument('--reason',choices=['T51_COMPLETE','USER_STOP'],default='USER_STOP')
    run=sub.add_parser('run');run.add_argument('--task',required=True);run.add_argument('--job-id',required=True);run.add_argument('--source-dir',required=True);run.add_argument('--script',required=True);run.add_argument('--output-dir',required=True);run.add_argument('--timeout-seconds',type=int,default=3600);run.add_argument('--phase-arg',action='append',default=[]);run.add_argument('--rewrite',action='append',default=[]);run.add_argument('--evidence')
    get=sub.add_parser('collect');get.add_argument('--task',required=True);get.add_argument('--job-id',required=True);get.add_argument('--output-dir',required=True)
    args=parser.parse_args();cfg=state()
    if args.action=='status':print(json.dumps({'status':'CLOSED','grantId':cfg['grantId'],'reason':cfg.get('revokedReason')} if cfg.get('installed')=='REVOKED' else dispatch(cfg,'status'),ensure_ascii=False))
    elif args.action=='end':print(json.dumps(end_grant(cfg,args.force,args.reason),ensure_ascii=False))
    elif args.action=='collect':collect(cfg,args)
    else:
        with (HERE/'release-client.lock').open('a+') as lock:fcntl.flock(lock,fcntl.LOCK_EX);submit(cfg,args)

if __name__=='__main__':
    try:main()
    except (ValueError,subprocess.TimeoutExpired) as error:raise SystemExit(str(error) if isinstance(error,ValueError) else 'LEASED_CHANNEL_TIMEOUT_DO_NOT_REPLAY')
