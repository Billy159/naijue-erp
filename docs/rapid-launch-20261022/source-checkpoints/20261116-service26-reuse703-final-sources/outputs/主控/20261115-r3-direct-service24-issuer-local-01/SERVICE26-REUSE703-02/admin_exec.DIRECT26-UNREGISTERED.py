"""Root-owned, expiring project dispatcher; installed only from the existing lease."""
import argparse, fcntl, hashlib, json, os, pwd, re, shutil, signal, socket, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent
CONFIG = PUBLIC / 'grant.json'
PREDECESSOR = '5cc58239751e4e2a'
PREDECESSOR_PUBLIC = PUBLIC.parent / ('grant-' + PREDECESSOR)
PREDECESSOR_SHA = '9c7c5eabe4697fc1768e370f4e972dc6ca6a0f8306ed0c5c04729e798c66e15d'
TASKS = {'T10','T15','T16','T17','T18','T19'} | {'T'+str(x) for x in range(36,52)}
GATES = {'T47':['G4'],'T49':['G5'],'T50':['G5'],'T51':['G6']}
PASS = {'PASS','PASSED','PASS_GATE','PASS_GATE_ACCEPTANCE','PASS_TASK_ACCEPTANCE'}
# Reviewed root registration remains unbound in this candidate.
R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None
R3_ORIGINAL02_ABSENT_SOURCE_SHA256 = 'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d'
R3_ORIGINAL02_ABSENT_KEYS = ['t45-first-20261110-r3-real-execute-20261114-03', 't45-first-20261110-r3-real-execute-20261114-04', 't45-first-20261110-r3-real-execute-20261114-05', 't45-first-20261110-r3-real-execute-20261114-06', 't45-first-20261110-r3-real-readback-20261114-21', 't45-first-20261110-r3-real-readback-20261114-22', 't45-first-20261110-r3-real-readback-20261114-22-02', 't45-first-20261110-r3-real-readback-20261114-22-03', 't45-first-20261110-r3-real-readback-20261114-22-04', 't45-first-20261110-r3-real-readback-20261114-23-01', 't45-first-r3-native-service-start-20261114-21', 't45-first-r3-native-service-start-20261114-22', 't45-first-r3-native-service-start-20261114-23', 't45-first-r3-native-service-start-20261115-24', 't45-first-r3-native-service-start-20261116-25', 't45-first-r3-native-service-start-20261116-26', 't45-r3-batched-install-20261115-01', 't45-r3-batched-real-execute-20261115-01', 't45-r3-batched-root03-source-delta-20261116-01', 't45-r3-batched-source-materialize-20261115-01', 't45-r3-ordinary21-auth-apply-20261114-01', 't45-r3-ordinary21-auth-restore-20261114-01', 't45-r3-ordinary21-preserve-stop-20261114-01', 't45-r3-ordinary22-auth-apply-20261114-01', 't45-r3-ordinary22-auth-apply-20261114-02', 't45-r3-ordinary22-auth-restore-20261114-01', 't45-r3-ordinary22-preserve-stop-20261114-01', 't45-r3-ordinary23-auth-apply-20261114-01', 't45-r3-ordinary23-auth-restore-20261114-01', 't45-r3-ordinary23-preserve-stop-20261114-01', 't45-r3-ordinary24-auth-apply-20261115-01', 't45-r3-ordinary24-auth-apply-20261115-02', 't45-r3-ordinary24-auth-restore-20261115-01', 't45-r3-ordinary24-preserve-stop-20261115-01', 't45-r3-ordinary25-auth-apply-20261116-01', 't45-r3-ordinary25-auth-restore-20261116-01', 't45-r3-ordinary25-preserve-stop-20261116-01', 't45-r3-ordinary26-auth-apply-20261116-01', 't45-r3-ordinary26-auth-restore-20261116-01', 't45-r3-ordinary26-preserve-stop-20261116-01']
R3_READONLY_RECOVERY_POLICY_SHA256 = '338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd'
R3_READONLY_RECOVERY_SOURCE_SHA256 = '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e'
R3_CONTINUITY_POLICY_SHA256 = '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757'
R3_CONTINUITY_SOURCE_SHA256 = '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d'
R3_SMOKE_A_MODULE_SHA256 = 'bd7025ced88935b99c52ca35d12f665f77595a8ac97a8f63ece6122b0dad8e29'
R3_SMOKE_A_POLICY_SHA256 = '675c4367f9c8b115198c73078bc041b38166aa89a65f42e4692c535be6af9211'
R3_SMOKE_A_KEYS = ('t45-r3-smoke-a-20261114-01-materialize', 't45-r3-smoke-a-20261114-01-start', 't45-r3-smoke-a-20261114-01-birth', 't45-r3-smoke-a-20261114-01-install', 't45-r3-smoke-a-20261114-01-terminal')
R3_COMPILE_KEYS = ('t45-r3-sql39-compile-full-20261114-01-materialize', 't45-r3-sql39-compile-full-20261114-01-start', 't45-r3-sql39-compile-full-20261114-01-birth', 't45-r3-sql39-compile-full-20261114-01-install', 't45-r3-sql39-compile-full-20261114-01-terminal')
R3_COMPILE_POLICY_SHA256 = '07c35e629f5941f1998ab2ba0ea118066667c07688720a8fbc86a750c5116a9e'
R3_COMPILE_ADAPTER_SHA256 = '427e986caf54d6405058ae68ad036ff276426543a604716bda292275fa1b1967'
R3_COMPILE_02_KEYS = ('t45-r3-sql39-compile-full-20261115-02-materialize', 't45-r3-sql39-compile-full-20261115-02-start', 't45-r3-sql39-compile-full-20261115-02-birth', 't45-r3-sql39-compile-full-20261115-02-install', 't45-r3-sql39-compile-full-20261115-02-terminal')
R3_COMPILE_02_POLICY_SHA256 = '58db3bb5c70ae648599bd24dd154eb63f5c8d0c039718b141ae1a87ddd59f0e8'
R3_COMPILE_02_ADAPTER_SHA256 = '0bd1f6817c8766b4b1e515d6395cdf62d8a435bf143ba6491e32b56235eddecd'
R3_COMPILE_03_KEYS = ('t45-r3-sql39-compile-full-20261115-03-materialize', 't45-r3-sql39-compile-full-20261115-03-start', 't45-r3-sql39-compile-full-20261115-03-birth', 't45-r3-sql39-compile-full-20261115-03-install', 't45-r3-sql39-compile-full-20261115-03-terminal')
R3_COMPILE_03_POLICY_SHA256 = '5c483a374e29c09e86ed171e9c12512710a7d33056f9372368be613a215c4a4e'
R3_COMPILE_03_ADAPTER_SHA256 = 'e54ca36fc01843360a9fcd83520c9a8f9ed981ff7cffabaa826d7b28dac07520'
R3_COMPILE_04_KEYS = ('t45-r3-sql39-compile-full-20261115-04-materialize', 't45-r3-sql39-compile-full-20261115-04-start', 't45-r3-sql39-compile-full-20261115-04-birth', 't45-r3-sql39-compile-full-20261115-04-install', 't45-r3-sql39-compile-full-20261115-04-terminal')
R3_COMPILE_04_POLICY_SHA256 = '7069c2f8457047243259c45f2b0f4f15b8047772cf3cd3b83c8c0d27951df66d'
R3_COMPILE_04_ADAPTER_SHA256 = 'b2f6e7d55f10e6d30640a9c19d1e0c4614a034c1ff13e2126a05e4d54de083d5'
R3_PREFIX155_KEYS = ('t45-r3-prefix155-measure-20261115-01-materialize', 't45-r3-prefix155-measure-20261115-01-start', 't45-r3-prefix155-measure-20261115-01-birth', 't45-r3-prefix155-measure-20261115-01-install', 't45-r3-prefix155-measure-20261115-01-terminal')
R3_PREFIX155_POLICY_SHA256 = '0c6c25cf693ef606fe574f0489a3bf6f302ab55427e99687da040b85cd31433b'
R3_PREFIX155_ADAPTER_SHA256 = 'e225209a3c90bec95105f3e4d3001cc153aacc7483e9e2e22d70aa8cd5fda453'
R3_PREFIX155114_KEYS = ('t45-r3-prefix155114-measure-20261115-01-materialize', 't45-r3-prefix155114-measure-20261115-01-start', 't45-r3-prefix155114-measure-20261115-01-birth', 't45-r3-prefix155114-measure-20261115-01-install', 't45-r3-prefix155114-measure-20261115-01-terminal')
R3_PREFIX155114_POLICY_SHA256 = '07d36649e2915a51acbf034b500d1f73dc49ca1f6f30bbfb929ca335371d099d'
R3_PREFIX155114_ADAPTER_SHA256 = 'e7eb0f22a87ddc71ccc052b056a916be6889c90d7470336a4c5b736d6b4d02d5'
R3_PARTY_SET_PROOF_KEYS = ('t45-r3-party-set-proof-measure-20261115-01-materialize', 't45-r3-party-set-proof-measure-20261115-01-start', 't45-r3-party-set-proof-measure-20261115-01-birth', 't45-r3-party-set-proof-measure-20261115-01-install', 't45-r3-party-set-proof-measure-20261115-01-terminal')
R3_PARTY_SET_PROOF_POLICY_SHA256 = '4655e64709e03e40b665ab2a3464b696ae0b94a0c547d9edb69615f479286953'
R3_PARTY_SET_PROOF_ADAPTER_SHA256 = 'b9acf459c0941693a7cc5a8402bf3d0aa7cf2e16da7e187a1abc27d29a2ab8f0'
R3_PARTY_SET_PROOF_02_KEYS = ('t45-r3-party-set-proof-measure-20261115-02-materialize', 't45-r3-party-set-proof-measure-20261115-02-start', 't45-r3-party-set-proof-measure-20261115-02-birth', 't45-r3-party-set-proof-measure-20261115-02-install', 't45-r3-party-set-proof-measure-20261115-02-terminal')
R3_PARTY_SET_PROOF_02_POLICY_SHA256 = '356469caab7bc7de36b1f5e3daaa3244561cc07a4b44334c8779bcb0d1e1941a'
R3_PARTY_SET_PROOF_02_ADAPTER_SHA256 = '6594037c4fca0b5a3643a1533b38fcf5f1360d3250b8202d6198387864f6c591'
R3_PARTY_OPERATION_LOCATOR_KEYS = ('t45-r3-party-operation-locator-measure-20261115-01-materialize', 't45-r3-party-operation-locator-measure-20261115-01-start', 't45-r3-party-operation-locator-measure-20261115-01-birth', 't45-r3-party-operation-locator-measure-20261115-01-install', 't45-r3-party-operation-locator-measure-20261115-01-terminal')
R3_PARTY_OPERATION_LOCATOR_POLICY_SHA256 = '28b2518251d081226b99d56b9d0ecdaade410b173cc072401b435ce1e90aa1cd'
R3_PARTY_OPERATION_LOCATOR_ADAPTER_SHA256 = '7a188b08da8ae35d2c6a674d49254a2f3ff0585bf5f65c8def2da30b1c8af469'
R3_PARTY_SINGLE_PROJECTION_KEYS = ('t45-r3-party-single-projection-measure-20261115-01-materialize', 't45-r3-party-single-projection-measure-20261115-01-start', 't45-r3-party-single-projection-measure-20261115-01-birth', 't45-r3-party-single-projection-measure-20261115-01-install', 't45-r3-party-single-projection-measure-20261115-01-terminal')
R3_PARTY_SINGLE_PROJECTION_POLICY_SHA256 = '9763399f50809d80acd197a102a0ac3fd18bed4d2e29f8f23099775c42eeb417'
R3_PARTY_SINGLE_PROJECTION_ADAPTER_SHA256 = 'b748ba43bb977213592681cfc40b0c8559ff381cca43b2b78731ff7edac4e1bc'
R3_05_EXECUTE_KEY = 't45-first-20261110-r3-real-execute-20261113-01'

