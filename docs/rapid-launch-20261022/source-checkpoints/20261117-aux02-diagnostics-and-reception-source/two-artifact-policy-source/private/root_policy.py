"""Install one externally approved policy and withdraw the same inode to prior absence."""
import fcntl
import json
import os
from pathlib import Path
import socket
import stat
import sys

import reception_scope as s

PENDING = "staging-policy.pending"
INTENT = "staging-policy-install-intent.json"

def root_directory(directory):
    for path in (directory,*directory.parents):
        st = path.lstat()
        s.need(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022,
               "FAA8_PROTECTED_ROOT_DIRECTORY_REQUIRED")

def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def write(path, raw, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())

def pack(value):
    return (json.dumps(value, sort_keys=True)+"\n").encode()

def quiet(receiver, authority, profile, digest):
    return s.quiet_check(Path(os.environ['ERP_SHARED_JOB_DIR']))


def proof(digest, st):
    return {"authoritySha256":digest, "profileSha256":s.PROFILE, "device":st.st_dev, "inode":st.st_ino}

def install(job, raw, digest, authority, profile, receiver):
    parent = s.TARGET.parent
    for path in (parent,*parent.parents):
        st = path.lstat()
        s.need(stat.S_ISDIR(st.st_mode) and not st.st_mode & 0o022, "FAA8_ARTIFACT_PARENT_CHANGED")
    st = parent.lstat()
    v = os.statvfs(parent)
    s.need(st.st_uid == 1000 and st.st_dev == profile["expectedDevice"] and
           v.f_bavail*v.f_frsize >= profile["archiveBytes"] and v.f_favail >= 4, "FAA8_ARTIFACT_VOLUME_REQUIRED")
    s.need(not os.path.lexists(s.TARGET) and not os.path.lexists(s.POLICY), "FAA8_ORIGINAL_BOUNDARY_NOT_ABSENT")
    consumers = quiet(receiver, authority, profile, digest)
    s.start_upload(authority["expiresAt"],s.now())
    pending = job/PENDING
    write(pending, raw, 0o444)
    mark = proof(digest, pending.lstat())
    write(job/INTENT, pack(mark), 0o400)
    sync(job)
    s.need(not os.path.lexists(s.TARGET), "FAA8_PREPUBLICATION_BOUNDARY_CHANGED")
    s.start_upload(authority["expiresAt"],s.now())
    os.link(pending, s.POLICY, follow_symlinks=False)
    pending.unlink()
    sync(s.POLICY.parent)
    sync(job)
    actual, st = s.read(s.POLICY,65536,0,0o444)
    s.need(st.st_gid == 0 and actual == raw and proof(digest, st) == mark, "FAA8_POLICY_PUBLICATION_UNKNOWN")
    return {"status":"EXACT_FIXED_ARTIFACT_POLICY_INSTALLED_NOT_PAYLOAD_READY",
            "before":"ABSENT","installed":mark,"consumerCheck":consumers,"availableBytes":v.f_bavail*v.f_frsize}

def restore(job, raw, digest, authority, profile, receiver):
    original = job.parent/s.INSTALL
    root_directory(original/"bundle")
    old,_ = s.read(original/"bundle/stage-authorization.json",65536,0,0o600)
    s.need(old == raw, "FAA8_RESTORE_ORIGINAL_AUTHORITY_DIFFERS")
    pending = original/PENDING
    candidate = s.POLICY if os.path.lexists(s.POLICY) else pending
    consumers = None
    if os.path.lexists(candidate):
        fd = os.open(candidate, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            actual, st = s.read(candidate,65536,0,0o444,links=(1,2))
            s.need(actual == raw and st.st_gid == 0 and s.identity(os.fstat(fd)) == s.identity(st),
                   "FAA8_RESTORE_ORIGINAL_POLICY_DIFFERS")
            if candidate == s.POLICY:
                intent,_ = s.read(original/INTENT,4096,0,0o400)
                s.need(s.strict(intent) == proof(digest,st), "FAA8_RESTORE_ORIGINAL_INTENT_DIFFERS")
            else:
                s.need(st.st_nlink == 1 and not os.path.lexists(s.POLICY), "FAA8_UNPUBLISHED_BOUNDARY_CHANGED")
            consumers = quiet(receiver, authority, profile, digest)
            if os.path.lexists(pending):
                s.need(s.identity(pending.lstat()) == s.identity(st), "FAA8_PENDING_POLICY_LINK_DIFFERS")
                pending.unlink()
                sync(original)
            if candidate == s.POLICY:
                z = s.POLICY.lstat()
                s.need(proof(digest,z) == proof(digest,st) and z.st_nlink == 1, "FAA8_RESTORE_POLICY_INODE_CHANGED")
                s.POLICY.unlink()
                sync(s.POLICY.parent)
        finally:
            os.close(fd)
    s.need(not os.path.lexists(s.POLICY) and not os.path.lexists(pending), "FAA8_POLICY_ABSENCE_NOT_RESTORED")
    return {"status":"ORIGINAL_ARTIFACT_POLICY_ABSENCE_RESTORED", "consumerCheck":consumers,
            "targetPresent":os.path.lexists(s.TARGET),"artifactChanged":False}

def main():
    job = Path(os.environ["ERP_SHARED_JOB_DIR"])
    s.need(os.getuid() == os.geteuid() == 0 and socket.gethostname() == "naijue-server" and
           os.environ.get("ERP_SHARED_TASK_ID") == "T45" and job.parent == s.JOBS and
           job.name in (s.INSTALL,s.RESTORE) and len(sys.argv) == 2, "FAA8_EXACT_ROOT_JOB_REQUIRED")
    root_directory(job/"bundle")
    root_directory(job/"results")
    root_directory(s.POLICY.parent)
    profile, fixed, receiver = s.pins(0,0o600)
    raw,_ = s.read(job/"bundle/stage-authorization.json",65536,0,0o600)
    digest = sys.argv[1]
    active = job.name == s.INSTALL
    authority = s.bind(raw,digest,fixed,active)
    s.verify_original_worker_lock()
    s.quiet_check(job)
    result = (install if active else restore)(job,raw,digest,authority,profile,receiver)
    s.verify_original_worker_lock()
    write(job/"results/staging-policy-readback.json",pack({**result,"authoritySha256":digest,"artifactKey":s.KEY}),0o600)
    sync(job/"results")

if __name__ == "__main__":
    main()
