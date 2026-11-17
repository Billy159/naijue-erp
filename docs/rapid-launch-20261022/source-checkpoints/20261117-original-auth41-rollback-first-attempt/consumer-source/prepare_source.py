from pathlib import Path
import ast,hashlib,json
OUT=Path(__file__).resolve().parent;V=OUT.parent;OLD=V/'NORMAL41-THREE-ROUTINE-MAINTENANCE-SOURCE-01/restore/bundle';B=OUT/'bundle'
KEY='t45-r3-ordinary41-original-auth-rollback-20261117-01'
SERVICE=json.loads((V/'NORMAL41-MAINTENANCE-EXECUTION-PREPARATION-01/runtime/start/ACTUAL-START41-TERMINAL-RESULT.PRIVATE.json').read_bytes())['service']
sha=lambda raw:hashlib.sha256(raw).hexdigest()
for p in OLD.iterdir():
 if p.is_file():(B/p.name).write_bytes(p.read_bytes())
def assigned(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+' = '+repr(value),1)
def function(s,name,body):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name==name);return s.replace(ast.get_source_segment(s,n),body,1)
r=(OLD/'ordinary05_roles.py').read_text()
for name in ['prepare','verifier','desired']:r=function(r,name,'')
for line in ['import base64\n','import hmac\n','import secrets\n']:r=r.replace(line,'',1)
r=assigned(r,'PHASES',('rollback-before','rollback-readback'))
base_scope=next(n for n in ast.parse(r).body if isinstance(n,ast.FunctionDef)and n.name=='scope');body=ast.get_source_segment(r,base_scope)
body=body.replace("'T45_R3_ORDINARY05_CONTROLLER_BACKUP_FINITE_AUTH_V1'","'T45_R3_ORIGINAL41_AUTH_ROLLBACK_ONLY_V1'").replace("'CAPTURE_SET_FINITE_AUTH_AND_RESTORE_EXACT_ORIGINAL_AUTH_SAME_STOPPED_R3'","'RESTORE_EXISTING_ORIGINAL_TWO_ROLE_AUTH_ONLY'").replace("'t45-r3-ordinary41-auth-apply-20261117-01'",repr(KEY)).replace("'t45-r3-ordinary41-auth-restore-20261117-01'",repr(KEY));r=function(r,'scope',body)
r=function(r,'validate','''def validate(authority, now, restoring=False):
    fixed=scope()
    extra={'startsAt','expiresAt','authorizationReference','rolesSourceSha256','independentReviewSha256','originalRecoveryStat9'}
    need(restoring is True and type(authority)is dict and set(authority)==set(fixed)|extra and all(authority[k]==v for k,v in fixed.items()),'ROLLBACK_ONLY_EXACT_AUTHORITY_REQUIRED')
    need(type(now)is type(authority['startsAt'])is type(authority['expiresAt'])is int and authority['startsAt']<=now and now+30000<authority['expiresAt']<=authority['startsAt']+900000,'ROLLBACK_NEW_REAL_FINITE_WINDOW_REQUIRED')
    need(type(authority['authorizationReference'])is str and 0<len(authority['authorizationReference'])<=512 and all(type(authority[k])is str and re.fullmatch('[a-f0-9]{64}',authority[k])for k in('rolesSourceSha256','independentReviewSha256')),'ROLLBACK_EXTERNAL_SOURCE_REVIEW_REQUIRED')
    stats=authority['originalRecoveryStat9'];need(type(stats)is dict and set(stats)=={'original-auth.json','finite-auth.json','applied.json'}and all(type(row)is list and len(row)==9 and all(type(v)is int for v in row)for row in stats.values()),'ROLLBACK_REAL_FRESH_SNAPSHOT_METADATA_REQUIRED')
''')
restore=next(n for n in ast.parse(r).body if isinstance(n,ast.FunctionDef)and n.name=='restore');body=ast.get_source_segment(r,restore)
body=body.replace("need(read_private_raw(CUSTODY / 'authority.json') == authority_raw, 'MAINT_ORIGINAL_AUTHORITY_DIFFERS')","need(hashlib.sha256(read_private_raw(CUSTODY / 'authority.json')).hexdigest()=='0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c','ROLLBACK_EXACT_HISTORICAL41_AUTHORITY_REQUIRED')\n    need(not os.path.lexists(CUSTODY/'restore-attempt.json')and not os.path.lexists(CUSTODY/'restored.json'),'ROLLBACK_OLD_RESTORE_ATTEMPT_MUST_BE_ABSENT')",1)
body=body.replace("'restore-attempt.json'","'original-auth-rollback-attempt.json'").replace("'restored.json'","'original-auth-rollback-restored.json'")
# Keep checks of the old unused restore leaves distinct from this new attempt.
body=body.replace("CUSTODY/'original-auth-rollback-attempt.json')and not os.path.lexists(CUSTODY/'original-auth-rollback-restored.json')","CUSTODY/'restore-attempt.json')and not os.path.lexists(CUSTODY/'restored.json')",1)
body=body.replace("capture(core, 'restore-before')","capture(core, 'rollback-before')").replace("capture(core, 'restore-readback')","capture(core, 'rollback-readback')")
body=body.replace("'requestKey': authority['restoreRequestKey'], 'roles': list(ROLES),","'requestKey': authority['restoreRequestKey'], 'roles': list(ROLES),\n               'operationMode':'ORIGINAL_AUTH_ROLLBACK_ONLY', 'originalRestorationHardDeadline':1794926977752,\n               'originalHardDeadlineMet':time.time_ns()//1000000<=1794926977752,",1)
r=function(r,'restore',body)
# Actual private paths are checked only inside the maintenance container. Host
# and Main validators remain pure schema/time/source checks.
n=next(n for n in ast.parse(r).body if isinstance(n,ast.FunctionDef)and n.name=='assert_entry');a=ast.get_source_segment(r,n)
stat_guard="""    for leaf,expected in authority['originalRecoveryStat9'].items():
        s=(CUSTODY/leaf).lstat();observed=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
        need(observed==expected and stat.S_ISREG(s.st_mode)and not(CUSTODY/leaf).is_symlink(),'ROLLBACK_ORIGINAL_SNAPSHOT_METADATA_CHANGED')
"""
r=function(r,'assert_entry',a.replace('    return authority',stat_guard+'    return authority',1));ast.parse(r);(B/'ordinary05_roles.py').write_text(r)
h=(OLD/'ordinary05_roles_job.py').read_text();h=assigned(h,'PHASES',{'restore':(KEY,KEY)})
scope=next(n for n in ast.parse(h).body if isinstance(n,ast.FunctionDef)and n.name=='scope');body=ast.get_source_segment(h,scope);body=body.replace('def scope(phase):',"def scope(phase='restore'):").replace("'T45_R3_ORDINARY05_FINITE_AUTH_ROOT_JOB_V1'","'T45_R3_ORIGINAL41_AUTH_ROLLBACK_ONLY_ROOT_JOB_V1'");body=body.replace("'maximumOperationSeconds': 300,","'maximumOperationSeconds': 300,\n            'decision':'ROLLBACK_EXACT_ORIGINAL_AUTH_ONLY', 'service': "+repr(SERVICE)+",\n            'guardianCleanupSha256':'9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac',\n            'historicalRolesAuthoritySha256':'0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c',",1);h=function(h,'scope',body)
h=function(h,'validate','''def validate(a, phase, now):
    fixed=scope(phase)
    extra={'startsAt','expiresAt','authorizationReference','independentReviewSha256','rolesAuthoritySha256','rolesSourceSha256','hostSourceSha256','originalRecoveryStat9'}
    need(phase=='restore'and type(a)is dict and set(a)==set(fixed)|extra and all(a[k]==v for k,v in fixed.items()),'ROLLBACK_JOB_EXACT_ONLY_SCOPE_REQUIRED')
    need(type(now)is type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now and now+300000<a['expiresAt']<=a['startsAt']+900000,'ROLLBACK_JOB_NEW_REAL_FIFTEEN_MINUTE_WINDOW_REQUIRED')
    need(type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512 and all(type(a[k])is str and re.fullmatch('[a-f0-9]{64}',a[k])for k in('independentReviewSha256','rolesAuthoritySha256','rolesSourceSha256','hostSourceSha256')),'ROLLBACK_JOB_EXTERNAL_REVIEW_REQUIRED')
    stats=a['originalRecoveryStat9'];need(type(stats)is dict and set(stats)=={'original-auth.json','finite-auth.json','applied.json'}and all(type(row)is list and len(row)==9 and all(type(v)is int for v in row)for row in stats.values()),'ROLLBACK_JOB_ACTUAL_SNAPSHOT_STAT9_REQUIRED')''')
