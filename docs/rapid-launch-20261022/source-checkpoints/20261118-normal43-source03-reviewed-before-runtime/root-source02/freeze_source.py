"""Freeze only final source43 metadata after narrow checks and consumer review."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());checks=json.loads((D/'DELTA-CHECKS.json').read_bytes())
 assert checks['state']=='SOURCE_ONLY_ORDINARY43_DELTA_CHECKS_PASS'and h['consumerReviewSha256']is not None
 names=sorted(p.name for p in D.iterdir()if p.is_file()and p.name!='SOURCE-PINS.json')
 files={n:{'bytes':(D/n).stat().st_size,'sha256':sha((D/n).read_bytes())}for n in names}
 value=dict(state='NORMAL43_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED',sourceOnly=True,files=files,consumerSourcePinsSha256=h['consumerSourcePinsSha256'],interfaceSha256=h['consumerInterfaceSha256'],consumerRulesSha256=h['consumerRulesSha256'],consumerReviewSha256=h['consumerReviewSha256'],rulesSha256=files['FIVE-PHASES.UNISSUED.json']['sha256'],oldProtectedKeys=h['oldKeys'],newContinuationKeys=h['newKeys'],candidateKeys=h['candidateKeys'],phaseOrder=h['phaseOrder'],checks=checks['checks'],completedPrepare05HistoricalOnly=True,serverActions=0,clockCalls=0,PGConnections=0,authoritiesIssued=False,futureCOrEpochOrWindow=None,rootPairReviewComplete=False,businessImportComplete=False,STAGEDExposed=False,publicationRestrictionsLifted=False)
 assert (value['oldProtectedKeys'],value['newContinuationKeys'],value['candidateKeys'])==(127,5,132)
 raw=(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode();(D/'SOURCE-PINS.json').write_bytes(raw)
 print(json.dumps({'sourcePinsSha256':sha(raw),'files':len(files),'oldKeys':127,'candidateKeys':132,'checks':checks['checks']}))
if __name__=='__main__':main()
