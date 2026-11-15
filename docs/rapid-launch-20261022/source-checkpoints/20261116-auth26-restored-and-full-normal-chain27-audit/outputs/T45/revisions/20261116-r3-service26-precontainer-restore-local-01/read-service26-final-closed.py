"""Final stopped-service/resource/auth-restoration receipts, no credentials or PG."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex
HERE=Path(__file__).resolve().parent;LIVE=HERE
restore=json.loads((HERE/'actual-restore26/READBACK-01.json').read_bytes())
apply=json.loads((HERE.parent/'20261116-r3-service26-pin-closure-local-01/actual26/apply/READBACK-01.json').read_bytes())
cids=[apply['cleanup']['cid'],restore['cleanup']['cid']]
client=HERE.parents[3].parent/'monitor/normal-admission-20261112-01/admin_client.py'
assert hashlib.sha256(client.read_bytes()).hexdigest()=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']()
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
CIDS=CIDS_LITERAL
def call(args):return subprocess.run(args,capture_output=True,check=True,timeout=8).stdout
containers=[]
for cid in CIDS:
 raw=call(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"image":{{json .Image}}}',cid])
 v=json.loads(raw);assert v['id']==cid and v['running'] is False and v['pid']==0;containers.append(v)
D=R/'state'/R.name/'data';s=D.lstat();assert not D.is_symlink()
assert (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)
assert not os.path.lexists(D/'postmaster.pid')
listener=call(['/usr/bin/ss','-H','-ltn','sport = :56791']);assert not listener.strip()
units=call(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service']);assert not units.strip()
slots=['t45-r3-batched-install-20261115-01','t45-r3-batched-real-execute-20261115-01']
for grant in ['b16447fbc81f4d64','5cc58239751e4e2a']:
 c=Path('/home/naijue/erp-release-20261006-01-control')/('grant-'+grant);b=Path('/root/erp-release-20261006-01-worker')/('grant-'+grant)
 for k in slots:
  assert not any(os.path.lexists(p) for p in [c/'requests'/(k+'.json'),c/'requests'/(k+'.tmp'),c/'jobs'/k,c/'results'/(k+'.json'),b/'jobs'/k])
marker=R/'state/native-services/ordinary26-auth-20261116-01/restored.json';ms=marker.lstat()
assert stat.S_ISREG(ms.st_mode) and ms.st_uid==0 and not ms.st_mode&0o077
material=(R/'state/installed-real-operation-batched-20261115-01/source-materialization.json').read_bytes()
assert hashlib.sha256(material).hexdigest()=='7306aa53eefd744a43c5b5781a1bc8eadd6fef4009bc308dfa27f93663492ce3'
newmaterial=(R/'state/installed-real-operation-batched-root03-20261116-01/source-materialization.json').read_bytes()
assert hashlib.sha256(newmaterial).hexdigest()=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec'
startkey='t45-first-r3-native-service-start-20261116-26'
assert not call(['/usr/bin/docker','ps','-a','--no-trunc','--filter','label=t45.operation='+startkey,'--format','{{.ID}}']).strip()
boot=R/'state/native-services'/startkey
expected={'authority-61035': {'uid': 0, 'gid': 61035, 'mode': 488, 'bytes': 4096, 'directory': True}, 'authority-61035/fresh35-admin154-successor-v1.json': {'uid': 0, 'gid': 61035, 'mode': 288, 'bytes': 1429, 'directory': False}, 'authority-61035/fresh35-combined-installation-v1.json': {'uid': 0, 'gid': 61035, 'mode': 288, 'bytes': 1757, 'directory': False}, 'authority-61035/fresh35-compact-zero-successor-v2.json': {'uid': 0, 'gid': 61035, 'mode': 288, 'bytes': 1432, 'directory': False}, 'authority-61035/fresh35-isolated-deployment-v1.json': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 1084429, 'directory': False}, 'authority-61035/fresh35-production-provision-v2.json': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 1505, 'directory': False}, 'batched161-run.mjs': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 9888, 'directory': False}, 'fresh35-production-carrier.py': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 185047, 'directory': False}, 'launchers-61035': {'uid': 0, 'gid': 0, 'mode': 448, 'bytes': 4096, 'directory': True}, 'launchers-61035/launch-fresh35-isolated-v1.py': {'uid': 0, 'gid': 61035, 'mode': 288, 'bytes': 109344, 'directory': False}, 'launchers-61035/launch-fresh35-production-v2.py': {'uid': 0, 'gid': 61035, 'mode': 288, 'bytes': 34757, 'directory': False}, 'materialize-r3-r2.py': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 15693, 'directory': False}, 'materialized-profile.json': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 27834, 'directory': False}, 'normal_service05_after08.py': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 54032, 'directory': False}, 'normal_service05_after08_proof.py': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 19408, 'directory': False}, 'operator-host.mjs': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 72238, 'directory': False}, 'operator-manifest.json': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 48490, 'directory': False}, 'operator-stream-import-cli.mjs': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 26499, 'directory': False}, 'operator-stream-program.mjs': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 10302, 'directory': False}, 'r3_05_readonly.py': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 21212, 'directory': False}, 'readonly-mount-plan.json': {'uid': 0, 'gid': 0, 'mode': 384, 'bytes': 2705, 'directory': False}, 'service-start-authorization.json': {'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 4747, 'directory': False}}
pins={'batched161-run.mjs': 'f69e4d748c0c1dd3e808f05f24cfa20eca16590d8e8f81423d107d88d10a2357', 'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'launchers-61035/launch-fresh35-isolated-v1.py': 'a56afc4a5fcd965f00306d4493586b27d4465896d4973e8535fe151975504d75', 'launchers-61035/launch-fresh35-production-v2.py': 'b72a0e5aeeb156a27488e32dbd5275f70de76887679f80c5803e8d44b2a8ee59', 'materialize-r3-r2.py': '1f8a8cc826d153455de7c8f93af3402032dc82fd4f498c1912d50c79185e41b8', 'materialized-profile.json': 'ce6d6a3c71497701f1dab5ddf5fac89cc93d0824324b0aa75512dfc05177d904', 'normal_service05_after08.py': '1d63fc62b01ac9611e3a583757ac84e42f37a04f82c68a90bbb43a905cceb84c', 'normal_service05_after08_proof.py': 'ea83a051a87261c04a244918507fb46e5b8a53b7b02f51e4ebf42c1ad6198efe', 'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae', 'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184', 'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e', 'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6', 'r3_05_readonly.py': '57caa6841a04a86f5994c98ca4ae5213e3b44e1c9b6b6497f97fc3a2e053d971', 'readonly-mount-plan.json': '5dd035ddc354cd989aca0ebb986aa09bc3b4fb6d6246f4667245c9fff00e398d', 'service-start-authorization.json': '5dbf8567d85ac447eada6ab163209a5924484acbd4ee7e282de02121150aa675'}
assert set(p.name for p in boot.iterdir())=={n for n in expected if '/' not in n}
for n,row in expected.items():
 p=boot/n;st=p.lstat();assert not p.is_symlink() and (st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode),stat.S_ISDIR(st.st_mode))==(row['uid'],row['gid'],row['mode'],row['directory'])
 if not row['directory']:assert st.st_size==row['bytes']
 if n in pins:assert hashlib.sha256(p.read_bytes()).hexdigest()==pins[n]
projection=R/'authority/r3-service-24-worker-proof'
legacy=[]
for path,inode in [(projection,13663880),(projection/'capacity',13663881),(projection/'capacity/owner-profile.json',13663882)]:
 st=path.lstat();assert st.st_ino==inode and st.st_uid==0 and not path.is_symlink();legacy.append({'path':str(path),'inode':st.st_ino,'uid':st.st_uid,'gid':st.st_gid,'mode':stat.S_IMODE(st.st_mode),'bytes':st.st_size})

index=R/'state/real-first-20261110-r3/reports/t45-first-20261110-r3-real-prepare-20261114-09/runtime/stream/index.sqlite';ins=index.lstat()
assert (ins.st_ino,ins.st_size)==(13638206,2196459520)
volume=os.statvfs(R)
print(json.dumps({'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'containers':containers,'pgdataPidAbsent':True,'targetPortAbsent':True,'activeOperationUnits':[],
 'originalDataDirectoryIdentity':[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode)],
 'privateRestoreMarkerMetadata':{'present':True,'uid':ms.st_uid,'gid':ms.st_gid,'mode':stat.S_IMODE(ms.st_mode),'bytes':ms.st_size},
 'preservedMaterializationSha256':hashlib.sha256(material).hexdigest(),'newMaterializationSha256':hashlib.sha256(newmaterial).hexdigest(),'failed26PartialBootPreserved':True,'service26ContainerNeverCreated':True,'old24ProjectionMetadataPreserved':legacy,'originalRetainedIndexMetadata':{'inode':ins.st_ino,'bytes':ins.st_size,'uid':ins.st_uid,'gid':ins.st_gid,'mode':stat.S_IMODE(ins.st_mode)},
 'availableBytes':volume.f_bavail*volume.f_frsize,'installAndWriterOriginalKeysAbsentInBothGrants':True,'databaseConnections':0,'mutations':0,'credentialBodiesRead':False},sort_keys=True))
'''.replace('CIDS_LITERAL',repr(cids))
raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
p=LIVE/('SERVICE26-FINAL-CLOSED-'+datetime.now(timezone.utc).strftime('%H%M%S')+'.json')
with p.open('xb') as f:f.write(raw)
print(json.dumps({'receipt':str(p),'sha256':hashlib.sha256(raw).hexdigest(),**json.loads(raw)},sort_keys=True))
