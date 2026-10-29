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


def main():
    global CONTROL_PATH
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='action',required=True);sub.add_parser('status');end=sub.add_parser('end');end.add_argument('--force',action='store_true');end.add_argument('--reason',choices=['T51_COMPLETE','USER_STOP'],default='USER_STOP')
    run=sub.add_parser('run');run.add_argument('--task',required=True);run.add_argument('--job-id',required=True);run.add_argument('--source-dir',required=True);run.add_argument('--script',required=True);run.add_argument('--output-dir',required=True);run.add_argument('--timeout-seconds',type=int,default=3600);run.add_argument('--phase-arg',action='append',default=[]);run.add_argument('--rewrite',action='append',default=[]);run.add_argument('--evidence')
    get=sub.add_parser('collect');get.add_argument('--task',required=True);get.add_argument('--job-id',required=True);get.add_argument('--output-dir',required=True)
    for name in ('capacity-final-status', 'capacity-final-deliver'):
        command=sub.add_parser(name);command.add_argument('--task',choices=['T45'],required=True);command.add_argument('--job-id',required=True);command.add_argument('--binding',required=True)
        if name=='capacity-final-deliver':
            command.add_argument('--phase',choices=['CONTENT','APPROVAL'],required=True);command.add_argument('--input',required=True)
    args=parser.parse_args();cfg=state()
    with tempfile.TemporaryDirectory(prefix='erp-ssh-',dir='/tmp') as channel:
        CONTROL_PATH=str(Path(channel)/'control')
        try:
            if args.action=='status':print(json.dumps({'status':'CLOSED','grantId':cfg['grantId'],'reason':cfg.get('revokedReason')} if cfg.get('installed')=='REVOKED' else dispatch(cfg,'status'),ensure_ascii=False))
            elif args.action=='end':print(json.dumps(end_grant(cfg,args.force,args.reason),ensure_ascii=False))
            elif args.action=='collect':collect(cfg,args)
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
