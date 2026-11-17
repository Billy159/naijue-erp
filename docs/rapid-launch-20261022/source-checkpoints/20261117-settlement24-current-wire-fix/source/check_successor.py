"""Narrow offline checks of the actual generated predicates and exact source delta.

Not a PostgreSQL execution or a semantic re-projection of source payloads.
"""
from pathlib import Path
import hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent
BASE=HERE.with_name('20261117-r3-root07-source-successor-01')/'operation'
OP=HERE/'operation'
REL='scripts/release/unified-install/batched-import-v1/'
STEM='SETTLEMENT24-CURRENT-WIRE'
NODE='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node'
sha=lambda raw:hashlib.sha256(raw.encode()if isinstance(raw,str)else raw).hexdigest()
read=lambda root,name:json.loads((root/REL/name).read_bytes())
pins=read(OP,STEM+'-PINS.json')
approved=pins['approved'];NEW=approved['rawSha256'];NS=approved['namespace'];MANIFEST=approved['manifestSha256']
OLD='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'
before={k:read(BASE,'COMMAND-SUCCESSOR-161-'+k+'.json')for k in ('BODIES','DEFINITIONS','MODEL')}
after={k:read(OP,STEM+'-161-'+k+'.json')for k in before}
changes=pins['changes'];signatures=[r['signature']for r in changes]
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
check('exact three changed bodies',sorted(k for k in before['BODIES']if before['BODIES'][k]!=after['BODIES'][k])==sorted(signatures))
check('exact three changed definitions',sorted(k for k in before['DEFINITIONS']if before['DEFINITIONS'][k]!=after['DEFINITIONS'][k])==sorted(signatures))
expected=json.loads(json.dumps(before['MODEL']))
for change in changes:
 signature=change['signature']
 body=after['BODIES'][signature]
 for edit in reversed(change['replacements']):
  check(signature+': unique after anchor '+str(len(checks)),body.count(edit['after'])==1)
  body=body.replace(edit['after'],edit['before'],1)
 check(signature+': reversible exact body',body==before['BODIES'][signature])
 check(signature+': definition wraps exact body',after['DEFINITIONS'][signature]==before['DEFINITIONS'][signature].replace(body,after['BODIES'][signature],1))
 for kind,field in [('BODIES','Body'),('DEFINITIONS','Definition')]:
  check(signature+': before '+kind,sha(before[kind][signature])==change['before'+field+'Sha256'])
  check(signature+': after '+kind,sha(after[kind][signature])==change['after'+field+'Sha256'])
 item=next(r for r in expected['routines']if r['signature'].replace('pg_catalog.','').replace('integer','int4')==signature)
 item.update(bodySha256=change['afterBodySha256'],definitionSha256=change['afterDefinitionSha256'])
check('entire model differs only exact three body and definition hashes',expected==after['MODEL'])
check('161 routines / 35 tables / 351 columns / 114 indexes',all(len(after['MODEL'][k])==v for k,v in [('routines',161),('tables',35),('columns',351),('indexes',114)]))
check('remaining 158 bodies and definitions byte identical',all(before[k][s]==after[k][s]for k in ('BODIES','DEFINITIONS')for s in before[k]if s not in signatures))

# Interpret the small boolean/count expressions extracted from actual SQL. SQL
# NULL propagates through =/<>/AND/OR/NOT; IS [NOT] DISTINCT FROM is total.
class Expression:
 def __init__(self,text,context):
  values={
   "jsonb_array_length(sr_approval->'documents')":context['docs'],
   'cardinality(sr_rows)':context['rows'],
   "sr_wire->>'sha256'":context['raw'],
   "cfg->'historical_settlement_retention_approval'->>'sha256'":context['raw'],
   "sr_approval->>'source_namespace'":context['namespace'],
   "initial_request->>'namespace'":context['namespace'],
   "sr_approval->>'format_version'":'HISTORICAL_SETTLEMENT_RETENTION_V1',
   'b.source_name':NS,'documents_batch.source_name':NS,
   'sr_count':context['docs'],'sr_rows':context['rows'],'sr_used':context.get('used',True),
  }
  for request in ('request','sr_request','init_request','initial_request'):
   values[request+"->>'package_manifest_sha256'"]=context['manifest']
  for key,value in sorted(values.items(),key=lambda item:-len(item[0])):
   literal='NULL'if value is None else'TRUE'if value is True else'FALSE'if value is False else str(value)if isinstance(value,int)else"'"+value+"'"
   text=text.replace(key,literal)
  pattern=r"\s*(<>|=|\(|\)|'[^']*'|\d+|[A-Z_]+)"
  self.tokens=[];pos=0
  while pos<len(text):
   m=re.match(pattern,text[pos:]);assert m,(text[pos:],text)
   self.tokens.append(m[1]);pos+=m.end()
  self.i=0
 def peek(self):return self.tokens[self.i]if self.i<len(self.tokens)else None
 def take(self,want=None):
  token=self.peek();assert token is not None and(want is None or token==want),(want,token,self.tokens)
  self.i+=1;return token
 def run(self):
  result=self.or_();assert self.i==len(self.tokens),(self.tokens[self.i:],self.tokens);return result
 def or_(self):
  value=self.and_()
  while self.peek()=='OR':
   self.take();other=self.and_();value=True if value is True or other is True else None if value is None or other is None else False
  return value
 def and_(self):
  value=self.not_()
  while self.peek()=='AND':
   self.take();other=self.not_();value=False if value is False or other is False else None if value is None or other is None else True
  return value
 def not_(self):
  if self.peek()=='NOT':
   self.take();value=self.not_();return None if value is None else not value
  left=self.atom();op=self.peek()
  if op in ('=','<>'):
   self.take();right=self.atom();return None if left is None or right is None else(left==right if op=='='else left!=right)
  if op=='IS':
   self.take();negative=self.peek()=='NOT'
   if negative:self.take()
   self.take('DISTINCT');self.take('FROM');right=self.atom()
   equal=left==right;return equal if negative else not equal
  return left
 def atom(self):
  token=self.take()
  if token=='(':
   value=self.or_();self.take(')');return value
  if token=='CASE':
   if self.peek()=='WHEN':self.take();condition=self.or_();self.take('THEN');yes=self.or_();self.take('ELSE');no=self.or_();self.take('END');return yes if condition is True else no
   value=self.atom();self.take('WHEN');match=self.atom();self.take('THEN');yes=self.atom();self.take('ELSE');no=self.atom();self.take('END');return yes if value==match else no
  if token=='NULL':return None
  if token in ('TRUE','FALSE'):return token=='TRUE'
  if token.isdigit():return int(token)
  assert token.startswith("'"),token
  return token[1:-1]
