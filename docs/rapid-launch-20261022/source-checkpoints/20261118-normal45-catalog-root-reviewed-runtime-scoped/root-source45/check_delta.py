"""Only new45 Root wiring and recorded44 predecessor predicates, no runtime."""
from pathlib import Path
import ast,copy,hashlib,json,runpy
D=Path(__file__).resolve().parent;OLD=D.with_name('20261118-r3-ordinary44-root-source-01')
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(v,name):assert v,name;rows.append(name)
 def tree(p):return ast.parse(Path(p).read_bytes())
 def assign(t,name):return ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets)))
 def functions(t):return{n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());w=json.loads((D/'FIVE-PHASES.UNISSUED.json').read_bytes());a=json.loads((D/'ACTUAL-HISTORY.json').read_bytes());oldh=json.loads((OLD/'HISTORY-INPUTS.json').read_bytes());scope=a['scope'];x=h['closed44']
 check((scope['rootBefore'],scope['rootAfter'])==(137,142)and scope['serverFreshClockIssuerCASPGOrWriterCurrentlyAuthorized']is False,'exact new Main source-only scope137-to142')
 c=Path(h['consumerSourceDirectory']);manifest=json.loads((c/'SOURCE-PINS.json').read_bytes())
 check(sha((c/'SOURCE-PINS.json').read_bytes())==h['consumerSourcePinsSha256']=='1676656b24964fa6cb14857b161896b2322cc0edca1b51281875717f3587ed3e','exact frozen45 consumer')
 check(all(sha((c/n).read_bytes())==r['sha256']and(c/n).stat().st_size==r['bytes']for n,r in manifest['files'].items()),'new45 consumer member closure')
 check(sha((c/'INTERFACE.UNISSUED.json').read_bytes())==h['consumerInterfaceSha256']and sha((c/'PHASES45.UNISSUED.json').read_bytes())==h['consumerRulesSha256']and sha(Path(h['executionInterfacePath']).read_bytes())==h['executionInterfaceSha256'],'exact interface phases and separate execution clone')
 before=tree(D/'ACTUAL137-DISPATCHER.py');after=tree(D/'admin_exec.NORMAL45-UNREGISTERED.py');keys=assign(before,'R3_ORIGINAL02_ABSENT_KEYS');new=assign(after,'R3_ORIGINAL02_ABSENT_KEYS')
 check(sha((D/'ACTUAL137-DISPATCHER.py').read_bytes())==scope['actualBeforeDispatcherSha256']=='0afafdc9757f06bfc6b1556a287d39b46f5ba6b77b3f157ce7aa25592978dd21','exact real installed137/0af baseline')
 check(len(keys)==137 and new[:137]==keys and new[137:]==list(scope['jobs'].values())and len(set(new))==142,'all137 old keys preserved plus five noncolliding45 keys')
 aa,bb=functions(before),functions(after)
 check(all(ast.dump(n,include_attributes=False)==ast.dump(bb[k],include_attributes=False)for k,n in aa.items()if k!='execute'),'all old dispatcher functions unchanged')
 class Remove45(ast.NodeTransformer):
  def visit_If(self,node):return None if 'NORMAL45_KEYS'in ast.dump(node.test)else self.generic_visit(node)
 check(ast.dump(aa['execute'],include_attributes=False)==ast.dump(Remove45().visit(copy.deepcopy(bb['execute'])),include_attributes=False),'only new45 execute branch')
 guard=lambda t:sorted(ast.dump(n,include_attributes=False)for n in ast.walk(t)if isinstance(n,ast.Compare)and any(isinstance(v,ast.Name)and v.id=='R3_ORIGINAL02_ABSENT_KEYS'for v in n.comparators))
 check(len(guard(before))==3 and guard(before)==guard(after),'original three key guards unchanged')
 module=tree(D/'r3_normal45_continuation.py');check(assign(after,'NORMAL45_MODULE_SHA256')==sha((D/'r3_normal45_continuation.py').read_bytes())and assign(after,'NORMAL45_POLICY_SHA256')is None,'exact45 module pin and unissued policy')
 check(set(assign(module,'EXPECTED_RULES'))==set(scope['phaseOrder'])and h['jobs']==scope['jobs'],'new rule dictionary and authorized phases match')
 for name in('validate_history','validate_closed40','validate_latest41','validate_closed42','validate_closed43'):
  check(ast.dump(functions(module)[name],include_attributes=False)==ast.dump(functions(tree(OLD/'r3_normal44_continuation.py'))[name],include_attributes=False),'unchanged prior history function '+name)
 cas=runpy.run_path(str(D/'register_cas.py'));oldcas=runpy.run_path(str(OLD/'register_cas.py'))
 check(set(oldcas['PRESERVE'])<=set(cas['PRESERVE'])and all(cas['PRESERVE'][k]==v for k,v in oldcas['PRESERVE'].items()if not k.endswith('/admin_exec.py')),'all old protected root members retained')
 check(cas['PRESERVE'][str(cas['P']/'r3_normal44_continuation.py')]==a['actualRoot137']['moduleSha256']and cas['PRESERVE'][str(cas['H']/'direct44-batched-real.json')]==a['actualRoot137']['policySha256'],'installed44 module and actual policy protected')
 check(len(cas['CUSTODY'])==28 and set(map(str,cas['CUSTODY']))==set(h['custodyStat9']),'only five real44 snapshot stat9 added to prior23')
 check(h['priorService']==oldh['priorService']and h['predecessor']==oldh['predecessor']and h['closed43']==oldh['closed43'],'successful42 consumer predecessor and typed43 failure distinct and unchanged')
 # Evaluate the exact new production predicates only on the existing44 records.
 # No filesystem/guard function execution and no future positive fixture.
 template=tree(D/'validate_closed44.template.py');predicates={n.args[1].value:n.args[0]for n in ast.walk(template)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='need'and len(n.args)>1 and isinstance(n.args[1],ast.Constant)}
 actuals={'ACTUAL44_SUCCESSFUL_START_NOT_WRITER_SUCCESS_REQUIRED':dict(start=x['startResult']['value'],service=x['service']),
 'ACTUAL44_WRITER_FAILED_NOT_REPLAYABLE_REQUIRED':dict(t=x['writerTerminal']['value'],x=x),
 'ACTUAL44_FAILED_BEFORE_CHILD_AND_CONNECTION_REQUIRED':dict(failure=x['writerIncomplete']['value'],clean=x['writerCleanup']['value'],x=x),
 'ACTUAL44_STOP_WITH_FAILED_WRITER_REQUIRED':dict(stop=x['stopResult']['value'],service=x['service'],x=x),
 'ACTUAL44_GUARDIAN_CLEAN_STOP_REQUIRED':dict(guardian=a['stop44']['guardianCleanup']['value'],service=x['service'])}
 for name,values in actuals.items():
  expr=ast.Expression(copy.deepcopy(predicates[name]));ast.fix_missing_locations(expr)
  check(eval(compile(expr,'actual44_recorded_predicate','eval'),{'__builtins__':{'set':set,'dict':dict,'all':all},**values}),name+' accepts recorded real44 values only')
 check(x['stopResult']['value']['writerTerminalSha256']!=x['writerTerminal']['sha256']and x['stopResult']['value']['currentBatchTerminals'][x['writerKey']]['terminalSha256']==x['writerTerminal']['sha256'],'legacy permanent-writer hold kept distinct from failed44 currentBatch terminal')
 check(x['restoreResult']['value']['result']['exactOriginalVerifierAndExpiryVerifiedPrivately']is True and x['restoreResult']['value']['result']['naturalExpiryCountedAsRestoration']is False,'actual44 auth restoration facts only, no natural expiry claim')
 text=(D/'validate_closed44.template.py').read_text();check("v['exitCode']==expected['exitCode']==0"in text and "v['exitCode']==143"not in text,'real ownrestore Exit0 only; service44 exit not guessed')
 reg=(D/'issue_registration.py').read_text();phase=(D/'issue_phase.py').read_text();reader=(D/'read_registration_basis.py').read_text()
 check('module.validate_closed44'in reader and 'm.validate_closed44'in(D/'register_cas.py').read_text()and 'actual44StoppedRestoredAndWriterFailedBeforeChild'in reg,'fresh CAS and Main7 mandate actual44 closed failure boundary')
 check(h['writerHistoricalPins']==oldh['writerHistoricalPins']and h['prepare05']==oldh['prepare05']and h['installedAfter42Catalog']==oldh['installedAfter42Catalog'],'outerAUTH command35/original44910/current after42 semantics retained')
 record_raw=(c/'RECORDED-PREDICATE-RESULT.json').read_bytes();record=json.loads(record_raw)
 check(sha(record_raw)=='c1537a580403bf84d10a2f2702709865bcf001900359c15378b5f64eb9345dac'and record['oldInstalledPredicate']is False and record['newInstalledPredicate']is True and record['actualCommand35Predicate']is True and record['first14Preserved']is True,'T45 real-record production predicate delta result reused, not rerun')
 access=json.loads((D/'DESCRIBE-ACCESS-PATHS.json').read_bytes());oldaccess=json.loads((OLD/'DESCRIBE-ACCESS-PATHS.json').read_bytes())
 check(access['rows']==oldaccess['rows']and len(access['rows'])==454 and access['maps'][:3]==oldaccess['maps'][:3]and all('HISTORICAL44'in m['basis']for m in access['maps'][3:]),'same454 access mechanism and paths, only real existing44 projection bases renewed')
 check(assign(tree(D/'read_registration_basis.py'),'DESCRIBE_ACCESS_PATHS')==access,'new access map embedded exactly')
 check((D/'DESCRIBE-STATIC-IMPORTS.json').read_bytes()==(OLD/'DESCRIBE-STATIC-IMPORTS.json').read_bytes(),'accepted99 selected import graph reused unchanged')
 for leaf,n in(('issue_registration.py',7),('issue_phase.py',8)):check(len(functions(tree(D/leaf))['issue'].args.args)==n,'unchanged Main parameter count '+leaf)
 check("predecessor_pin==w['prepare05']['safeReadbackSha256']"in phase and "set(context)=={'apply','start','operatorReadySha256','executionDescription','planCustody'}"in phase,'unchanged original P and genuine45 E schema')
 check(all(item in reg for item in('controllerValidUntil=now+4000000','backupAdminValidUntil=now+4120000','restorationDeadline=now+4900000','expiresAt=now+5100000','expiresAt=now+600000'))and {p:v['timeoutSeconds']for p,v in h['expectedRules'].items()}==scope['phaseBudgetsSeconds'],'same five phase budgets parent/CAS and role offsets')
 check(scope['minimumAvailableBytes']==28*1024**3 and scope['serviceMaximumSeconds']==4200,'same28GiB and service4200')
 check(str(cas['ENTRY'])==assign(tree(D/'prepare_channel.py'),'STAGE')+'/register_cas.py'and 'NORMAL45-ROOT-EXECUTION-PREPARATION-01'in(D/'prepare_channel.py').read_text(),'new45 stage ENTRY RootPrep paired')
 check(w['futureC']is w['futureWindow']is w['clock']is w['finiteAuthorities']is None,'no future C clock authority or positive runtime fixture')
 for p in D.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
 check(all((D/p).stat().st_size<=131072 for p in('r3_normal45_continuation.py','register_cas.py','read_registration_basis.py','admin_exec.NORMAL45-UNREGISTERED.py')),'source syntax and original bounded channel maintained')
 result=dict(state='SOURCE_ONLY_ORDINARY45_DELTA_CHECKS_PASS',checks=len(rows),passed=rows,serverActions=0,clockCalls=0,PGConnections=0,NodeCalls=0,authoritiesIssued=False,positiveFutureRuntimeFixtures=False,oldAcceptedChecksRerun=False)
 (D/'DELTA-CHECKS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='passed'}))
if __name__=='__main__':main()
