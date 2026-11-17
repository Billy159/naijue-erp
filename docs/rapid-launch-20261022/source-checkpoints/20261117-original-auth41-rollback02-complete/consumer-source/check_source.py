from pathlib import Path
from types import SimpleNamespace
import ast,hashlib,json,runpy,difflib,stat
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'NORMAL41-THREE-ROUTINE-MAINTENANCE-SOURCE-01/restore/bundle';B=HERE/'bundle'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();checks=[]
def ck(name,v):assert v,name;checks.append(name)
def functions(p):return{n.name:n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)}
def same(a,b):return ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
r0=functions(OLD/'ordinary05_roles.py');r=functions(B/'ordinary05_roles.py');h0=functions(OLD/'ordinary05_roles_job.py');h=functions(B/'ordinary05_roles_job.py')
for name in ['need','encode','quote','timestamp','private_file','read_private_raw','read_private','sync_directory','stopped','snapshot_sql','validate_snapshot','offline','capture','change_sql']:ck('original role algorithm AST unchanged '+name,same(r0[name],r[name]))
ck('no temporary authentication generator or apply entry',not({'prepare','verifier','desired'}&set(r)))
source=(B/'ordinary05_roles.py').read_text();ck('no password generator imports',all(x not in source for x in ['import secrets','import hmac','import base64']))
old_restore=ast.get_source_segment((OLD/'ordinary05_roles.py').read_text(),r0['restore']);new_restore=ast.get_source_segment(source,r['restore']);core=lambda t:t[t.index('    stopped(core)'):t.index('    receipt =')]
norm=core(new_restore).replace('original-auth-rollback-attempt.json','restore-attempt.json').replace('rollback-before','restore-before').replace('rollback-readback','restore-readback');ck('original restore observation/change/readback body retained',norm==core(old_restore))
ck('old authority historical digest only and original unused restore leaves preserved',"'0980cee0d05d7deed79ae92089cde540ebb77e47ad1f3511b6de1c989a542d9c'"in new_restore and "CUSTODY/'restore-attempt.json'"in new_restore and"CUSTODY/'restored.json'"in new_restore)
ck('full original role state readback still required',"need(restored == before"in new_restore and 'change_sql(after, before)'in new_restore)
ck('original hard is recorded truthfully',"'originalHardDeadlineMet':time.time_ns()//1000000<=1794926977752"in source)
ck('role validate pure before container while full stat guard remains in assert_entry',not any(isinstance(n,ast.Attribute)and n.attr=='lstat'for n in ast.walk(r['validate']))and any(isinstance(n,ast.Attribute)and n.attr=='lstat'for n in ast.walk(r['assert_entry'])))
for name in ['need','present','sha','encode','read','write','module','command','inspect','owned','find_owned','original_stopped','docker_args','work_left','require_failed19_history']:ck('original host lifecycle AST unchanged '+name,same(h0[name],h[name]))
old_host=ast.get_source_segment((OLD/'ordinary05_roles_job.py').read_text(),h0['host']);new_host=ast.get_source_segment((B/'ordinary05_roles_job.py').read_text(),h['host']);expected=old_host.replace("    if a['phase']=='apply':require_unused_apply37(ops,control)\n",'').replace("    if a['phase']=='apply':material.validate(ops,control)\n",'');ck('host own container lifecycle unchanged except removal of apply branches',new_host==expected)
ck('inside only calls restore not prepare',not any(isinstance(n,ast.Attribute)and n.attr=='prepare'for n in ast.walk(h['inside'])))
ck('no failed-start or unused apply bypass',not({'require_unused_apply37','verify_failed_start_closed','verify_precontainer_failure'}&set(h)))
roleapi=runpy.run_path(str(B/'ordinary05_roles.py'),run_name='static_role_scope_only');hostapi=runpy.run_path(str(B/'ordinary05_roles_job.py'),run_name='static_host_scope_only')
ck('host fixed single new rollback key300 budget',hostapi['PHASES']=={'restore':('t45-r3-ordinary41-original-auth-rollback-20261117-02',)*2}and hostapi['scope']()['maximumOperationSeconds']==300)
ck('role scope binds rollback-only without temporary validity fields',roleapi['scope']()['decision']=='RESTORE_EXISTING_ORIGINAL_TWO_ROLE_AUTH_ONLY'and all(k not in roleapi['scope']()for k in ['controllerValidUntil','backupAdminValidUntil','restorationDeadline']))
rejected=False
try:hostapi['scope']('apply')
except ValueError:rejected=True
ck('apply phase is rejected by fixed scope',rejected)
oldticket=json.loads(Path('outputs/主控/20261117-r3-normal41-registration-window-01/roles-authorization.json').read_bytes());rejected=False
try:roleapi['validate'](oldticket,oldticket['startsAt'],True)
except ValueError:rejected=True
ck('original finite-login authority is not executable under new rollback ticket',rejected)
ck('all original static support bytes retained',all((B/p.name).read_bytes()==p.read_bytes()for p in OLD.iterdir()if p.name not in ['ordinary05_roles.py','ordinary05_roles_job.py']))
for p in B.iterdir():compile(p.read_bytes(),str(p),'exec')
ck('eight static bundle Python leaves compile',len(list(B.iterdir()))==8)
ck('no future ticket or role values manufactured',not(B/'roles-authorization.json').exists()and not(B/'host-authorization.json').exists())
parent=HERE.parent/'ORIGINAL-AUTH41-ROLLBACK-SOURCE-01/bundle'
oldkey='t45-r3-ordinary41-original-auth-rollback-20261117-01';newkey='t45-r3-ordinary41-original-auth-rollback-20261117-02'
ck('role successor changes only the two fixed identity fields',(B/'ordinary05_roles.py').read_text()==(parent/'ordinary05_roles.py').read_text().replace(oldkey,newkey))
before="    proofraw=ops.read_file(ROOT/'authority/fresh35-current-production-service-v2-service-41.json',65536,True);p=ops.strict(proofraw)"
after="    proof=ROOT/'authority/fresh35-current-production-service-v2-service-41.json';z=proof.lstat()\n    need(proof.resolve()==proof and stat.S_ISREG(z.st_mode)and z.st_uid==z.st_gid==0 and stat.S_IMODE(z.st_mode)==0o444 and z.st_nlink==1,'ROLLBACK_EXACT41_PUBLIC_PROOF_METADATA_REQUIRED')\n    proofraw=ops.read_file(proof,65536,False);p=ops.strict(proofraw)"
ck('host successor changes only fixed identity and exact public proof read',(B/'ordinary05_roles_job.py').read_text()==(parent/'ordinary05_roles_job.py').read_text().replace(oldkey,newkey).replace(before,after,1))
verify=h['verify_current_stop']
guard=next(n for n in ast.walk(verify)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='need'and len(n.args)>1 and isinstance(n.args[1],ast.Constant)and n.args[1].value=='ROLLBACK_EXACT41_PUBLIC_PROOF_METADATA_REQUIRED')
expression=compile(ast.Expression(guard.args[0]),'<public-proof-metadata-expression>','eval')
proof=SimpleNamespace();proof.resolve=lambda:proof
base=dict(st_mode=stat.S_IFREG|0o444,st_uid=0,st_gid=0,st_nlink=1)
accept=lambda attrs,path=proof:eval(expression,{'stat':stat,'proof':path,'z':SimpleNamespace(**attrs)})
ck('actual public root root0444 nlink1 is accepted by metadata expression',accept(base))
for label,delta in [('owner',{'st_uid':1000}),('group',{'st_gid':1000}),('private0600',{'st_mode':stat.S_IFREG|0o600}),('writable0644',{'st_mode':stat.S_IFREG|0o644}),('hardlink',{'st_nlink':2}),('directory',{'st_mode':stat.S_IFDIR|0o444})]:
 ck('public proof rejects changed '+label,not accept({**base,**delta}))
