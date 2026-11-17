"""Pure109->110 renderer; original APIs, launch flags,freeze/client/3guards preserved."""
import ast,hashlib
KEY='t45-r3-batched-root08-source-delta-20261117-01'
BASE='b4013f9a04e35bfae287742a7d91b9c2a9daf1d06b0768262db01b8de40926de'
def render(actual,module_pin):
 assert hashlib.sha256(actual).hexdigest()==BASE
 text=actual.decode();tree=ast.parse(text)
 node=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets))
 keys=ast.literal_eval(node.value);assert len(keys)==109 and KEY not in keys
 text=text.replace(ast.get_source_segment(text,node),'R3_ORIGINAL02_ABSENT_KEYS = '+repr(keys+[KEY]),1)
 constants='ROOT08_SOURCE_KEY = '+repr(KEY)+'\nROOT08_SOURCE_MODULE_SHA256 = '+repr(module_pin)+'\nROOT08_SOURCE_POLICY_SHA256 = None\n\n'
 anchor='def check(value, code):';assert text.count(anchor)==1;text=text.replace(anchor,constants+anchor,1)
 helper='''def root08_source_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_root08_source_admission.py');raw=core.read(path)
    check(ROOT08_SOURCE_POLICY_SHA256 is not None and hashlib.sha256(raw).hexdigest()==ROOT08_SOURCE_MODULE_SHA256,'R3_CONTINUITY_ROOT08_SOURCE_NOT_REGISTERED')
    module=ModuleType('root08_source_admission');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(module.KEY==ROOT08_SOURCE_KEY,'R3_CONTINUITY_ROOT08_SOURCE_KEY_DIFFERS')
    return module.Root08SourceAdmission(core,prior,cfg,ROOT08_SOURCE_POLICY_SHA256)

'''
 anchor='def fixed_install_code_member(cfg,job,row):';assert text.count(anchor)==1;text=text.replace(anchor,helper+anchor,1)
 anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n"
 branch="                    if job['jobId']==ROOT08_SOURCE_KEY:\n                        hold=root08_source_continuation(continuity,hold,cfg)\n"
 assert text.count(anchor)==1;text=text.replace(anchor,branch+anchor,1)
 new=ast.parse(text);old_funcs={n.name:ast.dump(n,include_attributes=False)for n in tree.body if isinstance(n,ast.FunctionDef)}
 new_funcs={n.name:ast.dump(n,include_attributes=False)for n in new.body if isinstance(n,ast.FunctionDef)}
 assert [k for k in old_funcs if old_funcs[k]!=new_funcs[k]]==['execute']
 execute=next(n for n in new.body if isinstance(n,ast.FunctionDef)and n.name=='execute')
 for parent in ast.walk(execute):
  for _,value in ast.iter_fields(parent):
   if isinstance(value,list):value[:]=[n for n in value if not(isinstance(n,ast.If)and 'ROOT08_SOURCE_KEY'in ast.dump(n.test))]
 assert ast.dump(execute,include_attributes=False)==old_funcs['execute']
 guards=[n for n in ast.walk(new)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators)]
 assert len(guards)==3 and len(text.encode())<=131072
 return text.encode()
