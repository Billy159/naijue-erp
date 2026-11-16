"""Publish or withdraw one externally approved original D3 fragment policy."""
import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
import time

GRANT = 'b16447fbc81f4d64'
JOBS = Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
POLICY = Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT+'/artifact-staging-authorization.json')
PENDING_NAME = 'staging-policy.pending'
AUTHORITY = 'stage-authorization.json'
WINDOW = 'd3-chunk-window.json'
RECEIVER = 'artifact-receiver.d3-chunk.py'
RECEIVER_SHA = 'bee800f2341ff1cba5400ce61a2227acce50498c82216882630f33f040c46e97'
INTENT = 'staging-policy-install-intent.json'


def need(ok, code):
    if not ok:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return time.time_ns()//1_000_000


def strict(raw):
    def pairs(entries):
        out = {}
        for key,value in entries:
            need(key not in out,'DUPLICATE_STAGING_AUTHORITY_FIELD')
            out[key] = value
        return out
    return json.loads(raw,object_pairs_hook=pairs)


def bytes_json(value):
    return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()


def identity(st):
    return [st.st_dev,st.st_ino,st.st_mode,st.st_uid,st.st_gid,st.st_nlink,st.st_size,
            st.st_mtime_ns,st.st_ctime_ns]


def write(path, raw, mode):
    fd = os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as out:
        os.fchmod(out.fileno(),mode)
        out.write(raw)
        out.flush()
        os.fsync(out.fileno())


def sync(path):
    fd = os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read(path, uid, mode, links=(1,), limit=65536):
    fd = os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_uid==uid and
             stat.S_IMODE(before.st_mode)==mode and before.st_nlink in links and
             0 < before.st_size <= limit,'EXACT_STAGING_FILE_REQUIRED')
        raw = stream.read(limit+1)
        need(len(raw)==before.st_size and identity(before)==identity(os.fstat(stream.fileno()))==
             identity(path.lstat()),'STAGING_FILE_CHANGED')
    return raw,before


def validate(raw, digest, active):
    need(re.fullmatch('[a-f0-9]{64}',digest) and sha(raw)==digest,'EXACT_EXTERNAL_D3_CHUNK_BYTES_REQUIRED')
    a = strict(raw)
    need(type(a) is dict and type(a.get('startsAt')) is type(a.get('expiresAt')) is int and
         0<a['expiresAt']-a['startsAt']<=600000,'EXACT_D3_CHUNK_FINITE_WINDOW_REQUIRED')
    if active:
        need(a['startsAt']<=now()<a['expiresAt'],'D3_CHUNK_AUTHORITY_NOT_CURRENT')
    return a


def window_keys(digest):
    need(re.fullmatch('[a-f0-9]{64}',digest),'D3_CHUNK_EXACT_WINDOW_JOB_DIGEST_REQUIRED')
    return tuple(f't45-r3-final33-stage-{action}-20261116-{digest[:24]}' for action in ('install','restore'))


def trusted_root_directory(directory):
    for path in (directory,*directory.parents):
        st = path.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             'ORIGINAL_ROOT_D3_CHUNK_JOB_DIRECTORY_REQUIRED')


def receiver(job,window_raw,digest):
    src = job/'bundle'/RECEIVER
    code,_ = read(src,0,0o600,limit=65536)
    need(sha(code)==RECEIVER_SHA,'D3_CHUNK_EXACT_RECEIVER_SOURCE_REQUIRED')
    globals_ = {'__name__':'fixed_d3_chunk_receiver','CONTEXT_LITERAL':{'grantId':GRANT,'authoritySha256':digest,'action':'recovery-status',
                'recoveryWindowRawBase64':base64.b64encode(window_raw).decode()}}
    exec(compile(code,str(src),'exec'),globals_)
    return globals_


@contextmanager
def inspected(a,api):
    target = api['original_target'](a,root_inspect=True)
    if not api['existing_leaf'](target):
        out = api['absent_snapshot'](a,root_inspect=True)
        yield out,out['consumerCheck']
        return
    fd,_,target,out = api['recovery_open'](a,True,root_inspect=True)
    try:
        consumers = api['recovery_no_other_writers'](target,uid=1000)
        yield out,consumers
    finally:
        os.close(fd)


