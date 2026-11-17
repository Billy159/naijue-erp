"""Use only captured historical b115 metadata against the actual new predicate."""
from pathlib import Path
from types import SimpleNamespace
import ast,copy,hashlib,json
D=Path(__file__).resolve().parent;OLD=D.with_name('20261118-r3-ordinary43-root-source-03')
def main():
 rows=[]
 def check(v,n):assert v,n;rows.append(n)
 def fn(p):return next(n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)and n.name=='validate_closed42')
 old,new=fn(OLD/'r3_normal43_continuation.py'),fn(D/'r3_normal43_continuation.py')
 check(ast.dump(ast.Module(body=old.body[:-1],type_ignores=[]),include_attributes=False)==ast.dump(ast.Module(body=new.body[:-1],type_ignores=[]),include_attributes=False),'all original SQL ACK guardian clean data auth proof checks unchanged')
 calls=[n for n in ast.walk(new)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='need']
 exact=next(n.args[0]for n in calls if len(n.args)>1 and isinstance(n.args[1],ast.Constant)and n.args[1].value=='ACTUAL42_EXACT_CLOSED_LIFECYCLE_REQUIRED')
 capture=next(n.args[0]for n in calls if len(n.args)>1 and isinstance(n.args[1],ast.Constant)and n.args[1].value=='ACTUAL42_CAPTURED_LIFECYCLE_REQUIRED')
 def expr(n,env):return eval(compile(ast.fix_missing_locations(ast.Expression(n)),'real_R04_predicate','eval'),{'__builtins__':{},**env})
 root=D.parents[2];p=root/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL43-ROOT-EXECUTION-PREPARATION-02/fresh/ACTUAL-CLOSED42-TWO-CONTAINERS.json';raw=p.read_bytes();check(hashlib.sha256(raw).hexdigest()=='b1150a55bca2d78458fae9ba8ee2f95e4493132d42634c3cca87ca4997d9c4c2','exact actual metadata source')
 records=json.loads(raw)['containers']
 for kind,exit_code in [('service42',143),('restoreOwn42',0)]:
  value=records[kind];check(expr(capture,dict(expected=value,state=value['state'],cid=value['id'],exit_code=exit_code)),'actual fixed '+kind+' expected exit and closed state')
  check(expr(exact,dict(core=SimpleNamespace(strict=json.loads),q=SimpleNamespace(stdout=json.dumps(value)),expected=value)),'actual full identity metadata '+kind+' accepted')
 mutations=[('service42','ExitCode',0),('restoreOwn42','ExitCode',143),('service42','Running',True),('service42','Pid',1),('service42','OOMKilled',True),('service42','Error','unexpected')]
 for kind,key,value in mutations:
  observed=copy.deepcopy(records[kind]);observed['state'][key]=value
  check(not expr(exact,dict(core=SimpleNamespace(strict=json.loads),q=SimpleNamespace(stdout=json.dumps(observed)),expected=records[kind])),'reject wrong '+kind+' '+key)
 observed=copy.deepcopy(records['service42']);observed['id']=records['restoreOwn42']['id'];check(not expr(exact,dict(core=SimpleNamespace(strict=json.loads),q=SimpleNamespace(stdout=json.dumps(observed)),expected=records['service42'])),'reject different fixed container identity')
 for name in ['issue_registration.py','issue_phase.py','read_registration_basis.py','FIVE-PHASES.UNISSUED.json']:check((D/name).read_bytes()==(OLD/name).read_bytes(),'unchanged reviewed '+name)
 result=dict(state='SOURCE04_R04_EXACT_HISTORICAL_LIFECYCLE_CHECKS_PASS',checks=len(rows),passed=rows,serverActions=0,factoryOrConstructorCalls=0,PGConnections=0,NodeCalls=0,clockCalls=0,positiveFutureFixtures=False)
 (D/'LIFECYCLE-CHECKS.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='passed'}))
if __name__=='__main__':main()
