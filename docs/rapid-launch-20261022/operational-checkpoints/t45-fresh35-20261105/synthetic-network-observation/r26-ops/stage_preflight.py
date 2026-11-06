import os,stat,json,hashlib,time,subprocess,shutil
from pathlib import Path
R25_CLEANUP_SHA256='aabd24d5db1c9c6a600aee639e73b10f7d2bc181cf4d4163d1b591ddfbd436da'
R25_PRIVATE_RESULT_SHA256='ab491e7d7325442de09533751ad402ebeed5dc595e99deefd5fb8b8b8a8a9621'
job=Path(os.environ['ERP_SHARED_JOB_DIR']);assert os.getuid()==0 and os.environ['ERP_SHARED_TASK_ID']=='T45' and job.name=='t45-f35-10fc5e-stage-preflight-20261107-01'
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
b=read(policy);policysha=hashlib.sha256(b).hexdigest();json.loads(b);assert policysha=='6d14e96224e275704999ea372f3f4e84208cb9c5535f5a5ff48e5bbeb327ff99'
fd=os.open(job/'staging-policy-before.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
base=control/'artifacts/f35-56fb33-ordinary-local-20261107-01';ready=json.loads(read(base/'ready.json'));z=(base/'archive.bin').lstat();identity=[z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns]
assert ready['status']=='READY' and ready['artifactKey']=='f35-56fb33-ordinary-local-20261107-01' and ready['sourceSetSha256']=='7cf8810ed0f45684f70f267bf838f8ab2d6d49ba6e56e0b0f1af8293e9191e67' and ready['archiveBytes']==83704196 and ready['archiveSha256']=='58ccbfd5ba053d3105e1e2093074fb1bf1ca50027201e7b770ad57a42b9594ed' and ready['authoritySha256']=='6d14e96224e275704999ea372f3f4e84208cb9c5535f5a5ff48e5bbeb327ff99' and ready['fileIdentity']==identity==[66304,393753,83704196,1793985946584329397,1793985947789325945]
assert stat.S_ISREG(z.st_mode) and not stat.S_ISLNK(z.st_mode) and z.st_uid==z.st_gid==1000 and stat.S_IMODE(z.st_mode)==0o600 and z.st_nlink==1
private=control/'private-standard-import-data/t45-real-r3-full-20261106-01';pr=json.loads(read(private/'ready.json'));ps=(private/'archive.bin').lstat();pi=[ps.st_dev,ps.st_ino,ps.st_size,ps.st_mtime_ns,ps.st_ctime_ns]
assert pr['status']=='READY' and pr['archiveSha256']=='fc831c282f982ca22c840906aae96bf69acf23e785a42c199655e0ccf297365e' and pr['fileIdentity']==pi==[66304,393585,93508914,1793915257822987699,1793915258790984345]
env=Path('/srv/naijue-erp/isolated-targets/fresh35-deb13-20261105-r1');receipt=read(env/'image-receipt.json');assert hashlib.sha256(receipt).hexdigest()=='e475f85c3501dbf9f9a18ddcc5be94384f82582712cd5a939f3326628237a47f'
image='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
def docker(args):
 r=subprocess.run(['/usr/bin/docker',*args],capture_output=True,timeout=8,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});assert r.returncode==0 and len(r.stdout)<=65536;return json.loads(r.stdout)
