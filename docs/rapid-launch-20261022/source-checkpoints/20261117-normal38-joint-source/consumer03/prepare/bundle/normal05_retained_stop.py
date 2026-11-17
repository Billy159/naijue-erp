"""Close the exact retained R3 05 through its existing guardian."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
from types import ModuleType

GRANT = "b16447fbc81f4d64"
SERVICE = 't45-first-r3-native-service-start-20261116-38'
NAME = 't45-fresh35-first-production-20261110-r3-service-38'
IMAGE = "sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769"
TARGET = Path("/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3")
JOBS = Path("/root/erp-release-20261006-01-worker")/("grant-"+GRANT)/"jobs"
CONTROL = Path("/home/naijue/erp-release-20261006-01-control")/("grant-"+GRANT)
GRANT_FILE = Path("/usr/local/lib/naijue-erp-night")/("grant-"+GRANT)/"grant.json"
ROOT = Path("/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity")
PROOF_NAME = 'fresh35-current-production-service-v2-service-38.json'
HOST_BOOT = TARGET/"state/native-services"/SERVICE
INSIDE_ROOT = Path("/var/lib/naijue-erp/fresh35-production")
INSIDE_BOOT = INSIDE_ROOT/"native-services"/SERVICE
CLEANUP_FLAGS = ("cleanupComplete","cleanShutdown","dataPreserved","ownedPidAbsent","portAbsent")
PROOF_SHA = 'f72b8144ddd90daf53a022459c2bbc7651157f03e00f07ba92531def2b194162'
CONTINUITY_SHA = "1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d"
READONLY_SHA = '0a1cc57531f2846a111216cb89b8ad6ed7a1f481fdc92d139f0770a33aa0ddb3'
NORMAL05_SHA = 'cd7dd571be34a459a7f50809f4f2e999e1a736a8061f875e8a7aa2bfa48c0b26'
FIELD_FACTS = ("readbackHoldSha256","readbackResultSha256","backupCaptureSha256",
               "backupResultSha256","backupTerminalSha256")
AUTH_FILE = "normal05-stop-input.json"
DOCKER = "/usr/bin/docker"

def need(value, code):
    if not value:
        raise ValueError(code)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return time.time_ns() // 1_000_000

def load(raw, path, expected):
    need(sha(raw)==expected,"NORMAL05_STOP_PINNED_MODULE_DIFFERS")
    mod=ModuleType(path.stem)
    exec(compile(raw,str(path),"exec"),mod.__dict__)
    return mod

def bounded(end,maximum):
    left=(end-now())/1000
    need(left>0,"NORMAL05_STOP_ORIGINAL_WINDOW_CLOSED")
    return min(left,maximum)

def run(args, *, data=None, seconds=5):
    child=subprocess.run(args,input=data,capture_output=True,timeout=seconds)
    need(child.returncode==0 and len(child.stdout)<=65536,"NORMAL05_STOP_COMMAND_OR_OUTCOME_UNCONFIRMED")
    return child.stdout

def bind_stop(fence, hold, job, path, raw, at):
    a=fence.strict(raw)
    fields={"format","taskId","requestKey","service","serviceTerminalSha256","serviceResultSha256","startsAt","expiresAt"} | set(FIELD_FACTS)
    need(type(a) is dict and set(a)==fields and a["format"]=="T45_R3_NORMAL05_RETAINED_STOP_V1" and
         a["taskId"]=="T45" and a["requestKey"]==path.name==hold.jobs["stop"] and a["service"]==hold.service and
         all(fence.digest(a[k]) for k in (*FIELD_FACTS,"serviceTerminalSha256","serviceResultSha256")),
         "NORMAL05_STOP_EXACT_ORIGINAL_SCOPE_REQUIRED")
    need(type(a["startsAt"]) is type(a["expiresAt"]) is int and
         hold.policy["startsAt"]<=a["startsAt"]<=at<a["expiresAt"]<=hold.policy["expiresAt"],
         "NORMAL05_STOP_ORIGINAL_WINDOW_CLOSED")
    frozen,_=hold.frozen_request("stop",path,job)
    facts,prior=hold.predecessor_facts("stop")
    need(all(a[k]==facts[k] for k in FIELD_FACTS),"NORMAL05_STOP_ORIGINAL_READBACK_OR_BACKUP_DIFFERS")
    binding=fence.strict(fence.read(hold.root/"bindings/stop.json"))
    script=path/"bundle/normal05_retained_stop.py"
    need(binding=={"policySha256":hold.policy_sha,"jobId":path.name,"requestSha256":sha(frozen),
                   "scriptSha256":sha(fence.read(script,maximum=65536)),"templateSha256":hold.templates["stop"],
                   "predecessorSha256":prior} and fence.strict(fence.read(hold.active))==hold.hold_value() and
         job["script"]==script.name and job["args"]==[sha(raw)],
         "NORMAL05_STOP_ORIGINAL_DISPATCHER_BINDING_REQUIRED")
    return a

def service_evidence(fence, proof, a, current_shared):
    read=fence.read
    b=a["service"]
    current=read(TARGET/"authority"/PROOF_NAME)
    value=fence.strict(current)
    auth=read(HOST_BOOT/"service-start-authorization.json")
    start=fence.strict(auth)
    retained=read(HOST_BOOT/"service-retained.json")
    authority=TARGET/"authority"
    need(sha(current)==b["proofSha256"] and value["sharedPostgresNamespace"]==current_shared and
         current==proof.build(read(authority/"fresh35-combined-installation-v1.json",maximum=1048576),
            auth,retained,value["checkedAt"],read(authority/"fresh35-admin154-successor-v1.json"),
            read(authority/proof.RECORD38)),
         "NORMAL05_STOP_EXACT_V2_PROOF_REQUIRED")
    need(start["normalServiceSha256"]==NORMAL05_SHA and start["proofSourceSha256"]==PROOF_SHA and
         sha(read(HOST_BOOT/"normal_service05_after08.py"))==NORMAL05_SHA,
         "NORMAL05_STOP_EXACT_LIVE_GUARDIAN_SOURCE_REQUIRED")
    birth=current_shared["container"]
    work_deadline=current_shared["serviceLeaseExpiresAt"]
    outer=start["serviceLeaseExpiresAt"]
    need(birth["id"]==b["containerId"] and birth["startedAt"]==b["containerStartedAt"] and
         value["physical"]["postmasterStart"]==b["postmasterStart"] and work_deadline==proof.work_deadline(start)
         and a["expiresAt"]<=outer and now()<work_deadline and now()+35000<=a["expiresAt"],
         "NORMAL05_STOP_RETAINED_WINDOW_OR_GENERATION_DIFFERS")
    need(fence.strict(read(HOST_BOOT/"carrier-birth.json"))==birth and
         fence.strict(read(HOST_BOOT/"retained-ack.json"))=={"requestKey":SERVICE,"proofSha256":sha(current),
                                                               "serviceLeaseExpiresAt":work_deadline},
         "NORMAL05_STOP_ORIGINAL_RETAINED_ACK_REQUIRED")
    terminal=read(CONTROL/"results"/(SERVICE+".json"),root=False)
    t=fence.strict(terminal)
    result=read(JOBS/SERVICE/"results/normal-service-result.json")
    r=fence.strict(result)
    need(sha(terminal)==a["serviceTerminalSha256"] and t.get("jobId")==SERVICE and
         t.get("grantId")==GRANT and t.get("taskId")=="T45" and t.get("status")=="COMPLETED" and
         type(t.get("exitCode")) is int and t["exitCode"]==0 and t.get("finishedAtUTC") and
         sha(result)==a["serviceResultSha256"] and r.get("requestKey")==SERVICE and
         r.get("status")=="NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE" and
         r.get("cid")==birth["id"] and r.get("proofSha256")==sha(current) and
         r.get("serviceReceiptSha256")==sha(retained) and r.get("serviceLeaseExpiresAt")==work_deadline,
         "NORMAL05_STOP_ORIGINAL_SERVICE_RECEIPTS_REQUIRED")
    return {"proofSha256":sha(current),"retainedSha256":sha(retained),"startAuthoritySha256":sha(auth),
            "birth":birth,"workDeadline":work_deadline,"expiresAt":a["expiresAt"],
            "outerExpiresAt":outer,"guardian":value["guardian"],"postmaster":value["postmaster"],
            "dataIdentity":value["dataDirectoryIdentity"]}

def proc_row(pid):
    p=Path("/proc")/str(pid)
    fields=(p/"stat").read_text().rsplit(")",1)[1].split()
    return p,fields

def matches_process(expected, uid, parent=None):
    try:
        p,fields=proc_row(expected["pid"])
        return (p.stat().st_uid==uid and fields[0] not in ("Z","X") and fields[19]==expected["starttime"] and
                os.readlink(p/"exe")==expected["exe"] and (parent is None or fields[1]==str(parent)))
    except (FileNotFoundError,ProcessLookupError):
        return False

def generation_present(expected):
    try:
        return proc_row(expected["pid"])[1][19]==expected["starttime"]
    except (FileNotFoundError,ProcessLookupError):
        return False

def network(path):
    s=path.stat()
    return {"device":s.st_dev,"inode":s.st_ino}

def inspect_birth(birth, running):
    form=('{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},'
          '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
          '"startedAt":{{json .State.StartedAt}},"operation":{{json (index .Config.Labels "t45.operation")}}}')
    row=json.loads(run([DOCKER,"inspect","--type","container","--format",form,birth["id"]]))
    need(row=={"id":birth["id"],"name":"/"+NAME,"image":IMAGE,"startedAt":birth["startedAt"],"operation":SERVICE,
               "running":running,"pid":birth["hostPid"] if running else 0},"NORMAL05_STOP_CONTAINER_BIRTH_DIFFERS")
    path=HOST_BOOT/"r3_05_readonly.py"
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400,
         "NORMAL05_STOP_FIXED_READONLY_SOURCE_REQUIRED")
    readonly=load(path.read_bytes(),path,READONLY_SHA)
    mounts=json.loads(run([DOCKER,"inspect","--type","container","--format","{{json .Mounts}}",birth["id"]]))
    readonly.check_binds(TARGET,mounts)
    if running:
        p,f=proc_row(birth["hostPid"])
        need(f[0] not in ("Z","X") and f[19]==birth["startTicks"] and
             network(p/"ns/net")==birth["networkNamespace"] and proc_row(birth["hostPid"])[1][19]==f[19],
             "NORMAL05_STOP_HOST_PROCESS_OR_NETNS_DIFFERS")

def data_identity(path):
    z=path.lstat()
    need(stat.S_ISDIR(z.st_mode),"NORMAL05_STOP_PGDATA_NOT_DIRECTORY")
    return dict(device=z.st_dev,inode=z.st_ino,uid=z.st_uid,gid=z.st_gid,mode=stat.S_IMODE(z.st_mode))

def tcp_rows():
    rows=[]
    for leaf,width in (("tcp",8),("tcp6",32)):
        lines=(Path("/proc/net")/leaf).read_text().splitlines()
        need(bool(lines) and lines[0].split()[1:4:2]==["local_address","st"],
             "NORMAL05_STOP_TCP_TABLE_UNCONFIRMED")
        for row in lines[1:]:
            fields=row.split()
            local=re.fullmatch(r"([a-fA-F0-9]{"+str(width)+r"}):([a-fA-F0-9]{4})",fields[1]) if len(fields)>=4 else None
            need(local is not None and re.fullmatch(r"[A-Fa-f0-9]{2}",fields[3]),
                 "NORMAL05_STOP_TCP_TABLE_UNCONFIRMED")
            if int(local[2],16)==56791:
                rows.append((leaf,local[1].upper(),fields[3].upper(),fields[9] if len(fields)>9 else ""))
    return rows

def owned_socket(postmaster, inode):
    for path in (Path("/proc")/str(postmaster["pid"])/"fd").iterdir():
        try:
            if os.readlink(path)==f"socket:[{inode}]":
                return True
        except FileNotFoundError:
            continue
    return False

def tail_count(postmaster):
    rows=tcp_rows()
    listeners=[(table,local,inode) for table,local,kind,inode in rows if kind=="0A"]
    need(len(listeners)==1 and listeners[0][:2]==("tcp","0100007F") and
         re.fullmatch(r"[1-9][0-9]*",listeners[0][2]) and owned_socket(postmaster,listeners[0][2]),
         "NORMAL05_STOP_EXACT_PG_LISTENER_REQUIRED")
    need(all(kind in ("06","0A") for _,_,kind,_ in rows),
         "NORMAL05_STOP_ACTIVE_TCP_CONNECTION_UNCONFIRMED")
    return sum(kind=="06" for _,_,kind,_ in rows)

def drain_before_signal(c):
    initial=None
    deadline=min(c["workDeadline"],c["expiresAt"]-35000)
    monotonic_end=time.monotonic()+(deadline-now())/1000
    while True:
        left=min(deadline-now(),(monotonic_end-time.monotonic())*1000)
        need(left>0,"NORMAL05_STOP_TCP_DRAIN_DEADLINE_ORIGINAL_KEY_ONLY")
        need(matches_process(c["guardian"],0) and matches_process(c["postmaster"],61035,c["guardian"]["pid"]),
             "NORMAL05_STOP_ORIGINAL_GUARDIAN_OR_POSTMASTER_DIFFERS")
        count=tail_count(c["postmaster"])
        if initial is None:
            initial=count
        if count==0:
            return initial
        time.sleep(min(.25,left/1000))

def clean_receipt(value):
    need(value.get("requestKey")==SERVICE and value.get("retained") is True and
         value.get("reason")=="EXACT_GUARDIAN_STOP_REQUESTED" and value.get("phase")=="SERVICE_RETAINED" and
         value.get("runtimeMaterialPreserved") is True and
         all(value["cleanup"].get(k) is True for k in CLEANUP_FLAGS),
         "NORMAL05_STOP_CLEAN_GUARDIAN_RECEIPT_REQUIRED")

def signal_guardian(c):
    g,p=c["guardian"],c["postmaster"]
    need(matches_process(g,0) and matches_process(p,61035,g["pid"]),
         "NORMAL05_STOP_ORIGINAL_GUARDIAN_OR_POSTMASTER_DIFFERS")
    fd=os.pidfd_open(g["pid"])
    try:
        node=Path("/proc")/str(g["pid"])
        argv=(node/"cmdline").read_bytes().split(b"\0")
        expected=[os.fsencode(INSIDE_BOOT/"normal_service05_after08.py"),b"--inside",b""]
        need(argv[-3:]==expected and matches_process(g,0) and matches_process(p,61035,g["pid"]),
             "NORMAL05_STOP_EXACT_SIGNAL_BOUNDARY_REQUIRED")
        need(tail_count(p)==0,"NORMAL05_STOP_TCP_TAIL_REAPPEARED_ORIGINAL_KEY_ONLY")
        need(now()<min(c["workDeadline"],c["expiresAt"]-35000),
             "NORMAL05_STOP_EXACT_SIGNAL_BOUNDARY_REQUIRED")
        signal.pidfd_send_signal(fd,signal.SIGTERM)
    finally:
        os.close(fd)

def child_read(path):
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),"rb") as file:
        before=os.fstat(file.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and
             not before.st_mode&0o022 and 0<before.st_size<=65536,"NORMAL05_STOP_CHILD_PROTECTED_FILE_REQUIRED")
        raw=file.read(65537)
        after=os.fstat(file.fileno())
        need(len(raw)==before.st_size and (after.st_mtime_ns,after.st_ctime_ns)==(before.st_mtime_ns,before.st_ctime_ns),
             "NORMAL05_STOP_CHILD_PROTECTED_FILE_CHANGED")
        return raw

def in_container(c):
    need(sys.platform=="linux" and os.getuid()==os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,
         "NORMAL05_STOP_ISOLATED_CHILD_REQUIRED")
    proof_raw=child_read(Path("/etc/naijue-erp")/PROOF_NAME)
    r=json.loads(proof_raw)
    boot=INSIDE_BOOT
    need(sha(proof_raw)==c["proofSha256"] and r["guardian"]==c["guardian"] and r["postmaster"]==c["postmaster"] and
         r["sharedPostgresNamespace"]["container"]==c["birth"] and
         network(Path("/proc/self/ns/net"))==c["birth"]["networkNamespace"] and
         sha(child_read(boot/"service-retained.json"))==c["retainedSha256"] and
         sha(child_read(boot/"service-start-authorization.json"))==c["startAuthoritySha256"] and
         sha(child_read(boot/"normal_service05_after08.py"))==NORMAL05_SHA and
         json.loads(child_read(boot/"guardian-process.json"))==c["guardian"] and
         not os.path.lexists(boot/"cleanup.json"),"NORMAL05_STOP_IN_CONTAINER_PROOF_DIFFERS")
    data=INSIDE_ROOT/TARGET.name/"data"
    need(data_identity(data)==c["dataIdentity"],"NORMAL05_STOP_PGDATA_CHANGED")
    initial_tail=drain_before_signal(c)
    signal_guardian(c)
    deadline=time.monotonic()+bounded(c["expiresAt"]-10000,25)
    while generation_present(c["guardian"]):
        need(time.monotonic()<deadline,"NORMAL05_STOP_GUARDIAN_NOT_REAPED_ORIGINAL_KEY_ONLY")
        time.sleep(.1)
    raw=child_read(boot/"cleanup.json")
    clean_receipt(json.loads(raw))
    need(not generation_present(c["postmaster"]) and not os.path.lexists(data/"postmaster.pid") and
         data_identity(data)==c["dataIdentity"] and not tcp_rows(),
         "NORMAL05_STOP_POSTMASTER_OR_LISTENER_STILL_PRESENT")
    return {"cleanupSha256":sha(raw),"guardianAbsent":True,"postmasterAbsent":True,"portAbsent":True,
            "initialTimeWaitRows":initial_tail,"preSignalTimeWaitRows":0}

def close_exact(fence, job, c, script):
    birth=c["birth"]; cid=birth["id"]
    host_data=TARGET/"state"/TARGET.name/"data"
    need(data_identity(host_data)==c["dataIdentity"] and not os.path.lexists(HOST_BOOT/"cleanup.json"),
         "NORMAL05_STOP_PGDATA_OR_PREVIOUS_CLEANUP_DIFFERS")
    inspect_birth(birth,True)
    need(now()<c["workDeadline"] and now()+35000<=c["expiresAt"],"NORMAL05_STOP_ORIGINAL_WINDOW_CLOSED")
    fence.write_once(job/"results/normal05-stop-intent.json",fence.pack(
        {"requestKey":job.name,"serviceKey":SERVICE,"cid":cid,"startedAt":birth["startedAt"],
         "proofSha256":c["proofSha256"],"automaticReplay":False}))
    prefix=("CLOSE_05_CONTEXT="+repr(c)+"\n").encode()
    child_deadline=min(c["expiresAt"]-10000,c["workDeadline"]+25000)
    inside=json.loads(run([DOCKER,"exec","-i","--user","0:0",cid,"/usr/bin/python3","-I","-S","-"],
                          data=prefix+script,seconds=bounded(child_deadline,(c["expiresAt"]-now())/1000)))
    if set(inside)=={"safeCode"}:
        code=inside["safeCode"]
        need(False,code if type(code) is str and re.fullmatch(r"NORMAL05_STOP_[A-Z0-9_]+",code)
             else "NORMAL05_STOP_CHILD_OUTCOME_UNCONFIRMED")
    raw=fence.read(HOST_BOOT/"cleanup.json")
    clean_receipt(fence.strict(raw))
    initial=inside.get("initialTimeWaitRows")
    need(type(initial) is int and initial>=0 and
         inside=={"cleanupSha256":sha(raw),"guardianAbsent":True,"postmasterAbsent":True,"portAbsent":True,
                  "initialTimeWaitRows":initial,"preSignalTimeWaitRows":0} and
         data_identity(host_data)==c["dataIdentity"] and not os.path.lexists(host_data/"postmaster.pid"),
         "NORMAL05_STOP_ORIGINAL_CLEANUP_READBACK_DIFFERS")
    inspect_birth(birth,True)
    run([DOCKER,"stop","--time","5",cid],seconds=bounded(c["expiresAt"],10))
    inspect_birth(birth,False)
    need(fence.read(HOST_BOOT/"cleanup.json")==raw and data_identity(host_data)==c["dataIdentity"] and
         not os.path.lexists(host_data/"postmaster.pid"),"NORMAL05_STOP_FINAL_DATA_OR_CLEANUP_DIFFERS")
    return sha(raw),initial

def main():
    job=Path(os.environ.get("ERP_SHARED_JOB_DIR",""))
    path=Path(__file__)
    need(sys.platform=="linux" and os.getuid()==os.geteuid()==0 and os.environ.get("ERP_SHARED_TASK_ID")=="T45" and
         job.parent==JOBS and path==job/"bundle/normal05_retained_stop.py" and len(sys.argv)==2 and
         re.fullmatch("[a-f0-9]{64}",sys.argv[1]),"NORMAL05_STOP_EXACT_ROOT_JOB_REQUIRED")
    b=job/"bundle"; core=b/"r3_write_continuity.py"
    fence=load(core.read_bytes(),core,CONTINUITY_SHA)
    proof_path=b/"normal_service05_after08_proof.py"
    proof=load(fence.read(proof_path),proof_path,PROOF_SHA)
    cfg=fence.strict(fence.read(GRANT_FILE))
    need(Path(cfg["private"])/"jobs"==JOBS and Path(cfg["control"])==CONTROL and
         cfg["scope"]=="ERP_EXISTING_TASKS_THROUGH_T51" and cfg.get("revoked") is not True,
         "NORMAL05_STOP_ORIGINAL_GRANT_REQUIRED")
    hold=fence.Hold(ROOT,cfg,sha(fence.read(ROOT/"policy.json")))
    raw=fence.read(b/AUTH_FILE)
    need(sha(raw)==sys.argv[1],"NORMAL05_STOP_ORIGINAL_FROZEN_INPUT_SHA_DIFFERS")
    request=fence.strict(fence.read(job/"request.json"))
    a=bind_stop(fence,hold,request,job,raw,now())
    c=service_evidence(fence,proof,a,hold.check_generation())
    script=fence.read(path,maximum=65536)
    cleanup,initial_tail=close_exact(fence,job,c,script)
    hold.check_generation()
    facts,_=hold.predecessor_facts("stop")
    need(all(a[k]==facts[k] for k in FIELD_FACTS),"NORMAL05_STOP_ORIGINAL_READBACK_OR_BACKUP_DIFFERS")
    fence.stopped_generation(a["service"])
    fence.write_once(job/"results/normal05-stop-result.json",fence.pack({
        "status":"NORMAL05_RETAINED_CLEAN_STOP_CONFIRMED","requestKey":job.name,"serviceKey":SERVICE,
        "serviceProofSha256":a["service"]["proofSha256"],"containerId":a["service"]["containerId"],
        "containerStartedAt":a["service"]["containerStartedAt"],"postmasterStart":a["service"]["postmasterStart"],
        "backupCaptureSha256":a["backupCaptureSha256"],"readbackResultSha256":a["readbackResultSha256"],
        "cleanupSha256":cleanup,"containerStopped":True,"ownedPidAbsent":True,"portAbsent":True,
        "initialTimeWaitRows":initial_tail,"preSignalTimeWaitRows":0,
        "automaticReplay":False}))

if __name__=="__main__":
    if "CLOSE_05_CONTEXT" in globals():
        try:
            result=in_container(CLOSE_05_CONTEXT)
        except (OSError,ValueError,KeyError,TypeError) as error:
            code=str(error)
            result={"safeCode":code if re.fullmatch(r"NORMAL05_STOP_[A-Z0-9_]+",code)
                    else "NORMAL05_STOP_CHILD_OUTCOME_UNCONFIRMED"}
        print(json.dumps(result,sort_keys=True))
    else:
        try:
            main()
        except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError) as error:
            code=str(error) if re.fullmatch(r"(?:NORMAL05_STOP|R3_CONTINUITY)_[A-Z0-9_]+",str(error)) else type(error).__name__
            print(json.dumps({"status":"NORMAL05_STOP_UNCONFIRMED_ORIGINAL_KEY_ONLY","safeCode":code}))
            raise SystemExit(2) from None
