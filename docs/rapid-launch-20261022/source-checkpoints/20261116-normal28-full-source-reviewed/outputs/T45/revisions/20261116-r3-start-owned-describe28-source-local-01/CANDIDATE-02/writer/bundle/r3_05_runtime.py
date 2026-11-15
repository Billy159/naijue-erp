"""Fixed input and proof wiring for the existing same-05 R3 worker."""
import hashlib
import os
from pathlib import Path
import re
import stat
import time

from r3_05_cli import APPROVALS, MANIFEST, ROOT, SERVICE, require

HOST_ROOT = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
MATERIALIZED = HOST_ROOT/'state/r3-r2-private-import-input-20261112-01'
PROOF_PROJECTION = HOST_ROOT/'authority/r3-service-28-worker-proof'
PROFILE_SHA = 'ce6d6a3c71497701f1dab5ddf5fac89cc93d0824324b0aa75512dfc05177d904'
INSTALLATION = '4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'
SOURCE = '6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16'
TARGET = 'fe0b2fe570382453f27def1c9d92eac8fc2fb5b37fc51f096a1a8c912bc28168'
SERVICE_KEY = 't45-first-r3-native-service-start-20261116-28'
SERVICE_NAME = 't45-fresh35-first-production-20261110-r3-service-28'
STATE_DEVICE = 66304
START_RESERVE = 28 * 1024**3
BASELINE_SCOPE_DIRECTORY = 'approvals/baseline-scope-input-r1'
BASELINE_SCOPE_SIDECARS = tuple(BASELINE_SCOPE_DIRECTORY+'/'+name for name in (
    'input-manifest.json','warehouses.jsonl','skus.jsonl','explicit-values.jsonl','unknown-mask.jsonl',
))
WORKER_READ_EXPECTED = dict(readableFiles=43,readableDirectories=5,uid=61035,dataBodiesRead=0)


def mount_plan(raw_profile, materialized_result, strict, planned_mounts):
    require(hashlib.sha256(raw_profile).hexdigest()==PROFILE_SHA,'R3_COMPACT_PROFILE_DIFFERS')
    profile = strict(raw_profile)
    require(profile['manifestSha256']==MANIFEST and profile['targetHostRoot']==str(HOST_ROOT)
            and profile['containerIntakeRoot']==str(ROOT)
            and HOST_ROOT/profile['materializedRelativePath']==MATERIALIZED,
            'R3_COMPACT_MATERIALIZED_TARGET_DIFFERS')
    mounts = planned_mounts(MATERIALIZED,profile)
    require(materialized_result.get('status')=='EXACT_R3_R2_PRIVATE_INPUT_MATERIALIZED_ALIAS_MOUNT_PENDING'
            and materialized_result.get('jobId')==profile['materializeKey']
            and materialized_result.get('profileSha256')==PROFILE_SHA
            and materialized_result.get('manifestSha256')==MANIFEST
            and materialized_result.get('readonlyMounts')==mounts,
            'R3_COMPACT_ORIGINAL_MATERIALIZATION_RECEIPT_DIFFERS')
    return profile, [*mounts, {'source':str(PROOF_PROJECTION),'target':str(SERVICE.parent),'readonly':True}]


def current_service(raw, expected_sha, cid, actual_namespace, now, operation_expires, strict):
    require(hashlib.sha256(raw).hexdigest()==expected_sha,'R3_COMPACT_CURRENT_SERVICE_BYTES_DIFFER')
    proof = strict(raw)
    shared = proof['sharedPostgresNamespace']
    container = shared['container']
    require(proof['format']=='FRESH35_CURRENT_PRODUCTION_SERVICE_V2' and proof['requestKey']==SERVICE_KEY
            and shared['creationOperationId']==SERVICE_KEY
            and proof['installationRecordSha256']==shared['installationRecordSha256']==INSTALLATION
            and proof['targetSha256']==shared['targetSha256']==TARGET
            and proof['sourceSetSha256']==shared['sourceSetSha256']==SOURCE
            and re.fullmatch('[a-f0-9]{64}',cid) is not None and container['id']==cid
            and container['name']==SERVICE_NAME and container['networkNamespace']==actual_namespace
            and proof['dataDirectoryIdentity']=={'device':STATE_DEVICE,'inode':13502421,
                                                  'uid':61035,'gid':61035,'mode':0o700}
            and type(proof['checkedAt']) is type(shared['serviceLeaseExpiresAt']) is int
            and proof['checkedAt']<=now<operation_expires<=shared['serviceLeaseExpiresAt'],
            'R3_COMPACT_CURRENT_SERVICE_OR_NAMESPACE_DIFFERS')
    return proof


def minimum_by_device(minimum, volumes):
    measured = {}
    for name, amount in minimum.items():
        volume = volumes[name]
        device = (volume['device'], volume['mount']['deviceNumber'])
        measured[device] = min(measured.get(device,amount),amount)
    return [{'device':device,'deviceNumber':name,'minimumAvailableBytes':amount}
            for (device,name),amount in sorted(measured.items())]