def check(value, code):
    if not value:raise ValueError(code)

def canonical(path):
    p=Path(path)
    check(p.resolve()==p and not any(x.is_symlink() for x in [p,*p.parents]),'NONCANONICAL_OR_SYMLINK_REFUSED')
    return p

def ident(value):
    check(isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,70}',value),'UNIQUE_JOB_ID_REQUIRED')
    return value

def utc():return datetime.now(timezone.utc).isoformat()

def save(path,value,owner=None):
    p=canonical(path);tmp=p.with_suffix('.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');os.chmod(tmp,0o600 if owner is None else 0o644)
    if owner:os.chown(tmp,*owner)
    os.replace(tmp,p)

def config(allow_expired=False):
    check(os.geteuid()==0,'ROOT_DISPATCHER_REQUIRED')
    check(socket.gethostname()=='naijue-server','SERVER_IDENTITY_MISMATCH')
    check(CONFIG.stat().st_uid==0 and not CONFIG.is_symlink(),'ROOT_OWNED_GRANT_REQUIRED')
    cfg=json.loads(CONFIG.read_text())
    check(cfg.get('scope')=='ERP_EXISTING_TASKS_THROUGH_T51','EXPLICIT_SCOPE_GRANT_REQUIRED')
    check(cfg.get('humanAuthorization',{}).get('sourceChat')=='01a0f6f9-0e2f-7be0-b410-2001c6f81356','HUMAN_AUTHORITY_REQUIRED')
    if not allow_expired:
        check(not cfg.get('revoked') and time.time()<cfg['expiresAtEpoch'],'GRANT_REVOKED_OR_EXPIRED')
    return cfg