old_inside=next(n for n in ast.parse(h).body if isinstance(n,ast.FunctionDef)and n.name=='inside');body=ast.get_source_segment(h,old_inside).replace("(leaf.prepare if a['phase'] == 'apply' else leaf.restore)(factory.core, roles_raw, roles_pin)","leaf.restore(factory.core, roles_raw, roles_pin)");h=function(h,'inside',body)
h=function(h,'require_unused_apply37','')
h=h.replace("    if a['phase']=='apply':require_unused_apply37(ops,control)\n",'').replace("    if a['phase']=='apply':material.validate(ops,control)\n",'')
h=function(h,'verify_current_stop','''def verify_current_stop(ops, control, a):
    s=a['service'];boot=ROOT/'state/native-services'/CURRENT_KEY
    proofraw=ops.read_file(ROOT/'authority/fresh35-current-production-service-v2-service-41.json',65536,True);p=ops.strict(proofraw)
    need(sha(proofraw)==s['proofSha256']and p['requestKey']==CURRENT_KEY and p['physical']['postmasterStart']==s['postmasterStart']and p['physical']['databaseOid']=='16393'and p['physical']['systemIdentifier']=='7706545564479176741','ROLLBACK_EXACT41_PROOF_REQUIRED')
    need(ops.strict(ops.read_file(boot/'retained-ack.json',65536,True))==dict(requestKey=CURRENT_KEY,proofSha256=s['proofSha256'],serviceLeaseExpiresAt=1794926342048),'ROLLBACK_REAL41_ACK_REQUIRED')
    cleanraw=ops.read_file(boot/'cleanup.json',65536,True);c=ops.strict(cleanraw)
    need(sha(cleanraw)==a['guardianCleanupSha256']and c['requestKey']==CURRENT_KEY and c['retained']is True and c['runtimeMaterialPreserved']is True and c['reason']=='NORMAL_FINITE_SERVICE_OR_CAPACITY_EXPIRED'and all(c['cleanup'].get(k)is True for k in('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'ROLLBACK_ACTUAL_GUARDIAN_CLEANUP_REQUIRED')
    b=inspect(s['containerId']);need(b['Id']==s['containerId']and b['Name']=='/'+CURRENT_NAME and b['Image']==IMAGE and b['State']['StartedAt']==s['containerStartedAt']and b['State']['Running']is False and b['State']['Pid']==0 and b['Config']['Labels'].get('t45.operation')==CURRENT_KEY,'ROLLBACK_EXACT_STOPPED_C41_REQUIRED')
    apply='t45-r3-ordinary41-auth-apply-20261117-01';t=ops.read_file(WORKER/apply/'r3-outer-terminal.json',65536,True);need(sha(t)=='73ca3c4dd871b684381db6c1b474504097b44f1d7f119de903052b2c1da6fda4'and t==ops.read_file(control/'results'/(apply+'.json'),65536,False,False),'ROLLBACK_ORIGINAL_APPLY_TERMINAL_REQUIRED')
    ar=ops.read_file(WORKER/apply/'results/maintenance-auth-result.json',65536,True);need(sha(ar)=='cdc51c702f155c920275b27cd89723d05d5da21b7a73f957cec185e3477dd659'and ops.strict(ar)['result']['privateRecoveryBasisRetained']is True,'ROLLBACK_ORIGINAL_APPLY_READBACK_REQUIRED')
    for leaf,expected in a['originalRecoveryStat9'].items():
        path=ROOT/'state/native-services/ordinary41-auth-20261117-01'/leaf;z=path.lstat();need(path.resolve()==path and stat.S_ISREG(z.st_mode)and [z.st_dev,z.st_ino,z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode),z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns]==expected and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o400 and z.st_nlink==1,'ROLLBACK_SNAPSHOT_STAT_ONLY_CHANGED')
    need(not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),'ROLLBACK_NO_LISTENER_REQUIRED')
    q=command(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-*.service'],5).decode().splitlines();own='naijue-erp-op-b16447fb-'+sha(a['requestKey'].encode())[:12]+'.service';need(all(row.split()[0]==own for row in q if row.strip()),'ROLLBACK_NO_OTHER_OPERATIONS_REQUIRED')''')