ck('public proof rejects noncanonical path',not accept(base,SimpleNamespace(resolve=lambda:object())))
calls=[n for n in ast.walk(verify)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='read_file']
ck('public false read is confined to exact proof and existing public terminal',sum(isinstance(n.args[2],ast.Constant)and n.args[2].value is False for n in calls)==2)
for name in ['read_private_raw','assert_entry','restore','change_sql','snapshot_sql','capture','offline']:
 ck('parent private and restoration algorithm unchanged '+name,same(functions(parent/'ordinary05_roles.py')[name],r[name]))
i=json.loads((HERE/'INTERFACE.UNISSUED.json').read_bytes());i['hostScopeFixed']=hostapi['scope']();i['hostVariableFields']=['startsAt','expiresAt','authorizationReference','independentReviewSha256','rolesAuthoritySha256','rolesSourceSha256','hostSourceSha256','originalRecoveryStat9'];i['rolesScopeFixed']=roleapi['scope']();i['rolesVariableFields']=['startsAt','expiresAt','authorizationReference','rolesSourceSha256','independentReviewSha256','originalRecoveryStat9'];i['newRollbackTicketNotTemporaryLogin']=True;i['dynamicTicketsHaveIdenticalRealWindowAndStat9']=True;i['expectedSafeOuterSuccess']='FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED';i['expectedInnerSuccess']='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK';i['safeResultFields']=['requestKey','phase','result','cleanup','status','automaticReplay'];i['privateSnapshotBodyOrDigestExported']=False
(HERE/'INTERFACE.UNISSUED.json').write_text(json.dumps(i,sort_keys=True,indent=2)+'\n')
result={'state':'ROLLBACK_ONLY_SOURCE_SCOPED_CHECKS_PASS_NOT_EXECUTED','checks':checks,'count':len(checks),'oldRoleSQLSnapshotCaptureAndChangeAlgorithmReused':True,'serverOrClockOrIssuerOrPGCalls':0,'ticketsCreated':False,'positiveRuntimeFixtureCreated':False,'oldHardDeadlineNotMetAcknowledged':True};(HERE/'CHECK-RESULT.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
patch=''
for name in ['ordinary05_roles.py','ordinary05_roles_job.py']:patch+=''.join(difflib.unified_diff((parent/name).read_text().splitlines(True),(B/name).read_text().splitlines(True),fromfile='source01/'+name,tofile='source02/'+name))
(HERE/'SOURCE-DELTA.patch').write_text(patch);print(json.dumps({'checks':len(checks),'checkSHA':sha(HERE/'CHECK-RESULT.json'),'interfaceSHA':sha(HERE/'INTERFACE.UNISSUED.json'),'hostScope':i['hostScopeFixed'],'hostVariableFields':i['hostVariableFields'],'rolesVariableFields':i['rolesVariableFields']}))
