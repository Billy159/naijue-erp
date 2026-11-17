"""Append only the five authorized43 keys over actual127; keep old dispatch intact."""
from pathlib import Path
import ast,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary42-root-source-02')
sha=lambda b:hashlib.sha256(b).hexdigest()
def assignment(s,name,value):
 n=next(n for n in ast.parse(s).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in n.targets));return s.replace(ast.get_source_segment(s,n),name+'='+repr(value),1)
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());s=(OLD/'r3_normal42_continuation.py').read_text();s=assignment(s,'HISTORY',h);s=assignment(s,'EXPECTED_RULES',h['expectedRules'])
 for a,b in [('Normal42Continuation','Normal43Continuation'),('R3_CONTINUITY_NORMAL42_','R3_CONTINUITY_NORMAL43_'),('v2-service-42.json','v2-service-43.json'),('direct42-batched-real.json','direct43-batched-real.json'),('T45_R3_NORMAL42_BATCHED_REAL_V1','T45_R3_NORMAL43_BATCHED_REAL_V1'),("'normal42-'+phase","'normal43-'+phase"),("{'normal42-'+name for name in JOBS}","{'normal43-'+name for name in JOBS}")]:s=s.replace(a,b)
 # Historical41 validates its own preserved fields, never the new prior42 scope.
 t=ast.parse(s);n=next(n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='validate_latest41');f=ast.get_source_segment(s,n);g=f.replace("HISTORY['priorService']","HISTORY['historical41Service']").replace("HISTORY['predecessor']['bindings']","HISTORY['historical41Bindings']");s=s.replace(f,g,1)
 guard=(D/'validate_closed42.template.py').read_text();s=s.replace('class Normal43Continuation:',guard+'\nclass Normal43Continuation:',1)
 s=s.replace("validate_history(self.core,self.need,HISTORY['custodyStat9']);validate_latest41(self.core,self.need)","validate_history(self.core,self.need,HISTORY['custodyStat9']);validate_latest41(self.core,self.need);validate_closed42(self.core,self.need)")
 a=s.index("  elif phase=='upgrade':");b=s.index("  elif phase=='stop':",a)
 s=s[:a]+'''  elif phase=='writer':
   self.successful('start');proof=self.current_service(authority.get('service'))
   old=HISTORY['prepare05'];binding=authority.get('expectedBinding');prepared=authority.get('originalPreparedBinding')
   self.need(prepared==old['preparedBinding']and authority.get('originalExecutionBinding')==old['executionBinding']and type(binding)is dict,'EXACT_RETAINED_PREPARE05_WITNESS_REQUIRED')
   changed={'currentServiceSha256','postmasterStart','batchedSourceSetSha256','batchedCatalogSpecSha256','batchedModelSha256','preparedBindingSha256'}
   self.need(binding.get('preparedBindingSha256')==old['executionBinding']['preparedBindingSha256']and set(binding)==set(prepared)|{'preparedBindingSha256'}and all(binding[k]==v for k,v in prepared.items()if k not in changed)and binding['currentServiceSha256']==authority['service']['proofSha256']and binding['postmasterStart']==authority['service']['postmasterStart']and all(binding[k]==HISTORY['installedAfter42Catalog'][v]for k,v in [('batchedSourceSetSha256','sourceSetSha256'),('batchedCatalogSpecSha256','catalogSpecSha256'),('batchedModelSha256','modelSha256')]),'EXACT_NEW_CATALOG_ENVELOPE_ORIGINAL_REQUESTS_REQUIRED')
   self.need(authority.get('prepareTerminalSha256')==old['terminalSha256']and authority.get('prepareResultSha256')==old['rootResultSha256'],'ACTUAL_COMPLETED_PREPARE05_RECEIPTS_REQUIRED')
''' +s[b:]
 s=s.replace("self.current_batch_settled_or_absent('upgrade')","self.current_batch_settled_or_absent('writer')")
 t=ast.parse(s);used={n.slice.value for n in ast.walk(t)if isinstance(n,ast.Subscript)and isinstance(n.value,ast.Name)and n.value.id=='HISTORY'and isinstance(n.slice,ast.Constant)and isinstance(n.slice.value,str)}
 s=assignment(s,'HISTORY',{k:h[k]for k in sorted(used)})
 compile(s,'normal43_admission','exec');(D/'r3_normal43_continuation.py').write_text(s)
 render=runpy.run_path(str(D/'patch_dispatcher.py'))['render'];raw=render((D/'ACTUAL127-DISPATCHER.py').read_bytes(),sha(s.encode()),h['jobs']);(D/'admin_exec.NORMAL43-UNREGISTERED.py').write_bytes(raw)
 print('Rendered unissued Root132 SOURCE; runtime actions0.')
if __name__=='__main__':main()
