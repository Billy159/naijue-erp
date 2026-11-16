"""Only new code-location/CAS binding; reuse accepted631 classifier, no main call."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def functions(path):return {n.name:ast.dump(n,include_attributes=False) for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef)}
def main():
 old=HERE.with_name('20261117-r3-normal36-basis-diagnostic-source-02');assert functions(old/'diagnose_cli.py')==functions(HERE/'diagnose_cli.py')
 m=runpy.run_path(str(HERE/'diagnose_cli.py'),run_name='binding_metadata_only')
 root=ROOT/'outputs/D1/20261117-r3-normal36-root-source-03';cas=(root/'register_cas.py').read_bytes();reader=(root/'read_registration_basis.py').read_bytes()
 assert hashlib.sha256(cas).hexdigest()==m['CAS_SHA']=='43bc7cb86876670edcaae467f726e2e2905f5eb98f481635f3b31de0765da6ae'
 assert hashlib.sha256(reader).hexdigest()==m['READER_SHA']=='de8fa0a9f4473fb06dd6196b28ca34f76e57e48f62406db7afc6a21848746dbd'
 assert m['CODE'].name=='r3-normal36-readonly-basis-source-20261117-02'
 assert m['original_argv']()==['/usr/bin/python3','-I','-S',str(m['CODE']/'read_registration_basis.py'),str(m['CODE']/'register_cas.py'),m['CAS_SHA']]
 schema=m['metadata'](cas,reader);assert len(schema['basis'])==254 and len(schema['custody'])==12
 assert schema['basis'][184].endswith('/r3-normal35-registration-cas-20261117-01/result.json')
 assert schema['basis'][239].endswith('/r3_direct35_normal.py')
 report=dict(state='PASS_ONLY_DIAGNOSTIC_CODE02_AND_CORRECTED_CAS_BINDING',allDiagnosticFunctionASTUnchanged=True,priorClassifierReviewSha256='631ba2c649b9cfab21101a818141cc334f9248c1448af0b3b50133cb28db3b68',casSHA=m['CAS_SHA'],readerSHA=m['READER_SHA'],correctedSlots=[184,239],newIndependentCodeLocationOnly=True,originalCLI560sAndAllGuardsUnchanged=True,mainOrReaderOrCASCalled=False,serverActions=0,PGConnections=0,clockIssued=False)
 (HERE/'BINDING-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
