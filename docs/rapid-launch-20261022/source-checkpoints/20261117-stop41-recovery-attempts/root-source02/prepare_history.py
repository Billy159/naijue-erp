from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p,pin):
 b=p.read_bytes();assert sha(b)==pin,p;return json.loads(b)
def main():
 start=read(V/'NORMAL41-MAINTENANCE-EXECUTION-PREPARATION-01/runtime/start/ACTUAL-START41-TERMINAL-RESULT.PRIVATE.json','a82e6b3de3a158ef927733b1eddcedc97608286089a4fcffe82728d470cea576')
 stop=read(V/'NORMAL41-MAINTENANCE-EXECUTION-PREPARATION-01/runtime/stop/ACTUAL-STOP41-TERMINAL-RESULT.json','791c69be347aac1fbc379fdef60154c8d5783bfdbc5df4c938a0e893dcc87736')
 safe=json.loads((R/'outputs/主控/20261117-r3-normal41-registration-window-01/ISSUED-SAFE-METADATA.json').read_bytes())
 assert stop['terminal']['status']=='FAILED'and stop['terminal']['exitCode']==2 and stop['result']['safeCode']=='NORMAL05_STOP_PINNED_MODULE_DIFFERS'
 history=dict(service=start['service'],startPins=start['rootPins'],failedStop=dict(key=stop['requestKey'],terminalSha256=stop['rootPins']['terminal'],resultSha256=stop['rootPins']['result']),originalWorkDeadline=start['actualSharedServiceWorkDeadline'],originalLeaseExpiresAt=start['outerAuthorityLeaseExpiresAt'],originalRestorationDeadline=safe['roleTiming']['restorationDeadline'],originalRolesSha256=safe['issued']['rolesSha256'],originalRegisteredSourcePinsSha256='aadc9d64d157e46f0d7568ceecc69efca26f599fd68f4de8950d1942ac96a3a8',dispatcherSha256='2b8e633af94581d2ca5fcbf9c1a970353a3bae1019a55a5f462befc063832ca0',module41Sha256='c478692d5d36ebb56e17fea3c2fc18baa7dd30729eb019e14282a10622a836ce',policy41Sha256='5bdd2a3d7aa88486bf2248fee43cadf976738b2e2d330a7b918860c726bde4f9',newJobId='t45-r3-ordinary41-preserve-stop-recovery-20261117-01',oldProtectedKeys=120,newProtectedKeys=121,consumerSourcePinsSha256=None,finiteAuthority=None)
 (D/'HISTORY.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n');print('Actual C41/deadline/failedStop anchors read; no live calls.')
if __name__=='__main__':main()
