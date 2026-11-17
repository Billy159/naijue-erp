"""Freeze only final Root08 local SOURCE bytes; never invoke runtime interfaces."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def main():
 static=json.loads((HERE/'STATIC-INPUTS.json').read_bytes());checks=json.loads((HERE/'BASE109-CHECKS.json').read_bytes())
 assert checks['checksPassed']==88 and checks['originalKeys']==109 and checks['candidateKeys']==110 and checks['guards']==3
 contract={'state':'SOURCE_API_ONLY_NO_CALLS','requestKey':static['requestKey'],'actualBaseSha256':static['baselineRootPins']['dispatcher'],
  'requiredReviewFields':{'sourceOnly':True,'findings':[],'sourcePinsSha256':'actual final SOURCE-PINS digest',
   'consumerSourcePinsSha256':static['consumerSourcePinsSha256'],'consumerReviewSha256':static['consumerReviewSha256'],'rootPairReviewComplete':True},
  'orderedAPIs':[
   {'api':'prepare_channel.prepare_local()','owner':'T45 after Main post-review instruction','effect':'local newT45 preparation only'},
   {'api':'prepare_channel.stage_and_read(review_file, review_pin)','owner':'T45 after Main post-review instruction','effect':'original root channel exact2code stage and one paired fresh metadata read'},
   {'api':'main_issuer.issue_once(review_file, review_pin, closure_file, closure_pin, registry_file, registry_pin, authorization_reference)','owner':'Main only','effect':'local finite authority/policy/CAS packet; no remote execution'},
   {'api':'prepare_channel.register_once()','owner':'T45 after separate Main finite CAS instruction','effect':'original root channel exact one-key shared-lock CAS only'},
   {'api':'root08_cli.prepare(actual_cas_result_file)','owner':'T45 after actual CAS','effect':'actual-authority fixed original-client request preparation only'},
   {'api':'root08_cli.run_once(actual_cas_result_file)','owner':'T45 after separate Main materialization instruction','effect':'original clientmain fixed300s SOURCE-only one-shot job'}],
  'actualDiagnosticClosure':static['requiredActualDiagnosticClosure'],'actualRecoveryDecision':static['actualDiagnosticEvidence']['recoveryDecision'],
  'finiteAuthority':None,'actualFreshBasis':None,'actualRoot08Marker':None,'futureC':None,'futureEpoch':None,'futureRoles':None,'SQLUpgradePerformed':False}
 save(HERE/'ROOT08-API-CONTRACT.json',contract)
 names=['STATIC-INPUTS.json','ACTUAL109-DISPATCHER.py','prepare_root.py','render_admission.py','admission.template.py',
  'r3_root08_source_admission.py','patch_dispatcher.py','admin_exec.ROOT08-UNREGISTERED.py','closure.template.py',
  'assemble_registration.py','register_exact.py','read_paired_basis.py','main_issuer.py','prepare_channel.py','root08_cli.py',
  'check_root109.py','BASE109-CHECKS.json','ROOT109-TO-ROOT08.patch','HANDOFF.md','ROOT08-API-CONTRACT.json','freeze_source.py']
 names+=['transport/'+p.name for p in sorted((HERE/'transport').iterdir())if p.is_file()]
 files={name:{'bytes':len((HERE/name).read_bytes()),'sha256':sha((HERE/name).read_bytes())}for name in names}
 old=HERE/'LOCAL-CHECKS.WIP.json'
 report={'state':'ROOT08_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED','sourceOnly':True,'requestKey':static['requestKey'],
  'actualBaseSha256':static['baselineRootPins']['dispatcher'],'actualCasReceipt':static['actualCasReceipt'],'originalKeys':109,'candidateKeys':110,'guards':3,
  'consumerSourcePinsSha256':static['consumerSourcePinsSha256'],'consumerReviewSha256':static['consumerReviewSha256'],'consumerRevalidated':False,
  'newRootSourceChecks':88,'reusedNonBaseTransportChecks':66,'reusedEvidence':{'path':str(old),'sha256':sha(old.read_bytes()),'historicalBaseIsNotCurrentRoot':True},
  'actualDiagnosticEvidence':static['actualDiagnosticEvidence'],'actualDiagnosticClosure':static['requiredActualDiagnosticClosure'],
  'actualDiagnosticScope':static['actualDiagnosticScope'],'moduleSha256':files['r3_root08_source_admission.py']['sha256'],
  'dispatcherTemplateSha256':files['admin_exec.ROOT08-UNREGISTERED.py']['sha256'],'registerSha256':files['register_exact.py']['sha256'],
  'serverPGNodeNativeIssuerReaderCASWorkerClockCalls':0,'T45OrQBDispatched':False,'rootRegistrationExecuted':False,'materializationExecuted':False,
  'finiteAuthority':None,'actualFreshBasis':None,'actualRoot08Marker':None,'futureC':None,'futureEpoch':None,'futureRoles':None,
  'SQLExecuted':False,'SQLInstalled':False,'originalWriterReplayed':False,'newWriterKeyChosen':False,'rootPairReviewPending':True,'files':files}
 save(HERE/'SOURCE-PINS.json',report)
 print(json.dumps({'sourceSha256':sha((HERE/'SOURCE-PINS.json').read_bytes()),'moduleSha256':report['moduleSha256'],'dispatcherTemplateSha256':report['dispatcherTemplateSha256'],'registerSha256':report['registerSha256'],'members':len(files)}))
if __name__=='__main__':main()
