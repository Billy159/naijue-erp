"""One fixed source-only materialization through the original registered root job."""
from pathlib import Path
import base64,gzip,hashlib,io,json,os,re,stat,sys,tarfile,time

KEY='t45-r3-batched-source-materialize-20261115-01'
GRANT='b16447fbc81f4d64'
JOB=Path('/root/erp-release-20261006-01-worker')/('grant-'+GRANT)/'jobs'/KEY
TARGET=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
OUTPUT=TARGET/'state/installed-real-operation-batched-20261115-01'
SOURCE=OUTPUT/'operation'
DATA=TARGET/'state'/TARGET.name/'data'
# Set only after D1/D3's final same-tree delivery; None must refuse execution.
SOURCE_DESCRIPTION_SHA256='e63395c7fca3d3cf84fa37d251c8b7e6eb1ddb3caf5a96857f65a30d36561c0f'
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,code):
    if not ok:raise ValueError('BATCHED_SOURCE_'+code)


def trusted_parents(path):
    for parent in reversed(path.parents):
        s=parent.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022 and not parent.is_symlink(),'TRUSTED_ROOT_PARENT_REQUIRED')


def read(path,maximum):
    trusted_parents(path)
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
        s=os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=maximum,'FIXED_INPUT_REQUIRED')
        raw=f.read(maximum+1)
        identity=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
        need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
        return raw


def write(path,raw,mode=0o600):
    with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb') as f:
        need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fsync(f.fileno())
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)


def pack(value):
    return (json.dumps(value,sort_keys=True)+'\n').encode()


def encode(value):return pack(value)


def scope():
    return {'format':'T45_R3_BATCHED_SOURCE_MATERIALIZATION_V1','requestKey':KEY,'grantId':GRANT,
        'decision':'MATERIALIZE_EXACT_FROZEN_SOURCE_ONLY_NO_DATABASE_OR_SERVICE','outputDirectory':str(OUTPUT),
        'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'dataIdentity':[66304,13502421,61035,61035,448],
        'minimumAvailableAfterBytes':28*1024**3,'maximumOperationSeconds':300}


