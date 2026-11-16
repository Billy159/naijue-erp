"""Use the existing T45 grant for one serial four-original continuation batch after external binding."""
import argparse
import base64
from contextlib import ExitStack
import fcntl
import json
import os
from pathlib import Path
import runpy
import shlex
import shutil
import stat
import subprocess
import tempfile
import time
import re

import batch_protocol as b
from batch_transport import stream, Incomplete

HERE=Path(__file__).resolve().parent
FIXED=HERE
PROJECT=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1')
ADMIN=PROJECT.parent/"monitor/normal-admission-20261112-01/admin_client.py"
ADMIN_SHA="54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6"
FROZEN_CLIENT_SHA = '66c569455eead6aee80c6fc974adc57a2eceed22be1f41a6cd6818afc6434faf'
POLICY="/usr/local/lib/naijue-erp-night/grant-"+b.GRANT+"/artifact-staging-authorization.json"
ROOT_BUNDLE=b.CODE_FILES
PY=["/usr/bin/python3","-I","-S"]

def safe_failure(error):
    if isinstance(error,subprocess.TimeoutExpired):code='SSH_QUERY_TIMEOUT'
    else:code=str(error) if re.fullmatch('[A-Z][A-Z0-9_]{0,159}',str(error)) else 'TRANSPORT_'+type(error).__name__.upper()
    result={'code':code,'errorClass':type(error).__name__}
    if isinstance(error,Incomplete):result['timing']=error.details
    return result


def exact_local(path,limit):
    s=path.lstat()
    b.need(path.resolve()==path and stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and s.st_mode&0o077==0
           and s.st_nlink==1 and 0<s.st_size<=limit,"EXACT_PRIVATE_INPUT_REQUIRED")
    raw=path.read_bytes()
    identity=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_gid,x.st_mode,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
    b.need(identity(path.stat())==identity(s) and len(raw)==s.st_size,"PRIVATE_INPUT_CHANGED")
    return raw


