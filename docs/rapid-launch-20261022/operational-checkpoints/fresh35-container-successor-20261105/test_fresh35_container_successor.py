"""Offline model only. No Docker/HTTP/SSH/PG or privileged filesystem action."""
import importlib.util,io,json,hashlib,os,stat,subprocess,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch

FILE=Path(__file__).with_name('fresh35-container-successor.py')
class Tests(unittest.TestCase):
 def setUp(self):
  sp=importlib.util.spec_from_file_location('successor',FILE);self.m=importlib.util.module_from_spec(sp);sp.loader.exec_module(self.m)
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.tmp=Path(self.t.name).resolve();self.m.ROOT=self.tmp/'new-root';self.plan={'operationId':'synthetic-model','imagePreparationExpiresAt':int(time.time()*1000)+120000,'stagingAuthoritySha256':'c'*64}
  self.block=patch.object(self.m,'run',side_effect=AssertionError('EXTERNAL_COMMAND_FORBIDDEN'));self.block.start();self.addCleanup(self.block.stop)
 def setup_root(self):
  self.m.ROOT.mkdir();return self.m.ROOT
 def info(self):
  m=self.m
  return {'id':'d'*64,'name':'/'+m.NAME,'image':'sha256:'+'e'*64,'running':True,'labels':{'t45.operation':self.plan['operationId'],'t45.source':m.SOURCE},'network':'none','ports':{},'user':'0:0','readonly':True,'pidMode':'','ipcMode':'private','usernsMode':'','memory':3*1024**3,'swap':3*1024**3,'cpu':2000000000,'pids':256,'caps':['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'],'capDrop':['ALL'],'security':['no-new-privileges'],'privileged':False,'devices':[],'restart':'no','shm':64*1024**2,'tmpfs':{'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'mounts':[{'Type':'bind','Source':str(m.ROOT/n),'Destination':dst,'RW':rw} for n,dst,rw in [('deploy',m.DEPLOY,False),('authority','/etc/naijue-erp',True),('state',m.STATE,True)]]}
 def receipt(self):return {'cid':'d'*64,'image':'sha256:'+'e'*64,'operationId':self.plan['operationId'],'expiresAt':int(time.time()*1000)+120000}
 def test_import_inert_and_command_scope(self):
  a=self.m.common('sha256:'+'e'*64,100,self.plan['operationId']);self.assertIn('--network',a);self.assertIn('none',a);self.assertNotIn('--privileged',a);self.assertNotIn('--init',a);self.assertNotIn('--rm',a);self.assertNotIn('--publish',a);self.assertEqual(a[-5:],['--signal=TERM','--kill-after=3s','100','/usr/bin/sleep','infinity'])
  with self.assertRaisesRegex(ValueError,'WINDOW_TOO_SHORT'):self.m.common('image',90,'op')
 def test_owned_exact_and_mutated_cases(self):
  good=self.info();self.m.owned(good,self.receipt(),self.plan)
  for field,bad in [('id','x'),('image','sha256:x'),('network','host'),('ports',{'5432/tcp':[]}),('user','999:999'),('memory',1),('pidMode','host'),('caps',['ALL']),('privileged',True),('tmpfs',{}),('security',['seccomp=unconfined'])]:
   with self.subTest(field=field),self.assertRaises(ValueError):self.m.owned({**good,field:bad},self.receipt(),self.plan)
 def test_configuration_not_generated_and_missing_execute_refuses(self):
  with patch('sys.argv',['successor','--phase','prepare-image','--plan','/no-plan','--plan-sha256','a'*64]),self.assertRaisesRegex(ValueError,'EXECUTION_NOT_REQUESTED'):self.m.main()
 def test_external_inputs_only_original_job_bundle(self):
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(self.tmp/'job')}):
   self.assertEqual(self.m.job_input(self.tmp/'job/bundle/provision.json'),self.tmp/'job/bundle/provision.json')
   for p in [self.tmp/'outside.json',Path('/etc/shadow')]:
    with self.assertRaisesRegex(ValueError,'EXACT_JOB_INPUT'):self.m.job_input(p)
 def test_materialization_regular_files_and_traversable_authority(self):
  files={'deploy/code.py':b'public','metadata/deployment-manifest.json':b'{}'};modes={x:0o644 for x in files}
  with patch.object(self.m,'archive_files',return_value=(files,modes,{'packages':[]})),patch.object(self.m,'trusted',side_effect=lambda p,*a:Path(p)):
   self.m.materialize(self.plan,b'model')
  self.assertEqual((self.m.ROOT/'deploy/code.py').read_bytes(),b'public');self.assertEqual(stat.S_IMODE((self.m.ROOT/'authority').stat().st_mode),0o711);self.assertEqual(stat.S_IMODE((self.m.ROOT/'authority/fresh35-isolated-deployment-v1.json').stat().st_mode),0o400)
  with patch.object(self.m,'archive_files',return_value=(files,modes,{})),patch.object(self.m,'trusted',side_effect=lambda p,*a:Path(p)),self.assertRaises(FileExistsError):self.m.materialize(self.plan,b'model')
 def test_new_file_exclusive_and_modes_survive_umask(self):
  old=os.umask(0o077)
  try:self.m.new_file(self.tmp/'public',b'x',0o644)
  finally:os.umask(old)
  self.assertEqual(stat.S_IMODE((self.tmp/'public').stat().st_mode),0o644)
  with self.assertRaises(FileExistsError):self.m.new_file(self.tmp/'public',b'y')
  self.assertEqual((self.tmp/'public').read_bytes(),b'x')
 def test_image_context_standard_apt_ldd_only_syntax(self):
  root=self.setup_root();(root/'image-context').mkdir();pq=root/'deploy/runtime/pg/usr/lib/x86_64-linux-gnu/libpq.so.5.17';pq.parent.mkdir(parents=True);pq.write_bytes(b'fixture')
  pkgs=[{'Package':'fixture'+str(i),'Version':'1','SHA256':'a'*64} for i in range(84)]
  with patch.object(self.m,'read_file',return_value=b'fixture'),patch.object(self.m,'LIBPQ_SHA',hashlib.sha256(b'fixture').hexdigest()):ctx=self.m.image_context({'packages':pkgs,'unresolved':[]})
  docker=(ctx/'Dockerfile').read_text();shell=(ctx/'install-locked.sh').read_text();abi=(ctx/'check_abi.py').read_text();self.assertIn('FROM '+self.m.BASE,docker);self.assertIn('apt-get',shell);self.assertIn('--simulate',shell);self.assertIn('--no-remove',shell);self.assertNotIn('--allow-unauthenticated',shell);self.assertNotIn('trusted=yes',shell);self.assertIn('/usr/bin/ldd',abi);compile(abi,'abi-model','exec')
  self.assertEqual(subprocess.run(['/bin/sh','-n',str(ctx/'install-locked.sh')],capture_output=True).returncode,0)
 def test_preparation_expiry_no_external(self):
  with self.assertRaisesRegex(ValueError,'DEADLINE_EXPIRED'):self.m.prepare_image({**self.plan,'imagePreparationExpiresAt':1})
 def fake_state(self,source_result=None):
  root=self.setup_root();(root/'state'/self.m.WORK).mkdir(parents=True);r=self.receipt();(root/'container-receipt.json').write_text(json.dumps(r))
  if source_result is not None:(root/'state'/self.m.WORK/'result.json').write_text(json.dumps(source_result))
  return r
 def read_local(self,p,*a,**k):return Path(p).read_bytes()
 def test_live_pending_observe_no_stop_or_pass(self):
  self.fake_state()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=self.info()):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'WAITING_ORIGINAL_LAUNCHER');self.assertFalse(r['containerStopped'])
 def test_failed_result_owned_stop_does_not_mean_clean(self):
  self.fake_state({'state':'FAILED_OR_CLEANUP_UNCONFIRMED','cleanup':{'cleanupComplete':False}});info=self.info()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',side_effect=[info,{**info,'running':False}]),patch.object(self.m,'run',return_value=b'') as call:r=self.m.observation(self.plan,wait=False)
  self.assertEqual(call.call_args.args[0],['docker','stop','--time','3','d'*64]);self.assertEqual(r['status'],'FAILED_OR_UNKNOWN_PRESERVED_NO_REPLAY');self.assertTrue(r['containerStopped']);self.assertFalse(r['sourceResult']['cleanup']['cleanupComplete'])
 def test_wrong_owned_cid_never_stopped(self):
  self.fake_state({'state':'UNKNOWN'});info={**self.info(),'id':'wrong'}
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=info),self.assertRaisesRegex(ValueError,'OWNERSHIP_DIFFERS'):self.m.observation(self.plan,wait=False)
 def test_actual_source_success_and_stopped_required_for_scoped_pass(self):
  self.fake_state({'state':'ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED','syntheticImportVerified':True,'recordPublished':True,'businessVerified':False,'cleanup':{'cleanupComplete':True}})
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value={**self.info(),'running':False}):r=self.m.observation(self.plan,wait=False)
  self.assertEqual(r['status'],'PASS_SCOPED_SYNTHETIC_AND_CLEANUP')
 def test_provision_wrong_target_and_expired_rejected(self):
  now=int(time.time()*1000);good={'format':'FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT','proposal':self.m.PROPOSAL,'sourceSetSha256':self.m.SOURCE,'deploymentManifestSha256':self.m.MANIFEST_SHA,'postgresUid':61035,'postgresGid':61035,'independentSafetyReviewSha256':'a'*64,'authorizationReference':'offline fixture','startsAt':now-1000,'expiresAt':now+600000}
  for change in [{'proposal':{'database':'erp_prod'}},{'postgresUid':0},{'expiresAt':now-1},{'expiresAt':now+1200001}]:
   b=json.dumps({**good,**change}).encode()
   with patch.object(self.m,'job_input',side_effect=lambda p:p),patch.object(self.m,'read_file',return_value=b),self.assertRaises(ValueError):self.m.provision_input('fixture',hashlib.sha256(b).hexdigest())
 def fixture_archive(self,mutate=None):
  import tarfile
  m=self.m;files={'deploy/code.py':b'public','deploy/extra.txt':b'text'};manifest={'format':'FRESH35_ISOLATED_DEPLOYMENT_V1','files':[{'path':k.removeprefix('deploy/'),'sha256':hashlib.sha256(v).hexdigest()} for k,v in files.items()]};raw=json.dumps(manifest).encode();lock=b'{"packages":[]}'
  files.update({'metadata/deployment-manifest.json':raw,'metadata/source-descriptor.json':json.dumps({'sourceSetSha256':m.SOURCE}).encode(),'metadata/base-image-registry-result.json':json.dumps({'immutableBase':m.BASE}).encode(),'metadata/debian-runtime-dependency-lock.json':lock});m.MANIFEST_SHA=hashlib.sha256(raw).hexdigest();m.LOCK_SHA=hashlib.sha256(lock).hexdigest();m.FILE_COUNT=2
  stream=io.BytesIO()
  with tarfile.open(fileobj=stream,mode='w:gz') as t:
   for k,v in files.items():
    x=tarfile.TarInfo(k);x.size=len(v);x.mode=0o644
    if mutate:mutate(x)
    t.addfile(x,io.BytesIO(v))
  return stream.getvalue(),files
 def test_archive_closed_regular_members_and_bad_modes(self):
  b,files=self.fixture_archive();actual,modes,lock=self.m.archive_files(b);self.assertEqual(actual,files)
  for mutate in [lambda x:setattr(x,'mode',0o777),lambda x:setattr(x,'name','../escape'),lambda x:setattr(x,'type',__import__('tarfile').SYMTYPE)]:
   b,_=self.fixture_archive(mutate)
   with self.assertRaises(ValueError):self.m.archive_files(b)
 def test_archive_wrong_source_refused_before_root(self):
  b,_=self.fixture_archive();self.m.SOURCE='f'*64
  with self.assertRaisesRegex(ValueError,'SOURCE_SET_DIFFERS'):self.m.archive_files(b)
  self.assertFalse(self.m.ROOT.exists())
 def test_install_delivery_external_exact_binding_and_no_overwrite(self):
  r=self.fake_state();root=self.m.ROOT;(root/'authority').mkdir();work=root/'state'/self.m.WORK;now=int(time.time()*1000)
  program={'programSha256':'a'*64,'sourceSetSha256':self.m.SOURCE,'targetSha256':'b'*64};target={'startsAt':now-1000,'expiresAt':r['expiresAt']};(work/'program-description.json').write_text(json.dumps(program));(work/'target-binding.json').write_text(json.dumps(target));auth={'format':'FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY',**program,**target,'independentSafetyReviewSha256':'c'*64,'authorizationReference':'independent offline fixture'};source=self.tmp/'external.json';source.write_text(json.dumps(auth));raw=source.read_bytes()
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=self.info()),patch.object(self.m,'job_input',side_effect=lambda p:p):
   result=self.m.delivery(self.plan,source,hashlib.sha256(raw).hexdigest());self.assertFalse(result['approvalCreated']);self.assertEqual((root/'authority/fresh35-combined-execution-v1.json').read_bytes(),raw)
   with self.assertRaises(FileExistsError):self.m.delivery(self.plan,source,hashlib.sha256(raw).hexdigest())
 def test_unknown_start_recovers_original_name_only(self):
  root=self.setup_root();r=self.receipt();(root/'start-intent.json').write_text(json.dumps({'operation':self.plan['operationId'],'image':r['image'],'expiresAt':r['expiresAt']}))
  with patch.object(self.m,'read_file',side_effect=self.read_local),patch.object(self.m,'inspect',return_value=self.info()) as seen:self.m.recover_original_cid(self.plan)
  self.assertEqual(seen.call_args.args[0],self.m.NAME);self.assertEqual(json.loads((root/'container-receipt.json').read_text())['cid'],'d'*64)
 def test_standard_apt_simulation_whitelist_exact_versions(self):
  import shlex
  root=self.setup_root();(root/'image-context').mkdir();pq=root/'deploy/runtime/pg/usr/lib/x86_64-linux-gnu/libpq.so.5.17';pq.parent.mkdir(parents=True);pq.write_bytes(b'fixture')
  pkgs=[{'Package':'fixture'+str(i),'Version':'1','SHA256':'a'*64} for i in range(84)]
  with patch.object(self.m,'read_file',return_value=b'fixture'),patch.object(self.m,'LIBPQ_SHA',hashlib.sha256(b'fixture').hexdigest()):ctx=self.m.image_context({'packages':pkgs,'unresolved':[]})
  script=(ctx/'install-locked.sh').read_text();line=next(x for x in script.splitlines() if x.startswith('awk ') and 'apt-simulation' in x)
  simulation=ctx/'apt-simulation.txt';line=line.replace('/work/locked-versions.txt',shlex.quote(str(ctx/'locked-versions.txt'))).replace('/work/apt-simulation.txt',shlex.quote(str(simulation)))
  for row,expected in [('Inst fixture0 (1 Debian [amd64])',0),('Inst unexpected (1 Debian [amd64])',9),('Inst fixture0 (1.0 Debian [amd64])',9)]:
   simulation.write_text(row+'\n');r=subprocess.run(['/bin/sh','-c',line],capture_output=True);self.assertEqual(r.returncode,expected,r.stderr)
if __name__=='__main__':unittest.main()
