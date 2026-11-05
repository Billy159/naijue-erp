"""Local synthetic fixtures only. No PG, network, root operation or real secrets."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
m=load('production_launcher',ROOT/'scripts/release/unified-install/launch-fresh35-production-v2.py')
base=load('retained_primitives',ROOT/'scripts/release/unified-install/launch-fresh35-isolated-v1.py')
NOW=1793910000000

def provision():
    p={'database':'fixture_production_empty35','owner':'fixture35_owner','controller':'fixture35_controller','runtime':'fixture35_runtime','admin':'fixture35_admin','host':'127.0.0.1','port':57691,'workspaceDirectory':str(m.PARENT/'fixture-production-01')}
    return {'format':'FRESH35_PRODUCTION_PROVISION_AUTHORIZATION_V2','decision':'AUTHORIZE_EXACT_NEW_EMPTY_PRODUCTION_TARGET_ONLY','deploymentManifestSha256':'a'*64,'sourceSetSha256':'b'*64,'proposal':p,'postgresUid':992,'postgresGid':992,'startsAt':NOW,'expiresAt':NOW+1200000,'independentSafetyReviewSha256':'c'*64,'authorizationReference':'OFFLINE SYNTHETIC FIXTURE ONLY NOT PERMISSION','purpose':'PRODUCTION_NEW_EMPTY_EXACT35','ordinary':{'connectHost':'127.0.0.1','connectPort':57691,'serverAddress':'127.0.0.1','serverPort':57691,'runtimeLoginValidUntil':None,'referenceDirectory':str(m.DEPLOY/'reference-inputs')},'serviceLease':{'expiresAt':NOW+3600000,'onSuccess':'RETAIN_EXACT_TARGET_UNTIL_SERVICE_DEADLINE','onFailure':'STOP_EXACT_TARGET_PRESERVE_DATA'}}

class ProductionLauncherTests(unittest.TestCase):
    def setUp(self):m.core=base
    def test_exact_creation_contract_and_independent_service_lifetime(self):
        a=provision();self.assertIs(m.validate_provision(a,NOW),a)
        self.assertGreater(a['serviceLease']['expiresAt'],a['expiresAt'])
        self.assertEqual(m.production_server_args(a),base.server_args(a['proposal']))
        self.assertEqual(m.production_server_args(a)[m.production_server_args(a).index('-h')+1],'127.0.0.1')
    def test_synthetic_purpose_unknown_fields_and_old_target_shapes_refused(self):
        for change in [lambda a:a.update(extra=True),lambda a:a.update(format='FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1'),lambda a:a.update(decision='AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT'),lambda a:a.update(purpose='SYNTHETIC'),lambda a:a['proposal'].update(database='synthetic_fixture'),lambda a:a['proposal'].update(workspaceDirectory='/srv/existing'),lambda a:a['proposal'].update(port=True),lambda a:a['proposal'].update(owner='pg_monitor'),lambda a:a['ordinary'].update(serverAddress='0.0.0.0')]:
            a=provision();change(a)
            with self.subTest(change=change),self.assertRaises(RuntimeError):m.validate_provision(a,NOW)
        # The original synthetic entry remains strict, independently of V2.
        with self.assertRaises(RuntimeError):base.validate_authorization(provision(),NOW)
    def test_missing_invalid_or_overlong_service_lease_never_uses_install_window(self):
        for change in [lambda a:a.pop('serviceLease'),lambda a:a['serviceLease'].update(expiresAt=a['expiresAt']),lambda a:a['serviceLease'].update(expiresAt=True),lambda a:a['serviceLease'].update(expiresAt=float('inf')),lambda a:a['serviceLease'].update(onFailure='KEEP_RUNNING'),lambda a:a['serviceLease'].update(onSuccess='EXTEND_AUTOMATICALLY'),lambda a:a['serviceLease'].update(extra=1),lambda a:a.update(expiresAt=NOW+1200001)]:
            a=provision();change(a)
            with self.subTest(change=change),self.assertRaises(RuntimeError):m.validate_provision(a,NOW)
        a=provision();a['ordinary']['runtimeLoginValidUntil']='2026-11-05T21:00:00Z'
        with self.assertRaisesRegex(RuntimeError,'OUTLIVES_RUNTIME'):m.validate_provision(a,NOW)
        a['ordinary']['runtimeLoginValidUntil']='2026-11-07T00:00:00Z';self.assertIs(m.validate_provision(a,NOW),a)
    def test_final_role_lifetimes_fixed_in_bootstrap_not_after_record(self):
        a=provision();passwords={a['proposal'][k]:'0'*64 for k in ['admin','owner','controller','runtime']}
        original=base.bootstrap_sql(a,passwords);actual=m.production_bootstrap_sql(a,passwords)
        self.assertTrue(actual[0].startswith(original[0]));self.assertEqual(actual[1:],original[1:])
        self.assertTrue(actual[0].endswith("ALTER ROLE fixture35_runtime VALID UNTIL 'infinity';\n"))
        self.assertNotIn('fresh35_exclusive_backends',''.join(actual));self.assertNotIn('DROP ',''.join(actual))
        a['ordinary']['runtimeLoginValidUntil']='2026-11-07T00:00:00Z';self.assertIn("VALID UNTIL '2026-11-07T00:00:00Z'",m.production_bootstrap_sql(a,passwords)[0])
    def target(self,a):
        return {'proposal':a['proposal'],'physical':{'systemIdentifier':'7700000000000000001','databaseOid':'16393','serverVersionNum':'170011','postmasterStart':'2026-11-05 21:00:00.000001+00'},'startsAt':a['startsAt'],'expiresAt':a['expiresAt'],'purpose':a['purpose'],'ordinary':a['ordinary']}
    def descriptor(self,a):return {'sourceSetSha256':a['sourceSetSha256'],'programSha256':'d'*64,'targetSha256':'e'*64,'catalogSha256':'f'*64,'statements':[{'name':'physical-empty-target'}]}
    def test_external_entry_and_install_must_match_actual_facts_and_program(self):
        a=provision();target=self.target(a);d=self.descriptor(a)
        entry={'format':'FRESH35_PRODUCTION_ENTRY_AUTHORIZATION_V2','decision':'AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_AND_RECORD','sourceSetSha256':a['sourceSetSha256'],'target':target,'independentSafetyReviewSha256':'1'*64,'authorizationReference':'offline external entry fixture'}
        self.assertEqual(m.validate_entry(a,target,entry),entry)
        for key,value in [('sourceSetSha256','0'*64),('target',{}),('decision','PASS')]:
            with self.assertRaises(RuntimeError):m.validate_entry(a,target,{**entry,key:value})
        authorization={'format':'FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1','decision':'AUTHORIZE_EXACT_NEW35_PRODUCTION_INSTALL_ONLY','sourceSetSha256':d['sourceSetSha256'],'programSha256':d['programSha256'],'targetSha256':d['targetSha256'],'startsAt':a['startsAt'],'expiresAt':a['expiresAt'],'independentSafetyReviewSha256':'2'*64,'authorizationReference':'offline external execution fixture'}
        m.validate_install(a,d,authorization)
        for key,value in [('programSha256','0'*64),('expiresAt',a['serviceLease']['expiresAt']),('decision','AUTHORIZE_EXACT_NEW35_SYNTHETIC_INSTALL_ONLY')]:
            with self.assertRaises(RuntimeError):m.validate_install(a,d,{**authorization,key:value})
    def test_fixed_cli_and_original_reserve_do_not_use_service_expiry(self):
        a=provision()
        with patch.object(m.time,'time',return_value=NOW/1000),patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'fixture',stderr=b'')) as run:
            m.production_entry(a,'--describe')
        self.assertEqual(run.call_args.args[0],[str(base.NODE),'--no-global-search-paths',str(m.ENTRY),'--describe']);self.assertLessEqual(run.call_args.kwargs['timeout'],60)
        with patch.object(m.time,'time',return_value=(a['expiresAt']-45000)/1000),patch.object(m.subprocess,'run') as run:
            with self.assertRaises(RuntimeError):m.production_entry(a,'--execute')
            run.assert_not_called()
    def record_fixture(self):
        a=provision();target=self.target(a);d=self.descriptor(a)
        record={'format':'FRESH35_COMBINED_INSTALLATION_RECORD_V2','installedAt':'2026-11-05T21:01:00Z','binding':{'sourceSetSha256':a['sourceSetSha256'],'targetSha256':d['targetSha256']},'target':{'format':'FRESH35_COMBINED_TARGET_BINDING_V2',**target,'authority':'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION'},'transactionReceipt':{'nonce':'3'*48,'database':a['proposal']['database'],'actor':a['proposal']['owner'],'transactionId':'123','backendPid':123},'programSha256':d['programSha256'],'catalogSpecSha256':d['catalogSha256'],'catalogSha256':'4'*64,'authorizationSha256':'5'*64,'state':'COMMITTED_AND_CATALOG_CHECKED'}
        raw=(json.dumps(record)+'\n').encode();result={'state':'RECORD_DURABLY_PUBLISHED','recordPublished':True,'hostEnabled':False,'businessVerified':False,'sourceSetSha256':a['sourceSetSha256'],'programSha256':d['programSha256'],'targetSha256':d['targetSha256'],'catalogSha256':record['catalogSha256'],'recordSha256':hashlib.sha256(raw).hexdigest()}
        return a,target,d,record,raw,result
    def test_retain_requires_durable_v2_exact_bytes_not_child_exit_or_json_alone(self):
        a,t,d,record,raw,result=self.record_fixture();self.assertEqual(m.assert_retention(a,t,d,result,raw),record)
        for change in [{'state':'COMMITTED_UNPUBLISHED'},{'recordPublished':False},{'recordSha256':'0'*64},{'targetSha256':'0'*64}]:
            with self.assertRaises(RuntimeError):m.assert_retention(a,t,d,{**result,**change},raw)
        for change in [lambda r:r.update(format='FRESH35_COMBINED_INSTALLATION_RECORD_V1'),lambda r:r['transactionReceipt'].update(actor='unrelated'),lambda r:r['target'].update(expiresAt=a['serviceLease']['expiresAt'])]:
            bad=copy.deepcopy(record);change(bad);b=(json.dumps(bad)+'\n').encode()
            with self.assertRaises(RuntimeError):m.assert_retention(a,t,d,{**result,'recordSha256':hashlib.sha256(b).hexdigest()},b)
    def test_original_native_unknown_diagnostic_preserved_without_raw_error(self):
        a=provision();d=self.descriptor(a);v={'state':'INSTALL_FAILED_OR_OUTCOME_UNKNOWN','installState':'COMMITTED_UNPUBLISHED','code':'FRESH35_PRODUCTION_ENTRY_FAILED','stage':'COMMIT','step':None,'originalSQLSTATE':'55000','originalInternalCode':'FRESH35_COMBINED_CATALOG_DIFFERS','rollbackSQLSTATE':None,'rollbackInternalCode':None,'validationStage':None,'validationCode':None,'automaticRetry':False}
        result=SimpleNamespace(returncode=2,stderr=json.dumps(v).encode());r=m.safe_child_failure(result,d);self.assertFalse(r['diagnosticUnavailable']);self.assertEqual(r['installState'],'COMMITTED_UNPUBLISHED')
        result.stderr=b'password=untrusted-synthetic-log';r=m.safe_child_failure(result,d);self.assertTrue(r['diagnosticUnavailable']);self.assertNotIn('password',json.dumps(r))
    def test_owned_stop_is_exact_and_never_changes_record_catalog_or_retries_sql(self):
        a=provision();signals=[]
        class Child:
            done=False
            def poll(self):return 0 if self.done else None
            def send_signal(self,s):signals.append(s);self.done=True
            def wait(self,timeout):return 0
        child=Child()
        with patch.object(base,'same_process',return_value=True),patch.object(base,'port_absent',return_value=True),patch.object(base,'psql',side_effect=AssertionError('NO POSTRECORD SQL')),patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'Database system identifier: 999\nDatabase cluster state: shut down\n')):
            r=m.stop_owned(a,child,{'pid':123},'999',time.monotonic()+25)
        self.assertTrue(r['cleanupComplete']);self.assertFalse(r['databasePrivilegesChanged']);self.assertTrue(r['dataPreserved']);self.assertEqual(signals,[m.signal.SIGINT])
        child=Child();signals.clear()
        with patch.object(base,'same_process',return_value=False),patch.object(base,'port_absent',return_value=False):r=m.stop_owned(a,child,{'pid':123},'999',time.monotonic()+25)
        self.assertFalse(r['cleanupComplete']);self.assertEqual(signals,[])
    def test_new_hba_reuses_seven_reviewed_rules_and_refuses_replaced_file(self):
        a=provision()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);a['proposal']['workspaceDirectory']=str(root);a['postgresUid']=os.getuid();(root/'data').mkdir();p=root/'data/pg_hba.conf';p.write_bytes(b'initdb generated fixture');p.chmod(0o600);m.write_initial_hba(a)
            self.assertEqual(p.read_text(),base.hba_text(a['proposal']));self.assertEqual(len(p.read_text().splitlines()),7);p.unlink();p.symlink_to(root/'unrelated')
            with self.assertRaises(OSError):m.write_initial_hba(a)
    def test_creation_facts_check_real_binding_before_any_bootstrap_ddl(self):
        a=provision();p=a['proposal'];seen={'systemIdentifier':'999','serverVersionNum':'170011','address':p['host'],'port':p['port'],'actor':p['admin'],'dataDirectory':p['workspaceDirectory']+'/data','hbaFile':p['workspaceDirectory']+'/data/pg_hba.conf'}
        with patch.object(base,'owned_listener',return_value=True),patch.object(m.time,'time',return_value=NOW/1000),patch.object(base,'psql',return_value=json.dumps(seen)) as execute:m.verify_bootstrap_server(a,'999',{'pid':123})
        self.assertEqual(execute.call_args.args[2],'postgres');self.assertTrue(execute.call_args.args[3].startswith('SELECT '))
        for key,value in [('systemIdentifier','998'),('dataDirectory','/old/data'),('address','10.0.0.1')]:
            with patch.object(base,'owned_listener',return_value=True),patch.object(m.time,'time',return_value=NOW/1000),patch.object(base,'psql',return_value=json.dumps({**seen,key:value})),self.assertRaises(RuntimeError):m.verify_bootstrap_server(a,'999',{'pid':123})
    def supervision_model(self,forged=False,expire=False):
        a,t,d,record,_,result=self.record_fixture();temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name);a['proposal']['workspaceDirectory']=str(root)
        raw=(json.dumps(record)+'\n').encode();result['recordSha256']=hashlib.sha256(raw).hexdigest()
        if forged:raw=json.dumps({**record,'format':'FRESH35_COMBINED_INSTALLATION_RECORD_V1'}).encode()
        inputs={'birth.json':json.dumps({'systemIdentifier':'999'}).encode(),'target-binding.json':json.dumps(t).encode(),'program-description.json':json.dumps(d).encode(),'installation-result.json':json.dumps(result).encode(),m.RECORD.name:raw}
        class Selector:
            def register(self,*args):pass
            def select(self,timeout):return [True]
        child=SimpleNamespace(pid=123,poll=lambda:None);output=io.StringIO();expired=False;real=m.assert_retention
        def checked(*args):
            nonlocal expired
            r=real(*args)
            if expire:expired=True
            return r
        def clock():return a['serviceLease']['expiresAt']/1000 if expired else NOW/1000
        cleanup={'cleanupComplete':True,'ownedPidAbsent':True,'portAbsent':True,'cleanShutdown':True,'errors':[]}
        with patch.object(m.signal,'signal'),patch.object(m.selectors,'DefaultSelector',return_value=Selector()),patch.object(m.sys,'stdin',io.StringIO('INITIALIZE\nSTART\nRETAIN\nSTOP\n')),patch.object(m.sys,'stdout',output),patch.object(m.time,'monotonic',return_value=0),patch.object(m.time,'time',side_effect=clock),patch.object(m,'protected',side_effect=lambda path,*args:inputs[Path(path).name]),patch.object(m,'assert_retention',side_effect=checked),patch.object(base,'supervise_initializer',return_value={'initialized':True,'initializerReaped':True,'descendantsReaped':True,'errors':[]}),patch.object(base,'port_absent',return_value=True),patch.object(base,'process_identity',return_value={'pid':123,'starttime':'fixture','exe':str(base.BIN/'postgres')}),patch.object(base,'same_process',return_value=True),patch.object(m.subprocess,'Popen',return_value=child),patch.object(m,'stop_owned',return_value=cleanup) as stop,patch.object(m,'remove_expired_temporary_secrets') as clear:
            if forged:
                with self.assertRaises(RuntimeError):m.supervise(a)
                code=None
            else:code=m.supervise(a)
        return code,output.getvalue(),stop,clear
    def test_guardian_does_not_retain_from_forged_record_or_message(self):
        _,output,stop,clear=self.supervision_model(forged=True)
        self.assertNotIn('SERVICE_RETAINED',output);stop.assert_called_once();clear.assert_not_called()
    def test_retained_service_parent_stop_preserves_pending_real_recovery_secrets(self):
        code,output,stop,clear=self.supervision_model()
        self.assertEqual(code,0);self.assertIn('SERVICE_RETAINED',output);stop.assert_called_once();clear.assert_not_called()
    def test_genuine_retained_lease_expiry_stops_then_clears_only_owned_secrets(self):
        code,output,stop,clear=self.supervision_model(expire=True)
        self.assertEqual(code,0);self.assertIn('SERVICE_RETAINED',output);stop.assert_called_once();self.assertEqual(stop.call_args.args[-1],25);clear.assert_called_once();self.assertTrue(clear.call_args.args[-1])
    def test_private_input_mode_extra_byte_and_growth_are_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'authority.json';p.write_bytes(b'{"fixture":true}');p.chmod(0o600);oldstat=os.fstat;oldread=os.read
            def metadata(fd):
                s=oldstat(fd);return SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns','st_gid']},st_uid=0)
            oldlstat=Path.lstat
            def pathstat(path):
                s=oldlstat(path)
                if path==p:return SimpleNamespace(**{k:getattr(s,k) for k in ['st_dev','st_ino','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns','st_gid']},st_uid=0)
                return s
            with patch.object(m,'trusted',side_effect=lambda path:Path(path)),patch.object(m.os,'fstat',side_effect=metadata),patch.object(m.Path,'lstat',pathstat):
                self.assertEqual(m.protected(p),b'{"fixture":true}');p.chmod(0o644)
                with self.assertRaises(RuntimeError):m.protected(p)
                self.assertEqual(m.protected(p,mode=0o644),b'{"fixture":true}');p.chmod(0o600);grown=False
                def read(fd,n):
                    nonlocal grown
                    b=oldread(fd,n)
                    if not grown:
                        with p.open('ab') as f:f.write(b'GROWTH')
                        grown=True
                    return b
                with patch.object(m.os,'read',side_effect=read),self.assertRaises(RuntimeError):m.protected(p)
    def test_primitive_import_requires_both_exact_c_manifest_pins_first(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);helper=root/'helper.py';own=root/'caller.py';manifest=root/'manifest.json'
            helper.write_text("raise AssertionError('UNTRUSTED_HELPER_EXECUTED')\n");own.write_text('fixture caller\n')
            value={'format':'FRESH35_ISOLATED_DEPLOYMENT_V1','files':[{'path':'helper.py','sha256':'0'*64},{'path':'caller.py','sha256':hashlib.sha256(own.read_bytes()).hexdigest()}]};raw=json.dumps(value).encode();a=provision();a['deploymentManifestSha256']=hashlib.sha256(raw).hexdigest()
            with patch.object(m,'DEPLOY',root),patch.object(m,'PRIMITIVES',helper),patch.object(m,'SELF',own),patch.object(m,'MANIFEST',manifest),patch.object(m,'protected',return_value=raw),patch.object(m,'trusted',side_effect=lambda p:Path(p)),self.assertRaisesRegex(RuntimeError,'DEPLOYED_PYTHON_LEAF_DIFFERS'):m.load_primitives(a)

if __name__=='__main__':unittest.main()
