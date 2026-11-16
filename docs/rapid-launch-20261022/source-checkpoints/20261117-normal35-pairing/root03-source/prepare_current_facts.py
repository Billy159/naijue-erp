"""Read immutable local predecessors for normal35; no successor keys, permits or live reads."""
from pathlib import Path
import hashlib,json,runpy,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
PREV=HERE.parent/'20261117-r3-normal34-apply02-root-source-02'
T=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
G=Path('/Users/billy/.codex/worktrees/erp-0448z-integration/erp-e5c5a762-cleaning-20261102')
REL='docs/rapid-launch-20261022/source-checkpoints/20261117-normal34-apply02-cli'
ARCHIVE=G/REL;COMMIT='afb604a6fee7d7aeea516acf0fb91409a9ba06b1'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def read(path,pin=None):
 raw=path.read_bytes()
 if pin is not None:assert sha(raw)==pin,path
 return json.loads(raw)
base=runpy.run_path(str(PREV/'register_cas.py'),run_name='local_source_constants_only')
closed={}
for phase,rel,pin,leaf in [
 ('apply','NORMAL34-APPLY02-RUNTIME-01/ACTUAL-APPLY02-COMPLETED.json','428e0a98fd9355d3643e37caa52f3c03c8044850c5ca0f52fef5aa01aa5c4aa3','maintenance-auth-result.json'),
 ('start','NORMAL34-APPLY02-RUNTIME-01/start/ACTUAL-START34-RESULT.json','09a37c519d0ca0433191977dd9d1f2466ceb0337d7763b284e1a03c19b1afd8d','normal-service-result.json'),
 ('restore','NORMAL34-APPLY02-RUNTIME-01/restore/ACTUAL-RESTORE34-COMPLETED.json','1dab92bb68f7a6051205fec4de10e476a9ba018a7f4fffcaadb933c604d62703','maintenance-auth-result.json')]:
  actual=read(T/rel,pin)
  archive=ARCHIVE/'actual'/Path(rel).name
  assert sha(archive.read_bytes())==pin
  committed=subprocess.run(['git','-C',str(G),'show',COMMIT+':'+REL+'/actual/'+archive.name],capture_output=True,check=True)
  assert sha(committed.stdout)==pin
  assert actual['resultObjectsEqual'] is True
  closed[phase]={'path':str(T/rel),'typedSha256':pin,'requestKey':actual['requestKey'],
   'terminal':actual['terminal'],'terminalSha256':actual['rootPins']['terminal'],
   'rootResultSha256':actual['rootPins']['result'],'publicResultSha256':actual['publicResultSha256'],
   'leaf':leaf,'value':actual['result'],'actual':actual}
assert closed['apply']['terminal']['status']==closed['restore']['terminal']['status']=='COMPLETED'
assert closed['apply']['terminal']['exitCode']==closed['restore']['terminal']['exitCode']==0
assert closed['start']['terminal']['status']=='FAILED' and closed['start']['terminal']['exitCode']==2
assert all(row['terminal']['phaseStarted'] is True for row in closed.values())
reg=read(T/'NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01/ACTUAL-ROOT-REGISTRATION-READBACK.json','d2d30c8b8f4e9dd2605714e9e9f35dc470423ca4bb556620a23d234504e2345e')
issued=read(ARCHIVE/'actual/APPLY02-REGISTRATION-ISSUED-SUMMARY.json')
summary_committed=subprocess.run(['git','-C',str(G),'show',COMMIT+':'+REL+'/actual/APPLY02-REGISTRATION-ISSUED-SUMMARY.json'],capture_output=True,check=True)
assert summary_committed.stdout==(ARCHIVE/'actual/APPLY02-REGISTRATION-ISSUED-SUMMARY.json').read_bytes()
assert issued['rolesSha256'].startswith('06ada')
B,P,H=(base[key] for key in ('B','P','H'))
basis={str(k):v for k,v in base['BASIS'].items()}
basis[str(P/'admin_exec.py')]=reg['actualPins']['dispatcher']
basis[str(base['NEW_MODULE'])]=reg['actualPins']['module']
basis[str(base['NEW_POLICY'])]=reg['actualPins']['policy']
basis[str(base['AUDIT']/'result.json')]=reg['auditResultSha256']
basis[str(base['AUDIT']/'old-dispatcher.bin')]=base['OLD_DISPATCHER']
for phase,row in closed.items():
 job=B/'jobs'/row['requestKey'];basis[str(job/'r3-outer-terminal.json')]=row['terminalSha256'];basis[str(job/'results'/row['leaf'])]=row['rootResultSha256']
 if phase in ('apply','restore'):basis[str(job/'results/maintenance-auth-cleanup.json')]=row['actual']['rootPins']['cleanup']
