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
class CredentialMount(unittest.TestCase):
 def fixture(self, root):
  import os
  key=root/'credential.key';key.write_bytes(b'S'*32);key.chmod(0o600)
  refs={name:{'path':str(root/(name+'.json')),'sha256':'a'*64} for name in D.FULL_REFERENCES}
  p={'runtimeSelector':'exact26-full','runtime26Full':{'references':refs,'media':{'hostRoot':str(root/'media'),'containerRoot':'/run/naijue-rewrite/media/images','rootKey':'images','writable':True},'credentialRequestKey':{'hostFile':str(key),'containerFile':'/run/naijue-rewrite/credential-request.key'}},'newDatabaseReceipt':refs['metadata'],'limits':{'app':{'user':str(os.getuid())+':'+str(os.getgid())}},'runtimeConfiguration':{'path':str(root/'runtime.json'),'identity':{'bytes':1}}}
  return p,key
 def test_binding_mount_selection_and_no_secret_content_reads(self):
  import copy
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();p,key=self.fixture(root)
   # Credential test isolates unrelated capacity-file validation, covered by its own suite.
   capacity={'collector':{'hostFile':str(root/'collector')},'profile':{'hostFile':str(root/'profile')}}
   with patch.object(D,'ROOT',root),patch.object(D,'capacity_host_binding',return_value=capacity),patch.object(pathlib.Path,'read_bytes',side_effect=AssertionError('must not read secret bytes')):
    self.assertTrue(D.exact26_full(p));D.validate_full_credential(p,{'staffMaintenance':True,'staffCredentialRequestKeyFile':'/run/naijue-rewrite/credential-request.key'})
    args=D.runtime_mount_arguments(p);self.assertIn('type=bind,src='+str(key)+',dst=/run/naijue-rewrite/credential-request.key,readonly',args)
    before=D.runtime_binding(p);key.touch();self.assertNotEqual(before,D.runtime_binding(p))
    identity=D.credential_key_binding(p);self.assertNotIn('sha256',identity);self.assertNotIn('S'*32,str(identity));self.assertEqual(identity['identity']['bytes'],32)
    for runtime in [{},{'staffMaintenance':True},{'staffCredentialRequestKeyFile':'/run/naijue-rewrite/credential-request.key'},{'staffMaintenance':True,'staffCredentialRequestKeyFile':'/wrong'}]:
     with self.subTest(runtime=runtime),self.assertRaises(D.Refused):D.validate_full_credential(p,runtime)
    disabled=copy.deepcopy(p);del disabled['runtime26Full']['credentialRequestKey'];D.validate_full_credential(disabled,{})
    self.assertFalse(any('credential-request.key' in arg for arg in D.runtime_mount_arguments(disabled)))
    with self.assertRaises(D.Refused):D.validate_full_credential(disabled,{'staffMaintenance':True})
 def test_bad_paths_modes_owner_size_and_closed_mapping_refuse(self):
  import copy
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp).resolve();p,key=self.fixture(root)
   with patch.object(D,'ROOT',root):
    for mapping in [{'hostFile':'relative','containerFile':'/run/naijue-rewrite/credential-request.key'},{'hostFile':str(key),'containerFile':'/run/naijue-rewrite/runtime.json'},{'hostFile':str(key),'containerFile':'/run/naijue-rewrite/credential-request.key','bytes':'secret'},{'hostFile':str(root.parent/'outside'),'containerFile':'/run/naijue-rewrite/credential-request.key'}]:
     bad=copy.deepcopy(p);bad['runtime26Full']['credentialRequestKey']=mapping
     with self.subTest(mapping=mapping),self.assertRaises((D.Refused,FileNotFoundError)):D.exact26_full(bad)
    key.chmod(0o644)
    with self.assertRaises(D.Refused):D.exact26_full(p)
    key.chmod(0o600);key.write_bytes(b'S'*31)
    with self.assertRaises(D.Refused):D.exact26_full(p)
    key.write_bytes(b'S'*32);bad=copy.deepcopy(p);bad['limits']['app']['user']='999999:999999'
    with self.assertRaises(D.Refused):D.exact26_full(bad)
    link=root/'link';link.symlink_to(key);bad=copy.deepcopy(p);bad['runtime26Full']['credentialRequestKey']['hostFile']=str(link)
    with self.assertRaises(D.Refused):D.exact26_full(bad)

