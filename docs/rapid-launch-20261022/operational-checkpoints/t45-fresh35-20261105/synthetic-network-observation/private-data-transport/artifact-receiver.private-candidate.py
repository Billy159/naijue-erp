
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
