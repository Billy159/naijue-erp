"""Exact source45 Root/Main generation, never issue or call runtime code."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261118-r3-ordinary44-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets))
 return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def successor(s):
 return s.replace('Normal44Continuation','Normal45Continuation').replace('NORMAL44','NORMAL45').replace('normal44','normal45').replace('ordinary44 exact','ordinary45 exact').replace('direct44','direct45').replace('PHASES44','PHASES45')
def put(name,s):
 raw=s.encode()if isinstance(s,str)else s;compile(raw,str(D/name),'exec');(D/name).write_bytes(raw)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());a=json.loads((D/'ACTUAL-HISTORY.json').read_bytes());x=h['closed44']
 s=assignment((OLD/'r3_normal44_continuation.py').read_text(),'HISTORY',{});s=successor(s)
 s=s.replace("PROOF=HOST/'authority/fresh35-current-production-service-v2-service-44.json'","PROOF=HOST/'authority/fresh35-current-production-service-v2-service-45.json'")
 s=s.replace('class Normal45Continuation:',(D/'validate_closed44.template.py').read_text()+'\nclass Normal45Continuation:',1)
 s=s.replace('validate_closed43(self.core,self.need)','validate_closed43(self.core,self.need);validate_closed44(self.core,self.need)',1)
 used={n.slice.value for n in ast.walk(ast.parse(s))if isinstance(n,ast.Subscript)and isinstance(n.value,ast.Name)and n.value.id=='HISTORY'and isinstance(n.slice,ast.Constant)and isinstance(n.slice.value,str)}
 s=assignment(s,'HISTORY',{k:h[k]for k in sorted(used)});s=assignment(s,'EXPECTED_RULES',h['expectedRules']);put('r3_normal45_continuation.py',s)
 patch=successor((OLD/'patch_dispatcher.py').read_text()).replace("BASE='e321fd75440c43300006ea8408d1329ec55e3aed5638a83b3b5bf9eca25e0173'","BASE='"+h['actualRootPins']['dispatcher']+"'").replace('actual132','actual137').replace('len(keys)==132','len(keys)==137')
 put('patch_dispatcher.py',patch);render=runpy.run_path(str(D/'patch_dispatcher.py'))['render']
 put('admin_exec.NORMAL45-UNREGISTERED.py',render((D/'ACTUAL137-DISPATCHER.py').read_bytes(),sha(s.encode()),h['jobs']))
 old=runpy.run_path(str(OLD/'register_cas.py'));pins=dict(old['PRESERVE']);P=str(old['P']);B=str(old['B']);H=str(old['H'])
 pins[P+'/admin_exec.py']=h['actualRootPins']['dispatcher'];pins[P+'/r3_normal44_continuation.py']=a['actualRoot137']['moduleSha256'];pins[H+'/direct44-batched-real.json']=a['actualRoot137']['policySha256']
 for key,terminal,result,leaf in((x['service']['serviceKey'],x['startTerminal'],x['startResult'],'normal-service-result.json'),(x['stopKey'],x['stopTerminal'],x['stopResult'],'normal05-preserve-stop-result.json'),(x['restoreKey'],x['restoreTerminal'],x['restoreResult'],'maintenance-auth-result.json')):
  pins[B+'/jobs/'+key+'/r3-outer-terminal.json']=terminal['sha256'];pins[B+'/jobs/'+key+'/results/'+leaf]=result['sha256']
 key=x['writerKey'];pins[B+'/jobs/'+key+'/r3-outer-terminal.json']=x['writerTerminal']['sha256']
 for leaf,row in(('final33-writer-incomplete.json',x['writerIncomplete']),('final33-writer-child-cleanup.json',x['writerCleanup'])):pins[B+'/jobs/'+key+'/results/'+leaf]=row['sha256']
 state='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/'
 boot=state+x['service']['serviceKey']
 pins[boot+'/retained-ack.json']=x['ackSha256'];pins[boot+'/cleanup.json']=x['guardianSha256']
 pins['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-44.json']=x['service']['proofSha256']
 for ref in x['startResult']['value']['describe']['outputs'].values():pins[boot+'/'+ref['leaf']]=ref['sha256']
 pins[B+'/jobs/'+x['restoreKey']+'/results/maintenance-auth-cleanup.json']=x['restoreCleanupSha256'];pins[state+'ordinary44-auth-20261118-01/restored.json']=x['safeReceiptSha256']
 s=successor((OLD/'register_cas.py').read_text());s=assignment(s,'JOBS',h['jobs']);s=assignment(s,'EXPECTED_RULES',h['expectedRules']);s=assignment(s,'OLD',h['actualRootPins']['dispatcher']);s=assignment(s,'PRESERVE',pins)
 # One fixed list, never bodies/digests of the authentication snapshots.
 nodes=[n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='CUSTODY'for t in n.targets)]
 nodes+=[n for n in ast.parse(s).body if isinstance(n,ast.Expr)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Attribute)and isinstance(n.value.func.value,ast.Name)and n.value.func.value.id=='CUSTODY']
 for n in nodes:s=s.replace(ast.get_source_segment(s,n),'',1)
 s=s.replace('sha=lambda raw:',"CUSTODY=[Path(path)for path in "+repr(list(h['custodyStat9']))+"]\nsha=lambda raw:",1)
 s=s.replace('old132AndThreeGuardsPreserved','old137AndThreeGuardsPreserved').replace('m.validate_closed43(core,need);m.require_current_stopped(need)','m.validate_closed43(core,need);m.validate_closed44(core,need);m.require_current_stopped(need)')
 put('register_cas.py',s)
 reader=successor((OLD/'read_registration_basis.py').read_text()).replace('ordinary44-auth-capture-20261118-01','ordinary45-auth-capture-20261118-01')
 reader=reader.replace("module.validate_closed43(core,a['need']);","module.validate_closed43(core,a['need']);module.validate_closed44(core,a['need']);")
 reader=reader.replace('actualFailed43CleanedAndOriginalAuthRestored=True,','actualFailed43CleanedAndOriginalAuthRestored=True,actual44StoppedRestoredAndWriterFailedBeforeChild=True,')
 reader=assignment(reader,'DESCRIBE_ACCESS_PATHS',json.loads((D/'DESCRIBE-ACCESS-PATHS.json').read_bytes()))
 n=next(n for n in ast.parse(reader).body if isinstance(n,ast.FunctionDef)and n.name=='ordinary_describe_access')
 reader=reader.replace(ast.get_source_segment(reader,n),(D/'describe_access.template.py').read_text().rstrip(),1)
 put('read_registration_basis.py',reader)
 reg=successor((OLD/'issue_registration.py').read_text())
 reg=reg.replace("assert basis['actualFailed43CleanedAndOriginalAuthRestored']is True","assert basis['actual44StoppedRestoredAndWriterFailedBeforeChild']is True\n assert basis['actualFailed43CleanedAndOriginalAuthRestored']is True")
 put('issue_registration.py',reg)
 phase=successor((OLD/'issue_phase.py').read_text()).replace('consumer44Interface','consumer45Interface')
 phase=phase.replace('Finite same-PGDATA service44 retaining successful42 preservation history, with independent typed failed43 clean stop and original authentication restoration43; retained prepare05 and actual SQL42.','Finite same-PGDATA service45 retaining successful42 history and typed failed43 closure, with actual44 successful start-stop-restore and writer failed before child; original prepare05 and actual SQL42 unchanged.')
 put('issue_phase.py',phase)
 channel=successor((OLD/'prepare_channel.py').read_text()).replace('old132AndThreeGuardsPreserved','old137AndThreeGuardsPreserved')
 put('prepare_channel.py',channel)
 print('Rendered Source45 Root142/Main/channel definitions only; runtime calls0.')
if __name__=='__main__':main()
