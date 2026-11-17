"""Evaluate only the two production expressions with existing recorded inputs.
No full function, factory, file/proof guard, Node, network or PG execution.
"""
from pathlib import Path
import ast,copy,hashlib,json,re
HERE=Path(__file__).resolve().parent
V=HERE.parent
ROOT=V.parents[3]
OLD=V/'NORMAL44-FULL-DATA-CONTINUATION-SOURCE-01/writer/bundle/final33_host.py'
NEW=HERE/'writer/bundle/final33_host.py'
INSTALL=ROOT/'outputs/T45/revisions/20261116-r3-service32-registration-actual-01/install/READBACK-02.json'
COMMAND=V/'NORMAL35-RUNTIME-01/catalog_update/ACTUAL-CATALOG35-RESULT.json'
AUTH=ROOT/'outputs/主控/20261118-r3-normal44-registration-window-01/phase-writer/host-authorization.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def expression(path,method,guard):
 tree=ast.parse(path.read_bytes());f=next(x for x in tree.body if isinstance(x,ast.FunctionDef)and x.name==method)
 call=next(n for n in ast.walk(f)if isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id=='need'and len(n.args)==2 and isinstance(n.args[1],ast.Constant)and n.args[1].value==guard)
 return tree,f,call.args[0]
def constants(tree):
 out={}
 for n in tree.body:
  if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
   try:out[n.targets[0].id]=ast.literal_eval(n.value)
   except (ValueError,TypeError):pass
 return out
class RecordedMetadata(ast.NodeTransformer):
 def visit_Call(self,node):
  if isinstance(node.func,ast.Name)and node.func.id=='sha'and len(node.args)==1 and isinstance(node.args[0],ast.Name)and node.args[0].id in ('raw','public'):
   return ast.copy_location(ast.Subscript(value=ast.Name(id='recordedSha',ctx=ast.Load()),slice=ast.Constant(node.args[0].id),ctx=ast.Load()),node)
  if isinstance(node.func,ast.Attribute)and isinstance(node.func.value,ast.Name)and node.func.value.id=='json'and node.func.attr=='loads'and len(node.args)==1 and isinstance(node.args[0],ast.Name)and node.args[0].id=='public':return ast.copy_location(ast.Name(id='publicResult',ctx=ast.Load()),node)
  return self.generic_visit(node)
def evaluate(node,env):
 selected=RecordedMetadata().visit(copy.deepcopy(node));ast.fix_missing_locations(selected)
 return bool(eval(compile(ast.Expression(selected),'<production-recorded-expression>','eval'),{'__builtins__':{'all':all,'type':type,'str':str},**env}))
def main():
 assert sha(INSTALL)=='6808ecbd33dc8a0f76fc4f2c22690ac2b0cb773340a1151eae71f8b9e944fa8b'
 assert sha(AUTH)=='f56b16746c51f99bbfd8324cad42b38ee81df7fba7377e79a7a648e122b3757f'
 authority=json.loads(AUTH.read_bytes());a={k:authority[k]for k in ('installResultSha256','batchedCatalog','catalogUpdateResultSha256','catalogUpdateCompletionSha256')};del authority
 install=json.loads(INSTALL.read_bytes());command=json.loads(COMMAND.read_bytes());assert install['resultObjectsEqual']is True and command['resultObjectsEqual']is True
 ot,_,old=expression(OLD,'installed','BATCHED24_INSTALLED_CATALOG_REQUIRED');nt,_,new=expression(NEW,'installed','BATCHED24_INSTALLED_CATALOG_REQUIRED')
 assert len(old.values)==len(new.values)==15 and [ast.dump(n)for n in old.values[:14]]==[ast.dump(n)for n in new.values[:14]]
 v=install['result'];env={**constants(nt),'v':v,'a':a,'key':constants(nt)['INSTALL_KEY'],'service':v['service'],'publicResult':copy.deepcopy(v),'recordedSha':{'raw':install['rootPins']['result'],'public':install['publicResultSha256']},'re':re}
 assert not evaluate(old,env) and evaluate(new,env)
 checks=['same actual32 + actual44 nonsecret authority: old15 false new15 true','first14 AST predicates unchanged']
 for name in ('batchedCatalog','requestKey','state','service','programSha256','completionSha256'):
  choices=[command['result']['batchedCatalog'],{'sourceSetSha256':'a5f721749c1c7e59ce532ea6a287a310b2604ccbc77e0f1f2f0d831c5a2f8f6e','catalogSpecSha256':'aefbfd2ea3425a7cf6f9ad7bd22f8f98d4a946d7a90cc0f3c75ea539fdea4f17','modelSha256':'ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'}]if name=='batchedCatalog'else ['WRONG_RECORDED_FIELD']
  for x in choices:
   e=copy.deepcopy({k:x for k,x in env.items()if k!='re'});e['re']=re;e['v'][name]=x;e['publicResult']=copy.deepcopy(e['v']);assert not evaluate(new,e),name;checks.append('install32 rejects '+name+' substitution')
 _,f,c=expression(NEW,'historical_applied_catalog_successor','DB05_COMMAND_SUCCESSOR_RESULT_REQUIRED');expected=next(x.value for x in f.body if isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='expected'for t in x.targets));expected=eval(compile(ast.Expression(expected),'<production-expected>','eval'),{'__builtins__':{'dict':dict}},{});v=command['result'];e={**constants(nt),'result':v,'publicResult':copy.deepcopy(v),'a':a,'key':constants(nt)['CATALOG_UPDATE_KEY'],'expected':expected,'program':v['programSha256'],'recordedSha':{'raw':command['rootPins']['result'],'public':command['publicResultSha256']},'re':re}
 assert evaluate(c,e);checks.append('actual35 + actual44 historical authority passes production command predicate')
 for generation in (install['result']['batchedCatalog'],{'sourceSetSha256':'a5f721749c1c7e59ce532ea6a287a310b2604ccbc77e0f1f2f0d831c5a2f8f6e','catalogSpecSha256':'aefbfd2ea3425a7cf6f9ad7bd22f8f98d4a946d7a90cc0f3c75ea539fdea4f17','modelSha256':'ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'}):
  for which in ('result','a'):
   q=copy.deepcopy({k:x for k,x in e.items()if k!='re'});q['re']=re;q[which]['batchedCatalog']=generation;q['publicResult']=copy.deepcopy(q['result']);assert not evaluate(c,q);checks.append('command35 rejects '+which+' wrong generation')
 result={'state':'PASS_RECORDED_PRODUCTION_PREDICATES_ONLY','checks':checks,'count':len(checks),'inputs':[{'path':str(p),'sha256':sha(p)}for p in (INSTALL,COMMAND,AUTH)],'oldInstalledPredicate':False,'newInstalledPredicate':True,'first14Preserved':True,'actualCommand35Predicate':True,'metadataSubstitution':'Only sha(raw/public) and json.loads(public) use existing receipt hashes and captured public equality; service is captured actual32, original protected proof not reconstructed. Negative public objects mirror changed record so field guards themselves reject.','fullFunctionsExecuted':False,'serverActions':0,'factoryRuns':0,'NodeRuns':0,'PGConnections':0,'futurePositiveFixtureCreated':False,'credentialOrRawAuthorityExported':False}
 (HERE/'RECORDED-PREDICATE-RESULT.json').write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n');print(json.dumps({'state':result['state'],'count':len(checks)}))
if __name__=='__main__':main()