im=docker(['image','inspect','--format','{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}}}',image]);assert im=={'id':image,'os':'linux','arch':'amd64'}
r6=docker(['inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"image":{{json .Image}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"labels":{{json .Config.Labels}}}','768519a2c193012362db9ebeb5dded1f57f997eab5c6f55a1fb64ed08cbb2692']);assert r6['id']=='768519a2c193012362db9ebeb5dded1f57f997eab5c6f55a1fb64ed08cbb2692' and r6['running'] is False and r6['pid']==0 and r6['image']==image
newroot=env/'phaseb-application-r26';assert not newroot.exists() and not newroot.is_symlink()
assert not list((control/'artifacts').glob('f35-10fc5e*')),'NEW_R26_ARTIFACT_ALREADY_EXISTS_NO_REPLAY'
names=subprocess.run(['/usr/bin/docker','container','ls','--all','--filter','name=^/t45-fresh35-deb13-20261107-r26$','--format','{{json .Names}}'],capture_output=True,timeout=8,env={'PATH':'/usr/bin:/bin','HOME':'/root','LANG':'C.UTF-8'});assert names.returncode==0 and names.stdout.strip()==b''
prior=[]
for k,status,exitcode in [('t45-f35-56fb33-start-20261107-01','COMPLETED',0),('t45-f35-56fb33-install-20261107-01','FAILED',2)]:
 v=json.loads(read(control/'results'/(k+'.json')));prior.append({'jobId':k,'status':v.get('status'),'exitCode':v.get('exitCode')})
 assert v.get('status')==status and v.get('exitCode')==exitcode
cleanup=json.loads(read(env/'phaseb-application-r25/state/cloud-pg-fresh35-20261105-r1/cleanup.json'))
def retained_r25_is_stopped_and_isolated(cleanup,info):
 # This is an exact failed predecessor branch, never a cleanup PASS.
 if type(cleanup) is not dict or set(cleanup)!={'cleanShutdown','cleanupComplete','credentialsRemoved','errors','initialization','loginsRevoked','ownedPidAbsent','portAbsent','portObservation'}:return False
 initialization=cleanup['initialization']
 if type(initialization) is not dict or set(initialization)!={'descendantsReaped','errors','initialized','initializerReaped','stopReason'}:return False
 if not all(initialization[k] is True for k in ['descendantsReaped','initialized','initializerReaped']) or initialization['errors']!=[] or initialization['stopReason']!='INITIALIZER_EXITED':return False
 o=cleanup['portObservation']
 if type(o) is not dict or set(o)!={'complete','finishedAtUTC','format','matchingRows','matchingStates','namespace','portAbsent','readError','reading','stage','startedAtUTC'}:return False
 if o['complete'] is not True or o['portAbsent'] is not False or o['readError'] is not None or o['reading'] is not None:return False
 if o['format']!='FRESH35_CLEANUP_PORT_OBSERVATION_V1' or o['stage']!='AFTER_OWNED_PG_WAIT_AND_CREDENTIAL_CLEANUP_BEFORE_CONTAINER_STOP':return False
 if o['startedAtUTC']!='2026-11-06T17:42:31.438309+00:00' or o['finishedAtUTC']!='2026-11-06T17:42:31.439802+00:00':return False
 if type(o['matchingRows']) is not int or o['matchingRows']!=4:return False
 if type(o['namespace']) is not dict or set(o['namespace'])!={'device','inode'} or not all(type(o['namespace'][k]) is int for k in ['device','inode']) or o['namespace']!={'device':4,'inode':4026533833}:return False
 if type(o['matchingStates']) is not dict or set(o['matchingStates'])!={'tcp','tcp6'}:return False
 states={f'{v:02X}' for v in range(1,13)}|{'UNKNOWN'}
 for table,counts in o['matchingStates'].items():
  if type(counts) is not dict or set(counts)!=states or not all(type(count) is int and count==(4 if table=='tcp' and state=='06' else 0) for state,count in counts.items()):return False
 return (type(cleanup) is dict and all(cleanup.get(k) is True for k in ['cleanShutdown','credentialsRemoved','loginsRevoked','ownedPidAbsent'])
  and cleanup.get('cleanupComplete') is False and cleanup.get('portAbsent') is False and cleanup.get('errors')==[]
  and info.get('id')=='768519a2c193012362db9ebeb5dded1f57f997eab5c6f55a1fb64ed08cbb2692'
  and info.get('running') is False and type(info.get('pid')) is int and info['pid']==0
  and info.get('image')=='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
  and info.get('network')=='none' and 'ports' in info and info['ports'] in ({},None)
  and type(info.get('labels')) is dict
  and info['labels'].get('t45.operation')=='t45-f35-56fb33-application-20261107-01'
  and info['labels'].get('t45.source')=='7cf8810ed0f45684f70f267bf838f8ab2d6d49ba6e56e0b0f1af8293e9191e67')
