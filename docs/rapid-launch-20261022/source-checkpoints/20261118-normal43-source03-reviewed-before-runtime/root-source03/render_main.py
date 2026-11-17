"""Reuse Main7/8 call shape; writer implementation binds final consumer API only."""
from pathlib import Path
import ast
D=Path(__file__).resolve().parent;OLD=D.with_name('20261117-r3-ordinary42-root-source-02')
def main():
 s=(OLD/'issue_phase.py').read_text()
 for a,b in [('exactly apply/start/upgrade/stop/restore. No import branch.','exactly apply/start/writer/stop/restore; retained prepare05 only.'),('r3_normal42','r3_normal43'),('NORMAL42','NORMAL43'),('direct42','direct43'),('main42_','main43_'),("for phase in ('start','upgrade')","for phase in ('start','writer')"),('SUCCESSFUL_START_GUARDIAN_CLOSED_AUTH_RESTORED','SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED')]:s=s.replace(a,b)
 s=s.replace("assert evidence['writerSettled']","assert evidence['writerSettled'] and (evidence['currentWriterSettled'] or evidence['currentWriterUnsubmitted'])")
 t=ast.parse(s)
 for n in sorted([n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in ('runtime_catalog_facts','catalog_update_authority')],key=lambda n:n.lineno,reverse=True):
  s=s.replace(ast.get_source_segment(s,n),'',1)
 s=s.replace('def start_authority(witness, rule, apply, roles, policy, now):','def start_authority(witness, rule, apply, roles, policy, now, issued_bindings):')
 s=s.replace("**witness['predecessor']['bindings']",'**issued_bindings')
 s=s.replace('Finite same-PGDATA service42 after actual guardian41 closure and original authentication rollback02; no successful Stop41 fabricated.','Finite same-PGDATA service43 after actual successful service42, preservation stop42 and original authentication restoration42; retained prepare05.')
 s=s.replace("phase in ('apply','start','upgrade','stop','restore')and w['noWriterKeySelected']is True", "phase in ('apply','start','writer','stop','restore')and w['completedPrepareOnlyHistoricalReference']is True")
 s=s.replace("elif phase=='start':a=start_authority(w,rule,evidence,roles,policy,now)","elif phase=='start':\n  issued_bindings=manifest['predecessorBindings'];assert set(issued_bindings)==set(w['predecessor']['bindings'])and all(issued_bindings[k]==v for k,v in w['predecessor']['bindings'].items()if v is not None)and len(issued_bindings['previousRetainedAckSha256'])==64\n  a=start_authority(w,rule,evidence,roles,policy,now,issued_bindings)")
 a=s.index(" elif phase=='upgrade':");b=s.index(' else:a=preservation_authority',a)
 s=s[:a]+" elif phase=='writer':a=writer_authority(w,rule,evidence,predecessor,roles,policy,manifest,now)\n"+s[b:]
 s=s.replace("# A new phase is materialized once; ambiguity is read under the original key.", "if phase=='writer':assert predecessor_pin==w['prepare05']['safeReadbackSha256']\n # A new phase is materialized once; ambiguity is read under the original key.")
 insert=s.index('def issue(');s=s[:insert]+(D/'writer_authority.template.py').read_text()+'\n'+s[insert:]
 compile(s,'main8_normal43','exec');(D/'issue_phase.py').write_text(s)
 print('Main8 SOURCE rendered; no issuer called.')
if __name__=='__main__':main()
