
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
PHASE='start'
KEY='t45-first-r3-native-service-start-20261118-43'
START='t45-first-r3-native-service-start-20261118-43'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
sha=lambda b:hashlib.sha256(b).hexdigest()
def take(p,uid=0,*,allow_empty=False,maximum=65536):
 assert p.resolve()==p
 with os.fdopen(os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
  s=os.fstat(f.fileno());assert stat.S_ISREG(s.st_mode) and s.st_uid==uid and s.st_nlink==1 and not s.st_mode&0o022 and (0 if allow_empty else 1)<=s.st_size<=maximum
  raw=f.read(maximum+1);assert len(raw)==s.st_size
  ident=lambda z:(z.st_dev,z.st_ino,z.st_uid,z.st_gid,z.st_mode,z.st_nlink,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
  assert ident(s)==ident(os.fstat(f.fileno()))==ident(p.lstat())
 return raw
leaves={'materialize':'batched-source-materialization.json','apply':'maintenance-auth-result.json','restore':'maintenance-auth-result.json',
 'start':'normal-service-result.json','catalog_update':'batched161-command-update-result.json','prepare':'final33-prepare-result.json','writer':'final33-writer-result.json','stop':'normal05-preserve-stop-result.json'}
out={'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'requestKey':KEY,'phase':PHASE,
 'requestPresent':os.path.lexists(C/'requests'/(KEY+'.json')),'rootJobPresent':os.path.lexists(B/KEY),'databaseConnections':0,'mutations':0,'privateBodiesRead':False}
terminal=B/KEY/'r3-outer-terminal.json'
if terminal.is_file():
 raw=take(terminal);pub=take(C/'results'/(KEY+'.json'),1000);assert raw==pub
 out['terminal']=json.loads(raw);out['rootPins']={'terminal':sha(raw)};out['terminalRootPublicSha256']=sha(raw)
 leaf=leaves[PHASE];p=B/KEY/'results'/leaf
 if p.is_file():
  raw=take(p,allow_empty=True);out['rootPins']['result']=sha(raw)
  pubpath=C/'jobs'/KEY/'results'/leaf
  pub=take(pubpath,1000,allow_empty=True) if pubpath.is_file() else None
  out['publicResultSha256']=sha(pub) if pub is not None else None
  try:
   value=json.loads(raw);public_value=json.loads(pub) if pub is not None else None
   assert isinstance(value,dict) and value==public_value
   out.update(result=value,resultObjectsEqual=True)
  except (ValueError,AssertionError,TypeError):
   out.update(resultReadError='RESULT_JSON_OR_PUBLIC_COPY_UNCONFIRMED',resultObjectsEqual=False)

 if PHASE=='materialize' and out['terminal']['status']=='COMPLETED' and out['terminal']['exitCode']==0:
  material=R/'state/installed-real-operation-batched-root06-20261116-01'
  raw=take(material/'source-materialization.json');assert sha(raw)==out['rootPins']['result']=='73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171'
  out['operatorReadySha256']=sha(raw)
  paths=[material,material/'operation',material/'operation/tools',material/'operation/tools/unified-import',
   material/'operation/tools/unified-import/r3-service20-entry.mjs',material/'source-materialization.json']
  modes=[]
  for path in paths:
   s=path.lstat();assert not path.is_symlink() and s.st_uid==0
   modes.append({'path':str(path),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'directory':stat.S_ISDIR(s.st_mode)})
  out['nonrootSourceModeFacts']=modes
  out['nonrootSourceReadableByMode']=all(x['mode']&(0o001 if x['directory'] else 0o004) for x in modes)
 for leaf in ['maintenance-auth-cleanup.json','batched161-command-update-incomplete.json','final33-prepare-child-cleanup.json','final33-writer-child-cleanup.json','final33-prepare-incomplete.json','final33-writer-incomplete.json','normal-service-incomplete.json']:
  p=B/KEY/'results'/leaf
  if p.is_file():
   raw=take(p);pub=take(C/'jobs'/KEY/'results'/leaf,1000);assert json.loads(raw)==json.loads(pub)
   if leaf=='maintenance-auth-cleanup.json':out['cleanup']=json.loads(raw);out['rootPins']['cleanup']=sha(raw)
   elif leaf=='normal-service-incomplete.json':
    out.update(incomplete=json.loads(raw),incompleteRootSha256=sha(raw),incompletePublicSha256=sha(pub),incompleteObjectsEqual=True)
    out['rootPins']['incomplete']=sha(raw)
   else:out[leaf]=dict(rootSha256=sha(raw),publicSha256=sha(pub),objectsEqual=True,value=json.loads(raw))
 if PHASE=='start' and (B/KEY/'results/genuine-describe-process.json').is_file():
  process_raw=take(B/KEY/'results/genuine-describe-process.json');process_public=take(C/'jobs'/KEY/'results/genuine-describe-process.json',1000)
  assert json.loads(process_raw)==json.loads(process_public)
  out.update(describeProcess=json.loads(process_raw),describeProcessRootSha256=sha(process_raw),describeProcessPublicSha256=sha(process_public))
 if PHASE=='start' and out['terminal']['status']=='COMPLETED' and out['terminal']['exitCode']==0:
  proof_path=R/'authority/fresh35-current-production-service-v2-service-43.json';meta=proof_path.lstat()
  assert proof_path.resolve()==proof_path and stat.S_ISREG(meta.st_mode)and meta.st_uid==meta.st_gid==0 and stat.S_IMODE(meta.st_mode)==0o444 and meta.st_nlink==1
  raw=take(proof_path);p=json.loads(raw);birth=p['sharedPostgresNamespace']['container']
  a_raw=take(R/'state/native-services'/START/'service-start-authorization.json');a=json.loads(a_raw)
  assert p['sharedPostgresNamespace']['serviceLeaseExpiresAt']+35000==a['serviceLeaseExpiresAt']
  data=R/'state'/R.name/'data';ds=data.lstat()
  data_identity=dict(device=ds.st_dev,inode=ds.st_ino,uid=ds.st_uid,gid=ds.st_gid,mode=stat.S_IMODE(ds.st_mode))
  assert data.resolve()==data and stat.S_ISDIR(ds.st_mode) and data_identity==p['dataDirectoryIdentity']
  assert sha(raw)==out['result']['proofSha256'] and p['requestKey']==KEY==a['requestKey'] and sha(a_raw)==p['authorizationSha256']
  out.update(service={'serviceKey':KEY,'proofSha256':sha(raw),'containerId':birth['id'],'containerStartedAt':birth['startedAt'],'postmasterStart':p['physical']['postmasterStart']},
   physical=p['physical'],dataDirectoryIdentity=data_identity,outerAuthorityLeaseExpiresAt=a['serviceLeaseExpiresAt'],actualSharedServiceWorkDeadline=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],
   applyBinding={'requestKey':a['applyRequestKey'],'terminalSha256':a['applyTerminalSha256'],'publicResultSha256':a['applyResultSha256']},
   retainedAckConfirmed=True,readOnlyReadiness=out['result']['readOnlyReadiness'],startAuthorityStartsAt=a['startsAt'],
   lockCapacitySettingsSha256=out['result']['lockCapacitySettingsSha256'])
  out['rootResultSha256']=out['rootPins']['result']
  out['rawCapacitySettingsSha256']=out['lockCapacitySettingsSha256']
  ackraw=take(R/'state/native-services'/START/'retained-ack.json');ack=json.loads(ackraw)
  out['retainedAckSha256']=sha(ackraw)
  assert ack=={'requestKey':KEY,'proofSha256':sha(raw),'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']}
  out.update(retainedAckValidated=True,currentProofPresent=True,currentProofSha256=sha(raw))
  described=out['result']['describe']
  assert described['state']=='PROGRAM_DESCRIBED_NO_PG_OR_WRITE' and described['databaseConnections']==described['mutations']==0
  refs=described['outputs'];expected={'payload':'genuine-describe-payload.json','descriptor':'genuine-descriptor.json','liveFacts':'genuine-live-facts.json','process':'genuine-describe-process.json'}
  assert set(refs)==set(expected)
  bodies={};values={}
  for kind,leaf in expected.items():
   ref=refs[kind];limit=65536 if kind in ('payload','process') else 131072
   assert set(ref)=={'leaf','bytes','sha256'} and ref['leaf']==leaf and type(ref['bytes']) is int and 0<ref['bytes']<=limit
   body=take(R/'state/native-services'/START/leaf,maximum=limit)
   assert len(body)==ref['bytes'] and sha(body)==ref['sha256']
   assert body==take(B/KEY/'results'/leaf,maximum=limit)
   public=take(C/'jobs'/KEY/'results'/leaf,1000,maximum=limit);assert json.loads(body)==json.loads(public)
   bodies[kind]={**ref,'text':body.decode('utf8'),'publicSha256':sha(public),'publicBytes':len(public)};values[kind]=json.loads(body)
  assert sum(ref['bytes'] for ref in refs.values())<=262144
  d=values['descriptor'];facts=values['liveFacts'];payload=values['payload'];process=values['process']
  assert payload=={'service':out['service'],'backupAdminValidUntil':facts['backupAdminValidUntil']}
  assert d['format']=='FRESH35_FINAL_R3_EXECUTION_DESCRIPTION_V1' and d['requestKey']=='t45-r3-batched-real-after42-execute-20261118-01'
  assert d['service']==facts['service']==out['service'] and d['currentServiceSha256']==sha(raw) and d['postmasterStart']==p['physical']['postmasterStart']
  assert d['expectedBinding']==facts['expectedBinding'] and facts['physical']==p['physical']
  assert facts['actualSharedServiceWorkDeadline']==p['sharedPostgresNamespace']['serviceLeaseExpiresAt']
  assert facts['runnerConservativeWorkDeadline']==facts['actualSharedServiceWorkDeadline']-35000
  assert process['requestKey']==KEY and process['exitCode']==0 and process['reason'] is None and process['childReaped'] and process['ownedProcessGroupReaped'] and process['descendantsReaped']
  normalized={**facts,'workDeadlineBasis':'PROTECTED_CURRENT43_SHARED_POSTGRES_NAMESPACE'}
  out.update(describeStoredOutputs=bodies,descriptor=d,rawLiveFacts=facts,liveFacts=normalized,describePayload=payload,describeProcess=process,
   backupAdminValidUntil=facts['backupAdminValidUntil'],runnerConservativeWorkDeadline=facts['runnerConservativeWorkDeadline'],
   expectedBinding=d['expectedBinding'],descriptionSource='STORED_START_JOB_OUTPUTS_NO_NODE_RERUN',descriptionRootPublicObjectsMatched=True)

 if PHASE=='stop' and (R/'state/native-services'/START/'cleanup.json').is_file():
  raw=take(R/'state/native-services'/START/'cleanup.json');out['cleanup']=json.loads(raw);out['rootPins']['cleanup']=sha(raw);out['cleanupRootSha256']=sha(raw)
