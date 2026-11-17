"""Derive only the authorized44 Root/Main successor from frozen43 source."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261118-r3-ordinary43-root-source-04')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets))
 return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def successor(s):
 return s.replace('Normal43Continuation','Normal44Continuation').replace('NORMAL43','NORMAL44').replace('normal43','normal44').replace('ordinary43 exact','ordinary44 exact').replace('direct43','direct44').replace('PHASES43','PHASES44')
def put(name,s):
 raw=s.encode()if isinstance(s,str)else s;compile(raw,str(D/name),'exec')if name.endswith('.py')else None;(D/name).write_bytes(raw)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());a=json.loads((D/'ACTUAL-HISTORY.json').read_bytes())
 # Keep all old definitions. Only the new class, current fields and closed43
 # predecessor check belong to this successor; old42 remains its own history.
 s=(OLD/'r3_normal43_continuation.py').read_text();s=assignment(s,'HISTORY',{})
 s=successor(s);s=s.replace("PROOF=HOST/'authority/fresh35-current-production-service-v2-service-43.json'","PROOF=HOST/'authority/fresh35-current-production-service-v2-service-44.json'")
 t=ast.parse(s);n=next(n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='validate_closed42');body=ast.get_source_segment(s,n)
 s=s.replace(body,body.replace("HISTORY['priorService']","HISTORY['historical42Service']"),1)
 s=s.replace('class Normal44Continuation:',(D/'validate_closed43.template.py').read_text()+'\nclass Normal44Continuation:',1)
 s=s.replace('validate_closed42(self.core,self.need)','validate_closed42(self.core,self.need);validate_closed43(self.core,self.need)',1)
 t=ast.parse(s);used={n.slice.value for n in ast.walk(t)if isinstance(n,ast.Subscript)and isinstance(n.value,ast.Name)and n.value.id=='HISTORY'and isinstance(n.slice,ast.Constant)and isinstance(n.slice.value,str)}
 s=assignment(s,'HISTORY',{k:h[k]for k in sorted(used)});s=assignment(s,'EXPECTED_RULES',h['expectedRules']);put('r3_normal44_continuation.py',s)
 patch=successor((OLD/'patch_dispatcher.py').read_text()).replace("BASE='3a3c1b0ec91a41b5696f81c2ed965a361790a810102a290de815dee412bb848f'","BASE='"+h['actualRootPins']['dispatcher']+"'").replace('actual127','actual132').replace('len(keys)==127','len(keys)==132')
 put('patch_dispatcher.py',patch)
 render=runpy.run_path(str(D/'patch_dispatcher.py'))['render']
 put('admin_exec.NORMAL44-UNREGISTERED.py',render((D/'ACTUAL132-DISPATCHER.py').read_bytes(),sha(s.encode()),h['jobs']))
 # Preserve43 registered module/policy and every protected historical receipt.
 old=runpy.run_path(str(OLD/'register_cas.py'));pins=dict(old['PRESERVE']);P=str(old['P']);B=str(old['B']);H=str(old['H'])
 pins[P+'/admin_exec.py']=h['actualRootPins']['dispatcher'];pins[P+'/r3_normal43_continuation.py']=a['actualRoot132']['moduleSha256'];pins[H+'/direct43-batched-real.json']=a['actualRoot132']['policySha256']
 x=h['closed43'];job=B+'/jobs/'+x['startKey']
 for leaf,key in [('r3-outer-terminal.json','terminal'),('results/normal-service-result.json','result'),('results/normal-service-incomplete.json','incomplete')]:pins[job+'/'+leaf]=x['startPins'][key]
 pins[job+'/results/genuine-describe-process.json']=x['describeProcessSha256']
 state='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/'
 pins[state+x['startKey']+'/failed-start-cleanup.json']=x['startPins']['cleanup'];pins[state+x['startKey']+'/retained-ack.json']=x['ackSha256']
 pins['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-43.json']=x['proofSha256']
 for kind in ('apply','restore'):
  key=x[kind+'Key'];pins[B+'/jobs/'+key+'/r3-outer-terminal.json']=x[kind+'Terminal']['sha256']
  for leaf,row in x[kind+'Results'].items():pins[B+'/jobs/'+key+'/results/'+leaf]=row['rootSha256']
 pins[state+'ordinary43-auth-20261118-01/restored.json']=x['safeReceiptSha256']
 s=successor((OLD/'register_cas.py').read_text());s=assignment(s,'JOBS',h['jobs']);s=assignment(s,'EXPECTED_RULES',h['expectedRules']);s=assignment(s,'OLD',h['actualRootPins']['dispatcher'])
 # Collapse the established PRESERVE updates to their exact union, including43.
 t=ast.parse(s);updates=[n for n in t.body if isinstance(n,ast.Expr)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Attribute)and isinstance(n.value.func.value,ast.Name)and n.value.func.value.id=='PRESERVE'and n.value.func.attr=='update']
 for n in updates:s=s.replace(ast.get_source_segment(s,n),'',1)
 s=assignment(s,'PRESERVE',pins);s=assignment(s,'CUSTODY',[])
 s=s.replace('sha=lambda raw:',"CUSTODY=[Path(path)for path in "+repr(list(h['custodyStat9']))+"]\nsha=lambda raw:",1)
 s=s.replace('r3-normal44-registration-source-20261118-03','r3-normal44-registration-source-20261118-01').replace('r3-normal44-registration-cas-20261117-01','r3-normal44-registration-cas-20261118-01').replace('old127AndThreeGuardsPreserved','old132AndThreeGuardsPreserved')
 s=s.replace('m.validate_closed42(core,need);m.require_current_stopped(need)','m.validate_closed42(core,need);m.validate_closed43(core,need);m.require_current_stopped(need)')
 # ACK42 remains separately protected historical SQL42 evidence. The already
 # observed ACK43 is additionally fixed by PRESERVE and the closed43 function.
 put('register_cas.py',s)
 reader=successor((OLD/'read_registration_basis.py').read_text())
 reader=reader.replace('ordinary43-auth-capture-20261118-01','ordinary44-auth-capture-20261118-01')
 reader=reader.replace("module.validate_closed42(core,a['need']);","module.validate_closed42(core,a['need']);module.validate_closed43(core,a['need']);")
 reader=reader.replace("ack_raw,_=a['read'](a['ACK42']);ack=json.loads(ack_raw)","ack42_raw,_=a['read'](a['ACK42']);ack42=json.loads(ack42_raw)\n  prior=module.HISTORY['closed43'];ack_raw,_=a['read'](module.HOST/'state/native-services'/prior['startKey']/'retained-ack.json');ack=json.loads(ack_raw)")
 reader=reader.replace('actual42UpgradeCommittedStoppedAndOriginalAuthRestored=True,','actual42UpgradeCommittedStoppedAndOriginalAuthRestored=True,actualFailed43CleanedAndOriginalAuthRestored=True,')
 reader=reader.replace("prior42RetainedAckSha256=a['sha'](ack_raw),prior42RetainedAckValue=ack,","prior42RetainedAckSha256=a['sha'](ack42_raw),prior42RetainedAckValue=ack42,prior43RetainedAckSha256=a['sha'](ack_raw),prior43RetainedAckValue=ack,")
 access=json.loads((D/'DESCRIBE-ACCESS-PATHS.json').read_bytes())
 reader=reader.replace('def main():','DESCRIBE_ACCESS_PATHS='+repr(access)+'\n'+(D/'describe_access.template.py').read_text()+'\ndef main():',1)
 reader=reader.replace("cfg=json.loads(a['read'](a['P']/'grant.json')[0])","access=ordinary_describe_access()\n  cfg=json.loads(a['read'](a['P']/'grant.json')[0])")
 reader=reader.replace("PGConnections=0,mutations=0,registryOrJobSubmitted=False)","ordinaryDescribeAccess=access,PGConnections=0,mutations=0,registryOrJobSubmitted=False)")
 put('read_registration_basis.py',reader)
 reg=successor((OLD/'issue_registration.py').read_text())
 reg=reg.replace("assert basis['actual42UpgradeCommittedStoppedAndOriginalAuthRestored']is True","assert basis['actualFailed43CleanedAndOriginalAuthRestored']is True\n assert basis['actual42UpgradeCommittedStoppedAndOriginalAuthRestored']is True")
 reg=reg.replace("assert basis['PGConnections']==basis['mutations']==0", "access=basis['ordinaryDescribeAccess'];assert access['state']=='PASS_MAPPED_EXISTING_INPUT_ACCESS_ONLY_NAMESPACE_UNVERIFIED'and access['actorVerified']is True and access['actor']==dict(uid=61035,euid=61035,gid=61035,egid=61035,groups=[])and access['bindRootsUnchanged']is True and access['pathSetMatches']is True and access['failures']==[]and access['bodyReads']is False and access['liveNamespaceProven']is False and access['sourceRowsSha256']=='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'\n assert basis['PGConnections']==basis['mutations']==0")
 begin=reg.index(" assert len(basis['prior42RetainedAckSha256'])")
 end=reg.index(' rules=json.loads',begin)
 reg=reg[:begin]+''' assert len(basis['prior42RetainedAckSha256'])==64 and basis['prior42RetainedAckValue']==dict(requestKey=w['historical42Service']['serviceKey'],proofSha256=w['historical42Service']['proofSha256'],serviceLeaseExpiresAt=w['closed42']['phase42WorkDeadline'])
 assert basis['prior43RetainedAckSha256']==w['closed43']['ackSha256']and basis['prior43RetainedAckValue']['requestKey']==w['closed43']['startKey']and basis['prior43RetainedAckValue']['proofSha256']==w['closed43']['proofSha256']
 predecessor_bindings=dict(w['predecessor']['bindings'])
 if 'previousRetainedAckSha256'in predecessor_bindings:
  assert predecessor_bindings['previousRetainedAckSha256']in(None,basis['prior42RetainedAckSha256']);predecessor_bindings['previousRetainedAckSha256']=basis['prior42RetainedAckSha256']
'''+reg[end:]
 put('issue_registration.py',reg)
 phase=successor((OLD/'issue_phase.py').read_text())
 phase=phase.replace("a['previousClosureKind']=='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED'","a['previousClosureKind']==witness['consumer44Interface']['previousStartFixedScope']['previousClosureKind']")
 phase=phase.replace('Finite same-PGDATA service43 after actual successful service42, preservation stop42 and original authentication restoration42; retained prepare05.','Finite same-PGDATA service44 retaining successful42 preservation history, with independent typed failed43 clean stop and original authentication restoration43; retained prepare05 and actual SQL42.')
 phase=phase.replace("and len(issued_bindings['previousRetainedAckSha256'])==64","and('previousRetainedAckSha256'not in issued_bindings or len(issued_bindings['previousRetainedAckSha256'])==64)")
 put('issue_phase.py',phase)
 channel=successor((OLD/'prepare_channel.py').read_text()).replace('NORMAL44-ROOT-EXECUTION-PREPARATION-03','NORMAL44-ROOT-EXECUTION-PREPARATION-01').replace('r3-normal44-registration-source-20261118-03','r3-normal44-registration-source-20261118-01').replace('old127AndThreeGuardsPreserved','old132AndThreeGuardsPreserved')
 put('prepare_channel.py',channel)
 # Existing custody/writer templates are unchanged source references.
 for leaf in ('plan_custody.template.py','writer_authority.template.py','validate_closed42.template.py'):(D/leaf).write_bytes((OLD/leaf).read_bytes())
 print('Rendered Source44 unissued Root137/Main7/Main8/channel; runtime actions0.')
if __name__=='__main__':main()
