"""Exact root05 materialization admission. A planned hash is never a completion claim."""
from pathlib import Path
import hashlib,json
KEY = 't45-r3-batched-root06-source-delta-20261116-01'
ROOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
WORKER=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
EXPECTED='73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171'

def need(ok,code):
    if not ok:raise ValueError('ROOT06_'+code)

def validate_objects(terminal,root_result,public_result,output):
    need((terminal.get('jobId'),terminal.get('taskId'),terminal.get('grantId'),terminal.get('status'),terminal.get('exitCode'))==
         (KEY,'T45','b16447fbc81f4d64','COMPLETED',0) and terminal.get('phaseStarted') is True,'ACTUAL_COMPLETED_TERMINAL_REQUIRED')
    need(hashlib.sha256(root_result).hexdigest()==EXPECTED and output==root_result,'EXACT_ACTUAL_OUTPUT_BYTES_REQUIRED')
    value=json.loads(root_result)
    need(value==json.loads(public_result) and value['requestKey']==KEY
         and value['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION','ACTUAL_ROOT_PUBLIC_RESULT_REQUIRED')
    return value

def validate(ops,control):
    terminal=ops.read_file(WORKER/KEY/'r3-outer-terminal.json',65536,True)
    need(terminal==ops.read_file(control/'results'/(KEY+'.json'),65536,False,False),'ACTUAL_ROOT_PUBLIC_TERMINAL_REQUIRED')
    root_result=ops.read_file(WORKER/KEY/'results/batched-source-materialization.json',65536,True)
    public=ops.read_file(control/'jobs'/KEY/'results/batched-source-materialization.json',65536,False,False)
    output=ops.read_file(ROOT/'state/installed-real-operation-batched-root06-20261116-01/source-materialization.json',65536,False)
    return validate_objects(json.loads(terminal),root_result,public,output)
