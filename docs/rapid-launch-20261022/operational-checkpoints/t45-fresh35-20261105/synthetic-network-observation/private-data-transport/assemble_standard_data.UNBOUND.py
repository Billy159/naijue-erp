"""One fixed private standard-data package, finite parts, no extraction or PG.
Inert until external C binds the exact original root job and all authority pins.
"""
import hashlib,json,os,re,stat,subprocess,time
from pathlib import Path
GRANT='5cc58239751e4e2a'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
JOB_ROOT=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs')
MANIFEST='1e1e495ad7177b64be65620f3e15a632405e738a1d076e9173e77b282fb3eec9'
FULL_SHA='fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e'
FULL_BYTES=93508914
PARTS=((0, 2097152, '3cbb18ea4b45b20a3672e1826498699b10c5baad2328286a340abd49404ac4c8'), (2097152, 2097152, 'dedc7cd99d5a88a10cb8f47bcaa6ef489ac7708fd6c650da92d7509cd2cd6df8'), (4194304, 2097152, '34c01309bb3158eef739f0ca692ca9767c31708389676cf1c0cf219208c9f5d7'), (6291456, 2097152, '5c4cec8b8211069cbeea5da6f1cc459d3e8f0fb09923f8a68da9069b3b6c1743'), (8388608, 2097152, '6a3b5efbba17ea28ca2e2b64d0ded045514e10adbfe077f437a1518ed6e376b4'), (10485760, 2097152, 'c0230734913ce61310b622021ccfd5df04ac10a9b584a9e27acb52ff435abe0d'), (12582912, 2097152, 'f747ffc6e6e72300d9cd23c5e41849a14cd6f4477f312ff1c27258a21d250dc0'), (14680064, 2097152, 'a7670baeae8b2031fa95f6ab84f9a848ade0497cbb53b7994319f25e7ed59bf8'), (16777216, 2097152, '487695e643075da984e445463ea4adb769723cbe2af85d5d1576daabd81daaab'), (18874368, 2097152, 'cb95a60a41e946b982e25a33cc37b448c1849b669e5a1da6acb9c1b55477ddcc'), (20971520, 2097152, '2d9c5375d6c333306d05c7a32998960346e84d5a6904b66081acfe5bff2404e6'), (23068672, 2097152, '29d79076fdf6923309ae3faec105ec131ddfc776ca7fb3b5e433cd458f8975fd'), (25165824, 2097152, '44333fc0432208ff22d958b271c75e88ca85bd98c23468effd43d5fab95c12ad'), (27262976, 2097152, 'e0f9ddf6a5dd92d2cace01d603d3074c40f2ef9eb278c3c1c51fe2a83f9e3f2b'), (29360128, 2097152, '8ba81ec98297087858fe80a13abbcea36f25662bc0089a63fb61bde26f20dff2'), (31457280, 2097152, '5dc60b2dbc1c7e3152ddd8ff928a7881a5a4a87869b0cacb06cf2bbb61e450e9'), (33554432, 2097152, '458e30fd0b0982bd9f4f2df0e4d93132c93be4c17dd24e08d56d39322ca4b7e5'), (35651584, 2097152, '7ec2490a261da4857958264e8385777a07d156c64bdcad3bca33c5a669ccc29c'), (37748736, 2097152, '95cfc322b359baefa4db0f1371b353c8626ccaf7c9d7f55fd426d3d19ba3e707'), (39845888, 2097152, 'a4c1dce77a86b840df51df761bde51c33af50528b240a9b711d53509e0a91ed4'), (41943040, 2097152, 'e3ccb9763ec11b97d7465213a55a20cfcc3daf3948e2f0049cb2931512bfac35'), (44040192, 2097152, 'c1518fcfcc87123c910dedeacc3c1c5cf235f80d41488a5bb097943acc46358f'), (46137344, 2097152, '8273847966b7b7df6f15d37292c3f122ecaf674dc2e53826467531464b78ab0c'), (48234496, 2097152, '41b49dab28fcdb0177e55b997e4af45875e8e49f829986e93ee6ad4ea4edb7f9'), (50331648, 2097152, '6b588357e70efb55b0a26b003981a35a2a3c708f626dad1fb6609d7cdda0ec84'), (52428800, 2097152, 'a0dd962323d8fb663840df561b2713aee0b91080613c0c5c37f17ecb5887c05a'), (54525952, 2097152, '4de4d84e0b7057865a5ae8b3de0801809a279c8e24f71a39a561d085fd89b4eb'), (56623104, 2097152, '9fbcb36f69d28064673ef8b6b6a4ac9afa19b3e00c782629f43db736d3a237d2'), (58720256, 2097152, 'a2f19600a6ac4aa8b18d158b75decdb5a665e49aeb94d52e6626e70b3eab6320'), (60817408, 2097152, '01f463adaed8d7d23f09dd5beb4b1a43a72b2f4e32b19bfb9a058ae303631ead'), (62914560, 2097152, '8bda46e262d5f497e071708425542ba6da05c7a3b540d9d353c577c1501fb39b'), (65011712, 2097152, '954a9935b358d27c0965d382014df73c8e2c82b8e535c6fe21dfcafcbdab0b6e'), (67108864, 2097152, '279b79a395a9efda5a09a80e5b721c9f17694a3db0bf44123dce5603c9930c66'), (69206016, 2097152, 'a796aa460040cd93875abc769e7c2577033e27f3c32d5c5690d45a99e97ef67d'), (71303168, 2097152, 'a9ba7278665e6d0e77f8ddc81cfc2a0fb5a7a18a00536a96238662db45780cce'), (73400320, 2097152, '63309c387337024afd380e345b8aacbd781f2141a87ac3f9295247bb23a5ee4e'), (75497472, 2097152, '532ae8d1b4990b3b3d661fb6c36a48c455572dbbe09d47bd8e1050b03f113c6b'), (77594624, 2097152, '726e15228dea7ddfbbf5e90f2562d5b1c3e52468f9d43c8db166baddcd8c2632'), (79691776, 2097152, '07bab9e526f245e61fe96386beb1690116cd730593ac69ce33064433a0ae8100'), (81788928, 2097152, '472364c8c986190a11a39b93c795ee807c8d7c9dfdb5c1216a2cb91f2708c807'), (83886080, 2097152, '2d77f1ff9653273492dc15a1d6172fdce26462f7c4e2488dc5d1f6bade5f3ea6'), (85983232, 2097152, '039f3637a363307c508047eae2b032d9d518fef5937ae5ba345758117e9d13b7'), (88080384, 2097152, 'd691e601baf57a37a01d7764443f31118749720b154a10c54103fcdaf87e43f1'), (90177536, 2097152, '81a47929f84d70485181becbdf409931098265787935a11a10c08df6616f023d'), (92274688, 1234226, 'a0c17af2a4a03ae75f471c5c5f5deece1e65faa744e8fad959d96dd41ab4eb43'))
RECEIVER_SHA='8841f413eed7580ad232ecaf1ec2d12644fe51be0a71a8a780195be2afb42fff'
ASSEMBLY_JOB=None
PART_KEYS=None
PART_AUTHORITY_SHAS=None
FINAL_KEY=None
FINAL_AUTHORITY_SHA=None

