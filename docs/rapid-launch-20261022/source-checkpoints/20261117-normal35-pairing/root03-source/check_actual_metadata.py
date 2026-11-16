"""Actual metadata only: checked_consumer and a clock-free AST prefix, never issue()."""
from pathlib import Path
import ast,hashlib,json,os,runpy
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
OLD=HERE.parent/'20261117-r3-normal35-root-source-02'
sha=lambda b:hashlib.sha256(b).hexdigest()
old=runpy.run_path(str(OLD/'issue_registration.py'),run_name='pure_metadata_only')
new=runpy.run_path(str(HERE/'issue_registration.py'),run_name='pure_metadata_only')
w=json.loads((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())
try:old['checked_consumer'](w)
except KeyError as error:assert error.args==('sourceAssemblyServerActions',)
else:raise AssertionError('actual old metadata KeyError not reproduced')
frozen=new['checked_consumer'](w)
assert frozen['serverActions']==frozen['PGConnections']==0
tree=ast.parse((HERE/'issue_registration.py').read_text())
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='issue')
cut=next(i for i,n in enumerate(fn.body) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='now' for t in n.targets))
prefix=ast.FunctionDef(name='validate_real_preclock_metadata',args=fn.args,body=fn.body[:cut]+[ast.Return(value=ast.Constant(True))],decorator_list=[])
module=ast.fix_missing_locations(ast.Module(body=[prefix],type_ignores=[]))
assert 'time.time_ns' not in ast.unparse(module)
assert not any(isinstance(n,ast.Name) and n.id in ('roles','host_authority','output','packet') and isinstance(n.ctx,ast.Store) for n in ast.walk(module))
# The existing real review1537 describes SOURCE02's files; validate exactly those artifacts.
# No fabricated SOURCE03 review or future authority is supplied.
namespace=dict(new);namespace['HERE']=OLD
exec(compile(module,'actual-preclock-metadata-prefix','exec'),namespace)
review=ROOT/'outputs/QB/20261117-r3-normal35-root-review-02/RESULT.json'
basis=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-UNISSUED-03/ACTUAL-ROOT-REGISTRATION-BASIS-01.json'
consumer=ROOT/'outputs/QB/20261117-r3-normal35-consumer-review-03/RESULT.json'
assert sha(review.read_bytes())=='1537ec7d994c252f661d4c98c19317b9ef9f78bfe9b61b6a82e773589e2b9ca6'
assert sha(basis.read_bytes())=='9dce15ffbe7a391e971afe52cf6b358696dc57458926111ba72b39d66ceabf28'
out=ROOT/'outputs/主控/20261117-r3-normal35-registration-window-01'
assert not out.exists()
names=('ERP_SHARED_JOB_ID','ERP_SHARED_JOB_DIR');saved={key:os.environ.get(key) for key in names}
try:
 assert namespace['validate_real_preclock_metadata'](OLD/'NINE-PHASES.UNISSUED.json',old['FROZEN_RULES_SHA'],review,sha(review.read_bytes()),basis,sha(basis.read_bytes()),out,consumer,sha(consumer.read_bytes())) is True
finally:
 for key,value in saved.items():
  if value is None:os.environ.pop(key,None)
  else:os.environ[key]=value
assert not out.exists()
report={'state':'ACTUAL_METADATA_KEYERROR_RED_GREEN_AND_PRECLOCK_PREFIX_PASS','finding':'N35-R02',
 'oldCheckedConsumerError':'KeyError(sourceAssemblyServerActions)',
 'newCheckedConsumerAcceptedActualFiles':True,
 'sourcePinsSha256':w['consumerSourcePinsSha256'],'interfaceSha256':'8c6adf9ad501f914226832b3663da8f18084439c7cd724007f1edc52998fa139',
 'preclockPrefixUsedRealSource02Review1537ForUnchangedSource02Artifacts':True,
 'freshInputSha256':sha(basis.read_bytes()),'freshCheckedAtUTC':json.loads(basis.read_bytes())['checkedAtUTC'],
 'freshLifetimeExtended':False,'actualNowFreshnessNotEvaluated':True,
 'inputSchemasConsumedBeforeClock':['consumer SOURCE-PINS','consumer INTERFACE','consumer report f526','root SOURCE02 report1537 retained for regression only','human authority','witness','9 rules/static source leaves','completed preparation receipts','writer pure scope','222 pins/231 identities and lock','grant limit/timestamp parsing'],
 'issuerFunctionCalled':False,'clockCalled':False,'outputDirectoryCreated':False,
 'futureReviewOrAuthorityCreated':False,'targetOrCapabilityCreated':False,'serverConnections':0,'PGConnections':0}
(HERE/'ACTUAL-METADATA-REGRESSION.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('state','newCheckedConsumerAcceptedActualFiles','issuerFunctionCalled','clockCalled','outputDirectoryCreated','PGConnections')}))
