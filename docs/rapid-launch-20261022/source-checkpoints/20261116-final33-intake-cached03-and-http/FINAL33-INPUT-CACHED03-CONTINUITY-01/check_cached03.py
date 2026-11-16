"""Pure local consumption of exact receiver bytes; no server or PostgreSQL."""
from pathlib import Path
from types import SimpleNamespace,ModuleType
from unittest.mock import patch
import copy,hashlib,json,runpy,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
BASE=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/INPUT-RECEPTION-01/CACHED-03'
sys.path.insert(0,str(BASE));b=runpy.run_path(str(BASE/'batch_protocol.py'))
core=ModuleType('real_original_core');core.__file__=str(ROOT/'outputs/主控/20261114-r3-19-continuity-recovery-local-01/r3_write_continuity.py');exec(compile(Path(core.__file__).read_bytes(),core.__file__,'exec'),core.__dict__)
new=runpy.run_path(str(HERE/'r3_final33_input_cached03.py'));groups=json.loads((HERE.parent/'FINAL33-INPUT-CONTINUITY-01/GROUPS.json').read_text());fixed=json.loads((BASE.parent/'CACHED-02/first-standard-p001-p004/AUTHORITY-FIELDS.UNISSUED.json').read_text())['fixed'];p0=json.loads((HERE/'POLICY.CACHED03.json').read_text());fixed['codeSha256']=p0['codeSha256'];now=time.time_ns()//1000000
cfg={'private':'/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64','grantId':'b16447fbc81f4d64','scope':'ERP_EXISTING_TASKS_THROUGH_T51','expiresAtEpoch':(now+100000000)/1000}
class Prior:
 root=Path(cfg['private'])/'r3-05-write-continuity'
 def admit(self,*_):raise ValueError('R3_CONTINUITY_OTHER_JOB_BLOCKED')
 def finish(self,phase):return 'ORIGINAL_FINISH_'+phase

def fixture(index=0,restore=False,boundaries=None):
 p=copy.deepcopy(p0);p.update(startsAt=now-7200000,expiresAt=now+7200000);p['evidencePins']={str(Prior.root/'active.json'):hashlib.sha256(b'ACTUAL_HOLD_FIXTURE').hexdigest()};a={**fixed,'batchManifestSha256':groups[index]['batchManifestSha256'],'startsAt':now-1081000 if restore else now-1000,'expiresAt':now-1000 if restore else now+1079000,'decisionReference':'LOCAL_ONLY_NOT_ISSUED'};raw=b['pack'](a);digest=b['sha'](raw);install,withdraw=b['jobs'](digest);key=withdraw if restore else install;private=Path(cfg['private'])/'jobs'/key;files={leaf:(BASE/leaf).read_bytes()for leaf in fixed['codeSha256']};files.update({'stage-authorization.json':raw,'batch-manifest.json':(Path(groups[index]['directory'])/'batch-manifest.json').read_bytes()});
 if boundaries is not None:
  rows=json.loads(files['batch-manifest.json']);actual=json.loads(boundaries.read_text())['parts'];receiver=(BASE/'artifact-receiver.d3-chunk.py').read_bytes()
  for row in rows:
   _,g,_=b['part_api'](receiver,a,row,digest);status=actual[row['artifactKey']];row['window']['boundary']=None if status['status']=='ABSENT' else g['recovery_snapshot'](status)
  files['batch-manifest.json']=b['pack'](rows);a['batchManifestSha256']=b['sha'](files['batch-manifest.json']);raw=b['pack'](a);digest=b['sha'](raw);install,withdraw=b['jobs'](digest);key=withdraw if restore else install;private=Path(cfg['private'])/'jobs'/key;files['stage-authorization.json']=raw
 manifest={'taskId':'T45','jobId':key,'files':[{'name':leaf,'bytes':len(data),'sha256':b['sha'](data)}for leaf,data in files.items()]};mr=b['pack'](manifest);job={'jobId':key,'taskId':'T45','grantId':cfg['grantId'],'scope':cfg['scope'],'script':'batch_policy.py','args':[digest],'timeoutSeconds':35,'manifestSha256':b['sha'](mr)};store={Prior.root/'final33-input-reception-cached03.json':b['pack'](p),Prior.root/'active.json':b'ACTUAL_HOLD_FIXTURE',private/'request.json':b['pack'](job),private/'manifest.json':mr,private/'bundle/bundle-manifest.json':mr,**{private/'bundle'/leaf:data for leaf,data in files.items()}}
 if restore:store[Path(cfg['private'])/'jobs'/install/'bundle/stage-authorization.json']=raw;store[Path(cfg['private'])/'jobs'/install/'bundle/batch-manifest.json']=files['batch-manifest.json']
 core.read=lambda path,**kw:store[path]
 instance=new['Final33InputContinuation'](core,Prior(),cfg,b['sha'](b['pack'](p)))
 return instance,job,private,store

def run(index=0,restore=False,mutate=None,expected=None,boundaries=None):
 inst,job,private,store=fixture(index,restore,boundaries)
 if mutate:mutate(inst,job,private,store)
 service=inst.policy['stoppedService'];observation={'id':service['containerId'],'startedAt':service['containerStartedAt'],'running':False,'pid':0,'operation':service['serviceKey']}
 with patch('subprocess.run',return_value=SimpleNamespace(stdout=b['pack'](observation),stderr=b'',returncode=0)):
  try:result=inst.admit(job,private)
  except (ValueError,KeyError)as error:
   if expected is None:raise
   assert expected in str(error),(expected,str(error));return
  assert expected is None and result is None
checks=[]
run(0);checks.append('unchanged_initial_group_consumption')
status=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/INPUT-RECEPTION-01/CACHED-02/execution-023bf0b91b0249590a04f8a5/POST-WITHDRAW-READONLY-02.json'
assert hashlib.sha256(status.read_bytes()).hexdigest()=='309d0033abb13d2340427119bfa67c5f79195230c887e0e1e9f8c24aee273e84'
run(2,boundaries=status);checks.append('native_actual_ready009_010_011_and_absent012_boundary_shape_accepted')
def wrong_plan(i,j,p,s):
 rows=json.loads(s[p/'bundle/batch-manifest.json']);rows[0]['window']['segments'][1]['sha256']='0'*64;s[p/'bundle/batch-manifest.json']=b['pack'](rows)
 # Keep original frozen metadata: changing payload must be rejected even before normalized matching.
run(2,boundaries=status,mutate=wrong_plan,expected='FROZEN_MEMBER_DIFFERS');checks.append('changed_segments_refused_before_admission')
print(json.dumps({'state':'PASS_LOCAL_CACHED03_FIXED_POLICY_AND_NATIVE_RECOVERY_SOURCE_INCREMENT','checks':checks,'passed':len(checks),'serverCalls':0,'postgresConnections':0,'businessWrites':0,'recoveryModuleSha256':hashlib.sha256((HERE/'r3_final33_input_cached03.py').read_bytes()).hexdigest(),'originalStatusOnlyUsedForLocalShapeTest':'EXACT_WITHDRAWN_BATCH_READONLY_ONLY_LOCAL_TEST_NO_AUTHORITY_ISSUED'},indent=2))
