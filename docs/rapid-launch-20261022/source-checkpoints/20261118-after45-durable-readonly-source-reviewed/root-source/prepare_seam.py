from pathlib import Path
import ast,json
D=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261118-r3-after45-businessroot-durable-root-source-01');R=D.parents[2];O=R/'outputs/D1/20261118-r3-original-auth45-guardian-restore-root-source-03';OLD=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/DURABLE-READONLY-SOURCE-03';h=json.loads((D/'HISTORY.json').read_bytes())
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def func(s,name,body):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name==name);return s.replace(ast.get_source_segment(s,n),body,1)
s=(OLD/'r3_core0_durable_readonly_02.py').read_text();s=assignment(s,'KEY',h['newJobId']);s=assignment(s,'POLICY_NAME','after45-businessroot-durable-readonly-20261118-01.json');s=s.replace('class DurableReadonly02Continuation:','class After45DurableReadonly:').replace("'R3_CONTINUITY_DURABLE02_'","'R3_CONTINUITY_AFTER45_DURABLE_'").replace("'durable-core0-readonly-02'","'after45-businessroot-durable-readonly'");s=assignment(s,'EXPECTED_BUNDLE',None)
s=s.replace("len(rows)==5 and len({r['name'] for r in rows})==5", "len(rows)==len(EXPECTED_BUNDLE)+1 and len({r['name'] for r in rows})==len(EXPECTED_BUNDLE)+1")
s=s.replace("'T45_R3_CORE0_DURABLE_READONLY_REGISTERED_V1'",'POLICY_FORMAT').replace("'T45_R3_CORE0_DURABLE_READONLY_AUTHORITY_V1'",'AUTHORITY_FORMAT')
s=s.replace("  c,p=self.core,self.policy;stamp=", "  self.prior.original_basis();read_closed_basis(self.core,self.prior,self.need)\n  c,p=self.core,self.policy;stamp=")
extra='''
from types import ModuleType
import subprocess
HISTORY=__HISTORY__
POLICY_FORMAT=__POLICY_FORMAT__
AUTHORITY_FORMAT=__AUTHORITY_FORMAT__
def read_closed_basis(core,prior,need):
 root=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
 module_raw=core.read(root/'r3_original_auth45_guardian_restore.py')
 need(core.sha(module_raw)==HISTORY['previousModuleSha256'],'ACTUAL143_RESTORATION_ADMISSION_SOURCE_REQUIRED')
 m=ModuleType('accepted_guardian45_closed_source');exec(compile(module_raw,'accepted_guardian45_closed_source','exec'),m.__dict__)
 closure=m.closed45(core,prior,need)
 x=HISTORY['restore'];base=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')/x['key']
 def fixed(leaf,pin):
  raw=core.read(base/leaf);need(core.sha(raw)==pin,'ACTUAL45_RESTORATION_RECORD_CHANGED');return core.strict(raw)
 t=fixed('r3-outer-terminal.json',x['terminalSha256']);r=fixed('results/maintenance-auth-result.json',x['resultSha256']);c=fixed('results/maintenance-auth-cleanup.json',x['cleanupSha256'])
 need((t['jobId'],t['status'],t['exitCode'])==(x['key'],'COMPLETED',0)and r['result']['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and r['result']['naturalExpiryCountedAsRestoration']is False and r['result']['runtimeAuthChanged']is False and r['result']['membershipsOrRoleAttributesChanged']is False and r['result']['originalHardDeadlineMet']is False,'ACTUAL45_ORIGINAL_AUTH_RESTORATION_RECEIPT_REQUIRED')
 need(c['ownContainerStopped']is True and c['ownedPidAbsent']is True and c['confirmed']is True and c['sourceDataPreserved']is True,'ACTUAL45_RESTORATION_HELPER_CLEANUP_REQUIRED')
 fmt='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"operation":{{json (index .Config.Labels "t45.operation")}}}'
 q=subprocess.run(['/usr/bin/docker','inspect','--format',fmt,x['container']['id']],capture_output=True,timeout=5)
 need(q.returncode==0 and not q.stderr and core.strict(q.stdout)==x['container'],'ACTUAL_RESTORATION_HELPER_STILL_STOPPED_REQUIRED')
 return dict(closure,restorationResultSha256=x['resultSha256'],originalAuthRestored=True)
'''
pos=s.index('class After45DurableReadonly:');s=s[:pos]+extra+s[pos:];(D/'admission.template.py').write_text(s)
# Reuse CAS functions; preserve collection is extracted structurally, NEVER text-renamed.
s=(O/'register_cas.py').read_text();t=ast.parse(s);n=next(n for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='PRESERVE'for x in n.targets));p=ast.literal_eval(n.value)
B='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64';P='/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64';H=B+'/r3-05-write-continuity';p[P+'/admin_exec.py']=h['dispatcherSha256'];p[P+'/r3_original_auth45_guardian_restore.py']=h['previousModuleSha256'];p[H+'/original-auth45-guardian-restore-only-20261118-01.json']=h['previousPolicySha256']
for leaf,pin in [('r3-outer-terminal.json',h['restore']['terminalSha256']),('results/maintenance-auth-result.json',h['restore']['resultSha256']),('results/maintenance-auth-cleanup.json',h['restore']['cleanupSha256'])]:p[B+'/jobs/'+h['restore']['key']+'/'+leaf]=pin
s=assignment(s,'PRESERVE',p)
for name,value in [('JOBS',h['jobs']),('EXPECTED_RULES',{'observe':None}),('OLD',h['dispatcherSha256'])]:s=assignment(s,name,value)
# Path assignments only.
for name,expr in {'ENTRY':"B/'r3-after45-businessroot-durable-registration-source-20261118-01/register_cas.py'",'AUDIT':"B/'r3-after45-businessroot-durable-registration-cas-20261118-01'",'NEW_MODULE':"P/'r3_after45_businessroot_durable_readonly.py'",'NEW_POLICY':"H/'after45-businessroot-durable-readonly-20261118-01.json'",'PENDING':"P/'.after45-businessroot-durable-dispatcher.pending'"}.items():
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets));s=s.replace(ast.get_source_segment(s,n),name+'='+expr,1)
s=func(s,'closed45','''def closed45():
 from types import ModuleType
 raw,_=read(P/'admin_exec.py');w=ModuleType('actual_root143');w.__file__=str(P/'admin_exec.py');exec(compile(raw,w.__file__,'exec'),w.__dict__)
 cfg=json.loads(read(P/'grant.json')[0]);core,prior=w.r3_continuity(cfg);prior=w.original_auth45_guardian_restore(core,prior,cfg)
 raw,_=read(ENTRY.with_name('r3_after45_businessroot_durable_readonly.py'));m=ModuleType('after45_readonly_basis');m.__file__=str(ENTRY.with_name('r3_after45_businessroot_durable_readonly.py'));exec(compile(raw,m.__file__,'exec'),m.__dict__)
 return m.read_closed_basis(core,prior,need)''')
