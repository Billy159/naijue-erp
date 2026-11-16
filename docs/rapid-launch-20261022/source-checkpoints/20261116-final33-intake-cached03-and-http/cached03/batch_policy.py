"""One install and one withdrawal using the original protected policy path and dispatcher."""
from pathlib import Path
import json
import os
import runpy
import socket
import sys

# The stock dispatcher invokes the script directly with -s and a frozen sibling bundle.
import batch_protocol as b


def verify_ready_origin(ready,new_digest,part,receiver,old):
    if ready is None:return
    digest=ready["authoritySha256"]
    b.need(digest!=new_digest,"CURRENT_BATCH_CANNOT_BE_OLD_READY_PROOF")
    install,_=b.jobs(digest)
    prior=old["JOBS"]/install
    for child in ("bundle","results"):old["trusted_root_directory"](prior/child)
    read=old["read"]
    raw,_=read(prior/"bundle/stage-authorization.json",0,0o600)
    plan,_=read(prior/"bundle/batch-manifest.json",0,0o600,limit=32768)
    a,parts=b.bind(raw,digest,plan,prior=True)
    original,=[p for p in parts if p["artifactKey"]==part["artifactKey"]]
    b.part_api(receiver,a,original,digest)
    b.need(all(original[k]==part[k] for k in ("artifactKey","archiveBytes","archiveSha256","fragmentIndex","fragmentOffset"))
           and original["window"]["segments"]==part["window"]["segments"],"OLD_READY_BATCH_PLAN_DIFFERS")
    intent_raw,_=read(prior/old["INTENT"],0,0o400)
    result_raw,_=read(prior/"results/d3-batch-policy-result.json",0,0o600)
    intent=b.decode(intent_raw);result=b.decode(result_raw)
    b.need(intent.get("authoritySha256")==digest and intent.get("batchManifestSha256")==b.sha(plan)
           and result.get("status")=="BATCH_POLICY_INSTALLED" and result.get("authoritySha256")==digest
           and result.get("policyIdentity",[])[:2]==[intent.get("device"),intent.get("inode")]
           and any(row.get("artifactKey")==part["artifactKey"] for row in result.get("parts",[])),
           "OLD_READY_BATCH_INSTALL_EVIDENCE_DIFFERS")


