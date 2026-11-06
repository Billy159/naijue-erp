import os,stat,json,hashlib,time,subprocess,shutil
from pathlib import Path
job=Path(os.environ['ERP_SHARED_JOB_DIR']);assert os.getuid()==0 and os.environ['ERP_SHARED_TASK_ID']=='T45' and job.name=='t45-f35-1e6ba0-stage-preflight-20261106-01'
control=Path('/home/naijue/erp-release-20261006-01-control/grant-5cc58239751e4e2a')
def read(p,limit=65536):
 s=p.lstat();assert stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_nlink==1 and s.st_size<=limit
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);b=os.read(fd,limit+1);after=os.fstat(fd);linked=p.lstat();identity=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  assert identity(s)==identity(before)==identity(after)==identity(linked) and len(b)==s.st_size and len(b)<=limit;return b
 finally:os.close(fd)
policy=Path('/usr/local/lib/naijue-erp-night/grant-5cc58239751e4e2a/artifact-staging-authorization.json')
for p in [*reversed(policy.parents),policy]:
 s=p.lstat();assert s.st_uid==0 and not s.st_mode&0o022 and not stat.S_ISLNK(s.st_mode)
s=policy.lstat();assert s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o444
b=read(policy);policysha=hashlib.sha256(b).hexdigest();json.loads(b);assert policysha=='86904f155ff79ceb78fdc8c350276110aaf6a745a2e7e8dfb300526e2ba76db7'
fd=os.open(job/'staging-policy-before.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
base=control/'artifacts/f35-f16218-ordinary-local-20261106-01';ready=json.loads(read(base/'ready.json'));z=(base/'archive.bin').lstat();identity=[z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
assert ready['status']=='READY' and ready['artifactKey']=='f35-f16218-ordinary-local-20261106-01' and ready['sourceSetSha256']=='b7805bc482143227d8539de5c5ddf8927f0d8ce14923bf80f71856175476ec37' and ready['archiveBytes']==83702682 and ready['archiveSha256']=='464d6ca3c0f2d3f86f34dc27267fe4203c66d04e50c0767ce33ecac34510ac21' and ready['authoritySha256']=='86904f155ff79ceb78fdc8c350276110aaf6a745a2e7e8dfb300526e2ba76db7' and ready['fileIdentity']==identity==[66304,393729,83702682,1793973038836939048,1793973039953934261]
assert stat.S_ISREG(z.st_mode) and not stat.S_ISLNK(z.st_mode) and z.st_uid==z.st_gid==1000 and stat.S_IMODE(z.st_mode)==0o600 and z.st_nlink==1
private=control/'private-standard-import-data/t45-real-r3-full-20261106-01';pr=json.loads(read(private/'ready.json'));ps=(private/'archive.bin').lstat();pi=[ps.st_dev,ps.st_ino,ps.st_size,ps.st_mtime_ns,ps.st_ctime_ns]
assert pr['status']=='READY' and pr['archiveSha256']=='fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e' and pr['fileIdentity']==pi==[66304,393585,93508914,1793915257822987699,1793915258790984345]
env=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1');receipt=read(env/'image-receipt.json');assert hashlib.sha256(receipt).hexdigest()=='e475f85c3501dbf9f9a18ddcc5be94384f82582712cd5a939f3326628237a47f'
image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
def docker(args):
 r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=8,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});assert r.returncode==0 and len(r.stdout)<=65536;return json.loads(r.stdout)
