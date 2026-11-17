"""Render existing Main7/8 for exact42 scopes; no issuance occurs here."""
from pathlib import Path
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary41-root-source-01')
def main():
 for name in ['issue_registration.py','issue_phase.py']:
  s=(OLD/name).read_text()
  changes=[('PHASES41.UNISSUED.json','PHASES42.UNISSUED.json'),('r3_normal41_continuation.py','r3_normal42_continuation.py'),('admin_exec.NORMAL41-UNREGISTERED.py','admin_exec.NORMAL42-UNREGISTERED.py'),('direct41-batched-real.json','direct42-batched-real.json'),('T45_R3_NORMAL41_BATCHED_REAL_V1','T45_R3_NORMAL42_BATCHED_REAL_V1'),('T45_NORMAL41_REGISTRATION_CAS_V1','T45_NORMAL42_REGISTRATION_CAS_V1'),('NORMAL41_POLICY_SHA256','NORMAL42_POLICY_SHA256'),('READONLY_NORMAL41_REGISTRATION_BASIS','READONLY_NORMAL42_REGISTRATION_BASIS'),('ISSUED_NORMAL41_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED','ISSUED_NORMAL42_FIVE_PHASE_REGISTRATION_NO_PHASE_SUBMITTED'),('Main ordinary41 exact five-step','Main ordinary42 exact five-step'),('main41_','main42_')]
  for a,b in changes:s=s.replace(a,b)
  if name=='issue_registration.py':
   s=s.replace("assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True", "assert basis['actualFailed40ClosedAndOriginalAuthRestored']is True and basis['actual41GuardianClosedAndOriginalAuthRestoredByRollback02']is True")
  if name=='issue_phase.py':
   s=s.replace('SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED','SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED')
   s=s.replace('Finite same-PGDATA service41 after actual failed40 and restored40 and completed ROOT08 source, with exact original authentication restored38.','Finite same-PGDATA service42 after actual guardian41 closure and original authentication rollback02; no successful Stop41 fabricated.')
  compile(s,name,'exec');(D/name).write_text(s)
 print('Main7/8 SOURCE definitions rendered; no clocks or consumers called.')
if __name__=='__main__':main()