clean_keys=['cleanShutdown','cleanupComplete','credentialsRemoved','loginsRevoked','ownedPidAbsent','portAbsent'];assert retained_r25_is_stopped_and_isolated(cleanup,r6)
assert hashlib.sha256(read(env/'phaseb-application-r25/state/cloud-pg-fresh35-20261105-r1/cleanup.json')).hexdigest()==R25_CLEANUP_SHA256

original_install=Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs/t45-f35-56fb33-install-20261107-01/results/fresh35-deliver-install-result.json');
for component in [*reversed(original_install.parents),original_install]:
 st=component.lstat();assert st.st_uid==0 and not st.st_mode&0o022 and not stat.S_ISLNK(st.st_mode)
private_raw=read(original_install,131072);private_stat=original_install.lstat();assert private_stat.st_uid==private_stat.st_gid==0 and stat.S_IMODE(private_stat.st_mode)==0o600;private_hash=hashlib.sha256(private_raw).hexdigest();assert private_hash==R25_PRIVATE_RESULT_SHA256;ir=json.loads(private_raw);installed=ir['evidence']['installation-result.json'];assert installed['recordPublished'] is True and installed['state']=='RECORD_DURABLY_PUBLISHED' and installed['installState']=='COMMITTED_UNPUBLISHED' and ir['evidence']['failure.json']['code']=='FRESH35_ISOLATED_ORDINARY_FAILED_OR_OUTCOME_UNKNOWN'
assert ir['cid']=='768519a2c193012362db9ebeb5dded1f57f997eab5c6f55a1fb64ed08cbb2692' and ir['containerStopped'] is True and installed['sourceSetSha256']=='7cf8810ed0f45684f70f267bf838f8ab2d6d49ba6e56e0b0f1af8293e9191e67' and installed['programSha256']=='5f5fc9bbaaee53cdf659f0d6d9134b1ea94f94f289a9b264049e615a549d4441' and installed['targetSha256']=='c1d54014cee9faf8ce2651b67cc6d8ffa68254fb444491d0d7ede1fe1b789685'
assert ir['evidence']['ordinary-failure.json']['phase']=='REAL_PG_AND_MIDDLEWARE' and ir['evidence']['ordinary-failure.json']['commitOutcome']=='CONSULT_ORIGINAL_REQUEST_RECEIPTS_NO_REPLAY'
assert ir['evidence']['ordinary-failure.json']['childDiagnosticUnavailable'] is False and ir['evidence']['ordinary-failure.json']['childFailure']=={'format':'FRESH35_ORDINARY_FAILURE_V1','phase':'REAL_ADMIN_ACCOUNT_SETUP','source':'runFresh35OrdinaryIntegration:catch','errorType':'AssertionError','guardCode':'ERR_ASSERTION','sqlstate':None,'errno':None,'expectedInteger':200,'actualInteger':500}
assert 'snapshot-after-install.json' in ir['evidence'] and ir['evidence']['snapshot-after-install.json']['connectionCleanup']=='CLOSED'
rollback=ir['evidence']['rollback-host-result.json'];assert rollback['state']=='FRESH35_SYNTHETIC_ROLLBACK_VERIFIED' and rollback['rollbackVerified'] is True and rollback['originalBatchAbsent'] is True and rollback['connectionCleanup']=='CLOSED'
host=ir['evidence']['host-result.json'];assert host['state']=='FRESH35_CONTROLLER_HOST_VERIFIED' and host['importState']=='COMMITTED' and host['replayState']=='ALREADY_COMMITTED' and host['readbackState']=='VERIFIED' and host['retainedHeaders']==25 and host['retainedSettlements']==27 and host['connectionCleanup']=='CLOSED' and ir['sourceResult']['syntheticImportVerified'] is True and ir['sourceResult']['independentSnapshotsVerified'] is True and ir['sourceResult']['ordinaryBusinessVerified'] is False
r25_native={'recordPublished':True,'state':installed['state'],'installState':installed['installState'],'postInstallFailureCode':ir['evidence']['failure.json']['code'],'sourceSetSha256':installed['sourceSetSha256']}
record=env/'phaseb-application-r25/authority/fresh35-combined-installation-v1.json';rs=record.lstat();assert stat.S_ISREG(rs.st_mode) and not stat.S_ISLNK(rs.st_mode) and rs.st_uid==0 and rs.st_nlink==1 and not rs.st_mode&0o022
r25_record={'exists':True,'uid':rs.st_uid,'mode':oct(stat.S_IMODE(rs.st_mode)),'bytes':rs.st_size,'contentsNotExported':True,'hashNotRepeated':True}
same=[]
matching_requests=sorted((control/'requests').glob('t45-f35-10fc5e*.json'));assert len(matching_requests)<=8
for p in matching_requests:
 if p.stem==job.name:continue
 result=control/'results'/p.name;v=json.loads(read(result)) if result.exists() else {};same.append({'jobId':p.stem,'status':v.get('status','UNKNOWN_NO_REPLAY'),'exitCode':v.get('exitCode')})
