"""Local synthetic Docker/proc facts only; never connects to Docker or PostgreSQL."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import time
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent

def load(name):
    m=types.ModuleType(name);m.__file__=str(HERE/(name+'.py'))
    exec(compile(Path(m.__file__).read_bytes(),m.__file__,'exec'),m.__dict__);return m

D=load('deploy-candidate');B=load('boot-entry');R=load('rollback-candidate')

class SharedNamespace(unittest.TestCase):
    def fixture(self):
        cid='a'*64;app='b'*64;front='c'*64;alias='naijue-rewrite-offline-app'
        expires=int(time.time()*1000)+60000
        target={'purpose':'PRODUCTION_NEW_EMPTY_EXACT35','expiresAt':expires-30000,'proposal':{'host':'127.0.0.1','port':57639},
                'ordinary':{'connectHost':'127.0.0.1','connectPort':57639,'serverAddress':'127.0.0.1','serverPort':57639,'runtimeLoginValidUntil':None}}
        record={'format':'FRESH35_COMBINED_INSTALLATION_RECORD_V2','binding':{'sourceSetSha256':'d'*64,'targetSha256':'e'*64},'target':target}
        shared={'format':'OWNED_POSTGRES_SHARED_NAMESPACE_V1','container':{'id':cid,'name':'t45-fresh35-production-fixture','imageId':'sha256:'+'1'*64,
                'startedAt':'2026-11-06T00:00:00Z','hostPid':123,'startTicks':'456','networkNamespace':{'device':4,'inode':999},
                'frontEndpoint':{'id':'f'*64,'aliases':['t45-fresh35-production-fixture',alias]}},'creationOperationId':'fixture-create',
                'sourceSetSha256':'d'*64,'targetSha256':'e'*64,'installationRecordSha256':'2'*64,'serviceLeaseExpiresAt':expires}
        p={'runtimeSelector':'exact35','runtime35':{'references':{'installationRecord':{'sha256':'2'*64}},'sharedPostgresNamespace':shared},
           'names':{'app':alias},'networks':{'front':{'id':front,'name':'naijue-prod-front'},'data':{'id':'3'*64}},'operationId':'fixture-release',
           'releaseDirectory':'/fixture','runtimeConfiguration':{'path':'/fixture/runtime'},'images':{'node':{'id':'sha256:'+'4'*64}},'limits':{'app':{'user':'10001:10001'}}}
        pg={'Id':cid,'Name':'/'+shared['container']['name'],'Image':shared['container']['imageId'],
            'State':{'Running':True,'Pid':123,'StartedAt':shared['container']['startedAt']},
            'Config':{'Labels':{'t45.operation':'fixture-create','t45.source':'d'*64}},
            'HostConfig':{'NetworkMode':front,'PortBindings':{},'Privileged':False},
            'NetworkSettings':{'Networks':{'naijue-prod-front':{'NetworkID':front,'EndpointID':'f'*64,'Aliases':shared['container']['frontEndpoint']['aliases']}}}}
        api={'Id':app,'State':{'Running':True,'Pid':789,'StartedAt':'2026-11-06T00:00:01Z'},
             'Config':{'Labels':{'naijue.rapid-launch.created-by':'fixture-release'}},'HostConfig':{'NetworkMode':'container:'+cid}}
        network={'Id':front,'Name':'naijue-prod-front','Driver':'bridge','Internal':True,'Containers':{cid:{'EndpointID':'f'*64}}}
        class Docker:
            def __init__(self):self.calls=[];self.infos={cid:pg,app:api};self.network=network
            def inspect(self,name,seconds=60):return self.infos[name]
            def run(self,args,seconds=60):
                self.calls.append(args)
                if args[:2]==['network','inspect']:return json.dumps([self.network]).encode()
                if args[0]=='create':return app.encode()
                if args[0]=='stop':self.infos[args[-1]]['State']['Running']=False;return b''
                raise AssertionError('UNEXPECTED_DOCKER_MUTATION')
        return p,record,Docker(),cid,app
    def proc(self,pid):return {'startTicks':'456' if pid==123 else '888','networkNamespace':{'device':4,'inode':999}}
    def test_closed_binding_requires_exact_production_record_source_target_and_lease(self):
        p,r,d,c,a=self.fixture()
        with patch.object(D,'runtime35_record',return_value=r):
            self.assertEqual(D.production_shared_namespace_binding(p),p['runtime35']['sharedPostgresNamespace'])
            changes=[lambda b:b.update(extra=True),lambda b:b.update(sourceSetSha256='0'*64),lambda b:b.update(targetSha256='0'*64),
                     lambda b:b.update(installationRecordSha256='0'*64),lambda b:b.update(serviceLeaseExpiresAt=1),
                     lambda b:b['container'].update(hostPid=True),lambda b:b['container'].update(networkNamespace={'device':4}),
                     lambda b:b['container']['frontEndpoint'].update(aliases=['other'])]
            for change in changes:
                bad=copy.deepcopy(p);change(bad['runtime35']['sharedPostgresNamespace'])
                with self.subTest(change=change),self.assertRaises(D.Refused):D.production_shared_namespace_binding(bad)
            missing=copy.deepcopy(p);missing['runtime35'].pop('sharedPostgresNamespace')
            with self.assertRaises(D.Refused):D.production_shared_namespace_binding(missing)
            old={**r,'format':'FRESH35_COMBINED_INSTALLATION_RECORD_V1'}
            with patch.object(D,'runtime35_record',return_value=old),self.assertRaises(D.Refused):D.production_shared_namespace_binding(p)
    def test_real_metadata_model_checks_api_namespace_and_preserves_pg_network(self):
        p,r,d,c,a=self.fixture()
        with patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',side_effect=self.proc),patch.object(D,'assert_own'):
            self.assertEqual(D.check_production_shared_namespace(p,d,a),p['runtime35']['sharedPostgresNamespace'])
        self.assertTrue(all(args[:2]==['network','inspect'] for args in d.calls))
        self.assertTrue(d.infos[c]['State']['Running'])
    def test_replaced_pg_birth_namespace_endpoint_alias_or_network_refuses_before_create(self):
        edits=[lambda pg:pg['State'].update(Pid=321),lambda pg:pg['State'].update(StartedAt='restarted'),lambda pg:pg.update(Image='sha256:'+'0'*64),
               lambda pg:pg['HostConfig'].update(NetworkMode='none'),lambda pg:pg['Config']['Labels'].update({'t45.source':'0'*64}),
               lambda pg:pg['NetworkSettings']['Networks']['naijue-prod-front'].update(EndpointID='0'*64),
               lambda pg:pg['NetworkSettings']['Networks']['naijue-prod-front']['Aliases'].append('UNAPPROVED_ALIAS')]
        for edit in edits:
            p,r,d,c,a=self.fixture();d.infos[c]=copy.deepcopy(d.infos[c]);edit(d.infos[c])
            with self.subTest(edit=edit),patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',side_effect=self.proc),self.assertRaises(D.Refused):D.check_production_shared_namespace(p,d)
            self.assertFalse(any(args[0]=='create' for args in d.calls))
        p,r,d,c,a=self.fixture()
        with patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',return_value={'startTicks':'456','networkNamespace':{'device':4,'inode':1000}}),self.assertRaises(D.Refused):D.check_production_shared_namespace(p,d)
    def test_foreign_front_alias_is_never_overwritten(self):
        p,r,d,c,a=self.fixture();peer='9'*64;d.network['Containers'][peer]={'EndpointID':'8'*64}
        d.infos[peer]={'Name':'/other-app','NetworkSettings':{'Networks':{'naijue-prod-front':{'Aliases':[p['names']['app']]}}}}
        with patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',side_effect=self.proc),self.assertRaisesRegex(D.Refused,'ALIAS_CONFLICT'):D.check_production_shared_namespace(p,d)
        self.assertTrue(all(args[:2]==['network','inspect'] for args in d.calls))
    def test_dns_case_equivalent_alias_and_container_name_are_both_conflicts(self):
        for by_name in [False,True]:
            p,r,d,c,a=self.fixture();peer='9'*64;d.network['Containers'][peer]={'EndpointID':'8'*64}
            d.infos[peer]={'Name':'/'+p['names']['app'].upper() if by_name else '/other-app','NetworkSettings':{'Networks':{'naijue-prod-front':{'Aliases':[] if by_name else [p['names']['app'].upper()]}}}}
            with self.subTest(by_name=by_name),patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',side_effect=self.proc),self.assertRaisesRegex(D.Refused,'ALIAS_CONFLICT'):D.check_production_shared_namespace(p,d)
            self.assertTrue(all(args[:2]==['network','inspect'] for args in d.calls))
    def test_api_different_actual_namespace_refused_even_with_correct_docker_mode(self):
        p,r,d,c,a=self.fixture()
        def different(pid):return {**self.proc(pid),'networkNamespace':{'device':4,'inode':1000 if pid==789 else 999}}
        with patch.object(D,'runtime35_record',return_value=r),patch.object(D,'process_network_namespace',side_effect=different),patch.object(D,'assert_own'),self.assertRaisesRegex(D.Refused,'API_PG_NETNS_DIFFER'):D.check_production_shared_namespace(p,d,a)
    def test_shared_create_uses_container_mode_without_alias_or_data_attach(self):
        p,r,d,c,a=self.fixture();gate={'hostFifo':'/fixture/gate'}
        with patch.object(D,'capacity_host_binding'),patch.object(D,'capacity_gate_binding',return_value=gate),patch.object(D,'check_production_shared_namespace',return_value=p['runtime35']['sharedPostgresNamespace']),patch.object(D,'limits_args',return_value=[]),patch.object(D,'labels',return_value=[]),patch.object(D,'runtime_mount_arguments',return_value=[]),patch.object(D,'capacity_gate_arguments',return_value=['image']),patch.object(D,'assert_own'):
            self.assertEqual(D.create_capacity_gate_app(p,d),a)
        args=d.calls[0];self.assertEqual(args[args.index('--network')+1],'container:'+c);self.assertNotIn('--network-alias',args)
        self.assertFalse(any(args[:2]==['network','connect'] for args in d.calls))
    def test_expired_lease_still_allows_exact_api_stop_without_pg_or_alias_mutation(self):
        p,r,d,c,a=self.fixture();p['runtime35']['sharedPostgresNamespace']['serviceLeaseExpiresAt']=1
        with patch.object(D,'assert_own'):D.capacity_gate_stop(p,d,a)
        self.assertEqual(d.calls,[['stop','--time','5',a]]);self.assertTrue(d.infos[c]['State']['Running'])
        self.assertEqual(d.network['Containers'],{c:{'EndpointID':'f'*64}})
    def test_boot_checks_new_pg_instead_of_old_healthy_pg(self):
        p,r,d,c,a=self.fixture();dp=p;dp['beforeCAS']={'services':{B.OLD[1]:{'id':'oldweb'}}}
        d.infos['oldweb']={'HostConfig':{'RestartPolicy':B.NO}}
        owner={'ownerSourceSha256':'fixture'}
        with tempfile.TemporaryDirectory() as t,patch.object(B,'owner_root',return_value=Path(t)),patch.object(B,'read',return_value=b'fixture'),patch.object(B,'unit_bytes',return_value=b'fixture'),patch.object(B,'unit_state',return_value={'DropInPaths':'','UnitFileState':'enabled'}),patch.object(B,'sha',return_value='fixture'),patch.object(B,'fenced'),patch.object(B,'audit_live'),patch.object(B,'old_identity'),patch.object(B,'artifacts'),patch.object(D,'Docker',return_value=d),patch.object(D,'check_images_networks'),patch.object(D,'check_production_shared_namespace',side_effect=D.Refused('NEW_PG_CHANGED')) as check:
            with self.assertRaisesRegex(D.Refused,'NEW_PG_CHANGED'):B.boot_start(owner,D,dp,{},None)
            check.assert_called_once_with(dp,d)
        self.assertFalse(d.calls)
    def test_runtime_binding_includes_namespace_and_both_consumers_pin_same_helper(self):
        p,r,d,c,a=self.fixture();p['runtime35']['media']={};p['runtimeConfiguration']['identity']={}
        with patch.object(D,'exact35_selected',return_value=True):
            first=D.runtime_binding(p);p['runtime35']['sharedPostgresNamespace']['container']['networkNamespace']['inode']+=1
            self.assertNotEqual(first,D.runtime_binding(p))
        sha=hashlib.sha256((HERE/'deploy-candidate.py').read_bytes()).hexdigest()
        self.assertEqual(B.DEPLOYMENT_CAPACITY_SHA256,sha);self.assertEqual(R.DEPLOYMENT_CAPACITY_SHA256,sha)

if __name__=='__main__':unittest.main()