def owner(cfg):
    user=pwd.getpwnam(cfg['user']);return user.pw_uid,user.pw_gid

def status(cfg):
    if not cfg.get('revoked') and time.time()<cfg['expiresAtEpoch']:
        inherited_d0(cfg)
    return {'scope':cfg['scope'],'grantId':cfg['grantId'],'status':'CLOSED' if cfg.get('revoked') else ('READY' if time.time()<cfg['expiresAtEpoch'] else 'EXPIRED'),'expiresAtEpoch':cfg['expiresAtEpoch'],'allowedTasks':sorted(TASKS),'passwordStored':False,'permanentPasswordlessSudo':False,'gateConditionsRetained':True}

def gate_check(job):
    for gate in GATES.get(job['taskId'],[]):
        proof=job.get('gateEvidence',{}).get(gate,{})
        check(proof.get('decision') in PASS and isinstance(proof.get('sourcePath'),str) and proof['sourcePath'].startswith('/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/') and re.fullmatch(r'[a-f0-9]{64}',proof.get('sourceSha256','')),'REQUIRED_ACTUAL_GATE_EVIDENCE_MISSING')
    if job['taskId']=='T51':
        for task in ['T49','T50']:
            proof=job.get('taskEvidence',{}).get(task,{})
            check(proof.get('decision') in PASS and re.fullmatch(r'[a-f0-9]{64}',proof.get('sourceSha256','')),'FINAL_INPUT_AND_IMPORT_EVIDENCE_REQUIRED')
        check(job.get('businessCutoverConfirmed') is True,'BUSINESS_CUTOVER_FACT_REQUIRED')

D0_MANIFEST_SHA256 = '78c37ab3b354ea9a273648f2030a4f435f749a94d07c6341cea4befe5e5fe81e'