assert all(v['status'] in ('COMPLETED','FAILED') for v in same),'UNKNOWN_OR_IN_FLIGHT_ORIGINAL_KEY_NO_REPLAY'
mem={line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')}
out={'predecessorPortAbsence':'NOT_DIRECTLY_VERIFIED','predecessorCleanupPass':False,'predecessorGuardScope':'EXACT_STOPPED_FAILED_R25_AND_INDEPENDENT_NEW_NAMESPACE_ONLY','historicalPoststopSafeResultSHA256':None,'status':'READONLY_R26_STAGE_PREFLIGHT_COMPLETE_NOT_TRANSPORT_OR_PG_AUTHORIZATION','checkedAtEpochMillis':int(time.time()*1000),'gateSha256':policysha,'oldBytesRetained':str(job/'staging-policy-before.json'),'baseIdentity':identity,'baseArchiveSha256':ready['archiveSha256'],'baseHashNotRereadUntilOriginalAssembler':True,'privateFullIdentityUnchanged':True,'privateFullIdentity':pi,'r26RootAbsent':True,'r26ContainerAbsent':True,'r26ArtifactDirectoriesFound':[p.name for p in sorted((control/'artifacts').glob('f35-10fc5e*'))],'samePrefixOtherSubmissions':same,'priorExactJobs':prior,'r25PrivateOriginalReceiptMetadata':{'sha256':private_hash,'uid':private_stat.st_uid,'gid':private_stat.st_gid,'mode':oct(stat.S_IMODE(private_stat.st_mode)),'bytes':private_stat.st_size,'path':str(original_install),'readSource':'EXACT_ORIGINAL_ROOT_JOB_RESULT_NOT_PUBLIC_EXPORT'},'r25OrdinaryOriginalRequests':'UNKNOWN_NO_REPLAY_DB_NOT_QUERIED','r25OriginalNativeResult':r25_native,'r25PublishedRecordRetainedMetadata':r25_record,'r25Stopped':{'cid':r6['id'],'stopped':not r6['running'],'processAbsent':r6['pid']==0,'image':r6['image']},'r25Cleanup':{k:cleanup[k] for k in clean_keys},'r25CleanupErrors':cleanup['errors'],'fixedEnvironment':im,'environmentReceiptSha256':hashlib.sha256(receipt).hexdigest(),'resources':{'cpuCount':os.cpu_count(),'loadAverage':os.getloadavg(),'diskFreeBytes':shutil.disk_usage(base.parent).free,**mem},'sourceOrTargetWrites':0,'PGConnections':0,'networkOrServiceChanges':0,'dataExtraction':False}
(job/'results/stage-preflight.json').write_text(json.dumps(out))
