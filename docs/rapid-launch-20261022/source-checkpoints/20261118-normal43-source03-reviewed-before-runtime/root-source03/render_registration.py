"""Render old atomic CAS/fresh/Main7 for exact43 only; never call entrypoints."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary42-root-source-02')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());s=(OLD/'register_cas.py').read_text();s=assignment(s,'JOBS',h['jobs']);s=assignment(s,'EXPECTED_RULES',h['expectedRules']);s=assignment(s,'OLD',h['actualRootPins']['dispatcher'])
 for a,b in [('r3-normal42-registration','r3-normal43-registration'),('r3_normal42_continuation.py','r3_normal43_continuation.py'),('direct42-batched-real.json','direct43-batched-real.json'),('.normal42-dispatcher.pending','.normal43-dispatcher.pending'),('Normal42Continuation','Normal43Continuation'),('NORMAL42','NORMAL43'),('old122AndThreeGuardsPreserved','old127AndThreeGuardsPreserved')]:s=s.replace(a,b)
 s=s.replace("ENTRY=B/'r3-normal43-registration-source-20261117-01/register_cas.py'","ENTRY=B/'r3-normal43-registration-source-20261118-02/register_cas.py'")
 old=runpy.run_path(str(OLD/'register_cas.py'))['PRESERVE'];pins=dict(old);P='/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64';B='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64';H=B+'/r3-05-write-continuity';pins[P+'/admin_exec.py']=h['actualRootPins']['dispatcher'];pins[P+'/r3_normal42_continuation.py']=h['closed42']['actualRoot127']['moduleSha256'];pins[H+'/direct42-batched-real.json']=h['closed42']['actualRoot127']['policySha256']
 x=h['closed42']
 for phase,leaf in [('start','normal-service-result.json'),('upgrade','batched161-command-update-result.json'),('stop','normal05-preserve-stop-result.json'),('restore','maintenance-auth-result.json')]:
  v=x[phase];key=v['key'];pins[B+'/jobs/'+key+'/r3-outer-terminal.json']=v['terminalSha256'];pins[B+'/jobs/'+key+'/results/'+leaf]=v['rootResultSha256']
 pins[B+'/jobs/'+x['restore']['key']+'/results/maintenance-auth-cleanup.json']=x['restore']['cleanupSha256']
 p=h['prepare05'];pins[B+'/jobs/'+p['key']+'/r3-outer-terminal.json']=p['terminalSha256'];pins[B+'/jobs/'+p['key']+'/results/final33-prepare-result.json']=p['rootResultSha256'];pins[B+'/jobs/'+p['key']+'/native-private/native-result.json']=p['nativeResultSha256']
 extra='PRESERVE.update('+repr(pins)+')\nCUSTODY=[Path(path)for path in '+repr(list(h['custodyStat9']))+']\n'
 s=s.replace('sha=lambda raw:',extra+'sha=lambda raw:',1)
 s=s.replace('m.validate_latest41(core,need);m.require_current_stopped(need)','m.validate_latest41(core,need);m.validate_closed42(core,need);m.require_current_stopped(need)')
 s=s.replace('def basis():',(D/'plan_custody.template.py').read_text()+'\ndef basis():',1)
 s=s.replace("out['executionLock']=list(LOCK_ID)","out['executionLock']=list(LOCK_ID);out.update(plan_basis())")
 s=s.replace("set(PRESERVE)|{str(path)for path in CUSTODY}|{'executionLock'}","set(PRESERVE)|{str(path)for path in CUSTODY}|{'executionLock'}|set(PLAN_CUSTODY)|{str(ACK42)}")
 s=s.replace("need(identity(LOCK.lstat())==LOCK_ID==tuple(old['executionLock'])","need(plan_basis()=={name:old[name]for name in list(PLAN_CUSTODY)+[str(ACK42)]},'HISTORICAL_PLAN_OR_ACK_METADATA_CHANGED')\n need(identity(LOCK.lstat())==LOCK_ID==tuple(old['executionLock'])")
 compile(s,'normal43_cas','exec');(D/'register_cas.py').write_text(s)
 reader=(OLD/'read_registration_basis.py').read_text().replace('r3_normal42_continuation','r3_normal43_continuation').replace('normal42','normal43').replace('READONLY_NORMAL42','READONLY_NORMAL43')
 reader=reader.replace('module.validate_latest41(core,a[\'need\']);','module.validate_latest41(core,a[\'need\']);module.validate_closed42(core,a[\'need\']);')
 reader=reader.replace('ordinary42-auth-capture-20261117-01','ordinary43-auth-capture-20261118-01').replace('actual41GuardianClosedAndOriginalAuthRestoredByRollback02=True,','actual41GuardianClosedAndOriginalAuthRestoredByRollback02=True,actual42UpgradeCommittedStoppedAndOriginalAuthRestored=True,')
 reader=reader.replace("cfg=json.loads(a['read'](a['P']/'grant.json')[0])","ack_raw,_=a['read'](a['ACK42']);ack=json.loads(ack_raw)\n  cfg=json.loads(a['read'](a['P']/'grant.json')[0])")
 reader=reader.replace("authenticationSnapshotBodiesOrDigestsRead=False,","authenticationSnapshotBodiesOrDigestsRead=False,historicalPlanCustody={k:identities[k]for k in a['PLAN_CUSTODY']},planAndAckCustodyStat9={k:identities[k]for k in list(a['PLAN_CUSTODY'])+[str(a['ACK42'])]},prior42RetainedAckSha256=a['sha'](ack_raw),prior42RetainedAckValue=ack,")
 (D/'read_registration_basis.py').write_text(reader)
 reg=(OLD/'issue_registration.py').read_text()
 for a,b in [('PHASES42','PHASES43'),('r3_normal42','r3_normal43'),('NORMAL42','NORMAL43'),('direct42','direct43'),('main42_','main43_'),("['apply','start','upgrade','stop','restore']","['apply','start','writer','stop','restore']"),('ordinary42 exact five-step maintenance only; no import or writer; original39 authentication preserved and restored.','ordinary43 exact five-step retained-plan import; original business identities and authentication preserved.')]:reg=reg.replace(a,b)
 reg=reg.replace("assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True", "assert basis['actual42UpgradeCommittedStoppedAndOriginalAuthRestored']is True\n assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True")
 reg=reg.replace("{str(p)for p in cas['CUSTODY']}|{'executionLock'}","{str(p)for p in cas['CUSTODY']}|{'executionLock'}|set(cas['PLAN_CUSTODY'])|{str(cas['ACK42'])}")
 reg=reg.replace("rules=json.loads(json.dumps(w['expectedRules']));","assert basis['historicalPlanCustody']=={name:basis['oldIdentities'][name]for name in cas['PLAN_CUSTODY']}\n assert basis['planAndAckCustodyStat9']=={name:basis['oldIdentities'][name]for name in list(cas['PLAN_CUSTODY'])+[str(cas['ACK42'])]}\n assert len(basis['prior42RetainedAckSha256'])==64 and basis['prior42RetainedAckValue']==dict(requestKey=w['priorService']['serviceKey'],proofSha256=w['priorService']['proofSha256'],serviceLeaseExpiresAt=w['closed42']['phase42WorkDeadline'])\n predecessor_bindings=dict(w['predecessor']['bindings']);assert predecessor_bindings['previousRetainedAckSha256']is None;predecessor_bindings['previousRetainedAckSha256']=basis['prior42RetainedAckSha256']\n rules=json.loads(json.dumps(w['expectedRules']));")
 reg=reg.replace("phaseSubmitted=False)","phaseSubmitted=False,predecessorBindings=predecessor_bindings,planCustodyStat9={k:basis['oldIdentities'][k]for k in cas['PLAN_CUSTODY']})")
 reg=reg.replace("folders[phase]==folder/phase/'bundle'","folders[phase]==Path(w['executionConsumerDirectory'])/phase/'bundle'")
 reg=reg.replace("controllerValidUntil=now+3600000","controllerValidUntil=now+4000000").replace("backupAdminValidUntil=now+3720000","backupAdminValidUntil=now+4120000").replace("restorationDeadline=now+4500000","restorationDeadline=now+4900000")
 reg=reg.replace("stamp=datetime.fromisoformat","execution=read(w['executionInterfacePath'],w['executionInterfaceSha256']);assert execution['phaseOrder']==w['phaseOrder'] and all(execution['jobs'][p]['sourceDirectory']==w['phaseDirectories'][p]for p in w['phaseOrder'])\n stamp=datetime.fromisoformat")
 compile(reg,'main7_normal43','exec');(D/'issue_registration.py').write_text(reg)
 print('Rendered SOURCE43 original atomic registration and Main7 only.')
if __name__=='__main__':main()