def load_d0():
    basis=canonical(PREDECESSOR_PUBLIC)
    check(basis.stat().st_uid==0 and basis.stat().st_mode&0o022==0,'ROOT_D0_DIRECTORY_REQUIRED')
    manifest=canonical(basis/'d0_r48_manifest.json')
    check(manifest.stat().st_uid==0 and manifest.stat().st_mode&0o022==0 and manifest.stat().st_size<131072,'ROOT_D0_MANIFEST_REQUIRED')
    raw=manifest.read_bytes();check(hashlib.sha256(raw).hexdigest()==D0_MANIFEST_SHA256,'PINNED_D0_MANIFEST_REQUIRED')
    rows=json.loads(raw)['files']
    check(set(rows)=={'d0_r48_window.py','d0_r48_basis.json','d0_r48_probe.mjs','t45_r48_d0_arm_job.py','t45_r48_d0_activate_job.py','t45_r48_d0_close_job.py'},'EXACT_FIXED_D0_MODULE_SET')
    for name,h in rows.items():
        path=canonical(basis/name);check(path.is_file() and path.stat().st_uid==0 and path.stat().st_mode&0o022==0 and path.stat().st_size<=1048576 and hashlib.sha256(path.read_bytes()).hexdigest()==h,'ROOT_PINNED_D0_MODULE_REQUIRED')
    from importlib.util import module_from_spec, spec_from_file_location
    path=basis/'d0_r48_window.py'
    module=module_from_spec(spec_from_file_location('d0_r48_window',path))
    raw=path.read_bytes()
    check(hashlib.sha256(raw).hexdigest()==rows[path.name],'ROOT_PINNED_D0_MODULE_REQUIRED')
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module

def predecessor(cfg):
    path=canonical(PREDECESSOR_PUBLIC/'grant.json')
    exe=canonical(PREDECESSOR_PUBLIC/'admin_exec.py')
    check(all(p.is_file() and p.stat().st_uid==0 and not p.stat().st_mode&0o022 for p in (path,exe))
          and hashlib.sha256(exe.read_bytes()).hexdigest()==PREDECESSOR_SHA,
          'EXACT_PREDECESSOR_DISPATCHER_REQUIRED')
    prior=json.loads(path.read_bytes())
    check(prior.get('grantId')==cfg.get('priorGrant')==PREDECESSOR and prior.get('scope')==cfg['scope']
          and prior.get('expiresAtEpoch')==cfg.get('predecessorExpiresAtEpoch')==1794419556.056917
          and prior['expiresAtEpoch']<time.time(),'ORIGINAL_EXPIRED_PREDECESSOR_REQUIRED')
    return prior

def inherited_d0(cfg):
    helper=load_d0()
    prior=predecessor(cfg)
    controller=helper.context(prior,PREDECESSOR_PUBLIC,owner(prior))
    state=controller.s.load()
    check(not state or helper.lifecycle_complete(state),'D0_LIFECYCLE_ACTIVE_OR_RECOVERY_UNRESOLVED_NO_OTHER_JOB')
    return prior,controller.p

def d0_admit(cfg,job,buffers=None):
    prior,policy=inherited_d0(cfg)
    key=ident(job['jobId'])
    check(key not in policy['jobs'].values() and job['script'] not in
          {'t45_r48_d0_arm_job.py','t45_r48_d0_activate_job.py','t45_r48_d0_close_job.py'},
          'ORIGINAL_D0_KEYS_RETAINED_IN_PREDECESSOR_NO_REPLAY')
    control=Path(prior['control'])
    check(not any(os.path.lexists(p) for p in (control/'results'/(key+'.json'),control/'requests'/(key+'.json'),
          control/'requests'/(key+'.tmp'),control/'jobs'/key,Path(prior['private'])/'jobs'/key)),
          'ORIGINAL_PREDECESSOR_KEY_PRESENT_NO_REPLAY')

def r3_failed19_recovery(core,hold,cfg):
    if R3_READONLY_RECOVERY_POLICY_SHA256 is None:
        return hold
    from types import ModuleType
    path=canonical(PUBLIC/'r3_failed19_readonly.py')
    check(PUBLIC.lstat().st_uid==0 and not PUBLIC.lstat().st_mode&0o022
          and path.is_file() and path.lstat().st_uid==0 and not path.lstat().st_mode&0o022
          and path.lstat().st_size<=131072,'R3_CONTINUITY_READONLY_PROTECTED_SOURCE_REQUIRED')
    raw=path.read_bytes()
    check(hashlib.sha256(raw).hexdigest()==R3_READONLY_RECOVERY_SOURCE_SHA256,
          'R3_CONTINUITY_READONLY_SOURCE_DIFFERS')
    module=ModuleType('fixed_r3_failed19_readonly')
    module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.ReadOnlyRecovery(core,hold,cfg,R3_READONLY_RECOVERY_POLICY_SHA256)

def r3_original02_absent20(readonly,cfg):
    if R3_ORIGINAL02_ABSENT_POLICY_SHA256 is None:
        return readonly
    from types import ModuleType
    path=canonical(PUBLIC/'r3_direct26_batched.py')
    check(PUBLIC.lstat().st_uid==0 and not PUBLIC.lstat().st_mode&0o022
          and path.is_file() and path.lstat().st_uid==0 and not path.lstat().st_mode&0o022
          and path.lstat().st_size<=131072,'R3_CONTINUITY_ABSENT20_PROTECTED_SOURCE_REQUIRED')
    raw=path.read_bytes()
    check(hashlib.sha256(raw).hexdigest()==R3_ORIGINAL02_ABSENT_SOURCE_SHA256,
          'R3_CONTINUITY_ABSENT20_SOURCE_DIFFERS')
    module=ModuleType('fixed_r3_original02_absent20')
    module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module.Original02AbsentContinuation(readonly,cfg,R3_ORIGINAL02_ABSENT_POLICY_SHA256)