def validate(a,at):
    fixed=scope()
    need(type(SOURCE_DESCRIPTION_SHA256) is str and re.fullmatch('[0-9a-f]{64}',SOURCE_DESCRIPTION_SHA256),'FINAL_SAME_VERSION_DESCRIPTION_REQUIRED')
    need(set(a)==set(fixed)|{'startsAt','expiresAt','authorizationReference','independentReviewSha256','sourceSha256'}
         and all(a[k]==v for k,v in fixed.items()),'EXACT_EXTERNAL_SCOPE_REQUIRED')
    need(type(a['startsAt']) is type(a['expiresAt']) is int and a['startsAt']<=at<at+300000<a['expiresAt']<=a['startsAt']+1800000,'FINITE_WINDOW_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512
         and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256']) and re.fullmatch('[a-f0-9]{64}',a['sourceSha256']),'SOURCE_AND_REVIEW_REQUIRED')
    return a


def main():
    need(sys.platform=='linux' and os.getuid()==os.geteuid()==0
         and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB)
         and Path(__file__)==JOB/'bundle/materialize-batched-source.py' and len(sys.argv)==2,'REGISTERED_ROOT_ENTRY_REQUIRED')
    need(type(SOURCE_DESCRIPTION_SHA256) is str and re.fullmatch('[0-9a-f]{64}',SOURCE_DESCRIPTION_SHA256),'FINAL_SAME_VERSION_DESCRIPTION_REQUIRED')
    raw=read(JOB/'bundle/materialize-authorization.json',65536)
    need(sha(raw)==sys.argv[1],'EXTERNAL_AUTHORITY_DIGEST_REQUIRED')
    at=time.time_ns()//1000000
    a=validate(json.loads(raw),at);fixed=scope()
    need(sha(read(Path(__file__),65536))==a['sourceSha256'],'SOURCE_AND_REVIEW_REQUIRED')
    desc_raw=read(JOB/'bundle/source-description.json',262144)
    need(sha(desc_raw)==SOURCE_DESCRIPTION_SHA256,'DESCRIPTION_DIFFERS')
    d=json.loads(desc_raw)
    need(set(d)=={'sourceRowsSha256','sourceArchiveBytes','sourceArchiveSha256','sourceFiles','parts','installerRunnerSha256'}
         and 0<d['sourceArchiveBytes']<=16*1024**2 and 0<d['sourceFiles']<=1024 and len(d['parts'])<=128,'DESCRIPTION_BOUNDS_REQUIRED')
    rows_raw=read(JOB/'bundle/source-rows.json',262144)
    need(sha(rows_raw)==d['sourceRowsSha256'],'SOURCE_ROWS_DIFFERS')
    rows=json.loads(rows_raw);need(len(rows)==d['sourceFiles'],'SOURCE_COUNT_DIFFERS')
    expected={r['path']:r for r in rows}
    need(len(expected)==len(rows) and sum(r['bytes'] for r in rows)<=128*1024**2,'SOURCE_ROWS_REQUIRED')
    runner=read(JOB/'bundle/batched161-run.mjs',65536)
    need(sha(runner)==d['installerRunnerSha256'],'INSTALLER_RUNNER_DIFFERS')
    need(all(re.fullmatch(r'[A-Za-z0-9_./-]+',p) and not p.startswith('/') and '..' not in p.split('/')
             and not p.startswith(('node_modules/','reference-inputs/')) for p in expected),'EXACT_SOURCE_PATH_REQUIRED')
    s=DATA.lstat();need([s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode)]==fixed['dataIdentity']
                          and not os.path.lexists(DATA/'postmaster.pid'),'ORIGINAL_STOPPED_DATA_REQUIRED')
    need(not os.path.lexists(OUTPUT),'OUTPUT_ALREADY_EXISTS_READ_ORIGINAL_KEY')
    expiry=min(time.monotonic()+265,time.monotonic()+(a['expiresAt']-at)/1000-35)
    def current():need(time.monotonic()<expiry,'WORK_WINDOW_EXPIRED')
    content=[]
    for n,row in enumerate(d['parts'],1):
        current();need(row['name']==f'source-part-{n:02d}.json','EXACT_PART_ORDER_REQUIRED')
        b=read(JOB/'bundle'/row['name'],262144)
        need(len(b)==row['bytes'] and sha(b)==row['sha256'],'SOURCE_PART_DIFFERS')
        v=json.loads(b);need(set(v)=={'dataBase64'},'SOURCE_PART_FIELDS_REQUIRED')
        b=base64.b64decode(v['dataBase64'],validate=True)
        need(len(b)==row['decodedBytes']<=131072,'DECODED_PART_DIFFERS');content.append(b)
    archive=b''.join(content)
    need(len(archive)==d['sourceArchiveBytes'] and sha(archive)==d['sourceArchiveSha256'],'ARCHIVE_DIFFERS')
    volume=os.statvfs(TARGET);need(volume.f_bavail*volume.f_frsize-sum(r['bytes'] for r in rows)>=fixed['minimumAvailableAfterBytes'],'ORIGINAL_SPACE_RESERVE_REQUIRED')
    write(JOB/'results/batched-source-materialization-intent.json',pack({'requestKey':KEY,'sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,'outputDirectory':str(OUTPUT),'automaticReplay':False}))
    trusted_parents(OUTPUT);OUTPUT.mkdir(mode=0o755);SOURCE.mkdir(mode=0o755)
    found=set()
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as t:
        for member in t:
            current();need(member.isfile() and member.name in expected and member.name not in found,'EXACT_REGULAR_ARCHIVE_MEMBER_REQUIRED')
            row=expected[member.name];need(member.size==row['bytes'],'MEMBER_SIZE_DIFFERS')
            data=t.extractfile(member).read(row['bytes']+1)
            need(len(data)==row['bytes'] and sha(data)==row['sha256'],'MEMBER_BYTES_DIFFER')
            destination=SOURCE/member.name;destination.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
            write(destination,data,0o400 if member.name=='runtime/baseline-scope-input-pins.json' else 0o644);found.add(member.name)
    need(found==set(expected),'INCOMPLETE_SOURCE_TREE')
    for name,row in expected.items():
        current();need(sha(read(SOURCE/name,16*1024**2))==row['sha256'],'SOURCE_READBACK_DIFFERS')
    write(OUTPUT/'batched161-run.mjs',runner,0o644)
    result={'requestKey':KEY,'state':'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION','sourceDescriptionSha256':SOURCE_DESCRIPTION_SHA256,
        'sourceRowsSha256':d['sourceRowsSha256'],'sourceFiles':len(found),'sourceRoot':str(SOURCE),'nodeModulesChanged':False,
        'installerRunnerSha256':d['installerRunnerSha256'],
        'databaseConnections':0,'databaseWrites':0,'serviceStarted':False,'liveCatalogVerified':False,'automaticReplay':False}
    write(OUTPUT/'source-materialization.json',pack(result),0o644)
    write(JOB/'results/batched-source-materialization.json',pack(result))
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':
    main()
