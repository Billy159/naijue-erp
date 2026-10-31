"""Run against baseline first, then candidate: no DB, Docker, network or trusted pins."""
import copy, os, pathlib, types, unittest
from unittest.mock import patch
ROOT = pathlib.Path(os.environ.get('RELEASE_SOURCE_ROOT', str(pathlib.Path(__file__).resolve().parents[2])))
D = types.ModuleType('deploy_candidate'); D.__file__=str(ROOT/'scripts/release/deploy-candidate.py')
exec(compile(pathlib.Path(D.__file__).read_bytes(),D.__file__,'exec'),D.__dict__)
V6='26_hv2_history_set_guards_complete_write_xmin_from_v22'
class V6Release(unittest.TestCase):
 def fixture(self, v6=True):
  refs={'review':{'sha256':'a'*64},'independentReview':{'sha256':'b'*64}}
  p={'buildId':'test-only','sourceCommit':'c'*40,'runtime26Full':{'references':refs,'media':{'containerRoot':'/private/media','rootKey':'test'}}}
  if v6:p['runtime26Full']['catalogProfile']='complete-write-v6'
  target={'database':D.DATABASE,'databaseOid':'123','actingRole':D.ROLE,'sessionUser':D.ROLE,'serverAddress':None,'serverPort':None,'postmasterStart':'synthetic-only'}
  runtime={'schemaVersion':1,'profile':D.FULL_PROFILE,'documentCommands':'NATIVE_RUNTIME','publicOrigin':D.ORIGIN,'http':{'host':'0.0.0.0','port':3000,'acceptedHosts':[D.HOST]},'assets':{'root':'/app/web','entry':'index.html'},'build':{'buildId':p['buildId'],'sourceCommit':p['sourceCommit']},'postgres':{},'authentication':{},'runtime26Review':{'reviewFile':D.RUNTIME26_REVIEW,'trustedReviewSha256':'a'*64},'existingPreparation':{'sales':False,'transfers':False},'productMedia':{'root':'/private/media','rootKey':'test'}}
  review={'version':'C_NATIVE_RUNTIME26_REVIEW_V1','decision':'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA','target':target,'catalog':{'format':'EXACT26_RUNTIME_CATALOG_EXPORT_V6' if v6 else 'EXACT26_RUNTIME_CATALOG_EXPORT_V1','patchLevel':V6 if v6 else D.FULL_PATCH,'sha256':'d'*64},'purposes':D.RUNTIME26_PURPOSES+['PRODUCT_MAINTENANCE','HISTORY_REVISION'],'scope':'EXACT_TARGET_METADATA_ONLY','independentReview':{'path':D.RUNTIME26_INDEPENDENT,'sha256':'b'*64,'result':'PASS'},'realImportExecutionAuthorized':False}
  identity=dict(zip(['database','database_oid','current_user','session_user','server_addr','server_port','postmaster_start'],target.values()));identity['replication_role']='origin'
  metadata={'identity':identity,'migration_versions':list(range(1,27)),'catalog_sha256':'d'*64,'source_routines_match':True}
  if v6:metadata['complete_write_xmin_acl_match']=True
  return p,runtime,review,metadata,{'result':'PASS'}
 def validate(self,args):
  # Only unrelated filesystem/capacity plumbing is stubbed. Core validator executes.
  with patch.object(D,'capacity_runtime_configuration',side_effect=lambda p,r,c:r),patch.object(D,'runtime_references',side_effect=lambda p:p['runtime26Full']['references']),patch.object(D,'validate_full_credential'):
   D.validate_full_metadata(*args)
 def test_explicit_v6_accepts_original_issuer_exact23_metadata(self): self.validate(self.fixture())
 def test_full_catalog_selector_changes_staged_binding(self):
  p=self.fixture()[0];p.update(runtimeSelector='exact26-full',runtimeConfiguration={'path':'synthetic'})
  with patch.object(D,'exact26_selected',return_value=True),patch.object(D,'exact26_full',return_value=True):
   v6=D.runtime_binding(p)
   del p['runtime26Full']['catalogProfile']
   legacy=D.runtime_binding(p)
   self.assertNotEqual(v6,legacy)
   expected={'selector':p['runtimeSelector'],'references':p['runtime26Full']['references'],'runtimeFile':p['runtimeConfiguration'],'capacityHost':None,'capacityGate':None,'capacityFinalInput':None,'media':p['runtime26Full']['media'],'inventorySpool':None}
   self.assertEqual(legacy,D.digest(D.encoded(expected)))
   p['runtime26Full']['catalogProfile']='legacy-v1'
   self.assertEqual(legacy,D.runtime_binding(p))
   p['runtime26Full']['catalogProfile']='unknown'
   with self.assertRaises(D.Refused):D.runtime_binding(p)
 def test_old_v1_unchanged(self):self.validate(self.fixture(False))
 def test_v6_denies_wrong_format_patch_and_omitted_selection(self):
  for mode in ['format','patch','absent','unknown']:
   args=self.fixture();p,r,review,m,i=args
   if mode=='format':review['catalog']['format']='EXACT26_RUNTIME_CATALOG_EXPORT_V5'
   if mode=='patch':review['catalog']['patchLevel']=D.FULL_PATCH
   if mode=='absent':del p['runtime26Full']['catalogProfile']
   if mode=='unknown':p['runtime26Full']['catalogProfile']='best-available'
   with self.subTest(mode=mode),self.assertRaises(D.Refused):self.validate(args)
 def test_v6_denies_missing_extra_and_false_acl_or_source_proof(self):
  for mode in ['missing','extra','false','string','source','target','hash','versions']:
   args=self.fixture();m=args[3]
   if mode=='missing':del m['complete_write_xmin_acl_match']
   if mode=='extra':m['complete_maintenance_xmin_acl_match']=True
   if mode=='false':m['complete_write_xmin_acl_match']=False
   if mode=='string':m['complete_write_xmin_acl_match']='true'
   if mode=='source':m['source_routines_match']=False
   if mode=='target':m['identity']['current_user']='owner'
   if mode=='hash':m['catalog_sha256']='e'*64
   if mode=='versions':m['migration_versions'].pop()
   with self.subTest(mode=mode),self.assertRaises(D.Refused):self.validate(args)
 def test_v1_never_accepts_v6_rights_metadata(self):
  args=self.fixture(False);args[3]['complete_write_xmin_acl_match']=True
  with self.assertRaises(D.Refused):self.validate(args)
if __name__=='__main__':unittest.main()
