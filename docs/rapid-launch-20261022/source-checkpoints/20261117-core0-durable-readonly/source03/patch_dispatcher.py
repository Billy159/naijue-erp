"""Pure one-new-key delta of actual45914; old108 and old launch paths survive."""
import ast,hashlib,re
KEY='t45-r3-core0-durable-readonly-20261117-02'
BASE='45914df73ffcf2840df3e9d264654f64154ebb3a9d42805b74998caee812041f'
OLD_ARGV="argv=[interpreter]+(['-s'] if phase.suffix=='.py' else [])+[str(phase)]+job['args']"
NEW_ARGV="argv=[interpreter]+((['-I','-S'] if job_id==DURABLE_CORE0_02_KEY else ['-s']) if phase.suffix=='.py' else [])+[str(phase)]+job['args']"
BRANCH="                    if job['jobId']==DURABLE_CORE0_02_KEY:\n                        hold=durable_core0_02_continuation(continuity,hold,cfg)\n"
HELPER="""def durable_core0_02_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_core0_durable_readonly_02.py');raw=core.read(path)
    check(DURABLE_CORE0_02_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==DURABLE_CORE0_02_MODULE_SHA256,'R3_CONTINUITY_DURABLE02_NOT_REGISTERED')
    module=ModuleType('durable_core0_readonly_02');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(module.KEY==DURABLE_CORE0_02_KEY,'R3_CONTINUITY_DURABLE02_KEY_DIFFERS')
    return module.DurableReadonly02Continuation(core,prior,cfg,DURABLE_CORE0_02_POLICY_SHA256)

"""
def render(actual,module_pin,policy_pin=None):
 assert hashlib.sha256(actual).hexdigest()==BASE and re.fullmatch('[a-f0-9]{64}',module_pin)
 assert policy_pin is None or re.fullmatch('[a-f0-9]{64}',policy_pin)
 text=actual.decode();tree=ast.parse(text)
 node=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.targets));keys=ast.literal_eval(node.value)
 assert len(keys)==108 and KEY not in keys and 't45-r3-core0-durable-readonly-20261117-01'in keys
 text=text.replace(ast.get_source_segment(text,node),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[KEY]),1)
 constants='DURABLE_CORE0_02_KEY = '+repr(KEY)+'\nDURABLE_CORE0_02_MODULE_SHA256 = '+repr(module_pin)+'\nDURABLE_CORE0_02_POLICY_SHA256 = '+repr(policy_pin)+'\n\n'
 assert text.count('def check(value, code):')==1;text=text.replace('def check(value, code):',constants+'def check(value, code):')
 assert text.count('def fixed_install_code_member(cfg,job,row):')==1;text=text.replace('def fixed_install_code_member(cfg,job,row):',HELPER+'def fixed_install_code_member(cfg,job,row):')
 anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
 assert text.count(anchor)==1;text=text.replace(anchor,BRANCH+anchor)
 assert text.count(OLD_ARGV)==1;text=text.replace(OLD_ARGV,NEW_ARGV,1)
 newtree=ast.parse(text)
 oldf={n.name:ast.dump(n,include_attributes=False)for n in tree.body if isinstance(n,ast.FunctionDef)};newf={n.name:ast.dump(n,include_attributes=False)for n in newtree.body if isinstance(n,ast.FunctionDef)}
 assert [name for name in oldf if oldf[name]!=newf[name]]==['execute']
 stripped=ast.parse(text.replace(NEW_ARGV,OLD_ARGV,1));execute=next(n for n in stripped.body if isinstance(n,ast.FunctionDef)and n.name=='execute')
 for parent in ast.walk(execute):
  for _,value in ast.iter_fields(parent):
   if isinstance(value,list):value[:]=[n for n in value if not(isinstance(n,ast.If)and'DURABLE_CORE0_02_KEY'in ast.dump(n.test))]
 assert ast.dump(execute,include_attributes=False)==oldf['execute']
 guards=[n for n in ast.walk(newtree)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators)]
 assert len(guards)==3 and len(text.encode())<=131072
 return text.encode()
