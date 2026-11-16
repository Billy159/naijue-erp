from pathlib import Path
import json,os
REFUSED_KEY = 't45-r3-ordinary34-auth-apply-20261116-01'
REFUSED_TERMINAL_SHA = '39dd96689785ea6fc041eef092fd3097677f2e3ffbc3c5c6b56f2fce482c3600'
REFUSED_REQUEST_SHA = '39bcfdde2286969bd3fd9035ad5efcc0e42d279453b5f997c8ba2e9bd2505807'
REFUSED_HOST_SHA = '5467fa0e5bb89f7002bd7fa62a477acb9c5021dad9ad1297610bf61fcc0f6e5d'
REFUSED_ROLE_SHA = '60ff1ff38900e1d07001486e05848124b1ed64bba0ea425357d4ac9006af16c6'
REFUSED_MANIFEST_SHA = '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3'
REFUSED_TERMINAL = {'atUTC': '2026-11-16T16:22:59.960926+00:00',
 'businessAcceptanceClaimed': False,
 'elapsedSeconds': 0.04957998695317656,
 'errorCode': 'R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED',
 'exitCode': 2,
 'exports': [],
 'finishedAtUTC': '2026-11-16T16:23:00.036362+00:00',
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'phaseStarted': False,
 'privateLogsExported': False,
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'status': 'REFUSED_R3_CONTINUITY_BEFORE_PHASE',
 'taskId': 'T45',
 'unit': 'naijue-erp-op-b16447fb-cec65c8ea6c4'}
REFUSED_REQUEST = {'args': [],
 'businessCutoverConfirmed': False,
 'gateEvidence': {},
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'manifestSha256': '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3',
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'script': 'ordinary05_roles_job.py',
 'taskEvidence': {},
 'taskId': 'T45',
 'timeoutSeconds': 300}

def refused_apply34_history():
    # Immutable original-key evidence only. Do not require future custody/PG state here.
    job=B/'jobs'/REFUSED_KEY
    terminal=read(job/'r3-outer-terminal.json')[0]
    public=read(C/'results'/(REFUSED_KEY+'.json'),1000)[0]
    request=read(job/'request.json')[0]
    need(sha(terminal)==REFUSED_TERMINAL_SHA and terminal==public and json.loads(terminal)==REFUSED_TERMINAL,'EXACT_APPLY34_BEFORE_PHASE_REFUSAL_REQUIRED')
    need(sha(request)==REFUSED_REQUEST_SHA and json.loads(request)==REFUSED_REQUEST and REFUSED_REQUEST['args']==[],'EXACT_ORIGINAL_APPLY34_EMPTY_ARGS_REQUIRED')
    need(REFUSED_TERMINAL['phaseStarted'] is False and REFUSED_TERMINAL['exports']==[] and REFUSED_TERMINAL['status']=='REFUSED_R3_CONTINUITY_BEFORE_PHASE' and REFUSED_TERMINAL['exitCode']==2 and REFUSED_TERMINAL['errorCode']=='R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED','NO_EXECUTED_APPLY_OR_FAKE_RESTORE_ALLOWED')
    for leaf,pin in [('host-authorization.json',REFUSED_HOST_SHA),('roles-authorization.json',REFUSED_ROLE_SHA),('bundle-manifest.json',REFUSED_MANIFEST_SHA)]:
        need(sha(read(job/'bundle'/leaf)[0])==pin,'EXACT_REFUSED_APPLY34_BUNDLE_REQUIRED')
    need(not os.path.lexists(job/'phase.private.log') and not any(os.path.lexists(job/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json','maintenance-auth-result.json')),'ORIGINAL_REFUSED_KEY_CHILD_EVIDENCE_PRESENT')
    return {'requestKey':REFUSED_KEY,'terminalSha256':REFUSED_TERMINAL_SHA,'requestSha256':REFUSED_REQUEST_SHA,'phaseStarted':False,'credentialWriteOccurred':False}
