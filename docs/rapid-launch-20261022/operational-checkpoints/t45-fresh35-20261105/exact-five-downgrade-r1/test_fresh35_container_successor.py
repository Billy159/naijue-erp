"""Offline model only. No Docker/HTTP/SSH/PG or privileged filesystem action."""
import importlib.util,io,json,hashlib,os,stat,subprocess,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch

FILE=Path(__file__).with_name('fresh35-container-successor.py')
FIXED_OCI_FIXTURE=Path(os.environ.get('ERP_FRESH35_OFFLINE_OCI_FIXTURE',str(FILE.parent.parent/'offline-base-preparation-01/debian-fixed-amd64.named.oci.tar')))
ORIGINAL_RECIPE_FIXTURE=Path(os.environ.get('ERP_FRESH35_ORIGINAL_RECIPE_FIXTURE',str(FILE.with_name('recipe-original-reference.sh'))))
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

 def public_run(self,completed=None,timeout=None):
  self.block.stop();job=self.tmp/'job';(job/'results').mkdir(parents=True)
  mock=patch.object(self.m.subprocess,'run',side_effect=timeout) if timeout else patch.object(self.m.subprocess,'run',return_value=completed)
  return job,mock
 def test_public_failure_retains_stage_exit_and_error(self):
  job,mock=self.public_run(subprocess.CompletedProcess([],1,b'public progress',b'fixed registry: connection refused'))
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):
   self.m.run(['docker','pull','--platform','linux/amd64',self.m.BASE],public_stage='image-pull')
  r=json.loads((job/'results/fresh35-image-pull-command.json').read_text());self.assertEqual(r['stage'],'image-pull');self.assertEqual(r['command'],'docker pull');self.assertEqual(r['exitCode'],1);self.assertIn('connection refused',r['stderr'])
 def test_public_success_preserves_original_stdout_and_inspect_label(self):
  job,mock=self.public_run(subprocess.CompletedProcess([],0,b'actual image metadata',b''))
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock:
   out=self.m.run(['docker','image','inspect','fixed'],public_stage='image-inspect')
  self.assertEqual(out,b'actual image metadata');r=json.loads((job/'results/fresh35-image-inspect-command.json').read_text());self.assertEqual(r['command'],'docker image inspect');self.assertEqual(r['exitCode'],0)
 def test_public_timeout_retains_output_unknown_and_propagates(self):
  error=subprocess.TimeoutExpired(['docker','pull'],3,output=b'layer waiting',stderr=b'network wait');job,mock=self.public_run(timeout=error)
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock,self.assertRaises(subprocess.TimeoutExpired):self.m.run(['docker','pull',self.m.BASE],seconds=3,public_stage='image-pull')
  r=json.loads((job/'results/fresh35-image-pull-command.json').read_text());self.assertIsNone(r['exitCode']);self.assertTrue(r['timedOut']);self.assertEqual(r['outcome'],'UNKNOWN_NO_REPLAY');self.assertEqual(r['stdout'],'layer waiting')
 def test_public_output_redacts_sensitive_lines_and_bounds_tail(self):
  raw=b'public TLS failure\nAuthorization: Bearer hidden-value\nhttps://u:pw@example.test/x\npassword=hidden-pass\n-----BEGIN PRIVATE KEY-----\n'
  out=self.m.public_image_output(raw);self.assertIn('public TLS failure',out)
  for text in ['hidden-value','hidden-pass','u:pw','BEGIN PRIVATE KEY']:self.assertNotIn(text,out)
  self.assertLessEqual(len(self.m.public_image_output(b'x'*20000)),16384)
 def test_private_commands_keep_original_behavior_without_export(self):
  job,mock=self.public_run(subprocess.CompletedProcess([],1,b'sensitive body',b'private failure'))
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.run(['docker','exec','fixed'])
  self.assertEqual(list((job/'results').iterdir()),[])
 def test_public_optin_rejects_nonimage_command_without_running(self):
  self.block.stop()
  with patch.object(self.m.subprocess,'run',side_effect=AssertionError('NO_SUBPROCESS')),self.assertRaisesRegex(ValueError,'FIXED_PUBLIC_IMAGE_COMMAND_REQUIRED'):self.m.run(['docker','exec','fixed'],public_stage='image-pull')


 def resume_fixture(self):
  from types import SimpleNamespace
  m=self.m;root=self.setup_root();root.chmod(0o700);m.PRIVATE=self.tmp/'old-jobs';m.CONTROL=self.tmp/'control';old='t45-f35-5b26-prepare-20261105-01'
  started={'operationId':old,'sourceSet':m.SOURCE,'archiveSHA256':m.ARCHIVE_SHA};(root/'prepare-started.json').write_text(json.dumps(started,sort_keys=True)+'\n')
  prior=m.PRIVATE/old/'results';prior.mkdir(parents=True);(prior/'fresh35-prepare-image-result.json').write_text(json.dumps({'errorCode':'COMMAND_FAILED_1','phase':'prepare-image','status':'STOP_OR_UNKNOWN_NO_REPLAY'}))
  meta=root/'metadata';meta.mkdir();(meta/'deployment-manifest.json').write_bytes(b'manifest-fixture');(meta/'debian-runtime-dependency-lock.json').write_bytes(b'lock-fixture');m.MANIFEST_SHA=hashlib.sha256(b'manifest-fixture').hexdigest();m.LOCK_SHA=hashlib.sha256(b'lock-fixture').hexdigest();(meta/'source-descriptor.json').write_text(json.dumps({'sourceSetSha256':m.SOURCE}))
  ctx=root/'image-context';ctx.mkdir();(ctx/'Dockerfile').write_bytes(b'recipe-fixture');(ctx/'install-locked.sh').write_bytes(b'install-fixture')
  target=m.CONTROL/'artifacts'/m.KEY;target.mkdir(parents=True);props={'st_uid':1000,'st_size':m.ARCHIVE_BYTES,'st_mode':0o100600,'st_nlink':1,'st_dev':1,'st_ino':2,'st_mtime_ns':3,'st_ctime_ns':4};fake=SimpleNamespace(**props)
  ready={'status':'READY','artifactKey':m.KEY,'sourceSetSha256':m.SOURCE,'archiveSha256':m.ARCHIVE_SHA,'archiveBytes':m.ARCHIVE_BYTES,'authoritySha256':self.plan['stagingAuthoritySha256'],'fileIdentity':[1,2,m.ARCHIVE_BYTES,3,4]};(target/'ready.json').write_text(json.dumps(ready))
  def trust(p,*a):return SimpleNamespace(lstat=lambda:fake) if p==target/'archive.bin' else Path(p)
  hashes={b'recipe-fixture':'ca5df9e09e6d5d47f2ea8182a42cbfcb954414ccf73fbaaa59ab70b5eb93d36e',b'install-fixture':'4aa955624d73c6fa1c2a3d040ddf7a740d92c4db32481920bdfe1c5d9328a560'}
  for patcher in [patch.object(m,'trusted',side_effect=trust),patch.object(m,'read_file',side_effect=self.read_local),patch.object(m,'sha',side_effect=lambda b:hashes.get(b,hashlib.sha256(b).hexdigest()))]:patcher.start();self.addCleanup(patcher.stop)
  return root,prior,ctx,ready,target
 def test_resume_exact_retained_root_success_without_materialization(self):
  root,prior,ctx,ready,target=self.resume_fixture();seen=[]
  def command(args,**kw):
   seen.append((args,kw))
   if args[:2]==['docker','build']:(root/'image-resume.iid').write_text('sha256:'+'e'*64);return b''
   if args[:3]==['docker','image','inspect']:return json.dumps({'id':'sha256:'+'e'*64,'os':'linux','arch':'amd64'}).encode()
   return b''
  with patch.object(self.m,'materialize',side_effect=AssertionError('NO_MATERIALIZE')),patch.object(self.m,'run',side_effect=command):r=self.m.resume_image(self.plan)
  self.assertEqual(r['status'],'IMAGE_PREPARED_NO_DB_WINDOW');self.assertEqual([k['public_stage'] for a,k in seen],['image-pull','image-build','image-inspect']);self.assertFalse((root/'image-build-intent.json').exists());self.assertTrue((root/'image-resume-build-intent.json').exists());self.assertEqual((ctx/'Dockerfile').read_bytes(),b'recipe-fixture')
 def test_resume_changed_recipe_or_ready_refused_before_commands(self):
  root,prior,ctx,ready,target=self.resume_fixture();(ctx/'Dockerfile').write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'RETAINED_IMAGE_RECIPE_DIFFERS'):self.m.resume_image(self.plan)
  self.assertFalse((root/'image-resume-intent.json').exists());(ctx/'Dockerfile').write_bytes(b'recipe-fixture');ready['archiveSha256']='0'*64;(target/'ready.json').write_text(json.dumps(ready))
  with self.assertRaisesRegex(ValueError,'EXACT_STAGED_READY_REQUIRED'):self.m.resume_image(self.plan)
 def test_resume_prior_result_or_build_intent_refused(self):
  root,prior,ctx,ready,target=self.resume_fixture();old=(prior/'fresh35-prepare-image-result.json').read_bytes();(prior/'fresh35-prepare-image-result.json').write_bytes(b'{}')
  with self.assertRaisesRegex(ValueError,'ORIGINAL_TERMINAL_PULL_FAILURE_REQUIRED'):self.m.resume_image(self.plan)
  (prior/'fresh35-prepare-image-result.json').write_bytes(old);(root/'image-build-intent.json').write_bytes(b'{}')
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_PRE_BUILD_PULL_FAILURE'):self.m.resume_image(self.plan)
 def test_resume_pull_failure_retains_once_intent_and_never_builds(self):
  root,prior,ctx,ready,target=self.resume_fixture()
  with patch.object(self.m,'run',side_effect=ValueError('COMMAND_FAILED_1')) as call,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.resume_image(self.plan)
  self.assertEqual(call.call_count,1);self.assertEqual(call.call_args.args[0][:2],['docker','pull']);self.assertTrue((root/'image-resume-intent.json').exists());self.assertFalse((root/'image-resume-build-intent.json').exists())
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_PRE_BUILD_PULL_FAILURE'):self.m.resume_image(self.plan)
 def test_resume_expired_or_original_operation_refused(self):
  self.resume_fixture()
  with self.assertRaisesRegex(ValueError,'PREPARATION_DEADLINE_EXPIRED'):self.m.resume_image({**self.plan,'imagePreparationExpiresAt':1})
  with self.assertRaisesRegex(ValueError,'NEW_EXTERNAL_OPERATION_REQUIRED'):self.m.resume_image({**self.plan,'operationId':'t45-f35-5b26-prepare-20261105-01'})


 def offline_fixture(self):
  root,prior,ctx,ready,target=self.resume_fixture();m=self.m;old='t45-f35-5b26-prepare-20261105-01';resume='t45-f35-5b26-resume-image-20261105-01'
  d=m.PRIVATE/resume/'results';d.mkdir(parents=True);(d/'fresh35-resume-image-result.json').write_text(json.dumps({'errorCode':'COMMAND_FAILED_1','phase':'resume-image','status':'STOP_OR_UNKNOWN_NO_REPLAY'}))
  (root/'image-resume-intent.json').write_text(json.dumps({'operationId':resume,'originalOperationId':old,'sourceSet':m.SOURCE,'archive':m.ARCHIVE_SHA,'base':m.BASE,'expiresAt':1793882348609}))
  return root,ctx
 def offline_base(self):return {'id':'sha256:'+'e'*64,'os':'linux','arch':'amd64','repoDigests':[self.m.BASE],'layers':[self.m.BASE_DIFF_ID]}
 def offline_command(self,root,base=None,store=None,load_error=None):
  def command(args,**kw):
   if args[:2]==['docker','info']:return json.dumps(store or {'driver':'overlayfs','driverStatus':[['driver-type','io.containerd.snapshotter.v1']],'osType':'linux','architecture':'x86_64'}).encode()
   if args[:3]==['docker','image','load']:
    if load_error:raise load_error
    return b'Loaded image'
   if args[:2]==['docker','build']:(root/'image-offline.iid').write_text('sha256:'+'f'*64);return b''
   if kw.get('public_stage')=='derived-image-inspect':return json.dumps({'id':'sha256:'+'f'*64,'os':'linux','arch':'amd64'}).encode()
   if args[:3]==['docker','image','inspect']:return json.dumps(base or self.offline_base()).encode()
   raise AssertionError('UNEXPECTED_EXTERNAL_COMMAND')
  return command
 def test_offline_real_named_oci_complete_and_corruption_refused(self):
  raw=FIXED_OCI_FIXTURE.read_bytes();self.m.offline_archive(raw)
  for bad in [raw[:-1],raw[:-1]+bytes([raw[-1]^1])]:
   with self.assertRaisesRegex(ValueError,'FIXED_OFFLINE_ARCHIVE_DIFFERS'):self.m.offline_archive(bad)
 def test_offline_real_named_oci_wrong_annotation_refused(self):
  import tarfile
  raw=FIXED_OCI_FIXTURE.read_bytes()
  with tarfile.open(fileobj=io.BytesIO(raw)) as t:files={m.name:t.extractfile(m).read() for m in t}
  index=json.loads(files['index.json']);index['manifests'][0]['annotations']['io.containerd.image.name']='debian:latest';files['index.json']=json.dumps(index).encode();stream=io.BytesIO()
  with tarfile.open(fileobj=stream,mode='w') as t:
   for n,b in sorted(files.items()):m=tarfile.TarInfo(n);m.mode=0o644;m.size=len(b);t.addfile(m,io.BytesIO(b))
  changed=stream.getvalue()
  # Enter the content checks independently of the outer transport hash.
  with patch.object(self.m,'OFFLINE_SHA',hashlib.sha256(changed).hexdigest()),patch.object(self.m,'OFFLINE_BYTES',len(changed)),self.assertRaisesRegex(ValueError,'FIXED_OCI_LAYOUT_DIFFERS'):self.m.offline_archive(changed)
 def test_offline_load_then_exact_digest_and_original_build_only(self):
  root,ctx=self.offline_fixture()
  with patch.object(self.m,'offline_staged_bytes',return_value=b'validated-image'),patch.object(self.m,'run',side_effect=self.offline_command(root)) as call:r=self.m.offline_load_image(self.plan,'external','a'*64)
  self.assertEqual(r['status'],'IMAGE_PREPARED_NO_DB_WINDOW');args=[c.args[0] for c in call.call_args_list];self.assertFalse(any(a[:2] in [['docker','pull'],['docker','tag'],['docker','run']] for a in args));self.assertEqual(args[1],['docker','image','load','--input',str(root/'offline-base.oci.tar')]);self.assertEqual(args[2][-1],self.m.BASE);self.assertIn('--pull=false',args[3]);self.assertTrue((root/'offline-base-receipt.json').exists());self.assertTrue((root/'image-receipt.json').exists());self.assertEqual((ctx/'Dockerfile').read_bytes(),b'recipe-fixture')
 def test_offline_tag_only_reference_stops_before_build(self):
  root,ctx=self.offline_fixture();bad={**self.offline_base(),'repoDigests':[]}
  with patch.object(self.m,'offline_staged_bytes',return_value=b'validated-image'),patch.object(self.m,'run',side_effect=self.offline_command(root,base=bad)) as call,self.assertRaisesRegex(ValueError,'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED'):self.m.offline_load_image(self.plan,'external','a'*64)
  self.assertFalse(any(c.args[0][:2]==['docker','build'] for c in call.call_args_list));self.assertFalse((root/'image-receipt.json').exists());self.assertTrue((root/'offline-image-intent.json').exists())
 def test_offline_wrong_platform_or_diffid_never_builds(self):
  root,ctx=self.offline_fixture()
  for bad in [{**self.offline_base(),'arch':'arm64'},{**self.offline_base(),'layers':['sha256:'+'0'*64]}]:
   # Each distinct rejection model gets fresh new-operation files locally only.
   for name in ['offline-image-intent.json','offline-base.oci.tar']:
    p=root/name
    if p.exists():p.unlink()
   with patch.object(self.m,'offline_staged_bytes',return_value=b'validated-image'),patch.object(self.m,'run',side_effect=self.offline_command(root,base=bad)) as call,self.assertRaisesRegex(ValueError,'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED'):self.m.offline_load_image(self.plan,'external','a'*64)
   self.assertFalse(any(c.args[0][:2]==['docker','build'] for c in call.call_args_list))
 def test_offline_unsupported_store_refuses_before_load(self):
  root,ctx=self.offline_fixture()
  with patch.object(self.m,'offline_staged_bytes',side_effect=AssertionError('NO_ARTIFACT_READ')),patch.object(self.m,'run',side_effect=self.offline_command(root,store={'driver':'overlay2','driverStatus':[],'osType':'linux','architecture':'x86_64'})) as call,self.assertRaisesRegex(ValueError,'EXACT_CONTAINERD_IMAGE_STORE_REQUIRED'):self.m.offline_load_image(self.plan,'external','a'*64)
  self.assertEqual(call.call_count,1);self.assertFalse((root/'offline-image-intent.json').exists())
 def test_offline_load_timeout_no_retry_or_build(self):
  root,ctx=self.offline_fixture()
  with patch.object(self.m,'offline_staged_bytes',return_value=b'validated-image'),patch.object(self.m,'run',side_effect=self.offline_command(root,load_error=subprocess.TimeoutExpired(['docker','image','load'],1))) as call,self.assertRaises(subprocess.TimeoutExpired):self.m.offline_load_image(self.plan,'external','a'*64)
  self.assertEqual(call.call_count,2);self.assertFalse((root/'offline-base-receipt.json').exists());self.assertFalse((root/'image-receipt.json').exists())
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_FAILED_PULL_OFFLINE_STATE'):self.m.offline_load_image(self.plan,'external','a'*64)
 def test_offline_changed_recipe_or_existing_build_refused(self):
  root,ctx=self.offline_fixture();(ctx/'Dockerfile').write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'RETAINED_IMAGE_RECIPE_DIFFERS'):self.m.offline_load_image(self.plan,'external','a'*64)
  (ctx/'Dockerfile').write_bytes(b'recipe-fixture');(root/'image-resume-build-intent.json').write_bytes(b'{}')
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_FAILED_PULL_OFFLINE_STATE'):self.m.offline_load_image(self.plan,'external','a'*64)
 def test_offline_missing_original_failure_or_expired_plan_refused(self):
  root,ctx=self.offline_fixture();(self.m.PRIVATE/'t45-f35-5b26-resume-image-20261105-01/results/fresh35-resume-image-result.json').write_bytes(b'{}')
  with self.assertRaisesRegex(ValueError,'ORIGINAL_TERMINAL_PULL_FAILURE_REQUIRED'):self.m.offline_load_image(self.plan,'external','a'*64)
  with self.assertRaisesRegex(ValueError,'PREPARATION_DEADLINE_EXPIRED'):self.m.offline_load_image({**self.plan,'imagePreparationExpiresAt':1},'external','a'*64)
 def test_offline_load_failure_emits_bounded_public_diagnostic(self):
  job,mock=self.public_run(subprocess.CompletedProcess([],1,b'public OCI format error',b'load refused'))
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.run(['docker','image','load','--input','fixed'],public_stage='image-load')
  r=json.loads((job/'results/fresh35-image-load-command.json').read_text());self.assertEqual(r['command'],'docker image load');self.assertEqual(r['exitCode'],1);self.assertEqual(r['stderr'],'load refused')


 def test_offline_staging_exact_external_root_ready_and_identity(self):
  from types import SimpleNamespace
  m=self.m;m.CONTROL=self.tmp/'control';target=m.CONTROL/'artifacts'/m.OFFLINE_KEY;external=self.tmp/'external.json';policy=Path('/usr/local/lib/naijue-erp-night/grant-'+m.GRANT+'/artifact-staging-authorization.json')
  authority={'format':'T45_ORDINARY_ARTIFACT_STAGING_V1','decision':'AUTHORIZE_EXACT_ORDINARY_ARTIFACT_STAGING','taskId':'T45','grantId':m.GRANT,'artifactKey':m.OFFLINE_KEY,'sourceSetSha256':m.SOURCE,'archiveSha256':m.OFFLINE_SHA,'archiveBytes':m.OFFLINE_BYTES,'targetDirectory':str(target),'startsAt':1,'expiresAt':2,'decisionReference':'synthetic existing issued input fixture','kind':'ORDINARY_SOURCE_AND_TOOLS'}
  raw=json.dumps(authority).encode();digest=hashlib.sha256(raw).hexdigest();ready={'status':'READY','artifactKey':m.OFFLINE_KEY,'sourceSetSha256':m.SOURCE,'archiveSha256':m.OFFLINE_SHA,'archiveBytes':m.OFFLINE_BYTES,'authoritySha256':digest,'fileIdentity':[1,2,m.OFFLINE_BYTES,3,4]}
  values={external:raw,policy:raw,target/'ready.json':json.dumps(ready).encode(),target/'archive.bin':b'validated-public-archive'}
  props={'st_uid':1000,'st_mode':0o100600,'st_nlink':1,'st_dev':1,'st_ino':2,'st_size':m.OFFLINE_BYTES,'st_mtime_ns':3,'st_ctime_ns':4}
  with patch.object(m,'job_input',side_effect=lambda p:p),patch.object(m,'read_file',side_effect=lambda p,*a,**k:values[target/'archive.bin'] if isinstance(p,SimpleNamespace) else values[Path(p)]),patch.object(m,'trusted',return_value=SimpleNamespace(lstat=lambda:SimpleNamespace(**props))),patch.object(m,'offline_archive') as proof:
   self.assertEqual(m.offline_staged_bytes(external,digest),b'validated-public-archive');proof.assert_called_once_with(b'validated-public-archive')
   values[policy]=b'other policy'
   with self.assertRaisesRegex(ValueError,'INDEPENDENT_ROOT_STAGING_BYTES_DIFFER'):m.offline_staged_bytes(external,digest)
   values[policy]=raw;ready['authoritySha256']='0'*64;values[target/'ready.json']=json.dumps(ready).encode()
   with self.assertRaisesRegex(ValueError,'EXACT_OFFLINE_READY_REQUIRED'):m.offline_staged_bytes(external,digest)
   ready['authoritySha256']=digest;values[target/'ready.json']=json.dumps(ready).encode();props['st_uid']=0
   with self.assertRaisesRegex(ValueError,'OFFLINE_STAGED_IDENTITY_CHANGED'):m.offline_staged_bytes(external,digest)


 def local_context_fixture(self):
  from types import SimpleNamespace
  m=self.m;root,ctx=self.offline_fixture();old='t45-f35-5b26-prepare-20261105-01';resume='t45-f35-5b26-resume-image-20261105-01';offline='t45-f35-5b26-offline-load-image-20261105-01';d=m.PRIVATE/offline/'results';d.mkdir(parents=True)
  (d/'fresh35-offline-load-image-result.json').write_text(json.dumps({'errorCode':'COMMAND_FAILED_1','phase':'offline-load-image','status':'STOP_OR_UNKNOWN_NO_REPLAY'}))
  prior={'command':'docker build','stage':'image-build','exitCode':1,'timedOut':False,'stdout':'','stderr':m.BASE+'\nDockerfile:1\nload metadata\nhttps://registry-1.docker.io/v2/library/debian/manifests/sha256:'+m.BASE_MANIFEST_SHA+'\nconnection reset by peer'};(d/'fresh35-image-build-command.json').write_text(json.dumps(prior))
  (root/'offline-image-intent.json').write_text(json.dumps({'operationId':offline,'originalOperationId':old,'resumeOperationId':resume,'sourceSet':m.SOURCE,'offlineArchive':m.OFFLINE_SHA,'base':m.BASE,'expiresAt':1793884588020}));(root/'offline-image-build-intent.json').write_text(json.dumps({'base':m.BASE,'operation':offline}))
  (root/'offline-base-receipt.json').write_text(json.dumps({'base':m.BASE,'actualBaseImageID':'sha256:'+m.BASE_MANIFEST_SHA,'layers':[m.BASE_DIFF_ID],'archive':m.OFFLINE_SHA,'operationId':offline,'loadedExactBase':True}));(root/'offline-base.oci.tar').write_bytes(FIXED_OCI_FIXTURE.read_bytes())
  for key,digest,size,auth in [(m.KEY,m.ARCHIVE_SHA,m.ARCHIVE_BYTES,self.plan['stagingAuthoritySha256']),(m.OFFLINE_KEY,m.OFFLINE_SHA,m.OFFLINE_BYTES,'a24505c9670723303c24dbd9ccf39da9a152ef8f3a92a1226a0ae85c4a83025a')]:
   target=m.CONTROL/'artifacts'/key;target.mkdir(parents=True,exist_ok=True);(target/'ready.json').write_text(json.dumps({'status':'READY','artifactKey':key,'sourceSetSha256':m.SOURCE,'archiveSha256':digest,'archiveBytes':size,'authoritySha256':auth,'fileIdentity':[1,2,size,3,4]}))
  def trust(p,*a):
   if p.name=='archive.bin':
    size=m.ARCHIVE_BYTES if p.parent.name==m.KEY else m.OFFLINE_BYTES
    return SimpleNamespace(lstat=lambda:SimpleNamespace(st_uid=1000,st_size=size,st_mode=0o100600,st_nlink=1,st_dev=1,st_ino=2,st_mtime_ns=3,st_ctime_ns=4))
   return p
  patcher=patch.object(m,'trusted',side_effect=trust);patcher.start();self.addCleanup(patcher.stop)
  job=self.tmp/'context-job';(job/'results').mkdir(parents=True);patcher=patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)});patcher.start();self.addCleanup(patcher.stop)
  return root,ctx,job,d
 def local_context_command(self,root,job,version=None,builder=None,base=None,build_error=None,head=False):
  def command(args,**kw):
   if args==['docker','buildx','version']:return (version or 'github.com/docker/buildx v0.37.1 0b265a9f62db554fa9aba6dd19e1bd5704bc7d8a').encode()
   if args==['docker','buildx','inspect','default']:return (builder or 'Name: default\nDriver: docker\nName: default\nStatus: running\nBuildKit version: v0.33.1\nPlatforms: linux/amd64, linux/amd64/v2, linux/amd64/v3').encode()
   if args[:3]==['docker','buildx','build']:
    if build_error:raise build_error
    (root/'image-local-oci-context-r1.iid').write_text('sha256:'+'f'*64);(job/'results/fresh35-local-context-build-command.json').write_text(json.dumps({'stdout':'','stderr':'Head https://registry-1.docker.io/v2/library/debian/' if head else '[context debian] OCI load from client','exitCode':0}));return b''
   if kw.get('public_stage')=='derived-image-inspect':return json.dumps({'id':'sha256:'+'f'*64,'os':'linux','arch':'amd64'}).encode()
   if args[:3]==['docker','image','inspect']:return json.dumps(base or {**self.offline_base(),'id':'sha256:'+self.m.BASE_MANIFEST_SHA}).encode()
   raise AssertionError('UNEXPECTED_COMMAND')
  return command
 def test_local_context_exact_command_five_members_no_load_pull_from_change(self):
  root,ctx,job,prior=self.local_context_fixture();before=(ctx/'Dockerfile').read_bytes()
  with patch.object(self.m,'run',side_effect=self.local_context_command(root,job)) as call:r=self.m.build_local_oci_context(self.plan)
  self.assertEqual(r['status'],'IMAGE_PREPARED_NO_DB_WINDOW');calls=[c.args[0] for c in call.call_args_list];build=next(a for a in calls if a[:3]==['docker','buildx','build']);layout=root/'local-base-oci-context-r1';self.assertEqual(build,['docker','buildx','build','--builder','default','--platform','linux/amd64','--pull=false','--build-context',self.m.BASE+'=oci-layout://'+str(layout)+'@sha256:'+self.m.BASE_MANIFEST_SHA,'--iidfile',str(root/'image-local-oci-context-r1.iid'),str(ctx)]);self.assertEqual(len([p for p in layout.rglob('*') if p.is_file()]),5);self.assertEqual((ctx/'Dockerfile').read_bytes(),before);self.assertTrue((root/'offline-image-build-intent.json').exists());self.assertTrue(json.loads((root/'image-receipt.json').read_text())['localOCIContext']);self.assertFalse(any(a[:2] in [['docker','pull'],['docker','load'],['docker','tag'],['docker','run']] or a[:3]==['docker','image','load'] for a in calls))
 def test_local_context_wrong_buildx_version_stops_before_intent(self):
  root,ctx,job,prior=self.local_context_fixture()
  with patch.object(self.m,'run',side_effect=self.local_context_command(root,job,version='github.com/docker/buildx wrong')) as call,self.assertRaisesRegex(ValueError,'EXACT_BUILDX_VERSION_REQUIRED'):self.m.build_local_oci_context(self.plan)
  self.assertEqual(call.call_count,1);self.assertFalse((root/'local-oci-context-intent-r1.json').exists())
 def test_local_context_wrong_builder_or_worker_refused(self):
  root,ctx,job,prior=self.local_context_fixture()
  for builder in ['Name: default\nDriver: docker-container\nStatus: running','Name: default\nDriver: docker\nName: default\nStatus: running\nBuildKit version: v0.32.0\nPlatforms: linux/amd64']:
   with patch.object(self.m,'run',side_effect=self.local_context_command(root,job,builder=builder)),self.assertRaisesRegex(ValueError,'EXACT_EXISTING_BUILDER_REQUIRED'):self.m.build_local_oci_context(self.plan)
  self.assertFalse((root/'local-base-oci-context-r1').exists())
 def test_local_context_wrong_base_diffid_or_missing_digest_refused(self):
  root,ctx,job,prior=self.local_context_fixture()
  for change in [{'repoDigests':[]},{'layers':['sha256:'+'0'*64]},{'arch':'arm64'}]:
   bad={**self.offline_base(),'id':'sha256:'+self.m.BASE_MANIFEST_SHA,**change}
   with patch.object(self.m,'run',side_effect=self.local_context_command(root,job,base=bad)),self.assertRaisesRegex(ValueError,'LOADED_EXACT_BASE_REFERENCE_PLATFORM_DIFFID_REQUIRED'):self.m.build_local_oci_context(self.plan)
  self.assertFalse((root/'local-oci-context-intent-r1.json').exists())
 def test_local_context_only_exact_metadata_failure_chain_admitted(self):
  root,ctx,job,prior=self.local_context_fixture();p=prior/'fresh35-image-build-command.json';v=json.loads(p.read_text());v['stderr']='APT failed later';p.write_text(json.dumps(v))
  with self.assertRaisesRegex(ValueError,'ORIGINAL_FROM_METADATA_FAILURE_REQUIRED'):self.m.build_local_oci_context(self.plan)
 def test_local_context_recipe_snapshot_and_existing_marker_refused(self):
  root,ctx,job,prior=self.local_context_fixture();(ctx/'Dockerfile').write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'RETAINED_IMAGE_RECIPE_DIFFERS'):self.m.build_local_oci_context(self.plan)
  (ctx/'Dockerfile').write_bytes(b'recipe-fixture');snapshot=root/'offline-base.oci.tar';raw=snapshot.read_bytes();snapshot.write_bytes(raw[:-1])
  with self.assertRaisesRegex(ValueError,'FIXED_OFFLINE_ARCHIVE_DIFFERS'):self.m.build_local_oci_context(self.plan)
  snapshot.write_bytes(raw);(root/'local-base-oci-context-r1').mkdir()
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_LOCAL_CONTEXT_RETRY_STATE'):self.m.build_local_oci_context(self.plan)
 def test_local_context_session_failure_retains_once_no_fallback(self):
  root,ctx,job,prior=self.local_context_fixture()
  with patch.object(self.m,'run',side_effect=self.local_context_command(root,job,build_error=ValueError('COMMAND_FAILED_1'))) as call,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.build_local_oci_context(self.plan)
  self.assertTrue((root/'local-oci-context-intent-r1.json').exists());self.assertTrue((root/'local-base-oci-context-r1').is_dir());self.assertFalse((root/'image-receipt.json').exists());self.assertEqual(len([c for c in call.call_args_list if c.args[0][:3]==['docker','buildx','build']]),1)
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_LOCAL_CONTEXT_RETRY_STATE'):self.m.build_local_oci_context(self.plan)
 def test_local_context_remote_head_even_success_exit_refused(self):
  root,ctx,job,prior=self.local_context_fixture()
  with patch.object(self.m,'run',side_effect=self.local_context_command(root,job,head=True)),self.assertRaisesRegex(ValueError,'REMOTE_METADATA_OBSERVED_NO_FALLBACK'):self.m.build_local_oci_context(self.plan)
  self.assertFalse((root/'image-receipt.json').exists())
 def test_local_context_builder_timeout_no_build_or_intent(self):
  root,ctx,job,prior=self.local_context_fixture()
  with patch.object(self.m,'run',side_effect=subprocess.TimeoutExpired(['docker','buildx','version'],1)) as call,self.assertRaises(subprocess.TimeoutExpired):self.m.build_local_oci_context(self.plan)
  self.assertEqual(call.call_count,1);self.assertFalse((root/'local-oci-context-intent-r1.json').exists())
 def test_local_context_expired_or_old_operation_refused(self):
  root,ctx,job,prior=self.local_context_fixture()
  with self.assertRaisesRegex(ValueError,'PREPARATION_DEADLINE_EXPIRED'):self.m.build_local_oci_context({**self.plan,'imagePreparationExpiresAt':1})
  with self.assertRaisesRegex(ValueError,'NEW_EXTERNAL_OPERATION_REQUIRED'):self.m.build_local_oci_context({**self.plan,'operationId':'t45-f35-5b26-offline-load-image-20261105-01'})
 def test_local_context_build_error_log_and_builder_output_filter(self):
  job,mock=self.public_run(subprocess.CompletedProcess([],1,b'public OCI session failure',b'content store session unavailable'))
  with patch.dict(os.environ,{'ERP_SHARED_JOB_DIR':str(job)}),mock,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.run(['docker','buildx','build','--builder','default'],public_stage='local-context-build')
  r=json.loads((job/'results/fresh35-local-context-build-command.json').read_text());self.assertEqual(r['command'],'docker buildx build');self.assertIn('session unavailable',r['stderr']);self.assertEqual(r['exitCode'],1)
  public=self.m.public_image_output('Name: default\nDriver: docker\nEndpoint: hidden-endpoint\nDriver Options: hidden-options','builder-inspect');self.assertNotIn('hidden-endpoint',public);self.assertNotIn('hidden-options',public);self.assertIn('Driver: docker',public);self.assertEqual(self.m.public_image_output('ERROR: worker unavailable','builder-inspect'),'ERROR: worker unavailable')


 def run_exact_five_guard(self,change=None):
  import shlex
  m=self.m;root=self.tmp/('guard-'+str(time.time_ns()));root.mkdir();work=root/'work';work.mkdir();bins=root/'bin';bins.mkdir()
  text=ORIGINAL_RECIPE_FIXTURE.read_text();line=next(x for x in text.splitlines() if x.startswith('apt-get --simulate '));args=shlex.split(line);specs=args[args.index('install')+1:args.index('>')];locked=dict(x.split('=',1) for x in specs);self.assertEqual(len(locked),84)
  installed=dict(locked)
  for name,(old,target) in m.EXACT_DOWNGRADES.items():self.assertEqual(locked[name],target);installed[name]=old
  selections={n:'install' for n in locked};rows=[]
  for name,(old,target) in sorted(m.EXACT_DOWNGRADES.items()):rows.extend(['Inst '+name+' ['+old+'] ('+target+' Debian [amd64])','Conf '+name+' ('+target+' Debian [amd64])'])
  if change:change(locked,installed,selections,rows)
  (work/'locked-versions.txt').write_text(''.join(n+' '+v+'\n' for n,v in locked.items()));(work/'apt-simulation.txt').write_text('\n'.join(rows)+'\n');(root/'installed').write_text(''.join(n+' '+v+' installed\n' for n,v in installed.items()));(root/'selections').write_text(''.join(n+' '+v+'\n' for n,v in selections.items()))
  (bins/'dpkg-query').write_text('#!/bin/sh\ncat '+shlex.quote(str(root/'installed'))+'\n')
  # Test fixture only: these vectors are equal or known-higher versions; the
  # production guard calls real dpkg --compare-versions, not this shim.
  (bins/'dpkg').write_text('#!/bin/sh\nif test "$1" = --get-selections; then cat '+shlex.quote(str(root/'selections'))+'; exit 0; fi\ntest "$1" = --compare-versions && test "$3" = gt || exit 2\ntest "$2" != "$4"\n')
  for p in bins.iterdir():p.chmod(0o755)
  script=work/'guard.sh';script.write_text('set -eu\n'+m.exact_five_guard().replace('/work',str(work)))
  env=dict(os.environ);env['PATH']=str(bins)+os.pathsep+env['PATH'];return subprocess.run(['/bin/sh',str(script)],capture_output=True,text=True,env=env),work
 def test_exact_five_shell_accepts_only_five_original_versions(self):
  r,w=self.run_exact_five_guard();self.assertEqual(r.returncode,0,r.stderr);self.assertIn('EXACT_FIVE_BASE_TO_LOCK_DOWNGRADES_VERIFIED',r.stdout);self.assertEqual(len((w/'exact-five-observed.txt').read_text().splitlines()),5)
 def test_exact_five_shell_extra_or_wrong_base_downgrade_refused(self):
  def extra(locked,installed,selections,rows):n=next(n for n in locked if n not in self.m.EXACT_DOWNGRADES);installed[n]='999:'+locked[n]
  def wrong(locked,installed,selections,rows):installed['tzdata']='999:'+locked['tzdata']
  for change in [extra,wrong]:
   r,w=self.run_exact_five_guard(change);self.assertEqual(r.returncode,9,r.stderr)
 def test_exact_five_shell_hold_remove_extra_configure_or_target_refused(self):
  def held(l,i,s,r):s['tzdata']='hold'
  def removal(l,i,s,r):r.append('Remv tzdata ['+i['tzdata']+']')
  def extra(l,i,s,r):r.append('Conf unapproved-package (1 Debian [amd64])')
  def wrong(l,i,s,r):r[0]=r[0].replace(self.m.EXACT_DOWNGRADES['liblzma5'][1],'999')
  for change in [held,removal,extra,wrong]:
   r,w=self.run_exact_five_guard(change);self.assertEqual(r.returncode,9,r.stderr)
 def test_exact_five_shell_missing_solver_action_or_missing_downgrade_refused(self):
  def missing(l,i,s,r):r[:]=[x for x in r if not x.startswith('Inst tzdata ')]
  def absent(l,i,s,r):i['tzdata']=l['tzdata']
  for change in [missing,absent]:
   r,w=self.run_exact_five_guard(change);self.assertEqual(r.returncode,9,r.stderr)
 def test_exact_five_real_recipe_only_guard_and_two_command_flags(self):
  old=ORIGINAL_RECIPE_FIXTURE.read_bytes();new=self.m.exact_five_recipe(old);text=new.decode();self.assertEqual(text.count('--allow-downgrades'),2);self.assertIn('apt-get -y --allow-downgrades --download-only ',text);self.assertIn('apt-get -y --allow-downgrades --no-download ',text);self.assertLess(text.index('EXACT_FIVE_BASE_TO_LOCK_DOWNGRADES_VERIFIED'),text.index('apt-get -y --allow-downgrades'));self.assertNotIn('--allow-unauthenticated',text);self.assertNotIn('--allow-change-held-packages',text);self.assertEqual(next(x for x in old.decode().splitlines() if x.startswith('apt-get --simulate ')),next(x for x in text.splitlines() if x.startswith('apt-get --simulate ')))
  p=self.tmp/'new.sh';p.write_bytes(new);self.assertEqual(subprocess.run(['/bin/sh','-n',str(p)],capture_output=True).returncode,0)
 def exact_five_fixture(self):
  root,ctx,job,prior=self.local_context_fixture();m=self.m;local='t45-f35-5b26-local-oci-context-20261105-01';d=m.PRIVATE/local/'results';d.mkdir(parents=True);(d/'fresh35-build-local-oci-context-result.json').write_text(json.dumps({'errorCode':'COMMAND_FAILED_1','phase':'build-local-oci-context','status':'STOP_OR_UNKNOWN_NO_REPLAY'}))
  (d/'fresh35-local-context-build-command.json').write_text(json.dumps({'command':'docker buildx build','stage':'local-context-build','exitCode':1,'timedOut':False,'stderr':'OCI load from client\nInRelease\nPackages were downgraded and -y was used without --allow-downgrades\n'+' '.join(m.EXACT_DOWNGRADES)}))
  (root/'local-oci-context-intent-r1.json').write_text(json.dumps({'operationId':local,'priorOfflineOperationId':'t45-f35-5b26-offline-load-image-20261105-01','sourceSet':m.SOURCE,'base':m.BASE,'offlineArchive':m.OFFLINE_SHA,'expiresAt':1793886377837}));(ctx/'install-locked.sh').write_bytes(ORIGINAL_RECIPE_FIXTURE.read_bytes());layout=root/'local-base-oci-context-r1';layout.mkdir(mode=0o700)
  import tarfile
  with tarfile.open(fileobj=io.BytesIO(FIXED_OCI_FIXTURE.read_bytes())) as t:
   for member in t:p=layout/member.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(t.extractfile(member).read())
  return root,ctx,job,d
 def exact_five_command(self,root,job,error=None):
  original=self.local_context_command(root,job)
  def command(args,**kw):
   if args[:3]==['docker','buildx','build']:
    if error:raise error
    Path(args[args.index('--iidfile')+1]).write_text('sha256:'+'f'*64);(job/'results/fresh35-exact-five-build-command.json').write_text(json.dumps({'stdout':'EXACT_FIVE_BASE_TO_LOCK_DOWNGRADES_VERIFIED','stderr':'','exitCode':0}));return b''
   return original(args,**kw)
  return command
 def test_exact_five_build_new_recipe_preserves_old_context_and_digest(self):
  root,ctx,job,prior=self.exact_five_fixture();old=(ctx/'install-locked.sh').read_bytes()
  with patch.object(self.m,'run',side_effect=self.exact_five_command(root,job)) as call:r=self.m.build_exact_five_downgrades(self.plan)
  newctx=root/'image-context-exact-five-r1';self.assertEqual((ctx/'install-locked.sh').read_bytes(),old);self.assertEqual((newctx/'install-locked.sh').read_bytes(),self.m.exact_five_recipe(old));self.assertEqual((ctx/'Dockerfile').read_bytes(),(newctx/'Dockerfile').read_bytes());self.assertTrue(r['exactFiveDowngrades']);commands=[c.args[0] for c in call.call_args_list];build=next(a for a in commands if a[:3]==['docker','buildx','build']);self.assertEqual(build[-1],str(newctx));self.assertIn(self.m.BASE+'=oci-layout://'+str(root/'local-base-oci-context-r1')+'@sha256:'+self.m.BASE_MANIFEST_SHA,build);self.assertFalse(any(a[:2] in [['docker','pull'],['docker','load'],['docker','run']] or a[:3]==['docker','image','load'] for a in commands))
 def test_exact_five_wrong_failure_chain_refused_before_commands(self):
  root,ctx,job,prior=self.exact_five_fixture();p=prior/'fresh35-local-context-build-command.json';v=json.loads(p.read_text());v['stderr']='other failure';p.write_text(json.dumps(v))
  with self.assertRaisesRegex(ValueError,'ORIGINAL_EXACT_FIVE_DOWNGRADE_FAILURE_REQUIRED'):self.m.build_exact_five_downgrades(self.plan)
 def test_exact_five_existing_recipe_or_iid_refused(self):
  root,ctx,job,prior=self.exact_five_fixture();(root/'image-context-exact-five-r1').mkdir()
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_EXACT_FIVE_RETRY_STATE'):self.m.build_exact_five_downgrades(self.plan)
 def test_exact_five_failed_build_keeps_new_intent_no_retry_or_receipt(self):
  root,ctx,job,prior=self.exact_five_fixture();old=(ctx/'install-locked.sh').read_bytes()
  with patch.object(self.m,'run',side_effect=self.exact_five_command(root,job,error=ValueError('COMMAND_FAILED_1'))) as call,self.assertRaisesRegex(ValueError,'COMMAND_FAILED_1'):self.m.build_exact_five_downgrades(self.plan)
  self.assertTrue((root/'exact-five-downgrade-intent-r1.json').exists());self.assertTrue((root/'image-context-exact-five-r1').exists());self.assertEqual((ctx/'install-locked.sh').read_bytes(),old);self.assertFalse((root/'image-receipt.json').exists());self.assertEqual(len([c for c in call.call_args_list if c.args[0][:3]==['docker','buildx','build']]),1)
  with self.assertRaisesRegex(ValueError,'NOT_ORIGINAL_EXACT_FIVE_RETRY_STATE'):self.m.build_exact_five_downgrades(self.plan)
 def test_exact_five_expired_plan_refused(self):
  with self.assertRaisesRegex(ValueError,'PREPARATION_DEADLINE_EXPIRED'):self.m.build_exact_five_downgrades({**self.plan,'imagePreparationExpiresAt':1})

if __name__=='__main__':unittest.main()
