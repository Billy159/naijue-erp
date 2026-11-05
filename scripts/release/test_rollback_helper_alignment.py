"""Offline loader/plan-only protocol tests. No lock, Docker, PG or entry actions."""
import contextlib,hashlib,io,json,pathlib,sys,tempfile,types,unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
R=types.ModuleType('rollback');R.__file__=str(HERE/'rollback-candidate.py');exec(compile(pathlib.Path(R.__file__).read_bytes(),R.__file__,'exec'),R.__dict__)
class RollbackHelper(unittest.TestCase):
 def test_actual_full_capacity_plan_loads_reviewed_helper_before_plan_only_readback(self):
  # Baseline RED is FULL_REVIEWED_DEPLOYMENT_HELPER_REQUIRED on actual helper bytes,
  # not an invented mock hash or a missing new function.
  p={'runtimeSelector':'exact26-full','capacityHost':{},'buildId':'synthetic','activationReceipt':{}}
  original=R.deployment_implementation
  def checked_load(*args,**kwargs):
   c=original(*args,**kwargs)
   c.read_plan=lambda _:p
   c.reference=lambda _:{}
   return c
  with tempfile.TemporaryDirectory() as tmp:
   f=pathlib.Path(tmp)/'plan.json';f.write_text(json.dumps(p));out=io.StringIO()
   with patch.object(sys,'argv',['rollback','--plan',str(f),'--mode','stop-entry']),patch.object(R,'deployment_implementation',side_effect=checked_load),patch.object(R,'rollback',side_effect=AssertionError('must not execute')),contextlib.redirect_stdout(out):R.main()
   self.assertEqual(json.loads(out.getvalue())['status'],'PLAN_ONLY_NOT_EXECUTED')
 def test_old_full_does_not_silently_consume_new_capacity_bytes(self):
  with self.assertRaisesRegex(ValueError,'FULL_REVIEWED_DEPLOYMENT_HELPER_REQUIRED'):R.deployment_implementation('exact26-full')
 def test_changed_or_legacy_only_helper_never_executes_as_capacity(self):
  for value in [b"raise AssertionError('UNTRUSTED_CODE_EXECUTED')\n",b'']:
   with patch.object(pathlib.Path,'read_bytes',return_value=value),self.assertRaisesRegex(ValueError,'CAPACITY_REVIEWED_DEPLOYMENT_HELPER_REQUIRED'):R.deployment_implementation('exact26-full',capacity=True)
 def test_capacity_selection_and_selector_cannot_change_between_plan_reads(self):
  original=R.deployment_implementation
  for changed in [{'runtimeSelector':'exact26-full'},{'runtimeSelector':'schema19','capacityHost':{}}]:
   initial={'runtimeSelector':'exact26-full','capacityHost':{}}
   def checked_load(*args,**kwargs):
    c=original(*args,**kwargs);c.read_plan=lambda _:changed;c.reference=lambda _:self.fail('no receipt access after selection drift');return c
   with tempfile.TemporaryDirectory() as tmp:
    f=pathlib.Path(tmp)/'plan.json';f.write_text(json.dumps(initial))
    with patch.object(sys,'argv',['rollback','--plan',str(f),'--mode','stop-entry']),patch.object(R,'deployment_implementation',side_effect=checked_load),self.assertRaisesRegex(Exception,'RUNTIME_SELECTION_CHANGED'):R.main()
 def test_capacity_pin_is_same_independently_reviewed_exact_source_as_boot(self):
  b=types.ModuleType('boot');b.__file__=str(HERE/'boot-entry.py');exec(compile(pathlib.Path(b.__file__).read_bytes(),b.__file__,'exec'),b.__dict__)
  self.assertEqual(R.DEPLOYMENT_CAPACITY_SHA256,b.DEPLOYMENT_CAPACITY_SHA256)
  self.assertEqual(R.DEPLOYMENT_CAPACITY_SHA256,hashlib.sha256((HERE/'deploy-candidate.py').read_bytes()).hexdigest())
  self.assertEqual(R.DEPLOYMENT_FULL_SHA256,'a7655f237631015c07c72cfdfce2d597d45da341cb156c588e74c9f28872ead3')
 def test_unknown_selection_rejected_before_read_or_compile(self):
  for selector in ['unknown',None,[],{}]:
   with patch.object(pathlib.Path,'read_bytes',side_effect=AssertionError('must reject first')),self.assertRaisesRegex(ValueError,'UNKNOWN_RUNTIME_SELECTOR'):R.deployment_implementation(selector,capacity=True)



