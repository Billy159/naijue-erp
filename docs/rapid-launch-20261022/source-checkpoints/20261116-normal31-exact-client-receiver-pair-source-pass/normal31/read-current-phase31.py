"""Read only the seven fixed original keys and their nonsecret public receipts."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,runpy,shlex,sys
HERE=Path(__file__).resolve().parent
RULES=HERE/'PHASES31.UNISSUED.json'
RULES_SHA = '5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf'
sha=lambda b:hashlib.sha256(b).hexdigest()
phase,destination=sys.argv[1:]
assert sha(RULES.read_bytes())==RULES_SHA
w=json.loads(RULES.read_bytes());key=w['jobs'][phase]['jobId']
client=HERE.parents[4].parent/'monitor/normal-admission-20261112-01/admin_client.py'
assert sha(client.read_bytes())=='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
m=runpy.run_path(str(client));cfg=m['state']();assert cfg['grantId']=='b16447fbc81f4d64'
program=r'''
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,stat,subprocess
PHASE=PHASE_LITERAL
KEY=KEY_LITERAL
START='t45-first-r3-native-service-start-20261116-31'
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
 'start':'normal-service-result.json','install':'batched-install-result.json','writer':'batched24-writer-result.json','stop':'normal05-preserve-stop-result.json'}
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
  material=R/'state/installed-real-operation-batched-root04-20261116-01'
  raw=take(material/'source-materialization.json');assert sha(raw)==out['rootPins']['result']=='8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1'
  out['operatorReadySha256']=sha(raw)
  paths=[material,material/'operation',material/'operation/tools',material/'operation/tools/unified-import',
   material/'operation/tools/unified-import/r3-service20-entry.mjs',material/'source-materialization.json']
  modes=[]
  for path in paths:
   s=path.lstat();assert not path.is_symlink() and s.st_uid==0
   modes.append({'path':str(path),'uid':s.st_uid,'gid':s.st_gid,'mode':stat.S_IMODE(s.st_mode),'directory':stat.S_ISDIR(s.st_mode)})
  out['nonrootSourceModeFacts']=modes
  out['nonrootSourceReadableByMode']=all(x['mode']&(0o001 if x['directory'] else 0o004) for x in modes)
 for leaf in ['maintenance-auth-cleanup.json','batched-install-incomplete.json','batched24-writer-child-cleanup.json','normal-service-incomplete.json']:
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
  raw=take(R/'authority/fresh35-current-production-service-v2-service-31.json');p=json.loads(raw);birth=p['sharedPostgresNamespace']['container']
  a=json.loads(take(R/'state/native-services'/START/'service-start-authorization.json'))
  assert sha(raw)==out['result']['proofSha256'] and p['requestKey']==KEY
  out.update(service={'serviceKey':KEY,'proofSha256':sha(raw),'containerId':birth['id'],'containerStartedAt':birth['startedAt'],'postmasterStart':p['physical']['postmasterStart']},
   physical=p['physical'],outerAuthorityLeaseExpiresAt=a['serviceLeaseExpiresAt'],actualSharedServiceWorkDeadline=p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],
   retainedAckConfirmed=True,readOnlyReadiness=out['result']['readOnlyReadiness'],startAuthorityStartsAt=a['startsAt'],
   lockCapacitySettingsSha256=out['result']['lockCapacitySettingsSha256'])
  out['rootResultSha256']=out['rootPins']['result']
  out['rawCapacitySettingsSha256']=out['lockCapacitySettingsSha256']
  ack=json.loads(take(R/'state/native-services'/START/'retained-ack.json'))
  assert ack=={'requestKey':KEY,'proofSha256':sha(raw),'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']}
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
  assert payload=={'service':out['service'],'backupAdminValidUntil':d['backupAdminValidUntil'],'installStartsAt':d['startsAt'],'installExpiresAt':d['expiresAt']}
  assert facts['service']==out['service'] and d['currentServiceSha256']==sha(raw) and d['postmasterStart']==p['physical']['postmasterStart']
  assert facts['actualSharedServiceWorkDeadline']==p['sharedPostgresNamespace']['serviceLeaseExpiresAt']-35000
  assert process['requestKey']==KEY and process['exitCode']==0 and process['reason'] is None and process['childReaped'] and process['ownedProcessGroupReaped'] and process['descendantsReaped']
  normalized={**facts,'actualSharedServiceWorkDeadline':p['sharedPostgresNamespace']['serviceLeaseExpiresAt'],'workDeadlineBasis':'PROTECTED_CURRENT31_SHARED_POSTGRES_NAMESPACE'}
  out.update(describeStoredOutputs=bodies,descriptor=d,rawLiveFacts=facts,liveFacts=normalized,describePayload=payload,describeProcess=process,
   installStartsAt=d['startsAt'],installExpiresAt=d['expiresAt'],backupAdminValidUntil=d['backupAdminValidUntil'],
   runnerConservativeWorkDeadline=facts['actualSharedServiceWorkDeadline'],descriptionSource='STORED_START_JOB_OUTPUTS_NO_NODE_RERUN',descriptionRootPublicObjectsMatched=True)

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
 out['retainedAckValidated']=incomplete.get('retainedAckValidated') is True
 out['currentProofPresent']=incomplete.get('currentProofPresent')
 out['currentProofSha256']=incomplete.get('currentProofSha256')
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
print(json.dumps(out,sort_keys=True))
'''.replace('PHASE_LITERAL',repr(phase)).replace('KEY_LITERAL',repr(key))
raw=m['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',program]))
p=Path(destination);p.parent.mkdir(parents=True,exist_ok=True)
with p.open('xb') as f:f.write(raw)
v=json.loads(raw)
print(json.dumps({'receipt':str(p),'sha256':sha(raw),'checkedAtUTC':v['checkedAtUTC'],'requestKey':key,
 'terminal':v.get('terminal'),'state':v.get('result',{}).get('state',v.get('result',{}).get('status')),
 'pgdataPidAbsent':v['pgdataPidAbsent'],'operationUnit':v['operationUnit']},sort_keys=True))

if phase=='start' and v.get('descriptionRootPublicObjectsMatched') is True:
 folder=p.with_name(p.stem+'-describe');folder.mkdir(mode=0o700)
 for kind,ref in v['describeStoredOutputs'].items():
  body=ref['text'].encode('utf8');assert len(body)==ref['bytes'] and sha(body)==ref['sha256']
  with (folder/ref['leaf']).open('xb') as f:f.write(body)
 for leaf,value in [('DESCRIPTOR.json',v['descriptor']),('LIVE-FACTS.json',v['liveFacts']),('PAYLOAD.json',v['describePayload'])]:
  body=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
  with (folder/leaf).open('xb') as f:f.write(body)
  print(json.dumps({'receipt':str(folder/leaf),'sha256':sha(body),'bytes':len(body),'source':'STORED_START_OUTPUT_NO_NODE_RERUN'}))
