"""Pure offline tests; synthetic metadata never supplies actual catalog/review authority."""
import unittest,importlib.util,copy,tempfile,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('cmp',Path(__file__).with_name('compare-runtime26-metadata.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture():
    i=dict(database='synthetic',database_oid='1',database_owner='owner',current_user='runtime',session_user='runtime',server_version_num='180000',server_addr=None,server_port=None,postmaster_start='2026-01-01 00:00:00+00',replication_role='origin')
    manifest=dict(format='EXACT26_RUNTIME_CATALOG_EXPORT_V6',identity=i,migration_versions=list(range(1,27)),schema=dict(name='naijue_erp',owner='owner',acl='{owner=U/owner}'),routines=[dict(signature=f'naijue_erp.synthetic_{n}()',body_sha256='a'*64,definition_sha256='b'*64,source='DO_NOT_LEAK_PASSWORD_SECRET') for n in range(135)],relations=[dict(name='t',acl='{}')],columns=[dict(table='t',number=1,name='id',acl='{}')],system_column_acls=[dict(table='t',number=-2,name='xmin',acl='{}')],triggers=[dict(table='t',name='trigger')],constraints=[dict(table='t',name='check')],indexes=[dict(table='t',name='pk')],policies=[],roles=[dict(name='runtime',superuser=False)],memberships=[])
    return dict(sourceCommit='c'*40,sourceSha256='d'*64,observation=dict(manifest=manifest,identity=i,migration_versions=list(range(1,27)),catalog_sha256='e'*64,source_routines_match=True,complete_write_xmin_acl_match=True),independentReview=dict(decision='REVIEWED_EXPECTED_METADATA',reviewId='SYNTHETIC_ONLY'))
class Tests(unittest.TestCase):
    def test_same_is_metadata_only(self):
        f=fixture();r=m.compare(f,copy.deepcopy(f));self.assertEqual(r['decision'],'EXACT_METADATA_ONLY_NOT_UPGRADE_AUTHORIZATION');self.assertNotIn('DO_NOT_LEAK',json.dumps(r))
    def test_missing_identity_both_rejected(self):
        f=fixture();del f['observation']['identity'];del f['observation']['manifest']['identity']
        with self.assertRaises(ValueError):m.compare(f,copy.deepcopy(f))
    def test_empty_identity_rejected(self):
        f=fixture();f['observation']['identity']={};f['observation']['manifest']['identity']={}
        with self.assertRaises(ValueError):m.compare(f,copy.deepcopy(f))
    def test_required_fields_and_sections(self):
        for k in ['schema','migration_versions','routines','relations','columns','system_column_acls','triggers','constraints','indexes','policies','roles','memberships']:
            with self.subTest(k=k):
                f=fixture();del f['observation']['manifest'][k]
                with self.assertRaises((ValueError,TypeError)):m.compare(f,copy.deepcopy(f))
    def test_duplicate_rejected(self):
        f=fixture();f['observation']['manifest']['columns']*=2
        with self.assertRaises(ValueError):m.compare(f,copy.deepcopy(f))
    def test_source_mismatch_and_review_missing(self):
        for k in ['sourceCommit','sourceSha256','independentReview']:
            a=fixture();e=fixture();e.pop(k)
            with self.assertRaises(ValueError):m.compare(a,e)
    def test_exact_source_mismatch(self):
        a=fixture();e=fixture();e['sourceCommit']='f'*40
        with self.assertRaises(ValueError):m.compare(a,e)
    def test_missing_function_three_bodies_and_acl(self):
        a=fixture();e=fixture();a['observation']['manifest']['routines'].pop()
        for row in a['observation']['manifest']['routines'][:3]:row['body_sha256']='f'*64
        a['observation']['manifest']['columns'][0]['acl']='{runtime=r/owner}'
        r=m.compare(a,e);self.assertEqual(r['decision'],'REFUSE');self.assertEqual(r['differenceCount'],5)
        self.assertEqual(sum(d['field']=='body_sha256' for d in r['differences']),3);self.assertNotIn('DO_NOT_LEAK',json.dumps(r));self.assertIn('actual',r['differences'][0])
    def test_bounded_file_read(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'large';p.write_bytes(b' '* (32*1024*1024+1))
            with self.assertRaises(ValueError):m.read(p)
    def test_v8_proofs_and_system_deltas(self):
        e=fixture();o=e['observation'];o['manifest']['format']='EXACT26_RUNTIME_CATALOG_EXPORT_V8'
        o['manifest']['routines']+= [dict(signature=f'naijue_erp.v8_synthetic_{i}()',body_sha256='a'*64,definition_sha256='b'*64)for i in range(2)]
        del o['complete_write_xmin_acl_match'];o.update(complete_write_system_acl_match_v8=True,normal_delete_acl_match_v8=True,recorded_live_balance_contract_match=True)
        self.assertEqual(m.compare(copy.deepcopy(e),e)['differenceCount'],0)
        for field in ['complete_write_system_acl_match_v8','normal_delete_acl_match_v8','recorded_live_balance_contract_match']:
            a=copy.deepcopy(e);del a['observation'][field];r=m.compare(a,e)
            self.assertEqual(r['decision'],'REFUSE');self.assertEqual(r['differences'][0]['field'],field)
        a=copy.deepcopy(e);a['observation']['manifest']['system_column_acls'].append(dict(table='t',number=-3,name='cmin',acl='{}'))
        self.assertEqual(m.compare(a,e)['decision'],'REFUSE')
if __name__=='__main__':unittest.main()
