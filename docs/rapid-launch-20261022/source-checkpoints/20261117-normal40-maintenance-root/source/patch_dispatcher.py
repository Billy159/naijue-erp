"""Only five fixed maintenance keys over actual110, preserving all old APIs/flags."""
import ast,hashlib,re
BASE='7cab381f7cd7aa402a0087a14ecb2571460dd11274b00cee0dbd62938fb8b814'
def render(actual,module_pin,jobs,policy_pin=None):
 assert hashlib.sha256(actual).hexdigest()==BASE and re.fullmatch('[a-f0-9]{64}',module_pin)
 assert list(jobs)==['apply','start','upgrade','stop','restore']and len(set(jobs.values()))==5
 assert policy_pin is None or re.fullmatch('[a-f0-9]{64}',policy_pin)
 text=actual.decode();tree=ast.parse(text)
 node=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets))
 keys=ast.literal_eval(node.value);assert len(keys)==110 and not set(keys)&set(jobs.values())
 text=text.replace(ast.get_source_segment(text,node),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+list(jobs.values())),1)
 constants='NORMAL40_KEYS = '+repr(tuple(jobs.values()))+'\nNORMAL40_MODULE_SHA256 = '+repr(module_pin)+'\nNORMAL40_POLICY_SHA256 = '+repr(policy_pin)+'\n\n'
 anchor='def check(value, code):';assert text.count(anchor)==1;text=text.replace(anchor,constants+anchor,1)
 helper='''def normal40_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_normal40_continuation.py');raw=core.read(path)
    check(NORMAL40_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==NORMAL40_MODULE_SHA256,'R3_CONTINUITY_NORMAL40_NOT_REGISTERED')
    module=ModuleType('normal40_maintenance');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(tuple(module.JOBS.values())==NORMAL40_KEYS,'R3_CONTINUITY_NORMAL40_KEYS_DIFFERS')
    return module.Normal40Continuation(core,prior,cfg,NORMAL40_POLICY_SHA256)

'''
 anchor='def fixed_install_code_member(cfg,job,row):';assert text.count(anchor)==1;text=text.replace(anchor,helper+anchor,1)
 anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
 branch="                    if job['jobId'] in NORMAL40_KEYS:\n                        hold=normal40_continuation(continuity,hold,cfg)\n"
 assert text.count(anchor)==1;text=text.replace(anchor,branch+anchor,1)
 changed=ast.parse(text);old={n.name:ast.dump(n,include_attributes=False)for n in tree.body if isinstance(n,ast.FunctionDef)}
 new={n.name:ast.dump(n,include_attributes=False)for n in changed.body if isinstance(n,ast.FunctionDef)}
 assert [k for k in old if old[k]!=new[k]]==['execute']
 execute=next(n for n in changed.body if isinstance(n,ast.FunctionDef)and n.name=='execute')
 for parent in ast.walk(execute):
  for _,items in ast.iter_fields(parent):
   if isinstance(items,list):items[:]=[n for n in items if not(isinstance(n,ast.If)and 'NORMAL40_KEYS'in ast.dump(n.test))]
 assert ast.dump(execute,include_attributes=False)==old['execute']
 guards=[n for n in ast.walk(changed)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators)]
 assert len(guards)==3 and len(text.encode())<=131072
 return text.encode()
