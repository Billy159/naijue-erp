"""Original v3 invocation with an exact authority argument, checked before state/network."""
from pathlib import Path
from types import SimpleNamespace
import ast,hashlib,json,runpy,sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
CLIENT=ROOT.parents[3].parent/'monitor/normal-admission-20261112-01/admin_client-t45-code-transport-v3.py'
CLIENT_SHA='08954fa485ba3ec179a25bd69524da5353c9deb01f6890bb6230955adf404e6f'
LOADER=ROOT/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
LOADER_SHA='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
PHASES=('apply','start','writer','stop','restore')
sha=lambda b:hashlib.sha256(b).hexdigest()
def need(v,c):
 if not v:raise ValueError(c)
def authority(path,expected_pin,expected_key):
 need(type(expected_pin) is str and len(expected_pin)==64 and all(c in '0123456789abcdef' for c in expected_pin),'EXACT_ISSUED_AUTHORITY_PIN_REQUIRED')
 p=Path(path);need(p.is_file() and not p.is_symlink() and p.stat().st_size>0,'ISSUED_AUTHORITY_FILE_REQUIRED')
 raw=p.read_bytes();need(sha(raw)==expected_pin,'EXACT_ISSUED_AUTHORITY_BYTES_REQUIRED');v=json.loads(raw)
 need(type(v) is dict and v.get('requestKey')==expected_key and type(v.get('startsAt')) is int and type(v.get('expiresAt')) is int and v['startsAt']<v['expiresAt'],'ISSUED_AUTHORITY_SCOPE_REQUIRED')
 return sha(raw)
def phase_argument(parsed_args,pin):
 need(type(parsed_args) is list and len(parsed_args)==1 and parsed_args==[pin],'EXACT_SINGLE_AUTHORITY_PHASE_ARGUMENT_REQUIRED')
def prepare(phase,policy_file,policy_pin,expected_authority_pin,output_directory,supplied_phase_args=None):
 # Only actual C-issued policy and authority files are execution inputs. No call
 # below invokes state/remote/dispatch/submit before every byte/argument check.
 need(phase in PHASES,'FIXED_FIVE_MAINTENANCE_PHASES_ONLY');p=Path(policy_file);need(type(policy_pin) is str and sha(p.read_bytes())==policy_pin,'EXACT_ISSUED_POLICY_PIN_REQUIRED');policy=json.loads(p.read_bytes())
 need(type(policy.get('startsAt')) is int and type(policy.get('expiresAt')) is int and policy['startsAt']<policy['expiresAt'],'ISSUED_POLICY_REQUIRED')
 need(policy.get('format')=='T45_R3_NORMAL45_BATCHED_REAL_V1' and set(policy.get('jobs',{}))==set(PHASES),'EXACT_NORMAL44_POLICY_FORMAT_REQUIRED')
 blueprint=json.loads((HERE/'PHASES45.UNISSUED.json').read_bytes());rule=policy['jobs'][phase];fixed=blueprint['jobs'][phase]
 need(rule['jobId']==fixed['jobId'] and rule['script']==fixed['script'] and rule['timeoutSeconds']==fixed['timeoutSeconds'] and rule['authorityLeaf']==fixed['authorityLeaf'],'EXACT_SUCCESSOR_RULE_REQUIRED')
 source=HERE/phase/'bundle';pin=authority(source/rule['authorityLeaf'],expected_authority_pin,rule['jobId'])
 values=[pin] if supplied_phase_args is None else supplied_phase_args
 phase_argument(values,pin)
 need(sha(CLIENT.read_bytes())==CLIENT_SHA and sha(LOADER.read_bytes())==LOADER_SHA,'ORIGINAL_CLIENT_OR_600_INSTANCE_DIFFERS')
 client=runpy.run_path(str(LOADER))['load_client']()
 # Actual existing parser, never evaluated original main/state/submit here.
 tree=ast.parse(CLIENT.read_bytes());main=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='main');idx=next(i for i,n in enumerate(main.body) if isinstance(n,ast.Assign) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and n.value.func.attr=='parse_args');scope={'argparse':client['argparse']};exec(compile(ast.Module(body=main.body[:idx],type_ignores=[]),str(CLIENT),'exec'),scope)
 argv=['run','--task','T45','--job-id',rule['jobId'],'--source-dir',str(source),'--script',rule['script'],'--timeout-seconds',str(rule['timeoutSeconds']),'--output-dir',str(output_directory),'--phase-arg',pin]
 args=scope['parser'].parse_args(argv);phase_argument(args.phase_arg,pin)
 cfg={'grantId':'b16447fbc81f4d64','private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64'}
 files=client['collect_bundle_files'](cfg,args,source,args.job_id)
 need(set(files)==set(rule['bundlePins'])|{rule['authorityLeaf']} and all(sha(files[k])==v for k,v in rule['bundlePins'].items()) and sha(files[rule['authorityLeaf']])==pin,'EXACT_FINAL_EXECUTION_BUNDLE_REQUIRED')
 # Reuse the three real original constructor assignments, so execution is bound
 # to the produced request rather than only the caller's namespace object.
 submit=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='submit');nodes=[n for n in submit.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('manifest','raw','request') for t in n.targets)];need(len(nodes)==3,'ORIGINAL_REQUEST_CONSTRUCTOR_DIFFERS')
 s={'args':args,'cfg':cfg,'files':files,'job_id':args.job_id,'hashlib':hashlib,'json':json,'proofs':{}};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(CLIENT),'exec'),s);phase_argument(s['request']['args'],pin)
 return client,argv,s['request']
def execute(phase,policy_file,policy_pin,authority_pin,output_directory,supplied_phase_args=None):
 client,argv,request=prepare(phase,policy_file,policy_pin,authority_pin,output_directory,supplied_phase_args)
 # Original main supplies the original lock, state loader and submit machinery.
 prior=sys.argv
 try:sys.argv=[str(CLIENT),*argv];client['main']()
 finally:sys.argv=prior
 return request
