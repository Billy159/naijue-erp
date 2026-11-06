"""Only fabricated machine material. Never reads a real passfile or server."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('controller_reference',Path(__file__).with_name('prepare_controller_reference.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ControllerReference(unittest.TestCase):
 def test_exact_controller_only(self):
  p=module.PROPOSAL
  raw=f"{p['host']}:{p['port']}:*:{p['controller']}:".encode()+b'a'*64+b'\n'
  v=module.controller_config({'proposal':dict(p)},raw)
  self.assertEqual(v['user'],p['controller']);self.assertEqual(v['database'],p['database'])
  self.assertEqual(set(v),{'host','port','database','user','password'})

 def test_owner_wrong_target_and_multiple_entries_refused_without_secret_output(self):
  p=module.PROPOSAL
  valid=f"{p['host']}:{p['port']}:*:{p['controller']}:".encode()+b'a'*64+b'\n'
  invalid=[valid.replace(p['controller'].encode(),p['owner'].encode()),valid.replace(b'127.0.0.1',b'other-host'),valid+valid,valid[:-1],valid.replace(b':*:',b':erp_prod:')]
  for raw in invalid:
   with self.assertRaises(ValueError) as caught:module.controller_config({'proposal':dict(p)},raw)
   self.assertNotIn('a'*64,str(caught.exception))

 def test_proposal_cannot_be_retargeted(self):
  p=dict(module.PROPOSAL);p['database']='erp_prod'
  with self.assertRaisesRegex(ValueError,'CONTROLLER_EXACT_PROPOSAL_REQUIRED'):module.controller_config({'proposal':p},b'not material')

if __name__=='__main__':unittest.main(verbosity=2)