im=docker(['image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image]);assert im=={'id':image,'os':'linux','arch':'amd64'}
r6=docker(['inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"image":{{json .Image}}}','99d3e16fd399507fcca4a67f4e82d02d81398d1040e59a6cd7f8f8dc73c14013']);assert r6['id']=='99d3e16fd399507fcca4a67f4e82d02d81398d1040e59a6cd7f8f8dc73c14013' and r6['running'] is False and r6['pid']==0 and r6['image']==image
newroot=env/'phaseb-application-r23';assert not newroot.exists() and not newroot.is_symlink()
names=subprocess.run(['/usr/bin/docker','container','ls','--all','--filter','name=^/t45-fresh35-deb13-20261106-r23$','--format','{{json .Names}}'],capture_output=True,timeout=8,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});assert names.returncode==0 and names.stdout.strip()==b''
prior=[]
for k,status,exitcode in [('t45-f35-f16218-start-20261106-01','COMPLETED',0),('t45-f35-f16218-install-20261106-01','FAILED',2)]:
 v=json.loads(read(control/'results'/(k+'.json')));prior.append({'jobId':k,'status':v.get('status'),'exitCode':v.get('exitCode')})
 assert v.get('status')==status and v.get('exitCode')==exitcode
cleanup=json.loads(read(env/'phaseb-application-r22/state/cloud-pg-fresh35-20261105-r1/cleanup.json'))
clean_keys=['cleanShutdown','cleanupComplete','credentialsRemoved','loginsRevoked','ownedPidAbsent','portAbsent'];assert all(cleanup[k] is True for k in clean_keys) and cleanup['errors']==[]

original_install=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs/t45-f35-f16218-install-20261106-01/results/fresh35-deliver-install-result.json');
for component in [*reversed(original_install.parents),original_install]:
 st=component.lstat();assert st.st_uid==0 and not st.st_mode&0o022 and not stat.S_ISLNK(st.st_mode)
private_raw=read(original_install,131072);private_stat=original_install.lstat();assert private_stat.st_uid==private_stat.st_gid==0 and stat.S_IMODE(private_stat.st_mode)==0o600;private_hash=hashlib.sha256(private_raw).hexdigest();ir=json.loads(private_raw);installed=ir['evidence']['installation-result.json'];assert installed['recordPublished'] is True and installed['state']=='RECORD_DURABLY_PUBLISHED' and installed['installState']=='COMMITTED_UNPUBLISHED' and ir['evidence']['failure.json']['code']=='FRESH35_ISOLATED_ORDINARY_FAILED_OR_OUTCOME_UNKNOWN'
assert ir['cid']=='99d3e16fd399507fcca4a67f4e82d02d81398d1040e59a6cd7f8f8dc73c14013' and ir['containerStopped'] is True and installed['sourceSetSha256']=='b7805bc482143227d8539de5c5ddf8927f0d8ce14923bf80f71856175476ec37' and installed['programSha256']=='cfb8d4a9dea525a829d55dd0a48be09e9e899a6c0f43ed171fcaa2e95f319595' and installed['targetSha256']=='38a1793997a11906312a3854c88c355420e96b09a3c98b64e491545b7cd189ff'
assert ir['evidence']['ordinary-failure.json']['phase']=='REAL_PG_AND_MIDDLEWARE' and ir['evidence']['ordinary-failure.json']['commitOutcome']=='CONSULT_ORIGINAL_REQUEST_RECEIPTS_NO_REPLAY'
assert ir['evidence']['ordinary-failure.json']['childDiagnosticUnavailable'] is False and ir['evidence']['ordinary-failure.json']['childFailure']['phase']=='REAL_SYNTHETIC_ADMISSION' and ir['evidence']['ordinary-failure.json']['childFailure']['errorType']=='Error' and ir['evidence']['ordinary-failure.json']['childFailure']['errno']=='EACCES'
assert 'snapshot-after-install.json' in ir['evidence'] and ir['evidence']['snapshot-after-install.json']['connectionCleanup']=='CLOSED'
rollback=ir['evidence']['rollback-host-result.json'];assert rollback['state']=='FRESH35_SYNTHETIC_ROLLBACK_VERIFIED' and rollback['rollbackVerified'] is True and rollback['originalBatchAbsent'] is True and rollback['connectionCleanup']=='CLOSED'
host=ir['evidence']['host-result.json'];assert host['state']=='FRESH35_CONTROLLER_HOST_VERIFIED' and host['importState']=='COMMITTED' and host['replayState']=='ALREADY_COMMITTED' and host['readbackState']=='VERIFIED' and host['retainedHeaders']==25 and host['retainedSettlements']==27 and host['connectionCleanup']=='CLOSED' and ir['sourceResult']['syntheticImportVerified'] is True and ir['sourceResult']['independentSnapshotsVerified'] is True and ir['sourceResult']['ordinaryBusinessVerified'] is False
r22_native={'recordPublished':True,'state':installed['state'],'installState':installed['installState'],'postInstallFailureCode':ir['evidence']['failure.json']['code'],'sourceSetSha256':installed['sourceSetSha256']}
record=env/'phaseb-application-r22/authority/fresh35-combined-installation-v1.json';rs=record.lstat();assert stat.S_ISREG(rs.st_mode) and not stat.S_ISLNK(rs.st_mode) and rs.st_uid==0 and rs.st_nlink==1 and not rs.st_mode&0o022
r22_record={'exists':True,'uid':rs.st_uid,'mode':oct(stat.S_IMODE(rs.st_mode)),'bytes':rs.st_size,'contentsNotExported':True,'hashNotRepeated':True}
same=[]
matching_requests=sorted((control/'requests').glob('t45-f35-1e6ba0*.json'));assert len(matching_requests)<=8
for p in matching_requests:
 if p.stem==job.name:continue
 result=control/'results'/p.name;v=json.loads(read(result)) if result.exists() else {};same.append({'jobId':p.stem,'status':v.get('status','UNKNOWN_NO_REPLAY'),'exitCode':v.get('exitCode')})
assert all(v['status'] in ('COMPLETED','FAILED') for v in same),'UNKNOWN_OR_IN_FLIGHT_ORIGINAL_KEY_NO_REPLAY'
mem={line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')}
out={'status':'READONLY_R23_STAGE_PREFLIGHT_COMPLETE_NOT_TRANSPORT_OR_PG_AUTHORIZATION','checkedAtEpochMillis':int(time.time()*1000),'gateSha256':policysha,'oldBytesRetained':str(job/'staging-policy-before.json'),'baseIdentity':identity,'baseArchiveSha256':ready['archiveSha256'],'baseHashNotRereadUntilOriginalAssembler':True,'privateFullIdentityUnchanged':True,'privateFullIdentity':pi,'r23RootAbsent':True,'r23ContainerAbsent':True,'r23ArtifactDirectoriesFound':[p.name for p in sorted((control/'artifacts').glob('f35-1e6ba0*'))],'samePrefixOtherSubmissions':same,'priorExactJobs':prior,'r22PrivateOriginalReceiptMetadata':{'sha256':private_hash,'uid':private_stat.st_uid,'gid':private_stat.st_gid,'mode':oct(stat.S_IMODE(private_stat.st_mode)),'bytes':private_stat.st_size,'path':str(original_install),'readSource':'EXACT_ORIGINAL_ROOT_JOB_RESULT_NOT_PUBLIC_EXPORT'},'r22OrdinaryOriginalRequests':'UNKNOWN_NO_REPLAY_DB_NOT_QUERIED','r22OriginalNativeResult':r22_native,'r22PublishedRecordRetainedMetadata':r22_record,'r22Stopped':{'cid':r6['id'],'stopped':not r6['running'],'processAbsent':r6['pid']==0,'image':r6['image']},'r22Cleanup':{k:cleanup[k] for k in clean_keys},'r22CleanupErrors':cleanup['errors'],'fixedEnvironment':im,'environmentReceiptSha256':hashlib.sha256(receipt).hexdigest(),'resources':{'cpuCount':os.cpu_count(),'loadAverage':os.getloadavg(),'diskFreeBytes':shutil.disk_usage(base.parent).free,**mem},'sourceOrTargetWrites':0,'PGConnections':0,'networkOrServiceChanges':0,'dataExtraction':False}
(job/'results/stage-preflight.json').write_text(json.dumps(out))