def verify_ready_origin(ready,digest,part):
    if ready is None:return
    prior = ready['authoritySha256']
    need(prior!=digest,'D3_CHUNK_RECOVERY_PREEXISTING_CURRENT_READY_REFUSED')
    key,_ = window_keys(prior)
    old = JOBS/key
    trusted_root_directory(old/'bundle')
    trusted_root_directory(old/'results')
    raw,_ = read(old/'bundle'/AUTHORITY,0,0o600)
    old_authority = validate(raw,prior,active=False)
    need(old_authority['artifactKey']==part,'D3_CHUNK_PRIOR_READY_ORIGINAL_KEY_DIFFERS')
    window_raw,_ = read(old/'bundle'/WINDOW,0,0o600,limit=4096)
    receiver(old,window_raw,prior)['recovery_window'](old_authority,window_raw)
    intent_raw,_ = read(old/INTENT,0,0o400)
    result_raw,_ = read(old/'results/d3-chunk-policy-result.json',0,0o600)
    intent = strict(intent_raw)
    result = strict(result_raw)
    need(all(intent.get(k)==v for k,v in {'jobId':key,'artifactKey':part,'authoritySha256':prior,
                                          'originalPolicy':'ABSENT','windowSha256':sha(window_raw)}.items()) and
         all(result.get(k)==v for k,v in {'status':'D3_CHUNK_POLICY_INSTALLED','artifactKey':part,
                                         'authoritySha256':prior,'windowSha256':sha(window_raw)}.items()),
         'D3_CHUNK_RECOVERY_PRIOR_READY_APPROVAL_ORIGIN_UNCONFIRMED')


def trusted_policy_parent():
    for path in POLICY.parents:
        st = path.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             'ORIGINAL_ROOT_POLICY_DIRECTORY_REQUIRED')


def install(job, raw, digest, a, window_raw, api):
    need(not os.path.lexists(POLICY),'D3_CHUNK_RECOVERY_POLICY_NOT_ABSENT')
    boundary = api['recovery_window'](a,window_raw)['boundary']

    def exact(out):
        return out['status']=='ABSENT' if boundary is None else (
            out['status']!='READY' and api['recovery_snapshot'](out)==boundary)

    with inspected(a,api) as (out,_):
        need(exact(out),'D3_CHUNK_RECOVERY_INSTALL_SNAPSHOT_CHANGED')
    if boundary is not None:verify_ready_origin(boundary['ready'],digest,a['artifactKey'])
    temp = job/PENDING_NAME
    write(temp,raw,0o444)
    before = temp.lstat()
    intent = {'jobId':job.name,'artifactKey':a['artifactKey'],'authoritySha256':digest,'windowSha256':sha(window_raw),
              'originalPolicy':'ABSENT','pendingDevice':before.st_dev,'pendingInode':before.st_ino}
    write(job/INTENT,bytes_json(intent),0o400)
    sync(job)
    with inspected(a,api) as (out,consumers):
        need(exact(out),'D3_CHUNK_RECOVERY_INSTALL_SNAPSHOT_CHANGED')
        need(a['startsAt']<=now()<a['expiresAt'],'D3_CHUNK_RECOVERY_AUTHORITY_EXPIRED')
        os.link(temp,POLICY,follow_symlinks=False)
        temp.unlink()
        sync(POLICY.parent)
        sync(job)
        actual,after = read(POLICY,0,0o444)
        need(after.st_gid==0 and actual==raw and (after.st_dev,after.st_ino)==(before.st_dev,before.st_ino),
             'D3_CHUNK_POLICY_PUBLICATION_UNCONFIRMED')
    return {'status':'D3_CHUNK_POLICY_INSTALLED','before':'ABSENT','authoritySha256':digest,
            'windowSha256':sha(window_raw),'policyIdentity':identity(after),'artifactKey':a['artifactKey'],
            'originalConsumerCheck':consumers}


