from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(v,n):assert v,n;rows.append(n)
 def tree(n):return ast.parse((D/n).read_bytes())
 def assigned(t,n):return ast.literal_eval(next(v.value for v in t.body if isinstance(v,ast.Assign)and any(isinstance(x,ast.Name)and x.id==n for x in v.targets)))
 def funcs(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
 old=tree('ACTUAL121-DISPATCHER.py');new=tree('admin_exec.ROLLBACK-UNREGISTERED.py');h=json.loads((D/'HISTORY.json').read_bytes());b=json.loads((D/'CONSUMER-BINDING.json').read_bytes())
 check(sha((D/'ACTUAL121-DISPATCHER.py').read_bytes())=='ade6214cc9ff142bfb0bab75fe77b0ce0a006ee5049a2ca1aa7a1f0c95b8102a','actual121 exact')
 keys=assigned(old,'R3_ORIGINAL02_ABSENT_KEYS');newkeys=assigned(new,'R3_ORIGINAL02_ABSENT_KEYS');check(len(keys)==121 and newkeys==keys+[h['newJobId']]and len(set(newkeys))==122,'121 immutable keys plus02 only')
 f,g=funcs(old),funcs(new);check(all(ast.dump(v,include_attributes=False)==ast.dump(g[k],include_attributes=False)for k,v in f.items()if k!='execute'),'all original121 functions preserved')
 class Strip(ast.NodeTransformer):
  def visit_If(self,n):
   if 'ORIGINAL_AUTH41_ROLLBACK02_KEY'in ast.dump(n.test):return None
   return self.generic_visit(n)
 check(ast.dump(f['execute'],include_attributes=False)==ast.dump(Strip().visit(g['execute']),include_attributes=False),'execute only added02 branch')
 check(assigned(new,'ORIGINAL_AUTH41_ROLLBACK02_POLICY_SHA256')is None and assigned(new,'ORIGINAL_AUTH41_ROLLBACK02_MODULE_SHA256')==sha((D/'r3_original_auth41_rollback02.py').read_bytes()),'module exact ticket unissued')
 m=(D/'r3_original_auth41_rollback02.py').read_text();c=(D/'register_cas.py').read_text();issuer=(D/'issue_registration.py').read_text();ch=(D/'prepare_channel.py').read_text()
 check('failed_rollback01(core,need)'in m and h['failedRollback01']['terminalSha256']=='16ae761461af0353d77dbc98aa3610287d01594a17ab89d50f00fd0861816566','old01 actualFAILED anchored')
 check(h['rollback01ModuleSha256']in c and h['rollback01PolicySha256']in c and h['failedRollback01']['resultSha256']in c,'old module policy result retained')
 check('prior.current_service('not in m and 'EXACT_OBSERVED_C41_CLEANUP_REQUIRED'in m,'closedC no live or expired work bypass')
 check('original-auth41-rollback02' in m and 'return self.prior.finish(phase)' in m,'02 unique finish')
 check('900000'in issuer and "decision['applyAuthorized']is False"in issuer and 'controllerValidUntil'not in issuer,'only new15min rollback decision no role renewal')
 check('rollback-decision-02' in issuer and len(funcs(tree('issue_registration.py'))['issue'].args.args)==7,'new decision and same Main7')
 check('ROLLBACK02-ROOT-EXECUTION-PREPARATION-01'in ch and 'rollback02-registration-source-20261117-01'in ch and 'DURABLE-READONLY-EXECUTION-PREPARATION-02/STAGE-ROOT-SOURCE.py'in ch,'new unused namespace correct original template')
 for name,pin in b['rule']['bundlePins'].items():check(sha((Path(b['consumerDirectory'])/name).read_bytes())==pin,'bind consumer02 '+name)
 for p in D.glob('*.py'):
  if '.template.'not in p.name:compile(p.read_bytes(),str(p),'exec')
 check(True,'all final generated source compile')
 out=dict(state='SOURCE_ONLY_ROLLBACK02_DELTA_PASS',checks=len(rows),passed=rows,reusedOriginal46and25and23=True,serverCalls=0,clockCalls=0,issuerCalls=0,PGConnections=0,authoritiesIssued=False)
 (D/'DELTA-CHECKS.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='passed'}))
if __name__=='__main__':main()
