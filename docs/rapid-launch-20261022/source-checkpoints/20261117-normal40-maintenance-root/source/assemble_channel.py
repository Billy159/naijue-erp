"""Adapt the existing Root08 transport to the five-phase CAS; define only."""
from pathlib import Path
import hashlib
HERE=Path(__file__).resolve().parent;BASE=HERE.with_name('20261117-r3-root08-source-admission-02')
def main():
 text=(BASE/'prepare_channel.py').read_text()
 edits={
 "TARGET=V/'ROOT08-EXECUTION-PREPARATION-01'":"TARGET=V/'NORMAL40-ROOT-EXECUTION-PREPARATION-01'",
 "r3-root08-source-registration-source-20261117-01":"r3-normal40-registration-source-20261117-01",
 "ROOT08_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED":"NORMAL40_ROOT_SOURCE_READY_UNISSUED_NOT_REGISTERED",
 "('register_exact.py','read_paired_basis.py')":"('register_cas.py','read_registration_basis.py','r3_normal40_continuation.py')",
 "STAGE/'read_paired_basis.py'":"STAGE/'read_registration_basis.py'",
 "assert set(result)=={'closure','registry'}":"assert result['state']=='READONLY_NORMAL40_REGISTRATION_BASIS'\n result={'basis':result}",
 "for key in ('closure','registry'):":"for key in ('basis',):",
 "window=ROOT/'outputs/主控/20261117-r3-root08-source-materialization-window-01'":"window=Path(registration_directory).resolve();assert window.parent==ROOT/'outputs/主控'",
 "def register_once():":"def register_once(registration_directory):",
 "issued['registrationAuthoritySha256']":"issued['registrationSha256']",
 "assert a['requestKey']=='t45-r3-batched-root08-source-delta-20261117-01'":"assert a['jobs']==json.loads((HERE/'HISTORY-INPUTS.json').read_bytes())['jobs']",
 "prepared['codePins']['register_exact.py']":"prepared['codePins']['register_cas.py']",
 "{'requestKey':a['requestKey'],'automaticReplay':False}":"{'jobs':a['jobs'],'automaticReplay':False}",
 "STAGE+'/register_exact.py'":"STAGE+'/register_cas.py'",
 "EXACT_ROOT08_SOURCE_KEY_REGISTERED_NO_MATERIALIZATION_OR_SQL":"EXACT_NORMAL40_FIVE_PHASE_ROOT_REGISTERED_NO_PHASE_OR_SQL_EXECUTED",
 "old109AndThreeGuardsPreserved":"old110AndThreeGuardsPreserved",
 "result['materializationSubmitted']":"result['maintenanceSubmitted']",
 }
 for old,new in edits.items():assert old in text,old;text=text.replace(old,new)
 (HERE/'prepare_channel.py').write_text(text)
 print('Rendered existing transport adapter only; no prepare/stage/read/CAS invoked.')
if __name__=='__main__':main()