def need(value,code):
    if not value:raise ValueError(code)

def identity(s):
    return [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns]

def fixed_open(path,uid,maximum,exact=None):
    for q in [*reversed(path.parents),path]:
        s=q.lstat();need(not stat.S_ISLNK(s.st_mode) and not s.st_mode&0o022,'PROTECTED_FIXED_PATH_REQUIRED')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and 0<s.st_size<=maximum and
             (exact is None or s.st_size==exact),'FIXED_REGULAR_INPUT_REQUIRED')
        need(identity(s)==identity(path.lstat()),'FIXED_INPUT_CHANGED')
        return fd,s
    except BaseException:
        os.close(fd);raise

def stable(fd,path,before):
    need(identity(before)==identity(os.fstat(fd))==identity(path.lstat()),'FIXED_INPUT_CHANGED')

def small(path,uid):
    fd,s=fixed_open(path,uid,65536)
    try:
        b=os.read(fd,65537);need(len(b)==s.st_size,'BOUNDED_INPUT_REQUIRED');stable(fd,path,s);return b
    finally:os.close(fd)

def parse(raw):
    def pairs(rows):
        out={}
        for k,v in rows:need(k not in out,'DUPLICATE_INPUT_KEY');out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=pairs)


def require_bound():
    need(isinstance(ASSEMBLY_JOB,str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',ASSEMBLY_JOB),'C_PRIVATE_DATA_BINDINGS_REQUIRED')
    need(isinstance(PART_KEYS,tuple) and len(PART_KEYS)==45 and len(set(PART_KEYS))==45 and all(isinstance(k,str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',k) for k in PART_KEYS),'C_PRIVATE_DATA_BINDINGS_REQUIRED')
    need(isinstance(PART_AUTHORITY_SHAS,tuple) and len(PART_AUTHORITY_SHAS)==45 and all(isinstance(k,str) and re.fullmatch('[a-f0-9]{64}',k) for k in PART_AUTHORITY_SHAS),'C_PRIVATE_DATA_BINDINGS_REQUIRED')
    need(isinstance(FINAL_KEY,str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',FINAL_KEY) and FINAL_KEY not in PART_KEYS and isinstance(FINAL_AUTHORITY_SHA,str) and re.fullmatch('[a-f0-9]{64}',FINAL_AUTHORITY_SHA),'C_PRIVATE_DATA_BINDINGS_REQUIRED')

def part_input(index):
    offset,size,digest=PARTS[index];key=PART_KEYS[index]
    directory=CONTROL/'private-standard-import-data'/key
    r=parse(small(directory/'ready.json',1000))
    need(set(r)=={'status','artifactKey','manifestSha256','archiveSha256','archiveBytes','authoritySha256','fileIdentity','fragmentIndex','fragmentOffset'} and r['status']=='READY' and r['artifactKey']==key and r['manifestSha256']==MANIFEST and r['archiveSha256']==digest and r['archiveBytes']==size and r['authoritySha256']==PART_AUTHORITY_SHAS[index] and type(r['fragmentIndex']) is int and r['fragmentIndex']==index+1 and type(r['fragmentOffset']) is int and r['fragmentOffset']==offset,'EXACT_PRIVATE_FRAGMENT_READY_REQUIRED')
    path=directory/'archive.bin';fd,s=fixed_open(path,1000,size,exact=size)
    try:
        need(s.st_gid==1000 and stat.S_IMODE(s.st_mode)==0o600 and identity(s)==r['fileIdentity'] and stat.S_IMODE(directory.lstat().st_mode)==0o700 and stat.S_IMODE(directory.parent.lstat().st_mode)==0o700,'PRIVATE_FRAGMENT_IDENTITY_DIFFERS')
        return path,fd,s
    except BaseException:os.close(fd);raise

def main():
    require_bound()
    job=JOB_ROOT/ASSEMBLY_JOB
    need(os.getuid()==0 and os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and os.environ.get('ERP_SHARED_JOB_DIR')==str(job),'ORIGINAL_ROOT_JOB_REQUIRED')
    receiver=small(job/'bundle/artifact-receiver.standard.py',0);need(hashlib.sha256(receiver).hexdigest()==RECEIVER_SHA,'FIXED_REVIEWED_RECEIVER_REQUIRED')
    final_raw=small(job/'bundle/final-stage-authorization.json',0);need(hashlib.sha256(final_raw).hexdigest()==FINAL_AUTHORITY_SHA,'EXTERNAL_FINAL_AUTHORITY_REQUIRED')
    final=parse(final_raw);gate=small(Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT+'/artifact-staging-authorization.json'),0)
    need(gate==final_raw and final.get('format')=='T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1' and final.get('decision')=='AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_STAGING' and final.get('taskId')=='T45' and final.get('grantId')==GRANT and final.get('kind')=='PRIVATE_STANDARD_IMPORT_DATA' and final.get('manifestSha256')==MANIFEST and final.get('artifactKey')==FINAL_KEY and final.get('archiveBytes')==FULL_BYTES and final.get('archiveSha256')==FULL_SHA and final.get('targetDirectory')==str(CONTROL/'private-standard-import-data'/FINAL_KEY) and final['startsAt']<=int(time.time()*1000)<final['expiresAt'],'CURRENT_EXTERNAL_FINAL_SCOPE_REQUIRED')
    assembled=job/'standard-import-data.tar.gz';output=os.open(assembled,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        os.fchmod(output,0o600);full=hashlib.sha256();seen=0
        with os.fdopen(output,'wb',closefd=False) as target:
            for index,(offset,size,digest) in enumerate(PARTS):
                need(seen==offset and int(time.time()*1000)<final['expiresAt'],'EXACT_PART_ORDER_AND_WINDOW_REQUIRED')
                path,fd,before=part_input(index)
                try:
                    part=hashlib.sha256();count=0;left=size
                    while left:
                        need(int(time.time()*1000)<final['expiresAt'],'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED')
                        block=os.read(fd,min(left,1024*1024));need(bool(block),'EXACT_FRAGMENT_SHORT_STREAM')
                        need(int(time.time()*1000)<final['expiresAt'],'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED')
                        target.write(block);part.update(block);full.update(block);count+=len(block);seen+=len(block);left-=len(block)
                    need(int(time.time()*1000)<final['expiresAt'],'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED')
                    need(os.read(fd,1)==b'','EXACT_FRAGMENT_EXTRA_STREAM')
                    need(count==size and part.hexdigest()==digest,'EXACT_FRAGMENT_BYTES_DIFFER');stable(fd,path,before)
                finally:os.close(fd)
            need(seen==FULL_BYTES and full.hexdigest()==FULL_SHA,'RECONSTRUCTED_PRIVATE_ARCHIVE_DIFFERS')
            need(int(time.time()*1000)<final['expiresAt'],'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED')
            target.flush()
            need(int(time.time()*1000)<final['expiresAt'],'PRIVATE_STANDARD_DATA_ASSEMBLY_DEADLINE_EXPIRED')
            os.fsync(output)
        d=os.open(job,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(d)
        finally:os.close(d)
        before=os.fstat(output);need(stat.S_IMODE(before.st_mode)==0o600 and before.st_uid==0 and before.st_nlink==1 and before.st_size==FULL_BYTES,'PRIVATE_RECONSTRUCTED_FILE_REQUIRED')
        os.lseek(output,0,os.SEEK_SET);context={'grantId':GRANT,'control':str(CONTROL),'authoritySha256':FINAL_AUTHORITY_SHA,'authority':final,'action':'upload'}
        code=receiver.decode();need(code.count('CONTEXT_LITERAL')==1,'ORIGINAL_RECEIVER_CONTEXT_REQUIRED');code=code.replace('CONTEXT_LITERAL',repr(context),1)
        r=subprocess.run(['/usr/bin/python3','-I','-S','-c',code],stdin=output,capture_output=True,timeout=40,user=1000,group=1000,extra_groups=[],cwd='/home/naijue',env={'PATH':'/usr/bin:/bin','HOME':'/home/naijue','LANG':'C.UTF-8'})
        need(len(r.stdout)<=65536,'BOUNDED_RECEIVER_RESULT_REQUIRED');result=parse(r.stdout);stable(output,assembled,before)
        need(r.returncode==0 and result.get('status')=='READY','RECEIVER_NOT_READY_NO_REPLAY')
        receipt=result.get('receipt',{});need(receipt.get('artifactKey')==FINAL_KEY and receipt.get('manifestSha256')==MANIFEST and receipt.get('archiveSha256')==FULL_SHA and receipt.get('archiveBytes')==FULL_BYTES and receipt.get('authoritySha256')==FINAL_AUTHORITY_SHA,'RECEIVER_READY_BINDING_DIFFERS')
        out={'status':'EXACT_PRIVATE_STANDARD_DATA_ORIGINAL_RECEIVER_READY','manifestSha256':MANIFEST,'archiveSha256':FULL_SHA,'archiveBytes':FULL_BYTES,'partCount':45,'originalReceiver':result,'receiverUid':1000,'externalAuthorityCreated':False,'readyManuallyWritten':False,'archiveExtracted':False,'PGConnections':0}
        raw=(json.dumps(out,sort_keys=True)+'\n').encode();path=job/'results/standard-data-assembly.json';fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    finally:os.close(output)

if __name__=='__main__':main()
