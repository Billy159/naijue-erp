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
if __name__=='__main__':unittest.main()
