from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(v,n):assert v,n;rows.append(n)
 def tree(n):return ast.parse((D/n).read_bytes())
 def assigned(t,name):return ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets)))
 def funcs(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
 h=json.loads((D/'HISTORY.json').read_bytes());b=json.loads((D/'CONSUMER-BINDING.json').read_bytes());folder=Path(b['consumerDirectory'])
 check(sha((Path(b['consumerSourceDirectory'])/'SOURCE-PINS.json').read_bytes())==h['consumerSourcePinsSha256']=='e1f1b00c94d263dbce4a280d0c7a6fad9e5b34c8e516806f599cc381993e0de0','final consumer exact')
 for name,pin in b['rule']['bundlePins'].items():check(sha((folder/name).read_bytes())==pin,'exact '+name)
 old=tree('ACTUAL120-DISPATCHER.py');new=tree('admin_exec.RECOVERY-UNREGISTERED.py');keys=assigned(old,'R3_ORIGINAL02_ABSENT_KEYS');newkeys=assigned(new,'R3_ORIGINAL02_ABSENT_KEYS')
 check(len(keys)==120 and newkeys==keys+[h['newJobId']]and len(set(newkeys))==121,'120 old keys plus exactly one recovery')
 fs,fn=funcs(old),funcs(new)
 check(all(ast.dump(v,include_attributes=False)==ast.dump(fn[k],include_attributes=False)for k,v in fs.items()if k!='execute'),'all old root functions unchanged')
 class Strip(ast.NodeTransformer):
  def visit_If(self,n):
   if 'STOP41_RECOVERY_KEY'in ast.dump(n.test):return None
   return self.generic_visit(n)
 check(ast.dump(fs['execute'],include_attributes=False)==ast.dump(Strip().visit(fn['execute']),include_attributes=False),'execute only recovery stop and original restore bridge')
 check(assigned(new,'STOP41_RECOVERY_POLICY_SHA256')is None,'policy unissued')
 check(assigned(new,'STOP41_RECOVERY_MODULE_SHA256')==sha((D/'r3_stop41_recovery.py').read_bytes()),'module pin exact')
 check(len(b['actualCurrentBatchTerminals'])==6 and h['failedStop']['key']in b['actualCurrentBatchTerminals'],'six exact old terminals including failed stop')
 check(h['service']['containerId']=='cbf6459fc0e0f9cf89d1b0826618ba5d5a50fa650d7ef08dc420cfdd4e05fb5c'and h['originalWorkDeadline']==1794926342048 and h['originalRestorationDeadline']==1794926977752,'C41 and original deadlines')
 c=(D/'register_cas.py').read_text();m=(D/'r3_stop41_recovery.py').read_text();issue=(D/'issue_recovery.py').read_text();restore=(D/'issue_restore.py').read_text()
 check('running41()'in c and 'NO_OTHER_ACTIVE_OPERATION_REQUIRED'in c,'only exact runningC41 no active other operations')
 check('ORIGINAL_DATA_STOPPED_REQUIRED'not in ast.unparse(funcs(tree('register_cas.py'))['quiet']),'CAS does not pretend current PG stopped')
 check('snapshot(a[\'oldIdentities\'])'in c and 'LOCK_EX'in c and 'PRESERVE.update'in c,'original lock snapshot CAS preserved')
 check('prior.current_service(SERVICE)'in m and 'ACTUAL_FAILED_STOP41_REQUIRED'in m,'live original birth and failed Stop required')
 check('CURRENT_BATCH_OPERATIONS'not in m and 'ACTUAL_EXACT_C41_RECOVERY_CLOSURE_REQUIRED'in m,'no new business or restore fake old terminal')
 cls=next(n for n in tree('r3_stop41_recovery.py').body if isinstance(n,ast.ClassDef));ctor=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='__init__')
 check('time.time'not in ast.unparse(ctor),'constructor permits original restore after stop policy expiry')
 check("a['expiresAt']<=HISTORY['originalRestorationDeadline']"in m and 'ORIGINAL_DATA_STOPPED_REQUIRED'in m,'restore original hard boundary and stopped original DATA')
 check('rolesReissued=False'in issue and 'now+rule[\'timeoutSeconds\']*1000+35000<expiry'in issue,'no new roles and stop original close margin')
 check(len(funcs(tree('issue_recovery.py'))['issue'].args.args)==7 and len(funcs(tree('issue_restore.py'))['issue'].args.args)==8,'Main7 registration and Main8 restore API')
 check('adjusted[\'jobs\'][\'stop\'][\'jobId\']=KEY'in restore and 'g[\'preservation_authority\']=preservation'in restore,'exact restore witness bridge and restored function reference')
 for p in D.glob('*.py'):
  if '.template.'not in p.name:compile(p.read_bytes(),str(p),'exec')
 check(True,'all local source compile')
 out=dict(state='SOURCE_ONLY_EXACT_C41_RECOVERY_CHECKS_PASS',checks=len(rows),passed=rows,serverCalls=0,clockCalls=0,issuerCalls=0,PGConnections=0,authoritiesIssued=False,positiveRuntimeFixtures=False)
 (D/'CHECKS.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='passed'}))
if __name__=='__main__':main()
