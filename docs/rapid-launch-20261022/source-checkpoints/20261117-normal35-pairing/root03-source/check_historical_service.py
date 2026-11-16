"""One real-receipt regression: no issuer, target, capability, future result or database."""
from pathlib import Path
import hashlib,json,runpy,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
OLD=HERE.parent/'20261117-r3-normal35-root-source-01'
receipt=ROOT/'outputs/T45/revisions/20261116-r3-service32-registration-actual-01/install/READBACK-02.json'
raw=receipt.read_bytes();assert hashlib.sha256(raw).hexdigest()=='6808ecbd33dc8a0f76fc4f2c22690ac2b0cb773340a1151eae71f8b9e944fa8b'
actual=json.loads(raw);old_w=json.loads((OLD/'NINE-PHASES.UNISSUED.json').read_bytes());new_w=json.loads((HERE/'NINE-PHASES.UNISSUED.json').read_bytes())
old_api=runpy.run_path(str(OLD/'issue_phase.py'),run_name='actual_pure_historical_only')
new_api=runpy.run_path(str(HERE/'issue_phase.py'),run_name='actual_pure_historical_only')
try:old_api['historical_catalog'](old_w,actual)
except AssertionError as error:
 frame=traceback.extract_tb(error.__traceback__)[-1]
 assert frame.name=='historical_catalog' and frame.lineno==299
 red={'exception':'AssertionError','function':frame.name,'line':frame.lineno}
else:raise AssertionError('actual old historical service mismatch was not reproduced')
result=new_api['historical_catalog'](new_w,actual)
assert result==actual['result']['batchedCatalog']
assert new_w['historicalInstallService']==actual['result']['service']
assert new_w['historicalInstall']==old_w['historicalInstall'] and new_w['priorService']==old_w['priorService']
assert new_w['predecessor']==old_w['predecessor']
assert new_w['historicalInstallService']['serviceKey']=='t45-first-r3-native-service-start-20261116-32'
assert new_w['priorService']['serviceKey']=='t45-first-r3-native-service-start-20261116-34'
evidence={'state':'ACTUAL_HISTORICAL_INSTALL_SERVICE_RED_GREEN_CONFIRMED','sourceOnly':True,
 'finding':'N35-R01','actualReadbackSha256':hashlib.sha256(raw).hexdigest(),
 'oldUnchangedPureFunctionActualFailure':red,'correctedPureFunctionAcceptedSameActualReceipt':True,
 'historicalInstallationService':actual['result']['service'],'currentStartupPredecessor':new_w['priorService'],
 'historicalReceiptPinsUnchanged':new_w['historicalInstall'],'returnedCatalogPins':result,
 'historicalReceiptBytesModified':False,'currentPredecessorModified':False,
 'futureApplyOrServiceFixtureCreated':False,'targetCapabilityOrAuthorityCreated':False,
 'issuerInvoked':False,'nativeInvoked':False,'serverConnections':0,'PGConnections':0,'clockIssued':False}
(HERE/'HISTORICAL-SERVICE-REGRESSION.json').write_text(json.dumps(evidence,sort_keys=True,indent=2)+'\n')
print(json.dumps({'state':evidence['state'],'oldFailedLine':red['line'],'newAcceptedActualReceipt':True,'historicalService':'32','currentPredecessor':'34','PGConnections':0,'clockIssued':False}))
