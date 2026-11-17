"""Necessary SOURCE43 identity, custody and dependency delta; no Node or transport."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
V=HERE.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks=[]
def check(ok,name):
 assert ok,name
 checks.append(name)
def definitions(p):return runpy.run_path(str(p))
def assignment(p,name):
 node=next(x for x in ast.parse(p.read_bytes()).body if isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id==name for t in x.targets))
 return ast.literal_eval(node.value)

def main():
 i=json.loads((HERE/'INTERFACE.UNISSUED.json').read_bytes());ph=json.loads((HERE/'PHASES43.UNISSUED.json').read_bytes())
 check(i['phaseOrder']==['apply','start','writer','stop','restore']and set(i['jobs'])==set(i['phaseOrder'])and set(ph['jobs'])==set(i['phaseOrder']),'exact five phases without prepare')
 for phase,rule in i['jobs'].items():
  b=HERE/phase/'bundle';actual={p.name:sha(p)for p in b.iterdir()if p.is_file()}
  check(actual==rule['bundlePins']==ph['jobs'][phase]['bundlePins'],phase+' exact manifest')
  for p in b.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
 check(not list(HERE.glob('*/bundle/*authorization*')),'source has no issued authority')
 host=HERE/'writer/bundle/final33_host.py';h=definitions(host)
 key=i['jobs']['writer']['jobId'];d='/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/'
 check(h['fixed_job_key']({'ERP_SHARED_JOB_DIR':d+key,'ERP_SHARED_JOB_ID':key})==key,'only selected writer transport admitted')
 for refused in [h['PREPARE'],'t45-r3-batched-real-execute-20261115-01','t45-first-20261110-r3-real-execute-20261114-02']:
  try:h['fixed_job_key']({'ERP_SHARED_JOB_DIR':d+refused})
  except ValueError:checks.append('replay refused '+refused)
  else:raise AssertionError('old key accepted')
 check(h['PREPARATION_IDENTITY_MAPPING']==definitions(V/'NORMAL39-SOURCE-SUCCESSOR-02/writer/bundle/final33_host.py')['PREPARATION_IDENTITY_MAPPING'],'original business request and plan mapping retained')
 src=host.read_text();node=next(x for x in ast.parse(src).body if isinstance(x,ast.FunctionDef)and x.name=='original_prepared');oldguard=ast.get_source_segment(src,node)
 check("native['executionBinding']==a['originalExecutionBinding']"in oldguard and "native['executionBinding']==a['expectedBinding']"not in oldguard,'native historical execution witness distinct from new binding')
 runner=(HERE/'writer/bundle/final33-run.mjs').read_text()
 check("KEY===WRITER"in runner and 'if(KEY===PREPARE){'not in runner and 'runFinalR3Prepare03('not in runner,'prepare unavailable to new runner')
 check('api.describeFresh35FinalExecutionBinding('in runner and 'equal(expected,a.expectedBinding)'in runner and 'inputs.resume'not in runner,'existing execution API before FIRST_WRITE no automatic resume')
 check('api.runFinalR3Writer03('in runner and 'api.runFinalR3Readback03('in runner and 'persistedScope('in runner,'original persisted writer and readback reused')
 witness=json.loads((HERE/'writer/bundle/historical-prepare05.json').read_bytes());prior=json.loads((V/'NORMAL39-EXECUTION-PREPARATION-01/runtime/prepare/RESULT-PREPARE05.json').read_bytes())
 check(witness['preparedBinding']==prior['preparedBinding']and witness['executionBinding']==prior['executionBinding'],'original prepare bindings preserved exactly')
 check(i['historicalPlanCustody']['observedStat9']is None and all(x['observedStat9']is None for x in i['historicalPlanCustody']['paths'].values()),'unobserved plan stat9 not fabricated')
 check(i['previousStartBindings']['previousRetainedAckSha256']is None,'unobserved ACK digest not fabricated')
 b=HERE/'start/bundle'
 check((b/'closed41_history.py').read_bytes()==(V/'NORMAL42-THREE-ROUTINE-MAINTENANCE-SOURCE-01/prior_closed41.py').read_bytes(),'actual41 history retained')
 check((b/'source-catalog-lineage.json').read_bytes()==(V/'NORMAL39-SOURCE-SUCCESSOR-02/writer/bundle/source-catalog-lineage.json').read_bytes(),'old Root07 proof retained unchanged')
 check(i['Root08']['marker']['SQLUpgradePerformed']is False and i['settlement24Upgrade42']['result']['commitAcknowledged']is True and i['settlement24Upgrade42']['result']['businessImported']is False,'materialization and later actual SQL receipts separate')
 # Pin DAG is assessed from referenced constants, not only from the manifest.
 guardian=b/'normal_service05_after08.py'
 for name,leaf in [('PRIOR32_SHA','prior_preserved38.py'),('R3_RUNTIME_SHA','r3_05_runtime.py'),('R3_CLI_SHA','r3_05_cli.py'),('READONLY_SHA','r3_05_readonly.py')]:check(assignment(guardian,name)==sha(b/leaf),'guardian '+leaf)
 for phase in ('apply','restore'):
  p=HERE/phase/'bundle/ordinary05_roles_job.py'
  check(all(sha(p.with_name(k))==v for k,v in assignment(p,'STATIC_PINS').items()),phase+' static private dependencies')
  check(assignment(p,'CURRENT_SOURCE')==sha(guardian)and assignment(p,'CURRENT_PROOF_SOURCE')==sha(b/'normal_service05_after08_proof.py'),phase+' exact live guardian pair')
 for p in [HERE/'stop/bundle/normal05_retained_stop.py',HERE/'writer/bundle/normal05_retained_stop.py']:
  check(all(assignment(p,k)==sha(b/leaf)for k,leaf in [('PROOF_SHA','normal_service05_after08_proof.py'),('NORMAL05_SHA','normal_service05_after08.py'),('READONLY_SHA','r3_05_readonly.py')]),str(p.relative_to(HERE))+' final service pin pair')
 check(assignment(HERE/'stop/bundle/normal05_preserve_stop.py','STOP_REFERENCE')==sha(HERE/'stop/bundle/normal05_retained_stop.py'),'stop exact retained helper')
 check(assignment(host,'PINS')=={p.name:sha(p)for p in host.parent.iterdir()if p.is_file()and p.name!=host.name},'writer full static dependencies')
 check('PROGRAM_DESCRIBED_NO_PG_OR_WRITE'in(b/'final-execution-describe.mjs').read_text()and 'describeFresh35FinalExecutionBinding('in(b/'final-execution-describe.mjs').read_text(),'future descriptor uses existing pure API')
 for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
 result={'state':'PASS_SCOPED_SOURCE43_DELTA_ONLY','checks':checks,'count':len(checks),'NodeRuns':0,'serverActions':0,'PGConnections':0,'issuerCalls':0,'writerSubmissions':0,'businessAcceptanceClaimed':False}
 (HERE/'DELTA43-CHECK-RESULT.json').write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
 print(json.dumps({'state':result['state'],'count':len(checks)}))
if __name__=='__main__':main()