class Exact35RollbackIncrement(unittest.TestCase):
 def setUp(self):
  self.D=types.ModuleType('synthetic_deploy');self.D.__file__=str(HERE/'deploy-candidate.py')
  exec(compile(pathlib.Path(self.D.__file__).read_bytes(),self.D.__file__,'exec'),self.D.__dict__)
 def fixture(self):
  D=self.D
  refs={key:{'path':str(D.ROOT/(key+'.json')),'sha256':'a'*64} for key in ('installationRecord','sourceSet','program','metadata','buildReceipt','sourceManifest','buildManifest','backupCoverage')}
  refs['installationRecord']['path']=D.RELEASE_CONTRACT['exact35']['installationRecord']
  p={'runtimeSelector':'exact35','runtime35':{'references':refs,'media':{'hostRoot':str(D.ROOT/'media'),'containerRoot':'/run/naijue-rewrite/media/images','rootKey':'images','writable':True}},
     'newDatabaseReceipt':refs['metadata'],'runtimeConfiguration':{'path':str(D.ROOT/'runtime.json'),'identity':{'inode':1}},'capacityHost':{},
     'buildId':'synthetic','sourceCommit':'a'*40,'archive':{'sha256':'b'*64},'activationReceipt':{'path':'activation'},
     'writeBoundary':{'path':'boundary'},'writeFence':{'path':'fence'},'beforeCAS':{'services':{D.OLD_NAMES[1]:{'id':'old-web'}}}}
  record={'target':{'proposal':{'database':'synthetic_fresh35_20261105_r9'}},'catalogSha256':'c'*64}
  activation={'status':'ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK','buildId':p['buildId'],'sourceCommit':p['sourceCommit'],
              'archiveSha256':p['archive']['sha256'],'database':record['target']['proposal']['database'],'oldWebId':'old-web',
              'publicContainer':{'id':'new-web','specSha256':'pin'},'runtime35BindingSha256':D.runtime_binding(p)}
  boundary={'format':'naijue-rewrite-write-boundary-v1','database':activation['database'],'target':record['target'],'buildId':p['buildId'],'sourceCommit':p['sourceCommit'],
            'writeAdmission':'CLOSED','newBusinessWrites':1,'firstBusinessWriteAtUtc':D.now(),'checkedAtUtc':D.now(),'checkedBy':'synthetic','outcome':'KNOWN'}
  return p,record,activation,boundary
 def test_exact35_never_loads_unreviewed_helper_or_falls_back_to_noncapacity(self):
  with patch.object(pathlib.Path,'read_bytes',side_effect=AssertionError('must refuse before read')),self.assertRaisesRegex(ValueError,'EXACT35_REQUIRES_EXISTING_CAPACITY'):R.deployment_implementation('exact35')
  with self.assertRaisesRegex(ValueError,'CAPACITY_REVIEWED_DEPLOYMENT_HELPER_REQUIRED'):R.deployment_implementation('exact35',capacity=True)
 def run_case(self,mode,*,running=True,activation_change=None):
  from unittest.mock import Mock,mock_open
  D=self.D;p,record,activation,boundary=self.fixture()
  if activation_change:activation_change(activation)
  class Docker:
   def __init__(self):self.running=running;self.commands=[]
   def inspect(self,cid):return {'Id':cid,'State':{'Running':self.running}}
   def run(self,args,timeout):self.commands.append(args);self.running=False
  docker=Docker();journal=Mock();journal.finish.return_value={}
  rows={'activation':activation,'boundary':boundary,'fence':{}}
  with contextlib.ExitStack() as stack:
   for owner,name,value in [(D,'exact_host',lambda p:pathlib.Path('/synthetic-job')),(D,'Journal',lambda *a:journal),(D,'Docker',lambda:docker),
                            (D,'runtime35_record',lambda p:record),(D,'reference',lambda ref,*a:rows[ref['path']]),(D,'check_old',Mock()),
                            (D,'assert_own',Mock()),(D,'own_container_fingerprint',lambda x:'pin'),(D,'stop_full_app',Mock(return_value={'stopped':True})),
                            (D,'new_json',Mock()),(D,'restore_old_entry',Mock(side_effect=AssertionError('must not restore old entry')))]:
    stack.enter_context(patch.object(owner,name,value))
   stack.enter_context(patch('builtins.open',mock_open()));stack.enter_context(patch.object(R.fcntl,'flock'))
   if mode=='restore-old-entry' or activation_change:
    with self.assertRaises(D.Refused):R.rollback(p,mode,D)
    self.assertEqual(docker.commands,[]);D.restore_old_entry.assert_not_called();D.stop_full_app.assert_not_called()
   else:
    result=R.rollback(p,mode,D)
    self.assertEqual(result['database'],record['target']['proposal']['database'])
    self.assertEqual(result['runtime35BindingSha256'],D.runtime_binding(p));self.assertFalse(result['databaseRestoredOrDowngraded'])
    D.stop_full_app.assert_called_once();D.restore_old_entry.assert_not_called();self.assertEqual(len(docker.commands),int(running))
 def test_stop_after_writes_stops_original_app_and_preserves_new_target(self):
  self.run_case('stop-entry');self.run_case('stop-entry',running=False)
 def test_restore_after_new_writes_refuses_before_stopping_or_reopening(self):
  self.run_case('restore-old-entry')
 def test_activation_source_binding_and_target_mismatch_refuse_before_actions(self):
  self.run_case('stop-entry',activation_change=lambda a:a.update(runtime35BindingSha256='0'*64))
  self.run_case('stop-entry',activation_change=lambda a:a.update(database=self.D.DATABASE))


if __name__=='__main__':unittest.main()
