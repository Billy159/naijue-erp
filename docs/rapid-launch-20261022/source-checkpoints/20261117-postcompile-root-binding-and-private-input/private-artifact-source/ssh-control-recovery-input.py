# Rapid-launch C transport, retaining the existing bounded T45 dispatcher protocol.
# T45 is the existing operations carrier, not a restart of the historical task queue.
# Original client SHA256: 54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6
"""Temporary SSH identity + one bounded root dispatcher; no password fallback."""
import argparse, base64, fcntl, hashlib, json, os, re, shlex, stat, subprocess, sys, tempfile, time
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
CONTROL_PATH=None

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
    if CONTROL_PATH:
        args[1:1]=['-o','ControlMaster=auto','-o','ControlPersist=60','-o','ControlPath='+CONTROL_PATH]
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


# Original leased channel only. These are finite files for one existing RUNNING
# root controller; no dispatcher action, remote path option or new job is added.
CAPACITY_RECEIPTS = ('gate-ready.json', 'content-ready.json', 'delivery-result.json')
CAPACITY_PHASE_FILES = {
    'CONTENT': ('capacity-launch.json', 'owner-profile.json', 'content-manifest.json'),
    'APPROVAL': ('approved-final-delivery.json', 'approval-manifest.json'),
}
CAPACITY_SCOPE_KEYS = ('jobId', 'taskId', 'grantId', 'containerId', 'sourceCommit', 'helperSha256', 'authority',
                       'deadlineAt', 'process', 'targetFingerprint', 'producerReviewSha256')
CAPACITY_VOLUMES = ('postgres', 'wal', 'backup', 'system', 'media')

def cap_need(value, code):
    if not value: raise ValueError(code)

def cap_bag(value, keys):
    cap_need(type(value) is dict and set(value) == set(keys), 'CAPACITY_CLOSED_FIELDS_REQUIRED')
    return value

def cap_hash(value):
    return isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value) is not None

def cap_json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode('utf8')

