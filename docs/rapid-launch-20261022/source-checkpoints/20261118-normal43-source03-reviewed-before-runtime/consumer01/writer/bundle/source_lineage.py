"""Historical catalog35/Root07 and actual Root08/Upgrade42 remain distinct."""
from types import ModuleType
import hashlib,json,stat
LINEAGE_SHA256='cc6e6544cf3c99b62c837675c7b92452af95d6f7cdbbaff72d28dcfac739c5b6'
sha=lambda b:hashlib.sha256(b).hexdigest()
def need(v,c):
 if not v:raise ValueError('AFTER42_LINEAGE_'+c)
def validate_material(read,jobs,control,host_state,job):
 raw=read(job/'bundle/after42-source-catalog-lineage.json',131072)
 need(sha(raw)==LINEAGE_SHA256,'EXACT_SOURCE_LINEAGE_REQUIRED');p=json.loads(raw);m=p['root08'];key=m['key']
 raw=read(jobs/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)==m['terminalSha256'] and raw==read(control/'results'/(key+'.json'),owner=1000)
  and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'ROOT08_TERMINAL_REQUIRED')
 raw=read(jobs/key/'results/batched-source-materialization.json');public=read(control/'jobs'/key/'results/batched-source-materialization.json',owner=1000)
 marker=host_state/'installed-real-operation-batched-root08-20261117-01/source-materialization.json'
 need(sha(raw)==m['rootResultSha256'] and sha(public)==m['publicResultSha256'] and json.loads(raw)==json.loads(public)==m['marker'] and read(marker)==raw,'ROOT08_MARKER_REQUIRED')
 return p

def validate(a,read,jobs,control,host_state,job):
 # The old helper is used strictly for the old prepare/native historical witness.
 raw=read(job/'bundle/historical_source_lineage.py',65536)
 need(sha(raw)=='c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736','HISTORICAL_HELPER_REQUIRED')
 old=ModuleType('historical_source_lineage');exec(compile(raw,'historical_source_lineage.py','exec'),old.__dict__)
 olda=dict(a);olda.update(expectedBinding=a['originalExecutionBinding'],operatorReadySha256='84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065',sourceLineage={'lineageSha256': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'materializationPublicResultSha256': '549e0670727b55f057cc11706ae0886be8f9310e50e452988031c36673eb3469', 'materializationResultSha256': '84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065', 'materializationTerminalSha256': 'f1228d139a4588d52af17fc611fb0f10bd0a0960b1d74b8f229928a9906edb9d'})
 old.validate(olda,read,jobs,control,host_state,job)
 p=validate_material(read,jobs,control,host_state,job);u=p['upgrade42'];key=u['key']
 need(a['sourceLineage']=={'lineageSha256':LINEAGE_SHA256,'materializationTerminalSha256':p['root08']['terminalSha256'],'materializationResultSha256':p['root08']['rootResultSha256'],'materializationPublicResultSha256':p['root08']['publicResultSha256'],'upgradeTerminalSha256':u['terminalSha256'],'upgradeResultSha256':u['rootResultSha256'],'upgradeCompletionSha256':u['result']['completionSha256']},'EXACT_NEW_REFS_REQUIRED')
 raw=read(jobs/key/'r3-outer-terminal.json');t=json.loads(raw)
 need(sha(raw)==u['terminalSha256'] and raw==read(control/'results'/(key+'.json'),owner=1000) and(t['jobId'],t['status'],t['exitCode'])==(key,'COMPLETED',0),'UPGRADE42_TERMINAL_REQUIRED')
 raw=read(jobs/key/'results/batched161-command-update-result.json');public=read(control/'jobs'/key/'results/batched161-command-update-result.json',owner=1000);r=json.loads(raw)
 need(sha(raw)==u['rootResultSha256'] and sha(public)==u['publicResultSha256'] and r==json.loads(public)==u['result'],'UPGRADE42_RESULT_REQUIRED')
 need(r['state']=='SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK' and r['connectionCleanup']=='CLOSED' and r['businessImported']is False and r['commitOutcomeUnknown']is False and all(r[k]is True for k in('commitAcknowledged','postCommitReadback','roleRestoreAcknowledged','innerAuthorityRemoved','childReaped','descendantsReaped')),'UPGRADE42_ACK_CLEANUP_REQUIRED')
 after=r['batchedCatalog'];binding=a['expectedBinding']
 need(all(binding.get('batched'+k[0].upper()+k[1:])==v for k,v in after.items()),'CURRENT_CATALOG_REQUIRED')
 capture=host_state/host_state.parent.name/r['captureDirectoryLeaf'];z=capture.lstat()
 need(capture.resolve()==capture and stat.S_ISDIR(z.st_mode)and(z.st_uid,z.st_gid,stat.S_IMODE(z.st_mode))==(0,0,0o700),'PROTECTED_CAPTURE_REQUIRED')
 commit=json.loads(read(capture/'commit.json'));need(commit==dict(requestKey=key,programSha256=r['programSha256'],commitAcknowledged=True),'COMMIT_ACK_REQUIRED')
 completion=read(capture/'completion.json');done=json.loads(completion)
 need(sha(completion)==r['completionSha256'] and done['requestKey']==key and done['service']==r['service'] and done['programSha256']==r['programSha256'] and all(done[k]==r[k]for k in('commitAcknowledged','postCommitReadback','catalogSha256','beforeCatalogSha256','routineAttributesSha256','batchedCatalog','reviewedInputSha256','sqlSha256','businessImported')),'COMPLETION_REQUIRED')
 for leaf,key in(('catalog-before.json','beforeCatalogSha256'),('catalog-after.json','catalogSha256')):
  raw=read(capture/leaf,16*1024*1024);need(raw.endswith(b'\n')and sha(raw[:-1])==r[key],'EXACT_CAPTURE_REQUIRED')
 return p
