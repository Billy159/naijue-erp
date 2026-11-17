"""Only five fixed maintenance keys over actual122, preserving all old APIs/flags."""
import ast,hashlib,re
BASE='ec3b5573c6cacc688f487450e783eb7e7fb7ecd7b5ded9dbc9540f952195df2b'
def render(actual,module_pin,jobs,policy_pin=None):
 assert hashlib.sha256(actual).hexdigest()==BASE and re.fullmatch('[a-f0-9]{64}',module_pin)
 assert list(jobs)==['apply','start','upgrade','stop','restore']and len(set(jobs.values()))==5
 assert policy_pin is None or re.fullmatch('[a-f0-9]{64}',policy_pin)
 text=actual.decode();tree=ast.parse(text)
 node=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets))
 keys=ast.literal_eval(node.value);assert len(keys)==122 and not set(keys)&set(jobs.values())
 text=text.replace(ast.get_source_segment(text,node),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+list(jobs.values())),1)
 constants='NORMAL42_KEYS = '+repr(tuple(jobs.values()))+'\nNORMAL42_MODULE_SHA256 = '+repr(module_pin)+'\nNORMAL42_POLICY_SHA256 = '+repr(policy_pin)+'\n\n'
 anchor='def check(value, code):';assert text.count(anchor)==1;text=text.replace(anchor,constants+anchor,1)
 helper='''def normal42_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_normal42_continuation.py');raw=core.read(path)
    check(NORMAL42_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==NORMAL42_MODULE_SHA256,'R3_CONTINUITY_NORMAL42_NOT_REGISTERED')
    module=ModuleType('normal42_maintenance');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(tuple(module.JOBS.values())==NORMAL42_KEYS,'R3_CONTINUITY_NORMAL42_KEYS_DIFFERS')
    return module.Normal42Continuation(core,prior,cfg,NORMAL42_POLICY_SHA256)

'''
 anchor='def fixed_install_code_member(cfg,job,row):';assert text.count(anchor)==1;text=text.replace(anchor,helper+anchor,1)
 anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
 branch="                    if job['jobId'] in NORMAL42_KEYS:\n                        hold=normal42_continuation(continuity,hold,cfg)\n"
 assert text.count(anchor)==1;text=text.replace(anchor,branch+anchor,1)
 changed=ast.parse(text);old={n.name:ast.dump(n,include_attributes=False)for n in tree.body if isinstance(n,ast.FunctionDef)}
 new={n.name:ast.dump(n,include_attributes=False)for n in changed.body if isinstance(n,ast.FunctionDef)}
 assert [k for k in old if old[k]!=new[k]]==['execute']
 execute=next(n for n in changed.body if isinstance(n,ast.FunctionDef)and n.name=='execute')
 for parent in ast.walk(execute):
  for _,items in ast.iter_fields(parent):
   if isinstance(items,list):items[:]=[n for n in items if not(isinstance(n,ast.If)and 'NORMAL42_KEYS'in ast.dump(n.test))]
 assert ast.dump(execute,include_attributes=False)==old['execute']
 guards=[n for n in ast.walk(changed)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators)]
 assert len(guards)==3 and len(text.encode())<=131072
 return text.encode()