def cap_json_read(raw):
    def pairs(rows):
        out = {}
        for key, value in rows:
            cap_need(key not in out, 'CAPACITY_DUPLICATE_JSON_KEY')
            out[key] = value
        return out
    return json.loads(raw.decode('utf8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('CAPACITY_FINITE_JSON_REQUIRED')))

def cap_local_file(filename, job_id, controller_decision=False):
    p = Path(filename).absolute()
    cap_need(p.resolve() == p and not any(x.is_symlink() for x in [p, *p.parents]), 'CAPACITY_CANONICAL_LOCAL_INPUT_REQUIRED')
    root = CONTROL / 'reports/controller/rapid-launch-20261022' if controller_decision else JOB_ROOT / job_id
    cap_need(p.is_relative_to(root) and p != root, 'CAPACITY_LOCAL_INPUT_SCOPE_REQUIRED')
    info = p.lstat()
    cap_need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.getuid() and
             info.st_mode & 0o077 == 0 and 0 < info.st_size <= 65536, 'CAPACITY_BOUNDED_PRIVATE_LOCAL_INPUT_REQUIRED')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd); raw = os.read(fd, 65537); after = os.fstat(fd)
        cap_need((before.st_dev, before.st_ino) == (info.st_dev, info.st_ino) and len(raw) == info.st_size and
                 (before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'CAPACITY_LOCAL_INPUT_CHANGED')
    finally: os.close(fd)
    return raw

def cap_scope(value, cfg, job_id, allow_expired=False):
    cap_bag(value, CAPACITY_SCOPE_KEYS)
    cap_need(value['jobId'] == ident(job_id) and value['taskId'] == 'T45' and value['grantId'] == cfg['grantId'] and
             isinstance(value['containerId'], str) and cap_hash(value['containerId']) and isinstance(value['sourceCommit'], str) and
             re.fullmatch(r'[a-f0-9]{40}', value['sourceCommit']) and all(cap_hash(value[k]) for k in ('helperSha256', 'targetFingerprint', 'producerReviewSha256')),
             'CAPACITY_EXACT_RUNNING_SCOPE_REQUIRED')
    cap_bag(value['authority'], ('path', 'sha256'))
    cap_need(value['authority']['path'] == cfg['private'] + '/jobs/' + job_id + '/bundle/capacity-input-authority.json' and
             cap_hash(value['authority']['sha256']), 'CAPACITY_ORIGINAL_AUTHORITY_REF_REQUIRED')
    process = cap_bag(value['process'], ('pid', 'linuxStartTicks', 'linuxBootId'))
    cap_need(process['pid'] == 1 and type(process['pid']) is int and isinstance(process['linuxStartTicks'], str) and
             re.fullmatch(r'[1-9][0-9]*', process['linuxStartTicks']) and isinstance(process['linuxBootId'], str) and
             re.fullmatch(r'[a-f0-9-]{36}', process['linuxBootId']) and type(value['deadlineAt']) is int,
             'CAPACITY_EXACT_PID1_APPROVAL_REQUIRED')
    if not allow_expired:
        cap_need(time.time()*1000 < value['deadlineAt'] <= time.time()*1000+300000, 'CAPACITY_DELIVERY_DEADLINE_INVALID')
    return value

def cap_no_credentials(value):
    if type(value) is dict:
        for key, item in value.items():
            # Operational windowToken and authority references are explicitly typed,
            # never account credentials. No complete runtime/postgres config is accepted.
            cap_need(not re.search(r'password|secret|credential|cookie|dsn|connection.?string|csrf|authorization', key, re.I), 'CAPACITY_CREDENTIAL_INPUT_FORBIDDEN')
            cap_no_credentials(item)
    elif type(value) is list:
        for item in value: cap_no_credentials(item)
    elif isinstance(value, str):
        cap_need(len(value) <= 4096 and not re.search(r'-----BEGIN .*PRIVATE KEY-----|^Bearer |://[^\s/:]+:[^\s/@]+@', value), 'CAPACITY_SENSITIVE_OR_UNBOUNDED_INPUT')

def cap_content(payload, scope):
    cap_bag(payload, ('capacityLaunch', 'ownerProfile')); cap_no_credentials(payload)
    c = cap_bag(payload['capacityLaunch'], ('schemaVersion','profile','target','window','process','budgets','minimumFreeBytes','safetyBytes',
         'probeTtlMillis','probeTimeoutMillis','maxProbeWaiters','retryAfterSeconds','producer'))
    cap_need(type(c['schemaVersion']) is int and c['schemaVersion'] == 1 and c['profile'] == 'OWNER_REVIEWED_CAPACITY_EXEC_V1' and
             c['process'] == scope['process'] and hashlib.sha256(cap_json(c['target'])).hexdigest() == scope['targetFingerprint'], 'CAPACITY_CONTENT_SCOPE_MISMATCH')
    target = cap_bag(c['target'], ('host','port','database','role','databaseOid','postmasterStart'))
    cap_need(type(target['port']) is int and 0 < target['port'] <= 65535 and
             all(isinstance(target[k], str) and 0 < len(target[k]) <= 256 for k in ('host','database','role','postmasterStart')) and
             isinstance(target['databaseOid'], str) and re.fullmatch(r'[1-9][0-9]*', target['databaseOid']), 'CAPACITY_TARGET_SHAPE_REQUIRED')
    w = cap_bag(c['window'], ('approved','token','inventoryObservedAt','startsAt','expiresAt','binding'))
    b = cap_bag(w['binding'], ('candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId','restartGeneration','writerCount','physicalVolumes'))
    cap_need(w['approved'] is True and isinstance(w['token'], str) and 0 < len(w['token']) <= 256 and
             all(type(w[k]) is int for k in ('inventoryObservedAt','startsAt','expiresAt')) and 0 < w['inventoryObservedAt'] <= w['startsAt'] <= time.time()*1000 < w['expiresAt'] <= scope['deadlineAt'] and
             b['candidateFingerprint'] == scope['sourceCommit'] and b['targetFingerprint'] == scope['targetFingerprint'] and type(b['writerCount']) is int and b['writerCount'] == 1 and
             b['processInstanceId'] == ':'.join(str(scope['process'][k]) for k in ('linuxBootId','pid','linuxStartTicks')), 'CAPACITY_WINDOW_BINDING_MISMATCH')
    cap_bag(b['physicalVolumes'], CAPACITY_VOLUMES)
    cap_bag(c['budgets'], ('session','upload'))
    for budget in c['budgets'].values():
        cap_bag(budget, ('maxAdmissions','maxInFlight','worstCaseBytes'))
        cap_need(type(budget['maxAdmissions']) is int and type(budget['maxInFlight']) is int and 0 < budget['maxInFlight'] <= budget['maxAdmissions'], 'CAPACITY_FINITE_BUDGET_REQUIRED')
    for value in [c['minimumFreeBytes'], c['safetyBytes'], *[v['worstCaseBytes'] for v in c['budgets'].values()]]:
        cap_bag(value, CAPACITY_VOLUMES)
        cap_need(all(isinstance(v, str) and re.fullmatch(r'(?:0|[1-9][0-9]*)', v) for v in value.values()), 'CAPACITY_BYTE_STRINGS_REQUIRED')
    cap_need(all(type(c[k]) is int and c[k] > 0 for k in ('probeTtlMillis','probeTimeoutMillis','maxProbeWaiters','retryAfterSeconds')) and
             c['probeTimeoutMillis'] <= c['probeTtlMillis'] <= 30000, 'CAPACITY_FINITE_PROBE_REQUIRED')
    producer = cap_bag(c['producer'], ('executable','sha256','args','timeoutMillis','maxOutputBytes','reviewSha256','volumes'))
    profile = cap_bag(payload['ownerProfile'], ('schemaVersion','profile','reviewSha256','target','binding','windowToken','startsAt','expiresAt','maxAgeMillis','namespace','volumes'))
    cap_need(producer['executable'] == '/run/naijue-rewrite/capacity/capacity-live-statfs.mjs' and cap_hash(producer['sha256']) and
             producer['reviewSha256'] == profile['reviewSha256'] == scope['producerReviewSha256'] and
             producer['args'] == ['--profile='+hashlib.sha256(cap_json(profile)).hexdigest()] and
             type(producer['timeoutMillis']) is int and 0 < producer['timeoutMillis'] <= c['probeTimeoutMillis'] and
             type(producer['maxOutputBytes']) is int and 0 < producer['maxOutputBytes'] <= 65536, 'CAPACITY_FIXED_PRODUCER_REQUIRED')
    cap_need(type(profile['schemaVersion']) is int and profile['schemaVersion'] == 1 and profile['profile'] == 'OWNER_FIXED_STATFS_V1' and
             profile['target'] == target and profile['binding'] == b and profile['windowToken'] == w['token'] and profile['startsAt'] == w['startsAt'] and
             profile['expiresAt'] == w['expiresAt'] and profile['maxAgeMillis'] == c['probeTtlMillis'] and isinstance(profile['namespace'], str), 'CAPACITY_OWNER_PROFILE_BINDING_REQUIRED')
    cap_bag(profile['volumes'], CAPACITY_VOLUMES); cap_bag(producer['volumes'], CAPACITY_VOLUMES)
    for k in CAPACITY_VOLUMES:
        m = cap_bag(producer['volumes'][k], ('path','physicalVolume','namespace'))
        actual = cap_bag(profile['volumes'][k], ('path','physicalVolume','namespace','device','filesystemType'))
        cap_need(isinstance(m['path'], str) and m['path'].startswith('/') and os.path.normpath(m['path']) == m['path'] and
                 m['namespace'] == profile['namespace'] and m['physicalVolume'] == b['physicalVolumes'][k] and all(actual[n] == m[n] for n in m) and
                 all(isinstance(actual[n], str) and re.fullmatch(r'(?:0|[1-9][0-9]*)', actual[n]) for n in ('device','filesystemType')), 'CAPACITY_VOLUME_PROFILE_REQUIRED')
    return {'capacity-launch.json': cap_json(c), 'owner-profile.json': cap_json(profile)}

# This program executes as the ORIGINAL SSH login user. It has no sudo/root call.
# The existing root phase independently revalidates every staged byte before use.
CAPACITY_REMOTE = r"""
import os,sys,json,stat,hashlib,time,fcntl
from pathlib import Path
context=CONTEXT_LITERAL
control=Path(context['control']);scope=context['scope'];job=scope['jobId'];root=control/'jobs'/job
sub=root/'capacity-final';action=context['action'];phase=context.get('phase')
def need(v,k):
 if not v:raise ValueError(k)
def canonical(p):
 need(p.is_absolute() and p.resolve()==p and not any(v.is_symlink() for v in [p,*p.parents]),'CANONICAL_CONTROL_PATH_REQUIRED')
 return p
def read(p,limit,uid=None):
 canonical(p);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit and s.st_mode&0o022==0 and (uid is None or s.st_uid==uid),'SAFE_CONTROL_FILE_REQUIRED')
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd);b=os.read(fd,limit+1);z=os.fstat(fd);need((a.st_dev,a.st_ino)==(s.st_dev,s.st_ino) and len(b)==s.st_size and (a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_size,z.st_mtime_ns,z.st_ctime_ns),'CONTROL_FILE_CHANGED');return b
 finally:os.close(fd)
def parse(raw):
 def pairs(rows):
  out={}
  for k,v in rows:need(k not in out,'DUPLICATE_CONTROL_KEY');out[k]=v
  return out
 return json.loads(raw.decode('utf8'),object_pairs_hook=pairs)
def encoded(v):return (json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
def hash(v):return hashlib.sha256(v).hexdigest()
need(os.geteuid()!=0,'ORIGINAL_UNPRIVILEGED_CONTROL_OWNER_REQUIRED')
canonical(control);canonical(root)
need(root.stat().st_uid==os.getuid() and root.stat().st_mode&0o077==0,'ORIGINAL_PRIVATE_CONTROL_JOB_REQUIRED')
receipt=parse(read(control/'results'/(job+'.json'),65536))
need(receipt.get('jobId')==job and receipt.get('taskId')=='T45' and receipt.get('grantId')==scope['grantId'],'ORIGINAL_JOB_RECEIPT_SCOPE_REQUIRED')
if receipt.get('status')!='RUNNING':
 print(json.dumps({'jobId':job,'jobState':receipt.get('status') if receipt.get('status') in ['QUEUED','STARTING','COMPLETED','FAILED','INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY','STOPPED_UNKNOWN_OUTCOME_NO_REPLAY'] else 'UNKNOWN','status':'READ_ORIGINAL_RECEIPT_NO_DELIVERY'}));sys.exit(0)
if not sub.exists():
 need(action=='status','ROOT_CONTROLLER_CAPACITY_CHANNEL_NOT_READY');print(json.dumps({'jobId':job,'jobState':'RUNNING','status':'WAITING_ORIGINAL_CONTROLLER_CHANNEL','receipts':{}}));sys.exit(0)
canonical(sub);st=sub.stat();need(st.st_uid==os.getuid() and st.st_mode&0o077==0,'EXACT_PRIVATE_CONTROL_INBOX_REQUIRED')
expected_keys={
 'gate-ready.json':{'format','scope','provisionalRuntimeIdentity','provisionalProfileIdentity'},
 'content-ready.json':{'format','scope','contentManifestSha256','finalPlanSha256','finalRuntimeIdentity','finalProfileIdentity'},
 'delivery-result.json':{'format','scope','phase','status','requestSha256','safeCode'}
}
receipts={};digests={}
for name,keys in expected_keys.items():
 path=sub/name
 if path.exists():
  raw=read(path,65536,0);value=parse(raw);need(type(value)==dict and set(value)==keys and value.get('scope')==scope,'ROOT_CAPACITY_RECEIPT_SCOPE_REQUIRED')
  need(value['format']=={'gate-ready.json':'CAPACITY_GATE_READY_V1','content-ready.json':'CAPACITY_CONTENT_READY_V1','delivery-result.json':'CAPACITY_DELIVERY_RESULT_V1'}[name],'CAPACITY_RECEIPT_FORMAT_REQUIRED')
  if name in ('gate-ready.json','content-ready.json'):
   for key in (('provisionalRuntimeIdentity','provisionalProfileIdentity') if name=='gate-ready.json' else ('finalRuntimeIdentity','finalProfileIdentity')):
    identity=value[key];base={'device','inode','bytes','mtimeNs','uid','gid','mode'}
    need(type(identity)==dict and base<=set(identity)<=base|{'ctimeNs'} and all(type(v)==int and v>=0 for v in identity.values()),'SAFE_CAPACITY_IDENTITY_ONLY')
  if name=='content-ready.json':need(all(type(value[k])==str and len(value[k])==64 and all(c in '0123456789abcdef' for c in value[k]) for k in ('contentManifestSha256','finalPlanSha256')),'SAFE_CAPACITY_FINGERPRINT_ONLY')
  if name=='delivery-result.json':
   need(value['phase'] in ('CONTENT','APPROVAL') and value['status'] in ('REFUSED','VERIFIED_FOR_FINAL_CLOSED_GUARDS','FAILED','TIMED_OUT','RELEASED') and type(value['safeCode'])==str and 0<len(value['safeCode'])<=100 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in value['safeCode']) and type(value['requestSha256'])==str and len(value['requestSha256'])==64 and all(c in '0123456789abcdef' for c in value['requestSha256']),'SAFE_CAPACITY_RESULT_ONLY')
  receipts[name]=value;digests[name]=hash(raw)
if action=='status':
 print(json.dumps({'jobId':job,'jobState':'RUNNING','status':'ORIGINAL_CAPACITY_CHANNEL_STATUS','receipts':receipts,'receiptSha256':digests}));sys.exit(0)
need(time.time()*1000<scope['deadlineAt'],'CAPACITY_DELIVERY_EXPIRED')
need('gate-ready.json' in receipts,'ORIGINAL_GATE_CHALLENGE_REQUIRED')
packet_raw=sys.stdin.buffer.read(262145);need(len(packet_raw)<=262144,'CAPACITY_PACKET_LIMIT');packet=parse(packet_raw);need(type(packet)==dict and set(packet)=={'phase','scope','files','requestSha256'} and packet['scope']==scope and packet['phase']==phase,'FINITE_CAPACITY_PACKET_REQUIRED')
files=packet['files'];names={'CONTENT':('capacity-launch.json','owner-profile.json','content-manifest.json'),'APPROVAL':('approved-final-delivery.json','approval-manifest.json')}[phase]
need(type(files)==dict and set(files)==set(names) and hash(encoded({'phase':phase,'scope':scope,'files':files}))==packet['requestSha256'],'CAPACITY_PACKET_DIGEST_REQUIRED')
buffers={}
for name in names:
 item=files[name];need(type(item)==dict and set(item)=={'text','bytes','sha256'} and type(item['text'])==str,'CAPACITY_FILE_DESCRIPTOR_REQUIRED')
 raw=item['text'].encode('utf8');need(0<len(raw)<=65536 and len(raw)==item['bytes'] and hash(raw)==item['sha256'],'CAPACITY_STAGED_BYTES_MISMATCH');buffers[name]=raw
need(sum(map(len,buffers.values()))<=196608,'CAPACITY_BATCH_LIMIT')
if phase=='APPROVAL':
 need('content-ready.json' in receipts and context.get('contentReadySha256')==digests['content-ready.json'],'ROOT_CONTENT_READY_MUST_PRECEDE_APPROVAL')
 approval=parse(buffers['approved-final-delivery.json']);need(approval.get('contentReadySha256')==digests['content-ready.json'] and approval.get('finalPlanSha256')==receipts['content-ready.json']['finalPlanSha256'],'CAPACITY_APPROVAL_FINAL_PLAN_MISMATCH')
# One original account upload at a time, no execution.lock or second dispatcher.
lockpath=sub/'client-upload.lock';fd=os.open(lockpath,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
try:
 z=os.fstat(fd);need(stat.S_ISREG(z.st_mode) and z.st_nlink==1 and z.st_uid==os.getuid() and z.st_mode&0o077==0,'CAPACITY_UPLOAD_LOCK_IDENTITY')
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 marker=sub/(phase.lower()+'.complete');present=[n for n in names if os.path.lexists(sub/n)]
 if present or os.path.lexists(marker):
  if len(present)==len(names) and os.path.lexists(marker) and all(read(sub/n,65536,os.getuid())==buffers[n] for n in names) and read(marker,64,os.getuid())==packet['requestSha256'].encode():
   print(json.dumps({'jobId':job,'phase':phase,'status':'ALREADY_STAGED_READ_ORIGINAL_RECEIPT','requestSha256':packet['requestSha256']}));sys.exit(0)
  print(json.dumps({'jobId':job,'phase':phase,'status':'PARTIAL_OR_DIFFERENT_SUBMISSION_UNKNOWN_NO_REPLAY'}));sys.exit(0)
 need(time.time()*1000<scope['deadlineAt'],'CAPACITY_DELIVERY_EXPIRED')
 # Fixed complete marker is written last; it commits transport completeness only, never authorization.
 for name in names:
  target=sub/name;out=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  try:need(os.write(out,buffers[name])==len(buffers[name]),'CAPACITY_SHORT_STAGING_WRITE');os.fsync(out)
  finally:os.close(out)
 out=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:need(os.write(out,packet['requestSha256'].encode())==64,'CAPACITY_SHORT_COMPLETE_WRITE');os.fsync(out)
 finally:os.close(out)
 directory=os.open(sub,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(directory)
 finally:os.close(directory)
 print(json.dumps({'jobId':job,'phase':phase,'status':'STAGED_FOR_ORIGINAL_ROOT_CONTROLLER_NOT_AUTHORIZED_OR_RELEASED','requestSha256':packet['requestSha256']}))
finally:os.close(fd)
"""

def capacity_channel(cfg, scope, action, phase=None, packet=None, content_ready_sha=None):
    context = {'control': cfg['control'], 'scope': scope, 'action': action, 'phase': phase, 'contentReadySha256': content_ready_sha}
    script = CAPACITY_REMOTE.replace('CONTEXT_LITERAL', repr(context), 1)
    raw = remote(cfg, '/usr/bin/python3 -c ' + shlex.quote(script), cap_json(packet) if packet else None)
    cap_need(len(raw) <= 220000, 'CAPACITY_SAFE_REMOTE_RECEIPT_LIMIT')
    result = cap_json_read(raw)
    cap_need(type(result) is dict and result.get('jobId') == scope['jobId'], 'CAPACITY_ORIGINAL_RECEIPT_REQUIRED')
    return result

def capacity_binding(cfg, args, allow_expired=False):
    cap_need(args.task == 'T45' and cfg.get('installed') != 'REVOKED', 'CAPACITY_ORIGINAL_T45_GRANT_REQUIRED')
    job_id = ident(args.job_id)
    history = json.loads(HISTORY.read_text())
    cap_need(job_id in history and history[job_id].get('grantId') == cfg['grantId'] and
             history[job_id].get('request', {}).get('taskId') == 'T45', 'CAPACITY_EXISTING_SUBMITTED_JOB_ONLY')
    binding = cap_json_read(cap_local_file(args.binding, job_id))
    cap_bag(binding, ('format', 'scope'))
    cap_need(binding['format'] == 'CAPACITY_FINAL_CLIENT_BINDING_V1', 'CAPACITY_CLIENT_BINDING_FORMAT_REQUIRED')
    return cap_scope(binding['scope'], cfg, job_id, allow_expired)

def capacity_packet(phase, scope, files):
    cap_need(set(files) == set(CAPACITY_PHASE_FILES[phase]), 'CAPACITY_FIXED_FILE_ALLOWLIST_REQUIRED')
    records = {}
    for name, raw in files.items():
        cap_need(isinstance(raw, bytes) and 0 < len(raw) <= 65536, 'CAPACITY_FILE_LIMIT')
        records[name] = {'text': raw.decode('utf8'), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    cap_need(sum(x['bytes'] for x in records.values()) <= 196608, 'CAPACITY_BATCH_LIMIT')
    body = {'phase': phase, 'scope': scope, 'files': records}
    return {**body, 'requestSha256': hashlib.sha256(cap_json(body)).hexdigest()}

def capacity_final(cfg, args):
    scope = capacity_binding(cfg, args, allow_expired=args.action == 'capacity-final-status')
    if args.action == 'capacity-final-status':
        value = capacity_channel(cfg, scope, 'status'); print(json.dumps(value, ensure_ascii=False)); return
    # Status first: terminal/unknown/partial outcomes never trigger another submission.
    observed = capacity_channel(cfg, scope, 'status')
    if observed.get('jobState') != 'RUNNING' or observed.get('status') != 'ORIGINAL_CAPACITY_CHANNEL_STATUS':
        print(json.dumps(observed, ensure_ascii=False)); return
    receipts = observed.get('receipts', {})
    gate = receipts.get('gate-ready.json')
    cap_need(type(gate) is dict and gate.get('scope') == scope, 'CAPACITY_LIVE_GATE_BINDING_REQUIRED')
    payload = cap_json_read(cap_local_file(args.input, scope['jobId']))
    if args.phase == 'CONTENT':
        files = cap_content(payload, scope)
        manifest = {'format': 'CAPACITY_CONTENT_MANIFEST_V1', 'scope': scope,
                    'files': {n:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()}}
        files['content-manifest.json'] = cap_json(manifest)
        ready_sha = None
    else:
        ready = receipts.get('content-ready.json'); ready_sha = observed.get('receiptSha256', {}).get('content-ready.json')
        cap_need(type(ready) is dict and cap_hash(ready_sha), 'CAPACITY_REAL_CONTENT_READY_REQUIRED')
        cap_bag(payload, ('decisionReference',))
        decision_ref = cap_bag(payload['decisionReference'], ('sourcePath','sha256'))
        cap_need(cap_hash(decision_ref['sha256']) and Path(decision_ref['sourcePath']).name == 'C-CAPACITY-FINAL-APPROVAL.json', 'ORIGINAL_C_APPROVAL_REFERENCE_REQUIRED')
        raw = cap_local_file(decision_ref['sourcePath'], scope['jobId'], controller_decision=True)
        cap_need(hashlib.sha256(raw).hexdigest() == decision_ref['sha256'], 'C_APPROVAL_SOURCE_HASH_CHANGED')
        decision = cap_json_read(raw)
        cap_need(raw == cap_json(decision), 'C_APPROVAL_CANONICAL_JSON_REQUIRED')
        cap_bag(decision, ('format','scope','contentReadySha256','finalPlanSha256','finalRuntimeIdentity','finalProfileIdentity','authority'))
        cap_need(decision['format'] == 'C_APPROVED_CAPACITY_FINAL_PLAN_V1' and decision['scope'] == scope and decision['authority'] == scope['authority'] and
                 decision['contentReadySha256'] == ready_sha and decision['finalPlanSha256'] == ready['finalPlanSha256'] and
                 decision['finalRuntimeIdentity'] == ready['finalRuntimeIdentity'] and decision['finalProfileIdentity'] == ready['finalProfileIdentity'],
                 'C_APPROVAL_MUST_BIND_ACTUAL_FINAL_PLAN_AND_IDENTITIES')
        # Preserve an existing controller decision; never synthesize approved=true or sign/issue authority.
        delivery = {'format':'CAPACITY_APPROVED_DELIVERY_V1','scope':scope,'decisionReference':decision_ref,'decision':decision,
                    'contentReadySha256':ready_sha,'finalPlanSha256':decision['finalPlanSha256']}
        files = {'approved-final-delivery.json': cap_json(delivery)}
        files['approval-manifest.json'] = cap_json({'format':'CAPACITY_APPROVAL_MANIFEST_V1','scope':scope,'decisionReference':decision_ref,
              'files':{n:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()}})
    packet = capacity_packet(args.phase, scope, files)
    cap_need(len(cap_json(packet)) <= 262144, 'CAPACITY_TRANSPORT_PACKET_LIMIT')
    value = capacity_channel(cfg, scope, 'deliver', args.phase, packet, ready_sha)
    print(json.dumps(value, ensure_ascii=False))


# Ordinary binary staging is separate from run/capacity. The authority is issued
# externally and also installed root-owned beside the existing dispatcher.
ARTIFACT_KEYS = {'format','decision','taskId','grantId','artifactKey','sourceSetSha256',
                 'archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}

PRIVATE_STANDARD_DATA_MANIFEST = '1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9'
PRIVATE_STANDARD_DATA_ARCHIVE = 'fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e'
PRIVATE_STANDARD_DATA_BYTES = 93508914
PRIVATE_STANDARD_DATA_PARTS = ((0, 2097152, '3cbb18ea4b45b20a3672e1826498699b10c5baad2328286a340abd49404ac4c8'), (2097152, 2097152, 'dedc7cd99d5a88a10cb8f47bcaa6ef489ac7708fd6c650da92d7509cd2cd6df8'), (4194304, 2097152, '34c01309bb3158eef739f0ca692ca9767c31708389676cf1c0cf219208c9f5d7'), (6291456, 2097152, '5c4cec8b8211069cbeea5da6f1cc459d3e8f0fb09923f8a68da9069b3b6c1743'), (8388608, 2097152, '6a3b5efbba17ea28ca2e2b64d0ded045514e10adbfe077f437a1518ed6e376b4'), (10485760, 2097152, 'c0230734913ce61310b622021ccfd5df04ac10a9b584a9e27acb52ff435abe0d'), (12582912, 2097152, 'f747ffc6e6e72300d9cd23c5e41849a14cd6f4477f312ff1c27258a21d250dc0'), (14680064, 2097152, 'a7670baeae8b2031fa95f6ab84f9a848ade0497cbb53b7994319f25e7ed59bf8'), (16777216, 2097152, '487695e643075da984e445463ea4adb769723cbe2af85d5d1576daabd81daaab'), (18874368, 2097152, 'cb95a60a41e946b982e25a33cc37b448c1849b669e5a1da6acb9c1b55477ddcc'), (20971520, 2097152, '2d9c5375d6c333306d05c7a32998960346e84d5a6904b66081acfe5bff2404e6'), (23068672, 2097152, '29d79076fdf6923309ae3faec105ec131ddfc776ca7fb3b5e433cd458f8975fd'), (25165824, 2097152, '44333fc0432208ff22d958b271c75e88ca85bd98c23468effd43d5fab95c12ad'), (27262976, 2097152, 'e0f9ddf6a5dd92d2cace01d603d3074c40f2ef9eb278c3c1c51fe2a83f9e3f2b'), (29360128, 2097152, '8ba81ec98297087858fe80a13abbcea36f25662bc0089a63fb61bde26f20dff2'), (31457280, 2097152, '5dc60b2dbc1c7e3152ddd8ff928a7881a5a4a87869b0cacb06cf2bbb61e450e9'), (33554432, 2097152, '458e30fd0b0982bd9f4f2df0e4d93132c93be4c17dd24e08d56d39322ca4b7e5'), (35651584, 2097152, '7ec2490a261da4857958264e8385777a07d156c64bdcad3bca33c5a669ccc29c'), (37748736, 2097152, '95cfc322b359baefa4db0f1371b353c8626ccaf7c9d7f55fd426d3d19ba3e707'), (39845888, 2097152, 'a4c1dce77a86b840df51df761bde51c33af50528b240a9b711d53509e0a91ed4'), (41943040, 2097152, 'e3ccb9763ec11b97d7465213a55a20cfcc3daf3948e2f0049cb2931512bfac35'), (44040192, 2097152, 'c1518fcfcc87123c910dedeacc3c1c5cf235f80d41488a5bb097943acc46358f'), (46137344, 2097152, '8273847966b7b7df6f15d37292c3f122ecaf674dc2e53826467531464b78ab0c'), (48234496, 2097152, '41b49dab28fcdb0177e55b997e4af45875e8e49f829986e93ee6ad4ea4edb7f9'), (50331648, 2097152, '6b588357e70efb55b0a26b003981a35a2a3c708f626dad1fb6609d7cdda0ec84'), (52428800, 2097152, 'a0dd962323d8fb663840df561b2713aee0b91080613c0c5c37f17ecb5887c05a'), (54525952, 2097152, '4de4d84e0b7057865a5ae8b3de0801809a279c8e24f71a39a561d085fd89b4eb'), (56623104, 2097152, '9fbcb36f69d28064673ef8b6b6a4ac9afa19b3e00c782629f43db736d3a237d2'), (58720256, 2097152, 'a2f19600a6ac4aa8b18d158b75decdb5a665e49aeb94d52e6626e70b3eab6320'), (60817408, 2097152, '01f463adaed8d7d23f09dd5beb4b1a43a72b2f4e32b19bfb9a058ae303631ead'), (62914560, 2097152, '8bda46e262d5f497e071708425542ba6da05c7a3b540d9d353c577c1501fb39b'), (65011712, 2097152, '954a9935b358d27c0965d382014df73c8e2c82b8e535c6fe21dfcafcbdab0b6e'), (67108864, 2097152, '279b79a395a9efda5a09a80e5b721c9f17694a3db0bf44123dce5603c9930c66'), (69206016, 2097152, 'a796aa460040cd93875abc769e7c2577033e27f3c32d5c5690d45a99e97ef67d'), (71303168, 2097152, 'a9ba7278665e6d0e77f8ddc81cfc2a0fb5a7a18a00536a96238662db45780cce'), (73400320, 2097152, '63309c387337024afd380e345b8aacbd781f2141a87ac3f9295247bb23a5ee4e'), (75497472, 2097152, '532ae8d1b4990b3b3d661fb6c36a48c455572dbbe09d47bd8e1050b03f113c6b'), (77594624, 2097152, '726e15228dea7ddfbbf5e90f2562d5b1c3e52468f9d43c8db166baddcd8c2632'), (79691776, 2097152, '07bab9e526f245e61fe96386beb1690116cd730593ac69ce33064433a0ae8100'), (81788928, 2097152, '472364c8c986190a11a39b93c795ee807c8d7c9dfdb5c1216a2cb91f2708c807'), (83886080, 2097152, '2d77f1ff9653273492dc15a1d6172fdce26462f7c4e2488dc5d1f6bade5f3ea6'), (85983232, 2097152, '039f3637a363307c508047eae2b032d9d518fef5937ae5ba345758117e9d13b7'), (88080384, 2097152, 'd691e601baf57a37a01d7764443f31118749720b154a10c54103fcdaf87e43f1'), (90177536, 2097152, '81a47929f84d70485181becbdf409931098265787935a11a10c08df6616f023d'), (92274688, 1234226, 'a0c17af2a4a03ae75f471c5c5f5deece1e65faa744e8fad959d96dd41ab4eb43'))
PRIVATE_STANDARD_DATA_KINDS = ('PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT','PRIVATE_STANDARD_IMPORT_DATA')

R3_R2_PRIVATE_MANIFEST = 'f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb'
R3_R2_PRIVATE_FINAL = ('t45-r3-r2-data-full-20261112-01', 80853258, '8bb909c7986a35128b207496fa8a0c1451f1c097954754c3ddc9629e18696c4c')
R3_R2_PRIVATE_PARTS = {
    't45-r3-r2-data-p01-20261112-01': (1, 0, 2097152, '6d4db8ae5fb829c92126c3d01ee53ab51147d86c89cc3ee6cc9b2b1583f6f230'),
    't45-r3-r2-data-p02-20261112-01': (2, 2097152, 2097152, '8467e39f2bb809aa7c7a4b7eca3eadac793601503881a694b8bd0c75c925974f'),
    't45-r3-r2-data-p03-20261112-01': (3, 4194304, 2097152, '17c64597f8df978a6467c745a35b21e8a74959022aa6f6bf2312c2e94f1c5623'),
    't45-r3-r2-data-p04-20261112-01': (4, 6291456, 2097152, '33af7aafddebc31382b297d1abe1ad05671537034457d76d150e3f330f557827'),
    't45-r3-r2-data-p05-20261112-01': (5, 8388608, 2097152, 'df8458a2167d78b0dfaad07e18c6ffb7d3d61094fe40b6aea43acd2a99074536'),
    't45-r3-r2-data-p06-20261112-01': (6, 10485760, 2097152, '158ac83e7da14caec2d12d26319f36b406da1f085d597a2dcc139fda7bbbef9f'),
    't45-r3-r2-data-p07-20261112-01': (7, 12582912, 2097152, '62832dbb132a00f7a9e9da9617f867907e32467a34a62403fb3e7d3aa6932ff7'),
    't45-r3-r2-data-p08-20261112-01': (8, 14680064, 2097152, 'a7c8acfc33826ef8c081c703b529bce749312d4d9f37293e6f26ec951f3f2558'),
    't45-r3-r2-data-p09-20261112-01': (9, 16777216, 2097152, 'fb1c0cfba3f34ecb62dcc2ff9fa244604b8390e7281e5d1c28cff5e7c1900fce'),
    't45-r3-r2-data-p10-20261112-01': (10, 18874368, 2097152, '1f3d8bd7f91a39dac26f265024e6cdc324a506f05a74f768ead84e4be65bf36c'),
    't45-r3-r2-data-p11-20261112-01': (11, 20971520, 2097152, '76d980d61f31fcd99ef882fd1788498e44fb623bcf638d472f1aa311810e2304'),
    't45-r3-r2-data-p12-20261112-01': (12, 23068672, 2097152, 'a690d584969a0d5277dec097cc7c172a0c911c107528abadc1a34c807d6e5dca'),
    't45-r3-r2-data-p13-20261112-01': (13, 25165824, 2097152, '7091aeeba7e91ae750eefe56ed3bc93c0d5c8fa058c792886759490c1d74e60e'),
    't45-r3-r2-data-p14-20261112-01': (14, 27262976, 2097152, '12116777d70dcdae120b3962fc1ddcd196d090740478641ede3540306cb9b962'),
    't45-r3-r2-data-p15-20261112-01': (15, 29360128, 2097152, 'e747737fb48f35f7e612ec60d82e85db80d1fdd3d2d6294143cd270f5cfe9cf7'),
    't45-r3-r2-data-p16-20261112-01': (16, 31457280, 2097152, '338c87e417fe78657627539f85e7c657768c42b817309f17170229b32dab61dd'),
    't45-r3-r2-data-p17-20261112-01': (17, 33554432, 2097152, '88a16e430894876d5c926a4e0338821741772e08bd4af3d42a1365a15afceed4'),
    't45-r3-r2-data-p18-20261112-01': (18, 35651584, 2097152, '0adc730f9c947fb9ce868519e86333b553714a3760de0467ebf34333c67ef23f'),
    't45-r3-r2-data-p19-20261112-01': (19, 37748736, 2097152, '3948c8c3b93664730f470274b7ed4f301b4175b31ba6ec9be3fe2df18f43ef32'),
    't45-r3-r2-data-p20-20261112-01': (20, 39845888, 2097152, '4dd6c67c68e8c775e820ae7240cca0c2a42f0da7f7fd2780043196f446918155'),
    't45-r3-r2-data-p21-20261112-01': (21, 41943040, 2097152, 'd75b1f0e37e18d132bfb97586e4f10b9d6b7b81cafeea0521ed52ccee6559210'),
    't45-r3-r2-data-p22-20261112-01': (22, 44040192, 2097152, 'adc87dd61c5f709de3fa99763bf5d7067a2c46180fac4cf60e89e297f9837354'),
    't45-r3-r2-data-p23-20261112-01': (23, 46137344, 2097152, 'dd9b2d84ef016cf183c35610e6b03aa1762aea3fe38c80702d932de665bb3dd1'),
    't45-r3-r2-data-p24-20261112-01': (24, 48234496, 2097152, '529c4a21cfc8a4296ef4b4aeb1919120c5cfe3da0134571f771a8b73c4aeb58f'),
    't45-r3-r2-data-p25-20261112-01': (25, 50331648, 2097152, 'd9a48e644121eecab30a66b864be8682280dac4e933805492baf20598566e6e8'),
    't45-r3-r2-data-p26-20261112-01': (26, 52428800, 2097152, 'a480fbae452f6528bc4e690d07c50389548744d43f1d8ca16bd21fa1dbcd65e1'),
    't45-r3-r2-data-p27-20261112-01': (27, 54525952, 2097152, '4bb56c41588bca04a34ff20e32bf9ec0dd6608ad44e4a0f66e8da7fb85400d3a'),
    't45-r3-r2-data-p28-20261112-01': (28, 56623104, 2097152, '3a554f4c7a11b967b31429bc44293d60ddc9c3794e968b47783e203d4a360e1a'),
    't45-r3-r2-data-p29-20261112-01': (29, 58720256, 2097152, '105cd90f0af99b37b898741c27e82d7ca45c6c1b7d92f1ca48c0a807604d2531'),
    't45-r3-r2-data-p30-20261112-01': (30, 60817408, 2097152, 'cc480b8d13c199225a01a3a350052bacc0f8807e4215db30d3e26d2deb9b79dd'),
    't45-r3-r2-data-p31-20261112-01': (31, 62914560, 2097152, 'a0665e657116972bce084695e187b0acad8bc2ea20c831a77576dd7ecc90c226'),
    't45-r3-r2-data-p32-20261112-01': (32, 65011712, 2097152, 'f33ce7a5fc3ad16bbbf1f4ece538b0f213d9a2f52a08edec9dcb0d93b21aa835'),
    't45-r3-r2-data-p33-20261112-01': (33, 67108864, 2097152, '6369a8247fd53ce472c923fe830f7b8604925a7e32e7ca01961058a0bdf09ca2'),
    't45-r3-r2-data-p34-20261112-01': (34, 69206016, 2097152, '5ca1b43297d0d8b13d422d5271752ebaa69575dd579f8e5bf2fb03e627227456'),
    't45-r3-r2-data-p35-20261112-01': (35, 71303168, 2097152, '101cce711f7d9618967649b47e7761c9e8511a39bb93fc70391fa5d01bcb0a83'),
    't45-r3-r2-data-p36-20261112-01': (36, 73400320, 2097152, '57b12f891f4f84a36536b7e66ecdccaa43e5349368dd36c09751dcb67e0adc31'),
    't45-r3-r2-data-p37-20261112-01': (37, 75497472, 2097152, '36dc5d0ea079054fb2c3064dee77897c45a908cbf567e327cb56065deeb60571'),
    't45-r3-r2-data-p38-20261112-01': (38, 77594624, 2097152, '532907396e54ad496a8e22654bb48705dfa9ce74855f225248e59243affb1d5b'),
    't45-r3-r2-data-p39-20261112-01': (39, 79691776, 1161482, '8fc47d84f43e56b2e41ee0f077241a530a8a42d0d4ae2a45e6e80aa52690d9f4'),
    't45-r3-r2-side01-p01-20261112-01': (40, 0, 1804, 'caec2056f53910f8e574d16e151974681da437bbf36773365bee52f77467d151'),
    't45-r3-r2-side02-p01-20261112-01': (41, 0, 2097152, 'd91ccaef8e4e5c4670de04ce59eb78c1e695d0715639fe33b33ed43e26097465'),
    't45-r3-r2-side02-p02-20261112-01': (42, 2097152, 2097152, '61409aa4f9e1abbf471f0215761f0c43a777e694c78ccfe5b95b585f2e69a8bb'),
    't45-r3-r2-side02-p03-20261112-01': (43, 4194304, 2097152, '05115af6d5ccef16c61192135887e06693f0934a1e186c41493c6d1f403aa0b5'),
    't45-r3-r2-side02-p04-20261112-01': (44, 6291456, 2097152, 'a1b577b0907bc536e0052b50562bcc12d3af3c261e35423e80f26f5d51829967'),
    't45-r3-r2-side02-p05-20261112-01': (45, 8388608, 2097152, '6f618aaec20cfc9cacfb25fcd2b11c6b45a9238d2ecc8aaeab620ada049e39bf'),
    't45-r3-r2-side02-p06-20261112-01': (46, 10485760, 2097152, '7b9c03173bc9e5183b5e1d92cfc7d4e135d7a2be24698b9f135d98ee485032b5'),
    't45-r3-r2-side02-p07-20261112-01': (47, 12582912, 2097152, 'c62f53db147b2d89fd7afaed80533f5371ae0fadc3c3392f4e5534bbb2f2721e'),
    't45-r3-r2-side02-p08-20261112-01': (48, 14680064, 2097152, '0654a6d477c811ef66ea4255b1a680681d5aaf2135a887c81ce7f804b49cb969'),
    't45-r3-r2-side02-p09-20261112-01': (49, 16777216, 2097152, '4d1ef7fb9291a102b79bc5cd0da61c5335b47c08631469820d01a9eb15ef42e1'),
    't45-r3-r2-side02-p10-20261112-01': (50, 18874368, 2097152, '18f13abb10173146c93c04206a7308fdb6b9eba9bbb89215c9d44958ef439e92'),
    't45-r3-r2-side02-p11-20261112-01': (51, 20971520, 2097152, '1161e81f43576a56fa951c9e350612eaba94a11464948ba7f504b3c3340194bb'),
    't45-r3-r2-side02-p12-20261112-01': (52, 23068672, 2097152, '9188344fdd9e96c0a1fba8b1a075ff7f51872948a2df825be42fc37a9a9afbb5'),
    't45-r3-r2-side02-p13-20261112-01': (53, 25165824, 2097152, 'c77402b464db8b6e647a5e0aab3d82d91367989c1e6ac0d0d8bc0a3507cc4c9f'),
    't45-r3-r2-side02-p14-20261112-01': (54, 27262976, 2097152, '7549476e958cd632b73fe723cedb1cb77864fba1d92328c7f35c604aee3affc0'),
    't45-r3-r2-side02-p15-20261112-01': (55, 29360128, 2097152, 'c1661cf447f9e398f3aaac7e329d6c61fe88bbab4759f986556894b594f4a5f8'),
    't45-r3-r2-side02-p16-20261112-01': (56, 31457280, 2097152, '16e6dac5cb34b5bb6e4ee5cde31b04284015144323fe7b6afca55d7d99a880e3'),
    't45-r3-r2-side02-p17-20261112-01': (57, 33554432, 2097152, '5fb8a347803823e3a7ccbfc852b3beb33d96042f2cb7a87faed6bf56643481ea'),
    't45-r3-r2-side02-p18-20261112-01': (58, 35651584, 2097152, '1f03a0d0917057c5650b74715d3ea46ca619847a547eae76a80e528f450aaac0'),
    't45-r3-r2-side02-p19-20261112-01': (59, 37748736, 2097152, '4ddc93f77fe9322ad9ba4b5bae91d9fe830a71f93b8259f393bee3a5c248e505'),
    't45-r3-r2-side02-p20-20261112-01': (60, 39845888, 2097152, '7e64fa341b2bae9e4e65f4b7af11852ffb34b6b82472b480e89fe9db5aa3ff36'),
    't45-r3-r2-side02-p21-20261112-01': (61, 41943040, 2097152, '85a97f442ab2d11846bf39d22ea174feac5cfddaea37e662053d05f81ced1475'),
    't45-r3-r2-side02-p22-20261112-01': (62, 44040192, 2097152, '5ae4b7d8e8a1b225fa4101e02f5f87bba04a5ad317b9c8721a55629318510e49'),
    't45-r3-r2-side02-p23-20261112-01': (63, 46137344, 1072164, '1375eb56effbc4cca89a3215f58cf75f44183675c5efd7882aa807435ef276b5'),
    't45-r3-r2-side03-p01-20261112-01': (64, 0, 5763, '29c3d14cff036804e4a6ad1d703b4b0b876909d8c84d3aecfa37d2c971d6a7f1'),
    't45-r3-r2-side04-p01-20261112-01': (65, 0, 867, '4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40'),
    't45-r3-r2-side05-p01-20261112-01': (66, 0, 33226, '4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'),
    't45-r3-r2-side06-p01-20261112-01': (67, 0, 2499, '98c88621471a17d605c1556b5c434f2d52179bfb97c911eabfb3c91039d0c8ad'),
    't45-r3-r2-side07-p01-20261112-01': (68, 0, 3927, 'c7747c37229389dea6ef2fddb1e6bad65337085bb82ebc7d864c31639c6354af'),
    't45-r3-r2-side09-p01-20261112-01': (69, 0, 2484, '6e2156257aa3373323bbd3e16335703922839e9570f9cb33be405e80b0d62a2a'),
    't45-r3-r2-side10-p01-20261112-01': (70, 0, 681674, 'dd8b00e6c3780f50e6b078649c598b98058c7a9970b2dbd6d2261a72013d729e'),
    't45-r3-r2-side11-p01-20261112-01': (71, 0, 2097152, '5534d78421245eb22a9129987e5fcc5f5bb7534eb188b325db47b8d51d964ebf'),
    't45-r3-r2-side11-p02-20261112-01': (72, 2097152, 2097152, 'eb90461e15fe0136d54876217476ff934bdaa529595cd5b84fbc187c05b258a8'),
    't45-r3-r2-side11-p03-20261112-01': (73, 4194304, 507423, '58859764685cde14ccb3ac5d83a6c765102d15d4cb4717e4d23e285acc1b65cc'),
}

def r3_r2_private_authority(a, control, grant):
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256',
           'archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
    fragment=a.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
    if fragment:keys|={'fragmentIndex','fragmentOffset'}
    key=a.get('artifactKey')
    if (set(a)!=keys or type(key) is not str or
        a['format']!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' or
        a['decision']!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' or
        a['taskId']!='T45' or a['grantId']!=grant or grant!='b16447fbc81f4d64' or
        control!='/home/naijue/erp-release-20261006-01-control/grant-'+grant or
        a['manifestSha256']!=R3_R2_PRIVATE_MANIFEST or
        a['targetDirectory']!=control+'/private-standard-import-data/'+key or
        type(a['archiveBytes']) is not int or type(a['startsAt']) is not int or
        type(a['expiresAt']) is not int or not 0<a['expiresAt']-a['startsAt']<=600000 or
        type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('R3_R2_EXACT_PRIVATE_SCOPE_REQUIRED')
    if fragment:
        if (type(a['fragmentIndex']) is not int or type(a['fragmentOffset']) is not int or
            R3_R2_PRIVATE_PARTS.get(key)!=(a['fragmentIndex'],a['fragmentOffset'],a['archiveBytes'],a['archiveSha256'])):
            raise ValueError('R3_R2_EXACT_PRIVATE_FRAGMENT_REQUIRED')
    elif a['kind']!='PRIVATE_STANDARD_IMPORT_DATA' or (key,a['archiveBytes'],a['archiveSha256'])!=R3_R2_PRIVATE_FINAL:
        raise ValueError('R3_R2_EXACT_PRIVATE_FINAL_REQUIRED')

FINAL33_MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
FINAL33_PARTS = {'t45-r3-final33-standard-p001-20261116-01': (1, 0, 2097152, '7c9ebc3bf73242edd8e710ac4237c3dd04d1fb9f187c158f2f285a53b90f0228'), 't45-r3-final33-standard-p002-20261116-01': (2, 2097152, 2097152, 'ab8a9456eae851c8aa8a79b60490871ff115ae0c05250be42c3f53a5c374ee3c'), 't45-r3-final33-standard-p003-20261116-01': (3, 4194304, 2097152, '014e9889c64ed1eca2dde93fd6d1079278c836517e17649ebaf6e661a13c2543'), 't45-r3-final33-standard-p004-20261116-01': (4, 6291456, 2097152, '25a8964fae8f1485bead8c1f3747e871438f27271066c889bffe8bccb45e485f'), 't45-r3-final33-standard-p005-20261116-01': (5, 8388608, 2097152, 'bc0a02f502999735df3a78faf36bcaf57a6f95745ca7f7e497a4537489891afa'), 't45-r3-final33-standard-p006-20261116-01': (6, 10485760, 2097152, 'edd7e33afe032dfc787606f8d33510a3205fa14db7002c188e9e54d12f1f7dbc'), 't45-r3-final33-standard-p007-20261116-01': (7, 12582912, 2097152, 'be1140f9d9da90df9aee0530d2cf3acd3d48d177444696c4e602835ba9c76db3'), 't45-r3-final33-standard-p008-20261116-01': (8, 14680064, 2097152, 'f139abf77a3e4279613e44c5a80a43b158d6590a45a4f7e89c8a957a2af2167d'), 't45-r3-final33-standard-p009-20261116-01': (9, 16777216, 2097152, '8661b270f4ac1da7c8b3f94e4a48faf3b4bd35a1c180e38e2de929e327fe24c6'), 't45-r3-final33-standard-p010-20261116-01': (10, 18874368, 2097152, '798c4f342677dd36c2a1a12e2f6693d6087492e29bac06edc4e57deeab8cdb2f'), 't45-r3-final33-standard-p011-20261116-01': (11, 20971520, 2097152, '929b04cd5f43b6c5f3de31899451992d7d4b27b6acfdb5a564fdadade7c9ea6f'), 't45-r3-final33-standard-p012-20261116-01': (12, 23068672, 2097152, 'ee33ebe60dbfbeb31648d5c9724afedf9190321076d1c8712a4084191510b9a5'), 't45-r3-final33-standard-p013-20261116-01': (13, 25165824, 2097152, 'e1c0ee49ff7e5ab8e761d937a6377e331a7bc88b54664f7363c93a3da25cf53c'), 't45-r3-final33-standard-p014-20261116-01': (14, 27262976, 2097152, 'e7d2d206a51314772984b560c2866b409d451069af61945bd3e991ac36c1fb4b'), 't45-r3-final33-standard-p015-20261116-01': (15, 29360128, 2097152, '1d7414174ad6fec97f145809f89eb7420b10c8711b50fb471776d99b8d4ea9c3'), 't45-r3-final33-standard-p016-20261116-01': (16, 31457280, 2097152, 'ba9a3d498215f8dde21b3388a4765ff5acb17c9f11258c188abceda88aed9293'), 't45-r3-final33-standard-p017-20261116-01': (17, 33554432, 2097152, '5df1f4a5c48a9baed6ee2cd640253725fa7b1dfd7d4792848cbd8a15116d0564'), 't45-r3-final33-standard-p018-20261116-01': (18, 35651584, 2097152, '1f0f13fba6c7ae5283937a13705194eb6580002e5b35b27468da03f5fe2b17f4'), 't45-r3-final33-standard-p019-20261116-01': (19, 37748736, 2097152, '15ce02f4250e1e8311ef6eed29ce8e3571b0db2af2af095b3792d466022fa57a'), 't45-r3-final33-standard-p020-20261116-01': (20, 39845888, 2097152, 'e6ff31159999548c67aa34171651a57ec5d53da4ffb02eef906d856d06df68dc'), 't45-r3-final33-standard-p021-20261116-01': (21, 41943040, 2097152, '09315443bea97d16f71fa8e4831702a2e5947f6d69cceff02c51b808f3bc8979'), 't45-r3-final33-standard-p022-20261116-01': (22, 44040192, 2097152, 'fea9906a7bb3e6db8c9bef3cb221aef3adc1af35c272f8ffe65d8d9e497a437c'), 't45-r3-final33-standard-p023-20261116-01': (23, 46137344, 2097152, '0b20336f6e5136540daeabd42d6d8041a52a07cf248384c948b2493fa65d2cc6'), 't45-r3-final33-standard-p024-20261116-01': (24, 48234496, 2097152, '8d5e78df7d2c986c754c1a9ad2af4a5af0ec48c45f078b3a14e232163bfaede1'), 't45-r3-final33-standard-p025-20261116-01': (25, 50331648, 2097152, '916c408d9079aa420ca99ec2e9d631cc482520cc51f66b4966770a3a0125eb6d'), 't45-r3-final33-standard-p026-20261116-01': (26, 52428800, 2097152, '04edf3f67cc1061a514c845c55eb87cf53fca010924c9dfc38fc102646777ebe'), 't45-r3-final33-standard-p027-20261116-01': (27, 54525952, 2097152, 'f2017c3c0b268821948b3a9f648c0778728feecc979dae925b7ed94b512408f8'), 't45-r3-final33-standard-p028-20261116-01': (28, 56623104, 2097152, 'e6b5b6163eb5afbb99e63d687a7fd5e59718ee50e899e92b0a10c4e734b1c753'), 't45-r3-final33-standard-p029-20261116-01': (29, 58720256, 2097152, 'ca921595a196192d6b7ee0dec55b3e12d1da4a19682f9850e1913ff9ce9c7018'), 't45-r3-final33-standard-p030-20261116-01': (30, 60817408, 2097152, '64a2cae8aa5b00f8a50e4daa862a36af4c9a62b9f1ecfb5f95bdc79a051d19ac'), 't45-r3-final33-standard-p031-20261116-01': (31, 62914560, 2097152, 'e50d2e5f1cad7995dd5dc11cffe43c8798d269e8ac3d0a1b6ae805bea7839146'), 't45-r3-final33-standard-p032-20261116-01': (32, 65011712, 2097152, '0fba290e956aa1c474e759914eaf3de56ad241355b1f3474176c35cd0195f0bb'), 't45-r3-final33-standard-p033-20261116-01': (33, 67108864, 2097152, 'b979b7f2673f74fe5eea5d91f3f41a00ab82d533ff5716afa35a83ca7cc3813d'), 't45-r3-final33-standard-p034-20261116-01': (34, 69206016, 2097152, '5a42f641db579e7e0fbfdf2dba384e7d74840a49494f350555ff79929afec9fd'), 't45-r3-final33-standard-p035-20261116-01': (35, 71303168, 2097152, '6f5c4247ac3dc07eed8260897556e8429e6fe493816b9e804adda1728a825057'), 't45-r3-final33-standard-p036-20261116-01': (36, 73400320, 2097152, '96f3454870caf1f40eb39ecaabeff7cf73da8528da9758711a7769ac1947965d'), 't45-r3-final33-standard-p037-20261116-01': (37, 75497472, 2097152, 'f40939a966f212d5efb96c7e9f919d8ad6e803c382479497c104c0101b58de7b'), 't45-r3-final33-standard-p038-20261116-01': (38, 77594624, 2097152, '04c7b974f5e7cf25235cab8aecb64b24b211e06152042eb0f4a0ca62113c789b'), 't45-r3-final33-standard-p039-20261116-01': (39, 79691776, 2097152, '46b7ac4d7fa528a761329f4490c49b44abe11f65761ea975448c4de8ad4c2f89'), 't45-r3-final33-standard-p040-20261116-01': (40, 81788928, 2097152, '6dd92c8657ecd8d8d3709ac220e7d7ba9d7dbec100e60fddd0ecc95b9dbf1102'), 't45-r3-final33-standard-p041-20261116-01': (41, 83886080, 1639564, 'eadac971317a0542d242cf5eb8c1d07b695608851231a6b6934d53dadaf79f28'), 't45-r3-final33-evidence-p001-20261116-01': (1, 0, 2097152, '59a5dd93ed9266dae8344fbade5b82487b3791b3249abab5f4ddb44a46a8490e'), 't45-r3-final33-evidence-p002-20261116-01': (2, 2097152, 2097152, '373405de0d47614c2803a459ec5e00c52c09e023763caea2ca2ad00897995838'), 't45-r3-final33-evidence-p003-20261116-01': (3, 4194304, 2097152, '914dc21f43dd456aed02c7045cbd4d0b17a5fc2c08a7cef19c350b2f25f68eb3'), 't45-r3-final33-evidence-p004-20261116-01': (4, 6291456, 2097152, '6efa22028f2af73274dd63890d605e09b1c8d8e2a245f325d6151553a92fffe4'), 't45-r3-final33-evidence-p005-20261116-01': (5, 8388608, 2097152, 'b0c7855d35743946f8202bf68a51e8cdf8d557b62df1ba4e5b3610f60c3c738e'), 't45-r3-final33-evidence-p006-20261116-01': (6, 10485760, 2097152, '60b324e161221c15ae58606d9a210c7ece424f0324628e7e09ff2d3752950651'), 't45-r3-final33-evidence-p007-20261116-01': (7, 12582912, 2097152, '1f859546b667614148f9949201aecaf1a366e418d3718f53a1c930630f658bf2'), 't45-r3-final33-evidence-p008-20261116-01': (8, 14680064, 2097152, '3ff75522772511685cd4c44fdf7700e3a6bee0db97d1c62a4388a807cb134f21'), 't45-r3-final33-evidence-p009-20261116-01': (9, 16777216, 2097152, '59de80a494a5941c2ce357a4fc0c92644673a9c6175313bb4e0874af1a20dd54'), 't45-r3-final33-evidence-p010-20261116-01': (10, 18874368, 2097152, '011d77f501402a38939d4da3ffa0d3ac7691fad921d06a1ab5fa6bb35f26ed51'), 't45-r3-final33-evidence-p011-20261116-01': (11, 20971520, 2097152, '0033262074a51c571472ed8fae3d25e91113af9e91e5a44f9b6051b5b8b3555b'), 't45-r3-final33-evidence-p012-20261116-01': (12, 23068672, 2097152, '30fd482705933db35117e2915ed100bc1cd6f4739471c4355d415d75ace11096'), 't45-r3-final33-evidence-p013-20261116-01': (13, 25165824, 2097152, 'b75cb6c0ca46f7ac6fb9290e9f6c1ca6696b678dfe3d9e0ffb56e73f1d55bcbd'), 't45-r3-final33-evidence-p014-20261116-01': (14, 27262976, 2097152, '9e81e9ca76f24cf8ac680737b568e0481f2958607578c95fee7d6b407eff43f4'), 't45-r3-final33-evidence-p015-20261116-01': (15, 29360128, 2097152, '5470a372cc3a54da5288cbf0d9264d5d1052f4ad0839bc30ddfd92baa354ac93'), 't45-r3-final33-evidence-p016-20261116-01': (16, 31457280, 2097152, '9aad166781ce378dc1163a5ec7145f45a5014f1db79b574313c7d6013d50868f'), 't45-r3-final33-evidence-p017-20261116-01': (17, 33554432, 2097152, '2aa1d4e1036e492f92047428ba14430887621e170ad899bb79a2c03651e801a0'), 't45-r3-final33-evidence-p018-20261116-01': (18, 35651584, 2097152, '5cc772c0758b646f00ebd4235359f0a5a57a256298b32f1ed4037a497cb29508'), 't45-r3-final33-evidence-p019-20261116-01': (19, 37748736, 2097152, '8d3d5d453df8dd2ec2c358eb3a2ccc05e364b586d55fa33980788d075e994271'), 't45-r3-final33-evidence-p020-20261116-01': (20, 39845888, 2097152, '711c37b3b5d618c9fb34a43d571cb1b5f1bb2959f571af5e378d400f4b072223'), 't45-r3-final33-evidence-p021-20261116-01': (21, 41943040, 2097152, '5e3759034060edc7a32ea3cb19f726ad5600112a6c796efb034ee3059ea67ab5'), 't45-r3-final33-evidence-p022-20261116-01': (22, 44040192, 2097152, '78dd3045965c213c4048ff5f9d59371e9e8f4c287cc9cc21dc39b0a17319399c'), 't45-r3-final33-evidence-p023-20261116-01': (23, 46137344, 2097152, '8b54137461d41396771a58d709f94fd8b329213c29a397e22ea913b339183bd3'), 't45-r3-final33-evidence-p024-20261116-01': (24, 48234496, 2097152, '651e316d4caf65a139b8760883659794e2f1ce5e494452d86bb7fce21910f92f'), 't45-r3-final33-evidence-p025-20261116-01': (25, 50331648, 2097152, '050fbf1fac460f0105854cb4bee30f6397051ae119cbfd19bd3e5a7afc1c67d6'), 't45-r3-final33-evidence-p026-20261116-01': (26, 52428800, 2097152, '562d8a44486aeb7da286cd9662b8e1e93fdeaa844ace6aa4107b37fdc5e5c01b'), 't45-r3-final33-evidence-p027-20261116-01': (27, 54525952, 2097152, 'fcf5e854b89e5bcc9287374f88831d5a34a8264cd25ff8a81f754a73a47215c8'), 't45-r3-final33-evidence-p028-20261116-01': (28, 56623104, 2097152, 'fd6d7873b40aa3c9338819e9987650dc15589e7f1f4fa9a9f1cbdb1f20155f2d'), 't45-r3-final33-evidence-p029-20261116-01': (29, 58720256, 2097152, 'af600cb767ad96ba5ca85ffe958b4cd5545f17688fe5ca991e9fa65b69943f89'), 't45-r3-final33-evidence-p030-20261116-01': (30, 60817408, 2097152, 'c046bf83cc8e8ba8d30092550fec1b36c628dd79c608c2279159f393ba06f21f'), 't45-r3-final33-evidence-p031-20261116-01': (31, 62914560, 2097152, '3f73f6f810fab0a660b94d4ae4f2a721903f8b5832ef5a56675dd880881f1f53'), 't45-r3-final33-evidence-p032-20261116-01': (32, 65011712, 2097152, '9c95c5d0b0ae24c77c9e447ae58cf1510c74394cc23d0f015ad3e73a0d5e6c5d'), 't45-r3-final33-evidence-p033-20261116-01': (33, 67108864, 2097152, '96517d07e5146002e2cd07320c4552ae3703c8ad228a4fda7d644732d742b4f8'), 't45-r3-final33-evidence-p034-20261116-01': (34, 69206016, 2097152, '1b3c969e3d02b91908e75b38b7c341cdfd7482014cb236e2a9f9c5c61900adf7'), 't45-r3-final33-evidence-p035-20261116-01': (35, 71303168, 2097152, '87d8a8fb2588be31ae94c949e669a75220b6d3298290df58a64f5e911f933a3f'), 't45-r3-final33-evidence-p036-20261116-01': (36, 73400320, 2097152, '90899b298ef4bc75fd98bd9d18ed0c3e65738a85a675b4b7ebe01108284687f4'), 't45-r3-final33-evidence-p037-20261116-01': (37, 75497472, 2097152, 'cad40995f688f72e8e3dccb6f2197903a64e74e7bfa88616ca17998a59c6631e'), 't45-r3-final33-evidence-p038-20261116-01': (38, 77594624, 2097152, '505743d2e67ea6739811653e0007e5ce5c58aee68c831f3d3d2999e7b2858eb1'), 't45-r3-final33-evidence-p039-20261116-01': (39, 79691776, 2097152, '856443f690b72a0cd64eadf61194040d6cb6f6340a8434626557e01065dca4dc'), 't45-r3-final33-evidence-p040-20261116-01': (40, 81788928, 2097152, '9bcae29e7ff9b20083409967641646e4521aa715b49909d1f5f561bab6f80268'), 't45-r3-final33-evidence-p041-20261116-01': (41, 83886080, 2097152, 'fd4809c0e3f53ac3987356f7a18eb83763c99169d1a9f7e23b8f0308a7ce9b1a'), 't45-r3-final33-evidence-p042-20261116-01': (42, 85983232, 2097152, 'd8f5e8a8753e86ede4bbe0e9207b5938abc3b25652349985f43127a36a546d87'), 't45-r3-final33-evidence-p043-20261116-01': (43, 88080384, 2097152, '05d59472edaab8b2a7b759e806b2847e38cfea0943d932ee920b73e29ee8461b'), 't45-r3-final33-evidence-p044-20261116-01': (44, 90177536, 2097152, '7b3a72695b3a24e87b9aeda59ce2bf66db6c08fa0bef6fc4d6126c00aa286d5c'), 't45-r3-final33-evidence-p045-20261116-01': (45, 92274688, 2097152, '3ffc7e5be218b95a9040e76376a9f6779fe338aa89b8735b6e8effe80bf68bc0'), 't45-r3-final33-evidence-p046-20261116-01': (46, 94371840, 2097152, '7c4e8c7447b51dd9ba87fea0cb7cf658bdafe0260a77cdabbd89ec98cd7f8543'), 't45-r3-final33-evidence-p047-20261116-01': (47, 96468992, 2097152, '86f0b45f6e3958d8780d46d0334fc93240f4998a046c4377a90785d3be1830ee'), 't45-r3-final33-evidence-p048-20261116-01': (48, 98566144, 2097152, '640073561880a5afa1916dc33e465e8104daa92331a4b9082f4279474c8f6a74'), 't45-r3-final33-evidence-p049-20261116-01': (49, 100663296, 2097152, '2bbdede8ca75d97f3a707425ab3454352425b2d9f250e90e7193d8ebc6e51e3e'), 't45-r3-final33-evidence-p050-20261116-01': (50, 102760448, 2097152, '469713d003c87ae89cfbb99903de4891b5e12dba8361a3c8762f1d245d37fa71'), 't45-r3-final33-evidence-p051-20261116-01': (51, 104857600, 2097152, 'a66d47fc971711ba1169fe1a36a6fff1c3c981c891216af983ca0d60785e30ca'), 't45-r3-final33-evidence-p052-20261116-01': (52, 106954752, 2097152, 'a2b05fa509a5d8ecb42c25fc77352dfc9b891ee28dd6924e00e7bd5710e94498'), 't45-r3-final33-evidence-p053-20261116-01': (53, 109051904, 2097152, '1e3c7f005b553fffb7cebc2743330d82714f2e1db6679a4d7ed6f25d367356d2'), 't45-r3-final33-evidence-p054-20261116-01': (54, 111149056, 2097152, '08ba3b2a4ef2b9ac0c3a42abaf06206a0232cbaa0b6a5e4cedae7c3c85519cfd'), 't45-r3-final33-evidence-p055-20261116-01': (55, 113246208, 2097152, '0d6a7c22a0a314bbadc9b3ee2ac4916c894abe15b635e9835580ec5414208998'), 't45-r3-final33-evidence-p056-20261116-01': (56, 115343360, 2097152, '3e3b0b65c3b7daf199fb1f5fa090d32ad645db6da788dd89c01222b081917ff5'), 't45-r3-final33-evidence-p057-20261116-01': (57, 117440512, 2097152, '7c6516b701b5583f749ca25ff3bfd4353a85095fac639ca7f631f94fd202f061'), 't45-r3-final33-evidence-p058-20261116-01': (58, 119537664, 2097152, '491a7f51d95414ead8f3cc73df44697d74f03bff392447fe5730b3c75cee9862'), 't45-r3-final33-evidence-p059-20261116-01': (59, 121634816, 2097152, 'dcdb7cac217985d01e2b5b838db9d70e5d08a3b131bcbcfac9a8c467c15d69e0'), 't45-r3-final33-evidence-p060-20261116-01': (60, 123731968, 2097152, '1b0c00fb39e681a946c4e8b79682ef80e998fd8f4fc45cb508ba79007fed8cae'), 't45-r3-final33-evidence-p061-20261116-01': (61, 125829120, 2097152, '4b256a6512037b31d0e9737ff7a7c908b36eb8e18a8dae6316e6e95509695d73'), 't45-r3-final33-evidence-p062-20261116-01': (62, 127926272, 2097152, 'd158c8ab231c3eb0db6d4791159a63f311d82e6175db1921117fc8404681f363'), 't45-r3-final33-evidence-p063-20261116-01': (63, 130023424, 2097152, 'ea91775107e1b020961602f7bc0fe39c0aa1f1adca780efa6fec29082af0d39c'), 't45-r3-final33-evidence-p064-20261116-01': (64, 132120576, 2097152, '23a35d6ee32b9a4099686facb5f039232e8497d1d659d8375b92a2f66835f868'), 't45-r3-final33-evidence-p065-20261116-01': (65, 134217728, 2097152, 'eda487a88eb8cf8c7217e8c2a758b0f1fbb75127bbbdbb971840616482af02ad'), 't45-r3-final33-evidence-p066-20261116-01': (66, 136314880, 2097152, '55554d5ca392d1fadbc96d08f6ed71e1adf2a9f7d4e00c9e78ba0ae42678641e'), 't45-r3-final33-evidence-p067-20261116-01': (67, 138412032, 2097152, '2c675a87f5c8f18e92134e9e75a7adf645ac951bae80990014a6abd73168c0c8'), 't45-r3-final33-evidence-p068-20261116-01': (68, 140509184, 2097152, '23356e65822f9c8c3159ebc76c1507516d1b390e8e0bde3ddab698b226e50566'), 't45-r3-final33-evidence-p069-20261116-01': (69, 142606336, 2097152, '116c40fd8b5e3c744fafafacc18f7522c132a5e49d45a1bd2b6dc2bec66e8727'), 't45-r3-final33-evidence-p070-20261116-01': (70, 144703488, 2097152, '5e59ee583a249d8f58c7f9802fd52f1ce4cbd7cddbfc36f148b4ce6ad6a24b58'), 't45-r3-final33-evidence-p071-20261116-01': (71, 146800640, 2097152, 'a28a4a11c5a5eecc0d1b17d3d370edd8a0e68a7a309e5a60464b6d0cccd1d95f'), 't45-r3-final33-evidence-p072-20261116-01': (72, 148897792, 2097152, '7c4207ad748410c271e9dc3f620d264e5cc76f4915657883d95cff13fe2ec87a'), 't45-r3-final33-evidence-p073-20261116-01': (73, 150994944, 2097152, '4dda3a83e2898773117522df23680869c7e276023c436970f4b416aa880b623f'), 't45-r3-final33-evidence-p074-20261116-01': (74, 153092096, 2097152, '103214b757d2ae236b4e5a1e15dd12458bf69299cf3f915694bb30804f812a54'), 't45-r3-final33-evidence-p075-20261116-01': (75, 155189248, 2097152, '0b7babd08e0f40cde8f8e152db1a75e00ad743cfbeec99a689b1d958b61d0c5b'), 't45-r3-final33-evidence-p076-20261116-01': (76, 157286400, 2097152, 'a594c9b7163cc1cddb63c27ca64a1b05351500085d3bdbfffae8761dfcac203b'), 't45-r3-final33-evidence-p077-20261116-01': (77, 159383552, 2097152, 'a33bba9c2f0cecfccd3bdceb5fdbde30be8f0902ad7a8be90e71e3b633c9c198'), 't45-r3-final33-evidence-p078-20261116-01': (78, 161480704, 2097152, '9d7c11ae71e1f0b37174c8a7f2b9d79abfc17a147f6eca28a92e9933b0943dce'), 't45-r3-final33-evidence-p079-20261116-01': (79, 163577856, 2097152, 'c091ac727f05f9a80599d1dd6dcc64ab97893151dabfcc7028d43000aa8eef30'), 't45-r3-final33-evidence-p080-20261116-01': (80, 165675008, 2097152, 'c0347cd9458677b66c65cfddc3713658d43d789078ef2f8741332eea6a1a8cb7'), 't45-r3-final33-evidence-p081-20261116-01': (81, 167772160, 2097152, 'fcb7daae997626822be908c6c22c8ecf32401feb8f8c2cc4c0f74f89c42a262f'), 't45-r3-final33-evidence-p082-20261116-01': (82, 169869312, 2097152, 'b013cfd5fe741fd9ebaa6645d42117039b887991ea7ea1593758b3247728a06a'), 't45-r3-final33-evidence-p083-20261116-01': (83, 171966464, 2097152, '39c6d9113cf57c7c35a3f30ad3f0e956ac9d3d9f7bd61ab17a3e142d7c3304ec'), 't45-r3-final33-evidence-p084-20261116-01': (84, 174063616, 2097152, 'a2f7faca36eeb56a23d55060d6605ab2c0ffbf7b89a96271965484745aa54227'), 't45-r3-final33-evidence-p085-20261116-01': (85, 176160768, 2097152, '7c3ac026c9ee3cbf97b0e927479c3e41799cdfe36917a9ef8ad23f7944f8998c'), 't45-r3-final33-evidence-p086-20261116-01': (86, 178257920, 2097152, '637f92add9769ccfb1cc6ed2323a40b59f18be0e461253022cf732d33172622f'), 't45-r3-final33-evidence-p087-20261116-01': (87, 180355072, 2097152, '2274ca9dc27582abb2c6437fb4596504c7e168e8616564d8c7db4dd8dc4249c3'), 't45-r3-final33-evidence-p088-20261116-01': (88, 182452224, 2097152, 'd774f37445cc8ff0431a5da93f7a00d8d522d686aabfc4d56096d63c8acaa3ad'), 't45-r3-final33-evidence-p089-20261116-01': (89, 184549376, 2097152, '233fad1b641bff72ba5d625e32c889abaf258232beff09d9b1b0cc5333912ad4'), 't45-r3-final33-evidence-p090-20261116-01': (90, 186646528, 2097152, '6b73f502a3879718c2bd006ce803556116767e7c2bb06da9500f179f979f2e3e'), 't45-r3-final33-evidence-p091-20261116-01': (91, 188743680, 2097152, '69ad92532435f4ec8856eee7c8b27a6cdb5cca1e3c10d9941a6a17b7409e900e'), 't45-r3-final33-evidence-p092-20261116-01': (92, 190840832, 2097152, 'd84957950f90cbedc549c95741e4921d7df3b9f3835d3c5165ca1b8049e46f56'), 't45-r3-final33-evidence-p093-20261116-01': (93, 192937984, 2097152, '697a852ee784902634bd3db7824b92e6a067a6ff74935562262195595245d2ff'), 't45-r3-final33-evidence-p094-20261116-01': (94, 195035136, 2097152, 'abda5f0e623d4ee710d46766b8ee21578e1ee6afebce9855714da13c9125f083'), 't45-r3-final33-evidence-p095-20261116-01': (95, 197132288, 2097152, '57f8ca1feea6c49483d44bc166d239d49bb3002af3e108c3681a97480b747137'), 't45-r3-final33-evidence-p096-20261116-01': (96, 199229440, 2097152, 'a2ea99a718e9fc0ba961e8b2e703ed8900ad134bf280600787729fa088d0a3f4'), 't45-r3-final33-evidence-p097-20261116-01': (97, 201326592, 2097152, '05053dd4dd552a6345f0cc37126b8ab9b99a1c124642a7121f1da6f2b1bd10ad'), 't45-r3-final33-evidence-p098-20261116-01': (98, 203423744, 2097152, '35e27ffb09387930d58a8be0d3311411b2d0ed7c64d6b119811b16c156c48c22'), 't45-r3-final33-evidence-p099-20261116-01': (99, 205520896, 2097152, 'd437c9a54837e6e1b2b9c04ff457989ab7854545f5c98b74705b66f108617d1d'), 't45-r3-final33-evidence-p100-20261116-01': (100, 207618048, 2097152, 'c52bdfb80e9e0327be661340cb96669d049b9a6f6570a02b7370d881d3ec214b'), 't45-r3-final33-evidence-p101-20261116-01': (101, 209715200, 2097152, 'a2f4a1df72a3e94a6d55d93c7b21c0dc078d111cf51688480798440989a452b0'), 't45-r3-final33-evidence-p102-20261116-01': (102, 211812352, 2097152, 'c923231e5c99ed873f5b576de6d818dbb68e3937d2f206ff669b9c7ed005590e'), 't45-r3-final33-evidence-p103-20261116-01': (103, 213909504, 2097152, '336c31079c7dfa438818ca88515440df23f19b02e656a8420c96499cb3bad5f6'), 't45-r3-final33-evidence-p104-20261116-01': (104, 216006656, 2097152, '5b6939dcce2fe32276467370b7e4a4482aaa81a1f0b8618383a9fe482974784a'), 't45-r3-final33-evidence-p105-20261116-01': (105, 218103808, 2097152, '612b4dce5b679cb0a480d716954ce831ac1ca69a00871368234e7ac80649bbea'), 't45-r3-final33-evidence-p106-20261116-01': (106, 220200960, 2097152, '558be88478681c71148ef7847846575e9e085e1270b5ae52f14884c2317052b6'), 't45-r3-final33-evidence-p107-20261116-01': (107, 222298112, 2097152, '1cdfa8a02d258383c15e125aae9b91c8e95d841ffec9e5c08ae2477a3595958b'), 't45-r3-final33-evidence-p108-20261116-01': (108, 224395264, 2097152, '9145ab28c6f7a5bc961a5809adaa45138fae0ad8c8fea8122b6af5e23fadd6a5'), 't45-r3-final33-evidence-p109-20261116-01': (109, 226492416, 2097152, 'a8a8f954293ed8fc35f40778cc33c3202cc42e7dc28bcc4afe1456bcc58fe564'), 't45-r3-final33-evidence-p110-20261116-01': (110, 228589568, 2097152, 'e6bb7a31210661885cb02448fcc7ff3039ffb7ecec6e86e1743761b7d0a3b917'), 't45-r3-final33-evidence-p111-20261116-01': (111, 230686720, 2097152, 'af3b8be0c5b0c8421e1aea4c83763c459d2d207471e83afc26252e3c49688ecc'), 't45-r3-final33-evidence-p112-20261116-01': (112, 232783872, 2097152, '758baa481270bd17e1d1c20e3fc37c73210c3fcc8c26d389749b3f4c7ea49026'), 't45-r3-final33-evidence-p113-20261116-01': (113, 234881024, 2097152, '6c56b44d3ca4886006a5dde2de2928c3d6f5693a92fd04e7f5677e5c500fc607'), 't45-r3-final33-evidence-p114-20261116-01': (114, 236978176, 2097152, '37d137de7bce610899a57c41d52796b67dce2da94f26ba03372aad72304f0c19'), 't45-r3-final33-evidence-p115-20261116-01': (115, 239075328, 2097152, '96b8cea0a15547e21a5ad640196655d1382d50e6d672a3c550f3ea45ec04fc23'), 't45-r3-final33-evidence-p116-20261116-01': (116, 241172480, 2097152, 'b4f4c5c4bd4e03fb3e735aaaa93c416dd07af9f67f1216f0ceb77e7344a39ba0'), 't45-r3-final33-evidence-p117-20261116-01': (117, 243269632, 2097152, 'fed162248ee1fa293687631029536da78cb4abc611fa50866495116c236c247e'), 't45-r3-final33-evidence-p118-20261116-01': (118, 245366784, 2097152, '244c25440fdb49428cb9bc8e261de1d651e7bf0023cda334a0d8b69f4ac87772'), 't45-r3-final33-evidence-p119-20261116-01': (119, 247463936, 2097152, '4d0960131f2dc97a8e16680d93338d57670f28132c3f143eea883ad904348359'), 't45-r3-final33-evidence-p120-20261116-01': (120, 249561088, 2097152, 'cc563b7dd98936aa5d7047d165ac7a8d3e7395f90718944a80cefb7ac8109c2d'), 't45-r3-final33-evidence-p121-20261116-01': (121, 251658240, 2097152, '6bcf15873f17af1dcd50d3501cf4365b48d51f3ddd80370205d41069c5115e89'), 't45-r3-final33-evidence-p122-20261116-01': (122, 253755392, 2097152, 'f4cd3ee9052d0e2ffc790a99b115ccf8f2658bbed9375e9f98f5d7ad7debdc78'), 't45-r3-final33-evidence-p123-20261116-01': (123, 255852544, 2097152, '30875d20007301b47c4c55e78be755af069cdb3bae32265ebd3dc179b3fb583e'), 't45-r3-final33-evidence-p124-20261116-01': (124, 257949696, 2097152, '731b4fa0733d2809f50354773b158ffa802bb591087802e5922f2301a08e18ab'), 't45-r3-final33-evidence-p125-20261116-01': (125, 260046848, 2097152, '25830e25e369e080199e4f4bdd79d4b2e8156ec49ed5829d149d6696c50ad703'), 't45-r3-final33-evidence-p126-20261116-01': (126, 262144000, 2097152, '9e7f675418fb342cea85a56314a8224b39f109c7715388cd4497186265c82c2b'), 't45-r3-final33-evidence-p127-20261116-01': (127, 264241152, 2097152, '79be579ed610232f3d9703f4fce3657dc3854b0c16f77aad88c6243c0c15d11e'), 't45-r3-final33-evidence-p128-20261116-01': (128, 266338304, 2097152, '6dc6b384cf91fb00dccecd90ede82cb1bc49ce4ad9373297d42b8c26c3d084be'), 't45-r3-final33-evidence-p129-20261116-01': (129, 268435456, 2097152, '71628d3a7c96d3bce96e17b983068d6030871ef0bbeab23445e49d7095ea5745'), 't45-r3-final33-evidence-p130-20261116-01': (130, 270532608, 2097152, 'f133186c07352fb2e480a2d6f63b995e69b5429cba2700e1d6ba4c76461e32f9'), 't45-r3-final33-evidence-p131-20261116-01': (131, 272629760, 2097152, '7f57fed5a94d7299950b39e2e7872e4d9a5a8ea812d6a055e3fac2fe36e6ee64'), 't45-r3-final33-evidence-p132-20261116-01': (132, 274726912, 2097152, 'd2c91e482d4c375f940590fb3b740eb3619b0253974f0afdab41f4acb425d169'), 't45-r3-final33-evidence-p133-20261116-01': (133, 276824064, 2097152, '6625a24c1a21356ba4c999fca00ecc58e91b83d3fb8752f79e8663b900ee1efd'), 't45-r3-final33-evidence-p134-20261116-01': (134, 278921216, 2097152, '162e9dcfad5fbc68769f6cd87bb88fc2003a662984fbe3c368223a979eff5835'), 't45-r3-final33-evidence-p135-20261116-01': (135, 281018368, 2097152, '343c3bd52f7052b169dcc39008bd3c533a4669d512627d3d2b11759f0c5c78b7'), 't45-r3-final33-evidence-p136-20261116-01': (136, 283115520, 2097152, '884f782071bc3916286fde6ae8d86dacb3913a6ebbb9019ab2c04dfa84ffb33d'), 't45-r3-final33-evidence-p137-20261116-01': (137, 285212672, 2097152, '5713872dce8e464bb6edc5e08814c1f7409546d886a882cb45b143b975365ca8'), 't45-r3-final33-evidence-p138-20261116-01': (138, 287309824, 2097152, 'ce03ac2d89b4a078d53ce302ade45f4c1d4aff8c4d26d66580e51e66ef4d9716'), 't45-r3-final33-evidence-p139-20261116-01': (139, 289406976, 2097152, 'fd9cf90a39a8a39888f340af9daac8fd25c9813b36cc1d4e6174a1a997246c2a'), 't45-r3-final33-evidence-p140-20261116-01': (140, 291504128, 2097152, 'e163ddb06ecaa7ed63c614f2bdfd26cd6352846d91088b76ef7a6bba38370b95'), 't45-r3-final33-evidence-p141-20261116-01': (141, 293601280, 2097152, '23bfbc6e0cb3a3bb1e62bd9f0cb532feae51ddb1966a702732ccd5593b3854e1'), 't45-r3-final33-evidence-p142-20261116-01': (142, 295698432, 2097152, 'c1d4746f26d4bc0fedf583af7a635835dead67a44b5510ef3df8f8f4140b8f1a'), 't45-r3-final33-evidence-p143-20261116-01': (143, 297795584, 2097152, 'fa29b66f8a0e006bcd7e00edad2ea5ecb7440b4504ccdecb5c26a20ce48f18c2'), 't45-r3-final33-evidence-p144-20261116-01': (144, 299892736, 2097152, 'f16b8e33b8b14098a02eab10c92f721504b8b0191bb518a098a91ad6306937b7'), 't45-r3-final33-evidence-p145-20261116-01': (145, 301989888, 2097152, 'a301ae28f655d4938851e2afbf62f198909e37a55ef3594ad46d3761e1a75857'), 't45-r3-final33-evidence-p146-20261116-01': (146, 304087040, 2097152, 'd3230da42c2f63e773ecf399bf41e84c874e1b3ca87f5e8375961f71f77283d9'), 't45-r3-final33-evidence-p147-20261116-01': (147, 306184192, 2097152, 'cd1825d1ae3da127fc00d19ce485330f208b9d03b132b805cfa5c8540a39465f'), 't45-r3-final33-evidence-p148-20261116-01': (148, 308281344, 2097152, '20902212678fb86eb5c327616f419fa0844a0d125a4badf8bf4b7c48a7cebb7e'), 't45-r3-final33-evidence-p149-20261116-01': (149, 310378496, 2097152, 'cc3cc7e7addde4ca1c8d619dd045f236c31eca3adda4fc724f79c692bfd317ed'), 't45-r3-final33-evidence-p150-20261116-01': (150, 312475648, 2097152, '29dcf09bf74533ae81bf90c97b472fe75a3e7dac755acb46b569496700fdbe63'), 't45-r3-final33-evidence-p151-20261116-01': (151, 314572800, 2097152, 'ce4497860ad87018eba66f67c456f07974f188269b155dfbf7e5f1da49f4bfce'), 't45-r3-final33-evidence-p152-20261116-01': (152, 316669952, 2097152, 'bca899379dc3830581b9b5ad6b1376080c26bfd30ae17698026063457dbd2e8e'), 't45-r3-final33-evidence-p153-20261116-01': (153, 318767104, 2097152, 'fbf063276247dee157856599873c7a9ce71dab064c75863dbcc32359db50cb5c'), 't45-r3-final33-evidence-p154-20261116-01': (154, 320864256, 2097152, '468527ebfec614d900f96371d892a4a6fd52baa80446a98a7b05cad6b7cb43a0'), 't45-r3-final33-evidence-p155-20261116-01': (155, 322961408, 2097152, 'b6c8810b7b7f66734e428d8ea025ca9f4f76d0bd7b9a08cd7724bd1112180b15'), 't45-r3-final33-evidence-p156-20261116-01': (156, 325058560, 2097152, '4bc122617337424282727464f8b99f20dbb5bc9e2f5afe6759d83e1bf3d176b3'), 't45-r3-final33-evidence-p157-20261116-01': (157, 327155712, 2097152, '83ba15e3a8f5faf826e9a5d6d8148c72dde37a44d52ba701c846cdb5b4a220d6'), 't45-r3-final33-evidence-p158-20261116-01': (158, 329252864, 2097152, 'd45645d6efbf3b3aa8f91d927e50876dff4d9a78072299028e487f964f803f84'), 't45-r3-final33-evidence-p159-20261116-01': (159, 331350016, 2097152, '4ccbecb244b29ce75394f2685cefecb03428f22dfec5029aa9095bf6fa8b587f'), 't45-r3-final33-evidence-p160-20261116-01': (160, 333447168, 2097152, '54ed9776e091f2b3c32fe752f5c5c69be8417a073482fea79fdeab182f38c6c5'), 't45-r3-final33-evidence-p161-20261116-01': (161, 335544320, 2097152, '8f7a07a69f0575f1819021185ea7ded345031f231ddc1de33694b8f4ab508438'), 't45-r3-final33-evidence-p162-20261116-01': (162, 337641472, 2097152, 'f0c818a28af2919c81c483b929b27269db4ddb38ff37bc94fe7aa8862b1d01f2'), 't45-r3-final33-evidence-p163-20261116-01': (163, 339738624, 2097152, '02561908cb3114f6536d656856c81cb3b4fc5f1ce9a52d13a9304102d8054c1d'), 't45-r3-final33-evidence-p164-20261116-01': (164, 341835776, 2097152, '0fe53e3f7224655fbeec81bc9df03ef062f426c557634c9a78e32d5c33efe74f'), 't45-r3-final33-evidence-p165-20261116-01': (165, 343932928, 2097152, '05faa51cef34bd790774ddcb7a52538ca1ec8e42bb82d1a0c31870a725cd9807'), 't45-r3-final33-evidence-p166-20261116-01': (166, 346030080, 2097152, '7b151086d5f31776257e9d36fdd643b17af6020bf234aa15167c81df48d2a718'), 't45-r3-final33-evidence-p167-20261116-01': (167, 348127232, 2097152, 'f240eb6dfd92ee3aedb2a636ad7b3041922f9009b17e8ec34d837b03bd58e647'), 't45-r3-final33-evidence-p168-20261116-01': (168, 350224384, 2097152, '2f8ef8b4c50fea83b0f2e80392d50ccf83077ba09ba445baf3cd2f28f95f4fc4'), 't45-r3-final33-evidence-p169-20261116-01': (169, 352321536, 2097152, '41216564986ec3413a1a06f1fdac7c62dc6e9cdeba015200df68697c414e4ba0'), 't45-r3-final33-evidence-p170-20261116-01': (170, 354418688, 998535, '0b5ec0f916bcd5f4afd936253fc4df452baa198587514c2450667d993f3fd625')}

def final33_private_authority(a, control, grant):
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256',
          'archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind',
          'fragmentIndex','fragmentOffset'}
    key=a.get('artifactKey')
    if (set(a)!=keys or type(key) is not str or a['kind']!='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
        or a['format']!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1'
        or a['decision']!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING'
        or a['taskId']!='T45' or grant!='b16447fbc81f4d64' or a['grantId']!=grant
        or control!='/home/naijue/erp-release-20261006-01-control/grant-'+grant
        or a['manifestSha256']!=FINAL33_MANIFEST
        or a['targetDirectory']!=control+'/private-standard-import-data/'+key
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512
        or FINAL33_PARTS.get(key)!=(a['fragmentIndex'],a['fragmentOffset'],a['archiveBytes'],a['archiveSha256'])):
        raise ValueError('FINAL33_EXACT_PRIVATE_FRAGMENT_REQUIRED')

RECOVERY_KEY='r3-final33-recovery-input-20261117-01'
def recovery_private_scope(control, grant):
    if control!='/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64' or grant!='b16447fbc81f4d64':
        raise ValueError('RECOVERY_EXACT_EXISTING_GRANT_REQUIRED')
    return dict(format='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1',
        decision='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING',taskId='T45',grantId=grant,
        artifactKey=RECOVERY_KEY,manifestSha256='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
        archiveSha256='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d',archiveBytes=40960,
        targetDirectory=control+'/private-standard-import-data/'+RECOVERY_KEY,
        kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',fragmentIndex=1,fragmentOffset=0)
def recovery_private_authority(a, control, grant):
    fixed=recovery_private_scope(control,grant)
    if (type(a) is not dict or set(a)!=set(fixed)|{'startsAt','expiresAt','decisionReference'}
        or not all(a[k]==v for k,v in fixed.items())
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('RECOVERY_EXACT_PRIVATE_SCOPE_REQUIRED')

def private_standard_data_authority(a, control, grant):
    if a.get('artifactKey')==RECOVERY_KEY:
        return recovery_private_authority(a,control,grant)
    if a.get('manifestSha256')==FINAL33_MANIFEST:
        return final33_private_authority(a,control,grant)
    if a.get('manifestSha256')==R3_R2_PRIVATE_MANIFEST:
        return r3_r2_private_authority(a,control,grant)
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
    fragment=a.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
    if fragment:keys|={'fragmentIndex','fragmentOffset'}
    if (set(a)!=keys or a.get('kind') not in PRIVATE_STANDARD_DATA_KINDS or
        a.get('format')!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' or
        a.get('decision')!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' or
        a.get('taskId')!='T45' or a.get('grantId')!=grant or
        a.get('manifestSha256')!=PRIVATE_STANDARD_DATA_MANIFEST):
        raise ValueError('PRIVATE_STANDARD_DATA_AUTHORITY_SCOPE_REFUSED')
    if (type(a['artifactKey']) is not str or re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',a['artifactKey']) is None or
        a['targetDirectory']!=control+'/private-standard-import-data/'+a['artifactKey']):
        raise ValueError('PRIVATE_STANDARD_DATA_NAMESPACE_REFUSED')
    if fragment:
        index=a['fragmentIndex']
        if type(index) is not int or not 1<=index<=45:raise ValueError('PRIVATE_STANDARD_DATA_FRAGMENT_REFUSED')
        offset,size,digest=PRIVATE_STANDARD_DATA_PARTS[index-1]
        if (type(a['fragmentOffset']) is not int or a['fragmentOffset']!=offset or
            type(a['archiveBytes']) is not int or a['archiveBytes']!=size or a['archiveSha256']!=digest):
            raise ValueError('PRIVATE_STANDARD_DATA_FRAGMENT_REFUSED')
    elif type(a['archiveBytes']) is not int or a['archiveBytes']!=PRIVATE_STANDARD_DATA_BYTES or a['archiveSha256']!=PRIVATE_STANDARD_DATA_ARCHIVE:
        raise ValueError('PRIVATE_STANDARD_DATA_ARCHIVE_REFUSED')

def artifact_authority(raw, cfg, allow_expired=False):
    def pairs(items):
        d={}
        for k,v in items:
            if k in d:raise ValueError('ARTIFACT_DUPLICATE_AUTHORITY_KEY')
            d[k]=v
        return d
    a=json.loads(raw,object_pairs_hook=pairs)
    if type(a) is not dict:raise ValueError('ARTIFACT_EXACT_AUTHORITY_REQUIRED')
    private=a.get('kind') in PRIVATE_STANDARD_DATA_KINDS
    if private:private_standard_data_authority(a,cfg['control'],cfg['grantId'])
    else:
        if set(a)!=ARTIFACT_KEYS:raise ValueError('ARTIFACT_EXACT_AUTHORITY_REQUIRED')
        if (a['format']!='T45_ORDINARY_ARTIFACT_STAGING_V1' or a['decision']!='AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING'
            or a['taskId']!='T45' or a['grantId']!=cfg['grantId'] or a['kind']!='ORDINARY_SOURCE_AND_TOOLS'):
            raise ValueError('ARTIFACT_AUTHORITY_SCOPE_REFUSED')
    ident(a['artifactKey'])
    for key in ('archiveSha256','manifestSha256' if private else 'sourceSetSha256'):
        if type(a[key]) is not str or not re.fullmatch('[a-f0-9]{64}',a[key]):raise ValueError('ARTIFACT_HASH_REQUIRED')
    if type(a['archiveBytes']) is not int or not 0<a['archiveBytes']<2**53:raise ValueError('ARTIFACT_EXACT_BYTES_REQUIRED')
    if not private and a['targetDirectory']!=cfg['control']+'/artifacts/'+a['artifactKey']:raise ValueError('ARTIFACT_NAMESPACE_REFUSED')
    if (type(a['startsAt']) is not int or type(a['expiresAt']) is not int or not a['startsAt']<a['expiresAt']
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('ARTIFACT_EXTERNAL_DECISION_REQUIRED')
    if cfg.get('scope')!='ERP_EXISTING_TASKS_THROUGH_T51' or a['expiresAt']>cfg.get('expiresAtEpoch',0)*1000:raise ValueError('ARTIFACT_EXISTING_GRANT_BOUNDARY_REFUSED')
    now=int(time.time()*1000)
    if not allow_expired and not a['startsAt']<=now<a['expiresAt']:raise ValueError('ARTIFACT_AUTHORITY_WINDOW_REFUSED')
    return a

ARTIFACT_REMOTE = r'''
import os,sys,json,stat,hashlib,time,re
from pathlib import Path
context=CONTEXT_LITERAL

PRIVATE_STANDARD_DATA_MANIFEST = '1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9'
PRIVATE_STANDARD_DATA_ARCHIVE = 'fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e'
PRIVATE_STANDARD_DATA_BYTES = 93508914
PRIVATE_STANDARD_DATA_PARTS = ((0, 2097152, '3cbb18ea4b45b20a3672e1826498699b10c5baad2328286a340abd49404ac4c8'), (2097152, 2097152, 'dedc7cd99d5a88a10cb8f47bcaa6ef489ac7708fd6c650da92d7509cd2cd6df8'), (4194304, 2097152, '34c01309bb3158eef739f0ca692ca9767c31708389676cf1c0cf219208c9f5d7'), (6291456, 2097152, '5c4cec8b8211069cbeea5da6f1cc459d3e8f0fb09923f8a68da9069b3b6c1743'), (8388608, 2097152, '6a3b5efbba17ea28ca2e2b64d0ded045514e10adbfe077f437a1518ed6e376b4'), (10485760, 2097152, 'c0230734913ce61310b622021ccfd5df04ac10a9b584a9e27acb52ff435abe0d'), (12582912, 2097152, 'f747ffc6e6e72300d9cd23c5e41849a14cd6f4477f312ff1c27258a21d250dc0'), (14680064, 2097152, 'a7670baeae8b2031fa95f6ab84f9a848ade0497cbb53b7994319f25e7ed59bf8'), (16777216, 2097152, '487695e643075da984e445463ea4adb769723cbe2af85d5d1576daabd81daaab'), (18874368, 2097152, 'cb95a60a41e946b982e25a33cc37b448c1849b669e5a1da6acb9c1b55477ddcc'), (20971520, 2097152, '2d9c5375d6c333306d05c7a32998960346e84d5a6904b66081acfe5bff2404e6'), (23068672, 2097152, '29d79076fdf6923309ae3faec105ec131ddfc776ca7fb3b5e433cd458f8975fd'), (25165824, 2097152, '44333fc0432208ff22d958b271c75e88ca85bd98c23468effd43d5fab95c12ad'), (27262976, 2097152, 'e0f9ddf6a5dd92d2cace01d603d3074c40f2ef9eb278c3c1c51fe2a83f9e3f2b'), (29360128, 2097152, '8ba81ec98297087858fe80a13abbcea36f25662bc0089a63fb61bde26f20dff2'), (31457280, 2097152, '5dc60b2dbc1c7e3152ddd8ff928a7881a5a4a87869b0cacb06cf2bbb61e450e9'), (33554432, 2097152, '458e30fd0b0982bd9f4f2df0e4d93132c93be4c17dd24e08d56d39322ca4b7e5'), (35651584, 2097152, '7ec2490a261da4857958264e8385777a07d156c64bdcad3bca33c5a669ccc29c'), (37748736, 2097152, '95cfc322b359baefa4db0f1371b353c8626ccaf7c9d7f55fd426d3d19ba3e707'), (39845888, 2097152, 'a4c1dce77a86b840df51df761bde51c33af50528b240a9b711d53509e0a91ed4'), (41943040, 2097152, 'e3ccb9763ec11b97d7465213a55a20cfcc3daf3948e2f0049cb2931512bfac35'), (44040192, 2097152, 'c1518fcfcc87123c910dedeacc3c1c5cf235f80d41488a5bb097943acc46358f'), (46137344, 2097152, '8273847966b7b7df6f15d37292c3f122ecaf674dc2e53826467531464b78ab0c'), (48234496, 2097152, '41b49dab28fcdb0177e55b997e4af45875e8e49f829986e93ee6ad4ea4edb7f9'), (50331648, 2097152, '6b588357e70efb55b0a26b003981a35a2a3c708f626dad1fb6609d7cdda0ec84'), (52428800, 2097152, 'a0dd962323d8fb663840df561b2713aee0b91080613c0c5c37f17ecb5887c05a'), (54525952, 2097152, '4de4d84e0b7057865a5ae8b3de0801809a279c8e24f71a39a561d085fd89b4eb'), (56623104, 2097152, '9fbcb36f69d28064673ef8b6b6a4ac9afa19b3e00c782629f43db736d3a237d2'), (58720256, 2097152, 'a2f19600a6ac4aa8b18d158b75decdb5a665e49aeb94d52e6626e70b3eab6320'), (60817408, 2097152, '01f463adaed8d7d23f09dd5beb4b1a43a72b2f4e32b19bfb9a058ae303631ead'), (62914560, 2097152, '8bda46e262d5f497e071708425542ba6da05c7a3b540d9d353c577c1501fb39b'), (65011712, 2097152, '954a9935b358d27c0965d382014df73c8e2c82b8e535c6fe21dfcafcbdab0b6e'), (67108864, 2097152, '279b79a395a9efda5a09a80e5b721c9f17694a3db0bf44123dce5603c9930c66'), (69206016, 2097152, 'a796aa460040cd93875abc769e7c2577033e27f3c32d5c5690d45a99e97ef67d'), (71303168, 2097152, 'a9ba7278665e6d0e77f8ddc81cfc2a0fb5a7a18a00536a96238662db45780cce'), (73400320, 2097152, '63309c387337024afd380e345b8aacbd781f2141a87ac3f9295247bb23a5ee4e'), (75497472, 2097152, '532ae8d1b4990b3b3d661fb6c36a48c455572dbbe09d47bd8e1050b03f113c6b'), (77594624, 2097152, '726e15228dea7ddfbbf5e90f2562d5b1c3e52468f9d43c8db166baddcd8c2632'), (79691776, 2097152, '07bab9e526f245e61fe96386beb1690116cd730593ac69ce33064433a0ae8100'), (81788928, 2097152, '472364c8c986190a11a39b93c795ee807c8d7c9dfdb5c1216a2cb91f2708c807'), (83886080, 2097152, '2d77f1ff9653273492dc15a1d6172fdce26462f7c4e2488dc5d1f6bade5f3ea6'), (85983232, 2097152, '039f3637a363307c508047eae2b032d9d518fef5937ae5ba345758117e9d13b7'), (88080384, 2097152, 'd691e601baf57a37a01d7764443f31118749720b154a10c54103fcdaf87e43f1'), (90177536, 2097152, '81a47929f84d70485181becbdf409931098265787935a11a10c08df6616f023d'), (92274688, 1234226, 'a0c17af2a4a03ae75f471c5c5f5deece1e65faa744e8fad959d96dd41ab4eb43'))
PRIVATE_STANDARD_DATA_KINDS = ('PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT','PRIVATE_STANDARD_IMPORT_DATA')

R3_R2_PRIVATE_MANIFEST = 'f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb'
R3_R2_PRIVATE_FINAL = ('t45-r3-r2-data-full-20261112-01', 80853258, '8bb909c7986a35128b207496fa8a0c1451f1c097954754c3ddc9629e18696c4c')
R3_R2_PRIVATE_PARTS = {
    't45-r3-r2-data-p01-20261112-01': (1, 0, 2097152, '6d4db8ae5fb829c92126c3d01ee53ab51147d86c89cc3ee6cc9b2b1583f6f230'),
    't45-r3-r2-data-p02-20261112-01': (2, 2097152, 2097152, '8467e39f2bb809aa7c7a4b7eca3eadac793601503881a694b8bd0c75c925974f'),
    't45-r3-r2-data-p03-20261112-01': (3, 4194304, 2097152, '17c64597f8df978a6467c745a35b21e8a74959022aa6f6bf2312c2e94f1c5623'),
    't45-r3-r2-data-p04-20261112-01': (4, 6291456, 2097152, '33af7aafddebc31382b297d1abe1ad05671537034457d76d150e3f330f557827'),
    't45-r3-r2-data-p05-20261112-01': (5, 8388608, 2097152, 'df8458a2167d78b0dfaad07e18c6ffb7d3d61094fe40b6aea43acd2a99074536'),
    't45-r3-r2-data-p06-20261112-01': (6, 10485760, 2097152, '158ac83e7da14caec2d12d26319f36b406da1f085d597a2dcc139fda7bbbef9f'),
    't45-r3-r2-data-p07-20261112-01': (7, 12582912, 2097152, '62832dbb132a00f7a9e9da9617f867907e32467a34a62403fb3e7d3aa6932ff7'),
    't45-r3-r2-data-p08-20261112-01': (8, 14680064, 2097152, 'a7c8acfc33826ef8c081c703b529bce749312d4d9f37293e6f26ec951f3f2558'),
    't45-r3-r2-data-p09-20261112-01': (9, 16777216, 2097152, 'fb1c0cfba3f34ecb62dcc2ff9fa244604b8390e7281e5d1c28cff5e7c1900fce'),
    't45-r3-r2-data-p10-20261112-01': (10, 18874368, 2097152, '1f3d8bd7f91a39dac26f265024e6cdc324a506f05a74f768ead84e4be65bf36c'),
    't45-r3-r2-data-p11-20261112-01': (11, 20971520, 2097152, '76d980d61f31fcd99ef882fd1788498e44fb623bcf638d472f1aa311810e2304'),
    't45-r3-r2-data-p12-20261112-01': (12, 23068672, 2097152, 'a690d584969a0d5277dec097cc7c172a0c911c107528abadc1a34c807d6e5dca'),
    't45-r3-r2-data-p13-20261112-01': (13, 25165824, 2097152, '7091aeeba7e91ae750eefe56ed3bc93c0d5c8fa058c792886759490c1d74e60e'),
    't45-r3-r2-data-p14-20261112-01': (14, 27262976, 2097152, '12116777d70dcdae120b3962fc1ddcd196d090740478641ede3540306cb9b962'),
    't45-r3-r2-data-p15-20261112-01': (15, 29360128, 2097152, 'e747737fb48f35f7e612ec60d82e85db80d1fdd3d2d6294143cd270f5cfe9cf7'),
    't45-r3-r2-data-p16-20261112-01': (16, 31457280, 2097152, '338c87e417fe78657627539f85e7c657768c42b817309f17170229b32dab61dd'),
    't45-r3-r2-data-p17-20261112-01': (17, 33554432, 2097152, '88a16e430894876d5c926a4e0338821741772e08bd4af3d42a1365a15afceed4'),
    't45-r3-r2-data-p18-20261112-01': (18, 35651584, 2097152, '0adc730f9c947fb9ce868519e86333b553714a3760de0467ebf34333c67ef23f'),
    't45-r3-r2-data-p19-20261112-01': (19, 37748736, 2097152, '3948c8c3b93664730f470274b7ed4f301b4175b31ba6ec9be3fe2df18f43ef32'),
    't45-r3-r2-data-p20-20261112-01': (20, 39845888, 2097152, '4dd6c67c68e8c775e820ae7240cca0c2a42f0da7f7fd2780043196f446918155'),
    't45-r3-r2-data-p21-20261112-01': (21, 41943040, 2097152, 'd75b1f0e37e18d132bfb97586e4f10b9d6b7b81cafeea0521ed52ccee6559210'),
    't45-r3-r2-data-p22-20261112-01': (22, 44040192, 2097152, 'adc87dd61c5f709de3fa99763bf5d7067a2c46180fac4cf60e89e297f9837354'),
    't45-r3-r2-data-p23-20261112-01': (23, 46137344, 2097152, 'dd9b2d84ef016cf183c35610e6b03aa1762aea3fe38c80702d932de665bb3dd1'),
    't45-r3-r2-data-p24-20261112-01': (24, 48234496, 2097152, '529c4a21cfc8a4296ef4b4aeb1919120c5cfe3da0134571f771a8b73c4aeb58f'),
    't45-r3-r2-data-p25-20261112-01': (25, 50331648, 2097152, 'd9a48e644121eecab30a66b864be8682280dac4e933805492baf20598566e6e8'),
    't45-r3-r2-data-p26-20261112-01': (26, 52428800, 2097152, 'a480fbae452f6528bc4e690d07c50389548744d43f1d8ca16bd21fa1dbcd65e1'),
    't45-r3-r2-data-p27-20261112-01': (27, 54525952, 2097152, '4bb56c41588bca04a34ff20e32bf9ec0dd6608ad44e4a0f66e8da7fb85400d3a'),
    't45-r3-r2-data-p28-20261112-01': (28, 56623104, 2097152, '3a554f4c7a11b967b31429bc44293d60ddc9c3794e968b47783e203d4a360e1a'),
    't45-r3-r2-data-p29-20261112-01': (29, 58720256, 2097152, '105cd90f0af99b37b898741c27e82d7ca45c6c1b7d92f1ca48c0a807604d2531'),
    't45-r3-r2-data-p30-20261112-01': (30, 60817408, 2097152, 'cc480b8d13c199225a01a3a350052bacc0f8807e4215db30d3e26d2deb9b79dd'),
    't45-r3-r2-data-p31-20261112-01': (31, 62914560, 2097152, 'a0665e657116972bce084695e187b0acad8bc2ea20c831a77576dd7ecc90c226'),
    't45-r3-r2-data-p32-20261112-01': (32, 65011712, 2097152, 'f33ce7a5fc3ad16bbbf1f4ece538b0f213d9a2f52a08edec9dcb0d93b21aa835'),
    't45-r3-r2-data-p33-20261112-01': (33, 67108864, 2097152, '6369a8247fd53ce472c923fe830f7b8604925a7e32e7ca01961058a0bdf09ca2'),
    't45-r3-r2-data-p34-20261112-01': (34, 69206016, 2097152, '5ca1b43297d0d8b13d422d5271752ebaa69575dd579f8e5bf2fb03e627227456'),
    't45-r3-r2-data-p35-20261112-01': (35, 71303168, 2097152, '101cce711f7d9618967649b47e7761c9e8511a39bb93fc70391fa5d01bcb0a83'),
    't45-r3-r2-data-p36-20261112-01': (36, 73400320, 2097152, '57b12f891f4f84a36536b7e66ecdccaa43e5349368dd36c09751dcb67e0adc31'),
    't45-r3-r2-data-p37-20261112-01': (37, 75497472, 2097152, '36dc5d0ea079054fb2c3064dee77897c45a908cbf567e327cb56065deeb60571'),
    't45-r3-r2-data-p38-20261112-01': (38, 77594624, 2097152, '532907396e54ad496a8e22654bb48705dfa9ce74855f225248e59243affb1d5b'),
    't45-r3-r2-data-p39-20261112-01': (39, 79691776, 1161482, '8fc47d84f43e56b2e41ee0f077241a530a8a42d0d4ae2a45e6e80aa52690d9f4'),
    't45-r3-r2-side01-p01-20261112-01': (40, 0, 1804, 'caec2056f53910f8e574d16e151974681da437bbf36773365bee52f77467d151'),
    't45-r3-r2-side02-p01-20261112-01': (41, 0, 2097152, 'd91ccaef8e4e5c4670de04ce59eb78c1e695d0715639fe33b33ed43e26097465'),
    't45-r3-r2-side02-p02-20261112-01': (42, 2097152, 2097152, '61409aa4f9e1abbf471f0215761f0c43a777e694c78ccfe5b95b585f2e69a8bb'),
    't45-r3-r2-side02-p03-20261112-01': (43, 4194304, 2097152, '05115af6d5ccef16c61192135887e06693f0934a1e186c41493c6d1f403aa0b5'),
    't45-r3-r2-side02-p04-20261112-01': (44, 6291456, 2097152, 'a1b577b0907bc536e0052b50562bcc12d3af3c261e35423e80f26f5d51829967'),
    't45-r3-r2-side02-p05-20261112-01': (45, 8388608, 2097152, '6f618aaec20cfc9cacfb25fcd2b11c6b45a9238d2ecc8aaeab620ada049e39bf'),
    't45-r3-r2-side02-p06-20261112-01': (46, 10485760, 2097152, '7b9c03173bc9e5183b5e1d92cfc7d4e135d7a2be24698b9f135d98ee485032b5'),
    't45-r3-r2-side02-p07-20261112-01': (47, 12582912, 2097152, 'c62f53db147b2d89fd7afaed80533f5371ae0fadc3c3392f4e5534bbb2f2721e'),
    't45-r3-r2-side02-p08-20261112-01': (48, 14680064, 2097152, '0654a6d477c811ef66ea4255b1a680681d5aaf2135a887c81ce7f804b49cb969'),
    't45-r3-r2-side02-p09-20261112-01': (49, 16777216, 2097152, '4d1ef7fb9291a102b79bc5cd0da61c5335b47c08631469820d01a9eb15ef42e1'),
    't45-r3-r2-side02-p10-20261112-01': (50, 18874368, 2097152, '18f13abb10173146c93c04206a7308fdb6b9eba9bbb89215c9d44958ef439e92'),
    't45-r3-r2-side02-p11-20261112-01': (51, 20971520, 2097152, '1161e81f43576a56fa951c9e350612eaba94a11464948ba7f504b3c3340194bb'),
    't45-r3-r2-side02-p12-20261112-01': (52, 23068672, 2097152, '9188344fdd9e96c0a1fba8b1a075ff7f51872948a2df825be42fc37a9a9afbb5'),
    't45-r3-r2-side02-p13-20261112-01': (53, 25165824, 2097152, 'c77402b464db8b6e647a5e0aab3d82d91367989c1e6ac0d0d8bc0a3507cc4c9f'),
    't45-r3-r2-side02-p14-20261112-01': (54, 27262976, 2097152, '7549476e958cd632b73fe723cedb1cb77864fba1d92328c7f35c604aee3affc0'),
    't45-r3-r2-side02-p15-20261112-01': (55, 29360128, 2097152, 'c1661cf447f9e398f3aaac7e329d6c61fe88bbab4759f986556894b594f4a5f8'),
    't45-r3-r2-side02-p16-20261112-01': (56, 31457280, 2097152, '16e6dac5cb34b5bb6e4ee5cde31b04284015144323fe7b6afca55d7d99a880e3'),
    't45-r3-r2-side02-p17-20261112-01': (57, 33554432, 2097152, '5fb8a347803823e3a7ccbfc852b3beb33d96042f2cb7a87faed6bf56643481ea'),
    't45-r3-r2-side02-p18-20261112-01': (58, 35651584, 2097152, '1f03a0d0917057c5650b74715d3ea46ca619847a547eae76a80e528f450aaac0'),
    't45-r3-r2-side02-p19-20261112-01': (59, 37748736, 2097152, '4ddc93f77fe9322ad9ba4b5bae91d9fe830a71f93b8259f393bee3a5c248e505'),
    't45-r3-r2-side02-p20-20261112-01': (60, 39845888, 2097152, '7e64fa341b2bae9e4e65f4b7af11852ffb34b6b82472b480e89fe9db5aa3ff36'),
    't45-r3-r2-side02-p21-20261112-01': (61, 41943040, 2097152, '85a97f442ab2d11846bf39d22ea174feac5cfddaea37e662053d05f81ced1475'),
    't45-r3-r2-side02-p22-20261112-01': (62, 44040192, 2097152, '5ae4b7d8e8a1b225fa4101e02f5f87bba04a5ad317b9c8721a55629318510e49'),
    't45-r3-r2-side02-p23-20261112-01': (63, 46137344, 1072164, '1375eb56effbc4cca89a3215f58cf75f44183675c5efd7882aa807435ef276b5'),
    't45-r3-r2-side03-p01-20261112-01': (64, 0, 5763, '29c3d14cff036804e4a6ad1d703b4b0b876909d8c84d3aecfa37d2c971d6a7f1'),
    't45-r3-r2-side04-p01-20261112-01': (65, 0, 867, '4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40'),
    't45-r3-r2-side05-p01-20261112-01': (66, 0, 33226, '4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'),
    't45-r3-r2-side06-p01-20261112-01': (67, 0, 2499, '98c88621471a17d605c1556b5c434f2d52179bfb97c911eabfb3c91039d0c8ad'),
    't45-r3-r2-side07-p01-20261112-01': (68, 0, 3927, 'c7747c37229389dea6ef2fddb1e6bad65337085bb82ebc7d864c31639c6354af'),
    't45-r3-r2-side09-p01-20261112-01': (69, 0, 2484, '6e2156257aa3373323bbd3e16335703922839e9570f9cb33be405e80b0d62a2a'),
    't45-r3-r2-side10-p01-20261112-01': (70, 0, 681674, 'dd8b00e6c3780f50e6b078649c598b98058c7a9970b2dbd6d2261a72013d729e'),
    't45-r3-r2-side11-p01-20261112-01': (71, 0, 2097152, '5534d78421245eb22a9129987e5fcc5f5bb7534eb188b325db47b8d51d964ebf'),
    't45-r3-r2-side11-p02-20261112-01': (72, 2097152, 2097152, 'eb90461e15fe0136d54876217476ff934bdaa529595cd5b84fbc187c05b258a8'),
    't45-r3-r2-side11-p03-20261112-01': (73, 4194304, 507423, '58859764685cde14ccb3ac5d83a6c765102d15d4cb4717e4d23e285acc1b65cc'),
}

def r3_r2_private_authority(a, control, grant):
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256',
           'archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
    fragment=a.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
    if fragment:keys|={'fragmentIndex','fragmentOffset'}
    key=a.get('artifactKey')
    if (set(a)!=keys or type(key) is not str or
        a['format']!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' or
        a['decision']!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' or
        a['taskId']!='T45' or a['grantId']!=grant or grant!='b16447fbc81f4d64' or
        control!='/home/naijue/erp-release-20261006-01-control/grant-'+grant or
        a['manifestSha256']!=R3_R2_PRIVATE_MANIFEST or
        a['targetDirectory']!=control+'/private-standard-import-data/'+key or
        type(a['archiveBytes']) is not int or type(a['startsAt']) is not int or
        type(a['expiresAt']) is not int or not 0<a['expiresAt']-a['startsAt']<=600000 or
        type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('R3_R2_EXACT_PRIVATE_SCOPE_REQUIRED')
    if fragment:
        if (type(a['fragmentIndex']) is not int or type(a['fragmentOffset']) is not int or
            R3_R2_PRIVATE_PARTS.get(key)!=(a['fragmentIndex'],a['fragmentOffset'],a['archiveBytes'],a['archiveSha256'])):
            raise ValueError('R3_R2_EXACT_PRIVATE_FRAGMENT_REQUIRED')
    elif a['kind']!='PRIVATE_STANDARD_IMPORT_DATA' or (key,a['archiveBytes'],a['archiveSha256'])!=R3_R2_PRIVATE_FINAL:
        raise ValueError('R3_R2_EXACT_PRIVATE_FINAL_REQUIRED')

FINAL33_MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
FINAL33_PARTS = {'t45-r3-final33-standard-p001-20261116-01': (1, 0, 2097152, '7c9ebc3bf73242edd8e710ac4237c3dd04d1fb9f187c158f2f285a53b90f0228'), 't45-r3-final33-standard-p002-20261116-01': (2, 2097152, 2097152, 'ab8a9456eae851c8aa8a79b60490871ff115ae0c05250be42c3f53a5c374ee3c'), 't45-r3-final33-standard-p003-20261116-01': (3, 4194304, 2097152, '014e9889c64ed1eca2dde93fd6d1079278c836517e17649ebaf6e661a13c2543'), 't45-r3-final33-standard-p004-20261116-01': (4, 6291456, 2097152, '25a8964fae8f1485bead8c1f3747e871438f27271066c889bffe8bccb45e485f'), 't45-r3-final33-standard-p005-20261116-01': (5, 8388608, 2097152, 'bc0a02f502999735df3a78faf36bcaf57a6f95745ca7f7e497a4537489891afa'), 't45-r3-final33-standard-p006-20261116-01': (6, 10485760, 2097152, 'edd7e33afe032dfc787606f8d33510a3205fa14db7002c188e9e54d12f1f7dbc'), 't45-r3-final33-standard-p007-20261116-01': (7, 12582912, 2097152, 'be1140f9d9da90df9aee0530d2cf3acd3d48d177444696c4e602835ba9c76db3'), 't45-r3-final33-standard-p008-20261116-01': (8, 14680064, 2097152, 'f139abf77a3e4279613e44c5a80a43b158d6590a45a4f7e89c8a957a2af2167d'), 't45-r3-final33-standard-p009-20261116-01': (9, 16777216, 2097152, '8661b270f4ac1da7c8b3f94e4a48faf3b4bd35a1c180e38e2de929e327fe24c6'), 't45-r3-final33-standard-p010-20261116-01': (10, 18874368, 2097152, '798c4f342677dd36c2a1a12e2f6693d6087492e29bac06edc4e57deeab8cdb2f'), 't45-r3-final33-standard-p011-20261116-01': (11, 20971520, 2097152, '929b04cd5f43b6c5f3de31899451992d7d4b27b6acfdb5a564fdadade7c9ea6f'), 't45-r3-final33-standard-p012-20261116-01': (12, 23068672, 2097152, 'ee33ebe60dbfbeb31648d5c9724afedf9190321076d1c8712a4084191510b9a5'), 't45-r3-final33-standard-p013-20261116-01': (13, 25165824, 2097152, 'e1c0ee49ff7e5ab8e761d937a6377e331a7bc88b54664f7363c93a3da25cf53c'), 't45-r3-final33-standard-p014-20261116-01': (14, 27262976, 2097152, 'e7d2d206a51314772984b560c2866b409d451069af61945bd3e991ac36c1fb4b'), 't45-r3-final33-standard-p015-20261116-01': (15, 29360128, 2097152, '1d7414174ad6fec97f145809f89eb7420b10c8711b50fb471776d99b8d4ea9c3'), 't45-r3-final33-standard-p016-20261116-01': (16, 31457280, 2097152, 'ba9a3d498215f8dde21b3388a4765ff5acb17c9f11258c188abceda88aed9293'), 't45-r3-final33-standard-p017-20261116-01': (17, 33554432, 2097152, '5df1f4a5c48a9baed6ee2cd640253725fa7b1dfd7d4792848cbd8a15116d0564'), 't45-r3-final33-standard-p018-20261116-01': (18, 35651584, 2097152, '1f0f13fba6c7ae5283937a13705194eb6580002e5b35b27468da03f5fe2b17f4'), 't45-r3-final33-standard-p019-20261116-01': (19, 37748736, 2097152, '15ce02f4250e1e8311ef6eed29ce8e3571b0db2af2af095b3792d466022fa57a'), 't45-r3-final33-standard-p020-20261116-01': (20, 39845888, 2097152, 'e6ff31159999548c67aa34171651a57ec5d53da4ffb02eef906d856d06df68dc'), 't45-r3-final33-standard-p021-20261116-01': (21, 41943040, 2097152, '09315443bea97d16f71fa8e4831702a2e5947f6d69cceff02c51b808f3bc8979'), 't45-r3-final33-standard-p022-20261116-01': (22, 44040192, 2097152, 'fea9906a7bb3e6db8c9bef3cb221aef3adc1af35c272f8ffe65d8d9e497a437c'), 't45-r3-final33-standard-p023-20261116-01': (23, 46137344, 2097152, '0b20336f6e5136540daeabd42d6d8041a52a07cf248384c948b2493fa65d2cc6'), 't45-r3-final33-standard-p024-20261116-01': (24, 48234496, 2097152, '8d5e78df7d2c986c754c1a9ad2af4a5af0ec48c45f078b3a14e232163bfaede1'), 't45-r3-final33-standard-p025-20261116-01': (25, 50331648, 2097152, '916c408d9079aa420ca99ec2e9d631cc482520cc51f66b4966770a3a0125eb6d'), 't45-r3-final33-standard-p026-20261116-01': (26, 52428800, 2097152, '04edf3f67cc1061a514c845c55eb87cf53fca010924c9dfc38fc102646777ebe'), 't45-r3-final33-standard-p027-20261116-01': (27, 54525952, 2097152, 'f2017c3c0b268821948b3a9f648c0778728feecc979dae925b7ed94b512408f8'), 't45-r3-final33-standard-p028-20261116-01': (28, 56623104, 2097152, 'e6b5b6163eb5afbb99e63d687a7fd5e59718ee50e899e92b0a10c4e734b1c753'), 't45-r3-final33-standard-p029-20261116-01': (29, 58720256, 2097152, 'ca921595a196192d6b7ee0dec55b3e12d1da4a19682f9850e1913ff9ce9c7018'), 't45-r3-final33-standard-p030-20261116-01': (30, 60817408, 2097152, '64a2cae8aa5b00f8a50e4daa862a36af4c9a62b9f1ecfb5f95bdc79a051d19ac'), 't45-r3-final33-standard-p031-20261116-01': (31, 62914560, 2097152, 'e50d2e5f1cad7995dd5dc11cffe43c8798d269e8ac3d0a1b6ae805bea7839146'), 't45-r3-final33-standard-p032-20261116-01': (32, 65011712, 2097152, '0fba290e956aa1c474e759914eaf3de56ad241355b1f3474176c35cd0195f0bb'), 't45-r3-final33-standard-p033-20261116-01': (33, 67108864, 2097152, 'b979b7f2673f74fe5eea5d91f3f41a00ab82d533ff5716afa35a83ca7cc3813d'), 't45-r3-final33-standard-p034-20261116-01': (34, 69206016, 2097152, '5a42f641db579e7e0fbfdf2dba384e7d74840a49494f350555ff79929afec9fd'), 't45-r3-final33-standard-p035-20261116-01': (35, 71303168, 2097152, '6f5c4247ac3dc07eed8260897556e8429e6fe493816b9e804adda1728a825057'), 't45-r3-final33-standard-p036-20261116-01': (36, 73400320, 2097152, '96f3454870caf1f40eb39ecaabeff7cf73da8528da9758711a7769ac1947965d'), 't45-r3-final33-standard-p037-20261116-01': (37, 75497472, 2097152, 'f40939a966f212d5efb96c7e9f919d8ad6e803c382479497c104c0101b58de7b'), 't45-r3-final33-standard-p038-20261116-01': (38, 77594624, 2097152, '04c7b974f5e7cf25235cab8aecb64b24b211e06152042eb0f4a0ca62113c789b'), 't45-r3-final33-standard-p039-20261116-01': (39, 79691776, 2097152, '46b7ac4d7fa528a761329f4490c49b44abe11f65761ea975448c4de8ad4c2f89'), 't45-r3-final33-standard-p040-20261116-01': (40, 81788928, 2097152, '6dd92c8657ecd8d8d3709ac220e7d7ba9d7dbec100e60fddd0ecc95b9dbf1102'), 't45-r3-final33-standard-p041-20261116-01': (41, 83886080, 1639564, 'eadac971317a0542d242cf5eb8c1d07b695608851231a6b6934d53dadaf79f28'), 't45-r3-final33-evidence-p001-20261116-01': (1, 0, 2097152, '59a5dd93ed9266dae8344fbade5b82487b3791b3249abab5f4ddb44a46a8490e'), 't45-r3-final33-evidence-p002-20261116-01': (2, 2097152, 2097152, '373405de0d47614c2803a459ec5e00c52c09e023763caea2ca2ad00897995838'), 't45-r3-final33-evidence-p003-20261116-01': (3, 4194304, 2097152, '914dc21f43dd456aed02c7045cbd4d0b17a5fc2c08a7cef19c350b2f25f68eb3'), 't45-r3-final33-evidence-p004-20261116-01': (4, 6291456, 2097152, '6efa22028f2af73274dd63890d605e09b1c8d8e2a245f325d6151553a92fffe4'), 't45-r3-final33-evidence-p005-20261116-01': (5, 8388608, 2097152, 'b0c7855d35743946f8202bf68a51e8cdf8d557b62df1ba4e5b3610f60c3c738e'), 't45-r3-final33-evidence-p006-20261116-01': (6, 10485760, 2097152, '60b324e161221c15ae58606d9a210c7ece424f0324628e7e09ff2d3752950651'), 't45-r3-final33-evidence-p007-20261116-01': (7, 12582912, 2097152, '1f859546b667614148f9949201aecaf1a366e418d3718f53a1c930630f658bf2'), 't45-r3-final33-evidence-p008-20261116-01': (8, 14680064, 2097152, '3ff75522772511685cd4c44fdf7700e3a6bee0db97d1c62a4388a807cb134f21'), 't45-r3-final33-evidence-p009-20261116-01': (9, 16777216, 2097152, '59de80a494a5941c2ce357a4fc0c92644673a9c6175313bb4e0874af1a20dd54'), 't45-r3-final33-evidence-p010-20261116-01': (10, 18874368, 2097152, '011d77f501402a38939d4da3ffa0d3ac7691fad921d06a1ab5fa6bb35f26ed51'), 't45-r3-final33-evidence-p011-20261116-01': (11, 20971520, 2097152, '0033262074a51c571472ed8fae3d25e91113af9e91e5a44f9b6051b5b8b3555b'), 't45-r3-final33-evidence-p012-20261116-01': (12, 23068672, 2097152, '30fd482705933db35117e2915ed100bc1cd6f4739471c4355d415d75ace11096'), 't45-r3-final33-evidence-p013-20261116-01': (13, 25165824, 2097152, 'b75cb6c0ca46f7ac6fb9290e9f6c1ca6696b678dfe3d9e0ffb56e73f1d55bcbd'), 't45-r3-final33-evidence-p014-20261116-01': (14, 27262976, 2097152, '9e81e9ca76f24cf8ac680737b568e0481f2958607578c95fee7d6b407eff43f4'), 't45-r3-final33-evidence-p015-20261116-01': (15, 29360128, 2097152, '5470a372cc3a54da5288cbf0d9264d5d1052f4ad0839bc30ddfd92baa354ac93'), 't45-r3-final33-evidence-p016-20261116-01': (16, 31457280, 2097152, '9aad166781ce378dc1163a5ec7145f45a5014f1db79b574313c7d6013d50868f'), 't45-r3-final33-evidence-p017-20261116-01': (17, 33554432, 2097152, '2aa1d4e1036e492f92047428ba14430887621e170ad899bb79a2c03651e801a0'), 't45-r3-final33-evidence-p018-20261116-01': (18, 35651584, 2097152, '5cc772c0758b646f00ebd4235359f0a5a57a256298b32f1ed4037a497cb29508'), 't45-r3-final33-evidence-p019-20261116-01': (19, 37748736, 2097152, '8d3d5d453df8dd2ec2c358eb3a2ccc05e364b586d55fa33980788d075e994271'), 't45-r3-final33-evidence-p020-20261116-01': (20, 39845888, 2097152, '711c37b3b5d618c9fb34a43d571cb1b5f1bb2959f571af5e378d400f4b072223'), 't45-r3-final33-evidence-p021-20261116-01': (21, 41943040, 2097152, '5e3759034060edc7a32ea3cb19f726ad5600112a6c796efb034ee3059ea67ab5'), 't45-r3-final33-evidence-p022-20261116-01': (22, 44040192, 2097152, '78dd3045965c213c4048ff5f9d59371e9e8f4c287cc9cc21dc39b0a17319399c'), 't45-r3-final33-evidence-p023-20261116-01': (23, 46137344, 2097152, '8b54137461d41396771a58d709f94fd8b329213c29a397e22ea913b339183bd3'), 't45-r3-final33-evidence-p024-20261116-01': (24, 48234496, 2097152, '651e316d4caf65a139b8760883659794e2f1ce5e494452d86bb7fce21910f92f'), 't45-r3-final33-evidence-p025-20261116-01': (25, 50331648, 2097152, '050fbf1fac460f0105854cb4bee30f6397051ae119cbfd19bd3e5a7afc1c67d6'), 't45-r3-final33-evidence-p026-20261116-01': (26, 52428800, 2097152, '562d8a44486aeb7da286cd9662b8e1e93fdeaa844ace6aa4107b37fdc5e5c01b'), 't45-r3-final33-evidence-p027-20261116-01': (27, 54525952, 2097152, 'fcf5e854b89e5bcc9287374f88831d5a34a8264cd25ff8a81f754a73a47215c8'), 't45-r3-final33-evidence-p028-20261116-01': (28, 56623104, 2097152, 'fd6d7873b40aa3c9338819e9987650dc15589e7f1f4fa9a9f1cbdb1f20155f2d'), 't45-r3-final33-evidence-p029-20261116-01': (29, 58720256, 2097152, 'af600cb767ad96ba5ca85ffe958b4cd5545f17688fe5ca991e9fa65b69943f89'), 't45-r3-final33-evidence-p030-20261116-01': (30, 60817408, 2097152, 'c046bf83cc8e8ba8d30092550fec1b36c628dd79c608c2279159f393ba06f21f'), 't45-r3-final33-evidence-p031-20261116-01': (31, 62914560, 2097152, '3f73f6f810fab0a660b94d4ae4f2a721903f8b5832ef5a56675dd880881f1f53'), 't45-r3-final33-evidence-p032-20261116-01': (32, 65011712, 2097152, '9c95c5d0b0ae24c77c9e447ae58cf1510c74394cc23d0f015ad3e73a0d5e6c5d'), 't45-r3-final33-evidence-p033-20261116-01': (33, 67108864, 2097152, '96517d07e5146002e2cd07320c4552ae3703c8ad228a4fda7d644732d742b4f8'), 't45-r3-final33-evidence-p034-20261116-01': (34, 69206016, 2097152, '1b3c969e3d02b91908e75b38b7c341cdfd7482014cb236e2a9f9c5c61900adf7'), 't45-r3-final33-evidence-p035-20261116-01': (35, 71303168, 2097152, '87d8a8fb2588be31ae94c949e669a75220b6d3298290df58a64f5e911f933a3f'), 't45-r3-final33-evidence-p036-20261116-01': (36, 73400320, 2097152, '90899b298ef4bc75fd98bd9d18ed0c3e65738a85a675b4b7ebe01108284687f4'), 't45-r3-final33-evidence-p037-20261116-01': (37, 75497472, 2097152, 'cad40995f688f72e8e3dccb6f2197903a64e74e7bfa88616ca17998a59c6631e'), 't45-r3-final33-evidence-p038-20261116-01': (38, 77594624, 2097152, '505743d2e67ea6739811653e0007e5ce5c58aee68c831f3d3d2999e7b2858eb1'), 't45-r3-final33-evidence-p039-20261116-01': (39, 79691776, 2097152, '856443f690b72a0cd64eadf61194040d6cb6f6340a8434626557e01065dca4dc'), 't45-r3-final33-evidence-p040-20261116-01': (40, 81788928, 2097152, '9bcae29e7ff9b20083409967641646e4521aa715b49909d1f5f561bab6f80268'), 't45-r3-final33-evidence-p041-20261116-01': (41, 83886080, 2097152, 'fd4809c0e3f53ac3987356f7a18eb83763c99169d1a9f7e23b8f0308a7ce9b1a'), 't45-r3-final33-evidence-p042-20261116-01': (42, 85983232, 2097152, 'd8f5e8a8753e86ede4bbe0e9207b5938abc3b25652349985f43127a36a546d87'), 't45-r3-final33-evidence-p043-20261116-01': (43, 88080384, 2097152, '05d59472edaab8b2a7b759e806b2847e38cfea0943d932ee920b73e29ee8461b'), 't45-r3-final33-evidence-p044-20261116-01': (44, 90177536, 2097152, '7b3a72695b3a24e87b9aeda59ce2bf66db6c08fa0bef6fc4d6126c00aa286d5c'), 't45-r3-final33-evidence-p045-20261116-01': (45, 92274688, 2097152, '3ffc7e5be218b95a9040e76376a9f6779fe338aa89b8735b6e8effe80bf68bc0'), 't45-r3-final33-evidence-p046-20261116-01': (46, 94371840, 2097152, '7c4e8c7447b51dd9ba87fea0cb7cf658bdafe0260a77cdabbd89ec98cd7f8543'), 't45-r3-final33-evidence-p047-20261116-01': (47, 96468992, 2097152, '86f0b45f6e3958d8780d46d0334fc93240f4998a046c4377a90785d3be1830ee'), 't45-r3-final33-evidence-p048-20261116-01': (48, 98566144, 2097152, '640073561880a5afa1916dc33e465e8104daa92331a4b9082f4279474c8f6a74'), 't45-r3-final33-evidence-p049-20261116-01': (49, 100663296, 2097152, '2bbdede8ca75d97f3a707425ab3454352425b2d9f250e90e7193d8ebc6e51e3e'), 't45-r3-final33-evidence-p050-20261116-01': (50, 102760448, 2097152, '469713d003c87ae89cfbb99903de4891b5e12dba8361a3c8762f1d245d37fa71'), 't45-r3-final33-evidence-p051-20261116-01': (51, 104857600, 2097152, 'a66d47fc971711ba1169fe1a36a6fff1c3c981c891216af983ca0d60785e30ca'), 't45-r3-final33-evidence-p052-20261116-01': (52, 106954752, 2097152, 'a2b05fa509a5d8ecb42c25fc77352dfc9b891ee28dd6924e00e7bd5710e94498'), 't45-r3-final33-evidence-p053-20261116-01': (53, 109051904, 2097152, '1e3c7f005b553fffb7cebc2743330d82714f2e1db6679a4d7ed6f25d367356d2'), 't45-r3-final33-evidence-p054-20261116-01': (54, 111149056, 2097152, '08ba3b2a4ef2b9ac0c3a42abaf06206a0232cbaa0b6a5e4cedae7c3c85519cfd'), 't45-r3-final33-evidence-p055-20261116-01': (55, 113246208, 2097152, '0d6a7c22a0a314bbadc9b3ee2ac4916c894abe15b635e9835580ec5414208998'), 't45-r3-final33-evidence-p056-20261116-01': (56, 115343360, 2097152, '3e3b0b65c3b7daf199fb1f5fa090d32ad645db6da788dd89c01222b081917ff5'), 't45-r3-final33-evidence-p057-20261116-01': (57, 117440512, 2097152, '7c6516b701b5583f749ca25ff3bfd4353a85095fac639ca7f631f94fd202f061'), 't45-r3-final33-evidence-p058-20261116-01': (58, 119537664, 2097152, '491a7f51d95414ead8f3cc73df44697d74f03bff392447fe5730b3c75cee9862'), 't45-r3-final33-evidence-p059-20261116-01': (59, 121634816, 2097152, 'dcdb7cac217985d01e2b5b838db9d70e5d08a3b131bcbcfac9a8c467c15d69e0'), 't45-r3-final33-evidence-p060-20261116-01': (60, 123731968, 2097152, '1b0c00fb39e681a946c4e8b79682ef80e998fd8f4fc45cb508ba79007fed8cae'), 't45-r3-final33-evidence-p061-20261116-01': (61, 125829120, 2097152, '4b256a6512037b31d0e9737ff7a7c908b36eb8e18a8dae6316e6e95509695d73'), 't45-r3-final33-evidence-p062-20261116-01': (62, 127926272, 2097152, 'd158c8ab231c3eb0db6d4791159a63f311d82e6175db1921117fc8404681f363'), 't45-r3-final33-evidence-p063-20261116-01': (63, 130023424, 2097152, 'ea91775107e1b020961602f7bc0fe39c0aa1f1adca780efa6fec29082af0d39c'), 't45-r3-final33-evidence-p064-20261116-01': (64, 132120576, 2097152, '23a35d6ee32b9a4099686facb5f039232e8497d1d659d8375b92a2f66835f868'), 't45-r3-final33-evidence-p065-20261116-01': (65, 134217728, 2097152, 'eda487a88eb8cf8c7217e8c2a758b0f1fbb75127bbbdbb971840616482af02ad'), 't45-r3-final33-evidence-p066-20261116-01': (66, 136314880, 2097152, '55554d5ca392d1fadbc96d08f6ed71e1adf2a9f7d4e00c9e78ba0ae42678641e'), 't45-r3-final33-evidence-p067-20261116-01': (67, 138412032, 2097152, '2c675a87f5c8f18e92134e9e75a7adf645ac951bae80990014a6abd73168c0c8'), 't45-r3-final33-evidence-p068-20261116-01': (68, 140509184, 2097152, '23356e65822f9c8c3159ebc76c1507516d1b390e8e0bde3ddab698b226e50566'), 't45-r3-final33-evidence-p069-20261116-01': (69, 142606336, 2097152, '116c40fd8b5e3c744fafafacc18f7522c132a5e49d45a1bd2b6dc2bec66e8727'), 't45-r3-final33-evidence-p070-20261116-01': (70, 144703488, 2097152, '5e59ee583a249d8f58c7f9802fd52f1ce4cbd7cddbfc36f148b4ce6ad6a24b58'), 't45-r3-final33-evidence-p071-20261116-01': (71, 146800640, 2097152, 'a28a4a11c5a5eecc0d1b17d3d370edd8a0e68a7a309e5a60464b6d0cccd1d95f'), 't45-r3-final33-evidence-p072-20261116-01': (72, 148897792, 2097152, '7c4207ad748410c271e9dc3f620d264e5cc76f4915657883d95cff13fe2ec87a'), 't45-r3-final33-evidence-p073-20261116-01': (73, 150994944, 2097152, '4dda3a83e2898773117522df23680869c7e276023c436970f4b416aa880b623f'), 't45-r3-final33-evidence-p074-20261116-01': (74, 153092096, 2097152, '103214b757d2ae236b4e5a1e15dd12458bf69299cf3f915694bb30804f812a54'), 't45-r3-final33-evidence-p075-20261116-01': (75, 155189248, 2097152, '0b7babd08e0f40cde8f8e152db1a75e00ad743cfbeec99a689b1d958b61d0c5b'), 't45-r3-final33-evidence-p076-20261116-01': (76, 157286400, 2097152, 'a594c9b7163cc1cddb63c27ca64a1b05351500085d3bdbfffae8761dfcac203b'), 't45-r3-final33-evidence-p077-20261116-01': (77, 159383552, 2097152, 'a33bba9c2f0cecfccd3bdceb5fdbde30be8f0902ad7a8be90e71e3b633c9c198'), 't45-r3-final33-evidence-p078-20261116-01': (78, 161480704, 2097152, '9d7c11ae71e1f0b37174c8a7f2b9d79abfc17a147f6eca28a92e9933b0943dce'), 't45-r3-final33-evidence-p079-20261116-01': (79, 163577856, 2097152, 'c091ac727f05f9a80599d1dd6dcc64ab97893151dabfcc7028d43000aa8eef30'), 't45-r3-final33-evidence-p080-20261116-01': (80, 165675008, 2097152, 'c0347cd9458677b66c65cfddc3713658d43d789078ef2f8741332eea6a1a8cb7'), 't45-r3-final33-evidence-p081-20261116-01': (81, 167772160, 2097152, 'fcb7daae997626822be908c6c22c8ecf32401feb8f8c2cc4c0f74f89c42a262f'), 't45-r3-final33-evidence-p082-20261116-01': (82, 169869312, 2097152, 'b013cfd5fe741fd9ebaa6645d42117039b887991ea7ea1593758b3247728a06a'), 't45-r3-final33-evidence-p083-20261116-01': (83, 171966464, 2097152, '39c6d9113cf57c7c35a3f30ad3f0e956ac9d3d9f7bd61ab17a3e142d7c3304ec'), 't45-r3-final33-evidence-p084-20261116-01': (84, 174063616, 2097152, 'a2f7faca36eeb56a23d55060d6605ab2c0ffbf7b89a96271965484745aa54227'), 't45-r3-final33-evidence-p085-20261116-01': (85, 176160768, 2097152, '7c3ac026c9ee3cbf97b0e927479c3e41799cdfe36917a9ef8ad23f7944f8998c'), 't45-r3-final33-evidence-p086-20261116-01': (86, 178257920, 2097152, '637f92add9769ccfb1cc6ed2323a40b59f18be0e461253022cf732d33172622f'), 't45-r3-final33-evidence-p087-20261116-01': (87, 180355072, 2097152, '2274ca9dc27582abb2c6437fb4596504c7e168e8616564d8c7db4dd8dc4249c3'), 't45-r3-final33-evidence-p088-20261116-01': (88, 182452224, 2097152, 'd774f37445cc8ff0431a5da93f7a00d8d522d686aabfc4d56096d63c8acaa3ad'), 't45-r3-final33-evidence-p089-20261116-01': (89, 184549376, 2097152, '233fad1b641bff72ba5d625e32c889abaf258232beff09d9b1b0cc5333912ad4'), 't45-r3-final33-evidence-p090-20261116-01': (90, 186646528, 2097152, '6b73f502a3879718c2bd006ce803556116767e7c2bb06da9500f179f979f2e3e'), 't45-r3-final33-evidence-p091-20261116-01': (91, 188743680, 2097152, '69ad92532435f4ec8856eee7c8b27a6cdb5cca1e3c10d9941a6a17b7409e900e'), 't45-r3-final33-evidence-p092-20261116-01': (92, 190840832, 2097152, 'd84957950f90cbedc549c95741e4921d7df3b9f3835d3c5165ca1b8049e46f56'), 't45-r3-final33-evidence-p093-20261116-01': (93, 192937984, 2097152, '697a852ee784902634bd3db7824b92e6a067a6ff74935562262195595245d2ff'), 't45-r3-final33-evidence-p094-20261116-01': (94, 195035136, 2097152, 'abda5f0e623d4ee710d46766b8ee21578e1ee6afebce9855714da13c9125f083'), 't45-r3-final33-evidence-p095-20261116-01': (95, 197132288, 2097152, '57f8ca1feea6c49483d44bc166d239d49bb3002af3e108c3681a97480b747137'), 't45-r3-final33-evidence-p096-20261116-01': (96, 199229440, 2097152, 'a2ea99a718e9fc0ba961e8b2e703ed8900ad134bf280600787729fa088d0a3f4'), 't45-r3-final33-evidence-p097-20261116-01': (97, 201326592, 2097152, '05053dd4dd552a6345f0cc37126b8ab9b99a1c124642a7121f1da6f2b1bd10ad'), 't45-r3-final33-evidence-p098-20261116-01': (98, 203423744, 2097152, '35e27ffb09387930d58a8be0d3311411b2d0ed7c64d6b119811b16c156c48c22'), 't45-r3-final33-evidence-p099-20261116-01': (99, 205520896, 2097152, 'd437c9a54837e6e1b2b9c04ff457989ab7854545f5c98b74705b66f108617d1d'), 't45-r3-final33-evidence-p100-20261116-01': (100, 207618048, 2097152, 'c52bdfb80e9e0327be661340cb96669d049b9a6f6570a02b7370d881d3ec214b'), 't45-r3-final33-evidence-p101-20261116-01': (101, 209715200, 2097152, 'a2f4a1df72a3e94a6d55d93c7b21c0dc078d111cf51688480798440989a452b0'), 't45-r3-final33-evidence-p102-20261116-01': (102, 211812352, 2097152, 'c923231e5c99ed873f5b576de6d818dbb68e3937d2f206ff669b9c7ed005590e'), 't45-r3-final33-evidence-p103-20261116-01': (103, 213909504, 2097152, '336c31079c7dfa438818ca88515440df23f19b02e656a8420c96499cb3bad5f6'), 't45-r3-final33-evidence-p104-20261116-01': (104, 216006656, 2097152, '5b6939dcce2fe32276467370b7e4a4482aaa81a1f0b8618383a9fe482974784a'), 't45-r3-final33-evidence-p105-20261116-01': (105, 218103808, 2097152, '612b4dce5b679cb0a480d716954ce831ac1ca69a00871368234e7ac80649bbea'), 't45-r3-final33-evidence-p106-20261116-01': (106, 220200960, 2097152, '558be88478681c71148ef7847846575e9e085e1270b5ae52f14884c2317052b6'), 't45-r3-final33-evidence-p107-20261116-01': (107, 222298112, 2097152, '1cdfa8a02d258383c15e125aae9b91c8e95d841ffec9e5c08ae2477a3595958b'), 't45-r3-final33-evidence-p108-20261116-01': (108, 224395264, 2097152, '9145ab28c6f7a5bc961a5809adaa45138fae0ad8c8fea8122b6af5e23fadd6a5'), 't45-r3-final33-evidence-p109-20261116-01': (109, 226492416, 2097152, 'a8a8f954293ed8fc35f40778cc33c3202cc42e7dc28bcc4afe1456bcc58fe564'), 't45-r3-final33-evidence-p110-20261116-01': (110, 228589568, 2097152, 'e6bb7a31210661885cb02448fcc7ff3039ffb7ecec6e86e1743761b7d0a3b917'), 't45-r3-final33-evidence-p111-20261116-01': (111, 230686720, 2097152, 'af3b8be0c5b0c8421e1aea4c83763c459d2d207471e83afc26252e3c49688ecc'), 't45-r3-final33-evidence-p112-20261116-01': (112, 232783872, 2097152, '758baa481270bd17e1d1c20e3fc37c73210c3fcc8c26d389749b3f4c7ea49026'), 't45-r3-final33-evidence-p113-20261116-01': (113, 234881024, 2097152, '6c56b44d3ca4886006a5dde2de2928c3d6f5693a92fd04e7f5677e5c500fc607'), 't45-r3-final33-evidence-p114-20261116-01': (114, 236978176, 2097152, '37d137de7bce610899a57c41d52796b67dce2da94f26ba03372aad72304f0c19'), 't45-r3-final33-evidence-p115-20261116-01': (115, 239075328, 2097152, '96b8cea0a15547e21a5ad640196655d1382d50e6d672a3c550f3ea45ec04fc23'), 't45-r3-final33-evidence-p116-20261116-01': (116, 241172480, 2097152, 'b4f4c5c4bd4e03fb3e735aaaa93c416dd07af9f67f1216f0ceb77e7344a39ba0'), 't45-r3-final33-evidence-p117-20261116-01': (117, 243269632, 2097152, 'fed162248ee1fa293687631029536da78cb4abc611fa50866495116c236c247e'), 't45-r3-final33-evidence-p118-20261116-01': (118, 245366784, 2097152, '244c25440fdb49428cb9bc8e261de1d651e7bf0023cda334a0d8b69f4ac87772'), 't45-r3-final33-evidence-p119-20261116-01': (119, 247463936, 2097152, '4d0960131f2dc97a8e16680d93338d57670f28132c3f143eea883ad904348359'), 't45-r3-final33-evidence-p120-20261116-01': (120, 249561088, 2097152, 'cc563b7dd98936aa5d7047d165ac7a8d3e7395f90718944a80cefb7ac8109c2d'), 't45-r3-final33-evidence-p121-20261116-01': (121, 251658240, 2097152, '6bcf15873f17af1dcd50d3501cf4365b48d51f3ddd80370205d41069c5115e89'), 't45-r3-final33-evidence-p122-20261116-01': (122, 253755392, 2097152, 'f4cd3ee9052d0e2ffc790a99b115ccf8f2658bbed9375e9f98f5d7ad7debdc78'), 't45-r3-final33-evidence-p123-20261116-01': (123, 255852544, 2097152, '30875d20007301b47c4c55e78be755af069cdb3bae32265ebd3dc179b3fb583e'), 't45-r3-final33-evidence-p124-20261116-01': (124, 257949696, 2097152, '731b4fa0733d2809f50354773b158ffa802bb591087802e5922f2301a08e18ab'), 't45-r3-final33-evidence-p125-20261116-01': (125, 260046848, 2097152, '25830e25e369e080199e4f4bdd79d4b2e8156ec49ed5829d149d6696c50ad703'), 't45-r3-final33-evidence-p126-20261116-01': (126, 262144000, 2097152, '9e7f675418fb342cea85a56314a8224b39f109c7715388cd4497186265c82c2b'), 't45-r3-final33-evidence-p127-20261116-01': (127, 264241152, 2097152, '79be579ed610232f3d9703f4fce3657dc3854b0c16f77aad88c6243c0c15d11e'), 't45-r3-final33-evidence-p128-20261116-01': (128, 266338304, 2097152, '6dc6b384cf91fb00dccecd90ede82cb1bc49ce4ad9373297d42b8c26c3d084be'), 't45-r3-final33-evidence-p129-20261116-01': (129, 268435456, 2097152, '71628d3a7c96d3bce96e17b983068d6030871ef0bbeab23445e49d7095ea5745'), 't45-r3-final33-evidence-p130-20261116-01': (130, 270532608, 2097152, 'f133186c07352fb2e480a2d6f63b995e69b5429cba2700e1d6ba4c76461e32f9'), 't45-r3-final33-evidence-p131-20261116-01': (131, 272629760, 2097152, '7f57fed5a94d7299950b39e2e7872e4d9a5a8ea812d6a055e3fac2fe36e6ee64'), 't45-r3-final33-evidence-p132-20261116-01': (132, 274726912, 2097152, 'd2c91e482d4c375f940590fb3b740eb3619b0253974f0afdab41f4acb425d169'), 't45-r3-final33-evidence-p133-20261116-01': (133, 276824064, 2097152, '6625a24c1a21356ba4c999fca00ecc58e91b83d3fb8752f79e8663b900ee1efd'), 't45-r3-final33-evidence-p134-20261116-01': (134, 278921216, 2097152, '162e9dcfad5fbc68769f6cd87bb88fc2003a662984fbe3c368223a979eff5835'), 't45-r3-final33-evidence-p135-20261116-01': (135, 281018368, 2097152, '343c3bd52f7052b169dcc39008bd3c533a4669d512627d3d2b11759f0c5c78b7'), 't45-r3-final33-evidence-p136-20261116-01': (136, 283115520, 2097152, '884f782071bc3916286fde6ae8d86dacb3913a6ebbb9019ab2c04dfa84ffb33d'), 't45-r3-final33-evidence-p137-20261116-01': (137, 285212672, 2097152, '5713872dce8e464bb6edc5e08814c1f7409546d886a882cb45b143b975365ca8'), 't45-r3-final33-evidence-p138-20261116-01': (138, 287309824, 2097152, 'ce03ac2d89b4a078d53ce302ade45f4c1d4aff8c4d26d66580e51e66ef4d9716'), 't45-r3-final33-evidence-p139-20261116-01': (139, 289406976, 2097152, 'fd9cf90a39a8a39888f340af9daac8fd25c9813b36cc1d4e6174a1a997246c2a'), 't45-r3-final33-evidence-p140-20261116-01': (140, 291504128, 2097152, 'e163ddb06ecaa7ed63c614f2bdfd26cd6352846d91088b76ef7a6bba38370b95'), 't45-r3-final33-evidence-p141-20261116-01': (141, 293601280, 2097152, '23bfbc6e0cb3a3bb1e62bd9f0cb532feae51ddb1966a702732ccd5593b3854e1'), 't45-r3-final33-evidence-p142-20261116-01': (142, 295698432, 2097152, 'c1d4746f26d4bc0fedf583af7a635835dead67a44b5510ef3df8f8f4140b8f1a'), 't45-r3-final33-evidence-p143-20261116-01': (143, 297795584, 2097152, 'fa29b66f8a0e006bcd7e00edad2ea5ecb7440b4504ccdecb5c26a20ce48f18c2'), 't45-r3-final33-evidence-p144-20261116-01': (144, 299892736, 2097152, 'f16b8e33b8b14098a02eab10c92f721504b8b0191bb518a098a91ad6306937b7'), 't45-r3-final33-evidence-p145-20261116-01': (145, 301989888, 2097152, 'a301ae28f655d4938851e2afbf62f198909e37a55ef3594ad46d3761e1a75857'), 't45-r3-final33-evidence-p146-20261116-01': (146, 304087040, 2097152, 'd3230da42c2f63e773ecf399bf41e84c874e1b3ca87f5e8375961f71f77283d9'), 't45-r3-final33-evidence-p147-20261116-01': (147, 306184192, 2097152, 'cd1825d1ae3da127fc00d19ce485330f208b9d03b132b805cfa5c8540a39465f'), 't45-r3-final33-evidence-p148-20261116-01': (148, 308281344, 2097152, '20902212678fb86eb5c327616f419fa0844a0d125a4badf8bf4b7c48a7cebb7e'), 't45-r3-final33-evidence-p149-20261116-01': (149, 310378496, 2097152, 'cc3cc7e7addde4ca1c8d619dd045f236c31eca3adda4fc724f79c692bfd317ed'), 't45-r3-final33-evidence-p150-20261116-01': (150, 312475648, 2097152, '29dcf09bf74533ae81bf90c97b472fe75a3e7dac755acb46b569496700fdbe63'), 't45-r3-final33-evidence-p151-20261116-01': (151, 314572800, 2097152, 'ce4497860ad87018eba66f67c456f07974f188269b155dfbf7e5f1da49f4bfce'), 't45-r3-final33-evidence-p152-20261116-01': (152, 316669952, 2097152, 'bca899379dc3830581b9b5ad6b1376080c26bfd30ae17698026063457dbd2e8e'), 't45-r3-final33-evidence-p153-20261116-01': (153, 318767104, 2097152, 'fbf063276247dee157856599873c7a9ce71dab064c75863dbcc32359db50cb5c'), 't45-r3-final33-evidence-p154-20261116-01': (154, 320864256, 2097152, '468527ebfec614d900f96371d892a4a6fd52baa80446a98a7b05cad6b7cb43a0'), 't45-r3-final33-evidence-p155-20261116-01': (155, 322961408, 2097152, 'b6c8810b7b7f66734e428d8ea025ca9f4f76d0bd7b9a08cd7724bd1112180b15'), 't45-r3-final33-evidence-p156-20261116-01': (156, 325058560, 2097152, '4bc122617337424282727464f8b99f20dbb5bc9e2f5afe6759d83e1bf3d176b3'), 't45-r3-final33-evidence-p157-20261116-01': (157, 327155712, 2097152, '83ba15e3a8f5faf826e9a5d6d8148c72dde37a44d52ba701c846cdb5b4a220d6'), 't45-r3-final33-evidence-p158-20261116-01': (158, 329252864, 2097152, 'd45645d6efbf3b3aa8f91d927e50876dff4d9a78072299028e487f964f803f84'), 't45-r3-final33-evidence-p159-20261116-01': (159, 331350016, 2097152, '4ccbecb244b29ce75394f2685cefecb03428f22dfec5029aa9095bf6fa8b587f'), 't45-r3-final33-evidence-p160-20261116-01': (160, 333447168, 2097152, '54ed9776e091f2b3c32fe752f5c5c69be8417a073482fea79fdeab182f38c6c5'), 't45-r3-final33-evidence-p161-20261116-01': (161, 335544320, 2097152, '8f7a07a69f0575f1819021185ea7ded345031f231ddc1de33694b8f4ab508438'), 't45-r3-final33-evidence-p162-20261116-01': (162, 337641472, 2097152, 'f0c818a28af2919c81c483b929b27269db4ddb38ff37bc94fe7aa8862b1d01f2'), 't45-r3-final33-evidence-p163-20261116-01': (163, 339738624, 2097152, '02561908cb3114f6536d656856c81cb3b4fc5f1ce9a52d13a9304102d8054c1d'), 't45-r3-final33-evidence-p164-20261116-01': (164, 341835776, 2097152, '0fe53e3f7224655fbeec81bc9df03ef062f426c557634c9a78e32d5c33efe74f'), 't45-r3-final33-evidence-p165-20261116-01': (165, 343932928, 2097152, '05faa51cef34bd790774ddcb7a52538ca1ec8e42bb82d1a0c31870a725cd9807'), 't45-r3-final33-evidence-p166-20261116-01': (166, 346030080, 2097152, '7b151086d5f31776257e9d36fdd643b17af6020bf234aa15167c81df48d2a718'), 't45-r3-final33-evidence-p167-20261116-01': (167, 348127232, 2097152, 'f240eb6dfd92ee3aedb2a636ad7b3041922f9009b17e8ec34d837b03bd58e647'), 't45-r3-final33-evidence-p168-20261116-01': (168, 350224384, 2097152, '2f8ef8b4c50fea83b0f2e80392d50ccf83077ba09ba445baf3cd2f28f95f4fc4'), 't45-r3-final33-evidence-p169-20261116-01': (169, 352321536, 2097152, '41216564986ec3413a1a06f1fdac7c62dc6e9cdeba015200df68697c414e4ba0'), 't45-r3-final33-evidence-p170-20261116-01': (170, 354418688, 998535, '0b5ec0f916bcd5f4afd936253fc4df452baa198587514c2450667d993f3fd625')}

def final33_private_authority(a, control, grant):
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256',
          'archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind',
          'fragmentIndex','fragmentOffset'}
    key=a.get('artifactKey')
    if (set(a)!=keys or type(key) is not str or a['kind']!='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
        or a['format']!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1'
        or a['decision']!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING'
        or a['taskId']!='T45' or grant!='b16447fbc81f4d64' or a['grantId']!=grant
        or control!='/home/naijue/erp-release-20261006-01-control/grant-'+grant
        or a['manifestSha256']!=FINAL33_MANIFEST
        or a['targetDirectory']!=control+'/private-standard-import-data/'+key
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512
        or FINAL33_PARTS.get(key)!=(a['fragmentIndex'],a['fragmentOffset'],a['archiveBytes'],a['archiveSha256'])):
        raise ValueError('FINAL33_EXACT_PRIVATE_FRAGMENT_REQUIRED')

RECOVERY_KEY='r3-final33-recovery-input-20261117-01'
def recovery_private_scope(control, grant):
    if control!='/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64' or grant!='b16447fbc81f4d64':
        raise ValueError('RECOVERY_EXACT_EXISTING_GRANT_REQUIRED')
    return dict(format='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1',
        decision='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING',taskId='T45',grantId=grant,
        artifactKey=RECOVERY_KEY,manifestSha256='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
        archiveSha256='244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d',archiveBytes=40960,
        targetDirectory=control+'/private-standard-import-data/'+RECOVERY_KEY,
        kind='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT',fragmentIndex=1,fragmentOffset=0)
def recovery_private_authority(a, control, grant):
    fixed=recovery_private_scope(control,grant)
    if (type(a) is not dict or set(a)!=set(fixed)|{'startsAt','expiresAt','decisionReference'}
        or not all(a[k]==v for k,v in fixed.items())
        or any(type(a[k]) is not int for k in ('startsAt','expiresAt','fragmentIndex','fragmentOffset','archiveBytes'))
        or not 0<a['expiresAt']-a['startsAt']<=600000
        or type(a['decisionReference']) is not str or not 0<len(a['decisionReference'])<=512):
        raise ValueError('RECOVERY_EXACT_PRIVATE_SCOPE_REQUIRED')

def private_standard_data_authority(a, control, grant):
    if a.get('artifactKey')==RECOVERY_KEY:
        return recovery_private_authority(a,control,grant)
    if a.get('manifestSha256')==FINAL33_MANIFEST:
        return final33_private_authority(a,control,grant)
    if a.get('manifestSha256')==R3_R2_PRIVATE_MANIFEST:
        return r3_r2_private_authority(a,control,grant)
    keys={'format','decision','taskId','grantId','artifactKey','manifestSha256','archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'}
    fragment=a.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT'
    if fragment:keys|={'fragmentIndex','fragmentOffset'}
    if (set(a)!=keys or a.get('kind') not in PRIVATE_STANDARD_DATA_KINDS or
        a.get('format')!='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' or
        a.get('decision')!='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' or
        a.get('taskId')!='T45' or a.get('grantId')!=grant or
        a.get('manifestSha256')!=PRIVATE_STANDARD_DATA_MANIFEST):
        raise ValueError('PRIVATE_STANDARD_DATA_AUTHORITY_SCOPE_REFUSED')
    if (type(a['artifactKey']) is not str or re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',a['artifactKey']) is None or
        a['targetDirectory']!=control+'/private-standard-import-data/'+a['artifactKey']):
        raise ValueError('PRIVATE_STANDARD_DATA_NAMESPACE_REFUSED')
    if fragment:
        index=a['fragmentIndex']
        if type(index) is not int or not 1<=index<=45:raise ValueError('PRIVATE_STANDARD_DATA_FRAGMENT_REFUSED')
        offset,size,digest=PRIVATE_STANDARD_DATA_PARTS[index-1]
        if (type(a['fragmentOffset']) is not int or a['fragmentOffset']!=offset or
            type(a['archiveBytes']) is not int or a['archiveBytes']!=size or a['archiveSha256']!=digest):
            raise ValueError('PRIVATE_STANDARD_DATA_FRAGMENT_REFUSED')
    elif type(a['archiveBytes']) is not int or a['archiveBytes']!=PRIVATE_STANDARD_DATA_BYTES or a['archiveSha256']!=PRIVATE_STANDARD_DATA_ARCHIVE:
        raise ValueError('PRIVATE_STANDARD_DATA_ARCHIVE_REFUSED')

def need(v,k):
 if not v:raise ValueError(k)
def canonical(p):
 need(p.is_absolute() and str(p)==os.path.normpath(str(p)),'ARTIFACT_CANONICAL_PATH_REQUIRED')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(not stat.S_ISLNK(s.st_mode),'ARTIFACT_SYMLINK_REFUSED')
 return p
def read_regular(p,limit,root=False):
 canonical(p);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=limit,'ARTIFACT_REGULAR_INPUT_REQUIRED')
  if root:need(s.st_uid==0 and s.st_mode&0o022==0,'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
  b=os.read(fd,limit+1);z=os.fstat(fd)
  need(len(b)==s.st_size and (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns),'ARTIFACT_INPUT_CHANGED')
  return b
 finally:os.close(fd)
def authority():
 g=context['grantId'];need(re.fullmatch('[a-f0-9]{16}',g),'ARTIFACT_GRANT_REFUSED')
 control='/home/naijue/erp-release-20261006-01-control/grant-'+g
 need(context['control']==control,'ARTIFACT_CONTROL_REFUSED')
 p=Path('/usr/local/lib/naijue-erp-night/grant-'+g+'/artifact-staging-authorization.json')
 for q in [*reversed(p.parents),p]:
  s=q.lstat();need(s.st_uid==0 and s.st_mode&0o022==0 and not stat.S_ISLNK(s.st_mode),'ARTIFACT_ROOT_AUTHORITY_REQUIRED')
 raw=read_regular(p,65536,True);need(hashlib.sha256(raw).hexdigest()==context['authoritySha256'],'ARTIFACT_EXTERNAL_AUTHORITY_DIFFERS')
 a=json.loads(raw);need(a==context['authority'],'ARTIFACT_AUTHORITY_BINDING_DIFFERS')
 private=a.get('kind') in PRIVATE_STANDARD_DATA_KINDS
 if private:private_standard_data_authority(a,control,g)
 else:
  need(set(a)=={'format','decision','taskId','grantId','artifactKey','sourceSetSha256','archiveSha256','archiveBytes','targetDirectory','startsAt','expiresAt','decisionReference','kind'},'ARTIFACT_EXACT_AUTHORITY_REQUIRED')
  need(a['format']=='T45_ORDINARY_ARTIFACT_STAGING_V1' and a['decision']=='AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING' and a['taskId']=='T45' and a['grantId']==g and a['kind']=='ORDINARY_SOURCE_AND_TOOLS','ARTIFACT_AUTHORITY_SCOPE_REFUSED')
 need(type(a['artifactKey']) is str and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',a['artifactKey']),'ARTIFACT_KEY_REFUSED')
 need(all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]) for k in ['manifestSha256' if private else 'sourceSetSha256','archiveSha256']),'ARTIFACT_HASH_REQUIRED')
 need(type(a['archiveBytes']) is int and 0<a['archiveBytes']<2**53 and type(a['startsAt']) is int and type(a['expiresAt']) is int and a['startsAt']<a['expiresAt'],'ARTIFACT_BYTES_OR_WINDOW_REQUIRED')
 if not private:need(a['targetDirectory']==control+'/artifacts/'+a['artifactKey'],'ARTIFACT_NAMESPACE_REFUSED')
 return a

def syncdir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def own_directory(p):
 canonical(p);s=p.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and s.st_mode&0o022==0,'ARTIFACT_OWNED_DIRECTORY_REQUIRED')
def identity(s):return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def snapshot(a):
 parent=Path(a['targetDirectory']).parent
 try:own_directory(parent)
 except FileNotFoundError:return {'status':'ABSENT'}
 target=Path(a['targetDirectory'])
 try:own_directory(target)
 except FileNotFoundError:return {'status':'ABSENT'}
 try:
  r=json.loads(read_regular(target/'ready.json',65536));need(r['authoritySha256']==context['authoritySha256'] and r['archiveSha256']==a['archiveSha256'] and r['archiveBytes']==a['archiveBytes'],'ARTIFACT_RECEIPT_DIFFERS')
  p=target/'archive.bin';canonical(p);s=p.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_nlink==1 and s.st_mode&0o077==0 and identity(s)==r['fileIdentity'],'ARTIFACT_STORED_FILE_CHANGED')
  if a['kind'] in PRIVATE_STANDARD_DATA_KINDS:
   need(stat.S_IMODE(parent.lstat().st_mode)==0o700 and stat.S_IMODE(target.lstat().st_mode)==0o700,'PRIVATE_STANDARD_DATA_DIRECTORY_REQUIRED')
   need(r.get('manifestSha256')==a['manifestSha256'] and all(r.get(k)==a[k] for k in ['fragmentIndex','fragmentOffset'] if k in a),'PRIVATE_STANDARD_DATA_RECEIPT_DIFFERS')
  return {'status':'READY','receipt':r}
 except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError):return {'status':'PARTIAL_OR_UNKNOWN_NO_REPLAY'}

def new_file(p,b):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:f.write(b);f.flush();os.fsync(fd)
 finally:os.close(fd)
def upload(a,stream):
 need(a['startsAt']<=int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
 parent=Path(a['targetDirectory']).parent;own_directory(parent.parent)
 try:parent.mkdir(mode=0o700)
 except FileExistsError:pass
 own_directory(parent)
 if a['kind'] in PRIVATE_STANDARD_DATA_KINDS:need(stat.S_IMODE(parent.lstat().st_mode)==0o700,'PRIVATE_STANDARD_DATA_DIRECTORY_REQUIRED')
 target=Path(a['targetDirectory']);target.mkdir(mode=0o700);syncdir(parent)
 # Exclusive target creation is the once-only marker. Partial directories remain.
 new_file(target/'binding.json',json.dumps({'authoritySha256':context['authoritySha256'],'authority':a},sort_keys=True).encode());syncdir(target)
 part=target/'archive.part';fd=os.open(part,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);h=hashlib.sha256();left=a['archiveBytes']
 try:
  with os.fdopen(fd,'wb',closefd=False) as f:
   while left:
    need(int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
    b=stream.read(min(left,1024*1024));need(bool(b),'ARTIFACT_SHORT_STREAM');f.write(b);h.update(b);left-=len(b)
   need(stream.read(1)==b'','ARTIFACT_EXTRA_STREAM_BYTES');f.flush();os.fsync(fd)
 finally:os.close(fd)
 need(h.hexdigest()==a['archiveSha256'],'ARTIFACT_STREAM_HASH_DIFFERS');need(int(time.time()*1000)<a['expiresAt'],'ARTIFACT_AUTHORITY_EXPIRED')
 final=target/'archive.bin';os.link(part,final,follow_symlinks=False);os.unlink(part);syncdir(target)
 s=final.lstat();r={'status':'READY','artifactKey':a['artifactKey'],'archiveSha256':a['archiveSha256'],'archiveBytes':a['archiveBytes'],'authoritySha256':context['authoritySha256'],'fileIdentity':identity(s)}
 if a['kind'] in PRIVATE_STANDARD_DATA_KINDS:
  r['manifestSha256']=a['manifestSha256']
  for k in ['fragmentIndex','fragmentOffset']:
   if k in a:r[k]=a[k]
 else:r['sourceSetSha256']=a['sourceSetSha256']
 temp=target/'ready.tmp';new_file(temp,json.dumps(r,sort_keys=True).encode());os.link(temp,target/'ready.json',follow_symlinks=False);os.unlink(temp);syncdir(target)
 return {'status':'READY','receipt':r}

def main():
 a=authority()
 if context['action']=='status':return snapshot(a)
 need(context['action']=='upload','ARTIFACT_ACTION_REFUSED')
 return upload(a,sys.stdin.buffer)
if __name__=='__main__':
 try:print(json.dumps(main()))
 except (OSError,ValueError,KeyError,TypeError) as e:
  print(json.dumps({'status':'STOP_OR_UNKNOWN_NO_REPLAY','errorCode':str(e) if isinstance(e,ValueError) else type(e).__name__}));sys.exit(2)
'''

def artifact_channel(cfg,a,authority_sha,action,data=None):
    context={'grantId':cfg['grantId'],'control':cfg['control'],'authoritySha256':authority_sha,'authority':a,'action':action}
    code=ARTIFACT_REMOTE.replace('CONTEXT_LITERAL',repr(context),1)
    return json.loads(remote(cfg,'python3 -c '+shlex.quote(code),data))

def artifact_input(args,cfg):
    p=Path(args.authorization_file)
    if (not p.is_absolute() or p.resolve()!=p or any(x.is_symlink() for x in [p,*p.parents])):raise ValueError('ARTIFACT_CANONICAL_AUTHORITY_REQUIRED')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or not 0<s.st_size<=65536:raise ValueError('ARTIFACT_BOUNDED_AUTHORITY_REQUIRED')
        raw=os.read(fd,65537)
    finally:os.close(fd)
    if not re.fullmatch('[a-f0-9]{64}',args.authorization_sha256) or hashlib.sha256(raw).hexdigest()!=args.authorization_sha256:raise ValueError('ARTIFACT_AUTHORITY_HASH_DIFFERS')
    return artifact_authority(raw,cfg,allow_expired=args.action=='artifact-status')

def artifact_stage(cfg,args):
    a=artifact_input(args,cfg)
    if args.action=='artifact-status':
        print(json.dumps(artifact_channel(cfg,a,args.authorization_sha256,'status')));return
    if a['kind']=='PRIVATE_STANDARD_IMPORT_DATA':raise ValueError('PRIVATE_FULL_ARCHIVE_SERVER_LOCAL_RECEIVER_ONLY')
    # Validate and read the one exact raw file before any upload attempt.
    p=Path(args.archive)
    if not p.is_absolute() or p.resolve()!=p or any(x.is_symlink() for x in [p,*p.parents]):raise ValueError('ARTIFACT_CANONICAL_ARCHIVE_REQUIRED')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_size!=a['archiveBytes']:raise ValueError('ARTIFACT_LOCAL_BYTES_DIFFERS')
        if a['kind'] in PRIVATE_STANDARD_DATA_KINDS and (s.st_uid!=os.getuid() or s.st_mode&0o077):raise ValueError('PRIVATE_STANDARD_DATA_LOCAL_INPUT_REQUIRED')
        with os.fdopen(fd,'rb',closefd=False) as f:data=f.read(a['archiveBytes']+1)
        z=os.fstat(fd)
        if len(data)!=a['archiveBytes'] or hashlib.sha256(data).hexdigest()!=a['archiveSha256'] or (s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(z.st_size,z.st_mtime_ns,z.st_ctime_ns):raise ValueError('ARTIFACT_LOCAL_HASH_OR_IDENTITY_DIFFERS')
    finally:os.close(fd)
    if dispatch(cfg,'status').get('status')!='READY':raise ValueError('ARTIFACT_EXISTING_GRANT_NOT_READY')
    observed=artifact_channel(cfg,a,args.authorization_sha256,'status')
    attempt=HERE/('artifact-staging-attempt-'+a['artifactKey']+'.json')
    if observed.get('status')!='ABSENT' or attempt.exists() or attempt.is_symlink():
        print(json.dumps({'status':'READ_ORIGINAL_STATUS_NO_REPLAY','observed':observed,'localAttemptRecorded':attempt.exists()}));return
    # Created before remote upload, including a timeout before remote mkdir.
    fd=os.open(attempt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'w',closefd=False) as f:
            json.dump({'artifactKey':a['artifactKey'],'authoritySha256':args.authorization_sha256,'archiveSha256':a['archiveSha256'],'archiveBytes':a['archiveBytes']},f);f.flush();os.fsync(fd)
    finally:os.close(fd)
    directory_fd=os.open(HERE,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(directory_fd)
    finally:os.close(directory_fd)
    # Recheck time after hashing/status. Never widen remote()'s original40s.
    artifact_authority(json.dumps(a).encode(),cfg)
    print(json.dumps(artifact_channel(cfg,a,args.authorization_sha256,'upload',data)))


def main():
    global CONTROL_PATH
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='action',required=True);sub.add_parser('status');end=sub.add_parser('end');end.add_argument('--force',action='store_true');end.add_argument('--reason',choices=['T51_COMPLETE','USER_STOP'],default='USER_STOP')
    run=sub.add_parser('run');run.add_argument('--task',required=True);run.add_argument('--job-id',required=True);run.add_argument('--source-dir',required=True);run.add_argument('--script',required=True);run.add_argument('--output-dir',required=True);run.add_argument('--timeout-seconds',type=int,default=3600);run.add_argument('--phase-arg',action='append',default=[]);run.add_argument('--rewrite',action='append',default=[]);run.add_argument('--evidence')
    get=sub.add_parser('collect');get.add_argument('--task',required=True);get.add_argument('--job-id',required=True);get.add_argument('--output-dir',required=True)
    for name in ('capacity-final-status', 'capacity-final-deliver'):
        command=sub.add_parser(name);command.add_argument('--task',choices=['T45'],required=True);command.add_argument('--job-id',required=True);command.add_argument('--binding',required=True)
        if name=='capacity-final-deliver':
            command.add_argument('--phase',choices=['CONTENT','APPROVAL'],required=True);command.add_argument('--input',required=True)
    for name in ('artifact-stage','artifact-status'):
        command=sub.add_parser(name);command.add_argument('--authorization-file',required=True);command.add_argument('--authorization-sha256',required=True)
        if name=='artifact-stage':command.add_argument('--archive',required=True)
    args=parser.parse_args();cfg=state()
    with tempfile.TemporaryDirectory(prefix='erp-ssh-',dir='/tmp') as channel:
        CONTROL_PATH=str(Path(channel)/'control')
        try:
            if args.action=='status':print(json.dumps({'status':'CLOSED','grantId':cfg['grantId'],'reason':cfg.get('revokedReason')} if cfg.get('installed')=='REVOKED' else dispatch(cfg,'status'),ensure_ascii=False))
            elif args.action=='end':print(json.dumps(end_grant(cfg,args.force,args.reason),ensure_ascii=False))
            elif args.action=='collect':collect(cfg,args)
            elif args.action in {'artifact-stage','artifact-status'}:artifact_stage(cfg,args)
            elif args.action in {'capacity-final-status','capacity-final-deliver'}:capacity_final(cfg,args)
            else:
                with (HERE/'release-client.lock').open('a+') as lock:fcntl.flock(lock,fcntl.LOCK_EX);submit(cfg,args)
        finally:
            if Path(CONTROL_PATH).exists():
                try:subprocess.run(['/usr/bin/ssh','-S',CONTROL_PATH,'-O','exit',cfg['host']],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5)
                except (OSError,subprocess.TimeoutExpired):pass
            CONTROL_PATH=None

if __name__=='__main__':
    try:main()
    except (ValueError,subprocess.TimeoutExpired) as error:raise SystemExit(str(error) if isinstance(error,ValueError) else 'LEASED_CHANNEL_TIMEOUT_DO_NOT_REPLAY')
