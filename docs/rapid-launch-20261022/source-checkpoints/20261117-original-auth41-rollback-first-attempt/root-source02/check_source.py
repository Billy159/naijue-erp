from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(v,n):assert v,n;rows.append(n)
 def tree(n):return ast.parse((D/n).read_bytes())
 def assign(t,n):return ast.literal_eval(next(x.value for x in t.body if isinstance(x,ast.Assign)and any(isinstance(y,ast.Name)and y.id==n for y in x.targets)))
 def funcs(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
 old=tree('ACTUAL120-DISPATCHER.py');new=tree('admin_exec.ROLLBACK-UNREGISTERED.py');h=json.loads((D/'HISTORY.json').read_bytes());b=json.loads((D/'CONSUMER-BINDING.json').read_bytes())
 keys=assign(old,'R3_ORIGINAL02_ABSENT_KEYS');newkeys=assign(new,'R3_ORIGINAL02_ABSENT_KEYS');check(len(keys)==120 and newkeys==keys+[h['newJobId']]and len(set(newkeys))==121,'120 unchanged plus single rollback key')
 fs,fn=funcs(old),funcs(new);check(all(ast.dump(v,include_attributes=False)==ast.dump(fn[k],include_attributes=False)for k,v in fs.items()if k!='execute'),'old functions and3 guards preserved')
 class Strip(ast.NodeTransformer):
  def visit_If(self,n):
   if 'ORIGINAL_AUTH41_ROLLBACK_KEY'in ast.dump(n.test):return None
   return self.generic_visit(n)
 check(ast.dump(fs['execute'],include_attributes=False)==ast.dump(Strip().visit(fn['execute']),include_attributes=False),'execute only new rollback branch no restore or stop bridge')
 check(assign(new,'ORIGINAL_AUTH41_ROLLBACK_POLICY_SHA256')is None and assign(new,'ORIGINAL_AUTH41_ROLLBACK_MODULE_SHA256')==sha((D/'r3_original_auth41_rollback.py').read_bytes()),'module exact finite policy unissued')
 m=(D/'r3_original_auth41_rollback.py').read_text();c=(D/'register_cas.py').read_text();issuer=(D/'issue_registration.py').read_text();reader=(D/'read_registration_basis.py').read_text()
 check('prior.current_service('not in m and 'now()<HISTORY'not in m,'no live or expired active-stop guard')
 check("shared['serviceLeaseExpiresAt']==HISTORY['originalWorkDeadline']"in m and "HISTORY['originalLeaseExpiresAt']-35000==HISTORY['originalWorkDeadline']"in m,'work and outer independently correct')
 check("core.sha(raw)==HISTORY['cleanupSha256']"in m and 'EXACT_C41_STOPPED_PID0_REQUIRED'in m and 'ORIGINAL_PORT_ABSENT_REQUIRED'in m,'actual9b53 closed C41 original DATA and port')
 check("actual==inner['originalRecoveryStat9'][Path(path).name]"in m and 'CUSTODY.extend'in c,'real snapshot stat9 from finite ticket and CAS')
 check(len(h['snapshotMetadata6'])==3 and all(x is None for x in h['snapshotMetadata6'].values()),'3 unknown snapshot identities not invented')
 check("phase=='original-auth41-rollback'"in m and 'return self.prior.finish(phase)'in m,'only own finishing phase handled')
 check('LOCK_EX'in c and "snapshot(a['oldIdentities'])"in c and 'NO_OTHER_ACTIVE_OPERATION_REQUIRED'in c,'original locked CAS with noother active operations')
 check('900000'in issuer and 'temporaryRoleExpiryExtended' in issuer and "decision['applyAuthorized']is False"in issuer,'explicit separately approved15min rollback only')
 check('originalRecoveryStat9' in issuer and "role['validate'](inner,now,True)"in issuer and "host['validate'](outer,'restore',now)"in issuer,'real fresh3stat9 same new clock and actual consumer validators')
 check('controllerValidUntil'not in issuer and 'backupAdminValidUntil'not in issuer and "jobs={'rollback':rule}"in issuer,'no temporary role renewal or apply ticket')
 check(len(funcs(tree('issue_registration.py'))['issue'].args.args)==7,'Main7 unchanged')
 check('READONLY_ORIGINAL_AUTH41_ROLLBACK_BASIS'in reader and 'exactExistingC41Stopped' in reader and 'LOCK_EX'in reader,'future locked metadata fresh no PG')
 for name,pin in b['rule']['bundlePins'].items():check(sha((Path(b['consumerDirectory'])/name).read_bytes())==pin,'pinned '+name)
 for p in D.glob('*.py'):
  if '.template.'not in p.name:compile(p.read_bytes(),str(p),'exec')
 check(True,'all final Python source compile')
 out=dict(state='SOURCE_ONLY_ORIGINAL_AUTH41_ROLLBACK_CHECKS_PASS',checks=len(rows),passed=rows,serverCalls=0,clockCalls=0,issuerCalls=0,PGConnections=0,authoritiesIssued=False,positiveRuntimeFixtures=False)
 (D/'CHECKS.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='passed'}))
if __name__=='__main__':main()