def condition(line):
 assert line.strip().startswith('IF ')
 return line.strip()[3:].rsplit(' THEN',1)[0]
bodies=[after['BODIES'][s].splitlines()for s in signatures]
predicates={name:condition(next(line for line in body if NEW in line))for name,body in zip(('INIT','MIGRATION','VERIFY'),bodies)}
predicates['PUBLISH']=condition(next(line for line in bodies[0]if 'IF sr_count<>(CASE WHEN' in line))
predicates['INIT_ROWS']=condition(next(line for line in bodies[0]if 'IF cardinality(sr_rows)<>' in line))
predicates['VERIFY_ROWS']=condition(next(line for line in bodies[2]if 'IF sr_rows<>(CASE jsonb_array_length' in line))
def context(**overrides):return dict(raw=NEW,namespace=NS,manifest=MANIFEST,docs=24,rows=26,used=True)|overrides
def rejected(name,ctx):return Expression(predicates[name],ctx).run() is True
for name in predicates:check(name+': actual approved metadata accepted',not rejected(name,context()))
for raw,docs,rows,label in [(OLD,24,26,'legacy24/26'),('legacy25-byte-pin',25,27,'legacy25/27')]:
 for name in predicates:check(name+': '+label+' preserved',not rejected(name,context(raw=raw,docs=docs,rows=rows)))
for label,overrides in [('wrong raw',dict(raw='0'*64)),('wrong namespace',dict(namespace='wrong')),('missing namespace',dict(namespace=None)),('wrong manifest',dict(manifest='0'*64)),('missing manifest',dict(manifest=None)),('23 docs',dict(docs=23)),('26 docs',dict(docs=26))]:
 for name in ('INIT','MIGRATION','VERIFY','PUBLISH'):check(name+': rejects '+label,rejected(name,context(**overrides)))
for rows in (0,25,27):
 for name in ('PUBLISH','INIT_ROWS','VERIFY_ROWS'):check(name+': rejects wrong rows '+str(rows),rejected(name,context(rows=rows)))
check('INIT_ROWS: missing evidence-use rejected',rejected('INIT_ROWS',context(used=False)))
for kind,spec in pins['catalogInputs'].items():check(kind+' snapshot pinned',sha((OP/spec['path']).read_bytes())==spec['sha256'])
check('patch SQL pinned',sha((OP/pins['sqlPath']).read_bytes())==pins['sqlSha256'])
nodeFiles=['scripts/release/unified-install/fresh35-combined-source-v1.mjs','scripts/release/unified-install/fresh35-combined-catalog-v1.mjs','tools/unified-import/fresh35-host-session.mjs']
for path in nodeFiles:
 result=subprocess.run([NODE,'--check',str(OP/path)],capture_output=True,text=True)
 check('Node24 syntax '+path,result.returncode==0)
report={'state':'NARROW_SOURCE_CHECKS_PASS_NOT_POSTGRES_VERIFIED','checksPassed':len(checks),'checks':checks,
 'predicatesFromActualGeneratedSQL':predicates,'actualMetadataSource':'Main approved decision and accepted actual wire projection',
 'sourcePayloadRead':False,'PGConnections':0,'nativeBusinessEntryCalls':0,'oldSealed18Reruns':0,
 'sqlParsedByPostgres':False,'SQLInstalled':False,'runtimeRecoveryAuthorized':False,
 'limits':['Offline predicate evaluation does not prove PostgreSQL execution, whole payload semantic projection or runtime durable state.','Legacy25 metadata test exercises preserved count predicates; payload SHA/source/evidence checks remain byte-identical and are not bypassed by this test.']}
(HERE/'CHECK-RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'state':report['state'],'checksPassed':len(checks)}))
