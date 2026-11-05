"""One exact server-local byte reconstruction; original receiver publishes READY.
Unbound until C supplies both external leaves and the independently pinned tail.
No SSH/client changes, partial overwrite, DB, permissions or receiver changes.
"""
import hashlib,json,os,re,stat,subprocess,time
from pathlib import Path

GRANT='5cc58239751e4e2a'
CONTROL=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
JOB=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT+'/jobs/t45-f35-3de75b-local-assemble-20261106-01')
BASE_KEY='f35-4d0589-ordinary-local-20261106-01'
BASE_BYTES=83664442
BASE_SHA='72a3c84524b822ceb741dfe80f4ae7681c649f3a62f5fd5d7fc858c52ca77eb2'
BASE_AUTHORITY_SHA='4d5a2af34066ffa7cc0af062193599bbfed1848867e1404f52163ac5fd37c862'
BASE_IDENTITY=[66304, 393400, 83664442, 1793912679573395275, 1793912680356424283]
BASE_SOURCE='5fbcb11970c41c706e4a6b2ce83a88dc8a85d988f2259228d2bcd31d99e22fb7'
PREFIX_BYTES=81221497
TAIL_BYTES=2451139
TAIL_KEY='f35-3de75b-tail-20261106-01'
TAIL_SHA='171298083937b63f7a4346bcab7a661e7d5bd0ec39d0c9cee254f8fd283e3e80'
TAIL_AUTHORITY_SHA='17704b73dbc2ad8d75590a3c4b0576589e0d545e5edfd59b80696953d43a5def'
FINAL_AUTHORITY_SHA='11fa3eea7743274463e7c24bb626b7e2a1668761137276c3fda51c805a924dc7'
FINAL_KEY='f35-3de75b-ordinary-local-20261106-01'
FULL_BYTES=83672636
FULL_SHA='035081fa42e686e4b687ed3ace0d2ab99e2b02f1e18a09ca8a4585b0bc9528fe'
SOURCE='19604d9f060a29ffef149a660841c3221e2964dc52ce83a08c89f203267183ac'
RECEIVER_SHA='ad0afee18d4edaebe743915a5336134e3a37ac67f014596b371276b83e070653'

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

def ready_input(key,size,digest,authority,source):
    directory=CONTROL/'artifacts'/key
    r=parse(small(directory/'ready.json',1000))
    need(set(r)=={'status','artifactKey','sourceSetSha256','archiveSha256','archiveBytes','authoritySha256','fileIdentity'} and
         r['status']=='READY' and r['artifactKey']==key and r['sourceSetSha256']==source and
         r['archiveSha256']==digest and r['archiveBytes']==size and r['authoritySha256']==authority,'ORIGINAL_READY_BINDING_REQUIRED')
    path=directory/'archive.bin';fd,s=fixed_open(path,1000,size,exact=size)
    try:
        need(s.st_gid==1000 and stat.S_IMODE(s.st_mode)==0o600 and identity(s)==r['fileIdentity'],'ORIGINAL_READY_IDENTITY_REQUIRED')
        return path,fd,s
    except BaseException:os.close(fd);raise