def restore(job, raw, digest, a, window_raw, api):
    install_key,_ = window_keys(digest)
    original = JOBS/install_key
    trusted_root_directory(original/'bundle')
    pending = original/PENDING_NAME
    frozen,_ = read(original/'bundle'/AUTHORITY,0,0o600)
    prior_window,_ = read(original/'bundle'/WINDOW,0,0o600,limit=4096)
    need(frozen==raw and prior_window==window_raw,'D3_CHUNK_ORIGINAL_INSTALL_AUTHORITY_DIFFERS')
    try:
        intent_raw,_ = read(original/INTENT,0,0o400)
    except FileNotFoundError:
        intent = None
    else:
        intent = strict(intent_raw)
        need(all(intent.get(k)==v for k,v in {'jobId':install_key,'artifactKey':a['artifactKey'],'authoritySha256':digest,
                                             'windowSha256':sha(window_raw),
                                             'originalPolicy':'ABSENT'}.items()),'D3_CHUNK_INSTALL_INTENT_DIFFERS')
    if not os.path.lexists(POLICY):
        # Install may have stopped before publication or after creating its
        # temporary leaf but before writing intent. The leaf belongs to its
        # exclusive root job directory in either case.
        pending_bytes,owned = read(pending,0,0o444)
        need(pending_bytes==raw and owned.st_gid==0 and
             (intent is None or (owned.st_dev,owned.st_ino)==(intent['pendingDevice'],intent['pendingInode'])) and
             identity(pending.lstat())==identity(owned) and not os.path.lexists(POLICY),
             'D3_CHUNK_UNPUBLISHED_TEMP_BYTES_OR_INODE_DIFFERS')
        pending.unlink()
        sync(original)
        need(not any(os.path.lexists(p) for p in (POLICY,pending)),'D3_CHUNK_ABSENT_STATE_NOT_RESTORED')
        return {'status':'D3_CHUNK_UNPUBLISHED_TEMP_REMOVED_POLICY_REMAINED_ABSENT',
                'authoritySha256':digest,'artifactKey':a['artifactKey'],'temporaryIdentity':identity(owned),
                'artifactBytesChanged':False}
    current,before = read(POLICY,0,0o444,links=(1,2))
    need(intent is not None and current==raw and before.st_gid==0 and (before.st_dev,before.st_ino)==
         (intent['pendingDevice'],intent['pendingInode']),'D3_CHUNK_CURRENT_POLICY_BYTES_OR_INODE_DIFFERS')
    api['recovery_no_other_writers'](api['original_target'](a,root_inspect=True),uid=1000)
    ready = None
    if now()<a['expiresAt']:
        with inspected(a,api) as (out,_):
            ready = out['status']=='READY'
    need(ready is True or now()>=a['expiresAt'],'D3_CHUNK_UNRESOLVED_RECEIPT_WAIT_FOR_AUTHORITY_EXPIRY')
    need(identity(POLICY.lstat())==identity(before),'D3_CHUNK_CURRENT_POLICY_CHANGED')
    if before.st_nlink==2:
        need(identity(pending.lstat())==identity(before),'D3_CHUNK_PENDING_POLICY_LINK_DIFFERS')
        pending.unlink()
        sync(original)
    POLICY.unlink()
    sync(POLICY.parent)
    need(not os.path.lexists(POLICY),'D3_CHUNK_ABSENT_STATE_NOT_RESTORED')
    return {'status':'D3_CHUNK_ORIGINAL_POLICY_ABSENCE_RESTORED','authoritySha256':digest,
            'artifactKey':a['artifactKey'],'readyObserved':ready,'priorPolicyIdentity':identity(before),
            'artifactBytesChanged':False}


def main():
    job = Path(os.environ['ERP_SHARED_JOB_DIR'])
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0 and socket.gethostname()=='naijue-server' and
         os.environ['ERP_SHARED_TASK_ID']=='T45' and
         Path(__file__)==job/'bundle/d3-chunk-policy.py' and len(sys.argv)==2,
         'ORIGINAL_T45_D3_CHUNK_ROOT_JOB_REQUIRED')
    digest = sys.argv[1]
    install_key,restore_key = window_keys(digest)
    need(job in (JOBS/install_key,JOBS/restore_key),'D3_CHUNK_EXACT_WINDOW_JOB_KEY_REQUIRED')
    trusted_root_directory(job/'bundle')
    trusted_policy_parent()
    raw,_ = read(job/'bundle'/AUTHORITY,0,0o600)
    window_raw,_ = read(job/'bundle'/WINDOW,0,0o600,limit=4096)
    action = install if job.name==install_key else restore
    a = validate(raw,digest,active=action==install)
    api = receiver(job,window_raw,digest)
    api['recovery_window'](a,window_raw)
    result = action(job,raw,digest,a,window_raw,api)
    write(job/'results/d3-chunk-policy-result.json',bytes_json(result),0o600)


if __name__=='__main__':
    main()
