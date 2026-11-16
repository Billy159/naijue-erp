"""One ordinary-user SSH channel per original, with server-durable progress."""
import base64
import io
import os
from pathlib import Path
import selectors
import sys
import time

POLICY=Path("/usr/local/lib/naijue-erp-night/grant-"+GRANT+"/artifact-staging-authorization.json")


def send(row):
    sys.stdout.buffer.write(pack(row));sys.stdout.buffer.flush()


def chunk(fd,size,remaining):
    data=bytearray()
    with selectors.DefaultSelector() as selector:
        selector.register(fd,selectors.EVENT_READ)
        while len(data)<size:
            wait=min(STALL_SECONDS,remaining())
            need(wait>0 and selector.select(wait),"BATCH_INPUT_STALL_OR_SHARED_DEADLINE")
            block=os.read(fd,size-len(data))
            need(block,"BATCH_INPUT_ENDED_BEFORE_SEGMENT")
            data.extend(block)
    return bytes(data)


def main():
    need(sys.platform=="linux" and os.getuid()==os.geteuid()==1000,"EXACT_RECEIVER_UID_REQUIRED")
    expected=base64.b64decode(BATCH_CONTEXT["authority"],validate=True)
    manifest=base64.b64decode(BATCH_CONTEXT["manifest"],validate=True)
    digest=BATCH_CONTEXT["digest"]
    a,parts=bind(expected,digest,manifest)
    part,=[x for x in parts if x["artifactKey"]==BATCH_CONTEXT["key"]]
    source=base64.b64decode(BATCH_RECEIVER,validate=True)
    x,g,ctx=part_api(source,a,part,digest)
    need(BATCH_CONTEXT["target"]==x["targetDirectory"],"EXACT_BATCH_TARGET_REQUIRED")

    def current():
        for p in (*reversed(POLICY.parents),POLICY):
            st=p.lstat()
            need(st.st_uid==0 and st.st_mode&0o022==0 and not p.is_symlink(),"ORIGINAL_ROOT_POLICY_REQUIRED")
        raw=g["read_regular"](POLICY,65536,True)
        need(raw==expected and sha(raw)==digest,"ACTIVE_BATCH_POLICY_DIFFERS")
        return x

    action=BATCH_CONTEXT["action"]
    remaining=remote_upload_clock(a,BATCH_CONTEXT["uploadEndsAt"]) if action=="receive" else None
    act(action,a,part,x,g,ctx,current,remaining)


def act(action,a,part,x,g,ctx,current,remaining=None):
    g["authority"]=current
    # The immutable single-piece identity envelope stays legacy-compatible.
    # Actual mutation deadlines always use the signed outer batch window.
    def receive_time():
        need(remaining is not None and remaining()>0,"BATCH_SHARED_DEADLINE_BEFORE_DURABLE_WRITE")
    def time_guard(authority):
        need(current()==authority,"ACTIVE_BATCH_POLICY_DIFFERS")
        write_time(a)
        if action=="receive":receive_time()
    g["recovery_time"]=time_guard
    if action=="status":
        try:current()
        except FileNotFoundError:basis="EXACT_WITHDRAWN_BATCH_READONLY"
        else:basis="CURRENT_BATCH_POLICY"
        send({**g["recovery_action"](x),"basis":basis})
        return

    write_time(a);current()
    snapshot=g["recovery_action"](x)
    if action=="finalize":
        need(snapshot["status"] in {"FULL_FRAGMENT_AWAITING_FINALIZE","READY_PENDING_TEMP_CLEANUP"},"EXACT_FULL_ORIGINAL_REQUIRED")
        prior=part["window"]["boundary"]
        if prior and prior["ready"] is not None:
            need(same_snapshot(part["window"],snapshot,g),"APPROVED_PENDING_READY_DIFFERS")
        ctx.update(action="recovery-finalize",before=g["recovery_snapshot"](snapshot))
        r=g["recovery_action"](x)
        need(r["status"]=="READY" and r["receipt"]["archiveSha256"]==part["archiveSha256"],"BATCH_READY_UNKNOWN")
        send(r)
        return
    start=start_segment(part)
    need(action=="receive" and start is not None and snapshot["nextSegment"]==start and
         same_snapshot(part["window"],snapshot,g),"APPROVED_RECEIVE_BOUNDARY_DIFFERS_NO_REPLAY")
    terminal_fd=sys.stdin.fileno()
    for row in part["window"]["segments"][start-1:] :
        receive_time()
        n=row["segment"]
        ctx.update(action="recovery-append",segment=n,before=g["recovery_snapshot"](snapshot))
        payload=chunk(terminal_fd,row["bytes"],remaining)
        receive_time()
        old=g["sys"].stdin
        try:
            g["sys"].stdin=type("Segment",(),{"buffer":io.BytesIO(payload)})()
            receipt=g["recovery_action"](x)
        finally:
            g["sys"].stdin=old
        need(receipt["status"]=="EXACT_SEGMENT_DURABLE" and receipt["prefixSha256"]==row["prefixAfterSha256"],
             "BATCH_SEGMENT_RECEIPT_UNKNOWN")
        # The old receiver fsyncs before returning. Read the inode/binding in this
        # same process for the next CAS, with no additional SSH round trip.
        ctx["action"]="recovery-status"
        snapshot=g["recovery_action"](x)
        need(snapshot["bytes"]==receipt["bytes"] and snapshot["prefixSha256"]==receipt["prefixSha256"],
             "BATCH_DURABLE_SNAPSHOT_DIFFERS")
        send({"status":"EXACT_SEGMENT_DURABLE","artifactKey":part["artifactKey"],"segment":n,
              "bytes":snapshot["bytes"],"prefixSha256":snapshot["prefixSha256"],
              "fileIdentity":snapshot["fileIdentity"],"originalBindingSha256":snapshot["originalBindingSha256"]})


if __name__=="__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        send({"status":"STOP_OR_UNKNOWN_NO_REPLAY","errorCode":str(error) if isinstance(error,ValueError) else type(error).__name__})
        sys.exit(2)
