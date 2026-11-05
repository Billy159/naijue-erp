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

def private_standard_data_authority(a, control, grant):
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

def private_standard_data_authority(a, control, grant):
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