class LogRotation(unittest.TestCase):
 def plan(self):
  return {'buildId':'isolated-logging-test','operationId':'isolated-logging-test','archive':{'sha256':'a'*64},
   'names':{'app':'app','stageWeb':'stage-web','publicWeb':'public-web'},
   'networks':{'front':{'id':'front'},'data':{'id':'data'}},
   'images':{'node':{'id':'node-image'},'web':{'id':'web-image'}},
   'releaseDirectory':'/isolated/logging-test','runtimeConfiguration':{'path':'/isolated/runtime.json'},
   'nginxConfiguration':{'path':'/isolated/nginx.conf'},
   'limits':{key:{'user':'10001:10001','memoryMiB':128,'cpus':1,
    'logging':{'maxSizeBytes':1048576,'maxFiles':2,'compress':True}} for key in ('app','web','install')}}
 def test_new_containers_receive_explicit_native_rotation(self):
  class Docker:
   def __init__(self):self.calls=[]
   def run(self,args):self.calls.append(args);return ('c'*64).encode()
  p=self.plan();docker=Docker()
  # The old direct create_app path is intentionally closed; test the actual gate carrier.
  gate={'hostFifo':'/isolated/gate','nonce':'a'*64,'shell':{'containerFile':'/bin/sh'}}
  with patch.object(D,'capacity_host_binding'),patch.object(D,'capacity_gate_binding',return_value=gate),patch.object(D,'runtime_mount_arguments',return_value=[]):
   D.create_capacity_gate_app(p,docker)
  D.create_web(p,docker);D.create_web(p,docker,public=True)
  with self.assertRaisesRegex(D.Refused,'CAPACITY_USE_BOUNDED_CONTROLLER'):
   D.create_app(p,docker)
  for args in [row for row in docker.calls if row[0]=='create']+[D.limits_args(p,'install')]:
   self.assertEqual(args[args.index('--log-driver')+1],'json-file')
   for option in ('max-size=1048576','max-file=2','compress=true'):self.assertIn(option,args)
 def test_missing_or_unbounded_rotation_refuses_before_container_creation(self):
  import copy
  for value in [None,{}, {'maxSizeBytes':0,'maxFiles':2,'compress':False},
   {'maxSizeBytes':1,'maxFiles':0,'compress':False}, {'maxSizeBytes':True,'maxFiles':1,'compress':False},
   {'maxSizeBytes':1,'maxFiles':1,'compress':'false'},
   {'maxSizeBytes':1,'maxFiles':1,'compress':False,'endpoint':'not-allowed'}]:
   p=copy.deepcopy(self.plan());p['limits']['app']['logging']=value
   docker=types.SimpleNamespace(run=lambda args:self.fail('must not call Docker'))
   with self.subTest(value=value),self.assertRaises(D.Refused):D.limits_args(p,'app')
 def test_actual_rotation_mismatch_is_rejected_and_part_of_owned_fingerprint(self):
  import copy
  p=self.plan();info={'Id':'c'*64,'Image':'node-image','Config':{'Labels':{
   'naijue.rapid-launch.build-id':p['buildId'],'naijue.rapid-launch.archive-sha256':'a'*64,'naijue.rapid-launch.role':'app'}},
   'HostConfig':{'ReadonlyRootfs':True,'LogConfig':D.logging_config(p,'app')},'NetworkSettings':{'Networks':{}}}
  D.assert_own(info,p,'app');before=D.own_container_fingerprint(info)
  changed=copy.deepcopy(info);changed['HostConfig']['LogConfig']['Config']['max-file']='1'
  self.assertNotEqual(before,D.own_container_fingerprint(changed))
  with self.assertRaises(D.Refused):D.assert_own(changed,p,'app')

if __name__=='__main__':unittest.main()
