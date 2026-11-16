from pathlib import Path
import runpy,json,time
ROOT=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1');H=ROOT/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE33-FINAL-SOURCE-PREPARE-01';w=json.loads((H/'NINE-PHASES.UNISSUED.json').read_text());a=runpy.run_path(str(H/'issue_phase.py'));n=time.time_ns()//1000000
role=runpy.run_path(str(Path(w['phaseDirectories']['apply'])/'ordinary05_roles.py'));roles={**role['scope'](),'startsAt':n,'expiresAt':n+1800000,'controllerValidUntil':n+7200000,'backupAdminValidUntil':n+7320000,'restorationDeadline':n+9000000,'authorizationReference':'LOCAL_ONLY_NOT_ISSUED','rolesSourceSha256':'0'*64,'independentReviewSha256':'1'*64};role['validate'](roles,n)
policy={'jobs':w['jobs'],'expiresAt':n+10800000};key=policy['jobs']['apply']['jobId'];inside={'status':'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK','runtimeAuthChanged':False,'membershipsOrRoleAttributesChanged':False,'credentialValidUntilByRole':{'erp35_controller_20261110_r3':roles['controllerValidUntil'],'erp35_admin_20261110_r3':roles['backupAdminValidUntil']}}
apply={'terminal':{'jobId':key,'status':'COMPLETED','exitCode':0},'result':{'requestKey':key,'phase':'apply','result':inside,'cleanup':{'ownContainerStopped':True,'ownedPidAbsent':True}},'rootPins':{'terminal':'2'*64},'publicResultSha256':'3'*64}
start=a['start_authority'](w,w['jobs']['start'],apply,roles,policy,n)
assert start['maximumServiceSeconds']==8400 and start['serviceLeaseExpiresAt']==n+8400000
try:a['start_authority'](w,w['jobs']['start'],apply,roles,policy,n+2100000)
except AssertionError:pass
else:raise AssertionError('complete5100 budget late start not refused')
print(json.dumps({'state':'PASS_NATIVE_ROLE_AND_START_AUTHORITY_DATA_VALIDATORS_ONLY','controllerMinutes':120,'adminMinutes':122,'restoreMinutes':150,'policyMinutes':180,'maximumServiceMinutes':140,'completeWorkSeconds':5100,'lateStartWithoutCompleteBudgetRejected':True,'PGConnections':0,'serverActions':0,'noRealAuthorityIssued':True},indent=2))
