"""Source-only affected checks. Never invokes Main/consumer/clock/native/PG APIs."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 rows=[]
 def check(ok,name):
  assert ok,name;rows.append(name)
 def load(name):return ast.parse((HERE/name).read_bytes())
 def assignment(tree,name):return ast.literal_eval(next(n.value for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets)))
 def funcs(tree):return {n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
 for p in sorted(HERE.glob('*.py')):
  if p.name.endswith('.template.py'):continue
  compile(p.read_bytes(),str(p),'exec');check(True,'compile '+p.name)
 h=json.loads((HERE/'HISTORY-INPUTS.json').read_bytes());w=json.loads((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes());c=Path(h['consumerDirectory'])
 check(sha((c/'SOURCE-PINS.json').read_bytes())=='7db507149e2c6c6187e033839dcc7faffa54f331cb7c0fdd828d6ede6872df16','consumer Source02 exact')
 check(sha((c/'INTERFACE.UNISSUED.json').read_bytes())=='fe47f538d3dad023ed45702c3fa0314f5ad63694d23085a16e18e35b8d606fd0','Source02 interface exact')
 check(sha((c/'PHASES40.UNISSUED.json').read_bytes())=='c6491825b7e81ce52bfbcdd33952599e0b0584a059936b68fe935a2f77266b71','Source02 phase exact')
 for phase,rule in h['expectedRules'].items():
  check(all(sha((Path(h['phaseDirectories'][phase])/leaf).read_bytes())==pin for leaf,pin in rule['bundlePins'].items()),phase+' exact static bundle')
 actual=load('ACTUAL110-DISPATCHER.py');new=load('admin_exec.NORMAL40-UNREGISTERED.py')
 oldkeys=assignment(actual,'R3_ORIGINAL02_ABSENT_KEYS');newkeys=assignment(new,'R3_ORIGINAL02_ABSENT_KEYS')
 check(len(oldkeys)==110 and newkeys[:110]==oldkeys and newkeys[110:]==list(h['jobs'].values())and len(set(newkeys))==115,'110 old plus exact five keys')
 check(sha((HERE/'ACTUAL110-DISPATCHER.py').read_bytes())==h['actualRootPins']['dispatcher']=='7cab381f7cd7aa402a0087a14ecb2571460dd11274b00cee0dbd62938fb8b814','actual root110 exact')
 a,n=funcs(actual),funcs(new)
 for name,node in a.items():
  if name=='execute':continue
  check(ast.dump(node,include_attributes=False)==ast.dump(n[name],include_attributes=False),'preserve old function '+name)
 class RemoveNew(ast.NodeTransformer):
  def visit_If(self,node):
   if 'NORMAL40_KEYS'in ast.dump(node.test):return None
   return self.generic_visit(node)
 check(ast.dump(a['execute'],include_attributes=False)==ast.dump(RemoveNew().visit(n['execute']),include_attributes=False),'execute only added five-key branch')
 check(assignment(new,'NORMAL40_POLICY_SHA256')is None,'policy unissued None')
 check(assignment(new,'NORMAL40_MODULE_SHA256')==sha((HERE/'r3_normal40_continuation.py').read_bytes()),'dispatcher module pin exact')
 check(len((HERE/'admin_exec.NORMAL40-UNREGISTERED.py').read_bytes())<=131072,'existing root size bound')
 reg=funcs(load('issue_registration.py'))['issue'];phase=funcs(load('issue_phase.py'))['issue']
 check([x.arg for x in reg.args.args]==['review_file','review_pin','basis_file','basis_pin','output_directory','consumer_review_file','consumer_review_pin'],'original Main registration seven params')
 check([x.arg for x in phase.args.args]==['phase','rules_file','rules_pin','registration_directory','evidence_path','evidence_pin','predecessor_path','predecessor_pin'],'original Main phase eight params')
 s=(HERE/'issue_phase.py').read_text()
 check("phase in ('apply','start','upgrade','stop','restore')"in s,'phase admission exact five')
 check("policy['jobs']['prepare']"not in s and "policy['jobs']['writer']"not in s,'no preparation or writer issuance branch')
 check("FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1"in s and "host['validate'](authority, now)"in s,'genuine triple descriptor host validator retained')
 check(w['retainedAck39']['actualFreshRead']is None and w['futureC']is w['futureWindow']is None,'future runtime values absent')
 check(len(w['custodyStat9'])==5 and all(len(v)==9 for v in w['custodyStat9'].values()),'original five snapshots stat9')
 check(w['beforeModel']!=w['afterModel']and w['noWriterKeySelected']is True,'before after distinct no writer key')
 for name in ['issue_registration.py','issue_phase.py']:
  t=load(name)
  check(not any(isinstance(n,ast.Expr)and isinstance(n.value,ast.Call)and isinstance(n.value.func,ast.Name)and n.value.func.id=='issue'for n in t.body),name+' never calls issuer at module scope')
 check("/register_cas.py'"in(HERE/'register_cas.py').read_text()and"STAGE+'/register_cas.py'"in(HERE/'prepare_channel.py').read_text(),'staged CAS filename matches exact root ENTRY')
 report={'state':'SOURCE_ONLY_AFFECTED_CHECKS_PASS','checks':len(rows),'passed':rows,'serverActions':0,'clockCalls':0,'PGConnections':0,'authoritiesIssued':False,'positiveRuntimeFixtures':False,'noPriorAcceptedChecksRerun':True}
 (HERE/'CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items()if k!='passed'}))
if __name__=='__main__':main()
