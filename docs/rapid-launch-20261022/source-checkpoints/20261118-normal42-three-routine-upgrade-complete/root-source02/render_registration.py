from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary41-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());s=(OLD/'register_cas.py').read_text();s=assignment(s,'JOBS',{p:h['jobs'][p]for p in['apply','start','upgrade','stop','restore']});s=assignment(s,'EXPECTED_RULES',h['expectedRules']);s=assignment(s,'OLD',h['actualRootPins']['dispatcher'])
 for a,b in [('r3-normal41-registration','r3-normal42-registration'),('r3_normal41_continuation.py','r3_normal42_continuation.py'),('direct41-batched-real.json','direct42-batched-real.json'),('.normal41-dispatcher.pending','.normal42-dispatcher.pending'),('Normal41Continuation','Normal42Continuation'),('NORMAL41','NORMAL42'),('old115AndThreeGuardsPreserved','old122AndThreeGuardsPreserved')]:s=s.replace(a,b)
 # Actual Root122 lineage and successful rollback02 remain separately pinned.
 x=h['rollback02'];P='/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64';B='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64';H=B+'/r3-05-write-continuity';pins={P+'/r3_normal41_continuation.py':'c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce',H+'/direct41-batched-real.json':'5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9',P+'/r3_original_auth41_rollback.py':'b7af59ad9fc3517324aaf6b407e21d7d90708e3c226846714860c8ef194afacc',H+'/original-auth41-rollback-only-20261117-01.json':'c4379f1716fd98fc50bf774f7e1e3e698a584b3207585aadfc33d5b2ec627de5',P+'/r3_original_auth41_rollback02.py':h['actualRollback02ModuleSha256'],H+'/original-auth41-rollback-only-20261117-02.json':h['actualRollback02PolicySha256'],B+'/jobs/'+x['key']+'/r3-outer-terminal.json':x['terminalSha256'],B+'/jobs/'+x['key']+'/results/maintenance-auth-result.json':x['rootResultSha256'],B+'/jobs/'+x['key']+'/results/maintenance-auth-cleanup.json':x['cleanupSha256']}
 old_custody=set(h['custodyStat9']);extra="PRESERVE.update("+repr(pins)+")\nCUSTODY=list(dict.fromkeys(CUSTODY+[Path(p)for p in "+repr(sorted(old_custody))+"]))\n"
 s=s.replace('sha=lambda raw:',extra+'sha=lambda raw:',1)
 s=s.replace('sha=lambda raw:', 'CUSTODY=[Path(path)for path in '+repr(list(h['custodyStat9']))+']\n'+'sha=lambda raw:',1)
 previous=runpy.run_path(str(D.with_name('20261117-r3-original-auth41-rollback02-root-source-01')/'register_cas.py'))['PRESERVE'];previous=dict(previous);previous[str(Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py'))]=h['actualRootPins']['dispatcher']
 s=s.replace('CUSTODY=[Path(path)for path in ', 'PRESERVE.update('+repr(previous)+')\nCUSTODY=[Path(path)for path in ',1)
 # Validate the actual new stopped basis, not an obsolete failed-writer or a
 # live41 lease. This only defines future metadata checks.
 anchor=" closure=diagnostic_closed()"
 s=s.replace(anchor,anchor+"\n from types import ModuleType\n path=ENTRY.with_name('r3_normal42_continuation.py');raw,_=read(path);m=ModuleType('normal42_stopped_history');m.__file__=str(path);exec(compile(raw,str(path),'exec'),m.__dict__)\n core=ModuleType('normal42_read_core');core.read=lambda p:read(p)[0];core.sha=sha;core.strict=json.loads\n m.validate_history(core,need,m.HISTORY['custodyStat9']);m.validate_latest41(core,need);m.require_current_stopped(need)")
 compile(s,'normal42_cas','exec');(D/'register_cas.py').write_text(s)
 reader=(OLD/'read_registration_basis.py').read_text().replace('r3_normal41_continuation','r3_normal42_continuation').replace('normal41','normal42').replace('READONLY_NORMAL41','READONLY_NORMAL42')
 reader=reader.replace("module.validate_closed40(core,a['need']);", "module.validate_closed40(core,a['need']);module.validate_latest41(core,a['need']);")
 reader=reader.replace('ordinary41-auth-capture','ordinary42-auth-capture').replace('actualFailed40ClosedAndOriginalAuthRestored=True,','actualFailed40ClosedAndOriginalAuthRestored=True,actual41GuardianClosedAndOriginalAuthRestoredByRollback02=True,')
 (D/'read_registration_basis.py').write_text(reader)
 channel=(OLD/'prepare_channel.py').read_text()
 for a,b in [('NORMAL41-ROOT-EXECUTION-PREPARATION-01','NORMAL42-ROOT-EXECUTION-PREPARATION-01'),('r3-normal41-registration','r3-normal42-registration'),('r3_normal41_continuation','r3_normal42_continuation'),('NORMAL41','NORMAL42'),('old115AndThreeGuardsPreserved','old122AndThreeGuardsPreserved')]:channel=channel.replace(a,b)
 channel=channel.replace('DURABLE-READONLY-EXECUTION-PREPARATION-03/STAGE-ROOT-SOURCE.py','DURABLE-READONLY-EXECUTION-PREPARATION-02/STAGE-ROOT-SOURCE.py')
 (D/'prepare_channel.py').write_text(channel);print('Rendered existing CAS/fresh/transport definitions only.')
if __name__=='__main__':main()