def r3_continuity(cfg):
    root = Path(cfg['private'])/'r3-05-write-continuity'
    if R3_CONTINUITY_POLICY_SHA256 is None:
        check(not os.path.lexists(root),'R3_CONTINUITY_ROOT_POLICY_NOT_REGISTERED')
        return None,None
    from types import ModuleType
    path = canonical(PUBLIC/'r3_write_continuity.py')
    check(PUBLIC.lstat().st_uid==0 and not PUBLIC.lstat().st_mode&0o022
          and path.is_file() and path.lstat().st_uid==0 and not path.lstat().st_mode&0o022
          and path.lstat().st_size<=131072,'R3_CONTINUITY_PROTECTED_SOURCE_REQUIRED')
    raw = path.read_bytes()
    check(hashlib.sha256(raw).hexdigest()==R3_CONTINUITY_SOURCE_SHA256,'R3_CONTINUITY_SOURCE_DIFFERS')
    module = ModuleType('fixed_r3_write_continuity')
    module.__file__ = str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    check(root==module.FIXED_ROOT,'R3_CONTINUITY_ACTIVE_POLICY_ROOT_DIFFERS')
    return module,r3_original02_absent20(r3_failed19_recovery(module,module.Hold(root,cfg,R3_CONTINUITY_POLICY_SHA256),cfg),cfg)

def smoke_a_continuation(core, prior, cfg, job_id):
    if job_id not in R3_SMOKE_A_KEYS or R3_SMOKE_A_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_smoke_a_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_SMOKE_A_MODULE_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_SMOKE_A_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_SMOKE_A_POLICY_SHA256)

def sql39_compile_continuation(core, prior, cfg, job_id):
    if job_id not in R3_COMPILE_KEYS or R3_COMPILE_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_sql39_compile_full_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_COMPILE_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_COMPILE_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_COMPILE_POLICY_SHA256)

def sql39_compile_02_continuation(core, prior, cfg, job_id):
    if job_id not in R3_COMPILE_02_KEYS or R3_COMPILE_02_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_sql39_compile_full_02_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_COMPILE_02_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_COMPILE_02_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_COMPILE_02_POLICY_SHA256)

def sql39_compile_03_continuation(core, prior, cfg, job_id):
    if job_id not in R3_COMPILE_03_KEYS or R3_COMPILE_03_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_sql39_compile_full_03_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_COMPILE_03_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_COMPILE_03_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_COMPILE_03_POLICY_SHA256)

def sql39_compile_04_continuation(core, prior, cfg, job_id):
    if job_id not in R3_COMPILE_04_KEYS or R3_COMPILE_04_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_sql39_compile_full_04_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_COMPILE_04_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_COMPILE_04_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_COMPILE_04_POLICY_SHA256)

def prefix155_measure_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PREFIX155_KEYS or R3_PREFIX155_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_prefix155_measure_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PREFIX155_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PREFIX155_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PREFIX155_POLICY_SHA256)

def prefix155114_measure_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PREFIX155114_KEYS or R3_PREFIX155114_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_prefix155114_measure_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PREFIX155114_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PREFIX155114_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PREFIX155114_POLICY_SHA256)

def party_set_proof_measure_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PARTY_SET_PROOF_KEYS or R3_PARTY_SET_PROOF_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_party_set_proof_measure_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PARTY_SET_PROOF_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PARTY_SET_PROOF_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PARTY_SET_PROOF_POLICY_SHA256)

def party_set_proof_measure_02_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PARTY_SET_PROOF_02_KEYS or R3_PARTY_SET_PROOF_02_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_party_set_proof_measure_02_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PARTY_SET_PROOF_02_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PARTY_SET_PROOF_02_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PARTY_SET_PROOF_02_POLICY_SHA256)

def party_operation_locator_measure_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PARTY_OPERATION_LOCATOR_KEYS or R3_PARTY_OPERATION_LOCATOR_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_party_operation_locator_measure_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PARTY_OPERATION_LOCATOR_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PARTY_OPERATION_LOCATOR_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PARTY_OPERATION_LOCATOR_POLICY_SHA256)

def party_single_projection_measure_continuation(core, prior, cfg, job_id):
    if job_id not in R3_PARTY_SINGLE_PROJECTION_KEYS or R3_PARTY_SINGLE_PROJECTION_POLICY_SHA256 is None:
        return prior
    from types import ModuleType
    smoke_path=canonical(PUBLIC/'r3_party_single_projection_measure_hold_admission.py')
    smoke_raw=core.read(smoke_path)
    check(hashlib.sha256(smoke_raw).hexdigest()==R3_PARTY_SINGLE_PROJECTION_ADAPTER_SHA256,'R3_CONTINUITY_SMOKE_A_MODULE_DIFFERS')
    adapter=ModuleType('fixed_r3_smoke_a_hold_admission')
    adapter.__file__=str(smoke_path)
    exec(compile(smoke_raw,str(smoke_path),'exec'),adapter.__dict__)
    check(tuple(adapter.KEYS.values())==R3_PARTY_SINGLE_PROJECTION_KEYS,'R3_CONTINUITY_SMOKE_A_KEYS_DIFFER')
    return adapter.SmokeAdmission(core,prior,cfg,R3_PARTY_SINGLE_PROJECTION_POLICY_SHA256)

