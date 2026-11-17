"""Only115→120/new41/actual40 closure checks; no old runtime checks repeated."""
from pathlib import Path
import ast,hashlib,json
HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows=[]
 def check(value,name):assert value,name;rows.append(name)
 def tree(n):return ast.parse((HERE/n).read_bytes())
 def assigned(t,name):return ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id==name for x in n.targets)))
 def functions(t):return {n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
 h=json.loads((HERE/'HISTORY-INPUTS.json').read_bytes());w=json.loads((HERE/'FIVE-PHASES.UNISSUED.json').read_bytes());c=Path(h['consumerDirectory'])
 for name,pin in [('SOURCE-PINS.json','44e1b0d0a2089adf825c1352ab68c6d681b4bc12df1592600d87eebc9e095199'),('INTERFACE.UNISSUED.json','7a362dbefcfc363d9dcdc7e4e379179b1119fd49c668ec958bff0b38a9a99454'),('PHASES41.UNISSUED.json','e0c5749cb235681cc176b669166f4421d5d62cec30cfa44500d5ee4ea31b9763')]:check(sha((c/name).read_bytes())==pin,'new41 exact '+name)
 check(w['consumerReviewSha256']=='b441bbea7dbd71a32ebadbeeadde98424b44a56a9184204f6f2d7836ba4f2370','new consumer QB binding')
 old=tree('ACTUAL115-DISPATCHER.py');new=tree('admin_exec.NORMAL41-UNREGISTERED.py')
 check(sha((HERE/'ACTUAL115-DISPATCHER.py').read_bytes())=='0864546416726e3290f571f86344bf0f7288c54e80e3fce86fd2426d7f38edff','actual115 root exact')
 oldkeys=assigned(old,'R3_ORIGINAL02_ABSENT_KEYS');keys=assigned(new,'R3_ORIGINAL02_ABSENT_KEYS')
 check(len(oldkeys)==115 and keys[:115]==oldkeys and set(keys[115:])==set(h['jobs'].values())and len(set(keys))==120,'exact115 prefix plus5 noncolliding keys')
 a,b=functions(old),functions(new)
 check(all(ast.dump(n,include_attributes=False)==ast.dump(b[k],include_attributes=False)for k,n in a.items()if k!='execute'),'all existing functions and guards byte-semantic preserved')
 class Remove41(ast.NodeTransformer):
  def visit_If(self,node):return None if 'NORMAL41_KEYS'in ast.dump(node.test)else self.generic_visit(node)
 check(ast.dump(a['execute'],include_attributes=False)==ast.dump(Remove41().visit(b['execute']),include_attributes=False),'only new41 execute branch')
 check(assigned(new,'NORMAL41_MODULE_SHA256')==sha((HERE/'r3_normal41_continuation.py').read_bytes())and assigned(new,'NORMAL41_POLICY_SHA256')is None,'new module pin exact policy unissued')
 check('Normal41Continuation'in ast.unparse(b['normal41_continuation']),'new dispatcher exact class')
 for name in ['issue_registration.py','issue_phase.py']:
  f=functions(tree(name))['issue'];check(len(f.args.args)==(7 if 'registration'in name else 8),'unchanged '+name+' API')
 phase=(HERE/'issue_phase.py').read_text();reg=(HERE/'issue_registration.py').read_text();cas=(HERE/'register_cas.py').read_text();fresh=(HERE/'read_registration_basis.py').read_text();channel=(HERE/'prepare_channel.py').read_text()
 check("PHASES41.UNISSUED.json"in reg and 'PHASES40.UNISSUED.json'not in reg,'issuer loads exact41 blueprint')
 check("expiresAt=now+600000"in reg and "a['startsAt']+600000"in cas and 'now+5100000'in reg,'parent5100 CAS600 preserved')
 check("direct41-batched-real.json"in reg and "T45_R3_NORMAL41_BATCHED_REAL_V1"in reg,'policy41 original schema')
 check("phase in ('apply','start','upgrade','stop','restore')"in phase and "policy['jobs']['prepare']"not in phase and "policy['jobs']['writer']"not in phase,'no prepare import writer branch')
 f=h['closedFailed40'];check(f['service']is f['epoch']is f['actualFullStat9']is None,'no invented C40 epoch or source stat9')
 check(len(f['custodyMetadata6'])==5 and all(set(r)=={'device','inode','uid','gid','mode','bytes'}for r in f['custodyMetadata6'].values()),'five40 snapshots six observed fields only')
 check(w['priorService']['serviceKey']=='t45-first-r3-native-service-start-20261116-39','last genuine service39 retained')
 check('module.validate_closed40(core'in fresh and 'LOCK_EX'in fresh and "a['basis']()"in fresh,'fresh locked closed40 full stat9 read defined')
 check("len(ident)==9"in reg and "closedFailed40"in reg and "oldIdentities=basis['oldIdentities']"in reg,'Main binds actual future40 stat9 into original CAS')
 check('list(identity(path.lstat()))==old[str(path)]'in cas and 'CUSTODY.extend'in cas,'CAS retains39 and40 full stat9 snapshot checks')
 check('/r3-service-41-worker-proof' in json.dumps(json.loads((c/'INTERFACE.UNISSUED.json').read_bytes()))and 'ordinary41-auth-capture-20261117-01'in fresh,'unique41 capture proof interface')
 check("STAGE+'/register_cas.py'"in channel and "/register_cas.py'"in cas,'transport matches exact CAS entry')
 check('old115AndThreeGuardsPreserved'in cas and 'old115AndThreeGuardsPreserved'in channel,'115 preservation readback contract')
 check('sourceOnly' in reg and 'rootPairReviewComplete' in reg,'joint review required before Main issuance')
 for p in sorted(HERE.glob('*.py')):compile(p.read_bytes(),str(p),'exec');check(True,'new source compile '+p.name)
 check(w['futureC']is w['futureWindow']is None and h['clock']is h['finiteAuthorities']is None,'future values unissued')
 result=dict(state='SOURCE_ONLY_ORDINARY41_DELTA_CHECKS_PASS',checks=len(rows),passed=rows,serverActions=0,clockCalls=0,PGConnections=0,authoritiesIssued=False,positiveRuntimeFixtures=False,oldAcceptedRuntimeChecksRerun=False)
 (HERE/'DELTA-CHECKS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='passed'}))
if __name__=='__main__':main()