host=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
start=closed['start']['actual'];boot=host/'state/native-services'/start['requestKey']
tuple_metadata=read(T/'NORMAL35-UNISSUED-01/PRIOR34-C-METADATA.json','7fed632320839f81486b66c13731322fda8da0157afc0eb97a3ecec43b274d19')
assert tuple_metadata['proofSha256']==start['currentProofSha256'] and tuple_metadata['serviceKey']==start['requestKey'] and tuple_metadata['containerId']==start['incomplete']['cid']
assert tuple_metadata['sameFileIdentityAfterRead'] is True and tuple_metadata['snapshotBodiesOrDigestsRead'] is False
previous_service={key:tuple_metadata[key] for key in ('serviceKey','proofSha256','containerId','containerStartedAt','postmasterStart')}
basis[str(B/'jobs'/start['requestKey']/'results/normal-service-incomplete.json')]=start['incompleteRootSha256']
basis[str(boot/'failed-start-cleanup.json')]=start['cleanupRootSha256']
basis[str(boot/'retained-ack.json')]=start['incomplete']['retainedAckSha256']
basis[str(host/'authority/fresh35-current-production-service-v2-service-34.json')]=start['currentProofSha256']
bundle=T/'NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01/start/bundle'
for leaf in ('normal_service05_after08.py','normal_service05_after08_proof.py'):
 basis[str(B/'jobs'/start['requestKey']/'bundle'/leaf)]=sha((bundle/leaf).read_bytes())
custody=host/'state/native-services/ordinary34-auth-20261116-01'
basis[str(custody/'authority.json')]=issued['rolesSha256']
basis[str(custody/'restored.json')]=closed['restore']['actual']['privateRestorationReceiptSha256']
private_metadata=list(base['CUSTODY_FILES'])+[str(custody/leaf) for leaf in ('original-auth.json','finite-auth.json','applied.json','restore-attempt.json')]
assert len(private_metadata)==8
for row in closed.values():row.pop('actual')
v={'state':'NORMAL35_LOCAL_PREDECESSOR_PREPARED_PENDING_T45_FROZEN_CONSUMER','currentRoot':reg['actualPins'],
 'basis':basis,'basisEntries':len(basis),'privateMetadataOnlyPaths':private_metadata,
 'identityCountWithOriginalLock':len(basis)+len(private_metadata)+1,'closed34':closed,
 'start34Incomplete':start['incomplete'],'start34IncompleteRootSha256':start['incompleteRootSha256'],
 'start34IncompletePublicSha256':start['incompletePublicSha256'],'start34CurrentProofSha256':start['currentProofSha256'],
 'start34RetainedAckSha256':start['incomplete']['retainedAckSha256'],'start34Cleanup':start['cleanup'],
 'start34ServiceTuple':previous_service,'start34TupleMetadataSha256':'7fed632320839f81486b66c13731322fda8da0157afc0eb97a3ecec43b274d19',
 'start34CleanupSha256':start['cleanupRootSha256'],'restored34SafeReceiptSha256':basis[str(custody/'restored.json')],
 'used34RolePermitSha256':issued['rolesSha256'],'archiveCommitReadVerified':COMMIT,
 'previous203BasisPreservedExceptCurrentDispatcherAndPolicy':True,
 'completedInput02AndROOT06NeverReplay':True,'originalBusinessKeysAndINITUnchanged':True,
 'successorConsumer':'PENDING_T45_EXACT_FREEZE','newRolePermit':'NOT_CREATED_USED34_NEVER_REUSED_OR_EXTENDED',
 'newClockIssued':False,'newKeyCreated':False,'serverConnections':0,'PGConnections':0}
(HERE/'CURRENT-FACTS.json').write_text(json.dumps(v,sort_keys=True,indent=2)+'\n')
print(json.dumps({key:v[key] for key in ('state','basisEntries','identityCountWithOriginalLock','archiveCommitReadVerified','newClockIssued','PGConnections')}))
