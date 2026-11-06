"""Finite offline model for exact predecessor branch. No script import/server IO."""
import ast,copy,unittest
from pathlib import Path

class ExactR23PredecessorTests(unittest.TestCase):
 def setUp(self):
  source=Path(__file__).with_name('stage_preflight.py').read_text()
  nodes=[n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='retained_r23_is_stopped_and_isolated']
  assert len(nodes)==1
  namespace={};exec(compile(ast.Module(body=nodes,type_ignores=[]),'isolated-existing-guard','exec'),namespace)
  self.check=namespace['retained_r23_is_stopped_and_isolated']
  self.cleanup=dict(cleanShutdown=True,credentialsRemoved=True,loginsRevoked=True,ownedPidAbsent=True,cleanupComplete=False,portAbsent=False,errors=[])
  self.info=dict(id='e40db110ff95f772829a70ff71b65874b295db7969fcd68e3b9228013503e907',running=False,pid=0,image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769',network='none',ports={},labels={'t45.operation':'t45-f35-1e6ba0-application-20261106-01','t45.source':'b0f8cb299ccdab04b522abd5b944bb4c6f1d3ce2ba9f11f7bac25a2dc163d29f'})
 def test_exact_known_failed_cleanup_retained(self):
  before=copy.deepcopy(self.cleanup);self.assertTrue(self.check(self.cleanup,self.info));self.assertEqual(self.cleanup,before)
  self.assertFalse(self.cleanup['cleanupComplete']);self.assertFalse(self.cleanup['portAbsent'])
 def test_other_cleanup_combinations_refused(self):
  for key in ['cleanShutdown','credentialsRemoved','loginsRevoked','ownedPidAbsent','cleanupComplete','portAbsent']:
   for value in [not self.cleanup[key],None,0,1]:
    with self.subTest(key=key,value=value):
     changed={**self.cleanup,key:value};self.assertFalse(self.check(changed,self.info))
  self.assertFalse(self.check({**self.cleanup,'errors':[{'phase':'observe','type':'Error'}]},self.info))
 def test_running_wrong_target_or_host_binding_refused(self):
  for change in [{'running':True},{'pid':1},{'pid':False},{'id':'wrong'},{'image':'wrong'},{'network':'host'},{'ports':{'18651/tcp':[{'HostPort':'18651'}]}},{'labels':{}},{'labels':{**self.info['labels'],'t45.source':'wrong'}},{'labels':{**self.info['labels'],'t45.operation':'wrong'}}]:
   with self.subTest(change=change):self.assertFalse(self.check(self.cleanup,{**self.info,**change}))
  for key in self.info:
   value=dict(self.info);del value[key]
   with self.subTest(missing=key):self.assertFalse(self.check(self.cleanup,value))

if __name__=='__main__':unittest.main()