class Transfer:
    def __init__(self, cfg, raw, digest, manifest, authority, out, source_api, socket):
        global ACTIVE_TRANSFER
        ACTIVE_TRANSFER=self
        self.cfg,self.raw,self.digest,self.manifest=cfg,raw,digest,manifest
        self.a,self.out,self.source_api,self.socket=authority,out,source_api,socket
        self.base=["/usr/bin/ssh","-i",cfg["keyFile"],"-o","IdentitiesOnly=yes","-o","IdentityAgent=none",
                   "-o","BatchMode=yes","-o","PasswordAuthentication=no","-o","KbdInteractiveAuthentication=no",
                   "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=20","-o","ServerAliveCountMax=3"]
        self.protocol=(HERE/"batch_protocol.py").read_text()
        self.receiver=(HERE/"artifact-receiver.d3-chunk.py").read_bytes()
        self.remote=(HERE/"batch_remote.py").read_text()
        self.durable_bindings={}

    def ssh(self,command,independent=False):
        opts=[] if independent else ["-o","ControlMaster=auto","-o","ControlPersist=60","-o","ControlPath="+self.socket]
        return [*self.base,*opts,self.cfg["host"],command]

    def query(self,command,independent=False):
        p=subprocess.run(self.ssh(command,independent),stdin=subprocess.DEVNULL,capture_output=True,timeout=b.QUERY_SECONDS,check=False)
        b.need(p.returncode==0,"BATCH_SHORT_QUERY_FAILED")
        return b.decode(p.stdout)

    def command(self,part,action,upload_end=None):
        context={"authority":base64.b64encode(self.raw).decode(),"manifest":base64.b64encode(self.manifest).decode(),
                 "digest":self.digest,"key":part["artifactKey"],"action":action,
                 "target":b.CONTROL+"/private-standard-import-data/"+part["artifactKey"],"uploadEndsAt":upload_end}
        code=self.protocol+"\nBATCH_CONTEXT="+repr(context)+"\nBATCH_RECEIVER="+repr(base64.b64encode(self.receiver))+"\n"+self.remote
        marker=["D3_CHUNK_RECOVERY_BATCH_WRITER"] if action in ("receive","finalize") else []
        result=shlex.join([*PY,"-c",code,*marker])
        b.need(len(result.encode())<100000,"BATCH_SSH_COMMAND_UNBOUNDED")
        return result

    def evidence(self,name,value):
        self.source_api["record"](self.out/(name+".json"),value)

    def status(self,part):
        return self.query(self.command(part,"status"),independent=True)

    def receive(self,part,deadline,upload_end):
        b.write_time(self.a)
        key=part["artifactKey"]
        start=b.start_segment(part)
        b.need(start is not None,"FULL_ORIGINAL_NEEDS_NO_UPLOAD")
        planned=part["window"]["segments"][start-1:]
        before=part["window"]["boundary"]
        row,path,size,manifest=self.source_api["source_descriptor"](key)
        b.need(manifest==b.MANIFEST and all(row[n]==part[n] for n in ("fragmentOffset","archiveBytes","archiveSha256","fragmentIndex")),
               "ORIGINAL_BATCH_SOURCE_DIFFERS")
        raw=self.source_api["read_source"](path,size,row["fragmentOffset"],row["archiveBytes"])
        b.need(b.sha(raw)==part["archiveSha256"],"ORIGINAL_BATCH_ARCHIVE_DIFFERS")
        offset=planned[0]["offset"]
        b.need(not before or b.sha(raw[:offset])==before["prefixSha256"],"APPROVED_PREFIX_DIFFERS_FROM_ORIGINAL")
        total=b.upload_left(self.a,deadline)
        b.need(total>0,"BATCH_UPLOAD_BUDGET_EXHAUSTED")
        marker=ADMIN.parent/f"artifact-recovery-attempt-{key}-batch-{self.digest}.json"
        self.source_api["record"](marker,{"originalArtifactKey":key,"authoritySha256":self.digest,
                                          "action":"batch-receive","startingSegment":start,"approvedBoundary":before})
        receipts=[]

        def progress(event):
            index=len(receipts)
            b.need(index<len(planned),"UNEXPECTED_DUPLICATE_ACK")
            expected=planned[index]
            ident=event.get("fileIdentity")
            prior=receipts[0] if receipts else before
            b.need(event.get("status")=="EXACT_SEGMENT_DURABLE" and event.get("artifactKey")==key
                   and event.get("segment")==expected["segment"] and event.get("bytes")==expected["offset"]+expected["bytes"]
                   and event.get("prefixSha256")==expected["prefixAfterSha256"]
                   and isinstance(ident,list) and len(ident)==5 and ident[2]==event["bytes"]
                   and isinstance(event.get("originalBindingSha256"),str) and len(event["originalBindingSha256"])==64
                   and (not prior or (ident[:2]==prior["fileIdentity"][:2] and
                        event["originalBindingSha256"]==prior["originalBindingSha256"])),
                   "UNKNOWN_OR_INCONSISTENT_DURABLE_RECEIPT")
            self.evidence(key+"-segment-"+str(expected["segment"]),event)
            self.durable_bindings[key]=event['originalBindingSha256']
            receipts.append(event)
            return True

        try:
            command=self.ssh(self.command(part,"receive",upload_end))
            total=b.upload_left(self.a,deadline)
            b.need(total>0,"BATCH_UPLOAD_DEADLINE_BEFORE_SSH")
            stream(command,raw[offset:],total=total,stall=b.STALL_SECONDS,progress=progress,deadline=deadline)
            b.need(len(receipts)==len(planned),"MISSING_DURABLE_RECEIPTS")
            return receipts[-1]["fileIdentity"][:2]
        except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as error:
            self.observe_failure(part,"receive",error)
            raise

    def observe_failure(self,part,phase,error):
        try:observed=self.status(part)
        except (ValueError,OSError,subprocess.TimeoutExpired):observed={"status":"UNKNOWN_NO_REPLAY"}
        self.evidence(part["artifactKey"]+"-"+phase+"-original-stop-readback",{**safe_failure(error),"phase":phase,"observed":observed})
        return observed

    def strict_ready_recovery(self,part,observed,identity):
        if not isinstance(observed,dict):return False
        receipt=observed.get('receipt');file_id=observed.get('fileIdentity');ready=observed.get('ready')
        boundary=part['window']['boundary']
        expected_binding=getattr(self,'durable_bindings',{}).get(part['artifactKey']) or (boundary or {}).get('originalBindingSha256')
        expected_origin=self.digest if boundary is None else boundary.get('originalAuthoritySha256')
        expected_ready_authority=((boundary or {}).get('ready') or {}).get('authoritySha256',self.digest)
        if not expected_binding or not isinstance(receipt,dict) or not isinstance(ready,dict):return False
        if not isinstance(file_id,list) or len(file_id)!=5 or file_id[:2]!=list(identity) or file_id[2]!=part['archiveBytes']:return False
        expected={'status':'READY','artifactKey':part['artifactKey'],'manifestSha256':b.MANIFEST,
            'archiveBytes':part['archiveBytes'],'archiveSha256':part['archiveSha256'],'authoritySha256':expected_ready_authority,
            'fileIdentity':file_id,'fragmentIndex':part['fragmentIndex'],'fragmentOffset':part['fragmentOffset']}
        return observed.get('status')=='READY' and observed.get('artifactKey')==part['artifactKey'] \
            and observed.get('bytes')==part['archiveBytes'] and observed.get('nextSegment') is None \
            and observed.get('prefixSha256')==part['archiveSha256'] and receipt==expected \
            and observed.get('originalBindingSha256')==expected_binding \
            and (expected_origin is None or observed.get('originalAuthoritySha256')==expected_origin) \
            and observed.get('recoveryAuthoritySha256')==self.digest and ready.get('authoritySha256')==expected_ready_authority \
            and isinstance(ready.get('sha256'),str) and re.fullmatch('[a-f0-9]{64}',ready['sha256']) is not None

    def finalize(self,part,identity):
        b.write_time(self.a)
        key=part["artifactKey"]
        try:
            ready=self.query(self.command(part,"finalize"))
            b.need(ready["status"]=="READY" and ready["receipt"]["archiveSha256"]==part["archiveSha256"]
                   and ready["receipt"]["fileIdentity"][:2]==identity,"BATCH_FINALIZE_UNKNOWN")
            self.evidence(key+"-ready",ready)
            return ready
        except (ValueError,OSError,subprocess.TimeoutExpired,KeyError) as error:
            observed=self.observe_failure(part,"finalize",error)
            transport_error=isinstance(error,(OSError,subprocess.TimeoutExpired)) or isinstance(error,ValueError) and str(error)=='BATCH_SHORT_QUERY_FAILED'
            if transport_error and self.strict_ready_recovery(part,observed,identity):
                ready={'status':'READY','receipt':observed['receipt'],'confirmation':'ONE_ORIGINAL_KEY_READONLY_AFTER_UNKNOWN_REPLY',
                    'originalBindingSha256':observed['originalBindingSha256']}
                self.evidence(key+'-ready',ready)
                return ready
            raise

    def close(self):
        try:
            subprocess.run([*self.base,"-S",self.socket,"-O","exit",self.cfg["host"]],
                           stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5,check=False)
        except (OSError,subprocess.TimeoutExpired):pass