def main():
    d=Path(os.environ["ERP_SHARED_JOB_DIR"])
    digest=sys.argv[1]
    install,restore=b.jobs(digest)
    b.need(os.geteuid()==0 and socket.gethostname()=="naijue-server" and
           os.environ.get("ERP_SHARED_TASK_ID")=="T45" and d.name in (install,restore),"EXACT_ROOT_BATCH_JOB_REQUIRED")
    old=runpy.run_path(str(d/"bundle/d3-chunk-policy.py"))
    read,write,sync,identity=map(old.get,("read","write","sync","identity"))
    old["trusted_root_directory"](d/"bundle")
    old["trusted_policy_parent"]()
    policy=old["POLICY"]
    raw,_=read(d/"bundle/stage-authorization.json",0,0o600)
    manifest,_=read(d/"bundle/batch-manifest.json",0,0o600,limit=32768)
    receiver,_=read(d/"bundle/artifact-receiver.d3-chunk.py",0,0o600)
    a,parts=b.bind(raw,digest,manifest)
    for leaf,expected in a["codeSha256"].items():
        content,_=read(d/"bundle"/leaf,0,0o600)
        b.need(b.sha(content)==expected,"APPROVED_BATCH_CODE_DIFFERS")
    apis=[b.part_api(receiver,a,p,digest) for p in parts]

    def inspect():
        out=[]
        for part,(authority,g,_) in zip(parts,apis):
            with old["inspected"](authority,g) as (status,consumers):
                out.append({"artifactKey":authority["artifactKey"],"status":status["status"],
                            "matchedApprovedBoundary":b.same_snapshot(part["window"],status,g),
                            "consumerCheck":consumers})
        return out

    if d.name==install:
        b.write_time(a)
        b.need(not os.path.lexists(policy),"EXISTING_STAGING_POLICY_REFUSED")
        facts=inspect()
        b.need(all(x["matchedApprovedBoundary"] for x in facts),"APPROVED_ORIGINAL_BOUNDARY_DIFFERS")
        for part in parts:
            boundary=part["window"]["boundary"]
            if boundary:verify_ready_origin(boundary["ready"],digest,part,receiver,old)
        volume=os.statvfs(Path(b.CONTROL)/"private-standard-import-data")
        required=sum(p["archiveBytes"]-(p["window"]["boundary"]["fileIdentity"][2] if p["window"]["boundary"] else 0) for p in parts)
        b.need(volume.f_bavail*volume.f_frsize>=required and volume.f_favail>=len(parts)*4,"BATCH_CAPACITY_INSUFFICIENT")
        pending=d/old["PENDING_NAME"]
        write(pending,raw,0o444)
        saved=pending.lstat()
        intent={"authoritySha256":digest,"device":saved.st_dev,"inode":saved.st_ino,"batchManifestSha256":b.sha(manifest)}
        write(d/old["INTENT"],b.pack(intent),0o400)
        sync(d)
        b.need(all(x["matchedApprovedBoundary"] for x in inspect()),"BATCH_BOUNDARIES_CHANGED")
        b.begin_upload(a)
        os.link(pending,policy,follow_symlinks=False)
        pending.unlink()
        sync(policy.parent);sync(d)
        actual,st=read(policy,0,0o444)
        b.need(actual==raw and [st.st_dev,st.st_ino]==[saved.st_dev,saved.st_ino],"BATCH_POLICY_PUBLICATION_UNKNOWN")
        result={"status":"BATCH_POLICY_INSTALLED","policyIdentity":identity(st),"availableBytes":volume.f_bavail*volume.f_frsize,
                "requiredBytes":required,"parts":facts}
    else:
        original=old["JOBS"]/install
        old["trusted_root_directory"](original/"bundle")
        approved,_=read(original/"bundle/stage-authorization.json",0,0o600)
        plan,_=read(original/"bundle/batch-manifest.json",0,0o600,limit=32768)
        b.need((approved,plan)==(raw,manifest),"ORIGINAL_BATCH_INSTALL_DIFFERS")
        pending=original/old["PENDING_NAME"]
        expired=b.seconds_left(a)<=0
        if expired:
            # A torn original remains untouched. Policy withdrawal only needs
            # the exact frozen original and proof that no receiver is using it.
            facts=[]
            for authority,g,_ in apis:
                target=g["original_target"](authority,root_inspect=True)
                consumers=g["recovery_no_other_writers"](target,uid=1000)
                facts.append({"artifactKey":authority["artifactKey"],"consumerCheck":consumers})
        else:
            facts=inspect()
            b.need(all(f["status"]=="READY" for f in facts),"WAIT_FOR_BATCH_EXPIRY_OR_ALL_READY")
        if os.path.lexists(policy):
            installed,st=read(policy,0,0o444,links=(1,2))
            intent,_=read(original/old["INTENT"],0,0o400)
            proof=json.loads(intent)
            b.need(installed==raw and proof=={"authoritySha256":digest,"device":st.st_dev,"inode":st.st_ino,
                   "batchManifestSha256":b.sha(manifest)} and identity(policy.lstat())==identity(st),"ORIGINAL_BATCH_POLICY_DIFFERS")
            if st.st_nlink==2:
                b.need(identity(pending.lstat())==identity(st),"ORIGINAL_BATCH_PENDING_LINK_DIFFERS")
                pending.unlink();sync(original)
            policy.unlink();sync(policy.parent)
        elif os.path.lexists(pending):
            installed,st=read(pending,0,0o444)
            b.need(installed==raw and identity(pending.lstat())==identity(st),"ORIGINAL_UNPUBLISHED_BATCH_DIFFERS")
            pending.unlink();sync(original)
        b.need(not os.path.lexists(policy) and not os.path.lexists(pending),"BATCH_POLICY_NOT_WITHDRAWN")
        result={"status":"BATCH_POLICY_ABSENCE_RESTORED","parts":facts}
    write(d/"results/d3-batch-policy-result.json",b.pack({**result,"authoritySha256":digest}),0o600)


if __name__=="__main__":
    main()
