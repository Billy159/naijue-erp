"""Offline synthetic carrier metadata; no Docker, PG, root, credentials or network."""
import ast,copy,hashlib,json,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).parent

def load(path,name):
 m=types.ModuleType(name);m.__file__=str(path);exec(compile(path.read_bytes(),str(path),'exec'),m.__dict__);return m
m=load(HERE/'fresh35-container-successor.py','carrier_source')

class ProductionCarrier(unittest.TestCase):
 def plan(self):return {'enabled':True,'authorizationReference':'OFFLINE FIXTURE ONLY','operationId':'fixture-create','opsSourceSha256':hashlib.sha256(Path(m.__file__).read_bytes()).hexdigest(),'stagingAuthoritySha256':'f'*64,'imagePreparationExpiresAt':1793921934994,'productionCarrier':{'format':'FRESH35_PRODUCTION_CONTAINER_V2','front':{'id':'a'*64,'name':'naijue-prod-front'},'futureAppName':'naijue-rewrite-offline-app'}}
 def test_explicit_production_scope_refuses_r6_defaults_and_unknown_fields(self):
  p=self.plan();raw=json.dumps(p).encode()
  with patch.object(m,'job_input',side_effect=lambda p:Path(p)),patch.object(m,'read_file',return_value=raw):
   with self.assertRaisesRegex(ValueError,'INDEPENDENT_PRODUCTION_ROOT_AND_NAME'):m.load_production_plan('/fixed/plan.json',m.sha(raw))
   with patch.object(m,'ROOT',Path('/fixed/phaseb-application-production-fixture')),patch.object(m,'NAME','t45-fresh35-production-fixture'):self.assertEqual(m.load_production_plan('/fixed/plan.json',m.sha(raw)),p)
  for edit in [lambda p:p['productionCarrier'].update(extra=True),lambda p:p['productionCarrier']['front'].update(name='new-network'),lambda p:p['productionCarrier'].update(futureAppName='old-app')]:
   bad=copy.deepcopy(p);edit(bad);raw=json.dumps(bad).encode()
   with patch.object(m,'job_input',side_effect=lambda p:Path(p)),patch.object(m,'read_file',return_value=raw),self.assertRaises(ValueError):m.load_production_plan('/fixed/plan.json',m.sha(raw))
 def test_new_carrier_starts_on_front_with_alias_and_original_budget_without_pg_publish(self):
  p=self.plan();a={'serviceLease':{'expiresAt':1793930000000}}
  with patch.object(m,'ROOT',Path('/fixed/phaseb-application-production-fixture')),patch.object(m,'NAME','t45-fresh35-production-fixture'):
   old=m.common(m.ENV_IMAGE,1800,p['operationId']);args=m.production_common(m.ENV_IMAGE,1800,p,a)
  self.assertEqual(old[old.index('--network')+1],'none');self.assertNotIn('--network-alias',old)
  self.assertEqual(args[:2],['docker','run']);self.assertEqual(args[args.index('--network')+1],p['productionCarrier']['front']['id']);self.assertEqual(args[args.index('--network-alias')+1],p['productionCarrier']['futureAppName'])
  self.assertNotIn('--publish',args);self.assertNotIn('-p',args);self.assertEqual(args[args.index('--memory')+1],'3g');self.assertEqual(args[args.index('--pids-limit')+1],'256')
  self.assertIn('t45.production-service-expires-at='+str(a['serviceLease']['expiresAt']),args)
  self.assertTrue(any('dst='+m.PRODUCTION_STATE in x for x in args));self.assertFalse(any(('dst='+m.STATE) in x for x in args))
 def test_front_collision_uses_dns_equivalence_without_mutations(self):
  p=self.plan();peer='b'*64
  for by_name in [False,True]:
   network={'Id':'a'*64,'Name':'naijue-prod-front','Driver':'bridge','Internal':True,'Containers':{peer:{'EndpointID':'c'*64}}}
   data={'name':'/'+p['productionCarrier']['futureAppName'].upper() if by_name else '/other','networks':{'naijue-prod-front':{'Aliases':[] if by_name else [p['productionCarrier']['futureAppName'].upper()]}}};calls=[]
   def run(args):
    calls.append(args);return json.dumps(network if args[1:3]==['network','inspect'] else data).encode()
   with self.subTest(by_name=by_name),patch.object(m,'run',side_effect=run),self.assertRaisesRegex(ValueError,'APP_ALIAS_CONFLICT'):m.production_front(p)
   self.assertTrue(all(x[1] in ['network','inspect'] for x in calls));self.assertFalse(any('connect' in x or 'disconnect' in x or 'create' in x for x in calls))
 def test_mismatched_external_authority_never_creates_or_imports(self):
  with patch.object(m,'environment_image',return_value={'image':m.ENV_IMAGE}),patch.object(m,'verify_materialized_application'),patch.object(m,'job_input',side_effect=lambda p:Path(p)),patch.object(m,'read_file',return_value=b'{}'),patch.object(m,'production_authority') as authority,patch.object(m,'run') as run:
   with self.assertRaisesRegex(ValueError,'EXTERNAL_PRODUCTION_AUTHORITY_DIFFERS'):m.production_start(self.plan(),'/fixed/input.json','0'*64)
   authority.assert_not_called();run.assert_not_called()
 def test_synthetic_functions_remain_exact_original_ast(self):
  funcs=lambda p:{n.name:ast.dump(n) for n in ast.parse(p.read_bytes()).body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
  old=funcs(HERE/'parent-fresh35-container-successor.py');new=funcs(HERE/'fresh35-container-successor.py')
  self.assertEqual([k for k in old if old[k]!=new[k]],['main'])
 def test_start_preserves_existing_full_cleanup_reserve_at_fractional_second_boundary(self):
  p=self.plan();now_ms=1000000;cid='d'*64;raw=b'{"fixture":true}'
  a={'serviceLease':{'expiresAt':now_ms+100499},'expiresAt':now_ms+95000,'proposal':{'workspaceDirectory':m.PRODUCTION_STATE+'/fixture-production'}}
  before={'Containers':{}};after={'Containers':{cid:{'EndpointID':'e'*64}}}
  def run(args,*unused,**kw):
   if args[:2]==['docker','ps']:return b''
   if args[:2]==['docker','run']:return cid.encode()
   if args[:2]==['docker','exec']:return b''
   raise AssertionError('UNEXPECTED_DOCKER')
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'authority').mkdir();work=root/'state/fixture-production';work.mkdir(parents=True);(work/'creation-facts.json').write_text('{}')
   with patch.object(m,'ROOT',root),patch.object(m,'NAME','t45-fresh35-production-fixture'),patch.object(m.time,'time',return_value=now_ms/1000),patch.object(m,'environment_image',return_value={'image':m.ENV_IMAGE}),patch.object(m,'verify_materialized_application'),patch.object(m,'job_input',side_effect=lambda x:Path(x)),patch.object(m,'read_file',return_value=raw),patch.object(m,'production_authority',return_value=(a,None)),patch.object(m,'production_front',side_effect=[before,after]),patch.object(m,'production_info',return_value={}),patch.object(m,'owned_production'),patch.object(m,'production_facts',return_value={'status':'FIXTURE_FACTS_ONLY'}),patch.object(m,'run',side_effect=run),patch.object(m,'production_common',wraps=m.production_common) as build:
    m.production_start(p,'/fixed/c14.json',m.sha(raw))
    self.assertEqual(build.call_args.args[1],131)
    self.assertEqual(build.call_args.args[3]['serviceLease']['expiresAt'],now_ms+100499)
 def test_plan_binding_requires_native_durable_record_retained_service_and_live_pg(self):
  base=Path('/Users/billy/.codex/worktrees/erp-0448z-integration/erp-e5c5a762-cleaning-20261102/candidate0448/tests/test_fresh35_production_launcher.py')
  fixture=load(base,'pure_retention_fixture');a,target,descriptor,record,recordraw,result=fixture.ProductionLauncherTests().record_fixture();p=self.plan();source=a['sourceSetSha256'];cid='d'*64;name='t45-fresh35-production-fixture';ns={'startTicks':'123','networkNamespace':{'device':4,'inode':999}}
  receipt={'cid':cid,'image':m.ENV_IMAGE,'expiresAt':a['serviceLease']['expiresAt'],'operationId':p['operationId']}
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'authority').mkdir();work=root/'state'/Path(a['proposal']['workspaceDirectory']).name;work.mkdir(parents=True)
   raw=json.dumps(a).encode();(root/'authority/fresh35-production-provision-v2.json').write_bytes(raw)
   intent={'externalAuthoritySha256':m.sha(raw),'operationId':p['operationId'],'productionCarrier':p['productionCarrier'],'sourceSetSha256':source}
   (root/'production-start-intent.json').write_text(json.dumps(intent));(root/'production-container-receipt.json').write_text(json.dumps(receipt))
   facts={'state':'NEW_EMPTY_PRODUCTION_TARGET_FACTS_ONLY','sourceSetSha256':source,'target':target,'serviceLease':a['serviceLease'],'installStarted':False};(work/'creation-facts.json').write_text(json.dumps(facts))
   paths={m.DEPLOY:(str(root/'deploy'),False),'/etc/naijue-erp':(str(root/'authority'),True),m.PRODUCTION_STATE:(str(root/'state'),True),'/usr/local/bin/node':(str(root/'deploy/runtime/node/bin/node'),False),m.CAPACITY_PROFILE:(str(root/'state/capacity/owner-profile.json'),False)}
   info={'id':cid,'image':m.ENV_IMAGE,'name':'/'+name,'pid':321,'startedAt':'fixture-start','running':True,'labels':{'t45.operation':p['operationId'],'t45.source':source,'t45.production-service-expires-at':str(receipt['expiresAt'])},'network':'a'*64,'ports':{},'user':'0:0','readonly':True,'pidMode':'','ipcMode':'private','usernsMode':'','memory':3*1024**3,'swap':3*1024**3,'cpu':2000000000,'pids':256,'caps':['CHOWN','DAC_OVERRIDE','SETUID','SETGID','KILL','SYS_PTRACE'],'capDrop':['ALL'],'security':['no-new-privileges'],'privileged':False,'devices':[],'restart':'no','shm':64*1024**2,'tmpfs':{'/tmp':'rw,noexec,nosuid,nodev,size=64m'},'mounts':[{'Type':'bind','Destination':k,'Source':v[0],'RW':v[1]} for k,v in paths.items()],'networks':{'naijue-prod-front':{'NetworkID':'a'*64,'EndpointID':'e'*64,'Aliases':[name,p['productionCarrier']['futureAppName']]}}}
   with patch.object(m,'ROOT',root),patch.object(m,'NAME',name),patch.object(m,'SOURCE',source),patch.object(m,'read_file',side_effect=lambda path,*args,**kwargs:Path(path).read_bytes()),patch.object(m,'production_authority',return_value=(a,fixture.m)),patch.object(m,'production_info',return_value=info),patch.object(m,'production_front',return_value={'Containers':{cid:{'EndpointID':'e'*64}}}),patch.object(m,'production_process_namespace',return_value=ns),patch.object(m.time,'time',return_value=(fixture.NOW+60000)/1000),patch.object(m,'run',return_value=b'{"pid":123,"starttime":"fixture","exe":"fixture"}') as run:
    pending=m.production_facts(p);self.assertIsNone(pending['sharedPostgresNamespace']);run.assert_not_called()
    retained={'state':'DURABLE_V2_RECORD_SERVICE_RETAINED_UNTIL_EXPLICIT_DEADLINE','recordSha256':result['recordSha256'],'sourceSetSha256':source,'target':target,'serviceLease':a['serviceLease'],'hostEnabled':False,'businessVerified':False}
    for filename,value in [('service-retained.json',retained),('target-binding.json',target),('program-description.json',descriptor),('installation-result.json',result)]: (work/filename).write_text(json.dumps(value))
    (root/'authority/fresh35-combined-installation-v1.json').write_bytes(recordraw)
    ready=m.production_facts(p);self.assertEqual(ready['sharedPostgresNamespace']['container']['networkNamespace'],ns['networkNamespace']);self.assertEqual(ready['sharedPostgresNamespace']['installationRecordSha256'],m.sha(recordraw));self.assertFalse(ready['hostEnabled']);self.assertFalse(ready['businessVerified'])
    bad={**result,'state':'COMMITTED_UNPUBLISHED'};(work/'installation-result.json').write_text(json.dumps(bad))
    with self.assertRaises(RuntimeError):m.production_facts(p)
    run.assert_called_once()

if __name__=='__main__':unittest.main()