def admin(args,timeout):
    p=subprocess.run([*PY,str(ADMIN),*args],stdin=subprocess.DEVNULL,capture_output=True,timeout=timeout,check=False)
    b.need(p.returncode==0,"DISPATCHER_OUTCOME_UNKNOWN_NO_REPLAY")
    return b.decode(p.stdout)


def collect(job,out):
    for _ in range(6):
        try:r=admin(["collect","--task","T45","--job-id",job,"--output-dir",str(out)],85)
        except (ValueError,OSError,subprocess.TimeoutExpired):pass
        else:
            if r.get("status") in {"COMPLETED","FAILED"}:
                return r
        time.sleep(2)
    raise ValueError("EXACT_DISPATCHER_RECEIPT_UNKNOWN_NO_REPLAY")





CACHED_STAGE_SOURCE = "\nfrom pathlib import Path\nimport base64,hashlib,io,json,os,stat,sys,time,zlib\nGRANT='b16447fbc81f4d64'\nC=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)\nDEFAULT_CACHE='t45-r3-final33-stage-install-20261116-6a908188b9c6240680b67ddc'\ndef need(v,c):\n if not v:raise ValueError(c)\ndef sha(b):return hashlib.sha256(b).hexdigest()\ndef pack(v):return(json.dumps(v,sort_keys=True)+'\\n').encode()\ndef ident(s):return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)\ndef read(p,pin=None,size=None):\n need(p.resolve()==p,'CACHE_CANONICAL_FILE_REQUIRED')\n fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)\n try:\n  s=os.fstat(fd);need(stat.S_ISREG(s.st_mode)and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink)==(1000,1000,0o600,1)and 0<s.st_size<=131072,'CACHE_PRIVATE_FILE_REQUIRED')\n  b=os.read(fd,131073);need(len(b)==s.st_size and ident(s)==ident(os.fstat(fd))==ident(p.lstat())and(pin is None or sha(b)==pin)and(size is None or len(b)==size),'CACHE_FILE_CHANGED');return b\n finally:os.close(fd)\ndef directory(p):\n s=p.lstat();need(p.resolve()==p and stat.S_ISDIR(s.st_mode)and(s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(1000,1000,0o700),'CACHE_CONTROL_DIRECTORY_DIFFERS')\ndef sync(p):\n fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)\n try:os.fsync(fd)\n finally:os.close(fd)\ndef once(p,b):\n fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)\n with os.fdopen(fd,'wb')as f:need(f.write(b)==len(b),'CACHE_SHORT_WRITE');f.flush();os.fsync(f.fileno())\n sync(p.parent)\ndef main():\n need(sys.platform=='linux'and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==1000 and len(sys.argv)==2 and sys.argv[1]in('preflight','stage','status','publish'),'CACHE_EXACT_USER_ACTION_REQUIRED')\n compressed=sys.stdin.buffer.read(65537);need(0<len(compressed)<=65536,'CACHE_WIRE_TOO_LARGE')\n dec=zlib.decompressobj();data=dec.decompress(compressed,262145);need(dec.eof and not dec.unused_data and not dec.unconsumed_tail and len(data)<=262144,'CACHE_COMPRESSED_PACKET_REFUSED')\n p=json.loads(data);need(set(p)=={'jobId','authoritySha256','authority','manifest','files','cacheKey'},'CACHE_PACKET_FIELDS_REQUIRED')\n auth=base64.b64decode(p['authority'],validate=True);manifest=base64.b64decode(p['manifest'],validate=True);a=json.loads(auth)\n digest=sha(auth);need(digest==p['authoritySha256']and a['grantId']==GRANT and a['taskId']=='T45'and a['format']=='T45_D3_FOUR_ORIGINALS_V2'and sha(manifest)==a['batchManifestSha256'],'CACHE_APPROVED_INPUT_DIFFERS')\n keys=tuple('t45-r3-final33-stage-'+x+'-20261116-'+digest[:24]for x in('install','restore'));key=p['jobId'];need(key in keys,'CACHE_ORIGINAL_JOB_KEY_DIFFERS')\n names={'batch_policy.py','batch_protocol.py','batch_client.py','batch_remote.py','batch_transport.py','d3-chunk-policy.py','artifact-receiver.d3-chunk.py'}\n need(set(a['codeSha256'])==names and set(p['files'])==names,'CACHE_EXACT_STATIC_SET_REQUIRED')\n cache=p['cacheKey'];need(type(cache)is str and cache.startswith('t45-r3-final33-stage-install-20261116-')and len(cache)==len(DEFAULT_CACHE)and all(x in'0123456789abcdef'for x in cache[-24:]),'CACHE_FIXED_NAMESPACE_REQUIRED')\n source=C/'jobs'/cache/'bundle';directory(source)\n bodies={}\n for leaf,value in p['files'].items():\n  if value is None:bodies[leaf]=read(source/leaf,a['codeSha256'][leaf])\n  else:\n   bodies[leaf]=base64.b64decode(value,validate=True);need(0<len(bodies[leaf])<=131072 and sha(bodies[leaf])==a['codeSha256'][leaf],'CACHE_INLINE_MEMBER_DIFFERS')\n bodies.update({'stage-authorization.json':auth,'batch-manifest.json':manifest})\n bundle_manifest=pack({'taskId':'T45','jobId':key,'files':[{'name':n,'bytes':len(b),'sha256':sha(b)}for n,b in sorted(bodies.items())]})\n request={'taskId':'T45','jobId':key,'grantId':GRANT,'scope':'ERP_EXISTING_TASKS_THROUGH_T51','script':'batch_policy.py','args':[digest],'timeoutSeconds':35,'manifestSha256':sha(bundle_manifest),'gateEvidence':{},'taskEvidence':{},'businessCutoverConfirmed':False}\n job=C/'jobs'/key;bundle=job/'bundle';result=C/'results'/(key+'.json');tmp=C/'requests'/(key+'.tmp');published=C/'requests'/(key+'.json')\n need(not os.path.lexists(result),'CACHE_TERMINAL_ALREADY_PRESENT_NO_REPLAY')\n for parent in (C,C/'jobs',C/'requests'):directory(parent)\n if sys.argv[1]=='preflight':\n  print(json.dumps({'state':'CACHE_SOURCE_AND_PACKET_VERIFIED_NO_JOB_CREATED','jobId':key,'staticMembers':len(names),'inlineMembers':sum(x is not None for x in p['files'].values()),'codeSha256':a['codeSha256'],'requestPresent':os.path.lexists(published),'requestTempPresent':os.path.lexists(tmp),'jobPresent':os.path.lexists(job),'writes':0,'PGConnections':0},sort_keys=True));return\n if sys.argv[1]=='stage':\n  need(not os.path.lexists(tmp)and not os.path.lexists(published),'CACHE_REQUEST_ALREADY_PRESENT_NO_REPLAY')\n  if not os.path.lexists(job):\n   job.mkdir(mode=0o700);(job/'bundle').mkdir(mode=0o700);(job/'results').mkdir(mode=0o700);sync(job);sync(job.parent)\n for parent in(job,bundle,job/'results'):directory(parent)\n need(not list((job/'results').iterdir()),'CACHE_JOB_RESULTS_ALREADY_PRESENT')\n expected={**bodies,'bundle-manifest.json':bundle_manifest};existing={x.name for x in bundle.iterdir()};need(existing<=set(expected),'CACHE_UNEXPECTED_CONTROL_MEMBER')\n for leaf in existing:need(read(bundle/leaf)==expected[leaf],'CACHE_EXISTING_CONTROL_MEMBER_CHANGED')\n if sys.argv[1]=='stage':\n  for leaf,b in expected.items():\n   need(not os.path.lexists(tmp)and not os.path.lexists(published),'CACHE_REQUEST_APPEARED_PREPARING')\n   if leaf not in existing:once(bundle/leaf,b)\n need({x.name for x in bundle.iterdir()}==set(expected),'CACHE_BUNDLE_NOT_COMPLETE')\n for leaf,b in expected.items():need(read(bundle/leaf)==b,'CACHE_FINAL_BUNDLE_DIFFERS')\n if sys.argv[1]=='publish':\n  # Full 600+240, root install35, receipt85, publish reply40 and dispatcher reply40.\n  if key==keys[0]:need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=time.time_ns()//1000000 and a['expiresAt']-time.time_ns()//1000000>1040000,'CACHE_FULL_UPLOAD_AND_CLOSEOUT_BUDGET_UNAVAILABLE')\n  need(not os.path.lexists(tmp)and not os.path.lexists(published),'CACHE_REQUEST_ALREADY_PRESENT_NO_REPLAY')\n  once(tmp,json.dumps(request).encode());os.link(tmp,published,follow_symlinks=False);tmp.unlink();sync(published.parent)\n present=os.path.lexists(published);pending=os.path.lexists(tmp)\n print(json.dumps({'state':'EXACT_CONTROL_REQUEST_PUBLISHED'if present else'EXACT_CONTROL_BUNDLE_PREPARED_NOT_SUBMITTED','jobId':key,'requestPublished':present,'requestTempPresent':pending,'manifestSha256':sha(bundle_manifest),'request':request,'staticMembers':len(names),'dispatchCalled':False},sort_keys=True))\nif __name__=='__main__':\n try:main()\n except(OSError,ValueError,KeyError,TypeError)as e:\n  print(json.dumps({'state':'CACHE_STOP_OR_UNKNOWN','errorType':type(e).__name__,'safeCode':str(e)if isinstance(e,ValueError)else None}));raise SystemExit(2)\n"
# Embedded into the single new client. Original transfer/receipt protocol is unchanged.
ACTIVE_TRANSFER=None
SUBMISSION_STATES={}