s=func(s,'validate_policy_delta','''def validate_policy_delta(p):
 need(type(p)is dict and set(p)=={'format','requestKey','startsAt','expiresAt','authoritySha256','sourceReviewSha256','bundlePins'}and p['format']==POLICY_FORMAT and p['requestKey']==JOBS['observe']and p['bundlePins']==EXPECTED_RULES['observe']['bundlePins']and all(type(p[k])is str and re.fullmatch('[a-f0-9]{64}',p[k])for k in('authoritySha256','sourceReviewSha256')),'EXACT_SINGLE_READONLY_POLICY_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['startsAt']<p['expiresAt']<=p['startsAt']+900000,'FINITE_READONLY_WINDOW_REQUIRED')''')
s=func(s,'consumer','''def consumer(dispatcher,cfg,module_raw,policy_raw):
 from types import ModuleType
 wrapper=ModuleType('fixed_after45_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
 core,prior=wrapper.r3_continuity(cfg);prior=wrapper.original_auth45_guardian_restore(core,prior,cfg)
 module=ModuleType('fixed_after45_admission');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
 original=core.read;core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
 try:module.After45DurableReadonly(core,prior,cfg,sha(policy_raw))
 finally:core.read=original''')
# Change only the register function's new protocol labels, no history collection.
n=next(n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)and n.name=='register');part=ast.get_source_segment(s,n);new=part.replace('T45_ORIGINAL_AUTH45_GUARDIAN_RESTORE_REGISTRATION_CAS_V1','T45_AFTER45_BUSINESSROOT_DURABLE_REGISTRATION_CAS_V1').replace('ORIGINAL_AUTH45_GUARDIAN_RESTORE_POLICY_SHA256','AFTER45_DURABLE_POLICY_SHA256').replace('EXACT_ORIGINAL_AUTH45_GUARDIAN_RESTORE_ROOT_REGISTERED_NO_ROLLBACK_SUBMITTED','EXACT_AFTER45_BUSINESSROOT_DURABLE_ROOT_REGISTERED_NO_OBSERVATION_SUBMITTED').replace('old142AndThreeGuardsPreserved','old143AndThreeGuardsPreserved');s=s.replace(part,new,1)
s=s.replace("result['status']=='EXACT_ORIGINAL_AUTH45_GUARDIAN_RESTORE_ROOT_REGISTERED_NO_ROLLBACK_SUBMITTED'", "result['status']=='EXACT_AFTER45_BUSINESSROOT_DURABLE_ROOT_REGISTERED_NO_OBSERVATION_SUBMITTED'")
s='POLICY_FORMAT=__POLICY_FORMAT__\n'+s
(D/'register_cas.template.py').write_text(s)
print('MODULE_AND_CAS_SEAMS_READY',len(p))