if PHASE=='start':
 out['normalResultRootSha256']=out.get('rootPins',{}).get('result')
 out['normalResultPublicSha256']=out.get('publicResultSha256')
 incomplete=out.get('incomplete',{})
 if incomplete.get('confirmed') is True and incomplete.get('containerStopped') is True:
  leaf=incomplete.get('cleanStop',{}).get('cleanupLeaf')
  assert leaf in ('cleanup.json','failed-start-cleanup.json')
  raw=take(R/'state/native-services'/START/leaf)
  assert sha(raw)==incomplete['cleanStop']['cleanupSha256']
  out.update(cleanup=json.loads(raw),cleanupRootSha256=sha(raw),cleanupLeaf=leaf,cleanupEvidenceSource='HOST_BOOT')
  out['rootPins']['cleanup']=sha(raw)
 if incomplete.get('format')=='T45_R3_PRECONTAINER_FAILURE_V1':
  out['failureEvidenceType']=incomplete['state']
 # A pre-container failure has no cleanup receipt. Its normal result remains a distinct field.
 out.setdefault('retainedAckValidated',incomplete.get('retainedAckValidated') is True)
 out.setdefault('currentProofPresent',incomplete.get('currentProofPresent'))
 out.setdefault('currentProofSha256',incomplete.get('currentProofSha256'))
 out['retainedAckAbsent']=not os.path.lexists(R/'state/native-services'/START/'retained-ack.json')
 out['portAbsent']=not subprocess.run(['/usr/bin/ss','-H','-ltn','sport = :56791'],capture_output=True,check=True,timeout=5).stdout.strip()