def cached_packet(job,bundle,digest):
    raw=(bundle/'stage-authorization.json').read_bytes()
    manifest=(bundle/'batch-manifest.json').read_bytes()
    a,_=b.bind(raw,digest,manifest)
    b.need(job in b.jobs(digest),'CACHE_EXACT_JOB_KEY_REQUIRED')
    memo=HERE/'verified-static-cache.json'
    prior=None
    if memo.exists():
        prior=json.loads(exact_local(memo,4096))
        b.need(set(prior)=={'cacheKey','codeSha256'} and prior['codeSha256']==a['codeSha256'],'CACHE_MEMO_VERSION_DIFFERS')
    key=prior['cacheKey'] if prior else 't45-r3-final33-stage-install-20261116-6a908188b9c6240680b67ddc'
    original={leaf:None for leaf in b.CODE_FILES}
    # Exactly three reviewed changed leaves bootstrap this cache; the other four reuse the original protected cache.
    if prior is None:
        for leaf in ('batch_client.py','batch_protocol.py','batch_transport.py'):
            original[leaf]=base64.b64encode((bundle/leaf).read_bytes()).decode()
    for leaf in b.CODE_FILES:b.need(b.sha((bundle/leaf).read_bytes())==a['codeSha256'][leaf],'CACHE_APPROVED_LOCAL_CODE_DIFFERS')
    packet={'jobId':job,'authoritySha256':digest,'authority':base64.b64encode(raw).decode(),
            'manifest':base64.b64encode(manifest).decode(),'files':original,'cacheKey':key}
    import zlib
    wire=zlib.compress(json.dumps(packet,sort_keys=True).encode(),9)
    b.need(len(wire)<=65536,'CACHE_BOUNDED_WIRE_REQUIRED')
    return wire,a

