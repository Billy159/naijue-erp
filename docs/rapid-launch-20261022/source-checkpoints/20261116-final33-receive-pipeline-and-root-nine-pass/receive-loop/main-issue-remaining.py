"""Finite local coordination of the unchanged reviewed receiver issuer; no SSH."""
from pathlib import Path
import hashlib,json,os,runpy,sys,time
R=Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1')
A=R/'outputs/主控/20261115-r3-direct-service24-issuer-local-01'
BASE=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/INPUT-RECEPTION-01/CACHED-03'
HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,code):
 if not ok:raise ValueError(code)
def outdir(row):return R/'outputs/主控'/('20261116-r3-final33-input-'+Path(row['directory']).name.split('-',1)[1]+'-cached03-window-01')
def emit(value):print(json.dumps(value,ensure_ascii=False),flush=True)
def main(first,delay):
 require(first==8 and delay==30,'EXACT_REMAINING_GROUPS_AND_LOCAL_ACTIVATION_REQUIRED')
 indexfile=A/'FINAL33-INPUT-CONTINUITY-01/GROUPS.json';require(sha(indexfile.read_bytes())=='4f6ffdc821ea5a12a7142897b508d3496e93f3b4c6ec356295326ef578fa0cf2','FIXED_INDEX_DIFFERS');groups=json.loads(indexfile.read_bytes());require(len(groups)==54,'FIXED54_REQUIRED')
 issuer=HERE/'issue_group.py';require(sha(issuer.read_bytes())=='8a54b334d0aaea68e34f9cb511026fe602bac0deb590303b2093a25c00776ba8','REVIEWED_ISSUER_DIFFERS');api=runpy.run_path(str(issuer))
 policy=json.loads((A/'FINAL33-INPUT-CACHED03-CONTINUITY-01/POLICY.CACHED03.json').read_bytes())
 with (HERE/'LOCAL-PRODUCER-ONCE.json').open('x')as f:json.dump({'pid':os.getpid(),'startsAtMs':time.time_ns()//1000000,'firstNextGroup':first,'lastGroup':54,'delaySeconds':delay,'sourceSha256':sha(Path(__file__).read_bytes()),'serverActions':0},f)
 history=[]
 for previous_number in range(first-1,55):
  row=groups[previous_number-1];prior=json.loads((outdir(row)/'ISSUED.json').read_bytes());auth=prior['authorizationSha256'];require(prior['batchManifestSha256']==row['batchManifestSha256'] and prior['artifactKeys']==row['artifactKeys'],'PREVIOUS_ISSUANCE_DIFFERS')
  result_file=BASE/('execution-'+auth[:24])/'RESULT.json'
  while not result_file.exists():
   require(time.time_ns()//1000000<min(prior['expiresAt']+600000,policy['expiresAt']),'ORIGINAL_RESULT_UNKNOWN_STOP_NO_REPLAY');time.sleep(2)
  for attempt in range(6):
   raw=result_file.read_bytes()
   try:result=json.loads(raw);break
   except json.JSONDecodeError:
    require(attempt<5,'INCOMPLETE_LOCAL_RESULT_READ_ONLY_STOP');time.sleep(1)
  require(result['finalPolicyAbsent'] is True and result['finalPolicy']['state']=='ENOENT','POLICY_NOT_WITHDRAWN_STOP')
  restored=result['restored'];require((restored['jobId'],restored['status'],restored['exitCode'])==(prior['restoreKey'],'COMPLETED',0),'ORIGINAL_RESTORE_NOT_COMPLETE_STOP')
  require(set(result['originalKeys'])==set(row['artifactKeys']),'PREVIOUS_PART_KEYS_DIFFER')
  plan=json.loads((Path(row['directory'])/'batch-manifest.json').read_bytes())
  for part in plan:
   state=result['originalKeys'][part['artifactKey']];require(state['status']=='READY' and state['basis']=='EXACT_WITHDRAWN_BATCH_READONLY','PREVIOUS_PART_NOT_READY_STOP')
   receipt=state['receipt'];require(all(receipt[k]==part[k]for k in ('artifactKey','archiveSha256','archiveBytes','fragmentIndex','fragmentOffset')) and receipt['manifestSha256']==policy['manifestSha256'],'PREVIOUS_READY_BINDING_DIFFERS')
  history.append({'group':previous_number,'resultSha256':sha(raw),'authoritySha256':auth,'allReady':True,'withdrawn':True})
  ready=sum(len(g['artifactKeys'])for g in groups[:previous_number]);progress={'state':'PREVIOUS_GROUP_ACTUALLY_CLOSED','group':previous_number,'readyFragments':ready,'resultSha256':sha(raw),'observedAtMs':time.time_ns()//1000000,'history':history,'serverActions':0}
  (HERE/'LOCAL-PRODUCER-PROGRESS.json').write_text(json.dumps(progress,indent=2)+'\n');emit({k:progress[k]for k in ('state','group','readyFragments','resultSha256')})
  if previous_number==54:
   require(ready==211,'EXPECTED211_REQUIRED');emit({'state':'ALL54_GROUPS211_ORIGINAL_PARTS_READY_AND_WITHDRAWN','serverActions':0});return
  nextrow=groups[previous_number];report=api['issue'](nextrow['directory'],nextrow['batchManifestSha256'],str(outdir(nextrow)),delay)
  emit({'state':'NEXT_EXACT_GROUP_ISSUED_LOCAL_ONLY','group':previous_number+1,'authoritySha256':report['authorizationSha256'],'startsAt':report['startsAt'],'expiresAt':report['expiresAt'],'directory':str(outdir(nextrow))})
if __name__=='__main__':
 try:main(int(sys.argv[1]),int(sys.argv[2]))
 except BaseException as error:
  code=str(error)if isinstance(error,ValueError)and str(error).replace('_','').isalnum()else None
  emit({'state':'LOCAL_PRODUCER_STOPPED_ORIGINAL_KEY_READ_ONLY_NO_REPLAY','errorClass':type(error).__name__,'safeCode':code,'serverActions':0});raise SystemExit(2)
