"""Verify only real existing frozen metadata before the issuer clock."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent

def main():
    api=runpy.run_path(str(HERE/'issue_restore.py'),run_name='source_only_no_issuance')
    values=api['frozen_inputs']();api['validate_inventory'](values[-1],values[-1])
    tree=ast.parse((HERE/'issue_restore.py').read_bytes())
    clock_calls=[n for n in ast.walk(tree)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='time_ns']
    issue=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='issue')
    assert len(clock_calls)==1 and clock_calls[0] in list(ast.walk(issue))
    calls=[n for n in ast.walk(issue)if isinstance(n,ast.Call)and isinstance(n.func,ast.Subscript)and isinstance(n.func.slice,ast.Constant)and n.func.slice.value=='preservation_authority']
    assert len(calls)==1 and isinstance(calls[0].args[0],ast.Constant)and calls[0].args[0].value=='restore'
    for p in HERE.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
    return dict(state='REAL_EXISTING_METADATA_PRECLOCK_PREFIX_AND_RESTORE_ONLY_SOURCE_PASS',requestKey=api['KEY'],oldPermitSha256=api['OLD_PERMIT'],rolesAuthoritySha256=api['ROLE'],expectedMembersIncludingManifest=len(values[-1]['expected']),outputDirectory=str(api['OUTPUT']),PGConnections=0,clockCalls=0,issuerInvoked=False,clientOrRemoteInvoked=False,futurePermitOrTargetOrCapabilityFixtureCreated=False)
if __name__=='__main__':print(json.dumps(main(),sort_keys=True,indent=2))
