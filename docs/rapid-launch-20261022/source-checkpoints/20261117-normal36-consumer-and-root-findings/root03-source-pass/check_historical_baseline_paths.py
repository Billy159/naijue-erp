"""Exact static repair proof from the actual diagnostic and immutable35 readback."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def functions(path):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef)}
def main():
 old=HERE.with_name('20261117-r3-normal36-root-source-02')
 a=runpy.run_path(str(old/'register_cas.py'),run_name='old_static_definitions');b=runpy.run_path(str(HERE/'register_cas.py'),run_name='new_static_definitions')
 assert functions(old/'register_cas.py')==functions(HERE/'register_cas.py')
 before=list(a['BASIS'].items());after=list(b['BASIS'].items());assert len(before)==len(after)==254
 changed=[i for i,(x,y) in enumerate(zip(before,after)) if x!=y];assert changed==[184,239]
 assert all(x[1]==y[1] for x,y in zip(before,after))
 receipt=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-UNISSUED-03/ACTUAL-ROOT-REGISTRATION-READBACK.json'
 raw=receipt.read_bytes();assert sha(raw)=='27137faf09e1b05e9ca813be271f5e6179f971a5cad68cccbd5957e00f56683a';r=json.loads(raw)
 assert after[184]==(b['B']/'r3-normal35-registration-cas-20261117-01/result.json',r['auditResultSha256'])
 assert after[239]==(b['P']/'r3_direct35_normal.py',r['actualPins']['module'])
 state=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 reserved=[b['NEW_MODULE'],b['NEW_POLICY'],b['AUDIT'],b['ENTRY'].parent,b['P']/'.normal36-dispatcher.pending',state/'state/native-services/ordinary36-auth-20261116-01',state/'state/native-services'/b['JOBS']['start'],state/'authority/fresh35-current-production-service-v2-service-36.json',state/'state/fresh35-first-production-20261110-r3/ordinary36-auth-capture-20261116-01',state/'state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-02']
 paths=[*b['BASIS'],*map(Path,b['CUSTODY_FILES'])]
 assert not [(p,q) for p in paths for q in reserved if p==q or q in p.parents]
 assert not [p for p in paths if any(key in p.parts for key in b['JOBS'].values())]
 assert len(b['CUSTODY_FILES'])==12 and a['CUSTODY_FILES']==b['CUSTODY_FILES']
 assert a['NEW_MODULE']==b['NEW_MODULE'] and a['NEW_POLICY']==b['NEW_POLICY'] and a['AUDIT']==b['AUDIT'] and a['ENTRY']==b['ENTRY']
 assert "SOURCE="+repr(sha((HERE/'register_cas.py').read_bytes())) in (HERE/'original-cas-normal36-carrier.UNISSUED.py').read_text()
 assert (old/'read_registration_basis.py').read_bytes()==(HERE/'read_registration_basis.py').read_bytes()
 assert (old/'SIX-PHASES.UNISSUED.json').read_bytes()==(HERE/'SIX-PHASES.UNISSUED.json').read_bytes()
 diag=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-REGISTRATION-DIAGNOSTIC-ACTUAL-01/DIAGNOSTIC-RESULT.json'
 assert sha(diag.read_bytes())=='bea236e4c652ed5b6253aa56fcaf47e59cb4636e300919d7697dba4409ebe3a4'
 d=json.loads(diag.read_text());assert d['basisIndex']==184 and d['errorClass']=='FileNotFoundError' and d['errno']==2
 report=dict(state='PASS_EXACT_TWO_HISTORICAL_BASELINE_PATH_REPAIRS',actualDiagnosticSha256=sha(diag.read_bytes()),actual35RegistrationReadbackSha256=sha(raw),correctedSlots=changed,pinsAndOrderAndCountUnchanged=True,noBaselineOrCustodyInsideReservedFutureNamespace=True,allCASFunctionASTUnchanged=True,readerAndSIXUnchanged=True,oldCC05Cause='UNKNOWN',slot239RuntimeFailureClaimed=False,serverActions=0,PGConnections=0,readerOrCASMainCalled=False,clockIssued=False)
 (HERE/'PATH-REPAIR-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
