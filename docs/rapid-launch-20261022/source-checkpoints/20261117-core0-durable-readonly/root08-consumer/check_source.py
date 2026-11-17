"""Narrow Root08 delta checks. No worker import/main/clock/authority or server calls."""
from pathlib import Path
import ast,copy,hashlib,json,re,difflib
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OLD=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ROOT07-MATERIALIZATION-SOURCE-01/bundle/materialize-batched-source.py'
WORKER=HERE/'bundle/materialize-batched-source.py'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
old=OLD.read_text();new=WORKER.read_text();tree=ast.parse(new);before=ast.parse(old)
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name)
check('parent exact accepted worker666a',sha(old.encode())=='666adbbb3143aeccf88289cbd15277f806e2d9c5bc73ae3e9b2cbc34c7afb40a')
functions=lambda t:{n.name:n for n in t.body if isinstance(n,ast.FunctionDef)}
old_functions=functions(before);new_functions=functions(tree)
for name in ('need','trusted_parents','read','write','pack','encode','validate'):
 check('inherited helper bytes unchanged '+name,ast.get_source_segment(old,old_functions[name])==ast.get_source_segment(new,new_functions[name]))
profile_raw=(HERE/'bundle/source-profile.json').read_bytes();profile=json.loads(profile_raw)
constant=next(n.value.value for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='SOURCE_DESCRIPTION_SHA256'for t in n.targets))
check('worker binds exact static profile',sha(profile_raw)==constant)
check('392 rows pin',sha((HERE/'bundle/source-rows.json').read_bytes())==profile['sourceRowsSha256']=='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e')
check('source768 / Main3b / QB976 fixed',profile['sourcePinsSha256']=='76864577847c0ab030aaa78881bc24ffd5d5db288b2af1034eb5fc26f2061c3b'and profile['sourceDecisionSha256']=='3b04898ea9050610f83295c51075c65dfeaf95c0566a1cd834b140df1085bef6'and profile['sourceReviewSha256']=='976ca7fd03741c81bab9d635c6577cbe5cc430b5e20ea9374621e8e530cb43bb')
check('all future execution values unissued',all(profile[k]is None for k in ('rootRegistrationBasis','finiteAuthority','actualRoot08Marker','futureC','futureEpoch','clock')))
check('FAILED consumed writer and UNKNOWN durable',profile['workerNeverSubmitted']is False and profile['originalWriterStatus']=='FAILED'and profile['businessDurableState']=='UNKNOWN')
check('new model not installation equivalence',profile['sourceModelSha256']=='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'and profile['noSQLUpgrade']is True and profile['noImportReadyClaim']is True)
check('old6c runner file only',profile['runnerDisposition']=='COPY_INHERITED_CODE_ONLY_NEVER_EXECUTE_OR_IMPORT')
for row in profile['changes']:
 raw=(HERE/'bundle'/row['payloadLeaf']).read_bytes()
 check('delta exact hash and bytes '+row['path'],sha(raw)==row['sha256']and len(raw)==row['bytes'])
rows=json.loads((HERE/'bundle/source-rows.json').read_bytes())
prior=json.loads((ROOT/'outputs/D1/20261117-r3-root07-source-successor-01/source-rows.json').read_bytes())
# Compile only the two pure delta functions; no worker module is imported.
isolated=ast.Module(body=[new_functions[n]for n in ('need','check_delta')],type_ignores=[])
ns={'re':re,'KEY':profile['requestKey'],'OUTPUT':Path(profile['outputDirectory']),'PREDECESSOR':Path(profile['predecessorDirectory'])}
exec(compile(isolated,'root08-pure-delta-check','exec'),ns)
expected,changes=ns['check_delta'](profile,rows,prior)
check('actual metadata delta accepted with384 inherited',len(set(expected)-set(changes))==384)
def rejects(name,edit):
 d=copy.deepcopy(profile);r=copy.deepcopy(rows);p=copy.deepcopy(prior);edit(d,r,p)
 try:ns['check_delta'](d,r,p)
 except ValueError:checks.append(name);return
 raise AssertionError(name)
rejects('reject parent output overwrite',lambda d,r,p:d.update(outputDirectory=d['predecessorDirectory']))
rejects('reject wrong key',lambda d,r,p:d.update(requestKey='wrong'))
rejects('reject wrong count',lambda d,r,p:d.update(sourceFiles=387))
rejects('reject duplicate source path',lambda d,r,p:r.__setitem__(-1,r[0]))
rejects('reject source path traversal',lambda d,r,p:r[0].update(path='../data'))
rejects('reject missing asset',lambda d,r,p:d['changes'].pop())
rejects('reject duplicate delta payload',lambda d,r,p:d['changes'][1].update(payloadLeaf=d['changes'][0]['payloadLeaf']))
rejects('reject before pin mismatch',lambda d,r,p:d['changes'][0].update(beforeSha256='0'*64))
rejects('reject unrelated inherited row mutation',lambda d,r,p:next(x for x in r if x['path']not in changes).update(sha256='0'*64))
imports=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom))]
check('only original stdlib imports plus systemctl subprocess',all(isinstance(n,ast.Import)and all(a.name in ('pathlib','hashlib','json','os','re','stat','sys','time','subprocess')for a in n.names)or isinstance(n,ast.ImportFrom)and n.module=='pathlib'for n in imports))
# Only external process is a read-only unit listing, never Node/PG/issuer.
external=[n for n in ast.walk(tree)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and isinstance(n.func.value,ast.Name)and n.func.value.id=='subprocess']
check('only external command is read-only systemctl listing',len(external)==1 and ast.literal_eval(external[0].args[0])[:2]==['/usr/bin/systemctl','list-units'])
check('6c runner never executed or imported',not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Name)and n.func.id in ('exec','eval','compile','__import__')for n in ast.walk(tree)))
for name in ('prepare_source.py','check_source.py'):
 ast.parse((HERE/name).read_text());checks.append('Python syntax '+name)
checks.append('Python worker syntax')
(HERE/'ROOT07-TO-ROOT08.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='accepted-root07-materializer666a.py',tofile='root08-source-only-consumer.py')))
report=dict(state='ROOT08_NARROW_LOCAL_SOURCE_CHECKS_PASS_NOT_EXECUTED',checksPassed=len(checks),checks=checks,
 workerImported=False,workerMainExecuted=False,clockCalls=0,authorityFixtures=0,serverCalls=0,PGConnections=0,nativeOrNodeDescribeCalls=0,
 old384FilesDeepRehashed=False,rootRegistryChanged=False,SQLInstalled=False,actualRoot08Marker=None)
(HERE/'CHECK-RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'state':report['state'],'checksPassed':len(checks)}))