def main():
    need(os.getuid()==0 and os.geteuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45' and
         os.environ.get('ERP_SHARED_JOB_DIR')==str(JOB),'ORIGINAL_ROOT_JOB_REQUIRED')
    need(all(isinstance(v,str) and re.fullmatch('[a-f0-9]{64}',v) for v in [TAIL_SHA,TAIL_AUTHORITY_SHA,FINAL_AUTHORITY_SHA,RECEIVER_SHA]) and
         isinstance(TAIL_KEY,str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',TAIL_KEY),'EXTERNAL_TAIL_AND_LEAVES_NOT_BOUND')
    receiver=small(JOB/'bundle/artifact-receiver.original.py',0)
    need(hashlib.sha256(receiver).hexdigest()==RECEIVER_SHA,'ORIGINAL_RECEIVER_BYTES_REQUIRED')
    final_raw=small(JOB/'bundle/final-stage-authorization.json',0)
    need(hashlib.sha256(final_raw).hexdigest()==FINAL_AUTHORITY_SHA,'EXTERNAL_FINAL_AUTHORITY_REQUIRED')
    final=parse(final_raw)
    gate=small(Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT+'/artifact-staging-authorization.json'),0)
    need(gate==final_raw and final.get('artifactKey')==FINAL_KEY and final.get('archiveBytes')==FULL_BYTES and
         final.get('archiveSha256')==FULL_SHA and final.get('sourceSetSha256')==SOURCE and
         final.get('targetDirectory')==str(CONTROL/'artifacts'/FINAL_KEY) and
         final['startsAt']<=int(time.time()*1000)<final['expiresAt'],'CURRENT_EXTERNAL_FINAL_SCOPE_REQUIRED')
    # Verify the original fully accepted base and new tail, using the same open
    # descriptors throughout the copy and final metadata readback.
    base_path,base,bs=ready_input(BASE_KEY,BASE_BYTES,BASE_SHA,BASE_AUTHORITY_SHA,BASE_SOURCE)
    tail=None;output=None
    try:
        need(identity(bs)==BASE_IDENTITY,'RETAINED_BASE_IDENTITY_CHANGED')
        tail_path,tail,ts=ready_input(TAIL_KEY,TAIL_BYTES,TAIL_SHA,TAIL_AUTHORITY_SHA,SOURCE)
        assembled=JOB/'reconstructed-877a32.tar.gz'
        output=os.open(assembled,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        os.fchmod(output,0o600);full=hashlib.sha256();base_hash=hashlib.sha256();copied=0;seen=0
        with os.fdopen(output,'wb',closefd=False) as target:
            while True:
                block=os.read(base,1024*1024)
                if not block:break
                base_hash.update(block)
                prefix=block[:max(0,min(len(block),PREFIX_BYTES-seen))]
                if prefix:target.write(prefix);full.update(prefix);copied+=len(prefix)
                seen+=len(block)
            need(seen==BASE_BYTES and base_hash.hexdigest()==BASE_SHA and copied==PREFIX_BYTES,'RETAINED_BASE_BYTES_DIFFER')
            stable(base,base_path,bs);tail_hash=hashlib.sha256();tail_seen=0
            while True:
                block=os.read(tail,1024*1024)
                if not block:break
                tail_hash.update(block);full.update(block);target.write(block);tail_seen+=len(block)
            need(tail_seen==TAIL_BYTES and tail_hash.hexdigest()==TAIL_SHA,'EXACT_TAIL_BYTES_DIFFER');stable(tail,tail_path,ts)
            need(copied+tail_seen==FULL_BYTES and full.hexdigest()==FULL_SHA,'RECONSTRUCTED_FULL_ARCHIVE_DIFFERS')
            target.flush();os.fsync(output)
        d=os.open(JOB,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(d)
        finally:os.close(d)
        assembled_before=os.fstat(output)
        need(stat.S_IMODE(assembled_before.st_mode)==0o600 and assembled_before.st_uid==0 and assembled_before.st_nlink==1 and
             assembled_before.st_size==FULL_BYTES,'PRIVATE_RECONSTRUCTED_FILE_REQUIRED')
        os.lseek(output,0,os.SEEK_SET)
        context={'grantId':GRANT,'control':str(CONTROL),'authoritySha256':FINAL_AUTHORITY_SHA,'authority':final,'action':'upload'}
        code=receiver.decode();need(code.count('CONTEXT_LITERAL')==1,'ORIGINAL_RECEIVER_CONTEXT_REQUIRED')
        code=code.replace('CONTEXT_LITERAL',repr(context),1)
        # UID1000 receives only an already-open nonsecret archive descriptor.
        # The original receiver alone creates its own bin and READY files.
        r=subprocess.run(['/usr/bin/python3','-I','-S','-c',code],stdin=output,capture_output=True,timeout=40,
            user=1000,group=1000,extra_groups=[],cwd='/home/naijue',env={'PATH':'/usr/bin:/bin','HOME':'/home/naijue','LANG':'C.UTF-8'})
        need(len(r.stdout)<=65536,'BOUNDED_ORIGINAL_RECEIVER_RESULT_REQUIRED')
        result=parse(r.stdout);stable(output,assembled,assembled_before)
        need(r.returncode==0 and result.get('status')=='READY','ORIGINAL_RECEIVER_RESULT_NOT_READY_NO_REPLAY')
        receipt=result.get('receipt',{})
        need(receipt.get('artifactKey')==FINAL_KEY and receipt.get('archiveSha256')==FULL_SHA and
             receipt.get('archiveBytes')==FULL_BYTES and receipt.get('sourceSetSha256')==SOURCE and
             receipt.get('authoritySha256')==FINAL_AUTHORITY_SHA,'ORIGINAL_RECEIVER_READY_BINDING_DIFFERS')
        out={'status':'ORIGINAL_RECEIVER_READY_FROM_EXACT_LOCAL_BYTES','baseIdentity':identity(bs),'baseSha256':BASE_SHA,
             'prefixBytes':PREFIX_BYTES,'tailBytes':TAIL_BYTES,'tailSha256':TAIL_SHA,'assembledBytes':FULL_BYTES,'assembledSha256':FULL_SHA,
             'receiverUid':1000,'originalReceiverSha256':RECEIVER_SHA,'originalReceiver':result,
             'oldBaseAndPartialChanged':False,'rootAuthorityCreated':False,'pgStarted':False}
        p=JOB/'results/local-assembly-original-receiver.json'
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            with os.fdopen(fd,'wb',closefd=False) as f:f.write((json.dumps(out,sort_keys=True)+'\n').encode());f.flush();os.fsync(fd)
        finally:os.close(fd)
    finally:
        os.close(base)
        if tail is not None:os.close(tail)
        if output is not None:os.close(output)

if __name__=='__main__':
    try:main()
    except Exception as e:
        code=str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z][A-Z0-9_]{0,160}',str(e)) else type(e).__name__
        print(json.dumps({'status':'STOP_OR_UNKNOWN_ORIGINAL_KEY_NO_REPLAY','errorCode':code}));raise SystemExit(2)
