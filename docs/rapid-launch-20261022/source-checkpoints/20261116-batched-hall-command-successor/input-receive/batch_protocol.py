"""Bind one external window to the existing four original D3 fragment contracts."""
import base64
import hashlib
import json
import re
import time

GRANT = "b16447fbc81f4d64"
CONTROL = "/home/naijue/erp-release-20261006-01-control/grant-" + GRANT
MANIFEST = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
BATCH_SIZE = 4
FINAL33_GROUPS = (('t45-r3-final33-standard-p001-20261116-01', 't45-r3-final33-standard-p002-20261116-01', 't45-r3-final33-standard-p003-20261116-01', 't45-r3-final33-standard-p004-20261116-01'), ('t45-r3-final33-standard-p005-20261116-01', 't45-r3-final33-standard-p006-20261116-01', 't45-r3-final33-standard-p007-20261116-01', 't45-r3-final33-standard-p008-20261116-01'), ('t45-r3-final33-standard-p009-20261116-01', 't45-r3-final33-standard-p010-20261116-01', 't45-r3-final33-standard-p011-20261116-01', 't45-r3-final33-standard-p012-20261116-01'), ('t45-r3-final33-standard-p013-20261116-01', 't45-r3-final33-standard-p014-20261116-01', 't45-r3-final33-standard-p015-20261116-01', 't45-r3-final33-standard-p016-20261116-01'), ('t45-r3-final33-standard-p017-20261116-01', 't45-r3-final33-standard-p018-20261116-01', 't45-r3-final33-standard-p019-20261116-01', 't45-r3-final33-standard-p020-20261116-01'), ('t45-r3-final33-standard-p021-20261116-01', 't45-r3-final33-standard-p022-20261116-01', 't45-r3-final33-standard-p023-20261116-01', 't45-r3-final33-standard-p024-20261116-01'), ('t45-r3-final33-standard-p025-20261116-01', 't45-r3-final33-standard-p026-20261116-01', 't45-r3-final33-standard-p027-20261116-01', 't45-r3-final33-standard-p028-20261116-01'), ('t45-r3-final33-standard-p029-20261116-01', 't45-r3-final33-standard-p030-20261116-01', 't45-r3-final33-standard-p031-20261116-01', 't45-r3-final33-standard-p032-20261116-01'), ('t45-r3-final33-standard-p033-20261116-01', 't45-r3-final33-standard-p034-20261116-01', 't45-r3-final33-standard-p035-20261116-01', 't45-r3-final33-standard-p036-20261116-01'), ('t45-r3-final33-standard-p037-20261116-01', 't45-r3-final33-standard-p038-20261116-01', 't45-r3-final33-standard-p039-20261116-01', 't45-r3-final33-standard-p040-20261116-01'), ('t45-r3-final33-standard-p041-20261116-01',), ('t45-r3-final33-evidence-p001-20261116-01', 't45-r3-final33-evidence-p002-20261116-01', 't45-r3-final33-evidence-p003-20261116-01', 't45-r3-final33-evidence-p004-20261116-01'), ('t45-r3-final33-evidence-p005-20261116-01', 't45-r3-final33-evidence-p006-20261116-01', 't45-r3-final33-evidence-p007-20261116-01', 't45-r3-final33-evidence-p008-20261116-01'), ('t45-r3-final33-evidence-p009-20261116-01', 't45-r3-final33-evidence-p010-20261116-01', 't45-r3-final33-evidence-p011-20261116-01', 't45-r3-final33-evidence-p012-20261116-01'), ('t45-r3-final33-evidence-p013-20261116-01', 't45-r3-final33-evidence-p014-20261116-01', 't45-r3-final33-evidence-p015-20261116-01', 't45-r3-final33-evidence-p016-20261116-01'), ('t45-r3-final33-evidence-p017-20261116-01', 't45-r3-final33-evidence-p018-20261116-01', 't45-r3-final33-evidence-p019-20261116-01', 't45-r3-final33-evidence-p020-20261116-01'), ('t45-r3-final33-evidence-p021-20261116-01', 't45-r3-final33-evidence-p022-20261116-01', 't45-r3-final33-evidence-p023-20261116-01', 't45-r3-final33-evidence-p024-20261116-01'), ('t45-r3-final33-evidence-p025-20261116-01', 't45-r3-final33-evidence-p026-20261116-01', 't45-r3-final33-evidence-p027-20261116-01', 't45-r3-final33-evidence-p028-20261116-01'), ('t45-r3-final33-evidence-p029-20261116-01', 't45-r3-final33-evidence-p030-20261116-01', 't45-r3-final33-evidence-p031-20261116-01', 't45-r3-final33-evidence-p032-20261116-01'), ('t45-r3-final33-evidence-p033-20261116-01', 't45-r3-final33-evidence-p034-20261116-01', 't45-r3-final33-evidence-p035-20261116-01', 't45-r3-final33-evidence-p036-20261116-01'), ('t45-r3-final33-evidence-p037-20261116-01', 't45-r3-final33-evidence-p038-20261116-01', 't45-r3-final33-evidence-p039-20261116-01', 't45-r3-final33-evidence-p040-20261116-01'), ('t45-r3-final33-evidence-p041-20261116-01', 't45-r3-final33-evidence-p042-20261116-01', 't45-r3-final33-evidence-p043-20261116-01', 't45-r3-final33-evidence-p044-20261116-01'), ('t45-r3-final33-evidence-p045-20261116-01', 't45-r3-final33-evidence-p046-20261116-01', 't45-r3-final33-evidence-p047-20261116-01', 't45-r3-final33-evidence-p048-20261116-01'), ('t45-r3-final33-evidence-p049-20261116-01', 't45-r3-final33-evidence-p050-20261116-01', 't45-r3-final33-evidence-p051-20261116-01', 't45-r3-final33-evidence-p052-20261116-01'), ('t45-r3-final33-evidence-p053-20261116-01', 't45-r3-final33-evidence-p054-20261116-01', 't45-r3-final33-evidence-p055-20261116-01', 't45-r3-final33-evidence-p056-20261116-01'), ('t45-r3-final33-evidence-p057-20261116-01', 't45-r3-final33-evidence-p058-20261116-01', 't45-r3-final33-evidence-p059-20261116-01', 't45-r3-final33-evidence-p060-20261116-01'), ('t45-r3-final33-evidence-p061-20261116-01', 't45-r3-final33-evidence-p062-20261116-01', 't45-r3-final33-evidence-p063-20261116-01', 't45-r3-final33-evidence-p064-20261116-01'), ('t45-r3-final33-evidence-p065-20261116-01', 't45-r3-final33-evidence-p066-20261116-01', 't45-r3-final33-evidence-p067-20261116-01', 't45-r3-final33-evidence-p068-20261116-01'), ('t45-r3-final33-evidence-p069-20261116-01', 't45-r3-final33-evidence-p070-20261116-01', 't45-r3-final33-evidence-p071-20261116-01', 't45-r3-final33-evidence-p072-20261116-01'), ('t45-r3-final33-evidence-p073-20261116-01', 't45-r3-final33-evidence-p074-20261116-01', 't45-r3-final33-evidence-p075-20261116-01', 't45-r3-final33-evidence-p076-20261116-01'), ('t45-r3-final33-evidence-p077-20261116-01', 't45-r3-final33-evidence-p078-20261116-01', 't45-r3-final33-evidence-p079-20261116-01', 't45-r3-final33-evidence-p080-20261116-01'), ('t45-r3-final33-evidence-p081-20261116-01', 't45-r3-final33-evidence-p082-20261116-01', 't45-r3-final33-evidence-p083-20261116-01', 't45-r3-final33-evidence-p084-20261116-01'), ('t45-r3-final33-evidence-p085-20261116-01', 't45-r3-final33-evidence-p086-20261116-01', 't45-r3-final33-evidence-p087-20261116-01', 't45-r3-final33-evidence-p088-20261116-01'), ('t45-r3-final33-evidence-p089-20261116-01', 't45-r3-final33-evidence-p090-20261116-01', 't45-r3-final33-evidence-p091-20261116-01', 't45-r3-final33-evidence-p092-20261116-01'), ('t45-r3-final33-evidence-p093-20261116-01', 't45-r3-final33-evidence-p094-20261116-01', 't45-r3-final33-evidence-p095-20261116-01', 't45-r3-final33-evidence-p096-20261116-01'), ('t45-r3-final33-evidence-p097-20261116-01', 't45-r3-final33-evidence-p098-20261116-01', 't45-r3-final33-evidence-p099-20261116-01', 't45-r3-final33-evidence-p100-20261116-01'), ('t45-r3-final33-evidence-p101-20261116-01', 't45-r3-final33-evidence-p102-20261116-01', 't45-r3-final33-evidence-p103-20261116-01', 't45-r3-final33-evidence-p104-20261116-01'), ('t45-r3-final33-evidence-p105-20261116-01', 't45-r3-final33-evidence-p106-20261116-01', 't45-r3-final33-evidence-p107-20261116-01', 't45-r3-final33-evidence-p108-20261116-01'), ('t45-r3-final33-evidence-p109-20261116-01', 't45-r3-final33-evidence-p110-20261116-01', 't45-r3-final33-evidence-p111-20261116-01', 't45-r3-final33-evidence-p112-20261116-01'), ('t45-r3-final33-evidence-p113-20261116-01', 't45-r3-final33-evidence-p114-20261116-01', 't45-r3-final33-evidence-p115-20261116-01', 't45-r3-final33-evidence-p116-20261116-01'), ('t45-r3-final33-evidence-p117-20261116-01', 't45-r3-final33-evidence-p118-20261116-01', 't45-r3-final33-evidence-p119-20261116-01', 't45-r3-final33-evidence-p120-20261116-01'), ('t45-r3-final33-evidence-p121-20261116-01', 't45-r3-final33-evidence-p122-20261116-01', 't45-r3-final33-evidence-p123-20261116-01', 't45-r3-final33-evidence-p124-20261116-01'), ('t45-r3-final33-evidence-p125-20261116-01', 't45-r3-final33-evidence-p126-20261116-01', 't45-r3-final33-evidence-p127-20261116-01', 't45-r3-final33-evidence-p128-20261116-01'), ('t45-r3-final33-evidence-p129-20261116-01', 't45-r3-final33-evidence-p130-20261116-01', 't45-r3-final33-evidence-p131-20261116-01', 't45-r3-final33-evidence-p132-20261116-01'), ('t45-r3-final33-evidence-p133-20261116-01', 't45-r3-final33-evidence-p134-20261116-01', 't45-r3-final33-evidence-p135-20261116-01', 't45-r3-final33-evidence-p136-20261116-01'), ('t45-r3-final33-evidence-p137-20261116-01', 't45-r3-final33-evidence-p138-20261116-01', 't45-r3-final33-evidence-p139-20261116-01', 't45-r3-final33-evidence-p140-20261116-01'), ('t45-r3-final33-evidence-p141-20261116-01', 't45-r3-final33-evidence-p142-20261116-01', 't45-r3-final33-evidence-p143-20261116-01', 't45-r3-final33-evidence-p144-20261116-01'), ('t45-r3-final33-evidence-p145-20261116-01', 't45-r3-final33-evidence-p146-20261116-01', 't45-r3-final33-evidence-p147-20261116-01', 't45-r3-final33-evidence-p148-20261116-01'), ('t45-r3-final33-evidence-p149-20261116-01', 't45-r3-final33-evidence-p150-20261116-01', 't45-r3-final33-evidence-p151-20261116-01', 't45-r3-final33-evidence-p152-20261116-01'), ('t45-r3-final33-evidence-p153-20261116-01', 't45-r3-final33-evidence-p154-20261116-01', 't45-r3-final33-evidence-p155-20261116-01', 't45-r3-final33-evidence-p156-20261116-01'), ('t45-r3-final33-evidence-p157-20261116-01', 't45-r3-final33-evidence-p158-20261116-01', 't45-r3-final33-evidence-p159-20261116-01', 't45-r3-final33-evidence-p160-20261116-01'), ('t45-r3-final33-evidence-p161-20261116-01', 't45-r3-final33-evidence-p162-20261116-01', 't45-r3-final33-evidence-p163-20261116-01', 't45-r3-final33-evidence-p164-20261116-01'), ('t45-r3-final33-evidence-p165-20261116-01', 't45-r3-final33-evidence-p166-20261116-01', 't45-r3-final33-evidence-p167-20261116-01', 't45-r3-final33-evidence-p168-20261116-01'), ('t45-r3-final33-evidence-p169-20261116-01', 't45-r3-final33-evidence-p170-20261116-01'))
PRIOR_P06_P09 = tuple(f"t45-r3-r2-data-p{i:02d}-20261116-01" for i in range(6, 10))
RECEIVER_SHA = 'bee800f2341ff1cba5400ce61a2227acce50498c82216882630f33f040c46e97'
RESERVE_SECONDS = 180
STALL_SECONDS = 40
QUERY_SECONDS = 15
CODE_FILES = ("batch_policy.py", "batch_protocol.py", "batch_client.py", "batch_remote.py",
              "batch_transport.py", "d3-chunk-policy.py", "artifact-receiver.d3-chunk.py")