# Unreachable failed-start branches are not part of this rollback-only carrier.
for name in ['verify_failed_start_closed','verify_precontainer_failure']:h=function(h,name,'')
h=h.replace("('restoreAttemptPresent', 'restore-attempt.json'), ('originalAuthReadbackPresent', 'restored.json')","('restoreAttemptPresent', 'original-auth-rollback-attempt.json'), ('originalAuthReadbackPresent', 'original-auth-rollback-restored.json')",1)
h=h.replace("    modules['ordinary05_roles.py'].validate(role_authority, time.time_ns() // 1000000, phase == 'restore')","    modules['ordinary05_roles.py'].validate(role_authority, time.time_ns() // 1000000, True)",1)
a="    need(role_authority['rolesSourceSha256'] == a['rolesSourceSha256'], 'MAINT_JOB_ROLE_SOURCE_BINDING_DIFFERS')";z=a+"\n    need(role_authority['requestKey']==key and role_authority['startsAt']==a['startsAt']and role_authority['expiresAt']==a['expiresAt']and role_authority['originalRecoveryStat9']==a['originalRecoveryStat9'],'ROLLBACK_ONLY_INNER_OUTER_SAME_NEW_WINDOW_REQUIRED')";assert h.count(a)==1;h=h.replace(a,z,1)
ast.parse(h);(B/'ordinary05_roles_job.py').write_text(h)
# Original helper/history bytes are unchanged; role and host pins are supplied
# by the new independent rollback-only envelope, never the old temporary login.
rows={p.name:{'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size}for p in B.iterdir()if p.is_file()}
interface=dict(state='ROLLBACK_ONLY_SOURCE_INTERFACE_UNISSUED',jobId=KEY,script='ordinary05_roles_job.py',authorityLeaf='host-authorization.json',dynamicRollbackTicketLeaf='roles-authorization.json',timeoutSeconds=300,maximumNewAuthorityMilliseconds=900000,hostScopeAPI="scope('restore')",hostValidateAPI="validate(authority,'restore',actualNow)",rolesScopeAPI='scope()',rolesValidateAPI='validate(ticket,actualNow,True)',sourceDirectory=str(B),bundlePins={k:v['sha256']for k,v in rows.items()},bundleBytes={k:v['bytes']for k,v in rows.items()},oldRoles0980HistoricalOnly=True,snapshotMetadataFields='originalRecoveryStat9: exact3 filenames to9 actual ints; future fresh only',snapshotMetadataObserved=False,originalHardDeadline=1794926977752,originalHardDeadlineMet=False,newTemporaryLoginOrExpiryOrApplyAllowed=False,closed41Proof=SERVICE,closed41CleanupSha256='9b53d0e1ecdc7c9545a2dcbda3c213591abb87e830c24004fa14d7e79796c1ac',applyTerminalSha256='73ca3c4dd871b684381db6c1b474504097b44f1d7f119de903052b2c1da6fda4',applyResultSha256='cdc51c702f155c920275b27cd89723d05d5da21b7a73f957cec185e3477dd659',newPrivateAttemptLeaf='original-auth-rollback-attempt.json',newPrivateRestoredLeaf='original-auth-rollback-restored.json',newCaptureSlots=['rollback-before.csv','rollback-readback.csv'],resultLeaf='maintenance-auth-result.json',cleanupLeaf='maintenance-auth-cleanup.json',serverOrClockOrIssuerCalls=0,futureTickets=None)
(OUT/'INTERFACE.UNISSUED.json').write_text(json.dumps(interface,sort_keys=True,indent=2)+'\n');print(json.dumps({'interfaceSha256':sha((OUT/'INTERFACE.UNISSUED.json').read_bytes()),'jobId':KEY,'bundlePins':interface['bundlePins'],'serverCalls':0}))