def operation_high_water(roots, devices, previous, *, deadline, maximum_entries=2048):
    """Read only this operation's three work trees, outside the original free-space guard."""
    require(set(roots)==set(devices)=={'reportIndex','tmp','sqliteScratch'},
            'R3_COMPACT_EXACT_WORK_TREES_REQUIRED')
    result = {}
    for name, root in roots.items():
        allocation = 0
        checked = 0
        complete = True
        root_missing = False
        seen = set()
        pending = [root]
        while pending:
            if checked>=maximum_entries or time.monotonic()>=deadline:
                complete = False
                break
            path = pending.pop()
            try:
                info = path.lstat()
                checked += 1
                if info.st_dev!=devices[name] or stat.S_ISLNK(info.st_mode):
                    complete = False
                    continue
                identity = (info.st_dev,info.st_ino)
                if identity in seen:
                    continue
                seen.add(identity)
                allocation += info.st_blocks*512
                if stat.S_ISDIR(info.st_mode):
                    with os.scandir(path) as stream:
                        for entry in stream:
                            if checked+len(pending)>=maximum_entries or time.monotonic()>=deadline:
                                complete = False
                                break
                            pending.append(Path(entry.path))
            except FileNotFoundError:
                complete = False
                root_missing = path==root
            except OSError:
                complete = False
        result[name] = {'sampleAllocatedBytes':None if root_missing else allocation,
                        'observedHighWaterBytes':max(previous.get(name,0),allocation),
                        'sampleComplete':complete,'entries':checked}
    return result


CAPACITY_TARGET = SERVICE.parent/'capacity/owner-profile.json'
CAPACITY_SOURCE = HOST_ROOT/'state/capacity/owner-profile.json'


def prepare_proof_projection(new_file, syncdir):
    """Prepare the exact target of the preserved nested readonly capacity bind."""
    PROOF_PROJECTION.mkdir(mode=0o755)
    PROOF_PROJECTION.chmod(0o755)
    capacity = PROOF_PROJECTION/'capacity'
    capacity.mkdir(mode=0o755)
    capacity.chmod(0o755)
    new_file(capacity/'owner-profile.json',b'',0o400)
    syncdir(capacity)
    syncdir(PROOF_PROJECTION)


def add_mounts_before_original_capacity(args, mounts, mount):
    old = mount([],CAPACITY_SOURCE,str(CAPACITY_TARGET),True)
    require(len(old)==2 and args.count(old[1])==1,'R3_COMPACT_ORIGINAL_CAPACITY_BIND_REQUIRED')
    position = args.index(old[1])-1
    require(position>=0 and args[position:position+2]==old,'R3_COMPACT_ORIGINAL_CAPACITY_BIND_REQUIRED')
    extra = []
    for item in mounts:
        require(item['readonly'] is True,'R3_COMPACT_ONLY_READONLY_BINDS_REQUIRED')
        extra = mount(extra,item['source'],item['target'],True)
    return args[:position]+extra+args[position:]


def verify_capacity_projection(binds, observation, raw, approved_sha):
    require(binds.get(str(SERVICE.parent))==(str(PROOF_PROJECTION),False)
            and binds.get(str(CAPACITY_TARGET))==(str(CAPACITY_SOURCE),False)
            and observation['mountPoint']==str(CAPACITY_TARGET)
            and hashlib.sha256(raw).hexdigest()==approved_sha,
            'R3_COMPACT_ORIGINAL_CAPACITY_BIND_CHANGED')


def require_worker_reads(profile):
    """Open exact input FDs as the original worker identity, without reading payloads."""
    require(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==61035,
            'R3_COMPACT_EXACT_NONROOT_WORKER_REQUIRED')
    alias = next(item for item in profile['sidecars'] if 'sameInodeAs' in item)
    paths = [ROOT/'package'/item['relative_path'] for item in profile['members']]
    paths += [ROOT/'approvals'/name for name in APPROVALS.values()]
    paths += [ROOT/name for name in BASELINE_SCOPE_SIDECARS]
    paths.append(ROOT/alias['targetRelativePath'])
    for path in paths:
        before = path.lstat()
        require(path.resolve()==path and stat.S_ISREG(before.st_mode) and before.st_nlink==1,
                'R3_COMPACT_WORKER_EXACT_FILE_REQUIRED')
        fd = os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try:
            after = os.fstat(fd)
            require((after.st_dev,after.st_ino,after.st_size)==(before.st_dev,before.st_ino,before.st_size),
                    'R3_COMPACT_WORKER_INPUT_CHANGED')
        finally:
            os.close(fd)
    directories = {parent for path in paths for parent in path.parents
                   if parent==ROOT/'package' or parent==ROOT/'approvals'
                   or parent.is_relative_to(ROOT/'package') or parent.is_relative_to(ROOT/'approvals')}
    for directory in sorted(directories):
        fd = os.open(directory,os.O_RDONLY|os.O_NOFOLLOW|os.O_DIRECTORY)
        try:
            with os.scandir(fd) as entries:
                next(entries,None)
        finally:
            os.close(fd)
    return {'readableFiles':len(paths),'readableDirectories':len(directories),
            'uid':os.geteuid(),'dataBodiesRead':0}
