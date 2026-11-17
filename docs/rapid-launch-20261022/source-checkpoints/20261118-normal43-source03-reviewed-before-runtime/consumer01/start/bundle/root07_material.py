"""Exact ROOT07 materialization readback; actual completed receipt pins bound."""
from pathlib import Path
from types import ModuleType
import hashlib,json
KEY='t45-r3-batched-root07-source-delta-20261117-01'
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
WORKER=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
TERMINAL_SHA256='f1228d139a4588d52af17fc611fb0f10bd0a0960b1d74b8f229928a9906edb9d'
RESULT_SHA256='84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065'
PUBLIC_RESULT_SHA256='549e0670727b55f057cc11706ae0886be8f9310e50e452988031c36673eb3469'
HELPER_SHA256='c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736'
LINEAGE_SHA256='eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def need(ok,code):
    if not ok:raise ValueError('ROOT07_'+code)
def validate(ops,control):
    need(all(type(p) is str and len(p)==64 and all(c in '0123456789abcdef' for c in p)
             for p in (TERMINAL_SHA256,RESULT_SHA256,PUBLIC_RESULT_SHA256)),
         'ACTUAL_RECEIPT_PINS_REQUIRED')
    bundle=Path(__file__).parent
    raw=ops.read_file(bundle/'historical_source_lineage.py',65536,True)
    need(sha(raw)==HELPER_SHA256,'EXACT_REVIEWED_HELPER_REQUIRED')
    helper=ModuleType('root07_source_lineage');exec(compile(raw,str(bundle/'historical_source_lineage.py'),'exec'),helper.__dict__)
    proof=ops.read_file(bundle/'source-catalog-lineage.json',131072,True)
    need(sha(proof)==LINEAGE_SHA256,'EXACT_REVIEWED_LINEAGE_REQUIRED');helper.check_lineage(proof)
    raw=ops.read_file(WORKER/KEY/'r3-outer-terminal.json',65536,True)
    need(sha(raw)==TERMINAL_SHA256 and raw==ops.read_file(control/'results'/(KEY+'.json'),65536,False,False),
         'ACTUAL_ROOT_PUBLIC_TERMINAL_REQUIRED')
    t=json.loads(raw)
    need((t.get('jobId'),t.get('taskId'),t.get('grantId'),t.get('status'),t.get('exitCode'))
         ==(KEY,'T45','b16447fbc81f4d64','COMPLETED',0) and t.get('phaseStarted') is True and t.get('finishedAtUTC'),
         'ACTUAL_COMPLETED_TERMINAL_REQUIRED')
    result=ops.read_file(WORKER/KEY/'results/batched-source-materialization.json',65536,True)
    public=ops.read_file(control/'jobs'/KEY/'results/batched-source-materialization.json',65536,False,False)
    marker=ops.read_file(ROOT/'state'/helper.OPERATOR/'source-materialization.json',65536,False)
    need(sha(result)==RESULT_SHA256 and sha(public)==PUBLIC_RESULT_SHA256
         and json.loads(result)==json.loads(public) and marker==result,'EXACT_ACTUAL_OUTPUT_BYTES_REQUIRED')
    return helper.check_marker(result)
