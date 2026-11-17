"""Pure four-key patch of an actual post-writer dispatcher; never installs or starts a clock."""
import ast,hashlib,re
WIP_PENDING=True
KEYS=('t45-r3-final33-a7bab2-artifact-policy-install-20261117-01', 't45-r3-final33-a7bab2-artifact-policy-restore-20261117-01', 't45-r3-final33-recovery-artifact-policy-install-20261117-01', 't45-r3-final33-recovery-artifact-policy-restore-20261117-01')  # Main source-selected four jobs; final T45 pair still missing.
BRANCH="""                    if job['jobId'] in FIXED_ARTIFACT_KEYS:
                        hold=fixed_artifact_continuation(continuity,hold,cfg)
"""
ADAPTER="""def fixed_artifact_continuation(core,prior,cfg):
    from types import ModuleType
    path=canonical(PUBLIC/'r3_two_fixed_artifact_admission.py');raw=core.read(path)
    check(FIXED_ARTIFACT_PROFILE_SHA256 is not None and hashlib.sha256(raw).hexdigest()==FIXED_ARTIFACT_MODULE_SHA256,'R3_CONTINUITY_FIXED_ARTIFACT_NOT_REGISTERED')
    module=ModuleType('fixed_artifact_policy_admission');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(set(module.KEYS)==set(FIXED_ARTIFACT_KEYS),'R3_CONTINUITY_FIXED_ARTIFACT_KEYS_DIFFER')
    prior=normal39_continuation(core,prior,cfg)
    return module.FixedArtifactAdmission(core,prior,cfg,FIXED_ARTIFACT_PROFILE_SHA256)

"""
def render(actual_dispatcher,actual_pin,module_pin,profile_pin=None):
 assert WIP_PENDING is False and type(KEYS)is tuple and len(KEYS)==len(set(KEYS))==4,'FINAL_FOUR_KEYS_REQUIRED_NO_PATCH'
 assert type(actual_dispatcher)is bytes and hashlib.sha256(actual_dispatcher).hexdigest()==actual_pin
 assert re.fullmatch('[a-f0-9]{64}',actual_pin)and re.fullmatch('[a-f0-9]{64}',module_pin)
 assert profile_pin is None or re.fullmatch('[a-f0-9]{64}',profile_pin)
 source=actual_dispatcher.decode();tree=ast.parse(source)
 assert not any(isinstance(n,ast.Name)and n.id.startswith('FIXED_ARTIFACT_')for n in ast.walk(tree))
 old=next(n for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='R3_ORIGINAL02_ABSENT_KEYS'for t in n.targets));prefix=ast.literal_eval(old.value);assert type(prefix)is list and not set(KEYS).intersection(prefix)
 line='R3_ORIGINAL02_ABSENT_KEYS = '+repr(prefix)
 assert source.count(line)==1
 result=source.replace(line,'R3_ORIGINAL02_ABSENT_KEYS = '+repr(prefix+list(KEYS)))
 constants='FIXED_ARTIFACT_KEYS = '+repr(KEYS)+'\nFIXED_ARTIFACT_MODULE_SHA256 = '+repr(module_pin)+'\nFIXED_ARTIFACT_PROFILE_SHA256 = '+repr(profile_pin)+'\n\n'
 assert result.count('def check(value, code):')==1;result=result.replace('def check(value, code):',constants+'def check(value, code):')
 assert result.count('def fixed_install_code_member(cfg,job,row):')==1;result=result.replace('def fixed_install_code_member(cfg,job,row):',ADAPTER+'def fixed_install_code_member(cfg,job,row):')
 anchor="                    if job['jobId']==R3_05_EXECUTE_KEY:\n";assert result.count(anchor)==1;result=result.replace(anchor,BRANCH+anchor)
 compile(result,'actual_artifact_dispatcher','exec');new=ast.parse(result)
 # All normal source/policy digests, original protected prefix and nonexecute functions remain exact.
 before={n.name:ast.dump(n)for n in tree.body if isinstance(n,ast.FunctionDef)};after={n.name:ast.dump(n)for n in new.body if isinstance(n,ast.FunctionDef)}
 assert [k for k in before if before[k]!=after[k]]==['execute']
 execute=next(n for n in new.body if isinstance(n,ast.FunctionDef)and n.name=='execute')
 for parent in ast.walk(execute):
  for name,value in ast.iter_fields(parent):
   if isinstance(value,list):value[:]=[n for n in value if not(isinstance(n,ast.If)and isinstance(n.test,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='FIXED_ARTIFACT_KEYS'for x in n.test.comparators))]
 assert ast.dump(execute)==before['execute']
 guards=[n for n in ast.walk(new)if isinstance(n,ast.Compare)and any(isinstance(x,ast.Name)and x.id=='R3_ORIGINAL02_ABSENT_KEYS'for x in n.comparators)]
 assert len(guards)==3
 return result.encode()
