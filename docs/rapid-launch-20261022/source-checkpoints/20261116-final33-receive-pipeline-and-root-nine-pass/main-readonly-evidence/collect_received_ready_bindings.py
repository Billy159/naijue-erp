"""Project completed native READY receipts into ordered materializer bindings only."""
from pathlib import Path
import hashlib,json,re,sys
R=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1');V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01';sha=lambda b:hashlib.sha256(b).hexdigest()
profile=V/'INPUT-RECEPTION-01/MATERIALIZATION-02/bundle/input-profile.json';assert sha(profile.read_bytes())=='71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7';p=json.loads(profile.read_bytes());rows=[r for archive in p['archives']for r in archive['fragments']];assert len(rows)==211;expected={r['key']:r for r in rows};found={};refs={}
files=[f for base in ('CACHED-02','CACHED-03')for f in (V/'INPUT-RECEPTION-01'/base).glob('execution-*/RESULT.json')]
for f in sorted(files,key=lambda q:q.stat().st_mtime_ns):
 raw=f.read_bytes();d=json.loads(raw);restored=d.get('restored')or{}
 if not (d.get('finalPolicyAbsent')is True and d.get('finalPolicy')=={'state':'ENOENT'} and restored.get('status')=='COMPLETED' and restored.get('exitCode')==0):continue
 for key,state in (d.get('originalKeys')or{}).items():
  if key not in expected or state.get('status')!='READY' or state.get('basis')!='EXACT_WITHDRAWN_BATCH_READONLY':continue
  receipt=state.get('receipt')or{};ready=state.get('ready')or{};row=expected[key]
  assert receipt.get('status')=='READY' and receipt.get('manifestSha256')==p['manifestSha256'] and receipt.get('artifactKey')==key
  assert all(receipt.get(k)==row[k]for k in ('archiveSha256','archiveBytes','fragmentIndex','fragmentOffset'))
  assert state.get('bytes')==row['archiveBytes'] and state.get('prefixSha256')==row['archiveSha256'] and receipt['fileIdentity']==state['fileIdentity']
  assert ready.get('authoritySha256')==receipt.get('authoritySha256') and all(type(v)is str and re.fullmatch('[0-9a-f]{64}',v)for v in (ready.get('sha256'),ready.get('authoritySha256')))
  binding={'key':key,'authoritySha256':ready['authoritySha256'],'readySha256':ready['sha256']}
  if key in found:assert found[key]==binding,'A previously completed original READY changed'
  found[key]=binding;refs[key]={'resultPath':str(f),'resultSha256':sha(raw),'sourceReadyRecordSha256':ready['sha256'],'sourceReceiptAuthoritySha256':ready['authoritySha256']}
report={'state':'ALL211_ORIGINAL_READY_BINDINGS_COLLECTED'if len(found)==211 else 'PARTIAL_ORIGINAL_READY_BINDINGS_COLLECTED_NO_MATERIALIZATION_AUTHORITY','profileSha256':sha(profile.read_bytes()),'manifestSha256':p['manifestSha256'],'readyCount':len(found),'requiredCount':211,'receivedParts':[found[r['key']]for r in rows if r['key']in found],'missingKeys':[r['key']for r in rows if r['key']not in found],'sources':refs,'serverActions':0,'authoritiesIssued':False,'hostWillIndependentlyCheckEveryReadyAndFullArchive':True}
if len(sys.argv)>1:
 out=Path(sys.argv[1]);assert not out.exists();out.write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(json.dumps({'path':str(out),'sha256':sha(out.read_bytes()),'state':report['state'],'readyCount':len(found)}))
else:print(json.dumps({'state':report['state'],'readyCount':len(found),'requiredCount':211,'authoritiesIssued':False}))
