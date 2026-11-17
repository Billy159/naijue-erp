"""Freeze final SOURCE45 only after exact consumer metadata and delta checks."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 h=json.loads((D/'HISTORY-INPUTS.json').read_bytes());checks=json.loads((D/'DELTA-CHECKS.json').read_bytes())
 assert checks['state']=='SOURCE_ONLY_ORDINARY45_DELTA_CHECKS_PASS'and h['consumerReviewSha256']is not None
 files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p.read_bytes()))for p in sorted(D.iterdir())if p.is_file()and p.name!='SOURCE-PINS.json'}
 value=dict(state='NORMAL45_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED',sourceOnly=True,files=files,consumerSourcePinsSha256=h['consumerSourcePinsSha256'],interfaceSha256=h['consumerInterfaceSha256'],consumerRulesSha256=h['consumerRulesSha256'],consumerReviewSha256=h['consumerReviewSha256'],rulesSha256=files['FIVE-PHASES.UNISSUED.json']['sha256'],oldProtectedKeys=137,newContinuationKeys=5,candidateKeys=142,phaseOrder=h['phaseOrder'],checks=checks['checks'],completedPrepare05HistoricalOnly=True,serverActions=0,clockCalls=0,PGConnections=0,authoritiesIssued=False,futureCOrEpochOrWindow=None,rootPairReviewComplete=False,businessImportComplete=False,STAGEDExposed=False,publicationRestrictionsLifted=False)
 raw=(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode();(D/'SOURCE-PINS.json').write_bytes(raw)
 print(json.dumps(dict(sourcePinsSha256=sha(raw),files=len(files),oldKeys=137,candidateKeys=142,checks=checks['checks'])))
if __name__=='__main__':main()