UPLOAD_SECONDS = 600
CLOSEOUT_RESERVE_SECONDS = RESERVE_SECONDS + BATCH_SIZE*QUERY_SECONDS
MAX_WINDOW_SECONDS = 1080


def need(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pack(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def unique(entries):
    result = dict(entries)
    need(len(result) == len(entries), "DUPLICATE_BATCH_FIELD")
    return result


def decode(raw):
    return json.loads(raw, object_pairs_hook=unique)


def jobs(digest):
    need(re.fullmatch(r"[a-f0-9]{64}", digest), "BATCH_AUTHORITY_DIGEST_REQUIRED")
    return tuple(f"t45-r3-final33-stage-{mode}-20261116-{digest[:24]}" for mode in ("install", "restore"))


def bind(raw,digest,manifest_raw,*,prior=False):
    need(0 < len(raw) <= 65536 and sha(raw) == digest, "BATCH_ORIGINAL_AUTHORITY_DIFFERS")
    a=decode(raw)
    fields={"format","decision","taskId","grantId","manifestSha256","batchManifestSha256",
            "startsAt","expiresAt","decisionReference","codeSha256"}
    legacy=prior and a.get("format")=="T45_D3_FOUR_ORIGINALS_V1"
    if not legacy:fields|={"uploadSeconds","closeoutReserveSeconds"}
    need(set(a)==fields and (a["format"],a["decision"],a["taskId"],a["grantId"],a["manifestSha256"])==
         ("T45_D3_FOUR_ORIGINALS_V1" if legacy else "T45_D3_FOUR_ORIGINALS_V2",
          "AUTHORIZE_EXACT_FOUR_PRIVATE_D3_FRAGMENTS","T45",GRANT,MANIFEST)
         and type(a["startsAt"]) is type(a["expiresAt"]) is int and
         (0<a["expiresAt"]-a["startsAt"]<=600000 if legacy else
          (UPLOAD_SECONDS+CLOSEOUT_RESERVE_SECONDS)*1000<=a["expiresAt"]-a["startsAt"]<=MAX_WINDOW_SECONDS*1000)
         and isinstance(a["decisionReference"],str) and 0<len(a["decisionReference"])<=256 and
         (legacy or (a["uploadSeconds"],a["closeoutReserveSeconds"])==(UPLOAD_SECONDS,CLOSEOUT_RESERVE_SECONDS)),
         "EXACT_FOUR_FRAGMENT_AUTHORITY_REQUIRED")
    pins=a["codeSha256"]
    need(type(pins) is dict and set(pins)==set(CODE_FILES) and
         all(isinstance(v,str) and re.fullmatch(r"[a-f0-9]{64}",v) for v in pins.values()),"EXACT_BATCH_CODE_PINS_REQUIRED")
    need(0<len(manifest_raw)<=32768 and sha(manifest_raw)==a["batchManifestSha256"],"BATCH_MANIFEST_DIFFERS")
    manifest=decode(manifest_raw)
    need(type(manifest) is list and 1<=len(manifest)<=BATCH_SIZE and
         all(type(p) is dict and isinstance(p.get("artifactKey"),str) and type(p.get("fragmentIndex")) is int
             for p in manifest),"EXACT_FOUR_ORIGINAL_MANIFEST_ROWS_REQUIRED")
    keys=tuple(p["artifactKey"] for p in manifest)
    indices=tuple(p["fragmentIndex"] for p in manifest)
    first=indices[0]
    need(not legacy and keys in FINAL33_GROUPS and len(set(keys))==len(keys),
         "EXACT_ORDERED_FINAL33_GROUP_REQUIRED")
    return a,manifest


def part_api(source, a, part, digest):
    need(sha(source) == RECEIVER_SHA, "FROZEN_D3_RECEIVER_DIFFERS")
    window = pack(part["window"])
    x = {k: part[k] for k in ("artifactKey", "archiveBytes", "archiveSha256", "fragmentIndex", "fragmentOffset")}
    x.update(format="T45_PRIVATE_STANDARD_IMPORT_DATA_STAGING_V1",
             decision="AUTHORIZE_EXACT_PRIVATE_STANDARD_IMPORT_DATA_CHUNKS", kind="PRIVATE_STANDARD_IMPORT_DATA_FRAGMENT",
             taskId="T45", grantId=GRANT, manifestSha256=MANIFEST, startsAt=a["startsAt"], expiresAt=min(a["expiresAt"],a["startsAt"]+600000),
             targetDirectory=CONTROL+"/private-standard-import-data/"+part["artifactKey"],
             decisionReference="RECEIVE_FIXED_D3_ORIGINAL_CHUNKS D3_CHUNK_WINDOW_SHA256="+sha(window)+" "+a["decisionReference"])
    ctx = {"grantId":GRANT, "control":CONTROL, "authoritySha256":digest, "authority":x,
           "action":"recovery-status", "recoveryWindowRawBase64":base64.b64encode(window).decode()}
    g = {"CONTEXT_LITERAL":ctx, "__name__":"frozen_original_receiver"}
    exec(compile(source, "fixed_d3_receiver", "exec"), g)
    need(set(part) == {"artifactKey", "archiveBytes", "archiveSha256", "fragmentIndex", "fragmentOffset", "window"},
         "EXACT_PART_FIELDS_REQUIRED")
    g["recovery_window"](x,window)
    return x,g,ctx


def seconds_left(a):
    return a["expiresAt"]/1000 - time.time()


def write_time(a):
    need(a["startsAt"] <= time.time()*1000 and seconds_left(a) > RESERVE_SECONDS,
         "BATCH_FINALIZE_AND_RESTORE_RESERVE_REACHED")


def begin_upload(a, *, clock=time.monotonic):
    need(seconds_left(a)>UPLOAD_SECONDS+CLOSEOUT_RESERVE_SECONDS,"FULL_600_SECOND_UPLOAD_BUDGET_UNAVAILABLE")
    return clock()+UPLOAD_SECONDS


def upload_left(a,deadline,*,clock=time.monotonic):
    return min(deadline-clock(),seconds_left(a)-CLOSEOUT_RESERVE_SECONDS)


def same_snapshot(window,status,receiver):
    before=window["boundary"]
    if before is None:return status["status"]=="ABSENT"
    return receiver["recovery_snapshot"](status)==before


def start_segment(part):
    before=part["window"]["boundary"]
    size=before["fileIdentity"][2] if before else 0
    return next((r["segment"] for r in part["window"]["segments"] if r["offset"]==size),None)


def start_batch_clock(a):
    start_ms=time.time_ns()//1000000
    deadline=begin_upload(a)
    end_ms=start_ms+UPLOAD_SECONDS*1000
    need(end_ms<=a["expiresAt"]-CLOSEOUT_RESERVE_SECONDS*1000,"FULL_600_SECOND_UPLOAD_BUDGET_UNAVAILABLE")
    return deadline,end_ms


def remote_upload_clock(a,end_ms):
    need(type(end_ms) is int and a["startsAt"]+UPLOAD_SECONDS*1000<=end_ms<=a["expiresAt"]-CLOSEOUT_RESERVE_SECONDS*1000,
         "SHARED_BATCH_UPLOAD_DEADLINE_REQUIRED")
    def wall_left():
        return min((end_ms-time.time_ns()//1000000)/1000,seconds_left(a)-CLOSEOUT_RESERVE_SECONDS)
    limit=time.monotonic()+wall_left()
    return lambda:min(limit-time.monotonic(),wall_left())
