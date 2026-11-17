"""Freeze local SOURCE metadata only; does not run issuers or transports."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 check=json.loads((HERE/'DELTA-CHECKS.json').read_bytes());assert check['state']=='SOURCE_ONLY_ORDINARY42_DELTA_CHECKS_PASS'
 h=json.loads((HERE/'HISTORY-INPUTS.json').read_bytes())
 names=sorted(p.name for p in HERE.iterdir()if p.is_file()and p.name!='SOURCE-PINS.json')
 files={name:{'bytes':len((HERE/name).read_bytes()),'sha256':sha((HERE/name).read_bytes())}for name in names}
 out=dict(state='NORMAL42_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED',sourceOnly=True,files=files,consumerSourcePinsSha256=h['consumerSourcePinsSha256'],interfaceSha256=h['consumerInterfaceSha256'],consumerRulesSha256=h['consumerRulesSha256'],rulesSha256=files['FIVE-PHASES.UNISSUED.json']['sha256'],checks=check['checks'],oldProtectedKeys=h['oldKeys'],newMaintenanceKeys=h['newKeys'],candidateKeys=h['candidateKeys'],serverActions=0,clockCalls=0,PGConnections=0,authoritiesIssued=False,rolesOrFutureCOrEpochOrWindow=None,rootPairReviewComplete=False,SQLInstalled=False,importReady=False,STAGEDExposed=False,publicationRestrictionsLifted=False)
 raw=(json.dumps(out,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode();(HERE/'SOURCE-PINS.json').write_bytes(raw)
 print(json.dumps({'state':out['state'],'sourcePinsSha256':sha(raw),'files':len(files),'rulesSha256':out['rulesSha256'],'checks':check['checks']}))
if __name__=='__main__':main()
