import unittest, types, pathlib, tempfile
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
def load(name):
 m=types.ModuleType(name);m.__file__=str(HERE/(name+'.py'));exec(compile(pathlib.Path(m.__file__).read_bytes(),m.__file__,'exec'),m.__dict__);return m
D=load('deploy-candidate'); B=load('boot-entry')
class Lifecycle(unittest.TestCase):
 def test_boot_journal_stops_exact_app(self):
  for running in [True,False]:
   with self.subTest(running=running), tempfile.TemporaryDirectory() as tmp:
    journal=B.Journal.__new__(B.Journal);journal.directory=pathlib.Path(tmp).resolve();journal.path=journal.directory/'op.json';journal.data={'events':[]}
    class Docker:
     def __init__(self):self.running=running;self.calls=[]
     def inspect(self,cid):return {'Id':cid,'State':{'Running':self.running}}
     def run(self,args,timeout):self.calls.append(args);self.running=False
    docker=Docker()
    with patch.object(D,'exact26_full',return_value=True),patch.object(D,'reference',return_value={'containers':{'app':{'id':'exact-app','specSha256':'pin'}}}),patch.object(D,'assert_own'),patch.object(D,'own_container_fingerprint',return_value='pin'):
     result=D.stop_full_app({},docker,journal)
    self.assertTrue(result['stopped']);self.assertEqual(len(docker.calls),int(running))
 def test_disarm_real_flow_stops_web_then_app(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();(root/'snapshot.json').write_text('{"binding":{}}')
   journal=B.Journal.__new__(B.Journal);journal.directory=root;journal.path=root/'op.json';journal.data={'events':[]}
   class Docker:
    def __init__(self):self.states={'web':True,'app':True};self.calls=[]
    def inspect(self,cid):return {'Id':cid,'State':{'Running':self.states[cid]}}
    def run(self,args,timeout):self.calls.append(args[-1]);self.states[args[-1]]=False
   docker=Docker();state={'publicCandidateByName':'web','ownerUnit':{'sha256':None,'state':{'UnitFileState':'disabled'}},'ownedFiles':{'DISARMED':None}}
   with patch.object(B,'cas_observation',return_value=state),patch.object(B,'reference',return_value={'publicContainer':{'id':'web'}}),patch.object(B,'owner_root',return_value=root),patch.object(B,'binding',return_value={}),patch.object(B,'candidate',return_value=docker.inspect('web')),patch.object(D,'Docker',return_value=docker),patch.object(D,'exact26_full',return_value=True),patch.object(D,'reference',return_value={'containers':{'app':{'id':'app','specSha256':'pin'}}}),patch.object(D,'assert_own'),patch.object(D,'own_container_fingerprint',return_value='pin'):
    result=B.disarm({'activationReceipt':{'present':True}},D,{'runtimeSelector':'exact26-full'},None,journal)
   self.assertEqual(docker.calls,['web','app']);self.assertTrue(result['fullAppStop']['stopped']);self.assertTrue((root/'DISARMED').exists())
 def test_action_failure_preserves_unknown_and_no_returned_success(self):
  j=D.Journal.__new__(D.Journal);j.data={'events':[]};j.path=pathlib.Path('/unused');calls=[]
  def fail():calls.append('once');raise TimeoutError()
  with patch.object(D,'replace_json'):
   with self.assertRaises(TimeoutError):j.action('exact-cid',fail)
  self.assertEqual(calls,['once']);self.assertEqual(j.data['events'][-1]['state'],'INTENT_OUTCOME_UNKNOWN')
 def test_deployment_action_intent_failure_prevents_operation(self):
  j=D.Journal.__new__(D.Journal);j.data={'events':[]};j.path=pathlib.Path('/unused');calls=[]
  with patch.object(D,'replace_json',side_effect=OSError('disk')):
   with self.assertRaises(OSError):j.action('stop',lambda:calls.append(1))
  self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
