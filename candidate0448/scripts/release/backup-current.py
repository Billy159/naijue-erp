"""C02 current production preservation. Derived from accepted T45 paired-backup mechanism."""
import datetime,fcntl,hashlib,json,os,pathlib,re,shutil,socket,subprocess,tarfile,time
J=pathlib.Path(os.environ['ERP_SHARED_JOB_DIR']);OUT=J/'results';P=json.loads((J/'bundle'/'PLAN.json').read_text());START=time.monotonic()
V={'format':'rapid-launch-current-preservation-v1','jobId':P['jobId'],'status':'STARTED','startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionDataWrites':False,'productionRestart':False,'schemaChange':False,'credentialValuesExported':False,'restoreRehearsalRepeated':False}
def need(v,c):
 if not v:raise ValueError(c)
def sha_file(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def remaining():
 n=int(P['maximumSeconds']-(time.monotonic()-START));need(n>15,'BACKUP_DEADLINE');return n-10
def run(args,limit=90):
 p=subprocess.run(args,capture_output=True,timeout=min(limit,remaining()))
 if p.returncode:
  V['commandFailure']={'program':pathlib.Path(args[0]).name,'exitCode':p.returncode,'stderrSha256':hashlib.sha256(p.stderr).hexdigest()}
  raise ValueError('BACKUP_COMMAND_FAILED')
 return p.stdout.decode().strip()
def phase(name):
 V['phase']=name;(OUT/'preservation-progress.json').write_text(json.dumps({'phase':name,'elapsedSeconds':time.monotonic()-START})+'\n')
def services():
 values={}
 for name,e in P['services'].items():
  p=json.loads(run(['docker','inspect',name]))[0];s=p['State']
  actual={'imageId':p['Image'],'status':s['Status'],'startedAt':s['StartedAt'],'restartCount':p['RestartCount']}
  need(actual==e,'CURRENT_SERVICE_CHANGED');values[name]=actual
 return values
def shape(root):
 p=pathlib.Path(root);need(p.is_dir() and p.resolve()==p,'CANONICAL_SOURCE_DIRECTORY')
 rows=[]
 for f in p.rglob('*'):
  need(not f.is_symlink(),'SOURCE_SYMLINK_REFUSED')
  if f.is_file():
   s=f.stat();rows.append((str(f.relative_to(p)),s.st_size,s.st_mtime_ns,s.st_ctime_ns))
  else:need(f.is_dir(),'SOURCE_SPECIAL_FILE_REFUSED')
 return sorted(rows)
def metadata():
 code='import {readDatabaseConfig} from "./server/database/config.js";import {PgDataAccess} from "./server/database/access.js";const c=readDatabaseConfig(process.env);const a=new PgDataAccess(c,{maxConnections:1,statementTimeoutMs:15000});try{const m=await a.read(async s=>(await s.query("SELECT current_database() AS database,current_user AS role,current_setting(\'transaction_read_only\') AS read_only,pg_database_size(current_database())::text AS database_bytes")).rows[0]);process.stdout.write(JSON.stringify({instanceId:c.instanceId,clusterId:c.clusterId,metadata:m}));}finally{await a.close();}'
 return json.loads(run(['docker','exec','naijue-prod-app-1','node','--input-type=module','-e',code],40))
def main():
 need(os.geteuid()==0 and socket.gethostname()=='naijue-server' and os.environ['ERP_SHARED_TASK_ID']=='T45' and J.name==P['jobId'],'EXACT_PRESERVATION_SCOPE')
 before=services()
 for f,h in P['configurationPins'].items():need(sha_file(pathlib.Path(f))==h,'CONFIGURATION_DRIFT')
 meta=metadata();need(meta['metadata']['database']=='erp_prod' and meta['metadata']['read_only']=='on','TRUSTED_CURRENT_DATABASE_IDENTITY_REQUIRED')
 V['currentDatabaseIdentity']=meta
 root=pathlib.Path('/srv/naijue-erp/rapid-launch-20261022');parent=root/'backups';parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 pair=parent/P['backupId'];need(not pair.exists(),'BACKUP_ALREADY_EXISTS_NO_REPLAY');pair.mkdir(mode=0o700);V['backupPath']=str(pair)
 need(shutil.disk_usage(root).free>3*int(meta['metadata']['database_bytes'])+4*1024**3,'BACKUP_DISK_HEADROOM')
 media=pathlib.Path(P['media']);media_before=shape(media);configuration_before={s:shape(s) for s in P['configurationSources']}
 db='naijue-prod-db-1';raw='/tmp/'+P['backupId'];run(['docker','exec',db,'test','!','-e',raw])
 d=json.loads(run(['docker','inspect',db]))[0];env=dict(x.split('=',1) for x in d['Config']['Env']);user=env.get('POSTGRES_USER','')
 need(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}',user),'ACTUAL_DATABASE_BOOTSTRAP_ROLE_REQUIRED')
 phase('physical_database_and_streamed_wal')
 V['physicalStartedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 run(['docker','exec','--user','999:999',db,'pg_basebackup','--host=/var/run/postgresql','--username='+user,'--pgdata='+raw,'--wal-method=stream','--checkpoint=fast','--label='+P['backupId'],'--no-password'],600)
 V['physicalStoppedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 phase('copy_and_verify_new_physical_backup_once')
 run(['docker','cp',db+':'+raw,str(pair/'database')],600)
 result=run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','0:0','--mount','type=bind,source='+str(pair/'database')+',target=/backup,readonly','--entrypoint','pg_verifybackup',before[db]['imageId'],'/backup'],600)
 need('successfully verified' in result.lower(),'PHYSICAL_AND_WAL_VERIFY_REQUIRED')
 phase('opaque_current_media_configuration_and_application_images')
 archives={}
 for category,sources in [('media',[(str(media),'formal/media')]),('configuration',[(s,'configuration/'+str(i)) for i,s in enumerate(P['configurationSources'])])]:
  archive=pair/(category+'.protected.tar')
  with tarfile.open(archive,'x',format=tarfile.PAX_FORMAT) as t:
   for src,arc in sources:t.add(src,arcname=arc,recursive=True)
  os.chmod(archive,0o400)
  with tarfile.open(archive,'r:') as t:
   members=t.getmembers();need(all(not m.name.startswith('/') and '..' not in m.name.split('/') and not m.issym() and not m.islnk() for m in members),'ARCHIVE_MEMBER_BOUNDARY')
  archives[category]={'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha_file(archive),'members':len(members)}
 image_archive=pair/'application-images.protected.tar'
 run(['docker','image','save','--output',str(image_archive),before['naijue-prod-app-1']['imageId'],before['naijue-prod-web-1']['imageId']],300);os.chmod(image_archive,0o400)
 archives['applicationImages']={'path':str(image_archive),'bytes':image_archive.stat().st_size,'sha256':sha_file(image_archive),'imageIds':[before[n]['imageId'] for n in ['naijue-prod-app-1','naijue-prod-web-1']]}
 need(shape(media)==media_before and all(shape(s)==configuration_before[s] for s in P['configurationSources']),'MEDIA_OR_CONFIGURATION_CHANGED')
 need(services()==before,'RUNTIME_CHANGED_DURING_CAPTURE')
 for f,h in P['configurationPins'].items():need(sha_file(pathlib.Path(f))==h,'CONFIGURATION_DRIFT_AFTER_CAPTURE')
 after=metadata();need(after['instanceId']==meta['instanceId'] and after['clusterId']==meta['clusterId'] and after['metadata']['database']==meta['metadata']['database'],'DATABASE_IDENTITY_CHANGED')
 manifest=pair/'database/backup_manifest';m=json.loads(manifest.read_text());need(m.get('Files') and m.get('WAL-Ranges'),'PHYSICAL_MANIFEST_AND_WAL_RANGE_REQUIRED')
 V.update(status='PASS_FRESH_CURRENT_APP_DB_WAL_MEDIA_CONFIG_PRESERVED',phase='completed',services=before,archives=archives,databaseManifestSha256=sha_file(manifest),databaseFiles=len(m['Files']),walRanges=m['WAL-Ranges'],mediaFiles=len(media_before),mediaAndConfigurationShapesStable=True,configurationSourceMap=P['configurationSources'],physicalVerifiedOnce=True,existingRestoreEvidence='K/reports/controller/restore/RESTORE-RESULT-SCOPED.json',restoreLimit='Prior DB/media restore only; new application/new-account startup and production rollback not proven by this backup.',rollbackBoundary='Preserve unchanged old DB. New business writes in rewrite DB must be protected; never restore old DB snapshot over new accounting.',retainedRawContainerCopy=raw)
 (pair/'preservation.json').write_text(json.dumps(V,indent=2)+'\n');os.chmod(pair/'preservation.json',0o400)
def guard():
 code=0
 try:
  with open('/run/naijue-erp-hdd-test.lock','a+') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);main()
 except Exception as e:
  V.update(status='FAILED_PRESERVE_PARTIAL_NO_REPLAY',failureCode=str(e) if isinstance(e,ValueError) else type(e).__name__);code=2
 finally:
  V['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(OUT/'current-preservation.json').write_text(json.dumps(V,indent=2)+'\n')
 return code
if __name__=='__main__':raise SystemExit(guard())

