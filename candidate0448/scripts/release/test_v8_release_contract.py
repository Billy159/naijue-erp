"""Finite V8 release metadata and boot shape; synthetic fixtures, no PG or service."""
import hashlib
import importlib.util
import pathlib
import os
import unittest
from unittest.mock import patch
ROOT=pathlib.Path(os.environ.get('RELEASE_SOURCE_ROOT',str(pathlib.Path(__file__).resolve().parents[2])))
spec=importlib.util.spec_from_file_location('v7_release_support',ROOT/'scripts/release/test_v7_release_contract.py')
V7=importlib.util.module_from_spec(spec);spec.loader.exec_module(V7)
D,T=V7.D,V7.T
NAME='recorded-live-write-v8'
PATCH='26_hv2_live_pairs_complete_write_acl_v8_from_v7'
PROOFS=('complete_write_system_acl_match_v8','normal_delete_acl_match_v8','recorded_live_balance_contract_match')
class V8Release(unittest.TestCase):
 def fixture(self):
  a=V7.V7ReleaseContract().fixture();a[0]['runtime26Full']['catalogProfile']=NAME
  a[2]['catalog'].update(format='EXACT26_RUNTIME_CATALOG_EXPORT_V8',patchLevel=PATCH)
  del a[3]['complete_write_xmin_acl_match']
  for field in PROOFS:a[3][field]=True
  return a
 def validate(self,a):V7.V7ReleaseContract().validate(a)
 def test_v8_exact_seven_fields_accept_both_transport_identity_shapes(self):
  for address,port in [(None,None),('127.0.0.1/32',5432)]:
   a=self.fixture();a[2]['target'].update(serverAddress=address,serverPort=port);a[3]['identity'].update(server_addr=address,server_port=port);self.validate(a)
 def test_every_new_or_retained_proof_is_exact_true_and_required(self):
  for f in PROOFS:
   for val in [False,None,0,1,'true',[],{}]:
    a=self.fixture();a[3][f]=val
    with self.subTest(field=f,value=val),self.assertRaises(D.Refused):self.validate(a)
   a=self.fixture();del a[3][f]
   with self.subTest(missing=f),self.assertRaises(D.Refused):self.validate(a)
 def test_old_metadata_never_advertises_v8_and_new_metadata_never_downgrades(self):
  for name in ['legacy-v1','complete-write-v6','recorded-live-ledger-v7']:
   a=self.fixture();a[0]['runtime26Full']['catalogProfile']=name
   with self.subTest(selection=name),self.assertRaises(D.Refused):self.validate(a)
  for format in ['EXACT26_RUNTIME_CATALOG_EXPORT_V6','EXACT26_RUNTIME_CATALOG_EXPORT_V7']:
   a=self.fixture();a[2]['catalog']['format']=format
   with self.subTest(format=format),self.assertRaises(D.Refused):self.validate(a)
  a=self.fixture();a[3]['complete_write_xmin_acl_match']=True
  with self.assertRaises(D.Refused):self.validate(a)
  a=V7.V7ReleaseContract().fixture();a[0]['runtime26Full']['catalogProfile']=NAME;a[2]['catalog'].update(format='EXACT26_RUNTIME_CATALOG_EXPORT_V8',patchLevel=PATCH)
  with self.assertRaises(D.Refused):self.validate(a)
 def test_v8_exact_envelopes_keep_target_source_and_review_guards(self):
  for bag,field in [('metadata','extra'),('catalog','extra'),('identity','extra')]:
   a=self.fixture();obj=a[3] if bag=='metadata' else a[2]['catalog'] if bag=='catalog' else a[3]['identity'];obj[field]=True
   with self.subTest(bag=bag),self.assertRaises(D.Refused):self.validate(a)
  for field in ['database_owner','server_version_num','replication_role']:
   a=self.fixture();del a[3]['identity'][field]
   with self.subTest(field=field),self.assertRaises(D.Refused):self.validate(a)
  for change in [lambda a:a[3]['identity'].update(current_user='owner'),lambda a:a[3].update(source_routines_match=False),lambda a:a[3].update(catalog_sha256='e'*64),lambda a:a[3]['migration_versions'].pop(),lambda a:a[4].update(result='FAIL'),lambda a:a[2].update(realImportExecutionAuthorized=True),lambda a:a[2]['purposes'].append('UNAPPROVED')]:
   a=self.fixture();change(a)
   with self.assertRaises(D.Refused):self.validate(a)
 def test_v8_binding_is_distinct_and_boot_selection_is_finite(self):
  p=self.fixture()[0];p.update(runtimeSelector='exact26-full',runtimeConfiguration={'path':'synthetic'})
  with patch.object(D,'exact26_selected',return_value=True),patch.object(D,'exact26_full',return_value=True):
   new=D.runtime_binding(p);p['runtime26Full']['catalogProfile']='recorded-live-ledger-v7';self.assertNotEqual(new,D.runtime_binding(p))
  with T.synthetic_files():
   T.B.deployment_binding(T.deployment(profile=NAME,credential=True))
   p=T.deployment(profile='recorded-live-write-v9',credential=True)
   with self.assertRaises(T.B.Refused):T.B.deployment_binding(p)
 def test_modified_helper_still_requires_external_approval_for_boot_and_rollback(self):
  source=(ROOT/'scripts/release/deploy-candidate.py').read_bytes()
  import types
  rollback=types.ModuleType('rollback');rollback.__file__=str(ROOT/'scripts/release/rollback-candidate.py')
  exec(compile(pathlib.Path(rollback.__file__).read_bytes(),rollback.__file__,'exec'),rollback.__dict__)
  with patch.object(rollback.Path,'read_bytes',return_value=source+b'\n# synthetic changed byte, never executed\n'),self.assertRaisesRegex(ValueError,'CAPACITY_REVIEWED_DEPLOYMENT_HELPER_REQUIRED'):rollback.deployment_implementation('exact26-full',capacity=True)
if __name__=='__main__':unittest.main()
