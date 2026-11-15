"""Execute only the diagnostic parser AST with an in-memory save; never run harness/PG."""
import ast,hashlib,json,re
from pathlib import Path
base=Path(__file__).resolve().parent
source=(base/'run-local.py').read_text();tree=ast.parse(source)
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='save_install_diagnostic')
cfg=json.loads((base/'TARGET.json').read_text());sql_path=Path(cfg['candidate02'])/'sql/source-slices.sql'
records=[]
def require(value,code):
 if not value:raise AssertionError(code)
namespace={'Path':Path,'config':cfg,'re':re,'hashlib':hashlib,'json':json,'require':require,'save':lambda name,value:records.append((name,value))}
exec(compile(ast.Module(body=[function],type_ignores=[]),'<diagnostic-only-ast>','exec'),namespace)
parse=namespace['save_install_diagnostic']
body=(f'NOTICE: harmless preceding notice\npsql:{sql_path}:99: ERROR:  42601: syntax error at or near "FIXTURE_TOKEN"\n'
      'LINE 1: SELECT PRIVATE_SENTINEL;\nQUERY: SELECT PRIVATE_SENTINEL;\n'
      'CONTEXT:  SQL statement "SELECT PRIVATE_SENTINEL;"\n'
      'PL/pgSQL function fixture_function(jsonb) line 7 at SQL statement\n'
      'LOCATION:  scanner_yyerror, scan.l:1244\n'
      f'psql:{sql_path}:100: ERROR:  23514: SECOND_ERROR_SENTINEL\n').encode()
parse(body,3,sql_path);name,value=records.pop()
assert value['firstError']=={'sqlState':'42601','message':'syntax error at or near "FIXTURE_TOKEN"'}
assert value['sourceLineNumber']==99 and value['exitCode']==3 and value['contextFrames']==['PL/pgSQL function fixture_function(jsonb) line 7 at SQL statement']
assert value['sourceSqlSha256']==hashlib.sha256(sql_path.read_bytes()).hexdigest()
encoded=json.dumps(value,ensure_ascii=False).encode();assert b'PRIVATE_SENTINEL' not in encoded and b'SECOND_ERROR_SENTINEL' not in encoded
parse((f'psql:{sql_path}:1: ERROR:  23514: '+('\u8863'*3000)+'\n').encode(),3,sql_path)
assert len((json.dumps(records.pop()[1],ensure_ascii=False,indent=2)+'\n').encode())<=4096
parse(b'psql: unknown non-SQL client failure\n',2,sql_path);value=records.pop()[1]
assert value['firstError'] is None and value['diagnosticParsed'] is False
parse(b'',0,sql_path);value=records.pop()[1];assert value['firstError'] is None and value['exitCode']==0
try:parse(body,3,sql_path.with_name('other.sql'))
except AssertionError:pass
else:raise AssertionError('unexpected diagnostic source accepted')
assert not records
old=(base.with_name('20261115-r3-batched-pg-local-02')/'run-local.py').read_text()
assert old[old.index('\nfinally:\n'):old.index("\ntry:save('RESULT.json'")]==source[source.index('\nfinally:\n'):source.index("\ntry:save('RESULT.json'")]
main=next(node for node in tree.body if isinstance(node,ast.Try) and node.finalbody)
assert 'scenario.mjs' not in ast.get_source_segment(source,main)
print(json.dumps({'state':'SCOPED_MEMORY_CHECK_PASS','cases':['verbose-first-error-and-source-line','omit-SQL-echo-and-second-error','UTF8-4KiB-bound','unparsed-client-error-no-fabricated-SQLSTATE','successful-installer-no-fabricated-error','reject-other-source'],'cleanupFinallyByteUnchanged':True,'scenarioEntrypointAbsent':True,'pgExecutions':0,'harnessExecuted':False,'oldSuitesRerun':False}))
