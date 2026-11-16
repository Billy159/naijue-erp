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
        self.cfg,self.raw,self.digest,self.manifest=cfg,raw,digest,manifest
        self.a,self.out,self.source_api,self.socket=authority,out,source_api,socket
        self.base=["/usr/bin/ssh","-i",cfg["keyFile"],"-o","IdentitiesOnly=yes","-o","IdentityAgent=none",
                   "-o","BatchMode=yes","-o","PasswordAuthentication=no","-o","KbdInteractiveAuthentication=no",
                   "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=20","-o","ServerAliveCountMax=3"]
        self.protocol=(HERE/"batch_protocol.py").read_text()
        self.receiver=(HERE/"artifact-receiver.d3-chunk.py").read_bytes()
        self.remote=(HERE/"batch_remote.py").read_text()

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
        self.evidence(part["artifactKey"]+"-"+phase+"-original-stop-readback",{"error":str(error),"observed":observed})

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
            self.observe_failure(part,"finalize",error)
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


def submit(job,out,bundle,digest):
    try:
        admin(["run","--task","T45","--job-id",job,"--source-dir",str(bundle),"--script","batch_policy.py",
               "--output-dir",str(out),"--timeout-seconds","35","--phase-arg",digest],370)
    except (ValueError,OSError,subprocess.TimeoutExpired):
        pass  # Same key is collected below even when the submit response was lost.
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
            restored={"status":"UNKNOWN_NO_REPLAY","error":str(error)}
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
                    failure=str(e)
                    break
            for part,identity in stages:
                try:
                    tx.finalize(part,identity)
                    complete.append(part["artifactKey"])
                except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as e:
                    if failure is None:failure=str(e)
                    break
        except (ValueError,OSError,Incomplete,subprocess.TimeoutExpired,KeyError) as e:
            failure=str(e)
        finally:
            closeout(tx,parts,a,out,install,restore,args.sha256,first,install_attempted,complete,failure)


if __name__=="__main__":
    main()