def freeze(cfg,job_id):
    c=canonical(Path(cfg['control']));p=canonical(Path(cfg['private']))
    request=canonical(c/'requests'/(ident(job_id)+'.json'))
    check(request.stat().st_size<131072,'BOUNDED_REQUEST_REQUIRED');job=json.loads(request.read_text())
    check(job.get('jobId')==job_id and job.get('taskId') in TASKS and job.get('grantId')==cfg['grantId'],'TASK_OR_GRANT_SCOPE_REFUSED')
    check(job.get('scope')==cfg['scope'],'EFFECTIVE_SCOPE_MUST_BE_EXPLICIT')
    gate_check(job)
    timeout=job.get('timeoutSeconds',3600);check(type(timeout) is int and 1<=timeout<=10800,'BOUNDED_PHASE_REQUIRED')
    check(cfg['expiresAtEpoch']-time.time()>timeout+60,'INSUFFICIENT_GRANT_LIFETIME')
    source=canonical(c/'jobs'/job_id/'bundle');raw=canonical(source/'bundle-manifest.json').read_bytes()
    check(len(raw)<131072 and hashlib.sha256(raw).hexdigest()==job.get('manifestSha256'),'BUNDLE_MANIFEST_BINDING_REFUSED')
    manifest=json.loads(raw);rows=manifest.get('files',[])
    check(manifest.get('taskId')==job['taskId'] and manifest.get('jobId')==job_id and 1<=len(rows)<=128,'MANIFEST_SCOPE_OR_COUNT_REFUSED')
    private=p/'jobs'/job_id;check(not private.exists(),'JOB_ALREADY_PRESENT_NO_REPLAY')
    buffers={};total=0
    for row in rows:
        name=row.get('name','');check(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,120}',name) and name not in buffers and Path(name).suffix in {'.py','.mjs','.js','.json','.sh','.sql','.yaml','.yml','.md'} and not re.search(r'(^|[_.-])(private|secret|credentials?|password|token|cookie)([_.-]|$)',name,re.I),'BUNDLE_MEMBER_REFUSED')
        f=canonical(source/name);check(f.is_file() and f.stat().st_size<=4*1024*1024,'BOUNDED_REGULAR_FILE_REQUIRED')
        data=f.read_bytes();total+=len(data);check(total<=32*1024*1024 and len(data)==row.get('bytes') and hashlib.sha256(data).hexdigest()==row.get('sha256'),'FILE_DIGEST_OR_TOTAL_SIZE_REFUSED');buffers[name]=data
    script=job.get('script');check(script in buffers and Path(script).suffix in {'.py','.sh','.mjs','.js'},'EXECUTABLE_PHASE_REQUIRED')
    args=job.get('args',[]);check(isinstance(args,list) and len(args)<=64 and all(isinstance(a,str) and len(a)<=32768 and '\x00' not in a for a in args),'PHASE_ARGUMENTS_REFUSED')
    d0_admit(cfg,job,buffers)
    private.mkdir(mode=0o700);(private/'bundle').mkdir(mode=0o700);(private/'results').mkdir(mode=0o700)
    for name,data in buffers.items():(private/'bundle'/name).write_bytes(data);os.chmod(private/'bundle'/name,0o600)
    (private/'bundle/bundle-manifest.json').write_bytes(raw)
    save(private/'request.json',job);save(private/'manifest.json',manifest)
    return private,job

def redacted(value):
    if isinstance(value,dict):return {k:('[REDACTED]' if re.search(r'password|secret|private.?key|authorization|cookie|csrf|(^|_)token($|_)|connection.?string',k,re.I) else redacted(v)) for k,v in value.items()}
    if isinstance(value,list):return [redacted(x) for x in value]
    if isinstance(value,str) and (re.search(r'://[^\s/:]+:[^\s/@]+@|-----BEGIN .*PRIVATE KEY-----|^Bearer ',value)):return '[REDACTED]'
    return value

def export(cfg,job_id,private):
    dest=Path(cfg['control'])/'jobs'/job_id/'results';names=[]
    for p in sorted((private/'results').iterdir()):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.json',p.name) or re.search('private|secret|password|token|cookie',p.name,re.I):continue
        canonical(p);check(p.is_file() and p.stat().st_size<=16*1024*1024,'EXPORT_SIZE_REFUSED')
        try:value=json.loads(p.read_text())
        except ValueError:continue
        save(dest/p.name,redacted(value),owner(cfg));names.append(p.name)
    return names

