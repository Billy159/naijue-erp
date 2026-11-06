"""Only the C-approved builtin ACL and legacy scope successor. No real PG facts."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

HERE=Path(__file__).parent
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
M=load('producer_control_fix',HERE/'new35-backup-restore.py')
D=load('consumer_control_fix',HERE/'deploy-candidate.py')


class ControlAclAndLegacy(unittest.TestCase):
    def control(self):
        p={'admin':'source_admin','owner':'source_owner','controller':'source_controller','runtime':'source_runtime'}
        v={'function':'pg_catalog.pg_control_system()','owner':'source_admin','ownerOid':'10','language':'internal',
           'source':'pg_control_system','securityDefiner':False,'returnsSet':False,'definition':'SYNTHETIC_BUILTIN_DEFINITION',
           'acl':sorted([['source_admin',v,'EXECUTE',False] for v in p.values()])}
        return p,v

    def test_source_exec_must_be_observed_and_public_extra_or_grant_option_refuses(self):
        p,v=self.control();M.validate_source_control_acl(v,p)
        self.assertIn('aclexplode',M.control_system_observation());self.assertIn("'pgControlSystem'",M.catalog_sql())
        with self.assertRaises(ValueError):M.validate_source_control_acl(None,p)
        for row in [['source_admin','PUBLIC','EXECUTE',False],['source_admin','extra','EXECUTE',False],['source_admin','source_runtime','EXECUTE',True]]:
            bad=copy.deepcopy(v);bad['acl'].append(row)
            with self.assertRaisesRegex(ValueError,'NO_PUBLIC'):M.validate_source_control_acl(bad,p)

    def test_restore_recreates_only_original_three_exec_and_exact_new_bootstrap_mapping(self):
        p,v=self.control();expected=M.mapped_control_acl(v,'source_admin','restore_admin')
        before={**expected,'acl':[['restore_admin','restore_admin','EXECUTE',False]]}
        sql=M.control_system_restore_sql(v,before,p,'restore_admin')
        self.assertEqual(sql,'GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO "source_owner","source_controller","source_runtime"')
        self.assertNotIn('PUBLIC',sql);self.assertNotIn('CREATE ROLE',sql);self.assertNotIn('GRANT OPTION',sql)
        with self.assertRaisesRegex(ValueError,'UNKNOWN_RESTORE_CONTROL_ACL'):
            M.control_system_restore_sql(v,{**before,'acl':before['acl']+[['restore_admin','other','EXECUTE',False]]},p,'restore_admin')
        with self.assertRaisesRegex(ValueError,'BUILTIN_IDENTITY'):
            M.control_system_restore_sql(v,{**before,'definition':'UNKNOWN_BODY'},p,'restore_admin')
        self.assertEqual(expected['owner'],'restore_admin');self.assertEqual(expected['ownerOid'],'10')
        self.assertTrue(all(row[0]=='restore_admin' for row in expected['acl']))

    def test_grant_ack_or_wrong_admin_mapping_cannot_replace_new_connection_acl_readback(self):
        record={'target':{'proposal':{'admin':'source_admin'}}}
        r={'controlSystemAclRestored':True,'controlSystemAclNewConnectionReadback':True,
           'restoreTarget':{'role':'restore_admin'},'builtinAclMapping':{'function':'pg_catalog.pg_control_system()',
           'sourceAdmin':'source_admin','restoreAdmin':'restore_admin','scope':'ONLY_BUILTIN_OWNER_GRANTOR_OID10'}}
        D.validate_exact35_control_system_restoration(record,r)
        with self.assertRaises(D.Refused):D.validate_exact35_control_system_restoration(record,{**r,'controlSystemAclNewConnectionReadback':False})
        bad=copy.deepcopy(r);bad['builtinAclMapping']['restoreAdmin']='source_admin'
        with self.assertRaises(D.Refused):D.validate_exact35_control_system_restoration(record,bad)

    def legacy(self):
        p={'backupReceipt':{'sha256':'a'*64},'legacyLogicalRecovery':{'path':'recovery','sha256':'c'*64},
           'backupMaxAgeSeconds':3600,'beforeCAS':{'services':{'old':{'id':'cid','imageId':'img','startedAt':'start','restartCount':0}}}}
        files={n:{'bytes':1,'sha256':'b'*64} for n in ['erp_prod.dump','media.protected.tar','configuration.protected.tar',
            'actual-app.protected.tar','actual-web.protected.tar','runtime-images.protected.tar']}
        target={'database':'erp_prod','cluster':'111','oid':'42','postmaster':'start'};svc={'old':{'id':'cid','image':'img','startedAt':'start','restarts':0}}
        backup={'status':'PASS_NEW_SINGLE_DATABASE_AND_OPAQUE_FILES_BACKUP_OFFLINE_TOC_ONLY','files':files,'target':target,
                'mediaConfigurationMetadataStable':True,'servicesBefore':svc,'servicesAfter':svc,'finishedAtUTC':D.now()}
        auth={'format':'LEGACY_LOGICAL_ROLES_AUTH_ACL_CAPTURE_V1','target':target,'backupReceiptSha256':'a'*64,
              'databaseDumpSha256':'b'*64,'rolesAuthAclArtifact':{'bytes':1,'sha256':'d'*64},'roleAclProjection':'INCLUDES_PG_ATTRIBUTE_ATTACL_V1'}
        restored={'state':'LEGACY_LOGICAL_SAME_DUMP_INDEPENDENT_RESTORE_PASSED','sourceTarget':target,'backupReceiptSha256':'a'*64,
                  'databaseDumpSha256':'b'*64,'rolesAuthAclReceiptSha256':'d'*64,'backupFiles':files,'rolesAclCompared':True,
                  'ordinaryDatabaseRepresentativeRead':'PASS','currentAppLoginRepresentativeRead':'NOT_TESTED',
                  'roleAclProjection':'INCLUDES_PG_ATTRIBUTE_ATTACL_V1','columnAclsCompared':True,'opaqueFilesRestored':True,
                  'restoreTarget':{'systemIdentifier':'222','database':'erp_prod','databaseOid':'42','postmasterStart':'new'},'finishedAtUtc':D.now()}
        rows={'recovery':{'rolesAuthAcl':{'path':'auth','sha256':'d'*64},'restoreReceipt':{'path':'restore','sha256':'e'*64}},'auth':auth,'restore':restored}
        return p,backup,rows

    def test_legacy_db_restore_passes_without_old_app_http_but_preserves_db_acl_files_and_same_dump(self):
        p,b,rows=self.legacy()
        with patch.object(D,'exact35_selected',return_value=True),patch.object(D,'reference',side_effect=lambda r,*a:rows[r['path']]):
            D.validate_current_backup(p,b)
            for change in [lambda r:r['restore'].update(ordinaryDatabaseRepresentativeRead='NOT_TESTED'),
                           lambda r:r['restore'].update(currentAppLoginRepresentativeRead='PASS'),
                           lambda r:r['restore'].update(columnAclsCompared=False),
                           lambda r:r['restore'].update(opaqueFilesRestored=False),
                           lambda r:r['restore'].update(databaseDumpSha256='0'*64)]:
                original=copy.deepcopy(rows);change(rows)
                with self.assertRaises(D.Refused):D.validate_current_backup(p,b)
                rows.clear();rows.update(original)
        with patch.object(D,'exact35_selected',return_value=False),self.assertRaisesRegex(D.Refused,'COMPLETE_CURRENT_BACKUP'):
            D.validate_current_backup(p,b)


if __name__=='__main__':unittest.main()
