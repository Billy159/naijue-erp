from pathlib import Path
from types import SimpleNamespace
import ast,hashlib,json,copy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-stop41-recovery-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(v,n):assert v,n;rows.append(n)
 def cls(p):return next(n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.ClassDef)and n.name=='Recovery')
 old=cls(OLD/'r3_stop41_recovery.py');new=cls(D/'r3_stop41_recovery.py')
 f=next(n for n in new.body if isinstance(n,ast.FunctionDef)and n.name=='finish');mod=ast.Module(body=[copy.deepcopy(f)],type_ignores=[]);ast.fix_missing_locations(mod);ns={};exec(compile(mod,'finish_only','exec'),ns)
 calls=[];obj=SimpleNamespace(prior=SimpleNamespace(finish=lambda phase:calls.append(phase)or 'delegated'))
 for tag in ('stop41-recovery-stop','stop41-recovery-restore'):check(ns['finish'](obj,tag)is None and not calls,'own '+tag+' no old finish')
 for tag in ('stop','restore','legacy-other'):check(ns['finish'](obj,tag)=='delegated'and calls[-1]==tag,'delegate unchanged '+tag)
 class Normalize(ast.NodeTransformer):
  def visit_Constant(self,n):
   if n.value=='stop41-recovery-stop':return ast.copy_location(ast.Constant(value='stop'),n)
   if n.value=='stop41-recovery-restore':return ast.copy_location(ast.Constant(value='restore'),n)
   return n
 body=copy.deepcopy(new);body.body=[n for n in body.body if not isinstance(n,ast.FunctionDef)or n.name!='finish'];Normalize().visit(body)
 check(ast.dump(old,include_attributes=False)==ast.dump(body,include_attributes=False),'only two tags and finish added to Recovery')
 check(sha((OLD/'SOURCE-PINS.json').read_bytes())=='3b9e6ecd6793156138981ea1de0308bf17fa36b05f45cbf649237fff51a09d3a','original frozen01 preserved')
 for name in ['issue_recovery.py','read_registration_basis.py','CONSUMER-BINDING.json','HISTORY.json']:check((D/name).read_bytes()==(OLD/name).read_bytes(),'unchanged '+name)
 check((D/'issue_restore.py').read_text()==(OLD/'issue_restore.py').read_text().replace('joint-review-01/RESULT.json','joint-review-01/FIX-RESULT.json'),'restore uses separate actual FIX report only')
 check('PREPARATION-02'in(D/'prepare_channel.py').read_text()and'source-20261117-02'in(D/'prepare_channel.py').read_text(),'new local and server prep path')
 check('source-20261117-02'in(D/'register_cas.py').read_text(),'CAS exact source02 entry')
 check('stop41-recovery-stop'in(D/'r3_stop41_recovery.py').read_text(),'own phase prefix')
 for p in D.glob('*.py'):
  if '.template.'not in p.name:compile(p.read_bytes(),str(p),'exec')
 check(True,'source compile only')
 r=dict(state='SOURCE02_FINISHING_SEAM_DELTA_PASS',checks=len(rows),passed=rows,source01ChecksReused=21,old21Reexecuted=False,serverCalls=0,clockCalls=0,issuerCalls=0,PGConnections=0,authorityOrCOrRoleFixtures=False)
 (D/'CHECKS.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k!='passed'}))
if __name__=='__main__':main()
