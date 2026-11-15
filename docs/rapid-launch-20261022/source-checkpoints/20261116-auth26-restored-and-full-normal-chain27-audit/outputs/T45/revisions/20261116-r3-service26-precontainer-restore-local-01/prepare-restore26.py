from pathlib import Path
import ast,difflib,hashlib,json,shutil
H=Path(__file__).resolve().parent;R=H.parent;P=R/'20261116-r3-service26-pin-closure-local-01';w=json.loads((P/'PHASES26.UNISSUED.json').read_bytes());snap=json.loads((P/'START26-STAGING-SHAPE.json').read_bytes());d=H/'RESTORE-PRECONTAINER-CANDIDATE-01/bundle';shutil.copytree(w['phaseDirectories']['restore'],d);p=d/'ordinary05_roles_job.py';old=p.read_text()
bootmeta={name:{k:row[k] for k in ('uid','gid','mode','bytes','directory')} for name,row in snap['bootTree'].items()}
bootpins={name:row['sha256'] for name,row in snap['bootTree'].items() if 'sha256' in row}
sourcepins=w['jobs']['start']['bundlePins']
fn='''def verify_exact_failed26_before_container(ops, control, a):
    need(a['service'] is None and a['stopRequestKey']==CURRENT_KEY
         and a['writerTerminalSha256'] is None and a['policySha256'] is None and a['stopCleanupSha256'] is None
         and a['stopTerminalSha256']=='853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39'
         and a['stopResultSha256']=='5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
         'ORDINARY26_EXACT_BEFORE_CONTAINER_SCOPE_REQUIRED')
    require_failed19_history(ops,control)
    job=WORKER/CURRENT_KEY
    terminal=ops.read_file(job/'r3-outer-terminal.json',65536,True)
    pub=ops.read_file(control/'results'/(CURRENT_KEY+'.json'),65536,False,False);t=ops.strict(terminal)
    need(sha(terminal)==a['stopTerminalSha256'] and terminal==pub
         and (t['jobId'],t['taskId'],t['grantId'],t['status'],t['exitCode'])==
         (CURRENT_KEY,'T45','b16447fbc81f4d64','FAILED',2),'ORDINARY26_FAILED_START_TERMINAL_DIFFERS')
    raw=ops.read_file(job/'results/normal-service-result.json',65536,True)
    pub=ops.read_file(control/'jobs'/CURRENT_KEY/'results/normal-service-result.json',65536,False,False)
    need(sha(raw)==a['stopResultSha256'] and sha(pub)=='ff2e88f0b8cb3ad04ce5c4c06e07818d8b7c0456b8507b43bf81f529c34155d1'
         and ops.strict(raw)==ops.strict(pub)=={'requestKey':CURRENT_KEY,'status':'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY',
             'safeCode':'FileExistsError','automaticRetry':False},'ORDINARY26_FAILED_START_RESULT_DIFFERS')
    need(sha(ops.read_file(job/'manifest.json',65536,True))=='2dd5d63d80ac862daf6d5854ac095afe6492c7fb6670829ec729f758a75da7ee'
         and sha(ops.read_file(job/'bundle/service-start-authorization.json',65536,True))==
             '5dbf8567d85ac447eada6ab163209a5924484acbd4ee7e282de02121150aa675','ORDINARY26_FAILED_START_MANIFEST_OR_AUTHORITY_DIFFERS')
    request=ops.strict(ops.read_file(control/'requests'/(CURRENT_KEY+'.json'),65536,False,False))
    need(request['jobId']==CURRENT_KEY and request['taskId']=='T45' and request['grantId']=='b16447fbc81f4d64'
         and request['script']=='normal_service05_after08.py'
         and request['args']==['5dbf8567d85ac447eada6ab163209a5924484acbd4ee7e282de02121150aa675']
         and request['manifestSha256']=='20d18a7cae9f51ed1ee0b189a25f4196c8d7a5598655bfd05cb1261db53c3830',
         'ORDINARY26_FAILED_START_REQUEST_DIFFERS')
    sourcepins=SOURCE_PINS_LITERAL
    for name,pin in sourcepins.items():
        need(sha(ops.read_file(job/'bundle'/name,262144,True))==pin,'ORDINARY26_FAILED_START_SOURCE_DIFFERS')
    boot=ROOT/'state/native-services'/CURRENT_KEY;st=boot.lstat()
    need(boot.resolve()==boot and stat.S_ISDIR(st.st_mode)
         and (st.st_dev,st.st_ino,st.st_uid,st.st_gid,stat.S_IMODE(st.st_mode))==(66304,13664344,0,0,0o700),
         'ORDINARY26_PARTIAL_BOOT_IDENTITY_DIFFERS')
    expected=BOOT_META_LITERAL
    pins=BOOT_PINS_LITERAL
    need({p.name for p in boot.iterdir()}=={name for name in expected if '/' not in name},
         'ORDINARY26_PARTIAL_BOOT_NAMES_DIFFER')
    for name,row in expected.items():
        path=boot/name;st=path.lstat()
        need(path.resolve()==path and not path.is_symlink() and st.st_uid==row['uid'] and st.st_gid==row['gid']
             and stat.S_IMODE(st.st_mode)==row['mode'] and stat.S_ISDIR(st.st_mode)==row['directory']
             and (row['directory'] or stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_size==row['bytes']),
             'ORDINARY26_PARTIAL_BOOT_METADATA_DIFFERS')
        if row['directory']:
            need({p.name for p in path.iterdir()}=={n.split('/')[1] for n in expected if n.startswith(name+'/')},
                 'ORDINARY26_PARTIAL_BOOT_CHILDREN_DIFFER')
        elif name in pins:
            # No reads of the five authority bodies or credential material.
            need(sha(ops.read_file(path,262144,False,True))==pins[name],'ORDINARY26_PARTIAL_BOOT_SOURCE_DIFFERS')
    need(not any(present(p) for p in (job/'results/normal-service-intent.json',job/'results/normal-service-incomplete.json',
         boot/'carrier-birth.json',boot/'cleanup.json',boot/'retained-ack.json',
         ROOT/'authority/fresh35-current-production-service-v2-service-26.json',
         ROOT/'state/fresh35-first-production-20261110-r3/data/postmaster.pid')),
         'ORDINARY26_BEFORE_CONTAINER_CREATION_EVIDENCE_PRESENT')
    need(not command(['docker','ps','-a','--no-trunc','--filter','label=t45.operation='+CURRENT_KEY,'--format','{{.ID}}'],5).strip()
         and not command(['docker','ps','-a','--no-trunc','--filter','name=^/'+CURRENT_NAME+'$','--format','{{.ID}}'],5).strip()
         and not command(['/usr/bin/ss','-H','-ltn','sport = :56791'],5).strip(),'ORDINARY26_CONTAINER_OR_PORT_PRESENT')
    own='naijue-erp-op-b16447fb-'+sha(a['requestKey'].encode())[:12]+'.service'
    rows=command(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating',
         'naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],5).decode().splitlines()
    need(all(line.split()[0]==own for line in rows if line.strip()),'ORDINARY26_OTHER_OPERATION_ACTIVE')


'''.replace('SOURCE_PINS_LITERAL',repr(sourcepins)).replace('BOOT_META_LITERAL',repr(bootmeta)).replace('BOOT_PINS_LITERAL',repr(bootpins))
a='def verify_failed_start_closed(ops, control, a):\n';assert old.count(a)==1
new=old.replace(a,fn+a+"    if a['stopCleanupSha256'] is None:\n        verify_exact_failed26_before_container(ops,control,a)\n        return\n");ast.parse(new);p.write_text(new);sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest();pack=lambda x:(json.dumps(x,sort_keys=True,indent=2)+'\n').encode()
w['phaseDirectories']['restore']=str(d);w['jobs']['restore']['bundlePins']={p.name:sha(p) for p in sorted(d.iterdir()) if p.is_file()};w['status']='LOCAL_EXACT_FAILED26_PRECONTAINER_RESTORE_ONLY_UNISSUED';(H/'PHASES-RESTORE26.UNISSUED.json').write_bytes(pack(w));(H/'RESTORE26.diff').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='registered26/ordinary05_roles_job.py',tofile='exact-before-container26/ordinary05_roles_job.py')))
report={'state':w['status'],'sourceSha256':sha(p),'rulesSha256':sha(H/'PHASES-RESTORE26.UNISSUED.json'),'diffSha256':sha(H/'RESTORE26.diff'),'rolesLeafSha256':sha(d/'ordinary05_roles.py'),'rolesAuthorityUnchanged':'ded926b105af374beec177489926c49a0fe3778565516926a63fb317f3037ee6','roleDeadlinesExtended':False,'otherSixPhaseRulesChanged':False,'bootPreserved':True,'noFakeCleanup':True,'authorityBodiesRead':False,'serverActions':0,'pythonSyntaxExitCode':0};(H/'READY-RESTORE26.json').write_bytes(pack(report));print(json.dumps(report))