def execute(cfg,job_id):
    def interrupted(_signum,_frame):raise SystemExit('AUTHORIZED_JOB_INTERRUPTED')
    for event in [signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:signal.signal(event,interrupted)
    private=Path(cfg['private'])/'jobs'/ident(job_id)
    check(private.is_dir(),'FROZEN_JOB_REQUIRED')
    with (private/'run.lock').open('a+') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ValueError('JOB_RUNNING_NO_DUPLICATE')
        receipt=Path(cfg['control'])/'results'/(job_id+'.json')
        prior=json.loads(receipt.read_text()) if receipt.exists() else {}
        check(prior.get('status') in {'STARTING','QUEUED'},'JOB_ALREADY_EXECUTED_OR_UNKNOWN_NO_REPLAY')
        lock_path=Path(predecessor(cfg)['private'])/'execution.lock'
        with lock_path.open('a+') as serial:
            fcntl.flock(serial,fcntl.LOCK_EX);config();job=json.loads((private/'request.json').read_text());gate_check(job)
            check(cfg['expiresAtEpoch']-time.time()>job['timeoutSeconds']+30,'INSUFFICIENT_GRANT_LIFETIME')
            value={'jobId':job_id,'taskId':job['taskId'],'scope':cfg['scope'],'status':'RUNNING','unit':prior.get('unit'),'atUTC':utc(),'grantId':cfg['grantId'],'privateLogsExported':False,'businessAcceptanceClaimed':False}
            if job_id in R3_ORIGINAL02_ABSENT_KEYS:value['phaseStarted']=False
            save(receipt,value,owner(cfg));phase=private/'bundle'/job['script']
            interpreter={'py':'/usr/bin/python3','sh':'/bin/bash','mjs':'/usr/bin/node','js':'/usr/bin/node'}[phase.suffix[1:]]
            argv=[interpreter]+(['-s'] if phase.suffix=='.py' else [])+[str(phase)]+job['args']
            env=dict(os.environ,ERP_SHARED_JOB_DIR=str(private),ERP_SHARED_CONTROL_DIR=str(Path(cfg['control'])/'jobs'/job_id),ERP_SHARED_TASK_ID=job['taskId'])
            started=time.monotonic();child=None;phase_name=None
            try:
                try:
                    d0_admit(cfg,job,{job['script']:(private/'bundle'/job['script']).read_bytes()} if job['script'] in {'t45_r48_d0_arm_job.py','t45_r48_d0_activate_job.py','t45_r48_d0_close_job.py'} else None)
                except ValueError as error:
                    value.update(status='REFUSED_D0_INTERLOCK_BEFORE_PHASE',exitCode=2,errorCode=str(error),elapsedSeconds=time.monotonic()-started)
                    return
                try:
                    continuity,hold=r3_continuity(cfg)
                    if job['jobId'] in R3_SMOKE_A_KEYS:
                        hold=smoke_a_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_COMPILE_KEYS:
                        hold=sql39_compile_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_COMPILE_02_KEYS:
                        hold=sql39_compile_02_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_COMPILE_03_KEYS:
                        hold=sql39_compile_03_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_COMPILE_04_KEYS:
                        hold=sql39_compile_04_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PREFIX155_KEYS:
                        hold=prefix155_measure_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PREFIX155114_KEYS:
                        hold=prefix155114_measure_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PARTY_SET_PROOF_KEYS:
                        hold=party_set_proof_measure_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PARTY_SET_PROOF_02_KEYS:
                        hold=party_set_proof_measure_02_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PARTY_OPERATION_LOCATOR_KEYS:
                        hold=party_operation_locator_measure_continuation(continuity,hold,cfg,job['jobId'])
                    elif job['jobId'] in R3_PARTY_SINGLE_PROJECTION_KEYS:
                        hold=party_single_projection_measure_continuation(continuity,hold,cfg,job['jobId'])
                    if job['jobId']==R3_05_EXECUTE_KEY:
                        check(hold is not None and hold.jobs['writer']==R3_05_EXECUTE_KEY,
                              'R3_CONTINUITY_EXACT_WRITER_NOT_REGISTERED')
                    if hold is not None:
                        phase_name=hold.admit(job,private)
                except (OSError,ValueError,KeyError,TypeError) as error:
                    message=str(error)
                    safe=message if re.fullmatch(r'R3_CONTINUITY_[A-Z0-9_]+',message) else 'R3_CONTINUITY_ORIGINAL_EVIDENCE_UNAVAILABLE'
                    value.update(status='REFUSED_R3_CONTINUITY_BEFORE_PHASE',exitCode=2,errorCode=safe,elapsedSeconds=time.monotonic()-started)
                    return
                with (private/'phase.private.log').open('wb') as log:
                    child=subprocess.Popen(argv,cwd=private/'bundle',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
                    if job_id in R3_ORIGINAL02_ABSENT_KEYS:value['phaseStarted']=True
                    try:code=child.wait(job['timeoutSeconds'])
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid,signal.SIGTERM)
                        try:child.wait(20)
                        except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait(10)
                        code=124;value['errorCode']='PHASE_TIMEOUT_UNKNOWN_OUTCOME_NO_REPLAY'
                value.update(status='COMPLETED' if code==0 else 'FAILED',exitCode=code,elapsedSeconds=time.monotonic()-started)
            finally:
                if value.get('status')=='RUNNING':value.update(status='INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY',exitCode=None)
                if child is not None and child.poll() is None:
                    try:os.killpg(child.pid,signal.SIGTERM);child.wait(20)
                    except ProcessLookupError:pass
                    except subprocess.TimeoutExpired:
                        try:os.killpg(child.pid,signal.SIGKILL);child.wait(10)
                        except ProcessLookupError:pass
                try:value['exports']=export(cfg,job_id,private)
                except Exception:value['exportStatus']='TYPED_EXPORT_UNAVAILABLE'
                value['finishedAtUTC']=utc()
                if phase_name is None:
                    if job_id in R3_ORIGINAL02_ABSENT_KEYS:
                        check(value.get('phaseStarted') is False and not os.path.lexists(private/'r3-outer-terminal.json'),'R3_CONTINUITY_ABSENT20_PRE_CHILD_TERMINAL_DIFFERS')
                        save(private/'r3-outer-terminal.json',value)
                    save(receipt,value,owner(cfg))
                else:
                    continuity.publish_terminal(private,receipt,value,owner(cfg))
                    if value['status']=='COMPLETED':
                        try:
                            hold.finish(phase_name)
                        except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as error:
                            message=str(error)
                            safe=message if re.fullmatch(r'R3_CONTINUITY_[A-Z0-9_]+',message) else 'R3_CONTINUITY_ORIGINAL_EVIDENCE_UNAVAILABLE'
                            continuity.write_once(private/'r3-continuity-failure.json',continuity.pack(
                                {'jobId':job_id,'phase':phase_name,'state':'HOLD_ORIGINAL_KEY_ONLY','errorCode':safe}))

def start(cfg,job_id):
    private,job=freeze(cfg,job_id);unit='naijue-erp-op-'+cfg['grantId'][:8]+'-'+hashlib.sha256(job_id.encode()).hexdigest()[:12]
    receipt=Path(cfg['control'])/'results'/(job_id+'.json');value={'jobId':job_id,'taskId':job['taskId'],'status':'STARTING','unit':unit,'atUTC':utc(),'grantId':cfg['grantId'],'scope':cfg['scope']}
    save(receipt,value,owner(cfg))
    command=['/usr/bin/systemd-run','--quiet','--collect','--unit='+unit,'--property=RuntimeMaxSec='+str(job['timeoutSeconds']+90),'--property=TimeoutStopSec=30','--property=KillMode=mixed','/usr/bin/python3','-s',str(PUBLIC/'admin_exec.py'),'--action','execute','--job-id',job_id]
    result=subprocess.run(command,capture_output=True)
    if result.returncode:value.update(status='START_FAILED_NO_REPLAY',exitCode=result.returncode);save(receipt,value,owner(cfg));raise ValueError('TRANSIENT_JOB_START_FAILED')
    return {'jobId':job_id,'status':'QUEUED','unit':unit,'autoRetry':False}

def revoke(cfg,force=False):
    inherited_d0(cfg)
    receipts=Path(cfg['control'])/'results';active=[]
    for p in receipts.glob('*.json'):
        value=json.loads(p.read_text())
        if value.get('status') in {'RUNNING','STARTING','QUEUED'} and value.get('unit'):active.append(value)
    check(not active or force,'ACTIVE_JOB_REQUIRES_EXPLICIT_STOP')
    for value in active:
        subprocess.run(['/usr/bin/systemctl','stop',value['unit']],capture_output=True)
        value.update(status='STOPPED_UNKNOWN_OUTCOME_NO_REPLAY',stoppedAtUTC=utc());save(receipts/(value['jobId']+'.json'),value,owner(cfg))
    auth=canonical(Path(cfg['authorizedKeys']));data=auth.read_text() if auth.exists() else ''
    lines=data.splitlines(keepends=True);filtered=[line for line in lines if line.strip()!=cfg['keyLine'].strip()]
    if filtered!=lines:
        tmp=auth.with_name(auth.name+'.erp-grant-'+cfg['grantId']+'.tmp');tmp.write_text(''.join(filtered));os.chmod(tmp,0o600);os.chown(tmp,*owner(cfg));os.replace(tmp,auth)
    fragment=canonical(Path(cfg['sudoersFile']))
    if fragment.exists():
        check(hashlib.sha256(fragment.read_bytes()).hexdigest()==cfg['sudoersSha256'],'CHANGED_SUDOERS_FRAGMENT_RETAINED')
        fragment.unlink()
    cfg.update(revoked=True,revokedAtUTC=utc());save(CONFIG,cfg)
    save(Path(cfg['control'])/'results/session.json',status(cfg),owner(cfg))
    return {'status':'REVOKED','grantId':cfg['grantId'],'onlyOwnTemporaryKeyAndFragmentRemoved':True,'otherKeysPreserved':True,'productionRollbackAttempted':False}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--action',choices=['status','start','execute','revoke','d0-watch','d0-cutoff'],required=True);parser.add_argument('--job-id');parser.add_argument('--force',action='store_true');args=parser.parse_args()
    cfg=config(allow_expired=args.action in {'status','revoke','d0-watch','d0-cutoff'})
    if args.action=='status':value=status(cfg)
    elif args.action=='start':value=start(cfg,ident(args.job_id))
    elif args.action=='execute':execute(cfg,ident(args.job_id));value={'jobId':args.job_id,'executionEnded':True}
    elif args.action in {'d0-watch','d0-cutoff'}:
        raise ValueError('ORIGINAL_D0_INTERNAL_ACTION_REMAINS_WITH_PREDECESSOR')
    else:value=revoke(cfg,args.force)
    print(json.dumps(value,ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except ValueError as error:raise SystemExit(str(error))
