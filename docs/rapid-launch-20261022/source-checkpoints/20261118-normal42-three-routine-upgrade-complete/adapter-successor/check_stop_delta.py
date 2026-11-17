"""The single stop assembly finding only; no runtime fixtures or server calls."""
from pathlib import Path
import ast,json,hashlib,difflib
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'NORMAL42-MAINTENANCE-EXECUTION-PREPARATION-01'
SOURCE=HERE.parent/'NORMAL42-THREE-ROUTINE-MAINTENANCE-SOURCE-01'
checks=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ck(name,value):
 assert value,name
 checks.append(name)
def functions(p):return {n.name:n for n in ast.parse(p.read_bytes()).body if isinstance(n,ast.FunctionDef)}
def same(a,b):return ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False)
b=HERE/'bind_actual42_context.py';t=HERE/'read_stop_basis42.template.py'
before=functions(OLD/b.name);after=functions(b)
ck('all unrelated binder functions unchanged',set(before)==set(after)and all(same(before[n],after[n])for n in before if n!='render_stop_basis'))
ck('no changes to take or remote reader metadata algorithm',same(functions(OLD/t.name)['take'],functions(t)['take']))
s=b.read_text();r=t.read_text();render=ast.get_source_segment(s,after['render_stop_basis'])
ck('only fixed original upgrade observation read',"observed=read(observation_path)"in render and "original_result('upgrade')"not in render)
ck('missing terminal separately requires global absence',"if observed['terminal']is None:"in render and "not observed['presentAcrossExistingGrants']and not observed['results']"in render)
ck('inactive operations required before either branch',render.index("not observed['activeOperationUnits']")<render.index("if observed['terminal']is None:"))
ck('absence requires existing explicit no submission evidence',all(x in render for x in("ACTUAL-NO-SUBMISSION-EVIDENCE.json","CONFIRMED_BEFORE_REMOTE_SUBMISSION","evidence['requestKey']==JOBS['upgrade']","evidence['observerSha256']==sha(observation_path.read_bytes())","evidence['remoteSubmissionCalls']==0","evidence['submissionInFlight']is False","evidence['localSubmitOutcomeKnown']is True")))
ck('unknown observation is never fabricated or caught as absent',not any(isinstance(n,ast.Try)for n in ast.walk(after['render_stop_basis'])))
ck('actual terminal job task grant finish and phase retained',all(x in render for x in("value['jobId']==JOBS['upgrade']","value['taskId']=='T45'","value['grantId']=='b16447fbc81f4d64'","value['finishedAtUTC']","type(value['phaseStarted'])is bool","('status','exitCode','phaseStarted','finishedAtUTC')")))
worker=ast.parse((SOURCE/'stop/bundle/normal05_preserve_stop.py').read_bytes());sets={}
for n in worker.body:
 if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)and n.targets[0].id in('TERMINALS','BEFORE_PHASE_REFUSALS'):sets[n.targets[0].id]=ast.literal_eval(n.value)
for label,text in [('binder',render),('template',r)]:
 ck('all existing stop terminal classes retained '+label,all(repr(x)in text for values in sets.values()for x in values))
 ck('before phase refusal retains false phase and integer2 '+label,"value['phaseStarted']is False and type(value['exitCode'])is int and value['exitCode']==2"in text)
ck('real terminal tuple bound without guessed exit code',"outcome=tuple(value[k]for k in('status','exitCode','phaseStarted','finishedAtUTC'))"in render and "tuple(value[k]for k in('status','exitCode','phaseStarted','finishedAtUTC'))==UPGRADE_TERMINAL_OUTCOME"in r)
ck('None pin paired only with None outcome',"(EXPECTED_TERMINALS[upgrade]is None)==(UPGRADE_TERMINAL_OUTCOME is None)"in r)
ck('remote upgrade unit inactive independently rechecked',"assert upgrade_unit not in active"in r)
def absence(p):
 main=functions(p)['main']
 loop=next(n for n in main.body if isinstance(n,ast.For)and ast.unparse(n.iter)=='EXPECTED_TERMINALS.items()')
 branch=next(n for n in loop.body if isinstance(n,ast.If))
 return ast.dump(ast.Module(body=branch.orelse,type_ignores=[]),include_attributes=False)
ck('original both grant full absence checks unchanged',absence(OLD/t.name)==absence(t))
ck('new source adapter still uses original42 runtime paths',"HERE=ADAPTER_SOURCE.parent/'NORMAL42-MAINTENANCE-EXECUTION-PREPARATION-01'"in s and "source=(ADAPTER_SOURCE/'read_stop_basis42.template.py').read_text()"in s)
ck('old PREPARED preserved',sha(OLD/'PREPARED-CHANNEL.json')=='9c5d3f9fa4a4ac75d88bb83f773b567cabcb83521956f02f6f589037c2c59bf9')
ck('old root binding preserved',sha(OLD/'ROOT-FINAL-BINDING.json')=='5d2a1e91ba987ee3c746af215225a13764ab25e65eb97266196d1b17ee43a1ee')
ck('consumer and Root source preserved',sha(SOURCE/'SOURCE-PINS.json')=='a6a8ab8b1bf1cd7a2c98820c8ac00aa4e54f821d7c890c9a91b85fcbe98fa21b'and sha(Path('outputs/D1/20261117-r3-ordinary42-root-source-02/SOURCE-PINS.json'))=='c5831945c03c041abfc113e2e303c5e30197bea776ca4c9737e00196abbb501e')
for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
ck('only local syntax checked no fixture executed',True)
patch=''.join(''.join(difflib.unified_diff((OLD/n).read_text().splitlines(True),(HERE/n).read_text().splitlines(True),fromfile='adapter01/'+n,tofile='stop-successor/'+n))for n in(b.name,t.name))
(HERE/'STOP-ONLY-DELTA.patch').write_text(patch)
result={'state':'SCOPED_STOP42_ASSEMBLY_SOURCE_DELTA_PASS_NOT_EXECUTED','checks':checks,'count':len(checks),'serverOrClockOrIssuerOrCASOrPGCalls':0,'positiveFixtureCreated':False,'runtimeFunctionsCalled':False}
(HERE/'CHECK-RESULT.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
print(json.dumps({'checks':len(checks),'resultSHA':sha(HERE/'CHECK-RESULT.json')},sort_keys=True))