units=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,check=True,timeout=5).stdout.decode().splitlines()
active=[row.split()[0] for row in units if row.strip()]
own='naijue-erp-op-b16447fb-'+sha(KEY.encode())[:12]+'.service'
out['activeOperationUnits']=active
out['noOtherOperationUnits']=all(name==own for name in active)
out['ownOperationUnitInactive']=own not in active
out['pgdataPidAbsent']=not os.path.lexists(R/'state'/R.name/'data/postmaster.pid')
unit='naijue-erp-op-b16447fb-'+sha(KEY.encode())[:12]+'.service'
q=subprocess.run(['/usr/bin/systemctl','show','--property=ActiveState,SubState','--no-pager',unit],capture_output=True,timeout=5)
out['operationUnit']={'name':unit,'returncode':q.returncode,'state':q.stdout.decode().strip().splitlines()}
request_raw=take(B/KEY/'request.json');request=json.loads(request_raw)
issued_start=take(B/KEY/'bundle/service-start-authorization.json')
assert request['jobId']==KEY and request['args']==[sha(issued_start)] and request['timeoutSeconds']==300 and request['script']=='normal_service05_after08.py'
if out.get('terminal',{}).get('status')=='COMPLETED'and out['terminal']['exitCode']==0:assert issued_start==a_raw
out['actualServerRequestSha256']=sha(request_raw);out['actualServerRequestArgs']=request['args']

print(json.dumps(out,sort_keys=True))