def cached_query(action,wire):
    tx=ACTIVE_TRANSFER
    b.need(tx is not None,'CACHE_TRANSFER_CONTEXT_REQUIRED')
    command=shlex.join([*PY,'-c',CACHED_STAGE_SOURCE,action])
    name='control-'+action+'-'+str(time.time_ns())
    started=time.monotonic()
    evidence={'action':action,'beganAtMs':time.time_ns()//1000000,'packetBytes':len(wire),'requestPublicationAttempted':action=='publish'}
    try:
        q=subprocess.run(tx.ssh(command),input=wire,capture_output=True,timeout=40,check=False)
        evidence.update(returnCode=q.returncode,elapsedSeconds=round(time.monotonic()-started,3),stdoutBytes=len(q.stdout),stderrBytes=len(q.stderr),stderrSha256=b.sha(q.stderr))
        evidence['safeStderr']=[line[:240] for line in q.stderr.decode('utf8','replace').splitlines()
                                if line.startswith(('ssh:','Connection ','Permission denied','sudo:','ValueError:','Timeout'))][:6]
        evidence['stdoutSha256']=b.sha(q.stdout)
        try:result=b.decode(q.stdout)
        except (ValueError,UnicodeError):result=None
        if isinstance(result,dict):
            for field in ('state','safeCode'):
                value=result.get(field)
                if isinstance(value,str) and 0<len(value)<=160 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789' for c in value):evidence[field]=value
        b.need(q.returncode==0,'CACHE_TRANSPORT_FAILED_READ_ORIGINAL_KEY')
        b.need(isinstance(result,dict),'CACHE_STRUCTURED_RECEIPT_REQUIRED')
        return result
    except subprocess.TimeoutExpired:
        evidence.update(error='SSH_TIMEOUT_AFTER_40_SECONDS',elapsedSeconds=round(time.monotonic()-started,3));raise
    finally:tx.evidence(name,evidence)

def submit(job,out,bundle,digest):
    state=SUBMISSION_STATES.setdefault(job,{'publishAttempted':False,'requestPublished':False})
    wire,a=cached_packet(job,bundle,digest)
    try:
        staged=cached_query('stage',wire)
    except (ValueError,OSError,subprocess.TimeoutExpired):
        # This same-key read only observes the staging outcome; it never repeats a write.
        staged=cached_query('status',wire)
    b.need(staged.get('state')=='EXACT_CONTROL_BUNDLE_PREPARED_NOT_SUBMITTED'
           and staged.get('requestPublished') is False and staged.get('requestTempPresent') is False,
           'CACHE_NOT_PROVEN_UNSUBMITTED')
    state['bundlePrepared']=True
    if job==b.jobs(digest)[0]:
        memo=HERE/'verified-static-cache.json'
        if not memo.exists():
            ACTIVE_TRANSFER.source_api['record'](memo,{'cacheKey':job,'codeSha256':a['codeSha256']})
    api=runpy.run_path(str(ADMIN));cfg=api['state']()
    history_path=ADMIN.parent/'release-submissions.json'
    history=json.loads(history_path.read_bytes()) if history_path.exists() else {}
    if job in history:
        raise ValueError('CACHE_ORIGINAL_LEDGER_PRESENT_REQUEST_ABSENT_NO_REPLAY')
    # Exactly the original client's request and durable pre-publication ledger.
    history[job]={'taskId':'T45','grantId':b.GRANT,'state':'PREPARED_DO_NOT_REPLAY','request':staged['request']}
    with history_path.open('w')as f:json.dump(history,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.chmod(history_path,0o600)
    state['publishAttempted']=True
    try:
        published=cached_query('publish',wire)
    except (ValueError,OSError,subprocess.TimeoutExpired):
        published=cached_query('status',wire)
    if published.get('requestPublished') is False and published.get('requestTempPresent') is False:
        state.update(publishAttempted=False,publishRefusedBeforeRequest=True)
        raise ValueError('CACHE_REQUEST_NOT_PUBLISHED_NO_TERMINAL_EXPECTED')
    b.need(published.get('requestPublished') is True,'CACHE_PUBLICATION_UNKNOWN_READ_ORIGINAL_KEY')
    state['requestPublished']=True
    ACTIVE_TRANSFER.source_api['record'](out/('release-submission-'+job+'.json'),published['request'])
    try:
        ack=api['dispatch'](cfg,'start',job)
        ACTIVE_TRANSFER.evidence('dispatch-'+job,ack)
    except (ValueError,OSError,subprocess.TimeoutExpired):
        pass  # Only collect this published original key; never dispatch twice.
    return collect(job,out)


PATH_PROBE = """
import errno,json
from pathlib import Path
def inspect(path):
    try:
        Path(path).lstat()
        return {"state":"PRESENT"}
    except FileNotFoundError:
        return {"state":"ENOENT"}
    except OSError as error:
        return {"state":"UNKNOWN","errno":errno.errorcode.get(error.errno,error.errno)}
print(json.dumps({path:inspect(path) for path in PATHS}))
"""


def path_states(tx, paths, independent=False):
    code=PATH_PROBE.replace("for path in PATHS", "for path in "+repr(paths),1)
    try:
        result=tx.query(shlex.join([*PY,"-c",code]),independent=independent)
        b.need(set(result)==set(paths) and all(v.get("state") in {"ENOENT","PRESENT","UNKNOWN"} for v in result.values()),
               "PATH_STATUS_SHAPE_UNKNOWN")
        return result
    except (ValueError,OSError,subprocess.TimeoutExpired) as error:
        return {path:{"state":"UNKNOWN","reason":type(error).__name__} for path in paths}


def closeout(tx, parts, a, out, install, restore, digest, first, install_attempted, complete, failure):
    initial=SUBMISSION_STATES.get(install,{})
    if initial.get('publishAttempted') is False:
        request=b.CONTROL+'/requests/'+install+'.json'
        temporary=b.CONTROL+'/requests/'+install+'.tmp'
        actual=path_states(tx,[POLICY,request,temporary],independent=True)
        tx.evidence('RESULT',{'state':'NOT_SUBMITTED_PREPUBLICATION_STOP','submission':initial,
           'originalBoundary':actual,'failure':failure,'complete':complete,'restoreSubmitted':False,
           'originalKeyReplayed':False,'allActualBoundariesConfirmedAbsent':all(v['state']=='ENOENT'for v in actual.values())})
        b.need(all(v['state']=='ENOENT'for v in actual.values()),'CACHE_PREPUBLICATION_BOUNDARY_UNKNOWN')
        return False
    if len(complete)!=len(parts):
        while b.seconds_left(a)>0:time.sleep(min(15,max(0,b.seconds_left(a))))
    request=b.CONTROL+"/requests/"+install+".json"
    prior=path_states(tx,[POLICY,request],independent=True)
    restored=None
    if install_attempted or prior[POLICY]["state"]=="PRESENT" or prior[request]["state"]=="PRESENT":
        try:
            history=json.loads((ADMIN.parent/"release-submissions.json").read_bytes())
            if restore in history:
                restored=collect(restore,out)
            else:
                restored=submit(restore,out,out/"restore-bundle",digest)
        except (ValueError,OSError,subprocess.TimeoutExpired) as error:
            restored={"status":"UNKNOWN_NO_REPLAY","error":safe_failure(error)['code'],'errorClass':type(error).__name__}
    after=path_states(tx,[POLICY],independent=True)[POLICY]
    final={}
    for part in parts:
        try:final[part["artifactKey"]]=tx.status(part)
        except (ValueError,OSError,subprocess.TimeoutExpired):final[part["artifactKey"]]={"status":"UNKNOWN_NO_REPLAY"}
    tx.evidence("RESULT",{"installed":first,"installAttempted":install_attempted,
        "preWithdrawalReadback":prior,"restored":restored,"finalPolicy":after,
        "finalPolicyAbsent":after["state"]=="ENOENT","originalKeys":final,
        "completedBeforeWithdrawal":complete,"stop":failure})
    b.need(after["state"]=="ENOENT" and restored is not None and restored.get("status")=="COMPLETED" and restored.get("exitCode")==0,
           "BATCH_CLOSEOUT_NOT_CONFIRMED_READ_ORIGINAL_ONLY")
    b.need(all(r.get("status")=="READY" and r.get("basis")=="EXACT_WITHDRAWN_BATCH_READONLY" for r in final.values()),
           "BATCH_PARTIAL_OR_UNKNOWN_NO_REPLAY")

def main():
    os.umask(0o077)
    p=argparse.ArgumentParser()
    p.add_argument("--authorization",type=Path,required=True)
    p.add_argument("--manifest",type=Path,required=True)
    p.add_argument("--sha256",required=True)
    args=p.parse_args()
    raw=exact_local(args.authorization,65536)
    manifest=exact_local(args.manifest,32768)
    a,parts=b.bind(raw,args.sha256,manifest)
    keys=tuple(part["artifactKey"] for part in parts)
    b.write_time(a)
    b.need(b.sha(ADMIN.read_bytes())==ADMIN_SHA and b.sha((FIXED/"final33-source.py").read_bytes())==FROZEN_CLIENT_SHA,
           "ORIGINAL_T45_CLIENT_DIFFERS")
    api=runpy.run_path(str(ADMIN));cfg=api["state"]()
    b.need(cfg["grantId"]==b.GRANT and cfg["control"]==b.CONTROL,"ORIGINAL_GRANT_DIFFERS")
    source_api=runpy.run_path(str(FIXED/"final33-source.py"))
    receiver=(HERE/"artifact-receiver.d3-chunk.py").read_bytes()
    for leaf,expected in a["codeSha256"].items():
        b.need(b.sha((HERE/leaf).read_bytes())==expected,"APPROVED_BATCH_CODE_DIFFERS")
    for part in parts:b.part_api(receiver,a,part,args.sha256)
    install,restore=b.jobs(args.sha256)
    out=HERE/("execution-"+args.sha256[:24])
    out.mkdir(mode=0o700)
    for mode in ("install","restore"):
        folder=out/(mode+"-bundle");folder.mkdir(mode=0o700)
        for name in ROOT_BUNDLE:shutil.copyfile(HERE/name,folder/name)
        (folder/"stage-authorization.json").write_bytes(raw)
        (folder/"batch-manifest.json").write_bytes(manifest)
    with ExitStack() as stack:
        for part in parts:
            key=part["artifactKey"]
            for directory in (ADMIN.parent,ADMIN.parent.parent/"normal-admission-20261013-01"):
                prior=list(directory.glob("artifact-*-attempt-"+key+"*"))
                b.need(not any(args.sha256 in marker.name for marker in prior),"CURRENT_ORIGINAL_ATTEMPT_NO_REPLAY")
                b.need(not prior or part["window"]["boundary"] is not None,"ORIGINAL_LOCAL_ATTEMPT_PRESENT_NO_REPLAY")
            lock=stack.enter_context(os.fdopen(os.open(ADMIN.parent/("artifact-recovery-lock-"+key),
                os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600),"r+"))
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        tmp=stack.enter_context(tempfile.TemporaryDirectory(prefix="t45batch-",dir="/tmp"))
        tx=Transfer(cfg,raw,args.sha256,manifest,a,out,source_api,str(Path(tmp)/"ssh"))
        stack.callback(tx.close)
        paths=[POLICY]
        for grant in (b.GRANT,"5cc58239751e4e2a"):
            root=b.CONTROL.rsplit("/",1)[0]+"/grant-"+grant
            paths += [root+"/private-standard-import-data/"+key for key in keys]
            for job in (install,restore):
                paths += [root+"/requests/"+job+".json",root+"/requests/"+job+".tmp",root+"/jobs/"+job,root+"/results/"+job+".json"]
        before=path_states(tx,paths)
        tx.evidence("BEFORE",before)
        existing={b.CONTROL+"/private-standard-import-data/"+p["artifactKey"] for p in parts if p["window"]["boundary"]}
        b.need(all(fact["state"]==("PRESENT" if path in existing else "ENOENT") for path,fact in before.items()),
               "ORIGINAL_KEY_OR_POLICY_DIFFERS_OR_UNKNOWN")
        history=json.loads((ADMIN.parent/"release-submissions.json").read_bytes())
        b.need(not any(key in history for key in (install,restore)),"BATCH_JOB_ALREADY_SUBMITTED")
        b.write_time(a)
        complete=[]
        first=None
        failure=None
        install_attempted=False
        try:
            install_attempted=True
            first=submit(install,out,out/"install-bundle",args.sha256)
            fact=json.loads((out/"release-receipts"/install/"d3-batch-policy-result.json").read_bytes())
            b.need(first["exitCode"]==0 and fact["status"]=="BATCH_POLICY_INSTALLED" and fact["authoritySha256"]==args.sha256,
                   "BATCH_INSTALL_NOT_CONFIRMED")
            outcomes={row["artifactKey"]:row for row in fact["parts"]}
            b.need(set(outcomes)==set(keys) and all(row.get("matchedApprovedBoundary") for row in outcomes.values()),
                   "APPROVED_INSTALL_BOUNDARY_RECEIPT_DIFFERS")
            stages=[]
            for part in parts:
                key=part["artifactKey"]
                current=outcomes[key]["status"]
                if current=="READY":
                    complete.append(key)
                elif current in {"FULL_FRAGMENT_AWAITING_FINALIZE","READY_PENDING_TEMP_CLEANUP"}:
                    stages.append((part,part["window"]["boundary"]["fileIdentity"][:2]))
            payload_parts=[p for p in parts if b.start_segment(p) is not None and p["artifactKey"] not in complete]
            deadline,upload_end=b.start_batch_clock(a) if payload_parts else (None,None)
            for part in payload_parts:
                try:stages.append((part,tx.receive(part,deadline,upload_end)))
                except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as e:
                    failure=safe_failure(e)['code']
                    break
            for part,identity in stages:
                try:
                    tx.finalize(part,identity)
                    complete.append(part["artifactKey"])
                except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as e:
                    if failure is None:failure=safe_failure(e)['code']
                    break
        except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as e:
            failure=safe_failure(e)['code']
        finally:
            if closeout(tx,parts,a,out,install,restore,args.sha256,first,install_attempted,complete,failure) is False:raise SystemExit(2)


if __name__=="__main__":
    main()
